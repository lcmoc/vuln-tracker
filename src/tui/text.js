import chalk from "chalk";

// Text primitives shared by the table and the detail panel. Everything here is
// about fitting plain strings to an exact visual width; colour is applied last
// so ANSI escape length never affects column alignment.

export function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
}

// Truncate/pad a plain string to an exact visual width, then colour it.
export function cell(value, width, { fg, bg, bold, align = "left" } = {}) {
  let s = String(value ?? "");
  if (s.length > width) s = width <= 1 ? s.slice(0, Math.max(0, width)) : s.slice(0, width - 1) + "…";
  s = align === "right" ? s.padStart(width) : s.padEnd(width);
  if (bold) s = chalk.bold(s);
  if (fg) s = chalk.hex(fg)(s);
  if (bg) s = chalk.bgHex(bg)(s);
  return s;
}

export function pad(width, bg) {
  if (width <= 0) return "";
  const s = " ".repeat(width);
  return bg ? chalk.bgHex(bg)(s) : s;
}

export function wrapText(text, width, maxLines) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if ((current + " " + word).length <= width) current += " " + word;
    else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  const joined = lines.join(" ");
  const full = words.join(" ");
  if (lines.length && full.length > joined.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = (last.length > width - 1 ? last.slice(0, width - 1) : last) + "…";
  }
  return lines.map((l) => (l.length > width ? l.slice(0, width - 1) + "…" : l));
}

export function cvssText(report) {
  if (report.cvssScore == null) return null;
  return `${report.cvssScore.toFixed(1)} ${report.cvssCriticity ?? ""}`.trim();
}
