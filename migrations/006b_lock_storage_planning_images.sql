-- ==========================================
-- 006b — Storage planning-images 버킷 쓰기 권한 잠금 (방어적)
-- 게이트: Gate 4
-- 영향: anon은 더 이상 planning-images에 업로드/수정/삭제 불가.
--       READ는 손대지 않음 (기존 정책 유지).
-- 주의: planning-images 버킷이 실제 존재하지 않거나 정책이 없어도
--       DROP POLICY IF EXISTS 패턴으로 안전하게 실행 가능.
-- ==========================================

DROP POLICY IF EXISTS "planning-images anon write"  ON storage.objects;
DROP POLICY IF EXISTS "planning-images anon update" ON storage.objects;
DROP POLICY IF EXISTS "planning-images anon delete" ON storage.objects;
DROP POLICY IF EXISTS "planning-images auth write"  ON storage.objects;
DROP POLICY IF EXISTS "planning-images auth update" ON storage.objects;
DROP POLICY IF EXISTS "planning-images auth delete" ON storage.objects;

CREATE POLICY "planning-images auth write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'planning-images');

CREATE POLICY "planning-images auth update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'planning-images');

CREATE POLICY "planning-images auth delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'planning-images');

-- READ 정책은 손대지 않음 (기존 public/anon read 정책이 있으면 그대로 유지)

-- VERIFICATION ------------------------------
-- 1) anon으로 업로드 시도 → permission denied 떨어져야 함
--    (브라우저에서 비로그인 상태로 sb.storage.from('planning-images').upload(...) 호출)
-- 2) 인증된 사용자(직원)는 정상 업로드 가능해야 함
-- 3) 기존 이미지가 보이던 곳은 그대로 보여야 함 (READ 정책 미변경)

-- ROLLBACK ----------------------------------
-- DROP POLICY IF EXISTS "planning-images auth write"  ON storage.objects;
-- DROP POLICY IF EXISTS "planning-images auth update" ON storage.objects;
-- DROP POLICY IF EXISTS "planning-images auth delete" ON storage.objects;
-- (anon 쓰기를 다시 열 일이 없으므로 ROLLBACK은 기본 "잠금만 해제" 형태)
