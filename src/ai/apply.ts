import { resolveProjectPageLabel } from "../catalog";
import { formatContentModuleLabel } from "../contentModuleLabel";
import { normalizeLegacyIntentQuestion } from "../intentFallback";
import { getVisualSpec } from "./visualSpecs";
import { mergeInputConstraintTexts, sanitizeUserInputConstraints, optionReflectsSpokenConstraint, ensureProjectSpokenConstraints, planReflectsSpokenConstraint, getProjectSpokenConstraints, spokenConstraintAppliesToIntentDimension, constraintsForOptionMarking, spokenConstraintsForFunctionModule, spokenConstraintsForInfoArchitecture } from "./spokenConstraints";
import { applyPlacementFallbacks } from "./constraintPlacementRepair";
import { constraintSemanticallyMatchesOption } from "./intentConstraintSemantics";
import {
  buildConstraintContentModules,
  injectIntentConstraintOptions,
  mergeConstraintModulesIntoPlans,
  prependConstraintInfoPlanIfNeeded,
} from "./constraintOptions";

import type {

  DimensionId,

  InfoPlan,

  IntentDimension,

  IntentState,

  MechanismState,

  OptionItem,

  OptionSignal,

  ProjectState,

  VisualDimension,

  VisualId,

} from "../types";

import { buildDesignIntentText } from "../intentUtils";
import { buildReferenceVisualSelections } from "./designReference";
import { normalizeSynthesizedPlans } from "./pipeline";
import { buildIntentMechanismBinding, resolveRecommendedPlanId } from "./intentMechanismBinding";
import { normalizeVisualGrammarSelections, dedupeVisualDimensionOptions } from "./visualGrammarNormalize";
import type { AiBriefResult, AiMechanismResult, AiProjectState, AiVisualGrammarResult, AiVisualSelection } from "./types";
import { VISUAL_DIMENSION_INITIAL_OPTIONS, VISUAL_DIMENSION_IDS, VISUAL_OPTION_CATALOG } from "./catalogs";




const INTENT_TITLES: Record<DimensionId, string> = {
  targetUser: "主要用户群体",
  coverage: "突出重点",
  valueProposition: "核心感觉",
};



function resolveIntentSignal(

  dimensionId: DimensionId,

  optionId: string,

  brief: AiBriefResult,

  option: OptionItem,

  rawInput: string,

): OptionSignal | undefined {

  const markingConstraints = constraintsForOptionMarking(rawInput, brief.spokenConstraints ?? []);
  const relevant = markingConstraints.filter((constraint) =>
    spokenConstraintAppliesToIntentDimension(dimensionId, constraint),
  );
  if (!relevant.length) return undefined;

  if (brief.constraintOptionIds[dimensionId] === optionId && relevant.some((constraint) => constraint.mapsToOptionId === optionId)) {
    return "constraint";
  }

  if (relevant.some((constraint) => constraint.mapsToOptionId === optionId)) return "constraint";
  if (
    relevant.some(
      (constraint) =>
        constraintSemanticallyMatchesOption(dimensionId, constraint, option) ||
        optionReflectsSpokenConstraint(rawInput, option, constraint, dimensionId),
    )
  ) {
    return "constraint";
  }

  return undefined;

}

function intentOptionSignalOnly(signal?: OptionSignal): OptionSignal | undefined {

  return signal === "constraint" ? signal : undefined;

}



function mergeIntentOptionSignal(existing: OptionSignal | undefined, fromBrief: OptionSignal | undefined): OptionSignal | undefined {

  if (fromBrief === "constraint" || existing === "constraint") return "constraint";

  return undefined;

}



