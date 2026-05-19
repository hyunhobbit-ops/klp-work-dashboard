-- ==========================================
-- 006 — Storage market-db 버킷 쓰기 권한 잠금
-- 게이트: Gate 4
-- 영향: anon은 더 이상 업로드/수정/삭제 불가. READ는 그대로 public.
-- ==========================================

-- 기존 anon 쓰기 정책 제거
DROP POLICY IF EXISTS "market-db anon write"  ON storage.objects;
DROP POLICY IF EXISTS "market-db anon update" ON storage.objects;
DROP POLICY IF EXISTS "market-db anon delete" ON storage.objects;
DROP POLICY IF EXISTS "market-db auth write"  ON storage.objects;
DROP POLICY IF EXISTS "market-db auth update" ON storage.objects;
DROP POLICY IF EXISTS "market-db auth delete" ON storage.objects;

-- authenticated만 쓰기 가능
CREATE POLICY "market-db auth write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'market-db');

CREATE POLICY "market-db auth update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'market-db');

CREATE POLICY "market-db auth delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'market-db');

-- READ public 정책은 그대로 유지 (이미지 노출 필요)
-- "market-db public read" 정책은 손대지 않음

-- VERIFICATION ------------------------------
-- 1) anon으로 업로드 시도 → permission denied 떨어져야 함
--    (브라우저에서 비로그인 상태로 sb.storage.from('market-db').upload(...) 호출)
-- 2) 기존 이미지 public URL은 그대로 보여야 함
--    (https://vtulmuxkriklpiibiues.supabase.co/storage/v1/object/public/market-db/<path>)

-- ROLLBACK ----------------------------------
-- DROP POLICY "market-db auth write" ON storage.objects;
-- DROP POLICY "market-db auth update" ON storage.objects;
-- DROP POLICY "market-db auth delete" ON storage.objects;
-- CREATE POLICY "market-db anon write" ON storage.objects
--   FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'market-db');
-- (update, delete 동일 패턴 — TO anon, authenticated 로 권한 양쪽 다 복원)
