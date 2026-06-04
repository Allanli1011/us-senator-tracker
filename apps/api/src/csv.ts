import type { EnrichedTransaction } from "./types.js";

const columns = [
  "filing_date",
  "transaction_date",
  "disclosure_lag_days",
  "senator",
  "state",
  "party",
  "owner",
  "transaction_type",
  "ticker",
  "asset_name",
  "sector",
  "amount_min",
  "amount_max",
  "amount_label",
  "confidence_score",
  "source_url"
];

export function transactionsToCsv(transactions: EnrichedTransaction[]): string {
  const rows = transactions.map((transaction) => [
    transaction.filing?.filingDate ?? "",
    transaction.transactionDate,
    transaction.disclosureLagDays ?? "",
    transaction.senator?.fullName ?? "",
    transaction.senator?.state ?? "",
    transaction.senator?.party ?? "",
    transaction.owner,
    transaction.transactionType,
    transaction.ticker,
    transaction.assetName,
    transaction.security?.sector ?? "",
    transaction.amountMin,
    transaction.amountMax,
    transaction.amountLabel,
    transaction.confidenceScore,
    transaction.filing?.sourceUrl ?? ""
  ]);

  return [columns, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}
