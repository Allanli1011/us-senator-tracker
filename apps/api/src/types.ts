export type TradeType = "Purchase" | "Sale" | "Exchange";
export type OwnerType = "Self" | "Spouse" | "Dependent" | "Joint" | "Unknown";
export type ParseStatus = "parsed" | "needs_review" | "failed";

export interface AppMetadata {
  schemaVersion: number;
  generatedAt: string;
  sourceNote: string;
}

export interface Senator {
  id: string;
  bioguideId?: string;
  fullName: string;
  state: string;
  stateName?: string;
  party: "D" | "R" | "I" | "Unknown";
  partyName?: string;
  active: boolean;
  currentMember?: boolean;
  chamber?: "Senate" | "House" | "Unknown";
  termStartYear?: number;
  termEndYear?: number;
  congressGovUrl?: string;
  officialWebsiteUrl?: string;
  imageUrl?: string;
  congressGovUpdateDate?: string;
  congressGovLastEnrichedAt?: string;
  congressGovMatchScore?: number;
  committeeTags: string[];
  source?: string;
  isSynthetic?: boolean;
}

export interface Filing {
  id: string;
  senatorId: string;
  reportType: "PTR" | "Annual" | "Amendment";
  filingDate: string;
  source: string;
  sourceUrl: string;
  rawDocumentPath: string;
  checksum: string;
  parseStatus: ParseStatus;
  capturedAt: string;
}

export interface TradeTransaction {
  id: string;
  filingId: string;
  senatorId: string;
  owner: OwnerType;
  transactionDate: string;
  transactionType: TradeType;
  assetName: string;
  ticker: string;
  amountMin: number;
  amountMax: number;
  amountLabel: string;
  comment?: string;
  confidenceScore: number;
  sourceRowHash: string;
}

export interface Security {
  ticker: string;
  companyName: string;
  exchange: string;
  assetType: string;
  sector: string;
  cik?: string;
}

export interface MarketSnapshot {
  ticker: string;
  observationDate: string;
  close: number;
  oneDayReturn: number;
  sevenDayReturn: number;
  thirtyDayReturn: number;
  ninetyDayReturn: number;
}

export interface DisclosureStore {
  metadata: AppMetadata;
  senators: Senator[];
  filings: Filing[];
  transactions: TradeTransaction[];
  securities: Security[];
  marketSnapshots: MarketSnapshot[];
}

export interface EnrichedTransaction extends TradeTransaction {
  senator: Senator | null;
  filing: Filing | null;
  security: Security | null;
  marketSnapshot: MarketSnapshot | null;
  disclosureLagDays: number | null;
}

export interface TransactionQuery {
  q?: string;
  senatorId?: string;
  ticker?: string;
  type?: TradeType | "All";
  owner?: OwnerType | "All";
  from?: string;
  to?: string;
}

export interface SummaryMetric {
  label: string;
  value: number;
}

export interface Summary {
  metadata: AppMetadata;
  totalFilings: number;
  totalTransactions: number;
  amountMinTotal: number;
  amountMaxTotal: number;
  averageDisclosureLagDays: number | null;
  latestFilingDate: string | null;
  typeMix: SummaryMetric[];
  ownerMix: SummaryMetric[];
  topTickers: Array<{
    ticker: string;
    count: number;
    amountMin: number;
    amountMax: number;
  }>;
  topSenators: Array<{
    senatorId: string;
    fullName: string;
    count: number;
    amountMin: number;
    amountMax: number;
  }>;
  recentTransactions: EnrichedTransaction[];
}

export type CollectorRunStatus = "running" | "succeeded" | "partial" | "failed";

export interface CollectorFailure {
  uuid?: string;
  stage: "search" | "import" | "enrichment" | "unknown";
  message: string;
}

export interface CollectorRun {
  id: string;
  status: CollectorRunStatus;
  startedAt: string;
  finishedAt?: string;
  discovered: number;
  imported: number;
  skipped: number;
  failed: number;
  sourceUnavailable: boolean;
  searchedStartDate?: string;
  searchedEndDate?: string;
  archivePath?: string;
  reportUuids: string[];
  failures: CollectorFailure[];
}

export interface CollectorState {
  enabled: boolean;
  intervalMinutes: number | null;
  searchLookbackDays: number;
  pageLength: number;
  maxImportsPerRun: number;
  isRunning: boolean;
  updatedAt: string;
  lastAttemptAt?: string;
  lastSuccessfulRunAt?: string;
  nextRunAt?: string;
  consecutiveFailures: number;
  seenReportUuids: string[];
  recentRuns: CollectorRun[];
}
