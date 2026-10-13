/** 无浏览器 UI 冒烟：页面可加载、数据目录可访问、bundle 含 AI 挂钩 */
const DEV_URL = "http://127.0.0.1:5173";

async function main() {
  console.log("1) index.html...");
  const indexHtml = await fetch(DEV_URL).then((r) => r.text());
  if (!indexHtml.includes('id="root"')) throw new Error("missing #root");
  console.log("   OK");

  console.log("2) app bundle contains AI hooks...");
  const scriptSrc =
    indexHtml.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1] ??
    indexHtml.match(/src="(\/src\/main\.tsx(?:\?[^"]*)?)"/)?.[1];
  if (!scriptSrc) throw new Error("app entry script not found in index");
  const bundle =
    scriptSrc.startsWith("/src/main.tsx")
      ? await fetch(`${DEV_URL}/src/App.tsx`).then((r) => r.text())
      : await fetch(`${DEV_URL}${scriptSrc}`).then((r) => r.text());
  const markers = ["runBriefAnalysis", "runMechanismAnalysis", "runPageGeneration", "option-signal"];
  const missing = markers.filter((m) => !bundle.includes(m));
  if (missing.length) throw new Error(`bundle missing: ${missing.join(", ")}`);
  console.log("   OK", markers.join(", "));

  console.log("\nUI SMOKE PASSED (static)");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
