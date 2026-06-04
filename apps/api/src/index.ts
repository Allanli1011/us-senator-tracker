import "./loadEnv.js";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { transactionsToCsv } from "./csv.js";
import { normalizePtrImport, ptrImportSchema } from "./importer.js";
import { DisclosureRepository } from "./repository.js";
import { CongressGovClient, CongressGovConfigurationError } from "./sources/congressGovClient.js";
import { SenateEfdClient } from "./sources/senateEfdClient.js";
import { parseSenatePtrHtml } from "./sources/senateEfdParser.js";
import { CollectorStateRepository } from "./services/collectorStateRepository.js";
import { PtrCollector, collectorConfigFromEnv } from "./services/ptrCollector.js";
import { SenatePtrImporter } from "./services/senatePtrImporter.js";
import type { OwnerType, TradeType, TransactionQuery } from "./types.js";

const app = express();
const repo = new DisclosureRepository();
const senateEfdClient = new SenateEfdClient();
const congressGovClient = new CongressGovClient();
const importer = new SenatePtrImporter(repo, senateEfdClient, congressGovClient);
const collector = new PtrCollector(
  repo,
  new CollectorStateRepository(),
  senateEfdClient,
  importer,
  collectorConfigFromEnv()
);
const port = Number(process.env.API_PORT ?? 4010);

const senateEfdAcknowledgementSchema = z.object({
  acknowledgeUseRestrictions: z.literal(true)
});

const senateEfdSearchSchema = senateEfdAcknowledgementSchema.extend({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  senatorState: z.string().length(2).optional(),
  submittedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  submittedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start: z.number().int().min(0).optional(),
  length: z.number().int().min(1).max(100).optional()
});

const senateEfdImportSchema = senateEfdAcknowledgementSchema.extend({
  senatorId: z.string().min(1).optional(),
  senatorName: z.string().min(1).optional()
});

const congressGovEnrichSchema = z.object({
  nameOverride: z.string().min(1).optional()
});

