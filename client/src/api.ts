// ─── Types ─────────────────────────────────────────────────────────────────

export interface CanvasNodeData {
  id: string;
  parent_id: string | null;
  title: string;
  notes: string;
  x: number;
  y: number;
  collapsed: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface CanvasEdge {
  id: string;
  source_id: string;
  target_id: string;
  label: string | null;
  created_at: string;
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

export async function fetchNodes(): Promise<CanvasNodeData[]> {
  const res = await fetch('/nodes');
  if (!res.ok) throw new Error(`fetchNodes failed: ${res.status}`);
  return res.json();
}

export async function fetchEdges(): Promise<CanvasEdge[]> {
  const res = await fetch('/edges');
  if (!res.ok) throw new Error(`fetchEdges failed: ${res.status}`);
  return res.json();
}

// ─── Stubs (implemented in later beads) ─────────────────────────────────────

export async function createNode(
  _data: Partial<CanvasNodeData>
): Promise<CanvasNodeData> {
  return Promise.resolve({} as CanvasNodeData);
}

export async function patchNode(
  id: string,
  patch: Partial<CanvasNodeData>
): Promise<CanvasNodeData> {
  const res = await fetch(`/nodes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patchNode failed: ${res.status}`);
  return res.json();
}

export async function deleteNode(_id: string): Promise<void> {
  return Promise.resolve();
}

export async function createEdge(
  _data: Pick<CanvasEdge, 'source_id' | 'target_id'>
): Promise<CanvasEdge> {
  return Promise.resolve({} as CanvasEdge);
}

export async function deleteEdge(_id: string): Promise<void> {
  return Promise.resolve();
}
