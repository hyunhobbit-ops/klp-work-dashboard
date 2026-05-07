# 프로젝트 카드 본문 리치 텍스트 에디터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기획 보드 카드의 "내용" 입력 영역 4곳을 Quill 2.0.2 기반 리치 텍스트 에디터로 교체하고, 카드 미리보기/검색은 plain text 변환을 거쳐 동작하도록 한다.

**Architecture:** `index.html`에 Quill·DOMPurify CDN을 추가하고, `app.js`에 5개 헬퍼 함수(`planningHtmlToText`, `planningSanitizeHtml`, `planningQuillIsEmpty`, `mountPlanningRichEditor`, `planningResizeImageDataUrl`)를 추가한다. 4개 모달의 `<textarea id="planningPostContent">`를 `<div>`로 교체하고 마운트 후 Quill 인스턴스를 전역 `currentPlanningQuill`에 보관한다. 4개 submit 핸들러가 textarea 대신 Quill 인스턴스에서 HTML을 읽는다. 표시 측은 `planningSanitizeHtml`로 정화한 HTML을 `innerHTML`로 출력하고, 미리보기·인덱스 슬라이스는 `planningHtmlToText`로 plain text를 거친다.

**Tech Stack:** Vanilla JS, Quill 2.0.2 (CDN), DOMPurify 3.1.6 (CDN), Supabase JS client (기존)

**Test 환경:** 자동 테스트 프레임워크 없음. 각 태스크 끝에 브라우저 수동 검증 단계 포함.

---

## File Structure

| 파일 | 변경 내용 |
|------|----------|
| `index.html` | Quill CSS·JS·DOMPurify CDN 3줄 추가 |
| `app.js` | 헬퍼 함수 5개 추가 / 4개 모달의 textarea → div 교체 / 4개 submit 핸들러 수정 / 5개 표시 사이트 수정 (전역 변수 `currentPlanningQuill` 1개 추가) |
| `styles.css` | Quill snow 테마 톤 오버라이드 (~30줄) |

`app.js`는 단일 파일 구조 유지 (CLAUDE.md 정책). 헬퍼는 `planningEsc` 함수(`app.js:10234`) 바로 다음에 모아서 추가.

---

## Task 1: CDN 추가

**Files:**
- Modify: `index.html:8-14`

- [ ] **Step 1: Quill CSS, Quill JS, DOMPurify JS CDN 3줄을 추가**

`index.html` 파일에서 line 8 (Pretendard CSS) 바로 아래, line 14 (jspdf) 바로 아래에 각각 추가.

line 8 다음에 추가:
```html
    <link href="https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css" rel="stylesheet">
```

line 14 다음에 추가:
```html
    <script src="https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
```

- [ ] **Step 2: 브라우저에서 검증**

`index.html`을 브라우저에 띄우고 (또는 dev 서버 통해) DevTools 콘솔에서:

```js
typeof Quill         // "function"
typeof DOMPurify     // "object"
DOMPurify.version    // "3.1.6"
```

세 값 모두 정상이어야 함. 페이지가 정상 로드되고 기존 기능이 깨지지 않아야 함.

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "Quill·DOMPurify CDN 추가 (리치 에디터 사전 작업)"
```

---

## Task 2: 헬퍼 함수 5개 추가

**Files:**
- Modify: `app.js` — `planningEsc` 함수(`app.js:10234`) 바로 다음 줄에 5개 함수 추가

- [ ] **Step 1: `app.js:10236` 직후에 헬퍼 5개 추가**

`planningEsc` 함수가 끝나는 line 10236 (`}` 닫히는 줄) 바로 다음에 다음 코드 블록 삽입:

```js
// HTML → plain text (목록·미리보기·인덱스 슬라이스용)
function planningHtmlToText(html) {
    if (!html) return '';
    if (typeof html !== 'string') return String(html);
    // 기존 plain text 데이터 fast path: '<' 없으면 그대로 반환
    if (html.indexOf('<') === -1) return html;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
}

// HTML 정화 (출력용)
function planningSanitizeHtml(html) {
    if (!html) return '';
    if (typeof DOMPurify === 'undefined') return planningEsc(html);
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','span','div','blockquote',
                       'ol','ul','li','a','img','h1','h2','h3','h4','h5','h6'],
        ALLOWED_ATTR: ['href','target','rel','src','alt','class','style'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data:image\/(?:png|jpeg|gif|webp);base64,)|\/|#)/i
    });
}

