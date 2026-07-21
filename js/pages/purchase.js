// 구매/외주관리: 자재발주(원소재·절단업체·단중) / 외주발주 / 외주입고
import { createCrudPage } from '../lib/crud.js';
import { num, won } from '../lib/format.js';
import { todayStr } from '../lib/format.js';

// 수량×단가=금액, 수량×단중=총중량 자동계산
function bindPoComputed(form) {
  const q = form.querySelector('[name="po_qty"]');
  const p = form.querySelector('[name="unit_price"]');
  const a = form.querySelector('[name="amount"]');
  const w = form.querySelector('[name="unit_weight"]');
  const tw = form.querySelector('[name="total_weight"]');
  const calc = () => {
    if (a && q && p) a.value = (Number(q.value) || 0) * (Number(p.value) || 0);
    if (tw && q && w) tw.value = Math.round((Number(q.value) || 0) * (Number(w.value) || 0) * 1000) / 1000;
  };
  [q, p, w].forEach(el => el && el.addEventListener('input', calc));
}

function bindAmount(form, qtyKey, priceKey, amountKey) {
  const q = form.querySelector(`[name="${qtyKey}"]`);
  const p = form.querySelector(`[name="${priceKey}"]`);
  const a = form.querySelector(`[name="${amountKey}"]`);
  if (!q || !p || !a) return;
  const calc = () => { a.value = (Number(q.value) || 0) * (Number(p.value) || 0); };
  q.addEventListener('input', calc); p.addEventListener('input', calc);
}

