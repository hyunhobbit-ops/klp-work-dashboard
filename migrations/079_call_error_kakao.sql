-- 통화 처리 실패(calls.status → 'error') 시 김현호 카톡 '나와의 채팅'으로 바로 알림
-- kakao 엣지 함수 notify 액션 사용 (x-kakao-secret = app_config.kakao_send_secret)
-- 로그인 만료처럼 통화마다 연달아 실패할 때 폭탄 알림이 안 가도록 3시간에 한 번만 보냄
-- (마지막 발송 시각: app_config.call_error_notified_at)

create or replace function calls_notify_error() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  last_at timestamptz;
  n_err int;
  reason text;
  msg text;
begin
  if new.status <> 'error' or (tg_op = 'UPDATE' and old.status = 'error') then
    return new;
  end if;
  select nullif(value, '')::timestamptz into last_at from app_config where key = 'call_error_notified_at';
  if last_at is not null and last_at > now() - interval '3 hours' then
    return new;
  end if;
  select count(*) into n_err from calls where company_id = new.company_id and status = 'error' and id <> new.id;
  reason := case
    when new.error ilike '%로그인%' then '맥미니 Claude 로그인이 풀렸어요. 터미널에서 claude auth login 해 주세요.'
    else left(regexp_replace(new.error, '\s+', ' ', 'g'), 90)
  end;
  msg := '⚠️ 통화 처리 실패 #' || new.id
      || coalesce(' (' || nullif(new.line_number, '') || ' ↔ ' || nullif(coalesce(nullif(new.client_name, ''), new.other_number), '') || ')', '')
      || E'\n' || reason
      || case when n_err > 0 then E'\n다른 실패 통화 ' || n_err || '건 있음' else '' end;
  insert into app_config(key, value) values ('call_error_notified_at', now()::text)
    on conflict (key) do update set value = excluded.value;
  perform net.http_post(
    url := 'http://api-gw:8000/functions/v1/kakao',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-kakao-secret', (select value from app_config where key = 'kakao_send_secret')),
    body := jsonb_build_object('action', 'notify',
                               'items', jsonb_build_array(jsonb_build_object(
                                 'name', '김현호', 'text', msg,
                                 'url', 'https://klp-work-dashboard.vercel.app/#calls'))),
    timeout_milliseconds := 30000);
  return new;
exception when others then
  return new;  -- 알림 실패가 통화 저장을 막지 않게
end $$;

drop trigger if exists trg_calls_notify_error on calls;
create trigger trg_calls_notify_error after insert or update of status on calls
  for each row execute function calls_notify_error();