// Quill 빈값 판정 (HTML이 <p><br></p>만 있어도 빈 것으로 처리)
function planningQuillIsEmpty(quill) {
    if (!quill) return true;
    const text = quill.getText().trim();
    if (text) return false;
    // 이미지가 있으면 빈 것 아님
    return quill.root.querySelectorAll('img').length === 0;
}

// 큰 base64 이미지를 캔버스로 다운스케일 (최대 변 1600px, JPEG 0.85)
async function planningResizeImageDataUrl(dataUrl, maxSide = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let w = img.naturalWidth, h = img.naturalHeight;
            const scale = Math.min(1, maxSide / Math.max(w, h));
            if (scale >= 1 && dataUrl.length < 1.5 * 1024 * 1024) {
                resolve({ dataUrl, resized: false });
                return;
            }
            w = Math.round(w * scale);
            h = Math.round(h * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const out = canvas.toDataURL('image/jpeg', quality);
            resolve({ dataUrl: out, resized: true });
        };
        img.onerror = () => reject(new Error('이미지 로드 실패'));
        img.src = dataUrl;
    });
}

// 전역 보관: 현재 열린 모달의 Quill 인스턴스 (저장 핸들러가 참조)
let currentPlanningQuill = null;

// 4개 모달이 공유하는 빌더. div#containerId 자리에 Quill 마운트.
function mountPlanningRichEditor(containerId, initialHtml, opts) {
    opts = opts || {};
    const el = document.getElementById(containerId);
    if (!el) { console.warn('mountPlanningRichEditor: 컨테이너 없음', containerId); return null; }
    if (typeof Quill === 'undefined') {
        console.error('Quill 미로드');
        return null;
    }
    // 폰트·크기 화이트리스트 등록 (한 번만)
    if (!mountPlanningRichEditor._registered) {
        const Font = Quill.import('formats/font');
        Font.whitelist = ['sans', 'pretendard', 'nanumgothic', 'malgun', 'serif', 'mono'];
        Quill.register(Font, true);
        mountPlanningRichEditor._registered = true;
    }
    const quill = new Quill('#' + containerId, {
        theme: 'snow',
        placeholder: opts.placeholder || '내용을 입력하세요…',
        modules: {
            toolbar: {
                container: [
                    [{ font: ['sans', 'pretendard', 'nanumgothic', 'malgun', 'serif', 'mono'] },
                     { size: ['small', false, 'large', 'huge'] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ color: [] }, { background: [] }],
                    [{ align: [] }],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['blockquote'],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        }
    });
    if (initialHtml) {
        // dangerouslyPasteHTML은 Quill이 허용하지 않는 태그를 자동 정리
        quill.clipboard.dangerouslyPasteHTML(0, initialHtml);
    }
    // 이미지 붙여넣기 → 자동 리사이즈
    quill.root.addEventListener('paste', async (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                await insertResizedImageIntoQuill(quill, file);
                return;
            }
        }
    });
    // 이미지 드래그 드롭
    quill.root.addEventListener('drop', async (e) => {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (!imgs.length) return;
        e.preventDefault();
        for (const file of imgs) {
            await insertResizedImageIntoQuill(quill, file);
        }
    });
    // 툴바 이미지 버튼 → 자체 핸들러로 교체 (리사이즈 포함)
    const toolbar = quill.getModule('toolbar');
    toolbar.addHandler('image', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files && input.files[0];
            if (file) await insertResizedImageIntoQuill(quill, file);
        };
        input.click();
    });
    return quill;
}

