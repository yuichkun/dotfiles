# Tool UI

Built-in Toolの実行処理を維持したまま、通常の会話上の表示だけを調整する。

- `bash.ts`：Bash commandのsyntax highlightとchain改行
- `shell-command.ts`：shell command表示の整形
- `hidden-results.ts`：`bash` / `read` / `write` / `edit` / `grep` / `find` / `ls`の結果本文を非表示

Tool Callは通常画面に残す。Tool ResultはSessionとLLM contextにはそのまま保存・送信し、TUI rendererだけを空にする。
結果の閲覧にはCommand Paletteの`Browse tool outputs`または`/outputs`を使う。
