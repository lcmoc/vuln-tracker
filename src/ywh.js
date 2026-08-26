import "dotenv/config";

const YWH_API_KEY = process.env.YESWEHACK_API_KEY;
const API_BASE_URL = "https://api.yeswehack.com";
const REPORT_BASE_URL = "https://yeswehack.com/vulnerability-center/reports";
const RESULTS_PER_PAGE = 100;
const TRIAGE_STATUS_FILTER = "assessed";

if (!YWH_API_KEY) {
  throw new Error("Missing YESWEHACK_API_KEY. Set it in .env.");
}

async function request(path, params = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      "X-AUTH-TOKEN": YWH_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `YesWeHack API request failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`
    );
  }

  return response.json();
}

async function paginate(path) {
  const items = [];
  let page = 1;

  while (true) {
    const data = await request(path, { page, resultsPerPage: RESULTS_PER_PAGE });
    const pageItems = data.items ?? [];
    items.push(...pageItems);

    const pageCount = data.pagination?.nb_pages ?? 1;
    const currentPage = data.pagination?.page ?? page;
    if (pageItems.length === 0 || currentPage >= pageCount) break;
    page += 1;
  }

  return items;
}

export async function getBusinessUnits() {
  const data = await request("/business-units");
  return data.items ?? [];
}

export async function getActivePrograms() {
  const businessUnits = await getBusinessUnits();
  const programs = [];

  for (const bu of businessUnits) {
    const data = await request(`/business-units/${bu.slug}/programs`);
    for (const program of data.items ?? []) {
      if (program.demo || program.archived) continue;
      programs.push(program);
    }
  }

  return programs;
}

export function getProgramReports(programSlug) {
  return paginate(`/programs/${programSlug}/reports`);
}

export function reportLink(reportId) {
  return `${REPORT_BASE_URL}/${reportId}`;
}

function normalizeReport(report) {
  const cvss = report.cvss ?? {};
  const assignees = report.assignees_usernames ?? [];

  return {
    id: report.id,
    localId: report.local_id ?? String(report.id),
    title: report.title ?? "(untitled)",
    program: report.program?.title ?? report.scope ?? "-",
    assignee: assignees.length ? assignees.join(", ") : "unassigned",
    cvssScore: cvss.score ?? null,
    cvssCriticity: cvss.criticity ?? null,
    status: report.status?.workflow_state ?? "-",
    link: reportLink(report.id),
  };
}

// Fetches every report across all active programs that a triager has assessed
// (report.triage_status === "assessed"). There is no server-side filter for
// this in the API, so each program's reports are pulled and filtered client-side.
export async function getAssessedReports(onProgress) {
  const programs = await getActivePrograms();
  const reports = [];

  for (const program of programs) {
    onProgress?.(program);
    const programReports = await getProgramReports(program.slug);
    for (const report of programReports) {
      if (report.triage_status !== TRIAGE_STATUS_FILTER) continue;
      reports.push(normalizeReport(report));
    }
  }

  return reports;
}
