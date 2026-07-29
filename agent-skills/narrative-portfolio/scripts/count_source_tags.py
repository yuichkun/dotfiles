#!/usr/bin/env python3
"""最終作品に使った事実の出典3値タグ集計。

入力（作業ディレクトリ基準）:
  research/dossiers.json     調査書の配列。各調査書の claims[] に id と source_tag を含む
  research/used-claims.json  使用記録の配列 [{"claim_id": "対象id#連番", "used_in": "site/index.html"}]

使い方:
  python3 count_source_tags.py <作業ディレクトリ>

出力: タグ別件数（feedback md にそのまま転記する）。
未解決の claim_id・不正タグ・id 無し claim があれば一覧を出して exit 1。
手集計・目分量での記入は禁止 — このスクリプトの出力だけを転記する。
"""
import json
import pathlib
import sys

VALID_TAGS = ("mcp", "external-public", "local-auth")


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    root = pathlib.Path(sys.argv[1]).resolve()
    dossiers_path = root / "research" / "dossiers.json"
    used_path = root / "research" / "used-claims.json"
    for p in (dossiers_path, used_path):
        if not p.exists():
            print(f"ファイルが見つからない: {p}")
            return 2

    dossiers = json.loads(dossiers_path.read_text(encoding="utf-8"))
    used = json.loads(used_path.read_text(encoding="utf-8"))

    problems = []
    claims = {}
    for d in dossiers:
        for c in d.get("claims", []):
            cid = c.get("id")
            if not cid:
                problems.append(f"[claim id なし] {d.get('id')}: {c.get('text', '')[:40]}")
            elif cid in claims:
                problems.append(f"[claim id 重複] {cid}")
            else:
                claims[cid] = c

    counts = {t: 0 for t in VALID_TAGS}
    seen = set()
    for u in used:
        cid = u.get("claim_id")
        if not cid:
            problems.append(f"[claim_id なし] used-claims の要素: {u}")
            continue
        if cid in seen:
            continue  # 同一 claim の複数使用は1件で数える
        seen.add(cid)
        c = claims.get(cid)
        if c is None:
            problems.append(f"[未解決] used-claims の {cid} が dossiers.json に無い")
            continue
        tag = c.get("source_tag")
        if tag not in VALID_TAGS:
            problems.append(f"[不正タグ] {cid}: {tag!r}")
            continue
        counts[tag] += 1

    print(f"使用 claim {len(seen)} 件（重複除去後）を集計")
    print(
        f"`mcp`: {counts['mcp']} 件 / "
        f"`external-public`: {counts['external-public']} 件 / "
        f"`local-auth`: {counts['local-auth']} 件"
    )
    if problems:
        print(f"問題 {len(problems)} 件:")
        for p in problems:
            print("  -", p)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
