-- ==========================================
-- 005 — proposals, products RLS (공개 SELECT 허용)
-- 게이트: Gate 3
-- 영향: 거래처 공유 링크 proposal-view.html 동작 유지.
--       anon은 SELECT만 가능, INSERT/UPDATE/DELETE는 차단.
-- ==========================================

-- ===== proposals =====
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proposals_all ON proposals;
DROP POLICY IF EXISTS proposals_anon_read ON proposals;
DROP POLICY IF EXISTS proposals_auth_all ON proposals;

CREATE POLICY proposals_anon_read ON proposals
  FOR SELECT TO anon USING (true);

CREATE POLICY proposals_auth_all ON proposals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== products =====
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_all ON products;
DROP POLICY IF EXISTS products_anon_read ON products;
DROP POLICY IF EXISTS products_auth_all ON products;

CREATE POLICY products_anon_read ON products
  FOR SELECT TO anon USING (true);

CREATE POLICY products_auth_all ON products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- VERIFICATION ------------------------------
-- anon 권한으로:
-- SELECT id FROM proposals LIMIT 1;  -- expect: succeeds (or empty if no data)
-- SELECT id FROM products LIMIT 1;   -- expect: succeeds
-- INSERT INTO proposals (id) VALUES ('hack-test');  -- expect: permission denied
-- DELETE FROM products;              -- expect: permission denied

-- ROLLBACK ----------------------------------
-- DROP POLICY IF EXISTS proposals_anon_read ON proposals;
-- DROP POLICY IF EXISTS proposals_auth_all ON proposals;
-- CREATE POLICY proposals_all ON proposals FOR ALL USING (true) WITH CHECK (true);
-- (products도 동일 패턴, DROP POLICY 에 IF EXISTS 사용)
