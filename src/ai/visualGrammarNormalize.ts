import { VISUAL_DIMENSION_IDS, VISUAL_DIMENSION_INITIAL_OPTIONS } from "./catalogs";
import { VISUAL_SPECS } from "./visualSpecs";
import type { AiVisualSelection } from "./types";
import type { InfoPlan, IntentState, OptionItem, VisualId } from "../types";
import { clampStyleName, inferFontStyleName, cardStyleNameFromKey, resolveFontArchetype, resolveFontPublicLabel, archetypeFromStyleLabel, FONT_STACK_BY_ARCHETYPE, type FontArchetype, canonicalCardStyleKey, canonicalCardLabel, canonicalDensityKey, canonicalDensityLabel, CANONICAL_CARD_STYLES, CANONICAL_DENSITY_KEYS, type CanonicalCardStyle, type CanonicalDensityKey } from "../visualGrammarDisplay";
import { classifyColorFamily, colorStyleNameFromPrimary, isLayoutOrientedColorLabel, reconcileColorTokens } from "../visualColorPalette";
import { optionReflectsSpokenConstraintForVisual, filterVisualMarkingConstraints } from "./spokenConstraints";
import type { SpokenConstraint } from "./types";
import { injectVisualConstraintOptions } from "./constraintOptions";

const FONT_ARCHETYPE_ORDER: FontArchetype[] = ["readable", "display", "serif"];

type RawVisualPayload = Partial<
  Record<
    VisualId,
    {
      optionId?: string;
      recommendedOptionId?: string;
      optionIds?: string[];
      optionNotes?: Partial<Record<string, string>>;
      options?: OptionItem[];
      source?: "recommended" | "constraint";
      reason?: string;
    }
  >
