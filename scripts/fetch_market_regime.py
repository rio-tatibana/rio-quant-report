# -*- coding: utf-8 -*-
"""
Yahoo Finance(非公式のチャートAPI)などから取得したデータをもとに、
サイトのマーケット分析欄で使う data/market_regime.json を書き出すスクリプト。

使い方:
  python scripts/fetch_market_regime.py

出力:
  data/market_regime.json
    factors     : マーケットレジーム/マーケットスコアの6項目 + 総合スコア
    trend_rows  : 「市場のトレンド」欄の5項目
    sectors     : 「セクター別パフォーマンス」欄の11セクター
    focus       : ページ上部「TODAY'S FOCUS」用の上昇率トップ5銘柄

マーケットスコア6項目の算出方法:
  トレンド              : S&P500の現在値が50日・200日移動平均から何%乖離しているか
  出来高を伴ったトレンド : S&P500の25日「出来高加重の日次騰落率」
                          (Σ(その日の騰落率 × その日の出来高) ÷ Σ出来高)
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
  ・出来高を伴ったトレンドは「上昇日出来高 ÷ 下落日出来高」ではなく
    「出来高加重の日次騰落率」でスコア化すること。前者は暴落時に上昇日も下落日も
    出来高が膨らむため判別できない(2025年4月の急落時で実測1.169と、1を超えて
    しまっていた)。後者は同じ局面で正しくマイナスになる。
    比率のほうは分かりやすいので、表示用にのみ使う。
  ・S&P500は指数なので「指数値 × 出来高」は売買代金にならない。ただし25日程度の
    短期間では価格変動が小さく、株数ベースでも売買代金ベースでもほぼ同じ結果に
    なることをSPYで照合済み。出来高(株数)をそのまま使ってよい。

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
SPARK_URL = "https://query1.finance.yahoo.com/v7/finance/spark?symbols={symbols}&range={rng}&interval=1d"
SP500_LIST_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"

# sparkエンドポイントは1回に20銘柄までしか受け付けない(50銘柄以上は400エラー)
BATCH_SIZE = 20

# 出来高加重トレンドを何営業日分で見るか(騰落レシオと同じ25日に揃えている)
VOLUME_WINDOW = 25

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
}

# WikipediaのS&P500一覧に載っているGICSセクター名(英語)を日本語にする対応表。
# 下の SECTORS(セクターETF)の日本語名と表記をそろえてある。
GICS_JA = {
    "Information Technology": "情報技術",
    "Consumer Discretionary": "一般消費財",
    "Industrials": "資本財",
    "Financials": "金融",
    "Materials": "素材",
    "Energy": "エネルギー",
    "Health Care": "ヘルスケア",
    "Consumer Staples": "生活必需品",
    "Utilities": "公益事業",
    "Real Estate": "不動産",
    "Communication Services": "コミュニケーション",
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


def fetch_series(symbol, rng="1y"):
    """指定期間の終値・出来高(古い順)、最新値、前日比%を返す"""
    url = CHART_URL.format(symbol=symbol, rng=rng)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.loads(res.read().decode("utf-8"))
    result = data["chart"]["result"][0]
    quote = result["indicators"]["quote"][0]
    raw_vol = quote.get("volume") or [None] * len(quote["close"])
    closes, volumes = [], []
    for c, v in zip(quote["close"], raw_vol):
        if c is None:
            continue
        closes.append(float(c))
        volumes.append(float(v) if v is not None else 0.0)
    meta = result["meta"]
    latest = float(meta.get("regularMarketPrice") or closes[-1])
    change_pct = meta.get("regularMarketChangePercent")
    return closes, volumes, latest, change_pct


def clamp(v, lo=0.0, hi=100.0):
    return max(lo, min(hi, v))


def scale(value, low, high):
    """value を low〜high の範囲で 0〜100 に線形変換する"""
    if high == low:
        return 50.0
    return clamp((value - low) / (high - low) * 100.0)


def ratio_row(label, pos, neg, unit="%"):
    """「値上がり62% / 値下がり38%」のような左右2色のバー1本分のデータを作る"""
    total = pos + neg
    pos_pct = pos / total * 100 if total else 50.0
    if unit == "%":
        value = f"{pos_pct:.0f}% / {100 - pos_pct:.0f}%"
    else:
        value = f"{pos}{unit} / {neg}{unit}"
    return {"label": label, "pos_pct": round(pos_pct, 1), "value": value}


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


def score_volume_trend(closes, volumes):
    """出来高加重の日次騰落率。上昇した日ほど出来高が多いなら高得点。失敗時はNone"""
    if len(closes) <= VOLUME_WINDOW or sum(volumes[-VOLUME_WINDOW:]) <= 0:
        print("出来高が取得できませんでした(この項目はスキップします)。")
        return None, None, None

    weighted_sum = volume_sum = simple_sum = 0.0
    up_volume = down_volume = 0.0
    for i in range(-VOLUME_WINDOW, 0):
        prev, cur, vol = closes[i - 1], closes[i], volumes[i]
        ret = (cur - prev) / prev * 100
        weighted_sum += ret * vol
        volume_sum += vol
        simple_sum += ret
        if ret > 0:
            up_volume += vol
        elif ret < 0:
            down_volume += vol

    weighted = weighted_sum / volume_sum
    simple = simple_sum / VOLUME_WINDOW
    share = up_volume / (up_volume + down_volume) * 100 if (up_volume + down_volume) else 50.0

    # 過去2年の実測分布(5%tile -0.26% / 中央値 +0.07% / 95%tile +0.39%)に合わせ、
    # -0.25%〜+0.40% を 0〜100 にする。中央値がほぼ50点になるよう調整済み。
    score = round(scale(weighted, -0.25, 0.40), 1)
    detail = {
        "window_days": VOLUME_WINDOW,
        "weighted_return_pct": round(weighted, 3),
        "simple_return_pct": round(simple, 3),
        "up_volume_share_pct": round(share, 1),
        # 加重値が単純平均を上回る = 上昇した日のほうに出来高が寄っている
        "volume_backed": weighted > simple,
    }
    row = ratio_row(f"出来高を伴った上昇／下落（{VOLUME_WINDOW}日）",
                    round(share, 1), round(100 - share, 1))
    print(f"  出来高加重の日次騰落率: {weighted:+.3f}%  (単純平均 {simple:+.3f}%／"
          f"上昇日の出来高シェア {share:.1f}%)")
    return score, detail, row


def fetch_sp500_rows():
    """WikipediaのS&P500構成銘柄一覧から (ティッカー, セクター日本語名) の一覧を取得する。

    表の3列目がGICSセクター(Information Technology など11分類)。
    銘柄リストとセクターを1回の通信でまとめて取るための関数。
    """
    req = urllib.request.Request(SP500_LIST_URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as res:
        html = res.read().decode("utf-8", "ignore")
    seg = html[html.find('id="constituents"'):]
    seg = seg[: seg.find("</table>")]

    rows = []
    for row in seg.split("<tr")[1:]:
        # <a href>を拾う方式だとNYSE分しか取れないため、テンプレート引数から抽出する
        m = re.search(r'"params":\{"1":\{"wt":"([A-Z\.\-]{1,6})"\}\}', row)
        if not m:
            continue
        # BRK.B → BRK-B のように、Yahoo Financeの表記に合わせる
        symbol = m.group(1).replace(".", "-")
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        sector = ""
        if len(cells) >= 3:
            sector = re.sub(r"<[^>]+>", "", cells[2]).strip()
        rows.append((symbol, GICS_JA.get(sector, sector or "その他")))
    return rows


def fetch_sp500_symbols():
    """WikipediaのS&P500構成銘柄一覧からティッカーだけを取得する"""
    return sorted({symbol for symbol, _ in fetch_sp500_rows()})


def fetch_many_quotes(symbols, rng="1y"):
    """sparkエンドポイントで複数銘柄の終値と前日比をまとめて取得する。

    重要: sparkが返す終値の配列は、最新日が None(欠損)になっていることが非常に多い
    (実測でS&P500の503銘柄中502銘柄)。None を取り除いただけで末尾を使うと、
    まるまる1日古いデータで計算してしまう(実測で値上がり銘柄の割合が
    45.8% → 30.3% と15ポイントもずれた)。
    そのため meta の regularMarketPrice で最新値を必ず補う。ここを元に戻さないこと。
    """
    out = {}
    for i in range(0, len(symbols), BATCH_SIZE):
        batch = symbols[i : i + BATCH_SIZE]
        url = SPARK_URL.format(symbols=",".join(batch), rng=rng)
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as res:
                results = json.loads(res.read().decode("utf-8"))["spark"]["result"]
        except Exception:  # noqa: BLE001 - 一部のバッチが失敗しても残りで計算する
            continue
        for item in results:
            response = item["response"][0]
            closes = response.get("indicators", {}).get("quote", [{}])[0].get("close")
            if not closes:
                continue
            meta = response.get("meta", {})
            vals = [float(c) for c in closes if c is not None]
            latest = meta.get("regularMarketPrice")
            if latest is not None:
                if closes[-1] is None:
                    vals.append(float(latest))  # 欠けている最新日を補う
                else:
                    vals[-1] = float(latest)  # 最新値に置き換える
            if len(vals) > 26:  # 25日分の前日比を取るには26本以上必要
                out[item["symbol"]] = {
                    "closes": vals,
                    # Yahooが公表している前日比。取れないときは終値から計算する
                    "change_pct": meta.get("regularMarketChangePercent"),
                    # 会社名。fetch_minervini_report.py が銘柄カードの表示に使う
                    "name": meta.get("shortName") or meta.get("longName"),
                }
    return out


def analyze_constituents():
    """S&P500全構成銘柄から、騰落レシオ・「市場のトレンド」欄・上昇率上位5銘柄を計算する。

    1回の取得ですべてまかなうため、まとめて1つの関数にしている。
    取得に失敗した場合は (None, None, [], []) を返し、呼び出し側でスキップする。
    """
    try:
        symbols = fetch_sp500_symbols()
        if len(symbols) < 100:
            raise ValueError(f"構成銘柄の取得数が少なすぎます({len(symbols)}件)")
        quotes = fetch_many_quotes(symbols, rng="1y")
        if len(quotes) < 100:
            raise ValueError(f"価格を取得できた銘柄が少なすぎます({len(quotes)}件)")
    except Exception as e:  # noqa: BLE001 - この項目だけスキップして他の項目で続行する
        print(f"構成銘柄の取得に失敗しました(騰落レシオ・市場のトレンド・注目銘柄をスキップします): {e}")
        return None, None, [], []

    # --- 騰落レシオ(25日) ---
    advances = declines = 0
    for q in quotes.values():
        vals = q["closes"]
        for j in range(-25, 0):
            if vals[j] > vals[j - 1]:
                advances += 1
            elif vals[j] < vals[j - 1]:
                declines += 1
    if declines == 0:
        return None, None, [], []

    ratio = advances / declines * 100
    # 騰落レシオは常時100前後を推移するため、山型にすると常に高得点になり
    # 判別力を失う。実際のレンジに合わせて線形(70%→130%)でスケールする。
    breadth_detail = {
        "ad_ratio": round(ratio, 1),
        "universe": len(quotes),
        "advances": advances,
        "declines": declines,
    }
    if ratio > 120:
        breadth_detail["overbought"] = True
    if ratio < 70:
        breadth_detail["oversold"] = True
    breadth_score = round(scale(ratio, 70, 130), 1)
    print(f"  騰落レシオ: {ratio:.1f}%  ({len(quotes)}銘柄で計算)")

    # --- 「市場のトレンド」欄の各指標 ---
    day_up = day_down = 0
    above50 = below50 = 0
    above200 = below200 = 0
    new_high = new_low = 0
    changes = []  # (前日比%, ティッカー) 上昇率上位5銘柄を選ぶのに使う
    for symbol, q in quotes.items():
        vals = q["closes"]
        change = q["change_pct"]
        if change is None:  # Yahooが前日比を返さなかった場合は終値から計算する
            change = (vals[-1] - vals[-2]) / vals[-2] * 100
        changes.append((change, symbol))
        if change > 0:
            day_up += 1
        elif change < 0:
            day_down += 1
        if len(vals) >= 51:
            ma50 = sum(vals[-50:]) / 50
            if vals[-1] > ma50:
                above50 += 1
            else:
                below50 += 1
        if len(vals) >= 201:
            ma200 = sum(vals[-200:]) / 200
            if vals[-1] > ma200:
                above200 += 1
            else:
                below200 += 1
        if vals[-1] >= max(vals):
            new_high += 1
        if vals[-1] <= min(vals):
            new_low += 1

    trend_rows = [
        ratio_row("値上がり／値下がり銘柄数（前日比）", day_up, day_down),
        ratio_row("50日移動平均線超え", above50, below50),
        ratio_row("200日移動平均線超え", above200, below200),
        ratio_row("52週高値／安値更新", new_high, new_low, unit="銘柄"),
    ]
    print(f"  値上がり {day_up} / 値下がり {day_down}　"
          f"50日線超え {above50}/{above50 + below50}　"
          f"200日線超え {above200}/{above200 + below200}　"
          f"52週高値更新 {new_high}銘柄 / 安値更新 {new_low}銘柄")

    # --- ページ上部「TODAY'S FOCUS」用: 前日比の上昇率トップ5 ---
    changes.sort(reverse=True)
    focus = [{"symbol": s, "change_pct": round(c, 2)} for c, s in changes[:5]]
    print("  上昇率トップ5: " + "、".join(f"{f['symbol']} {f['change_pct']:+.2f}%" for f in focus))
    return breadth_score, breadth_detail, trend_rows, focus


def score_rotation():
    """景気敏感セクターとディフェンシブセクターの騰落率の差。取得失敗時はNone"""
    perf = []
    for symbol, label, kind in SECTORS:
        try:
            closes, _, latest, change_1d = fetch_series(symbol, rng="1y")
            ret_1m = (latest - closes[-22]) / closes[-22] * 100
            ret_3m = (latest - closes[-64]) / closes[-64] * 100
        except Exception as e:  # noqa: BLE001
            print(f"  セクター{label}の取得に失敗しました: {e}")
            continue
        perf.append({
            "symbol": symbol, "label": label, "kind": kind,
            "change_1d_pct": round(change_1d, 2) if change_1d is not None else None,
            "return_1m_pct": round(ret_1m, 2),
            "return_3m_pct": round(ret_3m, 2),
        })

    cyc = [p for p in perf if p["kind"] == "cyclical"]
    dfn = [p for p in perf if p["kind"] == "defensive"]
    if not cyc or not dfn:
        print("循環物色の算出に失敗しました(この項目はスキップします)。")
        return None, None, []

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
    # セクター別パフォーマンス欄用。1日の変化率が大きい順に並べる
    sectors = sorted(
        [{"symbol": p["symbol"], "label": p["label"],
          "change_1d_pct": p["change_1d_pct"], "change_1m_pct": p["return_1m_pct"]}
         for p in perf],
        key=lambda p: -(p["change_1d_pct"] if p["change_1d_pct"] is not None else -99),
    )
    score = round(scale((spread_1m + spread_3m) / 2, -8, 8), 1)
    return score, detail, sectors


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
        sp_closes, sp_volumes, sp_latest, _ = fetch_series("%5EGSPC")
        vix_closes, _, vix_latest, _ = fetch_series("%5EVIX")
        _, _, y10, _ = fetch_series("%5ETNX")
        _, _, y3m, _ = fetch_series("%5EIRX")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, KeyError, IndexError) as e:
        print(f"取得に失敗しました: {e}")
        if OUT_PATH.exists():
            print(f"既存の {OUT_PATH.name} をそのまま残します。サイトは前回の値を表示します。")
        raise SystemExit(1)

    trend, trend_detail = score_trend(sp_closes, sp_latest)
    vol_trend, vol_trend_detail, vol_trend_row = score_volume_trend(sp_closes, sp_volumes)
    breadth, breadth_detail, constituent_rows, focus = analyze_constituents()
    rotation, rotation_detail, sectors = score_rotation()
    volatility, vol_detail = score_volatility(vix_closes, vix_latest)
    rates, rates_detail = score_rates(y10, y3m)

    candidates = [
        ("trend", "トレンド", trend, trend_detail,
         "S&P500の50日・200日移動平均からの乖離"),
        ("volume_trend", "出来高を伴ったトレンド", vol_trend, vol_trend_detail,
         "S&P500の25日「出来高加重の日次騰落率」"),
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

    # 「市場のトレンド」欄は、出来高の行を先頭に、構成銘柄から作った行を続ける
    trend_rows = ([vol_trend_row] if vol_trend_row else []) + constituent_rows

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
        "trend_rows": trend_rows,
        "sectors": sectors,
        "focus": focus,
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
    print(f"  市場のトレンド欄: {len(trend_rows)}項目 ／ セクター欄: {len(sectors)}セクター"
          f" ／ 注目銘柄: {len(focus)}銘柄")


if __name__ == "__main__":
    main()
