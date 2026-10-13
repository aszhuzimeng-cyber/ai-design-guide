import type { InfoPlan } from "./types";
import { getPlanContentModules, inferPlacement } from "./infoArchitecture";
import { withUniversalLayoutBalanceRules } from "./generationLayoutBalance";

export type PageShellMode = "landing" | "split" | "sidebar" | "bento";

export type PlanLayoutModule = {
  id: string;
  label: string;
};

export type PlanPageLayout = {
  shell: PageShellMode;
  template: string;
  complex: boolean;
  hero: PlanLayoutModule | null;
  mainModules: PlanLayoutModule[];
  sidebarModules: PlanLayoutModule[];
  moduleOrder: string[];
};

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPageFrameShell(plan: InfoPlan | undefined) {
  const frame = plan?.pageFrame;
  if (!frame || typeof frame !== "object") return "";
  return readText((frame as Record<string, unknown>).shell);
}

export function resolvePlanTemplate(plan: InfoPlan) {
  const preview = plan.previewWireframe ?? {};
  const hero = readText(preview.hero).toLowerCase();
  const body = readText(preview.body).toLowerCase();
  const frame = readText(preview.frame).toLowerCase();
  if (/demo-first|product-demo|interactive-demo/.test(frame) || /product-demo|feature-showcase|interactive/.test(hero)) return "product";
  if (/bento|story-bento|masonry/.test(frame) || /story-bento|bento/.test(body)) return "editorial";
  if (/split-proof|split-columns/.test(frame)) return "trust";
  if (/media-dominant|gallery-then|large-media/.test(hero) || /gallery-then|gallery/.test(body)) return "gallery";
  if (/proof-first|claim-proof|proof-service/.test(hero) || /proof-service|proof-first/.test(body)) return "trust";
  if (/structured-copy|copy-proof|structured-hero/.test(hero) || /copy-proof-action/.test(body)) return "conversion";

  const haystack = [
    plan.id,
    plan.title,
    plan.summary,
    plan.pageArchitecture,
    plan.layoutRhythm,
    readText(preview.hero),
    readText(preview.body),
    ...plan.structure,
  ]
    .join(" ")
    .toLowerCase();

  if (/work|gallery|portfolio|作品|案例|showcase|masonry/.test(haystack)) return "gallery";
  if (/trust|proof|可信|证明|资质|背书/.test(haystack)) return "trust";
  if (/product|demo|screen|产品|界面|截图|工作流/.test(haystack)) return "product";
  if (/conversion|offer|cta|报名|咨询|购买|转化/.test(haystack)) return "conversion";
  if (/editorial|longform|story|观点|叙事|阅读/.test(haystack)) return "editorial";
  if (/hub|search|category|内容|资源|分类|搜索/.test(haystack)) return "hub";
  if (/tool|workbench|toolbar|控件|操作|预览/.test(haystack)) return "tool";
  if (/compare|comparison|对比|选择|套餐/.test(haystack)) return "compare";
  if (/pricing|price|价格|权益/.test(haystack)) return "pricing";
  if (/event|活动|时间线/.test(haystack)) return "event";
  if (/课程|培训|招生|美术|教育/.test(haystack) && /proof|信任|评价|家长/.test(haystack)) return "trust";
  if (/课程|培训|招生|美术|教育/.test(haystack) && /作品|案例|展示/.test(haystack)) return "gallery";
  if (/助手|陪伴|对话|聊天|ai|情感/.test(haystack) && /演示|预览|效果|功能/.test(haystack)) return "product";
  if (/助手|陪伴|对话|聊天|ai|情感/.test(haystack) && /故事|叙事|价值|情感/.test(haystack)) return "editorial";
  return "balanced";
}

export const PLAN_SHELL_LABELS: Record<PageShellMode, string> = {
  landing: "单栏",
  split: "双栏",
  bento: "宫格",
  sidebar: "侧栏工作台",
};

