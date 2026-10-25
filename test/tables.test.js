const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const MarkdownIt = require('markdown-it');
const { tablesIn, tableAt, selectedTableRow, boldRow, boldSelection, sortTable, insertColumn, validColor, colorTables } = require('../src/tables');
const fixture = name => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const source = fixture('table.md');

test('parser finds the real table and excludes fenced table text', () => {
  const tables = tablesIn(source);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0], {
    start: 2, end: 9,
    headers: ['Name', 'Team', 'Color', 'Colour', 'Notes'],
    rows: [
      { line: 2, cells: ['Name', 'Team', 'Color', 'Colour', 'Notes'] },
      { line: 4, cells: ['Zoe', 'Blue', 'invalid', 'lavender', '`a|b`'] },
      { line: 5, cells: ['Alice', 'Red', '#abc', 'red', '**Already bold**'] },
      { line: 6, cells: ['bob', 'Blue', '', 'lightblue', 'A pipe: |'] },
      { line: 7, cells: ['Bob', 'blue', 'rebeccapurple', '#fff', 'second tie'] },
      { line: 8, cells: ['Ben', 'Blue', 'red; color: blue', '#12345678', ''] }
    ]
  });
});

test('cursor lookup covers header, separator, and body only', () => {
  for (const line of [2, 3, 4, 8]) assert.deepEqual(tableAt(source, line), tablesIn(source)[0]);
  for (const line of [0, 1, 9, 13, 14, 15]) assert.equal(tableAt(source, line), undefined);
});

test('bold cells preserve source delimiters, whitespace, escapes, empty and bold cells', () => {
  for (const [input, expected] of JSON.parse(fixture('bold.json'))) assert.equal(boldRow(input), expected);
});

test('complete selected rows are bolded; separator and trailing line endings are preserved', () => {
  const lines = source.split('\n');
  for (const line of [2, 3, 4, 5, 6, 7, 8]) {
    const start = lines.slice(0, line).join('\n').length + 1;
    const end = start + lines[line].length;
    const expected = line === 3 ? lines[line] : boldRow(lines[line]);
    assert.equal(boldSelection(source, start, end), expected);
    assert.equal(boldSelection(source, start, end + 1), expected + '\n');
  }
  const crlf = source.replaceAll('\n', '\r\n');
  const row = crlf.indexOf('| Alice');
  const end = crlf.indexOf('\r\n', row);
  assert.equal(boldSelection(crlf, row, end + 2), boldRow(crlf.slice(row, end)) + '\r\n');
});

test('other selections remain unchanged and do not claim the shortcut', () => {
  assert.equal(boldSelection(source, 0, 6), 'Before');
  const start = source.indexOf('Alice');
  assert.equal(boldSelection(source, start, start + 5), 'Alice');
  assert.equal(boldSelection(source, start, start), '');
  assert.equal(selectedTableRow(source, start, start + 5), undefined);
  const separator = source.indexOf('| :---');
  assert.equal(selectedTableRow(source, separator, source.indexOf('\n', separator)), undefined);
});

test('sort uses prefix precedence, case-insensitive lexical order and stable ties', () => {
  assert.equal(sortTable(source, tablesIn(source)[0], ' TE , nA '), fixture('sorted.md'));
  const crlf = source.replaceAll('\n', '\r\n');
  assert.equal(sortTable(crlf, tablesIn(crlf)[0], 'Team, Name'), fixture('sorted.md').replaceAll('\n', '\r\n'));
});

test('sort rejects ambiguous, unknown, and empty prefixes', () => {
  const table = tablesIn(source)[0];
  assert.throws(() => sortTable(source, table, 'col'), /More than one/);
  assert.throws(() => sortTable(source, table, 'missing'), /No column/);
  for (const input of ['', 'name,', ' , team']) assert.throws(() => sortTable(source, table, input), /nonempty/);
});

test('color validation allows only CSS names and hex colors', () => {
  const cases = JSON.parse(fixture('colors.json'));
  for (const value of cases.valid) assert.equal(validColor(value), value.trim().toLowerCase());
  for (const value of cases.invalid) assert.equal(validColor(value), undefined);
});

