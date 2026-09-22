# -*- coding: utf-8 -*-
"""無料データだけで日本株レポート用JSONを生成する。

データ取得元:
- yfinance: 終値・出来高・Yahoo Financeが提供する基本指標
- TDnet公開情報: 監視対象の決算短信などの適時開示

このスクリプトはgit、ntfy、注文操作を行わない。外部通信は実行時だけ発生する。
"""
from __future__ import annotations

import csv
import json
import logging
import math
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from statistics import mean
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf

BASE = Path(__file__).resolve().parent.parent
UNIVERSE_PATH = BASE / "config" / "japan_universe.csv"
DATA_DIR = BASE / "data" / "japan"
LATEST_PATH = DATA_DIR / "latest.json"
DISCLOSURES_PATH = DATA_DIR / "disclosures.json"
EARNINGS_HISTORY_PATH = DATA_DIR / "earnings_history.csv"
SCAN_STATE_PATH = DATA_DIR / "tdnet_scan_state.json"
JST = ZoneInfo("Asia/Tokyo")

EARNINGS_COLUMNS = [
    "id", "code", "name", "published_at", "title", "url",
    "revenue", "operating_income", "ordinary_income", "net_income_parent", "eps", "dps",
    "forecast_revenue", "forecast_operating_income", "forecast_net_income_parent", "forecast_eps", "forecast_dps",
]

# 指数そのものを提供できるものは指数を使う。TOPIXとグロース250はYahoo Financeが
# 指数を配信していないため、連動ETFを明示して代用する。
MARKETS = {
    "nikkei": {"symbol": "^N225", "label": "日経平均"},
    "topix": {"symbol": "1306.T", "label": "TOPIX連動ETF"},
    "growth250": {"symbol": "2516.T", "label": "東証グロース250連動ETF"},
    "usd_jpy": {"symbol": "JPY=X", "label": "ドル円"},
}


def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def load_universe() -> list[dict[str, str]]:
    with UNIVERSE_PATH.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def extract_column(downloaded: pd.DataFrame, symbol: str, column: str) -> pd.Series:
    """yfinanceの単数・複数ティッカー形式の両方から指定した価格列を取り出す。"""
    if downloaded.empty:
        return pd.Series(dtype=float)
    try:
        if isinstance(downloaded.columns, pd.MultiIndex):
            frame = downloaded[symbol]
        else:
            frame = downloaded
        return frame[column].dropna().astype(float)
    except (KeyError, TypeError):
        return pd.Series(dtype=float)


def download_prices(symbols: list[str]) -> tuple[dict[str, pd.Series], dict[str, pd.Series]]:
    """終値と調整後終値の両方を返す。

    終値は画面に出す実際の株価。調整後終値は配当・分配金・分割を反映した価格で、
    リターンの比較に使う。配当落ちで下がった分をリターンの下落として数えないため、
    TOPIX連動ETF（年2回分配）との比較が実勢に近くなる。
    """
    downloaded = yf.download(
        tickers=symbols,
        period="2y",
        interval="1d",
        auto_adjust=False,
        group_by="ticker",
        threads=False,
        progress=False,
    )
    closes = {symbol: extract_column(downloaded, symbol, "Close") for symbol in symbols}
    adjusted = {symbol: extract_column(downloaded, symbol, "Adj Close") for symbol in symbols}
    return closes, adjusted


def pct_change(current: float | None, previous: float | None) -> float | None:
    if current is None or previous in (None, 0) or pd.isna(current) or pd.isna(previous):
        return None
    return (current / previous - 1) * 100


def number(value) -> float | None:
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None


def completed_weekly(close: pd.Series) -> pd.Series:
    """金曜日以外は進行中の週を外し、確定した週足だけを返す。"""
    if close.empty:
        return pd.Series(dtype=float)
    weekly = close.resample("W-FRI").last().dropna()
    latest = close.index[-1]
    latest_date = latest.date() if hasattr(latest, "date") else latest
    if latest_date.weekday() < 4 and len(weekly) and weekly.index[-1].date() > latest_date:
        weekly = weekly.iloc[:-1]
    return weekly


