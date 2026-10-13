import { PLACEMENT_STAGE_LABELS } from "./constraintPlacement";
import { parseReferencePresetIdFromOptionId, resolveCohesiveVisualPreset } from "./designReference";
import { buildBindingContract } from "./generationBindings";
import { getProjectSpokenConstraints, SPOKEN_KIND_LABELS } from "./spokenConstraints";
import type { OptionItem, ProjectState, VisualId } from "../types";

type BindingContract = ReturnType<typeof buildBindingContract>;

function trimText(text: string | undefined, max = 96) {
  const value = text?.trim() ?? "";
  if (!value) return "";
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function readImplicitSummary(option: OptionItem) {
  const implicit = option.implicitDecisions;
  if (!implicit || typeof implicit !== "object" || Array.isArray(implicit)) return undefined;
  return Object.entries(implicit as Record<string, string>)
    .slice(0, 4)
    .map(([key, value]) => `${key}：${value}`)
    .join("；");
}

export function buildCompactVisualTone(
  selectedVisualOptions: Array<{ dimensionId: VisualId; option?: OptionItem }>,
) {
  return selectedVisualOptions
    .filter((item): item is { dimensionId: VisualId; option: OptionItem } => Boolean(item.option))
    .map(({ dimensionId, option }) => {
      const preview = option.previewRules ?? {};
      return {
        dimensionId,
        label: option.label,
        presetId: parseReferencePresetIdFromOptionId(option.id),
        designNote: trimText(option.reason ?? option.knowledge, 80),
        highlights: {
          ...(preview.density ? { density: String(preview.density) } : {}),
          ...(preview.cardStyle ? { cardStyle: String(preview.cardStyle) } : {}),
          ...(preview.hero ? { hero: String(preview.hero) } : {}),
          ...(preview.imageTreatment ? { imageTreatment: String(preview.imageTreatment) } : {}),
          ...(preview.typeScale ? { typeScale: String(preview.typeScale) } : {}),
        },
        implicitDecisions: readImplicitSummary(option),
        rules: (option.generationRules ?? []).slice(0, 2).map((rule) => trimText(rule, 120)),
      };
    });
}

export function buildConstraintLayers(project: ProjectState) {
  return getProjectSpokenConstraints(project).map((constraint) => ({
    kind: constraint.kind,
    placement: constraint.placement ? PLACEMENT_STAGE_LABELS[constraint.placement] : SPOKEN_KIND_LABELS[constraint.kind],
    text: constraint.text,
    inferredLabel: constraint.inferredLabel,
  }));
}

export function buildAestheticDirectives(input: {
  project: ProjectState;
  bindingContract: BindingContract;
  residualConstraints: string;
  intentSummary: string;
  planSummary?: string;
  planFirstScreen?: unknown;
  planStructure?: string[];
}) {
  const { project, bindingContract, residualConstraints, intentSummary, planSummary, planFirstScreen, planStructure } =
    input;
  const directives: string[] = [];

  if (intentSummary) {
    directives.push(`三维意图：${intentSummary}。文案、案例与 CTA 语气必须服务该组合，不得写成泛化企业官网腔。`);
  }

  for (const choice of bindingContract.intent) {
    const hint = trimText(choice.reason ?? choice.normalizedMeaning, 72);
    if (hint) directives.push(`「${choice.label}」：${hint}`);
  }

  if (planSummary) {
    directives.push(`信息组织摘要：${trimText(planSummary, 100)}`);
  }
  if (planStructure?.length) {
    directives.push(`模块顺序：${planStructure.join(" → ")}（每模块独立 section，顺序不可变）`);
  }
  if (planFirstScreen && typeof planFirstScreen === "object") {
    directives.push(`首屏重心：${trimText(JSON.stringify(planFirstScreen), 120)}`);
  }

  const cohesive = resolveCohesiveVisualPreset(project);
  if (cohesive) {
    directives.push(`视觉成套方案：${trimText(cohesive.label ?? cohesive.title, 40)}。色/字/卡/密度保持同一气质，禁止混搭第二套设计系统。`);
  }

  for (const selection of bindingContract.visual.selections) {
    directives.push(`用户已选${selection.dimensionTitle}「${selection.label}」：色值、字体栈、圆角与密度须与该项一致。`);
  }

  if (residualConstraints) {
    directives.push(`提示词残留要求：${trimText(residualConstraints, 140)}`);
  }

  const spoken = getProjectSpokenConstraints(project);
  for (const item of spoken.filter((c) => c.kind === "info" || c.placement === "infoArchitecture").slice(0, 2)) {
    directives.push(`信息相关原话：「${item.text}」${item.inferredLabel ? `（${item.inferredLabel}）` : ""}`);
  }
  for (const item of spoken.filter((c) => c.kind === "function" || c.placement === "functionModule").slice(0, 2)) {
    directives.push(`功能相关原话：「${item.text}」`);
  }
  for (const item of spoken.filter((c) => c.kind === "visual" || c.placement?.startsWith("visual")).slice(0, 2)) {
    directives.push(`视觉相关原话：「${item.text}」${item.inferredLabel ? `（${item.inferredLabel}）` : ""}`);
  }

  directives.push(
    "好看 = 在硬约束内做精致：层次清楚、配图真实克制、主按钮唯一聚焦、副信息降噪，不要线框草稿感。",
    "禁止默认蓝紫科技风、禁止无来源渐变背景，除非用户或所选配色明确要求。",
    "section 间距与卡片圆角/阴影服从所选密度与卡片方案；同一页只用一套色板与字阶。",
    "每页必须有一个视觉记忆点：首屏构图、主题图片裁切、数据证明带、作品拼贴或品牌色块只能选一两个重点，不要堆装饰。",
    "模块之间要有节奏差异：避免连续多个 section 都是三卡片 grid；至少安排叙事、证明、步骤、案例、对比或行动中的不同结构。",
    "卡片只用于重复项和可比较内容；品牌叙事、方法说明、证明材料应使用开放分栏、横向带状区或图文组合。",
    "任意分栏禁止一侧极窄塞长文案、另一侧大面积空白；长内容放宽栏，窄栏仅短 CTA/价格/保障。",
    "真实感来自细节：标题字阶、按钮状态、图片比例、边线透明度、footer 分层都要统一，不要像自动生成的占位站。",
  );

  return [...new Set(directives.map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

export function buildPolishChecklist(visualDensity: string) {
  const spacious = visualDensity === "spacious";
  const compact = visualDensity === "compact";
  return [
    "首屏仅一个主 CTA（实心），次按钮用描边/幽灵样式，避免两个同色实心按钮并列",
    "首屏禁止巨型头图；后台/侧栏布局禁止 hero 大图，仅保留标题区",
    "导航/侧栏图标用 Lucide 线性图标（data-lucide），禁止 emoji",
    "所有文字横排，禁止竖排与 writing-mode: vertical",
    "功能卡片用响应式 grid（minmax(240px,1fr)），卡片内文案横排可读",
    "标题与正文至少 2 级字号阶梯；H1 一行内，段长 2~4 行",
    "首屏需要一个内容相关的视觉焦点；工作台用真实功能或数据作为焦点",
    "连续 section 不得重复同一种三卡片结构；至少 2 个区块使用不同版式节奏",
    "避免整页白卡片堆叠；只有列表、案例、套餐、团队等重复项才使用卡片",
    "任意分栏/section 内左右结构禁止窄栏竖排单字 + 宽栏大面积空白；长文案、特色列表、评价必须放在宽栏或整栏",
    "section 内仅一张卡片/证言时须横向铺满，禁止左上角小卡片悬空",
    spacious
      ? "大留白：section 内 padding 充足，模块之间呼吸感强，但禁止大面积无内容空白"
      : compact
        ? "紧凑密度：信息点可密集，但保持对齐网格与统一间距，不要拥挤到难读"
        : "中等密度：模块间距均衡，卡片内 padding 一致",
    "作品/案例区用 grid，图片统一比例与圆角（服从 --image-radius）",
    "导航 sticky、链接 2~6 字横排；footer 分层（版权 / 链接 / 联系）",
    "所有色值写入 :root 变量；按钮/链接 hover 过渡约 0.18s",
    "配图用 Unsplash 真实摄影，与文案语境匹配；单图高度≤320px；禁止 emoji 与竖排文字",
  ];
}

export function buildGenerationGuidance(input: {
  project: ProjectState;
  bindingContract: BindingContract;
  selectedVisualOptions: Array<{ dimensionId: VisualId; option?: OptionItem }>;
  residualConstraints: string;
  intentSummary: string;
  planSummary?: string;
  planFirstScreen?: unknown;
  planStructure?: string[];
  visualDensity: string;
}) {
  return {
    constraintLayers: buildConstraintLayers(input.project),
    visualTone: buildCompactVisualTone(input.selectedVisualOptions),
    aestheticDirectives: buildAestheticDirectives(input),
    polishChecklist: buildPolishChecklist(input.visualDensity),
  };
}
