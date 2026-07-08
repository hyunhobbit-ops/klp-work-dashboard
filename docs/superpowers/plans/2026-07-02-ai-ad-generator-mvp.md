# AI 광고 제작 (Phase 1 MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드에 "AI 광고 제작" 메뉴를 추가해, 제품을 넣으면 AI가 카피(Claude)와 배경 이미지(OpenAI)를 만들고, 앱이 정사각 광고 이미지로 합성·내보내는 MVP를 만든다.

**Architecture:** 역할 분리 파이프라인. 서버리스 함수 2개(`ad-copy`=Claude, `ad-image`=OpenAI)가 API 키를 프록시(로그인 직원만 호출). 프론트는 새 탭에서 입력→생성→선택/편집→Canvas 합성(html2canvas)→다운로드/복사/저장. 결과는 Supabase `ad_campaigns`에 저장.

**Tech Stack:** Vanilla JS, Vercel 서버리스 함수(CommonJS, Node 내장 fetch), Supabase(SDK + REST), Anthropic Messages API, OpenAI Images API, html2canvas(이미 로드됨).

**검증 방식(이 저장소 특성):** 유닛 테스트 프레임워크 없음 → `node --check`(문법), 격리 HTML 하니스 + Claude_Preview(합성/UI 시각확인), 배포 후 엔드포인트 curl, 실제 브라우저 수동 테스트. 매 작업 전 `git fetch`+rebase(네이티브 작업 병행 중 — 충돌 방지). 커밋 메시지 한국어, 끝에 Co-Authored-By.

---

## File Structure

- Create `api/ad-copy.js` — 광고 카피 생성(Claude, 도구로 JSON 강제). 자체 완결.
- Create `api/ad-image.js` — 배경 이미지 생성(OpenAI Images). 자체 완결.
- Create `migrations/018_ad_campaigns.sql` — `ad_campaigns` 테이블 기록용(실제 적용은 Supabase MCP/대시보드).
- Modify `index.html` — 사이드바에 "AI 광고 제작" 항목 + `#tab-ad-studio` 컨테이너 + styles.css/app.js 캐시 버전 bump.
- Modify `app.js` — 탭 등록, `renderAdStudio()`, `generateAdMaterials()`, `renderAdResults()`, `composeAdImage()`, `saveAdCampaign()`/`loadAdCampaigns()`. 기존 패턴(escHtml, showToast, buildClientDatalistField, sb.auth.getSession, switchTab, paginatedLoad) 재사용.
- Modify `styles.css` — `.ad-*` 최소 스타일.

공유 파일(app.js/index.html/styles.css) 수정은 국소화. 새 로직은 app.js 내 "AI 광고 제작" 섹션 한 곳에 모은다.

---

## Task 1: DB 테이블 `ad_campaigns`

**Files:**
- Create: `migrations/018_ad_campaigns.sql`
- Apply: Supabase (MCP `apply_migration` 또는 SQL 편집기)

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- migrations/018_ad_campaigns.sql
create table if not exists ad_campaigns (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  author text,
  product_id bigint,                 -- 상품 DB 참조(있을 때). FK 강제 안 함(상품이 JS배열/전환중)
  product_snapshot jsonb,            -- {name, price, imageUrl, points}
  settings jsonb,                    -- {goal, tone, target, emphasis}
  copy jsonb,                        -- 선택된 카피 {headline, sub, body, cta, hashtags, emailSubject, emailBody}
  bg_image text,                     -- 선택된 배경(base64 data URL 또는 URL)
  status text default '작성'
);
alter table ad_campaigns enable row level security;
drop policy if exists "ad_campaigns_auth_all" on ad_campaigns;
create policy "ad_campaigns_auth_all" on ad_campaigns
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: 적용**

Supabase MCP `apply_migration`(name=`create_ad_campaigns`)로 위 SQL 실행. 성공 `{"success":true}` 확인.

- [ ] **Step 3: 컬럼 확인**

