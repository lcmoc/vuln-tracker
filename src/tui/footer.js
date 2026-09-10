import chalk from "chalk";

import { COLOR } from "./theme.js";
import { MODES, MODE_LABELS, SORT_KEYS, SORT_LABELS } from "./filters.js";

const PICKER_HELP = "   ←→ select  enter apply  esc cancel";

export const SEARCH_HELP = chalk.hex(COLOR.dim)("type to search  ·  enter apply  ·  esc cancel");

export const FILTER_OVERLAY_HELP = chalk.hex(COLOR.dim)(
  "↑/↓ (j/k) move  ·  space select  ·  u unassigned  ·  m mine  ·  g clear  ·  esc close"
);

export function modePickerLine(activeIdx) {
  let line = chalk.hex(COLOR.label)("mode: ");
  MODES.forEach((m, i) => {
    const label = ` ${MODE_LABELS[m]} `;
    line +=
      i === activeIdx
        ? chalk.hex(COLOR.textBright).bgHex(COLOR.selectedBg)(label)
        : chalk.hex(COLOR.dim)(label);
    if (i < MODES.length - 1) line += "  ";
  });
  return line + chalk.hex(COLOR.rule)(PICKER_HELP);
}

export function sortPickerLine(activeIdx, sortBy, sortDir) {
  let line = chalk.hex(COLOR.label)("sort: ");
  SORT_KEYS.forEach((k, i) => {
    const isActive = k === sortBy;
    const dirMark = isActive ? (sortDir === "desc" ? " ↓" : " ↑") : "";
    const label = ` ${SORT_LABELS[k]}${dirMark} `;
    if (i === activeIdx) {
      line += chalk.hex(COLOR.textBright).bgHex(COLOR.selectedBg)(label);
    } else if (isActive) {
      line += chalk.hex(COLOR.cyan)(label);
    } else {
      line += chalk.hex(COLOR.dim)(label);
    }
    if (i < SORT_KEYS.length - 1) line += "  ";
  });
  return line + chalk.hex(COLOR.rule)(PICKER_HELP);
}

export function hintLine(sortBy, sortDir) {
  const sortLabel = `${SORT_LABELS[sortBy]}${sortDir === "desc" ? "↓" : "↑"}`;
  return chalk.hex(COLOR.dim)(
    `↑/↓ (j/k) navigate  ·  o / enter open  ·  c copy link  ·  / search  ·  f filter  ·  space mode  ·  s sort [${sortLabel}]  ·  q / esc quit`
  );
}
