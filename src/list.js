import readline from "node:readline";
import { spawn } from "node:child_process";
import chalk from "chalk";
import { loadConfig, saveConfig } from "./config.js";

// Palette and layout mirror the "Reports Table" design canvas
// (claude.ai/design project "Improving table readability"): a two-pane
// terminal view — a severity-accented reports table on the left, a detail
// panel for the highlighted report on the right.
const COLOR = {
  rule: "#23272e",
  border: "#1c2027",
  panelBg: "#101318",
  rowAlt: "#131820",
  selectedBg: "#182430",
  label: "#6b7280",
  dim: "#4b5158",
  text: "#d7dbe0",
  textBright: "#f0f2f4",
  program: "#8a919c",
  cyan: "#56c2ff",
};

const SEV = {
  C: { bg: "#5a1620", fg: "#ff6b7a", bar: "#ff3b4e" },
  H: { bg: "#3a1a12", fg: "#ff8a5c", bar: "#ff5f57" },
  M: { bg: "#3a2f0c", fg: "#f5c518", bar: "#f5c518" },
  L: { bg: "#123a1c", fg: "#5fd97a", bar: "#3fb955" },
  I: { bg: "#1c2027", fg: "#8a919c", bar: "#6b7280" },
};
const sevOf = (criticity) => SEV[criticity] || SEV.I;

const TRIAGE_COLOR = {
  assessed: "#3fb955",
  pending: "#f5c518",
};
const triageColorOf = (ts) => TRIAGE_COLOR[ts] || "#8a919c";
const triageLabelOf = (ts) => String(ts || "-").replace(/_/g, " ");

const STATUS_COLOR = {
  new: "#56c2ff",
  under_review: "#56c2ff",
  accepted: "#3fb955",
  asking_for_more_info: "#f5c518",
  more_info: "#f5c518",
  resolved: "#6b7280",
  duplicate: "#6b7280",
  not_applicable: "#6b7280",
  informative: "#6b7280",
  rtfs: "#6b7280",
  out_of_scope: "#6b7280",
  invalid: "#6b7280",
};
const statusColorOf = (status) => STATUS_COLOR[status] || "#8a919c";
const statusLabelOf = (status) => String(status || "-").replace(/_/g, " ");

// Table geometry: bar | marker | TITLE | PROGRAM | ASSIGNEE | CVSS | STATUS,
// with single-space gaps. Everything except TITLE is fixed width.
const COL = { bar: 1, marker: 1, program: 12, assignee: 10, cvss: 7, status: 15, date: 10, triage: 10 };
const GAPS = 16; // 8 gaps × 2 spaces each
// Everything in a row except the TITLE column.
const FIXED_COLS =
  COL.bar + COL.marker + COL.program + COL.assignee + COL.cvss + COL.status + COL.date + COL.triage + GAPS;
const MIN_TITLE = 12;
const PANEL_MIN = 30;
const PANEL_MAX = 44;
const PANEL_BREAKPOINT = 100; // hide the detail panel below this terminal width

const titleColWidth = (tableWidth) => Math.max(MIN_TITLE, tableWidth - FIXED_COLS);

function openInBrowser(url) {
  const platform = process.platform;
  const [command, args] =
    platform === "darwin"
      ? ["open", [url]]
      : platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];

  spawn(command, args, { stdio: "ignore", detached: true }).unref();
}

function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    const [command, args] =
      platform === "darwin"
        ? ["pbcopy", []]
        : platform === "win32"
          ? ["clip", []]
          : ["xclip", ["-selection", "clipboard"]];

    const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
    child.stdin.write(text);
    child.stdin.end();
  });
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
}

// Truncate/pad a plain string to an exact visual width, then colour it. Styling
// after sizing keeps column alignment independent of ANSI escape length.
function cell(value, width, { fg, bg, bold, align = "left" } = {}) {
  let s = String(value ?? "");
  if (s.length > width) s = width <= 1 ? s.slice(0, Math.max(0, width)) : s.slice(0, width - 1) + "…";
  s = align === "right" ? s.padStart(width) : s.padEnd(width);
  if (bold) s = chalk.bold(s);
  if (fg) s = chalk.hex(fg)(s);
  if (bg) s = chalk.bgHex(bg)(s);
  return s;
}

function pad(width, bg) {
  if (width <= 0) return "";
  const s = " ".repeat(width);
  return bg ? chalk.bgHex(bg)(s) : s;
}

