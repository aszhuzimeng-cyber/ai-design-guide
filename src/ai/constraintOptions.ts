import { formatContentModuleLabel } from "../contentModuleLabel";
import type { ContentModulePlacement, DimensionId, InfoPlan, IntentState, OptionItem, VisualId } from "../types";
import { normalizeId } from "../utils/id";
import { classifyColorFamily, colorStyleNameFromPrimary, inferColorMoodFromText, inferPrimaryHexFromLabel, resolveColorPalette } from "../visualColorPalette";
import { constraintTargetsFunctionModule, constraintTargetsInfoArchitecture } from "./constraintPlacement";
import { optionReflectsSpokenConstraint, planReflectsSpokenConstraint, filterVisualMarkingConstraints, optionReflectsSpokenConstraintForVisual, spokenConstraintAppliesToIntentDimension } from "./spokenConstraints";
import { collectIntentMoodTexts, constraintSemanticallyMatchesOption, extractMoodKeyword, resolveIntentColorMood } from "./intentConstraintSemantics";
import { VISUAL_DIMENSION_INITIAL_OPTIONS } from "./catalogs";
import { getVisualSpec } from "./visualSpecs";
import type { SpokenConstraint } from "./types";

const VISUAL_DIMENSION_PATTERNS: Record<VisualId, RegExp> = {
  color: /色|蓝|橙|红|绿|黄|紫|暖|冷|深|浅|饱和|主色|配色|白底|黑/,
  font: /字体|衬线|无衬线|黑体|宋体|字重|排版|细体|粗体/,
  card: /圆角|阴影|卡片|描边|扁平|边框|无影|分组/,
  density: /留白|疏松|紧凑|密集|密度|间距|一屏/,
};

const INTENT_INPUT_PATTERNS: Record<DimensionId, RegExp[]> = {
  targetUser: [
    /目标用户[是为：:\s]+([^，。；\n]{2,28})/,
    /面向([^，。；\n]{2,20}?)(?:的|用户|客户|群体)/,
    /主要服务([^，。；\n]{2,28})/,
    /受众[是为：:\s]+([^，。；\n]{2,28})/,
  ],
  coverage: [
    /突出([^，。；\n]{2,28})/,
    /重点(?:展示|突出|放在)([^，。；\n]{2,28})/,
    /首屏(?:放|展示|突出)([^，。；\n]{2,28})/,
    /信息组织[是为：:\s]+([^，。；\n]{2,40})/,
  ],
  valueProposition: [
    /(?:显得|要|希望|需要|追求)(专业|可信|高级|清晰|简约|稳重|活力|温暖|克制|有实力)/,
    /整体(?:风格|感觉|气质)[是为：:\s]+([^，。；\n]{2,16})/,
    /(?:风格|气质)[要为是：:\s]+([^，。；\n]{2,16})/,
  ],
};

function constraintOptionId(scope: string, text: string) {
  const slug = normalizeId(text).slice(0, 48) || "item";
  return `constraint-${scope}-${slug}`;
}

