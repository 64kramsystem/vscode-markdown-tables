const MarkdownIt = require('markdown-it');
const colorNames = require('color-name');
const markdown = new MarkdownIt();

// Track source positions before markdown-it turns emphasis marker tokens into strong tokens.
markdown.inline.ruler.before('emphasis', 'strong_positions', (state, silent) => {
  if (silent || state.src !== state.env.strongSource) return false;
  const marker = state.src[state.pos];
  if (marker !== '*' && marker !== '_') return false;
  const count = state.scanDelims(state.pos, marker === '*').length;
  const firstToken = state.tokens.length + (state.pending ? 1 : 0);
  for (let offset = 0; offset < count; offset++) {
    state.env.strongPositions.push({ token: firstToken + offset, position: state.pos + offset });
  }
  return false;
});
markdown.inline.ruler2.after('emphasis', 'strong_removals', state => {
  if (state.src !== state.env.strongSource) return;
  for (const { token, position } of state.env.strongPositions) {
    const type = state.tokens[token]?.type;
    if (type === 'strong_open') {
      state.env.strongRemovals.add(position - 1).add(position);
    } else if (type === 'strong_close') {
      state.env.strongRemovals.add(position).add(position + 1);
    }
  }
});

function removeBold(value) {
  const env = { strongSource: value, strongPositions: [], strongRemovals: new Set() };
  markdown.parseInline(value, env);
  return value.split('').filter((_, index) => !env.strongRemovals.has(index)).join('');
}

function tablesIn(source) {
  const tables = [];
  let table;
  let row;
  for (const token of markdown.parse(source, {})) {
    if (token.type === 'table_open') {
      table = { start: token.map[0], end: token.map[1], rows: [] };
    } else if (table && token.type === 'tr_open') {
      row = { line: token.map[0], cells: [] };
      table.rows.push(row);
    } else if (table && token.type === 'inline') {
      row.cells.push(token.content);
    } else if (token.type === 'table_close') {
      table.headers = table.rows[0].cells.map(inlineText);
      tables.push(table);
      table = undefined;
    }
  }
  return tables;
}

function tableAt(source, line) {
  return tablesIn(source).find(table => line >= table.start && line < table.end);
}

// Match markdown-it's table delimiters: even an escaped backslash before a pipe keeps it escaped.
function cellSpans(line) {
  const delimiters = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '|' && line[i - 1] !== '\\') delimiters.push(i);
  }
  const boundaries = [-1, ...delimiters, line.length];
  const spans = boundaries.slice(0, -1).map((start, index) => [start + 1, boundaries[index + 1]]);
  if (delimiters.length && !line.slice(...spans[0]).trim()) spans.shift();
  if (delimiters.length && !line.slice(...spans.at(-1)).trim()) spans.pop();
  return spans;
}

function isEntirelyBold(value) {
  let strongDepth = 0;
  let hasContent = false;
  for (const token of markdown.parseInline(value, {})[0].children) {
    if (token.type === 'strong_open') strongDepth++;
    else if (token.type === 'strong_close') strongDepth--;
    else if (!token.nesting && token.content && (token.type !== 'text' || token.content.trim())) {
      if (!strongDepth) return false;
      hasContent = true;
    }
  }
  return hasContent;
}

function rowPrefix(line) {
  return line.match(/^(?:[ \t]*(?:>[ \t]?|(?:[-+*]|\d{1,9}[.)])[ \t]+(?=[|>])))*[ \t]*/)?.[0] || '';
}

function boldRow(line) {
  const prefix = rowPrefix(line);
  line = line.slice(prefix.length);
  const spans = cellSpans(line);
  const nonempty = spans.map(([start, end]) => line.slice(start, end).trim()).filter(Boolean);
  const unbold = nonempty.length > 0 && nonempty.every(isEntirelyBold);
  let result = line;
  for (const [start, end] of spans.reverse()) {
    const cell = line.slice(start, end);
    const content = cell.trim();
    if (!content || (!unbold && isEntirelyBold(content))) continue;
    const leading = cell.length - cell.trimStart().length;
    const trailing = cell.length - cell.trimEnd().length;
    const replacement = unbold ? removeBold(content) : '**' + content + '**';
    result = result.slice(0, start + leading) + replacement + result.slice(end - trailing);
  }
  return prefix + result;
}

