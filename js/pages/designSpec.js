// =====================================================================
// 화면설계서 — (주)민선 MES·QMS 전체 프로세스 + 화면별 명세
//  · 화면 미리보기(번호 주석) + 기능설명
//  · 데이터 연관성 / 드롭리스트 / 조회조건(+기본조건) / 컬럼 / 예외처리(Alert)
// =====================================================================
import { escapeHtml } from '../lib/format.js';
import { icon } from '../ui/icons.js';

// ---------- 전체 시스템 프로세스 ----------
const SYSTEM_FLOWS = [
  { label: '영업 · 생산 메인 흐름', tone: 'brand', steps: ['수주관리', '생산계획관리', '작업지시관리', '작업 POP', '생산실적', '출하검사', '출하지시', '출하(납품)관리'] },
  { label: '자재 흐름 (원소재 → 절단 → 입고)', tone: 'green', steps: ['자재발주', '자재입고관리', '수입검사', '자재현황(재고)', '자재반출관리'] },
  { label: '외주 흐름 (사내↔외주 혼류)', tone: 'green', steps: ['외주발주', '자재반출관리', '외주입고', '공정검사'] },
  { label: '공구 흐름', tone: 'amber', steps: ['공구 기초정보', '공구 입·출고·회수', '공구 재고관리', '공구 치수검증', '공구 폐기관리'] },
  { label: '품질 흐름 (SQ 심사 대응)', tone: 'violet', steps: ['검사규격관리', '공정검사', '부적합관리', '개선대책관리', '4M 변경관리', 'PPAP 승인관리'] },
  { label: '추적성 · 지표', tone: 'brand', steps: ['작업지시관리', '작업 POP', 'LOT 추적', 'SQ 지표 리포트'] },
  { label: '설비 흐름 (CMS)', tone: 'amber', steps: ['설비관리', '설비모니터링', '비가동 실적', '설비 수리이력', '설비점검'] },
];

// ---------- 화면 유형별 템플릿 (미리보기·기능·예외·기본조건 공통) ----------
const TYPE = {
  list: {
    feats: [
      ['등록 · 내보내기', '[신규등록]으로 입력 폼(모달)을 열고, 엑셀(CSV) 저장·새로고침을 할 수 있습니다.'],
      ['검색', '검색어를 입력하면 코드·명칭 등 지정 항목에서 실시간으로 찾습니다.'],
      ['필터', '드롭다운 조건으로 목록을 좁혀 조회합니다. (필터가 있는 화면)'],
      ['기간 조회', '기준 날짜의 기간(프리셋 또는 직접 선택)으로 조회합니다. (날짜가 있는 화면)'],
      ['상태 칩', '상태·구분별 빠른 필터이며, 각 상태의 건수를 함께 보여줍니다. (해당 화면)'],
      ['정렬', '정렬 가능한 컬럼 머리글을 클릭하면 오름차순↔내림차순으로 전환됩니다.'],
      ['행 관리', '행별 수정·삭제가 가능하며, 행을 선택(체크/클릭)해 일괄 처리합니다.'],
      ['페이징', '총 건수와 페이지 이동, 한 페이지 표시 개수(10/20/50/100)를 선택합니다.'],
    ],
    alerts: [
      '필수 항목 미입력 → "필수 항목을 확인하세요" 오류 토스트(해당 필드 빨강)',
      '삭제 시 → "삭제된 데이터는 복구할 수 없습니다" 확인 대화 후 진행',
      '저장/삭제 실패 → 사유 오류 토스트',
      '데이터 로드 실패 → "데이터를 불러오지 못했습니다" 빈 상태 표시',
    ],
    defs: ['기간 기본: 전체', '상태/구분 칩 기본: 전체', '표시 개수 기본: 10건'],
    wf: () => `
      <div class="wf-bar wf-bar--head">${b(1)}<b>화면 제목</b><span class="wf-r">신규등록 · CSV · 새로고침</span></div>
      <div class="wf-bar">${b(2)}<span class="wf-pill">🔍 검색</span>${b(3)}<span class="wf-pill">필터 ▾</span>${b(4)}<span class="wf-pill">📅 기간</span></div>
      <div class="wf-bar wf-bar--soft">${b(5)}<span class="wf-chip">전체</span><span class="wf-chip">상태…</span></div>
      <div class="wf-grid"><div class="wf-gh">${b(6)} 컬럼(정렬) ▲</div><div class="wf-gr">데이터 행<span class="wf-r">${b(7)} 수정/삭제</span></div><div class="wf-gr">데이터 행</div></div>
      <div class="wf-bar wf-bar--foot">${b(8)} 총 N건 · ◀ 1 2 3 ▶ · 표시 10 ▾</div>`,
  },
  masterDetail: {
    feats: [
      ['좌측 검색', '좌측 목록을 코드·명칭으로 검색합니다.'],
      ['항목 목록', '항목을 클릭하면 우측에 상세가 표시됩니다. (건수 배지 포함)'],
      ['액션 버튼', '우상단 버튼으로 등록·반품·저장 등을 수행합니다.'],
      ['상세 영역', '선택한 항목의 상세 목록 또는 입력 폼이 표시됩니다.'],
    ],
    alerts: ['항목 미선택 상태에서 동작 시 "선택하세요" 안내', '저장/처리 실패 토스트'],
    defs: ['초기: 미선택(좌측에서 선택)', '좌측 정렬 기본: 코드 오름차순'],
    wf: () => `
      <div class="wf-md">
        <div class="wf-side"><div class="wf-bar">${b(1)} 🔍 검색</div><div class="wf-li">${b(2)} 항목 ▸ <span class="wf-chip">배지</span></div><div class="wf-li">항목</div><div class="wf-li">항목</div></div>
        <div class="wf-main"><div class="wf-bar wf-bar--head"><b>선택 항목</b><span class="wf-r">${b(3)} 액션</span></div><div class="wf-grid"><div class="wf-gh">${b(4)} 상세 목록/입력</div><div class="wf-gr">행</div><div class="wf-gr">행</div></div></div>
      </div>`,
  },
  chart: {
    feats: [
      ['기간 조회', '시작~종료일(기본 최근 90일)로 조회'],
      ['조건 필터', '거래처·상태·판정 등 조건 드롭다운(데이터 기반 자동)'],
      ['통계 카드', '핵심 지표 4종 요약(기간·조건 반영)'],
      ['일자별 추이', '기간 내 일자별 막대 그래프(호버 요약)'],
      ['분류별 도넛', '거래처/품목/상태 등 분류 비중'],
      ['드릴다운', '그래프 클릭 시 해당 건 목록 팝업'],
    ],
    alerts: ['해당 기간 데이터 없음 → "데이터가 없습니다" 안내', '불러오기 실패 토스트'],
    defs: ['기간 기본: 최근 90일', '조건 필터 기본: 전체', '추이 단위: 일자별'],
    wf: () => `
      <div class="wf-bar wf-bar--head">${b(1)}<b>현황 제목</b><span class="wf-r">📅 시작 ~ 종료 · 조회</span></div>
      <div class="wf-bar">${b(2)}<span class="wf-pill">조건 ▾</span><span class="wf-pill">조건 ▾</span></div>
      <div class="wf-stats">${b(3)}<span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span></div>
      <div class="wf-chart">${b(4)} 일자별 추이 ▆▃▅▂▇</div>
      <div class="wf-bar wf-bar--soft">${b(5)} ◐ 도넛 · ◑ 도넛 · ◓ 도넛 <span class="wf-r">${b(6)} 클릭→목록</span></div>`,
  },
  inspect: {
    feats: [
      ['대상 리스트', '검사 대상(입고완료·작업지시·생산완료 수주)이 자동으로 표시됩니다.'],
      ['상태 칩', '전체/미검사/검사완료로 빠르게 구분합니다. (미검사 우선 정렬)'],
      ['기간 조회', '기준 날짜의 기간으로 조회합니다.'],
      ['검사 진행 버튼', '행별 [검사] 버튼 → 검사규격(체크시트) 기반 항목 평가 모달이 열립니다.'],
      ['자동 판정', '정량 항목은 규격값±공차로 OK/NG 자동 판정, 전 항목 OK면 종합 합격.'],
      ['결과 조회', '검사완료 건은 [결과] 버튼으로 항목별 측정값·판정을 확인합니다.'],
      ['통계 카드', '검사 대상·검사완료·미검사·합격률을 요약합니다.'],
    ],
    alerts: [
      '검사규격 미등록 품목 → "등록된 검사기준이 없습니다" 안내 후 수동 판정 선택',
      '항목 미평가 상태 저장 시도 → "모든 검사항목을 평가하세요" 오류',
      '저장 실패 → 사유 오류 토스트',
    ],
    defs: ['상태 칩 기본: 전체', '정렬 기본: 미검사 우선', '검사일 기본: 오늘'],
    wf: () => `
      <div class="wf-bar wf-bar--head">${b(1)}<b>검사 화면</b><span class="wf-r">새로고침</span></div>
      <div class="wf-stats">${b(7)}<span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span></div>
      <div class="wf-bar">${b(2)}<span class="wf-pill">🔍 검색</span>${b(3)}<span class="wf-pill">📅 기간</span></div>
      <div class="wf-bar wf-bar--soft"><span class="wf-chip">전체</span><span class="wf-chip">미검사</span><span class="wf-chip">검사완료</span></div>
      <div class="wf-grid"><div class="wf-gh">대상 목록</div><div class="wf-gr">미검사 행<span class="wf-r">${b(4)} [검사] 버튼</span></div><div class="wf-gr">완료 행<span class="wf-r">${b(6)} [결과]</span></div></div>
      <div class="wf-bar wf-bar--soft">${b(5)} 모달: 검사항목 · 규격 · 측정값 → 판정 자동</div>`,
  },
  pop: {
    feats: [
      ['작업자/상태', '상단에서 작업자 선택, 상태(대기/작업중/완료) 필터'],
      ['작업지시 카드', '카드 선택 시 라우팅(공정) 자동 전개 — 사내/외주 구분 표시'],
      ['공정 시작/종료', '시작 시 작업자·설비호기 선택, 종료 시 생산·불량 입력(양품 자동집계)'],
      ['자재·공구 투입', '진행 공정에 BOM 자재·지정 공구(LOT) 투입 기록'],
      ['재작업 처리', '불량 발생 시 재작업 공정 추가 및 부적합 등록 연계'],
    ],
    alerts: ['작업자 미선택 시 시작 안내', '공정 미지정 공구/자재 없음 안내', '종료 수량 미입력 검증', '잔여수명 0 LOT 선택 불가'],
    defs: ['상태 기본: 전체(작업중 우선 노출)', '작업자 먼저 선택', '양품 = 생산수량 − 불량수량 자동'],
    wf: () => `
      <div class="wf-bar wf-bar--head">${b(1)}<b>작업 POP</b><span class="wf-r">작업자 ▾ · 상태</span></div>
      <div class="wf-cards">${b(2)}<span class="wf-card"></span><span class="wf-card"></span><span class="wf-card"></span></div>
      <div class="wf-bar">${b(3)} ▶ 시작(작업자·호기) / ■ 종료(생산·불량)</div>
      <div class="wf-bar wf-bar--soft">${b(4)} 자재투입 · 공구투입 ${b(5)} 재작업/부적합</div>`,
  },
  dashboard: {
    feats: [
      ['KPI 카드', '금일 생산·진행 작업지시·수주금액·품질 합격률'],
      ['수주/작업 현황', '최근 수주, 작업지시 상태 분포'],
      ['품질/재고/설비', '품질 요약·재고 부족·설비 가동 현황'],
      ['SQ 핵심지표 · 납기', '불량률(PPM)·시간당 생산량 목표 대비, 납기 임박/지연 수주'],
    ],
    alerts: ['항목별 데이터 없을 때 빈 상태 표시'],
    defs: ['기준일: 오늘', '자동 집계(저장 시 갱신)'],
    wf: () => `
      <div class="wf-stats">${b(1)}<span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span></div>
      <div class="wf-bar wf-bar--soft">${b(2)} 최근 수주 · 작업지시 진행</div>
      <div class="wf-bar wf-bar--soft">${b(3)} 품질 · 재고 · 설비</div>
      <div class="wf-bar wf-bar--soft">${b(4)} SQ 핵심지표(PPM·UPH) · 납기 임박/지연</div>`,
  },
  report: {
    feats: [
      ['지표 자동 산출', '생산실적·검사 데이터로 SQ 심사 요구 수치를 자동 계산합니다.'],
      ['목표 대비 판정', '불량률 12,000PPM·시간당 생산량 170EA 목표 달성 여부를 표시합니다.'],
      ['월별 추이', '월별 공정 불량률(PPM) 추이를 목표선과 비교합니다.'],
      ['검사 합격률', '수입·공정·출하검사별 합격률을 표시합니다.'],
      ['공정능력(Cpk)', '정량 검사항목의 측정값 5건 이상 축적 시 Cpk를 자동 산출·평가합니다.'],
      ['인쇄', '심사 제출용으로 화면을 인쇄합니다.'],
    ],
    alerts: ['실적 데이터 없음 → "실적 데이터가 없습니다" 안내', 'Cpk 산출 데이터 부족(측정값 5건 미만) → 안내 표시'],
    defs: ['대상: 전체 누적 데이터', '월별 추이: 최근 6개월', 'Cpk 기준: 시료 5건 이상 · 공차 등록 항목'],
    wf: () => `
      <div class="wf-bar wf-bar--head">${b(1)}<b>SQ 지표 리포트</b><span class="wf-r">${b(6)} 인쇄 · 새로고침</span></div>
      <div class="wf-stats">${b(2)}<span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span></div>
      <div class="wf-chart">${b(3)} 월별 PPM 추이 ▆▃▅▂ (목표선)</div>
      <div class="wf-bar wf-bar--soft">${b(4)} 수입/공정/출하 합격률 ▬▬▬</div>
      <div class="wf-grid"><div class="wf-gh">${b(5)} 공정능력 Cpk</div><div class="wf-gr">품목 · 항목 · 평균 · σ · Cpk</div></div>`,
  },
  trace: {
    feats: [
      ['LOT 입력/선택', 'LOT No.(또는 작업지시번호) 직접 입력 또는 최근 LOT 칩 선택'],
      ['제조이력 타임라인', '수주→계획→작업지시→자재투입→공정→검사→부적합→출하 시간순 표시'],
      ['정·역방향 추적', '완제품 LOT에서 투입 원소재 LOT까지, 원소재에서 출하까지 양방향 확인'],
    ],
    alerts: ['미등록 LOT → "해당 LOT/작업지시를 찾을 수 없습니다" 안내'],
    defs: ['초기: 미선택(LOT 입력/선택 필요)', '이벤트 정렬: 공정 흐름순'],
    wf: () => `
      <div class="wf-bar wf-bar--head">${b(1)}<b>LOT 추적</b><span class="wf-r">🔍 LOT 입력 · [추적]</span></div>
      <div class="wf-bar wf-bar--soft">${b(1)} 최근 LOT 칩: LOT-WO-…</div>
      <div class="wf-grid"><div class="wf-gh">${b(2)} 제조이력 타임라인</div><div class="wf-gr">● 수주 → 계획 → 작업지시(LOT)</div><div class="wf-gr">● 자재투입 → 공정 → 검사 → 출하</div></div>`,
  },
  monitor: {
    feats: [
      ['가동 요약', '전체/가동/고장·비가동 설비 대수와 30일 비가동시간 요약'],
      ['설비별 카드', '설비(호기)별 가동상태·금일 생산수량·최근 수집시각 표시'],
      ['PLC 자동수집', 'PLC 연계 설비는 수집로그(3초 주기)의 최신 상태가 자동 반영됩니다.'],
      ['비가동 집계', '최근 30일 비가동 사유별 시간을 막대로 비교합니다.'],
      ['알람/로그', '최근 수집 로그와 알람 코드·메시지를 확인합니다.'],
    ],
    alerts: ['설비 미등록 → 기준정보 설비관리 등록 안내', '수집로그 없음 → "수동 상태" 표시'],
    defs: ['비가동 집계 기간: 최근 30일', '금일 생산: 당일 실적 기준'],
    wf: () => `
      <div class="wf-bar wf-bar--head">${b(1)}<b>설비모니터링(CMS)</b><span class="wf-r">새로고침</span></div>
      <div class="wf-stats">${b(1)}<span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span></div>
      <div class="wf-cards">${b(2)}<span class="wf-card"></span><span class="wf-card"></span><span class="wf-card"></span></div>
      <div class="wf-bar wf-bar--soft">${b(4)} 비가동 사유별 ▬▬▬ ${b(5)} 최근 알람 로그</div>`,
  },
  daily: {
    feats: [
      ['일자 선택', '상단 날짜 선택으로 해당 일자의 실적을 조회합니다.'],
      ['자동 집계', '작업지시·생산·불량·작업시간 입력 시 양품 등 나머지 항목이 자동 반영됩니다.'],
      ['요약 지표', '생산수량·양품·불량·시간당 생산량(UPH)을 카드로 요약합니다.'],
      ['합계 행', '표 하단에 생산·불량·양품·작업시간 합계를 표시합니다.'],
      ['인쇄', '일보 양식을 인쇄합니다.'],
    ],
    alerts: ['해당 일자 실적 없음 → "해당 일자의 실적이 없습니다" 안내'],
    defs: ['일자 기본: 오늘', '양품 = 생산수량 − 불량수량 자동집계'],
    wf: () => `
      <div class="wf-bar wf-bar--head">${b(1)}<b>생산일보</b><span class="wf-r">📅 일자 ▾ · ${b(5)} 인쇄</span></div>
      <div class="wf-stats">${b(3)}<span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span></div>
      <div class="wf-grid"><div class="wf-gh">${b(2)} 작업지시 · LOT · 공정 · 호기</div><div class="wf-gr">생산 · 불량 · 양품(자동) · 작업시간</div><div class="wf-gr">${b(4)} 합계 행</div></div>`,
  },
};

