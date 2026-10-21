-- 065: 자금확인에 '미수금'(아직 입금 안 된 받을 돈) 칸 추가 (2026-10-21 현호님 요청 — 성호 전독시 미입금)
alter table public.cash_accounts drop constraint if exists cash_accounts_category_check;
alter table public.cash_accounts add constraint cash_accounts_category_check
  check (category = any (array['deposit','loan','foreign','pension','payoneer','shopify','receivable']));
