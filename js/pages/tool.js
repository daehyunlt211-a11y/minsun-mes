// 공구관리(운영): 재고 / 입·출고·회수 / 폐기 / 치수검증
import { createCrudPage } from '../lib/crud.js';
import { num, won, todayStr } from '../lib/format.js';
import { badge } from '../ui/components.js';

// 5-1 공구재고관리 (뷰 — 읽기전용)
export const toolStocks = createCrudPage({
  table: 'tool_stocks', title: '공구 재고관리', subtitle: '입고·출고·회수·폐기 기준 실시간 공구 재고 현황입니다.',
  readOnly: true,
  searchFields: ['tool_code', 'tool_name'], searchPlaceholder: '공구코드·공구명 검색',
  defaultSort: { key: 'tool_code', dir: 'asc' },
  filters: [{ key: 'tool_type', label: '유형', options: ['절삭', '측정', '지그', '기타'] }],
  stats: async (rows) => {
    const low = rows.filter(r => (+r.stock_qty || 0) <= (+r.safety_stock || 0)).length;
    return [
      { label: '관리 공구수', value: num(rows.length), unit: '종', icon: 'tool', tint: 'brand' },
      { label: '총 입고', value: num(rows.reduce((s, r) => s + (+r.in_qty || 0), 0)), unit: 'EA', icon: 'inbox', tint: 'green' },
      { label: '총 폐기', value: num(rows.reduce((s, r) => s + (+r.disposal_qty || 0), 0)), unit: 'EA', icon: 'trash', tint: 'red' },
      { label: '안전재고 미달', value: num(low), unit: '종', icon: 'alert', tint: low ? 'amber' : 'violet' },
    ];
  },
  columns: [
    { key: 'tool_code', label: '공구코드', cls: 'cell-code', sortable: true },
    { key: 'tool_name', label: '공구명', cls: 'cell-strong', sortable: true },
    { key: 'tool_type', label: '유형', type: 'badge' },
    { key: 'in_qty', label: '입고', type: 'num', sortable: true },
    { key: 'out_qty', label: '출고', type: 'num', sortable: true },
    { key: 'return_qty', label: '회수', type: 'num', sortable: true },
    { key: 'disposal_qty', label: '폐기', type: 'num', sortable: true },
    { key: 'safety_stock', label: '안전재고', type: 'num' },
    { key: 'stock_qty', label: '현재고', align: 'right', sortable: true, render: (r) => {
      const v = +r.stock_qty || 0, safe = +r.safety_stock || 0;
      const tone = v <= 0 ? 'danger' : v <= safe ? 'warning' : 'success';
      return badge(num(v), tone);
    } },
  ],
});

