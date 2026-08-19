-- =====================================================================
-- 민선 MES·QMS — v8 마이그레이션
--   회의록(260814 개발) 반영: 도면관리 강화 (도면 유형·개정 이력)
--   Supabase SQL Editor 에서 실행하세요. (anon 키로는 DDL 실행 불가)
-- =====================================================================
alter table drawings add column if not exists drawing_type text;  -- 단품도/조립도/단조도/공구도
alter table drawings add column if not exists file_url text;      -- 도면 파일(URL 또는 data URL)
