// Entry point for using the panel as is: defines <agent-panel>. Subclasses import from
// agent-panel.js instead and define their own tag.
import { AgentPanelElement } from './agent-panel.js';

AgentPanelElement.define();

export * from './agent-panel.js';
export * from './attachments.mjs';
