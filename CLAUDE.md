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
- **이미지 자동입력** (`analyzeDeliveryImageFile` → `api/analyze-delivery.js`): 2026-10 Sonnet 4.6(사진 1568px 한계) 인식률 문제로 **Claude Sonnet 5.5 + 고해상도**로 교체. 클라이언트가 긴 변 2576px·JPEG 0.92로 보냄. 서버는 구조화 출력(`output_config.format` json_schema, 강제 tool_choice는 5.5에서 400) + effort `high` + `fallbacks: "default"`(beta `server-side-fallback-2026-07-01`), 이름·전화·우편번호를 한 글자씩 대조하라는 지시. 요청이 400이면 예전 방식(Sonnet 4.6 + 도구)으로 한 번 재시도. 응답 `engine`에 실제 모델. Vercel 환경변수 `ANTHROPIC_DELIVERY_MODEL`(예: claude-opus-5-5)·`ANTHROPIC_DELIVERY_EFFORT`로 코드 수정 없이 변경. 대략 장당 20~40원(Opus 5.5는 45~85원)

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
  - ⚠️ **(2026-09-29 전체 정리)** 작은 목록(국내 프로젝트·견적·상품·제안서·중고마켓DB·마케팅·견적서·마진·회의록·해외 거래처·바로가기)은 로드 직후 `loadAllPages(pageState)`로 **전부** 불러옴 → 검색·필터·연결이 항상 전체 기준. 큰 목록: 거래처(3천+)는 검색·필터·조회 때 `ensureAllClientsLoaded`, 택배(2천+)는 검색·종류·연도·월 필터를 쓰면 `renderDeliveries`가 전체 기간을 끝까지 불러옴. 일일계획표는 **최신부터(id desc)** 불러와 상한(20000)을 넘어도 새 할 일이 안 빠지게 한 뒤 id 오름차순으로 정렬. 거래처 자동완성(마진계산기·견적서)은 `fetchAllClientNames`, 엑셀 가져오기 중복 확인은 `fetchAllClients`, `openEditClient`는 목록에 없으면 DB에서 조회
  - ⚠️ 첫 N개만 불러온 목록에서 **검색·필터는 전체를 대상으로** 해야 함. 거래처 DB는 검색어/분류 필터를 쓰는 순간 `ensureAllClientsLoaded()`가 남은 페이지를 다 불러와 `clients`를 채움 (예전엔 이름순 500개 안에서만 찾아 삼인물산주식회사 같은 뒤쪽 거래처가 안 나왔음)
  - 상품 DB 공급처 칸(`fillSupplierDatalist`/`onSupplierInput`)도 같은 이유로 전체를 불러온 뒤 확인하고, (주)·공백 차이는 `clientNameKey`로 같은 거래처로 봄
  - 거래처 상세 모달의 상담·견적·국내 프로젝트 이력은 `renderClientHistory`가 **DB에서 직접** 조회 (inquiries·projects_temp·projects_domestic 매출처/매입처). 이름은 `clientNameKey`로 (주)·주식회사·공백을 빼고 비교

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
- **회사 설정(관리자 셀프서비스)**: 회사 관리자(role in ADMIN_ROLES)만 "회사 설정" 탭(`tab-company-settings`). 직원 추가(`api/company-add-user.js` — 요청자 관리자 검증 → 같은 회사에 계정 생성) / 직원 비활성(profiles.is_active) / 디자인(companies.settings brandName·primaryColor·logoUrl) / 모듈 토글. companies UPDATE는 `companies_admin_update` RLS(같은 회사 + 관리자역할). `saveModules`는 화면에 없는 기존 모듈(KLP 전체 등) 보존. migration 028.
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

