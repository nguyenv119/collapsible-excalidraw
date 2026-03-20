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
  x: id === 'a' ? 0 : 200,
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

const noEdges: CanvasEdge[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulate multi-selection of both nodes using the test-only trigger buttons.
 *
 * React Flow's onSelectionChange cannot be driven by fireEvent in jsdom —
 * React Flow manages its own selection state in SVG/canvas elements that are
 * not rendered by jsdom. App.tsx renders hidden test-only trigger buttons
 * (data-testid="multi-select-node-<id>") that directly call setSelectedNodeIds,
 * mirroring exactly what onSelectionChange would do in a real browser.
 */
async function selectBothNodes(
  container: HTMLElement,
  nodeAId: string,
  nodeBId: string
) {
  // Click the test trigger for node A (adds A to selection)
  const triggerA = container.querySelector(`[data-testid="multi-select-node-${nodeAId}"]`);
  expect(triggerA).not.toBeNull();
  fireEvent.click(triggerA!);

  // Click the test trigger for node B (adds B to selection → multi-select)
  const triggerB = container.querySelector(`[data-testid="multi-select-node-${nodeBId}"]`);
  expect(triggerB).not.toBeNull();
  fireEvent.click(triggerB!);
}

// ─── Tests: MultiSelectPanel visibility ───────────────────────────────────────

describe('App — MultiSelectPanel: renders when multiple nodes are selected', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([makeNode('a'), makeNode('b')]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue(noEdges);
    vi.spyOn(api, 'patchNode').mockResolvedValue(makeNode('a'));
    vi.spyOn(api, 'bulkPatchNodes').mockResolvedValue([makeNode('a'), makeNode('b')]);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('MultiSelectPanel is absent when no nodes are selected', async () => {
    /**
     * Verifies that the multi-select style panel does not render when nothing
     * is selected.
     *
     * Why: Showing the panel with no selection context would confuse users —
     * they would see style controls with no target to apply them to.
     *
     * What breaks: The multi-select panel is always visible, occupying screen
     * space and misleading users into thinking a style change will apply.
     */
    // GIVEN App loads with two nodes
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // WHEN no nodes are selected (initial state)

    // THEN the multi-select panel is absent
    expect(container.querySelector('[data-testid="multi-select-panel"]')).toBeNull();
  });

  it('MultiSelectPanel is absent when only one node is selected', async () => {
    /**
     * Verifies that selecting a single node shows NodeDetailPanel (the per-node
     * editor), NOT the MultiSelectPanel.
     *
     * Why: With one node selected the user wants to edit that node's title,
     * notes, and styles individually. The multi-select panel only makes sense
     * when multiple nodes share the same style action.
     *
     * What breaks: The single-select workflow is broken — clicking one node
     * shows the bulk style panel instead of the individual node editor.
     */
    // GIVEN App loads with two nodes
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // WHEN one node's test trigger is clicked (single-select via multi-select trigger for just one node)
    const triggerA = container.querySelector('[data-testid="multi-select-node-a"]');
    expect(triggerA).not.toBeNull();
    fireEvent.click(triggerA!);

    // THEN MultiSelectPanel is not present; NodeDetailPanel is present
    await waitFor(() => {
      expect(container.querySelector('[data-testid="multi-select-panel"]')).toBeNull();
    });
    // NodeDetailPanel shows when a single node is selected
    expect(container.querySelector('.kc-panel')).not.toBeNull();
  });
});

// ─── Tests: MultiSelectPanel style application ────────────────────────────────

describe('App — MultiSelectPanel: style swatches call bulkPatchNodes on all selected nodes', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([makeNode('a'), makeNode('b')]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue(noEdges);
    vi.spyOn(api, 'patchNode').mockResolvedValue(makeNode('a'));
    vi.spyOn(api, 'bulkPatchNodes').mockResolvedValue([makeNode('a'), makeNode('b')]);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('MultiSelectPanel header shows count of selected nodes', async () => {
    /**
     * Verifies that the multi-select panel header displays how many nodes
     * are currently selected (e.g. "2 nodes selected").
     *
     * Why: The user needs confirmation of how many nodes will be affected
     * by a bulk style change. Without the count, they might accidentally
     * apply a style to more nodes than intended.
     *
     * What breaks: The user cannot tell how many nodes are in the selection
     * without counting manually on the canvas.
     */
    // GIVEN App loads with two nodes
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // WHEN both nodes are selected via Shift+click
    await selectBothNodes(container, 'a', 'b');

    // THEN the multi-select panel header shows "2 nodes selected"
    await waitFor(() => {
      const panel = container.querySelector('[data-testid="multi-select-panel"]');
      expect(panel).not.toBeNull();
      expect(panel!.textContent).toMatch(/2\s*nodes?\s+selected/i);
    });
  });

  it('clicking a bg swatch in MultiSelectPanel calls bulkPatchNodes with bg_color for all selected IDs', async () => {
    /**
     * Verifies that clicking a fill color swatch in the multi-select panel
     * calls bulkPatchNodes with bg_color set on each selected node's patch.
     *
     * Why: This is the core contract of KC-4.2 — bulk style application.
     * If bulkPatchNodes is not called (or called with individual patchNode),
     * the style either fails to persist atomically or only applies to one node.
     *
     * What breaks: Users select multiple nodes, click a fill color, and only
     * one node gets the color while others are unchanged on reload.
     */
    // GIVEN App loads with two nodes
    const bulkSpy = vi.spyOn(api, 'bulkPatchNodes').mockResolvedValue([makeNode('a'), makeNode('b')]);
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // WHEN both nodes are selected and a fill swatch is clicked
    await selectBothNodes(container, 'a', 'b');

    await waitFor(() => {
      expect(container.querySelector('[data-testid="multi-select-panel"]')).not.toBeNull();
    });

    const pinkSwatch = container.querySelector('[data-testid="multi-bg-swatch-pink"]');
    expect(pinkSwatch).not.toBeNull();
    fireEvent.click(pinkSwatch!);

    // THEN bulkPatchNodes is called with both node IDs and the selected bg_color
    await waitFor(() => {
      expect(bulkSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'a', bg_color: '#fce7f3' }),
          expect.objectContaining({ id: 'b', bg_color: '#fce7f3' }),
        ])
      );
    });
  });

  it('clicking a stroke swatch in MultiSelectPanel calls bulkPatchNodes with border_color', async () => {
    /**
     * Verifies that clicking a stroke color swatch in the multi-select panel
     * calls bulkPatchNodes with border_color on all selected nodes.
     *
     * Why: Stroke color is one of the style dimensions in StyleControls.
     * The multi-select panel must wire all style controls to bulkPatchNodes,
     * not just bg_color.
     *
     * What breaks: Stroke color changes in multi-select mode are silently
     * dropped or only applied to one node.
     */
    // GIVEN App loads with two nodes
    const bulkSpy = vi.spyOn(api, 'bulkPatchNodes').mockResolvedValue([makeNode('a'), makeNode('b')]);
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // WHEN both nodes are selected and a stroke swatch is clicked
    await selectBothNodes(container, 'a', 'b');

    await waitFor(() => {
      expect(container.querySelector('[data-testid="multi-select-panel"]')).not.toBeNull();
    });

    const redStrokeSwatch = container.querySelector('[data-testid="multi-stroke-swatch-red"]');
    expect(redStrokeSwatch).not.toBeNull();
    fireEvent.click(redStrokeSwatch!);

    // THEN bulkPatchNodes is called with border_color for both nodes
    await waitFor(() => {
      expect(bulkSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'a', border_color: '#ef4444' }),
          expect.objectContaining({ id: 'b', border_color: '#ef4444' }),
        ])
      );
    });
  });
});

