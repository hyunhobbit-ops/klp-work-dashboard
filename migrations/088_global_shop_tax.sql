-- 해외 쇼핑몰 주문에 우리가 낸 세금(원) — 미국 관세·세금 등 (2026-11-26). 예상 마진에서 뺌
alter table global_shop_orders add column if not exists tax_krw numeric(12, 0);
