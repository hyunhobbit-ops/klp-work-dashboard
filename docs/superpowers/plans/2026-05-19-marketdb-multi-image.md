# 중고마켓DB 추가 이미지 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 중고마켓DB 상품에 추가 이미지를 최대 5장까지 등록(편집 모달) + 표시(카드 배지 + 라이트박스 갤러리)할 수 있도록 한다.

**Architecture:** `market_db.extra_images text[]` 컬럼 추가(010 SQL) + `index.html`에 라이트박스 overlay 1개 추가 + `app.js`의 mapper / 모달 HTML / saveMarketItem / 카드 렌더 변경 + 신규 함수 8개(그리드 렌더·업로드·제거·라이트박스 5종).

**Tech Stack:** Vanilla JS, PostgreSQL text[] + CHECK constraint, Supabase Storage (기존 `market-db` 버킷 재사용), Supabase JS client.

**Test 환경:** 자동 테스트 프레임워크 없음. 수동 브라우저 시나리오(G1~G6)로 검증.

**스펙 참조:** `docs/superpowers/specs/2026-05-19-marketdb-multi-image-design.md` (commit `bec6bad`)

---

## File Structure

| 파일 | 변경 |
|------|------|
| `migrations/010_market_db_extra_images.sql` | NEW — extra_images 컬럼 + CHECK 제약 |
| `index.html` | 라이트박스 overlay `#marketGalleryOverlay` 추가 (1개 HTML 블록) |
| `app.js` | mapper 2개 / 편집 모달 HTML + 신규 함수 8개 / saveMarketItem / 카드 렌더 |

---

## Phase A — SQL

### Task 1: 010 마이그레이션 작성

**Files:**
- Create: `migrations/010_market_db_extra_images.sql`

- [ ] **Step 1: SQL 파일 작성**

```sql
-- ==========================================
-- 010 — market_db.extra_images 컬럼 추가
-- 게이트: G1
-- 영향: 새 컬럼 + CHECK 제약(최대 5장). 기존 행은 빈 배열로 초기화.
-- ==========================================

ALTER TABLE market_db
  ADD COLUMN IF NOT EXISTS extra_images text[] DEFAULT ARRAY[]::text[];

-- 멱등성: 같은 이름의 제약이 이미 있으면 제거 후 재생성
ALTER TABLE market_db
  DROP CONSTRAINT IF EXISTS market_db_extra_images_max5;

ALTER TABLE market_db
  ADD CONSTRAINT market_db_extra_images_max5
  CHECK (cardinality(extra_images) <= 5);

-- VERIFICATION ----------------------------
-- 1) 컬럼 존재 + 기본값 빈 배열:
-- SELECT name, image, extra_images FROM market_db LIMIT 3;
-- expect: extra_images 컬럼 '{}' (빈 배열)
--
-- 2) CHECK 제약 존재:
-- SELECT conname FROM pg_constraint
--  WHERE conname = 'market_db_extra_images_max5';
-- expect: 1행
--
-- 3) CHECK 제약 동작:
-- INSERT INTO market_db (category, name, extra_images)
-- VALUES ('misc', 'TEST', ARRAY['1','2','3','4','5','6']);
-- expect: ERROR 23514 check_violation
-- (테스트 후) DELETE FROM market_db WHERE name = 'TEST';

-- ROLLBACK --------------------------------
-- ALTER TABLE market_db DROP CONSTRAINT IF EXISTS market_db_extra_images_max5;
-- ALTER TABLE market_db DROP COLUMN IF EXISTS extra_images;
```

- [ ] **Step 2: 커밋**

```bash
git add migrations/010_market_db_extra_images.sql
git commit -m "010 마이그레이션 — market_db.extra_images text[] 컬럼 + CHECK 제약(최대 5장)"
```

(Co-Authored-By 트레일러 포함, HEREDOC 사용)

---

## Phase B — index.html / app.js 기반

### Task 2: index.html에 라이트박스 overlay 추가

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 삽입 위치 결정**

```bash
grep -n "marketModalOverlay\|</body>" index.html | head -5
```

`</body>` 직전 또는 다른 modal overlay(예: marketModalOverlay) 근처 — 일관성을 위해 후자 추천.

- [ ] **Step 2: 다음 HTML 블록을 삽입**

