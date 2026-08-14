# Compact Tool UI

Built-in Toolの実行処理を維持したまま、Toolごとの表示をコンパクトな意味要約へ置き換える。

## 通常表示

Built-in Toolを、Claude Codeに近い3段の視覚階層で表示する。

```text
⏺ Update(packages/core/src/types.ts)
  ⎿  Added 1 line, removed 1 line · 型定義を修正しました · 0.4s
    997  ? { readonly [K in keyof P]: AudioParam }
    998  : Record<string, AudioParam>;
    999  readonly state: C extends { state: infer S }
   1000- ...
   1000+ ...
```

- 1段目: status markerと`Name(arguments)`形式のTool signature
- 2段目: `  ⎿  `に続く実行結果のfacts。LLM semantic summaryは重複しない場合だけfactsの後ろへ併記し、完了durationを末尾へ置く
- 3段目: `    `で始まるcompact previewまたはexpanded detail

Tool signatureは`Read(path)`、`Update(path)`、`Write(path)`、`Bash(command summary)`、`Search(pattern, path)`、`Find(pattern, path)`、`List(path)`へ正規化する。Bashも完了後にsignatureを残し、observed factsとsemantic summaryを表示する。Pending durationは1段目の末尾、error summaryは2段目の先頭へ置く。長い2段目は同じcontent columnで折り返し、狭いterminalではcontent widthを確保するためindentを縮める。

EditとWriteは通常表示でも最大6行のpreviewを出し、残りがあれば件数と`Ctrl+O`のhintを表示する。それ以外のToolの生outputは通常表示では畳む。Custom ToolとMCP ToolはこのExtensionの対象外で、登録元のrendererをそのまま使う。

LLM summaryが到着するまではTool名・path・command種別から作るfallbackを表示する。Summary生成はTool processの開始をblockせず、同じAssistant message内のTool Call群を1回で要約する。要約には直近の会話、現在のuser goal、非表示のthinking summary、正規化したTool引数を渡し、現在のmodelをminimal reasoningで使用する。

配色は[`../COLOR_POLICY.md`](../COLOR_POLICY.md)のsemantic roleに従う。Assistant／User message、入力欄、Footer、iTerm2 profileはこのExtensionの対象外とする。

## 詳細表示

`Ctrl+O`でPi本体のTool展開を切り替える。別のTool Output Viewerは使用しない。

Expanded表示では同じ3段構造を保ち、3段目へ正確な引数・command・全output・全diffをinline表示する。同じAssistant messageに複数Tool Callがある場合は`batch call 2/4`のように位置をfactsへ併記し、LLM summaryがfallbackした場合は展開時だけ理由を表示する。

Factsはtarget・件数・成功／失敗・duration等を意味別に配色する。Expanded outputはReadのsyntax highlightingとEditのPi built-in diff rendererを維持し、Bashでは安全なSGR colorだけを保持してcursor操作等のterminal control sequenceを除去する。ANSI colorがないBash outputとGrep／Find／Ls outputには共通のsemantic colorを適用する。

## 永続化

実行中のsummaryとtimerはメモリに保持する。Tool完了時に以下をTool Resultの`details.__compactToolUi`へ追加し、Session JSONLへ永続化する。

- LLM semantic summary
- result facts
- duration
- summarizer modelとprompt version
- 同じAssistant message内でのbatch ID・位置・件数

Sessionをresumeした場合は保存済みmetadataを使い、LLMを再実行しない。実装前の古いTool Resultはdeterministic fallbackで表示する。

## Files

- `index.ts`：Extension lifecycle、Built-in Tool登録、summary永続化
- `summarizer.ts`：batch LLM summary
- `summary-format.ts`：strict JSON response parser
- `store.ts`：実行中のTool状態
- `facts.ts`：path・件数・diff・error等の事実抽出
- `tool-format.ts`：built-in Toolの`Name(args)`とbranch factsの正規化
- `tool-header.ts`：status anchorと枝線metadataのwidth-aware描画
- `indented-component.ts`：preview／expanded detailのnested描画
- `renderer.ts`：compact／expanded表示の統合
- `types.ts`：永続metadataとruntime state
- `*.test.ts`：formatter、indent、renderer、fact extraction、summary parserのunit test
