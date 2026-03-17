import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  SelectionMode,
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
  createNode,
  patchNode,
  deleteNode,
  createEdge,
  patchEdge,
  deleteEdge,
} from './api';
import type { CanvasNodeData } from './api';
import { buildChildMap, getDescendants } from './collapse';

// ─── nodeTypes defined OUTSIDE the component ────────────────────────────────
// CRITICAL: If defined inline inside App(), React Flow receives a new object
// reference on every render, triggering infinite re-renders.
const nodeTypes = { canvasNode: CanvasNode };

// ─── Style token helpers ─────────────────────────────────────────────────────

/** Map semantic stroke-width tokens to CSS stroke-width values. */
function strokeWidthToCss(token: string | null): string | undefined {
  if (token === 'thin') return '1';
  if (token === 'medium') return '2';
  if (token === 'thick') return '3';
  return undefined;
}

/** Map border/stroke style tokens to SVG strokeDasharray values. */
function strokeStyleToDasharray(token: string | null): string | undefined {
  if (token === 'dashed') return '5,5';
  if (token === 'dotted') return '2,3';
  return undefined;
}

// ─── Converters ──────────────────────────────────────────────────────────────

/**
 * Convert a DB node to a React Flow node.
 *
 * `hiddenIds` is the set of node IDs that should be hidden because an ancestor
 * is collapsed. Passed in at load time so the initial render respects persisted
 * collapsed state.
 *
 * `childMap` is used to determine hasChildren and to set initial style
 * dimensions on parent nodes (required by React Flow for subflows).
 *
 * `onToggleCollapse` and `onAddChild` are stable callback references from App.
 */
function dbNodeToFlowNode(
  n: CanvasNodeData,
  childMap: Map<string, string[]>,
  hiddenIds: Set<string>,
  onToggleCollapse: (id: string) => void,
  onAddChild: (id: string) => void,
  onNodeResized: (id: string, width: number, height: number) => void
): CanvasNodeType {
  const hasChildren = childMap.has(n.id);
  // Parent nodes with children need explicit dimensions for React Flow subflows
  // (extent: 'parent' requires a known parent size). We fall back to explicit
  // width/height stored in DB; if none, use defaults when the node has children.
  const styleFromDb = n.width != null && n.height != null
    ? { width: n.width, height: n.height }
    : null;
  const styleFromChildren = hasChildren && !styleFromDb
    ? { width: 320, height: 240 }
    : null;
  const style = styleFromDb ?? styleFromChildren ?? undefined;

  return {
    id: n.id,
    type: 'canvasNode',
    position: { x: n.x, y: n.y },
    data: {
      title: n.title,
      notes: n.notes,
      hasChildren,
      collapsed: n.collapsed === 1,
      onToggleCollapse,
      onAddChild,
      onNodeResized,
      // Visual style tokens — passed to CanvasNode for inline CSS application
      borderColor: n.border_color,
      bgColor: n.bg_color,
      borderWidth: n.border_width,
      borderStyle: n.border_style,
    },
    ...(n.parent_id
      ? { parentId: n.parent_id, extent: 'parent' as const }
      : {}),
    ...(style ? { style } : {}),
    hidden: hiddenIds.has(n.id),
  };
}

/**
 * Compute the set of node IDs that should be hidden because an ancestor has
 * collapsed=1. Walks all collapsed nodes and collects their descendants.
 */
