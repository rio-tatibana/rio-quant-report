function scoreBandClass(score) {
  if (score >= 70) return 'strong';
  if (score >= 40) return 'mid';
  return 'weak';
}

function renderOkawaGrid(data, filterBadge) {
  const grid = document.getElementById('okawaGrid');
  const countEl = document.getElementById('okawaCount');
  if (!grid) return;

  let items = Object.entries(data);
  if (filterBadge && filterBadge !== 'all') {
    items = items.filter(([, info]) => info.okawa_analysis.badge === filterBadge);
  }
  items.sort((a, b) => b[1].okawa_analysis.score - a[1].okawa_analysis.score);

  countEl.textContent = `${items.length}銘柄を表示中（全32銘柄）`;
  grid.innerHTML = '';

  items.forEach(([ticker, info]) => {
    const oa = info.okawa_analysis;
    const scoreClass = oa.badge === 'neutral' ? 'neutral' : scoreBandClass(oa.score);
    const card = document.createElement('div');
    card.className = 'okawa-card';
    card.innerHTML = `
      <div class="okawa-card-head">
        <div class="name-cell">
          <span class="ticker">${ticker}</span>
          <span class="company">${info.name || ''}</span>
        </div>
        <div class="okawa-score ${scoreClass}">${oa.score.toFixed(1)}<small>大川式スコア</small></div>
      </div>
      <span class="okawa-badge ${oa.badge}">${oa.verdict}</span>
      <div class="okawa-metrics">
        <div class="okawa-metric"><span class="label">PER</span><span class="value">${info.pe_ttm != null ? info.pe_ttm.toFixed(1) + '倍' : '—'}</span></div>
        <div class="okawa-metric"><span class="label">PBR</span><span class="value">${info.pb_ratio != null ? info.pb_ratio.toFixed(1) + '倍' : '—'}</span></div>
        <div class="okawa-metric"><span class="label">ROE</span><span class="value">${info.roe != null ? info.roe.toFixed(1) + '%' : '—'}</span></div>
        <div class="okawa-metric"><span class="label">利益成長率</span><span class="value">${info.growth_cagr != null ? info.growth_cagr.toFixed(1) + '%' : '—'}</span></div>
      </div>
      <p class="okawa-comment">${oa.comment}</p>
    `;
    grid.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('okawaGrid');
  const filtersEl = document.getElementById('okawaFilters');
  if (!grid) return;

  let stockData = {};
  try {
    const response = await fetch('data/stocks.json');
    if (!response.ok) throw new Error('Network response was not ok');
    stockData = await response.json();
  } catch (error) {
    console.error('Error loading stock data:', error);
    grid.innerHTML = '<p style="padding:20px;color:var(--text-secondary)">データ読み込みエラー</p>';
    return;
  }

  const FILTERS = [
    { key: 'all', label: 'すべて' },
    { key: 'strong', label: '割安優良株' },
    { key: 'weak', label: '割安の罠に警戒' },
    { key: 'mid', label: '成長・高収益株／様子見' },
    { key: 'neutral', label: 'ETF等(対象外)' },
  ];
  FILTERS.forEach((f, i) => {
    const btn = document.createElement('button');
    btn.textContent = f.label;
    btn.dataset.filter = f.key;
    if (i === 0) btn.classList.add('active');
    btn.addEventListener('click', () => {
      filtersEl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderOkawaGrid(stockData, f.key);
    });
    filtersEl.appendChild(btn);
  });

  renderOkawaGrid(stockData, 'all');
});
