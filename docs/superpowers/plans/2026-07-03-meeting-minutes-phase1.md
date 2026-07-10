# 회의록 메뉴 — 1단계(코어) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 없이도 완전히 쓸 수 있는 회의록 메뉴를 만든다 — 목록·작성/편집·액션아이템, 그리고 액션아이템을 일일계획표 할 일로 보내며 담당자에게 푸시 알림이 가는 것까지.

**Architecture:** 기존 앱 구조 그대로 간다. Supabase에 `meetings` / `meeting_actions` 두 테이블을 만들고, 비공개 회의록만 RLS로 DB 차원에서 막는다. 화면은 `index.html`의 `#tab-meetings` 한 컨테이너 안에서 **목록 뷰 ↔ 편집 뷰**를 토글하는 제안서(`renderProposals` / `openProposalEditor`) 패턴을 따른다. 로직은 `app.js` 맨 아래 "회의록" 섹션 한 곳에 모아 국소화한다(같은 저장소에서 네이티브 앱 작업이 병행 중이므로 공유 파일 충돌 최소화). 액션아이템 전송은 새 API를 만들지 않고 기존 `dbInsertTask()`를 재사용한다 — `dbInsertTask()`가 내부에서 이미 `notifyNewTask()`를 호출하므로 푸시는 공짜로 따라온다.

**Tech Stack:** Vanilla JS (`app.js`), Supabase JS SDK (`sb`), Postgres RLS + `security definer` 함수, Vercel 정적 배포.

**참조 스펙:** `docs/superpowers/specs/2026-07-03-meeting-minutes-design.md`
**범위:** 스펙의 **1단계만**. `api/meeting-summarize.js`(2단계), `api/meeting-transcribe.js` + Storage(3단계)는 이 계획에 포함하지 않는다.

**스펙 대비 1단계에서 의도적으로 줄인 것** (컬럼은 만들되 UI는 나중에):
- 목록 필터는 **제목·내용 검색만**. 기간/참석자/프로젝트/상태 필터는 회의록이 수십 건 쌓인 뒤에 넣는다 (YAGNI).
- 논의 내용은 Quill 리치 텍스트가 아니라 **plain textarea**. `content` 컬럼은 text이므로 나중에 Quill로 바꿔도 스키마 변경이 없다.
- 편집 화면에 **관련 프로젝트(`project_id`) 선택 UI를 넣지 않는다.** 거래처(`client`) 텍스트만 받는다. 컬럼은 미리 만들어 둔다.
- 전사 원문(`transcript`) 접기/펼치기는 3단계에서 붙인다.

---

## 이 저장소의 검증 방식 (중요)

이 프로젝트에는 테스트 러너(jest/pytest 등)가 **없다**. 그러므로 TDD의 "실패하는 테스트 먼저"는 다음 3종으로 대체한다. 각 태스크는 해당하는 것만 실행하면 된다.

| 종류 | 명령/방법 | 통과 기준 |
|---|---|---|
| **문법 검사** | `node --check app.js` | 출력 없음(종료코드 0) |
| **DB 검증** | Supabase MCP `execute_sql`로 SELECT | 아래 각 태스크에 명시된 행/컬럼이 나옴 |
| **브라우저 검증** | `preview_start` → `preview_eval` / `preview_snapshot` | 아래 각 태스크에 명시된 DOM 조건 |

`preview_screenshot`은 이 환경에서 자주 타임아웃난다. **스크린샷 대신 `preview_eval`로 DOM/값을 단언**할 것.

---

## 파일 구조

| 파일 | 하는 일 |
|---|---|
| `migrations/019_meetings.sql` | **생성.** `meetings`, `meeting_actions` 테이블 + `current_profile_name()` / `current_profile_role()` + RLS 정책 |
| `index.html` | **수정.** 사이드바 "업무" 그룹에 회의록 nav 버튼(일일계획표 아래) + `<main id="tab-meetings">` 껍데기 + `app.js?v=` 캐시버스터 |
| `app.js` | **수정.** 맨 아래에 `// ===== 회의록 =====` 섹션 추가(상태, 로드, 목록, 편집, 액션아이템, 일일계획표 전송). 그리고 `switchTab`(1122줄 부근)과 탭 제목 맵(484줄)에 각각 한 줄씩. |
| `styles.css` | **수정.** 회의록 전용 클래스 몇 개. 파일 맨 아래에 추가. |
| `CLAUDE.md` | **수정.** "회의록" 섹션 추가 |

---

## 태스크 전 공통 규칙

- **커밋 전 항상** `git fetch origin && git rebase origin/master` (네이티브 앱 작업이 같은 저장소에서 병행 중)
- 커밋 메시지는 한국어. 마지막 줄에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 사용자 입력을 `innerHTML`에 넣을 때는 **반드시 `escHtml()`** (`app.js` 내 기존 헬퍼)
- 배포는 **Task 8**에서 한 번만: `git push origin master` → `vercel --prod --yes`

---

### Task 1: DB — 테이블·함수·RLS

**Files:**
- Create: `migrations/019_meetings.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

`migrations/019_meetings.sql`:

```sql
-- 회의록 (1단계): meetings + meeting_actions
-- 비공개 회의록은 RLS로 DB 차원에서 차단한다.

-- 로그인한 사용자의 profiles.name / profiles.role 을 꺼내는 헬퍼.
-- profiles 자체 RLS를 우회해야 하므로 security definer.
create or replace function current_profile_name() returns text
  language sql stable security definer set search_path = public as $$
  select name from profiles where auth_user_id = auth.uid() limit 1
$$;

create or replace function current_profile_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from profiles where auth_user_id = auth.uid() limit 1
$$;

