// 영업관리: 수주관리 / 납품관리
import { createCrudPage } from '../lib/crud.js';
import { db } from '../lib/db.js';
import { num, won, todayStr, fmtDate, escapeHtml, nextDocNo, debounce } from '../lib/format.js';
import { badge, confirmDialog, toast } from '../ui/components.js';
import { icon } from '../ui/icons.js';

// 금액 자동계산 (수량 * 단가) 바인딩 헬퍼
function bindAmount(form, qtyKey, priceKey, amountKey) {
  const q = form.querySelector(`[name="${qtyKey}"]`);
  const p = form.querySelector(`[name="${priceKey}"]`);
  const a = form.querySelector(`[name="${amountKey}"]`);
  if (!q || !p || !a) return;
  const calc = () => { a.value = (Number(q.value) || 0) * (Number(p.value) || 0); };
  q.addEventListener('input', calc); p.addEventListener('input', calc);
}

// 2-1 수주관리
export const salesOrders = createCrudPage({
  table: 'sales_orders', title: '수주관리', subtitle: '고객 수주를 등록하고 진행상태를 관리합니다.',
  searchFields: ['order_no', 'partner', 'item_code', 'item_name'], searchPlaceholder: '수주번호·거래처·품목 검색',
  defaultSort: { key: 'order_date', dir: 'desc' },
  dateField: { key: 'order_date', label: '수주일' },
  filters: [{ key: 'status', label: '상태', options: ['접수', '생산중', '완료', '취소'] }],
  statusChips: { key: 'status', options: ['접수', '생산중', '완료', '취소'] },
  docNoField: { key: 'order_no', prefix: 'SO' },
  computed: (form) => bindAmount(form, 'order_qty', 'unit_price', 'amount'),
  stats: async (rows) => {
    const total = rows.reduce((s, r) => s + (+r.amount || 0), 0);
    const active = rows.filter(r => ['접수', '생산중'].includes(r.status));
    const qty = rows.reduce((s, r) => s + (+r.order_qty || 0), 0);
    return [
      { label: '총 수주건수', value: num(rows.length), unit: '건', icon: 'cart', tint: 'brand' },
      { label: '진행중 수주', value: num(active.length), unit: '건', icon: 'clock', tint: 'amber' },
      { label: '총 수주수량', value: num(qty), unit: 'EA', icon: 'box', tint: 'violet' },
      { label: '총 수주금액', value: won(total), icon: 'dollar', tint: 'green' },
    ];
  },
  columns: [
    { key: 'order_no', label: '수주번호', cls: 'cell-code', sortable: true },
    { key: 'order_date', label: '수주일', type: 'date', sortable: true },
    { key: 'partner', label: '거래처' },
    { key: 'item_code', label: '품목코드', cls: 'cell-code' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'order_qty', label: '수주수량', type: 'num', sortable: true },
    { key: 'unit_price', label: '단가', type: 'money' },
    { key: 'amount', label: '금액', type: 'money', sortable: true },
    { key: 'due_date', label: '납기일', type: 'date', sortable: true },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'order_no', label: '수주번호 (자동생성)', placeholder: '비워두면 자동 채번', readonly: false },
    { key: 'order_date', label: '수주일', type: 'date', required: true, default: todayStr() },
    { key: 'partner', label: '거래처', required: true, ref: { table: 'partners', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '거래처 선택' },
    { key: 'item_code', label: '품목', required: true, ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { item_name: 'name', spec: 'spec', unit: 'unit', unit_price: 'unit_price' } }, placeholder: '품목 선택' },
    { key: 'item_name', label: '품명(자동)', required: true, readonly: true },
    { key: 'spec', label: '규격(자동)', readonly: true },
    { key: 'unit', label: '단위', type: 'select', options: ['EA', 'SET', 'BOX'], default: 'EA' },
    { key: 'order_qty', label: '수주수량', type: 'number', required: true, default: 0 },
    { key: 'unit_price', label: '단가', type: 'number', default: 0 },
    { key: 'amount', label: '금액(자동)', type: 'number', readonly: true, default: 0 },
    { key: 'due_date', label: '납기일', type: 'date' },
    { key: 'status', label: '상태', type: 'select', options: ['접수', '생산중', '완료', '취소'], default: '접수' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 2-1b 출하지시 — 출하검사·출하실적과 연계
export const shippingOrders = createCrudPage({
  table: 'shipping_orders', title: '출하지시', subtitle: '수주 기반 출하지시를 등록합니다. 출하검사와 연계됩니다.',
  searchFields: ['ship_no', 'order_no', 'partner', 'item_code', 'item_name'], searchPlaceholder: '출하지시번호·수주번호·거래처 검색',
  defaultSort: { key: 'ship_date', dir: 'desc' },
  dateField: { key: 'ship_date', label: '출하예정일' },
  filters: [{ key: 'status', label: '상태', options: ['지시', '출하완료', '취소'] }],
  statusChips: { key: 'status', options: ['지시', '출하완료', '취소'] },
  docNoField: { key: 'ship_no', prefix: 'SH' },
  stats: async (rows) => [
    { label: '총 출하지시', value: num(rows.length), unit: '건', icon: 'truck', tint: 'brand' },
    { label: '지시(대기)', value: num(rows.filter(r => r.status === '지시').length), unit: '건', icon: 'clock', tint: 'amber' },
    { label: '출하완료', value: num(rows.filter(r => r.status === '출하완료').length), unit: '건', icon: 'checkCircle', tint: 'green' },
    { label: '지시수량 합계', value: num(rows.reduce((s, r) => s + (+r.ship_qty || 0), 0)), unit: 'EA', icon: 'box', tint: 'violet' },
  ],
  columns: [
    { key: 'ship_no', label: '출하지시번호', cls: 'cell-code', sortable: true },
    { key: 'ship_date', label: '출하예정일', type: 'date', sortable: true },
    { key: 'order_no', label: '수주번호', cls: 'cell-code' },
    { key: 'partner', label: '거래처' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'ship_qty', label: '지시수량', type: 'num', sortable: true },
    { key: 'warehouse', label: '출하창고' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'ship_no', label: '출하지시번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'ship_date', label: '출하예정일', type: 'date', required: true, default: todayStr() },
    { key: 'order_no', label: '수주번호', ref: { table: 'sales_orders', value: 'order_no', label: (r) => `${r.order_no} · ${r.item_name} (${r.partner || ''})`, fill: { partner: 'partner', item_code: 'item_code', item_name: 'item_name', ship_qty: 'order_qty' } }, placeholder: '수주 선택' },
    { key: 'partner', label: '거래처(자동)', readonly: true },
    { key: 'item_code', label: '품목코드(자동)', readonly: true },
    { key: 'item_name', label: '품명(자동)', readonly: true },
    { key: 'ship_qty', label: '지시수량', type: 'number', required: true, default: 0 },
    { key: 'warehouse', label: '출하창고', type: 'select', options: ['제품창고', '자재창고1', '자재창고2'], default: '제품창고' },
    { key: 'status', label: '상태', type: 'select', options: ['지시', '출하완료', '취소'], default: '지시' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 2-2 납품관리 — 생산이 완료된 수주를 납품 처리(커스텀 화면)
//  · 리스트: 생산완료 수주만 표시, 최초 상태 '납품대기'
//  · 납기예정일(수주 due_date) / 실제 납품완료일(완료 시 기록) / 납기상태(지연) 표시
//  · 행 선택 → '선택 납품완료' 버튼으로 완료 처리 (수정/상태변경 불가)
export async function deliveries(root) {
  const today = todayStr();
  const state = { search: '', chip: '전체', dateBasis: 'due', dateFrom: '', dateTo: '', selected: new Set() };

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>납품관리</h1><p>생산이 완료된 수주를 납품 처리합니다. 행을 선택해 납품완료로 전환하세요.</p></div>
      <div class="page-head__actions">
        <button class="btn btn--primary" id="dlv-complete" disabled>${icon('check', 16)} 선택 납품완료 <span id="dlv-cnt"></span></button>
        <button class="btn" id="dlv-refresh">${icon('refresh', 16)} 새로고침</button>
      </div>
    </div>
    <div id="dlv-stats"></div>
    <div class="card">
      <div class="toolbar">
        <div class="search-box grow">${icon('search', 16)}<input id="dlv-search" placeholder="수주번호·거래처·품명 검색" autocomplete="off"/></div>
        <div class="date-range" title="기준 날짜 기간 조회">
          <span class="date-range__label">${icon('calendar', 14)} 기준</span>
          <select class="select" id="dlv-basis" style="width:auto;min-width:108px">
            <option value="due">납기예정일</option>
            <option value="complete">납품완료일</option>
          </select>
          <select class="select" id="dlv-preset" style="width:auto;min-width:96px">
            <option value="">기간 전체</option>
            <option value="today">오늘</option>
            <option value="7">최근 7일</option>
            <option value="30">최근 30일</option>
            <option value="month">이번 달</option>
          </select>
          <input class="input input--date" type="date" id="dlv-from" aria-label="시작일"/>
          <span class="date-range__sep">~</span>
          <input class="input input--date" type="date" id="dlv-to" aria-label="종료일"/>
        </div>
      </div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="dlv-chips"></div></div>
      <div class="table-wrap"><div id="dlv-table"></div></div>
    </div>`;

  let rows = [];
  async function loadData() {
    const [orders, plans, wos, dels] = await Promise.all([
      db.all('sales_orders', {}), db.all('production_plans', {}), db.all('work_orders', {}), db.all('deliveries', {}),
    ]);
    const planByOrder = {};
    for (const p of plans) (planByOrder[p.order_no] ??= []).push(p.plan_no);
    const allWoComplete = (planNos) => {
      const ws = wos.filter(w => planNos.includes(w.plan_no));
      return ws.length > 0 && ws.every(w => w.status === '완료');
    };
    const prodComplete = (o) => o.status === '완료' || allWoComplete(planByOrder[o.order_no] || []);
    const delByOrder = {};
    for (const d of dels) if (d.status === '납품완료') delByOrder[d.order_no] = d;

    rows = orders.filter(prodComplete).map(o => {
      const d = delByOrder[o.order_no];
      const status = d ? '납품완료' : '납품대기';
      const completeDate = d ? String(d.delivery_date || '').slice(0, 10) : '';
      const due = String(o.due_date || '').slice(0, 10);
      const delayed = status === '납품완료'
        ? !!(due && completeDate && completeDate > due)
        : !!(due && today > due);
      return { order_no: o.order_no, partner: o.partner, item_code: o.item_code, item_name: o.item_name, qty: +o.order_qty || 0, unit_price: +o.unit_price || 0, amount: +o.amount || 0, due, status, completeDate, delayed };
    }).sort((a, b) => (a.status === b.status ? 0 : a.status === '납품대기' ? -1 : 1) || String(a.due).localeCompare(String(b.due)));
  }

  // 검색 + 날짜 기간(기준: 납기예정일/납품완료일) 적용
  function scopedRows() {
    let out = rows;
    if (state.search) { const q = state.search.toLowerCase(); out = out.filter(r => [r.order_no, r.partner, r.item_name].some(v => String(v ?? '').toLowerCase().includes(q))); }
    if (state.dateFrom || state.dateTo) {
      const key = state.dateBasis === 'complete' ? 'completeDate' : 'due';
      out = out.filter(r => {
        const v = String(r[key] || '').slice(0, 10);
        if (!v) return false; // 기준 날짜가 없는 건은 기간 조회 시 제외
        if (state.dateFrom && v < state.dateFrom) return false;
        if (state.dateTo && v > state.dateTo) return false;
        return true;
      });
    }
    return out;
  }
  function visibleRows() {
    let out = scopedRows();
    if (state.chip !== '전체') out = out.filter(r => r.status === state.chip);
    return out;
  }

  function renderStats() {
    const base = scopedRows();
    const done = base.filter(r => r.status === '납품완료');
    const wait = base.filter(r => r.status === '납품대기');
    const delayed = base.filter(r => r.status === '납품대기' && r.delayed);
    const amount = done.reduce((s, r) => s + r.amount, 0);
    root.querySelector('#dlv-stats').innerHTML = `<div class="stat-grid">
      ${statCard('납품완료', num(done.length), '건', 'checkCircle', 'green')}
      ${statCard('납품예정', num(wait.length), '건', 'clock', 'amber')}
      ${statCard('총 납품금액', won(amount), '', 'dollar', 'violet')}
      ${statCard('지연', num(delayed.length), '건', 'alert', 'red')}
    </div>`;
  }

  function renderChips() {
    const wrap = root.querySelector('#dlv-chips');
    const base = scopedRows();
    const opts = ['전체', '납품대기', '납품완료'];
    wrap.innerHTML = opts.map(o => {
      const c = o === '전체' ? base.length : base.filter(r => r.status === o).length;
      return `<button class="chip ${state.chip === o ? 'active' : ''}" data-chip="${o}">${o}<span class="chip__count">${c}</span></button>`;
    }).join('');
    wrap.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => { state.chip = b.dataset.chip; state.selected.clear(); renderChips(); renderTable(); updateBtn(); });
  }

  function renderTable() {
    const list = visibleRows();
    const slot = root.querySelector('#dlv-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:60px 20px">${icon('truck', 52)}<h4>표시할 납품 건이 없습니다</h4><p>생산이 완료된 수주가 여기에 표시됩니다.</p></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th class="center" style="width:40px"><input type="checkbox" class="checkbox" id="dlv-all"></th>
      <th>수주번호</th><th>거래처</th><th>품명</th><th class="num">수량</th>
      <th class="center">납기예정일</th><th class="center">납품완료일</th><th class="num">금액</th>
      <th class="center">납기상태</th><th class="center">상태</th>
    </tr></thead><tbody>${list.map(r => `
      <tr data-order="${escapeHtml(r.order_no)}">
        <td class="center">${r.status === '납품대기' ? `<input type="checkbox" class="checkbox" data-sel="${escapeHtml(r.order_no)}" ${state.selected.has(r.order_no) ? 'checked' : ''}>` : ''}</td>
        <td class="cell-code">${escapeHtml(r.order_no)}</td>
        <td>${escapeHtml(r.partner || '')}</td>
        <td class="cell-strong">${escapeHtml(r.item_name || '')}</td>
        <td class="num mono">${num(r.qty)}</td>
        <td class="center">${r.due ? fmtDate(r.due) : '-'}</td>
        <td class="center">${r.completeDate ? fmtDate(r.completeDate) : '<span class="muted">-</span>'}</td>
        <td class="num mono">${won(r.amount)}</td>
        <td class="center">${r.delayed ? badge('지연', 'danger') : badge('정상', 'success')}</td>
        <td class="center">${r.status === '납품완료' ? badge('납품완료', 'success') : badge('납품대기', 'neutral')}</td>
      </tr>`).join('')}</tbody></table>`;

    const all = slot.querySelector('#dlv-all');
    const boxes = [...slot.querySelectorAll('[data-sel]')];
    const mark = (b) => b.closest('tr')?.classList.toggle('is-selected', b.checked);
    const syncAll = () => { if (all) { all.checked = boxes.length > 0 && boxes.every(b => b.checked); all.indeterminate = !all.checked && boxes.some(b => b.checked); } };
    if (all) all.onchange = () => { boxes.forEach(b => { b.checked = all.checked; b.checked ? state.selected.add(b.dataset.sel) : state.selected.delete(b.dataset.sel); mark(b); }); updateBtn(); };
    boxes.forEach(b => b.onchange = () => { b.checked ? state.selected.add(b.dataset.sel) : state.selected.delete(b.dataset.sel); mark(b); syncAll(); updateBtn(); });
    slot.querySelectorAll('tbody tr[data-order]').forEach(tr => {
      const box = tr.querySelector('[data-sel]');
      if (!box) return;
      tr.classList.add('row-selectable');
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button, a, input, select, label')) return;
        box.checked = !box.checked;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    syncAll();
  }

  function updateBtn() {
    const n = state.selected.size;
    root.querySelector('#dlv-complete').disabled = n === 0;
    root.querySelector('#dlv-cnt').textContent = n ? `(${n})` : '';
  }

  async function completeSelected() {
    const sel = rows.filter(r => state.selected.has(r.order_no) && r.status === '납품대기');
    if (!sel.length) return;
    const ok = await confirmDialog({ title: '납품완료 처리', message: `선택한 ${sel.length}건을 납품완료 처리하시겠습니까?\n납품완료일은 오늘(${today})로 기록됩니다.`, confirmText: '납품완료', danger: false });
    if (!ok) return;
    try {
      const used = (await db.all('deliveries', {})).map(x => x.delivery_no);
      for (const r of sel) {
        const no = nextDocNo('DL', used); used.push(no);
        await db.insert('deliveries', { delivery_no: no, delivery_date: today, order_no: r.order_no, partner: r.partner, item_code: r.item_code, item_name: r.item_name, delivery_qty: r.qty, unit_price: r.unit_price, amount: r.amount, status: '납품완료' });
      }
      toast(`${sel.length}건 납품완료 처리되었습니다.`);
      state.selected.clear();
      await reload();
    } catch (e) { toast(e.message || '처리 실패', 'error'); }
  }

  async function reload() { await loadData(); renderStats(); renderChips(); renderTable(); updateBtn(); }

  // 검색·날짜 변경 시 통계/칩/표 갱신(데이터 재조회는 안 함)
  const refreshView = () => { state.selected.clear(); renderStats(); renderChips(); renderTable(); updateBtn(); };
  root.querySelector('#dlv-refresh').onclick = () => reload();
  root.querySelector('#dlv-complete').onclick = () => completeSelected();
  root.querySelector('#dlv-search').addEventListener('input', debounce((e) => { state.search = e.target.value.trim(); refreshView(); }));

  const fromEl = root.querySelector('#dlv-from');
  const toEl = root.querySelector('#dlv-to');
  const presetEl = root.querySelector('#dlv-preset');
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const applyDates = () => { state.dateFrom = fromEl.value; state.dateTo = toEl.value; refreshView(); };
  root.querySelector('#dlv-basis').addEventListener('change', (e) => { state.dateBasis = e.target.value; refreshView(); });
  fromEl.addEventListener('change', () => { presetEl.value = ''; applyDates(); });
  toEl.addEventListener('change', () => { presetEl.value = ''; applyDates(); });
  presetEl.addEventListener('change', () => {
    const v = presetEl.value, now = new Date();
    let from = '', to = '';
    if (v === 'today') { from = to = isoLocal(now); }
    else if (v === '7') { const d = new Date(now); d.setDate(d.getDate() - 6); from = isoLocal(d); to = isoLocal(now); }
    else if (v === '30') { const d = new Date(now); d.setDate(d.getDate() - 29); from = isoLocal(d); to = isoLocal(now); }
    else if (v === 'month') { from = isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)); to = isoLocal(now); }
    fromEl.value = from; toEl.value = to; applyDates();
  });

  try { await reload(); }
  catch (e) { root.querySelector('#dlv-table').innerHTML = `<div class="empty" style="padding:60px">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
}

function statCard(label, value, unit, ic, tint) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(label)}</span>
    <span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div>
    <div class="stat__value">${value}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div></div>`;
}
