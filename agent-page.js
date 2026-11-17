// <agent-page>: a full-page agent chat with a conversation list, as a framework-free
// custom element. It is the panel (agent-panel.js) laid out for a whole page: everything
// the panel has works here too, and this adds the conversation sidebar, a renamable
// title and an "in context" bar. This module defines no tag: page.js does.
import { AgentPanelElement, h, icon } from './agent-panel.js';

// Conversation links may be relative or HTTP(S); anything else (javascript:, data:…) is
// dropped, and the row becomes a button.
function safeHref(href) {
  if (href == null) return '';
  // Read the scheme the way the URL parser does: tabs and newlines removed, and
  // leading/trailing controls and spaces trimmed (so "java\tscript:" is still caught).
  const raw = String(href);
  const clean = raw.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
  if (!clean) return '';
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(clean);
  if (!scheme) return raw; // Relative.
  return ['http', 'https'].includes(scheme[1].toLowerCase()) ? raw : '';
}

// A comparable snapshot of plain data; anything unserializable never compares equal.
function dataKey(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return Symbol('unserializable');
  }
}

const PAGE_LABELS = {
  cancel: 'Cancel',
  conversations: 'Conversations',
  delete: 'Delete',
  deleteConversation: (title) => `Delete ${title}`,
  inContext: 'In context:',
  newChat: 'New chat',
  noConversations: 'No conversations yet.',
  rename: 'Rename',
  titleLabel: 'Title',
  untitled: 'New chat',
};

const PAGE_STYLES = `
/* The host is the size container: a container query can't restyle its own container. */
:host { --agent-sidebar-width: 250px; --agent-content-max-width: 860px; container: agent-page / inline-size; }
.page { background: var(--agent-surface); display: grid; grid-template-columns: var(--agent-sidebar-width) minmax(0, 1fr); height: 100%; min-height: 0; overflow: hidden; position: relative; }
:host([no-sidebar]) .page { grid-template-columns: minmax(0, 1fr); }
:host([no-sidebar]) .convs, :host([no-sidebar]) .history, :host([no-sidebar]) .scrim { display: none !important; }
/* Its own stacking context, so composer menus stay under the drawer and scrim. */
.panel { min-width: 0; z-index: 0; }

.convs { background: var(--agent-surface); border-right: 1px solid var(--agent-border); display: flex; flex-direction: column; gap: 8px; min-height: 0; padding: 12px 8px; }
.new-chat { flex: none; width: 100%; }
.conv-list { flex: 1; min-height: 0; overflow-y: auto; }
.conv-empty { color: var(--agent-muted); font-size: 12px; margin: 0; padding: 8px; }
.conv { align-items: center; border-radius: 6px; display: flex; gap: 4px; min-height: 34px; padding: 2px 4px 2px 10px; }
.conv:hover, .conv--active, .conv--confirm { background: var(--agent-surface-alt); }
.conv-link { background: none; border: 0; color: inherit; cursor: pointer; flex: 1; font: inherit; font-size: 13px; min-width: 0; overflow: hidden; padding: 6px 0; text-align: left; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
.conv-link:focus-visible { outline: 2px solid var(--agent-primary); outline-offset: 2px; }
.conv--active .conv-link { color: var(--agent-primary); font-weight: 500; }
.conv-when { color: var(--agent-muted); flex: none; font-size: 11px; }
.conv .btn--icon { height: 26px; min-height: 26px; width: 26px; }
.conv-del { display: none; }
.conv:hover .conv-when, .conv:focus-within .conv-when { display: none; }
.conv:hover .conv-del, .conv:focus-within .conv-del { display: inline-flex; }
/* Touch screens can't hover: always offer Delete there. */
@media (hover: none) { .conv-when { display: none; } .conv-del { display: inline-flex; } }
.btn--danger { background: var(--agent-error); color: #fff; }

.head { border-bottom: 1px solid var(--agent-border); gap: 10px; padding: 8px 16px; }
.title { background: none; border: 0; border-radius: 6px; color: inherit; cursor: text; font: inherit; font-size: 15px; font-weight: 600; max-width: 100%; min-width: 0; overflow: hidden; padding: 4px 6px; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.title:hover:not(:disabled) { background: var(--agent-surface-alt); }
.title:disabled { cursor: default; }
.title-input { background: var(--agent-surface); border: 1px solid var(--agent-primary); border-radius: 6px; color: inherit; font: inherit; font-size: 15px; font-weight: 600; max-width: 420px; min-width: 0; outline: none; padding: 4px 6px; width: 100%; }
.history { display: none; }
.context-bar { align-items: center; border-bottom: 1px solid var(--agent-border); display: flex; flex: none; flex-wrap: wrap; gap: 6px; padding: 6px 16px; }
.context-label { color: var(--agent-muted); font-size: 12px; }

.inner { margin: 0 auto; max-width: var(--agent-content-max-width); padding: 16px 20px; width: 100%; }
.composer { border-top: 1px solid var(--agent-border); padding: 10px max(20px, calc((100% - var(--agent-content-max-width)) / 2 + 20px)) 12px; }
.empty { align-items: stretch; text-align: left; }
.empty-text { max-width: none; }
.scrim { display: none; }

@container agent-page (max-width: 760px) {
  .page { grid-template-columns: minmax(0, 1fr); }
  .convs { bottom: 0; box-shadow: 0 12px 36px rgba(0, 0, 0, .22); left: 0; position: absolute; top: 0; transform: translateX(-105%); transition: transform .2s, visibility 0s .2s; visibility: hidden; width: min(300px, 85%); z-index: 6; }
  .page--drawer .convs { transform: none; transition: transform .2s; visibility: visible; }
  .page--drawer .scrim { background: rgba(0, 0, 0, .32); display: block; inset: 0; position: absolute; z-index: 5; }
  .history { display: inline-flex; }
  .inner { padding-left: 12px; padding-right: 12px; }
  .composer { padding-left: 12px; padding-right: 12px; }
}
@media (prefers-reduced-motion: reduce) { .convs, .page--drawer .convs { transition: none; } }
`;

