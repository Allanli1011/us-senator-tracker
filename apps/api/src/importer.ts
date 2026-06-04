import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { amountLabelToRange, formatUsdRange } from "./amounts.js";
import type { Filing, TradeTransaction } from "./types.js";

const ownerSchema = z.enum(["Self", "Spouse", "Dependent", "Joint", "Unknown"]).default("Unknown");
const transactionTypeSchema = z.enum(["Purchase", "Sale", "Exchange"]);

export const ptrImportSchema = z.object({
  filing: z.object({
    id: z.string().min(1).optional(),
    senatorId: z.string().min(1),
    filingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.string().min(1).default("manual"),
    sourceUrl: z.string().url().default("https://www.senate.gov/"),
    rawDocumentPath: z.string().default(""),
    checksum: z.string().default("manual-import"),
    capturedAt: z.string().datetime().optional()
  }),
  rows: z.array(
    z.object({
      owner: ownerSchema,
      transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      transactionType: transactionTypeSchema,
      assetName: z.string().min(1),
      ticker: z.string().min(1),
      amountLabel: z.string().min(1),
      comment: z.string().optional(),
      confidenceScore: z.number().min(0).max(1).default(0.7)
    })
  )
});

export type PtrImportInput = z.infer<typeof ptrImportSchema>;

export function normalizePtrImport(input: PtrImportInput): {
  filing: Filing;
  transactions: TradeTransaction[];
} {
  const filingId =
    input.filing.id ??
    stableId("filing", [input.filing.senatorId, input.filing.filingDate, input.filing.checksum]);

  const filing: Filing = {
    id: filingId,
    senatorId: input.filing.senatorId,
    reportType: "PTR",
    filingDate: input.filing.filingDate,
    source: input.filing.source,
    sourceUrl: input.filing.sourceUrl,
    rawDocumentPath: input.filing.rawDocumentPath,
    checksum: input.filing.checksum,
    parseStatus: "parsed",
    capturedAt: input.filing.capturedAt ?? new Date().toISOString()
  };

  const transactions = input.rows.map((row, index): TradeTransaction => {
    const [amountMin, amountMax] = amountLabelToRange(row.amountLabel);
    const ticker = row.ticker.trim().toUpperCase();
    const sourceRowHash = stableHash([
      filingId,
      String(index),
      row.owner,
      row.transactionDate,
      row.transactionType,
      row.assetName,
      ticker,
      row.amountLabel
    ]);

    return {
      id: `tx-${sourceRowHash.slice(0, 12)}`,
      filingId,
      senatorId: input.filing.senatorId,
      owner: row.owner,
      transactionDate: row.transactionDate,
      transactionType: row.transactionType,
      assetName: row.assetName.trim(),
      ticker,
      amountMin,
      amountMax,
      amountLabel: formatUsdRange(amountMin, amountMax),
      comment: row.comment,
      confidenceScore: row.confidenceScore,
      sourceRowHash
    };
  });

  return { filing, transactions };
}

function stableId(prefix: string, parts: string[]): string {
  const hash = stableHash(parts).slice(0, 12);
  return `${prefix}-${hash || randomUUID()}`;
}

function stableHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
