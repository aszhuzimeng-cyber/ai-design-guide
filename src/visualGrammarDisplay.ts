import { getVisualSpec } from "./ai/visualSpecs";
import type { OptionItem, VisualId } from "./types";
import { formatColorTokenLine, parseColorDescription, resolveColorPalette } from "./visualColorPalette";

export type FontDisplay = {
  styleName: string;
  headingFont: string;
  bodyFont: string;
  numericFont?: string;
  headingSample: string;
  bodySample: string;
};

export type CardDisplay = {
  styleName: string;
  radius: string;
  shadow: string;
  border: string;
  mode: string;
};

export type DensityDisplay = {
  styleName: string;
  density: "spacious" | "balanced" | "compact";
  gap: string;
  columns: number;
  whitespace: string;
  modulesPerScreen: number;
};

export function normalizeDensityMode(value: string, option?: OptionItem): "spacious" | "balanced" | "compact" {
  const text = [
    value,
    option?.label,
    option?.tokenHints?.densityStyleName,
    option?.reason,
  ]
    .filter((item) => typeof item === "string")
    .join(" ");
  if (/低内容|大留白|疏松|spacious/i.test(text)) return "spacious";
  if (/高信息|高内容|紧凑|密集|compact|分组/i.test(text)) return "compact";
  if (/spacious/i.test(value)) return "spacious";
  if (/compact|dense/i.test(value)) return "compact";
  return "balanced";
}

export function densityViewportSpec(density: "spacious" | "balanced" | "compact") {
  if (density === "spacious") {
    return { modulesPerScreen: 2, gap: 14, moduleMinHeight: 36, framePadding: 12, badge: "一屏 2 块", showSpacer: true };
  }
  if (density === "compact") {
    return { modulesPerScreen: 6, gap: 3, moduleMinHeight: 11, framePadding: 6, badge: "一屏 6 块", showSpacer: false };
  }
  return { modulesPerScreen: 3, gap: 8, moduleMinHeight: 24, framePadding: 10, badge: "一屏 3 块", showSpacer: false };
}

export function formatCardPublicLabel(card: CardDisplay) {
  return cardStyleNameFromKey(card.mode.replace(/_/g, "-"), card.styleName);
}

export function formatCardBadge(card: CardDisplay) {
  return formatCardPublicLabel(card);
}

export type VisualGrammarDisplay = {
  styleName: string;
  tokenLine: string;
  font?: FontDisplay;
  card?: CardDisplay;
  density?: DensityDisplay;
};

function catalogSpecId(dimensionId: VisualId, optionId: string) {
  const prefixed = optionId.match(new RegExp(`^${dimensionId}-(.+)$`, "i"));
  if (prefixed) {
    const tail = prefixed[1];
    if (getVisualSpec(dimensionId, tail)) return tail;
  }
  if (getVisualSpec(dimensionId, optionId)) return optionId;
  return undefined;
}

function readString(source: Record<string, unknown> | undefined, keys: string[]) {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function readPx(value: unknown, fallback: string) {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    return /px$/.test(trimmed) ? trimmed : `${trimmed}px`;
  }
  return fallback;
}

function shortenFontName(stack: string) {
  const first = stack.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
  if (/pingfang|microsoft yahei/i.test(first)) return "苹方黑体";
  if (/alibaba|puhui/i.test(first)) return "普惠体";
  if (/youshe|biaoti/i.test(first)) return "优设标题黑";
  if (/din/i.test(first)) return "DIN";
  if (/serif/i.test(first) && !/sans/i.test(first)) return "衬线体";
  return first || "系统黑体";
}

export function inferFontStyleName(text: string, _fallback: string) {
  if (/无衬线|sans[- ]?serif|黑体|pingfang|yahei|普惠|可读/i.test(text)) return "无衬线体";
  if (/衬线|serif|典雅|georgia|times/i.test(text)) return "衬线体";
  if (/粗黑|展示|标题黑|display|biaoti|youshe|优设/i.test(text)) return "粗黑体";
  return "无衬线体";
}

export type FontArchetype = "readable" | "display" | "serif";

export const FONT_STACK_BY_ARCHETYPE: Record<FontArchetype, { heading: string; body: string }> = {
  readable: {
    heading: '"PingFang SC", "Microsoft YaHei", sans-serif',
    body: '"PingFang SC", "Microsoft YaHei", sans-serif',
  },
  display: {
    heading: '"YouSheBiaoTiHei", "PingFang SC", sans-serif',
    body: '"PingFang SC", "Microsoft YaHei", sans-serif',
  },
  serif: {
    heading: 'Georgia, "Times New Roman", serif',
    body: '"PingFang SC", "Microsoft YaHei", sans-serif',
  },
};

