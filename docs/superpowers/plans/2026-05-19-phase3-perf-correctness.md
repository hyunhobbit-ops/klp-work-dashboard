# Phase 3 성능/정합성 보강 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codex 보안 리뷰 Medium 4건(#8 문서번호 동시성, #9 mass delete 가드, #10 select(*) 페이지네이션, #11 sbFetch HTTP 오류처리)을 일괄 해결.

**Architecture:** SQL 2건(UNIQUE 제약 + SECURITY DEFINER RPC) 신규 추가. `doc-generator.html`에 `saveConfirmationWithRetry` 헬퍼 + `sbFetch` HTTP 오류 throw. `app.js`에 `paginatedLoad` 공통 헬퍼 + 14개 사이트 적용 + `deleteAllMarketdb`를 RPC 호출로 전환.

**Tech Stack:** Vanilla JS, PostgreSQL (Supabase) UNIQUE constraint + RPC, Supabase JS client `sb.rpc()` + `.range()` API.

**Test 환경:** 자동 테스트 프레임워크 없음. SQL은 검증 쿼리, 코드는 브라우저 수동 시나리오로 검증.

**스펙 참조:** `docs/superpowers/specs/2026-05-19-phase3-perf-correctness-design.md` (commit `947489d`)

---

## File Structure

| 파일 | 변경 |
|------|------|
| `migrations/008_confirmations_doc_number_unique.sql` | NEW — UNIQUE 제약 + 사전 점검 쿼리 |
| `migrations/009_market_db_mass_delete_rpc.sql` | NEW — SECURITY DEFINER 함수 |
| `doc-generator.html` | sbFetch 오류 처리 / saveConfirmationWithRetry 헬퍼 / saveToDb·saveWrToDb 리팩터 |
| `app.js` | paginatedLoad 헬퍼 신규 / 14개 select(*) 사이트 패턴 적용 / deleteAllMarketdb를 RPC로 전환 |

순서 의존성: **Task 3 (sbFetch 오류 처리)** 이 **Task 4 (retry 로직)** 보다 먼저 가야 함 — retry가 sbFetch의 throw에 의존.

---

## Phase A — SQL 마이그레이션

### Task 1: 008 — confirmations.doc_number UNIQUE 제약

**Files:**
- Create: `migrations/008_confirmations_doc_number_unique.sql`

- [ ] **Step 1: SQL 파일 작성**

```sql
-- ==========================================
-- 008 — confirmations.doc_number UNIQUE 제약
-- 게이트: Phase 3 G1
-- 영향: 동시 INSERT 시 두 번째 트랜잭션이 23505로 실패 → 클라이언트 retry로 복구
-- 주의: 실행 전 중복 점검 쿼리 반드시 통과해야 함
-- ==========================================

-- VERIFICATION (사전) ----------------------
-- 실행 전 다음 쿼리가 0행이어야 한다. 중복이 있으면 그 행들을 어떻게 처리할지
-- 사장님과 결정 후 진행할 것 (어느 row를 살리고 어느 row를 지울지).
--
-- SELECT doc_number, COUNT(*)
--   FROM confirmations
--  WHERE doc_number IS NOT NULL
--  GROUP BY doc_number HAVING COUNT(*) > 1;

ALTER TABLE confirmations
  ADD CONSTRAINT confirmations_doc_number_unique UNIQUE (doc_number);

-- VERIFICATION (사후) ----------------------
-- 제약이 만들어졌는지:
-- SELECT conname, contype FROM pg_constraint
--  WHERE conname = 'confirmations_doc_number_unique';
-- expect: 1 row, contype = 'u'

-- ROLLBACK ----------------------------------
-- ALTER TABLE confirmations DROP CONSTRAINT confirmations_doc_number_unique;
```

- [ ] **Step 2: 커밋**

```bash
git add migrations/008_confirmations_doc_number_unique.sql
git commit -m "008 마이그레이션 — confirmations.doc_number UNIQUE 제약"
```

---

### Task 2: 009 — delete_all_marketdb() RPC + 권한 체크

**Files:**
- Create: `migrations/009_market_db_mass_delete_rpc.sql`

- [ ] **Step 1: SQL 파일 작성**