>;

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readStringHints(hints: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = hints[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function readHex(hints: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = hints[key];
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim();
  }
  return undefined;
}

function catalogStyleName(dimensionId: VisualId, styleName: string) {
  const match = Object.values(VISUAL_SPECS[dimensionId]).find((item) => item.label === styleName);
  return match?.label;
}

function styleNameForDimension(dimensionId: VisualId, option: OptionItem) {
  const hints = option.tokenHints ?? {};
  const fromHint =
    dimensionId === "color"
      ? readStringHints(hints, ["colorStyleName"])
      : dimensionId === "font"
        ? readStringHints(hints, ["fontStyleName"])
        : dimensionId === "card"
          ? readStringHints(hints, ["cardStyleName"])
          : readStringHints(hints, ["densityStyleName"]);
  const fromLabel = option.label?.trim();
  const raw = fromHint || fromLabel || "";
  const clamped = clampStyleName(raw, 8, dimensionId === "color" ? "配色方案" : dimensionId === "font" ? "无衬线体" : dimensionId === "card" ? "轻阴影" : "中等密度");
  if (catalogStyleName(dimensionId, clamped)) return clamped;
  if (dimensionId === "font") return inferFontStyleName(`${raw} ${option.reason ?? ""}`, clamped);
  if (dimensionId === "card") {
    const cardStyle = String(option.previewRules?.cardStyle ?? "");
    return cardStyleNameFromKey(cardStyle, raw);
  }
  if (dimensionId === "density") {
    const density = String(option.previewRules?.density ?? "");
    return canonicalDensityLabel(canonicalDensityKey(density, raw));
  }
  return clamped;
}

function enrichColorOption(option: OptionItem, styleName: string): OptionItem {
  const hints = { ...(option.tokenHints ?? {}) };
  const preview = option.previewRules ?? {};
  const colorObj = readRecord(hints.color ?? option.visualTokens?.color);
  const primary = readHex(hints, ["primary"]) ?? readHex(colorObj, ["primary"]) ?? "#2563eb";
  const secondary = readHex(hints, ["secondary"]) ?? readHex(colorObj, ["secondary", "background"]) ?? "#dbeafe";
  const accent = readHex(hints, ["accent"]) ?? readHex(colorObj, ["accent"]) ?? "#0f172a";
  const background = readHex(hints, ["background"]) ?? readHex(colorObj, ["background"]) ?? "#f8fafc";
  const text = readHex(hints, ["text"]) ?? readHex(colorObj, ["text"]) ?? "#0f172a";
  const preserveLabel =
    option.source === "reference" &&
    !isLayoutOrientedColorLabel(styleName) &&
    !isLayoutOrientedColorLabel(option.label ?? "");
  const reconciled = reconcileColorTokens(
    {
      primary,
      secondary,
      accent,
      background,
      text,
      label: styleName,
    },
    { preserveLabel },
  );
  const nextStyleName = reconciled.label;
  return {
    ...option,
    label: nextStyleName,
    tokenHints: {
      ...hints,
      colorStyleName: nextStyleName,
      primary: reconciled.primary,
      secondary: reconciled.secondary,
      accent: reconciled.accent,
      background: reconciled.background,
      text: reconciled.text,
    },
    previewRules: { ...preview, background: reconciled.background, text: reconciled.text, accent: reconciled.accent },
    generationRules: option.generationRules?.length
      ? option.generationRules
      : [`主色 ${reconciled.primary}、辅色 ${reconciled.secondary}、点缀 ${reconciled.accent}，背景 ${reconciled.background}、正文 ${reconciled.text}。`],
  };
}

function ensureDistinctColorFamilies(options: OptionItem[]): OptionItem[] {
  const used = new Set<string>();
  return options.map((option, index) => {
    const hints = option.tokenHints ?? {};
    const primary = typeof hints.primary === "string" ? hints.primary : "#2563eb";
    let family = classifyColorFamily(primary);
    if (used.has(family)) {
      const fallbackPrimaries = ["#2563eb", "#e67e22", "#d4a373", "#00b4d8", "#16a34a", "#111827", "#0ea5e9"];
      const replacement =
        fallbackPrimaries.find((hex) => !used.has(classifyColorFamily(hex))) ?? fallbackPrimaries[index % fallbackPrimaries.length];
      const mood = (option.label ?? "").replace(/^[\u4e00-\u9fa5]{2,4}/, "") || "可信";
      const label = colorStyleNameFromPrimary(replacement, mood);
      used.add(classifyColorFamily(replacement));
      return enrichColorOption(
        {
          ...option,
          label,
          reason: undefined,
          tokenHints: { ...hints, primary: replacement },
        },
        label,
      );
    }
    used.add(family);
    return option;
  });
}

function enrichFontOption(option: OptionItem, styleName: string): OptionItem {
  const archetype = archetypeFromStyleLabel(styleName) ?? resolveFontArchetype(option);
  const label = resolveFontPublicLabel(archetype);
  const stacks = FONT_STACK_BY_ARCHETYPE[archetype];
  const hints = { ...(option.tokenHints ?? {}) };
  const heading = stacks.heading;
  const body = stacks.body;
  const numeric = readStringHints(hints, ["numeric", "price", "numericFont"]);
  const typeScale = archetype === "display" ? "expressive" : "balanced";
  return {
    ...option,
    label,
    tokenHints: {
      ...hints,
      fontStyleName: label,
      heading,
      body,
      ...(numeric ? { numeric } : {}),
    },
    previewRules: { ...(option.previewRules ?? {}), typeScale },
    generationRules: option.generationRules?.length
      ? option.generationRules
      : [`标题字体 ${heading}；正文字体 ${body}${numeric ? `；数字 ${numeric}` : ""}。`],
  };
}

function ensureDistinctFontArchetypes(options: OptionItem[]): OptionItem[] {
  const used = new Set<FontArchetype>();
  return options.map((option, index) => {
    let archetype = resolveFontArchetype(option);
    let reassigned = false;
    if (used.has(archetype)) {
      const replacement = FONT_ARCHETYPE_ORDER.find((item) => !used.has(item));
      archetype = replacement ?? FONT_ARCHETYPE_ORDER[index % FONT_ARCHETYPE_ORDER.length];
      reassigned = true;
    }
    used.add(archetype);
    const label = resolveFontPublicLabel(archetype);
    return enrichFontOption(
      {
        ...option,
        label,
        reason: reassigned ? undefined : option.reason,
        tokenHints: { ...(option.tokenHints ?? {}), fontStyleName: label },
      },
      label,
    );
  });
}

const CARD_STYLE_ORDER = CANONICAL_CARD_STYLES;
const CARD_STYLE_LABELS: Record<CanonicalCardStyle, string> = {
  "flat-hairline": canonicalCardLabel("flat-hairline"),
  "soft-card": canonicalCardLabel("soft-card"),
  bordered: canonicalCardLabel("bordered"),
  elevated: canonicalCardLabel("elevated"),
};

function cardOptionCanonicalKey(option: OptionItem): CanonicalCardStyle {
  const preview = option.previewRules ?? {};
  const hint = String(option.tokenHints?.cardStyleName ?? option.label ?? "");
  return canonicalCardStyleKey(String(preview.cardStyle ?? ""), hint);
}

function ensureDistinctCardStyles(options: OptionItem[]): OptionItem[] {
  const used = new Set<CanonicalCardStyle>();
  return options.map((option, index) => {
    let key = cardOptionCanonicalKey(option);
    let reassigned = false;
    if (used.has(key)) {
      const replacement = CARD_STYLE_ORDER.find((item) => !used.has(item));
      key = replacement ?? CARD_STYLE_ORDER[index % CARD_STYLE_ORDER.length];
      reassigned = true;
    }
    used.add(key);
    const label = CARD_STYLE_LABELS[key];
    return enrichCardOption(
      {
        ...option,
        reason: reassigned ? undefined : option.reason,
        previewRules: { ...(option.previewRules ?? {}), cardStyle: key },
        tokenHints: { ...(option.tokenHints ?? {}), cardStyleName: label },
      },
      label,
    );
  });
}

const DENSITY_ORDER = CANONICAL_DENSITY_KEYS;
const DENSITY_LABELS: Record<CanonicalDensityKey, string> = {
  spacious: canonicalDensityLabel("spacious"),
  balanced: canonicalDensityLabel("balanced"),
  compact: canonicalDensityLabel("compact"),
};

function densityOptionCanonicalKey(option: OptionItem): CanonicalDensityKey {
  const preview = option.previewRules ?? {};
  const hint = String(option.tokenHints?.densityStyleName ?? option.label ?? "");
  return canonicalDensityKey(String(preview.density ?? ""), hint);
}

function ensureDistinctDensityLevels(options: OptionItem[]): OptionItem[] {
  const used = new Set<CanonicalDensityKey>();
  return options.map((option, index) => {
    let key = densityOptionCanonicalKey(option);
    let reassigned = false;
    if (used.has(key)) {
      const replacement = DENSITY_ORDER.find((item) => !used.has(item));
      key = replacement ?? DENSITY_ORDER[index % DENSITY_ORDER.length];
      reassigned = true;
    }
    used.add(key);
    const label = DENSITY_LABELS[key];
    return enrichDensityOption(
      {
        ...option,
        reason: reassigned ? undefined : option.reason,
        previewRules: { ...(option.previewRules ?? {}), density: key },
        tokenHints: { ...(option.tokenHints ?? {}), densityStyleName: label },
      },
      label,
    );
  });
}

function visualOptionDisplayLabel(dimensionId: VisualId, option: OptionItem) {
  if (dimensionId === "font") return resolveFontPublicLabel(resolveFontArchetype(option));
  if (dimensionId === "color") return option.label?.trim() || "";
  if (dimensionId === "card") return CARD_STYLE_LABELS[cardOptionCanonicalKey(option)];
  return DENSITY_LABELS[densityOptionCanonicalKey(option)];
}

function assertUniqueDisplayLabels(dimensionId: VisualId, options: OptionItem[]): OptionItem[] {
  const seen = new Set<string>();
  return options.map((option, index) => {
    let current = enrichVisualOption(dimensionId, option);
    let label = visualOptionDisplayLabel(dimensionId, current);
    if (!label || seen.has(label)) {
      if (dimensionId === "font") {
        const replacement = FONT_ARCHETYPE_ORDER.find((item) => !seen.has(resolveFontPublicLabel(item)));
        const archetype = replacement ?? FONT_ARCHETYPE_ORDER[index % FONT_ARCHETYPE_ORDER.length];
        const nextLabel = resolveFontPublicLabel(archetype);
        current = enrichFontOption(
          { ...option, reason: undefined, tokenHints: { ...(option.tokenHints ?? {}), fontStyleName: nextLabel } },
          nextLabel,
        );
        label = nextLabel;
      } else if (dimensionId === "card") {
        const replacement = CARD_STYLE_ORDER.find((item) => !seen.has(CARD_STYLE_LABELS[item]));
        const key = replacement ?? CARD_STYLE_ORDER[index % CARD_STYLE_ORDER.length];
        label = CARD_STYLE_LABELS[key];
        current = enrichCardOption(
          {
            ...option,
            reason: undefined,
            previewRules: { ...(option.previewRules ?? {}), cardStyle: key },
            tokenHints: { ...(option.tokenHints ?? {}), cardStyleName: label },
          },
          label,
        );
      } else if (dimensionId === "density") {
        const replacement = DENSITY_ORDER.find((item) => !seen.has(DENSITY_LABELS[item]));
        const key = replacement ?? DENSITY_ORDER[index % DENSITY_ORDER.length];
        label = DENSITY_LABELS[key];
        current = enrichDensityOption(
          {
            ...option,
            reason: undefined,
            previewRules: { ...(option.previewRules ?? {}), density: key },
            tokenHints: { ...(option.tokenHints ?? {}), densityStyleName: label },
          },
          label,
        );
      } else if (dimensionId === "color") {
        const fallbackPrimaries = ["#2563eb", "#e67e22", "#d4a373", "#00b4d8", "#16a34a", "#111827", "#0ea5e9"];
        const replacement = fallbackPrimaries.find((hex) => !seen.has(colorStyleNameFromPrimary(hex, "可信"))) ?? fallbackPrimaries[index % fallbackPrimaries.length];
        label = colorStyleNameFromPrimary(replacement, "可信");
        current = enrichColorOption(
          { ...option, reason: undefined, tokenHints: { ...(option.tokenHints ?? {}), primary: replacement } },
          label,
        );
      }
    }
    seen.add(label);
    return current;
  });
}

export function dedupeVisualDimensionOptions(dimensionId: VisualId, options: OptionItem[]): OptionItem[] {
  const uniqueById = options.filter((option, index, list) => list.findIndex((item) => item.id === option.id) === index);
  let deduped: OptionItem[];
  if (dimensionId === "font") deduped = ensureDistinctFontArchetypes(uniqueById);
  else if (dimensionId === "color") deduped = ensureDistinctColorFamilies(uniqueById);
  else if (dimensionId === "card") deduped = ensureDistinctCardStyles(uniqueById);
  else if (dimensionId === "density") deduped = ensureDistinctDensityLevels(uniqueById);
  else return uniqueById;
  return assertUniqueDisplayLabels(dimensionId, deduped);
}

function enrichCardOption(option: OptionItem, styleName: string): OptionItem {
  const hints = { ...(option.tokenHints ?? {}) };
  const preview = option.previewRules ?? {};
  const hint = styleName || String(hints.cardStyleName ?? option.label ?? "");
  const cardStyle = canonicalCardStyleKey(String(preview.cardStyle ?? ""), hint);
  const label = canonicalCardLabel(cardStyle);
  const radiusPx =
    typeof preview.radiusPx === "number" ? preview.radiusPx : cardStyle === "flat-hairline" ? 4 : cardStyle === "elevated" ? 12 : 8;
  return {
    ...option,
    label,
    tokenHints: { ...hints, cardStyleName: label },
    previewRules: { ...preview, cardStyle, radiusPx },
    generationRules: option.generationRules?.length
      ? option.generationRules
      : [`卡片样式：${label}；圆角约 ${radiusPx}px。`],
  };
}

function enrichDensityOption(option: OptionItem, styleName: string): OptionItem {
  const hints = { ...(option.tokenHints ?? {}) };
  const preview = option.previewRules ?? {};
  const hint = styleName || String(hints.densityStyleName ?? option.label ?? "");
  const density = canonicalDensityKey(String(preview.density ?? ""), hint);
  const label = canonicalDensityLabel(density);
  return {
    ...option,
    label,
    tokenHints: { ...hints, densityStyleName: label },
    previewRules: { ...preview, density },
    generationRules: option.generationRules?.length
      ? option.generationRules
      : [`内容密度：${label}；模块间距与留白按 ${density} 档执行。`],
  };
}

function enrichVisualOption(dimensionId: VisualId, option: OptionItem): OptionItem {
  const styleName = styleNameForDimension(dimensionId, option);
  const base = { ...option, source: option.source ?? ("ai-generated" as const), signal: option.signal };
  if (dimensionId === "color") return enrichColorOption(base, styleName);
  if (dimensionId === "font") return enrichFontOption(base, styleName);
  if (dimensionId === "card") return enrichCardOption(base, styleName);
  return enrichDensityOption(base, styleName);
}

function trimReason(reason: string, planTitle?: string) {
  let text = reason.trim();
  if (planTitle) {
    text = text.replace(new RegExp(`适合[「"]?${planTitle}[」"]?[^。]*。?`), "");
  }
  text = text.replace(/适用于[^。]+。?/g, "").trim();
  if (text.length > 96) {
    const cut = text.slice(0, 96);
    const last = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("，"), cut.lastIndexOf("；"));
    text = last > 40 ? cut.slice(0, last + 1) : `${cut}…`;
  }
  return text;
}

