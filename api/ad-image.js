// api/ad-image.js — 광고 배경 이미지 생성 (OpenAI Images). 로그인 직원만 호출.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 허용됩니다.' }); return; }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'OpenAI 키가 설정되지 않았습니다. 관리자가 Vercel 환경변수(OPENAI_API_KEY)를 등록해야 합니다.' }); return; }

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
  const count = Math.min(2, Math.max(1, Number(body && body.count) || 2));

  // 배경/무드만. 제품 자체·글자는 넣지 말 것(글자는 앱이 합성).
  const prompt = '한국 상업 광고용 정사각 배경 이미지. 제품 카테고리 "' + (p.name || '제품') + '"에 어울리는 감성적이고 깔끔한 배경/무드. ' +
    '톤: ' + (s.tone || '고급스럽고 밝은') + '. 타깃: ' + (s.target || '일반') + '. ' +
    '중요: 어떤 글자/텍스트/로고도 넣지 말 것. 제품 자체를 그리지 말고, 제품을 올려놓기 좋은 여백 있는 배경만. 사실적 스튜디오/라이프스타일 톤.';

  try {
    const oimg = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, n: count, size: '1024x1024' })
    });
    const j = await oimg.json().catch(() => ({}));
    if (!oimg.ok) {
      const code = oimg.status;
      let msg = '이미지 생성 실패';
      if (code === 401) msg = 'OpenAI 키가 올바르지 않습니다.';
      else if (code === 429) msg = '요청이 많거나 크레딧이 부족합니다.';
      else if (code === 400) msg = '요청이 거부되었습니다(콘텐츠 정책 등).';
      res.status(code >= 400 && code < 500 ? code : 502).json({ error: msg, detail: (j && j.error && j.error.message) || '' });
      return;
    }
    // gpt-image-1은 b64_json 반환. data URL로 변환.
    const images = (j.data || []).map(d => d.b64_json ? ('data:image/png;base64,' + d.b64_json) : d.url).filter(Boolean);
    res.status(200).json({ images });
  } catch (err) {
    res.status(502).json({ error: '이미지 생성 서버 오류', detail: (err && err.message) || '' });
  }
};
