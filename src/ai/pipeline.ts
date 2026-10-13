import { formatPlanTitle, sanitizeChineseNote } from "../planLoFi";
import { formatContentModuleLabel } from "../contentModuleLabel";
import { describePlanShell } from "../pageLayoutArchitecture";
import type { ContentModulePlacement, DimensionId, InfoPlan, IntentState, OptionItem, VisualId } from "../types";
import { deepseekChat, getDeepSeekFastModel, getDeepSeekGenerateModel, isBillingErrorMessage, isSpendBlockedGlobally } from "./deepseek";
import {
  buildReferenceVisualSelections,
  getBriefReferenceContext,
  getMechanismReferenceContext,
  getOrchestrationReferenceContext,
  getVisualGrammarTeacherContext,
} from "./designReference";
import { normalizeVisualGrammarSelections, enrichVisualOption, formatVisualOptionReason } from "./visualGrammarNormalize";
import { finalizeGeneratedHtml } from "./html";
import { VISUAL_DIMENSION_IDS, VISUAL_DIMENSION_INITIAL_OPTIONS, VISUAL_OPTION_CATALOG } from "./catalogs";
import { mergeInputConstraintTexts, sanitizeSpokenConstraints, sanitizeUserInputConstraints, ensureProjectSpokenConstraints, inferConstraintOptionIds, constraintsForOptionMarking } from "./spokenConstraints";
import { ensurePlacedSpokenConstraints } from "./constraintPlacementRepair";
import { resolveIntentColorMood } from "./intentConstraintSemantics";
import { buildIntentMechanismBinding, resolveRecommendedPlanId, scoreInfoPlanAgainstIntent, type IntentMechanismBinding } from "./intentMechanismBinding";
import { extractJsonObject, extractVisualGrammarPayload } from "./json";
import type { AiBriefResult, AiMechanismResult, AiVisualSelection, MechanismPlanInput, SpokenConstraint } from "./types";

const BRIEF_SYSTEM_V2 = `你是网页设计需求分析助手。根据用户输入，动态生成设计意图阶段的三个问题选项。
只输出 JSON，不要 markdown，不要解释。
要求：
- 不要从行业库硬匹配固定选项，要根据用户原话生成选项。
- 必须输出 dimensions，且只包含 targetUser / coverage / valueProposition 三个维度。
- 三个问题要像给新手用户看的判断问题，不要像内部字段名；推荐问法方向：
  targetUser 问“最主要的用户群体是谁？”（单选，选首要服务对象，不是列出所有可能用户）
  coverage 问“要突出什么？”
  valueProposition 问“最核心的感觉是什么？”（单选，选首要品牌/页面气质，不是并列多个调性）
- targetUser 的选项回答「优先服务谁」，例如“第一次了解的人 / 已经有需求的人 / 准备合作的人”。每个选项代表一个主用户群，不要写成可多选并列。
- coverage 的选项回答页面重点，例如企业官网可用“公司是谁 / 核心能力 / 成功案例 / 产品/服务 / 技术实力 / 联系合作”中最合适的 2-3 个。
- valueProposition 的选项回答用户看完形成的判断，例如“可信 / 专业 / 高级 / 清晰 / 有实力 / 好理解”。
- 每个维度输出 2-3 个 options。每个 option 必须有 id、label、reason、source="ai-generated"、normalizedMeaning、constraints。
- id 使用英文小写、数字和连字符，例如 ai-target-first-time-visitors。
- inputConstraints：兼容字段，可填用户原话短句；优先使用 spokenConstraints。
- spokenConstraints：只收录用户**明确表达**的偏好原话（含要/不要/需要/希望/突出，或具体色彩字体等），每项必须含 kind、text，并尽量补全归位字段：
  - 若用户仅给出页面类型/业务描述（如「儿童美术培训招生官网」「科技公司品牌官网」）而无明确偏好句式，spokenConstraints 应为空数组，或最多一条整句 pageGeneral；**不得**把业务名词（招生/培训/家长）或 AI 推断的风格（卡通/可爱/活力）拆成约束
  - text 必须来自用户原话；inferredLabel 可以是语义归纳，但不得把用户没说过的话写入 text
  - placement（归位，必填）：约束影响哪一步
    - intentTargetUser / intentCoverage / intentValueProposition → 设计意图三问
    - infoArchitecture → 信息组织方案
    - functionModule → 功能内容模块
    - visualColor / visualFont / visualCard / visualDensity → 视觉语法四维
    - pageGeneral → 仅参与生成、不对应单选维度
  - inferredLabel（语义标签）：你理解后的短选项名。例：text「求职用」→ inferredLabel「招聘方/面试官」；text「活力」→「活力」
  - mapsToOptionId（可选）：若 dimensions 中已有对应选项，填其 id；系统会给该选项打「输入约束」
  - text 必须来自用户原话；inferredLabel 可以是你的语义归纳
- 归位后影响：
  - 三问：对应维度选项标「输入约束」；用户未说的维度正常出 AI 推荐选项
  - 信息组织/功能/视觉：后续步骤优先生成含约束语义的方案与选项
  - 生成：spokenConstraints 为最高优先级合同，不得被后续步骤覆盖
- constraintOptionIds：与 mapsToOptionId 一致，列出三问中已被用户原话锁定的 optionId
- 必须输出 pageType：用 4-16 个字的自由短语概括「这是什么页面/站点」，例如「B2B 工业品展示页」「餐饮品牌故事页」「在线课程报名页」「社区二手交易页」。不要强行归入电商/学校/作品集等固定行业名；按用户原话判断。
- 可选 recognitionSummary：一句话中性概括用户业务/对象/目的（不超过 40 字）。只写理解，不要写设计禁忌，不要用「品牌调性/目标用户/主营业务」这类字段列表。
- 推荐理由要短，不要咨询腔。
输出格式必须严格类似：
{
  "pageType": "科技公司品牌官网",
  "recognitionSummary": "面向企业客户，强调技术实力与案例背书。",
  "dimensions": [
    {"id":"targetUser","title":"主要用户群体","question":"最主要的用户群体是谁？","options":[{"id":"ai-target-first-viewer","label":"第一次了解的人","reason":"先判断作品是否对味。","source":"ai-generated","normalizedMeaning":"first-time-viewer","constraints":["首屏先让作品建立第一判断"]}]},
    {"id":"coverage","title":"突出重点","question":"要突出什么？","options":[...]},
    {"id":"valueProposition","title":"核心感觉","question":"最核心的感觉是什么？","options":[...]}
  ],
  "constraintOptionIds": {},
  "spokenConstraints": [
    {"kind":"general","text":"求职用","placement":"intentTargetUser","inferredLabel":"招聘方/面试官","mapsToOptionId":"ai-target-recruiter"},
    {"kind":"general","text":"活力","placement":"intentValueProposition","inferredLabel":"活力","mapsToOptionId":"ai-value-vital"},
    {"kind":"visual","text":"主色调用暖橙色","placement":"visualColor","inferredLabel":"暖橙色系"}
  ],
  "inputConstraints": []
}`;

const MECHANISM_SYSTEM_V2 = `你是网页设计方案助手。根据用户输入、已选设计意图和设计知识库参考，现场推导信息组织方案。
只输出 JSON，不要 markdown，不要解释。

【输出体积硬约束 — 必须遵守】
- 只输出 recommendedPlanId + synthesizedPlans（恰好 3 个方案）。
- 每个方案只输出：id、title、structure、summary、reason、risk、pageFrame、firstScreen、decisionPath。
- pageFrame 只含 shell；firstScreen 只含 layout、priority、secondary；decisionPath 为 2～3 个短句。禁止输出 contentFlow、componentPatterns、layoutDecisions、sections、contentModules、previewWireframe、generationRules、forbiddenPatterns、planRefinements、visualSelections — 这些由系统补齐。
- structure 为 4～6 个中文模块名（短词，如「首屏背书」「作品展示」「客户评价」），不要写成长句或箭头流程。
- 全文尽量紧凑，确保 JSON 完整闭合。

【内容要求】
- 参考 designReference 中检索到的架构范例，现场创作 3 个明显不同的方案；禁止照搬范例标题。
- recommendedPlanId 须与 intentBinding「突出重点」最匹配。
- title：用「先…再…」或具体动宾句（如「先看作品，再了解服务」）；禁止口号、禁止英文。
- reason：一句话说明为何适合当前用户决策场景（≤56字）；禁止罗列模块、禁止英文术语。
- summary：≤40字，全中文。
- 三方案要对应三条真实可行的用户决策路径：首屏先解决什么疑问、接着看什么证据、最后如何行动。页面类型若是工具、工作台、内容目录或数据看板，应设计任务入口与操作/浏览路径，不要强套营销页的「作品/证明/价值叙事」。不能只调换同一批模块的顺序充数。
- pageFrame.shell 只能选「单栏」「双栏」「宫格」「侧栏工作台」。默认单栏；仅在首屏有两组需要并看且都能保持可读时选双栏；仅在多个独立内容组适合并列浏览时选宫格；仅在需要持续导航的工具/目录/看板选侧栏工作台。不要为了凑不同方案强行使用三种壳层。
- firstScreen.priority 写最重要的可见信息，secondary 写紧接其后的证据或操作，layout 用短句说明它们如何排布。risk 写此方案在当前内容或素材条件下最可能遇到的问题（≤30字）。
- 用户 spokenConstraints / inputConstraints 优先级最高。

输出格式示例（字段名保持一致，内容替换为你的推导）：
{
  "recommendedPlanId": "ai-info-plan-2",
  "synthesizedPlans": [
    {
      "id": "ai-info-plan-1",
      "title": "先看作品，再了解服务",
      "structure": ["首屏作品","服务能力","流程说明","客户评价","合作咨询"],
      "summary": "以作品建立风格判断，再承接服务与转化。",
      "reason": "适合首次访问、需要先确认风格是否匹配的目标用户。",
      "risk": "作品素材不足时首屏说服力偏弱",
      "pageFrame": { "shell": "单栏" },
      "firstScreen": { "layout": "主张与精选作品上下衔接", "priority": "代表作品", "secondary": "服务定位" },
      "decisionPath": ["确认作品风格", "理解服务能力", "发起合作咨询"]
    }
  ]
}`;

