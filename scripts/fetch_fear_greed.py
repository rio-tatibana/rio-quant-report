# -*- coding: utf-8 -*-
"""
CNN Business の Fear & Greed Index を取得し、
サイト表示用の data/fear_greed.json を書き出すスクリプト。
あわせて、VIX(Yahoo Finance)とプット/コール比率の実測値
(CBOEの日次統計ページ、CNBC等が使っているのと同じ公式値)も追加する。

使い方:
  python scripts/fetch_fear_greed.py

出力:
  data/fear_greed.json  (CNN総合スコア + 7つの構成指標 + VIX/Put-Call実測値)

注意:
  CNN・Yahoo Finance・CBOEは、いずれも公式に公開されたAPIではなく、
  各サイトが内部的に使っているエンドポイント/ページから取得しています。
  そのため、サイト側の都合で予告なく使えなくなる可能性があります。
  取得できなかった項目は、既存の data/fear_greed.json にあればその値を
  そのまま残します(サイトは前回の値を表示し続けます)。

このスクリプトは git操作(add/commit/push)を一切行いません。
生成物を確認してから、手動でコミット・pushしてください。
"""
import datetime
import json
import pathlib
import re
import urllib.error
import urllib.request

BASE = pathlib.Path(__file__).resolve().parent.parent  # rio_quant_homepage/
OUT_PATH = BASE / "data" / "fear_greed.json"

SOURCE_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
SOURCE_PAGE = "https://edition.cnn.com/markets/fear-and-greed"
VIX_URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=5d&interval=1d"
CBOE_URL = "https://www.cboe.com/markets/us/options/market-statistics/daily"

# CNNのエンドポイントはブラウザ以外からのアクセスを弾くため、
# ブラウザと同じヘッダーを付けてリクエストする
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://edition.cnn.com/",
}

# CNNが使っている7つの構成指標(キー -> 日本語ラベル)。表示順もこの順番。
INDICATORS = [
    ("market_momentum_sp125", "市場モメンタム", "S&P500と125日移動平均の差"),
    ("stock_price_strength", "株価の強さ", "52週高値を更新した銘柄数"),
    ("stock_price_breadth", "市場の値幅", "上昇銘柄と下落銘柄の出来高差"),
    ("put_call_options", "プット/コール比率", "強気・弱気オプションの比率"),
    ("market_volatility_vix", "市場ボラティリティ", "VIX(恐怖指数)の水準"),
    ("junk_bond_demand", "ジャンク債需要", "低格付け債と国債の利回り差"),
    ("safe_haven_demand", "安全資産需要", "株式と国債のリターン差"),
]

# CNNの rating(英語) -> 日本語表記
RATING_JA = {
    "extreme fear": "極度の恐怖",
    "fear": "恐怖",
    "neutral": "中立",
    "greed": "強欲",
    "extreme greed": "極度の強欲",
}


def fetch_raw():
    """CNNのエンドポイントからJSONを取得する"""
    req = urllib.request.Request(SOURCE_URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))


