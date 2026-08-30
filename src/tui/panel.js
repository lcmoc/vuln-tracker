import chalk from "chalk";

import { COLOR, sevOf, statusColorOf, statusLabelOf, triageColorOf, triageLabelOf } from "./theme.js";
import { cvssText, formatDate, wrapText } from "./text.js";

// The right-hand detail panel for the highlighted report. Always returns
// exactly `bodyHeight` lines, each already framed with the panel background.
export function buildPanelLines(report, panelWidth, bodyHeight) {
  const inner = panelWidth - 4;
  const blank = () => chalk.bgHex(COLOR.panelBg)(" ".repeat(panelWidth));

  // Render inline segments, pad the row to `inner`, frame it with the panel bg.
  const row = (segments) => {
    const plain = segments.map((s) => s.t).join("");
    let styled = segments
      .map((s) => {
        let x = s.t;
        if (s.bold) x = chalk.bold(x);
        if (s.fg) x = chalk.hex(s.fg)(x);
        return x;
      })
      .join("");
    if (plain.length < inner) styled += " ".repeat(inner - plain.length);
    return chalk.bgHex(COLOR.panelBg)("  " + styled + "  ");
  };

  const lines = [];
  if (!report) {
    while (lines.length < bodyHeight) lines.push(blank());
    return lines;
  }

  const sev = sevOf(report.cvssCriticity);
  const kv = (key, value, valueFg = COLOR.text) => {
    const kw = 14;
    const k = key.length > kw ? key.slice(0, kw) : key.padEnd(kw);
    let v = value == null || value === "" ? "-" : String(value);
    const vw = inner - kw;
    if (v.length > vw) v = v.slice(0, vw - 1) + "…";
    return row([{ t: k, fg: COLOR.label }, { t: v, fg: valueFg }]);
  };

  lines.push(row([{ t: "SELECTED REPORT", fg: COLOR.dim, bold: true }]));
  lines.push(blank());
  for (const tl of wrapText(report.title, inner, 3)) {
    lines.push(row([{ t: tl, fg: COLOR.textBright, bold: true }]));
  }
  lines.push(blank());

  // Severity badge + status pill.
  const ct = cvssText(report) ?? "-";
  const badge = chalk.bgHex(sev.bg).hex(sev.fg)(` ${ct} `);
  const statusStr = `● ${statusLabelOf(report.status)}`;
  const styledPill = badge + "  " + chalk.hex(statusColorOf(report.status))(statusStr);
  const plainPill = ` ${ct} ` + "  " + statusStr;
  lines.push(
    chalk.bgHex(COLOR.panelBg)(
      "  " + styledPill + (plainPill.length < inner ? " ".repeat(inner - plainPill.length) : "") + "  "
    )
  );
  lines.push(blank());

  lines.push(kv("Program", report.program));
  lines.push(kv("Assignee", report.assignee, COLOR.cyan));
  lines.push(blank());
  lines.push(kv("Triage", triageLabelOf(report.triageStatus), triageColorOf(report.triageStatus)));
  lines.push(blank());
  lines.push(kv("Report ID", report.localId));
  lines.push(kv("Last activity", formatDate(report.lastActivity ?? report.date)));

  while (lines.length < bodyHeight - 2) lines.push(blank());
  lines.push(row([{ t: "o / enter", fg: COLOR.text }, { t: "  open in browser", fg: COLOR.label }]));
  lines.push(row([{ t: "c", fg: COLOR.text }, { t: "         copy report link", fg: COLOR.label }]));

  if (lines.length > bodyHeight) lines.length = bodyHeight;
  while (lines.length < bodyHeight) lines.push(blank());
  return lines;
}
