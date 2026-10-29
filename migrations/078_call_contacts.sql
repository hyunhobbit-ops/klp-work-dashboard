-- 078: 통화 상대 번호부 (2026-10-29 현호님 요청)
--  통화 기록에서 직원이 회사명·담당자·직함을 적으면 번호(숫자만)로 기억 → 같은 번호의 지난 통화·다음 통화에 자동 표시
--  맥미니(process_call.py)는 새 통화를 저장할 때 이 번호부를 거래처 DB보다 먼저 봄. AI가 녹취에서 뽑은 이름보다도 우선
create table if not exists call_contacts (
    id bigserial primary key,
    number_key text not null,                    -- 숫자만 (01092140880)
    client_name text not null default '',
    contact_name text not null default '',
    contact_title text not null default '',
    updated_by text not null default '',
    updated_at timestamptz not null default now(),
    company_id bigint not null references companies(id),
    unique (company_id, number_key)
);
drop trigger if exists trg_call_contacts_company on call_contacts;
create trigger trg_call_contacts_company before insert on call_contacts
    for each row execute function set_company_id();

alter table call_contacts enable row level security;
drop policy if exists call_contacts_company on call_contacts;
create policy call_contacts_company on call_contacts for all to authenticated
    using (company_id = current_company_id())
    with check (company_id = current_company_id());
revoke all on call_contacts from anon;
grant select, insert, update, delete on call_contacts to authenticated;
grant usage, select on sequence call_contacts_id_seq to authenticated;

notify pgrst, 'reload schema';

-- VERIFICATION
--   select * from call_contacts where company_id = 1 order by updated_at desc;
-- ROLLBACK
--   drop table if exists call_contacts;
