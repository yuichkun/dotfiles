# Status Footer

Pi標準footerを、日常的に確認する5項目だけへ置き換える。

通常幅ではproject情報を左、model情報を右へ配置する。

```text
~/dotfiles [master]                         gpt-5.6-sol · xhigh · ctx 34%
```

両groupが収まらない幅では、情報を落とさず2行へ分ける。

```text
~/dotfiles [master]
gpt-5.6-sol · xhigh · ctx 34%
```

## Git状態色

- clean: `success`
- staged-only: `warning`
- unstaged / untracked / conflict / mixed: `error`
- status取得前または取得失敗: `muted`

Git repository外ではbranch labelを省略する。context usageはstatusではないため常に`muted`で表示し、取得不能な間は`ctx ?`とする。

`zsh/settings.zsh`のprompt semanticsを基準にしつつ、markerではなくbranch label全体を状態色にする。

## 更新とcleanup

model、thinking level、context使用率はactive sessionからrender時に読む。Git statusはsession開始、branch変更、`edit` / `write` / `bash`完了後に更新する。重複refreshはcoalesceし、footerのdispose時にbranch listenerを解除して実行中processをabortする。

描画契約全体は[`../../UI_SPEC.md`](../../UI_SPEC.md)を参照。
