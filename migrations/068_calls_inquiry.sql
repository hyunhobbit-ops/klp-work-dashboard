-- 068: 통화 기록 → 상담 연결 (2026-10-22 현호님 요청)
--  통화마다 고객 정보 칸(회사·담당자·부서·직함·연락처·이메일 — AI가 미리 채우고 직원이 고침)
--  신규면 '새 상담으로 등록', 진행 중 상담이 있으면 그 상담 타임라인에 자동 기록(inquiry_id)
--  할 일(todos jsonb)은 항목마다 assignee·due·daily_task_id·inquiry_todo_id 를 가짐 (컬럼 추가 없음)

alter table calls add column if not exists contact_name text not null default '';
alter table calls add column if not exists contact_dept text not null default '';
alter table calls add column if not exists contact_title text not null default '';
alter table calls add column if not exists contact_phone text not null default '';
alter table calls add column if not exists contact_email text not null default '';
alter table calls add column if not exists inquiry_title text not null default '';      -- 새 상담 제목 제안
alter table calls add column if not exists inquiry_id bigint references inquiries(id) on delete set null;
alter table calls add column if not exists inquiry_log_id bigint references inquiry_logs(id) on delete set null;
alter table calls add column if not exists inquiry_link text not null default '';       -- auto(맥미니가 자동 연결) / manual / new(이 통화로 새 상담)
create index if not exists calls_inquiry_idx on calls(inquiry_id);

-- 이 통화의 상대와 관련된 '진행 중' 상담 찾기: 회사 이름(client_name_key) 또는 담당자 연락처(숫자만)
--  로그인한 직원은 자기 회사만(current_company_id), 맥미니(service role)는 p_company
create or replace function call_find_inquiries(p_company bigint, p_name text, p_number text)
returns table (id bigint, client text, title text, status text, contact_name text, last_contact_at timestamptz)
language sql stable security definer set search_path = public as $$
    select i.id, i.client, i.title, i.status, i.contact_name, i.last_contact_at
    from inquiries i
    where i.company_id = coalesce(current_company_id(), p_company)
      and i.status not in ('정산완료', '마감', '보류', '실패')
      and (
        (coalesce(p_name, '') <> '' and client_name_key(i.client) = client_name_key(p_name) and client_name_key(p_name) <> '')
        or (length(regexp_replace(coalesce(p_number, ''), '\D', '', 'g')) >= 9
            and regexp_replace(coalesce(i.contact_phone, ''), '\D', '', 'g') = regexp_replace(p_number, '\D', '', 'g'))
      )
    order by i.last_contact_at desc nulls last
    limit 10
$$;
revoke all on function call_find_inquiries(bigint, text, text) from public, anon;
grant execute on function call_find_inquiries(bigint, text, text) to authenticated;

notify pgrst, 'reload schema';

-- VERIFICATION
--   select * from call_find_inquiries(1, '(주)아무개', '');   -- 진행 중 상담만
-- ROLLBACK
--   drop function if exists call_find_inquiries(bigint, text, text);
--   alter table calls drop column if exists contact_name, drop column if exists contact_dept, drop column if exists contact_title,
--     drop column if exists contact_phone, drop column if exists contact_email, drop column if exists inquiry_title,
--     drop column if exists inquiry_id, drop column if exists inquiry_log_id, drop column if exists inquiry_link;
