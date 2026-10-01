-- 054: 작업요청서에 납기일이 있으면 → 연결된 상담 '다음 할 일'에 "(공급처) 출고 확인하기" 자동 추가
--  + 담당자 일일계획표(daily_tasks)에도 그 날짜로 등록 + 상담 타임라인 자동 기록
--  같은 작업요청서는 한 번만(source_key = 'wr-ship:문서번호'). 납기일을 바꾸면 할 일·일일계획표 날짜도 따라감(완료 전만)
--  담당자 = 상담의 '우리 담당' → 없으면 작업요청서 요청자 이름(직함 뺌)
alter table inquiry_todos add column if not exists source_key text;
create unique index if not exists inquiry_todos_source_key on inquiry_todos(company_id, source_key) where source_key is not null;

create or replace function confirmations_wr_ship_todo() returns trigger
language plpgsql security definer set search_path = public as $$
declare dc text; skey text; pr record; inq record; who text; t record; txt text; did bigint; md text;
        o record; n int;
begin
  if new.status is distinct from '작업요청서' or new.delivery_date is null then return new; end if;
  dc := split_part(new.doc_number, '_', 1) || '_' || split_part(new.doc_number, '_', 2);
  skey := 'wr-ship:' || new.doc_number;
  txt := coalesce(nullif(btrim(new.company_name), ''), '공급처') || ' 출고 확인하기';
  md := to_char(new.delivery_date, 'FMMM/FMDD');
  for pr in
    select distinct p.inquiry_id from projects_domestic p
     where p.company_id = new.company_id and p.source_doc_number = dc and p.inquiry_id is not null
  loop
    select id, client, title, assignee into inq from inquiries where id = pr.inquiry_id and company_id = new.company_id;
    if not found then continue; end if;
    who := coalesce(nullif(inq.assignee, ''), nullif(split_part(coalesce(new.manager, ''), ' ', 1), ''), '');
    select * into t from inquiry_todos where company_id = new.company_id and source_key = skey and inquiry_id = inq.id;
    if found then
      -- 납기일이 바뀌면 날짜만 따라감 (이미 끝낸 할 일은 그대로)
      if t.due_date is distinct from new.delivery_date and not t.done then
        update inquiry_todos set due_date = new.delivery_date, task = txt where id = t.id;
        if t.daily_task_id is not null then
          update daily_tasks set date = new.delivery_date, task = '[' || coalesce(inq.client, '') || '] ' || txt
           where id = t.daily_task_id and not coalesce(done, false);
        end if;
        insert into inquiry_logs (inquiry_id, direction, channel, body, images, author, company_id)
        values (inq.id, 'system', '', '할 일 날짜 변경 · ' || txt || ' (' || md || ') — 작업요청서 ' || new.doc_number, '[]'::jsonb, '', new.company_id);
      end if;
    else
      did := null;
      if who <> '' then
        insert into daily_tasks (task, date, assignee, target, label, client, note, priority, done, company_id)
        values ('[' || coalesce(inq.client, '') || '] ' || txt, new.delivery_date, who, '', '회사 업무',
                coalesce(inq.client, ''), '상담: ' || coalesce(nullif(inq.title, ''), inq.client, ''), '🟡 보통', false, new.company_id)
        returning id into did;
      end if;
      insert into inquiry_todos (inquiry_id, task, due_date, assignee, daily_task_id, created_by, company_id, source_key)
      values (inq.id, txt, new.delivery_date, who, did, '자동', new.company_id, skey);
      insert into inquiry_logs (inquiry_id, direction, channel, body, images, author, company_id)
      values (inq.id, 'system', '', '할 일 자동 추가 · ' || txt || ' (' || coalesce(nullif(who, ''), '담당 없음') || ' · ' || md || ') — 작업요청서 ' || new.doc_number,
              '[]'::jsonb, '', new.company_id);
    end if;
    -- 목록용 '다음 할 일' 요약 다시 계산 (가장 급한 미완료 외 N건)
    select count(*) into n from inquiry_todos where inquiry_id = inq.id and not done;
    select task, due_date into o from inquiry_todos where inquiry_id = inq.id and not done
     order by due_date nulls last, id limit 1;
    update inquiries set
        next_action = case when n > 0 then o.task || case when n > 1 then ' 외 ' || (n - 1) || '건' else '' end else '' end,
        next_action_date = case when n > 0 then o.due_date else null end
     where id = inq.id;
  end loop;
  return new;
end $$;

drop trigger if exists trg_confirmations_wr_ship_todo on confirmations;
create trigger trg_confirmations_wr_ship_todo after insert or update of delivery_date, status, company_name
  on confirmations for each row execute function confirmations_wr_ship_todo();
