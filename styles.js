// The panel's shadow stylesheet. Hosts theme it through the --agent-* custom properties
// (they inherit through the shadow boundary) and reach inside through ::part().
export const STYLES = `
:host {
  --agent-primary: #2563eb;
  --agent-on-primary: #fff;
  --agent-surface: #fff;
  --agent-surface-alt: #f3f4f6;
  --agent-text: #1f2328;
  --agent-muted: color-mix(in srgb, var(--agent-text) 62%, transparent);
  --agent-border: color-mix(in srgb, var(--agent-text) 18%, transparent);
  --agent-error: #c62828;
  --agent-success: #2e7d32;
  --agent-warning: #b26a00;
  --agent-info: #0277bd;
  --agent-font-size: 14px;
  --agent-radius: 14px;
  --agent-composer-max-height: 180px;
  color: var(--agent-text);
  display: block;
  font: inherit;
  font-size: var(--agent-font-size);
  height: 100%;
  min-height: 0;
  position: relative;
}
:host([theme="dark"]) {
  --agent-primary: #7aa2ff;
  --agent-on-primary: #0b1020;
  --agent-surface: #1b1d22;
  --agent-surface-alt: #262931;
  --agent-text: #e6e8ec;
}
[hidden] { display: none !important; }
*, *::before, *::after { box-sizing: border-box; }
svg.icon { fill: currentColor; flex: none; }
button { font: inherit; }

.panel { background: var(--agent-surface); container-type: inline-size; display: flex; flex-direction: column; height: 100%; min-height: 0; position: relative; }

.header { flex: none; }
.head { align-items: center; display: flex; gap: 4px; min-height: 48px; padding: 8px 8px 6px 14px; }
.heading { font-size: 14px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subhead { padding: 0 14px 10px; }
.spacer { flex: 1; }

/* Conversation rows: <agent-page>'s sidebar and <agent-panel>'s switcher. */
.conv-empty { color: var(--agent-muted); font-size: 12px; margin: 0; padding: 8px; }
.conv { align-items: center; border-radius: 6px; display: flex; gap: 4px; min-height: 34px; padding: 2px 4px 2px 10px; }
.conv:hover, .conv--active, .conv--confirm { background: var(--agent-surface-alt); }
.conv-link { background: none; border: 0; color: inherit; cursor: pointer; flex: 1; font: inherit; font-size: 13px; min-width: 0; overflow: hidden; padding: 6px 8px 6px 0; text-align: left; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
.conv-link:focus-visible { outline: 2px solid var(--agent-primary); outline-offset: 2px; }
.conv--active .conv-link { color: var(--agent-primary); font-weight: 500; }
.conv-when { color: var(--agent-muted); flex: none; font-size: 11px; }
.conv .btn--icon { height: 26px; min-height: 26px; width: 26px; }
.conv-del { display: none; }
.conv:hover .conv-when, .conv:focus-within .conv-when { display: none; }
.conv:hover .conv-del, .conv:focus-within .conv-del { display: inline-flex; }
/* Touch screens can't hover: always offer Delete there. */
@media (hover: none) { .conv-when { display: none; } .conv-del { display: inline-flex; } }

/* <agent-panel conversations-menu>: the title opens the conversation list; New chat sits by Close. */
.head { position: relative; }
/* An icon in header-start keeps its size; the title gives way. */
:host([conversations-menu]) ::slotted([slot="header-start"]) { flex-shrink: 0; }
.head--start { gap: 6px; }
.head--start .switch-btn { margin-left: 0; }
.switcher { display: flex; flex: 0 1 auto; min-width: 0; }
.switch-btn { align-items: center; background: none; border: 0; border-radius: 8px; color: inherit; cursor: pointer; display: flex; font: inherit; font-size: 14px; font-weight: 600; gap: 2px; margin-left: -6px; min-height: 32px; min-width: 0; padding: 4px 6px; text-align: left; transition: background-color .15s; }
.switch-btn:hover, .switch-btn[aria-expanded="true"] { background: var(--agent-surface-alt); }
.switch-btn:focus-visible { outline: 2px solid var(--agent-primary); outline-offset: 1px; }
.switch-btn .icon { color: var(--agent-muted); transition: transform .15s; }
.switch-btn[aria-expanded="true"] .icon { transform: rotate(180deg); }
.switch-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.switch-pop { background: var(--agent-surface); border: 1px solid var(--agent-border); border-radius: 12px; box-shadow: 0 12px 32px rgba(15, 23, 42, .18), 0 2px 6px rgba(15, 23, 42, .08); display: flex; flex-direction: column; left: 8px; max-height: min(460px, 65vh); overflow: hidden; position: absolute; top: calc(100% - 2px); width: min(380px, calc(100cqw - 16px)); z-index: 25; }
.switch-list { overflow-y: auto; padding: 6px; }
.switch-end { border-top: 1px solid var(--agent-border); flex: none; padding: 4px; }
.switch-pop .conv { border-radius: 8px; gap: 2px; min-height: 36px; transition: background-color .12s; }
.switch-pop .conv--active { background: color-mix(in srgb, var(--agent-primary) 8%, transparent); }
.switch-pop .conv:hover, .switch-pop .conv:focus-within { background: var(--agent-surface-alt); }
.switch-pop .conv--active:hover, .switch-pop .conv--active:focus-within { background: color-mix(in srgb, var(--agent-primary) 12%, transparent); }
.switch-pop .conv-link:focus-visible { outline: none; }
/* The list shows each row's date and Delete, like a menu, not only on hover. */
.switch-pop .conv-when, .switch-pop .conv:hover .conv-when, .switch-pop .conv:focus-within .conv-when { display: inline; margin-right: 2px; }
.switch-pop .conv-del, .switch-pop .conv:hover .conv-del { color: var(--agent-muted); display: inline-flex; }
.switch-pop .conv-del:hover { color: var(--agent-error); }

:host([theme="dark"]) .switch-pop { box-shadow: 0 12px 32px rgba(0, 0, 0, .55), 0 0 0 1px rgba(255, 255, 255, .04); }

/* <agent-panel floating>: a card that hovers over the page instead of filling its box. */
:host([floating]) { box-sizing: border-box; padding: 10px; }
:host([floating]) .panel { border: 1px solid var(--agent-border); border-radius: var(--agent-radius); box-shadow: 0 12px 36px rgba(15, 23, 42, .22); overflow: hidden; }

.scroll { flex: 1; min-height: 0; overflow-y: auto; }
.inner { display: flex; flex-direction: column; gap: 12px; min-height: 100%; padding: 16px; }
.list { display: flex; flex-direction: column; gap: 12px; }
.list:empty { display: none; }
/* Rows that clip overflow would otherwise shrink to nothing once the chat outgrows the panel. */
.list > *, .inner > * { flex: none; }

.empty { align-items: center; display: flex; flex-direction: column; margin: auto 0; padding: 16px 4px; text-align: center; }
.empty-title { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
.empty-title:empty, .empty-text:empty { display: none; }
.empty-text { color: var(--agent-muted); font-size: 13px; line-height: 1.5; margin: 0 0 16px; max-width: 340px; }
.suggestions { width: 100%; }
.suggestion { align-items: center; background: var(--agent-surface); border: 1px solid var(--agent-border); border-radius: 10px; color: inherit; cursor: pointer; display: flex; font-size: 13px; gap: 10px; justify-content: space-between; margin-bottom: 8px; padding: 10px 12px; text-align: left; transition: background-color .15s, border-color .15s; width: 100%; }
.suggestion .icon { color: var(--agent-muted); }
.suggestion:hover { background: color-mix(in srgb, var(--agent-primary) 6%, transparent); border-color: color-mix(in srgb, var(--agent-primary) 40%, transparent); }

.bubble { align-self: flex-end; background: color-mix(in srgb, var(--agent-primary) 13%, transparent); border-radius: 14px 14px 4px 14px; line-height: 1.5; max-width: 88%; overflow-wrap: anywhere; padding: 8px 12px; white-space: pre-wrap; }
.message { line-height: 1.6; overflow-wrap: anywhere; overflow-x: auto; }
.message p, .message ul, .message ol, .message blockquote { margin: 0 0 10px; }
.message > :last-child { margin-bottom: 0; }
.message h1, .message h2, .message h3 { font-size: 15px; font-weight: 600; line-height: 1.4; margin: 14px 0 6px; }
.message > :first-child { margin-top: 0; }
.message ul, .message ol { padding-left: 22px; }
.message a { color: var(--agent-primary); }
.message table { border-collapse: collapse; font-size: 13px; margin: 10px 0; width: 100%; }
.message th, .message td { border: 1px solid var(--agent-border); padding: 6px 8px; text-align: left; vertical-align: top; }
.message th { background: color-mix(in srgb, var(--agent-text) 4%, transparent); font-weight: 600; }
.message code { background: color-mix(in srgb, var(--agent-text) 7%, transparent); border-radius: 4px; font-size: 12px; padding: 1px 4px; }
.message pre { background: color-mix(in srgb, var(--agent-text) 5%, transparent); border-radius: 8px; margin: 0 0 10px; overflow-x: auto; padding: 10px 12px; }
.message pre code { background: none; padding: 0; }
.message blockquote { border-left: 3px solid var(--agent-border); padding-left: 12px; }

.tools { color: var(--agent-muted); font-size: 12px; }
.tools > summary { align-items: center; cursor: pointer; display: inline-flex; gap: 6px; list-style: none; }
.tools > summary::-webkit-details-marker { display: none; }
.tools > summary:hover { color: var(--agent-text); }
.tools .chev { transition: transform .15s; }
.tools[open] > summary .chev { transform: rotate(90deg); }
.tools .failed { color: var(--agent-error); }
.tool { border-left: 2px solid var(--agent-border); margin: 6px 0 0 6px; padding-left: 10px; }
.tool > summary { cursor: pointer; }
.tool--failed > summary { color: var(--agent-error); }
.tool pre { background: color-mix(in srgb, var(--agent-text) 4%, transparent); border-radius: 6px; font-size: 11px; margin: 4px 0 0; max-height: 200px; overflow: auto; padding: 8px; white-space: pre-wrap; word-break: break-word; }

.spinner { animation: spin .8s linear infinite; border: 2px solid color-mix(in srgb, var(--agent-primary) 25%, transparent); border-radius: 50%; border-top-color: var(--agent-primary); display: inline-block; flex: none; height: 12px; width: 12px; }
@keyframes spin { to { transform: rotate(360deg); } }

.working { display: flex; gap: 4px; padding: 4px 0; }
.working span { animation: pulse 1.2s infinite ease-in-out; background: var(--agent-primary); border-radius: 50%; height: 6px; width: 6px; }
.working span:nth-child(2) { animation-delay: .15s; }
.working span:nth-child(3) { animation-delay: .3s; }
@keyframes pulse { 0%, 60%, 100% { opacity: .25; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
@media (prefers-reduced-motion: reduce) { .working span, .spinner { animation: none; opacity: .6; } }

/* Building blocks, also for subclasses' own entries. */
.btn { align-items: center; background: transparent; border: 0; border-radius: 8px; color: inherit; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 500; gap: 6px; justify-content: center; line-height: 1; min-height: 30px; padding: 6px 12px; text-decoration: none; transition: background-color .15s, opacity .15s; white-space: nowrap; }
.btn:hover:not(:disabled) { background: color-mix(in srgb, var(--agent-text) 7%, transparent); }
.btn:focus-visible, .suggestion:focus-visible, .chip-x:focus-visible, summary:focus-visible { outline: 2px solid var(--agent-primary); outline-offset: 1px; }
.btn:disabled { cursor: default; opacity: .45; }
.btn--primary { background: var(--agent-primary); color: var(--agent-on-primary); }
.btn--primary:hover:not(:disabled) { background: color-mix(in srgb, var(--agent-primary) 88%, var(--agent-text)); }
.btn--tonal { background: color-mix(in srgb, var(--agent-primary) 12%, transparent); color: var(--agent-primary); }
.btn--tonal:hover:not(:disabled) { background: color-mix(in srgb, var(--agent-primary) 20%, transparent); }
.btn--icon { border-radius: 50%; height: 32px; min-height: 32px; padding: 0; width: 32px; }
.btn--sm { font-size: 12px; min-height: 26px; padding: 4px 10px; }
/* After .btn, which would otherwise reset their colours. */
.btn--danger { background: var(--agent-error); color: #fff; }
.btn--danger:hover:not(:disabled) { background: color-mix(in srgb, var(--agent-error) 88%, #000); }
.conv-more { color: var(--agent-primary); margin: 4px 0; width: 100%; }
.card { background: var(--agent-surface); border: 1px solid var(--agent-border); border-radius: 12px; box-shadow: 0 1px 3px rgba(0, 0, 0, .05); padding: 12px; }
.badge { border-radius: 4px; font-size: 11px; font-weight: 500; padding: 2px 6px; text-transform: capitalize; }
.tone-success { background: color-mix(in srgb, var(--agent-success) 14%, transparent); color: var(--agent-success); }
.tone-error { background: color-mix(in srgb, var(--agent-error) 12%, transparent); color: var(--agent-error); }
.tone-warning { background: color-mix(in srgb, var(--agent-warning) 14%, transparent); color: var(--agent-warning); }
.tone-info { background: color-mix(in srgb, var(--agent-info) 12%, transparent); color: var(--agent-info); }
.tone-muted { background: color-mix(in srgb, var(--agent-text) 8%, transparent); color: var(--agent-muted); }
.alert { align-items: flex-start; border-radius: 8px; display: flex; font-size: 13px; gap: 8px; line-height: 1.45; padding: 8px 10px; }
.alert > span { flex: 1; overflow-wrap: anywhere; }
.alert .btn--icon { height: 22px; min-height: 22px; width: 22px; }

.composer { flex: none; padding: 8px 12px 12px; }
.attach-error { color: var(--agent-error); font-size: 12px; margin: 0 4px 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.chips-files { display: contents; }
.chip { align-items: center; background: var(--agent-surface-alt); border: 1px solid var(--agent-border); border-radius: 999px; display: inline-flex; font-size: 12px; gap: 6px; max-width: 240px; min-height: 28px; padding: 2px 4px 2px 8px; }
.chip--image { padding-left: 3px; }
.chip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.thumb { border-radius: 999px; flex: none; height: 22px; object-fit: cover; width: 22px; }
.chip--ref { padding-left: 8px; }
.chip--error { border-color: color-mix(in srgb, var(--agent-error) 50%, transparent); color: var(--agent-error); }
.chip > .spinner { margin: 0 1px; }
.chip-x:disabled { cursor: default; opacity: .3; }
.chip-open { align-items: center; background: none; border: 0; color: inherit; cursor: pointer; display: inline-flex; gap: 4px; min-width: 0; padding: 0; }
.chip-open:focus-visible { outline: 2px solid var(--agent-primary); outline-offset: 1px; }
.chips--end { justify-content: flex-end; margin-bottom: 0; }
.user-turn { align-items: flex-end; align-self: flex-end; display: flex; flex-direction: column; gap: 4px; max-width: 88%; }
.user-turn .bubble { max-width: 100%; }
.chip-x { align-items: center; background: none; border: 0; border-radius: 50%; color: inherit; cursor: pointer; display: inline-flex; flex: none; height: 20px; justify-content: center; opacity: .7; padding: 0; width: 20px; }
.chip-x:hover:not(:disabled) { background: color-mix(in srgb, var(--agent-text) 10%, transparent); opacity: 1; }
.box { background: var(--agent-surface); border: 1px solid var(--agent-border); border-radius: var(--agent-radius); padding: 8px 8px 6px; position: relative; transition: border-color .15s, box-shadow .15s; }
/* The host's mention picker positions itself against the composer box (e.g. bottom: 100%). */
.mention { position: static; }
.box:focus-within { border-color: var(--agent-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--agent-primary) 12%, transparent); }
.input { background: none; border: 0; color: inherit; display: block; font: inherit; line-height: 1.5; max-height: var(--agent-composer-max-height); min-height: 44px; outline: none; padding: 2px 6px; resize: none; width: 100%; }
.input::placeholder { color: var(--agent-muted); }
/* The rich-text composer: a contenteditable box that looks like the textarea. */
.input--rich { cursor: text; overflow-wrap: anywhere; overflow-y: auto; position: relative; white-space: pre-wrap; }
.input--rich.is-empty::before { color: var(--agent-muted); content: attr(data-placeholder); left: 6px; pointer-events: none; position: absolute; right: 6px; top: 2px; }
.input--rich[contenteditable="false"] { cursor: default; opacity: .6; }
.input--rich b, .input--rich strong, .bubble strong { font-weight: 600; }
.row { align-items: center; display: flex; gap: 2px; margin-top: 2px; }
.hint { color: var(--agent-muted); font-size: 11px; margin-left: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hint:empty { display: none; }

/* Composer menus ("+", options, model): cards like list_pocket's Vuetify menus. */
.model-trigger { gap: 2px; margin-right: 2px; max-width: min(220px, 40cqw); padding-right: 6px; }
.model-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-pop { background: var(--agent-surface); border: 1px solid var(--agent-border); border-radius: 8px; bottom: calc(100% + 6px); box-shadow: 0 5px 5px -3px rgba(0, 0, 0, .2), 0 8px 10px 1px rgba(0, 0, 0, .14), 0 3px 14px 2px rgba(0, 0, 0, .12); color: var(--agent-text); display: flex; flex-direction: column; max-height: min(420px, 60vh); max-width: calc(100cqw - 24px); min-width: 220px; overflow: hidden; position: absolute; z-index: 20; }
.menu-pop--start { left: 0; }
.menu-pop--end { right: 0; }
.menu-pop--model { width: 380px; }

/* The context ring and its card (contextUsage). */
.ctx { position: relative; display: inline-flex; }
.ctx[hidden] { display: none; }
.ctx-ring { display: block; transform: rotate(-90deg); }
.ctx-track { fill: none; stroke: var(--agent-border); stroke-width: 2.5; }
.ctx-arc { fill: none; stroke: var(--agent-primary); stroke-linecap: round; stroke-width: 2.5; transition: stroke-dashoffset .3s; }
.ctx[data-level="high"] .ctx-arc { stroke: var(--agent-warning); }
.ctx[data-level="critical"] .ctx-arc { stroke: var(--agent-error); }
.ctx--busy .ctx-ring { animation: ctx-spin 1s linear infinite; }
@keyframes ctx-spin { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }
@media (prefers-reduced-motion: reduce) { .ctx--busy .ctx-ring { animation: none; } .ctx-arc { transition: none; } }
.ctx-card { background: var(--agent-surface); border: 1px solid var(--agent-border); border-radius: 12px; bottom: calc(100% + 8px); box-shadow: 0 12px 32px rgba(15, 23, 42, .18), 0 2px 6px rgba(15, 23, 42, .08); color: var(--agent-text); display: flex; flex-direction: column; gap: 4px; padding: 12px; position: absolute; right: -40px; width: min(280px, calc(100cqw - 24px)); z-index: 22; }
.ctx-card[hidden] { display: none; }
.ctx-used { font-weight: 600; }
.ctx-tokens, .ctx-summary, .ctx-hint { color: var(--agent-muted); font-size: 12px; }
.ctx-summary[hidden], .ctx-hint[hidden], .ctx-compact[hidden] { display: none; }
.ctx-compact { align-self: flex-start; margin-top: 6px; }
.ctx-hint { line-height: 1.4; margin: 2px 0 0; }
:host([theme="dark"]) .ctx-card { box-shadow: 0 12px 32px rgba(0, 0, 0, .55), 0 0 0 1px rgba(255, 255, 255, .04); }
.menu-pop--add:has(.menu-form) { width: 380px; }
.menu-body { overflow-y: auto; padding: 4px 0; }
.menu-group { background: var(--agent-surface); color: var(--agent-muted); font-size: 11px; letter-spacing: .04em; padding: 8px 12px 4px; position: sticky; text-transform: uppercase; top: 0; z-index: 1; }
.menu-item { align-items: center; background: none; border: 0; color: inherit; cursor: pointer; display: flex; font: inherit; font-size: 13px; gap: 10px; min-height: 34px; padding: 5px 12px; text-align: left; width: 100%; }
.menu-item:hover:not(:disabled), .menu-item:focus-visible { background: var(--agent-surface-alt); outline: none; }
.menu-item:disabled { cursor: default; opacity: .45; }
.menu-item--sel, .menu-item--sel:hover:not(:disabled) { background: color-mix(in srgb, var(--agent-primary) 12%, transparent); }
.menu-icon { color: var(--agent-muted); }
.menu-text-col { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.menu-label, .menu-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-desc { color: var(--agent-muted); font-size: 12px; }
.menu-check { color: var(--agent-primary); visibility: hidden; }
.menu-item[aria-checked="true"] .menu-check { visibility: visible; }
.menu-sep { border-top: 1px solid var(--agent-border); margin: 4px 0; }
.menu-empty { color: var(--agent-muted); font-size: 12px; margin: 0; padding: 8px 12px; }
.menu-searchbar { align-items: center; border-bottom: 1px solid var(--agent-border); color: var(--agent-muted); display: flex; gap: 6px; padding: 6px 10px; }
.menu-search { background: none; border: 0; color: var(--agent-text); flex: 1; font: inherit; font-size: 13px; min-width: 0; outline: none; padding: 4px 0; }
.menu-form { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.menu-title { font-size: 13px; font-weight: 600; }
.menu-field { background: var(--agent-surface); border: 1px solid var(--agent-border); border-radius: 6px; color: var(--agent-text); font: inherit; font-size: 13px; padding: 6px 8px; width: 100%; }
.menu-field:focus { border-color: var(--agent-primary); outline: none; }
.menu-text { max-height: 40vh; min-height: 120px; resize: vertical; }
.menu-problem { color: var(--agent-error); font-size: 12px; }
.menu-actions { display: flex; gap: 6px; justify-content: flex-end; }

.drop { align-items: center; background: color-mix(in srgb, var(--agent-surface) 88%, transparent); border: 2px dashed var(--agent-primary); border-radius: 12px; color: var(--agent-primary); display: flex; flex-direction: column; font-weight: 500; gap: 8px; inset: 8px; justify-content: center; pointer-events: none; position: absolute; z-index: 5; }

@container (max-width: 380px) { .hint { display: none; } }
:host([floating][theme="dark"]) .panel { box-shadow: 0 12px 36px rgba(0, 0, 0, .6); }
`;
