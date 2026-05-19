# Phase 1 보안 이전 (Supabase Auth + RLS 잠금) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codex 보안 리뷰 Critical 3건(인증 우회 / 평문 비밀번호 / RLS 전체공개)을 해결한다. 클라이언트 localStorage 인증을 Supabase Auth로 이전하고, 18개 테이블 + Storage 버킷의 RLS를 `authenticated` 권한으로 잠근다. 5명 직원 로그인 UX는 변경 없음.

**Architecture:** `migrations/` 디렉토리에 번호 매긴 SQL 파일 7개를 순서대로 적용. `profiles`에 `email`/`auth_user_id` 컬럼 추가 후 Supabase Auth로 5명 계정 등록(4명 신규 + 김현호 기존 재활용). `app.js`의 `checkAuth`/`handleLogin`/`handleLogout` 함수를 Supabase Auth API로 교체하고 세션 만료 리스너를 신규 추가. proposal-view.html, doc-generator.html은 코드 변경 없음.

**Tech Stack:** Vanilla JS, Supabase Auth (signInWithPassword), Supabase JS client v2, PostgreSQL RLS, Vercel deploy

**Test 환경:** 자동 테스트 프레임워크 없음. SQL 단계는 검증 쿼리로, app.js 단계는 브라우저 수동 시나리오로 검증.

**스펙 참조:** `docs/superpowers/specs/2026-05-19-phase1-auth-rls-design.md` (commit `c3e46d9`)

---

## File Structure

| 파일 | 변경 내용 |
|------|----------|
| `migrations/README.md` | 실행 순서·게이트 문서 (NEW) |
| `migrations/001_profiles_add_auth_columns.sql` | `email`, `auth_user_id` 컬럼 추가 (NEW) |
| `migrations/002_profiles_seed_emails.sql` | 5명 email UPDATE (NEW) |
| `migrations/003_link_auth_users.sql` | `auth_user_id` 연결 (NEW, 대시보드 수동 후 실행) |
| `migrations/004_lock_rls_internal_tables.sql` | 16개 내부 테이블 RLS 잠금 (NEW) |
| `migrations/005_lock_rls_public_proposals.sql` | proposals, products RLS (anon SELECT 허용) (NEW) |
| `migrations/006_lock_storage_marketdb.sql` | Storage market-db 버킷 정책 (NEW) |
| `migrations/007_drop_profiles_password.sql` | 평문 password 컬럼 제거 (NEW, 며칠 후 실행) |
| `app.js:43-58` | `checkAuth()` 함수 교체 |
| `app.js:79-120` | `handleLogin()` 함수 교체 |
| `app.js:122-126` | `handleLogout()` 함수 교체 |
| `app.js` (init부) | `sb.auth.onAuthStateChange` 리스너 신규 추가 |

`migrations/` 디렉토리는 새로 생성. 기존 `*.sql` 파일들(테이블 스키마)은 그대로 유지. CLAUDE.md의 "단일 파일 구조 유지"는 `app.js`에 한정되며 SQL 마이그레이션은 순서가 있어 별도 디렉토리가 적절하다.

---

## Phase A — SQL 마이그레이션 작성

### Task 1: migrations/ 디렉토리 + README 작성

**Files:**
- Create: `migrations/README.md`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p migrations
```

- [ ] **Step 2: README.md 작성**

`migrations/README.md`:
```markdown
# KLP Dashboard Migrations

## Phase 1 — Supabase Auth + RLS 잠금 (2026-05-19)

스펙: `docs/superpowers/specs/2026-05-19-phase1-auth-rls-design.md`

### 실행 순서 (Supabase SQL Editor에서 위에서 아래로)

| 파일 | 실행 시점 | 게이트 |
|------|----------|--------|
| 001_profiles_add_auth_columns.sql | 즉시 | Gate 1 |
| 002_profiles_seed_emails.sql | 001 직후 | Gate 1 |
| (수동) Supabase Dashboard에서 4명 계정 추가 + 김현호 UUID 확인 | — | — |
| 003_link_auth_users.sql | 수동 작업 후 | Gate 2 |
| 004_lock_rls_internal_tables.sql | 003 직후 | Gate 3 |
| 005_lock_rls_public_proposals.sql | 004 직후 | Gate 3 |
| 006_lock_storage_marketdb.sql | 005 직후 | Gate 4 |
| (app.js 배포) | 006 직후 | Gate 5 |
| 007_drop_profiles_password.sql | **3~7일 정상 운영 확인 후** | Gate 6 |

### 게이트 검증 쿼리

각 파일 상단의 `-- VERIFICATION` 섹션 참조.

### 롤백

각 파일 하단의 `-- ROLLBACK` 섹션 참조.

### Step 7만 며칠 분리하는 이유

