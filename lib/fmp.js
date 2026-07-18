// lib/fmp.js — Financial Modeling Prep API helpers
// Docs: https://financialmodelingprep.com/developer/docs

import { fetchRetry } from './utils.js';

const BASE = 'https://financialmodelingprep.com/api/v3';
const KEY  = () => process.env.FMP_API_KEY;

/**
 * Fetch real-time batch quotes for a list of symbols.
 * FMP supports comma-separated symbols in one call.
 *
 * Returns a map: { SYMBOL: { price, dy, vol, wk, mo, yr } }
 * Note: wk/mo/yr calculated from changesPercentage are approximate;
 * we calculate precise values from historical data in the main script.
 */
export async function fetchBatchQuotes(symbols) {
    const url = `${BASE}/quote/${symbols.join(',')}?apikey=${KEY()}`;
    let raw;
    try {
        raw = await fetchRetry(url);
    } catch (err) {
        console.warn(`  FMP batch quotes failed: ${err.message}`);
        return {};
    }

    if (!Array.isArray(raw)) {
        console.warn('  FMP: unexpected response format for batch quotes');
        return {};
    }

    const result = {};
    for (const q of raw) {
        if (!q.symbol) continue;
        result[q.symbol] = {
            price: q.price ?? 0,
            vol:   q.volume ?? 0,
            dy:    q.dividendYield ?? null,   // as decimal e.g. 0.012 = 1.2%
        };
    }
    return result;
}

/**
 * Fetch company/ETF profile: name, sector, industry, P/E, 52W high/low, market cap.
 * Used for custom ticker enrichment.
 */
export async function fetchProfile(symbol) {
    const url = `${BASE}/profile/${symbol}?apikey=${KEY()}`;
    try {
        const raw = await fetchRetry(url);
        if (!Array.isArray(raw) || !raw[0]) return {};
        const p = raw[0];
        return {
            name:             p.companyName ?? symbol,
            sector:           p.sector      ?? '',
            industry:         p.industry    ?? '',
            marketCap:        p.mktCap      ?? null,
            trailingPE:       p.pe          ?? null,
            fiftyTwoWeekHigh: p['52WeekHigh'] ?? null,
            fiftyTwoWeekLow:  p['52WeekLow']  ?? null,
        };
    } catch (err) {
        console.warn(`  FMP profile failed for ${symbol}: ${err.message}`);
        return {};
    }
}
