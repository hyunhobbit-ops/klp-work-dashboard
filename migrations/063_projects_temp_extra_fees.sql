-- 063: 견적 품목별 '추가 비용' 목록 (배송 2가지 등 — 기본 인쇄·포장·라벨·택배 칸 외에 더 넣는 줄)
-- 한 줄 = { kind: 배송|포장|라벨|인쇄|기타, name, apply: 1개당|일괄|박스, boxes, fee, vat, supFee, supVat }
alter table public.projects_temp
  add column if not exists extra_fees jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
