(() => {
  'use strict';
  const rows = [...document.querySelectorAll('#earnTableBody tr')];
  const cards = [...document.querySelectorAll('.earn-company')];
  const originalOrder = new Map(rows.map((row, i) => [row, i]));
  const search = document.getElementById('earnSearch');
  const sort = document.getElementById('earnSort');
  const filters = [...document.querySelectorAll('[data-day-filter]')];
  let day = 'all';
  function update() {
    const term = search.value.trim().toLocaleLowerCase();
    const matches = el => (day === 'all' || el.dataset.day === day) && el.dataset.search.toLocaleLowerCase().includes(term);
    rows.forEach(row => { row.hidden = !matches(row); });
    cards.forEach(card => { card.hidden = !matches(card); });
    const key = sort.value;
    const ordered = [...rows].sort((a, b) => {
      if (key === 'day') return originalOrder.get(a) - originalOrder.get(b);
      const av = a.dataset[key] === '' ? -Infinity : Number(a.dataset[key]);
      const bv = b.dataset[key] === '' ? -Infinity : Number(b.dataset[key]);
      return av === bv ? originalOrder.get(a) - originalOrder.get(b) : bv - av;
    });
    document.getElementById('earnTableBody').append(...ordered);
    const count = rows.filter(matches).length;
    document.getElementById('earnCount').textContent = `${count} / 25社を表示。コードを押すと詳細が開きます。`;
    document.getElementById('earnEmpty').hidden = count !== 0;
    filters.forEach(button => {
      const active = button.dataset.dayFilter === day;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    updateExpandLabel();
  }
  function updateExpandLabel() {
    const visible = cards.filter(card => !card.hidden);
    document.getElementById('earnExpand').textContent = visible.length && visible.every(c => c.open)
      ? '表示中の詳細をすべて閉じる' : '表示中の詳細をすべて開く';
  }
  filters.forEach(button => button.addEventListener('click', () => { day = button.dataset.dayFilter; update(); }));
  search.addEventListener('input', update);
  sort.addEventListener('change', update);
  document.getElementById('earnReset').addEventListener('click', () => { day = 'all'; search.value = ''; sort.value = 'day'; update(); });
  document.getElementById('earnExpand').addEventListener('click', () => {
    const visible = cards.filter(card => !card.hidden);
    const open = !visible.every(card => card.open);
    visible.forEach(card => { card.open = open; });
    updateExpandLabel();
  });
  cards.forEach(card => card.addEventListener('toggle', updateExpandLabel));
  document.querySelectorAll('.earn-company-link').forEach(link => link.addEventListener('click', () => {
    const card = document.getElementById(link.hash.slice(1));
    if (card) card.open = true;
  }));
  const hashCard = document.getElementById(location.hash.slice(1));
  if (hashCard && hashCard.classList.contains('earn-company')) hashCard.open = true;
  update();
})();
