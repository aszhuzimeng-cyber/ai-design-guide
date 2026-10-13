import { prepareHtmlForMasterGoCanvas } from "./lib/mastergo-local.mjs";
import fs from "node:fs";

const root = process.cwd().replace(/\\/g, "/");
const simple = `<main data-name="page-root" class="flex flex-col justify-start items-stretch w-[1440px] min-h-[1024px] bg-[#FFFFFF] p-[40px] gap-[24px]">
<div data-name="hero" class="flex flex-col justify-start items-start w-full gap-[16px]">
<span data-name="title" class="text-[32px] leading-[40px] font-[700] text-[#111827]">Probe Simple</span>
</div>
</main>`;

const cases = [
  ["inline-code", { code: simple, projectDir: root }],
  ["file-protocol", { projectDir: root, filePath: `${root}/.mastergo/design/_probe-simple.html` }],
];

fs.writeFileSync(".mastergo/design/_probe-simple.html", simple, "utf8");

for (const [label, body] of cases) {
  const t0 = Date.now();
  const response = await fetch("http://127.0.0.1:50678/api/createPage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  console.log("---", label, response.status, `${Date.now() - t0}ms`);
  console.log("node-id:", /data-node-id/.test(text));
  console.log("nodeInfo len:", /"nodeInfo":\[(.*?)\]/.exec(text)?.[1]?.length ?? "n/a");
  console.log(text.slice(0, 300));
}
