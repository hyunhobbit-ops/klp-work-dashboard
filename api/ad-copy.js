// api/ad-copy.js — 광고 카피 생성 (Claude, 도구로 JSON 강제). 로그인 직원만 호출.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 허용됩니다.' }); return; }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'AI 키가 설정되지 않았습니다. 관리자에게 문의하세요.' }); return; }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
  try {
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!ures.ok) { res.status(401).json({ error: '세션이 만료되었습니다.' }); return; }
  } catch (e) { res.status(401).json({ error: '인증 확인 실패' }); return; }

  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const p = (body && body.product) || {};
  const s = (body && body.settings) || {};

  const tool = {
    name: 'ad_copy',
    description: '광고 카피 3안을 생성',
    input_schema: {
      type: 'object',
      properties: {
        variants: {
          type: 'array',
          description: '서로 다른 톤/각도의 카피 3개',
          items: {
            type: 'object',
            properties: {
              headline: { type: 'string', description: '10자 내외의 강력한 헤드라인' },
              sub: { type: 'string', description: '헤드라인 보조 문구(짧게)' },
              body: { type: 'string', description: '2~3문장 본문(제품 강점)' },
              cta: { type: 'string', description: '행동 유도 문구(예: 지금 주문하기)' },
              hashtags: { type: 'string', description: '해시태그 5개 내외, 공백 구분' },
              emailSubject: { type: 'string', description: '이메일 제목' },
              emailBody: { type: 'string', description: '이메일 본문(3~5문장, 존댓말)' }
            },
            required: ['headline', 'sub', 'body', 'cta', 'hashtags', 'emailSubject', 'emailBody']
          }
        }
      },
      required: ['variants']
    }
  };

  const prompt = '아래 제품으로 한국어 광고 카피 3안을 만들어줘. 서로 톤/각도를 다르게. 과장/허위광고 표현은 피하고 자연스럽게.\n' +
    '제품명: ' + (p.name || '') + '\n가격: ' + (p.price || '미정') + '\n핵심포인트: ' + (p.points || '') + '\n' +
    '광고목적: ' + (s.goal || '') + '\n톤: ' + (s.tone || '') + '\n타깃: ' + (s.target || '') + '\n강조문구: ' + (s.emphasis || '') + '\n' +
    '반드시 ad_copy 도구로 3안을 채워줘.';

  try {
    const ares = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 4000,
        tools: [tool], tool_choice: { type: 'tool', name: 'ad_copy' },
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const j = await ares.json().catch(() => ({}));
    if (!ares.ok) {
      const code = ares.status;
      let msg = '카피 생성 실패';
      if (code === 401) msg = 'AI 키가 올바르지 않습니다.';
      else if (code === 429) msg = '요청이 많습니다. 잠시 후 다시 시도해주세요.';
      res.status(code >= 400 && code < 500 ? code : 502).json({ error: msg, detail: (j && j.error && j.error.message) || '' });
      return;
    }
    const block = (j.content || []).find(b => b.type === 'tool_use');
    const out = (block && block.input) || {};
    res.status(200).json({ variants: Array.isArray(out.variants) ? out.variants : [] });
  } catch (err) {
    res.status(502).json({ error: '카피 생성 서버 오류', detail: (err && err.message) || '' });
  }
};
