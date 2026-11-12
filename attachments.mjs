// Files a person adds to the composer: picked, pasted or dropped. No DOM access beyond
// the File and DataTransfer objects passed in, so these run under Node's test runner too.

export const DEFAULT_LIMITS = Object.freeze({
  accept: 'image/*,application/pdf,text/*',
  maxFileSize: 6 * 1024 * 1024,
  maxTotalSize: 20 * 1024 * 1024,
  maxFiles: 12,
});

const EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/html': 'html',
  'text/markdown': 'md',
  'application/json': 'json',
};

export function extensionFor(mime) {
  const type = String(mime || '').toLowerCase();
  if (EXTENSIONS[type]) return EXTENSIONS[type];
  const sub = type.split('/')[1];
  return sub && /^[a-z0-9.+-]+$/.test(sub) ? sub.replace(/^x-/, '').split('+')[0] : 'bin';
}

// Every file in a paste or drop, once. Browsers list the same file under both `files`
// and `items`, and a pasted screenshot sometimes only under `items`.
export function filesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return [];
  const out = [];
  const seen = new Set();
  const push = (file) => {
    if (!file) return;
    const key = `${file.name}|${file.size}|${file.type}|${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(file);
  };
  Array.from(dataTransfer.files || []).forEach(push);
  Array.from(dataTransfer.items || []).forEach((item) => {
    if (item.kind === 'file') push(item.getAsFile());
  });
  return out;
}

// The files a paste should attach. Spreadsheets and word processors put a picture of the
// copied cells or text on the clipboard beside the text itself; that paste is text, so
// it's left to the textarea. A copied image file (whose text is just its name) attaches.
export function pastedFiles(clipboardData) {
  const files = filesFromDataTransfer(clipboardData);
  if (!files.length) return [];
  const text = String(clipboardData.getData?.('text/plain') || '').trim();
  const onlyImages = files.every((file) => String(file.type).startsWith('image/'));
  if (text && onlyImages && !files.some((file) => file.name && file.name === text)) return [];
  return files;
}

function stamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// Clipboard images usually arrive as "image.png" or with no name at all; give them a
// name that says where they came from and keeps several pastes apart.
export function nameFor(file, { pasted = false, now = new Date(), index = 0 } = {}) {
  const name = String(file?.name || '').trim();
  const generic = !name || (pasted && /^image\.(png|jpe?g|gif|webp)$/i.test(name));
  if (!generic) return name;
  const kind = String(file?.type || '').startsWith('image/') ? 'pasted-image' : 'pasted-file';
  return `${kind}-${stamp(now)}${index ? `-${index + 1}` : ''}.${extensionFor(file?.type)}`;
}

export function matchesAccept(file, accept) {
  const rules = String(accept || '').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

export function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`;
}

// Why a file can't join the ones already attached, or '' if it can.
export function attachmentProblem(file, current = [], limits = DEFAULT_LIMITS) {
  const { accept, maxFileSize, maxTotalSize, maxFiles } = { ...DEFAULT_LIMITS, ...limits };
  if (!matchesAccept(file, accept)) return `${file.name || 'This file'} isn't a type that can be attached.`;
  if (current.length >= maxFiles) return `You can attach up to ${maxFiles} files.`;
  if (file.size > maxFileSize) return `${file.name} is larger than ${formatBytes(maxFileSize)}.`;
  const total = current.reduce((sum, item) => sum + (item.size || 0), 0);
  if (total + file.size > maxTotalSize) return `Attachments can add up to ${formatBytes(maxTotalSize)} in total.`;
  return '';
}

// Base64 without the data: prefix, which is what most model APIs take.
export async function readAsBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