def fetch_vix():
    """Yahoo FinanceからVIXの実測値(現在値・前日終値)を取得する。取得失敗時はNone"""
    try:
        req = urllib.request.Request(VIX_URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as res:
            data = json.loads(res.read().decode("utf-8"))
        meta = data["chart"]["result"][0]["meta"]
        price = meta.get("regularMarketPrice")
        prev = meta.get("previousClose") or meta.get("chartPreviousClose")
        if price is None:
            return None
        return {"value": round(float(price), 2), "previous_close": round(float(prev), 2) if prev else None}
    except Exception as e:  # noqa: BLE001 - 取得失敗時は項目を省略するだけなので握りつぶす
        print(f"VIXの取得に失敗しました(スキップします): {e}")
        return None


def fetch_cboe_put_call():
    """CBOEの日次統計ページから、CNBC等と同じ公式のPut/Call Ratioを取得する。取得失敗時はNone"""
    try:
        req = urllib.request.Request(CBOE_URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as res:
            html = res.read().decode("utf-8")
        date_m = re.search(r'\\"selectedDate\\":\\"([\d-]+)\\"', html)
        pairs = dict(re.findall(r'\\"name\\":\\"([A-Z0-9 +/()]+ RATIO)\\",\\"value\\":\\"([0-9.]+)\\"', html))
        total = pairs.get("TOTAL PUT/CALL RATIO")
        equity = pairs.get("EQUITY PUT/CALL RATIO")
        if total is None or date_m is None:
            raise ValueError("ページの構造が変わり、必要な値が見つかりませんでした")
        return {
            "source": "CBOE Total Put/Call Ratio",
            "as_of": date_m.group(1),
            "ratio": float(total),
            "equity_ratio": float(equity) if equity else None,
        }
    except Exception as e:  # noqa: BLE001 - 取得失敗時は項目を省略するだけなので握りつぶす
        print(f"CBOEプット/コール比率の取得に失敗しました(スキップします): {e}")
        return None


def to_band(rating):
    """rating を fear / neutral / greed の3段階に丸める(表示の色分け用)"""
    r = (rating or "").lower()
    if "fear" in r:
        return "fear"
    if "greed" in r:
        return "greed"
    return "neutral"


def pack_score(rating, score):
    """スコアと評価を、サイト表示用の共通の形にまとめる"""
    return {
        "score": round(float(score), 1),
        "rating": rating,
        "rating_ja": RATING_JA.get((rating or "").lower(), rating),
        "band": to_band(rating),
    }


def build_payload(raw, vix, put_call):
    """CNNの生JSON + VIX + プット/コール実測値から、サイトで使う項目だけを取り出す"""
    fg = raw["fear_and_greed"]

    indicators = []
    for key, label_ja, note_ja in INDICATORS:
        item = raw.get(key)
        if not item:
            continue  # CNN側の項目名が変わった場合はスキップして残りを表示する
        entry = pack_score(item.get("rating"), item.get("score"))
        entry.update({"key": key, "label_ja": label_ja, "note_ja": note_ja})
        if key == "market_volatility_vix" and vix:
            entry["raw"] = vix
        if key == "put_call_options" and put_call:
            entry["raw"] = put_call
        indicators.append(entry)

    payload = pack_score(fg.get("rating"), fg.get("score"))
    payload.update(
        {
            "as_of": fg.get("timestamp"),
            "previous_close": round(float(fg["previous_close"]), 1),
            "previous_1_week": round(float(fg["previous_1_week"]), 1),
            "previous_1_month": round(float(fg["previous_1_month"]), 1),
            "previous_1_year": round(float(fg["previous_1_year"]), 1),
            "indicators": indicators,
            "source_name": "CNN Business Fear & Greed Index",
            "source_url": SOURCE_PAGE,
            "generated_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        }
    )
    return payload


def carry_over_raw(payload, key):
    """今回取得できなかった実測値(raw)を、既存のJSONから引き継ぐ"""
    if not OUT_PATH.exists():
        return
    with OUT_PATH.open(encoding="utf-8") as f:
        prev = json.load(f)
    prev_map = {ind["key"]: ind for ind in prev.get("indicators", [])}
    for ind in payload["indicators"]:
        if ind["key"] == key and "raw" not in ind and key in prev_map and "raw" in prev_map[key]:
            ind["raw"] = prev_map[key]["raw"]
            print(f"  ({ind['label_ja']}の実測値は前回の値を引き継ぎました)")


def main():
    try:
        raw = fetch_raw()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        # 取得に失敗しても既存のJSONは消さない(サイトは前回の値を表示し続ける)
        print(f"取得に失敗しました: {e}")
        if OUT_PATH.exists():
            print(f"既存の {OUT_PATH.name} をそのまま残します。サイトは前回の値を表示します。")
        raise SystemExit(1)

    vix = fetch_vix()
    put_call = fetch_cboe_put_call()

    payload = build_payload(raw, vix, put_call)
    if vix is None:
        carry_over_raw(payload, "market_volatility_vix")
    if put_call is None:
        carry_over_raw(payload, "put_call_options")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"書き出しました: {OUT_PATH}")
    print(f"  総合スコア: {payload['score']} ({payload['rating_ja']})")
    print(f"  基準日時  : {payload['as_of']}")
    print(f"  構成指標  : {len(payload['indicators'])}件")


if __name__ == "__main__":
    main()