password 컬럼을 떨어뜨리면 평문 비번이 영구 소멸한다. Gate 5(코드 배포 후 5명 로그인 정상)
가 통과해도, 며칠 운영하며 진짜 이슈 없음을 확인한 후 실행.
```

- [ ] **Step 3: 커밋**

```bash
git add migrations/README.md
git commit -m "migrations/ 디렉토리 + Phase 1 실행 가이드 추가"
```

---

### Task 2: 001 — profiles 컬럼 추가

**Files:**
- Create: `migrations/001_profiles_add_auth_columns.sql`

- [ ] **Step 1: SQL 파일 작성**

`migrations/001_profiles_add_auth_columns.sql`:
```sql
-- ==========================================
-- 001 — profiles에 Supabase Auth 연동 컬럼 추가
-- 게이트: Gate 1
-- 영향: 앱 동작 변화 없음 (신규 컬럼만 추가)
-- ==========================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- VERIFICATION ------------------------------
-- 다음 쿼리가 5행 모두 email/auth_user_id 컬럼 NULL을 반환해야 함:
-- SELECT name, email, auth_user_id FROM profiles ORDER BY name;

-- ROLLBACK ----------------------------------
-- ALTER TABLE profiles DROP COLUMN email, DROP COLUMN auth_user_id;
```

- [ ] **Step 2: 커밋**

```bash
git add migrations/001_profiles_add_auth_columns.sql
git commit -m "001 마이그레이션 — profiles에 email, auth_user_id 컬럼 추가"
```

---

### Task 3: 002 — 5명 email 채움

**Files:**
- Create: `migrations/002_profiles_seed_emails.sql`

- [ ] **Step 1: SQL 파일 작성**

`migrations/002_profiles_seed_emails.sql`:
```sql
-- ==========================================
-- 002 — 5명 직원에 synthetic email 매핑
-- 게이트: Gate 1
-- 영향: 앱 동작 변화 없음
-- 주의: 김현호는 실제 이메일 (기존 Supabase Auth 계정 재활용)
-- ==========================================

UPDATE profiles SET email = 'leehyunju@klp.local'    WHERE name = '이현주';
UPDATE profiles SET email = 'hyunhobbit@naver.com'   WHERE name = '김현호';
UPDATE profiles SET email = 'yujieun@klp.local'      WHERE name = '유지은';
UPDATE profiles SET email = 'kujungdoo@klp.local'    WHERE name = '구정두';
UPDATE profiles SET email = 'kimkwantaek@klp.local'  WHERE name = '김관택';

-- VERIFICATION ------------------------------
-- 다음 쿼리 결과: 5행, email IS NULL인 행이 0개여야 함
-- SELECT name, email FROM profiles ORDER BY name;
-- SELECT COUNT(*) FROM profiles WHERE email IS NULL;  -- expect 0

-- ROLLBACK ----------------------------------
-- UPDATE profiles SET email = NULL WHERE name IN ('이현주','김현호','유지은','구정두','김관택');
```

- [ ] **Step 2: 커밋**

```bash
git add migrations/002_profiles_seed_emails.sql
git commit -m "002 마이그레이션 — 5명 직원 synthetic email 매핑"
```

---

### Task 4: 003 — auth.users 연결

**Files:**
- Create: `migrations/003_link_auth_users.sql`

- [ ] **Step 1: SQL 파일 작성**

`migrations/003_link_auth_users.sql`:
```sql
-- ==========================================
-- 003 — profiles.auth_user_id ← auth.users.id 연결
-- 게이트: Gate 2
-- 전제: 사장님이 Supabase Dashboard에서 4명 추가 완료
--       (김현호는 기존 hyunhobbit@naver.com 계정 그대로 재활용)
-- 영향: 앱 동작 변화 없음 (아직 app.js 안 바뀜)
-- ==========================================

UPDATE profiles p
   SET auth_user_id = u.id
  FROM auth.users u
 WHERE u.email = p.email
   AND p.auth_user_id IS NULL;

-- VERIFICATION ------------------------------
-- 다음 쿼리 결과: 5행, auth_user_id IS NULL이 0행이어야 함
-- SELECT name, email, auth_user_id FROM profiles ORDER BY name;
-- SELECT COUNT(*) FROM profiles WHERE auth_user_id IS NULL;  -- expect 0
--
-- auth.users에 실제로 5명 다 있는지:
-- SELECT u.email, p.name FROM auth.users u
-- LEFT JOIN profiles p ON p.auth_user_id = u.id
-- WHERE u.email IN (SELECT email FROM profiles);
-- expect: 5 rows, all p.name not null

-- ROLLBACK ----------------------------------
-- UPDATE profiles SET auth_user_id = NULL;
```

- [ ] **Step 2: 커밋**

```bash
git add migrations/003_link_auth_users.sql
git commit -m "003 마이그레이션 — profiles.auth_user_id ↔ auth.users.id 연결"
```

---

### Task 5: 004 — 내부 16개 테이블 RLS 잠금

**Files:**
- Create: `migrations/004_lock_rls_internal_tables.sql`

- [ ] **Step 1: SQL 파일 작성**

`migrations/004_lock_rls_internal_tables.sql`:
```sql
-- ==========================================
-- 004 — 내부 16개 테이블 RLS 잠금 (authenticated 한정)
-- 게이트: Gate 3
-- 영향: anon이 내부 데이터 접근 불가. 인증된 사용자만 R/W/D.
-- ==========================================

