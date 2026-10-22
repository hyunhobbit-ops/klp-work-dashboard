-- 067: 통화 기록 (2026-10-22 현호님 요청 — 회사 인터넷전화 자동 녹음 → 녹취록·요약 → 대시보드)
--  맥미니가 통화를 수집(포트 미러링) → 받아쓰기(mlx-whisper) → 요약 → service role로 여기에 저장
--  자리표(call_lines): 전화번호 → 자리·담당자.  통화(calls): 한 통화 = 한 행.  녹음 파일은 비공개 버킷 call-recordings
--  열람: 직원 전원이 회사 전체 통화를 봄 (현호님 결정). 회사별 칸막이(company_id + RLS)

-- ── 자리표 ──
create table if not exists call_lines (
    id bigserial primary key,
    label text not null default '',              -- 자리 이름 (예: 김현호)
    staff_name text not null default '',         -- 담당자 (profiles.name과 같게)
    number text not null default '',            -- 표시용 번호 (02-6091-2482)
    number_key text not null default '',        -- 숫자만 (0260912482) — 통화 데이터와 대조용
    sort_order int not null default 0,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    company_id bigint not null references companies(id),
    unique (company_id, number_key)
);

-- ── 통화 ──
create table if not exists calls (
    id bigserial primary key,
    sip_call_id text,                            -- 수집 쪽 고유값 (중복 저장 방지)
    line_id bigint references call_lines(id) on delete set null,
    line_number text not null default '',        -- 우리 쪽 번호 (자리표에 없어도 남김)
    direction text not null default 'in',        -- in(받은 전화) / out(건 전화)
    other_number text not null default '',       -- 상대 번호
    client_id bigint references clients(id) on delete set null,  -- 거래처 DB에서 번호로 찾은 거래처
    client_name text not null default '',        -- 찾은 거래처 이름 (또는 통화에서 밝힌 회사명)
    started_at timestamptz not null default now(),
    duration_sec int not null default 0,
    answered boolean not null default true,      -- false = 부재중
    status text not null default 'done',         -- recording / transcribing / summarizing / done / error
    error text not null default '',
    audio_path text not null default '',         -- call-recordings 버킷 안 경로
    transcript jsonb not null default '[]',      -- [{start, end, who:'me'|'other', text}]
    summary text not null default '',            -- 한두 줄 요약
    topic text not null default '',              -- 분류 (문의/주문/납기/견적/클레임/기타)
    todos jsonb not null default '[]',           -- [{text, done, done_by, done_at}]
    memo text not null default '',               -- 직원 메모
    checked boolean not null default false,      -- 확인(처리) 완료
    checked_by text not null default '',
    checked_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    company_id bigint not null references companies(id)
);
-- 같은 통화를 두 번 넣으면 덮어쓰기(on_conflict). NULL끼리는 겹쳐도 됨 → 부분 인덱스 대신 일반 고유 제약 (PostgREST on_conflict는 부분 인덱스를 못 씀)
drop index if exists calls_sip_call_idx;
do $$ begin
    alter table calls add constraint calls_sip_call_key unique (company_id, sip_call_id);
exception when duplicate_table or duplicate_object then null; end $$;
create index if not exists calls_company_time_idx on calls(company_id, started_at desc);
create index if not exists calls_line_idx on calls(line_id, started_at desc);
create index if not exists calls_other_idx on calls(company_id, other_number);

-- company_id 자동 기입 (앱에서 넣을 때). 맥미니(service role)는 company_id를 직접 보냄
drop trigger if exists trg_call_lines_company on call_lines;
create trigger trg_call_lines_company before insert on call_lines
    for each row execute function set_company_id();
drop trigger if exists trg_calls_company on calls;
create trigger trg_calls_company before insert on calls
    for each row execute function set_company_id();

create or replace function calls_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_calls_updated on calls;
create trigger trg_calls_updated before update on calls
    for each row execute function calls_touch_updated_at();

-- RLS: 같은 회사 직원 누구나 읽기·수정 (삭제는 관리자 화면에서만 — 앱에 버튼 없음)
alter table call_lines enable row level security;
drop policy if exists call_lines_company on call_lines;
create policy call_lines_company on call_lines for all to authenticated
    using (company_id = current_company_id())
    with check (company_id = current_company_id());
revoke all on call_lines from anon;
grant select, insert, update, delete on call_lines to authenticated;
grant usage, select on sequence call_lines_id_seq to authenticated;

alter table calls enable row level security;
drop policy if exists calls_company on calls;
create policy calls_company on calls for all to authenticated
    using (company_id = current_company_id())
    with check (company_id = current_company_id());
revoke all on calls from anon;
grant select, insert, update, delete on calls to authenticated;
grant usage, select on sequence calls_id_seq to authenticated;

do $$ begin
    alter publication supabase_realtime add table calls;
exception when duplicate_object then null; end $$;

-- 번호 → 거래처 찾기 (숫자만 비교: 대표번호·휴대폰·담당자 휴대폰·팩스 제외)
create or replace function call_find_client(p_company bigint, p_number text)
returns table (id bigint, company_name text)
language sql stable security definer set search_path = public as $$
    select c.id, c.company_name from clients c
    where c.company_id = p_company
      and length(regexp_replace(p_number, '\D', '', 'g')) >= 7
      and regexp_replace(p_number, '\D', '', 'g') in (
          regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'),
          regexp_replace(coalesce(c.mobile, ''), '\D', '', 'g'),
          regexp_replace(coalesce(c.staff_mobile, ''), '\D', '', 'g'))
    order by c.id limit 1
$$;
revoke all on function call_find_client(bigint, text) from public, anon, authenticated;

-- ── 녹음 파일 버킷 (비공개). 경로 = <company_id>/<YYYY>/<MM>/<파일> ──
insert into storage.buckets (id, name, public) values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;
drop policy if exists call_recordings_company_read on storage.objects;
create policy call_recordings_company_read on storage.objects for select to authenticated
    using (bucket_id = 'call-recordings' and (storage.foldername(name))[1] = current_company_id()::text);

-- ── KLP 자리표 (2026-10-22 현호님 제공) ──
insert into call_lines (company_id, label, staff_name, number, number_key, sort_order) values
    (1, '김현호', '김현호', '02-6091-2482', '0260912482', 1),
    (1, '유지은', '유지은', '070-8769-5578', '07087695578', 2),
    (1, '이현주 실장', '이현주', '02-6091-2481', '0260912481', 3),
    (1, '김관택 대표', '김관택', '070-8769-5579', '07087695579', 4)
on conflict (company_id, number_key) do nothing;

-- KLP 메뉴 목록에 '통화 기록' 추가 (enabledModules에 없으면 사이드바에서 숨겨짐)
update companies set settings = jsonb_set(settings, '{enabledModules}', (settings->'enabledModules') || '"calls"')
where id = 1 and settings ? 'enabledModules' and not (settings->'enabledModules') ? 'calls';

notify pgrst, 'reload schema';

-- VERIFICATION
--   select label, number from call_lines where company_id = 1 order by sort_order;   -- 4행
--   select * from call_find_client(1, '02-0000-0000');                                -- 0행이면 정상
-- ROLLBACK
--   drop table if exists calls; drop table if exists call_lines;
--   drop function if exists call_find_client(bigint, text); drop function if exists calls_touch_updated_at();
--   drop policy if exists call_recordings_company_read on storage.objects;
--   delete from storage.buckets where id = 'call-recordings';   -- 파일이 남아 있으면 먼저 비워야 함
