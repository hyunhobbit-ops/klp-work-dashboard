-- ==========================================
-- 016 — 제안서 공유 토큰 도입 (1/2)
-- 목적: 공유 링크를 순차 번호(?id=3)에서 추측 불가 토큰(?key=uuid)으로 전환.
--       이 파일은 "준비" 단계 — 기존 anon 정책은 유지하므로 적용 직후에도
--       옛 링크가 계속 동작한다. (차단은 017에서)
-- 실행: Supabase SQL Editor에서 전체 복사-붙여넣기 → Run
-- ==========================================

-- 1) share_token 컬럼 추가 + 기존 행 백필
alter table public.proposals add column if not exists share_token uuid;
update public.proposals set share_token = gen_random_uuid() where share_token is null;
alter table public.proposals alter column share_token set default gen_random_uuid();
alter table public.proposals alter column share_token set not null;
create unique index if not exists proposals_share_token_key on public.proposals (share_token);

-- 2) 저장된 공유 링크를 새 형식으로 일괄 갱신
--    (대시보드 목록의 "공유 링크 복사" 버튼이 새 링크를 복사하도록)
update public.proposals
   set share_link = 'https://klp-work-dashboard.vercel.app/proposal-view.html?key=' || share_token::text
 where coalesce(share_link, '') <> '';

-- 3) 토큰 단건 조회 RPC — 제안서 1건 + 그 제안서에 담긴 상품만 묶어 반환
--    security definer: RLS를 우회하되, 토큰이 정확히 일치하는 1건만 노출
create or replace function public.get_shared_proposal(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'proposal', to_jsonb(pr),
    'products', coalesce((
        select jsonb_agg(to_jsonb(p))
          from public.products p
         where p.id in (
             select (e->>'productId')::bigint
               from jsonb_array_elements(pr.items) e
              where coalesce(e->>'productId', '') ~ '^[0-9]+$'
         )
    ), '[]'::jsonb)
  )
  from public.proposals pr
  where pr.share_token = p_token;
$$;

revoke all on function public.get_shared_proposal(uuid) from public;
grant execute on function public.get_shared_proposal(uuid) to anon, authenticated;

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';

-- VERIFICATION ------------------------------
-- select share_token from proposals limit 3;          -- 모든 행에 토큰 존재
-- select get_shared_proposal(share_token) is not null from proposals limit 1;  -- true
-- ROLLBACK ----------------------------------
-- drop function if exists public.get_shared_proposal(uuid);
-- alter table public.proposals drop column if exists share_token;
