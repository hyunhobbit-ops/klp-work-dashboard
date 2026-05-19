# 중고마켓DB 추가 이미지 기능 설계서

**작성일**: 2026-05-19
**범위**: 중고마켓DB(market_db) 상품 항목에 메인 이미지 외에 추가 이미지 최대 5장까지 등록·표시
**전제**: Phase 1 RLS 잠금 완료 (authenticated만 write). Storage `market-db` 버킷 active.

---

## 1. 배경

현재 `market_db.image`는 텍스트 단일 컬럼으로 상품당 1장의 이미지만 보관. 실제 중고거래 등록에는 앞·뒤·디테일 등 다수의 사진이 필요하나, 시스템은 메인 1장만 저장 가능. 외부 마켓플레이스(중고나라/번개장터/당근)에 옮길 때 원본 사진을 다시 찾아야 하는 비효율.

## 2. 목표

- 상품당 메인 1장 + 추가 최대 5장 = 총 6장 이미지 보관
- 편집 모달에서 추가 이미지 업로드/제거 가능
- 상품 목록 카드에서 추가 이미지 존재 표시 + 라이트박스 갤러리로 열어 볼 수 있게
- 기존 데이터(추가 이미지 없는 row) 그대로 호환

## 3. 비목표

- 드래그&드롭 순서 변경 (Phase Next로 미룸 — 우선은 슬롯 인덱스 순서대로 표시)
- 이미지 자동 크롭/리사이즈 (현재 클라이언트 업로드 그대로 보관)
- 외부 마켓플레이스 자동 게시 연동 (별도 작업)
- 이미지에 캡션·설명 추가 (URL 배열만)

## 4. 결정사항

| # | 결정 | 선택 |
|---|---|---|
| D1 | 추가 이미지 개수 | 최대 5장 (메인 포함 총 6장) |
| D2 | 편집 모달 UI | 메인 큰 미리보기 + 아래 60x60 썸네일 그리드 5칸 |
| D3 | DB 스키마 | `market_db.extra_images text[]` 컬럼 추가, 기존 `image` 그대로 유지 |
| D4 | 목록 카드 표시 | "+N" 배지 + 클릭 시 라이트박스 갤러리 |
| D5 | 개수 강제 | DB CHECK 제약 (`cardinality(extra_images) <= 5`) + 클라이언트 UI 제한 |
| D6 | Storage 경로 | 기존 메인과 동일 (`market-db/items/<ts>_<rand>.<ext>`). 별도 prefix 없음 |
| D7 | 정렬 순서 | 슬롯 인덱스 순서대로 (`extra_images[0]`이 첫 썸네일) |

## 5. 아키텍처

### 5.1 데이터 흐름

```
[편집 모달]
  ├─ 메인 이미지: handleMarketImgUpload → uploadMarketImage → mMImage hidden → market_db.image
  └─ 추가 이미지: handleMarketExtraImgUpload(slotIdx, ev) → uploadMarketImage (재사용)
                  → extra_images 배열 슬롯에 push
                  → mMExtraImages hidden(JSON string)
                  → market_db.extra_images (text[])

[저장 시] saveMarketItem
  ├─ image (메인 URL)
  ├─ extra_images (URL 배열)
  └─ 기타 필드들

[상품 카드 렌더]
  ├─ 메인 <img src="${image}">
  └─ extra_images.length > 0 이면 우상단 "+N" 배지

[배지 클릭]
  → openMarketGalleryLightbox(itemId)
  → 전체 이미지 배열 = [image, ...extra_images]
  → 라이트박스 오버레이 표시
```

### 5.2 컴포넌트 책임

| 컴포넌트 | 책임 |
|---|---|
| `marketRowFromDb` / `marketRowToDb` | extra_images 필드 매핑 추가 |
| `openMarketModal` / 모달 body HTML | 메인 영역 아래에 추가 이미지 그리드 섹션 추가 |
| `renderMarketExtraImgGrid(urls)` (신규) | 5칸 그리드 HTML 다시 그림. 채워진 칸 / 빈 + 추가 버튼 칸 / × 제거 버튼 |
| `handleMarketExtraImgUpload(slotIdx, ev)` (신규) | 파일 검증 + uploadMarketImage → 슬롯에 URL 저장 + 그리드 재렌더 |
| `removeMarketExtraImg(slotIdx)` (신규) | 해당 슬롯 비우기 + 재렌더 |
| `saveMarketItem` | base 객체에 `extra_images: [...]` 추가 |
| `renderMarketdb` 카드 HTML | extra_images 있으면 "+N" 배지 + onclick |
| `openMarketGalleryLightbox(itemId)` (신규) | 해당 item 찾아서 [image, ...extra_images] 배열로 갤러리 열기 |
| `marketGalleryNext` / `Prev` / `Close` (신규) | 인덱스 이동, ESC/오버레이 클릭으로 닫기 |

