// 하루 정해진 시각(09·12·15·18·21시 KST)에 담당자별 "오늘 업무 요약" 알림.
// Supabase pg_cron이 Authorization: Bearer <SERVICE_KEY> 헤더로 호출 → 검증 후 발송.
// 미완료가 있는 사람에게만 보낸다.
const { sendToAll } = require('./_push');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GROUPS = ['전체', '임원', '대표님'];

function kstToday() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.getUTCFullYear() + '-' +
    String(kst.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(kst.getUTCDate()).padStart(2, '0');
}

async function sbGet(q) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) throw new Error('조회 실패: ' + r.status);
  return r.json();
}

module.exports = async (req, res) => {
  if (!SERVICE_KEY) { res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY 미설정' }); return; }

  const today = kstToday();
  try {
    // 인증: DB(app_config.summary_secret)에 저장된 비밀값과 헤더 비교 (pg_cron이 전달)
    const provided = String(req.headers['x-summary-secret'] || '');
    const cfg = await sbGet(`app_config?select=value&key=eq.summary_secret`);
    const expected = cfg && cfg[0] && cfg[0].value ? String(cfg[0].value) : '';
    const a = Buffer.from(provided), b = Buffer.from(expected);
    if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: 'unauthorized' }); return;
    }

    const todayRows = await sbGet(`daily_tasks?select=assignee,done&date=eq.${today}`);
    const carriedRows = await sbGet(`daily_tasks?select=assignee&date=lt.${today}&done=is.false&is_deadline_copy=is.false`);

    // 담당자별 집계 (개인만, 그룹 제외)
    const stat = {}; // name -> { total, done, carried }
    const ensure = (n) => { if (!stat[n]) stat[n] = { total: 0, done: 0, carried: 0 }; return stat[n]; };
    (todayRows || []).forEach(t => {
      const n = t.assignee;
      if (!n || GROUPS.includes(n)) return;
      const s = ensure(n); s.total++; if (t.done) s.done++;
    });
    (carriedRows || []).forEach(t => {
      const n = t.assignee;
      if (!n || GROUPS.includes(n)) return;
      ensure(n).carried++;
    });

    let sentPeople = [];
    for (const [person, s] of Object.entries(stat)) {
      const undone = s.total - s.done;
      if (undone <= 0 && s.carried <= 0) continue; // 미완료 없는 사람은 건너뜀
      let body = `오늘 할 일 ${s.total}건 중\n${s.done}건 완료 · ${undone}건 미완`;
      if (s.carried > 0) body += `\n이월 미완료 ${s.carried}건`;
      await sendToAll({ title: `📋 ${person}님 오늘 업무 요약`, body, url: '/#daily' }, [person]);
      sentPeople.push(person);
    }
    res.status(200).json({ ok: true, date: today, sentPeople });
  } catch (err) {
    res.status(500).json({ error: '요약 발송 실패', detail: (err && err.message) || '' });
  }
};
