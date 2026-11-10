-- 해외 소싱 업체 평가 (2026-11-10) — 진행하다 취소된 업체 등을 글로 남겨 다음 소싱 때 경고
-- 소싱 건마다 업체 행이 따로라(sourcing_suppliers) 평가는 업체 이름 기준(company_key)으로 모아 봄
create table if not exists sourcing_reviews (
  id bigserial primary key,
  company_id bigint not null references companies(id),
  company text not null default '',
  company_key text not null default '',
  verdict text not null default '주의' check (verdict in ('추천', '보통', '주의', '거래 안 함')),
  body text not null default '',
  project_id bigint references sourcing_projects(id) on delete set null,
  supplier_id bigint references sourcing_suppliers(id) on delete set null,
  author text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sourcing_reviews_key_idx on sourcing_reviews (company_id, company_key);
alter table sourcing_reviews enable row level security;
drop policy if exists sourcing_reviews_company on sourcing_reviews;
create policy sourcing_reviews_company on sourcing_reviews to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
grant select, insert, update, delete on sourcing_reviews to authenticated;
grant usage on sequence sourcing_reviews_id_seq to authenticated;
revoke all on sourcing_reviews from anon;
drop trigger if exists trg_sourcing_reviews_company on sourcing_reviews;
create trigger trg_sourcing_reviews_company before insert on sourcing_reviews for each row execute function set_company_id();
create or replace function sourcing_reviews_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_sourcing_reviews_touch on sourcing_reviews;
create trigger trg_sourcing_reviews_touch before update on sourcing_reviews for each row execute function sourcing_reviews_touch();
do $$ begin
  alter publication supabase_realtime add table sourcing_reviews;
exception when duplicate_object then null; end $$;