## 6. 구현 상세

### 6.1 SQL 마이그레이션 (`migrations/010_market_db_extra_images.sql`)

```sql
-- 010 — market_db.extra_images 컬럼 추가 (최대 5장 CHECK)
ALTER TABLE market_db
  ADD COLUMN IF NOT EXISTS extra_images text[] DEFAULT ARRAY[]::text[];

-- 멱등성: 같은 이름 제약이 이미 있으면 제거 후 재생성
ALTER TABLE market_db
  DROP CONSTRAINT IF EXISTS market_db_extra_images_max5;

ALTER TABLE market_db
  ADD CONSTRAINT market_db_extra_images_max5
  CHECK (cardinality(extra_images) <= 5);

-- VERIFICATION ----------------------------
-- SELECT name, image, extra_images FROM market_db LIMIT 3;
-- → 'extra_images' 컬럼이 기본값 '{}' (빈 배열)로 보임

-- ROLLBACK --------------------------------
-- ALTER TABLE market_db DROP CONSTRAINT IF EXISTS market_db_extra_images_max5;
-- ALTER TABLE market_db DROP COLUMN IF EXISTS extra_images;
```

### 6.2 mapper 변경 (`marketRowFromDb` / `marketRowToDb`)

`marketRowFromDb` 추가:
```js
o.extra_images = Array.isArray(r.extra_images) ? r.extra_images.slice() : [];
```

`marketRowToDb` 추가:
```js
o.extra_images = Array.isArray(r.extra_images) ? r.extra_images : [];
```

### 6.3 편집 모달 UI 추가 (`openMarketModal` 내부)

기존 "상품 이미지" form-group 바로 다음에 추가:
```html
<div class="form-group">
  <label class="form-label">추가 이미지 <span style="font-weight:400;font-size:11px;color:var(--text-tertiary)">(최대 5장)</span></label>
  <div id="mMExtraImgGrid" style="display:grid;grid-template-columns:repeat(5,60px);gap:8px"></div>
  <input type="hidden" id="mMExtraImages" value="[]">
</div>
```

`openMarketModal` 끝부분에 `renderMarketExtraImgGrid(r.extra_images || [])` 호출.

### 6.4 신규 함수: `renderMarketExtraImgGrid`

```js
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
            html += `<div style="position:relative;width:60px;height:60px;border-radius:6px;overflow:hidden;border:1px solid var(--gray-200);background:var(--gray-50)">
                <img src="${url}" style="width:100%;height:100%;object-fit:cover">
                <button type="button" onclick="removeMarketExtraImg(${i})" 
                  style="position:absolute;top:2px;right:2px;width:18px;height:18px;border:none;border-radius:50%;background:rgba(15,23,42,0.85);color:#fff;font-size:11px;line-height:1;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center">×</button>
            </div>`;
        } else if (i === urls.length) {
            // 다음 빈 슬롯: + 추가 버튼 (파일 input wrap)
            html += `<label style="display:flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:6px;border:1.5px dashed var(--gray-300);background:var(--gray-50);cursor:pointer;color:var(--text-tertiary);font-size:20px">
                +
                <input type="file" accept="image/*" onchange="handleMarketExtraImgUpload(${i}, event)" style="display:none">
            </label>`;
        } else {
            // 그 외 빈 슬롯: 비활성 placeholder (아직 채울 차례 아님)
            html += `<div style="width:60px;height:60px;border-radius:6px;border:1px dashed var(--gray-200);background:var(--gray-50);opacity:0.4"></div>`;
        }
    }
    grid.innerHTML = html;
}
```

### 6.5 신규 함수: `handleMarketExtraImgUpload`

