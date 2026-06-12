// 택배 이미지 자동입력 — Vercel 서버리스 함수 (CommonJS, 의존성 0: Node 18+ 내장 fetch 사용)
// 흐름: 클라이언트가 이미지(base64) + Supabase access_token 전송 →
//       1) 토큰 검증(로그인 직원만) → 2) Anthropic vision 호출(도구로 JSON 강제) → 3) 추출 필드 반환
//
// 환경변수:
//   ANTHROPIC_API_KEY (필수) — Anthropic API 키. 서버에만 보관(브라우저 노출 없음).
//   ANTHROPIC_MODEL   (선택) — 기본 'claude-haiku-4-5'. 정확도가 부족하면 더 좋은 모델로 교체.
//   SUPABASE_URL / SUPABASE_ANON_KEY (선택) — 미설정 시 아래 기본값(이미 공개된 anon 정보) 사용.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

module.exports = async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 허용됩니다.' }); return; }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        res.status(503).json({ error: 'AI 키가 아직 설정되지 않았습니다. 관리자가 Vercel 환경변수(ANTHROPIC_API_KEY)를 등록해야 합니다.' });
        return;
    }

    // 1) 로그인 직원만 사용 가능 — Supabase access_token 검증 (AI 키 남용 차단)
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
    try {
        const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
        });
        if (!ures.ok) { res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' }); return; }
    } catch (e) {
        res.status(401).json({ error: '인증 확인에 실패했습니다.' }); return;
    }

    // 2) 이미지 파싱 (data URL 또는 순수 base64)
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    const image = body && body.image;
    if (!image || typeof image !== 'string') { res.status(400).json({ error: '이미지가 없습니다.' }); return; }
    let mediaType = 'image/jpeg', data = image;
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/.exec(image);
    if (m) { mediaType = m[1]; data = m[2]; }

    const tool = {
        name: 'fill_delivery',
        description: '택배 송장 입력 폼을 채우기 위해 이미지에서 추출한 수취인 정보',
        input_schema: {
            type: 'object',
            properties: {
                recipient: { type: 'string', description: '받는 사람(수취인) 이름. 없으면 빈 문자열' },
                phone: { type: 'string', description: '받는 사람 휴대폰 번호. 없으면 빈 문자열' },
                zipcode: { type: 'string', description: '우편번호(숫자 5자리). 없으면 빈 문자열' },
                address: { type: 'string', description: '배송 주소 전체. 동/호수까지 포함. 없으면 빈 문자열' },
                product: { type: 'string', description: '상품명/품목. 없으면 빈 문자열' }
            },
            required: ['recipient', 'phone', 'zipcode', 'address', 'product']
        }
    };

    const prompt = '이 이미지는 택배 발송용 주문 정보입니다(번개장터/당근 주문 상세, 카톡·문자 주문 대화, 또는 주문서/송장). ' +
        '받는 사람의 이름·휴대폰번호·우편번호·주소(동/호수 포함)·품목을 이미지에 적힌 그대로 정확히 추출해 fill_delivery 도구로 채워주세요. ' +
        '보내는 사람(판매자)이 아니라 받는 사람 정보를 추출하세요. 보이지 않는 항목은 빈 문자열로. 우편번호는 숫자 5자리만. 추측 금지.';

    try {
        const ares = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: ANTHROPIC_MODEL,
                max_tokens: 1024,
                tools: [tool],
                tool_choice: { type: 'tool', name: 'fill_delivery' },
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
                        { type: 'text', text: prompt }
                    ]
                }]
            })
        });

        const j = await ares.json().catch(() => ({}));
        if (!ares.ok) {
            const s = ares.status;
            let msg = '이미지 분석에 실패했습니다.';
            if (s === 401) msg = 'AI 키가 올바르지 않습니다. 관리자에게 문의하세요.';
            else if (s === 429) msg = '요청이 많습니다. 잠시 후 다시 시도해주세요.';
            else if (s === 413) msg = '이미지가 너무 큽니다. 더 작은 이미지를 사용해주세요.';
            else if (s === 400) msg = '이미지 형식이 올바르지 않습니다.';
            res.status(s >= 400 && s < 500 ? s : 502).json({ error: msg, detail: (j && j.error && j.error.message) || '' });
            return;
        }

        const block = (j.content || []).find(b => b.type === 'tool_use');
        const out = (block && block.input) || {};
        res.status(200).json({
            recipient: out.recipient || '',
            phone: out.phone || '',
            zipcode: out.zipcode || '',
            address: out.address || '',
            product: out.product || ''
        });
    } catch (err) {
        res.status(502).json({ error: '이미지 분석 서버 오류', detail: (err && err.message) || '' });
    }
};
