import { convertHtmlToMasterGoProtocol } from "./lib/mastergo-protocol-export.mjs";
import { importHtmlToMasterGoCanvas, readMasterGoNodeId } from "./lib/mastergo-local.mjs";
import fs from "node:fs";

const html = fs.readFileSync(".mastergo/design/少儿编程培训学校官网.html", "utf8");
const protocol = convertHtmlToMasterGoProtocol(html);
console.log("protocol bytes:", protocol.length);
console.log("uses style tag:", protocol.includes("<style"));
console.log("sample:\n", protocol.slice(0, 500));

const root = process.cwd().replace(/\\/g, "/");
const result = await importHtmlToMasterGoCanvas(html, {
  projectDir: root,
  filePath: `${root}/.mastergo/design/少儿编程培训学校官网.html`,
});
console.log("import ok:", result.ok, "node:", readMasterGoNodeId(result.data) ?? "");
