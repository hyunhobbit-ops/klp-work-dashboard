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

// ===== FCM (Android 네이티브 푸시) HTTP v1 =====
// 서비스계정 키는 Vercel 환경변수 FIREBASE_SERVICE_ACCOUNT 에 JSON 문자열로 보관.
let _fcmSa = null;
function fcmServiceAccount() {
  if (_fcmSa !== null) return _fcmSa || null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  if (!raw) { _fcmSa = false; return null; }
  try { _fcmSa = JSON.parse(raw); } catch (_) { _fcmSa = false; }
  return _fcmSa || null;
}

let _fcmTok = { token: '', exp: 0 };
async function fcmAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (_fcmTok.token && _fcmTok.exp - 60 > now) return _fcmTok.token;
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(claim)}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt),
  });
  if (!res.ok) throw new Error('FCM 토큰 발급 실패: ' + res.status);
  const j = await res.json();
  _fcmTok = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return _fcmTok.token;
}

// 단일 FCM 토큰에 발송. 성공 true, 토큰 만료(삭제 대상)면 'gone'.
async function sendFcm(sa, accessToken, deviceToken, payload) {
  const message = {
    message: {
      token: deviceToken,
      notification: { title: payload.title, body: payload.body },
      data: {
        url: String(payload.url || '/'),
        ...(payload.taskId ? { taskId: String(payload.taskId), token: String(payload.token || '') } : {}),
      },
      android: { priority: 'high', notification: { default_sound: true } },
    },
  };
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    }
  );
  if (res.ok) return true;
  const errText = await res.text().catch(() => '');
  // 등록 해지/유효하지 않은 토큰 → 삭제 대상
  if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(errText)) return 'gone';
  return false;
}

// payload: { title, body, url }
// targets: 받을 사람 이름 배열. 있으면 해당 user_name 구독에게만 발송. 없으면 전체 발송.
async function sendToAll(payload, targets) {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 미설정');

  const res = await sbFetch('push_subscriptions?select=id,endpoint,p256dh,auth,user_name,platform', { method: 'GET' });
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

  const webSubs = (subs || []).filter((s) => s.platform !== 'android');
  const androidSubs = (subs || []).filter((s) => s.platform === 'android');

  let sent = 0, removed = 0;

  // 1) 웹푸시 (VAPID)
  if (webSubs.length) {
    if (!ensureVapid()) throw new Error('VAPID_PRIVATE_KEY 미설정');
    await Promise.all(webSubs.map(async (s) => {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(subscription, data);
        sent++;
      } catch (err) {
        const code = err && err.statusCode;
        if (code === 404 || code === 410) {
          await sbFetch('push_subscriptions?id=eq.' + s.id, { method: 'DELETE' }).catch(() => {});
          removed++;
        }
      }
    }));
  }

  // 2) FCM (Android)
  const sa = fcmServiceAccount();
  if (androidSubs.length && sa) {
    const accessToken = await fcmAccessToken(sa);
    await Promise.all(androidSubs.map(async (s) => {
      try {
        const r = await sendFcm(sa, accessToken, s.endpoint, payloadObj);
        if (r === true) sent++;
        else if (r === 'gone') {
          await sbFetch('push_subscriptions?id=eq.' + s.id, { method: 'DELETE' }).catch(() => {});
          removed++;
        }
      } catch (_) { /* 개별 실패는 무시 */ }
    }));
  }

  return { total: (subs || []).length, sent, removed, web: webSubs.length, android: androidSubs.length };
}

module.exports = { sendToAll, VAPID_PUBLIC };
