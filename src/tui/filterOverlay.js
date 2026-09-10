import chalk from "chalk";

import { COLOR } from "./theme.js";
import { cell, pad } from "./text.js";
import {
  SEVERITY_FLOORS,
  SEVERITY_RANK,
  ASSIGNEE_UNASSIGNED,
  ASSIGNEE_ME,
  distinctPrograms,
  distinctAssignees,
} from "./filters.js";

// The full-body filter overlay: a flat, scrollable list of radio options
// grouped under section headers. Rows come in three kinds:
//   { kind: "header",  label }
//   { kind: "spacer" }
//   { kind: "option",  section, value, label, count, selected }
// One row renders to exactly one line, so scroll math stays 1:1.

export function buildFilterItems(reports, filters, meUsername) {
  const items = [];

  const section = (label, options) => {
    if (items.length) items.push({ kind: "spacer" });
    items.push({ kind: "header", label });
    for (const opt of options) items.push({ kind: "option", ...opt });
  };

  // ── Program ──────────────────────────────────────────────────────────────
  section("Program", [
    { section: "program", value: null, label: "All", count: reports.length, selected: !filters.program },
    ...distinctPrograms(reports).map((p) => ({
      section: "program",
      value: p.value,
      label: p.value,
      count: p.count,
      selected: filters.program === p.value,
    })),
  ]);

  // ── Severity floor ───────────────────────────────────────────────────────
  section(
    "Severity floor",
    SEVERITY_FLOORS.map((f) => ({
      section: "severity",
      value: f.value,
      label: f.label,
      count:
        f.value == null
          ? reports.length
          : reports.filter((r) => (SEVERITY_RANK[r.cvssCriticity] ?? -1) >= SEVERITY_RANK[f.value]).length,
      selected: (filters.severityFloor ?? null) === f.value,
    }))
  );

  // ── Assignee ─────────────────────────────────────────────────────────────
  const me = (meUsername ?? "").toLowerCase();
  section("Assignee", [
    { section: "assignee", value: null, label: "All", count: reports.length, selected: !filters.assignee },
    {
      section: "assignee",
      value: ASSIGNEE_UNASSIGNED,
      label: "Unassigned",
      count: reports.filter((r) => (r.assignees ?? []).length === 0).length,
      selected: filters.assignee === ASSIGNEE_UNASSIGNED,
    },
    {
      section: "assignee",
      value: ASSIGNEE_ME,
      label: meUsername ? `Me (@${meUsername})` : "Me (no username set)",
      count: me ? reports.filter((r) => (r.assignees ?? []).some((a) => a.toLowerCase() === me)).length : 0,
      selected: filters.assignee === ASSIGNEE_ME,
    },
    ...distinctAssignees(reports).map((a) => ({
      section: "assignee",
      value: a.value,
      label: a.value,
      count: a.count,
      selected: filters.assignee === a.value,
    })),
  ]);

  return items;
}

export function selectableIndexes(items) {
  const out = [];
  items.forEach((it, i) => {
    if (it.kind === "option") out.push(i);
  });
  return out;
}

// Exactly `bodyHeight` lines, windowed at `scroll`. `cursor` is an index into
// `items` (always pointing at an option row).
export function buildFilterOverlayLines(items, cursor, scroll, bodyHeight, width) {
  const lines = [];

  for (let i = 0; i < bodyHeight; i++) {
    const idx = scroll + i;
    const it = items[idx];
    if (!it) {
      lines.push(pad(width));
      continue;
    }

    if (it.kind === "spacer") {
      lines.push(pad(width));
      continue;
    }

    if (it.kind === "header") {
      lines.push(
        chalk.hex(COLOR.dim).bold(cell(it.label.toUpperCase(), Math.min(width, 40))) +
          pad(Math.max(0, width - Math.min(width, 40)))
      );
      continue;
    }

    // option row: "  (•) label……………  12"
    const isCursor = idx === cursor;
    const bg = isCursor ? COLOR.selectedBg : undefined;
    const radio = it.selected ? "(•)" : "( )";
    const radioFg = it.selected ? COLOR.cyan : COLOR.dim;
    const countStr = String(it.count);

    const paint = (s, fg) => {
      let x = chalk.hex(fg)(s);
      if (bg) x = chalk.bgHex(bg)(x);
      return x;
    };

    // 2 lead + 3 radio + 1 gap + [label] + 2 gap + [count] + trailing fill
    const labelW = Math.max(4, width - 2 - 3 - 1 - 2 - countStr.length);
    const row =
      pad(2, bg) +
      paint(radio, radioFg) +
      paint(" ", COLOR.dim) +
      paint(cell(it.label, labelW), isCursor ? COLOR.textBright : COLOR.text) +
      paint("  ", COLOR.dim) +
      paint(countStr, COLOR.label) +
      pad(Math.max(0, width - 2 - 3 - 1 - labelW - 2 - countStr.length), bg);

    lines.push(row);
  }

  return lines;
}