def percentile_scores(values: list[float | None], reverse: bool = False) -> list[float | None]:
    valid = sorted({v for v in values if v is not None})
    if not valid:
        return [None] * len(values)
    if len(valid) == 1:
        return [50.0 if v is not None else None for v in values]
    ranks = {v: i / (len(valid) - 1) * 100 for i, v in enumerate(valid)}
    return [None if v is None else round((100 - ranks[v]) if reverse else ranks[v], 1) for v in values]


def fundamental_values(symbol: str) -> dict[str, float | None]:
    """Yahoo Financeの無料基本指標。欠損はNoneとして扱い、0点にはしない。"""
    try:
        info = yf.Ticker(symbol).get_info()
    except Exception as exc:  # 通信先の一部欠損で全体を止めない
        print(f"基本指標を取得できません: {symbol} ({exc})")
        return {key: None for key in ("revenue_growth", "earnings_growth", "roe", "margin", "pe", "pb")} | {"sector": "未分類"}
    return {
        "revenue_growth": number(info.get("revenueGrowth")),
        "earnings_growth": number(info.get("earningsGrowth")),
        "roe": number(info.get("returnOnEquity")),
        "margin": number(info.get("operatingMargins")),
        "pe": number(info.get("trailingPE")),
        "pb": number(info.get("priceToBook")),
        "sector": str(info.get("sector") or "未分類"),
    }


def score_rows(rows: list[dict]) -> None:
    """4因子を利用可能な値だけで再配分し、欠損で不当に低評価しない。"""
    growth_raw = [mean([v for v in (r["fundamentals"]["revenue_growth"], r["fundamentals"]["earnings_growth"]) if v is not None]) if any(v is not None for v in (r["fundamentals"]["revenue_growth"], r["fundamentals"]["earnings_growth"])) else None for r in rows]
    profit_raw = [mean([v for v in (r["fundamentals"]["roe"], r["fundamentals"]["margin"]) if v is not None]) if any(v is not None for v in (r["fundamentals"]["roe"], r["fundamentals"]["margin"])) else None for r in rows]
    momentum_raw = [mean([v for v in (r["return_13w_pct"], r["relative_topix_13w_pct"], r["distance_52w_high_pct"]) if v is not None]) if any(v is not None for v in (r["return_13w_pct"], r["relative_topix_13w_pct"], r["distance_52w_high_pct"])) else None for r in rows]
    pe = [v if v is not None and v > 0 else None for v in (r["fundamentals"]["pe"] for r in rows)]
    pb = [v if v is not None and v > 0 else None for v in (r["fundamentals"]["pb"] for r in rows)]
    valuation_raw = [mean([v for v in (a, b) if v is not None]) if a is not None or b is not None else None for a, b in zip(pe, pb)]
    components = zip(
        rows,
        percentile_scores(growth_raw),
        percentile_scores(profit_raw),
        percentile_scores(momentum_raw),
        percentile_scores(valuation_raw, reverse=True),
    )
    weights = (25, 25, 35, 15)
    for row, growth, profit, momentum, valuation in components:
        parts = (growth, profit, momentum, valuation)
        active = [(score, weight) for score, weight in zip(parts, weights) if score is not None]
        total = round(sum(score * weight for score, weight in active) / sum(weight for _, weight in active), 1) if active else None
        row["scores"] = {"total": total, "growth": growth, "profitability": profit, "momentum": momentum, "valuation": valuation}


def next_weekday(day: date) -> date:
    day += timedelta(days=1)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


def tdnet_dates_to_scan(today: date) -> list[date]:
    """前回成功日の翌日から今日までを確認し、失敗日の取りこぼしを防ぐ。"""
    state = read_json(SCAN_STATE_PATH, {})
    try:
        # 前回実行後に同日付で追加された開示を拾うため、成功日も重ねて確認する。
        start = date.fromisoformat(state["last_successful_date"])
    except (KeyError, TypeError, ValueError):
        # 初回実行も直近3日を確認し、導入日前後の決算を拾う。
        start = today - timedelta(days=2)
    # 長期間止まっていた場合でも、公開元へ過剰アクセスしないよう最大7日分に制限する。
    start = max(start, today - timedelta(days=6))
    return [start + timedelta(days=offset) for offset in range((today - start).days + 1)]


