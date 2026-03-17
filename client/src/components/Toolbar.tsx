import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';

import { createNode } from '../api';
import type { CanvasNodeData } from '../api';

interface ToolbarProps {
  onNodeCreated: (dbNode: CanvasNodeData) => void;
  mode: 'pan' | 'select';
  onToggleMode: (mode: 'pan' | 'select') => void;
}

export function Toolbar({ onNodeCreated, mode, onToggleMode }: ToolbarProps) {
  const { screenToFlowPosition } = useReactFlow();

  const handleAddNode = useCallback(async () => {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    try {
      const dbNode = await createNode({
        title: 'New Node',
        x: center.x,
        y: center.y,
      });
      onNodeCreated(dbNode);
    } catch (err) {
      console.error('Failed to create node:', err);
    }
  }, [screenToFlowPosition, onNodeCreated]);

  return (
    <div className="kc-toolbar">
      <div className="kc-toolbar__mode-group">
        <button
          className={`kc-toolbar__mode-btn${mode === 'pan' ? ' kc-toolbar__mode-btn--active' : ''}`}
          onClick={() => onToggleMode('pan')}
          title="Pan mode (H)"
        >
          Pan <kbd className="kc-toolbar__kbd">H</kbd>
        </button>
        <button
          className={`kc-toolbar__mode-btn${mode === 'select' ? ' kc-toolbar__mode-btn--active' : ''}`}
          onClick={() => onToggleMode('select')}
          title="Select mode (V)"
        >
          Select <kbd className="kc-toolbar__kbd">V</kbd>
        </button>
      </div>
      <button className="kc-toolbar__btn" onClick={handleAddNode}>
        + Add Node
      </button>
    </div>
  );
}
