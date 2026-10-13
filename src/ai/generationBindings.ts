import type { ContentModulePlacement, InfoPlan, IntentDimension, OptionItem, ProjectState, VisualId } from "../types";
import { UNIVERSAL_LAYOUT_BALANCE_RULES } from "../generationLayoutBalance";
import {
  buildLayoutShellMandatoryRules,
  buildLayoutShellStyleBlock,
  resolvePlanPageLayout,
} from "../pageLayoutArchitecture";
import { resolveCohesiveVisualPreset, type ReferenceVisualPreset } from "./designReference";
import { compileSpokenConstraintRules, getProjectSpokenConstraints } from "./spokenConstraints";
import { getVisualSpec } from "./visualSpecs";

const INTENT_TITLES: Record<string, string> = {
  targetUser: "主要用户群体",
  coverage: "突出重点",
  valueProposition: "核心感觉",
};

const CARD_STYLE_CSS: Record<string, { borderRadius: string; boxShadow: string; border: string }> = {
  "flat-hairline": { borderRadius: "4px", boxShadow: "none", border: "1px solid #e5e7eb" },
  "soft-card": { borderRadius: "8px", boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)", border: "none" },
  bordered: { borderRadius: "8px", boxShadow: "none", border: "1px solid #cbd5e1" },
  elevated: { borderRadius: "12px", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)", border: "none" },
  flat: { borderRadius: "4px", boxShadow: "none", border: "1px solid #e5e7eb" },
  soft: { borderRadius: "10px", boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)", border: "none" },
};

const DENSITY_LAYOUT: Record<string, { sectionGap: string; gridGap: string; columns: number }> = {
  spacious: { sectionGap: "72px", gridGap: "24px", columns: 2 },
  balanced: { sectionGap: "56px", gridGap: "16px", columns: 3 },
  compact: { sectionGap: "40px", gridGap: "10px", columns: 4 },
};

