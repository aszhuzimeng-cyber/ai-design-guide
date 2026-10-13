import type { DimensionId, InfoPlan, ProjectState } from "./types";

export const RECOMMENDED_PLAN_SLOTS = 3;

export function fallbackPageLabelFromInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return "页面需求";
  const firstLine = trimmed.split(/\n/)[0]?.trim() ?? trimmed;
  if (firstLine.length <= 32) return firstLine;
  return `${firstLine.slice(0, 32)}…`;
}

export function resolveProjectPageLabel(
  project: Pick<ProjectState, "websiteTypeLabel" | "rawInput" | "ai">,
): string {
  const pageType = project.ai?.brief?.pageType?.trim() || project.websiteTypeLabel?.trim();
  if (pageType) return pageType;
  return fallbackPageLabelFromInput(project.rawInput ?? "");
}

export function slugifyPageLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    .slice(0, 48);
  return slug || "generated-page";
}

export type IntentSelectionInput = {
  dimensionId: DimensionId;
  selectedOptionId?: string;
  options: Array<{ id: string; label: string; custom?: boolean }>;
};

export function buildPlaceholderPlan(index: number): InfoPlan {
  return {
    id: `placeholder-${index}`,
    title: "待选方案",
    structure: [],
    summary: "",
    isPlaceholder: true,
  };
}

export function fillPlanSlots(plans: InfoPlan[]) {
  const slots = [...plans];
  for (let index = slots.length; index < RECOMMENDED_PLAN_SLOTS; index += 1) {
    slots.push(buildPlaceholderPlan(index + 1));
  }
  return slots.slice(0, RECOMMENDED_PLAN_SLOTS);
}

export function extractResidualConstraints(rawInput: string, dimensions: IntentSelectionInput[]) {
  let text = rawInput.trim();
  if (!text) return "";

  dimensions.forEach((dimension) => {
    const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
    if (!selected?.label) return;
    text = text.split(selected.label).join(" ");
  });

  return text.replace(/\s+/g, " ").trim();
}

export function buildGenerationContext(input: {
  rawInput: string;
  intentDimensions: IntentSelectionInput[];
  plan?: {
    prompt?: string;
    promptPatch?: string;
    userEdit?: string;
    title?: string;
    summary?: string;
    structure?: string[];
  };
  visualLabels: string[];
  visualExtended?: string;
  inputConstraints?: string[];
  intentSummary?: string;
}) {
  const residualConstraints = extractResidualConstraints(input.rawInput, input.intentDimensions);
  const visualGrammar = input.visualLabels.filter(Boolean).join(" / ");
  const planPrompt = [input.plan?.prompt, input.plan?.promptPatch].filter(Boolean).join("\n");
  return {
    rawInput: input.rawInput,
    intentSummary: input.intentSummary ?? "",
    structure: input.plan?.structure ?? [],
    planPrompt,
    userEdit: input.plan?.userEdit ?? "",
    visualGrammar,
    visualExtended: input.visualExtended ?? "",
    residualConstraints,
    constraintTags: input.inputConstraints ?? [],
  };
}
