import "./env.js";

import { loadCache, saveCache } from "./config.js";

const YWH_API_KEY = process.env.YESWEHACK_API_KEY;
const API_BASE_URL = "https://api.yeswehack.com";
const REPORT_BASE_URL = "https://yeswehack.com/vulnerability-center/reports";
const RESULTS_PER_PAGE = 100;
const TRIAGE_STATUS_FILTER = "assessed";
const WORKFLOW_STATE_FILTER = "under_review";

// How many programs / pages to keep in flight at once. YesWeHack has no
// published rate limit; 8 is comfortably fast without tripping 429s.
const CONCURRENCY = Number(process.env.YWH_CONCURRENCY) || 8;

// Serve the cached result untouched if it is younger than this. Default 0:
// every run does at least an incremental check (page 1 of every program) so
// new activity is never missed. Set YWH_CACHE_TTL_MS to trade freshness for
// an instant, zero-network start when re-running in quick succession.
const CACHE_TTL_MS = Number(process.env.YWH_CACHE_TTL_MS) || 0;
// Past this age, distrust the cache entirely and do a full rebuild.
const CACHE_HARD_TTL_MS = Number(process.env.YWH_CACHE_HARD_TTL_MS) || 24 * 60 * 60 * 1000;
// On an incremental refresh, how many pages of each program's change-sorted
// report list to rescan. Reports are returned newest-change-first, so anything
// touched since the last sync sits at the top — page 1 alone (100 reports) is
// usually enough; the 2nd page is slack for busy programs and is only fetched
// when page 1 hasn't yet reached the last-sync watermark.
const INCREMENTAL_PAGES = Number(process.env.YWH_INCREMENTAL_PAGES) || 2;

// Narrow the result set on the server with filter[status][0]=under_review.
// Verified to return exactly the under_review reports (no false drops), but
// undocumented — if the API ever rejects it we fall back to client-side only.
let serverFilterDisabled = process.env.YWH_SERVER_FILTER === "0";

if (!YWH_API_KEY) {
  throw new Error("Missing YESWEHACK_API_KEY. Set it in .env.");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bounded-concurrency map that preserves input order.
async function pMap(items, mapper, concurrency = CONCURRENCY) {
  const results = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
  return results;
}

async function request(path, params = {}, { retries = 3 } = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        keepalive: true,
        headers: {
          "X-AUTH-TOKEN": YWH_API_KEY,
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw err;
    }

    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(retryAfter ? retryAfter * 1000 : 500 * 2 ** attempt);
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const error = new Error(
        `YesWeHack API request failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`
      );
      error.status = response.status;
      throw error;
    }

    return response.json();
  }
}

const reportsPath = (programSlug) => `/programs/${programSlug}/reports`;

function reportQuery({ page, workflowState }) {
  const query = {
    page,
    resultsPerPage: RESULTS_PER_PAGE,
    "filter[sortBy]": "changedAt",
    "filter[order]": "DESC",
  };
  if (workflowState && !serverFilterDisabled) query["filter[status][0]"] = workflowState;
  return query;
}

// Fetches one page of a program's reports, transparently retrying without the
// server-side status filter if the API doesn't understand it.
async function fetchReportPage(programSlug, page, workflowState) {
  try {
    const data = await request(reportsPath(programSlug), reportQuery({ page, workflowState }));
    return { items: data.items ?? [], pageCount: data.pagination?.nb_pages ?? 1 };
  } catch (err) {
    if (err.status === 400 && workflowState && !serverFilterDisabled) {
      serverFilterDisabled = true;
      process.stderr.write(
        "\nywh: server-side status filter rejected, falling back to client-side filtering.\n"
      );
      const data = await request(reportsPath(programSlug), reportQuery({ page }));
      return { items: data.items ?? [], pageCount: data.pagination?.nb_pages ?? 1 };
    }
    throw err;
  }
}

// All pages of a program's reports, first page then the rest in parallel.
async function fetchAllReports(programSlug, workflowState) {
  const first = await fetchReportPage(programSlug, 1, workflowState);
  if (first.pageCount <= 1) return first.items;

  const restPages = Array.from({ length: first.pageCount - 1 }, (_, i) => i + 2);
  const rest = await pMap(restPages, (page) =>
    fetchReportPage(programSlug, page, workflowState).then((r) => r.items)
  );
  return first.items.concat(...rest);
}