`select column_name from information_schema.columns where table_name='ad_campaigns';` → id, created_at, author, product_id, product_snapshot, settings, copy, bg_image, status 존재.

- [ ] **Step 4: 커밋**

```bash
git add migrations/018_ad_campaigns.sql
git commit -m "AI 광고: ad_campaigns 테이블 마이그레이션"
```

---

## Task 2: 서버리스 함수 `api/ad-copy.js` (Claude 카피 생성)

**Files:**
- Create: `api/ad-copy.js`

- [ ] **Step 1: 함수 작성** — `api/analyze-delivery.js`의 인증/에러 패턴 그대로.

```js
// api/ad-copy.js — 광고 카피 생성 (Claude, 도구로 JSON 강제). 로그인 직원만.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 허용됩니다.' }); return; }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'AI 키가 설정되지 않았습니다. 관리자에게 문의하세요.' }); return; }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
  try {
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!ures.ok) { res.status(401).json({ error: '세션이 만료되었습니다.' }); return; }
  } catch (e) { res.status(401).json({ error: '인증 확인 실패' }); return; }

  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const p = (body && body.product) || {};
  const s = (body && body.settings) || {};

  const tool = {
    name: 'ad_copy',
    description: '광고 카피 3안을 생성',
    input_schema: {
      type: 'object',
      properties: {
        variants: {
          type: 'array',
          description: '서로 다른 톤/각도의 카피 3개',
          items: {
            type: 'object',
            properties: {
              headline: { type: 'string', description: '10자 내외의 강력한 헤드라인' },
              sub: { type: 'string', description: '헤드라인 보조 문구(짧게)' },
              body: { type: 'string', description: '2~3문장 본문(제품 강점)' },
              cta: { type: 'string', description: '행동 유도 문구(예: 지금 주문하기)' },
              hashtags: { type: 'string', description: '해시태그 5개 내외, 공백 구분' },
              emailSubject: { type: 'string', description: '이메일 제목' },
              emailBody: { type: 'string', description: '이메일 본문(3~5문장, 존댓말)' }
            },
            required: ['headline', 'sub', 'body', 'cta', 'hashtags', 'emailSubject', 'emailBody']
          }
        }
      },
      required: ['variants']
    }
  };

  const prompt = `아래 제품으로 한국어 광고 카피 3안을 만들어줘. 서로 톤/각도를 다르게. 과장/허위광고 표현은 피하고 자연스럽게.\n` +
    `제품명: ${p.name || ''}\n가격: ${p.price || '미정'}\n핵심포인트: ${p.points || ''}\n` +
    `광고목적: ${s.goal || ''}\n톤: ${s.tone || ''}\n타깃: ${s.target || ''}\n강조문구: ${s.emphasis || ''}\n` +
    `반드시 ad_copy 도구로 3안을 채워줘.`;

  try {
    const ares = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 1500,
        tools: [tool], tool_choice: { type: 'tool', name: 'ad_copy' },
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const j = await ares.json().catch(() => ({}));
    if (!ares.ok) {
      const code = ares.status;
      let msg = '카피 생성 실패';
      if (code === 401) msg = 'AI 키가 올바르지 않습니다.';
      else if (code === 429) msg = '요청이 많습니다. 잠시 후 다시 시도해주세요.';
      res.status(code >= 400 && code < 500 ? code : 502).json({ error: msg, detail: (j && j.error && j.error.message) || '' });
      return;
    }
    const block = (j.content || []).find(b => b.type === 'tool_use');
    const out = (block && block.input) || {};
    res.status(200).json({ variants: Array.isArray(out.variants) ? out.variants : [] });
  } catch (err) {
    res.status(502).json({ error: '카피 생성 서버 오류', detail: (err && err.message) || '' });
  }
};
```

- [ ] **Step 2: 문법 확인**

Run: `node --check api/ad-copy.js` → 출력 없음(성공).

- [ ] **Step 3: 커밋**

