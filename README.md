# US Senator Tracker

MVP for tracking public U.S. senator stock transaction disclosures.

The first slice is intentionally narrow:

- Store raw filing metadata and normalized PTR transaction rows.
- Query transactions by senator, ticker, date range, owner, and trade type.
- Show disclosure lag, estimated amount ranges, and ticker-level movement after disclosure.
- Keep synthetic seed data separate from real filings.

## Run Locally

```powershell
npm install
npm run dev
```

The API runs on `http://localhost:4010`.
The web app runs on `http://localhost:5173`.

For Congress.gov enrichment, set `CONGRESS_GOV_API_KEY` in `.env` or your shell. `DEMO_KEY` is fine for quick local checks, but production use should use a Data.gov API key.

## Data Notes

The seed data in `data/seed/senate-ptr-sample.json` is synthetic. It exists to exercise parsing, filtering, analytics, and UI states without implying real trades by real senators.

Planned production sources:

- Senate public financial disclosure / eFD exports for PTR filings.
- Congress.gov API for senator biographical and term metadata.
- SEC EDGAR ticker/CIK mapping for security normalization.
- Market price provider for adjusted price history.

## API

```text
GET  /health
GET  /api/summary
GET  /api/collector/status
GET  /api/senators
GET  /api/securities
GET  /api/transactions
GET  /api/transactions/export.csv
POST /api/import/ptr
POST /api/collector/run
POST /api/senators/:senatorId/enrich/congress-gov
POST /api/source/senate-efd/search
POST /api/source/senate-efd/ptr/:uuid/preview
POST /api/import/senate-efd/ptr/:uuid
```

`POST /api/import/ptr` accepts normalized PTR rows. The import path is idempotent by row hash so repeated captures do not duplicate transactions.

### Senate eFD Source

The Senate eFD source adapter uses the official public disclosure search site. Calls that fetch from Senate eFD must include:

```json
{
  "acknowledgeUseRestrictions": true
}
```

This mirrors the public site's disclosure-use acknowledgement instead of hiding it in code.

Preview and archive a known PTR by UUID:

```powershell
npm run senate-efd:preview --workspace apps/api -- 382eb074-7a02-42de-ac55-12372a6be649
```

Import a known PTR through the API:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:4010/api/import/senate-efd/ptr/382eb074-7a02-42de-ac55-12372a6be649 `
  -ContentType application/json `
  -Body '{"acknowledgeUseRestrictions":true}'
```

If `CONGRESS_GOV_API_KEY` is configured, real PTR import automatically attempts to match the filer against current Senate members in Congress.gov and updates the senator record with Bioguide ID, state, party, current term, image URL, and official website.

Every Senate eFD response is archived before parsing under `data/raw/senate-efd/YYYY-MM-DD/` with a sibling JSON manifest containing URL, status code, checksum, capture time, content type, and byte length. `data/raw/` is ignored by git.

### Congress.gov Enrichment

Match a name from the command line:

```powershell
$env:CONGRESS_GOV_API_KEY='DEMO_KEY'
npm run congress-gov:match --workspace apps/api -- "Shelley M Capito"
```

Refresh one senator through the API:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:4010/api/senators/<senator-id>/enrich/congress-gov `
  -ContentType application/json `
  -Body '{}'
```

The matcher only accepts current Senate profiles and requires a conservative name score, so House members and historical members are not silently attached to Senate PTR rows.

The search endpoint wraps Senate's DataTables endpoint for PTR reports. If the official site returns a maintenance page or another non-JSON response, the API returns `502` with `sourceUnavailable: true` and still archives the raw response for diagnosis.

## Automatic Tracking

The collector discovers recent Senate PTR filings, skips known UUIDs, imports new PTRs, archives every source response, and records run history in `data/processed/collector-state.json`.

Run one collection pass manually:

```powershell
npm run collector:run --workspace apps/api -- --acknowledge-use-restrictions
```

Or through the API:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:4010/api/collector/run `
  -ContentType application/json `
  -Body '{"acknowledgeUseRestrictions":true}'
```

Enable scheduled local collection by setting these in `.env` and restarting `npm run dev`:

```env
SENATE_EFD_ACKNOWLEDGE_USE_RESTRICTIONS=true
TRACKER_AUTO_COLLECT_ENABLED=true
TRACKER_POLL_INTERVAL_MINUTES=60
TRACKER_SEARCH_LOOKBACK_DAYS=45
TRACKER_SEARCH_PAGE_LENGTH=25
TRACKER_MAX_IMPORTS_PER_RUN=10
```

Check status:

```powershell
Invoke-RestMethod http://localhost:4010/api/collector/status
```

The local scheduler only runs while the API process is running. For always-on use, run this app on a VPS, a home server, or Windows Task Scheduler using the manual collector command.

## GitHub Actions

This repository includes `.github/workflows/collector.yml`, which runs the collector daily at 23:17 UTC (07:17 Beijing time the next day) and can also be triggered manually from the Actions tab.

Before enabling it on GitHub:

1. Push the project to a GitHub repository.
2. Add a repository secret named `CONGRESS_GOV_API_KEY`.
3. Make sure Actions are enabled for the repository.
4. Confirm you are comfortable with the workflow setting `SENATE_EFD_ACKNOWLEDGE_USE_RESTRICTIONS=true`.

The workflow:

- runs `npm test`
- runs the Senate PTR collector
- commits `data/processed/disclosure-store.json` and `data/processed/collector-state.json`
- uploads `data/raw/senate-efd/` as a workflow artifact with 14-day retention

GitHub scheduled workflows are not exact timers. They use UTC cron, can be delayed under load, and may occasionally be dropped. The workflow avoids the top of the hour to reduce that risk.

## Next Milestones

1. Replace the JSON repository with Postgres and migrations.
2. Add market data backfill for imported real tickers.
3. Add alert channels for ticker/senator filters.
4. Add a UI flow for reviewing and importing discovered PTRs.
