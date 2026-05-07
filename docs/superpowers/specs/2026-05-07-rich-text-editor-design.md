# 프로젝트 카드 본문 리치 텍스트 에디터 도입

**작성일**: 2026-05-07
**범위**: 기획 보드(Planning Board) 카드의 "내용" 입력 영역 4곳을 Quill 기반 리치 텍스트 에디터로 교체

---

## 배경

현재 기획 보드 카드의 "내용" 필드는 plain text `<textarea>` (`app.js:10825`, `app.js:10902`, `app.js:10960`, `app.js:11181`). 사용자는 글자 크기·글꼴 등 서식과 본문 이미지 붙여넣기를 원함. 별도 "📷 이미지 첨부" 섹션은 카드 썸네일 용도로 그대로 유지.

## 적용 범위

리치 텍스트 에디터로 교체할 입력 영역:

1. **새 카드 생성** — `openPlanningPostEditor()` 내 `<textarea id="planningPostContent">` (`app.js:10902`)
2. **카드 편집** — `openPlanningCardEdit()` 내 `<textarea id="planningPostContent">` (`app.js:10960`)
3. **새 답글 작성** — `openPlanningPostDetail()` 내 임베드된 답글 입력 textarea (`app.js:10825`) — 카드 상세 팝업 하단에 펼쳐져 있음
4. **답글 편집** — `openPlanningReplyEdit()` 내 `<textarea id="planningPostContent">` (`app.js:11181`)

네 영역 모두 동일한 빌더 함수로 에디터를 마운트해 일관된 툴바/스타일 사용.

## 기술 선택

- **에디터**: Quill 2.0.2 (CDN)
- **HTML 정화**: DOMPurify 3.1.6 (CDN) — 화면 출력 시 XSS 방지
- **CDN 추가 위치**: `index.html` `<head>` 또는 `<body>` 끝
  - `https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css`
  - `https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js`
  - `https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js`

## 툴바 구성

```
[글꼴 ▾] [크기 ▾]  |  B  I  U  S  |  [글자색]  [배경색]  |  좌·중·우  |  목록·번호목록  |  인용  |  링크  이미지  |  서식 지우기
```

- **글꼴**: 기본 / Pretendard / 나눔고딕 / 맑은 고딕 / Serif / Mono
- **크기**: 작게(`small`) / 보통(기본) / 크게(`large`) / 매우 크게(`huge`) — Quill 기본 4단계
- **색상 팔레트**: Toss 디자인 시스템 변수 + Quill 기본 팔레트
- **이미지 입력 경로 3가지**:
  1. 툴바 이미지 버튼 → 파일 선택
  2. Ctrl+V (또는 Cmd+V) 클립보드 붙여넣기
  3. 에디터 영역 드래그 드롭

## 데이터 모델

| 항목 | 변경 전 | 변경 후 |
|------|--------|--------|
| `planning_posts.content` 컬럼 | TEXT (plain text) | TEXT (HTML 문자열) — **DDL 변경 없음** |
| 기존 plain text 데이터 | — | 그대로 표시 가능 (HTML로 해석되어도 escape된 텍스트로 보임). 한 번 편집·저장하면 HTML로 업그레이드 |
| 본문 인라인 이미지 | 없음 | base64 data URL로 `content` HTML 안에 인라인 |
| 첨부 이미지 섹션 (`post.images`) | Supabase Storage URL 배열 | 변경 없음 (그대로 유지) |

### 본문 이미지 크기 제어

- 사용자가 붙여넣은 이미지가 **1.5MB 초과** 또는 **가로/세로 1600px 초과**면 자동 리사이즈
- 리사이즈는 캔버스 기반: 최대 변 1600px로 다운스케일, JPEG 0.85 품질로 재인코딩
- 리사이즈 적용 시 토스트로 알림 ("이미지 크기를 조정했습니다")
- 처리 후에도 5MB 초과면 거부 + 에러 토스트

## 화면 표시 (display side) 변경

`planningEsc(post.content)`로 HTML 이스케이프해 출력하던 곳을 다음과 같이 분리:

| 위치 | 파일/라인 | 변경 후 |
|------|----------|--------|
| 카드 미리보기 (line-clamp 4줄) | `app.js:10542` | `planningHtmlToText(post.content)`로 plain text 변환 후 출력 |
| 카드 상세 본문 | `app.js:10815` | `DOMPurify.sanitize(post.content)`를 `.ql-editor` 클래스 컨테이너 안에 `innerHTML`로 출력 |
| 답글 본문 | `app.js:10783` 부근 | DOMPurify로 sanitize 후 `innerHTML` 출력 |
| 카드 인덱스 미리보기 (60자 slice) | `app.js:10200` | plain text 변환 후 slice |
| 검색 매칭 (`planningPostsMatch`) | content 비교 | plain text 변환 후 비교 |

### 신규 헬퍼 함수

