import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

const presets = read("design-reference/curated/info-option-presets.json");
const archetypes = read("design-reference/curated/info-archetypes.json");
const rules = read("design-reference/curated/option-composition-rules.json");
const compiled = read("design-reference/runtime/design-reference.compiled.json");

const archIds = new Set(archetypes.map((a) => a.id));
const presetIds = new Set(presets.map((p) => p.id));
const issues = [];

const sigMap = new Map();
for (const p of presets) {
  const w = p.previewWireframe ?? {};
  const sig = `${w.hero ?? "?"}::${w.body ?? "?"}`;
  if (!sigMap.has(sig)) sigMap.set(sig, []);
  sigMap.get(sig).push(p.id);
}
for (const [sig, ids] of sigMap) {
  if (ids.length > 1) issues.push({ level: "warn", msg: `wireframe 签名重复: ${sig} -> ${ids.join(", ")}` });
}

for (const p of presets) {
  if (p.variantOf && !presetIds.has(p.variantOf)) {
    issues.push({ level: "error", msg: `${p.id} variantOf 无效: ${p.variantOf}` });
  }
  if (p.basedOnArchetype && !archIds.has(p.basedOnArchetype)) {
    issues.push({ level: "error", msg: `${p.id} archetype 无效: ${p.basedOnArchetype}` });
  }
}

for (const p of presets) {
  if (!rules.find((r) => r.infoPresetId === p.id)) {
    issues.push({ level: "error", msg: `缺少组合规则: ${p.id}` });
  }
}

const compiledPresets = compiled.collections["info-option-presets"] ?? [];
if (compiledPresets.length !== presets.length) {
  issues.push({
    level: "error",
    msg: `compiled preset 数量 ${compiledPresets.length} != curated ${presets.length}`,
  });
}

const enInUserFacing = /\b(offer|cta|landing|hero|saas|b2b)\b/i;
for (const p of presets) {
  for (const field of ["label", "title", "userLabel", "layoutRhythm"]) {
    const value = p[field];
    if (typeof value === "string" && enInUserFacing.test(value)) {
      issues.push({ level: "warn", msg: `${p.id}.${field} 含英文: ${value}` });
    }
  }
}

const byArch = {};
for (const p of presets) {
  const key = p.basedOnArchetype ?? "?";
  if (!byArch[key]) byArch[key] = [];
  byArch[key].push(p.id);
}
for (const [arch, ids] of Object.entries(byArch)) {
  if (ids.length !== 2) {
    issues.push({ level: "warn", msg: `archetype ${arch} 有 ${ids.length} 个 preset (期望 2): ${ids.join(", ")}` });
  }
}

for (const p of presets) {
  if (!p.structure?.length) issues.push({ level: "error", msg: `${p.id} structure 为空` });
  if (!p.sections?.length) issues.push({ level: "warn", msg: `${p.id} sections 为空` });
}

const invalidVisual = [];
const visuals = read("design-reference/curated/visual-option-presets.json");
const visualIds = new Set(visuals.map((v) => v.id));
for (const rule of rules) {
  for (const id of [...(rule.recommendedVisualPresets ?? []), ...(rule.avoidVisualPresets ?? [])]) {
    if (!visualIds.has(id)) invalidVisual.push(`${rule.infoPresetId}: ${id}`);
  }
}
if (invalidVisual.length) {
  issues.push({ level: "error", msg: `组合规则引用不存在的视觉 preset: ${invalidVisual.join("; ")}` });
}

console.log(`Presets: ${presets.length} | Archetypes: ${archetypes.length} | Rules: ${rules.length}`);
console.log(`Issues: ${issues.length}\n`);
for (const issue of issues) console.log(`[${issue.level.toUpperCase()}] ${issue.msg}`);
process.exit(issues.some((i) => i.level === "error") ? 1 : 0);
