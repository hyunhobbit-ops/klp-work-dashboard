-- 084: 견적(projects_temp) 품목에도 해외 매입(달러) — 국내 프로젝트(059)와 같은 모양
--  null = 국내 매입. { cur:'USD', unit, rate, extras:[{name,amt,cur}], ivat, pays:[] } (송금 기록은 국내 프로젝트에서)
--  supplier_unit_price = 원화 환산 단가, supplier_revenue = 물품 대금 + 부대비용 (부가세 제외 — 견적의 기존 기준)
alter table public.projects_temp add column if not exists supplier_overseas jsonb;
notify pgrst, 'reload schema';
