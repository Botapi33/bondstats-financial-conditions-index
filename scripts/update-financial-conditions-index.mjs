import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../data/financial-conditions-index.json');

const START_DATE = '2018-01-01';
const ROLLING_WINDOW = 504; // ~2 years of business-day observations
const MAX_FORWARD_FILL_DAYS = 10;

const SERIES = {
  DGS2: { name: '2-Year Treasury Yield', source: 'Federal Reserve H.15' },
  DGS10: { name: '10-Year Treasury Yield', source: 'Federal Reserve H.15' },
  DFII10: { name: '10-Year Real Treasury Yield', source: 'Federal Reserve H.15' },
  DCPN3M: { name: '90-Day AA Nonfinancial Commercial Paper Rate', source: 'Federal Reserve H.15' },
  DTB3: { name: '3-Month Treasury Bill Rate', source: 'Federal Reserve H.15' },
  SOFR: { name: 'Secured Overnight Financing Rate', source: 'Federal Reserve Bank of New York' },
  IORB: { name: 'Interest Rate on Reserve Balances', source: 'Federal Reserve Board' },
  IOER: { name: 'Interest Rate on Excess Reserves', source: 'Federal Reserve Board' },
  DTWEXBGS: { name: 'Nominal Broad U.S. Dollar Index', source: 'Federal Reserve H.10' },
  WRESBAL: { name: 'Reserve Balances with Federal Reserve Banks', source: 'Federal Reserve H.4.1' }
};

