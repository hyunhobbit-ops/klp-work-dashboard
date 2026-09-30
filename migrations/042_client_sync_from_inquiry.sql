-- 042: 상담에 입력한 회사 정보(주소·팩스·홈페이지)·담당자 → 거래처 DB의 '비어 있는 칸'에 채움
-- 사업자등록증으로 넣은 정식 정보는 덮어쓰지 않는다 (빈 칸만). 거래처 DB에 홈페이지 칸 추가.

alter table clients add column if not exists website text default '';

-- 새 거래처 자동 추가 때도 홈페이지까지
drop function if exists ensure_client_exists(text, text, bigint, text, text, text, text, text);
create or replace function ensure_client_exists(p_name text, p_category text, p_company bigint,
    p_staff text default '', p_mobile text default '', p_email text default '',
    p_address text default '', p_fax text default '', p_website text default '') returns void
language plpgsql set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); k text := client_name_key(p_name);
begin
    if p_company is null or length(k) < 2 or length(nm) > 60 then return; end if;
    if nm ~ '(모름|미정|없음|미상)' or k in ('개인', '자체', '본사', '기타', '테스트', '고객', '개인고객') then return; end if;
    if exists (select 1 from clients where company_id = p_company and client_name_key(company_name) = k) then return; end if;
    if exists (select 1 from clients_overseas where company_id = p_company and client_name_key(company_name) = k) then return; end if;
    insert into clients (company_name, category, staff_name, staff_mobile, staff_email, address, fax, website, company_id)
    values (nm, coalesce(p_category, ''), coalesce(p_staff, ''), coalesce(p_mobile, ''), coalesce(p_email, ''),
            coalesce(p_address, ''), coalesce(p_fax, ''), coalesce(p_website, ''), p_company);
end $$;

-- 이미 있는 거래처: 비어 있는 칸만 상담 정보로 채움
create or replace function fill_client_blanks_from_inquiry(p_name text, p_company bigint,
    p_address text, p_fax text, p_website text, p_staff text, p_mobile text, p_email text) returns void
language plpgsql set search_path = public as $$
declare k text := client_name_key(p_name);
begin
    if p_company is null or length(k) < 2 then return; end if;
    update clients c set
        address      = case when coalesce(c.address, '') = '' and coalesce(p_address, '') <> '' then p_address else c.address end,
        fax          = case when coalesce(c.fax, '') = '' and coalesce(p_fax, '') <> '' then p_fax else c.fax end,
        website      = case when coalesce(c.website, '') = '' and coalesce(p_website, '') <> '' then p_website else c.website end,
        staff_name   = case when coalesce(c.staff_name, '') = '' and coalesce(p_staff, '') <> '' then p_staff else c.staff_name end,
        staff_mobile = case when coalesce(c.staff_mobile, '') = '' and coalesce(p_mobile, '') <> '' then p_mobile else c.staff_mobile end,
        staff_email  = case when coalesce(c.staff_email, '') = '' and coalesce(p_email, '') <> '' then p_email else c.staff_email end
     where c.company_id = p_company and client_name_key(c.company_name) = k
       and ((coalesce(c.address, '') = '' and coalesce(p_address, '') <> '')
         or (coalesce(c.fax, '') = '' and coalesce(p_fax, '') <> '')
         or (coalesce(c.website, '') = '' and coalesce(p_website, '') <> '')
         or (coalesce(c.staff_name, '') = '' and coalesce(p_staff, '') <> '')
         or (coalesce(c.staff_mobile, '') = '' and coalesce(p_mobile, '') <> '')
         or (coalesce(c.staff_email, '') = '' and coalesce(p_email, '') <> ''));
end $$;

create or replace function inquiries_ensure_client() returns trigger
language plpgsql set search_path = public as $$
begin
    if tg_op = 'INSERT' or old.client is distinct from new.client then
        perform ensure_client_exists(new.client, '매출처', new.company_id, new.contact_name, new.contact_phone, new.contact_email,
                                     new.company_address, new.company_fax, new.company_website);
    end if;
    perform fill_client_blanks_from_inquiry(new.client, new.company_id, new.company_address, new.company_fax, new.company_website,
                                            new.contact_name, new.contact_phone, new.contact_email);
    return new;
end $$;

drop trigger if exists trg_inquiries_ensure_client on inquiries;
create trigger trg_inquiries_ensure_client after insert or update of client, company_address, company_fax, company_website,
    contact_name, contact_phone, contact_email on inquiries
    for each row execute function inquiries_ensure_client();
