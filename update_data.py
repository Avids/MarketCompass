import os
import sys
import json
import time
import urllib.request
import pandas as pd
import yfinance as yf
from datetime import datetime

CACHE_MAX_AGE_HOURS = 24  # Max hours before a cached history file is considered stale

# ─── Helpers ──────────────────────────────────────────────────────────────────

def is_cache_fresh(filepath, max_age_hours=CACHE_MAX_AGE_HOURS):
    """Return True if the file exists and was modified within max_age_hours."""
    if not os.path.exists(filepath):
        return False
    age_seconds = time.time() - os.path.getmtime(filepath)
    return age_seconds < (max_age_hours * 3600)

def load_custom_tickers():
    """Load the list of custom tickers from custom_tickers.json."""
    if not os.path.exists("custom_tickers.json"):
        return {}
    with open("custom_tickers.json", "r") as f:
        return json.load(f)

def save_custom_tickers(tickers_dict):
    """Persist the custom tickers dict to custom_tickers.json."""
    with open("custom_tickers.json", "w") as f:
        json.dump(tickers_dict, f, indent=2)

# ─── Data Fetching ─────────────────────────────────────────────────────────────

def fetch_fear_and_greed():
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.cnn.com/markets/fear-and-greed"
    }
    
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            fear_greed = data.get("fear_and_greed", {})
            return {
                "score": int(fear_greed.get("score", 0)),
                "rating": fear_greed.get("rating", "Neutral").upper(),
                "timestamp": fear_greed.get("timestamp", datetime.now().isoformat()),
                "previous_close": int(fear_greed.get("previous_close", 0)),
                "one_week_ago": int(fear_greed.get("previous_1_week", 0)),
                "one_month_ago": int(fear_greed.get("previous_1_month", 0)),
                "one_year_ago": int(fear_greed.get("previous_1_year", 0))
            }
    except Exception as e:
        print(f"Error fetching Fear & Greed: {e}")
        return {
            "score": 42,
            "rating": "FEAR",
            "timestamp": datetime.now().isoformat(),
            "previous_close": 43,
            "one_week_ago": 45,
            "one_month_ago": 52,
            "one_year_ago": 60
        }

def fetch_ma_spread(tickers=("QQQ", "SPY"), ma_period=50, lookback_days=252, force=False):
    """
    Computes the % spread of price vs its N-day moving average, over the
    trailing `lookback_days`, plus 1/2 std-dev bands of that spread series.
    Mirrors the classic 'Overbought/Oversold vs 50-DMA' breadth chart.
    If `force=False` and a fresh cached file exists, load from cache instead.
    """
    result = {}
    # Need extra history before the window starts so the MA is valid on day 1
    period_days = lookback_days + ma_period + 20

    # Fetch SPY historical prices for relative strength calculation
    spy_close = None
    try:
        spy_hist = yf.Ticker("SPY").history(period="2y")
        if not spy_hist.empty:
            spy_close = spy_hist["Close"]
    except Exception as e:
        print(f"Error fetching SPY close for MA spread relative strength: {e}")

    for ticker in tickers:
        cache_path = f"history/{ticker}.json"
        if not force and is_cache_fresh(cache_path):
            print(f"  [cache] {ticker} — loading from {cache_path}")
            try:
                with open(cache_path, "r") as cf:
                    result[ticker] = json.load(cf)
                continue
            except Exception as e:
                print(f"  [cache miss] Error reading cache for {ticker}: {e}")

        try:
            hist = yf.Ticker(ticker).history(period="2y")
            if hist.empty or len(hist) < ma_period + 5:
                print(f"Not enough history for {ticker} MA spread")
                continue

            close = hist["Close"]
            sma = close.rolling(window=ma_period).mean()
            sma20 = close.rolling(window=20).mean()
            spread = ((close - sma) / sma * 100).dropna()

            # Trim to the requested trailing window (trading days)
            spread = spread.tail(lookback_days)
            
            # Align other metrics with the same dates
            close_trimmed = close.loc[spread.index]
            sma20_trimmed = sma20.loc[spread.index]
            sma50_trimmed = sma.loc[spread.index]

            mean = float(spread.mean())
            std = float(spread.std())

            # Calculate relative strength normalized to start of trailing window
            rel_strength = []
            if spy_close is not None:
                ratio = close / spy_close
                ratio = ratio.dropna()
                common_idx = spread.index.intersection(ratio.index)
                if not common_idx.empty:
                    ratio_trimmed = ratio.loc[common_idx]
                    first_val = ratio_trimmed.iloc[0]
                    rel_strength = ((ratio_trimmed / first_val) * 100).round(2).tolist()

            result[ticker] = {
                "dates": [d.strftime("%Y-%m-%d") for d in spread.index],
                "values": [round(v, 3) for v in spread.tolist()],
                "mean": round(mean, 3),
                "std1_upper": round(mean + std, 3),
                "std1_lower": round(mean - std, 3),
                "std2_upper": round(mean + 2 * std, 3),
                "std2_lower": round(mean - 2 * std, 3),
                "prices": [round(p, 2) for p in close_trimmed.tolist()],
                "ma20": [round(m, 2) if m == m else None for m in sma20_trimmed.tolist()],
                "ma50": [round(m, 2) if m == m else None for m in sma50_trimmed.tolist()],
                "relative_strength": rel_strength
            }
        except Exception as e:
            print(f"Error computing MA spread for {ticker}: {e}")

    return result

