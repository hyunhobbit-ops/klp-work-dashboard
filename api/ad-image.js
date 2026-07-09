// api/ad-image.js — 광고 배경 이미지 생성 (OpenAI Images). 로그인 직원만 호출.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';
// 계정마다 쓸 수 있는 이미지 모델이 다름(신규 계정엔 dall-e 계열이 없음).
// 최고 성능 우선으로 시도하고, 권한이 없으면 차선책으로 내려감.
const MODEL_CANDIDATES = [process.env.OPENAI_IMAGE_MODEL, 'gpt-image-1', 'gpt-image-1-mini', 'dall-e-3', 'dall-e-2']
  .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
let _workingModel = null; // 웜 인스턴스 동안 성공 모델 캐시

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
  // 스타일 참조 이미지(선택, 최대 3장) — data URL 배열
  const styleRefs = (Array.isArray(body && body.styleRefs) ? body.styleRefs : [])
    .filter(x => typeof x === 'string' && x.indexOf('data:') === 0).slice(0, 3);
  // 녹이기 모드: 제품 사진을 장면에 직접 합성
  const productImage = (typeof (body && body.productImage) === 'string' && body.productImage.indexOf('data:') === 0) ? body.productImage : null;
  const blend = !!(body && body.blend) && !!productImage;
  // 편집(edits)에 넣을 이미지: 녹이기면 [제품, 참조...], 아니면 [참조...]
  const editImages = blend ? [productImage].concat(styleRefs) : styleRefs;

  const basePrompt = '한국 상업 광고용 정사각 배경 이미지. 제품 카테고리 "' + (p.name || '제품') + '"에 어울리는 감성적이고 깔끔한 배경/무드. ' +
    '톤: ' + (s.tone || '고급스럽고 밝은') + '. 타깃: ' + (s.target || '일반') + '. ' +
    '중요: 어떤 글자/텍스트/로고도 넣지 말 것. 제품 자체를 그리지 말고, 제품을 올려놓기 좋은 여백 있는 배경만. 사실적 스튜디오/라이프스타일 톤.';
  const prompt = blend
    ? ('첨부한 첫 번째 이미지 속 제품을, ' + (s.tone || '고급스럽고 밝은') + ' 분위기의 실제 공간/스튜디오 장면에 자연스럽게 놓인 상업 광고 사진처럼 합성해줘. '
        + '제품의 형태·색·비율·로고·디테일은 절대 바꾸지 말고 그대로 유지하고, 그림자·반사·조명만 장면에 어울리게. '
        + (styleRefs.length ? '나머지 참조 이미지들의 분위기·색감·조명·질감을 따라. ' : '')
        + '어떤 글자/텍스트/워터마크도 넣지 말 것. 정사각 구도. 제품은 화면 위쪽~가운데에 크게 배치하고, 아래 1/3 정도는 텍스트를 얹을 단순한 여백(바닥/배경)으로 남겨줘.')
    : (styleRefs.length
        ? '첨부한 참조 이미지들의 분위기·색감·조명·질감·구도 스타일을 최대한 그대로 따라서 만들어줘. ' + basePrompt
        : basePrompt);

  const dataUrlToPart = (dataUrl) => {
    const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
    const mime = (m && m[1]) || 'image/png';
    const buf = Buffer.from((m && m[2]) || '', 'base64');
    return { buf, mime };
  };

  // 특정 모델로 1장 생성. b64 또는 URL(서버가 받아 base64 변환) 모두 처리.
  const genWith = async (model) => {
    let oimg;
    if (editImages.length && /^gpt-image/.test(model)) {
      // 참조/제품 이미지가 있으면 편집(edits) 엔드포인트 사용 (gpt-image 전용, multipart)
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      form.append('n', '1');
      form.append('size', '1024x1024');
      form.append('quality', 'high');
      editImages.forEach((ref, idx) => {
        const { buf, mime } = dataUrlToPart(ref);
        const ext = mime.indexOf('png') >= 0 ? 'png' : (mime.indexOf('webp') >= 0 ? 'webp' : 'jpg');
        form.append('image[]', new Blob([buf], { type: mime }), 'ref' + idx + '.' + ext);
      });
      oimg = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` }, // Content-Type(경계)은 fetch가 자동 설정
        body: form
      });
    } else {
      // 품질은 항상 최고급으로 (gpt-image 계열: high / dall-e-3: hd)
      const payload = { model, prompt, n: 1, size: '1024x1024' };
      if (/^gpt-image/.test(model)) payload.quality = 'high';
      else if (model === 'dall-e-3') payload.quality = 'hd';
      oimg = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    const j = await oimg.json().catch(() => ({}));
    if (!oimg.ok) {
      const e = new Error((j && j.error && j.error.message) || ('HTTP ' + oimg.status));
      e.status = oimg.status;
      throw e;
    }
    const d = (j.data && j.data[0]) || {};
    if (d.b64_json) return 'data:image/png;base64,' + d.b64_json;
    if (d.url) {
      const ir = await fetch(d.url);
      if (!ir.ok) throw new Error('이미지 다운로드 실패(' + ir.status + ')');
      const buf = Buffer.from(await ir.arrayBuffer());
      const ct = ir.headers.get('content-type') || 'image/png';
      return 'data:' + ct + ';base64,' + buf.toString('base64');
    }
    throw new Error('이미지 응답이 비어있음');
  };

  try {
    const images = [];
    let lastErr = null;
    // 참조/제품 이미지가 있으면 편집 지원 모델(gpt-image)만 대상
    const candidates = editImages.length ? MODEL_CANDIDATES.filter(m => /^gpt-image/.test(m)) : MODEL_CANDIDATES;
    const canUseCache = _workingModel && candidates.indexOf(_workingModel) >= 0;
    // 1장째: 사용 가능한 모델을 순서대로 탐색 (키/크레딧 문제면 즉시 중단)
    if (!canUseCache) {
      for (const m of candidates) {
        try { images.push(await genWith(m)); _workingModel = m; break; }
        catch (e) {
          lastErr = e;
          if (e.status === 401 || e.status === 429) break; // 다른 모델 시도 무의미
        }
      }
    } else {
      try { images.push(await genWith(_workingModel)); }
      catch (e) { lastErr = e; _workingModel = null; }
    }
    // 나머지 장수는 확정된 모델로 병렬 생성
    if (_workingModel && images.length && count > 1) {
      const rest = await Promise.allSettled(
        Array.from({ length: count - 1 }, () => genWith(_workingModel))
      );
      rest.forEach(s => { if (s.status === 'fulfilled' && s.value) images.push(s.value); });
    }
    if (images.length) { res.status(200).json({ images, model: _workingModel, blend }); return; }

    const err = lastErr;
    const code = (err && err.status) || 502;
    const detail = (err && err.message) || '';
    let msg = '이미지 생성 실패';
    if (code === 401) msg = 'OpenAI 키가 올바르지 않습니다.';
    else if (code === 429) msg = '크레딧이 부족하거나 요청 한도를 넘었습니다. OpenAI Billing에서 충전해주세요.';
    else if (/verif/i.test(detail)) msg = 'OpenAI 조직 인증이 필요합니다. platform.openai.com → Settings → Organization → Verify 후 재시도.';
    else if (code === 403) msg = '모델 사용 권한이 없습니다(조직 인증이 필요할 수 있음).';
    else if (code === 400 || code === 404) msg = '사용 가능한 이미지 모델을 찾지 못했습니다.';
    if (editImages.length) msg += ' (스타일 참조·녹이기는 gpt-image 모델이 필요 — 조직 인증이 안 됐다면 카드형/참조 없이 시도해보세요)';
    res.status(code >= 400 && code < 500 ? code : 502).json({ error: msg, detail, blend });
  } catch (err) {
    res.status(502).json({ error: '이미지 생성 서버 오류', detail: (err && err.message) || '' });
  }
};
