// ─── Types ─────────────────────────────────────────────────────────────────

export interface CanvasNodeData {
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
  border_width: string | null;  // 'thin' | 'medium' | 'thick' | null
  border_style: string | null;  // 'solid' | 'dashed' | 'dotted' | null
  font_size: string | null;
  created_at: string;
  updated_at: string;
}

export interface CanvasEdge {
  id: string;
  source_id: string;
  target_id: string;
  source_handle: string | null;
  target_handle: string | null;
  label: string | null;
  stroke_color: string | null;
  stroke_width: string | null;  // 'thin' | 'medium' | 'thick' | null
  stroke_style: string | null;  // 'solid' | 'dashed' | 'dotted' | null
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

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createNode(
  data: Partial<CanvasNodeData>
): Promise<CanvasNodeData> {
  const res = await fetch('/nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`createNode failed: ${res.status}`);
  return res.json();
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

export async function deleteNode(id: string): Promise<void> {
  const res = await fetch(`/nodes/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteNode failed: ${res.status}`);
}

export async function createEdge(
  data: Pick<CanvasEdge, 'source_id' | 'target_id'> & { source_handle?: string | null; target_handle?: string | null }
): Promise<CanvasEdge> {
  const res = await fetch('/edges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`createEdge failed: ${res.status}`);
  return res.json();
}

export async function patchEdge(
  id: string,
  patch: Partial<Pick<CanvasEdge, 'source_id' | 'target_id' | 'source_handle' | 'target_handle' | 'label' | 'stroke_color' | 'stroke_width' | 'stroke_style'>>
): Promise<CanvasEdge> {
  const res = await fetch(`/edges/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patchEdge failed: ${res.status}`);
  return res.json();
}

export async function deleteEdge(id: string): Promise<void> {
  const res = await fetch(`/edges/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteEdge failed: ${res.status}`);
}
