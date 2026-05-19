-- ==========================================
-- 007 — profiles.password 평문 컬럼 영구 제거
-- 게이트: Gate 6
-- 전제: Gate 5 통과(코드 배포 후 5명 로그인 OK) + 3~7일 정상 운영 확인
-- 영향: 평문 비번 영구 소멸. 롤백 불가 (Gate 0 CSV 백업으로 수동 복원만 가능).
-- ==========================================

-- 실행 전 마지막 확인:
-- SELECT name, email, auth_user_id FROM profiles WHERE auth_user_id IS NULL;
-- → 위가 0행이어야만 실행할 것 (한 명이라도 NULL이면 로그인 불가능)
-- 아래 DO 블록이 자동으로 한 번 더 검증해 0행이 아니면 실행을 중단시킨다.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM profiles WHERE auth_user_id IS NULL) THEN
        RAISE EXCEPTION 'password 컬럼 제거 거부 — auth_user_id가 NULL인 profile 행이 % 개 있음. 먼저 003 마이그레이션 검증 통과 필요.',
            (SELECT COUNT(*) FROM profiles WHERE auth_user_id IS NULL);
    END IF;
END $$;

ALTER TABLE profiles DROP COLUMN IF EXISTS password;

-- VERIFICATION ------------------------------
-- password 컬럼이 사라졌는지:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'profiles';
-- expect: password 없음

-- ROLLBACK ----------------------------------
-- ALTER TABLE profiles ADD COLUMN password TEXT;
-- 그 후 Gate 0 백업 CSV로 직접 UPDATE