const collectorRunSchema = senateEfdAcknowledgementSchema.extend({
  searchLookbackDays: z.number().int().min(1).max(365).optional(),
  pageLength: z.number().int().min(1).max(100).optional(),
  maxImportsPerRun: z.number().int().min(1).max(100).optional()
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", async (_request, response, next) => {
  try {
    const summary = await repo.getSummary();
    response.json({
      ok: true,
      generatedAt: summary.metadata.generatedAt,
      transactions: summary.totalTransactions
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/summary", async (_request, response, next) => {
  try {
    response.json(await repo.getSummary());
  } catch (error) {
    next(error);
  }
});

app.get("/api/senators", async (_request, response, next) => {
  try {
    response.json(await repo.listSenators());
  } catch (error) {
    next(error);
  }
});

app.post("/api/senators/:senatorId/enrich/congress-gov", async (request, response, next) => {
  try {
    const input = congressGovEnrichSchema.parse(request.body);
    const senator = await repo.getSenatorById(request.params.senatorId);
    if (!senator) {
      response.status(404).json({ error: "Unknown senatorId" });
      return;
    }

    const enrichment = await importer.enrichSenator(senator, input.nameOverride ?? senator.fullName, true);

    if (enrichment.status === "not_configured") {
      response.status(503).json(enrichment);
      return;
    }

    response.status(enrichment.status === "matched" ? 200 : 404).json(enrichment);
  } catch (error) {
    next(error);
  }
});

app.get("/api/collector/status", async (_request, response, next) => {
  try {
    response.json(await collector.getState());
  } catch (error) {
    next(error);
  }
});

app.post("/api/collector/run", async (request, response, next) => {
  try {
    const input = collectorRunSchema.parse(request.body);
    const run = await collector.runNow(input);
    response.status(run.status === "failed" ? 502 : 200).json(run);
  } catch (error) {
    next(error);
  }
});

app.get("/api/securities", async (_request, response, next) => {
  try {
    response.json(await repo.listSecurities());
  } catch (error) {
    next(error);
  }
});

app.get("/api/transactions", async (request, response, next) => {
  try {
    response.json(await repo.listTransactions(parseTransactionQuery(request.query)));
  } catch (error) {
    next(error);
  }
});

app.get("/api/transactions/export.csv", async (request, response, next) => {
  try {
    const transactions = await repo.listTransactions(parseTransactionQuery(request.query));
    response.header("Content-Type", "text/csv; charset=utf-8");
    response.attachment("senator-transactions.csv");
    response.send(transactionsToCsv(transactions));
  } catch (error) {
    next(error);
  }
});

app.post("/api/import/ptr", async (request, response, next) => {
  try {
    const input = ptrImportSchema.parse(request.body);
    const normalized = normalizePtrImport(input);
    const result = await repo.upsertFilingWithTransactions(normalized.filing, normalized.transactions);
    response.status(201).json({
      filing: normalized.filing,
      inserted: result.inserted,
      skipped: result.skipped
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/source/senate-efd/search", async (request, response, next) => {
  try {
    const input = senateEfdSearchSchema.parse(request.body);
    const result = await senateEfdClient.searchPtrReports(input);
    response.status(result.sourceUnavailable ? 502 : 200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/source/senate-efd/ptr/:uuid/preview", async (request, response, next) => {
  try {
    senateEfdAcknowledgementSchema.parse(request.body);
    const uuid = parseUuidParam(request.params.uuid);
    const fetched = await senateEfdClient.fetchPtrReport(uuid);
    const parsed = parseSenatePtrHtml(fetched.body, fetched.url);

    response.status(fetched.status === 200 ? 200 : 502).json({
      status: fetched.status,
      contentType: fetched.contentType,
      archive: fetched.archive,
      parsed
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/import/senate-efd/ptr/:uuid", async (request, response, next) => {
  try {
    const input = senateEfdImportSchema.parse(request.body);
    const result = await importer.importByUuid({
      uuid: parseUuidParam(request.params.uuid),
      senatorId: input.senatorId,
      senatorName: input.senatorName
    });

    response.status(201).json({
      senator: result.senator,
      filing: result.filing,
      inserted: result.inserted,
      skipped: result.skipped,
      parsedRows: result.parsedRows,
      enrichment: result.enrichment,
      archive: result.archive
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof CongressGovConfigurationError) {
    response.status(503).json({
      error: error.message,
      hint: "Set CONGRESS_GOV_API_KEY. DEMO_KEY works for local experiments; request a Data.gov key for production."
    });
    return;
  }

  if (error instanceof z.ZodError) {
    response.status(400).json({
      error: "Invalid request payload",
      issues: error.issues
    });
    return;
  }

  console.error(error);
  response.status(500).json({
    error: "Unexpected server error"
  });
});

app.listen(port, () => {
  console.log(`Senator tracker API listening on http://localhost:${port}`);
  collector.startScheduler();
});

function parseTransactionQuery(query: Record<string, unknown>): TransactionQuery {
  return {
    q: stringParam(query.q),
    senatorId: stringParam(query.senatorId),
    ticker: stringParam(query.ticker),
    type: tradeTypeParam(query.type),
    owner: ownerTypeParam(query.owner),
    from: stringParam(query.from),
    to: stringParam(query.to)
  };
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function tradeTypeParam(value: unknown): TradeType | "All" | undefined {
  if (value === "Purchase" || value === "Sale" || value === "Exchange" || value === "All") {
    return value;
  }

  return undefined;
}

function ownerTypeParam(value: unknown): OwnerType | "All" | undefined {
  if (
    value === "Self" ||
    value === "Spouse" ||
    value === "Dependent" ||
    value === "Joint" ||
    value === "Unknown" ||
    value === "All"
  ) {
    return value;
  }

  return undefined;
}

function parseUuidParam(value: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["uuid"],
        message: "Expected a Senate eFD PTR UUID"
      }
    ]);
  }

  return value;
}
