-- 048: 공급처 송금 날짜 (날짜만) — 체크할 때 입력
alter table projects_domestic add column if not exists supplier_payment_date date;
-- projects_domestic_inquiry_sync(): 상담 자동 기록에 "공급처 송금 · 품목 (10/2)" — 실제 적용본은 Supabase 마이그레이션 supplier_payment_date 참고
