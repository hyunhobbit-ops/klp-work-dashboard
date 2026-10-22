-- 069 (처음엔 067로 만들었다가 통화 기록 067과 겹쳐 번호만 바꿈): 매뉴얼 글 형식 — 'md'(마크다운 원문 그대로 저장, 볼 때 제목·굵게·표로 보여줌) / 'html'(기존 편집기) (2026-10-22 현호님 요청)
alter table public.manuals add column if not exists format text not null default 'html';
alter table public.manuals drop constraint if exists manuals_format_check;
alter table public.manuals add constraint manuals_format_check check (format in ('html', 'md'));
notify pgrst, 'reload schema';
