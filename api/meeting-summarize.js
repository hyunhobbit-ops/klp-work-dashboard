// 회의 논의 내용 → 결정사항 + 액션아이템 자동 추출 (Vercel 서버리스, CommonJS, 의존성 0)
// 흐름: 클라이언트가 논의 내용(텍스트) + 참석자 목록 + Supabase access_token 전송 →
//       1) 토큰 검증(로그인 직원만) → 2) Anthropic 호출(도구로 JSON 강제) → 3) {decisions, actionItems} 반환
//
// 환경변수: ANTHROPIC_API_KEY (필수), ANTHROPIC_MODEL (선택, 기본 claude-sonnet-4-6), SUPABASE_URL/ANON_KEY

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

module.exports = async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 허용됩니다.' }); return; }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.status(503).json({ error: 'AI 키가 아직 설정되지 않았습니다. 관리자가 Vercel 환경변수(ANTHROPIC_API_KEY)를 등록해야 합니다.' }); return; }

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
    const content = (body && body.content ? String(body.content) : '').trim();
    const attendees = Array.isArray(body && body.attendees) ? body.attendees.filter(x => typeof x === 'string') : [];
    const today = (body && body.today) ? String(body.today) : '';
    if (content.length < 5) { res.status(400).json({ error: '논의 내용이 너무 짧습니다. 먼저 논의 내용을 작성해주세요.' }); return; }

    const tool = {
        name: 'record_meeting_output',
        description: '회의 논의 내용에서 뽑아낸 결정사항과 액션아이템',
        input_schema: {
            type: 'object',
            properties: {
                decisions: {
                    type: 'array',
                    description: '회의에서 확정·합의된 결정사항 목록. 각 항목은 한 문장. 결정된 게 없으면 빈 배열.',
                    items: { type: 'string' }
                },
                actionItems: {
                    type: 'array',
                    description: '앞으로 실행할 일(액션아이템) 목록. 실행할 일이 없으면 빈 배열.',
                    items: {
                        type: 'object',
                        properties: {
                            task: { type: 'string', description: '해야 할 일 내용(한 문장, 명확하게)' },
                            assignee: { type: 'string', description: '담당자. 반드시 아래 참석자 목록 중 하나와 정확히 일치. 논의에서 담당자가 불분명하면 빈 문자열' },
                            dueDate: { type: 'string', description: '마감일. 논의에 명시적 날짜가 있을 때만 YYYY-MM-DD 형식. 없으면 빈 문자열' }
                        },
                        required: ['task', 'assignee', 'dueDate']
                    }
                }
            },
            required: ['decisions', 'actionItems']
        }
    };

    const prompt = `다음은 회의의 "논의 내용"입니다. 이 내용을 읽고 두 가지를 정리해 record_meeting_output 도구로 넘겨주세요.
1) 결정사항(decisions): 회의에서 확정되었거나 합의된 결론만. 단순 논의·의견은 제외.
2) 액션아이템(actionItems): 앞으로 누군가 실행해야 할 구체적인 일. 각 항목의 담당자(assignee)는 반드시 아래 참석자 목록 중 하나와 정확히 같게 쓰고, 논의에서 담당자가 분명하지 않으면 빈 문자열로 두세요.

참석자 목록: ${attendees.length ? attendees.join(', ') : '(명시 안 됨)'}
${today ? '오늘 날짜: ' + today + ' (상대적 날짜 표현이 있으면 이를 기준으로 환산)\n' : ''}
규칙: 내용에 근거해서만 작성하고 추측으로 지어내지 마세요. 마감일은 논의에 날짜가 명시된 경우에만 채우세요. 결정사항/액션아이템이 없으면 빈 배열로 두세요. 한국어로 작성.

--- 논의 내용 시작 ---
${content}
--- 논의 내용 끝 ---`;

    try {
        const ares = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
                model: ANTHROPIC_MODEL,
                max_tokens: 2048,
                tools: [tool],
                tool_choice: { type: 'tool', name: 'record_meeting_output' },
                messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
            })
        });
        const j = await ares.json().catch(() => ({}));
        if (!ares.ok) {
            const s = ares.status;
            let msg = 'AI 정리에 실패했습니다.';
            if (s === 401) msg = 'AI 키가 올바르지 않습니다. 관리자에게 문의하세요.';
            else if (s === 429) msg = '요청이 많습니다. 잠시 후 다시 시도해주세요.';
            else if (s === 400) msg = '요청 형식이 올바르지 않습니다.';
            res.status(s >= 400 && s < 500 ? s : 502).json({ error: msg, detail: (j && j.error && j.error.message) || '' });
            return;
        }
        const block = (j.content || []).find(b => b.type === 'tool_use');
        const out = (block && block.input) || {};
        const decisions = Array.isArray(out.decisions) ? out.decisions.map(s => String(s || '').trim()).filter(Boolean) : [];
        const actionItems = Array.isArray(out.actionItems) ? out.actionItems.map(a => ({
            task: String((a && a.task) || '').trim(),
            assignee: String((a && a.assignee) || '').trim(),
            dueDate: String((a && a.dueDate) || '').trim()
        })).filter(a => a.task) : [];
        res.status(200).json({ decisions, actionItems });
    } catch (err) {
        res.status(502).json({ error: 'AI 정리 서버 오류', detail: (err && err.message) || '' });
    }
};
