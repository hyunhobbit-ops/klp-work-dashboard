-- 064: 체크리스트 7개(디확·작지·선금·잔금·계산서·공급처 송금·납품)를 전부 체크하면 끝까지 자동으로 넘어감 (2026-10-21 현호님 요청)
--  · 상담: 연결된 국내 프로젝트(취소 제외)가 모두 전부 체크 → '마감' (그 전 단계 규칙은 그대로: 정산완료/납품완료/제작중/수주)
--  · 국내: 전부 체크 → '완료', '완료'였는데 하나라도 풀면 → '진행 중' (예전엔 앱에서만 처리 — 어디서 체크하든 같게)

create or replace function public.inq_sync_stage(p_inq bigint)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
declare
    cur text; nxt text; n int; all_deliv boolean; all_settle boolean; all_done boolean; any_wo boolean; cid bigint;
begin
    if p_inq is null then return; end if;
    select status, company_id into cur, cid from inquiries where id = p_inq;
    if cur is null or cur in ('보류', '실패') then return; end if;
    select count(*),
           bool_and(checks->>'delivered' = 'true'),
           bool_and(checks->>'delivered' = 'true' and checks->>'finalPayment' = 'true'
                    and checks->>'invoice' = 'true' and checks->>'supplierPayment' = 'true'),
           bool_and(checks->>'design' = 'true' and checks->>'workOrder' = 'true' and checks->>'advancePayment' = 'true'
                    and checks->>'finalPayment' = 'true' and checks->>'invoice' = 'true'
                    and checks->>'supplierPayment' = 'true' and checks->>'delivered' = 'true'),
           bool_or(checks->>'workOrder' = 'true')
      into n, all_deliv, all_settle, all_done, any_wo
      from projects_domestic
     where inquiry_id = p_inq and coalesce(status, '') <> '취소';
    if n = 0 then return; end if;
    nxt := case when all_done then '마감' when all_settle then '정산완료' when all_deliv then '납품완료' when any_wo then '제작중' else '수주' end;
    if nxt = cur then return; end if;
    update inquiries set status = nxt, updated_at = now() where id = p_inq;
    insert into inquiry_logs (inquiry_id, direction, channel, body, images, author, company_id)
    values (p_inq, 'system', '', '상태 변경 · ' || cur || ' → ' || nxt, '[]'::jsonb, '', cid);
end
$function$;

create or replace function projects_domestic_auto_status() returns trigger
language plpgsql as $$
declare any_on boolean; all_on boolean;
begin
    if tg_op = 'UPDATE' and old.checks is not distinct from new.checks then return new; end if;
    if coalesce(new.status, '시작 전') not in ('시작 전', '진행 중', '완료') then return new; end if;
    select exists (select 1 from jsonb_each_text(coalesce(new.checks, '{}'::jsonb)) e where e.value = 'true') into any_on;
    all_on := coalesce(new.checks->>'design', '') = 'true' and coalesce(new.checks->>'workOrder', '') = 'true'
          and coalesce(new.checks->>'advancePayment', '') = 'true' and coalesce(new.checks->>'finalPayment', '') = 'true'
          and coalesce(new.checks->>'invoice', '') = 'true' and coalesce(new.checks->>'supplierPayment', '') = 'true'
          and coalesce(new.checks->>'delivered', '') = 'true';
    new.status := case when all_on then '완료' when any_on then '진행 중' else '시작 전' end;
    return new;
end $$;

-- 이미 전부 체크된 상담은 바로 마감으로
select inq_sync_stage(i.id) from inquiries i
 where i.status not in ('보류', '실패', '마감')
   and exists (select 1 from projects_domestic d where d.inquiry_id = i.id and coalesce(d.status, '') <> '취소');
