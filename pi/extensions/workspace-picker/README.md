# Workspace Picker

設定したroot配下のGit repositoryをfuzzy検索し、選択したdirectoryをVS Codeで開く。
Command Paletteの`Open in VS Code…`または`/workspaces`から起動できる。
現在のworking directoryは設定に含まれていなくても先頭へ追加されるため、そのまま`Enter`で現在のWorkspaceを開ける。

## 設定

`~/.pi/agent/workspaces.json`を読む。dotfilesの`pi/workspaces.json`は`pi/install.sh`でsymlinkする。

```json
{
  "roots": ["~/workspace"],
  "entries": [
    { "name": "dotfiles", "path": "~/dotfiles" }
  ],
  "maxDepth": 3
}
```

- `roots`：`.git`を再帰探索するdirectory
- `entries`：Git repositoryでなくても明示的に追加できるdirectory
- `maxDepth`：rootから探索する深さ（1〜8）

選択履歴はGit管理せず、`~/.pi/agent/state/workspace-picker.json`へ最大20件保存する。空queryでは最近開いた順を優先し、それ以外を名前順で表示する。
