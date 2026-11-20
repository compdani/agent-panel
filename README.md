# Agent Panel API

This package contains two chat components for AI agents. Both are standard Web
Components (custom elements with Shadow DOM) with no dependencies, so they work in Vue,
React, Svelte, Angular or plain HTML.

| Element | Import | For |
|---|---|---|
| `<agent-panel>` | `agent-panel` | A compact chat, e.g. in a side panel. With `conversations-menu`, it has a conversation switcher. See [Conversations in the panel](#conversations-in-the-panel) |
| `<agent-page>` | `agent-panel/page` | A full-page chat with a conversation list, a renamable title and an "in context" bar. See [The agent page](#the-agent-page) |

Each import defines only its own element, so you can use either one without the other.
`<agent-page>` builds on the panel: everything in this guide about the panel applies to
the page too, unless a section says otherwise.

The components draw the chat and run the composer. It does not talk to any server. Your code
owns the conversation: you tell the panel what to show, and it tells you when the person
sends something.

```
 your app ──entries, running, error──▶  <agent-panel>
 your app ◀──agent-submit, agent-stop──  (draft, attachments, scrolling)
```

> AI coding agents: read [AGENTS.md](./AGENTS.md) instead. It covers the same API as a
> precise contract.

---

## Contents

1. [Installation](#installation)
2. [Quick start](#quick-start)
3. [What it does out of the box](#what-it-does-out-of-the-box)
4. [Attributes](#attributes)
5. [Properties](#properties)
6. [Methods](#methods)
7. [Events](#events)
8. [Transcript entries](#transcript-entries)
9. [Attachments](#attachments)
10. [References and mentions](#references-and-mentions)
11. [Composer menus](#composer-menus)
12. [Rich text in the composer](#rich-text-in-the-composer)
13. [Slots](#slots)
14. [Styling](#styling)
15. [Extending the panel](#extending-the-panel)
16. [The agent page](#the-agent-page), [conversations in the panel](#conversations-in-the-panel) and [context usage](#context-usage-and-compact)
17. [Using it from a framework](#using-it-from-a-framework)
18. [Accessibility](#accessibility)
19. [Browser support and limits](#browser-support-and-limits)
20. [Development and releases](#development-and-releases)

---

## Installation

The package is plain ES modules with no dependencies and no build step. Install it from
GitHub, pinned to a release tag:

```sh
npm install github:compdani/agent-panel#vX.Y.Z
```

For builds without git or SSH (for example Docker images), use the HTTPS tarball:

```sh
npm install https://codeload.github.com/compdani/agent-panel/tar.gz/refs/tags/vX.Y.Z
```

The `github:` shorthand can record a `git+ssh` URL in the lockfile. The tarball avoids that requirement. TypeScript declarations and typed custom events ship with every entry point.

Then import it in your app:

```js
import 'agent-panel';                                               // defines <agent-panel>
import 'agent-panel/page';                                          // defines <agent-page>
import { AgentPanelElement, h, icon } from 'agent-panel/element';   // to subclass the panel (defines nothing)
import { AgentPageElement } from 'agent-panel/page-element';        // to subclass the page (defines nothing)
import { pastedFiles, readAsBase64 } from 'agent-panel/attachments'; // helpers on their own
```

Without npm, clone the repo (or add it as a git submodule) and import `index.js` (the
panel) or `page.js` (the page) by path.

---

## Quick start

```html
<agent-panel
  heading="Assistant"
  placeholder="Ask anything…"
  empty-title="How can I help?"
  closable
  style="height: 600px"
></agent-panel>

<script type="module">
  import 'agent-panel'; // defines <agent-panel>

  const panel = document.querySelector('agent-panel');
  panel.suggestions = ['Summarize my week', 'Draft a reply'];

  const history = [];
  panel.addEventListener('agent-submit', async (event) => {
    const { text, attachments } = event.detail;
    history.push({ id: crypto.randomUUID(), type: 'text', role: 'user', content: text });
    panel.entries = [...history];
    panel.running = true;
    try {
      const files = await Promise.all(attachments.map(async (a) => ({
        name: a.name, type: a.type, data: await a.base64(),
      })));
      const reply = await callMyAgent(text, files); // your code
      history.push({ id: crypto.randomUUID(), type: 'text', role: 'assistant', content: reply });
      panel.entries = [...history];
    } catch (err) {
      panel.error = err.message;
    } finally {
      panel.running = false;
    }
  });
</script>
```

The panel fills its parent's height (`height: 100%`). Give it a parent with a height, or
set one on the element.

---

## What it does out of the box

| Area | Behaviour |
|---|---|
| Transcript | Your messages as bubbles and the agent's replies as rendered text. Tool calls appear as a collapsible group with a spinner, tick or warning icon. |
| Scrolling | The transcript stays at the bottom while new content arrives. If the reader scrolls up, it stops following them until they scroll back down or send again. |
| Empty state | A title, some text and clickable suggestions, shown until there are entries. |
| Status | A "working" indicator while `running`. The error banner can be dismissed. |
| Composer | Grows with its text up to a maximum height. **Enter** sends and **Shift+Enter** starts a new line. While running, the send button becomes a **Stop** button. |
| Attachments | Add files with the paperclip, by **pasting** them (screenshots or copied files) or by **dropping** them anywhere on the panel. Images show thumbnails, and each file has a remove button. |
| Validation | Checks file type, per-file size, total size and number of files before accepting a file. Problems show above the composer. |

---

## Attributes

Attributes are set in HTML. The ones marked *reflected* also exist as properties with the
same name.

| Attribute | Type | Default | Description |
|---|---|---|---|
| `heading` | string | `""` | Title in the header. Hidden if the `header-start` slot is used. |
| `closable` | boolean | off | Shows a close button that fires `agent-close`. *Reflected.* |
| `conversations-menu` | boolean | off | Makes the header title a conversation switcher, with New chat beside Close. See [Conversations in the panel](#conversations-in-the-panel). |
| `active` | string | | The id of the open conversation. *Reflected.* |
| `floating` | boolean | off | Draws the panel as a card hovering over the page: a 10px inset, rounded corners (`--agent-radius`), a border and a soft shadow. |
| `has-more` | boolean | off | Ends the conversation list with "Load more", which fires `agent-load-more`. *Reflected.* |
| `placeholder` | string | `""` | Placeholder text in the composer. Also used as its accessible label. |
| `hint` | string | `""` | Small text next to the composer buttons. Hidden when the panel is narrower than 380px. |
| `empty-title` | string | `""` | Heading of the empty state. |
| `empty-text` | string | `""` | Paragraph under the empty-state heading. |
| `running` | boolean | off | The agent is working: shows the indicator and the Stop button, and blocks sending. *Reflected.* |
| `disabled` | boolean | off | Disables typing, sending and attaching. *Reflected.* |
| `error` | string | `""` | Error message shown at the end of the transcript. *Reflected.* |
| `accept` | string | images, PDF, text, Markdown/JSON/XML, Word, ODT, RTF, PowerPoint, Excel (see `DEFAULT_LIMITS.accept`) | Allowed file types, written as in `<input type="file" accept>`: MIME types, wildcards like `image/*`, or extensions like `.txt`. Leave it empty to allow anything. |
| `max-file-size` | bytes | `6291456` (6 MiB) | Largest single file. |
| `max-total-size` | bytes | `20971520` (20 MiB) | Largest combined size of all attachments. |
| `max-files` | number | `12` | Most files attached at once. |
| `no-attachments` | boolean | off | Hides the paperclip and ignores pasted and dropped files. |
| `allow-empty-text` | boolean | off | Allows a blank draft to send when attachments or references are present. Explicit `submit('')` still fails. |
| `sticky-attachments` | boolean | off | Keeps attachments after sending, so every message carries them until they're removed. |
| `plain-text` | boolean | off | Uses a plain `<textarea>` instead of the rich-text composer. |
| `no-add-menu` | boolean | off | Shows the paperclip button instead of the "+" menu. |
| `default-model` | string | `""` | The name shown for the model menu's Default entry, e.g. `gpt-4o`. |
| `no-default-model` | boolean | off | Leaves the Default entry out of the model menu. |
| `mention-trigger` | string | none | A character, usually `@`, that opens a mention while typing. See [References and mentions](#references-and-mentions). |
| `context-threshold` | number 0–1 | `0.6` | The share of the context window at which the [context ring](#context-usage-and-compact) appears. *Reflected* as `contextThreshold`. |
| `theme` | `"dark"` | none | Built-in dark colours, for pages that don't set their own [colour tokens](#styling). |

The limit attributes and `sticky-attachments` are read when they're needed, so changing
them takes effect from the next file added or message sent.

---

## Properties

| Property | Type | Description |
|---|---|---|
| `entries` | `Entry[]` | The transcript. See [Transcript entries](#transcript-entries). Assign a new array to update it. |
| `suggestions` | `string[]` | Suggestion buttons in the empty state. Clicking one sends it. |
| `draft` | `string` | Text in the composer. Get it or set it. |
| `attachments` | `Attachment[]` | *Read only.* A copy of the files waiting in the composer. |
| `references` | `Reference[]` | Things from your app attached to the next message, shown as chips. See [References and mentions](#references-and-mentions). |
| `mention` | `{ open, query }` | *Read only.* Whether a mention is open, and what has been typed after the trigger. |
| `markdown` | `(text) => string \| null` | Turns reply text into HTML. Without it, replies show as plain paragraphs. **Return safe HTML**: the panel inserts it as is. |
| `labels` | `object` | Replaces the panel's own words, for translation. See below. |
| `limits` | `object` | *Read only.* `{ accept, maxFileSize, maxTotalSize, maxFiles }` as currently in effect. |
| `contextUsage` | `{ used, window, estimated?, summarizedAt?, compacting?, canCompact? } \| null` | How full the conversation's context is, in tokens. Draws the [context ring](#context-usage-and-compact). |
| `running`, `disabled`, `closable`, `error` | | The same as the attributes. |

### `labels`

Pass only the keys you want to change. The rest keep their defaults. `<agent-page>` has
[more keys](#page-labels).

```js
panel.labels = { send: 'Enviar', usedTools: (n) => `Usó ${n} herramientas` };
```

| Key | Default |
|---|---|
| `attach` | `Attach files` |
| `attachHint` | `Attach files (you can also paste or drop them)` |
| `close` | `Close` |
| `dismiss` | `Dismiss` |
| `drop` | `Drop files to attach` |
| `remove` | `Remove` (followed by the file name) |
| `send` | `Send` |
| `stop` | `Stop` |
| `usedTools` | `(n) => \`Used ${n} tools\`` |
| `working` | `Working` |

The messages about rejected files are in English and can't be changed through `labels`
yet.

---

## Methods

| Method | Returns | Description |
|---|---|---|
| `submit(text?)` | `boolean` | Sends `text`, or the draft if you leave it out, together with the current attachments and references, by firing `agent-submit`. Returns `false` if nothing was sent: the text was empty (unless sending a draft with `allow-empty-text` and files or references), or the panel is `running` or `disabled`. Also returns `false` if a listener cancelled the event. Otherwise it clears the draft (only when the draft was what it sent), the references, and the attachments (unless `sticky-attachments` is set). |
| `addFiles(files, { pasted? })` | `{ added, problems }` | Adds files the way the picker, paste and drop do, checking them against the limits. `added` lists the new attachments and `problems` lists the reasons any were refused. With `pasted: true`, unnamed images get names like `pasted-image-20261112-095412.png`. |
| `removeAttachment(id)` | | Removes one attachment. |
| `clearComposer({ draft = true, attachments = true, references = true } = {})` | | Selectively clears the composer, closes mentions and forces scroll following. |
| `setAttachmentState(id, state)` | | Replaces chip state with `{ busy?, error? }`; `null` clears it. Busy chips show a spinner and disable removal; errors show an error tone and tooltip. Unknown IDs are ignored. The attachment exposes optional `state`. |
| `clearAttachments()` | | Removes all attachments. |
| `addReference(ref)` | `boolean` | Adds a reference chip. If a mention is open, the typed trigger and query (e.g. `@spr`) are removed from the draft and the mention closes. Returns `false` if that reference was already there. |
| `removeReference(refOrKey)` | | Removes a reference, given the reference or its key (`"type:id"`). |
| `openMention()` | | Opens a mention without typing the trigger, e.g. from a toolbar button. |
| `closeMention()` | | Closes the mention. |
| `focus(options?)` | | Puts the cursor in the composer. |
| `scrollToBottom({ force? })` | | Scrolls to the latest message if the panel is following. With `force: true`, it scrolls anyway and starts following again. |
| `defineEntry(type, render)` | the panel | Draws entries of `type` with `render(entry, panel)`, which returns a DOM node. Pass `null` to remove a renderer. |
| `emitAction(action, detail?)` | `boolean` | Fires `agent-action` with `{ action, ...detail }`. Use it for buttons inside custom entries. |
| `openContextUsage()`, `closeContextUsage()` | | Opens or closes the context card (while `contextUsage` is set). |

| Static member | Description |
|---|---|
| `AgentPanelElement.define(tag?, registry?)` | Registers the class under `tag` (default: the class's `tagName`). Safe to call more than once. |
| `AgentPanelElement.readAsBase64(file)` | `Promise<string>`: the file's contents as base64, without a `data:` prefix. |
| `AgentPanelElement.defaultLabels` | The default `labels`. Subclasses extend it. |

---

## Events

All events bubble and cross the shadow boundary (`composed`).

| Event | `detail` | Cancelable | When |
|---|---|---|---|
| `agent-submit` | `{ text, attachments, references, fromDraft, model, options }` | yes | The person sends a message or clicks a suggestion. Call `preventDefault()` to keep the draft and attachments, for example when you can't send right now. |
| `agent-stop` | — | no | The Stop button is pressed. |
| `agent-close` | — | no | The close button is pressed. The panel doesn't hide itself. |
| `agent-select-conversation`, `agent-new-conversation`, `agent-delete-conversation` | see [Page events](#page-events) | | From the switcher (`conversations-menu`) or the page's sidebar. |
| `agent-load-more` | — | no | "Load more" is pressed (shown while `has-more` is set). Fetch the next page and set `conversations`. |
| `agent-compact` | — | no | The context card's Compact button is pressed. Summarize the conversation, then update `contextUsage`. |
| `agent-action` | `{ action, ...}` | yes | A button in a custom entry called `emitAction()`. |
| `agent-attachments-change` | `{ attachments }` | no | Files are added or removed. |
| `agent-attachment-error` | `{ problems: string[] }` | no | One or more files were refused. |
| `agent-error-dismiss` | — | no | The error banner was dismissed. The panel has already cleared `error`. Clear your own copy too. |
| `agent-references-change` | `{ references }` | no | References are added or removed. |
| `agent-reference-open` | `{ reference }` | no | A reference chip was clicked, in the composer, on a message, or in the page's context bar. |
| `agent-mention` | `{ open, query }` | no | A mention opened, its query changed, or it closed. |
| `agent-mention-key` | `{ key, event }` | yes | While a mention is open, the person pressed ↑, ↓, Enter, Tab or Escape. Cancel the event if your picker used the key. |

The page fires [a few more events](#page-events).

---

## Transcript entries

`entries` is an array of plain objects. Every entry needs an `id` that is unique and stays
the same across updates, because the panel matches entries by `id`. An entry whose
contents haven't changed isn't redrawn, so open tool groups stay open while a reply
streams in.

### Text

```js
{ id: 'm1', type: 'text', role: 'user', content: 'Shorten the CTA' }
{ id: 'm2', type: 'text', role: 'assistant', content: '**Done.** Here is…' }
```

`user` messages show as plain text in a bubble. A user message can also carry
`references: [{ type, id, label }]`, shown as chips above the bubble. Any other `role` is rendered with
`markdown`. An entry with empty `content` isn't shown.

### Tool calls

```js
{
  id: 't1',
  type: 'tools',
  label: 'Looked things up',        // optional; otherwise the tool's label, or "Used N tools"
  tools: [
    { id: 'call_1', name: 'search_campaigns', label: 'Search campaigns', status: 'completed', detail: { found: 3 } },
    { id: 'call_2', name: 'read_list', status: 'running' },
  ],
}
```

`status` is `running`, `completed` or `failed`. The group shows a spinner if any tool is
running, and a warning if any failed. `detail` is optional: a string is shown as is, and
anything else is shown as formatted JSON. Without a `label`, a tool's `name` is shown with
underscores turned into spaces and the first letter capitalised.

### Your own types

Any other `type` is yours. Draw it in one of three ways:

1. Call `panel.defineEntry('note', (entry) => node)`.
2. Override `renderEntry` in a subclass. See [Extending](#extending-the-panel).
3. Draw it from your framework through a slot. An entry the panel can't draw becomes
   `<slot name="entry-{id}">`, so a light-DOM child with `slot="entry-note1"` appears in
   that place in the transcript.

---

## Attachments

Each attachment in `attachments` and in `agent-submit` looks like this:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique within the page, e.g. `att-3`. |
| `file` | `File` | The file itself. |
| `name` | string | Display name. Unnamed pasted files get a generated name, and a duplicate name gets `-2`, `-3`… |
| `type` | string | MIME type, or `""` if the browser didn't provide one. |
| `size` | number | Size in bytes. |
| `pasted` | boolean | Whether it came from a paste. |
| `previewUrl` | string | A `blob:` URL for images, otherwise `""`. Released when the attachment is removed. |
| `base64()` | `() => Promise<string>` | The contents as base64, read once and then remembered. |

### Paste rules

- **Screenshots and copied images** attach.
- **Copied files**, e.g. a PDF copied in the file manager, attach.
- **Text copied from a spreadsheet or word processor** pastes as text. These apps also put
  a picture of the copied cells or text on the clipboard. When the clipboard holds text
  and only images, the panel treats the paste as text, unless the text is just the image's
  file name (which is what a copied image file looks like).
- **Plain text** pastes into the composer as usual.

---

## References and mentions

A **reference** points at something in your app (a contact, a document, a ticket) that
the next message is about. It's a plain object:

```js
{ type: 'contact', id: '42', label: 'Ana Pérez' } // any other fields are kept
```

References appear as chips next to the attachments. They're sent in
`agent-submit`'s `detail.references` and cleared after sending. Two references with the
same `type` and `id` count as one. Clicking a chip fires `agent-reference-open`.

A **mention** is how people add references by typing. Set `mention-trigger="@"`, and
typing `@` at the start of a word opens one. The panel doesn't know what your app
contains, so **you supply the picker**:

1. Put your picker in the `mention` slot. It shows only while a mention is open, and it
   can position itself against the composer box, e.g. `position: absolute;
   bottom: 100%`.
2. On `agent-mention`, search for `detail.query` (or hide the picker when `detail.open`
   is false).
3. On `agent-mention-key`, move the selection for ↑ and ↓, and pick for Enter or Tab.
   Call `event.preventDefault()` for the keys you used. Otherwise Enter would send the
   message, and Escape closes the mention.
4. When something is picked, call `panel.addReference({ type, id, label })`. That
   replaces the typed `@query` with a chip.

```js
panel.setAttribute('mention-trigger', '@');
panel.addEventListener('agent-mention', (e) => {
  picker.hidden = !e.detail.open;
  if (e.detail.open) picker.search(e.detail.query);
});
panel.addEventListener('agent-mention-key', (e) => {
  if (picker.handleKey(e.detail.key)) e.preventDefault();
});
picker.onPick = (item) => panel.addReference({ type: item.type, id: item.id, label: item.name });
```

---

## Composer menus

The composer's bottom row has three menus. Each is optional and has sensible defaults.
They look like list_pocket's model menu: a card above the composer, grouped and searchable.

```text
┌──────────────────────────────────────────────────────┐
│ Ask anything…                                        │
│ [+]                      [⚙]  [Default (gpt-4o) ▾]  (↑) │
└──────────────────────────────────────────────────────┘
```

**"+" menu** (on by default). Attach files, Paste text (a small form that adds a text
file, like list_pocket's Paste data) and Add context (only with `mention-trigger`). Add
`'link'` for an "Attach link" form when your backend accepts asset URLs. Add your own items,
grouped under headings; an item with a `reference` attaches it when picked:

```js
panel.addMenu = ['attach', 'paste', 'context', 'link',
  { id: 'kit-1', label: 'Spring kit', group: 'Brand kits', reference: { type: 'brand_kit', id: 1, label: 'Spring kit' } },
  { id: 'assets', label: 'Browse site assets…', icon: 'image' }, // handle in agent-menu-select
];
panel.addEventListener('agent-menu-select', (e) => {
  if (e.detail.id === 'assets') openAssetPicker();
});
```

Set `no-add-menu` to keep the old paperclip button instead.

**Model menu** (shows once `models` is set). A "Default" entry comes first (name the
server's default with `default-model="gpt-4o"`, or hide it with `no-default-model`).
Models with a `group` are listed under it, and more than seven get a search field.

```js
panel.models = [{ id: 'gpt-5', group: 'OpenAI' }, { id: 'claude-opus-5-5', group: 'Anthropic' }];
panel.model = localStorage.getItem('model') || ''; // '' = default
panel.addEventListener('agent-model-change', (e) => localStorage.setItem('model', e.detail.model));
```

**Options menu** (shows once `options` is set). Pick-one lists and on/off toggles, each with
a default, plus "Reset to defaults":

```js
panel.options = [
  { id: 'effort', label: 'Reasoning effort', choices: [{ value: '', label: 'Model default' }, 'low', 'medium', 'high'] },
  { id: 'autoApply', label: 'Auto-apply edits' },          // toggle, default off
  { id: 'brandKit', label: 'Include brand kit', default: true },
];
panel.optionValues = JSON.parse(localStorage.getItem('options') || '{}');
panel.addEventListener('agent-option-change', (e) => localStorage.setItem('options', JSON.stringify(e.detail.values)));
```

`agent-submit` includes `model` and `options` (every value, defaults filled in), so
the send handler doesn't need to track them. All three events are cancelable. Parts:
`add-menu` (also `attach`), `model-menu`, `options-menu`, `menu` (the open card).

## Rich text in the composer

The message box accepts rich text. **Cmd/Ctrl+B** bolds and **Cmd/Ctrl+I** italicizes,
and pasting from Google Docs, Word or a web page keeps bold and italic while dropping
everything else (links, colours, images, scripts). The message is sent as markdown,
`**bold**` and `*italic*`, the same syntax the assistant's replies are rendered from, and
your own bubbles show the formatting. Plain messages are sent exactly as typed.

`draft` reads and writes markdown. Set `plain-text` to use a plain `<textarea>` instead.
Underline isn't offered, because markdown has no underline.

## Slots

Put elements inside `<agent-panel>` with a `slot` attribute to add your own controls.
Slotted content belongs to your page, so your page's styles and frameworks apply to it.

| Slot | Where |
|---|---|
| `header-start` | Left of the header, in place of `heading`. |
| `header-actions` | Right of the header, before the close button. |
| `switcher-end` | The foot of the conversation switcher's dropdown (`conversations-menu`), e.g. "Open the full page". Hidden while empty. |
| `subheader` | A row under the header. Hidden while empty. |
| `empty` | Replaces the empty-state heading and text. Suggestions still show. |
| `transcript-end` | After the last entry, e.g. Retry or Undo buttons. |
| `composer-chips` | Next to the attachment chips, for your own kinds of reference. The row is hidden while empty. |
| `composer-actions` | Next to the paperclip. |
| `mention` | Your mention picker, shown while a mention is open. |
| `entry-{id}` | In place of an entry the panel can't draw. |

```html
<agent-panel>
  <button slot="header-actions" onclick="newChat()">New chat</button>
  <select slot="subheader">…</select>
</agent-panel>
```

---

## Styling

### Colour and size tokens

Set these on the element or any ancestor. They pass through the shadow root.

| Token | Default (light) | Used for |
|---|---|---|
| `--agent-primary` | `#2563eb` | Send button, links, focus rings, highlights |
| `--agent-on-primary` | `#fff` | Text on primary |
| `--agent-surface` | `#fff` | Panel background |
| `--agent-surface-alt` | `#f3f4f6` | Chips |
| `--agent-text` | `#1f2328` | Text |
| `--agent-muted` | 62% of text | Secondary text |
| `--agent-border` | 18% of text | Borders |
| `--agent-error` / `-success` / `-warning` / `-info` | red / green / amber / blue | Status colours |
| `--agent-font-size` | `14px` | Base text size |
| `--agent-radius` | `14px` | Composer corners |
| `--agent-composer-max-height` | `180px` | How tall the composer can grow |

```css
agent-panel {
  --agent-primary: #7c3aed;
  --agent-surface: #0f172a;
  --agent-text: #e2e8f0;
}
```

### Parts

Style individual pieces with `::part()`:

`panel`, `header`, `heading`, `close`, `subheader`, `transcript`, `entries`, `empty`,
`suggestion`, `bubble`, `message`, `tools`, `error`, `composer`, `attachments`,
`attachment`, `reference`, `mention`, `input`, `attach`, `hint`, `send`, `stop`, `drop`,
`context-usage`, `context-usage-button`, `context-usage-card`, `context-compact`.
The page adds [its own parts](#page-styling).

```css
agent-panel::part(bubble) { background: #ede9fe; }
agent-panel::part(input) { font-family: ui-monospace, monospace; }
```

---

## Extending the panel

Subclass `AgentPanelElement` to change how things are drawn. Import it from
`agent-panel/element`, which doesn't define any tag, and register your class under your
own tag.

```js
import { AgentPanelElement, h, icon } from 'agent-panel/element';

class SupportPanel extends AgentPanelElement {
  static tagName = 'support-panel';

  // Added after the base styles.
  static styles = `
    :host { --agent-primary: #0f766e; }
    .ticket { display: flex; gap: 8px; align-items: center; }
  `;

  renderMarkdown(text) {
    return mySanitizedMarkdown(text);
  }

  renderEntry(entry) {
    if (entry.type === 'ticket') {
      return h('div', { class: 'card ticket' },
        icon('file', 16),
        h('strong', null, entry.title),
        h('button', { class: 'btn btn--tonal', onClick: () => this.emitAction('open-ticket', { id: entry.ticketId }) }, 'Open'));
    }
    return super.renderEntry(entry); // keep text and tools
  }
}

SupportPanel.define();
```

### Methods you can override

| Method | Default |
|---|---|
| `renderEntry(entry)` | Uses a renderer from `defineEntry`, then the built-in text and tools renderers. Returns `null` to use a slot. |
| `renderText(entry)` | Bubble for `user`, rendered reply otherwise. |
| `renderTools(entry)` | The collapsible tool group. |
| `renderMarkdown(text)` | Uses the `markdown` property, or plain paragraphs. |
| `renderReference(ref, { removable })` | A reference chip. |
| `referenceIcon(ref)` | The chip's icon: a document for `type: 'file'`, a link otherwise. Return your own icons by type. |
| `fileProblem(file, current)` | Why a file can't be attached, or `''`. The default checks the limits. Override it to add rules, and call `super.fileProblem()` to keep the limits. |
| `layout(panel)` | Returns the element's root, given the panel. The page uses it to add the sidebar. It runs inside the constructor, before your class's own fields exist. |

To add words to `labels`, extend the defaults:
`static defaultLabels = { ...AgentPanelElement.defaultLabels, approve: 'Approve' }`.

### Building blocks for your own entries

- **`h(tag, props, ...children)`** creates an element. Props become attributes, except
  `class` (a string or an array), `onEvent` (a listener) and `html` (sets `innerHTML`; use
  it only with markup you trust). `null` and `false` values and children are skipped.
- **`icon(nameOrPath, size, className)`** returns an SVG icon. Give it one of the
  built-in names (`paperclip`, `send`, `stop`, `close`, `chevron`, `check`, `alert`,
  `file`, `image`, `upload`, `at`, `link`, `history`, `plus`, `delete`) or any 24×24 SVG
  path, such as one from `@mdi/js`.
- **`referenceKey(ref)`** returns `"type:id"`, the key the components use to tell
  references apart.
- **CSS classes**: `btn`, `btn--primary`, `btn--tonal`, `btn--icon`, `chip`, `card`, `badge`,
  `alert`, and `tone-success`, `tone-error`, `tone-warning`, `tone-info`, `tone-muted`.

To keep a `<details>` element open across redraws, give it a `data-key` that stays the
same.

---

## The agent page

`<agent-page>` is the panel laid out for a whole page:

```
┌──────────────┬────────────────────────────────────────────┐
│ + New chat   │ Spring launch ✎                    [slot]  │  header: title, header-actions
│ Spring launch│ In context: (Spring sale) (Customers)      │  context bar
│ Inbox triage │                                            │
│              │        transcript, max 860px wide          │
│ conversations│                                            │
│              │        composer                            │
└──────────────┴────────────────────────────────────────────┘
```

Below 760px wide, the conversation list moves into a drawer, opened with a history button
in the header.

```js
import 'agent-panel/page';

const page = document.querySelector('agent-page');
page.conversations = [
  { id: 'c1', title: 'Spring launch', updated: '2026-11-10T09:00:00Z', href: '/agent/c1' },
  { id: 'c2', title: 'Inbox triage', updated: '2026-11-12T08:15:00Z', href: '/agent/c2' },
];
page.active = 'c1';
page.setAttribute('heading', 'Spring launch');
page.renamable = true;
page.contextReferences = [{ type: 'campaign', id: '7', label: 'Spring sale' }];

page.addEventListener('agent-select-conversation', (e) => {
  e.preventDefault();          // stay in the app instead of following the link
  myRouter.go(`/agent/${e.detail.id}`);
});
page.addEventListener('agent-new-conversation', () => myRouter.go('/agent'));
page.addEventListener('agent-delete-conversation', (e) => api.delete(e.detail.id));
page.addEventListener('agent-rename', (e) => api.rename(page.active, e.detail.title));
```

As with the panel, the page holds no data of its own: you set `conversations`, `active`,
`heading` and `entries`, and respond to its events. Everything else in this guide
(attributes, properties, methods, events, slots, references, mentions) works the same on
the page.

### Conversations in the panel

`<agent-panel>` can carry the same conversation list for side panels: add
`conversations-menu` and the header's title becomes a switcher: the open conversation's
title and a chevron, opening a dropdown of the conversations (each with its date and
Delete, which asks once), and a New chat button beside Close. The title replaces
`heading`; content in `header-start` (an icon, say) stays before it, and the
`switcher-end` slot adds actions under the list. It takes the same `conversations`, `active`, `has-more` and `formatDate`
as the page, and fires the same events.

```js
panel.setAttribute('conversations-menu', '');
panel.conversations = [{ id: 'c1', title: 'Spring launch', updated: '2026-11-10T09:00:00Z' }];
panel.active = 'c1';
panel.hasMore = true; // the list ends with "Load more"
panel.addEventListener('agent-select-conversation', (e) => { e.preventDefault(); open(e.detail.id); });
panel.addEventListener('agent-new-conversation', () => startNewChat());
panel.addEventListener('agent-delete-conversation', (e) => api.delete(e.detail.id));
panel.addEventListener('agent-load-more', () => loadNextPage());
```

```html
<agent-panel conversations-menu floating closable>
  <span slot="header-start" class="mark">✦</span>
  <button slot="switcher-end" onclick="openFullPage()">Open the full Agent page</button>
</agent-panel>
```

`openConversations()` and `closeConversations()` open and close the dropdown from code.
Parts: `switcher`, `switcher-button`, `switcher-menu`, `switcher-new`, plus the list's
`conversation-list`, `conversation` and `load-more`.

### Page attributes and properties

| Name | Type | Description |
|---|---|---|
| `heading` (attribute) | string | The open conversation's title. With no title, the `untitled` label shows. |
| `renamable` | boolean | Clicking the title edits it. Enter or leaving the field saves; Escape cancels. Saving fires `agent-rename`. |
| `active` | string | The id of the open conversation, highlighted in the list. *Reflected.* |
| `no-sidebar` (attribute) | boolean | Hides the conversation list. |
| `has-more` (attribute) | boolean | Ends the list with "Load more", which fires `agent-load-more`. *Reflected* as `hasMore`. |
| `conversations` (property) | `[{ id, title, updated?, href? }]` | The list. With `href`, rows are real links, so they can be opened in a new tab. Only relative and HTTP(S) links are used; others (`javascript:`, `data:`…) are dropped and the row becomes a button. |
| `contextReferences` (property) | `Reference[]` | References already part of the conversation, shown in the "in context" bar under the header. Hidden while empty. |
| `formatDate` (property) | `(value) => string` | Formats `updated` in the list. By default, today's dates show the time and other dates show the day. |

### Page methods

| Method | Description |
|---|---|
| `openSidebar()` / `closeSidebar()` | Opens or closes the drawer on narrow screens. |
| `startRename()` | Starts editing the title, if `renamable`. |

### Page events

| Event | `detail` | Cancelable | When |
|---|---|---|---|
| `agent-select-conversation` | `{ id, conversation }` | yes | A conversation in the list is clicked. Cancel it to handle navigation yourself; otherwise a row with `href` follows its link. Clicks that open a new tab (Ctrl, ⌘, middle click) aren't reported. |
| `agent-new-conversation` | — | no | The New chat button is pressed. |
| `agent-delete-conversation` | `{ id, conversation }` | no | A deletion was confirmed. Each row asks once before firing this. The page doesn't remove the row: update `conversations`. |
| `agent-load-more` | — | no | "Load more" at the end of the list was pressed (only while `has-more` is set). |
| `agent-rename` | `{ title }` | yes | The title was edited. If the event isn't cancelled, the page shows the new title straight away. |

### Page slots

All the panel's slots, plus `sidebar-start` and `sidebar-end`, above and below the
conversation list. Put things like a model picker in `header-actions`.

### Page labels

| Key | Default |
|---|---|
| `newChat` | `New chat` |
| `untitled` | `New chat` |
| `loadMore` | `Load more` |
| `conversations` | `Conversations` (the sidebar's and history button's names) |
| `noConversations` | `No conversations yet.` |
| `delete` | `Delete` |
| `deleteConversation` | ``(title) => `Delete ${title}` `` |
| `cancel` | `Cancel` |
| `rename` | `Rename` |
| `titleLabel` | `Title` |
| `inContext` | `In context:` |

### Page styling

- **Tokens:** `--agent-sidebar-width` (default `250px`) and `--agent-content-max-width`
  (default `860px`), in addition to the panel's tokens.
- **Parts:** `page`, `sidebar`, `new-chat`, `conversation-list`, `conversation`,
  `history`, `title`, `title-input`, `context-bar`.
- **Size:** the page fills its parent's height, so give it one: for example,
  `agent-page { display: block; height: calc(100vh - 64px); }`.

### Extending the page

Subclass `AgentPageElement` from `agent-panel/page-element` exactly as you would the
panel. The same hooks apply.

```js
import { AgentPageElement } from 'agent-panel/page-element';

class MyAgentPage extends AgentPageElement {
  static tagName = 'my-agent-page';
  static defaultLabels = { ...AgentPageElement.defaultLabels, newChat: 'Start over' };
  renderMarkdown(text) { return mySanitizedMarkdown(text); }
}
MyAgentPage.define();
```

---

## Context usage and Compact

When the model's context window starts to fill, the composer can show a small ring
before the model menu, filled to the share in use. Set `contextUsage` from your backend:

```js
panel.contextUsage = { used: 144000, window: 200000, estimated: true };
panel.addEventListener('agent-compact', async () => {
  panel.contextUsage = { ...panel.contextUsage, compacting: true };
  const { context } = await api.compact(conversationId); // summarize older messages
  panel.contextUsage = { used: context.tokens, window: context.window, summarizedAt: context.summarizedAt };
});
```

- The ring appears once `used / window` reaches `context-threshold` (60% by default), and
  turns amber at 80% and red at 95%.
- Clicking it opens a card: "72% of context used", "144k of 200k tokens (estimated)",
  when earlier messages were last summarized (`summarizedAt`), and a **Compact
  conversation** button that fires `agent-compact`. The panel doesn't summarize anything
  itself.
- `compacting: true` spins the ring and disables the button. `canCompact: false` hides
  the button, for a backend that can't summarize.
- While the card is open the ring stays, even below the threshold, so the person sees the
  result of a compaction. Escape or a click outside closes it.
- Labels: `context`, `contextUsed(percent)`, `contextTokens(used, window, estimated)`,
  `contextSummarized(when)`, `compact`, `compacting`, `compactHint`.

---

## Using it from a framework

Everything here applies to `<agent-page>` as well. Whatever the framework, **import the
module that defines the element before the framework first draws it.** Otherwise data you pass may end up as text attributes instead
of properties.

### Vue 3

```js
// vite.config.js
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'agent-panel' } } })
```

```vue
<script setup>
import 'agent-panel';
</script>

<template>
  <agent-panel
    ref="panel" closable :entries="entries" :running="running" :error="error"
    @agent-submit="onSubmit" @agent-close="open = false" @agent-error-dismiss="error = ''"
  >
    <div slot="subheader"><model-picker /></div>
  </agent-panel>
</template>
```

Vue keeps `slot="…"` as a normal attribute, so slots work. For properties with
camel-case names, such as the page's `contextReferences` and `formatDate`, write the
binding in camel case (`:contextReferences="refs"`). Vue only sets a property when the
name matches it exactly; a hyphenated name would be set as an attribute instead. When you build `entries` in a
`computed`, read every field the panel shows. Copying the objects into plain ones does
this. Otherwise a change made in place, such as a tool's status, won't update the panel.

### React

The pattern below works with every React version: set the data and add the listeners
through a `ref`. React 19 can also take `entries={…}` directly as a prop.

```jsx
import { useEffect, useRef } from 'react';
import 'agent-panel';

function Assistant({ entries, running, onSend }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.entries = entries; }, [entries]);
  useEffect(() => { ref.current.running = running; }, [running]);
  useEffect(() => {
    const el = ref.current;
    const handler = (e) => onSend(e.detail);
    el.addEventListener('agent-submit', handler);
    return () => el.removeEventListener('agent-submit', handler);
  }, [onSend]);
  return <agent-panel ref={ref} closable placeholder="Ask anything…" />;
}
```

### Svelte, Angular, Lit and others

Bind properties (`.entries=${…}` in Lit, `[entries]` in Angular) and listen for the events
by name. In Angular, add `CUSTOM_ELEMENTS_SCHEMA` to the component.

---

## Accessibility

- The transcript is a polite live region, so screen readers announce new content.
- Errors use `role="alert"`, and the working indicator uses `role="status"`.
- Every icon-only button has an accessible name, taken from `labels`.
- The composer's accessible name is its placeholder.
- The animations stop when the reader has asked for reduced motion.

---

## Browser support and limits

- **Browsers**: current Chrome, Edge, Firefox and Safari (2023 or later). The panel uses
  custom elements, Shadow DOM, CSS `color-mix()`, container queries and ES2021.
- **Long chats**: every update re-checks every entry and the transcript isn't virtualized.
  This is fine for normal conversations; for thousands of messages, show only the most
  recent ones.
- **Server rendering**: the module can be imported where there's no DOM (it does nothing
  there), but the panel only draws in the browser.

---

## Development and releases

```sh
npm test    # Node tests for the attachment rules (test/)
```

The rendering code needs a browser. Check those changes in an app that uses the panel.

To release:

1. Update `version` in `package.json`.
2. Commit, then tag the commit `v<version>` and push the tag:

   ```sh
   git tag v0.2.0 && git push && git push --tags
   ```

3. In each app, update the dependency to the new tag:

   ```sh
   npm install github:compdani/agent-panel#vX.Y.Z
   ```

While the version is `0.x`, a change that breaks the API raises the minor version
(`0.1` → `0.2`).

The icons in `icons.js` are from [Material Design Icons](https://pictogrammers.com/library/mdi/)
(Apache-2.0).

### Upload before sending

`agent-submit.detail.fromDraft` is false for explicit `submit(text)` and suggestion clicks.
Cancel submission and clear the sent draft immediately so text typed during upload survives:

```js
panel.addEventListener('agent-submit', async (event) => {
  event.preventDefault();
  const { text, attachments, references, fromDraft } = event.detail;
  panel.clearComposer({ draft: fromDraft, attachments: false });
  panel.running = true;
  try {
    const files = await Promise.all(attachments.map(async (a) => {
      panel.setAttachmentState(a.id, { busy: true });
      try { return await upload(a.file); }
      catch (error) {
        panel.setAttachmentState(a.id, { error: String(error) });
        throw error;
      }
    }));
    await send({ text, files, references });
    attachments.forEach((a) => panel.removeAttachment(a.id));
  } finally {
    panel.running = false;
  }
});
```

`upload` and `send` above are host functions. Handle failures in the host; cancelled submissions retain files for retry. State is discarded on removal or clearing.

For standalone browser regression checks (Chromium), install Playwright outside the
package, then run:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:browser
# Another engine: BROWSER=webkit (or firefox) in front of the same command.
```

Run `npm run check-types` for NodeNext and bundler declaration checks. Browser regression
checks cover both tags, entry-point isolation, submission, chip states, paste and drop,
focus kept across redraws, preview URL release, conversation link safety and IME Enter.
These supplement the consuming app's integration checks.

To check a consuming Event Pocket checkout's actual custom-element subclasses through
Vue, set `EVENT_POCKET_ROOT` to its `events_admin` directory when running the same
browser script. It loads the app's renderer, Marked and Vue with the local panel source,
without changing the app's installed package or contacting its backend.

## Uploaded assets and OpenAI inputs (0.2.2)

Pictures already attach via the paperclip, paste, or drop. Defaults also accept PDF,
Markdown, JSON, Word, OpenDocument, RTF, PowerPoint and Excel files, including when the
browser reports no MIME type. Existing limits remain 6 MiB per file, 20 MiB total,
12 files; change `accept` and `max-*` to match your backend.

`agent-panel/openai` provides dependency-free helpers for the **Responses API**.
`toOpenAIContent({ text, attachments, references, assets })` returns content parts:
images become `input_image`, documents become `input_file`. Asset references
(`{ type: 'asset', id, label?, name?, mimeType?, url?, fileId? }`) can be added with
`panel.addReference(asset)` or a host asset picker. URLs must be HTTP(S); use URLs
OpenAI can fetch, or server-uploaded OpenAI file IDs. Image assets should supply
`mimeType`, especially with extensionless URLs or file IDs. Ordinary references become
text identifiers; the host must resolve their full contents if needed.

`prepareSubmission(detail, { upload })` first calls your upload function once per
attachment, then returns `{ assets, content }`. The upload callback receives
`(file, attachment)` and returns asset metadata with a durable `url` or OpenAI `fileId`.
Without an upload callback, files are encoded inline. This package does not provide
storage or credentials. Keep OpenAI API keys on your server.

```js
import { prepareSubmission } from 'agent-panel/openai';

panel.setAttribute('allow-empty-text', ''); // permit picture/document-only messages
panel.addEventListener('agent-submit', async event => {
  event.preventDefault(); // keep files and draft on failure
  if (panel.running) return;
  const detail = event.detail;
  panel.running = true;
  detail.attachments.forEach(a => panel.setAttachmentState(a.id, { busy: true }));
  try {
    const { assets, content } = await prepareSubmission(detail, {
      upload: async file => {
        const body = new FormData();
        body.append('file', file);
        const response = await fetch('/api/assets', { method: 'POST', body });
        if (!response.ok) throw Error('Asset upload failed');
        return response.json(); // e.g. { id, url, mimeType, name }
      },
    });
    // Your server passes input: [{ role: 'user', content }] to responses.create.
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) throw Error('Message failed');
    panel.entries = [...panel.entries, {
      id: crypto.randomUUID(), type: 'text', role: 'user',
      content: detail.text, references: detail.references, assets,
    }];
    // Only clear the draft if the user has not changed it while waiting.
    panel.clearComposer({ draft: panel.draft.trim() === detail.text, attachments: false, references: false });
    detail.attachments.forEach(a => panel.removeAttachment(a.id));
    detail.references.forEach(ref => panel.removeReference(ref));
  } catch (error) {
    panel.error = error.message;
  } finally {
    detail.attachments.forEach(a => panel.setAttachmentState(a.id, null));
    panel.running = false;
  }
});
```

Persist returned assets in conversation state; never persist temporary composer blob
preview URLs. `TextEntry.assets` draws asset chips, including image thumbnails, even
for a message with no text. Clicking uses `agent-reference-open`, so the host chooses
how to open/download an asset. Upload retries should use host-side deduplication to
avoid duplicate stored assets after a partial failure.

The Responses API supports more document formats than Chat Completions (PDF-only file
parts). See [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs).
Use a vision-capable model for images/PDF page images. OpenAI image input accepts PNG,
JPEG, WebP and non-animated GIF; unsupported image MIME types are rejected by the helper.
The host must validate actual files, API limits and model compatibility on its server.

## Fixes in 0.2.3

- Conversation `href`s must be relative or HTTP(S); anything else renders a button row.
- Ctrl/⌘/Shift/Alt and non-left clicks never fire `agent-select-conversation`, on any row.
- On narrow pages the closed drawer is hidden from keyboard and screen readers, the
  history button reports `aria-expanded`, and focus moves into and back out of the drawer.
  Delete is always visible on touch screens.
- Sidebar rows, context chips, composer chips and suggestions are rebuilt only when their
  data changes, so focus and clicks survive streaming redraws.
- Image preview `blob:` URLs are released when the element is removed, and recreated if
  it is attached again. Moving the element keeps them.
- Setting `labels`, `markdown` or `defineEntry()` keeps open tool groups open.
- Renderers may return any `Node`; text nodes and fragments are wrapped in a `div`.
- A user turn with no text draws only its chips, without an empty bubble.
- Safari's IME-confirming Enter (`keyCode 229`) no longer sends.
- `agent-mention` fires only when `open` or `query` changes.
- A blank limit attribute (`max-files=""`) uses the default.
- `conversations` and `contextReferences` return copies.
- Drops keep distinct files that share a name, size, type and date.
- OpenAI helpers send the normalized URL, refuse URLs with credentials, prefer an explicit
  `mimeType` over the extension, and keep `type: 'asset'` whatever the upload returns.

## New in 0.4.0

- `<agent-panel conversations-menu>`: a conversation switcher for side panels. See
  [Conversations in the panel](#conversations-in-the-panel).
- `has-more` and `agent-load-more` on both elements, so hosts no longer draw their own
  "Load more" button.
- `conversations`, `active` and `formatDate` now live on the panel; the page's API is the
  same.

## New in 0.3.0

Built-in composer menus: "+", model and options. See [Composer menus](#composer-menus).
The "+" button replaces the paperclip by default; `no-add-menu` keeps the paperclip.
The composer is a rich-text box (bold and italic, sent as markdown); `plain-text` keeps the
textarea. Tests that select `textarea` should select `[part=input]` instead.

## New in 0.4.1

- The conversation switcher is the header's title (title and chevron), with New chat
  beside Close, instead of a second row; its dropdown is a rounded card under the title
  that shows each row's date and Delete. The new `switcher-end` slot adds actions under
  the list.
- `floating`: the panel as a rounded card hovering over the page.
- Fix: the red confirm-Delete button and the coloured "Load more" lost their colours to
  `.btn` (since 0.4.0, the page's sidebar too).

## New in 0.5.0

- The composer's [context ring](#context-usage-and-compact): `contextUsage`,
  `context-threshold`, `openContextUsage()` / `closeContextUsage()` and the
  `agent-compact` event, so a conversation nearing its model's context window can be
  compacted with one click. `formatTokens()` is exported.

## New in 0.5.1

- `COMPATIBILITY.md` now ships with the package and says, for every release since 0.2.1,
  what an existing host has to change (often nothing). Read it before upgrading.
