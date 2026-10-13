import {
  importHtmlToMasterGoCanvas,
  masterGoResultHasCanvasNodes,
  readMasterGoNodeId,
} from "./lib/mastergo-local.mjs";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd().replace(/\\/g, "/");
const designFile = path.join(rootDir, ".mastergo/design/少儿编程培训学校官网.html");
const fallbackFile = path.join(rootDir, ".mastergo/design/test.html");
const filePath = fs.existsSync(designFile) ? designFile : fallbackFile;

const html = fs.readFileSync(filePath, "utf8");
console.log("source:", filePath.replace(/\\/g, "/"), "bytes:", html.length);

const result = await importHtmlToMasterGoCanvas(html, {
  projectDir: rootDir,
  filePath: filePath.replace(/\\/g, "/"),
});

console.log("import ok:", result.ok);
console.log("mode:", result.mode);
console.log("has nodes:", masterGoResultHasCanvasNodes(result.data));
console.log("node id:", readMasterGoNodeId(result.data) ?? "");
if (result.warning) console.log("warning:", result.warning);
if (!result.ok) {
  console.error("error:", result.error);
  process.exit(1);
}
