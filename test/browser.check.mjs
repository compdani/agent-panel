// Run with PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node test/browser.check.mjs.
// The browser dependency is deliberately external to this zero-dependency package.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const appRoot = process.env.EVENT_POCKET_ROOT;
const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
// BROWSER=chromium (default), firefox or webkit.
const engine = process.env.BROWSER || 'chromium';
const browser = await (playwright[engine] || playwright.default[engine]).launch();
try {
  for (const tag of (appRoot ? ['event-agent-panel', 'event-agent-page'] : ['agent-panel', 'agent-page'])) {
    const page = await browser.newPage();
    await page.route('http://panel.test/**', async route => {
      const file = new URL(route.request().url()).pathname.slice(1);
      if (!file) return route.fulfill({ contentType: 'text/html', body: `<script type="importmap">{"imports":{"agent-panel/element":"/agent-panel.js","agent-panel/page-element":"/agent-page.js","marked":"/app/marked.js"}}</script><body></body>` });
      const appFiles = appRoot && {
        'app/agentElements.js': join(appRoot, 'app/lib/agentElements.js'),
        'app/marked.js': join(appRoot, 'node_modules/marked/lib/marked.esm.js'),
        'app/vue.js': join(appRoot, 'node_modules/vue/dist/vue.esm-browser.js'),
      };
      if (appFiles?.[file]) return route.fulfill({ contentType: 'text/javascript', body: await readFile(appFiles[file], 'utf8') });
      await route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL(`../${file}`, import.meta.url), 'utf8') });
    });
    await page.goto('http://panel.test/');
    await page.evaluate(async tag => {
      const appMode = tag.startsWith('event-');
      await import(appMode ? '/app/agentElements.js' : tag === 'agent-panel' ? '/index.js' : '/page.js');
      const assert = (value, label) => { if (!value) throw Error(label); };
      assert(!customElements.get(appMode ? 'agent-panel' : tag === 'agent-panel' ? 'agent-page' : 'agent-panel'), 'entry point isolation');
      let panel;
      if (appMode) {
        const { createApp, h, nextTick } = await import('/app/vue.js');
        const mount = document.createElement('div');
        document.body.append(mount);
        createApp({ render: () => h(tag, { heading: 'Integration check', entries: [
          { id: 'reply', type: 'text', role: 'assistant', content: '**Hello** [link](https://example.com)' },
          { id: 'proposal', type: 'proposal', toolId: 'tool-1', title: 'Apply edit', status: 'pending' },
        ], onAgentAction: e => { window.lastAction = e.detail; } }) }).mount(mount);
        await nextTick();
        panel = mount.querySelector(tag);
        await nextTick();
        assert(panel.shadowRoot.querySelector('.message strong')?.textContent === 'Hello', 'app markdown renderer');
        panel.shadowRoot.querySelector('.proposal .btn--primary').click();
        assert(window.lastAction?.action === 'approve', 'Vue receives subclass action event');
        if (tag === 'event-agent-page') {
          panel.conversations = [{ id: 'chat-1', title: 'Existing conversation' }];
          await nextTick();
          assert(panel.shadowRoot.querySelector('[part=conversation]'), 'page sidebar');
        }
      } else {
        panel = document.createElement(tag);
        document.body.append(panel);
      }
      const tick = () => new Promise(resolve => queueMicrotask(resolve));
      panel.entries = [{ id: 'asset-only', type: 'text', role: 'user', content: '', assets: [
        { type: 'asset', id: 'pic', label: 'Uploaded picture', mimeType: 'image/png', url: 'https://example.com/pic.png' },
        { type: 'asset', id: 'unsafe', label: 'Unsafe', mimeType: 'image/png', url: 'javascript:alert(1)' },
      ] }];
      await tick();
      assert(panel.shadowRoot.querySelector('[data-reference="asset:pic"] img')?.getAttribute('src') === 'https://example.com/pic.png', 'asset-only transcript with preview');
      assert(!panel.shadowRoot.querySelector('[data-reference="asset:unsafe"] img'), 'unsafe asset preview rejected');
      let opened;
      panel.addEventListener('agent-reference-open', e => { opened = e.detail.reference; }, { once: true });
      panel.shadowRoot.querySelector('[data-reference="asset:pic"] button').click();
      assert(opened.id === 'pic', 'asset open event');
      assert(panel.addFiles([new File(['doc'], 'report.docx')]).added.length === 1, 'Word document upload');
      panel.clearAttachments();
      panel.entries = [];

      const add = () => panel.addFiles([new File(['x'], 'x.txt', { type: 'text/plain' })]).added[0];
      let attachment = add();
      assert(!panel.submit(), 'legacy blank rejected');
      panel.setAttribute('allow-empty-text', '');
      await tick();
      assert(!panel.shadowRoot.querySelector('[part=send]').disabled, 'files enable send');
      let detail;
      panel.addEventListener('agent-submit', e => { detail = e.detail; }, { once: true });
      assert(panel.submit(), 'file-only accepted');
      assert(detail.text === '' && detail.fromDraft && detail.attachments.length === 1, 'submit detail');
      assert(!panel.attachments.length, 'files cleared');
      assert(!panel.submit() && !panel.submit(''), 'truly empty rejected');
      panel.references = [{ type: 'record', id: 1 }];
      assert(panel.submit(), 'reference-only accepted');
      panel.draft = 'keep me';
      const cancel = e => e.preventDefault();
      panel.addEventListener('agent-submit', cancel);
      assert(!panel.submit() && panel.draft === 'keep me', 'cancel preserves composer');
      panel.removeEventListener('agent-submit', cancel);
      panel.addEventListener('agent-submit', e => { detail = e.detail; }, { once: true });
      assert(panel.submit('suggestion') && !detail.fromDraft && panel.draft === 'keep me', 'explicit keeps draft');
      attachment = add();
      panel.setAttachmentState(attachment.id, { busy: true });
      await tick();
      let chip = panel.shadowRoot.querySelector('[data-attachment-id]');
      assert(chip.dataset.state === 'busy' && chip.querySelector('button').disabled && chip.querySelector('.spinner'), 'busy chip');
      assert(panel.attachments[0].state.busy, 'public state');
      panel.setAttachmentState(attachment.id, { error: 'Upload failed' });
      await tick();
      chip = panel.shadowRoot.querySelector('[data-attachment-id]');
      assert(chip.classList.contains('chip--error') && chip.title.includes('Upload failed') && !chip.querySelector('button').disabled, 'error chip');
      panel.setAttachmentState(attachment.id, null);
      assert(!panel.attachments[0].state, 'clear state');
      panel.openMention();
      panel.clearComposer({ attachments: false });
      assert(panel.draft === '' && panel.attachments.length === 1 && !panel.mention.open, 'selective cleanup');
      panel.setAttribute('sticky-attachments', '');
      panel.draft = 'send';
      assert(panel.submit() && panel.attachments.length === 1, 'sticky honored');
      panel.running = true;
      assert(!panel.submit('blocked'), 'running blocks send');
      panel.running = false;
      panel.disabled = true;
      assert(!panel.submit('blocked'), 'disabled blocks send');
      panel.disabled = false;
      panel.clearAttachments();
      assert(panel._attachmentStates.size === 0, 'state map cleared');
      const dt = new DataTransfer();
      dt.items.add(new File(['paste'], 'image.png', { type: 'image/png' }));
      panel.shadowRoot.querySelector('[part=input]:not([hidden])').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, composed: true, cancelable: true }));
      assert(panel.attachments.length === 1, 'paste');
      panel.shadowRoot.querySelector('.panel').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, composed: true, cancelable: true }));
      assert(panel.attachments.length === 2, 'drop');
      panel.clearAttachments();
      const docs = new DataTransfer();
      docs.items.add(new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' }));
      docs.items.add(new File(['# Notes'], 'notes.md'));
      docs.items.add(new File(['word'], 'proposal.docx'));
      panel.shadowRoot.querySelector('.panel').dispatchEvent(new DragEvent('drop', { dataTransfer: docs, bubbles: true, composed: true, cancelable: true }));
      assert(panel.attachments.length === 3, 'multi-document drag and drop');
      panel.clearAttachments();
      panel.shadowRoot.querySelector('[part=input]:not([hidden])').dispatchEvent(new ClipboardEvent('paste', { clipboardData: docs, bubbles: true, composed: true, cancelable: true }));
      assert(panel.attachments.length === 3, 'PDF, Markdown and Word clipboard files');
      const rejected = new DataTransfer();
      rejected.items.add(new File(['exe'], 'program.exe', { type: 'application/octet-stream' }));
      panel.shadowRoot.querySelector('.panel').dispatchEvent(new DragEvent('drop', { dataTransfer: rejected, bubbles: true, composed: true, cancelable: true }));
      assert(panel.attachments.length === 3, 'drop applies accept validation');
      panel.clearAttachments();
      panel.removeAttribute('sticky-attachments');

      // Council round 1 regressions.
      const root = panel.shadowRoot;
      panel.entries = [{ id: 'ref-only', type: 'text', role: 'user', content: '', references: [{ type: 'record', id: 9 }] }];
      await tick();
      assert(!root.querySelector('[data-entry-id="ref-only"] .bubble'), 'no empty bubble under chips');
      assert(root.querySelector('[data-entry-id="ref-only"]').dataset.role === 'user', 'text-less user turn keeps data-role');
      panel.defineEntry('plain', () => document.createTextNode('plain text row'));
      panel.entries = [{ id: 'plain-1', type: 'plain' }, { id: 'tools-1', type: 'tools', tools: [{ id: 't', name: 'search', status: 'completed' }] }];
      await tick();
      assert(root.querySelector('[data-entry-id="plain-1"]')?.textContent === 'plain text row', 'text-node renderer is wrapped');
      root.querySelector('[data-entry-id="tools-1"]').open = true;
      panel.labels = { send: 'Enviar' };
      await tick();
      assert(root.querySelector('[data-entry-id="tools-1"]').open, 'labels change keeps open tool groups');
      panel.setAttribute('max-files', '');
      assert(panel.limits.maxFiles === 12, 'blank limit attribute uses the default');
      panel.removeAttribute('max-files');
      panel.setAttribute('mention-trigger', '@');
      panel.setAttribute('plain-text', ''); // The textarea composer, first.
      const input = root.querySelector('textarea');
      let mentions = 0;
      const countMention = () => { mentions += 1; };
      panel.addEventListener('agent-mention', countMention);
      input.value = '@al'; input.setSelectionRange(3, 3); input.dispatchEvent(new Event('input'));
      input.value = 'x @al'; input.setSelectionRange(5, 5); input.dispatchEvent(new Event('input'));
      assert(mentions === 1, 'moving the trigger without a new query fires no agent-mention');
      panel.removeEventListener('agent-mention', countMention);
      panel.closeMention();
      panel.draft = '';
      panel.removeAttribute('plain-text');
      await tick();

      // Rich-text composer (the default).
      const editor = root.querySelector('.input--rich');
      assert(!editor.hidden && input.hidden, 'rich text is the default; plain-text swaps in the textarea');
      const caretAtEnd = () => {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        panel._setCaret(range);
      };
      editor.focus();
      editor.textContent = 'Compare @Spr';
      caretAtEnd();
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      assert(panel.mention.open && panel.mention.query === 'Spr', 'mentions work in the editor');
      panel.addReference({ type: 'campaign', id: 7, label: 'Spring' });
      assert(panel.draft === 'Compare ' && !panel.mention.open, 'picking cuts @query out of the editor');
      panel.references = [];
      panel.draft = 'Compare';
      editor.blur();
      const outside = document.createRange();
      outside.selectNodeContents(document.body);
      outside.collapse(true);
      document.getSelection().removeAllRanges();
      document.getSelection().addRange(outside);
      panel.addReference({ type: 'list', id: 3, label: 'Customers' });
      document.execCommand('insertText', false, ' these');
      assert(panel.draft === 'Compare these', `focus() puts the caret at the end (${panel.draft})`);
      panel.references = [];
      panel.draft = 'Say **hello** to *all*';
      assert(editor.querySelector('strong')?.textContent === 'hello' && editor.querySelector('em')?.textContent === 'all', 'markdown draft shows formatted');
      assert(panel.draft === 'Say **hello** to *all*', 'draft round-trips as markdown');
      panel.draft = '';
      editor.focus();
      const rich = new DataTransfer();
      rich.setData('text/html', '<meta charset="utf-8"><b style="font-weight:normal" id="docs-internal-guid"><span style="font-weight:700">Bold</span><span> plain </span><i>slanted</i></b><script>window.pwned = 1</script><img src="x" onerror="window.pwned = 1">');
      rich.setData('text/plain', 'Bold plain slanted');
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: rich, bubbles: true, composed: true, cancelable: true }));
      assert(panel.draft === '**Bold** plain *slanted*', `rich paste keeps bold and italic (${panel.draft})`);
      assert(!editor.querySelector('img, script, span[style]') && !window.pwned, 'rich paste drops everything else');
      panel.draft = 'make this bold';
      const word = document.createRange();
      word.setStart(editor.firstChild, 10);
      word.setEnd(editor.firstChild, 14);
      panel._setCaret(word);
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }));
      assert(panel.draft === 'make this **bold**', `Ctrl+B bolds the selection (${panel.draft})`);
      const underline = new KeyboardEvent('keydown', { key: 'u', ctrlKey: true, bubbles: true, cancelable: true });
      editor.dispatchEvent(underline);
      assert(underline.defaultPrevented && !editor.querySelector('u'), 'no underline');
      let richDetail;
      panel.addEventListener('agent-submit', (e) => { richDetail = e.detail; e.preventDefault(); }, { once: true });
      panel.submit();
      assert(richDetail.text === 'make this **bold**', 'sent as markdown');
      panel.setAttribute('plain-text', '');
      assert(input.value === 'make this **bold**' && panel.draft === 'make this **bold**', 'switching to plain-text keeps the draft');
      panel.removeAttribute('plain-text');
      assert(editor.querySelector('strong')?.textContent === 'bold', 'and back');
      panel.draft = '';
      // Council 0.3.0 round 1.
      editor.innerHTML = '<b>shift\nnext</b>';
      assert(panel.draft === '**shift**\n**next**', `bold across a line break (${JSON.stringify(panel.draft)})`);
      panel.draft = 'abcdefghij';
      const dropAt = new StaticRange({ startContainer: editor.firstChild, startOffset: 0, endContainer: editor.firstChild, endOffset: 0 });
      const dropData = new DataTransfer();
      dropData.setData('text/html', '<i>DROP</i><img src=x onerror="window.pwned=1">');
      const dropEvent = new InputEvent('beforeinput', { inputType: 'insertFromDrop', dataTransfer: dropData, targetRanges: [dropAt], bubbles: true, cancelable: true });
      // WebKit can't build a synthetic drop (it ignores dataTransfer and targetRanges).
      if (dropEvent.dataTransfer) {
        editor.dispatchEvent(dropEvent);
        await tick();
        assert(panel.draft === '*DROP*abcdefghij' && !editor.querySelector('img'), `drop lands at the drop point (${panel.draft})`);
      }
      const junk = new DataTransfer();
      junk.setData('text/html', '<script>x</script>');
      junk.setData('text/plain', 'HELLO');
      panel.draft = '';
      editor.focus();
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: junk, bubbles: true, composed: true, cancelable: true }));
      assert(panel.draft === 'HELLO', 'HTML with no text falls back to plain text');
      const same = document.createRange();
      same.selectNodeContents(editor);
      panel._setCaret(same);
      const again = new DataTransfer();
      again.setData('text/plain', 'HELLO');
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: again, bubbles: true, composed: true, cancelable: true }));
      assert(panel.draft === 'HELLO', `pasting the same text over a selection replaces it (${panel.draft})`);
      panel.draft = '';
      panel.disabled = true;
      const blocked = new ClipboardEvent('paste', { clipboardData: junk, bubbles: true, composed: true, cancelable: true });
      editor.dispatchEvent(blocked);
      assert(blocked.defaultPrevented && panel.draft === '', 'disabled: paste inserts nothing');
      panel.disabled = false;
      panel.setAttribute('no-attachments', '');
      const mixed = new DataTransfer();
      mixed.items.add(new File(['p'], 'shot.png', { type: 'image/png' }));
      mixed.setData('text/html', '<b>Cell</b><img src=x onerror="window.pwned=1">');
      const filePaste = new ClipboardEvent('paste', { clipboardData: mixed, bubbles: true, composed: true, cancelable: true });
      editor.dispatchEvent(filePaste);
      assert(filePaste.defaultPrevented && panel.draft === '**Cell**' && !editor.querySelector('img') && !window.pwned, 'no-attachments: a file paste is cancelled, its text sanitized');
      panel.removeAttribute('no-attachments');
      panel.draft = '';
      await tick();
      panel.entries = [{ id: 'fmt', type: 'text', role: 'user', content: 'Plain, **bold**, *italic* and <b>tags</b>' }];
      await tick();
      const bubble = root.querySelector('[data-entry-id="fmt"]');
      assert(bubble.querySelector('strong')?.textContent === 'bold' && bubble.querySelector('em')?.textContent === 'italic' && bubble.textContent.includes('<b>tags</b>'), 'user bubbles show bold and italic, escape the rest');
      panel.entries = [];
      panel.removeAttribute('mention-trigger');
      let imeSubmits = 0;
      const countSubmit = (e) => { imeSubmits += 1; e.preventDefault(); };
      panel.addEventListener('agent-submit', countSubmit);
      panel.draft = 'こんにちは';
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true }));
      assert(imeSubmits === 0, 'IME-confirming Enter (keyCode 229) does not send');
      panel.removeEventListener('agent-submit', countSubmit);
      panel.draft = '';
      panel.suggestions = ['Hello'];
      panel.entries = [];
      await tick();
      const suggestion = root.querySelector('[part=suggestion]');
      panel.running = true;
      await tick();
      assert(root.querySelector('[part=suggestion]') === suggestion, 'suggestions survive unrelated redraws');
      panel.running = false;
      panel.suggestions = [];
      const pic = panel.addFiles([new File(['p'], 'p.png', { type: 'image/png' })]).added[0];
      const firstUrl = pic.previewUrl;
      panel.remove();
      await tick(); await tick();
      assert((await fetch(firstUrl).then(() => 'alive', () => 'revoked')) === 'revoked', 'previews released when removed');
      document.body.append(panel);
      assert(panel.attachments[0].previewUrl && panel.attachments[0].previewUrl !== firstUrl, 'previews recreated on reconnect');
      assert((await fetch(panel.attachments[0].previewUrl).then(() => 'alive', () => 'revoked')) === 'alive', 'new preview usable');
      const kept = panel.attachments[0].previewUrl;
      panel.remove(); document.body.append(panel);
      await tick(); await tick();
      assert(panel.attachments[0].previewUrl === kept, 'a move keeps previews');
      panel.clearAttachments();
      panel.remove();
      await tick(); await tick();
      const detachedUrl = panel.addFiles([new File(['q'], 'q.png', { type: 'image/png' })]).added[0].previewUrl;
      document.body.append(panel);
      assert((await fetch(detachedUrl).then(() => 'alive', () => 'revoked')) === 'revoked', 'reconnect frees previews made while detached');
      panel.clearAttachments();

      // Composer menus (0.3.0).
      const part = (name) => root.querySelector(`[part~="${name}"]`);
      panel.removeAttribute('mention-trigger');
      await tick();
      assert(!part('add-menu').hidden && part('attach').matches('[part~="add-menu"]'), '"+" menu on by default, keeps the attach part');
      assert(part('model-menu').hidden && part('options-menu').hidden, 'model and options menus hidden without data');
      part('add-menu').click();
      const addKeys = [...root.querySelectorAll('[part=menu] [data-menu-key]')].map((b) => b.dataset.menuKey);
      assert(addKeys.join() === 'add:attach,add:paste', 'default "+" items (no context without a trigger)');
      root.querySelector('[data-menu-key="add:paste"]').click();
      const pasteArea = root.querySelector('[part=menu] textarea');
      assert(root.activeElement === pasteArea, 'paste text focuses its field');
      pasteArea.value = 'a,b\n1,2';
      root.querySelector('[part=menu] input').value = 'leads.csv';
      [...root.querySelectorAll('[part=menu] button')].find((b) => b.textContent === 'Add').click();
      assert(panel.attachments[0]?.name === 'leads.csv' && panel.attachments[0].type === 'text/csv', 'paste text adds a file');
      assert(root.querySelector('[part=menu]').hidden, 'menu closes after adding');
      panel.clearAttachments();
      panel.setAttribute('no-add-menu', '');
      await tick();
      assert(part('add-menu').hidden && !root.querySelector('[part="attach"]').hidden, 'no-add-menu restores the paperclip');
      panel.removeAttribute('no-add-menu');
      let picked;
      panel.addEventListener('agent-menu-select', (e) => { picked = e.detail.id; }, { once: true });
      panel.addMenu = [{ id: 'kit', label: 'Brand kit', group: 'Kits', reference: { type: 'brand_kit', id: 'k1', label: 'Kit' } }];
      await tick();
      part('add-menu').click();
      assert(root.querySelector('[part=menu] .menu-group')?.textContent === 'Kits', 'custom items are grouped');
      root.querySelector('[data-menu-key="add:kit"]').click();
      assert(picked === 'kit' && panel.references.some((r) => r.id === 'k1'), 'custom item with a reference adds it');
      panel.references = [];
      panel.addMenu = null;

      panel.models = ['a', { id: 'b', label: 'Model B', group: 'Vendor' }];
      panel.setAttribute('default-model', 'a');
      await tick();
      assert(!part('model-menu').hidden && part('model-menu').textContent.includes('Default (a)'), 'model menu shows the default');
      part('model-menu').click();
      assert(root.activeElement?.dataset.menuKey === 'model:', 'focus starts on the chosen model');
      root.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      assert(root.activeElement?.dataset.menuKey === 'model:a', 'arrow keys move through the menu');
      let modelChange;
      panel.addEventListener('agent-model-change', (e) => { modelChange = e.detail; }, { once: true });
      root.querySelector('[data-menu-key="model:b"]').click();
      await tick();
      assert(panel.model === 'b' && modelChange.previous === '' && part('model-menu').textContent.includes('Model B'), 'picking a model');
      assert(root.activeElement === part('model-menu'), 'focus returns to the trigger');

      panel.options = [{ id: 'effort', label: 'Effort', choices: ['low', 'high'], default: 'high' }, { id: 'auto', label: 'Auto-apply' }];
      await tick();
      part('options-menu').click();
      root.querySelector('[data-menu-key="option:auto"]').focus();
      root.querySelector('[data-menu-key="option:auto"]').click();
      assert(panel.optionValues.auto === true && panel.optionValues.effort === 'high', 'toggle with defaults');
      assert(root.activeElement?.dataset.menuKey === 'option:auto', 'focus stays on a toggled option');
      root.querySelector('[data-menu-key="option-reset"]').click();
      assert(panel.optionValues.auto === false, 'reset to defaults');
      root.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert(root.querySelector('[part=menu]').hidden && root.activeElement === part('options-menu'), 'Escape closes and refocuses');
      panel.addEventListener('agent-submit', (e) => { detail = e.detail; e.preventDefault(); }, { once: true });
      panel.submit('with settings');
      assert(detail.model === 'b' && detail.options.effort === 'high', 'submit carries model and options');
      // Council 0.3.0 round 1: menus.
      panel.models = Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, group: i < 5 ? 'One' : 'Two' }));
      panel.model = 'm3';
      panel.models = panel.models.map((m) => (m.id === 'm3' ? { ...m, disabled: true } : m));
      await tick();
      part('model-menu').click();
      const search = root.querySelector('[part=menu] .menu-search');
      assert(search && root.activeElement === search, 'more than 7 models: search field, focused');
      search.value = 'm7';
      search.dispatchEvent(new Event('input'));
      const found = [...root.querySelectorAll('[part=menu] [data-menu-key^="model:"]')].map((b) => b.dataset.menuKey);
      assert(found.join() === 'model:m7', `search filters (${found})`);
      panel.addEventListener('agent-model-change', (e) => e.preventDefault(), { once: true });
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      assert(panel.model === 'm3' && root.querySelector('[part=menu]').hidden, 'Enter picks the first match; cancelling keeps the model');
      part('model-menu').click();
      search.value = '';
      root.querySelector('[part=menu] .menu-search').dispatchEvent(new Event('input'));
      part('model-menu').click();
      part('model-menu').click();
      assert(root.activeElement?.closest?.('[part=menu]'), 'focus enters the menu even when the chosen model is disabled');
      root.activeElement.dispatchEvent(new FocusEvent('focusout', { relatedTarget: part('model-menu'), bubbles: true }));
      assert(root.querySelector('[part=menu]').hidden, 'Shift+Tab back to the trigger closes the menu');
      part('model-menu').click();
      part('model-menu').focus();
      part('model-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      assert(root.querySelector('[part=menu]').hidden, 'Escape on the trigger closes the menu');
      part('options-menu').click();
      panel.addEventListener('agent-option-change', (e) => e.preventDefault(), { once: true });
      root.querySelector('[data-menu-key="option:auto"]').click();
      assert(panel.optionValues.auto === false, 'cancelling agent-option-change keeps the value');
      root.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      panel._closeMenu({ focus: false });
      panel.addMenu = ['attach', 'paste', 'link'];
      await tick();
      part('add-menu').click();
      let skipped = false;
      panel.addEventListener('agent-menu-select', (e) => { skipped = true; e.preventDefault(); }, { once: true });
      root.querySelector('[data-menu-key="add:paste"]').click();
      assert(skipped && root.querySelector('[part=menu]').hidden, 'cancelling agent-menu-select skips the built-in');
      part('add-menu').click();
      root.querySelector('[data-menu-key="add:link"]').click();
      const linkInput = root.querySelector('[part=menu] input[type=url]');
      const attachLink = () => [...root.querySelectorAll('[part=menu] button')].find((b) => b.textContent === 'Attach link').click();
      linkInput.value = 'javascript:alert(1)';
      attachLink();
      assert(!root.querySelector('.menu-problem').hidden && !panel.references.length, 'link form refuses non-HTTP(S)');
      linkInput.value = 'https://example.com/%E0%A4%A';
      attachLink();
      assert(panel.references[0]?.label === '%E0%A4%A', 'malformed escapes keep the raw segment');
      panel.references = [];
      part('add-menu').click();
      root.querySelector('[data-menu-key="add:link"]').click();
      root.querySelector('[part=menu] input[type=url]').value = 'https://example.com/pic.png';
      attachLink();
      assert(panel.references[0]?.url === 'https://example.com/pic.png' && panel.references[0].mimeType === 'image/png', 'link form adds an asset');
      panel.references = [];
      part('add-menu').click();
      panel.setAttribute('no-add-menu', '');
      await tick();
      assert(root.querySelector('[part=menu]').hidden, 'no-add-menu while open closes the menu');
      panel.removeAttribute('no-add-menu');
      panel.addMenu = null;
      panel.models = []; panel.options = []; panel.model = '';
      await tick();

      if (tag.endsWith('agent-page')) {
        let selected = 0;
        panel.addEventListener('agent-select-conversation', () => { selected += 1; });
        panel.conversations = [
          { id: 'evil', title: 'Evil', href: 'javascript:alert(1)' },
          { id: 'ok', title: 'OK', href: '/chats/ok' },
          { id: 'btn', title: 'Button row' },
        ];
        await tick();
        const row = (id) => root.querySelector(`[data-conversation-id="${id}"] .conv-link`);
        assert(row('evil').tagName === 'BUTTON' && !row('evil').hasAttribute('href'), 'javascript: href dropped');
        assert(row('ok').getAttribute('href') === '/chats/ok', 'relative href kept');
        row('btn').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
        assert(selected === 0, 'modifier click on a button row selects nothing');
        const link = row('ok');
        panel.entries = [{ id: 'stream', type: 'text', role: 'assistant', content: 'streaming' }];
        await tick();
        assert(row('ok') === link, 'sidebar rows survive transcript redraws');
        panel.conversations.push({ id: 'sneaky' });
        assert(panel.conversations.length === 3, 'conversations getter returns a copy');
        root.querySelector('[data-conversation-id="btn"] [data-action=delete]').click();
        assert(root.activeElement?.dataset.action === 'confirm-delete', 'delete moves focus to confirm');

        // Desktop width: opening the sidebar still closes a composer menu.
        panel.models = ['a', 'b'];
        panel.style.cssText = 'display:block;width:1100px;height:400px';
        await tick();
        part('model-menu').click();
        panel.openSidebar();
        assert(root.querySelector('[part=menu]').hidden, 'opening the sidebar at desktop width closes a composer menu');
        part('model-menu').click();
        root.querySelector('[part=menu] [role^=menuitem]').focus();
        panel.openSidebar();
        assert(root.querySelector('[part=menu]').hidden && root.activeElement === part('model-menu'), 'a repeated openSidebar closes the menu and returns focus to its trigger');
        panel.closeSidebar();
        panel.models = [];
        panel.style.cssText = '';
        await tick();

        // Narrow layout: the drawer, inside another shadow root.
        const host = document.createElement('div');
        document.body.append(host);
        const outer = host.attachShadow({ mode: 'open' });
        outer.append(panel);
        panel.style.cssText = 'display:block;width:500px;height:400px';
        const slotted = Object.assign(document.createElement('button'), { slot: 'sidebar-end', textContent: 'Extra' });
        panel.append(slotted);
        await tick();
        const history = root.querySelector('[part=history]');
        panel.models = ['a', 'b'];
        await tick();
        part('model-menu').click();
        panel.openSidebar();
        assert(root.querySelector('[part=menu]').hidden, 'opening the drawer closes a composer menu');
        panel.models = [];
        await tick();
        panel.closeSidebar();
        await new Promise((r) => setTimeout(r, 300));
        panel.openSidebar();
        assert(history.getAttribute('aria-expanded') === 'true', 'aria-expanded on open');
        slotted.focus();
        panel.closeSidebar();
        assert(root.activeElement === history, 'closing from slotted content returns focus to History, even nested');
        panel.openSidebar();
        assert(root.querySelector('[part=sidebar]').contains(root.activeElement), 'reopening right away focuses inside the drawer');
        panel.closeSidebar();
        slotted.remove();
        panel.style.cssText = '';
        document.body.append(panel);
        host.remove();

        // Load more and the switcher: the page never shows the panel's switcher.
        let more = 0;
        panel.addEventListener('agent-load-more', () => { more += 1; });
        panel.setAttribute('conversations-menu', '');
        panel.hasMore = true;
        await tick();
        assert(root.querySelector('[part=switcher]').hidden, 'page hides the panel switcher');
        root.querySelector('.convs [part=load-more]').click();
        assert(more === 1, 'sidebar Load more fires agent-load-more');
        panel.hasMore = false;
        panel.removeAttribute('conversations-menu');
        await tick();
        assert(!root.querySelector('[part=load-more]'), 'Load more hidden without has-more');
      } else if (!appMode) {
        // <agent-panel conversations-menu>: a switcher over the same list.
        const switcher = root.querySelector('[part=switcher]');
        assert(switcher.hidden, 'switcher hidden without conversations-menu');
        panel.setAttribute('conversations-menu', '');
        panel.conversations = [
          { id: 'c1', title: 'First chat', updated: new Date().toISOString() },
          { id: 'c2', title: '' },
        ];
        panel.active = 'c2';
        await tick();
        assert(!switcher.hidden, 'switcher shown with conversations-menu');
        assert(root.querySelector('[part=heading]').hidden && switcher.closest('.head'), 'switcher replaces the heading in the header');
        assert(!root.querySelector('[part=switcher-new]').hidden, 'New chat shows in the header');
        const end = root.querySelector('.switch-end');
        assert(end.hidden, 'switcher-end hidden while empty');
        const footer = Object.assign(document.createElement('button'), { slot: 'switcher-end', textContent: 'Open full page' });
        panel.append(footer);
        await new Promise((resolve) => setTimeout(resolve));
        assert(!end.hidden, 'switcher-end shows slotted content');
        const button = root.querySelector('[part=switcher-button]');
        assert(button.textContent.includes('New chat'), 'untitled active conversation uses the untitled label');
        panel.active = 'c1';
        await tick();
        assert(button.textContent.includes('First chat'), 'switcher shows the active title');
        button.click();
        const pop = root.querySelector('[part=switcher-menu]');
        assert(!pop.hidden && button.getAttribute('aria-expanded') === 'true', 'switcher opens');
        assert(root.activeElement?.getAttribute('aria-current') === 'page', 'opening focuses the active row');
        const events = [];
        ['agent-select-conversation', 'agent-delete-conversation', 'agent-new-conversation', 'agent-load-more']
          .forEach((type) => panel.addEventListener(type, (e) => events.push([type, e.detail?.id])));
        pop.querySelector('[data-conversation-id="c2"] [data-action=delete]').click();
        assert(root.activeElement?.dataset.action === 'confirm-delete', 'switcher delete asks first');
        root.activeElement.click();
        assert(events.at(-1)[0] === 'agent-delete-conversation' && events.at(-1)[1] === 'c2', 'switcher delete fires');
        assert(!pop.hidden, 'deleting keeps the switcher open');
        pop.querySelector('[data-conversation-id="c2"] .conv-link').click();
        assert(events.at(-1)[0] === 'agent-select-conversation' && pop.hidden, 'selecting fires and closes');
        panel.hasMore = true;
        panel.openConversations();
        await tick();
        pop.querySelector('[part=load-more]').click();
        assert(events.at(-1)[0] === 'agent-load-more', 'switcher Load more fires');
        pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert(pop.hidden && root.activeElement === button, 'Escape closes and refocuses the button');
        panel.openConversations();
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
        assert(pop.hidden, 'outside press closes the switcher');
        root.querySelector('[part=switcher-new]').click();
        assert(events.at(-1)[0] === 'agent-new-conversation', 'switcher New chat fires');
        panel.removeAttribute('conversations-menu');
        panel.hasMore = false;
        panel.conversations = [];
        await tick();
        assert(switcher.hidden, 'switcher hides again');
        assert(!root.querySelector('[part=heading]').hidden && root.querySelector('[part=switcher-new]').hidden, 'heading returns, New chat hides');
        footer.remove();
      }
      {
        // The context ring (contextUsage): hidden below the threshold, a card with Compact.
        const root = panel.shadowRoot;
        const ctx = root.querySelector('[part=context-usage]');
        panel.running = false;
        panel.contextUsage = { used: 10000, window: 100000 };
        await tick();
        assert(ctx && ctx.hidden, 'context ring hidden below the threshold');
        panel.contextUsage = { used: 72000, window: 100000, estimated: true, summarizedAt: Date.now() };
        await tick();
        assert(!ctx.hidden && ctx.dataset.level === 'normal', 'context ring shown at 72%');
        const button = root.querySelector('[part=context-usage-button]');
        assert(button.getAttribute('aria-label').includes('72% of context used'), 'context ring label');
        button.click();
        await tick();
        const card = root.querySelector('[part=context-usage-card]');
        assert(!card.hidden && card.textContent.includes('72k of 100k tokens (estimated)'), 'context card numbers');
        assert(card.textContent.includes('Earlier messages summarized'), 'context card shows the summary time');
        let compacted = 0;
        panel.addEventListener('agent-compact', () => { compacted += 1; });
        root.querySelector('[part=context-compact]').click();
        assert(compacted === 1, 'Compact fires agent-compact');
        panel.contextUsage = { used: 72000, window: 100000, compacting: true };
        await tick();
        assert(root.querySelector('[part=context-compact]').disabled && ctx.classList.contains('ctx--busy'), 'compacting disables Compact');
        // A compaction that drops below the threshold keeps the ring while its card is open.
        panel.contextUsage = { used: 20000, window: 100000 };
        await tick();
        assert(!ctx.hidden && card.textContent.includes('20% of context used'), 'open card shows the result');
        card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await tick();
        assert(card.hidden && ctx.hidden, 'Escape closes the card and the ring hides');
        panel.contextUsage = { used: 97000, window: 100000, canCompact: false };
        await tick();
        assert(ctx.dataset.level === 'critical', 'critical level at 97%');
        panel.openContextUsage();
        await tick();
        assert(root.querySelector('[part=context-compact]').hidden, 'canCompact false hides Compact');
        panel.closeContextUsage();
        panel.setAttribute('context-threshold', '0.99');
        await tick();
        assert(ctx.hidden, 'context-threshold raises the bar');
        panel.contextUsage = null;
        panel.removeAttribute('context-threshold');
        await tick();
        assert(ctx.hidden, 'null contextUsage hides the ring');
      }
    }, tag);
    console.log(`${tag}: browser checks passed (${engine})`);
    await page.close();
  }
} finally { await browser.close(); }