```html
<!-- 중고마켓DB 라이트박스 갤러리 (Phase: marketdb multi-image) -->
<div id="marketGalleryOverlay" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);align-items:center;justify-content:center" onclick="if(event.target===this)closeMarketGallery()">
  <button onclick="closeMarketGallery()" aria-label="닫기" style="position:absolute;top:20px;right:20px;width:40px;height:40px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:24px;cursor:pointer">×</button>
  <button onclick="marketGalleryPrev()" aria-label="이전" style="position:absolute;left:40px;top:50%;transform:translateY(-50%);width:48px;height:48px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:24px;cursor:pointer">◀</button>
  <img id="marketGalleryImg" src="" alt="" style="max-width:90vw;max-height:80vh;object-fit:contain;border-radius:8px">
  <button onclick="marketGalleryNext()" aria-label="다음" style="position:absolute;right:40px;top:50%;transform:translateY(-50%);width:48px;height:48px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:24px;cursor:pointer">▶</button>
  <div id="marketGalleryDots" style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:8px"></div>
</div>
```

⚠️ overlay 자체 클릭(자신 = event.target === this) 시 닫히도록 onclick에 가드 포함.

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "index.html: 중고마켓DB 라이트박스 갤러리 overlay 추가"
```

---

### Task 3: `marketRowFromDb` / `marketRowToDb` 매퍼 갱신

**Files:**
- Modify: `app.js` (around line 8591 `marketRowFromDb`, around line 8609 `marketRowToDb`)

- [ ] **Step 1: 함수 위치 확인**

```bash
grep -n "function marketRowFromDb\|function marketRowToDb" app.js
```
expected: 두 함수 정의가 인접한 위치(약 8591, 8609).

- [ ] **Step 2: `marketRowFromDb`에 extra_images 추가**

기존 `marketRowFromDb`에서 `image: r.image || ''` 다음 줄에 추가:

```javascript
        image: r.image || '',
        extra_images: Array.isArray(r.extra_images) ? r.extra_images.slice() : [],
```

(`MARKETDB_CHECK_FIELDS.forEach(...)` 호출 직전, `return o` 전에 위치)

- [ ] **Step 3: `marketRowToDb`에 extra_images 추가**

기존 `marketRowToDb`에서 마지막 필드(예: `page_url`) 다음 줄에 추가:

```javascript
        extra_images: Array.isArray(r.extra_images) ? r.extra_images : [],
```

(`return o` 전에 위치. `MARKETDB_CHECK_FIELDS` 처리 위쪽이면 OK)

- [ ] **Step 4: 문법 점검**

```bash
node --check app.js
```

- [ ] **Step 5: 커밋**

```bash
git add app.js
git commit -m "app.js: marketRowFromDb/marketRowToDb에 extra_images 필드 매핑 추가"
```

---

## Phase C — 편집 모달

### Task 4: 편집 모달 UI + 렌더 그리드 함수

**Files:**
- Modify: `app.js` (around line 9425 `openMarketModal` 모달 HTML + 새 함수)

- [ ] **Step 1: 모달 HTML에 추가 이미지 form-group 삽입**

`openMarketModal` 함수 안의 `body.innerHTML = '<div class="form-group"><label class="form-label">상품 이미지</label>'...'</div>'` 블록 끝나는 지점(`</div>` 이후 line 9435 즈음, `'<div class="form-row">'` 이전)에 다음을 끼워넣는다:

```javascript
        '<div class="form-group">'+
          '<label class="form-label">추가 이미지 <span style="font-weight:400;font-size:11px;color:var(--text-tertiary)">(최대 5장)</span></label>'+
          '<div id="mMExtraImgGrid" style="display:grid;grid-template-columns:repeat(5,60px);gap:8px"></div>'+
          '<input type="hidden" id="mMExtraImages" value="[]">'+
        '</div>'+
