// 현황(그래프) 공통 팩토리 — 기간 + 조건별 필터 + 추이(막대)/분류별(도넛) 차트
// 수입검사현황 / 출하검사현황 / 수주현황 / 납품현황 에서 사용
import { db } from '../lib/db.js';
import { num, won, escapeHtml, fmtDate } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { badge, openModal } from '../ui/components.js';

const PALETTE = ['#3b63f0', '#00c2a8', '#7c4dff', '#d97706', '#dc2626', '#16a34a', '#0284c7', '#db2777', '#65a30d', '#9333ea'];
const fmt = (d) => d.toISOString().slice(0, 10);
const today = () => fmt(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d); };
const catVal = (r, key) => (r[key] && String(r[key]).trim()) || '(미지정)';

export function createStatusPage(cfg) {
  const metricFn = (r) => cfg.metric.mode === 'count' ? 1 : (+r[cfg.metric.key] || 0);
  const fmtVal = (v) => cfg.metric.unit === '원' ? won(v) : `${num(v)}${cfg.metric.unit ? ' ' + cfg.metric.unit : ''}`;

  return async function render(root) {
    const state = { from: daysAgo(90), to: today(), filters: {} };
    let allRows = [], rows = [];

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text"><h1>${escapeHtml(cfg.title)}</h1><p>${escapeHtml(cfg.subtitle || '기간·조건별로 현황을 그래프로 확인합니다. 그래프 클릭 시 목록이 표시됩니다.')}</p></div>
        <div class="page-head__actions"><div class="flex" style="gap:8px;flex-wrap:wrap">
          <input class="input input--date" type="date" id="sv-from" value="${state.from}" style="width:auto">
          <span class="muted">~</span>
          <input class="input input--date" type="date" id="sv-to" value="${state.to}" style="width:auto">
          <button class="btn btn--primary" id="sv-search">${icon('search', 16)} 조회</button>
        </div></div>
      </div>
      <div class="card" style="margin-bottom:18px"><div class="toolbar" id="sv-filters"></div></div>
      <div id="sv-stats"></div>
      <div class="card" style="margin-bottom:18px"><div class="card__head">${icon('activity', 18)}<h3>일자별 추이</h3><div class="spacer"></div><span class="muted" id="sv-range"></span></div><div class="card__body" id="sv-trend"></div></div>
      <div class="grid-2" id="sv-charts"></div>`;

    const doSearch = () => { state.from = root.querySelector('#sv-from').value || daysAgo(90); state.to = root.querySelector('#sv-to').value || today(); apply(); };
    root.querySelector('#sv-search').onclick = doSearch;
    root.querySelector('#sv-from').onchange = doSearch;
    root.querySelector('#sv-to').onchange = doSearch;

    function renderFilters() {
      const wrap = root.querySelector('#sv-filters');
      wrap.innerHTML = `<span class="muted" style="font-weight:600">조건</span>` + (cfg.filters || []).map(f => {
        const opts = [...new Set(allRows.map(r => catVal(r, f.key)))].sort();
        return `<select class="select" style="width:auto;min-width:150px" data-fk="${escapeHtml(f.key)}">
          <option value="__all__">전체 ${escapeHtml(f.label)}</option>
          ${opts.map(o => `<option value="${escapeHtml(o)}" ${state.filters[f.key] === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
        </select>`;
      }).join('') || '<span class="muted">조건 없음</span>';
      wrap.querySelectorAll('[data-fk]').forEach(sel => sel.onchange = (e) => { const v = e.target.value; if (v === '__all__') delete state.filters[e.target.dataset.fk]; else state.filters[e.target.dataset.fk] = v; apply(); });
    }

    function apply() {
      rows = allRows.filter(r => {
        const d = String(r[cfg.dateKey] || '').slice(0, 10);
        if (d < state.from || d > state.to) return false;
        for (const [k, v] of Object.entries(state.filters)) if (catVal(r, k) !== v) return false;
        return true;
      });
      root.querySelector('#sv-range').textContent = `${state.from} ~ ${state.to}`;
      renderStats(); renderTrend(); renderCharts();
    }

    function renderStats() {
      root.querySelector('#sv-stats').innerHTML = `<div class="stat-grid">${cfg.stats(rows, { fmtVal, metricFn }).map(c =>
        `<div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(c.label)}</span><span class="stat__ico ico-tint-${c.tint || 'brand'}">${icon(c.icon || 'box', 21)}</span></div>
          <div class="stat__value">${c.value}${c.unit ? `<small>${escapeHtml(c.unit)}</small>` : ''}</div></div>`).join('')}</div>`;
    }

    function renderTrend() {
      const trend = root.querySelector('#sv-trend');
      if (!rows.length) { trend.innerHTML = `<div class="empty" style="padding:40px">${icon('inbox', 48)}<h4>해당 기간 데이터가 없습니다</h4><p>기간·조건을 조정해 보세요. (기본: 최근 90일)</p></div>`; return; }
      trend.innerHTML = trendChart(rows, state.from, state.to, cfg.dateKey, metricFn, cfg.metric.label);
      trend.querySelectorAll('[data-date]').forEach(el => {
        const date = el.dataset.date; const sub = rows.filter(r => String(r[cfg.dateKey] || '').slice(0, 10) === date);
        const v = sub.reduce((s, r) => s + metricFn(r), 0);
        el.addEventListener('mousemove', (e) => showTip(`<b>${date}</b><br>${num(sub.length)}건 · ${fmtVal(v)}${sub.length ? '<br><span style="color:var(--text-3)">클릭하면 목록</span>' : ''}`, e.clientX, e.clientY));
        el.addEventListener('mouseleave', hideTip);
        el.addEventListener('click', () => { if (sub.length) { hideTip(); openListModal(`${date}`, sub); } });
      });
    }

    function renderCharts() {
      const charts = root.querySelector('#sv-charts');
      if (!rows.length) { charts.innerHTML = ''; return; }
      charts.innerHTML = cfg.dims.map(dm => donutCard(dm.label, dm.icon, dm.key, rows, metricFn, fmtVal)).join('');
      charts.querySelectorAll('[data-cat]').forEach(el => {
        const card = el.closest('[data-key]'); const key = card.dataset.key, title = card.dataset.title, cat = el.dataset.cat;
        const sub = rows.filter(r => catVal(r, key) === cat); const v = sub.reduce((s, r) => s + metricFn(r), 0);
        el.addEventListener('mousemove', (e) => showTip(`<b>${escapeHtml(cat)}</b><br>${num(sub.length)}건 · ${fmtVal(v)}<br><span style="color:var(--text-3)">클릭하면 목록</span>`, e.clientX, e.clientY));
        el.addEventListener('mouseleave', hideTip);
        el.addEventListener('click', () => { hideTip(); openListModal(`${title} · ${cat}`, sub); });
      });
    }

    function openListModal(title, list) {
      const body = document.createElement('div');
      body.innerHTML = list.length ? `<div class="table-wrap"><table class="grid"><thead><tr>${cfg.listCols.map(c => `<th class="${c.align || ''}">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${list.map(r => `<tr>${cfg.listCols.map(c => `<td class="${c.align || ''} ${c.cls || ''}">${c.render ? c.render(r) : escapeHtml(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        : `<div class="empty" style="padding:30px">${icon('inbox', 40)}<h4>데이터가 없습니다</h4></div>`;
      openModal({ title: `${title} — ${list.length}건`, body, wide: true, footer: `<button class="btn" data-cancel>닫기</button>`, onMount: ({ footEl, close }) => { footEl.querySelector('[data-cancel]').onclick = close; } });
    }

    try { allRows = cfg.loader ? await cfg.loader() : await db.all(cfg.table, {}); }
    catch (e) { root.querySelector('#sv-trend').innerHTML = `<div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; return; }
    renderFilters(); apply();
  };
}

function aggBy(rows, key, metricFn) {
  const m = {};
  for (const r of rows) { const k = catVal(r, key); (m[k] ??= { count: 0, val: 0 }); m[k].count++; m[k].val += metricFn(r); }
  return Object.entries(m).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.val - a.val || b.count - a.count);
}
function niceMax(v) { if (v <= 0) return 5; const pow = Math.pow(10, Math.floor(Math.log10(v))); const step = pow / 2 || 1; return Math.ceil(v / step) * step; }

function trendChart(rows, from, to, dateKey, metricFn, unitLabel) {
  const days = []; let d = new Date(from); const end = new Date(to);
  while (d <= end && days.length < 120) { days.push(fmt(d)); d = new Date(d.getTime() + 86400000); }
  const map = {}; for (const r of rows) { const k = String(r[dateKey] || '').slice(0, 10); map[k] = (map[k] || 0) + metricFn(r); }
  const max = niceMax(Math.max(1, ...days.map(x => map[x] || 0)));
  const PLOT = 180, labelEvery = Math.ceil(days.length / 12);
  const yTicks = [1, 0.75, 0.5, 0.25, 0].map(f => `<div style="line-height:1">${num(Math.round(max * f))}</div>`).join('');
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => `<div style="position:absolute;left:0;right:0;bottom:${(f * 100).toFixed(2)}%;border-top:1px ${f === 0 ? 'solid' : 'dashed'} var(--border)"></div>`).join('');
  const bars = days.map(x => { const v = map[x] || 0; const h = v / max * 100;
    return `<div class="trend-bar" data-date="${x}" style="flex:1;min-width:5px;height:100%;display:flex;align-items:flex-end"><div style="width:70%;margin:0 auto;height:${h.toFixed(2)}%;min-height:${v ? 3 : 0}px;background:linear-gradient(180deg,var(--brand-400),var(--brand-600));border-radius:3px 3px 0 0"></div></div>`; }).join('');
  const xLabels = days.map((x, i) => `<div style="flex:1;min-width:5px;text-align:center;font-size:9.5px;color:var(--text-3);white-space:nowrap;overflow:hidden">${i % labelEvery === 0 ? x.slice(5) : ''}</div>`).join('');
  return `<div style="display:flex;gap:8px;align-items:stretch">
      <div style="width:46px;height:${PLOT}px;display:flex;flex-direction:column;justify-content:space-between;text-align:right;font-size:10px;color:var(--text-3);padding-bottom:1px">${yTicks}</div>
      <div style="flex:1;min-width:0"><div style="position:relative;height:${PLOT}px">${grid}<div style="position:absolute;inset:0;display:flex;align-items:flex-end;gap:3px">${bars}</div></div>
        <div style="display:flex;gap:3px;margin-top:5px">${xLabels}</div>
        <div style="text-align:center;font-size:11px;color:var(--text-3);margin-top:6px">일자 (단위: ${escapeHtml(unitLabel)})</div></div></div>`;
}

function donutCard(title, ic, key, rows, metricFn, fmtVal) {
  const data = aggBy(rows, key, metricFn); const total = data.reduce((s, d) => s + d.val, 0) || 1; let cum = 0;
  const segs = data.map((d, i) => { const pct = d.val / total * 100; const off = 25 - cum; cum += pct;
    return `<circle class="donut-seg" data-cat="${escapeHtml(d.label)}" cx="21" cy="21" r="15.915" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="6" stroke-dasharray="${pct.toFixed(3)} ${(100 - pct).toFixed(3)}" stroke-dashoffset="${off.toFixed(3)}"></circle>`; }).join('');
  const legend = data.map((d, i) => `<div class="ncr-legend-item flex between" data-cat="${escapeHtml(d.label)}" style="padding:6px 8px">
    <div class="flex" style="gap:8px;min-width:0"><span style="width:11px;height:11px;border-radius:3px;background:${PALETTE[i % PALETTE.length]};flex-shrink:0"></span><span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(d.label)}</span></div>
    <span class="mono muted" style="flex-shrink:0">${fmtVal(d.val)} · ${num(d.count)}건</span></div>`).join('');
  return `<div class="card" data-key="${key}" data-title="${escapeHtml(title)}"><div class="card__head">${icon(ic, 18)}<h3>${escapeHtml(title)}</h3></div>
    <div class="card__body" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
      <div style="position:relative;width:150px;height:150px;flex-shrink:0">
        <svg viewBox="0 0 42 42" width="150" height="150"><circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--border)" stroke-width="6"></circle>${segs}</svg>
        <div style="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;text-align:center"><div><div class="muted" style="font-size:11px">합계</div><div style="font-size:16px;font-weight:800" class="mono">${fmtVal(total)}</div></div></div>
      </div><div style="flex:1;min-width:180px">${legend}</div></div></div>`;
}

let tipEl;
function showTip(html, x, y) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; document.body.appendChild(tipEl); }
  tipEl.innerHTML = html; tipEl.style.display = 'block';
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight; let left = x + 14, top = y + 14;
  if (left + w > window.innerWidth) left = x - w - 14; if (top + h > window.innerHeight) top = y - h - 14;
  tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
}
function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

// ---------- 4개 현황 정의 ----------
const resultBadge = (r) => r.result ? badge(r.result) : '-';

export const incomingStatus = createStatusPage({
  title: '수입검사현황', table: 'incoming_inspections', dateKey: 'inspect_date',
  metric: { mode: 'count', unit: '건', label: '검사 건수' },
  dims: [{ label: '판정별', icon: 'shield', key: 'result' }, { label: '거래처별', icon: 'cart', key: 'partner' }, { label: '품목별', icon: 'box', key: 'item_name' }],
  filters: [{ key: 'result', label: '판정' }, { key: 'partner', label: '거래처' }],
  stats: (rows) => {
    const pass = rows.filter(r => r.result === '합격').length;
    return [
      { label: '조회기간 검사', value: num(rows.length), unit: '건', icon: 'shield', tint: 'brand' },
      { label: '합격', value: num(pass), unit: '건', icon: 'checkCircle', tint: 'green' },
      { label: '불합격', value: num(rows.filter(r => r.result === '불합격').length), unit: '건', icon: 'alert', tint: 'red' },
      { label: '합격률', value: rows.length ? ((pass / rows.length) * 100).toFixed(1) : '0.0', unit: '%', icon: 'trendUp', tint: 'violet' },
    ];
  },
  listCols: [{ label: '검사번호', key: 'inspect_no', cls: 'cell-code' }, { label: '검사일', key: 'inspect_date', render: (r) => fmtDate(r.inspect_date) }, { label: '거래처', key: 'partner' }, { label: '품명', key: 'item_name', cls: 'cell-strong' }, { label: '검사', key: 'inspect_qty', align: 'num' }, { label: '불량', key: 'defect_qty', align: 'num' }, { label: '판정', key: 'result', align: 'center', render: resultBadge }],
});

export const shippingStatus = createStatusPage({
  title: '출하검사현황', table: 'shipping_inspections', dateKey: 'inspect_date',
  metric: { mode: 'count', unit: '건', label: '검사 건수' },
  dims: [{ label: '판정별', icon: 'shield', key: 'result' }, { label: '거래처별', icon: 'cart', key: 'partner' }, { label: '품목별', icon: 'box', key: 'item_name' }],
  filters: [{ key: 'result', label: '판정' }, { key: 'partner', label: '거래처' }],
  stats: (rows) => {
    const pass = rows.filter(r => r.result === '합격').length;
    return [
      { label: '조회기간 검사', value: num(rows.length), unit: '건', icon: 'shield', tint: 'brand' },
      { label: '합격', value: num(pass), unit: '건', icon: 'checkCircle', tint: 'green' },
      { label: '불합격/조건부', value: num(rows.filter(r => r.result && r.result !== '합격').length), unit: '건', icon: 'alert', tint: 'amber' },
      { label: '합격률', value: rows.length ? ((pass / rows.length) * 100).toFixed(1) : '0.0', unit: '%', icon: 'trendUp', tint: 'violet' },
    ];
  },
  listCols: [{ label: '검사번호', key: 'inspect_no', cls: 'cell-code' }, { label: '검사일', key: 'inspect_date', render: (r) => fmtDate(r.inspect_date) }, { label: '수주번호', key: 'order_no', cls: 'cell-code' }, { label: '거래처', key: 'partner' }, { label: '품명', key: 'item_name', cls: 'cell-strong' }, { label: '판정', key: 'result', align: 'center', render: resultBadge }],
});

export const salesStatus = createStatusPage({
  title: '수주현황', table: 'sales_orders', dateKey: 'order_date',
  metric: { mode: 'sum', key: 'amount', unit: '원', label: '수주금액' },
  dims: [{ label: '거래처별', icon: 'cart', key: 'partner' }, { label: '품목별', icon: 'box', key: 'item_name' }, { label: '상태별', icon: 'sliders', key: 'status' }],
  filters: [{ key: 'status', label: '상태' }, { key: 'partner', label: '거래처' }],
  stats: (rows) => [
    { label: '수주 건수', value: num(rows.length), unit: '건', icon: 'cart', tint: 'brand' },
    { label: '수주 수량', value: num(rows.reduce((s, r) => s + (+r.order_qty || 0), 0)), unit: 'EA', icon: 'box', tint: 'violet' },
    { label: '수주 금액', value: won(rows.reduce((s, r) => s + (+r.amount || 0), 0)), unit: '', icon: 'dollar', tint: 'green' },
    { label: '진행중', value: num(rows.filter(r => ['접수', '생산중'].includes(r.status)).length), unit: '건', icon: 'clock', tint: 'amber' },
  ],
  listCols: [{ label: '수주번호', key: 'order_no', cls: 'cell-code' }, { label: '수주일', key: 'order_date', render: (r) => fmtDate(r.order_date) }, { label: '거래처', key: 'partner' }, { label: '품명', key: 'item_name', cls: 'cell-strong' }, { label: '수량', key: 'order_qty', align: 'num' }, { label: '금액', key: 'amount', align: 'num', render: (r) => won(r.amount) }, { label: '상태', key: 'status', align: 'center', render: (r) => badge(r.status || '') }],
});

// 납품현황 — 납품관리와 동일하게 생산완료 수주 기반(납품대기 포함). 기준일=납품완료일 or 납기예정일
async function deliveryStatusLoader() {
  const [orders, plans, wos, dels] = await Promise.all([
    db.all('sales_orders', {}), db.all('production_plans', {}), db.all('work_orders', {}), db.all('deliveries', {}),
  ]);
  const planByOrder = {}; for (const p of plans) (planByOrder[p.order_no] ??= []).push(p.plan_no);
  const allWoComplete = (pns) => { const ws = wos.filter(w => pns.includes(w.plan_no)); return ws.length > 0 && ws.every(w => w.status === '완료'); };
  const prodComplete = (o) => o.status === '완료' || allWoComplete(planByOrder[o.order_no] || []);
  const delByOrder = {}; for (const d of dels) if (d.status === '납품완료') delByOrder[d.order_no] = d;
  return orders.filter(prodComplete).map(o => {
    const dd = delByOrder[o.order_no];
    const completeDate = dd ? String(dd.delivery_date || '').slice(0, 10) : '';
    const due = String(o.due_date || '').slice(0, 10);
    return {
      order_no: o.order_no, partner: o.partner, item_name: o.item_name, delivery_qty: +o.order_qty || 0,
      amount: +o.amount || 0, status: dd ? '납품완료' : '납품대기',
      delivery_no: dd ? dd.delivery_no : '', complete_date: completeDate, due_date: due,
      ref_date: completeDate || due, // 추이/기간 기준일
    };
  });
}

export const deliveryStatus = createStatusPage({
  title: '납품현황', loader: deliveryStatusLoader, dateKey: 'ref_date',
  subtitle: '생산완료 수주 기준 납품 현황입니다. (납품대기 포함, 기준일: 납품완료일·미납은 납기예정일)',
  metric: { mode: 'sum', key: 'amount', unit: '원', label: '납품금액' },
  dims: [{ label: '상태별', icon: 'sliders', key: 'status' }, { label: '거래처별', icon: 'cart', key: 'partner' }, { label: '품목별', icon: 'box', key: 'item_name' }],
  filters: [{ key: 'status', label: '상태' }, { key: 'partner', label: '거래처' }],
  stats: (rows) => [
    { label: '대상 건수', value: num(rows.length), unit: '건', icon: 'truck', tint: 'brand' },
    { label: '납품완료', value: num(rows.filter(r => r.status === '납품완료').length), unit: '건', icon: 'checkCircle', tint: 'green' },
    { label: '납품대기', value: num(rows.filter(r => r.status === '납품대기').length), unit: '건', icon: 'clock', tint: 'amber' },
    { label: '납품 금액(완료)', value: won(rows.filter(r => r.status === '납품완료').reduce((s, r) => s + (+r.amount || 0), 0)), unit: '', icon: 'dollar', tint: 'violet' },
  ],
  listCols: [{ label: '수주번호', key: 'order_no', cls: 'cell-code' }, { label: '거래처', key: 'partner' }, { label: '품명', key: 'item_name', cls: 'cell-strong' }, { label: '금액', key: 'amount', align: 'num', render: (r) => won(r.amount) }, { label: '납기예정', key: 'due_date', render: (r) => fmtDate(r.due_date) }, { label: '납품완료', key: 'complete_date', render: (r) => r.complete_date ? fmtDate(r.complete_date) : '-' }, { label: '상태', key: 'status', align: 'center', render: (r) => badge(r.status || '') }],
});
