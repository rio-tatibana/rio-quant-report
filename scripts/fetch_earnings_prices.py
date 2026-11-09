"""対象25社の決算直後の米国日次終値を取得する。相場の読み取りのみ。"""
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "earnings"


def main():
    report = json.loads((DATA / "week_2026-11-02.json").read_text(encoding="utf-8"))
    cache = DATA / ".yf_cache"
    cache.mkdir(exist_ok=True)
    yf.set_tz_cache_location(str(cache))
    tickers = [x["ticker"] for x in report["items"]] + ["SPY"]
    quotes = yf.download(tickers,start="2026-10-30",end="2026-11-10",auto_adjust=False,
                         progress=False,threads=False,group_by="ticker")
    output = {"retrieved_at_jst":datetime.now(timezone(timedelta(hours=9))).isoformat(),
              "source":"Yahoo Finance via yfinance", "adjustment":"Close・配当調整なし", "items":{}}
    for item in report["items"]:
        ticker, release, session = item["ticker"], item.get("release_date"), item.get("release_session")
        if not release or session not in ("BEFORE","AFTER"):
            continue
        close = quotes[ticker]["Close"].dropna()
        dates = [t.strftime("%Y-%m-%d") for t in close.index]
        candidates = [d for d in dates if d >= release] if session == "BEFORE" else [d for d in dates if d > release]
        if not candidates:
            continue
        post = candidates[0]
        before = [d for d in dates if d < post]
        if not before:
            continue
        pre = before[-1]
        start, end = float(close.loc[pre]), float(close.loc[post])
        if not all(math.isfinite(x) and x>0 for x in (start,end)):
            continue
        spy=quotes["SPY"]["Close"]
        output["items"][ticker]={"pre_date":pre,"post_date":post,"pre_close":start,"post_close":end,
           "change_pct":(end/start-1)*100,"spy_change_pct":(float(spy.loc[post])/float(spy.loc[pre])-1)*100,
           "source_url":f"https://finance.yahoo.com/quote/{ticker}/history/"}
    (DATA / "prices_2026-11-02.json").write_text(json.dumps(output,ensure_ascii=False,indent=2,allow_nan=False)+"\n",encoding="utf-8")
    print(f"日次終値反応を取得: {len(output['items'])}/25社")


if __name__ == "__main__":
    main()