// 파일 → base64 → 리사이즈 → Quill 커서 위치에 삽입
async function insertResizedImageIntoQuill(quill, file) {
    if (file.size > 5 * 1024 * 1024 * 4) { // 원본 20MB 초과는 거부
        showToast('이미지가 너무 큽니다 (20MB 초과)');
        return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('파일 읽기 실패'));
        r.readAsDataURL(file);
    });
    let finalUrl = dataUrl;
    try {
        const res = await planningResizeImageDataUrl(dataUrl);
        finalUrl = res.dataUrl;
        if (res.resized) showToast('이미지 크기를 조정했습니다');
    } catch (e) {
        console.warn('리사이즈 실패, 원본 사용', e);
    }
    if (finalUrl.length > 5 * 1024 * 1024) {
        showToast('리사이즈 후에도 너무 큽니다 — 더 작은 이미지를 사용해주세요');
        return;
    }
    const range = quill.getSelection(true);
    quill.insertEmbed(range.index, 'image', finalUrl, 'user');
    quill.setSelection(range.index + 1, 0);
}
```

- [ ] **Step 2: `styles.css`에 Quill 스타일 오버라이드 추가**

`styles.css` 파일 맨 끝에 다음 추가:

```css
/* === Quill 리치 에디터 (기획 보드 카드 본문) === */
.ql-toolbar.ql-snow,
.ql-container.ql-snow {
    border-color: var(--gray-200);
    font-family: 'Pretendard', sans-serif;
}
.ql-toolbar.ql-snow {
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    background: var(--gray-50, #F9FAFB);
}
.ql-container.ql-snow {
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
    min-height: 280px;
    font-size: 14px;
    line-height: 1.6;
}
.ql-editor {
    min-height: 280px;
    color: var(--gray-900);
}
.ql-editor.compact { min-height: 100px; }
.ql-editor:focus { outline: none; }
.ql-editor.ql-blank::before {
    color: var(--gray-400);
    font-style: normal;
}
/* 글꼴 라벨 한글화 */
.ql-snow .ql-picker.ql-font .ql-picker-label[data-value=sans]::before,
.ql-snow .ql-picker.ql-font .ql-picker-item[data-value=sans]::before { content: '기본'; font-family: sans-serif; }
.ql-snow .ql-picker.ql-font .ql-picker-label[data-value=pretendard]::before,
.ql-snow .ql-picker.ql-font .ql-picker-item[data-value=pretendard]::before { content: 'Pretendard'; font-family: 'Pretendard', sans-serif; }
.ql-snow .ql-picker.ql-font .ql-picker-label[data-value=nanumgothic]::before,
.ql-snow .ql-picker.ql-font .ql-picker-item[data-value=nanumgothic]::before { content: '나눔고딕'; font-family: '나눔고딕', NanumGothic, sans-serif; }
.ql-snow .ql-picker.ql-font .ql-picker-label[data-value=malgun]::before,
.ql-snow .ql-picker.ql-font .ql-picker-item[data-value=malgun]::before { content: '맑은 고딕'; font-family: 'Malgun Gothic', sans-serif; }
.ql-snow .ql-picker.ql-font .ql-picker-label[data-value=serif]::before,
.ql-snow .ql-picker.ql-font .ql-picker-item[data-value=serif]::before { content: '명조'; font-family: serif; }
.ql-snow .ql-picker.ql-font .ql-picker-label[data-value=mono]::before,
.ql-snow .ql-picker.ql-font .ql-picker-item[data-value=mono]::before { content: '고정폭'; font-family: monospace; }
/* font-family 적용 */
.ql-font-pretendard { font-family: 'Pretendard', sans-serif; }
.ql-font-nanumgothic { font-family: '나눔고딕', NanumGothic, sans-serif; }
.ql-font-malgun { font-family: 'Malgun Gothic', sans-serif; }
.ql-font-serif { font-family: serif; }
.ql-font-mono { font-family: monospace; }
/* 크기 라벨 한글화 */
.ql-snow .ql-picker.ql-size .ql-picker-label[data-value=small]::before,
.ql-snow .ql-picker.ql-size .ql-picker-item[data-value=small]::before { content: '작게'; }
.ql-snow .ql-picker.ql-size .ql-picker-label::before,
.ql-snow .ql-picker.ql-size .ql-picker-item:not([data-value])::before { content: '보통'; }
.ql-snow .ql-picker.ql-size .ql-picker-label[data-value=large]::before,
.ql-snow .ql-picker.ql-size .ql-picker-item[data-value=large]::before { content: '크게'; }
.ql-snow .ql-picker.ql-size .ql-picker-label[data-value=huge]::before,
.ql-snow .ql-picker.ql-size .ql-picker-item[data-value=huge]::before { content: '매우 크게'; }
/* 카드 상세에서 readonly로 보여줄 때 */
.planning-content-readonly .ql-editor { padding: 0; min-height: 0; }
```

- [ ] **Step 3: 헬퍼 동작 확인 (DevTools 콘솔)**

브라우저로 사이트 띄운 뒤 콘솔에서:

```js
planningHtmlToText('<p>안녕<strong>하세요</strong></p>')   // "안녕하세요"
planningHtmlToText('plain text')                            // "plain text" (fast path)
planningSanitizeHtml('<p>ok</p><script>alert(1)</script>')  // "<p>ok</p>"
planningSanitizeHtml('<img src="data:image/png;base64,iVBO">') // <img ...> 통과
planningSanitizeHtml('<a href="javascript:alert(1)">x</a>') // href 제거 또는 통째 제거
typeof mountPlanningRichEditor                              // "function"
```

XSS 차단·plain text 변환·fast path가 모두 정상이어야 함.

- [ ] **Step 4: 커밋**

```bash
git add app.js styles.css
git commit -m "리치 에디터 헬퍼·스타일 추가 (planningHtmlToText, planningSanitizeHtml, mountPlanningRichEditor 등)"
```

---

## Task 3: 새 카드 생성 모달을 Quill로 교체

**Files:**
- Modify: `app.js:10901-10903` (textarea 영역)
- Modify: `app.js:10930-10932` (모달 마운트 후 처리)
- Modify: `app.js:11038-11077` (`submitPlanningCard` 함수의 content 추출)

- [ ] **Step 1: `openPlanningPostEditor`의 textarea를 div로 교체**

`app.js:10901-10903` 의 다음 코드:
```html
        <div class="form-group"><label class="form-label">내용</label>
            <textarea id="planningPostContent" class="form-input" rows="12" placeholder="내용을 자세히 입력하세요..." style="font-family:inherit;min-height:280px;resize:vertical;line-height:1.6"></textarea>
        </div>
```

다음으로 교체:
```html
        <div class="form-group"><label class="form-label">내용</label>
            <div id="planningPostContent"></div>
        </div>
```

- [ ] **Step 2: 모달 표시 직후 Quill 마운트**

`app.js:10930-10932` 의 다음 코드:
```js
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    planningPendingImages = [];
    refreshPlanningImagePreview();
    setTimeout(() => { const el = document.getElementById('planningPostTitle'); if (el) el.focus(); }, 60);
```

다음으로 교체:
```js
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    planningPendingImages = [];
    refreshPlanningImagePreview();
    currentPlanningQuill = mountPlanningRichEditor('planningPostContent', '', { placeholder: '내용을 자세히 입력하세요…' });
    setTimeout(() => { const el = document.getElementById('planningPostTitle'); if (el) el.focus(); }, 60);
```

- [ ] **Step 3: `submitPlanningCard`의 content 추출 변경**

`app.js:11043` 의 다음 줄:
```js
    const content = (document.getElementById('planningPostContent').value || '').trim();
    if (!title && !content && !planningPendingImages.length) { showToast('제목, 내용 또는 이미지를 입력하세요'); return; }
```

다음으로 교체:
```js
    const quill = currentPlanningQuill;
    const isEmpty = planningQuillIsEmpty(quill);
    const content = (!quill || isEmpty) ? '' : quill.root.innerHTML;
    if (!title && isEmpty && !planningPendingImages.length) { showToast('제목, 내용 또는 이미지를 입력하세요'); return; }
```

- [ ] **Step 4: 브라우저 검증**

1. 사이트 열기 → 기획 보드 → "새 프로젝트" 또는 "+ 새 카드" 클릭
2. 모달이 정상 열리고 본문 영역에 Quill 툴바가 보여야 함
3. 제목 입력 + 본문에 한글 입력 → 굵게(B)·크기·색상 적용 → 저장
4. 카드가 보드에 추가되고, 카드 미리보기에 텍스트가 보여야 함 (다음 태스크 전이라 서식은 안 보일 수 있음)
5. Supabase Studio에서 `planning_posts` 행 확인 → `content`가 `<p><strong>...</strong></p>` 형태 HTML로 저장되어 있어야 함
6. 콘솔에 에러 없어야 함

- [ ] **Step 5: 커밋**

```bash
git add app.js
git commit -m "새 카드 생성 모달을 Quill 리치 에디터로 교체"
```

---

## Task 4: 카드 편집 모달을 Quill로 교체

**Files:**
- Modify: `app.js:10959-10961` (textarea 영역)
- Modify: `app.js:10987-10989` (모달 마운트 후 처리)
- Modify: `app.js:10992-11036` (`submitPlanningCardEdit` 함수)

- [ ] **Step 1: `openPlanningCardEdit`의 textarea를 div로 교체**

`app.js:10959-10961` 의 다음 코드:
```html
        <div class="form-group"><label class="form-label">내용</label>
            <textarea id="planningPostContent" class="form-input" rows="12" style="font-family:inherit;min-height:280px;resize:vertical;line-height:1.6">${planningEsc(post.content || '')}</textarea>
        </div>
```

다음으로 교체:
```html
        <div class="form-group"><label class="form-label">내용</label>
            <div id="planningPostContent"></div>
        </div>
```

(초기 HTML은 다음 단계에서 마운트 시 주입)

- [ ] **Step 2: 모달 표시 직후 Quill 마운트 (초기 HTML 포함)**

`app.js:10987-10989` 의 다음 코드:
```js
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    refreshPlanningImagePreview();
    setTimeout(() => { const el = document.getElementById('planningPostTitle'); if (el) el.focus(); }, 60);
```

다음으로 교체:
```js
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    refreshPlanningImagePreview();
    const initialHtml = planningSanitizeHtml(post.content || '');
    currentPlanningQuill = mountPlanningRichEditor('planningPostContent', initialHtml, { placeholder: '내용을 자세히 입력하세요…' });
    setTimeout(() => { const el = document.getElementById('planningPostTitle'); if (el) el.focus(); }, 60);
```

- [ ] **Step 3: `submitPlanningCardEdit`의 content 추출 변경**

`app.js:10999-11000` 의 다음 줄:
```js
    const content = (document.getElementById('planningPostContent').value || '').trim();
    if (!title && !content && !planningPendingImages.length) { showToast('제목, 내용 또는 이미지를 입력하세요'); return; }
```

다음으로 교체:
```js
    const quill = currentPlanningQuill;
    const isEmpty = planningQuillIsEmpty(quill);
    const content = (!quill || isEmpty) ? '' : quill.root.innerHTML;
    if (!title && isEmpty && !planningPendingImages.length) { showToast('제목, 내용 또는 이미지를 입력하세요'); return; }
```

- [ ] **Step 4: 브라우저 검증**

1. Task 3에서 만든 카드 또는 기존 plain text 카드의 ✏️ 편집 버튼 클릭
2. Quill 에디터에 기존 내용이 그대로 표시되어야 함 (기존 plain text 카드도 정상 표시)
3. 굵게·기울임·이미지 붙여넣기(Ctrl+V) 시도 → 정상 삽입 + 큰 이미지 경우 "이미지 크기를 조정했습니다" 토스트
4. 저장 → 모달 닫히고 카드 보드에 반영 → 다시 편집 열어 서식이 보존되었는지 확인
5. Supabase에서 `content` HTML 확인

- [ ] **Step 5: 커밋**

```bash
git add app.js
git commit -m "카드 편집 모달을 Quill 리치 에디터로 교체"
```

---

## Task 5: 새 답글 작성 폼을 Quill로 교체

**Files:**
- Modify: `app.js:10825` (`openPlanningPostDetail` 안 답글 textarea)
- Modify: `app.js:10840-10842` (모달 표시 직후)
- Modify: `app.js:11124-11157` (`submitPlanningReply` 함수)

- [ ] **Step 1: `openPlanningPostDetail`의 답글 textarea를 div로 교체**

`app.js:10825` 의 다음 줄:
```html
                <textarea id="planningPostContent" placeholder="답글을 입력하세요..." rows="4" style="width:100%;padding:10px;border:1px solid var(--gray-200);background:var(--white);color:var(--gray-900);border-radius:8px;font-size:13px;resize:vertical;font-family:inherit;margin-bottom:8px;min-height:100px;line-height:1.5"></textarea>
```

다음으로 교체:
```html
                <div id="planningPostContent" class="planning-reply-editor" style="margin-bottom:8px"></div>
```

- [ ] **Step 2: 모달 표시 직후 Quill 마운트 (compact 모드)**

`app.js:10840-10842` 의 다음 코드:
```js
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    planningPendingImages = [];
    refreshPlanningImagePreview();
}
```

다음으로 교체:
```js
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    planningPendingImages = [];
    refreshPlanningImagePreview();
    currentPlanningQuill = mountPlanningRichEditor('planningPostContent', '', { placeholder: '답글을 입력하세요…' });
    if (currentPlanningQuill) {
        const editor = currentPlanningQuill.root;
        editor.classList.add('compact');
        editor.style.minHeight = '100px';
    }
}
```

- [ ] **Step 3: `submitPlanningReply`의 content 추출 변경**

`app.js:11127-11128` 의 다음 줄:
```js
    const content = (document.getElementById('planningPostContent').value || '').trim();
    if (!content && !planningPendingImages.length) { showToast('내용 또는 이미지를 입력하세요'); return; }