## 상담 관리 (메뉴 "상담·견적" 안, 탭 id는 그대로 projects-temp) — migration 035
- **목적**: 문의 접수부터 수주/실패까지 상담 과정(고객 말·우리 답변·내부 메모)을 남김. 메뉴를 늘리지 않으려고 `tab-projects-temp` 상단 전환 `상담 관리 | 견적 목록`(`tpSetView`, 마지막 선택 localStorage `tp_view`)
- **테이블**: `inquiries`(상담 건: client, status 신규/상담중/견적발송/수주/보류/실패, next_action+date, fail_reason 등), `inquiry_logs`(direction in/out/memo/system, channel, body, image base64), `projects_temp.inquiry_id`(견적 품목 → 상담 연결). 둘 다 회사 스코프 RLS + set_company_id 트리거
- **자동 흐름**: 우리 첫 답변 → 신규→상담중 / 견적 품목 추가(`inqOnQuoteAdded`) → 견적발송 / `transferGroupToDomestic` 이관(`inqOnTransferred`) → 수주. 상태 변경은 모두 system 로그로 남음
- **견적 연결**: 상담 상세의 '이 상담으로 견적 작성'(`inqStartQuote` → `_inqPendingLink`, 견적 목록 상단 배너) 또는 '같은 거래처 견적 연결'(`inqLinkGroup`). 묶음 안 품목 추가는 묶음의 inquiry_id를 따라감. 견적 목록 매출처 칸에 '상담 보기' 칩
- **고객 연락처 칸 (migration 036)**: `contact_name / contact_title / contact_phone / contact_email`. 예전 `client_contact`는 읽기 호환용(값은 contact_name으로 옮김). 연락처는 `inqNormPhone`으로 하이픈 정리
- **사진**: `inquiry_logs.images` jsonb 배열(업로드 시 `_shrinkDataUrl` 1200px 압축, 한 번에 최대 10장). Ctrl+V 붙여넣기·끌어놓기·파일 선택 모두 `inqBindImageInput`/`inqAddImageFiles`. 옛 `image` 한 칸도 표시는 함
- **부서 칸**: `contact_dept` (036 파일 끝에 추가, 직함과 분리)
- **자동 입력(규칙)**: 새 상담 '첫 문의 내용'에 붙여넣으면 0.25초 뒤 `inqParseContact` — 라벨('이름:' 등, 콜론/탭 필수) → 서명 줄('HR마케팅2팀 | 선임매니저') → 휴대폰 우선·팩스 제외 → 이름은 'OOO 드림' / 'NHR 김규리 선임입니다'(회사나 직함 있어야 인정) / 연락처 위 이름 한 줄 / '홍길동 과장' 순 → 회사는 `주식회사 OO` 또는 회사 메일 도메인(5자 이하, nhr.kr→NHR). 직함은 `INQ_TITLE_LIST` 긴 것부터(선임매니저가 선임+매니저로 쪼개지지 않게). 빈 칸·`data-auto` 칸만 채움
- **자동 입력(AI)**: 0.9초 멈추면 `inqAiExtract` → `/api/meeting-summarize?kind=inquiry` → `api/_inquiry-extract.js`(Hobby 플랜 함수 12개 제한 때문에 `_` 파일로 두고 회의록 함수가 넘겨줌. 로그인 토큰 검증, 도구 강제 JSON, 모델 `ANTHROPIC_INQUIRY_MODEL`→실패 시 `ANTHROPIC_MODEL`)가 거래처·담당자·부서·직함·연락처·이메일·**문의 한 줄 요약**을 채움. 실패하면 규칙 결과만 남음. 거래처는 `inqMatchClient`로 DB 표기에 맞춤
- **붙여넣기 정리**: `inqBindImageInput` paste에서 text/html을 `inqHtmlToText`로 변환(문단=한 줄, `<p>&nbsp;</p>`·`<div><br></div>`=빈 줄, 3줄 이상 빈 줄은 1줄) → `execCommand('insertText')`(Ctrl+Z 가능). 글만 있으면 `inqTidyPlain`. 메일 속 `<img>`는 `inqAddImageUrls`로 시도 — 웹메일 사진은 로그인 쿠키가 필요해 대부분 실패 → `inqImgNotice`로 '오른쪽 클릭→이미지 복사→Ctrl+V' 안내. 서버 이미지 프록시는 SSRF 위험·쿠키 문제로 만들지 않음
- **다음 할 일 여러 개 (migration 037)**: `inquiry_todos`(task, due_date, assignee, done, daily_task_id). 추가하면 `inqTodoCreateDaily`가 담당자 `daily_tasks`에 `[거래처] 할 일`(label '회사 업무', date=할 날짜 또는 오늘)로 등록. 글·날짜·담당자·완료 변경은 연결된 daily_task에도 반영, 삭제하면 같이 삭제. 완료 여부는 연결돼 있으면 `daily_tasks.done`이 원본(상세 열 때 읽음). 담당자 기본값 = 작성자(`inqMe`). `inquiries.next_action/next_action_date`는 목록용 요약('가장 급한 미완료 외 N건', `inqSyncNextSummary`)
- **거래 흐름 (migration 038)**: 상담 한 건에서 상담 → 견적 → 수주 → 디자인확인 → 작업요청 → 납품·정산까지. 견적 의뢰·국내 메뉴는 그대로(목록·장부용)
  - `projects_domestic.inquiry_id`: `transferGroupToDomestic`이 견적의 inquiryId를 넣음. `check_dates` jsonb: 체크한 시각 — BEFORE UPDATE 트리거 `projects_domestic_stamp_checks`가 어디서 체크하든 기록
  - AFTER 트리거 `projects_domestic_inquiry_sync` → 체크 시 상담 타임라인에 system 기록 + `inq_sync_stage()`로 상담 상태 자동: 국내 연결 있으면 수주 → 작지 발송 체크 시 제작중 → 전부 납품 시 납품완료 → 납품+잔금+계산서+송금 전부 시 정산완료 (보류·실패는 안 건드림). 그래서 앱은 상태를 직접 바꾸지 않고 `inqReloadInquiry`로 다시 읽음
  - 화면: `inqRenderStage`(6단계 막대 + '지금 할 일' 버튼 — 견적 작성/국내로 넘기기/디자인확인서·작업요청서 만들기/체크), `inqRenderProjs`(국내 진행 칸, 7개 체크 칩 = `inqToggleProjCheck`, 국내 메뉴와 같은 규칙), 고객 정보는 한 줄 요약으로 접힘(`inqContactSummary`)
  - 문서 만들기·국내 상세는 전역 `projects` 배열을 쓰므로 `inqEnsureProject`로 없으면 넣고 호출
  - 상태 목록: 신규/상담중/견적발송/수주/제작중/납품완료/정산완료/보류/실패. '진행 중' 필터 = 정산완료·보류·실패 제외
