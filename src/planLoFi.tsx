import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { InfoPlan } from "./types";
import {
  derivePlanModuleSlots,
  isComplexPlanTemplate,
  resolvePlanPageLayout,
  resolvePlanShell,
  resolvePlanTemplate,
  describePlanShell,
} from "./pageLayoutArchitecture";
import { getPlanContentModules } from "./infoArchitecture";

export type WireframeBlockShape =
  | "hero-media"
  | "hero-split"
  | "hero-proof"
  | "hero-product"
  | "grid-2"
  | "grid-3"
  | "grid-4"
  | "steps"
  | "proof-strip"
  | "content-band"
  | "cta-band"
  | "tool-panel";

type WireframeBlock = {
  key: string;
  shape: WireframeBlockShape;
  label?: string;
};

type WireframeLayout = {
  template: string;
  shell: "landing" | "sidebar" | "bento" | "split";
  complex: boolean;
  hero: WireframeBlock | null;
  body: WireframeBlock[];
};

const PLACEHOLDER_TEMPLATES = ["gallery", "trust", "hub"] as const;

const DEFAULT_SLOT_COUNT = 6;

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function formatPlanArchitecture(text: string, max = 60) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function formatPlanSummary(text: string, max = 40) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

const NOTE_EN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/gallery-first/gi, "作品先行"],
  [/proof-first/gi, "信任前置"],
  [/demo-first/gi, "演示先行"],
  [/conversion-first/gi, "转化优先"],
  [/editorial-first/gi, "叙事优先"],
  [/workbench/gi, "工具台"],
  [/\bB2B\b/gi, "企业客户"],
  [/\bB2C\b/gi, "个人用户"],
  [/\bCTA\b/gi, "行动入口"],
  [/\bFAQ\b/gi, "常见问题"],
  [/\boffer\b/gi, "核心价值"],
  [/快速转化/gi, "推动行动"],
  [/清晰转化/gi, "讲清再行动"],
  [/\babove-fold\b/gi, "首屏"],
  [/low-fi/gi, "低保真"],
  [/media-dominant/gi, "大图主导"],
];

