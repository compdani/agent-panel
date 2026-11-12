# Agent Panel API

`<agent-panel>` is a chat panel for an AI agent. It is a standard Web Component (a custom
element with Shadow DOM) and has no dependencies, so it works in Vue, React, Svelte,
Angular or plain HTML.

The panel draws the chat and runs the composer. It does not talk to any server. Your code
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
10. [Slots](#slots)
11. [Styling](#styling)
12. [Extending the panel](#extending-the-panel)
13. [Using it from a framework](#using-it-from-a-framework)
14. [Accessibility](#accessibility)
15. [Browser support and limits](#browser-support-and-limits)
16. [Development and releases](#development-and-releases)

---

## Installation

The package is plain ES modules with no dependencies and no build step. Install it from
GitHub, pinned to a release tag:

```sh
npm install github:compdani/agent-panel#v0.1.0
```

Then import it in your app:

```js
import 'agent-panel';                                          // defines <agent-panel>
import { AgentPanelElement, h, icon } from 'agent-panel/element';  // to subclass (defines nothing)
import { pastedFiles, readAsBase64 } from 'agent-panel/attachments'; // helpers on their own
```

Without npm, clone the repo (or add it as a git submodule) and import
`agent-panel/index.js` by path.

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
| `placeholder` | string | `""` | Placeholder text in the composer. Also used as its accessible label. |
| `hint` | string | `""` | Small text next to the composer buttons. Hidden when the panel is narrower than 380px. |
| `empty-title` | string | `""` | Heading of the empty state. |
| `empty-text` | string | `""` | Paragraph under the empty-state heading. |
| `running` | boolean | off | The agent is working: shows the indicator and the Stop button, and blocks sending. *Reflected.* |
| `disabled` | boolean | off | Disables typing, sending and attaching. *Reflected.* |
| `error` | string | `""` | Error message shown at the end of the transcript. *Reflected.* |
| `accept` | string | `image/*,application/pdf,text/*` | Allowed file types, written as in `<input type="file" accept>`: MIME types, wildcards like `image/*`, or extensions like `.txt`. Leave it empty to allow anything. |
| `max-file-size` | bytes | `6291456` (6 MiB) | Largest single file. |
| `max-total-size` | bytes | `20971520` (20 MiB) | Largest combined size of all attachments. |
| `max-files` | number | `12` | Most files attached at once. |
| `no-attachments` | boolean | off | Hides the paperclip and ignores pasted and dropped files. |
| `sticky-attachments` | boolean | off | Keeps attachments after sending, so every message carries them until they're removed. |
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
| `markdown` | `(text) => string \| null` | Turns reply text into HTML. Without it, replies show as plain paragraphs. **Return safe HTML**: the panel inserts it as is. |
| `labels` | `object` | Replaces the panel's own words, for translation. See below. |
| `limits` | `object` | *Read only.* `{ accept, maxFileSize, maxTotalSize, maxFiles }` as currently in effect. |
| `running`, `disabled`, `closable`, `error` | | The same as the attributes. |

### `labels`

Pass only the keys you want to change. The rest keep their defaults.

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
| `submit(text?)` | `boolean` | Sends `text`, or the draft if you leave it out, together with the current attachments, by firing `agent-submit`. Returns `false` if nothing was sent: the text was empty, or the panel is `running` or `disabled`. Also returns `false` if a listener cancelled the event. Otherwise it clears the draft (only when the draft was what it sent) and the attachments (unless `sticky-attachments` is set). |
| `addFiles(files, { pasted? })` | `{ added, problems }` | Adds files the way the picker, paste and drop do, checking them against the limits. `added` lists the new attachments and `problems` lists the reasons any were refused. With `pasted: true`, unnamed images get names like `pasted-image-20261112-095412.png`. |
| `removeAttachment(id)` | | Removes one attachment. |
| `clearAttachments()` | | Removes all attachments. |
| `focus(options?)` | | Puts the cursor in the composer. |
| `scrollToBottom({ force? })` | | Scrolls to the latest message if the panel is following. With `force: true`, it scrolls anyway and starts following again. |
| `defineEntry(type, render)` | the panel | Draws entries of `type` with `render(entry, panel)`, which returns a DOM node. Pass `null` to remove a renderer. |
| `emitAction(action, detail?)` | `boolean` | Fires `agent-action` with `{ action, ...detail }`. Use it for buttons inside custom entries. |

| Static member | Description |
|---|---|
| `AgentPanelElement.define(tag?, registry?)` | Registers the class under `tag` (default: the class's `tagName`). Safe to call more than once. |
| `AgentPanelElement.readAsBase64(file)` | `Promise<string>`: the file's contents as base64, without a `data:` prefix. |

---

## Events

All events bubble and cross the shadow boundary (`composed`).

| Event | `detail` | Cancelable | When |
|---|---|---|---|
| `agent-submit` | `{ text, attachments }` | yes | The person sends a message or clicks a suggestion. Call `preventDefault()` to keep the draft and attachments, for example when you can't send right now. |
| `agent-stop` | — | no | The Stop button is pressed. |
| `agent-close` | — | no | The close button is pressed. The panel doesn't hide itself. |
| `agent-action` | `{ action, ...}` | yes | A button in a custom entry called `emitAction()`. |
| `agent-attachments-change` | `{ attachments }` | no | Files are added or removed. |
| `agent-attachment-error` | `{ problems: string[] }` | no | One or more files were refused. |
| `agent-error-dismiss` | — | no | The error banner was dismissed. The panel has already cleared `error`. Clear your own copy too. |

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

`user` messages show as plain text in a bubble. Any other `role` is rendered with
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

## Slots

Put elements inside `<agent-panel>` with a `slot` attribute to add your own controls.
Slotted content belongs to your page, so your page's styles and frameworks apply to it.

| Slot | Where |
|---|---|
| `header-start` | Left of the header, in place of `heading`. |
| `header-actions` | Right of the header, before the close button. |
| `subheader` | A row under the header. Hidden while empty. |
| `empty` | Replaces the empty-state heading and text. Suggestions still show. |
| `transcript-end` | After the last entry, e.g. Retry or Undo buttons. |
| `composer-chips` | Next to the attachment chips, for your own kinds of reference. The row is hidden while empty. |
| `composer-actions` | Next to the paperclip. |
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
`attachment`, `input`, `attach`, `hint`, `send`, `stop`, `drop`.

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

### Building blocks for your own entries

- **`h(tag, props, ...children)`** creates an element. Props become attributes, except
  `class` (a string or an array), `onEvent` (a listener) and `html` (sets `innerHTML`; use
  it only with markup you trust). `null` and `false` values and children are skipped.
- **`icon(name, size, className)`** returns an SVG icon. The names are `paperclip`,
  `send`, `stop`, `close`, `chevron`, `check`, `alert`, `file`, `image` and `upload`.
- **CSS classes**: `btn`, `btn--primary`, `btn--tonal`, `btn--icon`, `card`, `badge`,
  `alert`, and `tone-success`, `tone-error`, `tone-warning`, `tone-info`, `tone-muted`.

To keep a `<details>` element open across redraws, give it a `data-key` that stays the
same.

---

## Using it from a framework

Whatever the framework, **import the module that defines the element before the
framework first draws it.** Otherwise data you pass may end up as text attributes instead
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

Vue keeps `slot="…"` as a normal attribute, so slots work. When you build `entries` in a
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
   npm install github:compdani/agent-panel#v0.2.0
   ```

While the version is `0.x`, a change that breaks the API raises the minor version
(`0.1` → `0.2`).

The icons in `icons.js` are from [Material Design Icons](https://pictogrammers.com/library/mdi/)
(Apache-2.0).
