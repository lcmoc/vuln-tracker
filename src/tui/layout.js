// Table geometry. Row layout is:
//   bar | marker | DATE | TITLE | PROGRAM | ASSIGNEE | CVSS | TRIAGE | STATUS
// with a two-space gap between every column. Everything except TITLE is fixed
// width; TITLE flexes to fill whatever is left.

export const COL = { bar: 1, marker: 1, program: 12, assignee: 10, cvss: 7, status: 15, date: 10, triage: 10 };
export const GAPS = 16; // 8 gaps × 2 spaces each
export const FIXED_COLS =
  COL.bar + COL.marker + COL.program + COL.assignee + COL.cvss + COL.status + COL.date + COL.triage + GAPS;
export const MIN_TITLE = 12;

export const PANEL_MIN = 30;
export const PANEL_MAX = 44;
export const PANEL_BREAKPOINT = 100; // hide the detail panel below this terminal width

export const titleColWidth = (tableWidth) => Math.max(MIN_TITLE, tableWidth - FIXED_COLS);

// Visible width consumed by a header/row up to (but not including) the trailing
// fill. Kept in one place so the header and body can never drift apart.
export const rowContentWidth = (titleW) =>
  6 + titleW + 2 + COL.program + 2 + COL.assignee + 2 + COL.cvss + 2 + COL.triage + 2 + COL.status + 2 + COL.date;
