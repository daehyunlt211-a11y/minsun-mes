-- =====================================================================
-- 민선 MES·QMS — v4 마이그레이션
--   4M ↔ 생산관리 연계 · 4M/PPAP 강화 · 개발 4문서 항목 보강 (SQ 심사 대응)
--   Supabase SQL Editor 에서 실행하세요. (anon 키로는 DDL 실행 불가)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 4M 변경 — 변경등급 · 생산연계 · 품질검증 항목
-- ---------------------------------------------------------------------
alter table four_m_changes add column if not exists grade text;            -- 변경등급: 단순이력/내부승인/중요4M/비상
alter table four_m_changes add column if not exists source text;           -- 발생경로: 사전신청/생산중변경
alter table four_m_changes add column if not exists wo_no text;            -- 연계 작업지시
alter table four_m_changes add column if not exists process_id text;       -- 연계 POP 공정 id
alter table four_m_changes add column if not exists lot_no text;           -- 대상 LOT
alter table four_m_changes add column if not exists change_time timestamptz; -- 변경 시각(생산 중)
alter table four_m_changes add column if not exists before_qty numeric;     -- 변경 전 생산수량
alter table four_m_changes add column if not exists before_lot text;        -- 변경 전 LOT(세그먼트)
alter table four_m_changes add column if not exists after_lot text;         -- 변경 후 LOT(세그먼트)
alter table four_m_changes add column if not exists risk_review text;        -- 품질 위험성 검토
alter table four_m_changes add column if not exists initial_sample text;     -- 초도품 검사결과
alter table four_m_changes add column if not exists focus_inspect text;      -- 변경 후 집중검사 결과
alter table four_m_changes add column if not exists customer_notify_yn boolean; -- 고객 통보 여부
alter table four_m_changes add column if not exists quarantine_yn boolean;    -- 기존 생산품 격리 필요

-- ---------------------------------------------------------------------
-- 2) 작업지시 4M 스냅샷 — 생산 시작/변경 시점의 4M 조건을 세그먼트로 보존
--    seg_no 1 = 최초, 2·3… = 4M 변경 이후 구간 (변경 전/후 이력 분리)
-- ---------------------------------------------------------------------
create table if not exists wo_4m_snapshots (
  id uuid primary key default gen_random_uuid(),
  wo_no text,
  process_id text,            -- work_order_processes.id (공정별 스냅샷)
  seg_no int default 1,       -- 변경 세그먼트 번호
  lot_no text,                -- 이 세그먼트 LOT
  item_code text,
  item_name text,
  process text,
  -- Man
  man_worker text,
  man_inspector text,
  man_shift text,
  man_qualified boolean,
  -- Machine
  machine_equipment text,
  machine_no text,
  mold_no text,
  jig_no text,
  inspect_equip text,
  -- Material
  material_lot text,
  material_supplier text,
  material_spec text,
  material_qty numeric,
  -- Method
  work_std_no text,
  work_std_rev text,
  setup_condition text,
  inspect_std text,
  program_no text,
  -- 세그먼트 이력
  start_at timestamptz,
  end_at timestamptz,
  seg_qty numeric,            -- 이 세그먼트 생산수량
  fm_no text,                 -- 이 세그먼트를 시작시킨 4M 변경번호 (최초 세그먼트는 null)
  approved boolean default true, -- 4M 승인 여부 (중요/비상 변경 세그먼트는 승인 전 false)
  note text,
  created_at timestamptz default now()
);
create index if not exists idx_wo_4m_snap_wo on wo_4m_snapshots (wo_no);

-- ---------------------------------------------------------------------
-- 3) PPAP — 제출자료 확대 · 재승인 관리
-- ---------------------------------------------------------------------
alter table ppap_approvals add column if not exists chk_psw boolean;         -- PSW(제출승인서)
alter table ppap_approvals add column if not exists chk_msa boolean;         -- 측정시스템분석(MSA)
alter table ppap_approvals add column if not exists chk_capability boolean;  -- 공정능력(Cpk)
alter table ppap_approvals add column if not exists chk_material boolean;    -- 재질·성능시험
alter table ppap_approvals add column if not exists chk_appearance boolean;  -- 외관승인·한도견본
alter table ppap_approvals add column if not exists chk_sample boolean;      -- 초도품·생산샘플
alter table ppap_approvals add column if not exists car_project text;        -- 차종·프로젝트
alter table ppap_approvals add column if not exists reapproval_yn boolean;   -- 재승인 필요(설계/4M 변경)

-- ---------------------------------------------------------------------
-- 4) 개발 4문서 항목 보강
-- ---------------------------------------------------------------------
-- PFD: 특수공정 여부
alter table pfd_items add column if not exists special_process boolean;      -- 특수공정(용접·열처리·도금 등)
alter table pfd_items add column if not exists work_content text;            -- 작업내용
-- PFMEA: 조치우선순위(AP) · 과거불량 반영
alter table pfmea_items add column if not exists ap text;                    -- Action Priority: High/Medium/Low
alter table pfmea_items add column if not exists past_defect text;           -- 과거 고객/공정 불량 반영
-- 관리계획서: 기록방법
alter table control_plan_items add column if not exists record_method text;  -- 검사기록 방법(검사일지·SPC 등)
-- 작업표준서: 체결토크 · 용접조건
alter table work_std_steps add column if not exists torque text;             -- 체결토크
alter table work_std_steps add column if not exists weld_condition text;     -- 용접 전류·전압·시간