function shortenConstraintLabel(text: string, max = 18) {
  const cleaned = text
    .trim()
    .replace(/^(需要|要|希望|必须|应有|包含|加上|采用|使用|主打|突出|不要|别|避免|禁止|不要太)/, "")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function extractIntentPhrasesFromInput(rawInput: string, dimensionId: DimensionId): string[] {
  const phrases: string[] = [];
  for (const pattern of INTENT_INPUT_PATTERNS[dimensionId]) {
    const match = rawInput.match(pattern);
    if (!match) continue;
    const captured = (match[2] ?? match[1])?.trim();
    if (captured && captured.length >= 2) phrases.push(captured);
  }
  return phrases;
}

function visualConstraintMatchesDimension(dimensionId: VisualId, text: string) {
  return VISUAL_DIMENSION_PATTERNS[dimensionId].test(text);
}

function inferPrimaryFromColorText(text: string) {
  return inferPrimaryHexFromLabel(text);
}

function inferFontLabel(text: string) {
  if (/无衬线|黑体|系统|sans/i.test(text)) return "无衬线体";
  if (/衬线|宋|明朝|serif/i.test(text)) return "衬线体";
  if (/粗黑|标题字|展示/.test(text)) return "粗黑体";
  if (/细|轻盈/.test(text)) return "无衬线体";
  if (/无衬线|黑体|系统/.test(text)) return "无衬线体";
  return shortenConstraintLabel(text, 8) || "自定义字体";
}

function inferCardLabel(text: string) {
  if (/扁平|无影/.test(text)) return "扁平无影";
  if (/描边|边框/.test(text)) return "描边分组";
  if (/强阴影|悬浮/.test(text)) return "强阴影";
  if (/轻阴影|柔和/.test(text)) return "轻阴影";
  return shortenConstraintLabel(text, 8) || "自定义卡片";
}

function inferDensityLabel(text: string) {
  if (/疏松|大留白|留白多|spacious/i.test(text)) return "疏松留白";
  if (/紧凑|密集|高信息|compact/i.test(text)) return "紧凑密集";
  if (/中等|均衡|平衡/.test(text)) return "中等密度";
  return shortenConstraintLabel(text, 8) || "自定义密度";
}

const MOOD_COLOR_SPEC: Record<string, string> = {
  活力: "lively",
  温暖: "warm",
  亲和: "warm",
  克制: "low",
  高级: "low",
  简约: "low",
  专业: "blue",
  可信: "blue",
  稳重: "blue",
  沉稳: "blue",
};

function optionReflectsIntentColorMood(option: OptionItem, mood: string) {
  const haystack = [option.label, option.reason, option.knowledge, ...(option.generationRules ?? [])]
    .filter(Boolean)
    .join(" ");
  if (haystack.includes(mood)) return true;
  if (mood === "活力" && /活力|撞色|明亮|活泼|卡通|可爱|有冲劲|参与|橙|绿紫/.test(haystack)) return true;

  const palette = resolveColorPalette(option);
  const family = classifyColorFamily(palette.primary);
  if (mood === "活力") {
    if (/克制|沉稳|暖灰|冷青|中性|可信/.test(haystack)) return false;
    return ["orange", "red", "yellow", "pink", "green", "purple"].includes(family);
  }
  return inferColorMoodFromText(haystack) === mood;
}

function buildMoodColorOption(mood: string, sourceText: string): OptionItem | undefined {
  const specId = MOOD_COLOR_SPEC[mood] ?? (/(卡通|可爱|活泼|元气)/.test(sourceText) ? "lively" : undefined);
  if (!specId) return undefined;
  const spec = getVisualSpec("color", specId);
  if (!spec) return undefined;
  const tokens = spec.cssTokens;
  const primary = tokens.primary ?? "#2563eb";
  return {
    id: `color-intent-mood-${specId}`,
    label: spec.label,
    signal: "constraint",
    source: "user-added",
    reason: `来自你已选的「${shortenConstraintLabel(sourceText, 8)}」气质`,
    knowledge: spec.instruction,
    constraints: [sourceText],
    generationRules: [spec.instruction, `整体色彩需体现${mood}感，与核心感觉一致。`],
    tokenHints: {
      primary,
      secondary: tokens.secondary,
      accent: tokens.accent,
      background: tokens.background,
      text: tokens.text,
      colorStyleName: spec.label,
    },
    normalizedMeaning: sourceText,
  };
}

export function injectIntentMoodColorOptions(
  dimensionId: VisualId,
  options: OptionItem[],
  context: { intent?: IntentState; spokenConstraints?: SpokenConstraint[]; rawInput?: string },
): OptionItem[] {
  if (dimensionId !== "color") return options;

  const moodTexts = collectIntentMoodTexts(context);
  if (!moodTexts.length) return options;

  const mood = resolveIntentColorMood(context);
  if (!mood || mood === "可信") return options;
  if (options.some((option) => optionReflectsIntentColorMood(option, mood))) return options;

  const sourceText = moodTexts.find((text) => extractMoodKeyword(text) === mood || inferColorMoodFromText(text) === mood) ?? moodTexts[0];
  const moodOption = buildMoodColorOption(mood, sourceText);
  if (!moodOption) return options;

  const merged = [moodOption, ...options.filter((option) => option.id !== moodOption.id)];
  return merged.slice(0, VISUAL_DIMENSION_INITIAL_OPTIONS);
}

export function buildConstraintOptionFromText(scope: string, text: string, kind?: SpokenConstraint["kind"]): OptionItem {
  const label = shortenConstraintLabel(text);
  return {
    id: constraintOptionId(scope, text),
    label,
    signal: "constraint",
    source: "user-added",
    reason: "来自你在需求中的说明",
    knowledge: text,
    constraints: [text],
    generationRules: [text],
    normalizedMeaning: text,
    ...(kind ? { tokenHints: { constraintKind: kind } } : {}),
  };
}

export function buildVisualConstraintOption(dimensionId: VisualId, text: string): OptionItem {
  const base = buildConstraintOptionFromText(`visual-${dimensionId}`, text, "visual");
  if (dimensionId === "color") {
    const primary = inferPrimaryFromColorText(text);
    const styleName = colorStyleNameFromPrimary(primary, /专业|可信|高级|清晰/.exec(text)?.[0] ?? "可信");
    return {
      ...base,
      label: /[\u4e00-\u9fa5]{2,8}/.test(text) ? shortenConstraintLabel(text, 8) : styleName,
      tokenHints: { primary, colorStyleName: styleName },
      generationRules: [text, `主色倾向 ${primary}，整体按用户说明「${text}」执行。`],
    };
  }
  if (dimensionId === "font") {
    const label = inferFontLabel(text);
    return { ...base, label, tokenHints: { fontStyleName: label } };
  }
  if (dimensionId === "card") {
    const label = inferCardLabel(text);
    return { ...base, label, tokenHints: { cardStyleName: label } };
  }
  const label = inferDensityLabel(text);
  return { ...base, label, tokenHints: { densityStyleName: label } };
}

export function injectIntentConstraintOptions(
  dimensionId: DimensionId,
  options: OptionItem[],
  spokenConstraints: SpokenConstraint[],
  rawInput: string,
  briefConstraintOptionId?: string,
): OptionItem[] {
  const candidates = new Map<string, SpokenConstraint | string>();

  for (const constraint of spokenConstraints) {
    if (spokenConstraintAppliesToIntentDimension(dimensionId, constraint)) {
      candidates.set(constraint.text, constraint);
    }
  }
  for (const phrase of extractIntentPhrasesFromInput(rawInput, dimensionId)) {
    if (![...candidates.keys()].some((key) => key.includes(phrase) || phrase.includes(key))) {
      candidates.set(phrase, phrase);
    }
  }

  const toInject: OptionItem[] = [];
  for (const [text, item] of candidates) {
    const constraint =
      typeof item === "string"
        ? ({ kind: "general" as const, text: item })
        : item;
    const alreadyCovered = options.some(
      (option) =>
        option.id === briefConstraintOptionId ||
        constraintSemanticallyMatchesOption(dimensionId, constraint, option) ||
        optionReflectsSpokenConstraint(rawInput, option, constraint, dimensionId),
    );
    if (!alreadyCovered) {
      const label = constraint.inferredLabel ?? text;
      const injected = buildConstraintOptionFromText(dimensionId, label, constraint.kind);
      toInject.push(constraint.mapsToOptionId ? { ...injected, id: constraint.mapsToOptionId } : injected);
    }
  }

  if (!toInject.length) return options;
  const injectedIds = new Set(toInject.map((option) => option.id));
  return [...toInject, ...options.filter((option) => !injectedIds.has(option.id))];
}

export function injectVisualConstraintOptions(
  dimensionId: VisualId,
  options: OptionItem[],
  spokenConstraints: SpokenConstraint[],
  rawInput: string,
  context?: { intent?: IntentState },
): OptionItem[] {
  const spoken = filterVisualMarkingConstraints(rawInput, spokenConstraints, dimensionId);
  const toInject: OptionItem[] = [];
  for (const constraint of spoken) {
    if (options.some((option) => optionReflectsSpokenConstraintForVisual(rawInput, option, constraint))) continue;
    const label = constraint.inferredLabel ?? constraint.text;
    toInject.push(buildVisualConstraintOption(dimensionId, label));
  }
  let merged = options;
  if (toInject.length) {
    const injectedIds = new Set(toInject.map((option) => option.id));
    merged = [...toInject, ...options.filter((option) => !injectedIds.has(option.id))];
  }
  merged = injectIntentMoodColorOptions(dimensionId, merged, {
    intent: context?.intent,
    spokenConstraints,
    rawInput,
  });
  const constraintLead = merged.filter((option) => option.signal === "constraint");
  const rest = merged.filter((option) => option.signal !== "constraint");
  return [...constraintLead, ...rest];
}

function extractStructureFromInfoConstraint(text: string) {
  return text
    .split(/[，,、]|然后|接着|再|→|->/)
    .map((part) => part.trim().replace(/^(首屏|然后|再)/, ""))
    .filter((part) => part.length >= 2)
    .map((part) => shortenConstraintLabel(part, 12));
}

export function buildConstraintInfoPlan(rawInput: string, spokenConstraints: SpokenConstraint[]): InfoPlan | undefined {
  const infoConstraints = spokenConstraints.filter((item) => constraintTargetsInfoArchitecture(item));
  if (!infoConstraints.length) return undefined;

  const structure = [
    ...new Set(infoConstraints.flatMap((item) => extractStructureFromInfoConstraint(item.text))),
  ];
  const summary = infoConstraints.map((item) => item.text).join("；");

  return {
    id: "constraint-info-architecture",
    title: "按你的说明编排",
    summary: shortenConstraintLabel(summary, 40),
    structure: structure.length ? structure : ["按输入说明组织页面"],
    signal: "constraint",
    source: "user-added",
    reason: "直接采用你在需求中描述的信息组织方式",
    prompt: summary,
    generationRules: infoConstraints.map((item) => item.text),
    layoutRhythm: structure.join(" → "),
    contentModules: buildConstraintContentModules(spokenConstraints),
  };
}

export function buildConstraintContentModules(spokenConstraints: SpokenConstraint[]): ContentModulePlacement[] {
  return spokenConstraints
    .filter((item) => constraintTargetsFunctionModule(item))
    .map((item) => ({
      id: constraintOptionId("module", item.text),
      label: formatContentModuleLabel(item.text),
      source: "user-added" as const,
      signal: "constraint" as const,
      reason: item.text,
      purpose: item.text,
      placement: "content",
    }));
}

export function mergeConstraintModulesIntoPlans(plans: InfoPlan[], modules: ContentModulePlacement[]): InfoPlan[] {
  if (!modules.length) return plans;
  const targetIndex = plans.findIndex((plan) => plan.signal === "constraint");
  const index = targetIndex >= 0 ? targetIndex : 0;
  return plans.map((plan, planIndex) => {
    if (planIndex !== index) return plan;
    const existing = new Set((plan.contentModules ?? []).map((module) => module.label));
    const toAdd = modules.filter((module) => !existing.has(module.label));
    if (!toAdd.length) return plan;
    return { ...plan, contentModules: [...(plan.contentModules ?? []), ...toAdd] };
  });
}

export function prependConstraintInfoPlanIfNeeded(
  plans: InfoPlan[],
  rawInput: string,
  spokenConstraints: SpokenConstraint[],
): InfoPlan[] {
  const constraintPlan = buildConstraintInfoPlan(rawInput, spokenConstraints);
  if (!constraintPlan) return plans;
  const hasMatch = plans.some((plan) =>
    spokenConstraints
      .filter((item) => item.kind === "info")
      .some((constraint) => planReflectsSpokenConstraint(rawInput, plan, constraint)),
  );
  if (hasMatch) return plans;
  return [constraintPlan, ...plans];
}
