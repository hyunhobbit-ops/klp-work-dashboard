// 고객 문의(메일·카톡·홈페이지) → 거래처·담당자·부서·직함·연락처·이메일·문의 한 줄 요약 추출
// (Vercel 서버리스, CommonJS, 의존성 0 — api/meeting-summarize.js 와 같은 구조)
// 흐름: 클라이언트가 붙여넣은 문의 원문 + Supabase access_token 전송 →
//       1) 토큰 검증(로그인 직원만) → 2) Anthropic 호출(도구로 JSON 강제) → 3) 필드 반환
//
// 환경변수: ANTHROPIC_API_KEY (필수), ANTHROPIC_INQUIRY_MODEL (선택), SUPABASE_URL/ANON_KEY

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';
// 기본은 최신 모델, 계정에서 못 쓰면 회의록 정리와 같은 모델로 한 번 더 시도
const PRIMARY_MODEL = process.env.ANTHROPIC_INQUIRY_MODEL || 'claude-opus-5';
const FALLBACK_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const FIELDS = ['company', 'contact_name', 'contact_dept', 'contact_title', 'contact_phone', 'contact_email', 'inquiry_title'];

const tool = {
    name: 'record_inquiry',
    description: '고객 문의 원문에서 뽑아낸 보낸 사람 정보와 문의 요약',
    input_schema: {
        type: 'object',
        properties: {
            company: { type: 'string', description: '문의를 보낸 고객의 회사·기관명. 약칭이 본문에 그대로 쓰였으면 그대로(예: NHR). 모르면 빈 문자열' },
            contact_name: { type: 'string', description: '보낸 사람 이름만(직함 제외). 예: 김규리. 모르면 빈 문자열' },
            contact_dept: { type: 'string', description: '보낸 사람 부서·팀. 예: HR마케팅2팀. 모르면 빈 문자열' },
            contact_title: { type: 'string', description: '보낸 사람 직함·직급. 예: 선임매니저, 과장. 모르면 빈 문자열' },
            contact_phone: { type: 'string', description: '보낸 사람 연락처. 휴대폰이 있으면 휴대폰 우선, 없으면 대표·사무실 번호. 팩스 번호는 제외. 010-0000-0000 형식. 모르면 빈 문자열' },
            contact_email: { type: 'string', description: '보낸 사람 이메일. 모르면 빈 문자열' },
            inquiry_title: { type: 'string', description: '무엇을 문의했는지 한 줄(30자 안팎, 명사형으로 끝냄). 품목·수량·요청을 담는다. 예: "미니 시계 키링 제작 문의 (최소수량·단가·납기)", "손목시계 300개 각인 견적"' }
        },
        required: FIELDS
    }
};

async function callAnthropic(apiKey, model, prompt) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
            model,
            max_tokens: 1024,
            tools: [tool],
            tool_choice: { type: 'tool', name: 'record_inquiry' },
            messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
        })
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 허용됩니다.' }); return; }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.status(503).json({ error: 'AI 키가 아직 설정되지 않았습니다.' }); return; }

    // 1) 로그인 검증
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
    try {
        const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
        if (!ures.ok) { res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' }); return; }
    } catch (e) { res.status(401).json({ error: '인증 확인에 실패했습니다.' }); return; }

    // 2) 입력
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    const content = (body && body.content ? String(body.content) : '').trim().slice(0, 12000);
    const ourCompany = (body && body.ourCompany ? String(body.ourCompany) : '').slice(0, 60);
    if (content.length < 10) { res.status(400).json({ error: '문의 내용이 너무 짧습니다.' }); return; }

    const prompt = `아래는 고객이 우리 회사로 보낸 문의 원문(메일·카톡·홈페이지 문의 등)입니다.
${ourCompany ? `우리 회사는 "${ourCompany}"입니다. 받는 사람(우리 회사·우리 직원)의 이름·메일·연락처는 절대 고객 정보로 쓰지 마세요.\n` : ''}보낸 사람(고객)의 정보와 문의 요약을 record_inquiry 도구로 넘겨주세요.

규칙
- 원문에 근거한 것만 쓰고, 없는 값은 지어내지 말고 빈 문자열로 둡니다.
- 서명·인사말·자기소개("NHR 김규리 선임입니다", "김규리 드림" 등)를 모두 참고합니다.
- 이름에는 직함을 붙이지 않습니다. 부서와 직함은 나눠서 씁니다.
- 연락처는 팩스(F, Fax) 번호를 쓰지 않습니다. 휴대폰(M, Mobile)이 있으면 휴대폰을 씁니다.
- inquiry_title은 우리가 목록에서 한눈에 알아볼 수 있게 품목과 요청 사항을 짧게. 한국어.

--- 문의 원문 시작 ---
${content}
--- 문의 원문 끝 ---`;

    try {
        let r = await callAnthropic(apiKey, PRIMARY_MODEL, prompt);
        const modelErr = !r.ok && (r.status === 404 || (r.status === 400 && /model/i.test((r.j && r.j.error && r.j.error.message) || '')));
        if (modelErr && FALLBACK_MODEL !== PRIMARY_MODEL) r = await callAnthropic(apiKey, FALLBACK_MODEL, prompt);
        if (!r.ok) {
            const s = r.status;
            let msg = 'AI 자동 입력에 실패했습니다.';
            if (s === 401) msg = 'AI 키가 올바르지 않습니다. 관리자에게 문의하세요.';
            else if (s === 429) msg = '요청이 많습니다. 잠시 후 다시 시도해주세요.';
            res.status(s >= 400 && s < 500 ? s : 502).json({ error: msg, detail: (r.j && r.j.error && r.j.error.message) || '' });
            return;
        }
        const block = (r.j.content || []).find(b => b.type === 'tool_use');
        const input = (block && block.input) || {};
        const out = {};
        FIELDS.forEach(k => { out[k] = String(input[k] || '').trim().slice(0, 120); });
        res.status(200).json(out);
    } catch (err) {
        res.status(502).json({ error: 'AI 서버 오류', detail: (err && err.message) || '' });
    }
};