```sql
-- ==========================================
-- 009 — market_db 전체 삭제 RPC + 권한 체크
-- 게이트: Phase 3 G2
-- 영향: app.js의 deleteAllMarketdb는 더 이상 client-side delete().gte('id',0) 안 함.
--       RPC 경유 → 함수 내부에서 auth.uid → profiles.name 조회 → 권한자만 실행.
-- 권한자: 이현주, 김현호, 김관택 (app.js MARKETDB_ALLOWED 와 동일)
-- ==========================================

CREATE OR REPLACE FUNCTION public.delete_all_marketdb()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_name TEXT;
    deleted_count INTEGER;
BEGIN
    -- 1) 호출자 식별
    SELECT name INTO caller_name
      FROM profiles
     WHERE auth_user_id = auth.uid();

    IF caller_name IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
    END IF;

    -- 2) 권한 체크 (MARKETDB_ALLOWED 와 동기화: 이현주, 김현호, 김관택)
    IF caller_name NOT IN ('이현주', '김현호', '김관택') THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED: % 계정에는 중고마켓DB 전체 삭제 권한이 없습니다.', caller_name
          USING ERRCODE = '42501';
    END IF;

    -- 3) 전체 삭제 + count 반환
    DELETE FROM market_db;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- anon에게는 EXECUTE 권한 주지 않음. authenticated만 호출 가능.
REVOKE ALL ON FUNCTION public.delete_all_marketdb() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_all_marketdb() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_all_marketdb() TO authenticated;

-- VERIFICATION ------------------------------
-- 1) 함수가 존재하고 권한이 authenticated에만 있는지:
-- SELECT proname, proacl FROM pg_proc WHERE proname = 'delete_all_marketdb';
--
-- 2) 권한 없는 직원(예: 유지은)으로 로그인 후 콘솔에서:
--    sb.rpc('delete_all_marketdb')
--    → error.message contains 'NOT_AUTHORIZED' 떨어져야 함
--
-- 3) 권한 있는 직원(예: 김관택)으로 로그인 후 콘솔에서:
--    (test 데이터 1행 INSERT 후) sb.rpc('delete_all_marketdb')
--    → 1 반환, market_db 빈 상태

-- ROLLBACK ----------------------------------
-- DROP FUNCTION IF EXISTS public.delete_all_marketdb();
-- 그 후 app.js의 deleteAllMarketdb를 직전 패턴(sb.from('market_db').delete().gte('id',0))으로 복원
```

- [ ] **Step 2: 커밋**

```bash
git add migrations/009_market_db_mass_delete_rpc.sql
git commit -m "009 마이그레이션 — delete_all_marketdb() RPC + 권한 체크 (SECURITY DEFINER)"
```

---

## Phase B — 코드 변경

### Task 3: #11 — `sbFetch` HTTP 오류 처리

**Files:**
- Modify: `doc-generator.html` line 411 (`sbFetch` 함수)

순서: **반드시 Task 4보다 먼저**. Task 4의 retry 로직이 sbFetch의 throw에 의존.

- [ ] **Step 1: 기존 함수 위치 확인**

```bash
grep -n "async function sbFetch" doc-generator.html
# expect: 411:async function sbFetch(path,method,body){await _authReady;...
```

- [ ] **Step 2: 함수 본문 교체**

`doc-generator.html`의 line 411 `async function sbFetch(...)` 한 줄짜리 정의를 다음 다중 라인 버전으로 교체:

```javascript
async function sbFetch(path, method, body){
  await _authReady;
  var opts = {
    method: method || 'GET',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + _currentAccessToken,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch(SB_URL + '/rest/v1/' + path, opts);

  // 204 No Content (DELETE / return=minimal) → 빈 응답
  if (res.status === 204) return null;

  // HTTP 오류 → throw
  if (!res.ok) {
    var errBody;
    try { errBody = await res.json(); } catch (_) {
      try { errBody = { message: await res.text() }; } catch (__) { errBody = {}; }
    }
    var err = new Error(errBody.message || errBody.error || ('HTTP ' + res.status));
    err.statusCode = res.status;
    err.code = errBody.code;
    err.details = errBody;
    throw err;
  }

  return res.json();
}
```

- [ ] **Step 3: 호출부 회귀 점검**

```bash
grep -n "sbFetch(" doc-generator.html | head -30
```

이미 모두 `try { await sbFetch(...) } catch (err) {...}` 구조 안에 있는지 빠르게 시각 확인. catch가 없는 raw 호출이 있으면 그 자리에 catch 추가 (기존 흐름이 깨지지 않게 — 실패 시 `showMsg('❌ ...', true)` 호출).

