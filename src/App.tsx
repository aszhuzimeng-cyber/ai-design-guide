import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  ChevronDown,
  ChevronUp,
  Clock,
  Diamond,
  Fullscreen,
  Globe2,
  GripVertical,
  Image as ImageIcon,
  LayoutGrid,
  Lightbulb,
  Megaphone,
  MoreVertical,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Copy,
  RotateCcw,
  Sparkles,
  Trash2,
  Type,
  Users,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import {
  MeasuredTreeLines,
  attachLayoutMeasurement,
  buildMergeCurvePath,
  buildStraightConnectorPath,
  measureBranchLineOrigin,
  readAnchorLine,
} from "./treeLines";
import type { TreeEdge } from "./treeLines";
import {
  animateViewportTransform,
  applyViewportTransform,
  resolveViewportPanDuration,
  roundViewportTransform,
  VIEWPORT_FOCUS_DEBOUNCE_MS,
  VIEWPORT_PAN_BASE_MS,
  VIEWPORT_PAN_VISUAL_MS,
  VIEWPORT_SETTLE_MS,
  VIEWPORT_SKIP_RECENT_MS,
  VIEWPORT_STAGE_FIT_DELAY_MS,
  VIEWPORT_VISUAL_FOCUS_DELAY_MS,
  VIEWPORT_VISUAL_SETTLE_MS,
  viewportTransformDistance,
  type ViewportTransform,
} from "./viewportMotion";
import {
  fillPlanSlots,
  resolveProjectPageLabel,
} from "./catalog";
import {
  applyVisualAfterPlanSelect,
  invalidateVisualGrammarCache,
  runVisualGrammarAnalysis,
  attachAiToNewProject,
  buildMechanismKey,
  buildVisualGrammarKey,
  isVisualGrammarAiCacheReady,
  markIntentDirty,
  prepareProjectForMechanism,
  prefetchMechanismAnalysis,
  runBriefAnalysis,
  runMechanismAnalysis,
  runInfoPlanOrchestration,
  runPageGeneration,
  touchGenerationInvalidation,
  clearSpendBlockForRetry,
} from "./ai";
import { clearSpendLocksForRetry, isSpendBlockedGlobally, isAutoAiDisabled, getSpendGuardSnapshot, BILLING_BLOCKED_MESSAGE, BURST_BLOCKED_MESSAGE } from "./ai/deepseek";
import { normalizeUserAddedOption, normalizeUserAddedVisualOption } from "./ai/designReference";
import { getPlanContentModules, removeModuleFromInfoPlan, setModuleOrderInInfoPlan } from "./infoArchitecture";
import {
  buildPlanCardNote,
  formatPlanTitle,
  isWireframePlan,
  PlanTextPreview,
  PlanWireframePreview,
} from "./planLoFi";
import { resolveVisualGrammarDisplay } from "./visualGrammarDisplay";
import { DimensionTokenChips, VisualRecipePreview } from "./visualRecipePreview";
import { buildGenerationKey } from "./ai/generation";
import { InputRootNode } from "./components/InputRootNode";
import { downloadProjectHtml } from "./exportHtml";
import { importHtmlToMasterGoCanvas, type MasterGoCanvasImportResult } from "./mastergoExport";
import { MasterGoExportModal } from "./components/MasterGoExportModal";
import { createIntentState, createMechanismState, rehydrateIntentState, repairFallbackIntentOptions } from "./intentFallback";
import { buildDesignIntentText } from "./intentUtils";
import { hasGeneratedBrief, isIntentComplete } from "./projectGuards";
import { normalizeId } from "./utils/id";
import type {
  CanvasAnchor,
  DimensionId,
  InfoPlan,
  IntentDimension,
  IntentState,
  MechanismState,
  OptionItem,
  OptionSignal,
  ProjectState,
  Stage,
  VisualDimension,
  VisualId,
} from "./types";

type AiAbortBag = {
  brief?: AbortController | null;
  mechanism?: AbortController | null;
  visual?: AbortController | null;
  generate?: AbortController | null;
};

type ViewportFocusAlign = "right" | "center" | "contain";

type ViewportFocusHandler = (
  selector: string,
  align?: ViewportFocusAlign,
  paddingX?: number,
  paddingY?: number,
  options?: ViewportFocusOptions,
) => void;

type ViewportFitOptions = { force?: boolean; paddingX?: number; paddingY?: number; overviewFit?: boolean };

type CommitViewportOptions = {
  animate?: boolean;
  force?: boolean;
  durationMs?: number;
  onComplete?: () => void;
};

type ViewportFitHandler = (selector: string, options?: ViewportFitOptions) => void;

type CanvasViewportFrame = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

const INTENT_VIEWPORT_LIFT = 36;
const INTENT_STAGE_FIT_PADDING_X = 56;
const INTENT_STAGE_FIT_PADDING_Y = 56;
const INTENT_STAGE_ACTION_BAR_RESERVE = 112;
const MECHANISM_INFO_FIT_PADDING_X = 56;
const MECHANISM_INFO_FIT_BOTTOM_PADDING = 96;
const MECHANISM_INFO_VIEWPORT_TOP = 88;
const VISUAL_VIEWPORT_SHIFT_LEFT = 72;
const VISUAL_VIEWPORT_RAIL_GAP = 40;
let scheduledViewportFocusTimer: number | null = null;

function clearScheduledViewportFocus() {
  if (scheduledViewportFocusTimer !== null) {
    window.clearTimeout(scheduledViewportFocusTimer);
    scheduledViewportFocusTimer = null;
  }
}
const VIEWPORT_FOCUS_MIN_DELTA = 18;
const VIEWPORT_FOCUS_SKIP_DELTA = 5;
const CANVAS_BASE_SCALE = 1.023;
const HOME_PROMPT_MAX_LENGTH = 500;

function getCanvasViewportFrame(surface: HTMLElement): CanvasViewportFrame {
  const surfaceRect = surface.getBoundingClientRect();

  const stepRail = surface.parentElement?.querySelector<HTMLElement>(".step-rail");
  const railRect = stepRail?.getBoundingClientRect();
  const railGap = VISUAL_VIEWPORT_RAIL_GAP;
  const right = railRect ? Math.min(surfaceRect.right, railRect.left - railGap) : surfaceRect.right - 172;

  const left = surfaceRect.left;
  const top = surfaceRect.top;
  const bottom = surfaceRect.bottom;
  const width = Math.max(320, right - left);
  const height = surfaceRect.height;
  const centerX = left + width / 2;

  return {
    left,
    right,
    top,
    bottom,
    width,
    height,
    centerX,
    centerY: top + height / 2,
  };
}

function unionClientRects(rects: DOMRect[]) {
  if (rects.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  return new DOMRect(left, top, right - left, bottom - top);
}

function resolveIntentStageFocusRect(scope: HTMLElement) {
  const rects = [
    '[data-tree-anchor="input-root"]',
    '[data-tree-anchor="recognition-root"]',
    ".recognition-node",
    ".question-row",
    '[data-tree-anchor^="intent-question-"]',
    '[data-tree-anchor^="intent-option-"]',
    '[data-tree-anchor="intent-summary"]',
    ".intent-summary",
    ".intent-complete-focus",
  ]
    .flatMap((item) => Array.from(scope.querySelectorAll<HTMLElement>(item)))
    .map((node) => node.getBoundingClientRect());
  return unionClientRects(rects);
}

function resolveFocusBlockRect(world: HTMLElement, block: HTMLElement, selector: string) {
  const isIntentCompleteFocus =
    selector.includes("intent-complete") ||
    selector.includes("is-intent-complete") ||
    block.classList.contains("intent-complete-focus") ||
    (block.classList.contains("intent-stage") && block.classList.contains("is-intent-complete"));

  if (isIntentCompleteFocus || selector === ".intent-stage" || block.classList.contains("intent-stage")) {
    const scope = block.classList.contains("intent-stage") ? block : block.closest<HTMLElement>(".intent-stage") ?? block;
    return resolveIntentStageFocusRect(scope) ?? block.getBoundingClientRect();
  }

  if (selector.startsWith('[data-tree-anchor="mechanism-visual-dimension-') || block.classList.contains("visual-title")) {
    const dimension = block.closest<HTMLElement>(".visual-dimension");
    if (dimension) {
      return dimension.getBoundingClientRect();
    }
  }

  if (selector === ".visual-panel" || block.classList.contains("visual-panel")) {
    const panel = block.classList.contains("visual-panel") ? block : block;
    const rects = Array.from(
      panel.querySelectorAll<HTMLElement>(".tree-panel-head, .visual-branch-track, .visual-dimension"),
    ).map((node) => node.getBoundingClientRect());
    return unionClientRects(rects) ?? block.getBoundingClientRect();
  }

  if (selector === ".info-panel" || block.classList.contains("info-panel")) {
    const panel = block.classList.contains("info-panel") ? block : block;
    const rects = Array.from(
      panel.querySelectorAll<HTMLElement>(
        ".tree-panel-head, .info-plan-branch, .info-plan-grid, .info-card, [data-tree-anchor^='mechanism-info-plan-']",
      ),
    ).map((node) => node.getBoundingClientRect());
    return unionClientRects(rects) ?? block.getBoundingClientRect();
  }

  return block.getBoundingClientRect();
}

function clampViewportPan(
  blockRect: DOMRect,
  frame: CanvasViewportFrame,
  deltaX: number,
  deltaY: number,
  paddingX: number,
  paddingY: number,
) {
  let nextX = deltaX;
  let nextY = deltaY;
  const minLeft = frame.left + paddingX;
  const maxRight = frame.right - paddingX;
  const minTop = frame.top + paddingY;
  const maxBottom = frame.bottom - paddingY;
  const viewportHeight = maxBottom - minTop;

  if (blockRect.left + nextX < minLeft) {
    nextX += minLeft - (blockRect.left + nextX);
  }
  if (blockRect.right + nextX > maxRight) {
    nextX -= blockRect.right + nextX - maxRight;
  }

  if (blockRect.height > viewportHeight) {
    nextY = frame.centerY - (blockRect.top + blockRect.height / 2);
  } else {
    if (blockRect.top + nextY < minTop) nextY += minTop - (blockRect.top + nextY);
    if (blockRect.bottom + nextY > maxBottom) nextY -= blockRect.bottom + nextY - maxBottom;
  }

  return { deltaX: nextX, deltaY: nextY };
}

function scheduleViewportFocus(
  focus: ViewportFocusHandler | undefined,
  selector: string,
  align: ViewportFocusAlign = "contain",
  paddingX = 72,
  paddingY = 64,
  delayMs = 0,
  options?: ViewportFocusOptions,
) {
  if (!focus) return () => undefined;
  clearScheduledViewportFocus();
  const run = () => {
    scheduledViewportFocusTimer = null;
    focus(selector, align, paddingX, paddingY, options);
  };
  if (delayMs <= 0) {
    run();
    return () => undefined;
  }
  scheduledViewportFocusTimer = window.setTimeout(run, delayMs);
  return clearScheduledViewportFocus;
}

const INTENT_QUESTION_FOCUS_PADDING_X = 48;
const INTENT_QUESTION_FOCUS_PADDING_Y = 48;

function scheduleIntentQuestionFocus(
  focus: ViewportFocusHandler | undefined,
  dimensionId: string,
  mode: "bootstrap" | "live",
  delayMs = 280,
) {
  if (!focus) return () => undefined;
  const selector =
    mode === "bootstrap"
      ? '[data-tree-anchor="intent-first-question-slot"]'
      : `[data-tree-anchor="intent-question-${dimensionId}"]`;
  return scheduleViewportFocus(
    focus,
    selector,
    "contain",
    INTENT_QUESTION_FOCUS_PADDING_X,
    INTENT_QUESTION_FOCUS_PADDING_Y,
    delayMs,
  );
}

function scheduleViewportFit(
  fit: ViewportFitHandler | undefined,
  selector: string,
  options?: ViewportFitOptions & { delayMs?: number },
) {
  if (!fit) return () => undefined;
  const { delayMs = 0, ...fitOptions } = options ?? {};
  const run = () => fit(selector, fitOptions);
  if (delayMs <= 0) {
    run();
    return () => undefined;
  }
  const timer = window.setTimeout(run, delayMs);
  return () => window.clearTimeout(timer);
}

const CANVAS_STEPS: CanvasAnchor[] = ["input", "intent", "mechanism", "generate"];

function getStepIndex(step: CanvasAnchor) {
  return CANVAS_STEPS.indexOf(step);
}

function resolveMaxReachedStep(project: ProjectState): CanvasAnchor {
  if (project.maxReachedStep) return project.maxReachedStep;
  if (project.stage === "generate") return "generate";
  if (project.stage === "mechanism") return "mechanism";
  return "intent";
}

function bumpMaxReachedStep(current: CanvasAnchor | undefined, next: CanvasAnchor): CanvasAnchor {
  const baseline = current ?? "intent";
  return getStepIndex(next) > getStepIndex(baseline) ? next : baseline;
}

function hasReachedStep(project: ProjectState, step: CanvasAnchor) {
  return getStepIndex(step) <= getStepIndex(resolveMaxReachedStep(project));
}

type HistoryItem = {
  id: string;
  summary: string;
  createdAt: string;
  project: ProjectState;
};

type HistoryPeriod = "today" | "yesterday" | "before";

const HISTORY_PERIOD_LABELS: Record<HistoryPeriod, string> = {
  today: "今天",
  yesterday: "昨天",
  before: "之前",
};

function getHistoryPeriod(createdAt: string): HistoryPeriod {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "today";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (date >= startOfToday) return "today";
  if (date >= startOfYesterday) return "yesterday";
  return "before";
}

function groupHistoryItems(items: HistoryItem[]) {
  const groups: Record<HistoryPeriod, HistoryItem[]> = {
    today: [],
    yesterday: [],
    before: [],
  };

  items.forEach((item) => {
    groups[getHistoryPeriod(item.createdAt)].push(item);
  });

  return (Object.keys(HISTORY_PERIOD_LABELS) as HistoryPeriod[])
    .filter((period) => groups[period].length > 0)
    .map((period) => ({
      period,
      label: HISTORY_PERIOD_LABELS[period],
      items: groups[period],
    }));
}

type UpdateProject = (
  updater: (current: ProjectState) => ProjectState,
  options?: { persistHistory?: boolean },
) => void;

const HISTORY_KEY = "design-guide-history-v2";
const CURRENT_PROJECT_KEY = "design-guide-current-project-v2";
const DEFAULT_PROMPT = "做一个电商网页，有促销氛围。";
const CANVAS_WIDTH = 1800;
const INTENT_GROUP_WIDTH = 420;
const INTENT_GROUP_GAP = 40;
const INTENT_OPTION_LAYOUT_WIDTH = 200;
const INTENT_ADD_NODE_WIDTH = 248;
const INTENT_OPTION_LAYOUT_GAP = 16;
const INTENT_OPTION_MIN_WIDTH = 168;
const INTENT_OPTION_MAX_WIDTH = 320;
const INTENT_OPTION_CHAR_WIDTH = 15;
const INTENT_OPTION_BOX_PAD = 28;
const INTENT_OPTION_BADGE_WIDTH = 72;
const INTENT_OPTION_CHECK_WIDTH = 22;
const INTENT_OPTION_Y_GAP = 68;
const INTENT_BRANCH_WIDTH = INTENT_GROUP_WIDTH;
const INTENT_ROW_TOP = 378;
const INTENT_HEAD_HEIGHT = 76;
const INTENT_SUMMARY_TOP = 602;
const MECHANISM_INFO_X = 690;
const MECHANISM_VISUAL_X = 1110;
const MECHANISM_BRANCH_TOP = 96;
const INFO_PANEL_WIDTH = 360;
const INFO_HEAD_WIDTH = INFO_PANEL_WIDTH;
const INFO_HEAD_PLAN_GAP = 80;
const INFO_PLAN_CARD_WIDTH = 560;
const INFO_LOFI_PREVIEW_WIDTH = 280;
const INFO_PLAN_GAP = 28;
const MECHANISM_PLAN_CONNECTOR_HEIGHT = 34;
const VISUAL_DIMENSION_WIDTH = 380;
const VISUAL_DIMENSION_COLLAPSED_WIDTH = 272;
const VISUAL_DIMENSION_TITLE_MIN = 272;
const VISUAL_DIMENSION_GAP = 48;
const VISUAL_OPTION_CARD_WIDTH = 200;
const VISUAL_OPTION_H_GAP = 52;
const VISUAL_OPTION_BRANCH_PAD = 44;
const VISUAL_OPTION_CANVAS_WIDTH = 360;
const INTENT_OPTION_HEIGHT = 36;
const VISUAL_OPTION_HEIGHT = 380;
const VISUAL_OPTION_TOP_OFFSET = 24;
const VISUAL_TITLE_OPTION_GAP = 76;
const VISUAL_HEAD_DIMENSION_GAP = 80;
const MECHANISM_OPTION_ROW_TOP = 168;
const MECHANISM_FLOW_WIDTH = 1760;
const MECHANISM_PANEL_GAP = 80;
const VISUAL_OPTION_MIN_CARD_WIDTH = 136;

function getInfoPlanRowWidth(count: number) {
  if (count <= 0) return INFO_PLAN_CARD_WIDTH;
  const columns = Math.min(Math.max(1, count), 3);
  return columns * INFO_PLAN_CARD_WIDTH + Math.max(0, columns - 1) * INFO_PLAN_GAP;
}

function getInfoPanelWidth(planCount: number) {
  return Math.max(INFO_HEAD_WIDTH, getInfoPlanRowWidth(planCount));
}

function getMechanismVisualBudget(infoPanelWidth: number) {
  return Math.max(VISUAL_DIMENSION_WIDTH, MECHANISM_FLOW_WIDTH - infoPanelWidth - MECHANISM_PANEL_GAP);
}

function isIntentCollapsedWithSelection(dimension: IntentDimension) {
  return Boolean(dimension.selectedOptionId && !dimension.expanded);
}

function getIntentOptionDisplayPosition(
  dimension: IntentDimension,
  item: OptionItem,
  index: number,
  layoutPositions: Array<{ x: number; y: number }>,
) {
  const selected = dimension.options.find((option) => option.id === dimension.selectedOptionId);
  if (isIntentCollapsedWithSelection(dimension) && item.id === selected?.id && !item.moved) {
    return { x: 0, y: 48 };
  }
  if (item.moved && item.position) {
    return item.position;
  }
  return layoutPositions[index] ?? { x: 0, y: 48 };
}

function getSelectedOptionPosition(dimension: IntentDimension) {
  const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
  if (!selected) return null;
  const visibleOptions = getIntentVisibleOptions(dimension);
  const layout = buildIntentOptionLayoutForDimension(dimension, false);
  const index = visibleOptions.findIndex((item) => item.id === selected.id);
  return getIntentOptionDisplayPosition(dimension, selected, index, layout.positions);
}

function getIntentStageScale(stage: HTMLElement) {
  return stage.offsetWidth > 0 ? stage.getBoundingClientRect().width / stage.offsetWidth : 1;
}

function getMechanismStageScale(stage: HTMLElement) {
  return stage.offsetWidth > 0 ? stage.getBoundingClientRect().width / stage.offsetWidth : 1;
}

function measureMechanismStageLines(showVisual: boolean) {
  const stage = document.querySelector<HTMLElement>(".mechanism-stage");
  if (!stage) return null;

  const scale = getMechanismStageScale(stage);
  const stageRect = stage.getBoundingClientRect();
  const summaryRect = document.querySelector<HTMLElement>('[data-tree-anchor="intent-summary"]')?.getBoundingClientRect();
  const start = summaryRect
    ? {
        x: (summaryRect.left - stageRect.left + summaryRect.width / 2) / scale,
        y: (summaryRect.bottom - stageRect.top) / scale,
      }
    : { x: CANVAS_WIDTH / 2, y: 0 };

  const lines: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> = [];
  const targets = ["mechanism-info-head", ...(showVisual ? ["mechanism-visual-head"] : [])];

  targets.forEach((anchor) => {
    const head = stage.querySelector<HTMLElement>(`[data-tree-anchor="${anchor}"]`);
    if (!head) return;
    const headRect = head.getBoundingClientRect();
    lines.push({
      start,
      end: {
        x: (headRect.left - stageRect.left + headRect.width / 2) / scale,
        y: (headRect.top - stageRect.top) / scale,
      },
    });
  });

  return lines.length > 0 ? lines : null;
}

function getMechanismStageLineFallback(showVisual: boolean, stageWidth = CANVAS_WIDTH) {
  const centerX = stageWidth / 2;
  const start = { x: centerX, y: 0 };
  if (!showVisual) {
    return [{ start, end: { x: centerX, y: MECHANISM_BRANCH_TOP } }];
  }
  const lines = [{ start, end: { x: MECHANISM_INFO_X, y: MECHANISM_BRANCH_TOP } }];
  lines.push({ start, end: { x: MECHANISM_VISUAL_X, y: MECHANISM_BRANCH_TOP } });
  return lines;
}

function measureIntentMergeLines(intent: IntentState, stage: HTMLElement) {
  const summary = stage.querySelector<HTMLElement>('[data-tree-anchor="intent-summary"]');
  if (!summary) return null;

  const scale = getIntentStageScale(stage);
  const stageRect = stage.getBoundingClientRect();
  const summaryRect = summary.getBoundingClientRect();
  const end = {
    x: (summaryRect.left - stageRect.left + summaryRect.width / 2) / scale,
    y: (summaryRect.top - stageRect.top) / scale,
  };

  const lines = intent.dimensions.flatMap((dimension) => {
    const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
    if (!selected) return [];
    const node = stage.querySelector<HTMLElement>(`[data-tree-anchor="intent-option-${dimension.id}-${selected.id}"]`);
    if (!node) return [];
    const nodeRect = node.getBoundingClientRect();
    return [
      {
        start: {
          x: (nodeRect.left - stageRect.left + nodeRect.width / 2) / scale,
          y: (nodeRect.bottom - stageRect.top) / scale,
        },
        end,
      },
    ];
  });

  return lines.length > 0 ? lines : null;
}

function getIntentMergeLineFallback(
  intent: IntentState,
  nodeOffsets: Record<string, { x: number; y: number }>,
  slots: Array<{ dimension: IntentDimension; center: number }>,
  canvasWidth: number,
) {
  const end = { x: canvasWidth / 2 + (nodeOffsets.summary?.x ?? 0), y: INTENT_SUMMARY_TOP + (nodeOffsets.summary?.y ?? 0) };
  return intent.dimensions.flatMap((dimension) => {
    const position = getSelectedOptionPosition(dimension);
    if (!position) return [];
    const slot = slots.find((item) => item.dimension.id === dimension.id);
    const offset = nodeOffsets[dimension.id] ?? { x: 0, y: 0 };
    const centerX = slot?.center ?? canvasWidth / 2;
    return [
      {
        start: {
          x: centerX + position.x + offset.x,
          y: INTENT_ROW_TOP + INTENT_HEAD_HEIGHT + position.y + INTENT_OPTION_HEIGHT + offset.y,
        },
        end,
      },
    ];
  });
}

const examples = [
  { title: "学校官网", text: "做一个学校官网，清晰可信。", icon: "school" },
  { title: "电商首页", text: "做一个电商网页，有促销氛围。", icon: "shop" },
  { title: "作品集网站", text: "做一个个人作品集网站，突出作品质感。", icon: "portfolio" },
  { title: "活动宣传页", text: "做一个活动宣传页，希望用户快速了解并报名。", icon: "event" },
];

function option(label: string, signal?: OptionSignal): OptionItem {
  return { id: normalizeId(label), label, signal, knowledge: `${label}会影响后续的信息组织优先级和视觉表达强度。` };
}

function withPositions(options: OptionItem[]) {
  const layout = buildIntentOptionRowLayout(
    options.map((item) => ({ width: estimateIntentOptionWidth(item, false) })),
  );
  return options.map((item, index) => ({ ...item, position: item.position ?? layout.positions[index] }));
}

function estimateIntentOptionWidth(option: OptionItem, selected: boolean) {
  let width = option.label.length * INTENT_OPTION_CHAR_WIDTH + INTENT_OPTION_BOX_PAD;
  if (option.signal) width += INTENT_OPTION_BADGE_WIDTH + 7;
  if (selected) width += INTENT_OPTION_CHECK_WIDTH + 7;
  return Math.max(INTENT_OPTION_MIN_WIDTH, Math.min(INTENT_OPTION_MAX_WIDTH, Math.ceil(width)));
}

function buildIntentOptionRowLayout(items: Array<{ width: number }>, gap = INTENT_OPTION_LAYOUT_GAP) {
  if (items.length === 0) {
    return { positions: [] as Array<{ x: number; y: number }>, span: INTENT_BRANCH_WIDTH };
  }
  if (items.length === 1) {
    return {
      positions: [{ x: 0, y: 48 }],
      span: Math.max(INTENT_BRANCH_WIDTH, items[0].width + 32),
    };
  }
  const totalWidth = items.reduce((sum, item, index) => sum + item.width + (index > 0 ? gap : 0), 0);
  let cursor = -totalWidth / 2;
  const positions = items.map((item) => {
    const x = cursor + item.width / 2;
    cursor += item.width + gap;
    return { x, y: 48 };
  });
  return { positions, span: Math.max(INTENT_BRANCH_WIDTH, totalWidth + 32) };
}

function getIntentVisibleOptions(dimension: IntentDimension) {
  const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
  return selected && !dimension.expanded ? [selected] : dimension.options;
}

function buildIntentOptionLayoutForDimension(dimension: IntentDimension, adding: boolean) {
  const visibleOptions = getIntentVisibleOptions(dimension);
  if (isIntentCollapsedWithSelection(dimension)) {
    const selected = visibleOptions[0];
    const width = estimateIntentOptionWidth(selected, true);
    return { positions: [{ x: 0, y: 48 }], span: Math.max(INTENT_BRANCH_WIDTH, width + 32) };
  }
  const items = visibleOptions.map((option) => ({
    width: estimateIntentOptionWidth(option, option.id === dimension.selectedOptionId),
  }));
  if (adding) items.push({ width: INTENT_ADD_NODE_WIDTH });
  return buildIntentOptionRowLayout(items);
}

function defaultOptionPosition(index: number, total: number, widths?: number[]) {
  const items = widths?.length
    ? widths.map((width) => ({ width }))
    : Array.from({ length: total }, () => ({ width: INTENT_OPTION_LAYOUT_WIDTH }));
  return buildIntentOptionRowLayout(items).positions[index] ?? { x: 0, y: 48 };
}

function computeVisibleBranchNodeCount(visibleCount: number, adding: boolean) {
  return Math.max(1, visibleCount + (adding ? 1 : 0));
}

function computeIntentBranchLayoutCount(dimension: IntentDimension, adding: boolean) {
  const selected = dimension.selectedOptionId;
  const visibleOptionCount = selected && !dimension.expanded ? 1 : dimension.options.length;
  let count = visibleOptionCount + (adding ? 1 : 0);
  if (dimension.expanded && adding) {
    count = Math.max(count, dimension.options.length + 1);
  }
  return Math.max(1, count);
}

function getIntentSlotWidth(dimension: IntentDimension, adding: boolean) {
  return Math.max(INTENT_GROUP_WIDTH, buildIntentOptionLayoutForDimension(dimension, adding).span);
}

function useProgressiveFlow<T extends { selectedOptionId?: string }>(items: T[]) {
  const maxRevealedRef = useRef(0);
  const [introducedIds, setIntroducedIds] = useState<Set<string>>(() => new Set());
  const selectionKey = items.map((item) => item.selectedOptionId ?? "").join("|");

  useEffect(() => {
    if (items.length > 0 && items.every((item) => !item.selectedOptionId)) {
      maxRevealedRef.current = 0;
      setIntroducedIds(new Set());
    }
  }, [selectionKey, items.length]);

  const firstPendingIndex = items.findIndex((item) => !item.selectedOptionId);
  const lastSelectedIndex = items.reduce((max, item, index) => (item.selectedOptionId ? index : max), -1);
  const candidateRevealed =
    items.length === 0 ? 0 : firstPendingIndex === -1 ? items.length - 1 : Math.max(firstPendingIndex, lastSelectedIndex);
  maxRevealedRef.current = Math.max(maxRevealedRef.current, candidateRevealed);
  const visibleCount = items.length === 0 ? 0 : Math.min(items.length, maxRevealedRef.current + 1);
  const complete = items.length > 0 && firstPendingIndex === -1;

  const shouldIntro = (id: string) => !introducedIds.has(id);
  const markIntroduced = (id: string) => {
    setIntroducedIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  return { visibleCount, complete, shouldIntro, markIntroduced };
}

function getIntentRowLayout(dimensions: IntentDimension[], addingByDimension: Partial<Record<DimensionId, boolean>>) {
  const widths = dimensions.map((dimension) => getIntentSlotWidth(dimension, addingByDimension[dimension.id] ?? false));
  const gaps = Math.max(0, dimensions.length - 1) * INTENT_GROUP_GAP;
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + gaps;
  const canvasWidth = Math.max(CANVAS_WIDTH, totalWidth + 160);
  const offsetX = (canvasWidth - totalWidth) / 2;
  let cursor = offsetX;
  const slots = dimensions.map((dimension, index) => {
    const width = widths[index];
    const center = cursor + width / 2;
    cursor += width + (index < dimensions.length - 1 ? INTENT_GROUP_GAP : 0);
    return { dimension, width, center };
  });
  return { canvasWidth, totalWidth, slots };
}

function getVisualOptionRowWidth(total: number, cardWidth = VISUAL_OPTION_CARD_WIDTH, gap = VISUAL_OPTION_H_GAP) {
  if (total <= 0) return cardWidth;
  return total * cardWidth + Math.max(0, total - 1) * gap;
}

function getVisualOptionLayout(total: number) {
  const cardWidth = VISUAL_OPTION_CARD_WIDTH;
  const gap = total > 1 ? VISUAL_OPTION_H_GAP : 0;
  const rowWidth = getVisualOptionRowWidth(total, cardWidth, gap);
  const startX = -rowWidth / 2 + cardWidth / 2;
  return {
    cardWidth,
    rowWidth,
    positions: Array.from({ length: total }, (_, index) => ({
      x: startX + index * (cardWidth + gap),
      y: VISUAL_OPTION_TOP_OFFSET,
    })),
  };
}

function defaultVisualOptionPosition(index: number, total: number) {
  const layout = getVisualOptionLayout(total);
  return layout.positions[index] ?? { x: 0, y: VISUAL_OPTION_TOP_OFFSET };
}

function getVisualDimensionTitleWidth(dimension?: Pick<VisualDimension, "title" | "description">) {
  const contentWidth =
    dimension == null
      ? 248
      : Math.ceil(
          Math.max(dimension.title.length * 16 + 118, dimension.description.length * 13 + 52),
        );
  return Math.max(VISUAL_DIMENSION_COLLAPSED_WIDTH, VISUAL_DIMENSION_TITLE_MIN, getVisualOptionRowWidth(1) + 16, contentWidth);
}

function computeVisualBranchLayoutCount(dimension: VisualDimension, adding: boolean) {
  const selected = dimension.selectedOptionId;
  const visibleOptionCount = selected && !dimension.expanded ? 1 : dimension.options.length;
  let count = visibleOptionCount + (adding ? 1 : 0);
  if (dimension.expanded && adding) {
    count = Math.max(count, dimension.options.length + 1);
  }
  return Math.max(1, count);
}

function getVisualDimensionNaturalSlotWidth(dimension: VisualDimension, adding = false) {
  const titleWidth = getVisualDimensionTitleWidth(dimension);
  const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
  if (selected && !dimension.expanded) {
    return titleWidth;
  }
  const count = computeVisualBranchLayoutCount(dimension, adding);
  return Math.max(titleWidth, getVisualOptionRowWidth(count) + VISUAL_OPTION_BRANCH_PAD);
}

function getVisualDimensionBranchMinWidth(dimension: VisualDimension, adding = false) {
  const titleWidth = getVisualDimensionTitleWidth(dimension);
  if (!dimension.expanded) {
    return titleWidth;
  }
  const count = computeVisualBranchLayoutCount(dimension, adding);
  return Math.max(titleWidth, getVisualOptionRowWidth(count) + VISUAL_OPTION_BRANCH_PAD);
}

function getVisualBranchLayout(
  dimensions: VisualDimension[],
  visualBudget: number,
  addingByDimension: Partial<Record<VisualId, boolean>> = {},
) {
  const gaps = Math.max(0, dimensions.length - 1) * VISUAL_DIMENSION_GAP;
  const naturalWidths = dimensions.map((dimension) => getVisualDimensionNaturalSlotWidth(dimension, addingByDimension[dimension.id] ?? false));
  const naturalTotal = naturalWidths.reduce((sum, width) => sum + width, 0) + gaps;
  const widths = naturalWidths;

  let cursor = 0;
  const slots = dimensions.map((dimension, index) => {
    const width = widths[index];
    const center = cursor + width / 2;
    cursor += width + (index < dimensions.length - 1 ? VISUAL_DIMENSION_GAP : 0);
    return { dimension, width, center };
  });

  return {
    width: Math.max(VISUAL_DIMENSION_WIDTH, cursor),
    slots,
  };
}

function customIntentOption(label: string): OptionItem {
  return { ...option(label), ...normalizeUserAddedOption("intent", label), custom: true };
}

function resetVisualDimensionSelections(dimensions: VisualDimension[]): VisualDimension[] {
  return dimensions.map((dimension) => ({
    ...dimension,
    options: [],
    selectedOptionId: undefined,
    expanded: false,
  }));
}

function normalizeVisualDimensions(mechanism: MechanismState, intent: IntentState, _rawInput: string): MechanismState {
  return {
    ...mechanism,
    visualDimensions: mechanism.visualDimensions.map((dimension) => {
      const selectedOptionId = dimension.options.some((item) => item.id === dimension.selectedOptionId) ? dimension.selectedOptionId : undefined;
      return { ...dimension, selectedOptionId };
    }),
  };
}

function resolveHistoryPrompt(project: Pick<ProjectState, "userPrompt" | "rawInput">) {
  return (project.userPrompt ?? project.rawInput ?? "").trim();
}

function createProject(input: string): ProjectState {
  const prompt = input.trim();
  const intent = createIntentState(prompt);
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    rawInput: prompt,
    userPrompt: prompt,
    stage: "intent",
    maxReachedStep: "intent",
    intent,
    mechanism: createMechanismState(intent, prompt),
  };
}

function createHomeProject(): ProjectState {
  const intent = createIntentState("");
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    rawInput: "",
    stage: "home",
    maxReachedStep: "intent",
    intent,
    mechanism: createMechanismState(intent, ""),
  };
}

