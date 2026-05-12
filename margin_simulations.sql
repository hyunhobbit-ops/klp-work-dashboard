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
    sale_country text not null default 'domestic', -- 'domestic' | 'global' (우측 패널 통화 표시)
    exchange_rate numeric not null default 1500,   -- USD → KRW 환율
    quantity numeric not null default 1,           -- 수량
    sale_price numeric not null default 0,         -- 판매가 (1개, KRW 기준)
    sale_price_usd numeric not null default 0,     -- 판매가 (1개, USD 기준 — 듀얼 입력)
    sale_price_currency text not null default 'KRW', -- 'USD' | 'KRW' (판매가 입력 source-of-truth)
    sale_vat_included boolean default false,       -- 판매가 VAT 포함 여부 (레거시 — 단일 단가용)
    -- 판매 항목 배열 (펀딩 리워드처럼 여러 가격대 지원). 신규 canonical.
    -- 항목: { id, name, quantity, salePrice, salePriceUsd, salePriceCurrency, saleVatIncluded }
    sale_items jsonb not null default '[]'::jsonb,
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

-- =============================================================
-- 기존 테이블 호환 — 컬럼이 없는 경우 추가 (2026-05 마진계산기 확장)
-- 이미 테이블이 있는 환경에서도 안전하게 실행 가능
-- =============================================================
alter table public.margin_simulations
    add column if not exists sale_country text not null default 'domestic';
alter table public.margin_simulations
    add column if not exists sale_price_usd numeric not null default 0;
alter table public.margin_simulations
    add column if not exists sale_price_currency text not null default 'KRW';
alter table public.margin_simulations
    add column if not exists sale_items jsonb not null default '[]'::jsonb;

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
