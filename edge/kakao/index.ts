// 카카오톡 "나에게 보내기" 알림 — 맥미니 Supabase 엣지 함수 (https://api.klpkorea.cloud/functions/v1/kakao)
// 원본은 klp-work-dashboard/edge/kakao/index.ts → 맥미니 supabase/volumes/functions/kakao/ 로 복사해 반영 (재시작 불필요)
// Vercel 함수 12개 제한 + 카카오 키를 맥미니 밖으로 안 내보내려고 여기 둠
// 키는 app_config(서비스 키로만 읽힘): kakao_rest_key · kakao_client_secret · kakao_state_secret · kakao_send_secret
// 토큰은 kakao_links (브라우저에서 못 읽음, migration 075)
//
// POST { action } — 로그인 직원(Authorization: Bearer <세션 토큰>)
//   start      → { url }  카카오 로그인 주소 (state = 프로필 id 서명)
//   connect    { code, state } → 토큰 받아 저장 + 연결 확인 메시지 발송
//   status     → { connected, talk_ok, nickname, last_sent_at, last_error }
//   test       → 나챗방으로 시험 메시지
//   disconnect → 카카오 연결 끊기 + 저장된 토큰 삭제
// POST { action:'notify', items:[{name, text, url?}] } — 예약 발송용, 헤더 x-kakao-secret 필요
// POST { action:'digest', slot:'am'|'noon'|'pm', only?, dry?, force? } — 정기 알림 (pg_cron, 헤더 x-kakao-secret)

const SB_URL = Deno.env.get('SUPABASE_URL') || 'http://api-gw:8000'
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SITE = 'https://klp-work-dashboard.vercel.app'
const REDIRECT_URI = SITE + '/kakao-callback.html'
const ALLOWED_ORIGINS = [SITE, 'http://localhost:3000', 'http://127.0.0.1:3000']
const DISPLAY_NAME_MAP: Record<string, string> = { '김관택': '대표님' }   // app.js 와 같게

