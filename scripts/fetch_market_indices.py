# -*- coding: utf-8 -*-
"""
Yahoo Finance(非公式のチャートAPI)から主要指数の値を取得し、
サイトの「本日のマーケット」欄で使う data/market_indices.json を書き出すスクリプト。

使い方:
  python scripts/fetch_market_indices.py

出力:
  data/market_indices.json  (S&P500 / Nasdaq100 / Dow Jones / VIX / 10年米国債利回り / USD/JPY)

注意:
  Yahoo Financeは公式に公開されたAPIではなく、サイトが内部的に使っている
  エンドポイントから取得しています。そのため、サイト側の都合で予告なく
  使えなくなる可能性があります。個別の指標が取得できなかった場合、
  既存の data/market_indices.json にあればその値をそのまま残します
  (サイトは前回の値を表示し続けます)。

このスクリプトは git操作(add/commit/push)を一切行いません。
生成物を確認してから、手動でコミット・pushしてください。
"""
import datetime
import json
import pathlib
import urllib.error
import urllib.request

BASE = pathlib.Path(__file__).resolve().parent.parent  # rio_quant_homepage/
OUT_PATH = BASE / "data" / "market_indices.json"

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
}

# (Yahoo Financeのシンボル, キー, 表示名, 値のフォーマット)
# フォーマット: "index"=カンマ区切り整数寄り, "price"=小数2桁, "percent"=小数2桁+%
TICKERS = [
    ("%5EGSPC", "sp500", "S&P 500", "index"),
    ("%5ENDX", "nasdaq100", "Nasdaq 100", "index"),
    ("%5EDJI", "dow", "Dow Jones", "index"),
    ("%5EVIX", "vix", "VIX", "price"),
    ("%5ETNX", "treasury10y", "10Y Treasury", "percent"),
    ("JPY=X", "usdjpy", "USD/JPY", "price"),
]


def fetch_one(symbol):
    """1銘柄分の現在値と前日比%を取得する。取得失敗時はNone"""
    url = CHART_URL.format(symbol=symbol)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.loads(res.read().decode("utf-8"))
    meta = data["chart"]["result"][0]["meta"]
    price = meta.get("regularMarketPrice")
    change_pct = meta.get("regularMarketChangePercent")
    if price is None or change_pct is None:
        return None
    return {"price": float(price), "change_pct": float(change_pct)}


def format_value(price, fmt):
    if fmt == "index":
        return f"{price:,.2f}"
    if fmt == "percent":
        return f"{price:.2f}%"
    return f"{price:,.2f}"


def build_payload():
    indices = []
    failed = []
    for symbol, key, label, fmt in TICKERS:
        try:
            r = fetch_one(symbol)
        except Exception as e:  # noqa: BLE001 - 1銘柄の失敗で全体を止めない
            print(f"{label}の取得に失敗しました(スキップします): {e}")
            r = None
        if r is None:
            failed.append(key)
            continue
        indices.append(
            {
                "key": key,
                "label": label,
                "value": format_value(r["price"], fmt),
                "change_pct": round(r["change_pct"], 2),
            }
        )
    return indices, failed


def carry_over_missing(indices, failed):
    """今回取得できなかった指標を、既存のJSONから引き継ぐ"""
    if not failed or not OUT_PATH.exists():
        return indices
    with OUT_PATH.open(encoding="utf-8") as f:
        prev = json.load(f)
    prev_map = {ind["key"]: ind for ind in prev.get("indices", [])}
    for key in failed:
        if key in prev_map:
            indices.append(prev_map[key])
            print(f"  ({prev_map[key]['label']}は前回の値を引き継ぎました)")
    # TICKERSの並び順に揃える
    order = {key: i for i, (_, key, _, _) in enumerate(TICKERS)}
    indices.sort(key=lambda ind: order.get(ind["key"], 999))
    return indices


def main():
    indices, failed = build_payload()
    indices = carry_over_missing(indices, failed)

    if not indices:
        print("すべての指標の取得に失敗しました。既存のファイルは変更しません。")
        raise SystemExit(1)

    payload = {
        "indices": indices,
        "source_name": "Yahoo Finance",
        "generated_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"書き出しました: {OUT_PATH}")
    print(f"  取得件数: {len(indices)}件")


if __name__ == "__main__":
    main()