create table if not exists meetings (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  author text,
  title text not null,
  meet_at timestamptz,
  location text,
  attendees jsonb default '[]'::jsonb,   -- ["김현호","이현주"]
  external_attendees text,
  project_id bigint,                     -- projects_domestic 참조(FK 강제 안 함)
  client text,
  agenda jsonb default '[]'::jsonb,      -- 문자열 배열
  content text,                          -- 논의 내용 HTML
  decisions jsonb default '[]'::jsonb,   -- 문자열 배열
  transcript text,                       -- 3단계용
  summary text,                          -- 2단계용
  status text default '작성중',
  is_private boolean default false,
  audio_path text                        -- 3단계용
);

create table if not exists meeting_actions (
  id bigint generated always as identity primary key,
  meeting_id bigint not null references meetings(id) on delete cascade,
  task text not null,
  assignee text,
  due_date date,
  daily_task_id bigint,                  -- daily_tasks.id (없으면 미전송)
  created_at timestamptz default now()
);
create index if not exists meeting_actions_meeting_id_idx on meeting_actions(meeting_id);
create index if not exists meetings_meet_at_idx on meetings(meet_at desc);

alter table meetings enable row level security;
alter table meeting_actions enable row level security;

-- 볼 수 있는 회의: 공개 / 내가 쓴 것 / 내가 참석자 / 관리자급
drop policy if exists "meetings_select" on meetings;
create policy "meetings_select" on meetings for select to authenticated
using (
  not coalesce(is_private, false)
  or author = current_profile_name()
  or attendees ? current_profile_name()
  or current_profile_role() in ('관리자', '부장', '대표')
);

-- 쓰기: 작성자 본인 또는 관리자급
drop policy if exists "meetings_insert" on meetings;
create policy "meetings_insert" on meetings for insert to authenticated
with check (author = current_profile_name() or current_profile_role() in ('관리자', '부장', '대표'));

drop policy if exists "meetings_update" on meetings;
create policy "meetings_update" on meetings for update to authenticated
using (author = current_profile_name() or current_profile_role() in ('관리자', '부장', '대표'))
with check (author = current_profile_name() or current_profile_role() in ('관리자', '부장', '대표'));

drop policy if exists "meetings_delete" on meetings;
create policy "meetings_delete" on meetings for delete to authenticated
using (author = current_profile_name() or current_profile_role() in ('관리자', '부장', '대표'));

-- 액션아이템: 부모 회의가 보이면 보이고, 부모를 고칠 수 있으면 고칠 수 있다.
drop policy if exists "meeting_actions_select" on meeting_actions;
create policy "meeting_actions_select" on meeting_actions for select to authenticated
using (exists (select 1 from meetings m where m.id = meeting_id));

drop policy if exists "meeting_actions_write" on meeting_actions;
create policy "meeting_actions_write" on meeting_actions for all to authenticated
using (exists (
  select 1 from meetings m where m.id = meeting_id
    and (m.author = current_profile_name() or current_profile_role() in ('관리자', '부장', '대표'))
))
with check (exists (
  select 1 from meetings m where m.id = meeting_id
    and (m.author = current_profile_name() or current_profile_role() in ('관리자', '부장', '대표'))
));
```

> `meeting_actions_select`의 `exists (select 1 from meetings ...)`는 `meetings`의 SELECT 정책을 통과한 행만 보이므로, 별도로 비공개 조건을 다시 쓸 필요가 없다.

- [ ] **Step 2: Supabase에 적용**

Supabase MCP `apply_migration` 도구로 이름 `create_meetings`, 쿼리는 위 SQL 전문.

- [ ] **Step 3: 적용 확인**

Supabase MCP `execute_sql`:

```sql
select table_name, column_name
from information_schema.columns
where table_name in ('meetings','meeting_actions')
order by table_name, ordinal_position;
```

기대: `meetings` 18개 컬럼(id…audio_path), `meeting_actions` 7개 컬럼. `meeting_actions`에 **`done` 컬럼이 없어야 한다**(완료 여부의 원본은 `daily_tasks.done`).

이어서 정책 확인:

```sql
select tablename, policyname from pg_policies
where tablename in ('meetings','meeting_actions') order by 1,2;
```

기대: `meeting_actions` 2건(`_select`, `_write`), `meetings` 4건(`_select`, `_insert`, `_update`, `_delete`).

- [ ] **Step 4: 커밋**

```bash
git fetch origin && git rebase origin/master
git add migrations/019_meetings.sql
git commit -m "회의록: meetings/meeting_actions 테이블 + RLS 마이그레이션 추가"
```

---

### Task 2: 메뉴와 빈 탭 껍데기

**Files:**
- Modify: `index.html` (nav 118~121줄 아래, `<main id="tab-daily">` 이후 어딘가에 새 `<main>`)
- Modify: `app.js` (484줄 탭 제목 맵, 1122줄 부근 `switchTab` 훅)

- [ ] **Step 1: 사이드바에 회의록 버튼 추가**

`index.html`에서 일일계획표 버튼(118~121줄) **바로 아래**에 삽입:

```html
                    <button class="nav-item" data-tab="meetings" data-tip="회의 기록 + 액션아이템을 일일계획표로 전송">
                        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        <span>회의록</span>
                    </button>
```

- [ ] **Step 2: 탭 컨테이너 추가**

`index.html`에서 `<main class="content" id="tab-ad-studio">` **바로 앞**에 삽입:

```html
            <main class="content" id="tab-meetings">
                <div id="meetingsBody"></div>
            </main>
```

`#meetingsBody` 안을 통째로 JS가 그린다(목록 뷰든 편집 뷰든). 정적 HTML을 더 넣지 않는다 — 공유 파일 수정을 최소화하기 위함.

- [ ] **Step 3: 탭 제목 등록**

`app.js` 484줄 `'ad-studio': 'AI 광고 제작',` **바로 위**에:

```js
    'meetings': '회의록',
```

- [ ] **Step 4: 탭 진입 훅**

`app.js` 1122줄의 `if (tabId === 'ad-studio') {` 블록 **바로 위**에:

