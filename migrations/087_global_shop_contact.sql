-- 해외 쇼핑몰 주문에 구매자 전화번호·이메일 (2026-11-26). 권한은 086과 같음 (세무·손익 3명만)
alter table global_shop_orders add column if not exists phone text not null default '';
alter table global_shop_orders add column if not exists email text not null default '';
