/**
 * 将 designtool 完整 HTML 准备为 MasterGo 画布可提交的片段。
 * 与 scripts/lib/mastergo-local.mjs 保持逻辑一致（供前端/测试引用）。
 */
export function prepareHtmlForMasterGoCanvas(fullHtml: string): string {
  const trimmed = fullHtml.trim();
  if (!trimmed) return "";

  const headInner = trimmed.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  const bodyMatch = trimmed.match(/<body\b([^>]*)>([\s\S]*)<\/body>/i);
  const bodyAttrs = bodyMatch?.[1] ?? "";
  let bodyInner = bodyMatch?.[2]?.trim() ?? trimmed;

  const styleBlocks = [...collectStyleBlocks(headInner), ...collectStyleBlocks(bodyInner)];
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
export function extractCanvasHtml(fullHtml: string): string {
  return prepareHtmlForMasterGoCanvas(fullHtml);
}

function collectStyleBlocks(html: string) {
  return [...String(html || "").matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function stripStyleBlocks(html: string) {
  return String(html || "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

function stripScriptBlocks(html: string) {
  return String(html || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function readHtmlAttribute(attrs: string, name: string) {
  const match = String(attrs || "").match(new RegExp(`\\b${name}=(["'])(.*?)\\1`, "i"));
  return match?.[2]?.trim() ?? "";
}

function rewriteExportCss(css: string) {
  return String(css || "")
    .replace(/\bhtml\s*,\s*body\b/g, ".dt-mastergo-body")
    .replace(/\bhtml\b/g, ".dt-mastergo-body")
    .replace(/\bbody\b/g, (match, offset, str) =>
      str.slice(offset - 12, offset) === "dt-mastergo-" ? match : ".dt-mastergo-body",
    );
}
