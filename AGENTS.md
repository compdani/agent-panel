# AGENTS.md: agent-panel

This is the contract for AI agents that use, extend or change `<agent-panel>` and
`<agent-page>`. For the
human-oriented guide, see `README.md` in this folder. This file is the specification: if
the code and this file disagree, fix one of them in the same change.

## 1. What this is

- `<agent-panel>` is a framework-free Web Component (Custom Element v1 with an open
  Shadow DOM) that draws an AI-agent chat: transcript, composer and attachments.
- The host owns the conversation state and all network I/O.
- The panel owns: the draft text, the pending attachments, scroll following, drag and
  paste handling, and drawing.
- Data goes in through properties (`entries`, `running`, `error`, …). Intent comes out
  through DOM events (`agent-submit`, `agent-stop`, `agent-action`, …).
- `<agent-page>` (`AgentPageElement`) is a subclass of `AgentPanelElement` laid out for a
  whole page. It adds a conversation sidebar, a renamable title and a context bar. Every
  rule here about the panel holds for the page; §6 "Page" adds the page-only rules.
- "The element" below means either one.

## 2. Hard rules

1. This package imports nothing outside its own files: no frameworks, no markdown
   library, no icon package, no app code. It has zero dependencies by design, and
   `package.json` must keep no `dependencies`. App-specific behaviour belongs in a
   subclass inside the app that uses the panel.
2. Each entry point defines exactly one tag: `index.js` defines `<agent-panel>`, and
   `page.js` defines `<agent-page>`. `agent-panel.js` and `agent-page.js` define nothing.
   Importing the page must never define `<agent-panel>`, and the other way round.
   Subclasses define their own tag.
3. Anything that returns HTML for `innerHTML` (`renderMarkdown`, the `markdown` property,
   `h(…, { html })`) must return sanitized markup. The default renderer escapes
   everything. Never pass model output to `html` unsanitized.
4. Every event is dispatched with `bubbles: true, composed: true`, through `_emit()`.
5. `layout(panel)` runs inside the base constructor, before a subclass's own class
   fields exist. Anything `layout` or `_render` needs must be created inside `layout`, as
   `AgentPageElement` does with `this._page`. Subclasses must not declare class fields
   that `layout` or `_render` read.
6. Keep `attachments.mjs` free of DOM access beyond the `File` and `DataTransfer` objects
   it's given, so it stays testable under `node --test`.
7. Public names (attributes, properties, events, slots, parts, CSS tokens, `labels` keys)
   are API. Renaming one is a breaking change: update `README.md`, this file and the
   tests together, and release it under a new minor version while the version is `0.x`
   (see §9). Apps that use the panel pin a tag, so they only pick up the change when they
   update.

## 3. Files

| Path | Contents |
|---|---|
| `agent-panel.js` | `AgentPanelElement` class, `h()`, `icon()`, `referenceKey()`; re-exports `DEFAULT_LIMITS`, `formatBytes`, `readAsBase64`. Exported as `agent-panel/element` |
| `agent-page.js` | `AgentPageElement` class (extends `AgentPanelElement`) and its CSS. Exported as `agent-panel/page-element` |
| `attachments.mjs` | Pure helpers: `DEFAULT_LIMITS`, `extensionFor`, `filesFromDataTransfer`, `pastedFiles`, `nameFor`, `matchesAccept`, `formatBytes`, `attachmentProblem`, `readAsBase64`. Exported as `agent-panel/attachments` |
| `styles.js` | `STYLES`: the base shadow CSS and the token defaults |
| `icons.js` | `ICONS`: MDI SVG paths (Apache-2.0), keyed `paperclip, send, stop, close, chevron, check, alert, file, image, upload, at, link, history, plus, delete` |
| `index.js` | Defines `<agent-panel>` and re-exports everything from `agent-panel.js` and `attachments.mjs`. This is the package's main entry, `agent-panel` |
| `page.js` | Defines `<agent-page>` and re-exports `agent-page.js`, the panel's `AgentPanelElement`, `h`, `icon` and `referenceKey`, and `attachments.mjs`. Exported as `agent-panel/page` |
| `test/attachments.test.mjs` | Node tests for `attachments.mjs` (`npm test`) |
| `package.json` | `type: module`, the `exports` map, no dependencies. Apps install it with `npm install github:compdani/agent-panel#vX.Y.Z` |