- [ ] **Step 4: 커밋**

```bash
git add doc-generator.html
git commit -m "doc-generator.html: sbFetch에 res.ok 체크 + 에러 throw 추가 (#11)"
```

---

### Task 4: #8 — `saveConfirmationWithRetry` + saveToDb/saveWrToDb 리팩터

**Files:**
- Modify: `doc-generator.html` 새 헬퍼 함수 추가 + saveToDb (~1255) / saveWrToDb (~1285) 본문 교체

- [ ] **Step 1: 헬퍼 함수 추가**

`doc-generator.html`에서 `sbFetch` 함수(Task 3 이후 위치) 바로 다음 줄에 새 함수 추가:

```javascript
/* === FIX #8 (Phase 3): doc_number 동시성 안전 저장 헬퍼 ===
 * 두 사용자가 같은 docNum으로 동시 INSERT 시 UNIQUE 제약(008)이 두 번째 시도를
 * 23505로 거부한다. 이 헬퍼는 23505/409를 잡고 getNextSeq()를 다시 호출해
 * 새 docNum으로 재시도한다. 최대 3회.
 *
 * 정상 UPDATE 흐름(사용자가 의도적으로 같은 docNum 재저장)은 그대로 동작.
 */
async function saveConfirmationWithRetry(docNum, data, maxRetries) {
  maxRetries = maxRetries || 3;
  for (var attempt = 0; attempt < maxRetries; attempt++) {
    // 1) 기존 행 확인
    var existing = await sbFetch(
      'confirmations?doc_number=eq.' + encodeURIComponent(docNum) + '&select=id',
      'GET'
    );

    if (existing && existing.length > 0) {
      // 정상 UPDATE 흐름
      await sbFetch('confirmations?id=eq.' + existing[0].id, 'PATCH',
                    Object.assign({}, data, { doc_number: docNum }));
      return docNum;
    }

    // 2) 신규 INSERT 시도
    try {
      await sbFetch('confirmations', 'POST',
                    Object.assign({}, data, { doc_number: docNum }));
      return docNum;
    } catch (e) {
      var isConflict = (e.statusCode === 409)
                    || (e.code === '23505')
                    || (e.message && e.message.toLowerCase().indexOf('duplicate') >= 0)
                    || (e.message && e.message.toLowerCase().indexOf('unique') >= 0);
      if (!isConflict) throw e;

      // 다른 사용자가 docNum을 먼저 잡음 → 새 번호로 재시도
      var nextSeq = await getNextSeq();
      docNum = Y + '_' + String(nextSeq).padStart(4, '0');
      var seqInput = document.getElementById('docSeq');
      if (seqInput) {
        seqInput.value = nextSeq;
        if (typeof updateDocNum === 'function') updateDocNum();
      }
    }
  }
  throw new Error('문서번호 할당 실패 — 동시 저장이 너무 잦습니다. 잠시 후 다시 시도해주세요.');
}
```

- [ ] **Step 2: `saveToDb` 본문에서 기존 패턴 교체**

`saveToDb()` 함수 안의 다음 블록 (대략 line 1259~1270):
```javascript
try{
    /* 같은 문서번호 존재 여부 확인 */
    var existing=await sbFetch('confirmations?doc_number=eq.'+encodeURIComponent(docNum)+'&select=id','GET');
    if(existing&&existing.length>0){
      /* 덮어쓰기 (UPDATE) */
      await sbFetch('confirmations?id=eq.'+existing[0].id,'PATCH',data);
      showMsg('✅ 업데이트 완료! ('+docNum+')');
    }else{
      /* 신규 저장 (INSERT) */
      await sbFetch('confirmations','POST',data);
      showMsg('✅ 저장 완료! ('+docNum+')');
    }
```

다음으로 교체:
```javascript
try{
    var savedDocNum = await saveConfirmationWithRetry(docNum, data);
    if (savedDocNum !== docNum) {
      showMsg('✅ 저장 완료 — 다른 사용자가 같은 번호를 먼저 사용해 ' + savedDocNum + ' 로 자동 변경되었습니다.');
      docNum = savedDocNum;
    } else {
      showMsg('✅ 저장 완료! (' + docNum + ')');
    }
```

- [ ] **Step 3: `saveWrToDb` 본문에서 기존 패턴 교체**