const changedMs = (report) => {
  const t = Date.parse(report.changed_at ?? report.created_at ?? "");
  return Number.isNaN(t) ? null : t;
};

// Reports from a program's change-sorted list that changed at/after `sinceMs`.
// The list is newest-change-first, so we stop at the first older report; a hard
// page cap bounds the work if timestamps are missing or a program churned a lot.
async function fetchReportsChangedSince(programSlug, sinceMs, pageCap) {
  const collected = [];
  const first = await fetchReportPage(programSlug, 1);
  const lastPage = Math.min(pageCap, first.pageCount);

  let items = first.items;
  for (let page = 1; ; page++) {
    for (const report of items) {
      const ts = changedMs(report);
      if (ts != null && ts < sinceMs) return collected;
      collected.push(report);
    }
    if (page >= lastPage) return collected;
    ({ items } = await fetchReportPage(programSlug, page + 1));
  }
}

async function fetchItems(path) {
  const data = await request(path);
  return data.items ?? [];
}

export function getBusinessUnits() {
  return fetchItems("/business-units");
}

export async function getActivePrograms() {
  const businessUnits = await getBusinessUnits();
  const perUnit = await pMap(businessUnits, (bu) =>
    fetchItems(`/business-units/${bu.slug}/programs`)
  );

  const programs = [];
  for (const unitPrograms of perUnit) {
    for (const program of unitPrograms) {
      if (program.demo || program.archived) continue;
      programs.push(program);
    }
  }
  return programs;
}

export function reportLink(reportId) {
  return `${REPORT_BASE_URL}/${reportId}`;
}

function isAssessedAndOpen(report) {
  return (
    report.triage_status === TRIAGE_STATUS_FILTER &&
    report.status?.workflow_state === WORKFLOW_STATE_FILTER
  );
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
    assignees,
    cvssScore: cvss.score ?? null,
    cvssCriticity: cvss.criticity ?? null,
    status: report.status?.workflow_state ?? "-",
    date: report.created_at ?? null,
    link: reportLink(report.id),
  };
}

async function fullFetch(onProgress) {
  const programs = await getActivePrograms();

  const perProgram = await pMap(programs, async (program) => {
    onProgress?.(program);
    const raw = await fetchAllReports(program.slug, WORKFLOW_STATE_FILTER);
    return raw.filter(isAssessedAndOpen).map(normalizeReport);
  });

  return perProgram.flat();
}

// Rescans the top pages of each program (where recently-changed reports live)
// and merges the result over the cached set: reports seen in the scan are
// refreshed or dropped, everything else is kept as-is.
async function incrementalFetch(cache, onProgress) {
  const programs = await getActivePrograms();
  const sinceMs = cache.fetchedAt;

  const scans = await pMap(programs, async (program) => {
    onProgress?.(program);
    return fetchReportsChangedSince(program.slug, sinceMs, INCREMENTAL_PAGES);
  });

  const seenIds = new Set();
  const refreshed = [];
  for (const raw of scans.flat()) {
    seenIds.add(raw.id);
    if (isAssessedAndOpen(raw)) refreshed.push(normalizeReport(raw));
  }

  const untouched = cache.reports.filter((r) => !seenIds.has(r.id));
  return untouched.concat(refreshed);
}

// Returns { reports, source, fetchedAt } where source is
// "cache" | "incremental" | "full".
//
// - Younger than CACHE_TTL_MS (0 by default): the cache is returned as-is.
// - Up to CACHE_HARD_TTL_MS old: an incremental refresh — page 1 of every
//   program is scanned so anything new or changed since last run is caught.
// - Older than that, no cache, or opts.refresh: a full rebuild.
export async function getAssessedReports(onProgress, opts = {}) {
  const { refresh = false, cache: useCache = true } = opts;
  const cache = useCache ? loadCache() : null;
  const now = Date.now();
  const age = cache ? now - cache.fetchedAt : Infinity;

  if (!refresh && cache && age < CACHE_TTL_MS) {
    return { reports: cache.reports, source: "cache", fetchedAt: cache.fetchedAt };
  }

  let reports;
  let source;
  if (refresh || !cache || age >= CACHE_HARD_TTL_MS) {
    reports = await fullFetch(onProgress);
    source = "full";
  } else {
    reports = await incrementalFetch(cache, onProgress);
    source = "incremental";
  }

  const fetchedAt = Date.now();
  if (useCache) saveCache({ fetchedAt, reports });
  return { reports, source, fetchedAt };
}
