import type { IntentSelectionInput } from "../catalog";
import { buildIntentSummary } from "../intentUtils";
import type { InfoPlan, ProjectState } from "../types";
import {
  applyBriefToProject,
  applyMechanismPlans,
  applyVisualAfterPlanSelect,
  applyVisualGrammarResult,
  applyReferenceVisualSelections,
  buildMechanismKey,
  buildVisualGrammarKey,
  clearMechanismAiCache,
  invalidateGeneration,
  isVisualGrammarAiCacheReady,
  resetAiAfterIntentChange,
  setAiTaskStatus,
} from "./apply";
import { isDeepSeekConfigured, isBillingErrorMessage, isModuleOrchestrationAiEnabled, isSpendBlockedGlobally, clearSpendLocksForRetry, BILLING_BLOCKED_MESSAGE } from "./deepseek";
import { setBillingBlockedGlobally } from "./billingGuard";
import { buildGenerationBrief, buildGenerationKey } from "./generation";
import { buildEnforcedStyleBlock } from "./generationBindings";
import { orchestrateInfoPlanModules, parseBriefAndIntent, prepareMechanism, prepareVisualGrammar, generatePageHtml } from "./pipeline";
import { applyLocalInfoPlanModuleChange, mergeOrchestratedInfoPlan } from "./infoPlanOrchestration";
import { buildMechanismFallbackFromReference } from "./designReference";
import { createAiState, type AiProjectState } from "./types";

export type ProjectUpdater = (
  updater: (current: ProjectState) => ProjectState,
  options?: { persistHistory?: boolean },
) => void;

type AiAbortBag = {
  brief?: AbortController | null;
  mechanism?: AbortController | null;
  visual?: AbortController | null;
  generate?: AbortController | null;
};

const aiInflight = {
  briefProjectId: null as string | null,
  mechanismKey: null as string | null,
  visualGrammarKey: null as string | null,
  generationKey: null as string | null,
};

type MechanismJob = {
  promise: Promise<Awaited<ReturnType<typeof prepareMechanism>>>;
  controller: AbortController;
};

const mechanismJobs = new Map<string, MechanismJob>();

function buildMechanismPrepareInput(project: ProjectState, userEdits: Record<string, string>) {
  return {
    rawInput: project.rawInput,
    intentSummary: buildIntentSummary(project.intent.dimensions),
    intent: project.intent,
    inputConstraints: project.ai?.brief?.inputConstraints ?? [],
    spokenConstraints: project.ai?.brief?.spokenConstraints ?? [],
    plans: plansForMechanism(project),
    userEdits,
  };
}

function getOrCreateMechanismJob(project: ProjectState, userEdits: Record<string, string>): MechanismJob {
  const mechanismKey = buildMechanismKey(project);
  const existing = mechanismJobs.get(mechanismKey);
  if (existing && !existing.controller.signal.aborted) {
    return existing;
  }

  const controller = new AbortController();
  const promise = prepareMechanism({
    ...buildMechanismPrepareInput(project, userEdits),
    signal: controller.signal,
  }).finally(() => {
    const job = mechanismJobs.get(mechanismKey);
    if (job?.controller === controller) {
      mechanismJobs.delete(mechanismKey);
    }
    if (aiInflight.mechanismKey === mechanismKey) {
      aiInflight.mechanismKey = null;
    }
  });
  const job = { promise, controller };
  mechanismJobs.set(mechanismKey, job);
  return job;
}

export function abortMechanismPrefetch(project: ProjectState) {
  const mechanismKey = buildMechanismKey(project);
  mechanismJobs.get(mechanismKey)?.controller.abort();
  mechanismJobs.delete(mechanismKey);
  if (aiInflight.mechanismKey === mechanismKey) {
    aiInflight.mechanismKey = null;
  }
}

export function prefetchMechanismAnalysis(project: ProjectState) {
  if (!isDeepSeekConfigured()) return;
  if (isSpendBlocked(project)) return;
  getOrCreateMechanismJob(project, {});
}

function intentSelectionInput(project: ProjectState): IntentSelectionInput[] {
  return project.intent.dimensions.map((dimension) => ({
    dimensionId: dimension.id,
    selectedOptionId: dimension.selectedOptionId,
    options: dimension.options,
  }));
}

