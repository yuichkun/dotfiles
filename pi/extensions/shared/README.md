# Shared extension UI primitives

このディレクトリはExtensionではなく、複数のExtensionから利用する内部ライブラリ。
`index.ts`を置かないことで、Piのglobal extension探索対象にならないようにしている。
色の意味は[`../COLOR_POLICY.md`](../COLOR_POLICY.md)へ集約し、`color-policy.ts`のsemantic roleを使う。

## Modal

- `modal.ts`
  - `showModal()`：TUI modeの確認とoverlay lifecycleを統一
  - `ModalContext<T>`：TUI・theme・keybindings・closeをfactoryへ渡す
  - `BaseModal<T>`：focus、cancel、render requestを共通化する任意の基底class
- `modal-frame.ts`
  - `ModalFrame`：幅を超えないtitle、row、separator、bottomを描画
  - defaultはquietな`borderMuted`、primary title、通常panel背景、selected背景
  - border・title・通常背景・選択背景のtheme colorを機能ごとに上書き可能

Modal基盤はAction、Command Palette、Tool Outputなどのdomainを一切知らない。
各機能は`showModal()`を呼び、必要なら`BaseModal`と`ModalFrame`を組み合わせる。

```ts
const result = await showModal<string>(
  ctx,
  (modalContext) => new MyModal(modalContext),
  { overlayOptions: { width: 96 } },
);
```
