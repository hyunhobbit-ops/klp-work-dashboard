// 슈퍼관리자(운영자) 전용 — 새 회사 + 첫 관리자 계정 생성 (Vercel 서버리스, CommonJS, 의존성 0)
// 흐름: 요청자 토큰 검증 → is_superadmin 확인 → 회사 생성 → 관리자 Auth 계정 생성 → 프로필 생성 → 임시 비번 반환
//
// 환경변수 (Vercel에 등록 필요):
//   SUPABASE_URL                — 예) https://vtulmuxkriklpiibiues.supabase.co (미설정 시 기본값 사용)
//   SUPABASE_SERVICE_ROLE_KEY   — (필수) 서비스롤 키. 절대 브라우저 노출 금지, 서버에만 보관.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';

// 서비스롤로 Supabase REST/Auth 호출
async function sbAdmin(path, opts = {}) {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
        ...opts,
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            ...(opts.headers || {}),
        },
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
    return { ok: res.ok, status: res.status, body };
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 허용됩니다.' }); return; }
    if (!SERVICE_KEY) {
        res.status(503).json({ error: '서버 키가 아직 설정되지 않았습니다. 관리자가 Vercel 환경변수(SUPABASE_SERVICE_ROLE_KEY)를 등록해야 합니다.' });
        return;
    }

    try {
        // 1) 요청자 토큰 검증
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (!token) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
        const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` },
        });
        if (!meRes.ok) { res.status(401).json({ error: '유효하지 않은 세션입니다.' }); return; }
        const meUser = await meRes.json();
        const authUid = meUser && meUser.id;
        if (!authUid) { res.status(401).json({ error: '세션 확인 실패' }); return; }

        // 2) is_superadmin 확인 (서비스롤로 profiles 조회 — RLS 우회)
        const profQ = await sbAdmin(`/rest/v1/profiles?auth_user_id=eq.${authUid}&select=is_superadmin,name`);
        const meProf = Array.isArray(profQ.body) ? profQ.body[0] : null;
        if (!meProf || meProf.is_superadmin !== true) {
            res.status(403).json({ error: '권한이 없습니다 (슈퍼관리자 전용).' }); return;
        }

        // 3) 입력 검증
        const { companyName, adminEmail, adminName, enabledModules } = (req.body || {});
        if (!companyName || !adminEmail || !adminName) {
            res.status(400).json({ error: '회사명 · 관리자 이메일 · 관리자 이름은 필수입니다.' }); return;
        }
        const modules = Array.isArray(enabledModules) && enabledModules.length
            ? enabledModules
            : ['home', 'daily', 'meetings', 'clients', 'projects'];
        if (!modules.includes('home')) modules.unshift('home');

        // 4) 회사 생성
        const settings = { brandName: companyName, logoUrl: null, primaryColor: '#1F85FF', enabledModules: modules };
        const compRes = await sbAdmin('/rest/v1/companies', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify({ name: companyName, plan: 'free', settings }),
        });
        if (!compRes.ok || !Array.isArray(compRes.body) || !compRes.body[0]) {
            res.status(500).json({ error: '회사 생성 실패', detail: compRes.body }); return;
        }
        const companyId = compRes.body[0].id;

        // 5) 관리자 Auth 계정 생성 (임시 비번, 이메일 확인 처리)
        const tempPassword = Math.random().toString(36).slice(2, 10) + 'A1!' + Math.random().toString(36).slice(2, 5);
        const userRes = await sbAdmin('/auth/v1/admin/users', {
            method: 'POST',
            body: JSON.stringify({ email: adminEmail, password: tempPassword, email_confirm: true }),
        });
        if (!userRes.ok || !userRes.body || !userRes.body.id) {
            // 회사만 생성되고 계정 실패 → 정리
            await sbAdmin(`/rest/v1/companies?id=eq.${companyId}`, { method: 'DELETE' });
            res.status(500).json({ error: '관리자 계정 생성 실패 (이미 쓰는 이메일일 수 있음)', detail: userRes.body }); return;
        }
        const newAuthId = userRes.body.id;

        // 6) 프로필 생성 (회사 관리자)
        const profRes = await sbAdmin('/rest/v1/profiles', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify({
                name: adminName, role: '관리자', email: adminEmail,
                auth_user_id: newAuthId, company_id: companyId,
                is_superadmin: false, sort_order: 10, is_active: true,
            }),
        });
        if (!profRes.ok) {
            res.status(500).json({ error: '프로필 생성 실패', detail: profRes.body }); return;
        }

        res.status(200).json({ ok: true, companyId, adminEmail, adminName, tempPassword });
    } catch (e) {
        console.error('admin-create-company error', e);
        res.status(500).json({ error: '서버 오류: ' + (e && e.message || e) });
    }
};
