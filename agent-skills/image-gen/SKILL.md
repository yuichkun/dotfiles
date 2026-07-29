---
name: image-gen
description: >-
  Generate raster images from text prompts using Google's Gemini / Imagen API (Nano Banana = gemini-3-pro-image, and Imagen 4). Use this whenever the user asks to create, generate, draw, make, or design an image, illustration, picture, icon, logo, hero/cover/banner art, background, texture, avatar, concept art, or any visual asset — including phrasings like "画像作って", "イラスト描いて", "図を作って", "アイキャッチ", "サムネ", "挿絵", "ビジュアル". Also use PROACTIVELY (without being asked) when building a website, slide deck, document, README, or learning material that would clearly benefit from illustrations or visual assets. Supports reference images for editing and for keeping a consistent art style across many images. Note: for precise charts/graphs/diagrams with exact text or math, prefer SVG or code — AI raster generation garbles text and equations.
---

# image-gen — Gemini / Imagen 画像生成

テキストプロンプトから画像を生成し、ファイルに保存する。Google の Gemini 画像モデル(Nano Banana)と Imagen 4 を、付属の Node CLI 経由で叩く。

## いつ使うか

- ユーザーが画像・イラスト・アイコン・バナー・挿絵・コンセプトアートなどを求めたとき
- サイト/スライド/ドキュメント/学習教材を作っていて、視覚素材があきらかに価値を足すとき(明示依頼がなくても提案・生成してよい)
- 既存画像を編集したい、または複数画像で画風を統一したいとき(参照画像を渡す)

**向かないケース**: 正確なテキスト・数式・座標が要る図表。AI のラスター生成は文字や数式を崩す。そこは SVG / コード / 既存の作図ツールを使い、AI 画像は「雰囲気・概念・挿絵」に限定する。ラベルが要るなら、生成画像の上に HTML/SVG でテキストを重ねる。

## 前提

- Node.js 18+(標準 `fetch` を使う。追加依存なし)
- API キー: 環境変数 `GEMINI_API_KEY` を優先、なければ `~/.config/claude-image-gen/credentials`(1行・キーのみ)
- **課金必須**: 画像生成は無料枠が `limit: 0`。対象プロジェクトで Billing 有効化が要る(https://aistudio.google.com/ → Set up Billing)。有効化していないと「課金が必要です」エラーになる。

## 使い方(基本)

```bash
node ~/.claude/skills/image-gen/scripts/generate.mjs \
  --prompt "flat minimalist illustration of a spring oscillating, soft blue and slate palette, lots of whitespace, no text" \
  --out ./docs/public/images/spring.png \
  --aspect 16:9
```

成功すると保存先パスを JSON で返す。`--out` を省くと `./generated-<timestamp>.png`。

### よく使うオプション

| オプション | 既定 | 説明 |
|---|---|---|
| `--prompt`, `-p` | (必須) | プロンプト。英語の方が概して安定 |
| `--out`, `-o` | `./generated-<ts>.png` | 出力パス。`--n` が2以上なら `-1`,`-2` が付く |
| `--model`, `-m` | `gemini-3-pro-image` | モデル選択(下表) |
| `--aspect`, `-a` | `16:9` | `1:1` `4:3` `3:4` `9:16` `16:9` など |
| `--n` | `1` | 枚数 |
| `--ref` | — | 参照画像パス(複数回指定可)。編集・画風統一用。Gemini系のみ |
| `--negative` | — | 避けたい要素 |
| `--size` | — | `1K` / `2K` / `4K`(対応モデルのみ) |

## モデルの選び方

| モデル | 用途 | 目安単価 |
|---|---|---|
| `gemini-3-pro-image`(Nano Banana・既定) | 画風の一貫性・参照画像での編集が最強。シリーズ物の挿絵・章扉に最適 | ~$0.13 |
| `gemini-3.1-flash-image` | Nano Banana の高速・低コスト版 | 中 |
| `imagen-4.0-generate-001` | 写実・高精細。単発のリッチな1枚 | ~$0.04 |
| `imagen-4.0-fast-generate-001` | 安く速く量産 | ~$0.02 |
| `imagen-4.0-ultra-generate-001` | 最高画質 | ~$0.06 |

複数画像で画風を揃えたいときは Nano Banana + 参照画像が最も確実。詳しくは `references/prompting.md`。

## プロンプトと運用のコツ

画風統一・数式を入れない・参照画像での編集など、品質を出すための要点は `references/prompting.md` にまとめてある。**複数枚を作る前に必ず読む**こと(画風がバラつくと学習サイト等ではかえって逆効果になる)。

## エラーの読み方

- 「課金が必要です」→ Billing 未有効。https://aistudio.google.com/ で対象プロジェクトを有効化。
- 「レート/クォータ超過」→ 少し待つ。`--n` を下げる。Tier が低い場合は時間を空ける。
- 「画像が返らなかった(finishReason=...)」→ 安全性フィルタ等でブロック。プロンプトを言い換える。
