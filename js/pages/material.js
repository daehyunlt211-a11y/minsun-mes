// 자재관리: 자재입고 / 자재반출 / 자재현황(재고)
import { createCrudPage } from '../lib/crud.js';
import { db } from '../lib/db.js';
import { num, won, todayStr, fmtDate, escapeHtml, nextDocNo } from '../lib/format.js';
import { badge, toast, openModal, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { printLabel } from '../lib/barcode.js';

// 입고완료 처리 모달 — 선택 건의 실 입고수량(기본=입고수량) 확인/수정 후 확정
function openInboundComplete(targets, reload) {
  const list = targets.filter(r => r.status !== '입고완료');
  if (!list.length) { toast('이미 입고완료된 항목입니다.', 'error'); return; }
  const body = document.createElement('form');
  body.className = 'form-grid';
  body.innerHTML = `<div class="col-2 muted" style="margin-bottom:2px">입고완료할 항목의 <b>실 입고수량</b>을 확인/수정하세요.</div>` +
    list.map(r => `<div class="field col-2" data-id="${escapeHtml(r.id)}">
      <label>${escapeHtml(r.inbound_no)} · ${escapeHtml(r.item_name || '')} <span class="muted">(입고예정 ${num(r.inbound_qty)})</span></label>
      <input class="input" type="number" min="0" step="any" data-actual value="${r.inbound_qty ?? 0}"/>
    </div>`).join('');
  openModal({
    title: '입고완료 처리', body, wide: list.length > 1,
    footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 입고완료</button>`,
    onMount: ({ footEl, close }) => {
      footEl.querySelector('[data-cancel]').onclick = close;
      footEl.querySelector('[data-ok]').onclick = async () => {
        try {
          for (const wrap of body.querySelectorAll('[data-id]')) {
            const actual = Number(wrap.querySelector('[data-actual]').value) || 0;
            await db.update('material_inbounds', wrap.dataset.id, { actual_qty: actual, status: '입고완료' });
          }
          close(); toast(`${list.length}건 입고완료 처리되었습니다.`); reload();
        } catch (e) { toast(e.message || '처리 실패', 'error'); }
      };
    },
  });
}

function bindAmount(form) {
  const q = form.querySelector('[name="inbound_qty"]');
  const p = form.querySelector('[name="unit_price"]');
  const a = form.querySelector('[name="amount"]');
  if (!q || !p || !a) return;
  const calc = () => { a.value = (Number(q.value) || 0) * (Number(p.value) || 0); };
  q.addEventListener('input', calc); p.addEventListener('input', calc);
}

// 4-1 자재입고관리
export const materialInbounds = createCrudPage({
  table: 'material_inbounds', title: '자재입고관리', subtitle: '구매·외주 자재의 입고를 등록하고 관리합니다.',
  searchFields: ['inbound_no', 'partner', 'item_code', 'item_name', 'lot_no'], searchPlaceholder: '입고번호·거래처·품목·LOT 검색',
  defaultSort: { key: 'inbound_date', dir: 'desc' },
  dateField: { key: 'inbound_date', label: '입고일' },
  filters: [
    { key: 'status', label: '상태', options: ['입고대기', '입고완료'] },
    { key: 'warehouse', label: '창고', options: ['자재창고1', '자재창고2', '외주창고'] },
  ],
  statusChips: { key: 'status', options: ['입고대기', '입고완료'] },
  docNoField: { key: 'inbound_no', prefix: 'MI' },
  computed: bindAmount,
  // 신규 등록은 '입고대기'로. 실제 입고완료는 목록 선택 + 버튼으로 처리
  beforeSave: (data, row) => { if (!row && !data.status) data.status = '입고대기'; },
  // 선택 후 버튼으로 입고완료 (실 입고수량 입력)
  bulkActions: [
    { label: '입고완료', icon: 'checkCircle', cls: 'btn--primary', onClick: (selected, reload) => openInboundComplete(selected, reload) },
  ],
  // 라벨발행: 수입검사 완료(입고완료) 건 대상 자재 라벨(바코드) 출력
  rowActions: [
    {
      label: '라벨', icon: 'fileText', title: '자재 라벨(바코드) 발행',
      show: (r) => r.status === '입고완료',
      onClick: (r) => printLabel({
        title: '자재 라벨', code: r.item_code, name: r.item_name, lot: r.lot_no || r.inbound_no,
        qty: r.actual_qty ?? r.inbound_qty, date: r.inbound_date, partner: r.partner,
        extra: r.vendor_lot ? `<tr><th>거래처 로트</th><td>${r.vendor_lot}</td></tr>` : '',
      }),
    },
  ],
  stats: async (rows) => [
    { label: '총 입고건수', value: num(rows.length), unit: '건', icon: 'inbox', tint: 'brand' },
    { label: '입고대기', value: num(rows.filter(r => r.status !== '입고완료').length), unit: '건', icon: 'clock', tint: 'amber' },
    { label: '입고완료', value: num(rows.filter(r => r.status === '입고완료').length), unit: '건', icon: 'checkCircle', tint: 'green' },
    { label: '실 입고수량 합계', value: num(rows.filter(r => r.status === '입고완료').reduce((s, r) => s + (r.actual_qty != null && r.actual_qty !== '' ? +r.actual_qty : +r.inbound_qty || 0), 0)), unit: 'EA', icon: 'box', tint: 'violet' },
  ],
  columns: [
    { key: 'inbound_no', label: '입고번호', cls: 'cell-code', sortable: true },
    { key: 'inbound_date', label: '입고일', type: 'date', sortable: true },
    { key: 'partner', label: '거래처' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'spec', label: '규격' },
    { key: 'inbound_qty', label: '입고수량', type: 'num', sortable: true },
    { key: 'actual_qty', label: '실 입고수량', align: 'right', sortable: true, csv: (r) => (r.status === '입고완료' ? (r.actual_qty ?? r.inbound_qty) : ''), render: (r) => r.status === '입고완료' ? `<span class="mono" style="font-weight:700">${num(r.actual_qty ?? r.inbound_qty)}</span>` : '<span class="muted">-</span>' },
    { key: 'unit_price', label: '단가', type: 'money' },
    { key: 'amount', label: '금액', type: 'money', sortable: true },
    { key: 'warehouse', label: '창고' },
    { key: 'lot_no', label: 'LOT', cls: 'cell-code' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'inbound_no', label: '입고번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'inbound_date', label: '입고일', type: 'date', required: true, default: todayStr() },
    { key: 'po_no', label: '자재발주 선택', ref: { table: 'purchase_orders', value: 'po_no', label: (r) => `${r.po_no} · ${r.item_name} (${r.po_qty})`, fill: { partner: 'material_partner', item_code: 'item_code', item_name: 'item_name', spec: 'spec', unit: 'unit', inbound_qty: 'po_qty', unit_price: 'unit_price' } }, placeholder: '발주 선택 (없으면 직접 입력)' },
    { key: 'partner', label: '거래처', required: true, ref: { table: 'partners', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '거래처 선택' },
    { key: 'item_code', label: '품목', required: true, ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { item_name: 'name', spec: 'spec', unit: 'unit', unit_price: 'unit_price' } }, placeholder: '품목 선택' },
    { key: 'item_name', label: '품명(자동)', required: true, readonly: true },
    { key: 'spec', label: '규격(자동)', readonly: true },
    { key: 'unit', label: '단위', type: 'select', options: ['EA', 'KG', 'M', 'BOX'], default: 'EA' },
    { key: 'inbound_qty', label: '입고수량', type: 'number', required: true, default: 0 },
    { key: 'unit_price', label: '단가', type: 'number', default: 0 },
    { key: 'amount', label: '금액(자동)', type: 'number', readonly: true, default: 0 },
    { key: 'warehouse', label: '창고', type: 'select', options: ['자재창고1', '자재창고2', '외주창고'], default: '자재창고1' },
    { key: 'lot_no', label: '관리번호(LOT)', placeholder: '비워두면 입고번호로 관리' },
    { key: 'vendor_lot', label: '거래처 로트' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 4-2 자재반출관리(출고)
export const materialOutbounds = createCrudPage({
  table: 'material_outbounds', title: '자재반출관리', subtitle: '생산투입·외주 등 자재 출고(반출)를 관리합니다.',
  searchFields: ['outbound_no', 'item_code', 'item_name', 'wo_no', 'worker'], searchPlaceholder: '반출번호·품목·작업지시 검색',
  defaultSort: { key: 'outbound_date', dir: 'desc' },
  dateField: { key: 'outbound_date', label: '반출일' },
  filters: [{ key: 'purpose', label: '용도', options: ['생산투입', '외주출고', '외주반납', '반품', '재고조정'] }],
  statusChips: { key: 'purpose', options: ['생산투입', '외주출고', '외주반납', '반품', '재고조정'] },
  docNoField: { key: 'outbound_no', prefix: 'MO' },
  stats: async (rows) => [
    { label: '총 반출건수', value: num(rows.length), unit: '건', icon: 'upload', tint: 'brand' },
    { label: '생산투입', value: num(rows.filter(r => r.purpose === '생산투입').length), unit: '건', icon: 'factory', tint: 'green' },
    { label: '외주출고', value: num(rows.filter(r => r.purpose === '외주출고').length), unit: '건', icon: 'truck', tint: 'amber' },
    { label: '반출수량 합계', value: num(rows.reduce((s, r) => s + (+r.outbound_qty || 0), 0)), unit: 'EA', icon: 'box', tint: 'violet' },
  ],
  columns: [
    { key: 'outbound_no', label: '반출번호', cls: 'cell-code', sortable: true },
    { key: 'outbound_date', label: '반출일', type: 'date', sortable: true },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'outbound_qty', label: '반출수량', type: 'num', sortable: true },
    { key: 'unit', label: '단위', align: 'center' },
    { key: 'wo_no', label: '작업지시', cls: 'cell-code' },
    { key: 'lot_no', label: 'LOT', cls: 'cell-code' },
    { key: 'partner', label: '외주처' },
    { key: 'inbound_no', label: '원입고(반품)', cls: 'cell-code' },
    { key: 'warehouse', label: '창고' },
    { key: 'purpose', label: '용도', type: 'badge', tone: 'brand' },
    { key: 'worker', label: '담당자' },
  ],
  fields: [
    { key: 'outbound_no', label: '반출번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'outbound_date', label: '반출일', type: 'date', required: true, default: todayStr() },
    { key: 'item_code', label: '품목', required: true, ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { item_name: 'name', unit: 'unit' } }, placeholder: '품목 선택' },
    { key: 'item_name', label: '품명(자동)', required: true, readonly: true },
    { key: 'unit', label: '단위', type: 'select', options: ['EA', 'KG', 'M', 'BOX'], default: 'EA' },
    { key: 'outbound_qty', label: '반출수량', type: 'number', required: true, default: 0 },
    { key: 'wo_no', label: '작업지시', ref: { table: 'work_orders', value: 'wo_no', label: (r) => `${r.wo_no} · ${r.item_name}` }, placeholder: '작업지시 선택' },
    { key: 'lot_no', label: 'LOT 번호', placeholder: '투입 자재 LOT (추적성)' },
    { key: 'partner', label: '외주가공처', ref: { table: 'partners', value: 'name', label: (r) => `${r.code} · ${r.name} (${r.biz_type || ''})` }, placeholder: '외주출고/반납 시 선택' },
    { key: 'warehouse', label: '창고', type: 'select', options: ['자재창고1', '자재창고2', '외주창고'], default: '자재창고1' },
    { key: 'purpose', label: '용도', type: 'select', options: ['생산투입', '외주출고', '외주반납', '반품', '재고조정'], default: '생산투입' },
    { key: 'worker', label: '담당자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '담당자 선택' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 4-3 자재현황 (좌: 품목 / 우: 입고번호별 리스트 + 반품) — 커스텀 화면
export async function materialStocks(root) {
  const state = { code: null, search: '', selected: null, items: [], ins: [], outs: [] };

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>자재현황</h1><p>품목을 선택하면 입고번호별 재고를 확인하고 반품 처리할 수 있습니다.</p></div>
      <div class="page-head__actions"><button class="btn" id="ms-refresh">${icon('refresh', 16)} 새로고침</button></div>
    </div>
    <div style="display:grid;grid-template-columns:340px 1fr;gap:18px;align-items:start">
      <div class="card">
        <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="ms-search" placeholder="품목코드·품명 검색" autocomplete="off"/></div></div>
        <div id="ms-list" style="max-height:64vh;overflow-y:auto"></div>
      </div>
      <div class="card" id="ms-detail"><div class="card__body"><div class="empty" style="padding:80px 20px">${icon('box', 52)}<h4>품목을 선택하세요</h4><p>왼쪽에서 품목을 선택하면 입고번호별 재고와 반품 기능이 표시됩니다.</p></div></div></div>
    </div>`;

  root.querySelector('#ms-refresh').onclick = () => materialStocks(root);

  async function loadData() {
    [state.items, state.ins, state.outs] = await Promise.all([
      db.all('items', {}).catch(() => []),
      db.all('material_inbounds', {}).catch(() => []),
      db.all('material_outbounds', {}).catch(() => []),
    ]);
  }
  const qtyOfIn = (r) => (r.actual_qty != null && r.actual_qty !== '') ? +r.actual_qty : +r.inbound_qty || 0;
  const completedIns = (code) => state.ins.filter(r => r.item_code === code && r.status === '입고완료');
  const returnedOf = (inboundNo) => state.outs.filter(o => o.purpose === '반품' && o.inbound_no === inboundNo).reduce((s, o) => s + (+o.outbound_qty || 0), 0);
  // 품목별 집계 (입고완료 자재만)
  function summary() {
    const map = {};
    for (const r of state.ins) {
      if (r.status !== '입고완료') continue;
      const k = r.item_code; (map[k] ??= { item_code: k, item_name: r.item_name, in_qty: 0, out_qty: 0 });
      map[k].in_qty += qtyOfIn(r); map[k].item_name = r.item_name || map[k].item_name;
    }
    for (const o of state.outs) {
      const k = o.item_code; if (!map[k]) continue; map[k].out_qty += +o.outbound_qty || 0;
    }
    return Object.values(map).map(r => ({ ...r, stock_qty: r.in_qty - r.out_qty })).sort((a, b) => String(a.item_code).localeCompare(String(b.item_code)));
  }

  const listSlot = root.querySelector('#ms-list');
  function renderList() {
    const q = state.search.toLowerCase();
    const rows = summary().filter(r => !q || [r.item_code, r.item_name].some(v => String(v ?? '').toLowerCase().includes(q)));
    if (!rows.length) { listSlot.innerHTML = `<div class="empty" style="padding:40px 12px">${icon('inbox', 40)}<h4>품목이 없습니다</h4></div>`; return; }
    listSlot.innerHTML = rows.map(r => {
      const v = r.stock_qty; const tone = v <= 0 ? 'danger' : v < 30 ? 'warning' : 'success';
      return `<div class="rt-item ${state.code === r.item_code ? 'active' : ''}" data-code="${escapeHtml(r.item_code)}"
        style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer">
        <div style="flex:1;min-width:0"><span class="cell-code">${escapeHtml(r.item_code)}</span><div style="font-weight:700;margin-top:3px">${escapeHtml(r.item_name || '')}</div></div>
        <span class="badge badge--${tone}">재고 ${num(v)}</span>
      </div>`;
    }).join('');
    listSlot.querySelectorAll('[data-code]').forEach(el => el.onclick = () => selectItem(el.dataset.code));
  }

  function selectItem(code) {
    state.code = code; state.selected = null;
    renderList();
    const item = state.items.find(i => i.code === code) || {};
    const sum = summary().find(s => s.item_code === code) || { in_qty: 0, out_qty: 0, stock_qty: 0, item_name: item.name };
    const lots = completedIns(code).map(r => {
      const qty = qtyOfIn(r); const ret = returnedOf(r.inbound_no);
      return { ...r, qty, ret, avail: Math.max(0, qty - ret) };
    }).sort((a, b) => String(b.inbound_date).localeCompare(String(a.inbound_date)));

    const editor = root.querySelector('#ms-detail');
    editor.innerHTML = `
      <div class="card__head">
        <div><div class="flex" style="gap:8px"><span class="cell-code" style="font-size:14px">${escapeHtml(code)}</span></div>
          <h3 style="margin-top:4px">${escapeHtml(sum.item_name || '')}</h3></div>
        <div class="spacer"></div>
        <button class="btn btn--primary" id="ms-return" disabled>${icon('upload', 16)} 반품</button>
      </div>
      <div class="card__body">
        <div class="grid-3" style="margin-bottom:18px">
          ${infoBox('총 입고(실입고)', num(sum.in_qty) + ' EA')}
          ${infoBox('총 반출/반품', num(sum.out_qty) + ' EA')}
          ${infoBox('현재고', num(sum.stock_qty) + ' EA')}
        </div>
        <h4 style="margin:0 0 10px;display:flex;align-items:center;gap:8px">${icon('inbox', 18)} 입고번호별 재고 <span class="muted" style="font-weight:500;font-size:13px">(반품할 1건을 선택하세요)</span></h4>
        <div class="table-wrap"><table class="grid">
          <thead><tr><th class="center" style="width:40px"></th><th>입고번호</th><th>입고일</th><th>LOT</th><th class="num">실입고</th><th class="num">반품</th><th class="num">반품가능</th><th>창고</th></tr></thead>
          <tbody>${lots.length ? lots.map(l => `<tr data-in="${escapeHtml(l.inbound_no)}">
            <td class="center">${l.avail > 0 ? `<input type="radio" name="ms-pick" class="checkbox" data-pick="${escapeHtml(l.inbound_no)}">` : ''}</td>
            <td class="cell-code">${escapeHtml(l.inbound_no)}</td>
            <td>${fmtDate(l.inbound_date)}</td>
            <td class="cell-code">${escapeHtml(l.lot_no || '')}</td>
            <td class="num mono">${num(l.qty)}</td>
            <td class="num mono ${l.ret ? '' : 'muted'}">${num(l.ret)}</td>
            <td class="num mono" style="font-weight:700">${num(l.avail)}</td>
            <td>${escapeHtml(l.warehouse || '')}</td>
          </tr>`).join('') : `<tr><td colspan="8"><div class="empty" style="padding:30px">${icon('inbox', 40)}<h4>입고완료된 재고가 없습니다</h4></div></td></tr>`}</tbody>
        </table></div>
      </div>`;

    const retBtn = editor.querySelector('#ms-return');
    const pickRow = (inboundNo) => {
      state.selected = inboundNo; retBtn.disabled = false;
      editor.querySelectorAll('tbody tr[data-in]').forEach(tr => tr.classList.toggle('is-selected', tr.dataset.in === inboundNo));
      const rb = editor.querySelector(`[data-pick="${CSS.escape(inboundNo)}"]`); if (rb) rb.checked = true;
    };
    editor.querySelectorAll('[data-pick]').forEach(rb => rb.onchange = () => pickRow(rb.dataset.pick));
    editor.querySelectorAll('tbody tr[data-in]').forEach(tr => {
      if (!tr.querySelector('[data-pick]')) return; // 반품 불가(잔량0) 행은 선택 불가
      tr.classList.add('row-selectable');
      tr.addEventListener('click', (e) => { if (e.target.closest('button, a, input, select, label')) return; pickRow(tr.dataset.in); });
    });
    retBtn.onclick = () => openReturn(lots.find(l => l.inbound_no === state.selected));
  }

  function openReturn(lot) {
    if (!lot) { toast('반품할 입고 건을 선택하세요.', 'error'); return; }
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>입고번호</label><input class="input" value="${escapeHtml(lot.inbound_no)}" readonly></div>
      <div class="field col-2"><label>품목</label><input class="input" value="${escapeHtml(lot.item_code)} · ${escapeHtml(lot.item_name || '')}" readonly></div>
      <div class="field"><label>반품가능 수량</label><input class="input" value="${num(lot.avail)}" readonly></div>
      <div class="field"><label>반품수량 <span class="req">*</span></label><input class="input" type="number" name="qty" min="1" max="${lot.avail}" step="any" value="${lot.avail}"></div>
      <div class="field col-2"><label>사유</label><input class="input" name="reason" placeholder="예: 불량, 과입고 반품"></div>`;
    openModal({
      title: '자재 반품', body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('upload', 16)} 반품 처리</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const qty = Number(body.querySelector('[name="qty"]').value) || 0;
          if (qty <= 0) { toast('반품수량을 입력하세요.', 'error'); return; }
          if (qty > lot.avail) { toast(`반품가능 수량(${num(lot.avail)})을 초과할 수 없습니다.`, 'error'); return; }
          try {
            const used = (await db.all('material_outbounds', {})).map(x => x.outbound_no);
            const no = nextDocNo('MO', used);
            await db.insert('material_outbounds', {
              outbound_no: no, outbound_date: todayStr(), item_code: lot.item_code, item_name: lot.item_name,
              unit: lot.unit || 'EA', outbound_qty: qty, inbound_no: lot.inbound_no, warehouse: lot.warehouse,
              purpose: '반품', worker: '', remark: body.querySelector('[name="reason"]').value || '',
            });
            close(); toast(`${num(qty)} 반품 처리되었습니다. (자재반출관리 > 반품)`);
            await loadData(); selectItem(state.code);
          } catch (e) { toast(e.message || '반품 실패', 'error'); }
        };
      },
    });
  }

  root.querySelector('#ms-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderList(); });

  try { await loadData(); renderList(); }
  catch (e) { listSlot.innerHTML = `<div class="empty">${icon('alert', 40)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
}

function infoBox(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px"><div class="muted" style="font-size:12px">${escapeHtml(label)}</div><div style="font-weight:700;font-size:15px;margin-top:2px">${escapeHtml(val)}</div></div>`;
}
