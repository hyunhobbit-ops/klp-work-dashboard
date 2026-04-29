-- =============================================================
-- 프로젝트 카드(planning_posts)에 정렬 순서(sort_order) 컬럼 추가
-- 드래그앤드롭으로 컬럼 내 카드 순서를 변경하기 위함
-- Supabase SQL Editor에서 실행
-- =============================================================

alter table public.planning_posts
    add column if not exists sort_order double precision;

-- 기존 행 백필: created_at의 epoch ms를 정렬값으로 사용 → 기존 순서 유지
update public.planning_posts
set sort_order = extract(epoch from created_at) * 1000
where sort_order is null;

-- 인덱스 (선택적): 컬럼별 정렬 조회 가속
create index if not exists idx_planning_posts_project_status_order
    on public.planning_posts (project_id, task_status, sort_order);

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