test('actual Markdown render colors rows by leftmost valid configured column', () => {
  const md = colorTables(new MarkdownIt(), () => ' cOlOuR , COLOR ');
  assert.equal(md.render(source), fixture('colored.html'));
  const defaultMd = colorTables(new MarkdownIt(), () => 'Color');
  assert.deepEqual([...defaultMd.render(source).matchAll(/<tr style="background-color: ([^"]+)"/g)].map(match => match[1]), ['#abc', 'rebeccapurple']);
  const noColumns = colorTables(new MarkdownIt(), () => '');
  assert.equal(noColumns.render(source), new MarkdownIt().render(source));
});

test('bolded header and color cells keep their preview colors', () => {
  const md = colorTables(new MarkdownIt(), () => ' cOlOuR , COLOR ');
  assert.equal(md.render(fixture('bold-table.md')), fixture('bold-colored.html'));
});

test('sorting preserves CRLF separators and presence or absence of a final newline', () => {
  for (const suffix of ['', '-no-final-newline']) {
    const input = fixture(`crlf${suffix}.md`);
    assert.equal(sortTable(input, tablesIn(input)[0], 'name, id'), fixture(`crlf-sorted${suffix}.md`));
  }
});

test('exact headers take precedence over longer headers sharing a prefix', () => {
  const input = fixture('exact-headers.md');
  assert.equal(sortTable(input, tablesIn(input)[0], ' NAME , Id '), fixture('exact-headers-sorted.md'));
  assert.throws(() => sortTable(input, tablesIn(input)[0], 'na'), /More than one/);
});

test('bolding table headers preserves list and blockquote container syntax', () => {
  const input = fixture('prefixed.md');
  let actual = input;
  const tables = tablesIn(input);
  assert.equal(tables.length, 3);
  for (const table of tables.reverse()) {
    const start = input.split('\n').slice(0, table.start).join('\n').length + (table.start ? 1 : 0);
    const end = input.indexOf('\n', start);
    actual = actual.slice(0, start) + boldSelection(input, start, end) + actual.slice(end);
  }
  assert.equal(actual, fixture('prefixed-bold.md'));
  assert.equal(new MarkdownIt().render(actual), fixture('prefixed-bold.html'));
});

test('insert column before first, middle, and last cells from all three row roles', () => {
  const input = fixture('insert.md');
  for (const { name, column, positions, cursor } of JSON.parse(fixture('insert-positions.json'))) {
    for (let i = 0; i < positions.length; i++) {
      const result = insertColumn(input, tablesIn(input)[0], ...positions[i]);
      assert.equal(result.text, fixture(`insert-${name}.md`));
      assert.equal(result.column, column);
      assert.deepEqual(result.cursor, { line: cursor[i][0], character: cursor[i][1] });
      assert.equal(new MarkdownIt().render(result.text), fixture(`insert-${name}.html`));
    }
  }
});

test('insert uses the cell to the right of dividing pipes and last cell at the trailing pipe', () => {
  const input = fixture('insert.md');
  for (const [character, name] of [[0, 'first'], [4, 'middle'], [8, 'last'], [12, 'last'], [13, 'last']]) {
    assert.equal(insertColumn(input, tablesIn(input)[0], 2, character).text, fixture(`insert-${name}.md`));
  }
  assert.equal(insertColumn(input, tablesIn(input)[0], 4, 14).text, fixture('insert-middle.md'));
});

test('insert preserves optional pipes, list and quote prefixes, escapes, and short rows', () => {
  const input = fixture('insert-syntax.md');
  for (const [name, column] of [['first', 0], ['middle', 1], ['last', 2]]) {
    let actual = input;
    for (const table of tablesIn(input).reverse()) {
      const header = actual.split('\n')[table.start];
      actual = insertColumn(actual, table, table.start, header.indexOf('A') + column * 4).text;
    }
    assert.equal(actual, fixture(`insert-syntax-${name}.md`));
    const parsed = tablesIn(actual);
    assert.equal(parsed.length, 4);
    for (const table of parsed) {
      for (const row of table.rows) assert.equal(row.cells.length, 4);
      assert.equal(table.headers[column], '');
    }
  }
});

test('insert preserves CRLF and final-newline state', () => {
  for (const suffix of ['', '-no-final-newline']) {
    const input = fixture(`crlf${suffix}.md`);
    assert.equal(insertColumn(input, tablesIn(input)[0], 0, 2).text, fixture(`insert-crlf${suffix}.md`));
  }
});