```js
    if (tabId === 'meetings') {
        if (!fromHistory) _meetingEditingId = undefined; // 사이드바 클릭 시 목록으로 리셋
        try { renderMeetings(); } catch (e) { console.error('renderMeetings failed', e); }
    }
```

> `_meetingEditingId`와 `renderMeetings`는 Task 3에서 정의한다. 이 순서 때문에 Step 5의 브라우저 확인은 Task 3 이후에 한다. 지금은 문법만 본다.

- [ ] **Step 5: 문법 검사**

```bash
node --check app.js
```

기대: 출력 없음.

- [ ] **Step 6: 커밋**

```bash
git fetch origin && git rebase origin/master
git add index.html app.js
git commit -m "회의록: 사이드바 메뉴 + 탭 컨테이너 추가"
```

---

### Task 3: 상태 + DB 로드 + 목록 화면

**Files:**
- Modify: `app.js` (파일 맨 끝에 새 섹션)

- [ ] **Step 1: 회의록 섹션 골격과 상태를 `app.js` 맨 끝에 추가**

```js
// ===== 회의록 =====================================================
const MEETING_ASSIGNEES = ['전체', '임원', '대표님', '이현주', '김현호', '유지은', '구정두'];
const MEETING_STAFF = ['이현주', '김현호', '유지은', '구정두'];
const MEETING_STATUSES = ['작성중', '공유됨', '완료'];

let _meetings = [];            // 목록에 그릴 회의 배열 (DB row 그대로)
let _meetingsPage = null;      // paginatedLoad 상태
let _meetingEditingId;         // undefined=목록, null=새 회의록, 숫자=편집 중
let _meetingDraft = null;      // 편집 중인 회의 객체
let _meetingActions = [];      // 편집 중인 회의의 액션아이템
let _meetingActionDone = {};   // { daily_task_id: true/false } — daily_tasks.done 사본
let _meetingsSearch = '';

function _meetingRowDefaults(r) {
    return {
        id: r.id,
        author: r.author || '',
        title: r.title || '',
        meetAt: r.meet_at || '',
        location: r.location || '',
        attendees: Array.isArray(r.attendees) ? r.attendees : [],
        externalAttendees: r.external_attendees || '',
        client: r.client || '',
        agenda: Array.isArray(r.agenda) ? r.agenda : [],
        content: r.content || '',
        decisions: Array.isArray(r.decisions) ? r.decisions : [],
        status: r.status || '작성중',
        isPrivate: !!r.is_private
    };
}

function _meetingToDb(m) {
    return {
        author: m.author || null,
        title: m.title,
        meet_at: m.meetAt ? new Date(m.meetAt).toISOString() : null,
        location: m.location || null,
        attendees: m.attendees || [],
        external_attendees: m.externalAttendees || null,
        client: m.client || null,
        agenda: m.agenda || [],
        content: m.content || null,
        decisions: m.decisions || [],
        status: m.status || '작성중',
        is_private: !!m.isPrivate
    };
}

// datetime-local 입력값 ↔ ISO
function _meetingLocalDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function _meetingDateLabel(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d)) return '-';
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
```

- [ ] **Step 2: 로드 + 목록 렌더**

이어서 붙인다:

```js
async function loadMeetings() {
    try {
        _meetingsPage = await paginatedLoad('meetings', {
            pageSize: 30, orderBy: 'meet_at', orderDir: 'desc', secondaryOrderBy: 'id', secondaryOrderDir: 'desc'
        });
        _meetings = _meetingsPage.data || [];
    } catch (e) {
        console.error('loadMeetings failed', e);
        showToast('회의록 불러오기 실패: ' + (e.message || e));
        _meetings = [];
    }
}

// 목록에 진행률을 보여주려면 각 회의의 액션아이템 + 연결된 할 일의 done이 필요하다.
// 한 번에 다 긁어와 메모리에서 집계 (건수가 작음).
async function _meetingLoadProgress(ids) {
    const map = {}; // meetingId -> { total, done }
    if (!ids.length) return map;
    const { data: acts, error } = await sb.from('meeting_actions')
        .select('meeting_id, daily_task_id').in('meeting_id', ids);
    if (error) { console.error(error); return map; }
    const taskIds = (acts || []).map(a => a.daily_task_id).filter(Boolean);
    const doneMap = {};
    if (taskIds.length) {
        const { data: tasks } = await sb.from('daily_tasks').select('id, done').in('id', taskIds);
        (tasks || []).forEach(t => { doneMap[t.id] = !!t.done; });
    }
    (acts || []).forEach(a => {
        if (!map[a.meeting_id]) map[a.meeting_id] = { total: 0, done: 0 };
        map[a.meeting_id].total++;
        if (a.daily_task_id && doneMap[a.daily_task_id]) map[a.meeting_id].done++;
    });
    return map;
}

async function renderMeetings() {
    const box = document.getElementById('meetingsBody');
    if (!box) return;
    if (_meetingEditingId !== undefined) { renderMeetingEditor(); return; }

    box.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gray-500)">불러오는 중…</div>';
    await loadMeetings();
    const progress = await _meetingLoadProgress(_meetings.map(m => m.id));

    const q = _meetingsSearch.trim().toLowerCase();
    const rows = _meetings.filter(m => !q ||
        (m.title || '').toLowerCase().includes(q) ||
        (m.content || '').toLowerCase().includes(q));

    box.innerHTML = `
      <div class="page-head" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px">
        <input id="meetingsSearch" type="text" placeholder="제목·내용 검색" value="${escHtml(_meetingsSearch)}"
               style="flex:1;max-width:320px;padding:10px 14px;border:1px solid var(--gray-200);border-radius:8px;font-size:14px">
        <button class="btn-primary" id="meetingNewBtn">+ 새 회의록</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th style="width:150px">일시</th><th>제목</th><th style="width:200px">참석자</th>
            <th style="width:110px">액션아이템</th><th style="width:90px">상태</th>
          </tr></thead>
          <tbody id="meetingsTbody"></tbody>
        </table>
      </div>
      <div id="meetingsMore"></div>`;

    const tb = document.getElementById('meetingsTbody');
    if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="5" style="padding:40px;text-align:center;color:var(--gray-500)">회의록이 없습니다. 오른쪽 위 “+ 새 회의록”을 눌러 시작하세요.</td></tr>';
    } else {
        tb.innerHTML = rows.map(m => {
            const p = progress[m.id] || { total: 0, done: 0 };
            const att = (Array.isArray(m.attendees) ? m.attendees : []).join(', ');
            return `<tr class="meeting-row" data-mid="${m.id}" style="cursor:pointer">
              <td>${escHtml(_meetingDateLabel(m.meet_at))}</td>
              <td>${m.is_private ? '🔒 ' : ''}${escHtml(m.title || '(제목 없음)')}</td>
              <td>${escHtml(att)}</td>
              <td>${p.total ? (p.done + ' / ' + p.total) : '-'}</td>
              <td>${escHtml(m.status || '작성중')}</td>
            </tr>`;
        }).join('');
    }

    renderLoadMoreButton(document.getElementById('meetingsMore'), _meetingsPage, () => {
        _meetings = _meetingsPage.data || [];
        renderMeetings();
    });

    document.getElementById('meetingNewBtn').addEventListener('click', () => openMeetingEditor(null));
    const s = document.getElementById('meetingsSearch');
    s.addEventListener('input', () => { _meetingsSearch = s.value; });
    s.addEventListener('keydown', (e) => { if (e.key === 'Enter') renderMeetings(); });
    tb.querySelectorAll('.meeting-row').forEach(tr => {
        tr.addEventListener('click', () => openMeetingEditor(Number(tr.dataset.mid)));
    });
}
```

