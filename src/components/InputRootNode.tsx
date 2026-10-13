import { AlignLeft, ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";

const COLLAPSE_CHAR_THRESHOLD = 380;
const COLLAPSE_LINE_THRESHOLD = 9;

export function InputRootNode({ text }: { text: string }) {
  const metrics = useMemo(() => {
    const trimmed = text.trim();
    const lineCount = trimmed ? trimmed.split(/\n/).length : 0;
    return {
      trimmed,
      lineCount,
      charCount: trimmed.length,
      compact: trimmed.length > 0 && trimmed.length < 96 && lineCount <= 2,
      collapsible: trimmed.length > COLLAPSE_CHAR_THRESHOLD || lineCount > COLLAPSE_LINE_THRESHOLD,
    };
  }, [text]);

  const [expanded, setExpanded] = useState(() => !metrics.collapsible);

  if (!metrics.trimmed) return null;

  return (
    <section
      className={[
        "input-root-node",
        metrics.compact ? "is-compact" : "",
        metrics.collapsible && !expanded ? "is-collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-tree-anchor="input-root"
    >
      <header className="input-root-head">
        <span className="input-root-icon" aria-hidden="true">
          <AlignLeft size={17} strokeWidth={2.2} />
        </span>
        <h2 className="input-root-title">原始输入</h2>
      </header>

      <div className="input-root-body">
        <p className="input-root-copy">{text}</p>
      </div>

      {metrics.collapsible ? (
        <footer className="input-root-footer">
          <button className="input-root-toggle" type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? (
              <>
                收起
                <ChevronUp size={14} aria-hidden="true" />
              </>
            ) : (
              <>
                展开全文
                <ChevronDown size={14} aria-hidden="true" />
              </>
            )}
          </button>
        </footer>
      ) : null}
    </section>
  );
}
