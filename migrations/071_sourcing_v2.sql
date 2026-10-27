-- 071: 해외 소싱 2판 — Aside 요구사항(2026-10-27 '알리바바 소싱 현황') 반영
--  070의 sourcing_items / sourcing_quotes(데이터 0건)를 버리고, 소싱 건 → 업체 → 견적·대화·샘플·할 일 구조로
--  맥미니 자체 DB(Supabase self-host)에 저장 → 매일 백업(DB 덤프 + 사진 볼륨)에 자동 포함
drop table if exists sourcing_quotes;
drop table if exists sourcing_items;
drop function if exists sourcing_quotes_touch_item() cascade;

create table sourcing_projects (
    id bigserial primary key,
    title text not null default '',                 -- 소싱 건 이름 (예: D 금속 태그 (OKTAN 01))
    status text not null default '업체 탐색',
    linked_project_id bigint references planning_projects(id) on delete set null,  -- 연결 프로젝트 (펀딩·회사 프로젝트)
    linked_client text not null default '',         -- 고객사
    spec jsonb not null default '{}',               -- {qty_lines:[{label,qty}], material, size, thickness, finish, color, logo, parts, packaging, due, etc}
    spec_history jsonb not null default '[]',       -- [{at, text, by}]
    images jsonb not null default '[]',             -- 레퍼런스·시안 사진 (첫 장 = 대표)
    rate numeric(10,2) not null default 0,          -- 원/$ 환산 기준
    rate_date date,                                 -- 환율 기준일
    assignee text not null default '김현호',
    domestic_id bigint references projects_domestic(id) on delete set null,
    created_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    company_id bigint not null references companies(id),
    constraint sourcing_projects_status_check check (status in ('업체 탐색','견적 수집','샘플 진행','샘플 확인','본주문','완료','보류'))
);
create table sourcing_suppliers (
    id bigserial primary key,
    project_id bigint not null references sourcing_projects(id) on delete cascade,
    company text not null default '',
    contact_name text not null default '',
    product_url text not null default '',           -- 상품 상세 페이지 (필수 — 비교표 모든 행에 링크)
    years text not null default '',                 -- 업력 (예: 10년)
    rating numeric(3,1),                            -- 상품 페이지 '평점 & 리뷰' 기준
    store_reviews int,
    kr_reviews int,
    rating_checked_at timestamptz,                  -- 평점 확인 시각
    response_time text not null default '',         -- ≤2h
    ontime_rate text not null default '',           -- 100%
    channel text not null default 'chat',           -- chat | form | form_failed
    status text not null default '문의함',
    note text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    company_id bigint not null references companies(id),
    constraint sourcing_suppliers_channel_check check (channel in ('chat','form','form_failed')),
    constraint sourcing_suppliers_status_check check (status in ('문의함','답변 대기','견적 받음','선정','제외'))
);
create table sourcing_quotes (
    id bigserial primary key,
    supplier_id bigint not null references sourcing_suppliers(id) on delete cascade,
    option_label text not null default '',          -- 옵션 (예: 골드 체인 포함)
    unit_price_usd numeric(14,4) not null default 0,
    qty int not null default 0,
    total_usd numeric(14,2) not null default 0,     -- 본주문 총액 (비우면 단가×수량)
    mold_fee_usd numeric(14,2) not null default 0,
    sample_fee_usd numeric(14,2) not null default 0,
    sample_refundable boolean not null default false, -- 본주문 시 차감
    sample_days text not null default '',
    production_days text not null default '',
    shipping_note text not null default '',
    basis_note text not null default '',            -- 견적 기준 (두께 미기재·아연합금 기준 등)
    quoted_at timestamptz not null default now(),
    images jsonb not null default '[]',
    created_at timestamptz not null default now(),
    company_id bigint not null references companies(id)
);
create table sourcing_messages (
    id bigserial primary key,
    supplier_id bigint not null references sourcing_suppliers(id) on delete cascade,
    sent_at timestamptz not null default now(),     -- 보낸/받은 시각 (화면은 한국시간)
    direction text not null default 'in',           -- in = 업체→우리, out = 우리→업체
    original_text text not null default '',
    summary_ko text not null default '',
    quoted_text text not null default '',
    attachments jsonb not null default '[]',        -- [{url, name, type}]
    read_status text not null default '',           -- '' | 읽음 | 안 읽음
    checked_at timestamptz not null default now(),  -- 확인(기록) 시각
    created_by text not null default '',
    company_id bigint not null references companies(id),
    constraint sourcing_messages_dir_check check (direction in ('in','out'))
);
create table sourcing_samples (
    id bigserial primary key,
    supplier_id bigint not null references sourcing_suppliers(id) on delete cascade,
    description text not null default '',
    amount_usd numeric(14,2) not null default 0,
    order_status text not null default '결제 대기',  -- 결제 대기 / 결제 완료 / 공급업체 배송 대기 / 발송 / 수령
    paid_at date,
    paid_by text not null default '김현호',
    promised_ship text not null default '',         -- 결제 후 45일 / 업체 구두 10일
    eta date,                                        -- 예상 완성(도착)일
    pickup boolean not null default false,          -- 직접 픽업
    shipping_note text not null default '',
    draft_status text not null default '',          -- '' / 시안 받음 / 컨펌 / 대기
    logo_file text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    company_id bigint not null references companies(id)
);
create table sourcing_todos (
    id bigserial primary key,
    project_id bigint not null references sourcing_projects(id) on delete cascade,
    supplier_id bigint references sourcing_suppliers(id) on delete set null,
    kind text not null default 'task',              -- question = 업체가 물어본 것 / task = 우리 할 일
    text text not null default '',
    asked_at timestamptz,
    due date,
    assignee text not null default '김현호',
    needs_decision boolean not null default false,  -- 담당자 판단 필요
    answer text not null default '',
    done boolean not null default false,
    done_at timestamptz,
    created_at timestamptz not null default now(),
    company_id bigint not null references companies(id),
    constraint sourcing_todos_kind_check check (kind in ('question','task'))
);
create index on sourcing_projects(company_id, updated_at desc);
create index on sourcing_suppliers(project_id);
create index on sourcing_quotes(supplier_id);
create index on sourcing_messages(supplier_id, sent_at);
create index on sourcing_samples(supplier_id);
create index on sourcing_todos(project_id);

