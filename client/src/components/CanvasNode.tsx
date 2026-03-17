import { Handle, Position, useConnection } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';

// ─── Node type definition ────────────────────────────────────────────────────
// Exported so App.tsx can use it as the Node generic for the state array.
export type CanvasNodeType = Node<{ title: string; notes: string }, 'canvasNode'>;

// ─── Component ───────────────────────────────────────────────────────────────
// NOTE: nodeTypes must be defined OUTSIDE the component in App.tsx —
// inline definition causes infinite re-renders.
export function CanvasNode({ data, selected }: NodeProps<CanvasNodeType>) {
  const { title, notes } = data;
  const connection = useConnection();

  return (
    <div className={`kc-node${selected ? ' selected' : ''}${connection.inProgress ? ' show-handles' : ''}`}>
      {/* Top — source + target */}
      <Handle type="target" position={Position.Top} id="top-target" />
      <Handle type="source" position={Position.Top} id="top-source" />

      {/* Right — source + target */}
      <Handle type="target" position={Position.Right} id="right-target" />
      <Handle type="source" position={Position.Right} id="right-source" />

      <div className="kc-node__inner">
        <p className="kc-node__title">{title}</p>
        {notes ? (
          <p className="kc-node__notes">{notes}</p>
        ) : (
          <p className="kc-node__notes kc-node__notes--empty">no notes</p>
        )}
      </div>

      {/* Bottom — source + target */}
      <Handle type="target" position={Position.Bottom} id="bottom-target" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" />

      {/* Left — source + target */}
      <Handle type="target" position={Position.Left} id="left-target" />
      <Handle type="source" position={Position.Left} id="left-source" />
    </div>
  );
}

export default CanvasNode;
