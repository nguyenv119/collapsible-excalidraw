/**
 * Map-label viewport zoom tests.
 *
 * Kept in a separate file because these tests mock @xyflow/react at the module
 * level via vi.mock (which is hoisted by Vitest). That mock stubs out
 * useViewport to return a sub-1 zoom, which would break other test files that
 * depend on the real React Flow render pipeline. By isolating this mock in its
 * own file, both suites run correctly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData } from './api';

// ─── React Flow stub: override useViewport to return zoom=0.2 ────────────────
// This lets us verify that the transform is applied at zoom-out without
// needing a real browser viewport.
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    useViewport: () => ({ x: 0, y: 0, zoom: 0.2 }),
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseNode: CanvasNodeData = {
  id: 'n1',
  parent_id: null,
  title: 'Cloud Services',
  notes: '',
  x: 0,
  y: 0,
  width: null,
  height: null,
  collapsed: 1,
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
  id: 'c1',
  parent_id: 'n1',
  title: 'AWS',
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CanvasNode — map label scale transform applied at zoom-out', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);
    vi.spyOn(api, 'patchNode').mockResolvedValue(baseNode);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('collapsed_parent_title_has_scale_transform_at_zoom_0_2', async () => {
    /**
     * Verifies that at zoom=0.2, the title <p> of a collapsed parent node has
     * a CSS `transform: scale(...)` style applied with a scale > 1.
     *
     * Why: The counter-scale feature exists specifically to prevent titles from
     * becoming illegible at zoom-out. If the transform style is never applied
     * to the DOM element, the feature is inert — the title remains at 2.8px
     * on screen regardless of the mapLabelScale computation being correct.
     *
     * What breaks: At zoom=0.2 the collapsed parent title renders at ~2.8px
     * on screen (invisible). The user cannot read any node labels when the
     * canvas is zoomed out to get a bird's-eye view.
     */
    // GIVEN a collapsed parent node with a child, viewport at zoom=0.2
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([baseNode, childNode]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the title <p> has a scale() transform applied (scale > 1)
    await waitFor(() => {
      const titleEl = container.querySelector('.kc-node__title') as HTMLElement | null;
      expect(titleEl).not.toBeNull();
      // jsdom renders transform as a string: "scale(4.814814...)"
      expect(titleEl!.style.transform).toMatch(/^scale\([1-9]/);
    });
  });

  it('collapsed_parent_title_has_transform_origin_left_center_at_zoom_0_2', async () => {
    /**
     * Verifies that the title transform uses 'left center' as its origin
     * point when the counter-scale is active.
     *
     * Why: If transformOrigin defaults to 'center center', the scaled-up
     * title centers on the button group side, pushing the text out of the
     * visible left portion of the header. 'left center' keeps the start of
     * the text anchored to the left edge of the header.
     *
     * What breaks: The counter-scaled title slides to the right and overlaps
     * the collapse button, making the button unclickable and the title hard
     * to read.
     */
    // GIVEN a collapsed parent node at zoom=0.2
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([baseNode, childNode]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the title transform origin is 'left center'
    await waitFor(() => {
      const titleEl = container.querySelector('.kc-node__title') as HTMLElement | null;
      expect(titleEl).not.toBeNull();
      expect(titleEl!.style.transformOrigin).toBe('left center');
    });
  });
});
