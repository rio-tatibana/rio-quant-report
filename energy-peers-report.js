// エネルギー同業比較テーブル描画（golden-cross-report.js のソート流用・5銘柄用に簡略化）
function fmtPct(v) {
  if (v === null || v === undefined) return '-';
  const sign = v > 0 ? '+' : '';
  return sign + Number(v).toFixed(2) + '%';
}

function fmtPrice(v) {
  if (v === null || v === undefined) return '-';
  return Number(v).toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVal(v, suffix) {
  if (v === null || v === undefined) return '-';
  return Number(v).toFixed(2) + suffix;
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

const EP_HEADERS = [
  { label: 'ティッカー', type: 'text' },
  { label: '銘柄名', type: 'text' },
  { label: '終値', type: 'num' },
  { label: '1年リターン', type: 'num' },
  { label: '60日リターン', type: 'num' },
  { label: 'PE', type: 'num' },
  { label: 'PB', type: 'num' },
  { label: 'ROE', type: 'num' },
  { label: '成長CAGR', type: 'num' },
  { label: '配当利回り', type: 'num' },
  { label: '大川式判定', type: 'text' },
];

function badgeClass(badge) {
  if (badge === 'strong') return 'strong';
  if (badge === 'weak') return 'weak';
  return 'mid';
}

function renderTableHead() {
  const thead = document.getElementById('epTableHead');
  const tr = document.createElement('tr');
  EP_HEADERS.forEach((h) => {
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

function renderTableBody(results) {
  const tbody = document.getElementById('epTableBody');
  const order = ['VLO', 'XOM', 'CVX', 'MPC', 'PSX'].filter((t) => results[t]);
  tbody.innerHTML = order
    .map((t) => {
      const r = results[t];
      const mark = t === 'VLO' ? ' ★注目' : '';
      return `
    <tr>
      <td>${t}</td>
      <td>${r.name}${mark}</td>
      <td class="num" data-sort-value="${r.price ?? ''}">${fmtPrice(r.price)}</td>
      <td class="num" data-sort-value="${r.ret_1y ?? ''}">${fmtPct(r.ret_1y)}</td>
      <td class="num" data-sort-value="${r.ret_60d ?? ''}">${fmtPct(r.ret_60d)}</td>
      <td class="num" data-sort-value="${r.pe_ttm ?? ''}">${fmtVal(r.pe_ttm, '倍')}</td>
      <td class="num" data-sort-value="${r.pb_ratio ?? ''}">${fmtVal(r.pb_ratio, '倍')}</td>
      <td class="num" data-sort-value="${r.roe ?? ''}">${fmtPct(r.roe)}</td>
      <td class="num" data-sort-value="${r.growth_cagr ?? ''}">${fmtPct(r.growth_cagr)}</td>
      <td class="num" data-sort-value="${r.div_yield_ttm ?? ''}">${fmtPct(r.div_yield_ttm)}</td>
      <td><span class="screener-badge ${badgeClass(r.okawa.badge)}">${r.okawa.verdict} ${r.okawa.score}</span></td>
    </tr>`;
    })
    .join('');
}

function maxBy(results, key) {
  let best = null;
  Object.entries(results).forEach(([t, r]) => {
    if (r[key] === null || r[key] === undefined) return;
    if (!best || r[key] > results[best][key]) best = t;
  });
  return best;
}

function renderKpis(data) {
  const el = document.getElementById('epKpis');
  const results = data.results;
  const mom = maxBy(results, 'ret_1y');
  const roe = maxBy(results, 'roe');
  const div = maxBy(results, 'div_yield_ttm');
  let bal = null;
  Object.entries(results).forEach(([t, r]) => {
    if (!bal || r.okawa.score > results[bal].okawa.score) bal = t;
  });
  el.innerHTML = `
    <div class="gc-kpi"><div class="label">モメンタム首位（1年）</div><div class="value accent">${mom}</div><div class="sub">${fmtPct(results[mom].ret_1y)}</div></div>
    <div class="gc-kpi"><div class="label">ROE首位</div><div class="value accent">${roe}</div><div class="sub">${fmtPct(results[roe].roe)}</div></div>
    <div class="gc-kpi"><div class="label">大川式スコア首位</div><div class="value accent">${bal}</div><div class="sub">${results[bal].okawa.verdict} ${results[bal].okawa.score}</div></div>
    <div class="gc-kpi"><div class="label">最高配当利回り</div><div class="value accent">${div}</div><div class="sub">${fmtPct(results[div].div_yield_ttm)}</div></div>
  `;
}

function renderReport(data) {
  renderKpis(data);
  renderTableHead();
  renderTableBody(data.results);
  document.getElementById('epTableNote').textContent =
    `更新：${data.updated_at}。列見出しクリックで並び替えができます。VLO行に★注目マーク付き。`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const select = document.getElementById('epDateSelect');
  if (!select) return;

  let index = [];
  try {
    const res = await fetch('data/energy_peers/index.json');
    if (!res.ok) throw new Error('index fetch failed');
    index = await res.json();
  } catch (error) {
    console.error('Error loading energy peers index:', error);
    document.getElementById('epTableNote').textContent = 'データ読み込みエラー';
    return;
  }

  if (!index.length) {
    document.getElementById('epTableNote').textContent = '公開済みのレポートがまだありません。';
    return;
  }

  select.innerHTML = index
    .map((e) => `<option value="${e.date}">${e.date.slice(0, 4)}/${e.date.slice(4, 6)}/${e.date.slice(6, 8)}</option>`)
    .join('');

  async function loadDate(date) {
    const res = await fetch(`data/energy_peers/${date}.json`);
    const data = await res.json();
    renderReport(data);
  }

  select.addEventListener('change', () => loadDate(select.value));
  await loadDate(index[0].date);
});
