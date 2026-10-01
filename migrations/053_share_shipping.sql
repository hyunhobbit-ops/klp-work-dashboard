-- 053: 납기·배송(받는 분·연락처·주소) 서류 간 자동 공유 — 어디서 적든 비어 있는 칸만 채움(덮어쓰지 않음)
--  상담(inquiries.due_date·delivery_address) ↔ 국내 프로젝트(projects_domestic.delivery_date·recipient·phone·address)
--  ← 디자인확인서·작업요청서(confirmations.delivery_date·delivery_address = JSON ["받는 분","연락처","주소"])
--  예전엔 디자인확인서에만 적으면 프로젝트가 비어 있어 작업요청서가 연동되지 않았음

-- confirmations.delivery_address 풀기 (doc-generator unpackShip과 같은 규칙: JSON 배열, 구버전 'a / b / c')
create or replace function ship_parts(t text) returns text[] language plpgsql immutable as $$
declare j jsonb; parts text[];
begin
  t := coalesce(t, '');
  if btrim(t) = '' then return array['', '', '']; end if;
  if left(btrim(t), 1) = '[' then
    begin
      j := t::jsonb;
      if jsonb_typeof(j) = 'array' then
        return array[coalesce(j->>0, ''), coalesce(j->>1, ''), coalesce(j->>2, '')];
      end if;
    exception when others then null;
    end;
  end if;
  parts := string_to_array(t, ' / ');
  return array[coalesce(parts[1], ''), coalesce(parts[2], ''),
               coalesce(array_to_string(parts[3:coalesce(array_length(parts, 1), 0)], ' / '), '')];
end $$;

-- 1) 국내 프로젝트가 디자인확인서·상담과 연결될 때 → 비어 있는 납기·배송 채우기
create or replace function projects_domestic_fill_shipping() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record; sp text[]; q record;
begin
  if coalesce(new.source_doc_number, '') <> ''
     and (new.delivery_date is null or coalesce(new.recipient, '') = '' or coalesce(new.phone, '') = '' or coalesce(new.address, '') = '') then
    for c in
      select delivery_date, delivery_address from confirmations
       where company_id = new.company_id
         and (doc_number = new.source_doc_number or doc_number like new.source_doc_number || '\_%')
       order by (doc_number = new.source_doc_number) desc, created_at desc
    loop
      sp := ship_parts(c.delivery_address);
      if new.delivery_date is null then new.delivery_date := c.delivery_date; end if;
      if coalesce(new.recipient, '') = '' then new.recipient := sp[1]; end if;
      if coalesce(new.phone, '') = '' then new.phone := sp[2]; end if;
      if coalesce(new.address, '') = '' then new.address := sp[3]; end if;
    end loop;
  end if;
  if new.inquiry_id is not null
     and (new.delivery_date is null or coalesce(new.address, '') = '') then
    select due_date, delivery_address, contact_name, contact_phone into q
      from inquiries where id = new.inquiry_id and company_id = new.company_id;
    if found then
      if new.delivery_date is null then new.delivery_date := q.due_date; end if;
      if coalesce(new.address, '') = '' and coalesce(q.delivery_address, '') <> '' then
        new.address := q.delivery_address;
        if coalesce(new.recipient, '') = '' then new.recipient := coalesce(q.contact_name, ''); end if;
        if coalesce(new.phone, '') = '' then new.phone := coalesce(q.contact_phone, ''); end if;
      end if;
    end if;
  end if;
  return new;
end $$;
-- set_company_id(trg_set_company_id) 다음에 돌도록 이름을 뒤로
drop trigger if exists trg_zz_projects_domestic_fill_shipping on projects_domestic;
create trigger trg_zz_projects_domestic_fill_shipping before insert or update of source_doc_number, inquiry_id
  on projects_domestic for each row execute function projects_domestic_fill_shipping();

