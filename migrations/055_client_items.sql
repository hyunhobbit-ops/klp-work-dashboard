-- 055: 거래처 DB '품목' 칸 + 상담 품목으로 빈 칸 채우기 / 상담 자동 등록에서 '테스트' 회사도 등록
--  (예전엔 이름이 '테스트'((주)·띄어쓰기 빼고)인 회사는 연습 데이터로 보고 거래처 DB 자동 추가에서 건너뜀 → 시연 때 안 보였음)
alter table clients add column if not exists items text not null default '';

create or replace function public.ensure_client_exists(p_name text, p_category text, p_company bigint, p_staff text DEFAULT ''::text, p_mobile text DEFAULT ''::text, p_email text DEFAULT ''::text, p_address text DEFAULT ''::text, p_fax text DEFAULT ''::text, p_website text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare nm text := btrim(coalesce(p_name, '')); k text := client_name_key(p_name);
begin
    if p_company is null or length(k) < 2 or length(nm) > 60 then return; end if;
    if nm ~ '(모름|미정|없음|미상)' or k in ('개인', '자체', '본사', '기타', '고객', '개인고객') then return; end if;
    if exists (select 1 from clients where company_id = p_company and client_name_key(company_name) = k) then return; end if;
    if exists (select 1 from clients_overseas where company_id = p_company and client_name_key(company_name) = k) then return; end if;
    insert into clients (company_name, category, staff_name, staff_mobile, staff_email, address, fax, website, company_id)
    values (nm, coalesce(p_category, ''), coalesce(p_staff, ''), coalesce(p_mobile, ''), coalesce(p_email, ''),
            coalesce(p_address, ''), coalesce(p_fax, ''), coalesce(p_website, ''), p_company);
end $function$;

-- 상담 품목(inquiries.items jsonb [{name,qty}]) → 거래처 품목 빈 칸
create or replace function inquiry_items_text(j jsonb) returns text language sql immutable as $$
  select coalesce(string_agg(distinct btrim(e->>'name'), ', '), '')
    from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) e
   where coalesce(btrim(e->>'name'), '') <> ''
$$;

create or replace function public.inquiries_ensure_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
    if tg_op = 'INSERT' or old.client is distinct from new.client then
        perform ensure_client_exists(new.client, '매출처', new.company_id, new.contact_name, new.contact_phone, new.contact_email,
                                     new.company_address, new.company_fax, new.company_website);
    end if;
    perform fill_client_blanks_from_inquiry(new.client, new.company_id, new.company_address, new.company_fax, new.company_website,
                                            new.contact_name, new.contact_phone, new.contact_email);
    if coalesce(new.grade, '') <> '' and (tg_op = 'INSERT' or old.grade is distinct from new.grade or old.client is distinct from new.client) then
        update clients set grade = new.grade
         where company_id = new.company_id and client_name_key(company_name) = client_name_key(new.client)
           and grade is distinct from new.grade;
    end if;
    -- 품목: 거래처 품목이 비어 있으면 상담 품목으로
    if inquiry_items_text(new.items) <> '' then
        update clients set items = inquiry_items_text(new.items)
         where company_id = new.company_id and client_name_key(company_name) = client_name_key(new.client)
           and coalesce(items, '') = '';
    end if;
    return new;
end $function$;

-- 기존 상담 품목으로 거래처 품목 빈 칸 채우기 (거래처마다 상담 품목을 모아서)
update clients c set items = x.its
  from (select i.company_id, client_name_key(i.client) k, string_agg(distinct btrim(e->>'name'), ', ') its
          from inquiries i, jsonb_array_elements(case when jsonb_typeof(i.items) = 'array' then i.items else '[]'::jsonb end) e
         where coalesce(btrim(e->>'name'), '') <> ''
         group by 1, 2) x
 where c.company_id = x.company_id and client_name_key(c.company_name) = x.k and coalesce(c.items, '') = '';

-- 상담 품목을 고칠 때도 돌도록
drop trigger if exists trg_inquiries_ensure_client on inquiries;
create trigger trg_inquiries_ensure_client after insert or update of client, company_address, company_fax, company_website, contact_name, contact_phone, contact_email, grade, items
  on inquiries for each row execute function inquiries_ensure_client();
