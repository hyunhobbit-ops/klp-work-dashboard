# 회의록 메뉴 — 설계 (2026-07-03)

## 목적
회의를 "기록"에서 끝내지 않고 **실제 업무로 이어지게** 한다.
회의록의 액션아이템이 담당자의 **일일계획표 할 일**로 자동 등록되고, 푸시 알림이 가며,
회의록 화면에서 **진행률**을 확인할 수 있다. 작성 부담은 **AI 자동 정리**(메모/녹음)로 줄인다.

## 핵심 흐름
```
회의 → (녹음 업로드 or 메모 붙여넣기)
     → AI가 요약·안건·결정사항·액션아이템 추출
     → 사람이 확인·수정 → 저장
     → [일일계획표로 보내기] → 담당자 할 일 생성 + 푸시 알림
     → 회의록에서 진행률(3/5) 확인 (완료 여부의 원본은 일일계획표)
```

## 메뉴 위치
사이드바 **"업무" 그룹 → 회의록** (일일계획표 아래). 탭 id `meetings`, 컨테이너 `#tab-meetings`.

---

## 화면

### ① 목록 (`renderMeetings`)
- 필터: 기간 / 참석자 / 관련 프로젝트 / 상태(작성중·공유됨·완료)
- 검색: 제목·내용
- 행 표시: `날짜 · 제목 · 참석자 · 액션아이템 진행률(3/5) · 상태 · 🔒(비공개)`
- 우상단 `+ 새 회의록`
- 페이지네이션: `paginatedLoad('meetings', {pageSize:30, orderBy:'meet_at', orderDir:'desc'})` + `renderLoadMoreButton`

### ② 작성/상세 (`renderMeetingEditor`) — 목록 뷰 ↔ 편집 뷰 전환 (제안서 패턴)
- 헤더: 제목 / 일시 / 장소 / **참석자**(직원 다중선택) / 외부 참석자(자유 입력) / 관련 **프로젝트·거래처** / **🔒 비공개 토글**
- **🤖 AI로 정리하기** 패널
  - `메모 붙여넣기` textarea → [AI로 정리]
  - `녹음 파일 올리기` → 업로드 → [전사 후 정리]
- 안건(Agenda) — 불릿 목록 (문자열 배열)
- 논의 내용 — 리치 텍스트(Quill, `planningSanitizeHtml`로 정화)
- **결정사항** — 불릿 목록 (문자열 배열)
- **액션아이템 표** — `할 일 / 담당자 / 마감일 / 상태` + 행 추가·삭제
  - **[일일계획표로 보내기]** 버튼 (아직 안 보낸 항목만 전송)
- 전사 원문 — 접기/펼치기 (읽기 전용)
- 하단: 저장 / 삭제

담당자 값은 **일일계획표와 동일한 목록**을 쓴다: `전체, 임원, 대표님, 이현주, 김현호, 유지은, 구정두`.

---

## 데이터 모델

### `meetings`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigint identity PK | |
| created_at | timestamptz default now() | |
| author | text | 작성자 이름(profiles.name) |
| title | text not null | |
| meet_at | timestamptz | 회의 일시 |
| location | text | 회의실/온라인 |
| attendees | jsonb | 직원 이름 배열 `["김현호","이현주"]` |
| external_attendees | text | 외부 참석자 자유 입력 |
| project_id | bigint | projects_domestic 참조(강제 FK 없음) |
| client | text | 거래처명 |
| agenda | jsonb | 문자열 배열 |
| content | text | 논의 내용 HTML |
| decisions | jsonb | 문자열 배열 |
| transcript | text | 전사 원문 |
| summary | text | AI 요약 |
| status | text default '작성중' | 작성중 / 공유됨 / 완료 |
| is_private | boolean default false | 비공개 여부 |
| audio_path | text | Storage 경로 |

### `meeting_actions`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigint identity PK | |
| meeting_id | bigint not null (FK → meetings, on delete cascade) | |
| task | text not null | |
| assignee | text | 일일계획표 담당자 값 |
| due_date | date | |
| daily_task_id | bigint | 연동된 `daily_tasks.id` (없으면 미전송) |
| created_at | timestamptz default now() | |

**완료 여부는 저장하지 않는다.** `daily_task_id`가 있으면 `daily_tasks.done`을 읽어 표시한다
(일일계획표가 단일 원본 — 두 곳에서 따로 체크하는 혼란 방지). 아직 전송 안 한 항목은 "미전송"으로 표시.

### Storage
비공개 버킷 `meeting-audio`. 경로: `<meeting_id or uuid>/<filename>`.

---

## 권한 (비공개 회의록)

기존 앱은 "authenticated = 전체 허용" 단순 모델이지만, 비공개 회의록은 **DB 차원에서 차단**한다.

```sql
create or replace function current_profile_name() returns text
  language sql stable security definer set search_path = public as $$
  select name from profiles where auth_user_id = auth.uid() limit 1 $$;

create or replace function current_profile_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from profiles where auth_user_id = auth.uid() limit 1 $$;
```

