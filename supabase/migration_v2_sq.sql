-- =====================================================================
-- MINSUN MES·QMS 마이그레이션 v2 — SQ 심사 대응 상세 설계 반영
--   품질관리(검사규격 개정관리·초중종물·격리), 공구관리(QR·재고조정),
--   개발관리(PFMEA/PFD/관리계획서/작업표준서 상세), 변경관리(4M·PPAP 체크리스트),
--   계측기관리(R&R 관리대장/계획/평가), Q-Cost(세부항목·계산기준)
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행 (기존 데이터 유지)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 검사규격관리 — 마스터(개정단위) / 디테일(검사항목)
-- ---------------------------------------------------------------------
create table if not exists inspection_specs (
  id              uuid primary key default uuid_generate_v4(),
  spec_no         text unique not null,            -- 규격번호
  item_code       text not null,
  item_name       text,
  process         text,                            -- 공정검사 시 대상 공정
  inspect_type    text default '수입검사',         -- 수입검사 / 공정검사 / 출하검사
  rev             text default '00',               -- 개정번호
  apply_date      date,                            -- 적용일
  drawing_no      text,                            -- 도면번호
  std_file_url    text,                            -- 검사표준서 첨부
  writer          text,                            -- 작성자
  reviewer        text,                            -- 검토자
  approver        text,                            -- 승인자
  approve_date    date,
  approval_status text default '작성중',           -- 작성중 / 검토중 / 승인 / 폐기
  use_yn          boolean default true,            -- 적용 여부
  prev_spec_no    text,                            -- 이전 개정본(비교용)
  remark          text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists idx_ispec_item on inspection_specs(item_code, inspect_type);

create table if not exists inspection_spec_items (
  id             uuid primary key default uuid_generate_v4(),
  spec_no        text not null,                    -- 부모 규격번호
  seq            int default 10,
  inspect_item   text not null,                    -- 검사항목
  unit           text,                             -- 단위 (mm, ℃ 등)
  eval_method    text default '정량적',            -- 정량적 / 정성적
  spec_value     text,                             -- 기준값(정량) / 판정기준(정성)
  usl            numeric,                          -- 상한
  lsl            numeric,                          -- 하한
  tolerance      text,                             -- 허용공차(± 표기용)
  method         text,                             -- 검사방법
  inspect_cycle  text,                             -- 검사주기 (초물/중물/종물, 1회/LOT 등)
  sample_size    text,                             -- 샘플링 수량
  instrument     text,                             -- 사용 계측기(코드)
  char_type      text,                             -- 일반 / 중요특성 / 특별특성
  remark         text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index if not exists idx_ispecitem_spec on inspection_spec_items(spec_no);

-- ---------------------------------------------------------------------
-- 2. 검사 실적 확장 (계측기·성적서·초중종물·재검사)
-- ---------------------------------------------------------------------
alter table incoming_inspections add column if not exists spec_no text;          -- 적용 검사규격
alter table incoming_inspections add column if not exists instrument text;       -- 사용 계측기
alter table incoming_inspections add column if not exists sample_qty numeric default 0;
alter table incoming_inspections add column if not exists report_url text;       -- 검사성적서
alter table incoming_inspections add column if not exists photo_url text;
alter table incoming_inspections add column if not exists ncr_no text;           -- 불합격 시 부적합 연결

alter table process_inspections add column if not exists spec_no text;
alter table process_inspections add column if not exists inspect_stage text default '중물';  -- 초물 / 중물 / 종물
alter table process_inspections add column if not exists equipment text;         -- 설비(호기)
alter table process_inspections add column if not exists worker text;            -- 작업자
alter table process_inspections add column if not exists instrument text;
alter table process_inspections add column if not exists sample_qty numeric default 0;
alter table process_inspections add column if not exists photo_url text;
alter table process_inspections add column if not exists recheck_yn boolean default false;   -- 재검사 여부
alter table process_inspections add column if not exists ncr_no text;

alter table shipping_inspections add column if not exists spec_no text;
alter table shipping_inspections add column if not exists instrument text;
alter table shipping_inspections add column if not exists sample_qty numeric default 0;
alter table shipping_inspections add column if not exists package_check text;    -- 포장상태 확인
alter table shipping_inspections add column if not exists label_check text;      -- 라벨 확인
alter table shipping_inspections add column if not exists report_url text;
alter table shipping_inspections add column if not exists ncr_no text;

alter table inspection_details add column if not exists unit text;
alter table inspection_details add column if not exists usl numeric;
alter table inspection_details add column if not exists lsl numeric;
alter table inspection_details add column if not exists instrument text;
alter table inspection_details add column if not exists char_type text;
alter table inspection_details add column if not exists seq int default 0;

-- ---------------------------------------------------------------------
-- 3. 부적합관리 확장 (진행상태·격리·처리수량)
-- ---------------------------------------------------------------------
alter table nonconformances add column if not exists progress text default '발생';   -- 발생/식별·격리/처리결정/조치중/완료
alter table nonconformances add column if not exists source_type text;               -- 수입검사/공정검사/출하검사/공정/고객
alter table nonconformances add column if not exists source_no text;                 -- 연계 검사번호
alter table nonconformances add column if not exists equipment text;
alter table nonconformances add column if not exists isolate_qty numeric default 0;  -- 격리수량
alter table nonconformances add column if not exists sort_qty numeric default 0;     -- 선별수량
alter table nonconformances add column if not exists rework_qty numeric default 0;   -- 재작업수량
alter table nonconformances add column if not exists scrap_qty numeric default 0;    -- 폐기수량
alter table nonconformances add column if not exists accept_qty numeric default 0;   -- 특채수량
alter table nonconformances add column if not exists photo_url text;
alter table nonconformances add column if not exists owner text;                     -- 담당자
alter table nonconformances add column if not exists due_date date;                  -- 처리기한

-- 개선대책 확장 (임시/근본대책·유효성·수평전개)
alter table improvement_actions add column if not exists temp_action text;           -- 임시조치
alter table improvement_actions add column if not exists root_action text;           -- 근본대책
alter table improvement_actions add column if not exists before_url text;            -- 조치 전 자료
alter table improvement_actions add column if not exists after_url text;             -- 조치 후 자료
alter table improvement_actions add column if not exists effect_result text;         -- 유효성 평가 결과(적합/부적합)
alter table improvement_actions add column if not exists recur_yn boolean default false;  -- 재발 여부
alter table improvement_actions add column if not exists horizontal text;            -- 수평전개 결과
alter table improvement_actions add column if not exists approver text;
alter table improvement_actions add column if not exists approve_date date;

-- ---------------------------------------------------------------------
-- 4. 공구관리 확장 (QR·수명단위·점검주기·적용대상)
-- ---------------------------------------------------------------------
alter table tools add column if not exists tool_class text default '공구';       -- 공구 / 치공구 / 지그 / 게이지
alter table tools add column if not exists model text;
alter table tools add column if not exists life_unit text default '횟수';         -- 횟수 / 수량 / 시간
alter table tools add column if not exists check_cycle text;                      -- 점검주기
alter table tools add column if not exists apply_items text;                      -- 적용 품목(복수, 콤마)
alter table tools add column if not exists apply_processes text;                  -- 적용 공정(복수)
alter table tools add column if not exists apply_equipments text;                 -- 적용 설비(복수)
alter table tools add column if not exists photo_url text;
alter table tools add column if not exists drawing_url text;
alter table tools add column if not exists qr_code text;                          -- QR 코드값
alter table tools add column if not exists status text default '사용';            -- 사용 / 중지

alter table tool_movements add column if not exists serial_no text;               -- 제조번호/관리번호
alter table tool_movements add column if not exists po_no text;                   -- 발주번호
alter table tool_movements add column if not exists return_due date;              -- 반납예정일
alter table tool_movements add column if not exists return_qty numeric default 0; -- 반납수량
alter table tool_movements add column if not exists use_start date;               -- 사용시작일
alter table tool_movements add column if not exists dept text;                    -- 사용부서

alter table tool_disposals add column if not exists remain_life numeric default 0;   -- 잔여수명
alter table tool_disposals add column if not exists approver text;
alter table tool_disposals add column if not exists approve_date date;
alter table tool_disposals add column if not exists photo_url text;
alter table tool_disposals add column if not exists status text default '신청';       -- 신청 / 승인 / 반려

-- 공구 재고조정 (신규)
create table if not exists tool_adjustments (
  id            uuid primary key default uuid_generate_v4(),
  adj_no        text unique not null,
  adj_date      date default current_date,
  tool_code     text,
  tool_name     text,
  location      text,
  system_qty    numeric default 0,               -- 전산재고
  actual_qty    numeric default 0,               -- 실사재고
  adj_qty       numeric default 0,               -- 조정수량(실사-전산)
  reason        text,                            -- 조정사유
  worker        text,
  approver      text,
  approve_date  date,
  status        text default '신청',             -- 신청 / 승인 / 반려
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 5. 개발관리 — 문서 마스터 + 유형별 상세
-- ---------------------------------------------------------------------
alter table dev_docs add column if not exists customer text;
alter table dev_docs add column if not exists part_no text;                       -- 품번
alter table dev_docs add column if not exists apply_date date;

-- 5-1 PFMEA 상세
create table if not exists pfmea_items (
  id            uuid primary key default uuid_generate_v4(),
  doc_no        text not null,
  seq           int default 10,
  process       text,                             -- 공정
  func          text,                             -- 공정 기능/요구사항
  fail_mode     text,                             -- 고장형태
  fail_effect   text,                             -- 영향
  severity      int default 1,                    -- S
  fail_cause    text,                             -- 원인
  occurrence    int default 1,                    -- O
  prevent_ctrl  text,                             -- 예방관리
  detect_ctrl   text,                             -- 검출관리
  detection     int default 1,                    -- D
  rpn           int default 1,                    -- 위험도 S*O*D
  action_plan   text,                             -- 개선대책
  action_owner  text,
  action_due    date,
  after_sev     int,                              -- 개선 후 S
  after_occ     int,                              -- 개선 후 O
  after_det     int,                              -- 개선 후 D
  after_rpn     int,                              -- 개선 후 RPN
  char_type     text,                             -- 특별특성 표시
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_pfmea_doc on pfmea_items(doc_no);

-- 5-2 PFD 상세 (공정흐름)
create table if not exists pfd_items (
  id            uuid primary key default uuid_generate_v4(),
  doc_no        text not null,
  seq           int default 10,
  process_code  text,
  process_name  text,
  process_type  text,                             -- 가공/검사/이동/보관/외주
  equipment     text,
  input_item    text,                             -- 투입품
  output_item   text,                             -- 산출품
  inspect_yn    boolean default false,            -- 검사공정 여부
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_pfd_doc on pfd_items(doc_no);

-- 5-3 관리계획서 상세
create table if not exists control_plan_items (
  id            uuid primary key default uuid_generate_v4(),
  doc_no        text not null,
  seq           int default 10,
  process       text,
  ctrl_item     text,                             -- 관리항목(제품/공정 특성)
  char_type     text,                             -- 일반/중요/특별특성
  spec_value    text,                             -- 규격
  ctrl_method   text,                             -- 관리방법
  inspect_cycle text,                             -- 검사주기
  sample_size   text,
  instrument    text,                             -- 계측기
  reaction_plan text,                             -- 이상 시 조치
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_cp_doc on control_plan_items(doc_no);

-- 5-4 작업표준서 상세 (작업단계)
create table if not exists work_std_steps (
  id            uuid primary key default uuid_generate_v4(),
  doc_no        text not null,
  seq           int default 10,
  step_name     text,                             -- 작업단계
  method        text,                             -- 작업방법
  condition     text,                             -- 작업조건(회전수·이송·온도 등)
  photo_url     text,
  caution       text,                             -- 주의사항
  quality_check text,                             -- 품질확인사항
  reaction      text,                             -- 이상 시 조치
  tools_used    text,                             -- 사용 공구/치공구
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_wstd_doc on work_std_steps(doc_no);

-- ---------------------------------------------------------------------
-- 6. 변경관리 확장 (4M 영향·시험생산·문서개정 / PPAP 체크리스트)
-- ---------------------------------------------------------------------
alter table four_m_changes add column if not exists affect_items text;            -- 영향 품목(복수)
alter table four_m_changes add column if not exists affect_equipments text;
alter table four_m_changes add column if not exists trial_result text;            -- 시험생산 결과
alter table four_m_changes add column if not exists trial_date date;
alter table four_m_changes add column if not exists customer_approval_yn boolean default false;  -- 고객승인 필요
alter table four_m_changes add column if not exists customer_approval_url text;
alter table four_m_changes add column if not exists apply_date date;              -- 적용일
alter table four_m_changes add column if not exists apply_lot text;               -- 적용 시작 LOT
alter table four_m_changes add column if not exists doc_pfmea_yn boolean default false;   -- PFMEA 개정 필요
alter table four_m_changes add column if not exists doc_pfd_yn boolean default false;
alter table four_m_changes add column if not exists doc_cp_yn boolean default false;      -- 관리계획서
alter table four_m_changes add column if not exists doc_ws_yn boolean default false;      -- 작업표준서
alter table four_m_changes add column if not exists apply_status text default '미적용';   -- 미적용/적용중/완료
alter table four_m_changes add column if not exists approve_date date;

alter table ppap_approvals add column if not exists submit_seq int default 1;     -- 제출차수
alter table ppap_approvals add column if not exists part_no text;
alter table ppap_approvals add column if not exists apply_date date;              -- 양산 적용일
alter table ppap_approvals add column if not exists chk_pfd boolean default false;
alter table ppap_approvals add column if not exists chk_pfmea boolean default false;
alter table ppap_approvals add column if not exists chk_cp boolean default false;
alter table ppap_approvals add column if not exists chk_ws boolean default false;
alter table ppap_approvals add column if not exists chk_result boolean default false;   -- 검사결과
alter table ppap_approvals add column if not exists chk_drawing boolean default false;  -- 도면·사양서
alter table ppap_approvals add column if not exists chk_customer boolean default false; -- 고객 승인문서
alter table ppap_approvals add column if not exists reject_reason text;                 -- 보완요청 내용
alter table ppap_approvals add column if not exists reject_due date;                    -- 보완 기한

-- ---------------------------------------------------------------------
-- 7. 계측기관리 확장 + Gauge R&R 3종
-- ---------------------------------------------------------------------
alter table measuring_instruments add column if not exists inst_type text;        -- 계측기 구분
alter table measuring_instruments add column if not exists tolerance text;        -- 허용오차
alter table measuring_instruments add column if not exists dept text;             -- 사용부서
alter table measuring_instruments add column if not exists qr_code text;
alter table measuring_instruments add column if not exists photo_url text;
alter table measuring_instruments add column if not exists cert_url text;         -- 성적서
alter table measuring_instruments add column if not exists apply_items text;      -- 적용 검사항목

alter table calibrations add column if not exists cert_url text;                  -- 교정성적서 파일
alter table calibrations add column if not exists repair_desc text;               -- 수리내용
alter table calibrations add column if not exists status text default '완료';     -- 의뢰/진행/완료

-- 7-1 R&R 관리대장 (평가 기준 정의)
create table if not exists grr_registers (
  id            uuid primary key default uuid_generate_v4(),
  reg_no        text unique not null,
  item_code     text,
  item_name     text,
  process       text,
  inspect_item  text,                             -- 검사항목
  inst_code     text,
  inst_name     text,
  appraisers    int default 3,                    -- 평가자 수
  parts         int default 10,                   -- 시료 수
  trials        int default 3,                    -- 반복측정 횟수
  eval_std      text default 'AIAG MSA 4th',      -- 평가기준
  judge_std     text default '%GRR<10 적합, 10~30 조건부, >30 부적합',
  cycle_months  int default 12,                   -- 평가주기(개월)
  use_yn        boolean default true,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 7-2 R&R 평가계획
create table if not exists grr_plans (
  id            uuid primary key default uuid_generate_v4(),
  plan_no       text unique not null,
  reg_no        text,                             -- 관리대장 참조
  plan_date     date,                             -- 평가예정일
  item_code     text,
  inspect_item  text,
  inst_code     text,
  appraiser_list text,                            -- 평가자(복수)
  parts         int default 10,
  trials        int default 3,
  owner         text,                             -- 담당자
  status        text default '계획',              -- 계획 / 진행 / 완료 / 지연
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 7-3 R&R 측정값 (평가등록 상세)
create table if not exists grr_measures (
  id            uuid primary key default uuid_generate_v4(),
  rr_no         text not null,                    -- gauge_rr 참조
  part_no       int not null,                     -- 시료 번호
  appraiser     int not null,                     -- 평가자 번호(1,2,3)
  trial         int not null,                     -- 반복 회차
  value         numeric,
  created_at    timestamptz default now()
);
create index if not exists idx_grrm_rr on grr_measures(rr_no);

alter table gauge_rr add column if not exists reg_no text;                        -- 관리대장 참조
alter table gauge_rr add column if not exists plan_no text;                       -- 계획 참조
alter table gauge_rr add column if not exists process text;
alter table gauge_rr add column if not exists inspect_item text;
alter table gauge_rr add column if not exists repeatability numeric default 0;    -- 반복성(EV)
alter table gauge_rr add column if not exists reproducibility numeric default 0;  -- 재현성(AV)
alter table gauge_rr add column if not exists improve_action text;                -- 부적합 시 개선내용

-- ---------------------------------------------------------------------
-- 8. 용접기술관리 확장
-- ---------------------------------------------------------------------
alter table wps_docs add column if not exists apply_items text;                   -- 적용 품목(복수)
alter table wps_docs add column if not exists apply_process text;                 -- 적용 공정
alter table wps_docs add column if not exists thickness_range text;               -- 모재 두께범위
alter table wps_docs add column if not exists wire_spec text;                     -- 와이어 규격
alter table wps_docs add column if not exists interpass_temp text;                -- 층간온도
alter table wps_docs add column if not exists weld_equipment text;                -- 적용 용접기
alter table wps_docs add column if not exists approve_date date;
alter table wps_docs add column if not exists apply_date date;
alter table wps_docs add column if not exists file_url text;

alter table pqr_docs add column if not exists thickness text;                     -- 시험 모재 두께
alter table pqr_docs add column if not exists specimen_info text;                 -- 시험편 정보
alter table pqr_docs add column if not exists weld_condition text;                -- 실제 용접조건
alter table pqr_docs add column if not exists visual_result text;                 -- 외관시험
alter table pqr_docs add column if not exists tensile_result text;                -- 인장시험
alter table pqr_docs add column if not exists bend_result text;                   -- 굽힘시험
alter table pqr_docs add column if not exists other_result text;                  -- 기타시험
alter table pqr_docs add column if not exists qualified_range text;               -- 인정범위
alter table pqr_docs add column if not exists cert_url text;

alter table welders add column if not exists emp_no text;                         -- 사번
alter table welders add column if not exists base_metal text;                     -- 인정 모재
alter table welders add column if not exists thickness_range text;                -- 인정 두께범위
alter table welders add column if not exists eval_result text;                    -- 평가결과
alter table welders add column if not exists cert_url text;                       -- 자격증 이미지
alter table welders add column if not exists edu_url text;                        -- 교육자료

-- ---------------------------------------------------------------------
-- 9. Q-Cost 확장 (세부항목 + 계산기준)
-- ---------------------------------------------------------------------
alter table qcost_items add column if not exists sort_no int default 0;           -- 표시순서

create table if not exists qcost_details (
  id            uuid primary key default uuid_generate_v4(),
  detail_code   text unique not null,
  cost_code     text,                             -- 상위 비용구분(qcost_items.code)
  category      text,                             -- 예방/평가/내부실패/외부실패
  name          text not null,                    -- 세부항목명 (재작업비·폐기비·검사비 등)
  calc_type     text default '직접금액',          -- 수량기준 / 시간기준 / 직접금액
  unit_price    numeric default 0,                -- 단가 또는 시간당 단가
  account       text,                             -- 계정과목
  dept          text,                             -- 담당부서
  auto_link     text,                             -- 자동연계 (부적합/검사/재작업/폐기)
  sort_no       int default 0,
  use_yn        boolean default true,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table qcost_records add column if not exists cost_date date default current_date;  -- 발생일자
alter table qcost_records add column if not exists detail_code text;              -- 세부항목
alter table qcost_records add column if not exists detail_name text;
alter table qcost_records add column if not exists item_code text;
alter table qcost_records add column if not exists item_name text;
alter table qcost_records add column if not exists process text;
alter table qcost_records add column if not exists lot_no text;
alter table qcost_records add column if not exists ncr_no text;                   -- 부적합번호 연계
alter table qcost_records add column if not exists qty numeric default 0;
alter table qcost_records add column if not exists unit_price numeric default 0;
alter table qcost_records add column if not exists work_hours numeric default 0;  -- 작업시간
alter table qcost_records add column if not exists hour_rate numeric default 0;   -- 시간당 단가
alter table qcost_records add column if not exists calc_type text;
alter table qcost_records add column if not exists evidence_url text;             -- 증빙자료
alter table qcost_records add column if not exists closed_yn boolean default false;  -- 월 마감

-- ---------------------------------------------------------------------
-- 10. updated_at 트리거 + RLS (신규 테이블)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'inspection_specs','inspection_spec_items','tool_adjustments',
      'pfmea_items','pfd_items','control_plan_items','work_std_steps',
      'grr_registers','grr_plans','qcost_details'
    ])
  loop
    execute format('drop trigger if exists trg_%I_updated on %I;', t, t);
    execute format('create trigger trg_%I_updated before update on %I for each row execute function set_updated_at();', t, t);
  end loop;
end $$;

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'inspection_specs','inspection_spec_items','tool_adjustments',
      'pfmea_items','pfd_items','control_plan_items','work_std_steps',
      'grr_registers','grr_plans','grr_measures','qcost_details'
    ])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "allow_all" on %I;', t);
    execute format('create policy "allow_all" on %I for all using (true) with check (true);', t);
  end loop;
end $$;
