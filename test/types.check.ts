import { AgentPanelElement, type AttachmentState, readAsBase64 } from 'agent-panel';
import { AgentPageElement } from 'agent-panel/page';
import { matchesAccept } from 'agent-panel/attachments';
import { h } from 'agent-panel/element';
import type { Conversation } from 'agent-panel/page-element';
const panel: AgentPanelElement = document.createElement('agent-panel');
const page: AgentPageElement = document.createElement('agent-page');
panel.addEventListener('agent-submit', event => {
  const fromDraft: boolean = event.detail.fromDraft;
  panel.clearComposer({ draft: fromDraft, attachments: false });
  event.detail.attachments.forEach(a => {
    const state: AttachmentState = a.state ?? {};
    panel.setAttachmentState(a.id, { ...state, busy: true });
    void readAsBase64(a.file);
  });
});
page.addEventListener('agent-select-conversation', e => {
  const conversation: Conversation = e.detail.conversation;
  page.active = String(conversation.id);
});
page.addEventListener('agent-submit', e => { e.detail.references.map(ref => ref.id); });
panel.labels = { send: 'Go' };
page.labels = { newChat: 'New' };
AgentPanelElement.define('custom-panel');
h('button', null, matchesAccept(new File([], 'x.txt'), 'text/*'));
// @ts-expect-error fromDraft is a boolean
panel.addEventListener('agent-submit', e => { const s: string = e.detail.fromDraft; });

import { prepareSubmission, toOpenAIContent, type Asset } from 'agent-panel/openai';
const asset: Asset = { type: 'asset', id: 'a', url: 'https://example.com/a.png', mimeType: 'image/png' };
panel.entries = [{ id: 'asset', type: 'text', role: 'user', content: '', assets: [asset] }];
void toOpenAIContent({ assets: [asset] });
panel.addEventListener('agent-submit', event => {
  void prepareSubmission(event.detail, { upload: async (file, attachment) => ({ url: 'https://example.com/' + file.name, id: attachment.id }) });
});

panel.models = ['gpt-5', { id: 'claude-opus-5-5', group: 'Anthropic' }];
panel.options = [{ id: 'effort', choices: ['low', 'high'], default: 'high' }, { id: 'auto', label: 'Auto-apply' }];
panel.addMenu = ['attach', 'paste', { id: 'kit', label: 'Kit', group: 'Brand kits', reference: { type: 'brand_kit', id: 1 } }];
panel.addEventListener('agent-model-change', e => { const m: string = e.detail.model; });
panel.addEventListener('agent-option-change', e => { const id: string | null = e.detail.id; });
panel.addEventListener('agent-submit', e => { const m: string = e.detail.model; void e.detail.options.effort; });
// @ts-expect-error unknown built-in item
panel.addMenu = ['camera'];
import type { AddMenuItem, AgentOption, ModelChoice } from 'agent-panel/page';
const pageModels: ModelChoice[] = [{ id: 'x' }];
const pageOptions: AgentOption[] = [{ id: 'y' }];
const pageItems: AddMenuItem[] = [{ id: 'z', label: 'Z' }];
page.models = pageModels; page.options = pageOptions; page.addMenu = pageItems;