`saveWrToDb()` 함수 안의 다음 블록 (대략 line 1321~1328):
```javascript
try{
    var existing=await sbFetch('confirmations?doc_number=eq.'+encodeURIComponent(docNum)+'&select=id','GET');
    if(existing&&existing.length>0){
      await sbFetch('confirmations?id=eq.'+existing[0].id,'PATCH',data);
      showMsg('✅ 작업요청서 업데이트 완료! ('+docNum+')');
    }else{
      await sbFetch('confirmations','POST',data);
      showMsg('✅ 작업요청서 저장 완료! ('+docNum+')');
    }
```

다음으로 교체:
```javascript
try{
    var savedDocNum = await saveConfirmationWithRetry(docNum, data);
    if (savedDocNum !== docNum) {
      showMsg('✅ 작업요청서 저장 완료 — 다른 사용자가 같은 번호를 먼저 사용해 ' + savedDocNum + ' 로 자동 변경되었습니다.');
      docNum = savedDocNum;
    } else {
      showMsg('✅ 작업요청서 저장 완료! (' + docNum + ')');
    }
```

- [ ] **Step 4: 커밋**

```bash
git add doc-generator.html
git commit -m "doc-generator.html: saveConfirmationWithRetry 헬퍼 + DC/WR 저장 흐름 race-safe 리팩터 (#8)"
```

---

### Task 5: #9 — `deleteAllMarketdb`를 RPC 호출로 전환

**Files:**
- Modify: `app.js` 함수 `deleteAllMarketdb()` (~line 8658)

- [ ] **Step 1: 기존 함수 위치 확인**

```bash
grep -n "async function deleteAllMarketdb" app.js
# expect: 8658:async function deleteAllMarketdb() {
```

- [ ] **Step 2: 본문에서 delete 호출 부분 교체**

`deleteAllMarketdb()` 안의 다음 블록 (대략 line 8668~8675):
```javascript
    try {
        // gte('id', 0) — 전체 행 매칭 (Postgres bigserial은 항상 양수)
        const { error } = await sb.from('market_db').delete().gte('id', 0);
        if (error) throw error;
        // 본인 메모리도 즉시 비우기 (Realtime 이벤트도 오겠지만 즉시성 확보)
        MARKETDB = { watch: [], goods: [], misc: [] };
        renderMarketdb();
```

다음으로 교체:
```javascript
    try {
        // RPC 함수로 이전 — 함수 내부에서 권한 체크(이현주/김현호/김관택만 실행 가능)
        const { data, error } = await sb.rpc('delete_all_marketdb');
        if (error) {
            // 권한 에러를 한국어로 매핑
            if (error.message && error.message.indexOf('NOT_AUTHORIZED') >= 0) {
                throw new Error('이 계정에는 전체 삭제 권한이 없습니다.');
            }
            if (error.message && error.message.indexOf('NOT_AUTHENTICATED') >= 0) {
                throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
            }
            throw error;
        }
        const deletedCount = data || 0;
        // 본인 메모리도 즉시 비우기 (Realtime 이벤트도 오겠지만 즉시성 확보)
        MARKETDB = { watch: [], goods: [], misc: [] };
        renderMarketdb();
        showToast(deletedCount + '건 삭제 완료');
```

⚠️ 교체 후 그 아래에 이미 `showToast(...)` 같은 성공 메시지가 또 있으면 중복되지 않게 조정 (원본 함수의 success path를 한 번 더 읽어보고 교체할 것).

- [ ] **Step 3: `node --check app.js`**

```bash
node --check app.js
```

- [ ] **Step 4: 커밋**

```bash
git add app.js
git commit -m "app.js: deleteAllMarketdb를 RPC(delete_all_marketdb)로 전환 + 권한 에러 한국어 매핑 (#9)"
```

---

### Task 6: #10 — `paginatedLoad` 공통 헬퍼 추가

**Files:**
- Modify: `app.js` (캐시 헬퍼 `cacheRead/cacheWrite` 근처, 대략 line 37 직후)

- [ ] **Step 1: 헬퍼 함수 추가**

`app.js`의 `cacheWrite` 함수 정의(대략 line 33~37) 바로 다음 줄에 추가:

