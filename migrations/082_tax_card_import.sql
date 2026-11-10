-- 세무·손익: 카드 사용 내역 가져오기 (2026-11-10)
-- 이카운트 회계 I › 계좌/카드 › 카드매입조회(전체 탭) 엑셀을 Aside가 받아 tax_ledger(source='card', side='purchase')로 넣음
-- 엑셀 열: 일시 / 카드명 / 거래업체명 / 총금액 / 부가세 / 상대계정코드 / 상대계정명 / 상태 / 전표종류 / 전표번호
-- 총금액은 부가세 포함 → supply = 총금액 − 부가세

alter table tax_ledger add column if not exists card_name text not null default '';
alter table tax_ledger add column if not exists post_status text not null default '';   -- 카드: 미반영 / 회계반영 / 강제회계반영
alter table tax_ledger add column if not exists voucher text not null default '';       -- 카드: 전표종류 + 전표번호

alter table aside_jobs drop constraint if exists aside_jobs_kind_check;
alter table aside_jobs add constraint aside_jobs_kind_check check (kind in ('ecount_ledger_import', 'ecount_card_import'));

create or replace function tax_ledger_replace(p_from date, p_to date, p_rows jsonb,
                                              p_source text default 'ecount', p_job bigint default null,
                                              p_company bigint default null)
returns int language plpgsql security invoker set search_path = public as $$
declare
  cid bigint := coalesce(p_company, current_company_id());
  n int;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not tax_can_access() then
    raise exception '권한이 없습니다';
  end if;
  if cid is null then raise exception '회사를 알 수 없습니다'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception '기간이 잘못됐습니다'; end if;
  if p_source not in ('ecount', 'card', 'bank') then raise exception '바꿔 넣을 수 없는 출처: %', p_source; end if;

  delete from tax_ledger where company_id = cid and source = p_source and txn_date between p_from and p_to;
  insert into tax_ledger (company_id, txn_date, doc_no, side, kind, e_kind, partner, detail, supply, vat,
                          source, account, card_name, post_status, voucher, job_id, created_by)
  select cid, (r->>'txn_date')::date, coalesce(r->>'doc_no', ''), r->>'side',
         coalesce(r->>'kind', ''), coalesce(r->>'e_kind', ''), coalesce(r->>'partner', ''), coalesce(r->>'detail', ''),
         coalesce((r->>'supply')::numeric, 0), coalesce((r->>'vat')::numeric, 0),
         p_source, coalesce(r->>'account', ''), coalesce(r->>'card_name', ''), coalesce(r->>'post_status', ''),
         coalesce(r->>'voucher', ''), p_job, coalesce(current_profile_name(), 'Aside')
  from jsonb_array_elements(p_rows) r
  where (r->>'txn_date')::date between p_from and p_to;
  get diagnostics n = row_count;
  insert into tax_settings (company_id, settings) values (cid, '{}'::jsonb) on conflict (company_id) do nothing;
  update tax_settings set settings = settings || jsonb_build_object(p_source || '_imported_at', now(),
                                                                    p_source || '_imported_range', jsonb_build_array(p_from, p_to),
                                                                    p_source || '_imported_rows', n)
   where company_id = cid;
  return n;
end $$;
revoke all on function tax_ledger_replace(date, date, jsonb, text, bigint, bigint) from public, anon;
grant execute on function tax_ledger_replace(date, date, jsonb, text, bigint, bigint) to authenticated, service_role;
