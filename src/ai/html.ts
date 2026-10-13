import { buildUniversalLayoutBalanceStyleBlock } from "../generationLayoutBalance";

export function extractStreamingHtmlPreview(accumulated: string): string | null {
  let html = accumulated.trim();
  if (!html) return null;

  if (html.startsWith("```")) {
    const match = html.match(/```(?:html)?\s*([\s\S]*)$/i);
    if (!match?.[1]) return null;
    html = match[1].trim();
  }

  if (!/<!doctype\s+html|<html[\s>]/i.test(html)) return null;
  return html;
}

function sliceHtmlDocument(content: string): string {
  const doctypeIndex = content.search(/<!doctype\s+html/i);
  const htmlIndex = content.search(/<html[\s>]/i);
  const start = doctypeIndex >= 0 ? doctypeIndex : htmlIndex;
  if (start < 0) return content.trim();
  return content.slice(start).trim();
}

const GENERATION_LAYOUT_GUARDRAILS = `<style data-designtool-guardrails>
html,body{margin:0;min-height:100%;width:100%}
body{min-height:100vh}
main,header,footer,section{min-width:0}
</style>`;

const GENERATION_POLISH_STYLES = `<style data-designtool-polish>
*,*::before,*::after{box-sizing:border-box;writing-mode:horizontal-tb!important;text-orientation:mixed!important}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
img,picture,video,canvas,svg{display:block;max-width:100%}
img{height:auto}
h1,h2,h3,h4{line-height:1.2;text-wrap:balance;margin:0 0 .55em}
p,li,figcaption,label,button,a{overflow-wrap:break-word}
p,li,figcaption{margin:0 0 .85em}
a{color:inherit;text-decoration-thickness:1px;text-underline-offset:.18em}
.dt-avatar-image,.avatar img,.author img,.team img,.portrait img{width:56px;height:56px;max-width:56px;max-height:56px;border-radius:999px;object-fit:cover}
.btn,.button,.cta,button[type=submit],a.button,a.cta,a.btn{max-width:100%}
.dt-stock-image{max-width:100%;overflow:hidden}
.dt-stock-image>img{width:100%;max-width:100%;object-fit:cover}
.dt-icon,[data-lucide],.dt-icon svg{width:18px;height:18px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
body.dt-has-sidebar .hero-media,body.dt-has-sidebar .hero-image,body.dt-has-sidebar .banner-image,body.dt-has-sidebar .hero>img,body.dt-has-sidebar .hero-section>img{display:none!important}
</style>`;

const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/u;
const EMOJI_ONLY_PATTERN = /^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]+$/u;

const STOCK_IMAGE_SETS = {
  hero: [
    "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=1600&q=80",
  ],
  showcase: [
    "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80",
  ],
  product: [
    "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1200&q=80",
  ],
  team: [
    "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=800&q=80",
  ],
  ambient: [
    "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1542744173-8e7e5c23a2c8?auto=format&fit=crop&w=1200&q=80",
  ],
} as const;

type StockImageTopic = keyof typeof STOCK_IMAGE_SETS;

function hashText(text: string) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

const EMOJI_TO_LUCIDE = new Map<string, string>([
  ["\u{1F3E0}", "home"],
  ["\u{26A1}", "zap"],
  ["\u{1F4D6}", "book-open"],
  ["\u{1F4DA}", "book"],
  ["\u{1F465}", "users"],
  ["\u{1F504}", "refresh-cw"],
  ["\u{2699}", "settings"],
  ["\u{1F50D}", "search"],
  ["\u{1F4CA}", "bar-chart-3"],
  ["\u{1F4CB}", "clipboard-list"],
  ["\u{2705}", "check-circle"],
  ["\u{2764}", "heart"],
  ["\u{2B50}", "star"],
  ["\u{1F514}", "bell"],
  ["\u{1F464}", "user"],
  ["\u{1F6D2}", "shopping-cart"],
  ["\u{1F4BC}", "briefcase"],
  ["\u{1F4C1}", "folder"],
  ["\u{1F4C4}", "file-text"],
  ["\u{1F3AF}", "target"],
  ["\u{1F4A1}", "lightbulb"],
  ["\u{1F517}", "link"],
  ["\u{1F4DE}", "phone"],
  ["\u{2709}", "mail"],
  ["\u{1F310}", "globe"],
  ["\u{1F512}", "lock"],
  ["\u{1F4E6}", "package"],
  ["\u{1F5C3}", "layers"],
]);

function stripVerticalWritingMode(doc: Document) {
  doc.querySelectorAll("[style]").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const style = node.getAttribute("style") ?? "";
    if (!/writing-mode|text-orientation|vertical-rl|vertical-lr/i.test(style)) return;
    node.style.writingMode = "horizontal-tb";
    node.style.textOrientation = "mixed";
  });

  doc.querySelectorAll("style").forEach((node) => {
    if (node.hasAttribute("data-designtool-polish") || node.hasAttribute("data-designtool-guardrails") || node.hasAttribute("data-designtool-binding")) {
      return;
    }
    const css = node.textContent ?? "";
    if (!/writing-mode|vertical-rl|vertical-lr|text-orientation:\s*upright/i.test(css)) return;
    node.textContent = css
      .replace(/writing-mode\s*:\s*vertical-[^;}"']+;?/gi, "writing-mode:horizontal-tb;")
      .replace(/text-orientation\s*:\s*(?:upright|sideways)[^;}"']*;?/gi, "text-orientation:mixed;");
  });
}

function normalizeTestimonialImages(doc: Document) {
  doc.querySelectorAll(".testimonial img, .review-card img, .quote-card img, [class*='testimonial'] img, blockquote img").forEach((node) => {
    if (!(node instanceof HTMLImageElement)) return;
    node.classList.add("dt-avatar-image");
    node.style.width = "56px";
    node.style.height = "56px";
    node.style.maxWidth = "56px";
    node.style.maxHeight = "56px";
    node.style.objectFit = "cover";
    node.style.borderRadius = "999px";
  });
}

function markDashboardLayout(doc: Document) {
  const body = doc.body;
  if (!body || body.classList.contains("dt-has-sidebar")) return;
  const hasRootNavigation = Array.from(body.children).some((child) => child.matches("aside.sidebar, nav.sidebar"));
  const hasRootMain = Array.from(body.children).some((child) => child.matches("main"));
  if (hasRootNavigation && hasRootMain) {
    doc.body?.classList.add("dt-has-sidebar");
  }
}

function replaceEmojiIcons(doc: Document) {
  const scopes = doc.querySelectorAll(
    "nav a, nav button, nav li, aside a, aside button, aside li, .sidebar a, .sidebar button, .sidebar li, [class*='menu'] a, [class*='nav-item']",
  );
  scopes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const text = node.textContent?.trim() ?? "";
    if (!text || !containsEmoji(text)) return;
    const leadingEmoji = [...text].find((char) => EMOJI_TO_LUCIDE.has(char));
    if (!leadingEmoji) return;
    const lucide = EMOJI_TO_LUCIDE.get(leadingEmoji);
    if (!lucide) return;
    const label = text.replace(EMOJI_PATTERN, "").replace(/\s+/g, " ").trim();
    if (!label) return;
    node.replaceChildren();
    const icon = doc.createElement("i");
    icon.setAttribute("data-lucide", lucide);
    icon.className = "dt-icon";
    icon.setAttribute("aria-hidden", "true");
    const span = doc.createElement("span");
    span.textContent = label;
    node.append(icon, span);
    node.style.display = "inline-flex";
    node.style.alignItems = "center";
    node.style.gap = "8px";
    node.style.writingMode = "horizontal-tb";
  });
}

function ensureLucideIcons(doc: Document) {
  if (!doc.querySelector("[data-lucide]")) return;
  if (doc.querySelector("script[data-designtool-lucide]")) return;
  const script = doc.createElement("script");
  script.src = "https://unpkg.com/lucide@latest/dist/umd/lucide.min.js";
  script.defer = true;
  script.setAttribute("data-designtool-lucide", "1");
  const boot = doc.createElement("script");
  boot.textContent =
    'function __dtLucide(){if(window.lucide&&lucide.createIcons)lucide.createIcons();}document.addEventListener("DOMContentLoaded",__dtLucide);__dtLucide();';
  doc.body?.append(script, boot);
}

function containsEmoji(text: string) {
  return EMOJI_PATTERN.test(text);
}

function isEmojiOnly(text: string) {
  return EMOJI_ONLY_PATTERN.test(text.trim());
}

function isPlaceholderImageSrc(src: string) {
  const value = src.trim().toLowerCase();
  if (!value || value === "#" || value === "about:blank") return true;
  if (/placeholder|via\.placeholder|placehold|dummyimage|picsum\.photos\/\d+\/\d+$/.test(value)) return true;
  if (containsEmoji(src)) return true;
  return false;
}

function inferImageTopic(context: string): StockImageTopic {
  const text = context.toLowerCase();
  if (/avatar|team|people|portrait|teacher|parent/.test(text)) return "team";
  if (/app|product|demo|dashboard|saas|screen|interface/.test(text)) return "product";
  if (/hero|banner|cover|headline/.test(text)) return "hero";
  if (/gallery|portfolio|showcase|work|case/.test(text)) return "showcase";
  return "ambient";
}

function pickStockImageUrl(context: string, index = 0) {
  const topic = inferImageTopic(context);
  const pool = STOCK_IMAGE_SETS[topic];
  const pick = pool[(hashText(context) + index) % pool.length];
  return pick;
}

function collectContextText(element: Element) {
  const chunks = [
    element.getAttribute("alt") ?? "",
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("title") ?? "",
    element.className,
    element.id,
  ];
  let parent: Element | null = element;
  for (let depth = 0; depth < 4 && parent; depth += 1) {
    const heading = parent.querySelector("h1,h2,h3,h4");
    if (heading?.textContent) chunks.push(heading.textContent);
    parent = parent.parentElement;
  }
  return chunks.join(" ").trim();
}

function ensureMetaViewport(doc: Document) {
  const head = doc.head;
  if (!head) return;
  const hasViewport = Array.from(head.querySelectorAll("meta[name='viewport']")).length > 0;
  if (!hasViewport) {
    const meta = doc.createElement("meta");
    meta.setAttribute("name", "viewport");
    meta.setAttribute("content", "width=device-width, initial-scale=1");
    head.prepend(meta);
  }
}

function ensureStyleInjected(doc: Document, attr: string, markup: string) {
  const head = doc.head;
  if (!head) return;
  const template = doc.createElement("template");
  template.innerHTML = markup;
  template.content.querySelectorAll("style").forEach((style) => {
    const marker = style.getAttributeNames().find((name) => name.startsWith("data-designtool-")) ?? attr;
    if (doc.querySelector(`style[${marker}]`)) return;
    head.appendChild(style);
  });
}

function createStockImage(doc: Document, context: string, index: number, className = "dt-stock-image") {
  const img = doc.createElement("img");
  img.src = pickStockImageUrl(context, index);
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.className = className;
  return img;
}

function replaceEmojiPlaceholderElement(doc: Document, element: HTMLElement, context: string, index: number) {
  const text = element.textContent?.trim() ?? "";
  const classHint = `${element.className} ${element.id}`;
  const isMediaLike =
    /hero|banner|cover|media|visual|image|thumb|gallery|avatar|photo|picture|card-image|feature-image/i.test(classHint) ||
    element.tagName === "FIGURE";
  if (!isEmojiOnly(text) && !containsEmoji(text) && !isMediaLike) return false;

  const topic = collectContextText(element) || context || text;
  const img = createStockImage(
    doc,
    topic,
    index,
    /avatar|portrait|team|member/i.test(classHint) ? "dt-avatar-image" : "dt-stock-image",
  );
  element.replaceChildren(img);
  element.classList.add(/avatar|portrait|team|member/i.test(classHint) ? "dt-avatar-image" : "dt-stock-image");
  return true;
}

function polishGeneratedDocument(doc: Document) {
  ensureMetaViewport(doc);
  markDashboardLayout(doc);
  stripVerticalWritingMode(doc);
  normalizeTestimonialImages(doc);

  let imageIndex = 0;
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    const alt = img.getAttribute("alt") ?? "";
    if (!isPlaceholderImageSrc(src) && !containsEmoji(alt)) return;
    const context = collectContextText(img) || alt;
    img.setAttribute("src", pickStockImageUrl(context, imageIndex));
    if (containsEmoji(alt)) img.setAttribute("alt", "");
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    imageIndex += 1;
  });

  doc.querySelectorAll("div,span,figure,section,article").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.querySelector("img")) return;
    const text = node.textContent?.trim() ?? "";
    if (!text) return;
    if (!isEmojiOnly(text) && !containsEmoji(text)) return;
    const childCount = Array.from(node.childNodes).filter((child) => {
      if (child.nodeType === Node.TEXT_NODE) return Boolean(child.textContent?.trim());
      return child.nodeType === Node.ELEMENT_NODE;
    }).length;
    if (childCount > 1) return;
    if (replaceEmojiPlaceholderElement(doc, node, collectContextText(node), imageIndex)) {
      imageIndex += 1;
    }
  });

  doc.querySelectorAll("[style]").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const style = node.getAttribute("style") ?? "";
    if (!containsEmoji(style)) return;
    node.setAttribute("style", style.replace(EMOJI_PATTERN, ""));
    if (isEmojiOnly(node.textContent ?? "")) {
      replaceEmojiPlaceholderElement(doc, node, collectContextText(node), imageIndex);
      imageIndex += 1;
    }
  });

  replaceEmojiIcons(doc);
  ensureLucideIcons(doc);
}

export function polishGeneratedHtml(html: string, options?: { enforcedStyles?: string }): string {
  if (typeof DOMParser === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  if (!doc.documentElement) return html;
  ensureStyleInjected(doc, "data-designtool-guardrails", GENERATION_LAYOUT_GUARDRAILS);
  ensureStyleInjected(doc, "data-designtool-polish", GENERATION_POLISH_STYLES);
  ensureStyleInjected(doc, "data-designtool-layout-balance", buildUniversalLayoutBalanceStyleBlock());
  if (options?.enforcedStyles?.trim()) {
    ensureStyleInjected(doc, "data-designtool-binding", options.enforcedStyles);
  }
  polishGeneratedDocument(doc);
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export function finalizeGeneratedHtml(content: string, options?: { enforcedStyles?: string }): string {
  let html = content.trim();
  const fenced = html.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) html = fenced[1].trim();
  html = sliceHtmlDocument(html);
  if (!html.toLowerCase().includes("<!doctype") && !html.toLowerCase().includes("<html")) {
    throw new Error("AI did not return valid HTML");
  }
  if (!html.includes("data-designtool-guardrails") && /<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${GENERATION_LAYOUT_GUARDRAILS}`);
  }
  return polishGeneratedHtml(html, options);
}