// ─── Tests: mixed-state detection ────────────────────────────────────────────

describe('App — MultiSelectPanel: mixed-state detection for swatch highlights', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('when all selected nodes share the same bg_color, that swatch is highlighted', async () => {
    /**
     * Verifies that when all selected nodes share the same bg_color value,
     * the corresponding fill swatch is rendered with the active class.
     *
     * Why: If the selection is homogeneous, showing the active swatch gives
     * the user a clear read-back of the current state. Without it, the panel
     * looks blank even though all nodes share a value.
     *
     * What breaks: Users cannot tell which color is currently applied to
     * their multi-selection; the panel always shows no active swatch.
     */
    // GIVEN two nodes both with bg_color pink
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([
      makeNode('a', { bg_color: '#fce7f3' }),
      makeNode('b', { bg_color: '#fce7f3' }),
    ]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue(noEdges);
    vi.spyOn(api, 'patchNode').mockResolvedValue(makeNode('a'));
    vi.spyOn(api, 'bulkPatchNodes').mockResolvedValue([]);

    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // WHEN both nodes are selected
    await selectBothNodes(container, 'a', 'b');

    // THEN the pink fill swatch is active
    await waitFor(() => {
      const panel = container.querySelector('[data-testid="multi-select-panel"]');
      expect(panel).not.toBeNull();
      const pinkSwatch = container.querySelector('[data-testid="multi-bg-swatch-pink"]');
      expect(pinkSwatch).not.toBeNull();
      expect(pinkSwatch!.classList.contains('kc-swatch--active')).toBe(true);
    });
  });

  it('when selected nodes have different bg_color values, no fill swatch is highlighted', async () => {
    /**
     * Verifies that when the selected nodes have different bg_color values,
     * no fill swatch is rendered as active (the indeterminate/mixed state).
     *
     * Why: Highlighting a swatch when values are mixed would mislead the user
     * into thinking one color is dominant. The correct UI is to show no swatch
     * as active, clearly signaling a mixed state.
     *
     * What breaks: The panel highlights one color arbitrarily (e.g. the first
     * node's color), confusing users who think all nodes share that color.
     */
    // GIVEN two nodes with different bg_colors
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([
      makeNode('a', { bg_color: '#fce7f3' }),  // pink
      makeNode('b', { bg_color: '#dcfce7' }),  // mint
    ]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue(noEdges);
    vi.spyOn(api, 'patchNode').mockResolvedValue(makeNode('a'));
    vi.spyOn(api, 'bulkPatchNodes').mockResolvedValue([]);

    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // WHEN both nodes are selected
    await selectBothNodes(container, 'a', 'b');

    // THEN no fill swatch is active (mixed state — no dominant value)
    await waitFor(() => {
      const panel = container.querySelector('[data-testid="multi-select-panel"]');
      expect(panel).not.toBeNull();
      const activeSwatches = container.querySelectorAll(
        '[data-testid^="multi-bg-swatch-"].kc-swatch--active'
      );
      expect(activeSwatches.length).toBe(0);
    });
  });
});

