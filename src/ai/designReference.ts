import { formatPlanTitle } from "../planLoFi";
import {
  classifyColorFamily,
  colorStyleNameFromPrimary,
  inferColorMoodFromText,
  inferColorTokensFromLabel,
  isLayoutOrientedColorLabel,
  parseColorDescription,
} from "../visualColorPalette";
import { cardStyleNameFromKey, clampStyleName, inferFontStyleName, canonicalCardStyleKey, canonicalDensityKey, canonicalDensityLabel } from "../visualGrammarDisplay";
import { enrichVisualOption, formatVisualOptionReason, dedupeVisualDimensionOptions } from "./visualGrammarNormalize";
import { formatContentModuleLabel } from "../contentModuleLabel";
import compiledReference from "../../design-reference/runtime/design-reference.compiled.json";
import contentModulesRaw from "../../design-reference/curated/content-modules.json";
import infoArchetypes from "../../design-reference/curated/info-archetypes.json";
import type { AiVisualSelection } from "./types";
import type { ContentModulePlacement, DimensionId, InfoPlan, IntentState, OptionItem, VisualId } from "../types";
import { visualCatalogVocabulary, VISUAL_DIMENSION_IDS } from "./catalogs";
import { buildIntentMechanismBinding, resolveRecommendedPlanId } from "./intentMechanismBinding";
import { resolveIntentColorMood } from "./intentConstraintSemantics";
import type { SpokenConstraint } from "./types";

export type ReferenceBase = {
  id: string;
  type: string;
  title: string;
  userLabel?: string;
  summary?: string;
  appliesWhen?: string[];
  avoidWhen?: string[];
  rationale?: string;
  risks?: string[];
  tags?: string[];
  priority?: number;
};

export type ReferenceInfoPreset = ReferenceBase & {
  label: string;
  basedOnArchetype?: string;
  variantOf?: string;
  bestFor: string[];
  structure: string[];
  reason: string;
  risk: string;
  requiredAssets: string[];
  pageArchitecture: string;
  pageFrame?: Record<string, unknown>;
  firstScreen?: Record<string, unknown>;
  contentFlow?: Record<string, unknown>;
  componentPatterns?: Record<string, unknown>;
  layoutDecisions?: Record<string, unknown>;
  aboveFold: Record<string, unknown>;
  sections: Array<Record<string, unknown>>;
  layoutRhythm: string;
  decisionPath: string[];
  previewWireframe: Record<string, unknown>;
  contentModules?: ContentModulePlacement[];
  generationRules: string[];
  forbiddenPatterns: string[];
};

export type ReferenceVisualPreset = ReferenceBase & {
  label: string;
  bestFor: string[];
  color: string;
  font: string;
  layout: string;
  radius?: string;
  imagery: string;
  reason: string;
  risk: string;
  previewRules: Record<string, unknown>;
  generationRules: string[];
  forbiddenPatterns: string[];
  tokenHints: Record<string, unknown>;
  visualTokens?: Record<string, unknown>;
  implicitDecisions?: Record<string, unknown>;
  previewTemplate?: string;
};

export type ReferenceCompositionRule = ReferenceBase & {
  infoPresetId: string;
  recommendedVisualPresets: string[];
  avoidVisualPresets: string[];
  reason: string;
};

export type ReferenceChecklist = ReferenceBase & { items?: string[] };

export type ReferenceUxQualityRule = ReferenceBase & {
  category?: string;
  platform?: string;
  do?: string;
  dont?: string;
};

export type DesignReferenceRuntime = {
  version: string;
  priorityOrder: string[];
  collections: {
    principles: ReferenceBase[];
    "intent-judgment": ReferenceBase[];
    "persuasion-mechanisms": ReferenceBase[];
    "info-option-presets": ReferenceInfoPreset[];
    "visual-option-presets": ReferenceVisualPreset[];
    "option-composition-rules": ReferenceCompositionRule[];
    "anti-patterns": ReferenceBase[];
    checklists: ReferenceChecklist[];
    "ux-quality-rules": ReferenceUxQualityRule[];
    "case-pattern-summaries": ReferenceBase[];
  };
  index: ReferenceBase[];
};

export type UserAddedStage = "intent" | "info" | "visual";

const moduleOrchestrationHints = [
  { id: "cases-before-credentials", hint: "信任型页面若用户更信结果：案例模块前置，资质与保障后置。", archetypes: ["trust-first"] },
  { id: "problem-before-demo", hint: "产品型页面若痛点明确：先问题/任务，再方案与界面演示。", archetypes: ["product-showcase"] },
  { id: "proof-before-offer", hint: "转化型页面若用户有顾虑：社会证明早于 offer 与主 CTA。", archetypes: ["clear-conversion"] },
  { id: "value-before-price", hint: "定价页若用户只比价格：先价值与适合谁，再出套餐卡片。", archetypes: ["pricing-packages"] },
  { id: "story-before-gallery", hint: "作品型页面若有完整案例：故事/结果先于纯图片网格。", archetypes: ["work-first"] },
  { id: "task-before-taxonomy", hint: "内容入口若用户带任务来：按任务车道组织，而非仅按栏目分类。", archetypes: ["content-hub"] },
  { id: "guide-before-workbench", hint: "工具页若新手多：示例引导先于全功能操作台。", archetypes: ["tool-operation"] },
  { id: "scenario-before-matrix", hint: "对比选型：先场景问题，再方案矩阵与推荐。", archetypes: ["comparison-decision"] },
  { id: "agenda-before-hype", hint: "活动页若时间投入是关键：议程时间线先于氛围与口号。", archetypes: ["community-event"] },
  { id: "chapter-before-scroll", hint: "长文叙事：章节导览与阅读线索先于正文堆叠。", archetypes: ["editorial-story"] },
];

export type NormalizedUserAddedOption = {
  id: string;
  label: string;
  source: "user-added";
  rawText: string;
  normalizedMeaning: string;
  constraints: string[];
  generationRules: string[];
  custom: true;
  pageArchitecture?: string;
  pageFrame?: Record<string, unknown>;
  firstScreen?: Record<string, unknown>;
  contentFlow?: Record<string, unknown>;
  componentPatterns?: Record<string, unknown>;
  layoutDecisions?: Record<string, unknown>;
  aboveFold?: Record<string, unknown>;
  sections?: Array<Record<string, unknown>>;
  layoutRhythm?: string;
    decisionPath?: string[];
    previewWireframe?: Record<string, unknown>;
    contentModules?: ContentModulePlacement[];
    previewRules?: Record<string, unknown>;
  tokenHints?: Record<string, unknown>;
  forbiddenPatterns?: string[];
  reason?: string;
};

export type CompiledGenerationConstraints = {
  selectedInfo?: InfoPlan;
  selectedVisualOptions: OptionItem[];
  infoArchitecture?: {
    title?: string;
    summary?: string;
    structure?: string[];
    pageArchitecture?: string;
    pageFrame?: Record<string, unknown>;
    firstScreen?: Record<string, unknown>;
    contentFlow?: Record<string, unknown>;
    componentPatterns?: Record<string, unknown>;
    layoutDecisions?: Record<string, unknown>;
    aboveFold?: Record<string, unknown>;
    sections?: Array<Record<string, unknown>>;
    layoutRhythm?: string;
    decisionPath?: string[];
    previewWireframe?: Record<string, unknown>;
    contentModules?: ContentModulePlacement[];
    generationRules?: string[];
  };
  visualLanguage: Array<{
    dimensionId: VisualId;
    label: string;
    reason?: string;
    previewRules?: Record<string, unknown>;
    tokenHints?: Record<string, unknown>;
    visualTokens?: Record<string, unknown>;
    implicitDecisions?: Record<string, unknown>;
    previewTemplate?: string;
    generationRules?: string[];
  }>;
  generationRules: string[];
  forbiddenPatterns: string[];
};

const runtime = compiledReference as DesignReferenceRuntime;

/** 案例库运行时：compiled JSON + 少量 curated 直读（archetypes / content-modules） */

export function getPrinciples() {
  return runtime.collections.principles;
}

