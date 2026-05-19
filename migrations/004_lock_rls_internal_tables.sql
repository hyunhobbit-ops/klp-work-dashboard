-- ==========================================
-- 004 — 내부 16개 테이블 RLS 잠금 (authenticated 한정)
-- 게이트: Gate 3
-- 영향: anon이 내부 데이터 접근 불가. 인증된 사용자만 R/W/D.
-- ==========================================

-- ===== profiles =====
-- handleLogin이 인증 전에 name→email 매핑을 조회하므로 anon SELECT 허용 필수.
-- 5명 직원의 name/email/role이 anon에 노출되지만, 이미 app.js에 하드코딩된
-- 이름들이고 .local synthetic email은 공격 가치가 없음. 진짜 보호 대상인
-- password 컬럼은 007에서 제거되며 가장 중요한 인증 게이트는 Supabase Auth(JWT).
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_auth_all ON profiles;
DROP POLICY IF EXISTS profiles_anon_login_lookup ON profiles;

CREATE POLICY profiles_anon_login_lookup ON profiles
  FOR SELECT TO anon USING (true);

CREATE POLICY profiles_auth_all ON profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== projects_domestic =====
ALTER TABLE projects_domestic ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all projects_domestic" ON projects_domestic;
DROP POLICY IF EXISTS projects_domestic_auth_all ON projects_domestic;
CREATE POLICY projects_domestic_auth_all ON projects_domestic
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== clients_overseas =====
ALTER TABLE clients_overseas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_overseas_all ON clients_overseas;
DROP POLICY IF EXISTS clients_overseas_auth_all ON clients_overseas;
CREATE POLICY clients_overseas_auth_all ON clients_overseas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== clients =====
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_auth_all ON clients;
CREATE POLICY clients_auth_all ON clients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== quotes =====
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotes_select_all ON quotes;
DROP POLICY IF EXISTS quotes_insert_all ON quotes;
DROP POLICY IF EXISTS quotes_update_all ON quotes;
DROP POLICY IF EXISTS quotes_delete_all ON quotes;
DROP POLICY IF EXISTS quotes_auth_all ON quotes;
CREATE POLICY quotes_auth_all ON quotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== url_shortcuts =====
ALTER TABLE url_shortcuts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS url_shortcuts_select_all ON url_shortcuts;
DROP POLICY IF EXISTS url_shortcuts_insert_all ON url_shortcuts;
DROP POLICY IF EXISTS url_shortcuts_update_all ON url_shortcuts;
DROP POLICY IF EXISTS url_shortcuts_delete_all ON url_shortcuts;
DROP POLICY IF EXISTS url_shortcuts_auth_all ON url_shortcuts;
CREATE POLICY url_shortcuts_auth_all ON url_shortcuts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== margin_simulations =====
ALTER TABLE margin_simulations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS margin_simulations_select_all ON margin_simulations;
DROP POLICY IF EXISTS margin_simulations_insert_all ON margin_simulations;
DROP POLICY IF EXISTS margin_simulations_update_all ON margin_simulations;
DROP POLICY IF EXISTS margin_simulations_delete_all ON margin_simulations;
DROP POLICY IF EXISTS margin_simulations_auth_all ON margin_simulations;
CREATE POLICY margin_simulations_auth_all ON margin_simulations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== marketing_campaigns =====
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_campaigns_all ON marketing_campaigns;
DROP POLICY IF EXISTS marketing_campaigns_auth_all ON marketing_campaigns;
CREATE POLICY marketing_campaigns_auth_all ON marketing_campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== market_db =====
ALTER TABLE market_db ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "market_db all ops" ON market_db;
DROP POLICY IF EXISTS market_db_auth_all ON market_db;
CREATE POLICY market_db_auth_all ON market_db
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== product_categories =====
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_categories_all ON product_categories;
DROP POLICY IF EXISTS product_categories_auth_all ON product_categories;
CREATE POLICY product_categories_auth_all ON product_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== confirmations =====
ALTER TABLE confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS confirmations_auth_all ON confirmations;
CREATE POLICY confirmations_auth_all ON confirmations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== daily_tasks =====
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_tasks_auth_all ON daily_tasks;
CREATE POLICY daily_tasks_auth_all ON daily_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== deliveries =====
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deliveries_auth_all ON deliveries;
CREATE POLICY deliveries_auth_all ON deliveries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== projects_temp =====
ALTER TABLE projects_temp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_temp_auth_all ON projects_temp;
CREATE POLICY projects_temp_auth_all ON projects_temp
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== planning_projects =====
ALTER TABLE planning_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS planning_projects_auth_all ON planning_projects;
CREATE POLICY planning_projects_auth_all ON planning_projects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== planning_posts =====
ALTER TABLE planning_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS planning_posts_auth_all ON planning_posts;
CREATE POLICY planning_posts_auth_all ON planning_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- VERIFICATION ------------------------------
-- 1) RLS가 16개 테이블 모두 켜져있는지:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('profiles','projects_domestic','clients_overseas','clients','quotes',
--                     'url_shortcuts','margin_simulations','marketing_campaigns','market_db',
--                     'product_categories','confirmations','daily_tasks','deliveries',
--                     'projects_temp','planning_projects','planning_posts');
-- expect: 16 rows, rowsecurity = true 전부
--
-- 2) anon 권한으로 (대시보드 SQL Editor의 Run as → anon) 다음 시도:
-- SELECT * FROM projects_domestic LIMIT 1;  -- expect: empty (RLS 차단)
-- INSERT INTO daily_tasks (id) VALUES (gen_random_uuid()); -- expect: permission denied
-- SELECT name, email FROM profiles LIMIT 5; -- expect: 5 rows (anon SELECT 의도적 허용)

-- ROLLBACK ----------------------------------
-- 응급 시: 아래를 각 테이블에 실행하면 즉시 anon에게도 다시 열림 (단, 보안 손상)
-- DROP POLICY IF EXISTS <table>_auth_all ON <table>;
-- CREATE POLICY <table>_emergency_open ON <table> FOR ALL TO public USING (true) WITH CHECK (true);
