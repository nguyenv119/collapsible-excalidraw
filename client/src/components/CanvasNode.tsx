import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';

// ─── Node type definition ────────────────────────────────────────────────────
// Exported so App.tsx can use it as the Node generic for the state array.
export type CanvasNodeType = Node<{ title: string; notes: string }, 'canvasNode'>;

// ─── Component ───────────────────────────────────────────────────────────────
// NOTE: nodeTypes must be defined OUTSIDE the component in App.tsx —
// inline definition causes infinite re-renders.
export function CanvasNode({ data, selected }: NodeProps<CanvasNodeType>) {
  const { title, notes } = data;

  return (
    <div className={`kc-node${selected ? ' selected' : ''}`}>
      {/* Target handle — incoming edges connect here */}
      <Handle type="target" position={Position.Top} />

      <div className="kc-node__inner">
        <p className="kc-node__title">{title}</p>
        {notes ? (
          <p className="kc-node__notes">{notes}</p>
        ) : (
          <p className="kc-node__notes kc-node__notes--empty">no notes</p>
        )}
      </div>

      {/* Source handle — outgoing edges originate here */}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default CanvasNode;
