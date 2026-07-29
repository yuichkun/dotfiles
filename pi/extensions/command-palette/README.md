# Command Palette

Pi内の決定的なローカルUI操作を、対話・prompt・skillとは別に管理する。

`Ctrl+O`でPaletteを開閉する。`/palette`から開くこともできる。
最初のActionとして`Browse tool outputs`を登録している。
標準のTool Output展開は`pi/keybindings.json`で解除している。
Modalのlifecycleとframeは`../shared/`の汎用基盤を利用し、このExtension内には持たない。

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
