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

const rootNodeWithDimensions: CanvasNodeData = {
  ...rootNode,
  id: 'root-with-dims',
  width: 300,
  height: 200,
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

  it('newly created child node is parented to the clicked node', async () => {
    /**
     * Verifies that after clicking "+" on a node, the resulting child node
     * appears in the canvas as a child of the clicked node.
     *
     * Why: The parent-child relationship must be correctly established so that
     * the collapse feature works and the child is positioned relative to the
     * parent. We verify the observable end result (the child's DOM element
     * appears nested inside the parent's React Flow node wrapper) rather than
     * asserting on mock internals.
     *
     * What breaks: Clicking "+" creates a floating root node instead of a
     * nested child, or does nothing at all. The hierarchy is never stored.
     */
    // GIVEN a single root node
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([rootNode]);
    vi.spyOn(api, 'createNode').mockResolvedValue(newChildNode);

    // WHEN App mounts and user clicks the add-child button
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="add-child-btn"]')).not.toBeNull();
    });
    const btn = container.querySelector('[data-testid="add-child-btn"]')!;
    fireEvent.click(btn);

    // THEN the child node appears and is nested inside the parent's node element
    await waitFor(() => {
      const childEl = container.querySelector('[data-id="child-new"]');
      expect(childEl).not.toBeNull();
      // The child node wrapper should be contained within the parent node wrapper
      const parentEl = container.querySelector('[data-id="root"]');
      expect(parentEl).not.toBeNull();
      expect(parentEl!.contains(childEl)).toBe(true);
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

  it('parent node gains container dimensions (320x240) on first child creation', async () => {
    /**
     * Verifies that a parent with no DB dimensions (width: null, height: null)
     * receives style.width === 320px and style.height === 240px after its first
     * child is created.
     *
     * Why: React Flow requires parent nodes used as subflow containers (via
     * extent: 'parent') to have explicit dimensions. The default 320×240 gives
     * the child adequate room to move and be repositioned without immediately
     * clipping against the parent edge — the old 200×140 was too small.
     *
     * What breaks: Children of newly-promoted parent nodes clip against the
     * parent border immediately, and the node resizer cannot expand the parent
     * because minHeight isn't respected by the NodeResizer component correctly.
     */
    // GIVEN a root node with no DB dimensions
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([rootNode]);
    vi.spyOn(api, 'createNode').mockResolvedValue(newChildNode);

    // WHEN App mounts and user clicks the add-child button
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="add-child-btn"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('[data-testid="add-child-btn"]')!);

    // THEN the parent node wrapper has width: 320px and height: 240px (not minHeight)
    await waitFor(() => {
      const parentEl = container.querySelector('[data-id="root"]') as HTMLElement | null;
      expect(parentEl).not.toBeNull();
      // React Flow applies node style to the node wrapper element
      expect(parentEl!.style.width).toBe('320px');
      expect(parentEl!.style.height).toBe('240px');
      // Must not use minHeight — NodeResizer doesn't interact well with minHeight
      expect(parentEl!.style.minHeight).toBe('');
    });
  });

  it('parent with existing DB dimensions keeps its style on first child creation', async () => {
    /**
     * Verifies that a parent node whose width/height are already stored in the
     * DB does not have those dimensions overwritten when its first child is
     * created.
     *
     * Why: The default 200×140 dimensions are only a fallback for nodes that
     * have never had their size set. User-resized (or DB-stored) dimensions must
     * be preserved so the canvas layout is stable.
     *
     * What breaks: Adding a child to a manually-resized parent snaps it back to
     * 200×140, losing the user's layout work.
     */
    // GIVEN a root node with explicit DB dimensions (300 × 200)
    const childOfDimsNode: CanvasNodeData = {
      ...newChildNode,
      parent_id: 'root-with-dims',
    };
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([rootNodeWithDimensions]);
    vi.spyOn(api, 'createNode').mockResolvedValue(childOfDimsNode);

    // WHEN App mounts and user clicks the add-child button
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="add-child-btn"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('[data-testid="add-child-btn"]')!);

    // THEN the parent's style keeps the DB dimensions (300 × 200), not the defaults
    await waitFor(() => {
      const childEl = container.querySelector('[data-id="child-new"]');
      expect(childEl).not.toBeNull();
      const parentEl = container.querySelector('[data-id="root-with-dims"]') as HTMLElement | null;
      expect(parentEl).not.toBeNull();
      expect(parentEl!.style.width).toBe('300px');
      expect(parentEl!.style.height).toBe('200px');
    });
  });
});
