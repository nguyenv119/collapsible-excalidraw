/**
 * Edge styling render tests.
 *
 * Kept separate from App.styles.test.tsx because these tests mock @xyflow/react
 * at the module level (vi.mock is hoisted by Vitest). That mock stubs out
 * ReactFlow's rendering to a minimal div, which would break the node styling
 * tests that rely on ReactFlow rendering CanvasNode children (.kc-node DOM
 * elements). By isolating this mock in its own file, both test suites run
 * correctly in their own module scope.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { Edge } from '@xyflow/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';

// ─── ReactFlow stub ──────────────────────────────────────────────────────────
// Capture the last `edges` prop passed to <ReactFlow> so tests can assert on
// the edge style objects that App.tsx builds, without depending on React Flow's
// SVG rendering (which requires a layout engine absent in jsdom).
let capturedEdges: Edge[] = [];
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlow: (props: { edges?: Edge[] } & Record<string, unknown>) => {
      if (props.edges) capturedEdges = props.edges;
      return <div className="react-flow" />;
    },
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseEdge: CanvasEdge = {
  id: 'e1',
  source_id: 'n1',
  target_id: 'n2',
  source_handle: null,
  target_handle: null,
  label: null,
  stroke_color: null,
  stroke_width: null,
  stroke_style: null,
  created_at: '2024-01-01T00:00:00Z',
};

// Two root nodes so the edge between them is topologically valid
const edgeNodeA: CanvasNodeData = {
  id: 'n1',
  parent_id: null,
  title: 'Node A',
  notes: '',
  x: 0,
  y: 0,
  width: null,
  height: null,
  collapsed: 0,
  border_color: null,
  bg_color: null,
  border_width: null,
  border_style: null,
  font_size: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const edgeNodeB: CanvasNodeData = { ...edgeNodeA, id: 'n2', title: 'Node B' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('App — edge styling mapping (load path)', () => {
  beforeEach(() => {
    capturedEdges = [];
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'patchNode').mockResolvedValue(edgeNodeA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('edge loaded from DB with stroke_color is passed to ReactFlow with style.stroke set', async () => {
    /**
     * Verifies that when fetchEdges returns an edge with stroke_color set,
     * App maps that color to the React Flow edge's style.stroke prop before
     * passing edges to <ReactFlow>.
     *
     * Why: The server persists stroke_color to SQLite; on page reload the
     * color must be read back and applied so the user's edge style is
     * preserved. If the mapping in App.tsx (the useEffect load path) is broken
     * or missing, the edge is passed to ReactFlow without style.stroke and
     * React Flow renders it with the default stroke color regardless of the
     * DB value.
     *
     * What breaks: After reloading the page, all styled edges lose their
     * custom colors and revert to the default gray/black stroke, making edge
     * style customization appear to never save.
     */
    // GIVEN an edge with stroke_color '#ff0000' returned by fetchEdges
    const styledEdge: CanvasEdge = { ...baseEdge, stroke_color: '#ff0000' };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([edgeNodeA, edgeNodeB]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([styledEdge]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the edge passed to ReactFlow has style.stroke set to '#ff0000'
    await waitFor(() => {
      const edge = capturedEdges.find((e) => e.id === 'e1');
      expect(edge).not.toBeUndefined();
      expect((edge!.style as Record<string, string> | undefined)?.stroke).toBe('#ff0000');
    });
  });

  it('edge loaded from DB with stroke_width medium is passed to ReactFlow with style.strokeWidth 2', async () => {
    /**
     * Verifies that the 'medium' stroke_width token from fetchEdges is mapped
     * to strokeWidth '2' on the edge style object passed to <ReactFlow>.
     *
     * Why: The DB stores semantic tokens ('thin'/'medium'/'thick') rather than
     * raw SVG strokeWidth values. App.tsx must translate them via
     * strokeWidthToCss(). If the mapping is absent, edges are always passed
     * to ReactFlow without a strokeWidth style, causing React Flow to render
     * all edges at the default stroke width regardless of what was stored.
     *
     * What breaks: Edges styled with thick or thin widths appear at the
     * default width after a page reload — the style customization appears to
     * never save.
     */
    // GIVEN an edge with stroke_width 'medium' returned by fetchEdges
    const styledEdge: CanvasEdge = { ...baseEdge, stroke_width: 'medium' };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([edgeNodeA, edgeNodeB]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([styledEdge]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the edge passed to ReactFlow has style.strokeWidth set to '2'
    await waitFor(() => {
      const edge = capturedEdges.find((e) => e.id === 'e1');
      expect(edge).not.toBeUndefined();
      expect((edge!.style as Record<string, string> | undefined)?.strokeWidth).toBe('2');
    });
  });
});
