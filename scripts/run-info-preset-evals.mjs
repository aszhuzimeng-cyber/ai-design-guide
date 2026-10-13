import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const compiled = JSON.parse(
  fs.readFileSync(path.join(root, "design-reference/runtime/design-reference.compiled.json"), "utf8"),
);
const prompts = JSON.parse(fs.readFileSync(path.join(root, "design-reference/evals/prompts.json"), "utf8"));

const presets = compiled.collections["info-option-presets"] ?? [];

function archetypeOf(preset) {
  if (preset.basedOnArchetype) return preset.basedOnArchetype;
  const tag = preset.tags?.find((item) => item && !item.startsWith("info-option") && !item.startsWith("variant:"));
  return tag ?? preset.id;
}

function searchableText(parts) {
  return parts
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchCount(haystack, tokens) {
  return tokens.reduce((count, token) => (haystack.includes(token.toLowerCase()) ? count + 1 : count), 0);
}

function keywordBoost(id, fragments, amount) {
  return fragments.some((fragment) => id.includes(fragment)) ? amount : 0;
}

function scoreInfoPreset(preset, intentText) {
  const text = searchableText([
    preset.id,
    preset.label,
    preset.bestFor,
    preset.tags,
    preset.structure,
    preset.reason,
    preset.pageArchitecture,
    preset.layoutRhythm,
    preset.decisionPath,
  ]);
  const input = intentText.toLowerCase();
  let score = (preset.priority ?? 70) / 10;
  score += matchCount(text, input.split(/\s+|，|、|,|;|；/).filter((item) => item.length >= 2)) * 2;

  if (/第一次|了解|公司是谁|品牌是谁|可信|可靠|专业|合作|企业|官网/.test(input)) {
    score += keywordBoost(preset.id, ["trust-first", "clear-conversion"], 14);
  }
  if (/案例|成果|客户|背书|资质|证明|实力|有实力/.test(input)) {
    score += keywordBoost(preset.id, ["trust-first", "compare"], 18);
  }
  if (/技术|科技|产品|服务|能力|功能|demo|界面|系统|平台|工具|ai/i.test(input)) {
    score += keywordBoost(preset.id, ["product-demo", "tool-operate", "clear-conversion"], 16);
  }
  if (/购买|合作|咨询|转化|联系|报价|套餐|价格|下单/.test(input)) {
    score += keywordBoost(preset.id, ["clear-conversion", "compare", "price-package"], 14);
  }
  if (/作品|案例展示|摄影|设计|空间|美食|艺术|portfolio/i.test(input)) {
    score += keywordBoost(preset.id, ["work-first"], 18);
  }
  if (/内容|文章|报告|观点|媒体|专题/.test(input)) {
    score += keywordBoost(preset.id, ["editorial", "content-hub"], 18);
  }
  if (/活动|报名|课程|发布会|讲座/.test(input)) {
    score += keywordBoost(preset.id, ["event", "clear-conversion"], 18);
  }

  if (/企业官网|知道我们是谁|认识品牌|不是推|不是.*套餐|不是.*成交/.test(input)) {
    score += keywordBoost(preset.id, ["trust-first", "editorial"], 26);
    score += keywordBoost(preset.id, ["product-demo"], 6);
    score -= keywordPenalty(preset.id, ["clear-conversion", "price-package", "tool-operate"], 32);
  }
  if (/b2b|实施服务|交付案例|资质.*流程|流程.*资质/.test(input)) {
    score += keywordBoost(preset.id, ["trust-first", "compare"], 26);
    score -= keywordPenalty(preset.id, ["work-first", "content-hub", "event", "clear-conversion", "product-demo"], 24);
  }
  if (/saas|数据分析工具|看懂怎么用|页面上试|试一两步|直接操作/.test(input)) {
    score += keywordBoost(preset.id, ["product-demo", "tool-operate"], 28);
    score -= keywordPenalty(preset.id, ["clear-conversion", "work-first", "trust-first"], 22);
  }
  if (/三个档位|订阅官网|professional|enterprise|犹豫选|选 professional|选 enterprise/i.test(input)) {
    score += keywordBoost(preset.id, ["compare", "price-package"], 32);
    score -= keywordPenalty(preset.id, ["work-first", "editorial", "trust-first", "clear-conversion", "product-demo", "tool-operate"], 28);
  }
  if (/一个服务|一对一|明码标价|就差.*预约|只差.*预约/.test(input)) {
    score += keywordBoost(preset.id, ["clear-conversion", "price-package"], 28);
    score -= keywordPenalty(preset.id, ["compare", "content-hub", "product-demo", "tool-operate", "work-first"], 26);
  }
  if (/案例故事|项目故事|叙事|故事线/.test(input)) {
    score += keywordBoost(preset.id, ["story-gallery"], 20);
  }
  if (/案例先行|案例结果|先看案例|成果先行|交付案例/.test(input)) {
    score += keywordBoost(preset.id, ["cases-before-proof"], 22);
  }
  if (/痛点|问题.*方案|先懂问题|对齐问题/.test(input)) {
    score += keywordBoost(preset.id, ["problem-solution"], 22);
  }
  if (/顾虑|犹豫|评价先行|证明.*offer|先信/.test(input)) {
    score += keywordBoost(preset.id, ["proof-before-offer"], 20);
  }
  if (/章节|跳读|白皮书|分章/.test(input)) {
    score += keywordBoost(preset.id, ["chapter-thread"], 20);
  }
  if (/按任务|任务分栏|我要学|我要解决/.test(input)) {
    score += keywordBoost(preset.id, ["task-lanes"], 20);
  }
  if (/引导|示例走|walkthrough|跟着做|试一两步/.test(input)) {
    score += keywordBoost(preset.id, ["guided-walkthrough"], 20);
  }
  if (/场景矩阵|对号入座|使用场景.*选/.test(input)) {
    score += keywordBoost(preset.id, ["scenario-matrix"], 22);
  }
  if (/议程|时间安排|时间表|日程/.test(input)) {
    score += keywordBoost(preset.id, ["agenda-first"], 22);
  }
  if (/价值.*价格|先讲清价值|不比价格/.test(input)) {
    score += keywordBoost(preset.id, ["value-before-price"], 22);
  }

  return score;
}

function keywordPenalty(id, fragments, amount) {
  return fragments.some((fragment) => id.includes(fragment)) ? amount : 0;
}

function wireframeSignature(previewWireframe) {
  const hero = typeof previewWireframe?.hero === "string" ? previewWireframe.hero : "unknown";
  const body = typeof previewWireframe?.body === "string" ? previewWireframe.body : "unknown";
  return `${hero}::${body}`;
}

function selectInfoPresetsForIntent(intentText, limit = 3) {
  const scored = presets
    .map((preset) => ({
      preset,
      score: scoreInfoPreset(preset, intentText),
      signature: wireframeSignature(preset.previewWireframe),
      archetype: archetypeOf(preset),
    }))
    .sort((a, b) => b.score - a.score || (b.preset.priority ?? 0) - (a.preset.priority ?? 0));

  const selected = [];
  const deferSameArchetype = [];
  for (const item of scored) {
    if (selected.length >= limit) break;
    if (selected.some((picked) => picked.signature === item.signature)) continue;
    if (selected.some((picked) => picked.archetype === item.archetype)) {
      deferSameArchetype.push(item);
      continue;
    }
    selected.push(item);
  }
  if (selected.length < limit) {
    for (const item of deferSameArchetype) {
      if (selected.length >= limit) break;
      if (selected.some((picked) => picked.signature === item.signature)) continue;
      selected.push(item);
    }
  }
  if (selected.length < limit) {
    for (const item of scored) {
      if (selected.length >= limit) break;
      if (!selected.some((picked) => picked.preset.id === item.preset.id)) selected.push(item);
    }
  }
  return selected;
}

function evaluatePrompt(entry) {
  const { id, prompt, expected } = entry;
  const selected = selectInfoPresetsForIntent(prompt, 3);
  const archetypes = selected.map((item) => item.archetype);
  const signatures = selected.map((item) => item.signature);
  const issues = [];

  const top2Archetypes = archetypes.slice(0, 2);

  const minDistinct = expected.minDistinctInfoDirections ?? 0;
  const distinctArchetypes = new Set(archetypes);
  if (minDistinct > 0 && distinctArchetypes.size < minDistinct) {
    issues.push(`仅 ${distinctArchetypes.size} 种 archetype，要求至少 ${minDistinct} 种：${archetypes.join(", ")}`);
  }

  const distinctSignatures = new Set(signatures);
  if (minDistinct > 0 && distinctSignatures.size < minDistinct) {
    issues.push(`仅 ${distinctSignatures.size} 种 wireframe 签名，要求至少 ${minDistinct} 种`);
  }

  for (const direction of expected.mustIncludeInfoDirections ?? []) {
    if (!archetypes.includes(direction)) {
      issues.push(`缺少必须出现的 archetype：${direction}`);
    }
  }

  for (const direction of expected.disallowedInfoDirections ?? []) {
    if (top2Archetypes.includes(direction)) {
      issues.push(`前两名不应出现 archetype：${direction}`);
    }
  }

  const allowed = expected.allowedInfoDirections ?? [];
  for (const archetype of top2Archetypes) {
    if (allowed.length && !allowed.includes(archetype)) {
      issues.push(`前两名出现不在 allowed 内的 archetype：${archetype}（允许：${allowed.join(", ")}）`);
    }
  }

  return {
    id,
    prompt,
    archetypes,
    signatures,
    ok: issues.length === 0,
    issues,
  };
}

const confusionIds = new Set(
  prompts
    .filter((item) => item.expected?.minDistinctInfoDirections)
    .map((item) => item.id),
);

const targets = prompts.filter((item) => confusionIds.has(item.id));
const results = targets.map(evaluatePrompt);
const failed = results.filter((item) => !item.ok);

console.log(`信息组织 fallback 回归：${targets.length} 条易混淆用例，${failed.length} 条未通过\n`);

for (const result of results) {
  const status = result.ok ? "PASS" : "FAIL";
  console.log(`[${status}] ${result.id}`);
  console.log(`  archetypes: ${result.archetypes.join(" | ")}`);
  if (!result.ok) {
    for (const issue of result.issues) console.log(`  - ${issue}`);
  }
}

process.exit(failed.length > 0 ? 1 : 0);