function wrapText(text, width, maxLines) {
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

function cvssText(report) {
  if (report.cvssScore == null) return null;
  return `${report.cvssScore.toFixed(1)} ${report.cvssCriticity ?? ""}`.trim();
}

// ── table ────────────────────────────────────────────────────────────────────

function tableHeaderLine(tableWidth) {
  const titleW = titleColWidth(tableWidth);
  const g = "  ";
  const opt = { fg: COLOR.label, bold: true };
  let line =
    cell("", 1) + g + cell("", 1) + g +
    cell("DATE", COL.date, opt) + g +
    cell("TITLE", titleW, opt) + g +
    cell("PROGRAM", COL.program, opt) + g +
    cell("ASSIGNEE", COL.assignee, opt) + g +
    cell("CVSS", COL.cvss, { ...opt, align: "right" }) + g +
    cell("TRIAGE", COL.triage, opt) + g +
    cell("STATUS", COL.status, opt);
  const used = 6 + titleW + 2 + COL.program + 2 + COL.assignee + 2 + COL.cvss + 2 + COL.triage + 2 + COL.status + 2 + COL.date;
  return line + pad(tableWidth - used);
}

function tableRowLine(report, tableWidth, isSelected, rowIndex) {
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

  const used = 6 + titleW + 2 + COL.program + 2 + COL.assignee + 2 + COL.cvss + 2 + COL.triage + 2 + COL.status + 2 + COL.date;
  return (
    bar + g + marker + g + date + g + title + g + program + g + assignee + g + cvss + g + triage + g + status +
    pad(tableWidth - used, bg)
  );
}

function buildTableLines(visible, tableWidth, selected, scrollOffset, visibleRows, query) {
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

// ── detail panel ─────────────────────────────────────────────────────────────

function buildPanelLines(report, panelWidth, bodyHeight) {
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

// ── modes ────────────────────────────────────────────────────────────────────

const MODES = ["assessed", "under_review", "all", "accepted"];
const MODE_LABELS = { assessed: "Assessed", under_review: "Under Review", all: "All", accepted: "Accepted" };
const MODE_FILTERS = {
  assessed: (r) => r.triageStatus === "assessed",
  under_review: (r) => r.status === "under_review",
  all: () => true,
  accepted: (r) => r.status === "accepted",
};

// ── sort ─────────────────────────────────────────────────────────────────────

const SORT_KEYS = ["date", "assignee", "status", "triageStatus", "title"];
const SORT_LABELS = { date: "Date", assignee: "Assigned", status: "Status", triageStatus: "Triage", title: "Title" };
const SORT_DEFAULT_DIR = { date: "desc", assignee: "asc", status: "asc", triageStatus: "asc", title: "asc" };

function sortValue(report, key) {
  switch (key) {
    case "date": {
      const d = new Date(report.lastActivity ?? report.date ?? 0);
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }
    case "assignee": return (report.assignee ?? "").toLowerCase();
    case "status":   return (report.status ?? "").toLowerCase();
    case "triageStatus": return (report.triageStatus ?? "").toLowerCase();
    case "title":    return (report.title ?? "").toLowerCase();
    default:         return "";
  }
}

// ── static (non-TTY) fallback ────────────────────────────────────────────────

function renderStatic(reports) {
  const cols = process.stdout.columns || 100;
  const tableWidth = Math.min(Math.max(cols, FIXED_COLS + MIN_TITLE), 140);
  const filtered = reports.filter(MODE_FILTERS.assessed);
  console.log(chalk.hex(COLOR.textBright).bold("Assessed ") + chalk.hex(COLOR.label)(`(${filtered.length})`));
  console.log(tableHeaderLine(tableWidth));
  for (const report of filtered) {
    console.log(tableRowLine(report, tableWidth, false));
  }
}

// ── interactive ──────────────────────────────────────────────────────────────

export function runInteractiveList(reports) {
  if (!process.stdin.isTTY) {
    renderStatic(reports);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const cfg = loadConfig();
    let selected = 0;
    let scrollOffset = 0;
    let statusMessage = null;
    let statusTimer = null;
    let searchMode = false;
    let searchQuery = "";
    let mode = "assessed";
    let modePickerActive = false;
    let modePickerIdx = 0;
    let sortBy = cfg.sortBy && SORT_KEYS.includes(cfg.sortBy) ? cfg.sortBy : "date";
    let sortDir = cfg.sortDir === "asc" || cfg.sortDir === "desc" ? cfg.sortDir : "desc";
    let sortPickerActive = false;
    let sortPickerIdx = SORT_KEYS.indexOf(sortBy);
    let visible = [];

    const applySort = () => {
      visible.sort((a, b) => {
        const av = sortValue(a, sortBy);
        const bv = sortValue(b, sortBy);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "desc" ? -cmp : cmp;
      });
    };

    const applyFilter = () => {
      const mf = MODE_FILTERS[mode];
      visible = reports.filter((r) => mf(r) && matchesQuery(r, searchQuery));
      applySort();
      selected = 0;
      scrollOffset = 0;
    };

    const flashStatus = (message) => {
      statusMessage = message;
      render();
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        statusMessage = null;
        render();
      }, 1500);
    };

    const render = () => {
      const rows = process.stdout.rows || 24;
      const cols = process.stdout.columns || 100;

      const showPanel = cols >= PANEL_BREAKPOINT;
      const panelWidth = showPanel
        ? Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.floor(cols * 0.34)))
        : 0;
      const tableWidth = showPanel ? cols - panelWidth - 1 : cols;

      const bodyHeight = Math.max(6, rows - 5);
      const visibleRows = Math.max(3, bodyHeight - 2);

      if (selected < scrollOffset) scrollOffset = selected;
      if (selected >= scrollOffset + visibleRows) scrollOffset = selected - visibleRows + 1;

      const out = [];

      const modeTotal = reports.filter(MODE_FILTERS[mode]).length;
      const countText = searchQuery ? `${visible.length}/${modeTotal}` : `${modeTotal}`;
      out.push(chalk.hex(COLOR.textBright).bold(`${MODE_LABELS[mode]} `) + chalk.hex(COLOR.label)(`(${countText})`));

      const matchText = `${visible.length} match${visible.length === 1 ? "" : "es"}`;
      const placeholder = "search title, program, assignee, status…";
      if (searchMode) {
        out.push(
          chalk.hex(COLOR.cyan)("/ ") + chalk.hex(COLOR.text)(searchQuery) +
          chalk.hex(COLOR.cyan)("█") + "  " + chalk.hex(COLOR.dim)(matchText)
        );
      } else {
        out.push(
          chalk.hex(COLOR.cyan)("/ ") +
          chalk.hex(searchQuery ? COLOR.text : COLOR.dim)(searchQuery || placeholder) +
          "  " + chalk.hex(COLOR.dim)(matchText)
        );
      }

      out.push(chalk.hex(COLOR.rule)("─".repeat(cols)));

      const leftLines = buildTableLines(
        visible, tableWidth, selected, scrollOffset, bodyHeight - 2, searchQuery
      );
      const rightLines = showPanel
        ? buildPanelLines(visible[selected] || null, panelWidth, bodyHeight)
        : null;

      for (let i = 0; i < bodyHeight; i++) {
        const left = leftLines[i] ?? pad(tableWidth);
        if (showPanel) {
          const right = rightLines[i] ?? chalk.bgHex(COLOR.panelBg)(" ".repeat(panelWidth));
          out.push(left + chalk.hex(COLOR.rule)("│") + right);
        } else {
          out.push(left);
        }
      }

      out.push(chalk.hex(COLOR.rule)("─".repeat(cols)));

      if (statusMessage) {
        out.push(statusMessage);
      } else if (searchMode) {
        out.push(chalk.hex(COLOR.dim)("type to search  ·  enter apply  ·  esc cancel"));
      } else if (modePickerActive) {
        let pickerLine = chalk.hex(COLOR.label)("mode: ");
        MODES.forEach((m, i) => {
          const label = ` ${MODE_LABELS[m]} `;
          if (i === modePickerIdx) {
            pickerLine += chalk.hex(COLOR.textBright).bgHex(COLOR.selectedBg)(label);
          } else {
            pickerLine += chalk.hex(COLOR.dim)(label);
          }
          if (i < MODES.length - 1) pickerLine += "  ";
        });
        pickerLine += chalk.hex(COLOR.rule)("   ←→ select  enter apply  esc cancel");
        out.push(pickerLine);
      } else if (sortPickerActive) {
        let pickerLine = chalk.hex(COLOR.label)("sort: ");
        SORT_KEYS.forEach((k, i) => {
          const isActive = k === sortBy;
          const dirMark = isActive ? (sortDir === "desc" ? " ↓" : " ↑") : "";
          const label = ` ${SORT_LABELS[k]}${dirMark} `;
          if (i === sortPickerIdx) {
            pickerLine += chalk.hex(COLOR.textBright).bgHex(COLOR.selectedBg)(label);
          } else if (isActive) {
            pickerLine += chalk.hex(COLOR.cyan)(label);
          } else {
            pickerLine += chalk.hex(COLOR.dim)(label);
          }
          if (i < SORT_KEYS.length - 1) pickerLine += "  ";
        });
        pickerLine += chalk.hex(COLOR.rule)("   ←→ select  enter apply  esc cancel");
        out.push(pickerLine);
      } else {
        const sortLabel = `${SORT_LABELS[sortBy]}${sortDir === "desc" ? "↓" : "↑"}`;
        out.push(
          chalk.hex(COLOR.dim)(
            `↑/↓ (j/k) navigate  ·  o / enter open  ·  c copy link  ·  / search  ·  space mode  ·  s sort [${sortLabel}]  ·  q / esc quit`
          )
        );
      }

      process.stdout.write("\x1B[H" + out.join("\n") + "\n");
    };

    const cleanup = () => {
      clearTimeout(statusTimer);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("keypress", onKeypress);
      process.stdout.removeListener("resize", render);
      process.stdout.write("\x1B[?1049l");
    };

    const onKeypress = (str, key) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        resolve();
        return;
      }

      if (modePickerActive) {
        switch (key.name) {
          case "left":
          case "h":
            modePickerIdx = (modePickerIdx - 1 + MODES.length) % MODES.length;
            render();
            break;
          case "right":
          case "l":
            modePickerIdx = (modePickerIdx + 1) % MODES.length;
            render();
            break;
          case "return":
          case "space":
            mode = MODES[modePickerIdx];
            modePickerActive = false;
            applyFilter();
            render();
            break;
          case "escape":
            modePickerActive = false;
            render();
            break;
          default:
            if (str >= "1" && str <= "4") {
              const idx = parseInt(str, 10) - 1;
              if (idx < MODES.length) {
                modePickerIdx = idx;
                mode = MODES[modePickerIdx];
                modePickerActive = false;
                applyFilter();
                render();
              }
            }
            break;
        }
        return;
      }

      if (sortPickerActive) {
        switch (key.name) {
          case "left":
          case "h":
            sortPickerIdx = (sortPickerIdx - 1 + SORT_KEYS.length) % SORT_KEYS.length;
            render();
            break;
          case "right":
          case "l":
            sortPickerIdx = (sortPickerIdx + 1) % SORT_KEYS.length;
            render();
            break;
          case "return":
          case "space": {
            const newKey = SORT_KEYS[sortPickerIdx];
            if (newKey === sortBy) {
              sortDir = sortDir === "asc" ? "desc" : "asc";
            } else {
              sortBy = newKey;
              sortDir = SORT_DEFAULT_DIR[newKey];
            }
            sortPickerActive = false;
            applySort();
            saveConfig({ ...loadConfig(), sortBy, sortDir });
            render();
            break;
          }
          case "escape":
            sortPickerActive = false;
            render();
            break;
          default:
            break;
        }
        return;
      }

      if (searchMode) {
        switch (key.name) {
          case "return":
            searchMode = false;
            render();
            break;
          case "escape":
            searchMode = false;
            searchQuery = "";
            applyFilter();
            render();
            break;
          case "backspace":
            searchQuery = searchQuery.slice(0, -1);
            applyFilter();
            render();
            break;
          default:
            if (str && !key.ctrl && !key.meta) {
              searchQuery += str;
              applyFilter();
              render();
            }
            break;
        }
        return;
      }

      switch (key.name) {
        case "up":
          selected = Math.max(0, selected - 1);
          render();
          break;
        case "down":
          selected = Math.min(visible.length - 1, selected + 1);
          render();
          break;
        case "k":
          if (!key.ctrl && !key.meta) {
            selected = Math.max(0, selected - 1);
            render();
          }
          break;
        case "j":
          if (!key.ctrl && !key.meta) {
            selected = Math.min(visible.length - 1, selected + 1);
            render();
          }
          break;
        case "o":
        case "return":
          if (visible[selected]) openInBrowser(visible[selected].link);
          break;
        case "c":
          if (!key.ctrl && !key.meta && visible[selected]) {
            const link = visible[selected].link;
            copyToClipboard(link)
              .then(() => flashStatus(chalk.hex("#3fb955")(`Copied to clipboard: ${link}`)))
              .catch((err) => flashStatus(chalk.hex("#ff5f57")(`Copy failed: ${err.message}`)));
          }
          break;
        case "escape":
          if (searchQuery) {
            searchQuery = "";
            applyFilter();
            render();
            break;
          }
        // eslint-disable-next-line no-fallthrough
        case "q":
          cleanup();
          resolve();
          break;
        default:
          if (str === "/") {
            searchMode = true;
            render();
          } else if (str === " ") {
            modePickerActive = true;
            modePickerIdx = MODES.indexOf(mode);
            render();
          } else if (str === "s") {
            sortPickerActive = true;
            sortPickerIdx = SORT_KEYS.indexOf(sortBy);
            render();
          }
          break;
      }
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", onKeypress);
    process.stdout.on("resize", render);

    applyFilter();

    process.stdout.write("\x1B[?1049h\x1B[2J\x1B[H");
    render();
  });
}

function matchesQuery(report, query) {
  if (!query) return true;
  const haystack = [report.title, report.program, report.assignee, report.localId, report.status, report.triageStatus]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}
