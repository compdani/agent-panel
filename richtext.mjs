// Rich text for the composer: bold and italic, kept as markdown. Pure functions over
// node-like objects (nodeType, nodeName, childNodes, data, style), so they run under
// `node --test` without a DOM. Text the person types is passed through unescaped, so a
// plain message is sent exactly as typed, the same as with the textarea.

const SKIP = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'META', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'IMG', 'SVG', 'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);
const BLOCK = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'UL']);

export function escapeHTML(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function weight(el) {
  const value = String(el.style?.fontWeight || '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'bold' || value === 'bolder') return true;
  if (value === 'normal' || value === 'lighter') return false;
  const n = Number(value);
  return Number.isFinite(n) ? n >= 600 : null;
}

function slant(el) {
  const value = String(el.style?.fontStyle || '').trim().toLowerCase();
  if (!value) return null;
  return value === 'italic' || value.startsWith('oblique');
}

/**
 * Runs of { text, bold, italic } from a node's content. Line breaks are runs of '\n'.
 * `collapse` folds HTML source whitespace (for pasted markup; not for the editor itself).
 */
export function runsFromNode(root, { collapse = false } = {}) {
  const runs = [];
  const push = (text, bold, italic) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && last.text !== '\n' && text !== '\n' && last.bold === bold && last.italic === italic) last.text += text;
    else runs.push({ text, bold, italic });
  };
  const atLineStart = () => !runs.length || runs[runs.length - 1].text === '\n';
  const newline = () => { if (!atLineStart()) push('\n', false, false); };
  const walk = (node, bold, italic, pre) => {
    if (node.nodeType === 3) {
      let text = String(node.data ?? '');
      if (collapse && !pre) {
        text = text.replace(/[\t\n\r\f ]+/g, ' ');
        if (atLineStart()) text = text.replace(/^ /, '');
      }
      // Line breaks inside text (pre-wrap editors put them there) are their own runs, so
      // bold and italic close at the end of each line.
      text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').split('\n').forEach((line, n) => {
        if (n) push('\n', false, false);
        push(line, bold, italic);
      });
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 11 && node.nodeType !== 9) return;
    const tag = String(node.nodeName || '').toUpperCase();
    if (SKIP.has(tag)) return;
    if (tag === 'BR') {
      push('\n', false, false);
      return;
    }
    let b = bold;
    let i = italic;
    if (tag === 'B' || tag === 'STRONG' || /^H[1-6]$/.test(tag) || tag === 'TH') b = true;
    if (tag === 'I' || tag === 'EM' || tag === 'CITE' || tag === 'DFN') i = true;
    if (node.nodeType === 1) {
      b = weight(node) ?? b;
      i = slant(node) ?? i;
    }
    const block = BLOCK.has(tag);
    if (block) newline();
    if ((tag === 'TD' || tag === 'TH') && !atLineStart()) push('\t', false, false);
    if (tag === 'LI') push('- ', false, false);
    Array.from(node.childNodes || []).forEach((child) => walk(child, b, i, pre || tag === 'PRE'));
    if (block) newline();
  };
  walk(root, false, false, false);
  if (collapse) {
    // Spaces left at the ends of lines by folded source whitespace.
    runs.forEach((run, n) => {
      if (run.text !== '\n' && (runs[n + 1]?.text === '\n' || n === runs.length - 1)) run.text = run.text.replace(/ +$/, '');
    });
  }
  while (runs.length && runs[runs.length - 1].text === '\n') runs.pop();
  while (runs.length && runs[0].text === '\n') runs.shift();
  return runs.filter((r) => r.text);
}