def fetch_market_data(force=False):
    sectors = {
        # Sectors & Thematic (from Leaderboard)
        "XLY": "Consumer Discretionary",
        "XLP": "Consumer Staples",
        "XLE": "Energy",
        "XLF": "Financials",
        "XLV": "Health Care",
        "XLI": "Industrials",
        "XLB": "Materials",
        "XLK": "Technology",
        "XLC": "Communication Services",
        "XLU": "Utilities",
        "XLRE": "Real Estate",
        "IYT": "Transports",
        "XRT": "Retail",
        "XOP": "Oil & Gas",
        "SMH": "Semiconductors",
        "CIBR": "Cybersecurity",
        "IGV": "Software",
        "XBI": "Biotech",
        "XAR": "Aerospace",
        "AIQ": "AI & Big Data",
        "AIS": "AI Infrastructure",
        
        # Asset Class Performance List (US Related)
        "DIA": "Dow 30",
        "QQQ": "Nasdaq 100",
        "IJH": "S&P Midcap 400",
        "IJR": "S&P Smallcap 600",
        "IWB": "Russell 1000",
        "IWM": "Russell 2000",
        "IWV": "Russell 3000",
        "IVW": "S&P 500 Growth",
        "IJK": "Midcap 400 Growth",
        "IJT": "Smallcap 600 Growth",
        "IVE": "S&P 500 Value",
        "IJJ": "Midcap 400 Value",
        "IJS": "Smallcap 600 Value",
        "DVY": "DJ Dividend",
        "RSP": "S&P 500 Equal Weight",
        
        # Cryptos & Currencies
        "GBTC": "Bitcoin Trust",
        "ETHE": "Ethereum Trust",
        
        # Global
        "EWA": "Australia",
        "EWZ": "Brazil",
        "EWC": "Canada",
        "ASHR": "China",
        "EWQ": "France",
        "EWG": "Germany",
        "EWH": "Hong Kong",
        "PIN": "India",
        "EWI": "Italy",
        "EWJ": "Japan",
        "EWW": "Mexico",
        "EWP": "Spain",
        "EWU": "UK",
        "EFA": "EAFE",
        "EEM": "Emerging Mkts",
        "IOO": "Global 100",
        "BKF": "BRIC",
        "CWI": "All World ex US",
        
        # Commodities
        "DBC": "Commodities",
        "DBA": "Agric. Commod.",
        "USO": "Oil",
        "UNG": "Nat. Gas",
        "GLD": "Gold",
        "SLV": "Silver",
        
        # Treasuries & Bonds
        "SHY": "1-3 Yr Treasuries",
        "IEF": "7-10 Yr Treasuries",
        "TLT": "20+ Yr Treasuries",
        "AGG": "Aggregate Bond",
        "BND": "Total Bond Market",
        "TIP": "T.I.P.S."
    }

    # Hardcoded top holdings fallback in case yfinance top_holdings is missing or fails
    fallback_holdings = {
        "XLY": [{"ticker": "AMZN", "pct": 22.2}, {"ticker": "TSLA", "pct": 19.6}, {"ticker": "HD", "pct": 5.8}, {"ticker": "MCD", "pct": 4.2}, {"ticker": "TJX", "pct": 3.9}],
        "XLP": [{"ticker": "WMT", "pct": 10.8}, {"ticker": "COST", "pct": 9.0}, {"ticker": "PG", "pct": 7.4}, {"ticker": "KO", "pct": 6.8}, {"ticker": "PM", "pct": 6.1}],
        "XLE": [{"ticker": "XOM", "pct": 20.3}, {"ticker": "CVX", "pct": 14.4}, {"ticker": "COP", "pct": 5.9}, {"ticker": "SLB", "pct": 4.5}, {"ticker": "WMB", "pct": 4.5}],
        "XLF": [{"ticker": "BRK-B", "pct": 12.1}, {"ticker": "JPM", "pct": 11.5}, {"ticker": "V", "pct": 7.5}, {"ticker": "MA", "pct": 5.5}, {"ticker": "BAC", "pct": 4.9}],
        "XLV": [{"ticker": "LLY", "pct": 16.5}, {"ticker": "JNJ", "pct": 10.6}, {"ticker": "ABBV", "pct": 7.7}, {"ticker": "UNH", "pct": 6.6}, {"ticker": "MRK", "pct": 5.5}],
        "XLI": [{"ticker": "CAT", "pct": 8.5}, {"ticker": "GE", "pct": 6.8}, {"ticker": "GEV", "pct": 5.5}, {"ticker": "RTX", "pct": 4.4}, {"ticker": "BA", "pct": 3.0}],
        "XLB": [{"ticker": "LIN", "pct": 21.0}, {"ticker": "APD", "pct": 7.0}, {"ticker": "SHW", "pct": 6.5}, {"ticker": "ECL", "pct": 5.8}, {"ticker": "FCX", "pct": 5.2}],
        "XLK": [{"ticker": "NVDA", "pct": 12.6}, {"ticker": "AAPL", "pct": 11.1}, {"ticker": "MSFT", "pct": 7.2}, {"ticker": "AMD", "pct": 4.7}, {"ticker": "MU", "pct": 4.7}],
        "XLC": [{"ticker": "META", "pct": 19.9}, {"ticker": "GOOGL", "pct": 13.1}, {"ticker": "GOOG", "pct": 10.4}, {"ticker": "TTWO", "pct": 5.2}, {"ticker": "NFLX", "pct": 4.8}],
        "XLU": [{"ticker": "NEE", "pct": 12.9}, {"ticker": "SO", "pct": 7.6}, {"ticker": "DUK", "pct": 6.9}, {"ticker": "CEG", "pct": 5.6}, {"ticker": "AEP", "pct": 5.2}],
        "XLRE": [{"ticker": "PLD", "pct": 11.5}, {"ticker": "AMT", "pct": 9.2}, {"ticker": "EQIX", "pct": 7.8}, {"ticker": "CCI", "pct": 5.1}, {"ticker": "PSA", "pct": 4.8}],
        "IYT": [{"ticker": "UNP", "pct": 15.8}, {"ticker": "UBER", "pct": 14.4}, {"ticker": "CSX", "pct": 8.7}, {"ticker": "UPS", "pct": 5.7}, {"ticker": "UAL", "pct": 5.5}],
        "XRT": [{"ticker": "GRPN", "pct": 1.8}, {"ticker": "REAL", "pct": 1.7}, {"ticker": "BBWI", "pct": 1.7}, {"ticker": "WRBY", "pct": 1.6}, {"ticker": "UPBD", "pct": 1.6}],
        "XOP": [{"ticker": "TPL", "pct": 3.2}, {"ticker": "PBF", "pct": 2.9}, {"ticker": "DK", "pct": 2.8}, {"ticker": "EXE", "pct": 2.8}, {"ticker": "CNX", "pct": 2.8}],
        "SMH": [{"ticker": "NVDA", "pct": 17.8}, {"ticker": "TSM", "pct": 9.2}, {"ticker": "MU", "pct": 5.8}, {"ticker": "AMAT", "pct": 5.7}, {"ticker": "AMD", "pct": 5.4}],
        "CIBR": [{"ticker": "PANW", "pct": 9.6}, {"ticker": "FTNT", "pct": 8.8}, {"ticker": "CRWD", "pct": 8.3}, {"ticker": "CSCO", "pct": 7.7}, {"ticker": "AVGO", "pct": 6.7}],
        "IGV": [{"ticker": "PANW", "pct": 10.4}, {"ticker": "MSFT", "pct": 8.1}, {"ticker": "PLTR", "pct": 7.7}, {"ticker": "CRWD", "pct": 7.3}, {"ticker": "ORCL", "pct": 6.3}],
        "XBI": [{"ticker": "APGE", "pct": 1.5}, {"ticker": "MRNA", "pct": 1.4}, {"ticker": "TWST", "pct": 1.4}, {"ticker": "ORKA", "pct": 1.4}, {"ticker": "KYMR", "pct": 1.4}],
        "XAR": [{"ticker": "VSEC", "pct": 3.4}, {"ticker": "AXON", "pct": 3.2}, {"ticker": "SARO", "pct": 3.1}, {"ticker": "FTAI", "pct": 3.1}, {"ticker": "CRS", "pct": 3.0}],
        "AIQ": [{"ticker": "000660.KS", "pct": 8.1}, {"ticker": "MU", "pct": 7.1}, {"ticker": "AMD", "pct": 5.6}, {"ticker": "INTC", "pct": 5.2}, {"ticker": "005930.KS", "pct": 5.1}],
        "AIS": [{"ticker": "000660.KS", "pct": 8.8}, {"ticker": "MU", "pct": 7.1}, {"ticker": "AMD", "pct": 5.0}, {"ticker": "MRVL", "pct": 4.1}, {"ticker": "SIMO", "pct": 3.7}]
    }

    # Fetch 200-day historical data for SPY & sectors
    tickers_list = ["SPY"] + list(sectors.keys())
    print("Downloading historical data...")
    history_data = yf.download(tickers_list, period="200d", interval="1d")['Close']
    
    # Check if we downloaded successfully
    if history_data.empty:
        raise ValueError("Could not download historical data from Yahoo Finance.")
        
    # We will keep the full historical dataset downloaded (200 days) and slice it for 20 and 50 days
    relative_strength = {}
    
    # Slice 20 and 50 trading days datasets
    history_20 = history_data.tail(20)
    history_50 = history_data.tail(50)
    
    # Create history directory
    os.makedirs("history", exist_ok=True)
    
    for ticker in sectors.keys():
        if ticker in history_data:
            # 20-Day relative strength series
            ratios_20 = (history_20[ticker] / history_20["SPY"]).dropna()
            # 50-Day relative strength series
            ratios_50 = (history_50[ticker] / history_50["SPY"]).dropna()
            
            relative_strength[ticker] = {}
            
            # Normalize 20-day series
            if not ratios_20.empty:
                first_20 = ratios_20.iloc[0]
                norm_20 = ((ratios_20 / first_20) * 100).round(2).tolist()
                dates_20 = [d.strftime("%Y-%m-%d") for d in ratios_20.index]
                relative_strength[ticker]["20d"] = {
                    "dates": dates_20,
                    "values": norm_20
                }
                
            # Normalize 50-day series
            if not ratios_50.empty:
                first_50 = ratios_50.iloc[0]
                norm_50 = ((ratios_50 / first_50) * 100).round(2).tolist()
                dates_50 = [d.strftime("%Y-%m-%d") for d in ratios_50.index]
                relative_strength[ticker]["50d"] = {
                    "dates": dates_50,
                    "values": norm_50
                }

    # Fetch Leaderboard Details
    leaderboard = []
    print("Fetching leaderboard details...")
    for ticker, desc in sectors.items():
        try:
            t = yf.Ticker(ticker)
            info = t.info
            
            # Fetch last year history to calculate performance
            hist_1y = t.history(period="1y")
            
            # Price
            price = info.get("currentPrice") or info.get("regularMarketPrice") or (hist_1y["Close"].iloc[-1] if not hist_1y.empty else None)
            
            # Performance calculations
            wk_perf = 0.0
            mo_perf = 0.0
            yr_perf = 0.0
            
            if not hist_1y.empty:
                close_today = hist_1y["Close"].iloc[-1]
                
                # WK% (5 trading days ago)
                if len(hist_1y) >= 5:
                    wk_perf = ((close_today - hist_1y["Close"].iloc[-5]) / hist_1y["Close"].iloc[-5]) * 100
                # MO% (21 trading days ago)
                if len(hist_1y) >= 21:
                    mo_perf = ((close_today - hist_1y["Close"].iloc[-21]) / hist_1y["Close"].iloc[-21]) * 100
                # 1Y%
                yr_perf = ((close_today - hist_1y["Close"].iloc[0]) / hist_1y["Close"].iloc[0]) * 100

            # Dividend Yield
            dy = info.get("dividendYield")
            dy_val = f"{round(dy * 100, 2)}%" if dy else "-"
            
            # Volume
            vol = info.get("volume") or info.get("regularMarketVolume")
            if vol:
                if vol >= 1_000_000:
                    vol_str = f"{round(vol / 1_000_000, 1)}M"
                elif vol >= 1_000:
                    vol_str = f"{round(vol / 1_000, 1)}K"
                else:
                    vol_str = str(vol)
            else:
                vol_str = "-"

            # Top Holdings
            holdings = []
            try:
                # Try getting holdings from yfinance
                top_h = t.funds_data.top_holdings
                if top_h is not None and not top_h.empty:
                    pct_col = next((c for c in top_h.columns if 'percent' in c.lower() or 'weight' in c.lower() or 'value' in c.lower()), None)
                    if pct_col:
                        for symbol, row in top_h.head(5).iterrows():
                            val = row[pct_col]
                            if val < 1.0:
                                val = val * 100
                            
                            holdings.append({
                                "ticker": str(symbol).strip(),
                                "pct": round(val, 1)
                            })
            except Exception:
                pass
            
            # Fallback to local high-quality static top holdings if yfinance retrieval was empty
            if not holdings:
                holdings = fallback_holdings.get(ticker, [])

            leaderboard.append({
                "ticker": ticker,
                "description": desc,
                "price": round(price, 2) if price else 0.0,
                "dy": dy_val,
                "wk": round(wk_perf, 2),
                "mo": round(mo_perf, 2),
                "yr": round(yr_perf, 2),
                "vol": vol_str,
                "holdings": holdings
            })
        except Exception as ex:
            print(f"Error processing {ticker}: {ex}")
            leaderboard.append({
                "ticker": ticker,
                "description": desc,
                "price": 0.0,
                "dy": "-",
                "wk": 0.0,
                "mo": 0.0,
                "yr": 0.0,
                "vol": "-",
                "holdings": fallback_holdings.get(ticker, [])
            })

    return {
        "relative_strength": relative_strength,
        "leaderboard": leaderboard
    }


