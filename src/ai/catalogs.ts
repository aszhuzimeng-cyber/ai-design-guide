import type { DimensionId, VisualId } from "../types";

export const VISUAL_DIMENSION_INITIAL_OPTIONS = 3;
export const VISUAL_DIMENSION_IDS: VisualId[] = ["color", "font", "card", "density"];

export const VISUAL_OPTION_CATALOG: Record<VisualId, Array<{ id: string; label: string }>> = {
  color: [
    { id: "warm", label: "高对比暖色" },
    { id: "lively", label: "活力撞色系" },
    { id: "redblack", label: "深亮红黑" },
    { id: "blue", label: "冷静蓝系" },
    { id: "low", label: "低饱和浅色" },
  ],
  font: [
    { id: "system", label: "无衬线体" },
    { id: "alibaba", label: "无衬线体" },
    { id: "display", label: "粗黑体" },
    { id: "din", label: "无衬线体" },
  ],
  card: [
    { id: "flat", label: "扁平无影" },
    { id: "soft", label: "轻阴影" },
    { id: "bordered", label: "描边分组" },
    { id: "elevated", label: "强阴影" },
  ],
  density: [
    { id: "spacious", label: "疏松留白" },
    { id: "balanced", label: "中等密度" },
    { id: "compact", label: "紧凑密集" },
  ],
};

export function visualCatalogVocabulary() {
  return Object.fromEntries(
    VISUAL_DIMENSION_IDS.map((dimensionId) => [dimensionId, VISUAL_OPTION_CATALOG[dimensionId].map((item) => item.label)]),
  ) as Record<VisualId, string[]>;
}

export type BriefIntentDimension = DimensionId;