// One way of writing runs as markdown. Bold is `**` or `__`, italic `*` or `_`; a marker
// that would touch the same character (and merge into one delimiter run) uses the other.
// `pick(n)`, when given, chooses the character of the n-th marker opened.
function writeMarkdown(runs, boldChar, italicChar, switchAdjacent, pick = null, italicFirst = false) {
  let out = '';
  let opened = 0;
  const open = []; // { style: 'b' | 'i', marker }
  const closeTo = (depth) => {
    const trailing = /\s*$/.exec(out)[0];
    out = out.slice(0, out.length - trailing.length);
    while (open.length > depth) out += open.pop().marker;
    out += trailing;
  };
  const marker = (style) => {
    const preferred = style === 'b' ? boldChar : italicChar;
    let ch = switchAdjacent && out.endsWith(preferred) ? (preferred === '*' ? '_' : '*') : preferred;
    if (pick) ch = pick(opened);
    opened += 1;
    return style === 'b' ? ch + ch : ch;
  };
  runs.forEach((run) => {
    if (run.text === '\n' || !run.text.trim()) {
      if (run.text.includes('\n')) closeTo(0);
      out += run.text;
      return;
    }
    const want = (italicFirst ? [run.italic && 'i', run.bold && 'b'] : [run.bold && 'b', run.italic && 'i']).filter(Boolean);
    // Markers must nest: close from the first one this run doesn't want, keep the rest.
    const first = open.findIndex((m) => !want.includes(m.style));
    if (first >= 0) closeTo(first);
    // Leading spaces go before new markers; closeTo() moves trailing ones after them.
    const lead = /^\s*/.exec(run.text)[0];
    out += lead;
    want.filter((style) => !open.some((m) => m.style === style)).forEach((style) => {
      const m = { style, marker: marker(style) };
      out += m.marker;
      open.push(m);
    });
    out += run.text.slice(lead.length);
  });
  closeTo(0);
  writeMarkdown.opened = opened;
  return out;
}

// Each non-space character with its bold and italic, for comparing two texts' formatting.
function styleKey(chars) {
  return chars.map(({ ch, bold, italic }) => (/\s/.test(ch) ? ch : `${ch}${bold ? 'B' : ''}${italic ? 'I' : ''}`)).join('\u0001');
}

function runChars(runs) {
  return runs.flatMap((run) => Array.from(run.text).map((ch) => ({ ch, bold: run.bold, italic: run.italic })));
}

/**
 * Markdown for runs: `**bold**`, `*italic*`, nested as needed, markers never touching
 * spaces. The result is parsed back; if the formatting doesn't survive (two markers
 * merging into one delimiter run), other delimiter choices are tried. Typed text is not
 * escaped, so text with its own `*` or `_` keeps the first form.
 */
export function runsToMarkdown(runs) {
  const want = styleKey(runChars(runs));
  const ok = (md) => styleKey(markdownChars(md)) === want;
  const tries = [false, true].flatMap((italicFirst) => [true, false].flatMap((adjacent) => [['*', '*'], ['_', '*'], ['*', '_'], ['_', '_']]
    .map(([b, i]) => writeMarkdown(runs, b, i, adjacent, null, italicFirst))));
  const found = tries.find(ok);
  if (found !== undefined) return found;
  // Rare tangles: try every choice of character per marker, for a handful of markers.
  for (const italicFirst of [false, true]) {
    writeMarkdown(runs, '*', '*', false, null, italicFirst);
    const markers = writeMarkdown.opened;
    if (markers > 10) continue;
    for (let mask = 0; mask < 2 ** markers; mask += 1) {
      const md = writeMarkdown(runs, '*', '*', false, (n) => ((mask >> n) & 1 ? '_' : '*'), italicFirst);
      if (ok(md)) return md;
    }
  }
  return tries[0];
}

/** Safe HTML for runs, for inserting into the editor. */
export function runsToHTML(runs) {
  return runs.map((run) => {
    if (run.text === '\n') return '<br>';
    let html = escapeHTML(run.text).replace(/\n/g, '<br>');
    if (run.italic) html = `<em>${html}</em>`;
    if (run.bold) html = `<strong>${html}</strong>`;
    return html;
  }).join('');
}

// CommonMark's emphasis rules (delimiter runs, flanking, the rule of 3), so text renders
// the way the model and the hosts' markdown renderers read it.
const isSpace = (ch) => ch === undefined || /\s/u.test(ch);
const isPunct = (ch) => ch !== undefined && /[\p{P}\p{S}]/u.test(ch);

