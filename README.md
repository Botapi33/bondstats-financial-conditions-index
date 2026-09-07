# BondStats Financial Conditions Index

Standalone live data + UI repository for the **BondStats Financial Conditions Index (BS-FCI)**.

Recommended GitHub repository name:

`bondstats-financial-conditions-index`

## Architecture

This repository owns the live calculation, the GitHub Action and the standalone UI.

The main `bondstats-site` repository should **not** run the FCI collector. Later, the BondStats SEO page can embed the GitHub Pages UI and/or consume the generated JSON.

Expected GitHub Pages URL:

`https://botapi33.github.io/bondstats-financial-conditions-index/`

Expected raw data URL:

`https://raw.githubusercontent.com/Botapi33/bondstats-financial-conditions-index/main/data/financial-conditions-index.json`

## Live methodology

The BS-FCI is a BondStats analytical composite on a **0–100 scale**:

- 0–25: Very Loose
- 25–42: Loose
- 42–58: Neutral
- 58–75: Tight
- 75–100: Very Tight

Higher = tighter.

Seven factors:

1. Real-rate pressure — 20%
2. Commercial-paper spread — 20%
3. Dollar pressure — 15%
4. Overnight funding spread — 15%
5. Yield-curve inversion — 10%
6. Reserve-liquidity pressure — 10%
7. Long-end yield pressure — 10%

Each factor is normalized with a rolling two-year z-score and winsorized to ±3. The weighted composite is mapped onto the 0–100 scale around a neutral center of 50.

## Data sources

The collector intentionally starts with official Federal Reserve / New York Fed series instead of licensed equity or proprietary credit-index feeds.

Raw series used:

- DGS2
- DGS10
- DFII10
- DCPN3M
- DTB3
- SOFR
- IORB / historical IOER fallback
- DTWEXBGS
- WRESBAL

The index methodology and weights are BondStats' own.

## GitHub Actions

Workflow:

`.github/workflows/update-financial-conditions-index.yml`

It runs every four hours on weekdays and can also be started manually.

The generated file is:

`data/financial-conditions-index.json`

If a source is temporarily unavailable after a valid index already exists, the collector keeps the last valid reading and marks the output stale instead of replacing it with broken data.

## First run

After uploading the repository:

1. Open **Actions**
2. Choose **Update Financial Conditions Index**
3. Click **Run workflow**
4. Confirm the workflow turns green
5. Open `data/financial-conditions-index.json` and confirm `status: "live"` plus a numeric index score

## GitHub Pages

Settings → Pages:

- Source: Deploy from a branch
- Branch: main
- Folder: /(root)

The UI deliberately uses a different visual language from older BondStats dashboards: a conditions continuum, pressure ledger and historical trace rather than repeated metric cards.

## Later BondStats integration

Recommended indexed page:

`https://www.bondstats.org/markets/financial-conditions-index/`

The standalone GitHub Pages version should remain `noindex` so the BondStats page owns the SEO canonical.
