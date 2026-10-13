import type { ContentModulePlacement, InfoPlan } from "../types";
import { addModuleToInfoPlan, removeModuleFromInfoPlan, reorderModulesInInfoPlan, setModuleOrderInInfoPlan } from "../infoArchitecture";

export function mergeOrchestratedInfoPlan(plan: InfoPlan, patch: Partial<InfoPlan>): InfoPlan {
  return {
    ...plan,
    ...patch,
    contentModules: patch.contentModules ?? plan.contentModules,
    sections: patch.sections ?? plan.sections,
    structure: patch.structure ?? plan.structure,
    generationRules: patch.generationRules ?? plan.generationRules,
  };
}

export function applyLocalInfoPlanModuleChange(
  plan: InfoPlan,
  action:
    | { type: "add"; label: string }
    | { type: "remove"; moduleId: string }
    | { type: "reorder"; moduleId: string; direction?: "up" | "down"; targetIndex?: number },
): InfoPlan {
  if (action.type === "add") return addModuleToInfoPlan(plan, action.label);
  if (action.type === "remove") return removeModuleFromInfoPlan(plan, action.moduleId);
  if (typeof action.targetIndex === "number") {
    return setModuleOrderInInfoPlan(plan, action.moduleId, action.targetIndex);
  }
  return reorderModulesInInfoPlan(plan, action.moduleId, action.direction ?? "down");
}

export function markModuleSources(modules: ContentModulePlacement[] | undefined, userLabels: Set<string>) {
  return (modules ?? []).map((module) => ({
    ...module,
    source: userLabels.has(module.label) ? ("user-added" as const) : module.source ?? "ai-generated",
  }));
}
