// 데모 모드 초기 샘플 데이터 (Supabase 미연결 시 localStorage 시드)
// (주)민선 — 자동차 알루미늄 부품 가공·조립·파이프 성형 시나리오
const today = new Date();
const d = (offset = 0) => {
  const x = new Date(today); x.setDate(x.getDate() + offset);
  return x.toISOString().slice(0, 10);
};
const ym = (offset = 0) => {
  const x = new Date(today); x.setMonth(x.getMonth() + offset);
  return x.toISOString().slice(0, 7);
};
const dt = (offset = 0, hh = 9, mm = 0) => `${d(offset)}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

// 부적합 샘플 (최근 30일 — SQ PPM 추이 데모)
const NCR_SAMPLES = (() => {
  const procs = ['MCT가공', 'CNC가공', 'PIPE성형', '용접', '조립'];
  const workers = ['박생산', '최품질', '김용접', '이현장'];
  const actions = ['폐기', '재작업', '특채', '반품'];
  const defects = ['치수불량', '외관불량', '가공불량', '용접불량', 'BURR'];
  const items = [['P-SP2-PE', 'SP2 PE ASSY'], ['P-MCT-01', 'MCT 하우징 가공품'], ['P-PIPE-01', 'COOLING PIPE']];
  const causes = ['공구마모', '셋업오류', '소재불량', '작업자 실수', '설비 이상'];
  const rows = [];
  const offsets = [-28, -26, -25, -23, -21, -20, -18, -17, -15, -14, -13, -11, -10, -9, -8, -7, -6, -5, -4, -3, -3, -2, -1, 0];
  offsets.forEach((off, i) => {
    const it = items[i % items.length];
    rows.push({
      ncr_no: `NC-S-${String(i + 1).padStart(3, '0')}`,
      occur_date: d(off), ncr_type: '공정부적합',
      process: procs[i % procs.length], item_code: it[0], item_name: it[1],
      lot_no: `LOT-WO-S-${String((i % 6) + 1).padStart(3, '0')}`,
      defect_type: defects[i % defects.length], defect_qty: ((i * 7) % 28) + 2,
      cause: causes[i % causes.length], charge_dept: '생산팀',
      action: '조치 진행', action_type: actions[i % actions.length],
      worker: workers[i % workers.length], status: i % 3 === 0 ? '처리중' : '완료',
    });
  });
  return rows;
})();

export const SEED = {
  departments: [
    { code: 'D100', name: '경영지원팀', manager: '김용식', phone: '031-000-1000', use_yn: true },
    { code: 'D200', name: '영업팀', manager: '이영업', phone: '031-000-2000', use_yn: true },
    { code: 'D300', name: '생산팀', manager: '박생산', phone: '031-000-3000', use_yn: true },
    { code: 'D400', name: '품질팀', manager: '최품질', phone: '031-000-4000', use_yn: true },
    { code: 'D500', name: '자재팀', manager: '정자재', phone: '031-000-5000', use_yn: true },
  ],
  users: [
    { login_id: 'admin', password: 'admin', name: '관리자', department: '경영지원팀', position: '이사', role: 'admin', email: 'admin@minsun.co.kr', phone: '010-1111-1111', use_yn: true },
    { login_id: 'sales01', password: '1234', name: '이영업', department: '영업팀', position: '팀장', role: 'manager', email: 'sales@minsun.co.kr', phone: '010-2222-2222', use_yn: true },
    { login_id: 'prod01', password: '1234', name: '박생산', department: '생산팀', position: '팀장', role: 'manager', email: 'prod@minsun.co.kr', phone: '010-3333-3333', use_yn: true },
    { login_id: 'qa01', password: '1234', name: '최품질', department: '품질팀', position: '주임', role: 'user', email: 'qa@minsun.co.kr', phone: '010-4444-4444', use_yn: true },
    { login_id: 'mat01', password: '1234', name: '정자재', department: '자재팀', position: '주임', role: 'user', email: 'mat@minsun.co.kr', phone: '010-5555-5555', use_yn: true },
    { login_id: 'weld01', password: '1234', name: '김용접', department: '생산팀', position: '반장', role: 'user', email: 'weld@minsun.co.kr', phone: '010-6666-6666', use_yn: true },
  ],
  common_codes: [
    { group_code: 'DEFECT_TYPE', group_name: '불량유형', code: 'D01', name: '치수불량', sort_no: 1, use_yn: true },
    { group_code: 'DEFECT_TYPE', group_name: '불량유형', code: 'D02', name: '외관불량', sort_no: 2, use_yn: true },
    { group_code: 'DEFECT_TYPE', group_name: '불량유형', code: 'D03', name: '가공불량', sort_no: 3, use_yn: true },
    { group_code: 'DEFECT_TYPE', group_name: '불량유형', code: 'D04', name: '용접불량', sort_no: 4, use_yn: true },
    { group_code: 'DEFECT_TYPE', group_name: '불량유형', code: 'D05', name: 'BURR', sort_no: 5, use_yn: true },
    { group_code: 'WAREHOUSE', group_name: '창고', code: 'W01', name: '자재창고1', sort_no: 1, use_yn: true },
    { group_code: 'WAREHOUSE', group_name: '창고', code: 'W02', name: '제품창고', sort_no: 2, use_yn: true },
    { group_code: 'LINE', group_name: '생산라인', code: 'L01', name: 'MCT라인', sort_no: 1, use_yn: true },
    { group_code: 'LINE', group_name: '생산라인', code: 'L02', name: 'CNC라인', sort_no: 2, use_yn: true },
    { group_code: 'LINE', group_name: '생산라인', code: 'L03', name: 'PIPE성형라인', sort_no: 3, use_yn: true },
    { group_code: 'LINE', group_name: '생산라인', code: 'L04', name: '용접·조립라인', sort_no: 4, use_yn: true },
  ],
  partners: [
    { code: 'C001', name: '삼성SDI', biz_type: '매출처', biz_no: '124-81-00998', ceo: '-', manager: '김구매', phone: '031-8006-3100', email: 'buy@sdi.com', address: '경기도 용인시', use_yn: true },
    { code: 'C002', name: 'DOOWON', biz_type: '매출처', biz_no: '312-81-01234', ceo: '-', manager: '박발주', phone: '041-530-1000', email: 'po@doowon.com', address: '충남 아산시', use_yn: true },
    { code: 'C003', name: '현대모비스', biz_type: '매출처', biz_no: '101-81-09147', ceo: '-', manager: '정협력', phone: '02-2018-5114', email: 'vendor@mobis.com', address: '서울시 강남구', use_yn: true },
    { code: 'C004', name: 'PYONGSAN', biz_type: '매출처', biz_no: '615-81-05678', ceo: '-', manager: '최담당', phone: '055-280-9000', email: 'ps@pyongsan.com', address: '경남 창원시', use_yn: true },
    { code: 'M001', name: '대성알루미늄', biz_type: '원소재업체', biz_no: '234-56-78901', ceo: '대성표', manager: '윤소재', phone: '032-200-2000', email: 'al@ds.com', address: '인천시 남동구', use_yn: true },
    { code: 'M002', name: '동양스틸', biz_type: '매입처', biz_no: '567-89-01234', ceo: '동양표', manager: '한판매', phone: '051-500-5000', email: 'steel@dy.com', address: '부산시 강서구', use_yn: true },
    { code: 'T001', name: '정밀절단', biz_type: '절단업체', biz_no: '456-78-90123', ceo: '정절단', manager: '조절단', phone: '031-400-4000', email: 'cut@jm.com', address: '경기도 시흥시', use_yn: true },
    { code: 'S001', name: '한국열처리', biz_type: '외주가공처', biz_no: '789-01-23456', ceo: '한열처', manager: '임외주', phone: '041-600-6000', email: 'heat@hk.com', address: '충남 천안시', use_yn: true },
    { code: 'S002', name: '아노다이징텍', biz_type: '외주가공처', biz_no: '890-12-34567', ceo: '아노표', manager: '표면처', phone: '032-700-7000', email: 'ano@at.com', address: '인천시 서구', use_yn: true },
  ],
  std_materials: [
    { code: 'AL6061', name: 'AL 6061-T6', category: '알루미늄', density: 2.7, spec: 'KS D 6759', use_yn: true },
    { code: 'AL6063', name: 'AL 6063-T5', category: '알루미늄', density: 2.69, spec: 'KS D 6759', use_yn: true },
    { code: 'A5052', name: 'AL 5052-H32', category: '알루미늄', density: 2.68, spec: 'KS D 6701', use_yn: true },
    { code: 'SUS304', name: 'SUS 304', category: '스테인리스', density: 7.93, spec: 'KS D 3698', use_yn: true },
  ],
  items: [
    { code: 'P-SP2-PE', name: 'SP2 PE ASSY', item_type: '완제품', customer: '삼성SDI', spec: 'SP2-PE Rev.C', unit: 'EA', unit2: 'KG', unit_weight: 0.85, material: 'AL 6061-T6', drawing_no: 'DWG-SP2PE-C', routing_group: 'RG-ASSY', category: '조립', safety_stock: 200, sale_price: 18500, purchase_price: 0, subcon_price: 0, unit_price: 18500, location: '제품창고 A-01', partner: '삼성SDI', use_yn: true },
    { code: 'P-SX2', name: 'SX2 ASSY', item_type: '완제품', customer: '삼성SDI', spec: 'SX2 Rev.B', unit: 'EA', unit2: 'KG', unit_weight: 1.1, material: 'AL 6061-T6', drawing_no: 'DWG-SX2-B', routing_group: 'RG-ASSY', category: '조립', safety_stock: 150, sale_price: 22000, purchase_price: 0, subcon_price: 0, unit_price: 22000, location: '제품창고 A-02', partner: '삼성SDI', use_yn: true },
    { code: 'P-MCT-01', name: 'MCT 하우징 가공품', item_type: '완제품', customer: 'DOOWON', spec: '120x80x45', unit: 'EA', unit2: 'KG', unit_weight: 0.62, material: 'AL 6061-T6', drawing_no: 'DWG-MCT01-A', routing_group: 'RG-MCT', category: '가공', safety_stock: 300, sale_price: 8500, purchase_price: 0, subcon_price: 1200, unit_price: 8500, location: '제품창고 B-01', partner: 'DOOWON', use_yn: true },
    { code: 'P-CNC-01', name: 'CNC 브라켓 가공품', item_type: '완제품', customer: '현대모비스', spec: 'Ø95 H40', unit: 'EA', unit2: 'KG', unit_weight: 0.48, material: 'AL 6063-T5', drawing_no: 'DWG-CNC01-A', routing_group: 'RG-CNC', category: '가공', safety_stock: 250, sale_price: 6800, purchase_price: 0, subcon_price: 900, unit_price: 6800, location: '제품창고 B-02', partner: '현대모비스', use_yn: true },
    { code: 'P-PIPE-01', name: 'COOLING PIPE', item_type: '완제품', customer: 'PYONGSAN', spec: 'Ø12 L850 벤딩', unit: 'EA', unit2: 'KG', unit_weight: 0.35, material: 'AL 5052-H32', drawing_no: 'DWG-PIPE01-B', routing_group: 'RG-PIPE', category: '성형', safety_stock: 400, sale_price: 4200, purchase_price: 0, subcon_price: 0, unit_price: 4200, location: '제품창고 C-01', partner: 'PYONGSAN', use_yn: true },
    { code: 'S-MCT-01', name: 'MCT 하우징 반제품', item_type: '반제품', customer: '', spec: '120x80x50 황삭', unit: 'EA', unit2: 'KG', unit_weight: 0.7, material: 'AL 6061-T6', drawing_no: '', routing_group: 'RG-MCT', category: '가공', safety_stock: 100, sale_price: 0, purchase_price: 0, subcon_price: 0, unit_price: 0, location: '공정창고', partner: '', use_yn: true },
    { code: 'M-AL-6061', name: 'AL6061 환봉 Ø130', item_type: '원소재', customer: '', spec: 'Ø130 L3000', unit: 'EA', unit2: 'KG', unit_weight: 10.8, material: 'AL 6061-T6', drawing_no: '', routing_group: '', category: '소재', safety_stock: 30, sale_price: 0, purchase_price: 98000, subcon_price: 0, unit_price: 98000, location: '자재창고1 A-01', partner: '대성알루미늄', use_yn: true },
    { code: 'M-AL-6063', name: 'AL6063 압출바', item_type: '원소재', customer: '', spec: '100x50 L4000', unit: 'EA', unit2: 'KG', unit_weight: 7.2, material: 'AL 6063-T5', drawing_no: '', routing_group: '', category: '소재', safety_stock: 40, sale_price: 0, purchase_price: 62000, subcon_price: 0, unit_price: 62000, location: '자재창고1 A-02', partner: '대성알루미늄', use_yn: true },
    { code: 'M-AL-PIPE', name: 'AL5052 파이프 Ø12', item_type: '원소재', customer: '', spec: 'Ø12 t1.0 L4000', unit: 'EA', unit2: 'KG', unit_weight: 0.38, material: 'AL 5052-H32', drawing_no: '', routing_group: '', category: '소재', safety_stock: 200, sale_price: 0, purchase_price: 4500, subcon_price: 0, unit_price: 4500, location: '자재창고1 B-01', partner: '대성알루미늄', use_yn: true },
    { code: 'M-BOLT-M6', name: '볼트 M6x20', item_type: '부자재', customer: '', spec: 'M6x20 SUS', unit: 'EA', unit2: '', unit_weight: 0.005, material: 'SUS 304', drawing_no: '', routing_group: '', category: '체결', safety_stock: 2000, sale_price: 0, purchase_price: 80, subcon_price: 0, unit_price: 80, location: '자재창고1 C-01', partner: '동양스틸', use_yn: true },
  ],
  drawings: [
    { drawing_no: 'DWG-SP2PE-C', item_code: 'P-SP2-PE', item_name: 'SP2 PE ASSY', rev: 'C', title: 'SP2 PE ASSY 조립도', writer: '최품질', reg_date: d(-60), use_yn: true },
    { drawing_no: 'DWG-MCT01-A', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', rev: 'A', title: 'MCT 하우징 가공도', writer: '박생산', reg_date: d(-45), use_yn: true },
    { drawing_no: 'DWG-PIPE01-B', item_code: 'P-PIPE-01', item_name: 'COOLING PIPE', rev: 'B', title: 'COOLING PIPE 벤딩 전개도', writer: '박생산', reg_date: d(-30), use_yn: true },
  ],
  holidays: [
    { holiday_date: `${new Date().getFullYear()}-01-01`, name: '신정', holiday_type: '법정공휴일' },
    { holiday_date: `${new Date().getFullYear()}-03-01`, name: '삼일절', holiday_type: '법정공휴일' },
    { holiday_date: `${new Date().getFullYear()}-05-05`, name: '어린이날', holiday_type: '법정공휴일' },
    { holiday_date: `${new Date().getFullYear()}-08-15`, name: '광복절', holiday_type: '법정공휴일' },
    { holiday_date: `${new Date().getFullYear()}-12-25`, name: '성탄절', holiday_type: '법정공휴일' },
  ],
  processes: [
    { code: 'OP10', name: 'MCT가공', process_type: 'MCT가공', in_out: '사내', work_center: 'MCT라인', std_time: 12, setup_time: 30, use_yn: true },
    { code: 'OP20', name: 'CNC가공', process_type: 'CNC가공', in_out: '사내', work_center: 'CNC라인', std_time: 15, setup_time: 25, use_yn: true },
    { code: 'OP30', name: 'DRILL', process_type: 'DRILL', in_out: '사내', work_center: 'CNC라인', std_time: 6, setup_time: 10, use_yn: true },
    { code: 'OP40', name: 'PIPE성형', process_type: 'PIPE성형', in_out: '사내', work_center: 'PIPE성형라인', std_time: 4, setup_time: 15, use_yn: true },
    { code: 'OP50', name: '용접', process_type: '용접', in_out: '사내', work_center: '용접·조립라인', std_time: 8, setup_time: 12, use_yn: true },
    { code: 'OP60', name: '조립', process_type: '조립', in_out: '사내', work_center: '용접·조립라인', std_time: 7, setup_time: 8, use_yn: true },
    { code: 'OP70', name: '외주 열처리', process_type: '외주', in_out: '외주', work_center: '한국열처리', std_time: 0, setup_time: 0, use_yn: true },
    { code: 'OP80', name: '외주 표면처리', process_type: '외주', in_out: '외주', work_center: '아노다이징텍', std_time: 0, setup_time: 0, use_yn: true },
    { code: 'OP90', name: '검사', process_type: '검사', in_out: '사내', work_center: '검사실', std_time: 5, setup_time: 5, use_yn: true },
    { code: 'OP99', name: '포장', process_type: '포장', in_out: '사내', work_center: '포장장', std_time: 3, setup_time: 3, use_yn: true },
  ],
  // 사내↔외주 혼류 라우팅 예시 (MCT → 외주 열처리 → CNC → 검사)
  item_processes: [
    { item_code: 'P-MCT-01', process_code: 'OP10', seq: 10, process_name: 'MCT가공', in_out: '사내', std_time: 12, equipment: 'MCT-01' },
    { item_code: 'P-MCT-01', process_code: 'OP70', seq: 20, process_name: '외주 열처리', in_out: '외주', std_time: 0, equipment: '' },
    { item_code: 'P-MCT-01', process_code: 'OP20', seq: 30, process_name: 'CNC가공', in_out: '사내', std_time: 15, equipment: 'CNC-01' },
    { item_code: 'P-MCT-01', process_code: 'OP90', seq: 40, process_name: '검사', in_out: '사내', std_time: 5, equipment: 'CMM-01' },
    { item_code: 'P-PIPE-01', process_code: 'OP40', seq: 10, process_name: 'PIPE성형', in_out: '사내', std_time: 4, equipment: 'PIPE-01' },
    { item_code: 'P-PIPE-01', process_code: 'OP50', seq: 20, process_name: '용접', in_out: '사내', std_time: 8, equipment: 'WELD-01' },
    { item_code: 'P-PIPE-01', process_code: 'OP90', seq: 30, process_name: '검사', in_out: '사내', std_time: 5, equipment: 'CMM-01' },
    { item_code: 'P-SP2-PE', process_code: 'OP20', seq: 10, process_name: 'CNC가공', in_out: '사내', std_time: 15, equipment: 'CNC-01' },
    { item_code: 'P-SP2-PE', process_code: 'OP80', seq: 20, process_name: '외주 표면처리', in_out: '외주', std_time: 0, equipment: '' },
    { item_code: 'P-SP2-PE', process_code: 'OP60', seq: 30, process_name: '조립', in_out: '사내', std_time: 7, equipment: 'ASSY-01' },
    { item_code: 'P-SP2-PE', process_code: 'OP90', seq: 40, process_name: '검사', in_out: '사내', std_time: 5, equipment: 'CMM-01' },
  ],
  process_equipments: [
    { process_code: 'OP10', equipment_code: 'MCT-01', equipment_name: 'MCT 머시닝센터 1호기' },
    { process_code: 'OP10', equipment_code: 'MCT-02', equipment_name: 'MCT 머시닝센터 2호기' },
    { process_code: 'OP20', equipment_code: 'CNC-01', equipment_name: 'CNC 선반 1호기' },
    { process_code: 'OP20', equipment_code: 'CNC-02', equipment_name: 'CNC 선반 2호기' },
    { process_code: 'OP30', equipment_code: 'DRL-01', equipment_name: 'DRILL 1호기' },
    { process_code: 'OP40', equipment_code: 'PIPE-01', equipment_name: 'PIPE 성형기 1호기' },
    { process_code: 'OP50', equipment_code: 'WELD-01', equipment_name: '용접기 1호기' },
    { process_code: 'OP60', equipment_code: 'ASSY-01', equipment_name: '조립스테이션 1호' },
    { process_code: 'OP90', equipment_code: 'CMM-01', equipment_name: '3차원측정기' },
  ],
  // 원소재 기준 BOM (원소재업체·절단업체 포함)
  boms: [
    { item_code: 'P-MCT-01', component_code: 'M-AL-6061', component_name: 'AL6061 환봉 Ø130', qty: 0.1, unit: 'EA', unit_weight: 1.08, material_partner: '대성알루미늄', cutting_partner: '정밀절단' },
    { item_code: 'P-CNC-01', component_code: 'M-AL-6063', component_name: 'AL6063 압출바', qty: 0.12, unit: 'EA', unit_weight: 0.86, material_partner: '대성알루미늄', cutting_partner: '정밀절단' },
    { item_code: 'P-PIPE-01', component_code: 'M-AL-PIPE', component_name: 'AL5052 파이프 Ø12', qty: 0.25, unit: 'EA', unit_weight: 0.095, material_partner: '대성알루미늄', cutting_partner: '' },
    { item_code: 'P-SP2-PE', component_code: 'S-MCT-01', component_name: 'MCT 하우징 반제품', qty: 1, unit: 'EA', unit_weight: 0.7, material_partner: '', cutting_partner: '' },
    { item_code: 'P-SP2-PE', component_code: 'M-BOLT-M6', component_name: '볼트 M6x20', qty: 4, unit: 'EA', unit_weight: 0.02, material_partner: '동양스틸', cutting_partner: '' },
    { item_code: 'S-MCT-01', component_code: 'M-AL-6061', component_name: 'AL6061 환봉 Ø130', qty: 0.1, unit: 'EA', unit_weight: 1.08, material_partner: '대성알루미늄', cutting_partner: '정밀절단' },
  ],
  tools: [
    { code: 'T-001', name: '엔드밀 Ø10', tool_type: '절삭', spec: 'Ø10 4날 초경', maker: 'YG-1', life_count: 500, alarm_count: 450, unit_price: 45000, process: 'MCT가공', unit: 'EA', safety_stock: 10, location: '공구실 A-1', lot_rule: 'T001-YYMMDD-일련', use_yn: true },
    { code: 'T-002', name: '드릴 Ø6.8', tool_type: '절삭', spec: 'Ø6.8 HSS', maker: 'OSG', life_count: 800, alarm_count: 700, unit_price: 18000, process: 'DRILL', unit: 'EA', safety_stock: 15, location: '공구실 A-2', lot_rule: 'T002-YYMMDD-일련', use_yn: true },
    { code: 'T-003', name: '인서트 CNMG', tool_type: '절삭', spec: 'CNMG120408', maker: '대구텍', life_count: 300, alarm_count: 250, unit_price: 8500, process: 'CNC가공', unit: 'EA', safety_stock: 30, location: '공구실 A-3', lot_rule: 'T003-YYMMDD-일련', use_yn: true },
    { code: 'T-004', name: '벤딩지그 PIPE-12', tool_type: '지그', spec: 'Ø12 R25', maker: '자체제작', life_count: 0, alarm_count: 0, unit_price: 0, process: 'PIPE성형', unit: 'EA', safety_stock: 2, location: 'PIPE라인', lot_rule: '', use_yn: true },
    { code: 'T-005', name: '조립지그 SP2', tool_type: '지그', spec: 'SP2-PE용', maker: '자체제작', life_count: 0, alarm_count: 0, unit_price: 0, process: '조립', unit: 'EA', safety_stock: 2, location: '조립라인', lot_rule: '', use_yn: true },
  ],
  equipments: [
    { code: 'MCT-01', name: 'MCT 머시닝센터 1호기', equip_type: 'MCT', machine_no: '1호기', model: 'DNM-500', maker: '두산', work_center: 'MCT라인', install_date: '2022-03-15', plc_yn: true, check_cycle: '일상', status: '정상', use_yn: true },
    { code: 'MCT-02', name: 'MCT 머시닝센터 2호기', equip_type: 'MCT', machine_no: '2호기', model: 'DNM-500', maker: '두산', work_center: 'MCT라인', install_date: '2022-03-15', plc_yn: true, check_cycle: '일상', status: '정상', use_yn: true },
    { code: 'CNC-01', name: 'CNC 선반 1호기', equip_type: 'CNC', machine_no: '1호기', model: 'LYNX-220', maker: '두산', work_center: 'CNC라인', install_date: '2021-08-01', plc_yn: true, check_cycle: '일상', status: '정상', use_yn: true },
    { code: 'CNC-02', name: 'CNC 선반 2호기', equip_type: 'CNC', machine_no: '2호기', model: 'LYNX-220', maker: '두산', work_center: 'CNC라인', install_date: '2021-08-01', plc_yn: true, check_cycle: '일상', status: '점검', use_yn: true },
    { code: 'DRL-01', name: 'DRILL 1호기', equip_type: 'DRILL', machine_no: '1호기', model: 'DR-300', maker: '한국공작', work_center: 'CNC라인', install_date: '2020-05-10', plc_yn: false, check_cycle: '주간', status: '정상', use_yn: true },
    { code: 'PIPE-01', name: 'PIPE 성형기 1호기', equip_type: 'PIPE성형기', machine_no: '1호기', model: 'CNC-38', maker: '진영', work_center: 'PIPE성형라인', install_date: '2023-01-20', plc_yn: true, check_cycle: '일상', status: '정상', use_yn: true },
    { code: 'WELD-01', name: '용접기 1호기', equip_type: '용접기', machine_no: '1호기', model: 'TIG-350', maker: '현대웰딩', work_center: '용접·조립라인', install_date: '2023-06-01', plc_yn: false, check_cycle: '주간', status: '정상', use_yn: true },
    { code: 'ASSY-01', name: '조립스테이션 1호', equip_type: '기타', machine_no: '1호', model: 'AS-100', maker: '자체', work_center: '용접·조립라인', install_date: '2022-06-01', plc_yn: false, check_cycle: '월간', status: '정상', use_yn: true },
    { code: 'CMM-01', name: '3차원측정기', equip_type: '검사기', machine_no: '1호', model: 'CRYSTA-574', maker: 'Mitutoyo', work_center: '검사실', install_date: '2020-11-20', plc_yn: false, check_cycle: '월간', status: '정상', use_yn: true },
  ],
  sales_orders: [
    { order_no: 'SO-2607-001', order_date: d(-5), partner: 'DOOWON', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', spec: '120x80x45', unit: 'EA', order_qty: 500, order_weight: 310, unit_price: 8500, amount: 4250000, due_date: d(10), po_no: 'DW-PO-1121', status: '생산중' },
    { order_no: 'SO-2607-002', order_date: d(-3), partner: 'PYONGSAN', item_code: 'P-PIPE-01', item_name: 'COOLING PIPE', spec: 'Ø12 L850', unit: 'EA', order_qty: 800, order_weight: 280, unit_price: 4200, amount: 3360000, due_date: d(14), po_no: 'PS-PO-0332', status: '접수' },
    { order_no: 'SO-2607-003', order_date: d(-1), partner: '삼성SDI', item_code: 'P-SP2-PE', item_name: 'SP2 PE ASSY', spec: 'SP2-PE Rev.C', unit: 'EA', order_qty: 300, order_weight: 255, unit_price: 18500, amount: 5550000, due_date: d(20), po_no: 'SDI-PO-8871', status: '접수' },
    { order_no: 'SO-2606-001', order_date: d(-20), partner: 'DOOWON', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', spec: '120x80x45', unit: 'EA', order_qty: 300, order_weight: 186, unit_price: 8500, amount: 2550000, due_date: d(-2), po_no: 'DW-PO-1098', status: '완료' },
    { order_no: 'SO-2606-002', order_date: d(-15), partner: '현대모비스', item_code: 'P-CNC-01', item_name: 'CNC 브라켓 가공품', spec: 'Ø95 H40', unit: 'EA', order_qty: 200, order_weight: 96, unit_price: 6800, amount: 1360000, due_date: d(6), po_no: 'MB-PO-5540', status: '완료' },
  ],
  shipping_orders: [
    { ship_no: 'SH-2607-001', ship_date: d(1), order_no: 'SO-2606-002', partner: '현대모비스', item_code: 'P-CNC-01', item_name: 'CNC 브라켓 가공품', ship_qty: 200, warehouse: '제품창고', status: '지시' },
  ],
  deliveries: [
    { delivery_no: 'DL-2606-001', delivery_date: d(-1), order_no: 'SO-2606-002', partner: '현대모비스', item_code: 'P-CNC-01', item_name: 'CNC 브라켓 가공품', delivery_qty: 200, unit_price: 6800, amount: 1360000, status: '납품완료' },
  ],
  purchase_orders: [
    { po_no: 'PO-2607-001', po_date: d(-8), material_partner: '대성알루미늄', cutting_partner: '정밀절단', item_code: 'M-AL-6061', item_name: 'AL6061 환봉 Ø130', spec: 'Ø130 L3000', unit: 'EA', po_qty: 60, unit_weight: 10.8, total_weight: 648, unit_price: 98000, amount: 5880000, due_date: d(-2), status: '입고완료' },
    { po_no: 'PO-2607-002', po_date: d(-4), material_partner: '대성알루미늄', cutting_partner: '', item_code: 'M-AL-PIPE', item_name: 'AL5052 파이프 Ø12', spec: 'Ø12 t1.0 L4000', unit: 'EA', po_qty: 300, unit_weight: 0.38, total_weight: 114, unit_price: 4500, amount: 1350000, due_date: d(3), status: '발주' },
  ],
  material_inbounds: [
    { inbound_no: 'MI-2607-001', inbound_date: d(-6), po_no: 'PO-2607-001', partner: '대성알루미늄', item_code: 'M-AL-6061', item_name: 'AL6061 환봉 Ø130', spec: 'Ø130 L3000', unit: 'EA', inbound_qty: 60, actual_qty: 60, unit_weight: 10.8, unit_price: 98000, amount: 5880000, warehouse: '자재창고1', lot_no: 'MLOT-A001', vendor_lot: 'DS-24118', status: '입고완료' },
    { inbound_no: 'MI-2607-002', inbound_date: d(-4), po_no: '', partner: '동양스틸', item_code: 'M-BOLT-M6', item_name: '볼트 M6x20', spec: 'M6x20 SUS', unit: 'EA', inbound_qty: 5000, actual_qty: 5000, unit_weight: 0.005, unit_price: 80, amount: 400000, warehouse: '자재창고1', lot_no: 'MLOT-B001', vendor_lot: 'DY-3321', status: '입고완료' },
    { inbound_no: 'MI-2607-003', inbound_date: d(-1), po_no: 'PO-2607-002', partner: '대성알루미늄', item_code: 'M-AL-PIPE', item_name: 'AL5052 파이프 Ø12', spec: 'Ø12 t1.0 L4000', unit: 'EA', inbound_qty: 300, unit_weight: 0.38, unit_price: 4500, amount: 1350000, warehouse: '자재창고1', lot_no: 'MLOT-C001', vendor_lot: 'DS-24192', status: '입고대기' },
  ],
  material_outbounds: [
    { outbound_no: 'MO-2607-001', outbound_date: d(-3), item_code: 'M-AL-6061', item_name: 'AL6061 환봉 Ø130', unit: 'EA', outbound_qty: 25, wo_no: 'WO-2607-001', lot_no: 'MLOT-A001', warehouse: '자재창고1', purpose: '생산투입', worker: '정자재' },
    { outbound_no: 'MO-2607-002', outbound_date: d(-2), item_code: 'M-BOLT-M6', item_name: '볼트 M6x20', unit: 'EA', outbound_qty: 1200, wo_no: 'WO-2607-002', lot_no: 'MLOT-B001', warehouse: '자재창고1', purpose: '생산투입', worker: '정자재' },
    { outbound_no: 'MO-2607-003', outbound_date: d(-2), item_code: 'M-AL-6061', item_name: 'AL6061 환봉 Ø130', unit: 'EA', outbound_qty: 10, wo_no: 'WO-2607-001', lot_no: 'MLOT-A001', partner: '한국열처리', warehouse: '자재창고1', purpose: '외주출고', worker: '정자재' },
  ],
  subcon_orders: [
    { sco_no: 'SCO-2607-001', sco_date: d(-2), partner: '한국열처리', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', process: '외주 열처리', order_qty: 250, unit_price: 1200, amount: 300000, due_date: d(3), wo_no: 'WO-2607-001', status: '가공중' },
  ],
  subcon_inbounds: [
    { sci_no: 'SCI-2606-001', sci_date: d(-10), sco_no: 'SCO-2606-001', partner: '한국열처리', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', process: '외주 열처리', inbound_qty: 300, good_qty: 298, defect_qty: 2, lot_no: 'LOT-WO-2606-001', inspect_result: '합격', status: '입고완료' },
  ],
  production_plans: [
    { plan_no: 'PP-2607-001', plan_date: d(-4), order_no: 'SO-2607-001', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', plan_qty: 500, start_date: d(-3), end_date: d(7), line: 'MCT라인', status: '진행' },
    { plan_no: 'PP-2607-002', plan_date: d(-2), order_no: 'SO-2607-002', item_code: 'P-PIPE-01', item_name: 'COOLING PIPE', plan_qty: 800, start_date: d(1), end_date: d(12), line: 'PIPE성형라인', status: '계획' },
    { plan_no: 'PP-2606-001', plan_date: d(-18), order_no: 'SO-2606-001', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', plan_qty: 300, start_date: d(-18), end_date: d(-3), line: 'MCT라인', status: '완료' },
    { plan_no: 'PP-2606-002', plan_date: d(-13), order_no: 'SO-2606-002', item_code: 'P-CNC-01', item_name: 'CNC 브라켓 가공품', plan_qty: 200, start_date: d(-13), end_date: d(-2), line: 'CNC라인', status: '완료' },
  ],
  work_orders: [
    { wo_no: 'WO-2607-001', lot_no: 'LOT-WO-2607-001', wo_date: d(-3), plan_no: 'PP-2607-001', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', order_qty: 500, process: 'MCT가공', equipment: 'MCT-01', machine_no: '1호기', worker: '박생산', line: 'MCT라인', start_date: d(-3), due_date: d(7), status: '작업중' },
    { wo_no: 'WO-2607-002', lot_no: 'LOT-WO-2607-002', wo_date: d(-2), plan_no: 'PP-2607-002', item_code: 'P-PIPE-01', item_name: 'COOLING PIPE', order_qty: 800, process: 'PIPE성형', equipment: 'PIPE-01', machine_no: '1호기', worker: '이현장', line: 'PIPE성형라인', start_date: d(1), due_date: d(12), status: '대기' },
    { wo_no: 'WO-2606-001', lot_no: 'LOT-WO-2606-001', wo_date: d(-18), plan_no: 'PP-2606-001', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', order_qty: 300, process: 'MCT가공', equipment: 'MCT-01', machine_no: '1호기', worker: '박생산', line: 'MCT라인', start_date: d(-18), due_date: d(-3), status: '완료' },
    { wo_no: 'WO-2606-002', lot_no: 'LOT-WO-2606-002', wo_date: d(-13), plan_no: 'PP-2606-002', item_code: 'P-CNC-01', item_name: 'CNC 브라켓 가공품', order_qty: 200, process: 'CNC가공', equipment: 'CNC-01', machine_no: '1호기', worker: '박생산', line: 'CNC라인', start_date: d(-13), due_date: d(-2), status: '완료' },
  ],
  production_results: [
    { result_no: 'PR-2607-001', result_date: d(-2), wo_no: 'WO-2607-001', lot_no: 'LOT-WO-2607-001', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', process: 'MCT가공', equipment: 'MCT-01', machine_no: '1호기', worker: '박생산', prod_qty: 150, defect_qty: 3, good_qty: 147, rework_yn: false, work_time: 480, status: '완료' },
    { result_no: 'PR-2607-002', result_date: d(-1), wo_no: 'WO-2607-001', lot_no: 'LOT-WO-2607-001', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', process: 'MCT가공', equipment: 'MCT-02', machine_no: '2호기', worker: '박생산', prod_qty: 160, defect_qty: 2, good_qty: 158, rework_yn: false, work_time: 460, status: '완료' },
    { result_no: 'PR-2606-001', result_date: d(-15), wo_no: 'WO-2606-001', lot_no: 'LOT-WO-2606-001', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', process: 'MCT가공', equipment: 'MCT-01', machine_no: '1호기', worker: '박생산', prod_qty: 305, defect_qty: 5, good_qty: 300, rework_yn: false, work_time: 960, status: '완료' },
    { result_no: 'PR-2606-002', result_date: d(-10), wo_no: 'WO-2606-002', lot_no: 'LOT-WO-2606-002', item_code: 'P-CNC-01', item_name: 'CNC 브라켓 가공품', process: 'CNC가공', equipment: 'CNC-01', machine_no: '1호기', worker: '박생산', prod_qty: 203, defect_qty: 3, good_qty: 200, rework_yn: false, work_time: 620, status: '완료' },
  ],
  tool_movements: [
    { move_no: 'TM-2607-001', move_date: d(-6), move_type: '입고', tool_code: 'T-001', tool_name: '엔드밀 Ø10', lot_no: 'T001-260715-01', qty: 20, unit_price: 45000, inspect_result: '성적서확인', worker: '정자재', location: '공구실 A-1' },
    { move_no: 'TM-2607-002', move_date: d(-3), move_type: '출고', tool_code: 'T-001', tool_name: '엔드밀 Ø10', lot_no: 'T001-260715-01', qty: 4, dest_type: '사내', machine_no: 'MCT-01', worker: '박생산' },
    { move_no: 'TM-2607-003', move_date: d(-5), move_type: '입고', tool_code: 'T-003', tool_name: '인서트 CNMG', lot_no: 'T003-260714-01', qty: 50, unit_price: 8500, inspect_result: '합격', worker: '정자재', location: '공구실 A-3' },
    { move_no: 'TM-2607-004', move_date: d(-1), move_type: '회수', tool_code: 'T-001', tool_name: '엔드밀 Ø10', lot_no: 'T001-260715-01', qty: 2, dest_type: '사내', machine_no: 'MCT-01', worker: '박생산' },
  ],
  tool_disposals: [
    { disposal_no: 'TD-2607-001', disposal_date: d(-1), tool_code: 'T-001', tool_name: '엔드밀 Ø10', lot_no: 'T001-260715-01', qty: 2, reason: '수명초과', life_used: 512, worker: '박생산' },
  ],
  tool_verifications: [
    { verify_no: 'TV-2607-001', verify_date: d(-1), verify_type: '교체후', tool_code: 'T-001', tool_name: '엔드밀 Ø10', lot_no: 'T001-260715-01', machine_no: 'MCT-01', wo_no: 'WO-2607-001', item_code: 'P-MCT-01', inspect_item: '내경 Ø25', spec_value: '25.0', tolerance: '0.02', measured: '25.008', judgment: 'OK', worker: '최품질' },
    { verify_no: 'TV-2607-002', verify_date: d(-1), verify_type: '교체후N개', tool_code: 'T-001', tool_name: '엔드밀 Ø10', lot_no: 'T001-260715-01', machine_no: 'MCT-01', wo_no: 'WO-2607-001', item_code: 'P-MCT-01', inspect_item: '내경 Ø25 (5개 후)', spec_value: '25.0', tolerance: '0.02', measured: '25.012', judgment: 'OK', worker: '최품질' },
  ],
  inspection_standards: [
    { std_no: 'IS-001', item_code: 'M-AL-6061', item_name: 'AL6061 환봉 Ø130', inspect_type: '수입검사', eval_method: '정량적', inspect_item: '외경', spec_value: '130', tolerance: '0.5', method: '버니어캘리퍼스', equipment: '버니어캘리퍼스', use_yn: true },
    { std_no: 'IS-002', item_code: 'M-AL-6061', item_name: 'AL6061 환봉 Ø130', inspect_type: '수입검사', eval_method: '정성적', inspect_item: '표면상태', spec_value: '흠집·부식 없음', tolerance: '', method: '육안', equipment: '', use_yn: true },
    { std_no: 'IS-003', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', inspect_type: '공정검사', process: 'MCT가공', eval_method: '정량적', inspect_item: '내경 Ø25', spec_value: '25.0', tolerance: '0.02', method: '3차원측정', equipment: '3차원측정기', use_yn: true },
    { std_no: 'IS-004', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', inspect_type: '공정검사', process: 'MCT가공', eval_method: '정량적', inspect_item: '전장 120', spec_value: '120.0', tolerance: '0.05', method: '3차원측정', equipment: '3차원측정기', use_yn: true },
    { std_no: 'IS-005', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', inspect_type: '출하검사', eval_method: '정량적', inspect_item: '전장 120', spec_value: '120.0', tolerance: '0.05', method: '버니어캘리퍼스', equipment: '버니어캘리퍼스', use_yn: true },
    { std_no: 'IS-006', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', inspect_type: '출하검사', eval_method: '정성적', inspect_item: '외관/BURR', spec_value: 'BURR·스크래치 없음', tolerance: '', method: '육안', equipment: '', use_yn: true },
    { std_no: 'IS-007', item_code: 'P-PIPE-01', item_name: 'COOLING PIPE', inspect_type: '공정검사', process: '용접', eval_method: '정성적', inspect_item: '용접비드 외관', spec_value: '기공·언더컷 없음', tolerance: '', method: '육안', equipment: '', use_yn: true },
  ],
  incoming_inspections: [
    { inspect_no: 'II-2607-001', inspect_date: d(-6), inbound_no: 'MI-2607-001', partner: '대성알루미늄', item_code: 'M-AL-6061', item_name: 'AL6061 환봉 Ø130', lot_no: 'MLOT-A001', inspect_qty: 60, good_qty: 60, defect_qty: 0, inspector: '최품질', result: '합격' },
  ],
  process_inspections: [
    { inspect_no: 'PI-2607-001', inspect_date: d(-2), wo_no: 'WO-2607-001', lot_no: 'LOT-WO-2607-001', process: 'MCT가공', machine_no: '1호기', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', inspect_qty: 5, good_qty: 5, defect_qty: 0, inspector: '최품질', result: '합격' },
    { inspect_no: 'PI-2607-002', inspect_date: d(-1), wo_no: 'WO-2607-001', lot_no: 'LOT-WO-2607-001', process: 'MCT가공', machine_no: '2호기', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', inspect_qty: 5, good_qty: 5, defect_qty: 0, inspector: '최품질', result: '합격' },
  ],
  shipping_inspections: [
    { inspect_no: 'SI-2606-001', inspect_date: d(-2), order_no: 'SO-2606-002', partner: '현대모비스', item_code: 'P-CNC-01', item_name: 'CNC 브라켓 가공품', inspect_qty: 200, good_qty: 200, defect_qty: 0, inspector: '최품질', result: '합격' },
  ],
  // 공정검사 측정값 (Cpk 산출 데모 — 내경 Ø25 ±0.02)
  inspection_details: [
    { inspect_no: 'PI-2607-001', inspect_kind: '공정검사', item_code: 'P-MCT-01', inspect_item: '내경 Ø25', eval_method: '정량적', spec_value: '25.0', tolerance: '0.02', measured: '25.004', judgment: 'OK' },
    { inspect_no: 'PI-2607-001', inspect_kind: '공정검사', item_code: 'P-MCT-01', inspect_item: '내경 Ø25', eval_method: '정량적', spec_value: '25.0', tolerance: '0.02', measured: '24.998', judgment: 'OK' },
    { inspect_no: 'PI-2607-001', inspect_kind: '공정검사', item_code: 'P-MCT-01', inspect_item: '내경 Ø25', eval_method: '정량적', spec_value: '25.0', tolerance: '0.02', measured: '25.006', judgment: 'OK' },
    { inspect_no: 'PI-2607-002', inspect_kind: '공정검사', item_code: 'P-MCT-01', inspect_item: '내경 Ø25', eval_method: '정량적', spec_value: '25.0', tolerance: '0.02', measured: '25.002', judgment: 'OK' },
    { inspect_no: 'PI-2607-002', inspect_kind: '공정검사', item_code: 'P-MCT-01', inspect_item: '내경 Ø25', eval_method: '정량적', spec_value: '25.0', tolerance: '0.02', measured: '24.996', judgment: 'OK' },
    { inspect_no: 'PI-2607-002', inspect_kind: '공정검사', item_code: 'P-MCT-01', inspect_item: '내경 Ø25', eval_method: '정량적', spec_value: '25.0', tolerance: '0.02', measured: '25.005', judgment: 'OK' },
    { inspect_no: 'PI-2607-001', inspect_kind: '공정검사', item_code: 'P-MCT-01', inspect_item: '전장 120', eval_method: '정량적', spec_value: '120.0', tolerance: '0.05', measured: '120.01', judgment: 'OK' },
    { inspect_no: 'PI-2607-001', inspect_kind: '공정검사', item_code: 'P-MCT-01', inspect_item: '전장 120', eval_method: '정량적', spec_value: '120.0', tolerance: '0.05', measured: '119.99', judgment: 'OK' },
    { inspect_no: 'PI-2607-002', inspect_kind: '공정검사', item_code: 'P-MCT-01', inspect_item: '전장 120', eval_method: '정량적', spec_value: '120.0', tolerance: '0.05', measured: '120.02', judgment: 'OK' },
    { inspect_no: 'PI-2607-002', inspect_kind: '공정검사', item_code: 'P-MCT-01', inspect_item: '전장 120', eval_method: '정량적', spec_value: '120.0', tolerance: '0.05', measured: '120.0', judgment: 'OK' },
    { inspect_no: 'PI-2607-002', inspect_kind: '공정검사', item_code: 'P-MCT-01', inspect_item: '전장 120', eval_method: '정량적', spec_value: '120.0', tolerance: '0.05', measured: '119.98', judgment: 'OK' },
  ],
  nonconformances: [
    { ncr_no: 'NC-2607-001', occur_date: d(-2), ncr_type: '공정부적합', process: 'MCT가공', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', lot_no: 'LOT-WO-2607-001', defect_type: '치수불량', defect_qty: 3, cause: '공구마모', charge_dept: '생산팀', action: '공구교체 후 재작업', action_type: '재작업', worker: '박생산', status: '완료' },
    ...NCR_SAMPLES,
  ],
  improvement_actions: [
    { imp_no: 'CA-2607-001', reg_date: d(-1), ncr_no: 'NC-2607-001', title: '치수불량 개선대책 — MCT 하우징', cause_analysis: '엔드밀 수명 관리 미흡으로 마모 상태에서 가공 지속', action_plan: '공구 교체알람횟수 설정(450회) 및 교체 후 치수검증 의무화', action_type: '시정조치', owner: '박생산', due_date: d(7), status: '진행중' },
  ],
  four_m_changes: [
    { fm_no: '4M-2607-001', change_date: d(-5), category: 'Machine', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', process: 'MCT가공', before_desc: 'MCT-01 1호기 단독 가공', after_desc: 'MCT-02 2호기 병행 가공 추가', reason: '수주량 증가 대응', ppap_yn: true, approver: '관리자', status: '승인' },
  ],
  ppap_approvals: [
    { ppap_no: 'PPAP-2607-001', submit_date: d(-3), customer: 'DOOWON', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', level: 'Level 3', reason: '4M변경', fm_no: '4M-2607-001', docs: 'PSW, 치수측정결과, Cpk, 관리계획서', approver: '', status: '제출' },
  ],
  dev_docs: [
    { doc_no: 'DOC-2607-001', doc_type: 'PFMEA', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', process: 'MCT가공', rev: 'B', title: 'MCT 하우징 공정 PFMEA', writer: '최품질', write_date: d(-30), approver: '관리자', approve_date: d(-25), status: '승인' },
    { doc_no: 'DOC-2607-002', doc_type: 'PFD', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', process: '', rev: 'A', title: 'MCT 하우징 공정흐름도', writer: '최품질', write_date: d(-30), approver: '관리자', approve_date: d(-25), status: '승인' },
    { doc_no: 'DOC-2607-003', doc_type: '관리계획서', item_code: 'P-MCT-01', item_name: 'MCT 하우징 가공품', process: '', rev: 'A', title: 'MCT 하우징 관리계획서', writer: '최품질', write_date: d(-28), approver: '관리자', approve_date: d(-24), status: '승인' },
    { doc_no: 'DOC-2607-004', doc_type: '작업표준서', item_code: 'P-PIPE-01', item_name: 'COOLING PIPE', process: 'PIPE성형', rev: 'A', title: 'PIPE 성형 작업표준서', writer: '박생산', write_date: d(-20), approver: '', status: '작성중' },
  ],
  measuring_instruments: [
    { code: 'MI-001', name: '버니어캘리퍼스', model: 'CD-15APX', serial_no: 'VC-2211', maker: 'Mitutoyo', meas_range: '0-150mm', resolution: '0.01mm', location: '검사실', manager: '최품질', calib_cycle: 12, last_calib: d(-200), next_calib: d(165), status: '정상', use_yn: true },
    { code: 'MI-002', name: '마이크로미터', model: 'MDC-25PX', serial_no: 'MM-1108', maker: 'Mitutoyo', meas_range: '0-25mm', resolution: '0.001mm', location: '검사실', manager: '최품질', calib_cycle: 12, last_calib: d(-340), next_calib: d(25), status: '정상', use_yn: true },
    { code: 'MI-003', name: '3차원측정기', model: 'CRYSTA-574', serial_no: 'CMM-0091', maker: 'Mitutoyo', meas_range: '500x700x400', resolution: '0.0001mm', location: '검사실', manager: '최품질', calib_cycle: 12, last_calib: d(-370), next_calib: d(-5), status: '정상', use_yn: true },
    { code: 'MI-004', name: '하이트게이지', model: 'HDS-H30C', serial_no: 'HG-3302', maker: 'Mitutoyo', meas_range: '0-300mm', resolution: '0.01mm', location: '검사실', manager: '최품질', calib_cycle: 24, last_calib: d(-100), next_calib: d(630), status: '정상', use_yn: true },
  ],
  calibrations: [
    { cal_no: 'CAL-2606-001', cal_date: d(-40), inst_code: 'MI-001', inst_name: '버니어캘리퍼스', cal_type: '외부교정', agency: '한국계측기술원', result: '합격', cert_no: 'KCT-26-0192', cost: 45000, next_date: d(325), worker: '최품질' },
  ],
  gauge_rr: [
    { rr_no: 'RR-2606-001', eval_date: d(-20), inst_code: 'MI-002', inst_name: '마이크로미터', item_code: 'P-MCT-01', characteristic: '내경 Ø25', appraisers: 3, parts: 10, trials: 3, grr_percent: 8.4, ndc: 6, judgment: '적합', evaluator: '최품질', status: '완료' },
    { rr_no: 'RR-2607-001', eval_date: d(-5), inst_code: 'MI-001', inst_name: '버니어캘리퍼스', item_code: 'P-PIPE-01', characteristic: '전장 850', appraisers: 3, parts: 10, trials: 3, grr_percent: 18.2, ndc: 4, judgment: '조건부', evaluator: '최품질', status: '완료' },
  ],
  wps_docs: [
    { wps_no: 'WPS-001', rev: 'A', title: 'AL5052 파이프 TIG 용접', welding_process: 'GTAW(TIG)', position: '1G', base_metal: 'AL 5052-H32', filler_metal: 'ER5356', shielding_gas: 'Ar 100%', current_range: '90~130', voltage_range: '12~16', travel_speed: '15~25 cm/min', preheat_temp: '상온', pqr_no: 'PQR-001', writer: '김용접', write_date: d(-60), approver: '관리자', status: '승인' },
  ],
  pqr_docs: [
    { pqr_no: 'PQR-001', test_date: d(-90), wps_no: 'WPS-001', welding_process: 'GTAW(TIG)', base_metal: 'AL 5052-H32', filler_metal: 'ER5356', welder: '김용접', test_items: '인장, 굽힘, 침투탐상', test_agency: '한국용접시험원', result: '합격', cert_no: 'KWT-26-0331', writer: '최품질', status: '유효' },
  ],
  welders: [
    { code: 'WD-01', name: '김용접', department: '생산팀', cert_no: '26201012345', cert_type: '용접기능사', welding_process: 'GTAW(TIG)', position_range: 'F, H', issue_date: d(-700), expire_date: d(395), renewal_date: d(365), status: '유효', use_yn: true },
    { code: 'WD-02', name: '이현장', department: '생산팀', cert_no: '25201054321', cert_type: '사내인증', welding_process: 'GMAW(MIG/MAG)', position_range: 'F', issue_date: d(-400), expire_date: d(45), renewal_date: d(30), status: '만료임박', use_yn: true },
  ],
  qcost_items: [
    { code: 'QP-01', category: '예방비용', name: '품질교육비', calc_basis: '월별 교육비 실적', use_yn: true },
    { code: 'QP-02', category: '예방비용', name: '예방정비비', calc_basis: '설비 예방정비 비용', use_yn: true },
    { code: 'QA-01', category: '평가비용', name: '검사인건비', calc_basis: '검사원 인건비 배부', use_yn: true },
    { code: 'QA-02', category: '평가비용', name: '검교정비', calc_basis: '계측기 교정 비용', use_yn: true },
    { code: 'QF-01', category: '내부실패비용', name: '폐기비용', calc_basis: '폐기 수량 × 재료비', use_yn: true },
    { code: 'QF-02', category: '내부실패비용', name: '재작업비용', calc_basis: '재작업 공수 × 임률', use_yn: true },
    { code: 'QF-03', category: '외부실패비용', name: '클레임비용', calc_basis: '고객 클레임 배상액', use_yn: true },
  ],
  qcost_records: [
    { rec_no: 'QC-2606-001', cost_ym: ym(-1), cost_code: 'QP-01', cost_name: '품질교육비', category: '예방비용', amount: 500000, dept: '품질팀', writer: '최품질' },
    { rec_no: 'QC-2606-002', cost_ym: ym(-1), cost_code: 'QA-01', cost_name: '검사인건비', category: '평가비용', amount: 2800000, dept: '품질팀', writer: '최품질' },
    { rec_no: 'QC-2606-003', cost_ym: ym(-1), cost_code: 'QF-01', cost_name: '폐기비용', category: '내부실패비용', amount: 620000, dept: '생산팀', writer: '최품질' },
    { rec_no: 'QC-2606-004', cost_ym: ym(-1), cost_code: 'QF-03', cost_name: '클레임비용', category: '외부실패비용', amount: 0, dept: '품질팀', writer: '최품질' },
  ],
  equipment_histories: [
    { hist_no: 'EH-2606-001', hist_date: d(-12), equip_code: 'CNC-02', equip_name: 'CNC 선반 2호기', hist_type: '고장수리', content: '주축 베어링 소음 — 베어링 교체', parts: '주축 베어링 SET', cost: 850000, downtime_min: 480, worker: '박생산' },
    { hist_no: 'EH-2607-001', hist_date: d(-3), equip_code: 'MCT-01', equip_name: 'MCT 머시닝센터 1호기', hist_type: '예방정비', content: '절삭유 교체 및 필터 청소', parts: '절삭유 20L', cost: 120000, downtime_min: 90, worker: '박생산' },
  ],
  downtime_codes: [
    { code: 'DT-01', name: '금형/지그 교체', category: '계획', use_yn: true },
    { code: 'DT-02', name: '자재대기', category: '비계획', use_yn: true },
    { code: 'DT-03', name: '설비고장', category: '비계획', use_yn: true },
    { code: 'DT-04', name: '계획정지(점검)', category: '계획', use_yn: true },
    { code: 'DT-05', name: '품질문제 정지', category: '비계획', use_yn: true },
  ],
  equipment_downtimes: [
    { dt_no: 'DT-2607-001', dt_date: d(-2), equip_code: 'CNC-02', equip_name: 'CNC 선반 2호기', reason_code: 'DT-03', reason_name: '설비고장', minutes: 120, worker: '박생산' },
    { dt_no: 'DT-2607-002', dt_date: d(-1), equip_code: 'MCT-01', equip_name: 'MCT 머시닝센터 1호기', reason_code: 'DT-01', reason_name: '금형/지그 교체', minutes: 45, worker: '박생산' },
    { dt_no: 'DT-2607-003', dt_date: d(0), equip_code: 'PIPE-01', equip_name: 'PIPE 성형기 1호기', reason_code: 'DT-02', reason_name: '자재대기', minutes: 30, worker: '이현장' },
  ],
  equipment_checks: [
    { check_no: 'EC-2607-001', check_date: d(0), equip_code: 'MCT-01', equip_name: 'MCT 머시닝센터 1호기', check_cycle: '일상', check_item: '절삭유량/이상소음/에어압', result: '양호', worker: '박생산' },
    { check_no: 'EC-2607-002', check_date: d(0), equip_code: 'PIPE-01', equip_name: 'PIPE 성형기 1호기', check_cycle: '일상', check_item: '유압/클램프 상태', result: '양호', worker: '이현장' },
    { check_no: 'EC-2607-003', check_date: d(-1), equip_code: 'CNC-02', equip_name: 'CNC 선반 2호기', check_cycle: '일상', check_item: '주축 소음 점검', result: '불량', worker: '박생산', remark: '수리 요청' },
  ],
  equipment_logs: [
    { log_time: dt(0, 8, 30), equip_code: 'MCT-01', run_status: '가동', run_seconds: 12600, prod_count: 52 },
    { log_time: dt(0, 8, 30), equip_code: 'MCT-02', run_status: '가동', run_seconds: 11800, prod_count: 48 },
    { log_time: dt(0, 8, 30), equip_code: 'CNC-01', run_status: '가동', run_seconds: 10500, prod_count: 40 },
    { log_time: dt(0, 8, 30), equip_code: 'CNC-02', run_status: '비가동', run_seconds: 0, prod_count: 0 },
    { log_time: dt(0, 8, 31), equip_code: 'PIPE-01', run_status: '알람', run_seconds: 9800, prod_count: 120, alarm_code: 'AL-22', alarm_msg: '소재 공급 대기' },
  ],
};
