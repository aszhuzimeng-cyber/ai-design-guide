import type { DimensionId, IntentState } from "../types";
import type { SpokenConstraint } from "./types";
import { constraintAppliesToIntentDimension, constraintMatchesOptionByAiMapping } from "./constraintPlacement";
import { inferColorMoodFromText } from "../visualColorPalette";

export const INTENT_DIMENSION_LABELS: Record<DimensionId, string> = {
  targetUser: "主要用户",
  coverage: "突出重点",
  valueProposition: "核心感觉",
};

const VALUE_MOOD_WORDS = new Set([
  "活力",
  "专业",
  "高级",
  "可信",
  "清晰",
  "简约",
  "稳重",
  "温暖",
  "克制",
  "有实力",
  "有格调",
  "有质感",
  "高端",
  "精致",
  "干净",
  "大气",
]);

const MOOD_LABEL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /高级感|高级|高端|有格调|格调/, label: "高级" },
  { pattern: /卡通|童趣|可爱|活泼|明快|元气/, label: "活力" },
  { pattern: /活力感|有活力|活力/, label: "活力" },
  { pattern: /专业感|专业/, label: "专业" },
  { pattern: /可信|靠谱|可靠/, label: "可信" },
  { pattern: /清晰|清楚/, label: "清晰" },
  { pattern: /简约|简洁/, label: "简约" },
  { pattern: /稳重|克制/, label: "稳重" },
  { pattern: /温暖|暖意/, label: "温暖" },
];

/** 从「要有高级感」「活力感」等提取核心感受词，用于第三问归位与选项匹配 */
export function collectIntentMoodTexts(input: {
  intent?: IntentState;
  spokenConstraints?: SpokenConstraint[];
}): string[] {
  const texts: string[] = [];
  const valueDimension = input.intent?.dimensions.find((item) => item.id === "valueProposition");
  const selectedLabel = valueDimension?.options.find((option) => option.id === valueDimension.selectedOptionId)?.label;
  if (selectedLabel?.trim()) texts.push(selectedLabel.trim());

  for (const constraint of input.spokenConstraints ?? []) {
    if (constraint.placement === "intentValueProposition" || extractMoodKeyword(constraint.text)) {
      texts.push((constraint.inferredLabel ?? constraint.text).trim());
    }
  }

  return [...new Set(texts.filter(Boolean))];
}

export function resolveIntentColorMood(input: {
  intent?: IntentState;
  spokenConstraints?: SpokenConstraint[];
  rawInput?: string;
}): string {
  const moodTexts = collectIntentMoodTexts(input);
  for (const text of moodTexts) {
    const mood = extractMoodKeyword(text) ?? inferColorMoodFromText(text);
    if (mood && mood !== "可信") return mood;
  }
  if (input.rawInput?.trim()) {
    const fromInput = inferColorMoodFromText(input.rawInput);
    if (fromInput !== "可信") return fromInput;
  }
  return moodTexts.length ? inferColorMoodFromText(moodTexts.join(" ")) : "可信";
}

export function extractMoodKeyword(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (VALUE_MOOD_WORDS.has(trimmed)) return trimmed;
  for (const { pattern, label } of MOOD_LABEL_PATTERNS) {
    if (pattern.test(trimmed)) return label;
  }
  const stripped = trimmed
    .replace(/^(要|需要|希望|追求|显得|要有|具有|具备)/, "")
    .replace(/感$/g, "")
    .trim();
  if (VALUE_MOOD_WORDS.has(stripped)) return stripped;
  return undefined;
}

const EXPLICIT_REQUIREMENT_PATTERN =
  /(要|需要|希望|必须|应有|不要|别|避免|禁止|不要太|突出|主打|采用|使用|不要用|别用)/;

export const VISUAL_REQUIREMENT_PATTERN = /色|色调|字体|圆角|阴影|留白|配色|白底|米白|暖色|冷色|#[0-9a-f]{3,8}/i;

const STANDALONE_MOOD_PATTERN =
  /^(活力|专业|高级|可信|清晰|简约|稳重|温暖|克制|有实力|有格调|有质感|活力感|高级感|专业感)$/;

export function isBarePageDescriptionSegment(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  if (EXPLICIT_REQUIREMENT_PATTERN.test(normalized)) return false;
  if (VISUAL_REQUIREMENT_PATTERN.test(normalized)) return false;
  return (
    /(官网|网站|主页|首页|落地页|介绍页|展示页|招聘页|报名页|商城|店铺|作品集|详情页)$/.test(normalized) ||
    /(官网|网站|主页|页面|首页)/.test(normalized)
  );
}