function readString(hints: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = hints[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function readableTextOnColor(color: string) {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return "#ffffff";
  const [red, green, blue] = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const toLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
  return luminance > 0.4 ? "#1f2937" : "#ffffff";
}

function readTokenRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function compilePresetEnhancementSnippets(preset: ReferenceVisualPreset) {
  const snippets: string[] = [];
  const preview = preset.previewRules ?? {};
  const tokens = preset.visualTokens ?? {};
  if (preview.hero === "image-first") {
    snippets.push(`.hero,.hero-section,.banner{align-items:center}`);
    snippets.push(`.hero img,.hero-image img,.banner img,.dt-stock-image{object-fit:cover;border-radius:var(--image-radius,12px)}`);
  }
  const imageTreatment = preview.imageTreatment ?? readTokenRecord(tokens.image).treatment;
  if (imageTreatment === "minimal-frame") {
    snippets.push(`img{border:1px solid color-mix(in srgb,currentColor 10%,transparent)}`);
  }
  return snippets;
}

function compileSelectedVisualEnhancements(
  dimensions: Array<{
    id: VisualId;
    selectedOptionId?: string;
    options: OptionItem[];
  }>,
) {
  const snippets: string[] = [];
  const colorDimension = dimensions.find((item) => item.id === "color");
  const cardDimension = dimensions.find((item) => item.id === "card");
  const selectedColor = colorDimension?.options.find((item) => item.id === colorDimension.selectedOptionId);
  const selectedCard = cardDimension?.options.find((item) => item.id === cardDimension.selectedOptionId);

  if (selectedCard) {
    const preview = selectedCard.previewRules ?? {};
    const tokenRadius = readTokenRecord(selectedCard.visualTokens?.radius);
    const cardRadius =
      (typeof preview.radiusPx === "number" ? `${preview.radiusPx}px` : undefined) ||
      (typeof tokenRadius.card === "string" ? tokenRadius.card : undefined);
    if (cardRadius) {
      const buttonRadius = typeof tokenRadius.button === "string" ? tokenRadius.button : cardRadius;
      const imageRadius = typeof tokenRadius.image === "string" ? tokenRadius.image : cardRadius;
      snippets.push(
        `:root{--card-radius:${cardRadius};--button-radius:${buttonRadius};--image-radius:${imageRadius}}`,
      );
    }
  }

  if (selectedColor) {
    const preview = selectedColor.previewRules ?? {};
    if (preview.hero === "image-first") {
      snippets.push(`.hero,.hero-section,.banner{align-items:center}`);
      snippets.push(`.hero img,.hero-image img,.banner img,.dt-stock-image{object-fit:cover;border-radius:var(--image-radius,12px)}`);
    }
    const imageTreatment = preview.imageTreatment ?? readTokenRecord(selectedColor.visualTokens?.image).treatment;
    if (imageTreatment === "minimal-frame") {
      snippets.push(`img{border:1px solid color-mix(in srgb,currentColor 10%,transparent)}`);
    }
  }

  return snippets;
}

export function buildEnforcedStyleBlock(project: ProjectState) {
  const dimensions = project.mechanism.visualDimensions;
  const visual = compileVisualCssContract(dimensions);
  const rules = [...visual.styleSnippets, ...compileSelectedVisualEnhancements(dimensions)];
  const cohesivePreset = resolveCohesiveVisualPreset(project);
  if (cohesivePreset) {
    rules.push(...compilePresetEnhancementSnippets(cohesivePreset));
  }
  const uniqueRules = [...new Set(rules.filter(Boolean))];
  const visualBlock = uniqueRules.length ? `<style data-designtool-binding>\n${uniqueRules.join("\n")}\n</style>` : "";

  const plan = project.mechanism.infoPlans.find((item) => item.id === project.mechanism.selectedInfoPlanId);
  const layoutBlock = plan ? buildLayoutShellStyleBlock(resolvePlanPageLayout(plan)) : "";

  return [layoutBlock, visualBlock].filter(Boolean).join("\n");
}

function prefixRule(scope: string, rule: string) {
  const text = rule.trim();
  if (!text) return "";
  return text.startsWith("【") ? text : `【${scope}】${text}`;
}

export function compileIntentBindings(dimensions: IntentDimension[]) {
  const choices = dimensions
    .map((dimension) => {
      const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
      if (!selected) return null;
      const scope = `${dimension.title || INTENT_TITLES[dimension.id] || dimension.id}·${selected.label}`;
      const fromOption = [...(selected.generationRules ?? []), ...(selected.constraints ?? [])]
        .map((rule) => prefixRule(scope, rule))
        .filter(Boolean);
      const mandatoryRules =
        fromOption.length > 0
          ? fromOption
          : [
              prefixRule(
                scope,
                `用户已确认此判断：页面文案、案例、配图语境、CTA 与信息优先级必须服务「${selected.label}」，不得偏向其它人群或卖点。`,
              ),
              selected.normalizedMeaning ? prefixRule(scope, `含义：${selected.normalizedMeaning}`) : "",
              selected.reason ? prefixRule(scope, `设计说明：${selected.reason}`) : "",
            ].filter(Boolean);
      return {
        dimensionId: dimension.id,
        dimensionTitle: dimension.title,
        optionId: selected.id,
        label: selected.label,
        normalizedMeaning: selected.normalizedMeaning,
        reason: selected.reason,
        constraints: selected.constraints ?? [],
        generationRules: selected.generationRules ?? [],
        mandatoryRules,
        forbiddenPatterns: selected.forbiddenPatterns ?? [],
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    choices,
    mandatoryRules: choices.flatMap((item) => item.mandatoryRules),
    forbiddenPatterns: [...new Set(choices.flatMap((item) => item.forbiddenPatterns))],
  };
}

export function compileInfoArchitectureBindings(plan?: InfoPlan) {
  if (!plan) {
    return {
      mandatoryRules: [] as string[],
      forbiddenPatterns: [] as string[],
      structureLock: [] as string[],
      layoutShell: undefined as ReturnType<typeof resolvePlanPageLayout> | undefined,
    };
  }

  const scope = `信息组织·${plan.title}`;
  const structureLock = plan.structure ?? [];
  const layoutShell = resolvePlanPageLayout(plan);
  const mandatoryRules = [
    prefixRule(
      scope,
      structureLock.length
        ? `用户已选此方案：顶层模块顺序必须严格为 ${structureLock.join(" → ")}；每个模块对应一个独立 <section>，不得增删、调序或合并。`
        : "用户已选此信息组织方案，页面骨架必须按方案字段落地。",
    ),
    plan.pageArchitecture ? prefixRule(scope, `页面架构：${plan.pageArchitecture}`) : "",
    plan.summary ? prefixRule(scope, `方案摘要：${plan.summary}`) : "",
    plan.firstScreen && typeof plan.firstScreen === "object"
      ? prefixRule(scope, `首屏约束：${JSON.stringify(plan.firstScreen)}`)
      : "",
    plan.componentPatterns && typeof plan.componentPatterns === "object"
      ? prefixRule(scope, `组件模式必须体现：${JSON.stringify(plan.componentPatterns)}`)
      : "",
    plan.contentFlow && typeof plan.contentFlow === "object"
      ? prefixRule(scope, `内容流：${JSON.stringify(plan.contentFlow)}`)
      : "",
    ...(plan.contentModules ?? []).map((module) => contentModuleRule(module)),
    ...(plan.generationRules ?? []).map((rule) => prefixRule(scope, rule)),
    ...buildLayoutShellMandatoryRules(layoutShell),
  ].filter(Boolean);

  return {
    planId: plan.id,
    title: plan.title,
    structureLock,
    layoutShell,
    mandatoryRules,
    forbiddenPatterns: [...new Set(plan.forbiddenPatterns ?? [])],
    contentModules: plan.contentModules ?? [],
  };
}

function contentModuleRule(module: ContentModulePlacement) {
  const placement = module.placement ?? "content";
  const section = module.sectionId ?? placement;
  return prefixRule(
    `功能模块·${module.label}`,
    `必须出现在页面中，归属 ${placement} 区段（sectionId: ${section}）${module.reason ? `；${module.reason}` : ""}。`,
  );
}

export function compileVisualCssContract(
  dimensions: Array<{
    id: VisualId;
    title: string;
    selectedOptionId?: string;
    options: OptionItem[];
  }>,
) {
  const selections = dimensions
    .map((dimension) => {
      const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
      if (!selected) return null;
      const spec = getVisualSpec(dimension.id, selected.id);
      const hints = selected.tokenHints ?? {};
      const preview = selected.previewRules ?? {};
      const visualTokens = selected.visualTokens ?? {};
      const tokenColor = readTokenRecord(visualTokens.color);
      const scope = `${dimension.title}·${selected.label}`;
      const mandatoryRules = [
        ...(selected.generationRules ?? []).map((rule) => prefixRule(scope, rule)),
        spec?.instruction ? prefixRule(scope, spec.instruction) : "",
      ].filter(Boolean);

      if (dimension.id === "color") {
        const primary =
          readString(hints, ["primary"]) ??
          (typeof tokenColor.accent === "string" ? tokenColor.accent : undefined) ??
          spec?.cssTokens.primary ??
          "#2563eb";
        const secondary = readString(hints, ["secondary"]) ?? spec?.cssTokens.secondary ?? "#dbeafe";
        const accent =
          readString(hints, ["accent"]) ??
          (typeof tokenColor.accent === "string" ? tokenColor.accent : undefined) ??
          spec?.cssTokens.accent ??
          "#0f172a";
        const background =
          readString(hints, ["background"]) ??
          (typeof tokenColor.background === "string" ? tokenColor.background : undefined) ??
          spec?.cssTokens.background ??
          "#f8fafc";
        const text =
          readString(hints, ["text"]) ??
          (typeof tokenColor.text === "string" ? tokenColor.text : undefined) ??
          spec?.cssTokens.text ??
          "#0f172a";
        const onPrimary = readableTextOnColor(primary);
        mandatoryRules.push(
          prefixRule(scope, `主色 ${primary}、辅色 ${secondary}、点缀 ${accent}、背景 ${background}、正文 ${text}；禁止擅自换成其它色系。`),
        );
        return {
          dimensionId: dimension.id,
          dimensionTitle: dimension.title,
          optionId: selected.id,
          label: selected.label,
          cssContract: {
            "--color-primary": primary,
            "--color-secondary": secondary,
            "--color-accent": accent,
            "--color-background": background,
            "--color-text": text,
            bodyBackground: background,
            bodyColor: text,
          },
          styleSnippets: [
            `:root{--color-primary:${primary};--color-secondary:${secondary};--color-accent:${accent};--color-background:${background};--color-text:${text}}`,
            `body{background:${background};color:${text}}`,
            `.btn-primary,.cta,header a.primary{background:${primary};color:${onPrimary}}`,
            `h1,h2{color:${text}}`,
            `.accent{color:${primary}}`,
          ],
          mandatoryRules,
          forbiddenPatterns: selected.forbiddenPatterns ?? [],
        };
      }

      if (dimension.id === "font") {
        const heading =
          readString(hints, ["heading", "headingFont", "fontFamily"]) ??
          spec?.cssTokens.heading ??
          '"PingFang SC","Microsoft YaHei",sans-serif';
        const body = readString(hints, ["body", "bodyFont"]) ?? spec?.cssTokens.body ?? heading;
        const numeric = readString(hints, ["numeric", "price", "numericFont"]) ?? spec?.cssTokens.price;
        mandatoryRules.push(prefixRule(scope, `标题字体 ${heading}；正文字体 ${body}${numeric ? `；数字 ${numeric}` : ""}。禁止换成其它字体栈。`));
        return {
          dimensionId: dimension.id,
          dimensionTitle: dimension.title,
          optionId: selected.id,
          label: selected.label,
          cssContract: { headingFont: heading, bodyFont: body, ...(numeric ? { numericFont: numeric } : {}) },
          styleSnippets: [
            `h1,h2,h3,.heading{font-family:${heading}}`,
            `body,p,li,.body{font-family:${body}}`,
            ...(numeric ? [`.price,.stat,.metric{font-family:${numeric}}`] : []),
          ],
          mandatoryRules,
          forbiddenPatterns: selected.forbiddenPatterns ?? [],
        };
      }

      if (dimension.id === "card") {
        const tokenRadius = readTokenRecord(visualTokens.radius);
        const cardStyle = String(preview.cardStyle ?? (selected.id.includes("flat") ? "flat-hairline" : "soft-card"));
        const preset = CARD_STYLE_CSS[cardStyle] ?? CARD_STYLE_CSS["soft-card"];
        const radiusPx =
          typeof preview.radiusPx === "number"
            ? preview.radiusPx
            : typeof tokenRadius.card === "string"
              ? parseInt(tokenRadius.card, 10)
              : parseInt(preset.borderRadius, 10);
        const borderRadius = `${radiusPx}px`;
        const cardCss = { ...preset, borderRadius };
        mandatoryRules.push(
          prefixRule(
            scope,
            `卡片/信息块：圆角 ${borderRadius}，阴影 ${cardCss.boxShadow}，边框 ${cardCss.border}；所有卡片组件必须一致。`,
          ),
        );
        return {
          dimensionId: dimension.id,
          dimensionTitle: dimension.title,
          optionId: selected.id,
          label: selected.label,
          cssContract: { cardStyle, ...cardCss },
          styleSnippets: [
            `:root{--card-radius:${borderRadius};--button-radius:${borderRadius}}`,
            `.card,.panel,article.section-card,.feature-card,.portfolio-card{border-radius:${borderRadius};box-shadow:${cardCss.boxShadow};border:${cardCss.border}}`,
          ],
          mandatoryRules,
          forbiddenPatterns: selected.forbiddenPatterns ?? [],
        };
      }

      const density = String(preview.density ?? spec?.cssTokens.density ?? "balanced");
      const layout = DENSITY_LAYOUT[density] ?? DENSITY_LAYOUT.balanced;
      mandatoryRules.push(
        prefixRule(
          scope,
          `内容密度 ${density}：section 间距约 ${layout.sectionGap}，卡片/模块间距约 ${layout.gridGap}。重复项目在空间充足时最多 ${layout.columns} 列；窄容器和手机端必须自动减少列数，不能挤成窄条。`,
        ),
      );
      return {
        dimensionId: dimension.id,
        dimensionTitle: dimension.title,
        optionId: selected.id,
        label: selected.label,
        cssContract: { density, ...layout },
        styleSnippets: [
          `:root{--section-gap:${layout.sectionGap};--grid-gap:${layout.gridGap}}`,
        ],
        mandatoryRules,
        forbiddenPatterns: selected.forbiddenPatterns ?? [],
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    selections,
    mandatoryRules: selections.flatMap((item) => item.mandatoryRules),
    forbiddenPatterns: [...new Set(selections.flatMap((item) => item.forbiddenPatterns))],
    styleSnippets: selections.flatMap((item) => item.styleSnippets),
  };
}

export function buildBindingContract(project: ProjectState) {
  const intent = compileIntentBindings(project.intent.dimensions);
  const plan = project.mechanism.infoPlans.find((item) => item.id === project.mechanism.selectedInfoPlanId);
  const info = compileInfoArchitectureBindings(plan);
  const visual = compileVisualCssContract(project.mechanism.visualDimensions);
  const spokenRules = compileSpokenConstraintRules(getProjectSpokenConstraints(project));

  const mandatoryRules = [...new Set([...UNIVERSAL_LAYOUT_BALANCE_RULES, ...spokenRules, ...intent.mandatoryRules, ...info.mandatoryRules, ...visual.mandatoryRules])];
  const forbiddenPatterns = [...new Set([...intent.forbiddenPatterns, ...info.forbiddenPatterns, ...visual.forbiddenPatterns])];

  const acceptanceChecks = [
    "意图三维已选项是否在文案与信息优先级中可见",
    "页面 section 顺序是否与 structureLock 一致",
    "页面壳层 layoutShell 是否与信息组织预览一致（单栏/双栏/宫格/侧栏）",
    "contentModules 是否全部落地到对应区段",
    "是否出现窄栏竖排长文案或一侧大面积无意义空白（全局版式平衡）",
    "CSS 色值/字体/圆角/间距是否与 visual.cssContract 一致",
    "是否出现 forbiddenPatterns 中的元素",
  ];

  return {
    precedence:
      "用户输入约束（spokenConstraints / inputConstraints）> bindingContract（用户已确认选项）> generationRules > rawInput 补充细节；冲突时以输入约束与用户已选为准。",
    nonNegotiable: true,
    userSpokenConstraints: getProjectSpokenConstraints(project),
    intent: intent.choices,
    infoArchitecture: info,
    visual: visual,
    mandatoryRules,
    forbiddenPatterns,
    acceptanceChecks,
  };
}
