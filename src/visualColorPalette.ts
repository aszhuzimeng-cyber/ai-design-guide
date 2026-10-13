import { getVisualSpec } from "./ai/visualSpecs";
import type { OptionItem } from "./types";

export type ColorPaletteDisplay = {
  styleName: string;
  primary: string;
  secondary: string;
  accent: string;
  background?: string;
  text?: string;
  previewClass?: string;
};

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export type ColorFamily =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "purple"
  | "pink"
  | "brown"
  | "neutral";

function hexToHsl(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s, l };
}

export function classifyColorFamily(hex: string): ColorFamily {
  const hsl = hexToHsl(hex);
  if (!hsl) return "neutral";
  if (hsl.s < 0.14) return "neutral";
  if (hsl.l < 0.18 && hsl.s < 0.35) return "neutral";
  const { h } = hsl;
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 155) return "green";
  if (h < 195) return "cyan";
  if (h < 250) return "blue";
  if (h < 290) return "purple";
  if (h < 345) return "pink";
  return "neutral";
}

const LABEL_FAMILY_PATTERNS: Array<[RegExp, ColorFamily]> = [
  [/深蓝|藏蓝|海军|靛蓝/, "blue"],
  [/浅蓝|天蓝|冰蓝|清爽蓝|冷调|科技/, "blue"],
  [/橙|橘|活力/, "orange"],
  [/暖黄|金黄/, "yellow"],
  [/墨绿|深绿|翠绿|清新绿/, "green"],
  [/暖灰|米灰|中性灰/, "neutral"],
  [/大地|棕|咖|暖棕/, "brown"],
  [/紫|罗兰/, "purple"],
  [/暖红|深红|赤/, "red"],
  [/粉|玫/, "pink"],
  [/青|teal/i, "cyan"],
];

const FAMILY_STYLE_PREFIX: Record<ColorFamily, [string, string]> = {
  red: ["暖红", "深红"],
  orange: ["暖橙", "橙调"],
  yellow: ["暖黄", "金黄"],
  green: ["墨绿", "清新绿"],
  cyan: ["冷青", "清爽青"],
  blue: ["深蓝", "清爽蓝"],
  purple: ["紫色", "紫调"],
  pink: ["粉调", "柔粉"],
  brown: ["暖棕", "大地色"],
  neutral: ["暖灰", "中性灰"],
};

const COLOR_MOODS = ["可信", "亲和", "科技", "活力", "高级", "克制", "专业", "沉稳", "清新"] as const;

const LAYOUT_COLOR_LABEL = /白底|大图|小图|界面|结构|网格|画廊|杂志|留白|技术白|版式|首屏|模块|布局|作品先|生活感/;