def fetch_custom_ticker(ticker, force=False):
    """
    Fetch and cache detailed chart data for a single custom ticker.
    Returns the data dict on success, None on failure.
    Respects the 24-hour cache unless force=True.
    """
    ticker = ticker.strip().upper()
    cache_path = f"history/{ticker}.json"

    if not force and is_cache_fresh(cache_path):
        print(f"  [cache] {ticker} — data is fresh, skipping download.")
        with open(cache_path, "r") as cf:
            return json.load(cf)

    print(f"  Fetching data for custom ticker {ticker}...")
    spread_data = fetch_ma_spread(tickers=(ticker,), lookback_days=126, force=True)
    if ticker not in spread_data:
        print(f"  ERROR: Could not fetch data for {ticker}. It may be an invalid or delisted ticker.")
        return None

    data = spread_data[ticker]

    # Also enrich with a display name from yfinance info
    try:
        info = yf.Ticker(ticker).info
        name = info.get("longName") or info.get("shortName") or ticker
        data["name"] = name
        data["sector"] = info.get("sector", "")
        data["industry"] = info.get("industry", "")
        data["marketCap"] = info.get("marketCap", None)
        data["fiftyTwoWeekHigh"] = info.get("fiftyTwoWeekHigh", None)
        data["fiftyTwoWeekLow"] = info.get("fiftyTwoWeekLow", None)
        data["trailingPE"] = info.get("trailingPE", None)
    except Exception:
        data["name"] = ticker

    data["ticker"] = ticker
    data["fetched_at"] = datetime.now().isoformat()
    os.makedirs("history", exist_ok=True)
    with open(cache_path, "w") as hf:
        json.dump(data, hf, indent=2)

    print(f"  Saved {cache_path}")
    return data


