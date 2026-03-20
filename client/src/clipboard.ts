// ─── Clipboard types ──────────────────────────────────────────────────────────
// In-memory clipboard data for copy/paste of nodes and edges.
// Uses DB-level field names (snake_case) to match CanvasNodeData / CanvasEdge.

/**
 * A snapshot of a node at copy time. Includes all DB-level fields so that
 * the paste handler can faithfully reproduce the node's appearance and position.
 * The `id` field carries the *original* ID — the paste handler will generate
 * new IDs and remap via an idMap before inserting.
 */
export interface ClipboardNode {
  id: string;
  parent_id: string | null;
  title: string;
  notes: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  collapsed: 0 | 1;
  border_color: string | null;
  bg_color: string | null;
  border_width: string | null;
  border_style: string | null;
  font_size: string | null;
  font_color: string | null;
}

/**
 * A snapshot of an edge at copy time.
 * The `id`, `source_id`, and `target_id` carry original IDs — the paste
 * handler remaps them via an idMap before inserting.
 * Only edges where both endpoints are in the copied selection are included.
 */
export interface ClipboardEdge {
  id: string;
  source_id: string;
  target_id: string;
  source_handle: string | null;
  target_handle: string | null;
  label: string | null;
  stroke_color: string | null;
  stroke_width: string | null;
  stroke_style: string | null;
}

/**
 * The full in-memory clipboard payload produced by Cmd+C and consumed by Cmd+V.
 */
export interface ClipboardData {
  nodes: ClipboardNode[];
  edges: ClipboardEdge[];
}