function cors(req: Request) {
  const o = req.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(o) ? o : SITE,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-kakao-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  if (!r.ok) throw new Error(`DB ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const t = await r.text()
  return t ? JSON.parse(t) : null
}

async function cfg(): Promise<Record<string, string>> {
  const rows = await sb(`app_config?select=key,value&key=like.kakao_*`)
  return Object.fromEntries((rows || []).map((r: { key: string; value: string }) => [r.key, r.value]))
}

// ----- 서명 (state) -----
const enc = new TextEncoder()
async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

// ----- 로그인 직원 확인 -----
async function me(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  const u = await r.json()
  const rows = await sb(`profiles?select=id,name,company_id&auth_user_id=eq.${encodeURIComponent(u.id)}`)
  const p = rows && rows[0]
  if (!p) return null
  return { id: p.id as number, name: DISPLAY_NAME_MAP[p.name] || p.name as string, companyId: p.company_id as number }
}

// ----- 카카오 API -----
async function kauth(params: Record<string, string>) {
  const r = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams(params),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`카카오 토큰 ${r.status}: ${j.error_description || j.error || ''}`)
  return j
}
async function kapi(path: string, token: string, form?: Record<string, string>) {
  const r = await fetch('https://kapi.kakao.com' + path, {
    method: form ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' } : {}) },
    body: form ? new URLSearchParams(form) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, j }
}

type Link = {
  profile_id: number; user_name: string; access_token: string; refresh_token: string
  access_expires_at: string | null; refresh_expires_at: string | null; talk_ok: boolean
}
const iso = (sec: number) => new Date(Date.now() + sec * 1000).toISOString()

// 액세스 토큰이 1분 안에 끝나면 새로 받음. 리프레시도 끝났으면 null (다시 연결 필요)
async function freshToken(l: Link): Promise<string | null> {
  if (l.access_expires_at && new Date(l.access_expires_at).getTime() - 60_000 > Date.now()) return l.access_token
  const c = await cfg()
  try {
    const t = await kauth({ grant_type: 'refresh_token', client_id: c.kakao_rest_key, client_secret: c.kakao_client_secret || '', refresh_token: l.refresh_token })
    const patch: Record<string, unknown> = { access_token: t.access_token, access_expires_at: iso(t.expires_in) }
    if (t.refresh_token) { patch.refresh_token = t.refresh_token; patch.refresh_expires_at = iso(t.refresh_token_expires_in) }
    await sb(`kakao_links?profile_id=eq.${l.profile_id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    return t.access_token
  } catch (e) {
    await sb(`kakao_links?profile_id=eq.${l.profile_id}`, { method: 'PATCH', body: JSON.stringify({ last_error: '카카오 연결이 만료됐어요 — 다시 연결해 주세요' }) })
    console.error('refresh 실패', l.user_name, (e as Error).message)
    return null
  }
}

// 나챗방으로 글 보내기 (text 200자 제한 — 넘으면 자름)
async function sendMemo(l: Link, text: string, url?: string) {
  const token = await freshToken(l)
  if (!token) return { ok: false, error: '카카오 연결이 만료됐어요 — 다시 연결해 주세요' }
  const link = url && url.startsWith(SITE) ? url : SITE + '/'
  const body = text.length > 200 ? text.slice(0, 198) + '…' : text
  const tpl = { object_type: 'text', text: body, link: { web_url: link, mobile_web_url: link }, button_title: '대시보드 열기' }
  const r = await kapi('/v2/api/talk/memo/default/send', token, { template_object: JSON.stringify(tpl) })
  if (r.ok && r.j.result_code === 0) {
    await sb(`kakao_links?profile_id=eq.${l.profile_id}`, { method: 'PATCH', body: JSON.stringify({ last_sent_at: new Date().toISOString(), last_error: '', talk_ok: true }) })
    return { ok: true }
  }
  // -402 = 메시지 전송 동의 안 함 (선택 동의에서 체크를 뺀 경우)
  const noScope = r.j.code === -402
  const err = noScope ? '카카오톡 메시지 전송에 동의하지 않았어요 — 다시 연결하면서 체크해 주세요' : `카카오 발송 실패 (${r.j.code ?? r.status}) ${r.j.msg || ''}`.trim()
  await sb(`kakao_links?profile_id=eq.${l.profile_id}`, { method: 'PATCH', body: JSON.stringify({ last_error: err, ...(noScope ? { talk_ok: false } : {}) }) })
  return { ok: false, error: err }
}

// ===== 정기 알림 (평일 08:30 아침 2통 · 13:00 · 17:00) — 내용은 DB 함수 kakao_digest (migration 076) =====
const PAY_NAMES = ['이현주', '김현호', '대표님']   // 💰 입금·계산서 칸을 받는 사람
const LIMIT = 200                                   // 카카오 text 템플릿 글자 제한

type Sec = { head: string; n: number; items: string[] }
const cut = (t: string, n: number) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
// 항목 = 본문 + '\u0000' + 꼬리표(예: ' (3일째)') — 줄일 때 꼬리표는 남기고 본문만 자름
const SUF = '\u0000'
const cutItem = (t: string, n: number) => { const [a, b = ''] = String(t).split(SUF); return cut(a, Math.max(6, n - b.length)) + b }
const cutMsg = (t: string) => t.length > LIMIT ? t.slice(0, LIMIT - 1) + '…' : t
const shortClient = (c: string) => cut(String(c || '').replace(/\(사\)|\(주\)|㈜|주식회사|\(재\)/g, '').trim(), 12)
// 일일계획표 글 — 괄호 속 주소·연락처 같은 긴 설명은 뺌
const taskText = (t: string) => String(t || '').replace(/\s*\([^)]{12,}\)/g, '').trim()
function daysLate(due: string | null, today: string) {
  if (!due) return ''
  const n = Math.round((Date.parse(today) - Date.parse(due)) / 86400000)
  return n > 0 ? `${SUF} (${n}일 지남)` : n === 0 ? `${SUF} (오늘)` : ''
}
// 머리 + 칸들을 200자 안에 — 항목 수·글자 길이를 줄여 가며 맞춤, 그래도 넘치면 숫자만
function fit(head: string, secs: Sec[], tail = ''): string {
  const live = secs.filter(x => x.n > 0)
  for (const [maxItems, w] of [[3, 26], [2, 24], [2, 20], [1, 22], [1, 16], [0, 0]]) {
    const parts = [head]
    for (const x of live) {
      const shown = x.items.slice(0, maxItems).map(i => '· ' + cutItem(i, w))
      const more = x.n - shown.length
      if (shown.length && more > 0) shown[shown.length - 1] += ` 외 ${more}건`
      parts.push([x.head.replace('{n}', String(x.n)), ...shown].join('\n'))
    }
    if (tail) parts.push(tail)
    const out = parts.join('\n\n')
    if (out.length <= LIMIT) return out
  }
  return cutMsg([head, ...live.map(x => x.head.replace('{n}', String(x.n)))].join('\n'))
}

