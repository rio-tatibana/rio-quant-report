// 日経225オプション建玉分析ページ。データは scripts/build_nikkei_options.py が作る data/nikkei_options/latest.json
const NS = 'http://www.w3.org/2000/svg';
const yen = (n) => Number(n).toLocaleString('ja-JP');
const pct = (n, d = 0) => `${(n * 100).toFixed(d)}%`;
const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

// ---- 小さなSVG部品 ----
function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (text != null) node.textContent = text;
  return node;
}

function makeSvg(w, h, label) {
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label });
  svg.style.minWidth = '640px';
  return svg;
}

function niceStep(range, ticks) {
  const raw = range / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

function yAxis(svg, { L, R, T, B, W, H }, lo, hi, fmt, ticks = 5) {
  const step = niceStep(hi - lo, ticks);
  const y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    svg.appendChild(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? 'opt-axis' : 'opt-grid' }));
    svg.appendChild(el('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'opt-tick' }, fmt(v)));
  }
  return y;
}

function vline(svg, x, T, H, B, cls, label, anchor = 'start') {
  svg.appendChild(el('line', { x1: x, x2: x, y1: T, y2: H - B, class: `opt-vline ${cls}` }));
  const dx = anchor === 'start' ? 6 : -6;
  svg.appendChild(el('text', { x: x + dx, y: T + 12, 'text-anchor': anchor, class: `opt-vlabel ${cls}` }, label));
}

