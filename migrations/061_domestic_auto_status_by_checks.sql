-- 061: 국내 프로젝트 상태 자동 — 체크리스트가 하나라도 체크되면 '진행 중', 하나도 없으면 '시작 전' (2026-10-16 현호님 요청)
--  · 체크(checks)가 실제로 바뀐 경우에만 (편집 창에서 다른 칸만 저장할 땐 상태 그대로)
--  · '시작 전'·'진행 중' 상태일 때만 바꿈 — '완료'·'취소'는 건드리지 않음 (전부 체크 시 '완료'는 앱이 처리)
--  · 상태를 사람이 직접 바꾸는 건 그대로 존중 (상태만 바꾸는 저장엔 체크가 안 바뀌므로 동작 안 함)
create or replace function projects_domestic_auto_status() returns trigger
language plpgsql as $$
declare any_on boolean;
begin
    if tg_op = 'UPDATE' and old.checks is not distinct from new.checks then return new; end if;
    if coalesce(new.status, '시작 전') not in ('시작 전', '진행 중') then return new; end if;
    select exists (select 1 from jsonb_each_text(coalesce(new.checks, '{}'::jsonb)) e where e.value = 'true') into any_on;
    new.status := case when any_on then '진행 중' else '시작 전' end;
    return new;
end $$;

drop trigger if exists trg_projects_domestic_auto_status on projects_domestic;
create trigger trg_projects_domestic_auto_status
    before insert or update of checks on projects_domestic
    for each row execute function projects_domestic_auto_status();

-- 이미 어긋난 건 바로잡기
update projects_domestic set status = '진행 중'
 where status = '시작 전' and exists (select 1 from jsonb_each_text(checks) e where e.value = 'true');
update projects_domestic set status = '시작 전'
 where status = '진행 중' and not exists (select 1 from jsonb_each_text(coalesce(checks, '{}'::jsonb)) e where e.value = 'true');
