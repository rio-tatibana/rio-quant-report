# -*- coding: utf-8 -*-
"""
Yahoo Finance(非公式のチャートAPI)などから取得したデータをもとに、
サイトの「マーケットレジーム」欄で使う data/market_regime.json を書き出すスクリプト。

使い方:
  python scripts/fetch_market_regime.py

出力:
  data/market_regime.json  (5項目のスコア + 総合スコア)

各項目の算出方法:
  トレンド              : S&P500の現在値が50日・200日移動平均から何%乖離しているか
  市場の広がり(騰落レシオ): S&P500全構成銘柄の25日騰落レシオ
                          (値上がり延べ日数 ÷ 値下がり延べ日数 × 100)
  循環物色              : 景気敏感セクター平均 - ディフェンシブセクター平均
  ボラティリティ        : VIXが過去1年レンジのどの位置か(山型。落ち着きすぎも減点)
  金利                  : 10年債利回り - 3ヶ月債利回り(イールドカーブ)

設計上の注意:
  ・騰落レシオは必ずS&P500の全構成銘柄で計算すること。大型株だけで計算すると
    実測で約11ポイント高く出てしまい、「市場の広がり」を測る意味がなくなる。
  ・ボラティリティは単純に「VIXが低いほど高得点」にしてはいけない。
    極端に低いVIXは安全ではなく楽観の行き過ぎ(コンプレイセンシー)のサインなので、
    低すぎる場合も減点する山型にしている。

注意:
  0〜100へのスケール変換は「一般的にこのくらいなら強い/弱い」という目安を
  もとにした独自の設計であり、証券会社等が定める公式な計算式ではありません。
  CNN Fear & Greed Index とは算出方法が異なるため、数値は一致しません。
  Yahoo FinanceもWikipediaも公式に公開されたAPIではないため、予告なく
  使えなくなる可能性があります。取得に失敗した項目はスキップし、
  残りの項目だけで総合スコアを算出します。

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
OUT_PATH = BASE / "data" / "market_regime.json"

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={rng}&interval=1d"
SPARK_URL = "https://query1.finance.yahoo.com/v7/finance/spark?symbols={symbols}&range=3mo&interval=1d"
SP500_LIST_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"

# sparkエンドポイントは1回に20銘柄までしか受け付けない(50銘柄以上は400エラー)
BATCH_SIZE = 20

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
}

# セクターETF: (シンボル, 日本語名, 区分)
# 区分 cyclical=景気敏感 / defensive=ディフェンシブ / other=どちらとも言えない
SECTORS = [
    ("XLK", "情報技術", "cyclical"),
    ("XLY", "一般消費財", "cyclical"),
    ("XLI", "資本財", "cyclical"),
    ("XLF", "金融", "cyclical"),
    ("XLB", "素材", "cyclical"),
    ("XLE", "エネルギー", "cyclical"),
    ("XLV", "ヘルスケア", "defensive"),
    ("XLP", "生活必需品", "defensive"),
    ("XLU", "公益事業", "defensive"),
    ("XLRE", "不動産", "defensive"),
    ("XLC", "コミュニケーション", "other"),  # 分類しづらいのでスプレッド計算からは除外
]


def fetch_closes(symbol, rng="1y"):
    """指定期間の終値リスト(古い順)を返す"""
    url = CHART_URL.format(symbol=symbol, rng=rng)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.loads(res.read().decode("utf-8"))
    result = data["chart"]["result"][0]
    closes = [c for c in result["indicators"]["quote"][0]["close"] if c is not None]
    latest = result["meta"].get("regularMarketPrice") or closes[-1]
    return closes, float(latest)


def clamp(v, lo=0.0, hi=100.0):
    return max(lo, min(hi, v))


def scale(value, low, high):
    """value を low〜high の範囲で 0〜100 に線形変換する"""
    if high == low:
        return 50.0
    return clamp((value - low) / (high - low) * 100.0)


def score_trend(closes, latest):
    """50日・200日移動平均からの乖離率の平均。-10%で0点、+10%で100点"""
    ma50 = sum(closes[-50:]) / len(closes[-50:])
    ma200 = sum(closes[-200:]) / len(closes[-200:])
    dev50 = (latest - ma50) / ma50 * 100
    dev200 = (latest - ma200) / ma200 * 100
    avg_dev = (dev50 + dev200) / 2
    return round(scale(avg_dev, -10, 10), 1), {
        "ma50_dev_pct": round(dev50, 2),
        "ma200_dev_pct": round(dev200, 2),
    }


def fetch_sp500_symbols():
    """WikipediaのS&P500構成銘柄一覧からティッカーを取得する"""
    req = urllib.request.Request(SP500_LIST_URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as res:
        html = res.read().decode("utf-8", "ignore")
    seg = html[html.find('id="constituents"'):]
    seg = seg[: seg.find("</table>")]
    # <a href>を拾う方式だとNYSE分しか取れないため、テンプレート引数から抽出する
    symbols = re.findall(r'"params":\{"1":\{"wt":"([A-Z\.\-]{1,6})"\}\}', seg)
    # BRK.B → BRK-B のように、Yahoo Financeの表記に合わせる
    return sorted({s.replace(".", "-") for s in symbols})


def fetch_many_closes(symbols):
    """sparkエンドポイントで複数銘柄の終値をまとめて取得する"""
    out = {}
    for i in range(0, len(symbols), BATCH_SIZE):
        batch = symbols[i : i + BATCH_SIZE]
        url = SPARK_URL.format(symbols=",".join(batch))
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as res:
                results = json.loads(res.read().decode("utf-8"))["spark"]["result"]
        except Exception:  # noqa: BLE001 - 一部のバッチが失敗しても残りで計算する
            continue
        for item in results:
            quote = item["response"][0].get("indicators", {}).get("quote", [{}])[0]
            closes = quote.get("close")
            if not closes:
                continue
            vals = [c for c in closes if c is not None]
            if len(vals) > 26:  # 25日分の前日比を取るには26本以上必要
                out[item["symbol"]] = vals
    return out


def score_breadth():
    """S&P500全構成銘柄の25日騰落レシオ。取得失敗時はNone"""
    try:
        symbols = fetch_sp500_symbols()
        if len(symbols) < 100:
            raise ValueError(f"構成銘柄の取得数が少なすぎます({len(symbols)}件)")
        closes = fetch_many_closes(symbols)
        if len(closes) < 100:
            raise ValueError(f"価格を取得できた銘柄が少なすぎます({len(closes)}件)")
    except Exception as e:  # noqa: BLE001 - この項目だけスキップして他の項目で続行する
        print(f"騰落レシオの取得に失敗しました(この項目はスキップします): {e}")
        return None, None

    advances = declines = 0
    for vals in closes.values():
        for j in range(-25, 0):
            if vals[j] > vals[j - 1]:
                advances += 1
            elif vals[j] < vals[j - 1]:
                declines += 1
    if declines == 0:
        return None, None

    ratio = advances / declines * 100
    # 騰落レシオは常時100前後を推移するため、山型にすると常に高得点になり
    # 判別力を失う。実際のレンジに合わせて線形(70%→130%)でスケールする。
    detail = {
        "ad_ratio": round(ratio, 1),
        "universe": len(closes),
        "advances": advances,
        "declines": declines,
    }
    if ratio > 120:
        detail["overbought"] = True
    if ratio < 70:
        detail["oversold"] = True
    print(f"  騰落レシオ: {ratio:.1f}%  ({len(closes)}銘柄で計算)")
    return round(scale(ratio, 70, 130), 1), detail


def score_rotation():
    """景気敏感セクターとディフェンシブセクターの騰落率の差。取得失敗時はNone"""
    perf = []
    for symbol, label, kind in SECTORS:
        try:
            closes, latest = fetch_closes(symbol, rng="1y")
            ret_1m = (latest - closes[-22]) / closes[-22] * 100
            ret_3m = (latest - closes[-64]) / closes[-64] * 100
        except Exception as e:  # noqa: BLE001
            print(f"  セクター{label}の取得に失敗しました: {e}")
            continue
        perf.append({"symbol": symbol, "label": label, "kind": kind,
                     "return_1m_pct": round(ret_1m, 2), "return_3m_pct": round(ret_3m, 2)})

    cyc = [p for p in perf if p["kind"] == "cyclical"]
    dfn = [p for p in perf if p["kind"] == "defensive"]
    if not cyc or not dfn:
        print("循環物色の算出に失敗しました(この項目はスキップします)。")
        return None, None

    def avg(items, key):
        return sum(p[key] for p in items) / len(items)

    spread_1m = avg(cyc, "return_1m_pct") - avg(dfn, "return_1m_pct")
    spread_3m = avg(cyc, "return_3m_pct") - avg(dfn, "return_3m_pct")
    ranked = sorted(perf, key=lambda p: -p["return_1m_pct"])

    detail = {
        "spread_1m_pt": round(spread_1m, 2),
        "spread_3m_pt": round(spread_3m, 2),
        "top": [{"label": p["label"], "return_1m_pct": p["return_1m_pct"]} for p in ranked[:3]],
        "bottom": [{"label": p["label"], "return_1m_pct": p["return_1m_pct"]} for p in ranked[-3:]],
    }
    return round(scale((spread_1m + spread_3m) / 2, -8, 8), 1), detail


def score_volatility(vix_closes, vix_latest):
    """VIXの過去1年レンジ内での位置。落ち着きすぎ(楽観の行き過ぎ)も減点する山型"""
    below = sum(1 for c in vix_closes if c < vix_latest)
    percentile = below / len(vix_closes) * 100
    # パーセンタイル35%付近が最高点。極端に低い(コンプレイセンシー)/
    # 極端に高い(パニック)の両方で減点される。
    score = clamp(100 - abs(percentile - 35) * 1.5)
    detail = {"vix": round(vix_latest, 2), "percentile_1y": round(percentile, 1)}
    if percentile < 10:
        detail["complacency"] = True
    return round(score, 1), detail


def score_rates(y10, y3m):
    """イールドカーブ(10年 - 3ヶ月)。-1.0%で0点、+2.0%で100点"""
    spread = y10 - y3m
    return round(scale(spread, -1.0, 2.0), 1), {
        "yield_10y": round(y10, 2),
        "yield_3m": round(y3m, 2),
        "spread": round(spread, 2),
    }


def band_of(score):
    """スコアを strong / mid / weak に分ける(既存のスコアバーの色分けに合わせる)"""
    if score >= 70:
        return "strong"
    if score >= 40:
        return "mid"
    return "weak"


def main():
    try:
        sp_closes, sp_latest = fetch_closes("%5EGSPC")
        vix_closes, vix_latest = fetch_closes("%5EVIX")
        _, y10 = fetch_closes("%5ETNX")
        _, y3m = fetch_closes("%5EIRX")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, KeyError, IndexError) as e:
        print(f"取得に失敗しました: {e}")
        if OUT_PATH.exists():
            print(f"既存の {OUT_PATH.name} をそのまま残します。サイトは前回の値を表示します。")
        raise SystemExit(1)

    trend, trend_detail = score_trend(sp_closes, sp_latest)
    breadth, breadth_detail = score_breadth()
    rotation, rotation_detail = score_rotation()
    volatility, vol_detail = score_volatility(vix_closes, vix_latest)
    rates, rates_detail = score_rates(y10, y3m)

    candidates = [
        ("trend", "トレンド", trend, trend_detail,
         "S&P500の50日・200日移動平均からの乖離"),
        ("breadth", "市場の広がり（騰落レシオ）", breadth, breadth_detail,
         "S&P500全構成銘柄の25日騰落レシオ"),
        ("rotation", "循環物色", rotation, rotation_detail,
         "景気敏感セクターとディフェンシブセクターの騰落率の差"),
        ("volatility", "ボラティリティ", volatility, vol_detail,
         "VIXの過去1年レンジ内での位置（落ち着きすぎも減点）"),
        ("rates", "金利（イールドカーブ）", rates, rates_detail,
         "10年債利回り - 3ヶ月債利回り"),
    ]
    factors = [
        {"key": k, "label": lb, "score": s, "band": band_of(s), "note": note, "detail": d}
        for k, lb, s, d, note in candidates
        if s is not None
    ]

    if not factors:
        print("すべての項目の算出に失敗しました。既存のファイルは変更しません。")
        raise SystemExit(1)

    total = round(sum(f["score"] for f in factors) / len(factors), 1)
    if total >= 60:
        regime, regime_ja = "Risk-On", "リスクオン"
    elif total >= 40:
        regime, regime_ja = "Neutral", "中立"
    else:
        regime, regime_ja = "Risk-Off", "リスクオフ"

    payload = {
        "total_score": total,
        "regime": regime,
        "regime_ja": regime_ja,
        "factors": factors,
        "source_name": "Yahoo Finance",
        "generated_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"書き出しました: {OUT_PATH}")
    print(f"  総合スコア: {total} ({regime}) ／ {len(factors)}項目で算出")
    for f_ in factors:
        print(f"    {f_['label']}: {f_['score']}")


if __name__ == "__main__":
    main()
