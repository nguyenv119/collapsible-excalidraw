import { describe, it, expect } from 'vitest';
import {
  borderWidthToCss,
  strokeWidthToCss,
  strokeStyleToDasharray,
  fontSizeToCss,
  fontSizeToPx,
} from './styleTokens';

// ─── borderWidthToCss ─────────────────────────────────────────────────────────

describe('borderWidthToCss', () => {
  it('thin_token_maps_to_1px', () => {
    /**
     * Verifies that the 'thin' token maps to the CSS pixel value '1px'.
     *
     * Why: CanvasNode stores semantic tokens from the DB, not raw CSS values.
     * The token must be translated to a valid CSS borderWidth value before being
     * applied to the DOM. Without this mapping, the browser ignores the value.
     *
     * What breaks: Nodes with border_width='thin' display the default border
     * width instead of a 1px border, making thin/medium/thick indistinguishable.
     */
    // GIVEN the 'thin' token
    // WHEN translated to CSS
    const result = borderWidthToCss('thin');
    // THEN it returns the CSS pixel value
    expect(result).toBe('1px');
  });

  it('medium_token_maps_to_2px', () => {
    /**
     * Verifies that the 'medium' token maps to '2px'.
     *
     * Why: Each step in the thin/medium/thick scale must produce a distinct CSS
     * value so the three options are visually differentiable.
     *
     * What breaks: Medium and thin borders look the same; user selection has no
     * visible effect.
     */
    // GIVEN the 'medium' token
    // WHEN translated to CSS
    const result = borderWidthToCss('medium');
    // THEN it returns the CSS pixel value
    expect(result).toBe('2px');
  });

  it('thick_token_maps_to_3px', () => {
    /**
     * Verifies that the 'thick' token maps to '3px'.
     *
     * Why: Completes the three-step scale; the thickest option must be
     * visually heavier than medium.
     *
     * What breaks: Thick and medium borders look the same; the thickest
     * setting has no visible effect.
     */
    // GIVEN the 'thick' token
    // WHEN translated to CSS
    const result = borderWidthToCss('thick');
    // THEN it returns the CSS pixel value
    expect(result).toBe('3px');
  });

  it('null_token_returns_undefined', () => {
    /**
     * Verifies that a null token (no border_width set) returns undefined.
     *
     * Why: When a node has no border_width set, the inline style must not
     * override the CSS default. Returning undefined lets the caller omit
     * the property from the style object entirely.
     *
     * What breaks: If undefined is not returned for null, callers that
     * spread the result into a style object may set borderWidth to "undefined"
     * (a string), breaking the CSS default.
     */
    // GIVEN a null token (no value stored in DB)
    // WHEN translated to CSS
    const result = borderWidthToCss(null);
    // THEN it returns undefined so the caller can omit the property
    expect(result).toBeUndefined();
  });

  it('unknown_token_returns_undefined', () => {
    /**
     * Verifies that an unrecognized token returns undefined rather than throwing.
     *
     * Why: DB schema may evolve or contain legacy values. Unknown tokens must
     * gracefully fall back to the CSS default rather than causing a runtime error.
     *
     * What breaks: If unknown tokens throw, a single bad DB row prevents
     * the node from rendering at all.
     */
    // GIVEN an unrecognized token
    // WHEN translated to CSS
    const result = borderWidthToCss('extra-thick');
    // THEN it returns undefined
    expect(result).toBeUndefined();
  });
});

// ─── strokeWidthToCss ─────────────────────────────────────────────────────────

describe('strokeWidthToCss', () => {
  it('thin_token_maps_to_unitless_1', () => {
    /**
     * Verifies that the 'thin' token maps to the unitless SVG value '1'.
     *
     * Why: SVG strokeWidth is unitless (not px). The same token vocabulary
     * ('thin'/'medium'/'thick') is reused for both CSS border and SVG stroke,
     * but the output format differs. Using '1px' for SVG strokeWidth would be
     * ignored by the browser.
     *
     * What breaks: Edge stroke widths are not applied, so all edges appear
     * with the default thickness regardless of the stored token.
     */
    // GIVEN the 'thin' token for an SVG stroke
    // WHEN translated to a unitless CSS stroke value
    const result = strokeWidthToCss('thin');
    // THEN it returns the unitless value
    expect(result).toBe('1');
  });

  it('medium_token_maps_to_unitless_2', () => {
    /**
     * Verifies that 'medium' maps to the unitless SVG value '2'.
     *
     * Why: Same contract as 'thin' — unitless values are required for SVG
     * stroke attributes.
     *
     * What breaks: Medium and thin strokes look the same in SVG.
     */
    // GIVEN the 'medium' token
    // WHEN translated
    const result = strokeWidthToCss('medium');
    // THEN it returns unitless '2'
    expect(result).toBe('2');
  });

  it('thick_token_maps_to_unitless_3', () => {
    /**
     * Verifies that 'thick' maps to the unitless SVG value '3'.
     *
     * Why: Completes the three-step scale for SVG stroke widths.
     *
     * What breaks: Thick strokes are indistinguishable from medium.
     */
    // GIVEN the 'thick' token
    // WHEN translated
    const result = strokeWidthToCss('thick');
    // THEN it returns unitless '3'
    expect(result).toBe('3');
  });

  it('null_token_returns_undefined', () => {
    /**
     * Verifies that null returns undefined, not an empty string or zero.
     *
     * Why: Callers spread the result into a style object. Returning undefined
     * allows the spread to safely omit the property.
     *
     * What breaks: If '0' or '' is returned, edges may render as invisible
     * (zero-width stroke).
     */
    // GIVEN a null token
    // WHEN translated
    const result = strokeWidthToCss(null);
    // THEN it returns undefined
    expect(result).toBeUndefined();
  });
});

