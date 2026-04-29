-- =============================================================
-- 프로젝트 카드(planning_posts)에 제목(title) 컬럼 추가
-- Supabase SQL Editor에서 실행
-- =============================================================

alter table public.planning_posts
    add column if not exists title text;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
