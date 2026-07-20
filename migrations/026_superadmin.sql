-- 멀티테넌트 T7: 슈퍼관리자(운영자) 플래그. 김현호만 회사 생성 화면 접근 가능.
alter table profiles add column if not exists is_superadmin boolean default false;
update profiles set is_superadmin = true where name = '김현호' and company_id = 1;
