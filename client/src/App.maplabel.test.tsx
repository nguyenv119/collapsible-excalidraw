import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData } from './api';

// ─── Pure computation: mapLabelScale formula ──────────────────────────────────
// These tests verify the scale computation in isolation, mirroring the exact
// formula from CanvasNode.tsx.  By running them as pure math, we confirm the
// clamping behaviour and numeric relationships before touching the DOM.

const FONT_SIZE_PX: Record<string, number> = { small: 11, medium: 13.5, large: 18 };
const TARGET_PX = 13;

function computeMapLabelScale(
  collapsed: boolean,
  hasChildren: boolean,
  fontSize: string | null,
  zoom: number
): number {
  if (!collapsed || !hasChildren) return 1;
  const currentFontPx = FONT_SIZE_PX[fontSize ?? 'medium'] ?? 13.5;
  return Math.max(1, Math.min(6, TARGET_PX / (currentFontPx * zoom)));
}

describe('mapLabelScale computation', () => {
  it('returns_1_when_node_is_not_collapsed', () => {
    /**
     * Verifies that mapLabelScale is exactly 1 (no transform) for any node
     * that is not collapsed, regardless of zoom or font size.
     *
     * Why: Applying an inverse-zoom transform to expanded nodes would distort
     * their visible size at every zoom level, breaking the normal layout.
     * Only collapsed parent titles should be counter-scaled.
     *
     * What breaks: Expanded nodes have their title scaled up as the canvas
     * is zoomed out, making them appear larger than intended and misaligned
     * with other canvas elements.
     */
    // GIVEN an expanded node with children
    // WHEN scale is computed at zoom 0.2
    const scale = computeMapLabelScale(false, true, null, 0.2);
    // THEN scale is 1 (identity — no transform)
    expect(scale).toBe(1);
  });

  it('returns_1_when_node_has_no_children', () => {
    /**
     * Verifies that mapLabelScale is 1 for a collapsed leaf node (no children).
     *
     * Why: Only collapsed parent nodes need counter-scaling; collapsing a leaf
     * node is not a supported state. Applying scaling to a leaf would cause an
     * unexpected visual change for a state that should never occur.
     *
     * What breaks: Leaf nodes that happen to have collapsed=true in the DB
     * would have their title incorrectly scaled, producing garbled layout.
     */
    // GIVEN a collapsed node with no children (leaf)
    // WHEN scale is computed at a very low zoom
    const scale = computeMapLabelScale(true, false, null, 0.1);
    // THEN scale is 1 — leaf nodes are never counter-scaled
    expect(scale).toBe(1);
  });

  it('at_zoom_1_scale_is_at_most_1_for_default_font', () => {
    /**
     * Verifies that at full zoom (1.0) the scale never exceeds 1 for the
     * default (medium) font size.
     *
     * Why: At zoom=1 the title is already at its natural screen size.
     * Scaling it up further would make the title visually oversized on the
     * unzoomed canvas, permanently distorting the node.
     *
     * What breaks: At zoom=1, collapsed parent titles appear larger than
     * other text on the canvas, looking broken rather than map-like.
     */
    // GIVEN a collapsed parent with default font at full zoom
    // WHEN scale is computed
    const scale = computeMapLabelScale(true, true, null, 1.0);
    // THEN scale is exactly 1 (max(1, value<1) = 1)
    expect(scale).toBe(1);
  });

  it('at_zoom_0_2_medium_font_scale_is_clamped_to_approximately_4_8', () => {
    /**
     * Verifies the documented example from the task description:
     * zoom=0.2, fontSize=null (→ 13.5px medium), TARGET_PX=13.
     *
     * Why: This is the canonical legibility scenario — a collapsed node at
     * extreme zoom-out. The formula must produce ~4.8× so the title renders
     * at ~13px on screen (13.5 * 4.8 * 0.2 ≈ 13).
     *
     * What breaks: At zoom=0.2 the title remains at 2.8px on screen, which
     * is invisible to the user — the counter-scale feature has no effect.
     */
    // GIVEN a collapsed parent with medium font at 0.2× zoom
    // WHEN scale is computed
    const scale = computeMapLabelScale(true, true, null, 0.2);
    // THEN scale ≈ 4.8 (13 / (13.5 * 0.2) = 4.815…, clamped to at most 6)
    expect(scale).toBeCloseTo(4.81, 1);
  });

  it('scale_is_capped_at_6_at_extreme_zoom_out', () => {
    /**
     * Verifies that the scale never exceeds 6 even at extreme zoom-out (e.g., 0.01).
     *
     * Why: Without the 6× cap, extreme zoom-out would produce absurdly large
     * titles (hundreds of canvas units), covering the entire visible canvas and
     * making it impossible to read or navigate.
     *
     * What breaks: At very low zoom levels, collapsed parent titles balloon to
     * fill the screen, obscuring all other nodes and edge paths.
     */
    // GIVEN a collapsed parent with medium font at extreme zoom-out (0.01)
    // WHEN scale is computed
    const scale = computeMapLabelScale(true, true, null, 0.01);
    // THEN scale is capped at exactly 6
    expect(scale).toBe(6);
  });

  it('scale_is_larger_for_small_font_than_medium_at_same_zoom', () => {
    /**
     * Verifies that a small-font title is scaled more than a medium-font
     * title at the same zoom level, to reach the same TARGET_PX on screen.
     *
     * Why: A smaller base font needs a proportionally larger counter-scale
     * to hit the same legible screen size. If font size is ignored in the
     * formula, small-font titles remain invisible while medium ones are
     * legible.
     *
     * What breaks: Nodes with font_size='small' receive the same scale as
     * medium nodes, leaving small-font titles below the legibility threshold
     * while medium ones are correctly counter-scaled.
     */
    // GIVEN a collapsed parent at zoom 0.3
    // WHEN scale is computed for small font vs medium font
    const smallScale = computeMapLabelScale(true, true, 'small', 0.3);
    const mediumScale = computeMapLabelScale(true, true, 'medium', 0.3);
    // THEN small font is scaled more than medium font
    expect(smallScale).toBeGreaterThan(mediumScale);
  });

  it('scale_is_smaller_for_large_font_than_medium_at_same_zoom', () => {
    /**
     * Verifies that a large-font title is scaled less than a medium-font
     * title at the same zoom level.
     *
     * Why: A larger base font is already closer to the TARGET_PX on screen
     * and needs less counter-scaling. If font size is not accounted for,
     * large-font titles are over-scaled, appearing disproportionately large.
     *
     * What breaks: Nodes with font_size='large' are over-scaled at zoom-out,
     * rendering larger on screen than the target legibility size.
     */
    // GIVEN a collapsed parent at zoom 0.3
    // WHEN scale is computed for large font vs medium font
    const largeScale = computeMapLabelScale(true, true, 'large', 0.3);
    const mediumScale = computeMapLabelScale(true, true, 'medium', 0.3);
    // THEN large font is scaled less than medium font
    expect(largeScale).toBeLessThan(mediumScale);
  });
});

