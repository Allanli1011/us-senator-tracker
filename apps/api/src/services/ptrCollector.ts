import { randomUUID } from "node:crypto";
import type { SenateEfdClient } from "../sources/senateEfdClient.js";
import type { CollectorFailure, CollectorRun, CollectorState } from "../types.js";
import type { DisclosureRepository } from "../repository.js";
import type { SenatePtrImporter } from "./senatePtrImporter.js";
import { CollectorStateRepository } from "./collectorStateRepository.js";

export interface PtrCollectorRunOptions {
  acknowledgeUseRestrictions: true;
  searchLookbackDays?: number;
  pageLength?: number;
  maxImportsPerRun?: number;
}

export interface PtrCollectorConfig {
  enabled: boolean;
  intervalMinutes: number | null;
  searchLookbackDays: number;
  pageLength: number;
  maxImportsPerRun: number;
  acknowledgeUseRestrictions: boolean;
}

export class PtrCollector {
  private activeRun: Promise<CollectorRun> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repo: DisclosureRepository,
    private readonly stateRepo: CollectorStateRepository,
    private readonly senateEfdClient: SenateEfdClient,
    private readonly importer: SenatePtrImporter,
    private readonly config: PtrCollectorConfig
  ) {}

  async getState(): Promise<CollectorState> {
    const state = await this.stateRepo.read();
    return {
      ...state,
      enabled: this.config.enabled,
      intervalMinutes: this.config.intervalMinutes,
      searchLookbackDays: this.config.searchLookbackDays,
      pageLength: this.config.pageLength,
      maxImportsPerRun: this.config.maxImportsPerRun
    };
  }

  async runNow(options: PtrCollectorRunOptions): Promise<CollectorRun> {
    if (this.activeRun) {
      return this.activeRun;
    }

    this.activeRun = this.runInternal(options).finally(() => {
      this.activeRun = null;
    });
    return this.activeRun;
  }

  startScheduler(): void {
    if (!this.config.enabled || !this.config.intervalMinutes || this.config.intervalMinutes <= 0) {
      return;
    }

    if (!this.config.acknowledgeUseRestrictions) {
      console.warn("PTR collector disabled: SENATE_EFD_ACKNOWLEDGE_USE_RESTRICTIONS is not true.");
      return;
    }

    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    void this.stateRepo.configure({
      enabled: true,
      intervalMinutes: this.config.intervalMinutes,
      searchLookbackDays: this.config.searchLookbackDays,
      pageLength: this.config.pageLength,
      maxImportsPerRun: this.config.maxImportsPerRun,
      nextRunAt: new Date(Date.now() + intervalMs).toISOString()
    });

    this.timer = setInterval(() => {
      void this.runNow({
        acknowledgeUseRestrictions: true,
        searchLookbackDays: this.config.searchLookbackDays,
        pageLength: this.config.pageLength,
        maxImportsPerRun: this.config.maxImportsPerRun
      }).catch((error) => {
        console.error("PTR collector scheduled run failed", error);
      });
    }, intervalMs);
  }

  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runInternal(options: PtrCollectorRunOptions): Promise<CollectorRun> {
    const startedAt = new Date().toISOString();
    const searchLookbackDays = options.searchLookbackDays ?? this.config.searchLookbackDays;
    const pageLength = options.pageLength ?? this.config.pageLength;
    const maxImportsPerRun = options.maxImportsPerRun ?? this.config.maxImportsPerRun;
    const dateWindow = buildSearchWindow(searchLookbackDays);
    const run: CollectorRun = {
      id: randomUUID(),
      status: "running",
      startedAt,
      discovered: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      sourceUnavailable: false,
      searchedStartDate: dateWindow.startDate,
      searchedEndDate: dateWindow.endDate,
      reportUuids: [],
      failures: []
    };

    await this.stateRepo.markRunStarted(run);

    try {
      const search = await this.senateEfdClient.searchPtrReports({
        submittedStartDate: dateWindow.startDate,
        submittedEndDate: dateWindow.endDate,
        length: pageLength
      });
      run.archivePath = search.archive.manifestPath;
      run.sourceUnavailable = Boolean(search.sourceUnavailable);

      if (search.sourceUnavailable) {
        run.status = "failed";
        run.failures.push({
          stage: "search",
          message: `Senate eFD search returned HTTP ${search.status} (${search.contentType})`
        });
        return this.finishRun(run, []);
      }

      const discovered = [...new Set(search.reports.map((report) => report.uuid).filter((uuid): uuid is string => Boolean(uuid)))];
      run.discovered = discovered.length;
      run.reportUuids = discovered;

      const known = await this.knownReportUuids();
      const pending = discovered
        .filter((uuid) => !known.has(uuid))
        .slice(0, maxImportsPerRun);
      run.skipped += discovered.length - pending.length;

      const newlySeen: string[] = [];
      for (const uuid of pending) {
        try {
          const result = await this.importer.importByUuid({ uuid });
          newlySeen.push(uuid);
          if (result.inserted > 0) {
            run.imported += 1;
          } else {
            run.skipped += 1;
          }
          await sleep(750);
        } catch (error) {
          run.failed += 1;
          run.failures.push({
            uuid,
            stage: "import",
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }

      run.status = run.failed > 0 ? "partial" : "succeeded";
      return this.finishRun(run, newlySeen);
    } catch (error) {
      run.status = "failed";
      run.failed += 1;
      run.failures.push({
        stage: "unknown",
        message: error instanceof Error ? error.message : String(error)
      });
      return this.finishRun(run, []);
    }
  }

  private async finishRun(run: CollectorRun, newlySeen: string[]): Promise<CollectorRun> {
    const finishedRun = {
      ...run,
      finishedAt: new Date().toISOString()
    };
    await this.stateRepo.markRunFinished(finishedRun, newlySeen, this.nextRunAt());
    return finishedRun;
  }

  private async knownReportUuids(): Promise<Set<string>> {
    const [store, state] = await Promise.all([this.repo.read(), this.stateRepo.read()]);
    const fromFilings = store.filings
      .map((filing) => filing.id.match(/^senate-efd-ptr-([0-9a-f-]{36})$/i)?.[1])
      .filter((uuid): uuid is string => Boolean(uuid));

    return new Set([...fromFilings, ...state.seenReportUuids]);
  }

  private nextRunAt(): string | undefined {
    if (!this.config.enabled || !this.config.intervalMinutes || this.config.intervalMinutes <= 0) {
      return undefined;
    }

    return new Date(Date.now() + this.config.intervalMinutes * 60 * 1000).toISOString();
  }
}

export function collectorConfigFromEnv(): PtrCollectorConfig {
  return {
    enabled: parseBoolean(process.env.TRACKER_AUTO_COLLECT_ENABLED),
    intervalMinutes: parseOptionalPositiveNumber(process.env.TRACKER_POLL_INTERVAL_MINUTES),
    searchLookbackDays: parsePositiveNumber(process.env.TRACKER_SEARCH_LOOKBACK_DAYS, 45),
    pageLength: parsePositiveNumber(process.env.TRACKER_SEARCH_PAGE_LENGTH, 25),
    maxImportsPerRun: parsePositiveNumber(process.env.TRACKER_MAX_IMPORTS_PER_RUN, 10),
    acknowledgeUseRestrictions: parseBoolean(process.env.SENATE_EFD_ACKNOWLEDGE_USE_RESTRICTIONS)
  };
}

function buildSearchWindow(lookbackDays: number): { startDate: string; endDate: string } {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - lookbackDays);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10)
  };
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === "true" || value === "1" || value?.toLowerCase() === "yes";
}

function parseOptionalPositiveNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
