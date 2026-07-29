#!/usr/bin/env python3
"""素材台帳と site/ の突合 — 台帳に無い画像・使用不可の画像の混入を機械検出する。

台帳: assets/ledger.json（作業ディレクトリ基準）。配列で、1素材 = 1要素:
  {
    "file": "slide-2023.png",            ファイル名（site/ 内での basename）
    "source_url": "https://...",          出典URL
    "subject": "2023年LT登壇のスライド表紙",  被写体（何の画像か）
    "subject_evidence": "スライドページのタイトルと本人名の一致",  確定手段
    "attribution": "本人作成",             帰属（権利者・クレジット）
    "use": true                           使用可否
  }

検査:
  1. site/ 配下に実在する画像ファイルの全てが、台帳に file 名で存在し use が true
  2. 台帳で use: true なのに site/ に存在しないものは警告（消し忘れ・置き忘れ）
  3. 必須フィールド（source_url / subject / subject_evidence / attribution）の欠落

使い方:
  python3 check_ledger.py <作業ディレクトリ>

問題があれば一覧を出して exit 1。0 になるまで「完了」と言わない。
"""
import json
import pathlib
import sys

IMG_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"}
REQUIRED = ("source_url", "subject", "subject_evidence", "attribution")


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    root = pathlib.Path(sys.argv[1]).resolve()
    ledger_path = root / "assets" / "ledger.json"
    site = root / "site"
    if not ledger_path.exists():
        print(f"台帳が見つからない: {ledger_path}")
        return 2
    if not site.is_dir():
        print(f"site/ が見つからない: {site}")
        return 2

    ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
    by_name = {}
    problems = []
    for i, e in enumerate(ledger):
        fname = e.get("file")
        if not fname:
            problems.append(f"[台帳不備] 要素{i}: file がない")
            continue
        if fname in by_name:
            problems.append(f"[台帳不備] {fname}: 重複エントリ")
        by_name[fname] = e
        if e.get("use") is True:
            for k in REQUIRED:
                if not e.get(k):
                    problems.append(f"[台帳不備] {fname}: use: true なのに {k} が空")

    site_images = [p for p in site.rglob("*") if p.is_file() and p.suffix.lower() in IMG_EXTS]
    for img in site_images:
        e = by_name.get(img.name)
        if e is None:
            problems.append(f"[未台帳] site/ 内の {img.relative_to(root)} が台帳に無い（帰属未確定の画像は使えない）")
        elif e.get("use") is not True:
            problems.append(f"[使用不可] {img.relative_to(root)} は台帳で use: true になっていない")

    warnings = []
    site_names = {p.name for p in site_images}
    for fname, e in by_name.items():
        if e.get("use") is True and fname not in site_names:
            warnings.append(f"[未使用] 台帳で use: true の {fname} が site/ に無い")

    print(f"site/ 内画像 {len(site_images)} 件 / 台帳 {len(ledger)} 件を突合")
    for w in warnings:
        print("  ⚠", w)
    if problems:
        print(f"問題 {len(problems)} 件:")
        for p in problems:
            print("  -", p)
        return 1
    print("台帳突合: 問題なし")
    return 0


if __name__ == "__main__":
    sys.exit(main())
