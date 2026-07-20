-- 멀티테넌트 1단계: 회사(테넌트) 최상위 테이블
create table if not exists companies (
  id          bigserial primary key,
  name        text not null,
  settings    jsonb not null default '{}'::jsonb,
  plan        text not null default 'free',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- KLP = 1번 회사. 모든 모듈 활성.
insert into companies (id, name, plan, settings)
values (1, 'KLP KOREA', 'internal', jsonb_build_object(
  'brandName', 'KLP KOREA',
  'logoUrl', null,
  'primaryColor', null,  -- KLP는 기존 Toss 블루(--blue) 그대로 유지 (덮어쓰지 않음)
  'enabledModules', jsonb_build_array(
    'home','planning','projects','daily','meetings','delivery','marketing',
    'marketdb','cash','product-db','proposals','docs','manual','ceo-vision',
    'clients','clients-overseas','quotes','margin-calc','ad-studio'
  )
))
on conflict (id) do nothing;

-- id 시퀀스가 1 이후로 진행되도록 보정
select setval(pg_get_serial_sequence('companies','id'), greatest((select max(id) from companies), 1));

-- RLS 활성화(정책은 migration 023에서 current_company_id() 생성 후 추가)
alter table companies enable row level security;
