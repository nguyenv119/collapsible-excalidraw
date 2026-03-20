import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
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
  EdgeMouseHandler,
  Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './App.css';

import { CanvasNode } from './components/CanvasNode';
import type { CanvasNodeType } from './components/CanvasNode';
import { Toolbar } from './components/Toolbar';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import { EdgeDetailPanel } from './components/EdgeDetailPanel';
import { ViewportController, VIEWPORT_KEY } from './components/ViewportController';
import type { ViewportCommand } from './components/ViewportController';
import {
  fetchNodes,
  fetchEdges,
  createNode,
  patchNode,
  bulkPatchNodes,
  deleteNode,
  createEdge,
  patchEdge,
  deleteEdge,
} from './api';
import type { CanvasNodeData, CanvasEdge as CanvasEdgeData } from './api';
import { buildChildMap, getDescendants } from './collapse';
import { strokeWidthToCss, strokeStyleToDasharray } from './styleTokens';

// ─── Edge style helpers ──────────────────────────────────────────────────────

/**
 * Build a React Flow Edge from a DB edge row.
 * Stores DB-level style fields in `data` (single source of truth) and applies
 * them as CSS `style` properties so React Flow renders the correct appearance.
 */
function dbEdgeToFlowEdge(e: CanvasEdgeData, hiddenIds: Set<string>): Edge {
  const strokeColor = e.stroke_color ?? undefined;
  const strokeWidth = strokeWidthToCss(e.stroke_width);
  const strokeDasharray = strokeStyleToDasharray(e.stroke_style);
  return {
    id: e.id,
    source: e.source_id,
    target: e.target_id,
    sourceHandle: e.source_handle ?? undefined,
    targetHandle: e.target_handle ?? undefined,
    label: e.label ?? undefined,
    hidden: hiddenIds.has(e.source_id) || hiddenIds.has(e.target_id),
    data: {
      stroke_color: e.stroke_color,
      stroke_width: e.stroke_width,
      stroke_style: e.stroke_style,
    },
    style: {
      ...(strokeColor ? { stroke: strokeColor } : {}),
      ...(strokeWidth !== undefined ? { strokeWidth } : {}),
      ...(strokeDasharray ? { strokeDasharray } : {}),
    },
  };
}

/**
 * Apply a style patch to an existing React Flow Edge.
 * Merges DB-level fields into `data` and recomputes `style`.
 */
function applyEdgeStylePatch(
  edge: Edge,
  patch: { stroke_color?: string | null; stroke_width?: string | null; stroke_style?: string | null }
): Edge {
  const prevData = (edge.data ?? {}) as { stroke_color?: string | null; stroke_width?: string | null; stroke_style?: string | null };
  const nextData = { ...prevData, ...patch };
  const strokeColor = nextData.stroke_color ?? undefined;
  const strokeWidth = strokeWidthToCss(nextData.stroke_width ?? null);
  const strokeDasharray = strokeStyleToDasharray(nextData.stroke_style ?? null);
  return {
    ...edge,
    data: nextData,
    style: {
      ...(strokeColor ? { stroke: strokeColor } : {}),
      ...(strokeWidth !== undefined ? { strokeWidth } : {}),
      ...(strokeDasharray ? { strokeDasharray } : {}),
    },
  };
}

// ─── nodeTypes defined OUTSIDE the component ────────────────────────────────
// CRITICAL: If defined inline inside App(), React Flow receives a new object
// reference on every render, triggering infinite re-renders.
const nodeTypes = { canvasNode: CanvasNode };

// Height of a collapsed parent node — just the header bar, children hidden.
const COLLAPSED_HEIGHT = 52;

// ─── Converters ──────────────────────────────────────────────────────────────

/**
 * The structural (DB-derived) subset of CanvasNodeType data — everything
 * except the infrastructure callbacks (onToggleCollapse, onAddChild,
 * onNodeResized) that App wires up separately.
 */
type StructuralNodeData = Omit<
  CanvasNodeType['data'],
  'onToggleCollapse' | 'onAddChild' | 'onNodeResized'
>;