type Digest = {
  today: { task: string; done: boolean }[]; overdue: { task: string; date: string }[]; tomorrow: { task: string }[]
  domestic: { task: string; client: string; due: string | null }[]; calls: { text: string; client: string | null }[]
  sourcing: { text: string; title: string }[]; due_soon: { client: string; product: string; date: string }[]
  pay: { client: string; product: string; unpaid: boolean; noinv: boolean }[]
}

function buildDigest(slot: string, name: string, g: Digest, today: string): string[] {
  const left = g.today.filter(t => !t.done)
  // 매일 반복돼 쌓인 같은 할 일은 한 줄로 (n일째)
  const od = new Map<string, number>()
  for (const t of g.overdue) { const k = taskText(t.task); od.set(k, (od.get(k) || 0) + 1) }
  const overdue = [...od.entries()].map(([k, n]) => n > 1 ? `${k}${SUF} (${n}일째)` : k)
  const dom = g.domestic.map(t => `[${shortClient(t.client)}] ${taskText(t.task)}${daysLate(t.due, today)}`)
  const domLate = g.domestic.filter(t => t.due && t.due <= today)
  const calls = g.calls.map(t => (t.client ? `[${shortClient(t.client)}] ` : '') + t.text)
  const src = g.sourcing.map(t => `[${cut(t.title, 10)}] ${t.text}`)
  const pay = g.pay.map(p => `[${shortClient(p.client)}]${SUF} ${p.unpaid && p.noinv ? '잔금·계산서' : p.unpaid ? '잔금 미입금' : '계산서 미발행'}`)
  const dueSoon = g.due_soon.map(p => `[${shortClient(p.client)}] ${p.product || ''}${SUF} — ${p.date === today ? '오늘' : '내일'}`)
  const wd = '일월화수목금토'[new Date(Date.parse(today)).getUTCDay()]   // today = KST 'YYYY-MM-DD' → UTC 자정으로 읽어도 요일 같음
  const md = `${Number(today.slice(5, 7))}/${Number(today.slice(8, 10))}`
  const counts = [
    dom.length && `🏢 국내 ${dom.length}`, calls.length && `📞 통화 ${calls.length}`,
    src.length && `🌏 소싱 ${src.length}`, pay.length && `💰 입금·계산서 ${pay.length}`,
  ].filter(Boolean).join(' · ')

  if (slot === 'am') {
    const m1 = fit(`☀️ ${name}님, 좋은 아침이에요 (${md} ${wd})`, [
      { head: '📋 오늘 할 일 {n}건', n: left.length, items: left.map(t => taskText(t.task)) },
      { head: '⏰ 밀린 할 일 {n}건', n: overdue.length, items: overdue },
      { head: '📦 오늘·내일 납기 {n}건', n: dueSoon.length, items: dueSoon },
    ])
    const m2secs: Sec[] = [
      { head: '🏢 국내 할 일 {n}건', n: dom.length, items: dom },
      { head: '📞 통화에서 나온 할 일 {n}건', n: calls.length, items: calls },
      { head: '🌏 소싱 답할 질문 {n}건', n: src.length, items: src },
      { head: '💰 입금·계산서 {n}건', n: pay.length, items: pay },
    ]
    const empty1 = !left.length && !overdue.length && !dueSoon.length
    const out: string[] = []
    if (!empty1) out.push(m1)
    if (m2secs.some(x => x.n)) out.push(fit(`💼 오늘 챙길 것 (${md})`, m2secs))
    if (!out.length) out.push(`☀️ ${name}님, 좋은 아침이에요 (${md} ${wd})\n\n오늘은 등록된 할 일이 없어요.`)
    return out
  }

  if (slot === 'noon') {
    if (!g.today.length && !overdue.length && !counts) return []
    const urgent = left[0] ? taskText(left[0].task) : domLate[0] ? `[${shortClient(domLate[0].client)}] ${taskText(domLate[0].task)}${daysLate(domLate[0].due, today)}` : overdue[0] || ''
    const lines = [`🕐 ${name}님 오후 점검`]
    if (g.today.length) lines.push(`✅ 오늘 할 일 ${g.today.length}건 중 ${g.today.length - left.length}건 완료`)
    const rest = [overdue.length && `⏰ 밀린 ${overdue.length}`, counts].filter(Boolean).join(' · ')
    if (rest) lines.push(rest + ' 남음')
    if (urgent) lines.push(`\n지금 할 것\n· ${cutItem(urgent, 40)}`)
    return [cutMsg(lines.join('\n'))]
  }

  // pm
  if (!g.today.length && !g.tomorrow.length && !counts) return []
  const head = [`🌇 ${name}님 퇴근 전 확인`]
  if (g.today.length) head.push(left.length ? `✅ 오늘 ${g.today.length}건 중 ${g.today.length - left.length}건 완료 · ${left.length}건 남음` : `✅ 오늘 할 일 모두 완료 — 수고하셨어요!`)
  if (counts) head.push(`아직 남은 것: ${counts}`)
  return [fit(head.join('\n'), [
    { head: '⏳ 오늘 남은 일', n: left.length, items: left.map(t => taskText(t.task)) },
    { head: '📅 내일 할 일 {n}건', n: g.tomorrow.length, items: g.tomorrow.map(t => taskText(t.task)) },
  ])]
}

