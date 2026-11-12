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
.chip-x { align-items: center; background: none; border: 0; border-radius: 50%; color: inherit; cursor: pointer; display: inline-flex; flex: none; height: 20px; justify-content: center; opacity: .7; padding: 0; width: 20px; }
.chip-x:hover { background: color-mix(in srgb, var(--agent-text) 10%, transparent); opacity: 1; }
.box { background: var(--agent-surface); border: 1px solid var(--agent-border); border-radius: var(--agent-radius); padding: 8px 8px 6px; transition: border-color .15s, box-shadow .15s; }
.box:focus-within { border-color: var(--agent-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--agent-primary) 12%, transparent); }
.input { background: none; border: 0; color: inherit; display: block; font: inherit; line-height: 1.5; max-height: var(--agent-composer-max-height); min-height: 44px; outline: none; padding: 2px 6px; resize: none; width: 100%; }
.input::placeholder { color: var(--agent-muted); }
.row { align-items: center; display: flex; gap: 2px; margin-top: 2px; }
.hint { color: var(--agent-muted); font-size: 11px; margin-left: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hint:empty { display: none; }

.drop { align-items: center; background: color-mix(in srgb, var(--agent-surface) 88%, transparent); border: 2px dashed var(--agent-primary); border-radius: 12px; color: var(--agent-primary); display: flex; flex-direction: column; font-weight: 500; gap: 8px; inset: 8px; justify-content: center; pointer-events: none; position: absolute; z-index: 5; }

@container (max-width: 380px) { .hint { display: none; } }
`;
