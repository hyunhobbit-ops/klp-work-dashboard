-- 039: 상담 — 가견적(디자인 확정 전 예상가 범위) 안내
-- 견적(projects_temp)과 분리해 매출·마진·국내 등록에 섞이지 않게 상담에만 저장
-- 형태: { items:[{item, qty, min, max}], vat:'VAT 별도'|'VAT 포함', lead:'제작기간', note:'안내 문구',
--         updated_at, sent_at, sent_count }
-- 상담 상태에 '가견적'(상담중과 견적발송 사이)이 추가됨 — 앱에서 안내 기록 시 자동 변경

alter table inquiries add column if not exists pre_estimate jsonb;