// ---------- 화면별 명세 (전 화면) ----------
const S = (o) => o;
const SCREENS = [
  // ===== 대시보드 =====
  S({ id: 'dashboard', title: '대시보드', group: '대시보드', path: '/dashboard', type: 'dashboard',
    purpose: '생산·영업·품질·재고·설비 현황과 SQ 핵심지표(PPM·시간당 생산량)를 한 화면에 요약.',
    relations: [{ field: '전 지표', from: '각 업무 데이터', desc: '수주·실적·검사·재고·설비 집계' }, { field: 'SQ 지표', from: '생산실적', desc: '불량률 PPM·시간당 생산량 산출' }],
    dropdowns: [], search: ['조회조건 없음(자동 집계)'], sort: '최신순',
    columns: ['KPI 4종', '최근 수주', '작업지시 분포', '품질/재고/설비', 'SQ 핵심지표', '납기 임박·지연'] }),

  // ===== 기준정보관리 =====
  S({ id: 'user', title: '사용자관리', group: '기준정보관리', path: '/base/users', type: 'list',
    purpose: '시스템 사용자 계정·비밀번호·권한을 관리. 작업자·검사자·담당자 드롭다운의 원천.',
    relations: [{ field: '부서', from: '부서관리', desc: '부서 드롭다운 선택' }],
    dropdowns: [{ field: '부서', source: 'departments', values: '등록 부서' }, { field: '권한', source: '고정값', values: '관리자/매니저/일반' }],
    search: ['검색: 아이디·이름·부서', '필터: 권한·부서'], sort: '아이디 오름차순',
    columns: ['아이디', '이름', '부서', '직급', '권한', '비밀번호(설정여부)', '이메일', '연락처', '사용'],
    alerts: ['비밀번호 미입력 시 전송 안 함(수정 시 기존 유지)', '비활성(사용 미체크) 계정은 로그인 차단'] }),
  S({ id: 'dept', title: '부서관리', group: '기준정보관리', path: '/base/departments', type: 'masterDetail',
    purpose: '조직 부서 정보를 관리. 사용자·귀책부서·Q-Cost 부서의 기준.', relations: [],
    dropdowns: [],
    search: ['검색: 부서코드·부서명·부서장'], sort: '부서코드 오름차순',
    columns: ['부서코드', '부서명', '부서장', '연락처', '사용', '비고'] }),
  S({ id: 'code', title: '공통코드관리', group: '기준정보관리', path: '/base/codes', type: 'list',
    purpose: '불량유형·비가동사유·창고·라인 등 시스템 공통코드를 그룹별로 관리.',
    relations: [{ field: '사용처', from: '부적합·비가동·자재 화면', desc: '코드그룹별 선택값 제공' }],
    dropdowns: [{ field: '코드그룹', source: '고정값', values: 'DEFECT_TYPE/DOWNTIME/WAREHOUSE/LINE 등' }],
    search: ['검색: 그룹코드·코드·명칭', '필터: 코드그룹'], sort: '그룹코드 오름차순',
    columns: ['그룹코드', '그룹명', '코드', '코드명', '정렬', '사용', '비고'] }),
  S({ id: 'partner', title: '거래처관리', group: '기준정보관리', path: '/base/partners', type: 'list',
    purpose: '매출처·매입처·외주가공처·원소재업체·절단업체를 통합 관리. (가공업 특성 반영)',
    relations: [{ field: '사용처', from: '수주·발주·외주·품목', desc: '거래구분별 드롭다운 제공' }],
    dropdowns: [{ field: '거래구분', source: '고정값', values: '매출처/매입처/외주가공처/원소재업체/절단업체' }],
    search: ['검색: 코드·명·사업자번호', '필터·칩: 거래구분'], sort: '거래처코드 오름차순',
    columns: ['거래처코드', '거래처명', '구분', '사업자번호', '대표자', '담당자', '연락처', '사용'] }),
  S({ id: 'item', title: '품목관리', group: '기준정보관리', path: '/base/items', type: 'list',
    purpose: '완제품·반제품·원소재·부자재 마스터. 가공업 특성(EA/KG 이중단위·단중·판매/구매/외주단가·라우팅그룹) 포함.',
    relations: [{ field: '고객사·주거래처', from: '거래처관리', desc: '거래처 드롭다운' }, { field: '재질', from: '표준재질관리', desc: '표준재질 드롭다운' }, { field: '대표단가', from: '계산값', desc: '판매단가와 동기화' }],
    dropdowns: [{ field: '품목유형', source: '고정값', values: '완제품/반제품/원소재/부자재' }, { field: '기본단위', source: '고정값', values: 'EA/SET/KG/M/BOX' }, { field: '보조단위', source: '고정값', values: 'KG/EA/M (이중단위)' }, { field: '재질', source: 'std_materials', values: '등록 표준재질' }, { field: '고객사·주거래처', source: 'partners', values: '등록 거래처' }],
    search: ['검색: 품목코드·품명·규격·재질·도면', '필터·칩: 품목유형'], sort: '품목코드 오름차순',
    columns: ['품목코드', '품명', '유형', '고객사', '규격', '재질', '단위(EA/KG)', '단중(KG)', '판매단가', '구매단가', '외주단가', '라우팅그룹', '대표위치', '사용'],
    feats: [['이중단위·단중', 'EA/KG 이중단위와 단중(KG/EA)을 관리해 자재발주 총중량·수주 KG 환산에 사용']] }),
  S({ id: 'bom', title: 'BOM관리', group: '기준정보관리', path: '/base/bom', type: 'masterDetail',
    purpose: '원소재 기준 제품 구성(소요량) 정의. 원소재업체·절단업체를 포함해 기준정보에서 관리하고, 생산에서는 등록된 BOM을 호출.',
    relations: [{ field: '모품목/구성품', from: '품목관리', desc: '품목에서 선택' }, { field: '원소재·절단업체', from: '거래처관리', desc: '소재 조달 경로' }, { field: '자재투입', from: '작업 POP', desc: 'BOM 구성품이 투입 후보' }],
    dropdowns: [{ field: '구성품', source: 'items', values: '등록 품목' }, { field: '원소재업체·절단업체', source: 'partners', values: '원소재업체/절단업체' }],
    search: ['좌측 검색: 품목코드·품명'], sort: '구성 순서',
    columns: ['구성품코드', '구성품명', '소요량', '단위', '소요 단중(KG)', '원소재업체', '절단업체'],
    alerts: ['동일 모품목-구성품 중복 등록 불가'] }),
  S({ id: 'process', title: '표준공정관리', group: '기준정보관리', path: '/base/processes', type: 'masterDetail',
    purpose: '가공 공정(MCT/CNC/DRILL/복합기/PIPE성형/용접/조립/검사/외주)과 공정별 사용설비를 관리. POP 설비호기 후보의 기준.',
    relations: [{ field: '사용설비', from: '설비관리', desc: '공정별 설비(호기) 지정' }],
    dropdowns: [{ field: '공정유형', source: '고정값', values: 'MCT가공/CNC가공/DRILL/복합기/PIPE성형/용접/조립/검사/포장/외주' }, { field: '사내·외주', source: '고정값', values: '사내/외주' }, { field: '사용설비', source: 'equipments', values: '등록 설비' }],
    search: ['검색: 공정코드·공정명'], sort: '공정코드 오름차순',
    columns: ['공정코드', '공정명', '유형', '사내/외주', '작업장', '표준시간', '준비시간', '사용설비', '사용'] }),
  S({ id: 'routing', title: '제품별표준공정(라우팅)', group: '기준정보관리', path: '/base/item-processes', type: 'masterDetail',
    purpose: '품목별 표준공정 순서(라우팅) 정의. 사내↔외주 혼류(예: MCT → 외주 열처리 → CNC → 검사) 지원. POP 공정 전개 기준.',
    relations: [{ field: '품목', from: '품목관리', desc: '완제품·반제품' }, { field: '공정', from: '표준공정관리', desc: '등록 공정 선택' }, { field: 'POP 전개', from: '작업 POP', desc: '라우팅 순서대로 공정 생성' }],
    dropdowns: [{ field: '표준공정', source: 'processes', values: '등록 공정 전체' }, { field: '사내·외주', source: '고정값', values: '사내/외주' }],
    search: ['좌측 검색: 품목코드·품명'], sort: '순서(seq) 오름차순',
    columns: ['순서', '공정', '사내/외주', '표준시간(분)', '설비', '비고'],
    feats: [['혼류 라우팅', '사내·외주 공정을 순서에 섞어 배치 가능(가공업 왕복 공정 대응)']] }),
  S({ id: 'drawing', title: '도면관리', group: '기준정보관리', path: '/base/drawings', type: 'list',
    purpose: '품목별 도면과 개정(Rev) 이력을 관리.',
    relations: [{ field: '품목', from: '품목관리', desc: '품목 선택 시 품명 자동' }],
    dropdowns: [{ field: '품목', source: 'items', values: '등록 품목' }],
    search: ['검색: 도면번호·품목·도면명'], sort: '도면번호 오름차순',
    columns: ['도면번호', '품목코드', '품명', 'Rev', '도면명', '작성자', '등록일', '사용'] }),
  S({ id: 'material-std', title: '표준재질관리', group: '기준정보관리', path: '/base/materials', type: 'list',
    purpose: '알루미늄·스틸 등 표준재질과 비중을 관리. 품목 재질 드롭다운의 원천.',
    relations: [{ field: '사용처', from: '품목관리', desc: '품목 재질 선택' }],
    dropdowns: [{ field: '분류', source: '고정값', values: '알루미늄/스틸/스테인리스/동·황동/기타' }],
    search: ['검색: 재질코드·재질명', '필터: 분류'], sort: '재질코드 오름차순',
    columns: ['재질코드', '재질명', '분류', '비중', '규격', '사용', '비고'] }),
  S({ id: 'holiday', title: '휴일관리', group: '기준정보관리', path: '/base/holidays', type: 'list',
    purpose: '법정공휴일·회사휴일을 관리. 생산계획 일정 산정에 활용.',
    relations: [{ field: '활용', from: '생산계획관리', desc: '작업일수 산정 기준' }],
    dropdowns: [{ field: '구분', source: '고정값', values: '법정공휴일/회사휴일/임시휴일' }],
    search: ['휴일 기간 조회', '검색: 휴일명', '필터: 구분'], sort: '일자 내림차순',
    columns: ['일자', '휴일명', '구분', '비고'] }),
  S({ id: 'tool-master', title: '공구 기초정보', group: '기준정보관리', path: '/base/tools', type: 'list',
    purpose: '공구 마스터. 최대사용횟수·교체알람횟수·공구 LOT 체계(제작일자 기반)를 관리. 사용공정 지정 시 POP 공구투입 대상.',
    relations: [{ field: '사용공정', from: '표준공정관리', desc: '공정 드롭다운' }, { field: '수명 차감', from: '작업 POP', desc: 'LOT별 사용횟수' }],
    dropdowns: [{ field: '공구유형', source: '고정값', values: '절삭/측정/지그/기타' }, { field: '사용공정', source: 'processes', values: '등록 공정' }],
    search: ['검색: 공구코드·공구명·규격·제작처', '필터·칩: 공구유형'], sort: '공구코드 오름차순',
    columns: ['공구코드', '공구명', '유형', '규격', '사용공정', '최대사용횟수', '교체알람횟수', '표준단가', 'LOT 체계', '안전재고', '보관위치', '사용'],
    feats: [['교체알람', '교체알람횟수 도달 시 교체 시점 판단 기준으로 사용']],
    alerts: ['공구 LOT 각인 가능 여부·형식은 제작처 협의 후 확정(미확정 사항)'] }),
  S({ id: 'equip', title: '설비관리', group: '기준정보관리', path: '/base/equipments', type: 'list',
    purpose: 'MCT/CNC/DRILL/복합기/PIPE/용접기 설비를 호기 단위로 관리. PLC(CMS) 연계 여부·점검주기 포함.',
    relations: [{ field: '공정 배정', from: '표준공정관리', desc: '공정별 사용설비 지정' }, { field: '수집로그', from: '설비모니터링', desc: 'PLC 연계 설비만 자동수집' }],
    dropdowns: [{ field: '설비유형', source: '고정값', values: 'MCT/CNC/DRILL/복합기/PIPE성형기/용접기/검사기/기타' }, { field: '점검주기', source: '고정값', values: '일상/주간/월간' }, { field: '상태', source: '고정값', values: '정상/점검/고장/비가동' }],
    search: ['검색: 설비코드·설비명·모델·호기', '필터·칩: 유형·상태'], sort: '설비코드 오름차순',
    columns: ['설비코드', '설비명', '유형', '호기', '모델', '작업장', 'PLC연계', '점검주기', '설치일', '상태'] }),

  // ===== 작업 POP =====
  S({ id: 'pop', title: '작업 POP', group: '작업 POP', path: '/pop', type: 'pop',
    purpose: '현장 키오스크 단말. 작업지시별 공정 시작/종료, 실적·자재·공구 투입 기록. 양품수량 자동집계.',
    process: ['작업자 선택', '작업지시 카드 선택(라우팅 전개)', '공정 시작(작업자·설비호기)', '자재·공구 투입', '공정 종료(생산·불량 입력)', '실적 자동등록 · 다음 공정 이동'],
    relations: [{ field: '공정 전개', from: '제품별표준공정(라우팅)', desc: '라우팅 순서대로(사내/외주)' }, { field: '설비호기 후보', from: '표준공정관리', desc: '공정 지정 설비로 제한' }, { field: '투입 자재', from: 'BOM관리', desc: '구성품' }, { field: '투입 공구 LOT', from: '공구 재고관리', desc: '공정 지정 공구 단위 LOT' }, { field: '실적 생성', from: '생산실적', desc: '공정 종료 시 자동 등록(LOT·호기 포함)' }],
    dropdowns: [{ field: '작업자', source: 'users', values: '등록 사용자' }, { field: '설비호기', source: 'process_equipments', values: '공정 지정 설비' }, { field: '공구 LOT', source: '입고 단위 LOT', values: '잔여수명 있는 LOT' }],
    search: ['작업자 선택', '상태 필터(대기/작업중/완료)'], sort: '작업지시일 순',
    columns: ['(카드) 작업지시·LOT·품명', '공정 진행(사내/외주)', '시작/종료 시각', '생산/불량/양품(자동)'] }),

  // ===== 영업관리 =====
  S({ id: 'sales-order', title: '수주관리', group: '영업관리', path: '/sales/orders', type: 'list',
    purpose: '고객 수주 등록. 생산 파이프라인 출발점. 고객 발주번호(PO)·KG 환산 관리.',
    relations: [{ field: '거래처', from: '거래처관리', desc: '매출처 드롭다운' }, { field: '품명·규격·단가', from: '품목관리', desc: '품목 선택 시 자동' }, { field: '금액', from: '계산값', desc: '수량×단가' }, { field: '생산계획', from: '생산계획관리', desc: '계획 생성 시 상태 생산중' }],
    dropdowns: [{ field: '거래처', source: 'partners', values: '등록 거래처' }, { field: '품목', source: 'items', values: '등록 품목' }, { field: '상태', source: '고정값', values: '접수/생산중/완료/취소' }],
    search: ['수주일 기간 조회', '필터·칩: 상태', '검색: 수주번호·거래처·품목'], sort: '수주일 내림차순',
    columns: ['수주번호', '수주일', '거래처', '품목코드', '품명', '수주수량', '단가', '금액', '납기일', '상태'] }),
  S({ id: 'sales-status', title: '수주현황', group: '영업관리', path: '/sales/order-status', type: 'chart',
    purpose: '수주를 기간·조건별 그래프(추이·도넛)로 분석. 지표=수주금액.',
    relations: [{ field: '데이터', from: '수주관리', desc: 'sales_orders 집계' }],
    dropdowns: [{ field: '상태', source: '데이터', values: '접수/생산중/완료/취소' }, { field: '거래처', source: '데이터', values: '수주 거래처' }],
    search: ['기간(수주일) 조회', '조건: 상태·거래처'], sort: '-',
    columns: ['통계(건수/수량/금액/진행중)', '일자별 추이', '거래처·품목·상태 도넛'] }),
  S({ id: 'ship-order', title: '출하지시', group: '영업관리', path: '/sales/shipping-orders', type: 'list',
    purpose: '수주 기반 출하지시 등록. 출하검사·출하실적과 연계.',
    relations: [{ field: '수주정보', from: '수주관리', desc: '수주 선택 시 거래처·품목·수량 자동' }, { field: '출하검사', from: '출하검사', desc: '지시 건 검사 연계' }],
    dropdowns: [{ field: '수주번호', source: 'sales_orders', values: '등록 수주' }, { field: '출하창고', source: '고정값', values: '제품창고/자재창고1/2' }, { field: '상태', source: '고정값', values: '지시/출하완료/취소' }],
    search: ['출하예정일 기간 조회', '칩: 상태', '검색: 출하지시번호·수주번호·거래처'], sort: '출하예정일 내림차순',
    columns: ['출하지시번호', '출하예정일', '수주번호', '거래처', '품명', '지시수량', '출하창고', '상태'] }),
  S({ id: 'delivery', title: '출하(납품)관리', group: '영업관리', path: '/sales/deliveries', type: 'list',
    purpose: '생산완료 수주를 납품 처리(행 선택→버튼). 납기 지연 여부 표시. 수정/상태변경 불가.',
    relations: [{ field: '대상', from: '수주/작업지시', desc: '생산완료 건만' }, { field: '납기예정일', from: '수주관리', desc: '수주 납기' }],
    dropdowns: [{ field: '기준 날짜', source: '고정값', values: '납기예정일/납품완료일' }],
    search: ['기준 날짜 기간 조회', '칩: 납품대기/납품완료', '검색: 수주번호·거래처·품명'], sort: '대기 우선·납기순',
    columns: ['수주번호', '거래처', '품명', '수량', '납기예정일', '납품완료일', '납기상태(지연)', '상태'],
    feats: [['선택 납품완료', '행 선택 → [선택 납품완료] → 완료일 기록']],
    alerts: ['미선택 시 버튼 비활성', '완료 처리 확인 대화 후 진행'] }),
  S({ id: 'delivery-status', title: '출하현황', group: '영업관리', path: '/sales/delivery-status', type: 'chart',
    purpose: '생산완료 수주 기준 출하·납품 현황(대기 포함) 그래프. 지표=납품금액.',
    relations: [{ field: '데이터', from: '수주/출하(납품)', desc: '생산완료 수주 + 납품완료 여부' }],
    dropdowns: [{ field: '상태', source: '데이터', values: '납품대기/납품완료' }, { field: '거래처', source: '데이터', values: '거래처' }],
    search: ['기간(납품완료일/납기) 조회', '조건: 상태·거래처'], sort: '-',
    columns: ['통계(대상/완료/대기/금액)', '추이', '상태·거래처·품목 도넛'] }),

  // ===== 구매/자재관리 =====
  S({ id: 'po', title: '자재발주', group: '구매/자재관리', path: '/purchase/orders', type: 'list',
    purpose: '원소재 발주. 원소재업체·절단업체를 함께 지정하고 단중(KG/EA)·총중량을 관리.',
    relations: [{ field: '원소재업체·절단업체', from: '거래처관리', desc: '구분별 드롭다운' }, { field: '품목·단중·구매단가', from: '품목관리', desc: '품목 선택 시 자동' }, { field: '총중량', from: '계산값', desc: '발주수량 × 단중' }, { field: '입고', from: '자재입고관리', desc: '발주 선택 시 입고 자동채움' }],
    dropdowns: [{ field: '원소재업체', source: 'partners', values: '원소재업체/매입처' }, { field: '절단업체', source: 'partners', values: '절단업체' }, { field: '품목', source: 'items', values: '원소재 품목' }, { field: '상태', source: '고정값', values: '발주/입고중/입고완료/취소' }],
    search: ['발주일 기간 조회', '칩: 상태', '검색: 발주번호·업체·품목'], sort: '발주일 내림차순',
    columns: ['발주번호', '발주일', '원소재업체', '절단업체', '품명', '규격', '발주수량', '단위', '단중(KG)', '총중량(KG)', '단가', '금액', '납기일', '상태'],
    feats: [['단중·총중량 자동', '발주수량×단중으로 총중량(KG) 자동 계산 — 가공업 KG 거래 대응']] }),
  S({ id: 'mat-in', title: '자재입고관리', group: '구매/자재관리', path: '/material/inbounds', type: 'list',
    purpose: '자재 입고 등록(입고대기) → 선택·버튼으로 입고완료(실 입고수량). 관리번호(LOT)·거래처 로트 관리, 라벨 발행.',
    relations: [{ field: '발주정보', from: '자재발주', desc: '발주 선택 시 거래처·품목·수량·단가 자동' }, { field: '품명·규격·단가', from: '품목관리', desc: '품목 선택 시 자동' }, { field: '수입검사 대상', from: '수입검사', desc: '입고완료 건이 검사 대상' }],
    dropdowns: [{ field: '자재발주', source: 'purchase_orders', values: '등록 발주' }, { field: '거래처', source: 'partners', values: '거래처' }, { field: '품목', source: 'items', values: '품목' }, { field: '창고', source: '고정값', values: '자재창고1/2/외주창고' }],
    search: ['입고일 기간 조회', '필터·칩: 상태·창고', '검색: 입고번호·거래처·품목·LOT'], sort: '입고일 내림차순',
    columns: ['입고번호', '입고일', '거래처', '품명', '규격', '입고수량', '실 입고수량', '단가', '금액', '창고', 'LOT', '상태'],
    feats: [['입고완료', '행 선택 → [입고완료] → 실 입고수량(기본=입고수량) 확인/수정'], ['라벨 발행', '입고완료 행의 [라벨] 버튼 → 품목·LOT·수량 바코드 라벨 인쇄']],
    alerts: ['입고완료만 재고 반영', '미선택 시 버튼 비활성', '라벨 발행 주체·시점·단위(박스 개별부착)는 업무 협의 후 확정'] }),
  S({ id: 'mat-out', title: '자재반출관리', group: '구매/자재관리', path: '/material/outbounds', type: 'list',
    purpose: '생산투입·외주출고·외주반납·반품·재고조정 출고 관리. 투입 자재 LOT를 기록해 추적성 확보.',
    relations: [{ field: '품명·단위', from: '품목관리', desc: '품목 선택 시 자동' }, { field: '작업지시', from: '작업지시관리', desc: '생산투입 연결(LOT 추적)' }, { field: '외주처', from: '거래처관리', desc: '외주출고·반납 시' }, { field: '원입고', from: '자재입고관리', desc: '반품 건 원 입고번호' }],
    dropdowns: [{ field: '품목', source: 'items', values: '품목' }, { field: '작업지시', source: 'work_orders', values: '작업지시' }, { field: '외주가공처', source: 'partners', values: '외주가공처' }, { field: '용도', source: '고정값', values: '생산투입/외주출고/외주반납/반품/재고조정' }, { field: '담당자', source: 'users', values: '사용자' }],
    search: ['반출일 기간 조회', '칩(용도): 생산투입/외주출고/외주반납/반품/재고조정', '검색: 반출번호·품목·작업지시'], sort: '반출일 내림차순',
    columns: ['반출번호', '반출일', '품명', '반출수량', '단위', '작업지시', 'LOT', '외주처', '원입고(반품)', '창고', '용도', '담당자'] }),
  S({ id: 'mat-stock', title: '자재현황(재고)', group: '구매/자재관리', path: '/material/stocks', type: 'masterDetail',
    purpose: '좌(품목)/우(입고번호별 재고). 입고번호 단위 단일선택 반품. PDA 입출고와 연동 가능.',
    relations: [{ field: '재고', from: '입고(완료)−반출', desc: '실 입고수량 − 반출/반품' }, { field: '반품 결과', from: '자재반출관리', desc: 'purpose 반품 outbound 생성' }],
    dropdowns: [], search: ['좌측 검색: 품목코드·품명'], sort: '품목코드 오름차순',
    columns: ['(좌) 품목·현재고', '(우) 입고번호', '입고일', 'LOT', '실입고', '반품', '반품가능', '창고'],
    feats: [['단일선택 반품', '입고번호 1건 선택(다중 불가) → [반품] → 반품수량 입력']],
    alerts: ['반품수량 0/초과 시 오류', '미선택 시 반품 버튼 비활성'] }),
  S({ id: 'sco', title: '외주발주', group: '구매/자재관리', path: '/purchase/subcon-orders', type: 'list',
    purpose: '외주가공처에 공정 외주 발주. 자재 출고는 자재반출관리(외주출고)와 연계.',
    relations: [{ field: '외주가공처', from: '거래처관리', desc: '외주가공처 드롭다운' }, { field: '외주단가', from: '품목관리', desc: '품목 선택 시 외주단가 자동' }, { field: '외주공정', from: '표준공정관리', desc: '외주 구분 공정' }, { field: '작업지시', from: '작업지시관리', desc: '혼류 라우팅 연계' }],
    dropdowns: [{ field: '외주가공처', source: 'partners', values: '외주가공처' }, { field: '품목', source: 'items', values: '품목' }, { field: '외주공정', source: 'processes', values: '등록 공정(외주)' }, { field: '작업지시', source: 'work_orders', values: '작업지시' }, { field: '상태', source: '고정값', values: '발주/가공중/입고완료/취소' }],
    search: ['발주일 기간 조회', '칩: 상태', '검색: 외주발주번호·외주처·품목·공정'], sort: '발주일 내림차순',
    columns: ['외주발주번호', '발주일', '외주가공처', '품명', '외주공정', '발주수량', '외주단가', '금액', '작업지시', '납기일', '상태'] }),
  S({ id: 'sci', title: '외주입고', group: '구매/자재관리', path: '/purchase/subcon-inbounds', type: 'list',
    purpose: '외주가공품 입고 등록. 양품수량은 입고수량−불량수량으로 자동집계, 입고검사 결과 기록.',
    relations: [{ field: '외주발주 정보', from: '외주발주', desc: '발주 선택 시 외주처·품목·공정 자동' }, { field: '양품수량', from: '계산값', desc: '입고수량 − 불량수량 자동' }],
    dropdowns: [{ field: '외주발주', source: 'subcon_orders', values: '등록 외주발주' }, { field: '검사결과', source: '고정값', values: '미검사/합격/불합격' }, { field: '상태', source: '고정값', values: '입고대기/입고완료' }],
    search: ['입고일 기간 조회', '필터: 상태·검사', '검색: 입고번호·발주번호·외주처·품목'], sort: '입고일 내림차순',
    columns: ['외주입고번호', '입고일', '외주발주', '외주가공처', '품명', '공정', '입고수량', '불량', '양품(자동)', 'LOT', '검사', '상태'],
    feats: [['양품 자동집계', '입고수량−불량수량으로 양품 자동 계산(읽기전용)']] }),

  // ===== 생산관리 =====
  S({ id: 'plan', title: '생산계획관리', group: '생산관리', path: '/production/plans', type: 'list',
    purpose: '수주를 생산계획으로 전개(엑셀 계획 대체), 일정·라인 배정. 계획 대비 진척 관리.',
    process: ['수주 등록 확인', '상단 "생산계획 대기 수주"에서 [생산계획 생성]', '계획일·수량·기간 지정', '계획 생성(수주→생산중)'],
    relations: [{ field: '수주번호·품목·수량', from: '수주관리', desc: '수주 선택 시 자동' }, { field: '휴일', from: '휴일관리', desc: '작업일수 산정' }, { field: '작업지시', from: '작업지시관리', desc: '계획→지시 전개' }],
    dropdowns: [{ field: '수주', source: 'sales_orders', values: '등록 수주' }, { field: '상태', source: '고정값', values: '계획/진행/완료/보류' }],
    search: ['계획일 기간 조회', '필터·칩: 상태', '검색: 계획번호·수주·품목'], sort: '계획일 내림차순',
    columns: ['계획번호', '계획일', '수주번호', '품명', '계획수량', '시작일', '종료일', '상태'],
    feats: [['생산계획 대기 수주', '상단 패널에 계획 미수립 수주를 표시하고 즉시 생성']] }),
  S({ id: 'wo', title: '작업지시관리', group: '생산관리', path: '/production/work-orders', type: 'list',
    purpose: '생산계획을 작업지시로 전개. LOT No. 자동 부여, 작업지시서 겸 공정이동전표(바코드) 출력. [작업시작] 시 POP 노출.',
    process: ['생산계획 확인', '상단 "작업지시 대기 계획"에서 [작업지시 생성]', 'LOT No. 자동 부여', '[전표출력]으로 바코드 전표 인쇄', '[작업시작] → POP 표시'],
    relations: [{ field: '계획번호·품목·수량·계획기간', from: '생산계획관리', desc: '계획 선택 시 자동' }, { field: '전표 라우팅', from: '제품별표준공정(라우팅)', desc: '전표에 공정 순서 인쇄' }, { field: 'POP 대상', from: '작업 POP', desc: '작업중 상태만 표시' }, { field: 'LOT 추적', from: 'LOT 추적', desc: 'LOT No. 기준 이력 조회' }],
    dropdowns: [{ field: '생산계획', source: 'production_plans', values: '등록 계획' }, { field: '상태', source: '고정값', values: '대기/작업중/완료/중단' }],
    search: ['지시일 기간 조회', '칩: 상태', '검색: 작업지시·LOT·품목·공정'], sort: '지시일 내림차순',
    columns: ['작업지시번호', 'LOT No.', '지시일', '품목코드', '품명', '지시수량', '생산계획', '계획시작', '계획종료', '상태'],
    feats: [['LOT No. 자동부여', '미입력 시 LOT-작업지시번호 형식으로 자동 부여(추적성 키)'], ['전표출력(바코드)', '[전표출력] → 작업지시서 겸 공정이동전표(Code39 바코드 + 라우팅 표) 인쇄'], ['작업시작', '[작업시작] 버튼 → 상태 작업중 → POP 표시']],
    alerts: ['전표 인쇄 시 팝업 차단 해제 필요', '계획기간(시작~종료)은 생산계획에서 자동 승계'] }),
  S({ id: 'result', title: '생산실적', group: '생산관리', path: '/production/results', type: 'list',
    purpose: 'POP 공정 종료 시 자동 등록되는 실적. 양품수량 = 생산수량 − 불량수량 자동집계, 재작업 여부·호기 기록.',
    relations: [{ field: '실적 원천', from: '작업 POP', desc: '공정 종료 시 자동 기록(LOT·호기 포함)' }, { field: '작업지시·LOT', from: '작업지시관리', desc: '작업지시 선택 시 자동' }, { field: '양품수량', from: '계산값', desc: '생산수량 − 불량수량' }, { field: 'SQ 지표', from: 'SQ 지표 리포트', desc: 'PPM·시간당 생산량 산출 원천' }],
    dropdowns: [{ field: '작업지시', source: 'work_orders', values: '등록 작업지시' }, { field: '공정', source: 'processes', values: '등록 공정' }, { field: '설비(호기)', source: 'equipments', values: '등록 설비' }, { field: '작업자', source: 'users', values: '사용자' }],
    search: ['실적일 기간 조회', '검색: 실적번호·작업지시·LOT·품목·작업자'], sort: '실적일 내림차순',
    columns: ['실적번호', '실적일', '작업지시', 'LOT', '품명', '공정', '호기', '생산', '불량', '양품(자동)', '재작업', '양품률', '작업자'],
    feats: [['양품 자동집계', '생산수량·불량수량 입력 시 양품수량 자동 계산(읽기전용) — 현장 입력 최소화']] }),
  S({ id: 'daily', title: '생산일보', group: '생산관리', path: '/production/daily', type: 'daily',
    purpose: '일자별 생산실적 자동 집계. 작업지시·생산수량·불량수량·작업시간 입력 시 나머지 자동 반영.',
    relations: [{ field: '집계 원천', from: '생산실적', desc: '해당 일자 실적 집계' }, { field: '시간당 생산량', from: '계산값', desc: '양품 ÷ (작업시간/60)' }],
    dropdowns: [{ field: '조회 일자', source: '날짜 선택', values: '일자' }],
    search: ['일자 선택'], sort: '실적 등록순',
    columns: ['작업지시', 'LOT', '품명', '공정', '호기', '작업자', '생산', '불량', '양품(자동)', '작업시간', '재작업', '합계 행'] }),
  S({ id: 'board', title: '생산현황판', group: '생산관리', path: '/production/board', type: 'dashboard',
    purpose: '작업지시 상태를 칸반(대기/작업중/완료/중단)으로 시각화. 금일 실적·설비 가동 요약.',
    relations: [{ field: '카드', from: '작업지시관리', desc: '작업지시 상태별 배치' }, { field: '금일 실적', from: '생산실적', desc: '당일 집계' }, { field: '설비', from: '설비관리', desc: '가동상태' }],
    dropdowns: [], search: ['상태 열별 자동 분류'], sort: '상태별',
    columns: ['(칸반) 대기', '작업중', '완료', '중단', '금일 생산실적', '설비 가동현황'] }),

  // ===== 공구관리 =====
  S({ id: 'tool-stock', title: '공구 재고관리', group: '공구관리', path: '/tool/stocks', type: 'masterDetail',
    purpose: '입고 1개마다 LOT 부여. 단위 LOT 수명·잔여 관리. 입고−출고+회수−폐기로 재고 산출.',
    relations: [{ field: '단위 LOT', from: '공구 입·출고·회수(입고)', desc: '입고수량 1개씩 분해' }, { field: '사용 차감', from: '작업 POP', desc: 'LOT별 사용횟수' }, { field: '수명 기준', from: '공구 기초정보', desc: '최대사용횟수·교체알람횟수' }],
    dropdowns: [], search: ['좌측 검색: 공구코드·공구명'], sort: '공구코드 오름차순',
    columns: ['(좌) 공구·남은수명', '(우) LOT 번호', '입고일', '입고건', '수명(횟수)', '사용', '남은수명', '상태'] }),
  S({ id: 'tool-move', title: '공구 입·출고·회수', group: '공구관리', path: '/tool/movements', type: 'list',
    purpose: '공구 입고(입고검사·단가), 출고(사내 호기별/외주), 회수 이력 관리. 호기별 구분이 필수.',
    relations: [{ field: '공구', from: '공구 기초정보', desc: '공구 선택 시 표준단가·위치 자동' }, { field: '호기', from: '설비관리', desc: '사내 출고/회수 시 설비(호기)' }, { field: '외주처', from: '거래처관리', desc: '외주 출고/회수 시' }, { field: '담당자', from: '사용자관리', desc: '드롭다운' }],
    dropdowns: [{ field: '구분', source: '고정값', values: '입고/출고/회수' }, { field: '공구', source: 'tools', values: '등록 공구' }, { field: '입고검사', source: '고정값', values: '합격/불합격/성적서확인' }, { field: '처구분', source: '고정값', values: '사내/외주' }, { field: '호기', source: 'equipments', values: '등록 설비(호기)' }, { field: '외주처', source: 'partners', values: '외주가공처' }],
    search: ['일자 기간 조회', '필터: 구분·출고/회수처', '칩: 입고/출고/회수', '검색: 관리번호·공구·LOT·호기'], sort: '일자 내림차순',
    columns: ['관리번호', '일자', '구분', '공구코드', '공구명', '공구LOT', '수량', '입고단가', '입고검사', '처구분', '호기', '외주처', '담당자'],
    feats: [['입고검사 기록', '입고 시 체크시트 판정 또는 제작처 성적서 확인 결과와 입고단가를 기록'], ['호기별 출고/회수', '사내는 호기, 외주는 외주처를 지정 — 어느 호기에 투입됐는지 추적']],
    alerts: ['출고·회수 시 처구분(사내/외주)에 따라 호기 또는 외주처 지정 필요'] }),
  S({ id: 'tool-disposal', title: '공구 폐기관리', group: '공구관리', path: '/tool/disposals', type: 'list',
    purpose: '수명초과·파손 공구 폐기. 폐기사유와 사용수명(제품·BOM 연계 계산값)을 기록.',
    relations: [{ field: '공구·수명기준', from: '공구 기초정보', desc: '최대사용횟수 대비 사용수명' }, { field: '사용횟수', from: '작업 POP', desc: 'LOT별 누적 사용' }],
    dropdowns: [{ field: '공구', source: 'tools', values: '등록 공구' }, { field: '폐기사유', source: '고정값', values: '수명초과/파손/마모/기타' }],
    search: ['폐기일 기간 조회', '칩: 폐기사유', '검색: 폐기번호·공구·LOT'], sort: '폐기일 내림차순',
    columns: ['폐기번호', '폐기일', '공구코드', '공구명', '공구LOT', '폐기수량', '폐기사유', '사용수명(횟수)', '담당자', '비고'] }),
  S({ id: 'tool-verify', title: '공구 치수검증', group: '공구관리', path: '/tool/verifications', type: 'list',
    purpose: '공구 교체 전/후 및 교체 후 일정수량 가공품의 치수 검증값을 기록. 품질 안정성 입증 자료.',
    relations: [{ field: '공구·LOT', from: '공구 기초정보/재고', desc: '검증 대상 공구' }, { field: '호기', from: '설비관리', desc: '검증 시점 설비' }, { field: '작업지시', from: '작업지시관리', desc: '해당 LOT 가공품' }, { field: '검증자', from: '사용자관리', desc: '드롭다운' }],
    dropdowns: [{ field: '검증구분', source: '고정값', values: '교체전/교체후/교체후N개' }, { field: '공구', source: 'tools', values: '등록 공구' }, { field: '호기', source: 'equipments', values: '설비(호기)' }, { field: '작업지시', source: 'work_orders', values: '작업지시' }, { field: '판정', source: '고정값', values: 'OK/NG' }],
    search: ['검증일 기간 조회', '필터: 구분·판정', '칩: OK/NG', '검색: 검증번호·공구·호기·작업지시'], sort: '검증일 내림차순',
    columns: ['검증번호', '검증일', '구분', '공구코드', '공구명', '호기', '작업지시', '검증항목', '규격', '공차', '측정값', '판정', '검증자'] }),

  // ===== 품질관리 =====
  S({ id: 'insp-std', title: '검사규격관리', group: '품질관리', path: '/quality/standards', type: 'masterDetail',
    purpose: '상단 큰 탭(수입/공정/출하) + 좌(품목)/우(검사규격). 정량(숫자)·정성(OK/NG) 평가방법 지정. 공정검사는 대상 공정 지정.',
    relations: [{ field: '품목', from: '품목관리', desc: '좌측 목록' }, { field: '대상 공정', from: '표준공정관리', desc: '공정검사 규격의 공정' }, { field: '측정장비', from: '계측기관리', desc: '드롭다운' }, { field: '검사 적용', from: '수입/공정/출하검사', desc: '검사 시 체크시트로 자동 로드' }],
    dropdowns: [{ field: '검사유형', source: '고정값', values: '수입검사/공정검사/출하검사' }, { field: '평가방법', source: '고정값', values: '정량적/정성적' }, { field: '대상 공정', source: 'processes', values: '등록 공정' }, { field: '측정장비', source: 'tools/measuring_instruments', values: '등록 측정기' }],
    search: ['상단 탭: 수입검사/공정검사/출하검사', '좌측 검색: 품목코드·품명'], sort: '기준번호순',
    columns: ['기준번호', '검사항목', '평가방법', '기준/판정', '공차', '검사방법', '측정장비', '사용'],
    feats: [['검사유형 탭', '상단 큰 탭으로 수입/공정/출하 전환(좌·우 전체 필터)'], ['정량 자동판정 기준', '규격값±공차를 등록하면 검사 시 측정값으로 OK/NG 자동 판정 + Cpk 산출 근거']],
    alerts: ['공정 체크시트의 MES 탑재 범위는 품질팀 협의 후 확정(미확정 사항)'] }),
  S({ id: 'insp-in', title: '수입검사', group: '품질관리', path: '/quality/incoming', type: 'inspect',
    purpose: '자재입고관리에서 입고완료된 건을 대상으로, 행별 [수입검사] 버튼으로 검사규격 기반 검사를 진행.',
    process: ['입고완료 입고 표시(미검사)', '[수입검사] 버튼', '검사규격 항목 평가(정량/정성)', '합격/불합격 저장'],
    relations: [
      { field: '대상 리스트', from: '자재입고관리', desc: '입고완료된 입고 건만 표시' },
      { field: '검사규격', from: '검사규격관리(수입검사)', desc: '품목 기준 자동 로드' },
      { field: '입고정보(거래처·LOT·수량)', from: '자재입고관리', desc: '선택 입고 건에서 자동' },
      { field: '불합격 연계', from: '부적합관리', desc: '수입부적합 등록' },
    ],
    dropdowns: [{ field: '검사자', source: 'users', values: '등록 사용자' }],
    search: ['입고일 기간 조회', '상태칩: 전체/미검사/검사완료', '검색: 입고번호·거래처·품명·LOT'], sort: '미검사 우선',
    columns: ['입고번호', '입고일', '거래처', '품명', 'LOT', '수량', '검사상태', '검사일', '검사(버튼)'],
    alerts: ['입고완료 건만 대상(입고대기는 미표시)', '기간검색은 입고일 기준'] }),
  S({ id: 'insp-in-status', title: '수입검사현황', group: '품질관리', path: '/quality/incoming-status', type: 'chart',
    purpose: '수입검사를 기간·조건별 그래프로. 지표=검사건수.',
    relations: [{ field: '데이터', from: '수입검사', desc: 'incoming_inspections 집계' }],
    dropdowns: [{ field: '판정', source: '데이터', values: '합격/불합격/조건부' }, { field: '거래처', source: '데이터', values: '거래처' }],
    search: ['기간(검사일) 조회', '조건: 판정·거래처'], sort: '-',
    columns: ['통계(검사/합격/불합격/합격률)', '추이', '판정·거래처·품목 도넛'] }),
  S({ id: 'insp-proc', title: '공정검사', group: '품질관리', path: '/quality/process', type: 'inspect',
    purpose: '작업지시(공정)를 대상으로 공정(중간)검사를 진행. 기존 MES에 부재하던 기능으로 SQ 심사 대응 필수. 측정값은 Cpk 산출 근거가 됩니다.',
    process: ['[신규 검사] 클릭', '작업지시 선택(품목·LOT·공정·호기 자동)', '검사규격(공정검사) 항목 평가', '합격/불합격 저장 → 측정값 축적'],
    relations: [
      { field: '검사 대상', from: '작업지시관리', desc: '작업지시 선택 시 품목·LOT·공정·호기 자동' },
      { field: '검사규격', from: '검사규격관리(공정검사)', desc: '품목·공정 기준 자동 로드' },
      { field: '측정값 축적', from: 'SQ 지표 리포트', desc: 'Cpk(공정능력) 산출 원천' },
      { field: '불합격 연계', from: '부적합관리', desc: '공정부적합 등록' },
    ],
    dropdowns: [{ field: '작업지시', source: 'work_orders', values: '등록 작업지시' }, { field: '검사자', source: 'users', values: '등록 사용자' }],
    search: ['검사일 기간 조회', '상태칩: 전체/합격/불합격/조건부합격', '검색: 검사번호·작업지시·품목·공정'], sort: '검사일 내림차순',
    columns: ['검사번호', '검사일', '공정', '작업지시/LOT', '품명', '검사수량', '양품', '불량', '검사자', '판정'],
    alerts: ['SQ 심사 대응을 위해 공정별 정량 측정값을 지속 축적해야 Cpk 산출 가능'] }),
  S({ id: 'insp-out', title: '출하검사', group: '품질관리', path: '/quality/shipping', type: 'inspect',
    purpose: '생산완료 수주 리스트 + 행별 [출하검사] 버튼. 검사규격 기반 평가. 납품상태 표시.',
    process: ['생산완료 수주 표시(미검사)', '[출하검사] 버튼', '검사규격 항목 평가', '합격/불합격 저장'],
    relations: [{ field: '대상', from: '수주/작업지시', desc: '생산완료 건만' }, { field: '검사규격', from: '검사규격관리(출하)', desc: '품목 기준 자동' }, { field: '납품상태', from: '출하(납품)관리', desc: '납품완료 여부' }],
    dropdowns: [{ field: '검사자', source: 'users', values: '사용자' }],
    search: ['검사일 기간 조회', '칩: 전체/미검사/검사완료', '검색: 수주번호·거래처·품명'], sort: '미검사 우선',
    columns: ['수주번호', '거래처', '품명', '수량', '검사상태', '납품상태', '검사일', '검사(버튼)'],
    alerts: ['기간 지정 시 해당 기간 검사완료 건만 표시'] }),
  S({ id: 'insp-out-status', title: '출하검사현황', group: '품질관리', path: '/quality/shipping-status', type: 'chart',
    purpose: '출하검사를 기간·조건별 그래프로. 지표=검사건수.',
    relations: [{ field: '데이터', from: '출하검사', desc: 'shipping_inspections 집계' }],
    dropdowns: [{ field: '판정', source: '데이터', values: '합격/불합격/조건부' }, { field: '거래처', source: '데이터', values: '거래처' }],
    search: ['기간(검사일) 조회', '조건: 판정·거래처'], sort: '-',
    columns: ['통계(검사/합격/불합격/합격률)', '추이', '판정·거래처·품목 도넛'] }),
  S({ id: 'ncr', title: '부적합관리', group: '품질관리', path: '/quality/nonconformance', type: 'list',
    purpose: '공정·수입·출하 부적합과 고객 클레임을 통합 관리. 원인·귀책부서·처리방안·클레임금액 기록. (기존 클레임관리 데이터 항목 수용)',
    relations: [{ field: '품명', from: '품목관리', desc: '품목 선택' }, { field: '발생공정', from: '표준공정관리', desc: '공정 드롭다운' }, { field: 'LOT', from: '작업지시관리', desc: '발생 LOT(추적성)' }, { field: '귀책부서', from: '부서관리', desc: '드롭다운' }, { field: '고객사', from: '거래처관리', desc: '클레임 고객사' }, { field: '개선대책', from: '개선대책관리', desc: '부적합 연계 대책 수립' }],
    dropdowns: [{ field: '부적합 구분', source: '고정값', values: '공정부적합/수입부적합/출하부적합/고객클레임' }, { field: '불량유형', source: '공통코드(DEFECT_TYPE)', values: '치수불량/외관불량/가공불량/용접불량 등' }, { field: '조치구분', source: '고정값', values: '폐기/재작업/특채/반품' }, { field: '상태', source: '고정값', values: '처리중/완료' }],
    search: ['발생일 기간 조회', '필터: 구분·조치·상태', '칩: 처리중/완료', '검색: 부적합번호·공정·품목·LOT'], sort: '발생일 내림차순',
    columns: ['부적합번호', '발생일', '구분', '발생공정', '품명', 'LOT', '불량유형', '수량', '귀책부서', '클레임금액', '조치', '상태'],
    feats: [['일괄 처리완료', '행 다중선택 → [처리완료]로 일괄 상태 변경']] }),
  S({ id: 'ncr-status', title: '부적합현황', group: '품질관리', path: '/quality/ncr-status', type: 'chart',
    purpose: '부적합을 발생일·공정·작업자·조치·유형별 그래프로. 지표=부적합수량.',
    relations: [{ field: '데이터', from: '부적합관리', desc: 'nonconformances 집계' }],
    dropdowns: [], search: ['기간(발생일) 조회'], sort: '-',
    columns: ['통계(건수/수량/처리중/완료)', '발생일 추이', '공정·작업자·조치·유형 도넛'] }),
  S({ id: 'improve', title: '개선대책관리', group: '품질관리', path: '/quality/improvements', type: 'list',
    purpose: '부적합에 대한 시정·예방조치 대책과 효과확인을 관리. SQ 심사 개선 프로세스 입증 자료.',
    relations: [{ field: '연계 부적합', from: '부적합관리', desc: '부적합 선택 시 제목 자동 생성' }, { field: '담당자', from: '사용자관리', desc: '드롭다운' }],
    dropdowns: [{ field: '연계 부적합', source: 'nonconformances', values: '등록 부적합' }, { field: '구분', source: '고정값', values: '시정조치/예방조치' }, { field: '담당자', source: 'users', values: '사용자' }, { field: '상태', source: '고정값', values: '진행중/완료/지연' }],
    search: ['등록일 기간 조회', '필터: 구분·상태', '칩: 진행중/완료/지연', '검색: 대책번호·부적합번호·제목'], sort: '등록일 내림차순',
    columns: ['대책번호', '등록일', '부적합번호', '제목', '구분', '담당자', '완료예정', '완료일', '상태'],
    feats: [['원인분석·대책·효과확인', '원인분석 → 대책 → 효과확인 3단계를 한 화면에서 기록']] }),

  // ===== 변경/개발관리 =====
  S({ id: 'fourm', title: '4M 변경관리', group: '변경/개발관리', path: '/dev/four-m', type: 'list',
    purpose: 'Man·Machine·Material·Method 변경 이력과 승인 절차를 관리. PPAP 제출 대상 여부 판정.',
    relations: [{ field: '품목·공정', from: '품목/표준공정관리', desc: '변경 대상' }, { field: 'PPAP', from: 'PPAP 승인관리', desc: 'PPAP 대상 시 연계 제출' }, { field: '승인자', from: '사용자관리', desc: '드롭다운' }],
    dropdowns: [{ field: '4M 구분', source: '고정값', values: 'Man/Machine/Material/Method' }, { field: '품목', source: 'items', values: '등록 품목' }, { field: '공정', source: 'processes', values: '등록 공정' }, { field: '상태', source: '고정값', values: '신청/검토중/승인/반려' }],
    search: ['변경일 기간 조회', '필터: 구분·상태', '칩: 신청/검토중/승인/반려', '검색: 변경번호·품목·공정'], sort: '변경일 내림차순',
    columns: ['변경번호', '변경일', '4M 구분', '품명', '공정', '변경사유', 'PPAP 대상', '승인자', '상태'],
    feats: [['변경 전/후 기록', '변경 전·후 내용을 대비해 기록하고 품질영향을 통제']] }),
  S({ id: 'ppap', title: 'PPAP 승인관리', group: '변경/개발관리', path: '/dev/ppap', type: 'list',
    purpose: '고객 PPAP 제출·승인 절차를 관리. 제출 Level·서류 목록·승인 결과 기록.',
    relations: [{ field: '고객사', from: '거래처관리', desc: '매출처 드롭다운' }, { field: '품목', from: '품목관리', desc: '드롭다운' }, { field: '연계 4M', from: '4M 변경관리', desc: '4M 변경 사유 제출 시' }],
    dropdowns: [{ field: '고객사', source: 'partners', values: '거래처' }, { field: '품목', source: 'items', values: '품목' }, { field: '제출 Level', source: '고정값', values: 'Level 1~5' }, { field: '제출사유', source: '고정값', values: '신규부품/4M변경/설계변경/공정변경/기타' }, { field: '연계 4M', source: 'four_m_changes', values: '등록 4M 변경' }, { field: '상태', source: '고정값', values: '작성중/제출/승인/반려' }],
    search: ['제출일 기간 조회', '필터: Level·상태', '칩: 작성중/제출/승인/반려', '검색: PPAP번호·고객사·품목'], sort: '제출일 내림차순',
    columns: ['PPAP번호', '제출일', '고객사', '품명', 'Level', '제출사유', '4M변경', '승인일', '상태'] }),
  S({ id: 'devdoc', title: '개발문서관리', group: '변경/개발관리', path: '/dev/docs', type: 'list',
    purpose: 'PFMEA·PFD·관리계획서·작업표준서를 개정(Rev) 이력과 함께 통합 관리. 문서-공정-검사 기준 연계.',
    relations: [{ field: '품목·공정', from: '품목/표준공정관리', desc: '문서 적용 대상' }, { field: '작성·승인자', from: '사용자관리', desc: '드롭다운' }, { field: '공정 운영 연계', from: '작업 POP', desc: '작업표준서 기반 작업' }],
    dropdowns: [{ field: '문서유형', source: '고정값', values: 'PFMEA/PFD/관리계획서/작업표준서' }, { field: '품목', source: 'items', values: '품목' }, { field: '공정', source: 'processes', values: '공정' }, { field: '상태', source: '고정값', values: '작성중/승인/개정/폐기' }],
    search: ['작성일 기간 조회', '필터: 문서유형·상태', '칩: 문서유형', '검색: 문서번호·품목·제목'], sort: '작성일 내림차순',
    columns: ['문서번호', '유형', '품명', '공정', 'Rev', '제목', '작성자', '작성일', '승인자', '상태'],
    feats: [['개정관리', 'Rev와 상태(작성중/승인/개정/폐기)로 문서 이력을 통제']] }),

  // ===== 계측기관리 =====
  S({ id: 'inst', title: '계측기관리', group: '계측기관리', path: '/measure/instruments', type: 'list',
    purpose: '계측기 등록과 검교정 주기(차기 교정일)를 관리. SQ 측정 신뢰성 요구 대응.',
    relations: [{ field: '관리자', from: '사용자관리', desc: '드롭다운' }, { field: '측정장비 사용', from: '검사규격관리', desc: '검사 항목 측정장비' }, { field: '교정 이력', from: '검교정 이력', desc: '교정 결과·차기일' }],
    dropdowns: [{ field: '관리자', source: 'users', values: '사용자' }, { field: '상태', source: '고정값', values: '정상/교정중/수리중/폐기' }],
    search: ['검색: 계측기코드·명·모델·시리얼', '필터·칩: 상태'], sort: '계측기코드 오름차순',
    columns: ['계측기코드', '계측기명', '모델', '시리얼', '측정범위', '주기(개월)', '최근교정', '차기교정', '관리자', '상태'],
    feats: [['교정 임박·초과 표시', '차기 교정일이 지났으면 빨강 배지, 30일 이내는 통계 카드로 경고']] }),
  S({ id: 'calib', title: '검교정 이력', group: '계측기관리', path: '/measure/calibrations', type: 'list',
    purpose: '계측기 검교정·수리 이력과 성적서를 관리.',
    relations: [{ field: '계측기', from: '계측기관리', desc: '계측기 선택 시 명칭 자동' }],
    dropdowns: [{ field: '계측기', source: 'measuring_instruments', values: '등록 계측기' }, { field: '구분', source: '고정값', values: '사내교정/외부교정/수리' }, { field: '결과', source: '고정값', values: '합격/불합격/조정후합격' }],
    search: ['교정일 기간 조회', '필터: 구분·결과', '칩: 결과', '검색: 교정번호·계측기·기관·성적서'], sort: '교정일 내림차순',
    columns: ['교정번호', '교정일', '계측기코드', '계측기명', '구분', '교정기관', '결과', '성적서번호', '비용', '차기교정일'] }),
  S({ id: 'grr', title: 'Gauge R&R', group: '계측기관리', path: '/measure/gauge-rr', type: 'list',
    purpose: '계측기 반복성·재현성(%GRR) 평가 관리대장. 평가계획·실시현황을 함께 관리.',
    relations: [{ field: '계측기', from: '계측기관리', desc: '평가 대상' }, { field: '품목', from: '품목관리', desc: '측정 특성 대상' }, { field: '평가자', from: '사용자관리', desc: '드롭다운' }],
    dropdowns: [{ field: '계측기', source: 'measuring_instruments', values: '등록 계측기' }, { field: '품목', source: 'items', values: '품목' }, { field: '평가자', source: 'users', values: '사용자' }, { field: '상태', source: '고정값', values: '계획/진행/완료' }],
    search: ['평가일 기간 조회', '필터: 판정·상태', '칩: 적합/조건부/부적합', '검색: R&R번호·계측기·특성'], sort: '평가일 내림차순',
    columns: ['R&R번호', '평가일', '계측기', '품목', '측정특성', '평가자수', '시료수', '반복수', '%GRR', 'ndc', '판정', '상태'],
    feats: [['판정 자동', '%GRR 입력 시 <10% 적합 / 10~30% 조건부 / >30% 부적합으로 자동 판정']] }),

  // ===== 용접기술관리 =====
  S({ id: 'wps', title: 'WPS 관리', group: '용접기술관리', path: '/weld/wps', type: 'list',
    purpose: '용접절차 시방서(WPS) 등록·개정 관리. 용접법·모재·용가재·전류/전압·자세 등 조건 명세.',
    relations: [{ field: '근거 PQR', from: 'PQR 관리', desc: '인정기록서 연결' }, { field: '작성자', from: '사용자관리', desc: '드롭다운' }, { field: '적용', from: '작업 POP(용접 공정)', desc: '용접 조건 기준' }],
    dropdowns: [{ field: '용접법', source: '고정값', values: 'GTAW(TIG)/GMAW(MIG/MAG)/SMAW/SAW/SPOT/기타' }, { field: '근거 PQR', source: 'pqr_docs', values: '등록 PQR' }, { field: '상태', source: '고정값', values: '작성중/승인/개정/폐기' }],
    search: ['필터: 용접법·상태', '칩: 상태', '검색: WPS번호·제목·용접법·모재'], sort: 'WPS번호 오름차순',
    columns: ['WPS번호', 'Rev', '제목', '용접법', '모재', '용가재', '전류(A)', '전압(V)', '근거 PQR', '상태'] }),
  S({ id: 'pqr', title: 'PQR 관리', group: '용접기술관리', path: '/weld/pqr', type: 'list',
    purpose: '용접절차 인정기록서(PQR)와 시험 결과(인장·굽힘·침투 등)를 관리.',
    relations: [{ field: 'WPS', from: 'WPS 관리', desc: '인정 대상 절차' }, { field: '시험 용접사', from: '용접사 관리', desc: '드롭다운' }],
    dropdowns: [{ field: '용접법', source: '고정값', values: 'GTAW/GMAW/SMAW/SAW/SPOT/기타' }, { field: '시험 용접사', source: 'welders', values: '등록 용접사' }, { field: '결과', source: '고정값', values: '합격/불합격' }, { field: '상태', source: '고정값', values: '유효/만료/폐기' }],
    search: ['시험일 기간 조회', '필터: 결과·상태', '칩: 합격/불합격', '검색: PQR번호·용접법·용접사·기관'], sort: '시험일 내림차순',
    columns: ['PQR번호', '시험일', '용접법', '모재', '시험 용접사', '시험항목', '시험기관', '결과', '성적서번호', '상태'] }),
  S({ id: 'welder', title: '용접사 관리', group: '용접기술관리', path: '/weld/welders', type: 'list',
    purpose: '용접사 자격·유효기간·갱신 이력을 관리. 자격 만료 임박 자동 경고.',
    relations: [{ field: '부서', from: '부서관리', desc: '드롭다운' }, { field: 'PQR 시험', from: 'PQR 관리', desc: '시험 용접사로 연결' }],
    dropdowns: [{ field: '부서', source: 'departments', values: '등록 부서' }, { field: '인정 용접법', source: '고정값', values: 'GTAW/GMAW/SMAW/SAW/SPOT/기타' }],
    search: ['필터·칩: 상태(유효/만료임박/만료)', '검색: 사번·이름·자격증번호·용접법'], sort: '사번 오름차순',
    columns: ['사번', '이름', '부서', '자격종류', '자격증번호', '인정 용접법', '취득일', '유효기간', '갱신예정', '상태'],
    feats: [['자격 상태 자동판정', '유효기간 기준으로 만료 60일 전 "만료임박", 경과 시 "만료" 자동 설정']] }),

  // ===== Q-Cost관리 =====
  S({ id: 'qcost-item', title: 'Q-Cost 기준항목', group: 'Q-Cost관리', path: '/qcost/items', type: 'list',
    purpose: '예방·평가·내부실패·외부실패 비용의 세부항목과 산출기준을 관리.',
    relations: [{ field: '사용처', from: 'Q-Cost 등록/현황', desc: '월별 비용 등록 시 선택' }],
    dropdowns: [{ field: '분류', source: '고정값', values: '예방비용/평가비용/내부실패비용/외부실패비용' }],
    search: ['필터·칩: 분류', '검색: 항목코드·항목명·산출기준'], sort: '항목코드 오름차순',
    columns: ['항목코드', '분류', '항목명', '산출기준', '사용', '비고'] }),
  S({ id: 'qcost-rec', title: 'Q-Cost 등록/현황', group: 'Q-Cost관리', path: '/qcost/records', type: 'list',
    purpose: '월별 품질비용을 등록하고 분류별(예방·평가·내부/외부실패) 현황을 분석.',
    relations: [{ field: 'Q-Cost 항목', from: 'Q-Cost 기준항목', desc: '항목 선택 시 분류 자동' }, { field: '부서', from: '부서관리', desc: '드롭다운' }],
    dropdowns: [{ field: 'Q-Cost 항목', source: 'qcost_items', values: '등록 기준항목' }, { field: '부서', source: 'departments', values: '부서' }, { field: '작성자', source: 'users', values: '사용자' }],
    search: ['필터·칩: 분류', '검색: 등록번호·귀속월·항목·부서'], sort: '귀속월 내림차순',
    columns: ['등록번호', '귀속월', '분류', '항목코드', '항목명', '금액', '부서', '작성자'],
    feats: [['분류별 합계 카드', '예방·평가·내부실패·외부실패 비용 합계를 카드로 비교']] }),

  // ===== 설비관리(CMS) =====
  S({ id: 'cms-monitor', title: '설비모니터링', group: '설비관리(CMS)', path: '/cms/monitor', type: 'monitor',
    purpose: '설비 가동상태·비가동·알람을 모니터링. PLC 연계 설비는 수집로그(3초 주기)가 자동 반영.',
    relations: [{ field: '설비 목록', from: '설비관리', desc: '호기·PLC 연계 여부' }, { field: '수집 로그', from: 'PLC 게이트웨이', desc: 'equipment_logs 3초 주기 적재' }, { field: '비가동 집계', from: '비가동 실적', desc: '최근 30일 사유별' }, { field: '금일 생산', from: '생산실적', desc: '설비별 당일 생산수량' }],
    dropdowns: [], search: ['자동 갱신(새로고침)'], sort: '설비코드 오름차순',
    columns: ['요약(전체/가동/고장·비가동/비가동시간)', '설비 카드(상태·금일생산·최근수집)', '비가동 사유별 집계', '최근 알람 로그'] }),
  S({ id: 'cms-hist', title: '설비 수리이력', group: '설비관리(CMS)', path: '/cms/histories', type: 'list',
    purpose: '고장수리·예방정비·부품교체 이력과 비용·정지시간을 관리.',
    relations: [{ field: '설비', from: '설비관리', desc: '설비 선택 시 설비명 자동' }, { field: '담당자', from: '사용자관리', desc: '드롭다운' }],
    dropdowns: [{ field: '설비', source: 'equipments', values: '등록 설비' }, { field: '구분', source: '고정값', values: '고장수리/예방정비/부품교체' }],
    search: ['일자 기간 조회', '필터·칩: 구분', '검색: 이력번호·설비·내용'], sort: '일자 내림차순',
    columns: ['이력번호', '일자', '설비코드', '설비명', '구분', '내용', '교체부품', '비용', '정지(분)', '담당자'] }),
  S({ id: 'cms-dtcode', title: '비가동사유 관리', group: '설비관리(CMS)', path: '/cms/downtime-codes', type: 'list',
    purpose: '설비 비가동 사유코드(계획/비계획)를 관리. 비가동 실적 등록의 기준.',
    relations: [{ field: '사용처', from: '비가동 실적', desc: '사유 드롭다운' }],
    dropdowns: [{ field: '분류', source: '고정값', values: '계획/비계획' }],
    search: ['필터·칩: 분류', '검색: 사유코드·사유명'], sort: '사유코드 오름차순',
    columns: ['사유코드', '사유명', '분류', '사용', '비고'] }),
  S({ id: 'cms-dt', title: '비가동 실적', group: '설비관리(CMS)', path: '/cms/downtimes', type: 'list',
    purpose: '설비별 비가동 발생 내역과 시간을 관리. 가동률·보전지표 산출 기초.',
    relations: [{ field: '설비', from: '설비관리', desc: '설비 선택 시 설비명 자동' }, { field: '비가동사유', from: '비가동사유 관리', desc: '사유 선택 시 사유명 자동' }, { field: '집계', from: '설비모니터링', desc: '30일 사유별 집계' }],
    dropdowns: [{ field: '설비', source: 'equipments', values: '등록 설비' }, { field: '비가동사유', source: 'downtime_codes', values: '등록 사유' }, { field: '담당자', source: 'users', values: '사용자' }],
    search: ['발생일 기간 조회', '검색: 번호·설비·사유'], sort: '발생일 내림차순',
    columns: ['번호', '발생일', '설비코드', '설비명', '비가동사유', '시간(분)', '담당자', '비고'] }),
  S({ id: 'cms-check', title: '설비점검', group: '설비관리(CMS)', path: '/cms/checks', type: 'list',
    purpose: '일상·주간·월간 설비점검 결과를 관리. 예방정비 계획의 기초.',
    relations: [{ field: '설비·점검주기', from: '설비관리', desc: '설비 선택 시 자동' }, { field: '점검자', from: '사용자관리', desc: '드롭다운' }, { field: '불량 발견 시', from: '설비 수리이력', desc: '수리 이력 등록 연계' }],
    dropdowns: [{ field: '설비', source: 'equipments', values: '등록 설비' }, { field: '점검주기', source: '고정값', values: '일상/주간/월간' }, { field: '결과', source: '고정값', values: '양호/불량/조치완료' }],
    search: ['점검일 기간 조회', '필터: 주기·결과', '칩: 결과', '검색: 점검번호·설비·항목'], sort: '점검일 내림차순',
    columns: ['점검번호', '점검일', '설비코드', '설비명', '주기', '점검항목', '결과', '점검자', '비고'] }),

  // ===== SQ 리포트 =====
  S({ id: 'sq-report', title: 'SQ 지표 리포트', group: 'SQ 리포트', path: '/sq/report', type: 'report',
    purpose: '2026년 11월 SQ 심사에 요구되는 품질 수치(불량률 PPM, 시간당 생산량, 검사합격률, 공정능력 Cpk)를 실적 데이터 기반으로 자동 산출.',
    process: ['생산실적·검사 데이터 축적', '지표 자동 산출', '목표 대비 달성 여부 확인', '심사 제출용 인쇄'],
    relations: [
      { field: '불량률(PPM)·시간당 생산량', from: '생산실적', desc: '생산·불량·양품·작업시간 집계' },
      { field: '검사 합격률', from: '수입/공정/출하검사', desc: '판정 결과 집계' },
      { field: '공정능력(Cpk)', from: '검사 항목별 측정값', desc: '정량 측정값 5건 이상 항목' },
      { field: 'KPI 목표', from: '사업계획서', desc: '12,000PPM · 170EA/h' },
    ],
    dropdowns: [], search: ['전체 누적 데이터 자동 산출'], sort: 'Cpk 오름차순(취약 항목 우선)',
    columns: ['공정 불량률(PPM)', '시간당 생산량(EA/h)', '검사 합격률', '총 생산수량', '월별 PPM 추이', '검사유형별 합격률', 'Cpk 표(품목·항목·평균·σ·Cpk·평가)'],
    alerts: ['Cpk는 검사규격에 공차가 등록되고 측정값이 5건 이상인 항목만 산출', 'PPM 목표(12,000) 초과 시 빨강 표시'] }),
  S({ id: 'lot-trace', title: 'LOT 추적', group: 'SQ 리포트', path: '/sq/lot-trace', type: 'trace',
    purpose: 'LOT No.(작업지시 기준)로 원소재 투입 → 공정 → 검사 → 출하 전 구간을 정·역방향 추적. 클레임 발생 시 영향범위 분석.',
    process: ['LOT No. 입력 또는 최근 LOT 선택', '제조이력 타임라인 조회', '문제 공정·자재 LOT 특정', '영향범위(동일 자재 LOT 사용 건) 확인'],
    relations: [
      { field: '작업지시·LOT', from: '작업지시관리', desc: 'LOT No. 기준 조회' },
      { field: '수주·생산계획', from: '수주/생산계획관리', desc: '상위 문서 추적' },
      { field: '투입 자재 LOT', from: '자재반출관리', desc: '원소재 역추적' },
      { field: '공정 진행', from: '작업 POP', desc: '공정별 실적·설비·작업자' },
      { field: '검사·부적합', from: '공정검사/부적합관리', desc: '품질 이력' },
      { field: '출하', from: '출하검사/출하(납품)관리', desc: '최종 납품처' },
    ],
    dropdowns: [{ field: '최근 LOT', source: 'work_orders', values: '최근 작업지시 LOT' }],
    search: ['LOT No. 또는 작업지시번호 입력 → [추적]'], sort: '공정 흐름순',
    columns: ['타임라인(수주·계획·작업지시·자재투입·공정·실적·검사·부적합·출하)'] }),
];