export function sanitizeChineseNote(text: string) {
  let result = text.trim();
  for (const [pattern, replacement] of NOTE_EN_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  result = result
    .replace(/作品主导的\s*[^：:]*低保真[：:]\s*/u, "")
    .replace(/信任前置的\s*[^：:]*低保真[：:]\s*/u, "")
    .replace(/[^：:]*first\s*低保真[：:]\s*/gi, "")
    .replace(/\b[a-z][a-z0-9-]{1,}\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/→/g, " → ")
    .replace(/\s*→\s*/g, " → ")
    .trim();
  return result;
}

function isAbstractPlanTitle(title: string) {
  if (!title) return true;
  if (/[a-z]{2,}/i.test(title)) return true;
  if (/转化型|offer|cta|growth|landing/i.test(title)) return true;
  if (/^(清晰|快速|强|高|主打).{0,10}(转化|成交|获客)/u.test(title)) return true;
  if (/[，,]/.test(title) && !/先|再|适合|用户|让|帮/.test(title)) return true;
  return false;
}

function titleFromStructure(plan: InfoPlan) {
  const haystack = plan.structure.join(" ");
  if (/收益|行动|报名|咨询|预约|faq/i.test(haystack)) return "先讲清核心价值，再推动行动";
  if (/作品|案例|代表|portfolio/i.test(haystack)) return "先看作品，再了解服务";
  if (/资质|证明|信任|可靠|背书/.test(haystack)) return "先证明可靠，再讲服务";
  if (/产品|界面|demo|演示|截图/.test(haystack)) return "先看产品怎么用";
  if (/活动|报名|课程/.test(haystack)) return "先讲清活动，再引导报名";
  if (/价格|套餐|权益/.test(haystack)) return "先讲清价格，再帮用户选择";
  if (/观点|文章|叙事/.test(haystack)) return "先建立观点，再展开内容";
  return "";
}

/** 方案标题：具体中文编排策略，不要口号 */
export function formatPlanTitle(plan: InfoPlan): string {
  const cleaned = sanitizeChineseNote(plan.title || "");
  if (cleaned && !isAbstractPlanTitle(cleaned)) {
    return cleaned.length <= 22 ? cleaned : `${cleaned.slice(0, 21)}…`;
  }
  const fromStructure = titleFromStructure(plan);
  if (fromStructure) return fromStructure;
  const reason = sanitizeChineseNote(plan.reason || "");
  if (reason.startsWith("适合")) {
    const short = reason.slice(0, 22);
    return short.length < reason.length ? `${short}…` : short;
  }
  return cleaned || "信息组织方案";
}

/** 卡片底部：一句推荐理由（为什么选这套信息组织） */
export function buildPlanCardNote(plan: InfoPlan): string | null {
  const shellHint = isWireframePlan(plan) ? `${describePlanShell(plan)}布局` : "";
  const reason = plan.reason?.trim();
  if (reason) {
    const cleaned = sanitizeChineseNote(reason);
    if (cleaned) {
      const note = formatPlanSummary(cleaned, shellHint ? 48 : 56);
      return shellHint ? `${shellHint} · ${note}` : note;
    }
  }

  const summary = plan.summary?.trim();
  if (summary && !summary.includes("→")) {
    const cleaned = sanitizeChineseNote(summary);
    if (cleaned) {
      const note = formatPlanSummary(cleaned, shellHint ? 48 : 56);
      return shellHint ? `${shellHint} · ${note}` : note;
    }
  }

  return shellHint || null;
}

export function isWireframePlan(plan: InfoPlan) {
  if (plan.isPlaceholder) return false;
  if (plan.isCustom || plan.source === "user-added") return false;
  return Boolean(plan.pageArchitecture || plan.sections?.length || plan.previewWireframe || plan.structure.length);
}

export const resolveTemplate = resolvePlanTemplate;

function heroShapeForTemplate(template: string): WireframeBlockShape {
  if (template === "gallery" || template === "event") return "hero-media";
  if (template === "product") return "hero-product";
  if (template === "trust" || template === "compare" || template === "pricing") return "hero-proof";
  if (template === "tool") return "tool-panel";
  return "hero-split";
}

export function moduleLayoutFingerprint(plan?: InfoPlan) {
  if (!plan) return "";
  return derivePlanModuleSlots(plan)
    .map((slot) => slot.id)
    .join("|");
}

function readSectionRecord(plan: InfoPlan | undefined, index: number): Record<string, unknown> {
  const sections = plan?.sections;
  if (!Array.isArray(sections) || !sections[index]) return {};
  const section = sections[index];
  return section && typeof section === "object" ? (section as Record<string, unknown>) : {};
}

function readSectionLayout(plan: InfoPlan | undefined, index: number) {
  return readText(readSectionRecord(plan, index).layout);
}

function shapeFromPreviewHero(preview: Record<string, unknown>): WireframeBlockShape | null {
  const hero = readText(preview.hero).toLowerCase();
  if (!hero) return null;
  if (/media|gallery|image|showcase|portfolio|large/.test(hero)) return "hero-media";
  if (/product-demo|interactive|demo|screen|interface/.test(hero)) return "hero-product";
  if (/proof|trust|claim|credential/.test(hero)) return "hero-proof";
  if (/tool|workbench|panel/.test(hero)) return "tool-panel";
  if (/split|copy|text|structured/.test(hero)) return "hero-split";
  return null;
}

function shapeFromSectionLayout(layout: string): WireframeBlockShape | null {
  const text = layout.toLowerCase();
  if (!text) return null;
  if (/gallery|grid|masonry|carousel|showcase|filterable|matrix|package|pricing/.test(text)) {
    return /2|two|dual|compare|matrix/.test(text) ? "grid-2" : /4|quad/.test(text) ? "grid-4" : "grid-3";
  }
  if (/step|process|timeline|numbered|flow/.test(text)) return "steps";
  if (/proof|testimonial|logo|credential|faq|review|trust|case/.test(text)) return "proof-strip";
  if (/cta|action|contact|consult|band|footer/.test(text)) return "cta-band";
  if (/tool|panel|workbench|demo|screen|operation/.test(text)) return "tool-panel";
  if (/hero|large-media|split|fold|above/.test(text)) return "hero-media";
  if (/article|editorial|longform|chapter/.test(text)) return "content-band";
  return null;
}

function shapeFromComponentPatterns(plan: InfoPlan | undefined): WireframeBlockShape | null {
  const patterns = plan?.componentPatterns;
  if (!patterns || typeof patterns !== "object") return null;
  const hero = readText((patterns as Record<string, unknown>).hero).toLowerCase();
  if (/media|gallery|showcase|portfolio/.test(hero)) return "hero-media";
  if (/proof|claim/.test(hero)) return "hero-proof";
  if (/product|demo|screen/.test(hero)) return "hero-product";
  if (/split|copy/.test(hero)) return "hero-split";
  return null;
}

function resolveBlockShape(
  plan: InfoPlan | undefined,
  label: string,
  index: number,
  total: number,
  template: string,
): WireframeBlockShape {
  const sectionLayout = readSectionLayout(plan, index);
  const isGenericLayout =
    !sectionLayout || sectionLayout === "首屏结构" || sectionLayout === "内容区块" || /^section-\d+$/i.test(sectionLayout);
  if (!isGenericLayout) {
    const fromSection = shapeFromSectionLayout(sectionLayout);
    if (fromSection) return fromSection;
  }
  if (index === 0) {
    const fromPreview = shapeFromPreviewHero(plan?.previewWireframe ?? {});
    if (fromPreview) return fromPreview;
    const fromPatterns = shapeFromComponentPatterns(plan);
    if (fromPatterns) return fromPatterns;
  }
  return shapeForModule(label, index, total, template);
}

function shapeForModule(label: string, index: number, total: number, template: string): WireframeBlockShape {
  const text = label.toLowerCase();
  const isLast = index === total - 1;

  if (isLast || /咨询|预约|购买|报名|联系|合作|行动|cta|入口/.test(text)) return "cta-band";
  if (/作品|案例|网格|分类|列表|瀑布|展示/.test(text)) return "grid-3";
  if (/产品|服务|套餐|风格|对比|权益/.test(text)) return "grid-2";
  if (/流程|步骤|路径|周期|交付/.test(text)) return "steps";
  if (/评价|证明|资质|客户|faq|常见|背书|数据|信任|保障|结果/.test(text)) return "proof-strip";
  if (/工具|操作|预览|工作台|界面|demo|截图/.test(text)) return "tool-panel";
  if (/观点|文章|叙事|介绍|说明/.test(text)) return "content-band";
  if (index === 0 && isComplexPlanTemplate(template)) return template === "tool" ? "tool-panel" : "content-band";
  if (index === 0) return heroShapeForTemplate(template);
  return index % 3 === 1 ? "steps" : index % 3 === 2 ? "proof-strip" : "content-band";
}

function placeholderBodyShapes(template: string, count: number): WireframeBlockShape[] {
  const samples: WireframeBlockShape[] =
    template === "trust"
      ? ["content-band", "steps", "proof-strip", "grid-3", "cta-band"]
      : template === "hub" || template === "tool"
        ? ["grid-3", "grid-3", "content-band", "cta-band"]
        : ["grid-3", "steps", "proof-strip", "content-band", "cta-band"];

  return Array.from({ length: Math.max(0, count - 1) }, (_, index) => samples[index % samples.length]);
}

function buildWireframeLayout(plan: InfoPlan | undefined, variant = 0, withLabels = false): WireframeLayout {
  const pageLayout = plan && withLabels ? resolvePlanPageLayout(plan) : undefined;
  const template = pageLayout?.template ?? (plan ? resolvePlanTemplate(plan) : PLACEHOLDER_TEMPLATES[variant % PLACEHOLDER_TEMPLATES.length]);
  const shell = pageLayout?.shell ?? (plan ? resolvePlanShell(plan, template) : "landing");
  const complex = pageLayout?.complex ?? (shell === "sidebar" || isComplexPlanTemplate(template));
  const slots = pageLayout
    ? [pageLayout.hero, ...pageLayout.mainModules, ...pageLayout.sidebarModules].filter(
        (slot): slot is NonNullable<typeof slot> => Boolean(slot),
      )
    : [];
  const slotCount = slots.length || DEFAULT_SLOT_COUNT;

  if (!slots.length) {
    const heroShape = complex && template === "tool" ? "tool-panel" : complex ? "content-band" : heroShapeForTemplate(template);
    const bodyShapes = placeholderBodyShapes(template, slotCount);
    return {
      template,
      shell,
      complex,
      hero: { key: "hero-placeholder", shape: heroShape },
      body: bodyShapes.map((shape, index) => ({ key: `body-placeholder-${index}`, shape })),
    };
  }

  const toBlock = (slot: { id: string; label: string }, index: number) => ({
    key: slot.id,
    shape: resolveBlockShape(plan, slot.label, index, slots.length, template),
    label: slot.label,
  });

  if (complex) {
    const [first, ...rest] = slots;
    return {
      template,
      shell,
      complex: true,
      hero: toBlock(first, 0),
      body: rest.map((slot, index) => toBlock(slot, index + 1)),
    };
  }

  if (shell === "split" && pageLayout?.sidebarModules.length) {
    const hero = pageLayout.hero ? toBlock(pageLayout.hero, 0) : null;
    const body = [...pageLayout.mainModules, ...pageLayout.sidebarModules].map((slot, index) =>
      toBlock(slot, index + (hero ? 1 : 0)),
    );
    return { template, shell, complex: false, hero, body };
  }

  const [first, ...rest] = slots;
  return {
    template,
    shell,
    complex: false,
    hero: toBlock(first, 0),
    body: rest.map((slot, index) => toBlock(slot, index + 1)),
  };
}

function BlockSurface({ shape }: { shape: WireframeBlockShape }) {
  if (shape === "hero-media" || shape === "hero-product") {
    return (
      <div className="pw-surface pw-surface-media">
        <div className="pw-media-stage">
          <span className="pw-media-block" aria-hidden="true" />
        </div>
      </div>
    );
  }
  if (shape === "hero-split") {
    return (
      <div className="pw-surface pw-surface-split">
        <div className="pw-split-copy">
          <span className="pw-lines pw-lines-tall" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="pw-split-side">
          <span className="pw-media-block" aria-hidden="true" />
        </div>
      </div>
    );
  }
  if (shape === "hero-proof") {
    return (
      <div className="pw-surface pw-surface-proof">
        <div className="pw-proof-copy">
          <span className="pw-lines pw-lines-tall" aria-hidden="true">
            <i />
            <i />
          </span>
        </div>
        <div className="pw-proof-cards" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  }
  if (shape === "grid-2" || shape === "grid-3" || shape === "grid-4") {
    const count = shape === "grid-2" ? 2 : shape === "grid-4" ? 4 : 3;
    return (
      <div className="pw-surface pw-surface-grid">
        <div className={`pw-grid-cells cols-${count}`} aria-hidden="true">
          {Array.from({ length: count }, (_, index) => (
            <span key={index} className={index === 0 ? "is-primary" : undefined} />
          ))}
        </div>
      </div>
    );
  }
  if (shape === "steps") {
    return (
      <div className="pw-surface pw-surface-steps" aria-hidden="true">
        <span className="pw-step-cells">
          <span />
          <span />
          <span />
        </span>
      </div>
    );
  }
  if (shape === "proof-strip") {
    return (
      <div className="pw-surface pw-surface-proof-strip" aria-hidden="true">
        <span className="pw-proof-cells">
          <span />
          <span />
          <span />
        </span>
      </div>
    );
  }
  if (shape === "cta-band") {
    return (
      <div className="pw-surface pw-surface-cta" aria-hidden="true">
        <span className="pw-cta-box" />
      </div>
    );
  }
  if (shape === "tool-panel") {
    return (
      <div className="pw-surface pw-surface-tool" aria-hidden="true">
        <span className="pw-tool-side">
          <span />
          <span />
          <span />
        </span>
        <div className="pw-tool-main">
          <span className="pw-media-block" aria-hidden="true" />
        </div>
      </div>
    );
  }
  return (
    <div className="pw-surface pw-surface-band" aria-hidden="true">
      <span className="pw-lines">
        <i />
        <i />
      </span>
    </div>
  );
}

function WireframeBlock({
  blockKey,
  shape,
  label,
  animating,
  reflowing,
  index,
}: {
  blockKey: string;
  shape: WireframeBlockShape;
  label?: string;
  animating?: boolean;
  reflowing?: boolean;
  index: number;
}) {
  return (
    <div
      className={`pw-block pw-${shape}${animating ? " is-animating" : ""}${reflowing ? " is-reflowing" : ""}${label ? " has-label" : " is-empty"}`}
      data-block-key={blockKey}
      style={{ "--pw-delay": `${index * 0.07}s` } as CSSProperties}
    >
      {label ? (
        <div className="pw-inlay-band">
          <span className="pw-inlay-label">{label}</span>
        </div>
      ) : animating ? (
        <span className="pw-ghost" aria-hidden="true" />
      ) : null}
      <BlockSurface shape={shape} />
    </div>
  );
}

function WireframeNav({ animating }: { animating?: boolean }) {
  return (
    <div className={`pw-chrome pw-nav${animating ? " is-animating" : ""}`} aria-hidden="true">
      <span className="pw-logo" />
      <span className="pw-pill" />
      <span className="pw-pill" />
      <span className="pw-pill short" />
    </div>
  );
}

function WireframeFooter({ animating }: { animating?: boolean }) {
  return (
    <div className={`pw-chrome pw-footer${animating ? " is-animating" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function WireframeSidebar({ animating }: { animating?: boolean }) {
  return (
    <aside className={`pw-sidebar${animating ? " is-animating" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </aside>
  );
}

export function PlanWireframePreview({
  plan,
  animating = false,
  variant = 0,
}: {
  plan?: InfoPlan;
  animating?: boolean;
  variant?: number;
}) {
  const layout = buildWireframeLayout(plan, variant, Boolean(plan) && !animating);
  const pageLayout = plan ? resolvePlanPageLayout(plan) : undefined;
  const moduleCount = (layout.hero ? 1 : 0) + layout.body.length;
  const layoutFingerprint = moduleLayoutFingerprint(plan);
  const [reflowing, setReflowing] = useState(false);
  const prevFingerprintRef = useRef(layoutFingerprint);

  useEffect(() => {
    if (animating || !plan) {
      prevFingerprintRef.current = layoutFingerprint;
      return;
    }
    if (prevFingerprintRef.current && prevFingerprintRef.current !== layoutFingerprint) {
      setReflowing(true);
      const timer = window.setTimeout(() => setReflowing(false), 520);
      prevFingerprintRef.current = layoutFingerprint;
      return () => window.clearTimeout(timer);
    }
    prevFingerprintRef.current = layoutFingerprint;
  }, [animating, layoutFingerprint, plan]);

  let blockIndex = 0;

  return (
    <div
      className={`plan-preview plan-wireframe template-${layout.template} shell-${layout.shell}${layout.complex ? " is-complex" : " is-landing"}${animating ? " is-animating" : ""}${reflowing ? " is-reflowing" : ""}`}
      style={
        {
          "--pw-variant-delay": `${variant * 0.35}s`,
          "--pw-module-count": moduleCount,
        } as CSSProperties
      }
      aria-label={plan ? `${formatPlanTitle(plan)}页面骨架预览` : "正在生成页面骨架"}
      aria-busy={animating || undefined}
    >
      <WireframeNav animating={animating} />
      {layout.shell === "bento" ? (
        <div className="pw-body pw-body-bento">
          {layout.hero ? (
            <WireframeBlock
              blockKey={layout.hero.key}
              shape={layout.hero.shape}
              label={layout.hero.label}
              animating={animating}
              reflowing={reflowing}
              index={blockIndex++}
            />
          ) : null}
          <div className="pw-bento-grid">
            {layout.body.map((block) => (
              <WireframeBlock
                key={block.key}
                blockKey={block.key}
                shape={block.shape}
                label={block.label}
                animating={animating}
                reflowing={reflowing}
                index={blockIndex++}
              />
            ))}
          </div>
        </div>
      ) : layout.shell === "split" ? (
        <div className="pw-body pw-body-split">
          <div className="pw-split-col pw-split-col-main">
            {layout.hero ? (
              <WireframeBlock
                blockKey={layout.hero.key}
                shape={layout.hero.shape}
                label={layout.hero.label}
                animating={animating}
                reflowing={reflowing}
                index={blockIndex++}
              />
            ) : null}
            {(pageLayout?.shell === "split"
              ? layout.body.filter((block) => pageLayout.mainModules.some((item) => item.id === block.key))
              : layout.body.slice(0, Math.ceil(layout.body.length / 2))
            ).map((block) => (
              <WireframeBlock
                key={block.key}
                blockKey={block.key}
                shape={block.shape}
                label={block.label}
                animating={animating}
                reflowing={reflowing}
                index={blockIndex++}
              />
            ))}
          </div>
          <div className="pw-split-col pw-split-col-side">
            {(pageLayout?.shell === "split"
              ? layout.body.filter((block) => pageLayout.sidebarModules.some((item) => item.id === block.key))
              : layout.body.slice(Math.ceil(layout.body.length / 2))
            ).map((block) => (
              <WireframeBlock
                key={block.key}
                blockKey={block.key}
                shape={block.shape}
                label={block.label}
                animating={animating}
                reflowing={reflowing}
                index={blockIndex++}
              />
            ))}
          </div>
        </div>
      ) : layout.complex ? (
        <div className="pw-body pw-body-complex">
          <WireframeSidebar animating={animating} />
          <div className="pw-main">
            {layout.hero ? (
              <WireframeBlock
                blockKey={layout.hero.key}
                shape={layout.hero.shape}
                label={layout.hero.label}
                animating={animating}
                reflowing={reflowing}
                index={blockIndex++}
              />
            ) : null}
            {layout.body.map((block, index) => (
              <WireframeBlock
                key={block.key}
                blockKey={block.key}
                shape={block.shape}
                label={block.label}
                animating={animating}
                reflowing={reflowing}
                index={blockIndex++}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="pw-body pw-body-landing">
          {layout.hero ? (
            <WireframeBlock
              blockKey={layout.hero.key}
              shape={layout.hero.shape}
              label={layout.hero.label}
              animating={animating}
              reflowing={reflowing}
              index={blockIndex++}
            />
          ) : null}
          {layout.body.map((block, index) => (
            <WireframeBlock
              key={block.key}
              blockKey={block.key}
              shape={block.shape}
              label={block.label}
              animating={animating}
              reflowing={reflowing}
              index={blockIndex++}
            />
          ))}
        </div>
      )}
      <WireframeFooter animating={animating} />
      {animating ? <div className="pw-beam" aria-hidden="true" /> : null}
    </div>
  );
}

export function PageLoFiPreview({ plan }: { plan: InfoPlan }) {
  return <PlanWireframePreview plan={plan} />;
}

export function PlanTextPreview({ plan }: { plan: InfoPlan }) {
  const modules = getPlanContentModules(plan);
  const items = modules.length ? modules.map((module) => module.label) : plan.structure;

  return (
    <div className="plan-preview plan-preview-text-only" aria-label={`${formatPlanTitle(plan)}文字方案`}>
      {(plan.summary || plan.pageArchitecture) && (
        <p className="plan-text-lead">{formatPlanSummary(plan.summary || plan.pageArchitecture || "", 80)}</p>
      )}
      <ul className="plan-text-structure">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