// ─── strokeStyleToDasharray ───────────────────────────────────────────────────

describe('strokeStyleToDasharray', () => {
  it('dashed_token_maps_to_5_comma_5', () => {
    /**
     * Verifies that 'dashed' maps to the SVG strokeDasharray value '5,5'.
     *
     * Why: SVG dashed lines require a strokeDasharray attribute. The semantic
     * token 'dashed' must be translated to a specific dash pattern for edges
     * to appear dashed in the browser.
     *
     * What breaks: Edges with stroke_style='dashed' render as solid lines
     * because no dasharray is applied.
     */
    // GIVEN the 'dashed' token
    // WHEN translated to a dasharray string
    const result = strokeStyleToDasharray('dashed');
    // THEN it returns the expected dash pattern
    expect(result).toBe('5,5');
  });

  it('dotted_token_maps_to_2_comma_3', () => {
    /**
     * Verifies that 'dotted' maps to the SVG strokeDasharray value '2,3'.
     *
     * Why: Dotted lines use a shorter dash with a larger gap than dashed lines.
     * Without the correct mapping, dotted and dashed edges look identical.
     *
     * What breaks: Users see no visual difference between dashed and dotted
     * stroke styles.
     */
    // GIVEN the 'dotted' token
    // WHEN translated
    const result = strokeStyleToDasharray('dotted');
    // THEN it returns a short-dash pattern
    expect(result).toBe('2,3');
  });

  it('solid_token_returns_undefined', () => {
    /**
     * Verifies that 'solid' (the default) returns undefined, meaning no
     * strokeDasharray attribute should be set.
     *
     * Why: SVG edges are solid by default. Setting strokeDasharray to an
     * empty string or '0' can cause unexpected rendering. Returning undefined
     * lets the caller omit the attribute entirely.
     *
     * What breaks: Solid edges may render with an invisible or incorrectly
     * dashed stroke if a falsy but non-undefined value is returned.
     */
    // GIVEN the 'solid' token
    // WHEN translated
    const result = strokeStyleToDasharray('solid');
    // THEN it returns undefined (no dasharray needed for solid)
    expect(result).toBeUndefined();
  });

  it('null_token_returns_undefined', () => {
    /**
     * Verifies that null (no stroke_style set) returns undefined.
     *
     * Why: When no stroke style is stored, edges should fall back to the
     * default rendering. Returning undefined safely signals "omit the attribute".
     *
     * What breaks: Edges get an incorrect dasharray applied, altering their
     * appearance even when no stroke style was chosen.
     */
    // GIVEN a null token
    // WHEN translated
    const result = strokeStyleToDasharray(null);
    // THEN it returns undefined
    expect(result).toBeUndefined();
  });
});

// ─── fontSizeToCss ────────────────────────────────────────────────────────────

describe('fontSizeToCss', () => {
  it('null_token_returns_default_13_5px', () => {
    /**
     * Verifies that a null token (no font_size set) returns the default
     * CSS value '13.5px'.
     *
     * Why: When no font_size is stored in the DB, the node title should
     * render at the default size. Unlike borderWidthToCss, fontSizeToCss
     * always returns a string because fontSize must always be set on the
     * title element (no "omit the property" fallback).
     *
     * What breaks: If null returns undefined, spreading into a CSSProperties
     * object leaves fontSize undefined and the title inherits an arbitrary
     * font size from the cascade rather than the intended default.
     */
    // GIVEN no font_size stored in DB (null token)
    // WHEN translated to CSS
    const result = fontSizeToCss(null);
    // THEN it returns the default pixel value
    expect(result).toBe('13.5px');
  });

  it('small_token_maps_to_11px', () => {
    /**
     * Verifies that the 'small' token maps to the CSS pixel value '11px'.
     *
     * Why: The S/M/L font size control stores semantic tokens in the DB.
     * The token must be translated to a concrete CSS value before it is
     * applied as an inline style on the node title. Without the mapping,
     * 'small' is passed directly as fontSize, which the browser ignores.
     *
     * What breaks: Nodes with font_size='small' display at the default
     * font size — the user's size selection has no visible effect.
     */
    // GIVEN the 'small' token
    // WHEN translated to CSS
    const result = fontSizeToCss('small');
    // THEN it returns the small CSS pixel value
    expect(result).toBe('11px');
  });

  it('medium_token_maps_to_default_13_5px', () => {
    /**
     * Verifies that the 'medium' token maps to '13.5px' (same as the
     * null/default case).
     *
     * Why: 'medium' is the mid-point of the S/M/L scale and is the same
     * size as the unstyled default. This ensures that choosing 'medium'
     * explicitly is visually identical to having no font_size set, which
     * is the expected UX behavior.
     *
     * What breaks: If 'medium' maps to a different value than null, then
     * a node styled with 'medium' and a node with no font_size look
     * different — confusing the user about what the default actually is.
     */
    // GIVEN the 'medium' token
    // WHEN translated to CSS
    const result = fontSizeToCss('medium');
    // THEN it returns the same default as null
    expect(result).toBe('13.5px');
  });

  it('large_token_maps_to_18px', () => {
    /**
     * Verifies that the 'large' token maps to the CSS pixel value '18px'.
     *
     * Why: Completes the three-step S/M/L scale. The large option must
     * produce a clearly larger font size than medium so the user's
     * selection has a visible effect on the canvas node title.
     *
     * What breaks: Nodes with font_size='large' display at the same size
     * as medium — the large option has no visible effect.
     */
    // GIVEN the 'large' token
    // WHEN translated to CSS
    const result = fontSizeToCss('large');
    // THEN it returns the large CSS pixel value
    expect(result).toBe('18px');
  });
});