type BriefPayload = {
  pageType?: string;
  recognitionSummary?: string;
  dimensions?: unknown;
  questions?: unknown;
  intentDimensions?: unknown;
  options?: unknown;
  constraintOptionIds?: Partial<Record<DimensionId, string>>;
  inputConstraints?: string[];
  spokenConstraints?: unknown;
  residualNotes?: string;
};

type MechanismPayload = {
  recommendedPlanId?: string;
  visualSelections?: Partial<
    Record<
      VisualId,
      {
        optionId?: string;
        recommendedOptionId?: string;
        optionIds?: string[];
        optionNotes?: Record<string, string>;
        options?: OptionItem[];
        source: "recommended" | "constraint";
        reason?: string;
      }
    >
  >;
  visualExtended?: string;
  planRefinements?: Record<string, { structure?: string[]; promptPatch?: string; signal?: "recommended" | "constraint" }>;
  synthesizedPlans?: AiMechanismResult["synthesizedPlans"];
};

const INTENT_IDS: DimensionId[] = ["targetUser", "coverage", "valueProposition"];

function visualOptionLabelFromId(id: string, note?: string) {
  const trimmed = note?.trim();
  if (trimmed) {
    const short = trimmed.split(/[，。,.]/)[0]?.trim();
    if (short && short.length <= 18) return short;
  }
  return id.replace(/-/g, " ");
}

function buildDynamicVisualOptions(
  selection: NonNullable<NonNullable<MechanismPayload["visualSelections"]>[VisualId]>,
): OptionItem[] {
  const fromOptions = (selection.options ?? [])
    .filter((item) => item.id && item.label)
    .slice(0, VISUAL_DIMENSION_INITIAL_OPTIONS)
    .map((item) => ({
      ...item,
      source: item.source ?? "ai-generated",
      knowledge: item.knowledge ?? item.reason,
    }));
  if (fromOptions.length) return fromOptions;

  const recommendedId = selection.recommendedOptionId ?? selection.optionId;
  const optionIds = [recommendedId, ...(selection.optionIds ?? [])]
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .slice(0, VISUAL_DIMENSION_INITIAL_OPTIONS);
  if (!optionIds.length) return [];

  return optionIds.map((id) => {
    const note = selection.optionNotes?.[id]?.trim();
    return {
      id,
      label: visualOptionLabelFromId(id, note),
      reason: note,
      knowledge: note,
      source: "ai-generated" as const,
      generationRules: note ? [note] : [],
    };
  });
}

function storeDynamicVisualSelection(
  result: AiMechanismResult["visualSelections"],
  dimensionId: VisualId,
  selection: NonNullable<NonNullable<MechanismPayload["visualSelections"]>[VisualId]>,
  dynamicOptions: OptionItem[],
) {
  const recommendedId = selection.recommendedOptionId ?? selection.optionId;
  const dynamicIds = dynamicOptions.map((item) => item.id);
  const fallbackRecommendedId = dynamicIds.includes(recommendedId ?? "") ? recommendedId! : dynamicIds[0];
  const optionIds = [fallbackRecommendedId, ...dynamicIds.filter((id) => id !== fallbackRecommendedId)].slice(
    0,
    VISUAL_DIMENSION_INITIAL_OPTIONS,
  );
  const optionNotes = Object.fromEntries(
    dynamicOptions
      .filter((item) => item.reason || item.knowledge)
      .map((item) => [item.id, item.reason ?? item.knowledge ?? ""]),
  );
  result[dimensionId] = {
    optionId: fallbackRecommendedId,
    recommendedOptionId: fallbackRecommendedId,
    optionIds,
    options: dynamicOptions,
    optionNotes,
    source: selection.source ?? "recommended",
    reason: selection.reason,
  };
}

function normalizeVisualSelections(
  selections: MechanismPayload["visualSelections"],
): AiMechanismResult["visualSelections"] {
  const result: AiMechanismResult["visualSelections"] = {};

  for (const dimensionId of VISUAL_DIMENSION_IDS) {
    const selection = selections?.[dimensionId];
    if (!selection) continue;

    const dynamicOptions = buildDynamicVisualOptions(selection);
    if (dynamicOptions.length) {
      storeDynamicVisualSelection(result, dimensionId, selection, dynamicOptions);
      continue;
    }

    const catalogIds = VISUAL_OPTION_CATALOG[dimensionId].map((item) => item.id);
    const recommendedId = selection.recommendedOptionId ?? selection.optionId;
    if (!recommendedId || !catalogIds.includes(recommendedId)) continue;

    const fromAi = (selection.optionIds ?? []).filter((id) => catalogIds.includes(id));
    const uniqueIds = [recommendedId, ...fromAi.filter((id) => id !== recommendedId)].filter(
      (id, index, arr) => arr.indexOf(id) === index,
    );

    if (uniqueIds.length < VISUAL_DIMENSION_INITIAL_OPTIONS) {
      for (const id of catalogIds) {
        if (uniqueIds.length >= VISUAL_DIMENSION_INITIAL_OPTIONS) break;
        if (!uniqueIds.includes(id)) uniqueIds.push(id);
      }
    }

    const optionIds = uniqueIds.slice(0, VISUAL_DIMENSION_INITIAL_OPTIONS);
    const optionNotes: Record<string, string> = {};
    for (const id of optionIds) {
      const note = selection.optionNotes?.[id]?.trim();
      if (note) optionNotes[id] = note;
    }
    const catalogOptions: OptionItem[] = optionIds.map((id) => {
      const def = VISUAL_OPTION_CATALOG[dimensionId].find((item) => item.id === id);
      const note = optionNotes[id];
      return {
        id,
        label: def?.label ?? visualOptionLabelFromId(id, note),
        knowledge: note,
        source: "ai-generated" as const,
        generationRules: note ? [note] : [],
      };
    });
    result[dimensionId] = {
      optionId: recommendedId,
      recommendedOptionId: recommendedId,
      optionIds,
      options: catalogOptions,
      optionNotes: Object.keys(optionNotes).length > 0 ? optionNotes : undefined,
      source: selection.source ?? "recommended",
      reason: selection.reason,
    };
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readUnknownProperty(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined;
}

function readString(value: unknown, key: string) {
  const field = readUnknownProperty(value, key);
  return typeof field === "string" ? field.trim() : "";
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length ? items : undefined;
}

function normalizeId(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fa5-]/g, "");
}

export async function parseBriefAndIntent(input: {
  rawInput: string;
  signal?: AbortSignal;
}): Promise<AiBriefResult> {
  const result = await deepseekChat({
    signal: input.signal,
    model: getDeepSeekFastModel(),
    temperature: 0.2,
    maxTokens: 2048,
    stream: false,
    messages: [
      { role: "system", content: BRIEF_SYSTEM_V2 },
      {
        role: "user",
        content: JSON.stringify({
          rawInput: input.rawInput,
          designReference: getBriefReferenceContext({ rawInput: input.rawInput }),
        }),
      },
    ],
  });

  const payload = extractJsonObject<BriefPayload>(result.content);
  const pageType = payload.pageType?.trim();
  if (!pageType) {
    throw new Error("AI 返回缺少 pageType（页面类型判断）");
  }
  const dimensions = normalizeBriefDimensions(payload);
  if (!dimensions.some((dimension) => dimension.options.length > 0)) {
    throw new Error("AI 返回了 JSON，但没有包含可用的 dimensions 选项");
  }

  let spokenConstraints = ensureProjectSpokenConstraints(input.rawInput, payload.spokenConstraints ?? payload.inputConstraints ?? []);
  spokenConstraints = await ensurePlacedSpokenConstraints({
    rawInput: input.rawInput,
    spokenConstraints,
    dimensions: dimensions.map((dimension) => ({
      id: dimension.id,
      options: dimension.options.map((option) => ({ id: option.id, label: option.label })),
    })),
    signal: input.signal,
  });
  const legacyConstraints = sanitizeUserInputConstraints(input.rawInput, payload.inputConstraints ?? []);
  const inputConstraints = mergeInputConstraintTexts(spokenConstraints, legacyConstraints);
  const inferredConstraintOptionIds = inferConstraintOptionIds(
    dimensions,
    constraintsForOptionMarking(input.rawInput, spokenConstraints),
    input.rawInput,
  );
  const constraintOptionIds = {
    ...(payload.constraintOptionIds ?? {}),
    ...inferredConstraintOptionIds,
  };

  return {
    pageType,
    recognitionSummary: payload.recognitionSummary?.trim() || undefined,
    dimensions,
    constraintOptionIds,
    spokenConstraints,
    inputConstraints,
    residualNotes: payload.residualNotes,
  };
}

