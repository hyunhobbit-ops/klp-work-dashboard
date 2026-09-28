-- 037: 상담 — '다음 할 일'을 여러 개 + 담당자 지정 + 일일계획표(daily_tasks) 자동 등록
--      + 타임라인 기록 수정 표시(edited_at)
-- inquiries.next_action / next_action_date 는 목록 표시·정렬용 요약으로 유지
-- (앱이 '가장 급한 미완료 할 일 (외 N건)'으로 자동 갱신)

create table if not exists inquiry_todos (
    id bigserial primary key,
    inquiry_id bigint not null references inquiries(id) on delete cascade,
    task text not null default '',
    due_date date,
    assignee text default '',
    done boolean not null default false,          -- 일일계획표와 연결돼 있으면 daily_tasks.done이 원본
    done_at timestamptz,
    daily_task_id bigint references daily_tasks(id) on delete set null,
    created_by text default '',
    company_id bigint not null references companies(id),
    created_at timestamptz not null default now()
);
create index if not exists inquiry_todos_inquiry_idx on inquiry_todos(inquiry_id);

drop trigger if exists trg_inquiry_todos_company on inquiry_todos;
create trigger trg_inquiry_todos_company before insert on inquiry_todos
    for each row execute function set_company_id();

alter table inquiry_todos enable row level security;
drop policy if exists inquiry_todos_company on inquiry_todos;
create policy inquiry_todos_company on inquiry_todos for all to authenticated
    using (company_id = current_company_id())
    with check (company_id = current_company_id());

-- 기존 '다음 할 일' 한 칸 → 할 일 목록으로 옮김 (일일계획표 연결은 없이)
insert into inquiry_todos (inquiry_id, task, due_date, assignee, company_id)
select i.id, i.next_action, i.next_action_date, coalesce(i.assignee, ''), i.company_id
  from inquiries i
 where coalesce(i.next_action, '') <> ''
   and not exists (select 1 from inquiry_todos t where t.inquiry_id = i.id);

-- 기록 수정 시각 (있으면 '수정됨' 표시)
alter table inquiry_logs add column if not exists edited_at timestamptz;
