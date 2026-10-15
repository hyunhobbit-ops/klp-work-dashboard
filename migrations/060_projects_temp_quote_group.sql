-- 060: 견적 묶음 번호 — 같은 날·같은 매출처라도 새 견적을 따로 (2026-10-15 현호님 요청)
--  예전엔 견적 묶음을 날짜+매출처로만 구분해, 위 입력줄로 새 견적을 쓰면 같은 날 같은 거래처의 기존 견적에 이어 붙었음
--  위 입력줄·'새로 작성' = 새 quote_group, 견적 아래 '품목 추가' = 그 견적의 quote_group
--  quote_group 이 없는 예전 견적은 앱이 그대로 날짜+매출처로 묶음 (값 채우기 불필요)
alter table projects_temp add column if not exists quote_group text;
create index if not exists projects_temp_quote_group_idx on projects_temp (quote_group) where quote_group is not null;