```js
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

### 6.6 신규 함수: `removeMarketExtraImg`

```js
function removeMarketExtraImg(slotIdx) {
    const hidden = document.getElementById('mMExtraImages');
    let urls = [];
    try { urls = JSON.parse(hidden.value || '[]'); } catch (_) { urls = []; }
    // 해당 슬롯 제거 후 뒤 슬롯들이 앞으로 당겨짐 (sparse 배열 만들지 않음)
    urls.splice(slotIdx, 1);
    renderMarketExtraImgGrid(urls);
}
```

### 6.7 `saveMarketItem` 변경

`base` 객체에 다음 한 줄 추가:
```js
extra_images: (function(){ try { return JSON.parse(document.getElementById('mMExtraImages').value || '[]'); } catch (_) { return []; } })()
```

### 6.8 카드 렌더 변경 (`renderMarketdb` 내부)

기존 이미지 영역 HTML을 wrap으로 감싸고 배지 조건부 추가:
```html
<div style="position:relative">
  <img src="${item.image}" ...>
  ${(item.extra_images && item.extra_images.length > 0)
    ? `<span onclick="event.stopPropagation();openMarketGalleryLightbox(${item.id})"
         style="position:absolute;top:6px;right:6px;background:rgba(15,23,42,0.85);color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:12px;cursor:pointer;line-height:1.2">
         +${item.extra_images.length}
       </span>`
    : ''}
</div>
```

### 6.9 라이트박스 모달 (HTML, index.html에 추가)

```html
<div id="marketGalleryOverlay" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);align-items:center;justify-content:center">
  <button onclick="closeMarketGallery()" style="position:absolute;top:20px;right:20px;width:40px;height:40px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:24px;cursor:pointer">×</button>
  <button onclick="marketGalleryPrev()" style="position:absolute;left:40px;top:50%;transform:translateY(-50%);width:48px;height:48px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:24px;cursor:pointer">◀</button>
  <img id="marketGalleryImg" src="" style="max-width:90vw;max-height:80vh;object-fit:contain;border-radius:8px">
  <button onclick="marketGalleryNext()" style="position:absolute;right:40px;top:50%;transform:translateY(-50%);width:48px;height:48px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:24px;cursor:pointer">▶</button>
  <div id="marketGalleryDots" style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:8px"></div>
</div>
```

### 6.10 라이트박스 함수

```js
let _marketGalleryState = { urls: [], idx: 0 };

function openMarketGalleryLightbox(itemId) {
    if (!MARKETDB) return;
    let item = null;
    ['watch','goods','misc'].forEach(c => {
        const found = MARKETDB[c].find(x => x.id === itemId);
        if (found) item = found;
    });
    if (!item) return;
    const all = [];
    if (item.image) all.push(item.image);
    (item.extra_images || []).forEach(u => { if (u) all.push(u); });
    if (all.length === 0) return;
    
    _marketGalleryState = { urls: all, idx: 0 };
    document.getElementById('marketGalleryOverlay').style.display = 'flex';
    document.addEventListener('keydown', _marketGalleryKeyHandler);
    _renderMarketGallery();
}

function _renderMarketGallery() {
    const { urls, idx } = _marketGalleryState;
    document.getElementById('marketGalleryImg').src = urls[idx] || '';
    const dots = document.getElementById('marketGalleryDots');
    dots.innerHTML = urls.map((_, i) =>
        `<span style="width:8px;height:8px;border-radius:50%;background:${i===idx?'#fff':'rgba(255,255,255,0.35)'}"></span>`
    ).join('');
}

function marketGalleryNext() {
    const { urls } = _marketGalleryState;
    _marketGalleryState.idx = (_marketGalleryState.idx + 1) % urls.length;
    _renderMarketGallery();
}

function marketGalleryPrev() {
    const { urls } = _marketGalleryState;
    _marketGalleryState.idx = (_marketGalleryState.idx - 1 + urls.length) % urls.length;
    _renderMarketGallery();
}

function closeMarketGallery() {
    document.getElementById('marketGalleryOverlay').style.display = 'none';
    document.removeEventListener('keydown', _marketGalleryKeyHandler);
}

