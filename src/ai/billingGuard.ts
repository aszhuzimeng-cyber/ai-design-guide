const STORAGE_KEY = "designtool.deepseek.billingBlocked";
const BURST_UNTIL_KEY = "designtool.deepseek.burstUntil";
const DAILY_DATE_KEY = "designtool.deepseek.dailyDate";
const DAILY_COUNT_KEY = "designtool.deepseek.dailyCount";
const RECENT_REQUESTS_KEY = "designtool.deepseek.recentRequests";
const LAST_REQUEST_AT_KEY = "designtool.deepseek.lastRequestAt";

export const BILLING_BLOCKED_MESSAGE =
  "DeepSeek 余额不足，已停止一切 API 调用。请充值后在需要时点击「重新生成」。";

export const BURST_BLOCKED_MESSAGE =
  "短时间内 AI 请求过多，已自动熔断约 5 分钟以保护账户。请稍后再试，或充值后点击「重新生成」解锁。";

const BURST_WINDOW_MS = 60_000;
const BURST_MAX_REQUESTS = 24;
const BURST_LOCK_MS = 2 * 60_000;
const REQUEST_COOLDOWN_MS = 800;

let requestInflight = false;

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
}

function removeStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function dailyRequestLimit() {
  const raw = import.meta.env.VITE_AI_DAILY_REQUEST_LIMIT?.trim();
  if (!raw || raw === "0" || raw === "unlimited") return Number.POSITIVE_INFINITY;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.POSITIVE_INFINITY;
}

function readDailyCount() {
  const date = readStorage(DAILY_DATE_KEY);
  const count = Number(readStorage(DAILY_COUNT_KEY) ?? "0");
  if (date !== todayKey()) return 0;
  return Number.isFinite(count) ? count : 0;
}

function readRecentRequestTimes() {
  const raw = readStorage(RECENT_REQUESTS_KEY);
  if (!raw) return [] as number[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  } catch {
    return [];
  }
}

export function getSpendGuardSnapshot() {
  const burstUntil = Number(readStorage(BURST_UNTIL_KEY) ?? "0");
  return {
    billingBlocked: isBillingBlockedGlobally(),
    burstBlocked: burstUntil > Date.now(),
    burstUntil,
    dailyCount: readDailyCount(),
    dailyLimit: dailyRequestLimit(),
    requestInflight,
  };
}

export function isBillingBlockedGlobally() {
  return readStorage(STORAGE_KEY) === "1";
}

export function isBurstBlockedGlobally() {
  const burstUntil = Number(readStorage(BURST_UNTIL_KEY) ?? "0");
  return burstUntil > Date.now();
}

export function isSpendBlockedGlobally() {
  const limit = dailyRequestLimit();
  const dailyBlocked = Number.isFinite(limit) && readDailyCount() >= limit;
  return isBillingBlockedGlobally() || isBurstBlockedGlobally() || dailyBlocked;
}

export function setBillingBlockedGlobally() {
  writeStorage(STORAGE_KEY, "1");
}

function setBurstBlockedGlobally() {
  writeStorage(BURST_UNTIL_KEY, String(Date.now() + BURST_LOCK_MS));
}

export function clearBillingBlockedGlobally() {
  removeStorage(STORAGE_KEY);
}

export function clearBurstBlockedGlobally() {
  removeStorage(BURST_UNTIL_KEY);
}

/** 用户点击「重新生成」或新提交需求时：解除余额/熔断锁，并清零当日计数 */
export function clearSpendLocksForRetry() {
  clearBillingBlockedGlobally();
  clearBurstBlockedGlobally();
  removeStorage(LAST_REQUEST_AT_KEY);
  removeStorage(RECENT_REQUESTS_KEY);
  removeStorage(DAILY_DATE_KEY);
  removeStorage(DAILY_COUNT_KEY);
}

function dailyLimitMessage() {
  const limit = dailyRequestLimit();
  return `今日 AI 请求已达上限（${limit} 次），已停止调用以保护账户。明日自动恢复。`;
}

function registerSpendAttempt(now: number) {
  const limit = dailyRequestLimit();
  const dailyDate = readStorage(DAILY_DATE_KEY);
  const nextDailyCount = (dailyDate === todayKey() ? readDailyCount() : 0) + 1;
  writeStorage(DAILY_DATE_KEY, todayKey());
  writeStorage(DAILY_COUNT_KEY, String(nextDailyCount));

  const recent = readRecentRequestTimes().filter((time) => now - time < BURST_WINDOW_MS);
  recent.push(now);
  writeStorage(RECENT_REQUESTS_KEY, JSON.stringify(recent));
  writeStorage(LAST_REQUEST_AT_KEY, String(now));

  if (recent.length > BURST_MAX_REQUESTS) {
    setBurstBlockedGlobally();
    throw new Error(BURST_BLOCKED_MESSAGE);
  }

  if (Number.isFinite(limit) && nextDailyCount > limit) {
    throw new Error(dailyLimitMessage());
  }
}

/** 在发起任何 DeepSeek 请求前调用；不通过则直接拒绝，不访问网络 */
export function assertCanSpendDeepSeek() {
  if (isBillingBlockedGlobally()) {
    throw new Error(BILLING_BLOCKED_MESSAGE);
  }
  if (isBurstBlockedGlobally()) {
    throw new Error(BURST_BLOCKED_MESSAGE);
  }

  const dailyCount = readDailyCount();
  const limit = dailyRequestLimit();
  if (Number.isFinite(limit) && dailyCount >= limit) {
    throw new Error(dailyLimitMessage());
  }

  const lastRequestAt = Number(readStorage(LAST_REQUEST_AT_KEY) ?? "0");
  if (lastRequestAt > 0 && Date.now() - lastRequestAt < REQUEST_COOLDOWN_MS) {
    throw new Error("AI 请求过于密集，请稍候 1～2 秒再试。");
  }

  if (requestInflight) {
    throw new Error("已有 AI 请求进行中，请等待完成后再试。");
  }
}

export function markBillingErrorFromResponse(status: number, body: string) {
  if (status === 402 || /insufficient balance/i.test(body)) {
    setBillingBlockedGlobally();
  }
}

export async function guardedDeepSeekFetch(
  execute: () => Promise<Response>,
): Promise<Response> {
  assertCanSpendDeepSeek();
  requestInflight = true;
  const now = Date.now();
  try {
    registerSpendAttempt(now);
    return await execute();
  } finally {
    requestInflight = false;
  }
}
