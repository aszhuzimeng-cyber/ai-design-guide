import { prepareHtmlForMasterGoCanvas } from "./lib/mastergo-local.mjs";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd().replace(/\\/g, "/");
const src = path.join(root, ".mastergo/design/少儿编程培训学校官网.html");
const preparedPath = path.join(root, ".mastergo/design/_canvas-import.html");

const html = fs.readFileSync(src, "utf8");
const prepared = prepareHtmlForMasterGoCanvas(html);
fs.writeFileSync(preparedPath, prepared, "utf8");

const body = { code: prepared, projectDir: root, filePath: preparedPath.replace(/\\/g, "/") };
const t0 = Date.now();
const response = await fetch("http://127.0.0.1:50678/api/createPage", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(180_000),
});
const text = await response.text();
console.log("status", response.status, `${Date.now() - t0}ms`);
console.log("node-id", /data-node-id/.test(text));
console.log("success false", /"success":false/.test(text));
console.log(text.slice(0, 400));
console.log("...");
console.log(text.slice(-200));
