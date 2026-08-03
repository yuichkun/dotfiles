# Compact Tool UI

Built-in Toolの実行処理を維持したまま、Toolごとの表示をコンパクトな意味要約へ置き換える。

## 通常表示

各Toolを2〜3行で表示する。

```text
⠼ Tool rendererのsignatureを一括更新しています
  bash · python heredoc · running 2.1s
```

完了後は、LLMが生成した意味要約に実際のTool Resultから得た事実を併記する。

```text
✓ Tool rendererのsignatureを一括更新しました
  bash · python heredoc · 4 files changed · 2.3s
```

LLM summaryが到着するまではTool名・path・command種別から作るfallbackを表示する。Summary生成はTool processの開始をblockせず、同じAssistant message内のTool Call群を1回で要約する。要約には直近の会話、現在のuser goal、非表示のthinking summary、正規化したTool引数を渡し、現在のmodelをminimal reasoningで使用する。

## 詳細表示

`Ctrl+O`でPi本体のTool展開を切り替える。別のTool Output Viewerは使用しない。

Expanded表示では、Built-in Toolの元のrendererへ委譲し、正確な引数・command・output・diffをinline表示する。

## 永続化

実行中のsummaryとtimerはメモリに保持する。Tool完了時に以下をTool Resultの`details.__compactToolUi`へ追加し、Session JSONLへ永続化する。

- LLM semantic summary
- result facts
- duration
- summarizer modelとprompt version

Sessionをresumeした場合は保存済みmetadataを使い、LLMを再実行しない。実装前の古いTool Resultはdeterministic fallbackで表示する。

## Files

- `index.ts`：Extension lifecycle、Built-in Tool登録、summary永続化
- `summarizer.ts`：batch LLM summary
- `summary-format.ts`：strict JSON response parser
- `store.ts`：実行中のTool状態
- `facts.ts`：path・件数・diff・error等の事実抽出
- `renderer.ts`：compact／expanded表示
- `types.ts`：永続metadataとruntime state
- `tool-ui.test.ts`：fact extractionとsummary parserのunit test