function architectureTiedReason(dimensionId: VisualId, styleName: string, plan?: InfoPlan) {
  if (dimensionId === "color") {
    const lead = plan?.title ? `配「${plan.title.slice(0, 8)}」` : "当前方案";
    return `${lead}，${styleName}定情绪基调`;
  }
  if (dimensionId === "font") {
    if (styleName === "粗黑体") return "标题更醒目，适合品牌首屏";
    if (styleName === "衬线体") return "衬线标题，偏典雅气质";
    return "正文耐看，适合长说明";
  }
  if (dimensionId === "card") {
    if (/扁平|无影/.test(styleName)) return "扁平贴底，几乎无阴影";
    if (/描边/.test(styleName)) return "描边清晰，模块边界明确";
    if (/强阴影/.test(styleName)) return "强阴影浮起，层级最明显";
    return "轻阴影浮层，模块好扫读";
  }
  if (dimensionId === "density") {
    if (/疏松|留白/.test(styleName)) return "留白多，每屏信息更少";
    if (/紧凑|密集/.test(styleName)) return "信息更密，一屏看更多";
    return "疏密适中，浏览节奏平衡";
  }
  return `${styleName}。`;
}

function fontReasonContradictsStyle(style: string, raw: string) {
  const mentions = [
    raw.includes("无衬线") ? "无衬线" : "",
    raw.replace(/无衬线/g, "").includes("衬线") ? "衬线" : "",
    raw.includes("粗黑") ? "粗黑" : "",
  ].filter(Boolean);
  if (mentions.length > 1) return true;
  if (!style) return false;
  if (/无衬线/.test(raw) && style === "衬线体") return true;
  if (/衬线/.test(raw.replace(/无衬线/g, "")) && style === "无衬线体") return true;
  if (/粗黑/.test(raw) && style === "无衬线体") return true;
  if (/无衬线/.test(raw) && style === "粗黑体") return true;
  return false;
}

