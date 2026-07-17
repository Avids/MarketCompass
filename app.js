let currentDuration = '20d'; // Default active duration ('20d' or '50d')
let fullData = null;
let charts = {};
let currentSortColumn = 'wk';
let currentSortOrder = 'desc';
let currentMaSpreadTicker = 'QQQ';
let maSpreadChart = null;
let modalMaSpreadChart = null;
let currentActiveTicker = 'QQQ';
let currentActiveDescription = 'QQQ';
let currentModalView = 'relative-strength';
let modalHistoryData = null;

const etfGroups = {
    us: [
        {
            id: 'us-indices',
            title: 'Major Indices',
            tickers: ["SPY", "DIA", "QQQ", "IJH", "IJR", "IWB", "IWM", "IWV"]
        },
        {
            id: 'us-styles',
            title: 'Style & Dividend',
            tickers: ["IVW", "IJK", "IJT", "IVE", "IJJ", "IJS", "DVY", "RSP"]
        },
        {
            id: 'us-sectors',
            title: 'Sectors',
            tickers: ["XLY", "XLP", "XLE", "XLF", "XLV", "XLI", "XLB", "XLK", "XLC", "XLU", "XLRE"]
        },
        {
            id: 'us-thematics',
            title: 'Thematics & Industry',
            tickers: ["IYT", "XRT", "XOP", "SMH", "CIBR", "IGV", "XBI", "XAR", "AIQ", "AIS"]
        },
        {
            id: 'us-crypto-currency',
            title: 'Currencies & Crypto',
            tickers: ["FXB", "FXE", "FXY", "GBTC", "ETHE"]
        }
    ],
    global: [
        {
            id: 'global-countries',
            title: 'Country ETFs',
            tickers: ["EWA", "EWZ", "EWC", "ASHR", "EWQ", "EWG", "EWH", "PIN", "EWI", "EWJ", "EWW", "EWP", "EWU"]
        },
        {
            id: 'global-broad',
            title: 'Broad International',
            tickers: ["EFA", "EEM", "IOO", "BKF", "CWI"]
        },
        {
            id: 'global-commodities',
            title: 'Commodities',
            tickers: ["DBC", "DBA", "USO", "UNG", "GLD", "SLV"]
        },
        {
            id: 'global-fixed-income',
            title: 'Fixed Income',
            tickers: ["SHY", "IEF", "TLT", "AGG", "BND", "TIP"]
        }
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    loadData();

    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadData();
    });

    document.getElementById('leaderboard-search').addEventListener('input', (e) => {
        filterAndRenderLeaderboard(e.target.value);
    });

    // Setup toggle buttons for 20d vs 50d charts
    const btn20d = document.getElementById('btn-20d');
    const btn50d = document.getElementById('btn-50d');

    btn20d.addEventListener('click', () => {
        if (currentDuration !== '20d') {
            currentDuration = '20d';
            btn20d.classList.add('active');
            btn50d.classList.remove('active');
            document.getElementById('rs-subtext-span').textContent = '20-Day Relative Strength (Sector Price / SPY Price, Normalized to 100)';
            renderCharts(fullData.relative_strength);
        }
    });

    btn50d.addEventListener('click', () => {
        if (currentDuration !== '50d') {
            currentDuration = '50d';
            btn50d.classList.add('active');
            btn20d.classList.remove('active');
            document.getElementById('rs-subtext-span').textContent = '50-Day Relative Strength (Sector Price / SPY Price, Normalized to 100)';
            renderCharts(fullData.relative_strength);
        }
    });

    // Setup table sorting via event delegation
    document.getElementById('view-leaderboard').addEventListener('click', (e) => {
        const th = e.target.closest('th[data-sort]');
        if (!th) return;
        
        const column = th.getAttribute('data-sort');
        if (currentSortColumn === column) {
            currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortColumn = column;
            currentSortOrder = 'desc';
        }
        
        renderLeaderboard(document.getElementById('leaderboard-search').value);
    });

    // Setup modal event listeners
    setupModalListeners();

    // Tab switching logic
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');

            // Toggle active class on buttons
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Toggle active class on contents
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `view-${tabId}`) {
                    content.classList.add('active');
                }
            });
        });
    });
});