export function describePlanShell(plan: InfoPlan) {
  return PLAN_SHELL_LABELS[resolvePlanShell(plan)];
}

function planExplicitlyRequestsSplit(plan: InfoPlan) {
  const frame = readText(plan.previewWireframe?.frame).toLowerCase();
  const pageShell = readPageFrameShell(plan).toLowerCase();
  const pageArch = readText(plan.pageArchitecture).toLowerCase();
  const flow = readText(plan.contentFlow?.pattern).toLowerCase();
  const firstScreen =
    plan.firstScreen && typeof plan.firstScreen === "object"
      ? readText((plan.firstScreen as Record<string, unknown>).layout).toLowerCase()
      : "";
  return (
    /split-proof|split-columns|split-landing/.test(frame) ||
    /双栏|分栏|左右分栏|并列分栏|主张与背书并列|并列/.test(pageShell) ||
    /双栏|分栏|左右分栏|并列/.test(pageArch) ||
    /split-proof|split-columns|proof-first/.test(flow) ||
    /并列|分栏|双栏/.test(firstScreen)
  );
}

export function resolvePlanShell(plan: InfoPlan, template = resolvePlanTemplate(plan)): PageShellMode {
  const frame = readText(plan.previewWireframe?.frame).toLowerCase();
  const shell = readPageFrameShell(plan).toLowerCase();
  if (shell === "单栏" || shell === "landing") return "landing";
  if (shell === "双栏" || shell === "split") return "split";
  if (shell === "宫格" || shell === "bento") return "bento";
  if (shell === "侧栏工作台" || shell === "sidebar") return "sidebar";
  const flow = readText(plan.contentFlow?.pattern).toLowerCase();
  const corpus = `${frame} ${shell} ${flow} ${readText(plan.previewWireframe?.hero)} ${readText(plan.previewWireframe?.body)}`;
  if (/sidebar|workbench|tool|侧栏|控制台|hub/.test(corpus) || template === "tool" || template === "hub") return "sidebar";
  if (/bento|宫格|不规则|story-bento|masonry/.test(corpus)) return "bento";
  if (planExplicitlyRequestsSplit(plan)) return "split";
  return "landing";
}

export function isComplexPlanTemplate(template: string) {
  return template === "hub" || template === "tool";
}

/** 与右侧「功能内容」及低保真预览同源 */
export function derivePlanModuleSlots(plan: InfoPlan): PlanLayoutModule[] {
  const modules = getPlanContentModules(plan);
  if (modules.length) {
    return modules.map((module) => ({ id: module.id, label: module.label })).filter((slot) => slot.label);
  }
  if (plan.structure.length) {
    return plan.structure.map((label, index) => ({ id: `${plan.id}-structure-${index}`, label }));
  }
  return (plan.sections ?? [])
    .map((item, index) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const label = readText(record.content) || readText(record.title) || readText(record.role);
      return label ? { id: `${plan.id}-section-${index}`, label } : null;
    })
    .filter((slot): slot is PlanLayoutModule => Boolean(slot));
}

function modulePlacement(module: PlanLayoutModule, plan: InfoPlan) {
  const fromPlan = plan.contentModules?.find((item) => item.id === module.id);
  const raw = readText(fromPlan?.placement);
  if (raw && !/^section-\d+$/i.test(raw) && /^(proof|showcase|process|pricing|action|identity|content)$/.test(raw)) {
    return raw;
  }
  return inferPlacement(module.label);
}


function isHeavySidebarContent(placement: string, label: string) {
  if (placement === "showcase" || placement === "proof" || placement === "process" || placement === "content" || placement === "identity") {
    return true;
  }
  return /项目|特色|教学|课程|方法|流程|步骤|案例|作品|评价|家长|师资|优势|服务|介绍|展示|证明|小班|驱动|互动/.test(label);
}

