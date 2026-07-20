-- ⚠️ 비상 롤백용 (025 회사 스코프 RLS로 KLP에 문제가 생겼을 때만 실행)
-- 회사 스코프 정책을 지우고 기존 "authenticated 전체 허용"으로 되돌린다.
-- (익명 public 개방 정책은 복원하지 않음 — 보안상 불필요. 앱은 authenticated로 동작)
do $$
declare t text;
declare tables text[] := array[
  'daily_tasks','clients','clients_overseas','projects_domestic','projects_temp',
  'quotes','products','product_categories','margin_simulations','confirmations',
  'push_subscriptions','deliveries','marketing_campaigns','market_db',
  'cash_accounts','cash_snapshots','planning_posts','planning_projects',
  'ad_campaigns','url_shortcuts','proposals','profiles'
];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop policy if exists %I on %I', t||'_company', t);
    execute format('drop policy if exists profiles_company on profiles');
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t||'_auth_all', t);
  end loop;
end $$;
-- meetings / meeting_actions 는 019 원본 정책으로 수동 복원 필요 (migrations/019_meetings.sql 참조)
