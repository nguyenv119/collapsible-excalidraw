import { describe, it, expect } from 'vitest';
import {
  borderWidthToCss,
  strokeWidthToCss,
  strokeStyleToDasharray,
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
