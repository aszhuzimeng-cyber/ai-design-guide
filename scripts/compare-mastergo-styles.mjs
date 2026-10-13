import fs from "node:fs";
import { compareMasterGoStyleReport } from "./lib/mastergo-style-tokens.mjs";
import { convertHtmlToMasterGoProtocol } from "./lib/mastergo-protocol-export.mjs";

const file = process.argv[2] || ".mastergo/design/少儿编程培训学校官网.html";
const html = fs.readFileSync(file, "utf8");
const { tokens, checks } = compareMasterGoStyleReport(html);
const protocol = convertHtmlToMasterGoProtocol(html);

console.log("=== 生成页 → 画布 样式对照 ===\n");
for (const item of checks) {
  const flag = item.ok ? "✓" : "✗";
  console.log(`${flag} ${item.key}`);
  console.log(`   预览: ${item.preview}`);
  console.log(`   画布: ${item.canvas}${item.note ? ` (${item.note})` : ""}`);
  console.log();
}

console.log("=== 提取到的设计 token ===\n");
console.log(JSON.stringify(tokens, null, 2));
console.log("\n=== 协议输出 ===\n");
console.log(`字节: ${protocol.length}，含 <style>: ${protocol.includes("<style")}`);
