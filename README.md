# rioの勝手にクオンツ分析

米国個別株のクオンツ分析メディア。GitHub Pagesで公開している静的サイトで、
株価・指標データは毎日自動で更新されます。

- 公開URL: https://rio-tatibana.github.io/rio-quant-report/
- リポジトリ: `rio-tatibana/rio-quant-report`

## ページ構成

| ファイル | 内容 |
|---|---|
| `index.html` | トップページ（マーケット概況・セクター別パフォーマンス・市場シグナル・銘柄ランキング・分析手法・サイトについて） |
| `daily-report.html` | デイリーレポート（値動き上位5銘柄） |
| `minervini-report.html` | トレンドテンプレート診断（ミネルヴィニの条件による銘柄診断） |
| `golden-cross-report.html` | ゴールデンクロス銘柄スクリーニング |

共通ファイル: `style.css`（デザイン）、`script.js`（トップページの動作）
ページ専用: `minervini-report.js`、`golden-cross-report.js`

## データ

画面に表示される数値は、`data/` 配下のJSONファイルをJavaScriptから非同期で読み込んでいます。

| ファイル | 内容 |
|---|---|
| `data/stocks.json` | 銘柄の株価データ |
| `data/market_indices.json` | 主要株価指数 |
| `data/market_regime.json` | マーケットレジーム（騰落レシオ・循環物色など） |
| `data/fear_greed.json` | CNN Fear & Greed Index（出典を明記のうえ引用） |
| `data/minervini_report.json` | トレンドテンプレート診断の結果 |
| `data/golden_cross/` | ゴールデンクロス銘柄（`YYYYMMDD.json` と `index.json`） |
| `data/portfolio.json` | ポートフォリオ |

## データ更新スクリプト

`scripts/` 配下のPythonスクリプトが、上記JSONを生成・更新します。

- `fetch_market_indices.py` — 主要株価指数を取得
- `fetch_market_regime.py` — マーケットレジームを算出
- `fetch_fear_greed.py` — Fear & Greed Index を取得
- `fetch_minervini_report.py` — トレンドテンプレート診断を実行
- `publish_golden_cross_report.py` — ゴールデンクロス銘柄を抽出して公開

## 自動更新の仕組み

`E:\rio-work\SNSdata\scripts\run_daily_pipeline.ps1` を Windowsタスクスケジューラから
無人実行しています。デイリーレポートの生成から `git commit` → `git push origin main` まで
自動で行われます。

このリポジトリに限り、上記の自動pushは事前確認なしで実行してよいルールになっています。
詳細は `CLAUDE.md` を参照してください。

## ローカルでの確認方法

ブラウザのCORS制限（ファイルを直接開くとJSONを読み込めない制約）を避けるため、
HTMLファイルを直接ダブルクリックせず、Python簡易サーバー経由で開きます。

1. `e:\rio-work\SNSdata\` でターミナルを開く
2. サーバーを起動する
   ```bash
   python -m http.server 8000
   ```
3. ブラウザで以下にアクセスする
   ```text
   http://localhost:8000/rio_quant_homepage/
   ```
4. 確認が終わったら、ターミナルで `Ctrl + C` を押してサーバーを停止する

## 今後追加したい機能

1. 個別銘柄ページ（例：NVDA）
2. マクロ経済ページ（トップのナビに「準備中」として枠だけ用意済み）
3. 決算・ニュース記事
4. 広告掲載エリア

## 免責

本サイトは個人による投資情報・分析サイトです。特定銘柄の売買を推奨するものではありません。
投資判断はご自身の責任でお願いします。