```javascript
// =====================================
// 🔢 paginatedLoad — 큰 테이블 단계적 로드 헬퍼 (Phase 3 #10)
// =====================================
// 사용 예:
//   const page = await paginatedLoad('deliveries', {
//       pageSize: 200,
//       orderBy: 'date', orderDir: 'desc',
//       secondaryOrderBy: 'id', secondaryOrderDir: 'desc',
//       select: '*'
//   });
//   page.data           // 첫 페이지 결과 배열
//   page.total          // 서버상 총 행 수 (count: 'exact')
//   page.hasMore        // page.data.length < page.total
//   page.loadMore()     // 다음 페이지를 fetch해서 page.data에 append, hasMore 갱신
async function paginatedLoad(table, options) {
    options = options || {};
    const pageSize = options.pageSize || 200;
    const orderBy = options.orderBy || 'id';
    const orderDir = options.orderDir || 'desc';
    const secondaryOrderBy = options.secondaryOrderBy || null;
    const secondaryOrderDir = options.secondaryOrderDir || 'asc';
    const selectClause = options.select || '*';
    const filters = options.filters || []; // [{col, op, val}]

    function buildQuery(start, end) {
        let q = sb.from(table)
            .select(selectClause, { count: 'exact' })
            .order(orderBy, { ascending: orderDir === 'asc' });
        if (secondaryOrderBy) {
            q = q.order(secondaryOrderBy, { ascending: secondaryOrderDir === 'asc' });
        }
        filters.forEach(f => { q = q[f.op](f.col, f.val); });
        q = q.range(start, end);
        return q;
    }

    const first = await buildQuery(0, pageSize - 1);
    if (first.error) throw first.error;

    const state = {
        data: first.data || [],
        total: typeof first.count === 'number' ? first.count : (first.data ? first.data.length : 0),
        pageSize: pageSize,
        get hasMore() { return this.data.length < this.total; },
        loadMore: async function () {
            if (!this.hasMore) return this;
            const start = this.data.length;
            const end = start + this.pageSize - 1;
            const next = await buildQuery(start, end);
            if (next.error) throw next.error;
            (next.data || []).forEach(r => this.data.push(r));
            if (typeof next.count === 'number') this.total = next.count;
            return this;
        }
    };
    return state;
}
```

- [ ] **Step 2: 문법 점검**

```bash
node --check app.js
```

- [ ] **Step 3: 커밋**

```bash
git add app.js
git commit -m "app.js: paginatedLoad 공통 헬퍼 추가 (#10 페이지네이션 기반)"
```

---

### Task 7: #10 — 14개 select(*) 사이트에 `paginatedLoad` 적용

순서: 한 사이트씩 작업하지 말고, 매트릭스 기반으로 한 commit에 일괄 변경. 패턴이 동일하므로.

**Files:**
- Modify: `app.js` (14개 사이트)

- [ ] **Step 1: 적용 매트릭스 확인**

| Line (approx) | 테이블 | pageSize | orderBy | orderDir | 비고 |
|---|---|---|---|---|---|
| 603 | url_shortcuts | 200 | sort_order | asc | secondary: id asc |
| 4720 | projects_domestic | 200 | created_at | desc | |
| 4836 | daily_tasks | 100 | id | asc | (현재 ascending: true) |
| 5116 | deliveries | 200 | date | desc | secondary: id desc |
| 5211 | clients | 500 | name | asc | (현재 select 패턴 확인 필요) |
| 5794 | clients_overseas | 500 | name | asc | (확인 필요) |
| 6087 | marketing_campaigns | 200 | created_at | desc | |
| 7054 | (확인 필요 — product_categories?) | — | — | — | |
| 7162 | (확인 필요 — products) | 500 | name | asc | |
| 8632 | market_db | 500 | id | asc | |
| 9384 | projects_temp | 200 | created_at | desc | |
| 10643 | planning_projects | 100 | created_at | desc | |
| 10644 | planning_posts | 300 | created_at | asc | |
| 12777 | quotes | 200 | doc_date | desc | secondary: id desc |
| 14440 | margin_simulations | 100 | updated_at | desc | |

⚠️ Line 7054, 7162 는 실제로 어떤 테이블인지 현재 코드 다시 확인 필요. `sb.from('xxx').select('*')` 패턴이 아니라 다른 select 절일 수도 있음. 작업 전 grep 한 번 더.

- [ ] **Step 2: 각 사이트별 변경 패턴**

기존 패턴:
```javascript
const { data, error } = await sb.from('<table>').select('*').order(...);
if (error) {...}
<arr>.length = 0;
data.forEach(r => <arr>.push(r));
```

