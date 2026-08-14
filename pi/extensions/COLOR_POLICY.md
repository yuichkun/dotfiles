# Extension semantic color policy

PiのThemeはpaletteを決め、この文書はExtensionが各Theme tokenへ**何の意味を割り当てるか**を決める。色そのものをhard-codeしない。

## Roles

| Role | Pi token | 用途 | 使わない用途 |
|---|---|---|---|
| `primary` | `text` | 名前、title/body、goal、work、完了条件、主要結果、standalone path | 補助情報のde-emphasis |
| `secondary` | `muted` | custom Toolのoperation suffix、grep locator path、count、dependency、graph node metadata | 読む必要のある本文を隠すこと |
| `tertiary` | `dim` | key hint、timestamp/detail header metadata、separator/line number、空状態、unrelated/status chrome | blocked、goal、criteria、attachment |
| `focus` | `accent` | 現在実行中、選択、検索hit、明示的focus | path/list全体、通常情報 |
| `completed` | `text` | 完了済みprogress、通常の完了本文 | ready、NEXT、本文全体への`success`適用 |
| `code` | `mdCode` | code span、related-file pathなどcodeとして読むtext | 通常本文、status、chrome |
| `caution` | `warning` | severe stale、truncated、deprecated、実警告 | search pattern/hit、no matches、summarizing、Updating |
| `failure` | `error` | failure marker、exception、failed result | blocked/waitingの通常状態 |

通常の成功・完了本文は`primary`または`completed`でneutralにする。`completed`は意図を区別するroleだが、現在は`primary`と同じ`text` tokenへ解決する。`success`をfacts、summary、Plan done、pass本文、背景へ広げない。失敗はmarkerを`failure`、本文を`primary`にする。

## Shared decisions

- Modal border: `borderMuted`
- Modal title: bold `primary`
- Selected row: `selectedBg` + focus indicator
- Plan graph nodeはstatus marker/borderを状態色にし、全statusのtitleはbold primary、metadataはsecondaryにする
- `done`: neutral completed marker/chrome
- `in_progress` / immediate `NEXT`: focus
- other `ready`: primary
- `blocked`: secondary（読めるcontrastを保つ）
- `superseded`のmarker/border/progressとdependency traceのunrelated node: tertiary
- Standalone pathsとcustom Tool title: primary
- Custom Toolのoperation suffixとgrep locator path: secondary
- grepの`:line:` separator: tertiary
- Secondary paths inside dense picker rows: secondary
- Search hit substring: focus
- Code span and related-file path: code

## Area rules

| Area | Durable rule |
|---|---|
| `shared/` | semantic foregroundはrole helperを使う。border/backgroundなどTheme chromeは直接tokenを使う |
| `tool-ui/` | output classifierはneutral/focus/cautionを分離する。grep pathはsecondary、`:line:`はtertiary、standalone find/list pathはprimary。明示的な`+`/`-`行はdiff tokenを保ち、Tool invocation failureはresult shellが示す |
| `plan-dashboard/` | 通常完了はneutral、現在位置はfocus。node title/bodyはprimary、metadataはsecondary、supersededのstatus chrome/progressはtertiary。custom Tool operation suffixはsecondary |
| `workspace-picker/` | currentはfocus、selected pathはprimary、dense row pathはsecondary |
| `image-attachments/` | attachment chipはprimary、選択中だけfocus + selected background |

## Caution and notification containment

### `caution` role / `warning` foreground

- severe plan staleness
- 明示的なWARN / WARNING / deprecated / truncated

### UI notification severity

- `warning`: 処理を省略・縮退したdegraded state
- `error`: request/actionが実際に失敗した状態
- `info`: 既存planの案内、no-result、通常activity

新しい`caution` / `failure` foregroundまたはnotification severityのcall siteには、その分類を示すdirect testを付ける。
