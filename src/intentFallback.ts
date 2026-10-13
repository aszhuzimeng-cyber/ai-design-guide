import { fillPlanSlots } from "./catalog";
import { buildDesignIntentText } from "./intentUtils";
import { isIntentComplete } from "./projectGuards";
import type {
  DimensionId,
  IntentDimension,
  IntentState,
  MechanismState,
  OptionItem,
  OptionSignal,
  VisualDimension,
  VisualId,
} from "./types";
import { normalizeId } from "./utils/id";

const INTENT_BRANCH_WIDTH = 420;
const INTENT_OPTION_LAYOUT_GAP = 16;
const INTENT_OPTION_MIN_WIDTH = 168;
const INTENT_OPTION_MAX_WIDTH = 320;
const INTENT_OPTION_CHAR_WIDTH = 15;
const INTENT_OPTION_BOX_PAD = 28;
const INTENT_OPTION_BADGE_WIDTH = 72;
const INTENT_OPTION_CHECK_WIDTH = 22;

type FallbackIntentOptionDef = { label: string; reason: string; constraints: string[] };

const fallbackIntentQuestions: Record<DimensionId, { title: string; question: string }> = {
  targetUser: { title: "主要用户群体", question: "最主要的用户群体是谁？" },
  coverage: { title: "突出重点", question: "要突出什么？" },
  valueProposition: { title: "核心感觉", question: "最核心的感觉是什么？" },
};

const genericFallbackIntentOptions: Record<DimensionId, FallbackIntentOptionDef[]> = {
  targetUser: [
    { label: "第一次了解的人", reason: "先降低理解门槛，让用户知道这件事是否相关。", constraints: ["首屏讲清楚是谁、做什么、适合谁"] },
    { label: "已经有需求的人", reason: "用户已经有明确需求，需要快速判断差异和可信度。", constraints: ["优先展示差异、证据和关键决策信息"] },
    { label: "准备合作/购买的人", reason: "用户更关心下一步怎么做，以及风险是否可控。", constraints: ["明确行动入口，并解释流程或保障"] },
  ],
  coverage: [
    { label: "公司是谁", reason: "先让用户理解主体和定位。", constraints: ["首屏先讲清楚身份、领域和服务对象"] },
    { label: "核心能力", reason: "适合先突出用户最该记住的能力。", constraints: ["把能力讲具体，不堆抽象口号"] },
    { label: "成功案例", reason: "适合用真实结果建立信任。", constraints: ["用案例、客户、数据或成果证明"] },
  ],
  valueProposition: [
    { label: "可信", reason: "先让用户相信这件事靠谱。", constraints: ["避免空泛口号，补充证据和具体说明"] },
    { label: "专业", reason: "让用户感到能力明确、表达稳妥。", constraints: ["信息有秩序，文案具体克制"] },
    { label: "清晰", reason: "让用户不费力就能理解页面重点。", constraints: ["减少术语堆叠，突出主次层级"] },
  ],
};

function includesAny(input: string, words: string[]) {
  return words.some((word) => input.includes(word));
}

function option(label: string, signal?: OptionSignal): OptionItem {
  return { id: normalizeId(label), label, signal, knowledge: `${label}会影响后续的信息组织优先级和视觉表达强度。` };
}

function estimateIntentOptionWidth(option: OptionItem, selected: boolean) {
  let width = option.label.length * INTENT_OPTION_CHAR_WIDTH + INTENT_OPTION_BOX_PAD;
  if (option.signal) width += INTENT_OPTION_BADGE_WIDTH + 7;
  if (selected) width += INTENT_OPTION_CHECK_WIDTH + 7;
  return Math.max(INTENT_OPTION_MIN_WIDTH, Math.min(INTENT_OPTION_MAX_WIDTH, Math.ceil(width)));
}

