// Palette and severity/status mappings for the reports TUI. Mirrors the
// "Reports Table" design canvas (claude.ai/design project "Improving table
// readability"): a severity-accented reports table with a detail panel.

export const COLOR = {
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

// Semantic accents used outside the table (status flashes, etc.).
export const ACCENT = {
  ok: "#3fb955",
  error: "#ff5f57",
};

export const SEV = {
  C: { bg: "#5a1620", fg: "#ff6b7a", bar: "#ff3b4e" },
  H: { bg: "#3a1a12", fg: "#ff8a5c", bar: "#ff5f57" },
  M: { bg: "#3a2f0c", fg: "#f5c518", bar: "#f5c518" },
  L: { bg: "#123a1c", fg: "#5fd97a", bar: "#3fb955" },
  I: { bg: "#1c2027", fg: "#8a919c", bar: "#6b7280" },
};
export const sevOf = (criticity) => SEV[criticity] || SEV.I;

const TRIAGE_COLOR = {
  assessed: "#3fb955",
  pending: "#f5c518",
};
export const triageColorOf = (ts) => TRIAGE_COLOR[ts] || "#8a919c";
export const triageLabelOf = (ts) => String(ts || "-").replace(/_/g, " ");

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
export const statusColorOf = (status) => STATUS_COLOR[status] || "#8a919c";
export const statusLabelOf = (status) => String(status || "-").replace(/_/g, " ");
