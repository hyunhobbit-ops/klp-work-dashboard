# KLP Dashboard Migrations

## Phase 1 — Supabase Auth + RLS 잠금 (2026-05-19)

스펙: `docs/superpowers/specs/2026-05-19-phase1-auth-rls-design.md`

### 실행 순서 (Supabase SQL Editor에서 위에서 아래로)

| 단계 | 파일/작업 | 실행 시점 | 게이트 |
|------|----------|----------|--------|
| 1 | 001_profiles_add_auth_columns.sql | 즉시 | Gate 1 |
| 2 | 002_profiles_seed_emails.sql | 001 직후 | Gate 1 |
| 3 | (수동) Supabase Dashboard에서 4명 계정 추가 + 김현호 UUID 확인 | — | — |
| 4 | 003_link_auth_users.sql | 수동 작업 후 | Gate 2 |
| 5 | **app.js 신규 인증 흐름 Vercel 배포** | 003 직후 | (배포 후 smoke 로그인 1회) |
| 6 | 004_lock_rls_internal_tables.sql | 신규 app.js 배포 + smoke 로그인 통과 후 | Gate 3 |
| 7 | 005_lock_rls_public_proposals.sql | 004 직후 | Gate 3 |
| 8 | 006_lock_storage_marketdb.sql | 005 직후 | Gate 4 |
| 9 | (선택) 006b_lock_storage_planning_images.sql | 006 직후 | Gate 4 |
| 10 | 5명 본 로그인 시나리오 테스트 | 006 직후 | Gate 5 |
| 11 | 007_drop_profiles_password.sql | **3~7일 정상 운영 확인 후** | Gate 6 |

### 배포 순서가 바뀐 이유 (003 → app.js 배포 → 004)

이전 안: 004 RLS 잠금을 먼저 한 뒤 app.js를 배포. 그 사이 구 app.js는 anon 역할로 잠긴 테이블에 접근 → 사용자에게 broken 상태가 보인다.

현재 안: 003으로 `auth_user_id` 컬럼 연결까지 끝낸 직후 신규 app.js를 먼저 배포하고, 정상 로그인 1회로 smoke test. 그 후 004부터 RLS를 잠그면 신규 app.js는 이미 Supabase Auth JWT를 첨부하고 있어 무중단.

### 게이트 검증 쿼리

각 파일 상단의 `-- VERIFICATION` 섹션 참조.

### 롤백

각 파일 하단의 `-- ROLLBACK` 섹션 참조.

### Step 7만 며칠 분리하는 이유

password 컬럼을 떨어뜨리면 평문 비번이 영구 소멸한다. Gate 5(코드 배포 후 5명 로그인 정상)
가 통과해도, 며칠 운영하며 진짜 이슈 없음을 확인한 후 실행.
