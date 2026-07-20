# 멀티테넌트 SaaS 1단계 (기반 공사) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 superpowers:executing-plans 로 task 단위 실행. 단계 체크박스(`- [ ]`)로 추적.

**Goal:** KLP 전용 단일 회사 대시보드를 회사별로 데이터가 격리되는 멀티테넌트 구조로 전환하되, KLP 실서비스를 무중단으로 유지한다.

**Architecture:** 최상위 `companies` 개념 추가 → 모든 테넌트 테이블에 `company_id` 꼬리표 → RLS가 `company_id = current_company_id()`로 격리 강제 → INSERT 시 DB 트리거가 company_id 자동 기입. 직원·브랜딩·모듈은 코드가 아닌 DB에서 로드. KLP = company_id 1.

**Tech Stack:** Vanilla JS(app.js 단일 파일), Supabase(Postgres + RLS + Auth), Vercel(정적 + `/api` 서버리스), service-role 키는 Vercel 환경변수.

**설계 원문:** `docs/superpowers/specs/2026-07-20-multitenant-saas-foundation-design.md`

**무중단 규칙(전 task 공통):**
- 모든 마이그레이션은 **Supabase 브랜치에서 먼저 적용·검증** 후 프로덕션 반영.
- Task 1~4는 RLS가 여전히 개방 상태이므로 사용자 체감 0. **Task 6(RLS 조이기) 직전까지 KLP는 그대로 동작**.
- 각 task 끝에 `node --check app.js`(코드 변경 시) + 프로덕션 배포 후 KLP 주요 화면 스모크.

**테넌트 테이블 목록(이 계획에서 반복 참조 — "TENANT_TABLES"):**
`profiles, daily_tasks, meetings, meeting_actions, clients, clients_overseas, projects_domestic, projects_temp, quotes, proposals, products, product_categories, margin_simulations, confirmations, push_subscriptions, deliveries, marketing_campaigns, market_db, cash_accounts, cash_snapshots, planning_posts, planning_projects, ad_campaigns, url_shortcuts`

---

## Task 0: Supabase 브랜치 준비 (검증 환경)

**Files:** 없음 (인프라)

- [ ] **Step 1: 개발 브랜치 생성**

MCP `create_branch`(project vtulmuxkriklpiibiues, name `multitenant`) 또는 Supabase 대시보드에서 브랜치 생성. 이후 Task 1~6의 모든 마이그레이션은 **브랜치에 먼저** 적용한다.

- [ ] **Step 2: 브랜치에서 기준 데이터 개수 스냅샷**

```sql
select 'profiles' t, count(*) from profiles
union all select 'daily_tasks', count(*) from daily_tasks
union all select 'meetings', count(*) from meetings
union all select 'clients', count(*) from clients
union all select 'projects_domestic', count(*) from projects_domestic;
```
결과를 기록(Task 2 백필 후 대조용).

---

## Task 1: `companies` 테이블 + KLP 시드

**Files:**
- Create: `migrations/021_companies.sql`

- [ ] **Step 1: 마이그레이션 작성**

`migrations/021_companies.sql`:
```sql
-- 멀티테넌트 1단계: 회사(테넌트) 최상위 테이블
create table if not exists companies (
  id          bigserial primary key,
  name        text not null,
  settings    jsonb not null default '{}'::jsonb,
  plan        text not null default 'free',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- KLP = 1번 회사. 모든 모듈 활성.
insert into companies (id, name, plan, settings)
values (1, 'KLP KOREA', 'internal', jsonb_build_object(
  'brandName', 'KLP KOREA',
  'logoUrl', null,
  'primaryColor', '#1F85FF',
  'enabledModules', jsonb_build_array(
    'home','planning','projects','daily','meetings','delivery','marketing',
    'marketdb','cash','product-db','proposals','docs','manual','ceo-vision',
    'clients','clients-overseas','quotes','margin-calc','ad-studio'
  )
))
on conflict (id) do nothing;

-- id 시퀀스가 1 이후로 진행되도록 보정
select setval(pg_get_serial_sequence('companies','id'), greatest((select max(id) from companies), 1));

-- RLS: 자기 회사 행만 조회. (companies 는 로그인 후 자기 회사 설정 로드에 사용)
alter table companies enable row level security;
drop policy if exists companies_self_select on companies;
create policy companies_self_select on companies
  for select to authenticated
  using (id = current_company_id());
-- 주의: current_company_id() 는 Task 3에서 생성. 이 정책은 Task 3 이후 유효.
-- Task 1 시점에는 정책이 함수를 못 찾을 수 있으므로, 정책 생성은 Task 3 마이그레이션 끝으로 옮긴다(아래 Step 2 참조).
```

