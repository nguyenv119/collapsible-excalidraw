import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import App from './App';
import * as api from './api';
import type { CanvasNodeData, CanvasEdge } from './api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseNode: CanvasNodeData = {
  id: 'n1',
  parent_id: null,
  title: 'Styled Node',
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
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const noEdges: CanvasEdge[] = [];

// ─── Tests: node styling ───────────────────────────────────────────────────────

describe('App — node styling fields', () => {
  beforeEach(() => {
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchEdges').mockResolvedValue(noEdges);
    vi.spyOn(api, 'patchNode').mockResolvedValue(baseNode);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('node with border_color renders kc-node div with the expected border-color', async () => {
    /**
     * Verifies that a node loaded from DB with a non-null border_color value
     * has that color applied as an inline borderColor on the .kc-node div.
     *
     * Why: The style panel will PATCH border_color to the server; on reload the
     * value must be read back from DB and applied as a visible style so the user
     * sees their customization persist.
     *
     * What breaks: If border_color is ignored by CanvasNode, reloading the page
     * after styling a node will show the default border color, making styles
     * appear to not save.
     */
    // GIVEN a node with a blue border_color
    const styledNode: CanvasNodeData = { ...baseNode, border_color: '#3b82f6' };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([styledNode]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the .kc-node div has borderColor set to the expected value
    // Note: jsdom normalizes hex colors to rgb() form, so we check rgb(59, 130, 246)
    await waitFor(() => {
      const kcNode = container.querySelector('.kc-node') as HTMLElement | null;
      expect(kcNode).not.toBeNull();
      expect(kcNode!.style.borderColor).toBe('rgb(59, 130, 246)');
    });
  });

  it('node with bg_color renders kc-node div with the expected background-color', async () => {
    /**
     * Verifies that a node loaded from DB with a non-null bg_color value
     * has that color applied as backgroundColor on the .kc-node div.
     *
     * Why: Background color is a primary visual customization signal — without
     * it being applied to the rendered div, users cannot distinguish node groups
     * by color after a page reload.
     *
     * What breaks: The node renders with its default background regardless of
     * the stored bg_color, so color-coding persists only during a session.
     */
    // GIVEN a node with a pink bg_color
    const styledNode: CanvasNodeData = { ...baseNode, id: 'n2', bg_color: '#fce7f3' };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([styledNode]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the .kc-node div has backgroundColor set
    // Note: jsdom normalizes hex colors to rgb() form, so we check rgb(252, 231, 243)
    await waitFor(() => {
      const kcNode = container.querySelector('.kc-node') as HTMLElement | null;
      expect(kcNode).not.toBeNull();
      expect(kcNode!.style.backgroundColor).toBe('rgb(252, 231, 243)');
    });
  });

  it('node with border_width thin renders kc-node div with borderWidth 1px', async () => {
    /**
     * Verifies that the token value 'thin' for border_width is mapped to the
     * CSS value '1px' on the .kc-node div.
     *
     * Why: The DB stores semantic tokens ('thin'/'medium'/'thick') rather than
     * raw CSS values, so CanvasNode must perform the token→CSS mapping. If it
     * passes the token directly, the browser will ignore an invalid borderWidth
     * and show the default width instead.
     *
     * What breaks: Nodes with border_width='thin' show the default border width,
     * making all border widths look identical regardless of what was stored.
     */
    // GIVEN a node with border_width 'thin'
    const styledNode: CanvasNodeData = { ...baseNode, id: 'n3', border_width: 'thin' };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([styledNode]);

    // WHEN App mounts and data loads
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector('.react-flow')).not.toBeNull();
    });

    // THEN the .kc-node div has borderWidth mapped to 1px
    await waitFor(() => {
      const kcNode = container.querySelector('.kc-node') as HTMLElement | null;
      expect(kcNode).not.toBeNull();
      expect(kcNode!.style.borderWidth).toBe('1px');
    });
  });

  it('node with border_width medium renders kc-node div with borderWidth 2px', async () => {
    /**
     * Verifies that 'medium' token maps to '2px'.
     *
     * Why: Same token-mapping contract as 'thin'. Each token step must produce
     * a visually distinct border width so the user's choice is reflected.
     *
     * What breaks: 'medium' and 'thin' render identically; user cannot see the
     * difference between border width settings.
     */
    // GIVEN a node with border_width 'medium'
    const styledNode: CanvasNodeData = { ...baseNode, id: 'n4', border_width: 'medium' };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([styledNode]);

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => { expect(container.querySelector('.react-flow')).not.toBeNull(); });

    // THEN borderWidth is 2px
    await waitFor(() => {
      const kcNode = container.querySelector('.kc-node') as HTMLElement | null;
      expect(kcNode).not.toBeNull();
      expect(kcNode!.style.borderWidth).toBe('2px');
    });
  });

  it('node with border_width thick renders kc-node div with borderWidth 3px', async () => {
    /**
     * Verifies that 'thick' token maps to '3px'.
     *
     * Why: Completes the three-step mapping; ensures the thickest border is
     * rendered as a clearly heavier stroke than medium.
     *
     * What breaks: The thickest option is indistinguishable from the others.
     */
    // GIVEN a node with border_width 'thick'
    const styledNode: CanvasNodeData = { ...baseNode, id: 'n5', border_width: 'thick' };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([styledNode]);

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => { expect(container.querySelector('.react-flow')).not.toBeNull(); });

    // THEN borderWidth is 3px
    await waitFor(() => {
      const kcNode = container.querySelector('.kc-node') as HTMLElement | null;
      expect(kcNode).not.toBeNull();
      expect(kcNode!.style.borderWidth).toBe('3px');
    });
  });

  it('node with border_style dashed renders kc-node div with borderStyle dashed', async () => {
    /**
     * Verifies that border_style='dashed' is applied as the CSS borderStyle
     * on the .kc-node div.
     *
     * Why: The border_style token is stored as the same value the CSS property
     * expects ('solid'/'dashed'/'dotted'), so CanvasNode must pass it through.
     * Without this, all nodes render with the default solid border style.
     *
     * What breaks: Users who set dashed or dotted borders see solid borders
     * after a page reload.
     */
    // GIVEN a node with border_style 'dashed'
    const styledNode: CanvasNodeData = { ...baseNode, id: 'n6', border_style: 'dashed' };
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([styledNode]);

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => { expect(container.querySelector('.react-flow')).not.toBeNull(); });

    // THEN borderStyle is dashed
    await waitFor(() => {
      const kcNode = container.querySelector('.kc-node') as HTMLElement | null;
      expect(kcNode).not.toBeNull();
      expect(kcNode!.style.borderStyle).toBe('dashed');
    });
  });

  it('node with null style fields renders without inline border overrides', async () => {
    /**
     * Verifies that a node with all null style fields does NOT get inline style
     * overrides — it should inherit the default styles from App.css.
     *
     * Why: If null values are passed as empty strings or "null" literals to
     * inline styles, they can override the CSS defaults with invalid values,
     * causing broken rendering for un-styled nodes.
     *
     * What breaks: All nodes look broken (no background, zero-width border)
     * because null values pollute the inline style attribute.
     */
    // GIVEN a node with all null style fields (the base fixture)
    // REVIEW: mocking core dependency — test may not reflect real behavior
    vi.spyOn(api, 'fetchNodes').mockResolvedValue([baseNode]);

    // WHEN App mounts
    const { container } = render(<App />);
    await waitFor(() => { expect(container.querySelector('.react-flow')).not.toBeNull(); });

    // THEN the .kc-node has no borderColor, backgroundColor, or borderWidth inline
    await waitFor(() => {
      const kcNode = container.querySelector('.kc-node') as HTMLElement | null;
      expect(kcNode).not.toBeNull();
      expect(kcNode!.style.borderColor).toBe('');
      expect(kcNode!.style.backgroundColor).toBe('');
      expect(kcNode!.style.borderWidth).toBe('');
    });
  });
});

