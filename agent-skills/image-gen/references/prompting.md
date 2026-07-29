# プロンプトと運用ガイド

画像生成で品質を安定させ、特に「複数枚で画風を揃える」「学習教材の挿絵」に効くノウハウ。

## 1. 数式・正確なテキストは画像に入れない

AI ラスター生成は文字・数式・数字・座標目盛りを高確率で崩す($\int$ が変な記号に、軸ラベルが文字化け)。だから:

- 画像には**雰囲気・概念・メタファー**だけを描かせる(例: ばね、波、地形、歯車、光の粒、抽象的な流れ)。
- ラベル・数式・凡例が要るなら、生成画像を背景にして **HTML/SVG でテキストを上に重ねる**。
- 厳密なグラフ・座標図は AI ではなく SVG / 作図コード / デモで作る。プロンプトに `no text, no numbers, no labels, no axis` を入れると崩れた文字が減る。

## 2. 画風を全画像で統一する

シリーズ物(章扉、スライド、アイコン群)は画風がバラつくと一気に素人くさくなる。揃える方法:

1. **共通スタイル文を固定する。** すべてのプロンプトの末尾に同じスタイル記述を足す。例:

   > `... — flat vector illustration, soft geometric shapes, palette of slate blue (#2563eb), warm coral accent, generous whitespace, subtle paper-grain texture, calm and friendly, editorial style, no text.`

   被写体(前半)だけ章ごとに変え、スタイル(後半)は1文字も変えない。

2. **参照画像で固定する(最強)。** 最初に「これだ」という1枚を作り、以降は `--ref first.png` を付けて Nano Banana(`gemini-3-pro-image`)に「この画風で、被写体は○○」と指示する。色・タッチ・余白の取り方まで揃いやすい。

3. **同じモデル・同じアスペクト比**で通す。モデルを混ぜると画風が割れる。

## 3. プロンプトの構造(おすすめの順)

`[主題/被写体] + [構図・視点] + [画風・媒体] + [配色] + [雰囲気] + [除外(no text 等)]`

例:
> `A single coiled metal spring stretching and compressing, side view, centered with empty space around it, flat vector illustration with soft geometric shapes, slate-blue and coral palette, calm friendly mood, lots of whitespace, no text or numbers.`

- 英語が概して安定(日本語でも通るが、固有の概念は英語の方が解釈がぶれない)。
- 抽象度を指定する(`abstract`, `metaphorical`, `minimal`)と、写実に寄りすぎない学習向けの絵になる。
- 1プロンプト1主題。要素を詰め込みすぎると崩れる。

## 4. アスペクト比の使い分け

| 用途 | aspect |
|---|---|
| 章扉・記事ヘッダー・OGP | `16:9` |
| 本文中の挿絵(横長) | `16:9` / `3:2` |
| 正方アイコン・サムネ | `1:1` |
| スマホ全画面・縦バナー | `9:16` |

## 5. 反復と選別

- 重要な絵は `--n 3` で複数案を出し、一番良い1枚を選ぶ。失敗生成は基本課金されない/安い。
- 「惜しい」ときは参照画像にその1枚を渡して「ここをこう変えて」と編集指示(Nano Banana)。
- 量産前に必ず2〜3枚で画風を確定し、それを参照画像にしてから残りを回す。

## 6. コスト感

Imagen 4 fast ~$0.02、Imagen 4 ~$0.04、Nano Banana ~$0.13/枚。数十〜百枚規模でも数ドル〜十数ドル。重要カットだけ Nano Banana、量産は Imagen 4、と混ぜると安く済む(ただし画風統一を優先するなら同一モデルで)。