```

- [ ] **Step 2: 모달이 열린 직후 그리드 초기 렌더**

`openMarketModal` 함수의 마지막 줄(`setTimeout(() => { const el = document.getElementById('mMName'); ...`) 직전에 다음 한 줄 추가:

```javascript
    renderMarketExtraImgGrid(r.extra_images || []);
```

⚠️ `r`은 openMarketModal의 인자(현재 편집 중인 row). 새 항목 추가 모달이라면 `r.extra_images`는 undefined → 빈 배열로 처리됨.

- [ ] **Step 3: `renderMarketExtraImgGrid` 함수 정의 추가**

`openMarketModal` 함수 직후, `closeMarketModal` 함수 정의(line 9460 즈음) 직전에 다음 함수를 추가:

```javascript
// ---- 중고마켓DB 추가 이미지 그리드 ----
function renderMarketExtraImgGrid(urls) {
    urls = Array.isArray(urls) ? urls.slice(0, 5) : [];
    const grid = document.getElementById('mMExtraImgGrid');
    const hidden = document.getElementById('mMExtraImages');
    if (!grid || !hidden) return;
    hidden.value = JSON.stringify(urls);

    let html = '';
    for (let i = 0; i < 5; i++) {
        const url = urls[i];
        if (url) {
            // 채워진 칸: 이미지 + 우상단 × 제거 버튼
            html += '<div style="position:relative;width:60px;height:60px;border-radius:6px;overflow:hidden;border:1px solid var(--gray-200);background:var(--gray-50)">'+
                '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover">'+
                '<button type="button" onclick="removeMarketExtraImg(' + i + ')" '+
                  'style="position:absolute;top:2px;right:2px;width:18px;height:18px;border:none;border-radius:50%;background:rgba(15,23,42,0.85);color:#fff;font-size:11px;line-height:1;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center">×</button>'+
            '</div>';
        } else if (i === urls.length) {
            // 다음 빈 슬롯: + 추가 버튼 (파일 input wrap)
            html += '<label style="display:flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:6px;border:1.5px dashed var(--gray-300);background:var(--gray-50);cursor:pointer;color:var(--text-tertiary);font-size:20px">'+
                '+'+
                '<input type="file" accept="image/*" onchange="handleMarketExtraImgUpload(' + i + ', event)" style="display:none">'+
            '</label>';
        } else {
            // 그 외 빈 슬롯: 비활성 placeholder
            html += '<div style="width:60px;height:60px;border-radius:6px;border:1px dashed var(--gray-200);background:var(--gray-50);opacity:0.4"></div>';
        }
    }
    grid.innerHTML = html;
}
```

- [ ] **Step 4: 문법 점검**

```bash
node --check app.js
```

- [ ] **Step 5: 커밋**

```bash
git add app.js
git commit -m "app.js: 편집 모달에 추가 이미지 그리드 UI + renderMarketExtraImgGrid 함수 추가"
```

---

### Task 5: 업로드 + 제거 핸들러

**Files:**
- Modify: `app.js` — `renderMarketExtraImgGrid` 직후에 두 함수 추가

- [ ] **Step 1: `handleMarketExtraImgUpload` 추가**

`renderMarketExtraImgGrid` 함수 정의 바로 다음에:

```javascript
async function handleMarketExtraImgUpload(slotIdx, ev) {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { showToast('이미지 파일만 업로드 가능합니다'); return; }
    if (f.size > 8*1024*1024) { showToast('8MB 이하만 업로드 가능합니다'); return; }
    ev.target.value = '';

    const hidden = document.getElementById('mMExtraImages');
    let urls = [];
    try { urls = JSON.parse(hidden.value || '[]'); } catch (_) { urls = []; }
    if (urls.length >= 5) { showToast('추가 이미지는 최대 5장입니다'); return; }

    // 슬롯에 임시 로딩 표시
    const grid = document.getElementById('mMExtraImgGrid');
    if (grid && grid.children[slotIdx]) {
        grid.children[slotIdx].innerHTML = '<span style="font-size:10px;color:var(--text-tertiary)">업로드 중</span>';
    }

    try {
        const url = await uploadMarketImage(f);
        urls[slotIdx] = url;
        renderMarketExtraImgGrid(urls);
        showToast('추가 이미지 업로드 완료');
    } catch (err) {
        console.error('extra image upload failed', err);
        showToast('업로드 실패: ' + (err.message || err));
        renderMarketExtraImgGrid(urls); // 원상 복귀
    }
}
```

- [ ] **Step 2: `removeMarketExtraImg` 추가**

`handleMarketExtraImgUpload` 함수 바로 다음에:

```javascript
function removeMarketExtraImg(slotIdx) {
    const hidden = document.getElementById('mMExtraImages');
    let urls = [];
    try { urls = JSON.parse(hidden.value || '[]'); } catch (_) { urls = []; }
    // 해당 슬롯 제거 후 뒤 슬롯들이 앞으로 당겨짐 (sparse 배열 만들지 않음)
    urls.splice(slotIdx, 1);
    renderMarketExtraImgGrid(urls);
}
```

- [ ] **Step 3: 문법 점검**

```bash
node --check app.js
```

- [ ] **Step 4: 커밋**

```bash
git add app.js
git commit -m "app.js: handleMarketExtraImgUpload + removeMarketExtraImg 핸들러 추가"
```

---

### Task 6: `saveMarketItem` — extra_images 포함 저장

**Files:**
- Modify: `app.js` (around line 9490 `saveMarketItem` `base` 객체)

- [ ] **Step 1: 함수 위치 확인**

```bash
grep -n "async function saveMarketItem" app.js
```
expected: line 9490 즈음.

- [ ] **Step 2: `base` 객체에 extra_images 필드 추가**

기존 `base` 정의(line 9494~9505)의 마지막 필드(`image: document.getElementById('mMImage').value`) 다음 줄에 추가:

```javascript
        image: document.getElementById('mMImage').value,
        extra_images: (function(){
            try { return JSON.parse(document.getElementById('mMExtraImages').value || '[]'); }
            catch (_) { return []; }
        })()
```

(JSON parse 실패 시에도 빈 배열로 graceful fallback)

- [ ] **Step 3: 문법 점검**

```bash
node --check app.js
```

- [ ] **Step 4: 커밋**

```bash
git add app.js
git commit -m "app.js: saveMarketItem에 extra_images 필드 포함하여 저장"
```

---

## Phase D — 카드 + 라이트박스

### Task 7: 상품 카드에 "+N" 배지 추가

**Files:**
- Modify: `app.js` (renderMarketdb 함수 안의 카드 이미지 HTML)

- [ ] **Step 1: 카드 이미지 렌더 위치 찾기**

```bash
grep -n "renderMarketdb\|item.image" app.js | head -20
```

`renderMarketdb` 내부에서 각 item을 카드 HTML로 변환하는 곳을 찾는다. 보통 `<img src="${item.image}" ...>` 또는 `'<img src="' + item.image + '"' + ...` 패턴.

⚠️ **carded 코드를 보고** 정확한 줄에서 wrap이 필요한지 확인 — 이미 `<div style="position:relative">` 같은 wrap이 있다면 배지만 추가, 없으면 wrap을 신설.

- [ ] **Step 2: 이미지 영역을 wrap + 배지 조건부 삽입**

기존 카드의 이미지 영역을 다음과 같이 변경한다. 예시 (실제 코드와 다를 수 있음 — 구조 유지 + 배지만 추가):

기존(예시):
```javascript
'<img src="' + (item.image||'') + '" class="market-card-img" style="...">'
```

변경 후:
```javascript
'<div style="position:relative;display:inline-block">' +
    '<img src="' + (item.image||'') + '" class="market-card-img" style="...">' +
    ((item.extra_images && item.extra_images.length > 0)
        ? '<span onclick="event.stopPropagation();openMarketGalleryLightbox(' + item.id + ')" ' +
          'style="position:absolute;top:6px;right:6px;background:rgba(15,23,42,0.85);color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:12px;cursor:pointer;line-height:1.2">' +
          '+' + item.extra_images.length +
          '</span>'
        : '') +
'</div>'
```

⚠️ 카드 컨테이너가 이미 `position:relative`라면 wrap 신설 없이 배지만 추가해도 됨. 실제 코드 구조에 맞게 적용.

⚠️ `event.stopPropagation()` 필수 — 배지 클릭이 카드 자체의 클릭 이벤트(편집 모달 열기 등)로 버블링되지 않게.

- [ ] **Step 3: 문법 점검**

```bash
node --check app.js
```

- [ ] **Step 4: 커밋**

```bash
git add app.js
git commit -m "app.js: 중고마켓DB 상품 카드에 '+N' 배지 + 라이트박스 트리거 추가"
```

---

### Task 8: 라이트박스 함수 5종 + 키 핸들러

**Files:**
- Modify: `app.js` — 적절한 위치에 라이트박스 함수 묶음 추가 (`uploadMarketImage` 또는 `subscribeMarketRealtime` 근처가 자연스러움 — 같은 중고마켓DB 섹션)

- [ ] **Step 1: 함수 그룹 추가**

`uploadMarketImage` 정의(line 8941~8948) 직후, `subscribeMarketRealtime` 정의(line 8975 즈음) 직전 위치에 다음 블록 추가:

```javascript
// ---- 중고마켓DB 라이트박스 갤러리 ----
let _marketGalleryState = { urls: [], idx: 0 };

function openMarketGalleryLightbox(itemId) {
    if (!MARKETDB) return;
    let item = null;
    ['watch','goods','misc'].forEach(c => {
        if (!MARKETDB[c]) return;
        const found = MARKETDB[c].find(x => x.id === itemId);
        if (found) item = found;
    });
    if (!item) return;
    const all = [];
    if (item.image) all.push(item.image);
    (item.extra_images || []).forEach(u => { if (u) all.push(u); });
    if (all.length === 0) return;

    _marketGalleryState = { urls: all, idx: 0 };
    const overlay = document.getElementById('marketGalleryOverlay');
    if (overlay) overlay.style.display = 'flex';
    document.addEventListener('keydown', _marketGalleryKeyHandler);
    _renderMarketGallery();
}

function _renderMarketGallery() {
    const { urls, idx } = _marketGalleryState;
    const img = document.getElementById('marketGalleryImg');
    if (img) img.src = urls[idx] || '';
    const dots = document.getElementById('marketGalleryDots');
    if (dots) {
        dots.innerHTML = urls.map((_, i) =>
            '<span style="width:8px;height:8px;border-radius:50%;background:' +
            (i === idx ? '#fff' : 'rgba(255,255,255,0.35)') + '"></span>'
        ).join('');
    }
}

function marketGalleryNext() {
    const { urls } = _marketGalleryState;
    if (!urls || urls.length === 0) return;
    _marketGalleryState.idx = (_marketGalleryState.idx + 1) % urls.length;
    _renderMarketGallery();
}

function marketGalleryPrev() {
    const { urls } = _marketGalleryState;
    if (!urls || urls.length === 0) return;
    _marketGalleryState.idx = (_marketGalleryState.idx - 1 + urls.length) % urls.length;
    _renderMarketGallery();
}

function closeMarketGallery() {
    const overlay = document.getElementById('marketGalleryOverlay');
    if (overlay) overlay.style.display = 'none';
    document.removeEventListener('keydown', _marketGalleryKeyHandler);
}

function _marketGalleryKeyHandler(e) {
    if (e.key === 'Escape') closeMarketGallery();
    else if (e.key === 'ArrowLeft') marketGalleryPrev();
    else if (e.key === 'ArrowRight') marketGalleryNext();
}
```

- [ ] **Step 2: 문법 점검**

```bash
node --check app.js
```

- [ ] **Step 3: 커밋**

```bash
git add app.js
git commit -m "app.js: 중고마켓DB 라이트박스 함수 5종 + 키 핸들러 추가"
```

---

## Phase E — 실행 런북

> 이 Phase는 사장님 협업. SQL은 Supabase SQL Editor에서, 코드는 Vercel 자동 배포 (push 시).

### Task 9: 010 SQL 실행 + G1 검증

- [ ] **Step 1: 010 SQL 실행**

Supabase Dashboard → SQL Editor → New query → `migrations/010_market_db_extra_images.sql` 내용 붙여넣기 → Run.

- [ ] **Step 2: G1 — 컬럼 + 제약 존재 확인**

```sql
SELECT name, image, extra_images FROM market_db LIMIT 3;
```
expected: `extra_images` 컬럼이 보이고 기본값 `{}` (빈 배열).

```sql
SELECT conname FROM pg_constraint WHERE conname = 'market_db_extra_images_max5';
```
expected: 1행.

- [ ] **Step 3: G1 — CHECK 제약 동작 확인 (선택)**

```sql
INSERT INTO market_db (category, name, extra_images)
VALUES ('misc', 'TEST-CHECK', ARRAY['1','2','3','4','5','6']);
-- expect: ERROR 23514 check_violation
```

테스트 후 정리:
```sql
DELETE FROM market_db WHERE name = 'TEST-CHECK';
```

---

### Task 10: 푸시 + Vercel 자동 배포 + G2~G6 검증

- [ ] **Step 1: 푸시**

```bash
git push origin master
```

- [ ] **Step 2: Vercel 배포 완료 대기 (1~2분)**

https://vercel.com/dashboard → 최근 deployment **Ready**.

- [ ] **Step 3: G2 — 편집 모달에 그리드 표시**

권한자(예: 김관택) 로그인 → 중고마켓DB → 임의 상품 편집 모달 열기.
기대: "추가 이미지 (최대 5장)" 라벨 아래에 60x60 빈 슬롯 5칸이 보이고, 첫 슬롯이 `+ ` 추가 버튼.

- [ ] **Step 4: G3 — 업로드 + 저장 + 영속성 확인**

추가 이미지 3장 업로드 → 저장 → 페이지 새로고침 → 같은 상품 편집 → 3장 그대로 유지.

DB 확인:
```sql
SELECT name, image, extra_images FROM market_db WHERE name = '<해당 상품명>';
```

- [ ] **Step 5: G4 — 카드 배지 + 라이트박스**

상품 목록 카드에 "+3" 배지 표시 확인. 배지 클릭 → 라이트박스 갤러리 오버레이 → 메인 이미지부터 4장 순서대로 ◀/▶로 이동. ESC 키로 닫힘. 배경(오버레이) 클릭으로도 닫힘.

- [ ] **Step 6: G5 — 5장 한계 + 제거 후 재추가**

5장 다 채운 후: + 추가 버튼이 사라지는지 확인.
한 슬롯의 × 버튼 클릭으로 제거 → + 추가 버튼이 다시 마지막 슬롯에 나타남.

- [ ] **Step 7: G6 — DB CHECK 제약 우회 시도 차단**

콘솔에서:
```javascript
const r = await sb.from('market_db').update({extra_images: ['1','2','3','4','5','6']}).eq('id', <임의 id>);
console.log(r);
```
expected: `r.error` 존재, `code: '23514'` (check_violation) 또는 메시지에 "check constraint" 포함.

- [ ] **Step 8: 모두 통과 시 완료 보고**

사장님에게 "G1~G6 다 통과, 추가 이미지 기능 정상 작동" 보고.

---

## 자가 점검

**Spec coverage:**
- ✅ D1 (5장 제한) — Task 1 SQL CHECK 제약 + Task 4 클라이언트 슬롯 5칸 + Task 5 업로드 핸들러의 `urls.length >= 5` 가드
- ✅ D2 (메인 + 그리드 UI) — Task 4 모달 HTML + renderMarketExtraImgGrid
- ✅ D3 (extra_images text[]) — Task 1 SQL
- ✅ D4 (카드 "+N" 배지 + 라이트박스) — Task 7 + Task 8
- ✅ D5 (CHECK + 클라 제한) — Task 1 + Task 5
- ✅ D6 (Storage items/ 경로 재사용) — Task 5의 `uploadMarketImage(f)` 호출 (기존 함수 재사용)
- ✅ D7 (슬롯 인덱스 순서) — Task 4 `urls[i]` 기반 렌더

**Placeholder scan:**
- Task 7 Step 2 — "기존 코드와 다를 수 있음" 주의 표시. 카드 HTML 구조가 실제 코드와 다른 경우 wrap을 신설하거나 기존 wrap 재사용 결정. 이는 implementer가 코드 직접 확인 후 결정해야 하는 부분 (plan 작성 시점에서 확정 불가).
- 그 외 TBD/TODO 없음.

**Type consistency:**
- `extra_images` 필드명 — Task 1 SQL / Task 3 mapper / Task 6 saveMarketItem / Task 7 카드 / Task 8 라이트박스 모두 일관.
- `_marketGalleryState`, `_renderMarketGallery`, `_marketGalleryKeyHandler` — Task 8 내부에서 일관.
- DOM id `mMExtraImages`, `mMExtraImgGrid`, `marketGalleryOverlay`, `marketGalleryImg`, `marketGalleryDots` — Task 2 / 4 / 5 / 8 모두 일관.
- 함수 시그니처 `handleMarketExtraImgUpload(slotIdx, ev)`, `removeMarketExtraImg(slotIdx)`, `openMarketGalleryLightbox(itemId)`, `marketGalleryNext()`, `marketGalleryPrev()`, `closeMarketGallery()` — 정의와 호출 시그니처 일치.
