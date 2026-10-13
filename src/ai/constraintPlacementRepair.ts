import type { DimensionId } from "../types";
import type { SpokenConstraint, SpokenConstraintPlacement } from "./types";
import { deepseekChat, getDeepSeekFastModel } from "./deepseek";
import { extractJsonObject } from "./json";
import { readSpokenConstraintPlacement } from "./constraintPlacement";
import { inferIntentDimensionForConstraint, reconcileSpokenConstraintPlacements } from "./intentConstraintSemantics";

const PLACEMENT_REPAIR_SYSTEM = `你是网页设计约束归位助手。用户已输入需求，系统已提取若干条用户原话约束，但部分条目缺少 placement（归位）。
只输出 JSON，不要 markdown。
任务：为每条需要补全的约束填写：
- placement（必填）：intentTargetUser | intentCoverage | intentValueProposition | infoArchitecture | functionModule | visualColor | visualFont | visualCard | visualDensity | pageGeneral
- inferredLabel（尽量填）：语义理解后的短选项名，如「求职用」→「招聘方/面试官」
- mapsToOptionId（可选）：若 intentDimensions 里已有匹配选项，填其 id

归位规则：
- 目标用户/求职/面向谁 → intentTargetUser
- 突出什么/作品/案例/首屏 → intentCoverage
- 气质/活力/专业/高级/格调 → intentValueProposition
- 页面结构/模块顺序 → infoArchitecture
- 表单/预约/功能模块 → functionModule
- 颜色 → visualColor；字体 → visualFont；卡片/圆角/阴影 → visualCard；留白/密度 → visualDensity
- 无法归入以上单选步骤 → pageGeneral

不要改写 text，不要新增用户没说过的话。`;

function normalizeConstraintKey(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}

export function spokenConstraintsNeedPlacementRepair(constraints: SpokenConstraint[]) {
  return constraints.some((item) => !item.placement);
}

function inferPlacementFallback(constraint: SpokenConstraint): SpokenConstraintPlacement | undefined {
  const dimension = inferIntentDimensionForConstraint(constraint);
  if (dimension === "targetUser") return "intentTargetUser";
  if (dimension === "coverage") return "intentCoverage";
  if (dimension === "valueProposition") return "intentValueProposition";
  if (constraint.kind === "info") return "infoArchitecture";
  if (constraint.kind === "function") return "functionModule";
  if (constraint.kind === "visual") {
    const text = constraint.text;
    if (/字体|衬线|无衬线|黑体/.test(text)) return "visualFont";
    if (/圆角|阴影|卡片|描边|扁平/.test(text)) return "visualCard";
    if (/留白|疏松|紧凑|密度/.test(text)) return "visualDensity";
    return "visualColor";
  }
  return undefined;
}

function intentOptionsSummary(dimensions: Array<{ id: DimensionId; options: Array<{ id: string; label: string }> }>) {
  return dimensions.map((dimension) => ({
    dimensionId: dimension.id,
    options: dimension.options.map((option) => ({ id: option.id, label: option.label })),
  }));
}

type RepairPayload = {
  repairs?: Array<{
    text?: string;
    placement?: string;
    inferredLabel?: string;
    mapsToOptionId?: string;
  }>;
};

function mergeRepairIntoConstraint(
  constraint: SpokenConstraint,
  repair: {
    text?: string;
    placement?: string;
    inferredLabel?: string;
    mapsToOptionId?: string;
  },
): SpokenConstraint {
  const placement = constraint.placement ?? readSpokenConstraintPlacement(repair.placement);
  const inferredLabel =
    constraint.inferredLabel ??
    (typeof repair.inferredLabel === "string" && repair.inferredLabel.trim() ? repair.inferredLabel.trim() : undefined);
  const mapsToOptionId =
    constraint.mapsToOptionId ??
    (typeof repair.mapsToOptionId === "string" && repair.mapsToOptionId.trim() ? repair.mapsToOptionId.trim() : undefined);
  const fallbackPlacement = placement ?? inferPlacementFallback(constraint);
  return {
    ...constraint,
    placement: fallbackPlacement,
    inferredLabel,
    mapsToOptionId,
  };
}

export function applyPlacementFallbacks(constraints: SpokenConstraint[]): SpokenConstraint[] {
  return reconcileSpokenConstraintPlacements(
    constraints.map((constraint) => {
      if (constraint.placement) return constraint;
      const placement = inferPlacementFallback(constraint);
      return placement ? { ...constraint, placement } : constraint;
    }),
  );
}

export async function repairSpokenConstraintPlacements(input: {
  rawInput: string;
  spokenConstraints: SpokenConstraint[];
  dimensions: Array<{ id: DimensionId; options: Array<{ id: string; label: string }> }>;
  signal?: AbortSignal;
}): Promise<SpokenConstraint[]> {
  const needsRepair = input.spokenConstraints.filter((item) => !item.placement);
  if (!needsRepair.length) return input.spokenConstraints;

  try {
    const result = await deepseekChat({
      signal: input.signal,
      model: getDeepSeekFastModel(),
      temperature: 0.1,
      maxTokens: 1536,
      stream: false,
      messages: [
        { role: "system", content: PLACEMENT_REPAIR_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            rawInput: input.rawInput,
            intentDimensions: intentOptionsSummary(input.dimensions),
            constraintsToRepair: needsRepair.map((item) => ({
              text: item.text,
              kind: item.kind,
              placement: item.placement ?? null,
              inferredLabel: item.inferredLabel ?? null,
            })),
          }),
        },
      ],
    });

    const payload = extractJsonObject<RepairPayload>(result.content);
    const repairByText = new Map(
      (payload.repairs ?? [])
        .filter((item) => typeof item.text === "string" && item.text.trim())
        .map((item) => [normalizeConstraintKey(item.text!.trim()), item]),
    );

    const merged = input.spokenConstraints.map((constraint) => {
      if (constraint.placement) return constraint;
      const repair = repairByText.get(normalizeConstraintKey(constraint.text));
      if (!repair) return constraint;
      return mergeRepairIntoConstraint(constraint, repair);
    });

    return applyPlacementFallbacks(merged);
  } catch {
    return applyPlacementFallbacks(input.spokenConstraints);
  }
}

export async function ensurePlacedSpokenConstraints(input: {
  rawInput: string;
  spokenConstraints: SpokenConstraint[];
  dimensions: Array<{ id: DimensionId; options: Array<{ id: string; label: string }> }>;
  signal?: AbortSignal;
}): Promise<SpokenConstraint[]> {
  const reconciled = reconcileSpokenConstraintPlacements(input.spokenConstraints);
  if (!spokenConstraintsNeedPlacementRepair(reconciled)) {
    return reconciled;
  }
  return repairSpokenConstraintPlacements({ ...input, spokenConstraints: reconciled });
}