```js
// HTML → plain text (목록/검색용)
function planningHtmlToText(html) {
  if (!html) return '';
  if (typeof html !== 'string') return String(html);
  if (html.indexOf('<') === -1) return html; // 기존 plain text 데이터 fast path
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
}

// HTML 정화 (출력용)
function planningSanitizeHtml(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','span','div','blockquote',
                   'ol','ul','li','a','img','h1','h2','h3','h4','h5','h6'],
    ALLOWED_ATTR: ['href','target','rel','src','alt','class','style'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data:image\/(?:png|jpeg|gif|webp);base64,)|\/|#)/i
  });
}
```

## 에디터 빌더

세 모달이 공유하는 단일 빌더:

```js
// 모달 내 textarea 자리를 Quill 에디터로 마운트하고 인스턴스 반환
function mountPlanningRichEditor(containerId, initialHtml) { ... }
```

- 호출 위치 4곳: `openPlanningPostEditor`, `openPlanningCardEdit`, `openPlanningPostDetail`(답글 작성 폼), `openPlanningReplyEdit`
- 기존 `<textarea id="planningPostContent">` → `<div id="planningPostContent"></div>`로 교체
- 모달이 다시 열릴 때마다 새 인스턴스 생성 (Quill은 destroy 메서드가 없음 — DOM이 제거되면 GC됨)
- 전역 `currentPlanningQuill` 변수에 인스턴스 보관 (저장 핸들러가 참조)

## 저장 흐름 변경

`submitPlanningCard()` / `submitPlanningCardEdit()` / `submitPlanningReply()` / `submitPlanningReplyEdit()`:

```js
// 변경 전
const content = (document.getElementById('planningPostContent').value || '').trim();

// 변경 후
const quill = currentPlanningQuill;
const plainText = quill ? quill.getText().trim() : '';
const html = quill ? quill.root.innerHTML : '';
const content = plainText ? html : ''; // 빈 입력은 빈 문자열로 정규화
```

빈값 판정은 plain text 길이 기준 (HTML이 `<p><br></p>`만 있어도 빈 것으로 처리).

## 디자인 톤 통일

`styles.css`에 Quill snow 테마 오버라이드:

- 툴바·에디터 테두리: `var(--gray-200)`
- 라운드 코너: `border-radius: 8px`
- 에디터 최소 높이: `280px` (기존 textarea와 동일)
- 툴바 라벨 한글화 (CSS `::before` 또는 JS로 `<option>` 텍스트 교체):
  - `small/normal/large/huge` → `작게/보통/크게/매우 크게`
  - 글꼴 라벨 → 한글 표기
- Quill 기본 placeholder 색은 `var(--gray-400)`로

## 마이그레이션 / 호환성

- **DB 스키마**: 변경 없음 (`content` TEXT 그대로)
- **기존 plain text 카드**: `planningHtmlToText()`가 `<` 미포함 텍스트는 그대로 반환하므로 미리보기·검색 정상 동작
- **표시**: DOMPurify가 plain text를 그대로 통과시킴 (개행은 `<br>`로 변환되지 않음 → 기존 `white-space: pre-wrap` 클래스 유지로 줄바꿈 보존)
- **롤백**: 이번 변경은 표시·입력 측만 건드림. DB에 HTML이 한 번 저장된 후 textarea로 되돌리면 사용자는 HTML 태그가 보이게 됨 → 한 방향 마이그레이션이지만 데이터 손실은 없음

## 보안

- 출력은 모두 DOMPurify를 거침
- `data:image/...;base64`는 명시적으로 허용 (인라인 이미지)
- `<script>`, `<iframe>`, `on*` 핸들러 등은 화이트리스트 미포함이라 자동 차단

## 테스트 시나리오 (수동)

1. 새 카드 생성 → 글자 크기·굵게·이미지 붙여넣기 → 저장 → 카드 미리보기에서 텍스트만 보임 → 상세 팝업에서 서식 그대로 표시
2. 기존 plain text 카드 열기 → 본문 글자 그대로 보임 → 편집 → 굵게 적용 → 저장 → 다시 정상 표시
3. 큰 이미지(>1.5MB) 붙여넣기 → 자동 리사이즈 토스트 → 정상 저장
4. 답글에서 동일 동작 확인
5. 카드 검색에서 본문 텍스트 매칭 확인 (HTML 태그 무시)
6. 카드 인덱스 네비게이션 미리보기에서 60자 slice가 plain text 기준으로 동작
7. XSS 시도: `<script>alert(1)</script>` 또는 `<img onerror=...>` 입력 후 저장 → 출력에서 제거 확인

## 영향받지 않는 영역

- 카드 썸네일 표시 (`post.images`)
- 카드 드래그 정렬, 컬럼 이동
- 마감일·담당자·거래처·카테고리 필드
- 다른 모듈의 textarea (마케팅 콘텐츠, 상품 DB 등) — 이번 범위 외