function computeInitialHiddenIds(
  dbNodes: CanvasNodeData[],
  childMap: Map<string, string[]>
): Set<string> {
  const hidden = new Set<string>();
  for (const n of dbNodes) {
    if (n.collapsed === 1) {
      for (const id of getDescendants(n.id, childMap)) {
        hidden.add(id);
      }
    }
  }
  return hidden;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [nodes, setNodes] = useState<CanvasNodeType[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [mode, setMode] = useState<'pan' | 'select'>('pan');

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  // ─── childMap derived from current nodes ──────────────────────────────────
  // Derived purely from node topology (id + parentId). We keep it in a ref
  // so the collapse callback can always read the latest value without being
  // listed as a dep (which would force recreation on every topology change).
  const childMap = useMemo(() => {
    return buildChildMap(nodes.map((n) => ({ id: n.id, parent_id: n.parentId ?? null })));
  }, [nodes]);

  const childMapRef = useRef<Map<string, string[]>>(childMap);
  childMapRef.current = childMap;

  // ─── Nodes ref (for reading current state in stable callbacks) ───────────
  const nodesRef = useRef<CanvasNodeType[]>(nodes);
  nodesRef.current = nodes;

  // ─── Collapse / expand ────────────────────────────────────────────────────
  // CRITICAL: stable ref via useCallback([]) + nodesRef/childMapRef to avoid
  // including `childMap` or `nodes` in deps. If we included them,
  // onToggleCollapse would change on every node state update, which is in
  // node.data, triggering an infinite re-render loop.
  const onToggleCollapse = useCallback((id: string) => {
    const currentNodes = nodesRef.current;
    const node = currentNodes.find((n) => n.id === id);
    if (!node) return;

    const newCollapsed = !node.data.collapsed;
    const currentChildMap = childMapRef.current;
    const descendants = getDescendants(id, currentChildMap);
    const descendantSet = new Set(descendants);

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, collapsed: newCollapsed } };
        }
        if (descendantSet.has(n.id)) {
          return { ...n, hidden: newCollapsed };
        }
        return n;
      })
    );

    setEdges((eds) =>
      eds.map((e) => {
        const affectsEdge =
          descendantSet.has(e.source) || descendantSet.has(e.target);
        if (!affectsEdge) return e;
        return { ...e, hidden: newCollapsed };
      })
    );

    // Persist collapsed state to server (fire-and-forget)
    patchNode(id, { collapsed: newCollapsed ? 1 : 0 }).catch((err) =>
      console.error('Failed to persist collapsed state:', err)
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Add child node ────────────────────────────────────────────────────────
  // CRITICAL: stable ref via useCallback([]) + handleNodeCreatedRef so that
  // this callback doesn't change on every node state update. If it changed,
  // every node re-render would receive a new onAddChild reference → infinite
  // re-render loop.
  const handleNodeCreatedRef = useRef<(dbNode: CanvasNodeData) => void>(
    () => { /* filled in after handleNodeCreated is defined */ }
  );

  const handleAddChild = useCallback((parentId: string) => {
    createNode({ title: 'New Node', parent_id: parentId, x: 50, y: 60 })
      .then((dbNode) => handleNodeCreatedRef.current(dbNode))
      .catch((err) => console.error('Failed to create child node:', err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Node resize state sync ────────────────────────────────────────────────
  // Called by CanvasNode's handleResizeEnd to keep React Flow node style in
  // sync with the post-resize dimensions. Stable (empty deps) because it only
  // writes to state via a functional updater — no closure deps needed.
  const handleNodeResized = useCallback((id: string, width: number, height: number) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, style: { ...n.style, width, height } } : n
      )
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ─── Mode keyboard shortcuts (V = select, H = pan) ────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'v' || e.key === 'V') setMode('select');
      if (e.key === 'h' || e.key === 'H') setMode('pan');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Multi-select: close panel when >1 node selected ─────────────────────
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: CanvasNodeType[] }) => {
      if (selectedNodes.length > 1) setSelectedNodeId(null);
    },
    []
  );

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
        const strokeWidth = strokeWidthToCss(dbEdge.stroke_width);
        const strokeDasharray = strokeStyleToDasharray(dbEdge.stroke_style);
        const edgeStyle: Record<string, string> = {};
        if (dbEdge.stroke_color) edgeStyle.stroke = dbEdge.stroke_color;
        if (strokeWidth) edgeStyle.strokeWidth = strokeWidth;
        if (strokeDasharray) edgeStyle.strokeDasharray = strokeDasharray;
        setEdges((eds) => [
          ...eds,
          {
            id: dbEdge.id,
            source: dbEdge.source_id,
            target: dbEdge.target_id,
            sourceHandle: dbEdge.source_handle ?? undefined,
            targetHandle: dbEdge.target_handle ?? undefined,
            label: dbEdge.label ?? undefined,
            ...(Object.keys(edgeStyle).length > 0 ? { style: edgeStyle } : {}),
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
  // onToggleCollapse and handleAddChild are both stable (empty deps),
  // so it's safe to include them in deps without causing re-creation on
  // node topology changes.
  const handleNodeCreated = useCallback(
    (dbNode: CanvasNodeData) => {
      setNodes((nds) => {
        // Rebuild childMap from the current nodes + the new node to get correct
        // hasChildren for the parent.
        const allNodes = [
          ...nds.map((n) => ({ id: n.id, parent_id: n.parentId ?? null })),
          { id: dbNode.id, parent_id: dbNode.parent_id },
        ];
        const newChildMap = buildChildMap(allNodes);

        // If the new node has a parent, update the parent's hasChildren flag
        // and ensure it has explicit style dimensions (required by React Flow
        // for nodes that act as subflow containers via extent: 'parent').
        const updated = dbNode.parent_id
          ? nds.map((n) => {
              if (n.id !== dbNode.parent_id) return n;
              const alreadyHasChildren = n.data.hasChildren;
              // Only apply default dimensions if the parent has no explicit
              // style set yet — don't override user-resized dimensions.
              const needsDimensions =
                !alreadyHasChildren &&
                (n.style?.width == null && n.style?.height == null);
              return {
                ...n,
                data: { ...n.data, hasChildren: true },
                ...(needsDimensions ? { style: { ...n.style, width: 320, height: 240 } } : {}),
              };
            })
          : nds;

        // If the parent is currently collapsed, the new child must start hidden.
        const parentNode = dbNode.parent_id
          ? nds.find((n) => n.id === dbNode.parent_id)
          : undefined;
        const hiddenIds =
          parentNode?.data.collapsed === true
            ? new Set([dbNode.id])
            : new Set<string>();

        const newNode = dbNodeToFlowNode(
          dbNode,
          newChildMap,
          hiddenIds,
          onToggleCollapse,
          handleAddChild,
          handleNodeResized
        );
        return [...updated, newNode];
      });
    },
    [onToggleCollapse, handleAddChild, handleNodeResized]
  );

  // Keep handleNodeCreatedRef in sync so handleAddChild can call it stably
  handleNodeCreatedRef.current = handleNodeCreated;

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

        // Build childMap from DB data first so we can compute hidden state
        const initialChildMap = buildChildMap(dbNodes);
        const hiddenIds = computeInitialHiddenIds(dbNodes, initialChildMap);

        setNodes(
          dbNodes.map((n) =>
            dbNodeToFlowNode(n, initialChildMap, hiddenIds, onToggleCollapse, handleAddChild, handleNodeResized)
          )
        );

        // Compute hidden edges (source or target is in hiddenIds)
        setEdges(
          dbEdges.map((e) => {
            const strokeWidth = strokeWidthToCss(e.stroke_width);
            const strokeDasharray = strokeStyleToDasharray(e.stroke_style);
            const edgeStyle: Record<string, string> = {};
            if (e.stroke_color) edgeStyle.stroke = e.stroke_color;
            if (strokeWidth) edgeStyle.strokeWidth = strokeWidth;
            if (strokeDasharray) edgeStyle.strokeDasharray = strokeDasharray;
            return {
              id: e.id,
              source: e.source_id,
              target: e.target_id,
              sourceHandle: e.source_handle ?? undefined,
              targetHandle: e.target_handle ?? undefined,
              label: e.label ?? undefined,
              hidden: hiddenIds.has(e.source_id) || hiddenIds.has(e.target_id),
              ...(Object.keys(edgeStyle).length > 0 ? { style: edgeStyle } : {}),
            };
          })
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
    // onToggleCollapse is stable (empty deps), so this is safe
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        onSelectionChange={handleSelectionChange}
        panOnDrag={mode === 'pan'}
        selectionOnDrag={mode === 'select'}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Meta', 'Control']}
        maxZoom={8}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls />
        <MiniMap nodeColor="#d07a5a" maskColor="rgba(43,45,42,0.75)" />
        <Toolbar onNodeCreated={handleNodeCreated} mode={mode} onToggleMode={setMode} />
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