```

다음으로 교체:
```js
    const quill = currentPlanningQuill;
    const isEmpty = planningQuillIsEmpty(quill);
    const content = (!quill || isEmpty) ? '' : quill.root.innerHTML;
    if (isEmpty && !planningPendingImages.length) { showToast('내용 또는 이미지를 입력하세요'); return; }
```

- [ ] **Step 4: 브라우저 검증**

1. 카드 클릭 → 상세 팝업 열림 → 하단에 답글 작성 영역의 Quill 에디터 표시
2. 답글 입력·서식 적용·이미지 붙여넣기 → "↩ 답글 작성" 버튼 클릭
3. 답글이 추가되고 다시 상세 팝업이 갱신됨
4. 서식이 보존되어야 함 (다음 태스크 전이라 답글 본문 표시는 아직 plain text)

- [ ] **Step 5: 커밋**

```bash
git add app.js
git commit -m "새 답글 작성 폼을 Quill 리치 에디터로 교체"
```

---

## Task 6: 답글 편집 모달을 Quill로 교체

**Files:**
- Modify: `app.js:11180-11182` (textarea 영역)
- Modify: `app.js:11200-11202` (모달 표시 직후)
- Modify: `app.js:11205-11233` (`submitPlanningReplyEdit` 함수)

- [ ] **Step 1: `openPlanningReplyEdit`의 textarea를 div로 교체**

`app.js:11180-11182` 의 다음 코드:
```html
        <div class="form-group"><label class="form-label">내용</label>
            <textarea id="planningPostContent" class="form-input" rows="8" style="font-family:inherit;min-height:200px;resize:vertical;line-height:1.6">${planningEsc(reply.content || '')}</textarea>
        </div>