- [ ] **Step 2: 순서 보정 — companies RLS 정책은 Task 3으로 이동**

위 파일에서 `alter table companies enable row level security;` 이후의 policy 블록을 **삭제**하고, Task 3의 마이그레이션 끝에 넣는다(함수 의존성 때문). Task 1 파일은 테이블 생성 + KLP 시드 + setval + `enable row level security`까지만.

- [ ] **Step 3: 브랜치 적용 + 확인**

MCP `apply_migration`(브랜치)로 실행. 확인:
```sql
select id, name, settings->'enabledModules' from companies;
```
KLP 1행, enabledModules 19개 확인.

- [ ] **Step 4: 커밋**
```bash
git add migrations/021_companies.sql
git commit -m "멀티테넌트 T1: companies 테이블 + KLP(1번) 시드"
```

---

## Task 2: 모든 테넌트 테이블에 `company_id` 추가 + 백필 + 인덱스

**Files:**
- Create: `migrations/022_add_company_id.sql`

- [ ] **Step 1: 마이그레이션 작성 (NULL 허용 추가 → KLP 백필 → 인덱스)**

`migrations/022_add_company_id.sql` — TENANT_TABLES 전체에 대해 반복. 동적 DO 블록으로 안전하게:
```sql
-- 각 테넌트 테이블에 company_id 추가(NULL 허용), 전부 KLP(1)로 백필, 인덱스 생성
do $$
declare t text;
declare tables text[] := array[
  'profiles','daily_tasks','meetings','meeting_actions','clients','clients_overseas',
  'projects_domestic','projects_temp','quotes','proposals','products','product_categories',
  'margin_simulations','confirmations','push_subscriptions','deliveries','marketing_campaigns',
  'market_db','cash_accounts','cash_snapshots','planning_posts','planning_projects',
  'ad_campaigns','url_shortcuts'
];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then
      raise notice 'skip missing table %', t; continue;
    end if;
    execute format('alter table %I add column if not exists company_id bigint references companies(id)', t);
    execute format('update %I set company_id = 1 where company_id is null', t);
    execute format('create index if not exists %I on %I(company_id)', 'idx_'||t||'_company', t);
  end loop;
end $$;
```

- [ ] **Step 2: 브랜치 적용 + NULL 잔여 0 확인**

```sql
-- 모든 테넌트 테이블 company_id NULL 개수 (전부 0 이어야 함)
select 'profiles' t, count(*) filter (where company_id is null) nulls from profiles
union all select 'daily_tasks', count(*) filter (where company_id is null) from daily_tasks
union all select 'meetings', count(*) filter (where company_id is null) from meetings
union all select 'clients', count(*) filter (where company_id is null) from clients
union all select 'projects_domestic', count(*) filter (where company_id is null) from projects_domestic;
```
전부 0 확인. Task 0 스냅샷과 총 개수 동일 확인.

- [ ] **Step 3: 커밋**
```bash
git add migrations/022_add_company_id.sql
git commit -m "멀티테넌트 T2: 전 테넌트 테이블 company_id 추가 + KLP 백필 + 인덱스"
```

---

## Task 3: `current_company_id()` + INSERT 자동 태깅 트리거 + companies RLS

**Files:**
- Create: `migrations/023_company_helpers_triggers.sql`

- [ ] **Step 1: 마이그레이션 작성**

