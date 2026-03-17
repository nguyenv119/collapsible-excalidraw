import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  reconnectEdge,
} from '@xyflow/react';
import type {
  Edge,
  OnNodeDrag,
  OnNodesChange,
  OnNodesDelete,
  OnEdgesChange,
  OnConnect,
  OnReconnect,
  OnEdgesDelete,
  NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './App.css';

import { CanvasNode } from './components/CanvasNode';
import type { CanvasNodeType } from './components/CanvasNode';
import { Toolbar } from './components/Toolbar';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import {
  fetchNodes,
  fetchEdges,
  patchNode,
  deleteNode,
  createEdge,
  patchEdge,
  deleteEdge,
} from './api';
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
    ...(n.width != null && n.height != null
      ? { style: { width: n.width, height: n.height } }
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  // ─── React Flow controlled-mode handlers ──────────────────────────────────
  const onNodesChange: OnNodesChange<CanvasNodeType> = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  // ─── Drag persistence ───────────────────────────────────────────────────────
  const onNodeDragStop: OnNodeDrag<CanvasNodeType> = useCallback(
    (_event, node) => {
      patchNode(node.id, { x: node.position.x, y: node.position.y }).catch(
        (err) => console.error('Failed to persist node position:', err)
      );
    },
    []
  );

  // ─── Selection ────────────────────────────────────────────────────────────────
  const onNodeClick: NodeMouseHandler<CanvasNodeType> = useCallback(
    (_event, node) => setSelectedNodeId(node.id),
    []
  );

  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  // ─── Edge creation + deletion ─────────────────────────────────────────────
  const handleConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target) return;

    createEdge({
      source_id: connection.source,
      target_id: connection.target,
      source_handle: connection.sourceHandle,
      target_handle: connection.targetHandle,
    })
      .then((dbEdge) => {
        setEdges((eds) => [
          ...eds,
          {
            id: dbEdge.id,
            source: dbEdge.source_id,
            target: dbEdge.target_id,
            sourceHandle: dbEdge.source_handle ?? undefined,
            targetHandle: dbEdge.target_handle ?? undefined,
            label: dbEdge.label ?? undefined,
          },
        ]);
      })
      .catch((err) => console.error('Failed to create edge:', err));
  }, []);

  const handleReconnect: OnReconnect = useCallback((oldEdge, newConnection) => {
    setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));
    patchEdge(oldEdge.id, {
      source_id: newConnection.source!,
      target_id: newConnection.target!,
      source_handle: newConnection.sourceHandle,
      target_handle: newConnection.targetHandle,
    }).catch((err) => console.error('Failed to persist edge reconnect:', err));
  }, []);

  const handleEdgesDelete: OnEdgesDelete = useCallback((deletedEdges) => {
    for (const e of deletedEdges) {
      deleteEdge(e.id).catch((err) =>
        console.error('Failed to delete edge:', err)
      );
    }
  }, []);

  // ─── Node deletion ─────────────────────────────────────────────────────────
  // Fired by React Flow after backspace/delete key removes nodes from state.
  // onNodesChange already handled the local state removal; this persists to server.
  const handleNodesDelete: OnNodesDelete<CanvasNodeType> = useCallback(
    (deletedNodes) => {
      const deletedIds = new Set(deletedNodes.map((n) => n.id));

      // Clear selection if deleted node was selected
      setSelectedNodeId((prev) => (prev && deletedIds.has(prev) ? null : prev));

      // Remove edges connected to deleted nodes from local state
      setEdges((eds) =>
        eds.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target))
      );

      // Persist to server (server cascades edge deletion)
      for (const n of deletedNodes) {
        deleteNode(n.id).catch((err) =>
          console.error('Failed to delete node:', err)
        );
      }
    },
    []
  );

  // Delete node from panel button — must handle both local state and server
  const handleDeleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) =>
        eds.filter((e) => e.source !== id && e.target !== id)
      );
      setSelectedNodeId(null);

      deleteNode(id).catch((err) =>
        console.error('Failed to delete node:', err)
      );
    },
    []
  );

  // ─── Node creation ────────────────────────────────────────────────────────
  const handleNodeCreated = useCallback((dbNode: CanvasNodeData) => {
    setNodes((nds) => [...nds, dbNodeToFlowNode(dbNode)]);
  }, []);

  // ─── Node update (from panel) ──────────────────────────────────────────────
  const handleNodeUpdate = useCallback(
    (id: string, patch: { title?: string; notes?: string }) => {
      // Optimistic local update
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
        )
      );
      // Fire-and-forget persist
      patchNode(id, patch).catch((err) =>
        console.error('Failed to persist node update:', err)
      );
    },
    []
  );

  const handlePanelClose = useCallback(() => setSelectedNodeId(null), []);

  // ─── Initial data load ────────────────────────────────────────────────────
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
            sourceHandle: e.source_handle ?? undefined,
            targetHandle: e.target_handle ?? undefined,
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
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls />
        <MiniMap nodeColor="#c8a96e" maskColor="rgba(26,28,34,0.75)" />
        <Toolbar onNodeCreated={handleNodeCreated} />
      </ReactFlow>
      <NodeDetailPanel
        node={selectedNode}
        onUpdate={handleNodeUpdate}
        onDelete={handleDeleteNode}
        onClose={handlePanelClose}
      />
    </>
  );
}
