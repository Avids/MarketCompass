let currentDuration = '20d'; // Default active duration ('20d' or '50d')
let fullData = null;
let charts = {};
let currentSortColumn = 'wk';
let currentSortOrder = 'desc';
let currentMaSpreadTicker = 'QQQ';
let maSpreadChart = null;
let modalMaSpreadChart = null;

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

    // Setup table sorting
    const tableHeaders = document.querySelectorAll('.leaderboard-table th[data-sort]');
    tableHeaders.forEach(th => {
        th.addEventListener('click', () => {
            const column = th.getAttribute('data-sort');
            if (currentSortColumn === column) {
                currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortColumn = column;
                currentSortOrder = 'desc'; // Default to desc for new columns
            }

            // Update UI sorting indicator classes
            tableHeaders.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
            th.classList.add(currentSortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc');

            renderLeaderboard();
        });
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

    // Dynamically get all keys/tickers present in the dataset to render charts for all sectors
    const chartTickers = Object.keys(relStrengthData);
    const durationLabel = currentDuration === '20d' ? '20 Days' : '50 Days';
    
    chartTickers.forEach(ticker => {
        const durationObj = relStrengthData[ticker];
        if (!durationObj || !durationObj[currentDuration]) return;
        
        const item = durationObj[currentDuration];
        if (!item.values || !item.values.length) return;

        // Get ETF full description
        const desc = fullData.leaderboard.find(l => l.ticker === ticker)?.description || "";
        const titleText = desc ? `${ticker} (${desc})` : ticker;

        // Calculate Simple Moving Average (SMA) of the relative strength values
        // Dynamic SMA: 5-day for 20d series, 10-day for 50d series
        const values = item.values;
        const smaValues = [];
        const smaPeriod = currentDuration === '50d' ? 10 : 5;
        
        for (let i = 0; i < values.length; i++) {
            if (i < smaPeriod - 1) {
                // Not enough data for SMA, default to value itself
                smaValues.push(values[i]);
            } else {
                let sum = 0;
                for (let j = 0; j < smaPeriod; j++) {
                    sum += values[i - j];
                }
                smaValues.push(Number((sum / smaPeriod).toFixed(2)));
            }
        }

        // Determine if current price is above or below SMA for header color styling
        const currentVal = values[values.length - 1];
        const currentSma = smaValues[smaValues.length - 1];
        const isBullish = currentVal >= currentSma;
        
        // Price color based on SMA cross status: emerald for above SMA, red for below
        const priceColor = isBullish ? '#10b981' : '#ef4444';
        const pctClass = isBullish ? 'pct-positive' : 'pct-negative';

        // Calculate performance from first day of the selected duration series
        const lastVal = item.values[item.values.length - 1];
        const pctChange = (lastVal - 100).toFixed(2);
        const sign = pctChange >= 0 ? '+' : '';

        // Create card HTML with click-to-open modal functionality
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
        container.appendChild(card);

        // Add click event to open modal with sector MA spread chart
        // Stop propagation to prevent triggering parent clicks
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            openSectorModal(ticker, titleText);
        });

        // Render mini sparkline chart
        setTimeout(() => {
            const ctx = document.getElementById(`chart-${ticker}`).getContext('2d');
            
            // Destroy existing chart if it exists
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
                            // Fill cloud between Rel Strength and SMA (dataset index 0)
                            fill: {
                                target: 0,
                                above: 'rgba(16, 185, 129, 0.08)', // Green cloud when price is above SMA
                                below: 'rgba(239, 68, 68, 0.08)'   // Red cloud when price is below SMA
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

function renderLeaderboard(query = '') {
    if (!fullData || !fullData.leaderboard) return;

    const tbody = document.getElementById('leaderboard-tbody');
    tbody.innerHTML = '';

    let items = [...fullData.leaderboard];

    // Filter matching query
    if (query.trim()) {
        const q = query.toLowerCase();
        items = items.filter(item => {
            const tickerMatch = item.ticker.toLowerCase().includes(q);
            const descMatch = item.description.toLowerCase().includes(q);
            const holdingsMatch = item.holdings.some(h => h.ticker.toLowerCase().includes(q));
            return tickerMatch || descMatch || holdingsMatch;
        });
    }

    // Sort items
    items.sort((a, b) => {
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

    // Populate rows
    items.forEach(item => {
        const tr = document.createElement('tr');
        
        // Return badges with classes
        const wkClass = item.wk >= 0 ? 'pct-positive' : 'pct-negative';
        const wkSign = item.wk >= 0 ? '+' : '';
        const moClass = item.mo >= 0 ? 'pct-positive' : 'pct-negative';
        const moSign = item.mo >= 0 ? '+' : '';
        const yrClass = item.yr >= 0 ? 'pct-positive' : 'pct-negative';
        const yrSign = item.yr >= 0 ? '+' : '';

        // Generate holdings badges
        let holdingsHtml = '<div class="holdings-pills">';
        item.holdings.forEach(h => {
            // Check if holding ticker matches search query to highlight
            const isMatch = query.trim() && h.ticker.toLowerCase().includes(query.toLowerCase());
            holdingsHtml += `
                <div class="holding-pill ${isMatch ? 'highlight-holding' : ''}">
                    <span class="holding-dot"></span>
                    <span class="holding-ticker">${h.ticker}</span>
                    <span class="holding-pct">${h.pct}%</span>
                </div>
            `;
        });
        holdingsHtml += '</div>';

        tr.innerHTML = `
            <td data-label="Ticker"><span class="ticker-badge">${item.ticker}</span></td>
            <td data-label="Description"><span class="desc-text">${item.description}</span></td>
            <td data-label="Price"><span class="price-text">$${item.price.toFixed(2)}</span></td>
            <td data-label="DY%"><span class="dy-text">${item.dy}</span></td>
            <td data-label="WK%"><span class="pct-badge ${wkClass}">${wkSign}${item.wk.toFixed(2)}%</span></td>
            <td data-label="MO%"><span class="pct-badge ${moClass}">${moSign}${item.mo.toFixed(2)}%</span></td>
            <td data-label="1Y%"><span class="pct-badge ${yrClass}">${yrSign}${item.yr.toFixed(2)}%</span></td>
            <td data-label="Vol"><span class="vol-text">${item.vol}</span></td>
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
}

// Modal functions for sector MA spread chart
async function openSectorModal(ticker, description) {
    const modal = document.getElementById('sector-modal');
    const titleEl = document.getElementById('modal-sector-title');
    
    // Update modal title
    titleEl.textContent = `${ticker} - 50-Day MA Spread (Loading...)`;
    
    // Show modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    
    try {
        // Fetch detailed historical spread data (per request)
        const response = await fetch(`history/${ticker}.json?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch spread history for ${ticker}`);
        }
        const data = await response.json();
        
        // Restore title
        titleEl.textContent = `${ticker} - 50-Day MA Spread`;
        
        // Render the MA spread chart for this sector
        drawModalMaSpreadChart(data, ticker);
    } catch (error) {
        console.error('Error loading sector MA spread:', error);
        titleEl.textContent = `${ticker} - Error Loading Spread Data`;
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
    
    modalMaSpreadChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: item.dates,
            datasets: [{
                label: '50-DMA Spread %',
                data: values,
                borderColor: '#06b6d4',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
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
    
    // Copy chart to clipboard button
    const copyBtn = document.getElementById('modal-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            try {
                const canvas = document.getElementById('modal-ma-spread-chart');
                if (!canvas) return;
                
                // Convert canvas to blob
                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        console.error('Failed to create blob from canvas');
                        return;
                    }
                    
                    // Write to clipboard
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
}


