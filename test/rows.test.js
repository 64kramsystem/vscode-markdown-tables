const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const MarkdownIt = require('markdown-it');
const { addRow, tablesIn, colorTables } = require('../src/tables');
const fixture = name => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
function insert(source, table, line, after) {
  const result = addRow(source, table, line, after);
  return { ...result, source: source.slice(0, result.offset) + result.text + source.slice(result.offset) };
}

test('insert and append add rows immediately before and after each body position', () => {
  const source = fixture('rows.md');
  for (const [line, after, expected, cursorLine] of [
    [4, false, 'first', 4], [5, false, 'middle', 5], [6, false, 'last', 6],
    [4, true, 'middle', 5], [5, true, 'last', 6], [6, true, 'after-last', 7]
  ]) {
    const result = insert(source, tablesIn(source)[0], line, after);
    assert.equal(result.source, fixture(`rows-${expected}.md`));
    assert.deepEqual(result.cursor, { line: cursorLine, character: 0 });
    assert.deepEqual(tablesIn(result.source)[0].rows.find(row => row.line === cursorLine).cells, ['', '', '']);
  }
});

test('both commands add first body row from header or separator, including tables without bodies', () => {
  for (const [input, expected] of [['rows.md', 'rows-first.md'], ['rows-empty.md', 'rows-empty-added.md']]) {
    const source = fixture(input);
    for (const line of [2, 3]) for (const after of [false, true]) {
      const result = insert(source, tablesIn(source)[0], line, after);
      assert.equal(result.source, fixture(expected));
      assert.deepEqual(result.cursor, { line: 4, character: 0 });
    }
  }
});

test('row insertion preserves LF/CRLF and the presence or absence of a final newline', () => {
  for (const name of ['rows-eof', 'rows-crlf', 'rows-crlf-no-final-newline']) {
    const source = fixture(`${name}.md`);
    for (const [action, after, cursorLine] of [['insert', false, 2], ['append', true, 3]]) {
      const result = insert(source, tablesIn(source)[0], 2, after);
      assert.equal(result.source, fixture(`${name}-${action}.md`));
      assert.deepEqual(result.cursor, { line: cursorLine, character: 0 });
    }
  }
});

test('row insertion preserves container prefixes without repeating list markers', () => {
  let source = fixture('prefixed.md');
  for (const table of tablesIn(source).reverse()) {
    const result = insert(source, table, table.start, false);
    assert.deepEqual(result.cursor, { line: table.start + 2, character: 0 });
    source = result.source;
  }
  assert.equal(source, fixture('rows-prefixed.md'));
  assert.equal(new MarkdownIt().render(source), fixture('rows-prefixed.html'));
});

test('new rows work with optional pipes and single-column tables', () => {
  for (const [name, line, after, cursorLine] of [['rows-no-outer', 3, false, 3], ['rows-single', 0, true, 2]]) {
    const source = fixture(`${name}.md`);
    const result = insert(source, tablesIn(source)[0], line, after);
    assert.equal(result.source, fixture(`${name}-added.md`));
    const parsed = tablesIn(result.source)[0];
    assert.deepEqual(parsed.rows.find(row => row.line === cursorLine).cells, Array(parsed.headers.length).fill(''));
  }
});

test('new rows retain source color cells but have no background color', () => {
  const source = fixture('rows-first.md');
  assert.equal(colorTables(new MarkdownIt(), () => 'Color').render(source), fixture('rows-first.html'));
});