-- ===== profiles =====
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_auth_all ON profiles;
CREATE POLICY profiles_auth_all ON profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== projects_domestic =====
ALTER TABLE projects_domestic ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all projects_domestic" ON projects_domestic;
DROP POLICY IF EXISTS projects_domestic_auth_all ON projects_domestic;
CREATE POLICY projects_domestic_auth_all ON projects_domestic
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== clients_overseas =====
ALTER TABLE clients_overseas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_overseas_all ON clients_overseas;
DROP POLICY IF EXISTS clients_overseas_auth_all ON clients_overseas;
CREATE POLICY clients_overseas_auth_all ON clients_overseas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== clients =====
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_auth_all ON clients;
CREATE POLICY clients_auth_all ON clients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== quotes =====
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotes_select_all ON quotes;
DROP POLICY IF EXISTS quotes_insert_all ON quotes;
DROP POLICY IF EXISTS quotes_update_all ON quotes;
DROP POLICY IF EXISTS quotes_delete_all ON quotes;
DROP POLICY IF EXISTS quotes_auth_all ON quotes;
CREATE POLICY quotes_auth_all ON quotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== url_shortcuts =====
ALTER TABLE url_shortcuts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS url_shortcuts_select_all ON url_shortcuts;
DROP POLICY IF EXISTS url_shortcuts_insert_all ON url_shortcuts;
DROP POLICY IF EXISTS url_shortcuts_update_all ON url_shortcuts;
DROP POLICY IF EXISTS url_shortcuts_delete_all ON url_shortcuts;
DROP POLICY IF EXISTS url_shortcuts_auth_all ON url_shortcuts;
CREATE POLICY url_shortcuts_auth_all ON url_shortcuts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== margin_simulations =====
ALTER TABLE margin_simulations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS margin_simulations_select_all ON margin_simulations;
DROP POLICY IF EXISTS margin_simulations_insert_all ON margin_simulations;
DROP POLICY IF EXISTS margin_simulations_update_all ON margin_simulations;
DROP POLICY IF EXISTS margin_simulations_delete_all ON margin_simulations;
DROP POLICY IF EXISTS margin_simulations_auth_all ON margin_simulations;
CREATE POLICY margin_simulations_auth_all ON margin_simulations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== marketing_campaigns =====
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_campaigns_all ON marketing_campaigns;
DROP POLICY IF EXISTS marketing_campaigns_auth_all ON marketing_campaigns;
CREATE POLICY marketing_campaigns_auth_all ON marketing_campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== market_db =====
ALTER TABLE market_db ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "market_db all ops" ON market_db;
DROP POLICY IF EXISTS market_db_auth_all ON market_db;
CREATE POLICY market_db_auth_all ON market_db
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== product_categories =====
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_categories_all ON product_categories;
DROP POLICY IF EXISTS product_categories_auth_all ON product_categories;
CREATE POLICY product_categories_auth_all ON product_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== confirmations =====
ALTER TABLE confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS confirmations_auth_all ON confirmations;
CREATE POLICY confirmations_auth_all ON confirmations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== daily_tasks =====
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_tasks_auth_all ON daily_tasks;
CREATE POLICY daily_tasks_auth_all ON daily_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== deliveries =====
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deliveries_auth_all ON deliveries;
CREATE POLICY deliveries_auth_all ON deliveries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== projects_temp =====
ALTER TABLE projects_temp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_temp_auth_all ON projects_temp;
CREATE POLICY projects_temp_auth_all ON projects_temp
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== planning_projects =====
ALTER TABLE planning_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS planning_projects_auth_all ON planning_projects;
CREATE POLICY planning_projects_auth_all ON planning_projects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== planning_posts =====
ALTER TABLE planning_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS planning_posts_auth_all ON planning_posts;
CREATE POLICY planning_posts_auth_all ON planning_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- VERIFICATION ------------------------------
-- 1) RLS가 16개 테이블 모두 켜져있는지:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('profiles','projects_domestic','clients_overseas','clients','quotes',
--                     'url_shortcuts','margin_simulations','marketing_campaigns','market_db',
--                     'product_categories','confirmations','daily_tasks','deliveries',
--                     'projects_temp','planning_projects','planning_posts');
-- expect: 16 rows, rowsecurity = true 전부
--
-- 2) anon 권한으로 (대시보드 SQL Editor의 Run as → anon) 다음 시도가 거부되어야 함:
-- SELECT * FROM projects_domestic LIMIT 1;  -- expect: empty (RLS 차단)
-- INSERT INTO daily_tasks (id) VALUES (gen_random_uuid()); -- expect: permission denied

-- ROLLBACK ----------------------------------
-- 응급 시: 아래를 각 테이블에 실행하면 즉시 anon에게도 다시 열림 (단, 보안 손상)
-- DROP POLICY IF EXISTS <table>_auth_all ON <table>;
-- CREATE POLICY <table>_emergency_open ON <table> FOR ALL TO public USING (true) WITH CHECK (true);
```

- [ ] **Step 2: 커밋**

```bash
git add migrations/004_lock_rls_internal_tables.sql
git commit -m "004 마이그레이션 — 내부 16개 테이블 RLS authenticated 한정 잠금"
```

---

### Task 6: 005 — proposals, products RLS (anon SELECT 허용)

**Files:**
- Create: `migrations/005_lock_rls_public_proposals.sql`

- [ ] **Step 1: SQL 파일 작성**

`migrations/005_lock_rls_public_proposals.sql`:
```sql
-- ==========================================
-- 005 — proposals, products RLS (공개 SELECT 허용)
-- 게이트: Gate 3
-- 영향: 거래처 공유 링크 proposal-view.html 동작 유지.
--       anon은 SELECT만 가능, INSERT/UPDATE/DELETE는 차단.
-- ==========================================

