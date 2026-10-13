import type { SpokenConstraint, SpokenConstraintKind } from "../ai/types";
import { SPOKEN_KIND_LABELS, constraintDisplayLabel } from "../ai/spokenConstraints";

export function UserSpokenConstraintsPanel({
  constraints,
  compact = false,
  filterKinds,
}: {
  constraints: SpokenConstraint[];
  compact?: boolean;
  filterKinds?: SpokenConstraintKind[];
}) {
  const items = filterKinds ? constraints.filter((item) => filterKinds.includes(item.kind)) : constraints;
  if (!items.length) return null;

  return (
    <aside className={`spoken-constraints-panel${compact ? " is-compact" : ""}`} aria-label="用户已说明的输入约束">
      <div className="spoken-constraints-head">
        <span>你已说明</span>
      </div>
      <ul className="spoken-constraints-list">
        {items.map((item, index) => (
          <li key={`${item.kind}-${index}-${item.text}`} className="spoken-constraint-chip">
            <span className="spoken-constraint-kind">{constraintDisplayLabel(item) ?? SPOKEN_KIND_LABELS[item.kind]}</span>
            <em className="option-signal constraint">输入约束</em>
            <q cite="user-input">{item.text}</q>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * 约束语义（供维护者参考）：
 * - spokenConstraints：用户原话，只读展示 + 传给 AI
 * - inputConstraints：spoken 合并后的 string[]，用于生成 constraintTags
 * - option.signal=constraint：意图/视觉选项与用户原话匹配的徽章
 * - option.constraints：该选项参与生成时的规则片段
 */
