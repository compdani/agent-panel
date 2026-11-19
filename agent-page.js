// <agent-page>: a full-page agent chat with a conversation list, as a framework-free
// custom element. It is the panel (agent-panel.js) laid out for a whole page: everything
// the panel has works here too, and this adds the conversation sidebar, a renamable
// title and an "in context" bar. This module defines no tag: page.js does.
import { AgentPanelElement, h, icon } from './agent-panel.js';

// A comparable snapshot of plain data; anything unserializable never compares equal.
function dataKey(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return Symbol('unserializable');
  }
}


// The conversation words (newChat, untitled, conversations, delete…) live on the panel.
const PAGE_LABELS = {
  inContext: 'In context:',
  rename: 'Rename',
  titleLabel: 'Title',
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
.convs .conv-list { flex: 1; min-height: 0; overflow-y: auto; }

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

export class AgentPageElement extends AgentPanelElement {
  static tagName = 'agent-page';

  static styles = PAGE_STYLES;

  static defaultLabels = { ...AgentPanelElement.defaultLabels, ...PAGE_LABELS };

  static get observedAttributes() {
    return [...super.observedAttributes, 'renamable', 'no-sidebar'];
  }

  // The sidebar shows the conversation list, so the panel's switcher stays off.
  static conversationSwitcher = false;

  // ---- Properties -------------------------------------------------------------------

  // `conversations`, `active`, `hasMore` and `formatDate` come from the panel.

  get renamable() { return this.hasAttribute('renamable'); }

  set renamable(value) { this.toggleAttribute('renamable', Boolean(value)); }

  // References already part of the conversation, shown in a bar under the header.
  get contextReferences() { return this._page.context.slice(); }

  set contextReferences(value) {
    this._page.context = Array.isArray(value) ? value.filter((r) => r && r.type != null && r.id != null) : [];
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
    this._page = { context: [], renaming: false, drawer: false };

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
    // The panel's conversation rows (created before layout runs), shown in the sidebar.
    this.$convList = this._convList.el;
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
    this._upgradeProperties(['renamable', 'contextReferences']);
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

  _onConversationSelect(conversation, e) {
    if (!super._onConversationSelect(conversation, e)) return false;
    this._setDrawer(false);
    return true;
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
    const { context } = page;
    this.$contextBar.hidden = !context.length;
    this.$contextLabel.textContent = labels.inContext;
    const contextKey = dataKey(context);
    if (contextKey !== page.contextKey) {
      page.contextKey = contextKey;
      this.$contextChips.replaceChildren(...context.map((ref) => this.renderReference(ref)));
    }
  }
}
