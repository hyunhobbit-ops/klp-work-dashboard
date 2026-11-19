-- 자료실 > 회사 문서 (2026-11-19) — 회사 양식·규정·계약서 등 파일을 올리고 썸네일로 미리 보기
-- 파일은 비공개 버킷 company-docs (<company_id>/<yyyy>/<랜덤>_<파일명>), 썸네일은 같은 버킷 <company_id>/thumbs/…jpg
-- 썸네일은 브라우저가 올릴 때 만듦(PDF 첫 장·사진·엑셀 첫 시트·워드 첫 부분·PPT/한글 미리보기 그림)

create table if not exists company_docs (
    id bigint generated always as identity primary key,
    company_id bigint references companies(id) not null,
    title text not null default '',
    category text not null default '기타',
    memo text not null default '',
    file_path text not null,
    file_name text not null default '',
    mime text not null default '',
    size bigint not null default 0,
    ext text not null default '',
    thumb_path text,
    pinned boolean not null default false,
    created_by text not null default '',
    updated_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists company_docs_company_idx on company_docs (company_id, category, updated_at desc);

alter table company_docs enable row level security;
drop trigger if exists set_company_id on company_docs;
create trigger set_company_id before insert on company_docs for each row execute function set_company_id();
drop policy if exists company_docs_company on company_docs;
create policy company_docs_company on company_docs for all to authenticated
    using (company_id = current_company_id()) with check (company_id = current_company_id());
grant select, insert, update, delete on company_docs to authenticated;
revoke all on company_docs from anon;

do $$ begin
    alter publication supabase_realtime add table company_docs;
exception when duplicate_object then null; end $$;

-- 비공개 버킷 (한 파일 50MB — 서버 FILE_SIZE_LIMIT)
insert into storage.buckets (id, name, public) values ('company-docs', 'company-docs', false)
on conflict (id) do nothing;
drop policy if exists company_docs_obj_read on storage.objects;
create policy company_docs_obj_read on storage.objects for select to authenticated
    using (bucket_id = 'company-docs' and (storage.foldername(name))[1] = current_company_id()::text);
drop policy if exists company_docs_obj_insert on storage.objects;
create policy company_docs_obj_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'company-docs' and (storage.foldername(name))[1] = current_company_id()::text);
drop policy if exists company_docs_obj_update on storage.objects;
create policy company_docs_obj_update on storage.objects for update to authenticated
    using (bucket_id = 'company-docs' and (storage.foldername(name))[1] = current_company_id()::text);
drop policy if exists company_docs_obj_delete on storage.objects;
create policy company_docs_obj_delete on storage.objects for delete to authenticated
    using (bucket_id = 'company-docs' and (storage.foldername(name))[1] = current_company_id()::text);

notify pgrst, 'reload schema';

-- ROLLBACK
--   drop table if exists company_docs;
--   drop policy if exists company_docs_obj_read on storage.objects; (insert/update/delete 도)
--   delete from storage.buckets where id = 'company-docs';   -- 파일을 먼저 비워야 함
