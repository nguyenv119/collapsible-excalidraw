import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeNode = (id: string, overrides: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
  id,
  parent_id: null,
  title: `Node ${id}`,
  notes: '',
  x: 0,
  y: 0,
  width: 200,
  height: 100,
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

const noEdges: CanvasEdge[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulate multi-selection using the test-only trigger buttons.
 * React Flow's onSelectionChange cannot be driven by fireEvent in jsdom.
 */
function multiSelectNode(container: HTMLElement, nodeId: string) {
  const trigger = container.querySelector(`[data-testid="multi-select-node-${nodeId}"]`);
  if (!trigger) throw new Error(`multi-select trigger for ${nodeId} not found`);
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/**
 * Simulate proportional resize by calling the onProportionalResize callback
 * on the node's React Flow data. We do this through the test-only resize trigger
 * buttons exposed by App in test mode.
 */
function triggerProportionalResize(
  container: HTMLElement,
  nodeId: string,
  scaleX: number,
  scaleY: number
) {
  const trigger = container.querySelector(
    `[data-testid="proportional-resize-trigger-${nodeId}"]`
  );
  if (!trigger) throw new Error(`proportional-resize trigger for ${nodeId} not found`);
  // The trigger button stores scaleX/scaleY as data attributes and fires onClick
  (trigger as HTMLElement).dataset.scaleX = String(scaleX);
  (trigger as HTMLElement).dataset.scaleY = String(scaleY);
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('App — proportional resize: other selected nodes scale together', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchEdges').mockResolvedValue(noEdges);
    vi.spyOn(api, 'patchNode').mockResolvedValue(makeNode('a'));
    vi.spyOn(api, 'bulkPatchNodes').mockResolvedValue([makeNode('a'), makeNode('b')]);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('when two nodes are selected and one is resized, the other scales by the same factor', async () => {
    /**
     * Verifies that when node A and node B are both selected, and node A is
     * resized from 200×100 to 400×200 (scaleX=2, scaleY=2), node B's dimensions
     * are also doubled (from 200×100 to 400×200).
     *
     * Why: This is the core KC-4.3 contract. Without proportional resize, the user
     * must manually resize each selected node to match. Proportional resize preserves
     * relative sizing across a multi-selection, which is the Figma/Keynote parity
     * feature users expect.
     *
     * What breaks: Resizing one node in a selection has no effect on the others;
     * the node group becomes differently-sized after every resize interaction.
     */
    // GIVEN two nodes both loaded with explicit dimensions (200×100)
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([
      makeNode('a', { width: 200, height: 100 }),
      makeNode('b', { width: 200, height: 100 }),
    ]);

    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // WHEN both nodes are selected and node A is proportionally resized (scale 2×)
    act(() => {
      multiSelectNode(container, 'a');
      multiSelectNode(container, 'b');
    });

    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="proportional-resize-trigger-a"]')
      ).not.toBeNull();
    });

    act(() => {
      triggerProportionalResize(container, 'a', 2, 2);
    });

    // THEN node B's rendered style reflects the 2× scale (200×100 → 400×200)
    await waitFor(() => {
      const nodeB = container.querySelector('[data-id="b"]') as HTMLElement | null;
      expect(nodeB).not.toBeNull();
      expect(nodeB!.style.width).toBe('400px');
      expect(nodeB!.style.height).toBe('200px');
    });
  });

  it('proportional resize calls bulkPatchNodes to persist all scaled nodes', async () => {
    /**
     * Verifies that a proportional resize triggers bulkPatchNodes with the
     * scaled dimensions for all affected (non-resizing) selected nodes.
     *
     * Why: Without persistence, the scaled layout is lost on page reload.
     * Using bulkPatchNodes (rather than individual patchNode calls) ensures
     * the resize is atomic — all nodes update together or none do.
     *
     * What breaks: After reloading the page, other nodes snap back to their
     * pre-resize sizes even though they appeared scaled during the session.
     */
    // GIVEN two nodes with explicit dimensions
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([
      makeNode('a', { width: 200, height: 100 }),
      makeNode('b', { width: 200, height: 100 }),
    ]);
    const bulkSpy = vi.spyOn(api, 'bulkPatchNodes').mockResolvedValue([]);

    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // WHEN both nodes are selected and a 2× proportional resize fires
    act(() => {
      multiSelectNode(container, 'a');
      multiSelectNode(container, 'b');
    });

    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="proportional-resize-trigger-a"]')
      ).not.toBeNull();
    });

    act(() => {
      triggerProportionalResize(container, 'a', 2, 2);
    });

    // THEN bulkPatchNodes is called with node B's new dimensions
    await waitFor(() => {
      expect(bulkSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'b', width: 400, height: 200 }),
        ])
      );
    });
  });

  it('proportional resize skips nodes without explicit style.width/height', async () => {
    /**
     * Verifies that nodes without explicit style dimensions (auto-sized leaf nodes)
     * are skipped during proportional resize — they are not scaled and not included
     * in the bulkPatchNodes call.
     *
     * Why: Auto-sized nodes have no stored width/height (both null in DB). Applying
     * a scale factor to `undefined * scaleX` would produce NaN dimensions, corrupting
     * the node's style object.
     *
     * What breaks: Auto-sized nodes get NaN width/height after a proportional resize,
     * causing them to disappear or render with zero size.
     */
    // GIVEN node A has explicit dims (200×100), node C has no stored dims (null)
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([
      makeNode('a', { width: 200, height: 100 }),
      makeNode('c', { width: null, height: null }),
    ]);
    const bulkSpy = vi.spyOn(api, 'bulkPatchNodes').mockResolvedValue([]);

    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // WHEN both are selected and node A is proportionally resized (2×)
    act(() => {
      multiSelectNode(container, 'a');
      multiSelectNode(container, 'c');
    });

    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="proportional-resize-trigger-a"]')
      ).not.toBeNull();
    });

    act(() => {
      triggerProportionalResize(container, 'a', 2, 2);
    });

    // THEN bulkPatchNodes is NOT called (no scalable nodes in the "other" set)
    // — node C was skipped because it has no explicit dimensions
    await waitFor(() => {
      // Give the event loop time to flush any async calls
      return new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(bulkSpy).not.toHaveBeenCalled();
  });

  it('proportional resize enforces minimum dimensions of 150×60', async () => {
    /**
     * Verifies that when a scale factor would shrink a node below 150px wide or
     * 60px tall, the dimensions are clamped to the minimum (150×60).
     *
     * Why: React Flow's NodeResizer already enforces minWidth=150/minHeight=60 for
     * direct resizes. Proportional resize must apply the same floor so that a very
     * small scale factor (e.g. 0.1×) doesn't produce unreadably tiny nodes.
     *
     * What breaks: Proportional resizes can produce nodes smaller than the minimum
     * resize threshold, making them impossible to interact with or read.
     */
    // GIVEN node B is 200×100 and both nodes are selected
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([
      makeNode('a', { width: 200, height: 100 }),
      makeNode('b', { width: 200, height: 100 }),
    ]);
    vi.spyOn(api, 'bulkPatchNodes').mockResolvedValue([]);

    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // WHEN both selected and node A resizes with scaleX=0.5, scaleY=0.5
    // (200×0.5=100 < 150 min, 100×0.5=50 < 60 min)
    act(() => {
      multiSelectNode(container, 'a');
      multiSelectNode(container, 'b');
    });

    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="proportional-resize-trigger-a"]')
      ).not.toBeNull();
    });

    act(() => {
      triggerProportionalResize(container, 'a', 0.5, 0.5);
    });

    // THEN node B is clamped at minimum dimensions (150×60), not (100×50)
    await waitFor(() => {
      const nodeB = container.querySelector('[data-id="b"]') as HTMLElement | null;
      expect(nodeB).not.toBeNull();
      expect(nodeB!.style.width).toBe('150px');
      expect(nodeB!.style.height).toBe('60px');
    });
  });

  it('proportional resize updates expandedStylesRef for collapsed parent nodes', async () => {
    /**
     * Verifies that when a collapsed parent node is in the multi-selection and
     * a proportional resize fires, its expandedStylesRef entry is updated with
     * the scaled dimensions (not its current collapsed height).
     *
     * Why: Collapsed nodes visually show only a header bar (COLLAPSED_HEIGHT),
     * not their full dimensions. If we scaled the visible style.height, we'd
     * apply the scale factor to 52px instead of the real expanded height, giving
     * wrong proportions on expand.
     *
     * What breaks: After expanding a collapsed node that was proportionally
     * resized, it expands to a wrong size (too small or based on 52px × scale).
     */
    // GIVEN node A (explicit dims, not collapsed) and node B (parent with child, collapsed)
    // REVIEW: mocking core dependency — test may not reflect real behavior
    const parentNode: CanvasNodeData = makeNode('b', { width: 320, height: 240, collapsed: 1 });
    const childNode: CanvasNodeData = { ...makeNode('child'), parent_id: 'b', width: null, height: null };
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([
      makeNode('a', { width: 200, height: 100 }),
      parentNode,
      childNode,
    ]);
    const bulkSpy = vi.spyOn(api, 'bulkPatchNodes').mockResolvedValue([]);

    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // WHEN both A and B are multi-selected and node A fires a 2× proportional resize
    act(() => {
      multiSelectNode(container, 'a');
      multiSelectNode(container, 'b');
    });

    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="proportional-resize-trigger-a"]')
      ).not.toBeNull();
    });

    act(() => {
      triggerProportionalResize(container, 'a', 2, 2);
    });

    // THEN bulkPatchNodes includes node B's scaled dimensions (320×2=640, 240×2=480)
    // (the collapsed node's expanded dimensions, not 52px × 2)
    await waitFor(() => {
      expect(bulkSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'b', width: 640, height: 480 }),
        ])
      );
    });
  });
});