function plansForMechanism(project: ProjectState): Array<{
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
  contentModules?: ProjectState["mechanism"]["infoPlans"][number]["contentModules"];
  previewWireframe?: Record<string, unknown>;
  userEdit?: string;
}> {
  return project.mechanism.infoPlans
    .filter((plan) => !plan.isPlaceholder && (plan.isCustom || plan.source === "user-added"))
    .map((plan) => ({
      id: plan.id,
      title: plan.title,
      structure: plan.structure,
      summary: plan.summary,
      reason: plan.reason,
      pageArchitecture: plan.pageArchitecture,
      pageFrame: plan.pageFrame,
      firstScreen: plan.firstScreen,
      contentFlow: plan.contentFlow,
      componentPatterns: plan.componentPatterns,
      layoutDecisions: plan.layoutDecisions,
      sections: plan.sections,
      contentModules: plan.contentModules,
      previewWireframe: plan.previewWireframe,
      userEdit: plan.userEdit,
    }));
}

function markBillingBlocked(ai: ProjectState["ai"], message: string): ProjectState["ai"] {
  setBillingBlockedGlobally();
  const base = ai ?? createAiState();
  return { ...base, billingBlocked: true, errors: { ...base.errors, brief: message } };
}

function isSpendBlocked(project: ProjectState) {
  return isSpendBlockedGlobally() || Boolean(project.ai?.billingBlocked);
}

function withBillingError(ai: ProjectState["ai"] | undefined, task: keyof AiProjectState["tasks"], message: string) {
  const base = markBillingBlocked(ai, message) ?? createAiState();
  return setAiTaskStatus(base, task, "error", message);
}

export function clearSpendBlockForRetry(project: ProjectState): ProjectState {
  clearSpendLocksForRetry();
  if (!project.ai) return project;
  return {
    ...project,
    ai: {
      ...project.ai,
      billingBlocked: false,
      errors: {
        ...project.ai.errors,
        brief: undefined,
        mechanism: undefined,
        visual: undefined,
        generate: undefined,
      },
    },
  };
}

export function attachAiToNewProject(project: ProjectState): ProjectState {
  const base = { ...project, ai: setAiTaskStatus(createAiState(), "brief", "idle") };
  if (!isSpendBlockedGlobally()) return base;
  return {
    ...base,
    ai: {
      ...base.ai!,
      billingBlocked: true,
      errors: { ...base.ai!.errors, brief: BILLING_BLOCKED_MESSAGE },
    },
  };
}

export function markIntentDirty(project: ProjectState): ProjectState {
  abortMechanismPrefetch(project);
  return resetAiAfterIntentChange(project);
}

export function prepareProjectForMechanism(project: ProjectState): ProjectState {
  return clearMechanismAiCache(project);
}

export async function runBriefAnalysis(
  project: ProjectState,
  updateProject: ProjectUpdater,
  abortBag: AiAbortBag,
) {
  const projectId = project.id;
  abortBag.brief?.abort();
  const controller = new AbortController();
  abortBag.brief = controller;

  if (isSpendBlocked(project)) return;

  if (!isDeepSeekConfigured()) {
    updateProject((current) => {
      if (current.id !== projectId) return current;
      return {
        ...current,
        ai: {
          ...setAiTaskStatus(current.ai, "brief", "error", "未配置 DeepSeek API Key，请配置 DEEPSEEK_API_KEY 并重启开发服务"),
          briefSource: "reference-fallback",
        },
      };
    });
    return;
  }

  if (aiInflight.briefProjectId === projectId) return;
  aiInflight.briefProjectId = projectId;

  updateProject((current) => {
    if (current.id !== projectId) return current;
    return { ...current, ai: setAiTaskStatus(current.ai, "brief", "loading") };
  });

  try {
    const brief = await parseBriefAndIntent({
      rawInput: project.rawInput,
      signal: controller.signal,
    });

    updateProject((current) => {
      if (controller.signal.aborted) return current;
      if (current.id !== projectId) return current;
      return applyBriefToProject(current, brief);
    });
  } catch (error) {
    if (controller.signal.aborted) return;
    const message = error instanceof Error ? error.message : "分析失败";
    updateProject((current) => {
      if (current.id !== projectId) return current;
      const ai = isBillingErrorMessage(message)
        ? withBillingError(current.ai, "brief", message)
        : setAiTaskStatus(current.ai, "brief", "error", message);
      return {
        ...current,
        ai: { ...ai, briefSource: "reference-fallback" as const },
      };
    });
  } finally {
    if (aiInflight.briefProjectId === projectId) aiInflight.briefProjectId = null;
  }
}

