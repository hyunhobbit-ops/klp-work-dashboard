-- 마케팅 캠페인 (업무 > 마케팅)
-- 문구·채널 작성 후 지정 직원별 배포 여부 체크

create table if not exists public.marketing_campaigns (
    id bigserial primary key,
    title text not null,
    content text,
    channels text[] default array[]::text[],
    deadline date,
    memo text,
    image_url text,                             -- base64 data URL (추후 Supabase Storage로 이관 예정)
    distributions jsonb default '{}'::jsonb,   -- { "김관택": { "done": true, "done_at": "2026-04-22T..." }, ... }
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 기존 테이블이 이미 있으면 image_url 추가
alter table public.marketing_campaigns add column if not exists image_url text;

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_marketing_campaigns_updated_at on public.marketing_campaigns;
create trigger trg_marketing_campaigns_updated_at
before update on public.marketing_campaigns
for each row execute function public.set_updated_at();

-- RLS: 전체 조회/수정 허용 (앱 레벨에서 권한 체크)
alter table public.marketing_campaigns enable row level security;

drop policy if exists marketing_campaigns_all on public.marketing_campaigns;
create policy marketing_campaigns_all on public.marketing_campaigns
    for all using (true) with check (true);

-- 정렬용 인덱스
create index if not exists idx_marketing_campaigns_created_at
    on public.marketing_campaigns (created_at desc);

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
