-- 해외 쇼핑몰 매출 (매입매출 > 해외 쇼핑몰, 탭 id gshop) — 2026-11-26
-- Etsy·Shopify·eBay B2C 주문 한 줄씩. 쇼핑몰 CSV 올리기(Aside도 같은 화면으로 올림) + 직접 입력
-- 예상 마진 = (판매액 − 수수료 − 환불) × 환율 − 실제 배송비(원)   ※ 원가는 빼지 않음 (현호님 결정)
-- 권한: 세무·손익과 같은 3명(tax_can_access) — 화면과 RLS 둘 다

create table if not exists global_shop_orders (
  id bigserial primary key,
  company_id bigint not null references companies(id),
  order_date date not null,
  shop text not null check (shop in ('Etsy', 'Shopify', 'eBay', '기타')),
  order_no text,                                    -- 쇼핑몰 주문번호 (CSV 다시 올릴 때 같은 주문 찾기). 직접 입력은 비워도 됨
  buyer text not null default '',
  country text not null default '',
  items text not null default '',
  qty int not null default 0,
  currency text not null default 'USD',
  sale_amount numeric(14, 2) not null default 0,    -- 구매자가 낸 금액 (상품+배송비 받은 것, 할인 뺀 값, 쇼핑몰이 낸 판매세 제외)
  shipping_charged numeric(14, 2) not null default 0, -- 그중 구매자가 낸 배송비 (참고용)
  fee_amount numeric(14, 2),                        -- 쇼핑몰 수수료 (비우면 설정의 쇼핑몰별 수수료율로 예상)
  refund_amount numeric(14, 2) not null default 0,
  fx_rate numeric(10, 2),                           -- 원 / 외화 1 (넣을 때 설정 환율, 바꿀 수 있음)
  ship_cost_krw numeric(12, 0),                     -- 우리가 낸 실제 배송비 (FedEx 등, 원). 비우면 '미입력'
  status text not null default '정상' check (status in ('정상', '환불', '취소')),
  tracking text not null default '',
  memo text not null default '',
  source text not null default 'manual' check (source in ('csv', 'manual')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint global_shop_orders_no_key unique (company_id, shop, order_no)
);
create index if not exists global_shop_orders_date_idx on global_shop_orders (company_id, order_date);

create table if not exists global_shop_settings (
  company_id bigint primary key references companies(id),
  settings jsonb not null default '{}'::jsonb,      -- { fx: {USD: 1400, ...}, fee: {Etsy: 10, ...} } (수수료는 %)
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['global_shop_orders', 'global_shop_settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('drop policy if exists %I on %I', t || '_access', t);
    execute format('create policy %I on %I to authenticated using (company_id = current_company_id() and tax_can_access()) with check (company_id = current_company_id() and tax_can_access())', t || '_access', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop trigger if exists %I on %I', 'trg_' || t || '_company', t);
    execute format('create trigger %I before insert on %I for each row execute function set_company_id()', 'trg_' || t || '_company', t);
  end loop;
end $$;
grant usage on sequence global_shop_orders_id_seq to authenticated;

create or replace function global_shop_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_global_shop_orders_touch on global_shop_orders;
create trigger trg_global_shop_orders_touch before update on global_shop_orders for each row execute function global_shop_touch();

do $$ begin
  alter publication supabase_realtime add table global_shop_orders;
exception when duplicate_object then null; end $$;
