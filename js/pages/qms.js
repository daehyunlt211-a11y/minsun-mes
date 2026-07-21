// QMS 모듈 (SQ 심사 대응)
//  · 공정검사 / 개선대책 / 4M 변경 / PPAP / 개발문서(PFMEA·PFD·관리계획서·작업표준서)
//  · 계측기 / 검교정 / Gauge R&R · 용접기술(WPS/PQR/용접사) · Q-Cost
import { createCrudPage } from '../lib/crud.js';
import { createInspectionPage } from './inspection.js';
import { num, won, todayStr } from '../lib/format.js';
import { badge } from '../ui/components.js';

// =====================================================================
// 6-3 공정검사 — 작업지시 기반, 검사기준(공정검사) 체크시트 평가
// =====================================================================
export const processInspection = createInspectionPage({
  table: 'process_inspections', kind: '공정검사', docPrefix: 'PI',
  title: '공정검사', subtitle: '작업지시(공정)를 대상으로 검사기준에 따라 공정(중간)검사를 진행합니다. SQ 심사 필수 데이터입니다.',
  sourceTable: 'work_orders', sourceKey: 'wo_no', sourceLabel: '작업지시',
  sourceText: (s) => `${s.wo_no} · ${s.item_name || ''} (${s.status || ''})`,
  sourceFill: { item_code: 'item_code', item_name: 'item_name', lot_no: 'lot_no', process: 'process', machine_no: 'machine_no' },
  extraKey: 'process', extraLabel: '공정',
});