export function getIntentJudgments() {
  return runtime.collections["intent-judgment"];
}

export function getPersuasionMechanisms() {
  return runtime.collections["persuasion-mechanisms"];
}

export function getCasePatternSummaries() {
  return runtime.collections["case-pattern-summaries"];
}

export function getInfoPresets() {
  return runtime.collections["info-option-presets"];
}

export function getVisualPresets() {
  return runtime.collections["visual-option-presets"];
}

export function getCompositionRules() {
  return runtime.collections["option-composition-rules"];
}

export function getCoreAntiPatterns() {
  return runtime.collections["anti-patterns"];
}

export function getChecklists() {
  return runtime.collections.checklists;
}

export function getUxQualityRules() {
  return runtime.collections["ux-quality-rules"];
}

function pickChecklist(id: string) {
  const checklist = getChecklists().find((item) => item.id === id);
  if (!checklist) return undefined;
  return {
    id: checklist.id,
    title: checklist.title,
    summary: checklist.summary,
    items: checklist.items ?? [],
  };
}

export function getMechanismCheckContext() {
  return {
    preRecommendationChecklist: pickChecklist("pre-recommendation"),
  };
}

export function getGenerationCheckContext() {
  return {
    preGenerationChecklist: pickChecklist("pre-generation"),
    postGenerationChecklist: pickChecklist("post-generation"),
    uxQualityRules: getUxQualityRules()
      .slice()
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .slice(0, 12)
      .map((rule) => ({
        id: rule.id,
        title: rule.userLabel ?? rule.title,
        category: rule.category,
        do: rule.do,
        dont: rule.dont,
      })),
  };
}

function contentModulesFromSections(preset: ReferenceInfoPreset): ContentModulePlacement[] {
  if (preset.contentModules?.length) {
    return preset.contentModules.map((module) => ({ ...module, label: formatContentModuleLabel(module.label) }));
  }
  const sections = Array.isArray(preset.sections) && preset.sections.length ? preset.sections : [];
  const source = sections.length ? sections : preset.structure.map((item) => ({ content: item }));
  return source.slice(0, 8).map((section, index) => {
    const record = section && typeof section === "object" ? (section as Record<string, unknown>) : {};
    const raw =
      typeof record.content === "string"
        ? record.content
        : typeof record.title === "string"
          ? record.title
          : preset.structure[index] ?? `content-${index + 1}`;
    const label = formatContentModuleLabel(raw);
    const placement =
      typeof record.role === "string"
        ? record.role
        : typeof record.layout === "string"
          ? record.layout
          : `section-${index + 1}`;
    return {
      id: `${preset.id}-module-${index + 1}`,
      label,
      placement,
      sectionId: typeof record.role === "string" ? record.role : `section-${index + 1}`,
      source: "reference" as const,
      reason: typeof record.why === "string" ? record.why : preset.reason,
    };
  });
}

export function referenceInfoToPlan(preset: ReferenceInfoPreset): InfoPlan {
  const plan: InfoPlan = {
    id: preset.id,
    title: preset.label,
    structure: preset.structure,
    summary: preset.reason,
    prompt: preset.pageArchitecture,
    source: "reference",
    reason: preset.reason,
    risk: preset.risk,
    pageArchitecture: preset.pageArchitecture,
    pageFrame: preset.pageFrame,
    firstScreen: preset.firstScreen,
    contentFlow: preset.contentFlow,
    componentPatterns: preset.componentPatterns,
    layoutDecisions: preset.layoutDecisions,
    aboveFold: preset.aboveFold,
    sections: preset.sections,
    layoutRhythm: preset.layoutRhythm,
    decisionPath: preset.decisionPath,
    previewWireframe: preset.previewWireframe,
    contentModules: contentModulesFromSections(preset),
    generationRules: preset.generationRules,
    forbiddenPatterns: preset.forbiddenPatterns,
  };
  return { ...plan, title: formatPlanTitle(plan) };
}

export function buildMechanismFallbackFromReference(input: { intent: IntentState; rawInput: string }) {
  const presets = selectInfoPresetsForIntent({ intent: input.intent, rawInput: input.rawInput, limit: 3 });
  const synthesizedPlans = presets.map((preset, index) => {
    const plan = referenceInfoToPlan(preset);
    return {
      id: plan.id || `reference-plan-${index + 1}`,
      title: plan.title,
      structure: plan.structure,
      summary: plan.summary ?? plan.reason ?? "案例库推荐的信息组织方案",
      prompt: plan.prompt ?? plan.pageArchitecture ?? plan.structure.join(" / "),
      source: "reference" as const,
      reason: plan.reason,
      risk: plan.risk,
      pageArchitecture: plan.pageArchitecture,
      pageFrame: plan.pageFrame,
      firstScreen: plan.firstScreen,
      contentFlow: plan.contentFlow,
      componentPatterns: plan.componentPatterns,
      layoutDecisions: plan.layoutDecisions,
      aboveFold: plan.aboveFold,
      sections: plan.sections,
      layoutRhythm: plan.layoutRhythm,
      decisionPath: plan.decisionPath,
      previewWireframe: plan.previewWireframe,
      contentModules: plan.contentModules,
      generationRules: plan.generationRules,
      forbiddenPatterns: plan.forbiddenPatterns,
    };
  });
  return {
    recommendedPlanId: resolveRecommendedPlanId(
      synthesizedPlans,
      buildIntentMechanismBinding({ intent: input.intent, rawInput: input.rawInput }),
      synthesizedPlans[0]?.id,
    ),
    synthesizedPlans,
    visualSelections: {} as const,
  };
}

export function selectInfoPresetsForIntent(input: {
  intent: IntentState;
  rawInput: string;
  limit?: number;
}): ReferenceInfoPreset[] {
  const limit = input.limit ?? 3;
  const targetUserLabel = selectedIntentLabel(input.intent, "targetUser");
  const coverageLabel = selectedIntentLabel(input.intent, "coverage");
  const valueLabel = selectedIntentLabel(input.intent, "valueProposition");
  const selectedReasons = input.intent.dimensions
    .map((dimension) => dimension.options.find((option) => option.id === dimension.selectedOptionId)?.reason)
    .filter(Boolean);
  const intentText = [
    input.rawInput,
    input.intent.designIntentText,
    targetUserLabel,
    coverageLabel,
    valueLabel,
    ...selectedReasons,
  ]
    .filter(Boolean)
    .join(" ");
  const scored = getInfoPresets()
    .map((preset) => {
      let score = scoreInfoPreset(preset, intentText);
      if (/案例|成果|作品|证明/.test(coverageLabel)) {
        score += keywordBoost(preset.id, ["work-first", "cases-before-proof", "story-gallery"], 22);
      }
      if (/能力|产品|功能|演示|亮点/.test(coverageLabel)) {
        score += keywordBoost(preset.id, ["product-demo", "tool-operate", "guided-walkthrough"], 22);
      }
      if (/公司|品牌|是谁|定位/.test(coverageLabel)) {
        score += keywordBoost(preset.id, ["trust-first", "editorial"], 22);
        score -= keywordPenalty(preset.id, ["clear-conversion", "price-package"], 12);
      }
      if (/评价|证明|信任|反馈|口碑/.test(coverageLabel)) {
        score += keywordBoost(preset.id, ["proof-before-offer", "trust-first"], 22);
      }
      if (/合作|购买|预约|成交/.test(targetUserLabel)) {
        score += keywordBoost(preset.id, ["clear-conversion", "price-package", "compare"], 14);
      }
      if (/第一次|初次|陌生/.test(targetUserLabel)) {
        score += keywordBoost(preset.id, ["trust-first", "editorial"], 12);
      }
      if (/高级|质感|格调/.test(valueLabel)) {
        score += keywordBoost(preset.id, ["editorial", "story-gallery"], 10);
      }
      return {
        preset,
        score,
        signature: wireframeSignature(preset.previewWireframe),
        archetype: archetypeOf(preset),
      };
    })
    .sort((a, b) => b.score - a.score || (b.preset.priority ?? 0) - (a.preset.priority ?? 0));

  const selected: typeof scored = [];
  const deferSameArchetype: typeof scored = [];
  const deferSameHero: typeof scored = [];

  const previewHeroOf = (preset: ReferenceInfoPreset) =>
    typeof preset.previewWireframe?.hero === "string" ? preset.previewWireframe.hero : "";

  for (const item of scored) {
    if (selected.length >= limit) break;
    if (selected.some((picked) => picked.signature === item.signature)) continue;
    const hero = previewHeroOf(item.preset);
    if (hero && selected.some((picked) => previewHeroOf(picked.preset) === hero)) {
      deferSameHero.push(item);
      continue;
    }
    if (selected.some((picked) => picked.archetype === item.archetype)) {
      deferSameArchetype.push(item);
      continue;
    }
    selected.push(item);
  }

  if (selected.length < limit) {
    for (const item of deferSameHero) {
      if (selected.length >= limit) break;
      if (selected.some((picked) => picked.signature === item.signature)) continue;
      if (selected.some((picked) => picked.archetype === item.archetype)) continue;
      selected.push(item);
    }
  }

  if (selected.length < limit) {
    for (const item of deferSameArchetype) {
      if (selected.length >= limit) break;
      if (selected.some((picked) => picked.signature === item.signature)) continue;
      selected.push(item);
    }
  }

  if (selected.length < limit) {
    for (const item of scored) {
      if (selected.length >= limit) break;
      if (!selected.some((picked) => picked.preset.id === item.preset.id)) selected.push(item);
    }
  }

  return selected.map((item) => item.preset);
}

