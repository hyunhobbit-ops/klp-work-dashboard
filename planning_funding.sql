-- =============================================================
-- 펀딩 프로젝트 스키마 (planning_projects 테이블)
-- Supabase SQL Editor에서 실행
-- =============================================================
-- funding_meta 구조 (JSONB):
-- {
--   "client": "진행사 이름",
--   "manufacturer": "제조사 이름",
--   "targetAmount": 10000000,
--   "currency": "KRW" | "USD",
--   "targetQty": 1000,
--   "platform": "와디즈" | "텀블벅" | "킥스타터" | "기타 직접 입력 텍스트",
--   "startDate": "YYYY-MM-DD",
--   "endDate": "YYYY-MM-DD"
-- }

-- 1) 펀딩 메타 JSON 컬럼
alter table public.planning_projects
    add column if not exists funding_meta jsonb;

-- 2) access 컬럼이 'funding' 값을 허용하는지 보장
--    기존에 CHECK 제약이 있어 ('company','personal')만 허용되면 펀딩 저장이 실패하므로
--    해당 제약을 찾아 제거하고, 새 값 집합으로 다시 설정
do $$
declare
    r record;
begin
    -- planning_projects.access 관련 check 제약을 모두 드롭
    for r in
        select c.conname
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'planning_projects'
          and c.contype = 'c'
          and pg_get_constraintdef(c.oid) ilike '%access%'
    loop
        execute format('alter table public.planning_projects drop constraint %I', r.conname);
    end loop;
end$$;

-- 3) access 값 검증 제약을 funding 포함해서 재설정
alter table public.planning_projects
    add constraint planning_projects_access_check
    check (access in ('company', 'personal', 'funding'));
