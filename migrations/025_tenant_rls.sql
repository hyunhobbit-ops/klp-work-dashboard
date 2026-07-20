-- 멀티테넌트 T6: 테넌트 테이블 RLS를 회사 스코프로 조이기 (격리 실제 발동)
-- KLP(company_id=1)는 모든 유저·행이 1번이라 조건이 항상 참 → 기존과 동일하게 동작.

-- 1) 표준 테넌트 테이블: 기존 정책 전부 제거 후 회사 스코프 ALL 정책만 생성
do $$
declare r record;
declare t text;
declare std text[] := array[
  'daily_tasks','clients','clients_overseas','projects_domestic','projects_temp',
  'quotes','products','product_categories','margin_simulations','confirmations',
  'push_subscriptions','deliveries','marketing_campaigns','market_db',
  'cash_accounts','cash_snapshots','planning_posts','planning_projects',
  'ad_campaigns','url_shortcuts','proposals'
];
begin
  foreach t in array std loop
    if to_regclass('public.'||t) is null then continue; end if;
    for r in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on %I', r.policyname, t);
    end loop;
    execute format('alter table %I enable row level security', t);
    execute format($f$create policy %I on %I for all to authenticated
      using (company_id = current_company_id())
      with check (company_id = current_company_id())$f$, t||'_company', t);
  end loop;
end $$;

-- 2) meetings: 기존 비공개 규칙 유지 + 회사 경계 AND
drop policy if exists meetings_select on meetings;
drop policy if exists meetings_insert on meetings;
drop policy if exists meetings_update on meetings;
drop policy if exists meetings_delete on meetings;

create policy meetings_select on meetings for select to authenticated
using (company_id = current_company_id() and (
  (not coalesce(is_private,false)) or (author = current_profile_name())
  or (attendees ? current_profile_name())
  or (current_profile_role() = any (array['관리자','부장','대표']))
));
create policy meetings_insert on meetings for insert to authenticated
with check (company_id = current_company_id());
create policy meetings_update on meetings for update to authenticated
using (company_id = current_company_id() and (
  (author = current_profile_name()) or (current_profile_role() = any (array['관리자','부장','대표']))
));
create policy meetings_delete on meetings for delete to authenticated
using (company_id = current_company_id() and (
  (author = current_profile_name()) or (current_profile_role() = any (array['관리자','부장','대표']))
));

-- 3) meeting_actions: 회의 존재 + (쓰기는 작성자/관리자) + 회사 경계 AND
drop policy if exists meeting_actions_select on meeting_actions;
drop policy if exists meeting_actions_write on meeting_actions;

create policy meeting_actions_select on meeting_actions for select to authenticated
using (company_id = current_company_id()
  and exists (select 1 from meetings m where m.id = meeting_actions.meeting_id));
create policy meeting_actions_write on meeting_actions for all to authenticated
using (company_id = current_company_id() and exists (
  select 1 from meetings m where m.id = meeting_actions.meeting_id
    and ((m.author = current_profile_name()) or (current_profile_role() = any (array['관리자','부장','대표'])))
))
with check (company_id = current_company_id() and exists (
  select 1 from meetings m where m.id = meeting_actions.meeting_id
    and ((m.author = current_profile_name()) or (current_profile_role() = any (array['관리자','부장','대표'])))
));

-- 4) profiles: 익명 로그인 매핑(profiles_anon_login_lookup) 유지, 나머지 개방 정책 제거 후 회사 스코프
drop policy if exists profiles_auth_all on profiles;
drop policy if exists "전체 조회" on profiles;
create policy profiles_company on profiles for all to authenticated
using (company_id = current_company_id())
with check (company_id = current_company_id());

-- 5) company_id NOT NULL 확정 (전 테넌트 테이블)
do $$
declare t text;
declare tables text[] := array[
  'profiles','daily_tasks','meetings','meeting_actions','clients','clients_overseas',
  'projects_domestic','projects_temp','quotes','proposals','products','product_categories',
  'margin_simulations','confirmations','push_subscriptions','deliveries','marketing_campaigns',
  'market_db','cash_accounts','cash_snapshots','planning_posts','planning_projects',
  'ad_campaigns','url_shortcuts'
];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table %I alter column company_id set not null', t);
  end loop;
end $$;
