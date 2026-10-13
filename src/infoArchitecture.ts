import type { ContentModulePlacement, InfoPlan } from "./types";
import { formatContentModuleLabel } from "./contentModuleLabel";

function normalizeId(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "");
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function moduleLabelFromSection(section: Record<string, unknown>, fallback: string) {
  const raw = readText(section.content) || readText(section.title) || readText(section.role) || fallback;
  return formatContentModuleLabel(raw, formatContentModuleLabel(fallback));
}

function normalizeModule(module: ContentModulePlacement): ContentModulePlacement {
  return { ...module, label: formatContentModuleLabel(module.label) };
}

export function getPlanContentModules(plan: InfoPlan): ContentModulePlacement[] {
  if (plan.contentModules?.length) return plan.contentModules.map(normalizeModule);
  const sections = plan.sections?.map(readRecord).filter((item) => Object.keys(item).length > 0) ?? [];
  if (sections.length) {
    return sections.slice(0, 8).map((section, index) => normalizeModule({
      id: `${plan.id}-module-${index + 1}`,
      label: moduleLabelFromSection(section, plan.structure[index] ?? `内容模块 ${index + 1}`),
      placement: readText(section.role) || readText(section.layout) || `section-${index + 1}`,
      sectionId: readText(section.role) || `section-${index + 1}`,
      source: plan.source ?? "reference",
      reason: readText(section.why) || plan.reason,
    }));
  }
  return plan.structure.slice(0, 8).map((label, index) => normalizeModule({
    id: `${plan.id}-module-${index + 1}`,
    label,
    placement: `section-${index + 1}`,
    sectionId: `section-${index + 1}`,
    source: plan.source ?? "reference",
    reason: plan.reason,
  }));
}

export function inferPlacement(label: string) {
  const text = label.toLowerCase();
  if (/案例|作品|客户|评价|成功|资质|背书|proof|case|review/.test(text)) return "proof";
  if (/产品|服务|业务|能力|功能|方案|technology|技术|feature|service/.test(text)) return "showcase";
  if (/流程|步骤|怎么|如何|保障|交付|process|workflow/.test(text)) return "process";
  if (/价格|套餐|费用|报价|pricing|price/.test(text)) return "pricing";
  if (/联系|咨询|购买|合作|预约|报名|cta|contact/.test(text)) return "action";
  if (/公司|品牌|是谁|定位|介绍|about/.test(text)) return "identity";
  return "content";
}

function placementLayout(placement: string) {
  if (placement === "proof") return "证明区：案例/客户/数据可以用卡片网格、轮播或引用列表呈现";
  if (placement === "showcase") return "展示区：产品、服务或能力用网格/分栏/对比卡片呈现";
  if (placement === "process") return "流程区：用步骤、时间线或横向流程呈现";
  if (placement === "pricing") return "决策区：用套餐表、权益对比或价格卡片呈现";
  if (placement === "action") return "行动区：放在页面后段或底部，提供咨询/合作/购买入口";
  if (placement === "identity") return "定位区：靠近首屏，帮助用户先判断你是谁";
  return "内容区：根据上下文补齐呈现方式";
}

function insertionIndex(sections: Array<Record<string, unknown>>, placement: string) {
  if (placement === "identity") return Math.min(1, sections.length);
  if (placement === "showcase") return Math.min(2, sections.length);
  if (placement === "proof") return Math.min(Math.max(2, sections.length - 1), sections.length);
  if (placement === "process" || placement === "pricing") return Math.min(Math.max(3, sections.length - 1), sections.length);
  if (placement === "action") return sections.length;
  return Math.min(Math.max(2, sections.length), sections.length);
}

function sectionForModule(module: ContentModulePlacement) {
  return {
    role: module.sectionId,
    layout: placementLayout(module.placement ?? "content"),
    content: module.label,
    why: module.reason ?? "用户新增的功能模块，系统根据含义放入合适的信息架构位置。",
    source: module.source,
  };
}

