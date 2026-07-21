// 회사 관리자 전용 — 자기 회사에 직원(로그인 계정) 추가 (Vercel 서버리스, CommonJS, 의존성 0)
// 흐름: 요청자 토큰 검증 → 관리자(role in 관리자/부장/대표) 확인 → 같은 회사에 직원 Auth계정+프로필 생성 → 임시비번 반환
//
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (admin-create-company.js와 동일)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';

const ADMIN_ROLES = ['관리자', '부장', '대표'];

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
        res.status(503).json({ error: '서버 키가 설정되지 않았습니다 (SUPABASE_SERVICE_ROLE_KEY).' });
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

        // 2) 요청자가 관리자(자기 회사)인지 확인
        const profQ = await sbAdmin(`/rest/v1/profiles?auth_user_id=eq.${authUid}&select=role,company_id`);
        const me = Array.isArray(profQ.body) ? profQ.body[0] : null;
        if (!me || !ADMIN_ROLES.includes(me.role)) {
            res.status(403).json({ error: '권한이 없습니다 (회사 관리자 전용).' }); return;
        }
        const companyId = me.company_id;

        // 3) 입력
        const { name, email, role } = (req.body || {});
        if (!name || !email) { res.status(400).json({ error: '이름과 이메일은 필수입니다.' }); return; }
        const newRole = ADMIN_ROLES.includes(role) || role === '임원' || role === '일반' ? role : '일반';

        // 4) 회사 내 이름 중복 방지(이름 로그인 호환)
        const dupQ = await sbAdmin(`/rest/v1/profiles?company_id=eq.${companyId}&name=eq.${encodeURIComponent(name)}&select=id`);
        if (Array.isArray(dupQ.body) && dupQ.body.length) {
            res.status(409).json({ error: '이미 같은 이름의 직원이 있습니다. 다른 이름을 쓰세요.' }); return;
        }

        // 5) Auth 계정 생성 (임시 비번)
        const tempPassword = Math.random().toString(36).slice(2, 10) + 'A1!' + Math.random().toString(36).slice(2, 5);
        const userRes = await sbAdmin('/auth/v1/admin/users', {
            method: 'POST',
            body: JSON.stringify({ email, password: tempPassword, email_confirm: true }),
        });
        if (!userRes.ok || !userRes.body || !userRes.body.id) {
            res.status(500).json({ error: '계정 생성 실패 (이미 쓰는 이메일일 수 있음)', detail: userRes.body }); return;
        }
        const newAuthId = userRes.body.id;

        // 6) 프로필 생성 (같은 회사)
        const profRes = await sbAdmin('/rest/v1/profiles', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify({
                name, role: newRole, email, auth_user_id: newAuthId,
                company_id: companyId, is_superadmin: false, sort_order: 100, is_active: true,
            }),
        });
        if (!profRes.ok) {
            res.status(500).json({ error: '프로필 생성 실패', detail: profRes.body }); return;
        }
        res.status(200).json({ ok: true, name, email, role: newRole, tempPassword });
    } catch (e) {
        console.error('company-add-user error', e);
        res.status(500).json({ error: '서버 오류: ' + (e && e.message || e) });
    }
};
