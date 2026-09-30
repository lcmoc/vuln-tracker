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

// Responsive column visibility. Optional columns are hidden in order of
// decreasing importance as the table narrows. Each breakpoint is the minimum
// tableWidth that leaves at least MIN_TITLE chars for the title while showing
// that column (assuming less-important columns are already hidden).
//
//   All cols:                  FIXED_COLS + MIN_TITLE = 94
//   Hide ASSIGNEE (saves 12):  FIXED_COLS - 12 + MIN_TITLE = 82
//   Hide TRIAGE too (saves 12): FIXED_COLS - 24 + MIN_TITLE = 70
//   Hide PROGRAM too (saves 14): FIXED_COLS - 38 + MIN_TITLE = 56  (absolute minimum)
export function computeLayout(tableWidth) {
  const showAssignee = tableWidth >= FIXED_COLS + MIN_TITLE;
  const showTriage   = tableWidth >= FIXED_COLS - (COL.assignee + 2) + MIN_TITLE;
  const showProgram  = tableWidth >= FIXED_COLS - (COL.assignee + 2) - (COL.triage + 2) + MIN_TITLE;
  const fixedW =
    FIXED_COLS -
    (showAssignee ? 0 : COL.assignee + 2) -
    (showTriage   ? 0 : COL.triage   + 2) -
    (showProgram  ? 0 : COL.program  + 2);
  const titleW = Math.max(MIN_TITLE, tableWidth - fixedW);
  return { showProgram, showAssignee, showTriage, titleW, fixedW };
}
