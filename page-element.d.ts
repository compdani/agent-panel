// Types for agent-page.js (agent-panel/page-element). This module defines no tag.
import type { AgentPanelElement, AgentPanelEventMap, Labels } from './element.js';

export interface PageLabels extends Labels {
  cancel: string;
  conversations: string;
  delete: string;
  deleteConversation(title: string): string;
  inContext: string;
  newChat: string;
  noConversations: string;
  rename: string;
  titleLabel: string;
  untitled: string;
}

export interface Conversation {
  id: string | number;
  title?: string;
  updated?: string | number | Date;
  /** With `href`, the row is a real link. */
  href?: string;
}

export interface AgentPageEventMap extends AgentPanelEventMap {
  'agent-select-conversation': CustomEvent<{ id: Conversation['id']; conversation: Conversation }>;
  'agent-new-conversation': CustomEvent<null>;
  'agent-delete-conversation': CustomEvent<{ id: Conversation['id']; conversation: Conversation }>;
  'agent-rename': CustomEvent<{ title: string }>;
}

export declare class AgentPageElement extends AgentPanelElement {
  static defaultLabels: PageLabels;

  get labels(): PageLabels;
  set labels(value: Partial<PageLabels> | null | undefined);
  /** Items without `id` are dropped. */
  conversations: Conversation[];
  /** Reflects the `active` attribute. */
  active: string;
  /** Reflects the `renamable` attribute. */
  renamable: boolean;
  contextReferences: import('./element.js').Reference[];
  /** Non-functions restore the built-in format. */
  formatDate: (value: unknown) => string;

  /** Opens the drawer below 760px. */
  openSidebar(): void;
  closeSidebar(): void;
  /** No-op unless `renamable`. */
  startRename(): void;

  addEventListener<K extends keyof AgentPageEventMap>(type: K, listener: (this: this, ev: AgentPageEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: this, ev: HTMLElementEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof AgentPageEventMap>(type: K, listener: (this: this, ev: AgentPageEventMap[K]) => unknown, options?: boolean | EventListenerOptions): void;
  removeEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: this, ev: HTMLElementEventMap[K]) => unknown, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}