export function archetypeFromStyleLabel(label: string): FontArchetype | null {
  const text = label.trim();
  if (!text) return null;
  if (/粗黑/.test(text)) return "display";
  if (/无衬线/.test(text)) return "readable";
  if (/衬线/.test(text)) return "serif";
  return null;
}

function archetypeFromFontStack(stack: string): FontArchetype | null {
  const text = stack.toLowerCase();
  if (/georgia|times new roman|"serif"/i.test(stack) && !/sans-serif|sans serif/i.test(stack)) return "serif";
  if (/youshe|biaotiheiti|display/i.test(text)) return "display";
  if (/pingfang|yahei|sans-serif|sans serif/i.test(text)) return "readable";
  return null;
}

export function resolveFontArchetype(option: OptionItem): FontArchetype {
  const fromHint =
    typeof option.tokenHints?.fontStyleName === "string"
      ? archetypeFromStyleLabel(option.tokenHints.fontStyleName)
      : null;
  if (fromHint) return fromHint;
  const fromLabel = option.label ? archetypeFromStyleLabel(option.label) : null;
  if (fromLabel) return fromLabel;
  const heading = typeof option.tokenHints?.heading === "string" ? option.tokenHints.heading : "";
  const fromStack = heading ? archetypeFromFontStack(heading) : null;
  if (fromStack) return fromStack;
  return "readable";
}

export function resolveFontPublicLabel(archetype: FontArchetype) {
  if (archetype === "display") return "粗黑体";
  if (archetype === "serif") return "衬线体";
  return "无衬线体";
}

export const CANONICAL_CARD_STYLES = ["flat-hairline", "soft-card", "bordered", "elevated"] as const;
export type CanonicalCardStyle = (typeof CANONICAL_CARD_STYLES)[number];

export const CANONICAL_DENSITY_KEYS = ["spacious", "balanced", "compact"] as const;
export type CanonicalDensityKey = (typeof CANONICAL_DENSITY_KEYS)[number];

const CARD_STYLE_NAMES: Record<CanonicalCardStyle, string> = {
  "flat-hairline": "扁平无影",
  "soft-card": "轻阴影",
  bordered: "描边分组",
  elevated: "强阴影",
};

export const CANONICAL_DENSITY_LABELS: Record<CanonicalDensityKey, string> = {
  spacious: "疏松留白",
  balanced: "中等密度",
  compact: "紧凑密集",
};

const CARD_STYLE_ALIASES: Record<string, CanonicalCardStyle> = {
  flat: "flat-hairline",
  "flat-hairline": "flat-hairline",
  soft: "soft-card",
  "soft-card": "soft-card",
  "soft-shadow": "soft-card",
  panel: "soft-card",
  bordered: "bordered",
  elevated: "elevated",
};

export function canonicalCardStyleKey(cardStyle: string, labelHint = ""): CanonicalCardStyle {
  const normalized = cardStyle.trim().toLowerCase();
  if (CARD_STYLE_ALIASES[normalized]) return CARD_STYLE_ALIASES[normalized];
  const hint = labelHint.trim();
  if (/扁平|无影/.test(hint)) return "flat-hairline";
  if (/描边|分组/.test(hint)) return "bordered";
  if (/强阴影|浮起/.test(hint)) return "elevated";
  if (/轻阴影|浮层|面板|克制/.test(hint)) return "soft-card";
  return "soft-card";
}

export function canonicalCardLabel(cardStyle: CanonicalCardStyle) {
  return CARD_STYLE_NAMES[cardStyle];
}

export function canonicalDensityKey(density: string, labelHint = ""): CanonicalDensityKey {
  const text = `${density} ${labelHint}`.trim();
  if (/spacious|low|疏松|留白多/i.test(text)) return "spacious";
  if (/compact|dense|high|紧凑|密集/i.test(text)) return "compact";
  return "balanced";
}

export function canonicalDensityLabel(density: CanonicalDensityKey) {
  return CANONICAL_DENSITY_LABELS[density];
}

const IMPLICIT_CARD_SHORT: Array<[RegExp, string]> = [
  [/弱边框|flat-hairline|直角|扁平/, "扁平无影"],
  [/轻阴影|soft-card|浮层/, "轻阴影"],
  [/浮起|elevated|强阴影/, "强阴影"],
  [/描边|bordered|分组/, "描边分组"],
  [/面板|panel/, "面板分区"],
];

export function clampStyleName(text: string, maxLen = 8, fallback = "") {
  const cleaned = text.trim().split(/[，。,.、]/)[0]?.trim() ?? "";
  if (!cleaned) return fallback;
  return cleaned.length <= maxLen ? cleaned : cleaned.slice(0, maxLen);
}

