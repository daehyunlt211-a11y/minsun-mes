// 생산관리: 생산계획 / 작업지시(LOT·공정이동전표) / 생산실적(양품 자동집계) / 생산일보 / 생산현황판
import { createCrudPage } from '../lib/crud.js';
import { db } from '../lib/db.js';
import { num, todayStr, fmtDate, escapeHtml, nextDocNo } from '../lib/format.js';
import { badge, toast, openModal } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { printWorkOrderSheet } from '../lib/barcode.js';

// 연계 파이프라인 패널 (상단에 "다음 단계 대기" 항목 표시)
function pipelinePanel(slot, { tint, ic, title, desc, items, actionLabel, renderMeta, onAction }, reload) {
  if (!items.length) { slot.innerHTML = ''; return; }
  slot.innerHTML = `<div class="card" style="margin-bottom:16px;border-color:var(--brand-200)">
    <div class="card__head" style="background:var(--brand-50)">
      <span class="stat__ico ico-tint-${tint}" style="width:34px;height:34px">${icon(ic, 18)}</span>
      <h3>${escapeHtml(title)} <span class="badge badge--brand">${items.length}</span></h3>
      <span class="muted" style="margin-left:8px">${escapeHtml(desc)}</span>
    </div>
    <div class="card__body" style="display:flex;gap:12px;flex-wrap:wrap">
      ${items.map((it, i) => `<div style="flex:1;min-width:280px;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px 16px">
        <div class="flex between" style="margin-bottom:8px"><span class="cell-code">${escapeHtml(it._code)}</span>${it._badge || ''}</div>
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">${escapeHtml(it._title)}</div>
        <div class="muted" style="margin-bottom:12px">${renderMeta(it)}</div>
        <button class="btn btn--primary btn--sm" data-act="${i}" style="width:100%">${icon('chevronRight', 14)} ${escapeHtml(actionLabel)}</button>
      </div>`).join('')}
    </div>
  </div>`;
  slot.querySelectorAll('[data-act]').forEach(b => b.onclick = () => onAction(items[+b.dataset.act], reload));
}