> 검색은 이미 받아온 페이지 안에서만 거른다(서버 검색 아님). 30건 단위 페이지네이션 + "더 보기"로 충분하다. YAGNI.

- [ ] **Step 3: 문법 검사**

```bash
node --check app.js
```

기대: 출력 없음. (`openMeetingEditor` / `renderMeetingEditor`는 Task 4에서 정의하므로 아직 브라우저에서 클릭하면 에러가 난다. 정상이다.)

- [ ] **Step 4: 커밋**

```bash
git fetch origin && git rebase origin/master
git add app.js
git commit -m "회의록: 상태·DB 로드·목록 화면 추가"
```

---

### Task 4: 편집 화면 — 헤더/안건/내용/결정사항 + 저장·삭제

**Files:**
- Modify: `app.js` (회의록 섹션에 이어서)

- [ ] **Step 1: 편집 화면 열기/닫기와 렌더**

```js
async function openMeetingEditor(id) {
    _meetingEditingId = id; // null = 신규
    if (id === null) {
        const now = new Date();
        _meetingDraft = _meetingRowDefaults({
            author: (currentUser && currentUser.name) || '',
            title: '', meet_at: now.toISOString(), attendees: [], status: '작성중'
        });
        _meetingActions = [];
        _meetingActionDone = {};
        renderMeetingEditor();
        return;
    }
    const { data, error } = await sb.from('meetings').select('*').eq('id', id).single();
    if (error) { console.error(error); showToast('회의록 불러오기 실패: ' + error.message); _meetingEditingId = undefined; renderMeetings(); return; }
    _meetingDraft = _meetingRowDefaults(data);
    await loadMeetingActions(id);
    renderMeetingEditor();
}

function closeMeetingEditor() {
    _meetingEditingId = undefined;
    _meetingDraft = null;
    _meetingActions = [];
    renderMeetings();
}
```

- [ ] **Step 2: 편집 화면 마크업**

