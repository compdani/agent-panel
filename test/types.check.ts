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