export function applyBriefToIntentOptions(

  dimensions: IntentDimension[],

  brief: AiBriefResult,

  rawInput: string,

  _preserveSelection = true,

): IntentDimension[] {

  if (Array.isArray(brief.dimensions) && brief.dimensions.length > 0) {

    return dimensions.map((dimension) => {

      const dynamic = brief.dimensions?.find((item) => item.id === dimension.id);

      if (!dynamic) return dimension;

      const customOptions = dimension.options.filter((option) => option.custom);

      if (!dynamic.options?.length) {

        return {

          ...dimension,

          title: dynamic.title ?? dimension.title,

          question: dynamic.question ?? dimension.question,

        };

      }

      const dynamicOptions: OptionItem[] = dynamic.options.map((option) => ({

        ...option,

        source: option.source ?? "ai-generated",

        knowledge: option.knowledge ?? option.reason ?? option.normalizedMeaning,

        signal: mergeIntentOptionSignal(

          intentOptionSignalOnly(option.signal),

          resolveIntentSignal(dimension.id, option.id, brief, option, rawInput),

        ),

      }));

      const options = injectIntentConstraintOptions(
        dimension.id,
        [
          ...dynamicOptions,
          ...customOptions.filter((custom) => !dynamicOptions.some((item) => item.id === custom.id)),
        ],
        constraintsForOptionMarking(rawInput, brief.spokenConstraints ?? []),
        rawInput,
        brief.constraintOptionIds[dimension.id],
      );

      const selectedOptionId = options.some((item) => item.id === dimension.selectedOptionId)

        ? dimension.selectedOptionId

        : undefined;



      return {

        ...dimension,

        title: dynamic.title ?? INTENT_TITLES[dimension.id],

        question: dynamic.question,

        options,

        selectedOptionId,

      };

    }).map(normalizeLegacyIntentQuestion);

  }



  return dimensions.map((dimension) => {

    const options = injectIntentConstraintOptions(
      dimension.id,
      dimension.options.map((option) => ({
        ...option,
        signal: mergeIntentOptionSignal(
          intentOptionSignalOnly(option.signal),
          resolveIntentSignal(dimension.id, option.id, brief, option, rawInput),
        ),
      })),
      constraintsForOptionMarking(rawInput, brief.spokenConstraints ?? []),
      rawInput,
      brief.constraintOptionIds[dimension.id],
    );

    return {
      ...dimension,
      options,
    };
  });

}



export function applyBriefToProject(

  project: ProjectState,

  brief: AiBriefResult,

): ProjectState {

  const spokenConstraints = applyPlacementFallbacks(
    ensureProjectSpokenConstraints(
      project.rawInput,
      brief.spokenConstraints ?? brief.inputConstraints ?? [],
    ),
  );
  const sanitizedBrief: AiBriefResult = {
    ...brief,
    spokenConstraints,
    inputConstraints: mergeInputConstraintTexts(
      spokenConstraints,
      sanitizeUserInputConstraints(project.rawInput, brief.inputConstraints),
    ),
  };

  const dimensions = applyBriefToIntentOptions(project.intent.dimensions, sanitizedBrief, project.rawInput, true);

  const intent: IntentState = {

    dimensions,

    designIntentText: buildDesignIntentText(dimensions),

  };



  return {

    ...project,

    websiteTypeLabel: sanitizedBrief.pageType,

    intent,

    ai: {

      ...(project.ai ?? { tasks: { brief: "idle", mechanism: "idle", visual: "idle", generate: "idle" }, errors: {} }),

      brief: sanitizedBrief,
      briefSource: "ai" as const,

      tasks: { ...(project.ai?.tasks ?? { brief: "idle", mechanism: "idle", visual: "idle", generate: "idle" }), brief: "done" },

      errors: { ...project.ai?.errors, brief: undefined },

    },

  };
}

function resetVisualDimensionsForAiApply(

  mechanism: MechanismState,

  previous: MechanismState,

): VisualDimension[] {

  return mechanism.visualDimensions.map((dimension) => {

    const prev = previous.visualDimensions.find((item) => item.id === dimension.id);

    return {

      ...dimension,

      options: [],

      selectedOptionId: undefined,

      expanded: prev?.expanded ?? dimension.expanded,

    };

  });

}