export function isBarePageDescription(rawInput: string) {
  const input = rawInput.trim();
  if (!input) return false;
  if (/[，,；;。！？\n]/.test(input)) {
    const segments = input.split(/[，,；;。！？\n]/).map((segment) => segment.trim()).filter(Boolean);
    if (!segments.length) return false;
    return segments.every((segment) => isBarePageDescriptionSegment(segment));
  }
  return isBarePageDescriptionSegment(input);
}

export function isPageDescriptionConstraint(text: string) {
  if (/做一个|做个|做一|帮我做|帮我建/.test(text) && /网站|页面|官网|主页|作品集/.test(text)) return true;
  return isBarePageDescriptionSegment(text);
}

/** 用户是否明确表达了偏好（而非页面类型描述里的业务名词） */
export function isExplicitUserRequirement(text: string, rawInput: string) {
  const normalized = text.trim();
  const input = rawInput.trim();
  if (!normalized || !input) return false;
  if (isPageDescriptionConstraint(normalized)) return false;
  if (EXPLICIT_REQUIREMENT_PATTERN.test(normalized)) return true;
  if (STANDALONE_MOOD_PATTERN.test(normalized)) return true;
  if (VISUAL_REQUIREMENT_PATTERN.test(normalized)) return true;
  if (isBarePageDescription(input) && input.includes(normalized) && normalized.length <= input.length) {
    return false;
  }
  return false;
}

const TARGET_USER_SEMANTICS: Array<{ input: RegExp; option: RegExp[] }> = [
  { input: /求职|找工作|应聘|面试用|校招|社招|招聘/, option: [/招聘/, /面试官/, /用人/, /雇主/, /HR/i] },
  { input: /第一次了解|初次见面|路人/, option: [/第一次了解/, /初次/, /第一次/] },
  { input: /合作|购买|下单|成交/, option: [/合作/, /购买/, /准备合作/] },
  { input: /同行|爱好者|圈内/, option: [/同行/, /爱好者/, /设计爱好者/] },
];

type OptionLike = {
  label?: string;
  reason?: string;
  constraints?: string[];
  summary?: string;
  title?: string;
};

function optionHaystack(option: OptionLike) {
  return [option.label, option.title, option.reason, option.summary, ...(option.constraints ?? [])]
    .filter(Boolean)
    .join(" ");
}

export function inferIntentDimensionForConstraint(constraint: SpokenConstraint): DimensionId | undefined {
  const fromPlacement = (() => {
    if (constraint.placement === "intentTargetUser") return "targetUser" as const;
    if (constraint.placement === "intentCoverage") return "coverage" as const;
    if (constraint.placement === "intentValueProposition") return "valueProposition" as const;
    return undefined;
  })();
  if (fromPlacement) return fromPlacement;

  const text = constraint.text.trim();
  if (!text) return undefined;
  if (constraint.kind === "info") return "coverage";
  if (constraint.kind === "function") return undefined;
  if (constraint.kind === "visual") return "valueProposition";

  if (extractMoodKeyword(text)) return "valueProposition";
  if (isPageDescriptionConstraint(text)) return undefined;

  if (TARGET_USER_SEMANTICS.some((rule) => rule.input.test(text))) return "targetUser";
  if (/用户|客户|面向|受众|人群|B2B|B2C|买家|访客|找工作|求职/.test(text)) return "targetUser";
  if (/突出|重点|首屏|主打|强调/.test(text)) return "coverage";
  if (/作品质感|案例|产品|服务|能力/.test(text) && !/作品集网站|个人网站/.test(text)) return "coverage";
  if (/感觉|气质|风格|调性|品味|档次/.test(text)) return "valueProposition";
  return undefined;
}

export function spokenConstraintAppliesToIntentDimension(dimensionId: DimensionId, constraint: SpokenConstraint) {
  if (constraint.kind === "function") return false;
  if (constraint.placement?.startsWith("intent")) {
    return constraintAppliesToIntentDimension(dimensionId, constraint);
  }
  const inferred = inferIntentDimensionForConstraint(constraint);
  return inferred === dimensionId;
}

