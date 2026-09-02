-- 033: 타임박스 할 일/루틴 수동 정렬 순서
-- 할 일(Brain dump)과 루틴 목록에서 드래그로 순서를 바꿀 수 있게 sort_order 추가.
-- null이면 기존 규칙(오래된 날짜순/등록순)으로 정렬, 값이 있으면 그 순서가 우선.

alter table daily_tasks add column if not exists sort_order int;
alter table routines add column if not exists sort_order int;