function isSidebarEligible(placement: string, label: string) {
  if (isHeavySidebarContent(placement, label)) return false;
  if (placement === "action" || placement === "pricing") return true;
  return /保障|承诺|咨询|购买|联系|预约|立即|cta|价格|套餐|报价|合作|报名/.test(label);
}

/** 双栏按语义分配模块：侧栏只放轻量 CTA/价格类，其余进主栏；无侧栏候选时等分两半 */
function balanceSplitModules(rest: PlanLayoutModule[], plan: InfoPlan) {
  if (rest.length < 2) {
    return { mainModules: rest, sidebarModules: [] as PlanLayoutModule[] };
  }

  const sidebar: PlanLayoutModule[] = [];
  const main: PlanLayoutModule[] = [];

  for (const module of rest) {
    const placement = modulePlacement(module, plan);
    if (isSidebarEligible(placement, module.label)) sidebar.push(module);
    else main.push(module);
  }

  if (!sidebar.length) {
    return { mainModules: rest, sidebarModules: [] };
  }

  for (let index = sidebar.length - 1; index >= 0; index -= 1) {
    const module = sidebar[index];
    const placement = modulePlacement(module, plan);
    if (isHeavySidebarContent(placement, module.label)) {
      main.unshift(...sidebar.splice(index, 1));
    }
  }

  if (!sidebar.length) {
    return { mainModules: rest, sidebarModules: [] };
  }

  return { mainModules: main, sidebarModules: sidebar };
}

/** 没有适合侧栏的短模块时降为单栏，避免把长内容硬塞进半幅侧栏。 */
function ensureSplitSidebarModules(rest: PlanLayoutModule[], plan: InfoPlan, main: PlanLayoutModule[], sidebar: PlanLayoutModule[]) {
  if (sidebar.length || !planExplicitlyRequestsSplit(plan) || rest.length < 2) {
    return { mainModules: main.length ? main : rest, sidebarModules: sidebar };
  }

  for (let index = rest.length - 1; index >= 0; index -= 1) {
    const module = rest[index];
    const placement = modulePlacement(module, plan);
    if (isSidebarEligible(placement, module.label)) {
      return {
        mainModules: rest.filter((item) => item.id !== module.id),
        sidebarModules: [module],
      };
    }
  }

  return { mainModules: rest, sidebarModules: [] };
}

export function resolvePlanPageLayout(plan: InfoPlan): PlanPageLayout {
  const template = resolvePlanTemplate(plan);
  const shell = resolvePlanShell(plan, template);
  const complex = shell === "sidebar" || isComplexPlanTemplate(template);
  const slots = derivePlanModuleSlots(plan);
  const moduleOrder = slots.map((slot) => slot.label);

  if (!slots.length) {
    return { shell, template, complex, hero: null, mainModules: [], sidebarModules: [], moduleOrder };
  }

  const [first, ...rest] = slots;
  const hero = { id: first.id, label: first.label };

  if (shell === "bento") {
    return { shell, template, complex: false, hero, mainModules: rest, sidebarModules: [], moduleOrder };
  }

  if (shell === "split" && !complex) {
    const balanced = balanceSplitModules(rest, plan);
    const { mainModules, sidebarModules } = ensureSplitSidebarModules(rest, plan, balanced.mainModules, balanced.sidebarModules);
    if (!sidebarModules.length) {
      return {
        shell: "landing",
        template,
        complex: false,
        hero,
        mainModules: rest,
        sidebarModules: [],
        moduleOrder,
      };
    }
    return {
      shell: "split",
      template,
      complex: false,
      hero,
      mainModules,
      sidebarModules,
      moduleOrder,
    };
  }

  if (shell === "sidebar" && complex) {
    return { shell, template, complex: true, hero, mainModules: rest, sidebarModules: [], moduleOrder };
  }

  return { shell, template, complex: false, hero, mainModules: rest, sidebarModules: [], moduleOrder };
}

