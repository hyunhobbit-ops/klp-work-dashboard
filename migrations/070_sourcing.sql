-- 070: 해외 소싱 (2026-10-27 현호님 요청 — 알리바바 등에서 받은 견적을 품목별로 모아 비교 → 결정한 업체는 국내 프로젝트에 연결)
--  sourcing_items  = 찾는 물건 한 건 (목표 수량·단가·납기, 상태, 연결된 국내 프로젝트)
--  sourcing_quotes = 그 물건에 대해 업체가 준 견적 한 줄 (단가 USD, 수량별 단가, MOQ, 리드타임, 운송, 사진, 원문 메모)
create table if not exists sourcing_items (
    id bigserial primary key,
    title text not null default '',               -- 찾는 물건
    spec text not null default '',                -- 원하는 사양 (재질·크기·인쇄 등)
    client text not null default '',              -- 고객사 (국내 프로젝트 매출처로 넘어감)
    target_qty int not null default 0,
    target_price numeric(14,2) not null default 0, -- 목표 매입 단가 (원)
    need_by date,
    status text not null default '진행 중',
    assignee text not null default '',
    images jsonb not null default '[]',
    memo text not null default '',
    rate numeric(10,2) not null default 0,         -- 비교용 환율 (원/$)
    domestic_id bigint references projects_domestic(id) on delete set null,
    inquiry_id bigint references inquiries(id) on delete set null,
    created_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    company_id bigint not null references companies(id),
    constraint sourcing_items_status_check check (status in ('진행 중', '결정', '보류', '취소'))
);
create table if not exists sourcing_quotes (
    id bigserial primary key,
    item_id bigint not null references sourcing_items(id) on delete cascade,
    supplier text not null default '',
    platform text not null default '알리바바',
    url text not null default '',
    contact text not null default '',
    cur text not null default 'USD',
    unit_price numeric(14,4) not null default 0,
    tiers jsonb not null default '[]',            -- [{qty, price}] 수량별 단가
    moq int not null default 0,
    lead_days int not null default 0,              -- 생산 기간(일)
    incoterm text not null default '',             -- EXW / FOB / CIF / DDP ...
    ship_cost numeric(14,2) not null default 0,    -- 운송비 (cur 기준, 전체)
    sample_price numeric(14,2) not null default 0,
    sample_days int not null default 0,
    images jsonb not null default '[]',
    memo text not null default '',                 -- 업체 메시지 원문·조건
    rating int not null default 0,                 -- 0~5
    chosen boolean not null default false,
    created_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    company_id bigint not null references companies(id)
);
create index if not exists sourcing_items_company_idx on sourcing_items(company_id, updated_at desc);
create index if not exists sourcing_quotes_item_idx on sourcing_quotes(item_id);

drop trigger if exists trg_sourcing_items_company on sourcing_items;
create trigger trg_sourcing_items_company before insert on sourcing_items for each row execute function set_company_id();
drop trigger if exists trg_sourcing_quotes_company on sourcing_quotes;
create trigger trg_sourcing_quotes_company before insert on sourcing_quotes for each row execute function set_company_id();

create or replace function sourcing_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_sourcing_items_updated on sourcing_items;
create trigger trg_sourcing_items_updated before update on sourcing_items for each row execute function sourcing_touch_updated_at();
drop trigger if exists trg_sourcing_quotes_updated on sourcing_quotes;
create trigger trg_sourcing_quotes_updated before update on sourcing_quotes for each row execute function sourcing_touch_updated_at();
-- 견적이 바뀌면 소싱 건 목록 순서도 최신으로
create or replace function sourcing_quotes_touch_item() returns trigger language plpgsql as $$
begin update sourcing_items set updated_at = now() where id = coalesce(new.item_id, old.item_id); return null; end $$;
drop trigger if exists trg_sourcing_quotes_touch_item on sourcing_quotes;
create trigger trg_sourcing_quotes_touch_item after insert or update or delete on sourcing_quotes for each row execute function sourcing_quotes_touch_item();

alter table sourcing_items enable row level security;
drop policy if exists sourcing_items_company on sourcing_items;
create policy sourcing_items_company on sourcing_items for all to authenticated
    using (company_id = current_company_id()) with check (company_id = current_company_id());
alter table sourcing_quotes enable row level security;
drop policy if exists sourcing_quotes_company on sourcing_quotes;
create policy sourcing_quotes_company on sourcing_quotes for all to authenticated
    using (company_id = current_company_id()) with check (company_id = current_company_id());
revoke all on sourcing_items, sourcing_quotes from anon;
grant select, insert, update, delete on sourcing_items, sourcing_quotes to authenticated;
grant usage, select on sequence sourcing_items_id_seq, sourcing_quotes_id_seq to authenticated;

do $$ begin
    alter publication supabase_realtime add table sourcing_items, sourcing_quotes;
exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';
