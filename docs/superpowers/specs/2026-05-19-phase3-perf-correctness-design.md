# Phase 3 — 성능 / 정합성 보강 설계서

**작성일**: 2026-05-19
**범위**: Codex 보안 리뷰 Medium 4건 (#8 문서번호 동시성 / #9 mass delete 가드 / #10 select(*) 페이지네이션 / #11 sbFetch 오류처리)
**전제**: Phase 1 (Supabase Auth + RLS 잠금) 완료. 인증된 직원만 내부 테이블 접근 가능.

---

## 1. 배경

Phase 1 완료 후 남은 Codex Medium 지적 4건. 외부 공격 표면은 닫혔지만, 운영 품질·정합성·성능 측면 부채.

| # | 항목 | 영향 |
|---|---|---|
| 8 | 문서번호 race (`doc-generator.html`) | 동시 저장 시 같은 doc_number → 후행이 선행을 PATCH로 덮어쓰기 (데이터 손실) |
| 9 | mass delete (`app.js market_db`) | UI 가드는 있으나 콘솔 한 줄로 우회 가능. 직원이 의도치 않게 또는 악의로 전체 삭제 |
| 10 | `select('*')` 14곳 | 데이터 증가 시 초기 로딩 느려짐. 가장 큰 곳: planning (projects + posts 동시) |
| 11 | `sbFetch` HTTP 오류 무시 | 4xx/5xx 응답 본문도 정상 데이터처럼 반환 → 호출부가 실패를 성공으로 오인 |

## 2. 결정사항

| # | 결정 | 선택 |
|---|---|---|
| D1 | scope | 4건 일괄 처리 (단일 Phase) |
| D2 | #8 방식 | DB UNIQUE 제약 + 클라이언트 retry (RPC 도입 안 함) |
| D3 | #9 방식 | RPC `delete_all_marketdb()` + 함수 내부 권한 체크 (auth.uid → profiles.name 조회) |
| D4 | #10 패턴 | "최근 N개 + 더 보기 버튼" (페이지 번호 / 무한 스크롤 미채택) |
| D5 | #11 방식 | `sbFetch`에 `res.ok` 체크 + 에러 throw로 호출부 catch 흐름 활성화 |

## 3. 항목별 설계

### 3.1 #8 — 문서번호 동시성

**DB 변경**: `migrations/008_confirmations_doc_number_unique.sql`
- 사전 점검 쿼리로 기존 중복 발견 (있으면 사장님과 데이터 정리 후 진행)
- `ALTER TABLE confirmations ADD CONSTRAINT confirmations_doc_number_unique UNIQUE (doc_number)`

**doc-generator.html 코드 변경**:
- `saveToDb()`, `saveWrToDb()`의 "existing check → POST/PATCH" 패턴을 공통 헬퍼 `saveConfirmationWithRetry(docNum, data, maxRetries=3)`로 추출
- INSERT 시 23505/409 받으면 `getNextSeq()` 재호출 후 새 docNum으로 retry
- 최대 3회 시도, 실패 시 사용자에게 "잠시 후 다시 시도해주세요" 안내
- retry 시 화면의 `docSeq` input도 갱신 → 사용자가 변경 인지 가능

### 3.2 #9 — mass delete (RPC + 권한 체크)

**DB 변경**: `migrations/009_market_db_mass_delete_rpc.sql`
- `delete_all_marketdb()` RPC 함수 생성 (`SECURITY DEFINER`)
- 함수 본문에서 `auth.uid()` → `profiles.name` 조회 → `이현주/김현호/김관택`이 아니면 `RAISE EXCEPTION` 던짐
- `DELETE FROM market_db` 실행 + 삭제 행 수 반환
- 추가 RLS 변경: `market_db`의 DELETE 정책을 분할
  - 단건 DELETE (id 명시) → `authenticated` 허용 (기존 `dbMarketDelete` 호환)
  - 다건 DELETE → 차단 (UNRESTRICTED DELETE WHERE 비교 가능한 RLS 정책은 없으므로 정책 분리 대신 RPC 경유 강제)
  - 실용적 절충: market_db DELETE 정책은 그대로 두되 UI에서 RPC 호출로 전환. 진짜 강제하려면 service_role 또는 별도 admin role 도입 필요 (Phase 3 범위 밖)

**app.js 코드 변경**:
- `deleteAllMarketdb()` 함수의 `sb.from('market_db').delete().gte('id', 0)` 부분을 `sb.rpc('delete_all_marketdb')` 호출로 교체
- 응답으로 받은 삭제 행 수를 토스트에 표시
- 권한 에러 (RAISE EXCEPTION) 시 한국어 메시지로 변환

### 3.3 #10 — 페이지네이션

**패턴**: 모든 대상 14곳에 다음 패턴 적용
```js
const PAGE_SIZE = N; // 테이블별로 다름 (아래 매트릭스)
const { data, error } = await sb.from('<table>')
    .select('<필요한 컬럼만, 또는 *>', { count: 'exact' })
    .order('<적절한 컬럼>', { ascending: false })
    .range(0, PAGE_SIZE - 1);
// total count와 함께 데이터 저장, "더 보기" 버튼은 현재 보유 행 수 < total 일 때만 표시
```

**테이블별 초기 페이지 크기 매트릭스**:

| 테이블 | 초기 N | 정렬 키 | 비고 |
|---|---|---|---|
| `url_shortcuts` | 200 | sort_order, id | 작음, 한 번에 다 로드해도 됨 |
| `projects_domestic` | 200 | created_at DESC | 활성 프로젝트는 보통 50개 이하 |
| `daily_tasks` | 100 | id DESC | 일일 사용, 최근 것만 |
| `deliveries` | 200 | date DESC, id DESC | 누적 큼, 최근 우선 |
| `clients` | 500 | name ASC | 거래처 목록, 알파벳순 |
| `clients_overseas` | 500 | name ASC | 거래처 목록 |
| `marketing_campaigns` | 200 | created_at DESC | |
| `products` | 500 | name ASC | 제안서 작성 시 검색용, 충분한 양 필요 |
| `market_db` | 500 | id ASC | 카테고리별 분류, 500이면 보통 충분 |
| `projects_temp` | 200 | created_at DESC | |
| `planning_projects` | 100 | created_at DESC | 보통 적음 |
| `planning_posts` | 300 | created_at ASC | 포스트는 누적, 프로젝트당 30개 가정 시 10개 프로젝트 |
| `quotes` | 200 | doc_date DESC, id DESC | |
| `margin_simulations` | 100 | updated_at DESC | |
| `confirmations` (doc-generator) | 200 | created_at DESC | |

**"더 보기" UI**:
- 각 테이블 렌더 함수에서 마지막 행 아래에 버튼 표시
- 버튼 텍스트: `남은 X건 더 보기` (X = total - 현재 로드 수)
- 클릭 시 `range(currentCount, currentCount + PAGE_SIZE - 1)` 추가 fetch → 배열에 append → 재렌더

**구현 헬퍼**:
- `app.js`에 공통 헬퍼 `paginatedLoad(table, options)` 추가
- options: `pageSize`, `orderBy`, `orderDir`, `select`, `additionalFilters`
- 반환: `{ data, total, hasMore, loadMore: async () => {...} }`
- 각 호출 사이트에서 이 헬퍼 사용

### 3.4 #11 — sbFetch HTTP 오류 처리

**doc-generator.html 코드 변경** (line ~411):

현재:
```js
async function sbFetch(path,method,body){
  await _authReady;
  var opts={method:method||'GET',headers:{...}};
  if(body)opts.body=JSON.stringify(body);
  var res=await fetch(SB_URL+'/rest/v1/'+path,opts);
  return res.json()
}
```

변경:
```js
async function sbFetch(path, method, body){
  await _authReady;
  var opts = { method: method || 'GET', headers: {...} };
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch(SB_URL + '/rest/v1/' + path, opts);
  
  // 204 No Content (DELETE, 일부 PATCH/POST with Prefer: return=minimal) → 빈 응답
  if (res.status === 204) return null;
  
  // HTTP 오류 → throw
  if (!res.ok) {
    var errBody;
    try { errBody = await res.json(); } catch (_) { errBody = { message: await res.text() }; }
    var err = new Error(errBody.message || errBody.error || `HTTP ${res.status}`);
    err.statusCode = res.status;
    err.code = errBody.code;
    err.details = errBody;
    throw err;
  }
  
  // 정상 응답
  // GET 빈 결과는 [] (json 파싱), 204는 위에서 처리, 그 외는 json
  return res.json();
}
```

호출부 점검: doc-generator.html 내 sbFetch 호출 사이트 전수 조사 → 모두 이미 try/catch에 둘러싸여 있는지 확인. 없으면 추가. (대부분 saveToDb/saveWrToDb 안에 try/catch 있음)

`loadClientsDatalist()` 안의 raw `fetch` 호출도 같은 패턴으로 정리.

## 4. 영향 면적

| 종류 | 개수 |
|---|---|
| SQL 마이그레이션 신규 | 2 (008, 009) |
| `app.js` 함수 변경 | 14 (각 select(*) 사이트) + 1 (deleteAllMarketdb) + 1 신규 헬퍼 (paginatedLoad) |
| `doc-generator.html` 변경 | 3 함수 (saveToDb, saveWrToDb, sbFetch) + 1 신규 (saveConfirmationWithRetry) |
| RLS 정책 변경 | 0 (009의 RPC는 SECURITY DEFINER로 RLS 우회) |

## 5. 검증 게이트

| Gate | 시점 | 통과 조건 |
|---|---|---|
| G1 | 008 SQL 실행 후 | confirmations.doc_number에 UNIQUE 제약 존재 (정보 스키마 확인) |
| G2 | 009 SQL 실행 후 | `delete_all_marketdb()` 함수 존재, 권한 없는 직원으로 호출 시 EXCEPTION |
| G3 | doc-generator 배포 후 | 두 브라우저에서 동시 저장 시뮬레이션 → 한 쪽은 number 자동 +1로 재할당되어 둘 다 저장 성공 |
| G4 | app.js 배포 후 | 페이지네이션 적용 화면(예: deliveries)에서 첫 N건만 로드, 스크롤하지 않고 "더 보기" 표시 |
| G5 | app.js 배포 후 | 권한자(이현주/김현호/김관택) mass delete UI 정상 작동, 비권한자(유지은/구정두) 콘솔에서 직접 RPC 호출 시 권한 에러 |
| G6 | doc-generator 배포 후 | 임의로 잘못된 path로 sbFetch 호출 시 에러 throw → catch 블록에서 한국어 에러 표시 |

## 6. 롤백

| 단계 | 롤백 |
|---|---|
| 008 (UNIQUE) | `ALTER TABLE confirmations DROP CONSTRAINT confirmations_doc_number_unique;` |
| 009 (RPC) | `DROP FUNCTION delete_all_marketdb();` + app.js에서 RPC 호출 부분만 원복 |
| 코드 변경 | Vercel 직전 deployment로 instant rollback (각 함수가 독립 commit이라 부분 revert도 가능) |

## 7. 작업 윈도우

- 실제 작업: 4~6시간 (가장 큰 항목 #10이 14개 사이트 변경)
- 검증 포함: 6~8시간
- 추천: 오프타임에 한 번에 진행
- 실시간 사용자 영향: 매우 적음. SQL 008/009는 무 영향. 코드 변경은 배포 시 평소처럼 1~2분 단절.

## 8. 사장님이 해야 하는 작업

1. 008 SQL 실행 + 사전 점검 (중복 doc_number 있으면 정리 결정)
2. 009 SQL 실행
3. 코드 배포 후 G3 동시 저장 시뮬레이션 1회 (사장님 + 다른 직원 협조)
4. G5 권한 시나리오 확인 (유지은이나 구정두에게 콘솔 RPC 호출 시도 부탁 — 또는 사장님이 그들 계정으로 직접 시도)

직원분들이 해야 할 일: 0개 (변화 없는 UX).

## 9. 향후 작업

Phase 3 완료 후 남는 것:
- Phase 2 (XSS 봉합) — Codex High 3건. 외부 공격 표면 최소화. 5인 신뢰 모델 + Phase 1 잠금으로 risk 격하되었으나 여전히 권장.
- 운영 중 데이터가 14개 페이지 크기 한계를 자주 초과하면, 해당 테이블에 검색·필터 UI 추가 검토
