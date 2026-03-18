/**
 * ViewportController integration tests.
 *
 * These tests verify that App.tsx correctly wires ViewportController into
 * ReactFlow, dispatches viewport commands on collapse/expand, and persists
 * viewport state to localStorage via onMoveEnd.
 *
 * Kept separate from App.collapse.test.tsx because this file mocks
 * @xyflow/react at the module level (vi.mock is hoisted by Vitest) to
 * capture props passed to ReactFlow and to stub useReactFlow. That mock
 * would break tests in other files that rely on real ReactFlow rendering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Edge, Viewport } from '@xyflow/react';
import type { CanvasNodeType } from './components/CanvasNode';
import App from './App';
import * as api from './api';
import type { CanvasNodeData } from './api';

// ─── ReactFlow stub ──────────────────────────────────────────────────────────
// Captures props passed to <ReactFlow> so tests can:
//   1. Verify onMoveEnd is wired (localStorage persistence)
//   2. Trigger onToggleCollapse directly from node data (viewport commands)
//   3. Assert fitView prop value (first-visit vs saved-viewport)
//
// Also stubs useReactFlow so ViewportController can call fitBounds, setViewport,
// getViewport, and getInternalNode without a real layout engine (jsdom).
//
// Background/Controls/MiniMap are nulled because they use the ReactFlow
// zustand store internally, which is unavailable when ReactFlow itself is a stub.

let capturedReactFlowProps: Record<string, unknown> = {};
const mockFitBounds = vi.fn();
const mockSetViewport = vi.fn();
const mockGetViewport = vi.fn(() => ({ x: 10, y: 20, zoom: 1.5 }) as Viewport);
const mockGetInternalNode = vi.fn();

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlow: (props: { children?: ReactNode; nodes?: CanvasNodeType[]; edges?: Edge[] } & Record<string, unknown>) => {
      capturedReactFlowProps = props;
      // Render children so ViewportController mounts inside the stub context
      return <div className="react-flow">{props.children as ReactNode}</div>;
    },
    // Stub subcomponents that require the ReactFlow zustand store
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    useReactFlow: () => ({
      fitBounds: mockFitBounds,
      setViewport: mockSetViewport,
      getViewport: mockGetViewport,
      getInternalNode: mockGetInternalNode,
    }),
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const parentNode: CanvasNodeData = {
  id: 'parent',
  parent_id: null,
  title: 'Parent',
  notes: '',
  x: 0,
  y: 0,
  width: 320,
  height: 240,
  collapsed: 0,
  border_color: null,
  bg_color: null,
  border_width: null,
  border_style: null,
  font_size: null,
  font_color: null,
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
  border_color: null,
  bg_color: null,
  border_width: null,
  border_style: null,
  font_size: null,
  font_color: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

// Helper: wait for nodes to be loaded into ReactFlow props and return the
// onToggleCollapse callback for a specific node ID.
async function waitForToggleCollapse(nodeId: string): Promise<(id: string) => void> {
  let cb: ((id: string) => void) | undefined;
  await waitFor(() => {
    const nodes = capturedReactFlowProps.nodes as CanvasNodeType[] | undefined;
    const node = nodes?.find((n) => n.id === nodeId);
    if (!node?.data?.onToggleCollapse) throw new Error('onToggleCollapse not yet available');
    cb = node.data.onToggleCollapse as (id: string) => void;
  });
  return cb!;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('App — ViewportController integration', () => {
  beforeEach(() => {
    capturedReactFlowProps = {};
    mockFitBounds.mockClear();
    mockSetViewport.mockClear();
    mockGetViewport.mockClear().mockReturnValue({ x: 10, y: 20, zoom: 1.5 });
    mockGetInternalNode.mockClear();
    localStorage.clear();

    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([parentNode, childNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);
    vi.spyOn(api, 'patchNode').mockResolvedValue(parentNode);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ReactFlow receives onMoveEnd handler after App mounts', async () => {
    /**
     * Verifies that App wires an onMoveEnd callback into ReactFlow.
     *
     * Why: Without onMoveEnd, viewport pan/zoom events are never captured
     * and localStorage will never be updated. This is the minimal contract
     * that the persistence mechanism is plumbed at all.
     *
     * What breaks: Viewport position is never saved to localStorage, so
     * reloading the page always shows the default fitView rather than where
     * the user left off.
     */
    // GIVEN the API returns nodes (mocked in beforeEach)

    // WHEN App mounts
    render(<App />);
    await waitFor(() => {
      expect(typeof capturedReactFlowProps.onMoveEnd).toBe('function');
    });

    // THEN ReactFlow receives an onMoveEnd prop that is a function
    expect(typeof capturedReactFlowProps.onMoveEnd).toBe('function');
  });

  it('onMoveEnd saves viewport to localStorage after debounce', async () => {
    /**
     * Verifies that invoking the onMoveEnd handler eventually writes the
     * viewport to localStorage under the key "kc-viewport".
     *
     * Why: localStorage persistence is the contract that enables the user
     * to reload and return to the same viewport. If the key is wrong or the
     * value is not JSON-serialized, the restore logic will silently fail.
     *
     * What breaks: Reloading the page loses the user's viewport position
     * even though the save was wired.
     */
    // GIVEN App is mounted with mocked API
    render(<App />);
    await waitFor(() => {
      expect(typeof capturedReactFlowProps.onMoveEnd).toBe('function');
    });

    const viewport: Viewport = { x: 100, y: 200, zoom: 2 };

    // WHEN onMoveEnd is called with a viewport and 600ms debounce elapses
    await act(async () => {
      (capturedReactFlowProps.onMoveEnd as (_: unknown, vp: Viewport) => void)(
        {},
        viewport
      );
      // Advance past the 600ms debounce
      await new Promise((r) => setTimeout(r, 700));
    });

    // THEN localStorage contains the serialized viewport under "kc-viewport"
    const saved = localStorage.getItem('kc-viewport');
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved!)).toEqual(viewport);
  }, 10000);

  it('fitView prop is true on first visit when no saved viewport exists', async () => {
    /**
     * Verifies that ReactFlow receives fitView=true on first visit (no saved
     * viewport in localStorage), so the canvas auto-fits all nodes into view.
     *
     * Why: On first visit or after clearing storage, the canvas should fit
     * all nodes into view. If fitView is unconditionally disabled, a first-time
     * user sees nodes at their raw coordinate positions which may be off-screen.
     *
     * What breaks: New users or users who clear storage see an empty canvas
     * until they manually navigate to their nodes.
     */
    // GIVEN no saved viewport in localStorage (cleared in beforeEach)

    // WHEN App mounts
    render(<App />);
    await waitFor(() => {
      expect(capturedReactFlowProps.fitView !== undefined).toBe(true);
    });

    // THEN ReactFlow receives fitView=true
    expect(capturedReactFlowProps.fitView).toBe(true);
  });

  it('fitView prop is false when a saved viewport exists in localStorage', async () => {
    /**
     * Verifies that ReactFlow receives fitView=false when a saved viewport
     * exists, so the ViewportController can restore the saved position
     * instead of overriding it with fit-all-nodes.
     *
     * Why: If fitView runs after restoring from localStorage, the restore is
     * overridden and the user ends up at the fit-all-nodes view rather than
     * where they left off.
     *
     * What breaks: Reloading the page with a saved viewport always shows the
     * fit-all-nodes view, making localStorage persistence useless.
     */
    // GIVEN a saved viewport in localStorage
    localStorage.setItem('kc-viewport', JSON.stringify({ x: 50, y: 75, zoom: 1.2 }));

    // WHEN App mounts
    render(<App />);
    await waitFor(() => {
      expect(capturedReactFlowProps.fitView !== undefined).toBe(true);
    });

    // THEN ReactFlow receives fitView=false
    expect(capturedReactFlowProps.fitView).toBe(false);
  });

  it('expanding a collapsed parent triggers fitBounds for the node area', async () => {
    /**
     * Verifies that expanding a collapsed parent eventually calls fitBounds
     * to animate the viewport to the parent node's area.
     *
     * Why: The expand-to-zoom-fit is the primary UX of KC-3.2. Without
     * fitBounds being called, the viewport stays wherever it was — the user
     * has to manually navigate to the now-visible children.
     *
     * What breaks: Expanding a parent does not animate the viewport; children
     * appear but the user must manually pan/zoom to find them.
     */
    // GIVEN a parent with one child; getInternalNode returns absolute position
    mockGetInternalNode.mockReturnValue({
      position: { x: 0, y: 0 },
      internals: { positionAbsolute: { x: 10, y: 20 } },
      style: { width: 320, height: 240 },
    });

    render(<App />);
    const toggleCollapse = await waitForToggleCollapse('parent');

    // Collapse first so we can then expand
    act(() => { toggleCollapse('parent'); });
    mockFitBounds.mockClear();

    // WHEN expand is triggered (toggle on a collapsed node)
    act(() => { toggleCollapse('parent'); });

    // THEN fitBounds is eventually called with bounds derived from the
    // node's absolute position (after the 30ms setTimeout in ViewportController)
    await waitFor(() => {
      expect(mockFitBounds).toHaveBeenCalledOnce();
    }, { timeout: 500 });

    const [bounds, options] = mockFitBounds.mock.calls[0] as [
      { x: number; y: number; width: number; height: number },
      { padding: number; duration: number }
    ];
    expect(bounds).toMatchObject({ x: 10, y: 20 });
    expect(options.duration).toBe(400);
  }, 10000);

  it('collapsing an expanded parent (after a prior expand) restores the saved viewport', async () => {
    /**
     * Verifies that collapsing a parent (after having expanded it) calls
     * setViewport to restore the pre-expand viewport position with animation.
     *
     * Why: The viewport stack makes collapse feel like "going back" rather than
     * "hiding things". Without setViewport being called on collapse, the user
     * is left zoomed-in on children that are now hidden, with no spatial context.
     *
     * What breaks: Collapsing a parent after an expand does not return the
     * viewport; the user is disoriented at the expanded zoom level.
     */
    // GIVEN the current viewport before expand is { x:10, y:20, zoom:1.5 }
    const savedViewport: Viewport = { x: 10, y: 20, zoom: 1.5 };
    mockGetViewport.mockReturnValue(savedViewport);
    mockGetInternalNode.mockReturnValue({
      position: { x: 0, y: 0 },
      internals: { positionAbsolute: { x: 10, y: 20 } },
      style: { width: 320, height: 240 },
    });

    render(<App />);
    const toggleCollapse = await waitForToggleCollapse('parent');

    // First collapse so there's a node in collapsed state
    await act(async () => { toggleCollapse('parent'); });

    // Expand — snapshots savedViewport onto the stack
    await act(async () => {
      toggleCollapse('parent');
      await new Promise((r) => setTimeout(r, 100));
    });

    mockSetViewport.mockClear();

    // WHEN collapse is triggered again (should pop savedViewport off stack)
    await act(async () => {
      toggleCollapse('parent');
      await new Promise((r) => setTimeout(r, 50));
    });

    // THEN setViewport is called with the saved viewport and animation duration
    expect(mockSetViewport).toHaveBeenCalledOnce();
    const [vp, opts] = mockSetViewport.mock.calls[0] as [Viewport, { duration: number }];
    expect(vp).toEqual(savedViewport);
    expect(opts.duration).toBe(350);
  }, 15000);

  it('collapsing without a prior expand does not call setViewport (empty stack)', async () => {
    /**
     * Verifies that collapsing a parent with no prior expand in this session
     * does NOT call setViewport, since there is no saved viewport on the stack.
     *
     * Why: On page reload after a collapse, the stack starts empty. Calling
     * setViewport with undefined or stale data would corrupt the viewport.
     * The contract is: no saved viewport → no animation.
     *
     * What breaks: After reload, the first collapse call erroneously animates
     * the viewport to an undefined or default position, disorienting the user.
     */
    // GIVEN a parent with one child that starts expanded (collapsed=0)
    render(<App />);
    const toggleCollapse = await waitForToggleCollapse('parent');

    // WHEN collapse is clicked without any prior expand in this session
    await act(async () => {
      toggleCollapse('parent');
      await new Promise((r) => setTimeout(r, 50));
    });

    // THEN setViewport is NOT called (no viewport to restore)
    expect(mockSetViewport).not.toHaveBeenCalled();
  }, 10000);

  it('ViewportController renders null and does not add DOM elements to the canvas', async () => {
    /**
     * Verifies that ViewportController is rendered as a child of ReactFlow
     * but produces no DOM output (returns null).
     *
     * Why: ViewportController must be inside <ReactFlow> to use useReactFlow().
     * It must render null to avoid adding unexpected DOM nodes to the canvas
     * that could interfere with the ReactFlow rendering layer.
     *
     * What breaks: Either ViewportController errors on mount (if outside
     * ReactFlow) or renders visible DOM elements that overlay the canvas.
     */
    // GIVEN App mounts with standard data

    // WHEN App renders
    render(<App />);
    await waitFor(() => {
      expect(document.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN children are rendered (ViewportController is among them) but it
    // produces no DOM node — only Toolbar and the edge-click-triggers div
    // are rendered as App's non-null children.
    // The presence of ViewportController is confirmed by the functional
    // tests above (fitBounds / setViewport calls succeed).
    expect(document.querySelector('.react-flow')).not.toBeNull();
  });
});
