export type DeepSeekRole = "system" | "user" | "assistant";

export type DeepSeekMessage = {
  role: DeepSeekRole;
  content: string;
};

export type DeepSeekThinkingMode = "enabled" | "disabled";

export type DeepSeekChatOptions = {
  messages: DeepSeekMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  thinking?: DeepSeekThinkingMode;
  reasoningEffort?: "high" | "max";
  stream?: boolean;
  onChunk?: (delta: string, accumulated: string) => void;
  signal?: AbortSignal;
};

export type DeepSeekChatResult = {
  content: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw: unknown;
};

import {
  assertCanSpendDeepSeek,
  BILLING_BLOCKED_MESSAGE,
  BURST_BLOCKED_MESSAGE,
  isBillingBlockedGlobally,
  isBurstBlockedGlobally,
  isSpendBlockedGlobally,
  markBillingErrorFromResponse,
  clearSpendLocksForRetry,
  guardedDeepSeekFetch,
} from "./billingGuard";

/** 主模型（页面生成默认沿用）；分析任务请用 getDeepSeekFastModel */
const DEFAULT_MODEL = import.meta.env.VITE_DEEPSEEK_MODEL ?? "deepseek-chat";
/** 分析类 JSON 任务固定默认 chat，不受 VITE_DEEPSEEK_MODEL 影响 */
const FAST_MODEL = import.meta.env.VITE_DEEPSEEK_FAST_MODEL?.trim() || "deepseek-chat";
/** 完整 HTML 生成；默认同 VITE_DEEPSEEK_MODEL */
const GENERATE_MODEL = import.meta.env.VITE_DEEPSEEK_GENERATE_MODEL?.trim() || DEFAULT_MODEL;

/** 开发环境走 Vite 代理，key 只在服务端注入，不进前端 bundle */
const API_BASE = import.meta.env.DEV ? "/api/deepseek" : "/api/deepseek";

export function getDeepSeekModel() {
  return DEFAULT_MODEL;
}

/** 意图 / 机制 / 视觉等 JSON 任务用的轻量模型，默认与主模型相同 */
export function getDeepSeekFastModel() {
  return FAST_MODEL;
}

export function getDeepSeekGenerateModel() {
  return GENERATE_MODEL;
}

export function isBillingErrorMessage(message: string) {
  return /余额不足|Insufficient Balance|402|已停止一切 API|请求过多|已自动熔断|已达上限|过于密集|已有 AI 请求/.test(message);
}

/** 默认关闭自动 AI；仅在 .env 设置 VITE_ENABLE_AUTO_AI=true 时才会后台自动调用 */
export function isAutoAiDisabled() {
  return import.meta.env.VITE_ENABLE_AUTO_AI !== "true";
}

export { isBillingBlockedGlobally, isBurstBlockedGlobally, isSpendBlockedGlobally, clearSpendLocksForRetry, BILLING_BLOCKED_MESSAGE, BURST_BLOCKED_MESSAGE, getSpendGuardSnapshot } from "./billingGuard";

export function isModuleOrchestrationAiEnabled() {
  return import.meta.env.VITE_AI_ORCHESTRATE_MODULES === "true";
}

export function isDeepSeekConfigured() {
  return __DEEPSEEK_CONFIGURED__;
}

export function formatDeepSeekError(status: number, body: string) {
  const trimmed = body.trim();
  let message = trimmed;
  try {
    const payload = JSON.parse(trimmed) as { error?: { message?: string } };
    if (payload.error?.message) message = payload.error.message;
  } catch {
    // keep raw body
  }

  if (status === 402 || /insufficient balance/i.test(message)) {
    return "DeepSeek 账户余额不足，请充值后点击「重新生成」";
  }
  if (status === 401) {
    return "DeepSeek API Key 无效或未授权，请检查 .env 中的 DEEPSEEK_API_KEY";
  }
  if (status === 429) {
    return "DeepSeek 请求过于频繁，请稍后再试";
  }
  if (message.length > 160) {
    return `DeepSeek API ${status}: ${message.slice(0, 160)}…`;
  }
  return `DeepSeek API ${status}: ${message}`;
}

type ChatCompletionPayload = {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

type StreamChunkPayload = {
  choices?: Array<{ delta?: { content?: string } }>;
};

async function readDeepSeekStream(
  response: Response,
  onChunk: (delta: string, accumulated: string) => void,
): Promise<{ content: string; model?: string }> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("DeepSeek API returned empty stream body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let model: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      let payload: StreamChunkPayload & { model?: string };
      try {
        payload = JSON.parse(data) as StreamChunkPayload & { model?: string };
      } catch {
        continue;
      }

      if (payload.model) model = payload.model;
      const delta = payload.choices?.[0]?.delta?.content ?? "";
      if (!delta) continue;

      accumulated += delta;
      onChunk(delta, accumulated);
    }
  }

  return { content: accumulated.trim(), model };
}

export async function deepseekChat(options: DeepSeekChatOptions): Promise<DeepSeekChatResult> {
  const {
    messages,
    model = DEFAULT_MODEL,
    temperature = 1,
    maxTokens,
    thinking = "disabled",
    reasoningEffort = "high",
    stream = Boolean(options.onChunk),
    onChunk,
    signal,
  } = options;

  const response = await guardedDeepSeekFetch(() =>
    fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
        stream,
        thinking: { type: thinking },
        ...(thinking === "enabled" ? { reasoning_effort: reasoningEffort } : {}),
      }),
    }),
  );

  if (!response.ok) {
    const errorText = await response.text();
    markBillingErrorFromResponse(response.status, errorText);
    throw new Error(formatDeepSeekError(response.status, errorText));
  }

  if (stream) {
    const streamed = await readDeepSeekStream(response, onChunk ?? (() => undefined));
    if (!streamed.content) {
      throw new Error("DeepSeek API returned empty content");
    }
    return {
      content: streamed.content,
      model: streamed.model ?? model,
      raw: streamed,
    };
  }

  const payload = (await response.json()) as ChatCompletionPayload;
  const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) {
    throw new Error("DeepSeek API returned empty content");
  }

  return {
    content,
    model: payload.model ?? model,
    usage: payload.usage
      ? {
          promptTokens: payload.usage.prompt_tokens,
          completionTokens: payload.usage.completion_tokens,
          totalTokens: payload.usage.total_tokens,
        }
      : undefined,
    raw: payload,
  };
}

/** 连通性探测，后续可在设置页或开发工具里调用 */
export async function pingDeepSeek() {
  return deepseekChat({
    messages: [{ role: "user", content: "Reply with exactly: OK" }],
    maxTokens: 16,
    thinking: "disabled",
    temperature: 0,
  });
}