- `meetings` **SELECT**: `not is_private OR author = current_profile_name() OR attendees ? current_profile_name() OR current_profile_role() in ('관리자','부장','대표')`
- `meetings` **INSERT/UPDATE/DELETE**: `author = current_profile_name() OR current_profile_role() in ('관리자','부장','대표')`
- `meeting_actions`: 부모 회의가 보이면 보이고, 부모를 수정할 수 있으면 수정 가능 (`exists` 서브쿼리)
- Storage `meeting-audio`: authenticated 읽기/쓰기 (경로 노출이 곧 접근이므로 파일명에 uuid 사용)

---

## 액션아이템 → 일일계획표 연동

`sendMeetingActionsToDaily(meetingId)`:
1. `daily_task_id`가 비어 있는 액션아이템만 대상
2. 각 항목마다 기존 헬퍼 `dbInsertTask({...})` 호출
   - `task`: 액션아이템 내용
   - `date`: `due_date` (없으면 오늘)
   - `assignee`: 담당자
   - `label`: `'회사 업무'` (기존 라벨 재사용 — 새 라벨 추가하지 않음)
   - `client`: 회의의 거래처
   - `note`: `회의록: <회의 제목>`
   - `priority`: `'🟡 보통'`
3. 반환된 `id`를 `meeting_actions.daily_task_id`에 저장
4. 기존 `notifyNewTask(t)`로 담당자에게 푸시 알림
5. 완료 후 목록·진행률 재렌더

담당자가 없거나 이미 전송된 항목은 건너뛰고, 결과를 토스트로 요약한다.

---

## AI 파이프라인

### `api/meeting-summarize.js` (Claude)
- 입력: `{ text, attendees: [], title, meetAt }` — `text`는 메모 또는 전사 원문
- Claude Messages API + **도구로 JSON 강제** (`api/ad-copy.js` 패턴 그대로)
- 출력: `{ summary, agenda: [], decisions: [], actions: [{ task, assignee, dueDate }] }`
  - `assignee`는 전달한 참석자 목록 중에서만 고르게 하고, 불명확하면 빈 값
  - `dueDate`는 본문에 명시된 경우만 `YYYY-MM-DD`, 없으면 빈 값
- 인증: Supabase access_token 검증 (기존 패턴). 키 미설정 시 503.

### `api/meeting-transcribe.js` (OpenAI)
- 입력: `{ audioPath }` (Storage 경로)
- 서버가 **SERVICE_ROLE_KEY로 Storage에서 파일을 받아** OpenAI `/v1/audio/transcriptions` (`whisper-1`, `language=ko`)로 전송
- 출력: `{ text }`
- `export const config = { maxDuration: 300 }` — 긴 오디오 대비

### 기술 제약과 대응
| 제약 | 대응 |
|---|---|
| Vercel 서버리스 요청 본문 ~4.5MB | 오디오를 함수로 보내지 않는다. **브라우저 → Supabase Storage 직접 업로드**, 함수엔 경로만 전달 |
| OpenAI 전사 파일 25MB 한도 | 업로드 전 클라이언트에서 크기 확인. 25MB 초과 시 업로드 거부 + 안내 |
| 함수 실행시간 한도 | `maxDuration: 300`. 권장 회의 길이 **40분 이내**(저비트레이트면 1시간도 가능) |
| 전사 실패/타임아웃 | 오류를 화면에 그대로 노출(원문 메시지 포함). 회의록 본문 작성은 계속 가능 |

### 비용
- 전사(whisper-1): 분당 약 $0.006 → **1시간 ≈ 500원**
- AI 정리(Claude): 요청당 수십 원
- 사용하지 않으면 0원

---

## 단계 (Phase)

| 단계 | 범위 | 결과 |
|---|---|---|
| **1** | 테이블·RLS, 메뉴/탭, 목록, 작성/상세, 액션아이템, **일일계획표 연동 + 푸시**, 공개/비공개 | AI 없이도 완전히 쓸 수 있는 회의록 |
| **2** | `api/meeting-summarize` + "메모 붙여넣고 AI 정리" | 작성 시간 대폭 단축 |
| **3** | Storage 버킷, 녹음 업로드, `api/meeting-transcribe` → 2단계 정리로 연결 | "녹음만 하면 회의록 완성" |

각 단계는 독립적으로 배포 가능하며, 3단계가 실패해도 1·2단계는 그대로 동작한다.
**본 스펙의 구현 계획은 1단계부터 순서대로 작성한다.**

## 범위 밖 (이번에 하지 않음)
- 브라우저에서 직접 녹음(MediaRecorder) — 3단계는 **파일 업로드**만
- 회의록 외부 공유 링크(거래처용)
- 오디오 자동 분할(chunk) 전사 — 25MB/40분 한도 안내로 대체
- 액션아이템 완료를 회의록에서 직접 체크 (일일계획표가 원본)

## 코디네이션
같은 저장소에서 네이티브 앱 작업이 병행 중이다. 새 파일(`api/meeting-*.js`, 마이그레이션) 중심으로 추가하고,
`app.js` / `index.html` 공유 파일 수정은 회의록 섹션 한 곳에 모아 국소화한다. 커밋·배포 전 항상 원격을 먼저 받아 합친다(rebase).
