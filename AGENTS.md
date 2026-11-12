# AGENTS.md: agent-panel

This is the contract for AI agents that use, extend or change `<agent-panel>`. For the
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

## 2. Hard rules

1. This package imports nothing outside its own files: no frameworks, no markdown
   library, no icon package, no app code. It has zero dependencies by design, and
   `package.json` must keep no `dependencies`. App-specific behaviour belongs in a
   subclass inside the app that uses the panel.
2. `agent-panel.js` must not register a tag as a side effect. Only `index.js` calls
   `AgentPanelElement.define()`. Subclasses define their own tag.
3. Anything that returns HTML for `innerHTML` (`renderMarkdown`, the `markdown` property,
   `h(…, { html })`) must return sanitized markup. The default renderer escapes
   everything. Never pass model output to `html` unsanitized.
4. Every event is dispatched with `bubbles: true, composed: true`, through `_emit()`.
5. Keep `attachments.mjs` free of DOM access beyond the `File` and `DataTransfer` objects
   it's given, so it stays testable under `node --test`.
6. Public names (attributes, properties, events, slots, parts, CSS tokens, `labels` keys)
   are API. Renaming one is a breaking change: update `README.md`, this file and the
   tests together, and release it under a new minor version while the version is `0.x`
   (see §9). Apps that use the panel pin a tag, so they only pick up the change when they
   update.

## 3. Files

| Path | Contents |
|---|---|
| `agent-panel.js` | `AgentPanelElement` class, `h()`, `icon()`; re-exports `DEFAULT_LIMITS`, `formatBytes`, `readAsBase64`. Exported as `agent-panel/element` |
| `attachments.mjs` | Pure helpers: `DEFAULT_LIMITS`, `extensionFor`, `filesFromDataTransfer`, `pastedFiles`, `nameFor`, `matchesAccept`, `formatBytes`, `attachmentProblem`, `readAsBase64`. Exported as `agent-panel/attachments` |
| `styles.js` | `STYLES`: the base shadow CSS and the token defaults |
| `icons.js` | `ICONS`: MDI SVG paths (Apache-2.0), keyed `paperclip, send, stop, close, chevron, check, alert, file, image, upload` |
| `index.js` | Defines `<agent-panel>` and re-exports everything from `agent-panel.js` and `attachments.mjs`. This is the package's main entry, `agent-panel` |
| `test/attachments.test.mjs` | Node tests for `attachments.mjs` (`npm test`) |
| `package.json` | `type: module`, the `exports` map, no dependencies. Apps install it with `npm install github:compdani/agent-panel#vX.Y.Z` |

## 4. Type declarations

```ts
type Role = 'user' | 'assistant' | string;

interface TextEntry  { id: string; type: 'text'; role: Role; content: string }
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

declare class AgentPanelElement extends HTMLElement {
  static tagName: string;                       // 'agent-panel'
  static styles: string;                        // collected base → subclass, appended in order
  static readonly observedAttributes: string[];
  static define(tag?: string, registry?: CustomElementRegistry): typeof AgentPanelElement; // idempotent
  static readAsBase64(file: Blob): Promise<string>;

  entries: Entry[];               // non-array → []
  suggestions: string[];          // non-array → []
  markdown: ((text: string) => string) | null;   // non-function → null; setting it redraws all entries
  labels: Labels;                 // setter merges a Partial<Labels> over the defaults; redraws all entries
  draft: string;
  readonly attachments: Attachment[];            // shallow copy
  readonly limits: Limits;
  error: string;                  // reflects the `error` attribute ('' removes it)
  running: boolean; disabled: boolean; closable: boolean; // reflect boolean attributes

  submit(text?: string): boolean;
  addFiles(files: Iterable<File> | FileList, opts?: { pasted?: boolean }): { added: Attachment[]; problems: string[] };
  removeAttachment(id: string): void;
  clearAttachments(): void;
  focus(options?: FocusOptions): void;          // focuses the textarea
  scrollToBottom(opts?: { force?: boolean }): void;
  defineEntry(type: string, render: ((entry: Entry, panel: this) => Node) | null): this;
  emitAction(action: string, detail?: object): boolean; // dispatches 'agent-action'

  // Overridable hooks
  renderEntry(entry: Entry): Node | null;       // null → <slot name="entry-{id}">
  renderText(entry: TextEntry): Node;
  renderTools(entry: ToolsEntry): Node;
  renderMarkdown(text: string): string;         // must return safe HTML
}

declare function h(tag: string, props?: Record<string, unknown> | null, ...children: unknown[]): HTMLElement;
declare function icon(name: keyof typeof ICONS, size?: number, className?: string): SVGSVGElement;
```

