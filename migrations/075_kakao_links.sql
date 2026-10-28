-- 075: 카카오톡 "나에게 보내기" 알림 연결 — 직원별 카카오 토큰 (Mac mini 엣지 함수 kakao 전용)
-- 토큰이 들어 있어서 브라우저(anon/authenticated)에서는 못 읽음. 상태 조회·연결·해제는 functions/v1/kakao 로만.
-- 카카오 키는 app_config: kakao_rest_key, kakao_client_secret (사용자가 직접 입력), kakao_state_secret, kakao_send_secret (자동 생성)
create table if not exists kakao_links (
    profile_id int primary key references profiles(id) on delete cascade,
    user_name text not null default '',            -- 대시보드 표시 이름 (daily_tasks.assignee 와 같은 값, 예: 대표님)
    company_id bigint not null references companies(id),
    kakao_id bigint,
    kakao_nickname text not null default '',
    access_token text not null default '',
    refresh_token text not null default '',
    access_expires_at timestamptz,
    refresh_expires_at timestamptz,
    talk_ok boolean not null default false,        -- talk_message 동의 여부 (선택 동의라 빠질 수 있음)
    last_sent_at timestamptz,
    last_error text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
drop trigger if exists trg_kakao_links_updated on kakao_links;
create trigger trg_kakao_links_updated before update on kakao_links for each row execute function set_updated_at();
alter table kakao_links enable row level security;
revoke all on kakao_links from anon, authenticated;

insert into app_config(key, value) values ('kakao_state_secret', encode(extensions.gen_random_bytes(32), 'hex')) on conflict (key) do nothing;
insert into app_config(key, value) values ('kakao_send_secret', encode(extensions.gen_random_bytes(32), 'hex')) on conflict (key) do nothing;