export function constraintSemanticallyMatchesOption(
  dimensionId: DimensionId,
  constraint: SpokenConstraint,
  option: OptionLike,
): boolean {
  if (constraintMatchesOptionByAiMapping(constraint, option)) return true;

  const text = constraint.text.trim();
  const haystack = optionHaystack(option);
  if (!text || !haystack) return false;

  if (inferIntentDimensionForConstraint(constraint) !== dimensionId) return false;

  if (dimensionId === "targetUser") {
    for (const rule of TARGET_USER_SEMANTICS) {
      if (rule.input.test(text) && rule.option.some((hint) => hint.test(haystack))) return true;
    }
  }

  if (dimensionId === "valueProposition") {
    const mood = extractMoodKeyword(text) ?? text.replace(/^(要|显得|希望|追求)/, "").trim();
    if (mood && (option.label?.includes(mood) || haystack.includes(mood))) return true;
    if (option.label?.trim() === mood || option.label?.trim() === text) return true;
  }

  if (dimensionId === "coverage") {
    const highlighted = text.match(/^突出(.+)$/)?.[1]?.trim();
    if (highlighted) {
      if (haystack.includes(highlighted) || option.label?.includes(highlighted)) return true;
      if (/作品|质感/.test(highlighted) && /作品|质感/.test(haystack)) return true;
    }
    for (const keyword of ["作品", "案例", "产品", "服务", "能力", "质感"]) {
      if (text.includes(keyword) && haystack.includes(keyword)) return true;
    }
  }

  return false;
}

function normalizeConstraintFragment(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}

/** 判断较长约束是否已涵盖较短约束（同归位下去重） */
export function constraintTextSubsumes(container: string, fragment: string): boolean {
  const c = normalizeConstraintFragment(container);
  const f = normalizeConstraintFragment(fragment);
  if (f.length < 2) return false;
  if (c === f) return true;
  if (c.includes(f)) return true;
  const fragMood = extractMoodKeyword(fragment);
  const trimmed = fragment.trim();
  if (fragMood && (trimmed === fragMood || trimmed === `${fragMood}感`)) {
    if (c.includes(fragMood)) return true;
    if (extractMoodKeyword(container) === fragMood) return true;
  }
  return false;
}

export function expandIntentConstraintsFromInput(rawInput: string): SpokenConstraint[] {
  const input = rawInput.trim();
  if (!input || isBarePageDescription(input)) return [];

  const items: SpokenConstraint[] = [];
  const segments = input.split(/[，,；;]/).flatMap((segment) => segment.split(/[、]/));

  for (let text of segments) {
    text = text.trim().replace(/[。.!！]+$/g, "");
    if (!text || text.length > 28) continue;

    const subsumedBySibling = segments.some(
      (other) =>
        other !== text &&
        other.trim().length > text.length &&
        constraintTextSubsumes(other.trim(), text),
    );
    if (subsumedBySibling) continue;

    if (/^(活力|专业|高级|可信|清晰|简约|稳重|温暖|克制|有实力|有格调|有质感|活力感|高级感|专业感)$/.test(text)) {
      items.push({ kind: "general", text, placement: "intentValueProposition", inferredLabel: extractMoodKeyword(text) });
      continue;
    }
    if (/要有|需要|希望/.test(text) && extractMoodKeyword(text)) {
      items.push({
        kind: "general",
        text,
        placement: "intentValueProposition",
        inferredLabel: extractMoodKeyword(text),
      });
      continue;
    }
    if (/求职|找工作|应聘|面试|招聘/.test(text)) {
      items.push({ kind: "general", text: /求职/.test(text) ? "求职用" : text });
      continue;
    }
    if (/^突出/.test(text)) {
      items.push({ kind: "general", text });
    }
  }

  return items;
}

export function reconcileSpokenConstraintPlacement(constraint: SpokenConstraint): SpokenConstraint {
  const text = constraint.text.trim();
  const mood = extractMoodKeyword(text);
  if (mood) {
    return {
      ...constraint,
      placement: "intentValueProposition",
      inferredLabel: constraint.inferredLabel ?? mood,
    };
  }
  if (isPageDescriptionConstraint(text)) {
    return { ...constraint, placement: "pageGeneral" };
  }
  if (/找工作|求职|应聘|面试用|用于找工作/.test(text)) {
    return {
      ...constraint,
      placement: "intentTargetUser",
      inferredLabel: constraint.inferredLabel ?? "招聘方/面试官",
    };
  }
  if (constraint.placement === "intentCoverage" && isPageDescriptionConstraint(text)) {
    return { ...constraint, placement: "pageGeneral" };
  }
  return constraint;
}

export function reconcileSpokenConstraintPlacements(constraints: SpokenConstraint[]) {
  return constraints.map(reconcileSpokenConstraintPlacement);
}