## 4. Type declarations

```ts
type Role = 'user' | 'assistant' | string;

interface Reference  { type: string; id: string | number; label?: string; [extra: string]: unknown }
// Identity is `${type}:${id}` (referenceKey). Lists are deduplicated by it.

interface TextEntry  { id: string; type: 'text'; role: Role; content: string;
                       references?: Reference[] } // chips above user bubbles
interface ToolCall   { id?: string; key?: string; name: string; label?: string;
                       status: 'running' | 'completed' | 'failed'; detail?: unknown }
interface ToolsEntry { id: string; type: 'tools'; label?: string; tools: ToolCall[] }
type Entry = TextEntry | ToolsEntry | ({ id: string; type: string } & Record<string, unknown>);

interface Attachment {
  id: string;            // "att-<n>", unique within the page
  file: File;            // renamed copy when the name was generated or made unique
  name: string; type: string; size: number; pasted: boolean;
  previewUrl: string;    // blob: URL for image/*, else ""; revoked on removal
  base64(): Promise<string>; // no data: prefix; memoized
}

interface Limits { accept: string; maxFileSize: number; maxTotalSize: number; maxFiles: number }

interface Labels {
  attach: string; attachHint: string; close: string; dismiss: string; drop: string;
  remove: string; send: string; stop: string; working: string; usedTools(n: number): string;
}

interface PageLabels extends Labels {
  cancel: string; conversations: string; delete: string; deleteConversation(title: string): string;
  inContext: string; newChat: string; noConversations: string; rename: string; titleLabel: string;
  untitled: string;
}

interface Conversation { id: string | number; title?: string; updated?: string | number | Date; href?: string }

declare class AgentPanelElement extends HTMLElement {
  static tagName: string;                       // 'agent-panel'
  static styles: string;                        // collected base → subclass, appended in order
  static readonly observedAttributes: string[];
  static define(tag?: string, registry?: CustomElementRegistry): typeof AgentPanelElement; // idempotent
  static readAsBase64(file: Blob): Promise<string>;
  static defaultLabels: Labels;                 // subclasses spread and extend it

  entries: Entry[];               // non-array → []
  suggestions: string[];          // non-array → []
  markdown: ((text: string) => string) | null;   // non-function → null; setting it redraws all entries
  labels: Labels;                 // setter merges a Partial<Labels> over the defaults; redraws all entries
  draft: string;
  readonly attachments: Attachment[];            // shallow copy
  references: Reference[];                       // returns a copy; setter dedupes and drops items without type/id
  readonly mention: { open: boolean; query: string };
  readonly limits: Limits;
  error: string;                  // reflects the `error` attribute ('' removes it)
  running: boolean; disabled: boolean; closable: boolean; // reflect boolean attributes

  submit(text?: string): boolean;
  addFiles(files: Iterable<File> | FileList, opts?: { pasted?: boolean }): { added: Attachment[]; problems: string[] };
  removeAttachment(id: string): void;
  clearAttachments(): void;
  addReference(ref: Reference): boolean;         // false if already present (or invalid)
  removeReference(refOrKey: Reference | string): void;
  openMention(): void;                           // query '', not tied to typed text
  closeMention(): void;
  focus(options?: FocusOptions): void;          // focuses the textarea
  scrollToBottom(opts?: { force?: boolean }): void;
  defineEntry(type: string, render: ((entry: Entry, panel: this) => Node) | null): this;
  emitAction(action: string, detail?: object): boolean; // dispatches 'agent-action'

  // Overridable hooks
  renderEntry(entry: Entry): Node | null;       // null → <slot name="entry-{id}">
  renderText(entry: TextEntry): Node;
  renderTools(entry: ToolsEntry): Node;
  renderMarkdown(text: string): string;         // must return safe HTML
  renderReference(ref: Reference, opts?: { removable?: boolean }): Node;
  referenceIcon(ref: Reference): Node;
  fileProblem(file: File, current: Attachment[]): string; // '' = allowed; default = limits
  layout(panel: HTMLElement): HTMLElement;      // runs in the constructor; returns the shadow root's content
}

declare class AgentPageElement extends AgentPanelElement {
  static tagName: string;                       // 'agent-page'
  static defaultLabels: PageLabels;
  conversations: Conversation[];                // items without id are dropped
  active: string;                               // reflects `active`
  renamable: boolean;                           // reflects `renamable`
  contextReferences: Reference[];
  formatDate: (value: unknown) => string;       // non-function → built-in
  openSidebar(): void; closeSidebar(): void;    // the drawer below 760px
  startRename(): void;                          // no-op unless renamable
}

declare function referenceKey(ref: Reference): string;

declare function h(tag: string, props?: Record<string, unknown> | null, ...children: unknown[]): HTMLElement;
declare function icon(nameOrPath: keyof typeof ICONS | string, size?: number, className?: string): SVGSVGElement;
// A string that isn't an icon name and starts with M/m is used as the SVG path itself.
```

