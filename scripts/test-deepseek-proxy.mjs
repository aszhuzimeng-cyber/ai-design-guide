const body = {
  model: "deepseek-chat",
  messages: [{ role: "user", content: "Reply with exactly: OK" }],
  thinking: { type: "disabled" },
  max_tokens: 16,
  temperature: 0,
};

try {
  const response = await fetch("http://127.0.0.1:5173/api/deepseek/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  console.log("proxy status", response.status);
  console.log(text.slice(0, 500));
} catch (error) {
  console.error("proxy failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
