-- =====================================================================
-- 민선 MES·QMS — v5 마이그레이션
--   회의록(260813~260814) 반영: 품목·수주·출하·POP 이상발생
--   Supabase SQL Editor 에서 실행하세요. (anon 키로는 DDL 실행 불가)
--   ※ 미실행 상태에서도 앱은 정상 동작합니다(미존재 컬럼 자동 제외 저장).
-- =====================================================================

-- 품목: 고객(1차사) 품번 · 차종 (개발 회의 3.1 / 3.8)
alter table items add column if not exists customer_part_no text;   -- 고객(1차사) 관리 품번
alter table items add column if not exists car_model text;          -- 차종 (개발·도면 화면 자동 표시)

-- 수주: 긴급 발주 구분 · 납품처 분리 (영업 회의 3.3 / 3.4)
alter table sales_orders add column if not exists urgent_yn boolean default false;  -- 긴급 발주
alter table sales_orders add column if not exists ship_to text;                      -- 납품처(고객사와 별도)

-- 출하지시: 긴급·납품처 연계
alter table shipping_orders add column if not exists urgent_yn boolean default false;
alter table shipping_orders add column if not exists ship_to text;

-- 비가동(이상 발생) 실적: 작업지시·공정·상세 연계 (생산 회의 4.5)
alter table equipment_downtimes add column if not exists wo_no text;   -- 연계 작업지시
alter table equipment_downtimes add column if not exists process text; -- 발생 공정
alter table equipment_downtimes add column if not exists note text;    -- 이상 상세/조치