export function applyMechanismPlans(

  project: ProjectState,

  result: AiMechanismResult,

  createMechanism: (intent: IntentState, rawInput: string, previous?: MechanismState) => MechanismState,

): ProjectState {

  const previous = project.mechanism;

  let mechanism = createMechanism(project.intent, project.rawInput, previous);



  const customPlans = previous.infoPlans.filter((plan) => plan.isCustom);

  const knownPlanIds = new Set(mechanism.infoPlans.map((plan) => plan.id));

  const extraCustom = customPlans.filter((plan) => !knownPlanIds.has(plan.id));

  if (extraCustom.length) {

    mechanism = { ...mechanism, infoPlans: [...mechanism.infoPlans, ...extraCustom] };

  }



  let recommendedPlanId = result.recommendedPlanId ?? result.synthesizedPlans?.[0]?.id;

  const spokenConstraints = getProjectSpokenConstraints(project);
  const binding = buildIntentMechanismBinding({
    intent: project.intent,
    rawInput: project.rawInput,
    spokenConstraints,
  });

  if (result.synthesizedPlans?.length) {

    const finalizedPlans = normalizeSynthesizedPlans(result.synthesizedPlans, binding) ?? result.synthesizedPlans;
    recommendedPlanId = resolveRecommendedPlanId(
      finalizedPlans,
      binding,
      result.recommendedPlanId ?? finalizedPlans[0]?.id,
    );

    const infoConstraints = spokenConstraintsForInfoArchitecture(spokenConstraints);
    const functionConstraints = spokenConstraintsForFunctionModule(spokenConstraints);
    let synthesized: InfoPlan[] = finalizedPlans.map((plan) => {
      const matchesConstraint = infoConstraints.some((constraint) =>
        planReflectsSpokenConstraint(project.rawInput, plan, constraint),
      );
      return {
      id: plan.id,

      title: plan.title,

      structure: plan.structure,

      summary: plan.summary,

      prompt: plan.prompt,

      signal: matchesConstraint ? "constraint" : plan.id === recommendedPlanId ? "recommended" : undefined,

      source: plan.source ?? "ai-generated",

      reason: plan.reason,

      risk: plan.risk,

      pageArchitecture: plan.pageArchitecture,

      pageFrame: plan.pageFrame,

      firstScreen: plan.firstScreen,

      contentFlow: plan.contentFlow,

      componentPatterns: plan.componentPatterns,

      layoutDecisions: plan.layoutDecisions,

      aboveFold: plan.aboveFold,

      sections: plan.sections,

      layoutRhythm: plan.layoutRhythm,

      decisionPath: plan.decisionPath,

      previewWireframe: plan.previewWireframe,

      contentModules: plan.contentModules?.map((module) => {
        const label = formatContentModuleLabel(module.label);
        const matchesFunctionConstraint = functionConstraints.some((constraint) =>
            optionReflectsSpokenConstraint(project.rawInput, { label, reason: module.reason }, constraint),
          );
        return {
          ...module,
          label,
          signal: matchesFunctionConstraint ? ("constraint" as const) : module.signal,
        };
      }),

      generationRules: plan.generationRules,

      forbiddenPatterns: plan.forbiddenPatterns,

      };
    });

    const withConstraintPlan = prependConstraintInfoPlanIfNeeded(
      synthesized,
      project.rawInput,
      spokenConstraints,
    );
    const constraintModules = buildConstraintContentModules(spokenConstraints);
    const withModules = mergeConstraintModulesIntoPlans(withConstraintPlan, constraintModules);

    const preservedPlans = mechanism.infoPlans.filter((plan) => plan.isCustom || plan.source === "user-added");

    mechanism = {

      ...mechanism,

      infoPlans: [...withModules, ...preservedPlans],

    };

  }



  const refinements = result.planRefinements ?? {};



  mechanism = {

    ...mechanism,

    infoPlans: mechanism.infoPlans.map((plan) => {

      const refinement = refinements[plan.id];

      const isRecommended = Boolean(recommendedPlanId && plan.id === recommendedPlanId);

      const previousPlan = previous.infoPlans.find((item) => item.id === plan.id);

      return {

        ...plan,

        structure: refinement?.structure ?? plan.structure,

        promptPatch: refinement?.promptPatch,

        signal: refinement?.signal ?? (isRecommended ? "recommended" : undefined),

        userEdit: previousPlan?.userEdit ?? plan.userEdit,

      };

    }),

  };



  const selectedInfoPlanId =

    previous.selectedInfoPlanId &&

    mechanism.infoPlans.some((plan) => plan.id === previous.selectedInfoPlanId && !plan.isPlaceholder)

      ? previous.selectedInfoPlanId

      : undefined;



  return {

    ...project,

    mechanism: {

      ...mechanism,

      selectedInfoPlanId,

      visualExpanded: previous.visualExpanded || Boolean(selectedInfoPlanId),

      infoExpanded: previous.infoExpanded,

      visualDimensions: resetVisualDimensionsForAiApply(mechanism, previous),

    },

    ai: {

      ...(project.ai ?? { tasks: { brief: "idle", mechanism: "idle", visual: "idle", generate: "idle" }, errors: {} }),

      mechanism: {

        ...result,

        visualSelections: result.visualSelections ?? {},

      },

      tasks: { ...(project.ai?.tasks ?? { brief: "done", mechanism: "idle", visual: "idle", generate: "idle" }), mechanism: "done" },

      errors: { ...project.ai?.errors, mechanism: undefined },

    },

  };

}



