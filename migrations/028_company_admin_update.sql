-- 회사 관리자가 자기 회사 설정(브랜딩·모듈)을 수정할 수 있게
drop policy if exists companies_admin_update on companies;
create policy companies_admin_update on companies for update to authenticated
using (id = current_company_id() and current_profile_role() = any (array['관리자','부장','대표']))
with check (id = current_company_id() and current_profile_role() = any (array['관리자','부장','대표']));
