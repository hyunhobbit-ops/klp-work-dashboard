-- 회의록 수정을 회사 구성원 누구나 가능하게 (볼 수 있는 회의는 고칠 수 있음). 삭제는 작성자·관리자 유지.
drop policy if exists meetings_update on meetings;
create policy meetings_update on meetings for update to authenticated
using (company_id = current_company_id() and (
  (not coalesce(is_private,false)) or (author = current_profile_name())
  or (attendees ? current_profile_name())
  or (current_profile_role() = any (array['관리자','부장','대표']))
))
with check (company_id = current_company_id());

drop policy if exists meeting_actions_write on meeting_actions;
create policy meeting_actions_write on meeting_actions for all to authenticated
using (company_id = current_company_id() and exists (
  select 1 from meetings m where m.id = meeting_actions.meeting_id
))
with check (company_id = current_company_id() and exists (
  select 1 from meetings m where m.id = meeting_actions.meeting_id
));
