-- =============================================================
-- 마진계산기 시뮬레이션 (margin_simulations) 테이블
-- Supabase SQL Editor에서 실행 필요
-- =============================================================

create table if not exists public.margin_simulations (
    id bigserial primary key,

    -- 시뮬레이션 식별
    name text not null,                  -- 시뮬레이션 이름 (예: '이니셜D 손목시계')
    product_name text default '',        -- 상품명
    client text default '',              -- 고객사
    manufacturer text default '',        -- 제작사
    sales_method text default '',        -- 판매방식 (납품/위탁/자사몰 등)
    note text default '',                -- 비고

    -- 글로벌 설정
    exchange_rate numeric not null default 1500,   -- USD → KRW 환율
    quantity numeric not null default 1,           -- 수량
    sale_price numeric not null default 0,         -- 판매가 (1개 기준)
    sale_vat_included boolean default false,       -- 판매가 VAT 포함 여부
    target_margin_rate numeric default null,       -- 목표 마진율(%) — 권장 판매가 역산용

    -- 카테고리/항목 (자유형 구조)
    -- categories: [
    --   {
    --     id, name, items: [
    --       { id, name, currency: 'USD'|'KRW',
    --         amountUsd, amountKrw, quantityMul: bool,
    --         vat: bool, note }
    --     ]
    --   }
    -- ]
    categories jsonb not null default '[]'::jsonb,

    author text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists margin_simulations_updated_idx
    on public.margin_simulations (updated_at desc);
create index if not exists margin_simulations_name_idx
    on public.margin_simulations (name);

alter table public.margin_simulations enable row level security;

drop policy if exists "margin_simulations_select_all" on public.margin_simulations;
drop policy if exists "margin_simulations_insert_all" on public.margin_simulations;
drop policy if exists "margin_simulations_update_all" on public.margin_simulations;
drop policy if exists "margin_simulations_delete_all" on public.margin_simulations;

create policy "margin_simulations_select_all" on public.margin_simulations for select using (true);
create policy "margin_simulations_insert_all" on public.margin_simulations for insert with check (true);
create policy "margin_simulations_update_all" on public.margin_simulations for update using (true);
create policy "margin_simulations_delete_all" on public.margin_simulations for delete using (true);

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
