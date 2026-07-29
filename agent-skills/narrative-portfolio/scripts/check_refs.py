#!/usr/bin/env python3
"""成果物ディレクトリの参照整合チェック。

HTML内の src/href/srcset と、HTML・CSS内の url(...) を機械抽出し、次を検査する:
  1. ローカル参照先のファイルが実在するか（リンク切れ）
  2. ルート絶対パス参照（/assets/... 形式。file:// やサブパス配信で壊れる）

使い方:
  python3 check_refs.py <出力ディレクトリ>

問題があれば一覧を出力して exit code 1、なければ 0。
"""
import pathlib
import re
import sys

SKIP_PREFIXES = ("http://", "https://", "//", "data:", "mailto:", "tel:", "#", "javascript:")


def iter_refs(text):
    for m in re.finditer(r"""(?:src|href)\s*=\s*["']([^"']+)["']""", text):
        yield m.group(1)
    for m in re.finditer(r"""srcset\s*=\s*["']([^"']+)["']""", text):
        for part in m.group(1).split(","):
            tokens = part.strip().split()
            if tokens:
                yield tokens[0]
    for m in re.finditer(r"""url\(\s*['"]?([^'")\s]+)['"]?\s*\)""", text):
        yield m.group(1)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    root = pathlib.Path(sys.argv[1]).resolve()
    if not root.is_dir():
        print(f"ディレクトリが見つからない: {root}")
        return 2

    target_files = sorted(root.rglob("*.html")) + sorted(root.rglob("*.css"))
    problems = []
    checked = 0

    for hf in target_files:
        text = hf.read_text(encoding="utf-8", errors="replace")
        for raw in iter_refs(text):
            url = raw.strip()
            if not url or url.startswith(SKIP_PREFIXES):
                continue
            if "${" in url:  # JSテンプレートリテラル（実行時に埋まる参照）は対象外
                continue
            checked += 1
            rel = hf.relative_to(root)
            if url.startswith("/"):
                problems.append(f"[絶対パス] {rel} -> {url}（相対パスに直す）")
                continue
            clean = url.split("#")[0].split("?")[0]
            if not clean:
                continue
            target = (hf.parent / clean).resolve()
            if not target.exists():
                problems.append(f"[リンク切れ] {rel} -> {url}")

    print(f"HTML/CSS {len(target_files)} 件 / ローカル参照 {checked} 件を検査")
    if problems:
        print(f"問題 {len(problems)} 件:")
        for p in problems:
            print("  -", p)
        return 1
    print("問題なし")
    return 0


if __name__ == "__main__":
    sys.exit(main())
