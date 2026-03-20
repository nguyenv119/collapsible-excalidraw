// ─── Clipboard types ──────────────────────────────────────────────────────────
// In-memory clipboard data for copy/paste of nodes and edges.
// Derived from the canonical DB types to stay in sync automatically.

import type { CanvasNodeData, CanvasEdge } from './api';

/**
 * A snapshot of a node at copy time. Omits server-managed timestamps.
 * The `id` field carries the *original* ID — the paste handler will generate
 * new IDs and remap via an idMap before inserting.
 */
export type ClipboardNode = Omit<CanvasNodeData, 'created_at' | 'updated_at'>;

/**
 * A snapshot of an edge at copy time. Omits server-managed timestamp.
 * The `id`, `source_id`, and `target_id` carry original IDs — the paste
 * handler remaps them via an idMap before inserting.
 * Only edges where both endpoints are in the copied selection are included.
 */
export type ClipboardEdge = Omit<CanvasEdge, 'created_at'>;

/**
 * The full in-memory clipboard payload produced by Cmd+C and consumed by Cmd+V.
 */
export interface ClipboardData {
  nodes: ClipboardNode[];
  edges: ClipboardEdge[];
}
