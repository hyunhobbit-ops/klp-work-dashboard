-- ==========================================
-- 017 — anon 전체 열람 차단 (2/2)
-- 목적: 로그인 없이 proposals/products 테이블 전체를 읽을 수 있던
--       anon SELECT 정책 제거. 이후 외부 조회는 016의 토큰 RPC로만 가능.
-- 전제: 016 적용 + 새 프런트엔드(?key= 링크) 배포 완료 후 실행할 것.
--       (이 파일을 실행하는 순간 옛 ?id= 공유 링크는 동작을 멈춘다)
-- 실행: Supabase SQL Editor에서 전체 복사-붙여넣기 → Run
-- ==========================================

drop policy if exists proposals_anon_read on public.proposals;
drop policy if exists products_anon_read on public.products;

notify pgrst, 'reload schema';

-- VERIFICATION ------------------------------
-- anon 키로:  GET /rest/v1/proposals?select=id  → 빈 배열 []  (행 노출 없음)
-- anon 키로:  GET /rest/v1/products?select=id   → 빈 배열 []
-- anon 키로:  POST /rest/v1/rpc/get_shared_proposal {"p_token":"<실제 토큰>"} → 제안서 1건
-- ROLLBACK ----------------------------------
-- create policy proposals_anon_read on proposals for select to anon using (true);
-- create policy products_anon_read on products for select to anon using (true);
