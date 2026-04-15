-- ============================================================
-- 중고마켓DB 테이블 스키마
-- Supabase SQL Editor에서 한 번만 실행
-- ============================================================

create table if not exists market_db (
    id bigserial primary key,
    category text not null check (category in ('watch','goods','misc')),
    name text not null,
    status text default '판매가능',
    price text default '',
    sale text default '',
    description text default '',
    parts text default '',
    qty text default '',
    location text default '',
    page_url text default '',
    image text default '',
    ceo_junggo boolean default false,
    ceo_bungae boolean default false,
    ceo_danggeun boolean default false,
    iyj_junggo boolean default false,
    iyj_bungae boolean default false,
    iyj_danggeun boolean default false,
    khh_junggo boolean default false,
    khh_bungae boolean default false,
    khh_danggeun boolean default false,
    nko_junggo boolean default false,
    nko_bungae boolean default false,
    sort_order integer default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists market_db_category_idx on market_db(category);
create index if not exists market_db_sort_idx on market_db(category, sort_order, id);

alter table market_db enable row level security;

drop policy if exists "market_db all ops" on market_db;
create policy "market_db all ops"
    on market_db for all
    to anon, authenticated
    using (true)
    with check (true);

-- updated_at 자동 갱신 트리거
create or replace function market_db_touch_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists market_db_updated_at on market_db;
create trigger market_db_updated_at
    before update on market_db
    for each row execute function market_db_touch_updated_at();
