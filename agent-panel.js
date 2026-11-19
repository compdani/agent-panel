import { assetUrl } from './openai.mjs';
// <agent-panel>: a chat panel for an AI agent, as a framework-free custom element.
//
// The host owns the conversation and the network; the panel owns the composer. Set
// `entries` to show the transcript, listen for `agent-submit` to send. See README.md
// for the full API and how to extend it. This module defines no tag: index.js does.
import {
  DEFAULT_LIMITS, attachmentProblem, formatBytes, matchesAccept, nameFor, pastedFiles, filesFromDataTransfer, readAsBase64,
} from './attachments.mjs';
import { ICONS } from './icons.js';
import {
  inlineMarkdownToHTML, runsFromNode, runsFromText, runsToHTML, runsToMarkdown,
} from './richtext.mjs';
import { STYLES } from './styles.js';

// Importable (but inert) where there's no DOM, e.g. during server rendering.
const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;

const DEFAULT_LABELS = {
  add: 'Add',
  addContext: 'Add context',
  addFile: 'Add',
  attach: 'Attach files',
  attachFiles: 'Attach files',
  attachHint: 'Attach files (you can also paste or drop them)',
  attachLink: 'Attach link',
  cancel: 'Cancel',
  close: 'Close',
  compact: 'Compact conversation',
  compactHint: 'Older messages are summarized for the model. Your transcript stays as it is.',
  compacting: 'Compacting…',
  context: 'Context',
  contextSummarized: (when) => (when ? `Earlier messages summarized ${when}` : 'Earlier messages are summarized'),
  contextTokens: (used, window, estimated) => `${used} of ${window} tokens${estimated ? ' (estimated)' : ''}`,
  contextUsed: (percent) => `${percent}% of context used`,
  conversations: 'Conversations',
  defaultModel: 'Default',
  defaultModelNamed: (name) => `Default (${name})`,
  delete: 'Delete',
  deleteConversation: (title) => `Delete ${title}`,
  dismiss: 'Dismiss',
  drop: 'Drop files to attach',
  invalidLink: 'Enter a link that starts with http:// or https://',
  linkUrl: 'Link',
  loadMore: 'Load more',
  model: 'Model',
  newChat: 'New chat',
  noConversations: 'No conversations yet.',
  noModels: 'No matching models',
  options: 'Options',
  pasteContent: 'Text to attach',
  pasteName: 'File name',
  pasteText: 'Paste text',
  remove: 'Remove',
  resetOptions: 'Reset to defaults',
  searchModels: 'Search models',
  send: 'Send',
  stop: 'Stop',
  untitled: 'New chat',
  usedTools: (n) => `Used ${n} tools`,
  working: 'Working',
};

// The "+" menu's items when the host doesn't set `addMenu`. 'link' is left out because the
// backend has to accept asset links; hosts that do can add it.
const DEFAULT_ADD_MENU = ['attach', 'paste', 'context'];

// Models: 'gpt-x' or { id, label?, group?, description? }. Ids are strings.
function normalizeModels(list) {
  return (Array.isArray(list) ? list : []).map((m) => {
    if (typeof m === 'string' || typeof m === 'number') return { id: String(m) };
    return m && m.id != null ? { ...m, id: String(m.id) } : null;
  }).filter(Boolean);
}

// Options: { id, label, choices?, default?, description? }. With `choices` it's a pick-one
// list, otherwise an on/off toggle. Choices are 'value' or { value, label }.
function normalizeOptions(list) {
  return (Array.isArray(list) ? list : []).filter((o) => o && o.id != null).map((o) => {
    const choices = Array.isArray(o.choices)
      ? o.choices.map((c) => (c && typeof c === 'object' ? { value: c.value, label: c.label ?? String(c.value) } : { value: c, label: String(c) }))
      : null;
    return { ...o, id: String(o.id), label: o.label ?? String(o.id), type: choices ? 'select' : 'toggle', choices };
  });
}

function optionDefault(option) {
  if (option.type === 'toggle') return Boolean(option.default);
  return option.default !== undefined ? option.default : (option.choices[0]?.value ?? '');
}

const TEXT_TYPES = { csv: 'text/csv', json: 'application/json', md: 'text/markdown', tsv: 'text/tab-separated-values', html: 'text/html', xml: 'text/xml' };
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const extensionOf = (name) => (/\.([a-z0-9]+)$/i.exec(name || '')?.[1] || '').toLowerCase();

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

// A comparable snapshot of plain data; anything unserializable never compares equal.
function dataKey(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return Symbol('unserializable');
  }
}

// Conversation links may be relative or HTTP(S); anything else (javascript:, data:…) is
// dropped, and the row becomes a button.
export function safeHref(href) {
  if (href == null) return '';
  // Read the scheme the way the URL parser does: tabs and newlines removed, and
  // leading/trailing controls and spaces trimmed (so "java\tscript:" is still caught).
  const raw = String(href);
  const clean = raw.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');
  if (!clean) return '';
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(clean);
  if (!scheme) return raw; // Relative.
  return ['http', 'https'].includes(scheme[1].toLowerCase()) ? raw : '';
}

// Same day: the time; otherwise the date.
// 1234 -> "1.2k", 200000 -> "200k", 1000000 -> "1M": token counts for the context card.
export function formatTokens(n) {
  const value = Number(n) || 0;
  const short = (x, unit) => `${x >= 10 ? Math.round(x) : Math.round(x * 10) / 10}${unit}`;
  if (value >= 1e6) return short(value / 1e6, 'M');
  if (value >= 1e3) return short(value / 1e3, 'k');
  return String(Math.round(value));
}

// The context ring: a track and an arc that `set(share)` fills from the top, clockwise.
function contextRing() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ctx-ring');
  const circle = (cls) => {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '10');
    c.setAttribute('cy', '10');
    c.setAttribute('r', '7.5');
    c.setAttribute('class', cls);
    svg.append(c);
    return c;
  };
  circle('ctx-track');
  const arc = circle('ctx-arc');
  const length = 2 * Math.PI * 7.5;
  arc.setAttribute('stroke-dasharray', `${length} ${length}`);
  return {
    svg,
    set(share) { arc.setAttribute('stroke-dashoffset', String(length * (1 - Math.max(0, Math.min(1, share))))); },
  };
}

export function defaultFormatDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const opts = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString([], opts);
}

// The conversation rows shared by <agent-page>'s sidebar and <agent-panel>'s switcher: a
// title (a real link when the row has a safe href), its date, a Delete that asks once, and
// a "Load more" button while `hasMore` is set. The host element owns the data.
class ConversationList {
  constructor(host) {
    this.host = host;
    this.confirming = '';
    this.key = null;
    this.labels = null;
    this.$empty = h('p', { class: 'conv-empty' });
    this.$more = h('button', {
      type: 'button', class: 'btn btn--sm conv-more', part: 'load-more', onClick: () => host._emit('agent-load-more'),
    });
    this.el = h('div', { class: 'conv-list', part: 'conversation-list' });
  }

  // Rows are rebuilt only when what they show changes, so focus and clicks in the list
  // survive redraws caused by the transcript.
  render() {
    const host = this.host;
    const labels = host.labels;
    const list = host._conversations;
    const format = host._formatDate;
    const more = host.hasMore;
    const key = dataKey([list, host.active, this.confirming, more, list.map((c) => (c.updated ? format(c.updated) : ''))]);
    if (key === this.key && labels === this.labels) return;
    this.key = key;
    this.labels = labels;
    this.$empty.textContent = labels.noConversations;
    this.$more.textContent = labels.loadMore;
    this.el.replaceChildren(...(list.length ? list.map((c) => this.row(c)) : [this.$empty]), ...(more ? [this.$more] : []));
  }

  // The row to focus when the list opens: the open conversation, else the first one.
  focusTarget() {
    return this.el.querySelector('[aria-current="page"]') || this.el.querySelector('.conv-link, .conv-more');
  }

