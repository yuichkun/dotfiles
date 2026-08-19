# Living Plan

Pi 0.84.0のSessionへ、依存関係付きのLiving Planを保存・復元・表示するExtension。
Plan専用slash commandは登録しない。明示操作はCommand Palette、自然言語のplanning依頼は内部`start_plan` Toolへ分離する。通常Sessionでは軽量な`start_plan`だけをactiveにし、Plan workflow中だけfull `plan` Toolと継続contextを有効化する。

## Planの作成と管理

`/palette`から、現在状態で利用可能なActionだけを表示する。

- `Start New Living Plan…`: task editorから新しいPlanRequestを開始する
- `Open Current Plan…`: current PlanのDashboardを開く
- `Open Plan History…`: 同じbranchの過去Planを選んでread-only表示する
- `Pause Living Plan`: activeなPlan workflowをpauseする
- `Resume Living Plan`: pausedなPlan workflowをresumeする

新規作成時、current Planが完了済みなら確認なしでhistoryへ移す。未完了Planまたはpending requestがある場合だけ確認し、承認後も旧Plan snapshotはhistoryへ残す。

Agentは「実装前にplan立てて」のような明示的な自然言語依頼を受けた場合、内部`start_plan` Toolから同じworkflowを開始できる。通常の実装依頼や相談からplanning modeを推測してはならず、未完了PlanをAgent判断だけで置換しない。

pause/resume状態はCustom Entryへ保存され、`session_start`と`session_tree`で現在のPi Session branchから復元される。pause中はfull `plan` Tool、継続context、staleness counter、fixed progress headerを停止する。Dashboardと軽量`start_plan`は利用可能だが、`start_plan`は未完了Planを置換しない。未完了Planもpending requestもないpaused branchで明示的に`start_plan`を実行した場合は、新しいworkflowを開始するためbranchをresumeする。

### 初回Workflow

1. Paletteの`Start New Living Plan…`または明示的な自然言語依頼を受けた`start_plan`がPlanRequestを保存し、full `plan` Toolを有効化する。
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

Plan workflowがactiveの場合だけ、Piの`context` eventで毎回のLLM callへ最新digestを追加する。

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

最後のPlan更新から成功した`edit`、`write`、`bash`が5回、または4 turn経過するとdigestの同期要求を強める。12回または8 turnではactive frontier、最大8件のphase別compact件数、残りの集約件数だけを追加注入し、done / supersededのactive Step全件は再掲しない。省略したresolved詳細やarchive tombstoneを含む完全snapshotが必要な場合だけ`plan get`を使う。追加turnや通常Toolのblockは行わない。

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

Plan作成要求とpause/resume状態はCustom Entry、Fable consultationとPlan snapshotは`plan` Tool Resultの`details`へ保存する。各Plan変更はrevision、理由、完全snapshotを持つ。PlanRequest境界ごとの最新snapshotをcurrentまたはhistoryとしてbranchから導出する。

`session_start`と`session_tree`で現在の`getBranch()`だけを走査するため、rewindや兄弟のPi Session branchはそれぞれ異なるPlan、pause状態、進捗を保持できる。別Sessionへは自動継承しない。

## Dashboard

- `/palette` → `Open Current Plan…`
- `/palette` → `Open Plan History…`

`Open Plan History…`は同じbranchの過去Planをnewest-firstで選択し、`HISTORY` marker付きのread-only Dashboardで表示する。History表示はcurrent Plan、pause状態、active toolを変更しない。

画面最上部のfixed Overlayにはprogress barと現在Stepを表示する。Planがない、またはpausedのPi Session branchではOverlayを表示しない。staleness thresholdを超えた場合は、最後の更新以降のwork/turn数を表示する。

### Overview

Dashboard本体はDAGの前に、Plan全体を読むための最大3行の概要を表示する。

- `OUTCOME`: Planが達成する目的
- `NOW` / `NEXT`: 現在実行中、または次に着手可能なStepとGoal。複数候補がある場合はPlan snapshot内で最初のStepを表示する。全Stepがterminalなら、done実績があれば`PLAN COMPLETE`、すべてsupersededなら`PLAN SUPERSEDED`を表示する。未解決だが着手不能なら`WAITING`を表示する
- `STAGES`: phaseごとの状態を表示し、current/terminal phaseとresolved progressがあるphaseにはresolved/totalを付ける。archive済みphase、active Stepのphaseをそれぞれsnapshot内の初出順で並べる

11行以上の端末で、高さが限られる場合は`STAGES`、`OUTCOME`の順に省略し、`NOW` / `NEXT`、`PLAN COMPLETE`、`PLAN SUPERSEDED`、または`WAITING`のfrontier行を最後まで残す。概要の後にprogress summaryと依存関係DAGを表示する。

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

### Definition of Done

各Stepの`acceptance`をDefinition of DoneとしてDetailへ表示する。criterion単位の独立した途中状態は保存せず、Step状態をsingle source of truthとする。

- `done`: 全criterionを`✓`で表示する
- `ready` / `blocked` / `in_progress` / `superseded`: `□`のまま表示する

Agentは全criterionを検証してからだけ、`set`または`progress`でStepを`done`にする。したがってStep完了とDoDのcheck表示は同じPlan revisionで更新される。

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
