import type { StylePatch } from '../api';
import type { CanvasNodeType } from './CanvasNode';
import { StyleControls } from './StyleControls';

interface MultiSelectPanelProps {
  /** All currently selected nodes — used to compute mixed-state detection. */
  selectedNodes: CanvasNodeType[];
  /** Called with a patch that should be applied to ALL selected nodes. */
  onBulkStyleUpdate: (patch: StylePatch) => void;
  onClose: () => void;
}

// ─── Mixed-value helpers ──────────────────────────────────────────────────────

/**
 * Returns the shared value if all nodes agree, undefined if mixed, null if
 * all nodes have null (the "no override / auto" sentinel).
 *
 * The three-way result maps to StyleControls' active-value contract:
 *   - string   → all agree on this specific value   → highlight that swatch
 *   - null     → all agree on null (no override)    → highlight the "auto/none" swatch
 *   - undefined → values differ across nodes         → no swatch highlighted
 */
function consensus<T>(values: T[]): T | undefined {
  if (values.length === 0) return undefined;
  const first = values[0];
  return values.every((v) => v === first) ? first : undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MultiSelectPanel({
  selectedNodes,
  onBulkStyleUpdate,
  onClose,
}: MultiSelectPanelProps) {
  if (selectedNodes.length < 2) return null;

  const count = selectedNodes.length;

  // Compute mixed-state for each style dimension
  const activeStroke    = consensus(selectedNodes.map((n) => n.data.borderColor));
  const activeBg        = consensus(selectedNodes.map((n) => n.data.bgColor));
  const activeFontColor = consensus(selectedNodes.map((n) => n.data.fontColor));
  const activeWidth     = consensus(selectedNodes.map((n) => n.data.borderWidth));
  const activeStyle     = consensus(selectedNodes.map((n) => n.data.borderStyle));
  const activeFontSize  = consensus(selectedNodes.map((n) => n.data.fontSize));

  // ── Style handlers — each delegates to onBulkStyleUpdate ──────────────────

  const handleStrokeColor = (color: string | null) => {
    onBulkStyleUpdate({ border_color: color });
  };

  const handleBgColor = (color: string | null) => {
    onBulkStyleUpdate({ bg_color: color });
  };

  const handleFontColor = (color: string | null) => {
    onBulkStyleUpdate({ font_color: color });
  };

  const handleBorderWidth = (width: string) => {
    // Toggle off if all selected nodes share this width value
    const next = activeWidth === width ? null : width;
    onBulkStyleUpdate({ border_width: next });
  };

  const handleBorderStyle = (style: string) => {
    const next = activeStyle === style ? null : style;
    onBulkStyleUpdate({ border_style: next });
  };

  const handleFontSize = (size: string) => {
    const next = activeFontSize === size ? null : size;
    onBulkStyleUpdate({ font_size: next });
  };

  return (
    <div className="kc-panel" data-testid="multi-select-panel">
      <div className="kc-panel__header">
        <div className="kc-multi-header">
          <span className="kc-multi-header__count">{count}</span>
          <span className="kc-panel__title">
            {count === 1 ? 'node selected' : 'nodes selected'}
          </span>
        </div>
        <button
          className="kc-panel__close"
          onClick={onClose}
          aria-label="Close multi-select panel"
        >
          &#x2715;
        </button>
      </div>

      <div className="kc-panel__body">
        <div className="kc-panel__field">
          <span className="kc-panel__label">Style</span>
          <StyleControls
            activeStroke={activeStroke}
            activeBg={activeBg}
            activeFontColor={activeFontColor}
            activeWidth={activeWidth}
            activeStyle={activeStyle}
            activeFontSize={activeFontSize}
            onStrokeColor={handleStrokeColor}
            onBgColor={handleBgColor}
            onFontColor={handleFontColor}
            onBorderWidth={handleBorderWidth}
            onBorderStyle={handleBorderStyle}
            onFontSize={handleFontSize}
            testIdPrefix="multi-"
          />
        </div>
      </div>
    </div>
  );
}
