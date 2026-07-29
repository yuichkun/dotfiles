# Tool Output Viewer

現在のSession branchにあるTool結果を、通常の会話表示とは独立したModalで閲覧する。

現段階では`/outputs`から単独起動する。Command Paletteへの登録と通常画面の結果非表示化は、別ステップで行う。
Modalはterminalの幅・高さともに約90%を使用し、表示行数もterminal heightに追従する。

## Browse mode

- 検索Inputを表示しないtree専用mode
- 上が古く、下が新しいPi本体と同じ時系列
- 過去Turnはdefaultでfold、最新Turnだけ展開
- 選択中nodeのTurn番号、Turn内位置、直前のuser promptを下部に表示
- `↑` / `↓`：循環せずにtree nodeを移動
- `PageUp` / `PageDown`：循環せずにページ移動
- `←` / `→`：Turnをfold/unfold、または親子へ移動
- `Ctrl/Alt + ←` / `Ctrl/Alt + →`：Piのtree keybindingでも同じ操作
- `Enter`：Turnをfold/unfold、またはTool詳細を開く
- `/`：Search modeへ移動
- `Esc`：閉じる

## Search mode

- treeを表示しないrelevance順のflat list
- Tool名・画面に表示するcommand/path/patternを最優先で検索
- まずquery tokenのsubstring matchだけを返し、該当がない場合のみ広いfuzzy matchへfallback
- user promptへのmatchはprimary結果の後に`context`として表示
- relevance順を時系列で並べ直さない
- `↑` / `↓`、`PageUp` / `PageDown`：循環せずに結果を移動
- `←` / `→`、`Alt + ←` / `Alt + →`：検索Input内のcursor移動
- `Enter`：Tool詳細を開く
- `Esc`：Browse modeへ戻る

## 詳細

- Turn位置と直前のuser promptをbreadcrumbとして表示
- `↑` / `↓`：1行scroll
- `PageUp` / `PageDown`：ページscroll
- `Esc`：元のBrowse/Search modeへ戻る
- Search modeから開いた場合はqueryと選択位置を維持

Viewerは`../shared/`のModal基盤だけに依存し、Command Paletteには依存しない。
Tool実行やSessionデータは変更せず、保存済みのTool CallとTool Resultを読み取るだけ。
