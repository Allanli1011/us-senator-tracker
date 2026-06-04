import fs from "node:fs/promises";
import path from "node:path";
import { processedDataDir, seedFilePath, storeFilePath } from "./paths.js";
import { differenceInCalendarDays, isIsoDate } from "./dateUtils.js";
import type {
  DisclosureStore,
  EnrichedTransaction,
  Filing,
  MarketSnapshot,
  Security,
  Senator,
  Summary,
  TradeTransaction,
  TransactionQuery
} from "./types.js";

export class DisclosureRepository {
  private readonly storePath: string;

  constructor(storePath = storeFilePath) {
    this.storePath = storePath;
  }

  async read(): Promise<DisclosureStore> {
    await this.ensureStore();
    const raw = await fs.readFile(this.storePath, "utf8");
    return JSON.parse(raw) as DisclosureStore;
  }

  async write(store: DisclosureStore): Promise<void> {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    const next = {
      ...store,
      metadata: {
        ...store.metadata,
        generatedAt: new Date().toISOString()
      }
    };
    await fs.writeFile(this.storePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }

  async listSenators(): Promise<Senator[]> {
    const store = await this.read();
    return [...store.senators].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async listSecurities(): Promise<Security[]> {
    const store = await this.read();
    return [...store.securities].sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  async findOrCreateSenatorByName(fullName: string, source = "manual"): Promise<Senator> {
    const store = await this.read();
    const normalized = normalizeName(fullName);
    const existing = store.senators.find((senator) => normalizeName(senator.fullName) === normalized);
    if (existing) {
      return existing;
    }

    const senator: Senator = {
      id: `sen-${slugify(fullName)}`,
      fullName,
      state: "Unknown",
      party: "Unknown",
      active: true,
      committeeTags: [],
      source
    };

    store.senators.push(senator);
    await this.write(store);
    return senator;
  }

  async getSenatorById(senatorId: string): Promise<Senator | null> {
    const store = await this.read();
    return store.senators.find((senator) => senator.id === senatorId) ?? null;
  }

  async updateSenator(senatorId: string, patch: Partial<Senator>): Promise<Senator> {
    const store = await this.read();
    const index = store.senators.findIndex((senator) => senator.id === senatorId);
    if (index < 0) {
      throw new Error(`Unknown senator id: ${senatorId}`);
    }

    const updated = {
      ...store.senators[index],
      ...patch,
      id: store.senators[index].id
    };
    store.senators[index] = updated;
    await this.write(store);
    return updated;
  }

  async listTransactions(query: TransactionQuery = {}): Promise<EnrichedTransaction[]> {
    const store = await this.read();
    return this.enrichTransactions(store, store.transactions)
      .filter((transaction) => matchesTransaction(transaction, query))
      .sort((a, b) => {
        const filingDateDiff = (b.filing?.filingDate ?? "").localeCompare(a.filing?.filingDate ?? "");
        if (filingDateDiff !== 0) {
          return filingDateDiff;
        }
        return b.transactionDate.localeCompare(a.transactionDate);
      });
  }

  async getSummary(): Promise<Summary> {
    const store = await this.read();
    const enriched = this.enrichTransactions(store, store.transactions);
    const disclosureLags = enriched
      .map((transaction) => transaction.disclosureLagDays)
      .filter((value): value is number => value !== null);

    const amountMinTotal = enriched.reduce((sum, transaction) => sum + transaction.amountMin, 0);
    const amountMaxTotal = enriched.reduce((sum, transaction) => sum + transaction.amountMax, 0);

    return {
      metadata: store.metadata,
      totalFilings: store.filings.length,
      totalTransactions: store.transactions.length,
      amountMinTotal,
      amountMaxTotal,
      averageDisclosureLagDays:
        disclosureLags.length > 0
          ? Number((disclosureLags.reduce((sum, value) => sum + value, 0) / disclosureLags.length).toFixed(1))
          : null,
      latestFilingDate: latestDate(store.filings.map((filing) => filing.filingDate)),
      typeMix: groupCount(enriched, (transaction) => transaction.transactionType),
      ownerMix: groupCount(enriched, (transaction) => transaction.owner),
      topTickers: topTickers(enriched),
      topSenators: topSenators(enriched),
      recentTransactions: enriched
        .sort((a, b) => (b.filing?.filingDate ?? "").localeCompare(a.filing?.filingDate ?? ""))
        .slice(0, 5)
    };
  }

  async upsertFilingWithTransactions(filing: Filing, transactions: TradeTransaction[]): Promise<{
    inserted: number;
    skipped: number;
  }> {
    const store = await this.read();
    const existingFilingIndex = store.filings.findIndex((candidate) => candidate.id === filing.id);
    if (existingFilingIndex >= 0) {
      store.filings[existingFilingIndex] = filing;
    } else {
      store.filings.push(filing);
    }

    const rowHashes = new Set(store.transactions.map((transaction) => transaction.sourceRowHash));
    let inserted = 0;
    let skipped = 0;

    for (const transaction of transactions) {
      if (rowHashes.has(transaction.sourceRowHash)) {
        skipped += 1;
        continue;
      }

      store.transactions.push(transaction);
      rowHashes.add(transaction.sourceRowHash);
      inserted += 1;
    }

    await this.write(store);
    return { inserted, skipped };
  }

  private async ensureStore(): Promise<void> {
    try {
      await fs.access(this.storePath);
    } catch {
      await fs.mkdir(processedDataDir, { recursive: true });
      await fs.copyFile(seedFilePath, this.storePath);
    }
  }

  private enrichTransactions(store: DisclosureStore, transactions: TradeTransaction[]): EnrichedTransaction[] {
    const senators = new Map(store.senators.map((senator) => [senator.id, senator]));
    const filings = new Map(store.filings.map((filing) => [filing.id, filing]));
    const securities = new Map(store.securities.map((security) => [security.ticker.toUpperCase(), security]));
    const marketSnapshots = new Map(
      store.marketSnapshots.map((snapshot) => [snapshot.ticker.toUpperCase(), snapshot])
    );

    return transactions.map((transaction) => {
      const filing = filings.get(transaction.filingId) ?? null;
      return {
        ...transaction,
        senator: senators.get(transaction.senatorId) ?? null,
        filing,
        security: securities.get(transaction.ticker.toUpperCase()) ?? null,
        marketSnapshot: marketSnapshots.get(transaction.ticker.toUpperCase()) ?? null,
        disclosureLagDays: filing ? differenceInCalendarDays(filing.filingDate, transaction.transactionDate) : null
      };
    });
  }
}

function matchesTransaction(transaction: EnrichedTransaction, query: TransactionQuery): boolean {
  if (query.senatorId && transaction.senatorId !== query.senatorId) {
    return false;
  }

  if (query.ticker && transaction.ticker.toUpperCase() !== query.ticker.toUpperCase()) {
    return false;
  }

  if (query.type && query.type !== "All" && transaction.transactionType !== query.type) {
    return false;
  }

  if (query.owner && query.owner !== "All" && transaction.owner !== query.owner) {
    return false;
  }

  if (isIsoDate(query.from) && transaction.transactionDate < query.from) {
    return false;
  }

  if (isIsoDate(query.to) && transaction.transactionDate > query.to) {
    return false;
  }

  if (query.q) {
    const needle = query.q.toLowerCase();
    const haystack = [
      transaction.assetName,
      transaction.ticker,
      transaction.senator?.fullName,
      transaction.security?.companyName,
      transaction.security?.sector
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(needle)) {
      return false;
    }
  }

  return true;
}

function latestDate(values: string[]): string | null {
  return values.length > 0 ? [...values].sort().at(-1) ?? null : null;
}

function groupCount<T>(items: T[], keyFor: (item: T) => string): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function topTickers(transactions: EnrichedTransaction[]): Summary["topTickers"] {
  const groups = new Map<string, { ticker: string; count: number; amountMin: number; amountMax: number }>();
  for (const transaction of transactions) {
    const ticker = transaction.ticker.toUpperCase();
    const group = groups.get(ticker) ?? { ticker, count: 0, amountMin: 0, amountMax: 0 };
    group.count += 1;
    group.amountMin += transaction.amountMin;
    group.amountMax += transaction.amountMax;
    groups.set(ticker, group);
  }

  return [...groups.values()]
    .sort((a, b) => b.count - a.count || b.amountMax - a.amountMax)
    .slice(0, 6);
}

function topSenators(transactions: EnrichedTransaction[]): Summary["topSenators"] {
  const groups = new Map<
    string,
    { senatorId: string; fullName: string; count: number; amountMin: number; amountMax: number }
  >();

  for (const transaction of transactions) {
    const fullName = transaction.senator?.fullName ?? transaction.senatorId;
    const group = groups.get(transaction.senatorId) ?? {
      senatorId: transaction.senatorId,
      fullName,
      count: 0,
      amountMin: 0,
      amountMax: 0
    };
    group.count += 1;
    group.amountMin += transaction.amountMin;
    group.amountMax += transaction.amountMax;
    groups.set(transaction.senatorId, group);
  }

  return [...groups.values()]
    .sort((a, b) => b.amountMax - a.amountMax || b.count - a.count)
    .slice(0, 6);
}

function normalizeName(value: string): string {
  return value.replace(/^Sen\.\s+/i, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/^sen\.\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}