async function getLink(pid: number): Promise<Link | null> {
  const rows = await sb(`kakao_links?select=*&profile_id=eq.${pid}`)
  return rows && rows[0] || null
}

Deno.serve(async (req) => {
  const h = cors(req)
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...h, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h })
  if (req.method !== 'POST') return json({ error: 'POST만 돼요' }, 405)

  let body: Record<string, any> = {}
  try { body = await req.json() } catch (_) { /* 빈 몸 */ }
  const action = String(body.action || '')

  try {
    const c = await cfg()
    if (!c.kakao_rest_key) return json({ error: '카카오 키가 아직 설정되지 않았어요 (관리자)' }, 503)

    // ----- 정기 알림: { action:'digest', slot:'am'|'noon'|'pm', only?:이름, dry?:true, force?:true } -----
    if (action === 'digest') {
      const given = req.headers.get('x-kakao-secret') || ''
      if (!c.kakao_send_secret || !safeEq(given, c.kakao_send_secret)) return json({ error: 'unauthorized' }, 401)
      const slot = ['am', 'noon', 'pm'].includes(body.slot) ? body.slot : 'am'
      const kst = new Date(Date.now() + 9 * 3600_000)
      const today = kst.toISOString().slice(0, 10)
      const dow = kst.getUTCDay()
      if ((dow === 0 || dow === 6) && !body.force) return json({ ok: true, skipped: '주말' })
      let links: (Link & { company_id: number })[] = await sb(`kakao_links?select=*&talk_ok=is.true`) || []
      if (body.only) links = links.filter(l => l.user_name === body.only)
      const out: Record<string, unknown>[] = []
      for (const l of links) {
        try {
          const g: Digest = await sb('rpc/kakao_digest', { method: 'POST', body: JSON.stringify({ p_company: l.company_id, p_name: l.user_name, p_pay: PAY_NAMES.includes(l.user_name) }) })
          const msgs = buildDigest(slot, l.user_name, g, today)
          if (body.dry) { out.push({ name: l.user_name, msgs }); continue }
          const res = []
          for (const m of msgs) res.push(await sendMemo(l, m))
          out.push({ name: l.user_name, sent: msgs.length, results: res })
        } catch (e) { out.push({ name: l.user_name, error: (e as Error).message }) }
      }
      return json({ ok: true, slot, today, results: out })
    }

    // ----- 예약 발송 (pg_cron 등 서버에서) -----
    if (action === 'notify') {
      const given = req.headers.get('x-kakao-secret') || ''
      if (!c.kakao_send_secret || !safeEq(given, c.kakao_send_secret)) return json({ error: 'unauthorized' }, 401)
      const items: { name: string; text: string; url?: string }[] = Array.isArray(body.items) ? body.items : []
      const links: Link[] = await sb(`kakao_links?select=*&talk_ok=is.true`) || []
      const out: Record<string, unknown>[] = []
      for (const it of items) {
        const l = links.find(x => x.user_name === it.name)
        if (!l) { out.push({ name: it.name, ok: false, error: '카카오 미연결' }); continue }
        out.push({ name: it.name, ...(await sendMemo(l, String(it.text || ''), it.url)) })
      }
      return json({ ok: true, results: out })
    }

    // ----- 로그인 직원 -----
    const u = await me(req)
    if (!u) return json({ error: '로그인이 필요해요' }, 401)

    if (action === 'start') {
      const payload = `${u.id}.${Date.now()}`
      const state = `${payload}.${await hmac(c.kakao_state_secret, payload)}`
      const q = new URLSearchParams({ client_id: c.kakao_rest_key, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'talk_message,profile_nickname', state })
      return json({ url: 'https://kauth.kakao.com/oauth/authorize?' + q })
    }

    if (action === 'connect') {
      const [pid, ts, sig] = String(body.state || '').split('.')
      const okSig = sig && safeEq(sig, await hmac(c.kakao_state_secret, `${pid}.${ts}`))
      if (!okSig || Number(pid) !== u.id) return json({ error: '연결 요청이 맞지 않아요 — 대시보드에서 다시 눌러 주세요' }, 400)
      if (Date.now() - Number(ts) > 15 * 60_000) return json({ error: '시간이 지났어요 — 다시 연결해 주세요' }, 400)
      const t = await kauth({ grant_type: 'authorization_code', client_id: c.kakao_rest_key, client_secret: c.kakao_client_secret || '', redirect_uri: REDIRECT_URI, code: String(body.code || '') })
      const prof = await kapi('/v2/user/me', t.access_token)
      const scopes = await kapi('/v2/user/scopes', t.access_token)
      const talkOk = !!(scopes.j.scopes || []).find((s: { id: string; agreed: boolean }) => s.id === 'talk_message' && s.agreed)
      const nick = prof.j.kakao_account?.profile?.nickname || prof.j.properties?.nickname || ''
      const row = {
        profile_id: u.id, user_name: u.name, company_id: u.companyId, kakao_id: prof.j.id || null, kakao_nickname: nick,
        access_token: t.access_token, refresh_token: t.refresh_token, access_expires_at: iso(t.expires_in),
        refresh_expires_at: iso(t.refresh_token_expires_in), talk_ok: talkOk,
        last_error: talkOk ? '' : '카카오톡 메시지 전송에 동의하지 않았어요 — 다시 연결하면서 체크해 주세요',
      }
      await sb('kakao_links?on_conflict=profile_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(row) })
      let sent = null
      if (talkOk) sent = await sendMemo(row as unknown as Link, `✅ KLP 업무 대시보드와 카카오톡이 연결됐어요.\n${u.name}님의 할 일 알림이 여기(나와의 채팅)로 와요.`)
      return json({ ok: true, talk_ok: talkOk, nickname: nick, sent })
    }

    if (action === 'status') {
      const l = await getLink(u.id) as (Link & { kakao_nickname: string; last_sent_at: string; last_error: string }) | null
      if (!l) return json({ connected: false })
      return json({ connected: true, talk_ok: l.talk_ok, nickname: l.kakao_nickname, last_sent_at: l.last_sent_at, last_error: l.last_error })
    }

    if (action === 'test') {
      const l = await getLink(u.id)
      if (!l) return json({ error: '카카오톡이 연결돼 있지 않아요' }, 400)
      const now = new Date(Date.now() + 9 * 3600_000).toISOString().slice(11, 16)
      return json(await sendMemo(l, `🔔 시험 알림 (${now})\nKLP 업무 대시보드 카카오톡 알림이 잘 와요.`))
    }

    if (action === 'disconnect') {
      const l = await getLink(u.id)
      if (l) {
        const token = await freshToken(l)
        if (token) await kapi('/v1/user/unlink', token, {})
        await sb(`kakao_links?profile_id=eq.${u.id}`, { method: 'DELETE' })
      }
      return json({ ok: true })
    }

    return json({ error: '알 수 없는 요청' }, 400)
  } catch (e) {
    console.error('kakao 함수 오류', (e as Error).message)
    return json({ error: (e as Error).message || '서버 오류' }, 500)
  }
})
