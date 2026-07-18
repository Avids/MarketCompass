// lib/feargreed.js — CNN Fear & Greed Index fetcher (no API key needed)

import { fetchRetry } from './utils.js';

const URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata/';

export async function fetchFearGreed() {
    try {
        const data = await fetchRetry(URL, 3, 1000);
        const fg = data?.fear_and_greed ?? {};
        return {
            score:          Math.round(fg.score          ?? 50),
            rating:         (fg.rating                   ?? 'NEUTRAL').toUpperCase(),
            timestamp:      fg.timestamp                 ?? new Date().toISOString(),
            previous_close: Math.round(fg.previous_close ?? 50),
            one_week_ago:   Math.round(fg.previous_1_week  ?? 50),
            one_month_ago:  Math.round(fg.previous_1_month ?? 50),
            one_year_ago:   Math.round(fg.previous_1_year  ?? 50),
        };
    } catch (err) {
        console.warn(`Fear & Greed fetch failed: ${err.message} — using fallback`);
        return {
            score: 50, rating: 'NEUTRAL',
            timestamp: new Date().toISOString(),
            previous_close: 50, one_week_ago: 50,
            one_month_ago: 50,  one_year_ago: 50,
        };
    }
}
