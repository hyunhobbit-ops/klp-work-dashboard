// 위젯용: 로그인 직원이 오늘 할 일 id 목록을 보내면, 본인 할 일에 한해 완료 토큰을 발급.
// 위젯은 이 토큰으로 api/complete-task 를 호출해 로그인 없이 완료 처리한다.
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function taskToken(id) {
  return crypto.createHmac('sha256', SERVICE_KEY).update('task:' + String(id)).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 허용됩니다.' }); return; }
  if (!SERVICE_KEY) { res.status(503).json({ error: '서버 설정이 누락되었습니다.' }); return; }

  // 1) 로그인 검증
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!accessToken) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }

  let uid = null;
  try {
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (!ures.ok) { res.status(401).json({ error: '세션이 만료되었습니다.' }); return; }
    const u = await ures.json();
    uid = u && u.id;
  } catch (e) {
    res.status(401).json({ error: '인증 확인 실패' }); return;
  }
  if (!uid) { res.status(401).json({ error: '사용자를 확인할 수 없습니다.' }); return; }

  // 2) auth uid → 직원 이름
  let name = '';
  try {
    const pres = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=name&auth_user_id=eq.${uid}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const arr = await pres.json();
    name = arr && arr[0] && arr[0].name ? arr[0].name : '';
  } catch (e) { /* 무시 */ }
  if (!name) { res.status(403).json({ error: '프로필을 찾을 수 없습니다.' }); return; }

  // 3) 요청한 id 중 본인(assignee=name) 할 일만 토큰 발급
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  let ids = body && Array.isArray(body.ids) ? body.ids : [];
  ids = ids.map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x)).slice(0, 100);
  if (!ids.length) { res.status(200).json({ tokens: {} }); return; }

  try {
    const inList = ids.join(',');
    const tres = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_tasks?select=id&assignee=eq.${encodeURIComponent(name)}&id=in.(${inList})`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const rows = await tres.json();
    const tokens = {};
    (rows || []).forEach((r) => { tokens[r.id] = taskToken(r.id); });
    res.status(200).json({ tokens });
  } catch (err) {
    res.status(500).json({ error: '토큰 발급 실패', detail: (err && err.message) || '' });
  }
};
