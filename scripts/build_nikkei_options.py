"""日経225オプション(建玉表CSV)を分析して、ホームページ用JSONを作るスクリプト。

使い方(rio_quant_homepage フォルダで):
    ..\\.venv\\Scripts\\python.exe scripts\\build_nikkei_options.py [CSVのパス] [限月YYYYMM] [基準日YYYY-MM-DD]

- 標準ライブラリだけで動く(追加インストール不要)
- 出力: data/nikkei_options/latest.json
- 注意: 建玉は「誰が買い・誰が売りか」を示さない。ここでの解釈はすべて仮説。
"""
import csv
import json
import math
import statistics
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = ROOT / "data" / "nikkei_options" / "2612_oi.csv"
OUT = ROOT / "data" / "nikkei_options" / "latest.json"


def num(text):
    """'2,369' → 2369.0 / '-' や空 → None"""
    t = (text or "").replace(",", "").replace("+", "").strip()
    if t in ("", "-"):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def ncdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def second_friday(year, month):
    d = date(year, month, 1)
    first_friday = 1 + (4 - d.weekday()) % 7
    return date(year, month, first_friday + 7)


def load(path):
    rows = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        next(reader)
        for r in reader:
            if len(r) < 25:
                continue
            k = num(r[12])
            if k is None:
                continue
            rows[int(k)] = {
                "k": int(k),
                "c_delta": num(r[0]), "c_oi": num(r[5]) or 0, "c_vol": num(r[6]) or 0,
                "c_iv": num(r[9]), "c_px": num(r[11]),
                "p_px": num(r[13]), "p_iv": num(r[15]),
                "p_vol": num(r[18]) or 0, "p_oi": num(r[19]) or 0,
            }
    return [rows[k] for k in sorted(rows)]


