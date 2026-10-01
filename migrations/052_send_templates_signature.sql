-- 052: 보내기 — 회사 메일 서명(HTML)을 send_templates에 저장 (doc_type 'sig', channel 'email')
--  네이버웍스 메일쓰기 주소로 본문을 넣으면 네이버웍스 기본 서명이 사라져서, 우리가 본문 끝에 서명을 붙임
alter table send_templates drop constraint if exists send_templates_doc_type_check;
alter table send_templates add constraint send_templates_doc_type_check check (doc_type in ('quote', 'dc', 'wr', 'pre', 'msg', 'sig'));