/**
 * Pure structural converter: maps a DB node row to a React Flow node shape
 * containing only DB-derived fields.
 *
 * Callbacks (onToggleCollapse, onAddChild, onNodeResized) are intentionally
 * excluded — they are infrastructure wiring, not part of DB-to-node
 * conversion. Callers spread them into data after calling this function.
 *
 * `hiddenIds` is the set of node IDs that should be hidden because an ancestor
 * is collapsed. Passed in at load time so the initial render respects persisted
 * collapsed state.
 *
 * `childMap` is used to determine hasChildren and to set initial style
 * dimensions on parent nodes (required by React Flow for subflows).
 */
export function dbNodeToFlowNodeBase(
  n: CanvasNodeData,
  childMap: Map<string, string[]>,
  hiddenIds: Set<string>
): Omit<CanvasNodeType, 'data'> & { data: StructuralNodeData } {
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
  const expandedStyle = styleFromDb ?? styleFromChildren ?? undefined;
  // Collapsed parent nodes show a compact title bar on initial load
  const isCollapsedParent = hasChildren && n.collapsed === 1;
  const style = (isCollapsedParent && expandedStyle)
    ? { ...expandedStyle, height: COLLAPSED_HEIGHT }
    : expandedStyle;

  return {
    id: n.id,
    type: 'canvasNode',
    position: { x: n.x, y: n.y },
    data: {
      title: n.title,
      notes: n.notes,
      hasChildren,
      collapsed: n.collapsed === 1,
      // Visual style tokens — passed to CanvasNode for inline CSS application
      borderColor: n.border_color,
      bgColor: n.bg_color,
      borderWidth: n.border_width,
      borderStyle: n.border_style,
      fontColor: n.font_color,
      fontSize: n.font_size,
    },
    ...(n.parent_id
      ? { parentId: n.parent_id, extent: 'parent' as const }
      : {}),
    ...(style ? { style } : {}),
    hidden: hiddenIds.has(n.id),
  };
}

/**
 * Convenience wrapper: converts a DB node to a full React Flow CanvasNodeType
 * by calling dbNodeToFlowNodeBase and spreading in the App-level callbacks.
 *
 * The callbacks are kept separate from the structural converter so that
 * dbNodeToFlowNodeBase can be unit-tested without App wiring, and so that
 * adding new callbacks in the future does not require modifying the converter.
 */
