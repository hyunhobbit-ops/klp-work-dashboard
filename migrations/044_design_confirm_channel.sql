-- 044: 디자인확인서 컨펌 — 어느 채널로(카톡/이메일/문자/기타 직접 입력) 언제 컨펌받았는지
alter table projects_domestic add column if not exists design_confirm_channel text default '';
alter table projects_domestic add column if not exists design_confirm_date date;

-- 상담 타임라인 자동 기록에 컨펌 채널·날짜도 (038 함수 갱신)
create or replace function projects_domestic_inquiry_sync() returns trigger
language plpgsql set search_path = public as $$
declare k text; lbl text; o jsonb; nn jsonb; extra text;
begin
    if tg_op = 'DELETE' then
        perform inq_sync_stage(old.inquiry_id);
        return old;
    end if;
    if tg_op = 'UPDATE' and new.inquiry_id is not null and old.checks is distinct from new.checks then
        o := coalesce(old.checks, '{}'::jsonb); nn := coalesce(new.checks, '{}'::jsonb);
        for k in select jsonb_object_keys(nn) loop
            if nn->>k = 'true' and coalesce(o->>k, 'false') <> 'true' then
                lbl := case k when 'design' then '디자인확인서 컨펌' when 'workOrder' then '작업요청서 발송'
                              when 'advancePayment' then '선금 입금' when 'finalPayment' then '잔금 입금'
                              when 'invoice' then '계산서 발행' when 'supplierPayment' then '공급처 송금'
                              when 'delivered' then '납품 완료' else k end;
                extra := '';
                if k = 'design' and (coalesce(new.design_confirm_channel, '') <> '' or new.design_confirm_date is not null) then
                    extra := ' (' || concat_ws(' · ', nullif(new.design_confirm_channel, ''), to_char(new.design_confirm_date, 'FMMM/FMDD')) || ')';
                end if;
                insert into inquiry_logs (inquiry_id, direction, channel, body, images, author, company_id)
                values (new.inquiry_id, 'system', '', lbl || ' · ' || coalesce(nullif(new.product_name, ''), '국내 프로젝트') || extra, '[]'::jsonb, '', new.company_id);
            end if;
        end loop;
    end if;
    perform inq_sync_stage(new.inquiry_id);
    if tg_op = 'UPDATE' and old.inquiry_id is distinct from new.inquiry_id then
        perform inq_sync_stage(old.inquiry_id);
    end if;
    return new;
end $$;