function normalizeBriefDimensions(payload: BriefPayload): NonNullable<AiBriefResult["dimensions"]> {
  const source = payload.dimensions ?? payload.intentDimensions ?? payload.questions ?? payload.options;
  const rawDimensions = dimensionsFromUnknown(source);
  return INTENT_IDS.map((dimensionId) => {
    const raw = rawDimensions.find((item) => readDimensionId(item) === dimensionId);
    if (!raw) {
      return {
        id: dimensionId,
        question: defaultBriefQuestion(dimensionId),
        options: [],
      };
    }
    return {
      id: dimensionId,
      title: readString(raw, "title"),
      question: readString(raw, "question") || defaultBriefQuestion(dimensionId),
      options: normalizeBriefOptions(readUnknownProperty(raw, "options"), dimensionId),
    };
  });
}

function dimensionsFromUnknown(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    return INTENT_IDS.map((id) => {
      const item = value[id];
      return isRecord(item) ? { ...item, id } : { id, options: item };
    });
  }
  return [];
}

function normalizeBriefOptions(value: unknown, dimensionId: DimensionId): OptionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === "string") {
        return briefOptionFromParts(dimensionId, item, undefined, index);
      }
      if (!isRecord(item)) return null;
      const label = readString(item, "label") || readString(item, "name") || readString(item, "text") || readString(item, "value");
      if (!label) return null;
      const id = readString(item, "id") || `ai-${dimensionId}-${normalizeId(label) || index + 1}`;
      const reason = readString(item, "reason") || readString(item, "knowledge") || readString(item, "why");
      const normalizedMeaning = readString(item, "normalizedMeaning") || readString(item, "meaning") || label;
      const constraints = readStringArray(item.constraints) ?? readStringArray(item.generationRules) ?? [];
      return {
        id,
        label,
        reason,
        knowledge: reason ?? normalizedMeaning,
        source: "ai-generated",
        normalizedMeaning,
        constraints,
        generationRules: readStringArray(item.generationRules) ?? constraints,
      };
    })
    .filter((item): item is OptionItem => Boolean(item))
    .slice(0, 3);
}

function briefOptionFromParts(dimensionId: DimensionId, label: string, reason: string | undefined, index: number): OptionItem {
  return {
    id: `ai-${dimensionId}-${normalizeId(label) || index + 1}`,
    label,
    reason,
    knowledge: reason ?? label,
    source: "ai-generated",
    normalizedMeaning: label,
    constraints: [],
  };
}

function readDimensionId(value: unknown): DimensionId | undefined {
  if (!isRecord(value)) return undefined;
  const id = readString(value, "id") || readString(value, "dimensionId") || readString(value, "key");
  return INTENT_IDS.find((item) => item === id);
}

function defaultBriefQuestion(id: DimensionId) {
  if (id === "targetUser") return "最主要的用户群体是谁？";
  if (id === "coverage") return "要突出什么？";
  return "最核心的感觉是什么？";
}

function sectionLabel(section: unknown, fallback: string) {
  if (!isRecord(section)) return fallback;
  return (
    readString(section, "content") ||
    readString(section, "title") ||
    readString(section, "role") ||
    readString(section, "label") ||
    fallback
  );
}

function normalizeContentModules(
  plan: NonNullable<AiMechanismResult["synthesizedPlans"]>[number],
): NonNullable<AiMechanismResult["synthesizedPlans"]>[number]["contentModules"] {
  const fromAi = Array.isArray(plan.contentModules)
    ? plan.contentModules
        .map((item, index) => ({
          id: item.id || `${plan.id}-module-${index + 1}`,
          label: formatContentModuleLabel(item.label?.trim() || item.purpose?.trim() || `内容模块 ${index + 1}`),
          purpose: item.purpose,
          placement: item.placement || item.sectionId || `section-${index + 1}`,
          sectionId: item.sectionId || item.placement || `section-${index + 1}`,
          source: item.source ?? ("ai-generated" as const),
          reason: item.reason,
        }))
        .filter((item) => item.label)
    : [];
  if (fromAi.length) return fromAi;

  const sectionSource = Array.isArray(plan.sections) && plan.sections.length ? plan.sections : plan.structure ?? [];
  return sectionSource.slice(0, 8).map((section, index) => {
    const label = formatContentModuleLabel(typeof section === "string" ? section : sectionLabel(section, `内容模块 ${index + 1}`));
    const sectionId = isRecord(section)
      ? readString(section, "role") || readString(section, "sectionId") || `section-${index + 1}`
      : `section-${index + 1}`;
    return {
      id: `${plan.id}-module-${index + 1}`,
      label,
      placement: sectionId,
      sectionId,
      source: "ai-generated" as const,
      reason: isRecord(section) ? readString(section, "why") : undefined,
    };
  });
}

