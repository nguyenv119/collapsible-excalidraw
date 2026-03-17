import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const rootNode: CanvasNodeData = {
  id: 'root',
  parent_id: null,
  title: 'Root Node',
  notes: '',
  x: 0,
  y: 0,
  width: null,
  height: null,
  collapsed: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const newChildNode: CanvasNodeData = {
  id: 'child-new',
  parent_id: 'root',
  title: 'New Node',
  notes: '',
  x: 50,
  y: 60,
  width: null,
  height: null,
  collapsed: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const noEdges: CanvasEdge[] = [];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('App — add child node behavior', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchEdges').mockResolvedValue(noEdges);
    vi.spyOn(api, 'patchNode').mockResolvedValue(rootNode);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows add-child button on every canvas node', async () => {
    /**
     * Verifies that a "+" button with data-testid="add-child-btn" is visible
     * on every rendered node, regardless of whether it already has children.
     *
     * Why: The add-child button is the primary affordance for creating nested
     * nodes. If it doesn't appear, users cannot build parent-child relationships
     * and the collapse feature becomes permanently inaccessible.
     *
     * What breaks: Nodes appear with no way to create children; the entire
     * collapse/expand differentiating feature is unreachable from the UI.
     */
    // GIVEN a single root node with no children
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([rootNode]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);

    // THEN the add-child button is visible on the node
    await waitFor(() => {
      const btn = container.querySelector('[data-testid="add-child-btn"]');
      expect(btn).not.toBeNull();
    });
  });

  it('clicking add-child button calls createNode with parent_id', async () => {
    /**
     * Verifies that clicking the "+" button on a node calls createNode with
     * the node's ID as parent_id, triggering a POST /nodes request.
     *
     * Why: createNode is the only mechanism to persist the parent-child
     * relationship in SQLite. If it's not called with the correct parent_id,
     * the child is either not created or created as a root node.
     *
     * What breaks: Clicking "+" creates a floating root node instead of a
     * nested child, or does nothing at all. The hierarchy is never stored.
     */
    // GIVEN a single root node
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([rootNode]);
    const createSpy = vi.spyOn(api, 'createNode').mockResolvedValue(newChildNode);

    // WHEN App mounts and user clicks the add-child button
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="add-child-btn"]')).not.toBeNull();
    });
    const btn = container.querySelector('[data-testid="add-child-btn"]')!;
    fireEvent.click(btn);

    // THEN createNode is called with parent_id pointing to root
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ parent_id: 'root' })
      );
    });
  });

  it('parent shows collapse toggle after its first child is created', async () => {
    /**
     * Verifies that after clicking the add-child button and the child node
     * is created, the parent node gains a collapse toggle button.
     *
     * Why: The collapse toggle only appears when hasChildren is true. If the
     * parent's hasChildren flag isn't updated after child creation, the toggle
     * never appears and the collapse feature remains inaccessible.
     *
     * What breaks: After creating a child, the parent looks exactly like a
     * leaf node. The user cannot collapse/expand the newly-formed subtree.
     */
    // GIVEN a root node (no children yet)
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([rootNode]);
    vi.spyOn(api, 'createNode').mockResolvedValue(newChildNode);

    // WHEN App mounts and user clicks the add-child button
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="add-child-btn"]')).not.toBeNull();
    });
    // Confirm no collapse toggle before child is added
    expect(container.querySelector('[data-testid="collapse-toggle"]')).toBeNull();

    const btn = container.querySelector('[data-testid="add-child-btn"]')!;
    fireEvent.click(btn);

    // THEN the collapse toggle appears on the parent
    await waitFor(() => {
      expect(container.querySelector('[data-testid="collapse-toggle"]')).not.toBeNull();
    });
  });

  it('newly created child node appears in the canvas', async () => {
    /**
     * Verifies that after clicking the add-child button, a new node with the
     * child's title appears in the React Flow canvas.
     *
     * Why: The child node must be added to React Flow state after API creation
     * so users see immediate feedback. Without this, the user has to manually
     * refresh the page to see the child they just created.
     *
     * What breaks: After clicking "+", nothing appears. The user is confused
     * and may click again, creating duplicates, or must reload to see their work.
     */
    // GIVEN a root node with no children
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([rootNode]);
    vi.spyOn(api, 'createNode').mockResolvedValue(newChildNode);

    // WHEN App mounts and user clicks the add-child button
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="add-child-btn"]')).not.toBeNull();
    });
    const btn = container.querySelector('[data-testid="add-child-btn"]')!;
    fireEvent.click(btn);

    // THEN a node with the child's ID appears in the DOM
    await waitFor(() => {
      const childEl = container.querySelector('[data-id="child-new"]');
      expect(childEl).not.toBeNull();
    });
  });
});