function buildCatalogVisualOption(dimensionId: VisualId, optionId: string, signal?: OptionSignal): OptionItem {

  const def = VISUAL_OPTION_CATALOG[dimensionId].find((item) => item.id === optionId);
  const spec = getVisualSpec(dimensionId, optionId);

  return {
    id: optionId,
    label: spec?.label ?? def?.label ?? optionId,
    signal,
    tokenHints: spec
      ? {
          ...spec.cssTokens,
          ...(dimensionId === "font" ? { fontStyleName: spec.label } : {}),
          ...(dimensionId === "card" ? { cardStyleName: spec.label } : {}),
          ...(dimensionId === "density" ? { densityStyleName: spec.label } : {}),
        }
      : undefined,
    generationRules: spec ? [spec.instruction] : undefined,
    reason: spec?.instruction,
    previewRules:
      dimensionId === "card"
        ? { cardStyle: optionId === "flat" ? "flat-hairline" : optionId === "soft" ? "soft-card" : optionId, radiusPx: parseInt(spec?.cssTokens.card ?? "8", 10) }
        : dimensionId === "density"
          ? { density: spec?.cssTokens.density ?? optionId }
          : undefined,
  };

}



function normalizeVisualSelection(selection: AiVisualSelection): AiVisualSelection | undefined {

  const recommendedId =

    selection.recommendedOptionId ??

    selection.optionId ??

    selection.options?.[0]?.id ??

    selection.optionIds?.[0];

  if (!recommendedId) return undefined;

  return {

    ...selection,

    optionId: selection.optionId ?? recommendedId,

    recommendedOptionId: recommendedId,

    source: selection.source === "constraint" ? "constraint" : "recommended",

  };

}



function mergeVisualOptionsForAi(dimension: VisualDimension, selection: AiVisualSelection): OptionItem[] {

  const catalog = VISUAL_OPTION_CATALOG[dimension.id];

  const catalogIdSet = new Set(catalog.map((def) => def.id));

  const existingById = new Map(dimension.options.map((item) => [item.id, item]));

  const customOptions = dimension.options.filter((item) => item.custom || item.source === "user-added");



  if (selection.options?.length) {

    const recommendedId = selection.recommendedOptionId ?? selection.optionId;

    const dynamic = selection.options.slice(0, VISUAL_DIMENSION_INITIAL_OPTIONS).map((item) => ({

      ...item,

      source: item.source ?? "ai-generated",

      knowledge: item.knowledge ?? item.reason ?? selection.optionNotes?.[item.id],

      signal:

        item.id === recommendedId

          ? selection.source === "constraint"

            ? "constraint"

            : "recommended"

          : item.signal === "constraint" || item.signal === "recommended"
            ? item.signal
            : undefined,

    }));

    const dynamicIds = new Set(dynamic.map((item) => item.id));

    return dedupeVisualDimensionOptions(dimension.id, [
      ...dynamic,
      ...customOptions.filter((item) => !dynamicIds.has(item.id)),
    ]);

  }



  const recommendedId = selection.recommendedOptionId ?? selection.optionId;

  const orderedIds = [recommendedId, ...(selection.optionIds ?? [])]
    .filter((id): id is string => Boolean(id))
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .slice(0, VISUAL_DIMENSION_INITIAL_OPTIONS);

  const curated: OptionItem[] = orderedIds.map((id) => {
    const base = existingById.get(id) ?? buildCatalogVisualOption(dimension.id, id);
    const designNote = selection.optionNotes?.[id]?.trim();
    const inCatalog = catalogIdSet.has(id);
    return {
      ...base,
      label: inCatalog ? base.label : visualOptionLabelFromId(id, designNote),
      signal:
        id === recommendedId
          ? selection.source === "constraint"
            ? "constraint"
            : "recommended"
          : undefined,
      knowledge: designNote || base.knowledge,
    };
  });

  return dedupeVisualDimensionOptions(dimension.id, [...curated, ...customOptions]);
}

function visualOptionLabelFromId(id: string, note?: string) {
  const trimmed = note?.trim();
  if (trimmed) {
    const short = trimmed.split(/[，。,.]/)[0]?.trim();
    if (short && short.length <= 18) return short;
  }
  return id.replace(/-/g, " ");
}



