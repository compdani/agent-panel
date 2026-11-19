// Types for agent-panel.js (agent-panel/element). This module defines no tag.
import type { Limits } from './attachments.mjs';

export { DEFAULT_LIMITS, formatBytes, readAsBase64 } from './attachments.mjs';
export type { Limits } from './attachments.mjs';

export type Role = 'user' | 'assistant' | (string & {});

/** Something in the host app (a contact, a document…). Identity is `${type}:${id}`. */
export interface Reference {
  type: string;
  id: string | number;
  label?: string;
  [extra: string]: unknown;
}

export interface TextEntry {
  id: string;
  type: 'text';
  role: Role;
  content: string;
  /** Chips above user bubbles. */
  references?: Reference[];
  /** Durable uploaded assets, displayed alongside reference chips. */
  assets?: import('./openai.mjs').Asset[];
}

export interface ToolCall {
  id?: string;
  key?: string;
  name: string;
  label?: string;
  status: 'running' | 'completed' | 'failed';
  detail?: unknown;
}

export interface ToolsEntry {
  id: string;
  type: 'tools';
  label?: string;
  tools: ToolCall[];
}

export interface CustomEntry {
  id: string;
  type: string;
  [field: string]: unknown;
}

export type Entry = TextEntry | ToolsEntry | CustomEntry;

export interface Attachment {
  /** `att-<n>`, unique within the page. */
  id: string;
  /** A renamed copy when the name was generated or made unique. */
  file: File;
  name: string;
  type: string;
  size: number;
  pasted: boolean;
  /** A `blob:` URL for images, otherwise `''`. Revoked on removal. */
  previewUrl: string;
  /** Base64 without the `data:` prefix. Read once, then remembered. */
  base64(): Promise<string>;
  state?: AttachmentState;
}

/** What `setAttachmentState` draws on a chip. */
export interface AttachmentState {
  busy?: boolean;
  error?: string;
}

export interface Labels {
  add: string;
  addContext: string;
  addFile: string;
  attach: string;
  attachFiles: string;
  attachHint: string;
  attachLink: string;
  cancel: string;
  close: string;
  conversations: string;
  defaultModel: string;
  defaultModelNamed(name: string): string;
  delete: string;
  deleteConversation(title: string): string;
  dismiss: string;
  drop: string;
  invalidLink: string;
  linkUrl: string;
  loadMore: string;
  model: string;
  newChat: string;
  noConversations: string;
  noModels: string;
  options: string;
  pasteContent: string;
  pasteName: string;
  pasteText: string;
  remove: string;
  resetOptions: string;
  searchModels: string;
  send: string;
  stop: string;
  untitled: string;
  working: string;
  usedTools(n: number): string;
}

/** A row in the conversation list (the page's sidebar, the panel's switcher). */
export interface Conversation {
  id: string | number;
  title?: string;
  updated?: string | number | Date;
  /** With `href`, the row is a real link. */
  href?: string;
}

/** A choice in the model menu. Strings are shorthand for `{ id }`. */
export interface ModelChoice {
  id: string;
  label?: string;
  /** Items with the same group are listed under one heading (e.g. the provider). */
  group?: string;
  description?: string;
  disabled?: boolean;
}

/** An entry in the options menu: a pick-one list with `choices`, otherwise an on/off toggle. */
export interface AgentOption {
  id: string;
  label?: string;
  choices?: Array<string | number | boolean | { value: unknown; label?: string }>;
  /** Toggles default to false; lists to their first choice. */
  default?: unknown;
  description?: string;
  disabled?: boolean;
}

/** Built-in "+" menu items. */
export type BuiltInAddItem = 'attach' | 'paste' | 'context' | 'link';

/** A host's own "+" menu item. With `reference`, picking it adds that reference. */
export interface AddMenuItem {
  id: string;
  label: string;
  icon?: IconName | string;
  group?: string;
  description?: string;
  reference?: Reference;
  disabled?: boolean;
}

export interface ClearComposerOptions {
  draft?: boolean;
  attachments?: boolean;
  references?: boolean;
}

