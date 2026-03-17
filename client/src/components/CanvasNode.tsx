import { useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Handle, Position, NodeResizer, useConnection } from '@xyflow/react';
import type { Node, NodeProps, ResizeDragEvent } from '@xyflow/react';
import { patchNode } from '../api';

// ─── Node type definition ────────────────────────────────────────────────────
// Exported so App.tsx can use it as the Node generic for the state array.
export type CanvasNodeType = Node<
  {
    title: string;
    notes: string;
    hasChildren: boolean;
    collapsed: boolean;
    onToggleCollapse: (id: string) => void;
    onAddChild: (id: string) => void;
    onNodeResized: (id: string, width: number, height: number) => void;
    // Visual style tokens from DB
    borderColor: string | null;
    bgColor: string | null;
    borderWidth: string | null;  // 'thin' | 'medium' | 'thick' | null
    borderStyle: string | null;  // 'solid' | 'dashed' | 'dotted' | null
  },
  'canvasNode'
>;

// ─── Component ───────────────────────────────────────────────────────────────
// NOTE: nodeTypes must be defined OUTSIDE the component in App.tsx —
// inline definition causes infinite re-renders.
/** Map semantic border-width tokens to CSS pixel values. */
function borderWidthToCss(token: string | null): string | undefined {
  if (token === 'thin') return '1px';
  if (token === 'medium') return '2px';
  if (token === 'thick') return '3px';
  return undefined;
}

export function CanvasNode({ id, data, selected }: NodeProps<CanvasNodeType>) {
  const {
    title,
    notes,
    hasChildren,
    collapsed,
    onToggleCollapse,
    onAddChild,
    onNodeResized,
    borderColor,
    bgColor,
    borderWidth,
    borderStyle,
  } = data;
  const connection = useConnection();

  const borderWidthCss = borderWidthToCss(borderWidth);
  const nodeStyle: CSSProperties = {
    ...(borderColor ? { borderColor } : {}),
    ...(bgColor ? { backgroundColor: bgColor } : {}),
    ...(borderWidthCss ? { borderWidth: borderWidthCss } : {}),
    ...(borderStyle ? { borderStyle } : {}),
  };

  const handleResizeEnd = useCallback(
    (_event: ResizeDragEvent, params: { x: number; y: number; width: number; height: number }) => {
      patchNode(id, { width: params.width, height: params.height, x: params.x, y: params.y }).catch(
        (err) => console.error('Failed to persist node resize:', err)
      );
      onNodeResized(id, params.width, params.height);
    },
    [id, onNodeResized]
  );

  const handleCollapseClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // don't trigger node selection
      onToggleCollapse(id);
    },
    [id, onToggleCollapse]
  );

  const handleAddChildClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // don't trigger node selection
      onAddChild(id);
    },
    [id, onAddChild]
  );

  return (
    <div
      className={`kc-node${selected ? ' selected' : ''}${connection.inProgress ? ' show-handles' : ''}`}
      style={nodeStyle}
    >
      <NodeResizer
        minWidth={150}
        minHeight={60}
        isVisible={!!selected}
        color="var(--accent)"
        handleStyle={{ width: 12, height: 12, borderRadius: 3 }}
        onResizeEnd={handleResizeEnd}
      />
      {/* Top — source + target */}
      <Handle type="target" position={Position.Top} id="top-target" />
      <Handle type="source" position={Position.Top} id="top-source" />

      {/* Right — source + target */}
      <Handle type="target" position={Position.Right} id="right-target" />
      <Handle type="source" position={Position.Right} id="right-source" />

      <div className="kc-node__inner">
        <div className="kc-node__header">
          <p className="kc-node__title">{title}</p>
          <div className="kc-node__header-actions">
            <button
              data-testid="add-child-btn"
              className="kc-node__add-child-btn"
              onClick={handleAddChildClick}
              title="Add child node"
            >
              +
            </button>
            {hasChildren && (
              <button
                data-testid="collapse-toggle"
                className="kc-node__collapse-btn"
                onClick={handleCollapseClick}
                title={collapsed ? 'Expand children' : 'Collapse children'}
              >
                {collapsed ? '▶' : '▼'}
              </button>
            )}
          </div>
        </div>
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
