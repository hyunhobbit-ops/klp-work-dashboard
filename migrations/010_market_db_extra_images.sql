-- ==========================================
-- 010 — market_db.extra_images 컬럼 추가
-- 게이트: G1
-- 영향: 새 컬럼 + CHECK 제약(최대 5장). 기존 행은 빈 배열로 초기화.
-- ==========================================

ALTER TABLE market_db
  ADD COLUMN IF NOT EXISTS extra_images text[] DEFAULT ARRAY[]::text[];

-- 멱등성: 같은 이름의 제약이 이미 있으면 제거 후 재생성
ALTER TABLE market_db
  DROP CONSTRAINT IF EXISTS market_db_extra_images_max5;

ALTER TABLE market_db
  ADD CONSTRAINT market_db_extra_images_max5
  CHECK (cardinality(extra_images) <= 5);

-- VERIFICATION ----------------------------
-- 1) 컬럼 존재 + 기본값 빈 배열:
-- SELECT name, image, extra_images FROM market_db LIMIT 3;
-- expect: extra_images 컬럼 '{}' (빈 배열)
--
-- 2) CHECK 제약 존재:
-- SELECT conname FROM pg_constraint
--  WHERE conname = 'market_db_extra_images_max5';
-- expect: 1행
--
-- 3) CHECK 제약 동작:
-- INSERT INTO market_db (category, name, extra_images)
-- VALUES ('misc', 'TEST', ARRAY['1','2','3','4','5','6']);
-- expect: ERROR 23514 check_violation
-- (테스트 후) DELETE FROM market_db WHERE name = 'TEST';

-- ROLLBACK --------------------------------
-- ALTER TABLE market_db DROP CONSTRAINT IF EXISTS market_db_extra_images_max5;
-- ALTER TABLE market_db DROP COLUMN IF EXISTS extra_images;
