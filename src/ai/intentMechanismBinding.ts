import { buildDesignIntentText } from "../intentUtils";
import type { DimensionId, IntentState, OptionItem } from "../types";
import type { AiMechanismResult } from "./types";
import type { SpokenConstraint } from "./types";
import { INTENT_DIMENSION_LABELS } from "./intentConstraintSemantics";

export type IntentMechanismBinding = {
  summary: string;
  designIntentText: string;
  dimensions: Array<{
    id: DimensionId;
    title: string;
    selectedLabel: string;
    reason?: string;
    constraints: string[];
    architectureHint: string;
  }>;
  coverageLeadPattern: RegExp;
  recommendedFlowHints: string[];
};

type SynthesizedPlan = NonNullable<AiMechanismResult["synthesizedPlans"]>[number];

function readSelectedOption(dimensions: IntentState["dimensions"], id: DimensionId): OptionItem | undefined {
  const dimension = dimensions.find((item) => item.id === id);
  if (!dimension?.selectedOptionId) return undefined;
  return dimension.options.find((option) => option.id === dimension.selectedOptionId);
}

function coverageArchitectureHint(label: string) {
  if (/公司|品牌|是谁|定位|介绍/.test(label)) {
    return "首屏先建立「公司/品牌是谁」，再展开能力与信任背书，避免一上来推价格或强转化。";
  }
  if (/能力|产品|功能|演示|亮点|对话|试用/.test(label)) {
    return "首屏让用户快速看懂核心能力或产品价值，用演示/功能说明承接，再补证明与行动入口。";
  }
  if (/案例|成果|作品|证明|客户|评价|反馈|口碑/.test(label)) {
    return "首屏或次屏优先呈现案例/成果/用户证明，让用户先看到真实结果再了解服务细节。";
  }
  if (/服务|流程|合作|价格|套餐|预约|咨询/.test(label)) {
    return "在建立基本认知后，尽快讲清服务方式、流程或价格权益，缩短决策路径。";
  }
  return "模块顺序要服务用户决策：先回答「是否相关」，再回答「是否可信」，最后给行动入口。";
}

function coverageLeadPattern(label: string) {
  if (/案例|成果|作品|代表/.test(label)) return /案例|成果|作品|代表|客户|项目/;
  if (/能力|产品|功能|演示|亮点|对话/.test(label)) return /能力|产品|功能|亮点|演示|对话|核心/;
  if (/公司|品牌|是谁|定位/.test(label)) return /公司|品牌|主张|定位|介绍|我们|关于/;
  if (/评价|证明|信任|口碑|反馈/.test(label)) return /评价|证明|资质|背书|口碑|反馈|用户/;
  if (/服务|流程|合作/.test(label)) return /服务|流程|合作|方式|交付/;
  if (/价格|套餐|权益/.test(label)) return /价格|套餐|权益|报价|费用/;
  return /价值|核心|首屏|重点/;
}

function coverageFlowHints(label: string) {
  if (/案例|成果|作品/.test(label)) return ["cases-first", "work-first", "proof-before-offer"];
  if (/能力|产品|功能|演示/.test(label)) return ["product-demo", "demo-first", "tool-operate"];
  if (/公司|品牌|是谁/.test(label)) return ["trust-first", "editorial", "brand-intro"];
  if (/评价|证明|信任/.test(label)) return ["proof-first", "trust-first", "proof-before-offer"];
  return ["balanced-narrative", "clear-conversion"];
}

function targetUserArchitectureHint(label: string) {
  if (/第一次|初次|陌生|了解/.test(label)) {
    return "降低理解门槛：先讲清是谁、做什么、适合谁，再展开细节。";
  }
  if (/需求|比较|判断/.test(label)) {
    return "用户已有需求：尽快呈现差异点、证据和决策信息。";
  }
  if (/合作|购买|成交|预约/.test(label)) {
    return "用户接近决策：突出流程、保障、价格与明确行动入口。";
  }
  return "信息节奏要匹配该用户阶段的耐心与决策成本。";
}

function valueArchitectureHint(label: string) {
  if (/可信|靠谱|可靠|专业/.test(label)) return "用具体证据与克制表达建立可信感，避免空泛口号。";
  if (/高级|高端|质感|格调/.test(label)) return "留白与层级要克制，信息精选，不堆满模块。";
  if (/活力|活泼|明快/.test(label)) return "节奏可更轻快，首屏记忆点明确，模块不宜过于严肃密集。";
  if (/清晰|简约/.test(label)) return "模块少而准，层级清楚，避免并行竞争多个重点。";
  return "整体气质要与核心感觉一致，体现在模块选择与文案力度上。";
}

export function buildIntentMechanismBinding(input: {
  intent?: IntentState;
  rawInput?: string;
  spokenConstraints?: SpokenConstraint[];
}): IntentMechanismBinding | undefined {
  const intent = input.intent;
  if (!intent?.dimensions.length) return undefined;

  const dimensions = (["targetUser", "coverage", "valueProposition"] as const).map((id) => {
    const dimension = intent.dimensions.find((item) => item.id === id);
    const selected = readSelectedOption(intent.dimensions, id);
    const selectedLabel = selected?.label?.trim() ?? "";
    const constraints = selected?.constraints ?? selected?.generationRules ?? [];
    const architectureHint =
      id === "targetUser"
        ? targetUserArchitectureHint(selectedLabel)
        : id === "coverage"
          ? coverageArchitectureHint(selectedLabel)
          : valueArchitectureHint(selectedLabel);
    return {
      id,
      title: dimension?.title ?? INTENT_DIMENSION_LABELS[id],
      selectedLabel,
      reason: selected?.reason ?? selected?.knowledge,
      constraints,
      architectureHint,
    };
  });

  const coverageLabel = dimensions.find((item) => item.id === "coverage")?.selectedLabel ?? "";
  return {
    summary: dimensions.map((item) => item.selectedLabel).filter(Boolean).join(" / "),
    designIntentText: intent.designIntentText || buildDesignIntentText(intent.dimensions),
    dimensions,
    coverageLeadPattern: coverageLeadPattern(coverageLabel),
    recommendedFlowHints: coverageFlowHints(coverageLabel),
  };
}