function buildIntentOptionRowLayout(items: Array<{ width: number }>, gap = INTENT_OPTION_LAYOUT_GAP) {
  if (items.length === 0) {
    return { positions: [] as Array<{ x: number; y: number }>, span: INTENT_BRANCH_WIDTH };
  }
  if (items.length === 1) {
    return {
      positions: [{ x: 0, y: 48 }],
      span: Math.max(INTENT_BRANCH_WIDTH, items[0].width + 32),
    };
  }
  const totalWidth = items.reduce((sum, item, index) => sum + item.width + (index > 0 ? gap : 0), 0);
  let cursor = -totalWidth / 2;
  const positions = items.map((item) => {
    const x = cursor + item.width / 2;
    cursor += item.width + gap;
    return { x, y: 48 };
  });
  return { positions, span: Math.max(INTENT_BRANCH_WIDTH, totalWidth + 32) };
}

function withPositions(options: OptionItem[]) {
  const layout = buildIntentOptionRowLayout(
    options.map((item) => ({ width: estimateIntentOptionWidth(item, false) })),
  );
  return options.map((item, index) => ({ ...item, position: item.position ?? layout.positions[index] }));
}

function fallbackIntentOption(
  dimensionId: DimensionId,
  label: string,
  reason: string,
  constraints: string[],
  input = "",
): OptionItem {
  return {
    ...option(label),
    id: `fallback-${dimensionId}-${normalizeId(label)}`,
    source: "reference",
    signal: matchesExplicitIntent(label, input) ? "constraint" : undefined,
    reason,
    knowledge: reason,
    normalizedMeaning: label,
    constraints,
    generationRules: constraints,
  };
}

function createFallbackIntentOptions(dimensionId: DimensionId, input = "") {
  return genericFallbackIntentOptions[dimensionId].map((item) =>
    fallbackIntentOption(dimensionId, item.label, item.reason, item.constraints, input),
  );
}

function matchesExplicitIntent(label: string, input: string) {
  if (!input.trim()) return false;
  if (label.includes("高级") && includesAny(input, ["高级", "高端", "质感"])) return true;
  if (label.includes("专业") && includesAny(input, ["专业", "科技", "技术", "实力"])) return true;
  if (label.includes("可信") && includesAny(input, ["可信", "可靠", "信任", "靠谱"])) return true;
  if (label.includes("清晰") && includesAny(input, ["清晰", "清楚", "明白"])) return true;
  if (label.includes("好理解") && includesAny(input, ["好理解", "易懂", "简单"])) return true;
  if (label.includes("核心能力") && includesAny(input, ["能力", "技术", "科技", "实力"])) return true;
  if (label.includes("成功案例") && includesAny(input, ["案例", "客户", "成果", "项目"])) return true;
  if (label.includes("产品/服务") && includesAny(input, ["产品", "服务", "方案"])) return true;
  if (label.includes("联系合作") && includesAny(input, ["联系", "咨询", "合作"])) return true;
  if (label.includes("准备合作") && includesAny(input, ["合作", "客户", "咨询"])) return true;
  if (label.includes("准备购买") && includesAny(input, ["购买", "下单", "买"])) return true;
  if (label.includes("已经有需求") && includesAny(input, ["需求", "咨询", "合作", "购买"])) return true;
  return false;
}

function mergeLoadedIntentOptions(loadedOptions: OptionItem[], fallbackOptions: OptionItem[]) {
  if (loadedOptions.some((item) => item.source === "ai-generated")) return loadedOptions;

  const userOptions = loadedOptions.filter((item) => item.custom || item.source === "user-added");
  if (!loadedOptions.length || loadedOptions.every((item) => item.source === "reference" || item.id.startsWith("fallback-"))) {
    return [...fallbackOptions, ...userOptions.filter((userOption) => !fallbackOptions.some((item) => item.id === userOption.id))];
  }

  return loadedOptions;
}

