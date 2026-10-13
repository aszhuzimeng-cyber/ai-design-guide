import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design-reference");
const UX_DATA = path.join(ROOT, "ui-ux-pro-max-skill-main", "src", "ui-ux-pro-max", "data");
const DESIGN_MD = path.join(ROOT, "design-md");

const LIB_VERSION = "1.0.0";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, "utf8");
}

function resetOutputDir() {
  if (!OUT.startsWith(ROOT) || path.basename(OUT) !== "design-reference") {
    throw new Error(`Refusing to reset unexpected output directory: ${OUT}`);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((item) => item.trim());
  return rows
    .slice(1)
    .filter((items) => items.some((item) => item.trim()))
    .map((items) =>
      Object.fromEntries(headers.map((header, index) => [header, (items[index] ?? "").trim()])),
    );
}

function readCsv(name) {
  return parseCsv(readText(path.join(UX_DATA, `${name}.csv`)));
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function firstSentences(text, max = 260) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]+\}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function splitList(value) {
  return String(value ?? "")
    .split(/\s*(?:\+|,|;|、|，|\|)\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractSection(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|\\z)`, "im"));
  return match?.[1]?.trim() ?? "";
}

function extractDonts(text) {
  const dontSection = text.match(/###\s+Don't\s*([\s\S]*?)(?=^##\s+|^###\s+|\z)/im)?.[1] ?? "";
  return dontSection
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .slice(0, 8);
}

const principles = [
  {
    id: "decision-before-decoration",
    type: "principle",
    title: "先帮用户做判断，再考虑风格",
    userLabel: "先判断，再设计",
    summary: "页面首先要帮助用户判断是否相关、是否可信、是否值得继续，而不是先追求视觉炫技。",
    appliesWhen: ["任何网页、落地页、插件页、生成页"],
    avoidWhen: ["用户明确要求做纯视觉实验或艺术海报"],
    rationale: "新手用户很容易被风格词带偏；先明确判断对象和页面任务，才能生成真正有用的结构与视觉。",
    risks: ["如果只追求好看，页面可能无法解释价值或推动行动。"],
    tags: ["core", "intent", "judgment"],
    sourceRefs: ["internal/product-principles"],
    sourceTypes: ["internal-principle"],
    confidence: "high",
    priority: 100,
  },
  {
    id: "visual-serves-need",
    type: "principle",
    title: "视觉服务需求，不服务炫技",
    userLabel: "视觉要有用",
    summary: "颜色、字体、动效和图片都必须支持页面任务、说服机制和内容资产。",
    appliesWhen: ["推荐视觉方案", "生成页面", "做 MasterGo 画布输出"],
    avoidWhen: ["品牌本身要求强实验视觉且已提供明确方向"],
    rationale: "视觉是信息判断的语言，不是装饰层。没有依据的视觉会让 AI 生成看似高级但不解决问题的页面。",
    risks: ["过度炫技会稀释信息层级，降低信任或转化。"],
    tags: ["core", "visual", "anti-decoration"],
    sourceRefs: ["internal/product-principles"],
    sourceTypes: ["internal-principle"],
    confidence: "high",
    priority: 100,
  },
  {
    id: "plain-language-for-beginners",
    type: "principle",
    title: "给新手看具体选择，不给术语面板",
    userLabel: "用人话解释",
    summary: "用户可以看到具体颜色、字体、布局和风险，但不应被信息架构、视觉语法、品牌系统等术语压住。",
    appliesWhen: ["展示三问选项", "展示信息方案", "展示视觉方案"],
    avoidWhen: ["面向专业设计团队的内部调试界面"],
    rationale: "目标用户能感知好不好看，但往往说不清为什么；产品应把复杂判断留在后台。",
    risks: ["术语过多会让用户感觉自己在被教育，降低选择信心。"],
    tags: ["core", "copy", "beginner"],
    sourceRefs: ["internal/product-principles"],
    sourceTypes: ["internal-principle"],
    confidence: "high",
    priority: 100,
  },
  {
    id: "short-clear-reasons",
    type: "principle",
    title: "理由短，但必须清楚",
    userLabel: "短理由，讲清楚",
    summary: "每个推荐都要说明依据、解决的问题和风险，但不要写成咨询腔长段落。",
    appliesWhen: ["所有推荐卡片", "AI 输出文案"],
    avoidWhen: ["用户要求深入分析报告"],
    rationale: "新手需要知道为什么，但不需要大量理论。短理由能帮助比较，不打断流程。",
    risks: ["理由过长会让选项难比较；理由过短会变成黑箱。"],
    tags: ["core", "explainability"],
    sourceRefs: ["internal/product-principles"],
    sourceTypes: ["internal-principle"],
    confidence: "high",
    priority: 98,
  },
  {
    id: "options-must-differ",
    type: "principle",
    title: "方案之间必须真的不同",
    userLabel: "选项要有差异",
    summary: "多个方案应代表不同页面策略或视觉策略，而不是同一结构换标题。",
    appliesWhen: ["生成 2-3 个方案"],
    avoidWhen: ["用户只要求一个确定方向"],
    rationale: "用户选择的价值来自策略差异；假差异会让用户以为自己做了选择，实际仍是模板。",
    risks: ["多个方案过于相似会削弱产品可信度。"],
    tags: ["core", "option-quality"],
    sourceRefs: ["internal/product-principles"],
    sourceTypes: ["internal-principle"],
    confidence: "high",
    priority: 96,
  },
  {
    id: "risk-is-part-of-recommendation",
    type: "principle",
    title: "风险是推荐的一部分",
    userLabel: "告诉我可能不适合哪里",
    summary: "每个推荐都要告诉用户什么情况下不适合，尤其是素材不足、目标用户不同或转化压力不同的时候。",
    appliesWhen: ["推荐信息方案", "推荐视觉方案"],
    avoidWhen: ["极低风险的微小样式调整"],
    rationale: "新手害怕选错，风险说明能帮助用户更有把握地决定或补充信息。",
    risks: ["没有风险说明会让推荐显得过度确定。"],
    tags: ["core", "risk"],
    sourceRefs: ["internal/product-principles"],
    sourceTypes: ["internal-principle"],
    confidence: "high",
    priority: 96,
  },
  {
    id: "user-constraints-first",
    type: "principle",
    title: "用户明确要求高于参考库",
    userLabel: "先听用户说的",
    summary: "用户明确说不要的东西必须优先排除，不能被行业默认或案例相似度覆盖。",
    appliesWhen: ["存在用户偏好、反向约束、禁用风格"],
    avoidWhen: [],
    rationale: "参考库是依据，不是命令。用户说“宠物但不要可爱”时，不能因为题材是宠物就推荐可爱风。",
    risks: ["忽略用户约束会让 AI 看起来像在套模板。"],
    tags: ["core", "constraints", "conflict"],
    sourceRefs: ["internal/product-principles"],
    sourceTypes: ["internal-principle"],
    confidence: "high",
    priority: 100,
  },
  {
    id: "no-brand-imitation",
    type: "principle",
    title: "抽象案例模式，不复制品牌",
    userLabel: "不做品牌仿制",
    summary: "design-md 中的品牌案例只能抽象成模式，不能变成“像 Apple/Stripe/Linear”的用户选项。",
    appliesWhen: ["使用 design-md 案例材料"],
    avoidWhen: ["用户提供自己的品牌系统并授权沿用"],
    rationale: "品牌案例的价值在于背后的信息组织和视觉逻辑，而不是外观复制。",
    risks: ["品牌模仿会带来审美依赖和潜在版权/品牌风险。"],
    tags: ["core", "case-abstraction"],
    sourceRefs: ["internal/product-principles", "design-md/*"],
    sourceTypes: ["internal-principle", "design-md"],
    confidence: "high",
    priority: 98,
  },
  {
    id: "ordinary-is-allowed-with-reason",
    type: "principle",
    title: "常规可以，但要有理由",
    userLabel: "常规也要说清楚",
    summary: "常规结构或视觉不是错，错的是不知道为什么常规、什么时候应该偏离常规。",
    appliesWhen: ["推荐经典落地页结构", "使用常见白底/蓝色/卡片"],
    avoidWhen: [],
    rationale: "很多页面确实需要清晰、常规、稳定，但必须和页面任务绑定，而不是默认套用。",
    risks: ["无理由的常规会变成模板感。"],
    tags: ["core", "anti-template"],
    sourceRefs: ["internal/product-principles"],
    sourceTypes: ["internal-principle"],
    confidence: "high",
    priority: 94,
  },
  {
    id: "assets-affect-strategy",
    type: "principle",
    title: "素材条件会改变策略",
    userLabel: "看你有没有素材",
    summary: "有无真实图片、产品截图、案例、评价和数据，会直接影响信息组织与视觉方案。",
    appliesWhen: ["选择作品先行", "产品展示", "信任证明", "视觉向往"],
    avoidWhen: [],
    rationale: "强推大图或案例而没有素材，会让生成页面空、假或廉价。",
    risks: ["忽略素材条件会导致最终效果与选择不一致。"],
    tags: ["core", "assets", "generation"],
    sourceRefs: ["internal/product-principles", "design-md/*"],
    sourceTypes: ["internal-principle", "design-md"],
    confidence: "high",
    priority: 94,
  },
  {
    id: "structure-is-information",
    type: "principle",
    title: "结构本身就是信息",
    userLabel: "顺序会表达重点",
    summary: "模块顺序、编号、分组、留白和标题都在表达内容关系，不是装饰。",
    appliesWhen: ["信息组织", "模块排序", "页面布局"],
    avoidWhen: [],
    rationale: "同样的内容顺序不同，说服逻辑完全不同。结构必须服务用户的认知路径。",
    risks: ["装饰性结构会造成阅读负担和假层级。"],
    tags: ["core", "information"],
    sourceRefs: ["external/frontend-design-skill", "internal/product-principles"],
    sourceTypes: ["manual-curation", "internal-principle"],
    confidence: "high",
    priority: 92,
  },
  {
    id: "visual-choice-must-compile",
    type: "principle",
    title: "视觉选项必须能编译成规则",
    userLabel: "选了就要生成得像",
    summary: "每个视觉方案都必须有 previewRules 和 generationRules，保证前端能预览，生成能保持一致。",
    appliesWhen: ["视觉方案库", "生成 HTML", "MasterGo 输出"],
    avoidWhen: [],
    rationale: "只用自然语言描述视觉方向，无法保证预览和最终生成一致。",
    risks: ["用户选择 A，预览像 A，生成出来却像 B。"],
    tags: ["core", "preview", "generation"],
    sourceRefs: ["internal/product-principles"],
    sourceTypes: ["internal-principle"],
    confidence: "high",
    priority: 98,
  },
];

const intentJudgment = [
  {
    id: "decision-user-buyer",
    type: "intent-judgment",
    dimension: "decisionObject",
    title: "购买或预约的人",
    userLabel: "准备购买、预约或咨询的人",
    summary: "用户已经有行动可能，页面需要降低犹豫并给清楚路径。",
    appliesWhen: ["提到预约", "提到购买", "提到咨询", "需要转化"],
    avoidWhen: ["用户只是想做内容展示或长期品牌认知"],
    rationale: "这类人最需要确认值不值得行动，以及行动是否简单可靠。",
    risks: ["过度转化会削弱品牌气质或审美判断。"],
    designConsequences: ["CTA 提前", "流程、价格、保障和 FAQ 更重要", "视觉不能过度干扰行动"],
    tags: ["intent", "conversion", "buyer"],
    sourceRefs: ["internal/product-principles"],
    sourceTypes: ["internal-principle"],
    confidence: "high",
    priority: 90,
  },
  {
    id: "decision-user-comparer",
    type: "intent-judgment",
    dimension: "decisionObject",
    title: "正在比较的人",
    userLabel: "正在比较不同选择的人",
    summary: "用户需要快速看出差异、优势、风险和是否适合自己。",
    appliesWhen: ["提到比较", "提到选择", "竞争明显", "服务/产品同质化"],
    avoidWhen: ["用户目标非常明确，只差行动"],
    rationale: "比较型用户会跳读，页面需要明确差异点和证明材料。",
    risks: ["如果只讲自己，不回应比较，会显得空。"],
    designConsequences: ["对比模块、案例、评价、FAQ 前置", "标题要明确差异", "视觉要帮助扫读"],
    tags: ["intent", "comparison"],
    sourceRefs: ["internal/product-principles"],
    sourceTypes: ["internal-principle"],
    confidence: "high",
    priority: 88,
  },
  {
    id: "decision-user-trust-sensitive",
    type: "intent-judgment",
    dimension: "decisionObject",
    title: "需要先确认可信的人",
    userLabel: "需要先确认靠不靠谱的人",
    summary: "用户担心风险、成本、安全、专业度或交付质量。",
    appliesWhen: ["高客单价", "医疗/金融/教育/法律/咨询", "B2B", "数据安全", "长期合作"],
    avoidWhen: ["低风险娱乐或轻量活动"],
    rationale: "高风险决策需要先降低不确定性，再谈价值和行动。",
    risks: ["证明过多但价值不清，会变得沉重。"],
    designConsequences: ["资质、流程、案例、保障前置", "视觉克制稳定", "减少夸张促销"],
    tags: ["intent", "trust", "risk"],
    sourceRefs: ["internal/product-principles", "ux-pro/ui-reasoning"],
    sourceTypes: ["internal-principle", "ux-pro"],
    confidence: "high",
    priority: 92,
  },
  {
    id: "decision-user-aesthetic-first",
    type: "intent-judgment",
    dimension: "decisionObject",
    title: "先看审美是否匹配的人",
    userLabel: "先看风格合不合的人",
    summary: "用户会通过作品、图片、场景或产品外观先做直觉判断。",
    appliesWhen: ["摄影", "作品集", "空间", "美食", "时尚", "艺术", "设计服务"],
    avoidWhen: ["图片素材不足或用户更关心流程/价格"],
    rationale: "审美型决策必须让用户先看到真实风格，否则再多文案也难说服。",
    risks: ["素材弱时，作品先行会暴露短板。"],
    designConsequences: ["大图、精选作品、案例场景前置", "文案克制", "装饰退后"],
    tags: ["intent", "aesthetic", "assets"],
    sourceRefs: ["design-md/apple", "design-md/nike", "design-md/airbnb"],
    sourceTypes: ["design-md"],
    confidence: "high",
    priority: 90,
  },
  {
    id: "page-task-understand-product",
    type: "intent-judgment",
    dimension: "pageTask",
    title: "先看懂产品怎么工作",
    userLabel: "先弄明白产品怎么用",
    summary: "页面要通过界面、功能路径、demo 或使用场景解释产品价值。",
    appliesWhen: ["SaaS", "工具", "AI 产品", "插件", "平台", "生成器"],
    avoidWhen: ["没有产品界面或功能还不成熟"],
    rationale: "复杂产品不靠口号说服，需要让用户看见工作方式。",
    risks: ["截图质量差或功能过多时，会让页面显得复杂。"],
    designConsequences: ["产品截图/demonstration 前置", "功能按场景分组", "减少抽象插画"],
    tags: ["page-task", "product", "demo"],
    sourceRefs: ["design-md/linear.app", "design-md/vercel", "design-md/stripe"],
    sourceTypes: ["design-md"],
    confidence: "high",
    priority: 90,
  },
  {
    id: "page-task-book-or-contact",
    type: "intent-judgment",
    dimension: "pageTask",
    title: "快速预约或联系",
    userLabel: "让用户尽快预约或联系",
    summary: "页面要减少决策步骤，突出行动入口、流程和基本信任材料。",
    appliesWhen: ["预约", "咨询", "报名", "线索收集", "本地服务"],
    avoidWhen: ["需要长时间教育市场或高复杂产品"],
    rationale: "当目标是行动，页面要让用户知道下一步是什么、成本如何、是否可靠。",
    risks: ["过度催促会显得销售感强。"],
    designConsequences: ["CTA 重复出现", "流程/价格/FAQ 简明", "视觉高可读"],
    tags: ["page-task", "conversion", "booking"],
    sourceRefs: ["ux-pro/landing", "internal/product-principles"],
    sourceTypes: ["ux-pro", "internal-principle"],
    confidence: "high",
    priority: 86,
  },
  {
    id: "page-task-build-brand-impression",
    type: "intent-judgment",
    dimension: "pageTask",
    title: "建立气质和记忆点",
    userLabel: "先让用户记住你是什么感觉",
    summary: "页面要先建立鲜明但有依据的第一印象，再进入内容或转化。",
    appliesWhen: ["品牌官网", "个人品牌", "新消费", "艺术文化", "活动"],
    avoidWhen: ["高风险采购或工具效率场景"],
    rationale: "当用户还不知道为什么要关心你，清晰的气质和记忆点能打开认知入口。",
    risks: ["只有气质没有内容，会变成空壳品牌页。"],
    designConsequences: ["首屏 thesis 清楚", "视觉记忆点集中一处", "文案更短更准"],
    tags: ["page-task", "brand", "memory"],
    sourceRefs: ["design-md/nike", "design-md/wired", "external/frontend-design-skill"],
    sourceTypes: ["design-md", "manual-curation"],
    confidence: "medium",
    priority: 82,
  },
  {
    id: "page-task-read-or-explore",
    type: "intent-judgment",
    dimension: "pageTask",
    title: "阅读、探索或持续浏览",
    userLabel: "让用户愿意继续看内容",
    summary: "页面要靠分类、节奏、推荐和阅读体验组织长期内容。",
    appliesWhen: ["博客", "媒体", "知识库", "案例库", "资源站", "课程"],
    avoidWhen: ["单一 offer 的短转化页"],
    rationale: "内容型页面的关键不是立即 CTA，而是帮助用户找到下一条有价值内容。",
    risks: ["分类不按用户任务组织，会难找。"],
    designConsequences: ["入口、分类、卡片、专题和搜索重要", "视觉服务阅读", "CTA 次要"],
    tags: ["page-task", "content"],
    sourceRefs: ["design-md/wired", "design-md/theverge", "ux-pro/landing"],
    sourceTypes: ["design-md", "ux-pro"],
    confidence: "high",
    priority: 84,
  },
  {
    id: "page-task-choose-package",
    type: "intent-judgment",
    dimension: "pageTask",
    title: "比较套餐并做选择",
    userLabel: "帮用户看懂该选哪个",
    summary: "用户需要理解不同套餐、服务层级或方案差异，并知道哪个最适合自己。",
    appliesWhen: ["套餐", "价格", "会员", "订阅", "服务层级", "方案对比"],
    avoidWhen: ["只有一个明确 offer", "价格不能公开"],
    rationale: "当选择成本来自方案差异时，页面要解释每档适合谁，而不是只列价格。",
    risks: ["如果对比维度太多，会让用户更难选择。"],
    designConsequences: ["套餐卡片、权益对比、适合人群、FAQ 和保障更重要", "视觉要帮助横向比较"],
    tags: ["page-task", "pricing", "comparison"],
    sourceRefs: ["ux-pro/landing", "internal/product-principles"],
    sourceTypes: ["ux-pro", "internal-principle"],
    confidence: "high",
    priority: 83,
  },
  {
    id: "persuasion-work-proof",
    type: "intent-judgment",
    dimension: "persuasionMechanism",
    title: "靠真实作品说服",
    userLabel: "让作品自己说话",
    summary: "用户通过真实图片、案例或作品判断审美、能力和适配度。",
    appliesWhen: ["视觉资产强", "审美判断优先", "作品/产品本身有说服力"],
    avoidWhen: ["素材不足", "用户更关心安全或价格"],
    rationale: "如果作品是第一证据，页面要减少干扰，让作品成为判断中心。",
    risks: ["素材质量不稳定会拉低整体感。"],
    designConsequences: ["作品前置", "文案克制", "白底/暗场/展览式变体可选"],
    tags: ["persuasion", "work-proof", "assets"],
    sourceRefs: ["design-md/apple", "design-md/nike"],
    sourceTypes: ["design-md"],
    confidence: "high",
    priority: 90,
  },
  {
    id: "persuasion-trust-proof",
    type: "intent-judgment",
    dimension: "persuasionMechanism",
    title: "靠可信证明说服",
    userLabel: "先证明可靠",
    summary: "用户需要看到资质、流程、评价、案例、保障或合规信息才能继续。",
    appliesWhen: ["高风险", "高客单价", "长期合作", "安全/健康/钱/数据"],
    avoidWhen: ["低风险娱乐或强视觉消费"],
    rationale: "信任证明是降低行动成本的关键，不应藏在页面底部。",
    risks: ["证明堆太多会沉重，需要先讲清价值。"],
    designConsequences: ["证明前置", "视觉克制", "行动入口稳定"],
    tags: ["persuasion", "trust"],
    sourceRefs: ["ux-pro/ui-reasoning", "design-md/coinbase", "design-md/cohere"],
    sourceTypes: ["ux-pro", "design-md"],
    confidence: "high",
    priority: 92,
  },
  {
    id: "persuasion-experience-sample",
    type: "intent-judgment",
    dimension: "persuasionMechanism",
    title: "靠低门槛体验说服",
    userLabel: "先试一下，再决定",
    summary: "通过 demo、试用、样例、生成预览或互动降低用户犹豫。",
    appliesWhen: ["工具", "AI 产品", "插件", "自助服务", "软件"],
    avoidWhen: ["体验成本高或需要人工交付"],
    rationale: "体验型说服能让用户直接感受到价值，比抽象说明更有力。",
    risks: ["体验区不稳定会反向降低信任。"],
    designConsequences: ["Demo/输入框/预览区前置", "降低注册门槛", "反馈状态清楚"],
    tags: ["persuasion", "trial", "product"],
    sourceRefs: ["design-md/vercel", "design-md/raycast", "ux-pro/landing"],
    sourceTypes: ["design-md", "ux-pro"],
    confidence: "high",
    priority: 88,
  },
];

const persuasionMechanisms = [
  ["work-proof", "作品说服", "用真实作品、案例、产品图或空间图让用户先判断审美和能力。", ["视觉资产强", "审美优先", "作品本身最能说明问题"], ["素材弱", "用户更关心合规/价格"]],
  ["product-proof", "产品说服", "用界面、demo、功能路径或交互预览解释产品怎么工作。", ["SaaS", "工具", "AI 产品", "插件", "平台"], ["没有产品截图", "功能还不稳定"]],
  ["result-proof", "结果说服", "用数据、前后对比、案例结果和客户收益建立信心。", ["效果可量化", "用户关心投入产出"], ["没有真实数据", "结果不可验证"]],
  ["trust-proof", "信任说服", "用资质、流程、评价、合规、客户 Logo 和保障降低风险。", ["高风险", "高客单价", "长期合作"], ["低风险娱乐", "用户只想快速体验"]],
  ["experience-proof", "体验说服", "通过试用、样例、互动、生成预览降低行动门槛。", ["工具", "软件", "AI 服务", "自助产品"], ["需要人工交付", "体验不稳定"]],
  ["emotion-proof", "情绪说服", "通过生活方式、身份感、氛围和向往感促进行动。", ["生活方式", "旅游", "美食", "艺术", "高端服务"], ["高信任采购", "严肃合规场景"]],
  ["efficiency-proof", "效率说服", "强调更快、更省事、更自动化、更少摩擦。", ["效率工具", "B2B", "生产力", "后台"], ["用户先关心审美或情绪价值"]],
  ["expertise-proof", "专业说服", "用方法论、团队背景、技术细节、流程和文档建立可靠性。", ["咨询", "技术服务", "教育", "复杂服务"], ["用户只需要快速购买"]],
].map(([id, title, summary, appliesWhen, avoidWhen], index) => ({
  id,
  type: "persuasion-mechanism",
  title,
  userLabel: title,
  summary,
  appliesWhen,
  avoidWhen,
  rationale: summary,
  risks: ["如果证明材料不足，需要降低该机制权重或换用其他说服方式。"],
  tags: ["persuasion", id],
  sourceRefs: ["internal/product-principles", "design-md/*", "ux-pro/ui-reasoning"],
  sourceTypes: ["internal-principle", "design-md", "ux-pro"],
  confidence: "high",
  priority: 90 - index,
}));

const infoArchetypes = [
  {
    id: "clear-conversion",
    title: "清晰转化型",
    userLabel: "先讲清楚，然后让用户行动",
    summary: "适合目标明确、需要预约、购买、报名或咨询的页面。",
    appliesWhen: ["用户目标明确", "转化压力高", "offer 清楚", "低到中等决策风险"],
    avoidWhen: ["审美先行", "复杂产品教育", "高信任采购"],
    rationale: "用户需要快速知道你提供什么、为什么值得、下一步怎么做。",
    risks: ["如果产品需要气质或审美铺垫，过度转化会显得廉价。"],
    structure: ["明确 offer", "核心收益", "关键服务/功能", "可信证明", "流程或价格", "FAQ", "最终行动"],
    requiredAssets: ["清楚 offer", "行动入口", "基础证明", "流程或价格信息"],
    proofMaterials: ["评价", "案例", "保障", "FAQ"],
    antiPatterns: ["大段品牌故事压过行动", "多个主 CTA 同时争抢"],
    tags: ["info", "conversion", "landing"],
  },
  {
    id: "trust-first",
    title: "信任优先型",
    userLabel: "先证明可靠，再讲服务",
    summary: "适合高风险、高客单价、长期合作或专业服务。",
    appliesWhen: ["用户担心风险", "需要资质", "涉及钱/健康/数据/安全", "B2B 或咨询"],
    avoidWhen: ["低风险冲动消费", "用户只想先看作品"],
    rationale: "先降低不确定性，用户才愿意继续理解服务或行动。",
    risks: ["如果证明很多但价值不清，会显得沉重和官样。"],
    structure: ["稳定定位", "关键可信证明", "服务/产品解释", "案例或客户", "流程/保障", "咨询入口"],
    requiredAssets: ["资质", "客户/案例", "流程", "保障或合规说明"],
    proofMaterials: ["证书", "客户 Logo", "安全认证", "评价", "流程图"],
    antiPatterns: ["一上来大促销", "隐藏资质", "过度装饰科技感"],
    tags: ["info", "trust", "risk"],
  },
  {
    id: "work-first",
    title: "作品先行型",
    userLabel: "先看作品，再了解服务",
    summary: "适合摄影、设计、空间、美食、艺术、作品集等审美判断优先的页面。",
    appliesWhen: ["视觉素材强", "用户先判断风格", "作品本身最有说服力"],
    avoidWhen: ["图片质量一般", "用户更关心安全/价格/流程"],
    rationale: "用户会先看风格是否匹配，再关心流程、价格和预约。",
    risks: ["素材不足时首屏会弱，页面容易显得空。"],
    structure: ["代表作品", "风格分类", "精选案例", "服务流程", "价格/套餐", "评价", "预约咨询"],
    requiredAssets: ["高质量图片", "作品分类", "服务流程", "评价"],
    proofMaterials: ["真实作品", "客户故事", "前后对比", "评价"],
    antiPatterns: ["用图库假图冒充作品", "大段文案压过图片"],
    tags: ["info", "portfolio", "asset-first"],
  },
  {
    id: "product-showcase",
    title: "产品展示型",
    userLabel: "先看产品怎么工作",
    summary: "适合 SaaS、工具、App、插件、平台和复杂产品。",
    appliesWhen: ["需要解释功能", "有产品截图", "使用路径能体现价值"],
    avoidWhen: ["没有界面素材", "服务型交付大于产品本身"],
    rationale: "复杂产品需要让用户看见界面、场景和工作流，而不是只听口号。",
    risks: ["功能太多或截图质量差，会让页面复杂难读。"],
    structure: ["产品界面/核心 demo", "主要场景", "功能分组", "工作流", "集成/生态", "案例", "试用/联系"],
    requiredAssets: ["产品截图", "功能列表", "使用场景", "demo 或 mockup"],
    proofMaterials: ["界面截图", "视频", "集成 Logo", "客户案例"],
    antiPatterns: ["抽象插画替代产品", "功能堆叠没有场景"],
    tags: ["info", "product", "saas"],
  },
  {
    id: "editorial-story",
    title: "叙事编辑型",
    userLabel: "先讲观点，再带用户看下去",
    summary: "适合品牌故事、文化项目、内容产品、报告、媒体和活动。",
    appliesWhen: ["需要表达观点", "内容有故事线", "用户需要被带入"],
    avoidWhen: ["用户只想快速购买或预约"],
    rationale: "叙事型页面通过观点、节奏和例子建立理解，而不是靠模块堆叠。",
    risks: ["节奏太慢会拖累转化。"],
    structure: ["主题/观点", "背景与冲突", "分段故事", "案例/人物/图像", "深入阅读或参与入口"],
    requiredAssets: ["清楚观点", "故事素材", "人物/案例/图片"],
    proofMaterials: ["故事证据", "采访", "数据片段", "媒体引用"],
    antiPatterns: ["每屏都像营销卡片", "编号装饰不表达真实顺序"],
    tags: ["info", "editorial", "story"],
  },
  {
    id: "content-hub",
    title: "内容入口型",
    userLabel: "帮用户找到想看的内容",
    summary: "适合知识库、课程、案例库、资源集合、社区和媒体。",
    appliesWhen: ["内容持续更新", "需要分类/搜索", "用户目标多样"],
    avoidWhen: ["单一转化页", "内容量不足"],
    rationale: "内容型页面的关键是发现路径，而不是单次说服。",
    risks: ["分类按内部视角设计会让用户找不到内容。"],
    structure: ["总入口", "推荐/最新", "分类或搜索", "内容卡片列表", "专题集合", "订阅或行动"],
    requiredAssets: ["内容列表", "分类体系", "标签", "封面/摘要"],
    proofMaterials: ["热门内容", "编辑精选", "阅读量", "作者信息"],
    antiPatterns: ["分类过多", "卡片信息不一致", "没有搜索或筛选"],
    tags: ["info", "content", "hub"],
  },
  {
    id: "tool-operation",
    title: "工具操作型",
    userLabel: "让用户直接操作并看到结果",
    summary: "适合后台、生成器、配置器、插件、分析工具和工作台。",
    appliesWhen: ["用户要完成操作", "输入和结果是核心", "状态反馈重要"],
    avoidWhen: ["纯品牌展示或营销页"],
    rationale: "工具型界面要优先保证操作效率、反馈清晰和状态稳定。",
    risks: ["营销式视觉会干扰效率和可读性。"],
    structure: ["当前状态/输入", "主要操作区", "结果预览", "辅助设置", "历史/保存/导出"],
    requiredAssets: ["输入模型", "结果预览", "状态反馈", "保存/导出逻辑"],
    proofMaterials: ["示例结果", "历史记录", "成功/失败状态"],
    antiPatterns: ["大 hero 占据首屏", "核心操作隐藏在装饰布局里"],
    tags: ["info", "tool", "operation"],
  },
  {
    id: "comparison-decision",
    title: "对比决策型",
    userLabel: "帮用户比较后做选择",
    summary: "适合方案、套餐、产品、服务或竞品差异需要解释的页面。",
    appliesWhen: ["用户在比较", "存在多个方案", "差异需要解释"],
    avoidWhen: ["单一明确 offer", "用户不需要比较"],
    rationale: "比较型用户需要看到差异、适合谁、风险和推荐选项。",
    risks: ["比较过度会让简单选择变复杂。"],
    structure: ["选择问题", "方案概览", "对比表", "适合人群", "推荐路径", "FAQ/行动"],
    requiredAssets: ["方案列表", "差异点", "价格/权益", "适合人群"],
    proofMaterials: ["对比表", "案例", "推荐标签", "FAQ"],
    antiPatterns: ["只高亮最贵方案", "对比维度过多"],
    tags: ["info", "comparison", "pricing"],
  },
  {
    id: "community-event",
    title: "社群活动型",
    userLabel: "让用户理解活动并愿意参与",
    summary: "适合活动、社群、课程发布、招募和线下体验。",
    appliesWhen: ["有时间地点", "参与感重要", "需要报名"],
    avoidWhen: ["长期产品官网", "高复杂服务"],
    rationale: "活动型页面要快速交代主题、亮点、流程、参与方式和信任证明。",
    risks: ["只做氛围不讲清楚信息，会影响报名。"],
    structure: ["活动主题", "亮点/收益", "时间地点/对象", "流程安排", "嘉宾/案例", "报名入口", "FAQ"],
    requiredAssets: ["活动信息", "嘉宾/议程", "报名方式", "过往照片或评价"],
    proofMaterials: ["嘉宾", "过往活动", "参与人数", "评价"],
    antiPatterns: ["信息藏太深", "报名入口不清楚"],
    tags: ["info", "event", "community"],
  },
  {
    id: "pricing-packages",
    title: "价格套餐型",
    userLabel: "帮用户看懂价格和选择",
    summary: "适合服务套餐、订阅、课程、会员和产品定价页。",
    appliesWhen: ["价格/套餐是核心决策点", "存在多个层级"],
    avoidWhen: ["价格无法公开", "高定制咨询"],
    rationale: "价格型页面要解释每档适合谁、包含什么、风险如何降低。",
    risks: ["只展示价格不解释价值，会让用户只比较便宜。"],
    structure: ["定价说明", "套餐卡片", "适合人群", "权益对比", "保障/FAQ", "行动入口"],
    requiredAssets: ["价格", "权益", "适合人群", "保障条款"],
    proofMaterials: ["退款保障", "客户评价", "案例", "FAQ"],
    antiPatterns: ["最贵方案过度高亮", "隐藏关键限制"],
    tags: ["info", "pricing", "packages"],
  },
].map((item, index) => ({
  type: "info-archetype",
  plainTitle: item.userLabel,
  decisionLogic: item.rationale,
  industryVariants: [
    {
      industryHint: "医疗/法律/金融/教育",
      moduleSubstitutions: ["资质", "流程", "风险说明", "保障", "咨询入口"],
      proofMaterials: ["证书", "专业背景", "合规说明", "真实评价"],
    },
    {
      industryHint: "摄影/设计/美食/空间/艺术",
      moduleSubstitutions: ["代表作品", "风格分类", "案例故事", "预约入口"],
      proofMaterials: ["真实图片", "作品集", "客户评价", "拍摄/交付过程"],
    },
    {
      industryHint: "SaaS/工具/AI/插件",
      moduleSubstitutions: ["产品界面", "功能路径", "集成", "试用入口"],
      proofMaterials: ["截图", "demo", "客户 Logo", "安全/性能说明"],
    },
  ],
  sourceRefs: ["internal/product-principles", "ux-pro/landing.csv", "design-md/*"],
  sourceTypes: ["internal-principle", "ux-pro", "design-md"],
  confidence: "high",
  priority: 90 - index,
  ...item,
}));

const contentModules = [
  "首屏定位", "核心方案", "主行动", "代表作品", "作品分类", "产品截图", "互动演示", "功能分组",
  "使用场景", "服务流程", "价格套餐", "权益对比", "客户评价", "客户标识", "案例研究", "前后对比",
  "资质证书", "安全合规", "保障承诺", "常见问题", "内容分类", "搜索筛选", "专题集合", "订阅入口",
  "活动议程", "嘉宾介绍", "报名表单", "联系方式", "结果预览", "历史记录", "保存导出", "空状态",
].map((title, index) => ({
  id: `module-${slug(title) || index + 1}`,
  type: "content-module",
  title,
  userLabel: title,
  summary: `${title}模块用于支撑页面的信息组织和说服路径。`,
  appliesWhen: ["根据页面任务和说服机制选择"],
  avoidWhen: ["与当前页面任务无关或缺少真实内容"],
  rationale: "内容模块要服务用户的下一步判断，而不是为了填满页面。",
  risks: ["模块没有真实内容时会显得模板化。"],
  tags: ["content-module", title],
  sourceRefs: ["internal/manual-curation", "ux-pro/landing.csv"],
  sourceTypes: ["manual-curation", "ux-pro"],
  confidence: "medium",
  priority: 70,
}));

const infoArchitectureDetails = {
  "info-work-first-service": {
    pageArchitecture: "作品主导的 gallery-first 低保真：首屏让代表作品占最大面积，文字只负责定位；作品网格先展开，服务流程和预约入口后置。",
    aboveFold: {
      layout: "full-width-media-or-large-media-left",
      primaryZone: "1-3 个代表作品或一个强作品大图",
      secondaryZone: "一句话定位、风格标签、服务范围",
      proofZone: "不前置，只露出轻量客户/项目数量信号",
      actionZone: "轻量预约/查看作品按钮，不抢作品焦点",
      visualWeight: { media: 70, text: 20, action: 10 },
    },
    sections: [
      { role: "first-judgment", layout: "large-showcase", content: "代表作品", why: "先让用户判断审美和能力是否匹配。" },
      { role: "browse-and-compare", layout: "filterable-gallery-grid", content: "风格分类与精选案例", why: "让用户快速找到和自己需求相近的作品。" },
      { role: "understand-service", layout: "step-list-after-gallery", content: "服务流程与交付方式", why: "在用户认可作品后再解释合作方式。" },
      { role: "reduce-risk", layout: "testimonial-strip", content: "客户评价、项目结果、常见问题", why: "补足信任，但不压过作品。" },
      { role: "next-action", layout: "soft-cta-band", content: "预约咨询或查看套餐", why: "给明确下一步，但语气保持克制。" },
    ],
    layoutRhythm: "大图判断 -> 网格浏览 -> 服务解释 -> 证明 -> 轻行动",
    decisionPath: ["看风格是否喜欢", "找到相近案例", "理解怎么合作", "确认风险可控", "预约或询价"],
    previewWireframe: {
      hero: "media-dominant",
      body: "gallery-then-explanation",
      proofPlacement: "after-gallery",
      ctaPlacement: "soft-after-proof",
      density: "spacious",
    },
  },
  "info-trust-first-service": {
    pageArchitecture: "信任前置的 proof-first 低保真：首屏先回答靠不靠谱，再讲服务内容；证明、流程和保障比氛围更重要。",
    aboveFold: {
      layout: "claim-left-proof-right",
      primaryZone: "明确定位和关键可信承诺",
      secondaryZone: "资质、数据、客户评价或案例摘要",
      proofZone: "首屏可见，靠近主标题",
      actionZone: "咨询入口 + 查看流程的次按钮",
      visualWeight: { claim: 35, proof: 45, action: 20 },
    },
    sections: [
      { role: "risk-reduction", layout: "proof-cards-above-fold", content: "资质、背书、客户结果", why: "先降低用户的不确定感。" },
      { role: "service-clarity", layout: "two-column-service-list", content: "服务范围与适合对象", why: "让用户确认是不是为自己解决问题。" },
      { role: "process-confidence", layout: "numbered-process", content: "流程、周期、保障", why: "把专业服务变成可预期过程。" },
      { role: "case-validation", layout: "case-summary-cards", content: "案例/评价/前后对比", why: "用真实证据加强信任。" },
      { role: "objection-handling", layout: "faq-accordion", content: "FAQ 和咨询入口", why: "处理最后的顾虑。" },
    ],
    layoutRhythm: "可信定位 -> 证明前置 -> 服务解释 -> 流程保障 -> 案例 FAQ -> 咨询",
    decisionPath: ["先判断是否可靠", "确认服务是否相关", "理解流程和保障", "查看真实证据", "咨询"],
    previewWireframe: {
      hero: "proof-first",
      body: "proof-service-process",
      proofPlacement: "above-fold",
      ctaPlacement: "after-risk-reduction",
      density: "balanced",
    },
  },
  "info-product-demo-first": {
    pageArchitecture: "产品界面先行的 demo-first 低保真：首屏直接展示产品界面、demo 或结果预览，后面按使用场景解释功能。",
    aboveFold: {
      layout: "screen-center-with-caption",
      primaryZone: "产品界面、demo、生成结果或工作流预览",
      secondaryZone: "一句话说明它帮用户完成什么",
      proofZone: "集成数量、用户数量或结果样例轻量露出",
      actionZone: "试用/查看 demo",
      visualWeight: { product: 60, explanation: 25, action: 15 },
    },
    sections: [
      { role: "product-recognition", layout: "hero-screen", content: "产品界面或结果预览", why: "让用户先看见产品到底是什么。" },
      { role: "scenario-mapping", layout: "use-case-tabs", content: "核心使用场景", why: "按任务解释功能，而不是堆功能名。" },
      { role: "workflow-understanding", layout: "step-flow-with-screens", content: "工作流和关键状态", why: "让用户理解怎么用。" },
      { role: "capability-depth", layout: "feature-groups", content: "功能分组、集成、生态", why: "在理解主流程后补充能力范围。" },
      { role: "trial-decision", layout: "demo-cta-band", content: "案例证明和试用入口", why: "把理解转成试用。" },
    ],
    layoutRhythm: "界面看见 -> 场景理解 -> 流程走通 -> 功能补充 -> 试用",
    decisionPath: ["看懂产品形态", "确认使用场景", "理解流程", "判断能力够不够", "试用"],
    previewWireframe: {
      hero: "product-screen-dominant",
      body: "scenario-tabs-then-workflow",
      proofPlacement: "after-demo",
      ctaPlacement: "near-demo-and-end",
      density: "balanced",
    },
  },
  "info-clear-conversion-offer": {
    pageArchitecture: "清晰 offer 的 conversion-first 低保真：首屏先说清楚给谁、解决什么、下一步做什么，证明和 FAQ 为行动服务。",
    aboveFold: {
      layout: "headline-benefits-action",
      primaryZone: "一句话 offer 与核心收益",
      secondaryZone: "适合人群、服务范围或结果承诺",
      proofZone: "1-2 个短证明靠近 CTA",
      actionZone: "明确主 CTA + 低压力次操作",
      visualWeight: { offer: 45, benefits: 30, action: 25 },
    },
    sections: [
      { role: "offer-clarity", layout: "direct-hero", content: "offer、收益、适合对象", why: "让已有需求的用户快速判断值不值得继续。" },
      { role: "value-evidence", layout: "benefit-proof-pairs", content: "收益点和对应证明", why: "每个承诺都要有支撑。" },
      { role: "how-it-works", layout: "compact-process", content: "流程、价格或交付方式", why: "降低行动成本。" },
      { role: "objection-handling", layout: "faq-with-cta", content: "FAQ、保障、行动入口", why: "处理临门一脚的犹豫。" },
    ],
    layoutRhythm: "offer -> 收益 -> 证明 -> 流程/价格 -> FAQ -> 行动",
    decisionPath: ["确认是不是给我", "确认能得到什么", "确认可信", "确认成本", "行动"],
    previewWireframe: {
      hero: "offer-and-action",
      body: "benefits-proof-faq",
      proofPlacement: "near-benefits",
      ctaPlacement: "above-fold-and-end",
      density: "balanced",
    },
  },
  "info-editorial-thesis": {
    pageArchitecture: "观点叙事的 editorial 低保真：首屏抛出观点或冲突，页面像文章一样分段推进，行动入口不打断阅读节奏。",
    aboveFold: {
      layout: "editorial-title-with-context",
      primaryZone: "核心观点、主题或冲突",
      secondaryZone: "背景说明、作者/来源、阅读线索",
      proofZone: "不集中堆证明，随段落穿插",
      actionZone: "弱化，放为继续阅读/参与入口",
      visualWeight: { thesis: 55, context: 30, action: 15 },
    },
    sections: [
      { role: "set-thesis", layout: "large-title-editorial", content: "核心观点与背景", why: "先让用户知道为什么值得读。" },
      { role: "build-understanding", layout: "longform-sections", content: "分段论证和图文证据", why: "用节奏推进理解，而不是堆卡片。" },
      { role: "humanize", layout: "case-or-person-story", content: "案例、人物或场景", why: "让观点变具体。" },
      { role: "continue", layout: "reading-next-step", content: "深入阅读、订阅或参与入口", why: "在理解之后给下一步。" },
    ],
    layoutRhythm: "观点 -> 背景冲突 -> 分段论证 -> 案例证据 -> 深入/参与",
    decisionPath: ["被观点吸引", "理解背景", "相信论证", "看到具体例子", "继续阅读或参与"],
    previewWireframe: {
      hero: "text-thesis",
      body: "longform-with-evidence",
      proofPlacement: "through-story",
      ctaPlacement: "after-reading",
      density: "spacious",
    },
  },
  "info-content-hub-explore": {
    pageArchitecture: "内容入口型 hub 低保真：首屏提供总入口、推荐和分类，核心是帮助用户找内容，不是讲完整故事。",
    aboveFold: {
      layout: "search-category-featured",
      primaryZone: "搜索/分类/推荐内容入口",
      secondaryZone: "热门专题或最新内容",
      proofZone: "内容数量、更新频率、精选标签",
      actionZone: "订阅、收藏或进入专题",
      visualWeight: { navigation: 45, featured: 35, action: 20 },
    },
    sections: [
      { role: "orient", layout: "hub-header-with-search", content: "总入口、搜索、分类", why: "让不同目的的用户都能开始。" },
      { role: "recommend", layout: "featured-content-grid", content: "推荐内容和专题", why: "帮助没有明确目标的用户探索。" },
      { role: "browse", layout: "consistent-card-grid", content: "内容卡片列表", why: "保持扫描效率。" },
      { role: "return", layout: "subscription-band", content: "订阅、收藏、继续浏览入口", why: "给长期内容关系一个入口。" },
    ],
    layoutRhythm: "入口导航 -> 推荐 -> 分类浏览 -> 专题 -> 订阅",
    decisionPath: ["选择查找方式", "看到推荐", "筛选内容", "进入详情", "订阅或返回"],
    previewWireframe: {
      hero: "hub-navigation",
      body: "featured-then-grid",
      proofPlacement: "content-signals",
      ctaPlacement: "subscription-after-browse",
      density: "compact",
    },
  },
  "info-tool-operate-preview": {
    pageArchitecture: "工具操作型 workbench 低保真：首屏就是操作台，输入、控制、结果预览和状态反馈必须同时可见。",
    aboveFold: {
      layout: "control-panel-plus-preview",
      primaryZone: "主要输入/操作区和结果预览",
      secondaryZone: "参数、状态、历史或提示",
      proofZone: "结果质量通过预览体现，不用营销背书前置",
      actionZone: "生成、保存、同步、导出等任务按钮",
      visualWeight: { controls: 35, preview: 45, status: 20 },
    },
    sections: [
      { role: "operate", layout: "split-workbench", content: "输入区、设置区、结果预览", why: "工具用户要先完成任务。" },
      { role: "feedback", layout: "status-and-errors", content: "状态、错误、加载、空态", why: "操作必须有反馈。" },
      { role: "iterate", layout: "history-and-versions", content: "历史记录、保存、导出", why: "支持反复调整。" },
      { role: "learn-lightly", layout: "inline-help", content: "轻量提示和示例", why: "帮助新手，但不挤占操作空间。" },
    ],
    layoutRhythm: "输入 -> 操作 -> 预览 -> 调整 -> 保存/导出",
    decisionPath: ["输入信息", "调整参数", "查看结果", "修改", "保存或同步"],
    previewWireframe: {
      hero: "workbench",
      body: "controls-preview-status",
      proofPlacement: "result-preview",
      ctaPlacement: "task-buttons-in-toolbar",
      density: "compact",
    },
  },
  "info-compare-packages": {
    pageArchitecture: "对比决策型 comparison 低保真：先定义选择问题，再用少量维度比较方案，最后给推荐路径。",
    aboveFold: {
      layout: "choice-question-plus-options",
      primaryZone: "用户正在选择什么",
      secondaryZone: "2-4 个方案概览",
      proofZone: "推荐理由或适合人群标签",
      actionZone: "查看对比/选择方案",
      visualWeight: { question: 30, options: 50, action: 20 },
    },
    sections: [
      { role: "frame-choice", layout: "choice-question", content: "选择问题和方案概览", why: "先让用户知道差异来自哪里。" },
      { role: "compare", layout: "comparison-table", content: "少量关键维度对比", why: "帮助用户扫描差异。" },
      { role: "recommend", layout: "recommendation-path", content: "适合人群和推荐路径", why: "给不会选的人一个判断依据。" },
      { role: "reassure", layout: "faq-guarantee", content: "FAQ、保障、行动入口", why: "降低选错风险。" },
    ],
    layoutRhythm: "选择问题 -> 方案概览 -> 对比表 -> 推荐路径 -> FAQ/保障",
    decisionPath: ["理解选项", "比较差异", "找到适合自己的", "确认风险", "选择"],
    previewWireframe: {
      hero: "choice-overview",
      body: "cards-table-recommendation",
      proofPlacement: "comparison-table",
      ctaPlacement: "per-option-and-end",
      density: "balanced",
    },
  },
  "info-event-participation": {
    pageArchitecture: "活动参与型 event 低保真：首屏讲清活动是什么、为什么值得参加、何时何地参加，报名入口必须稳定可见。",
    aboveFold: {
      layout: "event-title-details-action",
      primaryZone: "活动主题和亮点",
      secondaryZone: "时间、地点、对象、名额",
      proofZone: "嘉宾、往届照片或参与人数",
      actionZone: "报名/加入日历/了解流程",
      visualWeight: { theme: 40, details: 30, action: 30 },
    },
    sections: [
      { role: "event-recognition", layout: "event-hero", content: "主题、亮点、时间地点", why: "先讲清活动基本判断信息。" },
      { role: "value-and-fit", layout: "benefit-and-audience", content: "收获、适合对象、嘉宾", why: "让用户判断值不值得参加。" },
      { role: "schedule", layout: "timeline", content: "流程安排", why: "降低不确定感。" },
      { role: "registration", layout: "sticky-or-repeat-cta", content: "报名入口、FAQ", why: "行动路径不能丢。" },
    ],
    layoutRhythm: "主题亮点 -> 时间地点 -> 收获对象 -> 流程 -> 报名 FAQ",
    decisionPath: ["知道活动是什么", "确认时间地点", "判断是否适合", "理解流程", "报名"],
    previewWireframe: {
      hero: "event-info-first",
      body: "benefits-timeline-registration",
      proofPlacement: "mid-page",
      ctaPlacement: "above-fold-and-sticky",
      density: "balanced",
    },
  },
  "info-price-package-clarity": {
    pageArchitecture: "价格套餐型 pricing 低保真：价格卡片是核心，但必须同时解释适合谁、权益差异、限制和保障。",
    aboveFold: {
      layout: "pricing-context-plus-cards",
      primaryZone: "定价说明和套餐卡片",
      secondaryZone: "适合人群、推荐套餐、关键权益",
      proofZone: "保障、退款、客户数量或评价",
      actionZone: "选择套餐/咨询",
      visualWeight: { pricing: 55, explanation: 25, action: 20 },
    },
    sections: [
      { role: "price-understanding", layout: "pricing-cards", content: "套餐、价格、推荐标签", why: "价格是主要决策点，要直接可见。" },
      { role: "value-clarity", layout: "benefit-comparison", content: "权益对比和限制", why: "避免用户只看价格。" },
      { role: "fit-guidance", layout: "who-it-is-for", content: "适合人群和选择建议", why: "帮助小白判断买哪档。" },
      { role: "risk-reduction", layout: "guarantee-faq", content: "保障、FAQ、咨询入口", why: "降低付费顾虑。" },
    ],
    layoutRhythm: "价格卡片 -> 权益对比 -> 适合人群 -> 保障 FAQ -> 行动",
    decisionPath: ["看到价格", "理解每档差异", "判断适合哪档", "确认保障", "购买或咨询"],
    previewWireframe: {
      hero: "pricing-cards-first",
      body: "comparison-fit-guarantee",
      proofPlacement: "after-pricing",
      ctaPlacement: "per-plan-and-end",
      density: "balanced",
    },
  },
  "info-work-first-story-gallery": {
    pageArchitecture: "案例叙事主导的 story-first 低保真：首屏用代表性案例故事建立共鸣，再展开作品画面与服务说明（design-md 作品集叙事 + ux-pro landing 故事线）。",
    aboveFold: {
      layout: "story-lead-with-featured-work",
      primaryZone: "一个完整案例故事或项目结果摘要",
      secondaryZone: "代表画面、风格标签、查看全部作品入口",
      proofZone: "案例结果数据或客户一句话评价",
      actionZone: "查看案例详情 / 浏览作品",
      visualWeight: { story: 40, media: 40, action: 20 },
    },
    sections: [
      { role: "story-hook", layout: "case-story-hero", content: "代表性案例故事与结果", why: "用具体结果先建立共鸣，而不只堆图片。" },
      { role: "visual-proof", layout: "featured-work-strip", content: "关键画面与风格线索", why: "在理解故事后承接视觉判断。" },
      { role: "browse-works", layout: "filterable-gallery-grid", content: "分类作品与更多案例", why: "让用户继续探索相近作品。" },
      { role: "understand-service", layout: "step-list", content: "服务流程与交付方式", why: "认可案例后再谈合作。" },
      { role: "next-action", layout: "soft-cta-band", content: "预约咨询", why: "克制行动入口。" },
    ],
    layoutRhythm: "案例故事 -> 代表画面 -> 作品浏览 -> 服务说明 -> 预约",
    decisionPath: ["被案例打动", "看风格是否匹配", "浏览更多作品", "理解合作方式", "预约"],
    previewWireframe: {
      hero: "story-led-media",
      body: "narrative-then-gallery",
      proofPlacement: "in-story",
      ctaPlacement: "after-gallery",
      density: "spacious",
    },
  },
  "info-trust-first-cases-before-proof": {
    pageArchitecture: "案例先行的 trust variant：先用可验证案例结果建立相关性与能力感，再把资质、流程和保障作为二次确认（ux-pro social-proof 后置 credentials）。",
    aboveFold: {
      layout: "case-result-with-service-promise",
      primaryZone: "代表性客户案例结果与场景匹配",
      secondaryZone: "一句话服务承诺与适合对象",
      proofZone: "案例数据/评价摘要，资质仅轻量露出",
      actionZone: "查看更多案例 / 了解流程",
      visualWeight: { cases: 50, claim: 25, action: 25 },
    },
    sections: [
      { role: "case-validation", layout: "case-result-cards", content: "客户案例结果与场景", why: "用结果先证明能力相关，降低抽象感。" },
      { role: "service-clarity", layout: "two-column-service-list", content: "服务范围与交付对象", why: "确认是否解决自己的问题。" },
      { role: "credentials", layout: "credential-strip", content: "资质、认证、团队背景", why: "在案例之后补足正式背书。" },
      { role: "process-confidence", layout: "numbered-process", content: "流程、周期、保障", why: "把合作变成可预期过程。" },
      { role: "objection-handling", layout: "faq-accordion", content: "FAQ 与咨询入口", why: "处理最后顾虑。" },
    ],
    layoutRhythm: "案例结果 -> 服务匹配 -> 资质背书 -> 流程保障 -> FAQ 咨询",
    decisionPath: ["案例是否像我", "服务是否对口", "资质是否过关", "流程是否放心", "咨询"],
    previewWireframe: {
      hero: "case-result-first",
      body: "cases-then-credentials",
      proofPlacement: "cases-first",
      ctaPlacement: "after-process",
      density: "balanced",
    },
  },
  "info-product-demo-problem-solution": {
    pageArchitecture: "问题驱动的 problem-solution-demo 低保真：先对齐痛点与任务，再给方案框架，最后落到界面演示（ux-pro landing problem-agitation + design-md SaaS 叙事）。",
    aboveFold: {
      layout: "problem-headline-solution-preview",
      primaryZone: "用户痛点或待完成任务",
      secondaryZone: "方案一句话与结果预览缩略图",
      proofZone: "不前置，用方案逻辑代替空泛口号",
      actionZone: "查看演示 / 了解方案",
      visualWeight: { problem: 35, solution: 35, demo: 30 },
    },
    sections: [
      { role: "problem-frame", layout: "problem-statement", content: "痛点、现状、成本", why: "先让用户确认这是在说我。" },
      { role: "solution-outline", layout: "solution-summary", content: "方案思路与关键改变", why: "在演示前建立理解框架。" },
      { role: "product-demo", layout: "hero-screen", content: "产品界面或工作流演示", why: "用 demo 验证方案可行。" },
      { role: "scenario-depth", layout: "use-case-tabs", content: "场景化功能展开", why: "按任务补充能力细节。" },
      { role: "trial-decision", layout: "demo-cta-band", content: "案例证明与试用入口", why: "把理解转为行动。" },
    ],
    layoutRhythm: "问题痛点 -> 方案概述 -> 产品演示 -> 场景功能 -> 试用",
    decisionPath: ["确认痛点", "认同方案", "看懂演示", "判断能力", "试用"],
    previewWireframe: {
      hero: "problem-statement",
      body: "solution-then-demo",
      proofPlacement: "after-demo",
      ctaPlacement: "near-demo",
      density: "balanced",
    },
  },
  "info-clear-conversion-proof-before-offer": {
    pageArchitecture: "证明前置的 conversion variant：先用评价、案例或保障打消顾虑，再展开 offer 与收益（ux-pro objection-handling before CTA）。",
    aboveFold: {
      layout: "proof-strip-then-offer",
      primaryZone: "2-3 条可信证明或客户结果",
      secondaryZone: "一句话 offer 与核心收益",
      proofZone: "首屏上半区即证明",
      actionZone: "主 CTA 放在 offer 明确之后",
      visualWeight: { proof: 40, offer: 35, action: 25 },
    },
    sections: [
      { role: "trust-open", layout: "proof-strip", content: "评价、案例摘要、保障", why: "高犹豫场景先降风险。" },
      { role: "offer-clarity", layout: "direct-hero", content: "offer、收益、适合对象", why: "证明后再讲清价值。" },
      { role: "value-evidence", layout: "benefit-proof-pairs", content: "收益点与对应证明", why: "每个承诺有支撑。" },
      { role: "how-it-works", layout: "compact-process", content: "流程、价格或交付", why: "降低行动成本。" },
      { role: "objection-handling", layout: "faq-with-cta", content: "FAQ 与行动入口", why: "处理临门犹豫。" },
    ],
    layoutRhythm: "证明背书 -> offer 收益 -> 价值证据 -> 流程价格 -> FAQ 行动",
    decisionPath: ["先信不靠谱", "再看值不值", "确认收益", "确认成本", "行动"],
    previewWireframe: {
      hero: "proof-then-offer",
      body: "social-proof-before-benefits",
      proofPlacement: "above-fold",
      ctaPlacement: "after-offer",
      density: "balanced",
    },
  },
  "info-editorial-chapter-thread": {
    pageArchitecture: "章节线索式 editorial variant：用章节导览和阅读线索分段推进，适合长内容品牌报告（design-md 长文专题结构）。",
    aboveFold: {
      layout: "chapter-index-with-thesis",
      primaryZone: "核心观点 + 章节导览/阅读时间",
      secondaryZone: "背景摘要与作者线索",
      proofZone: "章节内穿插证据",
      actionZone: "开始阅读第一章",
      visualWeight: { thesis: 40, index: 35, action: 25 },
    },
    sections: [
      { role: "chapter-map", layout: "chapter-index", content: "章节列表与阅读线索", why: "让用户知道将要读什么。" },
      { role: "set-thesis", layout: "large-title-editorial", content: "核心观点开篇", why: "建立阅读动机。" },
      { role: "thread-sections", layout: "numbered-chapters", content: "按章节展开论证", why: "线索清楚，方便跳读。" },
      { role: "humanize", layout: "inline-case-figures", content: "案例、人物、数据插图", why: "让章节内容可感。" },
      { role: "continue", layout: "reading-next-step", content: "延伸阅读或参与入口", why: "读完后给下一步。" },
    ],
    layoutRhythm: "章节导览 -> 观点开篇 -> 分段章节 -> 图文证据 -> 延伸参与",
    decisionPath: ["看目录是否相关", "被观点吸引", "按章节阅读", "相信证据", "继续深入"],
    previewWireframe: {
      hero: "chapter-index",
      body: "threaded-sections",
      proofPlacement: "inline-chapters",
      ctaPlacement: "after-reading",
      density: "spacious",
    },
  },
  "info-content-hub-task-lanes": {
    pageArchitecture: "任务分栏式 hub variant：按用户任务组织入口车道，而非纯内容类型分类（ux-pro app-interface task-based IA）。",
    aboveFold: {
      layout: "task-lanes-with-search",
      primaryZone: "3-4 个任务车道（如学习/选型/排障）",
      secondaryZone: "搜索与每个车道下的推荐",
      proofZone: "内容数量与更新信号",
      actionZone: "进入车道或搜索",
      visualWeight: { lanes: 50, search: 30, action: 20 },
    },
    sections: [
      { role: "task-orient", layout: "task-lane-cards", content: "按任务划分的入口车道", why: "用户常按任务而非栏目找内容。" },
      { role: "lane-recommend", layout: "lane-featured-lists", content: "每个车道下的推荐路径", why: "给不明确目标的用户捷径。" },
      { role: "browse", layout: "consistent-card-grid", content: "全站内容卡片", why: "保留自由浏览。" },
      { role: "return", layout: "subscription-band", content: "订阅或收藏入口", why: "建立长期关系。" },
    ],
    layoutRhythm: "任务分栏 -> 车道推荐 -> 全站浏览 -> 订阅",
    decisionPath: ["识别自己的任务", "进入车道", "看推荐", "浏览或搜索", "订阅"],
    previewWireframe: {
      hero: "task-lanes",
      body: "lanes-then-lists",
      proofPlacement: "lane-meta",
      ctaPlacement: "per-lane",
      density: "compact",
    },
  },
  "info-tool-operate-guided-walkthrough": {
    pageArchitecture: "引导示例式 tool variant：先用示例任务带用户走通一遍，再开放完整操作台（ux-pro onboarding walkthrough pattern）。",
    aboveFold: {
      layout: "guided-example-above-workbench",
      primaryZone: "分步引导区 + 示例输入已填好",
      secondaryZone: "结果预览与下一步提示",
      proofZone: "示例结果即证明",
      actionZone: "下一步 / 自己试试",
      visualWeight: { guide: 45, preview: 35, action: 20 },
    },
    sections: [
      { role: "guided-pass", layout: "step-walkthrough", content: "示例任务分步引导", why: "降低首次使用门槛。" },
      { role: "operate", layout: "split-workbench", content: "完整输入区与结果预览", why: "引导后开放自由操作。" },
      { role: "feedback", layout: "status-and-errors", content: "状态与错误反馈", why: "操作必须有响应。" },
      { role: "iterate", layout: "history-and-versions", content: "历史、保存、导出", why: "支持反复尝试。" },
    ],
    layoutRhythm: "示例引导 -> 分步完成 -> 开放操作 -> 预览调整 -> 保存导出",
    decisionPath: ["跟着示例做", "看懂结果", "自己输入", "调整参数", "保存"],
    previewWireframe: {
      hero: "guided-walkthrough",
      body: "steps-then-workbench",
      proofPlacement: "example-result",
      ctaPlacement: "step-next",
      density: "compact",
    },
  },
  "info-compare-scenario-matrix": {
    pageArchitecture: "场景矩阵式 comparison variant：按使用场景列方案差异，而非纯价格参数表（ux-pro products comparison matrix）。",
    aboveFold: {
      layout: "scenario-question-matrix-preview",
      primaryZone: "用户在什么场景下做选择",
      secondaryZone: "场景 x 方案矩阵预览",
      proofZone: "每个场景下的推荐标签",
      actionZone: "展开矩阵 / 查看推荐",
      visualWeight: { scenario: 40, matrix: 40, action: 20 },
    },
    sections: [
      { role: "scenario-frame", layout: "scenario-question", content: "场景问题与角色", why: "先对齐用户在什么情况下选。" },
      { role: "matrix-compare", layout: "scenario-matrix", content: "场景 x 方案对照矩阵", why: "用场景组织差异而非堆参数。" },
      { role: "recommend", layout: "recommendation-path", content: "各场景推荐路径", why: "帮用户快速对号入座。" },
      { role: "reassure", layout: "faq-guarantee", content: "FAQ、保障、行动入口", why: "降低选错风险。" },
    ],
    layoutRhythm: "场景问题 -> 场景矩阵 -> 推荐路径 -> FAQ 保障",
    decisionPath: ["对号入座场景", "看矩阵差异", "接受推荐", "确认保障", "选择"],
    previewWireframe: {
      hero: "scenario-question",
      body: "matrix-recommendation",
      proofPlacement: "matrix-cells",
      ctaPlacement: "per-scenario",
      density: "balanced",
    },
  },
  "info-event-agenda-first": {
    pageArchitecture: "议程先行的 event variant：首屏用时间线议程帮用户判断值不值得投入时间，再展开亮点与报名（design-md 会议活动页）。",
    aboveFold: {
      layout: "agenda-timeline-with-title",
      primaryZone: "活动时间线与关键议程块",
      secondaryZone: "活动主题、地点、对象",
      proofZone: "嘉宾/往届片段穿插议程",
      actionZone: "加入日历 / 报名",
      visualWeight: { agenda: 45, theme: 30, action: 25 },
    },
    sections: [
      { role: "agenda-scan", layout: "agenda-timeline", content: "时间线与议程安排", why: "用户先判断时间投入是否值得。" },
      { role: "value-and-fit", layout: "benefit-and-audience", content: "亮点、适合对象、嘉宾", why: "议程之后解释价值。" },
      { role: "logistics", layout: "event-details-strip", content: "地点、名额、注意事项", why: "降低参与成本疑虑。" },
      { role: "registration", layout: "sticky-or-repeat-cta", content: "报名入口与 FAQ", why: "行动路径稳定可见。" },
    ],
    layoutRhythm: "议程时间线 -> 活动价值 -> 地点名额 -> 报名 FAQ",
    decisionPath: ["扫议程是否值得", "判断适合度", "确认时间地点", "处理顾虑", "报名"],
    previewWireframe: {
      hero: "agenda-timeline",
      body: "agenda-value-registration",
      proofPlacement: "in-agenda",
      ctaPlacement: "sticky-registration",
      density: "balanced",
    },
  },
  "info-price-package-value-before-price": {
    pageArchitecture: "价值先行的 pricing variant：先讲清每档解决什么问题、适合谁，再展示价格卡片（ux-pro value-before-price pattern）。",
    aboveFold: {
      layout: "value-outcomes-then-pricing-teaser",
      primaryZone: "各档价值主张与适合人群",
      secondaryZone: "关键成果或权益摘要",
      proofZone: "客户结果或保障轻量露出",
      actionZone: "查看完整价格 / 选套餐",
      visualWeight: { value: 50, pricing: 30, action: 20 },
    },
    sections: [
      { role: "value-frame", layout: "value-outcome-cards", content: "各档解决什么问题", why: "避免用户只比价格不比价值。" },
      { role: "fit-guidance", layout: "who-it-is-for", content: "适合人群与选择建议", why: "帮用户对号入座。" },
      { role: "price-understanding", layout: "pricing-cards", content: "套餐价格与推荐标签", why: "价值清楚后再出价格。" },
      { role: "risk-reduction", layout: "guarantee-faq", content: "权益对比、保障、FAQ", why: "降低付费顾虑。" },
    ],
    layoutRhythm: "价值说明 -> 适合人群 -> 价格卡片 -> 权益保障 -> 行动",
    decisionPath: ["理解价值差异", "判断适合哪档", "看到价格", "确认保障", "购买咨询"],
    previewWireframe: {
      hero: "value-context",
      body: "value-then-pricing-cards",
      proofPlacement: "after-value",
      ctaPlacement: "per-plan",
      density: "balanced",
    },
  },
};

const layoutArchitectureDetails = {
  "info-work-first-service": {
    pageFrame: {
      navigation: "顶部导航，保留作品/服务/流程/联系入口",
      shell: "单页长滚动，首屏和作品区都要足够宽",
      footer: "轻量联系收束，避免复杂营销页脚",
    },
    firstScreen: {
      layout: "大图首屏或左大图右短文案",
      priority: "代表作品/项目画面先出现",
      secondary: "一句话定位 + 少量服务标签 + 轻 CTA",
    },
    contentFlow: {
      pattern: "大图首屏 -> 分类筛选 -> 作品网格/瀑布流 -> 服务流程 -> 证明 -> 联系",
      browsePattern: "作品多时用筛选网格或瀑布流；作品少时用精选大卡片，不强行轮播",
      proofPosition: "证明放在作品之后，不要压过作品判断",
    },
    componentPatterns: {
      navigation: "top-nav",
      hero: "large-media-showcase",
      showcase: "filterable-gallery-grid",
      optional: ["horizontal-featured-carousel", "masonry-gallery"],
      finalAction: "soft-contact-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择这个作品先行架构", "是否手动改成瀑布流/轮播/网格"],
      aiCompletes: ["具体网格列数", "图片比例", "作品卡片信息密度", "证明条位置"],
    },
  },
  "info-trust-first-service": {
    pageFrame: {
      navigation: "顶部导航，服务/案例/流程/FAQ/咨询清楚可达",
      shell: "证明和服务说明交替推进的长页",
      footer: "咨询入口 + 资质/联系方式收束",
    },
    firstScreen: {
      layout: "左侧定位和承诺，右侧证明卡/数据/客户结果",
      priority: "先回答靠不靠谱",
      secondary: "服务范围和咨询入口作为辅助",
    },
    contentFlow: {
      pattern: "可信定位 -> 证明卡 -> 服务说明 -> 流程保障 -> 案例评价 -> FAQ -> 咨询",
      browsePattern: "证明用卡片/数据条/案例摘要，不用纯氛围图撑场",
      proofPosition: "证明必须首屏可见",
    },
    componentPatterns: {
      navigation: "top-nav",
      hero: "claim-proof-split",
      proof: "proof-card-grid",
      process: "numbered-process",
      finalAction: "consultation-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择信任前置架构", "是否强调案例/资质/流程"],
      aiCompletes: ["证明卡数量", "流程步骤数量", "FAQ 密度", "咨询入口重复位置"],
    },
  },
  "info-product-demo-first": {
    pageFrame: {
      navigation: "顶部导航，产品/场景/功能/案例/试用入口",
      shell: "产品界面和场景解释交替出现",
      footer: "试用、文档或联系入口收束",
    },
    firstScreen: {
      layout: "产品界面或结果预览居中/右侧，标题解释它完成什么任务",
      priority: "产品画面和工作流先出现",
      secondary: "场景说明和试用入口",
    },
    contentFlow: {
      pattern: "产品界面 -> 使用场景 tabs -> 工作流步骤 -> 功能分组 -> 集成/案例 -> 试用",
      browsePattern: "复杂功能用 tabs/步骤流，不用堆三张泛功能卡",
      proofPosition: "证明放在 demo 之后，用结果样例或客户场景支撑",
    },
    componentPatterns: {
      navigation: "top-nav",
      hero: "product-screen-stage",
      explain: "scenario-tabs",
      workflow: "step-flow-with-screens",
      finalAction: "trial-cta-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择产品界面先行架构", "是否强调 demo/截图/工作流"],
      aiCompletes: ["界面卡片大小", "tabs 数量", "功能分组方式", "试用入口位置"],
    },
  },
  "info-clear-conversion-offer": {
    pageFrame: {
      navigation: "顶部导航或简化导航，行动入口始终清楚",
      shell: "短节奏长页，收益和证明快速交替",
      footer: "FAQ + 主行动入口收束",
    },
    firstScreen: {
      layout: "标题 offer + 收益点 + 主 CTA + 轻证明",
      priority: "先讲清楚用户能得到什么",
      secondary: "适合谁和下一步动作",
    },
    contentFlow: {
      pattern: "offer -> 收益点 -> 证明 -> 流程/价格 -> FAQ -> 行动",
      browsePattern: "收益点用短卡片或横向条，避免长篇解释",
      proofPosition: "证明靠近收益点和 CTA",
    },
    componentPatterns: {
      navigation: "simple-top-nav",
      hero: "offer-benefit-action",
      benefits: "benefit-proof-pairs",
      finalAction: "repeated-cta-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择转化优先架构", "是否强调报名/咨询/购买"],
      aiCompletes: ["CTA 重复频率", "收益卡片数量", "FAQ 数量", "证明条形式"],
    },
  },
  "info-editorial-thesis": {
    pageFrame: {
      navigation: "顶部导航弱化，阅读路径优先",
      shell: "像专题文章一样分段推进",
      footer: "继续阅读/订阅/参与入口",
    },
    firstScreen: {
      layout: "大标题 + 背景摘要 + 作者/来源/主题线索",
      priority: "观点或冲突先出现",
      secondary: "场景图片或关键证据辅助",
    },
    contentFlow: {
      pattern: "观点 -> 背景冲突 -> 分段论证 -> 图文证据 -> 案例/人物 -> 下一步",
      browsePattern: "使用长文段落、图文穿插和引用块，不做营销卡片堆叠",
      proofPosition: "证明随叙事穿插",
    },
    componentPatterns: {
      navigation: "minimal-top-nav",
      hero: "editorial-title",
      body: "longform-sections",
      media: "inline-evidence-figures",
      finalAction: "reading-next-step",
    },
    layoutDecisions: {
      userChooses: ["是否选择观点叙事架构"],
      aiCompletes: ["段落节奏", "图文比例", "引用/证据位置", "行动入口弱化方式"],
    },
  },
  "info-content-hub-explore": {
    pageFrame: {
      navigation: "顶部导航 + 搜索/分类入口",
      shell: "内容索引页或资源首页",
      footer: "订阅、专题和返回入口",
    },
    firstScreen: {
      layout: "总入口 + 搜索 + 推荐内容/分类",
      priority: "先帮用户找到入口",
      secondary: "热门专题和内容数量信号",
    },
    contentFlow: {
      pattern: "入口导航 -> 推荐 -> 分类筛选 -> 内容网格 -> 专题集合 -> 订阅",
      browsePattern: "内容多用分类网格，内容少用精选列表，不强装门户",
      proofPosition: "用内容数量/更新时间/精选标签作为证明",
    },
    componentPatterns: {
      navigation: "top-nav-search",
      hero: "hub-search-categories",
      content: "consistent-card-grid",
      optional: ["sidebar-filter", "topic-rail"],
      finalAction: "subscription-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择内容入口架构", "是否需要搜索/分类"],
      aiCompletes: ["分类数量", "卡片字段", "推荐区大小", "订阅入口位置"],
    },
  },
  "info-tool-operate-preview": {
    pageFrame: {
      navigation: "轻导航或工具栏，操作区优先",
      shell: "工作台布局，不是营销落地页",
      footer: "可弱化，更多使用状态栏/保存入口",
    },
    firstScreen: {
      layout: "左操作区 + 右结果预览，或上工具栏 + 主预览",
      priority: "输入、控制和结果反馈先出现",
      secondary: "示例、状态、历史记录",
    },
    contentFlow: {
      pattern: "输入 -> 操作 -> 预览 -> 调整 -> 历史/保存/导出",
      browsePattern: "使用面板、控件、状态条，不用大段品牌文案",
      proofPosition: "结果预览本身就是证明",
    },
    componentPatterns: {
      navigation: "toolbar",
      hero: "split-workbench",
      controls: "control-panel",
      preview: "result-preview-panel",
      finalAction: "save-export-actions",
    },
    layoutDecisions: {
      userChooses: ["是否选择工具工作台架构"],
      aiCompletes: ["面板比例", "控件分组", "状态反馈", "空态和错误态"],
    },
  },
  "info-compare-packages": {
    pageFrame: {
      navigation: "顶部导航，价格/对比/FAQ/咨询清楚可达",
      shell: "对比和推荐路径优先的长页",
      footer: "保障和咨询入口收束",
    },
    firstScreen: {
      layout: "选择问题 + 方案概览卡",
      priority: "先让用户知道自己在比较什么",
      secondary: "推荐标签和适合人群",
    },
    contentFlow: {
      pattern: "选择问题 -> 方案卡 -> 对比表 -> 适合人群 -> 推荐路径 -> FAQ/保障",
      browsePattern: "对比维度少而清楚，不做超长参数表",
      proofPosition: "证明靠近推荐路径",
    },
    componentPatterns: {
      navigation: "top-nav",
      hero: "choice-overview-cards",
      comparison: "comparison-table",
      guide: "recommendation-path",
      finalAction: "choose-or-consult-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择比较决策架构"],
      aiCompletes: ["对比维度", "推荐标签", "表格密度", "FAQ 放置"],
    },
  },
  "info-event-participation": {
    pageFrame: {
      navigation: "顶部导航或活动锚点导航，报名入口固定可见",
      shell: "活动信息和参与路径快速推进",
      footer: "报名/联系方式/FAQ 收束",
    },
    firstScreen: {
      layout: "活动主题 + 亮点 + 时间地点 + 报名入口",
      priority: "先讲清是什么活动、何时何地、为什么参加",
      secondary: "嘉宾/往届/名额作为证明",
    },
    contentFlow: {
      pattern: "主题亮点 -> 时间地点 -> 收获对象 -> 流程时间线 -> 嘉宾/证明 -> 报名 FAQ",
      browsePattern: "用时间线、信息条和报名卡，不只做情绪海报",
      proofPosition: "嘉宾、往届照片或参与人数放中前段",
    },
    componentPatterns: {
      navigation: "event-anchor-nav",
      hero: "event-info-action",
      schedule: "timeline",
      proof: "speaker-proof-cards",
      finalAction: "registration-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择活动参与架构"],
      aiCompletes: ["时间线形式", "报名入口重复频率", "嘉宾卡数量", "FAQ 数量"],
    },
  },
  "info-price-package-clarity": {
    pageFrame: {
      navigation: "顶部导航，价格/权益/FAQ/咨询可达",
      shell: "定价卡片 + 权益解释 + 风险降低",
      footer: "保障和咨询入口收束",
    },
    firstScreen: {
      layout: "定价说明 + 套餐卡片 + 推荐标签",
      priority: "价格和适合谁直接可见",
      secondary: "关键权益和保障",
    },
    contentFlow: {
      pattern: "价格卡片 -> 权益对比 -> 适合人群 -> 限制说明 -> 保障 FAQ -> 行动",
      browsePattern: "套餐卡片和权益表搭配，不隐藏限制",
      proofPosition: "保障放在价格之后，FAQ 前置到用户犹豫处",
    },
    componentPatterns: {
      navigation: "top-nav",
      hero: "pricing-cards-first",
      comparison: "benefit-comparison-table",
      guide: "who-it-is-for-cards",
      finalAction: "plan-choice-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择价格套餐架构"],
      aiCompletes: ["推荐套餐高亮强度", "权益表密度", "限制说明位置", "保障表达方式"],
    },
  },
  "info-work-first-story-gallery": {
    pageFrame: {
      navigation: "顶部导航，案例/作品/服务/联系",
      shell: "故事段 + 画廊段交替的长页",
      footer: "轻量预约收束",
    },
    firstScreen: {
      layout: "案例故事摘要 + 代表画面并排或上下",
      priority: "案例结果与故事先出现",
      secondary: "风格标签与浏览作品入口",
    },
    contentFlow: {
      pattern: "案例故事 -> 代表画面 -> 分类作品 -> 服务流程 -> 预约",
      browsePattern: "故事区用叙事块，作品区用网格",
      proofPosition: "证明嵌入案例叙事，不单列为首屏大块",
    },
    componentPatterns: {
      navigation: "top-nav",
      hero: "case-story-hero",
      showcase: "filterable-gallery-grid",
      finalAction: "soft-contact-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择案例叙事先行变体"],
      aiCompletes: ["故事长度", "代表画面数量", "画廊密度"],
    },
  },
  "info-trust-first-cases-before-proof": {
    pageFrame: {
      navigation: "顶部导航，案例/服务/资质/流程/咨询",
      shell: "案例 -> 服务 -> 资质的长页",
      footer: "咨询 + 资质摘要收束",
    },
    firstScreen: {
      layout: "案例结果卡在上，服务承诺在下或右侧",
      priority: "案例结果先建立能力感",
      secondary: "资质仅轻量标签，不抢案例",
    },
    contentFlow: {
      pattern: "案例结果 -> 服务说明 -> 资质背书 -> 流程保障 -> FAQ",
      browsePattern: "案例用结果卡，资质用条带或徽标墙",
      proofPosition: "正式资质放在案例中后段",
    },
    componentPatterns: {
      navigation: "top-nav",
      hero: "case-result-hero",
      proof: "credential-strip",
      process: "numbered-process",
      finalAction: "consultation-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择案例先行变体", "案例与资质比重"],
      aiCompletes: ["案例卡数量", "资质展示形式", "流程步骤数"],
    },
  },
  "info-product-demo-problem-solution": {
    pageFrame: {
      navigation: "顶部导航，问题/方案/演示/试用",
      shell: "叙事段过渡到产品界面段",
      footer: "试用与文档入口",
    },
    firstScreen: {
      layout: "痛点标题 + 方案摘要 + demo 缩略预览",
      priority: "问题与任务先对齐",
      secondary: "方案一句话与演示入口",
    },
    contentFlow: {
      pattern: "痛点 -> 方案 -> 演示 -> 场景功能 -> 试用",
      browsePattern: "前两屏以文字逻辑为主，第三屏进入界面",
      proofPosition: "案例证明跟在 demo 之后",
    },
    componentPatterns: {
      navigation: "top-nav",
      hero: "problem-solution-split",
      explain: "solution-summary",
      workflow: "hero-screen-demo",
      finalAction: "trial-cta-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择问题驱动变体"],
      aiCompletes: ["痛点表述强度", "方案块长度", "demo 出现位置"],
    },
  },
  "info-clear-conversion-proof-before-offer": {
    pageFrame: {
      navigation: "简化导航，证明与行动入口清楚",
      shell: "证明带 -> offer 区 -> FAQ 收束",
      footer: "FAQ + 主 CTA",
    },
    firstScreen: {
      layout: "证明条/评价条 + offer 标题 + CTA",
      priority: "社会证明先出现",
      secondary: "offer 与适合人群",
    },
    contentFlow: {
      pattern: "证明 -> offer -> 收益证据 -> 流程 -> FAQ -> 行动",
      browsePattern: "证明用横向条或评价卡，不堆长文案",
      proofPosition: "证明必须在 offer 之前可见",
    },
    componentPatterns: {
      navigation: "simple-top-nav",
      hero: "proof-then-offer-hero",
      benefits: "benefit-proof-pairs",
      finalAction: "repeated-cta-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择证明前置变体"],
      aiCompletes: ["证明条数量", "offer 出现位置", "CTA 频率"],
    },
  },
  "info-editorial-chapter-thread": {
    pageFrame: {
      navigation: "弱化导航 + 章节锚点",
      shell: "章节索引 + 分段长文",
      footer: "延伸阅读入口",
    },
    firstScreen: {
      layout: "章节导览 + 核心观点标题",
      priority: "阅读线索与观点同时可见",
      secondary: "作者/来源与预计阅读时间",
    },
    contentFlow: {
      pattern: "章节导览 -> 观点 -> 分章论证 -> 证据插图 -> 延伸",
      browsePattern: "章节编号清楚，支持锚点跳转",
      proofPosition: "证据按章节穿插",
    },
    componentPatterns: {
      navigation: "chapter-anchor-nav",
      hero: "chapter-index-hero",
      body: "numbered-chapters",
      finalAction: "reading-next-step",
    },
    layoutDecisions: {
      userChooses: ["是否选择章节线索变体"],
      aiCompletes: ["章节数量", "导览形式", "插图密度"],
    },
  },
  "info-content-hub-task-lanes": {
    pageFrame: {
      navigation: "顶部导航 + 搜索",
      shell: "任务车道 + 列表索引",
      footer: "订阅与返回入口",
    },
    firstScreen: {
      layout: "任务车道横排或分栏 + 搜索",
      priority: "按任务找入口",
      secondary: "每车道下 1-2 个推荐",
    },
    contentFlow: {
      pattern: "任务车道 -> 车道推荐 -> 全站列表 -> 订阅",
      browsePattern: "车道用语义图标+短标签，列表保持统一卡片",
      proofPosition: "内容数量显示在车道 meta",
    },
    componentPatterns: {
      navigation: "top-nav-search",
      hero: "task-lane-header",
      content: "lane-featured-lists",
      finalAction: "subscription-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择任务分栏变体", "车道数量"],
      aiCompletes: ["车道命名", "推荐列表长度", "搜索位置"],
    },
  },
  "info-tool-operate-guided-walkthrough": {
    pageFrame: {
      navigation: "工具栏 + 轻量帮助",
      shell: "引导层可折叠，下接工作台",
      footer: "保存/导出状态区",
    },
    firstScreen: {
      layout: "分步引导叠在或邻接操作台",
      priority: "示例步骤与结果预览",
      secondary: "跳过引导 / 自己操作",
    },
    contentFlow: {
      pattern: "示例引导 -> 分步完成 -> 开放工作台 -> 保存导出",
      browsePattern: "引导用步骤条，完成后平滑过渡到全功能面板",
      proofPosition: "示例结果即证明",
    },
    componentPatterns: {
      navigation: "toolbar-with-help",
      hero: "guided-walkthrough-panel",
      controls: "split-workbench",
      finalAction: "save-export-actions",
    },
    layoutDecisions: {
      userChooses: ["是否选择引导示例变体"],
      aiCompletes: ["引导步数", "示例预填内容", "跳过逻辑"],
    },
  },
  "info-compare-scenario-matrix": {
    pageFrame: {
      navigation: "顶部导航，场景/对比/FAQ",
      shell: "场景矩阵主导的长页",
      footer: "保障与咨询收束",
    },
    firstScreen: {
      layout: "场景问题 + 矩阵预览",
      priority: "场景对号入座",
      secondary: "方案列标题与推荐角标",
    },
    contentFlow: {
      pattern: "场景 -> 矩阵 -> 推荐 -> FAQ",
      browsePattern: "矩阵维度少，按场景行组织",
      proofPosition: "推荐理由写在矩阵单元格内",
    },
    componentPatterns: {
      navigation: "top-nav",
      hero: "scenario-matrix-hero",
      comparison: "scenario-matrix-table",
      guide: "recommendation-path",
      finalAction: "choose-or-consult-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择场景矩阵变体"],
      aiCompletes: ["场景行数", "方案列数", "推荐标签样式"],
    },
  },
  "info-event-agenda-first": {
    pageFrame: {
      navigation: "活动锚点导航，议程/亮点/报名",
      shell: "议程时间线主导",
      footer: "报名与 FAQ",
    },
    firstScreen: {
      layout: "议程时间线 + 活动标题信息条",
      priority: "时间与议程块先可见",
      secondary: "主题、地点、报名按钮",
    },
    contentFlow: {
      pattern: "议程 -> 价值亮点 -> 地点名额 -> 报名 FAQ",
      browsePattern: "议程用垂直时间线，嘉宾穿插在议程节点",
      proofPosition: "嘉宾/往届证明嵌在议程中后段",
    },
    componentPatterns: {
      navigation: "event-agenda-nav",
      hero: "agenda-timeline-hero",
      schedule: "vertical-agenda",
      finalAction: "registration-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择议程先行变体"],
      aiCompletes: ["议程粒度", "时间线样式", "报名按钮位置"],
    },
  },
  "info-price-package-value-before-price": {
    pageFrame: {
      navigation: "顶部导航，价值/价格/FAQ",
      shell: "价值解释段 + 定价段",
      footer: "保障与咨询",
    },
    firstScreen: {
      layout: "价值成果卡 + 价格预告",
      priority: "各档价值与适合谁",
      secondary: "价格区间或「查看价格」入口",
    },
    contentFlow: {
      pattern: "价值 -> 适合人群 -> 价格卡 -> 权益保障 -> 行动",
      browsePattern: "价值用语义卡，价格区再展开完整套餐",
      proofPosition: "客户结果放在价值卡内",
    },
    componentPatterns: {
      navigation: "top-nav",
      hero: "value-outcome-hero",
      comparison: "pricing-cards",
      guide: "who-it-is-for-cards",
      finalAction: "plan-choice-band",
    },
    layoutDecisions: {
      userChooses: ["是否选择价值先行变体"],
      aiCompletes: ["价值卡数量", "价格出现滚动位置", "保障表达"],
    },
  },
};

const infoOptionPresets = [
  {
    id: "info-work-first-service",
    label: "先看作品，再了解服务",
    basedOnArchetype: "work-first",
    bestFor: ["视觉素材强", "用户先判断风格", "摄影/设计/空间/美食/艺术服务"],
    structure: ["代表作品", "风格分类", "精选案例", "服务流程", "价格或套餐", "客户评价", "预约咨询"],
    reason: "适合用户先判断风格是否匹配，再决定要不要了解流程和价格。",
    risk: "如果作品素材不够强，首屏说服力会不足。",
    requiredAssets: ["高质量作品图片", "作品分类", "服务流程", "客户评价"],
    previewStructure: { hero: "image-first", sectionCount: 7, density: "spacious", proofPosition: "after-works" },
    generationRules: ["作品模块必须前置", "服务说明放在作品之后", "文案不要压过图片", "预约入口要清楚但不抢作品"],
    forbiddenPatterns: ["generic-hero-cards-cta", "image-first-without-images"],
  },
  {
    id: "info-trust-first-service",
    label: "先证明可靠，再讲服务",
    basedOnArchetype: "trust-first",
    bestFor: ["高风险决策", "专业服务", "用户需要资质/流程/保障"],
    structure: ["明确定位", "关键可信证明", "服务说明", "流程与保障", "案例/评价", "FAQ", "咨询入口"],
    reason: "适合用户先担心靠不靠谱的场景，先降低风险，再引导咨询。",
    risk: "如果证明很多但价值不清，页面会显得沉重。",
    requiredAssets: ["资质或背景", "流程", "评价或案例", "保障说明"],
    previewStructure: { hero: "proof-first", sectionCount: 7, density: "balanced", proofPosition: "above-fold" },
    generationRules: ["首屏必须出现可信证明或明确背书", "流程和保障要在中段讲清楚", "避免促销式倒计时和夸张承诺"],
    forbiddenPatterns: ["ecommerce-promotion", "consulting-jargon"],
  },
  {
    id: "info-product-demo-first",
    label: "先看产品怎么工作",
    basedOnArchetype: "product-showcase",
    bestFor: ["SaaS", "AI 工具", "插件", "平台", "用户需要理解功能"],
    structure: ["产品界面或 demo", "核心使用场景", "功能分组", "工作流", "集成/生态", "案例证明", "试用入口"],
    reason: "适合复杂产品，用界面和流程让用户看懂价值。",
    risk: "如果没有真实截图或 demo，页面会显得空泛。",
    requiredAssets: ["产品截图", "demo 或 mockup", "功能列表", "使用场景"],
    previewStructure: { hero: "product-first", sectionCount: 7, density: "balanced", proofPosition: "after-demo" },
    generationRules: ["首屏必须展示产品界面或结果预览", "功能按使用场景分组", "避免只用抽象插画和口号"],
    forbiddenPatterns: ["tech-blue-purple", "generic-hero-cards-cta"],
  },
  {
    id: "info-clear-conversion-offer",
    label: "先讲清核心价值，再推动行动",
    basedOnArchetype: "clear-conversion",
    bestFor: ["预约", "报名", "咨询", "单一服务", "用户目标明确"],
    structure: ["一句话 offer", "核心收益", "适合人群", "服务/功能", "证明", "流程/价格", "FAQ", "行动入口"],
    reason: "适合用户已经有需求，只需要快速判断值不值得行动。",
    risk: "如果页面需要审美或品牌铺垫，太直接会显得销售感强。",
    requiredAssets: ["清楚 offer", "收益点", "行动入口", "基础证明"],
    previewStructure: { hero: "text-first", sectionCount: 8, density: "balanced", proofPosition: "mid-page" },
    generationRules: ["首屏要说清楚提供什么和下一步动作", "CTA 稳定出现但不要多个主按钮抢焦点", "FAQ 用来降低犹豫"],
    forbiddenPatterns: ["consulting-jargon", "too-many-visual-moves"],
  },
  {
    id: "info-editorial-thesis",
    label: "先讲观点，再带用户看下去",
    basedOnArchetype: "editorial-story",
    bestFor: ["内容产品", "品牌故事", "报告", "文化项目", "需要表达观点"],
    structure: ["核心观点", "背景/冲突", "分段论证", "案例或人物", "图文证据", "深入阅读/参与入口"],
    reason: "适合先建立理解和兴趣，而不是一上来推动购买。",
    risk: "如果用户只想快速预约或购买，叙事节奏可能偏慢。",
    requiredAssets: ["清楚观点", "故事素材", "图片或案例", "后续阅读入口"],
    previewStructure: { hero: "text-first", sectionCount: 6, density: "spacious", proofPosition: "through-story" },
    generationRules: ["首屏必须有明确观点", "模块顺序要像阅读路径", "不要把每一屏都做成营销卡片"],
    forbiddenPatterns: ["generic-hero-cards-cta", "consulting-jargon"],
  },
  {
    id: "info-content-hub-explore",
    label: "帮用户找到想看的内容",
    basedOnArchetype: "content-hub",
    bestFor: ["知识库", "案例库", "课程", "媒体", "资源集合"],
    structure: ["总入口", "推荐内容", "分类/搜索", "内容卡片", "专题集合", "订阅或行动入口"],
    reason: "适合内容量较多、用户目标不完全相同的页面。",
    risk: "如果内容量不足，入口型页面会显得空。",
    requiredAssets: ["内容列表", "分类", "摘要", "封面或标签"],
    previewStructure: { hero: "text-first", sectionCount: 6, density: "compact", proofPosition: "content-signals" },
    generationRules: ["分类必须按用户任务组织", "内容卡片信息要一致", "搜索/筛选入口要清楚"],
    forbiddenPatterns: ["generic-hero-cards-cta"],
  },
  {
    id: "info-tool-operate-preview",
    label: "让用户直接操作并看到结果",
    basedOnArchetype: "tool-operation",
    bestFor: ["生成器", "配置器", "插件", "后台", "分析工具"],
    structure: ["当前输入/状态", "主要操作区", "结果预览", "辅助设置", "历史/保存/导出"],
    reason: "适合工具型页面，重点是让用户快速完成任务并获得反馈。",
    risk: "如果首屏做成营销大标题，会压住真正操作。",
    requiredAssets: ["输入模型", "结果预览", "状态反馈", "保存或导出"],
    previewStructure: { hero: "product-first", sectionCount: 5, density: "compact", proofPosition: "result-preview" },
    generationRules: ["核心操作必须在首屏可见", "状态反馈要清楚", "营销文案不能占据工具首屏"],
    forbiddenPatterns: ["generic-hero-cards-cta", "too-many-visual-moves"],
  },
  {
    id: "info-compare-packages",
    label: "帮用户比较后做选择",
    basedOnArchetype: "comparison-decision",
    bestFor: ["价格套餐", "服务层级", "方案选择", "竞品对比"],
    structure: ["选择问题", "方案概览", "对比表", "适合人群", "推荐路径", "FAQ/保障", "行动入口"],
    reason: "适合用户不知道该选哪个，需要理解差异和适合场景。",
    risk: "如果对比维度太多，用户会更难做决定。",
    requiredAssets: ["方案列表", "差异点", "价格或权益", "适合人群"],
    previewStructure: { hero: "text-first", sectionCount: 7, density: "balanced", proofPosition: "comparison-table" },
    generationRules: ["每个方案要说明适合谁", "对比维度不要过多", "推荐方案必须有理由"],
    forbiddenPatterns: ["ecommerce-promotion", "consulting-jargon"],
  },
  {
    id: "info-event-participation",
    label: "讲清活动亮点和参与方式",
    basedOnArchetype: "community-event",
    bestFor: ["活动", "社群", "课程发布", "招募", "线下体验"],
    structure: ["活动主题", "亮点/收益", "时间地点/对象", "流程安排", "嘉宾/过往证明", "报名入口", "FAQ"],
    reason: "适合让用户快速理解活动值不值得参加，以及怎么参加。",
    risk: "如果只做氛围不讲清信息，会影响报名。",
    requiredAssets: ["时间地点", "流程", "嘉宾或过往照片", "报名方式"],
    previewStructure: { hero: "text-first", sectionCount: 7, density: "balanced", proofPosition: "mid-page" },
    generationRules: ["时间地点和报名入口必须清楚", "活动亮点不能只写情绪文案", "FAQ 处理常见顾虑"],
    forbiddenPatterns: ["too-many-visual-moves"],
  },
  {
    id: "info-price-package-clarity",
    label: "讲清价格、权益和保障",
    basedOnArchetype: "pricing-packages",
    bestFor: ["服务套餐", "订阅", "会员", "课程", "产品定价"],
    structure: ["定价说明", "套餐卡片", "适合人群", "权益对比", "保障/FAQ", "行动入口"],
    reason: "适合价格是主要决策点的页面，让用户知道每档为什么值得。",
    risk: "如果只列价格不讲价值，用户会只找最便宜的。",
    requiredAssets: ["价格", "权益", "适合人群", "保障条款"],
    previewStructure: { hero: "text-first", sectionCount: 6, density: "balanced", proofPosition: "after-pricing" },
    generationRules: ["套餐必须说明适合谁", "权益对比要清楚", "限制和保障不能隐藏"],
    forbiddenPatterns: ["ecommerce-promotion"],
  },
  {
    id: "info-work-first-story-gallery",
    label: "先看案例故事，再了解服务",
    basedOnArchetype: "work-first",
    variantOf: "info-work-first-service",
    bestFor: ["有完整项目故事", "用户需要理解交付结果", "摄影/设计/空间服务"],
    structure: ["案例故事", "代表画面", "作品分类", "服务流程", "客户评价", "预约咨询"],
    reason: "适合先用案例结果建立共鸣，再让用户看作品细节和服务方式。",
    risk: "如果没有成体系的案例叙事，故事段会显得空。",
    requiredAssets: ["案例故事", "代表画面", "作品分类", "服务流程"],
    previewStructure: { hero: "story-first", sectionCount: 6, density: "spacious", proofPosition: "in-story" },
    generationRules: ["首屏必须是案例故事或结果摘要", "作品画廊放在故事之后", "避免只有图片没有叙事"],
    forbiddenPatterns: ["generic-hero-cards-cta", "image-first-without-images"],
    priority: 86,
  },
  {
    id: "info-trust-first-cases-before-proof",
    label: "先看案例结果，再核资质保障",
    basedOnArchetype: "trust-first",
    variantOf: "info-trust-first-service",
    bestFor: ["B2B 服务", "客户更信结果", "资质需要但不必首屏堆砌"],
    structure: ["客户案例结果", "服务范围", "资质认证", "流程保障", "FAQ", "咨询入口"],
    reason: "适合用案例结果先建立能力感，再用资质和流程做二次确认。",
    risk: "如果案例太少或不够具体，仍需前置更强资质。",
    requiredAssets: ["客户案例", "结果数据", "资质材料", "流程说明"],
    previewStructure: { hero: "case-first", sectionCount: 6, density: "balanced", proofPosition: "cases-then-credentials" },
    generationRules: ["案例结果必须首屏可见", "资质放在案例中后段", "流程和 FAQ 处理最后顾虑"],
    forbiddenPatterns: ["ecommerce-promotion", "consulting-jargon"],
    priority: 86,
  },
  {
    id: "info-product-demo-problem-solution",
    label: "先懂问题，再看方案和演示",
    basedOnArchetype: "product-showcase",
    variantOf: "info-product-demo-first",
    bestFor: ["用户痛点明确", "SaaS/AI 工具", "需要先对齐任务再看界面"],
    structure: ["痛点问题", "方案概述", "产品演示", "场景功能", "集成案例", "试用入口"],
    reason: "适合用户还不确定产品是否解决自己的问题，需要先对齐痛点再看 demo。",
    risk: "如果痛点写得太泛，会显得像营销套话。",
    requiredAssets: ["痛点描述", "方案摘要", "产品截图或 demo", "试用入口"],
    previewStructure: { hero: "problem-first", sectionCount: 6, density: "balanced", proofPosition: "after-demo" },
    generationRules: ["前两屏完成问题与方案对齐", "演示必须承接方案而非孤立截图", "避免跳过痛点直接堆功能"],
    forbiddenPatterns: ["tech-blue-purple", "generic-hero-cards-cta"],
    priority: 86,
  },
  {
    id: "info-clear-conversion-proof-before-offer",
    label: "先用证明打消顾虑，再讲清 offer",
    basedOnArchetype: "clear-conversion",
    variantOf: "info-clear-conversion-offer",
    bestFor: ["用户有顾虑", "预约/咨询转化", "需要社会证明再行动"],
    structure: ["评价/案例证明", "一句话 offer", "核心收益", "流程价格", "FAQ", "行动入口"],
    reason: "适合用户有兴趣但犹豫，先看到证明再理解 offer 更容易行动。",
    risk: "如果证明薄弱，前置反而会暴露短板。",
    requiredAssets: ["客户评价或案例", "清楚 offer", "行动入口", "FAQ"],
    previewStructure: { hero: "proof-first", sectionCount: 6, density: "balanced", proofPosition: "above-fold" },
    generationRules: ["证明区必须在 offer 之前", "offer 和 CTA 紧跟证明之后", "FAQ 处理最后犹豫"],
    forbiddenPatterns: ["consulting-jargon", "ecommerce-promotion"],
    priority: 86,
  },
  {
    id: "info-editorial-chapter-thread",
    label: "用章节线索带着读下去",
    basedOnArchetype: "editorial-story",
    variantOf: "info-editorial-thesis",
    bestFor: ["长文报告", "品牌白皮书", "需要跳读的长内容"],
    structure: ["章节导览", "核心观点", "分章论证", "图文证据", "延伸阅读"],
    reason: "适合内容较长、读者可能跳读的场景，用章节线索降低阅读成本。",
    risk: "如果内容很短，章节导览会显得多余。",
    requiredAssets: ["章节结构", "核心观点", "分段素材", "延伸阅读"],
    previewStructure: { hero: "chapter-index", sectionCount: 5, density: "spacious", proofPosition: "inline" },
    generationRules: ["必须有章节导览或阅读线索", "章节标题清楚可跳转", "避免把所有内容塞进首屏"],
    forbiddenPatterns: ["generic-hero-cards-cta"],
    priority: 86,
  },
  {
    id: "info-content-hub-task-lanes",
    label: "按任务分栏，快速找内容",
    basedOnArchetype: "content-hub",
    variantOf: "info-content-hub-explore",
    bestFor: ["知识库", "帮助中心", "用户按任务而非栏目找内容"],
    structure: ["任务车道", "车道推荐", "搜索浏览", "内容卡片", "订阅入口"],
    reason: "适合用户带着任务来，需要按「我要学什么/解决什么」找入口。",
    risk: "如果任务划分不清楚，车道反而增加认知负担。",
    requiredAssets: ["任务分类", "内容列表", "搜索", "推荐路径"],
    previewStructure: { hero: "task-lanes", sectionCount: 5, density: "compact", proofPosition: "lane-meta" },
    generationRules: ["首屏按任务组织入口", "每个车道有明确推荐", "保留全站搜索和浏览"],
    forbiddenPatterns: ["generic-hero-cards-cta"],
    priority: 86,
  },
  {
    id: "info-tool-operate-guided-walkthrough",
    label: "先跟着示例走一遍，再自己操作",
    basedOnArchetype: "tool-operation",
    variantOf: "info-tool-operate-preview",
    bestFor: ["新手工具", "配置器", "首次使用门槛高"],
    structure: ["示例引导", "分步操作", "结果预览", "历史保存", "导出同步"],
    reason: "适合首次使用门槛高的工具，用示例带走通再开放操作。",
    risk: "如果引导太长，老用户会觉得啰嗦。",
    requiredAssets: ["示例任务", "分步说明", "结果预览", "保存导出"],
    previewStructure: { hero: "guided-first", sectionCount: 5, density: "compact", proofPosition: "example-result" },
    generationRules: ["必须提供可完成的示例引导", "引导后可跳过并进入全功能", "状态反馈始终可见"],
    forbiddenPatterns: ["generic-hero-cards-cta", "too-many-visual-moves"],
    priority: 86,
  },
  {
    id: "info-compare-scenario-matrix",
    label: "按使用场景对照选方案",
    basedOnArchetype: "comparison-decision",
    variantOf: "info-compare-packages",
    bestFor: ["多场景选型", "SaaS 套餐", "用户不确定自己属于哪种情况"],
    structure: ["场景问题", "场景矩阵", "推荐路径", "FAQ保障", "行动入口"],
    reason: "适合用户需要先对号入座场景，再理解方案差异。",
    risk: "如果场景分得太细，矩阵会变复杂。",
    requiredAssets: ["场景列表", "方案差异", "推荐逻辑", "FAQ"],
    previewStructure: { hero: "scenario-first", sectionCount: 5, density: "balanced", proofPosition: "matrix" },
    generationRules: ["必须先定义场景问题", "矩阵维度少而清楚", "每个场景有推荐方案"],
    forbiddenPatterns: ["ecommerce-promotion", "consulting-jargon"],
    priority: 86,
  },
  {
    id: "info-event-agenda-first",
    label: "先看议程安排，再决定报名",
    basedOnArchetype: "community-event",
    variantOf: "info-event-participation",
    bestFor: ["会议", "工作坊", "用户关心时间安排"],
    structure: ["议程时间线", "活动亮点", "嘉宾证明", "地点名额", "报名FAQ"],
    reason: "适合用户先判断时间投入值不值得，议程清楚比氛围更重要。",
    risk: "如果议程未确定，时间线会显得不可靠。",
    requiredAssets: ["议程", "时间地点", "嘉宾或往届", "报名方式"],
    previewStructure: { hero: "agenda-first", sectionCount: 5, density: "balanced", proofPosition: "in-agenda" },
    generationRules: ["议程时间线首屏可见", "报名入口稳定重复", "亮点和嘉宾支撑议程价值"],
    forbiddenPatterns: ["too-many-visual-moves"],
    priority: 86,
  },
  {
    id: "info-price-package-value-before-price",
    label: "先讲清价值，再出价格",
    basedOnArchetype: "pricing-packages",
    variantOf: "info-price-package-clarity",
    bestFor: ["订阅/会员", "高感知价值服务", "用户容易只比价格"],
    structure: ["价值成果", "适合人群", "套餐价格", "权益对比", "保障FAQ", "行动入口"],
    reason: "适合需要先让用户理解每档解决什么问题，再看到价格。",
    risk: "如果价值描述太虚，会拖慢决策。",
    requiredAssets: ["价值说明", "适合人群", "价格权益", "保障条款"],
    previewStructure: { hero: "value-first", sectionCount: 6, density: "balanced", proofPosition: "in-value" },
    generationRules: ["价值与适合谁必须在价格卡之前", "价格区仍要清楚可比", "限制和保障不能隐藏"],
    forbiddenPatterns: ["ecommerce-promotion"],
    priority: 86,
  },
].map((item, index) => ({
  ...item,
  ...(infoArchitectureDetails[item.id] ?? {}),
  ...(layoutArchitectureDetails[item.id] ?? {}),
  type: "info-option-preset",
  title: item.label,
  userLabel: item.label,
  summary: item.reason,
  appliesWhen: item.bestFor,
  avoidWhen: [],
  rationale: item.reason,
  risks: [item.risk],
  tags: ["info-option-preset", item.basedOnArchetype, ...(item.variantOf ? [`variant:${item.variantOf}`] : []), ...item.bestFor],
  sourceRefs: ["internal/product-principles", "design-md/*", "ux-pro/landing.csv"],
  sourceTypes: ["internal-principle", "design-md", "ux-pro"],
  confidence: "high",
  priority: item.priority ?? 92 - Math.min(index, 9),
}));

const proofMaterials = [
  "真实作品", "产品截图", "视频 demo", "客户评价", "客户 Logo", "成功案例", "数据指标", "前后对比",
  "资质证书", "安全认证", "合规说明", "退款保障", "试用入口", "样例结果", "媒体报道", "专家背书",
  "团队背景", "方法论", "流程图", "交付清单", "价格透明", "FAQ", "过往活动照片", "参与人数",
  "社区反馈", "下载量", "评分", "合作伙伴", "集成列表", "开源仓库", "文档链接", "响应时间",
].map((title, index) => ({
  id: `proof-${slug(title) || index + 1}`,
  type: "proof-material",
  title,
  userLabel: title,
  summary: `${title}可以作为页面的可信证明或价值证明。`,
  appliesWhen: ["与用户担心的问题直接相关"],
  avoidWhen: ["无法真实提供或与页面任务无关"],
  rationale: "证明材料应该回答用户为什么相信，而不是作为装饰。",
  risks: ["虚假的证明材料会严重损害信任。"],
  tags: ["proof-material", title],
  sourceRefs: ["internal/manual-curation", "design-md/*", "ux-pro/ui-reasoning.csv"],
  sourceTypes: ["manual-curation", "design-md", "ux-pro"],
  confidence: "medium",
  priority: 72,
}));

const visualJudgments = [
  ["asset-first-restraint", "作品主导、文字克制", "让视觉资产成为第一说服力，减少文案和装饰干扰。", ["视觉素材强", "用户先判断审美", "作品本身最有说服力"], ["素材质量不足", "用户先关心安全或价格"], ["work-first"], ["work-proof"]],
  ["product-clarity-interface-first", "产品清晰、界面先行", "让用户通过界面、demo 和工作流看懂产品价值。", ["SaaS", "工具", "AI 产品", "插件"], ["没有产品截图", "功能还不成熟"], ["product-showcase"], ["product-proof", "experience-proof"]],
  ["trust-restraint-proof-first", "信任克制、证明前置", "用稳定视觉和明确证明降低风险感。", ["高风险", "高客单价", "专业服务"], ["低风险活动", "强娱乐体验"], ["trust-first"], ["trust-proof", "expertise-proof"]],
  ["editorial-reading-rhythm", "编辑叙事、阅读节奏", "通过版式、段落和图片节奏引导用户理解观点。", ["内容", "报告", "媒体", "文化项目"], ["快速购买场景"], ["editorial-story", "content-hub"], ["emotion-proof", "expertise-proof"]],
  ["warm-real-life", "温暖生活、真实亲近", "用真实场景和柔和视觉降低距离感。", ["生活方式", "亲子", "民宿", "美食", "本地服务"], ["需要严肃权威", "高精密工具"], ["work-first", "clear-conversion"], ["emotion-proof", "trust-proof"]],
  ["dark-gallery-premium", "暗场精品、聚光展示", "用暗色场景和聚光式构图营造沉浸与精品感。", ["艺术", "珠宝", "夜间氛围", "高品质作品"], ["亲和服务", "信息密度高"], ["work-first", "editorial-story"], ["work-proof", "emotion-proof"]],
  ["active-conversion-clear-action", "活力转化、行动明确", "用高可见行动入口和快节奏模块推动报名或购买。", ["活动", "课程", "消费品", "促销但不廉价"], ["用户明确不要促销感", "高信任采购"], ["clear-conversion", "community-event"], ["experience-proof", "emotion-proof"]],
  ["system-efficiency-clear-density", "系统效率、密度清晰", "在高密度信息中保持层级、控件和状态清楚。", ["后台", "插件", "工作台", "分析工具"], ["品牌展示页", "情绪型页面"], ["tool-operation"], ["efficiency-proof", "product-proof"]],
  ["technical-precision-structured-trust", "技术精密、结构可信", "用结构、网格、代码/数据细节表达复杂系统的可靠性。", ["开发者工具", "基础设施", "安全", "数据产品"], ["没有真实技术内容", "用户讨厌科技感"], ["product-showcase", "trust-first"], ["expertise-proof", "product-proof"]],
  ["friendly-low-pressure", "轻松友好、低压力引导", "用亲和色彩、清楚引导和低门槛行动减少用户压力。", ["教育", "新手工具", "社区", "入门产品"], ["奢华精品", "严肃合规"], ["clear-conversion", "community-event"], ["experience-proof", "trust-proof"]],
  ["single-signature-memory", "高识别表达、单点记忆", "把视觉冒险集中在一个记忆点，其它部分保持纪律。", ["品牌需要差异化", "活动", "创意项目"], ["信息复杂或信任风险高"], ["editorial-story", "community-event"], ["emotion-proof"]],
  ["immersive-scene-driven", "内容沉浸、场景驱动", "用完整场景、故事和空间感让用户进入体验。", ["旅游", "空间", "游戏", "艺术展", "体验型活动"], ["低素材", "强工具效率"], ["editorial-story", "work-first"], ["emotion-proof", "work-proof"]],
].map(([id, title, principle, appliesWhen, avoidWhen, relatedInfoArchetypes, supportedPersuasionMechanisms], index) => ({
  id,
  type: "visual-judgment",
  title,
  userLabel: title,
  summary: principle,
  appliesWhen,
  avoidWhen,
  rationale: principle,
  risks: avoidWhen.map((item) => `当${item}时，这个方向可能不适合。`),
  tags: ["visual-judgment", ...appliesWhen, ...relatedInfoArchetypes],
  sourceRefs: ["internal/product-principles", "design-md/*", "ux-pro/styles.csv"],
  sourceTypes: ["internal-principle", "design-md", "ux-pro"],
  confidence: "high",
  priority: 90 - index,
  principle,
  relatedInfoArchetypes,
  supportedPersuasionMechanisms,
  variantIds: [],
}));

const variantSpecs = [
  ["asset-first-restraint", "clean-white-gallery", "白底大图，作品先说话", "清爽、专业、客观", "#FAFAF8", "#1A1A1A", "#111111", "image-first", "minimal-frame", 4, "spacious"],
  ["asset-first-restraint", "warm-soft-gallery", "暖白留白，生活感作品", "亲近、自然、有温度", "#FBF6EF", "#3A312B", "#8A5A3C", "image-first", "soft-frame", 10, "spacious"],
  ["asset-first-restraint", "editorial-portfolio-grid", "杂志网格，精选作品", "编辑感、克制、有节奏", "#FFFFFF", "#111111", "#1F4E79", "image-first", "editorial-grid", 0, "balanced"],
  ["product-clarity-interface-first", "light-product-console", "浅色界面，产品居中", "清楚、稳定、易理解", "#F7F8FA", "#111827", "#2563EB", "product-first", "screen-card", 10, "balanced"],
  ["product-clarity-interface-first", "dark-product-stage", "深色舞台，界面发光", "专注、技术、沉浸", "#080A10", "#F8FAFC", "#7C9CFF", "product-first", "glow-screen", 12, "balanced"],
  ["product-clarity-interface-first", "demo-first-workflow", "先试 demo，再看功能", "直接、互动、低门槛", "#F8FAFC", "#0F172A", "#16A34A", "product-first", "interactive-demo", 8, "compact"],
  ["trust-restraint-proof-first", "institutional-light", "浅色可信，证明前置", "可靠、克制、清楚", "#F8FAFC", "#0F172A", "#0F766E", "proof-first", "hairline-cards", 6, "balanced"],
  ["trust-restraint-proof-first", "navy-authority", "深海军蓝，专业背书", "稳重、权威、低风险", "#07111F", "#F8FAFC", "#38BDF8", "proof-first", "structured-panels", 8, "balanced"],
  ["trust-restraint-proof-first", "calm-human-service", "柔和可信，服务亲和", "安心、温和、可信", "#F7F3EC", "#2F2A24", "#3B7A57", "proof-first", "soft-sections", 12, "spacious"],
  ["editorial-reading-rhythm", "broadsheet-editorial", "报刊版式，观点先行", "权威、阅读、锋利", "#FAFAF7", "#111111", "#B91C1C", "text-first", "hairline-editorial", 0, "compact"],
  ["editorial-reading-rhythm", "longform-calm", "长文留白，慢节奏阅读", "安静、深入、克制", "#FFFCF7", "#26221E", "#6D5D46", "text-first", "longform", 4, "spacious"],
  ["editorial-reading-rhythm", "visual-essay", "图文穿插，像专题文章", "叙事、层次、探索", "#FFFFFF", "#18181B", "#4F46E5", "image-first", "essay-layout", 6, "balanced"],
  ["warm-real-life", "cream-lifestyle", "奶油底色，真实生活", "温暖、亲近、轻松", "#FBF3E8", "#3B2F2A", "#C26A3D", "image-first", "soft-photo", 16, "spacious"],
  ["warm-real-life", "natural-green-service", "自然绿色，低压力服务", "自然、安心、健康", "#F4F8F1", "#1F2A1F", "#4F7D4A", "proof-first", "organic-cards", 14, "balanced"],
  ["warm-real-life", "human-story-cards", "人物故事，亲切卡片", "真实、有陪伴感", "#FFF8F1", "#332822", "#D97706", "text-first", "story-cards", 12, "balanced"],
  ["dark-gallery-premium", "dark-gallery-spotlight", "暗场画廊，聚光作品", "沉浸、精品、戏剧", "#080808", "#F5F5EF", "#C6A15B", "image-first", "spotlight", 2, "spacious"],
  ["dark-gallery-premium", "cinematic-black", "电影黑场，强氛围首屏", "高级、沉稳、场景感", "#050505", "#F4F1EA", "#BFA77A", "image-first", "cinematic", 0, "spacious"],
  ["dark-gallery-premium", "luxury-detail-closeup", "细节特写，低调金属", "精致、稀缺、克制", "#11100E", "#F8F3EA", "#9A7B4F", "image-first", "detail-crop", 6, "balanced"],
  ["active-conversion-clear-action", "bright-event-action", "明亮活动，行动突出", "活力、清楚、有冲劲", "#FFF7ED", "#1F2937", "#F97316", "text-first", "bold-blocks", 12, "balanced"],
  ["active-conversion-clear-action", "course-launch", "课程发布，权益清楚", "直接、可信、节奏快", "#F8FAFC", "#0F172A", "#7C3AED", "text-first", "benefit-cards", 10, "balanced"],
  ["active-conversion-clear-action", "consumer-offer-clean", "消费 offer，干净转化", "轻快、不廉价", "#FFFFFF", "#111827", "#E11D48", "text-first", "offer-band", 8, "compact"],
  ["system-efficiency-clear-density", "dense-workbench-light", "浅色工作台，密度清楚", "高效、清晰、可操作", "#F6F7F9", "#111827", "#2563EB", "product-first", "panel-grid", 6, "compact"],
  ["system-efficiency-clear-density", "dark-ops-dashboard", "深色监控台，状态优先", "专注、实时、稳定", "#060B12", "#E5EEF8", "#22C55E", "product-first", "status-panels", 8, "compact"],
  ["system-efficiency-clear-density", "plugin-compact-panel", "插件面板，控件优先", "紧凑、明确、低干扰", "#FFFFFF", "#111827", "#4F46E5", "product-first", "compact-controls", 6, "compact"],
  ["technical-precision-structured-trust", "structured-tech-light", "结构化技术白底", "精密、可信、工程感", "#F8FAFC", "#0F172A", "#0EA5E9", "product-first", "grid-lines", 4, "balanced"],
  ["technical-precision-structured-trust", "terminal-docs-dark", "终端暗色，文档清楚", "开发者、专注、专业", "#0B1020", "#E2E8F0", "#A3E635", "product-first", "code-panels", 6, "compact"],
  ["technical-precision-structured-trust", "data-infrastructure", "数据结构，可信系统", "严谨、复杂但清楚", "#F9FAFB", "#111827", "#4338CA", "proof-first", "data-cards", 8, "balanced"],
  ["friendly-low-pressure", "soft-onboarding", "柔和引导，低压力开始", "友好、轻松、不吓人", "#F7F5FF", "#242038", "#7C3AED", "text-first", "soft-steps", 14, "spacious"],
  ["friendly-low-pressure", "education-clear", "教育清晰，像老师讲解", "耐心、明确、可信", "#FFFDF5", "#24221F", "#2563EB", "text-first", "lesson-blocks", 10, "balanced"],
  ["friendly-low-pressure", "community-warm", "社群暖色，参与感强", "开放、亲近、有活力", "#FFF7ED", "#2A2018", "#EA580C", "text-first", "people-cards", 16, "balanced"],
  ["single-signature-memory", "one-bold-accent", "一个强记忆点，其它克制", "有识别度、不混乱", "#FFFFFF", "#111111", "#FF4D00", "text-first", "signature-accent", 6, "balanced"],
  ["single-signature-memory", "graphic-poster", "海报式首屏，强标题", "大胆、明确、可记住", "#F8F5EF", "#111111", "#0F62FE", "text-first", "poster-block", 0, "spacious"],
  ["single-signature-memory", "interactive-signature", "一个互动记忆点", "新鲜、可玩、有传播性", "#F8FAFC", "#0F172A", "#DB2777", "product-first", "interactive-object", 12, "balanced"],
  ["immersive-scene-driven", "full-bleed-scene", "全屏场景，先进入氛围", "沉浸、直观、有现场感", "#0D0D0D", "#F8F7F2", "#EAB308", "image-first", "full-bleed", 0, "spacious"],
  ["immersive-scene-driven", "travel-story", "旅行故事，分段进入", "向往、探索、叙事", "#F7EFE3", "#2D241F", "#0F766E", "image-first", "story-scroll", 10, "spacious"],
  ["immersive-scene-driven", "experience-map", "体验地图，路径感清楚", "探索、参与、空间感", "#F8FAFC", "#1E293B", "#2563EB", "image-first", "map-sections", 8, "balanced"],
];

const visualPresetCopy = {
  "asset-first-restraint": {
    reason: "适合用户先看作品风格是否匹配，视觉退后一点，让图片承担第一判断。",
    risk: "如果图片质量一般或数量不足，页面会显得单薄。",
  },
  "product-clarity-interface-first": {
    reason: "适合先让用户看懂产品怎么工作，用界面和流程代替空泛口号。",
    risk: "如果没有真实截图或 demo，需要先补足产品素材。",
  },
  "trust-restraint-proof-first": {
    reason: "适合需要先降低风险感的服务，把证明、流程和保障放在更显眼的位置。",
    risk: "如果证明很多但价值不清，页面会显得沉重。",
  },
  "editorial-reading-rhythm": {
    reason: "适合先讲观点或故事，用阅读节奏带用户继续看下去。",
    risk: "如果用户只想快速预约或购买，叙事节奏可能偏慢。",
  },
  "warm-real-life": {
    reason: "适合需要亲近感和真实感的服务，让页面更像生活场景而不是广告。",
    risk: "如果场景图太普通，容易变成泛泛的生活方式模板。",
  },
  "dark-gallery-premium": {
    reason: "适合强调作品细节和沉浸氛围，让图片像展览或精品陈列一样被观看。",
    risk: "如果品牌需要亲和感，暗场会带来距离感。",
  },
  "active-conversion-clear-action": {
    reason: "适合活动、课程或轻量服务，把行动入口和权益讲得更直接。",
    risk: "如果用户明确不要促销感，需要降低色彩和 CTA 强度。",
  },
  "system-efficiency-clear-density": {
    reason: "适合工具和工作台，让用户快速操作、看结果、理解状态。",
    risk: "如果信息密度过高，新手会觉得压迫。",
  },
  "technical-precision-structured-trust": {
    reason: "适合复杂技术或系统产品，用结构、界面和细节建立可信度。",
    risk: "如果没有真实技术内容支撑，会变成空泛科技感。",
  },
  "friendly-low-pressure": {
    reason: "适合面向新手或低门槛产品，用更温和的方式引导用户开始。",
    risk: "如果场景需要权威或精品感，可能显得不够有分量。",
  },
  "single-signature-memory": {
    reason: "适合需要被记住的品牌或活动，把大胆表达集中在一个清楚的记忆点。",
    risk: "如果记忆点太多，会分散注意力。",
  },
  "immersive-scene-driven": {
    reason: "适合体验、旅行、空间和活动，用场景先把用户带进去。",
    risk: "如果素材不够具体，会变成普通氛围页。",
  },
};

function visualExecutionDetails({ background, text, accent, imageTreatment, radiusPx, density }) {
  const spacing = density === "spacious" ? "大留白" : density === "compact" ? "紧凑留白" : "适中留白";
  const contentDensity = density === "spacious" ? "低内容密度" : density === "compact" ? "高信息密度但分组清楚" : "中等内容密度";
  const cardStyle = radiusPx <= 4 ? "弱边框、低阴影、直角或小圆角卡片" : radiusPx <= 10 ? "轻边框、柔和小圆角卡片" : "柔和圆角、轻背景分区卡片";
  const shadowLevel = density === "compact" ? "极轻阴影或无阴影，依靠边框分层" : radiusPx <= 4 ? "几乎无阴影" : "轻柔阴影";
  const buttonTone = radiusPx <= 4 ? "克制实心按钮，数量少" : "柔和圆角按钮，主次分明";
  const imageLabelByTreatment = {
    "minimal-frame": "大图优先，图片只加极轻边框",
    "soft-frame": "图片用柔和背景和小阴影承托",
    "editorial-grid": "图片按杂志网格排布",
    "screen-card": "产品截图放在清楚的界面卡片里",
    "glow-screen": "产品截图使用暗色承托和轻微发光",
    "interactive-demo": "把 demo/结果预览做成可操作面板",
    "hairline-cards": "证明材料用细线卡片表达",
    "structured-panels": "证明和数据用稳定面板表达",
    "soft-sections": "服务说明用柔和分区表达",
    "hairline-editorial": "文字和图片用细线分隔",
    longform: "图片少量穿插，文字节奏优先",
    "essay-layout": "图文穿插，图片作为论证证据",
    "soft-photo": "照片真实、柔和、生活化",
    "organic-cards": "图片和卡片更自然，少硬边框",
    "story-cards": "人物或故事卡片承接内容",
    spotlight: "图片像展览陈列，背景退后",
    cinematic: "图片大、暗场、强场景",
    "detail-crop": "用局部特写表达质感",
    "bold-blocks": "图片/色块更直接，行动入口明显",
    "benefit-cards": "收益点用清楚卡片承接",
    "offer-band": "offer 和行动入口做成清楚横向区",
    "panel-grid": "信息用面板网格组织",
    "status-panels": "状态和数据优先，面板分区清楚",
    "compact-controls": "控件紧凑，减少装饰",
    "grid-lines": "使用细网格和结构线表达技术感",
    "code-panels": "代码/终端面板作为真实内容承载",
    "data-cards": "数据卡片和结构关系优先",
    "soft-steps": "步骤用柔和卡片承接",
    "lesson-blocks": "内容像课程讲解一样分块",
    "people-cards": "人物/社群卡片更亲近",
    "signature-accent": "一个强强调点，其余克制",
    "poster-block": "大标题和几何块形成记忆点",
    "interactive-object": "一个互动对象作为记忆点",
    "full-bleed": "场景图片尽量满幅呈现",
    "story-scroll": "图片跟随故事分段出现",
    "map-sections": "用路径/地图式区块表达体验",
  };

  return {
    previewTemplate:
      density === "compact" ? "compact-panel-preview" : imageTreatment.includes("grid") ? "gallery-grid-preview" : "page-slice-preview",
    visualTokens: {
      color: { background, text, accent, surface: "#FFFFFF" },
      radius: { card: `${radiusPx}px`, button: `${Math.max(4, radiusPx)}px`, image: `${radiusPx}px` },
      spacing: { density, label: spacing },
      card: { style: cardStyle, shadow: shadowLevel },
      button: { tone: buttonTone },
      image: { treatment: imageLabelByTreatment[imageTreatment] ?? imageTreatment },
    },
    implicitDecisions: {
      留白: spacing,
      内容密度: contentDensity,
      图片处理: imageLabelByTreatment[imageTreatment] ?? imageTreatment,
      卡片样式: cardStyle,
      阴影层级: shadowLevel,
      按钮语气: buttonTone,
    },
  };
}

const visualVariants = variantSpecs.map(
  ([judgmentId, id, name, feeling, background, text, accent, hero, imageTreatment, radiusPx, density], index) => {
    const execution = visualExecutionDetails({ background, text, accent, imageTreatment, radiusPx, density });
    return {
      id,
      type: "visual-variant",
      judgmentId,
      title: name,
      userLabel: name,
      plainName: name,
      summary: `${name}：${feeling}。`,
      appliesWhen: visualJudgments.find((item) => item.id === judgmentId)?.appliesWhen ?? [],
      avoidWhen: visualJudgments.find((item) => item.id === judgmentId)?.avoidWhen ?? [],
      rationale: "这个变体把视觉判断落成具体颜色、字体、留白、图片处理和组件样式，方便用户预览和后续生成。",
      risks: visualJudgments.find((item) => item.id === judgmentId)?.risks ?? [],
      tags: ["visual-variant", judgmentId, feeling, hero, density],
      sourceRefs: ["internal/manual-curation", "design-md/*", "ux-pro/styles.csv", "ux-pro/colors.csv", "ux-pro/typography.csv"],
      sourceTypes: ["manual-curation", "design-md", "ux-pro"],
      confidence: "medium",
      priority: 84 - Math.floor(index / 3),
      bestFor: visualJudgments.find((item) => item.id === judgmentId)?.appliesWhen ?? [],
      feeling,
      color: `背景 ${background}，正文 ${text}，强调色 ${accent}。`,
      font: density === "compact" ? "清晰无衬线，正文优先可读，数字和标签保持稳定。" : "标题有明确性格，但正文保持舒适易读。",
      layout: "视觉只负责表达已选页面架构，不改变首屏重心和模块顺序。",
      radius: radiusPx <= 2 ? "直角或极小圆角" : radiusPx <= 8 ? "小圆角" : "中等到偏大的柔和圆角",
      imagery: execution.visualTokens.image.treatment,
      reason: visualPresetCopy[judgmentId]?.reason ?? "适合把当前视觉判断落成更具体、可预览的页面方向。",
      risk: visualPresetCopy[judgmentId]?.risk ?? "如果用户素材、语气或目标与适用条件不符，需要选择其他变体或调整。",
      previewRules: {
        background,
        text,
        accent,
        density,
        hero,
        imageTreatment,
        radiusPx,
        cardStyle: radiusPx <= 4 ? "flat-hairline" : "soft-card",
        buttonStyle: radiusPx <= 4 ? "compact-solid" : "rounded-solid",
        typeScale: density === "compact" ? "functional" : "expressive",
        implicitDecisions: execution.implicitDecisions,
      },
      generationRules: [
        `整体使用 ${background} 作为主背景，${text} 作为正文色，${accent} 作为主要行动或重点色。`,
        "视觉方案不得改变 selectedInfoArchitecture 规定的首屏重心、模块顺序和页面骨架。",
        `图片/产品处理方式：${execution.implicitDecisions.图片处理}。`,
        `自动补齐视觉细节：${Object.entries(execution.implicitDecisions).map(([key, value]) => `${key}=${value}`).join("；")}。`,
        `整体密度为 ${density}，圆角约 ${radiusPx}px。`,
      ],
      forbiddenPatterns: ["无依据改成蓝紫科技渐变", "多个高饱和强调色互相争抢", "忽略用户明确反向要求", "用视觉方案覆盖已选信息组织"],
      requiredElements: [],
      previewTemplate: execution.previewTemplate,
      implicitDecisions: execution.implicitDecisions,
      visualTokens: execution.visualTokens,
      tokenHints: { background, text, accent, radiusPx, ...execution.visualTokens },
    };
  },
);

for (const judgment of visualJudgments) {
  judgment.variantIds = visualVariants.filter((variant) => variant.judgmentId === judgment.id).map((variant) => variant.id);
}

const visualOptionPresets = visualVariants.map((variant) => ({
  id: `visual-${variant.id}`,
  type: "visual-option-preset",
  title: variant.title,
  label: variant.title,
  userLabel: variant.title,
  basedOnJudgment: variant.judgmentId,
  summary: variant.reason,
  appliesWhen: variant.bestFor,
  avoidWhen: variant.avoidWhen,
  rationale: variant.reason,
  risks: [variant.risk],
  tags: ["visual-option-preset", variant.judgmentId, ...(variant.tags ?? [])],
  sourceRefs: variant.sourceRefs,
  sourceTypes: variant.sourceTypes,
  confidence: variant.confidence,
  priority: variant.priority,
  bestFor: variant.bestFor,
  color: variant.color,
  font: variant.font,
  layout: variant.layout,
  radius: variant.radius,
  imagery: variant.imagery,
  reason: variant.reason,
  risk: variant.risk,
  previewRules: variant.previewRules,
  generationRules: variant.generationRules,
  forbiddenPatterns: variant.forbiddenPatterns,
  requiredElements: variant.requiredElements,
  previewTemplate: variant.previewTemplate,
  implicitDecisions: variant.implicitDecisions,
  visualTokens: variant.visualTokens,
  tokenHints: variant.tokenHints,
}));

const compositionMap = [
  ["info-work-first-service", ["visual-clean-white-gallery", "visual-warm-soft-gallery", "visual-editorial-portfolio-grid", "visual-dark-gallery-spotlight"], ["visual-dense-workbench-light", "visual-dark-ops-dashboard", "visual-plugin-compact-panel"], "作品先行的信息结构需要让图片成为第一判断，工具工作台或数据密集视觉会冲突。"],
  ["info-trust-first-service", ["visual-institutional-light", "visual-navy-authority", "visual-calm-human-service"], ["visual-bright-event-action", "visual-graphic-poster", "visual-interactive-signature"], "信任优先需要稳定和证明，过度活动化或强记忆点会削弱可靠感。"],
  ["info-product-demo-first", ["visual-light-product-console", "visual-dark-product-stage", "visual-demo-first-workflow", "visual-structured-tech-light"], ["visual-cream-lifestyle", "visual-dark-gallery-spotlight"], "产品展示要突出界面、demo 或工作流，生活方式和画廊视觉容易偏离产品解释。"],
  ["info-clear-conversion-offer", ["visual-bright-event-action", "visual-consumer-offer-clean", "visual-soft-onboarding"], ["visual-broadsheet-editorial", "visual-cinematic-black"], "清晰转化需要行动入口和利益点清楚，过慢叙事或暗场氛围会拖慢行动。"],
  ["info-editorial-thesis", ["visual-broadsheet-editorial", "visual-longform-calm", "visual-visual-essay"], ["visual-dense-workbench-light", "visual-bright-event-action"], "叙事编辑需要阅读节奏，工具密度和强转化视觉会打断阅读。"],
  ["info-content-hub-explore", ["visual-broadsheet-editorial", "visual-visual-essay", "visual-education-clear"], ["visual-dark-gallery-spotlight", "visual-full-bleed-scene"], "内容入口需要分类、卡片和可读性，过强沉浸视觉会影响查找。"],
  ["info-tool-operate-preview", ["visual-dense-workbench-light", "visual-plugin-compact-panel", "visual-demo-first-workflow", "visual-dark-ops-dashboard"], ["visual-cream-lifestyle", "visual-cinematic-black"], "工具操作需要控件、状态和结果预览稳定，氛围型视觉会干扰效率。"],
  ["info-compare-packages", ["visual-institutional-light", "visual-consumer-offer-clean", "visual-course-launch"], ["visual-full-bleed-scene", "visual-dark-gallery-spotlight"], "比较决策需要表格、卡片和层级清楚，不适合过强沉浸或画廊视觉。"],
  ["info-event-participation", ["visual-bright-event-action", "visual-course-launch", "visual-community-warm", "visual-graphic-poster"], ["visual-dense-workbench-light"], "活动页面需要亮点和报名路径明确，工作台视觉会显得不合语境。"],
  ["info-price-package-clarity", ["visual-consumer-offer-clean", "visual-course-launch", "visual-institutional-light"], ["visual-full-bleed-scene", "visual-cinematic-black"], "价格套餐需要权益和限制清楚，沉浸氛围会遮住决策信息。"],
  ["info-work-first-story-gallery", ["visual-clean-white-gallery", "visual-warm-soft-gallery", "visual-editorial-portfolio-grid"], ["visual-dense-workbench-light", "visual-dark-ops-dashboard"], "案例叙事先行仍需要图片承托，工作台视觉会破坏故事节奏。"],
  ["info-trust-first-cases-before-proof", ["visual-institutional-light", "visual-calm-human-service", "visual-navy-authority"], ["visual-bright-event-action", "visual-graphic-poster"], "案例先行仍属信任路径，需要稳定克制，不宜强促销视觉。"],
  ["info-product-demo-problem-solution", ["visual-light-product-console", "visual-demo-first-workflow", "visual-structured-tech-light"], ["visual-cream-lifestyle", "visual-dark-gallery-spotlight"], "问题驱动演示仍需界面和工作流清楚，氛围型视觉会冲淡逻辑。"],
  ["info-clear-conversion-proof-before-offer", ["visual-institutional-light", "visual-consumer-offer-clean", "visual-soft-onboarding"], ["visual-broadsheet-editorial", "visual-cinematic-black"], "证明前置转化需要可信与行动平衡，慢叙事视觉会拖慢节奏。"],
  ["info-editorial-chapter-thread", ["visual-broadsheet-editorial", "visual-longform-calm", "visual-visual-essay"], ["visual-dense-workbench-light", "visual-bright-event-action"], "章节线索叙事需要阅读节奏，工具密度和强转化会打断阅读。"],
  ["info-content-hub-task-lanes", ["visual-education-clear", "visual-dense-workbench-light", "visual-broadsheet-editorial"], ["visual-dark-gallery-spotlight", "visual-full-bleed-scene"], "任务分栏入口需要清楚车道和卡片，沉浸视觉影响查找。"],
  ["info-tool-operate-guided-walkthrough", ["visual-soft-onboarding", "visual-dense-workbench-light", "visual-plugin-compact-panel"], ["visual-cream-lifestyle", "visual-cinematic-black"], "引导式工具需要步骤与面板清楚，氛围视觉干扰操作。"],
  ["info-compare-scenario-matrix", ["visual-institutional-light", "visual-structured-tech-light", "visual-consumer-offer-clean"], ["visual-full-bleed-scene", "visual-dark-gallery-spotlight"], "场景矩阵需要表格层级清楚，沉浸或画廊视觉不利对照。"],
  ["info-event-agenda-first", ["visual-bright-event-action", "visual-course-launch", "visual-dense-workbench-light"], ["visual-plugin-compact-panel"], "议程先行活动页需要时间与信息密度清楚，过强工具面板视觉不合语境。"],
  ["info-price-package-value-before-price", ["visual-institutional-light", "visual-consumer-offer-clean", "visual-course-launch"], ["visual-full-bleed-scene", "visual-cinematic-black"], "价值先行定价仍需权益清楚，沉浸氛围会遮住价值与价格关系。"],
];

const optionCompositionRules = compositionMap.map(([infoPresetId, recommendedVisualPresets, avoidVisualPresets, reason], index) => ({
  id: `compose-${infoPresetId}`,
  type: "option-composition-rule",
  title: `${infoPresetId} 组合规则`,
  userLabel: "信息方案与视觉方案组合规则",
  summary: reason,
  appliesWhen: [infoPresetId],
  avoidWhen: avoidVisualPresets,
  rationale: reason,
  risks: ["如果忽略组合规则，信息结构和视觉方向可能互相打架。"],
  tags: ["option-composition-rule", infoPresetId],
  sourceRefs: ["internal/product-principles", "design-md/*"],
  sourceTypes: ["internal-principle", "design-md"],
  confidence: "high",
  priority: 90 - index,
  infoPresetId,
  recommendedVisualPresets,
  avoidVisualPresets,
  reason,
}));

function transformUxQualityRules() {
  const ux = readCsv("ux-guidelines");
  const app = readCsv("app-interface");
  return [...ux, ...app].map((row, index) => ({
    id: `ux-${slug(row.Category)}-${slug(row.Issue)}-${index + 1}`,
    type: "ux-quality-rule",
    title: row.Issue || `UX Rule ${index + 1}`,
    userLabel: row.Issue || `UX Rule ${index + 1}`,
    summary: row.Description || "",
    appliesWhen: [row.Platform || "All", row.Category || "UX"],
    avoidWhen: [],
    rationale: row.Do || row.Description || "",
    risks: row["Don't"] ? [row["Don't"]] : [],
    tags: ["ux-quality", row.Category, row.Platform, row.Severity].filter(Boolean),
    sourceRefs: [`ux-pro/${index < ux.length ? "ux-guidelines.csv" : "app-interface.csv"}`],
    sourceTypes: ["ux-pro"],
    confidence: "high",
    priority: row.Severity?.toLowerCase() === "high" ? 88 : row.Severity?.toLowerCase() === "medium" ? 76 : 64,
    category: row.Category,
    platform: row.Platform,
    do: row.Do,
    dont: row["Don't"],
    goodExample: row["Code Example Good"],
    badExample: row["Code Example Bad"],
    severity: row.Severity,
  }));
}

function selectUxQualityRules(uxQualityRules) {
  const usefulCategories = [
    "Accessibility",
    "Layout",
    "Responsive",
    "Typography",
    "Color",
    "Forms",
    "Feedback",
    "Navigation",
    "Performance",
    "Animation",
    "Interaction",
    "Content",
  ];
  const selected = uxQualityRules.filter((rule) => {
    const severity = String(rule.severity ?? "").toLowerCase();
    const category = String(rule.category ?? "");
    const title = String(rule.title ?? "");
    return (
      severity === "high" ||
      usefulCategories.some((item) => category.includes(item) || title.includes(item))
    );
  });

  const seen = new Set();
  return selected
    .filter((rule) => {
      const key = `${rule.category}-${rule.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 80)
    .map((rule) => ({
      ...rule,
      runtimeDefault: true,
      tags: [...new Set([...(rule.tags ?? []), "runtime-selected"])],
    }));
}

function transformStylePrimitives() {
  const colors = readCsv("colors").map((row, index) => ({
    id: `palette-${slug(row["Product Type"]) || index + 1}`,
    type: "color-palette",
    title: row["Product Type"],
    userLabel: row.Notes || row["Product Type"],
    summary: row.Notes || "",
    appliesWhen: [row["Product Type"], row.Notes].filter(Boolean),
    avoidWhen: [],
    rationale: row.Notes || "UX-PRO 中的可访问 token 建议。",
    risks: ["不要仅因行业匹配就直接使用，应结合用户约束和页面任务。"],
    tags: ["style-primitive", "color", row["Product Type"]].filter(Boolean),
    sourceRefs: ["ux-pro/colors.csv"],
    sourceTypes: ["ux-pro"],
    confidence: "medium",
    priority: 52,
    tokens: {
      primary: row.Primary,
      onPrimary: row["On Primary"],
      secondary: row.Secondary,
      accent: row.Accent,
      background: row.Background,
      foreground: row.Foreground,
      card: row.Card,
      border: row.Border,
      destructive: row.Destructive,
      ring: row.Ring,
    },
  }));

  const typography = readCsv("typography").map((row, index) => ({
    id: `type-${slug(row["Font Pairing Name"]) || index + 1}`,
    type: "typography-pairing",
    title: row["Font Pairing Name"],
    userLabel: row["Font Pairing Name"],
    summary: row.Notes || row["Mood/Style Keywords"] || "",
    appliesWhen: splitList(`${row["Mood/Style Keywords"]}, ${row["Best For"]}`),
    avoidWhen: [],
    rationale: row.Notes || "UX-PRO 中的字体搭配建议。",
    risks: ["需要检查中文字体 fallback 和加载性能。"],
    tags: ["style-primitive", "typography", row.Category].filter(Boolean),
    sourceRefs: ["ux-pro/typography.csv"],
    sourceTypes: ["ux-pro"],
    confidence: "medium",
    priority: 54,
    headingFont: row["Heading Font"],
    bodyFont: row["Body Font"],
    cssImport: row["CSS Import"],
    googleFontsUrl: row["Google Fonts URL"],
  }));

  const styles = readCsv("styles").map((row, index) => ({
    id: `style-${slug(row["Style Category"]) || index + 1}`,
    type: "style-primitive",
    title: row["Style Category"],
    userLabel: row["Style Category"],
    summary: row["AI Prompt Keywords"] || row.Keywords || "",
    appliesWhen: splitList(row["Best For"]),
    avoidWhen: splitList(row["Do Not Use For"]),
    rationale: row["AI Prompt Keywords"] || row.Keywords || "",
    risks: row["Do Not Use For"] ? [`不适合：${row["Do Not Use For"]}`] : [],
    tags: ["style-primitive", "style", row.Type, row.Complexity].filter(Boolean),
    sourceRefs: ["ux-pro/styles.csv"],
    sourceTypes: ["ux-pro"],
    confidence: "medium",
    priority: 50,
    keywords: row.Keywords,
    primaryColors: row["Primary Colors"],
    secondaryColors: row["Secondary Colors"],
    effects: row["Effects & Animation"],
    implementationChecklist: row["Implementation Checklist"],
    designSystemVariables: row["Design System Variables"],
  }));

  return { colors, typography, styles };
}

function transformAntiPatterns() {
  const manual = [
    ["generic-hero-cards-cta", "所有需求都 hero + 三卡片 + CTA", "把所有页面都套成同一种落地页结构。", "当用户输入很少且页面任务就是快速转化时可以作为候选，但必须说明理由。", "根据页面任务选择信任、作品、产品、叙事或内容入口结构。", "high"],
    ["tech-blue-purple", "科技 = 蓝紫渐变", "用颜色刻板印象代替产品、技术或结构证明。", "用户明确要求未来感且有真实技术/产品内容支撑时可谨慎使用。", "用产品界面、数据结构、代码/流程和克制强调色表达技术可信。", "high"],
    ["premium-black-gold", "高端 = 黑金", "把高级感简化为黑底金色，容易廉价和同质化。", "珠宝、夜场、奢华活动等确实需要暗场精品时可以使用。", "从素材、留白、字体、服务流程和细节表达品质。", "high"],
    ["ecommerce-promotion", "电商 = 大促销", "默认用促销色、倒计时和大折扣，会压低品牌和信任。", "用户明确做促销活动或清仓页面时可用。", "先判断是品牌展示、产品目录、购买决策还是促销转化。", "high"],
    ["visual-as-color-test", "视觉推荐像配色题", "只让用户选颜色字体圆角，缺少设计意图和适用条件。", "作为高级微调可以出现。", "先给具体视觉方案，再允许微调 token。", "high"],
    ["brand-copycat", "像某品牌", "直接模仿品牌外观，而不是抽象背后的判断逻辑。", "用户提供自己的品牌系统时可沿用自己的规范。", "提取案例模式，不暴露品牌仿制。", "high"],
    ["consulting-jargon", "咨询腔解释", "用抽象术语让新手无法判断方案差异。", "用户要求专业报告时可展开。", "用短句说明依据、解决的问题和风险。", "medium"],
    ["image-first-without-images", "没有好图还强推大图", "忽略素材条件会导致生成页面空或假。", "可以用结构化占位说明需要补图，但不能当最终强方案。", "选择文字/证明/流程更强的方案，或提示用户需要图片。", "high"],
    ["dark-dashboard-for-professional", "专业 = 深色仪表盘", "把专业感等同于深色和数据面板。", "监控、开发、数据密集场景可用。", "根据用户风险和信息密度决定，而不是默认深色。", "medium"],
    ["too-many-visual-moves", "每个地方都想出彩", "视觉记忆点太多会分散注意力。", "实验艺术项目可接受更高复杂度。", "把大胆用在一个地方，其它保持纪律。", "medium"],
  ].map(([id, title, whyBad, allowedWhen, saferAlternative, severity]) => ({
    id,
    type: "anti-pattern",
    title,
    userLabel: title,
    summary: whyBad,
    appliesWhen: ["检测推荐和生成结果"],
    avoidWhen: [],
    rationale: whyBad,
    risks: [whyBad],
    tags: ["anti-pattern", severity],
    sourceRefs: ["internal/product-principles"],
    sourceTypes: ["internal-principle"],
    confidence: "high",
    priority: severity === "high" ? 95 : 75,
    trigger: title,
    whyBad,
    allowedWhen,
    saferAlternative,
    severity,
  }));

  const seen = new Set();
  return manual.filter((item) => {
    const key = `${item.title}-${item.trigger}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function transformUxProAutoAntiPatterns() {
  const reasoning = readCsv("ui-reasoning").flatMap((row, index) =>
    splitList(row.Anti_Patterns).map((item, antiIndex) => ({
      id: `uxpro-reasoning-${index + 1}-${antiIndex + 1}-${slug(item)}`,
      type: "material-anti-pattern",
      title: item,
      summary: `${row.UI_Category} 中 UX-PRO 标记的反模式：${item}`,
      appliesWhen: [row.UI_Category, row.Recommended_Pattern].filter(Boolean),
      sourceRefs: ["ux-pro/ui-reasoning.csv"],
      sourceTypes: ["ux-pro"],
      trigger: row.UI_Category,
      whyBad: item,
      saferAlternative: row.Decision_Rules || row.Recommended_Pattern,
      severity: row.Severity || "medium",
      runtimeDefault: false,
    })),
  );

  const styleAvoid = readCsv("styles")
    .filter((row) => row["Do Not Use For"])
    .map((row, index) => ({
      id: `style-avoid-${index + 1}-${slug(row["Style Category"])}`,
      type: "material-anti-pattern",
      title: `误用 ${row["Style Category"]}`,
      summary: `不要在 ${row["Do Not Use For"]} 中使用 ${row["Style Category"]}。`,
      appliesWhen: splitList(row["Do Not Use For"]),
      sourceRefs: ["ux-pro/styles.csv"],
      sourceTypes: ["ux-pro"],
      trigger: row["Style Category"],
      whyBad: row["Do Not Use For"],
      saferAlternative: "根据页面任务和说服机制选择视觉判断，再选择具体视觉变体。",
      severity: "medium",
      runtimeDefault: false,
    }));

  return [...reasoning, ...styleAvoid];
}

function buildCasePatterns() {
  const dirs = fs.existsSync(DESIGN_MD)
    ? fs.readdirSync(DESIGN_MD, { withFileTypes: true }).filter((item) => item.isDirectory())
    : [];

  return dirs
    .map((dir) => {
      const file = path.join(DESIGN_MD, dir.name, "DESIGN.md");
      if (!fs.existsSync(file)) return null;
      const text = readText(file);
      const overview = extractSection(text, "Overview");
      const colors = extractSection(text, "Colors");
      const typography = extractSection(text, "Typography");
      const layout = extractSection(text, "Layout");
      const components = extractSection(text, "Components");
      const donts = extractDonts(text);
      const source = `design-md/${dir.name}`;
      const combined = `${overview}\n${layout}\n${components}`;
      const usefulFor = [];
      if (/product|screenshot|interface|dashboard|SaaS|tool|developer/i.test(combined)) usefulFor.push("产品展示", "工具/SaaS");
      if (/photo|image|gallery|portfolio|editorial|hero/i.test(combined)) usefulFor.push("作品/图片先行");
      if (/trust|security|enterprise|finance|compliance|proof/i.test(combined)) usefulFor.push("信任优先");
      if (/article|magazine|editorial|reading|content/i.test(combined)) usefulFor.push("编辑叙事");
      if (usefulFor.length === 0) usefulFor.push("品牌表达", "视觉参考");

      return {
        id: `case-${slug(dir.name)}`,
        type: "case-pattern",
        title: `${usefulFor[0]}案例模式`,
        userLabel: `${usefulFor[0]}案例模式`,
        userVisible: false,
        summary: firstSentences(overview || combined, 320),
        appliesWhen: usefulFor,
        avoidWhen: ["不要作为品牌仿制选项直接暴露给用户"],
        rationale: "从 design-md 案例中抽取信息组织、视觉语言和反模式，作为 AI 判断参考。",
        risks: ["如果直接模仿品牌外观，会偏离产品原则。"],
        tags: ["case-pattern", dir.name, ...usefulFor],
        sourceRefs: [source],
        sourceTypes: ["design-md"],
        confidence: "medium",
        priority: 68,
        source,
        sourceType: "brand-case",
        extractedPattern: firstSentences(overview || combined, 420),
        notBrandImitation: true,
        usefulFor,
        informationPattern: [
          firstSentences(layout, 260),
          firstSentences(components, 220),
        ].filter(Boolean),
        visualPattern: [
          firstSentences(colors, 220),
          firstSentences(typography, 220),
          firstSentences(overview, 220),
        ].filter(Boolean),
        antiPatterns: donts,
      };
    })
    .filter(Boolean);
}

function buildCasePatternSummaries(casePatterns) {
  return casePatterns.map((item) => ({
    id: `${item.id}-summary`,
    type: "case-pattern-summary",
    title: item.title,
    userLabel: item.userLabel,
    summary: item.summary,
    appliesWhen: item.appliesWhen,
    avoidWhen: item.avoidWhen,
    rationale: item.rationale,
    risks: item.risks,
    tags: [...new Set([...(item.tags ?? []), "summary-only"])],
    sourceRefs: item.sourceRefs,
    sourceTypes: item.sourceTypes,
    confidence: item.confidence,
    priority: Math.min(item.priority ?? 60, 70),
    usefulFor: item.usefulFor,
    notBrandImitation: true,
    userVisible: false,
  }));
}

function buildChecklists(uxQualityRules) {
  const criticalUx = uxQualityRules
    .filter((item) => /high/i.test(item.severity ?? ""))
    .slice(0, 40)
    .map((item) => item.title);
  return [
    {
      id: "pre-recommendation",
      type: "checklist",
      title: "推荐前检查",
      summary: "确保 AI 推荐不是模板匹配，而是基于用户输入和设计判断。",
      items: [
        "是否识别了用户明确要求和反向偏好？",
        "是否判断了谁在看、要弄明白什么、凭什么相信？",
        "是否避免把行业当第一判断依据？",
        "三个方案是否真的不同？",
        "每个方案是否有短理由和风险？",
        "视觉方案是否具体到颜色、字体、布局和图片方式？",
        "是否避免品牌仿制？",
      ],
      sourceRefs: ["internal/product-principles"],
      sourceTypes: ["internal-principle"],
    },
    {
      id: "pre-generation",
      type: "checklist",
      title: "生成前检查",
      summary: "确保用户选择已经编译成结构化生成约束。",
      items: [
        "是否存在 selectedInfoPlanId？",
        "是否存在 selectedVisualVariantId？",
        "是否有 previewRules？",
        "是否有 generationRules？",
        "是否有 forbiddenPatterns？",
        "用户微调是否写入 userOverrides？",
        "素材缺失是否被记录？",
      ],
      sourceRefs: ["internal/product-principles"],
      sourceTypes: ["internal-principle"],
    },
    {
      id: "post-generation",
      type: "checklist",
      title: "生成后检查",
      summary: "确保最终页面和用户选择保持一致，并满足基本 UX 质量。",
      items: [
        "模块顺序是否符合信息方案？",
        "首屏是否符合视觉变体？",
        "颜色、字体、圆角是否符合 previewRules？",
        "是否触发 forbiddenPatterns？",
        "是否保留用户明确约束？",
        ...criticalUx,
      ],
      sourceRefs: ["internal/product-principles", "ux-pro/ux-guidelines.csv", "ux-pro/app-interface.csv"],
      sourceTypes: ["internal-principle", "ux-pro"],
    },
  ];
}

function buildSchemas() {
  const base = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required: ["id", "type", "title", "summary", "appliesWhen", "avoidWhen", "rationale", "risks", "tags", "sourceRefs", "sourceTypes", "confidence", "priority"],
    properties: {
      id: { type: "string" },
      type: { type: "string" },
      title: { type: "string" },
      userLabel: { type: "string" },
      summary: { type: "string" },
      appliesWhen: { type: "array", items: { type: "string" } },
      avoidWhen: { type: "array", items: { type: "string" } },
      rationale: { type: "string" },
      risks: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      sourceRefs: { type: "array", items: { type: "string" } },
      sourceTypes: { type: "array", items: { type: "string" } },
      confidence: { enum: ["low", "medium", "high"] },
      priority: { type: "number" },
    },
  };
  return {
    "principle.schema.json": { ...base, title: "Design Principle" },
    "info-archetype.schema.json": { ...base, title: "Information Archetype" },
    "info-option-preset.schema.json": { ...base, title: "Information Option Preset" },
    "visual-judgment.schema.json": { ...base, title: "Visual Judgment" },
    "visual-variant.schema.json": { ...base, title: "Visual Variant" },
    "visual-option-preset.schema.json": { ...base, title: "Visual Option Preset" },
    "option-composition-rule.schema.json": { ...base, title: "Option Composition Rule" },
    "anti-pattern.schema.json": { ...base, title: "Anti Pattern" },
    "case-pattern.schema.json": { ...base, title: "Case Pattern" },
    "runtime-result.schema.json": {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "Runtime Design Reference Result",
      type: "object",
      required: ["queryUnderstanding", "principles", "infoPlanCandidates", "visualVariantCandidates", "antiPatterns", "checklist"],
      properties: {
        queryUnderstanding: { type: "object" },
        principles: { type: "array" },
        infoPlanCandidates: { type: "array" },
        visualJudgmentCandidates: { type: "array" },
        visualVariantCandidates: { type: "array" },
        antiPatterns: { type: "array" },
        checklist: { type: "array" },
      },
    },
  };
}

function buildRuntimeIndex(files) {
  const entries = [];
  for (const [collection, items] of Object.entries(files)) {
    for (const item of items) {
      if (!item?.id) continue;
      entries.push({
        id: item.id,
        type: item.type,
        collection,
        title: item.title,
        userLabel: item.userLabel,
        summary: item.summary,
        tags: item.tags ?? [],
        appliesWhen: item.appliesWhen ?? [],
        avoidWhen: item.avoidWhen ?? [],
        sourceRefs: item.sourceRefs ?? [],
        confidence: item.confidence ?? "medium",
        priority: item.priority ?? 50,
        searchText: [
          item.title,
          item.userLabel,
          item.summary,
          item.rationale,
          item.pageArchitecture,
          item.layoutRhythm,
          ...(item.decisionPath ?? []),
          ...(item.sections ?? []).flatMap((section) => [section.role, section.layout, section.content, section.why]),
          ...(item.tags ?? []),
          ...(item.appliesWhen ?? []),
          ...(item.avoidWhen ?? []),
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
  }
  return entries.sort((left, right) => right.priority - left.priority);
}

function buildEvals() {
  const prompts = [
    ["tech-no-purple", "做一个科技产品官网，但不要蓝紫渐变，也不要发光球体", ["不要蓝紫渐变", "不要发光球体"], ["tech-blue-purple"], ["product-showcase", "trust-first"], ["product-clarity-interface-first", "technical-precision-structured-trust"]],
    ["premium-no-black-gold", "做一个高端品牌网站，但不要黑金，想要更克制更现代", ["不要黑金"], ["premium-black-gold"], ["work-first", "editorial-story"], ["asset-first-restraint", "single-signature-memory"]],
    ["pet-photo-not-cute", "做宠物摄影网站，但不要可爱，想像艺术展一样安静，有纪实感", ["不要可爱", "艺术展", "纪实"], ["generic-hero-cards-cta"], ["work-first", "editorial-story"], ["asset-first-restraint", "dark-gallery-premium"]],
    ["ecommerce-no-promo", "做电商页面，但不要大促销感，想突出产品质感和品牌信任", ["不要大促销"], ["ecommerce-promotion"], ["product-showcase", "trust-first"], ["asset-first-restraint", "trust-restraint-proof-first"]],
    ["ai-tool-no-orbs", "做 AI 工具首页，但不要蓝紫发光和抽象球体，要清楚展示怎么用", ["不要蓝紫发光", "不要抽象球体"], ["tech-blue-purple"], ["product-showcase", "tool-operation"], ["product-clarity-interface-first", "system-efficiency-clear-density"]],
    ["medical-warm", "做医疗咨询网站，希望亲和一点，不要医院感太强", ["亲和", "不要医院感太强"], ["dark-dashboard-for-professional"], ["trust-first", "clear-conversion"], ["trust-restraint-proof-first", "warm-real-life"]],
    ["law-not-oppressive", "做律师网站，但不要严肃压迫，希望专业但容易接近", ["不要严肃压迫"], ["consulting-jargon"], ["trust-first"], ["trust-restraint-proof-first", "friendly-low-pressure"]],
    ["kids-education-not-childish", "做儿童教育网站，但不要幼稚卡通，要让家长觉得可靠", ["不要幼稚卡通", "家长可靠"], ["visual-as-color-test"], ["trust-first", "clear-conversion"], ["friendly-low-pressure", "trust-restraint-proof-first"]],
    ["saas-no-generic", "做 SaaS 官网，但不要 hero 加三卡片加 CTA 那种模板", ["不要 hero + 三卡片 + CTA"], ["generic-hero-cards-cta"], ["product-showcase", "comparison-decision"], ["product-clarity-interface-first"]],
    ["portfolio-weak-images", "做作品集，但图片素材一般，不想页面显得空", ["图片素材一般", "不要显得空"], ["image-first-without-images"], ["editorial-story", "trust-first"], ["editorial-reading-rhythm", "trust-restraint-proof-first"]],
    ["restaurant-premium-warm", "做餐厅网站，想高级但有烟火气，不要冷冰冰", ["高级", "有烟火气", "不要冷冰冰"], ["premium-black-gold"], ["work-first", "clear-conversion"], ["warm-real-life", "asset-first-restraint"]],
    ["plugin-tool-compact", "做 MasterGo 插件界面，用户要快速生成并同步画布", ["插件", "快速生成", "同步画布"], ["generic-hero-cards-cta"], ["tool-operation"], ["system-efficiency-clear-density"]],
    ["consulting-no-corporate", "做咨询公司网站，但不要传统企业蓝白模板，要讲清方法和案例", ["不要传统企业蓝白模板"], ["tech-blue-purple", "consulting-jargon"], ["trust-first", "editorial-story"], ["trust-restraint-proof-first", "editorial-reading-rhythm"]],
    ["travel-not-stock", "做旅行体验页面，不想要普通风景图堆砌，要有路线和故事", ["不要普通风景图堆砌", "路线和故事"], ["generic-hero-cards-cta"], ["editorial-story", "community-event"], ["immersive-scene-driven", "editorial-reading-rhythm"]],
    ["finance-friendly", "做个人理财工具，想可信但不要金融机构那种冷硬感", ["可信", "不要冷硬"], ["dark-dashboard-for-professional"], ["trust-first", "product-showcase"], ["trust-restraint-proof-first", "friendly-low-pressure"]],
    ["course-clear", "做线上课程落地页，想清楚说明适合谁和能学到什么，不要太鸡血", ["不要太鸡血"], ["active-conversion-clear-action"], ["clear-conversion", "pricing-packages"], ["friendly-low-pressure", "trust-restraint-proof-first"]],
    ["fashion-not-template", "做服装品牌首页，想有记忆点，但不要像普通电商列表", ["有记忆点", "不要普通电商列表"], ["ecommerce-promotion"], ["work-first", "editorial-story"], ["single-signature-memory", "asset-first-restraint"]],
    ["dashboard-human", "做数据看板，但给非专业用户用，不要密密麻麻", ["非专业用户", "不要密密麻麻"], ["dark-dashboard-for-professional"], ["tool-operation"], ["system-efficiency-clear-density", "friendly-low-pressure"]],
    ["local-service-trust", "做本地家政服务页面，想让人放心预约，不要廉价广告感", ["放心", "不要廉价广告感"], ["ecommerce-promotion"], ["trust-first", "clear-conversion"], ["trust-restraint-proof-first", "warm-real-life"]],
    ["art-event-info", "做艺术展活动页，要有氛围，但时间地点票务必须清楚", ["有氛围", "信息清楚"], ["too-many-visual-moves"], ["community-event", "editorial-story"], ["immersive-scene-driven", "dark-gallery-premium"]],
    ["developer-docs", "做开发者工具文档首页，重点是快速理解和开始，不要营销感", ["快速开始", "不要营销感"], ["generic-hero-cards-cta"], ["product-showcase", "content-hub"], ["technical-precision-structured-trust", "system-efficiency-clear-density"]],
    ["beauty-not-pink", "做美容服务网站，但不要粉色少女感，要干净可信", ["不要粉色少女感", "干净可信"], ["visual-as-color-test"], ["trust-first", "work-first"], ["trust-restraint-proof-first", "asset-first-restraint"]],
    ["nonprofit-clarity", "做公益组织网站，要说明问题和行动方式，不要煽情过度", ["不要煽情过度"], ["consulting-jargon"], ["editorial-story", "clear-conversion"], ["editorial-reading-rhythm", "trust-restraint-proof-first"]],
    ["startup-bold-but-clear", "做创业项目官网，希望有一点大胆，但不能影响理解", ["大胆", "不能影响理解"], ["too-many-visual-moves"], ["product-showcase", "clear-conversion"], ["single-signature-memory", "product-clarity-interface-first"]],
    ["real-estate-no-luxury-cliche", "做房产项目页，不要豪宅黑金套路，要讲清位置、户型和生活方式", ["不要豪宅黑金", "位置户型生活方式"], ["premium-black-gold"], ["work-first", "comparison-decision"], ["warm-real-life", "asset-first-restraint"]],
    ["music-artist", "做音乐人主页，想有个性但不要乱，作品试听要突出", ["有个性", "不要乱", "试听突出"], ["too-many-visual-moves"], ["work-first", "editorial-story"], ["single-signature-memory", "immersive-scene-driven"]],
    ["b2b-service-roi", "做 B2B 服务网站，客户关心 ROI 和案例，不要空泛品牌词", ["ROI", "案例", "不要空泛"], ["consulting-jargon"], ["trust-first", "comparison-decision"], ["trust-restraint-proof-first", "technical-precision-structured-trust"]],
    ["recipe-content", "做菜谱内容站，用户要快速找菜谱，也想被图片吸引", ["快速找菜谱", "图片吸引"], ["image-first-without-images"], ["content-hub", "work-first"], ["warm-real-life", "asset-first-restraint"]],
    ["mental-health-soft", "做心理咨询网站，要温和可信，不要医疗机构感，也不要鸡汤", ["温和可信", "不要医疗机构感", "不要鸡汤"], ["consulting-jargon"], ["trust-first", "clear-conversion"], ["friendly-low-pressure", "trust-restraint-proof-first"]],
    ["ai-design-tool", "做 AI 设计工具首页，要解释流程和最终效果，别只说智能生成", ["解释流程", "最终效果", "别只说智能生成"], ["tech-blue-purple"], ["product-showcase", "tool-operation"], ["product-clarity-interface-first", "system-efficiency-clear-density"]],
    ["corporate-brand-not-sales", "做科技公司企业官网，让第一次来访的人知道我们是谁、做什么，不是推具体套餐成交", ["认识品牌", "不是推套餐"], ["generic-hero-cards-cta", "ecommerce-promotion"], ["trust-first", "editorial-story", "product-showcase"], ["trust-restraint-proof-first", "editorial-reading-rhythm"], { disallowedInfoDirections: ["clear-conversion", "pricing-packages"], minDistinctInfoDirections: 2 }],
    ["b2b-implementation-trust", "做 B2B 软件实施服务网站，客户要先确认资质、交付案例和流程才敢联系", ["资质", "交付案例", "流程"], ["consulting-jargon"], ["trust-first", "comparison-decision"], ["trust-restraint-proof-first", "technical-precision-structured-trust"], { disallowedInfoDirections: ["work-first", "content-hub", "community-event"], minDistinctInfoDirections: 2 }],
    ["saas-demo-vs-interactive", "做 SaaS 数据分析工具首页，有人只想看懂怎么用，有人希望直接在页面上试一两步", ["看懂怎么用", "页面上试"], ["generic-hero-cards-cta"], ["product-showcase", "tool-operation"], ["product-clarity-interface-first", "system-efficiency-clear-density"], { minDistinctInfoDirections: 2, mustIncludeInfoDirections: ["product-showcase", "tool-operation"] }],
    ["saas-tier-compare", "做 SaaS 订阅官网，有三个档位，用户主要在犹豫选 Professional 还是 Enterprise", ["三个档位", "犹豫选择"], ["generic-hero-cards-cta"], ["comparison-decision", "pricing-packages"], ["product-clarity-interface-first", "system-efficiency-clear-density"], { disallowedInfoDirections: ["work-first", "editorial-story"], minDistinctInfoDirections: 2, mustIncludeInfoDirections: ["comparison-decision", "pricing-packages"] }],
    ["single-service-pricing", "做一对一咨询教练落地页，就一个服务和明码标价，用户只差要不要预约", ["一个服务", "明码标价", "预约"], ["ecommerce-promotion"], ["clear-conversion", "pricing-packages"], ["friendly-low-pressure", "trust-restraint-proof-first"], { disallowedInfoDirections: ["comparison-decision", "content-hub"], minDistinctInfoDirections: 2 }],
  ];
  return {
    prompts: prompts.map((entry) => {
      const [id, prompt, constraints, avoidAntiPatterns, infoDirections, visualDirections, extra = {}] = entry;
      return {
        id,
        prompt,
        expected: {
          constraints,
          avoidAntiPatterns,
          allowedInfoDirections: infoDirections,
          allowedVisualDirections: visualDirections,
          shouldNotContain: ["高级现代但无理由", "符合行业调性", "像 Apple", "像 Stripe", "像 Linear"],
          ...extra,
        },
      };
    }),
    expectedBehaviors: {
      optionCount: "每类推荐默认 2-3 个，方案之间必须有明显策略差异。",
      planDifferentiation: "三个信息组织方案必须对应不同 archetype 或明显不同的 layoutRhythm / 首屏策略，禁止三张卡仅换措辞。",
      distinctnessChecks: "易混淆输入（企业官网 vs B2B 服务、产品演示 vs 可操作工具、套餐对比 vs 单一价格）必须用 evals/prompts.json 中带 minDistinctInfoDirections 的用例回归。",
      explanation: "每个方案必须有一句短理由和一句风险。",
      userConstraints: "用户明确不要的元素必须进入 negativePreferences 或 forbiddenPatterns。",
      visualConsistency: "视觉方案必须能编译为 previewRules 和 generationRules。",
    },
  };
}

function buildManifest(counts) {
  return {
    name: "design-judgment-reference-library",
    version: LIB_VERSION,
    description: "设计判断参考库：UX-PRO 提供材料和结构，design-md 提供案例抽象，我们自己的设计哲学决定判断逻辑。",
    generatedAt: new Date().toISOString(),
    sources: [
      { id: "internal-product-principles", type: "internal-principle", role: "highest-priority-judgment", path: "docs/design-philosophy-core.md" },
      { id: "design-md", type: "case-source", role: "case-abstraction", path: "design-md/**/DESIGN.md" },
      { id: "ui-ux-pro-max", type: "external-skill", role: "structure-quality-primitives", path: "ui-ux-pro-max-skill-main", license: "MIT" },
    ],
    priorityOrder: [
      "user explicit requirements",
      "user freeform constraints",
      "product principles",
      "page task",
      "persuasion mechanism",
      "curated reference library",
      "case similarity",
      "industry defaults",
    ],
    counts,
  };
}

function buildReadme(counts) {
  return `# Design Judgment Reference Library

这个库是给 AI 调用的设计判断参考库，不是行业模板库、品牌模仿库或纯风格选择器。

核心原则：

- UX-PRO 提供材料和结构。
- design-md 提供案例抽象。
- 我们自己的设计哲学决定判断逻辑。

## 三层结构

\`\`\`text
raw/      原始来源登记，不直接给产品调用
curated/  人工策展后的判断知识
runtime/  AI 实际调用的精简索引和编译结果
\`\`\`

## 当前规模

${Object.entries(counts)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join("\n")}

## 调用方式

1. 先理解用户输入：谁在看、要弄明白什么、凭什么相信。
2. 再检索 runtime 索引。
3. 生成三问候选、信息组织方案、视觉方案卡片。
4. 用户选择后编译为 previewRules + generationRules。
5. 生成后用 checklists 和 anti-patterns 验证。

产品不能直接把 raw source 全塞给模型。
`;
}

function buildReadmeV2(counts) {
  return `# Design Judgment Reference Library

这个库是给 AI 调用的设计判断参考库，不是行业模板库、品牌模仿库或纯风格选择器。

核心原则：

- UX-PRO 提供材料、质量检查和结构参考，不默认主导推荐。
- design-md 提供案例抽象，不暴露成“像某品牌”的用户选项。
- 我们自己的设计哲学决定判断逻辑：先帮用户做判断，再考虑视觉表达。

## 四层结构

\`\`\`text
raw/       来源登记和追溯说明，不直接给产品运行时调用
materials/ UX-PRO 全量材料和 Design.md 完整案例抽象，供研究和二次策展
curated/   人工确认后的判断知识、信息 preset、视觉 preset 和组合规则
runtime/   AI 主推荐默认调用的干净集合
\`\`\`

## Runtime 默认集合

runtime 只包含：

- principles
- intent-judgment
- persuasion-mechanisms
- info-option-presets
- visual-option-presets
- option-composition-rules
- anti-patterns
- checklists
- selected ux-quality-rules
- case-pattern-summaries

UX-PRO 的全量规则、自动反模式、样式原子和完整案例材料都在 \`materials/\`，不能默认塞进主推荐。

## 当前规模

${Object.entries(counts)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join("\n")}

## 调用方式

1. 先理解用户输入：谁在看、要弄明白什么、凭什么相信。
2. 从 runtime 取信息方案 preset、视觉方案 preset 和组合规则。
3. 默认生成 2-3 个真的不同的用户可见选项，每个选项包含短理由和风险。
4. 用户选择后，把选项 ID、previewRules、generationRules、forbiddenPatterns 写入生成约束。
5. 生成后用 checklists 和 core anti-patterns 验证是否偏离选择结果。

更完整的结构说明和接入建议见 \`MAP.md\`。
`;
}

function buildMap() {
  return `# Design Reference Map

这份文档解释 \`design-reference/\` 这个库到底包含什么、它们之间是什么关系、运行时怎么调用，以及以后接进当前代码时要注意什么。

## 一句话理解

这个库不是模板库，也不是行业知识库。它更像一个“设计判断引擎”的参考系统：

- \`materials/\` 是参考材料池。
- \`curated/\` 是人工整理后的判断知识。
- \`runtime/\` 是 AI 主推荐默认读取的干净工作集。
- \`evals/\` 和 \`schemas/\` 是防止库退化的验证层。

真正给用户出选项时，核心不是“行业匹配”，而是：

1. 判断用户想解决什么问题。
2. 选择合适的信息组织低保真。
3. 为这个低保真匹配合适的视觉表达。
4. 给出短理由和风险。
5. 把用户选择编译成生成约束。

## 目录关系

\`\`\`text
design-reference/
  raw/
    sources.json                来源登记，不给产品运行时直接用
    notes.md

  materials/
    ux-pro/                     UX-PRO 全量材料池
      *.json                    从 CSV 转出的原始参考材料
      style-primitives.json      色彩/字体/风格原子，不能默认主导推荐
      ux-quality-rules.full.json 全量 UX 检查项
      auto-anti-patterns.json    UX-PRO 自动反模式，只做材料，不进主推荐
    design-md/
      case-patterns.full.json    Design.md 案例完整抽象

  curated/
    principles.json              我们相信的设计原则
    intent-judgment.json         设计意图判断依据
    persuasion-mechanisms.json   页面为什么能说服用户
    info-option-presets.json     信息组织低保真，也就是页面架构方案
    visual-option-presets.json   可视化和生成用的视觉方案
    option-composition-rules.json 信息架构和视觉方案的搭配规则
    anti-patterns.json           核心反模式
    ux-quality-rules.json        精选 UX 质量规则
    case-pattern-summaries.json  Design.md 案例摘要，只做参考，不做品牌模仿
    其他文件                     中间知识层，供维护和扩展

  runtime/
    design-reference.compiled.json AI 默认调用的主文件
    design-reference.index.json    简化检索索引
    retrieval-tags.json            tag 到条目的反查

  schemas/
    *.schema.json               结构约束

  evals/
    prompts.json                回归提示词
    expected-behaviors.json     期望行为
    regressions.md              回归说明
\`\`\`

## 核心文件怎么分工

### 1. principles

这是最高优先级的判断原则。它回答“我们为什么不做行业模板库、不做风格选择器、不做品牌模仿”。

接入代码时，它适合放进 system prompt 或推荐前检查里，不适合直接展示给用户。

### 2. intent-judgment

这是需求理解层。它帮助 AI 判断：

- 谁在看？
- 用户要先明白什么？
- 用户凭什么相信？
- 当前页面更像作品判断、信任判断、产品理解、内容阅读，还是操作任务？

接入代码时，它应该影响 brief/intent 阶段，而不是最后生成阶段才临时补救。

### 3. persuasion-mechanisms

这是“为什么这个页面能说服用户”的机制层，例如作品证明、产品证明、信任证明、效率证明。

它不是单独给用户选的主选项，更适合作为 info preset 和 visual preset 的解释依据。

### 4. info-option-presets

这是最重要的产品选项层之一。它不是模块列表，而是页面低保真架构。

每个 info preset 都包含：

- \`label\`：用户看到的名称。
- \`bestFor\`：适用条件。
- \`pageArchitecture\`：这个页面骨架是什么。
- \`aboveFold\`：首屏怎么分区，主信息、辅助信息、证明、行动入口各放哪里。
- \`sections\`：页面后续区块，每段的角色、布局、内容和原因。
- \`layoutRhythm\`：页面展开节奏。
- \`decisionPath\`：用户一路怎么判断。
- \`previewWireframe\`：前端画低保真预览用。
- \`generationRules\`：生成 HTML 时必须遵守的结构约束。
- \`forbiddenPatterns\`：不能触发的反模式。

它决定“页面骨架”，不是决定颜色字体。

### 5. visual-option-presets

这是另一个用户可见选项层。它决定同一个页面骨架可以长成什么样。

每个 visual preset 都包含：

- \`label\`：用户看到的视觉方向。
- \`color\`、\`font\`、\`layout\`、\`imagery\`：能被小白理解的具象描述。
- \`previewRules\`：前端画视觉预览用。
- \`generationRules\`：生成 HTML 时必须遵守的视觉约束。
- \`tokenHints\`：可转成 CSS token 的提示。
- \`forbiddenPatterns\`：不要跑偏的地方。

它决定“表达方式”，不是决定页面信息顺序。

### 6. option-composition-rules

这是 info preset 和 visual preset 的搭配层。它防止信息结构和视觉方向打架。

例如：

- 作品先行型适合白底大图、暗场画廊、温暖生活感。
- 作品先行型不适合工具工作台、数据密集面板。
- 工具操作型适合工作台、插件面板、demo workflow。
- 工具操作型不适合沉浸大片和生活方式视觉。

接入代码时，不应该让模型随便把任意 info 和 visual 组合在一起，要先用 composition rules 缩小候选集。

### 7. anti-patterns

这是刹车层，保留我们最在意的核心问题：

- 科技 = 蓝紫渐变
- 高端 = 黑金
- 电商 = 大促销
- 所有页面 hero + 三卡片 + CTA
- 没有好图还强推大图
- 视觉选项像配色题

接入代码时，它应该出现在推荐检查和生成后检查里。

## 推荐时怎么调用

推荐流程建议是：

\`\`\`text
用户输入
  ↓
brief / intent 阶段
  读取 principles + intent-judgment
  输出：页面任务、用户约束、负向偏好、素材条件
  ↓
信息组织推荐
  读取 info-option-presets
  输出：2-3 个页面低保真方案
  ↓
视觉推荐
  根据已选或候选 info preset
  读取 option-composition-rules + visual-option-presets
  输出：每个信息方案可搭配的视觉方案
  ↓
用户选择
  保存 selectedInfoPresetId + selectedVisualPresetId + userOverrides
  ↓
生成
  合并 info.generationRules + visual.generationRules + forbiddenPatterns
  输出页面 HTML
  ↓
检查
  用 anti-patterns + checklists 验证是否跑偏
\`\`\`

## 代码接入时读哪个文件

默认只读：

\`\`\`text
design-reference/runtime/design-reference.compiled.json
\`\`\`

不要在产品主流程里直接读：

\`\`\`text
design-reference/materials/**
design-reference/raw/**
\`\`\`

原因：

- \`materials/\` 很大，且包含未经人工确认的 UX-PRO 自动规则。
- \`raw/\` 只是来源登记。
- 主推荐如果直接读材料池，会重新出现怪规则和行业套路。

## 当前项目接入会不会有问题

会有几个需要处理的点，但不是不能接。

### 问题 1：现在代码还是旧的“行业 catalog + 视觉四维度”

当前代码里有两套旧结构：

- \`src/ai/catalogs.ts\`：行业和视觉选项 catalog。
- \`src/ai/visualSpecs.ts\`：按 color/font/radius/icon 四个维度生成 CSS token。

新库的结构是：

- info preset：页面低保真架构。
- visual preset：整体视觉方案。
- composition rule：二者搭配规则。

所以不能直接把新 JSON 塞进旧 UI。需要一个 adapter。

建议第一步不要删旧 catalog，而是新增：

\`\`\`text
src/ai/designReference.ts
\`\`\`

这个 adapter 负责：

- 读取 runtime compiled。
- 提供 \`getInfoPresets()\`。
- 提供 \`getVisualPresetsForInfo(infoPresetId)\`。
- 提供 \`compileGenerationConstraints(infoPresetId, visualPresetId, userOverrides)\`。

### 问题 2：前端不能直接用 Node fs 读 repo 文件

如果是在浏览器里跑，不能用 \`fs.readFileSync\` 读 \`design-reference/runtime/*.json\`。

可选方案：

1. Vite 直接 import JSON。

   适合现在本地前端项目。runtime 只有 255 条，体积可控。

2. 构建时复制 runtime JSON 到 \`public/data/design-reference.compiled.json\`，前端 fetch。

   更适合以后部署，也方便动态更新。

3. 后端/API 读取 runtime，再给前端返回候选。

   更适合将来有服务端、权限、模型调用和多版本库管理的情况。

不建议把 \`materials/\` 打进前端包。

### 问题 3：prompt 需要从“选视觉维度”改成“选方案 ID”

现在机制阶段要求 AI 输出 color/font/radius/icon 的 optionId。

新方式应该让 AI 输出：

\`\`\`json
{
  "infoCandidates": [
    {
      "infoPresetId": "info-product-demo-first",
      "reason": "适合先让用户看懂产品怎么工作。",
      "risk": "如果没有真实截图，页面会显得空。"
    }
  ],
  "visualCandidates": [
    {
      "visualPresetId": "visual-light-product-console",
      "pairedWithInfoPresetId": "info-product-demo-first",
      "reason": "界面先行，能承接产品 demo 的信息架构。"
    }
  ]
}
\`\`\`

也就是说，模型输出要变成“引用库里的 ID”，而不是自由发挥一套视觉词。

### 问题 4：生成阶段必须拿到同一组 ID

为了保证最后生成和用户选择一致，生成 brief 里必须包含：

- \`selectedInfoPresetId\`
- \`selectedVisualPresetId\`
- \`info.pageArchitecture\`
- \`info.aboveFold\`
- \`info.sections\`
- \`info.generationRules\`
- \`visual.previewRules\`
- \`visual.generationRules\`
- 合并后的 \`forbiddenPatterns\`
- 用户微调 \`userOverrides\`

如果只把 label 传给生成模型，一致性会明显下降。

### 问题 5：视觉 token 不是完全现成的 CSS theme

\`visual-option-presets.tokenHints\` 目前是生成提示，不是完整设计系统 token。

接入时可以先把它转成：

\`\`\`ts
type RuntimeVisualTokens = {
  background: string;
  text: string;
  accent: string;
  radiusPx: number;
};
\`\`\`

后续再扩展到 font、spacing、card、button、image treatment。

## 建议迁移顺序

### 第一步：只接 runtime，不改 UI

新增 adapter，确认前端或 AI pipeline 能读到：

- info presets
- visual presets
- composition rules
- anti-patterns

先不改变用户界面。

### 第二步：机制阶段改成推荐 info preset

让 AI 先推荐 2-3 个 \`info-option-presets\`。

前端可以先用文字展示：

- label
- pageArchitecture
- short reason
- risk

### 第三步：给 info preset 画低保真预览

用 \`aboveFold\`、\`sections\`、\`previewWireframe\` 画灰盒 wireframe。

这一步不需要真实视觉 token，只要让用户看懂“页面骨架”。

### 第四步：接 visual preset

根据 composition rules 给每个 info preset 匹配 2-3 个 visual preset。

前端展示可视化 preview：

- 背景色
- 字体感觉
- 图片方式
- 页面密度
- 首屏策略

### 第五步：生成阶段使用 selected preset

把用户选择的 info + visual 编译成完整 generation constraints。

这一步开始替代旧的 color/font/radius/icon 四维视觉生成逻辑。

### 第六步：生成后做检查

用 anti-patterns 和 checklists 做生成结果检查。

先可以只是 prompt 检查，后续再做自动结构检查。

## 最重要的接入原则

1. 只让 runtime 参与主推荐。
2. 让模型引用 preset ID，不要让它自由造方案。
3. info preset 先决定页面骨架，visual preset 再决定表达。
4. composition rules 必须参与搭配，避免骨架和视觉打架。
5. 用户的明确约束永远高于库推荐。
6. 生成阶段必须传结构化字段，不能只传 label。
7. materials 只做研究和二次策展，不进默认推荐。

## 一句话结论

接入代码不会卡死，但要通过 adapter 接，不要直接替换旧 catalog。

最安全的路线是：先让新库影响“信息方案推荐”，再接视觉方案，最后再替换生成约束。这样不会一次性推翻现有流程，也能逐步验证新库是不是真的让推荐更聪明。
`;
}

function main() {
  resetOutputDir();
  ensureDir(OUT);
  for (const dir of ["raw", "curated", "runtime", "schemas", "evals", "materials", "materials/ux-pro", "materials/design-md"]) {
    ensureDir(path.join(OUT, dir));
  }

  const uxQualityRules = transformUxQualityRules();
  const selectedUxQualityRules = selectUxQualityRules(uxQualityRules);
  const stylePrimitives = transformStylePrimitives();
  const antiPatterns = transformAntiPatterns();
  const uxProAutoAntiPatterns = transformUxProAutoAntiPatterns();
  const casePatterns = buildCasePatterns();
  const casePatternSummaries = buildCasePatternSummaries(casePatterns);
  const checklists = buildChecklists(selectedUxQualityRules);

  const curated = {
    "principles.json": principles,
    "intent-judgment.json": intentJudgment,
    "persuasion-mechanisms.json": persuasionMechanisms,
    "info-archetypes.json": infoArchetypes,
    "info-option-presets.json": infoOptionPresets,
    "content-modules.json": contentModules,
    "proof-materials.json": proofMaterials,
    "visual-judgments.json": visualJudgments,
    "visual-variants.json": visualVariants,
    "visual-option-presets.json": visualOptionPresets,
    "option-composition-rules.json": optionCompositionRules,
    "anti-patterns.json": antiPatterns,
    "case-patterns.json": casePatterns,
    "case-pattern-summaries.json": casePatternSummaries,
    "ux-quality-rules.json": selectedUxQualityRules,
    "checklists.json": checklists,
  };

  for (const [file, data] of Object.entries(curated)) {
    writeJson(path.join(OUT, "curated", file), data);
  }

  const uxProMaterialFiles = [
    "app-interface",
    "charts",
    "colors",
    "design",
    "draft",
    "google-fonts",
    "icons",
    "landing",
    "products",
    "react-performance",
    "styles",
    "typography",
    "ui-reasoning",
    "ux-guidelines",
  ];
  for (const name of uxProMaterialFiles) {
    const file = path.join(UX_DATA, `${name}.csv`);
    if (fs.existsSync(file)) {
      writeJson(path.join(OUT, "materials", "ux-pro", `${name}.json`), readCsv(name));
    }
  }
  writeJson(path.join(OUT, "materials", "ux-pro", "style-primitives.json"), stylePrimitives);
  writeJson(path.join(OUT, "materials", "ux-pro", "ux-quality-rules.full.json"), uxQualityRules);
  writeJson(path.join(OUT, "materials", "ux-pro", "auto-anti-patterns.json"), uxProAutoAntiPatterns);
  writeJson(path.join(OUT, "materials", "design-md", "case-patterns.full.json"), casePatterns);

  writeJson(path.join(OUT, "raw", "sources.json"), {
    sources: buildManifest({}).sources,
    notes: [
      "Raw sources are retained for traceability. Runtime should use curated/compiled files only.",
      "UX-PRO industry mappings are material, not final decision logic.",
      "design-md brand names must not be exposed as imitation options.",
    ],
  });
  writeText(
    path.join(OUT, "raw", "notes.md"),
    "# Raw Source Notes\n\n保留原始材料用于追踪来源。产品运行时不要直接读取 raw source。\n",
  );

  const schemas = buildSchemas();
  for (const [file, schema] of Object.entries(schemas)) {
    writeJson(path.join(OUT, "schemas", file), schema);
  }

  const runtimeFiles = {
    principles,
    "intent-judgment": intentJudgment,
    "persuasion-mechanisms": persuasionMechanisms,
    "info-option-presets": infoOptionPresets,
    "visual-option-presets": visualOptionPresets,
    "option-composition-rules": optionCompositionRules,
    "anti-patterns": antiPatterns,
    checklists,
    "ux-quality-rules": selectedUxQualityRules,
    "case-pattern-summaries": casePatternSummaries,
  };
  const runtimeIndex = buildRuntimeIndex(runtimeFiles);
  const compiled = {
    version: LIB_VERSION,
    priorityOrder: [
      "user explicit requirements",
      "user freeform constraints",
      "product principles",
      "page task",
      "persuasion mechanism",
      "reference library",
      "case similarity",
      "industry defaults",
    ],
    collections: runtimeFiles,
    index: runtimeIndex,
  };
  writeJson(path.join(OUT, "runtime", "design-reference.index.json"), runtimeIndex);
  writeJson(path.join(OUT, "runtime", "design-reference.compiled.json"), compiled);
  writeJson(
    path.join(OUT, "runtime", "retrieval-tags.json"),
    Object.fromEntries(
      [...new Set(runtimeIndex.flatMap((item) => item.tags ?? []).filter(Boolean))]
        .sort()
        .map((tag) => [tag, runtimeIndex.filter((item) => item.tags?.includes(tag)).map((item) => item.id)]),
    ),
  );

  const evals = buildEvals();
  writeJson(path.join(OUT, "evals", "prompts.json"), evals.prompts);
  writeJson(path.join(OUT, "evals", "expected-behaviors.json"), evals.expectedBehaviors);
  writeText(
    path.join(OUT, "evals", "regressions.md"),
    "# Regression Notes\n\n每次修改参考库或 prompt 后，用 `evals/prompts.json` 检查是否退回行业模板、风格选择器或品牌仿制。\n",
  );

  const counts = {
    principles: principles.length,
    intentJudgment: intentJudgment.length,
    persuasionMechanisms: persuasionMechanisms.length,
    infoArchetypes: infoArchetypes.length,
    contentModules: contentModules.length,
    proofMaterials: proofMaterials.length,
    visualJudgments: visualJudgments.length,
    visualVariants: visualVariants.length,
    infoOptionPresets: infoOptionPresets.length,
    visualOptionPresets: visualOptionPresets.length,
    optionCompositionRules: optionCompositionRules.length,
    materialStylePrimitives: stylePrimitives.colors.length + stylePrimitives.typography.length + stylePrimitives.styles.length,
    materialUxQualityRules: uxQualityRules.length,
    materialUxProAutoAntiPatterns: uxProAutoAntiPatterns.length,
    antiPatterns: antiPatterns.length,
    casePatterns: casePatterns.length,
    casePatternSummaries: casePatternSummaries.length,
    uxQualityRules: selectedUxQualityRules.length,
    checklists: checklists.length,
    evalPrompts: evals.prompts.length,
    runtimeIndex: runtimeIndex.length,
  };

  writeJson(path.join(OUT, "manifest.json"), buildManifest(counts));
  writeText(path.join(OUT, "README.md"), buildReadmeV2(counts));
  writeText(path.join(OUT, "MAP.md"), buildMap());

  console.log(JSON.stringify(counts, null, 2));
}

main();
