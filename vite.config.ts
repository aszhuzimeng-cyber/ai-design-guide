import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { importHtmlToMasterGoCanvas, masterGoResultHasCanvasNodes, readMasterGoNodeId } from "./scripts/lib/mastergo-local.mjs";

const DEFAULT_DEEPSEEK_API_BASE_URL = "https://api.deepseek.com";
const MASTERGO_DESIGN_DIR = ".mastergo/design";

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function getNetworkErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: String(error), code: undefined };
  }

  const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause;
  return {
    message: cause?.message || error.message,
    code: cause?.code,
  };
}

function createDeepSeekMiddleware(apiKey: string | undefined, apiBaseUrl: string) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (!request.url?.startsWith("/api/deepseek")) {
      next();
      return;
    }

    if (!apiKey) {
      sendJson(response, 503, {
        error: "DeepSeek API key is not configured",
        hint: "Set DEEPSEEK_API_KEY in .env, then restart the dev server.",
      });
      return;
    }

    try {
      const upstreamPath = request.url.replace(/^\/api\/deepseek/, "") || "/";
      const upstreamUrl = new URL(upstreamPath, apiBaseUrl);
      const method = request.method ?? "GET";
      const hasBody = method !== "GET" && method !== "HEAD";
      const body = hasBody ? await readRequestBody(request) : undefined;

      const upstreamResponse = await fetch(upstreamUrl, {
        method,
        headers: {
          Accept: request.headers.accept ?? "application/json",
          "Content-Type": request.headers["content-type"] ?? "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });

      response.statusCode = upstreamResponse.status;
      response.statusMessage = upstreamResponse.statusText;
      const contentType = upstreamResponse.headers.get("content-type");
      if (contentType) response.setHeader("Content-Type", contentType);

      const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
      response.end(responseBody);
    } catch (error) {
      const details = getNetworkErrorDetails(error);
      sendJson(response, 502, {
        error: "DeepSeek API proxy request failed",
        message: details.message,
        code: details.code,
        hint: "Check network access to DeepSeek, DNS/proxy settings, or set DEEPSEEK_API_BASE_URL to a reachable compatible endpoint.",
      });
    }
  };
}

function sanitizeMasterGoFilename(name: unknown) {
  const raw = typeof name === "string" ? name.trim() : "";
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 80) || "generated-page";
}

async function writeMasterGoDesignFile(rootDir: string, html: string, filenameInput: unknown) {
  const filename = sanitizeMasterGoFilename(filenameInput);
  const designDir = path.join(rootDir, MASTERGO_DESIGN_DIR);
  await fs.mkdir(designDir, { recursive: true });
  const filePath = path.join(designDir, `${filename}.html`);
  await fs.writeFile(filePath, html, "utf8");
  const relativePath = `${MASTERGO_DESIGN_DIR}/${filename}.html`.replace(/\\/g, "/");
  const canvasRelativePath = `${MASTERGO_DESIGN_DIR}/${filename}.canvas.html`.replace(/\\/g, "/");
  const canvasFilePath = path.join(designDir, `${filename}.canvas.html`);
  return { filePath, canvasFilePath, relativePath, canvasRelativePath, filename: `${filename}.html` };
}

function createMasterGoExportMiddleware(rootDir: string) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = request.url ?? "";
    const isExport = url.startsWith("/api/mastergo/export");
    const isImport = url.startsWith("/api/mastergo/import-to-canvas");
    if (!isExport && !isImport) {
      next();
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const body = await readRequestBody(request);
      const payload = JSON.parse(body.toString("utf8")) as {
        html?: string;
        filename?: string;
        targetNodeId?: string;
        documentId?: string;
        documentPageId?: string;
      };
      const html = typeof payload.html === "string" ? payload.html.trim() : "";
      if (!html) {
        sendJson(response, 400, {
          error: "Missing html",
          hint: "Generate a page before importing to MasterGo canvas.",
        });
        return;
      }

      const { filePath, canvasFilePath, relativePath, canvasRelativePath, filename } =
        await writeMasterGoDesignFile(rootDir, html, payload.filename);

      if (isExport) {
        sendJson(response, 200, { ok: true, relativePath, filename });
        return;
      }

      const canvasResult = await importHtmlToMasterGoCanvas(html, {
        targetNodeId: payload.targetNodeId,
        documentId: payload.documentId,
        documentPageId: payload.documentPageId,
        projectDir: rootDir,
        filePath,
      });

      if (!canvasResult.ok) {
        sendJson(response, 502, {
          error: "MasterGo canvas import failed",
          relativePath,
          absolutePath: filePath,
          canvas: {
            ok: false,
            error: canvasResult.error,
            fallbackError: canvasResult.fallbackError,
          },
          hint: "HTML 已写入工作区。请确认 MasterGo 桌面客户端已打开设计文件，且本机服务 http://127.0.0.1:50678 可访问。",
        });
        return;
      }

      const data = canvasResult.data && typeof canvasResult.data === "object" ? canvasResult.data : {};
      const drewOnCanvas = masterGoResultHasCanvasNodes(data);
      const targetNodeId = readMasterGoNodeId(data);
      sendJson(response, 200, {
        ok: true,
        relativePath,
        canvasRelativePath,
        absolutePath: filePath,
        canvasAbsolutePath: canvasFilePath,
        filename,
        canvas: {
          ok: true,
          drewOnCanvas,
          mode: canvasResult.mode,
          status: typeof data.status === "string" ? data.status : drewOnCanvas ? "created" : undefined,
          targetNodeId,
          documentId: typeof data.documentId === "string" ? data.documentId : undefined,
          documentPageId: typeof data.documentPageId === "string" ? data.documentPageId : undefined,
          documentPageName: typeof data.documentPageName === "string" ? data.documentPageName : undefined,
          message: drewOnCanvas
            ? canvasResult.mode === "create"
              ? "已在 MasterGo 画布生成页面节点，请在当前文件中查看新内容。"
              : "已将 HTML 同步到当前页面。"
            : "MasterGo 已接受请求，但未检测到画布节点。请打开桌面客户端后重试。",
          warning: canvasResult.warning,
        },
      });
    } catch (error) {
      sendJson(response, 500, {
        error: isImport ? "Failed to import MasterGo canvas" : "Failed to write MasterGo design file",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = env.DEEPSEEK_API_KEY;
  const apiBaseUrl = env.DEEPSEEK_API_BASE_URL || DEFAULT_DEEPSEEK_API_BASE_URL;
  const deepSeekMiddleware = createDeepSeekMiddleware(apiKey, apiBaseUrl);
  const masterGoExportMiddleware = createMasterGoExportMiddleware(process.cwd());

  return {
    plugins: [
      react(),
      {
        name: "app-dev-api-middleware",
        configureServer(server) {
          server.middlewares.use(deepSeekMiddleware);
          server.middlewares.use(masterGoExportMiddleware);
        },
        configurePreviewServer(server) {
          server.middlewares.use(deepSeekMiddleware);
          server.middlewares.use(masterGoExportMiddleware);
        },
      },
    ],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      // 局域网访问时 HMR WebSocket 走同一端口，避免远程浏览器连到 localhost
      hmr: {
        clientPort: 5173,
      },
      // 导入画布会写入 .mastergo/design/*.html；忽略该目录避免 Vite 整页重载打断 fetch
      watch: {
        ignored: ["**/.mastergo/**"],
      },
    },
    define: {
      __DEEPSEEK_CONFIGURED__: JSON.stringify(Boolean(apiKey)),
    },
  };
});
