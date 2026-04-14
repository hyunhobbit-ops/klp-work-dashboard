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
- `profiles` 테이블: id, name, password, role
- `projects_domestic` 테이블: 국내 프로젝트. **매출 + 매입 통합 단일 행 모델** (부모/자식 구조 아님)
  - 매출: `unit_price`, `unit_price_vat`, `print_fee`, `packaging_fee`, `revenue` 등
  - 매입: `supplier`, `supplier_contact`, `supplier_unit_price`, `supplier_print_fee`, `supplier_packaging_fee`, `supplier_revenue` 등 `supplier_*` 9개 컬럼
  - `parent_project_id`는 레거시이며 더 이상 사용하지 않음
  - `source_doc_number`: 연결된 디자인확인서 `doc_number` (DC 저장 시 자동 업데이트)
- `confirmations` 테이블: DC/WR 문서 저장 (`doc-generator.html` 전용)
- RLS 정책: 전체 조회 허용
- 로그인 시 localStorage에 사용자 정보 저장 (`klp_user`)

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
