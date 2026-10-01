/* =====================================================================
 * send-kit.js — 견적서·디자인확인서·작업요청서 '보내기' (발송 직전까지)
 * index.html(app.js)과 doc-generator.html이 같이 씀. 의존: html2canvas 결과(canvas), jsPDF(window.jspdf)
 *
 *  SendKit.configure({ load, save })   — 양식 불러오기/저장 (send_templates 테이블, 회사 공용)
 *  SendKit.open({ docType, title, vars, to, fileBase, makeCanvas, onSent })
 *    docType : 'quote' | 'dc' | 'wr'
 *    vars    : { 거래처, 담당자, 품목, 수량, 합계, 납기, 문서번호, 작성자 }
 *    to      : { email, phone }
 *    makeCanvas : async () => canvas (문서 1장 A4)
 *    onSent  : async ({ channel, text }) => {}   (있으면 '보냈어요 — 기록 남기기' 버튼)
 *
 * 메일: 네이버웍스 메일쓰기 주소(to·subject·body)로 칸을 채움. body는 HTML도 받음(굵게·링크·이미지 OK, 2026-10 확인)
 *       body를 넣으면 네이버웍스 기본 서명이 사라져서 → 회사 서명(HTML)을 본문 끝에 우리가 붙임(send_templates doc_type 'sig'). 첨부만 직접
 * 카톡: 폰 = 공유 시트(파일+문구) / PC = 문서 이미지 복사 → 문구 복사 (채팅방에서 Ctrl+V)
 * ===================================================================== */