// Same day: the time; otherwise the date.
function defaultFormatDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const opts = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString([], opts);
}

export class AgentPageElement extends AgentPanelElement {
  static tagName = 'agent-page';

  static styles = PAGE_STYLES;

  static defaultLabels = { ...AgentPanelElement.defaultLabels, ...PAGE_LABELS };

  static get observedAttributes() {
    return [...super.observedAttributes, 'active', 'renamable', 'no-sidebar'];
  }

  // ---- Properties -------------------------------------------------------------------

  // The sidebar list: [{ id, title, updated?, href? }]. With `href`, rows are real links.
  get conversations() { return this._page.conversations.slice(); }

  set conversations(value) {
    this._page.conversations = Array.isArray(value) ? value.filter((c) => c && c.id != null) : [];
    this._schedule();
  }

  // The id of the open conversation (reflects the `active` attribute).
  get active() { return this.getAttribute('active') || ''; }

  set active(value) { this._reflect('active', value == null ? '' : String(value)); }

  get renamable() { return this.hasAttribute('renamable'); }

  set renamable(value) { this.toggleAttribute('renamable', Boolean(value)); }

  // References already part of the conversation, shown in a bar under the header.
  get contextReferences() { return this._page.context.slice(); }

  set contextReferences(value) {
    this._page.context = Array.isArray(value) ? value.filter((r) => r && r.type != null && r.id != null) : [];
    this._schedule();
  }

  // (value) => string for the dates in the sidebar.
  get formatDate() { return this._page.formatDate; }

  set formatDate(fn) {
    this._page.formatDate = typeof fn === 'function' ? fn : defaultFormatDate;
    this._schedule();
  }

  // ---- Methods ----------------------------------------------------------------------

  openSidebar() { this._setDrawer(true); }

  closeSidebar() { this._setDrawer(false); }

  startRename() {
    if (!this.renamable) return;
    this._page.renaming = true;
    this.$titleInput.value = this.getAttribute('heading') || '';
    this._render();
    this.$titleInput.focus();
    this.$titleInput.select();
  }

  // ---- Hooks ------------------------------------------------------------------------

