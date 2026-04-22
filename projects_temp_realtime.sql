-- 매입매출 > 견적 의뢰 (projects_temp) 실시간 동기화 활성화
-- Supabase Dashboard > SQL Editor 에서 한 번 실행하세요.
-- 클라이언트의 subscribeTempProjectsRealtime() 은 이미 구현되어 있으므로,
-- 테이블을 supabase_realtime 퍼블리케이션에 추가만 하면 됩니다.

-- 중복 추가 시 에러를 피하기 위한 안전한 실행 (이미 등록돼 있으면 무시)
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects_temp'
    ) then
        alter publication supabase_realtime add table public.projects_temp;
    end if;
end $$;

-- 등록 확인
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'projects_temp';

-- PostgREST 스키마 캐시 리로드 (옵션)
notify pgrst, 'reload schema';
