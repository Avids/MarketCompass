// lib/utils.js — shared math helpers for MA spread & relative strength calculations

/**
 * Calculate a simple moving average (SMA) over an array of numbers.
 * Returns null for positions where there aren't enough data points yet.
 */
export function calcSMA(values, period) {
    return values.map((_, i) => {
        if (i < period - 1) return null;
        const slice = values.slice(i - period + 1, i + 1);
        const avg = slice.reduce((a, b) => a + b, 0) / period;
        return parseFloat(avg.toFixed(3));
    });
}

/**
 * Calculate the population standard deviation of a numeric array.
 */
export function calcStd(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

/**
 * Calculate the Relative Strength Index (RSI) over an array of numbers.
 * Uses Wilder's smoothing technique.
 */
export function calcRSI(prices, period = 14) {
    const rsi = Array(prices.length).fill(null);
    if (prices.length <= period) return rsi;

    let gains = 0;
    let losses = 0;

    // First period
    for (let i = 1; i <= period; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) {
            gains += diff;
        } else {
            losses -= diff;
        }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

    // Remaining periods
    for (let i = period + 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
    }

    return rsi.map(val => val !== null ? parseFloat(val.toFixed(2)) : null);
}

/**
 * Build the full chart-ready data object for a single ticker.
 * Mirrors the output of update_data.py's fetch_ma_spread().
 *
 * @param {string[]} dates      - ISO date strings, ASC (oldest → newest)
 * @param {number[]} closes     - Closing prices, ASC
 * @param {number[]} spyCloses  - SPY closing prices for same dates, ASC
 * @param {number}   lookback   - How many trading days to include in output (default 126)
 */
export function buildTickerData(dates, closes, spyCloses, lookback = 126, timeframe = 'daily', volumes = null) {
    // Calculate rolling MAs over the full series first
    const sma8Full = calcSMA(closes, 8);
    const sma21Full = calcSMA(closes, 21);
    const sma20Full = calcSMA(closes, 20);
    const sma50Full = calcSMA(closes, 50);
    const sma80Full = calcSMA(closes, 80);
    const sma13Full = calcSMA(closes, 13);
    const sma65Full = calcSMA(closes, 65);
    const sma10Full = calcSMA(closes, 10);
    const sma30Full = calcSMA(closes, 30);
    const sma150Full = calcSMA(closes, 150);
    const sma200Full = calcSMA(closes, 200);

    const rsiFull = calcRSI(closes, 14);

    // MA Spread: % deviation from SMA (50-period for daily, 10-period for weekly)
    const spreadPeriod = timeframe === 'weekly' ? 10 : 50;
    const smaForSpread = timeframe === 'weekly' ? sma10Full : sma50Full;
    const spreadFull = closes.map((c, i) =>
        smaForSpread[i] !== null ? parseFloat(((c - smaForSpread[i]) / smaForSpread[i] * 100).toFixed(3)) : null
    );

    // Relative strength vs SPY: ratio normalised to 100 at start of lookback window
    const ratioFull = closes.map((c, i) =>
        spyCloses[i] ? c / spyCloses[i] : null
    );

    // Trim to the trailing `lookback` trading days
    const start = Math.max(0, dates.length - lookback);
    const trimDates   = dates.slice(start);
    const trimCloses  = closes.slice(start);
    const trimSma8    = sma8Full.slice(start);
    const trimSma21   = sma21Full.slice(start);
    const trimSma20   = sma20Full.slice(start);
    const trimSma50   = sma50Full.slice(start);
    const trimSma80   = sma80Full.slice(start);
    const trimSma13   = sma13Full.slice(start);
    const trimSma65   = sma65Full.slice(start);
    const trimSma10   = sma10Full.slice(start);
    const trimSma30   = sma30Full.slice(start);
    const trimSma150  = sma150Full.slice(start);
    const trimSma200  = sma200Full.slice(start);
    const trimSpread  = spreadFull.slice(start);
    const trimRatio   = ratioFull.slice(start);
    const trimRsi     = rsiFull.slice(start);
    const trimVols    = volumes ? volumes.slice(start) : [];

    // Normalise relative strength to 100 at start
    const firstRatio = trimRatio.find(r => r !== null);
    const relStrength = trimRatio.map(r =>
        r !== null && firstRatio ? parseFloat((r / firstRatio * 100).toFixed(2)) : null
    );

    // Spread statistics (exclude nulls)
    const validSpread = trimSpread.filter(v => v !== null);
    const mean = parseFloat((validSpread.reduce((a, b) => a + b, 0) / validSpread.length).toFixed(3));
    const std  = parseFloat(calcStd(validSpread).toFixed(3));

    return {
        dates:           trimDates,
        values:          trimSpread,
        mean,
        std1_upper:      parseFloat((mean + std).toFixed(3)),
        std1_lower:      parseFloat((mean - std).toFixed(3)),
        std2_upper:      parseFloat((mean + 2 * std).toFixed(3)),
        std2_lower:      parseFloat((mean - 2 * std).toFixed(3)),
        prices:          trimCloses.map(p => parseFloat(p.toFixed(2))),
        ma8:             trimSma8.map(m => m !== null ? parseFloat(m.toFixed(2)) : null),
        ma21:            trimSma21.map(m => m !== null ? parseFloat(m.toFixed(2)) : null),
        ma20:            trimSma20.map(m => m !== null ? parseFloat(m.toFixed(2)) : null),
        ma50:            trimSma50.map(m => m !== null ? parseFloat(m.toFixed(2)) : null),
        ma80:            trimSma80.map(m => m !== null ? parseFloat(m.toFixed(2)) : null),
        ma13:            trimSma13.map(m => m !== null ? parseFloat(m.toFixed(2)) : null),
        ma65:            trimSma65.map(m => m !== null ? parseFloat(m.toFixed(2)) : null),
        ma10:            trimSma10.map(m => m !== null ? parseFloat(m.toFixed(2)) : null),
        ma30:            trimSma30.map(m => m !== null ? parseFloat(m.toFixed(2)) : null),
        ma150:           trimSma150.map(m => m !== null ? parseFloat(m.toFixed(2)) : null),
        ma200:           trimSma200.map(m => m !== null ? parseFloat(m.toFixed(2)) : null),
        relative_strength: relStrength,
        rsi:             trimRsi,
        volumes:         trimVols
    };
}

/**
 * Compute 20-day and 50-day relative strength series (normalised to 100)
 * for use in the main dashboard sector comparison charts.
 */
export function buildRelStrength(closes, spyCloses, dates) {
    const result = {};
    for (const period of [20, 50]) {
        const start = Math.max(0, dates.length - period);
        const sliceDates  = dates.slice(start);
        const sliceCloser = closes.slice(start);
        const sliceSpy    = spyCloses.slice(start);

        const ratios = sliceCloser.map((c, i) => sliceSpy[i] ? c / sliceSpy[i] : null);
        const first  = ratios.find(r => r !== null);
        if (!first) continue;

        result[`${period}d`] = {
            dates:  sliceDates,
            values: ratios.map(r => r !== null ? parseFloat((r / first * 100).toFixed(2)) : null),
        };
    }
    return result;
}

/**
 * Format a volume number into a human-readable string (e.g. 1.2M, 450K).
 */
export function fmtVolume(vol) {
    if (!vol) return '-';
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000)     return `${(vol / 1_000).toFixed(1)}K`;
    return String(vol);
}

/**
 * Simple fetch with exponential back-off retry.
 */
export async function fetchRetry(url, retries = 3, delayMs = 800) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
            return await res.json();
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        }
    }
}

/**
 * Sleep for `ms` milliseconds (used to stay within API rate limits).
 */
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