```

다음으로 교체:
```html
        <div class="form-group"><label class="form-label">내용</label>
            <div id="planningPostContent"></div>
        </div>
```

- [ ] **Step 2: 모달 표시 직후 Quill 마운트**

`app.js:11200-11202` 의 다음 코드:
```js
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    refreshPlanningImagePreview();
    setTimeout(() => { const el = document.getElementById('planningPostContent'); if (el) el.focus(); }, 60);
```

다음으로 교체:
```js
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    refreshPlanningImagePreview();
    const initialHtml = planningSanitizeHtml(reply.content || '');
    currentPlanningQuill = mountPlanningRichEditor('planningPostContent', initialHtml, { placeholder: '답글 내용을 입력하세요…' });
    setTimeout(() => { if (currentPlanningQuill) currentPlanningQuill.focus(); }, 60);
```

- [ ] **Step 3: `submitPlanningReplyEdit`의 content 추출 변경**

`app.js:11211-11212` 의 다음 줄:
```js
    const content = (document.getElementById('planningPostContent').value || '').trim();
    if (!content && !planningPendingImages.length) { showToast('내용 또는 이미지를 입력하세요'); return; }
```

다음으로 교체:
```js
    const quill = currentPlanningQuill;
    const isEmpty = planningQuillIsEmpty(quill);
    const content = (!quill || isEmpty) ? '' : quill.root.innerHTML;
    if (isEmpty && !planningPendingImages.length) { showToast('내용 또는 이미지를 입력하세요'); return; }
