const mgCode = `<main data-name="page-root" class="flex flex-col justify-start items-stretch w-[1440px] min-h-[1024px] bg-[#FFFFFF] p-[40px] gap-[24px]">
<div data-name="hero" class="flex flex-col justify-start items-start w-full gap-[16px]">
<span data-name="title" class="text-[32px] leading-[40px] font-[700] text-[#111827]">Test</span>
</div>
</main>`;

const root = process.cwd().replace(/\\/g, "/");
const filePath = `${root}/.mastergo/design/test.html`;

const payloads = [
  ["createPage code-only", "/api/createPage", { code: mgCode }],
  ["createPage code+paths", "/api/createPage", { code: mgCode, projectDir: root, filePath }],
  ["createPage paths-only", "/api/createPage", { projectDir: root, filePath }],
  ["syncToDesign code+paths", "/api/syncToDesign", { code: mgCode, projectDir: root, filePath }],
];

for (const [label, path, body] of payloads) {
  const t0 = Date.now();
  try {
    const response = await fetch(`http://127.0.0.1:50678${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    console.log("---", label, response.status, `${Date.now() - t0}ms`);
    console.log(text.slice(0, 800));
    console.log("has node-id:", /data-node-id/.test(text));
    console.log("status accepted:", /"status"\s*:\s*"accepted"/.test(text));
  } catch (error) {
    console.log("---", label, "ERR", error.message);
  }
}
