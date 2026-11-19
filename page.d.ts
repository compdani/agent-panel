// Types for page.js (agent-panel/page), which defines <agent-page> (not <agent-panel>).
import type { AgentPageElement } from './page-element.js';

export * from './page-element.js';
export { AgentPanelElement, h, icon, referenceKey } from './element.js';
export type {
  AddMenuItem, AgentOption, AgentPanelEventMap, Attachment, AttachmentState, BuiltInAddItem, ClearComposerOptions,
  Conversation,
  CustomEntry, Entry, IconName, Labels, ModelChoice, Reference, Role, SubmitDetail, TextEntry, ToolCall, ToolsEntry,
} from './element.js';
export * from './attachments.mjs';

declare global {
  interface HTMLElementTagNameMap {
    'agent-page': AgentPageElement;
  }
}
