import type { AiProjectState } from "./ai/types";

export type DimensionId = "targetUser" | "coverage" | "valueProposition";
export type VisualId = "color" | "font" | "card" | "density";
export type OptionSignal = "recommended" | "constraint";

export type OptionItem = {
  id: string;
  label: string;
  knowledge?: string;
  signal?: OptionSignal;
  signals?: OptionSignal[];
  source?: "catalog" | "ai-generated" | "user-added" | "reference";
  rawText?: string;
  reason?: string;
  normalizedMeaning?: string;
  constraints?: string[];
  generationRules?: string[];
  forbiddenPatterns?: string[];
  previewRules?: Record<string, unknown>;
  tokenHints?: Record<string, unknown>;
  visualTokens?: Record<string, unknown>;
  implicitDecisions?: Record<string, unknown>;
  previewTemplate?: string;
  position?: { x: number; y: number };
  moved?: boolean;
  custom?: boolean;
};

export type IntentDimension = {
  id: DimensionId;
  title: string;
  question: string;
  options: OptionItem[];
  selectedOptionId?: string;
  expanded: boolean;
};

export type IntentState = {
  dimensions: IntentDimension[];
  designIntentText: string;
};

export type ContentModulePlacement = {
  id: string;
  label: string;
  purpose?: string;
  placement?: string;
  sectionId?: string;
  source?: "catalog" | "ai-generated" | "user-added" | "reference";
  signal?: OptionSignal;
  reason?: string;
};

export type InfoPlan = {
  id: string;
  title: string;
  thumbnail?: string;
  previewType?: "promo" | "browse" | "quality" | "custom";
  structure: string[];
  summary: string;
  prompt?: string;
  promptPatch?: string;
  signal?: OptionSignal;
  userEdit?: string;
  isPlaceholder?: boolean;
  isCustom?: boolean;
  source?: "catalog" | "ai-generated" | "user-added" | "reference";
  rawText?: string;
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
};

export type VisualDimension = {
  id: VisualId;
  title: string;
  description: string;
  options: OptionItem[];
  selectedOptionId?: string;
  expanded?: boolean;
};

export type MechanismState = {
  selectedInfoPlanId?: string;
  infoPlans: InfoPlan[];
  infoExpanded?: boolean;
  visualDimensions: VisualDimension[];
  visualExpanded: boolean;
};

export type Stage = "home" | "intent" | "mechanism" | "generate";
export type CanvasAnchor = "input" | "intent" | "mechanism" | "generate";

export type ProjectState = {
  id: string;
  createdAt: string;
  rawInput: string;
  userPrompt?: string;
  stage: Stage;
  maxReachedStep?: CanvasAnchor;
  /** @deprecated 使用 ai.brief.pageType；仅用于历史项目兼容 */
  websiteTypeLabel?: string;
  intent: IntentState;
  mechanism: MechanismState;
  ai?: AiProjectState;
};
