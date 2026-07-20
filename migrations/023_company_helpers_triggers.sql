-- 멀티테넌트 1단계: 회사 판별 함수 + INSERT 자동 태깅 트리거 + companies RLS 정책

-- 로그인 사용자의 소속 회사 번호 (security definer)
create or replace function current_company_id() returns bigint
language sql stable security definer set search_path = public as $$
  select company_id from profiles where auth_user_id = auth.uid() limit 1
$$;

-- INSERT 시 company_id 자동 기입 (앱이 안 보내도 DB가 채움)
create or replace function set_company_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.company_id is null then
    NEW.company_id := current_company_id();
  end if;
  return NEW;
end $$;

-- 모든 테넌트 테이블에 BEFORE INSERT 트리거 부착 (profiles 제외 — 온보딩에서 명시 지정)
do $$
declare t text;
declare tables text[] := array[
  'daily_tasks','meetings','meeting_actions','clients','clients_overseas',
  'projects_domestic','projects_temp','quotes','proposals','products','product_categories',
  'margin_simulations','confirmations','push_subscriptions','deliveries','marketing_campaigns',
  'market_db','cash_accounts','cash_snapshots','planning_posts','planning_projects',
  'ad_campaigns','url_shortcuts'
];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop trigger if exists trg_set_company_id on %I', t);
    execute format('create trigger trg_set_company_id before insert on %I for each row execute function set_company_id()', t);
  end loop;
end $$;

-- Task 1에서 미룬 companies RLS 정책 (이제 함수 존재)
drop policy if exists companies_self_select on companies;
create policy companies_self_select on companies
  for select to authenticated
  using (id = current_company_id());