export interface SubmitDetail {
  text: string;
  attachments: Attachment[];
  references: Reference[];
  /** True when the draft was sent, false for `submit(text)` and suggestion clicks. */
  fromDraft: boolean;
  /** The chosen model id; `''` is the default. */
  model: string;
  /** Every option's value, defaults included. */
  options: Record<string, unknown>;
}

export interface AgentPanelEventMap {
  'agent-submit': CustomEvent<SubmitDetail>;
  'agent-stop': CustomEvent<null>;
  'agent-close': CustomEvent<null>;
  'agent-action': CustomEvent<{ action: string; [key: string]: unknown }>;
  'agent-attachments-change': CustomEvent<{ attachments: Attachment[] }>;
  'agent-attachment-error': CustomEvent<{ problems: string[] }>;
  'agent-error-dismiss': CustomEvent<null>;
  'agent-references-change': CustomEvent<{ references: Reference[] }>;
  'agent-reference-open': CustomEvent<{ reference: Reference }>;
  'agent-mention': CustomEvent<{ open: boolean; query: string }>;
  'agent-mention-key': CustomEvent<{ key: string; event: KeyboardEvent }>;
  /** Cancelable: cancelling keeps the current model. */
  'agent-model-change': CustomEvent<{ model: string; previous: string }>;
  /** Cancelable. `id` is `null` for "Reset to defaults". `values` is the result. */
  'agent-option-change': CustomEvent<{ id: string | null; value: unknown; values: Record<string, unknown> }>;
  /** Cancelable: cancelling skips the built-in action (file picker, paste form, adding `reference`…). */
  'agent-menu-select': CustomEvent<{ id: string; item: AddMenuItem }>;
  /** Cancelable: cancelling keeps a row with `href` from following its link. */
  'agent-select-conversation': CustomEvent<{ id: Conversation['id']; conversation: Conversation }>;
  'agent-new-conversation': CustomEvent<null>;
  'agent-delete-conversation': CustomEvent<{ id: Conversation['id']; conversation: Conversation }>;
  /** The list's "Load more" button (shown while `hasMore`). */
  'agent-load-more': CustomEvent<null>;
}

export type IconName =
  | 'paperclip' | 'send' | 'stop' | 'close' | 'chevron' | 'check' | 'alert' | 'file'
  | 'image' | 'upload' | 'at' | 'link' | 'history' | 'plus' | 'delete'
  | 'tune' | 'paste' | 'chevron-down' | 'search';

export declare class AgentPanelElement extends HTMLElement {
  static tagName: string;
  /** Collected from the base class to the subclass and appended in that order. */
  static styles: string;
  static readonly observedAttributes: string[];
  /** Registers the class under `tag` (default: `tagName`). Safe to call more than once. */
  static define<T extends typeof AgentPanelElement>(this: T, tag?: string, registry?: CustomElementRegistry): T;
  static readAsBase64(file: Blob): Promise<string>;
  static defaultLabels: Labels;
  /** Whether `conversations-menu` shows the switcher. `false` on `<agent-page>`. */
  static conversationSwitcher: boolean;

