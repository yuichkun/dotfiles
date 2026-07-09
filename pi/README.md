# Pi dotfiles

個人用の pi 設定を管理する場所。

## 使い方

```bash
# まずは確認だけ
~/dotfiles/pi/install.sh --dry-run

# symlink を張る。既存ファイルは ~/.pi/agent-backup/<timestamp>/ に退避
~/dotfiles/pi/install.sh

# packages も取得・更新する場合
~/dotfiles/pi/install.sh --install-packages
```

## 管理対象

`pi/install.sh` は、存在するものだけを `~/.pi/agent` に symlink する。

- `settings.json`
- `AGENTS.md`
- `SYSTEM.md`
- `APPEND_SYSTEM.md`
- `keybindings.json`
- `models.json`
- `extensions/`
- `skills/`
- `prompts/`
- `themes/`
- `agents/`
- `chains/`

## 管理しないもの

secrets / machine local / cache なので Git 管理しない。

- `auth.json`
- `trust.json`
- `sessions/`
- `npm/`
- `git/`

## Package pinning

再現性のため、`settings.json` の `packages` はなるべく version / tag / commit で pin する。

例:

```json
{
  "packages": [
    "npm:pi-subagents@0.34.0",
    "git:github.com/you/my-pi-package@v1.0.0"
  ]
}
```