export function addModuleToInfoPlan(plan: InfoPlan, label: string): InfoPlan {
  const trimmed = formatContentModuleLabel(label.trim());
  if (!trimmed) return plan;
  const modules = getPlanContentModules(plan);
  if (modules.some((module) => module.label === trimmed)) return { ...plan, contentModules: modules };
  const placement = inferPlacement(trimmed);
  const module: ContentModulePlacement = {
    id: `${plan.id}-user-module-${normalizeId(trimmed) || Date.now().toString(36)}`,
    label: trimmed,
    placement,
    sectionId: `${placement}-${normalizeId(trimmed) || modules.length + 1}`,
    source: "user-added",
    reason: "用户新增的功能模块，优先纳入最终页面。",
  };
  const sections = (plan.sections?.map(readRecord) ?? []).filter((item) => Object.keys(item).length > 0);
  const nextSections = sections.length
    ? [...sections]
    : plan.structure.map((content, index) => ({
        role: index === 0 ? "hero" : `section-${index + 1}`,
        layout: index === 0 ? "首屏结构" : "内容区块",
        content,
        why: "由当前信息架构推导的页面区块。",
      }));
  nextSections.splice(insertionIndex(nextSections, placement), 0, sectionForModule(module));
  const nextModules = [...modules, module];
  return {
    ...plan,
    contentModules: nextModules,
    sections: nextSections,
    structure: nextSections.map((section) => moduleLabelFromSection(section, "内容模块")),
    generationRules: [
      ...(plan.generationRules ?? []),
      `必须包含用户新增功能模块：${trimmed}，并放在${placementLayout(placement)}。`,
    ],
  };
}

function reorderSectionsByModules(sections: Array<Record<string, unknown>>, modules: ContentModulePlacement[]) {
  if (!sections.length) {
    return modules.map((module) => sectionForModule(module));
  }
  return modules.map((module) => {
    const existing = sections.find(
      (section) =>
        moduleLabelFromSection(section, "") === module.label || readText(section.role) === module.sectionId,
    );
    return existing ?? sectionForModule(module);
  });
}

export function setModuleOrderInInfoPlan(plan: InfoPlan, moduleId: string, targetIndex: number): InfoPlan {
  const modules = [...getPlanContentModules(plan)];
  const fromIndex = modules.findIndex((module) => module.id === moduleId);
  if (fromIndex < 0) return plan;

  const nextIndex = Math.max(0, Math.min(targetIndex, modules.length - 1));
  if (fromIndex === nextIndex) return plan;

  const nextModules = [...modules];
  const [moved] = nextModules.splice(fromIndex, 1);
  nextModules.splice(nextIndex, 0, moved);

  const sections = (plan.sections?.map(readRecord) ?? []).filter((item) => Object.keys(item).length > 0);
  const nextSections = reorderSectionsByModules(sections, nextModules);

  return {
    ...plan,
    contentModules: nextModules,
    sections: nextSections,
    structure: nextModules.map((module) => module.label),
  };
}

export function reorderModulesInInfoPlan(plan: InfoPlan, moduleId: string, direction: "up" | "down"): InfoPlan {
  const modules = [...getPlanContentModules(plan)];
  const index = modules.findIndex((module) => module.id === moduleId);
  if (index < 0) return plan;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= modules.length) return plan;
  return setModuleOrderInInfoPlan(plan, moduleId, targetIndex);
}

export function removeModuleFromInfoPlan(plan: InfoPlan, moduleId: string): InfoPlan {
  const modules = getPlanContentModules(plan);
  const target = modules.find((module) => module.id === moduleId);
  if (!target) return { ...plan, contentModules: modules };

  const nextModules = modules.filter((module) => module.id !== moduleId);
  const sections = (plan.sections?.map(readRecord) ?? []).filter((item) => Object.keys(item).length > 0);
  let nextSections = sections.filter((section) => {
    const content = moduleLabelFromSection(section, "");
    return content !== target.label && readText(section.role) !== target.sectionId;
  });

  if (nextModules.length && nextSections.length !== nextModules.length) {
    nextSections = nextModules.map((module) => {
      const existing = sections.find((section) => moduleLabelFromSection(section, "") === module.label);
      return existing ?? sectionForModule(module);
    });
  }

  return {
    ...plan,
    contentModules: nextModules,
    sections: nextSections,
    structure: nextModules.map((module) => module.label),
    generationRules: (plan.generationRules ?? []).filter((rule) => !rule.includes(target.label)),
  };
}
