# Markdown Tables: Bold, Colors & Sort

Small helpers for VS Code's Markdown editor and built-in preview.

- **Cmd+B** (macOS) / **Ctrl+B**: select one complete table row to toggle bold, preserving pipes and spacing. If every nonempty cell is bold, bold is removed; otherwise the remaining cells become bold. Separator rows are ignored. For other selections, your existing shortcut remains in effect.
- **Markdown Tables: Sort by column[s]**: place the cursor in a table, run the command, and enter comma-separated header prefixes, such as `team, name`. Prefixes ignore case and surrounding spaces and must each identify one column; an exact header match takes precedence over longer prefix matches. Body rows sort ascending, case-insensitively, by the entered precedence; ties retain their order. Markdown formatting, the header, and the separator stay intact.
- **Markdown Tables: Insert Column**: insert an empty column from a header, separator, or body row. On an internal pipe, the cell to the right is used; on the closing pipe, the last cell is used. Opening or closing pipes are added where necessary to retain an empty edge cell.
- **Preview colors**: set `markdownTables.colorColumns` to comma-separated header names (default: `Color`). Names match exactly, ignoring case and surrounding spaces. Each row uses its first valid configured color from left to right. CSS color names and `#RGB`, `#RGBA`, `#RRGGBB`, or `#RRGGBBAA` are accepted; empty or invalid values are ignored.

In configured color cells, invoke VS Code's suggestions (Option+Esc on macOS or Ctrl+Space on Linux) to choose a CSS color name containing the text before the cursor. Empty cells offer all names; selecting one preserves cell spacing and bold formatting.

The three insertion positions (`<bar>` marks the cursor; `bar` shows text typed into the new empty cell):

- Before the table: `<bar>|foo|` → `|bar|foo|`.
- Inside a cell: `|<bar>foo|` → `|bar|foo|`; `|baz|<bar>foo|` → `|baz|bar|foo|`.
- After the table: `|foo|<bar>` → `|foo|bar|`.

Use Markdown table syntax, including escaped pipes (`\|`) inside cells and code spans. Sorting compares trimmed cell Markdown as text. Preview colors are preview-only; the file is unchanged.

Open this folder in VS Code and press F5 to try `example.md`. Run `npm ci && npm test` for unit tests, or `npm run package` to build a VSIX.

If an existing binding overrides the shortcut (including Markdown All in One), add this entry after it in your user `keybindings.json`. VS Code uses this binding for complete table rows and falls through to your existing binding otherwise:

```json
{
  "key": "cmd+b",
  "command": "markdownTables.bold",
  "when": "editorTextFocus && !editorReadonly && editorLangId == markdown && markdownTables.selectedTableRow"
}
```

Use `ctrl+b` on Linux.
