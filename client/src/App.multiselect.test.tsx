import { describe, it, expect, vi, afterEach } from 'vitest';
import * as api from './api';
import type { CanvasNodeData } from './api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeNode = (id: string, overrides: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
  id,
  parent_id: null,
  title: `Node ${id}`,
  notes: '',
  x: 0,
  y: 0,
  width: null,
  height: null,
  collapsed: 0,
  border_color: null,
  bg_color: null,
  border_width: null,
  border_style: null,
  font_size: null,
  font_color: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

// ─── Tests: bulkPatchNodes API function ────────────────────────────────────────
// These tests verify the API contract that App.tsx depends on for multi-drag.
// React Flow's onNodeDragStop callback cannot be triggered in jsdom, so we test
// the API layer directly — the server integration tests (nodes.bulk.test.ts)
// cover the end-to-end persistence.

describe('api.bulkPatchNodes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported from api.ts', () => {
    /**
     * Verifies that bulkPatchNodes is exported from the api module.
     *
     * Why: App.tsx imports bulkPatchNodes to call on multi-drag stop. If the
     * function is not exported, the import fails at build time, breaking the
     * entire client.
     *
     * What breaks: The client fails to compile, making the entire app
     * unavailable.
     */
    // GIVEN the api module
    // WHEN checking for the export
    // THEN bulkPatchNodes is a function
    expect(typeof api.bulkPatchNodes).toBe('function');
  });

  it('sends PATCH /nodes/bulk with patches array and returns updated nodes', async () => {
    /**
     * Verifies that bulkPatchNodes sends a PATCH request to /nodes/bulk with
     * { patches } in the body and resolves to the array of updated nodes.
     *
     * Why: The API function is the contract between App.tsx and the server.
     * If the body shape is wrong (e.g. sending an array directly instead of
     * { patches: [...] }), the server will return 422 and positions will not
     * be saved.
     *
     * What breaks: All multi-drag position updates fail silently — nodes
     * always snap back to their previous positions on reload.
     */
    // GIVEN a mock fetch that captures the request body
    const mockNodes: CanvasNodeData[] = [makeNode('a'), makeNode('b')];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockNodes,
    } as Response);

    // WHEN calling bulkPatchNodes with two patches
    const patches = [
      { id: 'a', x: 10, y: 20 },
      { id: 'b', x: 30, y: 40 },
    ];
    const result = await api.bulkPatchNodes(patches);

    // THEN fetch was called with the correct endpoint and body
    expect(fetchSpy).toHaveBeenCalledWith('/nodes/bulk', expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ patches }),
    }));
    expect(result).toEqual(mockNodes);
  });

  it('throws when the server responds with a non-ok status', async () => {
    /**
     * Verifies that bulkPatchNodes throws an error when the server returns
     * a non-2xx status code.
     *
     * Why: Error propagation allows the App to log the failure and potentially
     * retry or show an error indicator. If errors are swallowed silently, the
     * user will not know that their positions were not saved.
     *
     * What breaks: Failed bulk patches are silently discarded. The user
     * drags nodes, releases, sees no error, then reloads to find the nodes
     * back at their old positions with no explanation.
     */
    // GIVEN a server that returns 404
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    // WHEN calling bulkPatchNodes
    // THEN it throws
    await expect(api.bulkPatchNodes([{ id: 'x', x: 0, y: 0 }])).rejects.toThrow();
  });

  it('sends only the specified fields per patch (no extra keys)', async () => {
    /**
     * Verifies that bulkPatchNodes faithfully sends the exact patch objects
     * without adding or stripping fields.
     *
     * Why: The server validates and filters to allowed fields. But the client
     * must send the right shape — sending unexpected keys wastes bandwidth
     * and could confuse future server-side validation.
     *
     * What breaks: Extra fields could trigger unexpected server behavior or
     * mask client bugs where the wrong field name is used (e.g. 'posX' vs 'x').
     */
    // GIVEN a mock fetch
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [makeNode('a')],
    } as Response);

    // WHEN calling with a position-only patch
    const patches = [{ id: 'a', x: 50, y: 75 }];
    await api.bulkPatchNodes(patches);

    // THEN the body contains exactly { patches } with no extra keys
    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(call[1]!.body as string);
    expect(body).toEqual({ patches: [{ id: 'a', x: 50, y: 75 }] });
  });
});
