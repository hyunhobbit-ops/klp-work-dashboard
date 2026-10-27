-- 074: 메일 홍보 배너 (마케팅 > ✉️ 메일 배너) — 이미지 + 하이퍼링크를 골라 복사해서 메일 하단에 붙여넣기
create table if not exists mail_banners (
    id bigserial primary key,
    title text not null default '',          -- 관리용 이름 (예: 2026 시계 카탈로그)
    image_url text not null default '',      -- planning-images/mail-banners/… 공개 주소
    link_url text not null default '',       -- 누르면 열릴 주소
    alt text not null default '',            -- 이미지가 안 보일 때 대신 나오는 글
    width int not null default 600,          -- 메일에서 보일 폭(px)
    sort int not null default 0,
    created_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    company_id bigint not null references companies(id)
);
drop trigger if exists trg_mail_banners_company on mail_banners;
create trigger trg_mail_banners_company before insert on mail_banners for each row execute function set_company_id();
drop trigger if exists trg_mail_banners_updated on mail_banners;
create trigger trg_mail_banners_updated before update on mail_banners for each row execute function set_updated_at();
alter table mail_banners enable row level security;
drop policy if exists mail_banners_company on mail_banners;
create policy mail_banners_company on mail_banners for all to authenticated using (company_id = current_company_id()) with check (company_id = current_company_id());
revoke all on mail_banners from anon;
grant select, insert, update, delete on mail_banners to authenticated;
grant usage, select on sequence mail_banners_id_seq to authenticated;
do $$ begin alter publication supabase_realtime add table mail_banners; exception when duplicate_object then null; end $$;
