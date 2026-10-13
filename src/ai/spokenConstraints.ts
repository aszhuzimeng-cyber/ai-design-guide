import type { SpokenConstraint, SpokenConstraintKind } from "./types";
import type { DimensionId, VisualId } from "../types";
import { PLACEMENT_STAGE_LABELS } from "./constraintPlacement";
import {
  constraintPlacementLabel,
  readSpokenConstraintPlacement,
  spokenConstraintsForVisualStage,
} from "./constraintPlacement";
import {
  constraintSemanticallyMatchesOption,
  expandIntentConstraintsFromInput,
  extractMoodKeyword,
  inferIntentDimensionForConstraint,
  INTENT_DIMENSION_LABELS,
  isBarePageDescription,
  isExplicitUserRequirement,
  isPageDescriptionConstraint,
  reconcileSpokenConstraintPlacements,
  spokenConstraintAppliesToIntentDimension,
  constraintTextSubsumes,
  VISUAL_REQUIREMENT_PATTERN,
} from "./intentConstraintSemantics";
import { constraintMatchesOptionByAiMapping } from "./constraintPlacement";

export {
  spokenConstraintAppliesToIntentDimension,
  inferIntentDimensionForConstraint,
  constraintSemanticallyMatchesOption,
  INTENT_DIMENSION_LABELS,
  isBarePageDescription,
  isExplicitUserRequirement,
  isPageDescriptionConstraint,
} from "./intentConstraintSemantics";
export {
  constraintPlacementLabel,
  PLACEMENT_STAGE_LABELS,
  spokenConstraintsForInfoArchitecture,
  spokenConstraintsForFunctionModule,
  spokenConstraintsForVisualStage,
} from "./constraintPlacement";

export function constraintDisplayLabel(constraint: SpokenConstraint) {
  const fromPlacement = constraintPlacementLabel(constraint);
  if (fromPlacement) return fromPlacement;
  const dimension = inferIntentDimensionForConstraint(constraint);
  return dimension ? INTENT_DIMENSION_LABELS[dimension] : undefined;
}

const SPOKEN_KINDS = new Set<SpokenConstraintKind>(["general", "info", "function", "visual"]);

export const SPOKEN_KIND_LABELS: Record<SpokenConstraintKind, string> = {
  general: "其他说明",
  info: "信息组织",
  function: "功能模块",
  visual: "视觉要求",
};

function normalizeConstraintText(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}

export function isConstraintGroundedInInput(rawInput: string, constraint: string): boolean {
  const input = normalizeConstraintText(rawInput);
  const text = normalizeConstraintText(constraint);
  if (text.length < 2) return false;
  if (input.includes(text)) return true;

  const neg = constraint.match(/^不要(.+)$/);
  if (neg) {
    const target = normalizeConstraintText(neg[1]);
    if (target.length >= 2 && input.includes(target)) return true;
    if (input.includes(normalizeConstraintText(`不要${neg[1]}`))) return true;
  }

  const preference = constraint.match(/^(要|需要|希望|不要太)(.+)$/);
  if (preference) {
    const target = normalizeConstraintText(preference[2]);
    if (target.length >= 2 && input.includes(target)) return true;
  }

  return false;
}

export function isSpokenTextGrounded(rawInput: string, text: string): boolean {
  if (isConstraintGroundedInInput(rawInput, text)) return true;
  const input = normalizeConstraintText(rawInput);
  const normalized = normalizeConstraintText(text);
  if (normalized.length < 4) return false;
  for (let len = Math.min(normalized.length, 16); len >= 4; len -= 1) {
    for (let index = 0; index <= normalized.length - len; index += 1) {
      const slice = normalized.slice(index, index + len);
      if (input.includes(slice)) return true;
    }
  }
  return false;
}

const ANALYSIS_STYLE_PREFIX =
  /^(品牌调性|目标用户|主营业务|核心感觉|页面类型|设计风格|已识别|业务类型|服务对象)/;

function readSpokenKind(value: unknown): SpokenConstraintKind {
  return typeof value === "string" && SPOKEN_KINDS.has(value as SpokenConstraintKind)
    ? (value as SpokenConstraintKind)
    : "general";
}