function applyAiVisualToDimension(

  dimension: VisualDimension,

  selection: AiVisualSelection | undefined,

  preserveUserVisual: boolean,

): VisualDimension {

  const normalized = selection ? normalizeVisualSelection(selection) : undefined;

  if (!normalized) return dimension;



  const options = mergeVisualOptionsForAi(dimension, normalized);

  if (!options.length) return dimension;



  const hasSelectedOption = options.some((item) => item.id === dimension.selectedOptionId);
  const keepSelection = preserveUserVisual && dimension.selectedOptionId && hasSelectedOption;

  return {
    ...dimension,
    options,
    selectedOptionId: keepSelection ? dimension.selectedOptionId : undefined,
    expanded: keepSelection ? dimension.expanded : true,
  };

}



export function hasAiVisualSelections(selections: Partial<Record<VisualId, AiVisualSelection>> | undefined) {

  return Object.values(selections ?? {}).some((item) =>

    Boolean(item?.options?.length || item?.optionIds?.length || item?.optionId),

  );

}



function visualDimensionsReady(dimensions: VisualDimension[]): boolean {
  return VISUAL_DIMENSION_IDS.every((id) => {
    const dimension = dimensions.find((item) => item.id === id);
    return Boolean(dimension?.options.length);
  });
}

export function buildVisualGrammarKey(project: ProjectState, planId = project.mechanism.selectedInfoPlanId) {
  return `visual-v2::${buildMechanismKey(project)}::${planId ?? ""}`;
}

export function invalidateVisualGrammarCache(project: ProjectState): ProjectState {
  if (!project.ai) return project;
  return {
    ...project,
    ai: {
      ...project.ai,
      visualGrammar: undefined,
      visualGrammarSource: undefined,
      tasks: { ...project.ai.tasks, visual: "idle" },
      errors: { ...project.ai.errors, visual: undefined },
    },
  };
}

function visualGrammarAiCacheReady(project: ProjectState, grammarKey: string) {
  const optionsReady = project.mechanism.visualDimensions.every((dimension) => dimension.options.length > 0);
  if (!optionsReady) return false;
  return project.ai?.visualGrammar?.key === grammarKey;
}

export function isVisualGrammarAiCacheReady(project: ProjectState, grammarKey?: string) {
  return visualGrammarAiCacheReady(project, grammarKey ?? buildVisualGrammarKey(project));
}

function applyVisualSelectionsToProject(
  project: ProjectState,
  selections: Partial<Record<VisualId, AiVisualSelection>>,
  preserveUserVisual: boolean,
  meta?: AiVisualGrammarResult,
): ProjectState {
  let visualDimensions = project.mechanism.visualDimensions.map((dimension) =>
    applyAiVisualToDimension(dimension, selections[dimension.id], preserveUserVisual),
  );

  if (!visualDimensionsReady(visualDimensions)) {
    const planId = project.mechanism.selectedInfoPlanId;
    const plan = planId
      ? project.mechanism.infoPlans.find((item) => item.id === planId && !item.isPlaceholder)
      : undefined;
    if (plan) {
      const referenceSelections = buildReferenceVisualSelections({
        infoPlan: plan,
        rawInput: project.rawInput,
        intent: project.intent,
      });
      visualDimensions = visualDimensions.map((dimension) => {
        if (dimension.options.length) return dimension;
        const reference = referenceSelections[dimension.id];
        if (!reference) return dimension;
        return applyAiVisualToDimension(dimension, reference, preserveUserVisual);
      });
    }
  }

  if (!visualDimensionsReady(visualDimensions)) return project;

  const mechanismVisualExtended = meta?.visualExtended ?? project.ai?.mechanism?.visualExtended;
  return {
    ...project,
    mechanism: {
      ...project.mechanism,
      visualDimensions,
      visualExpanded: project.mechanism.visualExpanded || Boolean(meta?.planId ?? project.mechanism.selectedInfoPlanId),
    },
    ai: project.ai
      ? {
          ...project.ai,
          visualGrammar: meta,
          visualGrammarSource: meta?.source,
          mechanism: project.ai.mechanism
            ? { ...project.ai.mechanism, visualExtended: mechanismVisualExtended }
            : mechanismVisualExtended
              ? { visualSelections: {}, visualExtended: mechanismVisualExtended }
              : project.ai.mechanism,
        }
      : project.ai,
  };
}