function dbNodeToFlowNode(
  n: CanvasNodeData,
  childMap: Map<string, string[]>,
  hiddenIds: Set<string>,
  onToggleCollapse: (id: string) => void,
  onAddChild: (id: string) => void,
  onNodeResized: (id: string, width: number, height: number) => void
): CanvasNodeType {
  const base = dbNodeToFlowNodeBase(n, childMap, hiddenIds);
  return {
    ...base,
    data: { ...base.data, onToggleCollapse, onAddChild, onNodeResized },
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const selectedNodeIdsRef = useRef<string[]>([]);
  const [mode, setMode] = useState<'pan' | 'select'>('pan');

  // ─── Viewport command + stack for zoom-fit navigation ─────────────────────
  const [viewportCommand, setViewportCommand] = useState<ViewportCommand | null>(null);
  const viewportStackRef = useRef<Viewport[]>([]);
  const getViewportRef = useRef<(() => Viewport) | null>(null);
  // Read once at mount so every re-render uses the same initial value.
  // Avoids reading localStorage on every render (performance + correctness).
  const initialFitViewRef = useRef(!localStorage.getItem(VIEWPORT_KEY));

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  // Derive edge style from edges state (single source of truth) — no separate edgeStyleMap
  const selectedEdgeStyle = selectedEdgeId
    ? (() => {
        const e = edges.find((ed) => ed.id === selectedEdgeId);
        if (!e) return null;
        const d = (e.data ?? {}) as { stroke_color?: string | null; stroke_width?: string | null; stroke_style?: string | null };
        return {
          stroke_color: d.stroke_color ?? null,
          stroke_width: d.stroke_width ?? null,
          stroke_style: d.stroke_style ?? null,
        };
      })()
    : null;

  // ─── Expanded style store for collapse/expand ─────────────────────────────
  // Stores the expanded { width, height } of parent nodes so we can restore
  // them after expanding. Populated at load time for already-collapsed nodes
  // and updated whenever a parent is resized.
  const expandedStylesRef = useRef<Map<string, { width: number; height: number }>>(new Map());

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

  // ─── selectedNodeIds ref — consumed by KC-4.2+ (bulk style, resize, paste) ─
  selectedNodeIdsRef.current = selectedNodeIds;

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
          // Compact/restore height for parent nodes on collapse/expand
          let newStyle = n.style;
          if (node.data.hasChildren) {
            if (newCollapsed) {
              const expandedW = (n.style?.width as number | undefined) ?? 320;
              const expandedH = (n.style?.height as number | undefined) ?? 240;
              expandedStylesRef.current.set(id, { width: expandedW, height: expandedH });
              newStyle = { ...n.style, height: COLLAPSED_HEIGHT };
            } else {
              const saved = expandedStylesRef.current.get(id);
              if (saved) {
                newStyle = { ...n.style, width: saved.width, height: saved.height };
              }
            }
          }
          return { ...n, data: { ...n.data, collapsed: newCollapsed }, style: newStyle };
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

    // Viewport navigation: zoom-fit on expand, restore on collapse
    if (newCollapsed) {
      // Collapse: pop the saved viewport and animate back
      const saved = viewportStackRef.current.pop();
      if (saved) {
        setViewportCommand({ type: 'restoreViewport', viewport: saved });
      }
    } else {
      // Expand: snapshot current viewport, then fit the node's children area
      const currentVp = getViewportRef.current?.();
      if (currentVp) viewportStackRef.current.push(currentVp);
      setViewportCommand({ type: 'fitNode', nodeId: id });
    }
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
    // Keep expandedStylesRef current so a future collapse restores resized dimensions
    expandedStylesRef.current.set(id, { width, height });
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
  // The 3rd argument (draggedNodes) is all nodes that moved in this drag gesture
  // (React Flow moves all selected nodes together). When >1 node was dragged,
  // use the atomic bulk endpoint so all positions are saved in one transaction.
  const onNodeDragStop: OnNodeDrag<CanvasNodeType> = useCallback(
    (_event, _node, draggedNodes) => {
      if (draggedNodes.length > 1) {
        const patches = draggedNodes.map((n) => ({
          id: n.id,
          x: n.position.x,
          y: n.position.y,
        }));
        bulkPatchNodes(patches).catch(
          (err) => console.error('Failed to persist multi-node positions:', err)
        );
      } else {
        const n = draggedNodes[0] ?? _node;
        patchNode(n.id, { x: n.position.x, y: n.position.y }).catch(
          (err) => console.error('Failed to persist node position:', err)
        );
      }
    },
    []
  );

  // ─── Selection ────────────────────────────────────────────────────────────────
  const onNodeClick: NodeMouseHandler<CanvasNodeType> = useCallback(
    (_event, node) => {
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
    },
    []
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_event, edge) => {
      setSelectedEdgeId(edge.id);
      setSelectedNodeId(null);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
  }, []);

  // ─── Viewport persistence via localStorage ─────────────────────────────────
  // Debounced 600ms so rapid pan/zoom gestures only trigger one write.
  const viewportSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMoveEnd = useCallback((_: unknown, viewport: Viewport) => {
    if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
    viewportSaveTimer.current = setTimeout(() => {
      localStorage.setItem(VIEWPORT_KEY, JSON.stringify(viewport));
    }, 600);
  }, []);

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

  // ─── Multi-select: track selectedNodeIds + close single-select panel ────────
  // When 1 node is selected, also set selectedNodeId (shows NodeDetailPanel).
  // When >1 are selected, clear both selectedNodeId and selectedEdgeId so the
  // single-select panel closes (KC-4.2 will add a dedicated multi-select panel).
  // When 0 are selected (e.g. pane click clears selection), clear everything.
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: CanvasNodeType[] }) => {
      const ids = selectedNodes.map((n) => n.id);
      setSelectedNodeIds(ids);
      if (ids.length === 1) {
        setSelectedNodeId(ids[0]);
      } else if (ids.length > 1) {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      } else {
        // 0 selected (e.g. Escape key deselects all)
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
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
        setEdges((eds) => [...eds, dbEdgeToFlowEdge(dbEdge, new Set())]);
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
    const deletedEdgeIds = new Set(deletedEdges.map((e) => e.id));
    // Clear selected edge if it was deleted
    setSelectedEdgeId((prev) => (prev && deletedEdgeIds.has(prev) ? null : prev));
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
      setSelectedEdgeId(null);

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
  // NodeDetailPanel sends DB-level snake_case fields; CanvasNodeType data uses
  // camelCase. Map them here before the optimistic state update.
  const handleNodeUpdate = useCallback(
    (id: string, patch: {
      title?: string;
      notes?: string;
      border_color?: string | null;
      bg_color?: string | null;
      border_width?: string | null;
      border_style?: string | null;
      font_color?: string | null;
      font_size?: string | null;
    }) => {
      // Build a camelCase patch for the React state optimistic update
      const statePatch: Partial<CanvasNodeType['data']> = {};
      if (patch.title !== undefined) statePatch.title = patch.title;
      if (patch.notes !== undefined) statePatch.notes = patch.notes;
      if ('border_color' in patch) statePatch.borderColor = patch.border_color ?? null;
      if ('bg_color' in patch) statePatch.bgColor = patch.bg_color ?? null;
      if ('border_width' in patch) statePatch.borderWidth = patch.border_width ?? null;
      if ('border_style' in patch) statePatch.borderStyle = patch.border_style ?? null;
      if ('font_color' in patch) statePatch.fontColor = patch.font_color ?? null;
      if ('font_size' in patch) statePatch.fontSize = patch.font_size ?? null;

      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...statePatch } } : n
        )
      );
      // Fire-and-forget persist (DB uses snake_case — send patch as-is)
      patchNode(id, patch).catch((err) =>
        console.error('Failed to persist node update:', err)
      );
    },
    []
  );

  const handlePanelClose = useCallback(() => setSelectedNodeId(null), []);
  const handleEdgePanelClose = useCallback(() => setSelectedEdgeId(null), []);

  // ─── Edge style update (from EdgeDetailPanel) ─────────────────────────────
  const handleEdgeStyleUpdate = useCallback(
    (id: string, patch: { stroke_color?: string | null; stroke_width?: string | null; stroke_style?: string | null }) => {
      // Optimistic update: apply style directly to edges state (single source of truth)
      setEdges((eds) =>
        eds.map((e) => (e.id === id ? applyEdgeStylePatch(e, patch) : e))
      );
      // Fire-and-forget persist
      patchEdge(id, patch).catch((err) =>
        console.error('Failed to persist edge style update:', err)
      );
    },
    []
  );

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

        // Populate expandedStylesRef for already-collapsed parent nodes so
        // expand can restore the correct dimensions.
        for (const n of dbNodes) {
          if (n.collapsed === 1 && initialChildMap.has(n.id)) {
            expandedStylesRef.current.set(n.id, {
              width: n.width ?? 320,
              height: n.height ?? 240,
            });
          }
        }

        // Convert DB edges to React Flow edges with style data embedded
        setEdges(dbEdges.map((e) => dbEdgeToFlowEdge(e, hiddenIds)));
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
        onEdgeClick={onEdgeClick}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        onSelectionChange={handleSelectionChange}
        onMoveEnd={handleMoveEnd}
        panOnDrag={mode === 'pan'}
        selectionOnDrag={mode === 'select'}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        maxZoom={8}
        fitView={initialFitViewRef.current}
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={0.75}/>
        <Controls />
        <MiniMap nodeColor="#d07a5a" maskColor="rgba(43,45,42,0.75)" />
        <Toolbar onNodeCreated={handleNodeCreated} mode={mode} onToggleMode={setMode} />
        <ViewportController
          command={viewportCommand}
          onCommandHandled={() => setViewportCommand(null)}
          getViewportRef={getViewportRef}
        />
      </ReactFlow>
      <NodeDetailPanel
        node={selectedNode}
        onUpdate={handleNodeUpdate}
        onDelete={handleDeleteNode}
        onClose={handlePanelClose}
      />
      <EdgeDetailPanel
        edgeId={selectedEdgeId}
        edgeStyle={selectedEdgeStyle}
        onUpdate={handleEdgeStyleUpdate}
        onClose={handleEdgePanelClose}
      />
      {/* Test-only: expose edge IDs for programmatic selection in JSDOM tests,
          where React Flow SVG edges are not rendered. Hidden from users. */}
      {(import.meta as unknown as { env: { MODE: string } }).env.MODE === 'test' && (
        <div data-testid="edge-click-triggers" style={{ display: 'none' }}>
          {edges.map((e) => (
            <button
              key={e.id}
              data-testid={`select-edge-${e.id}`}
              onClick={() => { setSelectedEdgeId(e.id); setSelectedNodeId(null); }}
            />
          ))}
        </div>
      )}
    </>
  );
}
