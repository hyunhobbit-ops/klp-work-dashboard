-- 이행 점검 패널에서 '미전송' 액션아이템(일일계획표 미연동)도 완료 체크할 수 있게
-- meeting_actions 에 done 컬럼 추가. (전송된 항목의 완료는 여전히 daily_tasks.done 이 원본)
alter table meeting_actions add column if not exists done boolean default false;
