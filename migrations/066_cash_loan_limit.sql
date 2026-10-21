-- 066: 대출 한도 칸 — 남은 한도(한도 − 대출잔액) 표시용 (2026-10-21 현호님 요청)
alter table public.cash_accounts add column if not exists credit_limit numeric(20,2);
update public.cash_accounts set credit_limit = 150000000 where id = 4 and credit_limit is null;  -- 중소기업자금 01-018 (구로동)
update public.cash_accounts set credit_limit = 280000000 where id = 5 and credit_limit is null;  -- 중소기업자금 32-00045
notify pgrst, 'reload schema';