// 3-1 자재발주 (원소재업체·절단업체·단중)
export const purchaseOrders = createCrudPage({
  table: 'purchase_orders', title: '자재발주', subtitle: '원소재 발주를 등록합니다. 원소재업체·절단업체·단중(KG)을 함께 관리합니다.',
  searchFields: ['po_no', 'material_partner', 'cutting_partner', 'item_code', 'item_name'], searchPlaceholder: '발주번호·업체·품목 검색',
  defaultSort: { key: 'po_date', dir: 'desc' },
  dateField: { key: 'po_date', label: '발주일' },
  filters: [{ key: 'status', label: '상태', options: ['발주', '입고중', '입고완료', '취소'] }],
  statusChips: { key: 'status', options: ['발주', '입고중', '입고완료', '취소'] },
  docNoField: { key: 'po_no', prefix: 'PO' },
  wideForm: true,
  computed: bindPoComputed,
  stats: async (rows) => [
    { label: '총 발주건수', value: num(rows.length), unit: '건', icon: 'cart', tint: 'brand' },
    { label: '진행중', value: num(rows.filter(r => ['발주', '입고중'].includes(r.status)).length), unit: '건', icon: 'clock', tint: 'amber' },
    { label: '총 발주중량', value: num(rows.reduce((s, r) => s + (+r.total_weight || 0), 0)), unit: 'KG', icon: 'layers', tint: 'violet' },
    { label: '총 발주금액', value: won(rows.reduce((s, r) => s + (+r.amount || 0), 0)), icon: 'dollar', tint: 'green' },
  ],
  columns: [
    { key: 'po_no', label: '발주번호', cls: 'cell-code', sortable: true },
    { key: 'po_date', label: '발주일', type: 'date', sortable: true },
    { key: 'material_partner', label: '원소재업체' },
    { key: 'cutting_partner', label: '절단업체' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'spec', label: '규격' },
    { key: 'po_qty', label: '발주수량', type: 'num', sortable: true },
    { key: 'unit', label: '단위', align: 'center' },
    { key: 'unit_weight', label: '단중(KG)', type: 'num' },
    { key: 'total_weight', label: '총중량(KG)', type: 'num' },
    { key: 'unit_price', label: '단가', type: 'money' },
    { key: 'amount', label: '금액', type: 'money', sortable: true },
    { key: 'due_date', label: '납기일', type: 'date', sortable: true },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'po_no', label: '발주번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'po_date', label: '발주일', type: 'date', required: true, default: todayStr() },
    { key: 'material_partner', label: '원소재업체', required: true, ref: { table: 'partners', value: 'name', label: (r) => `${r.code} · ${r.name} (${r.biz_type || ''})` }, placeholder: '원소재업체 선택' },
    { key: 'cutting_partner', label: '절단업체', ref: { table: 'partners', value: 'name', label: (r) => `${r.code} · ${r.name} (${r.biz_type || ''})` }, placeholder: '절단업체 선택 (해당 시)' },
    { key: 'item_code', label: '품목(원소재)', required: true, ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { item_name: 'name', spec: 'spec', unit: 'unit', unit_weight: 'unit_weight', unit_price: 'purchase_price' } }, placeholder: '원소재 품목 선택' },
    { key: 'item_name', label: '품명(자동)', required: true, readonly: true },
    { key: 'spec', label: '규격(자동)', readonly: true },
    { key: 'unit', label: '단위', type: 'select', options: ['EA', 'KG', 'M'], default: 'EA' },
    { key: 'po_qty', label: '발주수량', type: 'number', required: true, default: 0 },
    { key: 'unit_weight', label: '단중 (KG/EA)', type: 'number', default: 0 },
    { key: 'total_weight', label: '총중량(KG, 자동)', type: 'number', readonly: true, default: 0 },
    { key: 'unit_price', label: '단가', type: 'number', default: 0 },
    { key: 'amount', label: '금액(자동)', type: 'number', readonly: true, default: 0 },
    { key: 'due_date', label: '납기일', type: 'date' },
    { key: 'status', label: '상태', type: 'select', options: ['발주', '입고중', '입고완료', '취소'], default: '발주' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 3-5 외주발주
export const subconOrders = createCrudPage({
  table: 'subcon_orders', title: '외주발주', subtitle: '외주가공처에 공정 외주를 발주합니다. 자재 출고는 자재반출관리(외주출고)와 연계됩니다.',
  searchFields: ['sco_no', 'partner', 'item_code', 'item_name', 'process', 'wo_no'], searchPlaceholder: '외주발주번호·외주처·품목·공정 검색',
  defaultSort: { key: 'sco_date', dir: 'desc' },
  dateField: { key: 'sco_date', label: '발주일' },
  filters: [{ key: 'status', label: '상태', options: ['발주', '가공중', '입고완료', '취소'] }],
  statusChips: { key: 'status', options: ['발주', '가공중', '입고완료', '취소'] },
  docNoField: { key: 'sco_no', prefix: 'SCO' },
  computed: (form) => bindAmount(form, 'order_qty', 'unit_price', 'amount'),
  stats: async (rows) => [
    { label: '총 외주발주', value: num(rows.length), unit: '건', icon: 'truck', tint: 'brand' },
    { label: '가공중', value: num(rows.filter(r => ['발주', '가공중'].includes(r.status)).length), unit: '건', icon: 'clock', tint: 'amber' },
    { label: '입고완료', value: num(rows.filter(r => r.status === '입고완료').length), unit: '건', icon: 'checkCircle', tint: 'green' },
    { label: '총 외주금액', value: won(rows.reduce((s, r) => s + (+r.amount || 0), 0)), icon: 'dollar', tint: 'violet' },
  ],
  columns: [
    { key: 'sco_no', label: '외주발주번호', cls: 'cell-code', sortable: true },
    { key: 'sco_date', label: '발주일', type: 'date', sortable: true },
    { key: 'partner', label: '외주가공처' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'process', label: '외주공정' },
    { key: 'order_qty', label: '발주수량', type: 'num', sortable: true },
    { key: 'unit_price', label: '외주단가', type: 'money' },
    { key: 'amount', label: '금액', type: 'money', sortable: true },
    { key: 'wo_no', label: '작업지시', cls: 'cell-code' },
    { key: 'due_date', label: '납기일', type: 'date', sortable: true },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'sco_no', label: '외주발주번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'sco_date', label: '발주일', type: 'date', required: true, default: todayStr() },
    { key: 'partner', label: '외주가공처', required: true, ref: { table: 'partners', value: 'name', label: (r) => `${r.code} · ${r.name} (${r.biz_type || ''})` }, placeholder: '외주가공처 선택' },
    { key: 'item_code', label: '품목', required: true, ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { item_name: 'name', unit_price: 'subcon_price' } }, placeholder: '품목 선택' },
    { key: 'item_name', label: '품명(자동)', required: true, readonly: true },
    { key: 'process', label: '외주공정', ref: { table: 'processes', value: 'name', label: (r) => `${r.code} · ${r.name} (${r.in_out || '사내'})` }, placeholder: '공정 선택' },
    { key: 'order_qty', label: '발주수량', type: 'number', required: true, default: 0 },
    { key: 'unit_price', label: '외주단가', type: 'number', default: 0 },
    { key: 'amount', label: '금액(자동)', type: 'number', readonly: true, default: 0 },
    { key: 'wo_no', label: '연계 작업지시', ref: { table: 'work_orders', value: 'wo_no', label: (r) => `${r.wo_no} · ${r.item_name}` }, placeholder: '작업지시 선택 (해당 시)' },
    { key: 'due_date', label: '납기일', type: 'date' },
    { key: 'status', label: '상태', type: 'select', options: ['발주', '가공중', '입고완료', '취소'], default: '발주' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 3-6 외주입고 (외주가공품 입고 — 검사 연계)
export const subconInbounds = createCrudPage({
  table: 'subcon_inbounds', title: '외주입고', subtitle: '외주가공품 입고를 등록합니다. 양품수량은 입고수량-불량수량으로 자동집계됩니다.',
  searchFields: ['sci_no', 'sco_no', 'partner', 'item_code', 'item_name', 'lot_no'], searchPlaceholder: '입고번호·발주번호·외주처·품목 검색',
  defaultSort: { key: 'sci_date', dir: 'desc' },
  dateField: { key: 'sci_date', label: '입고일' },
  filters: [
    { key: 'status', label: '상태', options: ['입고대기', '입고완료'] },
    { key: 'inspect_result', label: '검사', options: ['합격', '불합격', '미검사'] },
  ],
  statusChips: { key: 'status', options: ['입고대기', '입고완료'] },
  docNoField: { key: 'sci_no', prefix: 'SCI' },
  // 양품수량 자동집계: 입고수량 - 불량수량
  computed: (form) => {
    const iq = form.querySelector('[name="inbound_qty"]');
    const dq = form.querySelector('[name="defect_qty"]');
    const gq = form.querySelector('[name="good_qty"]');
    const calc = () => { if (gq) gq.value = Math.max(0, (Number(iq?.value) || 0) - (Number(dq?.value) || 0)); };
    [iq, dq].forEach(el => el && el.addEventListener('input', calc));
  },
  beforeSave: (data) => { data.good_qty = Math.max(0, (Number(data.inbound_qty) || 0) - (Number(data.defect_qty) || 0)); },
  stats: async (rows) => [
    { label: '총 외주입고', value: num(rows.length), unit: '건', icon: 'inbox', tint: 'brand' },
    { label: '입고대기', value: num(rows.filter(r => r.status !== '입고완료').length), unit: '건', icon: 'clock', tint: 'amber' },
    { label: '합격', value: num(rows.filter(r => r.inspect_result === '합격').length), unit: '건', icon: 'checkCircle', tint: 'green' },
    { label: '불량수량 합계', value: num(rows.reduce((s, r) => s + (+r.defect_qty || 0), 0)), unit: 'EA', icon: 'alert', tint: 'red' },
  ],
  columns: [
    { key: 'sci_no', label: '외주입고번호', cls: 'cell-code', sortable: true },
    { key: 'sci_date', label: '입고일', type: 'date', sortable: true },
    { key: 'sco_no', label: '외주발주', cls: 'cell-code' },
    { key: 'partner', label: '외주가공처' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'process', label: '공정' },
    { key: 'inbound_qty', label: '입고수량', type: 'num', sortable: true },
    { key: 'defect_qty', label: '불량', type: 'num' },
    { key: 'good_qty', label: '양품(자동)', type: 'num' },
    { key: 'lot_no', label: 'LOT', cls: 'cell-code' },
    { key: 'inspect_result', label: '검사', type: 'badge', align: 'center' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'sci_no', label: '외주입고번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'sci_date', label: '입고일', type: 'date', required: true, default: todayStr() },
    { key: 'sco_no', label: '외주발주', ref: { table: 'subcon_orders', value: 'sco_no', label: (r) => `${r.sco_no} · ${r.item_name} (${r.partner || ''})`, fill: { partner: 'partner', item_code: 'item_code', item_name: 'item_name', process: 'process' } }, placeholder: '외주발주 선택' },
    { key: 'partner', label: '외주가공처(자동)', readonly: true },
    { key: 'item_code', label: '품목코드(자동)', readonly: true },
    { key: 'item_name', label: '품명(자동)', readonly: true },
    { key: 'process', label: '공정(자동)', readonly: true },
    { key: 'inbound_qty', label: '입고수량', type: 'number', required: true, default: 0 },
    { key: 'defect_qty', label: '불량수량', type: 'number', default: 0 },
    { key: 'good_qty', label: '양품수량(자동)', type: 'number', readonly: true, default: 0 },
    { key: 'lot_no', label: 'LOT 번호' },
    { key: 'inspect_result', label: '검사결과', type: 'select', options: ['미검사', '합격', '불합격'], default: '미검사' },
    { key: 'status', label: '상태', type: 'select', options: ['입고대기', '입고완료'], default: '입고대기' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});