```bash
git add api/ad-copy.js
git commit -m "AI 광고: 카피 생성 서버리스 함수(ad-copy)"
```

---

## Task 3: 서버리스 함수 `api/ad-image.js` (OpenAI 배경 이미지)

**Files:**
- Create: `api/ad-image.js`

- [ ] **Step 1: 함수 작성** — 인증 동일. OpenAI Images API 사용. 제품 없는 "배경/무드"만 생성.

```js
// api/ad-image.js — 광고 배경 이미지 생성 (OpenAI Images). 로그인 직원만.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 허용됩니다.' }); return; }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'OpenAI 키가 설정되지 않았습니다. 관리자가 Vercel 환경변수(OPENAI_API_KEY)를 등록해야 합니다.' }); return; }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
  try {
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!ures.ok) { res.status(401).json({ error: '세션이 만료되었습니다.' }); return; }
  } catch (e) { res.status(401).json({ error: '인증 확인 실패' }); return; }

  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const p = (body && body.product) || {};
  const s = (body && body.settings) || {};
  const count = Math.min(2, Math.max(1, Number(body && body.count) || 2));

  // 배경/무드만. 제품 자체·글자는 넣지 말 것(글자는 앱이 합성).
  const prompt = `한국 상업 광고용 정사각 배경 이미지. 제품 카테고리 "${p.name || '제품'}"에 어울리는 감성적이고 깔끔한 배경/무드. ` +
    `톤: ${s.tone || '고급스럽고 밝은'}. 타깃: ${s.target || '일반'}. ` +
    `중요: 어떤 글자/텍스트/로고도 넣지 말 것. 제품 자체를 그리지 말고, 제품을 올려놓기 좋은 여백 있는 배경만. 사실적 스튜디오/라이프스타일 톤.`;

  try {
    const oimg = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, n: count, size: '1024x1024' })
    });
    const j = await oimg.json().catch(() => ({}));
    if (!oimg.ok) {
      const code = oimg.status;
      let msg = '이미지 생성 실패';
      if (code === 401) msg = 'OpenAI 키가 올바르지 않습니다.';
      else if (code === 429) msg = '요청이 많거나 크레딧이 부족합니다.';
      else if (code === 400) msg = '요청이 거부되었습니다(콘텐츠 정책 등).';
      res.status(code >= 400 && code < 500 ? code : 502).json({ error: msg, detail: (j && j.error && j.error.message) || '' });
      return;
    }
    // gpt-image-1은 b64_json 반환. data URL로 변환.
    const images = (j.data || []).map(d => d.b64_json ? ('data:image/png;base64,' + d.b64_json) : d.url).filter(Boolean);
    res.status(200).json({ images });
  } catch (err) {
    res.status(502).json({ error: '이미지 생성 서버 오류', detail: (err && err.message) || '' });
  }
};
```

- [ ] **Step 2: 문법 확인**

Run: `node --check api/ad-image.js` → 성공.

- [ ] **Step 3: 커밋**

```bash
git add api/ad-image.js
git commit -m "AI 광고: 배경 이미지 생성 서버리스 함수(ad-image)"
```

---

## Task 4: 사이드바 메뉴 + 탭 컨테이너

**Files:**
- Modify: `index.html` (편의성 그룹에 nav 항목 + `#tab-ad-studio` main + app.js/styles.css 캐시 bump)
- Modify: `app.js` (탭 라우팅에 `ad-studio` 등록 + 진입 시 `renderAdStudio()` 호출)

- [ ] **Step 1: index.html — 사이드바 항목 추가**

"편의성" 그룹(견적서 만들기 근처)에 추가:
```html
<button class="nav-item nav-sub-item" data-tab="ad-studio" data-tip="AI로 광고 문구·이미지 제작">
  <span>AI 광고 제작</span>
</button>
```
(기존 nav-item 마크업 구조·아이콘 패턴을 그대로 따를 것.)

- [ ] **Step 2: index.html — 탭 본문 컨테이너 추가**

