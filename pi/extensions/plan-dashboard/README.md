# Living Plan

Pi 0.84.0のSessionへ、依存関係付きのLiving Planを保存・復元・表示するExtension。
Plan Modeや権限制御は導入せず、ユーザーが`/plan`を実行したSessionだけでPlanを継続管理する。

## Planの作成

タスクを引数としてワンショットWorkflowを起動する。

```text
/plan Passkey認証を追加し、既存ログインから移行できるようにする
```

引数を省略すると、タスクを記入するmulti-line editorが開く。

```text
/plan
```

`/plan`を実行していないSessionでは、Planの自動作成、context注入、staleness計測を一切行わない。

### 初回Workflow

1. タスクを通常のUser MessageとしてSessionへ追加する。
2. Agentが要求とコードベースを調査する。
3. 通常のタスクでは、Agentが`set` operationで依存関係付きPlanを直接保存する。Fable consultationは必要ない。
4. 難しい、曖昧、高リスクで、独立した視点が実質的に役立つ場合だけ`consult`を使う。ユーザーが不要と指定した場合は呼ばない。
5. AgentがPlanを保存し、通常作業を続行する。

Fableはoptional advisorであり、承認者やgateではない。利用する場合だけ、要求の逐語、確認済み事実、制約、未決事項を次の固定条件で渡す。

```bash
claude -p --model fable --effort max --safe-mode --tools "" --no-session-persistence
```

相談packetにはAgent側のPlan候補や望ましい結論を含めない。相談した場合は回答を批判的に評価して`consultationId`を`set`へ渡す。相談しない場合は`consultationId`を省略する。

## 継続更新

Planが存在する場合だけ、Piの`context` eventで毎回のLLM callへ最新digestを追加する。

```text
Plan <id> r7
Current: S04 — parserを実装する
Ready: S05, S06
```

`plan` Toolは次のoperationを持つ。

- `get`: 構造的replanに必要な完全snapshotを取得する
- `consult`: 難しい、曖昧、高リスクなplanningで独立した助言が役立つ場合だけFableへ相談する（optional）
- `set`: active Plan全体を作成・改訂する。省略した既存Stepは`superseded`になる
- `progress`: 現在Stepの完了とReady Stepの開始をatomicに更新する
- `compact`: done / superseded Stepをarchiveする

Step境界では`progress`、前提、Step、順序、依存関係が変わった場合は`set`を使う。通常の更新ではユーザー確認を待たない。要求済み成果物の削除・延期、完了条件の緩和、ユーザーの明示決定との矛盾、完了済み作業の巻き戻しだけは先に確認する。

最後のPlan更新から成功した`edit`、`write`、`bash`が5回、または4 turn経過するとdigestの同期要求を強める。12回または8 turnではcompactな全Step状態も注入する。追加turnや通常Toolのblockは行わない。

## Plan compaction

Plan schema v2は、実行対象の`steps`と、解決済みIDを保持する`archivedSteps`を分離する。

- archive対象は`done`または`superseded`だけ
- archive後もStep ID、phase、terminal statusをtombstoneとして保持する
- active Stepからarchive IDへの依存は解決済みとして扱う
- active/archiveを通じたID再利用は禁止
- 完全な旧Step情報は過去のPlan Tool Resultに残る
- schema-v1 snapshotはarchiveなしのv2へmigrationする

`archivedSteps`は依存解決とID再利用防止の履歴なので件数上限を設けず、各Stepを4 fieldのtombstoneへ縮小して保持する。

手動`compact`はterminal Stepをすべてarchiveする。`set` / `progress`後にactive Stepが20件を超え、terminal Stepが10件を超えた場合は、直近5件を残して同じrevision更新内で自動compactする。active 50件制限を超えるrevisionでは、overflowに応じてretention件数を5件未満へ縮めて制限内へ戻し、それでも超過が残る場合はrevisionを拒否する。これによりsuperseded Stepの単調増加で不正なsnapshotが保存されることを防ぐ。

これはPiのSession `/compact`とは独立した、Plan artifact専用のcompactionである。

## 保存とbranch

Plan作成要求はCustom Entry、Fable consultationとPlan snapshotは`plan` Tool Resultの`details`へ保存する。各Plan変更はrevision、理由、完全snapshotを持つ。

`session_start`と`session_tree`で現在の`getBranch()`だけを走査するため、rewindや兄弟branchはそれぞれ異なるPlanと進捗を保持できる。別Sessionへは自動継承しない。

## Dashboard

- `/palette` → `Open Plan Dashboard…`
- `/plan-dashboard`

画面最上部のfixed Overlayにはprogress barと現在Stepを表示する。PlanがないbranchではOverlayを表示しない。staleness thresholdを超えた場合は、最後の更新以降のwork/turn数を表示する。

### Overview

- `←` / `→`: 前後のstageへ移動
- `↑` / `↓`: 同じstage内を移動
- `Tab`: 実行中・着手可能Stepを巡回
- `d`: 選択Stepの祖先・子孫経路を強調
- `a`: resolved Stepの省略/全表示
- `h`: compact済みarchiveがある場合、phase別に表示
- `0` / `Home`: 実行中Stepへ戻る
- `Enter`: 選択Stepの詳細
- `Esc`: 閉じる

Overviewは未解決Stepと直近5件のresolved Stepを標準表示し、古いresolved Stepは省略する。

### Detail / Archive

- `↑` / `↓`: scroll
- `PageUp` / `PageDown`: page scroll
- `Esc`: Overviewへ戻る

## 検証規則

- Step IDはactive/archive全体で一意
- 依存先はactive Stepまたはarchive tombstoneとして存在する
- 循環依存と自己依存は禁止
- `in_progress`は最大1件
- unresolvedな依存を持つStepは開始・完了できない
- 古い`baseRevision`からの更新・compactは禁止
- Plan改訂で省略されたactive Stepはまず`superseded`になる
- `progress`では`in_progress`のStepだけを完了できる
- archiveできるのは`done` / `superseded`だけ

Dashboardが保存データと一致すること、stalenessの件数、DAG整合性は機械的に保証する。Plan内容が現実を正しく表しているか、意味上の完了条件を満たしたかはモデルの判断を含むため、完全には保証しない。
