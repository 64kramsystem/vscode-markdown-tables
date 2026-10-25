const vscode = require('vscode');
const { tableAt, selectedTableRow, boldSelection, sortTable, insertColumn, completeColors, colorTables } = require('./tables');

function activate(context) {
  const isMarkdown = editor => editor?.document.languageId === 'markdown';
  function updateContext() {
    const editor = vscode.window.activeTextEditor;
    const inside = isMarkdown(editor) && !!tableAt(editor.document.getText(), editor.selection.active.line);
    const selected = isMarkdown(editor) && editor.selections.length === 1 && !!selectedTableRow(editor.document.getText(), editor.document.offsetAt(editor.selection.start), editor.document.offsetAt(editor.selection.end));
    return Promise.all([
      vscode.commands.executeCommand('setContext', 'markdownTables.inTable', inside),
      vscode.commands.executeCommand('setContext', 'markdownTables.selectedTableRow', selected)
    ]);
  }
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider('markdown', {
      provideCompletionItems(document, position) {
        const configured = vscode.workspace.getConfiguration('markdownTables', document.uri).get('colorColumns', 'Color');
        const completion = completeColors(document.getText(), position.line, position.character, configured);
        if (!completion) return undefined;
        const range = new vscode.Range(position.line, completion.start, position.line, completion.end);
        const items = completion.colors.map(({ name, hex }) => {
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Color);
          item.detail = hex;
          item.range = range;
          item.insertText = name;
          item.filterText = completion.query || name;
          return item;
        });
        return new vscode.CompletionList(items, true);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(updateContext),
    vscode.window.onDidChangeTextEditorSelection(updateContext),
    vscode.workspace.onDidChangeTextDocument(updateContext),
    vscode.commands.registerCommand('markdownTables.bold', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!isMarkdown(editor) || editor.selections.length !== 1) return;
      const source = editor.document.getText();
      const selections = editor.selections;
      await editor.edit(edit => {
        for (const selection of selections) {
          edit.replace(selection, boldSelection(source, editor.document.offsetAt(selection.start), editor.document.offsetAt(selection.end)));
        }
      });
    }),
    vscode.commands.registerCommand('markdownTables.sort', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!isMarkdown(editor)) return;
      const document = editor.document;
      const source = document.getText();
      const table = tableAt(source, editor.selection.active.line);
      if (!table) return;
      const input = await vscode.window.showInputBox({
        prompt: 'Column header prefixes, in sort order (comma-separated)',
        placeHolder: table.headers.join(', '),
        validateInput: value => {
          try { sortTable(source, table, value); } catch (error) { return error.message; }
          return undefined;
        }
      });
      if (input === undefined) return;
      if (document.getText() !== source) {
        await vscode.window.showWarningMessage('The document changed. Run Sort by column[s] again.');
        return;
      }
      const sorted = sortTable(source, table, input);
      if (table.rows.length < 2) return;
      const firstLine = table.rows[1].line;
      const lastLine = table.rows.at(-1).line;
      const range = new vscode.Range(firstLine, 0, lastLine, document.lineAt(lastLine).text.length);
      const replacement = sorted.split(/\r?\n/).slice(firstLine, lastLine + 1).join(document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n');
      await editor.edit(edit => edit.replace(range, replacement));
    }),
    vscode.commands.registerCommand('markdownTables.insertColumn', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!isMarkdown(editor)) return;
      const document = editor.document;
      const source = document.getText();
      const position = editor.selection.active;
      const table = tableAt(source, position.line);
      if (!table) return;
      const inserted = insertColumn(source, table, position.line, position.character);
      const lastLine = table.end - 1;
      const range = new vscode.Range(table.start, 0, lastLine, document.lineAt(lastLine).text.length);
      const replacement = inserted.text.split(/\r?\n/).slice(table.start, table.end).join(document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n');
      if (await editor.edit(edit => edit.replace(range, replacement))) {
        const cursor = new vscode.Position(inserted.cursor.line, inserted.cursor.character);
        editor.selection = new vscode.Selection(cursor, cursor);
      }
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('markdownTables.colorColumns')) {
        vscode.commands.executeCommand('markdown.preview.refresh');
      }
    })
  );
  updateContext();
  return {
    extendMarkdownIt(md) {
      return colorTables(md, env => vscode.workspace.getConfiguration('markdownTables', env.currentDocument).get('colorColumns', 'Color'));
    }
  };
}

module.exports = { activate };
