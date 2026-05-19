-- ==========================================
-- 002 — 5명 직원에 synthetic email 매핑
-- 게이트: Gate 1
-- 영향: 앱 동작 변화 없음
-- 주의: 김현호는 실제 이메일 (기존 Supabase Auth 계정 재활용)
-- ==========================================

UPDATE profiles SET email = 'leehyunju@klp.local'    WHERE name = '이현주';
UPDATE profiles SET email = 'hyunhobbit@naver.com'   WHERE name = '김현호';
UPDATE profiles SET email = 'yujieun@klp.local'      WHERE name = '유지은';
UPDATE profiles SET email = 'kujungdoo@klp.local'    WHERE name = '구정두';
UPDATE profiles SET email = 'kimkwantaek@klp.local'  WHERE name = '김관택';

-- VERIFICATION ------------------------------
-- 다음 쿼리 결과: 5행, email IS NULL인 행이 0개여야 함
-- SELECT name, email FROM profiles ORDER BY name;
-- SELECT COUNT(*) FROM profiles WHERE email IS NULL;  -- expect 0

-- ROLLBACK ----------------------------------
-- UPDATE profiles SET email = NULL WHERE name IN ('이현주','김현호','유지은','구정두','김관택');
