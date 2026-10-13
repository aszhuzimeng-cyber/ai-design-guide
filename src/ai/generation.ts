import { buildGenerationContext, resolveProjectPageLabel } from "../catalog";
import type { IntentSelectionInput } from "../catalog";
import type { ProjectState } from "../types";
import { compileGenerationConstraints, getGenerationCheckContext } from "./designReference";
import { buildBindingContract } from "./generationBindings";
import { compileSpokenConstraintRules, getProjectSpokenConstraints } from "./spokenConstraints";
import { buildGenerationGuidance } from "./generationGuidance";
import { buildVisualSelectionSpecs } from "./visualSpecs";
import { withUniversalLayoutBalanceRules } from "../generationLayoutBalance";
import { buildLayoutGuidanceRules, resolvePlanPageLayout } from "../pageLayoutArchitecture";

const GENERATION_PIPELINE_VERSION = "layout-v3";

export function buildGenerationBrief(project: ProjectState, intentDimensions: IntentSelectionInput[], options?: { compact?: boolean }) {
  const compact = options?.compact !== false;
  const plan = project.mechanism.infoPlans.find((item) => item.id === project.mechanism.selectedInfoPlanId);
  const visualLabels = project.mechanism.visualDimensions
    .map((dimension) => dimension.options.find((item) => item.id === dimension.selectedOptionId)?.label ?? "")
    .filter(Boolean);
  const selectedVisualOptions = project.mechanism.visualDimensions.map((dimension) => ({
    dimensionId: dimension.id,
    option: dimension.options.find((item) => item.id === dimension.selectedOptionId),
  }));
  const bindingContract = buildBindingContract(project);
  const compiledConstraints = compileGenerationConstraints({
    selectedInfo: plan,
    selectedVisualOptions,
  });
  const generationRules = [
    ...new Set([
      ...compileSpokenConstraintRules(getProjectSpokenConstraints(project)),
      ...bindingContract.mandatoryRules,
      ...compiledConstraints.generationRules,
    ]),
  ];
  const forbiddenPatterns = [...new Set([...bindingContract.forbiddenPatterns, ...compiledConstraints.forbiddenPatterns])];
  const userAddedOptions = {
    intent: project.intent.dimensions.flatMap((dimension) => {
      const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
      if (!selected) return [];
      return [
        {
          dimensionId: dimension.id,
          label: selected.label,
          rawText: selected.rawText,
          normalizedMeaning: selected.normalizedMeaning,
          constraints: selected.constraints,
          generationRules: selected.generationRules,
          forbiddenPatterns: selected.forbiddenPatterns,
        },
      ];
    }),
    info: project.mechanism.infoPlans
      .filter((item) => item.isCustom || item.source === "user-added")
      .map((item) => ({
        id: item.id,
        title: item.title,
        rawText: item.rawText,
        pageArchitecture: item.pageArchitecture,
        contentModules: item.contentModules,
        generationRules: item.generationRules,
      })),
    visual: selectedVisualOptions
      .map((item) => item.option)
      .filter((item) => item?.custom || item?.source === "user-added")
      .map((item) => ({
        label: item!.label,
        rawText: item!.rawText,
        normalizedMeaning: item!.normalizedMeaning,
        generationRules: item!.generationRules,
      })),
  };
  const intentSummary = intentDimensions
    .map((dimension) => {
      const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
      return selected?.label;
    })
    .filter(Boolean)
    .join(" / ");

  const context = buildGenerationContext({
    rawInput: project.rawInput,
    intentDimensions,
    plan,
    visualLabels,
    visualExtended: project.ai?.mechanism?.visualExtended,
    inputConstraints: project.ai?.brief?.inputConstraints,
    intentSummary,
  });

  const moduleCount = plan?.structure?.length ?? 0;
  const wireframeDensity = String(plan?.previewWireframe?.density ?? "balanced");
  const layoutShell = plan ? resolvePlanPageLayout(plan) : undefined;
  const densityDimension = project.mechanism.visualDimensions.find((item) => item.id === "density");
  const selectedDensityOption = densityDimension?.options.find((item) => item.id === densityDimension.selectedOptionId);
  const visualDensity = String(selectedDensityOption?.previewRules?.density ?? wireframeDensity);

  const generationGuidance = buildGenerationGuidance({
    project,
    bindingContract,
    selectedVisualOptions,
    residualConstraints: context.residualConstraints,
    intentSummary,
    planSummary: plan?.summary,
    planFirstScreen: plan?.firstScreen,
    planStructure: plan?.structure,
    visualDensity,
  });

  const visualSelections = buildVisualSelectionSpecs(project.mechanism.visualDimensions);
  const visualSelectionsForBrief = visualSelections.map((item) => ({
    dimensionId: item.dimensionId,
    dimensionTitle: item.dimensionTitle,
    label: item.label,
    instruction: item.instruction,
    cssTokens: item.cssTokens,
  }));
  const selectedChoices = {
    intent: project.intent.dimensions.map((dimension) => {
      const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
      return selected
        ? {
            dimension: dimension.title,
            label: selected.label,
            meaning: selected.normalizedMeaning?.trim() || selected.reason?.trim() || undefined,
          }
        : null;
    }).filter(Boolean),
    info: plan
      ? { title: plan.title, structure: plan.structure ?? [], summary: plan.summary?.trim() || undefined }
      : undefined,
    visual: visualLabels,
  };
  const qualityChecks = getGenerationCheckContext();
  const compactQualityChecks = compact
    ? {
        preGenerationChecklist: qualityChecks.preGenerationChecklist,
        postGenerationChecklist: {
          id: qualityChecks.postGenerationChecklist?.id,
          title: qualityChecks.postGenerationChecklist?.title,
          items: qualityChecks.postGenerationChecklist?.items?.slice(0, 7),
        },
        uxQualityRules: qualityChecks.uxQualityRules?.slice(0, 8),
      }
    : qualityChecks;

  return JSON.stringify(
    {
      pageType: resolveProjectPageLabel(project),
      recognitionSummary: project.ai?.brief?.recognitionSummary,
      userSpokenConstraints: getProjectSpokenConstraints(project),
      bindingContract: {
        precedence: bindingContract.precedence,
        nonNegotiable: bindingContract.nonNegotiable,
        userSpokenConstraints: bindingContract.userSpokenConstraints,
        intent: bindingContract.intent,
        infoArchitecture: bindingContract.infoArchitecture,
        visual: bindingContract.visual,
        forbiddenPatterns: bindingContract.forbiddenPatterns,
        acceptanceChecks: bindingContract.acceptanceChecks,
      },
      generationGuidance,
      selectedChoices,
      ...context,
      visualSelections: visualSelectionsForBrief,
      selectedInfoArchitecture: compiledConstraints.infoArchitecture,
      layoutGuidance: {
        density: visualDensity,
        structureLock: bindingContract.infoArchitecture.structureLock,
        layoutShell,
        moduleCount,
        sectionCount: moduleCount,
        pageModules: plan?.structure ?? [],
        pageFrame: plan?.pageFrame,
        firstScreen: plan?.firstScreen,
        contentFlow: plan?.contentFlow,
        componentPatterns: plan?.componentPatterns,
        layoutDecisions: plan?.layoutDecisions,
        contentModules: plan?.contentModules,
        rules: layoutShell ? buildLayoutGuidanceRules(layoutShell) : withUniversalLayoutBalanceRules([
          "structureLock / pageModules 顺序是硬约束，不得增删调序",
          "每个模块都必须渲染为独立 <section>",
          "页面要饱满：主内容区宽度约 92%~96%（max-width 1120~1280px）",
        ]),
      },
      userAddedOptions,
      generationRules,
      forbiddenPatterns,
      designIntentText: project.intent.designIntentText,
      qualityChecks: compactQualityChecks,
    },
    null,
    2,
  );
}

export function buildGenerationKey(project: ProjectState) {
  const plan = project.mechanism.infoPlans.find((item) => item.id === project.mechanism.selectedInfoPlanId);
  const visualKey = project.mechanism.visualDimensions.map((dimension) => dimension.selectedOptionId ?? "").join("|");
  const intentKey = project.intent.dimensions.map((dimension) => dimension.selectedOptionId ?? "").join("|");
  return [
    GENERATION_PIPELINE_VERSION,
    project.rawInput,
    project.intent.designIntentText,
    intentKey,
    plan?.id,
    plan?.userEdit,
    plan?.promptPatch,
    JSON.stringify(plan?.contentModules ?? []),
    visualKey,
    project.ai?.mechanism?.visualExtended,
  ].join("::");
}