`migrations/023_company_helpers_triggers.sql`:
```sql
-- 로그인 사용자의 소속 회사 번호 (security definer)
create or replace function current_company_id() returns bigint
language sql stable security definer set search_path = public as $$
  select company_id from profiles where auth_user_id = auth.uid() limit 1
$$;

-- INSERT 시 company_id 자동 기입 (앱이 안 보내도 DB가 채움)
create or replace function set_company_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.company_id is null then
    NEW.company_id := current_company_id();
  end if;
  return NEW;
end $$;

-- 모든 테넌트 테이블에 BEFORE INSERT 트리거 부착 (profiles 제외 — 프로필은 온보딩에서 명시적으로 company_id 지정)
do $$
declare t text;
declare tables text[] := array[
  'daily_tasks','meetings','meeting_actions','clients','clients_overseas',
  'projects_domestic','projects_temp','quotes','proposals','products','product_categories',
  'margin_simulations','confirmations','push_subscriptions','deliveries','marketing_campaigns',
  'market_db','cash_accounts','cash_snapshots','planning_posts','planning_projects',
  'ad_campaigns','url_shortcuts'
];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop trigger if exists trg_set_company_id on %I', t);
    execute format('create trigger trg_set_company_id before insert on %I for each row execute function set_company_id()', t);
  end loop;
end $$;

-- Task 1에서 미룬 companies RLS 정책 (이제 함수 존재)
alter table companies enable row level security;
drop policy if exists companies_self_select on companies;
create policy companies_self_select on companies
  for select to authenticated
  using (id = current_company_id());
```

- [ ] **Step 2: 브랜치 적용 + 트리거 동작 확인**

브랜치에서 KLP 사용자 세션으로 테스트하기 어려우므로, 함수/트리거 존재만 확인:
```sql
select proname from pg_proc where proname in ('current_company_id','set_company_id');
select tgname, tgrelid::regclass from pg_trigger where tgname = 'trg_set_company_id' order by 2;
```
함수 2개, 트리거가 TENANT_TABLES(profiles 제외) 전부에 존재 확인.

- [ ] **Step 3: 커밋**
```bash
git add migrations/023_company_helpers_triggers.sql
git commit -m "멀티테넌트 T3: current_company_id + set_company_id 트리거 + companies RLS"
```

> **주의:** Task 1~3 마이그레이션을 **프로덕션에 반영**한다(RLS는 아직 조이지 않음 → KLP 영향 0). MCP `apply_migration`(프로덕션 project) 또는 브랜치 merge. 반영 후 KLP 실서비스에서 일일계획표 할 일 추가가 정상(트리거가 company_id=1 자동 기입)인지 1건 스모크.

---

## Task 4: 앱 — 로그인 시 회사 컨텍스트 로드 + 브랜딩 + 모듈 게이팅

**Files:**
- Modify: `app.js` (handleLogin ~217, showApp ~331, 전역 상태 근처)
- Modify: `index.html` (nav-item에 module 키 매핑 — 기존 data-tab 재사용)

RLS 개방 상태에서 배포 → 안전. 이 task는 "화면이 회사 설정을 읽어 반영"만 추가.

- [ ] **Step 1: 전역 상태에 currentCompany 추가**

`app.js` 전역 변수 선언부(currentUser 근처)에:
```js
let currentCompany = null; // { id, name, settings:{brandName,logoUrl,primaryColor,enabledModules[]} }
```

- [ ] **Step 2: 로그인 성공 후 회사 로드**

`handleLogin()`의 profiles select에 `company_id` 추가:
```js
.select('id, name, role, email, auth_user_id, company_id')
```
`currentUser` 구성 뒤(`localStorage.setItem` 앞)에:
```js
currentUser.companyId = prof.company_id || 1;
const { data: comp } = await sb.from('companies').select('id, name, settings').eq('id', currentUser.companyId).single();
currentCompany = comp || { id: 1, name: 'KLP KOREA', settings: {} };
applyCompanyBranding();
applyModuleGating();
```

- [ ] **Step 3: 브랜딩 적용 함수**

`app.js`에 신규:
```js
function applyCompanyBranding() {
  const s = (currentCompany && currentCompany.settings) || {};
  const brand = s.brandName || (currentCompany && currentCompany.name) || 'KLP KOREA';
  document.querySelectorAll('[data-brand-name]').forEach(el => { el.textContent = brand; });
  if (s.primaryColor) document.documentElement.style.setProperty('--primary', s.primaryColor);
  const logo = document.getElementById('sidebarLogo');
  if (logo && s.logoUrl && isSafeUrl(s.logoUrl)) logo.src = s.logoUrl;
}
```
사이드바 상단 회사명 요소에 `data-brand-name` 속성 부여(index.html). 로고 `<img id="sidebarLogo">`가 없으면 브랜드명 텍스트만 처리(로고는 선택).

- [ ] **Step 4: 모듈 게이팅 함수**