function clampPlanNote(text: string | undefined, max: number, fallback: string) {
  const trimmed = (text ?? fallback).trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

const WIREFRAME_VARIANTS = [
  {
    previewWireframe: { frame: "demo-first", hero: "product-demo", body: "feature-showcase-then-proof", density: "balanced" },
    sectionLayouts: ["product-demo-panel", "feature-grid", "use-case-steps", "testimonial-strip", "soft-cta-band"],
    componentPatterns: { navigation: "top-nav", hero: "interactive-demo", showcase: "feature-grid", finalAction: "soft-contact-band" },
    pageFrame: { navigation: "顶部导航", shell: "产品演示首屏+功能宫格", footer: "轻量联系带" },
    contentFlowPattern: "demo-first",
  },
  {
    previewWireframe: { frame: "split-proof", hero: "proof-first", body: "proof-service-process", density: "balanced" },
    sectionLayouts: ["claim-proof-split", "proof-card-grid", "step-list", "faq-accordion", "consultation-band"],
    componentPatterns: { navigation: "top-nav", hero: "claim-proof-split", proof: "proof-card-grid", finalAction: "consultation-band" },
    pageFrame: { navigation: "顶部导航", shell: "左右分栏：主张与背书并列", footer: "咨询转化区" },
    contentFlowPattern: "proof-first",
  },
  {
    previewWireframe: { frame: "bento-story", hero: "structured-copy", body: "story-bento-then-action", density: "spacious" },
    sectionLayouts: ["hero-copy-split", "bento-feature-grid", "story-band", "numbered-process", "cta-band"],
    componentPatterns: { navigation: "top-nav", hero: "structured-hero", showcase: "bento-masonry", finalAction: "cta-footer" },
    pageFrame: { navigation: "顶部导航", shell: "叙事首屏+不规则功能宫格", footer: "强转化底栏" },
    contentFlowPattern: "story-first",
  },
] as const;

const ARCHITECTURE_STRATEGIES = [
  { wireframeIndex: 0, reorderPattern: /作品|案例|展示|对话|演示|预览|效果|功能|亮点|核心/ },
  { wireframeIndex: 1, reorderPattern: /评价|反馈|证明|资质|家长|信任|口碑|背书|用户/ },
  { wireframeIndex: 2, reorderPattern: /故事|情感|价值|场景|叙事|流程|报名|预约|特色|课程/ },
] as const;

const PLAN_ARCHETYPE_VARIANTS = [
  {
    title: "先看代表作品，再了解服务",
    structure: ["代表作品", "服务介绍", "合作流程", "客户反馈", "联系合作"],
    layoutRhythm: "作品展示 → 服务能力 → 流程说明 → 社会证明 → 行动入口",
    reason: "适合陌生访客先判断风格是否匹配，再愿意了解服务细节与报价。",
    summary: "作品先行，降低第一眼判断成本。",
    pageArchitecture: "以视觉作品建立第一印象，再逐层展开服务与转化入口",
    firstScreen: { layout: "大图作品展示", priority: "代表作", secondary: "风格标签", action: "浏览更多作品" },
    contentFlow: { pattern: "gallery-first", browsePattern: "纵向浏览作品集", proofPosition: "中段客户反馈", actionPath: "联系合作" },
  },
  {
    title: "先证明可靠，再讲服务内容",
    structure: ["价值主张", "资质证明", "核心服务", "成功案例", "预约咨询"],
    layoutRhythm: "价值判断 → 信任背书 → 服务说明 → 案例佐证 → 咨询转化",
    reason: "适合谨慎型用户，需要先建立信任再愿意深入了解服务细节。",
    summary: "信任前置，降低决策顾虑。",
    pageArchitecture: "首屏亮出主张与背书，中段展开服务，末段推动咨询",
    firstScreen: { layout: "主张与背书并列", priority: "核心价值", secondary: "资质证明", action: "预约咨询" },
    contentFlow: { pattern: "proof-first", browsePattern: "自上而下建立信任", proofPosition: "首屏与中段", actionPath: "预约咨询" },
  },
  {
    title: "先讲清价值，再推动行动",
    structure: ["问题共鸣", "解决方案", "产品能力", "价格权益", "立即咨询"],
    layoutRhythm: "痛点共鸣 → 方案阐释 → 能力展示 → 权益说明 → 行动入口",
    reason: "适合已有明确需求、需要快速理解价值并做出行动决策的用户。",
    summary: "价值叙事清晰，缩短决策路径。",
    pageArchitecture: "叙事式展开价值链条，末段集中转化",
    firstScreen: { layout: "痛点与方案对照", priority: "核心收益", secondary: "解决方案", action: "立即咨询" },
    contentFlow: { pattern: "conversion-first", browsePattern: "线性阅读价值链", proofPosition: "能力段后", actionPath: "立即咨询" },
  },
] as const;

type SynthesizedPlan = NonNullable<AiMechanismResult["synthesizedPlans"]>[number];

function buildPlanInferenceCorpus(plan: SynthesizedPlan) {
  return [
    plan.title,
    plan.summary,
    plan.reason,
    plan.pageArchitecture,
    plan.layoutRhythm,
    plan.decisionPath,
    ...(plan.structure ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

function scoreWireframeVariant(plan: SynthesizedPlan, variantIndex: number, binding?: IntentMechanismBinding) {
  const corpus = buildPlanInferenceCorpus(plan);
  const lead = plan.structure?.[0] ?? "";
  const strategy = ARCHITECTURE_STRATEGIES[variantIndex];
  let score = 0;

  if (strategy?.reorderPattern.test(lead)) score += 28;
  if (strategy?.reorderPattern.test(corpus)) score += 14;

  const variant = WIREFRAME_VARIANTS[variantIndex];
  if (variantIndex === 0 && /演示|功能|产品|亮点|能力|对话|试用|demo|核心能力/.test(corpus)) score += 20;
  if (variantIndex === 1 && /证明|背书|评价|资质|信任|口碑|主张|可靠|并列|分栏|双栏/.test(corpus)) score += 20;
  if (variantIndex === 2 && /故事|叙事|情感|宫格|价值|场景|痛点|方案|bento|杂志|转化/.test(corpus)) score += 20;

  if (variant.contentFlowPattern && corpus.toLowerCase().includes(variant.contentFlowPattern.replace(/-/g, ""))) {
    score += 10;
  }

  if (binding) {
    score += Math.min(18, Math.round(scoreInfoPlanAgainstIntent(plan, binding) * 0.35));
    const hints = binding.recommendedFlowHints.join(" ");
    if (variantIndex === 0 && /demo|product|tool|operate/.test(hints)) score += 8;
    if (variantIndex === 1 && /proof|trust/.test(hints)) score += 8;
    if (variantIndex === 2 && /editorial|brand|narrative|conversion/.test(hints)) score += 8;
  }

  return score;
}

function inferWireframeVariantIndex(
  plan: SynthesizedPlan,
  binding?: IntentMechanismBinding,
  avoidIndices: Iterable<number> = [],
) {
  const avoid = new Set(avoidIndices);
  const ranked = WIREFRAME_VARIANTS.map((_, index) => ({
    index,
    score: scoreWireframeVariant(plan, index, binding),
  })).sort((a, b) => b.score - a.score);
  return ranked.find((item) => !avoid.has(item.index))?.index ?? ranked[0]?.index ?? 0;
}

function scorePlanArchetype(plan: SynthesizedPlan, archetypeIndex: number) {
  const corpus = buildPlanInferenceCorpus(plan);
  const archetype = PLAN_ARCHETYPE_VARIANTS[archetypeIndex];
  let score = 0;
  for (const label of archetype.structure) {
    if (corpus.includes(label)) score += 4;
  }
  if (archetypeIndex === 0 && /作品|案例|展示|代表|风格|portfolio|gallery/i.test(corpus)) score += 18;
  if (archetypeIndex === 1 && /证明|信任|背书|资质|可靠|口碑|评价/.test(corpus)) score += 18;
  if (archetypeIndex === 2 && /价值|痛点|方案|转化|权益|咨询|行动|决策/.test(corpus)) score += 18;
  if (plan.title && archetype.title && normalizeStructureLabel(plan.title).includes(normalizeStructureLabel(archetype.title).slice(0, 4))) {
    score += 8;
  }
  return score;
}

function inferPlanArchetypeIndex(plan: SynthesizedPlan) {
  const ranked = PLAN_ARCHETYPE_VARIANTS.map((_, index) => ({
    index,
    score: scorePlanArchetype(plan, index),
  })).sort((a, b) => b.score - a.score);
  return ranked[0]?.index ?? 0;
}

function pickArchitectureStrategyIndex(
  plan: SynthesizedPlan,
  binding?: IntentMechanismBinding,
  avoidIndices: Iterable<number> = [],
) {
  const avoid = new Set(avoidIndices);
  const corpus = buildPlanInferenceCorpus(plan);
  const lead = plan.structure?.[0] ?? "";
  const ranked = ARCHITECTURE_STRATEGIES.map((strategy, index) => {
    let score = 0;
    if (strategy.reorderPattern.test(lead)) score += 30;
    if (strategy.reorderPattern.test(corpus)) score += 16;
    if (index === 0 && binding?.coverageLeadPattern.test(lead)) score += 12;
    if (avoid.has(index)) score -= 40;
    return { index, score };
  }).sort((a, b) => b.score - a.score);
  return ranked.find((item) => !avoid.has(item.index))?.index ?? ranked[0]?.index ?? 0;
}

function isGenericSectionLayout(layout: string) {
  return !layout || layout === "首屏结构" || layout === "内容区块" || /^section-\d+$/i.test(layout);
}

function normalizeStructureLabel(label: string) {
  return label.replace(/\s+/g, "").toLowerCase();
}

function structureOverlap(a: string[], b: string[]) {
  const setA = new Set(a.map(normalizeStructureLabel));
  const setB = new Set(b.map(normalizeStructureLabel));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }
  return intersection / Math.max(setA.size, setB.size, 1);
}

function structureOrderSimilarity(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const minLen = Math.min(a.length, b.length);
  let samePosition = 0;
  for (let index = 0; index < minLen; index += 1) {
    if (normalizeStructureLabel(a[index]) === normalizeStructureLabel(b[index])) samePosition += 1;
  }
  return samePosition / minLen;
}

function planStructureLabels(plan: NonNullable<AiMechanismResult["synthesizedPlans"]>[number]) {
  if (Array.isArray(plan.structure) && plan.structure.length) return plan.structure;
  return (normalizeContentModules(plan) ?? []).map((module) => module.label);
}

function reorderModulesByPattern<T extends { label: string }>(modules: T[], pattern: RegExp): T[] {
  const index = modules.findIndex((module) => pattern.test(module.label));
  if (index <= 0) return [...modules];
  const next = [...modules];
  const [item] = next.splice(index, 1);
  return [item, ...next];
}

function plansShareSameModulePool(plans: NonNullable<AiMechanismResult["synthesizedPlans"]>) {
  if (plans.length < 2 || !plans[0]) return false;
  const base = planStructureLabels(plans[0]).map(normalizeStructureLabel);
  return plans.every((plan) =>
    structureOverlap(base, planStructureLabels(plan)) >= 0.82 &&
    structureOrderSimilarity(base, planStructureLabels(plan)) >= 0.72,
  );
}

function wireframeSignature(plan: NonNullable<AiMechanismResult["synthesizedPlans"]>[number]) {
  const preview = plan.previewWireframe ?? {};
  return `${readText(preview.hero)}|${readText(preview.body)}`;
}

function needsArchitecturalEnforcement(plans: NonNullable<AiMechanismResult["synthesizedPlans"]>) {
  if (plansShareSameModulePool(plans)) return true;
  for (let index = 0; index < plans.length; index += 1) {
    for (let prior = 0; prior < index; prior += 1) {
      const overlap = structureOverlap(planStructureLabels(plans[index]), planStructureLabels(plans[prior]));
      const orderSim = structureOrderSimilarity(planStructureLabels(plans[index]), planStructureLabels(plans[prior]));
      if (overlap >= 0.82 && orderSim >= 0.72 && wireframeSignature(plans[index]) === wireframeSignature(plans[prior])) {
        return true;
      }
    }
  }
  return false;
}

function applyArchitectureStrategy(
  plan: SynthesizedPlan,
  index: number,
  binding?: IntentMechanismBinding,
  avoidStrategyIndices: number[] = [],
) {
  const strategyIndex = pickArchitectureStrategyIndex(plan, binding, avoidStrategyIndices);
  const strategy = ARCHITECTURE_STRATEGIES[strategyIndex];
  const variant = WIREFRAME_VARIANTS[strategy.wireframeIndex];
  const archetype = PLAN_ARCHETYPE_VARIANTS[inferPlanArchetypeIndex(plan)];
  const leadPattern = index === 0 && binding ? binding.coverageLeadPattern : strategy.reorderPattern;
  const modules = reorderModulesByPattern(normalizeContentModules(plan) ?? [], leadPattern);
  const structure = modules.map((module) => module.label);
  const sections = structure.map((content, sectionIndex) => ({
    role: sectionIndex === 0 ? "hero" : `section-${sectionIndex + 1}`,
    layout: variant.sectionLayouts[sectionIndex % variant.sectionLayouts.length],
    content,
    why:
      sectionIndex === 0
        ? `首屏突出「${content}」，采用${
            variant.previewWireframe.hero === "product-demo"
              ? "产品演示"
              : variant.previewWireframe.hero === "proof-first"
                ? "背书证明"
                : "叙事宫格"
          }骨架。`
        : "承接上一区块，推进浏览与决策。",
  }));

  return {
    ...plan,
    structure,
    contentModules: modules.map((module, moduleIndex) => ({
      ...module,
      sectionId: sections[moduleIndex]?.role ?? `section-${moduleIndex + 1}`,
    })),
    sections,
    layoutRhythm: structure.join(" → "),
    pageFrame: { ...variant.pageFrame, ...(plan.pageFrame ?? {}) },
    previewWireframe: { ...variant.previewWireframe, ...(plan.previewWireframe ?? {}) },
    componentPatterns: { ...variant.componentPatterns, ...(plan.componentPatterns ?? {}) },
    firstScreen: {
      ...archetype.firstScreen,
      ...(plan.firstScreen ?? {}),
      layout: readText((plan.firstScreen as Record<string, unknown> | undefined)?.layout) || archetype.firstScreen.layout,
      priority: readText((plan.firstScreen as Record<string, unknown> | undefined)?.priority) || structure[0],
      action: structure.at(-1) ?? archetype.firstScreen.action,
    },
    contentFlow: {
      ...archetype.contentFlow,
      pattern: variant.contentFlowPattern,
      browsePattern: structure.slice(0, 3).join(" → "),
      actionPath: structure.at(-1) ?? archetype.contentFlow.actionPath,
    },
  };
}

function enforceArchitecturalDiversity(
  plans: NonNullable<AiMechanismResult["synthesizedPlans"]>,
  binding?: IntentMechanismBinding,
) {
  const usedStrategies: number[] = [];
  const base = needsArchitecturalEnforcement(plans)
    ? plans.map((plan, index) => {
        const next = applyArchitectureStrategy(plan, index, binding, usedStrategies);
        usedStrategies.push(pickArchitectureStrategyIndex(next, binding));
        return next;
      })
    : plans;
  return enrichPlanWireframeDiversity(base, binding);
}

function applyPlanArchetype(
  plan: SynthesizedPlan,
  keepNarrative = false,
) {
  const archetype = PLAN_ARCHETYPE_VARIANTS[inferPlanArchetypeIndex(plan)];
  return {
    ...plan,
    structure: [...archetype.structure],
    layoutRhythm: archetype.layoutRhythm,
    title: archetype.title,
    reason: keepNarrative && plan.reason ? plan.reason : archetype.reason,
    summary: keepNarrative && plan.summary ? plan.summary : archetype.summary,
    pageArchitecture: plan.pageArchitecture || archetype.pageArchitecture,
    firstScreen: { ...archetype.firstScreen, ...(plan.firstScreen ?? {}) },
    contentFlow: { ...archetype.contentFlow, ...(plan.contentFlow ?? {}) },
  };
}

function ensureDistinctStructures(
  plans: NonNullable<AiMechanismResult["synthesizedPlans"]>,
  binding?: IntentMechanismBinding,
) {
  const result = plans.map((plan) => ({ ...plan, structure: [...(plan.structure ?? [])] }));
  const usedStrategies: number[] = [];
  for (let index = 0; index < result.length; index += 1) {
    for (let prior = 0; prior < index; prior += 1) {
      const overlap = structureOverlap(planStructureLabels(result[index]), planStructureLabels(result[prior]));
      const orderSim = structureOrderSimilarity(planStructureLabels(result[index]), planStructureLabels(result[prior]));
      if (overlap >= 0.82 && orderSim >= 0.72) {
        const next = applyArchitectureStrategy(result[index], index, binding, usedStrategies);
        usedStrategies.push(pickArchitectureStrategyIndex(next, binding));
        Object.assign(result[index], next);
        break;
      }
    }
  }
  return result;
}

function enrichPlanWireframeDiversity(
  plans: NonNullable<AiMechanismResult["synthesizedPlans"]>,
  binding?: IntentMechanismBinding,
) {
  return plans.map((plan) => {
    const variantIndex = inferWireframeVariantIndex(plan, binding);
    const variant = WIREFRAME_VARIANTS[variantIndex];
    const structureLabels = Array.isArray(plan.structure) ? plan.structure : [];

    const sections = Array.isArray(plan.sections) ? plan.sections.map((section) => ({ ...(section as Record<string, unknown>) })) : [];
    const sectionSource =
      sections.length > 0
        ? sections
        : structureLabels.map((content, sectionIndex) => ({
            role: sectionIndex === 0 ? "hero" : `section-${sectionIndex + 1}`,
            layout: variant.sectionLayouts[sectionIndex % variant.sectionLayouts.length],
            content,
            why: "由信息组织方案推导的页面区块。",
          }));

    const enrichedSections = sectionSource.map((section, sectionIndex) => {
      const layout = typeof section.layout === "string" ? section.layout : "";
      const variantLayout = variant.sectionLayouts[sectionIndex % variant.sectionLayouts.length];
      return {
        ...section,
        layout: isGenericSectionLayout(layout) ? variantLayout : layout,
      };
    });

    const mergedPatterns = {
      ...variant.componentPatterns,
      ...(plan.componentPatterns ?? {}),
    };

    const existingFrame = typeof plan.pageFrame === "object" && plan.pageFrame ? plan.pageFrame : {};
    const existingPreview = plan.previewWireframe ?? {};

    return {
      ...plan,
      previewWireframe: {
        ...variant.previewWireframe,
        ...existingPreview,
      },
      pageFrame: {
        ...variant.pageFrame,
        ...existingFrame,
      },
      componentPatterns: mergedPatterns,
      sections: enrichedSections,
    };
  });
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function ensureDistinctTitles(plans: NonNullable<AiMechanismResult["synthesizedPlans"]>) {
  const titles = plans.map((plan) => formatPlanTitle(plan as InfoPlan));
  if (new Set(titles).size === titles.length) return plans;
  return plans.map((plan, index) => {
    const base = plan.title?.trim() || formatPlanTitle(plan as InfoPlan);
    const suffixed = base.length <= 6 ? `${base}·备选${index + 1}` : `${base.slice(0, 6)}·${index + 1}`;
    return { ...plan, title: suffixed };
  });
}

export function normalizeSynthesizedPlans(
  plans: AiMechanismResult["synthesizedPlans"],
  binding?: IntentMechanismBinding,
): AiMechanismResult["synthesizedPlans"] {
  if (!plans?.length) return plans;
  const diversified = ensureDistinctTitles(
    ensureDistinctStructures(enforceArchitecturalDiversity(plans.slice(0, 3), binding), binding),
  );
  return diversified.map((plan, index) => {
    const archetypeIndex = inferPlanArchetypeIndex(plan);
    const variantIndex = inferWireframeVariantIndex(plan, binding);
    const archetype = PLAN_ARCHETYPE_VARIANTS[archetypeIndex];
    const variant = WIREFRAME_VARIANTS[variantIndex];
    const id = plan.id || `ai-info-plan-${index + 1}`;
    const structure =
      Array.isArray(plan.structure) && plan.structure.length ? plan.structure : [...archetype.structure];
    const sections =
      Array.isArray(plan.sections) && plan.sections.length
        ? plan.sections
        : structure.map((content, sectionIndex) => ({
            role: sectionIndex === 0 ? "hero" : `section-${sectionIndex + 1}`,
            layout: sectionIndex === 0 ? "首屏结构" : "内容区块",
            content,
            why: "由 AI 根据当前输入补齐的信息模块。",
          }));
    const normalized = {
      ...plan,
      id,
      title: plan.title || `信息架构方案 ${index + 1}`,
      structure,
      sections,
      reason: clampPlanNote(sanitizeChineseNote(plan.reason || ""), 56, "根据用户决策路径推荐的信息组织方式。"),
      summary: clampPlanNote(sanitizeChineseNote(plan.summary || plan.reason || ""), 40, "根据当前输入生成的信息组织方案。"),
      prompt: plan.prompt || plan.pageArchitecture || plan.summary || structure.join(" / "),
      source: plan.source ?? "ai-generated",
      pageArchitecture: clampPlanNote(plan.pageArchitecture || structure.join(" -> "), 60, structure.join(" -> ")),
      layoutRhythm: plan.layoutRhythm ? sanitizeChineseNote(plan.layoutRhythm) : archetype.layoutRhythm,
      pageFrame: {
        ...variant.pageFrame,
        ...(typeof plan.pageFrame === "object" && plan.pageFrame ? plan.pageFrame : {}),
      },
      firstScreen: plan.firstScreen ?? { ...archetype.firstScreen, layout: structure[0] },
      contentFlow: {
        ...archetype.contentFlow,
        ...(plan.contentFlow ?? {}),
        pattern:
          (plan.contentFlow && typeof plan.contentFlow === "object"
            ? readText((plan.contentFlow as Record<string, unknown>).pattern)
            : "") || variant.contentFlowPattern,
      },
      componentPatterns: {
        ...variant.componentPatterns,
        ...(plan.componentPatterns ?? {}),
      },
      previewWireframe: {
        ...variant.previewWireframe,
        ...(plan.previewWireframe ?? {}),
      },
      contentModules: normalizeContentModules({ ...plan, id, structure, sections }),
      generationRules: plan.generationRules?.length ? plan.generationRules : ["最终页面必须体现所选信息架构和功能模块标签。"],
      forbiddenPatterns: plan.forbiddenPatterns?.length ? plan.forbiddenPatterns : ["不要只生成 hero + 三卡片 + CTA 的模板页。"],
    };
    const titled = {
      ...normalized,
      title: formatPlanTitle(normalized as InfoPlan),
      prompt: normalized.prompt || normalized.pageArchitecture || normalized.summary || structure.join(" / "),
    };
    const shellRule = `页面壳层锁定为「${describePlanShell(titled as InfoPlan)}」，须与信息组织预览一致。`;
    return {
      ...titled,
      generationRules: [
        ...(titled.generationRules ?? []).filter((rule) => !/页面壳层锁定/.test(rule)),
        shellRule,
      ],
    };
  });
}

export async function prepareMechanism(input: {
  rawInput: string;
  intentSummary: string;
  intent?: IntentState;
  inputConstraints: string[];
  spokenConstraints?: SpokenConstraint[];
  plans: Array<{
    id: string;
    title: string;
    structure: string[];
    summary: string;
    reason?: string;
    pageArchitecture?: string;
    pageFrame?: Record<string, unknown>;
    firstScreen?: Record<string, unknown>;
    contentFlow?: Record<string, unknown>;
    componentPatterns?: Record<string, unknown>;
    layoutDecisions?: Record<string, unknown>;
    sections?: Array<Record<string, unknown>>;
    contentModules?: NonNullable<AiMechanismResult["synthesizedPlans"]>[number]["contentModules"];
    previewWireframe?: Record<string, unknown>;
    userEdit?: string;
  }>;
  userEdits?: Record<string, string>;
  signal?: AbortSignal;
}): Promise<AiMechanismResult> {
  const binding = buildIntentMechanismBinding({
    intent: input.intent,
    rawInput: input.rawInput,
    spokenConstraints: input.spokenConstraints,
  });
  const result = await deepseekChat({
    signal: input.signal,
    model: getDeepSeekFastModel(),
    temperature: 0.32,
    maxTokens: 8192,
    stream: false,
    messages: [
      { role: "system", content: MECHANISM_SYSTEM_V2 },
      {
        role: "user",
        content: JSON.stringify({
          rawInput: input.rawInput,
          intentSummary: input.intentSummary,
          intentBinding: binding,
          designIntentText: binding?.designIntentText ?? input.intent?.designIntentText,
          inputConstraints: input.inputConstraints,
          userSpokenConstraints: input.spokenConstraints ?? [],
          plans: input.plans,
          plansEmpty: input.plans.length === 0,
          userEdits: input.userEdits,
          uiVisualSlots: Object.keys(VISUAL_OPTION_CATALOG),
          designReference: getMechanismReferenceContext({
            rawInput: input.rawInput,
            intentSummary: input.intentSummary,
            intent: input.intent,
            compact: true,
          }),
        }),
      },
    ],
  });

  const payload = extractJsonObject<MechanismPayload>(result.content);
  const visualSelections = normalizeVisualSelections(payload.visualSelections);
  const synthesizedPlans = normalizeSynthesizedPlans(payload.synthesizedPlans, binding);
  if (!synthesizedPlans?.length) {
    throw new Error("AI 未返回信息组织方案 synthesizedPlans");
  }
  const recommendedPlanId = resolveRecommendedPlanId(
    synthesizedPlans,
    binding,
    payload.recommendedPlanId ?? synthesizedPlans[0]?.id,
  );
  return {
    recommendedPlanId,
    visualSelections,
    visualExtended: payload.visualExtended,
    planRefinements: payload.planRefinements,
    synthesizedPlans,
  };
}

const VISUAL_GRAMMAR_SYSTEM = `你是网页视觉语法设计师。根据用户意图、已选信息组织方案、系统筛出的配色，以及案例库教师范例，为字体/卡片样式/内容密度三个维度各生成 3 个互不相同的可选项（无需输出 color）。
只输出 JSON，不要 markdown，不要解释。JSON 必须紧凑，禁止冗长段落。
要求：
- 案例库 teacher.examples 仅供学习气质与参数写法，禁止照搬标题、色值或理由。
- 必须输出 visualSelections 中的 font / card / density；每个维度恰好 3 个 options，以及 recommendedOptionId。
- color 字段可省略（系统会从 visual-option-presets + ux-pro 色板库按意图筛选）。
- 每个 option 仅含：id（ai-<dimension>-1 形式）、label（风格短名，全中文 ≤8 字）、reason（≤36 字）、source="ai-generated"、tokenHints、previewRules。不要输出 generationRules。
- font 维度的 label 必须从「无衬线体」「粗黑体」「衬线体」三选一，且 tokenHints 的 heading/body 字体栈必须与 label 一致（衬线体标题用 Georgia/Times，粗黑体标题用展示黑体，无衬线体标题正文均用无衬线）；reason 禁止同时出现多种字体类型名称。
- card 从「扁平无影」「轻阴影」「描边分组」「强阴影」选一；density 从「疏松留白」「中等密度」「紧凑密集」选一。
- 每个维度的推荐项要组成一套协调的视觉方案：字体负责阅读层级，卡片负责内容分组，密度负责扫描节奏；与推荐配色气质一致。备选项要有不同取舍，不要三个维度都机械地推荐中间档。
- reason：一句话点明该选项适合哪个具体模块或浏览任务，以及它改善什么；禁止套话与案例库原文。
- font 仅含 heading/body 两个 font-family 字符串；card 的 previewRules 仅含 cardStyle（flat-hairline|soft-card|bordered|elevated）与 radiusPx 数字；density 的 previewRules 仅含 density（spacious|balanced|compact）。
- 四维选项之间要有明显差异；同一维度内 3 项也不得雷同。
- 可选 visualExtended：一句整体视觉气质（≤32 字）。
输出格式：
{
  "visualSelections": {
    "font": { "recommendedOptionId": "...", "options": [...] },
    "card": { ... },
    "density": { ... }
  },
  "visualExtended": "..."
}`;

type VisualGrammarPayload = {
  visualSelections?: MechanismPayload["visualSelections"];
  visualExtended?: string;
};

export function mergeVisualGrammarSelections(
  aiSelections: Partial<Record<VisualId, AiVisualSelection>>,
  referenceSelections: Partial<Record<VisualId, AiVisualSelection>>,
): Partial<Record<VisualId, AiVisualSelection>> {
  const merged = { ...aiSelections };
  for (const dimensionId of VISUAL_DIMENSION_IDS) {
    const reference = referenceSelections[dimensionId];
    if (!reference?.options?.length) continue;
    if (dimensionId === "color" || (merged[dimensionId]?.options?.length ?? 0) < VISUAL_DIMENSION_INITIAL_OPTIONS) {
      merged[dimensionId] = reference;
    }
  }
  return merged;
}

const COLOR_COPY_SYSTEM = `你是网页配色文案师。根据色值与页面上下文，为案例库筛出的色彩方案写「色彩风格名」和选配理由。
只输出 JSON，不要 markdown，不要解释。
规则：
- 必须体现用户已选「核心感觉」与输入约束（如活力/卡通/专业/克制）；气质相反时不得用克制/沉稳/暖灰等命名
- 每个 option 必须保留原 id，不得改色值或 tokenHints
- label：色彩/氛围风格名，全中文 ≤8 字。必须与实际主色色相一致（橙/红主色不得写蓝/青，蓝主色不得写橙/暖）
- 禁止写「白底」「大图」「界面」「结构」「网格」「画廊」等版式词
- reason：≤36 字，说明主辅色气质、情绪与适合场景，可提及信息组织，禁止照搬版式描述（如「让用户先看作品」）
- knowledge：≤48 字，说明配色逻辑（主色作用、对比度、情绪）
输出：{ "options": [{ "id": "...", "label": "...", "reason": "...", "knowledge": "..." }] }`;

type ColorCopyPayload = {
  options?: Array<{ id: string; label?: string; reason?: string; knowledge?: string }>;
};

async function enrichReferenceColorCopyWithAi(
  colorSelection: AiVisualSelection,
  context: {
    rawInput: string;
    intentSummary: string;
    infoPlan: InfoPlan;
    intent?: IntentState;
    spokenConstraints?: SpokenConstraint[];
    signal?: AbortSignal;
  },
): Promise<AiVisualSelection> {
  const options = colorSelection.options ?? [];
  if (!options.length) return colorSelection;

  const result = await deepseekChat({
    signal: context.signal,
    model: getDeepSeekFastModel(),
    temperature: 0.35,
    maxTokens: 1536,
    stream: false,
    messages: [
      { role: "system", content: COLOR_COPY_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          rawInput: context.rawInput,
          intentSummary: context.intentSummary,
          intentColorMood: resolveIntentColorMood({
            intent: context.intent,
            spokenConstraints: context.spokenConstraints,
            rawInput: context.rawInput,
          }),
          selectedInfoArchitecture: {
            id: context.infoPlan.id,
            title: context.infoPlan.title,
            summary: context.infoPlan.summary,
          },
          userSpokenConstraints: context.spokenConstraints ?? [],
          colorOptions: options.map((option) => ({
            id: option.id,
            primary: option.tokenHints?.primary,
            secondary: option.tokenHints?.secondary,
            accent: option.tokenHints?.accent,
            background: option.tokenHints?.background,
            text: option.tokenHints?.text,
            currentLabel: option.label,
            libraryKnowledge: option.knowledge,
          })),
        }),
      },
    ],
  });

  const payload = extractJsonObject<ColorCopyPayload>(result.content);
  const byId = new Map((payload.options ?? []).map((item) => [item.id, item]));

  const mergedOptions = options.map((option) => {
    const ai = byId.get(option.id);
    if (!ai?.label?.trim() && !ai?.reason?.trim()) return option;
    const enriched = enrichVisualOption("color", {
      ...option,
      label: ai.label?.trim() || option.label,
      reason: ai.reason?.trim() || option.reason,
      knowledge: ai.knowledge?.trim() || option.knowledge,
    });
    return {
      ...enriched,
      reason: formatVisualOptionReason("color", enriched, context.infoPlan),
      knowledge: ai.knowledge?.trim() || enriched.knowledge || enriched.reason,
    };
  });

  return {
    ...colorSelection,
    options: mergedOptions,
    optionNotes: Object.fromEntries(mergedOptions.map((option) => [option.id, option.reason ?? ""])),
  };
}

export async function prepareVisualGrammar(input: {
  rawInput: string;
  intentSummary: string;
  inputConstraints: string[];
  spokenConstraints?: SpokenConstraint[];
  infoPlan: InfoPlan;
  intent?: IntentState;
  signal?: AbortSignal;
}): Promise<{ visualSelections: AiMechanismResult["visualSelections"]; visualExtended?: string }> {
  const referenceSelections = buildReferenceVisualSelections({
    infoPlan: input.infoPlan,
    rawInput: input.rawInput,
    intent: input.intent,
    spokenConstraints: input.spokenConstraints,
  });
  const result = await deepseekChat({
    signal: input.signal,
    model: getDeepSeekFastModel(),
    temperature: 0.35,
    maxTokens: 4096,
    stream: false,
    messages: [
      { role: "system", content: VISUAL_GRAMMAR_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          rawInput: input.rawInput,
          intentSummary: input.intentSummary,
          inputConstraints: input.inputConstraints,
          userSpokenConstraints: input.spokenConstraints ?? [],
          selectedInfoArchitecture: {
            id: input.infoPlan.id,
            title: input.infoPlan.title,
            summary: input.infoPlan.summary,
            structure: input.infoPlan.structure,
            pageArchitecture: input.infoPlan.pageArchitecture,
          },
          recommendedColor: referenceSelections.color?.options?.[0]
            ? {
                label: referenceSelections.color.options[0].label,
                primary: referenceSelections.color.options[0].tokenHints?.primary,
                background: referenceSelections.color.options[0].tokenHints?.background,
                accent: referenceSelections.color.options[0].tokenHints?.accent,
              }
            : undefined,
          designReference: getVisualGrammarTeacherContext({
            infoPlan: input.infoPlan,
            rawInput: input.rawInput,
            compact: true,
          }),
        }),
      },
    ],
  });

  const payload = extractVisualGrammarPayload<VisualGrammarPayload>(result.content);
  const visualContext = {
    infoPlan: input.infoPlan,
    spokenConstraints: input.spokenConstraints,
    rawInput: input.rawInput,
    intent: input.intent,
  };
  const aiSelections = normalizeVisualGrammarSelections(payload.visualSelections, visualContext);
  const normalizedReferences = normalizeVisualGrammarSelections(referenceSelections, visualContext);
  const visualSelections = mergeVisualGrammarSelections(aiSelections, normalizedReferences);

  const missingDimensions = VISUAL_DIMENSION_IDS.filter((id) => !visualSelections[id]?.options?.length);
  if (missingDimensions.length) {
    throw new Error(`AI 视觉语法不完整，缺少：${missingDimensions.join("、")}`);
  }

  const colorSelection = visualSelections.color;
  if (colorSelection?.options?.length) {
    try {
      visualSelections.color = await enrichReferenceColorCopyWithAi(colorSelection, {
        rawInput: input.rawInput,
        intentSummary: input.intentSummary,
        infoPlan: input.infoPlan,
        intent: input.intent,
        spokenConstraints: input.spokenConstraints,
        signal: input.signal,
      });
    } catch (error) {
      if (input.signal?.aborted || isBillingErrorMessage(String(error)) || isSpendBlockedGlobally()) throw error;
      // 配色文案润色失败时保留已筛选的色值与其余三个 AI 选项。
    }
  }

  return { visualSelections, visualExtended: payload.visualExtended };
}

