// <agent-panel>: a chat panel for an AI agent, as a framework-free custom element.
//
// The host owns the conversation and the network; the panel owns the composer. Set
// `entries` to show the transcript, listen for `agent-submit` to send. See README.md
// for the full API and how to extend it. This module defines no tag: index.js does.
import {
  DEFAULT_LIMITS, attachmentProblem, formatBytes, nameFor, pastedFiles, filesFromDataTransfer, readAsBase64,
} from './attachments.mjs';
import { ICONS } from './icons.js';
import { STYLES } from './styles.js';

// Importable (but inert) where there's no DOM, e.g. during server rendering.
const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;

const DEFAULT_LABELS = {
  attach: 'Attach files',
  attachHint: 'Attach files (you can also paste or drop them)',
  close: 'Close',
  dismiss: 'Dismiss',
  drop: 'Drop files to attach',
  remove: 'Remove',
  send: 'Send',
  stop: 'Stop',
  usedTools: (n) => `Used ${n} tools`,
  working: 'Working',
};

// h('button', { class: 'btn', onClick }, 'Text', node): a small DOM builder for the
// panel and its subclasses. `html` sets innerHTML, so only pass markup you trust.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  Object.entries(props || {}).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === 'class') el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  });
  children.flat(Infinity).forEach((child) => {
    if (child == null || child === false) return;
    el.append(child instanceof Node ? child : String(child));
  });
  return el;
}

