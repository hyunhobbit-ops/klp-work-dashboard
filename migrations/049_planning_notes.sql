-- 049: 프로젝트 글을 '할 일'(task)과 '자료·제안'(note)으로 분리
--  kind: task(진행 상태·마감·담당) / note(제안·조사·자료 — 상태 없음)
--  note_status: 제안의 검토 중(review·null) / 채택(adopted) / 보류(hold)
--  ref_ids: 할 일에 연결된 자료·제안 글 id 목록 (채택으로 만든 할 일은 원래 제안이 들어감)
alter table planning_posts add column if not exists kind text not null default 'task';
alter table planning_posts add column if not exists note_status text;
alter table planning_posts add column if not exists ref_ids jsonb not null default '[]'::jsonb;
alter table planning_posts drop constraint if exists planning_posts_kind_check;
alter table planning_posts add constraint planning_posts_kind_check check (kind in ('task', 'note'));
-- 기존 글: 제안·조사·자료이면서 담당자·마감일이 없는 것 = 자료·제안. 담당자나 마감이 있으면 할 일로 남김
update planning_posts set kind = 'note'
 where parent_id is null and category in ('propose', 'research', 'material')
   and coalesce(jsonb_array_length(assignees), 0) = 0 and deadline is null;
