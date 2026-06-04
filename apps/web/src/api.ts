import type { CollectorState, EnrichedTransaction, Security, Senator, Summary, TransactionFilters } from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4010";

export async function fetchSummary(): Promise<Summary> {
  return getJson<Summary>("/api/summary");
}

export async function fetchSenators(): Promise<Senator[]> {
  return getJson<Senator[]>("/api/senators");
}

export async function fetchSecurities(): Promise<Security[]> {
  return getJson<Security[]>("/api/securities");
}

export async function fetchCollectorStatus(): Promise<CollectorState> {
  return getJson<CollectorState>("/api/collector/status");
}

export async function fetchTransactions(filters: TransactionFilters): Promise<EnrichedTransaction[]> {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.senatorId) params.set("senatorId", filters.senatorId);
  if (filters.ticker) params.set("ticker", filters.ticker);
  if (filters.type !== "All") params.set("type", filters.type);
  if (filters.owner !== "All") params.set("owner", filters.owner);
  return getJson<EnrichedTransaction[]>(`/api/transactions?${params.toString()}`);
}

export function csvExportUrl(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.senatorId) params.set("senatorId", filters.senatorId);
  if (filters.ticker) params.set("ticker", filters.ticker);
  if (filters.type !== "All") params.set("type", filters.type);
  if (filters.owner !== "All") params.set("owner", filters.owner);
  return `${apiBaseUrl}/api/transactions/export.csv?${params.toString()}`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