-- ===== proposals =====
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proposals_all ON proposals;
DROP POLICY IF EXISTS proposals_anon_read ON proposals;
DROP POLICY IF EXISTS proposals_auth_all ON proposals;

CREATE POLICY proposals_anon_read ON proposals
  FOR SELECT TO anon USING (true);

CREATE POLICY proposals_auth_all ON proposals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== products =====
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_all ON products;
DROP POLICY IF EXISTS products_anon_read ON products;
DROP POLICY IF EXISTS products_auth_all ON products;

CREATE POLICY products_anon_read ON products
  FOR SELECT TO anon USING (true);

CREATE POLICY products_auth_all ON products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- VERIFICATION ------------------------------
-- anon 권한으로:
-- SELECT id FROM proposals LIMIT 1;  -- expect: succeeds (or empty if no data)
-- SELECT id FROM products LIMIT 1;   -- expect: succeeds
-- INSERT INTO proposals (id) VALUES ('hack-test');  -- expect: permission denied
-- DELETE FROM products;              -- expect: permission denied

-- ROLLBACK ----------------------------------
-- DROP POLICY proposals_anon_read ON proposals;
-- DROP POLICY proposals_auth_all ON proposals;
-- CREATE POLICY proposals_all ON proposals FOR ALL USING (true) WITH CHECK (true);
-- (products도 동일 패턴)
```

- [ ] **Step 2: 커밋**

```bash
git add migrations/005_lock_rls_public_proposals.sql
git commit -m "005 마이그레이션 — proposals, products RLS (anon SELECT만 허용)"
```

---

### Task 7: 006 — Storage market-db 버킷 잠금

**Files:**
- Create: `migrations/006_lock_storage_marketdb.sql`

- [ ] **Step 1: SQL 파일 작성**

`migrations/006_lock_storage_marketdb.sql`:
```sql
-- ==========================================
-- 006 — Storage market-db 버킷 쓰기 권한 잠금
-- 게이트: Gate 4
-- 영향: anon은 더 이상 업로드/수정/삭제 불가. READ는 그대로 public.
-- ==========================================

-- 기존 anon 쓰기 정책 제거
DROP POLICY IF EXISTS "market-db anon write"  ON storage.objects;
DROP POLICY IF EXISTS "market-db anon update" ON storage.objects;
DROP POLICY IF EXISTS "market-db anon delete" ON storage.objects;
DROP POLICY IF EXISTS "market-db auth write"  ON storage.objects;
DROP POLICY IF EXISTS "market-db auth update" ON storage.objects;
DROP POLICY IF EXISTS "market-db auth delete" ON storage.objects;

-- authenticated만 쓰기 가능
CREATE POLICY "market-db auth write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'market-db');

CREATE POLICY "market-db auth update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'market-db');

CREATE POLICY "market-db auth delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'market-db');

-- READ public 정책은 그대로 유지 (이미지 노출 필요)
-- "market-db public read" 정책은 손대지 않음