// =====================================================================
// 6-6 개선대책관리 (부적합 연계 시정·예방조치)
// =====================================================================
export const improvementActions = createCrudPage({
  table: 'improvement_actions', title: '개선대책관리', subtitle: '부적합에 대한 시정·예방조치 대책과 효과확인을 관리합니다.',
  searchFields: ['imp_no', 'ncr_no', 'title', 'owner'], searchPlaceholder: '대책번호·부적합번호·제목 검색',
  defaultSort: { key: 'reg_date', dir: 'desc' },
  dateField: { key: 'reg_date', label: '등록일' },
  filters: [
    { key: 'action_type', label: '구분', options: ['시정조치', '예방조치'] },
    { key: 'status', label: '상태', options: ['진행중', '완료', '지연'] },
  ],
  statusChips: { key: 'status', options: ['진행중', '완료', '지연'] },
  docNoField: { key: 'imp_no', prefix: 'CA' },
  wideForm: true,
  stats: async (rows) => [
    { label: '총 개선대책', value: num(rows.length), unit: '건', icon: 'clipboard', tint: 'brand' },
    { label: '진행중', value: num(rows.filter(r => r.status === '진행중').length), unit: '건', icon: 'clock', tint: 'amber' },
    { label: '완료', value: num(rows.filter(r => r.status === '완료').length), unit: '건', icon: 'checkCircle', tint: 'green' },
    { label: '지연', value: num(rows.filter(r => r.status === '지연').length), unit: '건', icon: 'alert', tint: 'red' },
  ],
  columns: [
    { key: 'imp_no', label: '대책번호', cls: 'cell-code', sortable: true },
    { key: 'reg_date', label: '등록일', type: 'date', sortable: true },
    { key: 'ncr_no', label: '부적합번호', cls: 'cell-code' },
    { key: 'title', label: '제목', cls: 'cell-strong' },
    { key: 'action_type', label: '구분', type: 'badge' },
    { key: 'owner', label: '담당자' },
    { key: 'due_date', label: '완료예정', type: 'date', sortable: true },
    { key: 'complete_date', label: '완료일', type: 'date' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'imp_no', label: '대책번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'reg_date', label: '등록일', type: 'date', required: true, default: todayStr() },
    { key: 'ncr_no', label: '연계 부적합', ref: { table: 'nonconformances', value: 'ncr_no', label: (r) => `${r.ncr_no} · ${r.item_name || ''} (${r.defect_type || ''})`, fill: { title: (s) => `${s.defect_type || '부적합'} 개선대책 — ${s.item_name || ''}` } }, placeholder: '부적합 선택 (해당 시)' },
    { key: 'title', label: '제목', required: true, col2: true },
    { key: 'action_type', label: '구분', type: 'select', options: ['시정조치', '예방조치'], default: '시정조치' },
    { key: 'owner', label: '담당자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '담당자 선택' },
    { key: 'cause_analysis', label: '원인분석', type: 'textarea' },
    { key: 'action_plan', label: '대책 내용', type: 'textarea' },
    { key: 'due_date', label: '완료예정일', type: 'date' },
    { key: 'complete_date', label: '완료일', type: 'date' },
    { key: 'effect_check', label: '효과확인', type: 'textarea', placeholder: '조치 후 효과확인 결과' },
    { key: 'status', label: '상태', type: 'select', options: ['진행중', '완료', '지연'], default: '진행중' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// =====================================================================
// 7-1 4M 변경관리
// =====================================================================
export const fourMChanges = createCrudPage({
  table: 'four_m_changes', title: '4M 변경관리', subtitle: 'Man·Machine·Material·Method 변경 이력과 승인 절차를 관리합니다.',
  searchFields: ['fm_no', 'item_code', 'item_name', 'process', 'reason'], searchPlaceholder: '변경번호·품목·공정 검색',
  defaultSort: { key: 'change_date', dir: 'desc' },
  dateField: { key: 'change_date', label: '변경일' },
  filters: [
    { key: 'category', label: '구분', options: ['Man', 'Machine', 'Material', 'Method'] },
    { key: 'status', label: '상태', options: ['신청', '검토중', '승인', '반려'] },
  ],
  statusChips: { key: 'status', options: ['신청', '검토중', '승인', '반려'] },
  docNoField: { key: 'fm_no', prefix: '4M' },
  wideForm: true,
  stats: async (rows) => [
    { label: '총 4M 변경', value: num(rows.length), unit: '건', icon: 'refresh', tint: 'brand' },
    { label: '검토/신청', value: num(rows.filter(r => ['신청', '검토중'].includes(r.status)).length), unit: '건', icon: 'clock', tint: 'amber' },
    { label: '승인', value: num(rows.filter(r => r.status === '승인').length), unit: '건', icon: 'checkCircle', tint: 'green' },
    { label: 'PPAP 대상', value: num(rows.filter(r => r.ppap_yn).length), unit: '건', icon: 'clipboard', tint: 'violet' },
  ],
  columns: [
    { key: 'fm_no', label: '변경번호', cls: 'cell-code', sortable: true },
    { key: 'change_date', label: '변경일', type: 'date', sortable: true },
    { key: 'category', label: '4M 구분', type: 'badge', tone: 'brand' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'process', label: '공정' },
    { key: 'reason', label: '변경사유' },
    { key: 'ppap_yn', label: 'PPAP', align: 'center', csv: (r) => (r.ppap_yn ? 'Y' : 'N'), render: (r) => (r.ppap_yn ? badge('대상', 'warning') : '') },
    { key: 'approver', label: '승인자' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'fm_no', label: '변경번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'change_date', label: '변경일', type: 'date', required: true, default: todayStr() },
    { key: 'category', label: '4M 구분', type: 'select', options: ['Man', 'Machine', 'Material', 'Method'], default: 'Machine', required: true },
    { key: 'item_code', label: '품목', ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { item_name: 'name' } }, placeholder: '품목 선택' },
    { key: 'item_name', label: '품명(자동)', readonly: true },
    { key: 'process', label: '공정', ref: { table: 'processes', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '공정 선택' },
    { key: 'before_desc', label: '변경 전', type: 'textarea', required: true },
    { key: 'after_desc', label: '변경 후', type: 'textarea', required: true },
    { key: 'reason', label: '변경사유', col2: true },
    { key: 'ppap_yn', label: 'PPAP 제출 대상', type: 'switch', default: false },
    { key: 'approver', label: '승인자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '승인자 선택' },
    { key: 'status', label: '상태', type: 'select', options: ['신청', '검토중', '승인', '반려'], default: '신청' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// =====================================================================
// 7-2 PPAP 승인관리
// =====================================================================
export const ppapApprovals = createCrudPage({
  table: 'ppap_approvals', title: 'PPAP 승인관리', subtitle: '고객 PPAP 제출·승인 절차를 관리합니다.',
  searchFields: ['ppap_no', 'customer', 'item_code', 'item_name', 'fm_no'], searchPlaceholder: 'PPAP번호·고객사·품목 검색',
  defaultSort: { key: 'submit_date', dir: 'desc' },
  dateField: { key: 'submit_date', label: '제출일' },
  filters: [
    { key: 'level', label: 'Level', options: ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'] },
    { key: 'status', label: '상태', options: ['작성중', '제출', '승인', '반려'] },
  ],
  statusChips: { key: 'status', options: ['작성중', '제출', '승인', '반려'] },
  docNoField: { key: 'ppap_no', prefix: 'PPAP' },
  wideForm: true,
  columns: [
    { key: 'ppap_no', label: 'PPAP번호', cls: 'cell-code', sortable: true },
    { key: 'submit_date', label: '제출일', type: 'date', sortable: true },
    { key: 'customer', label: '고객사' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'level', label: 'Level', type: 'badge', tone: 'brand', align: 'center' },
    { key: 'reason', label: '제출사유' },
    { key: 'fm_no', label: '4M변경', cls: 'cell-code' },
    { key: 'approve_date', label: '승인일', type: 'date' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'ppap_no', label: 'PPAP번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'submit_date', label: '제출일', type: 'date', required: true, default: todayStr() },
    { key: 'customer', label: '고객사', required: true, ref: { table: 'partners', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '고객사 선택' },
    { key: 'item_code', label: '품목', ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { item_name: 'name' } }, placeholder: '품목 선택' },
    { key: 'item_name', label: '품명(자동)', readonly: true },
    { key: 'level', label: '제출 Level', type: 'select', options: ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'], default: 'Level 3' },
    { key: 'reason', label: '제출사유', type: 'select', options: ['신규부품', '4M변경', '설계변경', '공정변경', '기타'], default: '신규부품' },
    { key: 'fm_no', label: '연계 4M 변경', ref: { table: 'four_m_changes', value: 'fm_no', label: (r) => `${r.fm_no} · ${r.category} (${r.item_name || ''})` }, placeholder: '4M 변경 선택 (해당 시)' },
    { key: 'docs', label: '제출서류', type: 'textarea', placeholder: '예: PSW, 치수측정결과, 재료성적서, Cpk, MSA, PFMEA, 관리계획서' },
    { key: 'approver', label: '승인자(고객)' },
    { key: 'approve_date', label: '승인일', type: 'date' },
    { key: 'status', label: '상태', type: 'select', options: ['작성중', '제출', '승인', '반려'], default: '작성중' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// =====================================================================
// 7-3 개발문서 관리 (PFMEA / PFD / 관리계획서 / 작업표준서)
// =====================================================================
export const devDocs = createCrudPage({
  table: 'dev_docs', title: '개발문서관리', subtitle: 'PFMEA·PFD·관리계획서·작업표준서를 개정(Rev) 이력과 함께 관리합니다.',
  searchFields: ['doc_no', 'item_code', 'item_name', 'title', 'process'], searchPlaceholder: '문서번호·품목·제목 검색',
  defaultSort: { key: 'write_date', dir: 'desc' },
  dateField: { key: 'write_date', label: '작성일' },
  filters: [
    { key: 'doc_type', label: '문서유형', options: ['PFMEA', 'PFD', '관리계획서', '작업표준서'] },
    { key: 'status', label: '상태', options: ['작성중', '승인', '개정', '폐기'] },
  ],
  statusChips: { key: 'doc_type', options: ['PFMEA', 'PFD', '관리계획서', '작업표준서'] },
  docNoField: { key: 'doc_no', prefix: 'DOC' },
  stats: async (rows) => [
    { label: '총 문서', value: num(rows.length), unit: '건', icon: 'fileText', tint: 'brand' },
    { label: 'PFMEA/PFD', value: num(rows.filter(r => ['PFMEA', 'PFD'].includes(r.doc_type)).length), unit: '건', icon: 'clipboard', tint: 'violet' },
    { label: '관리계획서/작업표준서', value: num(rows.filter(r => ['관리계획서', '작업표준서'].includes(r.doc_type)).length), unit: '건', icon: 'layers', tint: 'green' },
    { label: '승인 완료', value: num(rows.filter(r => r.status === '승인').length), unit: '건', icon: 'checkCircle', tint: 'amber' },
  ],
  columns: [
    { key: 'doc_no', label: '문서번호', cls: 'cell-code', sortable: true },
    { key: 'doc_type', label: '유형', type: 'badge', tone: 'brand' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'process', label: '공정' },
    { key: 'rev', label: 'Rev', align: 'center', type: 'badge' },
    { key: 'title', label: '제목' },
    { key: 'writer', label: '작성자' },
    { key: 'write_date', label: '작성일', type: 'date', sortable: true },
    { key: 'approver', label: '승인자' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'doc_no', label: '문서번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'doc_type', label: '문서유형', type: 'select', options: ['PFMEA', 'PFD', '관리계획서', '작업표준서'], default: 'PFMEA', required: true },
    { key: 'item_code', label: '품목', ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { item_name: 'name' } }, placeholder: '품목 선택' },
    { key: 'item_name', label: '품명(자동)', readonly: true },
    { key: 'process', label: '공정', ref: { table: 'processes', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '공정 선택' },
    { key: 'rev', label: '개정(Rev)', default: 'A' },
    { key: 'title', label: '제목', required: true, col2: true },
    { key: 'writer', label: '작성자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '작성자 선택' },
    { key: 'write_date', label: '작성일', type: 'date', default: todayStr() },
    { key: 'approver', label: '승인자' },
    { key: 'approve_date', label: '승인일', type: 'date' },
    { key: 'file_url', label: '파일 URL', col2: true, placeholder: '문서 파일 링크(스토리지 URL)' },
    { key: 'status', label: '상태', type: 'select', options: ['작성중', '승인', '개정', '폐기'], default: '작성중' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// =====================================================================
// 8-1 계측기관리
// =====================================================================
export const instruments = createCrudPage({
  table: 'measuring_instruments', title: '계측기관리', subtitle: '계측기 등록과 검교정 주기(차기 교정일)를 관리합니다. SQ 측정 신뢰성 요구 대응.',
  searchFields: ['code', 'name', 'model', 'serial_no', 'manager'], searchPlaceholder: '계측기코드·명·시리얼 검색',
  defaultSort: { key: 'code', dir: 'asc' },
  filters: [{ key: 'status', label: '상태', options: ['정상', '교정중', '수리중', '폐기'] }],
  statusChips: { key: 'status', options: ['정상', '교정중', '수리중', '폐기'] },
  wideForm: true,
  stats: async (rows) => {
    const today = todayStr();
    const soon = new Date(); soon.setDate(soon.getDate() + 30);
    const soonStr = soon.toISOString().slice(0, 10);
    const overdue = rows.filter(r => r.next_calib && String(r.next_calib).slice(0, 10) < today).length;
    const upcoming = rows.filter(r => { const d = String(r.next_calib || '').slice(0, 10); return d >= today && d <= soonStr; }).length;
    return [
      { label: '총 계측기', value: num(rows.length), unit: '대', icon: 'target', tint: 'brand' },
      { label: '정상', value: num(rows.filter(r => r.status === '정상').length), unit: '대', icon: 'checkCircle', tint: 'green' },
      { label: '교정 임박(30일)', value: num(upcoming), unit: '대', icon: 'clock', tint: 'amber' },
      { label: '교정기한 초과', value: num(overdue), unit: '대', icon: 'alert', tint: 'red' },
    ];
  },
  columns: [
    { key: 'code', label: '계측기코드', cls: 'cell-code', sortable: true },
    { key: 'name', label: '계측기명', cls: 'cell-strong', sortable: true },
    { key: 'model', label: '모델' },
    { key: 'serial_no', label: '시리얼' },
    { key: 'meas_range', label: '측정범위' },
    { key: 'calib_cycle', label: '주기(개월)', type: 'num', align: 'center' },
    { key: 'last_calib', label: '최근교정', type: 'date', sortable: true },
    { key: 'next_calib', label: '차기교정', type: 'date', sortable: true, render: (r) => {
      const d = String(r.next_calib || '').slice(0, 10);
      if (!d) return '';
      const tone = d < todayStr() ? 'danger' : 'neutral';
      return badge(d, tone);
    } },
    { key: 'manager', label: '관리자' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'code', label: '계측기코드', required: true, placeholder: '예: MI-001' },
    { key: 'name', label: '계측기명', required: true },
    { key: 'model', label: '모델' },
    { key: 'serial_no', label: '시리얼번호' },
    { key: 'maker', label: '제조사' },
    { key: 'meas_range', label: '측정범위', placeholder: '예: 0-150mm' },
    { key: 'resolution', label: '분해능', placeholder: '예: 0.01mm' },
    { key: 'location', label: '보관위치' },
    { key: 'manager', label: '관리자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '관리자 선택' },
    { key: 'calib_cycle', label: '검교정주기(개월)', type: 'number', default: 12 },
    { key: 'last_calib', label: '최근 교정일', type: 'date' },
    { key: 'next_calib', label: '차기 교정일', type: 'date' },
    { key: 'status', label: '상태', type: 'select', options: ['정상', '교정중', '수리중', '폐기'], default: '정상' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 8-2 검교정/수리 이력
export const calibrations = createCrudPage({
  table: 'calibrations', title: '검교정 이력', subtitle: '계측기 검교정·수리 이력과 성적서를 관리합니다.',
  searchFields: ['cal_no', 'inst_code', 'inst_name', 'agency', 'cert_no'], searchPlaceholder: '교정번호·계측기·기관 검색',
  defaultSort: { key: 'cal_date', dir: 'desc' },
  dateField: { key: 'cal_date', label: '교정일' },
  filters: [
    { key: 'cal_type', label: '구분', options: ['사내교정', '외부교정', '수리'] },
    { key: 'result', label: '결과', options: ['합격', '불합격', '조정후합격'] },
  ],
  statusChips: { key: 'result', options: ['합격', '불합격', '조정후합격'] },
  docNoField: { key: 'cal_no', prefix: 'CAL' },
  columns: [
    { key: 'cal_no', label: '교정번호', cls: 'cell-code', sortable: true },
    { key: 'cal_date', label: '교정일', type: 'date', sortable: true },
    { key: 'inst_code', label: '계측기코드', cls: 'cell-code' },
    { key: 'inst_name', label: '계측기명', cls: 'cell-strong' },
    { key: 'cal_type', label: '구분', type: 'badge' },
    { key: 'agency', label: '교정기관' },
    { key: 'result', label: '결과', type: 'badge', align: 'center' },
    { key: 'cert_no', label: '성적서번호' },
    { key: 'cost', label: '비용', type: 'money' },
    { key: 'next_date', label: '차기교정일', type: 'date' },
  ],
  fields: [
    { key: 'cal_no', label: '교정번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'cal_date', label: '교정일', type: 'date', required: true, default: todayStr() },
    { key: 'inst_code', label: '계측기', required: true, ref: { table: 'measuring_instruments', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { inst_name: 'name' } }, placeholder: '계측기 선택' },
    { key: 'inst_name', label: '계측기명(자동)', readonly: true },
    { key: 'cal_type', label: '구분', type: 'select', options: ['사내교정', '외부교정', '수리'], default: '외부교정' },
    { key: 'agency', label: '교정기관' },
    { key: 'result', label: '결과', type: 'select', options: ['합격', '불합격', '조정후합격'], default: '합격' },
    { key: 'cert_no', label: '성적서번호' },
    { key: 'cost', label: '비용', type: 'number', default: 0 },
    { key: 'next_date', label: '차기 교정일', type: 'date' },
    { key: 'worker', label: '담당자' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 8-3 Gauge R&R
export const gaugeRR = createCrudPage({
  table: 'gauge_rr', title: 'Gauge R&R', subtitle: '계측기 반복성·재현성(%GRR) 평가를 관리합니다. (%GRR<10% 적합, 10~30% 조건부, >30% 부적합)',
  searchFields: ['rr_no', 'inst_code', 'inst_name', 'item_code', 'characteristic'], searchPlaceholder: 'R&R번호·계측기·특성 검색',
  defaultSort: { key: 'eval_date', dir: 'desc' },
  dateField: { key: 'eval_date', label: '평가일' },
  filters: [
    { key: 'judgment', label: '판정', options: ['적합', '조건부', '부적합'] },
    { key: 'status', label: '상태', options: ['계획', '진행', '완료'] },
  ],
  statusChips: { key: 'judgment', options: ['적합', '조건부', '부적합'] },
  docNoField: { key: 'rr_no', prefix: 'RR' },
  // %GRR 기준 판정 자동
  beforeSave: (data) => {
    const g = Number(data.grr_percent) || 0;
    data.judgment = g < 10 ? '적합' : g <= 30 ? '조건부' : '부적합';
  },
  stats: async (rows) => [
    { label: '총 평가', value: num(rows.length), unit: '건', icon: 'target', tint: 'brand' },
    { label: '적합(<10%)', value: num(rows.filter(r => r.judgment === '적합').length), unit: '건', icon: 'checkCircle', tint: 'green' },
    { label: '조건부(10~30%)', value: num(rows.filter(r => r.judgment === '조건부').length), unit: '건', icon: 'clock', tint: 'amber' },
    { label: '부적합(>30%)', value: num(rows.filter(r => r.judgment === '부적합').length), unit: '건', icon: 'alert', tint: 'red' },
  ],
  columns: [
    { key: 'rr_no', label: 'R&R번호', cls: 'cell-code', sortable: true },
    { key: 'eval_date', label: '평가일', type: 'date', sortable: true },
    { key: 'inst_name', label: '계측기', cls: 'cell-strong' },
    { key: 'item_code', label: '품목', cls: 'cell-code' },
    { key: 'characteristic', label: '측정특성' },
    { key: 'appraisers', label: '평가자', type: 'num', align: 'center' },
    { key: 'parts', label: '시료', type: 'num', align: 'center' },
    { key: 'trials', label: '반복', type: 'num', align: 'center' },
    { key: 'grr_percent', label: '%GRR', align: 'right', sortable: true, render: (r) => {
      const v = +r.grr_percent || 0;
      const tone = v < 10 ? 'success' : v <= 30 ? 'warning' : 'danger';
      return badge(v.toFixed(1) + '%', tone);
    } },
    { key: 'ndc', label: 'ndc', type: 'num', align: 'center' },
    { key: 'judgment', label: '판정', type: 'badge', align: 'center' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'rr_no', label: 'R&R번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'eval_date', label: '평가일', type: 'date', required: true, default: todayStr() },
    { key: 'plan_date', label: '평가계획일', type: 'date' },
    { key: 'inst_code', label: '계측기', required: true, ref: { table: 'measuring_instruments', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { inst_name: 'name' } }, placeholder: '계측기 선택' },
    { key: 'inst_name', label: '계측기명(자동)', readonly: true },
    { key: 'item_code', label: '품목', ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}` }, placeholder: '품목 선택' },
    { key: 'characteristic', label: '측정특성', placeholder: '예: 내경 Ø25' },
    { key: 'appraisers', label: '평가자 수', type: 'number', default: 3 },
    { key: 'parts', label: '시료 수', type: 'number', default: 10 },
    { key: 'trials', label: '반복 수', type: 'number', default: 3 },
    { key: 'grr_percent', label: '%GRR', type: 'number', required: true, default: 0, placeholder: '평가 결과 %GRR (판정 자동)' },
    { key: 'ndc', label: 'ndc(구별범주수)', type: 'number', default: 0 },
    { key: 'evaluator', label: '평가자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '평가자 선택' },
    { key: 'status', label: '상태', type: 'select', options: ['계획', '진행', '완료'], default: '완료' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// =====================================================================
// 9. 용접기술관리 (WPS / PQR / 용접사)
// =====================================================================
export const wpsDocs = createCrudPage({
  table: 'wps_docs', title: 'WPS 관리', subtitle: '용접절차 시방서(WPS)를 등록·개정 관리합니다.',
  searchFields: ['wps_no', 'title', 'welding_process', 'base_metal', 'pqr_no'], searchPlaceholder: 'WPS번호·용접법·모재 검색',
  defaultSort: { key: 'wps_no', dir: 'asc' },
  filters: [
    { key: 'welding_process', label: '용접법', options: ['GTAW(TIG)', 'GMAW(MIG/MAG)', 'SMAW(피복아크)', 'SAW', 'SPOT', '기타'] },
    { key: 'status', label: '상태', options: ['작성중', '승인', '개정', '폐기'] },
  ],
  statusChips: { key: 'status', options: ['작성중', '승인', '개정', '폐기'] },
  docNoField: { key: 'wps_no', prefix: 'WPS' },
  wideForm: true,
  columns: [
    { key: 'wps_no', label: 'WPS번호', cls: 'cell-code', sortable: true },
    { key: 'rev', label: 'Rev', align: 'center', type: 'badge' },
    { key: 'title', label: '제목', cls: 'cell-strong' },
    { key: 'welding_process', label: '용접법', type: 'badge', tone: 'brand' },
    { key: 'base_metal', label: '모재' },
    { key: 'filler_metal', label: '용가재' },
    { key: 'current_range', label: '전류(A)' },
    { key: 'voltage_range', label: '전압(V)' },
    { key: 'pqr_no', label: '근거 PQR', cls: 'cell-code' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'wps_no', label: 'WPS번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'rev', label: '개정(Rev)', default: 'A' },
    { key: 'title', label: '제목', required: true, col2: true },
    { key: 'welding_process', label: '용접법', type: 'select', options: ['GTAW(TIG)', 'GMAW(MIG/MAG)', 'SMAW(피복아크)', 'SAW', 'SPOT', '기타'], default: 'GMAW(MIG/MAG)', required: true },
    { key: 'position', label: '용접자세', placeholder: '예: 1G, 2F' },
    { key: 'base_metal', label: '모재', placeholder: '예: AL6061-T6' },
    { key: 'filler_metal', label: '용가재', placeholder: '예: ER4043' },
    { key: 'shielding_gas', label: '보호가스', placeholder: '예: Ar 100%' },
    { key: 'current_range', label: '전류범위(A)', placeholder: '예: 120~180' },
    { key: 'voltage_range', label: '전압범위(V)', placeholder: '예: 18~24' },
    { key: 'travel_speed', label: '용접속도', placeholder: '예: 25~35 cm/min' },
    { key: 'preheat_temp', label: '예열온도', placeholder: '예: 상온 / 80℃' },
    { key: 'pqr_no', label: '근거 PQR', ref: { table: 'pqr_docs', value: 'pqr_no', label: (r) => `${r.pqr_no} · ${r.welding_process || ''}` }, placeholder: 'PQR 선택 (해당 시)' },
    { key: 'writer', label: '작성자', ref: { table: 'users', value: 'name', label: (r) => `${r.name}` }, placeholder: '작성자 선택' },
    { key: 'write_date', label: '작성일', type: 'date', default: todayStr() },
    { key: 'approver', label: '승인자' },
    { key: 'status', label: '상태', type: 'select', options: ['작성중', '승인', '개정', '폐기'], default: '작성중' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

export const pqrDocs = createCrudPage({
  table: 'pqr_docs', title: 'PQR 관리', subtitle: '용접절차 인정기록서(PQR)와 시험 결과를 관리합니다.',
  searchFields: ['pqr_no', 'wps_no', 'welding_process', 'welder', 'test_agency'], searchPlaceholder: 'PQR번호·용접법·용접사 검색',
  defaultSort: { key: 'test_date', dir: 'desc' },
  dateField: { key: 'test_date', label: '시험일' },
  filters: [
    { key: 'result', label: '결과', options: ['합격', '불합격'] },
    { key: 'status', label: '상태', options: ['유효', '만료', '폐기'] },
  ],
  statusChips: { key: 'result', options: ['합격', '불합격'] },
  docNoField: { key: 'pqr_no', prefix: 'PQR' },
  columns: [
    { key: 'pqr_no', label: 'PQR번호', cls: 'cell-code', sortable: true },
    { key: 'test_date', label: '시험일', type: 'date', sortable: true },
    { key: 'welding_process', label: '용접법', type: 'badge', tone: 'brand' },
    { key: 'base_metal', label: '모재' },
    { key: 'welder', label: '시험 용접사' },
    { key: 'test_items', label: '시험항목' },
    { key: 'test_agency', label: '시험기관' },
    { key: 'result', label: '결과', type: 'badge', align: 'center' },
    { key: 'cert_no', label: '성적서번호' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'pqr_no', label: 'PQR번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'test_date', label: '시험일', type: 'date', required: true, default: todayStr() },
    { key: 'welding_process', label: '용접법', type: 'select', options: ['GTAW(TIG)', 'GMAW(MIG/MAG)', 'SMAW(피복아크)', 'SAW', 'SPOT', '기타'], default: 'GMAW(MIG/MAG)' },
    { key: 'base_metal', label: '모재' },
    { key: 'filler_metal', label: '용가재' },
    { key: 'welder', label: '시험 용접사', ref: { table: 'welders', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '용접사 선택' },
    { key: 'test_items', label: '시험항목', placeholder: '예: 인장, 굽힘, 침투탐상' },
    { key: 'test_agency', label: '시험기관' },
    { key: 'result', label: '결과', type: 'select', options: ['합격', '불합격'], default: '합격' },
    { key: 'cert_no', label: '성적서번호' },
    { key: 'status', label: '상태', type: 'select', options: ['유효', '만료', '폐기'], default: '유효' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

export const welders = createCrudPage({
  table: 'welders', title: '용접사 관리', subtitle: '용접사 자격·유효기간·갱신 이력을 관리합니다.',
  searchFields: ['code', 'name', 'cert_no', 'cert_type', 'welding_process'], searchPlaceholder: '용접사·자격증번호 검색',
  defaultSort: { key: 'code', dir: 'asc' },
  filters: [{ key: 'status', label: '상태', options: ['유효', '만료임박', '만료'] }],
  statusChips: { key: 'status', options: ['유효', '만료임박', '만료'] },
  // 유효기간 기준 상태 자동 판정 (만료 60일 전 = 만료임박)
  beforeSave: (data) => {
    const exp = String(data.expire_date || '').slice(0, 10);
    if (exp) {
      const today = todayStr();
      const soon = new Date(); soon.setDate(soon.getDate() + 60);
      const soonStr = soon.toISOString().slice(0, 10);
      data.status = exp < today ? '만료' : exp <= soonStr ? '만료임박' : '유효';
    }
  },
  stats: async (rows) => [
    { label: '총 용접사', value: num(rows.length), unit: '명', icon: 'users', tint: 'brand' },
    { label: '유효', value: num(rows.filter(r => r.status === '유효').length), unit: '명', icon: 'checkCircle', tint: 'green' },
    { label: '만료임박', value: num(rows.filter(r => r.status === '만료임박').length), unit: '명', icon: 'clock', tint: 'amber' },
    { label: '만료', value: num(rows.filter(r => r.status === '만료').length), unit: '명', icon: 'alert', tint: 'red' },
  ],
  columns: [
    { key: 'code', label: '사번', cls: 'cell-code', sortable: true },
    { key: 'name', label: '이름', cls: 'cell-strong', sortable: true },
    { key: 'department', label: '부서' },
    { key: 'cert_type', label: '자격종류' },
    { key: 'cert_no', label: '자격증번호' },
    { key: 'welding_process', label: '인정 용접법' },
    { key: 'issue_date', label: '취득일', type: 'date' },
    { key: 'expire_date', label: '유효기간', type: 'date', sortable: true },
    { key: 'renewal_date', label: '갱신예정', type: 'date' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'code', label: '사번(코드)', required: true, placeholder: '예: WD-01' },
    { key: 'name', label: '이름', required: true },
    { key: 'department', label: '부서', ref: { table: 'departments', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '부서 선택' },
    { key: 'cert_type', label: '자격종류', placeholder: '예: 용접기능사, 사내인증' },
    { key: 'cert_no', label: '자격증번호' },
    { key: 'welding_process', label: '인정 용접법', type: 'select', options: ['GTAW(TIG)', 'GMAW(MIG/MAG)', 'SMAW(피복아크)', 'SAW', 'SPOT', '기타'], default: 'GMAW(MIG/MAG)' },
    { key: 'position_range', label: '인정 자세', placeholder: '예: F, H, V' },
    { key: 'issue_date', label: '취득일', type: 'date' },
    { key: 'expire_date', label: '유효기간(만료일)', type: 'date' },
    { key: 'renewal_date', label: '갱신예정일', type: 'date' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// =====================================================================
// 10. Q-Cost 관리
// =====================================================================
const QCOST_CATS = ['예방비용', '평가비용', '내부실패비용', '외부실패비용'];

export const qcostItems = createCrudPage({
  table: 'qcost_items', title: 'Q-Cost 기준항목', subtitle: '예방·평가·내부/외부실패 비용의 세부항목 기준을 관리합니다.',
  searchFields: ['code', 'name', 'calc_basis'], searchPlaceholder: '항목코드·명 검색',
  defaultSort: { key: 'code', dir: 'asc' },
  filters: [{ key: 'category', label: '분류', options: QCOST_CATS }],
  statusChips: { key: 'category', options: QCOST_CATS },
  columns: [
    { key: 'code', label: '항목코드', cls: 'cell-code', sortable: true },
    { key: 'category', label: '분류', type: 'badge', tone: 'brand' },
    { key: 'name', label: '항목명', cls: 'cell-strong' },
    { key: 'calc_basis', label: '산출기준' },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
    { key: 'remark', label: '비고' },
  ],
  fields: [
    { key: 'code', label: '항목코드', required: true, placeholder: '예: QP-01' },
    { key: 'category', label: '분류', type: 'select', options: QCOST_CATS, default: '예방비용', required: true },
    { key: 'name', label: '항목명', required: true, placeholder: '예: 품질교육비, 검사인건비, 폐기비용, 클레임비용' },
    { key: 'calc_basis', label: '산출기준', col2: true, placeholder: '예: 월별 교육비 실적 합계' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

export const qcostRecords = createCrudPage({
  table: 'qcost_records', title: 'Q-Cost 등록/현황', subtitle: '월별 품질비용을 등록하고 분류별 현황을 확인합니다.',
  searchFields: ['rec_no', 'cost_ym', 'cost_code', 'cost_name', 'dept'], searchPlaceholder: '등록번호·귀속월·항목 검색',
  defaultSort: { key: 'cost_ym', dir: 'desc' },
  filters: [{ key: 'category', label: '분류', options: QCOST_CATS }],
  statusChips: { key: 'category', options: QCOST_CATS },
  docNoField: { key: 'rec_no', prefix: 'QC' },
  stats: async (rows) => {
    const sum = (cat) => rows.filter(r => r.category === cat).reduce((s, r) => s + (+r.amount || 0), 0);
    return [
      { label: '예방비용', value: won(sum('예방비용')), icon: 'shield', tint: 'green' },
      { label: '평가비용', value: won(sum('평가비용')), icon: 'search', tint: 'brand' },
      { label: '내부실패비용', value: won(sum('내부실패비용')), icon: 'alert', tint: 'amber' },
      { label: '외부실패비용', value: won(sum('외부실패비용')), icon: 'alert', tint: 'red' },
    ];
  },
  columns: [
    { key: 'rec_no', label: '등록번호', cls: 'cell-code', sortable: true },
    { key: 'cost_ym', label: '귀속월', sortable: true, align: 'center' },
    { key: 'category', label: '분류', type: 'badge', tone: 'brand' },
    { key: 'cost_code', label: '항목코드', cls: 'cell-code' },
    { key: 'cost_name', label: '항목명', cls: 'cell-strong' },
    { key: 'amount', label: '금액', type: 'money', sortable: true },
    { key: 'dept', label: '부서' },
    { key: 'writer', label: '작성자' },
  ],
  fields: [
    { key: 'rec_no', label: '등록번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'cost_ym', label: '귀속월', required: true, placeholder: 'YYYY-MM', default: todayStr().slice(0, 7) },
    { key: 'cost_code', label: 'Q-Cost 항목', required: true, ref: { table: 'qcost_items', value: 'code', label: (r) => `${r.code} · ${r.name} (${r.category})`, fill: { cost_name: 'name', category: 'category' } }, placeholder: '기준항목 선택' },
    { key: 'cost_name', label: '항목명(자동)', readonly: true },
    { key: 'category', label: '분류(자동)', readonly: true },
    { key: 'amount', label: '금액(원)', type: 'number', required: true, default: 0 },
    { key: 'dept', label: '부서', ref: { table: 'departments', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '부서 선택' },
    { key: 'writer', label: '작성자', ref: { table: 'users', value: 'name', label: (r) => `${r.name}` }, placeholder: '작성자 선택' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});
