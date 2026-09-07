# BS-FCI Methodology

The BondStats Financial Conditions Index is a proprietary analytical composite designed to summarize the current degree of market and funding tightness.

## Interpretation

The index runs from 0 to 100. A reading near 50 is neutral relative to the recent normalization window. Readings above 50 indicate tighter-than-normal conditions; readings below 50 indicate looser-than-normal conditions.

## Components

| Factor | Weight | Tightening signal |
|---|---:|---|
| 10Y real Treasury yield | 20% | Higher |
| 90-day AA nonfinancial CP minus 3M T-bill | 20% | Wider |
| Broad U.S. dollar index | 15% | Stronger |
| SOFR minus administered reserve rate | 15% | Wider |
| 2Y minus 10Y Treasury slope | 10% | More inverted |
| Negative 13-week reserve-balance growth | 10% | Faster reserve decline |
| 10Y nominal Treasury yield | 10% | Higher |

## Normalization

Each transformed factor is standardized against a rolling two-year history. Z-scores are capped at ±3 to reduce the influence of extreme outliers. Weighted factor z-scores are summed into a composite and mapped to a 0–100 scale.

## Important limitation

The BS-FCI is an analytical indicator, not an official central-bank index and not investment advice. Its first version deliberately uses official public market/funding series and does not rely on proprietary equity-index or commercial credit-index feeds.
