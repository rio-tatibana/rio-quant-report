# -*- coding: utf-8 -*-
"""
マーク・ミネルヴィニ氏の「トレンドテンプレート」8条件で、
S&P500の全構成銘柄をふるいにかけて data/minervini_report.json を書き出すスクリプト。

使い方:
  python scripts/fetch_minervini_report.py

マーク・ミネルヴィニ(Mark Minervini)は米国投資選手権(U.S. Investing Championship)で
2度優勝したトレーダーで、著書『Trade Like a Stock Market Wizard』などで
「トレンドテンプレート」という8つの条件を公開しています。
上昇トレンドが始まっている銘柄だけを候補に残すためのふるいです。

8条件:
  1. 株価が150日移動平均線と200日移動平均線を上回っている
  2. 150日移動平均線が200日移動平均線を上回っている
  3. 200日移動平均線が少なくとも1ヶ月間、上向きである
  4. 50日移動平均線 > 150日移動平均線 > 200日移動平均線 の並びになっている
  5. 株価が50日移動平均線を上回っている
  6. 株価が52週安値より少なくとも30%高い
  7. 株価が52週高値から25%以内にある
  8. レラティブストレングス(相対力)が70以上

この8条件は株価データだけで判定できるため、公開されている条件をそのまま
実装しています(近似や省略はしていません)。

ただし2点だけ、原典と完全に同じにはできない部分があります:
  ・条件8のレラティブストレングスは、本来 Investor's Business Daily(IBD)社が
    独自に算出している「RS Rating(1〜99)」です。算出式は非公開のため、
    広く使われている近似(直近3ヶ月を重めに見た加重リターンの順位)で代用しています。
  ・IBDは米国の全上場銘柄の中で順位付けしますが、ここではS&P500の中での
    順位です。母集団が違うため、IBDの数字とは一致しません。

出力:
  data/minervini_report.json

注意:
  Yahoo FinanceもWikipediaも公式に公開されたAPIではないため、予告なく
  使えなくなる可能性があります。取得に失敗した場合は既存のJSONを残します。

このスクリプトは git操作(add/commit/push)を一切行いません。
生成物を確認してから、手動でコミット・pushしてください。
"""
import datetime
import json
import pathlib
import sys

# 同じフォルダの fetch_market_regime.py から、銘柄リストと株価の取得処理を借りる
# (同じ処理を2か所に書くと、片方だけ直して食い違うため)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from fetch_market_regime import fetch_many_quotes, fetch_sp500_rows  # noqa: E402

BASE = pathlib.Path(__file__).resolve().parent.parent  # rio_quant_homepage/
OUT_PATH = BASE / "data" / "minervini_report.json"
PORTFOLIO_PATH = BASE / "data" / "portfolio.json"

# 1年分の営業日はおよそ250日。これに満たない銘柄(上場から日が浅い等)は判定できない
MIN_BARS = 250

# 何条件以上を満たした銘柄をJSONに載せるか(全503銘柄を載せるとページが重くなるため)
MIN_PASSED_TO_LIST = 6

CRITERIA = [
    "株価が150日線と200日線を上回っている",
    "150日線が200日線を上回っている",
    "200日線が1ヶ月前より上向き",
    "50日線 > 150日線 > 200日線 の並び",
    "株価が50日線を上回っている",
    "株価が52週安値より30%以上高い",
    "株価が52週高値から25%以内",
    "レラティブストレングスが70以上",
]


def moving_average(values, days):
    return sum(values[-days:]) / days


def load_portfolio():
    """保有銘柄のティッカーと日本語名を読み込む。無ければ空で続行する"""
    try:
        with PORTFOLIO_PATH.open(encoding="utf-8") as f:
            items = json.load(f)
        return {it["ticker"]: it.get("name_ja") for it in items}
    except Exception as e:  # noqa: BLE001 - 無くても判定はできるので続行する
        print(f"保有銘柄リストを読めませんでした(保有マークなしで続行します): {e}")
        return {}


def relative_strength_ranks(quotes):
    """レラティブストレングス(相対力)を1〜99で順位付けする。

    IBDのRS Ratingは算出式が非公開なので、広く使われている近似
    「直近3ヶ月を重めに見た加重リターン」を使い、S&P500の中で順位付けする。
    """
    raw = {}
    for symbol, q in quotes.items():
        v = q["closes"]
        if len(v) < MIN_BARS:
            continue

        def ret(days):
            return (v[-1] - v[-days]) / v[-days] * 100

        # 直近3ヶ月に2倍の重みを置く(IBDの考え方に合わせた一般的な近似)
        raw[symbol] = 0.4 * ret(63) + 0.2 * ret(126) + 0.2 * ret(189) + 0.2 * ret(250)

    ordered = sorted(raw.items(), key=lambda kv: kv[1])
    total = len(ordered)
    return {s: round((i + 1) / total * 99, 1) for i, (s, _) in enumerate(ordered)}