export function inferPrimaryHexFromLabel(text: string) {
  const normalized = text.trim();
  const hex = normalized.match(/#[0-9a-f]{6}/i)?.[0];
  if (hex) return hex.toLowerCase();

  if (/黄橙|橙黄/.test(normalized)) return "#f59e0b";
  if (/深蓝|藏蓝|海军|靛蓝|冷静蓝|蓝系|蓝色/.test(normalized)) return "#1e3a8a";
  if (/浅蓝|淡蓝|天蓝|冰蓝/.test(normalized)) return "#60a5fa";
  if (/暖橙|橙色|橘色|橘/.test(normalized)) return "#ea580c";
  if (/金黄|暖黄|柠檬|黄色|(?<![蓝绿])黄/.test(normalized)) return "#eab308";
  if (/深红|红黑|红色|赤/.test(normalized)) return "#991b1b";
  if (/粉|玫/.test(normalized)) return "#db2777";
  if (/紫|罗兰/.test(normalized)) return "#7c3aed";
  if (/墨绿|深绿|翠绿|绿色|(?<![蓝])绿/.test(normalized)) return "#15803d";
  if (/青|teal/i.test(normalized)) return "#0891b2";
  if (/大地|棕|咖|暖棕/.test(normalized)) return "#92400e";
  if (/暖灰|米灰|灰色|灰/.test(normalized)) return "#78716c";
  if (/浅|低饱和|白底|浅色/.test(normalized)) return "#94a3b8";
  if (/黑|深色|暗/.test(normalized)) return "#1f2937";
  if (/暖/.test(normalized)) return "#d97706";
  if (/冷/.test(normalized)) return "#2563eb";
  if (/蓝/.test(normalized)) return "#2563eb";
  return "#64748b";
}

const FAMILY_SECONDARY_HEX: Record<ColorFamily, string> = {
  red: "#fee2e2",
  orange: "#ffedd5",
  yellow: "#fef9c3",
  green: "#dcfce7",
  cyan: "#cffafe",
  blue: "#dbeafe",
  purple: "#ede9fe",
  pink: "#fce7f3",
  brown: "#fef3c7",
  neutral: "#f1f5f9",
};

export function inferColorTokensFromLabel(label: string): ColorPaletteDisplay {
  const trimmed = label.trim();
  const primary = inferPrimaryHexFromLabel(trimmed);
  const family = classifyColorFamily(primary);
  return {
    styleName: trimmed || "配色方案",
    primary,
    secondary: FAMILY_SECONDARY_HEX[family] ?? "#f1f5f9",
    accent: "#0f172a",
    background: "#f8fafc",
    text: "#0f172a",
    previewClass: "preview-rich-color",
  };
}

export function isLayoutOrientedColorLabel(label: string) {
  return LAYOUT_COLOR_LABEL.test(label.trim());
}

const TAG_MOOD_PATTERNS: Array<[RegExp, string]> = [
  [/清新|清爽/, "清新"],
  [/专业/, "专业"],
  [/克制|客观|沉稳|编辑感/, "克制"],
  [/亲和|亲近|温暖|自然|有温度/, "亲和"],
  [/科技|系统/, "科技"],
  [/卡通|童趣|可爱|活泼|元气/, "活力"],
  [/活力/, "活力"],
  [/高级/, "高级"],
];

export function inferColorMoodFromText(text: string) {
  const corpus = text.trim();
  if (!corpus) return "可信";
  for (const [pattern, mood] of TAG_MOOD_PATTERNS) {
    if (pattern.test(corpus)) return mood;
  }
  for (const mood of COLOR_MOODS) {
    if (corpus.includes(mood)) return mood;
  }
  return "可信";
}

export function inferLabelColorFamily(label: string): ColorFamily | null {
  for (const [pattern, family] of LABEL_FAMILY_PATTERNS) {
    if (pattern.test(label)) return family;
  }
  return null;
}

function extractMoodFromLabel(label: string) {
  return inferColorMoodFromText(label);
}

function isDeepColor(hex: string) {
  const hsl = hexToHsl(hex);
  return Boolean(hsl && hsl.l < 0.45);
}

export function colorStyleNameFromPrimary(hex: string, mood = "可信") {
  const family = classifyColorFamily(hex);
  const [deepPrefix, lightPrefix] = FAMILY_STYLE_PREFIX[family];
  const prefix = family === "blue" || family === "neutral" || family === "green"
    ? isDeepColor(hex)
      ? deepPrefix
      : lightPrefix
    : deepPrefix;
  const combined = `${prefix}${mood}`;
  return combined.length <= 8 ? combined : combined.slice(0, 8);
}

export function reconcileColorTokens(
  input: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    label: string;
  },
  options?: { preserveLabel?: boolean },
) {
  let { primary, secondary, accent, background, text, label } = input;
  const labelFamily = inferLabelColorFamily(label);
  let primaryFamily = classifyColorFamily(primary);
  const accentFamily = classifyColorFamily(accent);

  if (labelFamily && labelFamily !== primaryFamily && labelFamily === accentFamily) {
    [primary, accent] = [accent, primary];
    primaryFamily = classifyColorFamily(primary);
  }

  const labelColorMismatch = Boolean(labelFamily && labelFamily !== primaryFamily);
  if (labelColorMismatch || (!options?.preserveLabel && (!labelFamily || labelFamily !== primaryFamily))) {
    label = colorStyleNameFromPrimary(primary, extractMoodFromLabel(label));
  }

  return { primary, secondary, accent, background, text, label };
}

function readHex(source: Record<string, unknown> | undefined, keys: string[]) {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim();
  }
  return undefined;
}

export function parseColorDescription(text: string) {
  const pick = (label: string) => text.match(new RegExp(`${label}\\s*(#[0-9a-f]{6})`, "i"))?.[1];
  const background = pick("背景");
  const textColor = pick("正文");
  const primary = pick("主色") ?? pick("强调色");
  const secondary = pick("辅色") ?? background;
  const accent = pick("点缀") ?? pick("强调色");
  return { background, text: textColor, primary, secondary, accent };
}

