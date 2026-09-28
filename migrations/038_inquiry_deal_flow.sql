-- 038: 상담 한 건에서 끝까지 — 상담 → 견적 → 수주(국내) → 디자인확인 → 작업요청 → 납품·정산
-- 1) 국내 프로젝트를 상담에 연결 (projects_domestic.inquiry_id)
-- 2) 국내 체크리스트를 체크한 날짜 자동 기록 (check_dates) — 국내 메뉴·편집창·상담 화면 어디서 체크해도
-- 3) 체크가 바뀌면 연결된 상담에 자동 기록 + 상담 상태 자동 변경(수주 → 제작중 → 납품완료 → 정산완료)

alter table projects_domestic add column if not exists inquiry_id bigint references inquiries(id) on delete set null;
create index if not exists projects_domestic_inquiry_idx on projects_domestic(inquiry_id);
alter table projects_domestic add column if not exists check_dates jsonb not null default '{}'::jsonb;

-- 이미 국내로 넘어간 견적 → 그 견적의 상담에 연결
update projects_domestic d
   set inquiry_id = t.inquiry_id
  from projects_temp t
 where t.inquiry_id is not null
   and d.id = any(t.transferred_project_ids)
   and d.inquiry_id is null;

-- 상담 상태를 국내 진행 상황에 맞춤 (보류·실패는 건드리지 않음)
create or replace function inq_sync_stage(p_inq bigint) returns void
language plpgsql as $$
declare
    cur text; nxt text; n int; all_deliv boolean; all_settle boolean; any_wo boolean; cid bigint;
begin
    if p_inq is null then return; end if;
    select status, company_id into cur, cid from inquiries where id = p_inq;
    if cur is null or cur in ('보류', '실패') then return; end if;
    select count(*),
           bool_and(checks->>'delivered' = 'true'),
           bool_and(checks->>'delivered' = 'true' and checks->>'finalPayment' = 'true'
                    and checks->>'invoice' = 'true' and checks->>'supplierPayment' = 'true'),
           bool_or(checks->>'workOrder' = 'true')
      into n, all_deliv, all_settle, any_wo
      from projects_domestic
     where inquiry_id = p_inq and coalesce(status, '') <> '취소';
    if n = 0 then return; end if;
    nxt := case when all_settle then '정산완료' when all_deliv then '납품완료' when any_wo then '제작중' else '수주' end;
    if nxt = cur then return; end if;
    update inquiries set status = nxt, updated_at = now() where id = p_inq;
    insert into inquiry_logs (inquiry_id, direction, channel, body, images, author, company_id)
    values (p_inq, 'system', '', '상태 변경 · ' || cur || ' → ' || nxt, '[]'::jsonb, '', cid);
end $$;

-- 체크한 날짜 기록 (체크 해제하면 날짜도 지움)
create or replace function projects_domestic_stamp_checks() returns trigger
language plpgsql as $$
declare k text; o jsonb := coalesce(old.checks, '{}'::jsonb); nn jsonb := coalesce(new.checks, '{}'::jsonb);
        d jsonb := coalesce(new.check_dates, '{}'::jsonb);
begin
    for k in select jsonb_object_keys(nn) loop
        if nn->>k = 'true' and coalesce(o->>k, 'false') <> 'true' then
            d := d || jsonb_build_object(k, now());
        elsif coalesce(nn->>k, 'false') <> 'true' and o->>k = 'true' then
            d := d - k;
        end if;
    end loop;
    new.check_dates := d;
    return new;
end $$;

drop trigger if exists trg_projects_domestic_stamp_checks on projects_domestic;
create trigger trg_projects_domestic_stamp_checks before update of checks on projects_domestic
    for each row when (old.checks is distinct from new.checks)
    execute function projects_domestic_stamp_checks();

-- 체크 변화 → 연결된 상담 타임라인에 한 줄 + 상태 맞추기
create or replace function projects_domestic_inquiry_sync() returns trigger
language plpgsql as $$
declare k text; lbl text; o jsonb; nn jsonb;
begin
    if tg_op = 'DELETE' then
        perform inq_sync_stage(old.inquiry_id);
        return old;
    end if;
    if tg_op = 'UPDATE' and new.inquiry_id is not null and old.checks is distinct from new.checks then
        o := coalesce(old.checks, '{}'::jsonb); nn := coalesce(new.checks, '{}'::jsonb);
        for k in select jsonb_object_keys(nn) loop
            if nn->>k = 'true' and coalesce(o->>k, 'false') <> 'true' then
                lbl := case k when 'design' then '디자인확인서 컨펌' when 'workOrder' then '작업요청서 발송'
                              when 'advancePayment' then '선금 입금' when 'finalPayment' then '잔금 입금'
                              when 'invoice' then '계산서 발행' when 'supplierPayment' then '공급처 송금'
                              when 'delivered' then '납품 완료' else k end;
                insert into inquiry_logs (inquiry_id, direction, channel, body, images, author, company_id)
                values (new.inquiry_id, 'system', '', lbl || ' · ' || coalesce(nullif(new.product_name, ''), '국내 프로젝트'), '[]'::jsonb, '', new.company_id);
            end if;
        end loop;
    end if;
    perform inq_sync_stage(new.inquiry_id);
    if tg_op = 'UPDATE' and old.inquiry_id is distinct from new.inquiry_id then
        perform inq_sync_stage(old.inquiry_id);
    end if;
    return new;
end $$;

drop trigger if exists trg_projects_domestic_inquiry_sync on projects_domestic;
create trigger trg_projects_domestic_inquiry_sync after insert or update of checks, inquiry_id, status or delete on projects_domestic
    for each row execute function projects_domestic_inquiry_sync();

-- 이미 연결된 상담들 상태 한 번 맞추기
select inq_sync_stage(id) from inquiries where id in (select distinct inquiry_id from projects_domestic where inquiry_id is not null);

-- 함수 검색 경로 고정 (Supabase 보안 권고)
alter function inq_sync_stage(bigint) set search_path = public;
alter function projects_domestic_stamp_checks() set search_path = public;
alter function projects_domestic_inquiry_sync() set search_path = public;