// 3-1 생산계획관리
export const productionPlans = createCrudPage({
  table: 'production_plans', title: '생산계획관리', subtitle: '수주 기반 생산계획을 수립하고 일정을 관리합니다.',
  searchFields: ['plan_no', 'order_no', 'item_code', 'item_name', 'line'], searchPlaceholder: '계획번호·수주·품목 검색',
  defaultSort: { key: 'plan_date', dir: 'desc' },
  dateField: { key: 'plan_date', label: '계획일' },
  filters: [{ key: 'status', label: '상태', options: ['계획', '진행', '완료', '보류'] }],
  statusChips: { key: 'status', options: ['계획', '진행', '완료', '보류'] },
  docNoField: { key: 'plan_no', prefix: 'PP' },
  banner: async (slot, reload) => {
    const [orders, plans] = await Promise.all([db.all('sales_orders', {}), db.all('production_plans', {})]);
    const planned = new Set(plans.map(p => p.order_no).filter(Boolean));
    const pending = orders.filter(o => !['취소', '완료'].includes(o.status) && !planned.has(o.order_no));
    pipelinePanel(slot, {
      tint: 'brand', ic: 'cart', title: '생산계획 대기 수주', desc: '수주에 생산계획일을 지정해 계획을 생성하세요.',
      items: pending.map(o => ({ ...o, _code: o.order_no, _title: o.item_name, _badge: badge(o.status) })),
      actionLabel: '생산계획 생성',
      renderMeta: (o) => `거래처 ${escapeHtml(o.partner || '-')} · 수량 ${num(o.order_qty)} · 납기 ${escapeHtml((o.due_date || '').slice(0, 10) || '-')}`,
      onAction: openPlanModal,
    }, reload);
  },
  stats: async (rows) => [
    { label: '총 계획건수', value: num(rows.length), unit: '건', icon: 'calendar', tint: 'brand' },
    { label: '진행중', value: num(rows.filter(r => r.status === '진행').length), unit: '건', icon: 'activity', tint: 'amber' },
    { label: '완료', value: num(rows.filter(r => r.status === '완료').length), unit: '건', icon: 'checkCircle', tint: 'green' },
    { label: '계획수량 합계', value: num(rows.reduce((s, r) => s + (+r.plan_qty || 0), 0)), unit: 'EA', icon: 'box', tint: 'violet' },
  ],
  columns: [
    { key: 'plan_no', label: '계획번호', cls: 'cell-code', sortable: true },
    { key: 'plan_date', label: '계획일', type: 'date', sortable: true },
    { key: 'order_no', label: '수주번호', cls: 'cell-code' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'plan_qty', label: '계획수량', type: 'num', sortable: true },
    { key: 'start_date', label: '시작일', type: 'date' },
    { key: 'end_date', label: '종료일', type: 'date' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'plan_no', label: '계획번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'plan_date', label: '계획일', type: 'date', required: true, default: todayStr() },
    { key: 'order_no', label: '수주 선택', ref: { table: 'sales_orders', value: 'order_no', label: (r) => `${r.order_no} · ${r.item_name} (${r.order_qty})`, fill: { item_code: 'item_code', item_name: 'item_name', plan_qty: 'order_qty' } }, placeholder: '수주 선택 (없으면 직접 입력)' },
    { key: 'item_code', label: '품목코드(자동)', required: true, readonly: true },
    { key: 'item_name', label: '품명(자동)', required: true, readonly: true },
    { key: 'plan_qty', label: '계획수량', type: 'number', required: true, default: 0 },
    { key: 'start_date', label: '시작일', type: 'date' },
    { key: 'end_date', label: '종료일', type: 'date' },
    { key: 'status', label: '상태', type: 'select', options: ['계획', '진행', '완료', '보류'], default: '계획' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 3-2 작업지시관리
export const workOrders = createCrudPage({
  table: 'work_orders', title: '작업지시관리', subtitle: '생산계획을 작업지시로 전개하고 현장에 배포합니다.',
  searchFields: ['wo_no', 'plan_no', 'item_name', 'process', 'equipment', 'worker'], searchPlaceholder: '작업지시·품목·공정 검색',
  defaultSort: { key: 'wo_date', dir: 'desc' },
  dateField: { key: 'wo_date', label: '지시일' },
  filters: [
    { key: 'status', label: '상태', options: ['대기', '작업중', '완료', '중단'] },
    { key: 'line', label: '라인', options: ['가공1라인', '가공2라인', '조립라인', '포장라인'] },
  ],
  statusChips: { key: 'status', options: ['대기', '작업중', '완료', '중단'] },
  docNoField: { key: 'wo_no', prefix: 'WO' },
  banner: async (slot, reload) => {
    const [plans, wos] = await Promise.all([db.all('production_plans', {}), db.all('work_orders', {})]);
    const hasWo = new Set(wos.map(w => w.plan_no).filter(Boolean));
    const pending = plans.filter(p => p.status !== '완료' && !hasWo.has(p.plan_no));
    pipelinePanel(slot, {
      tint: 'violet', ic: 'calendar', title: '작업지시 대기 계획', desc: '생산계획을 작업지시로 전개하세요.',
      items: pending.map(p => ({ ...p, _code: p.plan_no, _title: p.item_name, _badge: badge(p.status) })),
      actionLabel: '작업지시 생성',
      renderMeta: (p) => `수량 ${num(p.plan_qty)} · 시작 ${escapeHtml((p.start_date || '').slice(0, 10) || '-')} · 종료 ${escapeHtml((p.end_date || '').slice(0, 10) || '-')}`,
      onAction: openWoModal,
    }, reload);
  },
  rowActions: [
    {
      label: '작업시작', icon: 'activity', cls: 'btn--primary', title: '작업시작(POP에 표시)',
      show: (r) => r.status === '대기',
      onClick: async (r, reload) => {
        try { await db.update('work_orders', r.id, { status: '작업중', start_date: r.start_date || todayStr() }); toast('작업을 시작했습니다. POP에서 진행하세요.'); reload(); }
        catch (e) { toast(e.message || '실패', 'error'); }
      },
    },
    {
      label: '전표출력', icon: 'fileText', title: '작업지시서/공정이동전표(바코드) 인쇄',
      onClick: async (r) => {
        // LOT 미부여 시 자동 부여 (LOT = 작업지시번호 기반)
        let lot = r.lot_no;
        if (!lot) {
          lot = 'LOT-' + r.wo_no;
          try { await db.update('work_orders', r.id, { lot_no: lot }); r.lot_no = lot; } catch { /* noop */ }
        }
        let procs = [];
        try {
          procs = await db.all('work_order_processes', { filters: { wo_no: r.wo_no }, sort: 'seq' });
          if (!procs.length && r.item_code) procs = await db.all('item_processes', { filters: { item_code: r.item_code }, sort: 'seq' });
        } catch { procs = []; }
        printWorkOrderSheet(r, procs);
      },
    },
  ],
  stats: async (rows) => [
    { label: '총 작업지시', value: num(rows.length), unit: '건', icon: 'clipboard', tint: 'brand' },
    { label: '작업중', value: num(rows.filter(r => r.status === '작업중').length), unit: '건', icon: 'activity', tint: 'amber' },
    { label: '대기', value: num(rows.filter(r => r.status === '대기').length), unit: '건', icon: 'clock', tint: 'violet' },
    { label: '완료', value: num(rows.filter(r => r.status === '완료').length), unit: '건', icon: 'checkCircle', tint: 'green' },
  ],
  columns: [
    { key: 'wo_no', label: '작업지시번호', cls: 'cell-code', sortable: true },
    { key: 'lot_no', label: 'LOT No.', cls: 'cell-code', render: (r) => escapeHtml(r.lot_no || ('LOT-' + r.wo_no)) },
    { key: 'wo_date', label: '지시일', type: 'date', sortable: true },
    { key: 'item_code', label: '품목코드', cls: 'cell-code' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'order_qty', label: '지시수량', type: 'num', sortable: true },
    { key: 'plan_no', label: '생산계획', cls: 'cell-code' },
    { key: 'start_date', label: '계획시작', type: 'date' },
    { key: 'due_date', label: '계획종료', type: 'date' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  // LOT 번호 미입력 시 작업지시번호 기반 자동 부여 (전표 바코드와 동일 체계)
  beforeSave: (data) => { if (!data.lot_no && data.wo_no) data.lot_no = 'LOT-' + data.wo_no; },
  fields: [
    { key: 'wo_no', label: '작업지시번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'lot_no', label: 'LOT No. (자동부여)', placeholder: '비워두면 LOT-작업지시번호로 부여' },
    { key: 'wo_date', label: '지시일', type: 'date', required: true, default: todayStr() },
    { key: 'plan_no', label: '생산계획 선택', ref: { table: 'production_plans', value: 'plan_no', label: (r) => `${r.plan_no} · ${r.item_name} (${r.plan_qty})`, fill: { item_code: 'item_code', item_name: 'item_name', order_qty: 'plan_qty', start_date: 'start_date', due_date: 'end_date' } }, placeholder: '생산계획 선택 (없으면 직접 입력)' },
    { key: 'item_code', label: '품목코드(자동)', required: true, readonly: true },
    { key: 'item_name', label: '품명(자동)', required: true, readonly: true },
    { key: 'order_qty', label: '지시수량', type: 'number', required: true, default: 0 },
    { key: 'start_date', label: '계획 시작일', type: 'date' },
    { key: 'due_date', label: '계획 종료일', type: 'date' },
    { key: 'status', label: '상태', type: 'select', options: ['대기', '작업중', '완료', '중단'], default: '대기' },
    { key: 'remark', label: '비고', type: 'textarea', col2: true },
  ],
});

// 3-3 생산실적 (양품수량 = 생산수량 - 불량수량 자동집계)
export const productionResults = createCrudPage({
  table: 'production_results', title: '생산실적', subtitle: '작업지시별 생산 실적을 등록합니다. 양품수량 = 생산수량 - 불량수량으로 자동집계됩니다.',
  searchFields: ['result_no', 'wo_no', 'lot_no', 'item_name', 'process', 'worker', 'machine_no'], searchPlaceholder: '실적번호·작업지시·LOT·품목 검색',
  defaultSort: { key: 'result_date', dir: 'desc' },
  dateField: { key: 'result_date', label: '실적일' },
  docNoField: { key: 'result_no', prefix: 'PR' },
  // 양품 자동집계: 생산수량 - 불량수량 (화면 실시간 + 저장 시 확정)
  computed: (form) => {
    const pq = form.querySelector('[name="prod_qty"]');
    const dq = form.querySelector('[name="defect_qty"]');
    const gq = form.querySelector('[name="good_qty"]');
    const calc = () => { if (gq) gq.value = Math.max(0, (Number(pq?.value) || 0) - (Number(dq?.value) || 0)); };
    [pq, dq].forEach(el => el && el.addEventListener('input', calc));
  },
  beforeSave: (data) => { data.good_qty = Math.max(0, (Number(data.prod_qty) || 0) - (Number(data.defect_qty) || 0)); },
  stats: async (rows) => {
    const good = rows.reduce((s, r) => s + (+r.good_qty || 0), 0);
    const defect = rows.reduce((s, r) => s + (+r.defect_qty || 0), 0);
    const total = good + defect;
    const ppm = total ? Math.round(defect / total * 1000000) : 0;
    return [
      { label: '총 생산수량', value: num(total), unit: 'EA', icon: 'factory', tint: 'brand' },
      { label: '양품수량', value: num(good), unit: 'EA', icon: 'checkCircle', tint: 'green' },
      { label: '불량수량', value: num(defect), unit: 'EA', icon: 'alert', tint: 'red' },
      { label: '불량률', value: num(ppm), unit: 'PPM', icon: 'trendDown', tint: 'violet' },
    ];
  },
  columns: [
    { key: 'result_no', label: '실적번호', cls: 'cell-code', sortable: true },
    { key: 'result_date', label: '실적일', type: 'date', sortable: true },
    { key: 'wo_no', label: '작업지시', cls: 'cell-code' },
    { key: 'lot_no', label: 'LOT', cls: 'cell-code' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'process', label: '공정' },
    { key: 'machine_no', label: '호기', align: 'center' },
    { key: 'prod_qty', label: '생산', type: 'num', sortable: true },
    { key: 'defect_qty', label: '불량', type: 'num', sortable: true },
    { key: 'good_qty', label: '양품(자동)', type: 'num', sortable: true },
    { key: 'rework_yn', label: '재작업', align: 'center', csv: (r) => (r.rework_yn ? 'Y' : 'N'), render: (r) => (r.rework_yn ? badge('재작업', 'warning') : '') },
    {
      key: 'rate', label: '양품률', align: 'center', csv: (r) => { const t = (+r.good_qty || 0) + (+r.defect_qty || 0); return t ? Math.round((+r.good_qty || 0) / t * 100) + '%' : ''; }, render: (r) => {
        const t = (+r.good_qty || 0) + (+r.defect_qty || 0);
        const v = t ? Math.round((+r.good_qty || 0) / t * 100) : 0;
        const tone = v >= 98 ? 'success' : v >= 90 ? 'warning' : 'danger';
        return badge(v + '%', tone);
      }
    },
    { key: 'worker', label: '작업자' },
  ],
  fields: [
    { key: 'result_no', label: '실적번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'result_date', label: '실적일', type: 'date', required: true, default: todayStr() },
    { key: 'wo_no', label: '작업지시 선택', ref: { table: 'work_orders', value: 'wo_no', label: (r) => `${r.wo_no} · ${r.item_name} · ${r.process || ''}`, fill: { item_code: 'item_code', item_name: 'item_name', lot_no: 'lot_no', process: 'process', equipment: 'equipment', machine_no: 'machine_no', worker: 'worker' } }, placeholder: '작업지시 선택' },
    { key: 'lot_no', label: 'LOT No.(자동)', readonly: true },
    { key: 'item_code', label: '품목코드(자동)', readonly: true },
    { key: 'item_name', label: '품명(자동)', required: true, readonly: true },
    { key: 'process', label: '공정', ref: { table: 'processes', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '공정 선택' },
    { key: 'equipment', label: '설비', ref: { table: 'equipments', value: 'name', label: (r) => `${r.code} · ${r.name}${r.machine_no ? ` [${r.machine_no}]` : ''}`, fill: { machine_no: 'machine_no' } }, placeholder: '설비 선택' },
    { key: 'machine_no', label: '호기(자동)', placeholder: '설비 선택 시 자동' },
    { key: 'worker', label: '작업자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '작업자 선택' },
    { key: 'prod_qty', label: '생산수량', type: 'number', required: true, default: 0 },
    { key: 'defect_qty', label: '불량수량', type: 'number', default: 0 },
    { key: 'good_qty', label: '양품수량(자동집계)', type: 'number', readonly: true, default: 0 },
    { key: 'rework_yn', label: '재작업 여부', type: 'switch', default: false },
    { key: 'work_time', label: '작업시간(분)', type: 'number', default: 0 },
    { key: 'status', label: '상태', type: 'select', options: ['진행', '완료'], default: '완료' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 3-3b 생산일보 — 일자별 실적 자동집계 (작업지시·생산·불량·작업시간 → 나머지 자동)
export async function dailyReport(root) {
  const state = { date: todayStr() };
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>생산일보</h1><p>일자별 생산실적이 자동 집계됩니다. (양품 = 생산수량 - 불량수량)</p></div>
      <div class="page-head__actions">
        <input class="input input--date" type="date" id="dr-date" value="${state.date}" style="width:auto"/>
        <button class="btn" id="dr-print">${icon('fileText', 16)} 인쇄</button>
        <button class="btn" id="dr-refresh">${icon('refresh', 16)} 새로고침</button>
      </div>
    </div>
    <div id="dr-stats"></div>
    <div class="card"><div class="card__head">${icon('factory', 18)}<h3 id="dr-title">생산일보</h3></div>
      <div class="table-wrap"><div id="dr-table"><div class="spinner"></div></div></div></div>`;

  root.querySelector('#dr-date').onchange = (e) => { state.date = e.target.value; load(); };
  root.querySelector('#dr-refresh').onclick = () => load();
  root.querySelector('#dr-print').onclick = () => window.print();

  async function load() {
    const slot = root.querySelector('#dr-table');
    slot.innerHTML = `<div class="spinner"></div>`;
    let rows = [];
    try { rows = await db.all('production_results', { dateRange: { key: 'result_date', from: state.date, to: state.date } }); }
    catch (e) { slot.innerHTML = `<div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; return; }
    root.querySelector('#dr-title').textContent = `생산일보 — ${state.date}`;

    const prod = rows.reduce((s, r) => s + ((+r.prod_qty || 0) || (+r.good_qty || 0) + (+r.defect_qty || 0)), 0);
    const defect = rows.reduce((s, r) => s + (+r.defect_qty || 0), 0);
    const good = rows.reduce((s, r) => s + (+r.good_qty || 0), 0);
    const time = rows.reduce((s, r) => s + (+r.work_time || 0), 0);
    const uph = time ? Math.round(good / (time / 60)) : 0;
    root.querySelector('#dr-stats').innerHTML = `<div class="stat-grid">
      ${statCard('생산수량', num(prod), 'EA', 'factory', 'brand')}
      ${statCard('양품수량', num(good), 'EA', 'checkCircle', 'green')}
      ${statCard('불량수량', num(defect), 'EA', 'alert', 'red')}
      ${statCard('시간당 생산량', num(uph), 'EA/h', 'trendUp', 'violet')}</div>`;

    if (!rows.length) { slot.innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>해당 일자의 실적이 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>작업지시</th><th>LOT</th><th>품명</th><th>공정</th><th>호기</th><th>작업자</th>
      <th class="num">생산</th><th class="num">불량</th><th class="num">양품</th><th class="num">작업시간(분)</th><th class="center">재작업</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td class="cell-code">${escapeHtml(r.wo_no || '')}</td><td class="cell-code">${escapeHtml(r.lot_no || '')}</td>
        <td class="cell-strong">${escapeHtml(r.item_name || '')}</td><td>${escapeHtml(r.process || '')}</td>
        <td class="center">${escapeHtml(r.machine_no || '')}</td><td>${escapeHtml(r.worker || '')}</td>
        <td class="num mono">${num((+r.prod_qty || 0) || (+r.good_qty || 0) + (+r.defect_qty || 0))}</td>
        <td class="num mono">${num(r.defect_qty)}</td>
        <td class="num mono" style="font-weight:700">${num(r.good_qty)}</td>
        <td class="num mono">${num(r.work_time)}</td>
        <td class="center">${r.rework_yn ? badge('재작업', 'warning') : ''}</td>
      </tr>`).join('')}
      <tr style="background:var(--surface-2);font-weight:700">
        <td colspan="6">합계</td>
        <td class="num mono">${num(prod)}</td><td class="num mono">${num(defect)}</td>
        <td class="num mono">${num(good)}</td><td class="num mono">${num(time)}</td><td></td></tr>
      </tbody></table>`;
  }
  load();
}

// 3-4 생산현황판 (커스텀 — 칸반 + 실시간 요약)
export async function productionBoard(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>생산현황판</h1><p>작업지시 진행 상황과 금일 생산 실적을 한눈에 모니터링합니다.</p></div>
      <div class="page-head__actions"><button class="btn" id="bd-refresh">${icon('refresh', 16)} 새로고침</button></div>
    </div>
    <div id="bd-stats"></div>
    <div class="card" style="margin-bottom:18px"><div class="card__head">${icon('layers', 18)}<h3>작업지시 진행현황 (Kanban)</h3></div>
      <div class="card__body" id="bd-kanban"></div></div>
    <div class="grid-2">
      <div class="card"><div class="card__head">${icon('factory', 18)}<h3>금일 생산실적</h3></div><div class="card__body" id="bd-today"></div></div>
      <div class="card"><div class="card__head">${icon('cpu', 18)}<h3>설비 가동현황</h3></div><div class="card__body" id="bd-equip"></div></div>
    </div>`;

  root.querySelector('#bd-refresh').onclick = () => productionBoard(root);

  const [wos, results, equips] = await Promise.all([
    db.all('work_orders', {}), db.all('production_results', {}), db.all('equipments', {}),
  ]);

  // 통계
  const today = todayStr();
  const todayRes = results.filter(r => String(r.result_date).slice(0, 10) === today);
  const good = todayRes.reduce((s, r) => s + (+r.good_qty || 0), 0);
  const defect = todayRes.reduce((s, r) => s + (+r.defect_qty || 0), 0);
  const total = good + defect;
  const rate = total ? ((good / total) * 100).toFixed(1) : '0.0';
  const running = wos.filter(w => w.status === '작업중').length;
  root.querySelector('#bd-stats').innerHTML = `<div class="stat-grid">
    ${statCard('금일 생산량', num(total), 'EA', 'factory', 'brand')}
    ${statCard('금일 양품', num(good), 'EA', 'checkCircle', 'green')}
    ${statCard('금일 불량', num(defect), 'EA', 'alert', 'red')}
    ${statCard('가동 작업', num(running), '건', 'activity', 'amber')}
  </div>`;

  // 칸반
  const cols = [
    { key: '대기', tone: 'neutral' }, { key: '작업중', tone: 'warning' },
    { key: '완료', tone: 'success' }, { key: '중단', tone: 'danger' },
  ];
  root.querySelector('#bd-kanban').innerHTML = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
    ${cols.map(c => {
    const list = wos.filter(w => w.status === c.key);
    return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:12px;min-height:120px">
        <div class="flex between" style="margin-bottom:10px">${badge(c.key, c.tone)}<b class="mono" style="color:var(--text-3)">${list.length}</b></div>
        <div class="flex-col">${list.length ? list.map(w => `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px">
            <div class="flex between"><span class="cell-code">${escapeHtml(w.wo_no)}</span><span class="mono muted">${num(w.order_qty)}EA</span></div>
            <div style="font-weight:600;margin:3px 0">${escapeHtml(w.item_name || '')}</div>
            <div class="muted">${escapeHtml(w.process || '')} · ${escapeHtml(w.equipment || '-')} · ${escapeHtml(w.worker || '-')}</div>
          </div>`).join('') : `<div class="muted" style="text-align:center;padding:16px">없음</div>`}</div>
      </div>`;
  }).join('')}
  </div>`;

  // 금일 실적
  const todayEl = root.querySelector('#bd-today');
  todayEl.innerHTML = todayRes.length ? `
    <div class="flex between" style="margin-bottom:12px">
      <div><div class="muted">금일 양품률</div><div style="font-size:30px;font-weight:800" class="mono">${rate}%</div></div>
      <div class="progress" style="flex:1;margin-left:20px;height:12px"><span style="width:${rate}%"></span></div>
    </div>
    <div class="table-wrap"><table class="grid"><thead><tr><th>품명</th><th>공정</th><th class="num">양품</th><th class="num">불량</th></tr></thead>
    <tbody>${todayRes.map(r => `<tr><td class="cell-strong">${escapeHtml(r.item_name || '')}</td><td>${escapeHtml(r.process || '')}</td><td class="num mono">${num(r.good_qty)}</td><td class="num mono">${num(r.defect_qty)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty">${icon('inbox', 48)}<h4>금일 실적이 없습니다</h4></div>`;

  // 설비현황
  root.querySelector('#bd-equip').innerHTML = equips.length ? `<div class="flex-col">
    ${equips.map(e => `<div class="flex between" style="padding:10px 12px;background:var(--surface-2);border-radius:10px">
      <div><span class="cell-code">${escapeHtml(e.code)}</span> <b style="margin-left:6px">${escapeHtml(e.name)}</b><div class="muted">${escapeHtml(e.work_center || '')}</div></div>
      ${badge(e.status)}
    </div>`).join('')}</div>` : `<div class="empty">${icon('cpu', 48)}<h4>설비 정보가 없습니다</h4></div>`;
}

function statCard(label, value, unit, ic, tint) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${label}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div><div class="stat__value">${value}<small>${unit}</small></div></div>`;
}

// 수주 → 생산계획 생성 모달
async function openPlanModal(order, reload) {
  const body = document.createElement('form');
  body.className = 'form-grid';
  body.innerHTML = `
    <div class="field col-2"><label>수주</label><input class="input" value="${escapeHtml(order.order_no + ' · ' + (order.item_name || ''))}" readonly></div>
    <div class="field"><label>생산계획일 <span class="req">*</span></label><input class="input" name="plan_date" type="date" value="${todayStr()}"></div>
    <div class="field"><label>계획수량</label><input class="input" name="plan_qty" type="number" value="${escapeHtml(order.order_qty ?? 0)}"></div>
    <div class="field"><label>생산 시작일</label><input class="input" name="start_date" type="date" value="${todayStr()}"></div>
    <div class="field"><label>생산 종료일</label><input class="input" name="end_date" type="date"></div>`;
  openModal({
    title: '생산계획 생성', body,
    footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 계획 생성</button>`,
    onMount: ({ footEl, close }) => {
      footEl.querySelector('[data-cancel]').onclick = close;
      footEl.querySelector('[data-ok]').onclick = async () => {
        const g = (n) => body.querySelector(`[name="${n}"]`).value;
        if (!g('plan_date')) { toast('생산계획일을 지정하세요.', 'error'); return; }
        try {
          const all = await db.all('production_plans', {});
          const plan_no = nextDocNo('PP', all.map(x => x.plan_no));
          await db.insert('production_plans', {
            plan_no, plan_date: g('plan_date'), order_no: order.order_no, item_code: order.item_code, item_name: order.item_name,
            plan_qty: Number(g('plan_qty')) || order.order_qty || 0, start_date: g('start_date') || null, end_date: g('end_date') || null,
            status: '계획',
          });
          await db.update('sales_orders', order.id, { status: '생산중' });
          close(); toast(`생산계획(${plan_no})이 생성되었습니다.`); reload();
        } catch (e) { toast(e.message || '생성 실패', 'error'); }
      };
    },
  });
}

// 생산계획 → 작업지시 생성 모달
// (공정·설비·작업자·생산라인은 입력하지 않음 → POP에서 공정별 시작 시 선택)
async function openWoModal(plan, reload) {
  const body = document.createElement('form');
  body.className = 'form-grid';
  body.innerHTML = `
    <div class="field col-2"><label>생산계획</label><input class="input" value="${escapeHtml(plan.plan_no + ' · ' + (plan.item_name || ''))}" readonly></div>
    <div class="field"><label>지시수량 <span class="req">*</span></label><input class="input" name="order_qty" type="number" value="${escapeHtml(plan.plan_qty ?? 0)}"></div>
    <div class="field"><label>완료예정일</label><input class="input" name="due_date" type="date" value="${escapeHtml(plan.end_date || '')}"></div>
    <div class="field col-2"><div class="muted" style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:10px 12px">ℹ️ 작업자·설비호기는 작업지시 단계가 아니라 <b>POP에서 공정별 시작 시</b> 선택합니다.</div></div>`;
  openModal({
    title: '작업지시 생성', body,
    footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 작업지시 생성</button>`,
    onMount: ({ footEl, close }) => {
      footEl.querySelector('[data-cancel]').onclick = close;
      footEl.querySelector('[data-ok]').onclick = async () => {
        const g = (n) => body.querySelector(`[name="${n}"]`).value;
        try {
          const all = await db.all('work_orders', {});
          const wo_no = nextDocNo('WO', all.map(x => x.wo_no));
          await db.insert('work_orders', {
            wo_no, lot_no: 'LOT-' + wo_no, wo_date: todayStr(), plan_no: plan.plan_no, item_code: plan.item_code, item_name: plan.item_name,
            order_qty: Number(g('order_qty')) || plan.plan_qty || 0, start_date: plan.start_date || todayStr(),
            due_date: g('due_date') || null, status: '대기',
          });
          await db.update('production_plans', plan.id, { status: '진행' });
          close(); toast(`작업지시(${wo_no})가 생성되었습니다. 작업지시관리에서 '작업시작'을 누르세요.`); reload();
        } catch (e) { toast(e.message || '생성 실패', 'error'); }
      };
    },
  });
}
