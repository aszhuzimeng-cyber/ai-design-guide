import type { ContentModulePlacement, DimensionId, InfoPlan, OptionItem, OptionSignal, VisualId } from "../types";

export type AiTaskStatus = "idle" | "loading" | "done" | "error";

export type SpokenConstraintKind = "general" | "info" | "function" | "visual";

/** AI 归位：约束应影响的设计步骤（由 brief AI 输出，客户端按此路由） */
export type SpokenConstraintPlacement =
  | "intentTargetUser"
  | "intentCoverage"
  | "intentValueProposition"
  | "infoArchitecture"
  | "functionModule"
  | "visualColor"
  | "visualFont"
  | "visualCard"
  | "visualDensity"
  | "pageGeneral";

export type SpokenConstraint = {
  kind: SpokenConstraintKind;
  /** 用户原话短句，只读展示 */
  text: string;
  /** AI 语义归位：影响哪一步 */
  placement?: SpokenConstraintPlacement;
  /** AI 理解后的选项标签，如「求职用」→「招聘方/面试官」 */
  inferredLabel?: string;
  /** AI 在 dimensions 中对应选项的 id */
  mapsToOptionId?: string;
};

export type AiBriefResult = {
  pageType: string;
  recognitionSummary?: string;
  dimensions?: Array<{
    id: DimensionId;
    title?: string;
    question: string;
    options: OptionItem[];
  }>;
  constraintOptionIds: Partial<Record<DimensionId, string>>;
  inputConstraints: string[];
  spokenConstraints?: SpokenConstraint[];
  residualNotes?: string;
};

export type AiVisualSelection = {
  /** 最推荐的一项（与 recommendedOptionId 同义，保留兼容旧响应） */
  optionId: string;
  /** AI 为本维度挑选的 2～3 个候选 optionId，前端只展示这些 */
  optionIds: string[];
  recommendedOptionId?: string;
  /** 每个候选 optionId 对应一句设计说明（key 须覆盖 optionIds 中每一项） */
  optionNotes?: Partial<Record<string, string>>;
  options?: OptionItem[];
  source: OptionSignal;
  reason?: string;
};

export type AiPlanRefinement = {
  structure?: string[];
  promptPatch?: string;
  signal?: OptionSignal;
};

export type AiMechanismResult = {
  recommendedPlanId?: string;
  visualSelections: Partial<Record<VisualId, AiVisualSelection>>;
  visualExtended?: string;
  planRefinements?: Record<string, AiPlanRefinement>;
  synthesizedPlans?: Array<{
    id: string;
    title: string;
    structure: string[];
    summary: string;
    prompt: string;
    source?: "ai-generated" | "reference" | "user-added";
    reason?: string;
    risk?: string;
    pageArchitecture?: string;
    pageFrame?: Record<string, unknown>;
    firstScreen?: Record<string, unknown>;
    contentFlow?: Record<string, unknown>;
    componentPatterns?: Record<string, unknown>;
    layoutDecisions?: Record<string, unknown>;
    aboveFold?: Record<string, unknown>;
    sections?: Array<Record<string, unknown>>;
    layoutRhythm?: string;
    decisionPath?: string[];
    previewWireframe?: Record<string, unknown>;
    contentModules?: ContentModulePlacement[];
    generationRules?: string[];
    forbiddenPatterns?: string[];
  }>;
};

export type AiVisualGrammarResult = {
  visualSelections: Partial<Record<VisualId, AiVisualSelection>>;
  visualExtended?: string;
  planId: string;
  key: string;
  source: "ai" | "reference-fallback";
};

export type AiProjectState = {
  brief?: AiBriefResult;
  mechanism?: AiMechanismResult;
  visualGrammar?: AiVisualGrammarResult;
  mechanismSource?: "ai" | "reference-fallback";
  visualGrammarSource?: "ai" | "reference-fallback";
  briefSource?: "ai" | "reference-fallback";
  generatedHtml?: string;
  /** 流式生成时已输出的字符数，用于进度展示 */
  generateStreamChars?: number;
  generationKey?: string;
  mechanismKey?: string;
  tasks: {
    brief: AiTaskStatus;
    mechanism: AiTaskStatus;
    visual: AiTaskStatus;
    generate: AiTaskStatus;
  };
  errors: {
    brief?: string;
    mechanism?: string;
    visual?: string;
    generate?: string;
  };
  /** API 余额不足后锁定自动调用，避免重试风暴 */
  billingBlocked?: boolean;
};

export function createAiState(): AiProjectState {
  return {
    tasks: { brief: "idle", mechanism: "idle", visual: "idle", generate: "idle" },
    errors: {},
  };
}

export type MechanismPlanInput = Pick<
  InfoPlan,
  | "id"
  | "title"
  | "structure"
  | "summary"
  | "prompt"
  | "source"
  | "reason"
  | "risk"
  | "pageArchitecture"
  | "pageFrame"
  | "firstScreen"
  | "contentFlow"
  | "componentPatterns"
  | "layoutDecisions"
  | "aboveFold"
  | "sections"
  | "layoutRhythm"
  | "decisionPath"
  | "previewWireframe"
  | "contentModules"
  | "generationRules"
  | "forbiddenPatterns"
>;
