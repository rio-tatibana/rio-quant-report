function doSearch() {
  const input = document.getElementById('navSearchInput');
  const result = document.getElementById('navSearchResult');
  const q = input.value.trim().toUpperCase();
  result.classList.add('open');
  if (!q) {
    result.textContent = '銘柄コードを入力してください。';
    return;
  }
  result.textContent = `「${q}」の分析ページは、データ連携後にここから表示できるようになります。`;
}

document.addEventListener('click', (e) => {
  const wrap = document.querySelector('.nav-search');
  const result = document.getElementById('navSearchResult');
  if (wrap && !wrap.contains(e.target)) result.classList.remove('open');
});

const navToggle = document.getElementById('navToggle');
const navLinks = document.querySelector('.nav nav');
if (navToggle && navLinks) {
  const closeNav = () => {
    navLinks.classList.remove('open');
    navToggle.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  };
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.classList.toggle('open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  navLinks.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeNav));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav')) closeNav();
  });
}

let stockData = {};

function scoreBand(score) {
  if (score >= 70) return 'strong';
  if (score >= 40) return 'mid';
  return 'weak';
}

function renderTable(data, sortBy) {
  const body = document.getElementById('stocks-table-body');
  if (!body) return;
  body.innerHTML = '';

  // データをソート可能な配列に変換
  const items = Object.entries(data);

  // ソート処理（sub_scores: growth / profitability / momentum / value）
  items.sort((a, b) => {
    const infoA = a[1];
    const infoB = b[1];
    if (sortBy === 'growth') {
      return infoB.sub_scores.growth - infoA.sub_scores.growth;
    } else if (sortBy === 'value') {
      return infoB.sub_scores.value - infoA.sub_scores.value;
    } else if (sortBy === 'momentum') {
      return infoB.sub_scores.momentum - infoA.sub_scores.momentum;
    } else {
      // 総合 (デフォルト): クオンツスコアの降順
      return infoB.quant_score - infoA.quant_score;
    }
  });

  // ランキング行を描画（赤=上昇／青=下落）
  items.forEach(([ticker, info], i) => {
    const row = document.createElement('div');
    row.className = 'rank-row';

    const retClass = info.ret_1d >= 0 ? 'up' : 'down';
    const distClass = info.dist_high_52w >= 0 ? 'up' : 'down';
    const scoreClass = scoreBand(info.quant_score);

    row.innerHTML = `
      <span class="rank-num">${i + 1}</span>
      <div class="name-cell"><span class="ticker">${ticker}</span><span class="company">${info.name || ''}</span></div>
      <span class="quant-score ${scoreClass}">${info.quant_score.toFixed(1)}</span>
      <span>${info.price.toFixed(2)}</span>
      <span class="${retClass}">${info.ret_1d >= 0 ? '+' : ''}${info.ret_1d.toFixed(2)}%</span>
      <span>${info.ma50.toFixed(2)}</span>
      <span class="${distClass}">${info.dist_high_52w >= 0 ? '+' : ''}${info.dist_high_52w.toFixed(2)}%</span>
      <span>${info.vol_20d.toFixed(2)}%</span>
    `;
    body.appendChild(row);
  });
}

document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');

  const tabName = b.textContent.trim();
  let sortBy = 'general';
  if (tabName === '成長') sortBy = 'growth';
  else if (tabName === '割安') sortBy = 'value';
  else if (tabName === 'モメンタム') sortBy = 'momentum';

  renderTable(stockData, sortBy);
}));

// ===== CNN Fear & Greed Index（市場シグナル） =====

