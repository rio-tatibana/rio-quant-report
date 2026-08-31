// ミネルヴィニのトレンドテンプレート診断ページ（minervini-report.html）の描画

let screenerData = null;
let activeFilter = 'all8'; // 条件クリア数の絞り込み。初期表示は「8条件すべて」
let activeSector = 'all';  // セクターの絞り込み
let activeSort = 'passed'; // 並び替え

// セクターごとの色（色相の角度）。同じセクターの銘柄が一目で分かるようにする
const SECTOR_HUE = {
  情報技術: 220,
  金融: 200,
  ヘルスケア: 162,
  資本財: 28,
  一般消費財: 288,
  生活必需品: 104,
  エネルギー: 8,
  素材: 42,
  公益事業: 250,
  不動産: 330,
  コミュニケーション: 186,
};

function sectorStyle(sector) {
  const h = SECTOR_HUE[sector];
  if (h === undefined) return 'background:var(--surface-sunken);color:var(--text-secondary)';
  return `background:hsl(${h},52%,94%);color:hsl(${h},48%,30%)`;
}

// HTMLとして解釈されると困る文字を無害化する（会社名に & などが入るため）
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 満たした条件数に応じた色分け（既存のスコアバーの色分けに合わせる）
function passedBandClass(passed, total) {
  if (passed === total) return 'strong';
  if (passed >= total - 2) return 'mid';
  return 'weak';
}

const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;

/* ---------------------------------------------------------------
   上部のサマリー（条件別の通過数 ／ セクター別の合格率）
   --------------------------------------------------------------- */
function renderSummary(data) {
  const head = document.getElementById('screenerHeadline');
  if (head) {
    const rate = (data.pass_all / data.universe) * 100;
    head.innerHTML = `
      <div class="headline-stat">
        <span class="num">${data.pass_all}</span>
        <span class="unit">銘柄</span>
        <span class="cap">8条件すべてクリア</span>
      </div>
      <p class="headline-text">
        S&amp;P500の${data.universe}銘柄を判定し、上昇トレンドの8条件をすべて満たしたのは
        <b>${data.pass_all}銘柄（全体の${rate.toFixed(0)}%）</b>でした。
        条件を多く満たすほど、株価がきれいな上昇トレンドに乗っている状態を表します。
      </p>`;
  }

  const box = document.getElementById('screenerSummary');
  if (box) {
    const rows = data.criteria.map((label, i) => {
      const n = data.counts_per_criterion[i];
      const pct = (n / data.universe) * 100;
      return `
        <div class="row">
          <span class="idx">${i + 1}</span>
          <span class="label">${esc(label)}</span>
          <span class="track"><i style="width:${pct.toFixed(1)}%"></i></span>
          <span class="num">${n}銘柄 ${pct.toFixed(0)}%</span>
        </div>`;
    }).join('');
    box.innerHTML = `<h3>条件ごとに、満たした銘柄の数</h3>${rows}`;
  }

  const secBox = document.getElementById('screenerSectorSummary');
  if (secBox && Array.isArray(data.sectors)) {
    const max = Math.max(...data.sectors.map((r) => (r.pass_all / r.universe) * 100), 1);
    const rows = data.sectors.map((r) => {
      const pct = (r.pass_all / r.universe) * 100;
      const h = SECTOR_HUE[r.sector];
      const color = h === undefined ? 'var(--gray-400)' : `hsl(${h},55%,52%)`;
      return `
        <div class="row">
          <span class="label">${esc(r.sector)}</span>
          <span class="track"><i style="width:${(pct / max * 100).toFixed(1)}%;background:${color}"></i></span>
          <span class="num">${r.pass_all} / ${r.universe}銘柄</span>
        </div>`;
    }).join('');
    secBox.innerHTML = `<h3>セクターごとの、8条件すべてクリアした割合</h3>${rows}`;
  }
}

/* ---------------------------------------------------------------
   操作パネル（条件クリア数の絞り込み・セクター・並び替え）
   --------------------------------------------------------------- */
