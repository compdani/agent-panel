// No network I/O: the host owns asset storage and its server-side OpenAI client.
import { readAsBase64 } from './attachments.mjs';

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export function assetUrl(value) {
  try {
    const url = new URL(value);
    // Credentials in a URL would be forwarded to whoever fetches it.
    if (url.username || url.password) return '';
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function imageType(asset) {
  // An explicit MIME type wins over the name or URL extension.
  const declared = String(asset.mimeType || '').split(';')[0].trim().toLowerCase();
  if (declared) return declared.startsWith('image/') ? declared : '';
  const ext = String(asset.name || assetUrl(asset.url) || '').split(/[?#]/)[0].split('.').pop().toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' })[ext] || '';
}

function assetContent(asset) {
  const mime = imageType(asset);
  if (mime && !imageTypes.has(mime)) throw new TypeError(`Unsupported OpenAI image type: ${mime}`);
  const url = assetUrl(asset.url);
  if (!asset.fileId && !url) throw new TypeError('Assets need an HTTP(S) URL or OpenAI fileId.');
  if (mime) return { type: 'input_image', detail: 'auto', ...(asset.fileId ? { file_id: asset.fileId } : { image_url: url }) };
  return { type: 'input_file', ...(asset.fileId ? { file_id: asset.fileId } : { file_url: url }) };
}

/** Convert a submission to Responses API user content. Ordinary references stay text. */
export async function toOpenAIContent({ text = '', attachments = [], references = [], assets = [] } = {}) {
  const content = text ? [{ type: 'input_text', text }] : [];
  for (const ref of references) {
    if (ref.type === 'asset') content.push(assetContent(ref));
    else content.push({ type: 'input_text', text: `Reference ${ref.type}:${ref.id}: ${ref.label || ref.id}` });
  }
  for (const asset of assets) content.push(assetContent(asset));
  for (const attachment of attachments) {
    const file = attachment.file || attachment;
    const mime = file.type || imageType({ name: file.name }) || 'application/octet-stream';
    const base64 = await readAsBase64(file);
    const data = `data:${mime};base64,${base64}`;
    if (mime.startsWith('image/')) {
      if (!imageTypes.has(mime)) throw new TypeError(`Unsupported OpenAI image type: ${mime}`);
      content.push({ type: 'input_image', image_url: data, detail: 'auto' });
    } else content.push({ type: 'input_file', filename: attachment.name || file.name, file_data: data });
  }
  return content;
}

/** Upload files to host-owned storage before building model content. Rejects on failure. */
export async function prepareSubmission(detail, { upload } = {}) {
  const assets = [...(detail.assets || [])];
  const attachments = detail.attachments || [];
  if (upload) {
    for (const attachment of attachments) {
      const stored = await upload(attachment.file, attachment);
      const asset = { type: 'asset', id: attachment.id, name: attachment.name,
        label: attachment.name, mimeType: attachment.type, size: attachment.size, ...stored, type: 'asset' };
      assetContent(asset); // Reject unusable upload results before sending anything.
      assets.push(asset);
    }
  }
  return { assets, content: await toOpenAIContent({ ...detail, assets, attachments: upload ? [] : attachments }) };
}