- **연결된 견적 품목 명세**: `inqQuoteItemHtml`/`inqQuoteBreakdown` — 품목마다 판매·매입 나란히 표(제품 단가×수량, 인쇄·포장·라벨·택배 금액 또는 '단가에 포함', 공급가·부가세·합계, 마진=판매합계−매입합계). 합계는 `calcTempRevenueWithVat`/`calcTempSupRevenueWithVat`와 동일
- **가견적 (migration 039)**: 디자인 확정 전 예상가 범위. `inquiries.pre_estimate` jsonb `{items:[{item,qty,min,max}], vat, lead, note, sent_at, sent_count}` — 견적(projects_temp)과 분리해 매출·마진·국내 등록에 안 섞임. `inqRenderPre`(보기/편집), `inqPreText`(고객용 안내문), `inqPreAction`: copy(클립보드) / send(우리 답변으로 기록 + sent_at + 상태 신규·상담중→**가견적**) / quote(견적 입력칸에 품목·수량 채우고 단가는 비워 확정가 입력). 상태 순서: 신규/상담중/가견적/견적발송/…
- **상세 화면 2단 배치**: 위(`.inq-head`) = 거래처·상태·제목 한 줄 + 고객 정보 입력칸 2줄(`#inqFields.inq-hfields`: 담당자 줄·회사 줄, 항상 보이고 바로 수정) + 단계 막대 / 아래 `.inq-body2` = 왼쪽 `.inq-main`(대화 기록, 화면 높이 전체 + 입력칸) · 오른쪽 `.inq-side`(따로 스크롤: `#inqNow` 지금 할 일 → 다음 할 일 → 가견적 → 견적 → 국내 진행 카드). 카드 접기 상태는 localStorage `inq_card_{pre,pj}`·`inq_q_open`. 견적·가견적은 좁은 패널용 품목 카드(`.inq-qi`)로 표시(표 아님). 1100px 이하는 위아래로 쌓임
- **사용법 안내 (상담·견적만)**: 화면 오른쪽 위 `사용법` 버튼 → `tpStartTour()` 가이드 투어(`startTour(steps)` 범용 엔진: 대상 요소 강조 + 설명 말풍선, 이전/다음/Esc, 대상 없으면 가운데 안내). 처음 들어온 사람은 `tpInitView`→`tpMaybeAutoTour`로 한 번 자동(localStorage `tour_tp_v1`). 버튼 설명은 `TP_HELP`(선택자→문구)를 MutationObserver로 `data-help`에 붙이고 마우스 올리면 `.help-tip`. 버튼/흐름이 바뀌면 `tpTourSteps()`·`TP_HELP`도 같이 고칠 것
- **입력칸 DB화 (migration 041, 대표님 피드백)**: inquiries에 company_address/company_fax/company_website, items jsonb [{name,qty,tbd?}] (tbd=수량 미정 체크), due_date, budget, purpose, print_request, packaging_request, sample_needed('필요'/'불필요'), delivery_address. 새 상담 화면 = 붙여넣기 → 기본 → 담당자 → 회사 정보 → 요청 사항 + 오른쪽 **상담 체크리스트** `INQ_REQ_CHECK`(13개, 전화 선택 시 '전화 상담 순서'로 강조, 누르면 그 칸으로). AI(`_inquiry-extract.js`)·규칙(`inqParseExtra`: 팩스·홈페이지·주소)이 새 칸도 채움, 품목은 `inqApplyItems`. 제목이 비면 품목·수량으로 자동. 상세 화면 오른쪽 **요청 사항** 카드(`inqRenderReq`, 바로 수정·저장, 모르는 항목은 질문과 함께). 거래처 자동 추가 트리거가 주소·팩스도 넣음. 이 상담으로 견적 작성 시 첫 품목·수량 미리 채움
- **기록 수정**: 타임라인 연필 버튼 → `inqEditLog`(글·사진·고객/우리/메모·경로 수정, `inquiry_logs.edited_at` → '수정됨' 표시). 자동 기록(system)은 수정 불가
- ⚠️ `inquiry_logs`를 배열로 한 번에 insert할 때는 모든 행의 키를 같게 — `images`가 NOT NULL이라 한 행에서 빠지면 전체가 거부됨
- 주요 함수: `tpInitView`, `inqEnter`, `inqRenderList`, `inqRenderDetail`, `inqSubmit`, `inqPatch`, `inqAddLog`, `inqCreate`, `inqParseContact`, `inqAutofillNew`
- `.btn-ghost`는 전역 스타일(styles.css 끝). 예전엔 `#tab-meetings` 안에서만 정의돼 다른 화면에서 기본 버튼으로 깨졌음

