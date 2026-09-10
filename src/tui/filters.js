// View modes, sort keys, and free-text matching for the reports list.

export const MODES = ["assessed", "under_review", "all", "accepted"];
export const MODE_LABELS = { assessed: "Assessed", under_review: "Under Review", all: "All", accepted: "Accepted" };
export const MODE_FILTERS = {
  assessed: (r) => r.triageStatus === "assessed",
  under_review: (r) => r.status === "under_review",
  all: () => true,
  accepted: (r) => r.status === "accepted",
};

// ── structured filters (program / severity floor / assignee) ────────────────

export const SEVERITY_RANK = { C: 4, H: 3, M: 2, L: 1, I: 0 };

// Ordered choices for the "severity floor" radio. `value` is the minimum
// criticity a report must reach; null means no severity constraint.
export const SEVERITY_FLOORS = [
  { value: null, label: "Any" },
  { value: "C", label: "Critical" },
  { value: "H", label: "High & up" },
  { value: "M", label: "Medium & up" },
  { value: "L", label: "Low & up" },
];
const SEVERITY_FLOOR_LABEL = { C: "Critical", H: "High", M: "Medium", L: "Low" };

export const ASSIGNEE_UNASSIGNED = "__unassigned__";
export const ASSIGNEE_ME = "__me__";

export const DEFAULT_FILTERS = { program: null, severityFloor: null, assignee: null };

// Coerce a persisted/unknown object into the DEFAULT_FILTERS shape.
export function normalizeFilters(raw) {
  const f = { ...DEFAULT_FILTERS };
  if (!raw || typeof raw !== "object") return f;
  if (typeof raw.program === "string" && raw.program) f.program = raw.program;
  if (raw.severityFloor && SEVERITY_RANK[raw.severityFloor] !== undefined) {
    f.severityFloor = raw.severityFloor;
  }
  if (typeof raw.assignee === "string" && raw.assignee) f.assignee = raw.assignee;
  return f;
}

export function filtersActive(filters) {
  return Boolean(filters.program || filters.severityFloor || filters.assignee);
}

export function matchesFilters(report, filters, meUsername) {
  if (filters.program && report.program !== filters.program) return false;

  if (filters.severityFloor) {
    const rank = SEVERITY_RANK[report.cvssCriticity] ?? -1;
    if (rank < SEVERITY_RANK[filters.severityFloor]) return false;
  }

  const assignees = report.assignees ?? [];
  if (filters.assignee === ASSIGNEE_UNASSIGNED) {
    if (assignees.length > 0) return false;
  } else if (filters.assignee === ASSIGNEE_ME) {
    const me = (meUsername ?? "").toLowerCase();
    if (!me || !assignees.some((a) => a.toLowerCase() === me)) return false;
  } else if (filters.assignee) {
    if (!assignees.includes(filters.assignee)) return false;
  }

  return true;
}

// Short chip string for the header/count line, e.g. "Acme Corp · High+ · unassigned".
export function describeFilters(filters, meUsername) {
  const chips = [];
  if (filters.program) chips.push(filters.program);
  if (filters.severityFloor) chips.push(`${SEVERITY_FLOOR_LABEL[filters.severityFloor]}+`);
  if (filters.assignee === ASSIGNEE_UNASSIGNED) chips.push("unassigned");
  else if (filters.assignee === ASSIGNEE_ME) chips.push(meUsername ? `@${meUsername}` : "me");
  else if (filters.assignee) chips.push(filters.assignee);
  return chips.join(" · ");
}

const byCountThenName = (a, b) => b.count - a.count || a.value.localeCompare(b.value);

export function distinctPrograms(reports) {
  const counts = new Map();
  for (const r of reports) {
    const p = r.program ?? "-";
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort(byCountThenName);
}

export function distinctAssignees(reports) {
  const counts = new Map();
  for (const r of reports) {
    for (const a of r.assignees ?? []) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort(byCountThenName);
}

export const SORT_KEYS = ["date", "assignee", "status", "triageStatus", "title"];
export const SORT_LABELS = { date: "Date", assignee: "Assigned", status: "Status", triageStatus: "Triage", title: "Title" };
export const SORT_DEFAULT_DIR = { date: "desc", assignee: "asc", status: "asc", triageStatus: "asc", title: "asc" };

export function sortValue(report, key) {
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

export function matchesQuery(report, query) {
  if (!query) return true;
  const haystack = [report.title, report.program, report.assignee, report.localId, report.status, report.triageStatus]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}