변경 패턴:
```javascript
const page = await paginatedLoad('<table>', {
    pageSize: <N>,
    orderBy: '<col>',
    orderDir: '<asc|desc>',
    secondaryOrderBy: '<col or null>',
    secondaryOrderDir: '<asc|desc>'
});
<arr>.length = 0;
page.data.forEach(r => <arr>.push(r));
<arrPagination> = page; // 추후 "더 보기" 버튼이 참조
```

- [ ] **Step 3: 페이지 상태 보관 + "더 보기" 버튼 통합**

각 사이트별 렌더 함수에서:
1. 모듈 스코프에 `_<table>Pagination` 같은 변수 두기 (예: `_deliveriesPagination`)
2. 로드 후 위 변수에 page 객체 저장
3. 테이블 렌더 함수의 마지막 행 직후 (또는 표 컨테이너의 하단)에 다음 버튼 추가:

```javascript
function renderLoadMoreButton(container, pageState, onAfterLoad) {
    // 기존 더보기 버튼 제거
    const existing = container.querySelector('.load-more-btn');
    if (existing) existing.remove();
    if (!pageState || !pageState.hasMore) return;
    const btn = document.createElement('button');
    btn.className = 'load-more-btn';
    btn.style.cssText = 'display:block;margin:12px auto;padding:8px 24px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;';
    btn.textContent = '남은 ' + (pageState.total - pageState.data.length) + '건 더 보기';
    btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = '로딩 중...';
        try {
            await pageState.loadMore();
            if (typeof onAfterLoad === 'function') onAfterLoad();
        } catch (e) {
            showToast('추가 로드 실패: ' + (e.message || e));
        }
    };
    container.appendChild(btn);
}
```

`renderLoadMoreButton` 정의는 paginatedLoad 헬퍼 바로 다음에 한 번만 추가.

- [ ] **Step 4: 호출부 통합 예시 — deliveries 한 사이트로 패턴 검증**

`loadDeliveriesFromDb`(대략 line 5110~5130) 변경 후 모양:
```javascript
async function loadDeliveriesFromDb() {
    try {
        let filters = [];
        // (기존 연도/월 필터링 로직이 있다면 filters 배열에 push)
        _deliveriesPagination = await paginatedLoad('deliveries', {
            pageSize: 200,
            orderBy: 'date', orderDir: 'desc',
            secondaryOrderBy: 'id', secondaryOrderDir: 'desc',
            filters: filters
        });
        deliveries.length = 0;
        _deliveriesPagination.data.forEach(r => deliveries.push(r));
        cacheWrite('deliveries', deliveries);
    } catch (e) {
        console.error('deliveries 로드:', e);
    }
}
```

그리고 `renderDeliveries` 함수의 마지막 부분에 (표 컨테이너 변수가 `deliveriesTable` 같은 형태일 것):
```javascript
// 표 렌더 끝난 후, 표 컨테이너 바로 아래에 더 보기 버튼 부착
const containerForLoadMore = document.getElementById('deliveriesContainer'); // 실제 컨테이너 id
renderLoadMoreButton(containerForLoadMore, _deliveriesPagination, () => {
    deliveries.length = 0;
    _deliveriesPagination.data.forEach(r => deliveries.push(r));
    renderDeliveries(); // 재렌더 (loop 방지: renderLoadMoreButton은 기존 버튼 제거 후 다시 부착)
});
```

⚠️ **실제 컨테이너 ID는 코드에서 확인 후 사용**. `deliveriesContainer`는 가정.

- [ ] **Step 5: 나머지 13개 사이트에 동일 패턴 적용**

각 사이트별로:
1. `sb.from('X').select('*')...` 부분을 `paginatedLoad('X', {...})` 호출로 교체
2. 모듈 스코프 변수 `_<X>Pagination` 추가하여 page 객체 보관
3. 해당 테이블 렌더 함수 끝에 `renderLoadMoreButton(컨테이너, _<X>Pagination, () => 재렌더)` 추가
4. 컨테이너 ID는 코드에서 실제 확인 (가정 금지)

⚠️ 일부 사이트는 페이지네이션이 부적합할 수 있음 (예: 자동완성 dropdown용 데이터). 해당 사이트 발견 시:
- 옵션 A: 그대로 paginatedLoad 적용하되 pageSize를 1000 정도로 크게 (사실상 cap 역할)
- 옵션 B: 페이지네이션 미적용, `.limit(1000)`만 추가하여 safety cap

