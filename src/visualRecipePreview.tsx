import type { CSSProperties } from "react";
import {
  densityViewportSpec,
  resolveCardDisplay,
  resolveDensityDisplay,
  resolveFontArchetype,
  resolveFontDisplay,
  resolveVisualGrammarDisplay,
  type CardDisplay,
} from "./visualGrammarDisplay";
import { resolveColorPalette } from "./visualColorPalette";
import type { OptionItem, VisualId } from "./types";

const SPECIMEN_PREVIEW_HEIGHT = 148;

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function isColorDark(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance < 0.52;
}

function recipeSurface(background: string) {
  return isColorDark(background) ? "rgba(255, 255, 255, 0.94)" : "#ffffff";
}

function defaultRecipeTokens() {
  return {
    "--recipe-bg": "#f8fafc",
    "--recipe-surface": "#ffffff",
    "--recipe-text": "#0f172a",
    "--recipe-accent": "#2563eb",
    "--recipe-secondary": "#dbeafe",
    "--recipe-radius": "8px",
  } as CSSProperties;
}

export function resolveCardSurfaceStyle(card: CardDisplay): CSSProperties {
  const radius = card.radius;
  const mode = card.mode.replace(/_/g, "-");

  if (mode === "flat-hairline" || mode === "flat") {
    return {
      borderRadius: radius,
      border: "1.5px solid #64748b",
      boxShadow: "none",
      background: "#ffffff",
    };
  }
  if (mode === "bordered") {
    return {
      borderRadius: radius,
      border: "3px solid #1e293b",
      boxShadow: "none",
      background: "#ffffff",
    };
  }
  if (mode === "elevated") {
    return {
      borderRadius: radius,
      border: "none",
      boxShadow: "0 22px 44px rgba(15, 23, 42, 0.34), 0 10px 18px rgba(15, 23, 42, 0.2)",
      background: "#ffffff",
    };
  }
  if (mode === "panel") {
    return {
      borderRadius: radius,
      border: "1px solid #cbd5e1",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
      background: "#f1f5f9",
    };
  }
  return {
    borderRadius: radius,
    border: "none",
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.24), 0 4px 10px rgba(15, 23, 42, 0.12)",
    background: "#ffffff",
  };
}

export type ColorTokenChip = { label: string; color: string; hex: string };

export function resolveColorTokenChips(option: OptionItem): ColorTokenChip[] {
  const palette = resolveColorPalette(option);
  const accent = palette.primary ?? "#2563eb";
  const secondary = palette.secondary ?? palette.accent ?? "#dbeafe";
  return [
    { label: "主", color: accent, hex: accent },
    { label: "辅", color: secondary, hex: secondary },
    { label: "点", color: palette.accent ?? palette.text ?? "#0f172a", hex: palette.accent ?? palette.text ?? "#0f172a" },
  ];
}


export function ColorTokenChips({ option }: { option: OptionItem }) {
  const chips = resolveColorTokenChips(option);
  return (
    <div className="visual-specimen-chips" aria-label="配色参数">
      {chips.map((chip) => (
        <span key={chip.label} className="visual-specimen-chip" title={`${chip.label === "主" ? "主色" : chip.label === "辅" ? "辅色" : "点缀"} ${chip.hex}`}>
          <i style={{ background: chip.color }} aria-hidden="true" />
          <b>{chip.label}</b>
          <code>{chip.hex}</code>
        </span>
      ))}
    </div>
  );
}

export function DimensionTokenChips({ dimensionId, option }: { dimensionId: VisualId; option: OptionItem }) {
  if (dimensionId === "color") return <ColorTokenChips option={option} />;
  const display = resolveVisualGrammarDisplay(dimensionId, option);
  return (
    <div className="visual-specimen-chips visual-specimen-chips-text" aria-label="参数说明">
      <span className="visual-specimen-chip-text">{display.tokenLine}</span>
    </div>
  );
}

