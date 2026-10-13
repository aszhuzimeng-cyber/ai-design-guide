import fs from "node:fs/promises";
import { convertHtmlToMasterGoProtocol } from "./mastergo-protocol-export.mjs";

/**
 * 将 designtool 完整 HTML 准备为 MasterGo 画布可提交的片段。
 * 优先转为 MasterGo page-generate 协议（Tailwind + Flex）；旧版 <style> 包裹仅作兜底。
 */
export function prepareHtmlForMasterGoCanvas(fullHtml) {
  const trimmed = String(fullHtml || "").trim();
  if (!trimmed) return "";

  const protocol = convertHtmlToMasterGoProtocol(trimmed);
  if (protocol && protocol.length > 200) {
    return protocol;
  }

  const headInner = trimmed.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  const bodyMatch = trimmed.match(/<body\b([^>]*)>([\s\S]*)<\/body>/i);
  const bodyAttrs = bodyMatch?.[1] ?? "";
  let bodyInner = bodyMatch?.[2]?.trim() ?? trimmed;

  const styleBlocks = [
    ...collectStyleBlocks(headInner),
    ...collectStyleBlocks(bodyInner),
  ];
  bodyInner = stripStyleBlocks(bodyInner);
  bodyInner = stripScriptBlocks(bodyInner).trim();

  const bodyClass = readHtmlAttribute(bodyAttrs, "class");
  const combinedCss = rewriteExportCss(styleBlocks.join("\n\n"));

  const styleSection = combinedCss
    ? `<style data-designtool-export>\n${combinedCss}\n</style>`
    : "";

  return [
    `<main data-name="page-root" class="flex flex-col justify-start items-stretch w-[1440px] min-h-[1024px]">`,
    styleSection,
    `<div data-name="page-body" class="dt-mastergo-body${bodyClass ? ` ${bodyClass}` : ""}">`,
    bodyInner,
    `</div>`,
    `</main>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** @deprecated 使用 prepareHtmlForMasterGoCanvas */
export function extractCanvasHtml(fullHtml) {
  return prepareHtmlForMasterGoCanvas(fullHtml);
}

function collectStyleBlocks(html) {
  return [...String(html || "").matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
    (match) => match[1]?.trim() ?? "",
  ).filter(Boolean);
}

function stripStyleBlocks(html) {
  return String(html || "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

function stripScriptBlocks(html) {
  return String(html || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function readHtmlAttribute(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`\\b${name}=(["'])(.*?)\\1`, "i"));
  return match?.[2]?.trim() ?? "";
}

function rewriteExportCss(css) {
  return String(css || "")
    .replace(/\bhtml\s*,\s*body\b/g, ".dt-mastergo-body")
    .replace(/\bhtml\b/g, ".dt-mastergo-body")
    .replace(/\bbody\b/g, (match, offset, str) =>
      str.slice(offset - 12, offset) === "dt-mastergo-" ? match : ".dt-mastergo-body",
    );
}

const DEFAULT_MASTERGO_URL = "http://127.0.0.1:50678";
const DEFAULT_TIMEOUT_MS = 180_000;

export function resolveMasterGoServerUrl() {
  return (process.env.MASTERGO_SERVER_URL || DEFAULT_MASTERGO_URL).replace(/\/$/, "");
}

export async function postMasterGoApi(path, body, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${resolveMasterGoServerUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const message =
        (data && typeof data === "object" && (data.message || data.error)) ||
        text ||
        `HTTP ${response.status}`;
      return { ok: false, status: response.status, data, error: String(message) };
    }

    return { ok: true, status: response.status, data, error: null };
  } catch (error) {
    const message =
      error?.name === "AbortError"
        ? `连接 MasterGo 超时（${timeoutMs / 1000}s）。请确认桌面客户端已打开且已选中页面根节点。`
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, status: 0, data: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeFsPath(value) {
  return typeof value === "string" ? value.replace(/\\/g, "/") : undefined;
}

export function resolveMasterGoCanvasFilePath(designFilePath) {
  const normalized = normalizeFsPath(designFilePath);
  if (!normalized) return undefined;
  return normalized.replace(/\.html$/i, ".canvas.html");
}

/** 将画布片段落盘；MasterGo createPage 需要 code + filePath 同时存在才稳定落盘 */
export async function persistMasterGoCanvasArtifact(code, options = {}) {
  const projectDir = normalizeFsPath(options.projectDir);
  const designFilePath = normalizeFsPath(options.filePath);
  const canvasFilePath = resolveMasterGoCanvasFilePath(designFilePath);
  if (!canvasFilePath) {
    return { projectDir, designFilePath, canvasFilePath: designFilePath };
  }

  await fs.writeFile(canvasFilePath, code, "utf8");
  return { projectDir, designFilePath, canvasFilePath };
}

function buildMasterGoPayload(code, options = {}) {
  const payload = { code };
  if (options.targetNodeId) payload.targetNodeId = options.targetNodeId;
  if (options.documentId) payload.documentId = options.documentId;
  if (options.documentPageId) payload.documentPageId = options.documentPageId;
  const projectDir = normalizeFsPath(options.projectDir);
  const filePath = normalizeFsPath(options.canvasFilePath || options.filePath);
  if (projectDir) payload.projectDir = projectDir;
  if (filePath) payload.filePath = filePath;
  return payload;
}

function readNestedNodeId(value) {
  if (!value || typeof value !== "object") return undefined;
  for (const key of ["nodeId", "rootId", "targetNodeId", "id"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  }
  return undefined;
}

/** syncToDesign 常返回 accepted 但画布无节点；createPage 会带回 data-node-id / nodeId */
export function masterGoResultHasCanvasNodes(data) {
  if (!data || typeof data !== "object") return false;
  if (data.success === false) return false;
  if (typeof data.code === "string" && /data-node-id\s*=/.test(data.code)) return true;
  if (readNestedNodeId(data)) return true;
  if (Array.isArray(data.nodeInfo) && data.nodeInfo.length > 0) return true;
  if (data.success === true && (!data.code || !String(data.code).trim())) return false;
  return false;
}

export function readMasterGoNodeId(data) {
  if (!data || typeof data !== "object") return undefined;
  const direct =
    readNestedNodeId(data) ||
    (Array.isArray(data.nodeInfo) ? readNestedNodeId(data.nodeInfo[0]) : undefined);
  if (direct) return direct;
  if (typeof data.code === "string") {
    const match = data.code.match(/data-node-id\s*=\s*["']([^"']+)["']/i);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function formatCreatePageError(data, fallback) {
  if (data && typeof data === "object") {
    if (typeof data.error === "string" && data.error.trim()) return data.error.trim();
    if (data.success === false) {
      return "MasterGo 创建页面超时或失败。请保持桌面客户端打开当前设计文件后重试。";
    }
  }
  return fallback;
}

async function tryCreatePage(payload, options, warning) {
  const result = await postMasterGoApi("/api/createPage", payload, options);
  if (!result.ok) {
    return {
      ok: false,
      mode: "create",
      error: formatCreatePageError(result.data, result.error || "createPage 失败。"),
      data: result.data,
    };
  }
  if (!masterGoResultHasCanvasNodes(result.data)) {
    return {
      ok: false,
      mode: "create",
      error: formatCreatePageError(
        result.data,
        "MasterGo 已响应但未生成可见画布节点。请确认桌面客户端已打开设计文件，且本机服务 http://127.0.0.1:50678 可用。",
      ),
      data: result.data,
    };
  }
  return { ok: true, mode: "create", data: result.data, warning };
}

export async function importHtmlToMasterGoCanvas(html, options = {}) {
  const code = prepareHtmlForMasterGoCanvas(html);
  if (!code) {
    return { ok: false, error: "HTML 为空，无法导入画布。" };
  }

  const artifact = await persistMasterGoCanvasArtifact(code, options);
  const payload = buildMasterGoPayload(code, {
    ...options,
    projectDir: artifact.projectDir,
    canvasFilePath: artifact.canvasFilePath,
  });
  const wantsSync = options.mode === "sync" || Boolean(options.targetNodeId);

  if (wantsSync) {
    const syncResult = await postMasterGoApi("/api/syncToDesign", payload, options);
    if (syncResult.ok && masterGoResultHasCanvasNodes(syncResult.data)) {
      return { ok: true, mode: "sync", data: syncResult.data };
    }

    const syncWarning = syncResult.ok
      ? "全量同步仅返回 accepted，画布未出现节点，已改用 createPage 直接落盘。"
      : syncResult.error || "同步到画布失败。";
    const created = await tryCreatePage(payload, options, syncWarning);
    if (created.ok) return created;
    return {
      ok: false,
      mode: "sync",
      error: created.error || syncWarning,
      fallbackError: created.error,
      data: syncResult.data ?? created.data,
    };
  }

  const created = await tryCreatePage(payload, options);
  if (created.ok) return created;

  const syncResult = await postMasterGoApi("/api/syncToDesign", payload, options);
  if (syncResult.ok && masterGoResultHasCanvasNodes(syncResult.data)) {
    return {
      ok: true,
      mode: "sync",
      data: syncResult.data,
      warning: created.error || "createPage 未成功，已通过 syncToDesign 落盘。",
    };
  }

  return {
    ok: false,
    mode: "create",
    error: created.error || syncResult.error || "导入 MasterGo 画布失败。",
    fallbackError: syncResult.error,
    data: created.data ?? syncResult.data,
  };
}
