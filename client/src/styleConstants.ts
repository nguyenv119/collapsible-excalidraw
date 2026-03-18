// Shared style constants used by NodeDetailPanel and EdgeDetailPanel.
// Node-specific constants (BG_COLORS, FONT_COLORS) remain local to NodeDetailPanel.

export const STROKE_COLORS = [
  { id: 'default', label: 'Default', color: null, display: 'transparent', border: 'rgba(255,255,255,0.15)' },
  { id: 'dark',    label: 'Dark',    color: '#1a1a1a', display: '#1a1a1a', border: null },
  { id: 'red',     label: 'Red',     color: '#ef4444', display: '#ef4444', border: null },
  { id: 'green',   label: 'Green',   color: '#22c55e', display: '#22c55e', border: null },
  { id: 'blue',    label: 'Blue',    color: '#3b82f6', display: '#3b82f6', border: null },
  { id: 'orange',  label: 'Orange',  color: '#f97316', display: '#f97316', border: null },
];

export const STROKE_WIDTHS = [
  { id: 'thin',   label: '—', title: 'Thin'   },
  { id: 'medium', label: '–', title: 'Medium' },
  { id: 'thick',  label: '━', title: 'Thick'  },
];

export const STROKE_STYLES = [
  { id: 'solid',  label: '—',   title: 'Solid'  },
  { id: 'dashed', label: '╌',   title: 'Dashed' },
  { id: 'dotted', label: '···', title: 'Dotted' },
];
