-- 051: 보내기 양식 종류 추가 — 상담 화면의 가견적 안내(pre)·안내 메시지(msg, 첨부 없음)
alter table send_templates drop constraint if exists send_templates_doc_type_check;
alter table send_templates add constraint send_templates_doc_type_check check (doc_type in ('quote', 'dc', 'wr', 'pre', 'msg'));
