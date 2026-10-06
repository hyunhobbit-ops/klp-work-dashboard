-- 056: 상담 히스토리에 기록이 생기면(상태 변경·프로젝트 등록·할 일·발송 등 시스템 기록 포함) 상담 '최근 활동 시각'을 앞으로 당김
--  (예전엔 고객/우리 대화 기록 일부만 last_contact_at을 바꿔서, 상태를 바꿔도 목록에 '5일 전'으로 남고 아래에 깔려 있었음)
create or replace function public.inquiry_logs_touch_inquiry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
    update inquiries
       set last_contact_at = least(coalesce(new.at, now()), now())
     where id = new.inquiry_id
       and (last_contact_at is null or last_contact_at < least(coalesce(new.at, now()), now()));
    return new;
end $function$;

drop trigger if exists trg_inquiry_logs_touch_inquiry on inquiry_logs;
create trigger trg_inquiry_logs_touch_inquiry after insert on inquiry_logs
  for each row execute function inquiry_logs_touch_inquiry();

-- 기존 상담도 가장 최근 기록 시각으로 맞춤
update inquiries i set last_contact_at = x.mx
  from (select inquiry_id, max(least(at, now())) mx from inquiry_logs group by 1) x
 where x.inquiry_id = i.id and (i.last_contact_at is null or i.last_contact_at < x.mx);
