# Command Palette

Pi内の決定的なローカルUI操作を、対話・prompt・skillとは別に管理する。

`/palette`から起動する。`Ctrl+O`はTool UIのcompact／expanded切り替えに使用するため、Paletteには割り当てない。

現在のAction：

- `Start New Living Plan…`：task editorから新しいLiving Planを開始する
- `Open Current Plan…`：current PlanのDashboardを開く
- `Open Plan History…`：同じbranchの過去Planを選んで開く
- `Pause Living Plan` / `Resume Living Plan`：Plan workflowが存在するとき、現在状態に合う片方だけを表示する
- `Open in VS Code…`：独立したWorkspace Pickerを開き、現在または別のWorkspaceを選択する

Plan専用slash commandは登録せず、明示的なPlan操作はPaletteへ集約する。Actionは`isAvailable`で現在contextに不要な項目を非表示にできる。

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
Paletteには決定的で明示的な操作だけを登録する。通常はローカルで完結させるが、`Start New Living Plan…`のようにユーザーがworkflow開始を明示選択したActionはAgent turnを開始できる。
Action adapterは対象機能の公開関数を呼ぶだけにし、機能のUIや状態をPalette側へ持ち込まない。