function joinLabels(modules: PlanLayoutModule[]) {
  return modules.map((item) => item.label).filter(Boolean).join("、");
}

export function buildLayoutShellMandatoryRules(layout: PlanPageLayout) {
  const scope = `页面壳层·${layout.shell}`;
  const heroLabel = layout.hero?.label;
  const mainLabels = [heroLabel, ...layout.mainModules.map((item) => item.label)].filter(Boolean).join("、");

  if (layout.shell === "split" && layout.sidebarModules.length) {
    return [
      `【${scope}】必须与信息组织预览一致：使用双栏主体。HTML 结构为 <main class="page-shell"><div class="page-layout-split"><div class="page-main">…</div><aside class="page-sidebar">…</aside></div></main>。`,
      `【${scope}】.page-main 依次放：${mainLabels}；.page-sidebar 放：${joinLabels(layout.sidebarModules)}。桌面端只让首屏与侧栏并排；.page-main 的后续 section 全宽排列，避免右侧大片空白。侧栏仅放 CTA/价格/保障等短模块。`,
      `【${scope}】窄屏下 .page-layout-split 改为单栏，侧栏模块叠在主栏之后。`,
    ];
  }

  if (layout.shell === "sidebar" && layout.complex) {
    return [
      `【${scope}】必须与预览一致：左侧固定导航 + 右侧主内容。body 加 class dt-has-sidebar；<aside class="sidebar"> 为导航壳层，<main> 内纵向排列全部内容模块。`,
      `【${scope}】主内容区按顺序包含：${mainLabels}。禁止首屏大图。`,
    ];
  }

  if (layout.shell === "bento") {
    return [
      `【${scope}】必须与预览一致：首屏 section 全宽；其余模块放入 <div class="page-bento-grid">，用不规则宫格排布。`,
      `【${scope}】宫格模块顺序：${joinLabels(layout.mainModules)}；每个模块仍是独立 <section>。`,
    ];
  }

  return [
    `【${scope}】单栏长滚动：所有模块在 <main> 内按 structureLock 顺序纵向排列。`,
    mainLabels ? `【${scope}】模块顺序：${moduleOrderText(layout)}。` : "",
  ].filter(Boolean);
}

function moduleOrderText(layout: PlanPageLayout) {
  return layout.moduleOrder.join(" → ");
}

export function buildLayoutShellStyleBlock(layout: PlanPageLayout) {
  const rules: string[] = [];

  if (layout.shell === "split") {
    rules.push(
      ".page-layout-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(24px,3vw,40px);align-items:start}",
      ".page-layout-split>.page-main{display:contents}",
      ".page-layout-split>.page-main>section:first-child{grid-column:1;grid-row:1}",
      ".page-layout-split>.page-main>section:not(:first-child){grid-column:1/-1}",
      ".page-layout-split>.page-sidebar{grid-column:2;grid-row:1;display:flex;flex-direction:column;gap:clamp(16px,2vw,24px);min-width:0;width:100%;position:static;align-self:start}",
      ".page-layout-split>.page-main>section,.page-layout-split>.page-sidebar>section{min-width:0;width:100%}",
      ".page-layout-split section :is(.grid,.cards,.features,.card-grid)>*{min-width:0}",
      ".page-layout-split section>*{min-width:0;max-width:100%}",
      "@media (max-width:899px){.page-layout-split{grid-template-columns:1fr}.page-layout-split>.page-main>section:first-child,.page-layout-split>.page-main>section:not(:first-child),.page-layout-split>.page-sidebar{grid-column:1;grid-row:auto}}",
    );
  }

  if (layout.shell === "bento") {
    rules.push(
      ":where(.page-bento-grid){display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:clamp(16px,2.4vw,24px)}",
      ".page-bento-grid{align-items:start}",
      ":where(.page-bento-grid>section){grid-column:span 12;min-width:0}",
      "@media (max-width:899px){.page-bento-grid{grid-template-columns:1fr!important}.page-bento-grid>section{grid-column:1/-1!important}}",
    );
  }

  if (layout.shell === "sidebar" && layout.complex) {
    rules.push(
      "body.dt-has-sidebar{display:grid;grid-template-columns:minmax(220px,260px) minmax(0,1fr);gap:0;min-height:100vh}",
      "body.dt-has-sidebar>.sidebar,body.dt-has-sidebar>aside.sidebar{position:sticky;top:0;height:100vh;overflow:auto;border-right:1px solid color-mix(in srgb,currentColor 10%,transparent)}",
      "body.dt-has-sidebar>main{width:min(1120px,96%);margin-inline:auto;padding-inline:clamp(16px,3vw,32px)}",
      "@media (max-width:899px){body.dt-has-sidebar{grid-template-columns:1fr}body.dt-has-sidebar>.sidebar,body.dt-has-sidebar>aside.sidebar{position:static;height:auto}}",
    );
  }

  if (!rules.length) return "";
  return `<style data-designtool-layout-shell>\n${rules.join("\n")}\n</style>`;
}

