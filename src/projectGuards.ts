import type { IntentState, ProjectState } from "./types";

export function isIntentComplete(intent: IntentState) {
  return intent.dimensions.every((dimension) => Boolean(dimension.selectedOptionId));
}

export function hasGeneratedBrief(project: ProjectState) {
  const briefDimensions = project.ai?.brief?.dimensions;
  return (
    (Array.isArray(briefDimensions) && briefDimensions.some((dimension) => (dimension.options?.length ?? 0) > 0)) ||
    project.intent.dimensions.some((dimension) => dimension.options.some((option) => option.source === "ai-generated"))
  );
}
