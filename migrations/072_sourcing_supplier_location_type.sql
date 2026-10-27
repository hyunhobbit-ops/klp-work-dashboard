-- 072: 소싱 업체에 위치 · 업체 유형(제작업체/에이전시) (2026-10-27 현호님 요청)
alter table public.sourcing_suppliers add column if not exists location text not null default '';
alter table public.sourcing_suppliers add column if not exists biz_type text not null default '';
alter table public.sourcing_suppliers drop constraint if exists sourcing_suppliers_biz_type_check;
alter table public.sourcing_suppliers add constraint sourcing_suppliers_biz_type_check check (biz_type in ('', '제작업체', '에이전시'));
notify pgrst, 'reload schema';