```js
function renderMeetingEditor() {
    const box = document.getElementById('meetingsBody');
    if (!box || !_meetingDraft) return;
    const m = _meetingDraft;

    const attendeeChips = MEETING_STAFF.map(n => `
      <label class="meeting-chip${m.attendees.includes(n) ? ' on' : ''}">
        <input type="checkbox" data-att="${escHtml(n)}" ${m.attendees.includes(n) ? 'checked' : ''} hidden>${escHtml(n)}
      </label>`).join('');

    const listEditor = (kind, items) => `
      <div id="meeting${kind}List">
        ${items.map((v, i) => `
          <div class="meeting-list-row">
            <input type="text" data-${kind.toLowerCase()}-i="${i}" value="${escHtml(v)}">
            <button type="button" class="meeting-del" data-${kind.toLowerCase()}-del="${i}">✕</button>
          </div>`).join('')}
      </div>
      <button type="button" class="btn-ghost" id="meeting${kind}Add">+ 추가</button>`;

    box.innerHTML = `
      <div class="page-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <button class="btn-ghost" id="meetingBackBtn">← 목록</button>
        <div style="display:flex;gap:8px">
          ${_meetingEditingId ? '<button class="btn-danger" id="meetingDeleteBtn">삭제</button>' : ''}
          <button class="btn-primary" id="meetingSaveBtn">저장</button>
        </div>
      </div>

      <div class="card" style="padding:20px;margin-bottom:16px">
        <div class="field"><label>제목</label>
          <input id="meetingTitle" type="text" value="${escHtml(m.title)}" placeholder="예: 2월 신제품 킥오프"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px">
          <div class="field"><label>일시</label>
            <input id="meetingMeetAt" type="datetime-local" value="${_meetingLocalDateTime(m.meetAt)}"></div>
          <div class="field"><label>장소</label>
            <input id="meetingLocation" type="text" value="${escHtml(m.location)}" placeholder="회의실 / 온라인"></div>
        </div>
        <div class="field" style="margin-top:14px"><label>참석자 (직원)</label>
          <div id="meetingAttendees" class="meeting-chips">${attendeeChips}</div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px">
          <div class="field"><label>외부 참석자</label>
            <input id="meetingExternal" type="text" value="${escHtml(m.externalAttendees)}" placeholder="예: OO상사 김부장"></div>
          <div class="field"><label>거래처</label>
            <input id="meetingClient" type="text" value="${escHtml(m.client)}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px">
          <div class="field"><label>상태</label>
            <select id="meetingStatus">${MEETING_STATUSES.map(s => `<option${s === m.status ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label>공개 범위</label>
            <label style="display:flex;align-items:center;gap:8px;padding-top:8px">
              <input id="meetingPrivate" type="checkbox" ${m.isPrivate ? 'checked' : ''}> 🔒 비공개 (참석자·작성자·관리자만)
            </label></div>
        </div>
      </div>

      <div class="card" style="padding:20px;margin-bottom:16px">
        <h3 style="margin:0 0 12px">안건</h3>
        ${listEditor('Agenda', m.agenda)}
      </div>

      <div class="card" style="padding:20px;margin-bottom:16px">
        <h3 style="margin:0 0 12px">논의 내용</h3>
        <textarea id="meetingContent" rows="10" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--gray-200);border-radius:8px;font-family:inherit;font-size:14px">${escHtml(m.content)}</textarea>
      </div>

      <div class="card" style="padding:20px;margin-bottom:16px">
        <h3 style="margin:0 0 12px">결정사항</h3>
        ${listEditor('Decisions', m.decisions)}
      </div>

      <div class="card" style="padding:20px" id="meetingActionsCard"></div>`;

    _bindMeetingEditor();
    renderMeetingActions();
}
```

> 스펙엔 논의 내용이 리치 텍스트(Quill)로 되어 있지만, 1단계에선 **plain textarea**로 간다. 저장 시 `escHtml(text).replace(/\n/g,'<br>')`로 HTML화하지 않고 **원문 그대로** `content`에 넣고, 목록·상세에서 출력할 때만 escape한다(현재 목록은 검색에만 쓴다). Quill 도입은 2단계 이후로 미룬다 — YAGNI.

- [ ] **Step 3: 입력 바인딩**

```js
function _bindMeetingEditor() {
    document.getElementById('meetingBackBtn').addEventListener('click', closeMeetingEditor);
    document.getElementById('meetingSaveBtn').addEventListener('click', saveMeeting);
    const del = document.getElementById('meetingDeleteBtn');
    if (del) del.addEventListener('click', deleteMeeting);

    document.querySelectorAll('#meetingAttendees input[data-att]').forEach(cb => {
        cb.addEventListener('change', () => {
            const n = cb.dataset.att;
            const on = cb.checked;
            const set = new Set(_meetingDraft.attendees);
            if (on) set.add(n); else set.delete(n);
            _meetingDraft.attendees = MEETING_STAFF.filter(x => set.has(x));
            cb.parentElement.classList.toggle('on', on);
        });
    });

    const bindList = (kind, key) => {
        const lower = kind.toLowerCase();
        document.querySelectorAll(`[data-${lower}-i]`).forEach(inp => {
            inp.addEventListener('input', () => { _meetingDraft[key][Number(inp.dataset[lower + 'I'])] = inp.value; });
        });
        document.querySelectorAll(`[data-${lower}-del]`).forEach(btn => {
            btn.addEventListener('click', () => {
                _meetingDraft[key].splice(Number(btn.dataset[lower + 'Del']), 1);
                renderMeetingEditor();
            });
        });
        document.getElementById('meeting' + kind + 'Add').addEventListener('click', () => {
            _meetingDraft[key].push('');
            renderMeetingEditor();
        });
    };
    bindList('Agenda', 'agenda');
    bindList('Decisions', 'decisions');
}

function _readMeetingForm() {
    const v = (id) => (document.getElementById(id) || {}).value || '';
    _meetingDraft.title = v('meetingTitle').trim();
    _meetingDraft.meetAt = v('meetingMeetAt');
    _meetingDraft.location = v('meetingLocation').trim();
    _meetingDraft.externalAttendees = v('meetingExternal').trim();
    _meetingDraft.client = v('meetingClient').trim();
    _meetingDraft.status = v('meetingStatus');
    _meetingDraft.content = v('meetingContent');
    _meetingDraft.isPrivate = !!(document.getElementById('meetingPrivate') || {}).checked;
    _meetingDraft.agenda = _meetingDraft.agenda.map(s => (s || '').trim()).filter(Boolean);
    _meetingDraft.decisions = _meetingDraft.decisions.map(s => (s || '').trim()).filter(Boolean);
}
```

> `dataset` 카멜케이스 주의: `data-agenda-i` → `dataset.agendaI`, `data-agenda-del` → `dataset.agendaDel`. 위 코드의 `dataset[lower + 'I']`는 `lower`가 `'agenda'`/`'decisions'`일 때 각각 `agendaI`/`decisionsI`가 되어 맞는다.

- [ ] **Step 4: 저장·삭제**

```js
async function saveMeeting() {
    _readMeetingForm();
    if (!_meetingDraft.title) { showToast('제목을 입력해주세요'); return; }
    const btn = document.getElementById('meetingSaveBtn');
    btn.disabled = true; btn.textContent = '저장 중…';
    try {
        if (!_meetingDraft.author) _meetingDraft.author = (currentUser && currentUser.name) || '';
        const payload = _meetingToDb(_meetingDraft);
        if (_meetingEditingId) {
            const { error } = await sb.from('meetings').update(payload).eq('id', _meetingEditingId);
            if (error) throw error;
        } else {
            const { data, error } = await sb.from('meetings').insert(payload).select().single();
            if (error) throw error;
            _meetingEditingId = data.id;
            _meetingDraft.id = data.id;
        }
        await saveMeetingActions();
        showToast('저장되었습니다');
        renderMeetingEditor();
    } catch (e) {
        console.error('saveMeeting failed', e);
        showToast('저장 실패: ' + (e.message || e));
    } finally {
        btn.disabled = false; btn.textContent = '저장';
    }
}

async function deleteMeeting() {
    if (!_meetingEditingId) return;
    if (!confirm('이 회의록을 삭제할까요? 액션아이템도 함께 지워집니다. (이미 보낸 일일계획표 할 일은 남습니다)')) return;
    const { error } = await sb.from('meetings').delete().eq('id', _meetingEditingId);
    if (error) { console.error(error); showToast('삭제 실패: ' + error.message); return; }
    showToast('삭제되었습니다');
    closeMeetingEditor();
}
```

> `saveMeetingActions`는 Task 5에서 정의한다. 신규 회의는 **저장 후 id가 생겨야** 액션아이템에 `meeting_id`를 붙일 수 있으므로, 회의 insert 직후에 액션아이템을 저장하는 이 순서가 필수다.

- [ ] **Step 5: 문법 검사**

```bash
node --check app.js
```

기대: 출력 없음.

- [ ] **Step 6: 커밋**

```bash
git fetch origin && git rebase origin/master
git add app.js
git commit -m "회의록: 작성·편집 화면(헤더/안건/내용/결정사항) + 저장·삭제"
```

---

### Task 5: 액션아이템 표 (CRUD)

**Files:**
- Modify: `app.js` (회의록 섹션에 이어서)

- [ ] **Step 1: 액션아이템 로드**

```js
async function loadMeetingActions(meetingId) {
    _meetingActions = [];
    _meetingActionDone = {};
    if (!meetingId) return;
    const { data, error } = await sb.from('meeting_actions')
        .select('*').eq('meeting_id', meetingId).order('id', { ascending: true });
    if (error) { console.error(error); showToast('액션아이템 불러오기 실패: ' + error.message); return; }
    _meetingActions = (data || []).map(a => ({
        id: a.id, task: a.task || '', assignee: a.assignee || '',
        dueDate: a.due_date || '', dailyTaskId: a.daily_task_id || null
    }));
    // 전송된 항목의 완료 여부는 daily_tasks 가 원본
    const ids = _meetingActions.map(a => a.dailyTaskId).filter(Boolean);
    if (ids.length) {
        const { data: tasks } = await sb.from('daily_tasks').select('id, done').in('id', ids);
        (tasks || []).forEach(t => { _meetingActionDone[t.id] = !!t.done; });
    }
}
```

- [ ] **Step 2: 액션아이템 표 렌더**

```js
function renderMeetingActions() {
    const card = document.getElementById('meetingActionsCard');
    if (!card) return;
    const sent = _meetingActions.filter(a => a.dailyTaskId).length;
    const unsent = _meetingActions.filter(a => !a.dailyTaskId && a.task.trim() && a.assignee).length;

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">액션아이템 <span style="font-weight:400;color:var(--gray-500);font-size:13px">전송 ${sent} / 전체 ${_meetingActions.length}</span></h3>
        <button class="btn-primary" id="meetingSendBtn" ${unsent ? '' : 'disabled'}>일일계획표로 보내기${unsent ? ' (' + unsent + ')' : ''}</button>
      </div>
      <table class="data-table"><thead><tr>
        <th>할 일</th><th style="width:130px">담당자</th><th style="width:150px">마감일</th><th style="width:110px">상태</th><th style="width:50px"></th>
      </tr></thead><tbody id="meetingActionsTbody">
        ${_meetingActions.map((a, i) => {
            let state = '미전송';
            if (a.dailyTaskId) state = _meetingActionDone[a.dailyTaskId] ? '✅ 완료' : '📤 전송됨';
            const locked = !!a.dailyTaskId;
            return `<tr>
              <td><input type="text" data-act-task="${i}" value="${escHtml(a.task)}" ${locked ? 'disabled' : ''}></td>
              <td><select data-act-assignee="${i}" ${locked ? 'disabled' : ''}>
                <option value="">선택</option>
                ${MEETING_ASSIGNEES.map(n => `<option${n === a.assignee ? ' selected' : ''}>${n}</option>`).join('')}
              </select></td>
              <td><input type="date" data-act-due="${i}" value="${escHtml(a.dueDate)}" ${locked ? 'disabled' : ''}></td>
              <td>${state}</td>
              <td>${locked ? '' : `<button type="button" class="meeting-del" data-act-del="${i}">✕</button>`}</td>
            </tr>`;
        }).join('')}
      </tbody></table>
      <button type="button" class="btn-ghost" id="meetingActionAdd" style="margin-top:10px">+ 액션아이템 추가</button>
      <p style="margin-top:10px;font-size:12px;color:var(--gray-500)">전송된 항목은 여기서 수정할 수 없습니다. 완료 체크는 <b>일일계획표</b>에서 하세요.</p>`;

    card.querySelectorAll('[data-act-task]').forEach(el => el.addEventListener('input', () => { _meetingActions[Number(el.dataset.actTask)].task = el.value; }));
    card.querySelectorAll('[data-act-assignee]').forEach(el => el.addEventListener('change', () => { _meetingActions[Number(el.dataset.actAssignee)].assignee = el.value; renderMeetingActions(); }));
    card.querySelectorAll('[data-act-due]').forEach(el => el.addEventListener('change', () => { _meetingActions[Number(el.dataset.actDue)].dueDate = el.value; }));
    card.querySelectorAll('[data-act-del]').forEach(el => el.addEventListener('click', async () => {
        const i = Number(el.dataset.actDel);
        const a = _meetingActions[i];
        if (a.id) { const { error } = await sb.from('meeting_actions').delete().eq('id', a.id); if (error) { showToast('삭제 실패: ' + error.message); return; } }
        _meetingActions.splice(i, 1);
        renderMeetingActions();
    }));
    card.querySelector('#meetingActionAdd').addEventListener('click', () => {
        _meetingActions.push({ id: null, task: '', assignee: '', dueDate: '', dailyTaskId: null });
        renderMeetingActions();
    });
    card.querySelector('#meetingSendBtn').addEventListener('click', () => sendMeetingActionsToDaily(_meetingEditingId));
}
```

> 담당자 select의 `change`에서 `renderMeetingActions()`를 다시 부르는 이유: "보내기" 버튼의 활성/개수 표시가 담당자 유무에 달려 있기 때문. `task` 입력은 매 글자마다 재렌더하면 포커스를 잃으므로 재렌더하지 않는다 — 대신 버튼 개수는 저장/담당자 변경 시에만 갱신된다(허용).

- [ ] **Step 3: 액션아이템 저장 (회의 저장 시 함께 호출)**

```js
async function saveMeetingActions() {
    const mid = _meetingEditingId;
    if (!mid) return;
    for (const a of _meetingActions) {
        const task = (a.task || '').trim();
        if (!task) continue;
        const row = { meeting_id: mid, task, assignee: a.assignee || null, due_date: a.dueDate || null };
        if (a.id) {
            if (a.dailyTaskId) continue; // 전송된 항목은 잠금
            const { error } = await sb.from('meeting_actions').update(row).eq('id', a.id);
            if (error) throw error;
        } else {
            const { data, error } = await sb.from('meeting_actions').insert(row).select().single();
            if (error) throw error;
            a.id = data.id;
        }
    }
}
```

- [ ] **Step 4: 문법 검사**

```bash
node --check app.js
```

기대: 출력 없음.

- [ ] **Step 5: 커밋**

```bash
git fetch origin && git rebase origin/master
git add app.js
git commit -m "회의록: 액션아이템 표(추가·수정·삭제·저장)"
```

---

### Task 6: 액션아이템 → 일일계획표 전송 + 푸시

**Files:**
- Modify: `app.js` (회의록 섹션에 이어서)

핵심: 새 알림 코드를 짜지 않는다. `dbInsertTask()`(app.js:5530)가 **내부에서 이미 `notifyNewTask(saved)`를 호출**하므로, `dbInsertTask`만 부르면 푸시까지 끝난다.

- [ ] **Step 1: 전송 함수**

```js
async function sendMeetingActionsToDaily(meetingId) {
    if (!meetingId) { showToast('먼저 회의록을 저장해주세요'); return; }
    // 표에 입력만 하고 저장 안 한 항목이 있을 수 있으니 먼저 저장
    try { await saveMeetingActions(); } catch (e) { showToast('저장 실패: ' + (e.message || e)); return; }

    const targets = _meetingActions.filter(a => a.id && !a.dailyTaskId && (a.task || '').trim() && a.assignee);
    if (!targets.length) { showToast('보낼 항목이 없습니다 (담당자를 지정해주세요)'); return; }

    const btn = document.getElementById('meetingSendBtn');
    if (btn) { btn.disabled = true; btn.textContent = '전송 중…'; }

    let ok = 0, fail = 0;
    for (const a of targets) {
        const saved = await dbInsertTask({
            task: a.task.trim(),
            date: a.dueDate || getTodayStr(),
            assignee: a.assignee,
            label: '회사 업무',
            client: _meetingDraft.client || '',
            note: '회의록: ' + (_meetingDraft.title || ''),
            priority: '🟡 보통',
            done: false
        });
        if (!saved || !saved.id) { fail++; continue; }
        const { error } = await sb.from('meeting_actions').update({ daily_task_id: saved.id }).eq('id', a.id);
        if (error) { console.error(error); fail++; continue; }
        a.dailyTaskId = saved.id;
        _meetingActionDone[saved.id] = false;
        ok++;
    }

    showToast(fail ? (ok + '건 전송, ' + fail + '건 실패') : (ok + '건을 일일계획표로 보냈습니다'));
    renderMeetingActions();
}
```

> `dbInsertTask`가 실패하면 `null`을 반환하고 자체적으로 토스트를 띄운다. `daily_task_id` 업데이트가 실패한 경우 할 일은 이미 생성됐지만 연결이 안 된 상태 — 다시 누르면 중복 생성된다. 실패 건수를 정확히 알려주므로 사용자가 일일계획표에서 확인하고 지울 수 있다. 1단계에선 이걸로 충분하다(트랜잭션 도입은 과함).

- [ ] **Step 2: 문법 검사**

```bash
node --check app.js
```

기대: 출력 없음.

- [ ] **Step 3: `dbInsertTask`가 정말 푸시를 보내는지 눈으로 확인**

`app.js:5530`을 읽어 `try { notifyNewTask(saved); } catch (e) {}` 줄이 있는지 확인한다. 있으면 회의록 쪽에서 `notifyNewTask`를 **추가로 부르지 않는다**(중복 알림 방지). 없으면 `sendMeetingActionsToDaily` 안 `ok++` 앞에 `try { notifyNewTask(saved); } catch (e) {}`를 넣는다.

- [ ] **Step 4: 커밋**

```bash
git fetch origin && git rebase origin/master
git add app.js
git commit -m "회의록: 액션아이템을 일일계획표 할 일로 전송(푸시 알림 포함)"
```

---

### Task 7: 스타일 + 브라우저 검증

**Files:**
- Modify: `styles.css` (맨 아래)
- Modify: `index.html` (캐시버스터)

- [ ] **Step 1: 회의록 전용 스타일을 `styles.css` 맨 아래에 추가**

```css
/* 회의록 */
.meeting-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.meeting-chip {
    padding: 7px 14px; border: 1px solid var(--gray-200); border-radius: 999px;
    font-size: 13px; cursor: pointer; user-select: none; background: var(--gray-50); color: var(--gray-600);
}
.meeting-chip.on { background: var(--blue); border-color: var(--blue); color: #fff; font-weight: 600; }
.meeting-list-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.meeting-list-row input {
    flex: 1; padding: 10px 12px; border: 1px solid var(--gray-200); border-radius: 8px;
    font-size: 14px; font-family: inherit;
}
.meeting-del {
    border: none; background: transparent; color: var(--gray-400);
    font-size: 15px; cursor: pointer; padding: 4px 8px;
}
.meeting-del:hover { color: #e05252; }
#meetingActionsCard input[type="text"],
#meetingActionsCard input[type="date"],
#meetingActionsCard select {
    width: 100%; box-sizing: border-box; padding: 8px 10px;
    border: 1px solid var(--gray-200); border-radius: 6px; font-size: 13px; font-family: inherit;
}
#meetingActionsCard input:disabled,
#meetingActionsCard select:disabled { background: var(--gray-50); color: var(--gray-500); }
```

- [ ] **Step 2: 캐시버스터 갱신**

`index.html`에서:
- `styles.css?v=20260702d` → `styles.css?v=20260703a`
- `app.js?v=20260703c` → `app.js?v=20260703d`

- [ ] **Step 3: 로컬 프리뷰 서버 확인**

`.claude/launch.json`이 있으면 `preview_start`로 띄운다. 없으면 만든다:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "klp", "runtimeExecutable": "npx", "runtimeArgs": ["-y", "serve", "-l", "3100", "."], "port": 3100 }
  ]
}
```

- [ ] **Step 4: 로그인 후 회의록 탭 진입 확인**

`preview_eval`:

```js
(() => {
  document.querySelector('[data-tab="meetings"]').click();
  return {
    tabVisible: getComputedStyle(document.getElementById('tab-meetings')).display !== 'none',
    hasNewBtn: !!document.getElementById('meetingNewBtn')
  };
})()
```

기대: `{tabVisible: true, hasNewBtn: true}` (목록 로드가 비동기이므로 `hasNewBtn`이 `false`면 1초 뒤 재실행)

- [ ] **Step 5: 새 회의록 → 저장 → 액션아이템 전송을 눈으로 확인**

브라우저에서 직접:
1. `+ 새 회의록` → 제목 "테스트 회의" 입력, 참석자에서 본인 클릭 → 저장 → 토스트 "저장되었습니다"
2. 액션아이템 `+ 추가` → 할 일 "샘플 액션", 담당자 본인, 마감일 오늘 → 저장
3. `일일계획표로 보내기 (1)` 클릭 → 토스트 "1건을 일일계획표로 보냈습니다", 상태가 `📤 전송됨`으로 바뀌고 그 행이 잠김
4. 일일계획표 탭 → 오늘 날짜 본인 컬럼에 "샘플 액션" 카드가 있고 📝 아이콘(비고)이 붙어 있음
5. 그 할 일을 완료 체크 → 회의록 탭으로 돌아와 회의록을 다시 열면 상태가 `✅ 완료`
6. 목록에서 그 회의의 액션아이템 칸이 `1 / 1`

- [ ] **Step 6: 비공개 RLS 확인 (Supabase MCP `execute_sql`)**

```sql
select id, title, is_private, author, attendees from meetings order by id desc limit 5;
```

`is_private = true`로 바꾼 회의를 참석자가 아닌 일반 권한 계정으로 로그인해 열면 목록에 안 보여야 한다. 테스트 계정이 없으면 이 확인은 건너뛰고 SQL로 정책 존재만 확인한다(Task 1 Step 3에서 이미 함).

- [ ] **Step 7: 테스트 데이터 정리**

위 5번에서 만든 "테스트 회의"와 일일계획표의 "샘플 액션"을 화면에서 삭제한다.

- [ ] **Step 8: 커밋**

```bash
git fetch origin && git rebase origin/master
git add styles.css index.html
git commit -m "회의록: 스타일 추가 + 캐시버스터 갱신"
```

---

### Task 8: 문서화 + 배포

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: `CLAUDE.md`에 회의록 섹션 추가**

`## 마진계산기 (편의성 그룹)` 섹션 **바로 위**에:

