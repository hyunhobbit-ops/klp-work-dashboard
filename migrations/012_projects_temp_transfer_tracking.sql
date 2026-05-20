-- ============================================================
-- 견적 의뢰(projects_temp) → 국내 프로젝트(projects_domestic) 등록 추적
-- ============================================================
-- 배경:
--   견적 의뢰에서 컨펌된 견적을 국내 프로젝트로 옮길 때
--   "이미 등록한 견적"인지 추적하기 위한 두 컬럼 추가.
-- 모델:
--   같은 (date, client) 그룹의 모든 행에 동일한 transferred_at 과
--   생성된 국내 프로젝트 id 배열(transferred_project_ids)을 함께 기록.
-- 사용:
--   app.js transferGroupToDomestic 이 그룹 단위로 채움.
--   UI 에서는 transferred_at IS NOT NULL 인 그룹을 "✓ 등록 완료" 로 표시.
-- 1회성 실행. 컬럼이 이미 있으면 IF NOT EXISTS 로 안전.
-- ============================================================

alter table projects_temp
    add column if not exists transferred_at timestamptz,
    add column if not exists transferred_project_ids uuid[];

-- 인덱스: 등록 완료 여부 필터링 (그룹 단위 정렬/조회 시 빠르게)
create index if not exists projects_temp_transferred_at_idx
    on projects_temp (transferred_at);

-- 확인용:
-- select id, date, client, item, transferred_at, transferred_project_ids
--   from projects_temp
--  order by date desc, client;