const SCREEN_BY_TITLE = {}; SCREENS.forEach(s => { SCREEN_BY_TITLE[s.title] = s.id; });
function b(n) { return `<span class="wf-badge">${n}</span>`; }

// 유형별 기본 프로세스 (screen.process 없으면 사용)
const TYPE_PROC = {
  list: ['목록 조회/검색', '신규등록 또는 행 선택', '입력·처리', '저장 → 목록 갱신'],
  masterDetail: ['좌측 항목 선택', '우측 상세 확인', '등록/처리', '저장 → 갱신'],
  chart: ['기간·조건 설정', '조회', '추이·분류 그래프 분석', '그래프 클릭 → 목록 확인'],
  inspect: ['검사 대상 확인(미검사)', '[검사] 버튼', '검사규격 항목 평가', '판정 자동 → 저장'],
  pop: ['작업지시 카드 선택', '공정 시작(작업자·설비)', '자재·공구 투입', '공정 종료 → 실적 자동등록'],
  dashboard: ['로그인', '현황 자동 집계', '상세 메뉴로 이동'],
  report: ['데이터 축적', '지표 자동 산출', '목표 대비 확인', '인쇄·제출'],
  daily: ['일자 선택', '실적 자동 집계', '합계 확인', '인쇄'],
  monitor: ['설비·PLC 등록', '수집로그 자동 적재', '가동/알람 모니터링', '비가동 분석'],
  trace: ['LOT 입력/선택', '이력 검색', '타임라인 확인', '영향범위 분석'],
};