## 5. Attributes

| Attribute | Observed (redraws on change) | Read when |
|---|---|---|
| `heading`, `placeholder`, `hint`, `empty-title`, `empty-text` | yes | each redraw |
| `running`, `disabled`, `closable`, `error`, `no-attachments`, `accept` | yes | each redraw, and when used |
| `max-file-size`, `max-total-size`, `max-files` | no | `addFiles()`, through `limits` |
| `sticky-attachments` | no | `submit()` |
| `mention-trigger` | no | each keystroke (`input`) |
| Page: `active`, `renamable`, `no-sidebar` | yes | each redraw (`no-sidebar` is CSS only) |
| `theme="dark"` | no (CSS only) | — |

The defaults (`DEFAULT_LIMITS`) are: `accept: 'image/*,application/pdf,text/*'`,
`maxFileSize: 6 MiB`, `maxTotalSize: 20 MiB`, `maxFiles: 12`. A limit attribute that is
negative or not a number falls back to its default.

## 6. Behaviour

### Drawing

- **D1.** Setters and attribute changes schedule a single redraw in a microtask. Many
  synchronous sets produce one redraw.
- **D2.** Entries are keyed by `String(entry.id)`. A missing or duplicate id falls back
  to `#<index>`, which makes reordering unstable, so always give unique, stable ids.
- **D3.** An entry is redrawn only when `JSON.stringify(entry)` changes. An entry that
  can't be serialized is redrawn on every pass. So: **pass plain data**. Behaviour that
  depends on things outside the entry (busy flags, for example) must be copied into the
  entry, or it won't show.
- **D4.** On a redraw, `<details>` elements carrying a `data-key` keep their open state.
  The built-in tool groups use `tools:<entry.id>` and `tool:<key ?? id ?? index>`.
- **D5.** The order in which `renderEntry` picks a renderer: instance renderers
  (`defineEntry`), then `text`, then `tools`, then `null` (meaning a slot). A subclass that
  overrides `renderEntry` runs before all of these, and should call `super.renderEntry`
  for types it doesn't handle.
- **D6.** Each entry's root node gets `data-entry-id`. Text nodes get `data-role`. Tool
  groups get `data-status`, and each tool gets `data-tool-id`.
- **D7.** The empty state is visible exactly when `entries.length === 0`.
- **D8.** Scroll following: the panel follows when the reader is within 80px of the
  bottom. A `ResizeObserver` on the transcript keeps it at the bottom while content
  (including slotted content) grows. `submit()` and `scrollToBottom({ force: true })`
  turn following back on.

### Composer