export function repairFallbackIntentOptions(intent: IntentState, input = ""): IntentState {
  let changed = false;
  const dimensions = intent.dimensions.map((dimension) => {
    const fallbackQuestion = fallbackIntentQuestions[dimension.id];
    const fallbackOptions = withPositions(createFallbackIntentOptions(dimension.id, input));
    const hasUserOrAiOptions = dimension.options.some((item) => item.custom || item.source === "user-added" || item.source === "ai-generated");
    const currentLabels = dimension.options.map((item) => item.label).join("|");
    const fallbackLabels = fallbackOptions.map((item) => item.label).join("|");
    const currentSignals = dimension.options.map((item) => item.signal ?? "").join("|");
    const fallbackSignals = fallbackOptions.map((item) => item.signal ?? "").join("|");
    const shouldRepair =
      dimension.options.length === 0 ||
      (!hasUserOrAiOptions &&
        (dimension.question !== fallbackQuestion.question || currentLabels !== fallbackLabels || currentSignals !== fallbackSignals));

    if (!shouldRepair) {
      if (isLegacyIntentQuestionCopy(dimension)) {
        changed = true;
        return applyLegacyIntentQuestionCopy(dimension);
      }
      return dimension;
    }
    changed = true;
    return {
      ...dimension,
      title: fallbackQuestion.title,
      question: fallbackQuestion.question,
      options: fallbackOptions,
      selectedOptionId: undefined,
      expanded: false,
    };
  });
  return changed ? { dimensions, designIntentText: buildDesignIntentText(dimensions) } : intent;
}

export function createIntentState(input: string): IntentState {
  const dimensions: IntentDimension[] = [
    {
      id: "targetUser",
      title: fallbackIntentQuestions.targetUser.title,
      question: fallbackIntentQuestions.targetUser.question,
      selectedOptionId: undefined,
      expanded: false,
      options: withPositions(createFallbackIntentOptions("targetUser", input)),
    },
    {
      id: "coverage",
      title: fallbackIntentQuestions.coverage.title,
      question: fallbackIntentQuestions.coverage.question,
      selectedOptionId: undefined,
      expanded: false,
      options: withPositions(createFallbackIntentOptions("coverage", input)),
    },
    {
      id: "valueProposition",
      title: fallbackIntentQuestions.valueProposition.title,
      question: fallbackIntentQuestions.valueProposition.question,
      selectedOptionId: undefined,
      expanded: false,
      options: withPositions(createFallbackIntentOptions("valueProposition", input)),
    },
  ];
  return { dimensions, designIntentText: buildDesignIntentText(dimensions) };
}

function isLegacyTargetUserCopy(dimension: Pick<IntentDimension, "id" | "title" | "question">) {
  return (
    dimension.id === "targetUser" &&
    (dimension.question === "用户是谁？" ||
      dimension.question === "用户是谁" ||
      dimension.title === "用户是谁")
  );
}

function isLegacyValuePropositionCopy(dimension: Pick<IntentDimension, "id" | "question">) {
  return (
    dimension.id === "valueProposition" &&
    (dimension.question === "核心感觉是什么？" || dimension.question === "核心感觉是什么")
  );
}

function applyLegacyIntentQuestionCopy(dimension: IntentDimension): IntentDimension {
  if (isLegacyTargetUserCopy(dimension)) {
    return {
      ...dimension,
      title: fallbackIntentQuestions.targetUser.title,
      question: fallbackIntentQuestions.targetUser.question,
    };
  }
  if (isLegacyValuePropositionCopy(dimension)) {
    return {
      ...dimension,
      title: fallbackIntentQuestions.valueProposition.title,
      question: fallbackIntentQuestions.valueProposition.question,
    };
  }
  return dimension;
}

function isLegacyIntentQuestionCopy(dimension: IntentDimension) {
  return isLegacyTargetUserCopy(dimension) || isLegacyValuePropositionCopy(dimension);
}

export function normalizeLegacyIntentQuestion(dimension: IntentDimension): IntentDimension {
  return applyLegacyIntentQuestionCopy(dimension);
}

/** @deprecated use normalizeLegacyIntentQuestion */
export function normalizeTargetUserQuestion(dimension: IntentDimension): IntentDimension {
  return normalizeLegacyIntentQuestion(dimension);
}

