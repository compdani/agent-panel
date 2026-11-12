import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attachmentProblem, extensionFor, filesFromDataTransfer, matchesAccept, nameFor, pastedFiles, readAsBase64,
} from '../attachments.mjs';

const file = (name, type, size = 10) => new File([new Uint8Array(size)], name, { type, lastModified: 1 });

// A clipboard or drop, the way browsers shape it.
function transfer(files, { text = '', itemsOnly = false } = {}) {
  return {
    files: itemsOnly ? [] : files,
    items: files.map((f) => ({ kind: 'file', getAsFile: () => f })).concat(text ? [{ kind: 'string' }] : []),
    getData: (type) => (type === 'text/plain' ? text : ''),
  };
}

test('files listed under both files and items are taken once', () => {
  const shot = file('image.png', 'image/png');
  assert.deepEqual(filesFromDataTransfer(transfer([shot])), [shot]);
  assert.deepEqual(filesFromDataTransfer(transfer([shot], { itemsOnly: true })), [shot], 'a screenshot only under items still counts');
  assert.deepEqual(filesFromDataTransfer(null), []);
});

test('a pasted screenshot attaches', () => {
  const shot = file('image.png', 'image/png');
  assert.deepEqual(pastedFiles(transfer([shot])), [shot]);
});

test('text copied from a spreadsheet pastes as text, not as its picture', () => {
  const picture = file('image.png', 'image/png');
  assert.deepEqual(pastedFiles(transfer([picture], { text: 'Name\tEmail\nAna\tana@example.com' })), []);
});

test('an image file copied from the file manager attaches even though its name is on the clipboard', () => {
  const photo = file('photo.jpg', 'image/jpeg');
  assert.deepEqual(pastedFiles(transfer([photo], { text: 'photo.jpg' })), [photo]);
});

test('a copied PDF attaches alongside text', () => {
  const pdf = file('brief.pdf', 'application/pdf');
  assert.deepEqual(pastedFiles(transfer([pdf], { text: 'brief.pdf and more' })), [pdf]);
});

test('pasted images get a descriptive, distinct name', () => {
  const now = new Date(2026, 10, 12, 9, 5, 7);
  assert.equal(nameFor(file('', 'image/png'), { pasted: true, now }), 'pasted-image-20261112-090507.png');
  assert.equal(nameFor(file('image.png', 'image/png'), { pasted: true, now, index: 1 }), 'pasted-image-20261112-090507-2.png');
  assert.equal(nameFor(file('image.png', 'image/png'), { now }), 'image.png', 'picked files keep their name');
  assert.equal(nameFor(file('chart.png', 'image/png'), { pasted: true, now }), 'chart.png');
  assert.equal(nameFor(file('', 'application/pdf'), { now }), 'pasted-file-20261112-090507.pdf');
});

test('extensions come from the type', () => {
  assert.equal(extensionFor('image/jpeg'), 'jpg');
  assert.equal(extensionFor('image/x-icon'), 'icon');
  assert.equal(extensionFor(''), 'bin');
});

test('accept rules match types, wildcards and extensions', () => {
  assert.ok(matchesAccept(file('a.png', 'image/png'), 'image/*'));
  assert.ok(matchesAccept(file('a.txt', ''), 'image/*,.txt'));
  assert.ok(matchesAccept(file('a.pdf', 'application/pdf'), 'application/pdf'));
  assert.ok(!matchesAccept(file('a.csv', 'text/csv'), 'image/*,text/plain'));
  assert.ok(matchesAccept(file('a.zip', 'application/zip'), ''), 'no rules accepts anything');
});

test('limits are checked per file, in total and by count', () => {
  const limits = { accept: 'image/*', maxFileSize: 100, maxTotalSize: 150, maxFiles: 2 };
  assert.equal(attachmentProblem(file('a.png', 'image/png', 50), [], limits), '');
  assert.match(attachmentProblem(file('a.pdf', 'application/pdf'), [], limits), /isn't a type/);
  assert.match(attachmentProblem(file('a.png', 'image/png', 101), [], limits), /larger than 100 B/);
  assert.match(attachmentProblem(file('a.png', 'image/png', 60), [{ size: 100 }], limits), /150 B in total/);
  assert.match(attachmentProblem(file('a.png', 'image/png', 1), [{ size: 1 }, { size: 1 }], limits), /up to 2 files/);
});

test('files read as base64 without a data: prefix', async () => {
  assert.equal(await readAsBase64(new File(['hello'], 'a.txt', { type: 'text/plain' })), 'aGVsbG8=');
  const big = new Uint8Array(100000).map((_, i) => i % 256);
  assert.equal(await readAsBase64(new File([big], 'b.bin')), Buffer.from(big).toString('base64'), 'large files encode in chunks');
});
