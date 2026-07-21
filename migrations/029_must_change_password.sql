-- 첫 로그인 시 비밀번호 강제 변경용. 기존 사용자는 false(강제 안 함), 신규 계정만 서버리스에서 true 설정.
alter table profiles add column if not exists must_change_password boolean default false;
