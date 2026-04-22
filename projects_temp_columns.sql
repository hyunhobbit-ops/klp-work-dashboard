-- 매입매출 > 견적 의뢰 (projects_temp) 스키마 보강
-- saveTempGroupEdit 이 update 할 때 사용하는 모든 컬럼을 idempotent 하게 추가합니다.
-- Supabase SQL Editor 에서 한 번 실행하세요. 이미 존재하는 컬럼은 건너뜁니다.

-- 공통
alter table public.projects_temp add column if not exists date            date;
alter table public.projects_temp add column if not exists client          text;
alter table public.projects_temp add column if not exists client_contact  text;
alter table public.projects_temp add column if not exists supplier        text;
alter table public.projects_temp add column if not exists supplier_contact text;
alter table public.projects_temp add column if not exists item            text;
alter table public.projects_temp add column if not exists qty             integer default 0;
alter table public.projects_temp add column if not exists revenue         bigint  default 0;
alter table public.projects_temp add column if not exists supplier_revenue bigint default 0;
alter table public.projects_temp add column if not exists quote_note      text;

-- 매출 단가
alter table public.projects_temp add column if not exists unit_price      bigint default 0;
alter table public.projects_temp add column if not exists unit_price_vat  text   default 'VAT 별도';

-- 매입 단가
alter table public.projects_temp add column if not exists supplier_unit_price     bigint default 0;
alter table public.projects_temp add column if not exists supplier_unit_price_vat text   default 'VAT 별도';

-- 매출 부대비용: 인쇄
alter table public.projects_temp add column if not exists print_method       text;
alter table public.projects_temp add column if not exists print_fee          bigint  default 0;
alter table public.projects_temp add column if not exists print_fee_apply    text    default '1개당';
alter table public.projects_temp add column if not exists print_fee_vat      text    default 'VAT 별도';

-- 매출 부대비용: 포장
alter table public.projects_temp add column if not exists pack_method        text;
alter table public.projects_temp add column if not exists packaging_fee      bigint  default 0;
alter table public.projects_temp add column if not exists packaging_fee_apply text   default '일괄';
alter table public.projects_temp add column if not exists packaging_fee_vat  text    default 'VAT 별도';

-- 매출 부대비용: 라벨
alter table public.projects_temp add column if not exists label_fee          bigint  default 0;
alter table public.projects_temp add column if not exists label_fee_apply    text    default '1개당';
alter table public.projects_temp add column if not exists label_fee_vat      text    default 'VAT 별도';

-- 매출 부대비용: 택배
alter table public.projects_temp add column if not exists shipping_boxes     integer default 0;
alter table public.projects_temp add column if not exists shipping_fee       bigint  default 0;
alter table public.projects_temp add column if not exists shipping_fee_vat   text    default 'VAT 별도';

-- 매입 부대비용: 인쇄
alter table public.projects_temp add column if not exists sup_print_method       text;
alter table public.projects_temp add column if not exists sup_print_fee          bigint  default 0;
alter table public.projects_temp add column if not exists sup_print_fee_apply    text    default '1개당';
alter table public.projects_temp add column if not exists sup_print_fee_vat      text    default 'VAT 별도';

-- 매입 부대비용: 포장
alter table public.projects_temp add column if not exists sup_pack_method        text;
alter table public.projects_temp add column if not exists sup_packaging_fee      bigint  default 0;
alter table public.projects_temp add column if not exists sup_packaging_fee_apply text   default '일괄';
alter table public.projects_temp add column if not exists sup_packaging_fee_vat  text    default 'VAT 별도';

-- 매입 부대비용: 라벨
alter table public.projects_temp add column if not exists sup_label_fee          bigint  default 0;
alter table public.projects_temp add column if not exists sup_label_fee_apply    text    default '1개당';
alter table public.projects_temp add column if not exists sup_label_fee_vat      text    default 'VAT 별도';

-- 매입 부대비용: 택배
alter table public.projects_temp add column if not exists sup_shipping_boxes     integer default 0;
alter table public.projects_temp add column if not exists sup_shipping_fee       bigint  default 0;
alter table public.projects_temp add column if not exists sup_shipping_fee_vat   text    default 'VAT 별도';

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
