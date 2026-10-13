/**
 * 将 designtool 预览 HTML 转为 MasterGo page-generate 协议（Tailwind 任意值 + Flex）。
 * MasterGo 画布转译器几乎不解析 <style> 内的 grid/vw/var()，直接导入会只剩杂乱文字和图片。
 */

import { extractDesignTokens } from "./mastergo-style-tokens.mjs";

export { extractDesignTokens, compareMasterGoStyleReport } from "./mastergo-style-tokens.mjs";

const LUCIDE_TO_FA = {
  "code-2": "fa-code",
  sparkles: "fa-wand-magic-sparkles",
  map: "fa-map",
  baby: "fa-child",
  "gamepad-2": "fa-gamepad",
  terminal: "fa-terminal",
  "calendar-check": "fa-calendar-check",
  phone: "fa-phone",
  home: "fa-house",
  star: "fa-star",
  users: "fa-users",
  heart: "fa-heart",
  mail: "fa-envelope",
  send: "fa-paper-plane",
};

function wrapPageContent(inner, tokens) {
  return `<div data-name="page-content" class="flex flex-col justify-start items-center self-stretch w-[${tokens.pageWidth}px] gap-[0px]">
<div data-name="content-column" class="flex flex-col justify-start items-stretch w-[${tokens.contentWidth}px] gap-[0px]">${inner}</div>
</div>`;
}

