-- 회의록 (1단계): meetings + meeting_actions
-- 비공개 회의록은 RLS로 DB 차원에서 차단한다.

-- 로그인한 사용자의 profiles.name / profiles.role 을 꺼내는 헬퍼.
-- profiles 자체 RLS를 우회해야 하므로 security definer.
create or replace function current_profile_name() returns text
  language sql stable security definer set search_path = public as $$
  select name from profiles where auth_user_id = auth.uid() limit 1
$$;

create or replace function current_profile_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from profiles where auth_user_id = auth.uid() limit 1
$$;

create table if not exists meetings (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  author text,
  title text not null,
  meet_at timestamptz,
  location text,
  attendees jsonb default '[]'::jsonb,
  external_attendees text,
  project_id bigint,
  client text,
  agenda jsonb default '[]'::jsonb,
  content text,
  decisions jsonb default '[]'::jsonb,
  transcript text,
  summary text,
  status text default '작성중',
  is_private boolean default false,
  audio_path text
);

create table if not exists meeting_actions (
  id bigint generated always as identity primary key,
  meeting_id bigint not null references meetings(id) on delete cascade,
  task text not null,
  assignee text,
  due_date date,
  daily_task_id bigint,
  created_at timestamptz default now()
);
create index if not exists meeting_actions_meeting_id_idx on meeting_actions(meeting_id);
create index if not exists meetings_meet_at_idx on meetings(meet_at desc);

alter table meetings enable row level security;
alter table meeting_actions enable row level security;

drop policy if exists "meetings_select" on meetings;
create policy "meetings_select" on meetings for select to authenticated
using (
  not coalesce(is_private, false)
  or author = current_profile_name()
  or attendees ? current_profile_name()
  or current_profile_role() in ('관리자', '부장', '대표')
);

drop policy if exists "meetings_insert" on meetings;
create policy "meetings_insert" on meetings for insert to authenticated
with check (author = current_profile_name() or current_profile_role() in ('관리자', '부장', '대표'));

drop policy if exists "meetings_update" on meetings;
create policy "meetings_update" on meetings for update to authenticated
using (author = current_profile_name() or current_profile_role() in ('관리자', '부장', '대표'))
with check (author = current_profile_name() or current_profile_role() in ('관리자', '부장', '대표'));

drop policy if exists "meetings_delete" on meetings;
create policy "meetings_delete" on meetings for delete to authenticated
using (author = current_profile_name() or current_profile_role() in ('관리자', '부장', '대표'));

drop policy if exists "meeting_actions_select" on meeting_actions;
create policy "meeting_actions_select" on meeting_actions for select to authenticated
using (exists (select 1 from meetings m where m.id = meeting_id));

drop policy if exists "meeting_actions_write" on meeting_actions;
create policy "meeting_actions_write" on meeting_actions for all to authenticated
using (exists (
  select 1 from meetings m where m.id = meeting_id
    and (m.author = current_profile_name() or current_profile_role() in ('관리자', '부장', '대표'))
))
with check (exists (
  select 1 from meetings m where m.id = meeting_id
    and (m.author = current_profile_name() or current_profile_role() in ('관리자', '부장', '대표'))
));