function _marketGalleryKeyHandler(e) {
    if (e.key === 'Escape') closeMarketGallery();
    else if (e.key === 'ArrowLeft') marketGalleryPrev();
    else if (e.key === 'ArrowRight') marketGalleryNext();
}
```

## 7. 에러 처리

| 상황 | 처리 |
|---|---|
| 추가 이미지가 5장인데 사용자가 6번째 업로드 시도 | 클라이언트 토스트 "추가 이미지는 최대 5장입니다" (UI 상 + 버튼이 사라져 있어 정상 시 발생 안 함) |
| Storage 업로드 실패 | 토스트 "업로드 실패: <message>" + 그리드 원상 복귀 |
| DB CHECK 위반 (이론상 클라이언트 우회 시) | saveMarketItem 의 outer try/catch가 에러를 토스트로 표시 |
| 라이트박스에서 image가 깨진 URL | `<img>` 자체 onerror → 무시 (사용자가 알아서 편집 모달에서 교체) |

## 8. 영향 면적

| 종류 | 개수 |
|---|---|
| SQL 마이그레이션 신규 | 1 (010) |
| `app.js` 변경 함수 | `marketRowFromDb`, `marketRowToDb`, `openMarketModal` 모달 HTML, `saveMarketItem`, `renderMarketdb` 카드 HTML |
| `app.js` 신규 함수 | 7 (`renderMarketExtraImgGrid`, `handleMarketExtraImgUpload`, `removeMarketExtraImg`, `openMarketGalleryLightbox`, `_renderMarketGallery`, `marketGalleryNext`, `marketGalleryPrev`, `closeMarketGallery`, `_marketGalleryKeyHandler` — 정확히는 8) |
| `index.html` 추가 | 라이트박스 overlay 1개 (`#marketGalleryOverlay`) |
| `styles.css` | 인라인 스타일로 처리, 변경 없음 |

## 9. 검증 게이트

| Gate | 시점 | 통과 조건 |
|---|---|---|
| G1 | 010 SQL 실행 후 | `\d market_db` 또는 `information_schema.columns` 조회로 `extra_images` 컬럼 존재 확인. CHECK 제약 존재 확인 |
| G2 | 코드 배포 후 | 권한자 로그인 → 중고마켓DB → 상품 편집 모달 열기 → 추가 이미지 그리드 5칸 보임 |
| G3 | G2 통과 후 | 추가 이미지 3장 업로드 → 저장 → 새로고침 → 재진입 시 3장 그대로 유지 |
| G4 | G3 통과 후 | 상품 목록 카드에 "+3" 배지 표시. 배지 클릭 → 라이트박스 4장(메인+3) 갤러리 표시. 좌우 화살표 / ESC 키 정상 작동 |
| G5 | G4 통과 후 | 5장 다 채운 후 + 버튼이 사라지는지 확인. 1장 ×로 제거 후 + 버튼 재출현 확인 |
| G6 | G5 통과 후 | DB CHECK 위반 시도 (콘솔에서 `sb.from('market_db').update({extra_images: ['1','2','3','4','5','6']}).eq('id', X)`) → 23514 check_violation 거부 확인 |

## 10. 롤백

| 단계 | 롤백 |
|---|---|
| 010 SQL 실행 후 문제 | `ALTER TABLE market_db DROP CONSTRAINT market_db_extra_images_max5; ALTER TABLE market_db DROP COLUMN extra_images;` — 단, 이미 데이터가 입력되어 있으면 데이터 손실 주의 |
| 코드 배포 후 문제 | Vercel 직전 deployment(`fd794c5` Phase 3 완료 상태)로 즉시 rollback |

## 11. 사장님이 해야 하는 작업

1. `migrations/010_market_db_extra_images.sql` Supabase SQL Editor에서 실행
2. G1 검증 쿼리 1회
3. 제가 push → Vercel 자동 배포 후 G2~G6 시나리오 한 번 돌려보기 (5~10분)

직원분들 영향: 0개. 추가 이미지 없는 기존 상품은 그대로 동작, 새 상품에 선택적으로 추가 이미지 등록 가능.

## 12. 향후 작업

- 드래그&드롭 순서 변경 (현재는 추가 후 ×로 제거, 슬롯 0번부터 채움)
- 이미지 EXIF 메타데이터 제거 (개인정보 노출 방지)
- 자동 리사이즈 (현재 원본 크기 그대로 보관)
- 라이트박스에서 직접 다운로드 버튼