export function applyVisualGrammarCache(project: ProjectState, preserveUserVisual = true): ProjectState {
  const planId = project.mechanism.selectedInfoPlanId;
  if (!planId || !project.ai?.visualGrammar) return project;
  const key = buildVisualGrammarKey(project, planId);
  if (project.ai.visualGrammar.key !== key) return project;
  return applyVisualSelectionsToProject(project, project.ai.visualGrammar.visualSelections, preserveUserVisual, project.ai.visualGrammar);
}

export function applyReferenceVisualSelections(project: ProjectState, preserveUserVisual = true): ProjectState {
  const planId = project.mechanism.selectedInfoPlanId;
  if (!planId) return project;

  const plan = project.mechanism.infoPlans.find((item) => item.id === planId && !item.isPlaceholder);
  if (!plan) return project;

  const selections = buildReferenceVisualSelections({
    infoPlan: plan,
    rawInput: project.rawInput,
    intent: project.intent,
  });

  if (!hasAiVisualSelections(selections)) return project;

  const meta: AiVisualGrammarResult = {
    visualSelections: selections,
    planId,
    key: buildVisualGrammarKey(project, planId),
    source: "reference-fallback",
  };

  return applyVisualSelectionsToProject(project, selections, preserveUserVisual, meta);
}

export function applyVisualAfterPlanSelect(project: ProjectState): ProjectState {
  return applyVisualGrammarCache(project, true);
}

export function applyVisualGrammarResult(
  project: ProjectState,
  result: {
    visualSelections: Partial<Record<VisualId, AiVisualSelection>>;
    visualExtended?: string;
    source: AiVisualGrammarResult["source"];
  },
  preserveUserVisual = true,
): ProjectState {
  const planId = project.mechanism.selectedInfoPlanId;
  if (!planId) return project;
  const meta: AiVisualGrammarResult = {
    visualSelections: result.visualSelections,
    visualExtended: result.visualExtended,
    planId,
    key: buildVisualGrammarKey(project, planId),
    source: result.source,
  };
  return applyVisualSelectionsToProject(project, result.visualSelections, preserveUserVisual, meta);
}

export function setAiTaskStatus(
  ai: AiProjectState | undefined,
  task: keyof AiProjectState["tasks"],
  status: AiProjectState["tasks"][typeof task],
  error?: string,
): AiProjectState {
  const base = ai ?? { tasks: { brief: "idle", mechanism: "idle", visual: "idle", generate: "idle" }, errors: {} };
  return {
    ...base,
    tasks: { ...base.tasks, [task]: status },
    errors: error ? { ...base.errors, [task]: error } : { ...base.errors, [task]: undefined },
  };
}

export function buildMechanismKey(project: ProjectState) {

  return [project.rawInput, ...project.intent.dimensions.map((dimension) => dimension.selectedOptionId ?? "")].join("::");

}



export function clearMechanismAiCache(project: ProjectState): ProjectState {

  if (!project.ai) return project;

  return {

    ...project,

    ai: {

      ...project.ai,

      mechanism: undefined,

      mechanismKey: undefined,

      mechanismSource: undefined,

      visualGrammar: undefined,
      visualGrammarSource: undefined,

      tasks: { ...project.ai.tasks, mechanism: "idle", visual: "idle" },

      errors: { ...project.ai.errors, mechanism: undefined },

    },

  };

}



export function resetAiAfterIntentChange(project: ProjectState): ProjectState {

  if (!project.ai) return project;

  return {

    ...project,

    ai: {

      ...project.ai,

      mechanism: undefined,

      generatedHtml: undefined,

      generationKey: undefined,

      mechanismKey: undefined,

      visualGrammar: undefined,
      visualGrammarSource: undefined,

      tasks: { ...project.ai.tasks, mechanism: "idle", visual: "idle", generate: "idle" },

      errors: { ...project.ai.errors, mechanism: undefined, visual: undefined, generate: undefined },

    },

  };

}



export function invalidateGeneration(project: ProjectState): ProjectState {

  if (!project.ai) return project;

  return {

    ...project,

    ai: {

      ...project.ai,

      generatedHtml: undefined,

      generationKey: undefined,

      tasks: { ...project.ai.tasks, generate: "idle" },

      errors: { ...project.ai.errors, generate: undefined },

    },

  };

}
