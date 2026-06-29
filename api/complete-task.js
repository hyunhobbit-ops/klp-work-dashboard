// 알림의 "✅ 완료" 버튼 → 로그인 없이 해당 할 일만 완료 처리.
// 보안: 알림 payload에 담긴 서명 토큰(HMAC)을 검증 → 그 id에 대해서만 허용.
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function taskToken(id) {
  return crypto.createHmac('sha256', SERVICE_KEY).update('task:' + String(id)).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 허용됩니다.' }); return; }
  if (!SERVICE_KEY) { res.status(503).json({ error: '서버 설정이 누락되었습니다.' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const id = body && body.id;
  const token = body && body.token;
  if (!id || !token) { res.status(400).json({ error: '잘못된 요청입니다.' }); return; }

  // 토큰 검증 (타이밍 안전 비교)
  const expect = taskToken(id);
  const a = Buffer.from(String(token));
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: '인증에 실패했습니다.' }); return;
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/daily_tasks?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ done: true, completed_at: new Date().toISOString() }),
    });
    if (!r.ok) { res.status(500).json({ error: '완료 처리 실패: ' + r.status }); return; }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '완료 처리 중 오류', detail: (err && err.message) || '' });
  }
};