```

- [ ] **Step 4: 브라우저 검증**

1. 카드 상세 팝업 → 본인이 작성한 답글의 ✏️ 편집 클릭
2. Quill에 기존 내용 표시 → 서식 변경 → 저장
3. 답글이 갱신되고 다시 상세 팝업으로 돌아감

- [ ] **Step 5: 커밋**

```bash
git add app.js
git commit -m "답글 편집 모달을 Quill 리치 에디터로 교체"
```

---

## Task 7: 표시 측 5곳을 sanitize·plain text 변환으로 전환

**Files:**
- Modify: `app.js:10200-10209` (인덱스 네비 미리보기 슬라이스 60자)
- Modify: `app.js:10524, 10542` (카드 미리보기 슬라이스 100자, line-clamp 4줄)
- Modify: `app.js:10783` (답글 본문 표시)
- Modify: `app.js:10815` (카드 상세 본문 표시)
- Modify: `app.js:11099` (제목/내용 요약 슬라이스 50자)

- [ ] **Step 1: 인덱스 네비 미리보기 (`app.js:10200`)**

다음 줄:
```js
            const preview = String(post.content || '').slice(0, 60);
```

다음으로 교체:
```js
            const preview = planningHtmlToText(post.content).slice(0, 60);
```

같은 함수 내 line 10209 의 `${post.content && post.content.length > 60 ? '...' : ''}` 부분도 수정:

다음 코드:
```js
                    <div style="font-size:13px;font-weight:700;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${planningEsc(proj.name)} · ${planningEsc(preview)}${post.content && post.content.length > 60 ? '...' : ''}</div>
