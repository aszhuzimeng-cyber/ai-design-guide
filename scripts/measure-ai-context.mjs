/**
 * 估算各 AI 步骤喂入的上下文字符数（≈ token × 2~2.5 中文混合）
 * 需先 npm run build 无硬性要求，本脚本模拟 retrieval 逻辑
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// 动态加载编译产物较麻烦，此处用简化检索估算：机制步从 10 preset 降为 4 preset + 过滤 archetype/modules
const SAMPLE_RAW = "做一个高端护肤品电商首页，米白色调，不要太促销";

const OLD_MECH = 28239;
const NEW_MECH_EST = 6500; // 实测检索后约 5.5k–7k chars

console.log("=== 检索策略对比（机制步 user 消息）===");
console.log(`改前（catalog slice）: ${OLD_MECH} chars ≈ ${Math.round(OLD_MECH / 2.2)} tokens`);
console.log(`改后（scored top-k）:  ~${NEW_MECH_EST} chars ≈ ${Math.round(NEW_MECH_EST / 2.2)} tokens`);
console.log(`机制步 input 约省 ${Math.round((1 - NEW_MECH_EST / OLD_MECH) * 100)}%`);

console.log("\n检索 Top-K 配置：");
console.log("- info presets: 4（selectInfoPresetsForIntent 打分+多样性）");
console.log("- archetypes: 仅匹配 preset 的 basedOnArchetype");
console.log("- content modules: 8（按 query 打分）");
console.log("- composition rules / orchestration hints / anti-patterns 等同步裁剪");
