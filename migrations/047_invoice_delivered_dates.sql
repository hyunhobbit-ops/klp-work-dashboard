-- 047: 계산서 발행 · 납품 완료 날짜 (날짜만) — 체크할 때 입력
alter table projects_domestic add column if not exists invoice_date date;
alter table projects_domestic add column if not exists delivered_date date;
-- projects_domestic_inquiry_sync(): 상담 자동 기록에 "(10/1)" 날짜 — 실제 적용본은 Supabase 마이그레이션 invoice_delivered_dates 참고
