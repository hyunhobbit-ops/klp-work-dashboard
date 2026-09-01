-- 타임박스(내 하루): 일일계획표 할 일에 시간 블록 정보 추가
-- start_min: 자정 기준 시작 분(null=미배정, Brain dump), duration_min: 길이(분)
-- big3_rank: 오늘 꼭 마쳐야 할 일 1~3 (null=아님), category: 회사/미팅/회의/개인 (work/client/meet/me)
alter table daily_tasks add column if not exists start_min int;
alter table daily_tasks add column if not exists duration_min int;
alter table daily_tasks add column if not exists big3_rank smallint;
alter table daily_tasks add column if not exists category text;
