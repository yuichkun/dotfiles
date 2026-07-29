# Command Palette

Pi内の決定的なローカルUI操作を、対話・prompt・skillとは別に管理する。

現在は基盤のみ。`Ctrl+O` で空のPaletteを開閉し、検索・選択・Modal表示を確認できる。`/palette` から開くこともできる。
標準のTool Output展開は`pi/keybindings.json`で解除している。
Modalのlifecycleとframeは`../shared/`の汎用基盤を利用し、このExtension内には持たない。

## Actionの追加

`actions/` にAction moduleを追加し、`actions/index.ts` から登録する。

```ts
registry.register({
  id: "tool-outputs.browse",
  title: "Browse tool outputs",
  description: "Inspect previous tool results",
  keywords: ["stdout", "stderr", "history"],
  async run(ctx) {
    // Open another modal or perform a local UI operation.
  },
});
```

Action IDは小文字の英数字から始め、英数字・`.`・`_`・`-`のみを使用する。
PaletteにはAgent turnを開始しない、ローカルで完結する機械的操作だけを登録する。
