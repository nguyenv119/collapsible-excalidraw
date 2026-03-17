import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const styledNode: CanvasNodeData = {
  id: 'node-style-1',
  parent_id: null,
  title: 'Styled Node',
  notes: 'some notes',
  x: 10,
  y: 20,
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

const styledEdge: CanvasEdge = {
  id: 'edge-style-1',
  source_id: 'node-style-1',
  target_id: 'node-style-1',
  source_handle: null,
  target_handle: null,
  label: null,
  stroke_color: null,
  stroke_width: null,
  stroke_style: null,
  created_at: '2024-01-01T00:00:00Z',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('App — styling panel: NodeDetailPanel style section', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([styledNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([styledEdge]);
    vi.spyOn(api, 'patchNode').mockResolvedValue(styledNode);
    vi.spyOn(api, 'patchEdge').mockResolvedValue(styledEdge);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Style section renders all controls when a node is selected', async () => {
    /**
     * Verifies that NodeDetailPanel renders all four style control groups
     * (stroke swatches, background swatches, border width toggles, border style
     * toggles) when a node is selected.
     *
     * Why: The styling section is the primary UI surface for bead 8j4.4.
     * Each control group targets a different style dimension (color, fill,
     * weight, line-style). Missing any group means users lose that dimension.
     *
     * What breaks: Clicking a node opens the panel but one or more style
     * control groups are absent, silently preventing certain style changes.
     */
    // GIVEN the App has loaded with one node

    // WHEN App mounts and we click the node to select it
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    const nodeEl = container.querySelector('[data-id="node-style-1"]');
    expect(nodeEl).not.toBeNull();
    fireEvent.click(nodeEl!);

    // THEN the NodeDetailPanel shows all four style control groups
    await waitFor(() => {
      expect(container.querySelector('[data-testid="stroke-swatches"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="bg-swatches"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="border-width-toggles"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="border-style-toggles"]')).not.toBeNull();
    });
  });

  it('clicking a stroke swatch marks it active (aria-pressed) and persists to server', async () => {
    /**
     * Verifies that clicking a stroke color swatch immediately persists via
     * patchNode AND marks the swatch as the active selection in the DOM via
     * aria-pressed.
     *
     * Why: Style picks are discrete choices (not continuous text entry), so
     * they should persist immediately without debounce. aria-pressed makes the
     * active state machine-readable for both tests and assistive technology.
     *
     * What breaks: Clicking a color swatch appears to work but either the
     * color is never saved, or the swatch stays visually unselected so the
     * user cannot tell which color is active.
     */
    // GIVEN the App has loaded with one node and patchNode is mocked
    const patchSpy = vi.spyOn(api, 'patchNode').mockResolvedValue({
      ...styledNode,
      border_color: '#ef4444',
    });

    // WHEN App mounts, node is clicked to select it, then a stroke swatch is clicked
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    const nodeEl = container.querySelector('[data-id="node-style-1"]');
    expect(nodeEl).not.toBeNull();
    fireEvent.click(nodeEl!);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="stroke-swatches"]')).not.toBeNull();
    });

    const swatchBtn = container.querySelector('[data-testid="stroke-swatch-red"]');
    expect(swatchBtn).not.toBeNull();
    fireEvent.click(swatchBtn!);

    // THEN patchNode is called with border_color: '#ef4444'
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        'node-style-1',
        expect.objectContaining({ border_color: '#ef4444' })
      );
    });

    // AND the swatch is marked active in the DOM
    await waitFor(() => {
      const swatch = container.querySelector('[data-testid="stroke-swatch-red"]');
      expect(swatch?.getAttribute('aria-pressed')).toBe('true');
    });
  });
});

