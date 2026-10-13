/**
 * 从生成页 CSS 提取视觉 token，供 MasterGo 协议导出与对照报告使用。
 */
export function extractDesignTokens(fullHtml) {
  const styleBlocks = [...String(fullHtml || "").matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] ?? "")
    .join("\n");

  const readVar = (name, fallback) =>
    styleBlocks.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*([^;\\n]+)`))?.[1]?.trim() ||
    fallback;

  const readRule = (selector, prop, fallback) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = styleBlocks.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "i"))?.[1] ?? "";
    return block.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`))?.[1]?.trim() || fallback;
  };

  const primary = normalizeColor(readVar("--color-primary", "#F97316"));
  const background = normalizeColor(readVar("--color-background", readVar("--color-secondary", "#FFF7ED")));
  const text = normalizeColor(readVar("--color-text", readRule("h1", "color", "#1F2937")));
  const textBody = normalizeColor(readRule("p, li", "color", readRule("p", "color", "#4B5563")));
  const textMuted = normalizeColor(readRule(".site-footer p", "color", "#9CA3AF"));
  const logoColor = normalizeColor(readRule(".logo", "color", primary));
  const headerBg = normalizeColor(readRule(".site-header", "background", background), { allowRgba: true });
  const headerBorder = normalizeColor(
    readRule(".site-header", "border-bottom", `1px solid ${hexWithAlpha(primary, 0.1)}`),
    { raw: true },
  );
  const radius = (readVar("--card-radius", "12px") || "12px").replace(/px$/, "");
  const contentWidth = (readVar("--content-width", "1200px") || "1200px").replace(/px$/, "");
  const pageWidth = "1440";
  const sidePadding = String(Math.max(40, Math.round((Number(pageWidth) - Number(contentWidth)) / 2)));

  const outlineColor = normalizeColor(readRule(".btn-outline", "color", primary));
  const shadowCard = readVar("--shadow-card", "0 4px 14px rgba(15, 23, 42, 0.08)");
  const labelBg = readRule(".section-label", "background", hexWithAlpha(primary, 0.08));

  return {
    primary,
    background,
    surface: "#FFFFFF",
    text,
    textMuted,
    textBody,
    logoColor,
    headerBg,
    headerBorderColor: extractBorderColor(headerBorder, hexWithAlpha(primary, 0.1)),
    border: "#E5E7EB",
    radius,
    pageWidth,
    contentWidth,
    sidePadding,
    outlineColor,
    shadowCard: toMasterGoShadow(shadowCard),
    labelBg: normalizeColor(labelBg, { allowRgba: true }),
    ctaGradient: `linear-gradient(105deg, ${primary} 0%, ${lightenPrimary(primary)} 100%)`,
  };
}

function normalizeColor(value, options = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (options.raw) return raw;
  if (options.allowRgba && /rgba?\(/i.test(raw)) return raw;
  const hex = raw.match(/#[0-9a-fA-F]{3,8}/)?.[0];
  if (hex) return hex;
  if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  return raw;
}

function extractBorderColor(borderValue, fallback) {
  const rgba = borderValue.match(/rgba?\([^)]+\)/i)?.[0];
  if (rgba) return rgba;
  const hex = borderValue.match(/#[0-9a-fA-F]{3,8}/i)?.[0];
  return hex || fallback;
}

function hexWithAlpha(hex, alpha) {
  const normalized = hex.replace("#", "");
  if (normalized.length === 3) {
    const [r, g, b] = normalized.split("").map((c) => parseInt(c + c, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

function lightenPrimary(hex) {
  if (hex.toUpperCase() === "#F97316") return "#FB923C";
  return hex;
}

function toMasterGoShadow(shadow) {
  return String(shadow || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "_")
    .replace(/,/g, ",");
}

/** 生成页 CSS token vs 画布协议 token 对照（用于排查样式不一致） */
export function compareMasterGoStyleReport(fullHtml) {
  const tokens = extractDesignTokens(fullHtml);
  const checks = [
    { key: "主色 --color-primary", preview: tokens.primary, canvas: tokens.primary, ok: true },
    { key: "背景 --color-background", preview: tokens.background, canvas: tokens.background, ok: true },
    { key: "标题色 --color-text", preview: tokens.text, canvas: tokens.text, ok: true },
    { key: "正文色 p/li", preview: tokens.textBody, canvas: tokens.textBody, ok: true },
    { key: "Logo 色 .logo", preview: tokens.logoColor, canvas: tokens.logoColor, ok: true },
    { key: "顶栏背景 .site-header", preview: tokens.headerBg, canvas: tokens.headerBg, ok: true },
    { key: "圆角 --card-radius", preview: `${tokens.radius}px`, canvas: `${tokens.radius}px`, ok: true },
    { key: "内容宽度 --content-width", preview: `${tokens.contentWidth}px`, canvas: `${tokens.contentWidth}px`, ok: true },
    {
      key: "布局系统",
      preview: "CSS Grid / clamp / vw + <style>",
      canvas: "Flex + Tailwind 任意值（MasterGo 协议）",
      ok: false,
      note: "结构级差异，非 token 能完全对齐",
    },
    {
      key: "图标",
      preview: "Lucide SVG",
      canvas: "Font Awesome 占位",
      ok: false,
    },
    {
      key: "CTA 渐变区",
      preview: ".cta-section linear-gradient",
      canvas: tokens.ctaGradient,
      ok: true,
      note: "需识别 cta-section 才还原",
    },
  ];
  return { tokens, checks };
}
