# AGENTS.md — KLP KOREA 업무 대시보드 (Codex 등 다른 AI 도구용)

**작업 전에 같은 폴더의 `CLAUDE.md`를 처음부터 끝까지 읽을 것.** 프로젝트 구조·DB·기능별 설계·주의사항이 전부 거기 있고, 항상 최신으로 유지됨 (이 파일은 요약·안내만).
기능을 고치거나 추가하면 `CLAUDE.md`의 해당 절도 같이 고칠 것 (Claude Code와 Codex가 번갈아 작업함).

## 꼭 지킬 것 (요약 — 자세한 건 CLAUDE.md)
- 사용자(현호님)에게는 **항상 한국어**로, 쉬운 말로 답할 것
- 단일 파일 구조 유지: `app.js` · `index.html` · `styles.css` · `doc-generator.html`. 파일 분리하지 않음. 기존 패턴·주석 밀도·이름 짓는 방식을 따를 것
- **배포**: master에 커밋 → `git push` 하면 Vercel이 자동 배포. `index.html`의 `app.js?v=` / `styles.css?v=` 버전 문자열을 올려야 브라우저 캐시가 갱신됨. 커밋 메시지는 한국어
- 문법 확인: `docker run --rm -v "$PWD":/w:ro node:22-alpine node --check /w/app.js`
- **DB는 맥미니 자체 Supabase** (`https://api.klpkorea.cloud`). 마이그레이션은 `migrations/0XX_….sql`로 만들고 `docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < migrations/0XX_….sql` 로 적용 (+ 필요하면 `notify pgrst, 'reload schema'`). Supabase 클라우드/MCP는 옛 프로젝트라 쓰지 말 것
- 새 테이블: `company_id` + `set_company_id` 트리거 + 회사 스코프 RLS (CLAUDE.md '멀티테넌트' 참조)
- 사용자 입력을 innerHTML에 넣을 때는 `escHtml` (CLAUDE.md 'XSS 봉합')
- **비밀값 금지**: `.env`·키·토큰·`app_config`의 비밀값을 출력하거나 채팅·커밋에 넣지 말 것. 키 입력이 필요하면 사용자가 터미널에서 `read -rs`로 직접 넣게 안내
- 엣지 함수(`edge/kakao/index.ts`)를 고치면 `~/Desktop/hyunho-server/supabase/volumes/functions/kakao/`로 복사 후 `docker restart supabase-edge-functions`
- 맥미니 네트워크(USB-C 랜, 고정 IP 172.30.1.85)·공유기·DNS 설정은 건드리지 말 것
- 다른 회사 명의 서류(견적서 등)를 만들거나 공급자 정보를 바꿀 수 있게 하는 기능은 만들지 않음
