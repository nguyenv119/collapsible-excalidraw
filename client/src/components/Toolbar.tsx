import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';

import { createNode } from '../api';
import type { CanvasNodeData } from '../api';

interface ToolbarProps {
  onNodeCreated: (dbNode: CanvasNodeData) => void;
}

export function Toolbar({ onNodeCreated }: ToolbarProps) {
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
      <button className="kc-toolbar__btn" onClick={handleAddNode}>
        + Add Node
      </button>
    </div>
  );
}