- **C1.** Enter (without Shift, and not during IME composition) calls `submit()`.
- **C2.** `submit(text?)` does the following:
  1. It returns `false` if the trimmed text is empty, or the panel is `running` or
     `disabled`.
  2. It fires a cancelable `agent-submit` with
     `{ text: trimmed, attachments: copy, references: copy }`.
  3. If the event wasn't cancelled, it:
     - clears the draft (only when `text` was left out);
     - clears the attachments, unless `sticky-attachments` is set;
     - clears the references (always; they are never sticky);
     - closes any mention;
     - forces scroll following.
  4. It returns `true` unless the event was cancelled.
- **C3.** Clicking a suggestion calls `submit(suggestionText)`. The draft is kept.
- **C4.** While `running`, the textarea stays enabled, Stop is shown and Send is hidden.
  Send is disabled whenever the draft is blank or the panel is `disabled`.
- **C5.** The textarea grows to fit its content, up to `--agent-composer-max-height`.

### Attachments

- **A1.** Files arrive from three places, all through `addFiles()`: the picker
  (`<input type=file multiple>` with `accept` = `limits.accept`), `paste` on the panel
  (`pastedFiles(clipboardData)`, with `pasted: true`) and `drop` on the panel
  (`filesFromDataTransfer`).
- **A2.** `addFiles` does nothing (and returns empty results) when `no-attachments` or
  `disabled` is set. Otherwise, for each file in order:
  1. Pick a name with `nameFor`.
  2. Make the name unique among current attachments (`stem-2.ext`, `stem-3.ext`, …).
  3. Check `attachmentProblem` against the current list.
  4. Either add the file, or record the problem.

  Problems are joined into the inline error, which the next successful `addFiles` or a
  removal clears. The panel fires `agent-attachment-error` if there were any problems,
  then `agent-attachments-change` if anything was added.
- **A3.** `nameFor` renames a file only when its name is empty, or when it's pasted and
  named generically (`image.png`, `image.jpg`, `image.jpeg`, `image.gif`, `image.webp`).
  The new name is `pasted-image-YYYYMMDD-HHMMSS[-N].ext`, or `pasted-file-…` for
  non-images.
- **A4.** `pastedFiles` returns `[]`, leaving the text paste alone, when the clipboard has
  non-empty `text/plain`, every file in it is `image/*`, and no file's name equals the
  text. This handles spreadsheets and word processors, which copy a picture alongside the
  text.
- **A5.** Rules for `matchesAccept`:
  - A rule starting with `.` matches the end of the file name.
  - `x/*` matches the start of the MIME type.
  - Anything else must equal the MIME type exactly.
  - An empty `accept` allows every file.
  - Matching ignores case.
- **A6.** `attachmentProblem` checks in this order: type, count, per-file size, total
  size. Its messages are English and can't be changed through `labels`.
- **A7.** Drag and drop reacts only when `dataTransfer.types` includes `Files`. The
  overlay counts `dragenter` and `dragleave` to avoid flickering.
- **A8.** `addFiles` checks each file with the `fileProblem(file, current)` hook. The
  default is `attachmentProblem(file, current, this.limits)`. Overrides should call
  `super.fileProblem` to keep the limits.
- **A9.** Paste and drop listeners sit on the element's root (the result of `layout`), so
  on the page, dropping onto the sidebar attaches too.

### References

- **R1.** `references` holds `Reference`s, deduplicated by `referenceKey`. Items with no
  `type` or `id` are dropped.
- **R2.** References show as removable chips in the composer's chip row, before the file
  chips. The row is hidden while there are no references, no attachments and nothing in
  the `composer-chips` slot.
- **R3.** `addReference`, `removeReference` and sending all fire
  `agent-references-change`. Assigning `references` directly does not fire it.
- **R4.** Clicking a chip's label fires `agent-reference-open { reference }`, anywhere a
  chip appears: in the composer, on user messages, and in the page's context bar.
- **R5.** `referenceIcon(ref)` gives each chip its icon. The default is `file` for
  `type: 'file'` and `link` for anything else.

### Mentions

- **M1.** Mentions are off unless `mention-trigger` is set. On each `input`, the text
  before the caret is matched against `(^|\s)TRIGGER([^\sTRIGGER]*)$`:
  - If it matches, the mention opens or updates, with
    `{ query, from: index of the trigger }`.
  - If it doesn't match and the mention came from typing, the mention closes.
  - A mention opened with `openMention()` (`from = -1`) is not closed by typing.