export function shortenCardStyleText(text: string, fallback = "克制卡片") {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  for (const [pattern, label] of IMPLICIT_CARD_SHORT) {
    if (pattern.test(trimmed)) return label;
  }
  return clampStyleName(trimmed, 8, fallback);
}

export function cardStyleNameFromKey(cardStyle: string, implicit?: string) {
  const canonical = canonicalCardStyleKey(cardStyle, implicit ?? "");
  if (cardStyle.trim() || implicit?.trim()) return canonicalCardLabel(canonical);
  return "轻阴影";
}

function inferCardStyleName(option: OptionItem) {
  if (typeof option.tokenHints?.cardStyleName === "string" && option.tokenHints.cardStyleName.trim()) {
    return option.tokenHints.cardStyleName.trim();
  }
  const cardStyle = String(option.previewRules?.cardStyle ?? "");
  const implicit = readImplicitFromOption(option, "卡片样式");
  return cardStyleNameFromKey(cardStyle, implicit ?? option.label ?? "");
}

function inferDensityStyleName(option: OptionItem) {
  const hints = option.tokenHints ?? {};
  if (typeof hints.densityStyleName === "string" && hints.densityStyleName.trim()) {
    const name = hints.densityStyleName.trim();
    return canonicalDensityLabel(canonicalDensityKey("", name));
  }
  const density = String(option.previewRules?.density ?? "");
  const implicit = readImplicitFromOption(option, "内容密度");
  return canonicalDensityLabel(canonicalDensityKey(density, implicit ?? option.label ?? ""));
}