describe('App — transparent fill swatch', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([styledNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([styledEdge]);
    vi.spyOn(api, 'patchNode').mockResolvedValue({ ...styledNode, bg_color: 'transparent' });
    vi.spyOn(api, 'patchEdge').mockResolvedValue(styledEdge);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clicking the default fill swatch calls patchNode with bg_color: "transparent"', async () => {
    /**
     * Verifies that clicking the "Default" (none/transparent) fill swatch
     * persists bg_color as the literal string "transparent" — not null.
     *
     * Why: null means "no override, use CSS default", while "transparent" is
     * an explicit CSS value that makes the node background see-through so the
     * dark canvas shows through. These are semantically distinct intents.
     *
     * What breaks: Users click the transparent swatch expecting a transparent
     * node but still see the default cream background because null triggers
     * the CSS variable fallback instead of a transparent override.
     */
    // GIVEN App loads with one node and fill swatch panel is visible
    const patchSpy = vi.spyOn(api, 'patchNode').mockResolvedValue({
      ...styledNode,
      bg_color: 'transparent',
    });

    // WHEN App mounts, node is clicked to open panel, then default fill swatch is clicked
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    const nodeEl = container.querySelector('[data-id="node-style-1"]');
    expect(nodeEl).not.toBeNull();
    fireEvent.click(nodeEl!);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="bg-swatches"]')).not.toBeNull();
    });

    const defaultFillSwatch = container.querySelector('[data-testid="bg-swatch-default"]');
    expect(defaultFillSwatch).not.toBeNull();
    fireEvent.click(defaultFillSwatch!);

    // THEN patchNode is called with bg_color: 'transparent' (not null)
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        'node-style-1',
        expect.objectContaining({ bg_color: 'transparent' })
      );
    });
  });

  it('node with bg_color "transparent" renders with background: transparent style', async () => {
    /**
     * Verifies that a node loaded from the server with bg_color = "transparent"
     * receives an inline style of background: transparent, allowing the dark
     * canvas background to show through.
     *
     * Why: The visual effect of a transparent node requires the inline style
     * override to win over the .kc-node CSS rule that sets a cream background.
     * Without the override the node always appears cream regardless of the
     * stored bg_color value.
     *
     * What breaks: Reloading the canvas after setting a transparent fill shows
     * the node as cream again — the transparency is lost on page reload.
     */
    // GIVEN a node stored with bg_color 'transparent' is loaded from the server
    const transparentNode: CanvasNodeData = { ...styledNode, bg_color: 'transparent' };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([transparentNode]);

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the node element has inline background: transparent
    await waitFor(() => {
      const nodeEl = container.querySelector('[data-id="node-style-1"] .kc-node');
      expect(nodeEl).not.toBeNull();
      expect((nodeEl as HTMLElement).style.background).toBe('transparent');
    });
  });
});