- **M2.** `agent-mention { open, query }` fires only when the state actually changes (it
  opens, closes, or the query changes).
- **M3.** While a mention is open, the keys ↑, ↓, Enter, Tab and Escape first fire a
  cancelable `agent-mention-key { key, event }`.
  - If a listener cancels it, the keydown is prevented and nothing else happens.
  - If not, Escape closes the mention, and Enter goes on to submit.
- **M4.** `addReference` while the mention is open from typing (`from >= 0`) cuts
  `trigger + query` out of the draft, puts the caret there, closes the mention and
  focuses the textarea.
- **M5.** The `mention` slot sits inside the composer box (`position: relative`). Its
  wrapper is `position: static` and is hidden while no mention is open. Host pickers
  position themselves against the box, e.g. `position: absolute; bottom: 100%`.

### Page

- **P1.** The layout is a grid of the sidebar (`--agent-sidebar-width`) and the panel. The
  transcript's and composer's content is centred, at most `--agent-content-max-width`
  wide.
- **P2.** The host element is the size container (`container: agent-page /
  inline-size`). A container query can't restyle its own container, so the grid rules
  live inside the shadow root. At `max-width: 760px`:
  - the sidebar becomes an off-screen drawer;
  - the history button appears;
  - `.page--drawer` opens the drawer and shows a scrim.
  The drawer closes on a scrim click, Escape, choosing a conversation, or New chat.
- **P3.** Conversation rows are `<a href>` when `href` is set, otherwise `<button>`.
  - A plain left click fires a cancelable `agent-select-conversation { id, conversation }`.
  - If the event is cancelled, or there's no `href`, the click's default is prevented.
  - Clicks with a modifier key or a non-left button are left to the browser and fire no
    event.
  - The row matching `active` gets `.conv--active` and `aria-current="page"`.
- **P4.** Deleting is two steps: the delete button sets the row to `.conv--confirm`,
  confirming fires `agent-delete-conversation { id, conversation }`, and cancelling
  restores the row. The page never removes a row itself.
- **P5.** Renaming happens only when `renamable` is set. Clicking the title (or calling
  `startRename()`) swaps in an input with the current `heading`.
  - Enter or blur commits. If the trimmed value is non-empty and different, the page
    fires a cancelable `agent-rename { title }`; unless it's cancelled, the page sets the
    `heading` attribute itself.
  - Escape discards the edit.
  - The title shows `labels.untitled` while `heading` is empty.
- **P6.** The context bar shows `contextReferences` as chips that can't be removed, after
  `labels.inContext`. It's hidden while the list is empty.
- **P7.** `formatDate(updated)` labels each row. The built-in format shows the time for
  today, `Mon D` within this year, and `Mon D, YYYY` otherwise.

### Events (all `bubbles`, `composed`)

