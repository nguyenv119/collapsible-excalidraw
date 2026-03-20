import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeNode = (id: string, overrides: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
  id,
  parent_id: null,
  title: `Node ${id}`,
  notes: '',
  x: 100,
  y: 100,
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

const makeEdge = (id: string, source_id: string, target_id: string, overrides: Partial<CanvasEdge> = {}): CanvasEdge => ({
  id,
  source_id,
  target_id,
  source_handle: null,
  target_handle: null,
  label: null,
  stroke_color: null,
  stroke_width: null,
  stroke_style: null,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

// ─── Tests: api.bulkCreateNodes ──────────────────────────────────────────────

describe('api.bulkCreateNodes', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('is exported from api.ts', () => {
    /**
     * Verifies that bulkCreateNodes is exported from the api module.
     *
     * Why: App.tsx imports bulkCreateNodes for the paste handler. If it is not
     * exported, the import fails at build time, breaking the entire client.
     *
     * What breaks: The client fails to compile, making the app unavailable.
     */
    // GIVEN the api module
    // WHEN checking for the export
    // THEN bulkCreateNodes is a function
    expect(typeof api.bulkCreateNodes).toBe('function');
  });

  it('sends POST /nodes/bulk with nodes array and returns created nodes', async () => {
    /**
     * Verifies that bulkCreateNodes sends a POST request to /nodes/bulk with
     * { nodes } in the body and resolves to the array of created nodes.
     *
     * Why: The body shape must match exactly what the server expects. If the
     * client sends the nodes array directly instead of { nodes: [...] }, the
     * server returns 422 and the paste silently fails.
     *
     * What breaks: Every paste attempt fails — nodes never appear on the canvas.
     */
    // GIVEN a mock fetch that captures the request body
    const createdNodes: CanvasNodeData[] = [makeNode('new-a'), makeNode('new-b')];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => createdNodes,
    } as Response);

    // WHEN calling bulkCreateNodes with two node payloads
    const nodes = [
      { id: 'new-a', title: 'Alpha', x: 10, y: 20 },
      { id: 'new-b', title: 'Beta', x: 30, y: 40 },
    ];
    const result = await api.bulkCreateNodes(nodes);

    // THEN fetch was called with the correct endpoint and body
    expect(fetchSpy).toHaveBeenCalledWith('/nodes/bulk', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ nodes }),
    }));
    expect(result).toEqual(createdNodes);
  });

  it('throws when the server responds with a non-ok status', async () => {
    /**
     * Verifies that bulkCreateNodes throws on a non-2xx server response.
     *
     * Why: Error propagation allows the app to log the failure. If errors
     * are swallowed, the user sees no visual feedback and can't tell why
     * pasted nodes did not appear.
     *
     * What breaks: Failed pastes are silently discarded, with no indication
     * that anything went wrong.
     */
    // GIVEN a server that returns 422
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 422,
    } as Response);

    // WHEN calling bulkCreateNodes
    // THEN it throws
    await expect(
      api.bulkCreateNodes([{ id: 'x', title: 'X', x: 0, y: 0 }])
    ).rejects.toThrow();
  });
});

// ─── Tests: api.bulkCreateEdges ──────────────────────────────────────────────

describe('api.bulkCreateEdges', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('is exported from api.ts', () => {
    /**
     * Verifies that bulkCreateEdges is exported from the api module.
     *
     * Why: App.tsx imports bulkCreateEdges for the paste handler's edge step.
     * Missing export breaks the build.
     *
     * What breaks: The client fails to compile.
     */
    // GIVEN the api module
    // WHEN checking for the export
    // THEN bulkCreateEdges is a function
    expect(typeof api.bulkCreateEdges).toBe('function');
  });

  it('sends POST /edges/bulk with edges array and returns created edges', async () => {
    /**
     * Verifies that bulkCreateEdges sends a POST request to /edges/bulk with
     * { edges } in the body and resolves to the array of created edges.
     *
     * Why: Same as bulkCreateNodes — the body shape must match exactly.
     *
     * What breaks: Pasted edges never appear because every call returns 422.
     */
    // GIVEN a mock fetch
    const createdEdges: CanvasEdge[] = [makeEdge('e1', 'node-a', 'node-b')];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => createdEdges,
    } as Response);

    // WHEN calling bulkCreateEdges
    const edges = [{ id: 'e1', source_id: 'node-a', target_id: 'node-b' }];
    const result = await api.bulkCreateEdges(edges);

    // THEN fetch was called with the correct endpoint and body
    expect(fetchSpy).toHaveBeenCalledWith('/edges/bulk', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ edges }),
    }));
    expect(result).toEqual(createdEdges);
  });

  it('throws when the server responds with a non-ok status', async () => {
    /**
     * Verifies that bulkCreateEdges throws on a non-2xx server response.
     *
     * Why: Edge paste failures must surface so the user knows connections
     * were not saved.
     *
     * What breaks: Nodes are pasted but their edges are silently dropped,
     * leaving a disconnected subgraph with no indication of the error.
     */
    // GIVEN a server that returns 422
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 422,
    } as Response);

    // WHEN calling bulkCreateEdges
    // THEN it throws
    await expect(
      api.bulkCreateEdges([{ id: 'e1', source_id: 'a', target_id: 'b' }])
    ).rejects.toThrow();
  });
});

