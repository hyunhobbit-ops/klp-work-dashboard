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
- ⚠️ **백업·임시 테이블도 public 스키마에 만들면 즉시** `enable row level security` + `revoke all … from anon, authenticated` (2026-10 `clients_category_backup_20260922`가 RLS 없이 노출돼 Supabase 보안 경고 → migration 057로 잠금)
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
- **해외 매입 (달러) — migration 059, 2026-10-08**: 매입처 카드 맨 위 `🌏 해외 매입` 체크(새로·편집 창 공통 `ovsBoxHtml(P)`, P = 'newProject'|'editProject', 상태 `_ovs[P]`). 켜면 국내용 단가·VAT·인쇄·포장·배송(`#{P}SupDom`)을 숨기고 달러 칸: 외화 단가·견적 환율(마지막 값 localStorage `ovs_rate`) / 부대비용 줄(국제 운송비·관세·통관·송금 수수료·국내 운송비·금형비·직접, 원 또는 $) / 수입 부가세(비우면 자동 10%) / 송금 기록 줄(선금·잔금·일괄·추가 × 달러·그날 환율·날짜 — 회차·비율은 그때그때, 잔금·일괄 버튼은 남은 금액 자동)
  - 저장: `projects_domestic.supplier_overseas` jsonb `{cur:'USD', unit, rate, extras:[{name,amt,cur}], ivat|null, pays:[{kind,usd,rate,date}]}` + `supplier_revenue` = `ovsCalc` 원화 합계(송금한 달러는 그날 환율, 남은 달러는 견적 환율 + 부대비용 + 수입 부가세 — 국내 매입액처럼 VAT 포함 기준이라 마진 비교 그대로), `supplier_unit_price` = 원화 환산 단가(작업요청서 만들기 조건 충족용), 국내 인쇄·포장·배송 매입 칸은 0/빈 값. 매입액 내역에 '환율 차이(견적 대비)' 표시
  - 매입처 이름이 해외 거래처 DB(`clients_overseas`, `clientNameKey` 비교)에 있으면 자동으로 켜짐(`ovsMaybeAuto`, 사람이 직접 끈 뒤엔 안 켬). 상담 국내 진행 카드에 `🌏 $단가` 표시
  - **해외 PO 5차 (2026-10-08 공장·내부 피드백)**: ① 진행 단계 그래프는 문서에서 뺌(입력 화면에만 — 내부 확인용) ② A4 인쇄용으로 글자 전반 키움(제목 28·값 16~18·사양 13.5) ③ **바탕색 전부 없앰**(잉크 절약 — 테두리·글자색만, 푸터도 줄+글자) ④ 쪽 구성 고정: **1쪽 SUMMARY**(TO·ATTN·FROM / ITEM NO.·MODEL·DELIVERY DATE 표 + 주문 조건 + 사진 + 번호 문구) → **SPECIFICATION**(2단 카드, 넘치면 CONT., 끝에 ARTWORK FILES·REMARKS) → **DESIGN DETAIL** 쪽들 ⑤ SUMMARY 문구 자동 번호(1. 2. …, 강조=빨강 굵게 밑줄) ⑥ 'We need to receive by…' 자동 문구 없앰(`poNeedText`는 직접 적은 need_text만, 자동 문장은 `poNeedTextAuto`로 남겨 둠) ⑦ QUANTITY·PRICE·DELIVERY 그룹(`poIsOrderGroup`)은 사양표에서 빼서 SUMMARY에 크게(그룹별 빨간 테두리 상자, 첫 줄 17px 빨강, 적은 칸만) — 입력 화면도 '📦 주문 조건' 칸으로 분리. 긴 값은 두 줄(사양 `rowH` 24자 넘으면 46px)
    - 6차: 1쪽 위 정보를 **한 표로 압축**(줄 높이 44, 값 14.5px) — TO·ATTN·FROM / ITEM NO.·MODEL·DELIVERY DATE 아래에 'ORDER TERMS' 줄을 이어 붙이고 주문 조건 칸을 한 줄 4칸으로 흘려 배치(그룹 첫 줄 = 주문 수량·단가·출고일 먼저·빨강, 긴 값 2칸, 마지막 칸이 남은 폭 채움). SUMMARY 사진이 남는 높이를 채움(최대 600)
    - 7차: 위 표의 DELIVERY DATE 칸은 빼고(ITEM NO. | MODEL NAME 두 칸), ORDER TERMS 첫 줄(높이 62) = 주문 수량 · 단가(18px) · **DELIVERY DATE**(= 기본 정보 납기일 `need_by`, 24px 빨강 + 빨간 테두리 칸 2칸 폭). 기본 DELIVERY 그룹에서 SHIP DATE (ETD) 뺌 — 예전 PO의 SHIP DATE 값은 납기일이 비었을 때만 DELIVERY DATE로 씀. SUMMARY 강조 밑줄은 문구에만(번호 제외)
    - 8차 (실제 인쇄 피드백): 옅은 회색 선이 인쇄에서 안 보여 선 색 진하게(LN #7a7a7a · LN2 #9e9e9e). 사진은 원본 크기를 읽어(`poImgDim`) 칸 안에서 **가장 크게 키워서** 그림(`poFitStyle` — html2canvas가 object-fit을 못 써서 직접 계산, 작은 원본도 꽉 차게). SUMMARY 번호 목록 위 제목 `IMPORTANT NOTES — MUST BE FOLLOWED`(현호님 선택)
    - SUMMARY '지난번 주문과 동일'(`PO_LAST_ORDER`)을 고르면 옆에 **지난 주문 달**(type=month, `l.date` 'YYYY-MM') 칸 → 문서엔 `SAME AS BEFORE (LAST ORDER: SEPTEMBER 2026)`(`poLineText`)
    - DESIGN DETAIL 큰 강조 문구도 선택(`PO_HEAD_OPT`): 없음 / SAME AS SAMPLE / SAME AS LAST ORDER(+ 지난 주문 달 `pg.hl_date` → 'SAME AS LAST ORDER (SEPTEMBER 2026)', `poHeadText`) / 기타 직접 입력(`pg._hother`)
    - 1쪽 위: 받는 곳·품번 표와 ORDER TERMS 표를 **따로**(사이 간격 + 'ORDER TERMS'는 막대 없는 작은 빨간 글씨 이름표 — 쪽 제목 SUMMARY의 빨간 막대와 구분. 붙어 있으면 입력칸처럼 보였음)
    - SUMMARY 줄 순서: ↑↓ 버튼으로 바꾸기, ★ 강조를 켜고 끌 때마다 강조한 줄이 위로 모임(묶음 안 순서 유지)
  - **해외 매입 건 = 작업요청서 대신 해외 PO (2026-10-08)**: `isOvsProject(p)` = 해외 매입 정보(supplier_overseas) 있음 또는 매입처가 해외 거래처 DB(`ovsClientKeys()` 캐시, `clientNameKey`)에 있음. 그러면 — 상담 국내 진행 카드 둘째 칸 = **해외 PO** 미리보기(`inqDocTileHtml(p,'po')`, 캐시 키 'po:프로젝트id'), 지금 할 일 작업요청 단계 = '해외 공장에 PO를 보내세요' + `po:` 버튼, `wr:` 동작도 po로, 보내기 메뉴 공장 줄 = 🌏 해외 PO, 국내 상세 = 작업요청서 칸 → '해외 PO' 칸(`renderProjectPoArea`, #view- iframe + 열기·PDF) · '작업요청서 만들기' 버튼 → '🌏 해외 PO 만들기·열기'(`createDocFromProject(id,'wr')`가 `openProjectPo`로 넘김)
    - 찾기 `findProjectPoNumber(p)`: status '해외작업요청서' 중 `디확번호_E%` 또는 `extra.project_id = 프로젝트 id`. 없으면 `doc-generator.html#po-new-pj-프로젝트id` → `poApplyProject`(디확 있으면 `poApplyDc`, 없으면 매입처=TO·담당=ATTN(비면 해외 거래처 DB contact_name, `poFillAttn`)·품목·수량·USD 단가·납기) + `po.project_id` 저장
    - 크게 보기: `#render-`가 해외 PO면 `poDocOptions`(모든 쪽을 세로로 이은 그림, scale 1.6) → `viewSavedDoc`에서 보내기·PDF·JPG 대신 '문서 생성기에서 열기'. `#view-`도 해외 PO 지원(`fitEmbedToViewport`가 `#poDocEl`을 통째로 scale → 칸 폭에 맞춰 첫 장만 보임)
  - **해외 PO 사양 — 손목/회중 + 선택지 (2026-10-08 4차)**: `po.watch_type` wrist(⌚ STRAP: TYPE/MATERIAL·COLOR·SIZE·BUCKLE, CASE에 WATER RESISTANCE) / pocket(🕰️ CHAIN: TYPE·LENGTH·PLATING/COLOR·CLIP, CASE에 CASE TYPE). `poSetWatchType`이 줄↔체인 그룹을 바꿔 끼우고 적은 값은 `po._alt`에 기억. 문서 사양 제목 = 'WRIST/POCKET WATCH SPECIFICATION'. 보편 항목은 `PO_OPT[항목]` = [영어(문서), 한글(화면)] 선택 → '한글 · English'로 보이고 문서엔 영어, 목록에 없으면 '기타 (직접 입력)'(`r._other`) → 글칸. 선택지 없는 칸(크기·수량·금액·날짜)은 `PO_PH` 예시. DELIVERY에 INCOTERMS(DDP/DAP/EXW/FOB) 추가. CASE에 `CASE BACK MATERIAL`(뒷판 소재 — 케이스와 같음·SUS316L/304·합금·황동·티타늄·투명 유리) — CASE BACK은 각인·인쇄·뒷판 방식, 예전 PO는 열 때 줄 자동 추가
  - SUMMARY 줄도 선택: `PO_SUM_OPT`(샘플과 동일 SAME AS SAMPLE / 지난번 주문과 동일 SAME AS BEFORE (LAST ORDER) / 한국 시간 SET TO KOREAN TIME (GMT+9) / 케이스 MADE IN CHINA 실크 6mm) + '기타'(`l._other`) → 직접 입력. 회중 CASE TYPE은 풀커버(Full cover)·윈도우커버(Window cover) — 예전 Hunter 값은 열 때 바꿈
  - **해외 PO (2026-10-08 3차 — 현호님 피드백)**: PO = Purchase Order(발주서) → 문서 제목 `PURCHASE ORDER`, 메뉴·버튼 이름 `🌏 해외 PO`(DB status는 그대로 '해외작업요청서'). 진행 단계는 **그래프**(원 3개를 선으로 잇고 지난 단계 ✓ CONFIRMED·날짜, 지금 IN PROGRESS, 다음 NEXT — 단계 날짜 = 컨펌 날짜, 새 문서 기본 '3D GRAPHIC'). 칸 이름: TO=받는 회사·ATTN=받는 사람·FROM=보내는 사람 이름만 / 품번=`ITEM NO.` / 모델명=`MODEL NAME` / 납기일=`DELIVERY DATE`. SUMMARY 글은 한 줄씩 입력(`summary.lines [{t,hl}]`, Enter=다음 줄, ★ 강조=빨간 띠 굵게; 예전 `summary.notes`는 열 때 강조 줄로 옮김). 사양 기본 그룹을 시계 공장 기준으로 다시 짬(`poDefaultSpec`: CASE 7·DIAL 4·HANDS 2·MOVEMENT 3·STRAP 4·PACKAGING 4·QUANTITY 3·PRICE 4·DELIVERY 4·QC 2, 칸마다 예시 `PO_PH`), 줄마다 ★ 강조(`rows[].hl`), 새 문서는 '빈 항목 빼기' 기본 켬, 문서에선 **2단 그룹 카드**(`pack`: 그 쪽에 들어갈 그룹 수를 정한 뒤 순서대로 두 단 높이가 비슷하게 나눔 — 이어지는 쪽에서 왼쪽만 길고 오른쪽이 비던 문제 2026-10-08 수정, 넘치면 다음 쪽)
  - **해외 작업요청서 (영문 Order Sheet, 2026-10-08)**: 문서 생성기 네 번째 모드 `🌏 해외 작업요청서`(`switchMode('po')`, 빨강 #E11D24). confirmations `status='해외작업요청서'`, 문서번호 `디확번호_E1…`/`POYYMMDD-N`, 값 전부 `extra`(= 전역 `po`: po_no·rev·date·to·attn·from(localStorage `po_from`)·model·stage(g3d/sample/order)+stage_dates·need_by/need_text·summary{imgs[{key,cap}],notes}·spec[{g,hl,rows[{k,v}]}]·hide_empty·files[{name,note}]·link·remarks·pages[{title,headline,file,notes,imgs}]), 사진은 `images_data.po {key:dataURL}`(1300px)
    - **디자인 = 디확·작지 결 (2026-10-08 개편, 현호님 요청)**: 머리 `OVERSEAS ORDER SHEET · WORK ORDER` + 로고·NO.·Rev·날짜, 빨강 그라데이션 줄, 진행 단계 3칸(지난 ✓ 베이지, 지금 빨강), 베이지 카드 2줄(TO·ATTN·FROM / STYLE·MODEL·REQUIRED BY), SUMMARY는 연회색 상자+빨강 이름표, 사양표·ARTWORK FILES·REMARKS는 둥근 표, 상세 페이지는 빨간 막대 제목+강조 상자+사진 카드, 쪽마다 검은 푸터(로고·영문 주소·PAGE n/N). 쪽 나눔은 `usable` 높이 계산
    - (처음 버전 구성 — 아래 내용은 그대로) 문서(여러 장, `buildPoDoc` async): 1쪽 = 로고·PO번호(빨강)·Rev / ORDER PROCESS 3단계(지난 단계 ✓, 지금 단계 검정) / DATE·TO·STYLE·MODEL·ATTN·FROM 밑줄 / SUMMARY 상자(사진 최대 4 + 빨간 요청 줄 + 'We need to receive by November 6th' 자동 영어 날짜) / WATCH SPECIFICATION 표(그룹 rowspan, 강조 그룹 빨강, 빈 칸 '-', 넘치면 'CONT.' 쪽으로) → ARTWORK FILES(파일 이름·설명·다운로드 링크 + QR — qrcodejs cdnjs 지연 로드) + REMARKS → 상세 페이지(제목·큰 강조 문구·사진 1~4 + 설명·빨간 요청·'Artwork file:' 줄). 쪽마다 바닥글 PAGE n/N
    - 기본 사양 그룹(`poDefaultSpec`): CASE(SIZE·MATERIAL·PLATING·LOGO·CASE BACK·CROWN·CRYSTAL) / DIAL / HANDS / STRAP·CHAIN / MOVEMENT·BATTERY / PACKAGING(BOX·WARRANTY·MARKING) / QUANTITY·PRICE(PAYMENT TERMS)·DELIVERY(SHIPPING·SHIP TO) — 빨강. 칸마다 예시(`PO_PH`)
    - 원본 AI 파일은 문서에 못 넣으니 **ARTWORK FILES**에 파일 이름 + 링크(QR)로 표시. `✨ 파일 이름 자동` = `PO번호_부위_v리비전.ai`(상세 페이지 file 칸도 채움). 수정본 보낼 땐 Revision
    - 디자인확인서 불러오기(`poApplyDc`, 연동 창 `_linkFor='po'`) → MODEL·ORDER 수량·납기·대표 사진 + 연결된 국내 프로젝트의 매입처(TO)·담당(ATTN)·해외 매입 단가(UNIT USD). 대시보드 상담 국내 진행 카드에 해외 매입 건이면 `🌏 해외 작업요청서` 버튼(있으면 `#edit-`, 없으면 `#po-new-디확번호`)
    - 출력: PDF(전체 쪽), JPG(쪽마다), 인쇄. 보내기(메일)는 아직 없음

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
- **견적 연결**: 상담 상세의 '이 상담으로 견적 작성'(`inqStartQuote` → `_inqPendingLink`, 견적 목록 상단 배너) 또는 `🔗 기존 견적 연결`(2026-10-07: 지금 할 일·연결된 견적 카드 버튼 → `inqOpenQuoteLinkPicker` 고르기 창, 후보 `inqLinkCands` = 상담 미연결 견적 묶음(날짜+매출처), `clientNameKey`로 같은 거래처((주)·띄어쓰기 무시)가 위, 검색으로 다른 거래처 견적도 — 거래처가 다르면 확인 후 `inqLinkGroup(id, date, client)`). 예전 셀렉트는 이름이 글자까지 같아야 떠서 '더모아커머스'/'더모아 커머스' 같은 견적이 안 보였음. 묶음 안 품목 추가는 묶음의 inquiry_id를 따라감. 견적 목록 매출처 칸에 '상담 보기' 칩
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
  - 화면: `inqRenderStage`(10칸 막대 — 상담·견적·수주·디자인확인·작업요청 + `INQ_PAY_STAGES` 선금 입금·잔금 입금·계산서 발행·공급처 송금·납품(2026-10 '납품·정산' 한 칸을 쪼갬) + '지금 할 일' 버튼 — 견적 작성/국내로 넘기기/디자인확인서·작업요청서 만들기/체크), `inqRenderProjs`(국내 진행 칸, 7개 체크 칩 = `inqToggleProjCheck`, 국내 메뉴와 같은 규칙), 고객 정보는 한 줄 요약으로 접힘(`inqContactSummary`)
  - 문서 만들기·국내 상세는 전역 `projects` 배열을 쓰므로 `inqEnsureProject`로 없으면 넣고 호출
  - 상태 목록: 신규/상담중/견적발송/수주/제작중/납품완료/정산완료/보류/실패. '진행 중' 필터 = 정산완료·보류·실패 제외
- **연결된 견적 품목 명세**: `inqQuoteItemHtml`/`inqQuoteBreakdown` — 품목마다 판매·매입 나란히 표(제품 단가×수량, 인쇄·포장·라벨·택배 금액 또는 '단가에 포함', 공급가·부가세·합계, 마진=판매합계−매입합계). 합계는 `calcTempRevenueWithVat`/`calcTempSupRevenueWithVat`와 동일
- **가견적 (migration 039)**: 디자인 확정 전 예상가 범위. `inquiries.pre_estimate` jsonb `{items:[{item,qty,min,max}], vat, lead, note, sent_at, sent_count}` — 견적(projects_temp)과 분리해 매출·마진·국내 등록에 안 섞임. `inqRenderPre`(보기/편집), `inqPreText`(고객용 안내문), `inqPreAction`: copy(클립보드) / send(우리 답변으로 기록 + sent_at + 상태 신규·상담중→**가견적**) / quote(견적 입력칸에 품목·수량 채우고 단가는 비워 확정가 입력). 상태 순서: 신규/상담중/가견적/견적발송/…
- **상세 화면 2단 배치**: 위(`.inq-head`) = 거래처·상태·제목 한 줄 + 고객 정보 입력칸 2줄(`#inqFields.inq-hfields`: 담당자 줄·회사 줄, 항상 보이고 바로 수정) + 단계 막대 / 아래 `.inq-body2` = 왼쪽 `.inq-main`(대화 기록, 화면 높이 전체 + 입력칸) · 오른쪽 `.inq-side`(따로 스크롤: `#inqNow` 지금 할 일 → 다음 할 일 → 가견적 → 견적 → 국내 진행 카드). 카드 접기 상태는 localStorage `inq_card_{pre,pj}`·`inq_q_open`. 견적·가견적은 좁은 패널용 품목 카드(`.inq-qi`)로 표시(표 아님). 1100px 이하는 위아래로 쌓임
- **사용법 안내 (상담·견적만)**: 화면 오른쪽 위 `사용법` 버튼 → `tpStartTour()` 가이드 투어(`startTour(steps)` 범용 엔진: 대상 요소 강조 + 설명 말풍선, 이전/다음/Esc, 대상 없으면 가운데 안내). 처음 들어온 사람은 `tpInitView`→`tpMaybeAutoTour`로 한 번 자동(localStorage `tour_tp_v1`). 버튼 설명은 `TP_HELP`(선택자→문구)를 MutationObserver로 `data-help`에 붙이고 마우스 올리면 `.help-tip`. 버튼/흐름이 바뀌면 `tpTourSteps()`·`TP_HELP`도 같이 고칠 것
- **입력칸 DB화 (migration 041, 대표님 피드백)**: inquiries에 company_address/company_fax/company_website, items jsonb [{name,qty,tbd?}] (tbd=수량 미정 체크), due_date, budget, purpose, print_request, packaging_request, sample_needed('필요'/'불필요'), delivery_address. 새 상담 화면 = 붙여넣기 → 기본 → 담당자 → 회사 정보 → 요청 사항 + 오른쪽 **상담 체크리스트** `INQ_REQ_CHECK`(13개, 전화 선택 시 '전화 상담 순서'로 강조, 누르면 그 칸으로). AI(`_inquiry-extract.js`)·규칙(`inqParseExtra`: 팩스·홈페이지·주소)이 새 칸도 채움, 품목은 `inqApplyItems`. 제목이 비면 품목·수량으로 자동. 상세 화면 오른쪽 **요청 사항** 카드(`inqRenderReq`, 바로 수정·저장, 모르는 항목은 질문과 함께). 거래처 자동 추가 트리거가 주소·팩스도 넣음. 이 상담으로 견적 작성 시 첫 품목·수량 미리 채움
- **기록 수정**: 타임라인 연필 버튼 → `inqEditLog`(글·사진·고객/우리/메모·경로 수정, `inquiry_logs.edited_at` → '수정됨' 표시). 자동 기록(system)은 수정 불가
- ⚠️ `inquiry_logs`를 배열로 한 번에 insert할 때는 모든 행의 키를 같게 — `images`가 NOT NULL이라 한 행에서 빠지면 전체가 거부됨
- **목록 정렬**: 상태 칩 아래 `최근순 | 급한 일 먼저`(`_inqSort`, localStorage `inq_sort`, 기본 최근순). 최근순 = `last_contact_at` 내림차순, 급한 일 먼저 = 오늘·지난 '다음 할 일'(`inqIsOverdue`) 먼저 → 최근 연락 순. 버튼 옆 빨간 숫자 = 급한 상담 수
- **최근 활동 시각 (migration 056)**: `inquiry_logs`에 기록이 생기면(상태 변경·국내 등록·할 일·발송 같은 자동 기록 포함) 트리거 `inquiry_logs_touch_inquiry`가 `inquiries.last_contact_at`을 그 시각으로 당김(앞으로만, 미래 시각은 now로). 앱은 `inqAddLog`에서 목록 항목 시간도 바로 바꿔 다시 정렬. 예전엔 대화 기록 일부만 바꿔서 상태를 바꿔도 '5일 전'으로 남았음
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
- **2026-10-06 상담·견적 화면 기준으로 맞춤**: 목록 폭 `clamp(300px,19vw,360px)`, 화면 높이 고정(`.pl-wrap` height calc(100vh-…)) + 목록·본문·정보 패널 각자 스크롤(`renderPlanning`이 `.pl-main`/`.pl-side` 스크롤 유지), 목록 위 = 제목 한 줄 + 검색·새 프로젝트 한 줄 + 상태 칩(상담 칩과 같은 크기), 목록 행 = 상담 목록과 같은 모양(위 작은 줄 상태·가족·D-day / 이름 16.5px / 진행률 / '다음 할 일' 상자 — 급하면 빨강), 오른쪽은 흰 패널 하나(머리 19px + 본문 | 정보 clamp(320px,30%,440px) 회색 배경)
- **할 일 / 자료·제안 분리 (migration 049)**: `planning_posts.kind` = task(진행 상태·마감·담당) / note(제안·조사·자료 — 상태 없음). 기존 글은 제안·조사·자료 중 담당자·마감 없는 것만 note로 옮김. 진행률·지금 할 일·요약·홈 '내 할 일'·보드는 task만(`planningTasksOf`)
  - 본문 탭 `✅ 할 일 | 📎 자료·제안`(`planningTab`, localStorage `pl_tab`). 자료 탭 = 사진 카드 바둑판(`planningNotesHtml`, 분류 칩, 검토 중 제안이 먼저), 올리기 `openNewPlanningNote(category)`(작성 창에서 마감·담당 숨김)
  - 제안 상태 `note_status` review(null)/adopted/hold. `planningAdoptProposal` → 할 일 생성(`ref_ids`=[제안 id], 담당자 있으면 일일계획표) + 제안 '채택'
  - `ref_ids`: 할 일에 연결된 자료. 상세 창 '관련 자료'(`planningLinksHtml`, `+ 자료 연결` = `planningOpenLinkPicker`/`planningSaveLinks`), 자료 상세엔 연결된 할 일. 잘못 분류된 글은 상세 창 `할 일로 옮기기`/`자료·제안으로 옮기기`(`planningConvertKind`)

## 폰 전용 간단 화면 (2026-10, app.js 끝 `mInit` 이하)
- 화면 폭 820px 이하면 `#mRoot`(index.html `#app` 맨 앞, z-index 260 — 모달 300·토스트 400·체크 입력창 10080보다 아래)가 전체 화면을 덮음. 아래 탭 4개: ☀️ 내 하루 · ✅ 계획표 · 📁 프로젝트 · 💼 매입매출 (마지막 탭 localStorage `m_tab`)
- `PC 화면` = localStorage `m_full=1` → 원래 대시보드, 오른쪽 아래 `📱 간단 화면`(`#mBackSimple`)으로 복귀. 상세 화면의 `PC 화면에서 열기`(`mOpenFull`)는 해당 메뉴·상담·프로젝트를 바로 엶
- **저장은 전부 기존 함수**: 내 하루 = `tbxLoad`/`tbxUpdate`/`tbxToggleBig3`/`tbxParse`, 계획표 = `dailyTasks`·`toggleTask`·`dbInsertTask`(사람 칩: 나·전체·임원·대표님·`getVisiblePeople`), 프로젝트 = `planningToggleDone`/`planningSetTaskStatusQuiet`/`planningCreateTask`(PC 빠른 추가와 공용)/`openPlanningPostDetail`, 매입매출 = 상담 `inqLoadTodos`/`inqLoadLogs`/`inqLoadDeal`/`inqTodoToggle`/`inqAddLog`/`inqPatch`/`inqToggleProjCheck`(열 때 `_inqSel`을 그 상담으로), 국내 = `domesticProjects`·`toggleProjectCheck`
- 상담 상세는 `대화 | 할 일 | 진행` 탭(`mInqTab`). 대화 = PC와 같은 말풍선(고객 왼쪽 흰색·우리 오른쪽 파랑·메모 가운데 노랑·자동 기록 작은 글, 날짜 구분), 입력창은 화면 아래 고정(`mInqComposerHtml`, mRender의 footer 자리), 열면 맨 아래(최신)로 스크롤(`mScrollBottom`)
- 갱신: `mInit`이 `renderDaily`·`renderProjects`·`renderPlanning`·`inqRenderList`를 감싸서 저장·실시간 갱신 때 `mRefreshSoon`. `mRender`는 입력 중 값·포커스·스크롤 유지. 상세 화면은 `history.pushState({mDepth})` → 폰 뒤로가기로 목록 복귀(`mOnPop`)
- 폰에서 안 하는 것(일부러): 새 상담·견적 작성, 새 프로젝트, 사진 올리기, 시간 배치 → PC 화면 안내
- 위젯: 안드로이드 앱 위젯은 `syncAndroidWidget`(오늘 할 일·요약). 아이폰 위젯은 아직 없음(Scriptable 방식 예정)

## 납기·배송 서류 간 자동 공유 (migration 053)
- 납기·배송(납기일·받는 분·연락처·주소)을 어느 서류에 적든 **비어 있는 칸만** 서로 채움(덮어쓰지 않음). DB 트리거라 앱 코드가 어디서 저장하든 동작
  - `confirmations_share_shipping`: 디자인확인서·작업요청서 저장 → `source_doc_number`로 연결된 국내 프로젝트 빈 칸 (`delivery_address`는 JSON ["받는 분","연락처","주소"] → `ship_parts()`로 풂, 구버전 'a / b / c' 호환)
  - `trg_zz_projects_domestic_fill_shipping`(BEFORE, set_company_id 다음에 돌게 이름 zz): 국내 프로젝트가 디확(`source_doc_number`)·상담(`inquiry_id`)과 연결될 때 그쪽 값으로 빈 칸. 상담은 due_date→납기, delivery_address→주소(이때 받는 분·연락처는 상담 담당자)
  - `projects_domestic_share_to_inquiry`: 국내 프로젝트 납기·주소 → 연결된 상담의 빈 희망 납기·배송지
- DC를 먼저 저장하고 나중에 프로젝트에 `source_doc_number`를 붙이는 순서(doc-generator saveToDb)라서 양쪽 트리거가 모두 필요
- 앱: `createDocFromProject`가 문서 만들기 전에 DB에서 납기·배송 최신값을 다시 읽음 (전역 `projects`가 낡았을 수 있어서)
- **상담 화면 디확·작지 버튼 = 보기**: 국내 진행 카드·지금 할 일의 `dc:`/`wr:`는 저장된 문서가 있으면 `viewSavedDoc`(숨은 iframe `#render-`로 그린 이미지 + 보내기·PDF·JPG·편집 버튼, 편집은 `doc-generator.html#edit-문서번호`), 없을 때만 `createDocFromProject`(만들기). 문서번호 찾기는 `inqSavedDocNumber`, iframe 로드는 `loadSavedDocOpts` 공용
- **국내 진행 카드 미리보기 2칸 (2026-10-06)**: 품목마다 `디자인확인서 | 작업요청서` 그림 칸(`inqDocTileHtml`, A4 비율, 없으면 점선 '＋ 만들기'). 누르면 `viewSavedDoc` 크게 보기. 그림은 `getSavedDoc(문서번호)`가 숨은 iframe 하나로 **차례대로**(`_docFrameChain`) 그려 `_savedDocCache`(원본 jpg + 작은 그림 + 보내기 opts, opts.makeCanvas는 원본 jpg에서 다시 만듦 → iframe 지워도 보내기 됨)에 기억 — 보기·보내기·미리보기 모두 이걸 씀(페이지 새로고침 전까지). WR 문서번호는 `_inqDocNum`에 기억. 채우기는 `inqFillDocTiles`(상담 바뀌면 중단)
- **작업요청서 납기일 → 출고 확인 할 일 (migration 054)**: `confirmations_wr_ship_todo` 트리거 — 작업요청서(status '작업요청서')에 납기일이 있으면, DC번호(문서번호 앞 두 마디)로 연결된 국내 프로젝트의 상담에 `inquiry_todos` "(공급처) 출고 확인하기"(due=납기일, 담당=상담 '우리 담당' → 없으면 WR 요청자 이름) + 그 사람 `daily_tasks`([거래처] …, label 회사 업무) + 상담 타임라인 자동 기록 + `next_action` 요약 갱신. 같은 WR은 `inquiry_todos.source_key='wr-ship:문서번호'`로 한 번만, 납기일 바꾸면 날짜가 따라감(완료 전만). 기존 WR은 소급 안 함

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
- **품목 칸 (migration 055)**: `clients.items`(주로 거래하는 품목, 쉼표 구분). 거래처 모달(회사명 아래)·상세·표(회사명 옆, 인라인 편집)·검색. 상담 품목(`inquiries.items`)이 있으면 거래처 품목 **빈 칸**에 자동(`inquiries_ensure_client`, `inquiry_items_text()`; 트리거가 items 변경에도 돎). 기존 상담 품목으로 한 번 채움
- 자동 추가 제외 이름에서 '테스트'를 뺌(2026-10 시연 때 '테스트' 회사가 거래처 DB에 안 생겨 혼란) — 남은 제외: 개인·자체·본사·기타·고객·개인고객·(모름/미정/없음/미상 포함)
- **사업자등록증 자동 입력**: 새 고객사/수정 모달 위 `bizregBoxHtml` — 사진·PDF(끌어놓기·Ctrl+V·파일 선택) 또는 복사한 글 → `/api/meeting-summarize?kind=bizreg` → `api/_bizreg-extract.js`(Claude 비전, PDF는 document 블록). 빈 칸/자동 입력 칸만 채움. AI 실패 시 글이면 `bizregParseText` 규칙으로. `bizregDupCheck`가 사업자번호·이름으로 기존 거래처 경고

## 디자인확인서 컨펌 · 작업요청서 발송 채널·날짜 / 선금·잔금 입금 날짜 (migration 044·045·046)
- 선금·잔금·계산서·납품·공급처 송금은 `CHECK_INFO`의 `noChannel: true` — 날짜만(advance_payment_date / final_payment_date / invoice_date / delivered_date / supplier_payment_date, migration 046·047·048). 단계 막대 날짜도 입력한 날짜 우선
- 공통 설정 `CHECK_INFO` (design → design_confirm_*, workOrder → work_order_*), 입력창 `askCheckInfo(key)`. 아래 044 설명은 design 기준이며 workOrder도 똑같이 동작
- `projects_domestic.design_confirm_channel`(카톡/이메일/문자/기타 직접 입력한 글) · `design_confirm_date`
- 디확 컨펌을 **켤 때** `askDesignConfirm()` 창(채널 버튼 + 기타 글칸 + 날짜, 취소 시 체크 안 함) — 국내 목록·상세(`toggleProjectCheck`), 상담 화면(`inqToggleProjCheck`). 편집 창은 체크 아래 `designConfirmFieldsHtml('editDc')` 칸. 끄면 채널·날짜 지움. '완료'로 자동 체크될 땐 기존 값 유지
- 상담 타임라인 자동 기록: "디자인확인서 컨펌 · 품목 (카톡 · 9/30)", 단계 막대 디자인확인 날짜는 컨펌 날짜 우선

## 보내기 — 견적서·디자인확인서·작업요청서 메일·카톡 '발송 직전까지' (2026-10, migration 050)
- 공용 모듈 `send-kit.js` (index.html·doc-generator.html 둘 다 로드, 단일 파일 원칙의 예외 — 두 페이지가 같이 써야 해서). `SendKit.configure({load, save})` + `SendKit.open({docType, title, vars, to, fileBase, makeCanvas, onSent})`
- 버튼: 상담·견적 견적서 창 `📤 보내기`(`sendTempQuote` — 받는 사람은 연결된 상담 담당자 이메일 → 거래처 DB staff_email/email, `{합계}`는 `renderTempQuoteDoc`가 `g._quoteGrand`에 기록, 상담 연결 시 '보냈어요' → 상담 기록(우리·채널)), doc-generator의 DC·WR·견적서 미리보기 `📤 보내기`(`sendDoc('dc'|'wr'|'quote')`, 거래처 DB에서 이메일)
- 양식: `send_templates`(doc_type quote/dc/wr × channel email/kakao, 회사 공용, 행 없으면 send-kit.js `DEFAULTS`). 창 아래 `✏️ 양식 수정`에서 `{거래처} {담당자} {품목} {수량} {합계} {납기} {문서번호} {작성자}` 칸으로 편집
- 메일: 네이버웍스 메일쓰기 주소 `https://mail.worksmobile.com/w/compose?orderType=new&to=&subject=&body=`가 칸을 채워줌(2026-10 실제 확인, 줄바꿈 OK) → `메일쓰기 열기 + PDF 내려받기`. **첨부만** 직접 끌어다 놓기. body는 **HTML도 받음**(굵게·링크·이미지). 단 body를 넣으면 네이버웍스 기본 서명이 사라져서 → 본문(`textToHtml`) 끝에 **회사 서명 HTML**(`SIG_DEFAULT`=네이버웍스 기본 서명을 옮김, `send_templates` doc_type 'sig'로 고칠 수 있음 — 양식 수정 → 서명 미리보기·HTML, migration 052)을 붙여 한 번에 채움. '회사 서명 붙이기' 체크(localStorage `sk_sig`). 붙여넣기 없음. 양식 끝은 `{작성자} 드림`만(회사 정보는 네이버웍스 서명), {작성자}=로그인한 사람 이름(직함 없이), 첫인사는 `{작성자직함}`('김현호 팀장', app.js `sendMyTitle`/doc-gen `getLoginManager`). 기본 양식(2026-10 현호님 문구): 제목 `[케이엘피코리아] {거래처} {품목} 디자인확인/견적 확인/작업/가견적 안내 요청의 件`, 본문 '안녕하세요, {거래처} {담당자}님 / 케이엘피코리아 {작성자직함}입니다.' → 내용 → '{작성자} 드림'. 디자인확인서는 `[디자인확인서 요약]` 수량·{단가}('140,000원 (VAT 포함)')·{합계}(DC `_est.grand`, VAT 포함)·{납기일}('10월 6일 택배 출고' — 납기+배송 방법) — doc-gen `sendDocOptions`가 채움. 견적서(`[견적서 요약]` + 유효기간 7일)·작업요청서(`[작업요청서 요약]`, 총합=`_wrEst.grand`)도 같은 모양. 상담·견적 견적서(`sendTempQuote`)는 {단가}=첫 품목(여러 개면 ' 외'), {납기일}=상담 희망 납기(택배비 있으면 '택배 출고')
- 디자인확인서·작업요청서는 화면 이동 없이: `sendSavedDocHere(문서번호)`가 숨은 iframe `doc-generator.html#render-문서번호`를 열고, doc-generator의 `window.klpDocReady`(→ `sendDocOptions`)가 돌려준 정보로 부모 화면에서 `SendKit.open` (문서 이미지는 iframe 안 html2canvas). `#send-문서번호`는 문서 생성기에서 직접 보내기용으로 남아 있음
- **상담 화면 `📤 보내기`** (머리줄 `#inqFSend`, 폰 상담 상세에도): 메뉴(`inqSendMenu`) — 연결된 견적서(→ `openTempQuote`+`sendTempQuote`), 💡 가견적 안내(`pre`, 첨부 없음, {내용}=`inqPreText`에서 제목·서명 뺀 부분, '보냈어요'= `inqPreMarkSent` → 상태 가견적), ✉️ 안내 메시지(`msg`, 글만, '보냈어요'=`inqSendLogged`), 디자인확인서·작업요청서(저장된 문서가 있으면 `inqSendSavedDoc` → `doc-generator.html#send-문서번호`로 그대로 열어 보내기 창 자동 — `createDocFromProject`는 덮어쓰기 확인이 떠서 보내기에 안 씀, 없으면 만들기). 첨부 없는 종류는 send-kit에서 파일 칸·이미지 복사가 빠짐(`makeCanvas` 없음). migration 051로 doc_type에 pre·msg 추가
- 카톡: PC = ①문서 이미지 복사(ClipboardItem png, Promise로 넘겨 버튼 권한 유지) ②문구 복사 → 채팅방 Ctrl+V / 폰 = `navigator.share({files, text})` 공유 시트(문구는 미리 클립보드에도). 문서 이미지는 창을 열 때 미리 만들어 둠(공유·복사는 클릭 직후에만 허용)

## 문서 생성기 (DC/WR) 연동
- **화면 틀 (2026-10-08)**: 대시보드와 같은 구조 — 왼쪽 고정 사이드바 230px(`.mode-bar`를 CSS로 세로 배치: 로고 · ← 대시보드로 · '문서 종류' · 4개 문서 버튼(아이콘+이름+작은 설명, 선택 = 문서 색 옅은 바탕 + 왼쪽 막대)) / 위 고정 제목줄(`.sub-bar` 안 `.dg-title` 문서 이름 + 새로 입력·히스토리 탭) / 입력칸은 왼쪽부터(최대 1100px). `body:not(.view-mode):not(.quote-only-mode)` + 821px 이상에서만 — 임베드(#view-)·단독 견적서·폰은 예전 모양
- **생성 흐름**: 프로젝트 진행사항 → 상세/편집 모달의 `📄 디자인확인서 만들기` / `📋 작업요청서 만들기` 버튼 → `doc-generator.html`로 이동하여 pre-fill
  - 프로젝트 데이터는 `localStorage.klp_doc_prefill`로 전달 (doc-generator가 로드 시 읽고 즉시 삭제)
  - DC는 매출 필드로, WR은 매입(`supplier_*`) 필드로 pre-fill
- **DB 분리**: doc-generator는 `confirmations` 테이블에만 쓰고, `projects_domestic`에는 쓰지 않음
- **자동 연결**: DC 저장 성공 시 `projects_domestic.source_doc_number`를 새 문서번호로 PATCH (프로젝트 상세에서 DC 이미지 미리보기 연동)
- **WR 전제 조건**: WR 만들기는 프로젝트에 `source_doc_number`(연결된 DC) + `supplier_unit_price`(매입 단가)가 있어야 동작
- **제작진행표 (2026-10-08, migration 058)**: 시계 제작 주문 **내부 문서**(작업요청서의 내부용, 외부 발송 없음). 문서 생성기 세 번째 모드 `🕐 제작진행표`(`switchMode('ps')`, 보라 #7C3AED). confirmations에 `status='제작진행표'`, 문서번호 `디확번호_P1·_P2…`(디확 없이 만들면 `PSYYMMDD-N`), 표 전용 값은 `confirmations.extra` jsonb `{order_date, order_phone, ship_note, place, dc, parts:[{name,qty,color,print,maker,note}]}`
  - 칸: 담당자·일자 / 발주처·발주일·발주처 담당자·연락처 / 제품명(품번)·총수량·단가 / 납품일+납품 방식·납품처 / 이미지(점선 칸) / 부품표(기본 10줄 `PS_PARTS_DEFAULT` 무브먼트~선물포장, 이름 수정·추가 최대 14줄) / 빨간 '대외비' 문구. A4 그리기 `buildPsDoc`(줄 높이 자동, 이미지 칸이 남는 높이 차지), JPG·PDF·🖨️ 인쇄(`psPrint`), 히스토리(`psLoadHistory`)
  - `📋 디자인확인서에서 불러오기` = 기존 연동 창 재사용(`window._linkFor='ps'` → `selectLinkedDC`가 `psApplyDcById`로 넘김) → 발주처·담당자·제품·수량·단가·납기·배송(납품 방식)·주소·이미지 + 거래처 DB 담당자 휴대폰(`staff_mobile`)
  - **부품별 사진 (2026-10-08)**: 메인·추가 이미지 대신 `PS_IMG_SLOTS` 8칸(요약·케이스·문자판·뒷백·바늘·밴드·보증서·패키지박스), 칸마다 1장 — 클릭·끌어놓기·마우스 올린 칸에 Ctrl+V(`psImgTarget`). 저장은 images_data `{main:요약, subs:[], ps:{키:base64}}`(요약 1000px·나머지 640px), 읽기 `psParseImgData`(옛 문서는 main→요약). 문서에선 점선 영역을 **A4 높이에서 남는 만큼** 계산해 4열×3행 격자(요약 2×2, 패키지박스 가로 2칸 → 12칸 꽉 참), 빈 칸은 이름표만
  - **문서 디자인 (2026-10-08 개편)**: 처음엔 종이 양식(굵은 격자표) 그대로였으나 현호님 요청으로 **디확·작지와 같은 결**로 — 머리 `PRODUCTION SHEET · INTERNAL` + 제목 + 오른쪽 로고·NO.·일자, 보라 그라데이션 줄, 베이지 카드(발주처·담당자·연락처·우리 담당, 자사 제작이면 보라), 작업요청서식 2단 표(제품명·수량·단가·발주일 | 납품일·납품 방식·납품처·연결 문서), 연회색 사진 영역, 둥근 부품표(줄무늬), 보라 테두리 대외비 박스, 어두운 푸터(로고·주소). 칸 높이는 전부 고정값이라 `buildPsDoc`에서 사진 영역 높이를 계산(숨은 상태에서 그려도 됨)
  - **자사 제작**: 발주처 제목 옆 `🏠 자사 제작 (본사)`(`psUseHq`, `PS_HQ` = 케이엘피코리아 (본사)·02-2103-5757·구로 본사 주소, 담당=로그인한 사람) → 납품 방식 '본사 보관·사용' + 납품처 본사 주소. **납품 방식** 칩 `PS_SHIP_OPTS`(일괄 출고 기본·택배 출고·분할 출고·직접 납품·본사 보관·사용, 직접 입력도 됨, `psSetShip`/`psMarkShip`). 문서 '납품일' 칸 = 날짜 + 납품 방식
  - 저장 `psSaveAndPreview`(같은 번호면 수정, 충돌 시 다음 번호). `loadRecord`가 제작진행표면 `psFill`. 디확·작지 히스토리·연동 창·`#render-`에서는 제작진행표를 따로 처리(디확으로 섞이지 않게)
  - 대시보드: 상담 국내 진행 카드 `🕐 제작진행표` 버튼(`inqDealAction` 'ps') — 있으면 `viewSavedDoc` 크게 보기(보내기 버튼 대신 '내부 문서' 표시), 없으면 `doc-generator.html#ps-new-디확번호`로 이동해 디확 내용 불러옴. `inqSavedDocNumber(row,'ps')`

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
