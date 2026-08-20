-- =====================================================================
-- 민선 MES·QMS — v10 마이그레이션
--   회의록(생산) 반영: POP 불량등록 → 부적합관리 판정(재작업/특채/폐기)
--   Supabase SQL Editor 에서 실행하세요. (anon 키로는 DDL 실행 불가)
-- =====================================================================
-- 부적합: POP 연계 · 판정 기록
alter table nonconformances add column if not exists wo_no text;         -- 연계 작업지시
alter table nonconformances add column if not exists process_id text;    -- 연계 POP 공정 id
alter table nonconformances add column if not exists judged_by text;      -- 판정자
alter table nonconformances add column if not exists judge_note text;     -- 판정 사유

-- 작업지시: 재작업 지시 연계
alter table work_orders add column if not exists is_rework boolean default false;
alter table work_orders add column if not exists rework_of text;   -- 원 작업지시
alter table work_orders add column if not exists ref_ncr text;     -- 연계 부적합번호