// ---- ツールチップ(マウスを乗せる/タップで数値を表示) ----
const tip = document.getElementById('optTip');
function bindTip(node, lines) {
  node.classList.add('opt-hit');
  const show = (e) => {
    tip.replaceChildren(...lines.map((t, i) => {
      const d = document.createElement(i === 0 ? 'strong' : 'span');
      d.textContent = t;
      return d;
    }));
    tip.hidden = false;
    const x = (e.touches ? e.touches[0].clientX : e.clientX) + 14;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) + 14;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(x, window.innerWidth - w - 8)}px`;
    tip.style.top = `${y}px`;
  };
  node.addEventListener('mousemove', show);
  node.addEventListener('mouseenter', show);
  node.addEventListener('mouseleave', () => { tip.hidden = true; });
  node.addEventListener('touchstart', show, { passive: true });
}
document.addEventListener('touchstart', (e) => { if (!e.target.closest('.opt-hit')) tip.hidden = true; }, { passive: true });

// ---- 1) 建玉の棒グラフ ----
function chartOi(d) {
  const W = 960, H = 400, m = { L: 64, R: 16, T: 28, B: 44 };
  const rows = d.strikes;
  const maxV = Math.max(...rows.map((r) => Math.max(r.c_oi, r.p_oi)));
  const hi = Math.ceil(maxV / 5000) * 5000;
  const svg = makeSvg(W, H, '権利行使価格ごとのコールとプットの建玉。上向きがコール、下向きがプット');
  const geo = { ...m, W, H };
  const y = yAxis(svg, geo, -hi, hi, (v) => yen(Math.abs(v)), 4);
  const bw = (W - m.L - m.R) / rows.length;
  const k0 = rows[0].k, kStep = 500;
  const xOf = (k) => m.L + ((k - k0) / kStep + 0.5) * bw;
  rows.forEach((r, i) => {
    const x = m.L + i * bw + bw * 0.16, w = bw * 0.68;
    if (r.c_oi) svg.appendChild(el('rect', { x, y: y(r.c_oi), width: w, height: y(0) - y(r.c_oi), rx: 2, class: 'opt-call' }));
    if (r.p_oi) svg.appendChild(el('rect', { x, y: y(0), width: w, height: y(-r.p_oi) - y(0), rx: 2, class: 'opt-put' }));
    const hit = el('rect', { x: m.L + i * bw, y: m.T, width: bw, height: H - m.T - m.B, fill: 'transparent' });
    bindTip(hit, [`${yen(r.k)}円`, `コール建玉 ${yen(r.c_oi)}枚(出来高 ${yen(r.c_vol)})`, `プット建玉 ${yen(r.p_oi)}枚(出来高 ${yen(r.p_vol)})`]);
    svg.appendChild(hit);
    if (r.k % 2000 === 0) svg.appendChild(el('text', { x: xOf(r.k), y: H - m.B + 18, 'text-anchor': 'middle', class: 'opt-tick' }, yen(r.k)));
  });
  svg.appendChild(el('text', { x: m.L + (W - m.L - m.R) / 2, y: H - 6, 'text-anchor': 'middle', class: 'opt-axis-title' }, '権利行使価格(円)'));
  svg.appendChild(el('text', { x: 14, y: m.T - 12, class: 'opt-axis-title' }, '建玉(枚)'));
  vline(svg, xOf(d.forward), m.T, H, m.B, 'fwd', `先物 約${yen(d.forward)}`, 'end');
  if (d.max_pain >= k0 && d.max_pain <= rows[rows.length - 1].k) vline(svg, xOf(d.max_pain), m.T, H, m.B, 'mp', `Max Pain ${yen(d.max_pain)}`);
  // 壁には数字を直接ラベル
  [[d.call_wall, 'c_oi', -6], [d.put_wall, 'p_oi', 14]].forEach(([k, key, dy]) => {
    const r = rows.find((x) => x.k === k);
    if (!r) return;
    const yy = key === 'c_oi' ? y(r[key]) + dy : y(-r[key]) + dy;
    svg.appendChild(el('text', { x: xOf(k), y: yy, 'text-anchor': 'middle', class: 'opt-barlabel' }, yen(r[key])));
  });
  document.getElementById('chartOi').replaceChildren(svg);

  // 先物より上の「すでに価値のある」大きなプットは壁に数えない旨を補足
  const itm = rows.filter((r) => r.k > d.forward && r.p_oi > d.otm_puts[0].oi).sort((a, b) => b.p_oi - a.p_oi)[0];
  if (itm) {
    const note = document.createElement('p');
    note.className = 'table-note';
    note.textContent = `注: ${yen(itm.k)}円のプット(${yen(itm.p_oi)}枚)は先物より上にあり、すでに価値のある状態(イン・ザ・マネー)です。実質的な下値の壁ではなく、ヘッジ取引の残りなどの可能性が高いため、壁には数えていません。`;
    document.getElementById('chartOi').after(note);
  }
}

// ---- 2) 確率の棒グラフ ----
function chartProb(d) {
  const W = 960, H = 340, m = { L: 56, R: 16, T: 28, B: 46 };
  const bins = d.prob_bins;
  const hi = Math.ceil(Math.max(...bins.map((b) => b.p)) * 100 / 5) * 5 / 100;
  const svg = makeSvg(W, H, '満期時点の日経平均が各価格帯に入る確率の目安');
  const y = yAxis(svg, { ...m, W, H }, 0, hi, (v) => pct(v), 4);
  const bw = (W - m.L - m.R) / bins.length;
  bins.forEach((b, i) => {
    const x = m.L + i * bw + bw * 0.14, w = bw * 0.72;
    const inside = b.hi > d.lo1 && b.lo < d.hi1 && b.lo >= d.lo1 - 2500 && b.hi <= d.hi1 + 2500;
    svg.appendChild(el('rect', { x, y: y(b.p), width: w, height: y(0) - y(b.p), rx: 2, class: inside ? 'opt-bar-in' : 'opt-bar-out' }));
    svg.appendChild(el('text', { x: x + w / 2, y: y(b.p) - 6, 'text-anchor': 'middle', class: 'opt-barlabel' }, pct(b.p)));
    svg.appendChild(el('text', { x: x + w / 2, y: H - m.B + 18, 'text-anchor': 'middle', class: 'opt-tick' }, b.label));
    const hit = el('rect', { x: m.L + i * bw, y: m.T, width: bw, height: H - m.T - m.B, fill: 'transparent' });
    const range = b.lo === 0 ? `${yen(b.hi)}円未満` : b.hi >= 999999 ? `${yen(b.lo)}円以上` : `${yen(b.lo)}〜${yen(b.hi)}円`;
    bindTip(hit, [range, `確率の目安 ${pct(b.p, 1)}`]);
    svg.appendChild(hit);
  });
  svg.appendChild(el('text', { x: m.L + (W - m.L - m.R) / 2, y: H - 6, 'text-anchor': 'middle', class: 'opt-axis-title' }, '満期(SQ)時点の日経平均の価格帯(円)'));
  document.getElementById('chartProb').replaceChildren(svg);
  const g = d.p_gt;
  document.getElementById('probNote').textContent =
    `濃い青は、IVが示す「1標準偏差」の範囲(約${yen(d.lo1)}〜${yen(d.hi1)}円)付近。目安として、満期に55,000円超は${pct(g['55000'])}、60,000円超は${pct(g['60000'])}、50,000円超は${pct(g['50000'])}と織り込まれています。`;
}

// ---- 3) IVスマイル ----
function chartSmile(d) {
  const W = 960, H = 340, m = { L: 56, R: 24, T: 28, B: 46 };
  const pts = d.smile;
  const lo = Math.floor(Math.min(...pts.map((p) => p.iv)) / 5) * 5 - 5;
  const hi = Math.ceil(Math.max(...pts.map((p) => p.iv)) / 5) * 5;
  const svg = makeSvg(W, H, '権利行使価格ごとのIV。下値側ほど高い');
  const y = yAxis(svg, { ...m, W, H }, lo, hi, (v) => `${v}%`, 5);
  const k0 = pts[0].k, k1 = pts[pts.length - 1].k;
  const x = (k) => m.L + (k - k0) / (k1 - k0) * (W - m.L - m.R);
  svg.appendChild(el('polyline', { points: pts.map((p) => `${x(p.k)},${y(p.iv)}`).join(' '), class: 'opt-line' }));
  pts.forEach((p, i) => {
    svg.appendChild(el('circle', { cx: x(p.k), cy: y(p.iv), r: 4.5, class: p.side === 'put' ? 'opt-dot-put' : 'opt-dot-call' }));
    if (p.k % 2000 === 0) svg.appendChild(el('text', { x: x(p.k), y: H - m.B + 18, 'text-anchor': 'middle', class: 'opt-tick' }, yen(p.k)));
    const hit = el('circle', { cx: x(p.k), cy: y(p.iv), r: 14, fill: 'transparent' });
    bindTip(hit, [`${yen(p.k)}円`, `IV ${p.iv.toFixed(1)}%(${p.side === 'put' ? 'プット' : 'コール'}側)`]);
    svg.appendChild(hit);
  });
  vline(svg, x(d.forward), m.T, H, m.B, 'fwd', `先物 約${yen(d.forward)}`);
  const first = pts[0], atm = d.atm_iv;
  svg.appendChild(el('text', { x: x(first.k) + 8, y: y(first.iv) - 10, class: 'opt-barlabel' }, `${yen(first.k)}円 IV ${first.iv.toFixed(1)}%`));
  svg.appendChild(el('text', { x: x(d.forward) + 8, y: y(atm) - 14, class: 'opt-barlabel' }, `ATM IV ${atm.toFixed(1)}%`));
  svg.appendChild(el('text', { x: m.L + (W - m.L - m.R) / 2, y: H - 6, 'text-anchor': 'middle', class: 'opt-axis-title' }, '権利行使価格(円)'));
  document.getElementById('chartSmile').replaceChildren(svg);
  const legend = document.createElement('div');
  legend.className = 'opt-legend';
  legend.innerHTML = '<span><i class="sw put"></i>プットのIV(先物より下)</span><span><i class="sw call"></i>コールのIV(先物より上)</span>';
  document.getElementById('chartSmile').before(legend);
}

// ---- 4) Max Pain ----
function chartPain(d) {
  const W = 960, H = 320, m = { L: 56, R: 24, T: 28, B: 46 };
  const vmin = Math.min(...d.pain.map((p) => p.v));
  const pts = d.pain.map((p) => ({ s: p.s, v: p.v / vmin * 100 }));
  const hi = Math.ceil(Math.max(...pts.map((p) => p.v)) / 50) * 50;
  const svg = makeSvg(W, H, '満期の価格ごとの、オプション売り手の支払い総額');
  const y = yAxis(svg, { ...m, W, H }, 0, hi, (v) => String(Math.round(v)), 4);
  const s0 = pts[0].s, s1 = pts[pts.length - 1].s;
  const x = (s) => m.L + (s - s0) / (s1 - s0) * (W - m.L - m.R);
  svg.appendChild(el('polyline', { points: pts.map((p) => `${x(p.s)},${y(p.v)}`).join(' '), class: 'opt-line thick' }));
  pts.forEach((p) => {
    if (p.s % 2000 === 0) svg.appendChild(el('text', { x: x(p.s), y: H - m.B + 18, 'text-anchor': 'middle', class: 'opt-tick' }, yen(p.s)));
    const hit = el('rect', { x: x(p.s) - 4, y: m.T, width: 8, height: H - m.T - m.B, fill: 'transparent' });
    bindTip(hit, [`満期の価格 ${yen(p.s)}円`, `売り手の支払い総額(最小=100) ${p.v.toFixed(0)}`]);
    svg.appendChild(hit);
  });
  if (d.max_pain >= s0 && d.max_pain <= s1) {
    svg.appendChild(el('circle', { cx: x(d.max_pain), cy: y(100), r: 6, class: 'opt-dot-mp' }));
    vline(svg, x(d.max_pain), m.T, H, m.B, 'mp', `Max Pain ${yen(d.max_pain)}`);
  }
  vline(svg, x(d.forward), m.T, H, m.B, 'fwd', `先物 約${yen(d.forward)}`, 'end');
  svg.appendChild(el('text', { x: m.L + (W - m.L - m.R) / 2, y: H - 6, 'text-anchor': 'middle', class: 'opt-axis-title' }, '満期(SQ)時点の日経平均(円)'));
  document.getElementById('chartPain').replaceChildren(svg);
  const far = Math.abs(d.max_pain - d.forward) > d.move * 0.8;
  document.getElementById('painNote').textContent =
    `満期にその価格だったとき、コール・プットの買い手へ支払われる金額の合計(=売り手の損失)を価格ごとに計算し、最小を100として表示。最小になる ${yen(d.max_pain)}円がMax Painです。` +
    (far ? `ただし現在の先物(約${yen(d.forward)}円)からかなり離れており、すでに価値のある深いプットの建玉に引っ張られている可能性があるため、「そこへ引き寄せられる」とまでは言えません。` : '現在の水準に近く、SQ前の値動きの引力として意識されやすい価格です。');
}

// ---- 数字カード・シナリオ・上位表 ----
function renderKpis(d) {
  const items = [
    ['先物の推定位置(12月限)', yen(d.forward), 'プット・コール価格の関係から逆算'],
    ['ATM IV(予想変動率)', `${d.atm_iv.toFixed(1)}%`, '年率換算。大きいほど荒い値動きを想定'],
    [`SQまでの1標準偏差(${d.days}日)`, `±${yen(d.move)}円`, `${yen(d.lo1)}〜${yen(d.hi1)}円(約68%の確率で収まる目安)`],
    ['Max Pain', yen(d.max_pain), '売り手の損失が最小になる満期の価格'],
    ['プット/コール比(建玉)', d.pc_ratio.toFixed(2), `プット${yen(d.put_oi)}枚 ÷ コール${yen(d.call_oi)}枚`],
    ['上値・下値の壁', `${yen(d.call_wall)} / ${yen(d.put_wall)}`, '先物より上のコール最大/下のプット最大'],
  ];
  document.getElementById('optKpis').innerHTML = items.map(([l, v, n]) =>
    `<article class="jp-market-card"><div class="label">${esc(l)}</div><div class="value">${esc(v)}</div><div class="change">${esc(n)}</div></article>`).join('');
}

function renderScenarios(d) {
  document.getElementById('optScenarios').innerHTML = d.scenarios.map((s) => `
    <article class="opt-scn ${esc(s.id)}">
      <div class="opt-scn-head"><span class="opt-tag">${esc(s.tag)}</span><span class="opt-prob">${pct(s.prob)}</span></div>
      <h3>${esc(s.title)}</h3>
      <div class="opt-bar"><i style="width:${Math.max(2, s.prob * 100).toFixed(1)}%"></i></div>
      <dl>
        <dt>もし</dt><dd>${esc(s.if)}</dd>
        <dt>すると</dt><dd>${esc(s.then)}</dd>
        <dt>確認する点</dt><dd>${esc(s.watch)}</dd>
      </dl>
    </article>`).join('');
}

function renderTop(d) {
  const table = (title, rows, cls) => `<div><h3>${title}</h3><div class="table-wrap"><table class="data"><thead><tr><th>行使価格</th><th>建玉(枚)</th><th>先物との差</th></tr></thead><tbody>${
    rows.map((r) => `<tr><td>${yen(r.k)}円</td><td class="${cls}">${yen(r.oi)}</td><td>${r.k > d.forward ? '+' : ''}${yen(r.k - d.forward)}円</td></tr>`).join('')}</tbody></table></div></div>`;
  document.getElementById('optTop').innerHTML = table('上値の壁候補(コール)', d.otm_calls, 'up') + table('下値の壁候補(プット)', d.otm_puts, 'down');
  document.getElementById('optSource').textContent =
    `出典: 日経225先物オプション(${d.contract}限・満期${d.expiry})の建玉表(ユーザー提供CSV)。先物位置は建玉表の価格から推定した値で、実際の価格とズレる場合があります。確率は「リスク中立確率」で、現実の確率とは異なります。本ページは特定の金融商品の売買を推奨するものではありません。`;
}

async function init() {
  try {
    const res = await fetch('data/nikkei_options/latest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();
    document.getElementById('optUpdated').textContent = `データ基準日: ${d.asof}(推定)/ 対象: ${d.contract}限 / 満期: ${d.expiry}(あと${d.days}日)`;
    renderKpis(d);
    chartOi(d);
    renderScenarios(d);
    chartProb(d);
    chartSmile(d);
    chartPain(d);
    renderTop(d);
  } catch (e) {
    document.getElementById('optUpdated').textContent = 'データを読み込めませんでした。';
  }
}
init();