  focusRow(id, selector) {
    const row = Array.from(this.el.children).find((el) => el.dataset.conversationId === id);
    row?.querySelector(selector)?.focus();
  }

  row(conversation) {
    const host = this.host;
    const labels = host.labels;
    const id = String(conversation.id);
    const title = conversation.title || labels.untitled;
    const confirming = this.confirming === id;
    const active = id === host.active;
    const href = safeHref(conversation.href);
    const link = href
      ? h('a', { class: 'conv-link', href, title })
      : h('button', { type: 'button', class: 'conv-link', title });
    link.textContent = title;
    if (active) link.setAttribute('aria-current', 'page');
    link.addEventListener('click', (e) => host._onConversationSelect(conversation, e));
    const tail = confirming
      ? [
        h('button', {
          type: 'button',
          class: 'btn btn--danger btn--sm',
          'data-action': 'confirm-delete',
          onClick: () => {
            this.confirming = '';
            host._emit('agent-delete-conversation', { id: conversation.id, conversation });
            this.render();
            host._afterConversationDelete();
          },
        }, labels.delete),
        h('button', {
          type: 'button',
          class: 'btn btn--icon',
          'aria-label': labels.cancel,
          onClick: () => {
            this.confirming = '';
            this.render();
            this.focusRow(id, '.conv-link');
          },
        }, icon('close', 14)),
      ]
      : [
        h('span', { class: 'conv-when' }, conversation.updated ? host._formatDate(conversation.updated) : ''),
        h('button', {
          type: 'button',
          class: 'btn btn--icon conv-del',
          'aria-label': labels.deleteConversation(title),
          'data-action': 'delete',
          onClick: () => {
            this.confirming = id;
            this.render();
            this.focusRow(id, '[data-action="confirm-delete"]');
          },
        }, icon('delete', 15)),
      ];
    return h('div', {
      class: ['conv', active && 'conv--active', confirming && 'conv--confirm'], part: 'conversation', 'data-conversation-id': id,
    }, link, tail);
  }
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
      'no-attachments', 'accept', 'error', 'allow-empty-text', 'mention-trigger', 'no-add-menu', 'default-model', 'no-default-model',
      'plain-text', 'active', 'has-more', 'conversations-menu', 'context-threshold'];
  }

  static define(tag = this.tagName, registry = globalThis.customElements) {
    if (registry && !registry.get(tag)) registry.define(tag, this);
    return this;
  }

  static readAsBase64 = readAsBase64;

  // Whether the `conversations-menu` attribute shows the conversation switcher under the
  // header. <agent-page> turns it off: its sidebar shows the same list.
  static conversationSwitcher = true;

  constructor() {
    super();
    this._entries = [];
    this._suggestions = [];
    this._attachments = [];
    this._attachmentStates = new Map();
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
    this._models = [];
    this._model = '';
    this._options = [];
    this._optionValues = {};
    this._addMenu = null;
    this._menu = null; // { name: 'add' | 'model' | 'options', view, query } while one is open
    this._conversations = [];
    this._formatDate = defaultFormatDate;
    this._switcherOpen = false;
    this._contextUsage = null;
    this._contextOpen = false;
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

  // The composer's text. In the rich-text editor (the default) bold and italic read as
  // markdown (**bold**, *italic*); setting markdown shows it formatted.
  get draft() {
    return this._plain() ? this.$textarea.value : runsToMarkdown(runsFromNode(this.$editor));
  }

  set draft(value) {
    const text = String(value ?? '');
    if (this._plain()) {
      this.$textarea.value = text;
      this._grow();
    } else {
      this.$editor.innerHTML = inlineMarkdownToHTML(text, { breaks: true });
    }
    this._schedule();
  }

  // The element typed into: the rich-text editor, or the textarea with `plain-text`.
  get $input() { return this._plain() ? this.$textarea : this.$editor; }

  // What's waiting in the composer: [{ id, file, name, type, size, previewUrl, base64() }].
  get attachments() { return this._attachments.slice(); }

  // Things from the host app the next message refers to: [{ type, id, label?, ...any }].
  // Shown as chips beside the attachments, sent with `agent-submit`, then cleared.
  get references() { return this._references.slice(); }

  set references(value) {
    this._references = normalizeReferences(value);
    this._schedule();
  }

  // The model menu: ['id', …] or [{ id, label?, group?, description? }]. Empty hides it.
  get models() { return this._models.slice(); }

  set models(value) {
    this._models = normalizeModels(value);
    this._schedule();
  }

  // The chosen model's id; '' means the default (see `default-model`).
  get model() { return this._model; }

  set model(value) {
    this._model = value == null ? '' : String(value);
    this._schedule();
  }

  // The options menu: [{ id, label, choices?, default?, description? }]. Empty hides it.
  get options() { return this._options.slice(); }

  set options(value) {
    this._options = normalizeOptions(value);
    this._schedule();
  }

  // Every option's current value, defaults included: { [id]: value }. Setting it replaces
  // the chosen values; options left out go back to their defaults.
  get optionValues() {
    return Object.fromEntries(this._options.map((o) => [o.id, o.id in this._optionValues ? this._optionValues[o.id] : optionDefault(o)]));
  }

  set optionValues(value) {
    this._optionValues = { ...(value && typeof value === 'object' ? value : {}) };
    this._schedule();
  }

  // The "+" menu: built-in names ('attach', 'paste', 'context', 'link') and the host's own
  // items { id, label, icon?, group?, reference?, disabled? }. Null restores the defaults.
  get addMenu() { return (this._addMenu || DEFAULT_ADD_MENU).slice(); }

  set addMenu(value) {
    this._addMenu = Array.isArray(value) ? value.slice() : null;
    this._schedule();
  }

  // { open, query } while the person is typing a mention (see `mention-trigger`).
  get mention() {
    return { open: Boolean(this._mention), query: this._mention?.query ?? '' };
  }

  get limits() {
    const num = (attr, fallback) => {
      const raw = (this.getAttribute(attr) ?? '').trim();
      const n = Number(raw);
      return raw && Number.isFinite(n) && n >= 0 ? n : fallback;
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

  // The conversation list: [{ id, title, updated?, href? }]. <agent-page> shows it in its
  // sidebar; <agent-panel> shows it in the switcher when `conversations-menu` is set.
  get conversations() { return this._conversations.slice(); }

  set conversations(value) {
    this._conversations = Array.isArray(value) ? value.filter((c) => c && c.id != null) : [];
    this._schedule();
  }

  // The id of the open conversation (reflects the `active` attribute).
  get active() { return this.getAttribute('active') || ''; }

  set active(value) { this._reflect('active', value == null ? '' : String(value)); }

  // More conversations exist than `conversations` holds: the list ends with "Load more",
  // which fires `agent-load-more` (reflects the `has-more` attribute).
  get hasMore() { return this.hasAttribute('has-more'); }

  set hasMore(value) { this.toggleAttribute('has-more', Boolean(value)); }

  // (value) => string for the dates in the conversation list.
  get formatDate() { return this._formatDate; }

  set formatDate(fn) {
    this._formatDate = typeof fn === 'function' ? fn : defaultFormatDate;
    this._schedule();
  }

  // How full the conversation's context is: { used, window, estimated?, summarizedAt?,
  // compacting?, canCompact? } in tokens, or null. The composer shows a small ring once
  // used / window reaches `context-threshold`; it opens a card with a Compact button.
  get contextUsage() { return this._contextUsage; }

  set contextUsage(value) {
    const used = Number(value?.used);
    const window = Number(value?.window);
    this._contextUsage = value && typeof value === 'object' && window > 0 && used >= 0 ? { ...value, used, window } : null;
    this._schedule();
  }

  // The share of the window (0–1) at which the context ring appears. Default 0.6.
  get contextThreshold() {
    const n = Number.parseFloat(this.getAttribute('context-threshold'));
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.6;
  }

  set contextThreshold(value) { this._reflect('context-threshold', value == null ? '' : String(value)); }

  get closable() { return this.hasAttribute('closable'); }

  set closable(value) { this.toggleAttribute('closable', Boolean(value)); }

  // ---- Methods ----------------------------------------------------------------------

  // Renders entries of `type` with fn(entry, panel) => Node, without subclassing.
  // Opens or closes the conversation switcher (only while `conversations-menu` is set).
  openConversations() { this._setSwitcher(true); }

  closeConversations() { this._setSwitcher(false); }

  // Opens or closes the context card (only while the context ring has something to show).
  openContextUsage() { this._setContextCard(true); }

  closeContextUsage() { this._setContextCard(false); }

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
    this._attachmentStates.delete(id);
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    this._attachError = '';
    this._attachmentsChanged();
    this._schedule();
  }

  clearAttachments() {
    if (!this._attachments.length) return;
    this._attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    this._attachments = [];
    this._attachmentStates.clear();
    this._attachError = '';
    this._attachmentsChanged();
    this._schedule();
  }

  // Marks an attachment's chip as uploading ({ busy: true }) or failed ({ error: 'why' }).
  // Pass null (or {}) to return the chip to normal.
  setAttachmentState(id, state) {
    if (!this._attachments.some((a) => a.id === id)) return;
    const busy = Boolean(state?.busy);
    const error = state?.error ? String(state.error) : '';
    const item = this._attachments.find((a) => a.id === id);
    if (busy || error) {
      this._attachmentStates.set(id, { busy, error });
      item.state = { busy, error };
    }
    else {
      this._attachmentStates.delete(id);
      delete item.state;
    }
    this._schedule();
  }

  // Adds a reference chip. While a mention is open, the typed "@query" is replaced by it.
  addReference(ref) {
    if (!ref || ref.type == null || ref.id == null) return false;
    if (this._mention && this._mention.from >= 0) {
      const { from, query, node } = this._mention;
      const end = from + this._trigger().length + query.length;
      if (node) {
        // Rich text: cut "@query" out of the text node it was typed in.
        if (this.$editor.contains(node)) {
          const range = document.createRange();
          range.setStart(node, Math.min(from, node.length));
          range.setEnd(node, Math.min(end, node.length));
          range.deleteContents();
          this.$editor.focus();
          this._setCaret(range);
        }
      } else {
        const text = this.draft;
        this.draft = text.slice(0, from) + text.slice(end);
        this.$input.setSelectionRange(from, from);
      }
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
    if (this.running || this.disabled || !(message || (fromDraft && this._canSendEmpty()))) return false;
    const accepted = this._emit('agent-submit', {
      text: message, attachments: this.attachments, references: this.references, fromDraft, model: this._model, options: this.optionValues,
    }, { cancelable: true });
    if (accepted) this.clearComposer({ draft: fromDraft, attachments: !this.hasAttribute('sticky-attachments') });
    return accepted;
  }

  // The cleanup an accepted submit does, for hosts that cancel `agent-submit` and send
  // later (e.g. after uploading). Each part can be kept by passing false.
  clearComposer({ draft = true, attachments = true, references = true } = {}) {
    if (draft) this.draft = '';
    if (attachments) this.clearAttachments();
    if (references && this._references.length) {
      this._references = [];
      this._referencesChanged();
    }
    this.closeMention();
    this.scrollToBottom({ force: true });
  }

  focus(options) {
    // A contenteditable focused from elsewhere puts the caret at the start; put it at
    // the end, as a textarea does, unless the caret was already inside the editor.
    const wasInside = this._plain() || Boolean(this._editorRange());
    this.$input.focus(options);
    if (!wasInside) {
      const end = document.createRange();
      end.selectNodeContents(this.$editor);
      end.collapse(false);
      this._setCaret(end);
    }
  }

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
    if (!entry.content && !entry.references?.length && !entry.assets?.length) return h('div', { hidden: true });
    if (entry.role === 'user') {
      // Bold and italic from the composer show as formatting; everything else is text.
      const bubble = entry.content ? h('div', { class: 'bubble', part: 'bubble', 'data-role': 'user', html: inlineMarkdownToHTML(entry.content) }) : null;
      const refs = normalizeReferences([...(entry.references || []), ...(entry.assets || [])]);
      if (!refs.length) return bubble || h('div', { hidden: true });
      return h('div', { class: 'user-turn', 'data-role': bubble ? null : 'user' }, h('div', { class: 'chips chips--end' }, refs.map((ref) => this.renderReference(ref))), bubble);
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
        ref.type === 'asset' && String(ref.mimeType || '').startsWith('image/') && assetUrl(ref.url)
          ? h('img', { class: 'thumb', src: assetUrl(ref.url), alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' })
          : this.referenceIcon(ref),
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
    this._upgradeProperties(['entries', 'suggestions', 'markdown', 'labels', 'draft', 'references', 'error', 'running', 'disabled', 'closable',
      'models', 'model', 'options', 'optionValues', 'addMenu', 'conversations', 'active', 'hasMore', 'formatDate',
      'contextUsage', 'contextThreshold']);
    if (!this._resize && typeof ResizeObserver !== 'undefined') {
      this._resize = new ResizeObserver(() => this.scrollToBottom());
      this._resize.observe(this.$inner);
    }
    if (this._previewsRevoked) {
      // Removed earlier and its previews released: make them again.
      this._previewsRevoked = false;
      this._attachments.forEach((a) => {
        if (!a.previewUrl) return;
        URL.revokeObjectURL(a.previewUrl); // Harmless if already revoked; frees one made while detached.
        a.previewUrl = URL.createObjectURL(a.file);
      });
      this._chipsKey = null;
    }
    this._render();
  }

  disconnectedCallback() {
    this._resize?.disconnect();
    this._resize = null;
    if (this._menu) this._closeMenu({ focus: false });
    this._setSwitcher(false, { focus: false });
    this._setContextCard(false, { focus: false });
    // A move disconnects and reconnects in one task; only release previews if it stays out.
    queueMicrotask(() => {
      if (this.isConnected || this._previewsRevoked) return;
      this._previewsRevoked = true;
      this._attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    });
  }

  attributeChangedCallback(name, previous, value) {
    if (name === 'plain-text' && (previous === null) !== (value === null) && this.$editor) {
      // Carry the draft across when switching between the editor and the textarea.
      if (value === null) this.$editor.innerHTML = inlineMarkdownToHTML(this.$textarea.value, { breaks: true });
      else {
        this.$textarea.value = runsToMarkdown(runsFromNode(this.$editor));
        this._grow();
      }
    }
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

  // With `allow-empty-text`, attachments or references alone are enough to send.
  _canSendEmpty() {
    return this.hasAttribute('allow-empty-text') && (this._attachments.length > 0 || this._references.length > 0);
  }

  _trigger() {
    return this.getAttribute('mention-trigger') || '';
  }

  _setMention(next) {
    const was = this._mention;
    this._mention = next;
    if (!was && !next) return;
    // Only open, close and query changes are news; a moved trigger (`from`) is not.
    if (was && next && was.query === next.query) return;
    this._emit('agent-mention', this.mention);
    this._schedule();
  }

  // Opens, updates or closes the mention as the person types after the trigger.
  _trackMention() {
    const trigger = this._trigger();
    if (!trigger) return;
    const t = escapeRegExp(trigger);
    const pattern = new RegExp(`(^|\\s)${t}([^\\s${t}]*)$`);
    if (this._plain()) {
      const caret = this.$textarea.selectionStart ?? this.draft.length;
      const match = this.draft.slice(0, caret).match(pattern);
      if (match) return this._setMention({ query: match[2], from: caret - match[2].length - trigger.length });
    } else {
      // Rich text: match within the text node holding the caret.
      const range = this._editorRange();
      let node = range?.collapsed ? range.startContainer : null;
      let offset = range?.startOffset ?? 0;
      // WebKit can leave the caret between nodes (editor, 1) rather than in the text.
      if (node?.nodeType === 1 && node.childNodes[offset - 1]?.nodeType === 3) {
        node = node.childNodes[offset - 1];
        offset = node.length;
      }
      if (node?.nodeType === 3) {
        const match = node.data.slice(0, offset).match(pattern);
        if (match) return this._setMention({ query: match[2], from: offset - match[2].length - trigger.length, node });
      }
    }
    if (this._mention && this._mention.from >= 0) this._setMention(null);
  }

  // Every entry is redrawn, but the old nodes stay around so open <details> carry over.
  _rerenderEntries() {
    this._nodes.forEach((row) => { row.signature = Symbol('stale'); });
    this._chipsKey = null;
    this._suggestionsKey = null;
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

  _plain() {
    return this.hasAttribute('plain-text');
  }

  // The caret or selection inside the editor as a Range, or null. Chromium has
  // shadowRoot.getSelection; Safari and Firefox expose selections inside a shadow root
  // through getComposedRanges (document.getSelection() alone points at the host there).
  _editorRange() {
    let found = null;
    if (this.shadowRoot.getSelection) {
      const sel = this.shadowRoot.getSelection();
      if (sel?.rangeCount) found = sel.getRangeAt(0);
    } else {
      const sel = document.getSelection();
      if (sel?.getComposedRanges) {
        try {
          [found] = sel.getComposedRanges({ shadowRoots: [this.shadowRoot] });
        } catch {
          try { [found] = sel.getComposedRanges(this.shadowRoot); } catch { found = null; }
        }
      }
      if (!found && sel?.rangeCount) found = sel.getRangeAt(0);
    }
    if (!found || !this.$editor.contains(found.startContainer) || !this.$editor.contains(found.endContainer)) return null;
    // getComposedRanges gives a StaticRange, which goes stale when the text changes.
    const range = document.createRange();
    try {
      range.setStart(found.startContainer, found.startOffset);
      range.setEnd(found.endContainer, found.endOffset);
    } catch {
      return null;
    }
    return range;
  }

  _setCaret(range) {
    const sel = this.shadowRoot.getSelection ? this.shadowRoot.getSelection() : document.getSelection();
    if (!sel) return;
    if (sel.setBaseAndExtent) sel.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
    else {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // Inserts runs at `at` (or the caret, or the end) as editor HTML. insertHTML keeps the
  // browser's undo history; where it isn't supported, the runs are inserted directly.
  _insertRuns(runs, at = null) {
    if (!runs.length) return;
    const editor = this.$editor;
    editor.focus();
    let range = at || this._editorRange();
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    this._setCaret(range);
    const html = runsToHTML(runs);
    let done = false;
    try {
      // Trust its answer: replacing a selection with the same text changes nothing visible.
      done = document.execCommand('insertHTML', false, html);
    } catch {
      done = false;
    }
    if (!done) {
      range.deleteContents();
      const fragment = range.createContextualFragment(html);
      const last = fragment.lastChild;
      range.insertNode(fragment);
      if (last) {
        range.setStartAfter(last);
        range.collapse(true);
        this._setCaret(range);
      }
    }
    this._onInput();
  }

  // Text from a clipboard or drop: bold and italic from its HTML, else its plain text.
  _runsFrom(data) {
    const html = data.getData('text/html');
    const runs = html ? runsFromNode(new DOMParser().parseFromString(html, 'text/html').body, { collapse: true }) : [];
    return runs.length ? runs : runsFromText(data.getData('text/plain'));
  }

  _onInput() {
    this._grow();
    this._trackMention();
    this._renderControls();
  }

  // Pasted rich text keeps its bold and italic; everything else becomes plain text.
  // Files go to the panel's own paste handling when they can be attached; otherwise only
  // the clipboard's text is used, so the browser never inserts an image or raw HTML.
  _onEditorPaste(e) {
    const data = e.clipboardData;
    if (!data) return;
    if (pastedFiles(data).length && this._canAttach()) return;
    e.preventDefault();
    if (this.disabled) return;
    this._insertRuns(this._runsFrom(data));
  }

  // Dropped text goes where it was dropped (the event's target range), reduced like a paste.
  _onEditorDrop(e) {
    e.preventDefault();
    if (this.disabled || !e.dataTransfer) return;
    const target = e.getTargetRanges?.()[0];
    let range = null;
    if (target && this.$editor.contains(target.startContainer)) {
      range = document.createRange();
      range.setStart(target.startContainer, target.startOffset);
      range.setEnd(target.endContainer, target.endOffset);
    }
    const runs = this._runsFrom(e.dataTransfer); // Readable only during the event.
    queueMicrotask(() => this._insertRuns(runs, range));
  }

  _grow() {
    if (this._plain() === false) return;
    const el = this.$textarea;
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
    const rich = e.currentTarget === this.$editor;
    if (rich && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === 'b' || key === 'i') {
        e.preventDefault();
        document.execCommand(key === 'b' ? 'bold' : 'italic');
        this._onInput();
        return;
      }
      if (key === 'u') {
        e.preventDefault(); // Markdown has no underline.
        return;
      }
    }
    // Safari ends IME composition with an Enter whose isComposing is false but keyCode 229.
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    if (!e.shiftKey) {
      e.preventDefault();
      this.submit();
    } else if (rich) {
      // A <br>, not the <div> browsers make for a new line.
      e.preventDefault();
      document.execCommand('insertLineBreak');
      this._onInput();
    }
  }

  _build() {
    const slot = (name, ...fallback) => h('slot', { name }, ...fallback);
    this.$heading = h('span', { class: 'heading', part: 'heading' });
    this.$close = h('button', { type: 'button', class: 'btn btn--icon', part: 'close', onClick: () => this._emit('agent-close') }, icon('close'));
    this.$subhead = h('div', { class: 'subhead', part: 'subheader', hidden: true }, slot('subheader'));
    this._convList = new ConversationList(this);
    this.$switchLabel = h('span', { class: 'switch-label' });
    this.$switchButton = h('button', {
      type: 'button',
      class: 'switch-btn',
      part: 'switcher-button',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      onClick: () => this._setSwitcher(!this._switcherOpen),
      onKeydown: (e) => {
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !this._switcherOpen) {
          e.preventDefault();
          this._setSwitcher(true);
        }
      },
    }, this.$switchLabel, icon('chevron-down', 16));
    this.$switchNew = h('button', {
      type: 'button',
      class: 'btn btn--icon',
      part: 'switcher-new',
      hidden: true,
      onClick: () => {
        this._setSwitcher(false, { focus: false });
        this._emit('agent-new-conversation');
      },
    }, icon('plus'));
    this.$switchPop = h('div', {
      class: 'switch-pop', part: 'switcher-menu', hidden: true, onKeydown: (e) => this._onSwitcherKeydown(e),
    }, h('div', { class: 'switch-list' }, this._convList.el), this.$switchEnd = h('div', { class: 'switch-end', hidden: true }, slot('switcher-end')));
    // The switcher is the header's title: the open conversation and a chevron, with New
    // chat beside Close.
    this.$switcher = h('div', { class: 'switcher', part: 'switcher', hidden: true }, this.$switchButton, this.$switchPop);
    this.$head = h('div', { class: 'head' }, slot('header-start', this.$heading), this.$switcher, h('div', { class: 'spacer' }), slot('header-actions'), this.$switchNew, this.$close);
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
    this.$textarea = h('textarea', {
      class: 'input',
      part: 'input',
      rows: 1,
      hidden: true,
      onInput: () => this._onInput(),
      onKeydown: (e) => this._onKeydown(e),
    });
    // The default composer: rich text limited to bold and italic, read back as markdown.
    this.$editor = h('div', {
      class: 'input input--rich is-empty',
      part: 'input',
      contenteditable: 'true',
      role: 'textbox',
      'aria-multiline': 'true',
      spellcheck: 'true',
      onInput: () => this._onInput(),
      onKeydown: (e) => this._onKeydown(e),
      onPaste: (e) => this._onEditorPaste(e),
      // Only bold and italic: other formatting (menus, touch bars) is refused.
      onBeforeinput: (e) => {
        const type = e.inputType || '';
        if (type === 'insertFromDrop') return this._onEditorDrop(e);
        if ((type.startsWith('format') && !['formatBold', 'formatItalic', 'formatRemove'].includes(type))
          || ['insertOrderedList', 'insertUnorderedList', 'insertHorizontalRule', 'insertLink'].includes(type)) e.preventDefault();
      },
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
    const trigger = (name, part, cls, ...content) => h('button', {
      type: 'button',
      class: cls,
      part,
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      'data-menu': name,
      onClick: () => this._toggleMenu(name),
      // A press moves focus from the menu to its trigger before the click toggles it.
      onPointerdown: () => {
        this._pressingTrigger = true;
        setTimeout(() => { this._pressingTrigger = false; });
      },
      onKeydown: (e) => {
        if (e.key === 'Escape' && this._menu?.name === name) {
          e.preventDefault();
          e.stopPropagation();
          this._closeMenu({ focus: false });
        } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !this._menu) {
          e.preventDefault();
          this._openMenu(name);
        }
      },
    }, ...content);
    // "attach" stays in the part list so hosts' ::part(attach) styles still apply.
    this.$add = trigger('add', 'add-menu attach', 'btn btn--icon', icon('plus'));
    this.$optionsButton = trigger('options', 'options-menu', 'btn btn--icon', icon('tune'));
    this.$modelLabel = h('span', { class: 'model-label' });
    this.$modelButton = trigger('model', 'model-menu', 'btn btn--tonal btn--sm model-trigger', this.$modelLabel, icon('chevron-down', 16));
    this.$popover = h('div', {
      class: 'menu-pop', part: 'menu', hidden: true, onKeydown: (e) => this._onMenuKeydown(e),
      // Tabbing (or clicking) somewhere else closes the menu.
      onFocusout: (e) => {
        const to = e.relatedTarget;
        const toTrigger = to === this._trigger$(this._menu?.name);
        if (this._menu && to && !this.$popover.contains(to) && !(toTrigger && this._pressingTrigger)) this._closeMenu({ focus: false });
      },
    });
    this.$hint = h('span', { class: 'hint', part: 'hint' });
    this.$ctxRing = contextRing();
    this.$ctxButton = h('button', {
      type: 'button',
      class: 'btn btn--icon ctx-btn',
      part: 'context-usage-button',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      onClick: () => this._setContextCard(!this._contextOpen),
    }, this.$ctxRing.svg);
    this.$ctxUsed = h('div', { class: 'ctx-used' });
    this.$ctxTokens = h('div', { class: 'ctx-tokens' });
    this.$ctxSummary = h('div', { class: 'ctx-summary' });
    this.$ctxCompact = h('button', {
      type: 'button', class: 'btn btn--tonal btn--sm ctx-compact', part: 'context-compact',
      onClick: () => this._emit('agent-compact'),
    });
    this.$ctxHint = h('p', { class: 'ctx-hint' });
    this.$ctxCard = h('div', {
      class: 'ctx-card', part: 'context-usage-card', role: 'dialog', hidden: true,
      onKeydown: (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        this._setContextCard(false);
        this.$ctxButton.focus();
      },
    }, this.$ctxUsed, this.$ctxTokens, this.$ctxSummary, this.$ctxCompact, this.$ctxHint);
    this.$ctx = h('div', { class: 'ctx', part: 'context-usage', hidden: true }, this.$ctxButton, this.$ctxCard);
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
      h('div', { class: 'box' }, this.$mention, this.$popover, this.$editor, this.$textarea, h(
        'div',
        { class: 'row' },
        this.$add, this.$attach, slot('composer-actions'), this.$hint, h('div', { class: 'spacer' }),
        this.$ctx, this.$optionsButton, this.$modelButton, this.$stop, this.$send,
      )),
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

  _showSwitcher() {
    return this.constructor.conversationSwitcher && this.hasAttribute('conversations-menu');
  }

  // A row was clicked. Returns true when it counts as a selection (a plain left click),
  // so subclasses can close their own containers. Modifier and non-left clicks are the
  // browser's (new tab on links); they select nothing.
  _onConversationSelect(conversation, e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    const href = safeHref(conversation.href);
    const accepted = this._emit('agent-select-conversation', { id: conversation.id, conversation }, { cancelable: true });
    if (!accepted || !href) e.preventDefault();
    this._convList.confirming = '';
    this._setSwitcher(false, { focus: false });
    return true;
  }

  // After a confirmed delete the row stays until the host updates `conversations`; keep
  // focus inside the list instead of losing it with the removed button.
  _afterConversationDelete() {
    if (this._switcherOpen) this._convList.focusTarget()?.focus();
  }

  _setSwitcher(open, { focus = true } = {}) {
    const next = Boolean(open) && this._showSwitcher();
    if (next === this._switcherOpen) return;
    this._switcherOpen = next;
    this._convList.confirming = '';
    this.$switchButton.setAttribute('aria-expanded', String(next));
    this.$switchPop.hidden = !next;
    if (next) {
      if (this._menu) this._closeMenu({ focus: false });
      this._onSwitcherOutside = (e) => {
        if (!e.composedPath().includes(this.$switcher)) this._setSwitcher(false, { focus: false });
      };
      document.addEventListener('pointerdown', this._onSwitcherOutside, true);
      this._convList.render();
      this._convList.focusTarget()?.focus();
      return;
    }
    if (this._onSwitcherOutside) document.removeEventListener('pointerdown', this._onSwitcherOutside, true);
    this._onSwitcherOutside = null;
    if (focus && this.$switchPop.contains(this.shadowRoot.activeElement)) this.$switchButton.focus();
  }

  // The share of the window in use, or null when the ring has nothing to show.
  _contextShare() {
    const usage = this._contextUsage;
    if (!usage) return null;
    return Math.min(1, usage.used / usage.window);
  }

  _setContextCard(open, { focus = true } = {}) {
    const next = Boolean(open) && this._contextShare() !== null;
    if (next === this._contextOpen) return;
    this._contextOpen = next;
    this.$ctxButton.setAttribute('aria-expanded', String(next));
    this.$ctxCard.hidden = !next;
    if (next) {
      if (this._menu) this._closeMenu({ focus: false });
      this._setSwitcher(false, { focus: false });
      this._onContextOutside = (e) => {
        if (!e.composedPath().includes(this.$ctx)) this._setContextCard(false, { focus: false });
      };
      document.addEventListener('pointerdown', this._onContextOutside, true);
      this._renderContext();
      return;
    }
    if (this._onContextOutside) document.removeEventListener('pointerdown', this._onContextOutside, true);
    this._onContextOutside = null;
    if (focus && this.$ctxCard.contains(this.shadowRoot.activeElement)) this.$ctxButton.focus();
    this._renderContext();
  }

  _renderContext() {
    const share = this._contextShare();
    // The ring stays while its card is open, so a compaction that drops the share below
    // the threshold shows its result instead of vanishing.
    const show = share !== null && (share >= this.contextThreshold || this._contextOpen);
    this.$ctx.hidden = !show;
    if (!show) {
      if (this._contextOpen) this._setContextCard(false, { focus: false });
      return;
    }
    const labels = this._labels;
    const usage = this._contextUsage;
    const percent = Math.round(share * 100);
    const level = share >= 0.95 ? 'critical' : share >= 0.8 ? 'high' : 'normal';
    this.$ctx.dataset.level = level;
    this.$ctx.classList.toggle('ctx--busy', Boolean(usage.compacting));
    this.$ctxRing.set(share);
    const name = `${labels.context}: ${labels.contextUsed(percent)}`;
    this.$ctxButton.setAttribute('aria-label', name);
    this.$ctxButton.title = name;
    this.$ctxCard.setAttribute('aria-label', labels.context);
    this.$ctxUsed.textContent = labels.contextUsed(percent);
    this.$ctxTokens.textContent = labels.contextTokens(formatTokens(usage.used), formatTokens(usage.window), Boolean(usage.estimated));
    const summarized = usage.summarizedAt ? labels.contextSummarized(this._formatDate(usage.summarizedAt)) : '';
    this.$ctxSummary.textContent = summarized;
    this.$ctxSummary.hidden = !summarized;
    const canCompact = usage.canCompact !== false;
    this.$ctxCompact.hidden = !canCompact;
    this.$ctxHint.hidden = !canCompact;
    this.$ctxCompact.textContent = usage.compacting ? labels.compacting : labels.compact;
    this.$ctxCompact.disabled = Boolean(usage.compacting) || this.running || this.disabled;
    this.$ctxHint.textContent = labels.compactHint;
  }

  _onSwitcherKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this._setSwitcher(false);
      this.$switchButton.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(this.$switchPop.querySelectorAll('.conv-link, .conv-more'));
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(this.shadowRoot.activeElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next = at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length;
    items[next].focus();
  }

  _renderSwitcher() {
    const show = this._showSwitcher();
    this.$switcher.hidden = !show;
    this.$switchNew.hidden = !show;
    this.$heading.hidden = show;
    if (!show) {
      this._setSwitcher(false, { focus: false });
      return;
    }
    const labels = this._labels;
    const current = this._conversations.find((c) => String(c.id) === this.active);
    const title = current?.title || labels.untitled;
    this.$switchLabel.textContent = title;
    this.$switchButton.setAttribute('aria-label', `${labels.conversations}: ${title}`);
    this.$switchButton.title = labels.conversations;
    this.$switchNew.setAttribute('aria-label', labels.newChat);
    this.$switchNew.title = labels.newChat;
    this.$switchPop.setAttribute('aria-label', labels.conversations);
  }

  _render() {
    const labels = this._labels;
    this.$heading.textContent = this.getAttribute('heading') || '';
    this.$close.hidden = !this.closable;
    this.$close.setAttribute('aria-label', labels.close);
    this.$close.title = labels.close;
    this._renderSwitcher();
    this._convList.render();
    this.$emptyTitle.textContent = this.getAttribute('empty-title') || '';
    this.$emptyText.textContent = this.getAttribute('empty-text') || '';
    const plain = this._plain();
    const placeholder = this.getAttribute('placeholder') || '';
    this.$textarea.hidden = !plain;
    this.$editor.hidden = plain;
    this.$textarea.placeholder = placeholder;
    this.$textarea.disabled = this.disabled;
    this.$editor.dataset.placeholder = placeholder;
    this.$editor.setAttribute('aria-placeholder', placeholder);
    this.$editor.contentEditable = this.disabled ? 'false' : 'true';
    this.$editor.setAttribute('aria-disabled', String(this.disabled));
    [this.$textarea, this.$editor].forEach((el) => el.setAttribute('aria-label', placeholder || labels.send));
    this.$hint.textContent = this.getAttribute('hint') || '';
    this.$fileInput.accept = this.limits.accept;
    this.$attach.setAttribute('aria-label', labels.attach);
    this.$attach.title = labels.attachHint;
    this.$add.setAttribute('aria-label', labels.add);
    this.$add.title = labels.add;
    this.$optionsButton.setAttribute('aria-label', labels.options);
    this.$optionsButton.title = labels.options;
    this.$modelLabel.textContent = this._modelName();
    this.$modelButton.setAttribute('aria-label', `${labels.model}: ${this._modelName()}`);
    this.$modelButton.title = labels.model;
    this.$send.setAttribute('aria-label', labels.send);
    this.$send.title = labels.send;
    this.$stop.setAttribute('aria-label', labels.stop);
    this.$stop.title = labels.stop;
    this.$working.setAttribute('aria-label', labels.working);
    this.$errorClose.setAttribute('aria-label', labels.dismiss);
    this.$dropLabel.textContent = labels.drop;

    this.$empty.hidden = this._entries.length > 0;
    const suggestionsKey = dataKey(this._suggestions);
    if (suggestionsKey !== this._suggestionsKey) this.$suggestions.replaceChildren(...this._suggestions.map((text) => h(
      'button',
      {
        type: 'button', class: 'suggestion', part: 'suggestion', onClick: () => this.submit(text),
      },
      h('span', null, text),
      icon('send', 14),
    )));
    this._suggestionsKey = suggestionsKey;
    this.$working.hidden = !this.running;
    this.$errorText.textContent = this.error;
    this.$error.hidden = !this.error;
    this.$attachError.textContent = this._attachError;
    this.$attachError.hidden = !this._attachError;
    this.$mention.hidden = !this._mention;
    // Chips are rebuilt only when what they show changes, so focus on them survives redraws.
    const chipsKey = dataKey([this._references, this._attachments.map((a) => [a.id, a.name, a.previewUrl, a.state])]);
    if (chipsKey !== this._chipsKey) {
      this._chipsKey = chipsKey;
      this.$refChips.replaceChildren(...this._references.map((ref) => this.renderReference(ref, { removable: true })));
      this._renderChips();
    }
    if (this._entriesDirty) {
      this._entriesDirty = false;
      this._renderEntries();
    }
    this._renderControls();
    this._renderMenu();
    this._renderContext();
    this.scrollToBottom();
  }

  _renderControls() {
    const assigned = (s) => s.assignedNodes({ flatten: true }).some((n) => n.nodeType === 1 || n.textContent.trim());
    this.$subhead.hidden = !assigned(this.$subhead.querySelector('slot'));
    this.$switchEnd.hidden = !assigned(this.$switchEnd.querySelector('slot'));
    this.$head.classList.toggle('head--start', assigned(this.$head.querySelector('slot[name="header-start"]')));
    this.$chips.hidden = !this._attachments.length && !this._references.length && !assigned(this.$chipSlot);
    const addItems = this._addItems();
    const plainAttach = addItems === null || (addItems.length === 1 && addItems[0].id === 'attach');
    this.$attach.hidden = this.hasAttribute('no-attachments') || !plainAttach;
    this.$attach.disabled = this.disabled;
    this.$add.hidden = plainAttach || !addItems.length;
    this.$add.disabled = this.disabled;
    this.$optionsButton.hidden = !this._options.length;
    this.$modelButton.hidden = !this._models.length;
    this.$stop.hidden = !this.running;
    this.$send.hidden = this.running;
    const draft = this.draft;
    this.$send.disabled = this.disabled || !(draft.trim() || this._canSendEmpty());
    this.$editor.classList.toggle('is-empty', !this.$editor.textContent);
  }

  // ---- Composer menus ("+", options, model) -------------------------------------------

  // The "+" menu's items, resolved: null when `no-add-menu` is set (plain paperclip).
  _addItems() {
    if (this.hasAttribute('no-add-menu')) return null;
    const labels = this._labels;
    const canAttach = this._canAttach();
    const builtins = {
      attach: () => canAttach && { id: 'attach', label: labels.attachFiles, icon: 'paperclip' },
      paste: () => canAttach && matchesAccept(new File([], 'pasted.txt', { type: 'text/plain' }), this.limits.accept)
        && { id: 'paste', label: labels.pasteText, icon: 'paste' },
      context: () => this._trigger() && { id: 'context', label: labels.addContext, icon: 'at' },
      link: () => !this.disabled && { id: 'link', label: labels.attachLink, icon: 'link' },
    };
    return this.addMenu.map((item) => {
      if (typeof item === 'string') return builtins[item]?.() || null;
      return item && item.id != null && item.label != null ? { ...item, id: String(item.id), label: String(item.label) } : null;
    }).filter(Boolean);
  }

  _modelName() {
    if (!this._model) {
      const fallback = this.getAttribute('default-model');
      return fallback ? this._labels.defaultModelNamed(fallback) : this._labels.defaultModel;
    }
    const found = this._models.find((m) => m.id === this._model);
    return found?.label || this._model;
  }

  _trigger$(name) {
    return { add: this.$add, options: this.$optionsButton, model: this.$modelButton }[name];
  }

  _toggleMenu(name) {
    if (this._menu?.name === name) this._closeMenu();
    else this._openMenu(name);
  }

  _openMenu(name, view = 'list') {
    if (this._menu && this._menu.name !== name) this._closeMenu({ focus: false });
    this._setContextCard(false, { focus: false });
    this.closeMention();
    this._menu = { name, view, query: '' };
    this._menuKey = null;
    this._menuView = null;
    [this.$add, this.$optionsButton, this.$modelButton].forEach((b) => b.setAttribute('aria-expanded', String(b === this._trigger$(name))));
    if (!this._onOutside) {
      // Clicks anywhere else close the menu; composedPath sees through shadow roots.
      this._onOutside = (e) => {
        const path = e.composedPath();
        if (!path.includes(this.$popover) && !path.includes(this._trigger$(this._menu?.name))) this._closeMenu({ focus: false });
      };
      document.addEventListener('pointerdown', this._onOutside, true);
    }
    this._renderMenu();
    this._focusMenu();
  }

  _closeMenu({ focus = true } = {}) {
    if (!this._menu) return;
    const trigger = this._trigger$(this._menu.name);
    const hadFocus = this.$popover.contains(this.shadowRoot.activeElement);
    this._menu = null;
    this.$popover.hidden = true;
    this.$popover.replaceChildren();
    [this.$add, this.$optionsButton, this.$modelButton].forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if (this._onOutside) document.removeEventListener('pointerdown', this._onOutside, true);
    this._onOutside = null;
    if (focus && hadFocus) trigger.focus();
  }

  _menuItems() {
    return Array.from(this.$popover.querySelectorAll('[role^="menuitem"]:not(:disabled)'));
  }

  _focusMenu() {
    const first = this.$popover.querySelector('[data-autofocus]') || this.$popover.querySelector('[aria-checked="true"]:not(:disabled)') || this._menuItems()[0];
    first?.focus();
  }

  _onMenuKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (this._menu?.view !== 'list') this._setMenuView('list');
      else this._closeMenu();
      return;
    }
    if (this._menu?.view !== 'list') return; // Forms keep their arrow keys.
    const items = this._menuItems();
    const at = items.indexOf(this.shadowRoot.activeElement);
    const go = (i) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? -1 : at - 1);
    else if (e.key === 'Home' && at >= 0) go(0);
    else if (e.key === 'End' && at >= 0) go(-1);
  }

  _setMenuView(view) {
    if (!this._menu) return;
    this._menu.view = view;
    this._renderMenu();
    this._focusMenu();
  }

  // Redraws the open menu only when what it shows changed, so focus inside survives.
  _renderMenu() {
    const menu = this._menu;
    if (!menu) return;
    if (menu.name === 'model' && !this._models.length) return this._closeMenu({ focus: false });
    if (menu.name === 'options' && !this._options.length) return this._closeMenu({ focus: false });
    // The "+" menu went away (no-add-menu, no items left) or the panel was disabled.
    if ((menu.name === 'add' && this.$add.hidden) || this.disabled) return this._closeMenu({ focus: false });
    const align = menu.name === 'add' ? 'start' : 'end';
    this.$popover.className = `menu-pop menu-pop--${align} menu-pop--${menu.name}`;
    this.$popover.hidden = false;
    // Forms (paste text, attach link) and the search field are built once per view, so
    // typing (and IME composition) is never interrupted by a redraw.
    const view = `${menu.name}:${menu.view}:${menu.name === 'model' && this._models.length > 7}`;
    if (this._menuView !== view) {
      this._menuView = view;
      this._menuKey = null;
      this.$menuBody = h('div', { class: 'menu-body', role: 'menu', 'aria-label': this._menuLabel() });
      const head = this._menuHead();
      this.$popover.replaceChildren(...(head ? [head] : []), ...(menu.view === 'list' ? [this.$menuBody] : []));
    }
    if (menu.view !== 'list') return;
    const key = dataKey([menu.name, menu.query, this._models, this._model, this._options, this.optionValues,
      this.getAttribute('default-model'), this.hasAttribute('no-default-model'), this._addItems()]);
    if (key === this._menuKey && this._labels === this._menuLabels) return;
    this._menuKey = key;
    this._menuLabels = this._labels;
    const focused = this.shadowRoot.activeElement?.dataset?.menuKey;
    this.$menuBody.replaceChildren(...this._menuBodyContent());
    if (focused) this.$menuBody.querySelector(`[data-menu-key="${CSS.escape(focused)}"]`)?.focus();
  }

  _menuLabel() {
    return { add: this._labels.add, options: this._labels.options, model: this._labels.model }[this._menu.name];
  }

  _menuHead() {
    const { name, view } = this._menu;
    const labels = this._labels;
    const stopEnter = (fn) => (e) => {
      // The composer is a <form>: Enter in a field would otherwise send the message.
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && !(e.target.tagName === 'TEXTAREA' && !(e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        fn();
      }
    };
    if (name === 'model' && this._models.length > 7) {
      const search = h('input', {
        class: 'menu-search', type: 'search', placeholder: labels.searchModels, 'aria-label': labels.searchModels, 'data-autofocus': true,
        onInput: (e) => {
          this._menu.query = e.target.value;
          this._renderMenu();
        },
        onKeydown: stopEnter(() => this._menuItems()[0]?.click()),
      });
      return h('div', { class: 'menu-searchbar' }, icon('search', 16), search);
    }
    if (name === 'add' && view === 'paste') {
      const fileName = h('input', { class: 'menu-field', placeholder: 'pasted-text.txt', 'aria-label': labels.pasteName });
      const text = h('textarea', { class: 'menu-field menu-text', rows: 8, 'aria-label': labels.pasteContent, placeholder: labels.pasteContent, 'data-autofocus': true });
      const add = () => {
        if (!text.value) return text.focus();
        let name = fileName.value.trim() || 'pasted-text.txt';
        if (!extensionOf(name)) name += '.txt';
        const type = TEXT_TYPES[extensionOf(name)] || 'text/plain';
        this._closeMenu();
        this.addFiles([new File([text.value], name, { type })]);
        this.focus();
      };
      fileName.addEventListener('keydown', stopEnter(add));
      text.addEventListener('keydown', stopEnter(add));
      return this._menuForm(labels.pasteText, [fileName, text], labels.addFile, add);
    }
    if (name === 'add' && view === 'link') {
      const url = h('input', { class: 'menu-field', type: 'url', placeholder: 'https://', 'aria-label': labels.linkUrl, 'data-autofocus': true });
      const problem = h('div', { class: 'menu-problem', role: 'alert', hidden: true });
      const add = () => {
        const href = assetUrl(url.value.trim());
        if (!href) {
          problem.textContent = labels.invalidLink;
          problem.hidden = false;
          return url.focus();
        }
        const path = new URL(href).pathname.split('/').filter(Boolean).pop();
        let label = new URL(href).host;
        try {
          if (path) label = decodeURIComponent(path);
        } catch {
          label = path; // Malformed escapes: keep the segment as written.
        }
        const mimeType = IMAGE_TYPES[extensionOf(path)];
        this._closeMenu();
        this.addReference({ type: 'asset', id: href, url: href, label, name: label, ...(mimeType ? { mimeType } : {}) });
      };
      url.addEventListener('keydown', stopEnter(add));
      return this._menuForm(labels.attachLink, [url, problem], labels.attachLink, add);
    }
    return null;
  }

  _menuForm(title, fields, submitLabel, submit) {
    return h(
      'div',
      { class: 'menu-form', role: 'dialog', 'aria-label': title },
      h('div', { class: 'menu-title' }, title),
      fields,
      h(
        'div',
        { class: 'menu-actions' },
        h('button', { type: 'button', class: 'btn btn--sm', onClick: () => this._setMenuView('list') }, this._labels.cancel),
        h('button', { type: 'button', class: 'btn btn--sm btn--primary', onClick: submit }, submitLabel),
      ),
    );
  }

  _menuBodyContent() {
    const { name } = this._menu;
    if (name === 'add') return this._addMenuContent();
    if (name === 'model') return this._modelMenuContent();
    return this._optionsMenuContent();
  }

  _menuItem({ key, label, description, iconName, role = 'menuitem', checked, disabled, onClick }) {
    return h(
      'button',
      {
        type: 'button',
        class: ['menu-item', checked && 'menu-item--sel'],
        role,
        'aria-checked': role === 'menuitem' ? null : String(Boolean(checked)),
        'data-menu-key': key,
        disabled: Boolean(disabled),
        onClick,
      },
      iconName ? icon(iconName, 16, 'menu-icon') : null,
      h('span', { class: 'menu-text-col' }, h('span', { class: 'menu-label' }, label), description ? h('span', { class: 'menu-desc' }, description) : null),
      role === 'menuitem' ? null : icon('check', 16, 'menu-check'),
    );
  }

  // Items with a `group` are listed under a heading, in the order groups first appear.
  _grouped(items, render) {
    const order = [];
    const groups = new Map();
    items.forEach((item) => {
      const group = item.group == null ? '' : String(item.group);
      if (!groups.has(group)) {
        groups.set(group, []);
        order.push(group);
      }
      groups.get(group).push(item);
    });
    return order.flatMap((group) => [group ? h('div', { class: 'menu-group', role: 'presentation' }, group) : null, ...groups.get(group).map(render)]).filter(Boolean);
  }

  _addMenuContent() {
    return this._grouped(this._addItems(), (item) => this._menuItem({
      key: `add:${item.id}`,
      label: item.label,
      description: item.description,
      iconName: item.icon,
      disabled: item.disabled,
      onClick: () => this._pickAddItem(item),
    }));
  }

  _pickAddItem(item) {
    const accepted = this._emit('agent-menu-select', { id: item.id, item }, { cancelable: true });
    if (accepted && item.id === 'paste' && !item.reference) return this._setMenuView('paste');
    if (accepted && item.id === 'link' && !item.reference) return this._setMenuView('link');
    this._closeMenu({ focus: !accepted });
    if (!accepted) return;
    if (item.reference) this.addReference(item.reference);
    else if (item.id === 'attach') this.$fileInput.click();
    else if (item.id === 'context') this.openMention();
  }

  _modelMenuContent() {
    const labels = this._labels;
    const terms = this._menu.query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (text) => terms.every((t) => text.toLowerCase().includes(t));
    const shown = this._models.filter((m) => matches(`${m.id} ${m.label || ''} ${m.description || ''} ${m.group || ''}`));
    const fallback = this.getAttribute('default-model') || '';
    const items = [];
    if (!this.hasAttribute('no-default-model') && matches(`${labels.defaultModel} ${fallback}`)) {
      items.push(this._menuItem({
        key: 'model:', label: labels.defaultModel, description: fallback, role: 'menuitemradio', checked: !this._model, onClick: () => this._pickModel(''),
      }));
    }
    items.push(...this._grouped(shown, (m) => this._menuItem({
      key: `model:${m.id}`,
      label: m.label || m.id,
      description: m.description || (m.label && m.label !== m.id ? m.id : ''),
      role: 'menuitemradio',
      checked: m.id === this._model,
      disabled: m.disabled,
      onClick: () => this._pickModel(m.id),
    })));
    return items.length ? items : [h('p', { class: 'menu-empty' }, labels.noModels)];
  }

  _pickModel(id) {
    const previous = this._model;
    this._closeMenu();
    if (id === previous) return;
    if (this._emit('agent-model-change', { model: id, previous }, { cancelable: true })) this.model = id;
  }

  _optionsMenuContent() {
    const values = this.optionValues;
    const out = [];
    this._options.forEach((option) => {
      if (option.type === 'toggle') {
        out.push(this._menuItem({
          key: `option:${option.id}`,
          label: option.label,
          description: option.description,
          role: 'menuitemcheckbox',
          checked: Boolean(values[option.id]),
          disabled: option.disabled,
          onClick: () => this._setOption(option.id, !values[option.id]),
        }));
        return;
      }
      out.push(h('div', { class: 'menu-group', role: 'presentation' }, option.label));
      option.choices.forEach((choice, i) => out.push(this._menuItem({
        key: `option:${option.id}:${i}`,
        label: choice.label,
        role: 'menuitemradio',
        checked: Object.is(values[option.id], choice.value),
        disabled: option.disabled,
        onClick: () => this._setOption(option.id, choice.value),
      })));
    });
    const changed = this._options.some((o) => !Object.is(values[o.id], optionDefault(o)));
    if (changed) {
      out.push(h('div', { class: 'menu-sep', role: 'separator' }));
      out.push(this._menuItem({ key: 'option-reset', label: this._labels.resetOptions, onClick: () => this._setOption(null) }));
    }
    return out;
  }

  // id null resets every option to its default.
  _setOption(id, value) {
    const next = id === null ? {} : { ...this._optionValues, [id]: value };
    const values = Object.fromEntries(this._options.map((o) => [o.id, o.id in next ? next[o.id] : optionDefault(o)]));
    if (!this._emit('agent-option-change', { id, value: id === null ? null : value, values }, { cancelable: true })) return;
    this._optionValues = next;
    this._renderMenu();
    if (id === null) this._focusMenu();
    this._schedule();
  }

  _renderChips() {
    this.$fileChips.replaceChildren(...this._attachments.map((item) => {
      const state = this._attachmentStates.get(item.id);
      let lead = item.previewUrl ? h('img', { class: 'thumb', src: item.previewUrl, alt: '' }) : icon(item.type.startsWith('image/') ? 'image' : 'file', 14);
      if (state?.busy) lead = h('span', { class: 'spinner', role: 'status', 'aria-label': this._labels.working });
      else if (state?.error) lead = icon('alert', 14);
      return h(
        'span',
        {
          class: ['chip', item.previewUrl && !state?.busy && !state?.error && 'chip--image', state?.error && 'chip--error'],
          part: 'attachment',
          title: state?.error ? `${item.name}: ${state.error}` : `${item.name} · ${formatBytes(item.size)}`,
          'data-attachment-id': item.id,
          'data-state': state?.busy ? 'busy' : (state?.error ? 'error' : null),
        },
        lead,
        h('span', { class: 'chip-label' }, item.name),
        h('button', {
          type: 'button',
          class: 'chip-x',
          'aria-label': `${this._labels.remove} ${item.name}`,
          disabled: Boolean(state?.busy),
          onClick: () => this.removeAttachment(item.id),
        }, icon('close', 12)),
      );
    }));
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
    const rendered = this.renderEntry(entry);
    let node = rendered;
    if (!rendered) node = h('div', { class: 'entry-slot' }, h('slot', { name: `entry-${id}` }));
    // Text nodes and fragments get a wrapper, so every row can carry data-entry-id.
    else if (rendered.nodeType !== 1) node = h('div', { class: 'entry' }, rendered);
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
