#!/usr/bin/env node
// Google Gemini / Imagen 画像生成 CLI(外部依存なし・Node 18+ の fetch を使用)。
//
//   node generate.mjs --prompt "..." [options]
//
// オプション:
//   --prompt, -p   <text>     生成プロンプト(位置引数でも可)
//   --out, -o      <path>     出力先。複数枚は -1,-2... が付く。省略時 ./generated-<ts>.png
//   --model, -m    <id>       既定 gemini-3-pro-image(Nano Banana)。imagen-4.0-generate-001 等も可
//   --aspect, -a   <ratio>    既定 16:9。1:1 / 4:3 / 3:4 / 9:16 / 16:9 など
//   --n            <int>      枚数(既定 1)
//   --ref          <path>     参照画像(編集・画風統一)。複数回指定可。Gemini系のみ
//   --negative     <text>     ネガティブプロンプト
//   --size         <1K|2K|4K> 解像度(対応モデルのみ)
//
// キー: 環境変数 GEMINI_API_KEY を優先、なければ ~/.config/claude-image-gen/credentials。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";

const API = "https://generativelanguage.googleapis.com/v1beta";

function loadKey() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  for (const p of [
    join(homedir(), ".config", "claude-image-gen", "credentials"),
    join(homedir(), ".config", "gemini", "api_key"),
  ]) {
    try {
      const k = readFileSync(p, "utf8").trim();
      if (k) return k;
    } catch {}
  }
  throw new Error(
    "APIキーが見つからない。環境変数 GEMINI_API_KEY を設定するか、~/.config/claude-image-gen/credentials に保存してください。"
  );
}

function parseArgs(argv) {
  const a = {
    model: "gemini-3-pro-image",
    n: 1,
    aspect: "16:9",
    out: null,
    prompt: null,
    refs: [],
    negative: null,
    size: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--prompt" || k === "-p") a.prompt = next();
    else if (k === "--out" || k === "-o") a.out = next();
    else if (k === "--model" || k === "-m") a.model = next();
    else if (k === "--aspect" || k === "-a") a.aspect = next();
    else if (k === "--n") a.n = parseInt(next(), 10) || 1;
    else if (k === "--ref") a.refs.push(next());
    else if (k === "--negative") a.negative = next();
    else if (k === "--size") a.size = next();
    else if (!k.startsWith("-") && !a.prompt) a.prompt = k;
  }
  return a;
}

function guessMime(p) {
  const e = extname(p).toLowerCase();
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  return "image/png";
}

function apiError(e) {
  const tag = `${e.status || ""} ${e.message || ""}`;
  const msg = e.message || JSON.stringify(e);
  if (/billing|paid plan|FAILED_PRECONDITION/i.test(tag)) {
    return new Error(
      `課金が必要です: ${msg}\n→ https://aistudio.google.com/ で対象プロジェクトの Billing を有効化してください。`
    );
  }
  if (/quota|rate|RESOURCE_EXHAUSTED/i.test(tag)) {
    return new Error(`レート/クォータ超過: ${msg}`);
  }
  return new Error(`API error (${e.status || e.code || "?"}): ${msg}`);
}

async function postJSON(url, body, attempt = 0) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) {
    const e = j.error;
    const rateLimited =
      res.status === 429 ||
      /quota|rate|RESOURCE_EXHAUSTED|exceeded|overloaded|UNAVAILABLE/i.test(
        `${e.status || ""} ${e.message || ""}`
      );
    if (rateLimited && attempt < 5) {
      const waitMs = Math.min(60000, 4000 * 2 ** attempt); // 4s, 8s, 16s, 32s, 60s
      console.error(`[image-gen] レート制限。${waitMs / 1000}s 待って再試行 (${attempt + 1}/5)`);
      await new Promise((r) => setTimeout(r, waitMs));
      return postJSON(url, body, attempt + 1);
    }
    throw apiError(e);
  }
  return j;
}

// Imagen 系: :predict
async function callImagen(model, key, a) {
  const parameters = { sampleCount: a.n, aspectRatio: a.aspect };
  if (a.size) parameters.imageSize = a.size;
  if (a.negative) parameters.negativePrompt = a.negative;
  const j = await postJSON(`${API}/models/${model}:predict?key=${key}`, {
    instances: [{ prompt: a.prompt }],
    parameters,
  });
  return (j.predictions || []).map((p) => p.bytesBase64Encoded).filter(Boolean);
}

// Gemini image 系(Nano Banana など): :generateContent
async function callGemini(model, key, a) {
  const parts = [{ text: a.prompt + (a.negative ? `\n\n避けるもの: ${a.negative}` : "") }];
  for (const r of a.refs) {
    parts.push({ inline_data: { mime_type: guessMime(r), data: readFileSync(r).toString("base64") } });
  }
  const generationConfig = { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: a.aspect } };
  if (a.size) generationConfig.imageConfig.imageSize = a.size;
  const url = `${API}/models/${model}:generateContent?key=${key}`;
  const images = [];
  // Gemini は 1 リクエスト 1 枚が基本なので、n 枚は反復で取得する。
  for (let i = 0; i < a.n; i++) {
    const j = await postJSON(url, { contents: [{ parts }], generationConfig });
    const cand = (j.candidates || [])[0];
    if (!cand) throw new Error("候補が返らなかった(レスポンス空)。");
    const got = (cand.content?.parts || [])
      .map((p) => p.inlineData?.data || p.inline_data?.data)
      .filter(Boolean);
    if (!got.length) {
      const reason = cand.finishReason || "不明";
      throw new Error(`画像が返らなかった(finishReason=${reason})。プロンプトを言い換えるか、安全性に触れない表現に。`);
    }
    images.push(...got);
  }
  return images;
}

function outPath(a, idx, total) {
  if (a.out) {
    if (total === 1) return a.out;
    const e = extname(a.out) || ".png";
    return a.out.slice(0, a.out.length - e.length) + `-${idx + 1}` + e;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `generated-${ts}${total > 1 ? "-" + (idx + 1) : ""}.png`;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.prompt) {
    console.error('使い方: node generate.mjs --prompt "..." [--out path] [--model id] [--aspect 16:9] [--n 1] [--ref img] [--negative "..."]');
    process.exit(2);
  }
  const key = loadKey();
  const isImagen = /^imagen/.test(a.model);
  console.error(`[image-gen] model=${a.model} aspect=${a.aspect} n=${a.n}`);
  const b64s = isImagen ? await callImagen(a.model, key, a) : await callGemini(a.model, key, a);
  if (!b64s.length) throw new Error("画像が1枚も返らなかった。");
  const saved = [];
  b64s.forEach((b, i) => {
    const p = outPath(a, i, b64s.length);
    const d = dirname(p);
    if (d && !existsSync(d)) mkdirSync(d, { recursive: true });
    writeFileSync(p, Buffer.from(b, "base64"));
    saved.push(p);
  });
  console.log(JSON.stringify({ ok: true, model: a.model, files: saved }, null, 2));
}

main().catch((e) => {
  console.error("[image-gen] " + e.message);
  process.exit(1);
});