function rehydrateProjectWithCatalog(project: ProjectState): ProjectState {
  const intent = rehydrateIntentState(project.intent, project.rawInput);
  const mechanism = createMechanismState(intent, project.rawInput, {
    ...project.mechanism,
    visualDimensions: project.mechanism.visualDimensions,
  });
  const visualDimensions = mechanism.visualDimensions.map((dimension) => {
    const loaded = project.mechanism.visualDimensions.find((item) => item.id === dimension.id);
    const selectedOptionId = loaded?.selectedOptionId;
    const options = loaded?.options?.length ? loaded.options : dimension.options;
    return {
      ...dimension,
      options,
      selectedOptionId: options.some((item) => item.id === selectedOptionId) ? selectedOptionId : undefined,
      expanded: loaded?.expanded ?? false,
    };
  });
  const selectedInfoPlanId =
    project.mechanism.selectedInfoPlanId &&
    mechanism.infoPlans.some((plan) => plan.id === project.mechanism.selectedInfoPlanId && !plan.isPlaceholder)
      ? project.mechanism.selectedInfoPlanId
      : mechanism.selectedInfoPlanId;
  return applyVisualAfterPlanSelect({
    ...project,
    intent: { ...intent, designIntentText: buildDesignIntentText(intent.dimensions) },
    mechanism: { ...mechanism, visualDimensions, selectedInfoPlanId },
  });
}

export default function App() {
  const [project, setProject] = useState<ProjectState>(() => loadCurrentProject() ?? createHomeProject());
  const projectRef = useRef(project);
  projectRef.current = project;
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const aiAbortRef = useRef<AiAbortBag>({ brief: null, mechanism: null, visual: null, generate: null });

  useEffect(() => {
    setProject((current) => (current.stage === "home" ? current : rehydrateProjectWithCatalog(current)));
    setHistory(loadHistory());
    if (!isSpendBlockedGlobally()) return;
    setProject((current) => {
      if (current.stage === "home" || current.ai?.billingBlocked) return current;
      return {
        ...current,
        ai: {
          ...(current.ai ?? { tasks: { brief: "idle", mechanism: "idle", visual: "idle", generate: "idle" }, errors: {} }),
          billingBlocked: true,
        },
      };
    });
  }, []);

  useEffect(() => {
    if (project.stage !== "intent") return;
    if (hasGeneratedBrief(project)) return;
    if (project.ai?.tasks.brief === "loading") return;
    const repairedIntent = repairFallbackIntentOptions(project.intent, project.rawInput);
    if (repairedIntent === project.intent) return;
    setProject((current) => {
      if (current.stage !== "intent") return current;
      if (hasGeneratedBrief(current)) return current;
      if (current.ai?.tasks.brief === "loading") return current;
      const intent = repairFallbackIntentOptions(current.intent, current.rawInput);
      if (intent === current.intent) return current;
      return {
        ...current,
        intent,
        mechanism: createMechanismState(intent, current.rawInput, current.mechanism),
        ai: current.ai ? { ...current.ai, briefSource: "reference-fallback" as const } : current.ai,
      };
    });
  }, [project.id, project.stage, project.intent.dimensions]);

  useEffect(() => {
    if (project.stage !== "mechanism") return;
    if (!isIntentComplete(project.intent)) return;
    if (project.mechanism.infoPlans.some((plan) => !plan.isPlaceholder)) return;
    setProject((current) => {
      if (current.stage !== "mechanism") return current;
      if (!isIntentComplete(current.intent)) return current;
      if (current.mechanism.infoPlans.some((plan) => !plan.isPlaceholder)) return current;
      return {
        ...current,
        mechanism: createMechanismState(current.intent, current.rawInput, current.mechanism),
      };
    });
  }, [project.id, project.stage, project.intent, project.mechanism.infoPlans]);

  const updateProject: UpdateProject = (updater, options) => {
    setProject((current) => {
      const next = updater(current);
      if (options?.persistHistory !== false && next.stage !== "home" && resolveHistoryPrompt(next)) saveHistory(next, setHistory);
      return next;
    });
  };

  const handleHomeSubmit = (input: string) => {
    clearSpendLocksForRetry();
    const nextProject = attachAiToNewProject(createProject(input));
    updateProject(() => nextProject);
    void runBriefAnalysis(nextProject, updateProject, aiAbortRef.current);
  };

  useEffect(() => {
    saveCurrentProject(project);
  }, [project]);

  const duplicateHistoryItem = (item: HistoryItem) => {
    const copiedProject = cloneProject(item.project);
    setProject(copiedProject);
    saveHistory(copiedProject, setHistory);
  };

  const deleteHistoryItem = (item: HistoryItem) => {
    const next = history.filter((historyItem) => historyItem.id !== item.id);
    writeHistory(next, setHistory);
    if (project.id !== item.id) return;

    setProject(next[0]?.project ?? createHomeProject());
  };

  return (
    <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        project={project}
        history={history}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        onNew={() => setProject(createHomeProject())}
        onRestore={(item) => setProject(rehydrateProjectWithCatalog(item.project))}
        onDuplicate={duplicateHistoryItem}
        onDelete={deleteHistoryItem}
        onClear={() => {
          localStorage.removeItem(HISTORY_KEY);
          localStorage.removeItem(CURRENT_PROJECT_KEY);
          setHistory([]);
          setProject(createHomeProject());
        }}
      />
      <main className="main">
        {project.stage === "home" ? (
          <Home onSubmit={handleHomeSubmit} />
        ) : project.stage === "generate" ? (
          <GenerateWorkspace
            project={project}
            updateProject={updateProject}
            aiAbortRef={aiAbortRef}
            onBackToIntent={() => {
              aiAbortRef.current.generate?.abort();
              updateProject((current) =>
                markIntentDirty({
                  ...current,
                  stage: "intent",
                  maxReachedStep: "intent",
                  mechanism: createMechanismState(current.intent, current.rawInput),
                }),
              );
            }}
          />
        ) : (
          <CanvasShell
            project={project}
            getProject={() => projectRef.current}
            updateProject={updateProject}
            sidebarCollapsed={sidebarCollapsed}
            aiAbortRef={aiAbortRef}
          />
        )}
      </main>
    </div>
  );
}

function loadHistory() {
  try {
    const items = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryItem[];
    return items
      .map((item) => {
        const project = normalizeLoadedProject(item.project);
        if (!project || project.stage === "home") return null;
        const prompt = resolveHistoryPrompt(project);
        if (!prompt) return null;
        return {
          ...item,
          summary: prompt,
          createdAt: item.createdAt || project.createdAt || new Date().toISOString(),
          project: { ...project, userPrompt: project.userPrompt ?? prompt, rawInput: prompt },
        };
      })
      .filter(Boolean) as HistoryItem[];
  } catch {
    return [];
  }
}

function loadCurrentProject() {
  try {
    const project = JSON.parse(localStorage.getItem(CURRENT_PROJECT_KEY) ?? "null") as ProjectState | null;
    if (!project?.id || !project.stage || project.stage === "home") return null;
    if (!resolveHistoryPrompt(project)) return null;
    return normalizeLoadedProject(project);
  } catch {
    return null;
  }
}

function saveCurrentProject(project: ProjectState) {
  if (project.stage === "home" || !resolveHistoryPrompt(project)) {
    localStorage.removeItem(CURRENT_PROJECT_KEY);
    return;
  }
  localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(project));
}

function saveHistory(project: ProjectState, setHistory: (items: HistoryItem[]) => void) {
  const prompt = resolveHistoryPrompt(project);
  if (!prompt || project.stage === "home") return;

  const existing = loadHistory().find((historyItem) => historyItem.id === project.id);
  const item: HistoryItem = {
    id: project.id,
    summary: prompt,
    createdAt: existing?.createdAt ?? project.createdAt ?? new Date().toISOString(),
    project: { ...project, userPrompt: project.userPrompt ?? prompt, rawInput: prompt },
  };
  const next = [item, ...loadHistory().filter((historyItem) => historyItem.id !== project.id)].slice(0, 6);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  setHistory(next);
}

function writeHistory(items: HistoryItem[], setHistory: (items: HistoryItem[]) => void) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  setHistory(items);
}

function cloneProject(project: ProjectState): ProjectState {
  const copiedProject = JSON.parse(JSON.stringify(project)) as ProjectState;
  copiedProject.id = crypto.randomUUID();
  copiedProject.createdAt = new Date().toISOString();
  return copiedProject;
}

function normalizeLoadedProject(project: ProjectState | null) {
  if (!project?.id || !project.stage) return null;
  const prompt = resolveHistoryPrompt(project);
  if (!prompt && project.stage !== "home") return null;

  if (!hasMojibake(project)) {
    return rehydrateProjectWithCatalog({
      ...project,
      rawInput: prompt || project.rawInput || "",
      userPrompt: project.userPrompt ?? prompt,
      mechanism: normalizeVisualDimensions(project.mechanism, project.intent, prompt || project.rawInput || ""),
    });
  }

  const rebuilt = createProject(prompt || project.rawInput || "");
  rebuilt.id = project.id;
  rebuilt.createdAt = project.createdAt || rebuilt.createdAt;
  rebuilt.stage = project.stage;
  rebuilt.maxReachedStep =
    project.maxReachedStep ??
    (project.stage === "generate" ? "generate" : project.stage === "mechanism" ? "mechanism" : "intent");

  rebuilt.intent.dimensions = rebuilt.intent.dimensions.map((dimension) => {
    const loadedDimension = project.intent?.dimensions?.find((item) => item.id === dimension.id);
    const selectedOptionId = loadedDimension?.selectedOptionId;
    return {
      ...dimension,
      selectedOptionId: dimension.options.some((item) => item.id === selectedOptionId) ? selectedOptionId : undefined,
      expanded: false,
    };
  });
  rebuilt.intent.designIntentText = buildDesignIntentText(rebuilt.intent.dimensions);
  rebuilt.mechanism = createMechanismState(rebuilt.intent, rebuilt.rawInput, project.mechanism);

  const selectedInfoPlanId = project.mechanism?.selectedInfoPlanId;
  if (rebuilt.mechanism.infoPlans.some((plan) => plan.id === selectedInfoPlanId && !plan.isPlaceholder)) {
    rebuilt.mechanism.selectedInfoPlanId = selectedInfoPlanId;
    rebuilt.mechanism.visualExpanded = true;
  }

  rebuilt.mechanism.visualDimensions = rebuilt.mechanism.visualDimensions.map((dimension) => {
    const loadedDimension = project.mechanism?.visualDimensions?.find((item) => item.id === dimension.id);
    const selectedOptionId = loadedDimension?.selectedOptionId;
    return {
      ...dimension,
      selectedOptionId: dimension.options.some((item) => item.id === selectedOptionId) ? selectedOptionId : undefined,
      expanded: false,
    };
  });

  return applyVisualAfterPlanSelect(rebuilt);
}

