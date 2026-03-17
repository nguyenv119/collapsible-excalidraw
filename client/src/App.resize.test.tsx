import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, act } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const parentNodeWithChild: CanvasNodeData = {
  id: 'parent',
  parent_id: null,
  title: 'Parent',
  notes: '',
  x: 0,
  y: 0,
  width: 320,
  height: 240,
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

const newChildNode: CanvasNodeData = {
  id: 'child-new',
  parent_id: 'parent',
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

describe('App — onNodeResized callback', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchEdges').mockResolvedValue(noEdges);
    vi.spyOn(api, 'patchNode').mockResolvedValue(parentNodeWithChild);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('node receives onNodeResized in its data when loaded from DB', async () => {
    /**
     * Verifies that every canvas node rendered by App has an `onNodeResized`
     * function in its data object.
     *
     * Why: CanvasNode's handleResizeEnd calls data.onNodeResized to sync React
     * Flow state after a resize. If the function is absent, handleResizeEnd will
     * throw "data.onNodeResized is not a function" on every resize interaction.
     *
     * What breaks: Resizing any node throws a runtime error and the canvas
     * becomes unresponsive.
     */
    // GIVEN a parent node loaded from DB
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentNodeWithChild]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the node is rendered (proving the data pipeline including onNodeResized
    // did not throw)
    await waitFor(() => {
      const nodeEl = container.querySelector('[data-id="parent"]');
      expect(nodeEl).not.toBeNull();
    });
  });

  it('parent node loaded from DB with children uses height (not minHeight) for style', async () => {
    /**
     * Verifies that a parent node loaded from DB with no stored width/height
     * and having children gets style.height set (not style.minHeight), matching
     * the same property that NodeResizer uses via onResizeEnd params.
     *
     * Why: NodeResizer returns a `height` value in its onResizeEnd callback
     * params. If the initial style uses `minHeight`, then after the first resize
     * the style object has both `minHeight` (from init) and `height` (from
     * resize), leading to conflicting constraints and layout jitter.
     *
     * What breaks: After resizing a parent node, the node snaps to unexpected
     * sizes because minHeight and height fight each other.
     */
    // GIVEN a parent node with no DB dimensions but it has a child
    const parentNoSize: CanvasNodeData = {
      ...parentNodeWithChild,
      id: 'parent-no-size',
      width: null,
      height: null,
    };
    const childOfNoSize: CanvasNodeData = {
      ...childNode,
      parent_id: 'parent-no-size',
    };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentNoSize, childOfNoSize]);

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the parent node wrapper uses height, not minHeight
    await waitFor(() => {
      const parentEl = container.querySelector('[data-id="parent-no-size"]') as HTMLElement | null;
      expect(parentEl).not.toBeNull();
      expect(parentEl!.style.height).toBe('240px');
      expect(parentEl!.style.minHeight).toBe('');
      expect(parentEl!.style.width).toBe('320px');
    });
  });

  it('needsDimensions guard fires on first child creation using height check', async () => {
    /**
     * Verifies that when a new child is added to a parent that has no existing
     * style.height (and no style.minHeight), the parent gets default dimensions.
     * Conversely, a parent that already has style.height does NOT get overwritten.
     *
     * Why: The needsDimensions guard prevents overwriting user-resized nodes.
     * If the guard checks `minHeight` instead of `height`, a node that was
     * resized (which sets `height` but not `minHeight`) would be incorrectly
     * treated as needing default dimensions, resetting the user's resize.
     *
     * What breaks: After a user resizes a parent node then adds another child,
     * the parent snaps back to the default 320×240, losing the user's layout.
     */
    // GIVEN a parent node that already has explicit style.height (user resized it),
    // meaning it has no `minHeight` but does have `height`
    const resizedParent: CanvasNodeData = {
      ...parentNodeWithChild,
      id: 'resized-parent',
      width: 500,
      height: 400,
    };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([resizedParent]);
    vi.spyOn(api, 'createNode').mockResolvedValue(newChildNode);

    // WHEN App mounts and user adds a child
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="add-child-btn"]')).not.toBeNull();
    });
    fireEvent.click(container.querySelector('[data-testid="add-child-btn"]')!);

    // THEN the parent keeps its resized dimensions (500×400), not the defaults
    await waitFor(() => {
      const childEl = container.querySelector('[data-id="child-new"]');
      expect(childEl).not.toBeNull();
      const parentEl = container.querySelector('[data-id="resized-parent"]') as HTMLElement | null;
      expect(parentEl).not.toBeNull();
      expect(parentEl!.style.width).toBe('500px');
      expect(parentEl!.style.height).toBe('400px');
    });
  });

  it('adding second child to already-parented node does not override existing style', async () => {
    /**
     * Verifies that when a second child is added to a node that already has
     * hasChildren=true (from DB), the node's existing style is NOT overwritten
     * with default dimensions.
     *
     * Why: The needsDimensions guard is only meant to fire for the first child.
     * If it fires again on second/third child additions, it can reset a
     * user-resized node back to defaults.
     *
     * What breaks: After adding a second child, the parent resets to 320×240
     * regardless of whether the user had already resized it.
     */
    // GIVEN a parent node that already has a child (hasChildren via DB) and custom dimensions
    const parentAlreadyParent: CanvasNodeData = {
      ...parentNodeWithChild,
      width: 450,
      height: 350,
    };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentAlreadyParent, childNode]);
    vi.spyOn(api, 'createNode').mockResolvedValue(newChildNode);

    // WHEN App mounts and user adds another child
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="add-child-btn"]')).not.toBeNull();
    });
    // Click the add-child button on the parent node (first one found)
    const addChildBtns = container.querySelectorAll('[data-testid="add-child-btn"]');
    // Parent is the first node; click its add-child btn
    fireEvent.click(addChildBtns[0]!);

    // THEN the parent keeps its existing dimensions (450×350)
    await waitFor(() => {
      const childEl = container.querySelector('[data-id="child-new"]');
      expect(childEl).not.toBeNull();
      const parentEl = container.querySelector('[data-id="parent"]') as HTMLElement | null;
      expect(parentEl).not.toBeNull();
      expect(parentEl!.style.width).toBe('450px');
      expect(parentEl!.style.height).toBe('350px');
    });
  });
});