nav-item의 `data-tab` 값을 모듈 키로 사용. 서브아이템은 상위 그룹 키로 묶어 처리:
```js
function applyModuleGating() {
  const s = (currentCompany && currentCompany.settings) || {};
  const enabled = Array.isArray(s.enabledModules) ? s.enabledModules : null;
  if (!enabled) return; // 설정 없으면 전체 노출(=KLP 기본)
  // data-tab -> 모듈키 매핑(그룹 단위). 목록에 없으면 항상 노출(home 등 필수).
  const tabModule = {
    'planning':'planning','planning-company':'planning','planning-personal':'planning','planning-funding':'planning',
    'projects-temp':'projects','projects-domestic':'projects','projects-overseas':'projects',
    'daily':'daily','meetings':'meetings','delivery':'delivery','marketing':'marketing',
    'marketdb':'marketdb','cash':'cash','product-db':'product-db','proposals':'proposals',
    'docs':'docs','manual':'manual','ceo-vision':'ceo-vision','clients':'clients',
    'clients-overseas':'clients-overseas','quotes':'quotes','margin-calc':'margin-calc','ad-studio':'ad-studio'
  };
  const ALWAYS = new Set(['home']);
  document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
    const tab = btn.getAttribute('data-tab');
    if (ALWAYS.has(tab)) return;
    const mod = tabModule[tab] || tab;
    const show = enabled.includes(mod);
    // 기존에 권한으로 숨긴 항목(navMarketdb 등)은 건드리지 않도록: 모듈이 꺼졌을 때만 강제 숨김
    if (!show) btn.style.display = 'none';
  });
  // 그룹 헤더(하위가 모두 숨으면 헤더도 숨김) 처리 — nav 그룹 컨테이너 순회
  document.querySelectorAll('.nav-group').forEach(g => {
    const items = g.querySelectorAll('.nav-item');
    const anyVisible = Array.from(items).some(i => i.style.display !== 'none');
    if (!anyVisible) g.style.display = 'none';
  });
}
```
> 주의: 기존 권한 기반 숨김(`navMarketdb`, `navCash`, planning-company/funding 등 role로 `display:none`)과 **충돌 금지**. 모듈 게이팅은 "모듈이 꺼진 경우에만 추가로 숨김", 권한 로직은 그대로 둔다. `.nav-group` 클래스가 실제 존재하는지 index.html 확인 후 셀렉터 조정.

- [ ] **Step 5: 검증(브라우저)**

preview 서버로 KLP 로그인 → 사이드바 전체 노출·회사명 정상·콘솔 오류 없음. (KLP settings=전체 모듈이라 변화 없어야 정상)

- [ ] **Step 6: 배포 + 커밋**

캐시버스터 bump 후 배포. KLP 스모크(로그인·주요 탭 이동).
```bash
git add app.js index.html
git commit -m "멀티테넌트 T4: 로그인 시 회사 설정 로드 + 브랜딩/모듈 게이팅"
```

---

## Task 5: 앱 — 하드코딩 직원/담당자 → 회사 멤버 기반

**Files:**
- Modify: `app.js` (MEETING_ASSIGNEES ~17273, 일일계획표 담당자 컬럼 렌더, DISPLAY_NAME_MAP)

목표: 회의록 담당자·일일계획표 컬럼을 **현재 회사 profiles**에서 생성. KLP는 결과가 기존과 동일해야 함.

- [ ] **Step 1: 회사 멤버 목록 헬퍼**

`allProfiles`(이미 로드됨)를 회사 스코프로 사용. 멤버 표시명 배열 생성 헬퍼:
```js
function companyMemberNames() {
  // allProfiles: 현재 회사 profiles (RLS로 이미 회사 스코프). 표시명 기준.
  return (allProfiles || [])
    .filter(p => p.is_active !== false)
    .sort((a,b) => (a.sort_order||0)-(b.sort_order||0) || String(a.name).localeCompare(b.name))
    .map(p => DISPLAY_NAME_MAP[p.name] || p.name);
}
```
> `profiles`에 `sort_order`, `is_active`가 없으면 Task 5 마이그레이션으로 추가:
> `migrations/024_profiles_member_fields.sql`:
> ```sql
> alter table profiles add column if not exists sort_order int default 100;
> alter table profiles add column if not exists is_active boolean default true;
> ```
> (KLP profiles의 sort_order를 원하는 순서로 UPDATE — 기존 표시 순서 유지)

- [ ] **Step 2: MEETING_ASSIGNEES 동적화**