def annual_dps(statements, *, forecast: bool) -> float | None:
    """1株配当のうち、年間（通期合計）の値だけを軸を指定して取り出す。

    決算短信のXBRLでは、1株配当が支払時期ごと（中間・期末・年間）と
    実績／予想の2軸で収録される。tdnetのCK.DPS・CK.FORECAST_DPSは支払時期の軸を
    区別しないため、期末配当（年間の半分）や予想値を実績として取り違える。
    例: 2027年3月期第1四半期のリクルートHDは年間予想26円に対しCK.FORECAST_DPSが
    期末予想13円を返した。そのため、ここで年間値を明示的に選ぶ。
    """
    target = "ForecastMember" if forecast else "ResultMember"
    for item in statements.search("DividendPerShare"):
        members = {
            dim.member.split("}")[-1]
            for dim in getattr(item, "dimensions", [])
        }
        if "AnnualMember" in members and target in members:
            value = number(getattr(item, "value", None))
            if value is not None:
                return value
    return None


def extract_earnings_values(filing) -> dict[str, float | None]:
    """決算短信XBRLから設計書で指定された数値だけを機械的に抽出する。"""
    from tdnet import CK, extract_values, extracted_to_dict

    statements = filing.xbrl()
    actual_keys = {
        "revenue": CK.REVENUE,
        "operating_income": CK.OPERATING_INCOME,
        "ordinary_income": CK.ORDINARY_INCOME,
        "net_income_parent": CK.NET_INCOME_PARENT,
        "eps": CK.EPS,
    }
    forecast_keys = {
        "forecast_revenue": CK.FORECAST_REVENUE,
        "forecast_operating_income": CK.FORECAST_OPERATING_INCOME,
        "forecast_net_income_parent": CK.FORECAST_NET_INCOME_PARENT,
        "forecast_eps": CK.FORECAST_EPS,
    }

    def extract(keys: dict[str, object], **kwargs) -> dict[str, float | None]:
        values = extracted_to_dict(extract_values(statements, list(keys.values()), **kwargs))
        return {label: number(values.get(key)) for label, key in keys.items()}

    actual = extract(actual_keys, period="current", consolidated=True)
    if not any(value is not None for value in actual.values()):
        actual = extract(actual_keys, period="current", consolidated=False)
    # 配当は支払時期・実績／予想の軸を持つため、年間値を直接指定して取得する。
    dividend = {
        "dps": annual_dps(statements, forecast=False),
        "forecast_dps": annual_dps(statements, forecast=True),
    }
    forecast = extract(forecast_keys)
    return actual | forecast | dividend


def append_earnings_history(events: list[dict]) -> None:
    """決算回ごとに1行をCSVへ追記し、公開JSONの保存期間を過ぎても履歴を残す。"""
    existing_ids: set[str] = set()
    if EARNINGS_HISTORY_PATH.exists():
        with EARNINGS_HISTORY_PATH.open(encoding="utf-8-sig", newline="") as f:
            existing_ids = {row.get("id", "") for row in csv.DictReader(f)}
    new_rows = [event for event in events if event.get("earnings") and event["id"] not in existing_ids]
    if not new_rows:
        return
    EARNINGS_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    write_header = not EARNINGS_HISTORY_PATH.exists()
    with EARNINGS_HISTORY_PATH.open("a", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=EARNINGS_COLUMNS, extrasaction="ignore")
        if write_header:
            writer.writeheader()
        for event in new_rows:
            writer.writerow({**event, **event["earnings"]})