function ColorRecipePreview({ option }: { option: OptionItem }) {
  const palette = resolveColorPalette(option);
  const background = palette.background ?? "#f8fafc";
  const text = palette.text ?? (isColorDark(background) ? "#f8fafc" : "#0f172a");
  const accent = palette.primary ?? "#2563eb";
  const secondary = palette.secondary ?? palette.accent ?? "#dbeafe";

  return (
    <div
      className="visual-preview visual-recipe-preview preview-dimension-color"
      style={
        {
          ...defaultRecipeTokens(),
          "--recipe-bg": background,
          "--recipe-surface": recipeSurface(background),
          "--recipe-text": text,
          "--recipe-accent": accent,
          "--recipe-secondary": secondary,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <div className="recipe-mini-nav">
        <span />
        <i />
        <i />
      </div>
      <div className="recipe-mini-hero">
        <div className="recipe-mini-copy">
          <strong>主标题</strong>
          <span />
          <span />
          <em />
        </div>
        <div className="recipe-mini-media">
          <b />
          <b />
        </div>
      </div>
      <div className="recipe-mini-cards">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function FontSpecimenPreview({ option }: { option: OptionItem }) {
  const font = resolveFontDisplay(option);
  const archetype = resolveFontArchetype(option);

  return (
    <div className={`visual-preview font-specimen-preview font-archetype-${archetype}`} aria-hidden="true">
      <div className="font-specimen-stage">
        <p className="font-specimen-heading" style={{ fontFamily: font.headingFont }}>
          {font.headingSample}
        </p>
        <p className="font-specimen-body" style={{ fontFamily: font.bodyFont }}>
          {font.bodySample}
        </p>
      </div>
    </div>
  );
}

function CardSpecimenPreview({ option }: { option: OptionItem }) {
  const card = resolveCardDisplay(option);
  const mode = card.mode.replace(/_/g, "-");
  const modeClass = `card-specimen-mode-${mode}`;
  const hasGroundShadow = mode === "soft-card" || mode === "soft" || mode === "elevated";

  return (
    <div className={`visual-preview card-specimen-preview ${modeClass}`} aria-hidden="true">
      <div className="card-specimen-canvas">
        <div className="card-specimen-stack">
          {hasGroundShadow ? <div className="card-specimen-ground-shadow" aria-hidden="true" /> : null}
          <div className="card-specimen-float" style={resolveCardSurfaceStyle(card)}>
            <span className="card-specimen-kicker" />
            <span className="card-specimen-line" />
            <span className="card-specimen-line" />
            <span className="card-specimen-line short" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DensitySpecimenPreview({ option }: { option: OptionItem }) {
  const density = resolveDensityDisplay(option);
  const viewport = densityViewportSpec(density.density);

  return (
    <div className={`visual-preview density-viewport-specimen density-viewport-${density.density}`} aria-hidden="true">
      <div className="density-viewport-canvas">
        <div className="density-viewport-screen" style={{ padding: `${viewport.framePadding}px` }}>
          <div className="density-viewport-modules" style={{ gap: `${viewport.gap}px` }}>
            {Array.from({ length: viewport.modulesPerScreen }, (_, index) => (
              <div
                key={index}
                className="density-viewport-module"
                style={{ minHeight: `${viewport.moduleMinHeight}px` }}
              >
                <span className="density-viewport-module-title" />
                {density.density !== "compact" ? (
                  <>
                    <span className="density-viewport-module-line" />
                    <span className="density-viewport-module-line short" />
                  </>
                ) : (
                  <span className="density-viewport-module-line" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function VisualRecipePreview({ dimensionId, option }: { dimensionId: VisualId; option: OptionItem }) {
  if (dimensionId === "color") return <ColorRecipePreview option={option} />;
  if (dimensionId === "font") return <FontSpecimenPreview option={option} />;
  if (dimensionId === "card") return <CardSpecimenPreview option={option} />;
  if (dimensionId === "density") return <DensitySpecimenPreview option={option} />;
  return <ColorRecipePreview option={option} />;
}

export const VISUAL_SPECIMEN_PREVIEW_HEIGHT = SPECIMEN_PREVIEW_HEIGHT;
