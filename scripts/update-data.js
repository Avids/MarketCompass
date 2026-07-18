#!/usr/bin/env node
// scripts/update-data.js
// Runs in GitHub Actions daily to fetch market data and write data.json + history/*.json
// Replaces update_data.py

import { writeFileSync, mkdirSync } from 'fs';
import { fetchAllSeries, fetchTimeSeries } from '../lib/twelvedata.js';
import { fetchBatchQuotes } from '../lib/fmp.js';
import { fetchFearGreed } from '../lib/feargreed.js';
import { buildTickerData, buildRelStrength, fmtVolume } from '../lib/utils.js';

// ─── Ticker Definitions ────────────────────────────────────────────────────────

const SECTORS = {
    XLY:  'Consumer Discretionary',
    XLP:  'Consumer Staples',
    XLE:  'Energy',
    XLF:  'Financials',
    XLV:  'Health Care',
    XLI:  'Industrials',
    XLB:  'Materials',
    XLK:  'Technology',
    XLC:  'Communication Services',
    XLU:  'Utilities',
    XLRE: 'Real Estate',
    IYT:  'Transports',
    XRT:  'Retail',
    XOP:  'Oil & Gas',
    SMH:  'Semiconductors',
    CIBR: 'Cybersecurity',
    IGV:  'Software',
    XBI:  'Biotech',
    XAR:  'Aerospace',
    AIQ:  'AI & Big Data',
    AIS:  'AI Infrastructure',
    DIA:  'Dow 30',
    QQQ:  'Nasdaq 100',
    IJH:  'S&P Midcap 400',
    IJR:  'S&P Smallcap 600',
    IWB:  'Russell 1000',
    IWM:  'Russell 2000',
    IWV:  'Russell 3000',
    IVW:  'S&P 500 Growth',
    IJK:  'Midcap 400 Growth',
    IJT:  'Smallcap 600 Growth',
    IVE:  'S&P 500 Value',
    IJJ:  'Midcap 400 Value',
    IJS:  'Smallcap 600 Value',
    DVY:  'DJ Dividend',
    RSP:  'S&P 500 Equal Weight',
    GBTC: 'Bitcoin Trust',
    ETHE: 'Ethereum Trust',
    EWA:  'Australia',
    EWZ:  'Brazil',
    EWC:  'Canada',
    ASHR: 'China',
    EWQ:  'France',
    EWG:  'Germany',
    EWH:  'Hong Kong',
    EWI:  'Italy',
    EWJ:  'Japan',
    EWW:  'Mexico',
    EWP:  'Spain',
    EWU:  'UK',
    EFA:  'EAFE',
    EEM:  'Emerging Mkts',
    IOO:  'Global 100',
    BKF:  'BRIC',
    CWI:  'All World ex US',
    DBC:  'Commodities',
    DBA:  'Agric. Commod.',
    USO:  'Oil',
    UNG:  'Nat. Gas',
    GLD:  'Gold',
    SLV:  'Silver',
    SHY:  '1-3 Yr Treasuries',
    IEF:  '7-10 Yr Treasuries',
    TLT:  '20+ Yr Treasuries',
    AGG:  'Aggregate Bond',
    BND:  'Total Bond Market',
    TIP:  'T.I.P.S.',
};