function selectedTableRow(source, start, end) {
  const prefix = source.slice(0, start);
  const line = (prefix.match(/\n/g) || []).length;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  const newline = source.indexOf('\n', lineStart);
  const lineEnd = newline === -1 ? source.length : newline;
  const contentEnd = source[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd;
  if (start !== lineStart || ![contentEnd, lineEnd, lineEnd + 1].includes(end)) return undefined;
  const table = tableAt(source, line);
  if (!table || line === table.start + 1) return undefined;
  return { line, contentEnd };
}

function boldSelection(source, start, end) {
  const row = selectedTableRow(source, start, end);
  if (!row) return source.slice(start, end);
  return boldRow(source.slice(start, row.contentEnd)) + source.slice(row.contentEnd, end);
}

function inlineText(source) {
  const tokens = markdown.parseInline(source, {})[0].children;
  return tokens.map(token => ['text', 'code_inline', 'image'].includes(token.type) ? token.content : '').join('');
}

function sortTable(source, table, input) {
  const headers = table.headers.map(header => header.trim().toLowerCase());
  const prefixes = input.split(',').map(prefix => prefix.trim().toLowerCase());
  const columns = prefixes.map(prefix => {
    if (!prefix) throw new Error('Enter a nonempty column header prefix.');
    const exact = headers.flatMap((header, index) => header === prefix ? [index] : []);
    const matches = exact.length ? exact : headers.flatMap((header, index) => header.startsWith(prefix) ? [index] : []);
    if (!matches.length) throw new Error(`No column matches “${prefix}”.`);
    if (matches.length > 1) throw new Error(`More than one column matches “${prefix}”.`);
    return matches[0];
  });
  const rows = table.rows.slice(1).map(row => ({ ...row, keys: columns.map(column => (row.cells[column] || '').trim().toLowerCase()) }));
  rows.sort((a, b) => {
    for (let i = 0; i < columns.length; i++) {
      if (a.keys[i] < b.keys[i]) return -1;
      if (a.keys[i] > b.keys[i]) return 1;
    }
    return 0;
  });
  const parts = source.split(/(\r?\n)/);
  const original = parts.slice();
  table.rows.slice(1).forEach((row, index) => { parts[row.line * 2] = original[rows[index].line * 2]; });
  return parts.join('');
}

function insertColumn(source, table, cursorLine, cursorCharacter) {
  const parts = source.split(/(\r?\n)/);
  const active = parts[cursorLine * 2];
  const activePrefix = rowPrefix(active);
  const activeContent = active.slice(activePrefix.length);
  const activeSpans = cellSpans(activeContent);
  const relativeCharacter = cursorCharacter - activePrefix.length;
  const found = activeSpans.findIndex(([, end]) => relativeCharacter < end);
  const lastEnd = activeSpans.at(-1)[1];
  const afterTable = lastEnd < activeContent.length ? relativeCharacter > lastEnd : relativeCharacter >= lastEnd;
  const column = afterTable ? table.headers.length : Math.min(found === -1 ? activeSpans.length - 1 : found, table.headers.length - 1);
  let cursor;
  for (const line of [table.start, table.start + 1, ...table.rows.slice(1).map(row => row.line)]) {
    const prefix = rowPrefix(parts[line * 2]);
    let content = parts[line * 2].slice(prefix.length);
    let spans = cellSpans(content);
    // Markdown permits short body rows, implicitly filling missing cells with blanks.
    while (spans.length < table.headers.length) {
      const end = spans.at(-1)[1];
      const trailingPipe = end < content.length;
      content = content.slice(0, end) + '|  ' + content.slice(end) + (trailingPipe ? '' : '|');
      spans = cellSpans(content);
    }
    const append = column === table.headers.length;
    const end = spans.at(-1)[1];
    const hasClosingPipe = end < content.length;
    const start = append ? end + (hasClosingPipe ? 1 : 0) : spans[column][0];
    const separator = line === table.start + 1;
    const needsPipe = append ? !hasClosingPipe : column === 0 && !content.slice(0, start).includes('|') && !separator;
    const addition = (needsPipe ? '|' : '') + (separator ? ' --- |' : '  |');
    parts[line * 2] = prefix + content.slice(0, start) + addition + content.slice(start);
    if (line === cursorLine) {
      cursor = { line, character: prefix.length + start + (needsPipe ? 2 : 1) };
    }
  }
  return { text: parts.join(''), cursor, column };
}

function completeColors(source, line, character, configuredColumns) {
  const table = tableAt(source, line);
  if (!table || !table.rows.slice(1).some(row => row.line === line)) return undefined;
  const text = source.split(/\r?\n/)[line];
  const prefix = rowPrefix(text).length;
  const spans = cellSpans(text.slice(prefix));
  const column = spans.findIndex(([start, end]) => character >= prefix + start && character <= prefix + end);
  const columns = configuredColumns.split(',').map(value => value.trim().toLowerCase());
  if (column < 0 || !columns.includes(table.headers[column]?.trim().toLowerCase())) return undefined;
  let [start, end] = spans[column].map(value => value + prefix);
  const raw = text.slice(start, end);
  if (!raw.trim()) start = end = character;
  else {
    start += raw.length - raw.trimStart().length;
    end -= raw.length - raw.trimEnd().length;
    const value = text.slice(start, end);
    if ((value.startsWith('**') && value.endsWith('**')) || (value.startsWith('__') && value.endsWith('__'))) {
      start += 2;
      end -= 2;
    }
    if (character < start || character > end) return undefined;
  }
  const query = text.slice(start, character).toLowerCase();
  const colors = Object.keys(colorNames).filter(name => name.includes(query)).sort().map(name => ({
    name,
    hex: '#' + colorNames[name].map(value => value.toString(16).padStart(2, '0')).join('')
  }));
  return { start, end, query, colors };
}

function validColor(value) {
  const color = value.trim().toLowerCase();
  return Object.hasOwn(colorNames, color) || /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(color) ? color : undefined;
}

function colorTables(md, getColumns) {
  md.core.ruler.after('inline', 'markdown_tables_colors', state => {
    const configured = getColumns(state.env).split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    let headers;
    let row;
    let inHeader = false;
    let cells;
    for (const token of state.tokens) {
      if (token.type === 'table_open') headers = [];
      else if (token.type === 'thead_open') inHeader = true;
      else if (token.type === 'thead_close') inHeader = false;
      else if (token.type === 'tr_open') { row = token; cells = []; }
      else if (row && token.type === 'inline') cells.push(token.content);
      else if (token.type === 'tr_close') {
        if (inHeader) headers = cells.map(value => inlineText(value).trim().toLowerCase());
        else {
          for (let i = 0; i < headers.length; i++) {
            if (!configured.includes(headers[i])) continue;
            const color = validColor(inlineText(cells[i] || ''));
            if (color) { row.attrSet('style', `background-color: ${color}`); break; }
          }
        }
        row = undefined;
      } else if (token.type === 'table_close') headers = undefined;
    }
  });
  return md;
}

module.exports = { tablesIn, tableAt, cellSpans, boldRow, selectedTableRow, boldSelection, sortTable, insertColumn, completeColors, validColor, colorTables };