describe('App — styling panel: EdgeDetailPanel', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([styledNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([styledEdge]);
    vi.spyOn(api, 'patchNode').mockResolvedValue(styledNode);
    vi.spyOn(api, 'patchEdge').mockResolvedValue(styledEdge);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('EdgeDetailPanel does not render when no edge is selected', async () => {
    /**
     * Verifies that the EdgeDetailPanel is absent from the DOM when no edge
     * is currently selected.
     *
     * Why: The panel should only appear when an edge is selected — rendering it
     * when nothing is selected would confuse users and waste screen space.
     *
     * What breaks: The edge panel is always visible, overlapping the canvas
     * and obscuring nodes even when the user is not working with edges.
     */
    // GIVEN App loads with no edge selected

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN EdgeDetailPanel is not present
    expect(container.querySelector('[data-testid="edge-detail-panel"]')).toBeNull();
  });

  it('EdgeDetailPanel renders stroke swatches but no bg-swatches when an edge is selected', async () => {
    /**
     * Verifies that EdgeDetailPanel shows stroke color swatches but does NOT
     * show background (fill) swatches, since edges have no fill.
     *
     * Why: Showing fill controls for edges would be confusing and meaningless —
     * edges are lines, not shapes. Hiding irrelevant controls keeps the panel
     * focused and avoids user confusion.
     *
     * What breaks: Users see a "Background" swatch row in the EdgeDetailPanel
     * and click it expecting the edge fill to change — nothing happens and
     * the user is confused.
     *
     * Note: React Flow SVG edges do not render in JSDOM. We trigger onEdgeClick
     * via a test-only hidden button (data-testid="select-edge-{id}") that App
     * renders when import.meta.env.MODE === 'test'.
     */
    // GIVEN App has loaded with a node and an edge

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // Trigger edge selection via the test-only trigger button (replicates onEdgeClick)
    const edgeTrigger = container.querySelector('[data-testid="select-edge-edge-style-1"]');
    expect(edgeTrigger).not.toBeNull();
    fireEvent.click(edgeTrigger!);

    // THEN EdgeDetailPanel appears with stroke swatches but without bg-swatches
    await waitFor(() => {
      expect(container.querySelector('[data-testid="edge-detail-panel"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="edge-stroke-swatches"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-testid="edge-bg-swatches"]')).toBeNull();
  });
});

describe('App — font color', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('node with font_color renders with color inline style on .kc-node__inner', async () => {
    /**
     * Verifies that a node loaded from the server with font_color = '#ef4444'
     * receives an inline color style on the .kc-node__inner div, so title and
     * notes text inherit the chosen color.
     *
     * Why: Font color is applied via an inline style on the inner div (not the
     * outer .kc-node div) so it cascades to child text elements without
     * overriding the border/background on the card wrapper.
     *
     * What breaks: Reloading the canvas after setting a font color shows the
     * node with the default text color — the font color is lost on page reload.
     */
    // GIVEN a node stored with font_color '#ef4444' is loaded from the server
    const coloredNode: CanvasNodeData = { ...styledNode, font_color: '#ef4444' };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([coloredNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([styledEdge]);
    vi.spyOn(api, 'patchNode').mockResolvedValue(coloredNode);
    vi.spyOn(api, 'patchEdge').mockResolvedValue(styledEdge);

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the .kc-node__inner element has inline color: rgb(239, 68, 68)
    await waitFor(() => {
      const innerEl = container.querySelector('[data-id="node-style-1"] .kc-node__inner') as HTMLElement | null;
      expect(innerEl).not.toBeNull();
      expect(innerEl!.style.color).toBe('rgb(239, 68, 68)');
    });
  });

  it('clicking a font color swatch calls onUpdate with the selected font_color', async () => {
    /**
     * Verifies that clicking a font color swatch in the NodeDetailPanel
     * immediately persists via patchNode with the correct font_color value.
     *
     * Why: Font color swatches are immediate/non-debounced like other style
     * controls. Clicking the swatch must fire patchNode right away so the
     * color is saved without the user needing to perform another action.
     *
     * What breaks: Clicking a font color swatch changes the visual appearance
     * locally but the change is never saved to the server, so it is lost on
     * page reload.
     */
    // GIVEN App loads with one node and the panel is visible
    const patchSpy = vi.spyOn(api, 'patchNode').mockResolvedValue({
      ...styledNode,
      font_color: '#ef4444',
    });
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([styledNode]);
    vi.spyOn(api, 'fetchEdges').mockResolvedValue([styledEdge]);
    vi.spyOn(api, 'patchEdge').mockResolvedValue(styledEdge);

    // WHEN App mounts, node is clicked, then a font color swatch is clicked
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    const nodeEl = container.querySelector('[data-id="node-style-1"]');
    expect(nodeEl).not.toBeNull();
    fireEvent.click(nodeEl!);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="font-color-swatches"]')).not.toBeNull();
    });

    const redFontSwatch = container.querySelector('[data-testid="font-color-swatch-red"]');
    expect(redFontSwatch).not.toBeNull();
    fireEvent.click(redFontSwatch!);

    // THEN patchNode is called with font_color: '#ef4444'
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        'node-style-1',
        expect.objectContaining({ font_color: '#ef4444' })
      );
    });

    // AND the swatch is marked active in the DOM
    await waitFor(() => {
      const swatch = container.querySelector('[data-testid="font-color-swatch-red"]');
      expect(swatch?.getAttribute('aria-pressed')).toBe('true');
    });
  });
});
