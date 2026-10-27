-- 국내 프로젝트 추가 공급처 — 디자인확인서는 하나인데 여러 곳에 발주할 때 (예: 회중시계 KODA + 패키지박스 하나케이스)
-- [{k, name, contact, item, qty, unit_price, vat:'VAT 별도'|'VAT 포함', etc, memo}]
-- supplier_revenue(매입액)에는 주 매입처 + 추가 공급처 합계가 들어감
alter table projects_domestic add column if not exists extra_suppliers jsonb not null default '[]'::jsonb;