  // Called from the panel's constructor, before any subclass fields exist: keep state
  // in this._page, created here.
  layout(panel) {
    this._page = {
      conversations: [], context: [], formatDate: defaultFormatDate, confirming: '', renaming: false, drawer: false,
    };

    this.$history = h('button', { type: 'button', class: 'btn btn--icon history', part: 'history', onClick: () => this._setDrawer(!this._page.drawer) }, icon('history'));
    this.$title = h('button', {
      type: 'button', class: 'title', part: 'title', onClick: () => this.startRename(),
    });
    this.$titleInput = h('input', {
      class: 'title-input',
      part: 'title-input',
      hidden: true,
      onKeydown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._commitRename();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this._page.renaming = false;
          this._render();
        }
      },
      onBlur: () => this._commitRename(),
    });
    const start = this.$head.querySelector('slot[name="header-start"]');
    start.replaceChildren(this.$title, this.$titleInput);
    this.$head.prepend(this.$history);

    this.$contextLabel = h('span', { class: 'context-label' });
    this.$contextChips = h('span', { class: 'chips-files' });
    this.$contextBar = h('div', { class: 'context-bar', part: 'context-bar', hidden: true }, this.$contextLabel, this.$contextChips);
    panel.insertBefore(this.$contextBar, this.$scroll);

    this.$newChat = h('button', {
      type: 'button',
      class: 'btn btn--primary new-chat',
      part: 'new-chat',
      onClick: () => {
        this._setDrawer(false);
        this._emit('agent-new-conversation');
      },
    }, icon('plus', 16), h('span'));
    this.$convEmpty = h('p', { class: 'conv-empty' });
    this.$convList = h('div', { class: 'conv-list', part: 'conversation-list' });
    this.$sidebar = h(
      'aside',
      { class: 'convs', part: 'sidebar' },
      h('slot', { name: 'sidebar-start' }),
      this.$newChat,
      this.$convList,
      h('slot', { name: 'sidebar-end' }),
    );
    this.$scrim = h('div', { class: 'scrim', onClick: () => this._setDrawer(false) });
    this.$page = h('div', {
      class: 'page',
      part: 'page',
      onKeydown: (e) => {
        if (e.key === 'Escape' && this._page.drawer) this._setDrawer(false);
      },
    }, this.$sidebar, panel, this.$scrim);
    return this.$page;
  }

  connectedCallback() {
    this._upgradeProperties(['conversations', 'active', 'renamable', 'contextReferences', 'formatDate']);
    super.connectedCallback();
  }

  // ---- Internals --------------------------------------------------------------------

  _setDrawer(open) {
    const was = this._page.drawer;
    this._page.drawer = Boolean(open);
    this.$page.classList.toggle('page--drawer', this._page.drawer);
    this.$history.setAttribute('aria-expanded', String(this._page.drawer));
    // While the drawer slides out it is still visible; keep it out of reach until
    // `visibility: hidden` takes over (.2s). Cleared first on open, so focus can enter.
    const narrow = this.$history.offsetParent !== null; // A drawer at this width.
    // Opening closes any composer menu, every time. Focus goes back to the menu's trigger
    // unless it's about to move into the drawer.
    if (this._page.drawer) this._closeMenu({ focus: !(narrow && !was) });
    if (was === this._page.drawer) return;
    clearTimeout(this._page.inertTimer);
    this.$sidebar.inert = false;
    if (!narrow) return;
    if (this._page.drawer) {
      (this.$convList.querySelector('[aria-current="page"]') || this.$newChat).focus();
      return;
    }
    if (this._sidebarHasFocus()) this.$history.focus();
    this.$sidebar.inert = true;
    this._page.inertTimer = setTimeout(() => { this.$sidebar.inert = false; }, 250);
  }

  // Focus inside the sidebar, including controls slotted into sidebar-start/-end.
  _sidebarHasFocus() {
    if (this.$sidebar.contains(this.shadowRoot.activeElement)) return true;
    const active = this.getRootNode().activeElement; // The page may sit in another shadow root.
    return Array.from(this.$sidebar.querySelectorAll('slot'))
      .some((slot) => slot.assignedElements({ flatten: true }).some((el) => el.contains(active)));
  }

  _commitRename() {
    if (!this._page.renaming) return;
    this._page.renaming = false;
    const title = this.$titleInput.value.trim();
    if (title && title !== (this.getAttribute('heading') || '')) {
      if (this._emit('agent-rename', { title }, { cancelable: true })) this.setAttribute('heading', title);
    }
    this._render();
  }

  _select(conversation, e) {
    // Modifier and non-left clicks are the browser's (new tab on links); they select nothing.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = safeHref(conversation.href);
    const accepted = this._emit('agent-select-conversation', { id: conversation.id, conversation }, { cancelable: true });
    if (!accepted || !href) e.preventDefault();
    this._page.confirming = '';
    this._setDrawer(false);
  }

  _focusRow(id, selector) {
    const row = Array.from(this.$convList.children).find((el) => el.dataset.conversationId === id);
    row?.querySelector(selector)?.focus();
  }

  _renderConversation(conversation) {
    const labels = this.labels;
    const id = String(conversation.id);
    const title = conversation.title || labels.untitled;
    const confirming = this._page.confirming === id;
    const href = safeHref(conversation.href);
    const link = href
      ? h('a', { class: 'conv-link', href, title })
      : h('button', { type: 'button', class: 'conv-link', title });
    link.textContent = title;
    if (id === this.active) link.setAttribute('aria-current', 'page');
    link.addEventListener('click', (e) => this._select(conversation, e));
    const tail = confirming
      ? [
        h('button', {
          type: 'button',
          class: 'btn btn--danger btn--sm',
          'data-action': 'confirm-delete',
          onClick: () => {
            this._page.confirming = '';
            this._emit('agent-delete-conversation', { id: conversation.id, conversation });
            this._schedule();
          },
        }, labels.delete),
        h('button', {
          type: 'button',
          class: 'btn btn--icon',
          'aria-label': labels.cancel,
          onClick: () => {
            this._page.confirming = '';
            this._render();
            this._focusRow(id, '.conv-link');
          },
        }, icon('close', 14)),
      ]
      : [
        h('span', { class: 'conv-when' }, conversation.updated ? this._page.formatDate(conversation.updated) : ''),
        h('button', {
          type: 'button',
          class: 'btn btn--icon conv-del',
          'aria-label': labels.deleteConversation(title),
          'data-action': 'delete',
          onClick: () => {
            this._page.confirming = id;
            this._render();
            this._focusRow(id, '[data-action="confirm-delete"]');
          },
        }, icon('delete', 15)),
      ];
    return h('div', {
      class: ['conv', id === this.active && 'conv--active', confirming && 'conv--confirm'], part: 'conversation', 'data-conversation-id': id,
    }, link, tail);
  }

  _render() {
    super._render();
    if (!this._page) return;
    const labels = this.labels;
    const heading = this.getAttribute('heading') || '';
    this.$title.textContent = heading || labels.untitled;
    this.$title.title = this.renamable ? labels.rename : heading;
    this.$title.disabled = !this.renamable;
    this.$title.hidden = this._page.renaming;
    this.$titleInput.hidden = !this._page.renaming;
    this.$titleInput.setAttribute('aria-label', labels.titleLabel);
    this.$history.setAttribute('aria-label', labels.conversations);
    this.$history.title = labels.conversations;
    this.$history.setAttribute('aria-expanded', String(this._page.drawer));
    this.$sidebar.setAttribute('aria-label', labels.conversations);
    this.$newChat.lastChild.textContent = labels.newChat;

    const page = this._page;
    const { conversations, context } = page;
    this.$convEmpty.textContent = labels.noConversations;
    // Rows are rebuilt only when what they show changes, so focus and clicks in the
    // sidebar survive redraws caused by the transcript.
    const listKey = dataKey([conversations, this.active, page.confirming, conversations.map((c) => (c.updated ? page.formatDate(c.updated) : ''))]);
    if (listKey !== page.listKey || labels !== page.listLabels) {
      page.listKey = listKey;
      page.listLabels = labels;
      this.$convList.replaceChildren(...(conversations.length ? conversations.map((c) => this._renderConversation(c)) : [this.$convEmpty]));
    }

    this.$contextBar.hidden = !context.length;
    this.$contextLabel.textContent = labels.inContext;
    const contextKey = dataKey(context);
    if (contextKey !== page.contextKey) {
      page.contextKey = contextKey;
      this.$contextChips.replaceChildren(...context.map((ref) => this.renderReference(ref)));
    }
  }
}