function formatMechanismError(error: unknown) {
  if (!(error instanceof Error)) return "表达机制分析失败";
  if (/余额不足|Insufficient Balance/i.test(error.message)) return error.message;
  if (/JSON|synthesizedPlans|recommendedPlanId|parse/i.test(error.message)) {
    return "机制分析失败：AI 返回格式不完整，请点击重新生成";
  }
  return error.message;
}

export async function runMechanismAnalysis(
  project: ProjectState,
  updateProject: ProjectUpdater,
  abortBag: AiAbortBag,
  createMechanism: (intent: ProjectState["intent"], rawInput: string, previous?: ProjectState["mechanism"]) => ProjectState["mechanism"],
) {
  const projectId = project.id;
  const mechanismKey = buildMechanismKey(project);

  if (isSpendBlocked(project)) return;

  if (!isDeepSeekConfigured()) {
    updateProject((current) => {
      if (current.id !== projectId) return current;
      return {
        ...current,
        ai: {
          ...setAiTaskStatus(current.ai, "mechanism", "error", "未配置 DeepSeek API Key，请配置 DEEPSEEK_API_KEY 并重启开发服务"),
          mechanismKey,
        },
      };
    });
    return;
  }

  if (aiInflight.mechanismKey === mechanismKey) {
    const existingJob = mechanismJobs.get(mechanismKey);
    if (existingJob) {
      abortBag.mechanism = existingJob.controller;
      await existingJob.promise.catch(() => undefined);
    }
    return;
  }
  aiInflight.mechanismKey = mechanismKey;

  const userEdits = Object.fromEntries(
    project.mechanism.infoPlans
      .filter((plan) => plan.userEdit)
      .map((plan) => [plan.id, plan.userEdit as string]),
  );
  const job = getOrCreateMechanismJob(project, userEdits);
  abortBag.mechanism = job.controller;

  updateProject((current) => {
    if (current.id !== projectId) return current;
    return {
      ...current,
      mechanism: {
        ...current.mechanism,
        visualDimensions: current.mechanism.visualDimensions.map((dimension) => ({
          ...dimension,
          options: [],
          selectedOptionId: undefined,
        })),
      },
      ai: setAiTaskStatus(current.ai, "mechanism", "loading"),
    };
  });

  try {
    const result = await job.promise;

    updateProject((current) => {
      if (current.id !== projectId || job.controller.signal.aborted) return current;
      if (current.ai?.mechanismKey === mechanismKey && current.ai?.tasks.mechanism === "done") {
        return current;
      }
      const withPlans = applyMechanismPlans(current, result, createMechanism);
      return {
        ...withPlans,
        ai: { ...withPlans.ai!, mechanismKey, mechanismSource: "ai" as const },
      };
    });
  } catch (error) {
    if (job.controller.signal.aborted) return;
    const failureMessage = formatMechanismError(error);
    try {
      const fallback = buildMechanismFallbackFromReference({
        intent: project.intent,
        rawInput: project.rawInput,
      });
      updateProject((current) => {
        if (current.id !== projectId || job.controller.signal.aborted) return current;
        const withPlans = applyMechanismPlans(current, fallback, createMechanism);
        return {
          ...withPlans,
          ai: {
            ...withPlans.ai!,
            mechanismKey,
            mechanismSource: "reference-fallback" as const,
            billingBlocked: isBillingErrorMessage(failureMessage) ? true : withPlans.ai?.billingBlocked,
            errors: { ...withPlans.ai?.errors, mechanism: failureMessage },
          },
        };
      });
      return;
    } catch {
      // reference fallback failed — surface original error
    }
    updateProject((current) => {
      if (current.id !== projectId) return current;
      const ai = isBillingErrorMessage(failureMessage)
        ? withBillingError(current.ai, "mechanism", failureMessage)
        : setAiTaskStatus(current.ai, "mechanism", "error", failureMessage);
      return { ...current, ai };
    });
  } finally {
    if (aiInflight.mechanismKey === mechanismKey) aiInflight.mechanismKey = null;
  }
}

