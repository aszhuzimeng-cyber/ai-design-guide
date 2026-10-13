/**
 * 直连 DeepSeek，模拟精简后的信息组织一步（与 prepareMechanism 对齐）
 */
import { existsSync, readFileSync } from "node:fs";

const envPath = existsSync(".env") ? ".env" : ".env.local";
const env = readFileSync(envPath, "utf8");
const apiKey = env.match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) {
  console.error(`Missing DEEPSEEK_API_KEY in ${envPath}`);
  process.exit(1);
}

const apiBaseUrl = env.match(/^DEEPSEEK_API_BASE_URL=(.+)$/m)?.[1]?.trim() ?? "https://api.deepseek.com";
const model = env.match(/^VITE_DEEPSEEK_FAST_MODEL=(.+)$/m)?.[1]?.trim() || "deepseek-chat";

const system = `你是网页设计方案助手。只输出 JSON：recommendedPlanId + synthesizedPlans（恰好3个）。
每个方案仅含 id/title/structure(4-6个中文短模块名)/summary/reason。禁止长字段。`;

const user = JSON.stringify({
  rawInput: "做一个高端护肤品电商首页，米白色调，不要太促销",
  intentSummary: "B2C · 垂直聚焦 · 品质体验",
  inputConstraints: ["米白色调", "不要太促销"],
  plans: [],
  plansEmpty: true,
});

const endpoint = new URL("/chat/completions", apiBaseUrl);
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 8192,
    temperature: 0.32,
    thinking: { type: "disabled" },
  }),
});

const text = await response.text();
console.log("status", response.status);
if (!response.ok) {
  console.log(text);
  process.exit(response.status === 402 ? 2 : 1);
}

const payload = JSON.parse(text);
const content = payload.choices?.[0]?.message?.content ?? "";
console.log("content chars", content.length);
console.log("usage", payload.usage);
const start = content.indexOf("{");
const end = content.lastIndexOf("}");
try {
  const parsed = JSON.parse(content.slice(start, end + 1));
  console.log("plans", parsed.synthesizedPlans?.length ?? 0, "recommended", parsed.recommendedPlanId ?? "-");
  if ((parsed.synthesizedPlans?.length ?? 0) < 3) process.exit(1);
} catch (error) {
  console.error("JSON parse failed:", error.message);
  console.log(content.slice(0, 500), "...");
  process.exit(1);
}