// ─── Tests: Cmd+C / Cmd+V keyboard handlers in App ──────────────────────────
// These tests verify the clipboard behavior end-to-end at the App level.
// React Flow's selection cannot be driven by fireEvent in jsdom, so we use
// the test-only multi-select trigger buttons that App.tsx exposes.

describe('App — copy/paste keyboard handlers', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([makeNode('n1'), makeNode('n2')]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);
    vi.spyOn(api, 'patchNode').mockResolvedValue(makeNode('n1'));
    vi.spyOn(api, 'bulkPatchNodes').mockResolvedValue([]);
    vi.spyOn(api, 'bulkCreateNodes').mockResolvedValue([makeNode('pasted-1'), makeNode('pasted-2')]);
    vi.spyOn(api, 'bulkCreateEdges').mockResolvedValue([]);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('Cmd+C does not copy when no nodes are selected', async () => {
    /**
     * Verifies that pressing Cmd+C with no selection does nothing — no API
     * calls are made and the paste handler has nothing to work with.
     *
     * Why: Copying an empty selection is meaningless. If it set the clipboard
     * to an empty array, a subsequent Cmd+V would send an empty bulk create
     * request that the server rejects with 422.
     *
     * What breaks: Paste after an empty copy sends a bad request to the
     * server, causing a 422 error that surfaces as a console error.
     */
    // GIVEN the app is loaded with two nodes, none selected
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="multi-select-node-n1"]')).not.toBeNull();
    });

    // WHEN pressing Cmd+C with no selection
    fireEvent.keyDown(window, { key: 'c', metaKey: true });

    // THEN no bulk create call is triggered even after a subsequent Cmd+V
    fireEvent.keyDown(window, { key: 'v', metaKey: true });
    expect(vi.mocked(api.bulkCreateNodes)).not.toHaveBeenCalled();
  });

  it('Cmd+C is skipped when an input is focused', async () => {
    /**
     * Verifies that Cmd+C does not hijack the clipboard when the user is
     * typing in an input or textarea (e.g. the NodeDetailPanel's title field).
     *
     * Why: The browser's default Cmd+C behavior must work normally inside
     * form fields. If we intercept it, users cannot copy text from inputs.
     *
     * What breaks: Users cannot copy text from the NodeDetailPanel — selecting
     * text in the title input and pressing Cmd+C would copy nodes instead.
     */
    // GIVEN the app is loaded with two nodes selected
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="multi-select-node-n1"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('[data-testid="multi-select-node-n1"]')!);
    fireEvent.click(container.querySelector('[data-testid="multi-select-node-n2"]')!);

    // Create a focused input inside the document to simulate text-editing state
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    // WHEN pressing Cmd+C while input is focused
    fireEvent.keyDown(input, { key: 'c', metaKey: true });

    // THEN no clipboard was set (no subsequent Cmd+V paste triggers bulk create)
    fireEvent.keyDown(window, { key: 'v', metaKey: true });
    expect(vi.mocked(api.bulkCreateNodes)).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('Cmd+V does nothing when clipboard is empty', async () => {
    /**
     * Verifies that pressing Cmd+V when the clipboard is empty does nothing —
     * no API calls are made.
     *
     * Why: Pasting with no clipboard content is a no-op. If we sent a bulk
     * create with an empty array, the server returns 422.
     *
     * What breaks: An accidental Cmd+V on a fresh load would trigger a 422
     * server error logged to the console.
     */
    // GIVEN the app is loaded but Cmd+C was never pressed (clipboard empty)
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="multi-select-node-n1"]')).not.toBeNull();
    });

    // WHEN pressing Cmd+V
    fireEvent.keyDown(window, { key: 'v', metaKey: true });

    // THEN no bulk create is called
    expect(vi.mocked(api.bulkCreateNodes)).not.toHaveBeenCalled();
  });

  it('Cmd+V after Cmd+C calls bulkCreateNodes with remapped IDs', async () => {
    /**
     * Verifies that copy-then-paste sends a bulk create request with new
     * client-generated IDs (not the original node IDs).
     *
     * Why: Pasting with the same IDs would create duplicate-ID conflicts in
     * the DB, causing the insert to fail with a unique constraint violation.
     * New IDs allow the same nodes to coexist on the canvas.
     *
     * What breaks: Paste fails with a DB constraint error, nodes are not
     * created, and the user sees nothing happen.
     */
    // GIVEN the app is loaded with two nodes, both selected
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="multi-select-node-n1"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('[data-testid="multi-select-node-n1"]')!);
    fireEvent.click(container.querySelector('[data-testid="multi-select-node-n2"]')!);

    // WHEN pressing Cmd+C then Cmd+V
    fireEvent.keyDown(window, { key: 'c', metaKey: true });
    fireEvent.keyDown(window, { key: 'v', metaKey: true });

    // THEN bulkCreateNodes is called
    await waitFor(() => {
      expect(vi.mocked(api.bulkCreateNodes)).toHaveBeenCalled();
    });

    // AND the IDs sent are new (not the original 'n1', 'n2')
    const callArg = vi.mocked(api.bulkCreateNodes).mock.calls[0][0];
    const pastedIds = callArg.map((n: { id: string }) => n.id);
    expect(pastedIds).not.toContain('n1');
    expect(pastedIds).not.toContain('n2');
    // Each pasted ID should be a UUID-style string (non-empty)
    for (const id of pastedIds) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });
});
