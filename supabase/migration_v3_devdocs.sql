-- =====================================================================
-- MINSUN MES·QMS 마이그레이션 v3 — 개발문서 4종 연계 강화
--   PFD → PFMEA → 관리계획서 → 작업표준서 연계의 기준이 되는
--   "공정번호(process_no)"를 4개 문서에 공통 도입하고,
--   문서별 누락 항목(제품/공정 특성, 검사수량, 담당자, 안전수칙,
--   양품·불량 판정 예시 등)을 보강합니다.
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 공정번호 — 4개 문서 공통 (PFD에서 정의 → 나머지 문서가 승계)
-- ---------------------------------------------------------------------
alter table pfd_items          add column if not exists process_no text;   -- 예: 10, 20, 30
alter table pfmea_items        add column if not exists process_no text;
alter table control_plan_items add column if not exists process_no text;
alter table work_std_steps     add column if not exists process_no text;
alter table work_std_steps     add column if not exists process_name text; -- 작업표준서도 공정명 보유

create index if not exists idx_pfd_procno   on pfd_items(doc_no, process_no);
create index if not exists idx_pfmea_procno on pfmea_items(doc_no, process_no);
create index if not exists idx_cp_procno    on control_plan_items(doc_no, process_no);
create index if not exists idx_ws_procno    on work_std_steps(doc_no, process_no);

-- ---------------------------------------------------------------------
-- 2. PFD 보강 — 자재이동 / 외주 / 재작업·보관공정
-- ---------------------------------------------------------------------
alter table pfd_items add column if not exists material_flow text;         -- 자재 이동(투입/이송/보관 경로)
alter table pfd_items add column if not exists outsource_yn boolean default false;   -- 외주공정 여부
alter table pfd_items add column if not exists partner text;               -- 외주처
alter table pfd_items add column if not exists rework_yn boolean default false;      -- 재작업공정
alter table pfd_items add column if not exists storage_yn boolean default false;     -- 보관공정
alter table pfd_items add column if not exists char_type text;             -- 특별특성 발생 공정 표시

-- ---------------------------------------------------------------------
-- 3. PFMEA 보강 — 공정명(공정번호와 함께 표시) / 특별특성 근거
-- ---------------------------------------------------------------------
alter table pfmea_items add column if not exists process_name text;
alter table pfmea_items add column if not exists cp_reflected boolean default false;  -- 관리계획서 반영 여부

-- ---------------------------------------------------------------------
-- 4. 관리계획서 보강 — 제품/공정 특성 구분, 검사수량, 담당자, PFMEA 연계
-- ---------------------------------------------------------------------
alter table control_plan_items add column if not exists process_name text;
alter table control_plan_items add column if not exists char_kind text default '제품특성';  -- 제품특성 / 공정특성
alter table control_plan_items add column if not exists equipment text;    -- 설비/치공구
alter table control_plan_items add column if not exists inspect_qty text;  -- 검사수량(주기와 별도)
alter table control_plan_items add column if not exists owner text;        -- 담당자
alter table control_plan_items add column if not exists fmea_ref text;     -- 근거 PFMEA 고장형태

-- ---------------------------------------------------------------------
-- 5. 작업표준서 보강 — 안전수칙 / 양품·불량 판정 예시 / 도면 / 관리계획 연계
-- ---------------------------------------------------------------------
alter table work_std_steps add column if not exists equipment_op text;     -- 설비 조작 방법
alter table work_std_steps add column if not exists material_setup text;   -- 자재 장착 방법
alter table work_std_steps add column if not exists safety text;           -- 안전수칙
alter table work_std_steps add column if not exists ok_sample_url text;    -- 양품 판정 예시(사진)
alter table work_std_steps add column if not exists ng_sample_url text;    -- 불량 판정 예시(사진)
alter table work_std_steps add column if not exists drawing_url text;      -- 작업 도면
alter table work_std_steps add column if not exists inspect_cycle text;    -- 검사주기(관리계획서와 일치 필요)
alter table work_std_steps add column if not exists cp_ref text;           -- 근거 관리계획서 관리항목

-- ---------------------------------------------------------------------
-- 6. 개발문서 마스터 — 정합성 점검 결과 캐시(선택)
-- ---------------------------------------------------------------------
alter table dev_docs add column if not exists check_result text;           -- 최근 정합성 점검 결과 요약
alter table dev_docs add column if not exists check_date timestamptz;      -- 점검 일시

-- ---------------------------------------------------------------------
-- 7. 4M 변경 — 개발문서 4종 개정 연계 확인용
-- ---------------------------------------------------------------------
alter table four_m_changes add column if not exists doc_review_note text;  -- 문서 개정 검토 의견
