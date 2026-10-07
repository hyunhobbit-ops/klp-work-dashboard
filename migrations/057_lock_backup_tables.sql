-- 057: 9/22 거래처 분류 정리 때 만든 백업 테이블이 RLS 꺼진 채 공개 API에 노출돼 있었음 (Supabase 보안 경고 rls_disabled_in_public, 2026-10)
--  → RLS 켜고 anon/authenticated 권한 회수. 데이터는 그대로 보존(관리자·서버만 접근)
alter table public.clients_category_backup_20260922 enable row level security;
revoke all on public.clients_category_backup_20260922 from anon, authenticated;
revoke all on public.clients_backup_20260714 from anon, authenticated;
-- 경고 정리: 검색 경로 고정
alter function public.ship_parts(text) set search_path = public;
alter function public.inquiry_items_text(jsonb) set search_path = public;
