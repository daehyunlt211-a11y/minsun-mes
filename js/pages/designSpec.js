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
  { label: '공구 및 툴 흐름', tone: 'amber', steps: ['기준정보등록', '입고관리', '재고관리', '출고·회수관리', '치수검증', '재고조정', '폐기관리'] },
  { label: '검사 흐름 (SQ 심사 대응)', tone: 'violet', steps: ['검사규격관리', '수입검사관리', '공정검사관리', '출하검사관리'] },
  { label: '부적합 → 개선 흐름', tone: 'violet', steps: ['부적합관리', '개선대책관리', 'Q-Cost 관리'] },
  { label: '개발문서 4단계 흐름 (공정번호로 연결)', tone: 'brand', steps: ['PFD (공정흐름도)', 'PFMEA', '관리계획서', '작업표준서', '개발문서 정합성 점검'] },
  { label: '변경관리 흐름', tone: 'brand', steps: ['4M 관리', '개발문서 정합성 점검', 'PPAP 승인관리'] },
  { label: '계측기 · 측정 신뢰성', tone: 'green', steps: ['계측기 관리', '검교정 관리', 'R&R 관리대장', 'R&R 평가계획', 'R&R 평가등록', 'R&R 실시현황'] },
  { label: '용접기술 흐름', tone: 'amber', steps: ['인정기록서(PQR)', '용접절차 시방서(WPS)', '용접사 관리'] },
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
  analysis: {
    feats: [
      ['대상 선택', '품목(또는 전체)을 선택하고 [점검]으로 자동 진단을 실행합니다.'],
      ['최신본 자동 수집', '대상별 최신 문서(승인본 우선, 최고 개정)를 자동으로 수집합니다.'],
      ['교차 대조', '문서 간 항목을 자동 대조하여 누락·불일치를 검출합니다.'],
      ['반영 현황 매트릭스', '기준 키(공정번호)를 행, 문서를 열로 하는 매트릭스로 누락 위치를 시각화합니다.'],
      ['심각도 분류', '높음/중간/낮음으로 구분하여 조치 우선순위를 제시합니다.'],
      ['바로가기·내보내기', '지적 항목에서 해당 화면으로 이동하고 결과를 CSV로 내보냅니다.'],
    ],
    alerts: ['대상 데이터 없음 → "점검할 문서가 없습니다" 안내', '문서 미작성·미승인 시 별도 경고 항목으로 표시'],
    defs: ['대상 기본: 전체 품목', '문서 선정: 승인본 우선 → 최고 개정', '심각도 정렬: 높음 우선'],
    wf: () => `
      <div class="wf-bar wf-bar--head">${b(1)}<b>정합성 점검</b><span class="wf-r">품목 ▾ · [점검] · ${b(6)} CSV</span></div>
      <div class="wf-stats">${b(5)}<span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span><span class="wf-st"></span></div>
      <div class="wf-grid"><div class="wf-gh">${b(2)} 품목 · 문서별 개정/상태</div><div class="wf-gr">PFD ▸ PFMEA ▸ 관리계획서 ▸ 작업표준서</div></div>
      <div class="wf-grid"><div class="wf-gh">${b(4)} 공정번호별 반영 현황 매트릭스</div><div class="wf-gr">10 · ○ ○ ○ ✕</div><div class="wf-gr">20 · ○ ✕ ✕ ✕</div></div>
      <div class="wf-grid"><div class="wf-gh">${b(3)} 지적 예상 항목</div><div class="wf-gr">심각도 · 구분 · 내용<span class="wf-r">문서 이동 ▸</span></div></div>`,
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

  // ===== 공구 및 툴관리 =====
  S({ id: 'tool-master', title: '기준정보등록', group: '공구 및 툴관리', path: '/tool/master', type: 'masterDetail',
    purpose: '공구·치공구 코드를 등록하고 적용 품목·공정·설비, 기준수명(횟수/수량/시간), 점검주기, QR코드를 관리.',
    process: ['공구 등록(코드 자동채번)', '적용 품목·공정·설비 다중선택', '기준수명·점검주기 설정', 'QR코드 자동생성·출력'],
    relations: [{ field: '적용 품목', from: '품목관리', desc: '다중선택' }, { field: '적용 공정', from: '표준공정관리', desc: '다중선택 — POP 공구투입 대상' }, { field: '적용 설비', from: '설비관리', desc: '다중선택(호기)' }],
    dropdowns: [{ field: '구분', source: '고정값', values: '공구/치공구/지그/게이지' }, { field: '수명 단위', source: '고정값', values: '횟수/수량/시간' }, { field: '점검주기', source: '고정값', values: '일상/주간/월간/분기/반기' }, { field: '적용 품목·공정·설비', source: 'items/processes/equipments', values: '등록 데이터(다중)' }],
    search: ['검색: 공구코드·공구명·규격·제조사', '필터: 구분·사용상태'], sort: '공구코드 오름차순',
    columns: ['사진', '공구코드', '공구명', '구분', '규격', '적용품목', '기준수명', '점검주기', '보관위치', '상태'],
    feats: [['QR코드 발행', '공구코드 기반 QR을 자동 생성하고 개별·일괄 라벨을 출력'], ['유사 공구 복사등록', '기존 공구를 복사해 규격만 수정 등록'], ['우측 상세', '사진·QR·적용대상·수명·LOT 체계를 한 화면에 표시']],
    alerts: ['공구코드 중복 시 등록 불가', '수명 미설정(0) 시 "관리 안함"으로 표시'],
    sq: ['공구 및 치공구 식별', '적용품목·공정 관리', '기준수명 및 점검기준', '보관위치와 상태 관리'] }),
  S({ id: 'tool-in', title: '입고관리', group: '공구 및 툴관리', path: '/tool/inbounds', type: 'list',
    purpose: '공구 입고를 등록. 제조번호·관리번호(LOT)·입고검사 결과·입고단가를 관리하고 QR 라벨을 출력.',
    relations: [{ field: '공구', from: '기준정보등록', desc: '선택 시 규격·표준단가·보관위치 자동' }, { field: '거래처', from: '거래처관리', desc: '드롭다운' }, { field: '재고 반영', from: '재고관리', desc: '입고 시 재고 자동 증가' }],
    dropdowns: [{ field: '공구', source: 'tools', values: '등록 공구' }, { field: '거래처', source: 'partners', values: '등록 거래처' }, { field: '입고검사', source: '고정값', values: '합격/불합격/성적서확인' }],
    search: ['입고일 기간 조회', '필터: 검사결과', '검색: 입고번호·공구·LOT·제조번호'], sort: '입고일 내림차순',
    columns: ['입고번호', '입고일', '공구코드', '공구명', '거래처', '입고수량', '단가', '금액', '제조번호', '관리번호(LOT)', '검사결과', '보관위치'],
    feats: [['입고검사 기록', '체크시트 판정 또는 제작처 성적서 확인 결과를 입고단가와 함께 기록'], ['QR 라벨 출력', '행별 [QR] 버튼으로 관리번호 기준 라벨 인쇄']],
    alerts: ['중복 제조번호 등록 시 확인 필요', '신규 공구는 기준정보등록에서 먼저 등록'],
    sq: ['공구 입고 출처', '입고수량 및 재고 반영', '공구별 관리번호', '초기 상태(입고검사) 확인'] }),
  S({ id: 'tool-stock', title: '재고관리', group: '공구 및 툴관리', path: '/tool/stocks', type: 'masterDetail',
    purpose: '공구별 전체 재고와 LOT 단위 상태(가용/사용중/수명초과/폐기)를 관리. 입고−출고+회수−폐기±조정으로 산출.',
    relations: [{ field: '입고/출고/회수', from: '입고·출고관리', desc: '수량 집계' }, { field: '폐기', from: '폐기관리', desc: '승인 건 차감' }, { field: '재고조정', from: '재고조정', desc: '승인 건 반영' }, { field: '사용횟수', from: '작업 POP', desc: 'LOT별 수명 차감' }],
    dropdowns: [], search: ['공구명·코드·QR 통합검색', '칩: 전체/부족재고/사용중/수명초과'], sort: '공구코드 오름차순',
    columns: ['공구코드', '공구명', '구분', '보관위치', '가용', '사용중', '수명초과', '폐기', '보유합계', '안전재고', '상태'],
    feats: [['LOT별 상태', '하단에 LOT 번호·입고일·제조번호·수명·사용·잔여·상태를 표시'], ['최근 입출고 이력', '선택 공구의 최근 이력을 함께 표시'], ['재고대장 출력', '조회 결과를 CSV로 내보내기']],
    alerts: ['가용재고가 안전재고 이하이면 "부족" 표시', '수명초과 LOT 존재 시 빨강 강조'],
    sq: ['공구 재고 정합성', '정위치·정량관리', '사용 가능/불가 공구 구분', '수명초과 공구 식별'] }),
  S({ id: 'tool-issue', title: '출고·회수관리', group: '공구 및 툴관리', path: '/tool/issues', type: 'list',
    purpose: 'QR 스캔 → 작업자 → 작업지시·설비 선택 → 출고. 회수까지 관리하며 수명초과·사용중지 공구는 출고 제한.',
    process: ['공구 QR 스캔(또는 목록 선택)', '작업자 확인(부서 자동)', '작업지시·설비(호기) 선택', '출고수량 입력 → 출고처리', '사용 후 [회수] 처리'],
    relations: [{ field: '공구·가용재고', from: '재고관리', desc: '가용수량 실시간 확인' }, { field: '작업지시', from: '작업지시관리', desc: '선택 시 설비 자동' }, { field: '작업자', from: '사용자관리', desc: '선택 시 부서 자동' }, { field: '호기', from: '설비관리', desc: '사내 출고 시' }, { field: '외주처', from: '거래처관리', desc: '외주 출고 시' }],
    dropdowns: [{ field: '공구', source: 'tools', values: '가용재고 있는 공구(수명초과·중지 비활성)' }, { field: 'LOT', source: '입고 단위 LOT', values: '가용 LOT(사용중·폐기·수명초과 비활성)' }, { field: '출고처 구분', source: '고정값', values: '사내/외주' }, { field: '작업지시', source: 'work_orders', values: '작업중·대기 지시' }],
    search: ['칩: 전체/출고/회수/미회수', '검색: 번호·공구·작업지시·호기·작업자'], sort: '일자 내림차순',
    columns: ['번호', '일자', '구분', '공구', 'LOT', '수량', '작업지시', '호기/외주처', '작업자', '부서', '반납예정'],
    feats: [['QR 스캔 출고', '스캔창에 QR/코드 입력 후 Enter → 출고 화면 자동 오픈'], ['최근 출고 재사용', '최근 출고한 공구를 칩으로 표시해 즉시 재출고'], ['회수 처리', '미회수 건의 [회수] 버튼으로 반납 등록']],
    alerts: ['사용중지 공구 출고 불가', '가용재고 초과 출고 불가', '수명초과·사용중 LOT 선택 불가', '반납예정일 초과 시 빨강 표시'],
    sq: ['누가 어떤 공구를 사용했는지 확인', '공구와 작업지시·설비 연결', '수명초과 공구 사용방지', '출고 및 반납이력'] }),
  S({ id: 'tool-adj', title: '재고조정', group: '공구 및 툴관리', path: '/tool/adjustments', type: 'list',
    purpose: '재고실사 결과를 등록. 전산재고와 실사재고 차이를 자동 계산하고, 승인된 조정만 재고에 반영.',
    process: ['[실사 등록] → 전 공구 실사수량 입력', '조정수량 자동계산(차이 없으면 제외)', '조정 신청', '승인 → 재고 반영'],
    relations: [{ field: '전산재고', from: '재고관리', desc: '입고−폐기±승인조정 자동 계산' }, { field: '재고 반영', from: '재고관리', desc: '승인 시 즉시 반영' }],
    dropdowns: [{ field: '조정사유', source: '고정값', values: '실사차이/분실/파손/오등록/이관/기타' }],
    search: ['칩: 전체/신청/승인/반려', '검색: 조정번호·공구·사유'], sort: '조정일 내림차순',
    columns: ['조정번호', '조정일', '공구', '위치', '전산재고', '실사재고', '조정수량', '조정사유', '담당자', '상태'],
    feats: [['실사 일괄입력', '전 공구를 한 화면에서 실사수량만 입력 → 조정수량 자동계산'], ['승인 워크플로', '신청 → 승인/반려. 승인 건만 재고 반영']],
    alerts: ['차이가 없는 항목은 저장되지 않음', '승인되지 않은 조정은 재고 미반영'],
    sq: ['전산재고와 실물재고 정합성', '재고차이 원인관리', '조정 승인 및 변경이력'] }),
  S({ id: 'tool-disposal', title: '폐기관리', group: '공구 및 툴관리', path: '/tool/disposals', type: 'list',
    purpose: '수명종료·파손 공구를 폐기 신청·승인. 승인 후 재고가 차감되고 해당 LOT은 재출고가 차단.',
    relations: [{ field: '공구·수명', from: '기준정보등록', desc: '기준수명 대비 잔여수명' }, { field: '사용이력', from: '출고·회수관리', desc: '폐기 전 이력 표시' }, { field: '재고 차감', from: '재고관리', desc: '승인 시 반영' }],
    dropdowns: [{ field: '공구', source: 'tools', values: '등록 공구' }, { field: '폐기사유', source: '고정값', values: '수명초과/파손/마모/정밀도 저하/기타' }],
    search: ['칩: 전체/신청/승인/반려', '검색: 폐기번호·공구·LOT·사유'], sort: '폐기일 내림차순',
    columns: ['폐기번호', '폐기일', '공구', 'LOT', '폐기수량', '폐기사유', '잔여수명', '담당자', '승인자', '상태'],
    feats: [['수명초과 자동검색', '기준수명을 초과한 LOT을 자동 검색해 폐기 신청'], ['폐기 승인', '승인자 지정 후 승인 → 재고 차감·재출고 차단'], ['사용이력 표시', '폐기 신청 시 해당 공구 최근 사용이력 표시']],
    alerts: ['승인 전에는 재고 미차감', '폐기완료 LOT은 출고 선택 불가'],
    sq: ['수명종료 공구의 사용차단', '폐기기준과 사유', '폐기 승인 및 증빙', '폐기 전 사용이력'] }),
  S({ id: 'tool-verify', title: '치수검증', group: '공구 및 툴관리', path: '/tool/verifications', type: 'list',
    purpose: '공구 교체 전/후 및 교체 후 일정수량 가공품의 치수 검증값을 기록. 품질 안정성 입증 자료.',
    relations: [{ field: '공구·LOT', from: '기준정보/재고관리', desc: '검증 대상' }, { field: '호기', from: '설비관리', desc: '검증 시점 설비' }, { field: '작업지시', from: '작업지시관리', desc: '해당 LOT 가공품' }],
    dropdowns: [{ field: '검증구분', source: '고정값', values: '교체전/교체후/교체후N개' }, { field: '판정', source: '고정값', values: 'OK/NG' }],
    search: ['검증일 기간 조회', '필터·칩: 구분·판정', '검색: 검증번호·공구·호기·작업지시'], sort: '검증일 내림차순',
    columns: ['검증번호', '검증일', '구분', '공구명', '공구LOT', '호기', '작업지시', '검증항목', '규격', '공차', '측정값', '판정', '검증자'],
    sq: ['공구 교체 전후 품질 확인', '교체 후 초기 품질 안정성 입증'] }),

  // ===== 검사관리 =====
  S({ id: 'insp-spec', title: '검사규격관리', group: '검사관리', path: '/quality/standards', type: 'masterDetail',
    purpose: '품목·공정별 검사규격을 개정(Rev) 단위로 등록·승인. 승인된 최신 개정본만 수입·공정·출하검사 화면에 자동 적용.',
    process: ['검사규격 등록(품목·공정·검사구분)', '검사항목 입력(상·하한/공차·계측기·주기·샘플)', '검토·승인 처리', '검사화면 자동 적용', '변경 시 [개정]으로 새 Rev 생성'],
    relations: [
      { field: '품목·도면', from: '품목관리/도면관리', desc: '품목 선택 시 도면번호 자동' },
      { field: '공정', from: '표준공정관리', desc: '공정검사 규격의 대상 공정' },
      { field: '계측기', from: '계측기관리', desc: '검사항목별 사용 계측기 지정' },
      { field: '검사화면 적용', from: '수입/공정/출하검사', desc: '승인 최신본 자동 호출' },
      { field: '관리계획서 연계', from: '관리계획서', desc: '관리항목과 규격 일치 필요' },
    ],
    dropdowns: [{ field: '검사구분', source: '고정값', values: '수입검사/공정검사/출하검사' }, { field: '승인상태', source: '고정값', values: '작성중/검토중/승인/폐기' }, { field: '특성', source: '고정값', values: '일반/중요특성/특별특성' }, { field: '평가방법', source: '고정값', values: '정량적/정성적' }, { field: '검사주기', source: '고정값', values: '초물/중물/종물/초·중·종물/1회LOT/전수/주기' }, { field: '계측기', source: 'measuring_instruments', values: '등록 계측기' }],
    search: ['검색: 규격번호·품목·검사항목', '필터: 품목·공정·검사구분·승인상태·적용여부'], sort: '품목 → 검사구분 → 개정 내림차순',
    columns: ['규격번호', '품목', '품명', '공정', '검사구분', '개정(최신표시)', '적용일', '검사항목수', '승인상태', '적용'],
    feats: [
      ['상세 탭', '[기본정보] [검사항목] [적용정보] [개정이력] 4개 탭으로 구성'],
      ['검사항목 인라인 편집', '항목·특성·평가방법·기준값·상하한·공차·검사방법·계측기·주기·샘플수를 표에서 직접 입력'],
      ['엑셀 붙여넣기', '엑셀에서 복사한 검사항목을 표에 일괄 붙여넣기'],
      ['판정방식 자동설정', '상·하한 입력 시 범위판정, 공차만 입력 시 공차판정, 정성 항목은 OK/NG로 자동 설정'],
      ['유사품목 복사', '원본 규격의 전 항목을 다른 품목으로 복사'],
      ['개정 및 비교', '[개정]으로 새 Rev 생성(항목 복사), [변경비교]로 이전본과 달라진 항목만 표시'],
      ['승인 처리', '승인 시 이전 개정본을 자동 미적용 처리'],
      ['검사규격서 인쇄', '결재란 포함 검사규격서 양식 인쇄'],
    ],
    alerts: ['검사항목이 없는 규격은 승인 불가', '승인된 규격은 삭제 불가(개정 또는 폐기)', '승인·최신·적용 상태를 모두 만족해야 검사화면에 호출'],
    sq: ['품목별 검사기준 표준화', '최신 개정본 적용 여부', '검사규격 승인 이력', '계측기 및 검사방법 지정 여부', '특별특성 관리 여부'] }),
  S({ id: 'insp-in', title: '수입검사관리', group: '검사관리', path: '/quality/incoming', type: 'inspect',
    purpose: '입고완료된 자재를 대상으로 검사규격 기반 수입검사를 진행. 불합격 시 부적합관리로 자동 연결.',
    process: ['입고완료 건 표시(미검사 우선)', '[수입검사] 버튼', '검사규격 자동호출 → 측정값 입력', '자동판정 → 저장', '불합격 시 부적합 등록'],
    relations: [
      { field: '대상 리스트', from: '자재입고관리', desc: '입고완료 건만' },
      { field: '검사규격', from: '검사규격관리(수입검사)', desc: '승인 최신본 자동 호출' },
      { field: '입고정보', from: '자재입고관리', desc: '거래처·LOT·수량 자동' },
      { field: '계측기', from: '계측기관리', desc: '항목별 계측기 선택(교정만료 제한)' },
      { field: '불합격 연계', from: '부적합관리', desc: '수입부적합 자동 생성' },
    ],
    dropdowns: [{ field: '검사자', source: 'users', values: '등록 사용자' }, { field: '계측기', source: 'measuring_instruments', values: '교정 유효 계측기(만료 시 비활성)' }],
    search: ['입고일 기간 조회', '칩: 전체/미검사/검사완료', '검색: 입고번호·거래처·품명·LOT'], sort: '미검사 우선',
    columns: ['입고번호', '입고일', '거래처', '품명', 'LOT', '거래처로트', '수량', '검사상태', '검사일', '검사자'],
    alerts: ['입고완료 건만 대상', '검교정 기한 초과 계측기는 선택 불가', '규격 이탈 즉시 빨강 표시'],
    sq: ['공급업체별 수입검사 이력', '원자재 LOT 추적', '검사자와 계측기 사용이력', '수입검사 불합격 및 조치이력', '검사성적서 관리'] }),
  S({ id: 'insp-in-status', title: '수입검사현황', group: '검사관리', path: '/quality/incoming-status', type: 'chart',
    purpose: '수입검사를 기간·조건별 그래프로 분석. 지표=검사건수.',
    relations: [{ field: '데이터', from: '수입검사관리', desc: 'incoming_inspections 집계' }],
    dropdowns: [{ field: '판정', source: '데이터', values: '합격/불합격/조건부' }, { field: '거래처', source: '데이터', values: '거래처' }],
    search: ['기간(검사일) 조회', '조건: 판정·거래처'], sort: '-',
    columns: ['통계(검사/합격/불합격/합격률)', '추이', '판정·거래처·품목 도넛'] }),
  S({ id: 'insp-proc', title: '공정검사관리', group: '검사관리', path: '/quality/process', type: 'inspect',
    purpose: '작업지시(LOT) 기반 초물·중물·종물 공정검사. 측정값은 SQ 공정능력(Cpk) 산출 근거.',
    process: ['작업지시 카드 선택 또는 LOT 스캔', '품목·공정·설비·작업자 자동조회', '검사구분(초물/중물/종물) 선택', '검사규격 자동호출 → 측정값 입력', '자동판정 → 저장'],
    relations: [
      { field: '검사대상', from: '작업지시관리', desc: '작업중·대기 지시 카드' },
      { field: '공정·설비·작업자', from: '작업 POP', desc: '진행 공정 정보 자동 연결' },
      { field: '검사규격', from: '검사규격관리(공정검사)', desc: '품목·공정 기준 자동 호출' },
      { field: '측정값 축적', from: 'SQ 지표 리포트', desc: 'Cpk 산출 원천' },
      { field: '불합격 연계', from: '부적합관리', desc: '공정부적합 자동 생성' },
    ],
    dropdowns: [{ field: '검사구분', source: '고정값', values: '초물/중물/종물' }, { field: '검사자', source: 'users', values: '등록 사용자' }, { field: '계측기', source: 'measuring_instruments', values: '교정 유효 계측기' }],
    search: ['검사일 기간 조회', '칩: 전체/초물/중물/종물', '검색: 검사번호·작업지시·LOT·품명·공정'], sort: '검사일 내림차순',
    columns: ['검사번호', '검사일', '검사구분', '작업지시', 'LOT', '품명', '공정', '호기', '검사', '불량', '검사자', '판정'],
    feats: [['작업지시 카드', '진행중 작업지시를 카드로 표시하고 초·중·종물 실시 여부를 배지로 표시'], ['LOT 스캔', '작업지시번호·LOT 스캔 후 Enter로 즉시 검사 시작'], ['전체 적합', '규격 중앙값으로 일괄 입력'], ['Enter 이동', '측정값 입력 후 Enter로 다음 항목 자동 이동']],
    alerts: ['승인 검사규격이 없으면 수동 판정 안내', '모든 항목 미평가 시 저장 불가', '규격 이탈 시 즉시 경고'],
    sq: ['공정검사 실시 여부', '초물·중물·종물 검사이력', '검사규격과 실제 결과의 연결', '설비·작업자·지그별 품질이력', '불합격 발생 후 조치이력'] }),
  S({ id: 'insp-out', title: '출하검사관리', group: '검사관리', path: '/quality/shipping', type: 'inspect',
    purpose: '생산완료 수주·출하지시를 대상으로 최종 검사. 공정검사 미완료·부적합 미처리 건은 합격 처리를 제한.',
    process: ['생산완료 수주 표시', '공정검사 완료·부적합 여부 확인', '[출하검사] 버튼', '검사규격 평가 + 포장·라벨 확인', '합격 → 출하 가능'],
    relations: [
      { field: '대상', from: '수주/작업지시', desc: '생산완료 건' },
      { field: '출하지시', from: '출하지시', desc: '지시번호 연결' },
      { field: '공정검사 완료 여부', from: '공정검사관리', desc: '작업지시별 검사 실시 확인' },
      { field: '부적합 미처리', from: '부적합관리', desc: 'LOT 기준 미처리 건 확인' },
      { field: '검사규격', from: '검사규격관리(출하검사)', desc: '자동 호출' },
      { field: '납품상태', from: '출하(납품)관리', desc: '납품완료 여부' },
    ],
    dropdowns: [{ field: '검사자', source: 'users', values: '사용자' }, { field: '포장상태', source: '고정값', values: '양호/불량' }, { field: '라벨 확인', source: '고정값', values: '적합/부적합' }],
    search: ['검사일 기간 조회', '칩: 전체/미검사/검사완료/검사제한', '검색: 수주번호·출하지시·거래처·품명'], sort: '미검사 우선',
    columns: ['수주번호', '출하지시', '거래처', '품명', 'LOT', '수량', '공정검사', '부적합', '검사상태', '납품상태'],
    feats: [['선행조건 검증', '공정검사 미완료·불합격·미처리 부적합이 있으면 경고 후 진행 확인'], ['포장·라벨 확인', '출하검사 시 포장상태와 라벨 적합 여부를 함께 기록']],
    alerts: ['필수 선행조건 미충족 시 경고 대화(SQ 지적 사유 안내)', '기간 지정 시 해당 기간 검사완료 건만 표시'],
    sq: ['출하 전 최종검사 실시', '부적합 제품 출하 차단', '출하 LOT와 검사결과 연결', '고객사별 검사성적서 관리'] }),
  S({ id: 'insp-out-status', title: '출하검사현황', group: '검사관리', path: '/quality/shipping-status', type: 'chart',
    purpose: '출하검사를 기간·조건별 그래프로 분석. 지표=검사건수.',
    relations: [{ field: '데이터', from: '출하검사관리', desc: 'shipping_inspections 집계' }],
    dropdowns: [{ field: '판정', source: '데이터', values: '합격/불합격/조건부' }, { field: '거래처', source: '데이터', values: '거래처' }],
    search: ['기간(검사일) 조회', '조건: 판정·거래처'], sort: '-',
    columns: ['통계(검사/합격/불합격/합격률)', '추이', '판정·거래처·품목 도넛'] }),

  // ===== 부적합관리 =====
  S({ id: 'ncr', title: '부적합관리', group: '부적합관리', path: '/quality/nonconformance', type: 'masterDetail',
    purpose: '발생 → 식별·격리 → 처리결정 → 조치중 → 완료 단계로 부적합품을 통제. 격리·처리수량 정합성을 자동 검증.',
    process: ['부적합 등록(검사 불합격 시 자동)', '식별·격리(격리수량 입력)', '처리결정(선별/재작업/폐기/특채 수량)', '개선대책 수립', '완료(수량 정합성 검증)'],
    relations: [
      { field: '검사 불합격', from: '수입/공정/출하검사', desc: '불합격 시 품목·LOT·거래처 자동 전달' },
      { field: '품목·LOT', from: '품목관리/작업지시관리', desc: '추적성 연결' },
      { field: '귀책부서', from: '부서관리', desc: '드롭다운' },
      { field: '불량유형', from: '공통코드(DEFECT_TYPE)', desc: '선택형 입력' },
      { field: '개선대책', from: '개선대책관리', desc: '부적합 연계 대책 수립' },
      { field: 'Q-Cost', from: 'Q-Cost 관리', desc: '부적합번호 선택 시 비용 자동입력' },
    ],
    dropdowns: [{ field: '부적합 구분', source: '고정값', values: '공정부적합/수입부적합/출하부적합/고객클레임' }, { field: '불량유형', source: '공통코드', values: '치수불량/외관불량/가공불량/용접불량 등' }, { field: '조치구분', source: '고정값', values: '선별/재작업/폐기/특채/반품' }],
    search: ['발생일 기간 조회', '필터: 구분', '칩: 전체/진행중/발생/식별·격리/처리결정/조치중/완료/기한초과', '검색: 부적합번호·품목·LOT·불량유형'], sort: '발생일 내림차순',
    columns: ['부적합번호', '발생일', '구분', '발생공정', '품명', 'LOT', '불량유형', '발생', '격리', '처리', '진행상태', '기한', '대책'],
    feats: [
      ['진행상태 스텝', '상단에 5단계 진행상태를 시각적으로 표시하고 [다음 단계]로 진행'],
      ['상세 탭', '[발생정보] [격리·선별] [처리내용] [원인정보] [개선대책·이력] 5개 탭'],
      ['수량 정합성 검증', '선별+재작업+폐기+특채 = 발생수량이어야 완료 가능. 불일치 시 실시간 경고'],
      ['과거 사례 표시', '동일 품목·동일 불량의 과거 부적합을 자동 표시'],
      ['개선대책 연계', '[개선대책] 버튼으로 원인분석·대책을 바로 수립'],
    ],
    alerts: ['격리수량 미입력 시 처리결정 단계 진행 불가', '처리수량 합계 불일치 시 완료 불가', '개선대책 미수립 시 완료 확인 경고', '기한 초과 항목 빨강 강조'],
    sq: ['부적합품 식별 및 격리', '처리수량 정합성', '부적합 발생원인 추적', 'LOT별 처리이력', '미완료 부적합 관리'] }),
  S({ id: 'ncr-status', title: '부적합현황', group: '부적합관리', path: '/quality/ncr-status', type: 'chart',
    purpose: '부적합을 발생일·공정·작업자·조치·유형별 그래프로 분석. 지표=부적합수량.',
    relations: [{ field: '데이터', from: '부적합관리', desc: 'nonconformances 집계' }],
    dropdowns: [], search: ['기간(발생일) 조회'], sort: '-',
    columns: ['통계(건수/수량/처리중/완료)', '발생일 추이', '공정·작업자·조치·유형 도넛'] }),
  S({ id: 'improve', title: '개선대책관리', group: '부적합관리', path: '/quality/improvements', type: 'list',
    purpose: '부적합 → 원인분석 → 임시조치·근본대책 → 담당자·기한 → 유효성 평가 → 수평전개를 관리.',
    process: ['대상 부적합 선택', '원인분석(5Why/4M)', '임시조치·근본대책 수립', '담당자·완료기한 지정', '조치 전·후 자료 첨부', '유효성 평가 → 완료'],
    relations: [{ field: '연계 부적합', from: '부적합관리', desc: '선택 시 제목 자동 생성, 정보 자동호출' }, { field: '담당자·승인자', from: '사용자관리', desc: '드롭다운(부서 자동표시)' }],
    dropdowns: [{ field: '구분', source: '고정값', values: '시정조치/예방조치' }, { field: '유효성 평가', source: '고정값', values: '미평가/적합/부적합' }, { field: '상태', source: '고정값', values: '진행중/완료/지연' }],
    search: ['칩: 전체/진행중/완료/지연/기한초과/미평가', '검색: 대책번호·부적합번호·제목·담당자'], sort: '등록일 내림차순',
    columns: ['대책번호', '등록일', '부적합번호', '제목', '구분', '담당자', '완료기한', 'D-Day', '유효성', '재발', '상태'],
    feats: [['임시/근본 대책 구분', '응급조치와 근본대책을 분리 기록'], ['D-Day 표시', '완료기한 대비 D-Day를 색상으로 표시'], ['수평전개', '유사품목 수평전개 결과를 기록']],
    alerts: ['원인분석·근본대책 미입력 시 저장 불가', '유효성 평가 없이 완료 처리 불가', '기한 초과 시 빨강 표시'],
    sq: ['원인과 개선대책의 연계성', '담당자와 기한 관리', '개선효과 확인', '재발방지 및 수평전개', '조치 승인 이력'] }),

  // ===== 개발관리 (PFD → PFMEA → 관리계획서 → 작업표준서) =====
  S({ id: 'pfd', title: 'PFD (공정흐름도)', group: '개발관리', path: '/dev/pfd', type: 'masterDetail',
    purpose: '원자재 입고부터 출하까지 전 공정의 흐름·순서를 정의하는 4문서 체계의 기준(Base) 문서. 여기서 부여한 공정번호가 PFMEA·관리계획서·작업표준서를 연결하는 유일한 키가 된다.',
    process: ['문서 등록(품목·개정)', '[표준 라우팅 불러오기]로 공정 호출', '공정번호·공정명·구분·설비·투입/산출품 입력', '자재이동 경로·외주/재작업/보관 공정 표시', '검사공정·특별특성 발생공정 표시', '승인 → PFMEA로 전개'],
    relations: [
      { field: '표준 라우팅', from: '제품별표준공정(라우팅)', desc: '[표준 라우팅 불러오기]로 공정순서 자동 호출' },
      { field: '설비', from: '설비관리', desc: '공정별 설비 선택' },
      { field: '외주처', from: '거래처관리', desc: '외주공정 체크 시 협력사 선택' },
      { field: '공정번호 → PFMEA·관리계획서·작업표준서', from: '개발관리', desc: '하위 3개 문서가 PFD 공정번호를 상속받아 문서 간 연결' },
    ],
    dropdowns: [{ field: '공정코드', source: 'processes', values: '등록 공정' }, { field: '공정구분', source: '고정값', values: '가공/검사/이동/보관/외주/조립/포장/재작업' }, { field: '설비', source: 'equipments', values: '등록 설비' }, { field: '외주처', source: 'partners', values: '등록 협력사' }, { field: '특성', source: '고정값', values: '일반/중요특성/특별특성' }],
    search: ['검색: 문서번호·품목·제목', '필터: 품목·상태'], sort: '품목 → 개정 내림차순',
    columns: ['문서번호', '고객사', '품목', '품명', '개정', '제목', '작성자', '작성일', '상태'],
    feats: [
      ['공정흐름 표', '공정번호·공정코드·공정명·구분·설비·투입품·산출품·자재이동 경로·외주/재작업/보관·검사공정·특성을 표에서 직접 입력'],
      ['공정번호 자동부여', '행 추가·순서변경·저장 시 10 단위(10·20·30…)로 공정번호를 자동 부여. [공정번호 재부여]로 일괄 정리'],
      ['표준 라우팅 불러오기', '기준정보의 라우팅(사내/외주 구분 포함)을 공정번호와 함께 호출'],
      ['외주·보관 공정 표시', '외주 체크 시 협력사 지정, 보관·재작업 공정을 별도 표시하여 실제 물류 흐름 반영'],
      ['순서 변경', '▲ 버튼으로 공정 순서 변경 시 공정번호를 자동 재부여'],
    ],
    alerts: ['상세 항목이 없는 문서는 승인 불가', '공정번호 미입력 시 저장 시점에 자동 부여(하위 문서 연결 키)', '승인 후 공정 추가·삭제 시 PFMEA 이하 3개 문서 개정 필요'],
    sq: ['실제 생산공정과 PFD 일치 여부', '공정순서·검사공정·외주공정 표시', '공정번호 체계의 일관성', 'PFMEA·관리계획서·작업표준서와의 공정 일치', '개정이력 관리'] }),
  S({ id: 'pfmea', title: 'PFMEA', group: '개발관리', path: '/dev/pfmea', type: 'masterDetail',
    purpose: 'PFD의 각 공정에서 발생 가능한 고장형태·영향·원인을 분석하고 S·O·D로 위험도(RPN)를 산출. 고위험 항목은 반드시 관리계획서의 관리항목으로 전개된다.',
    process: ['문서 등록(품목·개정)', '[PFD 공정 불러오기]로 공정번호·공정명 상속', '고장형태·영향·원인·예방/검출관리 입력', 'S·O·D 입력 → RPN 자동계산', '[PFD 공정 누락 점검] 실행', '개선대책 수립 → 개선 후 RPN 비교', '승인 → 관리계획서로 전개'],
    relations: [
      { field: '공정번호·공정명', from: 'PFD', desc: '[PFD 공정 불러오기]로 상속 — 임의 입력 금지' },
      { field: '특별특성', from: 'PFD', desc: 'PFD의 특성 표시를 상속하여 문서 간 표시 일치' },
      { field: '고위험 항목 → 관리계획서', from: '관리계획서', desc: 'RPN 100 이상 또는 특별특성 항목이 관리항목으로 자동 전개' },
      { field: '4M 변경', from: '4M 관리', desc: '변경 시 개정 필요 여부 체크' },
    ],
    dropdowns: [{ field: '공정번호·공정명', source: 'PFD', values: 'PFD 공정 목록' }, { field: '특성', source: '고정값', values: '일반/중요특성/특별특성' }, { field: 'S·O·D', source: '고정값', values: '1~10' }, { field: '상태', source: '고정값', values: '작성중/검토중/승인/개정/폐기' }],
    search: ['검색: 문서번호·품목·제목', '필터: 품목·상태'], sort: '품목 → 개정 내림차순',
    columns: ['문서번호', '고객사', '품목', '품명', '개정', '제목', '작성자', '작성일', '승인자', '상태'],
    feats: [
      ['PFMEA 분석표', '공정번호·공정명·기능·고장형태·영향·S·원인·O·예방관리·검출관리·D·RPN·특성·CP반영·개선대책·개선 후 RPN을 표에서 직접 입력'],
      ['RPN 자동계산', 'S×O×D를 실시간 계산. 100 이상 빨강(고위험), 60 이상 주황으로 강조'],
      ['PFD 공정 불러오기', '동일 품목의 최신 승인 PFD에서 공정번호·공정명·특성을 상속'],
      ['PFD 공정 누락 점검', 'PFD에는 있으나 PFMEA에 없는 공정, PFMEA에만 있는 공정을 팝업으로 목록화하고 클릭 한 번으로 추가'],
      ['CP 반영 체크', '고위험 항목이 관리계획서에 반영되었는지 여부를 항목별로 표시'],
      ['개정·복사', '[개정]으로 새 Rev 생성(항목 복사), 유사품목 복사 지원'],
      ['인쇄', '결재란 포함 PFMEA 양식(A4 가로) 인쇄'],
    ],
    alerts: ['상세 항목이 없는 문서는 승인 불가', 'PFD 공정 누락 시 승인 전 점검 경고', 'RPN 100 이상 항목은 개선대책 없이 승인 시 경고', '승인 시 이전 개정본은 개정 상태로 자동 변경'],
    sq: ['PFD 전 공정에 대한 잠재불량 분석 여부', '고위험(RPN 100 이상) 항목의 개선대책과 개선 후 재평가', '특별특성 표시가 PFD·관리계획서와 일치', '고위험 항목의 관리계획서 반영', '최신 개정 및 승인관리'] }),
  S({ id: 'cplan', title: '관리계획서', group: '개발관리', path: '/dev/control-plan', type: 'masterDetail',
    purpose: 'PFMEA에서 도출된 위험을 “현장에서 무엇을·어떻게·얼마나 자주 관리할 것인가”로 구체화. 검사방법·검사주기·계측기·이상 시 조치를 확정하는 품질관리의 실행 기준서.',
    process: ['문서 등록(품목·개정)', '[PFD·PFMEA 불러오기]로 공정·고위험 항목 자동 전개', '제품특성/공정특성 구분 및 규격 입력', '관리방법·검사주기·검사수량·계측기·담당자 지정', '이상 시 조치(반응계획) 지정', '[고위험 반영 점검] 실행', '승인 → 작업표준서로 전개'],
    relations: [
      { field: '공정번호·공정명', from: 'PFD', desc: '[PFD·PFMEA 불러오기]로 상속' },
      { field: '고위험 항목', from: 'PFMEA', desc: 'RPN 100 이상 또는 특별특성 항목이 관리항목으로 자동 전개(고장형태를 fmea_ref로 연결)' },
      { field: '계측기', from: '계측기관리', desc: '관리항목별 계측기 지정(교정 유효기간 확인)' },
      { field: '설비', from: '설비관리', desc: '공정특성 관리 시 설비 지정' },
      { field: '검사규격', from: '검사규격관리', desc: '규격·주기 일치 필요' },
      { field: '작업표준서', from: '작업표준서', desc: '관리항목·검사주기가 품질확인사항으로 전개' },
    ],
    dropdowns: [{ field: '공정번호·공정명', source: 'PFD', values: 'PFD 공정 목록' }, { field: '특성구분', source: '고정값', values: '제품특성/공정특성' }, { field: '특성', source: '고정값', values: '일반/중요특성/특별특성' }, { field: '검사주기', source: '고정값(공통)', values: '초물/중물/종물/초·중·종물/1회LOT/전수/주기(1·2·4h)/작업시작 시/작업종료 시' }, { field: '계측기', source: 'measuring_instruments', values: '등록 계측기' }, { field: '담당자', source: 'users', values: '등록 사용자' }, { field: '이상 시 조치', source: '고정값(공통)', values: '생산 중지 및 조건 확인/설비정지 후 보고/전수선별/재작업/공구교체/조건 재설정/부적합품 격리/부적합 등록/초물 재검사' }],
    search: ['검색: 문서번호·품목·제목', '필터: 품목·상태'], sort: '품목 → 개정 내림차순',
    columns: ['문서번호', '고객사', '품목', '품명', '개정', '제목', '작성자', '작성일', '상태'],
    feats: [
      ['관리항목 표', '공정번호·공정명·특성구분(제품/공정)·관리항목·특성·규격·관리방법·계측기·설비·검사주기·검사수량·담당자·이상 시 조치·FMEA 근거를 표에서 입력'],
      ['PFD·PFMEA 불러오기', 'PFD 공정을 상속하고 PFMEA의 RPN 100 이상·특별특성 항목을 관리항목으로 자동 전개'],
      ['고위험 반영 점검', 'PFMEA 고위험 항목 중 관리계획서에 누락된 항목을 팝업으로 목록화하고 한 번에 추가'],
      ['검사주기 공통값', '작업표준서와 동일한 고정 목록을 사용하여 문서 간 주기 불일치를 원천 차단'],
      ['인쇄', '관리계획서 양식(A4 가로) 인쇄'],
    ],
    alerts: ['상세 항목이 없는 문서는 승인 불가', '특별특성 항목은 관리방법·검사주기·계측기 지정 필수', 'PFMEA 고위험 항목 누락 시 승인 전 경고', '교정 만료 계측기는 선택 불가'],
    sq: ['PFMEA 고위험 항목의 관리계획서 반영 여부', '특별특성 관리방법의 구체성', '검사방법·주기·계측기·검사수량 지정', '이상 발생 시 조치기준 명확성', '작업표준서와의 검사주기 일치'] }),
  S({ id: 'wstd', title: '작업표준서', group: '개발관리', path: '/dev/work-standard', type: 'masterDetail',
    purpose: '관리계획서의 관리기준을 작업자가 실제로 따라 할 수 있는 순서·조작방법·판정기준으로 번역한 최종 실행문서. 승인된 최신본만 현장(POP)에 표시된다.',
    process: ['문서 등록(품목·공정)', '[관리계획서 불러오기]로 공정·품질확인사항 전개', '작업순서·설비조작·자재장착 방법 입력', '작업조건·사용공구·안전수칙 입력', '품질확인 항목·검사주기·이상 시 조치 입력', '양품/불량 판정 사진 등록', '[관리계획서 일치 점검] 실행', '승인 → 현장 표시'],
    relations: [
      { field: '공정번호·공정명', from: 'PFD/관리계획서', desc: '[관리계획서 불러오기]로 상속' },
      { field: '품질확인사항·검사주기', from: '관리계획서', desc: '관리항목·규격·검사주기를 그대로 전개(불일치 시 점검에서 검출)' },
      { field: '사용공구', from: '공구관리', desc: '작업단계별 공구 지정' },
      { field: '현장 표시', from: '작업 POP', desc: '승인된 최신본만 작업 화면에 표시' },
    ],
    dropdowns: [{ field: '공정번호·공정명', source: 'PFD/관리계획서', values: '공정 목록' }, { field: '검사주기', source: '고정값(공통)', values: '관리계획서와 동일한 목록' }, { field: '이상 시 조치', source: '고정값(공통)', values: '관리계획서와 동일한 목록' }, { field: '상태', source: '고정값', values: '작성중/검토중/승인/개정/폐기' }],
    search: ['검색: 문서번호·품목·제목', '필터: 품목·상태'], sort: '품목 → 개정 내림차순',
    columns: ['문서번호', '고객사', '품목', '품명', '공정', '개정', '제목', '작성자', '작성일', '상태'],
    feats: [
      ['작업단계 표', '공정번호·공정명·단계명·자재장착·설비조작·작업방법·작업조건·사용공구·품질확인사항·검사주기·안전수칙·이상 시 조치를 입력'],
      ['관리계획서 불러오기', '해당 품목 최신 승인 관리계획서의 관리항목·규격·검사주기를 품질확인사항으로 자동 전개'],
      ['관리계획서 일치 점검', '누락된 관리항목과 검사주기가 다른 항목을 팝업으로 표시하고 [자동 반영]으로 일괄 동기화'],
      ['양품·불량 판정 사진', '양품/불량 샘플 사진과 도면 URL을 등록하여 작업자가 시각적으로 판정'],
      ['안전수칙', '단계별 안전수칙을 별도 항목으로 관리'],
      ['인쇄', '작업표준서 양식 인쇄(현장 게시용)'],
    ],
    alerts: ['상세 항목이 없는 문서는 승인 불가', '관리계획서 관리항목 누락 시 승인 전 경고', '검사주기가 관리계획서와 다르면 경고', '승인본만 현장에 표시'],
    sq: ['작업방법·조건의 구체성(작업자가 따라 할 수 있는 수준)', '관리계획서 관리항목의 품질확인사항 반영', '검사주기가 관리계획서와 일치', '양품/불량 판정기준 제시', '최신 승인본의 현장 게시', '실제 작업방법과 문서 내용 일치'] }),
  S({ id: 'docchk', title: '개발문서 정합성 점검', group: '개발관리', path: '/dev/consistency', type: 'analysis',
    purpose: 'PFD → PFMEA → 관리계획서 → 작업표준서 4문서가 서로 어긋나지 않았는지 품목별로 자동 진단. SQ 심사에서 가장 많이 지적되는 문서 불일치를 사전에 제거한다.',
    process: ['품목 선택(또는 전체)', '[정합성 점검] 실행', '문서별 최신 승인본 자동 수집', '7개 항목 자동 대조', '지적 예상 항목 확인 → 해당 문서로 이동하여 수정', '결과 CSV 내보내기'],
    relations: [
      { field: 'PFD·PFMEA·관리계획서·작업표준서', from: '개발관리', desc: '품목별 최신본(승인 우선, 최고 Rev)을 자동 수집하여 대조' },
      { field: '공정번호', from: 'PFD', desc: '전 문서를 공정번호 기준으로 매칭' },
      { field: '4M 변경', from: '4M 관리', desc: '변경 승인 후 문서 개정 누락 여부 확인' },
    ],
    dropdowns: [{ field: '품목', source: 'items', values: '개발문서가 등록된 품목' }, { field: '심각도', source: '고정값', values: '높음/중간/낮음' }],
    search: ['필터: 품목', '칩: 전체/높음/중간/낮음'], sort: '심각도 → 공정번호',
    columns: ['품목', 'PFD', 'PFMEA', '관리계획서', '작업표준서', '지적항목', '심각도'],
    feats: [
      ['4문서 현황', '품목별 4개 문서의 개정(Rev)·상태를 한 줄로 표시. 미작성·미승인 문서를 즉시 식별'],
      ['공정번호별 반영 현황 매트릭스', '공정번호를 행으로, 4개 문서를 열로 하는 매트릭스로 어느 공정이 어느 문서에서 누락되었는지 시각화'],
      ['7개 자동 대조', '① 문서 미작성·미승인 ② PFD 공정의 PFMEA 누락·공정명 불일치 ③ PFMEA 고위험/특별특성의 관리계획서 누락 ④ 관리계획서 항목의 작업표준서 누락 ⑤ 검사주기 불일치 ⑥ 특별특성 표시 불일치 ⑦ 상위문서 개정 후 하위문서 미개정'],
      ['심각도 분류', '높음(고객 영향·심사 지적 확실) / 중간 / 낮음으로 구분하여 조치 우선순위 제시'],
      ['문서 바로가기', '지적 항목에서 해당 문서 화면으로 바로 이동'],
      ['CSV 내보내기', '점검 결과를 심사 대응 자료로 내보내기'],
    ],
    alerts: ['심각도 “높음” 항목이 있으면 SQ 심사 지적 대상', '상위문서 개정일이 하위문서보다 최신이면 개정 미반영으로 표시', '문서가 미승인 상태면 정합성 판정에서 제외되지 않고 별도 경고'],
    sq: ['PFD·PFMEA·관리계획서·작업표준서의 공정 일치', '고위험 항목의 문서 간 전개 완결성', '검사주기·특별특성 표시 일관성', '문서 변경 시 연관 문서 동시 개정', '실제 현장 작업과 문서 내용의 일치'] }),

  // ===== 변경관리 =====
  S({ id: 'fourm', title: '4M 관리', group: '변경관리', path: '/change/four-m', type: 'masterDetail',
    purpose: 'Man·Machine·Material·Method 변경을 사전 승인하고 변경 전/후·시험생산·적용 LOT·관련 문서 개정을 관리.',
    process: ['4M 구분 선택(버튼)', '변경 전 자동호출 → 변경 후 입력', '영향 품목·설비 선택', '관련 문서 개정 필요 여부 체크', '시험생산 결과 등록 → 승인', '적용일·적용 LOT 기록'],
    relations: [
      { field: '변경 전 정보', from: '라우팅/BOM', desc: 'Machine·Material 선택 시 현재 정보 자동호출' },
      { field: '영향 품목·설비', from: '품목/설비관리', desc: '다중선택' },
      { field: '관련 문서', from: 'PFMEA·PFD·관리계획서·작업표준서', desc: '개정 필요 여부 체크 및 문서 상태 표시' },
      { field: 'PPAP', from: 'PPAP 승인관리', desc: 'PPAP 대상 시 제출 연계' },
      { field: '적용 LOT', from: '작업지시관리', desc: 'LOT 추적에서 변경 적용 시점 확인' },
    ],
    dropdowns: [{ field: '4M 구분', source: '버튼선택', values: 'Man/Machine/Material/Method' }, { field: '품목·공정', source: 'items/processes', values: '등록 데이터' }, { field: '승인상태', source: '고정값', values: '신청/검토중/승인/반려' }, { field: '적용상태', source: '고정값', values: '미적용/적용중/완료' }],
    search: ['필터: 4M 구분', '칩: 전체/신청/검토중/승인/반려/PPAP대상', '검색: 변경번호·품목·공정·사유'], sort: '변경일 내림차순',
    columns: ['변경번호', '변경일', '4M', '품명', '공정', '변경사유', '시험생산', '고객승인', '문서개정', '적용LOT', '승인상태', '적용'],
    feats: [
      ['4M 버튼 선택', 'Man·Machine·Material·Method를 버튼으로 선택하면 변경 전/후 라벨이 자동 변경'],
      ['변경 전 자동호출', 'Machine 선택 시 라우팅 설비, Material 선택 시 BOM 구성을 자동 입력'],
      ['변경 전·후 비교표', '상세에서 변경 전/후를 나란히 비교 표시'],
      ['문서 개정 연계', '체크한 문서의 실제 개정 상태(문서번호·Rev·승인)를 상세에서 확인'],
      ['적용 처리', '승인 후 적용일·적용 시작 LOT을 기록'],
    ],
    alerts: ['고객승인 필요한데 승인서 미첨부 시 승인 확인 경고', '시험생산 결과 미입력 시 승인 확인 경고', '승인 전 적용상태 변경 제한'],
    sq: ['4M 변경의 사전승인', '품질영향 검토', '변경 적용 LOT', '시험생산 및 검증결과', '관련 문서 개정'] }),
  S({ id: 'ppap', title: 'PPAP 승인관리', group: '변경관리', path: '/change/ppap', type: 'masterDetail',
    purpose: '고객 PPAP 제출·승인을 관리. 제출서류 체크리스트로 미첨부 문서를 확인하고 제출차수를 관리.',
    process: ['PPAP 등록(고객사·품목·Level·사유)', '제출서류 체크(개발문서 자동체크)', '제출', '승인/조건부승인/반려', '반려 시 보완 후 재제출(차수+1)'],
    relations: [
      { field: '개발문서', from: 'PFD·PFMEA·관리계획서·작업표준서', desc: '[자동 체크]로 승인 문서 확인' },
      { field: '연계 4M', from: '4M 관리', desc: '4M 변경 사유 제출 시 연결' },
      { field: '고객사·품목', from: '거래처/품목관리', desc: '드롭다운(품목 선택 시 고객사 자동)' },
    ],
    dropdowns: [{ field: '제출 Level', source: '고정값', values: 'Level 1~5' }, { field: '제출사유', source: '고정값', values: '신규부품/4M변경/설계변경/공정변경/고객요청/기타' }, { field: '상태', source: '고정값', values: '작성중/제출/승인/조건부승인/반려' }],
    search: ['칩: 전체/작성중/제출/승인/조건부승인/반려', '검색: PPAP번호·고객사·품목'], sort: '제출일 내림차순',
    columns: ['PPAP번호', '고객사', '품목', '품번', 'Level', '제출차수', '제출일', '서류(n/7)', '제출사유', '4M변경', '승인일', '적용일', '상태'],
    feats: [
      ['제출서류 체크리스트', 'PFD·PFMEA·관리계획서·작업표준서·검사결과·도면·고객승인문서 7종을 체크'],
      ['개발문서 자동체크', '품목의 승인된 개발문서를 조회해 자동으로 체크'],
      ['미첨부 강조', '상세에서 미첨부 서류를 빨강으로 강조 표시'],
      ['재제출', '[재제출] 버튼으로 제출차수를 자동 증가시키고 상태 초기화'],
      ['보완요청 관리', '조건부승인·반려 시 보완요청 내용과 기한을 기록'],
    ],
    alerts: ['서류 미첨부 상태로 승인 시 확인 경고', '미승인 품목의 양산 적용 주의'],
    sq: ['PPAP 제출 및 승인 이력', '고객 요구문서 관리', '변경품의 승인 여부', '승인문서와 양산 적용일 연결'] }),

  // ===== 계측기관리 =====
  S({ id: 'inst', title: '계측기 관리', group: '계측기관리', path: '/measure/instruments', type: 'masterDetail',
    purpose: '계측기 등록·QR 발행·교정주기를 관리. 교정주기 입력 시 차기 교정일이 자동 계산됩니다.',
    relations: [{ field: '관리자·부서', from: '사용자/부서관리', desc: '드롭다운' }, { field: '검사 사용', from: '검사규격관리', desc: '검사항목별 계측기 지정' }, { field: '교정 이력', from: '검교정 관리', desc: '최근·차기 교정일 자동 갱신' }, { field: 'R&R', from: 'Gauge R&R', desc: '계측기별 R&R 이력 표시' }],
    dropdowns: [{ field: '상태', source: '고정값', values: '정상/교정중/수리중/사용중지/폐기' }, { field: '사용부서', source: 'departments', values: '등록 부서' }, { field: '관리자', source: 'users', values: '등록 사용자' }],
    search: ['검색: 계측기코드·명·모델·시리얼', '필터: 상태'], sort: '계측기코드 오름차순',
    columns: ['계측기코드', '계측기명', '모델', '시리얼', '측정범위', '분해능', '주기(월)', '최근교정', '차기교정', 'D-Day', '사용부서', '상태'],
    feats: [['차기 교정일 자동계산', '최근 교정일 + 교정주기(개월)로 자동 계산'], ['QR코드 발행', '계측기 코드 기반 QR 라벨을 개별·일괄 출력'], ['유사 계측기 복사등록', '기존 계측기를 복사해 시리얼만 변경'], ['상세 이력', '우측에서 검교정 이력과 R&R 이력을 함께 확인']],
    alerts: ['계측기코드 중복 시 등록 불가', '차기 교정일 초과 시 빨강 배지'],
    sq: ['계측기 식별 및 상태관리', '측정범위와 분해능 적정성', '보관위치와 담당부서', '검사규격과 계측기 연결'] }),
  S({ id: 'calib', title: '검교정 관리', group: '계측기관리', path: '/measure/calibrations', type: 'list',
    purpose: '차기 교정일 기준으로 대상을 자동 조회. 교정 완료 시 차기일 자동계산, 부적합 시 사용중지 자동전환.',
    process: ['교정 대상 자동조회(D-30/D-7/기한초과)', '일괄 교정의뢰(상태 교정중)', '교정 결과 등록', '차기 교정일 자동계산', '부적합 시 사용중지 전환'],
    relations: [{ field: '교정 대상', from: '계측기 관리', desc: '차기 교정일 기준 자동 조회' }, { field: '계측기 상태', from: '계측기 관리', desc: '교정 결과에 따라 자동 갱신' }],
    dropdowns: [{ field: '교정 구분', source: '고정값', values: '사내교정/외부교정/수리' }, { field: '결과', source: '고정값', values: '합격/조정후합격/불합격' }],
    search: ['칩: 교정대상/D-30/D-7/기한초과/전체', '검색: 계측기'], sort: 'D-Day 오름차순',
    columns: ['계측기', '모델·시리얼', '최근 교정일', '차기 교정일', 'D-Day', '사용부서', '상태 / (이력) 교정번호·구분·기관·결과·성적서·비용'],
    feats: [['D-Day 표시', 'D-30(주황)·D-7(빨강)·기한초과(빨강) 자동 표시'], ['일괄 교정의뢰', '여러 계측기를 선택해 한 번에 의뢰 등록(상태 교정중)'], ['차기일 자동계산', '교정일 + 교정주기로 차기 교정일 자동 입력'], ['부적합 자동 통제', '불합격 시 계측기를 사용중지로 전환해 검사화면 선택 차단']],
    alerts: ['부적합 시 사용중지 전환 안내', '기한초과 계측기는 검사에서 선택 불가'],
    sq: ['검교정 계획과 실시이력', '교정기한 준수', '교정성적서', '교정 부적합 계측기 통제'] }),
  S({ id: 'inst-status', title: '계측기현황', group: '계측기관리', path: '/measure/status', type: 'dashboard',
    purpose: '상태별 요약 카드로 계측기 현황을 조회. 카드 클릭 시 해당 계측기만 표시.',
    relations: [{ field: '계측기', from: '계측기 관리', desc: '상태·교정일 집계' }, { field: '교정 이력', from: '검교정 관리', desc: '선택 시 이력 표시' }],
    dropdowns: [], search: ['상태 카드 클릭 필터'], sort: '차기 교정일 오름차순',
    columns: ['상태 요약(정상/교정예정/기한초과/교정중/수리중/사용중지/폐기)', '계측기 목록', '검교정 이력'],
    feats: [['상태 카드 필터', '카드를 클릭하면 해당 상태 계측기만 조회'], ['행 클릭 이력', '계측기 행을 클릭하면 하단에 검교정 이력 표시'], ['계측기대장 출력', 'CSV로 내보내기']],
    sq: ['계측기 상태 일람', '교정 기한 관리 현황'] }),
  S({ id: 'rr-reg', title: 'R&R 관리대장', group: '계측기관리', path: '/measure/rr-register', type: 'list',
    purpose: '평가대상(품목·검사항목·계측기)과 평가조건(평가자·시료·반복)·판정기준·평가주기를 정의.',
    relations: [{ field: '품목·검사항목', from: '품목/검사규격관리', desc: '평가 대상' }, { field: '계측기', from: '계측기 관리', desc: '평가 대상 계측기' }, { field: '평가계획', from: 'R&R 평가계획', desc: '조건 자동 호출' }],
    dropdowns: [{ field: '품목', source: 'items', values: '등록 품목' }, { field: '계측기', source: 'measuring_instruments', values: '등록 계측기' }],
    search: ['검색: 대장번호·품목·검사항목·계측기'], sort: '대장번호 오름차순',
    columns: ['대장번호', '품목코드', '품명', '공정', '검사항목', '계측기', '평가자', '시료', '반복', '주기(월)', '사용'],
    sq: ['검사시스템 신뢰성 평가 기준', '평가조건 표준화'] }),
  S({ id: 'rr-plan', title: 'R&R 평가계획', group: '계측기관리', path: '/measure/rr-plan', type: 'list',
    purpose: '관리대장의 평가조건을 호출해 평가 일정을 수립. 평가주기 도래 대상을 자동 생성.',
    relations: [{ field: '평가조건', from: 'R&R 관리대장', desc: '선택 시 시료·반복 자동' }, { field: '실시 결과', from: 'R&R 평가등록', desc: '실시 여부에 따라 상태 자동' }],
    dropdowns: [{ field: '관리대장', source: 'grr_registers', values: '등록 대장' }, { field: '평가자', source: 'users', values: '등록 사용자(다중)' }],
    search: ['칩: 전체/계획/진행/완료/지연', '검색: 계획번호·품목·검사항목·계측기'], sort: '평가예정일 오름차순',
    columns: ['계획번호', '대장번호', '품목', '검사항목', '계측기', '평가예정일', 'D-Day', '평가자', '시료/반복', '담당자', '상태'],
    feats: [['주기 도래 자동생성', '최근 평가일 + 주기로 도래한 대상의 계획을 일괄 생성'], ['평가등록 연결', '[평가등록] 버튼으로 해당 계획의 평가 화면으로 이동']],
    alerts: ['동일 대장·예정일의 미실시 계획 중복 등록 불가', '기한 초과 계획은 지연으로 표시'],
    sq: ['평가 계획 수립 여부', '계획 대비 실시 관리'] }),
  S({ id: 'rr-eval', title: 'R&R 평가등록', group: '계측기관리', path: '/measure/gauge-rr', type: 'masterDetail',
    purpose: '측정값을 행렬로 입력하면 반복성(EV)·재현성(AV)·%GRR·ndc가 자동 계산되고 판정이 표시됩니다.',
    process: ['평가계획 선택(또는 직접 입력)', '평가자·시료·반복 설정', '측정값 행렬 입력(엑셀 붙여넣기 가능)', 'EV·AV·%GRR·ndc 자동계산', '부적합 시 개선내용 입력 → 저장'],
    relations: [{ field: '평가계획', from: 'R&R 평가계획', desc: '선택 시 조건 자동 입력, 실시 후 완료 처리' }, { field: '공차', from: '검사규격관리', desc: '검사항목의 상·하한으로 공차 자동 입력' }, { field: '계측기', from: '계측기 관리', desc: '평가 대상' }],
    dropdowns: [{ field: '평가계획', source: 'grr_plans', values: '미실시 계획' }, { field: '품목·계측기', source: 'items/measuring_instruments', values: '등록 데이터' }],
    search: ['칩: 전체/적합/조건부/부적합', '검색: R&R번호·품목·검사항목·계측기'], sort: '평가일 내림차순',
    columns: ['R&R번호', '평가일', '품목', '검사항목', '계측기', '평가자/시료/반복', 'EV', 'AV', '%GRR', 'ndc', '판정'],
    feats: [
      ['측정값 행렬 입력', '시료 × (평가자-반복) 행렬로 입력. Enter로 다음 셀 자동 이동'],
      ['엑셀 붙여넣기', '엑셀에서 복사한 측정값을 한 번에 적용'],
      ['자동계산', 'AIAG MSA 평균-범위법으로 EV·AV·GRR·PV·TV·%GRR·ndc 산출'],
      ['누락 강조', '미입력 셀을 빨강 배경으로 강조'],
      ['보고서 인쇄', '측정값과 결과를 포함한 R&R 보고서 인쇄'],
    ],
    alerts: ['모든 측정값 입력 전 저장 불가', '부적합·조건부 판정 시 개선내용 입력 필수'],
    defs: ['판정기준: %GRR<10 적합 · 10~30 조건부 · >30 부적합', '공차 입력 시 공차 대비, 미입력 시 총변동 대비 %GRR'],
    sq: ['검사시스템 신뢰성 평가', '평가자·시료·반복측정 이력', 'R&R 결과 및 개선조치'] }),
  S({ id: 'rr-status', title: 'R&R 실시현황', group: '계측기관리', path: '/measure/rr-status', type: 'chart',
    purpose: '계획 대비 실시 현황과 %GRR 결과를 조회. 계측기별 추세를 확인.',
    relations: [{ field: '계획', from: 'R&R 평가계획', desc: '미실시 건 포함' }, { field: '실시 결과', from: 'R&R 평가등록', desc: '%GRR·판정' }],
    dropdowns: [{ field: '품목·계측기', source: '데이터', values: '등록 데이터' }],
    search: ['기간 조회', '칩: 전체/완료/계획/미실시/부적합', '조건: 품목·계측기'], sort: '실시일 내림차순',
    columns: ['품목', '검사항목', '계측기', '계획일', '실시일', '%GRR', 'ndc', '판정', '상태'],
    feats: [['실시율·적합률 통계', '평가 대상 대비 실시율과 R&R 적합률을 표시'], ['계측기별 추세', '계측기별 최근 6회 %GRR을 막대로 비교(색상=판정)'], ['보고서 출력', 'CSV로 내보내기']],
    sq: ['R&R 계획 대비 실시율', '계측기별 신뢰성 추세', '부적합 항목 개선 관리'] }),

  // ===== 용접기술관리 =====
  S({ id: 'wps', title: '용접절차 시방서(WPS)', group: '용접기술관리', path: '/weld/wps', type: 'masterDetail',
    purpose: '용접조건(모재·두께범위·용가재·보호가스·전류/전압·예열·층간온도·자세)을 정의하고 PQR과 연결.',
    relations: [{ field: '근거 PQR', from: '인정기록서(PQR)', desc: '선택 시 모재·용가재·용접법 자동' }, { field: '적용 품목', from: '품목관리', desc: '다중선택' }, { field: '적용 용접기', from: '설비관리', desc: '용접기 설비 선택' }, { field: '작업표준서', from: '작업표준서', desc: '승인 WPS를 작업조건으로 적용' }],
    dropdowns: [{ field: '용접법', source: '고정값', values: 'GTAW(TIG)/GMAW(MIG·MAG)/SMAW/FCAW/SAW/SPOT/기타' }, { field: '용접자세', source: '고정값', values: '1G/2G/3G/4G/1F~4F/ALL' }, { field: '근거 PQR', source: 'pqr_docs', values: '등록 PQR' }, { field: '상태', source: '고정값', values: '작성중/검토중/승인/개정/폐기' }],
    search: ['칩: 전체/작성중/검토중/승인/개정/폐기', '검색: WPS번호·제목·용접법·모재'], sort: 'WPS번호 오름차순',
    columns: ['WPS번호', 'Rev', '제목', '용접법', '모재', '두께범위', '용가재', '보호가스', '전류/전압', '자세', 'PQR', '상태'],
    feats: [['복사 후 개정', '기존 WPS를 복사하고 Rev를 자동 증가'], ['전류·전압 범위 검증', '"최소~최대" 형식과 대소 관계를 자동 검증'], ['PQR 조건 자동입력', 'PQR 선택 시 모재·용가재·용접법 자동 반영'], ['WPS 출력', 'WPS 표준 양식(결재란 포함) 인쇄']],
    alerts: ['PQR 미연결 상태로 승인 시 확인 경고', '승인된 WPS는 삭제 불가(폐기 처리)', '전류·전압 범위 형식 오류 시 저장 불가'],
    sq: ['승인된 WPS 사용', '실제 작업조건과 WPS 일치', '개정 및 승인 이력', 'PQR과의 연결'] }),
  S({ id: 'pqr', title: '인정기록서(PQR)', group: '용접기술관리', path: '/weld/pqr', type: 'list',
    purpose: 'WPS 조건의 유효성을 입증하는 시험 기록. 시험편·실제 용접조건·외관/인장/굽힘 결과와 인정범위를 관리.',
    relations: [{ field: 'WPS', from: 'WPS 관리', desc: '선택 시 용접법·모재·용가재 자동' }, { field: '시험 용접사', from: '용접사 관리', desc: '드롭다운' }],
    dropdowns: [{ field: '용접법', source: '고정값', values: 'GTAW/GMAW/SMAW/FCAW/SAW/SPOT/기타' }, { field: '시험 용접사', source: 'welders', values: '등록 용접사' }, { field: '시험결과', source: '고정값', values: '합격/불합격' }, { field: '상태', source: '고정값', values: '유효/만료/폐기' }],
    search: ['시험일 기간 조회', '필터: 결과·상태', '칩: 합격/불합격', '검색: PQR번호·WPS·용접사·시험기관'], sort: '시험일 내림차순',
    columns: ['PQR번호', '시험일', '관련 WPS', '용접법', '모재', '두께', '시험 용접사', '외관', '인장', '굽힘', '인정범위', '시험기관', '최종판정', '상태'],
    feats: [['시험결과 자동판정', '외관·인장·굽힘이 모두 합격이면 최종판정 자동 합격, 하나라도 불합격이면 불합격'], ['WPS 조건 자동입력', 'WPS 선택 시 조건 자동 반영']],
    sq: ['WPS 조건의 유효성 입증', '시험결과와 승인자료', 'WPS와 PQR 추적성', '인정범위 관리'] }),
  S({ id: 'welder', title: '용접사 관리', group: '용접기술관리', path: '/weld/welders', type: 'masterDetail',
    purpose: '용접사 자격(가능 용접법·자세·모재 두께범위)과 유효기간을 관리. 만료 D-30/D-7 자동 경고.',
    relations: [{ field: '직원정보', from: '사용자관리', desc: '선택 시 부서 자동' }, { field: '적용 가능 WPS', from: 'WPS 관리', desc: '용접법·모재 일치 WPS 자동 검색' }, { field: 'PQR 시험이력', from: '인정기록서(PQR)', desc: '해당 용접사 시험 기록' }],
    dropdowns: [{ field: '가능 용접법', source: '고정값', values: 'GTAW/GMAW/SMAW/FCAW/SAW/SPOT/기타' }, { field: '부서', source: 'departments', values: '등록 부서' }],
    search: ['칩: 전체/유효/만료임박/만료', '검색: 사번·이름·자격증번호·용접법'], sort: '만료 D-Day 오름차순',
    columns: ['사번', '이름', '부서', '자격종류', '자격증번호', '용접법', '자세', '모재·두께', '만료일', 'D-Day', '상태'],
    feats: [['자격 상태 자동판정', '유효기간 기준으로 만료 60일 전 "만료임박", 경과 시 "만료" 자동 설정'], ['갱신예정일 자동', '만료일 입력 시 30일 전으로 갱신예정일 자동 설정'], ['적용 가능 WPS', '용접사 자격과 일치하는 승인 WPS를 자동 검색해 표시'], ['만료 경고', '만료·임박 시 상세 상단에 경고 배너 표시']],
    alerts: ['자격 만료 용접사는 작업배정 전 갱신 필요 경고', 'D-7 이내 빨강, D-30 이내 주황 표시'],
    sq: ['유효한 자격 보유자 작업', '자격범위와 작업조건 일치', '자격갱신 및 교육이력', '용접사별 품질이력 확인'] }),

  // ===== Q-Cost관리 =====
  S({ id: 'qcost-item', title: '기준정보관리', group: 'Q-Cost관리', path: '/qcost/items', type: 'list',
    purpose: '예방·평가·내부실패·외부실패 비용구분 코드를 관리. 사용 중인 코드는 삭제 대신 사용중지.',
    relations: [{ field: '사용처', from: 'Q-Cost 세부항목', desc: '세부항목의 상위 비용구분' }],
    dropdowns: [{ field: '분류', source: '고정값', values: '예방비용/평가비용/내부실패비용/외부실패비용' }],
    search: ['필터·칩: 분류', '검색: 코드·명·산출기준'], sort: '표시순서 오름차순',
    columns: ['비용구분 코드', '분류', '비용구분명', '산출기준', '표시순서', '사용', '비고'],
    sq: ['품질비용 구분 체계', '예방·평가·실패비용 분류'] }),
  S({ id: 'qcost-detail', title: '세부항목관리', group: 'Q-Cost관리', path: '/qcost/details', type: 'list',
    purpose: '비용구분별 세부항목과 계산기준(수량/시간/직접금액)·계정과목·담당부서·자동연계를 관리.',
    relations: [{ field: '상위 비용구분', from: 'Q-Cost 기준정보', desc: '선택 시 분류 자동' }, { field: '담당부서', from: '부서관리', desc: '드롭다운' }, { field: 'Q-Cost 등록', from: 'Q-Cost 관리', desc: '계산기준·단가 자동 적용' }],
    dropdowns: [{ field: '상위 비용구분', source: 'qcost_items', values: '등록 비용구분' }, { field: '계산기준', source: '고정값', values: '수량기준/시간기준/직접금액' }, { field: '자동연계', source: '고정값', values: '부적합/검사/재작업/폐기/클레임' }],
    search: ['칩: 분류', '검색: 세부항목 코드·명·계정과목'], sort: '표시순서 오름차순',
    columns: ['세부항목 코드', '분류', '상위 비용구분', '세부항목명', '계산기준', '단가', '계정과목', '담당부서', '자동연계', '사용'],
    feats: [['기본항목 생성', '재작업비·폐기비·검사비 등 표준 세부항목 11종을 일괄 생성'], ['계산기준 안내', '선택한 계산기준에 따라 등록 시 적용될 계산식을 안내']],
    alerts: ['등록된 Q-Cost에서 사용 중인 항목은 삭제 불가(사용중지로 변경)', '동일 비용구분 내 중복 항목명 등록 불가'],
    sq: ['품질비용 세부 산출기준', '계정과목·부서 연계'] }),
  S({ id: 'qcost-rec', title: 'Q-Cost 관리', group: 'Q-Cost관리', path: '/qcost/records', type: 'list',
    purpose: '품질비용을 등록. 부적합번호 선택 시 품목·LOT·수량이 자동 입력되고 계산기준에 따라 금액이 자동 계산.',
    process: ['세부항목 선택(분류·계산기준 자동)', '부적합번호 선택(품목·LOT·수량 자동)', '수량·단가 또는 시간·시간당 단가 입력', '금액 자동계산 → 저장'],
    relations: [
      { field: '세부항목', from: 'Q-Cost 세부항목', desc: '선택 시 분류·계산기준·단가·부서 자동' },
      { field: '부적합', from: '부적합관리', desc: '선택 시 품목·LOT·공정·불량수량 자동' },
      { field: '품목·공정', from: '품목/표준공정관리', desc: '드롭다운' },
    ],
    dropdowns: [{ field: '세부항목', source: 'qcost_details', values: '사용 중인 세부항목' }, { field: '부적합번호', source: 'nonconformances', values: '등록 부적합' }],
    search: ['발생일 기간 조회', '칩: 분류', '검색: 등록번호·항목·품목·부적합번호'], sort: '발생일 내림차순',
    columns: ['등록번호', '발생일', '분류', '세부항목', '품목', '공정', 'LOT', '부적합', '수량/시간', '단가', '금액', '담당부서', '마감'],
    feats: [['자동계산', '수량×단가 또는 시간×시간당 단가를 실시간 계산하고 계산식을 함께 표시'], ['부적합 연계', '부적합 선택 시 품목·LOT·공정·불량수량 자동 입력'], ['반복등록', '동일 비용을 복사해 반복 등록']],
    alerts: ['계산금액 미입력 시 저장 불가', '마감된 항목은 삭제 불가'],
    sq: ['품질문제에 따른 손실비용 관리', '예방·평가·실패비용 구분', '부적합 건과 품질비용 연결', '개선활동 전·후 비용 비교'] }),
  S({ id: 'qcost-status', title: 'Q-Cost 현황', group: 'Q-Cost관리', path: '/qcost/status', type: 'chart',
    purpose: '월별·비용구분별·품목별·공정별 품질비용을 분석. 차트 클릭 시 원본 내역 표시.',
    relations: [{ field: '데이터', from: 'Q-Cost 관리', desc: 'qcost_records 집계' }],
    dropdowns: [{ field: '비용구분·품목·공정', source: '데이터', values: '등록 데이터' }],
    search: ['기간 조회(기본 당월)', '조건: 비용구분·품목·공정'], sort: '금액 내림차순',
    columns: ['통계(총비용/예방+평가/실패비용/실패비중)', '월별 추이', '비용구분별 비율', '품목별', '공정별', '세부항목별 상위', '원본 내역'],
    feats: [['전기간 대비 증감', '동일 길이 이전 기간 대비 증감률을 표시'], ['드릴다운', '차트 항목을 클릭하면 하단에 해당 원본 내역만 표시'], ['보고서 출력', 'CSV 내보내기 및 인쇄']],
    defs: ['기간 기본: 당월 1일 ~ 오늘', '월별 추이: 최근 6개월'],
    sq: ['품질비용 추이 관리', '실패비용 비중 개선', '개선활동 효과 검증'] }),

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

    <div class="grid-2" style="margin-bottom:16px">
      <div class="card"><div class="card__head">${icon('alert', 18)}<h3>예외처리 (Alert · 검증)</h3></div>
        <div class="card__body"><ul class="spec-list spec-list--alert">${alerts.map(a => `<li>${icon('alert', 13)} ${escapeHtml(a)}</li>`).join('')}</ul></div></div>
      <div class="card"><div class="card__head">${icon('shield', 18)}<h3>SQ 심사 확인사항</h3></div>
        <div class="card__body">${(s.sq || []).length
          ? `<ul class="spec-list">${s.sq.map(x => `<li>${icon('check', 13)} ${escapeHtml(x)}</li>`).join('')}</ul>`
          : `<div class="muted" style="padding:8px 2px">해당 화면의 직접적인 심사 확인사항은 없습니다. (연계 화면에서 관리)</div>`}</div></div>
    </div>

    <div class="flex between" style="margin-top:6px">
      ${prev ? `<button class="btn" data-goto="${prev.id}">${icon('chevronLeft', 16)} ${escapeHtml(prev.title)}</button>` : '<span></span>'}
      ${next ? `<button class="btn" data-goto="${next.id}">${escapeHtml(next.title)} ${icon('chevronRight', 16)}</button>` : '<span></span>'}
    </div>`;
  root.querySelector('#spec-print').onclick = () => window.print();
  root.querySelectorAll('[data-goto]').forEach(el => el.onclick = () => { location.hash = `#/spec/view?id=${el.dataset.goto}`; });
}