export function rankVisualPresetsForInfo(input: {
  infoPlan?: InfoPlan;
  rawInput: string;
  intent?: IntentState;
  spokenConstraints?: SpokenConstraint[];
}): ReferenceVisualPreset[] {
  const visualById = new Map(getVisualPresets().map((preset) => [preset.id, preset]));
  const rule = input.infoPlan?.id ? getCompositionRules().find((item) => item.infoPresetId === input.infoPlan?.id) : undefined;
  const seed = rule?.recommendedVisualPresets
    .map((id) => visualById.get(id))
    .filter((item): item is ReferenceVisualPreset => Boolean(item)) ?? [];
  const avoidIds = new Set(rule?.avoidVisualPresets ?? []);
  const intentText = buildVisualIntentText(input);

  const candidates = [
    ...seed,
    ...getVisualPresets().filter((preset) => !seed.some((item) => item.id === preset.id) && !avoidIds.has(preset.id)),
  ];

  return candidates
    .map((preset, index) => ({
      preset,
      score: scoreVisualPreset(preset, intentText) + Math.max(0, 18 - index),
    }))
    .sort((a, b) => b.score - a.score || (b.preset.priority ?? 0) - (a.preset.priority ?? 0))
    .map((item) => item.preset);
}

function buildVisualIntentText(input: {
  rawInput: string;
  intent?: IntentState;
  infoPlan?: InfoPlan;
  spokenConstraints?: SpokenConstraint[];
}) {
  return [
    input.rawInput,
    input.intent?.designIntentText,
    input.intent ? selectedIntentLabel(input.intent, "targetUser") : "",
    input.intent ? selectedIntentLabel(input.intent, "coverage") : "",
    input.intent ? selectedIntentLabel(input.intent, "valueProposition") : "",
    input.infoPlan?.title,
    input.infoPlan?.summary,
    input.infoPlan?.pageArchitecture,
    ...(input.infoPlan?.structure ?? []),
    ...(input.spokenConstraints ?? []).map((item) => item.inferredLabel ?? item.text),
  ]
    .filter(Boolean)
    .join(" ");
}

function rankColorPresetsForIntent(input: {
  infoPlan?: InfoPlan;
  rawInput: string;
  intent?: IntentState;
  spokenConstraints?: SpokenConstraint[];
}): ReferenceVisualPreset[] {
  const intentText = buildVisualIntentText(input);
  const targetMood = resolveIntentColorMood(input);
  const ranked = rankVisualPresetsForInfo(input);
  return [...ranked].sort(
    (a, b) => scoreColorPresetForMood(b, targetMood, intentText) - scoreColorPresetForMood(a, targetMood, intentText),
  );
}

function scoreColorPresetForMood(preset: ReferenceVisualPreset, targetMood: string, intentText: string) {
  const corpus = searchableText([preset.color, preset.label, preset.tags, preset.reason, preset.bestFor, preset.imagery]);
  let score = scoreVisualPreset(preset, intentText);
  const presetMood = inferColorMoodFromText(corpus);
  if (presetMood === targetMood) score += 24;

  const parsed = parseColorDescription(preset.color ?? "");
  const primary = parsed.primary ?? parsed.accent ?? "";
  const family = primary ? classifyColorFamily(primary) : "neutral";

  if (targetMood === "活力") {
    if (/活力|明亮|暖色|开放|亲近|冲劲|撞色|活泼|卡通|可爱|有冲劲|参与/.test(corpus)) score += 18;
    if (/克制|沉稳|编辑|冷青|暖灰|中性|可信|专业|机构/.test(corpus)) score -= 20;
    if (["orange", "red", "yellow", "pink", "green", "purple"].includes(family)) score += 14;
    if (family === "neutral" || family === "cyan") score -= 12;
  }
  if (targetMood === "温暖" || targetMood === "亲和") {
    if (/暖|亲近|开放|社群|橙|米/.test(corpus)) score += 16;
    if (/冷|克制|机构|海军/.test(corpus)) score -= 10;
  }
  if (targetMood === "克制" || targetMood === "高级" || targetMood === "专业" || targetMood === "沉稳") {
    if (/克制|沉稳|编辑|机构|海军|低饱和|中性/.test(corpus)) score += 16;
    if (/撞色|促销|海报|明亮活动/.test(corpus)) score -= 12;
    if (family === "neutral" || family === "blue" || family === "cyan") score += 8;
  }
  if (targetMood === "可信") {
    if (/可信|专业|蓝|沉稳/.test(corpus)) score += 14;
  }

  return score;
}

function visualPresetDimensionSignature(dimensionId: VisualId, preset: ReferenceVisualPreset) {
  const preview = preset.previewRules ?? {};
  if (dimensionId === "color") {
    const parsed = parseColorDescription(preset.color ?? "");
    return [parsed.primary, parsed.secondary, parsed.accent, preset.label].join("|");
  }
  if (dimensionId === "font") {
    return `${preset.font}|${String(preview.typeScale ?? "")}`;
  }
  if (dimensionId === "card") {
    const cardStyle = String(preview.cardStyle ?? "");
    const radius = String(preview.radiusPx ?? preset.radius ?? "");
    return `${cardStyle}|${radius}`;
  }
  const density = String(preview.density ?? readImplicitDecision(preset, "内容密度") ?? "");
  const whitespace = String(readImplicitDecision(preset, "留白") ?? "");
  return `${density}|${whitespace}`;
}

function selectCohesiveVisualPresets(ranked: ReferenceVisualPreset[], limit: number) {
  const selected: ReferenceVisualPreset[] = [];
  const usedColor = new Set<string>();
  const usedCard = new Set<string>();
  const usedFont = new Set<string>();
  const usedDensity = new Set<string>();
  const remaining = [...ranked];

  const presetKeys = (preset: ReferenceVisualPreset) => ({
    color: visualPresetDimensionSignature("color", preset),
    card: canonicalCardStyleKey(String(preset.previewRules?.cardStyle ?? ""), readImplicitDecision(preset, "卡片样式") ?? ""),
    font: inferFontStyleName(preset.font ?? "", "无衬线体"),
    density: canonicalDensityKey(String(preset.previewRules?.density ?? ""), readImplicitDecision(preset, "内容密度") ?? ""),
  });

  while (selected.length < limit && remaining.length) {
    let bestIndex = 0;
    let bestScore = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      const keys = presetKeys(remaining[index]);
      const novelty =
        (usedColor.has(keys.color) ? 0 : 1) +
        (usedCard.has(keys.card) ? 0 : 1) +
        (usedFont.has(keys.font) ? 0 : 1) +
        (usedDensity.has(keys.density) ? 0 : 1);
      if (novelty > bestScore) {
        bestScore = novelty;
        bestIndex = index;
      }
    }
    const [pick] = remaining.splice(bestIndex, 1);
    const keys = presetKeys(pick);
    usedColor.add(keys.color);
    usedCard.add(keys.card);
    usedFont.add(keys.font);
    usedDensity.add(keys.density);
    selected.push(pick);
  }

  return selected.slice(0, limit);
}