function isLibraryBoilerplateReason(dimensionId: VisualId, raw: string) {
  if (!raw) return true;
  if (dimensionId === "color") {
    return (
      isLayoutOrientedColorLabel(raw) ||
      /作品风格|图片承担|界面和流程|先看作品|视觉退后|白底|大图|结构化|技术白|网格|画廊|模块顺序|首屏重心/.test(raw)
    );
  }
  if (dimensionId === "font") {
    return /标题有明确性格|正文保持舒适|清晰无衬线|正文优先可读|区分标题力度|优设|DIN|展示标题/.test(raw);
  }
  if (dimensionId === "card" || dimensionId === "density") {
    return raw.length > 48 || /^配合「|^配合当前|案例库原文/.test(raw);
  }
  return false;
}

function normalizeReason(dimensionId: VisualId, option: OptionItem, plan?: InfoPlan) {
  const style = styleNameForDimension(dimensionId, option);
  const raw = (option.reason ?? "").trim();
  if (
    !raw ||
    isLibraryBoilerplateReason(dimensionId, raw) ||
    (dimensionId === "font" && fontReasonContradictsStyle(style, raw))
  ) {
    return architectureTiedReason(dimensionId, style, plan);
  }
  const body = trimReason(raw, plan?.title?.trim());
  const merged = body.startsWith(style) ? body : `${style}：${body}`;
  return merged.length > 32 ? `${merged.slice(0, 31)}…` : merged;
}

