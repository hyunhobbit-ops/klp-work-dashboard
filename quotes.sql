-- =============================================================
-- 견적서 (quotes) 테이블
-- Supabase SQL Editor에서 실행 필요
-- =============================================================

create table if not exists public.quotes (
    id bigserial primary key,
    doc_number text,
    doc_date date not null,
    valid_until date,

    company_name text not null,
    contact_person text,
    manager text,

    product_name text not null,
    quantity numeric not null default 0,
    unit text default '개',
    unit_price numeric not null default 0,
    unit_price_vat text default 'VAT 별도',
    color text default '-',
    print_color_size text default '시안 확인',

    print_method text default '없음',
    print_fee numeric default 0,
    print_fee_vat text default 'VAT 별도',
    print_fee_apply text default '1개당',

    packaging text default '개별박스',
    packaging_fee numeric default 0,
    packaging_fee_vat text default 'VAT 별도',
    packaging_fee_apply text default '1개당',

    shipping_type text default '',
    shipping_cost numeric default 0,
    shipping_vat text default 'VAT 별도',

    delivery_date date,
    recipient text,
    phone text,
    address text,

    note text,

    -- 다중 품목 배열 (각 요소는 {productName, quantity, unit, unitPrice, unitPriceVat,
    --   color, printColorSize, printMethod, printFee, printFeeVat, printFeeApply,
    --   packaging, packagingFee, packagingFeeVat, packagingFeeApply})
    -- 레거시 단일 품목 데이터는 위 flat 컬럼들을 그대로 사용 (items가 NULL이면 flat 컬럼에서 역변환)
    items jsonb,

    author text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 기존 테이블에 items 컬럼 추가 (이미 생성된 경우)
alter table public.quotes add column if not exists items jsonb;

create index if not exists quotes_doc_date_idx on public.quotes (doc_date desc);
create index if not exists quotes_company_name_idx on public.quotes (company_name);

alter table public.quotes enable row level security;

drop policy if exists "quotes_select_all" on public.quotes;
drop policy if exists "quotes_insert_all" on public.quotes;
drop policy if exists "quotes_update_all" on public.quotes;
drop policy if exists "quotes_delete_all" on public.quotes;

create policy "quotes_select_all" on public.quotes for select using (true);
create policy "quotes_insert_all" on public.quotes for insert with check (true);
create policy "quotes_update_all" on public.quotes for update using (true);
create policy "quotes_delete_all" on public.quotes for delete using (true);
