// Run with PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node test/browser.check.mjs.
// The browser dependency is deliberately external to this zero-dependency package.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const appRoot = process.env.EVENT_POCKET_ROOT;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch();
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
      panel.shadowRoot.querySelector('textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, composed: true, cancelable: true }));
      assert(panel.attachments.length === 1, 'paste');
      panel.shadowRoot.querySelector('.panel').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, composed: true, cancelable: true }));
      assert(panel.attachments.length === 2, 'drop');
    }, tag);
    console.log(`${tag}: browser checks passed`);
    await page.close();
  }
} finally { await browser.close(); }