기존 `<main class="content" id="tab-...">` 들 사이에 추가:
```html
<main class="content" id="tab-ad-studio">
  <div class="content-toolbar"><div class="toolbar-left"><h2 style="margin:0;font-size:18px">AI 광고 제작</h2></div></div>
  <div id="adStudioBody"></div>
</main>
```

- [ ] **Step 3: app.js — 탭 진입 시 렌더 연결**

`switchTab`/해시 라우팅에서 `ad-studio` 탭 활성화 시 `renderAdStudio()` 호출(기존 다른 탭들이 render를 호출하는 지점과 동일 패턴). 라벨 맵(`ROUTE_LABELS` 등)에 `'ad-studio': 'AI 광고 제작'` 추가.

- [ ] **Step 4: 캐시 버전 bump**

`index.html`의 `app.js?v=` 와 `styles.css?v=` 값을 새 값으로 변경(예: `v=20260702a`).

- [ ] **Step 5: 확인 + 커밋**

Run: `node --check app.js` → 성공. 배포 후 브라우저에서 사이드바 "AI 광고 제작" 클릭 시 빈 탭이 뜨는지 확인.
```bash
git add app.js index.html
git commit -m "AI 광고: 사이드바 메뉴 + 탭 컨테이너"
```

---

## Task 5: 입력 폼 `renderAdStudio()` + 제품 선택/업로드

**Files:**
- Modify: `app.js` (AI 광고 섹션)
- Modify: `styles.css` (`.ad-*` 최소 스타일)

- [ ] **Step 1: renderAdStudio() 작성**

`#adStudioBody`에 입력 폼 렌더:
- 제품 소스 토글: [상품 DB에서 선택] / [직접 업로드]
  - 상품 DB: `productsDB`(또는 로드된 상품 배열)에서 select. 선택 시 `_adProduct = {name, price, imageUrl, points}` 세팅.
  - 업로드: 파일 input(이미지) → `_resizeImageToDataUrl` 재사용(있으면) 또는 FileReader → dataURL. 이름·가격·핵심포인트 텍스트 input.
- 설정: 목적(select: 신제품/할인/브랜딩/기타), 톤(select: 고급/친근/재미/신뢰), 타깃(text), 강조문구(text, 선택).
- [광고 생성] 버튼 → `generateAdMaterials()`.

`escHtml`로 출력 escape, 기존 `.form-group/.form-input/.field` 스타일 재사용.

- [ ] **Step 2: 상태 변수**

app.js 상단(다른 전역 옆)에 `let _adProduct = null; let _adSettings = null; let _adResults = null;` 추가.

- [ ] **Step 3: 시각 확인(격리 하니스)**

`_adtest.html`에 styles.css + 폼 마크업 샘플을 넣고 Claude_Preview로 렌더/스크린샷 → 레이아웃 정상 확인 후 파일 삭제.

- [ ] **Step 4: 커밋**

```bash
git add app.js styles.css
git commit -m "AI 광고: 입력 폼(제품 선택/업로드 + 설정)"
```

---

## Task 6: 생성 `generateAdMaterials()` — 카피+이미지 병렬 호출

**Files:**
- Modify: `app.js`

- [ ] **Step 1: 함수 작성**