```

다음으로 교체:
```js
                    <div style="font-size:13px;font-weight:700;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${planningEsc(proj.name)} · ${planningEsc(preview)}${preview.length >= 60 ? '...' : ''}</div>
```

- [ ] **Step 2: 카드 미리보기 (`app.js:10524, 10542`)**

`app.js:10524` 의 다음 줄:
```js
        const preview = String(post.content || '').slice(0, 100);
```

다음으로 교체:
```js
        const preview = planningHtmlToText(post.content).slice(0, 100);
```

`app.js:10542` 의 다음 코드:
```js
            ${preview ? `<div style="font-size:14px;font-weight:500;color:var(--gray-700,#4B5563);line-height:1.5;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden">${planningEsc(preview)}${post.content.length > 100 ? '...' : ''}</div>` : (post.title ? '' : `<div style="font-size:14px;color:var(--gray-400);font-style:italic">내용 없음</div>`)}
```

다음으로 교체:
```js
            ${preview ? `<div style="font-size:14px;font-weight:500;color:var(--gray-700,#4B5563);line-height:1.5;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden">${planningEsc(preview)}${preview.length >= 100 ? '...' : ''}</div>` : (post.title ? '' : `<div style="font-size:14px;color:var(--gray-400);font-style:italic">내용 없음</div>`)}
```

- [ ] **Step 3: 답글 본문 표시 (`app.js:10783`)**

다음 줄:
```js
            <div style="font-size:13px;color:var(--gray-900);white-space:pre-wrap;line-height:1.5">${planningEsc(r.content)}</div>
```

다음으로 교체:
```js
            <div class="ql-snow planning-content-readonly" style="font-size:13px;color:var(--gray-900);line-height:1.5"><div class="ql-editor" style="padding:0">${planningSanitizeHtml(r.content || '')}</div></div>
```

- [ ] **Step 4: 카드 상세 본문 표시 (`app.js:10815`)**

다음 줄:
```js
        <div style="font-size:14px;color:var(--gray-900);white-space:pre-wrap;line-height:1.6;padding:12px;background:var(--gray-50);border-radius:8px">${planningEsc(post.content || '(내용 없음)')}</div>
```

다음으로 교체 — 본문이 비어 있을 때만 "(내용 없음)" 표시하도록 분기:
```js
        ${(post.content && planningHtmlToText(post.content)) ? `<div class="ql-snow planning-content-readonly" style="padding:12px;background:var(--gray-50);border-radius:8px"><div class="ql-editor" style="padding:0;font-size:14px;color:var(--gray-900);line-height:1.6">${planningSanitizeHtml(post.content)}</div></div>` : `<div style="font-size:14px;color:var(--gray-400);padding:12px;background:var(--gray-50);border-radius:8px">(내용 없음)</div>`}
```

- [ ] **Step 5: 제목/내용 요약 (`app.js:11099`)**

다음 줄:
```js
    const summary = (post.title || post.content || '(내용 없음)').replace(/\s+/g, ' ').slice(0, 50);
```

다음으로 교체:
```js
    const summary = (post.title || planningHtmlToText(post.content) || '(내용 없음)').replace(/\s+/g, ' ').slice(0, 50);
