# Markdown Tables

Small helpers for VS Code's Markdown editor and built-in preview.

- **Cmd+B** (macOS) / **Ctrl+B**: select one complete table row to bold each nonempty cell, preserving pipes and spacing. Already-bold cells stay unchanged; separator rows are ignored. For other selections, your existing shortcut remains in effect.
- **Markdown Tables: Sort by column[s]**: place the cursor in a table, run the command, and enter comma-separated header prefixes, such as `team, name`. Prefixes ignore case and surrounding spaces and must each identify one column. Body rows sort ascending, case-insensitively, by the entered precedence; ties retain their order. Markdown formatting, the header, and the separator stay intact.
- **Preview colors**: set `markdownTables.colorColumns` to comma-separated header names (default: `Color`). Names match exactly, ignoring case and surrounding spaces. Each row uses its first valid configured color from left to right. CSS color names and `#RGB`, `#RGBA`, `#RRGGBB`, or `#RRGGBBAA` are accepted; empty or invalid values are ignored.

Use Markdown table syntax, including escaped pipes (`\|`) inside cells and code spans. Sorting compares trimmed cell Markdown as text. Preview colors are preview-only; the file is unchanged.

Open this folder in VS Code and press F5 to try `example.md`. Run `npm ci && npm test` for unit tests, or `npm run package` to build a VSIX.

If another extension overrides the shortcut, add this user keybinding to give this command priority only on complete table rows:

```json
{
  "key": "cmd+b",
  "command": "markdownTables.bold",
  "when": "editorTextFocus && editorLangId == markdown && markdownTables.selectedTableRow"
}
```

Use `ctrl+b` on Linux.
