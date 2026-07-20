# KLP 대시보드 → 멀티테넌트 SaaS 1단계 (기반 공사) 설계

작성일: 2026-07-20

## 목적
KLP 전용 단일 회사 대시보드를 **여러 회사가 각자 칸막이 안에서 쓰는 제품**으로 바꾼다.
1단계 목표는 **판매 가능한 "복제형" 경험** — 운영자가 회사·직원을 수동 등록해 넘겨주는 방식.
나중에 가입 페이지 + 결제만 붙이면 자동형 SaaS가 되도록 기반을 만든다.

## 절대 제약 (최우선)
**KLP 실서비스는 이 공사 내내 정상 동작해야 한다.** 무중단 이전.
→ 모든 스키마 변경은 "추가 → 백필 → 조이기" 순서로, 각 단계가 그 자체로 안전하게(기존 코드가 안 깨지게) 진행한다.
→ 모든 마이그레이션은 Supabase **브랜치에서 먼저 검증** 후 프로덕션 적용.

## 목표 고객 / 상품 범위
- 첫 고객: **일반 사무직 회사(업종 무관)**.
- 판매 핵심 모듈: **일일계획표 · 회의록(+이행 점검) · 거래처/고객 관리 · 프로젝트/일감 관리**.
- KLP 전용 모듈(로젠택배 엑셀, 굿즈 마진계산기, 디자인확인서/작업요청서 생성기, 견적·제안서)은 **모듈 토글로 꺼둠** — 삭제하지 않고 KLP 회사에서만 켬. 업종별 모듈팩은 3단계.

---

## 아키텍처 개요
한 줄 요약: **"회사(company)"를 최상위 개념으로 넣고, 모든 데이터 행에 `company_id` 꼬리표를 달아 DB(RLS)가 회사 간 격리를 강제한다. KLP는 `company_id = 1`이 된다.**

핵심 설계 선택 3가지:
1. **격리는 DB가 강제** — 앱 코드 실수로도 다른 회사 데이터가 새지 않도록 RLS가 `company_id = current_company_id()`로 막는다. 앱을 신뢰하지 않는다.
2. **INSERT 시 company_id는 DB 트리거가 자동 기입** — 앱의 수많은 insert 코드를 일일이 고치는 위험을 없앤다. `BEFORE INSERT` 트리거가 `current_company_id()`로 채운다.
3. **직원·담당자·브랜딩·모듈은 코드가 아니라 데이터** — 회사마다 다르므로 전부 DB(`companies`, `profiles`)에서 읽어 렌더.

---

## A. 회사별 칸막이 (멀티테넌트 격리)

### A-1. `companies` 테이블 (신규)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigserial PK | 회사 번호. KLP = 1 |
| name | text | 회사명 (내부 식별) |
| settings | jsonb | 브랜딩·모듈 설정 (아래 C 참조) |
| plan | text | 요금제 라벨 (지금은 표시용, 'free'/'pro' 등) |
| active | boolean default true | 정지/해지 처리용 |
| created_at | timestamptz default now() |

### A-2. `company_id` 컬럼 추가 (테넌트 스코프 테이블 전체)
대상: `profiles`, `daily_tasks`, `meetings`, `meeting_actions`, `clients`, `projects_domestic`, `quotes`, `proposals`, `products`, `proposal_items`, `margin_simulations`, `confirmations`, `push_subscriptions`, 그 외 테넌트 데이터를 담는 모든 테이블.
- 추가 순서: **NULL 허용으로 추가 → 전체를 `1`(KLP)로 백필 → NOT NULL + FK 확정**.
- 각 테이블에 `create index on <t>(company_id)` (조회 성능).
- 테넌트 스코프가 **아닌** 테이블은 그대로 둔다(예: 전역 설정 테이블이 있다면). 판단 기준: "이 데이터가 특정 회사 소유인가?".

### A-3. `current_company_id()` 헬퍼 (security definer)
```sql
create or replace function current_company_id() returns bigint
language sql stable security definer set search_path = public as $$
  select company_id from profiles where auth_user_id = auth.uid() limit 1
$$;
```
- 로그인한 사용자의 소속 회사 번호를 JWT(auth.uid) 기준으로 안전하게 조회.
- 기존 `current_profile_name()` / `current_profile_role()` 패턴과 동일.

