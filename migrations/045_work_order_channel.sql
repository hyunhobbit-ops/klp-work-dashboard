-- 045: 작업요청서 발송 — 어느 채널로(카톡/이메일/문자/기타 직접 입력) 언제 공장에 보냈는지 (044와 같은 방식)
alter table projects_domestic add column if not exists work_order_channel text default '';
alter table projects_domestic add column if not exists work_order_date date;
-- projects_domestic_inquiry_sync(): 상담 자동 기록에 "작업요청서 발송 · 품목 (이메일 · 10/1)" — 실제 적용본은 Supabase 마이그레이션 work_order_channel 참고
