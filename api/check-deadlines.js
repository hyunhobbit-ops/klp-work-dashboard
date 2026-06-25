// 매일 1회(크론) 실행 → 오늘/내일 납기 프로젝트를 찾아 전 직원에게 요약 알림.
const { sendToAll } = require('./_push');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

function kstDateStr(offsetDays) {
  const kst = new Date(Date.now() + 9 * 3600 * 1000 + (offsetDays || 0) * 24 * 3600 * 1000);
  return kst.getUTCFullYear() + '-' +
    String(kst.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(kst.getUTCDate()).padStart(2, '0');
}

module.exports = async (req, res) => {
  // 크론 보호: CRON_SECRET이 설정돼 있으면 일치해야 실행 (Vercel 크론이 자동 첨부)
  if (CRON_SECRET) {
    const auth = req.headers.authorization || '';
    if (auth !== 'Bearer ' + CRON_SECRET) { res.status(401).json({ error: 'unauthorized' }); return; }
  }
  if (!SERVICE_KEY) { res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY 미설정' }); return; }

  const today = kstDateStr(0);
  const tomorrow = kstDateStr(1);

  try {
    const q = `projects_domestic?select=product_name,client,delivery_date,status&delivery_date=in.(${today},${tomorrow})&status=neq.${encodeURIComponent('완료')}`;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!r.ok) { res.status(500).json({ error: '프로젝트 조회 실패: ' + r.status }); return; }
    const rows = await r.json();

    const todayRows = (rows || []).filter(x => x.delivery_date === today);
    const tomRows = (rows || []).filter(x => x.delivery_date === tomorrow);
    if (todayRows.length === 0 && tomRows.length === 0) {
      res.status(200).json({ ok: true, message: '납기 임박 없음' }); return;
    }

    const name = (x) => (x.client ? x.client + ' ' : '') + (x.product_name || '');
    const parts = [];
    if (todayRows.length) parts.push(`오늘 마감 ${todayRows.length}건: ` + todayRows.map(name).join(', '));
    if (tomRows.length) parts.push(`내일 마감 ${tomRows.length}건: ` + tomRows.map(name).join(', '));
    let body = parts.join(' / ');
    if (body.length > 180) body = body.slice(0, 177) + '...';

    const result = await sendToAll({ title: '📦 납기 임박 알림', body, url: '/#projects-domestic' });
    res.status(200).json({ ok: true, today: todayRows.length, tomorrow: tomRows.length, ...result });
  } catch (err) {
    res.status(500).json({ error: '납기 체크 실패', detail: (err && err.message) || '' });
  }
};
