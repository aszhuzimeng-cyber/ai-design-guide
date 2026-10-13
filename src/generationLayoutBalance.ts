/** 所有生成页都必须遵守的版式平衡规则（与壳层单栏/双栏/宫格无关） */
export const UNIVERSAL_LAYOUT_BALANCE_RULES = [
  "图文或内容分栏不要把长文案放入不足 280px 的窄列；工作台导航侧栏不算内容分栏",
  "长文案、特色列表、流程步骤、案例/评价放在宽栏或整栏；落地页的窄侧栏只放短 CTA、价格、保障",
  "重复卡片/列表的网格按可用宽度自动换列（单项最小约 240px）；不要把所有 section 的不同结构强制改成相同列数",
  "单个卡片、证言、特色块在 section 内须横向铺满可用宽度，禁止左上角小卡片 + section 余下全空白",
  "分栏两列高度可不同，但每列内容块应纵向紧凑排列；禁止用 flex:1 / min-height 撑出无意义空白",
] as const;

export const UNIVERSAL_LAYOUT_BALANCE_CSS = [
  "section,.page-main,.page-sidebar,.hero,.hero-section,.banner{min-width:0}",
  ".page-layout-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(24px,3vw,40px);align-items:start}",
  ".page-layout-split>.page-main,.page-layout-split>.page-sidebar{min-width:0;width:100%}",
  "@media (max-width:899px){.page-layout-split{grid-template-columns:1fr}}",
  ".page-main>section,.page-sidebar>section{min-width:0;width:100%}",
  "section :is(.grid,.cards,.features,.card-grid)>*{min-width:0}",
  ".testimonial,.review-card,.quote-card,blockquote[class],figure.testimonial{max-width:100%;width:100%}",
  "p,li,h1,h2,h3,h4,blockquote,figcaption{word-break:normal;overflow-wrap:break-word}",
].join("\n");

export function buildUniversalLayoutBalanceStyleBlock() {
  return `<style data-designtool-layout-balance>\n${UNIVERSAL_LAYOUT_BALANCE_CSS}\n</style>`;
}

export function withUniversalLayoutBalanceRules(rules: string[]) {
  return [...UNIVERSAL_LAYOUT_BALANCE_RULES, ...rules];
}
