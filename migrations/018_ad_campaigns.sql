-- AI 광고 제작 캠페인 저장 테이블
create table if not exists ad_campaigns (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  author text,
  product_id bigint,                 -- 상품 DB 참조(있을 때). FK 강제 안 함
  product_snapshot jsonb,            -- {name, price, imageUrl, points}
  settings jsonb,                    -- {goal, tone, target, emphasis}
  copy jsonb,                        -- 선택된 카피 {headline, sub, body, cta, hashtags, emailSubject, emailBody}
  bg_image text,                     -- 선택된 배경(base64 data URL 또는 URL)
  status text default '작성'
);
alter table ad_campaigns enable row level security;
drop policy if exists "ad_campaigns_auth_all" on ad_campaigns;
create policy "ad_campaigns_auth_all" on ad_campaigns
  for all to authenticated using (true) with check (true);
