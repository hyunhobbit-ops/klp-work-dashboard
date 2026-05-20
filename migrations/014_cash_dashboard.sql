-- ============================================================
-- 자금확인 (Cash Dashboard) — 계좌 + 주간 잔액 스냅샷
-- ============================================================
-- 배경:
--   김관택/이현주/김현호 3명이 보는 회사 자금 현황 대시보드.
--   카테고리 5종: deposit(예금) / loan(대출) / foreign(외화) / pension(퇴직연금) / payoneer(페이오니아).
--   주 1회 잔액을 업데이트 — 이미지 업로드 OR 수기 입력.
-- 모델:
--   cash_accounts: 계좌 메타 (카테고리/별칭/계좌번호/통화/표시순서/활성여부)
--   cash_snapshots: 시점별 잔액 (account_id, snapshot_date, balance, source, image_url, note)
--   각 계좌의 현재 잔액 = 가장 최근 snapshot.balance
-- 권한:
--   RLS는 authenticated 풀 액세스 (앱 단에서 김관택/이현주/김현호 필터).
--   기존 패턴(market_db) 동일.
-- 통화:
--   외화(foreign), 페이오니아(payoneer) → USD 기본.
--   예금/대출/퇴직연금 → KRW.
--   currency 컬럼으로 통화별 표기 분기.
-- ============================================================

create table if not exists cash_accounts (
    id bigserial primary key,
    category text not null check (category in ('deposit','loan','foreign','pension','payoneer')),
    label text not null,                       -- 예: "보통예금(기업성김통장)"
    account_number text default '',            -- 예: "078-080281-01-018"
    nickname text default '',                  -- 예: "구로동"
    currency text not null default 'KRW' check (currency in ('KRW','USD','EUR','GBP')),
    sort_order int not null default 0,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists cash_accounts_category_idx on cash_accounts(category, sort_order);

create table if not exists cash_snapshots (
    id bigserial primary key,
    account_id bigint not null references cash_accounts(id) on delete cascade,
    snapshot_date date not null default current_date,
    balance numeric(20,2) not null default 0,
    source text not null default 'manual' check (source in ('manual','image')),
    image_url text default '',
    note text default '',
    recorded_by text default '',                -- profiles.name 캐시
    created_at timestamptz not null default now()
);

create index if not exists cash_snapshots_account_date_idx
    on cash_snapshots(account_id, snapshot_date desc, created_at desc);

-- RLS: authenticated 풀 액세스 (앱 레벨에서 권한 필터)
alter table cash_accounts enable row level security;
alter table cash_snapshots enable row level security;

drop policy if exists cash_accounts_authenticated_all on cash_accounts;
create policy cash_accounts_authenticated_all
    on cash_accounts for all
    to authenticated
    using (true) with check (true);

drop policy if exists cash_snapshots_authenticated_all on cash_snapshots;
create policy cash_snapshots_authenticated_all
    on cash_snapshots for all
    to authenticated
    using (true) with check (true);

-- updated_at 자동 갱신 트리거
create or replace function cash_accounts_set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists cash_accounts_updated_at on cash_accounts;
create trigger cash_accounts_updated_at
    before update on cash_accounts
    for each row execute function cash_accounts_set_updated_at();

-- ============================================================
-- 초기 시드 (이미지 5개에서 추출 — 조회기준 2026-05-20)
-- ============================================================

insert into cash_accounts (category, label, account_number, nickname, currency, sort_order) values
    -- 예금
    ('deposit', '보통예금(기업성김통장)', '078-080281-01-018', '구로동', 'KRW', 1),
    ('deposit', '보통예금',               '078-080281-01-032', '보통예금', 'KRW', 2),
    ('deposit', '주거래기업부금(정기적립식)', '078-080281-15-019', '', 'KRW', 3),
    -- 대출
    ('loan', '중소기업자금', '078-080281-01-018', '구로동', 'KRW', 1),
    ('loan', '중소기업자금', '078-080281-32-00045', '', 'KRW', 2),
    -- 외화
    ('foreign', '거주자외화보통예금(P@yGOS)', '078-080281-56-00011', '외환계좌', 'USD', 1),
    -- 퇴직연금
    ('pension', '퇴직연금확정기여(DC형)', '078-080281-94-003', '', 'KRW', 1),
    -- 페이오니아
    ('payoneer', 'Payoneer USD', '', '', 'USD', 1)
on conflict do nothing;

-- 초기 스냅샷 (잔액)
-- 같은 날짜에 모두 등록 — 이후 주별로 사용자가 추가
insert into cash_snapshots (account_id, snapshot_date, balance, source, recorded_by, note)
select id, '2026-05-20'::date, v.bal, 'manual', '초기시드',
       case when v.note = '' then null else v.note end
  from cash_accounts a
  join (values
      ('보통예금(기업성김통장)', '078-080281-01-018', -136548516.00::numeric, '2026-05-20 입출식 예금'),
      ('보통예금',               '078-080281-01-032',      37588.00::numeric, '2026-05-20 입출식 예금'),
      ('주거래기업부금(정기적립식)', '078-080281-15-019', 11000000.00::numeric, '만기 2026-06-20'),
      ('중소기업자금', '078-080281-01-018', 136548516.00::numeric, '한도 150,000,000 / 만기 2027-03-19'),
      ('중소기업자금', '078-080281-32-00045', 280000000.00::numeric, '한도 280,000,000 / 만기 2027-03-19'),
      ('거주자외화보통예금(P@yGOS)', '078-080281-56-00011', 19287.90::numeric, '2026-05-12 거래'),
      ('퇴직연금확정기여(DC형)', '078-080281-94-003', 19500000.00::numeric, '2025-10-10 거래'),
      ('Payoneer USD', '', 1336.39::numeric, 'USD 1,336.39 / EUR 0.00 / GBP 0.00')
  ) as v(label, acct, bal, note)
    on a.label = v.label and a.account_number = v.acct
 where not exists (
       select 1 from cash_snapshots s where s.account_id = a.id and s.snapshot_date = '2026-05-20'::date
 );

-- ============================================================
-- 스토리지 버킷: cash-images (RLS는 Supabase 콘솔에서 별도 설정)
-- ============================================================
-- 콘솔 → Storage → Create bucket "cash-images" (private, authenticated read/write)
-- 또는 아래 SQL로 직접 생성:
insert into storage.buckets (id, name, public) values ('cash-images', 'cash-images', false)
on conflict (id) do nothing;

-- cash-images 버킷 RLS
drop policy if exists cash_images_authenticated_all on storage.objects;
create policy cash_images_authenticated_all
    on storage.objects for all
    to authenticated
    using (bucket_id = 'cash-images') with check (bucket_id = 'cash-images');

-- 확인용:
-- select category, label, account_number, currency from cash_accounts order by category, sort_order;
-- select a.category, a.label, s.snapshot_date, s.balance, a.currency
--   from cash_snapshots s join cash_accounts a on s.account_id = a.id
--  order by a.category, a.sort_order, s.snapshot_date desc;