## 5. Attributes

| Attribute | Observed (redraws on change) | Read when |
|---|---|---|
| `heading`, `placeholder`, `hint`, `empty-title`, `empty-text` | yes | each redraw |
| `running`, `disabled`, `closable`, `error`, `no-attachments`, `accept` | yes | each redraw, and when used |
| `max-file-size`, `max-total-size`, `max-files` | no | `addFiles()`, through `limits` |
| `sticky-attachments` | no | `submit()` |
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
     `{ text: trimmed, attachments: copy }`.
  3. If the event wasn't cancelled, it clears the draft (only when `text` was left out)
     and clears the attachments (unless `sticky-attachments` is set), then forces scroll
     following.
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

### Slots

`header-start` (its default content is `heading`), `header-actions`, `subheader` (its row
is hidden while the slot is empty), `empty` (its default content is the empty-state title
and text), `transcript-end`, `composer-chips` (the chip row is hidden while there are no
attachments and the slot is empty), `composer-actions`, and `entry-{id}`. A slot counts as
filled when an element is assigned to it, or a text node that isn't just whitespace.

### Parts and tokens

- **Parts**: `panel header heading close subheader transcript entries empty suggestion
  bubble message tools error composer attachments attachment input attach hint send stop
  drop`.
- **Tokens** (defaults in `styles.js`): `--agent-primary --agent-on-primary
  --agent-surface --agent-surface-alt --agent-text --agent-muted --agent-border
  --agent-error --agent-success --agent-warning --agent-info --agent-font-size
  --agent-radius --agent-composer-max-height`.
- **Reusable classes in the shadow root**: `btn btn--primary btn--tonal btn--icon card
  badge alert tone-{success,error,warning,info,muted} spinner`.

## 7. Recipes

| Goal | Do this |
|---|---|
| Show a new kind of row | Subclass and override `renderEntry` (call `super` for other types), or `defineEntry(type, fn)`, or render it from the host into `slot="entry-{id}"` |
| Add a button that reaches the host | Inside the renderer: `h('button', { class: 'btn btn--tonal', onClick: () => this.emitAction('name', { id }) }, 'Label')`. In the host, listen for `agent-action` |
| Disable a row's buttons while busy | Put `busy` in the entry object, which redraws it (D3) |
| Add a header or composer control from a framework | Light-DOM child with `slot="header-actions"`, `"composer-actions"` and so on. Wrap framework components in a plain element that carries the `slot` attribute |
| Keep files for follow-up turns | `sticky-attachments`. The host re-reads `panel.attachments` when retrying |
| Block sending without losing input | `event.preventDefault()` in `agent-submit` |
| Translate | `panel.labels = { … }`. The `attachmentProblem` messages aren't covered yet |
| Retheme | Set the `--agent-*` tokens on the host. In a subclass, set them in `:host {}` inside `static styles` |
| Change which files are allowed | The `accept` / `max-*` attributes. Keep them in line with what the backend validates |
| Add a built-in feature to the base | Edit `agent-panel.js` / `styles.js`. Keep the rules in §2. Add it to §4–6 here and to `README.md`. Add a test in `test/` if `attachments.mjs` changes. Check changes visible in the browser in an app that uses the panel (§9) |

## 8. Pitfalls

- **Upgrade order.** Frameworks decide between property and attribute by checking
  `key in el` when they first draw. Import the defining module (`agent-panel`, or the
  module that defines your subclass) before the host first draws, or arrays arrive as `"[object
  Object]"` attributes. The panel replays properties set before it was defined
  (`connectedCallback` upgrades `entries`, `suggestions`, `markdown`, `labels`, `draft`,
  `error`, `running`, `disabled`, `closable`), but attributes already set can't be turned
  back into data.
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
- **Shadow DOM in tests.** In Cypress, use `{ includeShadowDom: true }`; in Playwright,
  CSS selectors already reach into open shadow roots. Shadow content is
  found by class (`.message`, `.bubble`, `.chip`, `.scroll`, `.panel`, `.attach-error`,
  `.working`) or by `[data-role]`, `[data-tool-id]`, `[data-attachment-id]`,
  `[data-entry-id]`.
- **Synthetic paste and drop in tests.** Build a real `win.DataTransfer`, add files with
  `items.add(new win.File(...))`, and dispatch `new win.ClipboardEvent('paste', {
  clipboardData, bubbles: true, composed: true, cancelable: true })` on the textarea, or
  `new win.DragEvent('drop', { dataTransfer, … })` on `.panel`.
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
