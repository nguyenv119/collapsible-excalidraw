import {
  STROKE_COLORS,
  STROKE_WIDTHS,
  STROKE_STYLES,
  BG_COLORS,
  FONT_COLORS,
  FONT_SIZES,
} from '../styleConstants';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Active values use `string | null | undefined`:
 *   - string  → a known value is active (highlights that swatch/toggle)
 *   - null    → the "none/auto" sentinel is active (no color, no border, etc.)
 *   - undefined → mixed/indeterminate state — no swatch or toggle is highlighted
 *
 * This three-way distinction is necessary for multi-select:
 *   - All nodes share a value       → string | null  (show it active)
 *   - Nodes have different values   → undefined       (show nothing active)
 */
export interface StyleControlsProps {
  activeStroke:    string | null | undefined;
  activeBg?:       string | null | undefined;
  activeFontColor?: string | null | undefined;
  activeWidth:     string | null | undefined;
  activeStyle:     string | null | undefined;
  activeFontSize?: string | null | undefined;

  onStrokeColor:  (color: string | null) => void;
  onBgColor?:     (color: string | null) => void;
  onFontColor?:   (color: string | null) => void;
  onBorderWidth:  (width: string) => void;
  onBorderStyle:  (style: string) => void;
  onFontSize?:    (size: string) => void;

  /**
   * Prefix applied to all data-testid values.
   * NodeDetailPanel passes "" — keeps existing test IDs like "stroke-swatches".
   * MultiSelectPanel passes "multi-" — produces "multi-stroke-swatches", etc.
   * EdgeDetailPanel passes "edge-" — produces "edge-stroke-swatches", etc.
   *
   * Fill, font-color, and font-size rows are only rendered when their
   * corresponding handlers (onBgColor, onFontColor, onFontSize) are provided.
   * Omit them to get a stroke-only control set (used by EdgeDetailPanel).
   */
  testIdPrefix: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StyleControls({
  activeStroke,
  activeBg,
  activeFontColor,
  activeWidth,
  activeStyle,
  activeFontSize,
  onStrokeColor,
  onBgColor,
  onFontColor,
  onBorderWidth,
  onBorderStyle,
  onFontSize,
  testIdPrefix,
}: StyleControlsProps) {
  const p = testIdPrefix;

  return (
    <>
      {/* ── Stroke color ── */}
      <div className="kc-style-row">
        <span className="kc-style-row__label">Stroke</span>
        <div className="kc-style-swatches" data-testid={`${p}stroke-swatches`}>
          {STROKE_COLORS.map((s) => (
            <button
              key={s.id}
              data-testid={`${p}stroke-swatch-${s.id}`}
              aria-pressed={activeStroke === s.color}
              className={`kc-swatch${activeStroke === s.color ? ' kc-swatch--active' : ''}`}
              title={s.label}
              onClick={() => onStrokeColor(s.color)}
              style={{
                background: s.display,
                borderColor: s.border ?? s.display,
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Fill color — only rendered when onBgColor handler is provided ── */}
      {onBgColor && (
        <div className="kc-style-row">
          <span className="kc-style-row__label">Fill</span>
          <div className="kc-style-swatches" data-testid={`${p}bg-swatches`}>
            {BG_COLORS.map((b) => (
              <button
                key={b.id}
                data-testid={`${p}bg-swatch-${b.id}`}
                className={`kc-swatch${activeBg === b.color ? ' kc-swatch--active' : ''}`}
                title={b.label}
                onClick={() => onBgColor(b.color)}
                style={{
                  background: b.display,
                  borderColor: b.border ?? 'rgba(0,0,0,0.18)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Font color — only rendered when onFontColor handler is provided ── */}
      {onFontColor && (
        <div className="kc-style-row">
          <span className="kc-style-row__label">Font</span>
          <div className="kc-style-swatches" data-testid={`${p}font-color-swatches`}>
            {FONT_COLORS.map((f) => (
              <button
                key={f.id}
                data-testid={`${p}font-color-swatch-${f.id}`}
                aria-pressed={activeFontColor === f.color}
                className={`kc-swatch kc-swatch--font${activeFontColor === f.color ? ' kc-swatch--active' : ''}`}
                title={f.label}
                onClick={() => onFontColor(f.color)}
                style={
                  f.color === null
                    ? {
                        background: 'transparent',
                        border: '1.5px solid rgba(255,255,255,0.25)',
                        color: 'rgba(255,255,255,0.5)',
                        textDecoration: 'line-through',
                      }
                    : {
                        background: 'transparent',
                        border: `1.5px solid ${f.color}`,
                        color: f.color,
                      }
                }
              >
                A
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Font size — only rendered when onFontSize handler is provided ── */}
      {onFontSize && (
        <div className="kc-style-row">
          <span className="kc-style-row__label">Size</span>
          <div className="kc-style-toggles" data-testid={`${p}font-size-toggles`}>
            {FONT_SIZES.map((f) => (
              <button
                key={f.id}
                data-testid={`${p}font-size-${f.id}`}
                className={`kc-style-toggle${activeFontSize === f.id ? ' kc-style-toggle--active' : ''}`}
                title={f.title}
                onClick={() => onFontSize(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Border width ── */}
      <div className="kc-style-row">
        <span className="kc-style-row__label">Width</span>
        <div className="kc-style-toggles" data-testid={`${p}border-width-toggles`}>
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w.id}
              data-testid={`${p}border-width-${w.id}`}
              className={`kc-style-toggle${activeWidth === w.id ? ' kc-style-toggle--active' : ''}`}
              title={w.title}
              onClick={() => onBorderWidth(w.id)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Border style ── */}
      <div className="kc-style-row">
        <span className="kc-style-row__label">Line</span>
        <div className="kc-style-toggles" data-testid={`${p}border-style-toggles`}>
          {STROKE_STYLES.map((s) => (
            <button
              key={s.id}
              data-testid={`${p}border-style-${s.id}`}
              className={`kc-style-toggle${activeStyle === s.id ? ' kc-style-toggle--active' : ''}`}
              title={s.title}
              onClick={() => onBorderStyle(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