export async function runPageGeneration(
  project: ProjectState,
  updateProject: ProjectUpdater,
  abortBag: AiAbortBag,
) {
  const projectId = project.id;
  const generationKey = buildGenerationKey(project);
  abortBag.generate?.abort();
  const controller = new AbortController();
  abortBag.generate = controller;

  if (project.ai?.generatedHtml && project.ai.generationKey === generationKey) {
    return;
  }

  if (aiInflight.generationKey === generationKey) return;
  aiInflight.generationKey = generationKey;

  if (isSpendBlocked(project)) return;

  if (!isDeepSeekConfigured()) {
    updateProject((current) => {
      if (current.id !== projectId) return current;
      return { ...current, ai: setAiTaskStatus(current.ai, "generate", "error", "未配置 AI 服务") };
    });
    return;
  }

  updateProject((current) => {
    if (current.id !== projectId) return current;
    const ai = setAiTaskStatus(current.ai, "generate", "loading");
    return {
      ...current,
      ai: { ...ai, generatedHtml: undefined, generationKey: undefined, generateStreamChars: undefined, errors: { ...ai.errors, generate: undefined } },
    };
  });

  try {
    const brief = buildGenerationBrief(project, intentSelectionInput(project), { compact: true });
    const enforcedStyles = buildEnforcedStyleBlock(project);
    const html = await generatePageHtml({
      brief,
      enforcedStyles,
      signal: controller.signal,
      onStreamProgress: (chars) => {
        updateProject((current) => {
          if (current.id !== projectId || controller.signal.aborted) return current;
          if (!current.ai) return current;
          return {
            ...current,
            ai: { ...current.ai, generateStreamChars: chars },
          };
        }, { persistHistory: false });
      },
    });

    updateProject((current) => {
      if (controller.signal.aborted) return current;
      if (current.id !== projectId) return current;
      const ai = setAiTaskStatus(current.ai, "generate", "done");
      return {
        ...current,
        ai: { ...ai, generatedHtml: html, generationKey, generateStreamChars: undefined },
      };
    });
  } catch (error) {
    if (controller.signal.aborted) return;
    const message = error instanceof Error ? error.message : "页面生成失败";
    updateProject((current) => {
      if (current.id !== projectId) return current;
      const ai = isBillingErrorMessage(message)
        ? withBillingError(current.ai, "generate", message)
        : setAiTaskStatus(current.ai, "generate", "error", message);
      return { ...current, ai };
    });
  } finally {
    if (aiInflight.generationKey === generationKey) aiInflight.generationKey = null;
  }
}

function formatVisualGrammarError(error: unknown) {
  if (!(error instanceof Error)) return "视觉语法生成失败";
  if (/余额不足|Insufficient Balance/i.test(error.message)) return error.message;
  if (/JSON|visualSelections|不完整|parse/i.test(error.message)) {
    return "视觉语法失败：AI 返回格式不完整，请点击重新生成";
  }
  return error.message;
}

export type VisualGrammarRunOptions = {
  force?: boolean;
};

