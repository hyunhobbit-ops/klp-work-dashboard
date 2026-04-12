-- Supabase에서 실행: 프로젝트 진행사항 국내 테이블
CREATE TABLE IF NOT EXISTS projects_domestic (
  id BIGSERIAL PRIMARY KEY,
  client TEXT,
  contact_person TEXT,
  title TEXT,
  manager TEXT,
  product_name TEXT NOT NULL,
  quantity INTEGER,
  unit TEXT,
  unit_price BIGINT,
  unit_price_vat TEXT,
  color TEXT,
  print_color_size TEXT,
  print_method TEXT,
  print_fee BIGINT DEFAULT 0,
  print_fee_vat TEXT,
  print_fee_apply TEXT,
  packaging TEXT,
  packaging_fee BIGINT DEFAULT 0,
  packaging_fee_vat TEXT,
  packaging_fee_apply TEXT,
  delivery_date DATE,
  recipient TEXT,
  phone TEXT,
  address TEXT,
  revenue BIGINT DEFAULT 0,
  status TEXT DEFAULT '시작 전',
  priority TEXT DEFAULT '🟢 보통',
  category TEXT DEFAULT '국내 주문',
  assignees TEXT[] DEFAULT ARRAY[]::TEXT[],
  progress TEXT DEFAULT '0%',
  start_date DATE,
  checks JSONB DEFAULT '{"design":false,"workOrder":false,"advancePayment":false,"finalPayment":false,"invoice":false,"supplierPayment":false,"delivered":false}'::jsonb,
  memo TEXT,
  source_doc_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE projects_domestic ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all projects_domestic" ON projects_domestic;
CREATE POLICY "Allow all projects_domestic" ON projects_domestic
  FOR ALL USING (true) WITH CHECK (true);
