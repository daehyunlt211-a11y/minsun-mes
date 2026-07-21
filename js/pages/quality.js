// 품질관리: 검사기준 / 수입검사 / 부적합 / 출하검사
import { createCrudPage } from '../lib/crud.js';
import { db } from '../lib/db.js';
import { num, todayStr } from '../lib/format.js';
import { badge, toast } from '../ui/components.js';

// 합격/불합격 양품률 자동 결과 보조
function rateBadge(r) {
  const t = (+r.good_qty || 0) + (+r.defect_qty || 0);
  const v = t ? Math.round((+r.good_qty || 0) / t * 100) : 0;
  return badge(v + '%', v >= 98 ? 'success' : v >= 90 ? 'warning' : 'danger');
}

// 6-1 검사기준관리
export const inspectionStandards = createCrudPage({
  table: 'inspection_standards', title: '검사기준관리', subtitle: '품목별 검사항목·규격·공차 기준을 관리합니다.',
  searchFields: ['std_no', 'item_code', 'item_name', 'inspect_item'], searchPlaceholder: '기준번호·품목·검사항목 검색',
  defaultSort: { key: 'std_no', dir: 'asc' },
  filters: [{ key: 'inspect_type', label: '검사유형', options: ['수입검사', '공정검사', '출하검사'] }],
  statusChips: { key: 'inspect_type', options: ['수입검사', '공정검사', '출하검사'] },
  filters: [
    { key: 'inspect_type', label: '검사유형', options: ['수입검사', '공정검사', '출하검사'] },
    { key: 'eval_method', label: '평가방법', options: ['정량적', '정성적'] },
  ],
  columns: [
    { key: 'std_no', label: '기준번호', cls: 'cell-code', sortable: true },
    { key: 'item_code', label: '품목코드', cls: 'cell-code' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'inspect_type', label: '검사유형', type: 'badge', tone: 'brand' },
    { key: 'inspect_item', label: '검사항목' },
    { key: 'eval_method', label: '평가방법', align: 'center', render: (r) => badge(r.eval_method || '정량적', r.eval_method === '정성적' ? 'info' : 'neutral') },
    { key: 'spec_value', label: '규격값/판정기준', align: 'center' },
    { key: 'tolerance', label: '공차', align: 'center' },
    { key: 'method', label: '검사방법' },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
  ],
  fields: [
    { key: 'std_no', label: '기준번호', required: true, placeholder: '예: IS-001' },
    { key: 'item_code', label: '품목', required: true, ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { item_name: 'name' } }, placeholder: '품목 선택' },
    { key: 'item_name', label: '품명(자동)', required: true, readonly: true },
    { key: 'inspect_type', label: '검사유형', type: 'select', options: ['수입검사', '공정검사', '출하검사'], default: '수입검사' },
    { key: 'process', label: '대상 공정(공정검사)', ref: { table: 'processes', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '공정검사 시 대상 공정 선택' },
    { key: 'eval_method', label: '평가방법', type: 'select', options: ['정량적', '정성적'], default: '정량적' },
    { key: 'inspect_item', label: '검사항목', placeholder: '예: 전장, 두께, 외관' },
    { key: 'spec_value', label: '규격값/판정기준', placeholder: '정량: 120 / 정성: 이물질 없음' },
    { key: 'tolerance', label: '허용공차(정량)', placeholder: '예: ±0.1' },
    { key: 'method', label: '검사방법', placeholder: '예: 버니어캘리퍼스' },
    { key: 'equipment', label: '측정장비', ref: { table: 'tools', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '측정공구 선택' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 6-2 수입검사
export const incomingInspections = createCrudPage({
  table: 'incoming_inspections', title: '수입검사', subtitle: '입고 자재의 수입검사 결과를 등록합니다.',
  searchFields: ['inspect_no', 'inbound_no', 'partner', 'item_name', 'lot_no'], searchPlaceholder: '검사번호·입고·품목·LOT 검색',
  defaultSort: { key: 'inspect_date', dir: 'desc' },
  dateField: { key: 'inspect_date', label: '검사일' },
  filters: [{ key: 'result', label: '판정', options: ['합격', '불합격', '조건부합격'] }],
  statusChips: { key: 'result', options: ['합격', '불합격', '조건부합격'] },
  docNoField: { key: 'inspect_no', prefix: 'II' },
  stats: async (rows) => {
    const pass = rows.filter(r => r.result === '합격').length;
    const rate = rows.length ? ((pass / rows.length) * 100).toFixed(1) : '0.0';
    return [
      { label: '총 검사건수', value: num(rows.length), unit: '건', icon: 'shield', tint: 'brand' },
      { label: '합격', value: num(pass), unit: '건', icon: 'checkCircle', tint: 'green' },
      { label: '불합격', value: num(rows.filter(r => r.result === '불합격').length), unit: '건', icon: 'alert', tint: 'red' },
      { label: '합격률', value: rate, unit: '%', icon: 'trendUp', tint: 'violet' },
    ];
  },
  columns: [
    { key: 'inspect_no', label: '검사번호', cls: 'cell-code', sortable: true },
    { key: 'inspect_date', label: '검사일', type: 'date', sortable: true },
    { key: 'partner', label: '거래처' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'lot_no', label: 'LOT', cls: 'cell-code' },
    { key: 'inspect_qty', label: '검사수량', type: 'num' },
    { key: 'good_qty', label: '양품', type: 'num' },
    { key: 'defect_qty', label: '불량', type: 'num' },
    { key: 'rate', label: '양품률', align: 'center', render: rateBadge },
    { key: 'inspector', label: '검사자' },
    { key: 'result', label: '판정', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'inspect_no', label: '검사번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'inspect_date', label: '검사일', type: 'date', required: true, default: todayStr() },
    { key: 'inbound_no', label: '입고 선택', ref: { table: 'material_inbounds', value: 'inbound_no', label: (r) => `${r.inbound_no} · ${r.item_name} · ${r.lot_no || ''}`, fill: { partner: 'partner', item_code: 'item_code', item_name: 'item_name', lot_no: 'lot_no', inspect_qty: 'inbound_qty' } }, placeholder: '입고건 선택' },
    { key: 'partner', label: '거래처(자동)', readonly: true },
    { key: 'item_code', label: '품목코드(자동)', readonly: true },
    { key: 'item_name', label: '품명(자동)', required: true, readonly: true },
    { key: 'lot_no', label: 'LOT 번호' },
    { key: 'inspect_qty', label: '검사수량', type: 'number', required: true, default: 0 },
    { key: 'good_qty', label: '양품수량', type: 'number', default: 0 },
    { key: 'defect_qty', label: '불량수량', type: 'number', default: 0 },
    { key: 'inspector', label: '검사자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '검사자 선택' },
    { key: 'result', label: '판정', type: 'select', options: ['합격', '불합격', '조건부합격'], default: '합격' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 6-3 부적합관리 (클레임 포함)
export const nonconformances = createCrudPage({
  table: 'nonconformances', title: '부적합관리', subtitle: '공정·검사 부적합과 고객 클레임(귀책·금액 포함)을 통합 관리합니다.',
  searchFields: ['ncr_no', 'process', 'item_name', 'defect_type', 'worker', 'lot_no', 'partner'], searchPlaceholder: '부적합번호·공정·품목·LOT 검색',
  defaultSort: { key: 'occur_date', dir: 'desc' },
  dateField: { key: 'occur_date', label: '발생일' },
  wideForm: true,
  filters: [
    { key: 'ncr_type', label: '구분', options: ['공정부적합', '수입부적합', '출하부적합', '고객클레임'] },
    { key: 'action_type', label: '조치', options: ['폐기', '재작업', '특채', '반품'] },
    { key: 'status', label: '상태', options: ['처리중', '완료'] },
  ],
  statusChips: { key: 'status', options: ['처리중', '완료'] },
  docNoField: { key: 'ncr_no', prefix: 'NC' },
  // 리스트 우측상단 단일 버튼 + 행 다중선택(체크박스)으로 일괄 처리완료
  bulkActions: [
    {
      label: '처리완료', icon: 'checkCircle', cls: 'btn--primary',
      onClick: async (selected, reload) => {
        const targets = selected.filter(r => r.status === '처리중');
        if (!targets.length) { toast('처리중 상태인 항목을 선택하세요.', 'error'); return; }
        try {
          for (const r of targets) await db.update('nonconformances', r.id, { status: '완료' });
          toast(`${targets.length}건 처리완료 되었습니다.`); reload();
        } catch (e) { toast(e.message || '처리 실패', 'error'); }
      },
    },
  ],
  stats: async (rows) => [
    { label: '총 부적합', value: num(rows.length), unit: '건', icon: 'alert', tint: 'brand' },
    { label: '처리중', value: num(rows.filter(r => r.status === '처리중').length), unit: '건', icon: 'clock', tint: 'amber' },
    { label: '완료', value: num(rows.filter(r => r.status === '완료').length), unit: '건', icon: 'checkCircle', tint: 'green' },
    { label: '부적합수량 합계', value: num(rows.reduce((s, r) => s + (+r.defect_qty || 0), 0)), unit: 'EA', icon: 'box', tint: 'red' },
  ],
  columns: [
    { key: 'ncr_no', label: '부적합번호', cls: 'cell-code', sortable: true },
    { key: 'occur_date', label: '발생일', type: 'date', sortable: true },
    { key: 'ncr_type', label: '구분', type: 'badge' },
    { key: 'process', label: '발생공정' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'lot_no', label: 'LOT', cls: 'cell-code' },
    { key: 'defect_type', label: '불량유형' },
    { key: 'defect_qty', label: '수량', type: 'num', sortable: true },
    { key: 'charge_dept', label: '귀책부서' },
    { key: 'claim_amount', label: '클레임금액', type: 'money' },
    { key: 'action_type', label: '조치', type: 'badge', tone: 'brand' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'ncr_no', label: '부적합번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'occur_date', label: '발생일', type: 'date', required: true, default: todayStr() },
    { key: 'ncr_type', label: '부적합 구분', type: 'select', options: ['공정부적합', '수입부적합', '출하부적합', '고객클레임'], default: '공정부적합' },
    { key: 'process', label: '발생공정', ref: { table: 'processes', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '공정 선택' },
    { key: 'item_code', label: '품목', ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { item_name: 'name' } }, placeholder: '품목 선택' },
    { key: 'item_name', label: '품명(자동)', required: true, readonly: true },
    { key: 'lot_no', label: 'LOT 번호', placeholder: '발생 LOT (추적성)' },
    { key: 'partner', label: '고객사(클레임)', ref: { table: 'partners', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '클레임 고객사 선택' },
    { key: 'defect_type', label: '불량유형', placeholder: '예: 치수불량, 외관불량' },
    { key: 'defect_qty', label: '부적합수량', type: 'number', required: true, default: 0 },
    { key: 'cause', label: '원인', type: 'textarea' },
    { key: 'charge_dept', label: '귀책부서', ref: { table: 'departments', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '귀책부서 선택' },
    { key: 'action', label: '조치사항(처리방안)', type: 'textarea' },
    { key: 'action_type', label: '조치구분', type: 'select', options: ['폐기', '재작업', '특채', '반품'], default: '폐기' },
    { key: 'claim_amount', label: '클레임금액(원)', type: 'number', default: 0 },
    { key: 'worker', label: '담당자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '담당자 선택' },
    { key: 'status', label: '처리상태', type: 'select', options: ['처리중', '완료'], default: '처리중' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 6-4 출하검사
export const shippingInspections = createCrudPage({
  table: 'shipping_inspections', title: '출하검사', subtitle: '납품 전 완제품의 출하검사 결과를 등록합니다.',
  searchFields: ['inspect_no', 'order_no', 'partner', 'item_name'], searchPlaceholder: '검사번호·수주·거래처 검색',
  defaultSort: { key: 'inspect_date', dir: 'desc' },
  dateField: { key: 'inspect_date', label: '검사일' },
  filters: [{ key: 'result', label: '판정', options: ['합격', '불합격'] }],
  statusChips: { key: 'result', options: ['합격', '불합격'] },
  docNoField: { key: 'inspect_no', prefix: 'SI' },
  stats: async (rows) => {
    const pass = rows.filter(r => r.result === '합격').length;
    const rate = rows.length ? ((pass / rows.length) * 100).toFixed(1) : '0.0';
    return [
      { label: '총 검사건수', value: num(rows.length), unit: '건', icon: 'shield', tint: 'brand' },
      { label: '합격', value: num(pass), unit: '건', icon: 'checkCircle', tint: 'green' },
      { label: '불합격', value: num(rows.length - pass), unit: '건', icon: 'alert', tint: 'red' },
      { label: '합격률', value: rate, unit: '%', icon: 'trendUp', tint: 'violet' },
    ];
  },
  columns: [
    { key: 'inspect_no', label: '검사번호', cls: 'cell-code', sortable: true },
    { key: 'inspect_date', label: '검사일', type: 'date', sortable: true },
    { key: 'order_no', label: '수주번호', cls: 'cell-code' },
    { key: 'partner', label: '거래처' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'inspect_qty', label: '검사수량', type: 'num' },
    { key: 'good_qty', label: '양품', type: 'num' },
    { key: 'defect_qty', label: '불량', type: 'num' },
    { key: 'rate', label: '양품률', align: 'center', render: rateBadge },
    { key: 'inspector', label: '검사자' },
    { key: 'result', label: '판정', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'inspect_no', label: '검사번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'inspect_date', label: '검사일', type: 'date', required: true, default: todayStr() },
    { key: 'order_no', label: '수주 선택', ref: { table: 'sales_orders', value: 'order_no', label: (r) => `${r.order_no} · ${r.partner} · ${r.item_name}`, fill: { partner: 'partner', item_code: 'item_code', item_name: 'item_name', inspect_qty: 'order_qty' } }, placeholder: '수주 선택' },
    { key: 'partner', label: '거래처(자동)', readonly: true },
    { key: 'item_code', label: '품목코드(자동)', readonly: true },
    { key: 'item_name', label: '품명(자동)', required: true, readonly: true },
    { key: 'inspect_qty', label: '검사수량', type: 'number', required: true, default: 0 },
    { key: 'good_qty', label: '양품수량', type: 'number', default: 0 },
    { key: 'defect_qty', label: '불량수량', type: 'number', default: 0 },
    { key: 'inspector', label: '검사자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '검사자 선택' },
    { key: 'result', label: '판정', type: 'select', options: ['합격', '불합격'], default: '합격' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});
