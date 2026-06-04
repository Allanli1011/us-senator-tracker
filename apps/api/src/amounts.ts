const knownBuckets = new Map<string, [number, number]>([
  ["$1,001 - $15,000", [1001, 15000]],
  ["$15,001 - $50,000", [15001, 50000]],
  ["$50,001 - $100,000", [50001, 100000]],
  ["$100,001 - $250,000", [100001, 250000]],
  ["$250,001 - $500,000", [250001, 500000]],
  ["$500,001 - $1,000,000", [500001, 1000000]],
  ["$1,000,001 - $5,000,000", [1000001, 5000000]],
  ["Over $5,000,000", [5000001, 5000001]]
]);

export function amountLabelToRange(label: string): [number, number] {
  const normalized = label.replace(/\s+/g, " ").trim();
  const known = knownBuckets.get(normalized);

  if (known) {
    return known;
  }

  const matches = normalized.match(/\$?([\d,]+)/g);
  if (!matches || matches.length === 0) {
    return [0, 0];
  }

  const values = matches.map((item) => Number(item.replace(/[$,]/g, ""))).filter(Number.isFinite);
  if (values.length === 1) {
    return [values[0], values[0]];
  }

  return [Math.min(...values), Math.max(...values)];
}

export function formatUsdRange(min: number, max: number): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

  if (min === max) {
    return formatter.format(min);
  }

  return `${formatter.format(min)} - ${formatter.format(max)}`;
}

export function midpoint(min: number, max: number): number {
  if (min === 0 && max === 0) {
    return 0;
  }

  return (min + max) / 2;
}
