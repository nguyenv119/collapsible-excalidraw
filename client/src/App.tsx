import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
} from '@xyflow/react';
import type { Edge, OnNodeDrag } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './App.css';

import { CanvasNode } from './components/CanvasNode';
import type { CanvasNodeType } from './components/CanvasNode';
import { fetchNodes, fetchEdges, patchNode } from './api';
import type { CanvasNodeData } from './api';

// ─── nodeTypes defined OUTSIDE the component ────────────────────────────────
// CRITICAL: If defined inline inside App(), React Flow receives a new object
// reference on every render, triggering infinite re-renders.
const nodeTypes = { canvasNode: CanvasNode };

// ─── Converters ──────────────────────────────────────────────────────────────

function dbNodeToFlowNode(n: CanvasNodeData): CanvasNodeType {
  return {
    id: n.id,
    type: 'canvasNode',
    position: { x: n.x, y: n.y },
    data: { title: n.title, notes: n.notes },
    ...(n.parent_id
      ? { parentId: n.parent_id, extent: 'parent' as const }
      : {}),
    hidden: false,
  };
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [nodes, setNodes] = useState<CanvasNodeType[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Drag persistence ───────────────────────────────────────────────────────
  // Fire-and-forget: React Flow already updates local position state via its
  // own onNodesChange; we only need to persist the final resting position.
  const onNodeDragStop: OnNodeDrag<CanvasNodeType> = useCallback((_event, node) => {
    patchNode(node.id, { x: node.position.x, y: node.position.y }).catch(
      (err) => console.error('Failed to persist node position:', err)
    );
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [dbNodes, dbEdges] = await Promise.all([
          fetchNodes(),
          fetchEdges(),
        ]);

        setNodes(dbNodes.map(dbNodeToFlowNode));

        setEdges(
          dbEdges.map((e) => ({
            id: e.id,
            source: e.source_id,
            target: e.target_id,
            label: e.label ?? undefined,
          }))
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load canvas data'
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="kc-loading">
        <div className="kc-loading__inner">
          <div className="kc-loading__dots">
            <span className="kc-loading__dot" />
            <span className="kc-loading__dot" />
            <span className="kc-loading__dot" />
          </div>
          <span className="kc-loading__label">Loading canvas</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="kc-loading">
        <div className="kc-loading__inner">
          <span className="kc-loading__label" style={{ color: '#e07070' }}>
            {error}
          </span>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeDragStop={onNodeDragStop}
      fitView
      fitViewOptions={{ padding: 0.2 }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
      <Controls />
      <MiniMap nodeColor="#c8a96e" maskColor="rgba(26,28,34,0.75)" />
    </ReactFlow>
  );
}
