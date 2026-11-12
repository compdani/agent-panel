// Types for index.js (agent-panel), which defines <agent-panel>.
import type { AgentPanelElement } from './element.js';

export * from './element.js';
export * from './attachments.mjs';

declare global {
  interface HTMLElementTagNameMap {
    'agent-panel': AgentPanelElement;
  }
}
