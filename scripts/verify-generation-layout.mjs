import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: "export { finalizeGeneratedHtml } from './src/ai/html.ts'; export { buildLayoutShellStyleBlock, resolvePlanShell, resolvePlanPageLayout } from './src/pageLayoutArchitecture.ts'; export { compileVisualCssContract } from './src/ai/generationBindings.ts';",
    resolveDir: process.cwd(),
    sourcefile: "verify-generation-layout-entry.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "GeneratedHtml",
  platform: "browser",
});

const source = `<!doctype html><html><head><style>
  .page-shell{width:94%;max-width:1200px;margin-inline:auto}
  .hero{display:flex;gap:24px}
  .hero>.content{width:60%}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
  @media(max-width:640px){.hero{display:block}.hero>.content{width:100%}.grid{grid-template-columns:1fr}}
</style></head><body><main class="page-shell"><section class="hero"><div class="content"><h1>测试页面</h1></div><aside>辅助信息</aside></section><section><div class="grid"><article>甲</article><article>乙</article></div></section></main></body></html>`;
const bindings = `<style data-designtool-layout-shell>.page-shell{max-width:1200px}</style>
<style data-designtool-binding>:root{--grid-gap:16px}</style>`;

const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(({ source, bindings }) =>
    window.GeneratedHtml.finalizeGeneratedHtml(source, { enforcedStyles: bindings }),
  { source, bindings });
  await page.setContent(result);

  assert.equal(await page.locator("style[data-designtool-layout-shell]").count(), 1);
  assert.equal(await page.locator("style[data-designtool-binding]").count(), 1);
  assert.equal(await page.locator("body.dt-has-sidebar").count(), 0);

  const desktop = await page.evaluate(() => ({
    heroDisplay: getComputedStyle(document.querySelector(".hero")).display,
    contentWidth: document.querySelector(".hero>.content").getBoundingClientRect().width,
    mainWidth: document.querySelector("main").getBoundingClientRect().width,
    columns: getComputedStyle(document.querySelector(".grid")).gridTemplateColumns.split(" ").length,
  }));
  assert.equal(desktop.heroDisplay, "flex");
  assert.equal(desktop.columns, 2);
  assert.ok(desktop.contentWidth < desktop.mainWidth * 0.7);

  await page.setViewportSize({ width: 390, height: 800 });
  const mobile = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector(".grid")).gridTemplateColumns.split(" ").length,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(mobile.columns, 1);
  assert.ok(mobile.documentWidth <= 390);

  const splitSource = `<!doctype html><html><head><style>.page-shell{width:94%;max-width:1200px;margin:auto}section{min-height:120px;padding:16px}</style></head><body><main class="page-shell"><div class="page-layout-split"><div class="page-main"><section id="hero">首屏</section><section id="detail">详细内容</section><section id="proof">案例证明</section></div><aside class="page-sidebar"><section id="action">咨询入口</section></aside></div></main></body></html>`;
  const splitHtml = await page.evaluate((source) => {
    const splitStyles = window.GeneratedHtml.buildLayoutShellStyleBlock({ shell: "split" });
    return window.GeneratedHtml.finalizeGeneratedHtml(source, { enforcedStyles: splitStyles });
  }, splitSource);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.setContent(splitHtml);
  const splitDesktop = await page.evaluate(() => ({
    hero: document.querySelector("#hero").getBoundingClientRect(),
    detail: document.querySelector("#detail").getBoundingClientRect(),
    action: document.querySelector("#action").getBoundingClientRect(),
  }));
  assert.ok(splitDesktop.detail.width > splitDesktop.hero.width * 1.8);
  assert.ok(splitDesktop.action.x > splitDesktop.hero.x + splitDesktop.hero.width);
  await page.setViewportSize({ width: 390, height: 800 });
  const splitMobile = await page.evaluate(() => ({
    hero: document.querySelector("#hero").getBoundingClientRect(),
    detail: document.querySelector("#detail").getBoundingClientRect(),
    action: document.querySelector("#action").getBoundingClientRect(),
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(splitMobile.detail.width <= 390);
  assert.ok(splitMobile.action.y > splitMobile.detail.y);
  assert.ok(splitMobile.scrollWidth <= 390);

  const bentoSource = `<!doctype html><html><head><style>.page-bento-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:16px}.page-bento-grid>.first{grid-column:span 7;height:100px}.page-bento-grid>.second{grid-column:span 5;height:300px}.page-bento-grid>.third{grid-column:span 12;height:100px}</style></head><body><main><div class="page-bento-grid"><section class="first">第一块</section><section class="second">第二块</section><section class="third">第三块</section></div></main></body></html>`;
  const bentoHtml = await page.evaluate((source) => {
    const bentoStyles = window.GeneratedHtml.buildLayoutShellStyleBlock({ shell: "bento" });
    return window.GeneratedHtml.finalizeGeneratedHtml(source, { enforcedStyles: bentoStyles });
  }, bentoSource);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.setContent(bentoHtml);
  const bentoDesktop = await page.evaluate(() => ({
    first: document.querySelector(".first").getBoundingClientRect(),
    second: document.querySelector(".second").getBoundingClientRect(),
    third: document.querySelector(".third").getBoundingClientRect(),
  }));
  assert.ok(bentoDesktop.first.width > bentoDesktop.second.width);
  assert.ok(bentoDesktop.third.width > bentoDesktop.first.width);
  assert.ok(bentoDesktop.first.height < bentoDesktop.second.height);
  await page.setViewportSize({ width: 390, height: 800 });
  const bentoMobile = await page.evaluate(() => ({
    first: document.querySelector(".first").getBoundingClientRect(),
    second: document.querySelector(".second").getBoundingClientRect(),
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(bentoMobile.second.y >= bentoMobile.first.bottom);
  assert.ok(bentoMobile.scrollWidth <= 390);

  const colorStyles = await page.evaluate(() => window.GeneratedHtml.compileVisualCssContract([{
    id: "color",
    title: "色彩",
    selectedOptionId: "light",
    options: [{ id: "light", label: "米白", tokenHints: { primary: "#d6c6b5", background: "#f8f7f5", text: "#1f2937" } }],
  }]).styleSnippets.join("\n"));
  assert.match(colorStyles, /\.btn-primary[^}]*color:#1f2937/);
  assert.match(colorStyles, /h1,h2\{color:#1f2937\}/);

  const inferredShells = await page.evaluate(() => ({
    editorial: window.GeneratedHtml.resolvePlanShell({ id: "story", title: "品牌故事", summary: "顺序讲述品牌", structure: ["首屏", "理念", "历程"] }),
    unsuitableSplit: window.GeneratedHtml.resolvePlanPageLayout({ id: "split-story", title: "双栏故事", summary: "先讲故事", structure: ["首屏", "理念", "流程"], previewWireframe: { frame: "split-columns" } }).shell,
  }));
  assert.equal(inferredShells.editorial, "landing");
  assert.equal(inferredShells.unsuitableSplit, "landing");

  if (process.argv.includes("--preview-last")) {
    const raw = await readFile(path.join(tmpdir(), "designtool-generation-e2e.html"), "utf8");
    const shell = /class="[^"]*\bpage-bento-grid\b/.test(raw) ? "bento" : /class="[^"]*\bpage-layout-split\b/.test(raw) ? "split" : "landing";
    const withoutOldShell = raw.replace(/<style\s+data-designtool-layout-shell[^>]*>[\s\S]*?<\/style>/i, "");
    const updated = await page.evaluate(({ source, shell }) => {
      const styles = window.GeneratedHtml.buildLayoutShellStyleBlock({ shell });
      return window.GeneratedHtml.finalizeGeneratedHtml(source, { enforcedStyles: styles });
    }, { source: withoutOldShell, shell });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(updated, { waitUntil: "domcontentloaded" });
    await page.screenshot({ path: path.join(tmpdir(), "designtool-generation-updated.png"), fullPage: true });
    console.log(`Replayed latest ${shell} page with current layout CSS.`);
  }
  console.log("Generated layout stays intact at desktop and mobile widths.");
} finally {
  await browser.close();
}