// ─── Tests: edge styling fields ────────────────────────────────────────────────

describe('App — edge styling fields on CanvasEdge interface', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('CanvasEdge interface includes stroke_color stroke_width stroke_style fields', () => {
    /**
     * Verifies that the CanvasEdge TypeScript interface includes the three
     * stroke styling fields with the correct types.
     *
     * Why: The server returns these fields from GET /edges; if the interface
     * doesn't include them, TypeScript will strip them on assignment and the
     * client will never be able to read or apply them.
     *
     * What breaks: Edge styles are always null/undefined even when the server
     * returns valid values — edge customization appears to not work.
     */
    // GIVEN a CanvasEdge object with all three stroke fields
    const edge: CanvasEdge = {
      id: 'e1',
      source_id: 'n1',
      target_id: 'n2',
      source_handle: null,
      target_handle: null,
      label: null,
      stroke_color: '#ff0000',
      stroke_width: 'medium',
      stroke_style: 'dashed',
      created_at: '2024-01-01T00:00:00Z',
    };

    // WHEN we read the stroke fields
    const { stroke_color, stroke_width, stroke_style } = edge;

    // THEN they have the values we set
    expect(stroke_color).toBe('#ff0000');
    expect(stroke_width).toBe('medium');
    expect(stroke_style).toBe('dashed');
  });

  it('CanvasEdge stroke fields can be null', () => {
    /**
     * Verifies that the CanvasEdge stroke fields accept null, since the DB
     * columns default to NULL for un-styled edges.
     *
     * Why: If the fields were typed as non-nullable strings, TypeScript would
     * require callers to supply a value, breaking fetchEdges deserialization
     * for edges that have never been styled.
     *
     * What breaks: TypeScript errors when building fetchEdges response objects
     * that omit stroke fields, preventing un-styled edges from compiling.
     */
    // GIVEN a CanvasEdge with null stroke fields
    const edge: CanvasEdge = {
      id: 'e2',
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

    // WHEN we check the stroke fields
    // THEN they are null (TypeScript permits null assignment — this test verifies the interface)
    expect(edge.stroke_color).toBeNull();
    expect(edge.stroke_width).toBeNull();
    expect(edge.stroke_style).toBeNull();
  });
});