def evaluate(values, rs):
    """1銘柄について8条件を判定し、(判定リスト, 補足数値) を返す"""
    price = values[-1]
    ma50 = moving_average(values, 50)
    ma150 = moving_average(values, 150)
    ma200 = moving_average(values, 200)
    # 1ヶ月(22営業日)前の時点での200日移動平均線
    ma200_month_ago = sum(values[-222:-22]) / 200
    low_52w = min(values[-250:])
    high_52w = max(values[-250:])

    checks = [
        price > ma150 and price > ma200,
        ma150 > ma200,
        ma200 > ma200_month_ago,
        ma50 > ma150 > ma200,
        price > ma50,
        price >= low_52w * 1.30,
        price >= high_52w * 0.75,
        rs >= 70,
    ]
    detail = {
        "price": round(price, 2),
        "rs": rs,
        "above_low_52w_pct": round((price - low_52w) / low_52w * 100, 1),
        "dist_high_52w_pct": round((price - high_52w) / high_52w * 100, 1),
        "ret_1y_pct": round((price - values[-250]) / values[-250] * 100, 1),
    }
    return checks, detail


def main():
    try:
        rows = fetch_sp500_rows()  # (ティッカー, セクター日本語名) の一覧
        symbols = sorted({symbol for symbol, _ in rows})
        sector_of = dict(rows)
        if len(symbols) < 100:
            raise ValueError(f"構成銘柄の取得数が少なすぎます({len(symbols)}件)")
        quotes = fetch_many_quotes(symbols, rng="1y")
        if len(quotes) < 100:
            raise ValueError(f"価格を取得できた銘柄が少なすぎます({len(quotes)}件)")
    except Exception as e:  # noqa: BLE001 - 取得できなければ既存ファイルを残して終了
        print(f"取得に失敗しました: {e}")
        if OUT_PATH.exists():
            print(f"既存の {OUT_PATH.name} をそのまま残します。サイトは前回の結果を表示します。")
        raise SystemExit(1)

    portfolio = load_portfolio()
    rs_ranks = relative_strength_ranks(quotes)

    stocks = []
    counts_per_criterion = [0] * len(CRITERIA)
    passed_histogram = [0] * (len(CRITERIA) + 1)  # 0条件〜8条件が何銘柄ずつか
    evaluated = 0
    evaluated_symbols = []  # セクター別集計の母数に使う

    for symbol, q in sorted(quotes.items()):
        values = q["closes"]
        if len(values) < MIN_BARS or symbol not in rs_ranks:
            continue  # 上場から日が浅く1年分のデータが無い銘柄は判定できない
        evaluated += 1
        evaluated_symbols.append(symbol)

        checks, detail = evaluate(values, rs_ranks[symbol])
        for i, ok in enumerate(checks):
            counts_per_criterion[i] += ok
        passed = sum(checks)
        passed_histogram[passed] += 1

        if passed < MIN_PASSED_TO_LIST:
            continue
        stocks.append({
            "symbol": symbol,
            "name": q.get("name") or symbol,
            "name_ja": portfolio.get(symbol),
            "sector": sector_of.get(symbol, "その他"),
            "held": symbol in portfolio,
            "passed": passed,
            "checks": checks,
            **detail,
        })

    # 条件を満たした数が多い順、同数ならレラティブストレングスが高い順
    stocks.sort(key=lambda s: (-s["passed"], -s["rs"]))

    # セクター別の集計(判定した銘柄数・掲載した銘柄数・8条件すべて満たした銘柄数)
    sector_stats = {}
    for symbol in evaluated_symbols:
        name = sector_of.get(symbol, "その他")
        sector_stats.setdefault(name, {"sector": name, "universe": 0, "listed": 0, "pass_all": 0})
        sector_stats[name]["universe"] += 1
    for s in stocks:
        row = sector_stats.setdefault(
            s["sector"], {"sector": s["sector"], "universe": 0, "listed": 0, "pass_all": 0}
        )
        row["listed"] += 1
        if s["passed"] == len(CRITERIA):
            row["pass_all"] += 1
    # 8条件すべて満たした割合が高いセクター順に並べる
    sectors = sorted(
        sector_stats.values(),
        key=lambda r: (-(r["pass_all"] / r["universe"] if r["universe"] else 0), -r["pass_all"]),
    )

    payload = {
        "criteria": CRITERIA,
        "universe": evaluated,
        "listed_from": MIN_PASSED_TO_LIST,
        "counts_per_criterion": counts_per_criterion,
        "passed_histogram": passed_histogram,
        "pass_all": passed_histogram[len(CRITERIA)],
        "stocks": stocks,
        "sectors": sectors,
        "source_name": "Yahoo Finance",
        "generated_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"書き出しました: {OUT_PATH}")
    print(f"  判定できた銘柄: {evaluated}")
    for label, n in zip(CRITERIA, counts_per_criterion):
        print(f"    {label:<28} {n:>3}銘柄 ({n / evaluated * 100:.0f}%)")
    print(f"  8条件すべて満たす: {payload['pass_all']}銘柄")
    print(f"  条件を満たした数の分布(0〜8条件): {passed_histogram}")
    print(f"  JSONに載せた銘柄({MIN_PASSED_TO_LIST}条件以上): {len(stocks)}")
    print("  セクター別(8条件すべて満たした数 / 判定した数):")
    for row in sectors:
        print(f"    {row['sector']:<12} {row['pass_all']:>3} / {row['universe']:>3}")
    held = [s["symbol"] for s in stocks if s["held"] and s["passed"] == len(CRITERIA)]
    print(f"  保有銘柄で8条件すべて満たす: {', '.join(held) if held else 'なし'}")


if __name__ == "__main__":
    main()