// ─── fontSizeToPx ─────────────────────────────────────────────────────────────

describe('fontSizeToPx', () => {
  it('small_token_returns_11', () => {
    /**
     * Verifies that the 'small' token maps to the numeric pixel value 11.
     *
     * Why: The map-label counter-scaling in CanvasNode needs a numeric pixel
     * value (not a CSS string) to compute the zoom scale factor. Parsing
     * '11px' at render time on every frame would waste CPU; this function
     * provides the canonical numeric value directly.
     *
     * What breaks: If the wrong number is returned, the counter-scale
     * calculation uses the wrong base font size, causing collapsed parent
     * labels to appear too large or too small at various zoom levels.
     */
    // GIVEN the 'small' font-size token
    // WHEN translated to a numeric pixel value
    const result = fontSizeToPx('small');
    // THEN it returns 11
    expect(result).toBe(11);
  });

  it('large_token_returns_18', () => {
    /**
     * Verifies that the 'large' token maps to the numeric pixel value 18.
     *
     * Why: Same contract as the 'small' case — numeric values are required
     * for arithmetic in the zoom-scale calculation. 18 must agree with the
     * value used in fontSizeToCss so the two functions stay in sync.
     *
     * What breaks: A mismatch between fontSizeToPx and fontSizeToCss for the
     * 'large' token means the counter-scale arithmetic uses a different base
     * than the actual rendered size, making the scaled label noticeably wrong.
     */
    // GIVEN the 'large' font-size token
    // WHEN translated to a numeric pixel value
    const result = fontSizeToPx('large');
    // THEN it returns 18
    expect(result).toBe(18);
  });

  it('medium_token_returns_13_5', () => {
    /**
     * Verifies that the 'medium' token maps to the numeric pixel value 13.5.
     *
     * Why: 13.5 is the default/medium size shared with fontSizeToCss. Both
     * functions must agree on this value so that counter-scaling uses the
     * correct base size for the most common font-size setting.
     *
     * What breaks: Nodes with font_size='medium' have a subtly incorrect
     * counter-scale, making their label appear slightly too big or too small
     * when the parent is collapsed.
     */
    // GIVEN the 'medium' font-size token
    // WHEN translated to a numeric pixel value
    const result = fontSizeToPx('medium');
    // THEN it returns 13.5
    expect(result).toBe(13.5);
  });

  it('null_token_returns_default_13_5', () => {
    /**
     * Verifies that a null token (no font_size stored in DB) returns the
     * default numeric pixel value 13.5.
     *
     * Why: Nodes without a font_size fall back to the medium default. The
     * counter-scale calculation passes the stored token directly; if no
     * token is stored the function must still return a safe, correct default.
     *
     * What breaks: If null returns 0 or NaN, the division in the scale
     * calculation (TARGET_PX / (currentFontPx * zoom)) produces Infinity
     * or NaN, causing the counter-scale transform to be invalid and the
     * node label to disappear or render at the wrong size.
     */
    // GIVEN no font_size stored in DB (null token)
    // WHEN translated to a numeric pixel value
    const result = fontSizeToPx(null);
    // THEN it returns the medium default
    expect(result).toBe(13.5);
  });

  it('unknown_token_returns_default_13_5', () => {
    /**
     * Verifies that an unrecognized token falls back to 13.5, not throwing
     * or returning an unexpected value.
     *
     * Why: DB schema may contain legacy or future tokens not yet handled.
     * The function must degrade gracefully to the medium default rather than
     * crashing the render.
     *
     * What breaks: A single node with an unrecognized font_size token causes
     * the counter-scale arithmetic to produce Infinity/NaN, breaking the
     * label rendering for that node.
     */
    // GIVEN an unrecognized font-size token
    // WHEN translated to a numeric pixel value
    const result = fontSizeToPx('extra-large');
    // THEN it falls back to the medium default
    expect(result).toBe(13.5);
  });
});
