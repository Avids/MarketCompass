// lib/twelvedata.js — Twelvedata REST API helpers
// Docs: https://twelvedata.com/docs

import { fetchRetry, sleep } from './utils.js';

const BASE = 'https://api.twelvedata.com';
const KEY  = () => process.env.TWELVEDATA_API_KEY;

/**
 * Fetch OHLCV time series for up to 8 symbols in one call.
 * Returns a map of { SYMBOL: { dates: string[], closes: number[] } } in ASC order.
 *
 * @param {string[]} symbols  - e.g. ['SPY', 'QQQ', 'AAPL']
 * @param {number}   days     - number of data points to request
 */
export async function fetchTimeSeries(symbols, days = 200, interval = '1day') {
    const url = `${BASE}/time_series?symbol=${symbols.join(',')}&interval=${interval}&outputsize=${days}&apikey=${KEY()}`;
    const raw = await fetchRetry(url);

    const result = {};

    // Single symbol response is NOT wrapped in a key
    if (symbols.length === 1) {
        const sym = symbols[0];
        result[sym] = parseSeries(raw, sym);
    } else {
        for (const sym of symbols) {
            if (raw[sym]) result[sym] = parseSeries(raw[sym], sym);
        }
    }
    return result;
}

function parseSeries(data, sym) {
    if (!data || data.status === 'error' || !Array.isArray(data.values)) {
        console.warn(`  Twelvedata: no data for ${sym}`, data?.message || '');
        return null;
    }
    // API returns newest-first; reverse to ASC (oldest → newest)
    const values = [...data.values].reverse();
    return {
        dates:   values.map(v => v.datetime),
        closes:  values.map(v => parseFloat(v.close)),
        volumes: values.map(v => parseInt(v.volume || 0, 10)),
    };
}

/**
 * Fetch time series for all tickers in batches of 8.
 * Returns map: { SYMBOL: { dates, closes } }
 *
 * @param {string[]} tickers
 * @param {number}   days
 * @param {number}   batchSize  - default 8 (Twelvedata free limit per call)
 * @param {number}   delayMs    - ms between batches to avoid rate limiting
 */
export async function fetchAllSeries(tickers, days = 200, batchSize = 8, delayMs = 600) {
    const result = {};
    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        console.log(`  Twelvedata batch [${i + 1}–${Math.min(i + batchSize, tickers.length)}/${tickers.length}]: ${batch.join(', ')}`);
        try {
            const data = await fetchTimeSeries(batch, days);
            Object.assign(result, data);
        } catch (err) {
            console.error(`  Error fetching batch: ${err.message}`);
        }
        if (i + batchSize < tickers.length) await sleep(delayMs);
    }
    return result;
}
