-- 상품 DB (제안서 시스템)
-- productsDB 로컬 배열을 대체하는 Supabase 테이블
-- 이미지는 base64 data URL (text)로 저장. 추후 Storage 전환 가능.

create table if not exists public.products (
    id bigserial primary key,
    name text not null,
    description text default '',
    category text default '기타',
    image text default '',                       -- base64 data URL 또는 URL
    unit_price integer default 0,
    vat_included boolean default true,
    print_type text default '불가',              -- 불가/레이저각인/실크인쇄/패드인쇄/기타
    print_fee integer default 0,
    print_fee_apply text default '1개당',        -- 1개당 / 일괄
    packaging_type text default '기본박스',      -- 기본박스/선물포장/전용케이스/전용보관함/기타
    packaging_fee integer default 0,
    packaging_fee_apply text default '1개당',
    label_available boolean default true,
    label_fee integer default 0,
    label_fee_apply text default '1개당',
    status text default '판매 중',               -- 판매 중/품절/단종
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- updated_at 자동 갱신 트리거 (clients_overseas와 동일한 함수 재사용)
create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- 카테고리/상태 값 제약 (느슨하게 — '기타' 허용을 위해 화이트리스트 제거)
-- 필요 시 아래 제약 추가:
-- alter table public.products add constraint products_status_check
--     check (status in ('판매 중', '품절', '단종'));

-- RLS: 대시보드 전체 공유 정책 (다른 테이블과 동일)
alter table public.products enable row level security;

drop policy if exists products_all on public.products;
create policy products_all on public.products
    for all using (true) with check (true);

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
