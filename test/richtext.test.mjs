import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineMarkdownToHTML, runsFromNode, runsFromText, runsToHTML, runsToMarkdown } from '../richtext.mjs';

// Minimal node-like objects, the shape runsFromNode reads.
const t = (data) => ({ nodeType: 3, data });
const el = (nodeName, children = [], style = {}) => ({ nodeType: 1, nodeName, childNodes: children, style });
const md = (node, opts) => runsToMarkdown(runsFromNode(node, opts));

test('plain text is sent exactly as typed', () => {
  assert.equal(md(el('DIV', [t('2*3*4 and snake_case **typed**')])), '2*3*4 and snake_case **typed**');
  assert.equal(md(el('DIV', [t('one'), el('BR'), t('two')])), 'one\ntwo');
});

test('bold and italic become markdown, with spaces outside the markers', () => {
  assert.equal(md(el('DIV', [t('a '), el('B', [t('bold ')]), t('and '), el('I', [t('it')])])), 'a **bold** and *it*');
  assert.equal(md(el('DIV', [el('STRONG', [t('x '), el('EM', [t('y')])])])), '**x *y***');
  assert.equal(md(el('DIV', [el('B', [t('ab')]), t('cd')])), '**ab**cd');
  assert.equal(md(el('DIV', [el('B', [t('one'), el('BR'), t('two')])])), '**one**\n**two**');
});

test('pasted markup: styles, Google Docs wrappers, blocks, lists, tables and junk', () => {
  const docs = el('B', [el('SPAN', [t('Plain')], { fontWeight: '400' }), t(' '), el('SPAN', [t('Heavy')], { fontWeight: '700' }), el('SPAN', [t(' slanted')], { fontStyle: 'italic' })], { fontWeight: 'normal' });
  assert.equal(md(docs, { collapse: true }), 'Plain **Heavy** *slanted*');
  const page = el('BODY', [el('STYLE', [t('p{}')]), el('P', [t('\n  First   para ')]), el('P', [t('Second')]), el('UL', [el('LI', [t('a')]), el('LI', [t('b')])]),
    el('TABLE', [el('TR', [el('TD', [t('x')]), el('TD', [t('y')])])]), el('SCRIPT', [t('alert(1)')]), el('IMG')]);
  assert.equal(md(page, { collapse: true }), 'First para\nSecond\n- a\n- b\nx\ty');
});

test('runs become safe editor HTML', () => {
  assert.equal(runsToHTML([{ text: '<b>', bold: true, italic: false }, { text: '\n', bold: false, italic: false }, { text: 'x', bold: false, italic: true }]),
    '<strong>&lt;b&gt;</strong><br><em>x</em>');
  assert.deepEqual(runsFromText('a\r\nb'), [{ text: 'a', bold: false, italic: false }, { text: '\n', bold: false, italic: false }, { text: 'b', bold: false, italic: false }]);
});

test('inline markdown renders bold and italic and escapes everything else', () => {
  assert.equal(inlineMarkdownToHTML('a **b** *c* ***d*** __e__ _f_ <i>x</i>'),
    'a <strong>b</strong> <em>c</em> <em><strong>d</strong></em> <strong>e</strong> <em>f</em> &lt;i&gt;x&lt;/i&gt;');
  assert.equal(inlineMarkdownToHTML('snake_case_name and 2 * 3 * 4 and \\*lit\\*'), 'snake_case_name and 2 * 3 * 4 and *lit*');
  // CommonMark: `*` works inside words (as markdown-it and the model read it), `_` doesn't.
  assert.equal(inlineMarkdownToHTML('2*3*4 a**b**c'), '2<em>3</em>4 a<strong>b</strong>c');
  assert.equal(inlineMarkdownToHTML('**unclosed and *open'), '**unclosed and *open');
  assert.equal(inlineMarkdownToHTML('**x**\ny', { breaks: true }), '<strong>x</strong><br>y');
  assert.equal(inlineMarkdownToHTML('**not\n\nclosed**'), '**not\n\nclosed**');
});

test('markdown round-trips through the editor HTML', () => {
  assert.equal(inlineMarkdownToHTML('Say **hello** to *everyone*, ***now***'), 'Say <strong>hello</strong> to <em>everyone</em>, <em><strong>now</strong></em>');
});

test('adjacent and nested formatting survives serializing and rendering', () => {
  const run = (text, bold, italic) => ({ text, bold, italic });
  const cases = [
    [[run('a', true, false), run('b', false, true), run('c', true, false), run('d', false, false)], '<strong>a</strong><em>b</em><strong>c</strong>d'],
    [[run('a', true, false), run('b', true, true)], '<strong>a<em>b</em></strong>'],
    [[run('a', false, true), run('b', true, true), run('c', false, false)], '<em>a<strong>b</strong></em>c'],
    [[run('x ', true, false), run('y', true, true), run(' z', false, false)], '<strong>x <em>y</em></strong> z'],
  ];
  cases.forEach(([runs, html]) => assert.equal(inlineMarkdownToHTML(runsToMarkdown(runs)), html, runsToMarkdown(runs)));
});

test('bold across a line break closes and reopens on each line', () => {
  assert.equal(md(el('DIV', [el('B', [t('shift\nnext')])])), '**shift**\n**next**');
});

// Characters with their bold/italic, read back from inlineMarkdownToHTML's output.
function htmlChars(html) {
  const out = [];
  let bold = 0;
  let italic = 0;
  html.replace(/<(\/?)(strong|em)>|&(amp|lt|gt|quot|#39);|([^<&])/g, (_, close, tag, entity, ch) => {
    if (tag) {
      const d = close ? -1 : 1;
      if (tag === 'strong') bold += d;
      else italic += d;
    } else {
      out.push(`${entity ? { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[entity] : ch}${bold > 0 && !/\s/.test(ch || 'x') ? 'B' : ''}${italic > 0 && !/\s/.test(ch || 'x') ? 'I' : ''}`);
    }
    return '';
  });
  return out.join('|');
}

test('every three-part bold/italic combination survives serializing and rendering', () => {
  const styles = [[false, false], [true, false], [false, true], [true, true]];
  for (const gap of ['', ' ']) {
    for (const a of styles) for (const b of styles) for (const c of styles) {
      const runs = [['a', ...a], [`${gap}b`, ...b], [`${gap}c`, ...c]].map(([text, bold, italic]) => ({ text, bold, italic }));
      const expected = runs.flatMap((r) => Array.from(r.text).map((ch) => `${ch}${r.bold && ch !== ' ' ? 'B' : ''}${r.italic && ch !== ' ' ? 'I' : ''}`)).join('|');
      const markdown = runsToMarkdown(runs);
      assert.equal(htmlChars(inlineMarkdownToHTML(markdown)), expected, markdown);
    }
  }
});

test('CommonMark corner cases: the rule of 3 uses the original flanking; CRLF blank lines', () => {
  assert.equal(inlineMarkdownToHTML('**multiply 3*4**'), '<strong>multiply 3*4</strong>');
  assert.equal(inlineMarkdownToHTML('*foo**bar*'), '<em>foo**bar</em>');
  assert.equal(inlineMarkdownToHTML('a**b*'), 'a**b*');
  assert.equal(inlineMarkdownToHTML('**a\r\n\r\nb**'), '**a\n\nb**');
});
