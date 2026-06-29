// 공용 웹푸시 발송 모듈 (api/ 안의 _밑줄 파일은 Vercel 라우트로 노출되지 않음)
// 모든 등록 구독에게 알림을 보낸다. 만료된(404/410) 구독은 자동 삭제.
const webpush = require('web-push');
const crypto = require('crypto');

// 알림 "완료" 버튼용 서명 토큰: 특정 할 일 id에 대해서만 완료를 허용 (서비스키로 HMAC, 키 자체는 노출 안 됨)
function taskToken(id) {
  return crypto.createHmac('sha256', SERVICE_KEY).update('task:' + String(id)).digest('hex');
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// VAPID: 공개키는 비공개가 아니므로 코드에 둬도 됨. 비밀키는 환경변수에서만.
const VAPID_PUBLIC = 'BO51LjQZu_swVb0UvfhAv9eTcT9gvbEkaxKlzRjRnVlin8-67Ynhv94urY7knMFb7vA4Q1NFs2J1Yxvs_Z_D6e0';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hyunhobbit@gmail.com';

let _ready = false;
function ensureVapid() {
  if (_ready) return true;
  if (!VAPID_PRIVATE) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  _ready = true;
  return true;
}

async function sbFetch(pathAndQuery, init) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init && init.headers),
    },
  });
  return res;
}

// payload: { title, body, url }
// targets: 받을 사람 이름 배열. 있으면 해당 user_name 구독에게만 발송. 없으면 전체 발송.
async function sendToAll(payload, targets) {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 미설정');
  if (!ensureVapid()) throw new Error('VAPID_PRIVATE_KEY 미설정');

  const res = await sbFetch('push_subscriptions?select=id,endpoint,p256dh,auth,user_name', { method: 'GET' });
  if (!res.ok) throw new Error('구독 목록 조회 실패: ' + res.status);
  let subs = await res.json();
  if (Array.isArray(targets) && targets.length) {
    const set = new Set(targets.map((x) => String(x).trim()));
    subs = (subs || []).filter((s) => set.has(String(s.user_name || '').trim()));
  }

  const payloadObj = {
    title: payload.title || 'KLP 대시보드',
    body: payload.body || '',
    url: payload.url || '/',
  };
  if (payload.taskId) { payloadObj.taskId = payload.taskId; payloadObj.token = taskToken(payload.taskId); }
  const data = JSON.stringify(payloadObj);

  let sent = 0, removed = 0;
  await Promise.all((subs || []).map(async (s) => {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(subscription, data);
      sent++;
    } catch (err) {
      const code = err && err.statusCode;
      if (code === 404 || code === 410) {
        // 만료/해지된 구독 정리
        await sbFetch('push_subscriptions?id=eq.' + s.id, { method: 'DELETE' }).catch(() => {});
        removed++;
      }
    }
  }));
  return { total: (subs || []).length, sent, removed };
}

module.exports = { sendToAll, VAPID_PUBLIC };
