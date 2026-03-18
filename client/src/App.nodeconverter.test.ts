import { describe, it, expect } from 'vitest';
import { dbNodeToFlowNodeBase } from './App';
import type { CanvasNodeData } from './api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
  return {
    id: 'n1',
    parent_id: null,
    title: 'Test Node',
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
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('dbNodeToFlowNodeBase', () => {
  it('returns structural fields without any callback in data', () => {
    /**
     * Verifies that dbNodeToFlowNodeBase returns a node whose data
     * contains only structural (DB-derived) fields, with no callback
     * properties mixed in.
     *
     * Why: The split between structural conversion and infrastructure wiring
     * (callbacks) is the whole point of this refactor. If callbacks leak into
     * the converter, the signature keeps growing and the converter becomes
     * coupled to App's internal wiring.
     *
     * What breaks: If callbacks are present in the returned data, adding a new
     * callback later requires modifying the converter, violating separation of
     * concerns and growing the function signature again.
     */
    // GIVEN a plain DB node with no children, no hidden IDs
    const n = makeNode();
    const childMap = new Map<string, string[]>();
    const hiddenIds = new Set<string>();

    // WHEN the structural converter is called
    const result = dbNodeToFlowNodeBase(n, childMap, hiddenIds);

    // THEN the data contains no callback properties
    expect('onToggleCollapse' in result.data).toBe(false);
    expect('onAddChild' in result.data).toBe(false);
    expect('onNodeResized' in result.data).toBe(false);
  });

  it('maps DB position fields to React Flow position object', () => {
    /**
     * Verifies that the x/y fields from the DB row become the React Flow
     * { position: { x, y } } shape expected by the canvas.
     *
     * Why: React Flow's positioning system uses a { position } object, not
     * flat x/y. A mismatch causes nodes to always render at (0, 0).
     *
     * What breaks: Nodes appear stacked at the origin regardless of saved
     * positions, making the canvas unusable.
     */
    // GIVEN a node with specific coordinates
    const n = makeNode({ x: 150, y: 300 });
    const childMap = new Map<string, string[]>();
    const hiddenIds = new Set<string>();

    // WHEN converted
    const result = dbNodeToFlowNodeBase(n, childMap, hiddenIds);

    // THEN position reflects DB x/y
    expect(result.position).toEqual({ x: 150, y: 300 });
  });

  it('sets hidden true for nodes whose ID is in hiddenIds', () => {
    /**
     * Verifies that a node included in hiddenIds is given hidden: true on the
     * returned React Flow node.
     *
     * Why: Collapsed ancestors mark their descendants in hiddenIds so the
     * initial render respects persisted collapse state. If hidden is not set,
     * collapsed subtrees flash visible on reload.
     *
     * What breaks: On page reload, descendants of collapsed nodes briefly
     * appear before being hidden — a visible flash of content.
     */
    // GIVEN a node ID that is in the hidden set
    const n = makeNode({ id: 'hidden-node' });
    const childMap = new Map<string, string[]>();
    const hiddenIds = new Set(['hidden-node']);

    // WHEN converted
    const result = dbNodeToFlowNodeBase(n, childMap, hiddenIds);

    // THEN the node is hidden
    expect(result.hidden).toBe(true);
  });

  it('sets hidden false for nodes not in hiddenIds', () => {
    /**
     * Verifies that nodes outside the hidden set are not accidentally hidden.
     *
     * Why: An overly broad hidden=true would make visible nodes disappear
     * from the canvas.
     *
     * What breaks: Nodes that should be visible disappear from the canvas.
     */
    // GIVEN a node ID that is NOT in the hidden set
    const n = makeNode({ id: 'visible-node' });
    const childMap = new Map<string, string[]>();
    const hiddenIds = new Set(['some-other-node']);

    // WHEN converted
    const result = dbNodeToFlowNodeBase(n, childMap, hiddenIds);

    // THEN the node is not hidden
    expect(result.hidden).toBe(false);
  });

  it('maps hasChildren to true when childMap contains the node ID', () => {
    /**
     * Verifies that hasChildren in the returned data reflects whether the
     * childMap lists children for this node.
     *
     * Why: hasChildren drives whether the collapse toggle is rendered in
     * CanvasNode. If it's wrong, leaf nodes show a collapse button (or
     * parent nodes hide it), breaking the collapse UX.
     *
     * What breaks: Users see spurious collapse buttons on leaf nodes, or
     * can't collapse parent nodes.
     */
    // GIVEN a childMap that lists children for node 'n1'
    const n = makeNode({ id: 'n1' });
    const childMap = new Map([['n1', ['child1']]]);
    const hiddenIds = new Set<string>();

    // WHEN converted
    const result = dbNodeToFlowNodeBase(n, childMap, hiddenIds);

    // THEN hasChildren is true
    expect(result.data.hasChildren).toBe(true);
  });

  it('maps hasChildren to false when childMap has no entry for the node', () => {
    /**
     * Verifies that hasChildren is false for leaf nodes (those with no
     * children in the childMap).
     *
     * Why: Leaf nodes should not render a collapse toggle.
     *
     * What breaks: Leaf nodes show a collapse button that does nothing when clicked.
     */
    // GIVEN a node with no children in childMap
    const n = makeNode({ id: 'n1' });
    const childMap = new Map<string, string[]>();
    const hiddenIds = new Set<string>();

    // WHEN converted
    const result = dbNodeToFlowNodeBase(n, childMap, hiddenIds);

    // THEN hasChildren is false
    expect(result.data.hasChildren).toBe(false);
  });

  it('sets parentId and extent:parent when DB node has a parent_id', () => {
    /**
     * Verifies that child nodes (those with a parent_id) get the React Flow
     * parentId and extent: 'parent' properties, which constrain them within
     * their parent's bounding box.
     *
     * Why: Without extent: 'parent', child nodes can be dragged outside the
     * parent container, breaking the visual hierarchy.
     *
     * What breaks: Child nodes escape their parent container when dragged.
     */
    // GIVEN a node with a parent_id
    const n = makeNode({ id: 'child', parent_id: 'parent' });
    const childMap = new Map<string, string[]>();
    const hiddenIds = new Set<string>();

    // WHEN converted
    const result = dbNodeToFlowNodeBase(n, childMap, hiddenIds);

    // THEN parentId and extent are set
    expect(result.parentId).toBe('parent');
    expect(result.extent).toBe('parent');
  });

  it('does not set parentId or extent when DB node has no parent_id', () => {
    /**
     * Verifies that root nodes (those without parent_id) have no parentId
     * or extent constraint on the React Flow node.
     *
     * Why: Root nodes must be freely positioned on the canvas. Adding
     * extent: 'parent' to a root node would confine it to a nonexistent
     * parent, breaking drag behavior.
     *
     * What breaks: Root nodes cannot be dragged freely on the canvas.
     */
    // GIVEN a root node (no parent_id)
    const n = makeNode({ id: 'root', parent_id: null });
    const childMap = new Map<string, string[]>();
    const hiddenIds = new Set<string>();

    // WHEN converted
    const result = dbNodeToFlowNodeBase(n, childMap, hiddenIds);

    // THEN no parentId or extent
    expect(result.parentId).toBeUndefined();
    expect(result.extent).toBeUndefined();
  });

  it('passes through visual style tokens from DB into data', () => {
    /**
     * Verifies that DB-level style fields (border_color, bg_color, etc.) are
     * mapped to camelCase data fields in the returned React Flow node.
     *
     * Why: The structural converter must carry style state from DB to the
     * component. If tokens are lost, nodes always render with default styles
     * regardless of user customizations.
     *
     * What breaks: Node style customizations (border color, background, etc.)
     * are invisible — nodes always render with default appearance after reload.
     */
    // GIVEN a node with all style tokens set
    const n = makeNode({
      border_color: '#3b82f6',
      bg_color: '#fce7f3',
      border_width: 'thick',
      border_style: 'dashed',
      font_color: '#111111',
    });
    const childMap = new Map<string, string[]>();
    const hiddenIds = new Set<string>();

    // WHEN converted
    const result = dbNodeToFlowNodeBase(n, childMap, hiddenIds);

    // THEN style tokens appear in data
    expect(result.data.borderColor).toBe('#3b82f6');
    expect(result.data.bgColor).toBe('#fce7f3');
    expect(result.data.borderWidth).toBe('thick');
    expect(result.data.borderStyle).toBe('dashed');
    expect(result.data.fontColor).toBe('#111111');
  });

  it('uses DB width/height as node style dimensions when set', () => {
    /**
     * Verifies that when DB stores explicit width/height, they are applied
     * as the node style, so user-resized dimensions persist across reloads.
     *
     * Why: React Flow uses node.style.width/height for rendering. If we
     * ignore the stored values, nodes always reset to default size on reload.
     *
     * What breaks: User-resized nodes reset to default size every page reload.
     */
    // GIVEN a node with explicit width and height
    const n = makeNode({ width: 400, height: 300 });
    const childMap = new Map<string, string[]>();
    const hiddenIds = new Set<string>();

    // WHEN converted
    const result = dbNodeToFlowNodeBase(n, childMap, hiddenIds);

    // THEN style reflects DB dimensions
    expect(result.style).toEqual(expect.objectContaining({ width: 400, height: 300 }));
  });

  it('applies default dimensions to parent nodes without DB-stored size', () => {
    /**
     * Verifies that a node with children but no explicit DB size gets default
     * dimensions (320x240), required by React Flow for subflow container nodes.
     *
     * Why: React Flow requires parent nodes to have explicit dimensions for
     * child nodes using extent: 'parent'. Without this, children may not
     * render or drag correctly.
     *
     * What breaks: Child nodes positioned relative to a parent with unknown
     * bounds behave erratically or become undraggable.
     */
    // GIVEN a parent node with no DB-stored dimensions
    const n = makeNode({ id: 'parent', width: null, height: null });
    const childMap = new Map([['parent', ['child1']]]);
    const hiddenIds = new Set<string>();

    // WHEN converted
    const result = dbNodeToFlowNodeBase(n, childMap, hiddenIds);

    // THEN default dimensions are applied
    expect(result.style).toEqual(expect.objectContaining({ width: 320, height: 240 }));
  });

  it('sets collapsed in data from DB collapsed=1', () => {
    /**
     * Verifies that the DB collapsed flag (integer 0/1) is converted to the
     * boolean `collapsed` field in React Flow node data.
     *
     * Why: CanvasNode reads data.collapsed to determine the expand/collapse
     * button icon. An incorrect value leaves the toggle permanently wrong.
     *
     * What breaks: Parent nodes show the wrong collapse state after reload —
     * e.g., showing "expanded" arrow even though children are hidden.
     */
    // GIVEN a collapsed node
    const n = makeNode({ collapsed: 1 });
    const childMap = new Map([['n1', ['child1']]]);
    const hiddenIds = new Set<string>();

    // WHEN converted
    const result = dbNodeToFlowNodeBase(n, childMap, hiddenIds);

    // THEN collapsed is true
    expect(result.data.collapsed).toBe(true);
  });
});