const GENERATE_SYSTEM_V2 = `你是资深前端与网页视觉设计师。根据 brief 生成一个真实、完整、可上线观感的单文件 HTML 页面。
只输出完整 HTML 文档，以 <!doctype html> 开头，不要 markdown，不要解释。

先定骨架，再写样式。layoutGuidance.structureLock 是页面唯一的顶层内容清单：第 1 项就是首屏，后续每项各对应一个 <section>，不得另加通用 hero、重复模块或为凑数量增加 section。页眉和页脚不计入清单。
按 layoutGuidance.layoutShell 把这些 section 放入正确容器：landing 为纵向单栏；split 用 .page-layout-split 包住 .page-main 与 .page-sidebar，仅首屏与侧栏并排，主栏后续 section 恢复全宽，侧栏只收短 CTA/价格/保障；bento 首屏全宽，其余进入 .page-bento-grid；sidebar 是左导航右工作区。若某模块不适合窄栏，放回主栏，不要硬塞。
先给每个模块选一个适合内容的内部版式，再写 CSS；同一页至少两种版式节奏，且不要为追求变化破坏阅读顺序。标题、正文、图像、按钮都有明确位置；每个容器由实际内容撑开，不用固定高度或大片空盒子制造气势。
响应式是必须完成的部分：桌面主容器 max-width 约 1200px、宽度约 94%；内容网格用 repeat(auto-fit,minmax(min(100%,240px),1fr)) 或等效写法；在 900px 和 640px 附近让分栏降为单栏，禁止横向溢出和窄条竖排。密度只控制间距和可容纳的最多列数，不要求所有 .grid 固定同一列数。

优先级（从高到低，冲突时严格执行）：
0. brief.userSpokenConstraints / generationGuidance.constraintLayers — 用户原话输入约束（含归位），最高优先级
1. bindingContract — 用户已确认的意图、信息组织、视觉语法，不可协商、不可替换
2. generationGuidance.aestheticDirectives + polishChecklist — 在遵守 0/1 前提下，把页面做得精致、好看、像真实产品站
3. bindingContract.visual.styleSnippets — 必须写入 <style>；系统也会在输出后注入绑定样式，但仍应在 HTML 中体现所选气质
4. layoutGuidance.layoutShell / structureLock / pageModules — 页面壳层与模块顺序锁定
5. generationRules / forbiddenPatterns
6. rawInput / residualConstraints — 补充 bindingContract 未覆盖的细节

设计完成度要求（必须体现在 HTML/CSS 中，但不要输出设计说明）：
- 先从 brief 中提炼一个清晰的视觉概念，并用配色、字体尺度、首屏构图和组件节奏贯穿全页；禁止只是把内容塞进通用模板。
- 首屏需有内容相关的视觉焦点；工作台/管理系统用数据、控件或界面焦点，不用大幅装饰图片。
- 页面节奏要有变化：不要每个 section 都是「标题 + 三张卡片」。至少 2 个 section 使用不同结构，例如横向证明带、分栏叙事、步骤时间线、案例详情、对比表、引用证明或行动区。
- 保持真实落地站质感：统一 8px spacing 网格、清晰层级、克制阴影、真实按钮状态、精细 footer；避免 PPT 感、模板站感和线框稿感。
- 图片必须语义匹配页面主题；找不到精准图片时，用产品界面、数据面板、案例卡或排版结构补足，不要放无关办公照凑数。
- 背景可以有浅色分区、细边线、微妙纹理或低对比色块，但禁止廉价大渐变、发光球、漂浮装饰圆点和大面积空洞。

必须遵守：
- 用户选的选项 + 提示词约束可以同时满足：选项定调性，原话约束定内容与侧重点，二者冲突时以输入约束为准。
- generationGuidance.visualTone 是用户所选视觉方案的精简说明（含 hero/密度/卡片等），与 bindingContract.visual 一致执行。
- 好看不等于换风格：在已选配色/字体/卡片/密度内做层次、留白、配图与排版精致化，禁止擅自改成通用 SaaS 蓝紫风。
- bindingContract.intent：三维意图已选项必须体现在文案、案例、CTA 与信息优先级中。
- bindingContract.infoArchitecture.structureLock：顶层模块顺序严格一致，每模块一个 <section>，contentModules 全部落地；不要再造第二个 hero。
- bindingContract.infoArchitecture.layoutShell 与 layoutGuidance.layoutShell 决定当前选中方案的页面壳层（单栏 / 双栏 / 宫格 / 侧栏）；壳层由该方案的模块顺序与叙事路径推导，各方案可相同也可不同；生成页必须严格跟随**当前选中方案**的 layoutShell，不得擅自改壳层。
- bindingContract.visual：cssContract 与 styleSnippets 是视觉硬约束；selectedVisualLanguage / visualSelections 不得偏离。
- selectedInfoArchitecture.structure / sections 中的每个模块都要落成独立 section；单栏壳层时纵向连续排列，双栏壳层时按 layoutShell 主栏/侧栏分区落位；禁止只生成 hero 后下方大片空白。
- layoutGuidance 是版式硬约束：主容器 max-width 约 1120~1280px、水平居中，内容宽度约 92%~96%。
- 落地页首屏以文案 + CTA 为主；配图仅作辅助，单图 max-height 约 320px。工作台/管理系统按工具界面处理。
- 后台/工作台/管理系统（含侧边栏导航）：禁止首屏大图；顶部仅保留页面标题 + 一句说明 + 操作区，功能卡片用 grid 横排。
- 所有图标必须使用 Lucide 线性图标（<i data-lucide="home"></i> 或内联 SVG stroke 图标），禁止 emoji、禁止用图片当图标。
- 所有文案必须横排（writing-mode: horizontal-tb），禁止竖排、禁止 writing-mode: vertical-*。
- 功能卡片/快捷入口：标题+说明+按钮横排或上下结构，宽度用 grid(minmax(240px,1fr))，禁止窄高竖条卡片。
- 用户评价/证言区：头像固定约 56px 圆形，文字在右侧横排；禁止竖排、禁止把头像拉成全宽横幅图；卡片用「头像 + 文案」横排，不要挤进极窄侧栏。
- userAddedOptions 与 bindingContract 同级优先。
- 禁止线框图、灰块草稿、占位文案（「模块一」「这里放图片」）。
- 版式平衡（全局，所有页面必须遵守）：任意分栏禁止一侧极窄塞长文案、另一侧大面积空白；长内容放宽栏/整栏，窄栏仅短 CTA/价格/保障；section 内子网格用 minmax(240px,1fr)；单卡片/证言须铺满 section 宽度，禁止左上角小卡片 + 余下全空白。
- 禁止用 emoji 充当图标或配图；图标用 Lucide data-lucide；装饰摄影图用 <img src="https://images.unsplash.com/...">（带 auto=format&fit=crop&w= 参数），且单图高度不超过 320px。
- 页面需要与类型匹配的导航和页脚；落地页可用 sticky 顶部导航，工作台用侧栏或工具栏。内容 section 的数量仅由 structureLock 决定；导航横排、链接简短，不得挤成竖排。
- 卡片/案例/团队区使用 grid 布局；主按钮与次按钮样式区分；section 有合理内边距与层次，不要像 PPT 或线框原型。
- 不要把所有内容都包进浮动白色卡片；只有重复项目、对比项、案例项才用卡片，叙事区和证明区应使用更开放的版式。
- CTA、数据、引用、步骤编号、标签等关键元素要有明确视觉层级；重要信息不能淹没在等权重小字里。
- 中文排版：标题简洁（H1 一行内），正文每段 2~4 行；导航与按钮文字禁止被迫换行。
- CSS 内联在 <style>，body margin:0，响应式 grid/flex；补充 :root 变量与 hover 过渡，让页面接近真实落地站。
- 输出前按 bindingContract.acceptanceChecks、generationGuidance.polishChecklist 与 brief.qualityChecks 自查。`;

