# CLAUDE.md — KLP KOREA 업무 대시보드

## 프로젝트 개요
- **프로젝트**: KLP KOREA 업무 대시보드
- **기술 스택**: Vanilla JS + HTML + CSS (프레임워크 없음)
- **백엔드**: Supabase (인증, 프로필)
- **배포**: Vercel (https://klp-work-dashboard.vercel.app)
- **저장소**: GitHub (hyunhobbit-ops/klp-work-dashboard)

## 파일 구조
- `app.js` — 모든 로직 (인증, 렌더링, CRUD)
- `index.html` — 전체 HTML 구조
- `styles.css` — Toss 스타일 디자인 시스템
- `doc-generator.html` — 디자인확인서(DC)/작업요청서(WR) 생성기 (독립 페이지)
- 단일 파일 구조 유지, 파일 분리하지 않음

## 배포 규칙
- 코드 수정 후 항상 **git commit → push → vercel --prod --yes** 순서로 배포
- 커밋 메시지는 한국어로 작성
- 배포 완료 후 URL 안내

## 권한 체계
- **관리자급**: 관리자, 부장, 대표 → 모든 데이터 조회 가능
- **임원급**: 임원, 차장, 과장 → 전체 + 임원 + 본인 데이터
- **일반**: 전체 + 본인 데이터만
- 권한은 Supabase `profiles` 테이블의 `role` 컬럼 기준
- 코드 내 `ADMIN_ROLES`, `EXEC_ROLES` 배열로 관리

## 일일계획표
- 기본 탭: 전체보기
- 탭 구조: 전체보기 / 전체(공통) / 임원 / 대표님 / 개인별
- 담당자: 전체, 임원, 대표님, 이현주, 김현호, 유지은, 구정두
- 전체보기에서 컬럼 제목 클릭 시 해당 탭으로 이동
- 각 컬럼 하단 인라인 입력으로 빠른 할 일 추가 (Enter)
- 각 컬럼 헤더 + 버튼으로 상세 할 일 추가 (모달)

## 택배 관리
- 행 클릭 시 사이드바 상세 패널 없음 (제거됨)
- 더블클릭 인라인 편집 + 편집 버튼 모달 수정
- 체크박스 선택 후 로젠택배 엑셀 내보내기 (SheetJS)
- 엑셀 양식: 수화주/우편번호/주소/휴대폰번호/수량(1 고정)/금액(2750 고정)/선착불/상품명/옵션/비고
- 연도별, 월별 필터링 지원

## UI/UX 규칙
- 한국어 UI, Toss 스타일 디자인
- Pretendard 폰트 사용
- 모바일 반응형 지원 (카드 그리드)
- 토스트 메시지로 사용자 피드백
- 디자인 변수는 CSS :root에 정의

## Supabase 연동
- URL: `vtulmuxkriklpiibiues.supabase.co`
- 인증: **Supabase Auth (signInWithPassword)** — 2026-05-19 Phase 1 보안 이전 완료
  - 사용자 입력 UX는 그대로 (이름 + 비번) — 내부적으로 name→email 매핑 후 Auth
  - 5명 직원의 email: 김현호는 `hyunhobbit@naver.com` (실제), 나머지는 `<로그인이름>@klp.local` (synthetic)
  - 비번은 Supabase Auth에서 bcrypt 해싱 보관, 평문 컬럼 없음
- `profiles` 테이블: id, name, role, email, auth_user_id (password 컬럼 제거됨)
- `quotes` 테이블: 단독 견적서 (DC와 무관하게 작성). `quotes.sql` 참조. 스키마는 DC 필드 축약본 + `note` 비고 + 시안 이미지 없음
- `projects_domestic` 테이블: 국내 프로젝트. **매출 + 매입 통합 단일 행 모델** (부모/자식 구조 아님)
  - 매출: `unit_price`, `unit_price_vat`, `print_fee`, `packaging_fee`, `revenue` 등
  - 매입: `supplier`, `supplier_contact`, `supplier_unit_price`, `supplier_print_fee`, `supplier_packaging_fee`, `supplier_revenue` 등 `supplier_*` 9개 컬럼
  - `parent_project_id`는 레거시이며 더 이상 사용하지 않음
  - `source_doc_number`: 연결된 디자인확인서 `doc_number` (DC 저장 시 자동 업데이트)
- `confirmations` 테이블: DC/WR 문서 저장 (`doc-generator.html` 전용)
  - `doc_number`에 UNIQUE 제약 (2026-05-19 Phase 3, migration 008). 동시 저장 race는 `saveConfirmationWithRetry`가 23505 catch → 재시도로 처리. WR 형식은 `YYMM_NNNN_K` (parent DC + suffix), retry 시 suffix만 증가.
- RPC 함수
  - `delete_all_marketdb()` (Phase 3, migration 009): `SECURITY DEFINER`. 내부에서 `auth.uid → profiles.name` 조회 → 이현주/김현호/김관택만 실행. anon EXECUTE 차단. `app.js deleteAllMarketdb`가 호출.
- RLS 정책: **단순 모델** — `authenticated` = 모든 내부 18개 테이블 풀 액세스. `proposals`/`products`는 anon SELECT 허용(거래처 공유 링크용). `profiles`는 anon SELECT 허용(handleLogin의 name→email 매핑용). 새 테이블 추가 시 동일 패턴 따를 것 (`migrations/` 폴더 참조).
- 세션 관리: Supabase가 JWT를 자동 관리, `localStorage.klp_user`는 display name 캐시 + `doc-generator.html` 호환용 보조. 정식 인증은 `sb.auth.getSession()`
- `doc-generator.html`은 SDK가 아닌 hand-rolled `sbFetch` 사용 — bootstrapAuthSession에서 access_token 추출 후 Bearer 자동 첨부 (RLS 잠금 대응). `sbFetch`는 `res.ok` 체크 + 에러 throw 패턴 (Phase 3 #11).
- **페이지네이션**: 큰 테이블 로드는 `paginatedLoad(table, options)` 헬퍼 사용 — 첫 N개만 로드 + `renderLoadMoreButton`으로 "남은 X건 더 보기" UI. 새 list view 추가 시 동일 패턴 따를 것 (Phase 3 #10). 단, kanban/relational 묶음 화면(daily_tasks, planning_*)은 cap 내에서 auto-loop 패턴 사용.

## 멀티테넌트 (SaaS) — 2026-07-20 기반 공사 (migrations 021~026)
- **목적**: KLP 전용 앱 → 여러 회사가 회사별 칸막이 안에서 쓰는 판매 제품. KLP = `company_id = 1`.
- **회사 테이블** `companies`: id, name, plan, active, `settings` jsonb(`brandName`, `logoUrl`, `primaryColor`, `enabledModules[]`).
- **테넌트 격리**: 모든 테넌트 테이블(24개)에 `company_id` 컬럼(NOT NULL). RLS = `company_id = current_company_id()`.
  - `current_company_id()`: security definer, `auth.uid()` → profiles.company_id. (`current_profile_name/role`과 동일 패턴)
  - `set_company_id()`: BEFORE INSERT 트리거 — company_id 미지정 시 자동 기입(profiles 제외). **앱 insert 코드는 company_id를 보낼 필요 없음.**
  - meetings/meeting_actions는 기존 비공개 규칙 + 회사 경계 AND. profiles는 익명 로그인 매핑(`profiles_anon_login_lookup`) 유지 + authenticated는 회사 스코프.
  - **KLP 안전성**: 모든 KLP 행·유저가 company_id=1이라 조건이 항상 참 → 기존과 동일 동작. 롤백: `migrations/025_tenant_rls_rollback.sql`.
- **직원·담당자는 데이터**: 하드코딩 이름 제거. `companyPeople()`/`assigneeOptionList()`/`meetingStaffList()`/`planningAssigneesList()` 접근자가 KLP면 기존 고정값, 아니면 회사 profiles 기반. `isAdminUser/isExecUser`는 이름(KLP) + 역할 fallback(신규 회사). 임원/대표님 특수 컬럼은 `_isKlpCompany()` 게이팅.
- **브랜딩·모듈**: 로그인 시 `loadCompanyContext()` → `applyCompanyBranding()`(회사명·`--blue`/`--klp-brand` 색) + `applyModuleGating()`(enabledModules 없는 사이드바 항목 숨김, `data-tab`→모듈키). KLP settings.primaryColor=null이라 색 불변.
- **온보딩(수동)**: `profiles.is_superadmin`(김현호=true)만 "회사 관리" 탭(`tab-admin-companies`). `api/admin-create-company.js`(service role, 의존성 0)가 요청자 슈퍼관리자 검증 → 회사+관리자Auth계정+프로필 생성 → 임시비번 반환. **Vercel 환경변수 `SUPABASE_SERVICE_ROLE_KEY` 필수.**
- **로그인**: 여전히 이름 기반(name→email 매핑). ⚠️ 한계 — 회사 간 동명이인이면 `.eq('name').single()` 충돌. 향후 이메일 로그인 전환 필요(2단계).
- **범위 밖(다음 단계)**: 셀프 회원가입+자동 결제, 업종별 모듈팩(택배·문서생성 등), 랜딩. 설계·계획: `docs/superpowers/{specs,plans}/2026-07-20-multitenant-saas-*`.
- **새 테넌트 테이블 추가 시**: `company_id bigint references companies(id) not null` + `set_company_id` 트리거 + 회사 스코프 RLS 필수.

## 프로젝트 진행사항 (국내)
- **매출/매입 통합 단일 행**: 매출처 정보 + 매입처 상세(작업요청서용)를 한 프로젝트 행에 함께 저장
- 신규/편집 모달에서 매입처명 입력 시 주황색 🏭 매입처 상세 카드가 펼쳐짐 (매입 단가·VAT·인쇄비·포장비)
- 매출액/매입액은 `단가 × 수량 + 인쇄비 환산 + 포장비 환산` 합산 (VAT, 1개당/일괄 적용)
- 마진 = `revenue - supplier_revenue`

## 제안서 시스템
- 사이드바 "제안서" 그룹: 상품 DB / 제안서 관리
- **상품 DB**: 제안서에 사용할 상품 등록·관리 (productsDB 배열, 추후 Supabase 전환)
  - 카테고리: 시계 / 생활용품 / 사무용품 / 상패,트로피 / 기타
  - 상품 정보: 단가(VAT 포함/별도), 인쇄(불가/레이저각인/실크인쇄/패드인쇄/기타) + 인쇄비, 포장(기본박스/선물포장/전용케이스/전용보관함/기타) + 포장비, 라벨부착(가능/불가), 상태(판매 중/품절/단종)
  - 이미지는 파일 업로드 → base64 data URL 저장 (추후 Supabase Storage)
- **제안서 관리**: 거래처별 제안서 목록·작성·편집·발송 이력 (proposals 배열, 추후 Supabase 전환)
  - 상태: 작성 중 / 발송 완료 / 계약 성사 / 미성사
  - 목록 뷰 ↔ 편집 뷰를 `tab-proposals` 안에서 전환 (목록 숨기고 편집 폼 표시)
- **제안서 흐름**: 상품 DB 등록 → 제안서 작성 시 DB에서 골라 담기(`openProductPicker`) → 수량 입력 → 저장 → 링크 공유 또는 PDF
- **미리보기** (`openProposalPreview`): 거래처가 보는 외부 공유용 카탈로그 화면 (`proposalPreviewOverlay` 전체화면 오버레이)
  - 프리미엄 다크 헤더(#0c0f1a) + 원형 장식 3개
  - 2열 제안 안내/담당자 정보 → 필터 칩(전체/인쇄 가능/선물포장/10만원 이하) + 갤러리·테이블 뷰 토글 → 3열 상품 카드 → 하단 CTA → 푸터
  - 상품 카드: 이미지(180px) + BEST/NEW 뱃지 + 가격(VAT 포함 표시) + 옵션 라벨(인쇄/인쇄비/포장/포장비/라벨)
- 주요 함수: `renderProductDB`, `openProductDBModal`, `saveProduct`, `showProductDetail`, `renderProposals`, `openProposalEditor`, `closeProposalEditor`, `renderProposalEditor`, `saveProposal`, `addProductToProposal`, `removeProductFromProposal`, `updateProposalItemQty`, `recalcProposalTotal`, `openProductPicker`, `generateShareLink`, `openProposalPreview`, `renderProposalPreview`, `setPreviewFilter`, `setPreviewView`
- 데이터: 현재 JS 배열 → Supabase `products`, `proposals`, `proposal_items` 테이블로 전환 예정

## 회의록 (업무 그룹)
- **목적**: 회의 기록 → 액션아이템 → **일일계획표 할 일 자동 생성 + 푸시 알림**
- 탭 `meetings`, 컨테이너 `#tab-meetings` 안에서 목록 뷰 ↔ 편집 뷰 전환 (제안서 패턴)
- **테이블**: `meetings` (attendees/agenda/decisions는 jsonb 배열), `meeting_actions` (meeting_id FK cascade)
  - `meeting_actions`에 **`done` 컬럼이 없다.** 완료 여부는 `daily_task_id`로 `daily_tasks.done`을 읽어 표시 (일일계획표가 단일 원본)
- **RLS**: 이 앱에서 유일하게 "authenticated 전체 허용"이 아닌 테이블.
  `current_profile_name()` / `current_profile_role()` (security definer) 기준으로
  비공개 회의는 작성자·참석자·관리자급(`관리자/부장/대표`)만 조회. `migrations/019_meetings.sql` 참조
- **전송**: `sendMeetingActionsToDaily(meetingId)` → 기존 `dbInsertTask()` 호출 (내부에서 `notifyNewTask`가 푸시 발송)
  → 반환된 id를 `meeting_actions.daily_task_id`에 저장. 전송된 행은 회의록에서 잠김
  - INSERT는 됐는데 `daily_task_id` 연결이 실패한 건은 `orphan`으로 세어 토스트로 경고 (재전송 시 중복되므로)
- **목록 렌더 분리**: `renderMeetings()`는 로드 후 `_renderMeetingList()`에 위임. "더 보기"·검색은 `_renderMeetingList()`만 호출해야 함
  (`renderMeetings()`를 부르면 `loadMeetings()`가 1페이지를 다시 받아 추가 로드분을 버림)
- 주요 함수: `renderMeetings`, `_renderMeetingList`, `openMeetingEditor`, `closeMeetingEditor`, `renderMeetingEditor`, `saveMeeting`, `deleteMeeting`, `loadMeetingActions`, `renderMeetingActions`, `saveMeetingActions`, `sendMeetingActionsToDaily`
- 2단계(`api/meeting-summarize.js`, AI 정리), 3단계(`api/meeting-transcribe.js`, 녹음 전사)는 미구현

## 마진계산기 (편의성 그룹)
- **목적**: 원가 항목들과 판매가를 입력해 마진/마진율을 계산. 기존 엑셀 양식(이니셜D 시계 굿즈 기준)을 발전시킨 자유형 구조
- **데이터 모델**: `margin_simulations` 테이블 (margin_simulations.sql 참조). 자유형 카테고리/항목을 `categories` jsonb 컬럼에 저장
  - 항목 필드: `name`, `currency('USD'|'KRW')`, `amountUsd`, `amountKrw`, `quantityMul`(수량× 여부), `vat`(부가세 10% 자동 가산), `note`
- **핵심 로직** (recalcMargin):
  - 항목 비용 = (USD면 amountUsd × 환율, KRW면 amountKrw) × (수량× 토글) × (VAT면 ×1.1)
  - 총 판매액 = 판매가(VAT 포함가 환산) × 수량
  - 마진 = 총 판매액 − 총 원가, 마진율 = 마진 / 총 판매액 × 100
  - 권장 판매가 (목표 마진율 입력 시) = 총 원가 / (1 − 목표마진율/100) / 수량
- **양방향 환산**: 항목의 USD/KRW 두 입력 중 어디든 입력하면 반대편 자동 환산. 환율 변경 시 currency가 source-of-truth (전체 재렌더 없이 input value만 갱신해 포커스 유지)
- **시뮬레이션 저장/불러오기**: 상단 셀렉트로 불러오기, 우상단 "시뮬레이션 저장" 버튼, 요약 패널 하단에 삭제 버튼. `currentUser.name`을 author로 기록
- **엑셀 양식 시드**: `seedMarginTemplate()` — 본품/패키지/품질보증서/국내배송비/판매수수료/라이선스/특전/기타비용 8개 카테고리를 엑셀 기준으로 채움
- **주요 함수**: `initMarginCalcIfNeeded`, `defaultMarginState`, `seedMarginTemplate`, `addMarginCategory`, `removeMarginCategory`, `addMarginItem`, `removeMarginItem`, `updateMarginItem`, `recalcMargin`, `renderMarginCategories`, `renderMarginSummary`, `loadMarginSimulationsFromDb`, `saveMarginSimulation`, `onMarginSimSelectChange`, `deleteCurrentMarginSimulation`

## 문서 생성기 (DC/WR) 연동
- **생성 흐름**: 프로젝트 진행사항 → 상세/편집 모달의 `📄 디자인확인서 만들기` / `📋 작업요청서 만들기` 버튼 → `doc-generator.html`로 이동하여 pre-fill
  - 프로젝트 데이터는 `localStorage.klp_doc_prefill`로 전달 (doc-generator가 로드 시 읽고 즉시 삭제)
  - DC는 매출 필드로, WR은 매입(`supplier_*`) 필드로 pre-fill
- **DB 분리**: doc-generator는 `confirmations` 테이블에만 쓰고, `projects_domestic`에는 쓰지 않음
- **자동 연결**: DC 저장 성공 시 `projects_domestic.source_doc_number`를 새 문서번호로 PATCH (프로젝트 상세에서 DC 이미지 미리보기 연동)
- **WR 전제 조건**: WR 만들기는 프로젝트에 `source_doc_number`(연결된 DC) + `supplier_unit_price`(매입 단가)가 있어야 동작

## 코드 스타일
- 에러 발생 시 디버깅용 상세 메시지 유지 (console.error + 화면 표시)
- 새 기능 추가 시 기존 패턴 따름 (renderXxx, openModal, openEditXxx 등)
- CDN으로 외부 라이브러리 로드 (Supabase, SheetJS)
- 함수명: camelCase, 한국어 주석

## XSS 봉합 (2026-05-19 Phase 2 완료)
- **escape 헬퍼**: 사용자 입력을 `innerHTML`에 출력할 때는 반드시 escape
  - `app.js`: `escHtml(s)` (line 13370) — `&<>"` 4글자
  - `doc-generator.html`: `esc(s)` (line 400) — 동일 패턴
  - `proposal-view.html`: `escHtml(s)` (line 82) — 동일 패턴
- **escape + `\n→<br>`**: escape 먼저, 그 다음 newline 치환 (`escHtml(text).replace(/\n/g,'<br>')`). 순서 반대면 `<br>`까지 escape됨
- **URL 검증** (`app.js:isSafeUrl`): http/https/mailto/tel 또는 상대 경로만 허용. URL 입력 받는 새 기능 추가 시 저장+렌더 양쪽에서 호출
- **inline onclick 지양**: 사용자 입력 문자열을 인자로 받는 inline `onclick="fn('${userInput}')"` 패턴은 escape fragile (backslash 우회). data-* + 위임 리스너로 전환 (`app.js:_urlShortcutClickHandler` 참조)