`const MEETING_ASSIGNEES = [...]`를 함수로 대체:
```js
function meetingAssignees() {
  // '전체'(공통) + 회사 멤버. KLP 하위호환: 기존 특수값(임원/대표님)은 멤버 role/이름으로 자연 표현.
  return ['전체'].concat(companyMemberNames());
}
```
사용처(17997, 18379 등)의 `MEETING_ASSIGNEES` → `meetingAssignees()`로 교체. `.concat(['(미지정)'])` 로직 유지.
> KLP 검증: 결과 배열이 기존 `['전체','임원','대표님','이현주','김현호','유지은','구정두']`와 **의미적으로 동등**해야 함. '임원'/'대표님'이 실제 담당자 값으로 쓰인 기존 데이터가 있으면, 그 값들이 멤버 목록에 포함되도록 KLP profiles/매핑 조정(또는 '전체' 외 특수 컬럼은 KLP settings의 별도 목록으로 유지하는 하위호환 분기).

- [ ] **Step 3: 일일계획표 담당자 컬럼 동적화**

일일계획표 컬럼 생성부(하드코딩된 담당자/컬럼 배열)를 `companyMemberNames()` 기반으로 교체. '전체(공통)' 컬럼은 유지. KLP 특수 컬럼('임원','대표님')은 멤버 컬럼으로 흡수.
> 이 부분은 렌더 코드가 방대하므로, 실제 배열 선언 지점을 grep(`일일계획표`, `dailyAssignee`, 컬럼 map)으로 찾아 정확히 교체. 각 교체마다 `node --check`.

- [ ] **Step 4: 검증(브라우저) — KLP 동등성**

KLP 로그인 → 회의록 담당자 드롭다운·이행점검 칸·일일계획표 컬럼이 **이전과 동일**하게 보이는지. 데이터 손실/누락 컬럼 없음.

- [ ] **Step 5: 배포 + 커밋**
```bash
git add app.js migrations/024_profiles_member_fields.sql
git commit -m "멀티테넌트 T5: 회의록 담당자·일일계획표 컬럼을 회사 멤버 기반으로 전환"
```

---

## Task 6: RLS를 회사 스코프로 조이기 + company_id NOT NULL (⚠️ 무장 단계)

**Files:**
- Create: `migrations/025_tenant_rls.sql`

이 시점엔 앱이 이미 회사 컨텍스트로 동작 → KLP 정상. 이제 격리를 실제로 강제.

- [ ] **Step 1: 마이그레이션 작성 — 일반 테넌트 테이블 회사 스코프 RLS**

`migrations/025_tenant_rls.sql`. **회의록 계열(meetings, meeting_actions)과 특수 RLS 테이블은 제외**하고 별도 처리:
```sql
-- 일반 테넌트 테이블: 기존 authenticated 전체허용 정책을 회사 스코프로 교체
do $$
declare t text;
declare tables text[] := array[
  'daily_tasks','clients','clients_overseas','projects_domestic','projects_temp',
  'quotes','products','product_categories','margin_simulations','confirmations',
  'push_subscriptions','deliveries','marketing_campaigns','market_db',
  'cash_accounts','cash_snapshots','planning_posts','planning_projects',
  'ad_campaigns','url_shortcuts'
];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table %I enable row level security', t);
    -- 기존 광범위 정책 제거(migration 004에서 만든 이름 규칙에 맞춰 조정 필요)
    execute format('drop policy if exists %I on %I', t||'_all_auth', t);
    execute format('drop policy if exists %I on %I', 'authenticated_all', t);
    -- 회사 스코프 정책
    execute format($f$create policy %I on %I for all to authenticated
      using (company_id = current_company_id())
      with check (company_id = current_company_id())$f$, t||'_company', t);
  end loop;
end $$;
```
> **중요:** migration 004의 실제 정책 이름을 먼저 확인(`select policyname, tablename from pg_policies where schemaname='public'`)해 `drop policy` 대상을 정확히 지정. 이름이 다르면 남은 개방 정책이 격리를 무력화한다.

- [ ] **Step 2: 회의록 계열 RLS에 회사 경계 AND 추가**

`meetings`, `meeting_actions`는 기존 비공개 규칙(작성자·참석자·관리자) 정책에 `company_id = current_company_id()`를 AND로 추가. migration 019의 정책을 재작성:
```sql
-- 예시(019의 실제 정책명/조건을 읽어 회사 필터를 AND로 합성)
-- using ( company_id = current_company_id() AND (<기존 비공개 조건>) )
```
`anon` 공유 정책(proposals share token 등)은 회사 경계와 무관한 토큰 기반이므로 유지하되, 토큰이 특정 행만 여는지 재확인.

