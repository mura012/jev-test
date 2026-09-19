import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { noul, TypeSafeClient } from "@typesafe-ai/sdk";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const MOCK = process.env.JEV_MOCK === "1";

loadDotEnv(join(ROOT, ".env"));

// .env を手で読む（Node 20 でも動くように --env-file は使わない）
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

// 判定項目を Noul（yes/no）質問に変換する。
// 「果物」→ 「`target` は「果物」か？」、末尾が ? / ？ ならそのまま質問として使う。
function toQuestion(criterion) {
  const text = criterion.trim();
  const instructions = /[?？]$/.test(text) ? text : `\`target\` は「${text}」か？`;
  return noul(instructions);
}

async function judge(target, criteria) {
  const questions = Object.fromEntries(
    criteria.map((c, i) => [`q${i}`, toQuestion(c)]),
  );

  if (MOCK) {
    return {
      model: "mock",
      usage: { input_tokens: 0, output_tokens: 0 },
      results: criteria.map((criterion) => ({
        criterion,
        probability: Math.round(Math.random() * 100) / 100,
      })),
    };
  }

  const client = new TypeSafeClient();
  const { answers, model, usage } = await client.systemOne({
    state: { target },
    questions,
  });

  return {
    model,
    usage,
    results: criteria.map((criterion, i) => ({
      criterion,
      probability: answers[`q${i}`].noul,
    })),
  };
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof data === "string" ? data : JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      const html = await readFile(join(ROOT, "public", "index.html"), "utf8");
      return send(res, 200, html, "text/html; charset=utf-8");
    }

    if (req.method === "GET" && req.url === "/api/status") {
      return send(res, 200, {
        mock: MOCK,
        hasApiKey: Boolean(process.env.TYPESAFE_API_KEY),
      });
    }

    if (req.method === "POST" && req.url === "/api/judge") {
      const { target, criteria } = await readJson(req);
      const list = Array.isArray(criteria)
        ? criteria.map((c) => String(c).trim()).filter(Boolean)
        : [];

      if (typeof target !== "string" || !target.trim()) {
        return send(res, 400, { error: "「〇〇」を入力してください。" });
      }
      if (list.length === 0) {
        return send(res, 400, { error: "判定項目を 1 つ以上入力してください。" });
      }
      if (!MOCK && !process.env.TYPESAFE_API_KEY) {
        return send(res, 500, {
          error:
            "TYPESAFE_API_KEY が設定されていません。.env に API キーを書くか、JEV_MOCK=1 でモック動作を試してください。",
        });
      }

      return send(res, 200, await judge(target.trim(), list));
    }

    send(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    const status = err?.status ?? 500;
    send(res, status, { error: err?.message ?? String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`Jev judge app: http://localhost:${PORT}`);
  if (MOCK) console.log("JEV_MOCK=1: API は呼ばず、ランダムな結果を返します。");
  else if (!process.env.TYPESAFE_API_KEY)
    console.log("警告: TYPESAFE_API_KEY が未設定です。.env を用意してください。");
});
