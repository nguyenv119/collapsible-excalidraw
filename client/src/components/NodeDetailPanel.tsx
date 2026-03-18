import { useEffect, useRef, useState } from 'react';
import type { CanvasNodeType } from './CanvasNode';
import { STROKE_COLORS, STROKE_WIDTHS, STROKE_STYLES } from '../styleConstants';

// ─── Style constants ──────────────────────────────────────────────────────────

const BG_COLORS = [
  { id: 'default', label: 'Transparent', color: 'transparent', display: 'transparent', border: 'rgba(255,255,255,0.15)' },
  { id: 'pink', label: 'Pink', color: '#fce7f3', display: '#fce7f3', border: null },
  { id: 'mint', label: 'Mint', color: '#dcfce7', display: '#dcfce7', border: null },
  { id: 'sky', label: 'Sky', color: '#e0f2fe', display: '#e0f2fe', border: null },
  { id: 'yellow', label: 'Yellow', color: '#fef9c3', display: '#fef9c3', border: null },
  { id: 'gray', label: 'Gray', color: '#f3f4f6', display: '#f3f4f6', border: null },
];

const FONT_COLORS = [
  { id: 'auto', label: 'Auto', color: null },
  { id: 'black', label: 'Black', color: '#1a1a1a' },
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'red', label: 'Red', color: '#ef4444' },
  { id: 'blue', label: 'Blue', color: '#3b82f6' },
  { id: 'gray', label: 'Gray', color: '#6b7280' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface NodeDetailPanelProps {
  node: CanvasNodeType | null;
  onUpdate: (id: string, patch: {
    title?: string;
    notes?: string;
    border_color?: string | null;
    bg_color?: string | null;
    border_width?: string | null;
    border_style?: string | null;
    font_color?: string | null;
  }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NodeDetailPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
}: NodeDetailPanelProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodeIdRef = useRef<string | null>(null);

  // Flush any pending save
  const flush = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;

      if (nodeIdRef.current) {
        onUpdate(nodeIdRef.current, { title, notes });
      }
    }
  };

  // Sync local state when selected node changes
  useEffect(() => {
    flush();

    if (node) {
      setTitle(node.data.title);
      setNotes(node.data.notes);
      nodeIdRef.current = node.id;
    } else {
      nodeIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const scheduleSave = (nextTitle: string, nextNotes: string) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (nodeIdRef.current) {
        onUpdate(nodeIdRef.current, { title: nextTitle, notes: nextNotes });
      }
    }, 500);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setTitle(next);
    scheduleSave(next, notes);
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setNotes(next);
    scheduleSave(title, next);
  };

  // Style handlers — immediate, no debounce
  const handleStrokeColor = (color: string | null) => {
    if (!node) return;
    onUpdate(node.id, { border_color: color });
  };

  const handleBgColor = (color: string | null) => {
    if (!node) return;
    onUpdate(node.id, { bg_color: color });
  };

  const handleFontColor = (color: string | null) => {
    if (!node) return;
    onUpdate(node.id, { font_color: color });
  };

  const handleBorderWidth = (width: string) => {
    if (!node) return;
    // Toggle off if clicking the active value
    const next = node.data.borderWidth === width ? null : width;
    onUpdate(node.id, { border_width: next });
  };

  const handleBorderStyle = (style: string) => {
    if (!node) return;
    const next = node.data.borderStyle === style ? null : style;
    onUpdate(node.id, { border_style: next });
  };

  if (!node) return null;

  const activeStroke = node.data.borderColor;
  const activeBg = node.data.bgColor;
  const activeFontColor = node.data.fontColor;
  const activeWidth = node.data.borderWidth;
  const activeStyle = node.data.borderStyle;

  return (
    <div className="kc-panel">
      <div className="kc-panel__header">
        <span className="kc-panel__title">Node Detail</span>
        <button
          className="kc-panel__close"
          onClick={onClose}
          aria-label="Close panel"
        >
          &#x2715;
        </button>
      </div>

      <div className="kc-panel__body">
        <div className="kc-panel__field">
          <label className="kc-panel__label" htmlFor="kc-panel-title">
            Title
          </label>
          <input
            id="kc-panel-title"
            className="kc-panel__input"
            value={title}
            onChange={handleTitleChange}
            placeholder="Node title..."
          />
        </div>

        <div className="kc-panel__field">
          <label className="kc-panel__label" htmlFor="kc-panel-notes">
            Notes
          </label>
          <textarea
            id="kc-panel-notes"
            className="kc-panel__textarea"
            value={notes}
            onChange={handleNotesChange}
            rows={8}
            placeholder="Write notes here..."
          />
        </div>

        {/* ── Style section ── */}
        <div className="kc-panel__field">
          <span className="kc-panel__label">Style</span>

          <div className="kc-style-row">
            <span className="kc-style-row__label">Stroke</span>
            <div className="kc-style-swatches" data-testid="stroke-swatches">
              {STROKE_COLORS.map((s) => (
                <button
                  key={s.id}
                  data-testid={`stroke-swatch-${s.id}`}
                  aria-pressed={activeStroke === s.color}
                  className={`kc-swatch${activeStroke === s.color ? ' kc-swatch--active' : ''}`}
                  title={s.label}
                  onClick={() => handleStrokeColor(s.color)}
                  style={{
                    background: s.display,
                    borderColor: s.border ?? s.display,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="kc-style-row">
            <span className="kc-style-row__label">Fill</span>
            <div className="kc-style-swatches" data-testid="bg-swatches">
              {BG_COLORS.map((b) => (
                <button
                  key={b.id}
                  data-testid={`bg-swatch-${b.id}`}
                  className={`kc-swatch${activeBg === b.color ? ' kc-swatch--active' : ''}`}
                  title={b.label}
                  onClick={() => handleBgColor(b.color)}
                  style={{
                    background: b.display,
                    borderColor: b.border ?? 'rgba(0,0,0,0.18)',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="kc-style-row">
            <span className="kc-style-row__label">Font</span>
            <div className="kc-style-swatches" data-testid="font-color-swatches">
              {FONT_COLORS.map((f) => (
                <button
                  key={f.id}
                  data-testid={`font-color-swatch-${f.id}`}
                  aria-pressed={activeFontColor === f.color}
                  className={`kc-swatch kc-swatch--font${activeFontColor === f.color ? ' kc-swatch--active' : ''}`}
                  title={f.label}
                  onClick={() => handleFontColor(f.color)}
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

          <div className="kc-style-row">
            <span className="kc-style-row__label">Width</span>
            <div className="kc-style-toggles" data-testid="border-width-toggles">
              {STROKE_WIDTHS.map((w) => (
                <button
                  key={w.id}
                  data-testid={`border-width-${w.id}`}
                  className={`kc-style-toggle${activeWidth === w.id ? ' kc-style-toggle--active' : ''}`}
                  title={w.title}
                  onClick={() => handleBorderWidth(w.id)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          <div className="kc-style-row">
            <span className="kc-style-row__label">Line</span>
            <div className="kc-style-toggles" data-testid="border-style-toggles">
              {STROKE_STYLES.map((s) => (
                <button
                  key={s.id}
                  data-testid={`border-style-${s.id}`}
                  className={`kc-style-toggle${activeStyle === s.id ? ' kc-style-toggle--active' : ''}`}
                  title={s.title}
                  onClick={() => handleBorderStyle(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="kc-panel__footer">
        <button
          className="kc-panel__delete-btn"
          onClick={() => onDelete(node.id)}
        >
          Delete Node
        </button>
      </div>
    </div>
  );
}
