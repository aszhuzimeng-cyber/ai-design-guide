/**
 * 应用层入口：仅导出 UI / 编排需要的符号。
 * 模块内部请直接 import ./apply、./designReference 等。
 */
export { isDeepSeekConfigured } from "./deepseek";
export {
  applyVisualAfterPlanSelect,
  buildMechanismKey,
  buildVisualGrammarKey,
  invalidateVisualGrammarCache,
  isVisualGrammarAiCacheReady,
} from "./apply";
export {
  attachAiToNewProject,
  clearSpendBlockForRetry,
  markIntentDirty,
  prepareProjectForMechanism,
  prefetchMechanismAnalysis,
  runBriefAnalysis,
  runMechanismAnalysis,
  runVisualGrammarAnalysis,
  runPageGeneration,
  runInfoPlanOrchestration,
  touchGenerationInvalidation,
} from "./projectAi";
