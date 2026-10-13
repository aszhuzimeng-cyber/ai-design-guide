import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `export { mergeVisualGrammarSelections, normalizeSynthesizedPlans } from "./src/ai/pipeline.ts";
      export { resolvePlanShell } from "./src/pageLayoutArchitecture.ts";
      export { formatVisualOptionReason } from "./src/ai/visualGrammarNormalize.ts";`,
    resolveDir: process.cwd(),
    sourcefile: "verify-design-options-entry.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  define: { "import.meta.env": "{}" },
});
const loaded = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  createRequire(import.meta.url), loaded, loaded.exports,
);
const functions = loaded.exports;

const selection = (prefix) => ({
  optionId: `${prefix}-1`,
  recommendedOptionId: `${prefix}-1`,
  optionIds: [`${prefix}-1`, `${prefix}-2`, `${prefix}-3`],
  options: [1, 2, 3].map((index) => ({ id: `${prefix}-${index}`, label: `${prefix}${index}` })),
  source: "recommended",
});
const ai = { font: selection("ai-font"), card: selection("ai-card"), density: selection("ai-density") };
const reference = {
  color: selection("reference-color"),
  font: selection("reference-font"),
  card: selection("reference-card"),
  density: selection("reference-density"),
};
const merged = functions.mergeVisualGrammarSelections(ai, reference);
assert.equal(merged.color.optionId, "reference-color-1");
assert.equal(merged.font.optionId, "ai-font-1");
assert.equal(merged.card.optionId, "ai-card-1");
assert.equal(merged.density.optionId, "ai-density-1");
assert.equal(
  functions.mergeVisualGrammarSelections({ ...ai, card: { ...ai.card, options: ai.card.options.slice(0, 2) } }, reference).card.optionId,
  "reference-card-1",
);

const plans = [
  {
    id: "search",
    title: "先搜索，再看结果",
    structure: ["搜索入口", "分类筛选", "结果列表", "详情预览", "收藏入口"],
    summary: "围绕寻找内容展开。",
    reason: "适合目标明确的访问者。",
    pageFrame: { shell: "单栏" },
    firstScreen: { layout: "搜索框与热门分类上下排列", priority: "搜索入口", secondary: "热门分类" },
    decisionPath: ["输入关键词", "筛选结果", "查看详情"],
  },
  {
    id: "workbench",
    title: "先看任务，再进入编辑",
    structure: ["任务入口", "最近项目", "编辑工作台", "资源面板", "导出操作"],
    summary: "让常用任务直接可达。",
    reason: "适合高频操作的用户。",
    pageFrame: { shell: "侧栏工作台" },
    firstScreen: { layout: "左侧任务导航，右侧最近项目", priority: "任务入口", secondary: "最近项目" },
    decisionPath: ["选择任务", "继续编辑", "导出结果"],
  },
  {
    id: "insights",
    title: "先看数据，再定位异常",
    structure: ["数据概览", "指标趋势", "异常提醒", "明细表格", "行动建议"],
    summary: "从指标快速进入明细。",
    reason: "适合需要持续监控的团队。",
    pageFrame: { shell: "单栏" },
    firstScreen: { layout: "关键指标置顶，趋势紧随其后", priority: "数据概览", secondary: "指标趋势" },
    decisionPath: ["识别指标变化", "定位异常", "采取行动"],
  },
];
const normalized = functions.normalizeSynthesizedPlans(plans);
assert.deepEqual(normalized.map((plan) => plan.structure), plans.map((plan) => plan.structure));
assert.deepEqual(normalized.map((plan) => plan.firstScreen.priority), plans.map((plan) => plan.firstScreen.priority));
assert.deepEqual(normalized.map((plan) => functions.resolvePlanShell(plan)), ["landing", "sidebar", "landing"]);
assert.deepEqual(normalized.map((plan) => plan.decisionPath), plans.map((plan) => plan.decisionPath));

assert.match(functions.formatVisualOptionReason("font", { id: "font", label: "无衬线体", reason: "无衬线正文便于扫读数据" }), /扫读数据/);
assert.match(functions.formatVisualOptionReason("density", { id: "density", label: "疏松留白", reason: "留白让长段说明更易分组" }), /长段说明/);

console.log("design options checks passed");
