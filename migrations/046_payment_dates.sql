-- 046: 선금 입금 · 잔금 입금 날짜 (채널 없이 날짜만) — 체크할 때 입력
alter table projects_domestic add column if not exists advance_payment_date date;
alter table projects_domestic add column if not exists final_payment_date date;
-- projects_domestic_inquiry_sync(): 상담 자동 기록에 "선금 입금 · 품목 (10/1)" — 실제 적용본은 Supabase 마이그레이션 payment_dates 참고
