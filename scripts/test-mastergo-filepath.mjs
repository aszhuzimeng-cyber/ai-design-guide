import { prepareHtmlForMasterGoCanvas } from "./lib/mastergo-local.mjs";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd().replace(/\\/g, "/");
const src = path.join(root, ".mastergo/design/少儿编程培训学校官网.html");
const preparedPath = path.join(root, ".mastergo/design/_canvas-import.html");

const html = fs.readFileSync(src, "utf8");
const prepared = prepareHtmlForMasterGoCanvas(html);
fs.writeFileSync(preparedPath, prepared, "utf8");
console.log("prepared bytes:", prepared.length);

for (const [label, filePath] of [
  ["raw file", src.replace(/\\/g, "/")],
  ["prepared file", preparedPath.replace(/\\/g, "/")],
]) {
  const t0 = Date.now();
  const response = await fetch("http://127.0.0.1:50678/api/createPage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectDir: root, filePath }),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  console.log(
    label,
    response.status,
    `${Date.now() - t0}ms`,
    "node-id:",
    /data-node-id/.test(text),
    "failed:",
    /"success":false/.test(text),
  );
  console.log(text.slice(0, 240));
  console.log();
}
