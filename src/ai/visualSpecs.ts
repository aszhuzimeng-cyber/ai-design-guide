import type { OptionItem, VisualId } from "../types";

export type VisualSpecEntry = {
  label: string;
  cssTokens: Record<string, string>;
  instruction: string;
};

export const VISUAL_SPECS: Record<VisualId, Record<string, VisualSpecEntry>> = {
  color: {
    warm: {
      label: "高对比暖色",
      cssTokens: { primary: "#f97316", secondary: "#fde68a", accent: "#111827", background: "#fff7ed", text: "#111827" },
      instruction: "主色橙 #f97316、辅色黄 #fde68a、强调黑 #111827，禁止改成蓝紫等其它配色。",
    },
    lively: {
      label: "活力撞色系",
      cssTokens: { primary: "#22c55e", secondary: "#a855f7", accent: "#f59e0b", background: "#f8fafc", text: "#0f172a" },
      instruction: "主色绿 #22c55e、辅色紫 #a855f7、强调橙 #f59e0b，禁止改成蓝橙等其它配色。",
    },
    redblack: {
      label: "深亮红黑",
      cssTokens: { primary: "#dc2626", secondary: "#111827", accent: "#fee2e2", background: "#fff", text: "#111827" },
      instruction: "主色红 #dc2626、辅色黑 #111827、点缀浅红 #fee2e2。",
    },
    blue: {
      label: "冷静蓝系",
      cssTokens: { primary: "#2563eb", secondary: "#dbeafe", accent: "#0f172a", background: "#f8fafc", text: "#0f172a" },
      instruction: "主色蓝 #2563eb、辅色浅蓝 #dbeafe、强调深蓝 #0f172a。",
    },
    low: {
      label: "低饱和浅色",
      cssTokens: { primary: "#d6c6b5", secondary: "#f5efe6", accent: "#334155", background: "#faf8f5", text: "#334155" },
      instruction: "主色米咖 #d6c6b5、背景 #f5efe6、文字 #334155，整体低饱和克制。",
    },
  },
  font: {
    system: {
      label: "无衬线体",
      cssTokens: { heading: '"PingFang SC", "Microsoft YaHei", sans-serif', body: '"PingFang SC", "Microsoft YaHei", sans-serif' },
      instruction: "标题与正文均用无衬线黑体，字重克制。",
    },
    alibaba: {
      label: "无衬线体",
      cssTokens: { heading: '"Alibaba PuHuiTi", "PingFang SC", sans-serif', body: '"Alibaba PuHuiTi", "PingFang SC", sans-serif' },
      instruction: "使用无衬线普惠体感，亲和清晰。",
    },
    display: {
      label: "粗黑体",
      cssTokens: { heading: '"YouSheBiaoTiHei", "PingFang SC", sans-serif', body: '"PingFang SC", sans-serif' },
      instruction: "标题用粗黑展示字体，正文保持无衬线易读。",
    },
    din: {
      label: "无衬线体",
      cssTokens: { heading: '"PingFang SC", "Microsoft YaHei", sans-serif', body: '"PingFang SC", "Microsoft YaHei", sans-serif' },
      instruction: "标题与正文均用无衬线黑体。",
    },
  },
  card: {
    flat: {
      label: "扁平无影",
      cssTokens: { card: "4px", shadow: "none", border: "1px solid #e5e7eb" },
      instruction: "卡片扁平贴底，细边框、无阴影、小圆角。",
    },
    soft: {
      label: "轻阴影",
      cssTokens: { card: "10px", shadow: "0 4px 14px rgba(15,23,42,0.08)", border: "none" },
      instruction: "卡片使用轻柔阴影与柔和圆角，形成轻量浮层感。",
    },
    bordered: {
      label: "描边分组",
      cssTokens: { card: "8px", shadow: "none", border: "1px solid #cbd5e1" },
      instruction: "卡片以清晰描边分组，无阴影。",
    },
    elevated: {
      label: "强阴影",
      cssTokens: { card: "12px", shadow: "0 8px 24px rgba(15,23,42,0.12)", border: "none" },
      instruction: "卡片明显浮起，强阴影与圆角，强调模块层级。",
    },
  },
  density: {
    spacious: {
      label: "疏松留白",
      cssTokens: { density: "spacious", gap: "24px", columns: "2" },
      instruction: "大留白、模块间距宽、每屏信息点少，浏览节奏舒缓。",
    },
    balanced: {
      label: "中等密度",
      cssTokens: { density: "balanced", gap: "16px", columns: "3" },
      instruction: "留白与信息点适中，兼顾浏览效率与可读性。",
    },
    compact: {
      label: "紧凑密集",
      cssTokens: { density: "compact", gap: "10px", columns: "4" },
      instruction: "信息点密集、间距紧凑，适合需要快速扫读或对比的场景。",
    },
  },
};

export function getVisualSpec(dimensionId: VisualId, optionId: string): VisualSpecEntry | undefined {
  return VISUAL_SPECS[dimensionId]?.[optionId];
}

export function buildVisualSelectionSpecs(
  dimensions: Array<{
    id: VisualId;
    title: string;
    selectedOptionId?: string;
    options: OptionItem[];
  }>,
) {
  return dimensions
    .map((dimension) => {
      const selected = dimension.options.find((item) => item.id === dimension.selectedOptionId);
      if (!selected) return null;
      const spec = getVisualSpec(dimension.id, selected.id);
      const tokenHints = selected.tokenHints ?? {};
      const dynamicTokens = stringRecord(tokenHints);
      const generationRules = selected.generationRules ?? [];
      const bindingInstruction = [
        `【硬约束】用户已选「${selected.label}」，禁止替换为其它${dimension.title}方案。`,
        spec?.instruction,
        selected.reason ?? selected.knowledge,
        ...generationRules,
      ]
        .filter(Boolean)
        .join(" ");
      return {
        dimensionId: dimension.id,
        dimensionTitle: dimension.title,
        optionId: selected.id,
        label: selected.label,
        cssTokens: spec?.cssTokens ?? dynamicTokens,
        tokenHints,
        previewRules: selected.previewRules,
        generationRules,
        reason: selected.reason ?? selected.knowledge,
        instruction: bindingInstruction,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function stringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}