def main():
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    ym = sys.argv[2] if len(sys.argv) > 2 else "202612"
    asof = sys.argv[3] if len(sys.argv) > 3 else "2026-11-20"
    data = load(csv_path)
    expiry = second_friday(int(ym[:4]), int(ym[4:]))
    days = (expiry - datetime.strptime(asof, "%Y-%m-%d").date()).days
    T = days / 365

    # 1) 先物価格の推定: プット・コール・パリティ F = K + C - P(価格が両方ある・売買が活発な行使価格の中央値)
    est = [r["k"] + r["c_px"] - r["p_px"] for r in data
           if 52000 <= r["k"] <= 60000 and r["c_px"] and r["p_px"] and r["c_vol"] + r["p_vol"] >= 20]
    F = statistics.median(est)

    # 2) IVスマイル: 先物より下はプットIV、上はコールIV(流動性のある側)
    smile = {}
    for r in data:
        iv = r["p_iv"] if r["k"] < F else r["c_iv"]
        if iv and 40000 <= r["k"] <= 80000:
            smile[r["k"]] = iv
    ks = sorted(smile)

    def iv_at(x):
        if x <= ks[0]:
            return smile[ks[0]]
        if x >= ks[-1]:
            return smile[ks[-1]]
        for a, b in zip(ks, ks[1:]):
            if a <= x <= b:
                return smile[a] + (smile[b] - smile[a]) * (x - a) / (b - a)

    atm_iv = iv_at(F)
    sd = atm_iv / 100 * math.sqrt(T)
    move = F * sd
    lo1, hi1 = F - move, F + move

    # 3) 市場が織り込む確率(目安): P(満期の値 > K) ≒ N(d2)。スキューの傾き補正は省略
    def p_above(K):
        s = iv_at(K) / 100 * math.sqrt(T)
        return ncdf((math.log(F / K) - s * s / 2) / s)

    def p_between(a, b):
        return p_above(a) - p_above(b)

    grid = list(range(40000, 70001, 2500))
    prob_bins = []
    prob_bins.append({"label": f"〜{grid[0]:,}", "lo": 0, "hi": grid[0], "p": 1 - p_above(grid[0])})
    for a, b in zip(grid, grid[1:]):
        prob_bins.append({"label": f"{a:,}〜", "lo": a, "hi": b, "p": p_between(a, b)})
    prob_bins.append({"label": f"{grid[-1]:,}〜", "lo": grid[-1], "hi": 999999, "p": p_above(grid[-1])})

    # 4) 建玉の集計
    tot_c = sum(r["c_oi"] for r in data)
    tot_p = sum(r["p_oi"] for r in data)

    # 5) Max Pain: 満期の値Sごとに、買い手に支払われる合計(オプション売り手の損失)が最小になるS
    def payout(S):
        return sum(r["c_oi"] * max(S - r["k"], 0) + r["p_oi"] * max(r["k"] - S, 0) for r in data)

    pain = [{"s": s, "v": payout(s) / 1e6} for s in range(44000, 70001, 250)]
    max_pain = min(range(40000, 80001, 250), key=payout)

    # 6) 壁(OTM側の建玉が多い行使価格): 先物より上=コール、下=プットだけを見る
    otm_calls = sorted([r for r in data if r["k"] > F and r["k"] <= 70000], key=lambda r: -r["c_oi"])[:5]
    otm_puts = sorted([r for r in data if r["k"] < F and r["k"] >= 40000], key=lambda r: -r["p_oi"])[:5]
    call_wall = otm_calls[0]
    put_wall = otm_puts[0]
    # 先物より下の次の壁(コール壁と対称に、近い側から)
    near_calls = sorted([r for r in data if F < r["k"] <= 66000 and r["c_oi"] >= 3000], key=lambda r: r["k"])
    near_puts = sorted([r for r in data if 44000 <= r["k"] < F and r["p_oi"] >= 3000], key=lambda r: -r["k"])

    # 7) シナリオ(4つの価格帯。確率は上のN(d2)から計算)
    cw, pw = call_wall["k"], put_wall["k"]
    mid_lo = 54000
    bands = [
        ("up", f"{cw:,}円を上抜け", cw, 999999),
        ("range", f"{mid_lo:,}〜{cw:,}円のもみ合い", mid_lo, cw),
        ("dip", f"{pw:,}〜{mid_lo:,}円へ調整", pw, mid_lo),
        ("crash", f"{pw:,}円割れ", 0, pw),
    ]
    probs = {
        "up": p_above(cw),
        "range": p_between(mid_lo, cw),
        "dip": p_between(pw, mid_lo),
        "crash": 1 - p_above(pw),
    }

    def oi(k, side):
        for r in data:
            if r["k"] == k:
                return int(r[side])
        return 0

    c2 = next((r for r in near_calls if r["k"] > cw), None)
    c_next = [r for r in data if r["k"] > cw and r["c_oi"] >= 3000][:3]
    p_next = [r for r in data if r["k"] < pw and r["p_oi"] >= 3000][-3:]
    p_next.reverse()

    def fmt_list(rows, side):
        return "・".join(f"{r['k']:,}円({int(r[side]):,}枚)" for r in rows)

    scenarios = [
        {
            "id": "range", "tag": "メイン想定", "title": f"{mid_lo:,}〜{cw:,}円のもみ合い", "prob": probs["range"],
            "if": f"先物が{mid_lo:,}円〜{cw:,}円の間にとどまり、大きなニュースが出ない場合。",
            "then": f"{cw:,}円のコール建玉({oi(cw, 'c_oi'):,}枚)が上値の「蓋」、{pw:,}円のプット建玉({oi(pw, 'p_oi'):,}枚)が下値の「床」になりやすい。"
                    + (f"SQ({expiry.month}/{expiry.day})に向けて{max_pain:,}円付近(Max Pain)へ寄りやすい展開。" if abs(max_pain - F) <= move * 0.8
                       else f"Max Pain({max_pain:,}円)は現在の水準から遠く、引き寄せる力は弱い(後述)。")
                    + "時間の経過でオプションの価値が減り、IVは低下しやすい。",
            "watch": f"先物が{int(F):,}円前後で推移 / IVが低下 / 出来高が減る",
        },
        {
            "id": "up", "tag": "強気", "title": f"{cw:,}円を上抜け", "prob": probs["up"],
            "if": f"好材料(米株高・円安など)で先物が{cw:,}円を終値で明確に超えた場合。",
            "then": f"{cw:,}円のコールの売り手は、上がるほど先物を買ってヘッジする必要が出て(ガンマ・スクイーズ)、上昇が加速しやすい。"
                    f"次の目安は {fmt_list(c_next, 'c_oi')}。反対に、超えても出来高が伴わなければ「だまし」で{cw:,}円の内側へ戻りやすい。",
            "watch": f"{cw:,}円の上で2日続けて引ける / 出来高の増加 / コールのIV上昇",
        },
        {
            "id": "dip", "tag": "弱気(調整)", "title": f"{pw:,}〜{mid_lo:,}円へ調整", "prob": probs["dip"],
            "if": f"米株安や円高などで先物が{mid_lo:,}円を割り込み、ゆるやかに下げた場合。",
            "then": f"{pw:,}円まではプット建玉が厚い({oi(52000, 'p_oi'):,}枚@52,000円、{oi(pw, 'p_oi'):,}枚@{pw:,}円)ため、下げ足は鈍りやすい。"
                    f"ただしプットのIVが上がって下値の保険が高くなるため、反発してもコール側の戻りは重くなりやすい。",
            "watch": f"{mid_lo:,}円の回復失敗 / プットIVの上昇 / {pw:,}円手前での下げ止まり",
        },
        {
            "id": "crash", "tag": "急落", "title": f"{pw:,}円割れ", "prob": probs["crash"],
            "if": f"想定外のショックで先物が{pw:,}円を割り込んだ場合。",
            "then": f"{pw:,}円のプットの売り手が先物を売ってヘッジするため、下落が加速しやすい(ガンマ・ショート)。IV全体が急上昇し、値動きが荒くなる。"
                    f"次の目安は {fmt_list(p_next, 'p_oi')}。",
            "watch": f"{pw:,}円を終値で割る / IVの急上昇 / 先物の出来高急増",
        },
    ]

    out = {
        "asof": asof, "expiry": expiry.isoformat(), "days": days, "contract": ym,
        "forward": round(F), "forward_samples": [round(x) for x in est],
        "atm_iv": round(atm_iv, 1), "move": round(move), "lo1": round(lo1), "hi1": round(hi1),
        "call_oi": int(tot_c), "put_oi": int(tot_p), "pc_ratio": round(tot_p / tot_c, 2),
        "max_pain": max_pain, "call_wall": cw, "put_wall": pw,
        "otm_calls": [{"k": r["k"], "oi": int(r["c_oi"])} for r in otm_calls],
        "otm_puts": [{"k": r["k"], "oi": int(r["p_oi"])} for r in otm_puts],
        "strikes": [{"k": r["k"], "c_oi": int(r["c_oi"]), "p_oi": int(r["p_oi"]),
                     "c_vol": int(r["c_vol"]), "p_vol": int(r["p_vol"])}
                    for r in data if 44000 <= r["k"] <= 68000 and r["k"] % 500 == 0],
        "smile": [{"k": k, "iv": smile[k], "side": "put" if k < F else "call"}
                  for k in ks if 46000 <= k <= 66000 and k % 500 == 0],
        "pain": pain, "prob_bins": prob_bins,
        "p_gt": {str(k): round(p_above(k), 3) for k in (50000, 52500, 55000, 57500, 60000, 65000)},
        "scenarios": scenarios,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"出力: {OUT}")
    print(f"先物推定 {F:,.0f} / ATM IV {atm_iv:.1f}% / 1σ {lo1:,.0f}〜{hi1:,.0f} / MaxPain {max_pain:,} / P/C {tot_p/tot_c:.2f}")
    print("壁: コール", [(r['k'], int(r['c_oi'])) for r in otm_calls], "プット", [(r['k'], int(r['p_oi'])) for r in otm_puts])
    print("確率:", {k: round(v, 3) for k, v in probs.items()}, "合計", round(sum(probs.values()), 3))


if __name__ == "__main__":
    main()