def collect_disclosures(watch_codes: set[str], scan_day: date) -> list[dict]:
    """TDnet公開情報のうち、決算・予想修正等を監視対象だけに絞る。"""
    try:
        import tdnet
    except ImportError as exc:
        raise RuntimeError("tdnetが未導入のため、適時開示を確認できません。") from exc
    try:
        # sourceは指定しない。やのしんWEB-API優先で、失敗時はライブラリがTDnet直接読み取りへ
        # 自動フォールバックする。source="scrape"を直接指定すると一覧1ページ目（100件）しか
        # 取得できず、決算集中日に監視銘柄の開示を取りこぼす。
        filings = tdnet.documents(scan_day.strftime("%Y%m%d"), limit=2000)
    except Exception as exc:
        raise RuntimeError(f"TDnetの開示一覧を取得できません: {scan_day} ({exc})") from exc
    keywords = ("決算短信", "業績予想", "配当", "自己株式", "株式分割", "株式取得", "合併", "公開買付", "M&A")
    events = []
    for filing in filings:
        code = str(getattr(filing, "company_code", ""))[:4]
        title = str(getattr(filing, "title", ""))
        if code not in watch_codes or not any(word in title for word in keywords):
            continue
        url = None
        try:
            time.sleep(0.5)
            url = filing.fetch_pdf().source_url
        except Exception:
            pass
        earnings: dict[str, float | None] = {}
        if "決算短信" in title and getattr(filing, "has_xbrl", False):
            try:
                # 短時間に連続してXBRL/PDFへアクセスしない。
                time.sleep(0.5)
                earnings = extract_earnings_values(filing)
            except Exception as exc:
                print(f"決算数値を抽出できません: {code} ({exc})")
        events.append({
            "id": f"{code}-{getattr(filing, 'doc_id', title)}",
            "code": code,
            "name": str(getattr(filing, "company_name", "")),
            "title": title,
            "published_at": str(getattr(filing, "pubdate", scan_day.isoformat())),
            "report_date": next_weekday(scan_day).isoformat(),
            "url": url,
            "source": "TDnet",
            "earnings": earnings,
        })
    return events


def update_disclosures(watch_codes: set[str], today: date) -> list[dict]:
    stored = read_json(DISCLOSURES_PATH, [])
    known = {item.get("id") for item in stored}
    collected: list[dict] = []
    for scan_day in tdnet_dates_to_scan(today):
        day_events = collect_disclosures(watch_codes, scan_day)
        collected.extend(day_events)
        # 日ごとの一覧取得にも間隔を空ける。
        if scan_day != today:
            time.sleep(0.5)
    stored.extend(item for item in collected if item["id"] not in known)
    append_earnings_history(collected)
    cutoff = today - timedelta(days=14)
    stored = [item for item in stored if date.fromisoformat(item["report_date"]) >= cutoff]
    write_json(DISCLOSURES_PATH, stored)
    write_json(SCAN_STATE_PATH, {"last_successful_date": today.isoformat()})
    return [item for item in stored if date.fromisoformat(item["report_date"]) <= today]


def market_summary(closes: dict[str, pd.Series], adjusted: dict[str, pd.Series]) -> tuple[list[dict], float | None, date | None]:
    result, as_of = [], None
    for key, spec in MARKETS.items():
        close = closes[spec["symbol"]]
        if len(close) < 2:
            result.append({"label": spec["label"], "value": None, "change_1d_pct": None})
            continue
        latest_day = close.index[-1].date()
        if key == "nikkei":
            as_of = latest_day
        result.append({"label": spec["label"], "value": round(float(close.iloc[-1]), 3), "change_1d_pct": round(pct_change(close.iloc[-1], close.iloc[-2]), 2)})
    # 相対リターンの基準は分配金調整後の価格で測る。ETFの分配金落ちを
    # 下落として数えると、全銘柄が実勢より基準に勝っているように見えてしまう。
    topix_adjusted = adjusted[MARKETS["topix"]["symbol"]]
    topix_13w = None
    if len(topix_adjusted) < 2:
        print(f"TOPIX基準（{MARKETS['topix']['symbol']}）の価格が取得できません。相対リターンは欠損として扱います。")
    else:
        topix = completed_weekly(topix_adjusted)
        topix_13w = pct_change(topix.iloc[-1], topix.iloc[-14]) if len(topix) >= 14 else None
    return result, topix_13w, as_of


