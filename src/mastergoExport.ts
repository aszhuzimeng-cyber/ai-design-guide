import { resolveProjectPageLabel, slugifyPageLabel } from "./catalog";
import type { ProjectState } from "./types";

export const MASTERGO_DESIGN_DIR = ".mastergo/design";

export type MasterGoCanvasImportResult = {
  relativePath: string;
  canvasRelativePath?: string;
  absolutePath?: string;
  canvasAbsolutePath?: string;
  canvas: {
    ok: boolean;
    drewOnCanvas?: boolean;
    mode?: "sync" | "create";
    status?: string;
    targetNodeId?: string;
    documentId?: string;
    documentPageId?: string;
    documentPageName?: string;
    message?: string;
    warning?: string;
    error?: string;
  };
};

export type MasterGoWorkspaceExportResult = MasterGoCanvasImportResult;

export function resolveMasterGoExportFilename(project: ProjectState) {
  return slugifyPageLabel(resolveProjectPageLabel(project)) || "generated-page";
}

export function buildMasterGoSyncPrompt(relativePath: string) {
  return `把 ${relativePath} 全量同步覆盖到当前页面根节点。`;
}

function formatFetchError(error: unknown) {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return [
      "无法连接开发服务器（Failed to fetch）。",
      "请确认：1) 已在本机运行 npm run dev；",
      "2) 用 http://127.0.0.1:5173 打开页面（不要用 file:// 或纯静态 dist）；",
      "3) 若刚改过配置，重启一次 dev 服务。",
    ].join("");
  }
  return error instanceof Error ? error.message : "导入画布失败。";
}

export async function importHtmlToMasterGoCanvas(project: ProjectState): Promise<MasterGoCanvasImportResult> {
  const html = project.ai?.generatedHtml?.trim();
  if (!html) {
    throw new Error("没有可导入的页面 HTML，请先生成页面。");
  }

  let response: Response;
  try {
    response = await fetch("/api/mastergo/import-to-canvas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        filename: resolveMasterGoExportFilename(project),
      }),
    });
  } catch (error) {
    throw new Error(formatFetchError(error));
  }

  let payload: MasterGoCanvasImportResult & { error?: string; hint?: string } = {
    relativePath: "",
    canvas: { ok: false },
  };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = { relativePath: "", canvas: { ok: false } };
  }

  if (!response.ok) {
    throw new Error(payload.error || payload.hint || payload.canvas?.error || "导入 MasterGo 画布失败。");
  }

  if (!payload.relativePath) {
    throw new Error("导入响应不完整，请确认开发服务已启动。");
  }

  if (!payload.canvas?.ok) {
    throw new Error(
      payload.canvas?.error ||
        "HTML 已写入工作区，但未能推送到 MasterGo。请确认桌面客户端已打开设计文件。",
    );
  }

  if (payload.canvas.drewOnCanvas === false) {
    throw new Error(
      payload.canvas.warning ||
        payload.canvas.message ||
        "MasterGo 已响应但未在画布生成节点。请打开 MasterGo 桌面客户端当前设计文件后重试。",
    );
  }

  return payload;
}

/** @deprecated 使用 importHtmlToMasterGoCanvas */
export async function exportHtmlToMasterGoWorkspace(project: ProjectState) {
  return importHtmlToMasterGoCanvas(project);
}