export async function runVisualGrammarAnalysis(
  getProject: () => ProjectState,
  updateProject: ProjectUpdater,
  abortBag: AiAbortBag,
  options?: VisualGrammarRunOptions,
) {
  const project = getProject();
  const projectId = project.id;
  const planId = project.mechanism.selectedInfoPlanId;
  if (!planId) return;

  if (isSpendBlocked(project)) return;

  const grammarKey = buildVisualGrammarKey(project, planId);
  if (!options?.force && isVisualGrammarAiCacheReady(project, grammarKey)) {
    return;
  }

  if (!options?.force && aiInflight.visualGrammarKey === grammarKey) return;

  const plan = project.mechanism.infoPlans.find((item) => item.id === planId && !item.isPlaceholder);
  if (!plan) return;

  abortBag.visual?.abort();
  const controller = new AbortController();
  abortBag.visual = controller;
  aiInflight.visualGrammarKey = grammarKey;

  const applyFallback = (errorMessage: string) => {
    updateProject((current) => {
      if (current.id !== projectId || controller.signal.aborted) return current;
      const fallback = applyReferenceVisualSelections(current, false);
      const ai = setAiTaskStatus(fallback.ai, "visual", "done");
      return {
        ...fallback,
        ai: {
          ...ai,
          visualGrammarSource: "reference-fallback" as const,
          billingBlocked: isBillingErrorMessage(errorMessage) ? true : ai?.billingBlocked,
          errors: {
            ...ai?.errors,
            visual: errorMessage,
          },
        },
      };
    });
  };

  if (!isDeepSeekConfigured()) {
    updateProject((current) => {
      if (current.id !== projectId) return current;
      return {
        ...current,
        ai: setAiTaskStatus(
          current.ai,
          "visual",
          "error",
          "未配置 DeepSeek API Key，请配置 DEEPSEEK_API_KEY 并重启开发服务",
        ),
      };
    });
    return;
  }

  updateProject((current) => {
    if (current.id !== projectId) return current;
    return {
      ...current,
      mechanism: {
        ...current.mechanism,
        visualDimensions: current.mechanism.visualDimensions.map((dimension) => ({
          ...dimension,
          options: [],
          selectedOptionId: undefined,
        })),
      },
      ai: setAiTaskStatus(current.ai, "visual", "loading"),
    };
  });

  try {
    const snapshot = getProject();
    const activePlan =
      snapshot.mechanism.infoPlans.find((item) => item.id === planId && !item.isPlaceholder) ?? plan;
    const result = await prepareVisualGrammar({
      rawInput: snapshot.rawInput,
      intentSummary: buildIntentSummary(snapshot.intent.dimensions),
      inputConstraints: snapshot.ai?.brief?.inputConstraints ?? [],
      spokenConstraints: snapshot.ai?.brief?.spokenConstraints ?? [],
      infoPlan: activePlan,
      intent: snapshot.intent,
      signal: controller.signal,
    });

    updateProject((current) => {
      if (current.id !== projectId || controller.signal.aborted) return current;
      if (current.mechanism.selectedInfoPlanId !== planId) return current;
      const withVisual = applyVisualGrammarResult(
        current,
        { visualSelections: result.visualSelections, visualExtended: result.visualExtended, source: "ai" },
        false,
      );
      const optionsReady = withVisual.mechanism.visualDimensions.every((dimension) => dimension.options.length > 0);
      if (!optionsReady) {
        throw new Error("视觉选项未能应用到界面");
      }
      return {
        ...withVisual,
        ai: {
          ...setAiTaskStatus(withVisual.ai, "visual", "done"),
          visualGrammarSource: "ai" as const,
          errors: { ...withVisual.ai?.errors, visual: undefined },
        },
      };
    });
  } catch (error) {
    if (controller.signal.aborted) return;
    applyFallback(formatVisualGrammarError(error));
  } finally {
    if (aiInflight.visualGrammarKey === grammarKey) aiInflight.visualGrammarKey = null;
  }
}

export async function runInfoPlanOrchestration(
  project: ProjectState,
  planId: string,
  action: { type: "add"; label: string } | { type: "remove"; moduleId: string; label: string },
  updateProject: ProjectUpdater,
) {
  const projectId = project.id;
  const plan = project.mechanism.infoPlans.find((item) => item.id === planId);
  if (!plan || plan.isPlaceholder) return;

  const applyPatch = (patch: Partial<InfoPlan>) => {
    updateProject((current) => {
      if (current.id !== projectId) return current;
      return touchGenerationInvalidation({
        ...current,
        mechanism: {
          ...current.mechanism,
          infoPlans: current.mechanism.infoPlans.map((item) =>
            item.id === planId ? mergeOrchestratedInfoPlan(item, patch) : item,
          ),
        },
      });
    });
  };

  if (isSpendBlocked(project)) return;

  if (!isDeepSeekConfigured() || !isModuleOrchestrationAiEnabled()) {
    applyPatch(applyLocalInfoPlanModuleChange(plan, action));
    return;
  }

  try {
    const patch = await orchestrateInfoPlanModules({
      rawInput: project.rawInput,
      intentSummary: buildIntentSummary(project.intent.dimensions),
      intent: project.intent,
      inputConstraints: project.ai?.brief?.inputConstraints ?? [],
      spokenConstraints: project.ai?.brief?.spokenConstraints ?? [],
      plan,
      action,
    });
    applyPatch(patch);
  } catch {
    applyPatch(applyLocalInfoPlanModuleChange(plan, action));
  }
}

export function touchGenerationInvalidation(project: ProjectState): ProjectState {
  return invalidateGeneration(project);
}
