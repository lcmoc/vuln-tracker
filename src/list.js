import readline from "node:readline";
import { spawn } from "node:child_process";
import chalk from "chalk";

const COL = {
  program: 18,
  assignee: 14,
  cvss: 11,
  status: 14,
  date: 10,
};
const GAPS = 6; // spaces between the 7 columns
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

function truncate(value, width) {
  const str = String(value ?? "");
  if (str.length <= width) return str.padEnd(width);
  if (width <= 1) return str.slice(0, width);
  return str.slice(0, width - 1) + "…";
}

function titleWidth(totalCols) {
  const fixed =
    COL.program + COL.assignee + COL.cvss + COL.status + COL.date + GAPS + MARKER_WIDTH;
  return Math.max(20, totalCols - fixed);
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
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
      truncate("DATE", COL.date),
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
    truncate(formatDate(report.date), COL.date),
  ];

  const marker = isSelected ? "▸ " : "  ";
  const line = marker + cells.join(" ");

  if (isSelected) {
    return chalk.bgCyan.black(line);
  }

  const [title, prog, assignee, cvss, status, date] = cells;
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
    statusColor(report.status)(status) +
    " " +
    chalk.dim(date)
  );
}

function matchesQuery(report, query) {
  if (!query) return true;
  const haystack = [report.title, report.program, report.assignee, report.localId, report.status]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
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
    let statusMessage = null;
    let statusTimer = null;
    let searchMode = false;
    let searchQuery = "";
    let visible = reports;

    const applyFilter = () => {
      visible = reports.filter((r) => matchesQuery(r, searchQuery));
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
      const visibleRows = Math.max(3, rows - 6);

      if (selected < scrollOffset) scrollOffset = selected;
      if (selected >= scrollOffset + visibleRows) scrollOffset = selected - visibleRows + 1;

      const lines = [];
      const title = searchQuery
        ? `Assessed reports (${visible.length}/${reports.length} matching "${searchQuery}")`
        : `Assessed reports (${reports.length})`;
      lines.push(chalk.bold(title));
      lines.push(
        searchMode
          ? chalk.yellow(`Search: ${searchQuery}█`)
          : chalk.dim(`Search: ${searchQuery || "(press / to search)"}`)
      );
      lines.push(headerRow(cols));
      lines.push("─".repeat(cols));

      for (let i = scrollOffset; i < Math.min(visible.length, scrollOffset + visibleRows); i++) {
        lines.push(formatRow(visible[i], cols, i === selected));
      }

      lines.push("─".repeat(cols));
      lines.push(
        statusMessage
          ? statusMessage
          : searchMode
            ? chalk.dim("type to search  ·  enter apply  ·  esc cancel")
            : chalk.dim(
                "↑/↓ (or j/k) navigate  ·  o / enter open in browser  ·  c copy link  ·  / search  ·  q / esc quit"
              )
      );

      process.stdout.write("\x1B[2J\x1B[H" + lines.join("\n") + "\n");
    };

    const cleanup = () => {
      clearTimeout(statusTimer);
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
              .then(() => flashStatus(chalk.green(`Copied to clipboard: ${link}`)))
              .catch((err) => flashStatus(chalk.red(`Copy failed: ${err.message}`)));
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
          }
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
