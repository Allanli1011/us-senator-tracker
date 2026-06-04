import type { Filing, Senator, TradeTransaction } from "../types.js";

export interface ArchivedResponse {
  source: "senate-efd";
  kind: string;
  url: string;
  status: number;
  contentType: string;
  capturedAt: string;
  checksum: string;
  byteLength: number;
  rawPath: string;
  manifestPath: string;
}

export interface SenateEfdSession {
  cookieHeader: string;
  csrfToken: string;
}

export interface SenateEfdFetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
  archive: ArchivedResponse;
}

export interface ParsedSenatePtr {
  uuid: string;
  sourceUrl: string;
  reportDate: string | null;
  filingDate: string | null;
  filerDisplayName: string | null;
  filerName: string | null;
  transactions: Array<{
    rowNumber: number;
    transactionDate: string;
    owner: string;
    ticker: string;
    assetName: string;
    assetType: string;
    transactionType: string;
    amountLabel: string;
    comment: string;
  }>;
}

export interface NormalizedSenatePtr {
  senator: Senator;
  filing: Filing;
  transactions: TradeTransaction[];
}

export interface SenateEfdSearchOptions {
  firstName?: string;
  lastName?: string;
  senatorState?: string;
  submittedStartDate?: string;
  submittedEndDate?: string;
  start?: number;
  length?: number;
}

export interface SenateEfdReportSummary {
  uuid: string | null;
  viewUrl: string | null;
  cells: string[];
  raw: unknown;
}

export interface SenateEfdSearchResult {
  status: number;
  contentType: string;
  archive: ArchivedResponse;
  recordsTotal?: number;
  recordsFiltered?: number;
  reports: SenateEfdReportSummary[];
  sourceUnavailable?: boolean;
}