// 基準日時を「2026年8月29日」の形にする（CNNはUTC、表示は日本時間）
function fmtAsOf(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function renderFearGreed(data) {
  const panel = document.getElementById('fngPanel');
  const grid = document.getElementById('fngSignals');
  if (!panel || !grid) return;

  const prev = [
    ['前日', data.previous_close],
    ['1週間前', data.previous_1_week],
    ['1ヶ月前', data.previous_1_month],
    ['1年前', data.previous_1_year],
  ];

  panel.innerHTML = `
    <div class="fng-main">
      <div class="fng-score ${data.band}">
        <span class="val">${data.score}</span>
        <span class="max">/ 100</span>
      </div>
      <div class="fng-summary">
        <span class="fng-rating ${data.band}">${data.rating_ja}</span>
        <p>CNNが7つの指標から算出する、市場心理の指数です。0に近いほど「恐怖（弱気）」、100に近いほど「強欲（強気）」を表します。</p>
        <div class="fng-history">
          ${prev.map(([label, v]) => `<div><span>${label}</span><b class="${bandOf(v)}">${v}</b></div>`).join('')}
        </div>
        <small class="fng-asof">${fmtAsOf(data.as_of)}時点</small>
      </div>
    </div>
  `;

  grid.innerHTML = data.indicators.map((ind) => `
    <div class="signal">
      <span>${ind.label_ja}</span>
      <strong class="${ind.band}">${ind.rating_ja}</strong>
      <div class="meter"><i class="${ind.band}" style="width:${ind.score}%"></i></div>
      <small>${ind.score} / 100　${ind.note_ja}</small>
      ${rawLine(ind)}
    </div>
  `).join('');
}

// VIX・プット/コール比率の「実測値」を、スコアの下に小さく添える
function rawLine(ind) {
  if (!ind.raw) return '';
  if (ind.key === 'market_volatility_vix') {
    const r = ind.raw;
    const diff = r.previous_close != null ? r.value - r.previous_close : null;
    const diffTxt = diff == null ? '' : `　（前日比 ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}）`;
    return `<small class="fng-raw">実測値：VIX ${r.value}${diffTxt}</small>`;
  }
  if (ind.key === 'put_call_options') {
    const r = ind.raw;
    const eq = r.equity_ratio != null ? `　（個別株のみ：${r.equity_ratio}）` : '';
    return `<small class="fng-raw">実測値：${r.source} ${r.ratio}${eq}（${r.as_of}）</small>`;
  }
  return '';
}

// スコアから fear / neutral / greed を判定（過去値の色分け用）
function bandOf(score) {
  if (score < 45) return 'fear';
  if (score > 55) return 'greed';
  return 'neutral';
}

async function loadFearGreed() {
  const panel = document.getElementById('fngPanel');
  if (!panel) return; // 市場シグナル欄が無いページでは何もしない
  try {
    const res = await fetch('data/fear_greed.json');
    if (!res.ok) throw new Error('Network response was not ok');
    renderFearGreed(await res.json());
  } catch (err) {
    console.error('Error loading fear & greed data:', err);
    panel.innerHTML = '<p style="padding:20px;color:var(--text-tertiary)">市場シグナルのデータを読み込めませんでした。</p>';
  }
}

document.addEventListener('DOMContentLoaded', loadFearGreed);

// ===== 本日のマーケット(主要指数) =====

function renderMarketIndices(data) {
  const grid = document.getElementById('marketIndices');
  const note = document.getElementById('marketIndicesNote');
  if (!grid) return;

  grid.innerHTML = data.indices.map((idx) => {
    const isUp = idx.change_pct >= 0;
    const cls = isUp ? 'up' : 'down';
    const arrow = isUp ? '▲' : '▼';
    const sign = isUp ? '+' : '';
    return `
      <div class="index-card">
        <span class="idx-name">${idx.label}</span>
        <span class="idx-value">${idx.value}</span>
        <span class="idx-change ${cls}">${arrow} ${sign}${idx.change_pct.toFixed(2)}%</span>
      </div>
    `;
  }).join('');

  if (note) {
    const d = new Date(data.generated_at);
    const asOf = isNaN(d) ? '' : `　${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}時点`;
    note.textContent = `出典：${data.source_name}${asOf}`;
  }
}

async function loadMarketIndices() {
  const grid = document.getElementById('marketIndices');
  if (!grid) return; // 本日のマーケット欄が無いページでは何もしない
  try {
    const res = await fetch('data/market_indices.json');
    if (!res.ok) throw new Error('Network response was not ok');
    renderMarketIndices(await res.json());
  } catch (err) {
    console.error('Error loading market indices data:', err);
    grid.innerHTML = '<p style="padding:20px;color:var(--text-tertiary)">マーケットデータを読み込めませんでした。</p>';
  }
}

document.addEventListener('DOMContentLoaded', loadMarketIndices);

// ===== マーケットレジーム／マーケットスコア =====

// 総合スコアに応じた配色。0=赤 / 50=黄（アンバー） / 100=緑 の3点を基準に、
// 途中のスコアは色をなめらかにつないで決める。
// HSL＝色相(h)・彩度(s)・明度(l)で色を表す方式で、この3つを別々に補間すると
// 「赤→橙→黄→黄緑→緑」と自然に変化する（RGBで補間すると途中が濁ってしまう）。
// 3点の値は、サイトの配色 --red-500 / --amber-500 / --green-500 をHSLに直したもの。
const SCORE_COLOR_STOPS = [
  { at: 0, h: 0, s: 64, l: 55 },     // --red-500   #d64545
  { at: 50, h: 38, s: 70, l: 51 },   // --amber-500 #d99a2b
  { at: 70, h: 75, s: 55, l: 42 },   // 黄緑。ここだけ彩度を落として原色っぽさを抑える
  { at: 100, h: 150, s: 72, l: 36 }, // --green-500 #1a9e5c
];

function scoreColor(score) {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  const stops = SCORE_COLOR_STOPS;
  // スコアが入る区間を探し、その両端の色を混ぜる
  let i = 0;
  while (i < stops.length - 2 && v > stops[i + 1].at) i += 1;
  const a = stops[i];
  const b = stops[i + 1];
  const t = (v - a.at) / (b.at - a.at);
  const h = Math.round(a.h + (b.h - a.h) * t);
  const s = Math.round(a.s + (b.s - a.s) * t);
  const l = Math.round(a.l + (b.l - a.l) * t);
  return {
    main: `hsl(${h},${s}%,${l}%)`,               // 点・ゲージの輪の色
    bg: `hsl(${h},${Math.round(s * 0.72)}%,93%)`, // バッジの背景（薄い色）
    text: `hsl(${h},${s}%,30%)`,                  // 文字の色（濃い色）
  };
}

// detailの数値を「10年債4.72% − 3ヶ月債3.73% ＝ +0.99%」のような補足文にする
function regimeDetailText(f) {
  const d = f.detail || {};
  const pct = (v) => `${v >= 0 ? '+' : ''}${v}%`;
  const pt = (v) => `${v >= 0 ? '+' : ''}${v}pt`;

  if (f.key === 'trend') return `50日線 ${pct(d.ma50_dev_pct)}／200日線 ${pct(d.ma200_dev_pct)}`;

  if (f.key === 'volume_trend') {
    // 加重値が単純平均より高い＝上昇した日のほうに出来高が寄っている、という読み方
    const backed = d.volume_backed ? '上昇日に出来高が集まっている' : '下落日に出来高が集まっている';
    return `出来高加重の${d.window_days}日騰落率 ${pct(d.weighted_return_pct)}／単純平均 ${pct(d.simple_return_pct)}　※${backed}`;
  }

  if (f.key === 'breadth') {
    let s = `騰落レシオ ${d.ad_ratio}%（S&P500 ${d.universe}銘柄の25日集計）`;
    if (d.overbought) s += '　※120%超は買われすぎのサイン';
    if (d.oversold) s += '　※70%未満は売られすぎのサイン';
    return s;
  }

  if (f.key === 'rotation') {
    const top = (d.top || []).map((s) => `${s.label} ${pct(s.return_1m_pct)}`).join('、');
    return `景気敏感−ディフェンシブ 1ヶ月 ${pt(d.spread_1m_pt)}／3ヶ月 ${pt(d.spread_3m_pt)}　上位：${top}`;
  }

  if (f.key === 'volatility') {
    let s = `VIX ${d.vix}（過去1年で下位${d.percentile_1y}%）`;
    if (d.complacency) s += '　※低すぎるVIXは楽観の行き過ぎのサイン';
    return s;
  }

  if (f.key === 'rates') return `10年債 ${d.yield_10y}% − 3ヶ月債 ${d.yield_3m}% ＝ ${pct(d.spread)}`;
  return '';
}

function renderMarketRegime(data) {
  const badge = document.getElementById('regimeBadge');
  const factors = document.getElementById('regimeFactors');
  const scorePanel = document.getElementById('regimeScore');
  const note = document.getElementById('regimeNote');
  if (!badge || !factors || !scorePanel) return;

  // バッジも下のゲージも、同じ総合スコアから作った同じ色を使う
  const st = scoreColor(data.total_score);
  badge.innerHTML = `
    <div class="regime-badge" style="background:${st.bg}">
      <span class="dot" style="background:${st.main}"></span>
      <span style="color:${st.text}">${data.regime}（${data.regime_ja}）</span>
    </div>
  `;

  factors.innerHTML = data.factors.map((f) => `
    <div class="score-bar-row">
      <div class="score-bar-head"><span>${f.label}</span><b>${f.score}</b></div>
      <div class="score-bar-track"><div class="score-bar-fill ${f.band}" style="width:${f.score}%"></div></div>
      <small style="display:block;margin-top:4px;color:var(--text-tertiary)">${regimeDetailText(f)}</small>
    </div>
  `).join('');

  const deg = (data.total_score / 100) * 360;
  scorePanel.innerHTML = `
    <div class="score-gauge" style="background:conic-gradient(${st.main} ${deg}deg, var(--gray-200) ${deg}deg)">
      <div class="score-gauge-inner">
        <span class="val">${data.total_score}</span>
        <span class="max">/ 100</span>
        <span class="status" style="color:${st.text}">${data.regime}</span>
      </div>
    </div>
    <div style="flex:1">
      <p style="margin:0 0 12px;color:var(--text-secondary)">下記${data.factors.length}項目のスコア（各0〜100）を平均した総合点です。60以上でリスクオン、40未満でリスクオフと判定しています。</p>
      <ul class="factor-list">
        ${data.factors.map((f) => `<li>${f.label}：${f.score}（${f.note}）</li>`).join('')}
      </ul>
    </div>
  `;

  if (note) {
    note.textContent = `出典：${data.source_name}${asOfText(data.generated_at)}　※スコアへの換算方法は当サイト独自の目安であり、投資助言ではありません。CNN Fear & Greed Index とは算出方法が異なるため、数値は一致しません。`;
  }
}

// ===== ページ上部の TODAY'S FOCUS（S&P500の上昇率トップ5） =====

function renderFocus(data) {
  const box = document.getElementById('tickerFocus');
  if (!box) return;

  const focus = data.focus || [];
  if (!focus.length) {
    box.innerHTML = '';
    return;
  }

  box.innerHTML = focus.map((f) => {
    // 全銘柄が下落した日でも正しく見えるよう、マイナスのときは色を青にする
    const color = f.change_pct >= 0 ? '' : 'style="color:var(--down)"';
    const sign = f.change_pct >= 0 ? '+' : '−';
    return `<span>${f.symbol} <b ${color}>${sign}${Math.abs(f.change_pct).toFixed(2)}%</b></span>`;
  }).join('');
}

// ===== 市場のトレンド =====

// 「値上がり54% / 値下がり46%」のような左右2色のバーを並べる
function renderMarketTrend(data) {
  const box = document.getElementById('marketTrend');
  const note = document.getElementById('marketTrendNote');
  if (!box) return;

  const rows = data.trend_rows || [];
  if (!rows.length) {
    box.innerHTML = '<p style="color:var(--text-tertiary)">市場のトレンドのデータを取得できませんでした。</p>';
    return;
  }

  box.innerHTML = rows.map((r) => `
    <div class="breadth-row">
      <span class="breadth-label">${r.label}</span>
      <div class="breadth-track">
        <div class="pos" style="width:${r.pos_pct}%"></div>
        <div class="neg" style="width:${(100 - r.pos_pct).toFixed(1)}%"></div>
      </div>
      <span class="breadth-value">${r.value}</span>
    </div>
  `).join('');

  if (note) {
    const breadth = (data.factors || []).find((f) => f.key === 'breadth');
    const universe = breadth && breadth.detail ? breadth.detail.universe : null;
    const target = universe ? `S&P500の全${universe}銘柄` : 'S&P500の構成銘柄';
    note.textContent = `出典：${data.source_name}${asOfText(data.generated_at)}　※${target}と、S&P500指数の出来高から算出しています。赤が強気側、青が弱気側です。`;
  }
}

// ===== セクター別パフォーマンス =====

// 赤＝上昇 / 青＝下落。±2%で最も濃くなるよう透明度を決める
function sectorTileStyle(v) {
  const alpha = Math.min(Math.abs(v) / 2, 1) * 0.46 + 0.08;
  const rgb = v >= 0 ? '214,69,69' : '47,111,237';
  const color = alpha > 0.4 ? '#fff' : 'var(--text-primary)';
  return `background:rgba(${rgb},${alpha.toFixed(2)});color:${color}`;
}

function renderSectors(data) {
  const grid = document.getElementById('sectorGrid');
  const note = document.getElementById('sectorNote');
  if (!grid) return;

  const sectors = data.sectors || [];
  if (!sectors.length) {
    grid.innerHTML = '<p style="color:var(--text-tertiary)">セクターのデータを取得できませんでした。</p>';
    return;
  }

  // マイナス記号は見やすさのため全角のマイナス（−）にそろえる
  const fmt = (v, digits) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(digits) + '%';

  grid.innerHTML = sectors.map((s) => {
    const day = s.change_1d_pct;
    return `
      <div class="sector-tile" style="${sectorTileStyle(day == null ? 0 : day)}">
        <span class="name">${s.label}</span>
        <span class="change">${day == null ? '—' : fmt(day, 2)}</span>
        <small style="font:var(--text-body-sm);opacity:.8">1ヶ月 ${fmt(s.change_1m_pct, 1)}</small>
      </div>
    `;
  }).join('');

  if (note) {
    note.textContent = `出典：${data.source_name}（SPDRセクターETF）${asOfText(data.generated_at)}　※大きい数字が前日比、小さい数字が1ヶ月の騰落率です。`;
  }
}

// 「　2026年8月31日時点」のような日付の補足文を作る（取得できないときは空文字）
function asOfText(generatedAt) {
  const d = new Date(generatedAt);
  return isNaN(d) ? '' : `　${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日時点`;
}

async function loadMarketRegime() {
  const factors = document.getElementById('regimeFactors');
  if (!factors) return; // マーケットレジーム欄が無いページでは何もしない
  try {
    const res = await fetch('data/market_regime.json');
    if (!res.ok) throw new Error('Network response was not ok');
    // 1つのJSONで「TODAY'S FOCUS」「マーケットレジーム」「市場のトレンド」
    // 「セクター別パフォーマンス」の4か所をまかなう
    const data = await res.json();
    renderFocus(data);
    renderMarketRegime(data);
    renderMarketTrend(data);
    renderSectors(data);
  } catch (err) {
    console.error('Error loading market regime data:', err);
    factors.innerHTML = '<p style="padding:20px;color:var(--text-tertiary)">マーケットレジームのデータを読み込めませんでした。</p>';
    const box = document.getElementById('marketTrend');
    if (box) box.innerHTML = '<p style="color:var(--text-tertiary)">市場のトレンドのデータを読み込めませんでした。</p>';
    const grid = document.getElementById('sectorGrid');
    if (grid) grid.innerHTML = '<p style="color:var(--text-tertiary)">セクターのデータを読み込めませんでした。</p>';
  }
}

document.addEventListener('DOMContentLoaded', loadMarketRegime);

document.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('stocks-table-body')) return; // ランキング表が無いページ(okawa-report.html等)では何もしない

  try {
    const response = await fetch('data/stocks.json');
    if (!response.ok) throw new Error('Network response was not ok');
    stockData = await response.json();
    renderTable(stockData, 'general');
  } catch (error) {
    console.error('Error loading stock data:', error);
    document.getElementById('stocks-table-body').innerHTML = '<p style="padding:20px;color:var(--text-inverse-secondary)">データ読み込みエラー</p>';
  }
});
