import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockNode: CanvasNodeData = {
  id: 'n1',
  parent_id: null,
  title: 'Alpha',
  notes: 'some notes',
  x: 10,
  y: 20,
  width: 200,
  height: 120,
  collapsed: 0,
  border_color: null,
  bg_color: null,
  border_width: null,
  border_style: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const noEdges: CanvasEdge[] = [];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('App — drag and zoom configuration', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([mockNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue(noEdges);
    vi.spyOn(api, 'patchNode').mockResolvedValue(mockNode);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('node renders successfully after removing dragHandle restriction', async () => {
    /**
     * Verifies that canvas nodes render successfully when no dragHandle
     * selector is applied — the full node surface is the drag target.
     *
     * Why: `dragHandle: '.kc-node__header'` restricted drag initiation to
     * just the header strip. Removing it restores intuitive drag behavior
     * where the whole node body acts as a grab surface. The node must still
     * render without errors after this prop is removed.
     *
     * What breaks: If removing dragHandle causes a React Flow error or the
     * node fails to mount, the canvas would show an error boundary instead
     * of the node.
     *
     * Note: `dragHandle` is consumed internally by React Flow's drag system
     * and does not produce a DOM attribute — the DOM-level contract tested
     * here is that the node renders without errors and is present in the DOM.
     */
    // GIVEN the API returns one node (mocked in beforeEach)

    // WHEN App mounts
    const { container } = render(<App />);

    // THEN the node is rendered successfully with no crash
    await waitFor(() => {
      const nodeEl = container.querySelector('[data-id="n1"]');
      expect(nodeEl).not.toBeNull();
    });
  });

  it('selected node shows NodeResizer handles with 12×12 hit-target dimensions', async () => {
    /**
     * Verifies that NodeResizer handle elements have an inline style of
     * width:12px and height:12px (up from the ReactFlow default 6×6), making
     * them substantially easier to grab with the cursor.
     *
     * Why: The default resize handles in React Flow are 6×6 pixels — small
     * enough that users frequently miss them when trying to resize a node.
     * Larger handles reduce frustration on dense canvases and with trackpads.
     *
     * What breaks: If handleStyle is not applied, handles revert to 6×6px
     * (or the library default), making nodes hard to resize, especially for
     * users with lower cursor precision.
     */
    // GIVEN App has loaded with one node

    // WHEN App mounts and the node is selected (rendered in selected state)
    const { container } = render(<App />);

    // Wait for the node to appear
    await waitFor(() => {
      expect(container.querySelector('[data-id="n1"]')).not.toBeNull();
    });

    // Simulate selecting the node so NodeResizer becomes visible
    const nodeEl = container.querySelector('[data-id="n1"]') as HTMLElement;
    nodeEl.click();

    // THEN the resize handle elements have the expected 12×12 dimensions
    await waitFor(() => {
      const handles = container.querySelectorAll<HTMLElement>(
        '.react-flow__resize-control.handle'
      );
      expect(handles.length).toBeGreaterThan(0);
      for (const handle of handles) {
        expect(handle.style.width).toBe('12px');
        expect(handle.style.height).toBe('12px');
        expect(handle.style.borderRadius).toBe('3px');
      }
    });
  });
});
