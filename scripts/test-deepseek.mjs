import { existsSync, readFileSync } from "node:fs";

const envPath = existsSync(".env") ? ".env" : ".env.local";
const env = readFileSync(envPath, "utf8");
const apiKey = env.match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) {
  console.error(`Missing DEEPSEEK_API_KEY in ${envPath}`);
  process.exit(1);
}

const apiBaseUrl = env.match(/^DEEPSEEK_API_BASE_URL=(.+)$/m)?.[1]?.trim() ?? "https://api.deepseek.com";
const model = env.match(/^VITE_DEEPSEEK_MODEL=(.+)$/m)?.[1]?.trim() ?? "deepseek-v4-pro";
const endpoint = new URL("/chat/completions", apiBaseUrl);

try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      thinking: { type: "disabled" },
      max_tokens: 16,
      temperature: 0,
    }),
  });

  const text = await response.text();
  console.log("status", response.status);
  console.log(text);
} catch (error) {
  const cause = error instanceof Error ? error.cause : undefined;
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  const causeMessage =
    cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string"
      ? cause.message
      : undefined;
  const message = causeMessage || (error instanceof Error ? error.message : String(error));
  console.error("DeepSeek request failed:", message);
  if (code) console.error("code:", code);
  process.exit(1);
}
