// 사업자등록증(사진·PDF·복사한 글) → 거래처 정보 추출
// (CommonJS, 의존성 0. '_'로 시작해 별도 함수로 안 잡힘 — /api/meeting-summarize?kind=bizreg 로 호출)
// 흐름: 로그인 토큰 검증 → Anthropic 호출(사진은 image, PDF는 document 블록, 도구로 JSON 강제) → 필드 반환
// 환경변수: ANTHROPIC_API_KEY (필수), ANTHROPIC_INQUIRY_MODEL / ANTHROPIC_MODEL (선택)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';
const PRIMARY_MODEL = process.env.ANTHROPIC_INQUIRY_MODEL || 'claude-opus-5';
const FALLBACK_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const FIELDS = ['company_name', 'ceo', 'business_no', 'corp_no', 'address', 'biz_type', 'biz_item', 'open_date', 'phone', 'email', 'is_certificate'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const tool = {
    name: 'record_business_registration',
    description: '사업자등록증에서 읽은 거래처 정보',
    input_schema: {
        type: 'object',
        properties: {
            company_name: { type: 'string', description: '상호(법인명). 적힌 그대로 (예: 삼인물산주식회사, (주)한빛테크). 모르면 빈 문자열' },
            ceo: { type: 'string', description: '대표자 성명. 여러 명이면 쉼표로. 모르면 빈 문자열' },
            business_no: { type: 'string', description: '사업자등록번호 000-00-00000 형식. 모르면 빈 문자열' },
            corp_no: { type: 'string', description: '법인등록번호 000000-0000000 형식 (개인사업자는 빈 문자열)' },
            address: { type: 'string', description: '사업장 소재지 전체 주소 (본점 소재지가 따로 있어도 사업장 소재지 우선)' },
            biz_type: { type: 'string', description: '업태. 여러 개면 쉼표로 (예: 도매 및 소매업, 제조업)' },
            biz_item: { type: 'string', description: '종목. 여러 개면 쉼표로 (예: 시계, 판촉물)' },
            open_date: { type: 'string', description: '개업연월일 YYYY-MM-DD. 모르면 빈 문자열' },
            phone: { type: 'string', description: '문서에 전화번호가 있으면 (보통 없음). 모르면 빈 문자열' },
            email: { type: 'string', description: '문서에 이메일이 있으면 (보통 없음). 모르면 빈 문자열' },
            is_certificate: { type: 'boolean', description: '입력이 사업자등록증(또는 사업자 정보)으로 보이면 true' }
        },
        required: FIELDS
    }
};

async function callAnthropic(apiKey, model, content) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
            model,
            max_tokens: 1024,
            tools: [tool],
            tool_choice: { type: 'tool', name: 'record_business_registration' },
            messages: [{ role: 'user', content }]
        })
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 허용됩니다.' }); return; }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.status(503).json({ error: 'AI 키가 아직 설정되지 않았습니다.' }); return; }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }
    try {
        const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
        if (!ures.ok) { res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' }); return; }
    } catch (e) { res.status(401).json({ error: '인증 확인에 실패했습니다.' }); return; }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    const text = (body && body.text ? String(body.text) : '').trim().slice(0, 8000);
    const file = body && body.file && typeof body.file === 'object' ? body.file : null;
    const mediaType = file ? String(file.mediaType || '') : '';
    const data = file ? String(file.data || '').replace(/^data:[^,]*,/, '') : '';
    if (!text && !data) { res.status(400).json({ error: '사업자등록증 사진·PDF 또는 글을 넣어주세요.' }); return; }
    if (data && !(IMAGE_TYPES.includes(mediaType) || mediaType === 'application/pdf')) { res.status(400).json({ error: '사진(JPG·PNG) 또는 PDF만 읽을 수 있습니다.' }); return; }
    if (data.length > 14 * 1024 * 1024) { res.status(413).json({ error: '파일이 너무 큽니다 (10MB 이하).' }); return; }

    const content = [];
    if (data && mediaType === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: mediaType, data } });
    else if (data) content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
    content.push({ type: 'text', text: `위 ${data ? '문서' : '글'}는 한국 사업자등록증${data ? '' : '에서 복사한 내용'}입니다.
record_business_registration 도구로 거래처 정보를 넘겨주세요.
- 적힌 내용만 쓰고, 안 보이거나 없는 값은 빈 문자열로 둡니다. 추측하지 마세요.
- 글자 사이 띄어쓰기(예: '상 호', '성 명')는 무시하고 읽습니다.
- 사업자등록번호는 000-00-00000, 법인등록번호는 000000-0000000 형식으로.
${text ? `\n--- 붙여넣은 글 ---\n${text}\n--- 끝 ---` : ''}` });

    try {
        let r = await callAnthropic(apiKey, PRIMARY_MODEL, content);
        const modelErr = !r.ok && (r.status === 404 || (r.status === 400 && /model/i.test((r.j && r.j.error && r.j.error.message) || '')));
        if (modelErr && FALLBACK_MODEL !== PRIMARY_MODEL) r = await callAnthropic(apiKey, FALLBACK_MODEL, content);
        if (!r.ok) {
            const s = r.status;
            let msg = '사업자등록증을 읽지 못했습니다.';
            if (s === 401) msg = 'AI 키가 올바르지 않습니다. 관리자에게 문의하세요.';
            else if (s === 429) msg = '요청이 많습니다. 잠시 후 다시 시도해주세요.';
            else if (s === 413) msg = '파일이 너무 큽니다.';
            res.status(s >= 400 && s < 500 ? s : 502).json({ error: msg, detail: (r.j && r.j.error && r.j.error.message) || '' });
            return;
        }
        const block = (r.j.content || []).find(b => b.type === 'tool_use');
        const input = (block && block.input) || {};
        const out = {};
        FIELDS.forEach(k => { out[k] = k === 'is_certificate' ? !!input[k] : String(input[k] || '').trim().slice(0, 200); });
        res.status(200).json(out);
    } catch (err) {
        res.status(502).json({ error: 'AI 서버 오류', detail: (err && err.message) || '' });
    }
};