### A-4. INSERT 자동 태깅 트리거
```sql
create or replace function set_company_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.company_id is null then NEW.company_id := current_company_id(); end if;
  return NEW;
end $$;
-- 각 테넌트 테이블에 BEFORE INSERT 트리거로 부착
```
→ 앱이 company_id를 안 보내도 DB가 채운다. **앱 insert 코드 대량 수정 불필요** = 무중단 핵심.

### A-5. RLS 재작성 ("조이기" 단계)
- 현재: `authenticated = 전체 허용`.
- 변경: 테넌트 테이블마다 `using (company_id = current_company_id())` + `with check (company_id = current_company_id())`.
- 회의록처럼 이미 세분화된 RLS는 **회사 필터를 AND로 추가**(비공개 회의 규칙은 유지하되 회사 경계 우선).
- anon SELECT 예외(`proposals`/`products` 공유링크, `profiles` 로그인 매핑)는 회사 경계를 깨지 않는 선에서 유지 — 공유링크는 토큰으로 특정 행만(이미 그렇게 되어 있음), profiles 매핑은 아래 A-6에서 재설계.

### A-6. 로그인/인증 (회사 구분)
문제: 지금 로그인은 "이름 + 비번"이고, 이름→이메일 매핑을 anon으로 조회한다. 회사가 여러 개면 이름이 겹친다(A사 김현호, B사 김현호).
설계:
- **신규 회사 = 이메일 로그인**(표준). 회사 관리자가 직원 이메일로 계정 생성.
- **KLP = 기존 이름 로그인 유지**(하위호환). KLP는 1번 회사라 이름 충돌 없음.
- 로그인 화면: 이메일 입력 필드를 기본으로, KLP 직원용 이름 로그인은 유지(기존 synthetic 이메일 매핑 그대로). 구현 시 "이메일에 @ 있으면 이메일 로그인, 없으면 기존 이름 매핑" 분기.
- profiles anon SELECT는 이름 매핑에만 쓰이므로 최소 컬럼(name,email)만 노출 유지.

---

## B. 직원을 코드 → 설정으로

### B-1. 하드코딩 제거 대상
- 직원 이름 배열, `MEETING_ASSIGNEES`, 일일계획표 담당자 컬럼 목록, `ADMIN_ROLES`/`EXEC_ROLES` 등 코드 상수.

### B-2. 회사 멤버는 `profiles`에서
- 일일계획표 컬럼·회의록 담당자 = **현재 회사의 `profiles` 목록**에서 생성.
- `profiles`에 필요한 보조 컬럼: `sort_order int`(표시 순서), `is_active boolean`(퇴사 처리), 기존 `role` 유지.
- 권한 등급(관리자/임원/일반)은 `role` 값으로 계속 판단하되, **역할 목록 자체를 회사 설정으로** 둘 수 있게(회사마다 직급명이 다름). 1단계에서는 3등급 고정(admin/manager/member)으로 단순화하고, 회사별 표시 이름만 설정에서 바꾸는 수준으로 시작.

### B-3. 일일계획표 특수 컬럼 일반화
- "전체(공통)" 컬럼은 유지(모든 회사 공통 개념).
- "임원/대표님" 같은 KLP 특유 컬럼은 제거하고 **회사 멤버별 컬럼**으로 대체. KLP도 멤버 기반으로 자연스럽게 표현됨(대표=멤버, 관리자 역할).

---

## C. 브랜딩 + 모듈 토글

### C-1. `companies.settings` (jsonb) 구조
```json
{
  "brandName": "표시용 회사명",
  "logoUrl": "로고 이미지 URL 또는 null",
  "primaryColor": "#1F85FF",
  "enabledModules": ["daily", "meetings", "clients", "projects", "proposals", "delivery", "docgen", "margin"]
}
```
- 로그인 직후 회사 settings 로드 → 전역 상태에 보관.

### C-2. 브랜딩 적용
- 화면 상단 로고/회사명, CSS `--primary` 등 색상 변수(가능한 것)를 회사 색으로 주입.
- 기본값(설정 비었을 때) = 지금 KLP 스타일.