// Hardcoded ETF holdings (FMP free tier too limited for 60+ per run)
const FALLBACK_HOLDINGS = {
    XLY:  [{ ticker:'AMZN',pct:22.2},{ ticker:'TSLA',pct:19.6},{ ticker:'HD',pct:5.8},{ ticker:'MCD',pct:4.2},{ ticker:'TJX',pct:3.9}],
    XLP:  [{ ticker:'WMT',pct:10.8},{ ticker:'COST',pct:9.0},{ ticker:'PG',pct:7.4},{ ticker:'KO',pct:6.8},{ ticker:'PM',pct:6.1}],
    XLE:  [{ ticker:'XOM',pct:20.3},{ ticker:'CVX',pct:14.4},{ ticker:'COP',pct:5.9},{ ticker:'SLB',pct:4.5},{ ticker:'WMB',pct:4.5}],
    XLF:  [{ ticker:'BRK-B',pct:12.1},{ ticker:'JPM',pct:11.5},{ ticker:'V',pct:7.5},{ ticker:'MA',pct:5.5},{ ticker:'BAC',pct:4.9}],
    XLV:  [{ ticker:'LLY',pct:16.5},{ ticker:'JNJ',pct:10.6},{ ticker:'ABBV',pct:7.7},{ ticker:'UNH',pct:6.6},{ ticker:'MRK',pct:5.5}],
    XLI:  [{ ticker:'CAT',pct:8.5},{ ticker:'GE',pct:6.8},{ ticker:'GEV',pct:5.5},{ ticker:'RTX',pct:4.4},{ ticker:'BA',pct:3.0}],
    XLB:  [{ ticker:'LIN',pct:21.0},{ ticker:'APD',pct:7.0},{ ticker:'SHW',pct:6.5},{ ticker:'ECL',pct:5.8},{ ticker:'FCX',pct:5.2}],
    XLK:  [{ ticker:'NVDA',pct:12.6},{ ticker:'AAPL',pct:11.1},{ ticker:'MSFT',pct:7.2},{ ticker:'AMD',pct:4.7},{ ticker:'MU',pct:4.7}],
    XLC:  [{ ticker:'META',pct:19.9},{ ticker:'GOOGL',pct:13.1},{ ticker:'GOOG',pct:10.4},{ ticker:'TTWO',pct:5.2},{ ticker:'NFLX',pct:4.8}],
    XLU:  [{ ticker:'NEE',pct:12.9},{ ticker:'SO',pct:7.6},{ ticker:'DUK',pct:6.9},{ ticker:'CEG',pct:5.6},{ ticker:'AEP',pct:5.2}],
    XLRE: [{ ticker:'PLD',pct:11.5},{ ticker:'AMT',pct:9.2},{ ticker:'EQIX',pct:7.8},{ ticker:'CCI',pct:5.1},{ ticker:'PSA',pct:4.8}],
    IYT:  [{ ticker:'UNP',pct:15.8},{ ticker:'UBER',pct:14.4},{ ticker:'CSX',pct:8.7},{ ticker:'UPS',pct:5.7},{ ticker:'UAL',pct:5.5}],
    XRT:  [{ ticker:'GRPN',pct:1.8},{ ticker:'REAL',pct:1.7},{ ticker:'BBWI',pct:1.7},{ ticker:'WRBY',pct:1.6},{ ticker:'UPBD',pct:1.6}],
    XOP:  [{ ticker:'TPL',pct:3.2},{ ticker:'PBF',pct:2.9},{ ticker:'DK',pct:2.8},{ ticker:'EXE',pct:2.8},{ ticker:'CNX',pct:2.8}],
    SMH:  [{ ticker:'NVDA',pct:17.8},{ ticker:'TSM',pct:9.2},{ ticker:'MU',pct:5.8},{ ticker:'AMAT',pct:5.7},{ ticker:'AMD',pct:5.4}],
    CIBR: [{ ticker:'PANW',pct:9.6},{ ticker:'FTNT',pct:8.8},{ ticker:'CRWD',pct:8.3},{ ticker:'CSCO',pct:7.7},{ ticker:'AVGO',pct:6.7}],
    IGV:  [{ ticker:'PANW',pct:10.4},{ ticker:'MSFT',pct:8.1},{ ticker:'PLTR',pct:7.7},{ ticker:'CRWD',pct:7.3},{ ticker:'ORCL',pct:6.3}],
    XBI:  [{ ticker:'APGE',pct:1.5},{ ticker:'MRNA',pct:1.4},{ ticker:'TWST',pct:1.4},{ ticker:'ORKA',pct:1.4},{ ticker:'KYMR',pct:1.4}],
    XAR:  [{ ticker:'VSEC',pct:3.4},{ ticker:'AXON',pct:3.2},{ ticker:'SARO',pct:3.1},{ ticker:'FTAI',pct:3.1},{ ticker:'CRS',pct:3.0}],
    AIQ:  [{ ticker:'000660.KS',pct:8.1},{ ticker:'MU',pct:7.1},{ ticker:'AMD',pct:5.6},{ ticker:'INTC',pct:5.2},{ ticker:'005930.KS',pct:5.1}],
    AIS:  [{ ticker:'000660.KS',pct:8.8},{ ticker:'MU',pct:7.1},{ ticker:'AMD',pct:5.0},{ ticker:'MRVL',pct:4.1},{ ticker:'SIMO',pct:3.7}],
};

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('=== MarketCompass Data Update ===');
    console.log(new Date().toISOString());

    // 1. Fear & Greed
    console.log('\n[1/5] Fetching Fear & Greed...');
    const fearGreed = await fetchFearGreed();
    console.log(`  Score: ${fearGreed.score} (${fearGreed.rating})`);

    // 2. Fetch price history: SPY + all ETFs
    console.log('\n[2/5] Fetching price history from Twelvedata...');
    const allTickers = ['SPY', ...Object.keys(SECTORS)];
    const seriesMap  = await fetchAllSeries(allTickers, 220); // 220 days = buffer for 50d MA

    const spyData = seriesMap['SPY'];
    if (!spyData) {
        console.error('FATAL: Could not fetch SPY data. Aborting.');
        process.exit(1);
    }

    // Align SPY dates with each ticker (inner join on dates)
    function alignWithSpy(tickerData) {
        if (!tickerData) return null;
        // Build SPY date lookup
        const spyByDate = {};
        spyData.dates.forEach((d, i) => { spyByDate[d] = spyData.closes[i]; });
        // Filter ticker to only dates where SPY also has data
        const aligned = { dates: [], closes: [], spyCloses: [] };
        tickerData.dates.forEach((d, i) => {
            if (spyByDate[d] !== undefined) {
                aligned.dates.push(d);
                aligned.closes.push(tickerData.closes[i]);
                aligned.spyCloses.push(spyByDate[d]);
            }
        });
        return aligned.dates.length > 0 ? aligned : null;
    }

    // 3. Build relative_strength (20d / 50d) for sector chart
    console.log('\n[3/5] Computing relative strength...');
    const relativeStrength = {};
    for (const ticker of Object.keys(SECTORS)) {
        const aligned = alignWithSpy(seriesMap[ticker]);
        if (!aligned) { console.warn(`  Skipping ${ticker} (no data)`); continue; }
        relativeStrength[ticker] = buildRelStrength(aligned.closes, aligned.spyCloses, aligned.dates);
    }

    // 4. Build individual history files + MA spread for main chart tickers
    console.log('\n[4/5] Writing history files...');
    mkdirSync('history', { recursive: true });

    const maSpreadMap = {};
    const MA_SPREAD_MAIN = ['QQQ', 'IWM', 'DIA'];

    for (const ticker of Object.keys(SECTORS)) {
        const aligned = alignWithSpy(seriesMap[ticker]);
        if (!aligned) continue;
        const histData = buildTickerData(aligned.dates, aligned.closes, aligned.spyCloses, 126);
        writeFileSync(`history/${ticker}.json`, JSON.stringify(histData, null, 2));
        if (MA_SPREAD_MAIN.includes(ticker)) {
            maSpreadMap[ticker] = histData;
        }
    }
    console.log(`  Written ${Object.keys(SECTORS).length} history files`);

    // 5. Build leaderboard from price history + FMP batch quotes
    console.log('\n[5/5] Building leaderboard...');
    const etfTickers = Object.keys(SECTORS);

    // Fetch quotes from FMP in one batch call (price, volume, dividendYield)
    let quotes = {};
    try {
        // FMP batch in chunks of 50 to stay safe
        for (let i = 0; i < etfTickers.length; i += 50) {
            const chunk = etfTickers.slice(i, i + 50);
            const batch = await fetchBatchQuotes(chunk);
            Object.assign(quotes, batch);
        }
        console.log(`  FMP quotes fetched for ${Object.keys(quotes).length} tickers`);
    } catch (err) {
        console.warn(`  FMP quotes failed, using price history only: ${err.message}`);
    }

    const leaderboard = [];
    for (const [ticker, desc] of Object.entries(SECTORS)) {
        const aligned = alignWithSpy(seriesMap[ticker]);
        const q       = quotes[ticker] ?? {};

        // Calculate performance from historical data (accurate, no extra API call)
        let price = q.price ?? 0;
        let wk = 0, mo = 0, yr = 0;

        if (aligned && aligned.closes.length > 0) {
            const n     = aligned.closes.length;
            const today = aligned.closes[n - 1];
            if (!price) price = today;
            if (n >= 5)   wk = ((today - aligned.closes[n - 5])   / aligned.closes[n - 5]   * 100);
            if (n >= 21)  mo = ((today - aligned.closes[n - 21])  / aligned.closes[n - 21]  * 100);
            if (n >= 200) yr = ((today - aligned.closes[n - 200]) / aligned.closes[n - 200] * 100);
        }

        const dy = q.dy ? `${(q.dy * 100).toFixed(2)}%` : '-';

        leaderboard.push({
            ticker,
            description: desc,
            price:    parseFloat(price.toFixed(2)),
            dy,
            wk:       parseFloat(wk.toFixed(2)),
            mo:       parseFloat(mo.toFixed(2)),
            yr:       parseFloat(yr.toFixed(2)),
            vol:      fmtVolume(q.vol),
            holdings: FALLBACK_HOLDINGS[ticker] ?? [],
        });
    }

    // ─── Write data.json ────────────────────────────────────────────────────────
    const output = {
        fear_greed:        fearGreed,
        relative_strength: relativeStrength,
        leaderboard,
        ma_spread:         maSpreadMap,
        last_updated:      new Date().toISOString(),
    };

    writeFileSync('data.json', JSON.stringify(output, null, 2));
    console.log('\n[DONE] data.json written successfully.');
    console.log(`  Leaderboard: ${leaderboard.length} entries`);
    console.log(`  Relative strength: ${Object.keys(relativeStrength).length} tickers`);
    console.log(`  History files: ${Object.keys(SECTORS).length}`);
}

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