```js
async function generateAdMaterials() {
  if (!_adProduct || !_adProduct.name) { showToast('제품을 먼저 선택/입력해주세요'); return; }
  _adSettings = { /* 폼에서 수집: goal, tone, target, emphasis */ };
  const { data } = await sb.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) { showToast('다시 로그인해주세요'); return; }
  // 로딩 표시
  const btn = document.getElementById('adGenerateBtn'); if (btn) { btn.disabled = true; btn.textContent = 'AI가 만드는 중… (최대 30초)'; }
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  const payload = JSON.stringify({ product: _adProduct, settings: _adSettings });
  const [copyRes, imgRes] = await Promise.allSettled([
    fetch('/api/ad-copy', { method: 'POST', headers, body: payload }).then(r => r.json().then(j => ({ ok: r.ok, j }))),
    fetch('/api/ad-image', { method: 'POST', headers, body: JSON.stringify({ product: _adProduct, settings: _adSettings, count: 2 }) }).then(r => r.json().then(j => ({ ok: r.ok, j })))
  ]);
  const variants = (copyRes.status === 'fulfilled' && copyRes.value.ok) ? (copyRes.value.j.variants || []) : [];
  const images = (imgRes.status === 'fulfilled' && imgRes.value.ok) ? (imgRes.value.j.images || []) : [];
  if (!variants.length && !images.length) { showToast('생성 실패 — 잠시 후 다시 시도해주세요'); if (btn) { btn.disabled = false; btn.textContent = '광고 생성'; } return; }
  if (!variants.length) showToast('문구 생성 실패(이미지는 성공)');
  if (!images.length) showToast('이미지 생성 실패(문구는 성공) — OpenAI 키/크레딧 확인');
  _adResults = { variants, images, selCopy: 0, selImg: 0 };
  if (btn) { btn.disabled = false; btn.textContent = '다시 생성'; }
  renderAdResults();
}
```

- [ ] **Step 2: 문법 확인 + 커밋**

Run: `node --check app.js` → 성공.
```bash
git add app.js
git commit -m "AI 광고: 생성 호출(카피+이미지 병렬, 부분성공 허용)"
```

---

## Task 7: 결과 선택/편집 `renderAdResults()` + 합성 `composeAdImage()`

**Files:**
- Modify: `app.js`

- [ ] **Step 1: renderAdResults()**

- 배경 이미지 2장을 썸네일로 → 클릭 시 `_adResults.selImg` 변경.
- 카피 3안을 카드로 → 클릭 시 `_adResults.selCopy` 변경. 선택된 카피의 headline/cta 등은 **편집 가능한 input/textarea**로 표시(수정 시 `_adResults.variants[sel]` 갱신).
- "미리보기" 영역(`#adPreview`) + [이미지 다운로드] [카톡문구 복사] [이메일문구 복사] [캠페인 저장] 버튼.
- 매 선택/편집 후 `composeAdImage()` 재호출로 미리보기 갱신.

- [ ] **Step 2: composeAdImage()** — Canvas/HTML 합성(html2canvas 재사용)

1080×1080 정사각 컨테이너를 오프스크린으로 구성:
- 배경: 선택된 배경 이미지(cover).
- 하단/상단 반투명 패널 + **또렷한 한글**: headline(대), sub, 가격, cta 버튼 형태.
- 제품 카드: 제품 사진을 흰 둥근 프레임 카드에 배치(가운데/한쪽).
- `html2canvas(el, {width:1080,height:1080,scale:1,useCORS:true})` → dataURL → `#adPreview`에 표시하고 `_adResults.composed` 저장.

주의: 외부 이미지(OpenAI base64는 same-origin data URL이라 CORS 무관). 제품 이미지가 외부 URL이면 CORS 이슈 가능 → 상품 DB 이미지는 base64/스토리지이므로 대체로 안전. 실패 시 토스트.

- [ ] **Step 3: 내보내기 핸들러**

- 이미지 다운로드: `a.download='광고.png'; a.href=_adResults.composed; a.click()`.
- 카톡문구 복사: `navigator.clipboard.writeText(headline+"\n\n"+body+"\n"+cta+"\n"+hashtags)`.
- 이메일문구 복사: `emailSubject + "\n\n" + emailBody`.

- [ ] **Step 4: 시각 확인(격리 하니스)**

`_adcompose.html`: 샘플 배경(임의 이미지) + 샘플 제품 + 텍스트로 `composeAdImage` 레이아웃을 재현 → Claude_Preview 스크린샷으로 한글이 또렷/정렬 확인 → 파일 삭제.

- [ ] **Step 5: 문법 확인 + 커밋**