```markdown
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
- 주요 함수: `renderMeetings`, `openMeetingEditor`, `closeMeetingEditor`, `renderMeetingEditor`, `saveMeeting`, `deleteMeeting`, `loadMeetingActions`, `renderMeetingActions`, `saveMeetingActions`, `sendMeetingActionsToDaily`
- 2단계(`api/meeting-summarize.js`, AI 정리), 3단계(`api/meeting-transcribe.js`, 녹음 전사)는 미구현
```

- [ ] **Step 2: 커밋 + 배포**

```bash
git fetch origin && git rebase origin/master
git add CLAUDE.md
git commit -m "회의록: CLAUDE.md 문서화"
git push origin master
vercel --prod --yes
```

- [ ] **Step 3: 배포된 사이트에서 최종 확인**

`https://klp-work-dashboard.vercel.app/#meetings` 접속 → 사이드바 "회의록"이 보이고, 목록 화면이 뜨는지 확인. 사용자에게 URL과 함께 사용법(새 회의록 → 액션아이템 → 일일계획표로 보내기)을 한국어로 안내.

---

## 완료 기준 (1단계)

- [ ] 사이드바 "업무 → 회의록" 메뉴가 보인다
- [ ] 회의록을 만들고, 참석자·안건·논의내용·결정사항을 적고 저장할 수 있다
- [ ] 🔒 비공개로 표시하면 참석자·작성자·관리자 외에는 목록에서 보이지 않는다 (DB 차원)
- [ ] 액션아이템을 표에 넣고 [일일계획표로 보내기]를 누르면 담당자의 오늘/마감일 칸에 할 일이 생기고 푸시가 간다
- [ ] 보낸 할 일을 일일계획표에서 완료 체크하면 회의록의 진행률(`3/5`)에 반영된다
- [ ] 이미 보낸 액션아이템은 회의록에서 중복 전송되지 않는다
