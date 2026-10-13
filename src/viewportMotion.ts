export type ViewportTransform = {
  x: number;
  y: number;
  scale: number;
};

export const VIEWPORT_PAN_BASE_MS = 520;
export const VIEWPORT_PAN_VISUAL_MS = 680;
export const VIEWPORT_PAN_MIN_MS = 360;
export const VIEWPORT_PAN_MAX_MS = 960;
export const VIEWPORT_SETTLE_MS = 140;
export const VIEWPORT_VISUAL_SETTLE_MS = 280;
export const VIEWPORT_FOCUS_DEBOUNCE_MS = 220;
export const VIEWPORT_VISUAL_FOCUS_DELAY_MS = 300;
export const VIEWPORT_STAGE_FIT_DELAY_MS = 180;
export const VIEWPORT_SKIP_RECENT_MS = 720;

export function roundViewportTransform(transform: ViewportTransform): ViewportTransform {
  return {
    x: Math.round(transform.x),
    y: Math.round(transform.y),
    scale: Math.round(transform.scale * 1000) / 1000,
  };
}

export function viewportTransformDistance(from: ViewportTransform, to: ViewportTransform) {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + Math.abs(to.scale - from.scale) * 120;
}

export function resolveViewportPanDuration(movement: number, baseMs = VIEWPORT_PAN_BASE_MS) {
  if (movement < 20) return Math.min(baseMs, VIEWPORT_PAN_MIN_MS);
  const extra = Math.min(400, (movement - 20) * 0.4);
  return Math.round(Math.min(VIEWPORT_PAN_MAX_MS, Math.max(VIEWPORT_PAN_MIN_MS, baseMs + extra)));
}

export function applyViewportTransform(world: HTMLElement, transform: ViewportTransform) {
  const rounded = roundViewportTransform(transform);
  world.style.setProperty("--canvas-x", `${rounded.x}px`);
  world.style.setProperty("--canvas-y", `${rounded.y}px`);
  world.style.setProperty("--canvas-scale", String(rounded.scale));
}

function easeInOutQuart(t: number) {
  return t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2;
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

export function animateViewportTransform(options: {
  world: HTMLElement;
  from: ViewportTransform;
  to: ViewportTransform;
  durationMs?: number;
  onFrame?: (transform: ViewportTransform) => void;
  onComplete?: (transform: ViewportTransform) => void;
}): () => void {
  const durationMs = Math.max(VIEWPORT_PAN_MIN_MS, options.durationMs ?? VIEWPORT_PAN_BASE_MS);
  const from = roundViewportTransform(options.from);
  const to = roundViewportTransform(options.to);
  const start = performance.now();
  let frameId = 0;
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
  };

  const tick = (now: number) => {
    if (cancelled) return;
    const raw = Math.min(1, (now - start) / durationMs);
    const eased = easeInOutQuart(raw);
    const transform = roundViewportTransform({
      x: lerp(from.x, to.x, eased),
      y: lerp(from.y, to.y, eased),
      scale: lerp(from.scale, to.scale, eased),
    });
    applyViewportTransform(options.world, transform);
    options.onFrame?.(transform);
    if (raw < 1) {
      frameId = window.requestAnimationFrame(tick);
      return;
    }
    applyViewportTransform(options.world, to);
    options.onFrame?.(to);
    frameId = 0;
    options.onComplete?.(to);
  };

  frameId = window.requestAnimationFrame(tick);
  return cancel;
}