Run: `node --check app.js`.
```bash
git add app.js styles.css
git commit -m "AI 광고: 결과 선택/편집 + 정사각 이미지 합성/내보내기"
```

---

## Task 8: 캠페인 저장/불러오기

**Files:**
- Modify: `app.js`

- [ ] **Step 1: saveAdCampaign()**

```js
async function saveAdCampaign() {
  if (!_adResults) { showToast('생성 후 저장할 수 있어요'); return; }
  const v = _adResults.variants[_adResults.selCopy] || {};
  const row = {
    author: (currentUser && currentUser.name) || '',
    product_id: _adProduct.id || null,
    product_snapshot: { name: _adProduct.name, price: _adProduct.price, imageUrl: _adProduct.imageUrl, points: _adProduct.points },
    settings: _adSettings,
    copy: v,
    bg_image: _adResults.images[_adResults.selImg] || null,
    status: '작성'
  };
  const { error } = await sb.from('ad_campaigns').insert(row);
  if (error) { showToast('저장 실패: ' + error.message); return; }
  showToast('캠페인이 저장되었습니다');
}
```

- [ ] **Step 2: loadAdCampaigns()** — `renderAdStudio` 하단에 최근 캠페인 목록(간단히). `paginatedLoad('ad_campaigns', {pageSize:20, orderBy:'created_at', orderDir:'desc'})` 또는 단순 select. 클릭 시 `_adProduct/_adSettings/_adResults` 복원 후 `renderAdResults()`.

- [ ] **Step 3: 문법 확인 + 커밋**

Run: `node --check app.js`.
```bash
git add app.js
git commit -m "AI 광고: 캠페인 저장/불러오기"
```

---

## Task 9: 배포 + 환경변수 안내 + 실제 테스트

**Files:** 없음(운영)

- [ ] **Step 1: 배포**

`git fetch`+rebase → `git push` → `vercel --prod --yes`. 배포 READY 확인.

- [ ] **Step 2: 엔드포인트 생존 확인(키 미설정 상태여도 404 아님)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://klp-work-dashboard.vercel.app/api/ad-copy -H "content-type: application/json" -d '{}'   # 401 기대(토큰X)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://klp-work-dashboard.vercel.app/api/ad-image -H "content-type: application/json" -d '{}'  # 401 기대
```

- [ ] **Step 3: 사용자에게 OpenAI 키 등록 안내**

platform.openai.com → 결제수단 등록 + 크레딧 충전 → API 키 발급 → Vercel 환경변수 `OPENAI_API_KEY` 등록 → 재배포. (Anthropic 키는 이미 있음. 문구만 먼저 테스트 가능.)

- [ ] **Step 4: 실제 브라우저 테스트(사용자)**

로그인 → AI 광고 제작 → 제품 선택/설정 → 생성 → 문구/배경 확인 → 합성 이미지 다운로드 → 캠페인 저장. 오류 시 화면 캡처 공유.

---

## Self-Review 체크

- **Spec coverage:** 새 메뉴(Task4) / 제품 DB+업로드(Task5) / 카피 3안(Task2,6) / 배경 2장(Task3,6) / 선택·편집(Task7) / 정사각 합성+내보내기(Task7) / 저장(Task1,8) / 인증·에러(Task2,3) / 준비물·비용 안내(Task9) — 스펙 항목 모두 태스크로 커버됨. A4/Gemini/누끼는 스펙상 범위 밖(Phase 2).
- **Placeholder:** 서버 함수는 전체 코드 제공. 프론트는 기존 패턴 재사용 지점을 명시(escHtml/showToast/sb.auth/html2canvas/paginatedLoad) — 실행자가 해당 패턴을 그대로 따르면 됨.
- **Type/이름 일관성:** `_adProduct/_adSettings/_adResults`, `/api/ad-copy`·`/api/ad-image`, `ad_campaigns` 컬럼명(product_snapshot/settings/copy/bg_image) 전 태스크 일관.
