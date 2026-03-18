import { describe, it, expect } from 'vitest';
import { STROKE_COLORS, STROKE_WIDTHS, STROKE_STYLES } from './styleConstants';

// ─── STROKE_COLORS ────────────────────────────────────────────────────────────

describe('STROKE_COLORS', () => {
  it('contains exactly six entries in the canonical order', () => {
    /**
     * Verifies that STROKE_COLORS has the six entries agreed upon in the
     * design spec: default, dark, red, green, blue, orange — in that order.
     *
     * Why: Both NodeDetailPanel and EdgeDetailPanel iterate this array to render
     * color swatches. Adding, removing, or reordering entries changes the swatch
     * grid for both panels simultaneously. Having this test makes unintentional
     * mutations visible immediately.
     *
     * What breaks: One panel could render fewer/more swatches than the other if
     * a local copy drifts from the shared source, causing inconsistent UX.
     */
    // GIVEN the exported constant
    // WHEN we inspect its length and ids
    const ids = STROKE_COLORS.map((s) => s.id);

    // THEN there are exactly 6 entries in the expected order
    expect(ids).toEqual(['default', 'dark', 'red', 'green', 'blue', 'orange']);
  });

  it('default entry has null color and a non-null display', () => {
    /**
     * Verifies the shape of the "default" / no-color entry.
     *
     * Why: The default swatch means "remove any custom stroke color". The panel
     * compares entry.color to the stored DB value (null) to decide which swatch
     * is active, so color must be null. The display value drives the swatch
     * background so it must not be null.
     *
     * What breaks: If color is non-null for the default entry, clicking it will
     * store a non-null color in the DB instead of clearing it, preventing the
     * user from resetting to the default style.
     */
    // GIVEN the default swatch
    const defaultEntry = STROKE_COLORS.find((s) => s.id === 'default');

    // WHEN we inspect color vs display
    // THEN color is null (clears DB value) and display is usable for CSS
    expect(defaultEntry).toBeDefined();
    expect(defaultEntry!.color).toBeNull();
    expect(defaultEntry!.display).toBeTruthy();
  });

  it('non-default entries have matching color and display values', () => {
    /**
     * Verifies that for every non-default swatch the color and display values
     * are the same hex string.
     *
     * Why: color is written to the DB; display is used for the button background.
     * If they diverge, the swatch renders a different color than what gets saved,
     * making the UI misleading (the user sees blue but the node turns red).
     *
     * What breaks: The visual selection state and the persisted color do not
     * match, so users cannot reliably know what color they are applying.
     */
    // GIVEN all non-default entries
    const nonDefaults = STROKE_COLORS.filter((s) => s.id !== 'default');

    // WHEN we compare color to display for each entry
    // THEN they must match
    for (const entry of nonDefaults) {
      expect(entry.color).toBe(entry.display);
    }
  });

  it('each entry has id, label, color, display, and border fields', () => {
    /**
     * Verifies the structural shape of every entry in STROKE_COLORS.
     *
     * Why: Both panel components destructure these exact fields when building
     * the swatch button. A missing field causes a runtime undefined, which
     * produces a broken swatch (wrong background, missing title attribute, etc.).
     *
     * What breaks: Swatches render with missing colors or labels, making the
     * style panel visually broken.
     */
    // GIVEN the full constant
    // WHEN we check keys present on each entry
    // THEN all required fields are present (value may be null but key must exist)
    for (const entry of STROKE_COLORS) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('label');
      expect(entry).toHaveProperty('color');
      expect(entry).toHaveProperty('display');
      expect(entry).toHaveProperty('border');
    }
  });
});

// ─── STROKE_WIDTHS ────────────────────────────────────────────────────────────

describe('STROKE_WIDTHS', () => {
  it('contains exactly three entries: thin, medium, thick', () => {
    /**
     * Verifies STROKE_WIDTHS has the three canonical width tokens.
     *
     * Why: CanvasNode maps these token ids to CSS px values (thin→1px, etc.).
     * The DB also stores these exact strings. If a token is missing or renamed,
     * nodes with that width setting will not match any entry and the toggle
     * button will never appear active.
     *
     * What breaks: Width toggles never show as active for nodes that have the
     * missing token stored, giving the appearance that the stored style was lost.
     */
    // GIVEN the exported constant
    const ids = STROKE_WIDTHS.map((w) => w.id);

    // THEN ids are exactly the three canonical tokens
    expect(ids).toEqual(['thin', 'medium', 'thick']);
  });

  it('each entry has id, label, and title fields', () => {
    /**
     * Verifies the structural shape of every STROKE_WIDTHS entry.
     *
     * Why: Panel components use id for comparison, label for button text, and
     * title for the tooltip. A missing field produces a broken toggle button.
     *
     * What breaks: Toggle buttons render without text or tooltip, degrading
     * the accessibility and usability of the style panel.
     */
    // GIVEN the full constant
    // WHEN we check keys on each entry
    // THEN all three fields are present
    for (const entry of STROKE_WIDTHS) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('label');
      expect(entry).toHaveProperty('title');
    }
  });
});

// ─── STROKE_STYLES ────────────────────────────────────────────────────────────

describe('STROKE_STYLES', () => {
  it('contains exactly three entries: solid, dashed, dotted', () => {
    /**
     * Verifies STROKE_STYLES has the three canonical style tokens.
     *
     * Why: These token ids are stored in the DB and also passed directly as CSS
     * borderStyle values on CanvasNode. If an entry is missing or misspelled,
     * nodes with that style will not render correctly after reload.
     *
     * What breaks: A node stored with border_style='dotted' renders as solid
     * (or no border) after reload if 'dotted' is not in the constant, making
     * the user's style choice appear lost.
     */
    // GIVEN the exported constant
    const ids = STROKE_STYLES.map((s) => s.id);

    // THEN ids are exactly the three canonical tokens
    expect(ids).toEqual(['solid', 'dashed', 'dotted']);
  });

  it('each entry has id, label, and title fields', () => {
    /**
     * Verifies the structural shape of every STROKE_STYLES entry.
     *
     * Why: Same structural requirement as STROKE_WIDTHS — panel components
     * rely on id, label, and title to render toggle buttons correctly.
     *
     * What breaks: Toggle buttons render without text or tooltip, degrading
     * usability of the style panel.
     */
    // GIVEN the full constant
    // WHEN we check keys on each entry
    // THEN all three fields are present
    for (const entry of STROKE_STYLES) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('label');
      expect(entry).toHaveProperty('title');
    }
  });

  it('token ids match valid CSS borderStyle values', () => {
    /**
     * Verifies that every STROKE_STYLES id is a valid CSS borderStyle value.
     *
     * Why: CanvasNode passes the stored token directly to the borderStyle CSS
     * property. If a token is not a valid CSS borderStyle, the browser silently
     * ignores it and renders the default, making the style appear not to save.
     *
     * What breaks: Nodes with non-CSS-valid tokens always render with solid
     * borders regardless of what was stored.
     */
    // GIVEN the canonical CSS border-style values we support
    const validCSSValues = new Set(['solid', 'dashed', 'dotted']);

    // WHEN we check each entry's id
    // THEN it must be a valid CSS value
    for (const entry of STROKE_STYLES) {
      expect(validCSSValues.has(entry.id)).toBe(true);
    }
  });
});
