-- 상품 카테고리 (제안서 시스템)
-- 사용자가 + 버튼으로 새 카테고리를 추가할 수 있도록 별도 테이블로 관리.

create table if not exists public.product_categories (
    id bigserial primary key,
    name text not null unique,
    sort_order integer default 100,
    created_at timestamptz not null default now()
);

-- RLS: 대시보드 전체 공유 정책 (다른 테이블과 동일)
alter table public.product_categories enable row level security;

drop policy if exists product_categories_all on public.product_categories;
create policy product_categories_all on public.product_categories
    for all using (true) with check (true);

-- 기본 카테고리 시드 (이미 있으면 건너뜀)
insert into public.product_categories (name, sort_order) values
    ('시계',       10),
    ('생활용품',   20),
    ('사무용품',   30),
    ('상패,트로피', 40),
    ('기타',       999)
on conflict (name) do nothing;

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