- [ ] **Step 3: company_id NOT NULL 확정**

```sql
do $$
declare t text;
declare tables text[] := array[ /* TENANT_TABLES 전체 */
  'profiles','daily_tasks','meetings','meeting_actions','clients','clients_overseas',
  'projects_domestic','projects_temp','quotes','proposals','products','product_categories',
  'margin_simulations','confirmations','push_subscriptions','deliveries','marketing_campaigns',
  'market_db','cash_accounts','cash_snapshots','planning_posts','planning_projects',
  'ad_campaigns','url_shortcuts'];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table %I alter column company_id set not null', t);
  end loop;
end $$;
```

- [ ] **Step 4: 브랜치에서 격리 검증 (핵심)**

브랜치에 **시험 회사 B** + B의 사용자 1명을 임시 생성(SQL로 companies insert, profiles insert with company_id=B, auth 사용자는 Task 7 함수 또는 대시보드). B로 로그인해:
```
- B 로그인 시 daily_tasks/clients 등에 KLP 데이터가 0건 보이는지(격리 OK)
- KLP 로그인 시 기존 데이터 개수 그대로(회귀 없음)
```
직접 SQL로도 `set role`/JWT 시뮬레이션이 어려우면, 앱 2계정 로그인으로 교차 확인.

- [ ] **Step 5: 프로덕션 반영 + KLP 스모크 + 커밋**

KLP 로그인 → 모든 주요 탭 데이터 정상 표시(격리 후에도 KLP는 company 1이라 전부 보임). 이상 시 즉시 정책 롤백 플랜(이전 개방 정책 재적용 SQL 준비).
```bash
git add migrations/025_tenant_rls.sql
git commit -m "멀티테넌트 T6: 테넌트 RLS 회사 스코프 조이기 + company_id NOT NULL"
```

---

## Task 7: 온보딩 — 슈퍼관리자 회사 생성 (서버리스 + 최소 UI)

**Files:**
- Create: `api/admin-create-company.js`
- Create: `migrations/026_superadmin.sql`
- Modify: `app.js` (슈퍼관리자 화면 렌더 + 호출)
- Modify: `index.html` (슈퍼관리자 nav-item, 슈퍼관리자에게만 노출)

- [ ] **Step 1: is_superadmin 컬럼 + 현호 지정**

`migrations/026_superadmin.sql`:
```sql
alter table profiles add column if not exists is_superadmin boolean default false;
update profiles set is_superadmin = true where name = '김현호';
```

- [ ] **Step 2: 서버리스 함수 (service role)**

`api/admin-create-company.js` — Vercel Node 함수. 환경변수 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 사용(신규 등록 필요):
```js
import { createClient } from '@supabase/supabase-js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const auth = (req.headers.authorization||'').replace('Bearer ','');
  if (!auth) return res.status(401).json({ error: 'no token' });
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  // 1) 요청자 검증: 토큰 → user → profiles.is_superadmin
  const { data: u } = await admin.auth.getUser(auth);
  if (!u || !u.user) return res.status(401).json({ error: 'bad token' });
  const { data: me } = await admin.from('profiles').select('is_superadmin').eq('auth_user_id', u.user.id).single();
  if (!me || !me.is_superadmin) return res.status(403).json({ error: 'not superadmin' });
  // 2) 입력
  const { companyName, adminEmail, adminName, enabledModules } = req.body || {};
  if (!companyName || !adminEmail || !adminName) return res.status(400).json({ error: 'missing fields' });
  // 3) 회사 생성
  const settings = { brandName: companyName, logoUrl: null, primaryColor: '#1F85FF',
    enabledModules: Array.isArray(enabledModules) ? enabledModules : ['home','daily','meetings','clients','projects'] };
  const { data: comp, error: cErr } = await admin.from('companies').insert({ name: companyName, settings }).select('id').single();
  if (cErr) return res.status(500).json({ error: cErr.message });
  // 4) 관리자 Auth 사용자 생성(임시 비번)
  const tempPw = Math.random().toString(36).slice(2) + 'A1!';
  const { data: au, error: aErr } = await admin.auth.admin.createUser({ email: adminEmail, password: tempPw, email_confirm: true });
  if (aErr) return res.status(500).json({ error: aErr.message });
  // 5) 프로필 생성
  const { error: pErr } = await admin.from('profiles').insert({
    name: adminName, role: '관리자', email: adminEmail, auth_user_id: au.user.id,
    company_id: comp.id, is_superadmin: false });
  if (pErr) return res.status(500).json({ error: pErr.message });
  return res.status(200).json({ ok: true, companyId: comp.id, adminEmail, tempPassword: tempPw });
}
```
> `Math.random()`은 서버리스 런타임에서 정상(계획 스크립트 제약과 무관). `@supabase/supabase-js`가 `/api` 함수에서 import 가능하도록 `package.json` 의존성 확인/추가.