export function buildLayoutGuidanceRules(layout: PlanPageLayout) {
  const base = withUniversalLayoutBalanceRules([
    "structureLock / pageModules 顺序是硬约束，不得增删调序",
    "每个模块都必须渲染为独立 <section>，并落到 layoutShell 指定分区",
    "layoutShell 与信息组织预览一致：每条方案可有不同壳层（单栏 / 双栏 / 宫格），以当前选中方案的 layoutShell 为准，禁止把单栏方案改成双栏或反之",
    "首屏重心、导航方式、作品/案例/产品呈现方式属于 selectedInfoArchitecture，不得被视觉语言覆盖",
    "如果 componentPatterns 中包含 carousel/masonry/grid/sidebar/toolbar 等结构，必须在页面里体现对应架构或给出等价布局",
    "页面要饱满：主内容区宽度约 92%~96%（max-width 1120~1280px），避免中间窄卡片 + 两侧大面积空白",
    "图标统一用 Lucide 线性图标（data-lucide），禁止 emoji",
    "所有文案横排，禁止 writing-mode 竖排与窄高竖条卡片",
    "相邻 section 的版式不得完全重复；卡片 grid、分栏叙事、横向证明带、步骤时间线、案例详情、对比表至少混用两类",
    "卡片只用于重复项或对比项；叙事/方法/品牌说明区不要全部包进白色卡片",
    "内容 section 的数量严格等于 structureLock 的模块数；首模块就是首屏，不要另加 hero",
    "输出前对照 generationGuidance.polishChecklist 与 qualityChecks 自查精致度",
  ]);

  if (layout.shell === "split") {
    base.splice(
      2,
      0,
      "双栏布局：主栏放叙事/特色/流程/案例/评价等长内容，侧栏仅放 CTA/价格/保障等短模块；禁止把教学特色、家长评价、流程列表塞进窄侧栏",
      "桌面端仅首屏与侧栏并排，主栏后续 section 恢复全宽；不要把整页后续内容限制在半幅列中",
      "首屏仍在 .page-main 顶部，侧栏不放首屏大图",
    );
  } else if (layout.shell === "sidebar" && layout.complex) {
    base.splice(2, 0, "工作台布局：左侧导航 + 右侧内容；禁止首屏大图，用紧凑页头 + 功能卡片 grid");
  } else if (layout.shell === "bento") {
    base.splice(2, 0, "宫格布局：首屏全宽，其余模块在 page-bento-grid 内不规则排布");
  } else {
    base.splice(2, 0, "单栏布局：structure 中每个模块在 <main> 内按顺序纵向排列，不能只画首屏");
    base.splice(5, 0, "首屏以标题+说明+CTA 为主；配图辅助且单图高度≤320px，禁止全宽巨型头图");
  }

  return base;
}