async function loadData() {
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

    try {
        // Append cache busting parameter to force fresh data load on every load/refresh
        const response = await fetch(`data.json?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        fullData = await response.json();
        
        updateLastUpdated(fullData.last_updated);
        renderFearGreed(fullData.fear_greed);
        renderCharts(fullData.relative_strength);
        renderLeaderboard();
        renderMaSpread(fullData.ma_spread);
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        document.getElementById('last-updated-text').textContent = 'Error loading data';
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Refresh';
    }
}

function updateLastUpdated(isoString) {
    if (!isoString) return;
    const date = new Date(isoString);
    const now = new Date();
    const hoursDiff = (now - date) / (1000 * 60 * 60);
    
    const options = { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZoneName: 'short'
    };
    document.getElementById('last-updated-text').textContent = `Last updated ${date.toLocaleDateString('en-US', options)}`;
    
    // Add data freshness warning if older than 24 hours
    const updateIndicator = document.querySelector('.update-indicator');
    if (hoursDiff > 24) {
        updateIndicator.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        updateIndicator.style.background = 'rgba(239, 68, 68, 0.1)';
        document.getElementById('last-updated-text').innerHTML += ' <span style="color: #ef4444; font-weight: 600;">⚠️ Stale Data</span>';
    }
}

// Render CNN-style dynamic Canvas Gauge
function renderFearGreed(fg) {
    if (!fg) return;

    // Display scores
    const ratingEl = document.getElementById('fg-rating');
    const scoreEl = document.getElementById('fg-score');
    
    scoreEl.textContent = fg.score;
    ratingEl.textContent = fg.rating;
    
    // Set text color class matching the rating
    ratingEl.className = 'score-label';
    scoreEl.className = 'score-num';
    
    const colorClass = getSentimentColorClass(fg.score);
    ratingEl.classList.add(colorClass);
    scoreEl.classList.add(colorClass);

    // Update history table
    document.getElementById('fg-prev-close').textContent = fg.previous_close;
    document.getElementById('fg-prev-close').className = 'val-num ' + getSentimentColorClass(fg.previous_close);
    
    document.getElementById('fg-1w-ago').textContent = fg.one_week_ago;
    document.getElementById('fg-1w-ago').className = 'val-num ' + getSentimentColorClass(fg.one_week_ago);
    
    document.getElementById('fg-1m-ago').textContent = fg.one_month_ago;
    document.getElementById('fg-1m-ago').className = 'val-num ' + getSentimentColorClass(fg.one_month_ago);
    
    document.getElementById('fg-1y-ago').textContent = fg.one_year_ago;
    document.getElementById('fg-1y-ago').className = 'val-num ' + getSentimentColorClass(fg.one_year_ago);

    // Draw gauge on canvas
    const canvas = document.getElementById('fear-greed-gauge');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height - 15;
    const radius = 120;
    const strokeWidth = 24;

    // Define segments
    const segments = [
        { label: "EXTREME FEAR", min: 0, max: 25, color: "rgba(220, 38, 38, 0.15)", activeColor: "#dc2626" },
        { label: "FEAR", min: 25, max: 45, color: "rgba(249, 115, 22, 0.15)", activeColor: "#f97316" },
        { label: "NEUTRAL", min: 45, max: 55, color: "rgba(156, 163, 175, 0.15)", activeColor: "#9ca3af" },
        { label: "GREED", min: 55, max: 75, color: "rgba(132, 204, 22, 0.15)", activeColor: "#84cc16" },
        { label: "EXTREME GREED", min: 75, max: 100, color: "rgba(34, 197, 94, 0.15)", activeColor: "#22c55e" }
    ];

    // Background semi-circle segment tracks
    // Gauge starts at math.PI (left) to 2 * math.PI (right)
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;
    const totalSpan = endAngle - startAngle;

    segments.forEach((seg, index) => {
        const segStartAngle = startAngle + (seg.min / 100) * totalSpan;
        const segEndAngle = startAngle + (seg.max / 100) * totalSpan;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, segStartAngle, segEndAngle);
        
        // Highlight active segment
        const isCurrentValInSeg = fg.score >= seg.min && fg.score <= seg.max;
        if (isCurrentValInSeg) {
            ctx.strokeStyle = seg.activeColor;
            ctx.lineWidth = strokeWidth + 2;
            
            // Draw a subtle border outline around the active segment
            ctx.shadowBlur = 15;
            ctx.shadowColor = seg.activeColor;
        } else {
            ctx.strokeStyle = "rgba(255,255,255,0.06)";
            ctx.lineWidth = strokeWidth;
            ctx.shadowBlur = 0;
        }
        
        ctx.lineCap = 'butt';
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow

        // Add tick markings and tick numbers below segments
        const midAngle = segStartAngle + (segEndAngle - segStartAngle) / 2;
    });

    // Draw ticks at 0, 25, 50, 75, 100
    const ticks = [0, 25, 50, 75, 100];
    ctx.font = '10px "Plus Jakarta Sans"';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ticks.forEach(tick => {
        const angle = startAngle + (tick / 100) * totalSpan;
        const tickRadius = radius - strokeWidth - 10;
        const x = centerX + Math.cos(angle) * tickRadius;
        const y = centerY + Math.sin(angle) * tickRadius;
        ctx.fillText(tick, x, y);
    });

    // Draw segment label text in arc
    ctx.font = '600 9px "Outfit"';
    ctx.fillStyle = '#9ca3af';
    segments.forEach(seg => {
        const segStartAngle = startAngle + (seg.min / 100) * totalSpan;
        const segEndAngle = startAngle + (seg.max / 100) * totalSpan;
        const midAngle = segStartAngle + (segEndAngle - segStartAngle) / 2;
        
        // Increase text radius to prevent cropping on outer edges
        const textRadius = radius + strokeWidth - 2;
        const x = centerX + Math.cos(midAngle) * textRadius;
        const y = centerY + Math.sin(midAngle) * textRadius;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(midAngle + Math.PI/2);
        
        const isCurrentValInSeg = fg.score >= seg.min && fg.score <= seg.max;
        ctx.fillStyle = isCurrentValInSeg ? seg.activeColor : '#6b7280';
        ctx.fillText(seg.label, 0, -10); // Offset upwards to clear arc boundary
        ctx.restore();
    });

    // Draw pointer/needle pointing to fg.score
    const targetAngle = startAngle + (fg.score / 100) * totalSpan;
    const needleLen = radius - 15;
    
    // Shadow for needle
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';

    ctx.beginPath();
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(targetAngle) * needleLen, centerY + Math.sin(targetAngle) * needleLen);
    ctx.stroke();
    
    // Draw center spindle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, 2*Math.PI);
    ctx.fillStyle = '#1f2937';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f3f4f6';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, 2*Math.PI);
    ctx.fillStyle = '#f3f4f6';
    ctx.fill();
    
    ctx.shadowBlur = 0; // Reset
}

function getSentimentColorClass(score) {
    if (score < 25) return 'color-extreme-fear';
    if (score < 45) return 'color-fear';
    if (score <= 55) return 'color-neutral';
    if (score <= 75) return 'color-greed';
    return 'color-extreme-greed';
}

// Render dynamic relative strength charts (20d vs 50d) using Chart.js
function renderCharts(relStrengthData) {
    if (!relStrengthData) return;

    const container = document.getElementById('charts-grid-container');
    container.innerHTML = ''; // Clear

    const durationLabel = currentDuration === '20d' ? '20 Days' : '50 Days';

    // Render U.S. Related
    const usSection = document.createElement('div');
    usSection.className = 'charts-group-section';
    usSection.innerHTML = `<h2 class="charts-group-header us-color">U.S. Related</h2>`;
    let hasUsTickers = false;

    etfGroups.us.forEach(group => {
        const groupContainer = renderSingleChartGroup(group, relStrengthData, durationLabel);
        if (groupContainer) {
            usSection.appendChild(groupContainer);
            hasUsTickers = true;
        }
    });
    if (hasUsTickers) container.appendChild(usSection);

    // Render Global
    const globalSection = document.createElement('div');
    globalSection.className = 'charts-group-section';
    globalSection.innerHTML = `<h2 class="charts-group-header global-color">Global</h2>`;
    let hasGlobalTickers = false;

    etfGroups.global.forEach(group => {
        const groupContainer = renderSingleChartGroup(group, relStrengthData, durationLabel);
        if (groupContainer) {
            globalSection.appendChild(groupContainer);
            hasGlobalTickers = true;
        }
    });
    if (hasGlobalTickers) container.appendChild(globalSection);
}

function renderSingleChartGroup(group, relStrengthData, durationLabel) {
    const validTickers = group.tickers.filter(ticker => {
        const durationObj = relStrengthData[ticker];
        return durationObj && durationObj[currentDuration] && durationObj[currentDuration].values && durationObj[currentDuration].values.length > 0;
    });

    if (validTickers.length === 0) return null;

    const groupDiv = document.createElement('div');
    groupDiv.className = 'charts-group-subcontainer';
    groupDiv.innerHTML = `<h3 class="charts-group-subheader">${group.title}</h3>`;

    const gridDiv = document.createElement('div');
    gridDiv.className = 'charts-grid';
    groupDiv.appendChild(gridDiv);

    validTickers.forEach(ticker => {
        const durationObj = relStrengthData[ticker];
        const item = durationObj[currentDuration];
        const values = item.values;

        // Get ETF full description
        const desc = fullData.leaderboard.find(l => l.ticker === ticker)?.description || "";
        const titleText = desc ? `${ticker} (${desc})` : ticker;

        // Calculate Simple Moving Average (SMA)
        const smaValues = [];
        const smaPeriod = currentDuration === '50d' ? 10 : 5;
        
        for (let i = 0; i < values.length; i++) {
            if (i < smaPeriod - 1) {
                smaValues.push(values[i]);
            } else {
                let sum = 0;
                for (let j = 0; j < smaPeriod; j++) {
                    sum += values[i - j];
                }
                smaValues.push(Number((sum / smaPeriod).toFixed(2)));
            }
        }

        const currentVal = values[values.length - 1];
        const currentSma = smaValues[smaValues.length - 1];
        const isBullish = currentVal >= currentSma;
        const priceColor = isBullish ? '#10b981' : '#ef4444';
        const pctClass = isBullish ? 'pct-positive' : 'pct-negative';

        const lastVal = item.values[item.values.length - 1];
        const pctChange = (lastVal - 100).toFixed(2);
        const sign = pctChange >= 0 ? '+' : '';

        const card = document.createElement('div');
        card.className = 'chart-item-card';
        card.setAttribute('data-ticker', ticker);
        card.innerHTML = `
            <div class="chart-header">
                <div class="chart-title">
                    <h3>${titleText}</h3>
                    <span>vs SPY (${durationLabel})</span>
                </div>
                <div class="chart-pct ${pctClass}">
                    ${sign}${pctChange}%
                </div>
            </div>
            <div class="chart-container">
                <canvas id="chart-${ticker}"></canvas>
            </div>
        `;
        gridDiv.appendChild(card);

        card.addEventListener('click', (e) => {
            e.stopPropagation();
            openSectorModal(ticker, titleText);
        });

        setTimeout(() => {
            const canvas = document.getElementById(`chart-${ticker}`);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            
            if (charts[ticker]) {
                charts[ticker].destroy();
            }

            charts[ticker] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: item.dates,
                    datasets: [
                        {
                            label: currentDuration === '50d' ? '10-Day SMA' : '5-Day SMA',
                            data: smaValues,
                            borderColor: 'rgba(255, 255, 255, 0.25)',
                            borderWidth: 1.2,
                            borderDash: [3, 3],
                            pointRadius: 0,
                            fill: false,
                            tension: 0.25
                        },
                        {
                            label: 'Rel Strength',
                            data: values,
                            borderColor: priceColor,
                            borderWidth: 1.8,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            pointBackgroundColor: priceColor,
                            fill: {
                                target: 0,
                                above: 'rgba(16, 185, 129, 0.08)',
                                below: 'rgba(239, 68, 68, 0.08)'
                            },
                            tension: 0.25
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: '#1f2937',
                            titleColor: '#9ca3af',
                            bodyColor: '#f3f4f6',
                            borderColor: 'rgba(255,255,255,0.08)',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    const val = context.parsed.y;
                                    const relativeChange = (val - 100).toFixed(2);
                                    const sign = relativeChange >= 0 ? '+' : '';
                                    return `${context.dataset.label}: ${sign}${relativeChange}%`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { display: false },
                        y: { 
                            display: false,
                            suggestedMin: 95,
                            suggestedMax: 105
                        }
                    }
                }
            });
        }, 50);
    });

    return groupDiv;
}

// Render the 50-Day MA Spread (overbought/oversold) breadth-style chart
function renderMaSpread(maSpreadData) {
    if (!maSpreadData || !Object.keys(maSpreadData).length) return;

    // Build ticker toggle buttons once (or if the ticker set changed)
    const selector = document.getElementById('ma-spread-ticker-selector');
    const availableTickers = Object.keys(maSpreadData);
    if (!availableTickers.includes(currentMaSpreadTicker)) {
        currentMaSpreadTicker = availableTickers[0];
    }
    selector.innerHTML = '';
    availableTickers.forEach(ticker => {
        const btn = document.createElement('button');
        btn.className = 'toggle-btn' + (ticker === currentMaSpreadTicker ? ' active' : '');
        btn.textContent = ticker;
        btn.addEventListener('click', () => {
            if (currentMaSpreadTicker !== ticker) {
                currentMaSpreadTicker = ticker;
                selector.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                drawMaSpreadChart(maSpreadData[currentMaSpreadTicker]);
            }
        });
        selector.appendChild(btn);
    });

    drawMaSpreadChart(maSpreadData[currentMaSpreadTicker]);
}

function drawMaSpreadChart(item) {
    if (!item || !item.values || !item.values.length) return;

    const ctx = document.getElementById('ma-spread-chart').getContext('2d');
    if (maSpreadChart) {
        maSpreadChart.destroy();
    }

    // Chart-area-relative background bands: Extreme Overbought / Overbought /
    // Oversold / Extreme Oversold, drawn behind the line using the live y-scale.
    const bandPlugin = {
        id: 'maSpreadBands',
        beforeDraw(chart) {
            const { ctx, chartArea, scales: { y } } = chart;
            if (!chartArea) return;

            const bands = [
                { from: item.std2_upper, to: y.max, color: 'rgba(220, 38, 38, 0.18)' },   // Extreme Overbought
                { from: item.std1_upper, to: item.std2_upper, color: 'rgba(239, 68, 68, 0.10)' }, // Overbought
                { from: item.std1_lower, to: item.std2_lower, color: 'rgba(16, 185, 129, 0.10)' }, // Oversold
                { from: y.min, to: item.std2_lower, color: 'rgba(16, 185, 129, 0.18)' }    // Extreme Oversold
            ];

            ctx.save();
            bands.forEach(band => {
                const yTop = y.getPixelForValue(Math.max(band.from, band.to));
                const yBottom = y.getPixelForValue(Math.min(band.from, band.to));
                ctx.fillStyle = band.color;
                ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBottom - yTop);
            });

            // Draw zero line reference
            const zeroY = y.getPixelForValue(0);
            if (zeroY >= chartArea.top && zeroY <= chartArea.bottom) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(chartArea.left, zeroY);
                ctx.lineTo(chartArea.right, zeroY);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.restore();
        }
    };

    const values = item.values;
    const vMin = Math.min(...values, item.std2_lower);
    const vMax = Math.max(...values, item.std2_upper);
    const pad = (vMax - vMin) * 0.08;

    maSpreadChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: item.dates,
            datasets: [{
                label: '50-DMA Spread %',
                data: values,
                borderColor: '#06b6d4',
                borderWidth: 1.6,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointBackgroundColor: '#06b6d4',
                fill: false,
                tension: 0.15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#1f2937',
                    titleColor: '#9ca3af',
                    bodyColor: '#f3f4f6',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    callbacks: {
                        label: (context) => `Spread: ${context.parsed.y.toFixed(2)}%`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#6b7280', maxTicksLimit: 10 }
                },
                y: {
                    suggestedMin: vMin - pad,
                    suggestedMax: vMax + pad,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#6b7280', callback: (v) => `${v}%` }
                }
            }
        },
        plugins: [bandPlugin]
    });
}

// Filter, Sort, and Render Leaderboard Table
function filterAndRenderLeaderboard(query = '') {
    renderLeaderboard(query);
}

function sortLeaderboardItems(items) {
    return items.sort((a, b) => {
        let valA = a[currentSortColumn];
        let valB = b[currentSortColumn];

        // Format numerical sorting - handle negative values with M/K suffixes
        if (typeof valA === 'string') {
            if (valA.includes('%')) {
                valA = parseFloat(valA.replace('%', ''));
            } else if (valA.includes('M')) {
                const num = parseFloat(valA.replace('M', ''));
                valA = isNaN(num) ? 0 : num * 1_000_000;
            } else if (valA.includes('K')) {
                const num = parseFloat(valA.replace('K', ''));
                valA = isNaN(num) ? 0 : num * 1_000;
            } else if (valA === '-') {
                valA = -999999;
            }
        }
        if (typeof valB === 'string') {
            if (valB.includes('%')) {
                valB = parseFloat(valB.replace('%', ''));
            } else if (valB.includes('M')) {
                const num = parseFloat(valB.replace('M', ''));
                valB = isNaN(num) ? 0 : num * 1_000_000;
            } else if (valB.includes('K')) {
                const num = parseFloat(valB.replace('K', ''));
                valB = isNaN(num) ? 0 : num * 1_000;
            } else if (valB === '-') {
                valB = -999999;
            }
        }

        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        if (currentSortOrder === 'asc') {
            return valA > valB ? 1 : -1;
        } else {
            return valA < valB ? 1 : -1;
        }
    });
}

function renderLeaderboard(query = '') {
    if (!fullData || !fullData.leaderboard) return;

    const usContainer = document.getElementById('leaderboard-us-groups');
    const globalContainer = document.getElementById('leaderboard-global-groups');
    if (!usContainer || !globalContainer) return;

    usContainer.innerHTML = '';
    globalContainer.innerHTML = '';

    // Render US groups
    etfGroups.us.forEach(group => {
        const groupEl = renderSingleLeaderboardGroup(group, query);
        if (groupEl) usContainer.appendChild(groupEl);
    });

    // Render Global groups
    etfGroups.global.forEach(group => {
        const groupEl = renderSingleLeaderboardGroup(group, query);
        if (groupEl) globalContainer.appendChild(groupEl);
    });
}

function renderSingleLeaderboardGroup(group, query) {
    // Get items in group
    let items = fullData.leaderboard.filter(item => group.tickers.includes(item.ticker));

    // Filter matching query
    if (query.trim()) {
        const q = query.toLowerCase();
        items = items.filter(item => {
            const tickerMatch = item.ticker.toLowerCase().includes(q);
            const descMatch = item.description.toLowerCase().includes(q);
            const holdingsMatch = item.holdings && item.holdings.some(h => h.ticker.toLowerCase().includes(q));
            return tickerMatch || descMatch || holdingsMatch;
        });
    }

    if (items.length === 0) return null;

    // Sort items
    items = sortLeaderboardItems(items);

    // Create group wrapper element
    const groupDiv = document.createElement('div');
    groupDiv.className = 'leaderboard-group';

    // Headers sorted helper indicator classes
    const getSortClass = (col) => {
        if (currentSortColumn !== col) return '';
        return currentSortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc';
    };

    groupDiv.innerHTML = `
        <div class="leaderboard-group-header">${group.title}</div>
        <div class="table-responsive">
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th data-sort="ticker" class="${getSortClass('ticker')}">ETF <i class="fa-solid fa-sort"></i></th>
                        <th data-sort="description" class="${getSortClass('description')}">Description <i class="fa-solid fa-sort"></i></th>
                        <th data-sort="price" class="${getSortClass('price')}">Price <i class="fa-solid fa-sort"></i></th>
                        <th data-sort="wk" class="${getSortClass('wk')}">WK% <i class="fa-solid fa-sort"></i></th>
                        <th data-sort="mo" class="${getSortClass('mo')}">MO% <i class="fa-solid fa-sort"></i></th>
                        <th data-sort="yr" class="${getSortClass('yr')}">1Y% <i class="fa-solid fa-sort"></i></th>
                        <th>Top Holdings</th>
                    </tr>
                </thead>
                <tbody>
                </tbody>
            </table>
        </div>
    `;

    const tbody = groupDiv.querySelector('tbody');

    items.forEach(item => {
        const tr = document.createElement('tr');
        
        const wkClass = item.wk >= 0 ? 'pct-positive' : 'pct-negative';
        const wkSign = item.wk >= 0 ? '+' : '';
        const moClass = item.mo >= 0 ? 'pct-positive' : 'pct-negative';
        const moSign = item.mo >= 0 ? '+' : '';
        const yrClass = item.yr >= 0 ? 'pct-positive' : 'pct-negative';
        const yrSign = item.yr >= 0 ? '+' : '';

        let holdingsHtml = '<div class="holdings-pills">';
        if (item.holdings) {
            item.holdings.forEach(h => {
                const isMatch = query.trim() && h.ticker.toLowerCase().includes(query.toLowerCase());
                holdingsHtml += `
                    <div class="holding-pill ${isMatch ? 'highlight-holding' : ''}">
                        <span class="holding-dot"></span>
                        <span class="holding-ticker">${h.ticker}</span>
                        <span class="holding-pct">${h.pct}%</span>
                    </div>
                `;
            });
        }
        holdingsHtml += '</div>';

        tr.innerHTML = `
            <td data-label="ETF"><span class="ticker-badge">${item.ticker}</span></td>
            <td data-label="Description"><span class="desc-text">${item.description}</span></td>
            <td data-label="Price"><span class="price-text">$${item.price.toFixed(2)}</span></td>
            <td data-label="WK%"><span class="pct-badge ${wkClass}">${wkSign}${item.wk.toFixed(2)}%</span></td>
            <td data-label="MO%"><span class="pct-badge ${moClass}">${moSign}${item.mo.toFixed(2)}%</span></td>
            <td data-label="1Y%"><span class="pct-badge ${yrClass}">${yrSign}${item.yr.toFixed(2)}%</span></td>
            <td data-label="Holdings">${holdingsHtml}</td>
        `;

        const badge = tr.querySelector('.ticker-badge');
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            const titleText = item.description ? `${item.ticker} (${item.description})` : item.ticker;
            openSectorModal(item.ticker, titleText);
        });

        tbody.appendChild(tr);
    });

    return groupDiv;
}

// Modal functions for sector MA spread chart
async function openSectorModal(ticker, description) {
    const modal = document.getElementById('sector-modal');
    const titleEl = document.getElementById('modal-sector-title');
    currentActiveTicker = ticker;
    currentActiveDescription = description || ticker;
    modalHistoryData = null; // Clear old cache
    
    // Update modal title
    titleEl.textContent = `${currentActiveDescription} - Detail Charts`;
    
    // Show modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    
    // Reset modal selector tabs active class
    currentModalView = 'relative-strength';
    const modalTabButtons = document.querySelectorAll('.modal-tab-btn');
    modalTabButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-view') === 'relative-strength') {
            btn.classList.add('active');
        }
    });
    
    // Render Relative Strength chart immediately (data is in memory)
    drawModalRelativeStrengthChart(null, ticker);
    
    try {
        // Fetch detailed historical data in background
        const response = await fetch(`history/${ticker}.json?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch history for ${ticker}`);
        }
        const data = await response.json();
        modalHistoryData = data; // Cache data
        
        // Unconditionally render the active chart view to upgrade or render switched tab
        renderCurrentModalChart();
    } catch (error) {
        console.error('Error loading sector MA spread:', error);
        titleEl.textContent = `${ticker} - Error Loading Historical Data`;
    }
}

function closeSectorModal() {
    const modal = document.getElementById('sector-modal');
    modal.classList.remove('active');
    document.body.style.overflow = ''; // Restore scrolling
    
    // Destroy modal chart to free memory
    if (modalMaSpreadChart) {
        modalMaSpreadChart.destroy();
        modalMaSpreadChart = null;
    }
}

function drawModalMaSpreadChart(item, ticker) {
    if (!item || !item.values || !item.values.length) return;
    
    const ctx = document.getElementById('modal-ma-spread-chart').getContext('2d');
    
    if (modalMaSpreadChart) {
        modalMaSpreadChart.destroy();
    }
    
    // Same band plugin as main MA spread chart
    const bandPlugin = {
        id: 'maSpreadBands',
        beforeDraw(chart) {
            const { ctx, chartArea, scales: { y } } = chart;
            if (!chartArea) return;
            
            const bands = [
                { from: item.std2_upper, to: y.max, color: 'rgba(220, 38, 38, 0.18)' },
                { from: item.std1_upper, to: item.std2_upper, color: 'rgba(239, 68, 68, 0.10)' },
                { from: item.std1_lower, to: item.std2_lower, color: 'rgba(16, 185, 129, 0.10)' },
                { from: y.min, to: item.std2_lower, color: 'rgba(16, 185, 129, 0.18)' }
            ];
            
            ctx.save();
            bands.forEach(band => {
                const yTop = y.getPixelForValue(Math.max(band.from, band.to));
                const yBottom = y.getPixelForValue(Math.min(band.from, band.to));
                ctx.fillStyle = band.color;
                ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBottom - yTop);
            });
            
            // Draw zero line reference
            const zeroY = y.getPixelForValue(0);
            if (zeroY >= chartArea.top && zeroY <= chartArea.bottom) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(chartArea.left, zeroY);
                ctx.lineTo(chartArea.right, zeroY);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            
            ctx.restore();
        }
    };
    
    const values = item.values;
    const vMin = Math.min(...values, item.std2_lower);
    const vMax = Math.max(...values, item.std2_upper);
    const pad = (vMax - vMin) * 0.08;

    // Detect extreme OB/OS levels for highlighting
    const pointRadii = [];
    const pointBgColors = [];
    const pointBorderColors = [];
    const pointHoverRadii = [];
    
    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        if (val >= item.std2_upper) {
            pointRadii.push(5);
            pointHoverRadii.push(7);
            pointBgColors.push('#ef4444'); // Red
            pointBorderColors.push('#ffffff');
        } else if (val <= item.std2_lower) {
            pointRadii.push(5);
            pointHoverRadii.push(7);
            pointBgColors.push('#10b981'); // Green
            pointBorderColors.push('#ffffff');
        } else {
            pointRadii.push(0);
            pointHoverRadii.push(5);
            pointBgColors.push('transparent');
            pointBorderColors.push('transparent');
        }
    }
    
    modalMaSpreadChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: item.dates,
            datasets: [{
                label: '50-DMA Spread %',
                data: values,
                borderColor: '#06b6d4',
                borderWidth: 2,
                pointRadius: pointRadii,
                pointHoverRadius: pointHoverRadii,
                pointBackgroundColor: pointBgColors,
                pointBorderColor: pointBorderColors,
                pointBorderWidth: 1,
                fill: false,
                tension: 0.15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#1f2937',
                    titleColor: '#9ca3af',
                    bodyColor: '#f3f4f6',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    callbacks: {
                        label: (context) => `Spread: ${context.parsed.y.toFixed(2)}%`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#6b7280', maxTicksLimit: 12 }
                },
                y: {
                    suggestedMin: vMin - pad,
                    suggestedMax: vMax + pad,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#6b7280', callback: (v) => `${v}%` }
                }
            }
        },
        plugins: [bandPlugin]
    });
}

// Setup modal event listeners (merge with existing DOMContentLoaded)
function setupModalListeners() {
    // Close modal when clicking close button
    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSectorModal);
    }
    
    // Close modal when clicking outside content
    const modalOverlay = document.getElementById('sector-modal');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeSectorModal();
            }
        });
    }
    
    // Copy chart to clipboard button (Dark Theme Export)
    const copyBtn = document.getElementById('modal-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            try {
                const canvas = document.getElementById('modal-ma-spread-chart');
                if (!canvas || !modalMaSpreadChart) return;
                
                const chart = modalMaSpreadChart;
                
                // Save original colors for restoration
                const originalXGridColor = chart.options.scales.x.grid ? chart.options.scales.x.grid.color : null;
                const originalYGridColor = chart.options.scales.y.grid ? chart.options.scales.y.grid.color : null;
                const originalXTicksColor = chart.options.scales.x.ticks ? chart.options.scales.x.ticks.color : null;
                const originalYTicksColor = chart.options.scales.y.ticks ? chart.options.scales.y.ticks.color : null;
                const originalLegendColor = chart.options.plugins.legend && chart.options.plugins.legend.labels ? chart.options.plugins.legend.labels.color : null;
                
                // Find zero line if exists
                const zeroLineDataset = chart.data.datasets.find(d => d.label === 'Zero Line');
                const originalZeroLineColor = zeroLineDataset ? zeroLineDataset.borderColor : null;
                
                // Setup export styling (rich dark theme for contrast)
                if (chart.options.scales.x.grid) chart.options.scales.x.grid.color = 'rgba(255, 255, 255, 0.04)';
                if (chart.options.scales.y.grid) chart.options.scales.y.grid.color = 'rgba(255, 255, 255, 0.04)';
                if (chart.options.scales.x.ticks) chart.options.scales.x.ticks.color = '#9ca3af'; // light gray ticks
                if (chart.options.scales.y.ticks) chart.options.scales.y.ticks.color = '#9ca3af';
                if (chart.options.plugins.legend && chart.options.plugins.legend.labels) {
                    chart.options.plugins.legend.labels.color = '#e5e7eb'; // bright white legend
                }
                
                if (zeroLineDataset) {
                    zeroLineDataset.borderColor = 'rgba(255, 255, 255, 0.35)'; // high contrast zero line
                }
                
                // Sync chart draw synchronously
                chart.update('none');
                
                // Setup offscreen canvas
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                
                const headerHeight = 95;
                const footerHeight = 40;
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height + headerHeight + footerHeight;
                
                // Fill with premium dark theme background color (#0a0f1d)
                tempCtx.fillStyle = '#0a0f1d';
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                
                // Draw Header
                // Ticker / Title
                tempCtx.fillStyle = '#ffffff'; // White text
                tempCtx.font = 'bold 16px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                
                let titleText = '';
                let subtitleText = '';
                let legendText = '';
                
                const isRSFullAligned = !!(modalHistoryData && modalHistoryData.relative_strength && modalHistoryData.relative_strength.length > 0);
                
                if (currentModalView === 'relative-strength') {
                    titleText = `${currentActiveDescription} - Relative Strength vs SPY`;
                    const label = isRSFullAligned ? '6 Months' : (currentDuration === '50d' ? '50 Days' : '20 Days');
                    const sma = isRSFullAligned ? '10-day' : (currentDuration === '50d' ? '10-day' : '5-day');
                    subtitleText = `Normalized relative strength compared to SPY over ${label} (plotted with ${sma} SMA)`;
                    legendText = 'Legend: Strength | Weakness | - - SMA';
                } else if (currentModalView === 'ma-spread') {
                    titleText = `${currentActiveDescription} - 50-Day Moving Average Spread`;
                    subtitleText = `Price vs 50-DMA spread, last 6 months — bands at 1 and 2 standard deviations`;
                    legendText = 'Legend: Extreme Overbought (>= +2 SD) | Extreme Oversold (<= -2 SD)';
                } else if (currentModalView === 'price-ma') {
                    titleText = `${currentActiveDescription} - Daily Price & Moving Averages`;
                    subtitleText = `Daily closing price plotted with 20-day and 50-day simple moving averages`;
                    legendText = 'Legend: Extreme Overbought (Spread >= +2 SD) | Extreme Oversold (Spread <= -2 SD)';
                }
                
                tempCtx.fillText(titleText, 20, 28);
                
                // Subtitle
                tempCtx.fillStyle = '#9ca3af'; // gray-400
                tempCtx.font = '500 12px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                tempCtx.fillText(subtitleText, 20, 48);
                
                // Legend
                tempCtx.fillStyle = '#9ca3af'; // gray-400
                tempCtx.font = 'bold 11px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                tempCtx.fillText(legendText, 20, 68);
                
                // Divider line below header
                tempCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                tempCtx.lineWidth = 1;
                tempCtx.beginPath();
                tempCtx.moveTo(20, 82);
                tempCtx.lineTo(tempCanvas.width - 20, 82);
                tempCtx.stroke();
                
                // Copy the main chart canvas onto the temporary dark-themed canvas
                tempCtx.drawImage(canvas, 0, headerHeight);
                
                // Draw Footer
                // Divider line above footer
                tempCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                tempCtx.beginPath();
                tempCtx.moveTo(20, tempCanvas.height - 35);
                tempCtx.lineTo(tempCanvas.width - 20, tempCanvas.height - 35);
                tempCtx.stroke();
                
                // Date/Timestamp
                const todayStr = new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                tempCtx.fillStyle = '#6b7280'; // gray-500
                tempCtx.font = '400 10px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                tempCtx.fillText(`Exported from MarketCompass on: ${todayStr}`, 20, tempCanvas.height - 15);
                
                // Restore original theme settings
                if (chart.options.scales.x.grid) chart.options.scales.x.grid.color = originalXGridColor;
                if (chart.options.scales.y.grid) chart.options.scales.y.grid.color = originalYGridColor;
                if (chart.options.scales.x.ticks) chart.options.scales.x.ticks.color = originalXTicksColor;
                if (chart.options.scales.y.ticks) chart.options.scales.y.ticks.color = originalYTicksColor;
                if (chart.options.plugins.legend && chart.options.plugins.legend.labels && originalLegendColor) {
                    chart.options.plugins.legend.labels.color = originalLegendColor;
                }
                if (zeroLineDataset && originalZeroLineColor) {
                    zeroLineDataset.borderColor = originalZeroLineColor;
                }
                chart.update('none');
                
                // Export image
                tempCanvas.toBlob(async (blob) => {
                    if (!blob) {
                        console.error('Failed to create blob from canvas');
                        return;
                    }
                    
                    await navigator.clipboard.write([
                        new ClipboardItem({
                            'image/png': blob
                        })
                    ]);
                    
                    // Show success feedback
                    const originalContent = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                    copyBtn.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                    
                    setTimeout(() => {
                        copyBtn.innerHTML = originalContent;
                        copyBtn.style.borderColor = 'rgba(6, 182, 212, 0.3)';
                    }, 2000);
                }, 'image/png');
            } catch (err) {
                console.error('Failed to copy chart:', err);
                alert('Failed to copy chart. Please try taking a screenshot instead.');
            }
        });
    }
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('sector-modal');
            if (modal && modal.classList.contains('active')) {
                closeSectorModal();
            }
        }
    });

    // Setup Modal Chart Tab Buttons
    const modalTabButtons = document.querySelectorAll('.modal-tab-btn');
    modalTabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            if (currentModalView === view) return;
            
            currentModalView = view;
            
            // Toggle active classes on tab buttons
            modalTabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Redraw chart based on view
            renderCurrentModalChart();
        });
    });
}

function destroyModalChart() {
    if (modalMaSpreadChart) {
        modalMaSpreadChart.destroy();
        modalMaSpreadChart = null;
    }
}

function renderCurrentModalChart() {
    const legendEl = document.getElementById('modal-chart-legend');
    if (!legendEl) return;

    if (currentModalView === 'relative-strength') {
        legendEl.innerHTML = `
            <div class="modal-legend-item">
                <span class="modal-legend-marker" style="background: #10b981; box-shadow: 0 0 6px #10b981;"></span>
                <span>Strength</span>
            </div>
            <div class="modal-legend-item">
                <span class="modal-legend-marker" style="background: #ef4444; box-shadow: 0 0 6px #ef4444;"></span>
                <span>Weakness</span>
            </div>
            <div class="modal-legend-item">
                <span class="modal-legend-marker" style="background: transparent; border: 1px dashed rgba(255, 255, 255, 0.4); border-radius: 0; width: 10px; height: 0;"></span>
                <span>10-Day SMA</span>
            </div>
        `;
        drawModalRelativeStrengthChart(modalHistoryData, currentActiveTicker);
    } else if (currentModalView === 'ma-spread') {
        legendEl.innerHTML = `
            <div class="modal-legend-item">
                <span class="modal-legend-marker" style="background: #ef4444; box-shadow: 0 0 6px #ef4444;"></span>
                <span>Extreme Overbought (>= +2 SD)</span>
            </div>
            <div class="modal-legend-item">
                <span class="modal-legend-marker" style="background: #10b981; box-shadow: 0 0 6px #10b981;"></span>
                <span>Extreme Oversold (<= -2 SD)</span>
            </div>
        `;
        if (modalHistoryData) {
            drawModalMaSpreadChart(modalHistoryData, currentActiveTicker);
        }
    } else if (currentModalView === 'price-ma') {
        legendEl.innerHTML = `
            <div class="modal-legend-item">
                <span class="modal-legend-marker" style="background: #ef4444; box-shadow: 0 0 6px #ef4444;"></span>
                <span>Extreme Overbought (Spread >= +2 SD)</span>
            </div>
            <div class="modal-legend-item">
                <span class="modal-legend-marker" style="background: #10b981; box-shadow: 0 0 6px #10b981;"></span>
                <span>Extreme Oversold (Spread <= -2 SD)</span>
            </div>
        `;
        if (modalHistoryData) {
            drawModalPriceMaChart(modalHistoryData, currentActiveTicker);
        }
    }
}

function drawModalRelativeStrengthChart(data, ticker) {
    destroyModalChart();
    
    const ctx = document.getElementById('modal-ma-spread-chart').getContext('2d');
    
    let dates = [];
    let values = [];
    
    const isFullAligned = !!(data && data.relative_strength && data.relative_strength.length > 0);
    
    if (isFullAligned) {
        dates = data.dates;
        values = data.relative_strength;
    } else {
        // Fallback to preloaded data
        const relStrengthData = fullData.relative_strength[ticker];
        if (!relStrengthData || !relStrengthData[currentDuration]) return;
        const item = relStrengthData[currentDuration];
        dates = item.dates;
        values = item.values;
    }
    
    // Calculate SMA
    const smaValues = [];
    const smaPeriod = isFullAligned ? 10 : (currentDuration === '50d' ? 10 : 5);
    
    for (let i = 0; i < values.length; i++) {
        if (i < smaPeriod - 1) {
            smaValues.push(values[i]);
        } else {
            let sum = 0;
            for (let j = 0; j < smaPeriod; j++) {
                sum += values[i - j];
            }
            smaValues.push(Number((sum / smaPeriod).toFixed(2)));
        }
    }
    
    const currentVal = values[values.length - 1];
    const currentSma = smaValues[smaValues.length - 1];
    const isBullish = currentVal >= currentSma;
    const priceColor = isBullish ? '#10b981' : '#ef4444';

    // Detect Strength / Weakness crossovers of Relative Strength vs SMA
    const pointRadii = [];
    const pointBgColors = [];
    const pointBorderColors = [];
    const pointHoverRadii = [];
    
    for (let i = 0; i < values.length; i++) {
        if (i > 0 && values[i] !== null && smaValues[i] !== null && values[i-1] !== null && smaValues[i-1] !== null) {
            const prevDiff = values[i-1] - smaValues[i-1];
            const currDiff = values[i] - smaValues[i];
            
            if (prevDiff < 0 && currDiff >= 0) {
                // Strength Crossover
                pointRadii.push(5);
                pointHoverRadii.push(7);
                pointBgColors.push('#10b981'); // Green
                pointBorderColors.push('#ffffff');
            } else if (prevDiff > 0 && currDiff <= 0) {
                // Weakness Crossover
                pointRadii.push(5);
                pointHoverRadii.push(7);
                pointBgColors.push('#ef4444'); // Red
                pointBorderColors.push('#ffffff');
            } else {
                pointRadii.push(0);
                pointHoverRadii.push(5);
                pointBgColors.push('transparent');
                pointBorderColors.push('transparent');
            }
        } else {
            pointRadii.push(0);
            pointHoverRadii.push(5);
            pointBgColors.push('transparent');
            pointBorderColors.push('transparent');
        }
    }
    
    modalMaSpreadChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: isFullAligned ? '10-Day SMA' : (currentDuration === '50d' ? '10-Day SMA' : '5-Day SMA'),
                    data: smaValues,
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    tension: 0.2
                },
                {
                    label: 'Relative Strength',
                    data: values,
                    borderColor: priceColor,
                    borderWidth: 2.2,
                    pointRadius: pointRadii,
                    pointHoverRadius: pointHoverRadii,
                    pointBackgroundColor: pointBgColors,
                    pointBorderColor: pointBorderColors,
                    pointBorderWidth: 1,
                    fill: {
                        target: 0,
                        above: 'rgba(16, 185, 129, 0.08)',
                        below: 'rgba(239, 68, 68, 0.08)'
                    },
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#9ca3af',
                        font: { family: 'Plus Jakarta Sans', size: 11 }
                    }
                },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#9ca3af',
                    bodyColor: '#f3f4f6',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#6b7280', maxTicksLimit: 12 }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#6b7280' }
                }
            }
        }
    });
}

function drawModalPriceMaChart(data, ticker) {
    destroyModalChart();
    
    const ctx = document.getElementById('modal-ma-spread-chart').getContext('2d');
    if (!data.prices) return;
    
    // Detect Extreme OB / OS from spread values (data.values) to draw dots on the Price line
    const pointRadii = [];
    const pointBgColors = [];
    const pointBorderColors = [];
    const pointHoverRadii = [];
    const pointStyles = [];
    
    const prices = data.prices;
    const spreads = data.values;
    
    for (let i = 0; i < prices.length; i++) {
        const spreadVal = spreads[i];
        if (spreadVal >= data.std2_upper) {
            // Extreme Overbought
            pointRadii.push(5);
            pointHoverRadii.push(7);
            pointBgColors.push('#ef4444'); // Red
            pointBorderColors.push('#ffffff');
            pointStyles.push('circle');
        } else if (spreadVal <= data.std2_lower) {
            // Extreme Oversold
            pointRadii.push(5);
            pointHoverRadii.push(7);
            pointBgColors.push('#10b981'); // Green
            pointBorderColors.push('#ffffff');
            pointStyles.push('circle');
        } else {
            pointRadii.push(0);
            pointHoverRadii.push(5);
            pointBgColors.push('transparent');
            pointBorderColors.push('transparent');
            pointStyles.push('circle');
        }
    }
    
    modalMaSpreadChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.dates,
            datasets: [
                {
                    label: 'Price',
                    data: data.prices,
                    borderColor: '#06b6d4', // Cyan
                    borderWidth: 2.2,
                    pointRadius: pointRadii,
                    pointHoverRadius: pointHoverRadii,
                    pointBackgroundColor: pointBgColors,
                    pointBorderColor: pointBorderColors,
                    pointBorderWidth: 1.5,
                    pointStyle: pointStyles,
                    fill: false,
                    tension: 0.15
                },
                {
                    label: '20-Day MA',
                    data: data.ma20,
                    borderColor: '#f59e0b', // Amber/Yellow-orange
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.15
                },
                {
                    label: '50-Day MA',
                    data: data.ma50,
                    borderColor: '#ec4899', // Pink
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.15
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#9ca3af',
                        font: { family: 'Plus Jakarta Sans', size: 11 }
                    }
                },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#9ca3af',
                    bodyColor: '#f3f4f6',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const val = context.parsed.y;
                            if (val === null || val === undefined) return `${context.dataset.label}: N/A`;
                            return `${context.dataset.label}: $${val.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#6b7280', maxTicksLimit: 12 }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#6b7280',
                        callback: (v) => `$${v}`
                    }
                }
            }
        }
    });
}


