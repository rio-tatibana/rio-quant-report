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
    return `<small class="fng-raw">実測値：${r.underlying_name}のPut/Call出来高比率 ${r.ratio}（${r.as_of}）</small>`;
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