function inferStyleName(option: OptionItem) {
  const label = option.label?.trim() ?? "";
  if (label && !/^背景\s*#/i.test(label)) return label;
  const tagMood = option.generationRules?.[0] ?? "";
  const fromTags = /清爽|活力|冷静|暖|高级|克制|专业|撞色|蓝系|红黑/.exec(
    `${option.knowledge ?? ""} ${option.reason ?? ""} ${tagMood}`,
  );
  if (fromTags) return `${fromTags[0]}色系`;
  return "配色方案";
}

function catalogColorId(optionId: string) {
  const withPrefix = optionId.match(/^color-(.+)$/i);
  if (withPrefix) return withPrefix[1];
  if (getVisualSpec("color", optionId)) return optionId;
  return undefined;
}

export function resolveColorPalette(option: OptionItem): ColorPaletteDisplay {
  const catalogId = catalogColorId(option.id);
  if (catalogId) {
    const spec = getVisualSpec("color", catalogId);
    if (spec) {
      const tokens = spec.cssTokens;
      return {
        styleName: spec.label,
        primary: tokens.primary ?? "#2563eb",
        secondary: tokens.secondary ?? "#dbeafe",
        accent: tokens.accent ?? "#0f172a",
        background: tokens.background,
        text: tokens.text,
        previewClass: `preview-${catalogId}`,
      };
    }
  }

  const isUserDefined = option.source === "user-added" || option.custom;
  if (isUserDefined) {
    const hints = option.tokenHints ?? {};
    const fromLabel = inferColorTokensFromLabel(option.label ?? "");
    const primary = readHex(hints, ["primary"]) ?? fromLabel.primary;
    const secondary = readHex(hints, ["secondary"]) ?? fromLabel.secondary;
    const accent = readHex(hints, ["accent"]) ?? fromLabel.accent;
    const background = readHex(hints, ["background", "bg"]) ?? fromLabel.background ?? "#f8fafc";
    const text = readHex(hints, ["text"]) ?? fromLabel.text ?? "#0f172a";
    const reconciled = reconcileColorTokens(
      {
        primary,
        secondary,
        accent,
        background,
        text,
        label:
          (typeof hints.colorStyleName === "string" && hints.colorStyleName.trim()) ||
          option.label?.trim() ||
          fromLabel.styleName,
      },
      { preserveLabel: false },
    );
    return {
      styleName: reconciled.label,
      primary: reconciled.primary,
      secondary: reconciled.secondary,
      accent: reconciled.accent,
      background: reconciled.background,
      text: reconciled.text,
      previewClass: fromLabel.previewClass ?? "preview-rich-color",
    };
  }

  const visualColor = option.visualTokens?.color;
  const colorObj =
    visualColor && typeof visualColor === "object" && !Array.isArray(visualColor)
      ? (visualColor as Record<string, unknown>)
      : undefined;
  const preview = option.previewRules ?? {};
  const hints = option.tokenHints ?? {};
  const colorText =
    typeof hints.colorDescription === "string"
      ? hints.colorDescription
      : typeof option.knowledge === "string" && option.knowledge.includes("#")
        ? option.knowledge
        : "";

  const parsed = parseColorDescription(colorText);
  const background =
    parsed.background ??
    readHex(colorObj, ["background", "bg"]) ??
    readHex(hints, ["background", "bg"]) ??
    readHex(preview, ["background"]) ??
    "#f8fafc";
  const text =
    parsed.text ??
    readHex(colorObj, ["text", "foreground"]) ??
    readHex(hints, ["text"]) ??
    readHex(preview, ["text"]) ??
    "#0f172a";
  const primary =
    parsed.primary ??
    readHex(hints, ["primary"]) ??
    readHex(colorObj, ["primary", "brand"]) ??
    readHex(hints, ["accent"]) ??
    readHex(colorObj, ["accent"]) ??
    readHex(preview, ["accent"]) ??
    "#2563eb";
  const secondary =
    parsed.secondary ??
    readHex(hints, ["secondary"]) ??
    readHex(colorObj, ["secondary"]) ??
    background;
  const accent =
    parsed.accent ??
    readHex(hints, ["accent"]) ??
    readHex(colorObj, ["accent"]) ??
    text;

  const reconciled = reconcileColorTokens(
    {
      primary,
      secondary,
      accent,
      background,
      text,
      label:
        typeof hints.colorStyleName === "string" && hints.colorStyleName.trim()
          ? hints.colorStyleName.trim()
          : inferStyleName(option),
    },
    { preserveLabel: option.source === "reference" || option.source === "user-added" || option.custom },
  );

  return {
    styleName: reconciled.label,
    primary: reconciled.primary,
    secondary: reconciled.secondary,
    accent: reconciled.accent,
    background: reconciled.background,
    text: reconciled.text,
    previewClass: "preview-rich-color",
  };
}

export function formatColorTokenLine(palette: ColorPaletteDisplay) {
  return `主色 ${palette.primary} · 辅色 ${palette.secondary} · 点缀 ${palette.accent}`;
}