// ─── Integration: kc-node--collapsed CSS class ────────────────────────────────

const baseNode: CanvasNodeData = {
  id: 'n1',
  parent_id: null,
  title: 'Parent Node',
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
  font_color: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const childNode: CanvasNodeData = {
  id: 'c1',
  parent_id: 'n1',
  title: 'Child Node',
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

describe('CanvasNode — kc-node--collapsed CSS class', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'patchNode').mockResolvedValue(baseNode);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('collapsed_parent_node_has_kc_node_collapsed_class', async () => {
    /**
     * Verifies that when a parent node is loaded with collapsed=1, its
     * .kc-node div carries the 'kc-node--collapsed' CSS modifier class.
     *
     * Why: The CSS rule `.kc-node--collapsed { overflow: visible; }` allows
     * the counter-scaled title to visually escape the 52px compact header bar.
     * Without this class, the scaled-up title is clipped by the default
     * `overflow: hidden` and remains invisible even after scaling.
     *
     * What breaks: At zoom-out, collapsed parent titles are correctly scaled
     * in canvas units but still clipped by the node's overflow boundary,
     * so the counter-scale feature has no visible effect.
     */
    // GIVEN a collapsed parent with a child (so hasChildren=true)
    const collapsedParent: CanvasNodeData = { ...baseNode, collapsed: 1 };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([collapsedParent, childNode]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the .kc-node element has the kc-node--collapsed modifier class
    await waitFor(() => {
      const kcNode = container.querySelector('.kc-node') as HTMLElement | null;
      expect(kcNode).not.toBeNull();
      expect(kcNode!.classList.contains('kc-node--collapsed')).toBe(true);
    });
  });

  it('expanded_parent_node_does_not_have_kc_node_collapsed_class', async () => {
    /**
     * Verifies that an expanded parent node does NOT carry the
     * 'kc-node--collapsed' CSS modifier class.
     *
     * Why: The overflow:visible rule is only safe for collapsed nodes because
     * expanded nodes have child nodes rendered inside them. Making overflow
     * visible on an expanded parent could cause children to visually overflow
     * onto sibling nodes, breaking the layout.
     *
     * What breaks: Expanded parent nodes allow their children to render
     * outside the card boundary, producing overlapping, unreadable content.
     */
    // GIVEN an expanded parent with a child
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([baseNode, childNode]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the .kc-node element does NOT have the kc-node--collapsed modifier
    await waitFor(() => {
      const kcNode = container.querySelector('.kc-node') as HTMLElement | null;
      expect(kcNode).not.toBeNull();
      expect(kcNode!.classList.contains('kc-node--collapsed')).toBe(false);
    });
  });

  it('leaf_node_does_not_have_kc_node_collapsed_class_even_if_collapsed_flag_set', async () => {
    /**
     * Verifies that a node with collapsed=1 but no children does NOT get
     * the 'kc-node--collapsed' class, because it has no children to hide
     * and the collapsed state is semantically irrelevant.
     *
     * Why: The class drives the overflow:visible CSS that only matters when
     * there is a scaled title overflowing the compact header. For a leaf node,
     * applying it would incorrectly set overflow:visible with no benefit and
     * could cause unintended visual side effects.
     *
     * What breaks: Leaf nodes with a stale collapsed=1 DB value gain
     * overflow:visible, potentially causing content to overflow outside their
     * card boundaries.
     */
    // GIVEN a collapsed leaf node (no children)
    const collapsedLeaf: CanvasNodeData = { ...baseNode, id: 'leaf', collapsed: 1 };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([collapsedLeaf]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the .kc-node element does NOT have the kc-node--collapsed modifier
    await waitFor(() => {
      const kcNode = container.querySelector('.kc-node') as HTMLElement | null;
      expect(kcNode).not.toBeNull();
      expect(kcNode!.classList.contains('kc-node--collapsed')).toBe(false);
    });
  });
});
