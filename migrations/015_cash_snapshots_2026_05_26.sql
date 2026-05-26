-- ============================================================
-- 자금확인 — 2026-05-26 잔액 업데이트 + 쇼피파이 계좌 추가
-- ============================================================
-- 배경:
--   조회기준일시 2026-05-26 기준 5개 이미지(예금/대출/외화/퇴직연금/페이오니아)에서
--   추출한 잔액으로 cash_snapshots 갱신.
--   동시에 신규 쇼피파이(USD) 계좌를 외화 카테고리에 추가.
-- ============================================================

-- 1) 신규 쇼피파이 계좌 추가 (외화 카테고리, USD)
insert into cash_accounts (category, label, account_number, nickname, currency, sort_order) values
    ('foreign', 'Shopify USD', '', '쇼피파이', 'USD', 2)
on conflict do nothing;

-- 2) 2026-05-26 스냅샷 (5개 이미지에서 추출한 잔액)
insert into cash_snapshots (account_id, snapshot_date, balance, source, recorded_by, note)
select a.id, '2026-05-26'::date, v.bal, 'manual', '주간업데이트',
       case when v.note = '' then null else v.note end
  from cash_accounts a
  join (values
      -- 예금
      ('보통예금(기업성김통장)', '078-080281-01-018', -137665046.00::numeric, '2026-05-22 거래 / 입출식 예금'),
      ('보통예금',               '078-080281-01-032',    332596.00::numeric, '2026-05-26 거래 / 입출식 예금'),
      ('주거래기업부금(정기적립식)', '078-080281-15-019',  12000000.00::numeric, '만기 2026-06-20 / 저축성 예금'),
      -- 대출
      ('중소기업자금', '078-080281-01-018', 137665046.00::numeric, '한도 150,000,000 / 만기 2027-03-19'),
      ('중소기업자금', '078-080281-32-00045', 280000000.00::numeric, '한도 280,000,000 / 만기 2027-03-19 / 이자납입일 2026-06-20'),
      -- 외화
      ('거주자외화보통예금(P@yGOS)', '078-080281-56-00011', 19287.90::numeric, 'USD / 2026-05-12 거래'),
      ('Shopify USD', '', 30514.74::numeric, 'USD / 쇼피파이 정산 잔액'),
      -- 퇴직연금
      ('퇴직연금확정기여(DC형)', '078-080281-94-003', 19500000.00::numeric, 'DC형 / 2025-10-10 거래'),
      -- 페이오니아
      ('Payoneer USD', '', 2221.64::numeric, 'USD 2,221.64 / EUR 0.00 / GBP 0.00')
  ) as v(label, acct, bal, note)
    on a.label = v.label and a.account_number = v.acct
 where not exists (
       select 1 from cash_snapshots s
        where s.account_id = a.id
          and s.snapshot_date = '2026-05-26'::date
 );

-- 확인용:
-- select a.category, a.label, a.account_number, s.snapshot_date, s.balance, a.currency
--   from cash_snapshots s join cash_accounts a on s.account_id = a.id
--  where s.snapshot_date = '2026-05-26'
--  order by a.category, a.sort_order;
