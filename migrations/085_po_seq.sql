-- 085: 해외 PO 번호(P.O. NO.) — 회사별로 1부터 연달아. 문서에는 'PO-0001' 로 표시
--  문서번호(doc_number)는 디자인확인서 연결에 쓰여서 그대로 두고, 번호만 따로 둔다. 지운 번호는 다시 쓰지 않음(카운터)
alter table public.confirmations add column if not exists po_seq integer;

create table if not exists public.po_counters (company_id bigint primary key, last_no integer not null default 0);
alter table public.po_counters enable row level security;   -- 정책 없음: 트리거 함수만 사용
revoke all on public.po_counters from anon, authenticated;

with n as (
  select id, row_number() over (partition by company_id order by created_at, id) rn
  from public.confirmations where status = '해외작업요청서'
)
update public.confirmations c set po_seq = n.rn from n where n.id = c.id and c.po_seq is null;

insert into public.po_counters (company_id, last_no)
select company_id, max(po_seq) from public.confirmations where po_seq is not null and company_id is not null group by company_id
on conflict (company_id) do update set last_no = greatest(po_counters.last_no, excluded.last_no);

create unique index if not exists confirmations_po_seq_uq on public.confirmations (company_id, po_seq) where po_seq is not null;

create or replace function public.confirmations_set_po_seq() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.po_seq := null; else new.po_seq := old.po_seq; end if;   -- 앱에서 바꾸지 못하게
  if new.status = '해외작업요청서' and new.po_seq is null and new.company_id is not null then
    insert into po_counters as k (company_id, last_no) values (new.company_id, 1)
    on conflict (company_id) do update set last_no = k.last_no + 1
    returning last_no into new.po_seq;
  end if;
  return new;
end $$;
revoke all on function public.confirmations_set_po_seq() from public, anon, authenticated;

drop trigger if exists trg_zz_po_seq on public.confirmations;   -- 이름순: trg_set_company_id 뒤
create trigger trg_zz_po_seq before insert or update on public.confirmations
  for each row execute function public.confirmations_set_po_seq();
notify pgrst, 'reload schema';
