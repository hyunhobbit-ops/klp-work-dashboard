-- 088의 '우리가 낸 세금(원)'을 '구매자가 낸 판매세(외화)'로 바꿈 (2026-11-26, 현호님이 Etsy 영수증으로 알려 줌)
-- Etsy 영수증: Item total + Shipping price + Sales tax = Order total. 판매세는 쇼핑몰이 걷어 대신 냄 → 매출·마진에 넣지 않음, 기록·대조용
-- tax_krw는 쓰인 줄이 0건이라 지움
alter table global_shop_orders add column if not exists sales_tax numeric(14, 2) not null default 0;
alter table global_shop_orders drop column if exists tax_krw;