// An icon by name (see icons.js), or any 24×24 SVG path string, e.g. one from @mdi/js.
export function icon(nameOrPath, size = 18, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon ${className}`.trim());
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[nameOrPath] || (/^[Mm]/.test(String(nameOrPath || '')) ? nameOrPath : ''));
  svg.append(path);
  return svg;
}

function escapeHTML(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Without a markdown renderer, replies show as plain paragraphs.
function plainText(text) {
  return String(text ?? '').split(/\n{2,}/).map((p) => `<p>${escapeHTML(p).replace(/\n/g, '<br>')}</p>`).join('');
}

function humanize(name) {
  const text = String(name || '').replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function uniqueName(name, taken) {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let n = 2;
  while (taken.has(`${stem}-${n}${ext}`)) n += 1;
  return `${stem}-${n}${ext}`;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// References point at things in the host app (a contact, a document…) by type and id.
export function referenceKey(ref) {
  return `${ref?.type}:${ref?.id}`;
}

function normalizeReferences(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter((ref) => {
    if (!ref || ref.type == null || ref.id == null || seen.has(referenceKey(ref))) return false;
    seen.add(referenceKey(ref));
    return true;
  });
}

const MENTION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape']);

let nextId = 0;

export class AgentPanelElement extends Base {
  static tagName = 'agent-panel';

  // Subclasses add their own CSS with `static styles = '...'`; it's appended after this.
  static styles = STYLES;

  // Subclasses add their own words with `static defaultLabels = { ...super.defaultLabels, … }`.
  static defaultLabels = DEFAULT_LABELS;

  static get observedAttributes() {
    return ['heading', 'placeholder', 'hint', 'empty-title', 'empty-text', 'running', 'disabled', 'closable',
      'no-attachments', 'accept', 'error'];
  }

  static define(tag = this.tagName, registry = globalThis.customElements) {
    if (registry && !registry.get(tag)) registry.define(tag, this);
    return this;
  }

  static readAsBase64 = readAsBase64;

  constructor() {
    super();
    this._entries = [];
    this._suggestions = [];
    this._attachments = [];
    this._references = [];
    this._mention = null;
    this._labels = { ...this.constructor.defaultLabels };
    this._renderers = new Map();
    this._nodes = new Map();
    this._markdown = null;
    this._follow = true;
    this._dragDepth = 0;
    this._attachError = '';
    this._entriesDirty = true;
    this._scheduled = false;
    this.attachShadow({ mode: 'open' });
    this._build();
  }

  // ---- Properties -------------------------------------------------------------------

  // Transcript rows: { id, type: 'text', role: 'user' | 'assistant', content, references? },
  // { id, type: 'tools', label?, tools: [{ id, name, label?, status, detail? }] }, or any
  // type a renderer handles. Rows nothing renders become <slot name="entry-{id}">.
  get entries() { return this._entries; }

  set entries(value) {
    this._entries = Array.isArray(value) ? value : [];
    this._entriesDirty = true;
    this._schedule();
  }

  get suggestions() { return this._suggestions; }

  set suggestions(value) {
    this._suggestions = Array.isArray(value) ? value : [];
    this._schedule();
  }

  // (text) => HTML string. It must return safe markup: the panel inserts it as is.
  get markdown() { return this._markdown; }

  set markdown(fn) {
    this._markdown = typeof fn === 'function' ? fn : null;
    this._rerenderEntries();
  }

  // Overrides for the panel's own words, e.g. { send: 'Enviar' }.
  get labels() { return this._labels; }

  set labels(value) {
    this._labels = { ...this.constructor.defaultLabels, ...(value || {}) };
    this._rerenderEntries();
  }

  get draft() { return this.$input.value; }

  set draft(value) {
    this.$input.value = String(value ?? '');
    this._grow();
    this._schedule();
  }

  // What's waiting in the composer: [{ id, file, name, type, size, previewUrl, base64() }].
  get attachments() { return this._attachments.slice(); }

  // Things from the host app the next message refers to: [{ type, id, label?, ...any }].
  // Shown as chips beside the attachments, sent with `agent-submit`, then cleared.
  get references() { return this._references.slice(); }

  set references(value) {
    this._references = normalizeReferences(value);
    this._schedule();
  }

  // { open, query } while the person is typing a mention (see `mention-trigger`).
  get mention() {
    return { open: Boolean(this._mention), query: this._mention?.query ?? '' };
  }

  get limits() {
    const num = (attr, fallback) => {
      const n = Number(this.getAttribute(attr));
      return this.hasAttribute(attr) && Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    return {
      accept: this.getAttribute('accept') ?? DEFAULT_LIMITS.accept,
      maxFileSize: num('max-file-size', DEFAULT_LIMITS.maxFileSize),
      maxTotalSize: num('max-total-size', DEFAULT_LIMITS.maxTotalSize),
      maxFiles: num('max-files', DEFAULT_LIMITS.maxFiles),
    };
  }

  get error() { return this.getAttribute('error') || ''; }

  set error(value) { this._reflect('error', value || ''); }

  get running() { return this.hasAttribute('running'); }

  set running(value) { this.toggleAttribute('running', Boolean(value)); }

  get disabled() { return this.hasAttribute('disabled'); }

  set disabled(value) { this.toggleAttribute('disabled', Boolean(value)); }

  get closable() { return this.hasAttribute('closable'); }

  set closable(value) { this.toggleAttribute('closable', Boolean(value)); }

  // ---- Methods ----------------------------------------------------------------------

  // Renders entries of `type` with fn(entry, panel) => Node, without subclassing.
  defineEntry(type, fn) {
    if (typeof fn === 'function') this._renderers.set(type, fn);
    else this._renderers.delete(type);
    this._rerenderEntries();
    return this;
  }

  // Adds files the way the attach button, paste and drop do. Returns what was added and
  // why the rest weren't.
  addFiles(list, { pasted = false } = {}) {
    const added = [];
    const problems = [];
    if (this.hasAttribute('no-attachments') || this.disabled) return { added, problems };
    Array.from(list || []).forEach((raw, index) => {
      const taken = new Set(this._attachments.map((a) => a.name));
      const name = uniqueName(nameFor(raw, { pasted, index }), taken);
      const file = name === raw.name ? raw : new File([raw], name, { type: raw.type, lastModified: raw.lastModified });
      const problem = this.fileProblem(file, this._attachments);
      if (problem) {
        problems.push(problem);
        return;
      }
      let encoded = null;
      const item = {
        id: `att-${nextId += 1}`,
        file,
        name,
        type: file.type || '',
        size: file.size,
        pasted,
        previewUrl: file.type.startsWith('image/') && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '',
        base64() {
          encoded ||= readAsBase64(file);
          return encoded;
        },
      };
      this._attachments.push(item);
      added.push(item);
    });
    this._attachError = problems.join(' ');
    if (problems.length) this._emit('agent-attachment-error', { problems });
    if (added.length) this._attachmentsChanged();
    this._schedule();
    return { added, problems };
  }

  removeAttachment(id) {
    const item = this._attachments.find((a) => a.id === id);
    if (!item) return;
    this._attachments = this._attachments.filter((a) => a !== item);
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    this._attachError = '';
    this._attachmentsChanged();
    this._schedule();
  }

  clearAttachments() {
    if (!this._attachments.length) return;
    this._attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    this._attachments = [];
    this._attachError = '';
    this._attachmentsChanged();
    this._schedule();
  }

  // Adds a reference chip. While a mention is open, the typed "@query" is replaced by it.
  addReference(ref) {
    if (!ref || ref.type == null || ref.id == null) return false;
    if (this._mention && this._mention.from >= 0) {
      const { from, query } = this._mention;
      const end = from + this._trigger().length + query.length;
      const text = this.draft;
      this.draft = text.slice(0, from) + text.slice(end);
      this.$input.setSelectionRange(from, from);
    }
    this.closeMention();
    const isNew = !this._references.some((r) => referenceKey(r) === referenceKey(ref));
    if (isNew) {
      this._references = [...this._references, ref];
      this._referencesChanged();
    }
    this.focus();
    return isNew;
  }

  removeReference(refOrKey) {
    const key = typeof refOrKey === 'string' ? refOrKey : referenceKey(refOrKey);
    const next = this._references.filter((r) => referenceKey(r) !== key);
    if (next.length === this._references.length) return;
    this._references = next;
    this._referencesChanged();
  }

  // Opens the mention picker without typing the trigger, e.g. from a toolbar button.
  openMention() {
    this._setMention({ query: '', from: -1 });
    this.focus();
  }

  closeMention() {
    this._setMention(null);
  }

  // Sends `text` (the draft by default) with the attachments and references, through a
  // cancelable `agent-submit` event. Unless a listener cancels it, the composer then clears.
  submit(text) {
    const fromDraft = text === undefined;
    const message = String(fromDraft ? this.draft : text).trim();
    if (!message || this.running || this.disabled) return false;
    const accepted = this._emit('agent-submit', { text: message, attachments: this.attachments, references: this.references }, { cancelable: true });
    if (accepted) {
      if (fromDraft) this.draft = '';
      if (!this.hasAttribute('sticky-attachments')) this.clearAttachments();
      if (this._references.length) {
        this._references = [];
        this._referencesChanged();
      }
      this.closeMention();
      this.scrollToBottom({ force: true });
    }
    return accepted;
  }

  focus(options) { this.$input.focus(options); }

  scrollToBottom({ force = false } = {}) {
    if (force) this._follow = true;
    if (this._follow) this.$scroll.scrollTop = this.$scroll.scrollHeight;
  }

  // For buttons in custom entries: dispatches `agent-action` with { action, ...detail }.
  emitAction(action, detail = {}) {
    return this._emit('agent-action', { action, ...detail }, { cancelable: true });
  }

  // ---- Hooks for subclasses ---------------------------------------------------------

  // Returns the Node for one entry, or null to leave it to a slot.
  renderEntry(entry) {
    const custom = this._renderers.get(entry.type);
    if (custom) return custom(entry, this);
    if (entry.type === 'text') return this.renderText(entry);
    if (entry.type === 'tools') return this.renderTools(entry);
    return null;
  }

  renderText(entry) {
    if (!entry.content) return h('div', { hidden: true });
    if (entry.role === 'user') {
      const bubble = h('div', { class: 'bubble', part: 'bubble', 'data-role': 'user' }, entry.content);
      const refs = normalizeReferences(entry.references);
      if (!refs.length) return bubble;
      return h('div', { class: 'user-turn' }, h('div', { class: 'chips chips--end' }, refs.map((ref) => this.renderReference(ref))), bubble);
    }
    return h('div', { class: 'message', part: 'message', 'data-role': entry.role || 'assistant', html: this.renderMarkdown(entry.content) });
  }

  renderMarkdown(text) {
    return this._markdown ? this._markdown(text) : plainText(text);
  }

  renderTools(entry) {
    const tools = entry.tools || [];
    let status = 'completed';
    if (tools.some((t) => t.status === 'running')) status = 'running';
    else if (tools.some((t) => t.status === 'failed')) status = 'failed';
    const label = entry.label || (tools.length === 1 ? tools[0].label || humanize(tools[0].name) : this._labels.usedTools(tools.length));
    let mark = icon('check', 14);
    if (status === 'running') mark = h('span', { class: 'spinner', role: 'status', 'aria-label': this._labels.working });
    else if (status === 'failed') mark = icon('alert', 14, 'failed');
    return h(
      'details',
      { class: 'tools', part: 'tools', 'data-key': `tools:${entry.id}`, 'data-status': status },
      h('summary', null, mark, h('span', null, label), icon('chevron', 14, 'chev')),
      tools.map((tool, index) => h(
        'details',
        {
          class: ['tool', tool.status === 'failed' && 'tool--failed'],
          'data-key': `tool:${tool.key ?? tool.id ?? index}`,
          'data-tool-id': tool.id,
        },
        h('summary', null, tool.label || humanize(tool.name)),
        tool.detail === undefined ? null : h('pre', null, typeof tool.detail === 'string' ? tool.detail : JSON.stringify(tool.detail, null, 2)),
      )),
    );
  }

  // A reference chip. Clicking it fires `agent-reference-open`; `removable` adds an ×.
  renderReference(ref, { removable = false } = {}) {
    const label = ref.label || String(ref.id);
    return h(
      'span',
      { class: 'chip chip--ref', part: 'reference', 'data-reference': referenceKey(ref), title: label },
      h(
        'button',
        { type: 'button', class: 'chip-open', onClick: () => this._emit('agent-reference-open', { reference: ref }) },
        this.referenceIcon(ref),
        h('span', { class: 'chip-label' }, label),
      ),
      removable ? h('button', {
        type: 'button', class: 'chip-x', 'aria-label': `${this._labels.remove} ${label}`, onClick: () => this.removeReference(ref),
      }, icon('close', 12)) : null,
    );
  }

  // The icon at the start of a reference chip.
  referenceIcon(ref) {
    return icon(ref.type === 'file' ? 'file' : 'link', 13);
  }

  // Why `file` can't join `current`, or ''. Override to add rules; call super for the limits.
  fileProblem(file, current) {
    return attachmentProblem(file, current, this.limits);
  }

  // Wraps the panel's content into the element's root. Subclasses can add around it.
  layout(panel) {
    return panel;
  }

  // ---- Lifecycle --------------------------------------------------------------------

  connectedCallback() {
    // Properties set before the element was defined shadow the accessors; replay them.
    this._upgradeProperties(['entries', 'suggestions', 'markdown', 'labels', 'draft', 'references', 'error', 'running', 'disabled', 'closable']);
    if (!this._resize && typeof ResizeObserver !== 'undefined') {
      this._resize = new ResizeObserver(() => this.scrollToBottom());
      this._resize.observe(this.$inner);
    }
    this._render();
  }

  disconnectedCallback() {
    this._resize?.disconnect();
    this._resize = null;
  }

  attributeChangedCallback() {
    this._schedule();
  }

  // ---- Internals --------------------------------------------------------------------

  _upgradeProperties(names) {
    names.forEach((name) => {
      if (Object.prototype.hasOwnProperty.call(this, name)) {
        const value = this[name];
        delete this[name];
        this[name] = value;
      }
    });
  }

  _emit(type, detail, { cancelable = false } = {}) {
    return this.dispatchEvent(new CustomEvent(type, {
      detail, bubbles: true, composed: true, cancelable,
    }));
  }

  _reflect(name, value) {
    if (value) this.setAttribute(name, value);
    else this.removeAttribute(name);
  }

  _attachmentsChanged() {
    this._emit('agent-attachments-change', { attachments: this.attachments });
  }

  _referencesChanged() {
    this._emit('agent-references-change', { references: this.references });
    this._schedule();
  }

  _trigger() {
    return this.getAttribute('mention-trigger') || '';
  }

  _setMention(next) {
    const was = this._mention;
    this._mention = next;
    if (!was && !next) return;
    if (was && next && was.query === next.query && was.from === next.from) return;
    this._emit('agent-mention', this.mention);
    this._schedule();
  }

  // Opens, updates or closes the mention as the person types after the trigger.
  _trackMention() {
    const trigger = this._trigger();
    if (!trigger) return;
    const caret = this.$input.selectionStart ?? this.draft.length;
    const t = escapeRegExp(trigger);
    const match = this.draft.slice(0, caret).match(new RegExp(`(^|\\s)${t}([^\\s${t}]*)$`));
    if (match) this._setMention({ query: match[2], from: caret - match[2].length - trigger.length });
    else if (this._mention && this._mention.from >= 0) this._setMention(null);
  }

  _rerenderEntries() {
    this._nodes = new Map();
    this._entriesDirty = true;
    this._schedule();
  }

  _schedule() {
    if (this._scheduled) return;
    this._scheduled = true;
    queueMicrotask(() => {
      this._scheduled = false;
      this._render();
    });
  }

  _grow() {
    const el = this.$input;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  _onKeydown(e) {
    if (this._mention && MENTION_KEYS.has(e.key)) {
      // The host's picker gets the key first; cancelling the event means it used it.
      const used = !this._emit('agent-mention-key', { key: e.key, event: e }, { cancelable: true });
      if (used) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeMention();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.submit();
    }
  }

  _build() {
    const slot = (name, ...fallback) => h('slot', { name }, ...fallback);
    this.$heading = h('span', { class: 'heading', part: 'heading' });
    this.$close = h('button', { type: 'button', class: 'btn btn--icon', part: 'close', onClick: () => this._emit('agent-close') }, icon('close'));
    this.$subhead = h('div', { class: 'subhead', part: 'subheader', hidden: true }, slot('subheader'));
    this.$head = h('div', { class: 'head' }, slot('header-start', this.$heading), h('div', { class: 'spacer' }), slot('header-actions'), this.$close);
    this.$header = h('header', { class: 'header', part: 'header' }, this.$head, this.$subhead);

    this.$emptyTitle = h('h2', { class: 'empty-title' });
    this.$emptyText = h('p', { class: 'empty-text' });
    this.$suggestions = h('div', { class: 'suggestions' });
    this.$empty = h('div', { class: 'empty', part: 'empty' }, slot('empty', this.$emptyTitle, this.$emptyText), this.$suggestions);
    this.$list = h('div', { class: 'list', part: 'entries' });
    this.$working = h('div', { class: 'working', role: 'status', hidden: true }, h('span'), h('span'), h('span'));
    this.$errorText = h('span');
    this.$errorClose = h('button', {
      type: 'button',
      class: 'btn btn--icon',
      onClick: () => {
        this.error = '';
        this._emit('agent-error-dismiss');
      },
    }, icon('close', 14));
    this.$error = h('div', { class: 'alert tone-error', part: 'error', role: 'alert', hidden: true }, this.$errorText, this.$errorClose);
    this.$inner = h('div', { class: 'inner' }, this.$empty, this.$list, this.$working, this.$error, slot('transcript-end'));
    this.$scroll = h('div', { class: 'scroll', part: 'transcript', 'aria-live': 'polite' }, this.$inner);
    this.$scroll.addEventListener('scroll', () => {
      const el = this.$scroll;
      this._follow = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    }, { passive: true });

    this.$attachError = h('div', { class: 'attach-error', role: 'alert', hidden: true });
    this.$refChips = h('span', { class: 'chips-files' });
    this.$fileChips = h('span', { class: 'chips-files' });
    this.$chipSlot = slot('composer-chips');
    this.$chips = h('div', { class: 'chips', part: 'attachments', hidden: true }, this.$refChips, this.$fileChips, this.$chipSlot);
    this.$input = h('textarea', {
      class: 'input',
      part: 'input',
      rows: 1,
      onInput: () => {
        this._grow();
        this._trackMention();
        this._renderControls();
      },
      onKeydown: (e) => this._onKeydown(e),
    });
    this.$fileInput = h('input', {
      type: 'file',
      multiple: true,
      hidden: true,
      onChange: (e) => {
        this.addFiles(e.target.files);
        e.target.value = '';
      },
    });
    this.$attach = h('button', { type: 'button', class: 'btn btn--icon', part: 'attach', onClick: () => this.$fileInput.click() }, icon('paperclip'));
    this.$hint = h('span', { class: 'hint', part: 'hint' });
    this.$stop = h('button', { type: 'button', class: 'btn btn--icon btn--tonal', part: 'stop', onClick: () => this._emit('agent-stop') }, icon('stop'));
    this.$send = h('button', { type: 'submit', class: 'btn btn--icon btn--primary', part: 'send' }, icon('send'));
    this.$mention = h('div', { class: 'mention', part: 'mention', hidden: true }, slot('mention'));
    this.$form = h(
      'form',
      {
        class: 'composer',
        part: 'composer',
        onSubmit: (e) => {
          e.preventDefault();
          this.submit();
        },
      },
      this.$attachError,
      this.$chips,
      h('div', { class: 'box' }, this.$mention, this.$input, h('div', { class: 'row' }, this.$attach, slot('composer-actions'), this.$hint, h('div', { class: 'spacer' }), this.$stop, this.$send)),
      this.$fileInput,
    );

    this.$dropLabel = h('span');
    this.$drop = h('div', { class: 'drop', part: 'drop', hidden: true }, icon('upload', 28), this.$dropLabel);
    this.$panel = h('div', { class: 'panel', part: 'panel' }, this.$header, this.$scroll, this.$form);
    const root = this.layout(this.$panel);
    root.append(this.$drop);
    this._listenForFiles(root);

    // Slots that sit in their own row hide the row while nothing fills them.
    this.shadowRoot.addEventListener('slotchange', () => this._renderControls());

    const style = document.createElement('style');
    const sheets = [];
    for (let c = this.constructor; c && c !== Base; c = Object.getPrototypeOf(c)) {
      if (Object.prototype.hasOwnProperty.call(c, 'styles')) sheets.unshift(c.styles);
    }
    style.textContent = sheets.join('\n');
    this.shadowRoot.append(style, root);
  }

  _canAttach() {
    return !this.hasAttribute('no-attachments') && !this.disabled;
  }

  _listenForFiles(root) {
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
    root.addEventListener('paste', (e) => {
      if (!this._canAttach()) return;
      const files = pastedFiles(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      this.addFiles(files, { pasted: true });
    });
    root.addEventListener('dragenter', (e) => {
      if (!hasFiles(e) || !this._canAttach()) return;
      e.preventDefault();
      this._dragDepth += 1;
      this.$drop.hidden = false;
    });
    root.addEventListener('dragover', (e) => {
      if (!hasFiles(e) || !this._canAttach()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    root.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      this._dragDepth = Math.max(0, this._dragDepth - 1);
      if (!this._dragDepth) this.$drop.hidden = true;
    });
    root.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      this._dragDepth = 0;
      this.$drop.hidden = true;
      if (this._canAttach()) this.addFiles(filesFromDataTransfer(e.dataTransfer));
    });
  }

  _render() {
    const labels = this._labels;
    this.$heading.textContent = this.getAttribute('heading') || '';
    this.$close.hidden = !this.closable;
    this.$close.setAttribute('aria-label', labels.close);
    this.$close.title = labels.close;
    this.$emptyTitle.textContent = this.getAttribute('empty-title') || '';
    this.$emptyText.textContent = this.getAttribute('empty-text') || '';
    this.$input.placeholder = this.getAttribute('placeholder') || '';
    this.$input.setAttribute('aria-label', this.getAttribute('placeholder') || labels.send);
    this.$input.disabled = this.disabled;
    this.$hint.textContent = this.getAttribute('hint') || '';
    this.$fileInput.accept = this.limits.accept;
    this.$attach.setAttribute('aria-label', labels.attach);
    this.$attach.title = labels.attachHint;
    this.$send.setAttribute('aria-label', labels.send);
    this.$send.title = labels.send;
    this.$stop.setAttribute('aria-label', labels.stop);
    this.$stop.title = labels.stop;
    this.$working.setAttribute('aria-label', labels.working);
    this.$errorClose.setAttribute('aria-label', labels.dismiss);
    this.$dropLabel.textContent = labels.drop;

    this.$empty.hidden = this._entries.length > 0;
    this.$suggestions.replaceChildren(...this._suggestions.map((text) => h(
      'button',
      {
        type: 'button', class: 'suggestion', part: 'suggestion', onClick: () => this.submit(text),
      },
      h('span', null, text),
      icon('send', 14),
    )));
    this.$working.hidden = !this.running;
    this.$errorText.textContent = this.error;
    this.$error.hidden = !this.error;
    this.$attachError.textContent = this._attachError;
    this.$attachError.hidden = !this._attachError;
    this.$mention.hidden = !this._mention;
    this.$refChips.replaceChildren(...this._references.map((ref) => this.renderReference(ref, { removable: true })));
    this._renderChips();
    if (this._entriesDirty) {
      this._entriesDirty = false;
      this._renderEntries();
    }
    this._renderControls();
    this.scrollToBottom();
  }

  _renderControls() {
    const assigned = (s) => s.assignedNodes({ flatten: true }).some((n) => n.nodeType === 1 || n.textContent.trim());
    this.$subhead.hidden = !assigned(this.$subhead.querySelector('slot'));
    this.$chips.hidden = !this._attachments.length && !this._references.length && !assigned(this.$chipSlot);
    this.$attach.hidden = this.hasAttribute('no-attachments');
    this.$attach.disabled = this.disabled;
    this.$stop.hidden = !this.running;
    this.$send.hidden = this.running;
    this.$send.disabled = this.disabled || !this.draft.trim();
  }

  _renderChips() {
    this.$fileChips.replaceChildren(...this._attachments.map((item) => h(
      'span',
      {
        class: ['chip', item.previewUrl && 'chip--image'], part: 'attachment', title: `${item.name} · ${formatBytes(item.size)}`, 'data-attachment-id': item.id,
      },
      item.previewUrl ? h('img', { class: 'thumb', src: item.previewUrl, alt: '' }) : icon(item.type.startsWith('image/') ? 'image' : 'file', 14),
      h('span', { class: 'chip-label' }, item.name),
      h('button', {
        type: 'button', class: 'chip-x', 'aria-label': `${this._labels.remove} ${item.name}`, onClick: () => this.removeAttachment(item.id),
      }, icon('close', 12)),
    )));
  }

  // Keyed by entry id: unchanged entries keep their nodes (and open <details>).
  _renderEntries() {
    const seen = new Set();
    const rows = this._entries.map((entry, index) => {
      let id = String(entry?.id ?? '');
      if (!id || seen.has(id)) id = `#${index}`;
      seen.add(id);
      let signature;
      try {
        signature = JSON.stringify(entry);
      } catch {
        signature = Symbol('unserializable');
      }
      const previous = this._nodes.get(id);
      if (previous && previous.signature === signature) return [id, previous];
      return [id, { signature, node: this._entryNode(entry, id, previous?.node) }];
    });
    this._nodes = new Map(rows);
    const list = this.$list;
    rows.forEach(([, { node }], i) => {
      if (list.children[i] !== node) list.insertBefore(node, list.children[i] || null);
    });
    while (list.children.length > rows.length) list.lastElementChild.remove();
  }

  _entryNode(entry, id, old) {
    const node = this.renderEntry(entry) || h('div', { class: 'entry-slot' }, h('slot', { name: `entry-${id}` }));
    node.dataset.entryId = id;
    if (old) {
      const open = new Set([old, ...old.querySelectorAll('details')].filter((d) => d.open && d.dataset?.key).map((d) => d.dataset.key));
      [node, ...node.querySelectorAll('details')].forEach((d) => {
        if (d.tagName === 'DETAILS' && open.has(d.dataset.key)) d.open = true;
      });
    }
    return node;
  }
}

export { DEFAULT_LIMITS, formatBytes, readAsBase64 };
