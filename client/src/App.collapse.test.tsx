import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const parentNode: CanvasNodeData = {
  id: 'parent',
  parent_id: null,
  title: 'Parent',
  notes: '',
  x: 0,
  y: 0,
  width: null,
  height: null,
  collapsed: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const childNode: CanvasNodeData = {
  id: 'child',
  parent_id: 'parent',
  title: 'Child',
  notes: '',
  x: 50,
  y: 60,
  width: null,
  height: null,
  collapsed: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const collapsedParentNode: CanvasNodeData = {
  ...parentNode,
  id: 'collapsed-parent',
  title: 'Collapsed Parent',
  collapsed: 1,
};

const childOfCollapsedNode: CanvasNodeData = {
  ...childNode,
  id: 'child-of-collapsed',
  parent_id: 'collapsed-parent',
  title: 'Child of Collapsed',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('App — collapse/expand behavior', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'patchNode').mockResolvedValue(parentNode);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows collapse toggle button on nodes that have children', async () => {
    /**
     * Verifies that the ▼/▶ collapse toggle button appears on a node that
     * has at least one child in the tree.
     *
     * Why: The collapse feature is the core differentiating feature of this
     * canvas. If the button doesn't render, users cannot access collapse/
     * expand at all.
     *
     * What breaks: Parent nodes appear identically to leaf nodes; users have
     * no affordance to collapse subtrees.
     */
    // GIVEN a parent node with one child
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentNode, childNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);

    // THEN the collapse button appears on the parent node
    await waitFor(() => {
      const toggleButton = container.querySelector('[data-testid="collapse-toggle"]');
      expect(toggleButton).not.toBeNull();
    });
  });

  it('does not show collapse toggle on leaf nodes (no children)', async () => {
    /**
     * Verifies that the collapse toggle is NOT shown on leaf nodes.
     *
     * Why: Showing a non-functional toggle on leaf nodes would confuse users
     * and clutter the UI. The toggle should only appear when there are
     * descendants to hide.
     *
     * What breaks: Leaf nodes show a collapse button that does nothing, making
     * the UI feel broken and misleading.
     */
    // GIVEN only a single root node with no children
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);

    // WHEN App mounts
    const { container } = render(<App />);

    // THEN no collapse button is rendered
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });
    const toggleButtons = container.querySelectorAll('[data-testid="collapse-toggle"]');
    expect(toggleButtons).toHaveLength(0);
  });

  it('hides child nodes on canvas after they are initially loaded with a collapsed parent', async () => {
    /**
     * Verifies that when a node has collapsed=1 in the DB, its children are
     * loaded with hidden:true so they are invisible on initial render.
     *
     * Why: Collapse state must persist across page reloads. If the hidden flag
     * is not applied on load, a "collapsed" parent will show its children
     * immediately on page load, defeating the purpose of persistence.
     *
     * What breaks: After a page reload, previously collapsed subtrees become
     * fully visible again, requiring the user to re-collapse manually.
     */
    // GIVEN a collapsed parent and its child loaded from DB
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([
      collapsedParentNode,
      childOfCollapsedNode,
    ]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the child node text is NOT rendered (it is hidden)
    // React Flow's `hidden: true` removes the node from the DOM
    await waitFor(() => {
      // The child node title should not be present since it's hidden
      expect(container.querySelector('[data-id="child-of-collapsed"]')).toBeNull();
    });
  });

  it('persists collapsed state to server when toggle is clicked', async () => {
    /**
     * Verifies that clicking the collapse toggle calls patchNode with the
     * new collapsed value so the state persists across reloads.
     *
     * Why: Without server persistence, collapsed state is lost on page reload.
     * The patchNode call is the only mechanism ensuring SQLite records the
     * collapsed flag.
     *
     * What breaks: User collapses a node, refreshes the page, and finds the
     * node expanded again — the collapse action had no durable effect.
     */
    // GIVEN a parent node with one child, parent is currently expanded
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentNode, childNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);
    const patchSpy = vi.spyOn(api, 'patchNode').mockResolvedValue(parentNode);

    // WHEN App mounts and user clicks the collapse toggle
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="collapse-toggle"]')).not.toBeNull();
    });
    const toggleButton = container.querySelector('[data-testid="collapse-toggle"]')!;
    fireEvent.click(toggleButton);

    // THEN patchNode is called with collapsed: 1 for the parent node
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('parent', expect.objectContaining({ collapsed: 1 }));
    });
  });

  it('hides edges connected to hidden nodes when a parent is collapsed', async () => {
    /**
     * Verifies that edges whose source or target is a hidden descendant are
     * also hidden when a parent is collapsed.
     *
     * Why: If only nodes are hidden but edges remain visible, the canvas
     * shows floating edge lines dangling with no visible endpoints — a broken
     * visual state.
     *
     * What breaks: After collapsing a parent, edges between its hidden children
     * remain visible as floating arrows on the canvas.
     */
    // GIVEN a parent, two children, and an edge between the children
    const sibling1: CanvasNodeData = { ...childNode, id: 'sibling1', parent_id: 'parent', title: 'Sibling 1' };
    const sibling2: CanvasNodeData = { ...childNode, id: 'sibling2', parent_id: 'parent', title: 'Sibling 2' };
    const edgeBetweenSiblings: CanvasEdge = {
      id: 'e-siblings',
      source_id: 'sibling1',
      target_id: 'sibling2',
      source_handle: null,
      target_handle: null,
      label: null,
      created_at: '2024-01-01T00:00:00Z',
    };

    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentNode, sibling1, sibling2]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([edgeBetweenSiblings]);

    // WHEN App mounts and user clicks the collapse toggle on the parent
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="collapse-toggle"]')).not.toBeNull();
    });
    const toggleButton = container.querySelector('[data-testid="collapse-toggle"]')!;
    fireEvent.click(toggleButton);

    // THEN the edge between siblings is no longer in the DOM
    await waitFor(() => {
      // React Flow renders edges in .react-flow__edge elements; hidden edges are removed from DOM
      const edgeEl = container.querySelector('[data-id="e-siblings"]');
      expect(edgeEl).toBeNull();
    });
  });
});
