-- ============================================================
-- 중고마켓DB 테이블 스키마
-- Supabase SQL Editor에서 한 번만 실행
-- ============================================================

create table if not exists market_db (
    id bigserial primary key,
    category text not null check (category in ('watch','goods','misc')),
    name text not null,
    status text default '판매가능',
    price text default '',
    sale text default '',
    description text default '',
    parts text default '',
    qty text default '',
    location text default '',
    page_url text default '',
    image text default '',
    ceo_junggo boolean default false,
    ceo_bungae boolean default false,
    ceo_danggeun boolean default false,
    iyj_junggo boolean default false,
    iyj_bungae boolean default false,
    iyj_danggeun boolean default false,
    khh_junggo boolean default false,
    khh_bungae boolean default false,
    khh_danggeun boolean default false,
    nko_junggo boolean default false,
    nko_bungae boolean default false,
    sort_order integer default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists market_db_category_idx on market_db(category);
create index if not exists market_db_sort_idx on market_db(category, sort_order, id);

alter table market_db enable row level security;

drop policy if exists "market_db all ops" on market_db;
create policy "market_db all ops"
    on market_db for all
    to anon, authenticated
    using (true)
    with check (true);

-- updated_at 자동 갱신 트리거
create or replace function market_db_touch_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists market_db_updated_at on market_db;
create trigger market_db_updated_at
    before update on market_db
    for each row execute function market_db_touch_updated_at();

-- Realtime 활성화 (3명이 동시에 보면서 실시간 동기화)
alter publication supabase_realtime add table market_db;

-- ============================================================
-- 상품 이미지 Storage 버킷
-- ============================================================
insert into storage.buckets (id, name, public)
values ('market-db', 'market-db', true)
on conflict (id) do nothing;

drop policy if exists "market-db public read" on storage.objects;
create policy "market-db public read"
    on storage.objects for select
    to public
    using (bucket_id = 'market-db');

drop policy if exists "market-db anon write" on storage.objects;
create policy "market-db anon write"
    on storage.objects for insert
    to anon, authenticated
    with check (bucket_id = 'market-db');

drop policy if exists "market-db anon update" on storage.objects;
create policy "market-db anon update"
    on storage.objects for update
    to anon, authenticated
    using (bucket_id = 'market-db');

drop policy if exists "market-db anon delete" on storage.objects;
create policy "market-db anon delete"
    on storage.objects for delete
    to anon, authenticated
    using (bucket_id = 'market-db');


-- ============================================================
-- CSV 데이터 임포트 (94건)
-- ============================================================

-- 중고마켓DB CSV 임포트 (1/2/3/4 → 담당자 전체 체크)
-- Supabase SQL Editor에서 실행

begin;
truncate market_db restart identity;

insert into market_db (category, name, status, price, sale, description, parts, qty, location, page_url, image, ceo_junggo, ceo_bungae, ceo_danggeun, iyj_junggo, iyj_bungae, iyj_danggeun, khh_junggo, khh_bungae, khh_danggeun, nko_junggo, nko_bungae, sort_order) values
  ('watch', '호크마 회중시계', '판매가능', '5.9', '9', '프로젝트문 로보토미 코퍼레이션 호크마 회중시계', '회중시계/체인/품질보증서/캔/종이슬립', '', '창고', '', '', true, true, true, false, false, false, false, false, false, true, true, 0),
  ('watch', '전독시 회중시계', '판매가능', '0', '11', '와디즈 및 서점에서 펀딩했던 전독시 양장본에 포함된 구성품', '회중시계/체인/품질보증서/캔/종이슬립', '', '', 'https://www.wadiz.kr/web/campaign/detail/162105', '', true, true, true, true, true, true, false, false, false, false, false, 1),
  ('watch', '로오히 1주년 회중시계', '판매가능', '5.2', '3', '로드오브히어로즈 1주년 기념 굿즈', '회중시계/체인/품질보증서/박스/종이슬립/원형사진2종', '', '', 'https://tumblbug.com/klpkorea_x_lord', '', false, false, false, true, true, true, false, false, false, false, false, 2),
  ('watch', '로오히 3주년 탁상시계', '판매가능', '5.9', '3', '로드오브히어로즈 3주년 기념 굿즈', '탁상시계/품질보증서/박스/종이슬립/안경닦이', '', '', 'https://tumblbug.com/klpkorea_x_lord2', '', false, false, false, true, true, true, false, false, false, false, false, 3),
  ('watch', '쿠키런 나침반 회중시계', '판매가능', '5.9', '4', '', '회중시계/품질보증서/박스/종이슬립/안경닦이', '', '', 'https://showroom.co.kr/product/detail.html?product_no=35129&cate_no=135&display_group=1', '', false, false, false, true, true, true, true, true, true, false, false, 4),
  ('watch', '쿠키런킹덤 똑딱쿠키 시계탑', '판매가능', '18.9', '9', '와디즈에서 펀딩했던 쿠키런 킹덤 탁상시계', '', '200', '', 'https://showroom.co.kr/product/detail.html?product_no=35088&cate_no=135&display_group=1', '', false, false, false, true, true, true, true, true, true, false, false, 5),
  ('watch', '청와대 손목시게', '판매가능', '', '7', '', '', '100', '', '', '', true, true, true, false, false, false, false, false, false, false, false, 6),
  ('watch', '박정희 메탈 손목시계', '판매가능', '18', '10', '', '손목시계/박스/종이슬립', '200', '', '', '', true, true, true, true, true, true, false, false, false, false, false, 7),
  ('watch', '김구&윤봉길 회중시계', '판매가능', '90', '40', '광복회에서 vip 선물로 제공되었던 시계', '회중시계 2종/리플렛/박스/종이슬립', '60', '', '', '', true, true, true, false, false, false, false, false, false, false, false, 8),
  ('watch', '윤봉길 회중시계', '판매가능', '', '', '광복회에서 vip 선물로 제공되었던 시계', '윤봉길 회중시계 1개', '90', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 9),
  ('watch', '강철의 연금술사 회중시계 200AP', '판매가능', '9.8', '12', '초침 작동하는 엔틱 모델', '회중시계/체인2종/가죽지갑/안경닦이/품질보증서/캔', '', '', 'https://showroom.co.kr/product/detail.html?product_no=35123&cate_no=136&display_group=1', '', true, true, true, true, true, true, false, false, false, false, false, 10),
  ('watch', '강철의 연금술사 회중시계 200SP', '판매가능', '9.8', '12', '초침 작동하는 유광 모델', '회중시계/체인2종/가죽지갑/안경닦이/품질보증서/캔', '', '', '', '', false, false, false, false, false, false, true, true, true, false, false, 11),
  ('watch', '강철의 연금술사 회중시계 500AP', '판매가능', '', '16', '초침 작동하는 엔틱 모델', '회중시계/체인2종/가죽지갑/안경닦이/품질보증서/캔', '', '', 'https://www.showroom.co.kr/product/detail.html?product_no=9636&cate_no=136&display_group=1', '', true, true, true, false, false, false, false, false, false, false, false, 12),
  ('watch', '빈티지 앤틱 손목시계 1', '판매준비', '', '3', '정상작동', '시계 1개 ', '', '', '', '', false, false, false, true, true, true, false, false, false, true, true, 13),
  ('watch', '빈티지 앤틱 손목시계 2', '판매가능', '', '3', '정상작동', '', '', '', '', '', false, false, false, true, true, true, false, false, false, true, true, 14),
  ('watch', '빈티지 앤틱 손목시계 3', '판매가능', '', '3', '정상작동', '', '', '', '', '', false, false, false, true, true, true, false, false, false, true, true, 15),
  ('watch', '빈티지 앤틱 손목시계 4', '판매가능', '', '3', '정상작동', '', '', '', '', '', false, false, false, true, true, true, false, false, false, true, true, 16),
  ('watch', '빈티지 앤틱 손목시계 5', '판매가능', '', '3', '정상작동', '', '', '', '', '', false, false, false, true, true, true, false, false, false, true, true, 17),
  ('watch', '빈티지 앤틱 손목시계 6', '판매가능', '', '3', '정상작동', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 18),
  ('watch', '빈티지 앤틱 손목시계 7', '판매가능', '', '3', '정상작동', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 19),
  ('watch', '빈티지 앤틱 손목시계 8', '판매가능', '', '3', '정상작동', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 20),
  ('watch', '빈티지 앤틱 손목시계 9', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 21),
  ('watch', '빈티지 앤틱 손목시계 10', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 22),
  ('watch', '빈티지 앤틱 손목시계 11', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 23),
  ('watch', '빈티지 앤틱 손목시계 12', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 24),
  ('watch', '빈티지 앤틱 손목시계 13', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 25),
  ('watch', '빈티지 앤틱 손목시계 14', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 26),
  ('watch', '빈티지 앤틱 손목시계 15', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 27),
  ('watch', '빈티지 앤틱 손목시계 16', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 28),
  ('watch', '빈티지 앤틱 손목시계 17', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 29),
  ('watch', '빈티지 앤틱 손목시계 18', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, true, true, true, true, true, 30),
  ('watch', '빈티지 앤틱 손목시계 19', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 31),
  ('watch', '빈티지 앤틱 손목시계 20', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, true, true, true, true, true, 32),
  ('watch', '빈티지 앤틱 손목시계 21', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, true, true, true, true, true, 33),
  ('watch', '빈티지 앤틱 손목시계 22', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, true, true, true, true, true, 34),
  ('watch', '빈티지 앤틱 손목시계 23', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, true, true, true, true, true, 35),
  ('watch', '빈티지 에버랜드 회중시계', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 36),
  ('watch', '빈티지 포켓몬 회중시계', '판매가능', '', '3', '', '', '', '', '', '', false, false, false, false, false, false, true, true, true, false, false, 37),
  ('watch', '레노마 메탈 시계 RE300L_오토', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 38),
  ('watch', '레노마 가죭 시계 RE275L_브라운', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 39),
  ('watch', '레노마 메탈 시계 RE535L_실버', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 40),
  ('watch', '레노마 메탈 시계 RE255L_실버블랙', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 41),
  ('watch', '레노마 가죭 시계 RE2004M_브라운', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 42),
  ('watch', '레노마 메탈 시계 RE255M_블랙', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 43),
  ('watch', '레노마 가죭 시계 RE275M_브라운', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 44),
  ('watch', '레노마 메탈 시계 RE255M_실버블랙', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 45),
  ('watch', '레노마 가죭 시계 RE535M_브라운', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 46),
  ('watch', '레노마 가죭 시계 RE5450M_블랙', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 47),
  ('watch', '레노마 메탈 시계 RE255L_실버', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 48),
  ('watch', '레노마 가죭 시계 RE535M_블랙', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 49),
  ('watch', '레노마 가죭 시계 RE535L_블랙', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 50),
  ('watch', '레노마 메탈 시계 RE255M_실버', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 51),
  ('watch', '레노마 가죭 시계 RE2004L_브라운', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 52),
  ('watch', '레노마 메탈 시계 RE065_', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 53),
  ('watch', '레노마 가죭 시계 RE5035_블랙', '판매가능', '', '', '', '', '', '', '', '', false, false, false, false, false, false, false, false, false, false, false, 54),
  ('goods', '퇴마록 은장도', '판매가능', '9.8', '6-5', '퇴마록 공식 굿즈 월향 레터나이프
다른 구성품은 없고 월향 레터나이프와 박스만 있음', '레터나이프/박스', '', '', 'https://tumblbug.com/toemarok_cb', '', false, false, false, true, true, true, true, true, true, false, false, 0),
  ('goods', '화산귀환 백아 목베개(택 없는 새상품)', '판매가능', '3.9', '4-3', '택이 없어서 저렴하게 판매', '목베개+포스터', '10', '', 'https://m.showroom.co.kr/product/detail.html?product_no=35095', '', true, true, true, true, true, true, true, true, true, false, false, 1),
  ('goods', '망아살 더던 포토카드 5종', '판매가능', '0', '3', '5종 1세트 , 5종 다 있는지 확인하기', '포토카드 5종', '', '', 'https://tumblbug.com/the_dawn_official', '', true, true, true, false, false, false, false, false, false, false, false, 2),
  ('goods', '망아살 더던 스페셜 매거진 + 대형 접지 포스터', '판매가능', '2.9', '5', '매거진이랑 접지 포스터 같이 제공', '매거진/접지포스터', '', '', 'https://tumblbug.com/the_dawn_official', '', true, true, true, false, false, false, false, false, false, false, false, 3),
  ('goods', '망아살 더 던 키링 세트 5종', '판매가능', '3.8', '3', '아크릴 키링 5종 세트', '아크릴 키링 5종', '', '', 'https://tumblbug.com/the_dawn_official', '', false, false, false, false, false, false, false, false, false, false, false, 4),
  ('goods', '하츠네미쿠 인형', '판매가능', '4.8', '3', '하츠네미쿠 한국 공식 라이센스 20cm 인형', '인형, 품질보증서, 박스', '50', '', 'https://smartstore.naver.com/klpkorea/products/10439191152', '', false, false, false, true, true, true, true, true, true, false, false, 5),
  ('misc', '하츠네미쿠 린 수면안대', '판매가능', '1.6', '1.4', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10824165261', '', true, true, true, false, false, false, false, false, false, true, true, 0),
  ('misc', '하츠네미쿠 렌 수면안대', '판매가능', '1.6', '1.4', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10824165261', '', true, true, true, false, false, false, false, false, false, true, true, 1),
  ('misc', '하츠네미쿠 피아프로 캐릭터즈 코롯토 6종', '판매가능', '7.2', '5', '세트 구성으로 판매했을시', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10824321366', '', true, true, true, false, false, false, false, false, false, true, true, 2),
  ('misc', '하츠네미쿠 코롯토 - 미쿠', '판매가능', '1.2', '0.9', '', '본품', '2', '', 'https://smartstore.naver.com/cchoice/products/10824321366', '', true, true, true, false, false, false, false, false, false, true, true, 3),
  ('misc', '하츠네미쿠 코롯토 - 린', '판매가능', '1.2', '0.9', '', '본품', '2', '', 'https://smartstore.naver.com/cchoice/products/10824321366', '', true, true, true, false, false, false, false, false, false, true, true, 4),
  ('misc', '하츠네미쿠 코롯토 - 렌', '판매가능', '1.2', '0.9', '', '본품', '2', '', 'https://smartstore.naver.com/cchoice/products/10824321366', '', false, false, false, true, true, true, false, false, false, true, true, 5),
  ('misc', '하츠네미쿠 코롯토 - 루카', '판매가능', '1.2', '0.9', '', '본품', '2', '', 'https://smartstore.naver.com/cchoice/products/10824321366', '', false, false, false, true, true, true, false, false, false, true, true, 6),
  ('misc', '하츠네미쿠 코롯토 - 메이코', '판매가능', '1.2', '0.9', '', '본품', '2', '', 'https://smartstore.naver.com/cchoice/products/10824321366', '', false, false, false, true, true, true, false, false, false, true, true, 7),
  ('misc', '하츠네미쿠 코롯토 - 카이토', '품절', '1.2', '0.9', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10824321366', '', false, false, false, true, true, true, false, false, false, false, false, 8),
  ('misc', '하츠네미쿠 피아프로 캐릭터즈 아크릴 디오라마 5종', '판매가능', '7.5', '5.5', '세트 구성으로 판매했을시', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10824249235', '', false, false, false, true, true, true, false, false, false, false, false, 9),
  ('misc', '하츠네미쿠 아크릴 디오라마 - 미쿠', '판매가능', '1.5', '1.2', '', '본품', '2', '', 'https://smartstore.naver.com/cchoice/products/10824249235', '', false, false, false, false, false, false, true, true, true, true, true, 10),
  ('misc', '하츠네미쿠 아크릴 디오라마 - 린&렌', '판매가능', '1.5', '1.2', '', '본품', '2', '', 'https://smartstore.naver.com/cchoice/products/10824249235', '', false, false, false, false, false, false, true, true, true, true, true, 11),
  ('misc', '하츠네미쿠 아크릴 디오라마 - 루카', '판매가능', '1.5', '1.2', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10824249235', '', false, false, false, false, false, false, true, true, true, true, true, 12),
  ('misc', '하츠네미쿠 아크릴 디오라마 - 메이코', '판매가능', '1.5', '1.2', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10824249235', '', false, false, false, false, false, false, true, true, true, true, true, 13),
  ('misc', '하츠네미쿠 아크릴 디오라마 - 카이토', '판매가능', '1.5', '1.2', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10824249235', '', false, false, false, false, false, false, true, true, true, true, true, 14),
  ('misc', '하츠네미쿠 아크릴 스탠드 - 메이코', '판매가능', '1.5', '1.2', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10824286264', '', false, false, false, true, true, true, false, false, false, true, true, 15),
  ('misc', '하츠네미쿠 아크릴 스탠드 - 루카', '판매가능', '1.5', '1.2', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10824286264', '', false, false, false, true, true, true, false, false, false, true, true, 16),
  ('misc', '나 혼자만 레벨업(나혼렙) 마그넷  세트 6종', '판매가능', '7.2', '5', '세트 구성으로 판매했을시', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10603237024', '', false, false, false, true, true, true, false, false, false, false, false, 17),
  ('misc', '나 혼자만 레벨업(나혼렙) 마그넷 세트 - 성진우 vol.1', '판매가능', '1.2', '0.9', '', '본품', '2', '', 'https://smartstore.naver.com/cchoice/products/10603237024', '', false, false, false, false, false, false, true, true, true, true, true, 18),
  ('misc', '나 혼자만 레벨업(나혼렙) 마그넷 세트 - 성진우 vol.2', '판매가능', '1.2', '0.9', '', '본품', '2', '', 'https://smartstore.naver.com/cchoice/products/10603237024', '', false, false, false, false, false, false, true, true, true, true, true, 19),
  ('misc', '나 혼자만 레벨업(나혼렙) 마그넷 세트 - 성진우 vol.3', '판매가능', '1.2', '0.9', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10603237024', '', false, false, false, false, false, false, true, true, true, true, true, 20),
  ('misc', '나 혼자만 레벨업(나혼렙) 마그넷 세트 - 차해인', '판매가능', '1.2', '0.9', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10603237024', '', false, false, false, false, false, false, true, true, true, true, true, 21),
  ('misc', '나 혼자만 레벨업(나혼렙) 마그넷 세트 - 유진호', '판매가능', '1.2', '0.9', '', '본품', '2', '', 'https://smartstore.naver.com/cchoice/products/10603237024', '', false, false, false, false, false, false, true, true, true, true, true, 22),
  ('misc', '나 혼자만 레벨업(나혼렙) 마그넷 세트 - 최종인', '판매가능', '1.2', '0.9', '', '본품', '2', '', 'https://smartstore.naver.com/cchoice/products/10603237024', '', false, false, false, false, false, false, true, true, true, true, true, 23),
  ('misc', '나 혼자만 레벨업(나혼렙) 아크릴 무드등', '판매가능', '3.2', '2.5', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/10681020289', '', false, false, false, false, false, false, true, true, true, true, true, 24),
  ('misc', '악역의 엔딩은 죽음뿐 아크릴 무드등', '판매가능', '2.9', '2.5', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/11102578230', '', false, false, false, true, true, true, false, false, false, true, true, 25),
  ('misc', '녹음의 관 금속 배치 2종 세트', '판매가능', '2.56', '2', '2종 일괄 판매 ', '뱃지 2개', '1', '', 'https://smartstore.naver.com/cchoice/products/9380707585', '', false, false, false, true, true, true, false, false, false, false, false, 26),
  ('misc', '그녀가 공작저로 가야 했던 사정 금속 배치 2종 세트', '판매가능', '2.56', '2', '2종 일괄판매', '뱃지 2개', '1', '', 'https://smartstore.naver.com/cchoice/products/9205888451', '', true, true, true, false, false, false, false, false, false, false, false, 27),
  ('misc', '악당의 아빠를 꼬셔라 금속배지 십자가', '판매가능', '1.28', '1', '', '뱃지 1개', '1', '', 'https://smartstore.naver.com/cchoice/products/9380679825', '', true, true, true, false, false, false, false, false, false, false, false, 28),
  ('misc', '악당의 아빠를 꼬셔라 금속 책갈피', '판매가능', '0.38', '0.25', '', '본품', '1', '', 'https://smartstore.naver.com/cchoice/products/9428692493', '', true, true, true, false, false, false, false, false, false, false, false, 29),
  ('misc', '랜드스케이프 서울대 각인', '판매가능', '', '3', '', '', '4', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 30),
  ('misc', '랜드스케이프 무지', '판매가능', '', '3', '', '', '57', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 31),
  ('misc', '파카 조터 50주년 볼펜', '판매가능', '', '3', '', '', '31', '', '', '', false, false, false, false, false, false, false, false, false, true, true, 32);

commit;

-- 총 94개 행 삽입
