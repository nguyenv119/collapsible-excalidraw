import { useEffect, useRef, useState } from 'react';
import type { CanvasNodeType } from './CanvasNode';

interface NodeDetailPanelProps {
  node: CanvasNodeType | null;
  onUpdate: (id: string, patch: { title?: string; notes?: string }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

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

  if (!node) return null;

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
