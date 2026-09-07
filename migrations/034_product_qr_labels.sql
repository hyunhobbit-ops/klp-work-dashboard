-- 034: 상품 라벨 QR 시스템
-- 보안 원칙: 익명(anon)에게는 테이블을 일절 열지 않는다.
--   공개 상품 페이지는 SECURITY DEFINER RPC 2개로만 접근하며,
--   그 함수가 반환하는 컬럼에 원가·재고가 아예 포함되지 않는다.
--   (프론트에서 숨기는 방식이 아니라 서버 응답 자체에 없음)

-- ============================================================
-- 1. products.public_code — 8자리 랜덤 코드
--    혼동 문자(0/O, 1/I/L) 제외한 32자 알파벳 사용
-- ============================================================
create or replace function gen_public_code()
returns text
language plpgsql volatile
set search_path = public
as $$
declare
    alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    code text;
    i int;
begin
    loop
        code := '';
        for i in 1..8 loop
            code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        end loop;
        exit when not exists (select 1 from products where public_code = code);
    end loop;
    return code;
end
$$;

alter table products add column if not exists public_code text;
update products set public_code = gen_public_code() where public_code is null;
alter table products alter column public_code set not null;
create unique index if not exists products_public_code_key on products(public_code);

-- 신규 상품에 자동 부여
create or replace function set_public_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.public_code is null or new.public_code = '' then
        new.public_code := gen_public_code();
    end if;
    return new;
end
$$;

drop trigger if exists trg_products_public_code on products;
create trigger trg_products_public_code
    before insert on products
    for each row execute function set_public_code();

-- ============================================================
-- 2. product_costs — 로그인해야만 보이는 내부 정보 (원가 + 재고)
--    RLS 경계를 하나로 모아 새는 구멍이 생기지 않게 한다
-- ============================================================
create table if not exists product_costs (
    id bigserial primary key,
    product_id bigint not null references products(id) on delete cascade,
    supplier_name text default '',
    cost_price integer default 0,
    min_sale_price integer default 0,
    memo text default '',
    stock_qty integer default 0,
    stock_location text default '',
    stocked_at date,
    company_id bigint not null references companies(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists product_costs_product_key on product_costs(product_id);

drop trigger if exists trg_product_costs_company on product_costs;
create trigger trg_product_costs_company
    before insert on product_costs
    for each row execute function set_company_id();

alter table product_costs enable row level security;
drop policy if exists product_costs_company on product_costs;
create policy product_costs_company on product_costs
    for all to authenticated
    using (company_id = current_company_id())
    with check (company_id = current_company_id());
-- anon 정책 없음 = 익명은 이 테이블에 접근 불가

-- ============================================================
-- 3. product_scans — 스캔 이력
-- ============================================================
create table if not exists product_scans (
    id bigserial primary key,
    product_id bigint not null references products(id) on delete cascade,
    scanned_at timestamptz not null default now(),
    user_id uuid,
    company_id bigint not null references companies(id)
);
create index if not exists product_scans_product_idx on product_scans(product_id, scanned_at desc);

alter table product_scans enable row level security;
drop policy if exists product_scans_company on product_scans;
create policy product_scans_company on product_scans
    for select to authenticated
    using (company_id = current_company_id());
-- 기록은 아래 RPC(security definer)로만 들어간다

-- ============================================================
-- 4. 공개 RPC — 익명에게 열어주는 유일한 통로
--    반환 컬럼에 원가·재고·company_id·id가 없다 (열거·유출 방지)
-- ============================================================
create or replace function get_public_product(p_code text)
returns table (
    public_code text,
    name text,
    description text,
    category text,
    image text,
    unit_price integer,
    vat_included boolean,
    status text,
    prints jsonb,
    packagings jsonb,
    labels jsonb,
    bulk_prices jsonb
)
language sql
security definer
stable
set search_path = public
as $$
    select p.public_code, p.name, p.description, p.category,
           p.image, p.unit_price, p.vat_included, p.status,
           p.prints, p.packagings, p.labels, p.bulk_prices
    from products p
    where p.public_code = upper(btrim(p_code))
    limit 1;
$$;

create or replace function log_product_scan(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id bigint;
    v_company bigint;
begin
    select id, company_id into v_id, v_company
    from products where public_code = upper(btrim(p_code)) limit 1;
    if v_id is null then return; end if;
    insert into product_scans(product_id, user_id, company_id)
    values (v_id, auth.uid(), v_company);
end
$$;

revoke all on function get_public_product(text) from public;
revoke all on function log_product_scan(text) from public;
grant execute on function get_public_product(text) to anon, authenticated;
grant execute on function log_product_scan(text) to anon, authenticated;

-- ============================================================
-- 034b: 필드 개편 (2026-09-04)
--   입고일(날짜) -> 제작기간(일수), 재고 위치 사진, 거래처 DB 연동, VAT 구분
-- ============================================================
alter table product_costs add column if not exists production_days integer default 0;
alter table product_costs drop column if exists stocked_at;
alter table product_costs add column if not exists stock_photo text default '';
alter table product_costs add column if not exists supplier_client_id bigint references clients(id) on delete set null;
alter table product_costs add column if not exists cost_vat_included boolean default false;
alter table product_costs add column if not exists min_price_vat_included boolean default false;
