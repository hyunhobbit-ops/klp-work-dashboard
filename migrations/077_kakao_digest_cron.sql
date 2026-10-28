-- 077: 카카오톡 정기 알림 예약 (pg_cron, DB 시간대 UTC) — 평일 08:30 · 13:00 · 17:00 KST
-- 맥미니 안에서 바로 엣지 함수 호출 (http://api-gw:8000), 비밀값은 app_config.kakao_send_secret
-- 함수도 한국 시간 주말이면 건너뜀
do $$
declare j record;
begin
  for j in select jobname from cron.job where jobname like 'kakao-digest-%' loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;
select cron.schedule('kakao-digest-am',   '30 23 * * 0-4', $c$select net.http_post(url := 'http://api-gw:8000/functions/v1/kakao', headers := jsonb_build_object('Content-Type','application/json','x-kakao-secret',(select value from app_config where key='kakao_send_secret')), body := '{"action":"digest","slot":"am"}'::jsonb, timeout_milliseconds := 60000)$c$);
select cron.schedule('kakao-digest-noon', '0 4 * * 1-5',   $c$select net.http_post(url := 'http://api-gw:8000/functions/v1/kakao', headers := jsonb_build_object('Content-Type','application/json','x-kakao-secret',(select value from app_config where key='kakao_send_secret')), body := '{"action":"digest","slot":"noon"}'::jsonb, timeout_milliseconds := 60000)$c$);
select cron.schedule('kakao-digest-pm',   '0 8 * * 1-5',   $c$select net.http_post(url := 'http://api-gw:8000/functions/v1/kakao', headers := jsonb_build_object('Content-Type','application/json','x-kakao-secret',(select value from app_config where key='kakao_send_secret')), body := '{"action":"digest","slot":"pm"}'::jsonb, timeout_milliseconds := 60000)$c$);
