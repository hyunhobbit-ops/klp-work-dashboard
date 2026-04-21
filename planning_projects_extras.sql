-- =============================================================
-- 개인 프로젝트 확장 필드 (장소 / 비용)
-- Supabase SQL Editor에서 실행 필요
-- =============================================================

alter table public.planning_projects add column if not exists location text;
alter table public.planning_projects add column if not exists cost numeric;
