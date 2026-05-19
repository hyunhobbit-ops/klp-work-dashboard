# Phase 2 — XSS 봉합 설계서

**작성일**: 2026-05-19
**범위**: Codex 보안 리뷰 High 3건 (#4 공개 제안서 저장형 XSS / #5 URL 바로가기 위험 URL · 저장형 XSS / #6 문서 뷰 hash 기반 반사형 XSS)
**전제**: Phase 1 RLS 잠금 완료 (authenticated만 write). 5인 내부 신뢰 모델. risk가 격하된 상태에서의 잔여 부채 정리.

---

## 1. 배경

Phase 1 잠금 이후 외부 anon이 데이터를 변조할 수는 없지만:
- 악의 직원이 proposals/products/url_shortcuts에 악성 HTML/URL 저장 가능 → 거래처(외부 익명) 또는 다른 직원이 열 때 실행
- `#view-...` 같은 reflected hash는 어느 누구나 링크만 만들면 발사 가능

따라서 5인 신뢰 모델이라도 봉합 가치 있음.

| # | 위치 | 패턴 |
|---|---|---|
| 4 | `proposal-view.html:220~289` | `${p.name}`, `${ep.description}` 등 DB 사용자 입력을 escape 없이 innerHTML 삽입 |
| 5 | `app.js:719~728` `urlShortcutItemHtml` | `href="${url}"` scheme 검증 없음 + inline `onclick="copyLittlyLink('${url}', ...)"` backslash 미escape fragile |
| 6 | `doc-generator.html:2033, 2043` | `document.body.innerHTML = '...' + docNum + '...'` (docNum은 `location.hash`에서 옴), 동일 패턴으로 `e.message` 도 출력 |

## 2. 목표

- 3개 파일에서 사용자 입력을 출력 시 escape
- `app.js`의 URL 바로가기는 스키마 검증 + inline onclick 제거(위임 리스너로 전환)
- 저장 시(`saveUrlShortcut`) + 렌더 시(`urlShortcutItemHtml`) 양쪽에서 URL 검증 (defense-in-depth)

## 3. 비목표

- DOMPurify 같은 외부 sanitizer 도입 (현재 dependency 0개로 충분)
- 마크다운 / Quill 같은 리치 텍스트 입력 영역 보안 (planning_posts는 이미 Quill + DOMPurify 사용 중 — 별도 작업)
- 기존 DB에 들어간 악성 데이터 일괄 정리 (렌더 시 차단으로 충분)
- CSP 헤더 추가 (Vercel 설정 변경 영역, 별도 작업)

## 4. 결정사항

| # | 결정 | 선택 |
|---|---|---|
| D1 | URL 스키마 허용 목록 | `http`, `https`, `mailto`, `tel` (그 외 차단) |
| D2 | URL 검증 시점 | 저장 시(거부+토스트) + 렌더 시(href="#"로 치환) 양쪽 (defense-in-depth) |
| D3 | 상대 경로 / 앵커 | 허용 (`/path`, `#anchor`, `?query` — scheme 없음) |
| D4 | escape 헬퍼 | 파일별로 동일 함수 복사 (단일 파일 구조 유지 정책) |
| D5 | proposal-view escape 패턴 | `escHtml()` 후 필요 시 `\n→<br>` 치환 (현재 동작 유지) |
| D6 | URL 바로가기 click 핸들러 | inline `onclick` 제거 → data-* 속성 + 위임 리스너 |
| D7 | doc-generator `esc()` 강화 | 기존 함수에 `"` escape 추가, 기존 호출부 영향 없음 (확장) |

## 5. 아키텍처

### 5.1 공통 헬퍼

**escHtml** (3개 파일 모두에 동일하게):
```js
function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
```

**isSafeUrl** (`app.js`에만):
```js
function isSafeUrl(url) {
    const s = String(url || '').trim();
    if (!s) return false;
    // 상대경로/앵커/쿼리는 허용 (scheme 없음)
    if (s.startsWith('/') || s.startsWith('#') || s.startsWith('?')) return true;
    const match = s.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (!match) return true; // scheme 없는 절대경로 같은 케이스 → 상대로 간주, 허용
    return ['http', 'https', 'mailto', 'tel'].includes(match[1].toLowerCase());
}
```

### 5.2 파일별 변경 면적

| 파일 | 변경 |
|---|---|
| `app.js` | `isSafeUrl` 신규 추가 / `urlShortcutItemHtml` 리팩터 (inline onclick 제거, data-* 사용) / `renderUrlShortcuts` 위임 리스너 등록 / `saveUrlShortcut` 검증 추가 |
| `proposal-view.html` | `escHtml` 신규 추가 / `renderProposalView` 내 사용자 입력 `${...}` 위치에 escape 적용 |
| `doc-generator.html` | `esc()` 함수에 `"` escape 추가 / line 2033 + 2043 에 `esc()` 적용 |

## 6. 구현 상세

### 6.1 #4 — proposal-view.html

**`escHtml` 추가**: `<script>` 블록 상단 (현재 supabase 클라이언트 초기화 근처)에 함수 정의 추가.

**escape 적용 사이트** (renderProposalView 내부, 약 line 220~289):

| 위치 | 변경 |
|---|---|
| `${p.name}` (line 237) | `${escHtml(p.name)}` |
| `${p.description}` (line 238) | `${escHtml(p.description).replace(/\n/g, '<br>')}` |
| `${ep.title}` (line 251) | `${escHtml(ep.title)}` |
| `${ep.clientName}`, `${ep.clientContact}` (line 252) | 각각 escape |
| `${ep.description}` (line 263) | `${escHtml(ep.description).replace(/\n/g, '<br>')}` |
| `${ep.assignee}` (line 269) | `${escHtml(ep.assignee)}` |
| `${ep.assigneeEmail}`, `${ep.assigneePhone}` (line 272~273) | 각각 escape |
| `_assigneeRoleTitle(...)` (line 269) | 함수 반환값에 escape (또는 함수 내부에 적용) |

**imgHtml / badgeHtml / printRow / packRow / labelRow** 등 사전 조립 변수도 사용자 입력 포함 가능성 있음 → 구현자가 각 변수의 정의를 따라가 escape 적용 (특히 `p.image` URL, `p.label` 등).

**검증**: 거래처가 받은 공유 링크로 열었을 때, 상품명에 `<script>alert(1)</script>` 가 있어도 텍스트로 표시되어야 함.

### 6.2 #5 — app.js URL 바로가기

**Step 1**: `isSafeUrl` 함수 추가 — `escHtml` (line 13370) 근처에 같이 배치.

**Step 2**: `saveUrlShortcut`에 저장 시 검증 추가 (약 line 820 근처, payload 만든 직후 INSERT/UPDATE 전):

```js
if (!isSafeUrl(payload.url)) {
    showToast('허용되지 않는 URL 형식입니다 (http/https/mailto/tel만 가능)');
    return;
}
```

**Step 3**: `urlShortcutItemHtml` 리팩터 (line 719~729):

```js
function urlShortcutItemHtml(s) {
    const rawUrl = String(s.url || '');
    const safeUrl = isSafeUrl(rawUrl) ? rawUrl : '#';
    const urlAttr = escHtml(safeUrl);
    const titleAttr = escHtml(s.title || '');
    const titleText = escHtml(s.title || '');
    return `<div class="url-user-row">
        <a class="nav-item nav-sub-item nav-external" href="${urlAttr}" target="_blank" rel="noopener" data-url="${urlAttr}" data-title="${titleAttr}">
            <span>${titleText}</span>
            <svg class="external-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
        </a>
        <button class="url-edit-btn" onclick="event.stopPropagation();openUrlShortcutModal(${s.id})" title="편집">✏️</button>
    </div>`;
}
```

**Step 4**: `renderUrlShortcuts` 함수 끝에 위임 리스너 등록 (idempotent 보장):

```js
const group = document.getElementById('urlShortcutsGroup');
if (group && !group._urlClickHooked) {
    group.addEventListener('click', _urlShortcutClickHandler);
    group._urlClickHooked = true;
}
```

`_urlShortcutClickHandler`는 별도 함수로 추출:
```js
function _urlShortcutClickHandler(ev) {
    const a = ev.target.closest('.nav-external');
    if (!a) return;
    const url = a.dataset.url || '';
    const title = a.dataset.title || '';
    if (typeof copyLittlyLink === 'function') copyLittlyLink(url, title);
}
```

**검증**:
- `javascript:alert(1)` 저장 시도 → 토스트 거부, DB에 안 들어감
- DB에 이미 있는 `javascript:...` URL → 렌더 시 href="#"로 치환, 클릭해도 아무 일 안 일어남
- 정상 URL (`https://...`, `mailto:...`) → 기존과 동일 동작

### 6.3 #6 — doc-generator.html

**Step 1**: `esc()` 함수 강화 (line 400):

```js
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
```

기존 호출부는 모두 escape 강화의 영향만 받음(`"` 가 데이터에 있던 경우만 표시가 바뀜) — 안전한 확장.

**Step 2**: line 2033 — 문서 없음 메시지

```js
// 변경 전
if(!res||res.length===0){document.body.innerHTML='<div style="...">문서를 찾을 수 없습니다: '+docNum+'</div>';return;}

// 변경 후
if(!res||res.length===0){document.body.innerHTML='<div style="padding:20px;color:#888;font-size:13px;text-align:center;font-family:sans-serif">문서를 찾을 수 없습니다: '+esc(docNum)+'</div>';return;}
```

**Step 3**: line 2043 — 로드 실패 catch

```js
// 변경 전
}catch(e){console.error('view load failed',e);document.body.innerHTML='<div style="...">로드 실패: '+e.message+'</div>';}

// 변경 후
}catch(e){console.error('view load failed',e);document.body.innerHTML='<div style="padding:20px;color:#c00;font-size:13px;font-family:sans-serif">로드 실패: '+esc(e.message)+'</div>';}
```

**검증**: `klp-work-dashboard.vercel.app/doc-generator.html#view-<img src=x onerror=alert(1)>` 같은 링크를 열어도 alert 안 뜨고 텍스트로만 표시.

## 7. 에러 처리

| 상황 | 처리 |
|---|---|
| URL 저장 시 허용 안 되는 scheme | 토스트 "허용되지 않는 URL 형식입니다 (http/https/mailto/tel만 가능)", 저장 거부 |
| DB의 기존 악성 URL 렌더 | href="#"로 치환, 클릭 시 copyLittlyLink는 호출되나 url 인자가 "#"이라 무해 |
| proposal-view에 악성 HTML 저장된 데이터 | escape되어 텍스트로 표시, 스크립트 실행 안 됨 |
| doc-generator hash가 악성 | esc 처리되어 텍스트로 표시 |

## 8. 검증 게이트

| Gate | 시점 | 통과 조건 |
|---|---|---|
| G1 | 코드 배포 후 | proposal-view 공유 링크 정상 표시 (escape 적용 후 기존 정상 데이터는 화면 변화 없음) |
| G2 | 코드 배포 후 | 콘솔에서 `sb.from('proposals').update({name:'<script>alert(1)</script>'}).eq(...)` 후 해당 공유 링크 열기 → alert 안 뜸, 텍스트로 표시 |
| G3 | 코드 배포 후 | URL 바로가기에 `javascript:alert(1)` 저장 시도 → 거부 토스트 |
| G4 | 코드 배포 후 | DB에 이미 `javascript:...` URL이 있는 행이 있다면 → 사이드바에서 클릭해도 alert 안 뜸 |
| G5 | 코드 배포 후 | `doc-generator.html#view-<img src=x onerror=alert(1)>` 열기 → alert 안 뜸 |
| G6 | 코드 배포 후 | 기존 정상 사용 시나리오(URL 클릭 시 littly 복사, doc-generator 정상 로드)가 깨지지 않음 |

## 9. 롤백

| 단계 | 롤백 |
|---|---|
| 코드 배포 후 회귀 | Vercel 직전 deployment(`5841e0e`)로 instant rollback |
| 데이터는 안 건드림 | DB 변경 없음 → 데이터 롤백 불필요 |

## 10. 작업 윈도우

- 실제 작업: 1~2시간 (변경 면적 작음, 자동 테스트는 수동 시나리오 6개)
- 검증: 30분 (G1~G6)
- 사용자 영향: 거의 없음. 정상 데이터는 escape 후에도 동일하게 표시.

## 11. 사장님이 해야 하는 작업

1. 코드 배포 후 G1~G6 시나리오 한 번 돌리기 (5인 협업 불필요, 사장님 혼자 5~10분)
2. 만약 사용 중 URL 바로가기에 등록된 항목이 javascript:로 시작하면 알려주세요 — 해당 row를 정리

직원분들 영향: 0개.

## 12. 향후 작업

- Codex 12 항목 중 Phase 1/2/3 다 끝남 → 보안 부채 1차 청산 완료
- 다음 보안 단계: CSP 헤더(Vercel 설정), 정기 dependency 업데이트, audit log 도입 등은 별도 결정