export function rehydrateIntentState(intent: IntentState, input: string): IntentState {
  const base = createIntentState(input);
  const dimensions = base.dimensions.map((dimension) => {
    const loaded = intent.dimensions.find((item) => item.id === dimension.id);
    const loadedOptions = loaded?.options ?? [];
    const options = withPositions(
      mergeLoadedIntentOptions(loadedOptions, dimension.options).map((option) => ({
        ...option,
        signal: option.signal === "constraint" || option.signal === "recommended" ? option.signal : undefined,
      })),
    );
    const selectedOptionId = options.some((item) => item.id === loaded?.selectedOptionId) ? loaded?.selectedOptionId : undefined;
    const merged = {
      ...dimension,
      title: loaded?.title ?? dimension.title,
      question: loaded?.question ?? dimension.question,
      options,
      selectedOptionId,
      expanded: loaded?.expanded ?? false,
    };
    return normalizeLegacyIntentQuestion(merged);
  });
  return { dimensions, designIntentText: buildDesignIntentText(dimensions) };
}

const VISUAL_DIMENSION_META: Record<VisualId, { title: string; description: string }> = {
  color: { title: "色彩", description: "影响情绪与氛围" },
  font: { title: "字体", description: "影响阅读节奏与气质" },
  card: { title: "卡片样式", description: "影响信息分组与层次感" },
  density: { title: "内容密度", description: "影响每屏信息量与浏览节奏" },
};

const LEGACY_VISUAL_DIMENSION_IDS: Record<string, VisualId> = {
  radius: "card",
  icon: "density",
};

function createVisualDimension(id: VisualId): VisualDimension {
  const meta = VISUAL_DIMENSION_META[id];
  return { id, title: meta.title, description: meta.description, selectedOptionId: undefined, expanded: false, options: [] };
}

export function normalizeVisualDimensionId(id: string): VisualId | null {
  if (id in VISUAL_DIMENSION_META) return id as VisualId;
  return LEGACY_VISUAL_DIMENSION_IDS[id] ?? null;
}

export function mergeVisualDimensions(previous?: VisualDimension[]): VisualDimension[] {
  const template = (["color", "font", "card", "density"] as VisualId[]).map((id) => createVisualDimension(id));
  if (!previous?.length) return template;

  const loadedById = new Map<VisualId, VisualDimension>();
  for (const dimension of previous) {
    const normalizedId = normalizeVisualDimensionId(dimension.id);
    if (!normalizedId) continue;
    const meta = VISUAL_DIMENSION_META[normalizedId];
    loadedById.set(normalizedId, {
      ...dimension,
      id: normalizedId,
      title: meta.title,
      description: meta.description,
    });
  }

  return template.map((dimension) => loadedById.get(dimension.id) ?? dimension);
}

function buildInfoPlans(intent: IntentState, _rawInput: string, previous?: MechanismState) {
  const customPlans = (previous?.infoPlans ?? []).filter((plan) => plan.isCustom);
  if (!isIntentComplete(intent)) {
    return customPlans;
  }

  const aiPlans = (previous?.infoPlans ?? []).filter((plan) => !plan.isPlaceholder && !plan.isCustom);
  if (aiPlans.length) {
    return [...aiPlans, ...customPlans];
  }

  return fillPlanSlots(customPlans).map((plan, index) =>
    plan.isPlaceholder
      ? {
          ...plan,
          title: `方案 ${index + 1}`,
          summary: "",
        }
      : plan,
  );
}

export function createMechanismState(intent: IntentState, rawInput = "", previous?: MechanismState): MechanismState {
  const visualDimensions = mergeVisualDimensions(previous?.visualDimensions);
  const infoPlans = buildInfoPlans(intent, rawInput, previous);
  const selectedInfoPlanId =
    previous?.selectedInfoPlanId && infoPlans.some((plan) => plan.id === previous.selectedInfoPlanId && !plan.isPlaceholder)
      ? previous.selectedInfoPlanId
      : undefined;
  return {
    selectedInfoPlanId,
    infoPlans,
    infoExpanded: previous?.infoExpanded ?? false,
    visualDimensions,
    visualExpanded: previous?.visualExpanded ?? false,
  };
}
