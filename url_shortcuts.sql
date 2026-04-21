-- =============================================================
-- 사이드바 URL 바로가기 (사용자 추가 URL)
-- Supabase SQL Editor에서 실행 필요
-- =============================================================

create table if not exists public.url_shortcuts (
    id bigserial primary key,
    title text not null,
    url text not null,
    category text not null,
    sort_order int default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists url_shortcuts_category_idx on public.url_shortcuts (category);
create index if not exists url_shortcuts_sort_idx on public.url_shortcuts (sort_order);

alter table public.url_shortcuts enable row level security;

drop policy if exists "url_shortcuts_select_all" on public.url_shortcuts;
drop policy if exists "url_shortcuts_insert_all" on public.url_shortcuts;
drop policy if exists "url_shortcuts_update_all" on public.url_shortcuts;
drop policy if exists "url_shortcuts_delete_all" on public.url_shortcuts;

create policy "url_shortcuts_select_all" on public.url_shortcuts for select using (true);
create policy "url_shortcuts_insert_all" on public.url_shortcuts for insert with check (true);
create policy "url_shortcuts_update_all" on public.url_shortcuts for update using (true);
create policy "url_shortcuts_delete_all" on public.url_shortcuts for delete using (true);
