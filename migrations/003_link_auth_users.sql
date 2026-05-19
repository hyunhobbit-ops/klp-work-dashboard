-- ==========================================
-- 003 — profiles.auth_user_id ← auth.users.id 연결
-- 게이트: Gate 2
-- 전제: 사장님이 Supabase Dashboard에서 4명 추가 완료
--       (김현호는 기존 hyunhobbit@naver.com 계정 그대로 재활용)
-- 영향: 앱 동작 변화 없음 (아직 app.js 안 바뀜)
-- ==========================================

UPDATE profiles p
   SET auth_user_id = u.id
  FROM auth.users u
 WHERE u.email = p.email
   AND p.auth_user_id IS NULL;

-- VERIFICATION ------------------------------
-- 다음 쿼리 결과: 5행, auth_user_id IS NULL이 0행이어야 함
-- SELECT name, email, auth_user_id FROM profiles ORDER BY name;
-- SELECT COUNT(*) FROM profiles WHERE auth_user_id IS NULL;  -- expect 0
--
-- auth.users에 실제로 5명 다 있는지:
-- SELECT u.email, p.name FROM auth.users u
-- LEFT JOIN profiles p ON p.auth_user_id = u.id
-- WHERE u.email IN (SELECT email FROM profiles);
-- expect: 5 rows, all p.name not null

-- ROLLBACK ----------------------------------
-- UPDATE profiles SET auth_user_id = NULL;
