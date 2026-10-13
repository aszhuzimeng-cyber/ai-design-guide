import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importHtmlToMasterGoCanvas } from "./lib/mastergo-local.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function printUsage() {
  console.log(`用法:
  node scripts/mastergo-import-to-canvas.mjs <html文件路径>
  node scripts/mastergo-import-to-canvas.mjs --latest

环境变量:
  MASTERGO_SERVER_URL  默认 http://127.0.0.1:50678

导入前请在 MasterGo 桌面客户端选中目标页面根 Frame。`);
}

async function resolveLatestDesignFile() {
  const designDir = path.join(rootDir, ".mastergo", "design");
  let entries = [];
  try {
    entries = await fs.readdir(designDir);
  } catch {
    throw new Error("未找到 .mastergo/design/ 目录。请先在 designtool 生成页并点击「导入画布」。");
  }

  const htmlFiles = entries.filter((name) => name.toLowerCase().endsWith(".html"));
  if (!htmlFiles.length) {
    throw new Error(".mastergo/design/ 下没有 HTML 文件。请先在 designtool 点击「导入画布」导出。");
  }

  const ranked = await Promise.all(
    htmlFiles.map(async (name) => {
      const fullPath = path.join(designDir, name);
      const stat = await fs.stat(fullPath);
      return { fullPath, mtimeMs: stat.mtimeMs };
    }),
  );
  ranked.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return ranked[0].fullPath;
}

const arg = process.argv[2];
if (!arg || arg === "-h" || arg === "--help") {
  printUsage();
  process.exit(arg ? 0 : 1);
}

const filePath = arg === "--latest" ? await resolveLatestDesignFile() : path.resolve(process.cwd(), arg);
const html = await fs.readFile(filePath, "utf8");
const result = await importHtmlToMasterGoCanvas(html, {
  projectDir: rootDir.replace(/\\/g, "/"),
  filePath: filePath.replace(/\\/g, "/"),
});

if (!result.ok) {
  console.error("❌ 导入失败");
  console.error(result.error || "未知错误");
  if (result.fallbackError) console.error("备用 createPage 也失败:", result.fallbackError);
  process.exit(1);
}

console.log("✅ 已发送到 MasterGo 画布");
console.log(`- 模式: ${result.mode}`);
if (result.warning) console.log(`- 提示: ${result.warning}`);
if (result.data?.targetNodeId) console.log(`- 节点 ID: ${result.data.targetNodeId}`);
if (result.data?.documentPageName) console.log(`- 页面: ${result.data.documentPageName}`);
if (result.data?.status) console.log(`- 状态: ${result.data.status}`);
console.log(`- 源文件: ${filePath}`);
