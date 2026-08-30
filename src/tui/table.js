import chalk from "chalk";

import { COLOR, sevOf, statusColorOf, statusLabelOf, triageColorOf, triageLabelOf } from "./theme.js";
import { COL, rowContentWidth, titleColWidth } from "./layout.js";
import { cell, cvssText, formatDate, pad } from "./text.js";

export function tableHeaderLine(tableWidth) {
  const titleW = titleColWidth(tableWidth);
  const g = "  ";
  const opt = { fg: COLOR.label, bold: true };
  const line =
    cell("", 1) + g + cell("", 1) + g +
    cell("DATE", COL.date, opt) + g +
    cell("TITLE", titleW, opt) + g +
    cell("PROGRAM", COL.program, opt) + g +
    cell("ASSIGNEE", COL.assignee, opt) + g +
    cell("CVSS", COL.cvss, { ...opt, align: "right" }) + g +
    cell("TRIAGE", COL.triage, opt) + g +
    cell("STATUS", COL.status, opt);
  return line + pad(tableWidth - rowContentWidth(titleW));
}

export function tableRowLine(report, tableWidth, isSelected, rowIndex) {
  const titleW = titleColWidth(tableWidth);
  const sev = sevOf(report.cvssCriticity);
  const altBg = rowIndex % 2 === 1 ? COLOR.rowAlt : undefined;
  const bg = isSelected ? COLOR.selectedBg : altBg;
  const g = bg ? chalk.bgHex(bg)("  ") : "  ";

  const bar = bg
    ? chalk.bgHex(bg).hex(sev.bar)("▌")
    : chalk.hex(sev.bar)("▌");
  const marker = cell(isSelected ? "▸" : " ", 1, { fg: COLOR.cyan, bg });
  const title = cell(report.title, titleW, { fg: isSelected ? COLOR.textBright : COLOR.text, bg });
  const program = cell(report.program, COL.program, { fg: COLOR.program, bg });
  const assignee = cell(report.assignee, COL.assignee, { fg: COLOR.cyan, bg });

  // CVSS as a severity-tinted badge, right aligned in its column.
  let cvss;
  const ct = cvssText(report);
  if (ct == null) {
    cvss = cell("-", COL.cvss, { fg: COLOR.dim, bg, align: "right" });
  } else {
    const txt = ct.length > COL.cvss - 2 ? ct.slice(0, COL.cvss - 2) : ct;
    const badge = chalk.bgHex(sev.bg).hex(sev.fg)(` ${txt} `);
    cvss = pad(COL.cvss - (txt.length + 2), bg) + badge;
  }

  const tc = triageColorOf(report.triageStatus);
  let triageTxt = `● ${triageLabelOf(report.triageStatus)}`;
  if (triageTxt.length > COL.triage) triageTxt = triageTxt.slice(0, COL.triage - 1) + "…";
  let triage = chalk.hex(tc)(triageTxt.padEnd(COL.triage));
  if (bg) triage = chalk.bgHex(bg)(triage);

  const sc = statusColorOf(report.status);
  let statusTxt = `● ${statusLabelOf(report.status)}`;
  if (statusTxt.length > COL.status) statusTxt = statusTxt.slice(0, COL.status - 1) + "…";
  let status = chalk.hex(sc)(statusTxt.padEnd(COL.status));
  if (bg) status = chalk.bgHex(bg)(status);

  const dateVal = formatDate(report.lastActivity ?? report.date);
  const date = cell(dateVal, COL.date, { fg: COLOR.label, bg });

  return (
    bar + g + marker + g + date + g + title + g + program + g + assignee + g + cvss + g + triage + g + status +
    pad(tableWidth - rowContentWidth(titleW), bg)
  );
}

export function buildTableLines(visible, tableWidth, selected, scrollOffset, visibleRows, query) {
  const lines = [tableHeaderLine(tableWidth), chalk.hex(COLOR.border)("─".repeat(tableWidth))];

  if (visible.length === 0) {
    const msg = query ? `no reports match "${query}"` : "no reports";
    const left = Math.max(0, Math.floor((tableWidth - msg.length) / 2));
    lines.push(pad(left) + chalk.hex(COLOR.dim)(msg) + pad(tableWidth - left - Math.min(msg.length, tableWidth)));
  } else {
    for (let i = 0; i < visibleRows; i++) {
      const idx = scrollOffset + i;
      lines.push(idx < visible.length ? tableRowLine(visible[idx], tableWidth, idx === selected, idx) : pad(tableWidth));
    }
  }
  return lines;
}