## 프로젝트 (회사·개인·펀딩) — 2026-10-01 2단 화면 개편
- 칸반 카드 나열 → **왼쪽 목록 · 오른쪽 할 일 리스트** (매입매출 같은 흐름형). DB(planning_projects/planning_posts)는 그대로
- 왼쪽 `renderPlanningList`: 주간/월간/연간 묶음(펀딩은 한 목록)의 한 줄 행(`planningListRowHtml`: n/m 완료 · 마감 임박 ⚠ · D-n), 검색 `planningOnSearch`(목록만 다시 그림), 상태 칩 `planningListStatus`(진행 중/보류/완료/전체). 행을 다른 묶음으로 끌면 기간 변경(기존 `planningSectionDrop`)
- 오른쪽: 고른 프로젝트 없으면 `planningOverviewHtml`(전체 프로젝트의 마감 지난 일·오늘·7일 안·진행 중), 고르면 `renderPlanningDetail`(제목·상태·진행률) + `planningTaskListHtml`(지금 할 일 배너 → 빠른 추가 → 진행 중/할 일/완료(접힘) 묶음) + `planningSideHtml`(정보·다가오는 마감·담당자별 남은 일·최근 활동)
- 빠른 추가 `planningQuickAdd`: 제목 + 담당자(마지막 선택 localStorage `pl_add_who`) + 마감일, Enter(한글 조합 중 Enter 무시). 담당자 있으면 `syncPlanningCardToDaily`. '자세히'는 기존 카드 작성 창
- 체크 = 완료(`planningToggleDone`), ▶ 시작/⏸ = 진행 중↔할 일(`planningSetTaskStatusQuiet`). 행 클릭 = 기존 `openPlanningPostDetail`. 드래그 순서 변경은 기존 `planningCardDrop`/`planningPostDrop`
- `☰ 목록 | ▦ 보드` 전환(localStorage `pl_view`) — 보드는 예전 칸반 컬럼(`planningBoardHtml`)
- `renderPlanning`은 다시 그릴 때 입력 중이던 할 일 칸 값·포커스·목록 스크롤을 유지(실시간 갱신 대비). 프로젝트 열기/닫기는 이미 불러온 데이터로 그림(skipLoad)
- F2: 프로젝트를 열었으면 할 일 입력칸으로, 아니면 새 프로젝트 (모든 모드)
- **할 일 / 자료·제안 분리 (migration 049)**: `planning_posts.kind` = task(진행 상태·마감·담당) / note(제안·조사·자료 — 상태 없음). 기존 글은 제안·조사·자료 중 담당자·마감 없는 것만 note로 옮김. 진행률·지금 할 일·요약·홈 '내 할 일'·보드는 task만(`planningTasksOf`)
  - 본문 탭 `✅ 할 일 | 📎 자료·제안`(`planningTab`, localStorage `pl_tab`). 자료 탭 = 사진 카드 바둑판(`planningNotesHtml`, 분류 칩, 검토 중 제안이 먼저), 올리기 `openNewPlanningNote(category)`(작성 창에서 마감·담당 숨김)
  - 제안 상태 `note_status` review(null)/adopted/hold. `planningAdoptProposal` → 할 일 생성(`ref_ids`=[제안 id], 담당자 있으면 일일계획표) + 제안 '채택'
  - `ref_ids`: 할 일에 연결된 자료. 상세 창 '관련 자료'(`planningLinksHtml`, `+ 자료 연결` = `planningOpenLinkPicker`/`planningSaveLinks`), 자료 상세엔 연결된 할 일. 잘못 분류된 글은 상세 창 `할 일로 옮기기`/`자료·제안으로 옮기기`(`planningConvertKind`)

