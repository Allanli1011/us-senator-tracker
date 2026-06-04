import * as cheerio from "cheerio";
import { archiveSenateEfdResponse } from "./senateEfdArchive.js";
import type {
  SenateEfdFetchResult,
  SenateEfdReportSummary,
  SenateEfdSearchOptions,
  SenateEfdSearchResult,
  SenateEfdSession
} from "./senateEfdTypes.js";

const defaultBaseUrl = "https://efdsearch.senate.gov";
const userAgent = "Mozilla/5.0 (compatible; us-senator-tracker/0.1; public disclosure research)";

export class SenateEfdClient {
  private readonly baseUrl: string;

  constructor(baseUrl = defaultBaseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async createSession(): Promise<SenateEfdSession> {
    const homeUrl = `${this.baseUrl}/search/home/`;
    const home = await fetch(homeUrl, {
      headers: this.headers(),
      redirect: "manual"
    });
    const homeBody = await home.text();
    const csrfToken = extractCsrfToken(homeBody);
    const initialCookie = cookieHeader(home.headers);

    if (!csrfToken) {
      throw new Error("Unable to find Senate eFD CSRF token on agreement page");
    }

    const agreement = await fetch(homeUrl, {
      method: "POST",
      headers: {
        ...this.headers(),
        cookie: initialCookie,
        referer: homeUrl,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        csrfmiddlewaretoken: csrfToken,
        prohibition_agreement: "1"
      }),
      redirect: "manual"
    });

    if (agreement.status !== 302 && agreement.status !== 200) {
      throw new Error(`Senate eFD agreement failed with HTTP ${agreement.status}`);
    }

    return {
      csrfToken,
      cookieHeader: [initialCookie, cookieHeader(agreement.headers)].filter(Boolean).join("; ")
    };
  }

  async fetchPtrReport(uuid: string): Promise<SenateEfdFetchResult> {
    const session = await this.createSession();
    const url = `${this.baseUrl}/search/view/ptr/${uuid}/`;
    const response = await fetch(url, {
      headers: {
        ...this.headers(session),
        referer: `${this.baseUrl}/search/`
      }
    });
    const body = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const archive = await archiveSenateEfdResponse({
      kind: "ptr-view",
      url,
      status: response.status,
      contentType,
      body
    });

    return {
      url,
      status: response.status,
      contentType,
      body,
      archive
    };
  }

  async searchPtrReports(options: SenateEfdSearchOptions = {}): Promise<SenateEfdSearchResult> {
    const session = await this.createSession();
    const url = `${this.baseUrl}/search/report/data/`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...this.headers(session),
        referer: `${this.baseUrl}/search/`,
        "content-type": "application/x-www-form-urlencoded",
        "x-requested-with": "XMLHttpRequest",
        "x-csrftoken": session.csrfToken
      },
      body: buildSearchBody(options)
    });
    const body = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const archive = await archiveSenateEfdResponse({
      kind: "ptr-search",
      url,
      status: response.status,
      contentType,
      body
    });

    if (!response.ok || !contentType.includes("application/json")) {
      return {
        status: response.status,
        contentType,
        archive,
        reports: [],
        sourceUnavailable: true
      };
    }

    const parsed = JSON.parse(body) as {
      recordsTotal?: number;
      recordsFiltered?: number;
      data?: unknown[];
    };

    return {
      status: response.status,
      contentType,
      archive,
      recordsTotal: parsed.recordsTotal,
      recordsFiltered: parsed.recordsFiltered,
      reports: (parsed.data ?? []).map((row) => parseSearchRow(row, this.baseUrl))
    };
  }

  private headers(session?: SenateEfdSession): Record<string, string> {
    return {
      "user-agent": userAgent,
      accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      ...(session ? { cookie: session.cookieHeader } : {})
    };
  }
}

function buildSearchBody(options: SenateEfdSearchOptions): URLSearchParams {
  const length = Math.min(Math.max(options.length ?? 25, 1), 100);
  const params = new URLSearchParams({
    draw: "1",
    start: String(Math.max(options.start ?? 0, 0)),
    length: String(length),
    "search[value]": "",
    "search[regex]": "false",
    report_types: "[11]",
    filer_types: "[1]",
    submitted_start_date: options.submittedStartDate ?? "",
    submitted_end_date: options.submittedEndDate ? toSenateSearchDate(options.submittedEndDate) : "",
    candidate_state: "",
    senator_state: options.senatorState ?? "",
    office_id: "",
    first_name: options.firstName ?? "",
    last_name: options.lastName ?? ""
  });
  params.set("submitted_start_date", options.submittedStartDate ? toSenateSearchDate(options.submittedStartDate) : "");

  for (let index = 0; index < 5; index += 1) {
    params.set(`columns[${index}][data]`, String(index));
    params.set(`columns[${index}][name]`, "");
    params.set(`columns[${index}][searchable]`, "true");
    params.set(`columns[${index}][orderable]`, "true");
    params.set(`columns[${index}][search][value]`, "");
    params.set(`columns[${index}][search][regex]`, "false");
  }

  params.set("order[0][column]", "1");
  params.set("order[0][dir]", "desc");
  return params;
}

function toSenateSearchDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }

  return `${match[2]}/${match[3]}/${match[1]}`;
}

function parseSearchRow(raw: unknown, baseUrl: string): SenateEfdReportSummary {
  const cells = Array.isArray(raw) ? raw.map((cell) => htmlToText(String(cell))) : [];
  const html = Array.isArray(raw) ? raw.map((cell) => String(cell)).join(" ") : JSON.stringify(raw);
  const viewPath = html.match(/\/search\/view\/ptr\/[0-9a-f-]+\//i)?.[0] ?? null;
  const viewUrl = viewPath ? `${baseUrl}${viewPath}` : null;
  const uuid = viewPath?.match(/ptr\/([0-9a-f-]+)\//i)?.[1] ?? null;

  return {
    uuid,
    viewUrl,
    cells,
    raw
  };
}

function htmlToText(value: string): string {
  return cheerio.load(value).text().replace(/\s+/g, " ").trim();
}

function extractCsrfToken(html: string): string | null {
  const $ = cheerio.load(html);
  return $("input[name='csrfmiddlewaretoken']").attr("value") ?? null;
}

function cookieHeader(headers: Headers): string {
  const headerWithSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = headerWithSetCookie.getSetCookie
    ? headerWithSetCookie.getSetCookie()
    : headers.get("set-cookie")
      ? [headers.get("set-cookie") as string]
      : [];

  return cookies.map((cookie) => cookie.split(";")[0]).filter(Boolean).join("; ");
}
