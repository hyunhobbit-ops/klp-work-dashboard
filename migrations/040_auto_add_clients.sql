-- 040: 다른 메뉴(상담·견적 의뢰·국내 프로젝트)에서 입력한 거래처가 국내 거래처 DB에 없으면 자동 추가
-- 어디서 입력하든(새로 입력·표에서 바로 수정·편집 창) 빠지지 않도록 DB 트리거로 처리
-- 같은 회사 판단: '(주)'·'주식회사'·'㈜'·공백 등을 뺀 이름이 같으면 같은 거래처 (해외 거래처 DB도 확인)
-- 매출처 칸 → category '매출처', 매입처 칸 → '매입처'. 상담은 고객 담당자·연락처·이메일도 담당직원 칸에 넣음
-- '개인'·'자체'·'(회사명 모름)' 같은 회사가 아닌 이름은 건너뜀

create or replace function client_name_key(n text) returns text
language sql immutable set search_path = public as $$
    select regexp_replace(lower(coalesce(n, '')), '주식회사|유한회사|\(주\)|\(유\)|㈜|\s', '', 'g')
$$;

create index if not exists clients_name_key_idx on clients (company_id, client_name_key(company_name));

create or replace function ensure_client_exists(p_name text, p_category text, p_company bigint,
    p_staff text default '', p_mobile text default '', p_email text default '') returns void
language plpgsql set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); k text := client_name_key(p_name);
begin
    if p_company is null or length(k) < 2 or length(nm) > 60 then return; end if;
    if nm ~ '(모름|미정|없음|미상)' or k in ('개인', '자체', '본사', '기타', '테스트', '고객', '개인고객') then return; end if;
    if exists (select 1 from clients where company_id = p_company and client_name_key(company_name) = k) then return; end if;
    if exists (select 1 from clients_overseas where company_id = p_company and client_name_key(company_name) = k) then return; end if;
    insert into clients (company_name, category, staff_name, staff_mobile, staff_email, company_id)
    values (nm, coalesce(p_category, ''), coalesce(p_staff, ''), coalesce(p_mobile, ''), coalesce(p_email, ''), p_company);
end $$;

-- 상담: 거래처 = 매출처
create or replace function inquiries_ensure_client() returns trigger
language plpgsql set search_path = public as $$
begin
    if tg_op = 'INSERT' or old.client is distinct from new.client then
        perform ensure_client_exists(new.client, '매출처', new.company_id, new.contact_name, new.contact_phone, new.contact_email);
    end if;
    return new;
end $$;
drop trigger if exists trg_inquiries_ensure_client on inquiries;
create trigger trg_inquiries_ensure_client after insert or update of client on inquiries
    for each row execute function inquiries_ensure_client();

-- 견적 의뢰 · 국내 프로젝트: 매출처 / 매입처
create or replace function projects_ensure_clients() returns trigger
language plpgsql set search_path = public as $$
begin
    if tg_op = 'INSERT' or old.client is distinct from new.client then
        perform ensure_client_exists(new.client, '매출처', new.company_id);
    end if;
    if tg_op = 'INSERT' or old.supplier is distinct from new.supplier then
        perform ensure_client_exists(new.supplier, '매입처', new.company_id);
    end if;
    return new;
end $$;
drop trigger if exists trg_projects_temp_ensure_clients on projects_temp;
create trigger trg_projects_temp_ensure_clients after insert or update of client, supplier on projects_temp
    for each row execute function projects_ensure_clients();
drop trigger if exists trg_projects_domestic_ensure_clients on projects_domestic;
create trigger trg_projects_domestic_ensure_clients after insert or update of client, supplier on projects_domestic
    for each row execute function projects_ensure_clients();
