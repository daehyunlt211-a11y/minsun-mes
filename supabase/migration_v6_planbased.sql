-- =====================================================================
-- 민선 MES·QMS — v6 마이그레이션
--   회의록(260814 생산) 반영: 계획생산 전환 · 창고 신설
--   Supabase SQL Editor 에서 실행하세요. (anon 키로는 DDL 실행 불가)
--   ※ 미실행 상태에서도 앱은 정상 동작합니다(미존재 컬럼 자동 제외 저장).
-- =====================================================================

-- 창고 기준정보 (자재/외주/중간공정(반제품)/완제품)
create table if not exists warehouses (
  id uuid primary key default uuid_generate_v4(),
  code text, name text,
  wh_type text,          -- 자재창고/외주창고/중간공정창고/완제품창고
  location text, manager text,
  use_yn boolean default true, remark text,
  created_at timestamptz default now()
);

-- 생산계획/작업지시: 생산구분(수주/계획) · 입고창고
alter table production_plans add column if not exists prod_type text;  -- 수주생산/계획생산
alter table work_orders add column if not exists prod_type text;
alter table work_orders add column if not exists in_warehouse text;    -- 완료품 입고창고

-- 품목 여유율(%) — 드릴 등 공정 손실 대비 발주 가산 (구매 회의 3.10)
alter table items add column if not exists spare_rate numeric default 0;
