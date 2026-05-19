# KLP Dashboard Migrations

## Phase 1 — Supabase Auth + RLS 잠금 (2026-05-19)

스펙: `docs/superpowers/specs/2026-05-19-phase1-auth-rls-design.md`

### 실행 순서 (Supabase SQL Editor에서 위에서 아래로)

| 파일 | 실행 시점 | 게이트 |
|------|----------|--------|
| 001_profiles_add_auth_columns.sql | 즉시 | Gate 1 |
| 002_profiles_seed_emails.sql | 001 직후 | Gate 1 |
| (수동) Supabase Dashboard에서 4명 계정 추가 + 김현호 UUID 확인 | — | — |
| 003_link_auth_users.sql | 수동 작업 후 | Gate 2 |
| 004_lock_rls_internal_tables.sql | 003 직후 | Gate 3 |
| 005_lock_rls_public_proposals.sql | 004 직후 | Gate 3 |
| 006_lock_storage_marketdb.sql | 005 직후 | Gate 4 |
| (app.js 배포) | 006 직후 | Gate 5 |
| 007_drop_profiles_password.sql | **3~7일 정상 운영 확인 후** | Gate 6 |

### 게이트 검증 쿼리

각 파일 상단의 `-- VERIFICATION` 섹션 참조.

### 롤백

각 파일 하단의 `-- ROLLBACK` 섹션 참조.

### Step 7만 며칠 분리하는 이유

password 컬럼을 떨어뜨리면 평문 비번이 영구 소멸한다. Gate 5(코드 배포 후 5명 로그인 정상)
가 통과해도, 며칠 운영하며 진짜 이슈 없음을 확인한 후 실행.