function renderHeroTitle(h1Html, tokens) {
  let working = String(h1Html || "").replace(/<br\s*\/?>/gi, " ");
  const segments = [];
  const accentRe = /<span[^>]*class=(["'])[^"']*accent[^"']*\1[^>]*>([\s\S]*?)<\/span>/gi;
  let last = 0;
  let match;
  while ((match = accentRe.exec(working)) !== null) {
    const plain = stripTags(working.slice(last, match.index));
    if (plain) segments.push({ type: "plain", text: plain });
    segments.push({ type: "accent", text: stripTags(match[2]) });
    last = match.index + match[0].length;
  }
  const tail = stripTags(working.slice(last));
  if (tail) segments.push({ type: "plain", text: tail });
  if (!segments.length) return `<span data-name="hero-title" class="text-[40px] leading-[48px] font-[700] text-[${tokens.text}]">${stripTags(working)}</span>`;
  return segments
    .map((segment) =>
      segment.type === "accent"
        ? `<span data-name="accent" class="text-[40px] leading-[48px] font-[700] text-[${tokens.primary}]">${segment.text}</span>`
        : `<span data-name="hero-title-plain" class="text-[40px] leading-[48px] font-[700] text-[${tokens.text}]">${segment.text}</span>`,
    )
    .join("");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function slugName(value, fallback = "block") {
  const slug = stripTags(value)
    .slice(0, 24)
    .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function escapeAttr(value) {
  return String(value || "").replace(/"/g, "&quot;");
}

function firstMatch(html, pattern) {
  const match = String(html || "").match(pattern);
  if (!match) return "";
  for (let index = match.length - 1; index >= 1; index -= 1) {
    if (typeof match[index] === "string" && match[index]) return match[index];
  }
  return "";
}

function extractCardBlocks(sectionHtml, classToken) {
  const pattern = new RegExp(
    `<div[^>]*class=(["'])[^"']*${classToken}[^"']*\\1[^>]*>`,
    "gi",
  );
  const blocks = [];
  let match;
  while ((match = pattern.exec(sectionHtml)) !== null) {
    const start = match.index;
    let depth = 0;
    let cursor = start;
    while (cursor < sectionHtml.length) {
      const open = sectionHtml.indexOf("<div", cursor);
      const close = sectionHtml.indexOf("</div>", cursor);
      if (close === -1) break;
      if (open !== -1 && open < close) {
        depth += 1;
        cursor = open + 4;
        continue;
      }
      depth -= 1;
      cursor = close + 6;
      if (depth === 0) {
        blocks.push(sectionHtml.slice(start, cursor));
        break;
      }
    }
  }
  return blocks;
}

function allMatches(html, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  return [...String(html || "").matchAll(globalPattern)].map((match) => match[1] ?? match[0]);
}

function extractBodyInner(fullHtml) {
  const trimmed = String(fullHtml || "").trim();
  const bodyMatch = trimmed.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  let body = bodyMatch?.[1]?.trim() ?? trimmed;
  body = body.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  return body.trim();
}

function extractImages(html) {
  return [...String(html || "").matchAll(/<img\b([^>]*)>/gi)].map((match) => {
    const attrs = match[1] ?? "";
    const src = attrs.match(/\bsrc=(["'])(.*?)\1/i)?.[2] ?? "";
    const alt = attrs.match(/\balt=(["'])(.*?)\1/i)?.[2] ?? "image";
    return { src, alt };
  });
}

function extractLinks(html) {
  return [...String(html || "").matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => ({
    text: stripTags(match[2]),
    href: match[1]?.match(/\bhref=(["'])(.*?)\1/i)?.[2] ?? "#",
    isPrimary: /btn-primary|primary/i.test(match[1] ?? "") || /btn-primary/i.test(match[2] ?? ""),
  }));
}

function iconHtml(html, tokens, size = "16") {
  const lucide = html.match(/data-lucide=(["'])([^"']+)\1/i)?.[2];
  const fa = lucide ? LUCIDE_TO_FA[lucide] ?? "fa-circle" : "";
  if (!fa) return "";
  return `<i data-name="icon" class="fas ${fa} text-[${size}px] text-[${tokens.primary}]"></i>`;
}

function textParagraph(name, text, className) {
  const content = stripTags(text);
  if (!content) return "";
  return `<p data-name="${escapeAttr(name)}" class="${className}">${content}</p>`;
}

function buildImage(img, tokens, width, height, name = "image") {
  if (!img?.src) return "";
  return `<div data-name="${escapeAttr(name)}" class="flex flex-col justify-start items-stretch w-[${width}px] h-[${height}px] rounded-[${tokens.radius}px] overflow-hidden bg-[${tokens.border}]">
<img data-name="${escapeAttr(name)}-img" src="${escapeAttr(img.src)}" alt="${escapeAttr(img.alt)}" class="w-[${width}px] h-[${height}px]" />
</div>`;
}

function buildButton(label, tokens, variant = "primary") {
  const text = stripTags(label);
  if (!text) return "";
  if (variant === "outline") {
    return `<div data-name="cta-${slugName(text)}" class="flex flex-row justify-center items-center gap-[8px] px-[20px] py-[12px] rounded-[${tokens.radius}px] bg-[${tokens.background}] border-[1px] border-[${tokens.outlineColor}]">
<span data-name="cta-label" class="text-[14px] leading-[20px] font-[600] text-[${tokens.outlineColor}]">${text}</span>
</div>`;
  }
  if (variant === "inverse") {
    return `<div data-name="cta-${slugName(text)}" class="flex flex-row justify-center items-center gap-[8px] px-[24px] py-[12px] rounded-[${tokens.radius}px] bg-[#FFFFFF] border-[1px] border-[#FFFFFF]">
<span data-name="cta-label" class="text-[14px] leading-[20px] font-[700] text-[${tokens.primary}]">${text}</span>
</div>`;
  }
  const bg = tokens.primary;
  return `<div data-name="cta-${slugName(text)}" class="flex flex-row justify-center items-center gap-[8px] px-[20px] py-[12px] rounded-[${tokens.radius}px] bg-[${bg}] border-[1px] border-[${bg}] shadow-[${tokens.shadowCard}]">
<span data-name="cta-label" class="text-[14px] leading-[20px] font-[600] text-[#FFFFFF]">${text}</span>
</div>`;
}

function buildNavHeader(headerHtml, tokens) {
  const logoBlock =
    firstMatch(headerHtml, /<a[^>]*class=(["'])[^"']*logo[^"']*\1[^>]*>([\s\S]*?)<\/a>/i) ||
    firstMatch(headerHtml, /<div[^>]*class=(["'])[^"']*logo[^"']*\1[^>]*>([\s\S]*?)<\/div>/i) ||
    "";
  const logoText = stripTags(logoBlock) || "站点";
  const navBlock =
    firstMatch(headerHtml, /<nav[^>]*>([\s\S]*?)<\/nav>/i) ||
    firstMatch(headerHtml, /<div[^>]*class=(["'])[^"']*nav-links[^"']*\1[^>]*>([\s\S]*?)<\/div>/i) ||
    headerHtml;
  const navLinks = extractLinks(navBlock).filter((link) => link.text && !/btn/i.test(link.text));
  const navCta = extractLinks(navBlock).find((link) => /btn|试听|报名/i.test(link.text));

  const linkNodes = navLinks
    .slice(0, 5)
    .map(
      (link, index) =>
        `<span data-name="nav-${index + 1}" class="text-[14px] leading-[20px] font-[500] text-[${tokens.text}]">${link.text}</span>`,
    )
    .join("");

  const borderColor = tokens.headerBorderColor || hexWithAlpha(tokens.primary, 0.1);

  return `<div data-name="site-header" class="flex flex-row justify-between items-center self-stretch px-[${tokens.sidePadding}px] py-[16px] bg-[${tokens.headerBg}] border-b-[1px] border-[${borderColor}]">
<div data-name="brand" class="flex flex-row justify-start items-center gap-[12px]">
${iconHtml(logoBlock || headerHtml, tokens, "20")}
<span data-name="brand-title" class="text-[18px] leading-[24px] font-[700] text-[${tokens.logoColor}]">${logoText}</span>
</div>
<div data-name="nav-links" class="flex flex-row justify-end items-center gap-[24px]">${linkNodes}${navCta ? buildButton(navCta.text, tokens, navCta.isPrimary ? "primary" : "primary") : ""}</div>
</div>`;
}

function hexWithAlpha(hex, alpha) {
  const normalized = String(hex || "#000000").replace("#", "");
  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(249, 115, 22, ${alpha})`;
}

function buildHero(sectionHtml, tokens) {
  const label = stripTags(firstMatch(sectionHtml, /<span[^>]*class=(["'])[^"']*section-label[^"']*\1[^>]*>([\s\S]*?)<\/span>/i));
  const h1Raw = firstMatch(sectionHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const desc =
    firstMatch(sectionHtml, /<p[^>]*class=(["'])[^"']*sub[^"']*\1[^>]*>([\s\S]*?)<\/p>/i) ||
    firstMatch(sectionHtml, /<p[^>]*>([\s\S]*?)<\/p>/i);
  const images = extractImages(sectionHtml);
  const heroImg = images[0];
  const actions = [];
  const btnLinks = [...sectionHtml.matchAll(/<a([^>]*)>([\s\S]*?)<\/a>/gi)];
  for (const [, attrs, inner] of btnLinks) {
    if (!/btn/i.test(attrs)) continue;
    actions.push({
      text: stripTags(inner),
      variant: /btn-outline/i.test(attrs) ? "outline" : "primary",
    });
  }

  const ageTags = allMatches(sectionHtml, /<span[^>]*class=(["'])[^"']*age-tag[^"']*\1[^>]*>([\s\S]*?)<\/span>/gi)
    .map(stripTags)
    .filter(Boolean);
  const ageTagNodes = ageTags
    .map(
      (tag, index) =>
        `<span data-name="age-tag-${index + 1}" class="text-[12px] leading-[16px] font-[500] text-[${tokens.primary}] px-[12px] py-[4px] rounded-[20px] bg-[${tokens.labelBg}]">${tag}</span>`,
    )
    .join("");

  const actionNodes = actions
    .slice(0, 2)
    .map((action) => buildButton(action.text, tokens, action.variant))
    .join("");

  return `<div data-name="hero-section" class="flex flex-row justify-start items-start self-stretch gap-[32px] px-[0px] py-[48px] bg-[${tokens.background}]">
<div data-name="hero-content" class="flex flex-col justify-start items-start flex-1 gap-[16px]">
${label ? `<span data-name="hero-label" class="text-[12px] leading-[16px] font-[600] text-[${tokens.primary}] px-[12px] py-[4px] rounded-[20px] bg-[${tokens.labelBg}]">${label}</span>` : ""}
<div data-name="hero-title-row" class="flex flex-row justify-start items-start flex-wrap gap-[0px]">${renderHeroTitle(h1Raw, tokens)}</div>
${textParagraph("hero-desc", desc, `text-[16px] leading-[24px] font-[400] text-[${tokens.textBody}] w-[520px]`)}
${ageTagNodes ? `<div data-name="age-tags" class="flex flex-row justify-start items-center flex-wrap gap-[8px]">${ageTagNodes}</div>` : ""}
<div data-name="hero-actions" class="flex flex-row justify-start items-center gap-[12px]">${actionNodes}</div>
</div>
${heroImg ? buildImage(heroImg, tokens, 480, 300, "hero-image") : ""}
</div>`;
}

function buildCardGrid(sectionHtml, tokens, cardClassPattern) {
  let cards = extractCardBlocks(sectionHtml, cardClassPattern);
  if (!cards.length) {
    cards = extractCardBlocks(sectionHtml, "card");
  }
  if (!cards.length) {
    const triples = [...sectionHtml.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi)];
    return triples
      .slice(0, 6)
      .map(
        ([, title, body], index) => `<div data-name="card-${index + 1}" class="flex flex-col justify-start items-start gap-[12px] p-[20px] w-[320px] rounded-[${tokens.radius}px] bg-[${tokens.surface}] border-[1px] border-[${tokens.border}]">
<span data-name="card-${index + 1}-title" class="text-[18px] leading-[24px] font-[600] text-[${tokens.text}]">${stripTags(title)}</span>
<p data-name="card-${index + 1}-text" class="text-[14px] leading-[22px] font-[400] text-[${tokens.textBody}]">${stripTags(body)}</p>
</div>`,
      )
      .join("");
  }
  return cards
    .slice(0, 6)
    .map((card, index) => buildGenericCard(card, tokens, `card-${index + 1}`))
    .join("");
}

function buildGenericCard(cardHtml, tokens, name) {
  const title = stripTags(firstMatch(cardHtml, /<h3[^>]*>([\s\S]*?)<\/h3>/i) || firstMatch(cardHtml, /<h4[^>]*>([\s\S]*?)<\/h4>/i));
  const body = stripTags(
    allMatches(cardHtml, /<p[^>]*>([\s\S]*?)<\/p>/gi)
      .map(stripTags)
      .join(" "),
  );
  const images = extractImages(cardHtml);
  const img = images[0];

  if (img && /avatar|teacher/i.test(cardHtml)) {
    return `<div data-name="${name}" class="flex flex-row justify-start items-start gap-[16px] p-[20px] w-[360px] rounded-[${tokens.radius}px] bg-[${tokens.surface}] border-[1px] border-[${tokens.border}]">
${buildImage(img, tokens, 64, 64, `${name}-avatar`)}
<div data-name="${name}-body" class="flex flex-col justify-start items-start flex-1 gap-[8px]">
${title ? `<span data-name="${name}-title" class="text-[16px] leading-[22px] font-[600] text-[${tokens.text}]">${title}</span>` : ""}
${body ? `<p data-name="${name}-text" class="text-[14px] leading-[20px] font-[400] text-[${tokens.textBody}]">${body.slice(0, 120)}</p>` : ""}
</div>
</div>`;
  }

  if (img) {
    return `<div data-name="${name}" class="flex flex-col justify-start items-stretch w-[320px] rounded-[${tokens.radius}px] bg-[${tokens.surface}] border-[1px] border-[${tokens.border}] overflow-hidden">
${buildImage(img, tokens, 320, 180, `${name}-cover`)}
<div data-name="${name}-body" class="flex flex-col justify-start items-start gap-[8px] p-[16px]">
${title ? `<span data-name="${name}-title" class="text-[16px] leading-[22px] font-[600] text-[${tokens.text}]">${title}</span>` : ""}
${body ? `<p data-name="${name}-text" class="text-[14px] leading-[20px] font-[400] text-[${tokens.textMuted}]">${body.slice(0, 100)}</p>` : ""}
</div>
</div>`;
  }

  return `<div data-name="${name}" class="flex flex-col justify-start items-start gap-[12px] p-[20px] w-[320px] rounded-[${tokens.radius}px] bg-[${tokens.surface}] border-[1px] border-[${tokens.border}] shadow-[${tokens.shadowCard}]">
${iconHtml(cardHtml, tokens, "24")}
${title ? `<span data-name="${name}-title" class="text-[18px] leading-[24px] font-[600] text-[${tokens.text}]">${title}</span>` : ""}
${body ? `<p data-name="${name}-text" class="text-[14px] leading-[22px] font-[400] text-[${tokens.textBody}]">${body.slice(0, 160)}</p>` : ""}
</div>`;
}

function buildTimeline(sectionHtml, tokens) {
  const steps = extractCardBlocks(sectionHtml, "timeline-item");
  if (!steps.length) return buildSteps(sectionHtml, tokens);
  return steps
    .map((step, index) => {
      const marker =
        stripTags(firstMatch(step, /<div[^>]*class=(["'])[^"']*timeline-marker[^"']*\1[^>]*>([\s\S]*?)<\/div>/i)) ||
        String(index + 1);
      const title = stripTags(firstMatch(step, /<h3[^>]*>([\s\S]*?)<\/h3>/i));
      const body = stripTags(firstMatch(step, /<p[^>]*>([\s\S]*?)<\/p>/i));
      return `<div data-name="timeline-${index + 1}" class="flex flex-row justify-start items-start self-stretch gap-[16px]">
<div data-name="timeline-marker-${index + 1}" class="flex flex-row justify-center items-center w-[48px] h-[48px] rounded-[24px] bg-[${tokens.primary}]">
<span data-name="timeline-index" class="text-[18px] leading-[24px] font-[700] text-[#FFFFFF]">${marker}</span>
</div>
<div data-name="timeline-card-${index + 1}" class="flex flex-col justify-start items-start flex-1 gap-[8px] p-[20px] rounded-[${tokens.radius}px] bg-[${tokens.surface}] border-[1px] border-[${tokens.border}] shadow-[${tokens.shadowCard}]">
<span data-name="timeline-title" class="text-[18px] leading-[24px] font-[600] text-[${tokens.text}]">${title}</span>
${body ? `<p data-name="timeline-body" class="text-[14px] leading-[22px] font-[400] text-[${tokens.textBody}]">${body}</p>` : ""}
</div>
</div>`;
    })
    .join("");
}

function buildFaqGrid(sectionHtml, tokens) {
  const items = extractCardBlocks(sectionHtml, "faq-item");
  return items
    .map((item, index) => {
      const title = stripTags(firstMatch(item, /<h3[^>]*>([\s\S]*?)<\/h3>/i));
      const body = stripTags(firstMatch(item, /<p[^>]*>([\s\S]*?)<\/p>/i));
      return `<div data-name="faq-${index + 1}" class="flex flex-col justify-start items-start gap-[8px] p-[20px] w-[360px] rounded-[${tokens.radius}px] bg-[${tokens.background}] border-l-[4px] border-[${tokens.primary}]">
<span data-name="faq-title" class="text-[16px] leading-[22px] font-[600] text-[${tokens.text}]">${title}</span>
${body ? `<p data-name="faq-body" class="text-[14px] leading-[22px] font-[400] text-[${tokens.textBody}]">${body}</p>` : ""}
</div>`;
    })
    .join("");
}

function buildCtaSection(sectionHtml, tokens) {
  const title = stripTags(firstMatch(sectionHtml, /<h2[^>]*>([\s\S]*?)<\/h2>/i));
  const body = stripTags(firstMatch(sectionHtml, /<p[^>]*>([\s\S]*?)<\/p>/i));
  const cta = extractLinks(sectionHtml).find((link) => link.text) || { text: "立即报名" };
  const gradient = tokens.ctaGradient.replace(/\s/g, "_").replace(/,/g, ",");
  return `<div data-name="cta-section" class="flex flex-col justify-center items-center self-stretch gap-[16px] px-[32px] py-[40px] rounded-[24px] bg-[${gradient}]">
<span data-name="cta-title" class="text-[28px] leading-[36px] font-[700] text-[#FFFFFF]">${title}</span>
${body ? `<p data-name="cta-desc" class="text-[16px] leading-[24px] font-[400] text-[#FFFFFF] w-[640px]">${body}</p>` : ""}
${buildButton(cta.text, tokens, "inverse")}
</div>`;
}

function buildStatsRow(sectionHtml, tokens) {
  const stats = allMatches(sectionHtml, /<div[^>]*class=(["'])[^"']*stat-item[^"']*\1[^>]*>([\s\S]*?)<\/div>/gi);
  if (!stats.length) return "";
  return `<div data-name="stats-row" class="flex flex-row justify-start items-start flex-wrap gap-[24px] p-[24px] rounded-[${tokens.radius}px] bg-[${tokens.background}]">
${stats
  .map((stat, index) => {
    const number = stripTags(firstMatch(stat, /<span[^>]*class=(["'])[^"']*stat-number[^"']*\1[^>]*>([\s\S]*?)<\/span>/i));
    const label = stripTags(allMatches(stat, /<span[^>]*>([\s\S]*?)<\/span>/gi).pop() || "");
    return `<div data-name="stat-${index + 1}" class="flex flex-col justify-start items-start gap-[4px]">
<span data-name="stat-number" class="text-[32px] leading-[40px] font-[700] text-[${tokens.primary}]">${number}</span>
<span data-name="stat-label" class="text-[14px] leading-[20px] font-[400] text-[${tokens.textBody}]">${label}</span>
</div>`;
  })
  .join("")}
</div>`;
}

function buildSteps(sectionHtml, tokens) {
  const steps = extractCardBlocks(sectionHtml, "path-step");
  if (!steps.length) return "";
  return steps
    .map((step, index) => {
      const marker = stripTags(firstMatch(step, /<div[^>]*class=(["'])[^"']*step-marker[^"']*\1[^>]*>([\s\S]*?)<\/div>/i)) || String(index + 1);
      const title = stripTags(firstMatch(step, /<h3[^>]*>([\s\S]*?)<\/h3>/i));
      const body = stripTags(firstMatch(step, /<p[^>]*>([\s\S]*?)<\/p>/i));
      return `<div data-name="step-${index + 1}" class="flex flex-row justify-start items-start self-stretch gap-[16px]">
<div data-name="step-marker-${index + 1}" class="flex flex-row justify-center items-center w-[48px] h-[48px] rounded-[24px] bg-[${tokens.primary}]">
<span data-name="step-index" class="text-[18px] leading-[24px] font-[700] text-[#FFFFFF]">${marker}</span>
</div>
<div data-name="step-card-${index + 1}" class="flex flex-col justify-start items-start flex-1 gap-[8px] p-[20px] rounded-[${tokens.radius}px] bg-[${tokens.surface}] border-[1px] border-[${tokens.border}] shadow-[${tokens.shadowCard}]">
<span data-name="step-title" class="text-[18px] leading-[24px] font-[600] text-[${tokens.text}]">${title}</span>
${body ? `<p data-name="step-body" class="text-[14px] leading-[22px] font-[400] text-[${tokens.textBody}]">${body}</p>` : ""}
</div>
</div>`;
    })
    .join("");
}

function extractSections(body) {
  return [...String(body || "").matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)].map((match) => ({
    attrs: match[1] ?? "",
    inner: match[2] ?? "",
    className: match[1]?.match(/\bclass=(["'])([^"']+)\1/i)?.[2] ?? "",
    id: match[1]?.match(/\bid=(["'])([^"']+)\1/i)?.[2] ?? "",
  }));
}

function buildSection(section, tokens, index) {
  const sectionHtml = section.inner;
  const sectionClass = section.className;
  const label = stripTags(firstMatch(sectionHtml, /<span[^>]*class=(["'])[^"']*section-label[^"']*\1[^>]*>([\s\S]*?)<\/span>/i));
  const h2 = stripTags(firstMatch(sectionHtml, /<h2[^>]*>([\s\S]*?)<\/h2>/i));
  const intro = stripTags(
    firstMatch(sectionHtml, /<p[^>]*class=(["'])[^"']*sub[^"']*\1[^>]*>([\s\S]*?)<\/p>/i) ||
      firstMatch(sectionHtml, /<p[^>]*>([\s\S]*?)<\/p>/i) ||
      firstMatch(sectionHtml, /<p[^>]*style=[^>]*>([\s\S]*?)<\/p>/i),
  );

  if (/\bhero\b/i.test(sectionClass) || (section.id === "courses" && /<h1/i.test(sectionHtml)) || (index === 0 && /<h1/i.test(sectionHtml))) {
    return buildHero(sectionHtml, tokens);
  }

  if (/\bcta-section\b/i.test(sectionClass)) {
    return buildCtaSection(sectionHtml, tokens);
  }

  if (/contact-band|contact/i.test(sectionHtml) && /<h2/i.test(sectionHtml)) {
    const title = stripTags(firstMatch(sectionHtml, /<h2[^>]*>([\s\S]*?)<\/h2>/i));
    const body = stripTags(firstMatch(sectionHtml, /<p[^>]*>([\s\S]*?)<\/p>/i));
    const actions = extractLinks(sectionHtml);
    return `<div data-name="cta-band" class="flex flex-row justify-between items-center self-stretch gap-[24px] px-[32px] py-[32px] rounded-[${tokens.radius}px] bg-[${tokens.surface}] border-[1px] border-[${tokens.border}]">
<div data-name="cta-copy" class="flex flex-col justify-start items-start gap-[8px] flex-1">
<span data-name="cta-title" class="text-[28px] leading-[36px] font-[700] text-[${tokens.text}]">${title}</span>
${body ? `<p data-name="cta-desc" class="text-[14px] leading-[22px] font-[400] text-[${tokens.textBody}]">${body}</p>` : ""}
</div>
<div data-name="cta-actions" class="flex flex-row justify-end items-center gap-[12px]">${actions.map((a) => buildButton(a.text, tokens, /outline/i.test(a.href) ? "outline" : "primary")).join("")}</div>
</div>`;
  }

  let bodyContent = "";
  if (/timeline-item|timeline\b/i.test(sectionHtml)) {
    bodyContent = `<div data-name="section-timeline" class="flex flex-col justify-start items-stretch self-stretch gap-[16px]">${buildTimeline(sectionHtml, tokens)}</div>${buildStatsRow(sectionHtml, tokens)}`;
  } else if (/faq-item|faq-grid/i.test(sectionHtml)) {
    bodyContent = `<div data-name="section-faq" class="flex flex-row justify-start items-start flex-wrap gap-[16px] self-stretch">${buildFaqGrid(sectionHtml, tokens)}</div>`;
  } else if (/path-step|path-steps/i.test(sectionHtml)) {
    bodyContent = `<div data-name="section-steps" class="flex flex-col justify-start items-stretch self-stretch gap-[16px]">${buildSteps(sectionHtml, tokens)}</div>`;
  } else {
    const gridPattern = /age-card/i.test(sectionHtml)
      ? "age-card"
      : /teacher-card/i.test(sectionHtml)
        ? "teacher-card"
        : /work-card/i.test(sectionHtml)
          ? "work-card"
          : "card";
    bodyContent = `<div data-name="section-grid" class="flex flex-row justify-start items-start flex-wrap gap-[16px] self-stretch">${buildCardGrid(sectionHtml, tokens, gridPattern)}</div>`;
  }

  return `<div data-name="section-${index + 1}" class="flex flex-col justify-start items-start self-stretch gap-[20px] py-[40px] bg-[${tokens.background}]">
${label ? `<span data-name="section-label" class="text-[12px] leading-[16px] font-[600] text-[${tokens.primary}] px-[12px] py-[4px] rounded-[20px] bg-[${tokens.labelBg}]">${label}</span>` : ""}
${h2 ? `<span data-name="section-title" class="text-[28px] leading-[36px] font-[700] text-[${tokens.text}]">${h2}</span>` : ""}
${intro ? `<p data-name="section-intro" class="text-[16px] leading-[24px] font-[400] text-[${tokens.textBody}] w-[720px]">${intro}</p>` : ""}
${bodyContent}
</div>`;
}

function buildFooter(footerHtml, tokens) {
  const brand = stripTags(firstMatch(footerHtml, /<h4[^>]*>([\s\S]*?)<\/h4>/i)) || "站点";
  const desc = stripTags(firstMatch(footerHtml, /<p[^>]*>([\s\S]*?)<\/p>/i));
  const links = allMatches(footerHtml, /<a\b[^>]*>([\s\S]*?)<\/a>/gi).map(stripTags).filter(Boolean).slice(0, 4);
  const linkNodes = links
    .map(
      (link, index) =>
        `<span data-name="footer-link-${index + 1}" class="text-[14px] leading-[20px] font-[400] text-[${tokens.textBody}]">${link}</span>`,
    )
    .join("");

  return `<div data-name="site-footer" class="flex flex-col justify-start items-stretch self-stretch gap-[24px] px-[${tokens.sidePadding}px] py-[32px] bg-[${tokens.surface}] border-t-[1px] border-[${tokens.border}]">
<div data-name="footer-top" class="flex flex-row justify-between items-start self-stretch gap-[32px]">
<div data-name="footer-brand" class="flex flex-col justify-start items-start gap-[8px] w-[360px]">
<span data-name="footer-title" class="text-[16px] leading-[22px] font-[600] text-[${tokens.text}]">${brand}</span>
${desc ? `<p data-name="footer-desc" class="text-[14px] leading-[22px] font-[400] text-[${tokens.textBody}]">${desc.slice(0, 120)}</p>` : ""}
</div>
<div data-name="footer-links" class="flex flex-col justify-start items-start gap-[8px]">${linkNodes}</div>
</div>
<span data-name="footer-copy" class="text-[12px] leading-[16px] font-[400] text-[${tokens.textMuted}]">© ${brand}</span>
</div>`;
}

/**
 * 将完整预览 HTML 转为 MasterGo 协议片段（无 <style>，全 Tailwind 类）。
 */
export function convertHtmlToMasterGoProtocol(fullHtml) {
  const tokens = extractDesignTokens(fullHtml);
  const body = extractBodyInner(fullHtml);
  if (!body) return "";

  const header = firstMatch(body, /<header\b[^>]*>([\s\S]*?)<\/header>/i);
  const footer = firstMatch(body, /<footer\b[^>]*>([\s\S]*?)<\/footer>/i);
  const sections = extractSections(body);

  const pageBody = sections.map((section, index) => buildSection(section, tokens, index)).join("\n");

  const parts = [
    `<main data-name="page-root" class="flex flex-col justify-start items-stretch w-[${tokens.pageWidth}px] min-h-[1024px] bg-[${tokens.background}]">`,
    header ? buildNavHeader(header, tokens) : "",
    wrapPageContent(pageBody, tokens),
    footer ? buildFooter(footer, tokens) : "",
    `</main>`,
  ].filter(Boolean);

  return parts.join("\n");
}
