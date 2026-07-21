// 기준정보관리: 사용자/부서/공통코드/거래처/품목/공구/설비/도면/표준재질/휴일
import { createCrudPage } from '../lib/crud.js';
import { num } from '../lib/format.js';
import { badge } from '../ui/components.js';

// 거래처 구분 (민선: 원소재·절단업체 포함)
const PARTNER_TYPES = ['매출처', '매입처', '외주가공처', '원소재업체', '절단업체'];
// 공정 유형 (가공업)
export const PROCESS_TYPES = ['MCT가공', 'CNC가공', 'DRILL', '복합기', 'PIPE성형', '용접', '조립', '검사', '포장', '외주'];

// 1-1 사용자관리
export const users = createCrudPage({
  table: 'users', title: '사용자관리', subtitle: '시스템 사용자 계정·비밀번호·권한을 관리합니다.',
  searchFields: ['login_id', 'name', 'department', 'email'], searchPlaceholder: '아이디·이름·부서 검색',
  defaultSort: { key: 'login_id', dir: 'asc' },
  beforeSave: (data) => { if (data.password === '' || data.password == null) delete data.password; },
  filters: [
    { key: 'role', label: '권한', options: [{ value: 'admin', label: '관리자' }, { value: 'manager', label: '매니저' }, { value: 'user', label: '일반' }] },
    { key: 'department', label: '부서', options: ['경영지원팀', '영업팀', '생산팀', '품질팀', '자재팀'] },
  ],
  columns: [
    { key: 'login_id', label: '아이디', cls: 'cell-code', sortable: true },
    { key: 'name', label: '이름', cls: 'cell-strong', sortable: true },
    { key: 'department', label: '부서' },
    { key: 'position', label: '직급' },
    { key: 'role', label: '권한', type: 'badge', render: (r) => ({ admin: '관리자', manager: '매니저', user: '일반' }[r.role] || r.role) },
    { key: 'password', label: '비밀번호', align: 'center', csv: (r) => (r.password ? '설정' : '미설정'), render: (r) => (r.password ? badge('설정', 'success') : badge('미설정', 'neutral')) },
    { key: 'email', label: '이메일' },
    { key: 'phone', label: '연락처' },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
  ],
  fields: [
    { key: 'login_id', label: '로그인 아이디', required: true },
    { key: 'password', label: '비밀번호', type: 'password', placeholder: '로그인 비밀번호 (수정 시 변경할 때만 입력)' },
    { key: 'name', label: '이름', required: true },
    { key: 'department', label: '부서', ref: { table: 'departments', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '부서 선택' },
    { key: 'position', label: '직급' },
    { key: 'role', label: '권한', type: 'select', options: [{ value: 'admin', label: '관리자' }, { value: 'manager', label: '매니저' }, { value: 'user', label: '일반' }], default: 'user' },
    { key: 'email', label: '이메일' },
    { key: 'phone', label: '연락처' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 1-2 부서관리
export const departments = createCrudPage({
  table: 'departments', title: '부서관리', subtitle: '조직 부서 정보를 관리합니다.',
  searchFields: ['code', 'name', 'manager'], searchPlaceholder: '부서코드·부서명 검색',
  defaultSort: { key: 'code', dir: 'asc' },
  columns: [
    { key: 'code', label: '부서코드', cls: 'cell-code', sortable: true },
    { key: 'name', label: '부서명', cls: 'cell-strong', sortable: true },
    { key: 'manager', label: '부서장' },
    { key: 'phone', label: '연락처' },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
    { key: 'remark', label: '비고' },
  ],
  fields: [
    { key: 'code', label: '부서코드', required: true, placeholder: '예: D300' },
    { key: 'name', label: '부서명', required: true },
    { key: 'manager', label: '부서장' },
    { key: 'phone', label: '연락처' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 1-0 공통코드관리
export const commonCodes = createCrudPage({
  table: 'common_codes', title: '공통코드관리', subtitle: '시스템 공통코드(불량유형·비가동사유 등)를 그룹별로 관리합니다.',
  searchFields: ['group_code', 'group_name', 'code', 'name'], searchPlaceholder: '그룹코드·코드·명칭 검색',
  defaultSort: { key: 'group_code', dir: 'asc' },
  filters: [{ key: 'group_code', label: '코드그룹', options: ['DEFECT_TYPE', 'DOWNTIME', 'WAREHOUSE', 'ACTION_TYPE', 'LINE'] }],
  columns: [
    { key: 'group_code', label: '그룹코드', cls: 'cell-code', sortable: true },
    { key: 'group_name', label: '그룹명' },
    { key: 'code', label: '코드', cls: 'cell-code', sortable: true },
    { key: 'name', label: '코드명', cls: 'cell-strong' },
    { key: 'sort_no', label: '정렬', type: 'num', align: 'center' },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
    { key: 'remark', label: '비고' },
  ],
  fields: [
    { key: 'group_code', label: '그룹코드', required: true, placeholder: '예: DEFECT_TYPE' },
    { key: 'group_name', label: '그룹명', placeholder: '예: 불량유형' },
    { key: 'code', label: '코드', required: true, placeholder: '예: D01' },
    { key: 'name', label: '코드명', required: true, placeholder: '예: 치수불량' },
    { key: 'sort_no', label: '정렬순서', type: 'number', default: 0 },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 1-3 거래처관리 (매출처/매입처/외주가공처/원소재업체/절단업체)
export const partners = createCrudPage({
  table: 'partners', title: '거래처관리', subtitle: '매출처·매입처·외주가공처·원소재업체·절단업체를 통합 관리합니다.',
  searchFields: ['code', 'name', 'biz_no', 'ceo', 'manager'], searchPlaceholder: '거래처코드·명·사업자번호 검색',
  defaultSort: { key: 'code', dir: 'asc' },
  filters: [{ key: 'biz_type', label: '구분', options: PARTNER_TYPES }],
  statusChips: { key: 'biz_type', options: PARTNER_TYPES },
  columns: [
    { key: 'code', label: '거래처코드', cls: 'cell-code', sortable: true },
    { key: 'name', label: '거래처명', cls: 'cell-strong', sortable: true },
    { key: 'biz_type', label: '구분', type: 'badge' },
    { key: 'biz_no', label: '사업자번호' },
    { key: 'ceo', label: '대표자' },
    { key: 'manager', label: '담당자' },
    { key: 'phone', label: '연락처' },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
  ],
  fields: [
    { key: 'code', label: '거래처코드', required: true, placeholder: '예: C001' },
    { key: 'name', label: '거래처명', required: true },
    { key: 'biz_type', label: '거래구분', type: 'select', options: PARTNER_TYPES, default: '매출처' },
    { key: 'biz_no', label: '사업자등록번호', placeholder: '000-00-00000' },
    { key: 'ceo', label: '대표자' },
    { key: 'manager', label: '담당자' },
    { key: 'phone', label: '연락처' },
    { key: 'email', label: '이메일' },
    { key: 'address', label: '주소', col2: true },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 1-4 품목관리 (EA/KG 이중단위·단중·판매/구매/외주단가·라우팅그룹)
export const items = createCrudPage({
  table: 'items', title: '품목관리', subtitle: '가공업 특성(EA/KG 이중단위, 단중, 판매·구매·외주단가, 라우팅그룹)을 포함한 품목 정보를 관리합니다.',
  searchFields: ['code', 'name', 'spec', 'customer', 'material', 'drawing_no'], searchPlaceholder: '품목코드·품명·규격·재질·도면 검색',
  defaultSort: { key: 'code', dir: 'asc' },
  wideForm: true,
  filters: [{ key: 'item_type', label: '품목유형', options: ['완제품', '반제품', '원소재', '부자재'] }],
  statusChips: { key: 'item_type', options: ['완제품', '반제품', '원소재', '부자재'] },
  columns: [
    { key: 'code', label: '품목코드', cls: 'cell-code', sortable: true },
    { key: 'name', label: '품명', cls: 'cell-strong', sortable: true },
    { key: 'item_type', label: '유형', type: 'badge' },
    { key: 'customer', label: '고객사' },
    { key: 'spec', label: '규격' },
    { key: 'material', label: '재질' },
    { key: 'unit', label: '단위', align: 'center', render: (r) => `${r.unit || 'EA'}${r.unit2 ? '/' + r.unit2 : ''}`, csv: (r) => `${r.unit || 'EA'}${r.unit2 ? '/' + r.unit2 : ''}` },
    { key: 'unit_weight', label: '단중(KG)', type: 'num', sortable: true },
    { key: 'sale_price', label: '판매단가', type: 'money', sortable: true },
    { key: 'purchase_price', label: '구매단가', type: 'money' },
    { key: 'subcon_price', label: '외주단가', type: 'money' },
    { key: 'routing_group', label: '라우팅그룹' },
    { key: 'location', label: '대표위치' },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
  ],
  // 대표단가(unit_price)는 판매단가와 동기화(타 화면 호환)
  beforeSave: (data) => { data.unit_price = data.sale_price ?? 0; },
  fields: [
    { key: 'code', label: '품목코드', required: true, placeholder: '예: P-1001' },
    { key: 'name', label: '품명', required: true },
    { key: 'item_type', label: '품목유형', type: 'select', options: ['완제품', '반제품', '원소재', '부자재'], default: '완제품' },
    { key: 'customer', label: '고객사', ref: { table: 'partners', value: 'name', label: (r) => `${r.code} · ${r.name} (${r.biz_type || ''})` }, placeholder: '고객사(매출처) 선택' },
    { key: 'spec', label: '규격' },
    { key: 'material', label: '재질', ref: { table: 'std_materials', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '표준재질 선택' },
    { key: 'drawing_no', label: '도면번호' },
    { key: 'unit', label: '기본단위', type: 'select', options: ['EA', 'SET', 'KG', 'M', 'BOX'], default: 'EA' },
    { key: 'unit2', label: '보조단위(이중단위)', type: 'select', options: ['KG', 'EA', 'M'], default: 'KG', placeholder: '없음' },
    { key: 'unit_weight', label: '단중 (KG/EA)', type: 'number', default: 0 },
    { key: 'routing_group', label: '라우팅그룹', placeholder: '예: RG-MCT-A' },
    { key: 'category', label: '분류' },
    { key: 'safety_stock', label: '안전재고', type: 'number', default: 0 },
    { key: 'sale_price', label: '판매단가', type: 'number', default: 0 },
    { key: 'purchase_price', label: '구매단가', type: 'number', default: 0 },
    { key: 'subcon_price', label: '외주단가', type: 'number', default: 0 },
    { key: 'location', label: '대표위치', placeholder: '예: 자재창고1 A-01' },
    { key: 'partner', label: '주거래처', ref: { table: 'partners', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '거래처 선택' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 1-7 공구관리 마스터 (최대사용횟수·교체알람횟수·공구LOT 체계)
export const tools = createCrudPage({
  table: 'tools', title: '공구 기초정보', subtitle: '공구 품목, 최대사용횟수, 교체알람횟수, 공구 LOT 체계를 관리합니다.',
  searchFields: ['code', 'name', 'spec', 'maker'], searchPlaceholder: '공구코드·공구명 검색',
  defaultSort: { key: 'code', dir: 'asc' },
  filters: [{ key: 'tool_type', label: '공구유형', options: ['절삭', '측정', '지그', '기타'] }],
  statusChips: { key: 'tool_type', options: ['절삭', '측정', '지그', '기타'] },
  columns: [
    { key: 'code', label: '공구코드', cls: 'cell-code', sortable: true },
    { key: 'name', label: '공구명', cls: 'cell-strong', sortable: true },
    { key: 'tool_type', label: '유형', type: 'badge' },
    { key: 'spec', label: '규격' },
    { key: 'process', label: '사용공정' },
    { key: 'life_count', label: '최대사용횟수', type: 'num' },
    { key: 'alarm_count', label: '교체알람횟수', type: 'num' },
    { key: 'unit_price', label: '표준단가', type: 'money' },
    { key: 'lot_rule', label: 'LOT 체계' },
    { key: 'safety_stock', label: '안전재고', type: 'num' },
    { key: 'location', label: '보관위치' },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
  ],
  fields: [
    { key: 'code', label: '공구코드', required: true, placeholder: '예: T-001' },
    { key: 'name', label: '공구명', required: true },
    { key: 'tool_type', label: '공구유형', type: 'select', options: ['절삭', '측정', '지그', '기타'], default: '절삭' },
    { key: 'spec', label: '규격' },
    { key: 'maker', label: '제작처(제조사)' },
    { key: 'process', label: '사용공정', ref: { table: 'processes', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '공정 선택' },
    { key: 'life_count', label: '최대사용횟수(1개당)', type: 'number', default: 0 },
    { key: 'alarm_count', label: '교체알람횟수', type: 'number', default: 0, placeholder: '알람 발생 기준 횟수' },
    { key: 'unit_price', label: '표준 입고단가', type: 'number', default: 0 },
    { key: 'lot_rule', label: '공구 LOT 형식', placeholder: '예: T001-YYMMDD-일련 (제작일자 기반)' },
    { key: 'unit', label: '단위', type: 'select', options: ['EA', 'SET'], default: 'EA' },
    { key: 'safety_stock', label: '안전재고', type: 'number', default: 0 },
    { key: 'location', label: '보관위치' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 1-8 설비관리 (호기·PLC 연계)
export const equipments = createCrudPage({
  table: 'equipments', title: '설비관리', subtitle: 'MCT/CNC/DRILL/복합기/PIPE/용접기 설비(호기)와 PLC 연계 여부를 관리합니다.',
  searchFields: ['code', 'name', 'model', 'maker', 'work_center', 'machine_no'], searchPlaceholder: '설비코드·설비명·호기 검색',
  defaultSort: { key: 'code', dir: 'asc' },
  filters: [
    { key: 'equip_type', label: '설비유형', options: ['MCT', 'CNC', 'DRILL', '복합기', 'PIPE성형기', '용접기', '검사기', '기타'] },
    { key: 'status', label: '상태', options: ['정상', '점검', '고장', '비가동'] },
  ],
  statusChips: { key: 'status', options: ['정상', '점검', '고장', '비가동'] },
  stats: async (rows) => {
    const c = (s) => rows.filter(r => r.status === s).length;
    return [
      { label: '전체 설비', value: num(rows.length), unit: '대', icon: 'cpu', tint: 'brand' },
      { label: '정상 가동', value: num(c('정상')), unit: '대', icon: 'checkCircle', tint: 'green' },
      { label: 'PLC 연계', value: num(rows.filter(r => r.plc_yn).length), unit: '대', icon: 'zap', tint: 'violet' },
      { label: '고장/비가동', value: num(c('고장') + c('비가동')), unit: '대', icon: 'alert', tint: 'red' },
    ];
  },
  columns: [
    { key: 'code', label: '설비코드', cls: 'cell-code', sortable: true },
    { key: 'name', label: '설비명', cls: 'cell-strong', sortable: true },
    { key: 'equip_type', label: '유형', type: 'badge', tone: 'brand' },
    { key: 'machine_no', label: '호기', align: 'center' },
    { key: 'model', label: '모델' },
    { key: 'work_center', label: '작업장' },
    { key: 'plc_yn', label: 'PLC연계', align: 'center', csv: (r) => (r.plc_yn ? 'Y' : 'N'), render: (r) => (r.plc_yn ? badge('연계', 'success') : badge('미연계', 'neutral')) },
    { key: 'check_cycle', label: '점검주기', align: 'center' },
    { key: 'install_date', label: '설치일', type: 'date', sortable: true },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  fields: [
    { key: 'code', label: '설비코드', required: true, placeholder: '예: MCT-01' },
    { key: 'name', label: '설비명', required: true },
    { key: 'equip_type', label: '설비유형', type: 'select', options: ['MCT', 'CNC', 'DRILL', '복합기', 'PIPE성형기', '용접기', '검사기', '기타'], default: 'MCT' },
    { key: 'machine_no', label: '호기', placeholder: '예: 1호기' },
    { key: 'model', label: '모델명' },
    { key: 'maker', label: '제조사' },
    { key: 'work_center', label: '작업장' },
    { key: 'install_date', label: '설치일', type: 'date' },
    { key: 'plc_yn', label: 'PLC(CMS) 연계', type: 'switch', default: false },
    { key: 'check_cycle', label: '점검주기', type: 'select', options: ['일상', '주간', '월간'], default: '일상' },
    { key: 'status', label: '가동상태', type: 'select', options: ['정상', '점검', '고장', '비가동'], default: '정상' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 1-10 도면관리
export const drawings = createCrudPage({
  table: 'drawings', title: '도면관리', subtitle: '품목별 도면과 개정(Rev) 정보를 관리합니다.',
  searchFields: ['drawing_no', 'item_code', 'item_name', 'title'], searchPlaceholder: '도면번호·품목 검색',
  defaultSort: { key: 'drawing_no', dir: 'asc' },
  columns: [
    { key: 'drawing_no', label: '도면번호', cls: 'cell-code', sortable: true },
    { key: 'item_code', label: '품목코드', cls: 'cell-code' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'rev', label: 'Rev', align: 'center', type: 'badge', tone: 'brand' },
    { key: 'title', label: '도면명' },
    { key: 'writer', label: '작성자' },
    { key: 'reg_date', label: '등록일', type: 'date', sortable: true },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
  ],
  fields: [
    { key: 'drawing_no', label: '도면번호', required: true, placeholder: '예: DWG-P1001-A' },
    { key: 'item_code', label: '품목', ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { item_name: 'name' } }, placeholder: '품목 선택' },
    { key: 'item_name', label: '품명', readonly: true },
    { key: 'rev', label: '개정(Rev)', default: 'A' },
    { key: 'title', label: '도면명', col2: true },
    { key: 'file_url', label: '파일 URL', col2: true, placeholder: '도면 파일 링크(스토리지 URL)' },
    { key: 'writer', label: '작성자' },
    { key: 'reg_date', label: '등록일', type: 'date' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 1-11 표준재질관리
export const stdMaterials = createCrudPage({
  table: 'std_materials', title: '표준재질관리', subtitle: '알루미늄·스틸 등 표준재질과 비중 정보를 관리합니다.',
  searchFields: ['code', 'name', 'category', 'spec'], searchPlaceholder: '재질코드·명 검색',
  defaultSort: { key: 'code', dir: 'asc' },
  filters: [{ key: 'category', label: '분류', options: ['알루미늄', '스틸', '스테인리스', '동/황동', '기타'] }],
  columns: [
    { key: 'code', label: '재질코드', cls: 'cell-code', sortable: true },
    { key: 'name', label: '재질명', cls: 'cell-strong', sortable: true },
    { key: 'category', label: '분류', type: 'badge' },
    { key: 'density', label: '비중', type: 'num', align: 'center' },
    { key: 'spec', label: '규격' },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
    { key: 'remark', label: '비고' },
  ],
  fields: [
    { key: 'code', label: '재질코드', required: true, placeholder: '예: AL6061' },
    { key: 'name', label: '재질명', required: true, placeholder: '예: AL 6061-T6' },
    { key: 'category', label: '분류', type: 'select', options: ['알루미늄', '스틸', '스테인리스', '동/황동', '기타'], default: '알루미늄' },
    { key: 'density', label: '비중', type: 'number', default: 0, placeholder: '예: 2.7' },
    { key: 'spec', label: '규격' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 1-12 휴일관리
export const holidays = createCrudPage({
  table: 'holidays', title: '휴일관리', subtitle: '법정공휴일·회사휴일을 관리합니다. 생산계획 일정 산정에 활용됩니다.',
  searchFields: ['name'], searchPlaceholder: '휴일명 검색',
  defaultSort: { key: 'holiday_date', dir: 'desc' },
  dateField: { key: 'holiday_date', label: '휴일' },
  filters: [{ key: 'holiday_type', label: '구분', options: ['법정공휴일', '회사휴일', '임시휴일'] }],
  columns: [
    { key: 'holiday_date', label: '일자', type: 'date', sortable: true },
    { key: 'name', label: '휴일명', cls: 'cell-strong' },
    { key: 'holiday_type', label: '구분', type: 'badge' },
    { key: 'remark', label: '비고' },
  ],
  fields: [
    { key: 'holiday_date', label: '일자', type: 'date', required: true },
    { key: 'name', label: '휴일명', required: true },
    { key: 'holiday_type', label: '구분', type: 'select', options: ['법정공휴일', '회사휴일', '임시휴일'], default: '법정공휴일' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});
