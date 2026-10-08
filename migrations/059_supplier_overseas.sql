-- 059: 해외 매입 (달러) — 국내 프로젝트 매입처 카드 '🌏 해외 매입'
--  null = 국내 매입. 값이 있으면 { cur:'USD', unit, rate(견적 환율), extras:[{name,amt,cur}], ivat(수입 부가세, null=자동 10%), pays:[{kind 선금/잔금/일괄/추가, usd, rate, date}] }
--  supplier_revenue 에는 원화 환산 매입액(물품 대금 + 부대비용 + 수입 부가세)을 앱이 넣음 → 마진·통계는 그대로
alter table projects_domestic add column if not exists supplier_overseas jsonb;
