export type TradeType = "Purchase" | "Sale" | "Exchange";
export type OwnerType = "Self" | "Spouse" | "Dependent" | "Joint" | "Unknown";

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
  reportType: string;
  filingDate: string;
  source: string;
  sourceUrl: string;
  rawDocumentPath: string;
  checksum: string;
  parseStatus: string;
  capturedAt: string;
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

export interface EnrichedTransaction {
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
  senator: Senator | null;
  filing: Filing | null;
  security: Security | null;
  marketSnapshot: MarketSnapshot | null;
  disclosureLagDays: number | null;
}

export interface SummaryMetric {
  label: string;
  value: number;
}

export interface Summary {
  metadata: {
    schemaVersion: number;
    generatedAt: string;
    sourceNote: string;
  };
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

export interface CollectorRun {
  id: string;
  status: "running" | "succeeded" | "partial" | "failed";
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
  failures: Array<{
    uuid?: string;
    stage: "search" | "import" | "enrichment" | "unknown";
    message: string;
  }>;
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

export interface TransactionFilters {
  q: string;
  senatorId: string;
  ticker: string;
  type: "All" | TradeType;
  owner: "All" | OwnerType;
}
