// 로그인 직원이 호출 → 전 직원에게 알림 발송 (새 프로젝트/할 일 등 이벤트성)
const { sendToAll } = require('./_push');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://api.klpkorea.cloud';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkxNDcwNTMzLCJleHAiOjE5NDkxNTA1MzN9.kczeUuu_I5RdisWEr_vBeE97vaCH8ZRigFvK6pDOS9c';

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 허용됩니다.' }); return; }

  // 로그인 직원만 발송 가능 (남용 차단)
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
  try {
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!ures.ok) { res.status(401).json({ error: '세션이 만료되었습니다.' }); return; }
  } catch (e) {
    res.status(401).json({ error: '인증 확인 실패' }); return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const title = (body && body.title) || 'KLP 대시보드';
  const text = (body && body.body) || '';
  const url = (body && body.url) || '/';
  const targets = body && Array.isArray(body.targets) ? body.targets : null;
  const taskId = body && body.taskId ? body.taskId : null;

  try {
    const result = await sendToAll({ title, body: text, url, taskId }, targets);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: '알림 발송 실패', detail: (err && err.message) || '' });
  }
};