export function alignVisualDimensionsToPreset<T extends { id: VisualId; selectedOptionId?: string; expanded?: boolean; options: OptionItem[] }>(
  dimensions: T[],
  sourceDimensionId: VisualId,
  selectedOptionId: string,
): T[] {
  const presetId = parseReferencePresetIdFromOptionId(selectedOptionId);
  if (!presetId) {
    return dimensions.map((item) =>
      item.id === sourceDimensionId ? { ...item, selectedOptionId, expanded: false } : item,
    );
  }

  return dimensions.map((dimension) => {
    if (dimension.id === sourceDimensionId) {
      return { ...dimension, selectedOptionId, expanded: false };
    }
    const matched = dimension.options.find((option) => option.id === referenceVisualOptionId(dimension.id, presetId));
    if (!matched) return dimension;
    return { ...dimension, selectedOptionId: matched.id, expanded: false };
  });
}

export function resolveCohesiveVisualPreset(project: {
  mechanism: { visualDimensions: Array<{ id: VisualId; selectedOptionId?: string }> };
}) {
  const presetIds = project.mechanism.visualDimensions
    .map((dimension) =>
      dimension.selectedOptionId ? parseReferencePresetIdFromOptionId(dimension.selectedOptionId) : undefined,
    )
    .filter((item): item is string => Boolean(item));
  if (presetIds.length !== VISUAL_DIMENSION_IDS.length) return undefined;
  const unique = new Set(presetIds);
  if (unique.size !== 1) return undefined;
  return getVisualPresets().find((item) => item.id === presetIds[0]);
}

function selectDiversePresetsForDimension(ranked: ReferenceVisualPreset[], dimensionId: VisualId, limit: number) {
  const selected: ReferenceVisualPreset[] = [];
  const used = new Set<string>();

  for (const preset of ranked) {
    if (selected.length >= limit) break;
    const signature = visualPresetDimensionSignature(dimensionId, preset);
    if (used.has(signature)) continue;
    used.add(signature);
    selected.push(preset);
  }

  for (const preset of ranked) {
    if (selected.length >= limit) break;
    if (!selected.some((item) => item.id === preset.id)) selected.push(preset);
  }

  return selected.slice(0, limit);
}

export function buildReferenceVisualSelections(input: {
  infoPlan?: InfoPlan;
  rawInput: string;
  intent?: IntentState;
  spokenConstraints?: SpokenConstraint[];
}): Partial<Record<VisualId, AiVisualSelection>> {
  const ranked = rankVisualPresetsForInfo(input);
  const colorRanked = rankColorPresetsForIntent(input);
  const intentText = buildVisualIntentText(input);
  const reasonContext = {
    infoPlan: input.infoPlan,
    intentText,
  };

  return Object.fromEntries(
    VISUAL_DIMENSION_IDS.map((dimensionId) => {
      const presetRanked = dimensionId === "color" ? colorRanked : ranked;
      const presets = selectCohesiveVisualPresets(presetRanked, 3);
      const optionIds = presets.map((preset) => referenceVisualOptionId(dimensionId, preset.id));
      const recommended = optionIds[0];
      const options = dedupeVisualDimensionOptions(
        dimensionId,
        presets.map((preset, index) => {
          const option = enrichVisualOption(
            dimensionId,
            referenceVisualToOption(dimensionId, preset, index === 0, reasonContext),
          );
          const reason = formatVisualOptionReason(dimensionId, option, reasonContext.infoPlan);
          return { ...option, reason };
        }),
      ).map((option) => ({
        ...option,
        reason: formatVisualOptionReason(dimensionId, option, reasonContext.infoPlan),
      }));
      return [
        dimensionId,
        {
          optionId: recommended,
          recommendedOptionId: recommended,
          optionIds,
          options,
          optionNotes: Object.fromEntries(options.map((option) => [option.id, option.reason ?? ""])),
          source: "recommended",
          reason: "根据已选信息组织和设计意图，从案例库筛出可选方案。",
        },
      ];
    }),
  );
}

export function normalizeUserAddedOption(stage: UserAddedStage, rawText: string, context?: string): NormalizedUserAddedOption {
  const label = rawText.trim();
  const id = `user-${stage}-${normalizeId(label) || Date.now().toString(36)}`;
  const common = {
    id,
    label,
    source: "user-added" as const,
    rawText: label,
    normalizedMeaning: context ? `${label}；上下文：${context}` : label,
    constraints: [`优先尊重用户新增选项：${label}`],
    generationRules: [`必须体现用户新增选项：${label}`],
    custom: true as const,
  };

  if (stage === "info") {
    return {
      ...common,
      pageArchitecture: `用户自定义信息组织：${label}`,
      pageFrame: {
        navigation: "按用户自定义方案决定导航和入口",
        shell: "按用户自定义结构组织页面",
        footer: "保留清楚的下一步入口",
      },
      firstScreen: {
        layout: label,
        priority: label,
        secondary: "根据用户原始提示词补充辅助信息",
      },
      contentFlow: {
        pattern: label,
        browsePattern: "由用户自定义结构决定",
        proofPosition: "根据页面目标补齐证明位置",
      },
      componentPatterns: {
        navigation: "custom",
        hero: "custom",
        finalAction: "custom-action",
      },
      layoutDecisions: {
        userChooses: [label],
        aiCompletes: ["具体区块比例", "组件数量", "响应式排列", "行动入口位置"],
      },
      aboveFold: {
        layout: "user-defined",
        primaryZone: label,
        secondaryZone: "根据用户原始提示词补充说明",
        actionZone: "保持当前流程的下一步行动入口",
      },
      sections: [
        { role: "user-defined-priority", layout: "custom-flow", content: label, why: "用户手动新增的信息组织优先级最高。" },
      ],
      layoutRhythm: label,
      decisionPath: [label, "根据用户提示词继续判断", "进入下一步"],
      previewWireframe: { hero: "user-defined", body: "custom-flow", density: "balanced" },
      contentModules: [
        {
          id: `${id}-module-1`,
          label,
          placement: "user-defined-priority",
          sectionId: "user-defined-priority",
          source: "user-added",
          reason: "用户手动新增的信息组织模块，优先级最高。",
        },
      ],
      forbiddenPatterns: [],
    };
  }

  if (stage === "visual") {
    return {
      ...common,
      reason: "用户手动新增的视觉语言优先于默认推荐。",
      previewRules: { mode: "user-defined", label },
      tokenHints: {},
      forbiddenPatterns: [],
    };
  }

  return common;
}

export function normalizeUserAddedVisualOption(
  dimensionId: VisualId,
  rawText: string,
  context?: string,
): NormalizedUserAddedOption {
  const base = normalizeUserAddedOption("visual", rawText, context);

  if (dimensionId === "color") {
    const tokens = inferColorTokensFromLabel(rawText);
    return {
      ...base,
      tokenHints: {
        primary: tokens.primary,
        secondary: tokens.secondary,
        accent: tokens.accent,
        background: tokens.background,
        text: tokens.text,
        colorStyleName: rawText.trim(),
      },
    };
  }

  if (dimensionId === "font") {
    return {
      ...base,
      tokenHints: { fontStyleName: rawText.trim() },
    };
  }

  if (dimensionId === "card") {
    return {
      ...base,
      tokenHints: { cardStyleName: rawText.trim() },
    };
  }

  return {
    ...base,
    tokenHints: { densityStyleName: rawText.trim() },
  };
}

