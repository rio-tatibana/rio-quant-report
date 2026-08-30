// ミネルヴィニのトレンドテンプレート診断ページ（minervini-report.html）の描画

let screenerData = null;
let activeFilter = 'all8'; // 初期表示は「8条件すべて満たす銘柄」

// 満たした条件数に応じた色分け（既存のスコアバーの色分けに合わせる）
function passedBandClass(passed, total) {
  if (passed === total) return 'strong';
  if (passed >= total - 2) return 'mid';
  return 'weak';
}

function renderSummary(data) {
  const box = document.getElementById('screenerSummary');
  if (!box) return;

  const rows = data.criteria.map((label, i) => {
    const n = data.counts_per_criterion[i];
    const pct = (n / data.universe) * 100;
    return `
      <div class="row">
        <span class="label">${i + 1}. ${label}</span>
        <span class="track"><i style="width:${pct.toFixed(1)}%"></i></span>
        <span class="num">${n}銘柄 ${pct.toFixed(0)}%</span>
      </div>
    `;
  }).join('');

  box.innerHTML = `
    <h3>S&amp;P500 ${data.universe}銘柄のうち、各条件を満たした数</h3>
    ${rows}
    <div class="row" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-subtle)">
      <span class="label" style="font-weight:700;color:var(--text-primary)">8条件すべてを満たす銘柄</span>
      <span class="num" style="width:auto;font:700 18px var(--font-mono);color:var(--score-strong)">${data.pass_all}銘柄</span>
    </div>
  `;
}

function renderFilters(data) {
  const box = document.getElementById('screenerFilters');
  if (!box) return;

  const total = data.criteria.length;
  const held = data.stocks.filter((s) => s.held).length;
  const counts = {
    all8: data.stocks.filter((s) => s.passed === total).length,
    p7: data.stocks.filter((s) => s.passed === total - 1).length,
    p6: data.stocks.filter((s) => s.passed === total - 2).length,
    held,
    all: data.stocks.length,
  };
  const buttons = [
    ['all8', `8条件すべて（${counts.all8}）`],
    ['p7', `7条件（${counts.p7}）`],
    ['p6', `6条件（${counts.p6}）`],
    ['held', `保有銘柄（${counts.held}）`],
    ['all', `すべて表示（${counts.all}）`],
  ];

  box.innerHTML = buttons
    .map(([key, label]) => `<button data-filter="${key}"${key === activeFilter ? ' class="active"' : ''}>${label}</button>`)
    .join('');

  box.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      box.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderGrid(data);
    });
  });
}

function renderGrid(data) {
  const grid = document.getElementById('screenerGrid');
  const countEl = document.getElementById('screenerCount');
  if (!grid) return;

  const total = data.criteria.length;
  let items = data.stocks;
  if (activeFilter === 'all8') items = items.filter((s) => s.passed === total);
  else if (activeFilter === 'p7') items = items.filter((s) => s.passed === total - 1);
  else if (activeFilter === 'p6') items = items.filter((s) => s.passed === total - 2);
  else if (activeFilter === 'held') items = items.filter((s) => s.held);

  countEl.textContent =
    `${items.length}銘柄を表示中（判定対象 S&P500 ${data.universe}銘柄のうち、`
    + `${data.listed_from}条件以上を満たした${data.stocks.length}銘柄を掲載）`;

  if (!items.length) {
    grid.innerHTML = '<p style="padding:20px;color:var(--text-tertiary)">該当する銘柄はありません。</p>';
    return;
  }

  const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;

  grid.innerHTML = items.map((s) => {
    const checks = data.criteria.map((label, i) => {
      const ok = s.checks[i];
      return `<li class="${ok ? 'ok' : 'ng'}"><span class="mark">${ok ? '✓' : '✕'}</span><span>${label}</span></li>`;
    }).join('');

    return `
      <div class="screener-card">
        <div class="screener-card-head">
          <div class="name-cell">
            <span class="ticker">${s.symbol}${s.held ? '<span class="screener-held">保有</span>' : ''}</span>
            <span class="company">${s.name_ja || s.name}</span>
          </div>
          <div class="screener-score ${passedBandClass(s.passed, data.criteria.length)}">
            ${s.passed}/${data.criteria.length}<small>条件クリア</small>
          </div>
        </div>
        <div class="screener-metrics">
          <div class="screener-metric"><span class="label">相対力</span><span class="value">${s.rs}</span></div>
          <div class="screener-metric"><span class="label">株価</span><span class="value">${s.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
          <div class="screener-metric"><span class="label">52週高値から</span><span class="value">${pct(s.dist_high_52w_pct)}</span></div>
          <div class="screener-metric"><span class="label">1年リターン</span><span class="value">${pct(s.ret_1y_pct)}</span></div>
        </div>
        <ul class="screener-checks">${checks}</ul>
      </div>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('screenerGrid');
  if (!grid) return; // このページ以外では何もしない

  try {
    const res = await fetch('data/minervini_report.json');
    if (!res.ok) throw new Error('Network response was not ok');
    screenerData = await res.json();
  } catch (err) {
    console.error('Error loading screener data:', err);
    grid.innerHTML = '<p style="padding:20px;color:var(--text-secondary)">データを読み込めませんでした。</p>';
    return;
  }

  renderSummary(screenerData);
  renderFilters(screenerData);
  renderGrid(screenerData);

  const note = document.getElementById('screenerNote');
  if (note) {
    const d = new Date(screenerData.generated_at);
    const asOf = isNaN(d) ? '' : `　${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日時点`;
    note.textContent = `出典：${screenerData.source_name}${asOf}　※S&P500の構成銘柄のうち、1年分の株価データが揃う${screenerData.universe}銘柄を判定しました。投資助言ではありません。`;
  }
});
