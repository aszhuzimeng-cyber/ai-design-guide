/**
 * 验证：Vite 代理 + 三次 AI 调用链（轻量 token）
 */
import { existsSync, readFileSync } from "node:fs";

const envPath = existsSync(".env") ? ".env" : ".env.local";
const env = readFileSync(envPath, "utf8");
const apiKey = env.match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) {
  console.error(`FAIL: missing DEEPSEEK_API_KEY in ${envPath}`);
  process.exit(1);
}

const DEV_URL = "http://127.0.0.1:5173";
const MODEL = env.match(/^VITE_DEEPSEEK_MODEL=(.+)$/m)?.[1]?.trim() ?? "deepseek-v4-pro";

async function chat(messages, maxTokens = 800) {
  const response = await fetch(`${DEV_URL}/api/deepseek/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      thinking: { type: "disabled" },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const payload = JSON.parse(text);
  return payload.choices?.[0]?.message?.content?.trim() ?? "";
}

function extractJson(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? content.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return JSON.parse(candidate.slice(start, end + 1));
}

async function main() {
  console.log("1) dev server...");
  const home = await fetch(DEV_URL);
  if (!home.ok) throw new Error(`dev server ${home.status}`);
  console.log("   OK", home.status);

  console.log("2) call 1 brief...");
  const briefRaw = await chat(
    [
      {
        role: "system",
        content:
          "你是需求分析助手。只输出 JSON：{ industryId, recommendedOptionIds:{targetUser,coverage,valueProposition}, constraintOptionIds, inputConstraints[] }",
      },
      {
        role: "user",
        content: JSON.stringify({
          rawInput: "做一个高端护肤品电商首页，米白色调，不要太促销",
          availableIndustries: ["ecommerce", "school"],
        }),
      },
    ],
    600,
  );
  const brief = extractJson(briefRaw);
  if (!brief.industryId) throw new Error("brief missing industryId");
  console.log("   OK", brief.industryId, brief.inputConstraints?.length ?? 0, "constraints");

  console.log("3) call 2 mechanism...");
  const mechRaw = await chat(
    [
      {
        role: "system",
        content:
          '只输出 JSON：{ recommendedPlanId, visualSelections:{color:{optionId,source}}, visualExtended }',
      },
      {
        role: "user",
        content: JSON.stringify({
          rawInput: "做一个高端护肤品电商首页，米白色调，不要太促销",
          intentSummary: "B2C / 垂直聚焦 / 品质体验",
          inputConstraints: brief.inputConstraints ?? [],
          plans: [{ id: "ec_B2C_focus_diff_1", title: "测试方案", structure: ["首屏", "商品区"], summary: "品质向" }],
        }),
      },
    ],
    800,
  );
  const mech = extractJson(mechRaw);
  console.log("   OK", mech.recommendedPlanId ?? "no-plan-id", mech.visualSelections?.color?.optionId ?? "no-color");

  console.log("4) call 3 generate (short html)...");
  const html = await chat(
    [
      {
        role: "system",
        content: "输出最小 HTML 文档 <!doctype html><html><body><h1>护肤品首页</h1></body></html>，不要 markdown",
      },
      {
        role: "user",
        content: JSON.stringify({ rawInput: "高端护肤品电商首页，米白色调", visualGrammar: "低饱和浅色" }),
      },
    ],
    1200,
  );
  if (!html.toLowerCase().includes("<html")) throw new Error("generate did not return html");
  console.log("   OK", html.slice(0, 60).replace(/\s+/g, " "), "...");

  console.log("\nALL PASSED");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exit(1);
});