def main(force=False):
    print("Collecting dashboard data...")
    fg_data = fetch_fear_and_greed()
    market_data = fetch_market_data(force=force)
    # Get MA spread for SPY and QQQ (shown in the main page card)
    ma_spread_tickers = ("SPY", "QQQ")
    ma_spread_data = fetch_ma_spread(tickers=ma_spread_tickers, force=force)
    
    # Save individual MA spread history files in a 'history' folder for modal popup requests
    print("Generating individual ETF MA spread files...")
    os.makedirs("history", exist_ok=True)
    
    # List of all sector/ETF tickers
    all_tickers = list(market_data["relative_strength"].keys())
    # Make sure QQQ, IWM, DIA are also covered
    for t in ma_spread_tickers:
        if t not in all_tickers:
            all_tickers.append(t)
            
    # Generate spread data for all tickers and save as JSON files
    for ticker in all_tickers:
        cache_path = f"history/{ticker}.json"
        if not force and is_cache_fresh(cache_path):
            print(f"Skipping {ticker} (fresh cache)")
            continue
        print(f"Calculating MA spread for {ticker}...")
        ticker_spread = fetch_ma_spread(tickers=(ticker,), lookback_days=126, force=True)
        if ticker in ticker_spread:
            with open(f"history/{ticker}.json", "w") as hf:
                json.dump(ticker_spread[ticker], hf, indent=2)
    
    # Also refresh any custom tickers that are stale
    custom = load_custom_tickers()
    if custom:
        print("Refreshing custom tickers...")
        for ticker in list(custom.keys()):
            cache_path = f"history/{ticker}.json"
            if not force and is_cache_fresh(cache_path):
                print(f"Skipping custom {ticker} (fresh cache)")
                continue
            result = fetch_custom_ticker(ticker, force=True)
            if result:
                custom[ticker] = {"name": result.get("name", ticker), "fetched_at": result.get("fetched_at", "")}
        save_custom_tickers(custom)

    output = {
        "fear_greed": fg_data,
        "relative_strength": market_data["relative_strength"],
        "leaderboard": market_data["leaderboard"],
        "ma_spread": ma_spread_data,
        "custom_tickers": custom,
        "last_updated": datetime.now().isoformat()
    }
    
    with open("data.json", "w") as f:
        json.dump(output, f, indent=2)
    print("Dashboard data successfully updated and saved to data.json.")


