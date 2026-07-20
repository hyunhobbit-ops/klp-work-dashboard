-- 7/14 백업 테이블 잠금 (RLS 없이 노출돼 있던 것). 정책 없음 = 서비스롤만 접근, 백업 데이터 유지.
alter table if exists clients_backup_20260714 enable row level security;