  /** Non-array values become `[]`. */
  entries: Entry[];
  /** Non-array values become `[]`. */
  suggestions: string[];
  /** Must return safe HTML. Non-functions become `null`. Setting it redraws all entries. */
  markdown: ((text: string) => string) | null;
  /** The setter merges a partial object over the defaults and redraws all entries. */
  get labels(): Labels;
  set labels(value: Partial<Labels> | null | undefined);
  draft: string;
  /** A shallow copy. */
  readonly attachments: Attachment[];
  /** Returns a copy; the setter dedupes and drops items without `type` or `id`. */
  references: Reference[];
  readonly mention: { open: boolean; query: string };
  readonly limits: Limits;
  /** Reflects the `error` attribute (`''` removes it). */
  error: string;
  running: boolean;
  disabled: boolean;
  closable: boolean;
  /** Items without `id` are dropped. Returns a copy. */
  conversations: Conversation[];
  /** Reflects the `active` attribute. */
  active: string;
  /** Reflects the `has-more` attribute: the list ends with "Load more". */
  hasMore: boolean;
  /** Non-functions restore the built-in format. */
  formatDate: (value: unknown) => string;
  /** The model menu; empty hides it. Returns a copy with ids as strings. */
  get models(): ModelChoice[];
  set models(value: Array<string | ModelChoice> | null | undefined);
  /** The chosen model id; `''` means the default (`default-model` names it). */
  model: string;
  /** The options menu; empty hides it. */
  get options(): AgentOption[];
  set options(value: AgentOption[] | null | undefined);
  /** Every option's value, defaults included. Setting it replaces the chosen values. */
  get optionValues(): Record<string, unknown>;
  set optionValues(value: Record<string, unknown> | null | undefined);
  /** The "+" menu. Default `['attach', 'paste', 'context']`; `null` restores it. */
  get addMenu(): Array<BuiltInAddItem | AddMenuItem>;
  set addMenu(value: Array<BuiltInAddItem | AddMenuItem> | null | undefined);

  /** Opens the conversation switcher (only with `conversations-menu`). */
  openConversations(): void;
  closeConversations(): void;
  submit(text?: string): boolean;
  clearComposer(options?: ClearComposerOptions): void;
  addFiles(files: Iterable<File> | ArrayLike<File>, opts?: { pasted?: boolean }): { added: Attachment[]; problems: string[] };
  removeAttachment(id: string): void;
  clearAttachments(): void;
  /** Draws a spinner (`busy`) or an error tone (`error`) on a chip. `null` clears it. */
  setAttachmentState(id: string, state: AttachmentState | null): void;
  /** `false` if already present or invalid. */
  addReference(ref: Reference): boolean;
  removeReference(refOrKey: Reference | string): void;
  openMention(): void;
  closeMention(): void;
  focus(options?: FocusOptions): void;
  scrollToBottom(opts?: { force?: boolean }): void;
  defineEntry(type: string, render: ((entry: Entry, panel: this) => Node) | null): this;
  emitAction(action: string, detail?: object): boolean;

  // Overridable hooks
  /** `null` leaves the entry to `<slot name="entry-{id}">`. */
  renderEntry(entry: Entry): Node | null;
  renderText(entry: TextEntry): Node;
  renderTools(entry: ToolsEntry): Node;
  /** Must return safe HTML. */
  renderMarkdown(text: string): string;
  renderReference(ref: Reference, opts?: { removable?: boolean }): Node;
  referenceIcon(ref: Reference): Node;
  /** `''` means allowed. The default checks `limits`. */
  fileProblem(file: File, current: Attachment[]): string;
  /** Runs in the constructor; returns the shadow root's content. */
  layout(panel: HTMLElement): HTMLElement;

  addEventListener<K extends keyof AgentPanelEventMap>(type: K, listener: (this: this, ev: AgentPanelEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: this, ev: HTMLElementEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof AgentPanelEventMap>(type: K, listener: (this: this, ev: AgentPanelEventMap[K]) => unknown, options?: boolean | EventListenerOptions): void;
  removeEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: this, ev: HTMLElementEventMap[K]) => unknown, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

/** The href itself if it is relative or HTTP(S); `''` otherwise. */
export declare function safeHref(href: unknown): string;
/** Today: the time. Otherwise the date (with the year when it isn't this year). */
export declare function defaultFormatDate(value: unknown): string;

/** `${type}:${id}`, the identity references are deduplicated by. */
export declare function referenceKey(ref: Pick<Reference, 'type' | 'id'>): string;

/** A small DOM builder. `html` sets innerHTML, so only pass markup you trust. */
export declare function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, unknown> | null, ...children: unknown[]): HTMLElementTagNameMap[K];
export declare function h(tag: string, props?: Record<string, unknown> | null, ...children: unknown[]): HTMLElement;

/** A string that isn't an icon name and starts with M/m is used as the SVG path itself. */
export declare function icon(nameOrPath: IconName | (string & {}), size?: number, className?: string): SVGSVGElement;
