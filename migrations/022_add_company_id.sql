-- 멀티테넌트 1단계: 전 테넌트 테이블에 company_id 추가(NULL 허용) → KLP(1) 백필 → 인덱스
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
    if to_regclass('public.'||t) is null then
      raise notice 'skip missing table %', t; continue;
    end if;
    execute format('alter table %I add column if not exists company_id bigint references companies(id)', t);
    execute format('update %I set company_id = 1 where company_id is null', t);
    execute format('create index if not exists %I on %I(company_id)', 'idx_'||t||'_company', t);
  end loop;
end $$;