// A tree of { kind: 'text', value } and { kind: 'el', tag: 'strong' | 'em', children }.
function parseEmphasis(text) {
  const nodes = [];
  let buf = '';
  const flush = () => {
    if (buf) nodes.push({ kind: 'text', value: buf });
    buf = '';
  };
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '\\' && /[*_\\]/.test(text[i + 1] || '')) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    if (c !== '*' && c !== '_') {
      buf += c;
      i += 1;
      continue;
    }
    let j = i;
    while (text[j] === c) j += 1;
    const before = text[i - 1];
    const after = text[j];
    const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
    const right = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
    const canOpen = c === '*' ? left : left && (!right || isPunct(before));
    const canClose = c === '*' ? right : right && (!left || isPunct(after));
    flush();
    // canOpen/canClose stay as parsed (the rule of 3 needs them); `closing` is what's left.
    nodes.push({ kind: 'delim', ch: c, count: j - i, length: j - i, canOpen, canClose, closing: canClose });
    i = j;
  }
  flush();
  const literal = (n) => (n.kind === 'delim' ? { kind: 'text', value: n.ch.repeat(n.count) } : n);
  let at = 0;
  while (at < nodes.length) {
    const closer = nodes[at];
    if (closer.kind !== 'delim' || !closer.closing) {
      at += 1;
      continue;
    }
    let o = at - 1;
    for (; o >= 0; o -= 1) {
      const opener = nodes[o];
      if (opener.kind !== 'delim' || opener.ch !== closer.ch || !opener.canOpen) continue;
      const both = (opener.canOpen && opener.canClose) || (closer.canOpen && closer.canClose);
      const ruleOf3 = both && (opener.length + closer.length) % 3 === 0 && !(opener.length % 3 === 0 && closer.length % 3 === 0);
      if (!ruleOf3) break;
    }
    if (o < 0) {
      closer.closing = false;
      if (!closer.canOpen) nodes[at] = literal(closer);
      at += 1;
      continue;
    }
    const opener = nodes[o];
    const use = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
    const inner = nodes.slice(o + 1, at).map(literal);
    nodes.splice(o + 1, at - o - 1, { kind: 'el', tag: use === 2 ? 'strong' : 'em', children: inner });
    opener.count -= use;
    closer.count -= use;
    at = o + 2;
    if (!opener.count) {
      nodes.splice(o, 1);
      at -= 1;
    }
    if (!closer.count) nodes.splice(at, 1);
  }
  return nodes.map(literal);
}

// Paragraphs (split at blank lines, which emphasis never crosses) and the separators.
function paragraphs(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').split(/(\n[ \t]*\n)/);
}

function renderHTML(list) {
  return list.map((n) => (n.kind === 'el' ? `<${n.tag}>${renderHTML(n.children)}</${n.tag}>` : escapeHTML(n.value))).join('');
}

function treeChars(list, bold = false, italic = false) {
  return list.flatMap((n) => (n.kind === 'el'
    ? treeChars(n.children, bold || n.tag === 'strong', italic || n.tag === 'em')
    : Array.from(n.value).map((ch) => ({ ch, bold, italic }))));
}

// Each character of markdown text with the bold and italic CommonMark gives it.
function markdownChars(text) {
  return paragraphs(text).flatMap((part, n) => (n % 2
    ? Array.from(part).map((ch) => ({ ch, bold: false, italic: false }))
    : treeChars(parseEmphasis(part))));
}

/**
 * Safe HTML for the bold and italic in markdown text (`**x**`, `__x__`, `*x*`, `_x_`,
 * nested and adjacent, with `\*` and `\_` as literals), following CommonMark.
 * Everything else is escaped text. Emphasis never crosses a blank line. `breaks` turns
 * newlines into <br> (for the editor; bubbles use white-space: pre-wrap).
 */
export function inlineMarkdownToHTML(text, { breaks = false } = {}) {
  const html = paragraphs(text).map((part, n) => (n % 2 ? escapeHTML(part) : renderHTML(parseEmphasis(part)))).join('');
  return breaks ? html.replace(/\n/g, '<br>') : html;
}

/** Runs for plain text (a plain-text paste). */
export function runsFromText(text) {
  const runs = [];
  String(text ?? '').replace(/\r\n?/g, '\n').split('\n').forEach((line, n) => {
    if (n) runs.push({ text: '\n', bold: false, italic: false });
    if (line) runs.push({ text: line, bold: false, italic: false });
  });
  return runs;
}