const FACTORS = [
  { id: 'real_rates', label: 'Real-rate pressure', weight: 0.20, unit: '%', description: 'Higher real yields increase the real cost of capital and tighten duration-sensitive financial conditions.' },
  { id: 'cp_spread', label: 'Commercial-paper spread', weight: 0.20, unit: 'bp', description: 'The AA nonfinancial commercial-paper premium over Treasury bills is a direct short-term credit and funding signal.' },
  { id: 'dollar', label: 'Dollar pressure', weight: 0.15, unit: 'index', description: 'A stronger broad U.S. dollar can tighten global dollar funding and external financial conditions.' },
  { id: 'funding', label: 'Overnight funding spread', weight: 0.15, unit: 'bp', description: 'SOFR relative to the administered reserve rate captures pressure in secured overnight funding.' },
  { id: 'curve', label: 'Yield-curve inversion', weight: 0.10, unit: 'bp', description: 'A more inverted 2s10s curve is treated as a tighter policy and credit-cycle configuration.' },
  { id: 'reserve_liquidity', label: 'Reserve-liquidity pressure', weight: 0.10, unit: '% 13w', description: 'Falling reserve balances increase the liquidity-pressure contribution to the index.' },
  { id: 'long_yield', label: 'Long-end yield pressure', weight: 0.10, unit: '%', description: 'Higher long-term Treasury yields tighten financing conditions for duration-sensitive borrowers and assets.' }
];

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs, m = mean(xs)) {
  if (!xs.length || m == null) return null;
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

function regime(score) {
  if (score < 25) return 'Very Loose';
  if (score < 42) return 'Loose';
  if (score < 58) return 'Neutral';
  if (score < 75) return 'Tight';
  return 'Very Tight';
}

function parseCsv(csv, id) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error(`${id}: empty CSV`);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const date = cells[0]?.trim();
    const raw = cells[1]?.trim();
    if (!date || !raw || raw === '.') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    rows.push({ date, value });
  }

  if (!rows.length) throw new Error(`${id}: no usable observations`);
  return rows;
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(url, {
        headers: { 'user-agent': 'BondStats-Financial-Conditions-Index/1.0' },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

async function fetchSeries(id) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}&cosd=${START_DATE}`;
  const csv = await fetchText(url);
  return parseCsv(csv, id);
}

function mapRows(rows) {
  return new Map(rows.map(r => [r.date, r.value]));
}

function previousValue(rows, date, maxAgeDays = MAX_FORWARD_FILL_DAYS) {
  // rows are ascending
  let lo = 0, hi = rows.length - 1, best = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (rows[mid].date <= date) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return null;
  if (daysBetween(rows[best].date, date) > maxAgeDays) return null;
  return rows[best].value;
}

function previousValueLoose(rows, date, maxAgeDays = 45) {
  let lo = 0, hi = rows.length - 1, best = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (rows[mid].date <= date) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return null;
  if (daysBetween(rows[best].date, date) > maxAgeDays) return null;
  return rows[best].value;
}

function administeredRate(data, date) {
  const iorb = previousValue(data.IORB, date, 10);
  if (iorb != null) return iorb;
  return previousValue(data.IOER, date, 10);
}

function reserveChange13w(data, date) {
  const now = previousValueLoose(data.WRESBAL, date, 14);
  if (now == null) return null;
  const priorDate = new Date(date + 'T00:00:00Z');
  priorDate.setUTCDate(priorDate.getUTCDate() - 91);
  const priorStr = priorDate.toISOString().slice(0, 10);
  const prev = previousValueLoose(data.WRESBAL, priorStr, 21);
  if (prev == null || prev === 0) return null;
  return ((now / prev) - 1) * 100;
}

function rawFactors(data, date) {
  const dgs2 = previousValue(data.DGS2, date);
  const dgs10 = previousValue(data.DGS10, date);
  const real10 = previousValue(data.DFII10, date);
  const cp = previousValue(data.DCPN3M, date);
  const tbill = previousValue(data.DTB3, date);
  const sofr = previousValue(data.SOFR, date);
  const admin = administeredRate(data, date);
  const dollar = previousValue(data.DTWEXBGS, date, 10);
  const reserves13w = reserveChange13w(data, date);

  return {
    real_rates: real10,
    cp_spread: cp != null && tbill != null ? (cp - tbill) * 100 : null,
    dollar,
    funding: sofr != null && admin != null ? (sofr - admin) * 100 : null,
    curve: dgs2 != null && dgs10 != null ? (dgs2 - dgs10) * 100 : null,
    reserve_liquidity: reserves13w == null ? null : -reserves13w,
    long_yield: dgs10
  };
}

function round(x, n = 2) {
  if (x == null || !Number.isFinite(x)) return null;
  const p = 10 ** n;
  return Math.round(x * p) / p;
}

function rollingZ(values, i) {
  const start = Math.max(0, i - ROLLING_WINDOW + 1);
  const window = [];
  for (let j = start; j <= i; j++) {
    if (values[j] != null && Number.isFinite(values[j])) window.push(values[j]);
  }
  if (window.length < 126) return null;
  const m = mean(window);
  const s = std(window, m);
  if (!s || s < 1e-9) return 0;
  return clamp((values[i] - m) / s, -3, 3);
}

async function loadPrevious() {
  try {
    return JSON.parse(await fs.readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const previous = await loadPrevious();
  const data = {};
  const sourceHealth = [];
  let failed = false;

  for (const [id, meta] of Object.entries(SERIES)) {
    try {
      data[id] = await fetchSeries(id);
      const last = data[id][data[id].length - 1];
      sourceHealth.push({
        id,
        name: meta.name,
        source: meta.source,
        status: 'ok',
        latestDate: last.date,
        latestValue: last.value
      });
    } catch (error) {
      failed = true;
      sourceHealth.push({
        id,
        name: meta.name,
        source: meta.source,
        status: 'error',
        error: String(error?.message || error)
      });
    }
  }

  if (failed) {
    if (previous?.index?.score != null) {
      previous.status = 'stale';
      previous.refreshAttemptAt = new Date().toISOString();
      previous.sourceHealth = sourceHealth;
      await fs.writeFile(OUT, JSON.stringify(previous, null, 2) + '\n');
      console.log('One or more source fetches failed; retained last valid index.');
      return;
    }
    throw new Error('Initial build failed because one or more required sources were unavailable.');
  }

  // Use Treasury business dates as the calculation spine.
  const dates = data.DGS10
    .map(r => r.date)
    .filter(d => d >= START_DATE);

  const rawSeries = {};
  for (const factor of FACTORS) rawSeries[factor.id] = [];

  for (const date of dates) {
    const raw = rawFactors(data, date);
    for (const factor of FACTORS) {
      rawSeries[factor.id].push(raw[factor.id]);
    }
  }

  const zSeries = {};
  for (const factor of FACTORS) {
    zSeries[factor.id] = rawSeries[factor.id].map((_, i) => rollingZ(rawSeries[factor.id], i));
  }

  const history = [];
  const dailyComponents = [];

  for (let i = 0; i < dates.length; i++) {
    const zs = {};
    let complete = true;
    for (const factor of FACTORS) {
      const z = zSeries[factor.id][i];
      if (z == null) {
        complete = false;
        break;
      }
      zs[factor.id] = z;
    }
    if (!complete) continue;

    const compositeZ = FACTORS.reduce((sum, f) => sum + zs[f.id] * f.weight, 0);
    const score = clamp(50 + 12.5 * compositeZ, 0, 100);

    history.push({
      date: dates[i],
      score: round(score, 1),
      regime: regime(score)
    });

    dailyComponents.push({
      date: dates[i],
      score,
      zs,
      raws: Object.fromEntries(FACTORS.map(f => [f.id, rawSeries[f.id][i]]))
    });
  }

  if (history.length < 60) throw new Error('Insufficient history after normalization.');

  const current = dailyComponents[dailyComponents.length - 1];
  const currentHistory = history[history.length - 1];

  function priorScore(businessDays) {
    const idx = Math.max(0, history.length - 1 - businessDays);
    return history[idx]?.score ?? null;
  }

  const change1w = currentHistory.score - priorScore(5);
  const change1m = currentHistory.score - priorScore(21);

  const components = FACTORS.map(f => {
    const z = current.zs[f.id];
    const contributionZ = z * f.weight;
    return {
      id: f.id,
      label: f.label,
      weight: f.weight,
      rawValue: round(current.raws[f.id], f.unit === 'index' ? 2 : 2),
      unit: f.unit,
      zScore: round(z, 2),
      contribution: round(contributionZ, 3),
      pressure: contributionZ > 0.025 ? 'tightening' : contributionZ < -0.025 ? 'easing' : 'neutral',
      description: f.description
    };
  }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const driver = components[0];

  const output = {
    version: 1,
    status: 'live',
    generatedAt: new Date().toISOString(),
    asOfDate: currentHistory.date,
    index: {
      score: currentHistory.score,
      regime: currentHistory.regime,
      change1w: round(change1w, 1),
      change1m: round(change1m, 1),
      momentum: change1m > 1 ? 'Tightening' : change1m < -1 ? 'Easing' : 'Stable',
      mainDriver: driver?.label || '—'
    },
    components,
    history: history.slice(-1300),
    sourceHealth,
    methodology: {
      name: 'BondStats Financial Conditions Index',
      shortName: 'BS-FCI',
      scale: '0–100; higher values indicate tighter financial conditions',
      normalization: 'Rolling two-year z-scores, winsorized to ±3 standard deviations',
      mapping: 'Composite z-score mapped to a 0–100 scale centered on 50',
      regimes: [
        { min: 0, max: 25, label: 'Very Loose' },
        { min: 25, max: 42, label: 'Loose' },
        { min: 42, max: 58, label: 'Neutral' },
        { min: 58, max: 75, label: 'Tight' },
        { min: 75, max: 100, label: 'Very Tight' }
      ],
      factors: FACTORS.map(f => ({
        id: f.id,
        label: f.label,
        weight: f.weight,
        description: f.description
      })),
      note: 'The BS-FCI is a BondStats analytical composite, not an official Federal Reserve index. It uses official market and funding series and applies BondStats normalization and weighting.'
    }
  };

  await fs.writeFile(OUT, JSON.stringify(output, null, 2) + '\n');
  console.log(`BS-FCI ${output.index.score} (${output.index.regime}) as of ${output.asOfDate}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
