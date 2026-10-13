export const CONTENT_MODULE_LABEL_MAX = 8;

const LABEL_ALIASES: Record<string, string> = {
  "核心 offer": "核心方案",
  核心offer: "核心方案",
  "互动 demo": "互动演示",
  互动demo: "互动演示",
  "客户 logo": "客户标识",
  客户logo: "客户标识",
  faq: "常见问题",
  FAQ: "常见问题",
  "地图/联系方式": "联系方式",
  主要行动入口: "主行动",
  "风格分类与精选案例": "精选案例",
  "服务流程与交付方式": "服务流程",
  "客户评价、项目结果、常见问题": "客户评价",
  "预约咨询或查看套餐": "预约咨询",
};

/** 标准功能内容短词库（与 content-modules 对齐） */
const CANONICAL_LABELS = [
  "首屏定位",
  "核心方案",
  "主行动",
  "代表作品",
  "作品分类",
  "产品截图",
  "互动演示",
  "功能分组",
  "使用场景",
  "服务流程",
  "合作流程",
  "价格套餐",
  "价格",
  "权益对比",
  "客户评价",
  "客户案例",
  "客户标识",
  "案例研究",
  "前后对比",
  "资质证书",
  "安全合规",
  "保障承诺",
  "常见问题",
  "内容分类",
  "搜索筛选",
  "专题集合",
  "订阅入口",
  "活动议程",
  "嘉宾介绍",
  "报名表单",
  "联系方式",
  "结果预览",
  "历史记录",
  "保存导出",
  "空状态",
  "服务范围",
  "软件开发",
  "核心价值",
  "预约咨询",
] as const;

const KEYWORD_TO_LABEL: Array<[RegExp, string]> = [
  [/客户评价|社会证明|用户评价|口碑|testimonial/i, "客户评价"],
  [/客户案例|成功案例|案例故事|案例结果|代表案例|每个收益点配客户/, "客户案例"],
  [/收益点|价值点|核心卖点|核心价值|服务价值/, "核心价值"],
  [/价格|套餐|报价|费用|定价/, "价格套餐"],
  [/合作流程|服务流程|交付流程|实施流程|流程步骤/, "合作流程"],
  [/资质|证书|认证|牌照/, "资质证书"],
  [/软件开发|小程序|网站搭建|系统开发|开发服务/, "软件开发"],
  [/服务范围|业务范围|服务项目/, "服务范围"],
  [/faq|常见问|疑问/, "常见问题"],
  [/联系|咨询|预约|合作入口/, "预约咨询"],
  [/保障|承诺|售后/, "保障承诺"],
  [/作品|代表作|portfolio/i, "代表作品"],
  [/产品截图|界面演示|demo/i, "产品截图"],
  [/首屏|定位|价值主张/, "首屏定位"],
  [/报名表单|表单/, "报名表单"],
  [/对比|选型/, "权益对比"],
];

function isInvalidModuleLabel(label: string) {
  if (!label) return true;
  if (label.length < 2) return true;
  if (/^\d+$/.test(label)) return true;
  if (/^[\d\-~～.．]+$/.test(label)) return true;
  return false;
}

function inferLabelFromText(text: string): string | null {
  for (const [pattern, canonical] of KEYWORD_TO_LABEL) {
    if (pattern.test(text)) return canonical;
  }
  for (const canonical of CANONICAL_LABELS) {
    if (text.includes(canonical)) return canonical;
  }
  return null;
}

function stripEnumerationPrefix(text: string) {
  return text
    .replace(/^\d+\s*[-~～到至]\s*\d+\s*[条个项点段]?\s*/u, "")
    .replace(/^\d+[、.．)）]\s*/u, "")
    .trim();
}

function extractChinesePhrase(text: string) {
  const chunks = text.match(/[\u4e00-\u9fa5]{2,8}/gu) ?? [];
  for (const chunk of chunks) {
    const inferred = inferLabelFromText(chunk);
    if (inferred) return inferred;
    if (chunk.length >= 2 && chunk.length <= CONTENT_MODULE_LABEL_MAX) return chunk;
  }
  const longest = chunks.sort((a, b) => b.length - a.length)[0];
  if (longest && longest.length > CONTENT_MODULE_LABEL_MAX) {
    const inferred = inferLabelFromText(longest);
    if (inferred) return inferred;
  }
  return longest ?? null;
}

export function formatContentModuleLabel(label: string, fallback = "内容模块"): string {
  const trimmed = label.trim();
  if (!trimmed) return fallback;

  const alias = LABEL_ALIASES[trimmed] ?? LABEL_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  const compact = trimmed.replace(/\s+/g, "");
  if (compact.length <= CONTENT_MODULE_LABEL_MAX && /^[\u4e00-\u9fa5]{2,8}$/u.test(compact)) {
    return compact;
  }

  const inferred = inferLabelFromText(trimmed);
  if (inferred) return inferred;

  const cleaned = stripEnumerationPrefix(trimmed.replace(/[a-zA-Z]+/g, "").trim());
  const inferredFromCleaned = inferLabelFromText(cleaned);
  if (inferredFromCleaned) return inferredFromCleaned;

  // 只在强分隔符处切分，避免把「3-5条」切成「3」
  const firstClause = cleaned.split(/[、，。,.;；:：/|→]/u)[0]?.trim() ?? cleaned;
  const inferredFromClause = inferLabelFromText(firstClause);
  if (inferredFromClause) return inferredFromClause;

  const phrase = extractChinesePhrase(firstClause);
  if (phrase && !isInvalidModuleLabel(phrase)) return phrase;

  if (!isInvalidModuleLabel(firstClause) && firstClause.length <= CONTENT_MODULE_LABEL_MAX) {
    return firstClause;
  }

  return fallback;
}

export function normalizeContentModuleLabelFields<T extends { label: string }>(module: T): T {
  return { ...module, label: formatContentModuleLabel(module.label) };
}
