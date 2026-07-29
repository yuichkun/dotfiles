#!/usr/bin/env python3
"""固有名詞検査 — canonical identity との照合。

research/identity.json を基準に、本人向け成果物（site/ probes/ hub/）を走査する:
  1. forbidden（発見済みの誤表記）が1件でもあれば失敗
  2. 氏名トークンの先頭文字が、canonical・variants のどの表記の一部でもない形で
     現れる箇所を「疑わしい出現」として文脈つきで列挙する
  3. 生成スクリプト（作業ディレクトリ直下の .py .mjs .js）への氏名リテラル埋め込みを警告

使い方:
  python3 check_identity.py <作業ディレクトリ>

identity.json の形式は references/research-method.md を参照。
疑わしい出現は1件ずつ目視し、誤表記なら identity.json の forbidden に追記、
正当な出現（正しい表記の一部・無関係な語）なら ignore に文脈文字列を追記して再実行する。
forbidden ヒット・identity.json の必須欠落・未処理の疑わしい出現があれば exit 1。
0 になるまで「完了」と言わない。
"""
import json
import pathlib
import sys

TARGET_DIRS = ("site", "probes", "hub")
TARGET_EXTS = {".html", ".htm", ".js", ".mjs", ".css", ".md", ".svg", ".json"}
WINDOW = 10


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    root = pathlib.Path(sys.argv[1]).resolve()
    ident_path = root / "research" / "identity.json"
    if not ident_path.exists():
        print(f"identity.json が見つからない: {ident_path}")
        return 2
    ident = json.loads(ident_path.read_text(encoding="utf-8"))

    problems = []
    suspicious = []
    warnings = []

    name = (ident.get("name") or {})
    canonical = (name.get("value") or "").strip()
    if not canonical:
        problems.append("identity.json: name.value がない")
    if len(name.get("source_urls") or []) < 2:
        problems.append("identity.json: name.source_urls が2件未満（一次ソース2件照合が必須）")
    variants = ident.get("name_variants") or []
    forbidden = ident.get("forbidden") or []
    ignore = ident.get("ignore") or []

    allowed = [canonical, canonical.replace(" ", ""), canonical.replace("　", "")] + list(variants)
    allowed = [a for a in set(allowed) if a]
    tokens = [t for t in canonical.replace("　", " ").split(" ") if t]

    files = []
    for d in TARGET_DIRS:
        base = root / d
        if base.is_dir():
            files += [p for p in base.rglob("*") if p.is_file() and p.suffix.lower() in TARGET_EXTS]

    for f in files:
        text = f.read_text(encoding="utf-8", errors="replace")
        rel = f.relative_to(root)
        for bad in forbidden:
            if bad and bad in text:
                problems.append(f"[誤表記] {rel}: {bad!r} が {text.count(bad)} 箇所")
        for tok in tokens:
            head = tok[0]
            idx = text.find(head)
            while idx != -1:
                lo = max(0, idx - WINDOW)
                window = text[lo: idx + WINDOW]
                covered = any(a in window for a in allowed)
                ignored = any(ig and ig in window for ig in ignore)
                if not covered and not ignored:
                    ctx = window.replace("\n", "\\n")
                    suspicious.append(f"[要目視] {rel}: …{ctx}…")
                idx = text.find(head, idx + 1)

    for p in sorted(root.glob("*.py")) + sorted(root.glob("*.mjs")) + sorted(root.glob("*.js")):
        text = p.read_text(encoding="utf-8", errors="replace")
        if canonical and canonical in text:
            warnings.append(f"[リテラル埋め込み] {p.name}: 生成スクリプトは identity.json を参照する作りにする")

    suspicious = sorted(set(suspicious))
    print(f"走査: {len(files)} ファイル / 基準表記: {canonical!r} + variants {len(variants)} 件")
    for w in warnings:
        print("  ⚠", w)
    if suspicious:
        print(f"疑わしい出現 {len(suspicious)} 件（目視して forbidden か ignore に振り分けて再実行）:")
        for s in suspicious[:60]:
            print("  -", s)
    if problems:
        print(f"問題 {len(problems)} 件:")
        for p in problems:
            print("  -", p)
    if problems or suspicious:
        return 1
    print("固有名詞: 問題なし")
    return 0


if __name__ == "__main__":
    sys.exit(main())
