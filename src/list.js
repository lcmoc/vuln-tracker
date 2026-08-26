import readline from "node:readline";
import { spawn } from "node:child_process";
import chalk from "chalk";

const COL = {
  program: 18,
  assignee: 14,
  cvss: 11,
  status: 14,
};
const GAPS = 5; // spaces between the 6 columns
const MARKER_WIDTH = 2;

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

function truncate(value, width) {
  const str = String(value ?? "");
  if (str.length <= width) return str.padEnd(width);
  if (width <= 1) return str.slice(0, width);
  return str.slice(0, width - 1) + "…";
}

function titleWidth(totalCols) {
  const fixed = COL.program + COL.assignee + COL.cvss + COL.status + GAPS + MARKER_WIDTH;
  return Math.max(20, totalCols - fixed);
}

function cvssColor(criticity) {
  switch (criticity) {
    case "C":
      return chalk.bgRed.white.bold;
    case "H":
      return chalk.red.bold;
    case "M":
      return chalk.yellow;
    case "L":
      return chalk.green;
    case "I":
      return chalk.gray;
    default:
      return chalk.white;
  }
}

function statusColor(status) {
  switch (status) {
    case "new":
      return chalk.blue;
    case "accepted":
      return chalk.green;
    case "asking_for_more_info":
      return chalk.yellow;
    case "resolved":
    case "duplicate":
    case "not_applicable":
    case "informative":
      return chalk.gray;
    default:
      return chalk.white;
  }
}

function headerRow(cols) {
  const header =
    " ".repeat(MARKER_WIDTH) +
    [
      truncate("TITLE", titleWidth(cols)),
      truncate("PROGRAM", COL.program),
      truncate("ASSIGNEE", COL.assignee),
      truncate("CVSS", COL.cvss),
      truncate("STATUS", COL.status),
    ].join(" ");
  return chalk.bold.underline(header);
}

function formatRow(report, cols, isSelected) {
  const cvssLabel =
    report.cvssScore != null
      ? `${report.cvssScore.toFixed(1)} ${report.cvssCriticity ?? ""}`.trim()
      : "-";

  const cells = [
    truncate(report.title, titleWidth(cols)),
    truncate(report.program, COL.program),
    truncate(report.assignee, COL.assignee),
    truncate(cvssLabel, COL.cvss),
    truncate(report.status, COL.status),
  ];

  const marker = isSelected ? "▸ " : "  ";
  const line = marker + cells.join(" ");

  if (isSelected) {
    return chalk.bgCyan.black(line);
  }

  const [title, prog, assignee, cvss, status] = cells;
  return (
    marker +
    chalk.white(title) +
    " " +
    chalk.dim(prog) +
    " " +
    chalk.cyan(assignee) +
    " " +
    cvssColor(report.cvssCriticity)(cvss) +
    " " +
    statusColor(report.status)(status)
  );
}

function renderStatic(reports) {
  const cols = process.stdout.columns || 100;
  console.log(chalk.bold(`Assessed reports (${reports.length})`));
  console.log(headerRow(cols));
  for (const report of reports) {
    console.log(formatRow(report, cols, false));
  }
}

export function runInteractiveList(reports) {
  if (!process.stdin.isTTY) {
    renderStatic(reports);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let selected = 0;
    let scrollOffset = 0;

    const render = () => {
      const rows = process.stdout.rows || 24;
      const cols = process.stdout.columns || 100;
      const visibleRows = Math.max(3, rows - 5);

      if (selected < scrollOffset) scrollOffset = selected;
      if (selected >= scrollOffset + visibleRows) scrollOffset = selected - visibleRows + 1;

      const lines = [];
      lines.push(chalk.bold(`Assessed reports (${reports.length})`));
      lines.push(headerRow(cols));
      lines.push("─".repeat(cols));

      for (let i = scrollOffset; i < Math.min(reports.length, scrollOffset + visibleRows); i++) {
        lines.push(formatRow(reports[i], cols, i === selected));
      }

      lines.push("─".repeat(cols));
      lines.push(chalk.dim("↑/↓ (or j/k) navigate  ·  o / enter open in browser  ·  q / esc quit"));

      process.stdout.write("\x1B[2J\x1B[H" + lines.join("\n") + "\n");
    };

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("keypress", onKeypress);
      process.stdout.removeListener("resize", render);
      process.stdout.write("\x1B[2J\x1B[H");
    };

    const onKeypress = (str, key) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        resolve();
        return;
      }

      switch (key.name) {
        case "up":
          selected = Math.max(0, selected - 1);
          render();
          break;
        case "down":
          selected = Math.min(reports.length - 1, selected + 1);
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
            selected = Math.min(reports.length - 1, selected + 1);
            render();
          }
          break;
        case "o":
        case "return":
          openInBrowser(reports[selected].link);
          break;
        case "q":
        case "escape":
          cleanup();
          resolve();
          break;
        default:
          break;
      }
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", onKeypress);
    process.stdout.on("resize", render);

    render();
  });
}