DONE_WITH_CONCERNS로 보고하고 옵션 선택 요청.

- [ ] **Step 6: 문법 점검**

```bash
node --check app.js
```

- [ ] **Step 7: 커밋**

```bash
git add app.js
git commit -m "app.js: 14개 select(*) 사이트에 paginatedLoad + 더보기 버튼 적용 (#10)"
```

---

## Phase C — 실행 런북

> ⚠️ 이 Phase는 사장님 협업. SQL은 Supabase Dashboard에서 직접 실행, 코드는 Vercel 자동 배포 (push 시점).

### Task 8: 008 SQL 실행 + 사전 점검 + Gate G1

- [ ] **Step 1: 사전 점검 — doc_number 중복 확인**

Supabase SQL Editor:
```sql
SELECT doc_number, COUNT(*) FROM confirmations
 WHERE doc_number IS NOT NULL
 GROUP BY doc_number HAVING COUNT(*) > 1;
```

기대: 0행. 만약 중복 발견되면:
- 어느 행을 살리고 어느 행을 지울지 결정
- 결정 후 `DELETE FROM confirmations WHERE id IN (...)` 또는 `UPDATE confirmations SET doc_number = '<unique>' WHERE id = <id>` 로 정리
- 다시 위 쿼리 재실행 → 0행 확인 후 다음 단계

- [ ] **Step 2: 008 SQL 실행**

`migrations/008_confirmations_doc_number_unique.sql` 내용 복사·붙여넣기 → Run.

- [ ] **Step 3: Gate G1 검증**

```sql
SELECT conname, contype FROM pg_constraint
 WHERE conname = 'confirmations_doc_number_unique';
```
기대: 1행, contype = 'u'.

---

### Task 9: 009 SQL 실행 + Gate G2

- [ ] **Step 1: 009 SQL 실행**

`migrations/009_market_db_mass_delete_rpc.sql` → Run.

- [ ] **Step 2: 함수 존재 확인**

```sql
SELECT proname, pronargs FROM pg_proc WHERE proname = 'delete_all_marketdb';
```
기대: 1행, pronargs = 0.

```sql
SELECT proacl FROM pg_proc WHERE proname = 'delete_all_marketdb';
```
기대: `{authenticated=X/postgres}` 같은 ACL이 보임 (anon 없음).

---

### Task 10: 코드 푸시 + Vercel 자동 배포

- [ ] **Step 1: 푸시**

```bash
git push origin master
```

- [ ] **Step 2: Vercel 배포 대기**

Vercel 대시보드에서 가장 최근 deployment가 **Ready** 될 때까지 대기 (1~2분).

---

### Task 11: Gate G3 — 동시 저장 시뮬레이션

- [ ] **Step 1: 두 브라우저 준비**

사장님 PC: Chrome 일반 창 (김관택 로그인) + 시크릿 창 (또 다른 직원 계정으로 로그인 — 협조 부탁)

또는 사장님 혼자: 두 시크릿 창에서 각각 김관택, 이현주 등으로 로그인

- [ ] **Step 2: 동시 저장 시도**

- 두 창 다 `doc-generator.html` 열고 같은 docSeq(예: 0050) 설정
- 두 창의 "저장" 버튼을 가능한 한 동시에 클릭

- [ ] **Step 3: 결과 확인**

기대 시나리오:
- 한 창: "✅ 저장 완료! (2605_0050)"
- 다른 창: "✅ 저장 완료 — 다른 사용자가 같은 번호를 먼저 사용해 2605_0051 로 자동 변경되었습니다."

또는 사용자가 너무 빨라서 둘 다 첫 시도는 race를 못 잡고 한 명만 retry — 어느 패턴이든 양쪽이 다른 docNum으로 모두 성공 저장되어야 함.

확인 쿼리:
```sql
SELECT doc_number, company_name, created_at FROM confirmations
 WHERE doc_number LIKE 'YYMM_005%' ORDER BY doc_number;
```
2605 자리에 현재 연월 (예: 2605 = 2026년 5월).

---

### Task 12: Gate G4 — 페이지네이션 동작

- [ ] **Step 1: deliveries 화면 확인**

택배 관리 페이지 진입 → 표가 200건 이하면 더보기 버튼 없음, 200건 초과면 "남은 X건 더 보기" 버튼 보임.

- [ ] **Step 2: 더보기 클릭**

