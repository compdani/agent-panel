// Types for agent-page.js (agent-panel/page-element). This module defines no tag.
import type { AgentPanelElement, AgentPanelEventMap, Conversation, Labels } from './element.js';

export type { Conversation } from './element.js';

export interface PageLabels extends Labels {
  inContext: string;
  rename: string;
  titleLabel: string;
}

export interface AgentPageEventMap extends AgentPanelEventMap {
  'agent-rename': CustomEvent<{ title: string }>;
}

export declare class AgentPageElement extends AgentPanelElement {
  static defaultLabels: PageLabels;

  get labels(): PageLabels;
  set labels(value: Partial<PageLabels> | null | undefined);
  /** Reflects the `renamable` attribute. */
  renamable: boolean;
  contextReferences: import('./element.js').Reference[];

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
