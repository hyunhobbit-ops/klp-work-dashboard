-- 043: 거래처 등급 S·A·B·C (S 중요 · A 우수 · B 일반 · C 관심) — 거래처 DB와 상담이 같은 값을 공유
-- clients.grade 는 원래 자유 입력이었음 → 'S'/'A'/'B'/'C'/'' 로 정리 (S1·S2 → S, B1 → B)
-- 상담(inquiries.grade)에서 바꾸면 거래처 DB 등급도, 거래처 DB에서 바꾸면 그 거래처의 상담 등급도 같이 바뀜

update clients set grade = upper(left(btrim(grade), 1))
 where coalesce(btrim(grade), '') <> '' and upper(left(btrim(grade), 1)) in ('S', 'A', 'B', 'C') and grade <> upper(left(btrim(grade), 1));

alter table inquiries add column if not exists grade text default '';

-- 상담 등급 → 거래처 등급 (값이 있을 때만, 다를 때만)
create or replace function inquiries_ensure_client() returns trigger
language plpgsql set search_path = public as $$
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
    return new;
end $$;

drop trigger if exists trg_inquiries_ensure_client on inquiries;
create trigger trg_inquiries_ensure_client after insert or update of client, company_address, company_fax, company_website,
    contact_name, contact_phone, contact_email, grade on inquiries
    for each row execute function inquiries_ensure_client();

-- 거래처 등급 → 그 거래처 상담들
create or replace function clients_grade_to_inquiries() returns trigger
language plpgsql set search_path = public as $$
begin
    update inquiries set grade = coalesce(new.grade, '')
     where company_id = new.company_id and client_name_key(client) = client_name_key(new.company_name)
       and coalesce(grade, '') is distinct from coalesce(new.grade, '');
    return new;
end $$;

drop trigger if exists trg_clients_grade_to_inquiries on clients;
create trigger trg_clients_grade_to_inquiries after update of grade on clients
    for each row when (old.grade is distinct from new.grade)
    execute function clients_grade_to_inquiries();

-- 지금 있는 상담에 거래처 등급 복사
update inquiries i set grade = c.grade
  from clients c
 where c.company_id = i.company_id and client_name_key(c.company_name) = client_name_key(i.client)
   and coalesce(c.grade, '') <> '' and coalesce(i.grade, '') = '';