버튼 클릭 → 추가 200건 로드 → 표가 길어지고 버튼 텍스트가 갱신됨.

- [ ] **Step 3: 다른 화면 1~2개도 동일 확인**

예: 거래처(국내) 500건, 일일계획표(100건) 등.

---

### Task 13: Gate G5 — mass delete RPC 권한 시나리오

- [ ] **Step 1: 권한자 시나리오**

사장님(김관택) 또는 이현주/김현호 계정으로 로그인 → 중고마켓DB 메뉴 → 전체 삭제 시도 (테스트 데이터 1~2건 미리 INSERT 후).
- 정상 confirm + prompt 통과 → "N건 삭제 완료" 토스트

- [ ] **Step 2: 비권한자 시나리오 (콘솔 우회 시도)**

유지은 또는 구정두 계정으로 로그인 → F12 → Console:
```javascript
const r = await sb.rpc('delete_all_marketdb');
console.log(r);
```

기대: `r.error.message` 에 `NOT_AUTHORIZED` 또는 한국어 "권한이 없습니다" 포함.

- [ ] **Step 3: anon 시나리오 (로그아웃 상태)**

시크릿 창 비로그인 상태 → 콘솔:
```javascript
const sb2 = window.supabase.createClient('https://vtulmuxkriklpiibiues.supabase.co', '<anon_key>');
const r = await sb2.rpc('delete_all_marketdb');
console.log(r);
```

기대: 401 또는 permission denied (anon에게 EXECUTE 권한 없음).

---

### Task 14: Gate G6 — sbFetch 오류 throw 확인

- [ ] **Step 1: 의도적 잘못된 path 호출**

`doc-generator.html`을 열고 F12 → Console:
```javascript
sbFetch('confirmations?nonexistent_column=eq.1', 'GET').then(r => console.log('OK', r)).catch(e => console.log('ERR', e.message, e.statusCode));
```

기대: `ERR` 로그가 찍히며 `e.statusCode`가 400 또는 404, `e.message`에 PostgREST 에러 메시지.

- [ ] **Step 2: 의도적 23505 충돌 시뮬레이션**

(선택) 강제로 같은 docNum 두 번 POST:
```javascript
const data = { doc_number: '9999_9999', doc_date: '2026-05-19', company_name: 'TEST', title: 'TEST', manager: 'TEST' };
await sbFetch('confirmations', 'POST', data); // 첫 번째 성공
await sbFetch('confirmations', 'POST', data); // 두 번째 → 409 throw 확인
```

테스트 후 정리:
```sql
DELETE FROM confirmations WHERE doc_number = '9999_9999';
```

---

## 자가 점검

**Spec coverage:**
- ✅ D1 (4건 일괄) — Task 1~7 모두 한 Phase로 묶음
- ✅ D2 (#8 UNIQUE + retry) — Task 1 (SQL), Task 4 (helper)
- ✅ D3 (#9 RPC + 권한) — Task 2 (SQL), Task 5 (app.js)
- ✅ D4 (#10 더보기 패턴) — Task 6 (helper), Task 7 (적용)
- ✅ D5 (#11 res.ok throw) — Task 3
- ✅ Gate G1~G6 — Task 8, 9, 11, 12, 13, 14 (Task 10은 배포 자체)
- ✅ 롤백 시나리오 — 각 SQL 하단 ROLLBACK 섹션, 코드는 Vercel rollback

**Placeholder scan:**
- Task 7 Step 1의 line 7054, 7162는 "확인 필요" 표시 — 실제로는 implementer가 grep해서 확정해야 하는 부분. 이는 plan 작성 시점에서 확정할 수 없는 정보 (작업자가 현재 코드 본 후 결정해야 함). 받아들임.
- Task 7 Step 4의 컨테이너 ID `deliveriesContainer`도 가정. implementer가 실제 ID 확인하라고 명시.

**Type consistency:**
- `paginatedLoad` 반환값 구조(`{data, total, hasMore, loadMore, pageSize}`)가 Task 6 정의와 Task 7 사용처 일관.
- `renderLoadMoreButton(container, pageState, onAfterLoad)` 시그니처 Task 7 내부 일관.
- `saveConfirmationWithRetry(docNum, data, maxRetries)` 시그니처 Task 4 정의/사용 일관.
- RPC `delete_all_marketdb` 반환 타입 INTEGER (deleted count), app.js에서 `data || 0`로 받음. 일관.
