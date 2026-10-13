import type { DimensionId, IntentDimension } from "./types";

export function readDimension(dimensions: IntentDimension[], id: DimensionId) {
  const dimension = dimensions.find((item) => item.id === id);
  return dimension?.options.find((item) => item.id === dimension.selectedOptionId)?.label;
}

export function buildDesignIntentText(dimensions: IntentDimension[]) {
  const user = readDimension(dimensions, "targetUser") || "待确认用户";
  const focus = readDimension(dimensions, "coverage") || "待确认突出重点";
  const feeling = readDimension(dimensions, "valueProposition") || "待确认核心感觉";
  return `设计意图方向：面向${user}，优先突出${focus}，用${feeling}的核心感觉建立判断，让页面先服务正确的人，再讲清最重要的信息。`;
}

export function buildIntentSummary(dimensions: IntentDimension[]) {
  return dimensions
    .map((dimension) => {
      const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
      if (!selected?.label) return "";
      const reason = selected.reason?.trim();
      return reason ? `${selected.label}（${reason}）` : selected.label;
    })
    .filter(Boolean)
    .join(" / ");
}
