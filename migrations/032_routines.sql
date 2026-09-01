-- 타임박스 루틴: 매일 자동으로 '할 일'에 나타나는 반복 작업
create table if not exists routines (
  id bigserial primary key,
  company_id bigint references companies(id),
  assignee text not null,
  title text not null,
  category text default 'work',
  duration_min int default 60,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
drop trigger if exists trg_set_company_id on routines;
create trigger trg_set_company_id before insert on routines for each row execute function set_company_id();
alter table routines enable row level security;
drop policy if exists routines_company on routines;
create policy routines_company on routines for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
-- 루틴에서 생성된 할 일 추적(하루 1회 중복 방지)
alter table daily_tasks add column if not exists routine_id bigint;
