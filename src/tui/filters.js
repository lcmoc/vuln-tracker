// View modes, sort keys, and free-text matching for the reports list.

export const MODES = ["assessed", "under_review", "all", "accepted"];
export const MODE_LABELS = { assessed: "Assessed", under_review: "Under Review", all: "All", accepted: "Accepted" };
export const MODE_FILTERS = {
  assessed: (r) => r.triageStatus === "assessed",
  under_review: (r) => r.status === "under_review",
  all: () => true,
  accepted: (r) => r.status === "accepted",
};

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
