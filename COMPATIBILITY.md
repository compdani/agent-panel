# Compatibility notes

What each release changes for a host that already uses the components: anything
removed, renamed, moved or behaving differently, and how to keep the old behaviour.
Purely additive APIs are listed briefly; the README's "New in" sections and AGENTS.md
describe them in full.

Versioning: while the package is `0.x`, a breaking change raises the minor version
(0.4.0 → 0.5.0) and everything else raises the patch version. Every release adds a
section here, even when the answer is "nothing to change". Install a release with
`npm install github:compdani/agent-panel#v<version>`.

## 0.5.1

Nothing to change. Packaging and documentation only:

- `COMPATIBILITY.md` (this file) now ships in the package, and covers every release
  from 0.2.1 on. Before, the package didn't include it and the repository's copy stopped
  at 0.2.2.

## 0.5.0

Additive (minor because of new public names); nothing to change.

- New: the composer's context ring and card: the `contextUsage` property, the
  `context-threshold` attribute (`contextThreshold`), `openContextUsage()` /
  `closeContextUsage()`, the `agent-compact` event, and the exported `formatTokens()`.
- New parts: `context-usage`, `context-usage-button`, `context-usage-card`,
  `context-compact`. New labels: `compact`, `compactHint`, `compacting`, `context`,
  `contextSummarized`, `contextTokens`, `contextUsed`.
- Nothing appears unless the host sets `contextUsage`. When it does, the ring sits in the
  composer's action row, before the options and model menus; hosts that put their own
  controls in `composer-actions` see it next to them.

## 0.4.1

Layout changes to the `conversations-menu` switcher (added in 0.4.0):

- The switcher is now the header's title (the active conversation's title and a
  chevron), with New chat beside Close, instead of a second row under the header. While
  it is shown it hides the default `heading` text; anything in the `header-start` slot
  stays before it. Hosts that styled the old row should restyle `::part(switcher)` and
  `::part(switcher-menu)`.
- Its dropdown is a card under the title; rows always show their date and Delete.
- New: the `switcher-end` slot (under the list) and the `floating` attribute.
- Fix: the red confirm-Delete button and the coloured "Load more" kept `.btn`'s colours
  (since 0.4.0, also in the page's sidebar). Hosts that overrode those colours to work
  around it can drop the override.

## 0.4.0

The conversation list moved from the page to the panel.

- `conversations`, `active`, `hasMore` (`has-more`) and `formatDate` now exist on
  `<agent-panel>` too; `<agent-page>` inherits them and its API is unchanged.
  **Feature detection breaks:** a host that told the page from the panel with
  `'conversations' in element` (or `element.conversations !== undefined`) now sees a
  panel as a page. Check the tag name, or for `startRename()` (page only) /
  `openConversations()` (panel only).
- The conversation `labels` keys moved to the base `Labels` type; `PageLabels` keeps only
  `inContext`, `rename` and `titleLabel`. Code that sets those labels still works;
  TypeScript code that named them on `PageLabels` needs `Labels`.
- The conversation row styles and `btn--danger` moved from the page's stylesheet to the
  base one, so `::part(conversation)` styles now also reach the panel's switcher rows.
- New: `has-more` / `hasMore` with the `agent-load-more` event (a built-in "Load more"),
  so hosts can drop their own button; `<agent-panel conversations-menu>` with
  `openConversations()` / `closeConversations()`; exports `safeHref` and
  `defaultFormatDate`.

## 0.3.1

Nothing to change. `focus()` on the rich-text composer now puts the caret at the end
when focus wasn't already in it, so text typed after `addReference()` or
`openMention()` lands after the draft, as it did in the textarea.

## 0.3.0

The composer changed. This release also carries the fixes prepared as 0.2.3, which was
never tagged on its own.

- **The "+" menu replaces the paperclip** by default (attach, paste, context). The
  `no-add-menu` attribute restores the paperclip. `::part(attach)` styles still reach the
  "+" button.
- **The composer is a rich-text editor** (a `contenteditable` `div`) by default, with
  bold and italic. The submitted `text` is markdown (`**bold**`, `*italic*`), and rich
  paste is reduced to bold and italic. The `plain-text` attribute restores the
  `<textarea>`. Tests or styles that select `textarea` should select `[part=input]`
  instead; tests must type into the editor (see AGENTS.md, "Typing in tests").
- User bubbles render bold and italic.
- `btn--sm` moved from the page's stylesheet to the base one.
- New built-in model and options menus in the composer's bottom row.

From 0.2.3 (behaviour fixes a host may notice):

- A conversation `href` that isn't relative or HTTP(S) is dropped; the row renders as a
  button and fires `agent-select-conversation` instead.
- Ctrl/⌘/Shift/Alt clicks and non-left clicks never fire `agent-select-conversation`.
- `agent-mention` fires only when `open` or `query` changes, not on every keystroke.
- `conversations` and `contextReferences` return copies: mutating the returned array no
  longer changes the element. Assign a new array instead.
- A blank limit attribute (`max-files=""`) means the default, not zero.
- A user turn with no text draws only its chips, without an empty bubble.
- Renderers registered with `defineEntry()` may return any `Node`; text nodes and
  fragments are wrapped in a `div`.
- Safari's IME-confirming Enter no longer sends.
- On narrow pages the closed drawer is hidden from keyboard and screen readers.

## 0.2.2

Additive; no public methods, properties, events, imports or exports were removed or
renamed.

- **The default file accept list is broader:** common Word, Markdown, JSON, XML,
  OpenDocument, RTF, PowerPoint and spreadsheet files are accepted. Set
  `accept="image/*,application/pdf,text/*"` for the previous list. Server-side
  validation is still required.
- User entries with no text but with references or assets are now shown.
- References with `type: 'asset'`, an image `mimeType` and an HTTP(S) `url` show a
  thumbnail. Other reference types render and click as before.
- New: `TextEntry.assets` and the `agent-panel/openai` entry point.

## 0.2.1

Additive; nothing to change.

- New: `clearComposer({ draft, attachments, references })` and
  `setAttachmentState(id, state)` for upload-first hosts, and TypeScript declarations
  for every entry point.