### C-3. 사이드바 모듈 게이팅
- 각 사이드바 항목에 모듈 키를 부여. `enabledModules`에 없는 항목은 숨김.
- KLP(1번 회사) settings = 모든 모듈 켬(현재와 동일). 신규 일반 회사 = 핵심 4개만.

---

## D. KLP 데이터 안전 이전
- 마이그레이션에서 `companies`에 KLP를 `id=1`로 insert, KLP settings=전체 모듈.
- 모든 테넌트 테이블 `company_id`를 `1`로 백필, `profiles`도 전원 `company_id=1`.
- 결과: **KLP 직원은 변화 없이 그대로 사용**, 내부만 다회사 구조로 전환.
- 검증: 브랜치에서 백필 후 주요 화면(일일계획표·회의록·거래처·프로젝트) 데이터 개수·표시가 이전과 동일함을 확인.

---

## E. 온보딩 (지금은 수동, 운영자 전용)

### E-1. 슈퍼관리자(운영자) 개념
- `profiles.is_superadmin boolean default false`. 현호님 계정만 true.
- 슈퍼관리자만 "회사 관리" 화면 접근.

### E-2. 회사 생성 = 서버리스 함수
- Auth 사용자 생성은 클라이언트(anon)로 불가 → **서버리스 함수 `api/admin-create-company.js`** 가 Supabase **service role 키**(Vercel 환경변수)로 처리:
  1) `companies` 행 생성(이름·settings)
  2) 첫 관리자 Auth 사용자 생성(이메일+임시 비번)
  3) `profiles` 행 생성(company_id 연결, role=admin)
- 슈퍼관리자 호출만 허용(요청자의 JWT 검증 + is_superadmin 확인).
- 최소 UI: 슈퍼관리자용 폼(회사명, 관리자 이메일, 켤 모듈 체크박스) → 생성 → 임시 비번 안내.

### E-3. 회사 관리자의 직원 추가
- 회사 관리자는 자기 회사 `profiles`에 직원 추가/삭제/순서변경(같은 서버리스 함수 또는 별도 엔드포인트로 Auth 사용자 생성).
- 1단계 최소: 슈퍼관리자가 직원까지 대신 만들어 줄 수도 있음(복제형이라 소수). 회사 관리자 셀프 직원추가는 여유되면 포함.

---

## F. 범위 밖 (다음 단계)
- **2단계**: 셀프 회원가입 페이지 + 자동 결제(구독).
- **3단계**: 업종별 모듈팩(판촉물용 문서생성·굿즈 마진 등 유료 옵션).
- 랜딩/마케팅 페이지, 사용량 기반 과금, 회사별 커스텀 도메인.

---

## 마이그레이션 순서 (무중단 보장)
1. `companies` 생성 + KLP(id=1) insert.
2. 모든 테넌트 테이블에 `company_id` NULL 허용 추가 + 인덱스.
3. 전체 `company_id=1` 백필.
4. `current_company_id()` + `set_company_id()` 트리거 부착. (이 시점까지 RLS는 여전히 개방 → 앱 정상)
5. 앱 배포: 로그인 시 회사 settings 로드, 브랜딩·모듈 게이팅, 직원 목록을 profiles에서 렌더(하드코딩 제거). (RLS 개방 상태라 안전)
6. RLS를 회사 스코프로 조이기 + `company_id` NOT NULL 확정. (앱이 이미 회사 컨텍스트를 쓰므로 KLP 정상)
7. 온보딩 서버리스 함수 + 슈퍼관리자 화면.
8. 두 번째 시험 회사(테스트)로 격리·온보딩 검증.

각 단계는 독립 배포 가능하며, 5번 전까지는 사용자 체감 변화 0.

## 검증 기준
- KLP 기존 화면 전부 이전과 동일 동작(데이터 개수·권한·회의록 비공개 규칙).
- 시험 회사 B를 만들어: B 로그인 시 B 데이터만 보임, KLP 데이터 접근 불가(직접 쿼리로도 차단됨 = RLS 확인).
- B의 사이드바에 핵심 4개 모듈만, KLP는 전체.
- `node --check app.js`, 콘솔 오류 없음, 다크모드 정상.
