#!/usr/bin/env python3
"""レイアウトの機械測定 — site/ 配下の全HTMLについて、はみ出しと文字切れを headless Chrome で測る。

やること（references/verification.md の手順の自動化）:
  1. 対象HTMLを qa/ ディレクトリにコピーし、測定スクリプトを </body> 直前に注入する
     （原本には触らない。site/ に MEASURE_START が残っていたら過去の事故なので即エラー）
  2. headless Chrome をバックグラウンドで起動して DOM をダンプし、完了をポーリングで待つ
     （フォアグラウンドで待つとプロセスが居座って固まることがある）
  3. 全ページの結果を集計して報告する

使い方:
  python3 measure_layout.py <siteディレクトリ> [--chrome /path/to/chrome]

Chrome の場所は --chrome か環境変数 CHROME_BIN で指定できる（未指定なら既知の場所を探す）。
[はみ出し]・[文字切れ疑い] が1件でもあれば exit 1。意図した装飾による検出は、
要素名と理由を検証報告に列挙した上で許容してよい（列挙なしの0件宣言は不可）。
"""
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import time

INJECT = """<script>/* layout-measure-inject */
setTimeout(() => {
  const bad = [];
  const vw = document.documentElement.clientWidth;
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
      bad.push('[はみ出し] ' + (typeof el.className === 'string' && el.className ? el.className.split(' ')[0] : el.tagName) + ' right=' + Math.round(r.right));
    }
    const s = getComputedStyle(el);
    if (s.overflowX === 'hidden' || s.overflowY === 'hidden' || s.overflow === 'hidden') {
      const dw = el.scrollWidth - el.clientWidth, dh = el.scrollHeight - el.clientHeight;
      if (dw > 1 || dh > 1) bad.push('[文字切れ疑い] ' + (typeof el.className === 'string' && el.className ? el.className.split(' ')[0] : el.tagName) + ' dw=' + dw + ' dh=' + dh);
    }
  });
  const pre = document.createElement('pre');
  pre.textContent = 'MEASURE_' + 'START' + JSON.stringify([...new Set(bad)].slice(0, 50)) + 'MEASURE_' + 'END';
  document.body.appendChild(pre);
}, 800);
</script>
"""

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
]


def find_chrome(cli_arg):
    for c in [cli_arg, os.environ.get("CHROME_BIN")] + CHROME_CANDIDATES:
        if c and pathlib.Path(c).exists():
            return c
    return None


def unescape(text):
    for a, b in (("&quot;", '"'), ("&#39;", "'"), ("&lt;", "<"), ("&gt;", ">"), ("&amp;", "&")):
        text = text.replace(a, b)
    return text


def measure_page(chrome, page, profile_dir, timeout_s=30):
    out = page.with_suffix(".dump")
    with open(out, "w") as fh:
        proc = subprocess.Popen(
            [chrome, "--headless=new", "--disable-gpu",
             f"--user-data-dir={profile_dir}", "--dump-dom",
             "--virtual-time-budget=4000", "--window-size=1440,2000",
             page.as_uri()],
            stdout=fh, stderr=subprocess.DEVNULL,
        )
    deadline = time.time() + timeout_s
    result = None
    while time.time() < deadline:
        done = proc.poll() is not None
        if out.exists():
            text = out.read_text(encoding="utf-8", errors="replace")
            m = re.search(r"MEASURE_START(.*?)MEASURE_END", text, re.S)
            if m:
                result = unescape(m.group(1))
                break
        if done:
            break
        time.sleep(0.5)
    if proc.poll() is None:
        proc.kill()
    return result


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    chrome_arg = None
    if "--chrome" in sys.argv:
        chrome_arg = sys.argv[sys.argv.index("--chrome") + 1]
    if len(args) != 1:
        print(__doc__)
        return 2
    site = pathlib.Path(args[0]).resolve()
    if not site.is_dir():
        print(f"ディレクトリが見つからない: {site}")
        return 2

    for hf in site.rglob("*.html"):
        if "layout-measure-inject" in hf.read_text(encoding="utf-8", errors="replace"):
            print(f"[事故] {hf} に測定スクリプトの残骸がある。原本を直してから再実行")
            return 1

    chrome = find_chrome(chrome_arg)
    if not chrome:
        print("headless Chrome が見つからない。--chrome か CHROME_BIN で指定するか、"
              "references/verification.md のフォールバック（目視の強化）に切り替え、"
              "フィードバックのメタ情報に「レイアウト機械測定: 未実施」と記録する")
        return 2

    qa = pathlib.Path(tempfile.mkdtemp(prefix="layout-qa-"))
    shutil.copytree(site, qa / "site", dirs_exist_ok=True)
    pages = sorted((qa / "site").rglob("*.html"))
    total_issues = []
    failed = []
    for page in pages:
        text = page.read_text(encoding="utf-8", errors="replace")
        if "</body>" in text:
            text = text.replace("</body>", INJECT + "</body>", 1)
        else:
            text += INJECT
        page.write_text(text, encoding="utf-8")
        result = measure_page(chrome, page, qa / f"profile-{page.stem}")
        rel = page.relative_to(qa / "site")
        if result is None:
            failed.append(str(rel))
        elif result.strip() not in ("[]", ""):
            total_issues.append(f"{rel}: {result}")

    print(f"測定: {len(pages)} ページ（site/ のコピーに対して実施。原本は無変更）")
    if failed:
        print(f"測定できなかったページ {len(failed)} 件: {failed}")
    if total_issues:
        print(f"検出 {len(total_issues)} ページ:")
        for t in total_issues:
            print("  -", t)
    shutil.rmtree(qa, ignore_errors=True)
    if failed or total_issues:
        return 1
    print("レイアウト: はみ出し0・文字切れ疑い0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
