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
| `energy-peers-report.html` | エネルギー同業比較（VLO/XOM/CVX/MPC/PSX） |

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

## 日本株レポート（準備中）

`japan-report.html` は、指定した日本株を対象にした公開レポートです。GitHub Actionsの
`Publish Japan equity report` が平日18:17（日本時間）に実行される設計です。

- 株価・基本指標: yfinance経由のYahoo Finance（無料・APIキー不要）
  - TOPIXとグロース250は指数が配信されていないため、連動ETF（`1306.T` / `2516.T`）で代用
- 決算・重要開示: TDnetの公開情報（無料・APIキー不要）
  - 取得順は①やのしんWEB-API → ②`release.tdnet.info` 直接読み取り（`tdnet` ライブラリが自動で切替）。
    `source="scrape"` を明示指定すると一覧1ページ目（100件）しか読めず、決算集中日に取りこぼすため指定しない
  - XBRL本体は東証が古い開示を消した後も、JPXの永続URL（`www2.jpx.co.jp/disc/`）へ
    ライブラリが自動フォールバックして取得できる
- 監視条件: 週足13週単純移動平均線が26週線を上回る状態。金曜引け後に確定
- 通知: 更新があった場合だけ、ntfyへ日本株レポートの公開URLを送る
- 決算履歴: `data/japan/earnings_history.csv` に決算回ごとに1行で蓄積

決算短信のXBRLから、売上高・営業利益・経常利益・当期純利益・EPS・1株配当・通期予想を
数値として抽出します。外部のタイトルや文章をAIへの指示として扱わず、画面表示時もHTMLとして
解釈されないようエスケープします。TDnetの取得に失敗した日は成功扱いにせず、次回実行時に
最大7日分まで遡って確認します。

#### 数値を読むときの注意（2026-09-22 実データで確認）

- **配当は年間（通期合計）の値だけを記録する**。決算短信のXBRLは1株配当を支払時期別
  （中間・期末・年間）×実績／予想の2軸で収録しており、`tdnet` の `CK.FORECAST_DPS` は
  支払時期を区別せず期末配当（年間の約半分）を返す。そのため `annual_dps()` で
  年間値（`AnnualMember`）を軸指定して取得している
- **`dps` と `forecast_dps` は決算期が違う**。四半期決算短信には「前期の年間配当実績」と
  「今期の年間配当予想」が併記されるため、`dps`＝前期実績、`forecast_dps`＝今期予想になる。
  2つを増減として比較しないこと（例：ブリヂストンの実績230円と予想125円は別の期の値）
- **年間実績が空欄になる銘柄がある**。株式分割を挟むと中間・期末の単位が揃わないため、
  企業側が年間実績を記載しないことがある（例：ニトリHD）。この場合は欠損として扱う
- **経常利益はIFRS・米国基準の銘柄では空欄になる**。これらの会計基準に経常利益の概念が
  ないため（例：リクルートHD、ニトリHD）。欠損を0として扱わない
- **騰落率は配当・分配金の調整後価格で計算している**。終値（`Close`）のままだと配当落ちを
  下落として数えてしまい、TOPIX連動ETF（年2回分配）との比較が約1.9ポイントずれた。
  そのため13週騰落とTOPIX相対だけ `Adj Close` で算出し、終値・13週線・26週線・52週高値乖離は
  実際の株価（`Close`）を表示している
- **`as_of` は最終営業日**。祝日・週末は直近の確定値をそのまま公開し、同じ営業日で再実行しても
  内容を書き換えない（無意味な更新コミットとntfy通知を出さないため）。終値がまったく取得できない
  ときは既存の内容を残して中断する

### 最初に確認すること

1. ローカルで依存ライブラリを入れる場合は、プロジェクト内の `.venv` を作成してから
   `pip install -r requirements.txt` を実行する（グローバルPythonには入れない）。
2. GitHubのリポジトリ設定で、ntfyの**完全な送信URL**を `NTFY_URL` というActions Secretに登録する。
   Secretの値はコード・コミット・チャットに貼り付けない。
3. GitHub Actionsの `workflow_dispatch`（手動実行）で一度だけ生成し、公開内容を確認してから定時実行を有効にする。

無料の公開データでも、取得先の仕様変更・欠損・遅延があり得ます。レポートには取得元と更新時刻を表示し、データが取れないときは古い値で上書きしません。

## 免責

本サイトは個人による投資情報・分析サイトです。特定銘柄の売買を推奨するものではありません。
投資判断はご自身の責任でお願いします。
