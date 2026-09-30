-- 041: 상담 — 입력칸 DB화 (대표님 피드백 2026-09-30)
-- 고객 회사 정보(주소·팩스·홈페이지) + 요청 사항(품목·수량·납기·예산·용도·인쇄·포장·샘플·배송지)
-- 전화 상담 체크리스트가 이 칸들을 순서대로 채우게 함. 메일 붙여넣기 시 AI가 자동 입력

alter table inquiries add column if not exists company_address text default '';
alter table inquiries add column if not exists company_fax text default '';
alter table inquiries add column if not exists company_website text default '';
alter table inquiries add column if not exists items jsonb not null default '[]'::jsonb;   -- [{name, qty}]
alter table inquiries add column if not exists due_date date;                  -- 희망 납기
alter table inquiries add column if not exists budget text default '';          -- 예산·희망 단가
alter table inquiries add column if not exists purpose text default '';         -- 용도·행사
alter table inquiries add column if not exists print_request text default '';   -- 인쇄·각인 요청
alter table inquiries add column if not exists packaging_request text default '';
alter table inquiries add column if not exists sample_needed text default '';   -- '필요' / '불필요' / ''
alter table inquiries add column if not exists delivery_address text default '';

-- 거래처 자동 추가 때 주소·팩스도 같이 넣는다 (040의 함수 확장)
-- 인자 수가 달라지면 새 함수가 따로 생겨 호출이 모호해지므로 옛 것을 먼저 지운다
drop function if exists ensure_client_exists(text, text, bigint, text, text, text);
create or replace function ensure_client_exists(p_name text, p_category text, p_company bigint,
    p_staff text default '', p_mobile text default '', p_email text default '',
    p_address text default '', p_fax text default '') returns void
language plpgsql set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); k text := client_name_key(p_name);
begin
    if p_company is null or length(k) < 2 or length(nm) > 60 then return; end if;
    if nm ~ '(모름|미정|없음|미상)' or k in ('개인', '자체', '본사', '기타', '테스트', '고객', '개인고객') then return; end if;
    if exists (select 1 from clients where company_id = p_company and client_name_key(company_name) = k) then return; end if;
    if exists (select 1 from clients_overseas where company_id = p_company and client_name_key(company_name) = k) then return; end if;
    insert into clients (company_name, category, staff_name, staff_mobile, staff_email, address, fax, company_id)
    values (nm, coalesce(p_category, ''), coalesce(p_staff, ''), coalesce(p_mobile, ''), coalesce(p_email, ''),
            coalesce(p_address, ''), coalesce(p_fax, ''), p_company);
end $$;

create or replace function inquiries_ensure_client() returns trigger
language plpgsql set search_path = public as $$
begin
    if tg_op = 'INSERT' or old.client is distinct from new.client then
        perform ensure_client_exists(new.client, '매출처', new.company_id, new.contact_name, new.contact_phone, new.contact_email,
                                     new.company_address, new.company_fax);
    end if;
    return new;
end $$;
