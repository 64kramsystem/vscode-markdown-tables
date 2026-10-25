const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { completeColors } = require('../src/tables');
const fixture = name => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const source = fixture('completion.md');
const greenColors = JSON.parse(fixture('completion-green.json'));

test('color completion matches substrings and preserves formatting when replacing', () => {
  for (const { line, character, start, end, query, replacement } of JSON.parse(fixture('completion-cases.json'))) {
    const actual = completeColors(source, line, character, ' Color ');
    assert.deepEqual(actual, { start, end, query, colors: greenColors });
    const original = source.split('\n')[line];
    assert.equal(original.slice(0, start) + 'palegreen' + original.slice(end), replacement);
  }
});

test('empty color cells offer all CSS names and hex details without replacing whitespace', () => {
  const actual = completeColors(source, 6, 12, 'Color');
  assert.deepEqual(actual, { start: 12, end: 12, query: '', colors: JSON.parse(fixture('completion-all.json')) });
});

test('completion reads only the typed prefix but replaces the full partial value', () => {
  assert.deepEqual(completeColors(source, 9, 14, 'Color'), {
    start: 11, end: 18, query: 'red', colors: [
      { name: 'darkred', hex: '#8b0000' },
      { name: 'indianred', hex: '#cd5c5c' },
      { name: 'mediumvioletred', hex: '#c71585' },
      { name: 'orangered', hex: '#ff4500' },
      { name: 'palevioletred', hex: '#db7093' },
      { name: 'red', hex: '#ff0000' }
    ]
  });
});

test('completion excludes fuzzy matches without the literal substring', () => {
  assert.deepEqual(completeColors(source, 10, 12, 'Color'), {
    start: 10, end: 12, query: 'rn', colors: [
      { name: 'cornflowerblue', hex: '#6495ed' },
      { name: 'cornsilk', hex: '#fff8dc' }
    ]
  });
});

test('configured alternative color columns ignore case and surrounding spaces', () => {
  assert.deepEqual(completeColors(source, 4, 23, ' Notes, cOlOuR '), {
    start: 18, end: 23, query: 'coral', colors: [
      { name: 'coral', hex: '#ff7f50' },
      { name: 'lightcoral', hex: '#f08080' }
    ]
  });
  assert.equal(completeColors(source, 4, 23, 'Color'), undefined);
});

test('completion excludes headers, separators, other columns, code fences, and outside values', () => {
  for (const [line, character] of [[0, 5], [2, 15], [3, 12], [5, 6], [5, 23], [5, 20], [7, 10], [7, 16], [15, 5], [24, 12]]) {
    assert.equal(completeColors(source, line, character, 'Color'), undefined, `${line}:${character}`);
  }
  assert.equal(completeColors(source, 5, 18, ''), undefined);
});
