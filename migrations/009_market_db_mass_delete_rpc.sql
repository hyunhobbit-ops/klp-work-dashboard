-- ==========================================
-- 009 — market_db 전체 삭제 RPC + 권한 체크
-- 게이트: Phase 3 G2
-- 영향: app.js의 deleteAllMarketdb는 더 이상 client-side delete().gte('id',0) 안 함.
--       RPC 경유 → 함수 내부에서 auth.uid → profiles.name 조회 → 권한자만 실행.
-- 권한자: 이현주, 김현호, 김관택 (app.js MARKETDB_ALLOWED 와 동일)
-- ==========================================

CREATE OR REPLACE FUNCTION public.delete_all_marketdb()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_name TEXT;
    deleted_count INTEGER;
BEGIN
    -- 1) 호출자 식별
    SELECT name INTO caller_name
      FROM profiles
     WHERE auth_user_id = auth.uid();

    IF caller_name IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
    END IF;

    -- 2) 권한 체크 (MARKETDB_ALLOWED 와 동기화: 이현주, 김현호, 김관택)
    IF caller_name NOT IN ('이현주', '김현호', '김관택') THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED: % 계정에는 중고마켓DB 전체 삭제 권한이 없습니다.', caller_name
          USING ERRCODE = '42501';
    END IF;

    -- 3) 전체 삭제 + count 반환
    DELETE FROM market_db;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- anon에게는 EXECUTE 권한 주지 않음. authenticated만 호출 가능.
REVOKE ALL ON FUNCTION public.delete_all_marketdb() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_all_marketdb() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_all_marketdb() TO authenticated;

-- VERIFICATION ------------------------------
-- 1) 함수가 존재하고 권한이 authenticated에만 있는지:
-- SELECT proname, proacl FROM pg_proc WHERE proname = 'delete_all_marketdb';
--
-- 2) 권한 없는 직원(예: 유지은)으로 로그인 후 콘솔에서:
--    sb.rpc('delete_all_marketdb')
--    → error.message contains 'NOT_AUTHORIZED' 떨어져야 함
--
-- 3) 권한 있는 직원(예: 김관택)으로 로그인 후 콘솔에서:
--    (test 데이터 1행 INSERT 후) sb.rpc('delete_all_marketdb')
--    → 1 반환, market_db 빈 상태

-- ROLLBACK ----------------------------------
-- DROP FUNCTION IF EXISTS public.delete_all_marketdb();
-- 그 후 app.js의 deleteAllMarketdb를 직전 패턴(sb.from('market_db').delete().gte('id',0))으로 복원