-- 공통: company_id 자동, updated_at, 하위 기록이 바뀌면 소싱 건 '마지막 업데이트'도 갱신
create or replace function sourcing_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create or replace function sourcing_touch_project() returns trigger language plpgsql security definer set search_path = public as $$
declare pid bigint; sid bigint;
begin
    if tg_table_name = 'sourcing_todos' or tg_table_name = 'sourcing_suppliers' then
        pid := coalesce(new.project_id, old.project_id);
    else
        sid := coalesce(new.supplier_id, old.supplier_id);
        select project_id into pid from sourcing_suppliers where id = sid;
    end if;
    if pid is not null then update sourcing_projects set updated_at = now() where id = pid; end if;
    return null;
end $$;
do $$ declare t text; begin
    foreach t in array array['sourcing_projects','sourcing_suppliers','sourcing_quotes','sourcing_messages','sourcing_samples','sourcing_todos'] loop
        execute format('drop trigger if exists trg_%1$s_company on %1$s; create trigger trg_%1$s_company before insert on %1$s for each row execute function set_company_id();', t);
        execute format('alter table %1$s enable row level security; drop policy if exists %1$s_company on %1$s;
            create policy %1$s_company on %1$s for all to authenticated using (company_id = current_company_id()) with check (company_id = current_company_id());', t);
        execute format('revoke all on %1$s from anon; grant select, insert, update, delete on %1$s to authenticated; grant usage, select on sequence %1$s_id_seq to authenticated;', t);
        begin execute format('alter publication supabase_realtime add table %s', t); exception when duplicate_object then null; end;
        if t <> 'sourcing_projects' then
            execute format('drop trigger if exists trg_%1$s_touch on %1$s; create trigger trg_%1$s_touch after insert or update or delete on %1$s for each row execute function sourcing_touch_project();', t);
        end if;
    end loop;
end $$;
create trigger trg_sourcing_projects_updated before update on sourcing_projects for each row execute function sourcing_touch_updated_at();
create trigger trg_sourcing_suppliers_updated before update on sourcing_suppliers for each row execute function sourcing_touch_updated_at();
create trigger trg_sourcing_samples_updated before update on sourcing_samples for each row execute function sourcing_touch_updated_at();
notify pgrst, 'reload schema';
