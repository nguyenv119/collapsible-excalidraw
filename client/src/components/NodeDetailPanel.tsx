import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { CanvasNodeType } from './CanvasNode';
import { StyleControls } from './StyleControls';

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
    font_size?: string | null;
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
  const [isEditing, setIsEditing] = useState(false);
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
    setIsEditing(false); // reset to preview mode on node change
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

  if (!node) return null;

  const handleStrokeColor = (color: string | null) => {
    onUpdate(node.id, { border_color: color });
  };

  const handleBgColor = (color: string | null) => {
    onUpdate(node.id, { bg_color: color });
  };

  const handleFontColor = (color: string | null) => {
    onUpdate(node.id, { font_color: color });
  };

  const handleBorderWidth = (width: string) => {
    // Toggle off if clicking the active value
    const next = node.data.borderWidth === width ? null : width;
    onUpdate(node.id, { border_width: next });
  };

  const handleBorderStyle = (style: string) => {
    const next = node.data.borderStyle === style ? null : style;
    onUpdate(node.id, { border_style: next });
  };

  const handleFontSize = (size: string) => {
    // Toggle off if clicking the active value
    const next = node.data.fontSize === size ? null : size;
    onUpdate(node.id, { font_size: next });
  };

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
          <div className="kc-panel__field-header">
            <label className="kc-panel__label" htmlFor="kc-panel-notes">
              Notes
            </label>
            <button
              className="kc-panel__mode-toggle"
              onClick={() => setIsEditing((v) => !v)}
            >
              {isEditing ? 'Preview' : 'Edit'}
            </button>
          </div>
          {isEditing ? (
            <textarea
              id="kc-panel-notes"
              className="kc-panel__textarea"
              value={notes}
              onChange={handleNotesChange}
              rows={8}
              placeholder="Write notes here..."
            />
          ) : (
            <div className="kc-md" onClick={() => setIsEditing(true)}>
              <ReactMarkdown>{notes || '*no notes*'}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* ── Style section ── */}
        <div className="kc-panel__field">
          <span className="kc-panel__label">Style</span>
          <StyleControls
            activeStroke={node.data.borderColor}
            activeBg={node.data.bgColor}
            activeFontColor={node.data.fontColor}
            activeWidth={node.data.borderWidth}
            activeStyle={node.data.borderStyle}
            activeFontSize={node.data.fontSize}
            onStrokeColor={handleStrokeColor}
            onBgColor={handleBgColor}
            onFontColor={handleFontColor}
            onBorderWidth={handleBorderWidth}
            onBorderStyle={handleBorderStyle}
            onFontSize={handleFontSize}
            testIdPrefix=""
          />
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