// ---------- 렌더 헬퍼 ----------
function flowRow(steps, tone) {
  return `<div class="spec-flow">${steps.map((s, i) => {
    const id = SCREEN_BY_TITLE[s];
    return `<span class="spec-flow__step spec-flow__step--${tone} ${id ? 'is-link' : ''}" ${id ? `data-goto="${id}"` : ''}>${escapeHtml(s)}</span>` + (i < steps.length - 1 ? `<span class="spec-flow__arrow">${icon('chevronRight', 16)}</span>` : '');
  }).join('')}</div>`;
}
function specTable(headers, rows) {
  if (!rows.length) return `<div class="muted" style="padding:8px 2px">해당 없음</div>`;
  return `<div class="table-wrap"><table class="grid"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// ---------- 화면설계서 홈 ----------
export async function designSpecHome(root) {
  const groups = {};
  for (const s of SCREENS) (groups[s.group] ??= []).push(s);
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>화면설계서</h1><p>(주)민선 MES·QMS의 전체 시스템 프로세스와 <b>${SCREENS.length}개 전 화면</b>의 설계 명세(미리보기·기능·데이터연관성·드롭리스트·조회조건·예외처리)를 제공합니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="spec-print">${icon('fileText', 16)} 인쇄</button>
        <a class="btn btn--primary" href="#/dashboard">${icon('logout', 16)} 시스템으로</a>
      </div>
    </div>
    <div class="card" style="margin-bottom:18px"><div class="card__head">${icon('route', 18)}<h3>전체 시스템 프로세스</h3></div>
      <div class="card__body flex-col" style="gap:16px">
        ${SYSTEM_FLOWS.map(f => `<div><div class="spec-flow-label">${escapeHtml(f.label)}</div>${flowRow(f.steps, f.tone)}</div>`).join('')}
        <div class="muted" style="font-size:12px">※ 박스를 클릭하면 해당 화면 설계서로 이동합니다.</div>
      </div></div>
    ${Object.entries(groups).map(([g, list]) => `
      <div class="card" style="margin-bottom:16px"><div class="card__head">${icon('database', 18)}<h3>${escapeHtml(g)} <span class="muted" style="font-weight:600">${list.length}</span></h3></div>
        <div class="card__body"><div class="spec-grid">
          ${list.map(s => `<button class="spec-card" data-goto="${s.id}">
            <div class="spec-card__title">${escapeHtml(s.title)}</div>
            <div class="spec-card__desc">${escapeHtml(s.purpose)}</div>
            <div class="spec-card__more">${icon('fileText', 13)} 설계서 보기</div></button>`).join('')}
        </div></div></div>`).join('')}`;
  root.querySelector('#spec-print').onclick = () => window.print();
  root.querySelectorAll('[data-goto]').forEach(el => el.onclick = () => { location.hash = `#/spec/view?id=${el.dataset.goto}`; });
}

