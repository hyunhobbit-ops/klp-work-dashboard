-- 멀티테넌트 T5: 회사 멤버 표시 순서/활성 여부 (일일계획표·회의록 담당자 목록 생성용)
alter table profiles add column if not exists sort_order int default 100;
alter table profiles add column if not exists is_active boolean default true;

-- KLP 기존 표시 순서 유지 (이현주, 김현호, 유지은, 구정두, 대표님(김관택))
update profiles set sort_order = 10 where name = '이현주' and company_id = 1;
update profiles set sort_order = 20 where name = '김현호' and company_id = 1;
update profiles set sort_order = 30 where name = '유지은' and company_id = 1;
update profiles set sort_order = 40 where name = '구정두' and company_id = 1;
update profiles set sort_order = 50 where name = '김관택' and company_id = 1;