def build_rows(universe: list[dict[str, str]], closes: dict[str, pd.Series], adjusted: dict[str, pd.Series], topix_13w: float | None) -> list[dict]:
    rows = []
    for item in universe:
        symbol = f"{item['code']}.T"
        close = closes[symbol]
        if len(close) < 130:
            print(f"十分な価格履歴がないため除外: {symbol}")
            continue
        weekly = completed_weekly(close)
        if len(weekly) < 27:
            continue
        ma13, ma26 = weekly.rolling(13).mean().iloc[-1], weekly.rolling(26).mean().iloc[-1]
        current = float(close.iloc[-1])
        high_52w = float(close.iloc[-252:].max()) if len(close) >= 252 else float(close.max())
        # 13週リターンは配当落ちを除いた調整後価格で測り、TOPIX基準と同じ土台で比べる。
        adjusted_weekly = completed_weekly(adjusted[symbol])
        return_13w = pct_change(adjusted_weekly.iloc[-1], adjusted_weekly.iloc[-14]) if len(adjusted_weekly) >= 14 else None
        rows.append({
            "code": item["code"], "name": item["name"], "symbol": symbol,
            "price": round(current, 2), "change_1d_pct": round(pct_change(close.iloc[-1], close.iloc[-2]), 2),
            "ma13w": round(float(ma13), 2), "ma26w": round(float(ma26), 2),
            "golden_cross_active": bool(ma13 > ma26),
            "return_13w_pct": round(return_13w, 2) if return_13w is not None else None,
            "relative_topix_13w_pct": round(return_13w - topix_13w, 2) if return_13w is not None and topix_13w is not None else None,
            "distance_52w_high_pct": round(pct_change(current, high_52w), 2),
            "fundamentals": fundamental_values(symbol),
        })
    score_rows(rows)
    return sorted(rows, key=lambda row: (not row["golden_cross_active"], -(row["scores"]["total"] or -1)))


def sector_summary(rows: list[dict]) -> list[dict]:
    """Yahoo Financeの分類を用い、監視対象内の業種平均だけを表示する。"""
    groups: dict[str, list[float]] = {}
    for row in rows:
        change = row.get("change_1d_pct")
        if change is not None:
            groups.setdefault(row["fundamentals"].get("sector") or "未分類", []).append(change)
    return sorted(
        [{"label": label, "count": len(values), "change_1d_pct": round(mean(values), 2)} for label, values in groups.items()],
        key=lambda item: item["change_1d_pct"], reverse=True,
    )


def main() -> None:
    # やのしんWEB-APIからTDnet直接読み取りへ切り替わった場合、一覧が1ページ目に限られ
    # 取りこぼしが起きうる。そのフォールバックに気づけるようライブラリの警告を表示する。
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s: %(message)s")
    today = datetime.now(JST).date()
    universe = load_universe()
    symbols = [f"{item['code']}.T" for item in universe] + [item["symbol"] for item in MARKETS.values()]
    closes, adjusted = download_prices(symbols)
    markets, topix_13w, market_date = market_summary(closes, adjusted)
    # 終値がまったく取得できないときだけ、古い内容を残して中断する。
    if market_date is None:
        print("日本市場の終値を取得できません。既存の内容を残して更新しません。")
        return
    # 祝日・週末は最終営業日の確定値を公開する。同じ営業日で再実行しても内容が変わらないため、
    # 無意味な更新コミットとntfy通知が出ないよう、ここで打ち切る。
    previous = read_json(LATEST_PATH, {})
    if previous.get("status") == "ok" and previous.get("as_of") == market_date.isoformat():
        print(f"前回と同じ営業日（{market_date}）の確定値です。更新しません。")
        return
    rows = build_rows(universe, closes, adjusted, topix_13w)
    disclosures = update_disclosures({item["code"] for item in universe}, today)
    active = [row for row in rows if row["golden_cross_active"]]
    payload = {
        "status": "ok", "generated_at": datetime.now(JST).isoformat(timespec="seconds"),
        "as_of": market_date.isoformat(), "source_notes": ["株価・基本指標: Yahoo Finance（yfinance）", "適時開示: TDnet公開情報"],
        "market": markets, "watchlist_count": len(active), "universe_count": len(universe),
        "watchlist": active, "rows": rows, "sectors": sector_summary(rows), "disclosures": disclosures,
    }
    write_json(LATEST_PATH, payload)
    print(f"日本株レポート用データを更新しました: {LATEST_PATH}")


if __name__ == "__main__":
    main()