function renderFilters(data) {
  const box = document.getElementById('screenerFilters');
  const total = data.criteria.length;

  if (box) {
    const counts = {
      all8: data.stocks.filter((s) => s.passed === total).length,
      p7: data.stocks.filter((s) => s.passed === total - 1).length,
      p6: data.stocks.filter((s) => s.passed === total - 2).length,
      held: data.stocks.filter((s) => s.held).length,
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

  const sel = document.getElementById('screenerSector');
  if (sel) {
    const counts = {};
    data.stocks.forEach((s) => { counts[s.sector] = (counts[s.sector] || 0) + 1; });
    const order = (data.sectors || []).map((r) => r.sector).filter((name) => counts[name]);
    Object.keys(counts).forEach((name) => { if (!order.includes(name)) order.push(name); });
    sel.innerHTML = `<option value="all">すべてのセクター（${data.stocks.length}）</option>`
      + order.map((name) => `<option value="${esc(name)}">${esc(name)}（${counts[name]}）</option>`).join('');
    sel.value = activeSector;
    sel.addEventListener('change', () => { activeSector = sel.value; renderGrid(data); });
  }

  const sort = document.getElementById('screenerSort');
  if (sort) {
    const options = [
      ['passed', '条件クリア数が多い順'],
      ['sector', 'セクター別にまとめる'],
      ['rs', '相対力が高い順'],
      ['ret', '1年リターンが高い順'],
      ['high', '52週高値に近い順'],
      ['symbol', 'ティッカー順（A→Z）'],
    ];
    sort.innerHTML = options.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
    sort.value = activeSort;
    sort.addEventListener('change', () => { activeSort = sort.value; renderGrid(data); });
  }
}

/* ---------------------------------------------------------------
   銘柄カード
   --------------------------------------------------------------- */
function sortStocks(items) {
  const by = {
    passed: (a, b) => (b.passed - a.passed) || (b.rs - a.rs),
    rs: (a, b) => b.rs - a.rs,
    ret: (a, b) => b.ret_1y_pct - a.ret_1y_pct,
    high: (a, b) => b.dist_high_52w_pct - a.dist_high_52w_pct,
    symbol: (a, b) => a.symbol.localeCompare(b.symbol),
    sector: (a, b) => a.sector.localeCompare(b.sector, 'ja')
      || (b.passed - a.passed) || (b.rs - a.rs),
  };
  return items.slice().sort(by[activeSort] || by.passed);
}

function cardHtml(s, data) {
  const total = data.criteria.length;
  // 8条件を1〜8の四角で表す。緑＝満たしている、赤＝満たしていない
  const strip = s.checks.map((ok, i) =>
    `<span class="cell ${ok ? 'ok' : 'ng'}" title="${i + 1}. ${esc(data.criteria[i])}">${i + 1}</span>`).join('');

  const checks = data.criteria.map((label, i) => {
    const ok = s.checks[i];
    return `<li class="${ok ? 'ok' : 'ng'}"><span class="mark">${ok ? '✓' : '✕'}</span><span>${esc(label)}</span></li>`;
  }).join('');

  return `
    <article class="screener-card">
      <div class="screener-card-head">
        <div class="name-cell">
          <span class="ticker">${esc(s.symbol)}${s.held ? '<span class="screener-held">保有</span>' : ''}</span>
          <span class="company">${esc(s.name_ja || s.name)}</span>
        </div>
        <div class="screener-score ${passedBandClass(s.passed, total)}">
          ${s.passed}<small>/ ${total} 条件</small>
        </div>
      </div>
      <span class="sector-chip" style="${sectorStyle(s.sector)}">${esc(s.sector)}</span>
      <div class="check-strip">${strip}</div>
      <div class="screener-metrics">
        <div class="screener-metric"><span class="label">相対力</span><span class="value">${s.rs}</span></div>
        <div class="screener-metric"><span class="label">株価</span><span class="value">${s.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        <div class="screener-metric"><span class="label">52週高値から</span><span class="value">${signed(s.dist_high_52w_pct)}</span></div>
        <div class="screener-metric"><span class="label">1年リターン</span><span class="value">${signed(s.ret_1y_pct)}</span></div>
      </div>
      <details class="screener-detail">
        <summary>8条件の内訳を見る</summary>
        <ul class="screener-checks">${checks}</ul>
      </details>
    </article>`;
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
  if (activeSector !== 'all') items = items.filter((s) => s.sector === activeSector);
  items = sortStocks(items);

  if (countEl) {
    countEl.textContent =
      `${items.length}銘柄を表示中（判定対象 S&P500 ${data.universe}銘柄のうち、`
      + `${data.listed_from}条件以上を満たした${data.stocks.length}銘柄を掲載）`;
  }

  if (!items.length) {
    grid.className = 'screener-grid';
    grid.innerHTML = '<p class="screener-empty">該当する銘柄はありません。絞り込みを緩めてみてください。</p>';
    return;
  }

  // 「セクター別にまとめる」を選んだときだけ、セクターの見出しを挟む
  if (activeSort === 'sector') {
    const groups = [];
    items.forEach((s) => {
      const last = groups[groups.length - 1];
      if (last && last.sector === s.sector) last.items.push(s);
      else groups.push({ sector: s.sector, items: [s] });
    });
    grid.className = 'screener-groups';
    grid.innerHTML = groups.map((g) => `
      <section class="screener-group">
        <h3 class="screener-group-head">
          <span class="sector-chip" style="${sectorStyle(g.sector)}">${esc(g.sector)}</span>
          <span class="n">${g.items.length}銘柄</span>
        </h3>
        <div class="screener-grid">${g.items.map((s) => cardHtml(s, data)).join('')}</div>
      </section>`).join('');
    return;
  }

  grid.className = 'screener-grid';
  grid.innerHTML = items.map((s) => cardHtml(s, data)).join('');
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
    grid.innerHTML = '<p class="screener-empty">データを読み込めませんでした。</p>';
    return;
  }

  renderSummary(screenerData);
  renderFilters(screenerData);
  renderGrid(screenerData);

  const note = document.getElementById('screenerNote');
  if (note) {
    const d = new Date(screenerData.generated_at);
    const asOf = isNaN(d) ? '' : `　${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日時点`;
    note.textContent = `出典：${screenerData.source_name}${asOf}　※S&P500の構成銘柄のうち、1年分の株価データが揃う${screenerData.universe}銘柄を判定しました。セクター分類はWikipediaのS&P500構成銘柄一覧（GICS）に基づきます。投資助言ではありません。`;
  }
});