| Event | Detail | Cancelable | Fired by |
|---|---|---|---|
| `agent-submit` | `{ text, attachments }` | yes | `submit()` |
| `agent-stop` | `null` | no | Stop button |
| `agent-close` | `null` | no | Close button (the panel doesn't hide itself) |
| `agent-action` | `{ action, ...detail }` | yes | `emitAction()` |
| `agent-attachments-change` | `{ attachments }` | no | add, remove, clear |
| `agent-attachment-error` | `{ problems }` | no | `addFiles()` |
| `agent-error-dismiss` | `null` | no | Error banner's close button (after `error = ''`) |
| `agent-references-change` | `{ references }` | no | `addReference`, `removeReference`, submit (R3) |
| `agent-reference-open` | `{ reference }` | no | Click on a reference chip (R4) |
| `agent-mention` | `{ open, query }` | no | Mention state changes (M2) |
| `agent-mention-key` | `{ key, event }` | yes | Navigation keys while a mention is open (M3) |
| Page: `agent-select-conversation` | `{ id, conversation }` | yes | Left click on a row (P3) |
| Page: `agent-new-conversation` | `null` | no | New chat button |
| Page: `agent-delete-conversation` | `{ id, conversation }` | no | Confirmed delete (P4) |
| Page: `agent-rename` | `{ title }` | yes | Committed title edit (P5) |

### Slots

`header-start` (its default content is `heading`), `header-actions`, `subheader` (its row
is hidden while the slot is empty), `empty` (its default content is the empty-state title
and text), `transcript-end`, `composer-chips` (the chip row is hidden while there are no
attachments and the slot is empty), `composer-actions`, `mention` (M5), and
`entry-{id}`. The page adds `sidebar-start` and `sidebar-end`, and fills `header-start`'s
default content with its title and rename field. A slot counts as
filled when an element is assigned to it, or a text node that isn't just whitespace.

### Parts and tokens

- **Parts**: `panel header heading close subheader transcript entries empty suggestion
  bubble message tools error composer attachments attachment reference mention input attach
  hint send stop drop`. The page adds `page sidebar new-chat conversation-list conversation
  history title title-input context-bar`.
- **Tokens** (defaults in `styles.js`): `--agent-primary --agent-on-primary
  --agent-surface --agent-surface-alt --agent-text --agent-muted --agent-border
  --agent-error --agent-success --agent-warning --agent-info --agent-font-size
  --agent-radius --agent-composer-max-height`. The page adds `--agent-sidebar-width`
  (250px) and `--agent-content-max-width` (860px).
- **Reusable classes in the shadow root**: `btn btn--primary btn--tonal btn--icon chip
  card badge alert tone-{success,error,warning,info,muted} spinner`. The page adds
  `btn--sm btn--danger`.

## 7. Recipes

| Goal | Do this |
|---|---|
| Show a new kind of row | Subclass and override `renderEntry` (call `super` for other types), or `defineEntry(type, fn)`, or render it from the host into `slot="entry-{id}"` |
| Add a button that reaches the host | Inside the renderer: `h('button', { class: 'btn btn--tonal', onClick: () => this.emitAction('name', { id }) }, 'Label')`. In the host, listen for `agent-action` |
| Disable a row's buttons while busy | Put `busy` in the entry object, which redraws it (D3) |
| Add a header or composer control from a framework | Light-DOM child with `slot="header-actions"`, `"composer-actions"` and so on. Wrap framework components in a plain element that carries the `slot` attribute |
| Keep files for follow-up turns | `sticky-attachments`. The host re-reads `panel.attachments` when retrying |
| Block sending without losing input | `event.preventDefault()` in `agent-submit` |
| @-mentions of app objects | Set `mention-trigger="@"`. Render a picker into `slot="mention"`, search on `agent-mention`, handle keys on `agent-mention-key` (cancel the event when used), and call `addReference()` on pick (§6 Mentions) |
| Attach app objects without typing | A button in `composer-actions` that calls `openMention()`, or `addReference()` directly |
| Pre-attach something, e.g. from a URL | Set `el.references = [...]` after mount |
| Extra rules for which files are allowed | Override `fileProblem(file, current)`, returning `rule(file) \|\| super.fileProblem(file, current)` |
| Icons for your reference types | Override `referenceIcon(ref)`, returning `icon(pathFromYourIconSet, 13)` |
| Use the page with a client-side router | Give conversations an `href` (so new-tab clicks work), and on `agent-select-conversation` call `preventDefault()` and route |
| Keep the page's sidebar and title in sync | After `agent-rename`, `agent-delete-conversation` and `agent-new-conversation`, update `heading`, `conversations` and `active` yourself |
| Translate | `el.labels = { … }`, with the page's extra keys on the page (`PageLabels`). The `attachmentProblem` messages aren't covered yet |
| Add your own label keys | `static defaultLabels = { ...Base.defaultLabels, mine: '…' }`, then read `this.labels.mine` |
| Retheme | Set the `--agent-*` tokens on the host. In a subclass, set them in `:host {}` inside `static styles` |
| Change which files are allowed | The `accept` / `max-*` attributes. Keep them in line with what the backend validates |
| Add a built-in feature to the base | Edit `agent-panel.js` / `styles.js`. Keep the rules in §2. Add it to §4–6 here and to `README.md`. Add a test in `test/` if `attachments.mjs` changes. Check changes visible in the browser in an app that uses the panel (§9) |

## 8. Pitfalls

- **Upgrade order.** Frameworks decide between property and attribute by checking
  `key in el` when they first draw. Import the defining module (`agent-panel`, or the
  module that defines your subclass) before the host first draws, or arrays arrive as `"[object
  Object]"` attributes. The panel replays properties set before it was defined
  (`connectedCallback` upgrades `entries`, `suggestions`, `markdown`, `labels`, `draft`,
  `references`, `error`, `running`, `disabled`, `closable`; the page also `conversations`,
  `active`, `renamable`, `contextReferences`, `formatDate`), but attributes already set
  can't be turned back into data.
- **Vue.**
  - The Vue compiler must list the tag in `compilerOptions.isCustomElement` (for Vite,
    in the `vue()` plugin's `template` options).
  - Vue keeps `slot="x"` as a plain attribute: put it on a native wrapper element, not on
    a Vue component.
  - Build `entries` in a `computed` that reads every field shown, for example by
    deep-copying with `JSON.parse(JSON.stringify(...))`, or changes made in place (a
    tool's status, a proposal's status) won't trigger an update.
  - A static boolean attribute (`closable`) works because the getters return booleans, so
    Vue maps `''` to `true`.
  - Write bindings for camel-case properties in camel case (`:contextReferences`,
    `:formatDate`). Vue checks `key in el` with the name exactly as written, so a
    hyphenated `:context-references` becomes a string attribute.
  - A Vue component placed in the `mention` slot must sit inside a native wrapper element
    (`<div slot="mention"><my-picker …/></div>`).
- **Shadow DOM in tests.** In Cypress, use `{ includeShadowDom: true }`; in Playwright,
  CSS selectors already reach into open shadow roots. Shadow content is
  found by class (`.message`, `.bubble`, `.chip`, `.scroll`, `.panel`, `.attach-error`,
  `.working`) or by `[data-role]`, `[data-tool-id]`, `[data-attachment-id]`,
  `[data-entry-id]`.
- **Synthetic paste and drop in tests.** Build a real `win.DataTransfer`, add files with
  `items.add(new win.File(...))`, and dispatch `new win.ClipboardEvent('paste', {
  clipboardData, bubbles: true, composed: true, cancelable: true })` on the textarea, or
  `new win.DragEvent('drop', { dataTransfer, … })` on `.panel`.
- **Testing local package changes in a Vite app.** Vite pre-bundles dependencies and
  caches them in `node_modules/.vite`. After copying a changed package into
  `node_modules/agent-panel`, restart Vite with `--force`, or it keeps serving the old
  code.
- **Container queries.** Never put a container query on `.page` (or `.panel`) that is
  meant to restyle that same element. Query from the host container instead (P2).
- **Closing does nothing by itself.** `agent-close` is only a request; the host must hide
  the panel.
- **Error state is shared.** The panel clears `error` when it's dismissed. The host must
  also clear its own copy on `agent-error-dismiss`, or the next redraw brings it back.
- **No virtualization.** Every redraw serializes every entry (D3). Keep transcripts to a
  reasonable length.

## 9. Checking and releasing a change

- **Tests.** `npm test` runs the Node tests in `test/`. It must pass.
- **Browser.** Rendering, paste, drop and events need a real browser. Install the change
  into an app that uses the panel (`npm install /path/to/agent-panel`, or push a branch
  and install `github:compdani/agent-panel#<branch>`), then run that app's browser tests.
- **Release.**
  1. Bump `version` in `package.json`. While it's `0.x`, a breaking change raises the
     minor version and everything else the patch version.
  2. Commit, tag `v<version>`, then `git push && git push --tags`.
  3. Apps pick up the release with `npm install github:compdani/agent-panel#v<version>`.
- **Docs.** Keep `README.md` (for people) and this file (the contract) in step with the
  code in the same commit.
