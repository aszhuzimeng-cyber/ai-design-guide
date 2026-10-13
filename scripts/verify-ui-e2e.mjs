/**
 * 浏览器 E2E：首页 → 意图 → 机制 → 生成（含真实 AI 调用）
 * 超时较长，用于本地验证整条链路。
 */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PROMPT = "做一个高端护肤品电商首页，米白色调，不要太促销";
const DEV_URL = "http://127.0.0.1:5173";
const TIMEOUT = 180_000;

async function waitForText(page, text, timeout = 60_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
}

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(TIMEOUT);

  console.log("1) 打开首页...");
  await page.goto(DEV_URL, { waitUntil: "networkidle" });
  await page.locator("textarea").fill(PROMPT);
  await page.locator("button.primary.confirm").click();
  await page.locator(".intent-stage").waitFor({ state: "visible", timeout: 15_000 });
  console.log("   OK 进入意图页");

  console.log("2) 等待第 1 次 AI（意图分析）...");
  await page
    .locator(".recognition-node")
    .waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForFunction(
    () => {
      const node = document.querySelector(".recognition-node");
      return node && !node.classList.contains("is-analyzing");
    },
    { timeout: 60_000 },
  );
  const recognition = await page.locator(".recognition-node p").first().innerText();
  if (recognition.includes("分析失败") && !recognition.includes("已识别")) {
    throw new Error(`brief failed: ${recognition}`);
  }
  console.log("   OK", recognition.slice(0, 40));

  console.log("3) 确认意图选项...");
  for (let round = 0; round < 8; round += 1) {
    const next = page.locator("button.primary.next-step");
    if (await next.isVisible().catch(() => false)) break;
    const option = page.locator(".question-group:not(.has-selection):not(.is-readonly) .option-node:not(.option-add-node)").first();
    if (await option.isVisible().catch(() => false)) {
      await option.click();
      await page.waitForTimeout(400);
    } else {
      await page.waitForTimeout(500);
    }
  }
  if (!(await page.locator("button.primary.next-step").isVisible())) {
    throw new Error("intent options not complete");
  }
  await page.locator("button.primary.next-step").click();
  await page.locator(".mechanism-stage").waitFor({ state: "visible", timeout: 15_000 });
  console.log("   OK 进入表达机制");

  console.log("4) 等待第 2 次 AI + 选择架构卡...");
  await page.waitForTimeout(2000);
  const plan = page.locator(".info-card.choice-card:not(.is-placeholder)").first();
  await plan.waitFor({ state: "visible", timeout: 30_000 });
  await plan.click();
  await page.locator(".visual-panel").waitFor({ state: "visible", timeout: 15_000 });
  console.log("   OK 已选架构卡，视觉区展开");

  console.log("5) 选择视觉选项...");
  for (let round = 0; round < 12; round += 1) {
    const generate = page.getByRole("button", { name: "生成页面", exact: true });
    if (await generate.isVisible().catch(() => false)) break;
    const visual = page.locator(".visual-dimension:not(:has(.visual-option.selected)) .visual-option-node").first();
    if (await visual.isVisible().catch(() => false)) {
      await visual.click();
      await page.waitForTimeout(350);
    } else {
      await page.waitForTimeout(1000);
    }
  }
  const generateBtn = page.getByRole("button", { name: "生成页面", exact: true });
  if (!(await generateBtn.isVisible())) {
    const state = await page.evaluate(() => ({
      dimensions: Array.from(document.querySelectorAll(".visual-dimension")).map((node) => ({
        options: node.querySelectorAll(".visual-option-node").length,
        selected: node.querySelectorAll(".visual-option.selected").length,
      })),
      buttons: Array.from(document.querySelectorAll("button")).map((button) => button.textContent?.trim()).filter(Boolean).slice(-12),
      status: document.querySelector(".visual-panel")?.textContent?.slice(0, 300),
    }));
    throw new Error(`visual options not complete: ${JSON.stringify(state)}`);
  }
  await generateBtn.click();
  await page.locator(".generate-workspace").waitFor({ state: "visible", timeout: 15_000 });
  console.log("   OK 进入生成页");

  console.log("6) 等待第 3 次 AI 生成 HTML...");
  await page.waitForFunction(
    () => {
      const frame = document.querySelector("iframe.generated-preview-frame");
      const retry = document.querySelector(".generate-empty-state button");
      const loading = document.querySelector(".generate-empty-state.is-loading");
      return Boolean(frame) || Boolean(retry && !loading);
    },
    { timeout: 120_000 },
  );

  const hasFrame = await page.locator("iframe.generated-preview-frame").count();
  if (hasFrame > 0) {
    const srcdoc = await page.locator("iframe.generated-preview-frame").getAttribute("srcdoc");
    if (!srcdoc || !srcdoc.toLowerCase().includes("<html")) throw new Error("iframe html empty");
    console.log("   OK 生成 HTML", srcdoc.slice(0, 80).replace(/\s+/g, " "));
    const htmlPath = path.join(tmpdir(), "designtool-generation-e2e.html");
    await writeFile(htmlPath, srcdoc, "utf8");
    const layoutPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await layoutPage.setContent(srcdoc, { waitUntil: "domcontentloaded" });
    for (const width of [1440, 390]) {
      await layoutPage.setViewportSize({ width, height: 900 });
      const metrics = await layoutPage.evaluate(() => ({
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        sections: document.querySelectorAll("main section").length,
        bodyClass: document.body.className,
        splitWidthRatio: (() => {
          const shell = document.querySelector(".page-layout-split");
          const laterSection = shell?.querySelector(".page-main>section:nth-child(2)");
          return shell && laterSection ? laterSection.getBoundingClientRect().width / shell.getBoundingClientRect().width : null;
        })(),
      }));
      console.log(`   layout ${width}px:`, JSON.stringify(metrics));
      if (metrics.sections < 3) throw new Error(`generated page has too few sections at ${width}px`);
      if (metrics.scrollWidth > metrics.viewport + 2) throw new Error(`generated page overflows at ${width}px`);
      if (width === 1440 && metrics.splitWidthRatio != null && metrics.splitWidthRatio < 0.9) {
        throw new Error("split layout traps later sections in a half-width column");
      }
      if (width === 1440) {
        await layoutPage.screenshot({ path: path.join(tmpdir(), "designtool-generation-e2e.png"), fullPage: true });
      }
    }
    await layoutPage.close();
  } else {
    const err = await page.locator(".generate-empty-state small").innerText().catch(() => "");
    throw new Error(`generate failed: ${err}`);
  }

  await browser.close();
  console.log("\nE2E PASSED");
}

main().catch(async (error) => {
  console.error("E2E FAIL:", error.message);
  process.exit(1);
});
