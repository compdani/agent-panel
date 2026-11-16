import test from 'node:test';
import assert from 'node:assert/strict';
import { assetUrl, toOpenAIContent, prepareSubmission } from '../openai.mjs';
import { attachmentProblem } from '../attachments.mjs';

test('documents with empty browser MIME types are attachable', () => {
  for (const name of ['notes.md', 'contract.doc', 'contract.docx', 'deck.pptx', 'sheet.xlsx']) {
    assert.equal(attachmentProblem(new File(['content'], name)), '');
  }
});
test('inline pictures and documents use distinct Responses content parts', async () => {
  const content = await toOpenAIContent({ text: 'Read these', attachments: [
    new File(['pic'], 'picture.png', { type: 'image/png' }),
    new File(['notes'], 'notes.md', { type: 'text/markdown' }),
    new File(['word'], 'contract.docx'),
  ] });
  assert.deepEqual(content.map(c => c.type), ['input_text', 'input_image', 'input_file', 'input_file']);
  assert.equal(content[1].image_url, 'data:image/png;base64,cGlj');
  assert.equal(content[2].filename, 'notes.md');
  assert.equal(content[3].file_data, 'data:application/octet-stream;base64,d29yZA==');
});
test('asset URLs and file IDs become model inputs; ordinary references stay text', async () => {
  const result = await toOpenAIContent({ references: [
    { type: 'asset', id: 'pic', url: 'https://example.com/pic.png' },
    { type: 'asset', id: 'doc', fileId: 'file-123' },
    { type: 'record', id: 2, label: 'Deal' },
  ] });
  assert.equal(result[0].image_url, 'https://example.com/pic.png');
  assert.equal(result[1].file_id, 'file-123');
  assert.match(result[2].text, /record:2/);
});
test('uploads return durable assets and use URLs instead of inline bytes', async () => {
  const file = new File(['img'], 'image.png', { type: 'image/png' });
  const detail = { text: '', attachments: [{ id: 'att-1', file, name: file.name, type: file.type, size: file.size }], references: [], fromDraft: true };
  const result = await prepareSubmission(detail, { upload: async f => {
    assert.equal(f, file);
    return { id: 'stored-1', url: 'https://example.com/asset.png' };
  } });
  assert.equal(result.assets[0].id, 'stored-1');
  assert.equal(result.assets[0].mimeType, 'image/png');
  assert.equal(result.content[0].image_url, 'https://example.com/asset.png');
  await assert.rejects(prepareSubmission(detail, { upload: async () => { throw Error('upload failed'); } }), /upload failed/);
  await assert.rejects(prepareSubmission(detail, { upload: async () => ({}) }), /HTTP/);
});
test('unsafe URLs and unsupported images fail explicitly', async () => {
  for (const url of ['javascript:alert(1)', 'file:///tmp/a', 'blob:abc', 'data:image/png;base64,AA']) {
    assert.equal(assetUrl(url), '');
    await assert.rejects(toOpenAIContent({ assets: [{ type: 'asset', id: 1, url }] }), /HTTP/);
  }
  await assert.rejects(toOpenAIContent({ attachments: [new File(['svg'], 'a.svg', { type: 'image/svg+xml' })] }), /Unsupported/);
});
