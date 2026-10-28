-- 076: 카카오톡 정기 알림(08:30·13:00·17:00 KST, 평일) 내용 모으기 — 엣지 함수 kakao 의 digest 가 사람마다 호출
-- p_name = 대시보드 표시 이름(daily_tasks.assignee 와 같음, 김관택 → 대표님), p_pay = 입금·계산서 칸 포함 여부(이현주·김현호·대표님)
-- 오늘·밀린·내일 할 일에서는 상담(국내) 할 일과 연결된 일일계획표 행을 빼고 '국내' 칸에만 보여줌
create or replace function kakao_digest(p_company bigint, p_name text, p_pay boolean)
returns jsonb language sql stable security definer set search_path = public as $$
with d as (select (now() at time zone 'Asia/Seoul')::date as today),
inq_linked as (select daily_task_id from inquiry_todos where daily_task_id is not null and company_id = p_company),
mine as (
    select t.* from daily_tasks t
    where t.company_id = p_company and t.assignee = p_name and t.is_deadline_copy is not true
      and t.id not in (select daily_task_id from inq_linked)
)
select jsonb_build_object(
  'today', (select coalesce(jsonb_agg(jsonb_build_object('task', task, 'done', done) order by done, sort_order nulls last, id), '[]') from mine, d where mine.date = d.today),
  'overdue', (select coalesce(jsonb_agg(jsonb_build_object('task', task, 'date', date) order by date desc, id), '[]') from mine, d where mine.date < d.today and done is not true),
  'tomorrow', (select coalesce(jsonb_agg(jsonb_build_object('task', task) order by sort_order nulls last, id), '[]') from mine, d where mine.date = d.today + 1 and done is not true),
  'domestic', (select coalesce(jsonb_agg(jsonb_build_object('task', it.task, 'client', i.client, 'due', it.due_date) order by it.due_date nulls last, it.id), '[]')
               from inquiry_todos it join inquiries i on i.id = it.inquiry_id
               left join daily_tasks dt on dt.id = it.daily_task_id
               where it.company_id = p_company and it.assignee = p_name and coalesce(dt.done, it.done) is not true),
  'calls', (select coalesce(jsonb_agg(jsonb_build_object('text', t->>'text', 'client', nullif(coalesce(c.client_name, ''), '')) order by c.started_at desc), '[]')
            from calls c, jsonb_array_elements(coalesce(c.todos, '[]')) t, d
            where c.company_id = p_company and c.started_at >= d.today - 7
              and coalesce(t->>'assignee', '') = p_name
              and coalesce((t->>'done')::boolean, false) = false and t->>'sent_at' is null),
  'sourcing', (select coalesce(jsonb_agg(jsonb_build_object('text', s.text, 'title', p.title) order by s.due nulls last, s.id), '[]')
               from sourcing_todos s join sourcing_projects p on p.id = s.project_id
               where s.company_id = p_company and s.kind = 'question' and s.done is not true and coalesce(nullif(s.assignee, ''), '김현호') = p_name),
  'due_soon', (select coalesce(jsonb_agg(jsonb_build_object('client', client, 'product', product_name, 'date', delivery_date) order by delivery_date, id), '[]')
               from projects_domestic, d
               where company_id = p_company and status not in ('완료', '취소')
                 and delivery_date between d.today and d.today + 1
                 and coalesce((checks->>'delivered')::boolean, false) = false
                 and (split_part(coalesce(manager, ''), ' ', 1) = p_name or p_name = any(coalesce(assignees, '{}')))),
  'pay', case when p_pay then (select coalesce(jsonb_agg(jsonb_build_object('client', client, 'product', product_name,
                     'unpaid', coalesce((checks->>'finalPayment')::boolean, false) = false,
                     'noinv', coalesce((checks->>'invoice')::boolean, false) = false) order by delivery_date desc nulls last, id), '[]')
               from projects_domestic
               where company_id = p_company and status <> '취소' and coalesce((checks->>'delivered')::boolean, false)
                 and (coalesce((checks->>'finalPayment')::boolean, false) = false or coalesce((checks->>'invoice')::boolean, false) = false))
         else '[]'::jsonb end
)
$$;
revoke all on function kakao_digest(bigint, text, boolean) from public, anon, authenticated;
grant execute on function kakao_digest(bigint, text, boolean) to service_role;
