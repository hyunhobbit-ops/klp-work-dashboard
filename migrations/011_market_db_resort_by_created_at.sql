-- ============================================================
-- 중고마켓DB: sort_order를 등록순(created_at ASC)으로 재번호화
-- ============================================================
-- 배경:
--   이전 dbMarketInsert가 신규 항목 sort_order를 (min - 1)로 넣어 음수가 누적,
--   asc 정렬 시 최신 등록이 NO 1로 올라오는 문제가 있었음.
-- 결과:
--   카테고리별로 가장 오래된 등록이 sort_order=0 (NO 1),
--   가장 최근 등록이 sort_order=N-1 (NO N),
--   앞으로 추가되는 신규 상품은 dbMarketInsert가 max+1로 NO N+1, N+2... 부여.
-- 1회성 실행 (재실행해도 결과는 동일).
-- ============================================================

with ranked as (
    select
        id,
        row_number() over (
            partition by category
            order by created_at asc nulls last, id asc
        ) - 1 as new_sort
    from market_db
)
update market_db md
set sort_order = ranked.new_sort
from ranked
where md.id = ranked.id
  and md.sort_order is distinct from ranked.new_sort;

-- 확인용 (실행 후 결과 미리보기):
-- select category, sort_order, created_at, name
--   from market_db
--  order by category, sort_order;
