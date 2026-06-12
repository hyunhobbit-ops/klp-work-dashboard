# 택배 이미지 자동입력 설계 (2026-06-12)

## 목적
"새 택배" 입력 모달에서 이미지(번개장터/당근 주문 캡처, 카톡·문자 주문 대화, 주문서·송장)를
선택하면 AI가 분석해 **주소 관련 필드를 자동으로 채워** 입력 시간을 줄인다.

## 범위
- **자동 채움:** 받는이(recipient), 연락처(phone), 우편번호(zipcode), 주소(address), 품목(product), 종류(번개/당근/중고 등 플랫폼 추론), 판매가(상품금액)
- **자동 안 함(직원 선택):** 발송인, 선/착불, 날짜, 배송메모
- 한 번에 **1건** 추출 (이미지에 여러 명 있어도 가장 명확한 1건). 여러 건은 향후 과제.

## 아키텍처
정적 사이트(Vanilla JS) + Vercel. AI 키 노출을 막기 위해 **Vercel 서버리스 함수**로 프록시.

```
[새 택배 모달]
  📷 "이미지로 자동입력" 버튼 + 숨은 file input
      ↓ 이미지 선택 → 클라이언트에서 최대 1568px로 리사이즈 + JPEG 압축(base64)
  POST /api/analyze-delivery   (Authorization: Bearer <Supabase access_token>, body: {image})
      ↓
  서버리스 함수:
    1) Supabase 토큰 검증 (GET /auth/v1/user) — 로그인 직원만 허용
    2) Anthropic Messages API 호출 (vision + 도구로 구조화 JSON 강제)
    3) { recipient, phone, zipcode, address, product } 반환
      ↓
  폼 필드 자동 채움 (빈 값은 비워둠) → 직원이 확인/수정 후 저장
```

## 서버리스 함수 (`api/analyze-delivery.js`, CommonJS, 의존성 0 — fetch 직접)
- env: `ANTHROPIC_API_KEY` (Vercel 환경변수), `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- 모델: 빠르고 저렴한 비전 모델 기본(`claude-haiku-4-5`), 필요 시 상향
- Anthropic 도구(tool) 1개 정의 → `tool_choice`로 강제해 항상 JSON 구조 반환(파싱 안전)
- 입력 이미지 토큰 절약: 클라이언트 리사이즈 + `image/jpeg`
- 보안: 토큰 무효/누락 → 401. 키 미설정 → 503 + 안내 메시지.
- 에러는 사용자 친화 메시지로 매핑(인식 실패/네트워크/한도초과).

## 프론트엔드 (`app.js`)
- 새 택배 모달 상단에 버튼 + `<input type=file accept=image/*>` (숨김)
- `analyzeDeliveryImage(file)`:
  1) 이미지 → canvas 리사이즈(최대 1568px) → `toDataURL('image/jpeg', 0.8)`
  2) `sb.auth.getSession()`에서 access_token 획득
  3) `/api/analyze-delivery` POST
  4) 응답으로 `newDelRecipient/newDelPhone/newDelZipcode/newDelAddress/newDelProduct` 채움
  5) 연락처는 기존 `formatPhoneInput` 규칙으로 하이픈 정리
  6) 로딩 표시(버튼 비활성+"분석 중...") / 실패 토스트
- 자동입력은 "초안" — 최종 저장은 직원이 확인 후 수행(기존 addDelivery 그대로)

## 사용자 준비물 (1회)
- Anthropic 계정 + 결제수단 등록 → API 키 발급
- Vercel 프로젝트 환경변수에 `ANTHROPIC_API_KEY` 등록(대시보드에서 직접 — 키를 채팅에 붙여넣지 않음)

## 비용/안전
- 이미지 1장 ≈ 5~20원. 클라이언트 리사이즈로 토큰 최소화.
- 함수는 로그인 직원만 호출 가능(Supabase 토큰 검증)하여 키 남용 차단.

## 테스트
- 번개장터 주문 캡처(예: 김태훈/속초)로 받는이·전화·우편번호·주소 정확 추출 확인
- 키 미설정 상태에서 우아한 안내(503) 확인
- 비로그인/잘못된 토큰 → 401 확인
