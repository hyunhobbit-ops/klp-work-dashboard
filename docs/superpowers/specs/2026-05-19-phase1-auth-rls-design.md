# Phase 1 — Supabase Auth 이전 + RLS 잠금 설계서

**작성일**: 2026-05-19
**대상**: KLP KOREA 업무 대시보드 (https://klp-work-dashboard.vercel.app)
**범위**: Codex 보안 리뷰의 Critical 3건(#1 인증 우회, #2 평문 비밀번호, #3 RLS 전체공개) 해결

---

## 1. 배경

코덱스 보안 리뷰에서 다음이 확인됨:

- `localStorage.klp_user`만 신뢰하는 클라이언트 인증 → 콘솔 한 줄로 admin 진입 가능
- `profiles.password` 평문 컬럼을 클라이언트로 내려받아 비교 → 전 직원 비번 유출 위험
- 18개 테이블 + Storage 버킷 RLS가 `using(true) with check(true)` 또는 RLS 미설정 → anon key + REST 한 번으로 외부에서 R/W/D 가능

현재 anon key가 source에 박혀 있고(`app.js:7`, `proposal-view.html:78`, `doc-generator.html:372`), 이 자체는 정상이나 RLS와 결합되어 사실상 마스터 키로 동작 중.

## 2. 목표

- profiles.password 평문 컬럼 제거, Supabase Auth로 인증 이전
- 16개 내부 테이블 + Storage RLS를 `authenticated` 사용자 한정으로 잠금
- 거래처용 공개 제안서(`proposal-view.html`) 동작은 유지 (`proposals`, `products` 만 anon SELECT 허용)
- 5명 직원의 로그인 UX는 변경 없음 (이름 + 비번)

## 3. 비목표 (이 Phase에서 안 함)

- XSS 패치 (Codex #4~6) → Phase 2
- 성능 개선 / 대량 select 페이지네이션 (Codex #10) → Phase 3
- 문서번호 동시성 (Codex #8) → Phase 3
- 메뉴별 DB 레벨 권한 격리 (market_db, planning 등을 ALLOWED 명단만 DB에서 접근하도록) → UI 게이팅으로 충분하다고 결론, 추후 필요 시 별도 작업

## 4. 결정사항 (Decisions)

| # | 결정 | 선택 |
|---|---|---|
| D1 | 로그인 UX | 이름 + 비밀번호 그대로 유지, 내부적으로 synthetic email 매핑 |
| D2 | 기존 비밀번호 이관 | 평문 비번 그대로 Supabase Auth로 이관 (사장님이 대시보드에서 입력) |
| D3 | RLS 모델 | 단순 모델 — `authenticated` = 모든 내부 테이블 풀 액세스 |
| D4 | 공개 제안서 정책 | `proposals`, `products`만 anon SELECT 허용. 쓰기/삭제는 `authenticated` 만 |
| D5 | 전환 방식 | Big bang (주말 또는 야간 1~2시간 윈도우) |
| D6 | profiles 테이블 구조 | 기존 profiles에 `email`, `auth_user_id` 컬럼 추가 (Approach A) |
| D7 | Auth 계정 생성 방식 | Supabase 대시보드에서 수동 추가 (사장님 작업) |
| D8 | 메뉴별 DB 격리 | UI 게이팅으로 충분, DB는 단순 모델 유지 |

### 4.1 직원 ↔ Auth Email 매핑 (D1, D2)

| 이름 (profiles.name) | email | 비고 |
|---|---|---|
| 이현주 | `leehyunju@klp.local` | 신규 생성 |
| 김현호 | `hyunhobbit@naver.com` | **기존 Auth 계정 재활용** (과거 데이터/이력이 묶여 있을 수 있음) |
| 유지은 | `yujieun@klp.local` | 신규 생성 |
| 구정두 | `kujungdoo@klp.local` | 신규 생성 |
| 김관택 | `kimkwantaek@klp.local` | 신규 생성. 표시명은 `대표님` 유지 (DISPLAY_NAME_MAP) |

`.local` TLD는 RFC상 외부 발송 불가 → 외부 메일 오발송 사고 방지.

## 5. 아키텍처

### 5.1 전환 전 (현재)

```
[Browser]
  ├─ profiles.select(password) → 클라이언트 평문 비교 → localStorage.klp_user 저장
  └─ 모든 테이블 (RLS = using(true)) — anon이 R/W/D 자유
```

### 5.2 전환 후 (목표)

```
[Browser]
  ├─ 로그인: 이름 입력
  │            ↓
  │   profiles.where(name=X).email 조회
  │            ↓
  │   sb.auth.signInWithPassword({email, password})
  │            ↓
  │   ┌──────────────────────────────────┐
  │   │ auth.users (Supabase 관리)       │
  │   │   email, encrypted_password(bcrypt) │
  │   └──────────────┬───────────────────┘
  │                  │ auth.uid()
  │                  ↓
  │   ┌──────────────────────────────────┐
  │   │ public.profiles                  │
  │   │   id, name, role,                │
  │   │   email (NEW), auth_user_id (NEW)│
  │   │   password (DROP)                │
  │   └──────────────────────────────────┘
  │
  ├─ 세션: sb.auth.getSession() / onAuthStateChange (localStorage는 보조 캐시)
  │
  └─ DB 접근: JWT 자동 첨부
       ├─ 내부 13개 테이블 → RLS: TO authenticated
       ├─ proposals/products → SELECT anon 허용, 쓰기는 authenticated
       └─ Storage market-db → READ public, 쓰기는 authenticated
```

### 5.3 영향 면적

| 종류 | 개수 | 비고 |
|---|---|---|
| DB 컬럼 추가 | 2 | `profiles.email`, `profiles.auth_user_id` |
| DB 컬럼 삭제 | 1 | `profiles.password` (Step 7, 며칠 후) |
| RLS 정책 변경 | 18개 테이블 + Storage 1개 버킷 | 내부 16개 + 공개 2개(proposals, products) |
| app.js 함수 변경 | 4 | `checkAuth`, `handleLogin`, `handleLogout`, 신규 `onAuthStateChange` |
| HTML 페이지 변경 | 0 | `proposal-view.html`, `doc-generator.html` 코드 변경 없음 |
| Auth 계정 신규 생성 | 4 | 김현호 제외 (기존 재활용) |

## 6. SQL 마이그레이션

### 6.1 파일 구성

```
migrations/
  001_profiles_add_auth_columns.sql        ← email, auth_user_id 추가
  002_profiles_seed_emails.sql             ← 5명 email UPDATE
  003_link_auth_users.sql                  ← profiles.auth_user_id 연결 (대시보드 수동 후 실행)
  004_lock_rls_internal_tables.sql         ← 16개 내부 테이블 RLS 잠금
  005_lock_rls_public_proposals.sql        ← proposals, products RLS (anon SELECT 허용)
  006_lock_storage_marketdb.sql            ← Storage 버킷 정책
  007_drop_profiles_password.sql           ← 평문 password 컬럼 제거 (며칠 후)
```

### 6.2 단계별 내용

**001 — profiles 보강**
```sql
ALTER TABLE profiles
  ADD COLUMN email TEXT UNIQUE,
  ADD COLUMN auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
```

**002 — 이메일 채움**
```sql
UPDATE profiles SET email = 'leehyunju@klp.local'    WHERE name = '이현주';
UPDATE profiles SET email = 'hyunhobbit@naver.com'   WHERE name = '김현호';
UPDATE profiles SET email = 'yujieun@klp.local'      WHERE name = '유지은';
UPDATE profiles SET email = 'kujungdoo@klp.local'    WHERE name = '구정두';
UPDATE profiles SET email = 'kimkwantaek@klp.local'  WHERE name = '김관택';
```

**003 — Auth 계정 연결** (사장님이 대시보드에서 4명 추가 + 김현호 기존 UUID 확보 후)
```sql
UPDATE profiles p SET auth_user_id = u.id
FROM auth.users u
WHERE u.email = p.email;
```

**004 — 내부 16개 테이블 RLS 잠금** (각 테이블에 같은 패턴)
```sql
DROP POLICY IF EXISTS "<기존 정책명>" ON <table>;  -- 정책이 있으면 제거
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;     -- 켜져있지 않은 경우 대비
CREATE POLICY <table>_auth_all ON <table>
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```
대상 테이블 (16개):

| # | 테이블 | 현재 RLS SQL 파일 | 비고 |
|---|---|---|---|
| 1 | `profiles` | (없음) | password 컬럼은 Step 7에서 제거 |
| 2 | `projects_domestic` | `projects_domestic.sql` | |
| 3 | `clients_overseas` | `clients_overseas.sql` | |
| 4 | `clients` | (없음) | 국내 거래처 |
| 5 | `quotes` | `quotes.sql` | |
| 6 | `url_shortcuts` | `url_shortcuts.sql` | |
| 7 | `margin_simulations` | `margin_simulations.sql` | |
| 8 | `marketing_campaigns` | `marketing_campaigns.sql` | |
| 9 | `market_db` | `market_db.sql`, `market_db_setup.sql` | |
| 10 | `product_categories` | `product_categories.sql` | |
| 11 | `confirmations` | (없음) | DC/WR 문서 |
| 12 | `daily_tasks` | (없음) | 일일계획표 |
| 13 | `deliveries` | (없음) | 택배 관리 |
| 14 | `projects_temp` | (없음) | 임시 프로젝트 |
| 15 | `planning_projects` | (없음) | 회사/가족/펀딩 프로젝트 |
| 16 | `planning_posts` | (없음) | 프로젝트 카드/포스트 |

공개 2개(proposals, products)는 005에서 따로 처리. profiles는 password 컬럼 정리 작업이 Step 7에서 추가되지만 RLS 정책 패턴은 동일.

⚠️ **위 16개 중 8개는 explicit RLS SQL 파일이 없음** → 현재 RLS가 켜져있지 않을 가능성 높음. 004 스크립트는 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`를 명시적으로 호출해 방어적으로 처리. 실행 전에 `pg_tables` / `pg_policies` 시스템 카탈로그로 현재 상태 한 번 점검.

**005 — proposals, products (공개 SELECT 허용)**
```sql
DROP POLICY IF EXISTS proposals_all ON proposals;
CREATE POLICY proposals_anon_read ON proposals FOR SELECT TO anon USING (true);
CREATE POLICY proposals_auth_all  ON proposals FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS products_all ON products;
CREATE POLICY products_anon_read ON products FOR SELECT TO anon USING (true);
CREATE POLICY products_auth_all  ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**006 — Storage market-db 잠금**
```sql
DROP POLICY IF EXISTS "market-db anon write"  ON storage.objects;
DROP POLICY IF EXISTS "market-db anon update" ON storage.objects;
DROP POLICY IF EXISTS "market-db anon delete" ON storage.objects;

CREATE POLICY "market-db auth write"  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'market-db');
CREATE POLICY "market-db auth update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'market-db');
CREATE POLICY "market-db auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'market-db');
-- READ public 정책은 그대로 유지 (이미지 노출용)
```

**007 — password 컬럼 영구 제거** (Gate 5 통과 + 며칠 정상 운영 후)
```sql
ALTER TABLE profiles DROP COLUMN password;
```

## 7. 코드 변경 (app.js)

### 7.1 변경 함수 목록

| 위치 | 함수 | 변경 |
|---|---|---|
| `app.js:43` | `checkAuth()` | localStorage 직접 신뢰 → `sb.auth.getSession()` |
| `app.js:79` | `handleLogin()` | profiles.password 비교 → `sb.auth.signInWithPassword()` |
| `app.js:122` | `handleLogout()` | `sb.auth.signOut()` 추가 |
| 신규 | `onAuthStateChange` 리스너 | 세션 만료 시 자동 로그아웃 |

### 7.2 `handleLogin()` 신규 흐름

```javascript
async function handleLogin() {
    const name = document.getElementById('loginName').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    // 1) name → email 매핑 조회
    const { data: prof, error: profErr } = await sb
        .from('profiles')
        .select('id, name, role, email, auth_user_id')
        .eq('name', name)
        .single();

    if (profErr || !prof || !prof.email) {
        errorEl.textContent = '등록되지 않은 이름입니다';
        return;
    }

    // 2) Supabase Auth 로그인
    const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
        email: prof.email,
        password: password,
    });

    if (authErr) {
        if (authErr.message.includes('Invalid login credentials')) {
            errorEl.textContent = '비밀번호가 올바르지 않습니다';
        } else {
            errorEl.textContent = `로그인 오류: ${authErr.message}`;
        }
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
    showApp();
}
```

### 7.3 `checkAuth()` 신규 흐름

```javascript
async function checkAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { showLogin(); return; }

    const { data: prof } = await sb
        .from('profiles')
        .select('id, name, role, email, auth_user_id')
        .eq('auth_user_id', session.user.id)
        .single();

    if (!prof) {
        await sb.auth.signOut();
        showLogin();
        return;
    }

    const displayName = DISPLAY_NAME_MAP[prof.name] || prof.name;
    currentUser = { ...prof, name: displayName, loginName: prof.name };
    showApp();
}
```

### 7.4 신규 세션 리스너

```javascript
sb.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') && !session) {
        currentUser = null;
        localStorage.removeItem('klp_user');
        showLogin();
        showToast('세션이 만료되었습니다. 다시 로그인해주세요.');
    }
});
```

### 7.5 변경 없음

- `proposal-view.html` — anon SELECT만 쓰므로 그대로
- `doc-generator.html` — 직원 로그인 상태에서 열리면 JWT 자동 첨부, 그대로
- `scripts/replace-clients.js` — RLS 잠그면 더 이상 anon으로 동작 안 함. 실행 시 service_role key 필요로 별도 주석 추가

## 8. 에러 처리 매트릭스

| 상황 | UX | 처리 |
|---|---|---|
| 이름 오타 (profiles에 없음) | "등록되지 않은 이름입니다" | profiles select 실패 |
| 비밀번호 틀림 | "비밀번호가 올바르지 않습니다" | Supabase `Invalid login credentials` 매핑 |
| 네트워크 끊김 | "로그인 오류: <Supabase 메시지>" | 메시지 그대로 노출 |
| 세션 만료 (장시간 미사용) | 토스트 후 로그인 화면 | `onAuthStateChange` 자동 처리 |
| `profiles.email` 비어있음 | "등록되지 않은 이름입니다" | 마이그레이션 Gate 1으로 사전 차단 |
| Supabase Auth 계정 없음 | "비밀번호가 올바르지 않습니다" | 마이그레이션 Gate 2로 사전 차단 |
| 콘솔로 localStorage 조작 | 새로고침 시 로그인 화면 튕김 | Supabase 세션이 없으므로 |

## 9. 검증 게이트

| Gate | 시점 | 통과 조건 |
|---|---|---|
| Gate 0 | 작업 시작 전 | Supabase 백업 + git 백업 + profiles CSV export |
| Gate 1 | Step 1~2 후 | `SELECT name, email FROM profiles` → 5명 모두 email 채워짐 |
| Gate 2 | Step 3 후 | `auth_user_id IS NULL` 행이 0개, auth.users에 5명 |
| Gate 3 | Step 4~5 후 | anon으로 내부 테이블 select 거부, proposals/products SELECT 가능, INSERT 거부 |
| Gate 4 | Step 6 후 | anon Storage 업로드 거부, 기존 이미지 public URL 정상 |
| Gate 5 | 코드 배포 후 | 5명 각각 로그인 OK, 잘못된 비번 거부, localStorage 조작 차단 확인 |
| Gate 6 | 3~7일 후 | 운영 이슈 0건 확인 후 password 컬럼 DROP |

## 10. 롤백

| 단계 | 롤백 명령 | 영향 |
|---|---|---|
| Gate 1 실패 | `ALTER TABLE profiles DROP COLUMN email, DROP COLUMN auth_user_id;` | 앱 정상 동작 (코드 아직 안 바뀜) |
| Gate 2 실패 | 위 + 잘못된 auth.users 대시보드에서 삭제 | 앱 정상 동작 |
| Gate 3 실패 | `CREATE POLICY <table>_emergency ON <table> FOR ALL TO public USING (true) WITH CHECK (true);` | 보안 풀리지만 앱 즉시 복구 |
| Gate 5 실패 | Vercel 직전 deployment로 instant rollback | 30초 내 복구 |
| Gate 6 (password DROP) 후 | **롤백 불가** — Gate 0 CSV 백업으로 수동 복원 | Step 7만 며칠 분리 이유 |

## 11. 작업 윈도우

- **실제 작업**: 30~60분
- **검증 포함**: 1~2시간
- **추천 시간**: 평일 야간(22~24시) 또는 주말 오전
- **사용자 공지**: "오늘 밤 23~01시 시스템 점검, 그 시간엔 로그인 마세요"
- **최악 다운타임**: Vercel rollback이 즉시 가능하므로 5~10분 내 복구

## 12. 사장님이 해야 하는 작업 (전부)

1. **(설계 단계, 지금)** 이 스펙 검토 후 OK
2. **(실행 단계, 며칠 후)** Supabase 대시보드 → Authentication → Users → Add user 4번 클릭
   - leehyunju@klp.local (이현주 현재 비번)
   - yujieun@klp.local (유지은 현재 비번)
   - kujungdoo@klp.local (구정두 현재 비번)
   - kimkwantaek@klp.local (김관택 현재 비번)
3. **(실행 단계)** 김현호 기존 계정(`hyunhobbit@naver.com`)의 UUID를 대시보드에서 복사해서 전달
4. **(검증 단계)** Gate 5에서 본인 계정 로그인 한 번 테스트
5. **(완료 단계, 3~7일 후)** "다 잘 되네" 확인 → 제가 Step 7 실행 승인

직원분들이 해야 할 작업: **0개**. 다음 로그인 때 평소처럼 이름+비번 입력.

## 13. 향후 작업 (이 Phase 이후)

- **Phase 2 (XSS 봉합)**: `proposal-view.html` escape, `doc-generator.html` hash 처리, `app.js` URL scheme 검증
- **Phase 3 (성능/품질)**: `select('*')` 페이지네이션, 문서번호 RPC, `sbFetch` 오류 처리
- **장기**: 필요 시 메뉴별 DB 격리 (market_db, planning 등을 ALLOWED 명단만 DB 접근 가능하도록 세분화)
