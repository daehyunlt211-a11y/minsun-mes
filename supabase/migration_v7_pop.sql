-- =====================================================================
-- 민선 MES·QMS — v7 마이그레이션
--   회의록(260814 생산) 반영: POP 세팅품/초·중·종물 측정 인터록
--   Supabase SQL Editor 에서 실행하세요. (anon 키로는 DDL 실행 불가)
--   ※ 미실행 상태에서도 앱은 정상 동작합니다(미존재 시 무시).
-- =====================================================================

-- POP 측정값 (세팅품/중물/종물) — 검사규격 대비 자동판정 결과
create table if not exists pop_measurements (
  id uuid primary key default uuid_generate_v4(),
  wo_no text,
  process_id text,        -- work_order_processes.id
  item_code text,
  process text,
  stage text,             -- 세팅품/중물/종물
  result text,            -- OK/NG
  detail text,            -- 측정 포인트별 값·판정 (JSON 문자열)
  worker text,
  measured_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_pop_meas_wo on pop_measurements (wo_no);

-- 불량 구분(재작업/폐기/특채) — 폐기분만 생산수량 차감 (생산 회의 4.7)
alter table work_order_processes add column if not exists scrap_qty numeric default 0;
alter table work_order_processes add column if not exists rework_qty numeric default 0;
alter table work_order_processes add column if not exists accept_qty numeric default 0;
alter table production_results add column if not exists scrap_qty numeric default 0;
alter table production_results add column if not exists rework_qty numeric default 0;
alter table production_results add column if not exists accept_qty numeric default 0;
