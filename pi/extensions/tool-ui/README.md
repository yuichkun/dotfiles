# Compact Tool UI

Built-in Toolの実行処理を維持したまま、Toolごとの表示をコンパクトな意味要約へ置き換える。

## 通常表示

Built-in Toolを、Claude Codeに近い3段の視覚階層で表示する。

```text
⏺ Update(packages/core/src/types.ts)
  ⎿  型定義を修正しました
      997 ? { readonly [K in keyof P]: AudioParam }
      998 : Record<string, AudioParam>;
      999 readonly state: C extends { state: infer S }
    -1000 ? { readonly [K in keyof S]: StateValueProxy<unknown> }
    +1000 ? { readonly [K in keyof S]: StateValueProxy<WitnessFieldValue<S[K]>> }
     1001 : Record<string, StateValueProxy<unknown>>;
     1002 readonly events: C extends { events: infer E }
     1003 ? { readonly [K in keyof E]: EventSurfaceFor<E[K]> }
     1004 : never;
```

- 1段目: status markerと`Name(arguments)`形式のTool signature
- 2段目: `  ⎿  `に続く高価値な実行結果factsと、重複を除いたLLM semantic summary
- 3段目: `    `で始まるcompact previewまたはexpanded detail

Tool signatureは`Read(path)`、`Update(path)`、`Write(path)`、`Bash(command summary)`、`Search(pattern, path)`、`Find(pattern, path)`、`List(path)`へ正規化する。Collapsed表示では`Read N lines`、`Wrote N lines`、`Ran 1 shell command`、Editの追加・削除数、files／entries／result lines等の定型件数とdurationを隠す。test結果、`No matches`、error、truncatedは残す。error summaryは2段目の先頭へ置く。長い2段目は同じcontent columnで折り返し、狭いterminalではcontent widthを確保するためindentを縮める。

Editの通常previewは、Pi built-in resultが持つ各hunkの**上4行・変更本体・下4行**を対称に表示する。code本文は元言語のsyntax highlightを維持し、追加・削除はline-number gutterの`+` / `-`と`toolDiffAdded` / `toolDiffRemoved`色で示す。赤緑を本文全体へ上書きしないため、syntaxとdiff semanticsを同時に読める。未知拡張子はneutral textへfallbackする。

Collapsed Editは最大28行にboundedする。巨大な変更本体は先頭・末尾を対称に残して省略し、さらに収まらない後続hunkは片側contextだけを切らずhunk単位で省略する。省略件数と`Ctrl+O`のhintを表示する。Writeは従来どおりsyntax-highlighted contentを最大6行表示する。それ以外のToolの生outputは通常表示では畳む。Custom ToolとMCP ToolはこのExtensionの対象外で、登録元のrendererをそのまま使う。

LLM summaryが到着するまではTool名・path・command種別から作るfallbackを表示する。Summary生成はTool processの開始をblockせず、同じAssistant message内のTool Call群を1回で要約する。要約には直近の会話、現在のuser goal、非表示のthinking summary、正規化したTool引数を渡し、現在のmodelをminimal reasoningで使用する。

配色は[`../COLOR_POLICY.md`](../COLOR_POLICY.md)のsemantic roleに従う。Assistant／User message、入力欄、Footer、iTerm2 profileはこのExtensionの対象外とする。

## 詳細表示

`Ctrl+O`でPi本体のTool展開を切り替える。別のTool Output Viewerは使用しない。

Expanded表示では同じ3段構造を保ち、3段目へ正確な引数・command・全output・全diffをinline表示する。同じAssistant messageに複数Tool Callがある場合は`batch call 2/4`のように位置をfactsへ併記し、LLM summaryがfallbackした場合は展開時だけ理由を表示する。

Expandedではcollapsedから省いた定型factsとdurationも復元し、意味別に配色する。Expanded outputはReadのsyntax highlightingとEditのPi built-in diff rendererを維持し、Bashでは安全なSGR colorだけを保持してcursor操作等のterminal control sequenceを除去する。collapsedのsyntax-aware diffはexpanded rendererを置換しない。ANSI colorがないBash outputとGrep／Find／Ls outputには共通のsemantic colorを適用する。

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
- `diff-preview.ts`：display diff parser、対称context、syntax-aware gutter、height/cache policy
- `renderer.ts`：compact／expanded表示の統合
- `types.ts`：永続metadataとruntime state
- `*.test.ts`：formatter、indent、diff parser/highlighter、renderer、fact extraction、summary parserのunit test
