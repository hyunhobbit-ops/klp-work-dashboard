-- ============================================================
-- 012 hotfix: transferred_project_ids 타입을 uuid[] → bigint[] 로 정정
-- ============================================================
-- 배경:
--   012에서 transferred_project_ids 를 uuid[] 로 잘못 선언함.
--   projects_domestic.id 는 bigint 이므로 insert 시
--   "invalid input syntax for type uuid: <number>" 에러 발생.
-- 안전성:
--   012 적용 직후 데이터가 비어 있다는 가정으로 단순 DROP/ADD.
--   이미 채워진 행이 있다면 USING 절로 캐스팅 시도 (uuid 문자열을 bigint 로
--   못 바꾸므로, 실제로는 12를 적용한 직후라 비어 있어야 함).
-- ============================================================

alter table projects_temp
    drop column if exists transferred_project_ids;

alter table projects_temp
    add column transferred_project_ids bigint[];

-- 확인용:
-- select column_name, data_type, udt_name
--   from information_schema.columns
--  where table_name = 'projects_temp'
--    and column_name = 'transferred_project_ids';
