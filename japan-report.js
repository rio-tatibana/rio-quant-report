function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

// 外部から取得したURLは、http(s)以外をリンクにしない。escapeHtmlは文字を無害化するだけで
// スキームを見ないため、javascript: などがhrefに残るのを防ぐ。
function safeUrl(value) {
  const url = String(value ?? '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

function fmt(value, digits = 2) {
  return value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${fmt(number)}%`;
}

function trendClass(value) {
  return value > 0 ? 'up' : value < 0 ? 'down' : '';
}

function renderMarket(items) {
  const target = document.getElementById('jpMarket');
  target.innerHTML = items.map((item) => `
    <article class="jp-market-card">
      <div class="label">${escapeHtml(item.label)}</div>
      <div class="value">${fmt(item.value, item.label === 'ドル円' ? 3 : 2)}</div>
      <div class="change ${trendClass(item.change_1d_pct)}">${fmtPct(item.change_1d_pct)}</div>
    </article>`).join('');
}

function renderWatchlist(rows, universeCount) {
  const target = document.getElementById('jpWatchlist');
  document.getElementById('jpWatchNote').textContent = `指定銘柄 ${universeCount} 銘柄のうち、13週線が26週線を上回る ${rows.length} 銘柄。金曜引け後に更新します。`;
  if (!rows.length) {
    target.innerHTML = '<tr><td colspan="10">現在、条件を満たす銘柄はありません。</td></tr>';
    return;
  }
  target.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.code)}</td><td>${escapeHtml(row.name)}</td>
      <td class="num">${fmt(row.price)}</td><td class="num ${trendClass(row.change_1d_pct)}">${fmtPct(row.change_1d_pct)}</td>
      <td class="num">${fmt(row.ma13w)}</td><td class="num">${fmt(row.ma26w)}</td>
      <td class="num ${trendClass(row.return_13w_pct)}">${fmtPct(row.return_13w_pct)}</td>
      <td class="num ${trendClass(row.relative_topix_13w_pct)}">${fmtPct(row.relative_topix_13w_pct)}</td>
      <td class="num ${trendClass(row.distance_52w_high_pct)}">${fmtPct(row.distance_52w_high_pct)}</td>
      <td class="num">${fmt(row.scores?.total, 1)}</td>
    </tr>`).join('');
}

function renderSectors(items) {
  const target = document.getElementById('jpSectors');
  if (!items.length) {
    target.innerHTML = '<p class="section-note">業種データを取得できませんでした。</p>';
    return;
  }
  target.innerHTML = items.map((item) => `
    <article class="jp-sector-card"><div>${escapeHtml(item.label)}</div><strong class="${trendClass(item.change_1d_pct)}">${fmtPct(item.change_1d_pct)}</strong><small>${item.count} 銘柄</small></article>`).join('');
}

function renderDisclosures(items) {
  const target = document.getElementById('jpDisclosures');
  if (!items.length) {
    target.innerHTML = '<div class="card"><p class="section-note">表示対象の決算・重要開示はありません。</p></div>';
    return;
  }
  target.innerHTML = items.map((item) => {
    const earnings = item.earnings || {};
    // 「年間配当（実績）」は前期の確定値、「通期配当予想」は今期の予想。決算期が違うため
    // 増減として比べられないよう、ラベルで実績・予想を区別する。
    const earningsItems = [
      ['売上高', earnings.revenue, 'money'], ['営業利益', earnings.operating_income, 'money'],
      ['経常利益', earnings.ordinary_income, 'money'], ['当期純利益', earnings.net_income_parent, 'money'],
      ['EPS', earnings.eps, 'perShare'], ['年間配当（実績）', earnings.dps, 'perShare'],
      ['通期売上予想', earnings.forecast_revenue, 'money'], ['通期営業利益予想', earnings.forecast_operating_income, 'money'],
      ['通期純利益予想', earnings.forecast_net_income_parent, 'money'], ['通期EPS予想', earnings.forecast_eps, 'perShare'],
      ['通期配当予想（年間）', earnings.forecast_dps, 'perShare'],
    ].filter((entry) => entry[1] != null);
    const earningsHtml = earningsItems.length ? `<div class="jp-earnings-grid">${earningsItems.map(([label, value, type]) => `
      <div><span>${label}</span><strong>${type === 'money' ? fmtMoney(value) : `${fmt(value)}円`}</strong></div>`).join('')}</div>` : '';
    const link = safeUrl(item.url);
    const publishedAt = String(item.published_at ?? '').slice(0, 16).replace('T', ' ');
    return `
    <article class="jp-disclosure-card">
      <div class="jp-disclosure-meta">${escapeHtml(item.code)}　${escapeHtml(item.name)}　${escapeHtml(publishedAt)}</div>
      <h3>${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</h3>
      ${earningsHtml}
      <p>出典：${escapeHtml(item.source || 'TDnet')}</p>
    </article>`;
  }).join('');
}

function fmtMoney(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const number = Number(value);
  if (Math.abs(number) >= 1e8) return `${fmt(number / 1e8, 1)}億円`;
  if (Math.abs(number) >= 1e4) return `${fmt(number / 1e4, 1)}万円`;
  return `${fmt(number, 0)}円`;
}

async function loadJapanReport() {
  const updated = document.getElementById('jpUpdated');
  try {
    const response = await fetch('data/japan/latest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('レポートデータを読み込めませんでした。');
    const data = await response.json();
    if (data.status !== 'ok') {
      updated.textContent = data.message || '最初のデータ更新を待っています。';
      return;
    }
    updated.textContent = `${data.as_of} 引け後更新　｜　${data.source_notes.join('　/　')}`;
    renderMarket(data.market || []);
    renderWatchlist(data.watchlist || [], data.universe_count || 0);
    renderSectors(data.sectors || []);
    renderDisclosures(data.disclosures || []);
  } catch (error) {
    console.error(error);
    updated.textContent = 'データを読み込めませんでした。';
  }
}

document.addEventListener('DOMContentLoaded', loadJapanReport);
