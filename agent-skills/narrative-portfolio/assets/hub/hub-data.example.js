// hub-data.js の記入例（架空の人物・素材薄めの小規模ケース）
// セットアップ時にこのファイルを hub-data.js という名前でコピーし、値を実データに置き換える。
// キーの追加・削除・構造変更は禁止。表せないものがあれば skill-feedback.md に記録する。
// 固有名詞（subject.name など）は research/identity.json の canonical 表記からコピーする。
window.HUB_DATA = {
  // 本人氏名: identity.json の原文どおり（ローマ字からの補完・記憶からの再構成は禁止）
  subject: { name: "山田 太郎" },

  // 更新日時: ハブを更新するたびに書き換える（本人が「いつの状態か」を判別するため）
  updatedAt: "2026-07-24 15:30",

  phase: {
    current: 1, // 0〜7
    // チェックポイント通過状況: "pending" | "passed"
    checkpoints: { "1": "pending", "2": "pending", "3": "pending" }
  },

  // このフェーズで分かったこと。平易な文で。内部ファイルのパスを書かない
  findings: [
    "全13件の実コンテンツを読み終えた（読めなかった1件は下のcoverage画面に一覧）",
    "リポジトリのREADMEの書き込みが丁寧で、9件全部が学習の記録を兼ねている",
    "記事3本はいずれも『詰まった過程』を隠さず書くスタイルで一貫している"
  ],

  // 今見るべき画面。href はハブからの相対パス
  screens: [
    { label: "coverage report", href: "coverage.html", note: "全13件の読解結果" },
    { label: "採点ボード", href: "scoring-board.html", note: "S/A全件を画像つきで比較" }
  ],

  // 決めてほしいこと。決定はチャットで受ける（画面の固定文言が案内する）
  decision: {
    ask: "S/A の採点を見て、上下させたいものがあれば教えてほしい。特にS級は作品の柱になる。",
    options: [] // 選択肢が明確なときだけ使う（例: 読みの深さ「ライト/標準/フル」）
  },

  // 決定後に何が起きるか1行
  next: "採点が確定したら Phase 2（方向性提案）へ。複数軸×複数案の見本を作って選抜ボードで見せる。",

  // Phase 1 の全件読解が終わったら記入。
  // read + inaccessible件数 + duplicate + irrelevant = total でないと coverage 画面がエラーを出す
  coverage: {
    total: 13,
    read: 10,
    duplicate: 1,
    irrelevant: 1,
    inaccessible: [
      { title: "削除済みの旧ブログ記事", url: "https://example.com/old-post", tried: "直接取得404 → Webアーカイブは本文なし" }
    ],
    digest: [
      "9リポジトリ全部が『学習過程の記録』を兼ねていて、READMEの厚さが本人の声になっている",
      "記事は3本とも失敗過程を隠さない書き方で、リポジトリ群と地続き"
    ]
  },

  // S/A/B/C を付けたら記入。S/A は全件、img はサムネイル・OGP のURL（無ければ null = プレースホルダ表示）
  // S+A+B+C の合計件数は coverage.read と一致させる（scoring-board が検証し、未採点の残りを検出する）
  tiers: {
    S: [
      {
        title: "color-lab",
        summary: "配色を試しながら学ぶ実験リポジトリ",
        reason: "READMEが最も厚く、学習記録という本人の軸を最も体現",
        url: "https://github.com/example/color-lab",
        img: "https://example.com/ogp/color-lab.png"
      },
      {
        title: "「詰まった3日間」記事",
        summary: "レイアウト崩れの原因究明の記録",
        reason: "反響最多+本人の文体が一番出ている",
        url: "https://example.com/blog/three-days",
        img: null
      }
    ],
    A: [
      { title: "portfolio-v2", summary: "自作ポートフォリオの2代目", reason: "変遷が時系列の柱になる", url: "https://github.com/example/portfolio-v2", img: null },
      { title: "入門記事", summary: "アニメーション入門", reason: "学習→執筆の循環の証拠", url: "https://example.com/blog/anime-intro", img: null },
      { title: "ui-sketches", summary: "UI模写の練習帳", reason: "S級2件の前段にあたる練習の記録", url: "https://github.com/example/ui-sketches", img: null }
    ],
    B: [
      { title: "portfolio-v1", summary: "初代ポートフォリオ", url: "https://github.com/example/portfolio-v1" },
      { title: "config-notes", summary: "設定メモ", url: "https://github.com/example/config-notes" },
      { title: "短報記事", summary: "ツール紹介の短い記事", url: "https://example.com/blog/tool-note" },
      { title: "practice-todo", summary: "チュートリアルの写経", url: "https://github.com/example/practice-todo" }
    ],
    C: [
      { title: "sandbox", summary: "使い捨ての実験場", url: "https://github.com/example/sandbox" }
    ]
  }
};