export async function generatePageHtml(input: {
  brief: string;
  enforcedStyles?: string;
  signal?: AbortSignal;
  onStreamProgress?: (chars: number) => void;
}): Promise<string> {
  let lastProgressAt = 0;
  const result = await deepseekChat({
    signal: input.signal,
    model: getDeepSeekGenerateModel(),
    temperature: 0.24,
    maxTokens: 8192,
    onChunk: input.onStreamProgress
      ? (_delta, accumulated) => {
          const now = Date.now();
          if (now - lastProgressAt < 600) return;
          lastProgressAt = now;
          input.onStreamProgress?.(accumulated.length);
        }
      : undefined,
    messages: [
      { role: "system", content: GENERATE_SYSTEM_V2 },
      { role: "user", content: input.brief },
    ],
  });

  return finalizeGeneratedHtml(result.content, { enforcedStyles: input.enforcedStyles });
}

const ORCHESTRATE_SYSTEM = `你是页面信息架构编排助手。用户正在编辑一个信息组织方案的功能内容标签，你需要重新编排页面骨架与模块区位。
只输出 JSON，不要 markdown，不要解释。
要求：
- 保持方案整体气质，但根据模块增删调整 sections、contentModules、structure、pageFrame、firstScreen、contentFlow、componentPatterns。
- 功能模块必须放入合理位置：信任类（案例/团队/资质）通常在中段证明区；联系合作在底部；价格靠近行动区；公司定位可进首屏辅助区。
- 不要机械把新增模块堆到最后；删除模块后应移除对应 section 并检查首屏是否仍合理。
- contentModules 每项含 id/label/purpose/placement/sectionId/source/reason；label 必须是全中文短词，≤8字；placement 用 identity/showcase/proof/process/pricing/action/content 等。
- sections 4-7 项，每项含 role/layout/content/why；structure 与 sections 的 content 顺序一致。
- 输出 generationRules 至少 2 条，说明本次编排约束。
输出字段：summary, pageArchitecture, pageFrame, firstScreen, contentFlow, componentPatterns, sections, contentModules, structure, generationRules`;

