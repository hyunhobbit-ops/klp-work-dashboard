-- 050: '보내기' 메일·카톡 양식 (견적서·디자인확인서·작업요청서) — 회사 공용
--  send-kit.js 가 읽고 저장. 행이 없으면 send-kit.js 의 기본 양식 사용
create table if not exists send_templates (
    id bigserial primary key,
    doc_type text not null check (doc_type in ('quote', 'dc', 'wr')),
    channel text not null check (channel in ('email', 'kakao')),
    subject text not null default '',
    body text not null default '',
    updated_by text default '',
    updated_at timestamptz not null default now(),
    company_id bigint not null references companies(id)
);
create unique index if not exists send_templates_uniq on send_templates(company_id, doc_type, channel);

drop trigger if exists trg_send_templates_company on send_templates;
create trigger trg_send_templates_company before insert on send_templates
    for each row execute function set_company_id();

alter table send_templates enable row level security;
drop policy if exists send_templates_company on send_templates;
create policy send_templates_company on send_templates for all to authenticated
    using (company_id = current_company_id())
    with check (company_id = current_company_id());