-- VERIFICATION ------------------------------
-- 1) anon으로 업로드 시도 → permission denied 떨어져야 함
--    (브라우저에서 비로그인 상태로 sb.storage.from('market-db').upload(...) 호출)
-- 2) 기존 이미지 public URL은 그대로 보여야 함
--    (https://vtulmuxkriklpiibiues.supabase.co/storage/v1/object/public/market-db/<path>)

-- ROLLBACK ----------------------------------
-- DROP POLICY "market-db auth write" ON storage.objects;
-- DROP POLICY "market-db auth update" ON storage.objects;
-- DROP POLICY "market-db auth delete" ON storage.objects;
-- CREATE POLICY "market-db anon write" ON storage.objects
--   FOR INSERT TO anon WITH CHECK (bucket_id = 'market-db');
-- (update, delete 동일 패턴)
```

- [ ] **Step 2: 커밋**

```bash
git add migrations/006_lock_storage_marketdb.sql
git commit -m "006 마이그레이션 — Storage market-db 버킷 쓰기 authenticated 한정"
```

---

### Task 8: 007 — password 컬럼 영구 제거 (며칠 후 실행용)

**Files:**
- Create: `migrations/007_drop_profiles_password.sql`

- [ ] **Step 1: SQL 파일 작성**

`migrations/007_drop_profiles_password.sql`:
```sql
-- ==========================================
-- 007 — profiles.password 평문 컬럼 영구 제거
-- 게이트: Gate 6
-- 전제: Gate 5 통과(코드 배포 후 5명 로그인 OK) + 3~7일 정상 운영 확인
-- 영향: 평문 비번 영구 소멸. 롤백 불가 (Gate 0 CSV 백업으로 수동 복원만 가능).
-- ==========================================

-- 실행 전 마지막 확인:
-- SELECT name, email, auth_user_id FROM profiles WHERE auth_user_id IS NULL;
-- → 위가 0행이어야만 실행할 것 (한 명이라도 NULL이면 로그인 불가능)

ALTER TABLE profiles DROP COLUMN IF EXISTS password;

-- VERIFICATION ------------------------------
-- password 컬럼이 사라졌는지:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'profiles';
-- expect: password 없음

-- ROLLBACK ----------------------------------
-- ALTER TABLE profiles ADD COLUMN password TEXT;
-- 그 후 Gate 0 백업 CSV로 직접 UPDATE
```

- [ ] **Step 2: 커밋**

```bash
git add migrations/007_drop_profiles_password.sql
git commit -m "007 마이그레이션 — profiles.password 컬럼 제거 (며칠 후 실행)"
```

---

## Phase B — app.js 코드 변경

### Task 9: `handleLogin()` 함수 교체

**Files:**
- Modify: `app.js:79-120`

- [ ] **Step 1: 기존 함수 정확 위치 확인**

```bash
grep -n "async function handleLogin" app.js
# expect: 79:async function handleLogin() {
```

- [ ] **Step 2: 함수 본문 교체**

`app.js`의 line 79~120 `async function handleLogin()` 전체를 다음으로 교체:

```javascript
async function handleLogin() {
    const name = document.getElementById('loginName').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');

    if (!name || !password) {
        errorEl.textContent = '이름과 비밀번호를 입력해주세요';
        return;
    }

    btn.disabled = true;
    btn.textContent = '로그인 중...';
    errorEl.textContent = '';

    // 1) name → email 매핑 조회
    const { data: prof, error: profErr } = await sb
        .from('profiles')
        .select('id, name, role, email, auth_user_id')
        .eq('name', name)
        .single();

    if (profErr || !prof || !prof.email) {
        console.error('Login profile lookup error:', profErr);
        errorEl.textContent = '등록되지 않은 이름입니다';
        btn.disabled = false;
        btn.textContent = '로그인';
        return;
    }

    // 2) Supabase Auth 정식 로그인
    const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
        email: prof.email,
        password: password,
    });

    if (authErr) {
        console.error('Auth signIn error:', authErr);
        if (authErr.message && authErr.message.toLowerCase().includes('invalid login credentials')) {
            errorEl.textContent = '비밀번호가 올바르지 않습니다';
        } else if (authErr.message && authErr.message.toLowerCase().includes('email not confirmed')) {
            errorEl.textContent = '계정이 활성화되지 않았습니다 (관리자 문의)';
        } else {
            errorEl.textContent = `로그인 오류: ${authErr.message}`;
        }
        btn.disabled = false;
        btn.textContent = '로그인';
        return;
    }

    // 3) currentUser 구성 (기존 구조 호환)
    const displayName = DISPLAY_NAME_MAP[prof.name] || prof.name;
    currentUser = {
        id: prof.id,
        name: displayName,
        loginName: prof.name,
        role: prof.role,
        email: prof.email,
        authUserId: authData.user.id,
    };
    localStorage.setItem('klp_user', JSON.stringify(currentUser));
    updateSidebarUser();
    showApp();
}
```

- [ ] **Step 3: 문법 점검**

```bash
node --check app.js
# expect: no output (no syntax errors)
```

- [ ] **Step 4: 커밋**

```bash
git add app.js
git commit -m "app.js: handleLogin을 Supabase Auth signInWithPassword 흐름으로 교체"
```

---

### Task 10: `checkAuth()` 함수 교체

**Files:**
- Modify: `app.js:43-58`

- [ ] **Step 1: 기존 함수 정확 위치 확인**

```bash
grep -n "async function checkAuth" app.js
# expect: 43:async function checkAuth() {
```

- [ ] **Step 2: 함수 본문 교체**

`app.js`의 `async function checkAuth()` 전체를 다음으로 교체:

```javascript
async function checkAuth() {
    // 1) Supabase 정식 세션 확인 (localStorage는 보조 캐시일 뿐)
    const { data: { session }, error: sessErr } = await sb.auth.getSession();
    if (sessErr) {
        console.error('getSession error:', sessErr);
        showLogin();
        return;
    }
    if (!session) {
        showLogin();
        return;
    }

    // 2) profiles에서 최신 정보 가져옴 (auth_user_id로 매칭)
    const { data: prof, error: profErr } = await sb
        .from('profiles')
        .select('id, name, role, email, auth_user_id')
        .eq('auth_user_id', session.user.id)
        .single();

    if (profErr || !prof) {
        // 세션은 있는데 profiles에 매핑이 없음 → 비정상, 강제 로그아웃
        console.error('Session valid but no profile match:', profErr);
        await sb.auth.signOut();
        localStorage.removeItem('klp_user');
        showLogin();
        return;
    }

    // 3) currentUser 구성 (DISPLAY_NAME_MAP 적용)
    const displayName = DISPLAY_NAME_MAP[prof.name] || prof.name;
    currentUser = {
        id: prof.id,
        name: displayName,
        loginName: prof.name,
        role: prof.role,
        email: prof.email,
        authUserId: prof.auth_user_id,
    };
    localStorage.setItem('klp_user', JSON.stringify(currentUser));
    updateSidebarUser();
    showApp();
}
```

- [ ] **Step 3: 문법 점검**

```bash
node --check app.js
```

- [ ] **Step 4: 커밋**

```bash
git add app.js
git commit -m "app.js: checkAuth를 Supabase getSession + profiles auth_user_id 조회로 교체"
```

---

### Task 11: `handleLogout()` 함수 교체

**Files:**
- Modify: `app.js:122-126`

- [ ] **Step 1: 기존 함수 위치 확인**

```bash
grep -n "function handleLogout" app.js
# expect: 122:function handleLogout() {
```

- [ ] **Step 2: 함수 본문 교체**

`app.js`의 `function handleLogout()` 전체를 다음으로 교체 (async 추가):

```javascript
async function handleLogout() {
    try {
        await sb.auth.signOut();
    } catch (e) {
        console.error('signOut error:', e);
    }
    localStorage.removeItem('klp_user');
    currentUser = null;
    showLogin();
}
```

- [ ] **Step 3: 문법 점검**

```bash
node --check app.js
```

- [ ] **Step 4: 커밋**

```bash
git add app.js
git commit -m "app.js: handleLogout에 sb.auth.signOut 추가"
```

---

### Task 12: `onAuthStateChange` 리스너 신규 추가

**Files:**
- Modify: `app.js` (DOMContentLoaded 또는 checkAuth 호출 근처)

- [ ] **Step 1: 추가 위치 결정**

```bash
grep -n "DOMContentLoaded\|checkAuth()" app.js | head -5
```

`checkAuth()`가 처음 호출되는 위치 근처(보통 DOMContentLoaded 핸들러 내부)를 찾는다.

- [ ] **Step 2: 리스너 등록 코드 추가**

`checkAuth()` 호출 바로 위 또는 아래에 다음 추가:

```javascript
// ===== 세션 만료/변경 자동 처리 =====
sb.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') && !session) {
        // 세션이 사라지거나 refresh 실패 → 로그인 화면으로
        currentUser = null;
        localStorage.removeItem('klp_user');
        showLogin();
        if (typeof showToast === 'function') {
            showToast('세션이 만료되었습니다. 다시 로그인해주세요.');
        }
    }
});
```

- [ ] **Step 3: 문법 점검**

```bash
node --check app.js
```

- [ ] **Step 4: 커밋**

```bash
git add app.js
git commit -m "app.js: onAuthStateChange 리스너 추가 (세션 만료 시 자동 로그아웃)"
```

---

## Phase C — 실행 런북 (사장님 + Claude 협업)

> ⚠️ **이 Phase는 자동 실행 금지.** 각 단계마다 사장님의 GO 사인을 받고 진행한다.
> SQL은 Supabase Dashboard → SQL Editor에서 실행한다.

### Task 13: Gate 0 — 사전 백업

- [ ] **Step 1: profiles 평문 비번 CSV export**

Supabase Dashboard → Table Editor → profiles → Export as CSV.
파일을 안전한 곳(USB 등)에 보관. 평문 비번이 들어있으므로 외부 노출 절대 금지.

- [ ] **Step 2: Supabase DB 백업 (선택 — Pro plan만)**

Supabase Dashboard → Database → Backups → "Create backup" 클릭.
Free plan은 자동 백업만 있으므로 skip.

- [ ] **Step 3: git 로컬 백업 확인**

```bash
ls "C:\Users\hyunh\Desktop\my-project\_backup\"
# expect: klp-work-dashboard-YYYYMMDD-HHMM.git 폴더 존재
```

없거나 오래됐으면 새로 생성:
```bash
git clone --mirror . "C:\Users\hyunh\Desktop\my-project\_backup\klp-work-dashboard-$(date +%Y%m%d-%H%M).git"
```

---

### Task 14: 001 + 002 실행 → Gate 1 검증

- [ ] **Step 1: 001 실행**

Supabase Dashboard → SQL Editor → 새 쿼리 → `migrations/001_profiles_add_auth_columns.sql` 내용 붙여넣기 → Run.

- [ ] **Step 2: 002 실행**

같은 방식으로 `migrations/002_profiles_seed_emails.sql` 실행.

- [ ] **Step 3: Gate 1 검증 쿼리**

```sql
SELECT name, email, auth_user_id FROM profiles ORDER BY name;
```

기대 결과:
```
구정두   kujungdoo@klp.local       NULL
김관택   kimkwantaek@klp.local     NULL
김현호   hyunhobbit@naver.com      NULL
유지은   yujieun@klp.local         NULL
이현주   leehyunju@klp.local       NULL
```

- [ ] **Step 4: 앱 영향 없음 확인**

브라우저에서 https://klp-work-dashboard.vercel.app 평소대로 로그인 한 번 → 정상이면 OK (아직 코드 안 바꿨으니 정상이어야 함).

---

### Task 15: 사장님 작업 — Supabase Dashboard에서 4명 추가 + 김현호 UUID 확인

> 🧑‍💼 이 태스크는 사장님이 직접 수행. Claude는 실행 결과를 받아 다음 단계 진행.

- [ ] **Step 1: 4명 신규 계정 추가**

Supabase Dashboard → Authentication → Users → "Add user" → Create new user.

다음 4개 각각 추가 (Auto Confirm User 체크):

| Email | Password |
|---|---|
| leehyunju@klp.local | (이현주 현재 비번) |
| yujieun@klp.local | (유지은 현재 비번) |
| kujungdoo@klp.local | (구정두 현재 비번) |
| kimkwantaek@klp.local | (김관택 현재 비번) |

- [ ] **Step 2: 김현호 기존 계정 UUID 확인**

같은 Users 페이지에서 `hyunhobbit@naver.com` 검색 → 해당 행의 UID(UUID) 복사.

⚠️ 비밀번호도 함께 확인. 현재 `profiles.password`의 김현호 비번과 일치하지 않으면:
- 옵션 A: 김현호 기존 Auth 비번을 사용하기로 결정 → `profiles.password`는 어차피 곧 제거되므로 그냥 진행
- 옵션 B: 김현호 Auth 비번을 `profiles.password`와 일치시키려면 → Authentication → 김현호 행 → "Send password recovery" 또는 "Reset password" 후 직접 설정

- [ ] **Step 3: Claude에게 결과 전달**

사장님이 Claude에게 다음 보고:
- "4명 추가 완료"
- "김현호 UUID = `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`"
- "김현호 Auth 비번 = (기존 그대로 / 새로 설정함)"

---

### Task 16: 003 실행 → Gate 2 검증

- [ ] **Step 1: 003 실행**

Supabase SQL Editor에서 `migrations/003_link_auth_users.sql` 실행.

- [ ] **Step 2: Gate 2 검증 쿼리**

```sql
SELECT name, email, auth_user_id FROM profiles ORDER BY name;
SELECT COUNT(*) AS missing FROM profiles WHERE auth_user_id IS NULL;
```

기대: 두 번째 쿼리 결과 `missing = 0`. 5명 모두 auth_user_id 채워짐.

만약 `missing > 0`이면:
- 어떤 직원의 email이 auth.users에 없다는 뜻
- → Task 15로 돌아가 누락된 계정 추가

- [ ] **Step 3: auth.users 5명 존재 확인**

```sql
SELECT u.email, p.name FROM auth.users u
LEFT JOIN profiles p ON p.auth_user_id = u.id
WHERE u.email IN (SELECT email FROM profiles WHERE email IS NOT NULL);
```

기대: 5행, 모두 `p.name` not null.

---

### Task 17: 004 + 005 실행 → Gate 3 검증

- [ ] **Step 1: 004 실행**

Supabase SQL Editor에서 `migrations/004_lock_rls_internal_tables.sql` 실행.

⚠️ 이 시점부터 **anon으로는 내부 테이블 접근 불가**. 현재 운영 중인 앱이 anon으로 동작 중이라면 이때부터 데이터 조회가 깨진다. 이는 의도된 동작이며, Gate 5에서 새 app.js 배포로 해결된다.

- [ ] **Step 2: 005 실행**

`migrations/005_lock_rls_public_proposals.sql` 실행.

- [ ] **Step 3: RLS 상태 확인**

```sql
SELECT tablename, rowsecurity FROM pg_tables
 WHERE schemaname = 'public'
   AND tablename IN ('profiles','projects_domestic','clients_overseas','clients','quotes',
                     'url_shortcuts','margin_simulations','marketing_campaigns','market_db',
                     'product_categories','confirmations','daily_tasks','deliveries',
                     'projects_temp','planning_projects','planning_posts','proposals','products')
 ORDER BY tablename;
