// 光電融合5銘柄比較テーブル描画（energy-peers-report.js のソート処理を流用）
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

const PH_HEADERS = [
  { label: '銘柄', type: 'text' },
  { label: '売上', type: 'num' },
  { label: '営業利益', type: 'num' },
  { label: '親会社純利益', type: 'num' },
  { label: '売上成長率', type: 'num' },
  { label: '営業利益率', type: 'num' },
  { label: 'ROE', type: 'num' },
  { label: 'ROIC', type: 'num' },
  { label: 'PER', type: 'num' },
  { label: 'PBR', type: 'num' },
];

const PH_ROWS = [
  { ticker: 'APH', name: 'アンフェノール', revenue: 230.9, opIncome: 59.7, netIncome: 42.7, growth: 51.7, opMargin: 25.9, roe: 36.8, roic: 20.0, per: 39.5, pbr: 12.58 },
  { ticker: 'GLW', name: 'コーニング', revenue: 156.3, opIncome: 22.8, netIncome: 16.0, growth: 19.1, opMargin: 14.6, roe: 14.2, roic: 9.3, per: 69.0, pbr: 10.27 },
  { ticker: 'MRVL', name: 'マーベル', revenue: 81.9, opIncome: 13.4, netIncome: 26.7, growth: 42.1, opMargin: 16.3, roe: 19.3, roic: 6.3, per: 71.2, pbr: 10.17 },
  { ticker: 'COHR', name: 'コヒレント', revenue: 71.2, opIncome: 9.0, netIncome: 8.0, growth: 22.5, opMargin: 12.7, roe: 9.3, roic: 7.9, per: 67.1, pbr: 4.97 },
  { ticker: 'CIEN', name: 'シエナ', revenue: 47.7, opIncome: 3.1, netIncome: 1.2, growth: 18.8, opMargin: 6.5, roe: 4.4, roic: 3.5, per: 72.7, pbr: 15.08 },
];

function fmtPct(v) {
  const sign = v > 0 ? '+' : '';
  return sign + v.toFixed(1) + '%';
}

function renderTableHead() {
  const thead = document.getElementById('phTableHead');
  const tr = document.createElement('tr');
  PH_HEADERS.forEach((h) => {
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

function renderTableBody() {
  const tbody = document.getElementById('phTableBody');
  tbody.innerHTML = PH_ROWS.map((r) => `
    <tr>
      <td>${r.ticker}<br><span class="section-note" style="margin:0">${r.name}</span></td>
      <td class="num" data-sort-value="${r.revenue}">${r.revenue.toFixed(1)}</td>
      <td class="num" data-sort-value="${r.opIncome}">${r.opIncome.toFixed(1)}</td>
      <td class="num" data-sort-value="${r.netIncome}">${r.netIncome.toFixed(1)}</td>
      <td class="num" data-sort-value="${r.growth}">${fmtPct(r.growth)}</td>
      <td class="num" data-sort-value="${r.opMargin}">${r.opMargin.toFixed(1)}%</td>
      <td class="num" data-sort-value="${r.roe}">${r.roe.toFixed(1)}%</td>
      <td class="num" data-sort-value="${r.roic}">${r.roic.toFixed(1)}%</td>
      <td class="num" data-sort-value="${r.per}">${r.per.toFixed(1)}</td>
      <td class="num" data-sort-value="${r.pbr}">${r.pbr.toFixed(2)}</td>
    </tr>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  renderTableHead();
  renderTableBody();
});
