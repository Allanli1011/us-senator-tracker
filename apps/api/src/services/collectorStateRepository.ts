import fs from "node:fs/promises";
import path from "node:path";
import { collectorStateFilePath } from "../paths.js";
import type { CollectorRun, CollectorState } from "../types.js";

const maxRecentRuns = 20;
const maxSeenUuids = 5000;

export class CollectorStateRepository {
  constructor(private readonly statePath = collectorStateFilePath) {}

  async read(): Promise<CollectorState> {
    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      return normalizeState(JSON.parse(raw) as Partial<CollectorState>);
    } catch {
      const state = normalizeState({});
      await this.write(state);
      return state;
    }
  }

  async write(state: CollectorState): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, `${JSON.stringify(normalizeState(state), null, 2)}\n`, "utf8");
  }

  async markRunStarted(run: CollectorRun): Promise<CollectorState> {
    const state = await this.read();
    const next = normalizeState({
      ...state,
      isRunning: true,
      lastAttemptAt: run.startedAt,
      updatedAt: new Date().toISOString(),
      recentRuns: [run, ...state.recentRuns]
    });
    await this.write(next);
    return next;
  }

  async markRunFinished(run: CollectorRun, seenReportUuids: string[], nextRunAt?: string): Promise<CollectorState> {
    const state = await this.read();
    const recentRuns = [run, ...state.recentRuns.filter((candidate) => candidate.id !== run.id)].slice(0, maxRecentRuns);
    const consecutiveFailures = run.status === "succeeded" || run.status === "partial"
      ? 0
      : state.consecutiveFailures + 1;
    const next = normalizeState({
      ...state,
      isRunning: false,
      updatedAt: new Date().toISOString(),
      lastSuccessfulRunAt: run.status === "succeeded" || run.status === "partial"
        ? run.finishedAt
        : state.lastSuccessfulRunAt,
      nextRunAt,
      consecutiveFailures,
      seenReportUuids: [...new Set([...seenReportUuids, ...state.seenReportUuids])].slice(0, maxSeenUuids),
      recentRuns
    });
    await this.write(next);
    return next;
  }

  async configure(patch: Partial<Pick<CollectorState, "enabled" | "intervalMinutes" | "searchLookbackDays" | "pageLength" | "maxImportsPerRun" | "nextRunAt">>): Promise<CollectorState> {
    const state = await this.read();
    const next = normalizeState({
      ...state,
      ...patch,
      updatedAt: new Date().toISOString()
    });
    await this.write(next);
    return next;
  }
}

function normalizeState(input: Partial<CollectorState>): CollectorState {
  return {
    enabled: input.enabled ?? false,
    intervalMinutes: input.intervalMinutes ?? null,
    searchLookbackDays: input.searchLookbackDays ?? 45,
    pageLength: input.pageLength ?? 25,
    maxImportsPerRun: input.maxImportsPerRun ?? 10,
    isRunning: input.isRunning ?? false,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    lastAttemptAt: input.lastAttemptAt,
    lastSuccessfulRunAt: input.lastSuccessfulRunAt,
    nextRunAt: input.nextRunAt,
    consecutiveFailures: input.consecutiveFailures ?? 0,
    seenReportUuids: input.seenReportUuids ?? [],
    recentRuns: input.recentRuns ?? []
  };
}
