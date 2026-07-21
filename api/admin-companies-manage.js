// 슈퍼관리자 전용 — 회사 목록 조회(GET) / 회사 삭제(POST) (Vercel 서버리스, CommonJS, 의존성 0)
// 삭제: 그 회사의 모든 데이터 + 로그인 계정 + 회사 행 제거. KLP(1번)는 절대 삭제 불가.
//
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';

// FK 안전 순서(자식→부모)로 삭제할 테넌트 테이블
const PURGE_ORDER = [
  'meeting_actions', 'meetings', 'daily_tasks', 'projects_temp', 'projects_domestic',
  'quotes', 'proposals', 'products', 'product_categories', 'margin_simulations',
  'confirmations', 'push_subscriptions', 'deliveries', 'marketing_campaigns', 'market_db',
  'cash_snapshots', 'cash_accounts', 'planning_posts', 'planning_projects',
  'ad_campaigns', 'url_shortcuts', 'clients', 'clients_overseas', 'profiles',
];

async function sbAdmin(path, opts = {}) {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
        ...opts,
        headers: {
            'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json', ...(opts.headers || {}),
        },
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
    return { ok: res.ok, status: res.status, body };
}

async function requireSuperadmin(req, res) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) { res.status(401).json({ error: '로그인이 필요합니다.' }); return null; }
    const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` },
    });
    if (!meRes.ok) { res.status(401).json({ error: '유효하지 않은 세션입니다.' }); return null; }
    const meUser = await meRes.json();
    if (!meUser || !meUser.id) { res.status(401).json({ error: '세션 확인 실패' }); return null; }
    const profQ = await sbAdmin(`/rest/v1/profiles?auth_user_id=eq.${meUser.id}&select=is_superadmin`);
    const me = Array.isArray(profQ.body) ? profQ.body[0] : null;
    if (!me || me.is_superadmin !== true) { res.status(403).json({ error: '권한이 없습니다 (슈퍼관리자 전용).' }); return null; }
    return meUser.id;
}

module.exports = async (req, res) => {
    if (!SERVICE_KEY) { res.status(503).json({ error: '서버 키가 설정되지 않았습니다 (SUPABASE_SERVICE_ROLE_KEY).' }); return; }
    try {
        const uid = await requireSuperadmin(req, res);
        if (!uid) return;

        // 목록
        if (req.method === 'GET') {
            const q = await sbAdmin('/rest/v1/companies?select=id,name,plan,active,created_at,profiles(count)&order=id');
            if (!q.ok) { res.status(500).json({ error: '목록 조회 실패', detail: q.body }); return; }
            const rows = (Array.isArray(q.body) ? q.body : []).map(c => ({
                id: c.id, name: c.name, plan: c.plan, active: c.active, created_at: c.created_at,
                memberCount: (Array.isArray(c.profiles) && c.profiles[0]) ? c.profiles[0].count : 0,
            }));
            res.status(200).json({ ok: true, companies: rows });
            return;
        }

        // 삭제
        if (req.method === 'POST') {
            const { companyId } = (req.body || {});
            const cid = parseInt(companyId, 10);
            if (!cid || isNaN(cid)) { res.status(400).json({ error: '회사 번호가 필요합니다.' }); return; }
            if (cid === 1) { res.status(400).json({ error: 'KLP(1번 회사)는 삭제할 수 없습니다.' }); return; }

            // 1) 이 회사 계정들의 auth_user_id 수집 (프로필 삭제 전에)
            const profQ = await sbAdmin(`/rest/v1/profiles?company_id=eq.${cid}&select=auth_user_id`);
            const authIds = (Array.isArray(profQ.body) ? profQ.body : []).map(p => p.auth_user_id).filter(Boolean);

            // 2) 테넌트 데이터 삭제 (자식→부모 순)
            for (const t of PURGE_ORDER) {
                const del = await sbAdmin(`/rest/v1/${t}?company_id=eq.${cid}`, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
                if (!del.ok && del.status !== 404 && del.status !== 406) {
                    // 404/406 = 그 테이블에 해당 없음. 그 외 오류만 중단.
                    res.status(500).json({ error: `데이터 삭제 실패(${t})`, detail: del.body }); return;
                }
            }

            // 3) 로그인 계정(auth.users) 삭제
            for (const aid of authIds) {
                await sbAdmin(`/auth/v1/admin/users/${aid}`, { method: 'DELETE' });
            }

            // 4) 회사 행 삭제
            const delC = await sbAdmin(`/rest/v1/companies?id=eq.${cid}`, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
            if (!delC.ok) { res.status(500).json({ error: '회사 삭제 실패', detail: delC.body }); return; }

            res.status(200).json({ ok: true, deletedCompanyId: cid, deletedAccounts: authIds.length });
            return;
        }

        res.status(405).json({ error: 'GET 또는 POST만 허용됩니다.' });
    } catch (e) {
        console.error('admin-companies-manage error', e);
        res.status(500).json({ error: '서버 오류: ' + (e && e.message || e) });
    }
};
