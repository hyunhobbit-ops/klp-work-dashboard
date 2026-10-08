-- 058: 제작진행표 (시계 제작 주문 내부 문서, 작업요청서의 내부용) — confirmations에 status '제작진행표'로 저장
--  문서번호 = 디자인확인서번호_P1, _P2… (디자인확인서 없이 만들면 PSYYMMDD-N)
--  표 전용 값(발주일·발주처 연락처·납품 방식·납품처·부품표)은 extra jsonb에
alter table confirmations add column if not exists extra jsonb not null default '{}'::jsonb;
