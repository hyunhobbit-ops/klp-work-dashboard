-- 세무·손익 (2026-11-10) — 설계: docs/tax-prep-plan-2026-11.md
-- tax_ledger      : 매입·매출 한 줄씩 (이카운트 매입/매출장, 직접 입력, 나중에 영수증·카드·은행)
-- tax_fixed_costs : 매달 나가는 고정비 (급여·이자·감가상각 등) — 손익 추정용
-- tax_settings    : 회사별 기준값 (2025 결산 등)
-- aside_jobs      : 대시보드 버튼 → 맥미니 tax-worker → Aside가 이카운트 조작. 지시문은 작업기 안에 고정, 여기엔 종류·날짜만
-- 권한: 자금확인과 같은 3명(김관택·이현주·김현호)만 — 화면뿐 아니라 RLS에서도 막음

create or replace function tax_can_access() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(current_profile_name() = any (array['김관택', '이현주', '김현호']), false)
$$;
revoke all on function tax_can_access() from public, anon;
grant execute on function tax_can_access() to authenticated, service_role;

-- ---------- 매입·매출 장부 ----------
create table if not exists tax_ledger (
  id bigserial primary key,
  company_id bigint not null references companies(id),
  txn_date date not null,
  doc_no text not null default '',                 -- 이카운트 '일자-No.' (예: 2025/01/02 -1)
  side text not null check (side in ('sales', 'purchase')),
  kind text not null default '',                   -- 유형명: 세금계산서·계산서·세금계산서(수입)·카드매출·영세율 …
  e_kind text not null default '',                 -- 전자구분: 전자-신·착오·계약해제 …
  partner text not null default '',
  detail text not null default '',
  supply numeric(16, 0) not null default 0,        -- 공급가액 (착오 등은 음수)
  vat numeric(16, 0) not null default 0,
  source text not null default 'manual' check (source in ('ecount', 'manual', 'receipt', 'card', 'bank')),
  account text not null default '',                -- 비용 분류 (직접 입력·영수증용)
  memo text not null default '',
  job_id bigint,
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists tax_ledger_date_idx on tax_ledger (company_id, txn_date);
create index if not exists tax_ledger_source_idx on tax_ledger (company_id, source, txn_date);

-- ---------- 고정비 ----------
create table if not exists tax_fixed_costs (
  id bigserial primary key,
  company_id bigint not null references companies(id),
  name text not null default '',
  category text not null default '기타' check (category in ('급여', '퇴직급여', '4대보험', '이자', '감가상각', '임차료', '보험료', '관리비', '기타')),
  monthly_amount numeric(16, 0) not null default 0,
  start_month date not null default date_trunc('month', now())::date,
  end_month date,                                   -- 비우면 계속
  memo text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 회사별 기준값 ----------
create table if not exists tax_settings (
  company_id bigint primary key references companies(id),
  baseline jsonb not null default '{}'::jsonb,      -- 지난 결산 숫자
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- Aside 작업 줄 ----------
create table if not exists aside_jobs (
  id bigserial primary key,
  company_id bigint not null references companies(id),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,       -- 날짜 등 값만 (작업기가 형식 검사)
  status text not null default 'queued',
  progress text not null default '',
  result_text text not null default '',
  result jsonb not null default '{}'::jsonb,
  requested_by text not null default '',
  auto boolean not null default false,              -- 작업기가 매일 스스로 넣은 작업
  error text not null default '',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
alter table aside_jobs drop constraint if exists aside_jobs_kind_check;
alter table aside_jobs add constraint aside_jobs_kind_check check (kind in ('ecount_ledger_import'));
alter table aside_jobs drop constraint if exists aside_jobs_status_check;
alter table aside_jobs add constraint aside_jobs_status_check check (status in ('queued', 'running', 'done', 'error', 'cancelled'));
create index if not exists aside_jobs_status_idx on aside_jobs (status, created_at);

-- ---------- RLS: 회사 + 3명 ----------
do $$
declare t text;
begin
  foreach t in array array['tax_ledger', 'tax_fixed_costs', 'tax_settings', 'aside_jobs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_access', t);
    execute format('create policy %I on %I to authenticated using (company_id = current_company_id() and tax_can_access()) with check (company_id = current_company_id() and tax_can_access())', t || '_access', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
    execute format('drop trigger if exists %I on %I', 'trg_' || t || '_company', t);
    execute format('create trigger %I before insert on %I for each row execute function set_company_id()', 'trg_' || t || '_company', t);
  end loop;
end $$;
grant usage on sequence tax_ledger_id_seq, tax_fixed_costs_id_seq, aside_jobs_id_seq to authenticated;

-- 사람이 넣는 작업은 대기 상태로만
drop policy if exists aside_jobs_insert_queued on aside_jobs;
create policy aside_jobs_insert_queued on aside_jobs as restrictive for insert to authenticated
  with check (status = 'queued' and auto = false);

create or replace function tax_touch_updated() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_tax_fixed_costs_touch on tax_fixed_costs;
create trigger trg_tax_fixed_costs_touch before update on tax_fixed_costs for each row execute function tax_touch_updated();
drop trigger if exists trg_tax_settings_touch on tax_settings;
create trigger trg_tax_settings_touch before update on tax_settings for each row execute function tax_touch_updated();

do $$ begin
  alter publication supabase_realtime add table aside_jobs;
exception when duplicate_object then null; end $$;

-- ---------- 기간 통째로 바꿔 넣기 ----------
-- 같은 기간·같은 출처(기본 ecount) 행을 지우고 p_rows로 다시 넣음. 한 트랜잭션.
-- p_rows: [{txn_date, doc_no, side, kind, e_kind, partner, detail, supply, vat}]
create or replace function tax_ledger_replace(p_from date, p_to date, p_rows jsonb,
                                              p_source text default 'ecount', p_job bigint default null,
                                              p_company bigint default null)
returns int language plpgsql security invoker set search_path = public as $$
declare
  cid bigint := coalesce(p_company, current_company_id());
  n int;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not tax_can_access() then
    raise exception '권한이 없습니다';
  end if;
  if cid is null then raise exception '회사를 알 수 없습니다'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception '기간이 잘못됐습니다'; end if;
  if p_source not in ('ecount', 'card', 'bank') then raise exception '바꿔 넣을 수 없는 출처: %', p_source; end if;

  delete from tax_ledger where company_id = cid and source = p_source and txn_date between p_from and p_to;
  insert into tax_ledger (company_id, txn_date, doc_no, side, kind, e_kind, partner, detail, supply, vat, source, job_id, created_by)
  select cid, (r->>'txn_date')::date, coalesce(r->>'doc_no', ''), r->>'side',
         coalesce(r->>'kind', ''), coalesce(r->>'e_kind', ''), coalesce(r->>'partner', ''), coalesce(r->>'detail', ''),
         coalesce((r->>'supply')::numeric, 0), coalesce((r->>'vat')::numeric, 0),
         p_source, p_job, coalesce(current_profile_name(), 'Aside')
  from jsonb_array_elements(p_rows) r
  where (r->>'txn_date')::date between p_from and p_to;
  get diagnostics n = row_count;
  insert into tax_settings (company_id, settings) values (cid, '{}'::jsonb) on conflict (company_id) do nothing;
  update tax_settings set settings = settings || jsonb_build_object(p_source || '_imported_at', now(),
                                                                    p_source || '_imported_range', jsonb_build_array(p_from, p_to),
                                                                    p_source || '_imported_rows', n)
   where company_id = cid;
  return n;
end $$;
revoke all on function tax_ledger_replace(date, date, jsonb, text, bigint, bigint) from public, anon;
grant execute on function tax_ledger_replace(date, date, jsonb, text, bigint, bigint) to authenticated, service_role;

-- ---------- 작업 실패 → 김현호 카톡 (3시간에 한 번) ----------
create or replace function aside_jobs_notify_error() returns trigger
language plpgsql security definer set search_path = public as $$
declare last_at timestamptz;
begin
  if new.status <> 'error' or old.status = 'error' then return new; end if;
  select nullif(value, '')::timestamptz into last_at from app_config where key = 'aside_job_error_notified_at';
  if last_at is not null and last_at > now() - interval '3 hours' then return new; end if;
  insert into app_config(key, value) values ('aside_job_error_notified_at', now()::text)
    on conflict (key) do update set value = excluded.value;
  perform net.http_post(
    url := 'http://api-gw:8000/functions/v1/kakao',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-kakao-secret', (select value from app_config where key = 'kakao_send_secret')),
    body := jsonb_build_object('action', 'notify', 'items', jsonb_build_array(jsonb_build_object(
              'name', '김현호',
              'text', '⚠️ 세무·손익 Aside 작업 실패 #' || new.id || E'\n' || left(regexp_replace(coalesce(nullif(new.error, ''), new.result_text), '\s+', ' ', 'g'), 120),
              'url', 'https://klp-work-dashboard.vercel.app/#tax'))),
    timeout_milliseconds := 30000);
  return new;
exception when others then return new;
end $$;
drop trigger if exists trg_aside_jobs_notify_error on aside_jobs;
create trigger trg_aside_jobs_notify_error after update of status on aside_jobs
  for each row execute function aside_jobs_notify_error();

-- ---------- KLP 2025 결산 기준값 (NAS 0. 손익계산서·재무상태표_2025) ----------
insert into tax_settings (company_id, baseline) values (1, jsonb_build_object(
  '2025', jsonb_build_object(
    'revenue', 669687004, 'rev_goods', 575498765, 'rev_products', 51299864, 'rev_rent', 7200000, 'rev_fee', 35688375,
    'cogs', 286067789, 'gross', 383619215, 'sga', 364839999, 'op', 18779216,
    'nonop_income', 346942, 'nonop_expense', 18155033, 'interest', 17363974, 'pretax', 971125, 'corp_tax', 0, 'net', 971125,
    'sga_items', jsonb_build_object('임원급여', 67200000, '직원급여', 117537500, '퇴직급여', 24211399, '복리후생비', 13766238,
      '여비교통비', 5066877, '접대비', 1165000, '통신비', 1119627, '세금과공과금', 7705859, '감가상각비', 12632924,
      '수선비', 4420614, '보험료', 3089112, '차량유지비', 883040, '운반비', 54152454, '교육훈련비', 1793500,
      '도서인쇄비', 715000, '포장비', 9143900, '소모품비', 12060550, '지급수수료', 19787239, '광고선전비', 1151376, '건물관리비', 7237790),
    'inventory_begin', 228806800, 'inventory_end', 303220000,
    'cash', 81142204, 'receivable', 28113686, 'payable', 164000, 'short_loan', 122213466, 'long_loan', 287651485,
    'officer_loan', 51171867, 'total_assets', 769900193, 'total_liabilities', 484117918, 'equity', 285782275),
  '2024', jsonb_build_object(
    'revenue', 685190264, 'cogs', 369175271, 'gross', 316014993, 'sga', 325496856, 'op', -9481863,
    'interest', 17230814, 'pretax', -25198157, 'corp_tax', 36440, 'net', -25234597)
)) on conflict (company_id) do update set baseline = excluded.baseline;