-- 2) 디자인확인서·작업요청서를 저장할 때 → 연결된 국내 프로젝트의 비어 있는 칸 채우기
create or replace function confirmations_share_shipping() returns trigger
language plpgsql security definer set search_path = public as $$
declare dc text; sp text[];
begin
  if new.delivery_date is null and coalesce(new.delivery_address, '') = '' then return new; end if;
  dc := case when new.status = '작업요청서'
             then split_part(new.doc_number, '_', 1) || '_' || split_part(new.doc_number, '_', 2)
             else new.doc_number end;
  sp := ship_parts(new.delivery_address);
  update projects_domestic p set
      delivery_date = coalesce(p.delivery_date, new.delivery_date),
      recipient = case when coalesce(p.recipient, '') = '' then sp[1] else p.recipient end,
      phone     = case when coalesce(p.phone, '') = ''     then sp[2] else p.phone end,
      address   = case when coalesce(p.address, '') = ''   then sp[3] else p.address end
   where p.company_id = new.company_id and p.source_doc_number = dc
     and (p.delivery_date is null or coalesce(p.recipient, '') = '' or coalesce(p.phone, '') = '' or coalesce(p.address, '') = '');
  return new;
end $$;
drop trigger if exists trg_confirmations_share_shipping on confirmations;
create trigger trg_confirmations_share_shipping after insert or update of delivery_date, delivery_address
  on confirmations for each row execute function confirmations_share_shipping();

-- 3) 국내 프로젝트에 납기·배송이 생기면 → 연결된 상담의 비어 있는 희망 납기·배송지 채우기
create or replace function projects_domestic_share_to_inquiry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.inquiry_id is null then return new; end if;
  update inquiries i set
      due_date = coalesce(i.due_date, new.delivery_date),
      delivery_address = case when coalesce(i.delivery_address, '') = '' and coalesce(new.address, '') <> '' then new.address else i.delivery_address end
   where i.id = new.inquiry_id and i.company_id = new.company_id
     and ((i.due_date is null and new.delivery_date is not null)
          or (coalesce(i.delivery_address, '') = '' and coalesce(new.address, '') <> ''));
  return new;
end $$;
drop trigger if exists trg_projects_domestic_share_to_inquiry on projects_domestic;
create trigger trg_projects_domestic_share_to_inquiry after insert or update of delivery_date, address, inquiry_id, source_doc_number
  on projects_domestic for each row execute function projects_domestic_share_to_inquiry();

-- 기존 데이터 한 번 맞추기 (빈 칸만): 디자인확인서·작업요청서 → 국내 프로젝트
update projects_domestic set source_doc_number = source_doc_number
 where coalesce(source_doc_number, '') <> ''
   and (delivery_date is null or coalesce(recipient, '') = '' or coalesce(phone, '') = '' or coalesce(address, '') = '');

-- 상담 → 국내 프로젝트 (빈 칸만)
update projects_domestic p set
    delivery_date = coalesce(p.delivery_date, i.due_date),
    address   = case when coalesce(p.address, '') = '' and coalesce(i.delivery_address, '') <> '' then i.delivery_address else p.address end,
    recipient = case when coalesce(p.recipient, '') = '' and coalesce(p.address, '') = '' and coalesce(i.delivery_address, '') <> '' then coalesce(i.contact_name, '') else p.recipient end,
    phone     = case when coalesce(p.phone, '') = '' and coalesce(p.address, '') = '' and coalesce(i.delivery_address, '') <> '' then coalesce(i.contact_phone, '') else p.phone end
  from inquiries i
 where p.inquiry_id = i.id and p.company_id = i.company_id
   and ((p.delivery_date is null and i.due_date is not null) or (coalesce(p.address, '') = '' and coalesce(i.delivery_address, '') <> ''));

-- 국내 프로젝트 → 상담 (빈 칸만)
update inquiries i set
    due_date = coalesce(i.due_date, p.delivery_date),
    delivery_address = case when coalesce(i.delivery_address, '') = '' and coalesce(p.address, '') <> '' then p.address else i.delivery_address end
  from projects_domestic p
 where p.inquiry_id = i.id and p.company_id = i.company_id
   and ((i.due_date is null and p.delivery_date is not null) or (coalesce(i.delivery_address, '') = '' and coalesce(p.address, '') <> ''));