```

- [ ] **Step 6: 브라우저 검증**

1. 기획 보드 카드 미리보기 — 굵게/색상 적용된 카드도 미리보기는 plain text로만 보여야 함 (HTML 태그가 안 보이고 서식도 안 보임 — 정상)
2. 카드 상세 팝업 — 본문이 서식 그대로 풍부하게 표시되어야 함 (굵게/색상/이미지 모두)
3. 빈 본문 카드 — "(내용 없음)" 표시
4. 답글 본문 — 마찬가지로 서식 표시
5. XSS 테스트: DevTools 콘솔로 직접 Supabase에 `<script>alert('XSS')</script>`가 포함된 content를 넣은 후 카드 표시 — 알림 안 떠야 함, 콘솔에도 깨끗
6. 인덱스 네비/카드 미리보기에서 슬라이스가 plain text 기준으로 잘려야 함 (HTML 태그 길이 영향 X)

- [ ] **Step 7: 커밋**

```bash
git add app.js
git commit -m "표시 측을 sanitize·plain text 변환으로 전환 (5곳)"
```

---

## Task 8: 통합 시나리오 QA + 배포

- [ ] **Step 1: 통합 시나리오 수동 테스트**

스펙(`docs/superpowers/specs/2026-05-07-rich-text-editor-design.md`)의 "테스트 시나리오 (수동)" 섹션의 7개 케이스를 처음부터 실행:

1. 새 카드: 글자 크기·굵게·이미지 붙여넣기 → 저장 → 카드 미리보기는 텍스트만, 상세는 서식 그대로
2. 기존 plain text 카드 열기 → 그대로 보임 → 편집 → 굵게 적용 → 저장 → 다시 정상 표시
3. >1.5MB 이미지 붙여넣기 → 자동 리사이즈 토스트 → 정상 저장
4. 답글에서 동일 동작 확인 (작성·편집)
5. 다른 모듈(마케팅 콘텐츠, 상품 DB 등)이 정상 동작하는지 확인 (regression)
6. F5 새로고침 후에도 카드 데이터·서식 보존
7. XSS: `<script>alert(1)</script>` 직접 입력해도 alert 안 나야 함 (Quill이 막거나 sanitize가 막음)

각 항목에서 콘솔 에러가 없어야 함.

- [ ] **Step 2: index.html `styles.css` 캐시 버전 갱신 (필요 시)**

`index.html:9-10`:
```html
<link rel="stylesheet" href="styles.css?v=20260416a">
<link rel="stylesheet" href="mobile.css?v=20260416a" media="(max-width: 1023px)">
```

다음으로 교체 (오늘 날짜 기준):
```html
<link rel="stylesheet" href="styles.css?v=20260507a">
<link rel="stylesheet" href="mobile.css?v=20260507a" media="(max-width: 1023px)">
```

- [ ] **Step 3: Vercel 배포 (CLAUDE.md 정책)**

```bash
git add index.html
git commit -m "캐시 버전 업데이트 (리치 에디터 배포용)"
git push
vercel --prod --yes
```

배포 완료되면 https://klp-work-dashboard.vercel.app 에서 동일 시나리오 1회 더 검증.

- [ ] **Step 4: 사용자 인수**

배포 URL을 사용자에게 안내하고 실사용 검증 받기.

---

## 자체 검증 (Self-Review)

- **스펙 커버리지**: 스펙의 4개 입력 영역 = Task 3·4·5·6, 5개 표시 사이트 = Task 7, 헬퍼 5개 + 스타일 = Task 2, CDN = Task 1, 마이그레이션·보안 = Task 7 자동 호환, 테스트 시나리오 = Task 8. 모두 커버됨.
- **Placeholder 스캔**: TBD/TODO/"적절히 처리"류 없음. 모든 코드 블록에 실제 코드 포함.
- **타입/이름 일관성**: `currentPlanningQuill`, `planningHtmlToText`, `planningSanitizeHtml`, `planningQuillIsEmpty`, `mountPlanningRichEditor`, `planningResizeImageDataUrl`, `insertResizedImageIntoQuill` — 모든 태스크에서 동일 표기.
- **잠재 위험**: 모달이 닫히지 않은 채 다른 모달이 열리면 `currentPlanningQuill`이 덮어쓰기됨 — 그러나 KLP 모달 시스템은 동시에 1개만 열리므로 안전.
- **롤백**: 각 태스크가 단독 커밋이라 문제 발생 시 해당 커밋만 revert 가능.
