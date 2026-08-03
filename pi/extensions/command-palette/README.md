# Command Palette

Pi内の決定的なローカルUI操作を、対話・prompt・skillとは別に管理する。

`/palette`から起動する。`Ctrl+O`はTool UIのcompact／expanded切り替えに使用するため、Paletteには割り当てない。

現在のAction：

- `Open in VS Code…`：独立したWorkspace Pickerを開き、現在または別のWorkspaceを選択する

## Actionの追加

`actions/` にAction moduleを追加し、`actions/index.ts` から登録する。

```ts
registry.register({
  id: "session.inspect",
  title: "Inspect session",
  description: "Show current session details",
  keywords: ["session", "context"],
  async run(ctx) {
    // Open another modal or perform a local UI operation.
  },
});
```

Action IDは小文字の英数字から始め、英数字・`.`・`_`・`-`のみを使用する。
PaletteにはAgent turnを開始しない、ローカルで完結する機械的操作だけを登録する。
Action adapterは対象機能の公開関数を呼ぶだけにし、機能のUIや状態をPalette側へ持ち込まない。
