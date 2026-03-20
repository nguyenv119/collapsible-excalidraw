import { StyleControls } from './StyleControls';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EdgeDetailPanelProps {
  edgeId: string | null;
  edgeStyle: { stroke_color: string | null; stroke_width: string | null; stroke_style: string | null } | null;
  onUpdate: (id: string, patch: { stroke_color?: string | null; stroke_width?: string | null; stroke_style?: string | null }) => void;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EdgeDetailPanel({ edgeId, edgeStyle, onUpdate, onClose }: EdgeDetailPanelProps) {
  if (!edgeId || !edgeStyle) return null;

  const handleStrokeColor = (color: string | null) => {
    onUpdate(edgeId, { stroke_color: color });
  };

  const handleStrokeWidth = (width: string) => {
    const next = edgeStyle.stroke_width === width ? null : width;
    onUpdate(edgeId, { stroke_width: next });
  };

  const handleStrokeStyle = (style: string) => {
    const next = edgeStyle.stroke_style === style ? null : style;
    onUpdate(edgeId, { stroke_style: next });
  };

  return (
    <div className="kc-panel" data-testid="edge-detail-panel">
      <div className="kc-panel__header">
        <span className="kc-panel__title">Edge Detail</span>
        <button
          className="kc-panel__close"
          onClick={onClose}
          aria-label="Close edge panel"
        >
          &#x2715;
        </button>
      </div>

      <div className="kc-panel__body">
        <div className="kc-panel__field">
          <span className="kc-panel__label">Style</span>

          <StyleControls
            activeStroke={edgeStyle.stroke_color}
            activeWidth={edgeStyle.stroke_width}
            activeStyle={edgeStyle.stroke_style}
            onStrokeColor={handleStrokeColor}
            onBorderWidth={handleStrokeWidth}
            onBorderStyle={handleStrokeStyle}
            testIdPrefix="edge-"
          />
        </div>
      </div>
    </div>
  );
}
