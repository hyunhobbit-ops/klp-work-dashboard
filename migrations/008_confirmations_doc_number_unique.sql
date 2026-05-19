-- ==========================================
-- 008 — confirmations.doc_number UNIQUE 제약
-- 게이트: Phase 3 G1
-- 영향: 동시 INSERT 시 두 번째 트랜잭션이 23505로 실패 → 클라이언트 retry로 복구
-- 주의: 실행 전 중복 점검 쿼리 반드시 통과해야 함
-- ==========================================

-- VERIFICATION (사전) ----------------------
-- 실행 전 다음 쿼리가 0행이어야 한다. 중복이 있으면 그 행들을 어떻게 처리할지
-- 사장님과 결정 후 진행할 것 (어느 row를 살리고 어느 row를 지울지).
--
-- SELECT doc_number, COUNT(*)
--   FROM confirmations
--  WHERE doc_number IS NOT NULL
--  GROUP BY doc_number HAVING COUNT(*) > 1;

ALTER TABLE confirmations
  ADD CONSTRAINT confirmations_doc_number_unique UNIQUE (doc_number);

-- VERIFICATION (사후) ----------------------
-- 제약이 만들어졌는지:
-- SELECT conname, contype FROM pg_constraint
--  WHERE conname = 'confirmations_doc_number_unique';
-- expect: 1 row, contype = 'u'

-- ROLLBACK ----------------------------------
-- ALTER TABLE confirmations DROP CONSTRAINT confirmations_doc_number_unique;
