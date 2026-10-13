import type { DimensionId, VisualId } from "../types";
import type { SpokenConstraint, SpokenConstraintPlacement } from "./types";
import { extractMoodKeyword } from "./intentConstraintSemantics";

/** 约束归位：AI 判断「这句话影响哪一步」；客户端按此展示徽章、注入选项、写入生成合同 */
export const PLACEMENT_STAGE_LABELS: Record<SpokenConstraintPlacement, string> = {
  intentTargetUser: "主要用户",
  intentCoverage: "突出重点",
  intentValueProposition: "核心感觉",
  infoArchitecture: "信息组织",
  functionModule: "功能内容",
  visualColor: "色彩",
  visualFont: "字体",
  visualCard: "卡片样式",
  visualDensity: "信息密度",
  pageGeneral: "整体要求",
};

const PLACEMENT_SET = new Set<string>(Object.keys(PLACEMENT_STAGE_LABELS));

export function readSpokenConstraintPlacement(value: unknown): SpokenConstraintPlacement | undefined {
  return typeof value === "string" && PLACEMENT_SET.has(value) ? (value as SpokenConstraintPlacement) : undefined;
}

export function placementToIntentDimension(placement: SpokenConstraintPlacement | undefined): DimensionId | undefined {
  if (placement === "intentTargetUser") return "targetUser";
  if (placement === "intentCoverage") return "coverage";
  if (placement === "intentValueProposition") return "valueProposition";
  return undefined;
}

export function placementToVisualDimension(placement: SpokenConstraintPlacement | undefined): VisualId | undefined {
  if (placement === "visualColor") return "color";
  if (placement === "visualFont") return "font";
  if (placement === "visualCard") return "card";
  if (placement === "visualDensity") return "density";
  return undefined;
}

export function constraintPlacementLabel(constraint: SpokenConstraint) {
  if (constraint.placement) return PLACEMENT_STAGE_LABELS[constraint.placement];
  return undefined;
}

export function constraintAppliesToIntentDimension(dimensionId: DimensionId, constraint: SpokenConstraint) {
  const fromPlacement = placementToIntentDimension(constraint.placement);
  if (fromPlacement) return fromPlacement === dimensionId;
  return false;
}

export function constraintAppliesToVisualDimension(dimensionId: VisualId, constraint: SpokenConstraint) {
  const fromPlacement = placementToVisualDimension(constraint.placement);
  if (fromPlacement) return fromPlacement === dimensionId;
  return false;
}

export function constraintTargetsInfoArchitecture(constraint: SpokenConstraint) {
  return constraint.placement === "infoArchitecture" || constraint.kind === "info";
}

export function constraintTargetsFunctionModule(constraint: SpokenConstraint) {
  return constraint.placement === "functionModule" || constraint.kind === "function";
}

export function constraintAppliesToVisualStage(dimensionId: VisualId, constraint: SpokenConstraint) {
  if (constraintAppliesToVisualDimension(dimensionId, constraint)) return true;
  if (!constraint.placement && constraint.kind === "visual") {
    const text = constraint.text;
    if (dimensionId === "font" && /字体|衬线|无衬线|黑体/.test(text)) return true;
    if (dimensionId === "card" && /圆角|阴影|卡片|描边|扁平/.test(text)) return true;
    if (dimensionId === "density" && /留白|疏松|紧凑|密度/.test(text)) return true;
    if (dimensionId === "color") return /色|蓝|橙|红|绿|黄|紫|暖|冷|主色|配色/.test(text);
  }
  if (dimensionId === "color" && constraint.placement === "intentValueProposition" && extractMoodKeyword(constraint.text)) {
    return true;
  }
  return false;
}

export function spokenConstraintsForVisualStage(spokenConstraints: SpokenConstraint[], dimensionId: VisualId) {
  return spokenConstraints.filter((item) => constraintAppliesToVisualStage(dimensionId, item));
}

export function spokenConstraintsForInfoArchitecture(spokenConstraints: SpokenConstraint[]) {
  return spokenConstraints.filter((item) => constraintTargetsInfoArchitecture(item));
}

export function spokenConstraintsForFunctionModule(spokenConstraints: SpokenConstraint[]) {
  return spokenConstraints.filter((item) => constraintTargetsFunctionModule(item));
}

/** AI 给出的 inferredLabel / mapsToOptionId 优先于本地关键词匹配 */
export function constraintMatchesOptionByAiMapping(
  constraint: SpokenConstraint,
  option: { id?: string; label?: string },
) {
  if (constraint.mapsToOptionId && option.id === constraint.mapsToOptionId) return true;
  const inferred = constraint.inferredLabel?.trim();
  if (!inferred) return false;
  const label = option.label?.trim() ?? "";
  return label === inferred || label.includes(inferred) || inferred.includes(label);
}
