/**
 * Shared style token helpers.
 *
 * Both CanvasNode (CSS border) and App (SVG edge stroke) use the same
 * 'thin' / 'medium' / 'thick' token vocabulary, but need different output
 * units (CSS `px` vs. unitless SVG values). Centralising the mappings here
 * prevents the token tables from drifting out of sync as the set of tokens
 * evolves.
 */

/** Map semantic border-width tokens to CSS pixel values (e.g. for HTML borders). */
export function borderWidthToCss(token: string | null): string | undefined {
  if (token === 'thin') return '1px';
  if (token === 'medium') return '2px';
  if (token === 'thick') return '3px';
  return undefined;
}

/** Map semantic stroke-width tokens to unitless SVG stroke-width values. */
export function strokeWidthToCss(token: string | null): string | undefined {
  if (token === 'thin') return '1';
  if (token === 'medium') return '2';
  if (token === 'thick') return '3';
  return undefined;
}

/** Map border/stroke style tokens to SVG strokeDasharray values. */
export function strokeStyleToDasharray(token: string | null): string | undefined {
  if (token === 'dashed') return '5,5';
  if (token === 'dotted') return '2,3';
  return undefined;
}