```

기대: 18행, `rowsecurity = true` 전부.

- [ ] **Step 4: anon 차단 검증 (브라우저 콘솔에서)**

비로그인 상태에서 https://klp-work-dashboard.vercel.app 접속 → F12 → Console:

```javascript
const { data, error } = await window.supabase
  .createClient(
    'https://vtulmuxkriklpiibiues.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA'
  )
  .from('projects_domestic')
  .select('*').limit(1);
console.log({data, error});
// expect: data = [] (RLS가 차단)
```

- [ ] **Step 5: 공개 SELECT 확인**

```javascript
// proposals와 products는 anon SELECT 가능해야 함
const r1 = await sb.from('proposals').select('id').limit(1);
const r2 = await sb.from('products').select('id').limit(1);
console.log({proposals: r1, products: r2});
// expect: 둘 다 error 없이 빈 배열 또는 데이터 반환
```

---

### Task 18: 006 실행 → Gate 4 검증

- [ ] **Step 1: 006 실행**

`migrations/006_lock_storage_marketdb.sql` 실행.

- [ ] **Step 2: anon 업로드 차단 확인**

브라우저 비로그인 상태 콘솔:
```javascript
const blob = new Blob(['test'], {type: 'text/plain'});
const r = await sb.storage.from('market-db').upload('test-anon-' + Date.now() + '.txt', blob);
console.log(r);
// expect: error.statusCode = '403' 또는 permission denied
```

- [ ] **Step 3: 기존 이미지 public URL 확인**

market-db에 이미 들어있는 이미지 하나의 public URL을 브라우저로 열어본다.
```
https://vtulmuxkriklpiibiues.supabase.co/storage/v1/object/public/market-db/<기존 파일 경로>
```
정상적으로 이미지가 보여야 한다 (READ는 public 유지).

---

### Task 19: app.js 배포 → Gate 5 검증

- [ ] **Step 1: 빌드/배포**

```bash
git push origin master
npx vercel --prod --yes
```

배포 URL 확인.

- [ ] **Step 2: 5명 로그인 시나리오 테스트**

각 시나리오를 시크릿 창에서 차례로 수행:

| # | 시나리오 | 기대 결과 |
|---|---|---|
| 1 | 이현주 + 정상 비번 | 로그인 성공, 일일계획표 진입 |
| 2 | 김현호 + 정상 비번 | 로그인 성공, 중고마켓DB 메뉴 보임 |
| 3 | 김관택 + 정상 비번 | 로그인 성공, "대표님" 표시 |
| 4 | 유지은 + 정상 비번 | 로그인 성공, 중고마켓DB 메뉴 안 보임 |
| 5 | 구정두 + 정상 비번 | 로그인 성공, 일반 권한 메뉴만 |
| 6 | 이현주 + 틀린 비번 | "비밀번호가 올바르지 않습니다" |
| 7 | 없는 이름 + 아무 비번 | "등록되지 않은 이름입니다" |
| 8 | 로그인 후 새로고침 | 그대로 들어감 (세션 유지) |
| 9 | 로그아웃 후 새로고침 | 로그인 화면 |
| 10 | 콘솔에서 `localStorage.setItem('klp_user', JSON.stringify({name:'관리자',role:'admin'})); location.reload();` | 로그인 화면으로 튕김 (Supabase 세션 없음) ← 보안 검증 ⭐ |

- [ ] **Step 3: 한 명이라도 실패 시**

→ Vercel 대시보드 → Deployments → 직전 deployment → "Promote to Production" (즉시 rollback)
→ 어떤 시나리오가 실패했는지 기록, 원인 분석 후 수정

- [ ] **Step 4: 모두 통과 시**

사장님에게 보고: "5명 다 정상 로그인 확인. 며칠 운영 후 Task 20(password 제거)로 마무리합니다."

---

### Task 20: 007 실행 → Gate 6 (3~7일 후)

> ⚠️ 이 태스크는 며칠 후 별도 세션에서 실행한다.

- [ ] **Step 1: 운영 이슈 0건 확인**

3~7일 동안:
- 직원분들로부터 로그인 관련 문의 없음
- Supabase Dashboard → Logs에서 auth 관련 error 없음

- [ ] **Step 2: 사전 안전 체크**

```sql
-- 5명 모두 auth_user_id 연결되어 있는지 마지막 확인
SELECT name, email, auth_user_id FROM profiles ORDER BY name;
SELECT COUNT(*) AS missing FROM profiles WHERE auth_user_id IS NULL;
-- missing = 0 아니면 절대 실행 금지
```

- [ ] **Step 3: 007 실행**

`migrations/007_drop_profiles_password.sql` 실행.

- [ ] **Step 4: 검증**

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles';
-- expect: id, name, role, email, auth_user_id (password 없음)
```

