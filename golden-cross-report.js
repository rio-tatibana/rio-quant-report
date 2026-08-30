function fmtMarketCap(v) {
  if (v >= 1e12) return (v / 1e12).toFixed(2) + '兆ドル';
  return (v / 1e8).toLocaleString('ja-JP', { maximumFractionDigits: 0 }) + '億ドル';
}

function fmtNum(v, digits = 2) {
  return Number(v).toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtCrossDate(v) {
  if (!v) return '-';
  return v.slice(5, 10).replace('-', '/');
}

function sortTable(theadCell) {
  const table = theadCell.closest('table');
  const colIndex = Array.prototype.indexOf.call(theadCell.parentNode.children, theadCell);
  const type = theadCell.dataset.type;
  const tbody = table.tBodies[0];
  const rows = Array.prototype.slice.call(tbody.rows);
  const ascending = !theadCell.classList.contains('sorted-asc');
  rows.sort((rowA, rowB) => {
    const cellA = rowA.cells[colIndex];
    const cellB = rowB.cells[colIndex];
    let result;
    if (type === 'num') {
      const valA = cellA.dataset.sortValue;
      const valB = cellB.dataset.sortValue;
      const numA = valA === undefined || valA === '' ? null : parseFloat(valA);
      const numB = valB === undefined || valB === '' ? null : parseFloat(valB);
      if (numA === null && numB === null) result = 0;
      else if (numA === null) result = 1;
      else if (numB === null) result = -1;
      else result = numA - numB;
    } else {
      result = cellA.textContent.localeCompare(cellB.textContent, 'ja');
    }
    return ascending ? result : -result;
  });
  rows.forEach((row) => tbody.appendChild(row));
  Array.prototype.forEach.call(theadCell.parentNode.children, (th) => {
    th.classList.remove('sorted-asc', 'sorted-desc');
  });
  theadCell.classList.add(ascending ? 'sorted-asc' : 'sorted-desc');
}

const GC_HEADERS = [
  { label: 'ティッカー', type: 'text' },
  { label: '銘柄名', type: 'text' },
  { label: 'セクター', type: 'text' },
  { label: '時価総額', type: 'num' },
  { label: '終値', type: 'num' },
  { label: 'MA50日', type: 'num' },
  { label: 'MA200日', type: 'num' },
  { label: 'クロス日', type: 'num' },
  { label: '状態', type: 'text' },
];

function renderTableHead() {
  const thead = document.getElementById('gcTableHead');
  const tr = document.createElement('tr');
  GC_HEADERS.forEach((h) => {
    const th = document.createElement('th');
    th.className = 'sortable';
    th.dataset.type = h.type;
    th.textContent = h.label;
    th.addEventListener('click', () => sortTable(th));
    tr.appendChild(th);
  });
  thead.innerHTML = '';
  thead.appendChild(tr);
}

function rowBadges(row) {
  const badges = [
    row.crossed_within_20d
      ? '<span class="badge accent">直近クロス(20営業日以内)</span>'
      : '<span class="badge caution">クロス継続中</span>',
  ];
  if (row.is_52w_high) badges.push('<span class="badge positive">52週高値</span>');
  return badges.join(' ');
}

function renderTableBody(rows) {
  const tbody = document.getElementById('gcTableBody');
  tbody.innerHTML = rows
    .map(
      (r) => `
    <tr data-sector="${r.sector}">
      <td>${r.code.replace('US.', '')}</td>
      <td>${r.name}</td>
      <td>${r.sector}</td>
      <td class="num" data-sort-value="${r.market_val_usd}">${fmtMarketCap(r.market_val_usd)}</td>
      <td class="num" data-sort-value="${r.last_price}">${fmtNum(r.last_price)}</td>
      <td class="num" data-sort-value="${r.ma50d}">${fmtNum(r.ma50d)}</td>
      <td class="num" data-sort-value="${r.ma200d}">${fmtNum(r.ma200d)}</td>
      <td class="num">${fmtCrossDate(r.cross_date)}</td>
      <td>${rowBadges(r)}</td>
    </tr>`
    )
    .join('');
}

function renderKpis(data) {
  const el = document.getElementById('gcKpis');
  el.innerHTML = `
    <div class="gc-kpi"><div class="label">判定対象(時価総額1,000億ドル超)</div><div class="value">${data.total_candidates ?? '―'}</div><div class="sub">銘柄</div></div>
    <div class="gc-kpi"><div class="label">ゴールデンクロス状態</div><div class="value accent">${data.gc_count}</div><div class="sub">銘柄</div></div>
    <div class="gc-kpi"><div class="label">直近20営業日以内にクロス発生</div><div class="value accent">${data.fresh_count}</div><div class="sub">銘柄</div></div>
    <div class="gc-kpi"><div class="label">52週高値更新中</div><div class="value accent">${data.high_count}</div><div class="sub">銘柄</div></div>
  `;
}

function applySectorFilter(sector) {
  document.querySelectorAll('#gcFilters .gc-filter-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.sector === sector);
  });
  document.querySelectorAll('#gcTableBody tr[data-sector]').forEach((tr) => {
    tr.style.display = sector === 'all' || tr.dataset.sector === sector ? '' : 'none';
  });
}

function renderFilters(rows) {
  const el = document.getElementById('gcFilters');
  const counts = {};
  rows.forEach((r) => {
    counts[r.sector] = (counts[r.sector] || 0) + 1;
  });
  const sectors = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'ja'));
  const buttons = [`<button class="gc-filter-btn active" data-sector="all">すべて (${rows.length})</button>`].concat(
    sectors.map((s) => `<button class="gc-filter-btn" data-sector="${s}">${s} (${counts[s]})</button>`)
  );
  el.innerHTML = buttons.join('');
  el.querySelectorAll('.gc-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => applySectorFilter(btn.dataset.sector));
  });
}

function renderReport(data) {
  const rowsSorted = data.rows.slice().sort((a, b) => {
    if (a.sector !== b.sector) return a.sector.localeCompare(b.sector, 'ja');
    return b.market_val_usd - a.market_val_usd;
  });
  renderKpis(data);
  renderFilters(rowsSorted);
  renderTableHead();
  renderTableBody(rowsSorted);
  document.getElementById('gcTableNote').textContent =
    `全${rowsSorted.length}銘柄。列見出しクリックで並び替え、上のボタンでセクター別に絞り込みができます。`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const select = document.getElementById('gcDateSelect');
  if (!select) return;

  let index = [];
  try {
    const res = await fetch('data/golden_cross/index.json');
    if (!res.ok) throw new Error('index fetch failed');
    index = await res.json();
  } catch (error) {
    console.error('Error loading golden cross index:', error);
    document.getElementById('gcTableNote').textContent = 'データ読み込みエラー';
    return;
  }

  if (!index.length) {
    document.getElementById('gcTableNote').textContent = '公開済みのレポートがまだありません。';
    return;
  }

  select.innerHTML = index
    .map((e) => `<option value="${e.date}">${e.date.slice(0, 4)}/${e.date.slice(4, 6)}/${e.date.slice(6, 8)}</option>`)
    .join('');

  async function loadDate(date) {
    const res = await fetch(`data/golden_cross/${date}.json`);
    const data = await res.json();
    renderReport(data);
  }

  select.addEventListener('change', () => loadDate(select.value));
  await loadDate(index[0].date);
});