export function formatVisualOptionReason(dimensionId: VisualId, option: OptionItem, plan?: InfoPlan) {
  return normalizeReason(dimensionId, option, plan);
}

export { enrichVisualOption };

function optionLabelFromRaw(option: OptionItem, note?: string) {
  const label = option.label?.trim();
  if (label) return label;
  const fromReason = option.reason?.trim().split(/[，。,.]/)[0]?.trim();
  if (fromReason && fromReason.length <= 18) return fromReason;
  const fromNote = note?.trim().split(/[，。,.]/)[0]?.trim();
  if (fromNote && fromNote.length <= 18) return fromNote;
  return option.id.replace(/^ai-[^-]+-/, "").replace(/-/g, " ") || option.id;
}

function buildOptionsFromIds(
  dimensionId: VisualId,
  selection: NonNullable<RawVisualPayload[VisualId]>,
  plan?: InfoPlan,
): OptionItem[] {
  const recommendedId = selection.recommendedOptionId ?? selection.optionId ?? selection.optionIds?.[0];
  if (!recommendedId) return [];
  const orderedIds = [recommendedId, ...(selection.optionIds ?? [])]
    .filter((id): id is string => Boolean(id))
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .slice(0, VISUAL_DIMENSION_INITIAL_OPTIONS);

  return orderedIds.map((id) => {
    const note = selection.optionNotes?.[id];
    const base: OptionItem = {
      id,
      label: optionLabelFromRaw({ id, label: "", reason: note }, note),
      source: "ai-generated",
      reason: note,
    };
    return enrichVisualOption(dimensionId, base);
  }).map((item) => ({
    ...item,
    reason: normalizeReason(dimensionId, item, plan),
    knowledge: item.knowledge ?? item.reason,
  }));
}

