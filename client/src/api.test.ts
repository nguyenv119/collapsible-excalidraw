import { describe, it, expect, vi, afterEach } from 'vitest';
import { patchNode } from './api';

describe('patchNode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed server response for a successful patch', async () => {
    /**
     * patchNode resolves with the JSON body returned by the server on a
     * successful (2xx) response.
     *
     * Why: Callers depend on the returned object to update local React Flow
     * state with server-confirmed values (e.g. updated_at). If patchNode
     * returns undefined or a raw Response, the local state diverges from the
     * server.
     *
     * What breaks: After dragging a node, the local state holds stale data
     * and subsequent patches may overwrite server-side changes.
     */
    // GIVEN a server that responds with the updated node
    const serverResponse = {
      id: 'node-1',
      parent_id: null,
      title: 'Test',
      notes: '',
      x: 42,
      y: 99,
      collapsed: 0 as const,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:01Z',
    };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(serverResponse),
      } as unknown as Response)
    );

    // WHEN patching a node's position
    const result = await patchNode('node-1', { x: 42, y: 99 });

    // THEN the parsed server response is returned
    expect(result).toEqual(serverResponse);
  });

  it('throws when the server responds with a non-OK status', async () => {
    /**
     * patchNode rejects with an Error when the server returns a non-2xx
     * HTTP status (e.g. 404 for an unknown node ID).
     *
     * Why: A silent failure hides server-side problems, making it impossible
     * to diagnose why position updates are not persisting.
     *
     * What breaks: Callers receive a resolved promise with garbage data
     * instead of a rejection, so error-handling code paths never trigger
     * and failures are invisible in the UI.
     */
    // GIVEN a server that returns 404
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response)
    );

    // WHEN patching a non-existent node
    // THEN patchNode rejects with a descriptive error
    await expect(patchNode('nonexistent', { x: 0, y: 0 })).rejects.toThrow(
      'patchNode failed: 404'
    );
  });
});
