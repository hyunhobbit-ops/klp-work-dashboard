-- 036: 상담 — 고객 연락처를 칸별로 저장 + 기록 한 줄에 사진 여러 장
-- (035의 client_contact 한 칸 → 이름/직함/연락처/이메일 분리. 기존 값은 이름 칸으로 옮김)

alter table inquiries add column if not exists contact_name  text default '';
alter table inquiries add column if not exists contact_title text default '';   -- 직함·부서
alter table inquiries add column if not exists contact_phone text default '';
alter table inquiries add column if not exists contact_email text default '';

update inquiries
   set contact_name = client_contact
 where coalesce(contact_name, '') = '' and coalesce(client_contact, '') <> '';

-- 붙여넣은 이미지 여러 장 (압축된 base64 배열). 예전 image 한 칸은 읽기 호환용으로 유지
alter table inquiry_logs add column if not exists images jsonb not null default '[]'::jsonb;

-- 037 (2026-09-28): 부서를 직함과 분리
alter table inquiries add column if not exists contact_dept text default '';
