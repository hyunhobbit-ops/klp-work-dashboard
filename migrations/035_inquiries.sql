-- 035: 상담 관리 (견적 의뢰 화면 안)
-- 문의 접수부터 수주/실패까지 한 '상담 건'으로 묶고, 오간 대화를 타임라인으로 남긴다.
-- 견적 의뢰 품목(projects_temp)은 inquiry_id로 상담 건에 연결된다.

-- 1) 상담 건
create table if not exists inquiries (
    id bigserial primary key,
    client text not null default '',
    client_contact text default '',
    channel text default '전화',           -- 전화/카톡/문자/이메일/방문/홈페이지/기타
    title text default '',                 -- 무엇을 문의했는지 한 줄
    status text not null default '신규',    -- 신규/상담중/견적발송/수주/보류/실패
    fail_reason text default '',
    assignee text default '',
    next_action text default '',
    next_action_date date,
    started_at date default current_date,
    last_contact_at timestamptz default now(),
    created_by text default '',
    company_id bigint not null references companies(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists inquiries_company_status_idx on inquiries(company_id, status);

drop trigger if exists trg_inquiries_company on inquiries;
create trigger trg_inquiries_company before insert on inquiries
    for each row execute function set_company_id();

alter table inquiries enable row level security;
drop policy if exists inquiries_company on inquiries;
create policy inquiries_company on inquiries for all to authenticated
    using (company_id = current_company_id())
    with check (company_id = current_company_id());

-- 2) 타임라인 (고객 말 / 우리 답변 / 내부 메모 / 자동 기록)
create table if not exists inquiry_logs (
    id bigserial primary key,
    inquiry_id bigint not null references inquiries(id) on delete cascade,
    at timestamptz not null default now(),
    direction text not null default 'memo', -- in(고객) / out(우리) / memo(내부) / system(자동)
    channel text default '',
    body text default '',
    image text default '',                  -- 업로드 시 압축된 base64
    author text default '',
    company_id bigint not null references companies(id),
    created_at timestamptz not null default now()
);
create index if not exists inquiry_logs_inquiry_idx on inquiry_logs(inquiry_id, at);

drop trigger if exists trg_inquiry_logs_company on inquiry_logs;
create trigger trg_inquiry_logs_company before insert on inquiry_logs
    for each row execute function set_company_id();

alter table inquiry_logs enable row level security;
drop policy if exists inquiry_logs_company on inquiry_logs;
create policy inquiry_logs_company on inquiry_logs for all to authenticated
    using (company_id = current_company_id())
    with check (company_id = current_company_id());

-- 3) 견적 의뢰 품목 → 상담 건 연결
alter table projects_temp add column if not exists inquiry_id bigint
    references inquiries(id) on delete set null;
create index if not exists projects_temp_inquiry_idx on projects_temp(inquiry_id);