function hasMojibake(value: unknown) {
  return /[鏂璁绾灞鍙闈閫宸鈻歿€绯瀵妗椤鍝瑙淇鐗杈鎺娣绮澶鍒娓]/.test(JSON.stringify(value));
}

function Sidebar({
  project,
  history,
  collapsed,
  onToggle,
  onNew,
  onRestore,
  onDuplicate,
  onDelete,
  onClear,
}: {
  project: ProjectState;
  history: HistoryItem[];
  collapsed: boolean;
  onToggle: () => void;
  onNew: () => void;
  onRestore: (item: HistoryItem) => void;
  onDuplicate: (item: HistoryItem) => void;
  onDelete: (item: HistoryItem) => void;
  onClear: () => void;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const historyGroups = useMemo(() => groupHistoryItems(history), [history]);

  const closeMenu = () => setOpenMenuId(null);

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-topline">
        <div className="brand">
          <span className="logo">
            <Sparkles size={18} />
          </span>
          {!collapsed && <strong>设计指引</strong>}
        </div>
        <button className="collapse-button" type="button" onClick={onToggle}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <button className="primary full" type="button" onClick={onNew}>
        <Plus size={18} />
        <span>新页面</span>
      </button>
      {!collapsed && (
        <>
          <section className="history-block">
            <h2>历史记录</h2>
            {history.length === 0 ? (
              <p className="empty">暂无历史记录</p>
            ) : (
              <div className="history-groups">
                {historyGroups.map((group) => (
                  <section className="history-group" key={group.period}>
                    <h3 className="history-group-label">{group.label}</h3>
                    <div className="history-list">
                      {group.items.map((item) => (
                        <div
                          className={`history-item ${item.id === project.id ? "active" : ""} ${
                            openMenuId === item.id ? "menu-open" : ""
                          }`}
                          key={item.id}
                        >
                          <Clock size={18} />
                          <button
                            className="history-restore"
                            type="button"
                            onClick={() => {
                              closeMenu();
                              onRestore(item);
                            }}
                          >
                            <strong>{resolveHistoryPrompt(item.project) || item.summary}</strong>
                          </button>
                          <div className="history-menu-wrap">
                            <button
                              className="history-menu-trigger"
                              type="button"
                              aria-label="打开历史记录操作"
                              aria-expanded={openMenuId === item.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenMenuId((current) => (current === item.id ? null : item.id));
                              }}
                            >
                              <MoreVertical size={16} />
                            </button>
                            {openMenuId === item.id && (
                              <div className="history-menu">
                                <button
                                  type="button"
                                  onClick={() => {
                                    closeMenu();
                                    onDuplicate(item);
                                  }}
                                >
                                  <Copy size={14} />
                                  复制
                                </button>
                                <button
                                  className="danger"
                                  type="button"
                                  onClick={() => {
                                    closeMenu();
                                    onDelete(item);
                                  }}
                                >
                                  <Trash2 size={14} />
                                  删除
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
          <button className="ghost clear" type="button" onClick={onClear}>
            <Trash2 size={18} />
            清空历史记录
          </button>
        </>
      )}
    </aside>
  );
}

function Home({ onSubmit }: { onSubmit: (input: string) => void | Promise<void> }) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const prompt = value.trim();
    if (!prompt || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(prompt);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="home">
      <div className="home-inner">
        <div className="hero-mark">
          <Wand2 size={32} />
        </div>
        <h1>说出你想做什么页面</h1>
        <p>清晰的输入，帮助系统更好地理解你的设计意图</p>
        <div className="prompt-card">
          <textarea
            value={value}
            maxLength={HOME_PROMPT_MAX_LENGTH}
            placeholder="输入你的想法吧！可描述公司、页面目标、风格偏好、必含模块等。"
            onChange={(event) => setValue(event.target.value)}
          />
          <span>
            {value.length} / {HOME_PROMPT_MAX_LENGTH}
          </span>
        </div>
        <div className="examples">
          <h2>试试这些示例</h2>
          <div className="example-grid">
            {examples.map((item) => (
              <button className="example-card" type="button" key={item.title} onClick={() => setValue(item.text)}>
                <span className="example-icon">{exampleIcon(item.icon)}</span>
                <strong>{item.title}</strong>
              </button>
            ))}
          </div>
        </div>
        <button className="primary confirm" type="button" disabled={!value.trim() || submitting} onClick={handleSubmit}>
          确认
          <ArrowRight size={20} />
        </button>
      </div>
    </section>
  );
}

function exampleIcon(icon: string) {
  if (icon === "school") return <BadgeCheck size={28} />;
  if (icon === "portfolio") return <ImageIcon size={28} />;
  if (icon === "event") return <Megaphone size={28} />;
  return <Boxes size={28} />;
}

type ViewportFocusOptions = { force?: boolean };

function CanvasShell({
  project,
  getProject,
  updateProject,
  sidebarCollapsed,
  aiAbortRef,
}: {
  project: ProjectState;
  getProject: () => ProjectState;
  updateProject: UpdateProject;
  sidebarCollapsed: boolean;
  aiAbortRef: MutableRefObject<AiAbortBag>;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: CANVAS_BASE_SCALE });
  const transformRef = useRef(transform);
  const [isPanning, setIsPanning] = useState(false);
  const [focusedStep, setFocusedStep] = useState<CanvasAnchor>(project.stage === "mechanism" ? "mechanism" : "intent");
  const [intentLocked, setIntentLocked] = useState(() => project.stage === "mechanism");
  const canvasWorldRef = useRef<HTMLDivElement>(null);
  const mechanismAutoRunKeyRef = useRef<string | null>(null);
  const visualAutoRunKeyRef = useRef<string | null>(null);
  const [mechanismSession, setMechanismSession] = useState(0);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);
  const userViewportAdjustedRef = useRef(false);
  const viewportFocusDebounceRef = useRef<number | null>(null);
  const viewportScheduleRef = useRef<number | null>(null);
  const viewportSettleRef = useRef<number | null>(null);
  const cancelViewportMotionRef = useRef<(() => void) | null>(null);
  const panSyncFrameRef = useRef<number | null>(null);
  const viewportLastPanTargetRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const viewportFocusLatestRef = useRef<{
    selector: string;
    align: ViewportFocusAlign;
    paddingX: number;
    paddingY: number;
    force: boolean;
  } | null>(null);
  const maxReachedStep = resolveMaxReachedStep(project);
  const showMechanism = project.stage === "mechanism";
  const intentComplete = project.intent.dimensions.every((dimension) => Boolean(dimension.selectedOptionId));
  const mechanismComplete = Boolean(project.mechanism.selectedInfoPlanId) && project.mechanism.visualDimensions.every((dimension) => Boolean(dimension.selectedOptionId));

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useLayoutEffect(() => {
    const world = canvasWorldRef.current;
    if (!world) return;
    if (cancelViewportMotionRef.current) return;
    applyViewportTransform(world, transformRef.current);
  }, [transform]);

  const cancelViewportMotion = useCallback(() => {
    cancelViewportMotionRef.current?.();
    cancelViewportMotionRef.current = null;
  }, []);

  const clearViewportSchedule = useCallback(() => {
    if (viewportScheduleRef.current) {
      window.clearTimeout(viewportScheduleRef.current);
      viewportScheduleRef.current = null;
    }
    if (viewportSettleRef.current) {
      window.clearTimeout(viewportSettleRef.current);
      viewportSettleRef.current = null;
    }
  }, []);

  const clearAllViewportNavigation = useCallback(() => {
    clearScheduledViewportFocus();
    if (viewportFocusDebounceRef.current) {
      window.clearTimeout(viewportFocusDebounceRef.current);
      viewportFocusDebounceRef.current = null;
    }
    clearViewportSchedule();
    cancelViewportMotion();
  }, [cancelViewportMotion, clearViewportSchedule]);

  const shouldSkipViewportPan = useCallback((next: ViewportTransform) => {
    const last = viewportLastPanTargetRef.current;
    if (!last) return false;
    if (Date.now() - last.at > VIEWPORT_SKIP_RECENT_MS) return false;
    return Math.abs(last.x - next.x) + Math.abs(last.y - next.y) < VIEWPORT_FOCUS_MIN_DELTA;
  }, []);

  const rememberViewportPanTarget = useCallback((next: ViewportTransform) => {
    viewportLastPanTargetRef.current = { x: next.x, y: next.y, at: Date.now() };
  }, []);

  const commitViewportTransform = useCallback((
    next: ViewportTransform,
    animateOrOptions: boolean | CommitViewportOptions = true,
    onComplete?: () => void,
  ) => {
    const world = canvasWorldRef.current;
    if (!world) return;

    const options = typeof animateOrOptions === "boolean"
      ? { animate: animateOrOptions, onComplete }
      : animateOrOptions;
    const animate = options.animate ?? true;
    const force = options.force ?? false;
    const complete = options.onComplete ?? onComplete;

    const settled = roundViewportTransform(next);
    const from = roundViewportTransform(transformRef.current);
    const movement = viewportTransformDistance(from, settled);
    if (!force && movement < VIEWPORT_FOCUS_SKIP_DELTA) {
      complete?.();
      return;
    }

    if (!force && shouldSkipViewportPan(settled)) {
      complete?.();
      return;
    }

    if (cancelViewportMotionRef.current && !force) {
      if (movement < VIEWPORT_FOCUS_MIN_DELTA) {
        complete?.();
        return;
      }
      cancelViewportMotion();
    }

    if (!animate || movement < VIEWPORT_FOCUS_MIN_DELTA) {
      cancelViewportMotion();
      applyViewportTransform(world, settled);
      transformRef.current = settled;
      rememberViewportPanTarget(settled);
      setTransform((prev) => (viewportTransformDistance(prev, settled) < VIEWPORT_FOCUS_SKIP_DELTA ? prev : settled));
      complete?.();
      return;
    }

    cancelViewportMotion();
    cancelViewportMotionRef.current = animateViewportTransform({
      world,
      from,
      to: settled,
      durationMs: options.durationMs ?? resolveViewportPanDuration(movement, VIEWPORT_PAN_BASE_MS),
      onFrame: (frame) => {
        transformRef.current = frame;
      },
      onComplete: (frame) => {
        cancelViewportMotionRef.current = null;
        transformRef.current = frame;
        rememberViewportPanTarget(frame);
        setTransform((prev) => (viewportTransformDistance(prev, frame) < VIEWPORT_FOCUS_SKIP_DELTA ? prev : frame));
        complete?.();
      },
    });
  }, [cancelViewportMotion, rememberViewportPanTarget, shouldSkipViewportPan]);

  useEffect(() => {
    userViewportAdjustedRef.current = false;
  }, [project.id]);

  useEffect(() => {
    if (project.stage !== "intent") return;
    if (hasGeneratedBrief(project)) return;
    if (isAutoAiDisabled()) return;
    if (isSpendBlockedGlobally() || project.ai?.billingBlocked) return;
    const briefTask = project.ai?.tasks.brief ?? "idle";
    if (briefTask !== "idle") return;
    if (project.ai?.errors.brief) return;
    void runBriefAnalysis(project, updateProject, aiAbortRef.current);
  }, [project.id, project.stage, project.ai?.tasks.brief, project.ai?.errors.brief, project.ai?.billingBlocked]);

  useEffect(() => {
    if (project.stage !== "intent") return;
    if (!intentComplete) return;
    if (isSpendBlockedGlobally() || project.ai?.billingBlocked) return;
    prefetchMechanismAnalysis(project);
  }, [
    project.id,
    project.stage,
    intentComplete,
    project.rawInput,
    project.intent.dimensions,
    project.ai?.billingBlocked,
  ]);

  const hasRealInfoPlans = project.mechanism.infoPlans.some((plan) => !plan.isPlaceholder);

  useEffect(() => {
    if (project.stage !== "mechanism") return;
    if (!intentComplete) return;
    if (hasRealInfoPlans) return;
    if (isAutoAiDisabled()) return;
    if (isSpendBlockedGlobally() || project.ai?.billingBlocked) return;
    const task = project.ai?.tasks.mechanism ?? "idle";
    if (task === "loading" || task === "done") return;
    const autoKey = `${project.id}::${buildMechanismKey(project)}`;
    if (mechanismAutoRunKeyRef.current === autoKey) return;
    mechanismAutoRunKeyRef.current = autoKey;
    void runMechanismAnalysis(
      project,
      updateProject,
      aiAbortRef.current,
      (intent, rawInput, previous) => createMechanismState(intent, rawInput, previous),
    );
  }, [
    project.id,
    project.stage,
    intentComplete,
    hasRealInfoPlans,
    project.ai?.tasks.mechanism,
    project.ai?.mechanismKey,
    project.ai?.billingBlocked,
  ]);

  useEffect(() => {
    setFocusedStep(project.stage === "mechanism" ? "mechanism" : "intent");
    setIntentLocked(project.stage === "mechanism");
  }, [project.stage, project.id]);

  const runViewportFocus = useCallback((request: {
    selector: string;
    align: ViewportFocusAlign;
    paddingX: number;
    paddingY: number;
    force: boolean;
  }, options?: { skipSchedule?: boolean }) => {
    if (!request.force && userViewportAdjustedRef.current) return;

    const applyFocus = () => {
      const surface = canvasRef.current;
      const world = canvasWorldRef.current;
      const block = world?.querySelector<HTMLElement>(request.selector);
      if (!surface || !world || !block) return;

      const frame = getCanvasViewportFrame(surface);
      const blockRect = resolveFocusBlockRect(world, block, request.selector);
      const isIntentStageFocus =
        request.selector === ".intent-stage" || request.selector.startsWith('[data-tree-anchor="intent-');
      const intentLift = isIntentStageFocus ? INTENT_VIEWPORT_LIFT : 0;
      const isInfoPanelFocus = request.selector === ".info-panel" || block.classList.contains("info-panel");
      const isVisualDimensionFocus = request.selector.startsWith('[data-tree-anchor="mechanism-visual-dimension-');
      const isVisualFocus =
        isVisualDimensionFocus ||
        request.selector === ".visual-panel" ||
        request.selector.startsWith('[data-tree-anchor="mechanism-visual-');
      const visualShift = isVisualDimensionFocus ? -VISUAL_VIEWPORT_SHIFT_LEFT : 0;
      const focusPaddingX = isVisualFocus ? Math.max(request.paddingX, 80) : request.paddingX;
      const infoTopPadding = Math.max(request.paddingY, MECHANISM_INFO_VIEWPORT_TOP);
      let deltaX = 0;
      let deltaY = 0;

      if (request.align === "contain") {
        deltaX = frame.centerX - (blockRect.left + blockRect.width / 2) + visualShift;
        if (isInfoPanelFocus) {
          const targetCenterY = frame.top + infoTopPadding + blockRect.height / 2;
          deltaY = targetCenterY - (blockRect.top + blockRect.height / 2);
        } else {
          deltaY = frame.centerY - (blockRect.top + blockRect.height / 2) - intentLift;
        }
      } else if (request.align === "right") {
        const desiredRight = frame.right - focusPaddingX + visualShift;
        deltaX = desiredRight - blockRect.right;
        deltaY = intentLift > 0 ? -intentLift : 0;
      } else {
        deltaX = frame.centerX - (blockRect.left + blockRect.width / 2) + visualShift;
        deltaY = intentLift > 0 ? -intentLift : 0;
      }

      const clamped = clampViewportPan(blockRect, frame, deltaX, deltaY, focusPaddingX, request.paddingY);
      const panDurationMs = resolveViewportPanDuration(
        viewportTransformDistance(transformRef.current, {
          ...transformRef.current,
          x: transformRef.current.x + clamped.deltaX,
          y: transformRef.current.y + clamped.deltaY,
        }),
        isVisualFocus ? VIEWPORT_PAN_VISUAL_MS : VIEWPORT_PAN_BASE_MS,
      );
      if (Math.abs(clamped.deltaX) + Math.abs(clamped.deltaY) < VIEWPORT_FOCUS_SKIP_DELTA) return;
      const current = transformRef.current;
      commitViewportTransform(
        {
          ...current,
          x: current.x + clamped.deltaX,
          y: current.y + clamped.deltaY,
        },
        { animate: !request.force, force: request.force, durationMs: panDurationMs },
      );
    };

    if (options?.skipSchedule) {
      applyFocus();
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(applyFocus);
    });
  }, [commitViewportTransform]);

  const scheduleSettledViewportFocus = useCallback((
    request: {
      selector: string;
      align: ViewportFocusAlign;
      paddingX: number;
      paddingY: number;
      force: boolean;
    },
    options?: { delayMs?: number; settleMs?: number },
  ) => {
    if (!request.force && userViewportAdjustedRef.current) {
      return clearAllViewportNavigation;
    }
    clearAllViewportNavigation();
    if (request.force) {
      const delayMs = options?.delayMs ?? 0;
      viewportScheduleRef.current = window.setTimeout(() => {
        viewportScheduleRef.current = null;
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            runViewportFocus(request, { skipSchedule: true });
          });
        });
      }, delayMs);
      return clearAllViewportNavigation;
    }

    const delayMs = options?.delayMs ?? 0;
    const settleMs = options?.settleMs ?? VIEWPORT_SETTLE_MS;

    viewportScheduleRef.current = window.setTimeout(() => {
      viewportScheduleRef.current = null;
      window.requestAnimationFrame(() => {
        viewportSettleRef.current = window.setTimeout(() => {
          viewportSettleRef.current = null;
          runViewportFocus(request, { skipSchedule: true });
        }, settleMs);
      });
    }, delayMs);

    return clearAllViewportNavigation;
  }, [clearAllViewportNavigation, runViewportFocus]);

  const focusViewportOnBlock = useCallback((
    selector: string,
    align: ViewportFocusAlign = "right",
    paddingX = 72,
    paddingY = 64,
    options?: ViewportFocusOptions,
  ) => {
    const request = {
      selector,
      align,
      paddingX,
      paddingY,
      force: Boolean(options?.force),
    };
    viewportFocusLatestRef.current = request;
    if (viewportFocusDebounceRef.current) {
      window.clearTimeout(viewportFocusDebounceRef.current);
      viewportFocusDebounceRef.current = null;
    }

    if (options?.force) {
      scheduleSettledViewportFocus(request);
      return;
    }

    viewportFocusDebounceRef.current = window.setTimeout(() => {
      viewportFocusDebounceRef.current = null;
      const next = viewportFocusLatestRef.current;
      if (!next) return;
      scheduleSettledViewportFocus(next, { settleMs: VIEWPORT_SETTLE_MS });
    }, VIEWPORT_FOCUS_DEBOUNCE_MS);
  }, [scheduleSettledViewportFocus]);

  const focusViewportForReveal = useCallback((
    selector: string,
    align: ViewportFocusAlign = "right",
    paddingX = 72,
    paddingY = 64,
    options?: ViewportFocusOptions,
  ) => {
    focusViewportOnBlock(selector, align, paddingX, paddingY, options);
  }, [focusViewportOnBlock]);

  useEffect(() => {
    return () => {
      if (viewportFocusDebounceRef.current) window.clearTimeout(viewportFocusDebounceRef.current);
      clearViewportSchedule();
      cancelViewportMotion();
      if (panSyncFrameRef.current) window.cancelAnimationFrame(panSyncFrameRef.current);
    };
  }, [cancelViewportMotion, clearViewportSchedule]);

  const clampScale = (scale: number) => Math.max(0.45, Math.min(1.8, Number(scale.toFixed(2))));

  const zoomAtPoint = (clientX: number, clientY: number, nextScale: number) => {
    const surface = canvasRef.current;
    const world = canvasWorldRef.current;
    if (!surface) return;
    userViewportAdjustedRef.current = true;
    cancelViewportMotion();
    const rect = surface.getBoundingClientRect();
    const current = transformRef.current;
    const scale = clampScale(nextScale);
    const originX = clientX - rect.left - current.x;
    const originY = clientY - rect.top - current.y;
    const ratio = scale / current.scale;
    const next = roundViewportTransform({
      scale,
      x: clientX - rect.left - originX * ratio,
      y: clientY - rect.top - originY * ratio,
    });
    transformRef.current = next;
    if (world) applyViewportTransform(world, next);
    setTransform(next);
  };

  const zoomAtCanvasCenter = (nextScale: number) => {
    const surface = canvasRef.current;
    if (!surface) return;
    const frame = getCanvasViewportFrame(surface);
    zoomAtPoint(frame.centerX, frame.centerY, nextScale);
  };

  const fitCanvasToScale = useCallback((targetScale: number) => {
    const surface = canvasRef.current;
    const world = canvasWorldRef.current;
    const unified = world?.querySelector<HTMLElement>(".unified-canvas");
    if (!surface || !world || !unified) return;

    userViewportAdjustedRef.current = true;
    cancelViewportMotion();
    const frame = getCanvasViewportFrame(surface);
    const surfaceRect = surface.getBoundingClientRect();
    const scale = clampScale(targetScale);
    const scaledWidth = unified.offsetWidth * scale;
    const scaledHeight = unified.offsetHeight * scale;
    const frameCenterX = frame.centerX - surfaceRect.left;
    const frameCenterY = frame.centerY - surfaceRect.top;
    const topPadding = 24;

    commitViewportTransform(
      {
        scale,
        x: frameCenterX - scaledWidth / 2,
        y:
          scaledHeight > frame.height
            ? topPadding
            : Math.max(topPadding, frameCenterY - scaledHeight / 2),
      },
      false,
    );
  }, [cancelViewportMotion, commitViewportTransform]);

  const focusVisualGrammarPanel = useCallback((delayMs = 0, force = false) => {
    return scheduleSettledViewportFocus(
      {
        selector: ".visual-panel",
        align: "contain",
        paddingX: 80,
        paddingY: 56,
        force,
      },
      { delayMs, settleMs: VIEWPORT_VISUAL_SETTLE_MS },
    );
  }, [scheduleSettledViewportFocus]);

  const fitViewportToSelector = useCallback((selector: string, options?: ViewportFitOptions) => {
    if (!options?.force && userViewportAdjustedRef.current) return;

    const applyFit = () => {
      const surface = canvasRef.current;
      const world = canvasWorldRef.current;
      if (!surface || !world) return;
      const block = world.querySelector<HTMLElement>(selector);
      if (!block) return;

      const frame = getCanvasViewportFrame(surface);
      const surfaceRect = surface.getBoundingClientRect();
      const blockRect = resolveFocusBlockRect(world, block, selector);
      const isIntentComplete =
        selector.includes("intent-complete") ||
        selector.includes("is-intent-complete") ||
        block.classList.contains("intent-complete-focus") ||
        (block.classList.contains("intent-stage") && block.classList.contains("is-intent-complete"));
      const isInfoPanel = block.classList.contains("info-panel");
      const paddingX = isIntentComplete
        ? Math.max(options?.paddingX ?? 48, INTENT_STAGE_FIT_PADDING_X)
        : isInfoPanel
          ? Math.max(options?.paddingX ?? 48, MECHANISM_INFO_FIT_PADDING_X)
          : (options?.paddingX ?? 48);
      const infoTopPadding = Math.max(options?.paddingY ?? 40, MECHANISM_INFO_VIEWPORT_TOP);
      const topPadding = isInfoPanel ? infoTopPadding : isIntentComplete ? INTENT_STAGE_FIT_PADDING_Y : (options?.paddingY ?? 40);
      const bottomPadding = isInfoPanel
        ? MECHANISM_INFO_FIT_BOTTOM_PADDING
        : isIntentComplete
          ? INTENT_STAGE_FIT_PADDING_Y + INTENT_STAGE_ACTION_BAR_RESERVE
          : (options?.paddingY ?? 40);
      const availableW = Math.max(240, frame.width - paddingX * 2);
      const availableH = Math.max(200, frame.height - topPadding - bottomPadding);
      const current = transformRef.current;
      const targetScale = clampScale(
        Math.min((availableW / blockRect.width) * current.scale, (availableH / blockRect.height) * current.scale, CANVAS_BASE_SCALE),
      );
      const ratio = targetScale / current.scale;
      const isVisualDimensionFocus = selector.startsWith('[data-tree-anchor="mechanism-visual-dimension-');
      const isVisualFocus =
        isVisualDimensionFocus || selector === ".visual-panel" || selector.startsWith('[data-tree-anchor="mechanism-visual-');
      const visualShift = isVisualDimensionFocus ? -VISUAL_VIEWPORT_SHIFT_LEFT : 0;
      const contentCenterX = blockRect.left + blockRect.width / 2 - surfaceRect.left + visualShift;
      const contentCenterY = blockRect.top + blockRect.height / 2 - surfaceRect.top;
      const frameCenterX = frame.centerX - surfaceRect.left;
      const frameCenterY = isInfoPanel
        ? frame.top + infoTopPadding + blockRect.height / 2 - surfaceRect.top
        : isIntentComplete
          ? frame.top + topPadding + (frame.height - topPadding - bottomPadding) / 2 - surfaceRect.top
          : frame.centerY - surfaceRect.top;

      const next = {
        scale: targetScale,
        x: frameCenterX - (contentCenterX - current.x) * ratio,
        y: frameCenterY - (contentCenterY - current.y) * ratio,
      };
      if (!options?.force && viewportTransformDistance(current, next) < VIEWPORT_FOCUS_SKIP_DELTA) return;

      const fitMovement = viewportTransformDistance(current, next);
      commitViewportTransform(next, {
        animate: !options?.overviewFit,
        force: options?.force,
        durationMs: resolveViewportPanDuration(fitMovement, VIEWPORT_PAN_BASE_MS),
      });
    };

    if (options?.overviewFit) {
      clearAllViewportNavigation();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(applyFit);
      });
      return;
    }

    clearViewportSchedule();
    viewportScheduleRef.current = window.setTimeout(() => {
      viewportScheduleRef.current = null;
      window.requestAnimationFrame(() => {
        viewportSettleRef.current = window.setTimeout(() => {
          viewportSettleRef.current = null;
          applyFit();
        }, VIEWPORT_SETTLE_MS);
      });
    }, 0);
  }, [clearAllViewportNavigation, clearViewportSchedule, commitViewportTransform]);

  const fitMechanismOverview = useCallback(
    (overrideUserPan = false) => {
      fitViewportToSelector(".unified-canvas.has-mechanism", {
        force: overrideUserPan,
        paddingX: 56,
        paddingY: 44,
        overviewFit: true,
      });
    },
    [fitViewportToSelector],
  );

  const fitIntentStageOverview = useCallback(
    (overrideUserPan = true) => {
      const world = canvasWorldRef.current;
      const selector = world?.querySelector(".intent-stage.is-intent-complete")
        ? ".intent-stage.is-intent-complete"
        : ".intent-stage";
      fitViewportToSelector(selector, {
        force: overrideUserPan,
        paddingX: INTENT_STAGE_FIT_PADDING_X,
        paddingY: INTENT_STAGE_FIT_PADDING_Y,
        overviewFit: true,
      });
    },
    [fitViewportToSelector],
  );

  useEffect(() => {
    if (project.stage !== "intent" || !intentComplete) return;
    clearAllViewportNavigation();
    let frame1 = 0;
    let frame2 = 0;
    frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        fitIntentStageOverview(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [project.stage, intentComplete, project.id, fitIntentStageOverview, clearAllViewportNavigation]);

  const fitMechanismInfoOverview = useCallback(
    (overrideUserPan = false) => {
      fitViewportToSelector(".info-panel", {
        force: overrideUserPan,
        paddingX: MECHANISM_INFO_FIT_PADDING_X,
        paddingY: MECHANISM_INFO_VIEWPORT_TOP,
      });
    },
    [fitViewportToSelector],
  );

  useEffect(() => {
    if (!showMechanism || !mechanismComplete) return;
    clearAllViewportNavigation();
    let frame1 = 0;
    let frame2 = 0;
    frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        fitMechanismOverview(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [showMechanism, mechanismComplete, fitMechanismOverview, clearAllViewportNavigation]);

  useEffect(() => {
    if (!showMechanism) {
      visualAutoRunKeyRef.current = null;
      return;
    }
    const planId = project.mechanism.selectedInfoPlanId;
    if (!planId) {
      visualAutoRunKeyRef.current = null;
      return;
    }

    const grammarKey = buildVisualGrammarKey(project, planId);
    if (visualAutoRunKeyRef.current && visualAutoRunKeyRef.current !== grammarKey) {
      visualAutoRunKeyRef.current = null;
    }
    if (isVisualGrammarAiCacheReady(project, grammarKey)) {
      visualAutoRunKeyRef.current = grammarKey;
      const needsHydrate = project.mechanism.visualDimensions.some((dimension) => !dimension.options.length);
      if (needsHydrate) {
        updateProject((current) => applyVisualAfterPlanSelect(current), { persistHistory: false });
      }
      return;
    }

    if (isSpendBlockedGlobally() || project.ai?.billingBlocked) return;

    const visualTask = project.ai?.tasks.visual ?? "idle";
    if (visualTask === "loading") return;
    if (visualAutoRunKeyRef.current === grammarKey && visualTask === "done") return;

    visualAutoRunKeyRef.current = grammarKey;
    void runVisualGrammarAnalysis(getProject, updateProject, aiAbortRef.current);
  }, [
    showMechanism,
    project.mechanism.selectedInfoPlanId,
    project.ai?.mechanismKey,
    project.ai?.tasks.visual,
    project.ai?.visualGrammar?.key,
    project.ai?.billingBlocked,
    getProject,
    updateProject,
  ]);

  const resetCanvasView = () => {
    userViewportAdjustedRef.current = false;
    cancelViewportMotion();
    commitViewportTransform({ x: 0, y: 0, scale: CANVAS_BASE_SCALE }, false);
  };

  const fitCanvasView = () => {
    const surface = canvasRef.current;
    const world = canvasWorldRef.current;
    const unified = world?.querySelector<HTMLElement>(".unified-canvas");
    if (!surface || !world || !unified) return;
    const frame = getCanvasViewportFrame(surface);
    const surfaceRect = surface.getBoundingClientRect();
    const scale = clampScale(Math.min((frame.width - 48) / unified.offsetWidth, CANVAS_BASE_SCALE));
    const scaledWidth = unified.offsetWidth * scale;
    const scaledHeight = unified.offsetHeight * scale;
    const frameCenterX = frame.centerX - surfaceRect.left;
    const frameCenterY = frame.centerY - surfaceRect.top;
    const topPadding = 24;
    userViewportAdjustedRef.current = true;
    cancelViewportMotion();
    commitViewportTransform(
      {
        scale,
        x: frameCenterX - scaledWidth / 2,
        y:
          scaledHeight > frame.height
            ? topPadding
            : Math.max(topPadding, frameCenterY - scaledHeight / 2),
      },
      false,
    );
  };

  const relayoutCanvas = () => {
    updateProject((current) => ({
      ...current,
      intent: {
        ...current.intent,
        dimensions: current.intent.dimensions.map((dimension) => ({
          ...dimension,
          options: withPositions(dimension.options.map((item) => ({ ...item, moved: false, position: undefined }))),
        })),
      },
    }), { persistHistory: false });
  };

  const stopPanning = (pointerId?: number, target?: HTMLElement) => {
    const pan = panRef.current;
    if (pan?.moved) {
      userViewportAdjustedRef.current = true;
    }
    if (panSyncFrameRef.current) {
      window.cancelAnimationFrame(panSyncFrameRef.current);
      panSyncFrameRef.current = null;
    }
    if (pan) {
      setTransform({ ...transformRef.current });
    }
    if (pan && pointerId === pan.pointerId && target?.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    panRef.current = null;
    setIsPanning(false);
  };

  const scrollCanvasToAnchor = (anchor: CanvasAnchor) => {
    userViewportAdjustedRef.current = false;
    cancelViewportMotion();
    viewportLastPanTargetRef.current = null;
    clearViewportSchedule();
    if (viewportFocusDebounceRef.current) {
      window.clearTimeout(viewportFocusDebounceRef.current);
      viewportFocusDebounceRef.current = null;
    }

    const navigateFit = (selector: string, paddingX?: number, paddingY?: number) => {
      fitViewportToSelector(selector, { force: true, paddingX, paddingY });
    };

    const firstDimensionId = project.intent.dimensions[0]?.id;

    if (anchor === "input") {
      const world = canvasWorldRef.current;
      const selector = world?.querySelector('[data-tree-anchor="recognition-root"]')
        ? '[data-tree-anchor="recognition-root"]'
        : '[data-tree-anchor="input-root"]';
      navigateFit(selector, 88, 72);
      return;
    }

    if (anchor === "intent") {
      if (intentComplete) {
        fitIntentStageOverview(true);
      } else if (firstDimensionId) {
        navigateFit(
          `[data-tree-anchor="intent-question-${firstDimensionId}"]`,
          INTENT_QUESTION_FOCUS_PADDING_X,
          INTENT_QUESTION_FOCUS_PADDING_Y,
        );
      } else {
        navigateFit(".intent-stage", 48, 48);
      }
      return;
    }

    if (anchor === "mechanism" || anchor === "generate") {
      if (!showMechanism) {
        if (intentComplete) {
          fitIntentStageOverview(true);
        } else if (firstDimensionId) {
          navigateFit(
            `[data-tree-anchor="intent-question-${firstDimensionId}"]`,
            INTENT_QUESTION_FOCUS_PADDING_X,
            INTENT_QUESTION_FOCUS_PADDING_Y,
          );
        } else {
          navigateFit(".intent-stage", 48, 48);
        }
        return;
      }

      if (mechanismComplete || anchor === "generate") {
        fitMechanismOverview(true);
        return;
      }

      if (project.mechanism.selectedInfoPlanId) {
        focusVisualGrammarPanel(0, true);
      } else {
        fitMechanismInfoOverview(true);
      }
    }
  };

  const goToMechanism = () => {
    if (!intentComplete) return;
    clearSpendLocksForRetry();
    userViewportAdjustedRef.current = false;
    setFocusedStep("mechanism");
    setIntentLocked(true);
    const mechanismProject = prepareProjectForMechanism({
      ...project,
      stage: "mechanism",
      maxReachedStep: bumpMaxReachedStep(project.maxReachedStep, "mechanism"),
      intent: {
        ...project.intent,
        dimensions: project.intent.dimensions.map((dimension) => ({ ...dimension, expanded: false })),
      },
      mechanism: createMechanismState(project.intent, project.rawInput, project.mechanism),
    });
    updateProject(() => mechanismProject);
    setMechanismSession((value) => value + 1);
    mechanismAutoRunKeyRef.current = `${mechanismProject.id}::${buildMechanismKey(mechanismProject)}`;
    void runMechanismAnalysis(
      mechanismProject,
      updateProject,
      aiAbortRef.current,
      (intent, rawInput, previous) => createMechanismState(intent, rawInput, previous),
    );
    window.setTimeout(() => fitMechanismInfoOverview(true), VIEWPORT_STAGE_FIT_DELAY_MS);
  };

  const goToIntent = () => {
    setFocusedStep("intent");
    setIntentLocked(false);
    aiAbortRef.current.mechanism?.abort();
    mechanismAutoRunKeyRef.current = null;
    setMechanismSession((value) => value + 1);
    cancelViewportMotion();
    commitViewportTransform({ x: 0, y: 0, scale: CANVAS_BASE_SCALE }, false);
    updateProject((current) =>
      markIntentDirty({
        ...current,
        stage: "intent",
        maxReachedStep: "intent",
        mechanism: createMechanismState(current.intent, current.rawInput),
      }),
    );
    window.setTimeout(() => scrollCanvasToAnchor("intent"), 0);
  };

  const retryBriefAnalysis = () => {
    updateProject((current) => clearSpendBlockForRetry(current), { persistHistory: false });
    void runBriefAnalysis(project, updateProject, aiAbortRef.current);
  };

  const retryMechanismAnalysis = () => {
    mechanismAutoRunKeyRef.current = null;
    updateProject((current) => {
      const cleared = clearSpendBlockForRetry(current);
      return {
        ...cleared,
        ai: {
          ...(cleared.ai ?? { tasks: { brief: "idle", mechanism: "idle", visual: "idle", generate: "idle" }, errors: {} }),
          mechanismSource: undefined,
        },
      };
    }, { persistHistory: false });
    void runMechanismAnalysis(
      project,
      updateProject,
      aiAbortRef.current,
      (intent, rawInput, previous) => createMechanismState(intent, rawInput, previous),
    );
  };

  const retryVisualGrammarAnalysis = () => {
    visualAutoRunKeyRef.current = null;
    updateProject((current) => clearSpendBlockForRetry(invalidateVisualGrammarCache(current)), { persistHistory: false });
    void runVisualGrammarAnalysis(getProject, updateProject, aiAbortRef.current, { force: true });
  };

  const panCanvasToAnchor = (anchor: CanvasAnchor) => {
    if (getStepIndex(anchor) > getStepIndex(maxReachedStep)) return;
    setFocusedStep(anchor);
    scrollCanvasToAnchor(anchor);
  };

  return (
    <section className="canvas-shell">
      <CanvasToolbar
        zoom={transform.scale / CANVAS_BASE_SCALE}
        onSetZoom={(logicalZoom) => fitCanvasToScale(logicalZoom * CANVAS_BASE_SCALE)}
        onReset={resetCanvasView}
        onFitView={fitCanvasView}
        onRelayout={relayoutCanvas}
      />
      <div className="canvas-grid">
        <div
          className={`canvas-surface ${isPanning ? "is-panning" : ""}`}
          ref={canvasRef}
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            fitCanvasToScale(transformRef.current.scale + (event.deltaY > 0 ? -0.08 : 0.08));
          }}
          onPointerDown={(event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            if (event.button !== 0) return;
            if (target.closest("button, input, textarea, form, .option-node, .info-card, .visual-option, .plan-preview-zoomable, .plan-preview-lightbox, .draggable-branch:not(.locked)")) return;
            if (viewportFocusDebounceRef.current) {
              window.clearTimeout(viewportFocusDebounceRef.current);
              viewportFocusDebounceRef.current = null;
            }
            cancelViewportMotion();
            event.currentTarget.setPointerCapture(event.pointerId);
            panRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: transformRef.current.x, y: transformRef.current.y, moved: false };
            setIsPanning(true);
          }}
          onPointerMove={(event) => {
            const pan = panRef.current;
            if (!pan || pan.pointerId !== event.pointerId) return;
            const dx = event.clientX - pan.startX;
            const dy = event.clientY - pan.startY;
            if (Math.abs(dx) + Math.abs(dy) > 6) {
              if (!pan.moved) userViewportAdjustedRef.current = true;
              pan.moved = true;
            }
            const next = { ...transformRef.current, x: pan.x + dx, y: pan.y + dy };
            transformRef.current = next;
            const world = canvasWorldRef.current;
            if (world) applyViewportTransform(world, next);
            if (panSyncFrameRef.current) return;
            panSyncFrameRef.current = window.requestAnimationFrame(() => {
              panSyncFrameRef.current = null;
              setTransform({ ...transformRef.current });
            });
          }}
          onPointerUp={(event) => {
            stopPanning(event.pointerId, event.currentTarget);
          }}
          onPointerCancel={(event) => stopPanning(event.pointerId, event.currentTarget)}
          onLostPointerCapture={() => stopPanning()}
        >
          <div
            ref={canvasWorldRef}
            className="canvas-world"
          >
            <div className={`unified-canvas ${showMechanism ? "has-mechanism" : ""}`}>
              <IntentStage
                project={project}
                updateProject={updateProject}
                locked={intentLocked}
                onViewportFocus={focusViewportForReveal}
                onFitIntentOverview={fitIntentStageOverview}
                onRetryBrief={retryBriefAnalysis}
              />
              {showMechanism && (
                <MechanismStage
                  key={mechanismSession}
                  project={project}
                  updateProject={updateProject}
                  onRetryMechanism={retryMechanismAnalysis}
                  onRetryVisual={retryVisualGrammarAnalysis}
                  onViewportFocus={focusViewportForReveal}
                  onViewportFit={fitViewportToSelector}
                  onFitMechanismInfoOverview={fitMechanismInfoOverview}
                  onFocusVisualGrammar={focusVisualGrammarPanel}
                />
              )}
            </div>
          </div>
        </div>
        <StepRail maxReachedStep={maxReachedStep} focusedStep={focusedStep} onNavigate={panCanvasToAnchor} />
      </div>
      <StageActionBar
        stage={project.stage === "mechanism" ? "mechanism" : "intent"}
        sidebarCollapsed={sidebarCollapsed}
        canNext={intentComplete}
        mechanismComplete={mechanismComplete}
        onNext={goToMechanism}
        onBackToIntent={goToIntent}
        onGenerate={() => {
          updateProject(() => ({
            ...project,
            stage: "generate",
            maxReachedStep: bumpMaxReachedStep(project.maxReachedStep, "generate"),
          }));
        }}
      />
    </section>
  );
}

function CanvasToolbar({
  zoom,
  onSetZoom,
  onReset,
  onFitView,
  onRelayout,
}: {
  zoom: number;
  onSetZoom: (scale: number) => void;
  onReset: () => void;
  onFitView: () => void;
  onRelayout: () => void;
}) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const zoomOptions = [0.5, 0.75, 1, 1.25, 1.5];

  return (
    <div className="canvas-toolbar">
      <button type="button" onClick={onReset} aria-label="重置画布" title="重置画布">
        <RotateCcw size={18} />
      </button>
      <button type="button" onClick={onRelayout} aria-label="重新布局" title="重新布局">
        <LayoutGrid size={18} />
      </button>
      <div className="zoom-menu-wrap">
        <button className="zoom" type="button" aria-label="选择缩放比例" aria-expanded={zoomOpen} onClick={() => setZoomOpen((value) => !value)}>
          {Math.round(zoom * 100)}%
        </button>
        {zoomOpen && (
          <div className="zoom-menu">
            {zoomOptions.map((optionValue) => (
              <button
                className={Math.abs(zoom - optionValue) < 0.01 ? "active" : ""}
                type="button"
                key={optionValue}
                onClick={() => {
                  onSetZoom(optionValue);
                  setZoomOpen(false);
                }}
              >
                {Math.round(optionValue * 100)}%
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" onClick={onFitView} aria-label="适配画布" title="适配画布">
        <Fullscreen size={18} />
      </button>
    </div>
  );
}

function StepRail({
  maxReachedStep,
  focusedStep,
  onNavigate,
}: {
  maxReachedStep: CanvasAnchor;
  focusedStep: CanvasAnchor;
  onNavigate: (anchor: CanvasAnchor) => void;
}) {
  const steps: Array<{ id: CanvasAnchor; label: string }> = [
    { id: "input", label: "输入识别" },
    { id: "intent", label: "意图确认" },
    { id: "mechanism", label: "表达机制" },
    { id: "generate", label: "生成页面" },
  ];
  const maxReachedIndex = getStepIndex(maxReachedStep);
  const focusedIndex = getStepIndex(focusedStep);

  return (
    <aside className="step-rail" aria-label="流程进度">
      {steps.map((step, index) => {
        const reached = index <= maxReachedIndex;
        const focused = index === focusedIndex;
        const done = reached && index < maxReachedIndex;
        const locked = !reached;

        return (
          <button
            className={`rail-step${done ? " done" : ""}${reached && !done ? " reached" : ""}${focused ? " active" : ""}${locked ? " is-locked" : ""}`}
            type="button"
            key={step.id}
            disabled={locked}
            title={locked ? "请先完成上一步" : `跳转到${step.label}`}
            onClick={() => onNavigate(step.id)}
          >
            <span className="rail-dot">{done ? "✓" : index + 1}</span>
            <span>{step.label}</span>
          </button>
        );
      })}
      <p className="step-rail-hint">点击跳转对应阶段</p>
    </aside>
  );
}

function IntentStage({
  project,
  updateProject,
  locked = false,
  onViewportFocus,
  onFitIntentOverview,
  onRetryBrief,
}: {
  project: ProjectState;
  updateProject: UpdateProject;
  locked?: boolean;
  onViewportFocus?: ViewportFocusHandler;
  onFitIntentOverview?: (force?: boolean) => void;
  onRetryBrief: () => void;
}) {
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const moveNode = (id: string, position: { x: number; y: number }) => setNodeOffsets((current) => ({ ...current, [id]: position }));
  const updateDimension = (dimensionId: DimensionId, optionId: string) => {
    if (locked) return;
    updateProject((current) => {
      const dimensions = current.intent.dimensions.map((dimension) => {
        if (dimension.id !== dimensionId) return dimension;
        return {
          ...dimension,
          expanded: false,
          selectedOptionId: optionId,
          options: dimension.options.map((item) =>
            item.id === optionId ? { ...item, moved: false, position: undefined } : item,
          ),
        };
      });
      const intent = { dimensions, designIntentText: buildDesignIntentText(dimensions) };
      return markIntentDirty({
        ...current,
        stage: "intent",
        maxReachedStep: "intent",
        intent,
        mechanism: createMechanismState(intent, current.rawInput),
      });
    });
  };

  const { visibleCount, complete, shouldIntro, markIntroduced } = useProgressiveFlow(project.intent.dimensions);
  const waitingForAiBrief =
    !locked &&
    !project.ai?.errors.brief &&
    !hasGeneratedBrief(project) &&
    (project.ai?.tasks.brief ?? "idle") === "loading";
  const visibleDimensions = waitingForAiBrief ? [] : project.intent.dimensions.slice(0, visibleCount);
  const layoutDimensions = useMemo(() => {
    if (visibleDimensions.length > 0) return visibleDimensions;
    if (project.intent.dimensions.length > 0) return [project.intent.dimensions[0]];
    return [];
  }, [visibleDimensions, project.intent.dimensions]);
  const questionsComplete = !waitingForAiBrief && complete;
  const [summaryIntroduced, setSummaryIntroduced] = useState(false);
  const [addingByDimension, setAddingByDimension] = useState<Partial<Record<DimensionId, boolean>>>({});
  const prevVisibleCountRef = useRef(0);
  const onViewportFocusRef = useRef(onViewportFocus);
  onViewportFocusRef.current = onViewportFocus;
  const onFitIntentOverviewRef = useRef(onFitIntentOverview);
  onFitIntentOverviewRef.current = onFitIntentOverview;
  const intentLayout = useMemo(() => getIntentRowLayout(layoutDimensions, addingByDimension), [layoutDimensions, addingByDimension]);
  const firstDimensionId = project.intent.dimensions[0]?.id;
  const setAddingForDimension = (dimensionId: DimensionId, adding: boolean) => {
    if (locked) return;
    setAddingByDimension((current) => (current[dimensionId] === adding ? current : { ...current, [dimensionId]: adding }));
  };

  useEffect(() => {
    if (locked) setAddingByDimension({});
  }, [locked]);

  useEffect(() => {
    prevVisibleCountRef.current = 0;
  }, [project.id]);

  const prevQuestionsCompleteRef = useRef(false);

  useEffect(() => {
    if (locked || !firstDimensionId) return;
    if (!waitingForAiBrief) return;
    return scheduleIntentQuestionFocus(onViewportFocusRef.current, firstDimensionId, "bootstrap", 160);
  }, [waitingForAiBrief, locked, firstDimensionId, project.id]);

  useEffect(() => {
    if (locked || waitingForAiBrief) return;
    if (visibleCount <= prevVisibleCountRef.current) {
      prevVisibleCountRef.current = visibleCount;
      return;
    }
    if (questionsComplete) {
      prevVisibleCountRef.current = visibleCount;
      return;
    }
    const newest = project.intent.dimensions[visibleCount - 1];
    prevVisibleCountRef.current = visibleCount;
    if (!newest) return;
    return scheduleIntentQuestionFocus(onViewportFocusRef.current, newest.id, "live", 280);
  }, [visibleCount, locked, waitingForAiBrief, questionsComplete, project.intent.dimensions]);

  useEffect(() => {
    if (locked || waitingForAiBrief) return;
    if (!questionsComplete) {
      prevQuestionsCompleteRef.current = false;
      return;
    }
    if (prevQuestionsCompleteRef.current) return;
    prevQuestionsCompleteRef.current = true;
    onFitIntentOverviewRef.current?.(true);
  }, [questionsComplete, locked, waitingForAiBrief, project.id]);

  return (
    <div
      className={`intent-stage${locked ? " is-locked" : ""}${questionsComplete ? " is-intent-complete" : ""}`}
      data-canvas-anchor="input"
      style={{ "--intent-canvas-width": `${intentLayout.canvasWidth}px`, width: `${intentLayout.canvasWidth}px` } as CSSProperties}
    >
      <DraggableBranch position={nodeOffsets.input ?? { x: 0, y: 0 }} bounds={{ x: 0, y: 0 }} onMove={(position) => moveNode("input", position)}>
        <InputRootNode text={project.rawInput} />
      </DraggableBranch>
      <InputRecognitionNode project={project} onRetryBrief={onRetryBrief} />
      <IntentQuestionLines
        canvasWidth={intentLayout.canvasWidth}
        inputOffset={nodeOffsets.input ?? { x: 0, y: 0 }}
        shouldAnimateLine={shouldIntro}
        onLineIntroduced={markIntroduced}
        targets={intentLayout.slots.map((slot) => ({
          id: slot.dimension.id,
          x: slot.center,
          y: 314,
          offset: nodeOffsets[slot.dimension.id] ?? { x: 0, y: 0 },
        }))}
      />
      <div
        className="question-row progressive-flow"
        data-canvas-anchor="intent"
        style={
          {
            gridTemplateColumns: intentLayout.slots.map((slot) => `${slot.width}px`).join(" "),
            gap: `${INTENT_GROUP_GAP}px`,
          } as CSSProperties
        }
      >
        {waitingForAiBrief && intentLayout.slots[0] ? (
          <div
            aria-hidden="true"
            className="intent-bootstrap-anchor"
            data-tree-anchor="intent-first-question-slot"
          >
            <div className="question-head" />
          </div>
        ) : (
          intentLayout.slots.map((slot) => (
          <DraggableBranch
            key={slot.dimension.id}
            position={nodeOffsets[slot.dimension.id] ?? { x: 0, y: 0 }}
            bounds={{ x: 0, y: 0 }}
            onMove={(position) => moveNode(slot.dimension.id, position)}
          >
            <QuestionGroup
              dimension={slot.dimension}
              slotWidth={slot.width}
              readOnly={locked}
              adding={locked ? false : (addingByDimension[slot.dimension.id] ?? false)}
              introAnimate={shouldIntro(slot.dimension.id)}
              onIntroComplete={() => markIntroduced(slot.dimension.id)}
              onSelect={(optionId) => updateDimension(slot.dimension.id, optionId)}
              onAddingChange={(adding) => setAddingForDimension(slot.dimension.id, adding)}
              onExpand={() => {
                if (locked) return;
                updateProject((current) => ({
                  ...current,
                  intent: {
                    ...current.intent,
                    dimensions: current.intent.dimensions.map((item) => (item.id === slot.dimension.id ? { ...item, expanded: true } : item)),
                  },
                }));
              }}
              onToggle={() => {
                if (locked) return;
                setAddingForDimension(slot.dimension.id, false);
                updateProject((current) => ({
                  ...current,
                  intent: {
                    ...current.intent,
                    dimensions: current.intent.dimensions.map((item) => (item.id === slot.dimension.id ? { ...item, expanded: !item.expanded } : item)),
                  },
                }));
              }}
              canAddCustom={!slot.dimension.options.some((item) => item.custom)}
              onAddCustom={(label) => {
                if (locked) return;
                setAddingForDimension(slot.dimension.id, false);
                updateProject((current) => {
                  const dimensions = current.intent.dimensions.map((item) => {
                    if (item.id !== slot.dimension.id) return item;
                    const catalogOptions = item.options.filter((optionItem) => !optionItem.custom);
                    const custom = customIntentOption(label.trim());
                    const customLayout = buildIntentOptionRowLayout([
                      ...catalogOptions.map((optionItem) => ({
                        width: estimateIntentOptionWidth(optionItem, false),
                      })),
                      { width: estimateIntentOptionWidth(custom, true) },
                    ]);
                    custom.position = customLayout.positions[catalogOptions.length];
                    return {
                      ...item,
                      expanded: true,
                      options: [...catalogOptions, custom],
                      selectedOptionId: custom.id,
                    };
                  });
                  const intent = { dimensions, designIntentText: buildDesignIntentText(dimensions) };
                  return markIntentDirty({
                    ...current,
                    stage: "intent",
                    maxReachedStep: "intent",
                    intent,
                    mechanism: createMechanismState(intent, current.rawInput),
                  });
                });
              }}
              onEditCustom={(optionId, label) => {
                if (locked) return;
                const trimmed = label.trim();
                if (!trimmed) return;
                updateProject((current) => {
                  const dimensions = current.intent.dimensions.map((item) => {
                    if (item.id !== slot.dimension.id) return item;
                    const nextId = normalizeId(trimmed);
                    const options = item.options.map((optionItem) =>
                      optionItem.id === optionId ? { ...optionItem, id: nextId, label: trimmed } : optionItem,
                    );
                    const selectedOptionId = item.selectedOptionId === optionId ? nextId : item.selectedOptionId;
                    return { ...item, options, selectedOptionId };
                  });
                  const intent = { dimensions, designIntentText: buildDesignIntentText(dimensions) };
                  return markIntentDirty({
                    ...current,
                    stage: "intent",
                    maxReachedStep: "intent",
                    intent,
                    mechanism: createMechanismState(intent, current.rawInput),
                  });
                });
              }}
            />
          </DraggableBranch>
          ))
        )}
      </div>
      {questionsComplete && (
        <>
          <IntentMergeLines
            intent={project.intent}
            nodeOffsets={nodeOffsets}
            canvasWidth={intentLayout.canvasWidth}
            slots={intentLayout.slots}
            layoutKey={`${intentLayout.canvasWidth}-${intentLayout.slots.map((slot) => `${slot.dimension.id}:${slot.width}`).join("|")}-${Object.entries(addingByDimension).map(([id, value]) => `${id}:${value}`).join("|")}`}
          />
          <div className="intent-complete-focus" data-tree-anchor="intent-complete-focus">
            <DesignIntentSummary
              text={project.intent.designIntentText}
              introAnimate={!summaryIntroduced}
              onIntroComplete={() => setSummaryIntroduced(true)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function IntentQuestionLines({
  canvasWidth,
  inputOffset,
  targets,
  shouldAnimateLine,
  onLineIntroduced,
}: {
  canvasWidth: number;
  inputOffset: { x: number; y: number };
  targets: Array<{ id: string; x: number; y: number; offset: { x: number; y: number } }>;
  shouldAnimateLine: (id: string) => boolean;
  onLineIntroduced: (id: string) => void;
}) {
  const [measuredLines, setMeasuredLines] = useState<Array<{ id: string; start: { x: number; y: number }; end: { x: number; y: number } }>>([]);
  const [svgHeight, setSvgHeight] = useState(640);
  const origin = { x: canvasWidth / 2 + inputOffset.x, y: 172 + inputOffset.y };
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const targetsKey = targets.map((target) => `${target.id}:${target.x}:${target.y}:${target.offset.x}:${target.offset.y}`).join(";");

  useLayoutEffect(() => {
    const stage = document.querySelector<HTMLElement>(".intent-stage");
    if (!stage) return;

    const measure = () => {
      const inputRoot = stage.querySelector<HTMLElement>('[data-tree-anchor="input-root"]');
      const recognition = stage.querySelector<HTMLElement>('[data-tree-anchor="recognition-root"]');
      const next: Array<{ id: string; start: { x: number; y: number }; end: { x: number; y: number } }> = [];

      if (inputRoot && recognition) {
        next.push({ id: "input-recognition", ...readAnchorLine(stage, inputRoot, recognition) });
      }

      const from = recognition ?? inputRoot;
      if (from) {
        for (const target of targetsRef.current) {
          const question = stage.querySelector<HTMLElement>(`[data-tree-anchor="intent-question-${target.id}"]`);
          if (!question) continue;
          next.push({ id: target.id, ...readAnchorLine(stage, from, question) });
        }
      }
      const pad = 32;
      const maxY = Math.max(640, stage.offsetHeight, ...next.flatMap((line) => [line.start.y, line.end.y]));
      setSvgHeight(Math.ceil(maxY + pad));
      setMeasuredLines(next);
    };

    return attachLayoutMeasurement(stage, measure, { observeAnchors: true });
  }, [canvasWidth, inputOffset.x, inputOffset.y, targetsKey]);

  return (
    <svg
      className="intent-question-lines"
      viewBox={`0 0 ${canvasWidth} ${svgHeight}`}
      style={{ width: `${canvasWidth}px`, height: `${svgHeight}px` } as CSSProperties}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {(measuredLines.length
        ? measuredLines.map((line) => ({ id: line.id, path: buildStraightConnectorPath(line.start, line.end) }))
        : targets.map((target) => ({
            id: target.id,
            path: `M${origin.x} ${origin.y} C${origin.x} ${origin.y + 54} ${target.x + target.offset.x} ${target.y - 44 + target.offset.y} ${target.x + target.offset.x} ${target.y + target.offset.y}`,
          }))
      ).map((line, index) => {
        const animate = shouldAnimateLine(line.id);
        return (
          <path
            key={line.id}
            className={animate ? "edge-grow" : undefined}
            d={line.path}
            style={animate ? { animationDelay: `${index * 40}ms` } : undefined}
            onAnimationEnd={() => {
              if (animate) onLineIntroduced(line.id);
            }}
          />
        );
      })}
    </svg>
  );
}

function StageActionBar({
  stage,
  sidebarCollapsed,
  canNext,
  mechanismComplete,
  onNext,
  onBackToIntent,
  onGenerate,
}: {
  stage: Stage;
  sidebarCollapsed: boolean;
  canNext: boolean;
  mechanismComplete: boolean;
  onNext: () => void;
  onBackToIntent: () => void;
  onGenerate: () => void;
}) {
  if (stage !== "intent" && stage !== "mechanism") return null;

  const barClassName = `canvas-action-row${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`;
  let content: ReactNode = null;

  if (stage === "mechanism") {
    content = (
      <div className={barClassName}>
        <button className="secondary" type="button" onClick={onBackToIntent}>
          修改设计意图
        </button>
        {mechanismComplete && (
          <button className="primary" type="button" onClick={onGenerate}>
            生成页面
            <ArrowRight size={20} />
          </button>
        )}
      </div>
    );
  } else if (canNext) {
    content = (
      <div className={barClassName}>
        <button className="primary next-step" type="button" onClick={onNext}>
          下一步：表达机制
          <ArrowRight size={20} />
        </button>
      </div>
    );
  }

  return content;
}

function InputRecognitionNode({ project, onRetryBrief }: { project: ProjectState; onRetryBrief: () => void }) {
  const briefStatus = project.ai?.tasks.brief;
  const briefError = project.ai?.errors.brief;
  const hasAiBrief = hasGeneratedBrief(project);
  const spendBlocked = isSpendBlockedGlobally() || project.ai?.billingBlocked;
  const spendSnapshot = spendBlocked ? getSpendGuardSnapshot() : null;
  const spendHint = spendSnapshot?.billingBlocked
    ? BILLING_BLOCKED_MESSAGE
    : spendSnapshot?.burstBlocked
      ? BURST_BLOCKED_MESSAGE
      : spendSnapshot && Number.isFinite(spendSnapshot.dailyLimit) && spendSnapshot.dailyCount >= spendSnapshot.dailyLimit
        ? `今日 AI 请求已达上限（${spendSnapshot.dailyLimit} 次）。`
        : null;
  const analyzing = !briefError && !hasAiBrief && briefStatus === "loading";
  const usingFallback = !analyzing && !hasAiBrief && !briefError;
  const pageLabel = analyzing ? "识别中…" : resolveProjectPageLabel(project);
  const recognitionSummary = project.ai?.brief?.recognitionSummary?.trim();
  return (
    <section
      className={`recognition-node${analyzing ? " is-analyzing" : ""}${briefError ? " has-ai-error" : ""}`}
      data-tree-anchor="recognition-root"
    >
      <span>输入识别结果</span>
      <strong>{pageLabel}</strong>
      {analyzing ? (
        <p className="ai-status-line">
          <span className="ai-spinner" aria-hidden="true" />
          AI 正在生成判断选项…
        </p>
      ) : briefError || spendHint ? (
        <div className="ai-retry-panel" role="status">
          <p className="ai-status-line ai-status-error">
            {spendHint ?? "AI 生成失败，当前显示基础判断选项。"}
          </p>
          {briefError && !spendHint ? <small>{briefError}</small> : null}
          <button className="ai-retry-button" type="button" onClick={onRetryBrief}>
            重新生成
          </button>
        </div>
      ) : usingFallback ? (
        <div className="ai-retry-panel subtle" role="status">
          <p className="ai-status-line">AI 未返回可用选项，当前显示基础判断选项。</p>
          <button className="ai-retry-button" type="button" onClick={onRetryBrief}>
            重新生成
          </button>
        </div>
      ) : (
        <>
          <div className="recognition-content">
            {recognitionSummary ? (
              <div className="recognition-facts">
                <span className="recognition-facts-label">识别摘要</span>
                <p className="recognition-summary">{recognitionSummary}</p>
              </div>
            ) : null}
          </div>
          <p className="recognition-hint">请在下方完成关键判断</p>
        </>
      )}
    </section>
  );
}

function QuestionGroup({
  dimension,
  slotWidth,
  readOnly = false,
  adding,
  canAddCustom = true,
  introAnimate,
  onIntroComplete,
  onSelect,
  onAddingChange,
  onExpand,
  onToggle,
  onAddCustom,
  onEditCustom,
}: {
  dimension: IntentDimension;
  slotWidth: number;
  readOnly?: boolean;
  adding: boolean;
  canAddCustom?: boolean;
  introAnimate: boolean;
  onIntroComplete: () => void;
  onSelect: (optionId: string) => void;
  onAddingChange: (adding: boolean) => void;
  onExpand: () => void;
  onToggle: () => void;
  onAddCustom: (label: string) => void;
  onEditCustom: (optionId: string, label: string) => void;
}) {
  const [customLabel, setCustomLabel] = useState("");
  const groupRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);
  const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
  const visibleOptions = getIntentVisibleOptions(dimension);
  const visibleNodeCount = computeVisibleBranchNodeCount(visibleOptions.length, adding);
  const optionLayout = useMemo(
    () => buildIntentOptionLayoutForDimension(dimension, adding),
    [dimension.id, dimension.expanded, dimension.selectedOptionId, dimension.options, adding],
  );
  const branchWidth = Math.max(optionLayout.span, slotWidth);
  const [lineOriginX, setLineOriginX] = useState(branchWidth / 2);
  const collapsedWithSelection = isIntentCollapsedWithSelection(dimension);
  const getDisplayPosition = (item: OptionItem, index: number) =>
    getIntentOptionDisplayPosition(dimension, item, index, optionLayout.positions);
  const addPosition = optionLayout.positions[visibleOptions.length] ?? defaultOptionPosition(visibleOptions.length, visibleNodeCount);
  const branchNodes = adding
    ? [...visibleOptions.map((item, index) => getDisplayPosition(item, index)), addPosition]
    : visibleOptions.map((item, index) => getDisplayPosition(item, index));
  const branchHeight = Math.max(96, ...branchNodes.map((position) => position.y + INTENT_OPTION_HEIGHT + 8));
  const optionEdges: TreeEdge[] = [
    ...visibleOptions.map((item) => ({
      from: `intent-question-${dimension.id}`,
      to: `intent-option-${dimension.id}-${item.id}`,
      key: item.id,
      muted: Boolean(selected) && item.id !== dimension.selectedOptionId,
      straight: collapsedWithSelection && item.id === dimension.selectedOptionId,
    })),
    ...(adding
      ? [
          {
            from: `intent-question-${dimension.id}`,
            to: `intent-option-${dimension.id}-add`,
            key: "add",
          },
        ]
      : []),
  ];

  useLayoutEffect(() => {
    const head = headRef.current;
    const branch = branchRef.current;
    const group = groupRef.current;
    if (!head || !branch) return;

    const measure = () => {
      setLineOriginX(measureBranchLineOrigin(head, branch));
    };

    const cleanups = [
      attachLayoutMeasurement(branch, measure, { observeAnchors: true }),
      group ? attachLayoutMeasurement(group, measure, { observeAnchors: true }) : () => undefined,
    ];
    measure();
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [selected?.id, dimension.expanded, dimension.question, visibleOptions.length, adding, branchWidth, optionLayout.span, visibleNodeCount, slotWidth, dimension.options]);

  return (
    <article
      ref={groupRef}
      className={`question-group ${dimension.expanded ? "is-expanded" : "is-collapsed"} ${selected ? "has-selection" : ""} ${readOnly ? "is-readonly" : ""} ${introAnimate ? "intro-animate" : "is-introduced"}`}
      style={
        {
          "--intent-slot-width": `${branchWidth}px`,
          "--intent-head-width": `${INTENT_GROUP_WIDTH}px`,
        } as CSSProperties
      }
      onAnimationEnd={(event) => {
        if (introAnimate && event.animationName === "grow-in") onIntroComplete();
      }}
    >
      <MeasuredTreeLines containerRef={groupRef} edges={optionEdges} />
      <div className="question-head" ref={headRef} data-tree-anchor={`intent-question-${dimension.id}`}>
        <span className="node-icon">{dimensionIcon(dimension.id)}</span>
        <h3 className="question-prompt">{dimension.question}</h3>
        {!readOnly && canAddCustom && (
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              const nextAdding = !adding;
              if (nextAdding && selected && !dimension.expanded) {
                onExpand();
              }
              onAddingChange(nextAdding);
            }}
            aria-label="添加自定义分支"
          >
            <Plus size={16} />
          </button>
        )}
        {!readOnly && selected && (
          <button className="expand-toggle" type="button" onClick={onToggle}>
            {dimension.expanded ? "收起" : "展开"}
            {dimension.expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        )}
      </div>
      <div
        className="option-branch"
        ref={branchRef}
        style={
          {
            "--branch-height": `${branchHeight}px`,
            "--branch-origin-x": `${lineOriginX}px`,
            "--intent-branch-width": `${branchWidth}px`,
          } as CSSProperties
        }
      >
        {visibleOptions.map((item, index) => (
          <OptionNode
            key={item.id}
            anchorId={`intent-option-${dimension.id}-${item.id}`}
            option={item}
            selected={item.id === dimension.selectedOptionId}
            faded={Boolean(selected) && item.id !== dimension.selectedOptionId}
            readOnly={readOnly}
            position={getDisplayPosition(item, index)}
            onSelect={() => onSelect(item.id)}
            onEditCustom={item.custom ? (label) => onEditCustom(item.id, label) : undefined}
          />
        ))}
        {adding && (
          <form
            className="option-node option-add-node"
            data-tree-anchor={`intent-option-${dimension.id}-add`}
            style={{ "--option-x": `${addPosition.x}px`, "--option-y": `${addPosition.y}px` } as CSSProperties}
            onSubmit={(event) => {
              event.preventDefault();
              if (!customLabel.trim()) return;
              onAddCustom(customLabel);
              setCustomLabel("");
            }}
          >
            <input value={customLabel} autoFocus placeholder="新分支" onChange={(event) => setCustomLabel(event.target.value)} />
            <button type="submit" disabled={!customLabel.trim()}>
              添加
            </button>
            <button
              type="button"
              onClick={() => {
                onAddingChange(false);
                setCustomLabel("");
              }}
            >
              取消
            </button>
          </form>
        )}
      </div>
    </article>
  );
}

function dimensionIcon(id: DimensionId) {
  if (id === "targetUser") return <Users size={20} />;
  if (id === "coverage") return <Globe2 size={20} />;
  return <Diamond size={20} />;
}

function OptionNode({
  anchorId,
  option,
  selected,
  faded,
  readOnly = false,
  position,
  onSelect,
  onEditCustom,
}: {
  anchorId?: string;
  option: OptionItem;
  selected: boolean;
  faded: boolean;
  readOnly?: boolean;
  position: { x: number; y: number };
  onSelect: () => void;
  onEditCustom?: (label: string) => void;
}) {
  const [hovering, setHovering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(option.label);
  const isEditableCustom = Boolean(option.custom && onEditCustom && !readOnly);

  useEffect(() => {
    setEditValue(option.label);
  }, [option.label]);

  const saveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== option.label) {
      onEditCustom?.(trimmed);
    } else {
      setEditValue(option.label);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditValue(option.label);
    setEditing(false);
  };

  return (
    <div
      className={`option-node ${selected ? "selected" : ""} ${faded ? "faded" : ""} ${readOnly ? "is-readonly" : ""} ${option.custom ? "is-custom" : ""}`}
      data-tree-anchor={anchorId}
      style={{ "--option-x": `${position.x}px`, "--option-y": `${position.y}px` } as CSSProperties}
      role="button"
      tabIndex={readOnly ? -1 : 0}
      aria-disabled={readOnly}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={(event) => {
        if (readOnly || editing) return;
        if (event.target instanceof HTMLElement && event.target.closest(".option-node-edit, .option-custom-editor")) return;
        onSelect();
      }}
      onKeyDown={(event) => {
        if (readOnly || editing) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {editing ? (
        <div className="option-custom-editor" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
          <input
            className="option-custom-edit"
            value={editValue}
            autoFocus
            onChange={(event) => setEditValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit();
              }
            }}
          />
          <button className="option-custom-save" type="button" aria-label="保存修改" onClick={saveEdit}>
            &#10003;
          </button>
          <button className="option-custom-cancel" type="button" aria-label="取消修改" onClick={cancelEdit}>
            ×
          </button>
        </div>
      ) : (
        <>
          <span className="option-node-label">{option.label}</span>
          {isEditableCustom && hovering && (
            <button
              type="button"
              className="option-node-edit"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setEditing(true);
              }}
            >
              修改
            </button>
          )}
        </>
      )}
      {option.signal === "constraint" && (
        <em className="option-signal constraint">输入约束</em>
      )}
      {selected && <span aria-hidden="true">&#10003;</span>}
    </div>
  );
}

function IntentMergeLines({
  intent,
  nodeOffsets,
  canvasWidth,
  slots,
  layoutKey,
}: {
  intent: IntentState;
  nodeOffsets: Record<string, { x: number; y: number }>;
  canvasWidth: number;
  slots: Array<{ dimension: IntentDimension; center: number }>;
  layoutKey: string;
}) {
  const [lines, setLines] = useState(() => getIntentMergeLineFallback(intent, nodeOffsets, slots, canvasWidth));
  const [svgHeight, setSvgHeight] = useState(760);

  useLayoutEffect(() => {
    const stage = document.querySelector<HTMLElement>(".intent-stage");
    if (!stage) return;

    const measure = () => {
      const measured = measureIntentMergeLines(intent, stage);
      const nextLines = measured ?? getIntentMergeLineFallback(intent, nodeOffsets, slots, canvasWidth);
      const maxY = Math.max(760, stage.offsetHeight, ...nextLines.flatMap((line) => [line.start.y, line.end.y]));
      setSvgHeight(Math.ceil(maxY + 32));
      setLines(nextLines);
    };

    const cleanup = attachLayoutMeasurement(stage, measure, { observeAnchors: true });
    measure();
    return cleanup;
  }, [intent, nodeOffsets, canvasWidth, slots, layoutKey]);

  return (
    <svg
      className="intent-merge-lines"
      viewBox={`0 0 ${canvasWidth} ${svgHeight}`}
      style={{ width: `${canvasWidth}px`, height: `${svgHeight}px` } as CSSProperties}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {lines.map((line, index) => (
        <path key={index} d={buildMergeCurvePath(line.start, line.end)} />
      ))}
    </svg>
  );
}

function DesignIntentSummary({
  text,
  introAnimate = false,
  onIntroComplete,
}: {
  text: string;
  introAnimate?: boolean;
  onIntroComplete?: () => void;
}) {
  const body = text.replace(/^设计意图方向[:：]\s*/, "");
  return (
    <section
      className={`intent-summary ${introAnimate ? "intro-animate" : "is-introduced"}`}
      onAnimationEnd={(event) => {
        if (introAnimate && event.animationName === "grow-in") onIntroComplete?.();
      }}
    >
      <div className="summary-bar" data-tree-anchor="intent-summary">
        <Lightbulb size={22} />
        <div>
          <span>设计意图</span>
          <strong>{body}</strong>
        </div>
      </div>
    </section>
  );
}

function InlineCustomInput({
  label,
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form className="inline-custom-input" onSubmit={handleSubmit}>
      <input value={value} placeholder={`输入${label}`} onChange={(event) => onChange(event.target.value)} />
      <button className="secondary tiny" type="button" onClick={onCancel}>
        取消
      </button>
      <button className="primary tiny" type="submit" disabled={!value.trim()}>
        添加
      </button>
    </form>
  );
}

function MechanismStage({
  project,
  updateProject,
  onRetryMechanism,
  onRetryVisual,
  onViewportFocus,
  onViewportFit,
  onFitMechanismInfoOverview,
  onFocusVisualGrammar,
}: {
  project: ProjectState;
  updateProject: UpdateProject;
  onRetryMechanism: () => void;
  onRetryVisual: () => void;
  onViewportFocus?: ViewportFocusHandler;
  onViewportFit?: ViewportFitHandler;
  onFitMechanismInfoOverview?: (force?: boolean) => void;
  onFocusVisualGrammar?: (delayMs?: number, force?: boolean) => () => void;
}) {
  const [branchOffsets, setBranchOffsets] = useState({
    info: { x: 0, y: 0 },
    visual: { x: 0, y: 0 },
  });
  const [infoAdding, setInfoAdding] = useState(false);
  const [addingByDimension, setAddingByDimension] = useState<Partial<Record<VisualId, boolean>>>({});
  const [intentCanvasWidth, setIntentCanvasWidth] = useState(CANVAS_WIDTH);
  const showVisual = Boolean(project.mechanism.selectedInfoPlanId);

  useEffect(() => {
    if (showVisual) return;
    const timer = window.setTimeout(() => onFitMechanismInfoOverview?.(), VIEWPORT_STAGE_FIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [project.id, showVisual, onFitMechanismInfoOverview]);

  const selectedInfoPlan = project.mechanism.infoPlans.find((plan) => plan.id === project.mechanism.selectedInfoPlanId);
  const visibleInfoPlans = selectedInfoPlan && !project.mechanism.infoExpanded ? [selectedInfoPlan] : project.mechanism.infoPlans;
  const infoPlanCount = visibleInfoPlans.length + (infoAdding ? 1 : 0);
  const infoPanelWidth = getInfoPanelWidth(infoPlanCount);
  const visualBudget = getMechanismVisualBudget(infoPanelWidth);
  const visualPanelWidth = useMemo(() => {
    if (!showVisual) return 0;
    if (!project.mechanism.visualExpanded) return VISUAL_DIMENSION_WIDTH;
    return getVisualBranchLayout(project.mechanism.visualDimensions, Infinity, addingByDimension).width;
  }, [showVisual, project.mechanism.visualDimensions, project.mechanism.visualExpanded, addingByDimension]);
  const branchContentWidth = infoPanelWidth + MECHANISM_PANEL_GAP + visualPanelWidth + 80;
  const mechanismCanvasWidth = showVisual
    ? Math.max(branchContentWidth, intentCanvasWidth)
    : Math.max(intentCanvasWidth, infoPanelWidth + 80);

  useLayoutEffect(() => {
    if (showVisual) return;
    const intentStage = document.querySelector<HTMLElement>(".intent-stage");
    if (!intentStage) return;

    const syncWidth = () => setIntentCanvasWidth(Math.max(CANVAS_WIDTH, intentStage.offsetWidth));
    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(intentStage);
    return () => observer.disconnect();
  }, [showVisual, project.id]);

  return (
    <div
      className="mechanism-stage"
      data-canvas-anchor="mechanism"
      style={{ width: `${mechanismCanvasWidth}px`, "--mechanism-canvas-width": `${mechanismCanvasWidth}px` } as CSSProperties}
    >
      <MechanismStageLines showVisual={showVisual} stageWidth={mechanismCanvasWidth} branchOffsets={branchOffsets} project={project} />
      <div
        className={`mechanism-flow${showVisual ? " has-visual-branch" : " is-info-only"}`}
        style={
          {
            "--info-panel-width": `${infoPanelWidth}px`,
            "--visual-budget": `${visualBudget}px`,
            "--mechanism-option-row-top": `${MECHANISM_OPTION_ROW_TOP}px`,
            "--visual-title-option-gap": `${VISUAL_TITLE_OPTION_GAP}px`,
            "--visual-head-dimension-gap": `${VISUAL_HEAD_DIMENSION_GAP}px`,
            "--visual-dimension-gap": `${VISUAL_DIMENSION_GAP}px`,
            "--info-plan-card-width": `${INFO_PLAN_CARD_WIDTH}px`,
            "--info-lofi-preview-width": `${INFO_LOFI_PREVIEW_WIDTH}px`,
            "--info-head-width": `${INFO_HEAD_WIDTH}px`,
            "--info-head-plan-gap": `${INFO_HEAD_PLAN_GAP}px`,
          } as CSSProperties
        }
      >
        <DraggableBranch
          position={branchOffsets.info}
          bounds={{ x: 0, y: 0 }}
          onMove={(position) => setBranchOffsets((current) => ({ ...current, info: position }))}
        >
          <InfoOrganizationPanel
            project={project}
            updateProject={updateProject}
            panelWidth={infoPanelWidth}
            adding={infoAdding}
            onAddingChange={setInfoAdding}
            onRetryMechanism={onRetryMechanism}
            onViewportFocus={onViewportFocus}
            onFitMechanismInfoOverview={onFitMechanismInfoOverview}
          />
        </DraggableBranch>
        {showVisual && (
          <DraggableBranch
            position={branchOffsets.visual}
            bounds={{ x: 0, y: 0 }}
            onMove={(position) => setBranchOffsets((current) => ({ ...current, visual: position }))}
          >
            <VisualGrammarPanel
              project={project}
              updateProject={updateProject}
              visualBudget={visualBudget}
              addingByDimension={addingByDimension}
              onAddingByDimensionChange={setAddingByDimension}
              onRetryVisual={onRetryVisual}
              onViewportFocus={onViewportFocus}
              onViewportFit={onViewportFit}
              onFocusVisualGrammar={onFocusVisualGrammar}
            />
          </DraggableBranch>
        )}
      </div>
    </div>
  );
}

function MechanismStageLines({
  showVisual,
  stageWidth,
  branchOffsets,
  project,
}: {
  showVisual: boolean;
  stageWidth: number;
  branchOffsets: { info: { x: number; y: number }; visual: { x: number; y: number } };
  project: ProjectState;
}) {
  const [lines, setLines] = useState(() => getMechanismStageLineFallback(showVisual, stageWidth));
  const [svgHeight, setSvgHeight] = useState(160);

  useLayoutEffect(() => {
    const stage = document.querySelector<HTMLElement>(".mechanism-stage");
    const intentStage = document.querySelector<HTMLElement>(".intent-stage");
    if (!stage) return;

    const measure = () => {
      const measured = measureMechanismStageLines(showVisual);
      const nextLines = measured ?? getMechanismStageLineFallback(showVisual, stageWidth);
      const maxY = Math.max(160, ...nextLines.flatMap((line) => [line.start.y, line.end.y]));
      setSvgHeight(Math.ceil(maxY + 12));
      setLines(nextLines);
    };

    const cleanup = attachLayoutMeasurement(stage, measure, { observeAnchors: true });
    const intentObserver = intentStage ? new ResizeObserver(measure) : null;
    if (intentStage && intentObserver) {
      intentObserver.observe(intentStage);
      const summary = intentStage.querySelector<HTMLElement>('[data-tree-anchor="intent-summary"]');
      if (summary) intentObserver.observe(summary);
    }
    measure();

    return () => {
      cleanup();
      intentObserver?.disconnect();
    };
  }, [
    showVisual,
    stageWidth,
    branchOffsets.info.x,
    branchOffsets.info.y,
    branchOffsets.visual.x,
    branchOffsets.visual.y,
    project.mechanism.infoExpanded,
    project.mechanism.selectedInfoPlanId,
    project.mechanism.infoPlans.length,
    project.mechanism.visualExpanded,
  ]);

  return (
    <svg
      className="mechanism-stage-lines"
      viewBox={`0 0 ${stageWidth} ${svgHeight}`}
      style={{ height: `${svgHeight}px` }}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {lines.map((line, index) => (
        <path key={`mechanism-line-${index}`} d={buildStraightConnectorPath(line.start, line.end)} />
      ))}
    </svg>
  );
}

function DraggableBranch({
  children,
  position,
  bounds = { x: 220, y: 180 },
  onMove,
}: {
  children: ReactNode;
  position: { x: number; y: number };
  bounds?: { x: number; y: number };
  onMove: (position: { x: number; y: number }) => void;
}) {
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const locked = bounds.x === 0 && bounds.y === 0;
  const clamp = (x: number, y: number) => ({ x: Math.max(-bounds.x, Math.min(bounds.x, x)), y: Math.max(-bounds.y, Math.min(bounds.y, y)) });

  return (
    <div
      className={`draggable-branch ${locked ? "locked" : ""}`}
      style={{ "--drag-x": `${position.x}px`, "--drag-y": `${position.y}px` } as CSSProperties}
      onPointerDown={(event) => {
        if (locked) return;
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest("button, input, textarea, form, .info-card, .visual-option")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, initialX: position.x, initialY: position.y };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        onMove(clamp(drag.initialX + event.clientX - drag.startX, drag.initialY + event.clientY - drag.startY));
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) {
          event.currentTarget.releasePointerCapture(event.pointerId);
          dragRef.current = null;
        }
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      {children}
    </div>
  );
}

function useInfoPanelViewportFit({
  projectId,
  awaitingInfoPlans,
  infoPlansKey,
  mechanismKey,
  infoExpanded,
  selectedInfoPlanId,
  onFitMechanismInfoOverview,
}: {
  projectId: string;
  awaitingInfoPlans: boolean;
  infoPlansKey: string;
  mechanismKey?: string;
  infoExpanded: boolean | undefined;
  selectedInfoPlanId?: string | null;
  onFitMechanismInfoOverview?: (force?: boolean) => void;
}) {
  const lastPanKeyRef = useRef<string | null>(null);
  const onFitRef = useRef(onFitMechanismInfoOverview);
  onFitRef.current = onFitMechanismInfoOverview;

  useEffect(() => {
    lastPanKeyRef.current = null;
  }, [projectId]);

  useEffect(() => {
    if (awaitingInfoPlans || !infoPlansKey) return;
    if (selectedInfoPlanId) return;

    const panKey = `${mechanismKey ?? ""}::${infoPlansKey}::${infoExpanded ? "expanded" : "collapsed"}`;
    if (lastPanKeyRef.current === panKey) return;
    lastPanKeyRef.current = panKey;

    const timer = window.setTimeout(() => onFitRef.current?.(), VIEWPORT_STAGE_FIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [awaitingInfoPlans, infoPlansKey, mechanismKey, infoExpanded, selectedInfoPlanId]);
}

function InfoOrganizationPanel({
  project,
  updateProject,
  panelWidth,
  adding,
  onAddingChange,
  onRetryMechanism,
  onViewportFocus,
  onFitMechanismInfoOverview,
}: {
  project: ProjectState;
  updateProject: UpdateProject;
  panelWidth: number;
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  onRetryMechanism: () => void;
  onViewportFocus?: ViewportFocusHandler;
  onFitMechanismInfoOverview?: (force?: boolean) => void;
}) {
  const [customLabel, setCustomLabel] = useState("");
  const [orchestratingPlanId, setOrchestratingPlanId] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const onViewportFocusRef = useRef(onViewportFocus);
  onViewportFocusRef.current = onViewportFocus;
  const mechanismLoading = project.ai?.tasks.mechanism === "loading";
  const mechanismError = project.ai?.errors.mechanism;
  const awaitingInfoPlans = project.mechanism.infoPlans.every((plan) => plan.isPlaceholder);
  const realInfoPlans = project.mechanism.infoPlans.filter((plan) => !plan.isPlaceholder);
  const infoPlansKey = realInfoPlans.map((plan) => plan.id).join("|");
  const selectedPlan = project.mechanism.infoPlans.find((plan) => plan.id === project.mechanism.selectedInfoPlanId);
  const selectedPlanId = selectedPlan?.id;
  const visiblePlans = selectedPlan && !project.mechanism.infoExpanded ? [selectedPlan] : project.mechanism.infoPlans;
  const planCount = visiblePlans.length + (adding ? 1 : 0);
  const planRowWidth = getInfoPlanRowWidth(planCount);
  const panelContentWidth = Math.max(INFO_HEAD_WIDTH, planRowWidth);
  const planEdges: TreeEdge[] = [
    ...visiblePlans.map((plan) => ({
      from: "mechanism-info-head",
      to: `mechanism-info-plan-${plan.id}`,
      key: plan.id,
      muted: Boolean(selectedPlanId && plan.id !== selectedPlanId),
    })),
    ...(adding ? [{ from: "mechanism-info-head", to: "mechanism-info-plan-add", key: "add" }] : []),
  ];

  useInfoPanelViewportFit({
    projectId: project.id,
    awaitingInfoPlans,
    infoPlansKey,
    mechanismKey: project.ai?.mechanismKey,
    infoExpanded: project.mechanism.infoExpanded,
    selectedInfoPlanId: project.mechanism.selectedInfoPlanId,
    onFitMechanismInfoOverview,
  });

  return (
    <section
      ref={panelRef}
      className={`tree-panel info-panel ${project.mechanism.infoExpanded ? "is-branch-expanded" : "is-branch-collapsed"}`}
      style={
        {
          "--info-panel-width": `${panelContentWidth}px`,
          "--info-head-width": `${INFO_HEAD_WIDTH}px`,
          "--info-plan-row-width": `${planRowWidth}px`,
          "--info-head-plan-gap": `${INFO_HEAD_PLAN_GAP}px`,
          "--info-plan-gap": `${INFO_PLAN_GAP}px`,
        } as CSSProperties
      }
    >
      <MeasuredTreeLines containerRef={panelRef} edges={planEdges} />
      <div className="tree-panel-head" data-tree-anchor="mechanism-info-head">
        <span className="node-icon">
          <LayoutGrid size={21} />
        </span>
        <div>
          <h3>信息组织</h3>
          <p>
            {mechanismLoading
              ? "AI 正在根据输入推导 3 套页面骨架与功能内容编排…"
              : mechanismError && awaitingInfoPlans
                ? "信息架构推导失败，可重试或等待案例库兜底。"
                : "页面先让用户看到什么，再理解什么，最后点击什么。"}
          </p>
        </div>
        {mechanismLoading && <span className="ai-spinner ai-spinner-inline" aria-label="分析中" />}
        <button
          className="icon-button"
          type="button"
          onClick={() => {
            const nextAdding = !adding;
            if (nextAdding && selectedPlan && !project.mechanism.infoExpanded) {
              updateProject((current) => ({
                ...current,
                mechanism: { ...current.mechanism, infoExpanded: true },
              }));
            }
            onAddingChange(nextAdding);
          }}
          aria-label="添加信息组织方案"
        >
          <Plus size={16} />
        </button>
        {selectedPlan && (
          <button
            className="expand-toggle"
            type="button"
            onClick={() => {
              onAddingChange(false);
              updateProject((current) => ({
                ...current,
                mechanism: { ...current.mechanism, infoExpanded: !current.mechanism.infoExpanded },
              }));
            }}
          >
            {project.mechanism.infoExpanded ? "收起" : "展开"}
          </button>
        )}
        {mechanismError && awaitingInfoPlans && !mechanismLoading && (
          <div className="info-plan-error-banner tree-panel-head-banner" role="status">
            <p className="ai-status-line ai-status-error">信息架构推导失败</p>
            <small>{mechanismError}</small>
            <button className="ai-retry-button" type="button" onClick={onRetryMechanism}>
              重新生成
            </button>
          </div>
        )}
        {project.ai?.mechanismSource === "reference-fallback" && !mechanismLoading && !awaitingInfoPlans && (
          <div className="info-plan-error-banner subtle tree-panel-head-banner" role="status">
            <p className="ai-status-line">AI 推导未成功，当前展示案例库推荐方案。</p>
            {mechanismError ? <small>{mechanismError}</small> : null}
            <button className="ai-retry-button" type="button" onClick={onRetryMechanism}>
              重新生成
            </button>
          </div>
        )}
      </div>
      <div className="info-plan-branch">
        <div className="info-plan-grid">
        {visiblePlans.map((plan, index) => (
          <InfoPlanCard
            key={plan.id}
            anchorId={`mechanism-info-plan-${plan.id}`}
            plan={plan}
            placeholderVariant={index}
            selected={plan.id === project.mechanism.selectedInfoPlanId}
            signal={plan.signal}
            onSelect={() => {
              if (plan.isPlaceholder) return;
              clearSpendLocksForRetry();
              updateProject((current) =>
                invalidateVisualGrammarCache({
                  ...current,
                  mechanism: {
                    ...current.mechanism,
                    selectedInfoPlanId: plan.id,
                    visualExpanded: true,
                    infoExpanded: false,
                    visualDimensions: resetVisualDimensionSelections(current.mechanism.visualDimensions),
                  },
                }),
              );
            }}
            onEdit={(value) =>
              updateProject((current) =>
                touchGenerationInvalidation({
                  ...current,
                  mechanism: {
                    ...current.mechanism,
                    infoPlans: current.mechanism.infoPlans.map((item) => (item.id === plan.id ? { ...item, userEdit: value } : item)),
                  },
                }),
              )
            }
            onAddModule={(value) => {
              setOrchestratingPlanId(plan.id);
              void runInfoPlanOrchestration(project, plan.id, { type: "add", label: value }, updateProject).finally(() =>
                setOrchestratingPlanId(null),
              );
            }}
            onRemoveModule={(moduleId) => {
              updateProject((current) => {
                const target = current.mechanism.infoPlans.find((item) => item.id === plan.id);
                if (!target) return current;
                return touchGenerationInvalidation({
                  ...current,
                  mechanism: {
                    ...current.mechanism,
                    infoPlans: current.mechanism.infoPlans.map((item) =>
                      item.id === plan.id ? removeModuleFromInfoPlan(item, moduleId) : item,
                    ),
                  },
                });
              });
            }}
            onReorderModule={(moduleId, targetIndex) => {
              updateProject((current) =>
                touchGenerationInvalidation({
                  ...current,
                  mechanism: {
                    ...current.mechanism,
                    infoPlans: current.mechanism.infoPlans.map((item) =>
                      item.id === plan.id ? setModuleOrderInInfoPlan(item, moduleId, targetIndex) : item,
                    ),
                  },
                }),
              );
            }}
            orchestrating={orchestratingPlanId === plan.id}
            mechanismLoading={mechanismLoading && plan.isPlaceholder}
          />
        ))}
        {adding && (
          <form
            className="info-card add-child-card"
            data-tree-anchor="mechanism-info-plan-add"
            onSubmit={(event) => {
              event.preventDefault();
              const label = customLabel.trim();
              if (!label) return;
              clearSpendLocksForRetry();
              updateProject((current) => {
                const normalized = normalizeUserAddedOption("info", label, current.rawInput);
                const next: ProjectState = {
                  ...current,
                  mechanism: {
                    ...current.mechanism,
                    selectedInfoPlanId: normalized.id,
                    visualExpanded: true,
                    infoExpanded: false,
                    visualDimensions: resetVisualDimensionSelections(current.mechanism.visualDimensions),
                    infoPlans: [
                      ...current.mechanism.infoPlans,
                      {
                        id: normalized.id,
                        title: label,
                        previewType: "custom" as const,
                        structure: normalized.decisionPath ?? [label],
                        summary: "用户自定义的信息组织分支。",
                        isCustom: true,
                        source: "user-added",
                        rawText: normalized.rawText,
                        pageArchitecture: normalized.pageArchitecture,
                        pageFrame: normalized.pageFrame,
                        firstScreen: normalized.firstScreen,
                        contentFlow: normalized.contentFlow,
                        componentPatterns: normalized.componentPatterns,
                        layoutDecisions: normalized.layoutDecisions,
                        aboveFold: normalized.aboveFold,
                        sections: normalized.sections,
                        layoutRhythm: normalized.layoutRhythm,
                        decisionPath: normalized.decisionPath,
                        previewWireframe: normalized.previewWireframe,
                        contentModules: normalized.contentModules,
                        generationRules: normalized.generationRules,
                        forbiddenPatterns: normalized.forbiddenPatterns,
                      },
                    ],
                  },
                };
                return invalidateVisualGrammarCache(next);
              });
              onAddingChange(false);
              setCustomLabel("");
              scheduleViewportFocus(onViewportFocusRef.current, ".visual-panel", "contain", 80, 56, 300);
            }}
          >
            <span>新增方案</span>
            <input value={customLabel} autoFocus placeholder="输入方案名" onChange={(event) => setCustomLabel(event.target.value)} />
            <div className="add-child-actions">
              <button type="submit" disabled={!customLabel.trim()}>
                添加
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddingChange(false);
                  setCustomLabel("");
                }}
              >
                取消
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </section>
  );
}

function InfoPlanGeneratingPreview({ variant = 0 }: { variant?: number }) {
  return <PlanWireframePreview animating variant={variant} />;
}

function InfoPlanCard({
  anchorId,
  plan,
  selected,
  signal,
  orchestrating,
  mechanismLoading,
  placeholderVariant = 0,
  onSelect,
  onEdit,
  onAddModule,
  onRemoveModule,
  onReorderModule,
}: {
  anchorId: string;
  plan: InfoPlan;
  selected: boolean;
  signal?: OptionSignal;
  orchestrating?: boolean;
  mechanismLoading?: boolean;
  placeholderVariant?: number;
  onSelect: () => void;
  onEdit: (value: string) => void;
  onAddModule: (value: string) => void;
  onRemoveModule: (moduleId: string) => void;
  onReorderModule: (moduleId: string, targetIndex: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(plan.userEdit ?? "");
  const closeEditor = () => {
    setEditing(false);
    setEditValue(plan.userEdit ?? "");
  };

  if (plan.isPlaceholder) {
    return (
      <article
        className={`info-card choice-card is-placeholder${mechanismLoading ? " is-generating" : ""}`}
        data-tree-anchor={anchorId}
        aria-disabled="true"
        aria-busy={mechanismLoading || undefined}
      >
        <div className="choice-card-head">
          <h4>
            {mechanismLoading ? (
              <span className="info-gen-title-shimmer" aria-hidden="true" />
            ) : (
              plan.title
            )}
          </h4>
        </div>
        <div className="info-card-body choice-card-preview">
          {mechanismLoading ? (
            <>
              <InfoPlanGeneratingPreview variant={placeholderVariant} />
              {placeholderVariant === 0 && (
                <span className="visually-hidden">正在推导页面骨架与功能编排</span>
              )}
            </>
          ) : (
            <div className="plan-preview plan-preview-empty">
              <span>等待 AI 生成信息架构方案</span>
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className={`info-card choice-card ${selected ? "selected" : ""} ${orchestrating ? "is-orchestrating" : ""}`} data-tree-anchor={anchorId} onClick={onSelect}>
      <div className="choice-card-head">
        <h4>{formatPlanTitle(plan)}</h4>
        <div className="choice-card-head-end">
          {signal && <span className={`option-signal ${signal}`}>{signal === "constraint" ? "输入约束" : "推荐"}</span>}
          <button
            className="edit-plan"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setEditing((value) => !value);
            }}
          >
            修改
          </button>
        </div>
      </div>
      {editing && (
        <form
          className="plan-edit-panel"
          onClick={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault();
            onEdit(editValue.trim());
            setEditing(false);
          }}
        >
          <label>
            <span>结构修改输入框</span>
            <textarea value={editValue} placeholder="例如：首屏先讲品牌故事，再展示商品" rows={3} onChange={(event) => setEditValue(event.target.value)} />
          </label>
          <div className="plan-edit-actions">
            <button className="secondary tiny" type="button" onClick={closeEditor}>
              取消
            </button>
            <button className="primary tiny" type="submit">
              保存
            </button>
          </div>
        </form>
      )}
      <div className="info-plan-split">
        <div className="info-plan-preview-pane">
          <PlanPreview plan={plan} />
          {orchestrating && <p className="info-plan-orchestrating-hint">AI 正在重新编排页面架构…</p>}
        </div>
        <div className="info-plan-tags-pane">
          <PlanModuleTags
            plan={plan}
            disabled={orchestrating}
            onAdd={onAddModule}
            onRemove={onRemoveModule}
            onReorder={onReorderModule}
          />
        </div>
      </div>
      {(() => {
        const cardNote = buildPlanCardNote(plan);
        const decisionPath = Array.isArray(plan.decisionPath) ? plan.decisionPath.filter(Boolean).slice(0, 3) : undefined;
        if (!cardNote && !decisionPath?.length && !plan.risk && !plan.userEdit) return null;
        return (
          <div className="choice-card-note info-card-note">
            {cardNote && <p className="info-card-note-line">{cardNote}</p>}
            {decisionPath && decisionPath.length > 1 && (
              <p className="info-card-decision-path">浏览路径：{decisionPath.join(" → ")}</p>
            )}
            {plan.risk && <p className="info-card-risk">注意：{plan.risk}</p>}
            {plan.userEdit && <p className="user-edit">用户修改：{plan.userEdit}</p>}
          </div>
        );
      })()}
      {selected && <span className="choice-card-check" aria-hidden="true">&#10003;</span>}
    </article>
  );
}

function PlanModuleTags({
  plan,
  disabled,
  onAdd,
  onRemove,
  onReorder,
}: {
  plan: InfoPlan;
  disabled?: boolean;
  onAdd: (value: string) => void;
  onRemove: (moduleId: string) => void;
  onReorder: (moduleId: string, targetIndex: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [dragModuleId, setDragModuleId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const dragModuleIdRef = useRef<string | null>(null);
  const modules = getPlanContentModules(plan);
  const canDrag = modules.length > 1 && !disabled;

  const resolveDropIndex = useCallback((clientY: number) => {
    const row = rowRef.current;
    if (!row) return null;
    const chips = Array.from(row.querySelectorAll<HTMLElement>(".module-chip-item"));
    if (!chips.length) return null;
    for (let chipIndex = 0; chipIndex < chips.length; chipIndex += 1) {
      const rect = chips[chipIndex].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return chipIndex;
    }
    return chips.length - 1;
  }, []);

  const finishDrag = useCallback(
    (clientY?: number) => {
      const moduleId = dragModuleIdRef.current;
      if (moduleId && clientY != null) {
        const fromIndex = modules.findIndex((module) => module.id === moduleId);
        const targetIndex = resolveDropIndex(clientY);
        if (fromIndex >= 0 && targetIndex != null && targetIndex !== fromIndex) {
          onReorder(moduleId, targetIndex);
        }
      }
      dragModuleIdRef.current = null;
      setDragModuleId(null);
      setDropIndex(null);
    },
    [modules, onReorder, resolveDropIndex],
  );

  useEffect(() => {
    if (!dragModuleId) return;
    const onMove = (event: globalThis.PointerEvent) => {
      setDropIndex(resolveDropIndex(event.clientY));
    };
    const onUp = (event: globalThis.PointerEvent) => finishDrag(event.clientY);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragModuleId, finishDrag, resolveDropIndex]);

  const startDrag = (moduleId: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (!canDrag) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragModuleIdRef.current = moduleId;
    setDragModuleId(moduleId);
    setDropIndex(modules.findIndex((module) => module.id === moduleId));
  };

  return (
    <div className="plan-module-tags" onClick={(event) => event.stopPropagation()}>
      <div className="plan-module-tags-head">
        <span>功能内容</span>
        {canDrag ? <small className="plan-module-tags-hint">拖拽把手调整顺序</small> : null}
      </div>
      <div className={`module-chip-row${dragModuleId ? " is-dragging" : ""}`} ref={rowRef}>
        {modules.map((module, index) => (
          <div
            className={`module-chip module-chip-item${module.source === "user-added" ? " is-user-added" : ""}${module.signal === "constraint" ? " is-constraint" : ""}${dragModuleId === module.id ? " is-dragging" : ""}${dropIndex === index && dragModuleId && dragModuleId !== module.id ? " is-drop-target" : ""}`}
            key={module.id}
            title={module.reason}
          >
            {canDrag ? (
              <button
                type="button"
                className="module-chip-drag-handle"
                aria-label={`拖动调整${module.label}顺序`}
                onPointerDown={(event) => startDrag(module.id, event)}
              >
                <GripVertical size={14} aria-hidden="true" />
              </button>
            ) : null}
            <b>{module.label}</b>
            {module.signal === "constraint" ? <em className="option-signal constraint">输入约束</em> : null}
            <button
              type="button"
              className="module-chip-remove"
              aria-label={`删除${module.label}`}
              disabled={disabled}
              onClick={() => onRemove(module.id)}
            >
              ×
            </button>
          </div>
        ))}
        {!adding ? (
          <button
            type="button"
            className="module-chip module-chip-add"
            disabled={disabled}
            onClick={() => setAdding(true)}
            aria-label="新增功能内容"
          >
            <Plus size={13} aria-hidden="true" />
            <b>新增功能</b>
          </button>
        ) : (
          <form
            className="module-add-form module-add-form-inline"
            onSubmit={(event) => {
              event.preventDefault();
              const label = value.trim();
              if (!label) return;
              onAdd(label);
              setValue("");
              setAdding(false);
            }}
          >
            <input
              value={value}
              autoFocus
              maxLength={8}
              placeholder="8字以内，如「客户评价」"
              onChange={(event) => setValue(event.target.value)}
            />
            <button type="submit" disabled={!value.trim()}>
              添加
            </button>
            <button
              type="button"
              className="module-add-cancel"
              onClick={() => {
                setAdding(false);
                setValue("");
              }}
            >
              取消
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function PlanPreview({ plan }: { plan: InfoPlan }) {
  if (plan.isCustom || plan.source === "user-added") {
    return <PlanTextPreview plan={plan} />;
  }
  if (isWireframePlan(plan)) {
    return <PlanWireframePreview plan={plan} />;
  }
  return <PlanTextPreview plan={plan} />;
}

const VISUAL_GRAMMAR_LOADER_STEPS = [
  { id: "color", short: "色彩", label: "推导色彩方案" },
  { id: "font", short: "字体", label: "匹配字体气质" },
  { id: "card", short: "卡片", label: "塑造卡片风格" },
  { id: "density", short: "密度", label: "校准内容密度" },
] as const;

function VisualGrammarLoader() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep((current) => (current + 1) % VISUAL_GRAMMAR_LOADER_STEPS.length);
    }, 2100);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="visual-grammar-loader" role="status" aria-live="polite" aria-label="正在生成视觉语法候选">
      <div className="vg-loader-stage" aria-hidden="true">
        <div className="vg-loader-frame">
          {VISUAL_GRAMMAR_LOADER_STEPS.map((item, index) => (
            <div
              key={item.id}
              className={`vg-loader-slot vg-slot-${item.id}${index === step ? " is-active" : ""}${index < step ? " is-done" : ""}`}
            >
              <span className="vg-loader-slot-label">{item.short}</span>
              <div className="vg-loader-slot-preview">
                {item.id === "color" ? (
                  <div className="vg-preview-color">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                ) : null}
                {item.id === "font" ? (
                  <div className="vg-preview-font">
                    <strong>Aa</strong>
                    <em>Ag</em>
                  </div>
                ) : null}
                {item.id === "card" ? (
                  <div className="vg-preview-card">
                    <span className="vg-preview-card-shadow" />
                    <span className="vg-preview-card-face">
                      <i />
                      <i />
                    </span>
                  </div>
                ) : null}
                {item.id === "density" ? (
                  <div className="vg-preview-density">
                    <span />
                    <span />
                    <span />
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          <div className="vg-loader-beam" />
        </div>
      </div>
      <div className="vg-loader-status stitch-status">
        <p>
          正在生成视觉候选
          <span className="stitch-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </p>
        <div className="stitch-step-track" key={step}>
          <Sparkles size={14} aria-hidden="true" />
          <span>{VISUAL_GRAMMAR_LOADER_STEPS[step].label}</span>
        </div>
        <div className="stitch-progress" aria-hidden="true">
          {VISUAL_GRAMMAR_LOADER_STEPS.map((item, index) => (
            <span key={item.id} className={index === step ? "is-active" : index < step ? "is-done" : undefined} />
          ))}
        </div>
        <small>结合设计意图与信息组织，逐维推导视觉方案</small>
      </div>
    </div>
  );
}

function VisualGrammarPanel({
  project,
  updateProject,
  visualBudget,
  addingByDimension,
  onAddingByDimensionChange,
  onRetryVisual,
  onViewportFocus,
  onViewportFit,
  onFocusVisualGrammar,
}: {
  project: ProjectState;
  updateProject: UpdateProject;
  visualBudget: number;
  addingByDimension: Partial<Record<VisualId, boolean>>;
  onAddingByDimensionChange: (value: Partial<Record<VisualId, boolean>>) => void;
  onRetryVisual: () => void;
  onViewportFocus?: ViewportFocusHandler;
  onViewportFit?: ViewportFitHandler;
  onFocusVisualGrammar?: (delayMs?: number, force?: boolean) => () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const onViewportFocusRef = useRef(onViewportFocus);
  onViewportFocusRef.current = onViewportFocus;
  const onViewportFitRef = useRef(onViewportFit);
  onViewportFitRef.current = onViewportFit;
  const onFocusVisualGrammarRef = useRef(onFocusVisualGrammar);
  onFocusVisualGrammarRef.current = onFocusVisualGrammar;
  const prevVisibleCountRef = useRef(0);
  const lastOptionsPanKeyRef = useRef<string | null>(null);
  const visualPanSessionRef = useRef({ planId: undefined as string | undefined, mechanismKey: undefined as string | undefined });
  const visualFocusTimerRef = useRef<number | null>(null);
  const pendingSelectFocusRef = useRef<number | null>(null);
  const visualAiLoading = project.ai?.tasks.visual === "loading";
  const visualError = project.ai?.errors.visual;
  const visualOptionsReady =
    Boolean(project.mechanism.selectedInfoPlanId) &&
    project.mechanism.visualDimensions.every((dimension) => dimension.options.length > 0);
  const visualAwaitingAi =
    Boolean(project.mechanism.selectedInfoPlanId) &&
    !visualOptionsReady &&
    !visualError &&
    (project.ai?.tasks.visual === "loading" ||
      (project.ai?.tasks.visual === "idle" && !project.ai?.visualGrammarSource));
  const { visibleCount } = useProgressiveFlow(project.mechanism.visualDimensions);
  const visibleDimensions = project.mechanism.visualDimensions.slice(0, visibleCount);
  const requestVisualViewportFocus = useCallback((delayMs = VIEWPORT_VISUAL_FOCUS_DELAY_MS) => {
    if (visualFocusTimerRef.current) {
      window.clearTimeout(visualFocusTimerRef.current);
    }
    visualFocusTimerRef.current = window.setTimeout(() => {
      visualFocusTimerRef.current = null;
      onFocusVisualGrammarRef.current?.(0, false);
    }, delayMs);
  }, []);
  const visualBranchLayout = useMemo(
    () => getVisualBranchLayout(visibleDimensions, visualBudget, addingByDimension),
    [visibleDimensions, visualBudget, addingByDimension],
  );
  const visualBranchWidth = visualBranchLayout.width;
  const dimensionEdges: TreeEdge[] = visibleDimensions.map((dimension) => ({
    from: "mechanism-visual-head",
    to: `mechanism-visual-dimension-${dimension.id}`,
    key: dimension.id,
  }));
  const setAddingForDimension = (dimensionId: VisualId, adding: boolean) => {
    onAddingByDimensionChange(
      addingByDimension[dimensionId] === adding ? addingByDimension : { ...addingByDimension, [dimensionId]: adding },
    );
  };

  useEffect(() => {
    return () => {
      if (visualFocusTimerRef.current) {
        window.clearTimeout(visualFocusTimerRef.current);
        visualFocusTimerRef.current = null;
      }
      if (pendingSelectFocusRef.current) {
        window.clearTimeout(pendingSelectFocusRef.current);
        pendingSelectFocusRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const planId = project.mechanism.selectedInfoPlanId;
    const mechanismKey = project.ai?.mechanismKey;
    const session = visualPanSessionRef.current;
    if (session.planId !== planId || session.mechanismKey !== mechanismKey) {
      session.planId = planId;
      session.mechanismKey = mechanismKey;
      prevVisibleCountRef.current = 0;
      lastOptionsPanKeyRef.current = null;
    }
    if (!planId) {
      prevVisibleCountRef.current = 0;
      lastOptionsPanKeyRef.current = null;
    }
  }, [project.mechanism.selectedInfoPlanId, project.ai?.mechanismKey]);

  useEffect(() => {
    if (!project.mechanism.visualExpanded || !project.mechanism.selectedInfoPlanId || !visualOptionsReady) return;

    const panKey = `${project.ai?.mechanismKey ?? ""}::${project.mechanism.selectedInfoPlanId}::ready`;
    if (lastOptionsPanKeyRef.current === panKey) return;
    lastOptionsPanKeyRef.current = panKey;
    prevVisibleCountRef.current = Math.max(prevVisibleCountRef.current, visibleCount);
    requestVisualViewportFocus();
  }, [
    project.ai?.mechanismKey,
    project.mechanism.visualExpanded,
    project.mechanism.selectedInfoPlanId,
    visualOptionsReady,
    visibleCount,
    requestVisualViewportFocus,
  ]);

  useEffect(() => {
    if (!project.mechanism.visualExpanded || !visualOptionsReady) return;
    const prev = prevVisibleCountRef.current;
    if (visibleCount <= prev) {
      prevVisibleCountRef.current = visibleCount;
      return;
    }
    if (prev === 0) {
      prevVisibleCountRef.current = visibleCount;
      return;
    }
    const newest = visibleDimensions[visibleCount - 1];
    prevVisibleCountRef.current = visibleCount;
    if (!newest) return;
    requestVisualViewportFocus();
  }, [visibleCount, project.mechanism.visualExpanded, visualOptionsReady, visibleDimensions, requestVisualViewportFocus]);

  return (
    <section
      ref={panelRef}
      className={`tree-panel visual-panel ${project.mechanism.visualExpanded ? "is-expanded" : "is-collapsed"}`}
      style={
        {
          "--visual-branch-width": `${visualBranchWidth}px`,
          "--visual-budget": `${visualBranchWidth}px`,
          "--visual-head-dimension-gap": `${VISUAL_HEAD_DIMENSION_GAP}px`,
          "--visual-dimension-gap": `${VISUAL_DIMENSION_GAP}px`,
        } as CSSProperties
      }
    >
      {project.mechanism.visualExpanded && <MeasuredTreeLines containerRef={panelRef} edges={dimensionEdges} />}
      <div className="tree-panel-head" data-tree-anchor="mechanism-visual-head">
        <span className="node-icon">
          <Palette size={21} />
        </span>
        <div>
          <h3>视觉语法</h3>
          <p>
            {visualAiLoading && !visualOptionsReady
              ? "AI 正在结合信息组织生成视觉候选…"
              : visualOptionsReady
                ? "请为色彩、字体、卡片样式、内容密度各选一项。"
                : "根据设计意图与信息组织，为色彩、字体、卡片样式、内容密度推荐可选方案。"}
          </p>
        </div>
        {!visualError && visualAiLoading && !visualOptionsReady && <span className="ai-spinner ai-spinner-inline" aria-label="分析中" />}
        {visualError && !visualOptionsReady && !visualAiLoading && (
          <div className="info-plan-error-banner tree-panel-head-banner" role="status">
            <p className="ai-status-line ai-status-error">视觉语法推导失败</p>
            <small>{visualError}</small>
            <button className="ai-retry-button" type="button" onClick={onRetryVisual}>
              重新生成
            </button>
          </div>
        )}
        {project.ai?.visualGrammarSource === "reference-fallback" && !visualAiLoading && visualOptionsReady && (
          <div className="info-plan-error-banner subtle tree-panel-head-banner" role="status">
            <p className="ai-status-line">AI 推导未成功，当前展示案例库推荐方案。</p>
            {visualError ? <small>{visualError}</small> : null}
            <button className="ai-retry-button" type="button" onClick={onRetryVisual}>
              重新生成
            </button>
          </div>
        )}
      </div>
      {project.mechanism.visualExpanded && !visualOptionsReady && !visualError && (
        <div className="visual-options-pending" role="status" aria-live="polite">
          {visualAwaitingAi ? (
            <VisualGrammarLoader />
          ) : (
            <>
              <span className="ai-spinner ai-spinner-lg" aria-hidden="true" />
              <p>请先选择信息组织方案，AI 将生成视觉语法候选。</p>
            </>
          )}
        </div>
      )}
      {project.mechanism.visualExpanded && visualOptionsReady && (
        <VisualBranchTrack visualBranchWidth={visualBranchWidth} slots={visualBranchLayout.slots}>
          {visualBranchLayout.slots.map(({ dimension, width: slotWidth }) => (
          <VisualDimensionBranch
            key={dimension.id}
            dimension={dimension}
            slotWidth={slotWidth}
            adding={addingByDimension[dimension.id] ?? false}
            onAddingChange={(adding) => setAddingForDimension(dimension.id, adding)}
            onSelect={(optionId) => {
              let nextDimensions = project.mechanism.visualDimensions;
              updateProject((current) => {
                nextDimensions = current.mechanism.visualDimensions.map((item) =>
                  item.id === dimension.id
                    ? { ...item, selectedOptionId: optionId, expanded: false }
                    : item,
                );
                return {
                  ...current,
                  mechanism: {
                    ...current.mechanism,
                    visualDimensions: nextDimensions,
                  },
                };
              });
              if (pendingSelectFocusRef.current) {
                window.clearTimeout(pendingSelectFocusRef.current);
              }
              pendingSelectFocusRef.current = window.setTimeout(() => {
                pendingSelectFocusRef.current = null;
                const nextDimension = nextDimensions.find((item) => !item.selectedOptionId);
                if (nextDimension) {
                  requestVisualViewportFocus(120);
                }
              }, 0);
            }}
            onToggle={() => {
              const willExpand = !dimension.expanded;
              setAddingForDimension(dimension.id, false);
              updateProject((current) => ({
                ...current,
                mechanism: {
                  ...current.mechanism,
                  visualDimensions: current.mechanism.visualDimensions.map((item) => (item.id === dimension.id ? { ...item, expanded: !item.expanded } : item)),
                },
              }));
              if (willExpand) {
                requestVisualViewportFocus(100);
              }
            }}
            onExpand={() => {
              updateProject((current) => ({
                ...current,
                mechanism: {
                  ...current.mechanism,
                  visualDimensions: current.mechanism.visualDimensions.map((item) => (item.id === dimension.id ? { ...item, expanded: true } : item)),
                },
              }));
              requestVisualViewportFocus(100);
            }}
            onAddCustom={(label) => {
              setAddingForDimension(dimension.id, false);
              updateProject((current) => ({
                ...current,
                mechanism: {
                  ...current.mechanism,
                  visualDimensions: current.mechanism.visualDimensions.map((item) => {
                    if (item.id !== dimension.id) return item;
                    const custom = {
                      ...option(label.trim()),
                      ...normalizeUserAddedVisualOption(dimension.id, label.trim(), current.rawInput),
                    };
                    return { ...item, expanded: true, options: [...item.options, custom], selectedOptionId: custom.id };
                  }),
                },
              }));
            }}
          />
        ))}
        </VisualBranchTrack>
      )}
    </section>
  );
}

function VisualBranchTrack({
  visualBranchWidth,
  slots,
  children,
}: {
  visualBranchWidth: number;
  slots: Array<{ dimension: VisualDimension; width: number; center: number }>;
  children: ReactNode;
}) {
  return (
    <>
      <div className="visual-branch-track" style={{ "--visual-branch-width": `${visualBranchWidth}px` } as CSSProperties}>
        <div className="visual-branches">{children}</div>
      </div>
    </>
  );
}

function VisualDimensionBranch({
  dimension,
  slotWidth,
  adding,
  onAddingChange,
  onSelect,
  onToggle,
  onExpand,
  onAddCustom,
}: {
  dimension: VisualDimension;
  slotWidth: number;
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  onSelect: (optionId: string) => void;
  onToggle: () => void;
  onExpand: () => void;
  onAddCustom: (label: string) => void;
}) {
  const [customLabel, setCustomLabel] = useState("");
  const dimensionRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);
  const connectorHeight = VISUAL_TITLE_OPTION_GAP;
  const titleWidth = getVisualDimensionTitleWidth(dimension);
  const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
  const selectedOptionId = selected?.id;
  const collapsedWithSelection = Boolean(selected && !dimension.expanded);
  const visibleOptions = selected && !dimension.expanded ? [selected] : dimension.options;
  const visibleNodeCount = computeVisibleBranchNodeCount(visibleOptions.length, adding);
  const branchSlotCount = computeVisualBranchLayoutCount(dimension, adding);
  const branchWidth = Math.max(slotWidth, titleWidth, getVisualOptionRowWidth(branchSlotCount) + VISUAL_OPTION_BRANCH_PAD);
  const [lineOriginX, setLineOriginX] = useState(branchWidth / 2);
  const optionLayout = getVisualOptionLayout(visibleNodeCount);
  const getDisplayPosition = (item: OptionItem, index: number) => defaultVisualOptionPosition(index, visibleNodeCount);
  const addPosition = defaultVisualOptionPosition(visibleOptions.length, visibleNodeCount);
  const branchNodes = adding
    ? [...visibleOptions.map((item, index) => getDisplayPosition(item, index)), addPosition]
    : visibleOptions.map((item, index) => getDisplayPosition(item, index));
  const optionAreaHeight = Math.max(200, ...branchNodes.map((position) => position.y + VISUAL_OPTION_HEIGHT + 20), 0);
  const totalBranchHeight = connectorHeight + optionAreaHeight;
  const visualOptionEdges: TreeEdge[] = [
    ...visibleOptions.map((item) => ({
      from: `mechanism-visual-dimension-${dimension.id}`,
      to: `mechanism-visual-option-${dimension.id}-${item.id}`,
      key: item.id,
      muted: Boolean(selectedOptionId && item.id !== selectedOptionId),
    })),
    ...(adding
      ? [
          {
            from: `mechanism-visual-dimension-${dimension.id}`,
            to: `mechanism-visual-option-${dimension.id}-add`,
            key: "add",
          },
        ]
      : []),
  ];

  useLayoutEffect(() => {
    const head = headRef.current;
    const branch = branchRef.current;
    const dimensionNode = dimensionRef.current;
    if (!head || !branch) return;

    const measure = () => {
      setLineOriginX(measureBranchLineOrigin(head, branch));
    };

    const cleanups = [
      attachLayoutMeasurement(branch, measure, { observeAnchors: true }),
      dimensionNode ? attachLayoutMeasurement(dimensionNode, measure, { observeAnchors: true }) : () => undefined,
    ];
    measure();
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [branchWidth, dimension.expanded, dimension.selectedOptionId, visibleOptions.length, visibleNodeCount, adding, slotWidth, dimension.options]);

  return (
    <article
      ref={dimensionRef}
      className={`visual-dimension ${dimension.expanded ? "is-branch-expanded" : "is-branch-collapsed"}`}
      style={
        {
          "--visual-dimension-slot-width": `${branchWidth}px`,
          "--visual-dimension-title-width": `${titleWidth}px`,
          "--visual-option-card-width": `${optionLayout.cardWidth}px`,
          "--visual-connector-height": `${connectorHeight}px`,
        } as CSSProperties
      }
    >
      <MeasuredTreeLines containerRef={dimensionRef} edges={visualOptionEdges} />
      <div className="visual-title" ref={headRef} data-tree-anchor={`mechanism-visual-dimension-${dimension.id}`} data-visual-dimension={dimension.id}>
        <span className="node-icon">
          {dimension.id === "font" ? <Type size={18} /> : dimension.id === "card" ? <Boxes size={18} /> : dimension.id === "density" ? <LayoutGrid size={18} /> : <Palette size={18} />}
        </span>
        <div className="visual-title-head">
          <h4>{dimension.title}</h4>
          <div className="visual-title-actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => {
                const nextAdding = !adding;
                if (nextAdding && selected && !dimension.expanded) {
                  onExpand();
                }
                onAddingChange(nextAdding);
              }}
              aria-label={`添加${dimension.title}选项`}
            >
              <Plus size={14} />
            </button>
            {selected && (
              <button className="expand-toggle" type="button" onClick={onToggle}>
                {dimension.expanded ? "收起" : "展开"}
              </button>
            )}
          </div>
        </div>
        <p className="visual-title-desc">{dimension.description}</p>
      </div>
      {visibleOptions.length > 0 && (
        <div
          className="visual-option-branch"
          ref={branchRef}
          style={{ "--visual-branch-height": `${totalBranchHeight}px`, "--visual-option-area-height": `${optionAreaHeight}px` } as CSSProperties}
        >
          <div className="visual-options" style={{ "--visual-branch-height": `${optionAreaHeight}px` } as CSSProperties}>
          {visibleOptions.map((item, index) => (
            <VisualOptionNode
              key={item.id}
              anchorId={`mechanism-visual-option-${dimension.id}-${item.id}`}
              dimensionId={dimension.id}
              option={item}
              selected={item.id === dimension.selectedOptionId}
              position={getDisplayPosition(item, index)}
              cardWidth={optionLayout.cardWidth}
              onSelect={() => onSelect(item.id)}
            />
          ))}
          {adding && (
            <form
              className="visual-option add-child-card visual-add-node"
              data-tree-anchor={`mechanism-visual-option-${dimension.id}-add`}
              style={{ "--visual-option-x": `${addPosition.x}px`, "--visual-option-y": `${addPosition.y}px` } as CSSProperties}
              onSubmit={(event) => {
                event.preventDefault();
                if (!customLabel.trim()) return;
                onAddCustom(customLabel.trim());
                setCustomLabel("");
              }}
            >
              <span>新增{dimension.title}</span>
              <input value={customLabel} autoFocus placeholder="输入选项" onChange={(event) => setCustomLabel(event.target.value)} />
              <div className="add-child-actions">
                <button type="submit" disabled={!customLabel.trim()}>
                  添加
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddingChange(false);
                    setCustomLabel("");
                  }}
                >
                  取消
                </button>
              </div>
            </form>
          )}
          </div>
        </div>
      )}
    </article>
  );
}

function VisualOptionNode({
  anchorId,
  dimensionId,
  option,
  selected,
  position,
  cardWidth,
  onSelect,
}: {
  anchorId: string;
  dimensionId: VisualId;
  option: OptionItem;
  selected: boolean;
  position: { x: number; y: number };
  cardWidth: number;
  onSelect: () => void;
}) {
  const display = resolveVisualGrammarDisplay(dimensionId, option);
  const isSpecimenLead = dimensionId === "color" || dimensionId === "font" || dimensionId === "card" || dimensionId === "density";

  return (
    <button
      className={`visual-option visual-option-node choice-card ${selected ? "selected" : ""}${isSpecimenLead ? " is-specimen-lead" : ""}`}
      data-tree-anchor={anchorId}
      style={
        {
          "--visual-option-x": `${position.x}px`,
          "--visual-option-y": `${position.y}px`,
          "--visual-option-card-width": `${cardWidth}px`,
        } as CSSProperties
      }
      type="button"
      onClick={onSelect}
    >
      {isSpecimenLead ? (
        <>
          <div className="choice-card-preview choice-card-preview--lead">
            <VisualRecipePreview dimensionId={dimensionId} option={option} />
          </div>
          <div className="choice-card-meta">
            <div className="choice-card-head">
              <span className="choice-card-title">{display.styleName}</span>
              {option.signal ? (
                <em className={`option-signal ${option.signal}`}>{option.signal === "constraint" ? "输入约束" : "推荐"}</em>
              ) : null}
            </div>
            <DimensionTokenChips dimensionId={dimensionId} option={option} />
          </div>
        </>
      ) : null}
      {option.reason && <small className="choice-card-note choice-card-reason">{option.reason}</small>}
      {selected && <span className="choice-card-check" aria-hidden="true">&#10003;</span>}
    </button>
  );
}

const GENERATE_STITCH_STEPS = ["搭建页面布局", "组装信息区块", "应用视觉语法", "渲染页面细节"] as const;

function GenerateStitchLoader({ streamChars }: { streamChars?: number }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep((current) => (current + 1) % GENERATE_STITCH_STEPS.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="generate-stitch-loader" role="status" aria-live="polite" aria-label="正在生成页面">
      <div className="stitch-stage" aria-hidden="true">
        <div className="stitch-frame">
          <div className="stitch-piece stitch-nav">
            <span className="stitch-logo" />
            <span className="stitch-pill" />
            <span className="stitch-pill" />
            <span className="stitch-pill stitch-pill-short" />
          </div>
          <div className="stitch-body">
            <div className="stitch-piece stitch-aside">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="stitch-main">
              <div className="stitch-piece stitch-hero">
                <span className="stitch-hero-line" />
                <span className="stitch-hero-line short" />
              </div>
              <div className="stitch-piece stitch-toolbar">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="stitch-piece stitch-grid">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
          <div className="stitch-beam" />
          <div className="stitch-cursor" />
        </div>
      </div>
      <div className="stitch-status">
        <p>
          正在生成页面
          <span className="stitch-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </p>
        <div className="stitch-step-track" key={step}>
          <Sparkles size={14} aria-hidden="true" />
          <span>{GENERATE_STITCH_STEPS[step]}</span>
        </div>
        <div className="stitch-progress" aria-hidden="true">
          {GENERATE_STITCH_STEPS.map((label, index) => (
            <span key={label} className={index === step ? "is-active" : index < step ? "is-done" : undefined} />
          ))}
        </div>
        <small>根据信息组织与视觉语法综合生成中</small>
        {streamChars && streamChars > 0 ? (
          <small className="generate-stream-progress">已输出约 {streamChars.toLocaleString()} 字</small>
        ) : null}
      </div>
    </div>
  );
}

function GenerateWorkspace({
  project,
  updateProject,
  aiAbortRef,
  onBackToIntent,
}: {
  project: ProjectState;
  updateProject: UpdateProject;
  aiAbortRef: MutableRefObject<AiAbortBag>;
  onBackToIntent: () => void;
}) {
  const generationKey = buildGenerationKey(project);
  const generateStatus = project.ai?.tasks.generate ?? "idle";
  const generateError = project.ai?.errors.generate;
  const html = project.ai?.generatedHtml;
  const htmlReady = generateStatus === "done" && html && project.ai?.generationKey === generationKey;
  const generationKickRef = useRef<string | null>(null);
  const [masterGoExport, setMasterGoExport] = useState<MasterGoCanvasImportResult | null>(null);
  const [masterGoExporting, setMasterGoExporting] = useState(false);
  const [masterGoExportError, setMasterGoExportError] = useState<string | null>(null);

  useEffect(() => {
    if (htmlReady) return;
    if (generateStatus === "loading") return;
    if (generateStatus === "error") return;
    if (project.ai?.generatedHtml && project.ai.generationKey === generationKey) return;
    if (generationKickRef.current === generationKey) return;

    generationKickRef.current = generationKey;
    updateProject((current) => clearSpendBlockForRetry(current), { persistHistory: false });
    void runPageGeneration(project, updateProject, aiAbortRef.current);
  }, [generationKey, generateStatus, htmlReady, project, updateProject, aiAbortRef]);

  const retryGeneration = () => {
    generationKickRef.current = null;
    updateProject((current) => clearSpendBlockForRetry(current), { persistHistory: false });
    void runPageGeneration(project, updateProject, aiAbortRef.current);
  };

  const importToMasterGoCanvas = async () => {
    if (!html?.trim()) {
      setMasterGoExportError("没有可导入的页面 HTML，请先生成页面。");
      return;
    }

    setMasterGoExportError(null);
    setMasterGoExporting(true);
    try {
      const result = await importHtmlToMasterGoCanvas(project);
      setMasterGoExport(result);
    } catch (error) {
      setMasterGoExportError(error instanceof Error ? error.message : "导入画布失败");
    } finally {
      setMasterGoExporting(false);
    }
  };

  return (
    <section className="generate-workspace">
      <header className="generate-header">
        <div>
          <h1>新页面</h1>
          <p>{project.intent.designIntentText.replace(/^设计意图方向[:：]\s*/, "")}</p>
        </div>
        <div className="header-actions">
          <button className="secondary" type="button" onClick={onBackToIntent}>
            修改设计意图
          </button>
          {htmlReady ? (
            <>
              <button className="secondary" type="button" disabled={masterGoExporting} onClick={() => void importToMasterGoCanvas()}>
                {masterGoExporting ? "导入中…" : "导入画布"}
              </button>
              <button className="primary" type="button" onClick={() => downloadProjectHtml(project)}>
                下载保存
              </button>
            </>
          ) : generateStatus === "error" ? (
            <button className="primary" type="button" onClick={retryGeneration}>
              重试生成
            </button>
          ) : null}
        </div>
      </header>
      {masterGoExportError ? (
        <p className="mastergo-export-error" role="alert">{masterGoExportError}</p>
      ) : null}
      <div className="generation-layout">
        <div className="preview-frame">
          {generateStatus === "error" ? (
            <div className="generate-empty-state">
              <p>页面生成失败</p>
              {generateError && <small>{generateError}</small>}
              <button className="primary" type="button" onClick={retryGeneration}>
                重试生成
              </button>
            </div>
          ) : htmlReady ? (
            <iframe className="generated-preview-frame" title="Generated page preview" srcDoc={html} />
          ) : (
            <div className="generate-empty-state is-loading">
              <GenerateStitchLoader streamChars={project.ai?.generateStreamChars} />
            </div>
          )}
          <div className="version-strip">
            <button className="version-pill active" type="button">版本 1</button>
            <button className="version-pill" type="button">{htmlReady ? "刚刚" : (project.ai?.tasks.generate === "loading" ? "生成中" : "未生成")}</button>
          </div>
        </div>
        <GenerationSchemeSidebar project={project} />
      </div>
      {masterGoExport ? <MasterGoExportModal result={masterGoExport} onClose={() => setMasterGoExport(null)} /> : null}
    </section>
  );
}

function GenerationSchemeSidebar({ project }: { project: ProjectState }) {
  const plan = project.mechanism.infoPlans.find((item) => item.id === project.mechanism.selectedInfoPlanId);
  const visualSelections = project.mechanism.visualDimensions.map((dimension) => ({
    title: dimension.title,
    option: dimension.options.find((item) => item.id === dimension.selectedOptionId)?.label ?? "未选择",
  }));

  return (
    <aside className="generation-scheme-sidebar">
      <div className="scheme-block scheme-heading">
        <span>当前方案</span>
        <h2>{resolveProjectPageLabel(project)}</h2>
      </div>
      <div className="scheme-block">
        <small>信息组织</small>
        <strong>{plan?.title ?? "未选择"}</strong>
        {plan?.summary && <p>{plan.summary}</p>}
      </div>
      <div className="scheme-block">
        <small>视觉语言</small>
        <div className="scheme-choice-list">
          {visualSelections.map((item) => (
            <div className="scheme-choice" key={item.title}>
              <span>{item.title}</span>
              <strong>{item.option}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="scheme-block muted">
        <small>设计意图</small>
        <p>{project.intent.designIntentText.replace(/^设计意图方向[:：]\s*/, "")}</p>
      </div>
    </aside>
  );
}