type OrchestratePayload = {
  summary?: string;
  pageArchitecture?: string;
  pageFrame?: Record<string, unknown>;
  firstScreen?: Record<string, unknown>;
  contentFlow?: Record<string, unknown>;
  componentPatterns?: Record<string, unknown>;
  sections?: Array<Record<string, unknown>>;
  contentModules?: ContentModulePlacement[];
  structure?: string[];
  generationRules?: string[];
};

export async function orchestrateInfoPlanModules(input: {
  rawInput: string;
  intentSummary: string;
  intent?: IntentState;
  inputConstraints: string[];
  spokenConstraints?: SpokenConstraint[];
  plan: InfoPlan;
  action: { type: "add"; label: string } | { type: "remove"; moduleId: string; label: string };
  signal?: AbortSignal;
}): Promise<Partial<InfoPlan>> {
  const result = await deepseekChat({
    signal: input.signal,
    model: getDeepSeekFastModel(),
    temperature: 0.2,
    maxTokens: 2560,
    stream: false,
    messages: [
      { role: "system", content: ORCHESTRATE_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          rawInput: input.rawInput,
          intentSummary: input.intentSummary,
          inputConstraints: input.inputConstraints,
          userSpokenConstraints: input.spokenConstraints ?? [],
          action: input.action,
          currentPlan: {
            id: input.plan.id,
            title: input.plan.title,
            summary: input.plan.summary,
            pageArchitecture: input.plan.pageArchitecture,
            pageFrame: input.plan.pageFrame,
            firstScreen: input.plan.firstScreen,
            contentFlow: input.plan.contentFlow,
            componentPatterns: input.plan.componentPatterns,
            sections: input.plan.sections,
            contentModules: input.plan.contentModules,
            structure: input.plan.structure,
          },
          designReference: getOrchestrationReferenceContext({
            rawInput: input.rawInput,
            intentSummary: input.intentSummary,
            intent: input.intent,
            infoPlan: input.plan,
          }),
        }),
      },
    ],
  });

  const payload = extractJsonObject<OrchestratePayload>(result.content);
  const contentModules =
    payload.contentModules?.map((item, index) => ({
      ...item,
      id: item.id || `${input.plan.id}-module-${index + 1}`,
      label: formatContentModuleLabel(item.label || item.purpose || ""),
      source: item.source ?? "ai-generated",
    })) ?? input.plan.contentModules;

  return {
    summary: payload.summary ?? input.plan.summary,
    pageArchitecture: payload.pageArchitecture ?? input.plan.pageArchitecture,
    pageFrame: payload.pageFrame ?? input.plan.pageFrame,
    firstScreen: payload.firstScreen ?? input.plan.firstScreen,
    contentFlow: payload.contentFlow ?? input.plan.contentFlow,
    componentPatterns: payload.componentPatterns ?? input.plan.componentPatterns,
    sections: payload.sections ?? input.plan.sections,
    contentModules,
    structure: payload.structure ?? input.plan.structure,
    generationRules: payload.generationRules?.length
      ? [...new Set([...(input.plan.generationRules ?? []), ...payload.generationRules])]
      : input.plan.generationRules,
  };
}
