// api/ticker/[ticker].js — Vercel serverless function
// GET /api/ticker/AAPL  →  returns chart-ready JSON for any stock or ETF
// Results are cached in Upstash Redis for 24 hours (free tier: 10k cmds/day)

import { Redis } from '@upstash/redis';
import { fetchTimeSeries } from '../../lib/twelvedata.js';
import { fetchProfile } from '../../lib/fmp.js';
import { buildTickerData } from '../../lib/utils.js';

const CACHE_TTL = 60 * 60 * 24; // 24 hours in seconds

// Upstash Redis (only initialised if env vars are set)
function getRedis() {
    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    return new Redis({ url, token });
}

export default async function handler(req, res) {
    // Only allow GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const ticker = (req.query.ticker ?? '').toUpperCase().trim();

    if (!ticker || !/^[A-Z0-9.\-]{1,10}$/.test(ticker)) {
        return res.status(400).json({ error: 'Invalid ticker symbol' });
    }

    // ── 1. Check cache ──────────────────────────────────────────────────────────
    const redis   = getRedis();
    const cacheKey = `ticker:${ticker}`;

    if (redis) {
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                console.log(`Cache HIT: ${ticker}`);
                res.setHeader('X-Cache', 'HIT');
                res.setHeader('Cache-Control', `public, s-maxage=${CACHE_TTL}`);
                return res.status(200).json(typeof cached === 'string' ? JSON.parse(cached) : cached);
            }
        } catch (err) {
            console.warn(`Redis GET failed for ${ticker}: ${err.message}`);
        }
    }

    // ── 2. Fetch live data ──────────────────────────────────────────────────────
    console.log(`Cache MISS: fetching ${ticker} from Twelvedata`);

    let tickerSeries, spySeries;
    try {
        const both = await fetchTimeSeries([ticker, 'SPY'], 220);
        tickerSeries = both[ticker];
        spySeries    = both['SPY'];
    } catch (err) {
        // If batched call fails, try fetching individually
        try {
            const [t, s] = await Promise.all([
                fetchTimeSeries([ticker], 220),
                fetchTimeSeries(['SPY'], 220),
            ]);
            tickerSeries = t[ticker];
            spySeries    = s['SPY'];
        } catch (e2) {
            console.error(`Twelvedata fetch failed for ${ticker}:`, e2.message);
            return res.status(502).json({ error: `Could not fetch data for ${ticker}. It may be an invalid or unlisted symbol.` });
        }
    }

    if (!tickerSeries || !spySeries) {
        return res.status(404).json({
            error: `No price data found for "${ticker}". Please check the symbol and try again.`,
        });
    }

    // Align dates between ticker and SPY (inner join)
    const spyByDate = {};
    spySeries.dates.forEach((d, i) => { spyByDate[d] = spySeries.closes[i]; });

    const alignedDates  = [];
    const alignedCloses = [];
    const alignedSpy    = [];

    tickerSeries.dates.forEach((d, i) => {
        if (spyByDate[d] !== undefined) {
            alignedDates.push(d);
            alignedCloses.push(tickerSeries.closes[i]);
            alignedSpy.push(spyByDate[d]);
        }
    });

    if (alignedDates.length < 60) {
        return res.status(404).json({
            error: `Insufficient price history for "${ticker}" (${alignedDates.length} days). Need at least 60 days.`,
        });
    }

    // Build chart data (126-day lookback)
    const chartData = buildTickerData(alignedDates, alignedCloses, alignedSpy, 126);
    chartData.ticker = ticker;

    // ── 3. Enrich with company profile from FMP ─────────────────────────────────
    const profile = await fetchProfile(ticker);
    Object.assign(chartData, {
        name:             profile.name             ?? ticker,
        sector:           profile.sector           ?? '',
        industry:         profile.industry         ?? '',
        marketCap:        profile.marketCap        ?? null,
        trailingPE:       profile.trailingPE       ?? null,
        fiftyTwoWeekHigh: profile.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow:  profile.fiftyTwoWeekLow  ?? null,
        fetched_at:       new Date().toISOString(),
    });

    // ── 4. Store in cache ───────────────────────────────────────────────────────
    if (redis) {
        try {
            await redis.set(cacheKey, JSON.stringify(chartData), { ex: CACHE_TTL });
            console.log(`Cached ${ticker} for ${CACHE_TTL}s`);
        } catch (err) {
            console.warn(`Redis SET failed for ${ticker}: ${err.message}`);
        }
    }

    // ── 5. Return ───────────────────────────────────────────────────────────────
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', `public, s-maxage=${CACHE_TTL}`);
    return res.status(200).json(chartData);
}