function dedupeSpokenConstraints(items: SpokenConstraint[]): SpokenConstraint[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}::${normalizeConstraintText(item.text)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function collapseRedundantSpokenConstraints(constraints: SpokenConstraint[]): SpokenConstraint[] {
  const withPlacement = reconcileSpokenConstraintPlacements([...constraints]);
  const groups = new Map<string, SpokenConstraint[]>();
  for (const item of withPlacement) {
    const key = item.placement ?? `${item.kind}:fallback`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const result: SpokenConstraint[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => b.text.length - a.text.length);
    const kept: SpokenConstraint[] = [];
    for (const candidate of sorted) {
      if (kept.some((item) => constraintTextSubsumes(item.text, candidate.text))) continue;
      const withoutSubsumed = kept.filter((item) => !constraintTextSubsumes(candidate.text, item.text));
      withoutSubsumed.push(candidate);
      kept.length = 0;
      kept.push(...withoutSubsumed);
    }
    result.push(...kept);
  }
  return result;
}

function filterSubsumedConstraintTexts(texts: string[]): string[] {
  return texts.filter(
    (text, _, arr) => !arr.some((other) => other !== text && other.length > text.length && constraintTextSubsumes(other, text)),
  );
}

function inferSpokenKindFromText(text: string): SpokenConstraintKind {
  if (/色|字体|圆角|阴影|留白|主色|配色|白底/.test(text)) return "visual";
  if (/模块|表单|预约|咨询|支付|登录|功能|地图|搜索|按钮|cta/i.test(text)) return "function";
  if (/首屏|结构|顺序|导航|信息组织|布局|架构/.test(text)) return "info";
  return "general";
}

const INPUT_CLAUSE_PATTERN =
  /(?:需要|要|希望|必须|应有|包含|加上|采用|使用|主打|突出|不要|别|避免|禁止|不要太)[^，。；;\n]{1,48}/g;

export function extractSpokenConstraintsFromInput(rawInput: string): SpokenConstraint[] {
  const input = rawInput.trim();
  if (!input || isBarePageDescription(input)) return [];

  const clauses = new Set<string>();
  for (const match of input.matchAll(INPUT_CLAUSE_PATTERN)) {
    const text = match[0]?.trim();
    if (!text || text.length < 3 || ANALYSIS_STYLE_PREFIX.test(text)) continue;
    clauses.add(text);
  }

  for (const segment of input.split(/[，。；;\n]/)) {
    const pieces = segment.split(/[、]/);
    for (const piece of pieces) {
      const text = piece.trim().replace(/[。.!！]+$/g, "");
      if (!text || text.length < 2 || text.length > 48 || ANALYSIS_STYLE_PREFIX.test(text)) continue;
      if (
        /色|字体|模块|首屏|预约|咨询|表单|导航|不要|需要|希望|必须|突出|求职|招聘|找工作|活力|专业|高级|可信|清晰|作品|案例|高级|格调/.test(
          text,
        )
      ) {
        clauses.add(text);
      }
    }
  }

  const expanded = expandIntentConstraintsFromInput(input);
  for (const item of expanded) clauses.add(item.text);

  const grounded = filterSubsumedConstraintTexts([...clauses])
    .map((text) => ({ kind: inferSpokenKindFromText(text), text }))
    .filter((item) => isSpokenTextGrounded(input, item.text) && isExplicitUserRequirement(item.text, input));

  return dedupeSpokenConstraints(grounded);
}

export function constraintsForOptionMarking(rawInput: string, constraints: SpokenConstraint[]) {
  return constraints.filter((item) => {
    if (!item.placement || item.placement === "pageGeneral") return false;
    if (!isSpokenTextGrounded(rawInput, item.text)) return false;
    if (item.mapsToOptionId) return true;
    if (isExplicitUserRequirement(item.text, rawInput)) return true;
    if (item.placement.startsWith("intent") && item.inferredLabel) return true;
    if (item.placement.startsWith("visual")) {
      return isExplicitUserRequirement(item.text, rawInput) || VISUAL_REQUIREMENT_PATTERN.test(item.text);
    }
    if (item.placement === "infoArchitecture" || item.placement === "functionModule") {
      return item.kind !== "general" || /要|需要|希望|必须|不要|突出|首屏|模块|结构|顺序/.test(item.text);
    }
    return false;
  });
}

export function filterIntentMarkingConstraints(rawInput: string, constraints: SpokenConstraint[]) {
  return constraintsForOptionMarking(rawInput, constraints);
}

export function getDisplayableSpokenConstraints(rawInput: string, constraints: SpokenConstraint[]) {
  return collapseRedundantSpokenConstraints(
    constraints.filter((item) => item.placement && isSpokenTextGrounded(rawInput, item.text)),
  );
}

export function ensureProjectSpokenConstraints(rawInput: string, items: unknown): SpokenConstraint[] {
  const input = rawInput.trim();
  const merged = dedupeSpokenConstraints([
    ...sanitizeSpokenConstraints(input, items),
    ...extractSpokenConstraintsFromInput(input),
  ]);
  return collapseRedundantSpokenConstraints(reconcileSpokenConstraintPlacements(merged));
}

function tokenizeConstraintText(text: string) {
  return text
    .split(/[，。,.、；;\s/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function tokenizeConstraintKeywords(text: string) {
  const parts = tokenizeConstraintText(text);
  const keywords = new Set<string>();
  for (const part of parts) {
    if (part.length >= 2) keywords.add(part);
    if (part.length >= 4) {
      for (let index = 0; index <= part.length - 2; index += 1) {
        const slice = part.slice(index, index + 2);
        if (slice.length >= 2) keywords.add(slice);
      }
    }
  }
  return [...keywords].filter((keyword) => keyword.length >= 2);
}

export function optionReflectsSpokenConstraint(
  rawInput: string,
  option: { label?: string; reason?: string; constraints?: string[]; summary?: string; title?: string },
  constraint: SpokenConstraint,
  dimensionId?: DimensionId,
) {
  const text = constraint.text.trim();
  if (!text) return false;
  if (dimensionId && constraintSemanticallyMatchesOption(dimensionId, constraint, option)) return true;
  const haystack = [option.label, option.title, option.reason, option.summary, ...(option.constraints ?? [])]
    .filter(Boolean)
    .join(" ");
  if (!haystack) return false;

  // 约束选项：id 以 constraint- 开头，或 label 与用户原话一致
  if (option.label?.trim() === text || option.label?.trim() === text.replace(/^(需要|要|希望|必须|突出)/, "")) {
    return true;
  }

  if (haystack.includes(text)) return true;

  const label = option.label?.trim() ?? "";
  if (label.length >= 2 && text.includes(label) && label.length >= Math.min(4, text.length * 0.5)) {
    return true;
  }

  const keywords = tokenizeConstraintKeywords(text);
  if (!keywords.length) return false;
  const hits = keywords.filter((keyword) => haystack.includes(keyword));
  if (!hits.length) return false;

  const requiredHits = keywords.length <= 2 ? keywords.length : Math.max(2, Math.ceil(keywords.length * 0.5));
  return hits.length >= requiredHits;
}

const VISUAL_CATALOG_MOODS = ["可信", "亲和", "科技", "活力", "高级", "克制", "专业", "沉稳", "清新"] as const;

const MOOD_INPUT_PATTERNS: Record<string, RegExp> = {
  可信: /可信|信任|可靠|靠谱/,
  活力: /活力|活泼|明快|元气|卡通|可爱|童趣/,
  专业: /专业|严谨/,
  高级: /高级|高端|格调|质感/,
  清新: /清新|清爽/,
  克制: /克制|沉稳|低调/,
  亲和: /亲和|温暖|友好/,
  科技: /科技|技术|未来/,
  沉稳: /沉稳|稳重/,
};

function catalogMoodGroundedInInput(rawInput: string, mood: string) {
  if (!mood) return false;
  if (rawInput.includes(mood)) return true;
  const pattern = MOOD_INPUT_PATTERNS[mood];
  return pattern ? pattern.test(rawInput) : false;
}

/** 视觉阶段打「输入约束」：必须来自用户原话，不能把库内气质名（如「可信」）误标到色彩方案上 */
export function isVisualMarkingConstraint(rawInput: string, constraint: SpokenConstraint) {
  const text = constraint.text.trim();
  if (!text) return false;
  if (constraint.mapsToOptionId) return true;
  if (!isSpokenTextGrounded(rawInput, text) && !isConstraintGroundedInInput(rawInput, text)) return false;

  const mood =
    extractMoodKeyword(text) ??
    (constraint.inferredLabel ? extractMoodKeyword(constraint.inferredLabel) : undefined);
  if (mood) return catalogMoodGroundedInInput(rawInput, mood);

  if (constraint.placement?.startsWith("visual")) {
    return isExplicitUserRequirement(text, rawInput) || VISUAL_REQUIREMENT_PATTERN.test(text);
  }
  if (constraint.placement === "intentValueProposition") return false;

  return isExplicitUserRequirement(text, rawInput);
}

export function filterVisualMarkingConstraints(
  rawInput: string,
  spokenConstraints: SpokenConstraint[],
  dimensionId: VisualId,
) {
  return spokenConstraintsForVisualStage(spokenConstraints, dimensionId).filter((constraint) =>
    isVisualMarkingConstraint(rawInput, constraint),
  );
}

export function optionReflectsSpokenConstraintForVisual(
  rawInput: string,
  option: { id?: string; label?: string; reason?: string; constraints?: string[]; summary?: string; title?: string },
  constraint: SpokenConstraint,
) {
  if (!isVisualMarkingConstraint(rawInput, constraint)) return false;
  if (constraint.mapsToOptionId && option.id === constraint.mapsToOptionId) return true;

  const text = constraint.text.trim();
  const mood =
    extractMoodKeyword(text) ??
    (constraint.inferredLabel ? extractMoodKeyword(constraint.inferredLabel) : undefined);
  if (mood && !catalogMoodGroundedInInput(rawInput, mood)) return false;

  for (const catalogMood of VISUAL_CATALOG_MOODS) {
    if (text === catalogMood && !catalogMoodGroundedInInput(rawInput, catalogMood)) return false;
  }

  const inferred = constraint.inferredLabel?.trim();
  if (inferred) {
    const inferredMood = extractMoodKeyword(inferred) ?? inferred;
    if (
      VISUAL_CATALOG_MOODS.includes(inferredMood as (typeof VISUAL_CATALOG_MOODS)[number]) &&
      !catalogMoodGroundedInInput(rawInput, inferredMood)
    ) {
      return false;
    }
    if (
      (isSpokenTextGrounded(rawInput, inferred) || catalogMoodGroundedInInput(rawInput, inferred)) &&
      constraintMatchesOptionByAiMapping(constraint, option)
    ) {
      return true;
    }
  }

  return optionReflectsSpokenConstraint(rawInput, option, constraint);
}

export function inferConstraintOptionIds(
  dimensions: Array<{ id: string; options: Array<{ id: string; label?: string; reason?: string; constraints?: string[] }> }>,
  spokenConstraints: SpokenConstraint[],
  rawInput: string,
) {
  const markingConstraints = constraintsForOptionMarking(rawInput, spokenConstraints);
  const result: Partial<Record<string, string>> = {};
  for (const dimension of dimensions) {
    const relevant = markingConstraints.filter((constraint) =>
      spokenConstraintAppliesToIntentDimension(dimension.id as DimensionId, constraint),
    );
    const mapped = relevant.find((constraint) => constraint.mapsToOptionId);
    if (mapped?.mapsToOptionId) {
      result[dimension.id] = mapped.mapsToOptionId;
      continue;
    }
    for (const option of dimension.options) {
      if (option.id.startsWith("constraint-")) {
        result[dimension.id] = option.id;
        break;
      }
      if (
        relevant.some(
          (constraint) =>
            constraintSemanticallyMatchesOption(dimension.id as DimensionId, constraint, option) ||
            optionReflectsSpokenConstraint(rawInput, option, constraint, dimension.id as DimensionId),
        )
      ) {
        result[dimension.id] = option.id;
        break;
      }
    }
  }
  return result;
}

export function compileSpokenConstraintRules(spokenConstraints: SpokenConstraint[]) {
  return spokenConstraints.map((constraint) => {
    const kindLabel = SPOKEN_KIND_LABELS[constraint.kind];
    const stage = constraint.placement ? PLACEMENT_STAGE_LABELS[constraint.placement] : undefined;
    const where = stage ? `归位·${stage}` : kindLabel;
    const inferred = constraint.inferredLabel ? `（理解为：${constraint.inferredLabel}）` : "";
    return `【输入约束·${where}】用户原话：「${constraint.text}」${inferred}。必须体现在对应阶段与最终 HTML，不得忽略或弱化为其它方案。`;
  });
}

export function planReflectsSpokenConstraint(rawInput: string, plan: { title?: string; summary?: string; reason?: string; structure?: string[] }, constraint: SpokenConstraint) {
  return optionReflectsSpokenConstraint(rawInput, {
    label: plan.title,
    summary: plan.summary,
    reason: plan.reason,
    constraints: plan.structure,
  }, constraint);
}

export function spokenConstraintsForDimension(spokenConstraints: SpokenConstraint[], dimensionId: string) {
  if (dimensionId === "color" || dimensionId === "font" || dimensionId === "card" || dimensionId === "density") {
    return spokenConstraintsForVisualStage(spokenConstraints, dimensionId as VisualId);
  }
  return spokenConstraints;
}

function normalizeSpokenConstraintFields(item: Record<string, unknown>, text: string, kind: SpokenConstraintKind): SpokenConstraint {
  const inferredLabel =
    typeof item.inferredLabel === "string" && item.inferredLabel.trim() ? item.inferredLabel.trim() : undefined;
  const mapsToOptionId =
    typeof item.mapsToOptionId === "string" && item.mapsToOptionId.trim() ? item.mapsToOptionId.trim() : undefined;
  return {
    kind,
    text,
    placement: readSpokenConstraintPlacement(item.placement),
    inferredLabel,
    mapsToOptionId,
  };
}

function shouldKeepSanitizedConstraint(record: Record<string, unknown>, text: string, input: string) {
  if (!isSpokenTextGrounded(input, text)) return false;
  const placement = readSpokenConstraintPlacement(record.placement);
  if (placement === "pageGeneral" || isPageDescriptionConstraint(text)) return true;
  return isExplicitUserRequirement(text, input);
}

export function sanitizeSpokenConstraints(rawInput: string, items: unknown): SpokenConstraint[] {
  if (!Array.isArray(items)) return [];
  const input = rawInput.trim();
  if (!input) return [];

  const normalized = items.flatMap((item) => {
    if (typeof item === "string") {
      const text = item.trim();
      if (!text || ANALYSIS_STYLE_PREFIX.test(text)) return [];
      if (!shouldKeepSanitizedConstraint({}, text, input)) return [];
      return [normalizeSpokenConstraintFields({}, text, inferSpokenKindFromText(text))];
    }
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (!text || ANALYSIS_STYLE_PREFIX.test(text)) return [];
    if (!shouldKeepSanitizedConstraint(record, text, input)) return [];
    const kind = readSpokenKind(record.kind) || inferSpokenKindFromText(text);
    return [normalizeSpokenConstraintFields(record, text, kind)];
  });

  return dedupeSpokenConstraints(normalized);
}

export function sanitizeUserInputConstraints(rawInput: string, constraints: unknown): string[] {
  if (!Array.isArray(constraints)) return [];
  const input = rawInput.trim();
  if (!input) return [];

  return constraints
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !ANALYSIS_STYLE_PREFIX.test(item))
    .filter((item) => isConstraintGroundedInInput(input, item));
}

export function mergeInputConstraintTexts(spoken: SpokenConstraint[], legacy: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const text of [...spoken.map((item) => item.text), ...legacy]) {
    const key = normalizeConstraintText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(text);
  }
  return merged;
}

export function getProjectSpokenConstraints(project: { ai?: { brief?: { spokenConstraints?: SpokenConstraint[]; inputConstraints?: string[] } } }): SpokenConstraint[] {
  const spoken = project.ai?.brief?.spokenConstraints ?? [];
  if (spoken.length) return spoken;
  return (project.ai?.brief?.inputConstraints ?? []).map((text) => ({ kind: "general" as const, text }));
}