if __name__ == "__main__":
    args = sys.argv[1:]
    force = "--force" in args

    if "--add" in args:
        idx = args.index("--add")
        if idx + 1 >= len(args):
            print("Usage: py update_data.py --add <TICKER> [--force]")
            sys.exit(1)
        ticker_to_add = args[idx + 1].strip().upper()
        print(f"=== Adding custom ticker: {ticker_to_add} ===")
        result = fetch_custom_ticker(ticker_to_add, force=True)
        if result is None:
            print(f"Failed to fetch data for {ticker_to_add}. Aborting.")
            sys.exit(1)

        custom = load_custom_tickers()
        custom[ticker_to_add] = {
            "name": result.get("name", ticker_to_add),
            "fetched_at": result.get("fetched_at", datetime.now().isoformat())
        }
        save_custom_tickers(custom)
        print(f"[OK] {ticker_to_add} added to custom_tickers.json")

        # Rebuild data.json so the UI picks up the new ticker immediately
        print("Updating data.json...")
        # Only need to reload the main data.json to inject custom_tickers
        if os.path.exists("data.json"):
            with open("data.json", "r") as f:
                existing = json.load(f)
            existing["custom_tickers"] = custom
            with open("data.json", "w") as f:
                json.dump(existing, f, indent=2)
            print("data.json updated with new custom ticker list.")
        else:
            print("data.json not found — run `py update_data.py` first to generate it.")
    else:
        main(force=force)