function planCorpus(plan: SynthesizedPlan) {
  return [
    plan.title,
    plan.summary,
    plan.reason,
    plan.pageArchitecture,
    plan.layoutRhythm,
    plan.decisionPath,
    ...(plan.structure ?? []),
    ...(plan.contentModules ?? []).map((module) => [module.label, module.purpose, module.reason].filter(Boolean).join(" ")),
    typeof plan.contentFlow === "object" && plan.contentFlow && "pattern" in plan.contentFlow
      ? String((plan.contentFlow as Record<string, unknown>).pattern ?? "")
      : "",
    typeof plan.previewWireframe === "object" && plan.previewWireframe
      ? [plan.previewWireframe.frame, plan.previewWireframe.hero, plan.previewWireframe.body].filter(Boolean).join(" ")
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function firstStructureLabel(plan: SynthesizedPlan) {
  if (Array.isArray(plan.structure) && plan.structure[0]) return plan.structure[0];
  return plan.contentModules?.[0]?.label ?? "";
}

export function scoreInfoPlanAgainstIntent(plan: SynthesizedPlan, binding?: IntentMechanismBinding) {
  if (!binding) return 0;
  const corpus = planCorpus(plan).toLowerCase();
  const lead = firstStructureLabel(plan);
  let score = 0;

  const coverage = binding.dimensions.find((item) => item.id === "coverage");
  if (coverage?.selectedLabel) {
    const label = coverage.selectedLabel;
    if (binding.coverageLeadPattern.test(lead)) score += 28;
    if (binding.coverageLeadPattern.test(corpus)) score += 12;
    for (const hint of binding.recommendedFlowHints) {
      if (corpus.includes(hint.replace(/-/g, "")) || corpus.includes(hint)) score += 8;
    }
    if (/案例|成果|作品/.test(label) && /案例|成果|作品|代表|客户/.test(corpus)) score += 14;
    if (/能力|产品|功能|演示/.test(label) && /能力|产品|功能|演示|亮点|对话/.test(corpus)) score += 14;
    if (/公司|品牌|是谁/.test(label) && /公司|品牌|主张|定位|介绍/.test(corpus)) score += 14;
    if (/评价|证明|信任|反馈/.test(label) && /评价|证明|资质|背书|反馈|口碑/.test(corpus)) score += 14;
    for (const constraint of coverage.constraints) {
      if (constraint.length >= 4 && corpus.includes(constraint.slice(0, 8).toLowerCase())) score += 6;
    }
  }

  const targetUser = binding.dimensions.find((item) => item.id === "targetUser");
  if (targetUser?.selectedLabel) {
    if (/第一次|初次|陌生/.test(targetUser.selectedLabel) && /介绍|是谁|定位|了解/.test(corpus)) score += 10;
    if (/需求|判断|比较/.test(targetUser.selectedLabel) && /差异|对比|证据|亮点/.test(corpus)) score += 10;
    if (/合作|购买|预约|成交/.test(targetUser.selectedLabel) && /咨询|预约|合作|价格|流程|行动/.test(corpus)) score += 10;
  }

  const value = binding.dimensions.find((item) => item.id === "valueProposition");
  if (value?.selectedLabel) {
    if (/可信|专业/.test(value.selectedLabel) && /证明|资质|案例|数据|背书/.test(corpus)) score += 8;
    if (/高级|质感|格调/.test(value.selectedLabel) && /精选|克制|留白|叙事/.test(corpus)) score += 8;
    if (/活力|活泼/.test(value.selectedLabel) && /亮点|参与|互动|明快/.test(corpus)) score += 8;
    if (/清晰|简约/.test(value.selectedLabel) && /层级|重点|简洁/.test(corpus)) score += 8;
  }

  if (coverage?.reason && plan.reason?.includes(coverage.reason.slice(0, 12))) score += 6;
  return score;
}

export function resolveRecommendedPlanId(
  plans: NonNullable<AiMechanismResult["synthesizedPlans"]>,
  binding?: IntentMechanismBinding,
  aiRecommendedPlanId?: string,
) {
  if (!plans.length) return aiRecommendedPlanId;
  if (!binding) return aiRecommendedPlanId ?? plans[0]?.id;

  const scored = plans.map((plan) => ({
    plan,
    score: scoreInfoPlanAgainstIntent(plan, binding),
  }));
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const aiPick = scored.find((item) => item.plan.id === aiRecommendedPlanId);
  if (!best || best.score <= 0) return aiRecommendedPlanId ?? plans[0]?.id;
  if (aiPick && best.score - aiPick.score <= 6) return aiRecommendedPlanId ?? best.plan.id;
  return best.plan.id;
}