function markVisualConstraintSignals(
  dimensionId: VisualId,
  options: OptionItem[],
  context?: { spokenConstraints?: SpokenConstraint[]; rawInput?: string },
) {
  const spoken = filterVisualMarkingConstraints(context?.rawInput ?? "", context?.spokenConstraints ?? [], dimensionId);
  const rawInput = context?.rawInput ?? "";
  if (!spoken.length) return options;
  return options.map((option) => {
    if (spoken.some((constraint) => optionReflectsSpokenConstraintForVisual(rawInput, option, constraint))) {
      return { ...option, signal: "constraint" as const };
    }
    return option;
  });
}

function pickRecommendedVisualOption(options: OptionItem[], selectionRecommendedId?: string) {
  const constraintMatch = options.find((item) => item.signal === "constraint");
  if (constraintMatch) return constraintMatch.id;
  if (selectionRecommendedId && options.some((item) => item.id === selectionRecommendedId)) {
    return selectionRecommendedId;
  }
  return options[0]?.id;
}

export function normalizeVisualGrammarSelections(
  selections: RawVisualPayload | undefined,
  context?: { infoPlan?: InfoPlan; spokenConstraints?: SpokenConstraint[]; rawInput?: string; intent?: IntentState },
): Partial<Record<VisualId, AiVisualSelection>> {
  const result: Partial<Record<VisualId, AiVisualSelection>> = {};

  for (const dimensionId of VISUAL_DIMENSION_IDS) {
    const selection = selections?.[dimensionId];
    if (!selection) continue;

    let rawOptions = (selection.options ?? [])
      .filter((item) => item?.id)
      .slice(0, VISUAL_DIMENSION_INITIAL_OPTIONS)
      .map((item) =>
        enrichVisualOption(dimensionId, {
          ...item,
          label: optionLabelFromRaw(item, selection.optionNotes?.[item.id]),
        }),
      );

    if (!rawOptions.length) {
      rawOptions = buildOptionsFromIds(dimensionId, selection, context?.infoPlan);
    }

    if (!rawOptions.length) continue;

    rawOptions = injectVisualConstraintOptions(
      dimensionId,
      rawOptions,
      context?.spokenConstraints ?? [],
      context?.rawInput ?? "",
      { intent: context?.intent },
    );
    rawOptions = markVisualConstraintSignals(dimensionId, rawOptions, context);
    rawOptions = dedupeVisualDimensionOptions(dimensionId, rawOptions);

    const recommendedId = pickRecommendedVisualOption(
      rawOptions,
      selection.recommendedOptionId ?? selection.optionId,
    );
    const hasConstraintLead = rawOptions.some((item) => item.id === recommendedId && item.signal === "constraint");
    const recommended = rawOptions.find((item) => item.id === recommendedId)?.id ?? rawOptions[0].id;
    const ordered = [recommended, ...rawOptions.filter((item) => item.id !== recommended).map((item) => item.id)];
    const options = rawOptions.map((item) => ({
      ...item,
      signal:
        item.id === recommended
          ? hasConstraintLead
            ? ("constraint" as const)
            : selection.source === "constraint"
              ? ("constraint" as const)
              : ("recommended" as const)
          : item.signal,
      reason: normalizeReason(dimensionId, item, context?.infoPlan),
      knowledge: item.knowledge ?? item.reason,
    }));

    result[dimensionId] = {
      optionId: recommended,
      recommendedOptionId: recommended,
      optionIds: ordered,
      options,
      optionNotes: Object.fromEntries(options.map((item) => [item.id, item.reason ?? ""])),
      source: hasConstraintLead || selection.source === "constraint" ? "constraint" : "recommended",
      reason: selection.reason,
    };
  }

  return result;
}