function readImplicitFromOption(option: OptionItem, key: string) {
  const direct = option.implicitDecisions?.[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const preview = option.previewRules?.implicitDecisions;
  if (preview && typeof preview === "object" && !Array.isArray(preview)) {
    const nested = (preview as Record<string, unknown>)[key];
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return undefined;
}

export function resolveFontDisplay(option: OptionItem): FontDisplay {
  const archetype = resolveFontArchetype(option);
  const styleName =
    ((option.source === "user-added" || option.custom) && option.label?.trim()) ||
    (typeof option.tokenHints?.fontStyleName === "string" && option.tokenHints.fontStyleName.trim()) ||
    (option.label?.trim() && archetypeFromStyleLabel(option.label) ? option.label.trim() : "") ||
    resolveFontPublicLabel(archetype);
  const canonical = FONT_STACK_BY_ARCHETYPE[archetype];
  const catalogId = catalogSpecId("font", option.id);
  const hints = option.tokenHints ?? {};
  const fontText = typeof hints.fontDescription === "string" ? hints.fontDescription : option.label ?? "";

  if (catalogId) {
    const spec = getVisualSpec("font", catalogId);
    if (spec) {
      const heading = spec.cssTokens.heading ?? canonical.heading;
      const body = spec.cssTokens.body ?? heading;
      const numeric = spec.cssTokens.price;
      return {
        styleName,
        headingFont: heading,
        bodyFont: body,
        numericFont: numeric,
        headingSample: "春季新品发布",
        bodySample: "细腻质地，每日呵护肌肤",
      };
    }
  }

  const typeScale = String(option.previewRules?.typeScale ?? "");
  const hintHeading = readString(hints, ["heading", "headingFont", "fontFamily"]);
  const hintBody = readString(hints, ["body", "bodyFont"]);
  const heading =
    hintHeading && archetypeFromFontStack(hintHeading) === archetype
      ? hintHeading
      : canonical.heading;
  const body =
    hintBody && (!hintHeading || archetypeFromFontStack(hintBody) !== null)
      ? hintBody
      : canonical.body;
  const numeric = readString(hints, ["numeric", "price", "numericFont"]);

  return {
    styleName,
    headingFont: heading,
    bodyFont: body,
    numericFont: numeric,
    headingSample: /展示|性格|expressive/i.test(`${fontText} ${typeScale}`) ? "春季新品发布" : "春季新品发布",
    bodySample: "细腻质地，每日呵护肌肤",
  };
}

export function resolveCardDisplay(option: OptionItem): CardDisplay {
  const catalogId = catalogSpecId("card", option.id);
  if (catalogId) {
    const spec = getVisualSpec("card", catalogId);
    if (spec) {
      const tokens = spec.cssTokens;
      const mode = catalogId;
      return {
        styleName: cardStyleNameFromKey(mode),
        radius: tokens.card ?? "8px",
        shadow: tokens.shadow === "none" ? "无" : mode === "elevated" ? "强" : "轻",
        border: tokens.border?.includes("none") ? "无" : mode === "bordered" ? "粗描边" : "细描边",
        mode,
      };
    }
  }

  const preview = option.previewRules ?? {};
  const radiusTokens = option.visualTokens?.radius;
  const radiusObj =
    radiusTokens && typeof radiusTokens === "object" && !Array.isArray(radiusTokens)
      ? (radiusTokens as Record<string, unknown>)
      : undefined;
  const radius = readPx(preview.radiusPx ?? radiusObj?.card, "8px");
  const cardStyle = String(preview.cardStyle ?? "soft-card");
  const shadowLevel = readImplicitFromOption(option, "阴影层级") ?? (cardStyle.includes("flat") ? "几乎无阴影" : "轻柔阴影");
  const borderLevel =
    cardStyle === "flat-hairline" || cardStyle === "bordered" ? "细描边" : cardStyle === "elevated" ? "无" : "弱描边";

  return {
    styleName: inferCardStyleName(option),
    radius,
    shadow: shadowLevel.includes("无") ? "无" : shadowLevel.includes("极轻") ? "极轻" : "轻",
    border: borderLevel,
    mode: cardStyle,
  };
}

export function resolveDensityDisplay(option: OptionItem): DensityDisplay {
  const catalogId = catalogSpecId("density", option.id);
  if (catalogId) {
    const spec = getVisualSpec("density", catalogId);
    if (spec) {
      const tokens = spec.cssTokens;
      const density = normalizeDensityMode(tokens.density ?? catalogId, option);
      const viewport = densityViewportSpec(density);
      return {
        styleName: spec.label,
        density,
        gap: tokens.gap ?? `${viewport.gap}px`,
        columns: Number(tokens.columns ?? viewport.modulesPerScreen),
        whitespace: density === "spacious" ? "大留白" : density === "compact" ? "紧凑" : "适中",
        modulesPerScreen: viewport.modulesPerScreen,
      };
    }
  }

  const preview = option.previewRules ?? {};
  const density = normalizeDensityMode(String(preview.density ?? "balanced"), option);
  const viewport = densityViewportSpec(density);
  const whitespace =
    readImplicitFromOption(option, "留白") ??
    (density === "spacious" ? "大留白" : density === "compact" ? "紧凑留白" : "适中留白");

  return {
    styleName: inferDensityStyleName(option),
    density,
    gap: `${viewport.gap}px`,
    columns: viewport.modulesPerScreen,
    whitespace,
    modulesPerScreen: viewport.modulesPerScreen,
  };
}

export function formatFontTokenLine(_font: FontDisplay, archetype?: FontArchetype) {
  const mode = archetype ?? "readable";
  if (mode === "display") return "标题粗黑 · 正文无衬线";
  if (mode === "serif") return "标题衬线 · 正文无衬线";
  return "标题正文均无衬线";
}

export function formatCardTokenLine(card: CardDisplay) {
  const radiusNum = parseInt(card.radius, 10);
  const radiusLabel = Number.isFinite(radiusNum) ? (radiusNum <= 5 ? "小圆角" : radiusNum >= 11 ? "大圆角" : "中圆角") : card.radius;
  const mode = card.mode.replace(/_/g, "-");
  if (mode === "flat-hairline" || mode === "flat") return `细边框 · 无阴影 · ${radiusLabel}`;
  if (mode === "bordered") return `粗描边 · 无阴影 · ${radiusLabel}`;
  if (mode === "elevated") return `无描边 · 强阴影 · ${radiusLabel}`;
  return `无描边 · 轻阴影 · ${radiusLabel}`;
}

export function formatDensityTokenLine(density: DensityDisplay) {
  const whitespace = density.whitespace.replace(/留白$/, "") || "适中";
  return `${density.modulesPerScreen} 块/屏 · ${whitespace}留白`;
}

export function resolveVisualGrammarDisplay(dimensionId: VisualId, option: OptionItem): VisualGrammarDisplay {
  if (dimensionId === "color") {
    const palette = resolveColorPalette(option);
    return { styleName: palette.styleName, tokenLine: formatColorTokenLine(palette) };
  }
  if (dimensionId === "font") {
    const font = resolveFontDisplay(option);
    const archetype = resolveFontArchetype(option);
    return { styleName: font.styleName, tokenLine: formatFontTokenLine(font, archetype), font };
  }
  if (dimensionId === "card") {
    const card = resolveCardDisplay(option);
    return { styleName: formatCardPublicLabel(card), tokenLine: formatCardTokenLine(card), card };
  }
  const density = resolveDensityDisplay(option);
  return { styleName: density.styleName, tokenLine: formatDensityTokenLine(density), density };
}

export { parseColorDescription };