## 폰 전용 간단 화면 (2026-10, app.js 끝 `mInit` 이하)
- 화면 폭 820px 이하면 `#mRoot`(index.html `#app` 맨 앞, z-index 260 — 모달 300·토스트 400·체크 입력창 10080보다 아래)가 전체 화면을 덮음. 아래 탭 4개: ☀️ 내 하루 · ✅ 계획표 · 📁 프로젝트 · 💼 매입매출 (마지막 탭 localStorage `m_tab`)
- `PC 화면` = localStorage `m_full=1` → 원래 대시보드, 오른쪽 아래 `📱 간단 화면`(`#mBackSimple`)으로 복귀. 상세 화면의 `PC 화면에서 열기`(`mOpenFull`)는 해당 메뉴·상담·프로젝트를 바로 엶
- **저장은 전부 기존 함수**: 내 하루 = `tbxLoad`/`tbxUpdate`/`tbxToggleBig3`/`tbxParse`, 계획표 = `dailyTasks`·`toggleTask`·`dbInsertTask`(사람 칩: 나·전체·임원·대표님·`getVisiblePeople`), 프로젝트 = `planningToggleDone`/`planningSetTaskStatusQuiet`/`planningCreateTask`(PC 빠른 추가와 공용)/`openPlanningPostDetail`, 매입매출 = 상담 `inqLoadTodos`/`inqLoadLogs`/`inqLoadDeal`/`inqTodoToggle`/`inqAddLog`/`inqPatch`/`inqToggleProjCheck`(열 때 `_inqSel`을 그 상담으로), 국내 = `domesticProjects`·`toggleProjectCheck`
- 갱신: `mInit`이 `renderDaily`·`renderProjects`·`renderPlanning`·`inqRenderList`를 감싸서 저장·실시간 갱신 때 `mRefreshSoon`. `mRender`는 입력 중 값·포커스·스크롤 유지. 상세 화면은 `history.pushState({mDepth})` → 폰 뒤로가기로 목록 복귀(`mOnPop`)
- 폰에서 안 하는 것(일부러): 새 상담·견적 작성, 새 프로젝트, 사진 올리기, 시간 배치 → PC 화면 안내
- 위젯: 안드로이드 앱 위젯은 `syncAndroidWidget`(오늘 할 일·요약). 아이폰 위젯은 아직 없음(Scriptable 방식 예정)

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