- [ ] **Step 5: 마지막 회귀 테스트**

5명 중 한 명으로 로그인해 본다 → 정상이면 진짜 끝.

- [ ] **Step 6: 완료 커밋 메시지**

```bash
git commit --allow-empty -m "Phase 1 보안 이전 완료 — Supabase Auth + RLS 잠금 + password 컬럼 제거"
```

---

## 자가 점검 (작성자 노트)

**Spec coverage:**
- ✅ D1 (이름+비번 UX) — Task 9의 handleLogin에서 name→email 매핑 후 signInWithPassword
- ✅ D2 (기존 비번 이관) — Task 15에서 사장님이 대시보드로 입력
- ✅ D3 (단순 RLS) — Task 5의 `TO authenticated USING (true)`
- ✅ D4 (proposals/products anon SELECT) — Task 6
- ✅ D5 (Big bang) — Task 13~19 한 윈도우에 진행
- ✅ D6 (profiles 보강) — Task 2, 3
- ✅ D7 (대시보드 수동 추가) — Task 15
- ✅ D8 (UI 게이팅 유지) — app.js의 ADMIN_USERS/MARKETDB_ALLOWED 등 손대지 않음
- ✅ 김현호 hyunhobbit@naver.com 재활용 — Task 3, 15
- ✅ Gate 0~6 — Task 13, 14, 16, 17, 18, 19, 20
- ✅ 롤백 시나리오 — 각 SQL 파일 하단 ROLLBACK 섹션 + Task 19 Step 3 Vercel rollback
- ✅ proposal-view.html, doc-generator.html 변경 없음 — Phase B에 포함하지 않음

**Placeholder scan:** TBD/TODO 없음. 모든 SQL과 JS 코드가 그대로 실행 가능한 완성본.

**Type consistency:** `currentUser` 객체의 키(id, name, loginName, role, email, authUserId)는 Task 9·10에서 동일. `auth_user_id`(DB 컬럼) vs `authUserId`(JS 필드) 네이밍 차이는 의도적이며 Task 10의 `prof.auth_user_id`로 명시 매핑.