(function () {
  'use strict';
  var MAIL_URL = 'https://mail.worksmobile.com/';
  // 네이버웍스 메일쓰기는 주소 뒤 to·subject·body를 받아 칸을 채워줌 (2026-10 실제 확인). 첨부만 직접
  // body를 넣으면 기본 서명이 사라짐(본문을 통째로 바꿈) → 회사 서명을 본문 끝에 같이 넣음
  function composeUrl(m, bodyHtml) {
    return 'https://mail.worksmobile.com/w/compose?orderType=new' +
      '&to=' + encodeURIComponent(m.to || '') + '&subject=' + encodeURIComponent(m.subject || '') +
      '&body=' + encodeURIComponent(bodyHtml || '');
  }
  function textToHtml(t) { return '<div style="font-weight:normal">' + esc(t).replace(/\n/g, '<br>') + '</div>'; }
  // 네이버웍스 '기본 서명'을 그대로 옮긴 것 (2026-10). 양식 수정 → 서명에서 바꿀 수 있음
  var SIG_DEFAULT = '<div style="font-size:12px;line-height:1.6;color:#000;font-weight:normal">' +
    '<img src="https://static.worksmobile.net/static/pwe/nworks/sign_bar1.png" width="36" height="16" alt=""><br>' +
    '<b>케이엘피코리아 (주)</b><br>' +
    '<span style="color:#888">서울특별시 구로구 디지털로32길 30, 901호(구로동)</span><br>' +
    '<b>Tel</b> 02 2103 5757<br><b>Fax</b> 02 2103 5759<br>' +
    '<b>Email</b> <a href="mailto:klpkorea@agift.kr">klpkorea@agift.kr</a><br><br>' +
    '▶ 회사 소개 : <a href="http://klpkorea.co.kr">http://klpkorea.co.kr</a><br>' +
    '▶ 시계 쇼핑몰 : <a href="http://showroom.co.kr">http://showroom.co.kr</a><br>' +
    '▶ 판촉·선물 쇼핑몰 : <a href="http://agift.kr">http://agift.kr</a><br><br>' +
    '<a href="http://pf.kakao.com/_xmGyUM"><img src="http://klp01.imghost.cafe24.com/2018shop/kakaotalk_mail.jpg" alt="카카오톡 상담 바로가기"></a>' +
    '</div>';
  function sigHtml() { var t = tplCache && tplCache['sig:email']; return (t && t.body) || SIG_DEFAULT; }
  // 새 탭을 열기 전에 동기로 복사 (탭이 열리면 이 페이지가 포커스를 잃어 비동기 복사는 막힘)
  // 글자 모양 없이 순수 글만 — 서식 있는 복사는 대시보드 다크 모드 색(검은 배경·흰 글씨)까지 따라 들어감
  function copyHtmlSync(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove();
    return ok;
  }
  var DOC_LABEL = { quote: '견적서', dc: '디자인확인서', wr: '작업요청서', pre: '가견적 안내', msg: '안내 메시지' };
  var VARS = ['거래처', '담당자', '품목', '수량', '단가', '합계', '납기', '납기일', '문서번호', '작성자', '작성자직함', '내용'];
  // {단가} '25,000원 (VAT 별도)' · {합계} '280,000원 (VAT 포함)' · {납기} '10/6' · {납기일} '10월 6일 택배 출고'
  // {작성자} = 이름만('김현호 드림'), {작성자직함} = 이름+직함('김현호 팀장입니다')
  var SIGN = '\n\n{작성자} 드림';   // 회사 정보는 네이버웍스 기본 서명이 붙임
  var HELLO = '안녕하세요, {거래처} {담당자}님\n케이엘피코리아 {작성자직함}입니다.\n\n';
  var DEFAULTS = {
    quote: {
      email: { subject: '[케이엘피코리아] {거래처} {품목} 견적 확인 요청의 件',
        body: HELLO + '{품목} 견적서를 첨부와 같이 보내드립니다.\n첨부파일 확인해주시고 궁금하신 점은 메일 혹은 카톡으로 편하게 말씀 부탁드립니다.\n\n- 수량: {수량}\n- 합계: {합계} (부가세 포함)\n- 견적 유효기간: 발행일로부터 7일\n\n검토 후 회신 부탁드립니다.\n감사합니다.' + SIGN },
      kakao: { subject: '',
        body: '안녕하세요 {담당자}님, 케이엘피코리아 {작성자직함}입니다.\n{품목} 견적서 보내드립니다. (수량 {수량}, 합계 {합계} 부가세 포함)\n확인해주시고 궁금하신 점 편하게 말씀 부탁드립니다. 감사합니다!' }
    },
    dc: {
      email: { subject: '[케이엘피코리아] {거래처} {품목} 디자인확인 요청의 件',
        body: HELLO + '{품목} 디자인확인서를 첨부와 같이 보내드립니다.\n첨부파일 확인해주시고 이상 없으시면 메일 혹은 카톡 회신으로 "컨펌" 부탁드립니다.\n\n[디자인확인서 요약]\n* 수량 : {수량}\n* 단가 : {단가}\n* 총합 : {합계}\n* 납기일 : {납기일}\n\n컨펌 즉시 작업이 들어가기때문에 꼭 보시고 회신 부탁드립니다.\n감사합니다.' + SIGN },
      kakao: { subject: '',
        body: '안녕하세요 {담당자}님, 케이엘피코리아 {작성자직함}입니다.\n{품목} 디자인확인서 보내드립니다.\n\n[디자인확인서 요약]\n* 수량 : {수량}\n* 단가 : {단가}\n* 총합 : {합계}\n* 납기일 : {납기일}\n\n확인하시고 이상 없으면 "컨펌" 회신 부탁드립니다.\n컨펌 즉시 작업이 들어가기때문에 꼭 보시고 회신 부탁드립니다!' }
    },
    pre: {
      email: { subject: '[케이엘피코리아] {거래처} {품목} 가견적 안내의 件',
        body: HELLO + '문의 주신 {품목} 예상 견적을 안내드립니다.\n디자인·수량이 확정되면 정확한 견적서로 다시 보내드리겠습니다.\n\n{내용}\n\n궁금하신 점은 메일 혹은 카톡으로 편하게 말씀 부탁드립니다.\n감사합니다.' + SIGN },
      kakao: { subject: '',
        body: '안녕하세요 {담당자}님, 케이엘피코리아 {작성자직함}입니다.\n문의 주신 {품목} 가견적 안내드립니다.\n\n{내용}\n\n디자인·수량 확정되면 정확한 견적서 보내드리겠습니다!' }
    },
    msg: {
      email: { subject: '[케이엘피코리아] {거래처} {품목} 관련 안내의 件',
        body: HELLO + '\n\n감사합니다.' + SIGN },
      kakao: { subject: '',
        body: '안녕하세요 {담당자}님, 케이엘피코리아 {작성자직함}입니다.\n' }
    },
    wr: {
      email: { subject: '[케이엘피코리아] {거래처} {품목} 작업 요청의 件',
        body: HELLO + '{품목} 작업요청서({문서번호})를 첨부와 같이 보내드립니다.\n첨부파일 확인해주시고 진행 가능 여부를 메일 혹은 카톡으로 회신 부탁드립니다.\n\n- 수량: {수량}\n- 납기: {납기}\n\n사양·수량·납기·배송지 꼭 확인 부탁드립니다.\n감사합니다.' + SIGN },
      kakao: { subject: '',
        body: '안녕하세요 {담당자}님, 케이엘피코리아 {작성자직함}입니다.\n{품목} 작업요청서({문서번호}) 보내드립니다.\n수량 {수량}, 납기 {납기} 확인 부탁드리고 진행 가능 여부 회신 부탁드립니다!' }
    }
  };

  var cfg = { load: null, save: null };
  var tplCache = null;      // { 'quote:email': {subject, body} }
  var st = null;            // 지금 열린 창의 상태

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fill(str, vars) {
    return String(str || '').replace(/\{([^{}]+)\}/g, function (m, k) {
      var v = vars[k];
      if ((v == null || v === '') && k === '작성자직함') v = vars['작성자'];
      if ((v == null || v === '') && k === '납기일') v = vars['납기'];
      if (v == null || v === '') return k === '담당자' ? '담당자' : '';
      return String(v);
    });
  }
  function isPhone() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 900); }
  function toast(msg) {
    var t = document.getElementById('skToast');
    if (!t) { t = document.createElement('div'); t.id = 'skToast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show';
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = ''; }, 2200);
  }
  async function copyText(text, label) {
    try { await navigator.clipboard.writeText(text); toast((label || '내용') + ' 복사됨 — 붙여넣기(Ctrl+V) 하세요'); }
    catch (e) {
      if (copyHtmlSync(text)) toast((label || '내용') + ' 복사됨 — 붙여넣기(Ctrl+V) 하세요');
      else window.prompt('복사가 막혀 있어요. 아래 글을 복사하세요 (Ctrl+C)', text);
    }
  }


  async function loadTemplates() {
    if (tplCache) return tplCache;
    tplCache = {};
    try {
      var rows = cfg.load ? (await cfg.load()) || [] : [];
      rows.forEach(function (r) { tplCache[r.doc_type + ':' + r.channel] = { subject: r.subject || '', body: r.body || '' }; });
    } catch (e) { console.warn('보내기 양식 불러오기 실패 — 기본 양식 사용', e); }
    return tplCache;
  }
  function tpl(docType, channel) {
    var saved = tplCache && tplCache[docType + ':' + channel];
    return saved || DEFAULTS[docType][channel];
  }

  // ---------- 파일 ----------
  async function getCanvas() {
    if (!st.canvas) {
      st.canvasP = st.canvasP || st.makeCanvas();
      st.canvas = await st.canvasP;
    }
    return st.canvas;
  }
  async function getPdfBlob() {
    if (st.pdf) return st.pdf;
    var c = await getCanvas();
    var pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
    st.pdf = pdf.output('blob');
    return st.pdf;
  }
  function getImgBlob(type) {
    var key = type === 'image/png' ? 'png' : 'jpg';
    if (!st[key]) {
      st[key] = getCanvas().then(function (c) { return new Promise(function (res) { c.toBlob(res, type, 0.92); }); });
    }
    return st[key];
  }
  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  // ---------- 화면 ----------
  function injectCss() {
    if (document.getElementById('skCss')) return;
    var s = document.createElement('style'); s.id = 'skCss';
    s.textContent = [
      '#skWrap{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px;font-family:Pretendard,-apple-system,"Malgun Gothic",sans-serif;color:#111827}',
      '#skBox{width:640px;max-width:100%;background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden}',
      '#skBox .sk-h{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #eef0f3}',
      '#skBox .sk-h b{flex:1;font-size:17px;font-weight:800;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#skBox .sk-x{width:34px;height:34px;border:none;border-radius:10px;background:#f2f4f6;font-size:18px;cursor:pointer}',
      '#skBox .sk-tabs{display:flex;gap:6px;padding:12px 20px 0}',
      '#skBox .sk-tabs button{flex:1;height:44px;border:1.5px solid #e5e8eb;border-radius:12px;background:#fff;font:inherit;font-size:15px;font-weight:800;color:#4b5563;cursor:pointer}',
      '#skBox .sk-tabs button.on{border-color:#1F85FF;background:#EAF3FF;color:#1F85FF}',
      '#skBox .sk-b{padding:14px 20px 18px}',
      '#skBox .sk-f{margin-bottom:12px}',
      '#skBox .sk-f label{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:800;color:#6b7684;margin-bottom:5px}',
      '#skBox .sk-f label .n{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#1F85FF;color:#fff;font-size:11.5px}',
      '#skBox .sk-row{display:flex;gap:6px}',
      '#skBox input,#skBox textarea{flex:1;min-width:0;border:1.5px solid #e5e8eb;border-radius:11px;padding:10px 12px;font:inherit;font-size:14.5px;color:#111827;background:#fafbfc;outline:none;box-sizing:border-box;width:100%}',
      '#skBox input:focus,#skBox textarea:focus{border-color:#1F85FF;background:#fff}',
      '#skBox textarea{resize:vertical;line-height:1.55}',
      '#skBox .sk-c{flex:none;height:42px;padding:0 13px;border:none;border-radius:11px;background:#111827;color:#fff;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;white-space:nowrap}',
      '#skBox .sk-c.light{background:#f2f4f6;color:#374151}',
      '#skBox .sk-main{width:100%;height:50px;border:none;border-radius:13px;background:#1F85FF;color:#fff;font:inherit;font-size:16px;font-weight:800;cursor:pointer;margin:4px 0 10px}',
      '#skBox .sk-main.kakao{background:#FEE500;color:#191919}',
      '#skBox .sk-main:disabled{opacity:.6;cursor:wait}',
      '#skBox .sk-file{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:11px;background:#f7f8fa;font-size:13.5px;font-weight:600}',
      '#skBox .sk-file span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#skBox .sk-tip{font-size:12.5px;color:#6b7684;line-height:1.55;margin:2px 0 10px}',
      '#skBox .sk-sig{display:flex;align-items:center;gap:7px;margin:0 0 6px;font-size:13.5px;font-weight:700;color:#374151;cursor:pointer}',
      '#skBox .sk-sig input{width:17px;height:17px;flex:none;margin:0;accent-color:#1F85FF}',
      '#skBox .sk-sigprev{width:100%;height:230px;border:1.5px solid #e5e8eb;border-radius:11px;background:#fff}',
      '#skBox .sk-sigcode{margin-top:6px;font-size:13px;color:#4b5563}',
      '#skBox .sk-sigcode summary{cursor:pointer;font-weight:700;margin-bottom:6px}',
      '#skBox .sk-tip b{color:#374151}',
      '#skBox .sk-foot{display:flex;gap:8px;align-items:center;padding:12px 20px;border-top:1px solid #eef0f3;background:#fafbfc}',
      '#skBox .sk-foot .sp{flex:1}',
      '#skBox .sk-link{border:none;background:none;color:#4b5563;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;padding:6px 4px}',
      '#skBox .sk-sent{height:40px;padding:0 14px;border:1.5px solid #16A34A;border-radius:11px;background:#fff;color:#15803D;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer}',
      '#skBox .sk-vars{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 4px}',
      '#skBox .sk-vars button{height:28px;padding:0 9px;border:1px solid #d6e6ff;border-radius:14px;background:#EAF3FF;color:#1F85FF;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}',
      '#skBox .sk-edit-note{font-size:12.5px;color:#B45309;background:#FFFBEB;border-radius:10px;padding:8px 10px;margin-bottom:10px}',
      '#skToast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%) translateY(16px);z-index:10060;background:#111827;color:#fff;padding:11px 18px;border-radius:12px;font-size:14px;font-weight:700;opacity:0;transition:all .25s;pointer-events:none;max-width:90vw;text-align:center}',
      '#skToast.show{opacity:1;transform:translateX(-50%) translateY(0)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function filled(channel) {
    var t = tpl(st.docType, channel);
    return { subject: fill(t.subject, st.vars), body: fill(t.body, st.vars) };
  }
  function render() {
    var box = document.getElementById('skBox');
    if (!box) return;
    var label = DOC_LABEL[st.docType];
    var head = '<div class="sk-h"><b>📤 보내기 — ' + esc(st.title || label) + '</b><button class="sk-x" data-a="close" aria-label="닫기">✕</button></div>' +
      '<div class="sk-tabs"><button class="' + (st.ch === 'email' ? 'on' : '') + '" data-a="ch:email">📧 메일</button><button class="' + (st.ch === 'kakao' ? 'on' : '') + '" data-a="ch:kakao">💬 카톡</button></div>';
    var body = '';
    if (st.editing) {
      var t = tpl(st.docType, st.ch);
      body = '<div class="sk-b"><div class="sk-edit-note">' + label + ' · ' + (st.ch === 'email' ? '메일' : '카톡') + ' 양식을 고칩니다. 저장하면 <b>회사 모두</b>에게 같은 양식이 적용돼요. 아래 칸을 누르면 그 자리에 들어가요.</div>' +
        '<div class="sk-vars">' + VARS.map(function (v) { return '<button data-a="var:' + v + '">{' + v + '}</button>'; }).join('') + '</div>' +
        (st.ch === 'email' ? '<div class="sk-f"><label>제목 양식</label><input id="skTplSubject" value="' + esc(t.subject) + '"></div>' : '') +
        '<div class="sk-f"><label>' + (st.ch === 'email' ? '본문 양식' : '문구 양식') + '</label><textarea id="skTplBody" rows="12">' + esc(t.body) + '</textarea></div>' +
        (st.ch === 'email' ? '<div class="sk-f"><label>회사 서명 (모든 메일 공통 · 본문 끝에 붙음)</label><iframe class="sk-sigprev" sandbox="" srcdoc="' + esc('<body style="margin:8px;font-family:sans-serif">' + sigHtml() + '</body>') + '"></iframe>' +
          '<details class="sk-sigcode"><summary>서명 고치기 (HTML 코드)</summary><textarea id="skTplSig" rows="8">' + esc(sigHtml()) + '</textarea></details></div>' : '') +
        '<div class="sk-row"><button class="sk-c light" data-a="tpl-reset">기본 양식으로</button><span style="flex:1"></span><button class="sk-c light" data-a="tpl-cancel">취소</button><button class="sk-c" data-a="tpl-save">양식 저장</button></div></div>';
    } else if (st.ch === 'email') {
      var m = st.draft.email;
      body = '<div class="sk-b">' +
        '<button class="sk-main" data-a="mail-go">✉️ 네이버웍스 메일쓰기 열기' + (st.hasFile ? ' + PDF 내려받기' : '') + '</button>' +
        '<label class="sk-sig"><input type="checkbox" data-a="sig"' + (st.useSig ? ' checked' : '') + '> 회사 <b>서명</b> 붙이기</label>' +
        '<div class="sk-tip">메일쓰기 창에 <b>받는 사람·제목·본문' + (st.useSig ? '·서명' : '') + '</b>이 모두 채워져요.' + (st.hasFile ? ' 내려받은 <b>PDF만 끌어다 놓고</b> 보내세요.' : ' 확인 후 보내세요.') + '</div>' +
        '<div class="sk-f"><label><span class="n">1</span>받는 사람</label><div class="sk-row"><input id="skTo" value="' + esc(m.to) + '" placeholder="이메일 주소"><button class="sk-c" data-a="copy:skTo:받는 사람">복사</button></div></div>' +
        '<div class="sk-f"><label><span class="n">2</span>제목</label><div class="sk-row"><input id="skSubject" value="' + esc(m.subject) + '"><button class="sk-c" data-a="copy:skSubject:제목">복사</button></div></div>' +
        '<div class="sk-f"><label><span class="n">3</span>본문 <span style="font-weight:600">(여기서 고쳐도 돼요)</span></label><textarea id="skBody" rows="11">' + esc(m.body) + '</textarea><div class="sk-row" style="margin-top:6px"><span style="flex:1"></span><button class="sk-c" data-a="copy:skBody:본문">본문 복사</button></div></div>' +
        (st.hasFile ? '<div class="sk-f"><label><span class="n">4</span>첨부 파일</label><div class="sk-file">📄 <span>' + esc(st.fileBase) + '.pdf</span><button class="sk-c light" data-a="dl:pdf">PDF 받기</button><button class="sk-c light" data-a="dl:jpg">JPG 받기</button></div></div>' : '') +
        '</div>';
    } else {
      var k = st.draft.kakao;
      var phone = isPhone() && navigator.canShare;
      body = '<div class="sk-b">' +
        (phone
          ? '<button class="sk-main kakao" data-a="kakao-share">💬 카톡으로 보내기' + (st.hasFile ? ' (문서 이미지 + 문구)' : '') + '</button><div class="sk-tip">공유 창에서 <b>카카오톡</b> → 채팅방을 고르고 <b>전송</b>만 누르세요.' + (st.hasFile ? ' 문구가 안 붙으면 입력칸을 길게 눌러 <b>붙여넣기</b> 하세요(미리 복사해 둠).' : '') + '</div>'
          : st.hasFile
            ? '<div class="sk-tip">PC 카톡에서 보낼 채팅방을 연 다음, <b>①</b>을 누르고 채팅방에 <b>Ctrl+V</b> → <b>②</b>를 누르고 <b>Ctrl+V</b> → 전송.</div>' +
              '<div class="sk-row" style="margin-bottom:12px"><button class="sk-main kakao" style="margin:0" data-a="kakao-img">① 문서 이미지 복사</button><button class="sk-main kakao" style="margin:0" data-a="kakao-text">② 문구 복사</button></div>'
            : '<button class="sk-main kakao" data-a="kakao-text">📋 문구 복사</button><div class="sk-tip">PC 카톡 채팅방에서 <b>Ctrl+V</b> → 전송.</div>') +
        '<div class="sk-f"><label>보낼 문구 <span style="font-weight:600">(여기서 고쳐도 돼요)</span></label><textarea id="skKakao" rows="' + (st.hasFile ? 7 : 11) + '">' + esc(k.body) + '</textarea></div>' +
        (st.hasFile ? '<div class="sk-file">🖼 <span>' + esc(st.fileBase) + '.jpg</span><button class="sk-c light" data-a="dl:jpg">이미지 받기</button><button class="sk-c light" data-a="dl:pdf">PDF 받기</button></div>' : '') +
        '</div>';
    }
    var foot = st.editing ? '' : '<div class="sk-foot"><button class="sk-link" data-a="tpl-edit">✏️ 양식 수정</button><span class="sp"></span>' +
      (st.onSent ? '<button class="sk-sent" data-a="sent">' + esc(st.sentLabel || '✓ 보냈어요 — 상담 기록에 남기기') + '</button>' : '') + '</div>';
    box.innerHTML = head + body + foot;
  }
  function saveDraftFromInputs() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : null; };
    if (g('skTo') != null) st.draft.email.to = g('skTo');
    if (g('skSubject') != null) st.draft.email.subject = g('skSubject');
    if (g('skBody') != null) st.draft.email.body = g('skBody');
    if (g('skKakao') != null) st.draft.kakao.body = g('skKakao');
  }
  function resetDrafts() {
    st.draft = { email: Object.assign({ to: (st.to && st.to.email) || '' }, filled('email')), kakao: filled('kakao') };
  }

  async function onClick(e) {
    var b = e.target.closest('[data-a]');
    if (!b || !st) return;
    var a = b.getAttribute('data-a');
    if (a === 'close') { close(); return; }
    saveDraftFromInputs();
    if (a.indexOf('ch:') === 0) { st.ch = a.slice(3); st.editing = false; render(); return; }
    if (a === 'sig') { st.useSig = !!b.checked; try { localStorage.setItem('sk_sig', st.useSig ? '1' : '0'); } catch (_) {} render(); return; }
    if (a.indexOf('copy:') === 0) {
      var parts = a.split(':'); var el = document.getElementById(parts[1]);
      if (el) await copyText(el.value, parts[2]);
      return;
    }
    if (a.indexOf('dl:') === 0) {
      var kind = a.slice(3);
      try { b.disabled = true; download(kind === 'pdf' ? await getPdfBlob() : await getImgBlob('image/jpeg'), st.fileBase + '.' + kind); }
      catch (err) { alert('파일 만들기 실패: ' + err.message); }
      b.disabled = false; return;
    }
    if (a === 'mail-go') {
      var html = textToHtml(st.draft.email.body) + (st.useSig ? '<br><br>' + sigHtml() : '');
      var w = window.open(composeUrl(st.draft.email, html), '_blank');   // 팝업 차단을 피하려고 먼저 연다
      var doneMsg = '메일쓰기 창에 채워 두었어요 — 확인 후 보내세요';
      if (!st.hasFile) { toast(w ? doneMsg : '팝업이 막혔어요 — 주소창 오른쪽에서 팝업을 허용해주세요'); return; }
      b.disabled = true; b.textContent = '파일 만드는 중…';
      try { download(await getPdfBlob(), st.fileBase + '.pdf'); toast(doneMsg + ' · PDF는 끌어다 놓기'); }
      catch (err) { alert('PDF 만들기 실패: ' + err.message); }
      b.disabled = false; b.textContent = '✉️ 네이버웍스 메일쓰기 열기 + PDF 내려받기';
      if (!w) toast('팝업이 막혔어요 — 주소창 오른쪽에서 팝업을 허용해주세요');
      return;
    }
    if (a === 'kakao-img') {
      b.disabled = true;
      try {
        // Blob 대신 Promise를 넘겨야 버튼 누른 직후 권한이 유지됨
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': getImgBlob('image/png') })]);
        toast('문서 이미지 복사됨 — 카톡 채팅방에서 Ctrl+V');
      } catch (err) {
        download(await getImgBlob('image/jpeg'), st.fileBase + '.jpg');
        toast('이미지 복사가 막혀 내려받았어요 — 채팅방에 끌어다 놓으세요');
      }
      b.disabled = false; return;
    }
    if (a === 'kakao-text') { await copyText(st.draft.kakao.body, '문구'); return; }
    if (a === 'kakao-share') {
      b.disabled = true;
      if (!st.hasFile) {
        try { await navigator.share({ text: st.draft.kakao.body }); }
        catch (err) { if (err && err.name !== 'AbortError') await copyText(st.draft.kakao.body, '문구'); }
        b.disabled = false; return;
      }
      try {
        var jpg = await getImgBlob('image/jpeg');
        var file = new File([jpg], st.fileBase + '.jpg', { type: 'image/jpeg' });
        try { navigator.clipboard.writeText(st.draft.kakao.body).catch(function () {}); } catch (_) {}
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: st.draft.kakao.body });
        else { download(jpg, st.fileBase + '.jpg'); toast('공유가 안 돼서 이미지를 내려받았어요'); }
      } catch (err) { if (err && err.name !== 'AbortError') alert('공유 실패: ' + err.message); }
      b.disabled = false; return;
    }
    if (a === 'tpl-edit') { st.editing = true; render(); return; }
    if (a === 'tpl-cancel') { st.editing = false; render(); return; }
    if (a.indexOf('var:') === 0) {
      var target = document.activeElement && (document.activeElement.id === 'skTplSubject' || document.activeElement.id === 'skTplBody') ? document.activeElement : (st.lastField && document.getElementById(st.lastField)) || document.getElementById('skTplBody');
      var ins = '{' + a.slice(4) + '}';
      var s0 = target.selectionStart != null ? target.selectionStart : target.value.length, s1 = target.selectionEnd != null ? target.selectionEnd : s0;
      target.value = target.value.slice(0, s0) + ins + target.value.slice(s1);
      target.focus(); target.setSelectionRange(s0 + ins.length, s0 + ins.length);
      return;
    }
    if (a === 'tpl-reset') {
      var d = DEFAULTS[st.docType][st.ch];
      var sub = document.getElementById('skTplSubject'); if (sub) sub.value = d.subject;
      document.getElementById('skTplBody').value = d.body;
      var sg = document.getElementById('skTplSig'); if (sg) sg.value = SIG_DEFAULT;
      return;
    }
    if (a === 'tpl-save') {
      var subjEl = document.getElementById('skTplSubject');
      var row = { doc_type: st.docType, channel: st.ch, subject: subjEl ? subjEl.value : '', body: document.getElementById('skTplBody').value };
      b.disabled = true;
      try {
        if (!cfg.save) throw new Error('저장 기능이 연결되지 않았습니다');
        await cfg.save(row);
        tplCache = tplCache || {};
        var sgEl = document.getElementById('skTplSig');
        if (sgEl && sgEl.value.trim() !== sigHtml().trim()) {
          var sigRow = { doc_type: 'sig', channel: 'email', subject: '', body: sgEl.value.trim() || SIG_DEFAULT };
          await cfg.save(sigRow);
          tplCache['sig:email'] = { subject: '', body: sigRow.body };
        }
        tplCache[st.docType + ':' + st.ch] = { subject: row.subject, body: row.body };
        st.editing = false; resetDrafts(); render();
        toast('양식을 저장했습니다 (회사 공용)');
      } catch (err) { alert('양식 저장 실패: ' + err.message); b.disabled = false; }
      return;
    }
    if (a === 'sent') {
      b.disabled = true;
      try {
        await st.onSent({ channel: st.ch === 'email' ? '이메일' : '카톡', text: st.ch === 'email' ? (st.draft.email.subject + '\n\n' + st.draft.email.body) : st.draft.kakao.body });
        toast('상담 기록에 남겼습니다');
        close();
      } catch (err) { alert('기록 실패: ' + err.message); b.disabled = false; }
    }
  }
  function onFocusIn(e) { if (e.target && (e.target.id === 'skTplSubject' || e.target.id === 'skTplBody')) st.lastField = e.target.id; }
  function onKey(e) { if (e.key === 'Escape' && st) { e.stopPropagation(); close(); } }
  function close() {
    var w = document.getElementById('skWrap'); if (w) w.remove();
    document.removeEventListener('keydown', onKey, true);
    st = null;
  }

  async function open(opts) {
    injectCss();
    close();
    st = {
      docType: opts.docType, title: opts.title || '', vars: opts.vars || {}, to: opts.to || {},
      fileBase: (opts.fileBase || DOC_LABEL[opts.docType]).replace(/[\\/:*?"<>|]/g, '_'),
      makeCanvas: opts.makeCanvas || null, hasFile: !!opts.makeCanvas, onSent: opts.onSent || null,
      sentLabel: opts.sentLabel || '',
      useSig: (function () { try { return localStorage.getItem('sk_sig') !== '0'; } catch (_) { return true; } })(),
      ch: (function () { try { return localStorage.getItem('sk_ch') === 'kakao' ? 'kakao' : 'email'; } catch (_) { return 'email'; } })(),
      editing: false
    };
    var wrap = document.createElement('div');
    wrap.id = 'skWrap';
    wrap.innerHTML = '<div id="skBox"><div style="padding:40px;text-align:center;color:#6b7684">양식 불러오는 중…</div></div>';
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); else onClick(e); });
    wrap.addEventListener('focusin', onFocusIn);
    document.body.appendChild(wrap);
    document.addEventListener('keydown', onKey, true);
    await loadTemplates();
    if (!st) return;
    resetDrafts();
    render();
    // 문서 이미지는 미리 만들어 둠 (버튼 누를 때 기다리지 않게)
    // (폰 공유·이미지 복사는 버튼 누른 직후에만 허용돼서 파일이 미리 준비돼 있어야 함)
    if (st.hasFile) try {
      var mine = st;
      st.canvasP = st.makeCanvas();
      st.canvasP.then(function (c) {
        if (st !== mine) return;
        st.canvas = c;
        getImgBlob('image/jpeg'); getImgBlob('image/png');
      }).catch(function (e) { console.warn('문서 이미지 만들기 실패', e); });
    } catch (_) {}
    // 마지막으로 쓴 채널 기억
    wrap.addEventListener('click', function () { try { if (st) localStorage.setItem('sk_ch', st.ch); } catch (_) {} });
  }

  window.SendKit = {
    configure: function (o) { cfg.load = o.load || null; cfg.save = o.save || null; tplCache = null; },
    open: open,
    DEFAULTS: DEFAULTS
  };
})();