## 거래처 자동화 (migration 040)
- **자동 추가**: 상담(inquiries.client)·견적 의뢰(projects_temp.client/supplier)·국내 프로젝트(projects_domestic.client/supplier)에 저장된 거래처가 국내/해외 거래처 DB에 없으면 트리거가 `clients`에 추가 (매출처 칸→'매출처', 매입처 칸→'매입처', 상담은 고객 담당자·연락처·이메일을 담당직원 칸에). 같은 회사 판단은 `client_name_key()` ((주)·주식회사·㈜·공백 제거). '개인'·'자체'·'(회사명 모름)' 등은 건너뜀. 앱은 저장 뒤 `clientAutoAddNotice`로 새로 생긴 거래처를 토스트로 알림
- **상담 → 거래처 DB 빈 칸 채우기 (migration 042)**: 상담의 회사 주소·팩스·홈페이지·담당자(이름·연락처·이메일)가 바뀌면 트리거 `fill_client_blanks_from_inquiry`가 같은 거래처(`client_name_key`)의 **비어 있는 칸만** 채움(사업자등록증으로 넣은 정식 값은 안 덮음). `clients.website`(홈페이지) 칸 추가 — 거래처 모달·상세에 표시. 새 상담에서 거래처를 고르면 `inqFillFromClientDb`가 거래처 DB 정보를 빈 칸에 불러옴
- **거래처 등급 (migration 043)**: `CLIENT_GRADES` S 중요 · A 우수 · B 일반 · C 관심 (이름은 여기 한 곳). clients.grade와 inquiries.grade가 트리거로 서로 동기화(상담에서 바꾸면 거래처 DB도, 거래처 DB에서 바꾸면 그 거래처 상담 전부). 표시는 `clientGradeBadge`, 선택은 `clientGradeOptions`. 거래처 표 인라인 선택·등록 창·일괄 수정·상세, 상담 목록 배지·상세 머리·새 상담(거래처 고르면 DB 등급 불러옴)
- **사업자등록증 자동 입력**: 새 고객사/수정 모달 위 `bizregBoxHtml` — 사진·PDF(끌어놓기·Ctrl+V·파일 선택) 또는 복사한 글 → `/api/meeting-summarize?kind=bizreg` → `api/_bizreg-extract.js`(Claude 비전, PDF는 document 블록). 빈 칸/자동 입력 칸만 채움. AI 실패 시 글이면 `bizregParseText` 규칙으로. `bizregDupCheck`가 사업자번호·이름으로 기존 거래처 경고

## 디자인확인서 컨펌 · 작업요청서 발송 채널·날짜 / 선금·잔금 입금 날짜 (migration 044·045·046)
- 선금·잔금·계산서·납품·공급처 송금은 `CHECK_INFO`의 `noChannel: true` — 날짜만(advance_payment_date / final_payment_date / invoice_date / delivered_date / supplier_payment_date, migration 046·047·048). 단계 막대 날짜도 입력한 날짜 우선
- 공통 설정 `CHECK_INFO` (design → design_confirm_*, workOrder → work_order_*), 입력창 `askCheckInfo(key)`. 아래 044 설명은 design 기준이며 workOrder도 똑같이 동작
- `projects_domestic.design_confirm_channel`(카톡/이메일/문자/기타 직접 입력한 글) · `design_confirm_date`
- 디확 컨펌을 **켤 때** `askDesignConfirm()` 창(채널 버튼 + 기타 글칸 + 날짜, 취소 시 체크 안 함) — 국내 목록·상세(`toggleProjectCheck`), 상담 화면(`inqToggleProjCheck`). 편집 창은 체크 아래 `designConfirmFieldsHtml('editDc')` 칸. 끄면 채널·날짜 지움. '완료'로 자동 체크될 땐 기존 값 유지
- 상담 타임라인 자동 기록: "디자인확인서 컨펌 · 품목 (카톡 · 9/30)", 단계 막대 디자인확인 날짜는 컨펌 날짜 우선

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
