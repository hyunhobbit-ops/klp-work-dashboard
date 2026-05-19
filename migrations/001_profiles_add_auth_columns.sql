-- ==========================================
-- 001 — profiles에 Supabase Auth 연동 컬럼 추가
-- 게이트: Gate 1
-- 영향: 앱 동작 변화 없음 (신규 컬럼만 추가)
-- ==========================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- VERIFICATION ------------------------------
-- 다음 쿼리가 5행 모두 email/auth_user_id 컬럼 NULL을 반환해야 함:
-- SELECT name, email, auth_user_id FROM profiles ORDER BY name;

-- ROLLBACK ----------------------------------
-- ALTER TABLE profiles DROP COLUMN email, DROP COLUMN auth_user_id;
