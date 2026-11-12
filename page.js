// Entry point for the full-page chat: defines <agent-page>. Importing this does not
// define <agent-panel>; import 'agent-panel' too if you want both.
import { AgentPageElement } from './agent-page.js';

AgentPageElement.define();

export * from './agent-page.js';
export {
  AgentPanelElement, h, icon, referenceKey,
} from './agent-panel.js';
export * from './attachments.mjs';
