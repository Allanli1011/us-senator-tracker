import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { amountLabelToRange, formatUsdRange } from "../amounts.js";
import type { Senator, TradeTransaction } from "../types.js";
import type { ArchivedResponse, NormalizedSenatePtr, ParsedSenatePtr } from "./senateEfdTypes.js";

const ptrViewPattern = /\/search\/view\/ptr\/([0-9a-f-]+)\//i;

export function parseSenatePtrHtml(html: string, sourceUrl: string): ParsedSenatePtr {
  const $ = cheerio.load(html);
  const pageText = normalizeText($("body").text());
  const headingTexts = $("h1,h2,h3,h4")
    .map((_, element) => normalizeText($(element).text()))
    .get();

  const reportHeading = headingTexts.find((text) => /Periodic Transaction Report for/i.test(text)) ?? "";
  const filerHeading =
    headingTexts.find((text) => /^The Honorable /i.test(text) || /^Sen\./i.test(text)) ?? null;
  const reportDate = parseUsDate(reportHeading.match(/for\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1]);
  const filedDate = parseUsDate(pageText.match(/Filed\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1]);
  const uuid = sourceUrl.match(ptrViewPattern)?.[1] ?? stableHash([sourceUrl]).slice(0, 36);
  const filerName = filerHeading ? cleanFilerName(filerHeading) : null;

  const transactions = $("table")
    .first()
    .find("tbody tr")
    .map((rowIndex, row) => {
      const cells = $(row)
        .find("td")
        .map((_, cell) => normalizeText($(cell).text()))
        .get();

      return {
        rowNumber: Number(cells[0]) || rowIndex + 1,
        transactionDate: parseUsDate(cells[1]) ?? "",
        owner: cells[2] || "Unknown",
        ticker: normalizeTicker(cells[3]),
        assetName: cells[4] || "Unknown asset",
        assetType: cells[5] || "Unknown",
        transactionType: normalizeTransactionType(cells[6]),
        amountLabel: cells[7] || "$0",
        comment: cells[8] === "--" ? "" : cells[8] || ""
      };
    })
    .get()
    .filter((row) => row.transactionDate && row.assetName);

  return {
    uuid,
    sourceUrl,
    reportDate,
    filingDate: filedDate ?? reportDate,
    filerDisplayName: filerHeading,
    filerName,
    transactions
  };
}

export function normalizeParsedSenatePtr(input: {
  parsed: ParsedSenatePtr;
  senator: Senator;
  archive: ArchivedResponse;
}): NormalizedSenatePtr {
  const filingDate = input.parsed.filingDate ?? input.archive.capturedAt.slice(0, 10);
  const filing = {
    id: `senate-efd-ptr-${input.parsed.uuid}`,
    senatorId: input.senator.id,
    reportType: "PTR" as const,
    filingDate,
    source: "senate-efd",
    sourceUrl: input.parsed.sourceUrl,
    rawDocumentPath: input.archive.rawPath,
    checksum: input.archive.checksum,
    parseStatus: input.parsed.transactions.length > 0 ? ("parsed" as const) : ("needs_review" as const),
    capturedAt: input.archive.capturedAt
  };

  const transactions = input.parsed.transactions.map((row): TradeTransaction => {
    const [amountMin, amountMax] = amountLabelToRange(row.amountLabel);
    const sourceRowHash = stableHash([
      input.parsed.uuid,
      String(row.rowNumber),
      row.transactionDate,
      row.owner,
      row.ticker,
      row.assetName,
      row.transactionType,
      row.amountLabel
    ]);

    return {
      id: `tx-${sourceRowHash.slice(0, 12)}`,
      filingId: filing.id,
      senatorId: input.senator.id,
      owner: normalizeOwner(row.owner),
      transactionDate: row.transactionDate,
      transactionType: normalizeTransactionType(row.transactionType),
      assetName: row.assetName,
      ticker: row.ticker,
      amountMin,
      amountMax,
      amountLabel: formatUsdRange(amountMin, amountMax),
      comment: row.comment,
      confidenceScore: 0.98,
      sourceRowHash
    };
  });

  return {
    senator: input.senator,
    filing,
    transactions
  };
}

function parseUsDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function cleanFilerName(value: string): string {
  return value
    .replace(/^The Honorable\s+/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTicker(value: string): string {
  const ticker = value.replace(/\s+/g, "").trim().toUpperCase();
  return ticker === "--" ? "" : ticker;
}

function normalizeOwner(value: string): TradeTransaction["owner"] {
  if (value === "Self" || value === "Spouse" || value === "Dependent" || value === "Joint") {
    return value;
  }

  if (/dependent/i.test(value)) {
    return "Dependent";
  }

  return "Unknown";
}

function normalizeTransactionType(value: string): TradeTransaction["transactionType"] {
  if (/sale/i.test(value)) {
    return "Sale";
  }

  if (/exchange/i.test(value)) {
    return "Exchange";
  }

  return "Purchase";
}

function stableHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
