-- 해외 거래처 DB (자료실)
-- 간단한 명함 수준 정보만 저장. 국내 clients와 별도 테이블.

create table if not exists public.clients_overseas (
    id bigserial primary key,
    company_name text not null,
    items text,
    phone text,
    email text,
    location text,
    biz_type text,            -- '공장' | '에이전시' | '' (공백 허용)
    contact_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 업데이트 트리거 (updated_at 자동 갱신)
create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_clients_overseas_updated_at on public.clients_overseas;
create trigger trg_clients_overseas_updated_at
before update on public.clients_overseas
for each row execute function public.set_updated_at();

-- biz_type 값 제약 (NULL/공백 허용)
alter table public.clients_overseas drop constraint if exists clients_overseas_biz_type_check;
alter table public.clients_overseas add constraint clients_overseas_biz_type_check
    check (biz_type is null or biz_type in ('', '공장', '에이전시'));

-- RLS: 대시보드 전체 공유 정책 (다른 테이블과 동일)
alter table public.clients_overseas enable row level security;

drop policy if exists clients_overseas_all on public.clients_overseas;
create policy clients_overseas_all on public.clients_overseas
    for all using (true) with check (true);

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
