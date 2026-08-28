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
