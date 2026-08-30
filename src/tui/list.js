import readline from "node:readline";

import chalk from "chalk";

import { loadConfig, saveConfig } from "../config.js";
import { openInBrowser, copyToClipboard } from "../platform.js";
import { ALT_SCREEN_ENTER, ALT_SCREEN_EXIT, CLEAR_SCREEN, CURSOR_HOME } from "./ansi.js";
import { COLOR, ACCENT } from "./theme.js";
import { FIXED_COLS, MIN_TITLE, PANEL_BREAKPOINT, PANEL_MAX, PANEL_MIN } from "./layout.js";
import { pad } from "./text.js";
import { tableHeaderLine, tableRowLine, buildTableLines } from "./table.js";
import { buildPanelLines } from "./panel.js";
import {
  MODES,
  MODE_LABELS,
  MODE_FILTERS,
  SORT_KEYS,
  SORT_DEFAULT_DIR,
  sortValue,
  matchesQuery,
} from "./filters.js";
import { modePickerLine, sortPickerLine, hintLine, SEARCH_HELP } from "./footer.js";

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
        out.push(SEARCH_HELP);
      } else if (modePickerActive) {
        out.push(modePickerLine(modePickerIdx));
      } else if (sortPickerActive) {
        out.push(sortPickerLine(sortPickerIdx, sortBy, sortDir));
      } else {
        out.push(hintLine(sortBy, sortDir));
      }

      process.stdout.write(CURSOR_HOME + out.join("\n") + "\n");
    };

    const cleanup = () => {
      clearTimeout(statusTimer);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("keypress", onKeypress);
      process.stdout.removeListener("resize", render);
      process.stdout.write(ALT_SCREEN_EXIT);
    };

    // ── per-mode key handlers ────────────────────────────────────────────────

    const handleModePickerKey = (str, key) => {
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
    };

    const handleSortPickerKey = (str, key) => {
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
    };

    const handleSearchKey = (str, key) => {
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
    };

    const handleListKey = (str, key) => {
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
              .then(() => flashStatus(chalk.hex(ACCENT.ok)(`Copied to clipboard: ${link}`)))
              .catch((err) => flashStatus(chalk.hex(ACCENT.error)(`Copy failed: ${err.message}`)));
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

    const onKeypress = (str, key) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        resolve();
        return;
      }
      if (modePickerActive) return handleModePickerKey(str, key);
      if (sortPickerActive) return handleSortPickerKey(str, key);
      if (searchMode) return handleSearchKey(str, key);
      handleListKey(str, key);
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", onKeypress);
    process.stdout.on("resize", render);

    applyFilter();

    process.stdout.write(ALT_SCREEN_ENTER + CLEAR_SCREEN + CURSOR_HOME);
    render();
  });
}
