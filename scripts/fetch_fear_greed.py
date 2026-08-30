# -*- coding: utf-8 -*-
"""
CNN Business の Fear & Greed Index を取得し、
サイト表示用の data/fear_greed.json を書き出すスクリプト。

使い方:
  python scripts/fetch_fear_greed.py

出力:
  data/fear_greed.json  (総合スコア + 7つの構成指標)

注意:
  CNNが公式に公開しているAPIではなく、CNNのページが内部的に使っている
  エンドポイントから取得しています。そのため、CNN側の都合で予告なく
  使えなくなる可能性があります。取得できなかった場合は既存の
  data/fear_greed.json をそのまま残すので、サイトは前回の値を表示し続けます。

このスクリプトは git操作(add/commit/push)を一切行いません。
生成物を確認してから、手動でコミット・pushしてください。
"""
import datetime
import json
import pathlib
import urllib.error
import urllib.request

BASE = pathlib.Path(__file__).resolve().parent.parent  # rio_quant_homepage/
OUT_PATH = BASE / "data" / "fear_greed.json"

SOURCE_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
SOURCE_PAGE = "https://edition.cnn.com/markets/fear-and-greed"

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


def build_payload(raw):
    """CNNの生JSONから、サイトで使う項目だけを取り出す"""
    fg = raw["fear_and_greed"]

    indicators = []
    for key, label_ja, note_ja in INDICATORS:
        item = raw.get(key)
        if not item:
            continue  # CNN側の項目名が変わった場合はスキップして残りを表示する
        entry = pack_score(item.get("rating"), item.get("score"))
        entry.update({"key": key, "label_ja": label_ja, "note_ja": note_ja})
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


def main():
    try:
        raw = fetch_raw()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        # 取得に失敗しても既存のJSONは消さない(サイトは前回の値を表示し続ける)
        print(f"取得に失敗しました: {e}")
        if OUT_PATH.exists():
            print(f"既存の {OUT_PATH.name} をそのまま残します。サイトは前回の値を表示します。")
        raise SystemExit(1)

    payload = build_payload(raw)

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
