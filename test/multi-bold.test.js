const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const MarkdownIt = require('markdown-it');
const { selectedTableRow, boldSelection, colorTables } = require('../src/tables');
const fixture = name => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
function range(source, first, last, trailingNewline) {
  const lines = source.split('\n');
  const start = first ? lines.slice(0, first).join('\n').length + 1 : 0;
  const lineStart = last ? lines.slice(0, last).join('\n').length + 1 : 0;
  const newline = source.indexOf('\n', lineStart);
  const end = trailingNewline && newline >= 0 ? newline + 1 : lineStart + lines[last].replace(/\r$/, '').length;
  return { start, end };
}
function toggle(source, selection) {
  const replacement = boldSelection(source, selection.start, selection.end);
  return {
    source: source.slice(0, selection.start) + replacement + source.slice(selection.end),
    selection: { start: selection.start, end: selection.start + replacement.length }
  };
}

test('plain rows toggle together through three cycles with and without their final newline', () => {
  const source = fixture('multi-bold.md');
  for (const trailing of [false, true]) {
    const once = toggle(source, range(source, 4, 5, trailing));
    assert.equal(once.source, fixture('multi-bold-on.md'));
    assert.ok(selectedTableRow(once.source, once.selection.start, once.selection.end));
    const twice = toggle(once.source, once.selection);
    assert.equal(twice.source, source);
    const third = toggle(twice.source, twice.selection);
    assert.equal(third.source, once.source);
    assert.deepEqual(third.selection, once.selection);
  }
});

test('mixed bold and plain rows become uniformly bold, and all-bold rows become plain', () => {
  const source = fixture('multi-bold-mixed.md');
  const once = toggle(source, range(source, 4, 5, false));
  assert.equal(once.source, fixture('multi-bold-on.md'));
  const twice = toggle(once.source, once.selection);
  assert.equal(twice.source, fixture('multi-bold.md'));
  assert.equal(toggle(twice.source, twice.selection).source, once.source);
});

test('header and body rows share toggle mode while the separator remains unchanged', () => {
  const source = fixture('multi-bold.md');
  const once = toggle(source, range(source, 2, 5, true));
  assert.equal(once.source, fixture('multi-bold-header-on.md'));
  assert.equal(toggle(once.source, once.selection).source, source);
  const separatorAndBody = toggle(source, range(source, 3, 5, true));
  assert.equal(separatorAndBody.source, fixture('multi-bold-on.md'));
  const empty = toggle(source, range(source, 6, 6, true));
  assert.equal(empty.source, source);
});

test('partial rows, separator alone, and selections beyond one table do not claim bold', () => {
  const source = fixture('multi-bold.md');
  const valid = range(source, 4, 5, false);
  for (const selection of [
    { start: valid.start + 1, end: valid.end },
    { start: valid.start, end: valid.end - 1 },
    range(source, 3, 3, false), range(source, 3, 3, true),
    range(source, 0, 5, false), range(source, 4, 7, true), range(source, 4, 12, false)
  ]) {
    assert.equal(selectedTableRow(source, selection.start, selection.end), undefined);
    assert.equal(toggle(source, selection).source, source);
  }
});

test('multi-row toggling preserves LF, CRLF, and final-newline state', () => {
  for (const variant of ['lf', 'eof', 'crlf', 'crlf-eof']) {
    const source = fixture(`multi-bold-${variant}.md`);
    for (const trailing of [false, true]) {
      const once = toggle(source, range(source, 2, 3, trailing));
      assert.equal(once.source, fixture(`multi-bold-${variant}-on.md`));
      assert.equal(toggle(once.source, once.selection).source, source);
    }
  }
});

test('color values and table structure survive selection-wide toggling', () => {
  for (const name of ['multi-bold.md', 'multi-bold-on.md']) {
    const md = colorTables(new MarkdownIt(), () => 'Color');
    const rows = md.parse(fixture(name), {}).filter(token => token.type === 'tr_open');
    assert.deepEqual(rows.map(token => token.attrGet('style')), [null, 'background-color: red', 'background-color: blue', null, null, null]);
  }
});