// ---------- 화면별 설계서 ----------
export async function designSpecDetail(root, params) {
  const s = SCREENS.find(x => x.id === params.id) || SCREENS[0];
  const idx = SCREENS.findIndex(x => x.id === s.id);
  const prev = SCREENS[idx - 1], next = SCREENS[idx + 1];
  const tpl = TYPE[s.type] || TYPE.list;

  // 기능설명 = 유형 기본기능(번호) + 화면 추가기능
  const baseFeats = tpl.feats.map(([t, d], i) => ({ n: i + 1, t, d }));
  const extraFeats = (s.feats || []).map(([t, d], i) => ({ n: baseFeats.length + i + 1, t, d, extra: true }));
  const feats = [...baseFeats, ...extraFeats];
  // 예외처리 = 유형 + 화면
  const alerts = [...(tpl.alerts || []), ...(s.alerts || [])];
  // 기본조건 = 정렬 + 유형 기본
  const defs = [s.sort ? `정렬 기본: ${s.sort}` : null, ...(tpl.defs || []), ...(s.defs || [])].filter(Boolean);

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text">
        <div class="muted" style="font-size:12.5px;margin-bottom:2px">${escapeHtml(s.group)} · ${escapeHtml(s.type)}형</div>
        <h1>${escapeHtml(s.title)} <span class="muted" style="font-size:14px;font-weight:600">설계서</span></h1>
        <p>${escapeHtml(s.purpose)}</p>
      </div>
      <div class="page-head__actions">
        <a class="btn" href="#/spec">${icon('grid', 16)} 목록</a>
        <button class="btn" id="spec-print">${icon('fileText', 16)} 인쇄</button>
        <a class="btn btn--primary" href="#${s.path}">${icon('monitor', 16)} 실제 화면 열기</a>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px"><div class="card__head">${icon('monitor', 18)}<h3>화면 미리보기 · 기능 설명</h3></div>
      <div class="card__body">
        <div class="grid-2" style="align-items:start">
          <div class="wf wf--${escapeHtml(s.type)}">${tpl.wf()}</div>
          <div>${specTable(['№', '기능', '설명'], feats.map(f => [`<span class="spec-num">${f.n}</span>`, `<b>${escapeHtml(f.t)}</b>${f.extra ? ' <span class="badge badge--info" style="height:18px">화면 고유</span>' : ''}`, escapeHtml(f.d)]))}</div>
        </div>
      </div></div>

    <div class="card" style="margin-bottom:16px"><div class="card__head">${icon('activity', 18)}<h3>화면 프로세스</h3></div>
      <div class="card__body">${flowRow(s.process || TYPE_PROC[s.type] || [], 'brand')}</div></div>

    <div class="grid-2" style="margin-bottom:16px">
      <div class="card"><div class="card__head">${icon('layers', 18)}<h3>데이터 연관성 (타 화면 연동)</h3></div>
        <div class="card__body">${specTable(['항목', '가져오는 곳', '설명'], (s.relations || []).map(r => [`<b>${escapeHtml(r.field)}</b>`, `<span class="badge badge--info">${escapeHtml(r.from)}</span>`, escapeHtml(r.desc)]))}</div></div>
      <div class="card"><div class="card__head">${icon('sliders', 18)}<h3>드롭리스트 구성</h3></div>
        <div class="card__body">${specTable(['항목', '데이터 출처', '값/구성'], (s.dropdowns || []).map(d => [`<b>${escapeHtml(d.field)}</b>`, `<span class="cell-code">${escapeHtml(d.source)}</span>`, escapeHtml(d.values)]))}</div></div>
    </div>

    <div class="grid-2" style="margin-bottom:16px">
      <div class="card"><div class="card__head">${icon('search', 18)}<h3>조회조건 · 기본조건</h3></div>
        <div class="card__body">
          <div class="muted" style="font-weight:700;font-size:12px;margin-bottom:5px">조회조건</div>
          <ul class="spec-list">${(s.search || []).map(x => `<li>${icon('chevronRight', 13)} ${escapeHtml(x)}</li>`).join('')}</ul>
          <div class="muted" style="font-weight:700;font-size:12px;margin:12px 0 5px">기본(디폴트) 조건</div>
          <ul class="spec-list">${defs.map(x => `<li>${icon('check', 13)} ${escapeHtml(x)}</li>`).join('')}</ul>
        </div></div>
      <div class="card"><div class="card__head">${icon('grid', 18)}<h3>컬럼 구성</h3></div>
        <div class="card__body"><div class="spec-cols">${(s.columns || []).map(c => `<span class="spec-col">${escapeHtml(c)}</span>`).join('')}</div></div></div>
    </div>

    <div class="card" style="margin-bottom:16px"><div class="card__head">${icon('alert', 18)}<h3>예외처리 (Alert · 검증)</h3></div>
      <div class="card__body"><ul class="spec-list spec-list--alert">${alerts.map(a => `<li>${icon('alert', 13)} ${escapeHtml(a)}</li>`).join('')}</ul></div></div>

    <div class="flex between" style="margin-top:6px">
      ${prev ? `<button class="btn" data-goto="${prev.id}">${icon('chevronLeft', 16)} ${escapeHtml(prev.title)}</button>` : '<span></span>'}
      ${next ? `<button class="btn" data-goto="${next.id}">${escapeHtml(next.title)} ${icon('chevronRight', 16)}</button>` : '<span></span>'}
    </div>`;
  root.querySelector('#spec-print').onclick = () => window.print();
  root.querySelectorAll('[data-goto]').forEach(el => el.onclick = () => { location.hash = `#/spec/view?id=${el.dataset.goto}`; });
}
