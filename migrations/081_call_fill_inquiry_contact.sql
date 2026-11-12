-- 통화를 상담에 연결하면(자동·직접·새 상담) 통화의 고객 정보로 상담의 **빈 칸만** 채움 (2026-11-12)
-- 예전엔 '새 상담으로 등록'만 연락처를 넣고, '이 상담에 기록'·맥미니 자동 연결은 타임라인 기록만 남겨
-- 이메일 등으로 먼저 만든 상담에 전화번호가 비어 있었음. 연결된 뒤 통화 화면에서 고객 정보를 고쳐도 빈 칸이면 채움
create or replace function calls_fill_inquiry_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ph text := coalesce(nullif(new.contact_phone, ''), new.other_number, '');
begin
  if new.inquiry_id is null then return new; end if;
  if length(regexp_replace(ph, '\D', '', 'g')) < 9 then ph := ''; end if;  -- 내선(5578 등)은 빼기
  update inquiries i set
    contact_name  = case when coalesce(i.contact_name, '') = ''  then coalesce(new.contact_name, '')  else i.contact_name end,
    contact_dept  = case when coalesce(i.contact_dept, '') = ''  then coalesce(new.contact_dept, '')  else i.contact_dept end,
    contact_title = case when coalesce(i.contact_title, '') = '' then coalesce(new.contact_title, '') else i.contact_title end,
    contact_phone = case when coalesce(i.contact_phone, '') = '' then ph                               else i.contact_phone end,
    contact_email = case when coalesce(i.contact_email, '') = '' then coalesce(new.contact_email, '') else i.contact_email end
  where i.id = new.inquiry_id and i.company_id = new.company_id
    and ((coalesce(i.contact_name, '') = '' and coalesce(new.contact_name, '') <> '')
      or (coalesce(i.contact_dept, '') = '' and coalesce(new.contact_dept, '') <> '')
      or (coalesce(i.contact_title, '') = '' and coalesce(new.contact_title, '') <> '')
      or (coalesce(i.contact_phone, '') = '' and ph <> '')
      or (coalesce(i.contact_email, '') = '' and coalesce(new.contact_email, '') <> ''));
  return new;
end $$;

drop trigger if exists trg_calls_fill_inquiry_contact on calls;
create trigger trg_calls_fill_inquiry_contact
  after insert or update of inquiry_id, contact_name, contact_dept, contact_title, contact_phone, contact_email, other_number on calls
  for each row execute function calls_fill_inquiry_contact();

-- 기존 연결 5건은 확인해 보니 이미 다 채워져 있어서 소급 채우기는 하지 않음
