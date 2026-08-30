# -*- coding: utf-8 -*-
"""
moomoo-screener が生成した golden_cross_*.csv を読み取り、
rio_quant_homepage で公開するための日付別JSON(data/golden_cross/)に変換するスクリプト。

使い方:
  python scripts/publish_golden_cross_report.py
  python scripts/publish_golden_cross_report.py --source E:\\rio-work\\moomoo-screener

出力:
  data/golden_cross/{YYYYMMDD}.json  (その週の銘柄データ)
  data/golden_cross/index.json       (公開済みの日付一覧、アーカイブ選択用)

このスクリプトは git操作(add/commit/push)を一切行いません。
生成物を確認してから、手動でコミット・pushしてください。
"""
import argparse
import csv
import datetime
import json
import pathlib
import re

BASE = pathlib.Path(__file__).resolve().parent.parent  # rio_quant_homepage/
DATA_DIR = BASE / "data" / "golden_cross"

DATE_RE = re.compile(r"golden_cross_(\d{8})\.csv$")


def find_latest_csv(source_dir: pathlib.Path):
    """source_dir内の golden_cross_*.csv のうち、ファイル名の日付が最も新しいものを返す"""
    candidates = []
    for p in source_dir.glob("golden_cross_*.csv"):
        m = DATE_RE.search(p.name)
        if m:
            candidates.append((m.group(1), p))
    if not candidates:
        raise SystemExit(f"エラー: {source_dir} に golden_cross_*.csv が見つかりません。")
    candidates.sort(key=lambda t: t[0], reverse=True)
    return candidates[0]  # (date_str, path)


def load_total_candidates(csv_path: pathlib.Path):
    """CSVと同じ場所にあるメタ情報ファイル(*.meta.json)から判定対象数を読む"""
    meta_path = csv_path.with_name(csv_path.stem + ".meta.json")
    if meta_path.exists():
        try:
            with open(meta_path, encoding="utf-8") as f:
                return json.load(f)["total_candidates"]
        except (KeyError, ValueError):
            pass
    return None


def to_bool(s):
    return str(s).strip().lower() == "true"


def build_rows(csv_path: pathlib.Path):
    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = [
            {
                "code": r["code"],
                "name": r["name"],
                "sector": r["sector"],
                "market_val_usd": float(r["market_val_usd"]),
                "last_price": float(r["last_price"]),
                "ma50d": float(r["ma50d"]),
                "ma200d": float(r["ma200d"]),
                "crossed_within_20d": to_bool(r["crossed_within_20d"]),
                "cross_date": r["cross_date"],
                "golden_cross_now": to_bool(r["golden_cross_now"]),
                "is_52w_high": to_bool(r["is_52w_high"]),
            }
            for r in reader
        ]
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        default=r"E:\rio-work\moomoo-screener",
        help="moomoo-screenerの出力フォルダ(golden_cross_*.csvがある場所)",
    )
    args = parser.parse_args()
    source_dir = pathlib.Path(args.source)

    date_str, csv_path = find_latest_csv(source_dir)
    print(f"使用するCSV: {csv_path}")

    rows = build_rows(csv_path)
    total_candidates = load_total_candidates(csv_path)

    gc_count = len(rows)
    fresh_count = sum(1 for r in rows if r["crossed_within_20d"])
    high_count = sum(1 for r in rows if r["is_52w_high"])
    sectors = sorted({r["sector"] for r in rows})

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    date_json_path = DATA_DIR / f"{date_str}.json"
    payload = {
        "date": date_str,
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "total_candidates": total_candidates,
        "gc_count": gc_count,
        "fresh_count": fresh_count,
        "high_count": high_count,
        "sectors": sectors,
        "rows": rows,
    }
    date_json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"生成しました: {date_json_path}")

    index_path = DATA_DIR / "index.json"
    if index_path.exists():
        index = json.loads(index_path.read_text(encoding="utf-8"))
    else:
        index = []
    index = [e for e in index if e["date"] != date_str]
    index.append(
        {
            "date": date_str,
            "total_candidates": total_candidates,
            "gc_count": gc_count,
            "fresh_count": fresh_count,
            "high_count": high_count,
        }
    )
    index.sort(key=lambda e: e["date"], reverse=True)
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"更新しました: {index_path}(登録日付数: {len(index)})")

    print("\ngitの操作(add/commit/push)は行っていません。内容を確認してから手動で反映してください。")


if __name__ == "__main__":
    main()
