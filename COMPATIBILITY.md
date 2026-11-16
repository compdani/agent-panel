# Unreleased 0.2.2 compatibility notes

No public methods, properties, events, imports or exports were removed or renamed.
Existing host-owned network and conversation behavior is unchanged. This is an additive
patch; the Static Dealmakers Event integration can use the released 0.2.1 component
without depending on these unreleased changes.

Observable changes:

- The default file accept list is broader: common Word, Markdown, JSON, XML,
  OpenDocument, RTF, PowerPoint and spreadsheet extensions are now accepted. Hosts
  that need the previous picker/filter behavior should explicitly set
  `accept="image/*,application/pdf,text/*"`. Server-side validation remains required.
- Previously hidden empty-text user entries now display supplied references/assets.
- References with `type: 'asset'`, an image `mimeType` and an HTTP(S) `url` display a
  thumbnail. Other reference types keep their existing rendering and click events.
- `TextEntry.assets` and the `agent-panel/openai` helpers are new optional APIs.

The package version is prepared as 0.2.2. A version tag and package publication
are separate release steps; the Dealmakers integration remains pinned to 0.2.1.

Drag-and-drop and clipboard file paste already exist in 0.2.1; this change retains
them and adds browser regression coverage for multi-file PDF, Markdown and Word input
and rejected file types. Clipboard text remains text; actual clipboard file items
attach. Browser/OS clipboard support determines whether copied files are exposed.
