import {
  Activity,
  Bell,
  CircleDollarSign,
  Download,
  ExternalLink,
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { csvExportUrl, fetchCollectorStatus, fetchSecurities, fetchSenators, fetchSummary, fetchTransactions } from "./api";
import type { CollectorState, EnrichedTransaction, Security, Senator, Summary, TransactionFilters } from "./types";

const initialFilters: TransactionFilters = {
  q: "",
  senatorId: "",
  ticker: "",
  type: "All",
  owner: "All"
};

const typeColors: Record<string, string> = {
  Purchase: "#18705a",
  Sale: "#b33f2f",
  Exchange: "#a56c12"
};

export function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [transactions, setTransactions] = useState<EnrichedTransaction[]>([]);
  const [senators, setSenators] = useState<Senator[]>([]);
  const [securities, setSecurities] = useState<Security[]>([]);
  const [collectorState, setCollectorState] = useState<CollectorState | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>(initialFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadStaticData();
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [filters]);

  async function loadStaticData() {
    try {
      setError(null);
      setIsLoading(true);
      const [nextSummary, nextSenators, nextSecurities, nextCollectorState] = await Promise.all([
        fetchSummary(),
        fetchSenators(),
        fetchSecurities(),
        fetchCollectorStatus()
      ]);
      setSummary(nextSummary);
      setSenators(nextSenators);
      setSecurities(nextSecurities);
      setCollectorState(nextCollectorState);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadTransactions() {
    try {
      setError(null);
      setTransactions(await fetchTransactions(filters));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load transactions");
    }
  }

  const latestTrade = transactions[0];
  const tickerOptions = useMemo(() => securities.map((security) => security.ticker), [securities]);

  return (
    <div className="shell">
      <aside className="rail" aria-label="Workspace summary">
        <div className="brandLockup">
          <div className="seal">
            <ShieldCheck size={24} strokeWidth={1.8} />
          </div>
          <div>
            <p className="eyebrow">Public Disclosure Desk</p>
            <h1>Senate Trading Watchdesk</h1>
          </div>
        </div>

        <div className="railGroup">
          <p className="railLabel">Filing Feed</p>
          <StatusLine icon={<FileText size={18} />} label="PTR filings" value={summary?.totalFilings ?? 0} />
          <StatusLine icon={<Activity size={18} />} label="Trades indexed" value={summary?.totalTransactions ?? 0} />
          <StatusLine
            icon={<TrendingUp size={18} />}
            label="Latest filing"
            value={summary?.latestFilingDate ?? "None"}
          />
        </div>

        <div className="railGroup">
          <p className="railLabel">Collector</p>
          <StatusLine
            icon={<Activity size={18} />}
            label="Mode"
            value={collectorState?.enabled ? `${collectorState.intervalMinutes ?? "-"}m` : "Manual"}
          />
          <StatusLine
            icon={<FileText size={18} />}
            label="Last run"
            value={collectorState?.recentRuns[0]?.status ?? "None"}
          />
          <StatusLine
            icon={<TrendingUp size={18} />}
            label="Next run"
            value={collectorState?.nextRunAt ? formatShortDateTime(collectorState.nextRunAt) : "None"}
          />
        </div>

        <div className="railGroup syntheticNotice">
          <p className="railLabel">Dataset</p>
          <strong>Synthetic MVP data</strong>
          <span>{summary?.metadata.sourceNote ?? "Waiting for API"}</span>
        </div>

        <div className="railActions">
          <button className="iconButton" type="button" title="Refresh data" onClick={() => void loadStaticData()}>
            <RefreshCw size={18} />
          </button>
          <button className="iconButton" type="button" title="Create alert">
            <Bell size={18} />
          </button>
          <a className="iconButton" title="Export CSV" href={csvExportUrl(filters)}>
            <Download size={18} />
          </a>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspaceHeader">
          <div>
            <p className="eyebrow">Estimated disclosed range</p>
            <div className="rangeTitle">
              {summary ? formatMoney(summary.amountMinTotal) : "$0"} to{" "}
              {summary ? formatMoney(summary.amountMaxTotal) : "$0"}
            </div>
          </div>
          <div className="asOf">
            <span>Updated</span>
            <strong>{summary ? formatDateTime(summary.metadata.generatedAt) : "Loading"}</strong>
          </div>
        </header>

        {error ? <div className="errorBanner">{error}</div> : null}

        <section className="metricGrid" aria-label="Dashboard metrics">
          <MetricCard
            icon={<FileText size={20} />}
            label="PTRs Captured"
            value={summary?.totalFilings ?? 0}
            caption="parsed reports"
          />
          <MetricCard
            icon={<CircleDollarSign size={20} />}
            label="Transactions"
            value={summary?.totalTransactions ?? 0}
            caption="normalized rows"
          />
          <MetricCard
            icon={<Activity size={20} />}
            label="Avg Lag"
            value={summary?.averageDisclosureLagDays ?? 0}
            caption="days to disclosure"
          />
          <MetricCard
            icon={<TrendingUp size={20} />}
            label="Latest Trade"
            value={latestTrade?.ticker ?? "None"}
            caption={latestTrade?.transactionDate ?? "no rows"}
          />
        </section>

        <section className="analysisGrid">
          <div className="panel chartPanel">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Concentration</p>
                <h2>Top Tickers</h2>
              </div>
              <Filter size={18} />
            </div>
            <div className="chartFrame">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary?.topTickers ?? []} margin={{ top: 12, right: 18, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#d7d9cf" vertical={false} />
                  <XAxis dataKey="ticker" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={36} />
                  <Tooltip formatter={(value) => [value, "Rows"]} cursor={{ fill: "#ebede4" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#1d6f5a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel mixPanel">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Direction</p>
                <h2>Trade Mix</h2>
              </div>
              <Activity size={18} />
            </div>
            <div className="donutWrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary?.typeMix ?? []}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={56}
                    outerRadius={86}
                    paddingAngle={3}
                  >
                    {(summary?.typeMix ?? []).map((entry) => (
                      <Cell key={entry.label} fill={typeColors[entry.label] ?? "#55584d"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="legendList">
              {(summary?.typeMix ?? []).map((item) => (
                <span key={item.label}>
                  <i style={{ background: typeColors[item.label] ?? "#55584d" }} />
                  {item.label} {item.value}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="tableSurface">
          <div className="tableToolbar">
            <div className="searchBox">
              <Search size={18} />
              <input
                value={filters.q}
                onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                placeholder="Search senator, ticker, asset, sector"
              />
            </div>

            <select
              value={filters.senatorId}
              aria-label="Filter by senator"
              onChange={(event) => setFilters((current) => ({ ...current, senatorId: event.target.value }))}
            >
              <option value="">All senators</option>
              {senators.map((senator) => (
                <option key={senator.id} value={senator.id}>
                  {senator.fullName}
                </option>
              ))}
            </select>

            <select
              value={filters.ticker}
              aria-label="Filter by ticker"
              onChange={(event) => setFilters((current) => ({ ...current, ticker: event.target.value }))}
            >
              <option value="">All tickers</option>
              {tickerOptions.map((ticker) => (
                <option key={ticker} value={ticker}>
                  {ticker}
                </option>
              ))}
            </select>

            <select
              value={filters.type}
              aria-label="Filter by trade type"
              onChange={(event) =>
                setFilters((current) => ({ ...current, type: event.target.value as TransactionFilters["type"] }))
              }
            >
              <option value="All">All types</option>
              <option value="Purchase">Purchase</option>
              <option value="Sale">Sale</option>
              <option value="Exchange">Exchange</option>
            </select>

            <select
              value={filters.owner}
              aria-label="Filter by owner"
              onChange={(event) =>
                setFilters((current) => ({ ...current, owner: event.target.value as TransactionFilters["owner"] }))
              }
            >
              <option value="All">All owners</option>
              <option value="Self">Self</option>
              <option value="Spouse">Spouse</option>
              <option value="Dependent">Dependent</option>
              <option value="Joint">Joint</option>
            </select>
          </div>

          <div className="tableHeader">
            <div>
              <p className="eyebrow">Transactions</p>
              <h2>{isLoading ? "Loading rows" : `${transactions.length} matching rows`}</h2>
            </div>
            <a className="textButton" href={csvExportUrl(filters)}>
              <Download size={16} />
              CSV
            </a>
          </div>

          <div className="tradeTableScroller">
            <table className="tradeTable">
              <thead>
                <tr>
                  <th>Filing</th>
                  <th>Trade Date</th>
                  <th>Lag</th>
                  <th>Senator</th>
                  <th>Owner</th>
                  <th>Type</th>
                  <th>Ticker</th>
                  <th>Asset</th>
                  <th>Amount</th>
                  <th>30D</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{transaction.filing?.filingDate ?? "Unknown"}</td>
                    <td>{transaction.transactionDate}</td>
                    <td>{transaction.disclosureLagDays ?? "n/a"}d</td>
                    <td>
                      <strong>{transaction.senator?.fullName ?? transaction.senatorId}</strong>
                      <span>{transaction.senator?.state ?? "--"} / {transaction.senator?.party ?? "--"}</span>
                    </td>
                    <td>{transaction.owner}</td>
                    <td>
                      <span className={`tradePill ${transaction.transactionType.toLowerCase()}`}>
                        {transaction.transactionType}
                      </span>
                    </td>
                    <td>
                      <strong>{transaction.ticker}</strong>
                      <span>{transaction.security?.sector ?? "Unmapped"}</span>
                    </td>
                    <td>{transaction.assetName}</td>
                    <td>{transaction.amountLabel}</td>
                    <td className={returnClass(transaction.marketSnapshot?.thirtyDayReturn)}>
                      {formatReturn(transaction.marketSnapshot?.thirtyDayReturn)}
                    </td>
                    <td>
                      {transaction.filing?.sourceUrl ? (
                        <a className="sourceLink" href={transaction.filing.sourceUrl} target="_blank" rel="noreferrer">
                          <ExternalLink size={15} />
                        </a>
                      ) : (
                        "n/a"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  caption
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  caption: string;
}) {
  return (
    <div className="metricCard">
      <div className="metricIcon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </div>
  );
}

function StatusLine({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="statusLine">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit"
  }).format(new Date(value));
}

function formatReturn(value: number | undefined): string {
  if (value === undefined) {
    return "n/a";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function returnClass(value: number | undefined): string {
  if (value === undefined || value === 0) {
    return "neutralReturn";
  }

  return value > 0 ? "positiveReturn" : "negativeReturn";
}