// 5-2 공구 입·출고·회수관리 (입고검사·단가 / 호기별 출고 / 회수처)
export const toolMovements = createCrudPage({
  table: 'tool_movements', title: '공구 입·출고·회수', subtitle: '입고(검사·단가), 출고(사내 호기별/외주), 회수 이력을 관리합니다.',
  searchFields: ['move_no', 'tool_code', 'tool_name', 'lot_no', 'worker', 'machine_no', 'partner'], searchPlaceholder: '관리번호·공구·LOT·호기 검색',
  defaultSort: { key: 'move_date', dir: 'desc' },
  dateField: { key: 'move_date', label: '일자' },
  filters: [
    { key: 'move_type', label: '구분', options: ['입고', '출고', '회수'] },
    { key: 'dest_type', label: '출고/회수처', options: ['사내', '외주'] },
  ],
  statusChips: { key: 'move_type', options: ['입고', '출고', '회수'] },
  docNoField: { key: 'move_no', prefix: 'TM' },
  wideForm: true,
  stats: async (rows) => [
    { label: '총 이력', value: num(rows.length), unit: '건', icon: 'refresh', tint: 'brand' },
    { label: '입고', value: num(rows.filter(r => r.move_type === '입고').length), unit: '건', icon: 'inbox', tint: 'green' },
    { label: '출고', value: num(rows.filter(r => r.move_type === '출고').length), unit: '건', icon: 'upload', tint: 'amber' },
    { label: '회수', value: num(rows.filter(r => r.move_type === '회수').length), unit: '건', icon: 'download', tint: 'violet' },
  ],
  columns: [
    { key: 'move_no', label: '관리번호', cls: 'cell-code', sortable: true },
    { key: 'move_date', label: '일자', type: 'date', sortable: true },
    { key: 'move_type', label: '구분', type: 'badge', align: 'center' },
    { key: 'tool_code', label: '공구코드', cls: 'cell-code' },
    { key: 'tool_name', label: '공구명', cls: 'cell-strong' },
    { key: 'lot_no', label: '공구LOT', cls: 'cell-code' },
    { key: 'qty', label: '수량', type: 'num', sortable: true },
    { key: 'unit_price', label: '입고단가', type: 'money' },
    { key: 'inspect_result', label: '입고검사', type: 'badge', align: 'center' },
    { key: 'dest_type', label: '처구분', align: 'center' },
    { key: 'machine_no', label: '호기', align: 'center' },
    { key: 'partner', label: '외주처' },
    { key: 'worker', label: '담당자' },
  ],
  fields: [
    { key: 'move_no', label: '관리번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'move_date', label: '일자', type: 'date', required: true, default: todayStr() },
    { key: 'move_type', label: '구분', type: 'select', options: ['입고', '출고', '회수'], default: '입고' },
    { key: 'tool_code', label: '공구', required: true, ref: { table: 'tools', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { tool_name: 'name', location: 'location', unit_price: 'unit_price' } }, placeholder: '공구 선택' },
    { key: 'tool_name', label: '공구명(자동)', required: true, readonly: true },
    { key: 'lot_no', label: '공구 LOT', placeholder: '예: T001-260721-01 (제작일자 기반)' },
    { key: 'qty', label: '수량', type: 'number', required: true, default: 0 },
    { key: 'unit_price', label: '입고단가', type: 'number', default: 0, placeholder: '입고 시 입력' },
    { key: 'inspect_result', label: '입고검사', type: 'select', options: ['합격', '불합격', '성적서확인'], placeholder: '입고 시 선택 (체크시트/성적서)' },
    { key: 'dest_type', label: '출고/회수처 구분', type: 'select', options: ['사내', '외주'], placeholder: '출고·회수 시 선택' },
    { key: 'machine_no', label: '호기 (사내)', ref: { table: 'equipments', value: 'code', label: (r) => `${r.code} · ${r.name}${r.machine_no ? ` [${r.machine_no}]` : ''}` }, placeholder: '사내 출고/회수 시 호기 선택' },
    { key: 'partner', label: '외주처', ref: { table: 'partners', value: 'name', label: (r) => `${r.code} · ${r.name} (${r.biz_type || ''})` }, placeholder: '외주 출고/회수 시 선택' },
    { key: 'worker', label: '담당자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '담당자 선택' },
    { key: 'location', label: '보관위치' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 5-3 공구 폐기관리 (폐기사유·사용수명)
export const toolDisposals = createCrudPage({
  table: 'tool_disposals', title: '공구 폐기관리', subtitle: '폐기사유와 사용수명(BOM 연계 계산값)을 기록합니다.',
  searchFields: ['disposal_no', 'tool_code', 'tool_name', 'lot_no', 'worker'], searchPlaceholder: '폐기번호·공구·LOT 검색',
  defaultSort: { key: 'disposal_date', dir: 'desc' },
  dateField: { key: 'disposal_date', label: '폐기일' },
  filters: [{ key: 'reason', label: '사유', options: ['수명초과', '파손', '마모', '기타'] }],
  statusChips: { key: 'reason', options: ['수명초과', '파손', '마모', '기타'] },
  docNoField: { key: 'disposal_no', prefix: 'TD' },
  stats: async (rows) => [
    { label: '총 폐기건수', value: num(rows.length), unit: '건', icon: 'trash', tint: 'brand' },
    { label: '폐기수량 합계', value: num(rows.reduce((s, r) => s + (+r.qty || 0), 0)), unit: 'EA', icon: 'box', tint: 'red' },
    { label: '수명초과', value: num(rows.filter(r => r.reason === '수명초과').length), unit: '건', icon: 'clock', tint: 'amber' },
    { label: '파손/마모', value: num(rows.filter(r => ['파손', '마모'].includes(r.reason)).length), unit: '건', icon: 'alert', tint: 'violet' },
  ],
  columns: [
    { key: 'disposal_no', label: '폐기번호', cls: 'cell-code', sortable: true },
    { key: 'disposal_date', label: '폐기일', type: 'date', sortable: true },
    { key: 'tool_code', label: '공구코드', cls: 'cell-code' },
    { key: 'tool_name', label: '공구명', cls: 'cell-strong' },
    { key: 'lot_no', label: '공구LOT', cls: 'cell-code' },
    { key: 'qty', label: '폐기수량', type: 'num', sortable: true },
    { key: 'reason', label: '폐기사유', type: 'badge', tone: 'brand' },
    { key: 'life_used', label: '사용수명(횟수)', type: 'num' },
    { key: 'worker', label: '담당자' },
    { key: 'remark', label: '비고' },
  ],
  fields: [
    { key: 'disposal_no', label: '폐기번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'disposal_date', label: '폐기일', type: 'date', required: true, default: todayStr() },
    { key: 'tool_code', label: '공구', required: true, ref: { table: 'tools', value: 'code', label: (r) => `${r.code} · ${r.name} (수명 ${r.life_count || 0}회)`, fill: { tool_name: 'name' } }, placeholder: '공구 선택' },
    { key: 'tool_name', label: '공구명(자동)', required: true, readonly: true },
    { key: 'lot_no', label: '공구 LOT' },
    { key: 'qty', label: '폐기수량', type: 'number', required: true, default: 0 },
    { key: 'reason', label: '폐기사유', type: 'select', options: ['수명초과', '파손', '마모', '기타'], default: '수명초과' },
    { key: 'life_used', label: '사용수명(횟수)', type: 'number', default: 0, placeholder: '제품·BOM 연계 사용횟수' },
    { key: 'worker', label: '담당자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '담당자 선택' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 5-4 공구 치수검증 (교체 전/후 및 교체 후 일정수량 검증값)
export const toolVerifications = createCrudPage({
  table: 'tool_verifications', title: '공구 치수검증', subtitle: '공구 교체 전/후 및 교체 후 일정수량 가공품의 치수 검증값을 기록합니다.',
  searchFields: ['verify_no', 'tool_code', 'tool_name', 'lot_no', 'machine_no', 'wo_no', 'inspect_item'], searchPlaceholder: '검증번호·공구·호기·작업지시 검색',
  defaultSort: { key: 'verify_date', dir: 'desc' },
  dateField: { key: 'verify_date', label: '검증일' },
  filters: [
    { key: 'verify_type', label: '구분', options: ['교체전', '교체후', '교체후N개'] },
    { key: 'judgment', label: '판정', options: ['OK', 'NG'] },
  ],
  statusChips: { key: 'judgment', options: ['OK', 'NG'] },
  docNoField: { key: 'verify_no', prefix: 'TV' },
  stats: async (rows) => {
    const ok = rows.filter(r => r.judgment === 'OK').length;
    const rate = rows.length ? ((ok / rows.length) * 100).toFixed(1) : '0.0';
    return [
      { label: '총 검증건수', value: num(rows.length), unit: '건', icon: 'target', tint: 'brand' },
      { label: 'OK', value: num(ok), unit: '건', icon: 'checkCircle', tint: 'green' },
      { label: 'NG', value: num(rows.filter(r => r.judgment === 'NG').length), unit: '건', icon: 'alert', tint: 'red' },
      { label: '합격률', value: rate, unit: '%', icon: 'trendUp', tint: 'violet' },
    ];
  },
  columns: [
    { key: 'verify_no', label: '검증번호', cls: 'cell-code', sortable: true },
    { key: 'verify_date', label: '검증일', type: 'date', sortable: true },
    { key: 'verify_type', label: '구분', type: 'badge', align: 'center' },
    { key: 'tool_code', label: '공구코드', cls: 'cell-code' },
    { key: 'tool_name', label: '공구명', cls: 'cell-strong' },
    { key: 'machine_no', label: '호기', align: 'center' },
    { key: 'wo_no', label: '작업지시', cls: 'cell-code' },
    { key: 'inspect_item', label: '검증항목' },
    { key: 'spec_value', label: '규격' },
    { key: 'tolerance', label: '공차' },
    { key: 'measured', label: '측정값', align: 'right', cls: 'mono' },
    { key: 'judgment', label: '판정', type: 'badge', align: 'center', tone: 'success' },
    { key: 'worker', label: '검증자' },
  ],
  fields: [
    { key: 'verify_no', label: '검증번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'verify_date', label: '검증일', type: 'date', required: true, default: todayStr() },
    { key: 'verify_type', label: '검증 구분', type: 'select', options: ['교체전', '교체후', '교체후N개'], default: '교체후' },
    { key: 'tool_code', label: '공구', required: true, ref: { table: 'tools', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { tool_name: 'name' } }, placeholder: '공구 선택' },
    { key: 'tool_name', label: '공구명(자동)', required: true, readonly: true },
    { key: 'lot_no', label: '공구 LOT' },
    { key: 'machine_no', label: '호기', ref: { table: 'equipments', value: 'code', label: (r) => `${r.code} · ${r.name}` }, placeholder: '호기 선택' },
    { key: 'wo_no', label: '작업지시', ref: { table: 'work_orders', value: 'wo_no', label: (r) => `${r.wo_no} · ${r.item_name}` }, placeholder: '작업지시 선택 (해당 시)' },
    { key: 'item_code', label: '품목코드' },
    { key: 'inspect_item', label: '검증 치수항목', required: true, placeholder: '예: 내경 Ø25' },
    { key: 'spec_value', label: '규격값', placeholder: '예: 25.0' },
    { key: 'tolerance', label: '공차', placeholder: '예: 0.02' },
    { key: 'measured', label: '측정값', required: true, placeholder: '예: 25.01' },
    { key: 'judgment', label: '판정', type: 'select', options: ['OK', 'NG'], default: 'OK' },
    { key: 'worker', label: '검증자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '검증자 선택' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});
