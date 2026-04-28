-- 제안서 (제안서 시스템)
-- proposals 로컬 배열을 대체하는 Supabase 테이블
-- 상품 라인은 items jsonb 배열로 저장: [{ productId, quantity, subtotal }, ...]
-- 별도 proposal_items 테이블 없이 단일 테이블로 운영 (간단함 우선)

create table if not exists public.proposals (
    id bigserial primary key,
    title text not null,
    client_name text default '',
    client_contact text default '',
    client_phone text default '',
    client_email text default '',
    description text default '',
    valid_until date,
    assignee text default '',
    assignee_phone text default '',
    assignee_email text default '',
    status text default '작성 중',             -- 작성 중/발송 완료/계약 성사/미성사
    items jsonb default '[]'::jsonb,           -- [{ productId, quantity, subtotal }]
    total_amount integer default 0,
    sent_date date,
    share_link text default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- updated_at 자동 갱신 트리거 (set_updated_at 함수는 다른 테이블 SQL에서 정의됨)
create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_proposals_updated_at on public.proposals;
create trigger trg_proposals_updated_at
before update on public.proposals
for each row execute function public.set_updated_at();

-- RLS: 대시보드 전체 공유 정책 (다른 테이블과 동일)
alter table public.proposals enable row level security;

drop policy if exists proposals_all on public.proposals;
create policy proposals_all on public.proposals
    for all using (true) with check (true);

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