- [ ] **Step 3: 슈퍼관리자 UI (최소)**

`index.html`에 nav-item `data-tab="admin-companies"`(슈퍼관리자만 노출, 기본 `display:none`). `app.js`:
- 로그인 후 `currentUser`/profiles에서 `is_superadmin` 읽어 해당 nav 노출.
- 탭 렌더: 회사명·관리자 이메일·관리자 이름 입력 + 모듈 체크박스 → `fetch('/api/admin-create-company', { method:'POST', headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' }, body: JSON.stringify({...}) })`.
- 성공 시 임시 비번을 화면에 표시(현호가 회사에 전달). `profiles.select`에 `is_superadmin` 포함하도록 handleLogin 수정.

- [ ] **Step 4: 환경변수 등록 안내**

배포 전 사용자(현호)에게 Vercel 환경변수 `SUPABASE_SERVICE_ROLE_KEY` 등록 안내(서비스롤 키는 채팅에 붙여넣지 말고 Vercel 대시보드에만). `SUPABASE_URL`도.

- [ ] **Step 5: 검증 + 커밋**

브랜치/프로덕션에서 현호 로그인 → 회사관리 탭 → 시험 회사 생성 → 임시 비번으로 그 회사 로그인 → 격리 확인.
```bash
git add api/admin-create-company.js migrations/026_superadmin.sql app.js index.html
git commit -m "멀티테넌트 T7: 슈퍼관리자 회사 생성(서버리스) + 최소 온보딩 UI"
```

---

## Task 8: 종단 검증 + 문서화

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-07-20-multitenant-saas-foundation-design.md`(구현과 차이 반영)

- [ ] **Step 1: 2회사 종단 시나리오**

시험 회사 B로 전체 스모크: 일일계획표 추가/완료, 회의록 작성·이행점검, 거래처 등록, 프로젝트 등록 — **전부 B 스코프로만** 저장·조회됨. KLP에서 B 데이터 안 보임(반대도).

- [ ] **Step 2: CLAUDE.md 갱신**

멀티테넌트 구조(companies, company_id, current_company_id, set_company_id 트리거, 회사 스코프 RLS, 브랜딩/모듈 게이팅, 슈퍼관리자 온보딩) 섹션 추가. "새 테넌트 테이블 추가 시: company_id + 트리거 + 회사 스코프 RLS 필수" 규칙 명시.

- [ ] **Step 3: 시험 회사 정리(선택) + 커밋**

시험 회사 B는 유지(데모용) 또는 비활성(`companies.active=false`). 커밋:
```bash
git add CLAUDE.md docs/superpowers/specs/2026-07-20-multitenant-saas-foundation-design.md
git commit -m "멀티테넌트 T8: 2회사 종단 검증 + 문서화"
```

---

## Self-Review 메모(작성자 확인 완료)
- **스펙 커버리지:** A(격리)=T1~T3,T6 / B(직원 데이터화)=T5 / C(브랜딩·모듈)=T4 / D(KLP 이전)=T2 / E(온보딩)=T7. 전 항목 task 존재.
- **타입 일관성:** `current_company_id()`/`set_company_id()`/`companies.settings.enabledModules`/`company_id` 명칭 전 task 통일.
- **위험 지점 명시:** ① migration 004/019의 실제 정책명 확인 후 drop(누락 시 격리 무력화) ② KLP 담당자 특수값('임원','대표님') 하위호환 ③ service role 키는 Vercel에만.
- **무중단:** T1~T4는 RLS 개방 → 체감 0. T6가 유일한 "무장" 지점이며 롤백 SQL 준비 포함.
