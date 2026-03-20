// Shared style constants used by NodeDetailPanel, MultiSelectPanel, and EdgeDetailPanel (via StyleControls).

// ─── Node fill colors ─────────────────────────────────────────────────────────
export const BG_COLORS = [
  { id: 'default', label: 'Transparent', color: 'transparent', display: 'transparent', border: 'rgba(255,255,255,0.15)' },
  { id: 'pink',   label: 'Pink',   color: '#fce7f3', display: '#fce7f3', border: null },
  { id: 'mint',   label: 'Mint',   color: '#dcfce7', display: '#dcfce7', border: null },
  { id: 'sky',    label: 'Sky',    color: '#e0f2fe', display: '#e0f2fe', border: null },
  { id: 'yellow', label: 'Yellow', color: '#fef9c3', display: '#fef9c3', border: null },
  { id: 'gray',   label: 'Gray',   color: '#f3f4f6', display: '#f3f4f6', border: null },
];

// ─── Font colors ──────────────────────────────────────────────────────────────
export const FONT_COLORS = [
  { id: 'auto',  label: 'Auto',  color: null       },
  { id: 'black', label: 'Black', color: '#1a1a1a'  },
  { id: 'white', label: 'White', color: '#ffffff'  },
  { id: 'red',   label: 'Red',   color: '#ef4444'  },
  { id: 'blue',  label: 'Blue',  color: '#3b82f6'  },
  { id: 'gray',  label: 'Gray',  color: '#6b7280'  },
];

// ─── Font sizes ───────────────────────────────────────────────────────────────
export const FONT_SIZES = [
  { id: 'small',  label: 'S', title: 'Small (11px)'    },
  { id: 'medium', label: 'M', title: 'Medium (13.5px)' },
  { id: 'large',  label: 'L', title: 'Large (18px)'    },
];

// ─── Stroke colors ────────────────────────────────────────────────────────────
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