export function compileGenerationConstraints(input: {
  selectedInfo?: InfoPlan;
  selectedVisualOptions: Array<{ dimensionId: VisualId; option?: OptionItem }>;
}): CompiledGenerationConstraints {
  const selectedVisualOptions = input.selectedVisualOptions
    .map((item) => item.option)
    .filter((item): item is OptionItem => Boolean(item));
  const infoRules = input.selectedInfo?.generationRules ?? [];
  const infoForbidden = input.selectedInfo?.forbiddenPatterns ?? [];
  const visualRules = selectedVisualOptions.flatMap((item) => item.generationRules ?? []);
  const visualForbidden = selectedVisualOptions.flatMap((item) => item.forbiddenPatterns ?? []);

  return {
    selectedInfo: input.selectedInfo,
    selectedVisualOptions,
    infoArchitecture: input.selectedInfo
      ? {
          title: input.selectedInfo.title,
          summary: input.selectedInfo.summary,
          structure: input.selectedInfo.structure,
          pageArchitecture: input.selectedInfo.pageArchitecture,
          pageFrame: input.selectedInfo.pageFrame,
          firstScreen: input.selectedInfo.firstScreen,
          contentFlow: input.selectedInfo.contentFlow,
          componentPatterns: input.selectedInfo.componentPatterns,
          layoutDecisions: input.selectedInfo.layoutDecisions,
          aboveFold: input.selectedInfo.aboveFold,
          sections: input.selectedInfo.sections,
          layoutRhythm: input.selectedInfo.layoutRhythm,
          decisionPath: input.selectedInfo.decisionPath,
          previewWireframe: input.selectedInfo.previewWireframe,
          contentModules: input.selectedInfo.contentModules,
          generationRules: input.selectedInfo.generationRules,
        }
      : undefined,
    visualLanguage: input.selectedVisualOptions
      .map((item) =>
        item.option
          ? {
              dimensionId: item.dimensionId,
              label: item.option.label,
              reason: item.option.reason ?? item.option.knowledge,
              previewRules: item.option.previewRules,
              tokenHints: item.option.tokenHints,
              visualTokens: item.option.visualTokens,
              implicitDecisions: item.option.implicitDecisions,
              previewTemplate: item.option.previewTemplate,
              generationRules: item.option.generationRules,
            }
          : null,
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    generationRules: [...new Set([...infoRules, ...visualRules])],
    forbiddenPatterns: [...new Set([...infoForbidden, ...visualForbidden])],
  };
}

export function getBriefReferenceContext(input?: { rawInput?: string }) {
  const query = input?.rawInput?.trim() ?? "";
  const principles = query
    ? rankReferenceItems(getPrinciples(), query, 4)
    : getPrinciples().slice(0, 4);
  const intentJudgments = query
    ? rankReferenceItems(getIntentJudgments(), query, 4)
    : getIntentJudgments().slice(0, 4);
  return {
    retrievalMode: query ? ("scored-top-k" as const) : ("catalog-slice" as const),
    principles: principles.map(pickReferenceText),
    intentJudgments: intentJudgments.map(pickReferenceText),
  };
}

export type ReferenceRetrievalInput = {
  rawInput?: string;
  intent?: IntentState;
  intentSummary?: string;
  infoPlan?: InfoPlan;
};

function buildRetrievalQuery(input: ReferenceRetrievalInput): string {
  return [
    input.rawInput,
    input.intentSummary,
    input.intent?.designIntentText,
    ...(input.intent?.dimensions.flatMap((dimension) => {
      const selected = dimension.options.find((option) => option.id === dimension.selectedOptionId);
      return [selected?.label, selected?.reason, ...(selected?.constraints ?? [])];
    }) ?? []),
    input.infoPlan?.title,
    input.infoPlan?.summary,
    input.infoPlan?.pageArchitecture,
    ...(input.infoPlan?.structure ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

function rankReferenceItems<T extends ReferenceBase>(items: T[], query: string, limit: number): T[] {
  const terms = query
    .toLowerCase()
    .split(/\s+|，|、|,|;|；/)
    .filter((item) => item.length >= 2);
  if (!terms.length) return items.slice(0, limit);
  return items
    .map((item) => ({
      item,
      score:
        matchCount(
          searchableText([item.id, item.title, item.userLabel, item.summary, item.rationale, item.tags, item.appliesWhen]),
          terms,
        ) + (item.priority ?? 50) / 20,
    }))
    .sort((a, b) => b.score - a.score || (b.item.priority ?? 0) - (a.item.priority ?? 0))
    .slice(0, limit)
    .map((entry) => entry.item);
}

function compactInfoPreset(item: ReferenceInfoPreset) {
  return {
    id: item.id,
    label: item.label,
    basedOnArchetype: item.basedOnArchetype,
    structure: item.structure,
    bestFor: item.bestFor?.slice(0, 3),
    reason: item.reason?.slice(0, 96),
    pageArchitecture: item.pageArchitecture?.slice(0, 96),
  };
}

function scoreContentModule(item: Record<string, unknown>, query: string) {
  const text = searchableText([item.id, item.userLabel, item.title, item.summary, item.tags, item.appliesWhen]);
  const terms = query
    .toLowerCase()
    .split(/\s+|，|、|,|;|；/)
    .filter((term) => term.length >= 2);
  return matchCount(text, terms) + (typeof item.priority === "number" ? item.priority / 20 : 0);
}

function trimChecklist(checklist: ReturnType<typeof pickChecklist>) {
  if (!checklist) return undefined;
  return {
    id: checklist.id,
    title: checklist.title,
    items: checklist.items?.slice(0, 4),
  };
}

function selectInfoPresetsForQuery(input: ReferenceRetrievalInput, limit: number) {
  const query = buildRetrievalQuery(input);
  if (input.intent) {
    return selectInfoPresetsForIntent({
      intent: input.intent,
      rawInput: input.rawInput ?? "",
      limit,
    });
  }
  if (!query.trim()) return getInfoPresets().slice(0, limit);
  return getInfoPresets()
    .map((preset) => ({ preset, score: scoreInfoPreset(preset, query) }))
    .sort((a, b) => b.score - a.score || (b.preset.priority ?? 0) - (a.preset.priority ?? 0))
    .slice(0, limit)
    .map((entry) => entry.preset);
}

export function getMechanismReferenceContext(options?: { compact?: boolean } & ReferenceRetrievalInput) {
  const compact = options?.compact !== false;
  const query = buildRetrievalQuery(options ?? {});
  const useRetrieval = Boolean(query.trim());
  const infoPresetLimit = useRetrieval ? 4 : compact ? 10 : getInfoPresets().length;
  const infoPresets = selectInfoPresetsForQuery(options ?? {}, infoPresetLimit);

  const infoArchitectureGrammar = infoPresets.map((item) =>
    compact
      ? compactInfoPreset(item)
      : {
          id: item.id,
          label: item.label,
          basedOnArchetype: item.basedOnArchetype,
          variantOf: item.variantOf,
          bestFor: item.bestFor,
          reason: item.reason,
          pageArchitecture: item.pageArchitecture,
          pageFrame: item.pageFrame,
          firstScreen: item.firstScreen,
          contentFlow: item.contentFlow,
          componentPatterns: item.componentPatterns,
          layoutDecisions: item.layoutDecisions,
          contentModules: contentModulesFromSections(item).map((module) => ({
            label: module.label,
            placement: module.placement,
            reason: module.reason,
          })),
          forbiddenPatterns: item.forbiddenPatterns,
        },
  );

  const archetypeIds = new Set(
    infoPresets.map((preset) => preset.basedOnArchetype || archetypeOf(preset)).filter(Boolean),
  );
  const archetypeLimit = useRetrieval ? Math.max(archetypeIds.size, 2) : compact ? 8 : undefined;
  const archetypeHints = (infoArchetypes as Array<Record<string, unknown>>)
    .filter((item) => !useRetrieval || archetypeIds.has(String(item.id)))
    .slice(0, archetypeLimit)
    .map((item) =>
      compact
        ? {
            id: item.id,
            title: item.userLabel ?? item.title,
            summary: typeof item.summary === "string" ? item.summary.slice(0, 80) : item.summary,
            appliesWhen: item.appliesWhen,
          }
        : {
            id: item.id,
            title: item.userLabel ?? item.title,
            summary: item.summary,
            decisionLogic: item.decisionLogic,
            pageFrame: item.pageFrame,
            firstScreen: item.firstScreen,
            componentPatterns: item.componentPatterns,
            appliesWhen: item.appliesWhen,
            avoidWhen: item.avoidWhen,
          },
    );

  const presetIds = new Set(infoPresets.map((preset) => preset.id));
  const compositionRules = getCompositionRules()
    .filter((item) => !useRetrieval || presetIds.has(item.infoPresetId))
    .slice(0, useRetrieval ? 4 : undefined)
    .map((item) => ({
      infoPresetId: item.infoPresetId,
      recommendedVisualPresets: item.recommendedVisualPresets,
      avoidVisualPresets: item.avoidVisualPresets,
      reason: item.reason,
    }));

  const visualCandidates =
    useRetrieval && options?.intent
      ? rankVisualPresetsForInfo({
          infoPlan: options.infoPlan,
          rawInput: options.rawInput ?? "",
          intent: options.intent,
        }).slice(0, 3)
      : getVisualPresets().slice(0, compact ? 6 : 12);
  const visualToneHints = visualCandidates.map((item) => ({
    id: item.id,
    label: item.label,
    reason: compact ? item.reason?.slice(0, 64) : item.reason,
    color: compact ? item.color?.slice(0, 48) : item.color,
    font: compact ? item.font?.slice(0, 48) : item.font,
  }));

  const moduleLimit = useRetrieval ? 8 : compact ? 18 : (contentModulesRaw as Array<Record<string, unknown>>).length;
  const moduleCatalog = (contentModulesRaw as Array<Record<string, unknown>>)
    .map((item) => ({ item, score: scoreContentModule(item, query) }))
    .sort((a, b) => b.score - a.score || String(a.item.id).localeCompare(String(b.item.id)))
    .slice(0, moduleLimit)
    .map(({ item }) => ({
      id: item.id,
      label: formatContentModuleLabel(
        typeof item.userLabel === "string" ? item.userLabel : typeof item.title === "string" ? item.title : "",
      ),
      purpose: typeof item.summary === "string" ? (compact ? item.summary.slice(0, 48) : item.summary) : "",
      bestPosition: ["content"],
      canBeAboveFold: false,
      pairsWith: [],
      avoidPosition: [],
    }));

  const archetypeKeys = [...archetypeIds];
  const orchestrationHints = moduleOrchestrationHints
    .filter(
      (hint) =>
        !useRetrieval ||
        hint.archetypes.some((archetype) => archetypeKeys.some((key) => key.includes(archetype) || archetype.includes(key))),
    )
    .slice(0, useRetrieval ? 4 : undefined);

  const antiPatternLimit = useRetrieval ? 3 : 6;
  const persuasionLimit = useRetrieval ? 2 : compact ? 4 : 6;
  const caseLimit = useRetrieval ? 2 : compact ? 3 : 4;
  const antiPatterns = (
    query.trim() ? rankReferenceItems(getCoreAntiPatterns(), query, antiPatternLimit) : getCoreAntiPatterns().slice(0, antiPatternLimit)
  ).map(pickReferenceText);
  const persuasionMechanisms = (
    query.trim()
      ? rankReferenceItems(getPersuasionMechanisms(), query, persuasionLimit)
      : getPersuasionMechanisms().slice(0, persuasionLimit)
  ).map(pickReferenceText);
  const casePatternSummaries = (
    query.trim()
      ? rankReferenceItems(getCasePatternSummaries(), query, caseLimit)
      : getCasePatternSummaries().slice(0, caseLimit)
  ).map(pickReferenceText);

  return {
    retrievalMode: useRetrieval ? ("scored-top-k" as const) : ("catalog-slice" as const),
    matchedPresetIds: infoPresets.map((preset) => preset.id),
    infoArchitectureGrammar,
    infoArchetypes: archetypeHints,
    contentModuleCatalog: moduleCatalog,
    orchestrationHints,
    compositionRules,
    visualToneHints,
    antiPatterns,
    persuasionMechanisms,
    casePatternSummaries,
    preRecommendationChecklist: trimChecklist(pickChecklist("pre-recommendation")),
  };
}

export function getOrchestrationReferenceContext(input?: ReferenceRetrievalInput) {
  const ctx = getMechanismReferenceContext({ ...input, compact: true });
  return {
    retrievalMode: ctx.retrievalMode,
    matchedPresetIds: ctx.matchedPresetIds,
    contentModuleCatalog: ctx.contentModuleCatalog,
    orchestrationHints: ctx.orchestrationHints,
    infoArchetypes: ctx.infoArchetypes,
  };
}

function pickReferenceText(item: ReferenceBase) {
  return {
    id: item.id,
    title: item.userLabel ?? item.title,
    summary: item.summary,
    rationale: item.rationale,
    risks: item.risks,
    tags: item.tags,
  };
}

function normalizeId(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fa5-]/g, "");
}

function selectedIntentLabel(intent: IntentState, id: DimensionId) {
  const dimension = intent.dimensions.find((item) => item.id === id);
  return dimension?.options.find((option) => option.id === dimension.selectedOptionId)?.label ?? "";
}

function searchableText(parts: Array<unknown>) {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
}

function matchCount(text: string, terms: string[]) {
  return terms.reduce((score, term) => (text.includes(term.toLowerCase()) ? score + 1 : score), 0);
}

function scoreInfoPreset(preset: ReferenceInfoPreset, intentText: string) {
  const text = searchableText([
    preset.id,
    preset.label,
    preset.bestFor,
    preset.tags,
    preset.structure,
    preset.reason,
    preset.pageArchitecture,
    preset.layoutRhythm,
    preset.decisionPath,
  ]);
  const input = intentText.toLowerCase();
  let score = (preset.priority ?? 70) / 10;
  score += matchCount(text, input.split(/\s+|，|、|,|;|；/).filter((item) => item.length >= 2)) * 2;

  if (/第一次|了解|公司是谁|品牌是谁|可信|可靠|专业|合作|企业|官网/.test(input)) {
    score += keywordBoost(preset.id, ["trust-first", "clear-conversion"], 14);
  }
  if (/案例|成果|客户|背书|资质|证明|实力|有实力/.test(input)) {
    score += keywordBoost(preset.id, ["trust-first", "compare"], 18);
  }
  if (/技术|科技|产品|服务|能力|功能|demo|界面|系统|平台|工具|ai/i.test(input)) {
    score += keywordBoost(preset.id, ["product-demo", "tool-operate", "clear-conversion"], 16);
  }
  if (/购买|合作|咨询|转化|联系|报价|套餐|价格|下单/.test(input)) {
    score += keywordBoost(preset.id, ["clear-conversion", "compare", "price-package"], 14);
  }
  if (/作品|案例展示|摄影|设计|空间|美食|艺术|portfolio/i.test(input)) {
    score += keywordBoost(preset.id, ["work-first"], 18);
  }
  if (/内容|文章|报告|观点|媒体|专题/.test(input)) {
    score += keywordBoost(preset.id, ["editorial", "content-hub"], 18);
  }
  if (/活动|报名|课程|发布会|讲座/.test(input)) {
    score += keywordBoost(preset.id, ["event", "clear-conversion"], 18);
  }

  if (/企业官网|知道我们是谁|认识品牌|不是推|不是.*套餐|不是.*成交/.test(input)) {
    score += keywordBoost(preset.id, ["trust-first", "editorial"], 26);
    score += keywordBoost(preset.id, ["product-demo"], 6);
    score -= keywordPenalty(preset.id, ["clear-conversion", "price-package", "tool-operate"], 32);
  }
  if (/b2b|实施服务|交付案例|资质.*流程|流程.*资质/.test(input)) {
    score += keywordBoost(preset.id, ["trust-first", "compare"], 26);
    score -= keywordPenalty(preset.id, ["work-first", "content-hub", "event", "clear-conversion", "product-demo"], 24);
  }
  if (/saas|数据分析工具|看懂怎么用|页面上试|试一两步|直接操作/.test(input)) {
    score += keywordBoost(preset.id, ["product-demo", "tool-operate"], 28);
    score -= keywordPenalty(preset.id, ["clear-conversion", "work-first", "trust-first"], 22);
  }
  if (/三个档位|订阅官网|professional|enterprise|犹豫选|选 professional|选 enterprise/i.test(input)) {
    score += keywordBoost(preset.id, ["compare", "price-package"], 32);
    score -= keywordPenalty(preset.id, ["work-first", "editorial", "trust-first", "clear-conversion", "product-demo", "tool-operate"], 28);
  }
  if (/一个服务|一对一|明码标价|就差.*预约|只差.*预约/.test(input)) {
    score += keywordBoost(preset.id, ["clear-conversion", "price-package"], 28);
    score -= keywordPenalty(preset.id, ["compare", "content-hub", "product-demo", "tool-operate", "work-first"], 26);
  }
  if (/案例故事|项目故事|叙事|故事线/.test(input)) {
    score += keywordBoost(preset.id, ["story-gallery"], 20);
  }
  if (/案例先行|案例结果|先看案例|成果先行/.test(input)) {
    score += keywordBoost(preset.id, ["cases-before-proof"], 22);
    score -= keywordPenalty(preset.id, ["trust-first-service"], 8);
  }
  if (/痛点|问题.*方案|先懂问题|对齐问题/.test(input)) {
    score += keywordBoost(preset.id, ["problem-solution"], 22);
  }
  if (/顾虑|犹豫|评价先行|证明.*offer|先信/.test(input)) {
    score += keywordBoost(preset.id, ["proof-before-offer"], 20);
  }
  if (/章节|跳读|白皮书|分章/.test(input)) {
    score += keywordBoost(preset.id, ["chapter-thread"], 20);
  }
  if (/按任务|任务分栏|我要学|我要解决/.test(input)) {
    score += keywordBoost(preset.id, ["task-lanes"], 20);
  }
  if (/引导|示例走|walkthrough|跟着做/.test(input)) {
    score += keywordBoost(preset.id, ["guided-walkthrough"], 20);
  }
  if (/场景矩阵|对号入座|使用场景.*选/.test(input)) {
    score += keywordBoost(preset.id, ["scenario-matrix"], 22);
  }
  if (/议程|时间安排|时间表|日程/.test(input)) {
    score += keywordBoost(preset.id, ["agenda-first"], 22);
  }
  if (/价值.*价格|先讲清价值|不比价格/.test(input)) {
    score += keywordBoost(preset.id, ["value-before-price"], 22);
  }

  return score;
}

function scoreVisualPreset(preset: ReferenceVisualPreset, intentText: string) {
  const text = searchableText([
    preset.id,
    preset.label,
    preset.bestFor,
    preset.tags,
    preset.reason,
    preset.color,
    preset.font,
    preset.layout,
    preset.imagery,
  ]);
  const input = intentText.toLowerCase();
  let score = (preset.priority ?? 70) / 10;
  score += matchCount(text, input.split(/\s+|，|、|,|;|；/).filter((item) => item.length >= 2)) * 2;

  if (/科技|技术|系统|平台|数据|安全|基础设施|ai/i.test(input)) {
    score += keywordBoost(preset.id, ["structured-tech", "data-infrastructure", "product-console", "workflow"], 18);
  }
  if (/高级|高端|克制|专业|可信|可靠|实力|企业|官网/.test(input)) {
    score += keywordBoost(preset.id, ["institutional", "navy-authority", "structured-tech", "clean"], 16);
  }
  if (/不要.*蓝紫|不.*蓝紫|别.*蓝紫|不要.*渐变|不.*渐变/.test(input)) {
    score -= keywordBoost(preset.id, ["dark-product-stage", "course-launch", "graphic-poster", "visual-essay"], 16);
  }
  if (/促销|大促|活动|报名|课程|发布/.test(input)) {
    score += keywordBoost(preset.id, ["event-action", "course-launch", "offer-clean"], 16);
  }
  if (/作品|图片|摄影|艺术|空间|美食|珠宝/.test(input)) {
    score += keywordBoost(preset.id, ["gallery", "cinematic", "detail"], 16);
  }
  if (/活力|活泼|卡通|可爱|童趣|元气|明快|撞色|有冲劲|参与感/.test(input)) {
    score += keywordBoost(
      preset.id,
      ["bright-event", "community-warm", "graphic-poster", "course-launch", "event-action", "offer-clean"],
      24,
    );
    score += matchCount(text, ["活力", "明亮", "暖色", "开放", "亲近", "有冲劲", "撞色", "行动", "参与"]) * 4;
    score -= keywordPenalty(preset.id, ["institutional", "navy-authority", "editorial-restraint", "clean-neutral"], 16);
  }
  if (/温暖|亲和|亲近|社群/.test(input) && !/克制|沉稳/.test(input)) {
    score += keywordBoost(preset.id, ["community-warm", "friendly", "offer-clean"], 14);
  }
  if (/儿童|培训|教育|美术|招生|亲子|新手/.test(input) && /活力|卡通|可爱|活泼|温暖|亲和/.test(input)) {
    score += keywordBoost(preset.id, ["bright-event", "community-warm", "friendly", "course-launch"], 12);
  }

  return score;
}

function archetypeOf(preset: ReferenceInfoPreset) {
  if (preset.basedOnArchetype) return preset.basedOnArchetype;
  const tag = preset.tags?.find((item) => item && !item.startsWith("info-option") && !item.startsWith("variant:"));
  return tag ?? preset.id;
}

function keywordBoost(id: string, fragments: string[], amount: number) {
  return fragments.some((fragment) => id.includes(fragment)) ? amount : 0;
}

function keywordPenalty(id: string, fragments: string[], amount: number) {
  return fragments.some((fragment) => id.includes(fragment)) ? amount : 0;
}

function wireframeSignature(previewWireframe: Record<string, unknown>) {
  const hero = typeof previewWireframe.hero === "string" ? previewWireframe.hero : "unknown";
  const body = typeof previewWireframe.body === "string" ? previewWireframe.body : "unknown";
  return `${hero}::${body}`;
}

export function referenceVisualOptionId(dimensionId: VisualId, presetId: string) {
  return `${dimensionId}-${presetId}`;
}

export function parseReferencePresetIdFromOptionId(optionId: string) {
  return optionId.match(/^(?:color|font|card|density)-(.+)$/)?.[1];
}

export function resolveVisualPresetFromProject(project: {
  mechanism: { visualDimensions: Array<{ id: VisualId; selectedOptionId?: string }> };
}) {
  const byPriority: VisualId[] = ["color", "font", "card", "density"];
  for (const dimensionId of byPriority) {
    const dimension = project.mechanism.visualDimensions.find((item) => item.id === dimensionId);
    const presetId = dimension?.selectedOptionId
      ? parseReferencePresetIdFromOptionId(dimension.selectedOptionId)
      : undefined;
    if (!presetId) continue;
    const preset = getVisualPresets().find((item) => item.id === presetId);
    if (preset) return preset;
  }
  return undefined;
}

type VisualReasonContext = {
  infoPlan?: InfoPlan;
  intentText?: string;
};

function inferColorMoodFromPreset(preset: ReferenceVisualPreset) {
  const moodTag = preset.tags?.find(
    (tag) => /[、,，]/.test(tag) && !/visual-|image-|spacious|balanced|compact|hero/i.test(tag),
  );
  const corpus = [moodTag, preset.summary, preset.color, ...(preset.generationRules ?? []).slice(0, 1)].filter(Boolean).join(" ");
  return inferColorMoodFromText(corpus);
}

function referenceColorPrimary(preset: ReferenceVisualPreset) {
  const parsed = parseColorDescription(preset.color ?? "");
  const preview = preset.previewRules ?? {};
  const accent = typeof preview.accent === "string" ? preview.accent : undefined;
  const background = typeof preview.background === "string" ? preview.background : undefined;
  return parsed.accent || parsed.primary || accent || parsed.background || background || "#2563eb";
}

function referenceColorStyleName(preset: ReferenceVisualPreset) {
  const primary = referenceColorPrimary(preset);
  const mood = inferColorMoodFromPreset(preset);
  return clampStyleName(colorStyleNameFromPrimary(primary, mood), 8, "配色方案");
}

function referenceColorKnowledge(preset: ReferenceVisualPreset, styleName: string) {
  const parsed = parseColorDescription(preset.color ?? "");
  const accent = parsed.accent || parsed.primary;
  const background = parsed.background || parsed.secondary;
  const moodTag = preset.tags?.find(
    (tag) => /[、,，]/.test(tag) && !/visual-|image-|spacious|balanced|compact|hero/i.test(tag),
  );
  const parts = [
    accent ? `强调色 ${accent}` : "",
    background ? `背景 ${background}` : "",
    moodTag ? moodTag.split(/[、,，]/)[0]?.trim() : "",
  ].filter(Boolean);
  return parts.join("，") || styleName;
}

function referenceVisualToOption(
  dimensionId: VisualId,
  preset: ReferenceVisualPreset,
  recommended: boolean,
  context?: VisualReasonContext,
): OptionItem {
  const parsedColors = parseColorDescription(preset.color ?? "");
  const colorStyleName = dimensionId === "color" ? referenceColorStyleName(preset) : undefined;
  const draft: OptionItem = {
    id: referenceVisualOptionId(dimensionId, preset.id),
    label: referenceVisualLabel(dimensionId, preset),
    knowledge: referenceVisualLibraryReason(dimensionId, preset),
    reason: "",
    signal: recommended ? "recommended" : undefined,
    source: "reference",
    previewRules: preset.previewRules,
    tokenHints: {
      ...preset.tokenHints,
      colorDescription: preset.color,
      colorStyleName: colorStyleName ?? clampStyleName(preset.label || preset.title, 8, "配色方案"),
      fontDescription: preset.font,
      fontStyleName: inferFontStyleName(preset.font ?? "", "清晰黑体"),
      cardStyleName: inferCardStyleLabel(preset),
      densityStyleName: inferDensityLabel(preset),
      primary: parsedColors.primary,
      secondary: parsedColors.secondary,
      accent: parsedColors.accent,
    },
    visualTokens: preset.visualTokens,
    implicitDecisions: preset.implicitDecisions,
    previewTemplate: preset.previewTemplate,
    generationRules: [
      dimensionId === "color"
        ? `色彩方向「${colorStyleName ?? referenceColorStyleName(preset)}」。`
        : `视觉方向参考「${preset.label}」。`,
      ...preset.generationRules,
      dimensionRule(dimensionId, preset),
    ].filter(Boolean),
    forbiddenPatterns: preset.forbiddenPatterns,
  };
  return {
    ...draft,
    reason: formatVisualOptionReason(dimensionId, draft, context?.infoPlan),
  };
}

function referenceVisualLabel(dimensionId: VisualId, preset: ReferenceVisualPreset) {
  if (dimensionId === "color") return referenceColorStyleName(preset);
  if (dimensionId === "font") return inferFontStyleName(preset.font ?? "", "清晰黑体");
  if (dimensionId === "card") return inferCardStyleLabel(preset);
  return inferDensityLabel(preset);
}

function referenceVisualLibraryReason(dimensionId: VisualId, preset: ReferenceVisualPreset) {
  const preview = preset.previewRules ?? {};
  if (dimensionId === "font") {
    const parts = [preset.font?.trim(), preview.typeScale ? `字阶偏${preview.typeScale}` : ""].filter(Boolean);
    return parts.join("；") || (preset.reason ?? "").trim();
  }
  if (dimensionId === "card") {
    const parts = [
      readImplicitDecision(preset, "卡片样式"),
      readImplicitDecision(preset, "阴影层级"),
      preset.radius ? `圆角 ${preset.radius}` : "",
    ].filter(Boolean);
    return parts.join("，") || (preset.reason ?? "").trim();
  }
  if (dimensionId === "density") {
    const parts = [
      readImplicitDecision(preset, "内容密度"),
      readImplicitDecision(preset, "留白"),
      preset.imagery?.trim(),
    ].filter(Boolean);
    return parts.join("，") || (preset.reason ?? "").trim();
  }
  if (dimensionId === "color") {
    return referenceColorKnowledge(preset, referenceColorStyleName(preset));
  }
  return (preset.reason || preset.rationale || preset.summary || "").trim();
}

export function getVisualGrammarTeacherContext(input: {
  infoPlan?: InfoPlan;
  rawInput: string;
  intent?: IntentState;
  compact?: boolean;
}) {
  const compact = input.compact !== false;
  const ranked = rankVisualPresetsForInfo(input);
  const compositionRule = input.infoPlan?.id
    ? getCompositionRules().find((item) => item.infoPresetId === input.infoPlan?.id)
    : undefined;
  const sample = (dimensionId: VisualId, limit: number) =>
    selectDiversePresetsForDimension(ranked, dimensionId, limit).map((preset) => ({
      id: preset.id,
      label: referenceVisualLabel(dimensionId, preset),
      color: preset.color,
      font: preset.font,
      cardStyle: preset.previewRules?.cardStyle,
      density: preset.previewRules?.density,
      reason: referenceVisualLibraryReason(dimensionId, preset).slice(0, 80),
      tokens: preset.visualTokens,
    }));

  return {
    teacherNote:
      "以下是案例库范例，仅供学习气质、参数粒度与理由写法。你必须结合当前信息组织现场创作 3 个互不相同的选项，禁止照搬范例标题或色值。",
    compositionRule: compositionRule
      ? {
          recommendedVisualPresets: compositionRule.recommendedVisualPresets,
          avoidVisualPresets: compositionRule.avoidVisualPresets,
          reason: compositionRule.reason,
        }
      : undefined,
    examples: {
      color: sample("color", compact ? 2 : 4),
      font: sample("font", compact ? 2 : 4),
      card: sample("card", compact ? 2 : 4),
      density: sample("density", compact ? 2 : 4),
    },
    catalogVocabulary: visualCatalogVocabulary(),
    outputContract: {
      labelMaxLength: 8,
      optionsPerDimension: 3,
      requiredFields: ["id", "label", "reason", "tokenHints", "previewRules", "generationRules"],
    },
  };
}

function readImplicitDecision(preset: ReferenceVisualPreset, key: string) {
  const direct = preset.implicitDecisions?.[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const preview = preset.previewRules?.implicitDecisions;
  if (preview && typeof preview === "object" && !Array.isArray(preview)) {
    const nested = (preview as Record<string, unknown>)[key];
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return undefined;
}

function inferCardStyleLabel(preset: ReferenceVisualPreset) {
  const cardStyle = String(preset.previewRules?.cardStyle ?? "");
  const implicit = readImplicitDecision(preset, "卡片样式");
  const fromKey = cardStyleNameFromKey(cardStyle, implicit);
  if (fromKey !== "克制卡片" || cardStyle || implicit) return fromKey;
  if (preset.radius) return clampStyleName(`${preset.radius}卡片`, 8, "克制卡片");
  return "克制卡片";
}

function inferDensityLabel(preset: ReferenceVisualPreset) {
  const implicit = readImplicitDecision(preset, "内容密度");
  const density = String(preset.previewRules?.density ?? "");
  return canonicalDensityLabel(canonicalDensityKey(density, implicit ?? ""));
}

function dimensionRule(dimensionId: VisualId, preset: ReferenceVisualPreset) {
  if (dimensionId === "color") return `色彩采用：${preset.color}`;
  if (dimensionId === "font") return `字体采用：${preset.font}`;
  if (dimensionId === "card") return `卡片样式采用：${inferCardStyleLabel(preset)}；圆角与阴影按案例库 implicitDecisions 自动补齐。`;
  return `内容密度采用：${inferDensityLabel(preset)}；留白与图片处理由系统自动补齐。`;
}
