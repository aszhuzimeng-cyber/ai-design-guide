import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type Point = { x: number; y: number };

export type TreeEdge = {
  from: string;
  to: string;
  key?: string;
  muted?: boolean;
  animate?: boolean;
  /** 选中收起时：父节点与选项垂直对齐，用直线连接 */
  straight?: boolean;
};

export function buildMergeCurvePath(start: Point, end: Point) {
  const gapY = end.y - start.y;
  if (gapY <= 8 || Math.abs(start.x - end.x) < 1.5) {
    return `M${start.x} ${start.y} L${end.x} ${end.y}`;
  }
  const bend = Math.min(52, gapY * 0.42, (gapY - 4) / 2);
  const c1y = start.y + bend;
  const c2y = end.y - bend;
  return `M${start.x} ${start.y} C${start.x} ${c1y} ${end.x} ${c2y} ${end.x} ${end.y}`;
}

export function buildStraightConnectorPath(start: Point, end: Point) {
  if (Math.abs(start.x - end.x) < 1.5) {
    return `M${start.x} ${start.y} L${end.x} ${end.y}`;
  }
  const gapY = end.y - start.y;
  if (gapY <= 8) {
    return `M${start.x} ${start.y} L${end.x} ${end.y}`;
  }
  const bend = Math.min(40, gapY * 0.35, (gapY - 4) / 2);
  const c1y = start.y + bend;
  const c2y = end.y - bend;
  return `M${start.x} ${start.y} C${start.x} ${c1y} ${end.x} ${c2y} ${end.x} ${end.y}`;
}

export function measureBranchLineOrigin(head: HTMLElement, branch: HTMLElement) {
  const branchRect = branch.getBoundingClientRect();
  const scale = branch.offsetWidth > 0 ? branchRect.width / branch.offsetWidth : 1;
  const headRect = head.getBoundingClientRect();
  return (headRect.left + headRect.width / 2 - branchRect.left) / scale;
}

export function readAnchorLine(container: HTMLElement, from: HTMLElement, to: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const scaleX = container.offsetWidth > 0 ? containerRect.width / container.offsetWidth : 1;
  const scaleY = container.offsetHeight > 0 ? containerRect.height / container.offsetHeight : 1;
  return {
    start: {
      x: (fromRect.left - containerRect.left + fromRect.width / 2) / scaleX,
      y: (fromRect.bottom - containerRect.top + 1) / scaleY,
    },
    end: {
      x: (toRect.left - containerRect.left + toRect.width / 2) / scaleX,
      y: (toRect.top - containerRect.top - 1) / scaleY,
    },
  };
}

function getTreeEdgesKey(edges: TreeEdge[]) {
  return edges
    .map(
      (edge) =>
        `${edge.from}|${edge.to}|${edge.key ?? ""}|${Number(Boolean(edge.muted))}|${Number(Boolean(edge.animate))}|${Number(Boolean(edge.straight))}`,
    )
    .join(";");
}

export function attachLayoutMeasurement(
  container: HTMLElement,
  measure: () => void,
  options?: { observeAnchors?: boolean },
) {
  const observedNodes = new Set<Element>();
  const observeNode = (node: Element, resizeObserver: ResizeObserver) => {
    if (observedNodes.has(node)) return;
    observedNodes.add(node);
    resizeObserver.observe(node);
  };

  const observeAnchors = (resizeObserver: ResizeObserver) => {
    if (!options?.observeAnchors) return;
    container.querySelectorAll<HTMLElement>("[data-tree-anchor]").forEach((node) => observeNode(node, resizeObserver));
  };

  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(container);
  observeAnchors(resizeObserver);
  measure();

  const mutationObserver = new MutationObserver(() => {
    observeAnchors(resizeObserver);
    measure();
  });
  mutationObserver.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });

  const world = container.closest<HTMLElement>(".canvas-world");
  const worldObserver = world ? new MutationObserver(measure) : null;
  if (world && worldObserver) {
    worldObserver.observe(world, { attributes: true, attributeFilter: ["style"] });
  }

  let transitionLoop = 0;
  const onTransitionRun = (event: Event) => {
    if (!(event.target instanceof HTMLElement) || !container.contains(event.target)) return;
    const propertyName = event instanceof TransitionEvent ? event.propertyName : "";
    if (propertyName && !/width|height|transform|flex|max-width|min-width|gap|left|top/i.test(propertyName)) return;
    const deadline = performance.now() + 340;
    const tick = () => {
      measure();
      if (performance.now() < deadline) {
        transitionLoop = requestAnimationFrame(tick);
      }
    };
    cancelAnimationFrame(transitionLoop);
    transitionLoop = requestAnimationFrame(tick);
  };

  container.addEventListener("transitionrun", onTransitionRun, true);
  container.addEventListener("transitionend", measure, true);
  window.addEventListener("resize", measure);

  return () => {
    cancelAnimationFrame(transitionLoop);
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    worldObserver?.disconnect();
    container.removeEventListener("transitionrun", onTransitionRun, true);
    container.removeEventListener("transitionend", measure, true);
    window.removeEventListener("resize", measure);
  };
}

export function MeasuredTreeLines({
  containerRef,
  edges,
  className = "measured-tree-lines",
}: {
  containerRef: RefObject<HTMLElement>;
  edges: TreeEdge[];
  className?: string;
}) {
  const [measured, setMeasured] = useState<Array<TreeEdge & { start: Point; end: Point }>>([]);
  const [viewBox, setViewBox] = useState("0 0 1 1");
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const edgesKey = getTreeEdgesKey(edges);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const next = edgesRef.current.flatMap((edge) => {
        const from = container.querySelector<HTMLElement>(`[data-tree-anchor="${edge.from}"]`);
        const to = container.querySelector<HTMLElement>(`[data-tree-anchor="${edge.to}"]`);
        if (!from || !to) return [];
        return [{ ...edge, ...readAnchorLine(container, from, to) }];
      });

      const pad = 12;
      const baseWidth = Math.max(1, container.offsetWidth);
      const baseHeight = Math.max(1, container.offsetHeight);
      let minX = 0;
      let minY = 0;
      let maxX = baseWidth;
      let maxY = baseHeight;
      for (const edge of next) {
        minX = Math.min(minX, edge.start.x, edge.end.x);
        minY = Math.min(minY, edge.start.y, edge.end.y);
        maxX = Math.max(maxX, edge.start.x, edge.end.x);
        maxY = Math.max(maxY, edge.start.y, edge.end.y);
      }
      setViewBox(`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`);
      setMeasured(next);
    };

    return attachLayoutMeasurement(container, measure, { observeAnchors: true });
  }, [containerRef, edgesKey]);

  if (!measured.length) return null;

  return (
    <svg className={className} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
      {measured.map((edge, index) => (
        <path
          key={edge.key ?? `${edge.from}-${edge.to}-${index}`}
          className={`${edge.animate ? "edge-grow" : ""}${edge.muted ? " edge-muted" : ""}`}
          d={
            edge.straight
              ? `M${edge.start.x} ${edge.start.y} L${edge.end.x} ${edge.end.y}`
              : buildStraightConnectorPath(edge.start, edge.end)
          }
        />
      ))}
    </svg>
  );
}
