// ========================================
// KLP KOREA Work Dashboard v2
// ========================================

// ===== Supabase =====
const SUPABASE_URL = 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null; // { id, name, role }

// ===== Auth =====
// 표시 이름 매핑 (김관택 → 대표님)
const DISPLAY_NAME_MAP = { '김관택': '대표님' };

async function checkAuth() {
    const saved = localStorage.getItem('klp_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        // 기존 세션에서도 표시 이름 매핑 적용
        if (DISPLAY_NAME_MAP[currentUser.name]) {
            currentUser.loginName = currentUser.name;
            currentUser.name = DISPLAY_NAME_MAP[currentUser.name];
            localStorage.setItem('klp_user', JSON.stringify(currentUser));
        }
        updateSidebarUser();
        showApp();
    } else {
        showLogin();
    }
}

const DELIVERY_PRICE_ALLOWED = ['김관택','이현주','김현호'];
function applyDeliveryPricePermission() {
    const login = currentUser ? (currentUser.loginName || currentUser.name) : null;
    const allowed = login && DELIVERY_PRICE_ALLOWED.includes(login);
    document.body.classList.toggle('hide-delivery-price', !allowed);
}

function updateSidebarUser() {
    const initials = currentUser.name.length >= 2
        ? currentUser.name.slice(-2)
        : currentUser.name;
    document.getElementById('userAvatar').textContent = initials;
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role;
    try { applyMarketdbPermission(); } catch (e) {}
    try { applyPlanningPermission(); } catch (e) {}
    try { applyDeliveryPricePermission(); } catch (e) {}
}

async function handleLogin() {
    const name = document.getElementById('loginName').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');

    if (!name || !password) {
        errorEl.textContent = '이름과 비밀번호를 입력해주세요';
        return;
    }

    btn.disabled = true;
    btn.textContent = '로그인 중...';
    errorEl.textContent = '';

    const { data, error } = await sb
        .from('profiles')
        .select('id, name, password, role')
        .eq('name', name)
        .single();

    if (error || !data) {
        console.error('Login error:', error);
        errorEl.textContent = error ? `오류: ${error.message}` : '등록되지 않은 이름입니다';
        btn.disabled = false;
        btn.textContent = '로그인';
        return;
    }

    if (data.password !== password) {
        errorEl.textContent = '비밀번호가 올바르지 않습니다';
        btn.disabled = false;
        btn.textContent = '로그인';
        return;
    }

    const displayName = DISPLAY_NAME_MAP[data.name] || data.name;
    currentUser = { id: data.id, name: displayName, loginName: data.name, role: data.role };
    localStorage.setItem('klp_user', JSON.stringify(currentUser));
    updateSidebarUser();
    showApp();
}

function handleLogout() {
    localStorage.removeItem('klp_user');
    currentUser = null;
    showLogin();
}

function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

async function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    // 모든 초기 데이터 로드를 병렬로 (서로 독립적). 순차 await 9개 → 한 번의 라운드트립 시간으로 단축.
    const profilesP = sb.from('profiles').select('name, role').then(({ data }) => { if (data) allProfiles = data; });
    await Promise.all([
        profilesP,
        loadDomesticProjectsFromDb(),
        loadDailyTasksFromDb(),
        loadDeliveriesFromDb(),
        loadClientsFromDb(),
        loadClientsOverseasFromDb(),
        loadMarketingCampaignsFromDb(),
        loadProductCategoriesFromDb(),
        loadProductsFromDb(),
        loadProposalsFromDb(),
    ]);
    subscribeDailyTasks();
    subscribeAllRealtime();
    renderAll();
    // 사이드바 URL 바로가기: 카테고리 열림 상태 적용 + 사용자 추가 URL 로드
    try { applyUrlCategoryOpenState(); } catch (e) {}
    loadUrlShortcuts().catch(e => console.warn(e));
    // URL 해시 → 탭 전환 (새로고침 시 탭 유지, 문서생성기에서 이동해온 경우 등)
    const hash = location.hash.replace('#', '');
    if (hash.startsWith('planning/p-')) {
        const pid = parseInt(hash.slice('planning/p-'.length), 10);
        if (!isNaN(pid)) currentPlanningProjectId = pid;
        switchTab(`planning-${currentPlanningMode}`, true);
    } else if (hash === 'planning-company' || hash === 'planning-funding' || hash === 'planning-personal' || hash === 'planning') {
        const target = hash === 'planning' ? `planning-${currentPlanningMode}` : hash;
        switchTab(target, true);
    } else if (hash && document.getElementById('tab-' + hash)) {
        switchTab(hash, true); // fromHistory=true → pushState 안 함
    } else {
        // 초기 home 상태도 history에 기록해두어 뒤로가기가 자연스럽게 동작
        history.replaceState({ tab: 'home' }, '', '#home');
    }
    // 문서생성기에서 넘어온 프로젝트 프리필 처리
    try {
        const pending = localStorage.getItem('klp_project_prefill');
        if (pending) {
            localStorage.removeItem('klp_project_prefill');
            window._projectPrefill = JSON.parse(pending);
            switchTab('projects-domestic');
            openModal('project-domestic');
        }
    } catch (e) { console.error(e); }
}

// Enter key to login
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') {
        handleLogin();
    }
});

// ===== Data =====
// 국내 프로젝트
const domesticProjects = [
    { id: 1, name: "러쉬 성수동 제안", client: "러쉬", supplier: "", status: "진행 중", priority: "🔴 긴급", category: "국내 주문", assignees: ["이현주"], revenue: 0, startDate: "2026-04-07", deadline: "2026-04-10", checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "내일까지 제안서 준다고 함" },
    { id: 2, name: "지플러스타워 골드바 감사패", client: "지플러스타워", supplier: "", status: "진행 중", priority: "🟡 높음", category: "국내 주문", assignees: ["김현호"], revenue: 0, startDate: "2026-03-19", deadline: "2026-04-15", checks: { design: true, workOrder: true, advancePayment: true, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "견적 발송 완료" },
    { id: 3, name: "미니클락 스토어팜 판매 계획", client: "자체", supplier: "", status: "진행 중", priority: "🟢 보통", category: "자체 브랜드", assignees: ["이현주", "김현호"], revenue: 0, startDate: "2026-03-10", deadline: "2026-04-30", checks: { design: true, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "빈티지 시계 + 미니클락 상세 계획 작성" },
    { id: 4, name: "굿즈덕 클로드 리뉴얼", client: "자체", supplier: "", status: "진행 중", priority: "🟢 보통", category: "자체 브랜드", assignees: ["김현호"], revenue: 0, startDate: "2026-04-01", deadline: "2026-04-30", checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "" },
    { id: 6, name: "빵 주문서 양식 제작", client: "본사", supplier: "", status: "완료", priority: "🟢 보통", category: "기타", assignees: ["김현호"], revenue: 0, startDate: "2026-03-25", deadline: "2026-03-31", checks: { design: true, workOrder: true, advancePayment: true, finalPayment: true, invoice: true, supplierPayment: true, delivered: true }, memo: "완료" },
    { id: 7, name: "회사 재고 소진 프로젝트", client: "자체", supplier: "", status: "진행 중", priority: "🟡 높음", category: "자체 브랜드", assignees: ["이현주", "김현호"], revenue: 0, startDate: "2026-03-12", deadline: "2026-12-31", checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "2026년 재고소진의 해" },
    { id: 8, name: "제안서 DB 구축", client: "본사", supplier: "", status: "시작 전", priority: "🟢 보통", category: "기타", assignees: ["이현주"], revenue: 0, startDate: "", deadline: "2026-04-20", checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "" },
];

// 해외 프로젝트 (하드코딩, DB 미연동)
const overseasProjects = [];

// 홈 등에서 전체 프로젝트 참조용
const projects = [...domesticProjects, ...overseasProjects];

let dailyTasks = [];
let deliveries = [];
let clients = [];

// 상품 DB (제안서 시스템) — Supabase `products` 테이블 연동
// products.sql 참조. loadProductsFromDb() 가 showApp() 진입 시 채움.
let productsDB = [];
let currentProductCategory = 'all';
let currentProductSearch = '';

// 제안서 (제안서 시스템) — Supabase `proposals` 테이블 연동
// proposals.sql 참조. loadProposalsFromDb() 가 showApp() 진입 시 채움.
let proposals = [];
let currentProposalStatus = 'all';
let currentProposalSearch = '';
let clientSearch = '';
let clientPage = 1;
const CLIENTS_PER_PAGE = 50;
let clientCategoryFilter = 'all';           // 'all' | '매출처' | '매입처' | '공란'
let clientSort = { field: null, dir: 'asc' }; // 컬럼 헤더 클릭 정렬

// 해외 거래처 (자료실)
let clientsOverseas = [];
let clientOverseasSearch = '';

// 마케팅 (업무)
let marketingCampaigns = [];
let marketingSearch = '';
const MARKETING_DISTRIBUTORS = ['김관택', '이현주', '김현호'];     // 로그인 이름 기준
const MARKETING_CHANNEL_OPTIONS = ['카카오톡', '문자', '이메일', '유튜브', 'X', '인스타', '블로그', '페이스북', '기타'];
const expandedProjectIds = new Set();

// ===== State =====
let currentDate = new Date();
let currentPersonFilter = 'viewall';
let weekOffset = 0;
let monthOffset = 0;
let currentDomesticFilter = 'all';
let currentOverseasFilter = 'all';
let currentDeliveryTypeFilter = 'all';
let currentDeliverySearch = '';
// 택배 기본 필터: 이번 달 (전체 표시는 1,800건+ 렌더로 무거워서 기본은 월별)
let currentDeliveryYear = String(new Date().getFullYear());
let currentDeliveryMonth = String(new Date().getMonth() + 1).padStart(2, '0');

// ===== Page Titles =====
const pageTitles = {
    home: '홈',
    planning: '프로젝트',
    'projects-temp': '매입매출 — 견적 의뢰',
    'projects-domestic': '매입매출 — 국내',
    'projects-overseas': '매입매출 — 해외',
    daily: '일일계획표',
    delivery: '택배 관리',
    marketing: '마케팅',
    'product-db': '상품 DB',
    proposals: '제안서 관리',
    docs: '회사 문서',
    manual: '회사 매뉴얼',
    'ceo-vision': '경영목표',
    clients: '국내 거래처 DB',
    'clients-overseas': '해외 거래처 DB',
    marketdb: '중고마켓DB',
    quotes: '견적서 만들기',
    planning: '프로젝트',
    'planning-company': '회사 프로젝트',
    'planning-funding': '펀딩 프로젝트',
    'planning-personal': '개인 프로젝트'
};

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    setupTheme();
    setupTopbar();
    setupSidebar();
    setupTabs();
    setupFilters();
    setupDateNav();
    setupSearch();
    setupShortcuts();
    setupMarketdbHandlers();
    setupNavTooltips();
    checkAuth();
});

// 사이드바 메뉴 hover 시 오른쪽에 설명 툴팁 표시
// .sidebar 내 [data-tip] 요소에 대해 delegation 으로 동작 — 동적으로 추가되는 URL 바로가기 등에도 자동 적용
function setupNavTooltips() {
    let tipEl = null;
    let showTimer = null;

    const hide = () => {
        clearTimeout(showTimer);
        if (tipEl) tipEl.classList.remove('show');
    };

    const show = (el) => {
        const text = el.getAttribute('data-tip');
        if (!text) return;
        if (!tipEl) {
            tipEl = document.createElement('div');
            tipEl.className = 'nav-tooltip';
            document.body.appendChild(tipEl);
        }
        tipEl.textContent = text;
        const rect = el.getBoundingClientRect();
        tipEl.style.left = (rect.right + 12) + 'px';
        tipEl.style.top = (rect.top + rect.height / 2) + 'px';
        tipEl.classList.add('show');
    };

    document.addEventListener('mouseover', (e) => {
        const el = e.target.closest('.sidebar [data-tip]');
        if (!el) return;
        clearTimeout(showTimer);
        showTimer = setTimeout(() => show(el), 300);
    });
    document.addEventListener('mouseout', (e) => {
        const el = e.target.closest('.sidebar [data-tip]');
        if (!el) return;
        // 같은 [data-tip] 내부로 이동하는 경우는 무시
        if (e.relatedTarget && el.contains(e.relatedTarget)) return;
        hide();
    });

    // 사이드바 스크롤 / 탭 전환 / 창 리사이즈 시 툴팁 즉시 제거
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (sidebarNav) sidebarNav.addEventListener('scroll', hide);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
}

// ===== Theme (light / dark) =====
function setupTheme() {
    const saved = localStorage.getItem('klp_theme') || 'light';
    applyTheme(saved);
    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.addEventListener('click', () => {
            const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            applyTheme(cur === 'dark' ? 'light' : 'dark');
        });
    }
}

// 리틀리 링크 클릭 시 URL을 클립보드에 복사 (새 탭은 그대로 열림 — preventDefault 안 함)
function copyLittlyLink(url, name) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            showToast(`${name} 링크 복사됨 (${url})`);
        }).catch(() => {
            showToast('복사 실패 — 직접 복사해주세요');
        });
    } else {
        // fallback: 임시 textarea
        try {
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast(`${name} 링크 복사됨`);
        } catch (e) {
            showToast('복사 실패');
        }
    }
}

// =====================================
// 사이드바 URL 바로가기 (카테고리 토글 + 사용자 추가 URL)
// =====================================
const URL_OPEN_STATE_KEY = 'klp_url_open_cats';
let urlShortcuts = [];

function getOpenUrlCats() {
    try { return new Set(JSON.parse(localStorage.getItem(URL_OPEN_STATE_KEY) || '[]')); }
    catch (e) { return new Set(); }
}
function saveOpenUrlCats(set) {
    try { localStorage.setItem(URL_OPEN_STATE_KEY, JSON.stringify([...set])); } catch (e) {}
}
function applyUrlCategoryOpenState() {
    const opens = getOpenUrlCats();
    document.querySelectorAll('#urlShortcutsGroup .nav-sub-group[data-url-category]').forEach(g => {
        const cat = g.dataset.urlCategory;
        if (opens.has(cat)) g.classList.remove('collapsed');
        else g.classList.add('collapsed');
    });
}
function toggleUrlCategoryGroup(labelEl) {
    const grp = labelEl.closest('.nav-sub-group');
    if (!grp) return;
    grp.classList.toggle('collapsed');
    const cat = grp.dataset.urlCategory;
    if (!cat) return;
    const opens = getOpenUrlCats();
    if (grp.classList.contains('collapsed')) opens.delete(cat);
    else opens.add(cat);
    saveOpenUrlCats(opens);
}

async function loadUrlShortcuts() {
    try {
        const { data, error } = await sb.from('url_shortcuts').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true });
        if (error) throw error;
        urlShortcuts = data || [];
        renderUrlShortcuts();
    } catch (err) {
        console.warn('URL 바로가기 로드 실패 (테이블 없음?):', err.message);
    }
}

function urlShortcutItemHtml(s) {
    const url = (s.url || '').replace(/"/g, '&quot;');
    const title = escHtml(s.title || '');
    return `<div class="url-user-row">
        <a class="nav-item nav-sub-item nav-external" href="${url}" target="_blank" rel="noopener" onclick="copyLittlyLink('${url.replace(/'/g, '\\\'')}','${(s.title || '').replace(/'/g, '\\\'')}')">
            <span>${title}</span>
            <svg class="external-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
        </a>
        <button class="url-edit-btn" onclick="event.stopPropagation();openUrlShortcutModal(${s.id})" title="편집">✏️</button>
    </div>`;
}

function renderUrlShortcuts() {
    const group = document.getElementById('urlShortcutsGroup');
    if (!group) return;

    // 1. 기존 하드코딩 카테고리들에 있는 사용자 추가 항목(.url-user-row) 모두 제거
    group.querySelectorAll('.nav-sub-group[data-url-category] .url-user-row').forEach(el => el.remove());

    // 2. 커스텀 카테고리 컨테이너 비우기
    const customRoot = document.getElementById('customUrlCategories');
    if (customRoot) customRoot.innerHTML = '';

    // 3. 카테고리별로 그룹핑
    const groupsByCat = {};
    urlShortcuts.forEach(s => {
        const c = (s.category || '기타').trim() || '기타';
        if (!groupsByCat[c]) groupsByCat[c] = [];
        groupsByCat[c].push(s);
    });

    // 4. 각 카테고리 렌더
    Object.entries(groupsByCat).forEach(([cat, items]) => {
        const existing = group.querySelector(`.nav-sub-group[data-url-category="${CSS.escape(cat)}"]`);
        if (existing) {
            // 기존 하드코딩 카테고리에 항목 추가
            const html = items.map(urlShortcutItemHtml).join('');
            existing.insertAdjacentHTML('beforeend', html);
        } else if (customRoot) {
            // 새 카테고리 생성
            const itemsHtml = items.map(urlShortcutItemHtml).join('');
            const catEsc = escHtml(cat);
            const catAttr = cat.replace(/"/g, '&quot;');
            customRoot.insertAdjacentHTML('beforeend', `
                <div class="nav-sub-group collapsed" data-url-category="${catAttr}">
                    <div class="nav-sub-label" onclick="toggleUrlCategoryGroup(this)">
                        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                        <span>${catEsc}</span>
                        <svg class="nav-caret" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"/></svg>
                    </div>
                    ${itemsHtml}
                </div>`);
        }
    });

    // 5. 열림 상태 복원
    applyUrlCategoryOpenState();
}

function openUrlShortcutModal(id) {
    const isEdit = id != null;
    const s = isEdit ? urlShortcuts.find(x => x.id === id) : null;
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    if (!body) return;
    title.textContent = isEdit ? 'URL 편집' : '새 URL 추가';

    // 카테고리 자동완성: 기존 하드코딩 + 사용자 추가
    const hardcodedCats = ['마케팅채널', '쇼핑몰', '리틀리'];
    const userCats = [...new Set(urlShortcuts.map(x => x.category).filter(Boolean))];
    const allCats = [...new Set([...hardcodedCats, ...userCats])];

    body.innerHTML = `
        <div class="form-section-title">🔗 ${isEdit ? 'URL 편집' : 'URL 추가'}</div>
        <div class="form-group">
            <label class="form-label">제목 <span style="color:var(--red)">*</span></label>
            <input id="urlShortcutTitle" class="form-input" placeholder="표시될 이름" value="${escHtml(s ? s.title || '' : '')}">
        </div>
        <div class="form-group">
            <label class="form-label">URL <span style="color:var(--red)">*</span></label>
            <input id="urlShortcutUrl" class="form-input" placeholder="https://..." value="${escHtml(s ? s.url || '' : '')}">
        </div>
        <div class="form-group">
            <label class="form-label">카테고리 <span style="color:var(--red)">*</span></label>
            <input id="urlShortcutCategory" class="form-input" list="urlCatDatalist" placeholder="예: 마케팅채널, 쇼핑몰 — 또는 새 카테고리 입력" value="${escHtml(s ? s.category || '' : '')}">
            <datalist id="urlCatDatalist">${allCats.map(c => `<option value="${escHtml(c)}">`).join('')}</datalist>
            <div style="font-size:11px;color:var(--gray-500);margin-top:4px">기존 카테고리를 선택하거나 새 카테고리 이름을 입력하세요.</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px">
            ${isEdit ? `<button class="btn-export" onclick="deleteUrlShortcut(${id})" style="color:var(--red);border-color:var(--red)">삭제</button>` : ''}
            <button class="form-submit" onclick="saveUrlShortcut(${isEdit ? id : 'null'})" style="flex:1">${isEdit ? '수정 저장' : '추가'}</button>
        </div>
    `;
    document.getElementById('modalOverlay').classList.add('show');
    openModalHistory();
}

async function saveUrlShortcut(id) {
    const title = (document.getElementById('urlShortcutTitle').value || '').trim();
    const url = (document.getElementById('urlShortcutUrl').value || '').trim();
    const category = (document.getElementById('urlShortcutCategory').value || '').trim();
    if (!title) { showToast('제목을 입력하세요'); return; }
    if (!url) { showToast('URL을 입력하세요'); return; }
    if (!category) { showToast('카테고리를 입력하세요'); return; }
    const payload = { title, url, category };
    try {
        if (id) {
            const { data, error } = await sb.from('url_shortcuts').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single();
            if (error) throw error;
            const idx = urlShortcuts.findIndex(x => x.id === id);
            if (idx >= 0) urlShortcuts[idx] = data;
            showToast('URL이 수정되었습니다');
        } else {
            const { data, error } = await sb.from('url_shortcuts').insert(payload).select().single();
            if (error) throw error;
            urlShortcuts.push(data);
            // 추가한 카테고리는 열린 상태로
            const opens = getOpenUrlCats();
            opens.add(category);
            saveOpenUrlCats(opens);
            showToast('URL이 추가되었습니다');
        }
        closeModal();
        renderUrlShortcuts();
    } catch (err) {
        console.error(err);
        showToast('저장 실패: ' + err.message);
    }
}

async function deleteUrlShortcut(id) {
    if (!confirm('이 URL을 삭제할까요?')) return;
    try {
        const { error } = await sb.from('url_shortcuts').delete().eq('id', id);
        if (error) throw error;
        urlShortcuts = urlShortcuts.filter(x => x.id !== id);
        closeModal();
        renderUrlShortcuts();
        showToast('삭제되었습니다');
    } catch (err) {
        console.error(err);
        showToast('삭제 실패: ' + err.message);
    }
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('klp_theme', theme);
}

// 현재 active 탭에서 F2 누를 때 실행할 "새로 만들기" 액션 매핑.
// 새 메뉴 추가 시 여기에 한 줄 넣으면 F2 + 버튼 툴팁 자동 적용됨.
const F2_NEW_ACTIONS = [
    ['tab-delivery',           () => openModal('delivery')],
    ['tab-clients',            () => openModal('client')],
    ['tab-clients-overseas',   () => openModal('client-overseas')],
    ['tab-projects-domestic',  () => openModal('project-domestic')],
    ['tab-projects-overseas',  () => openModal('project-overseas')],
    ['tab-quotes',             () => openQuoteModal()],
    ['tab-marketdb',           () => openMarketModal(null, null)],
    ['tab-product-db',         () => openProductDBModal(null)],
    ['tab-proposals',          () => openProposalEditor(null)],
    ['tab-marketing',          () => openMarketingModal(null)],
    // 협업 프로젝트 — 펀딩 모드에서만 F2 활성 (회사/개인은 기간 섹션별 버튼이 있어 F2 제외)
    ['tab-planning',           () => {
        if (currentPlanningMode !== 'funding') return;
        if (currentPlanningProjectId == null) {
            openFundingPlanningModal(null);
        } else {
            openNewPlanningPostForColumn('todo');
        }
    }]
];

function setupShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
            // 입력 필드에서 F2 누른 경우는 그대로 브라우저 기본 동작 — 만약 우리가 모달 열고 싶으면 아래 로직 수행
            for (const [tabId, action] of F2_NEW_ACTIONS) {
                const el = document.getElementById(tabId);
                if (el && el.classList.contains('active')) {
                    e.preventDefault();
                    try { action(); } catch (err) { console.error('F2 action error:', err); }
                    return;
                }
            }
        }
        if (e.key === 'Escape') {
            const overlay = document.getElementById('modalOverlay');
            if (overlay && overlay.classList.contains('show')) {
                e.preventDefault();
                closeModal();
            }
        }
    });
}

// ===== Topbar =====
function setupTopbar() {
    const now = new Date();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    document.getElementById('topbarDate').textContent =
        `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
}

// ===== Sidebar =====
function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburger');
    const closeBtn = document.getElementById('sidebarClose');

    hamburger.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay.classList.add('show');
    });

    const closeSidebar = () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    };

    closeBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
}

// ===== Tabs =====
function setupTabs() {
    document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
}

function switchTab(tabId, fromHistory = false) {
    // 프로젝트 서브메뉴(회사/펀딩/개인) 분기 — 실제 DOM 탭은 'planning' 하나를 공유
    const planningSubMode = tabId === 'planning-company' ? 'company'
                          : tabId === 'planning-funding' ? 'funding'
                          : tabId === 'planning-personal' ? 'personal' : null;
    const actualTabId = planningSubMode ? 'planning' : tabId;

    // 존재하지 않는 탭이면 무시
    if (!document.getElementById(`tab-${actualTabId}`)) return;

    // 중고마켓DB 권한 체크 — 비인가 사용자는 홈으로 리다이렉트
    if (tabId === 'marketdb' && !marketdbCanAccess()) {
        showToast('접근 권한이 없습니다');
        tabId = 'home';
    }
    // 프로젝트(협업) 권한 체크
    if (planningSubMode && !planningCanAccessMode(planningSubMode)) {
        showToast('접근 권한이 없습니다');
        tabId = 'home';
    } else if (tabId === 'planning' && !planningCanAccess()) {
        showToast('접근 권한이 없습니다');
        tabId = 'home';
    }

    // 프로젝트 서브모드 반영
    if (planningSubMode) {
        currentPlanningMode = planningSubMode;
    }

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const navBtn = document.querySelector(`[data-tab="${tabId}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Update content
    document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
    const contentId = tabId === 'home' ? 'tab-home' : `tab-${planningSubMode ? 'planning' : tabId}`;
    const tab = document.getElementById(contentId);
    if (tab) tab.classList.add('active');

    // Update page title
    document.getElementById('pageTitle').textContent = pageTitles[tabId] || '';

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');

    // 탭 전환 시 스크롤 위로
    window.scrollTo(0, 0);
    const mainWrap = document.querySelector('.main-wrap');
    if (mainWrap) mainWrap.scrollTo(0, 0);

    // URL 해시 동기화 (브라우저 뒤로/앞으로 + 새로고침 시 탭 유지)
    if (!fromHistory) {
        const newHash = '#' + tabId;
        if (location.hash !== newHash) {
            history.pushState({ tab: tabId }, '', newHash);
        }
    }

    // 탭 전환 시 리스트/검색 상태를 초기화 (사용자가 이전에 남긴 필터·선택·페이지 초기화)
    try { resetTabState(tabId); } catch (e) { console.warn('resetTabState failed:', e); }

    // 임시 프로젝트 탭 열릴 때 DB 로드 + 인라인 초기화
    if (tabId === 'projects-temp') {
        loadTempProjects();
        const dateEl = document.getElementById('tempInDate');
        if (dateEl && !dateEl.value) dateEl.value = getTodayStr();
        buildTempClientDatalist();
    }

    // 중고마켓DB 탭 열릴 때 렌더
    if (tabId === 'marketdb') {
        try { renderMarketdb(); } catch (e) { console.error('renderMarketdb failed', e); }
    }

    // 프로젝트(계획/협업) 탭 열릴 때 렌더 (사이드바에서 클릭 시 목록으로 리셋)
    if (tabId === 'planning' || tabId === 'planning-company' || tabId === 'planning-funding' || tabId === 'planning-personal') {
        if (!fromHistory) currentPlanningProjectId = null;
        try { renderPlanning(); } catch (e) { console.error('renderPlanning failed', e); }
    }

    // 견적서 탭 열릴 때: DB 로드 + 리스트 렌더
    if (tabId === 'quotes') {
        loadQuotesFromDb().then(() => renderQuotes()).catch(e => console.error('loadQuotes failed', e));
    }

    // 제안서 탭에 사용자가 직접 진입(사이드바 클릭 등) 시 목록 뷰로 리셋.
    // fromHistory === true 인 경우(브라우저 back/forward, 모달 closeModal 의 history.back() 등)는
    // 사용자가 탭을 다시 누른 게 아니라 단순히 편집 중에 모달이 닫힌 상황일 수 있으므로 건드리지 않는다.
    if (tabId === 'proposals' && !fromHistory) {
        try {
            const ev = document.getElementById('proposalEditorView');
            const lv = document.getElementById('proposalListView');
            if (ev && lv && ev.style.display !== 'none') {
                editingProposal = null;
                ev.style.display = 'none';
                ev.innerHTML = '';
                lv.style.display = 'block';
                renderProposals();
            }
        } catch (e) { console.warn('proposal list reset failed:', e); }
    }
}

// 브라우저 뒤로/앞으로 → 모달 열려있으면 모달만 닫기, 아니면 탭 전환
window.addEventListener('popstate', () => {
    const modalOverlay = document.getElementById('modalOverlay');
    const detailOverlay = document.getElementById('detailOverlay');
    const modalOpen = modalOverlay && modalOverlay.classList.contains('show');
    const detailOpen = detailOverlay && detailOverlay.classList.contains('show');

    if (modalOpen) {
        closeModal(true);
        return;
    }
    if (detailOpen) {
        detailOverlay.classList.remove('show');
        return;
    }

    // 프로젝트(계획) 하위 경로: #planning/p-123 ↔ #planning(-company|-personal)
    const rawHash = (location.hash || '').replace('#', '');
    if (rawHash.startsWith('planning/p-')) {
        const id = parseInt(rawHash.slice('planning/p-'.length), 10);
        if (!isNaN(id)) {
            currentPlanningProjectId = id;
            switchTab(`planning-${currentPlanningMode}`, true);
            return;
        }
    }
    if ((rawHash === 'planning' || rawHash === 'planning-company' || rawHash === 'planning-funding' || rawHash === 'planning-personal') && currentPlanningProjectId != null) {
        currentPlanningProjectId = null;
        const target = rawHash === 'planning' ? `planning-${currentPlanningMode}` : rawHash;
        switchTab(target, true);
        return;
    }

    const hash = rawHash || 'home';
    if (hash === 'planning-company' || hash === 'planning-funding' || hash === 'planning-personal') {
        switchTab(hash, true);
        return;
    }
    if (document.getElementById('tab-' + hash)) {
        switchTab(hash, true);
    }
});

// ===== Filters =====
function setupFilters() {
    document.querySelectorAll('[data-dfilter]').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentDomesticFilter = chip.dataset.dfilter;
            renderDomesticProjects();
        });
    });
    document.querySelectorAll('[data-ofilter]').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentOverseasFilter = chip.dataset.ofilter;
            renderOverseasProjects();
        });
    });
    document.querySelectorAll('[data-dtype]').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentDeliveryTypeFilter = chip.dataset.dtype;
            renderDeliveries();
        });
    });
    // 상품 DB 카테고리 칩
    document.querySelectorAll('[data-pcat]').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentProductCategory = chip.dataset.pcat;
            renderProductDB();
        });
    });
    // 제안서 상태 칩
    document.querySelectorAll('[data-pstatus]').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentProposalStatus = chip.dataset.pstatus;
            renderProposals();
        });
    });
}

// ===== Date Nav =====
function setupDateNav() {
    document.getElementById('prevDate').addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() - 1);
        renderDaily();
    });
    document.getElementById('nextDate').addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() + 1);
        renderDaily();
    });
}

// ===== Search =====
function setupSearch() {
    document.getElementById('deliverySearch').addEventListener('input', e => {
        currentDeliverySearch = e.target.value.toLowerCase();
        renderDeliveries();
    });
    const clientSearchEl = document.getElementById('clientSearch');
    if (clientSearchEl) {
        clientSearchEl.addEventListener('input', e => {
            clientSearch = e.target.value;
            clientPage = 1;
            renderClients();
        });
    }
    const clientOverseasSearchEl = document.getElementById('clientOverseasSearch');
    if (clientOverseasSearchEl) {
        clientOverseasSearchEl.addEventListener('input', e => {
            clientOverseasSearch = e.target.value;
            renderClientsOverseas();
        });
    }
    const marketingSearchEl = document.getElementById('marketingSearch');
    if (marketingSearchEl) {
        marketingSearchEl.addEventListener('input', e => {
            marketingSearch = e.target.value;
            renderMarketing();
        });
    }
    const productSearchEl = document.getElementById('productSearch');
    if (productSearchEl) {
        productSearchEl.addEventListener('input', e => {
            currentProductSearch = e.target.value.toLowerCase();
            renderProductDB();
        });
    }
    const proposalSearchEl = document.getElementById('proposalSearch');
    if (proposalSearchEl) {
        proposalSearchEl.addEventListener('input', e => {
            currentProposalSearch = e.target.value.toLowerCase();
            renderProposals();
        });
    }
}

// ===== 탭 초기 상태 리셋 =====
// 다른 메뉴 갔다 돌아왔을 때 검색·필터·페이지·선택 등을 모두 처음 상태로 되돌림.
// switchTab 에서 호출됨.
function resetTabState(tabId) {
    if (tabId === 'clients') {
        clientSearch = '';
        clientPage = 1;
        clientCategoryFilter = 'all';
        clientSort = { field: null, dir: 'asc' };
        if (typeof selectedClientIds !== 'undefined') selectedClientIds.clear();
        const searchEl = document.getElementById('clientSearch');
        if (searchEl) searchEl.value = '';
        document.querySelectorAll('#clientCategoryFilterBar .filter-chip').forEach(b => {
            b.classList.toggle('active', b.dataset.catFilter === 'all');
        });
        try { renderClients(); } catch (e) {}
    } else if (tabId === 'clients-overseas') {
        clientOverseasSearch = '';
        const searchEl = document.getElementById('clientOverseasSearch');
        if (searchEl) searchEl.value = '';
        try { renderClientsOverseas(); } catch (e) {}
    } else if (tabId === 'marketing') {
        marketingSearch = '';
        const searchEl = document.getElementById('marketingSearch');
        if (searchEl) searchEl.value = '';
        try { renderMarketing(); } catch (e) {}
    } else if (tabId === 'delivery') {
        currentDeliverySearch = '';
        const searchEl = document.getElementById('deliverySearch');
        if (searchEl) searchEl.value = '';
        try { renderDeliveries(); } catch (e) {}
    } else if (tabId === 'product-db') {
        currentProductSearch = '';
        const searchEl = document.getElementById('productSearch');
        if (searchEl) searchEl.value = '';
        try { renderProductDB(); } catch (e) {}
    } else if (tabId === 'proposals') {
        currentProposalSearch = '';
        const searchEl = document.getElementById('proposalSearch');
        if (searchEl) searchEl.value = '';
        try { renderProposals(); } catch (e) {}
    }
}

// ===== Render All =====
function renderAll() {
    renderHome();
    renderProjects();
    renderDaily();
    renderDeliveries();
    renderClients();
    renderClientsOverseas();
    renderMarketing();
    renderProductDB();
    renderProposals();
}

// =====================================
// HOME DASHBOARD
// =====================================
function renderHome() {
    const todayStr = fmtDate(currentDate);
    const activeCount = projects.filter(p => p.status === '진행 중').length;
    // 오늘 할 일 / 완료율은 로그인 사용자 본인 할 일 기준
    const myName = currentUser ? currentUser.name : null;
    const allTodayItems = dailyTasks.filter(t => t.date === todayStr);
    const myTodayItems = myName ? allTodayItems.filter(t => t.assignee === myName) : [];
    const myTodayDone = myTodayItems.filter(t => t.done).length;
    const rate = myTodayItems.length ? Math.round((myTodayDone / myTodayItems.length) * 100) : 0;
    const monthPrefix = todayStr.substring(0, 7); // YYYY-MM
    const monthDel = deliveries.filter(d => (d.date || '').startsWith(monthPrefix)).length;

    // 인사말 + 날짜
    const now = new Date();
    const hour = now.getHours();
    let greet = '안녕하세요';
    if (hour < 12) greet = '좋은 아침이에요';
    else if (hour < 18) greet = '좋은 오후예요';
    else greet = '좋은 저녁이에요';
    const _me = myName || '';
    const urgentProjCount = projects.filter(p => {
        if (!p.priority || !p.priority.includes('긴급') || p.status === '완료') return false;
        const owners = p.assignees || [];
        return owners.includes(_me) || owners.includes('전체');
    }).length;
    const urgentTaskCount = dailyTasks.filter(t => {
        if (!t.priority || !t.priority.includes('긴급') || t.done || t.date > todayStr) return false;
        return t.assignee === _me || t.assignee === '전체';
    }).length;
    const totalUrgent = urgentProjCount + urgentTaskCount;
    const greetTitleEl = document.getElementById('greetingTitle');
    const greetSubEl = document.getElementById('greetingSub');
    const greetDateEl = document.getElementById('greetingDate');
    if (greetTitleEl) greetTitleEl.textContent = `${myName || '환영합니다'}님, ${greet}`;
    if (greetSubEl) {
        greetSubEl.innerHTML = `오늘 할 일 <strong>${myTodayItems.length}건</strong>, 긴급 항목 <strong class="${totalUrgent > 0 ? 'urgent' : ''}">${totalUrgent}건</strong>이 있어요`;
    }
    if (greetDateEl) {
        const wk = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
        greetDateEl.textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${wk})`;
    }

    // Summary cards (이번 달 택배 카드는 HTML에서 제거됨)
    document.getElementById('activeProjects').textContent = activeCount;
    document.getElementById('todayTasks').textContent = myTodayItems.length;
    document.getElementById('completionRate').textContent = rate + '%';

    // 프로젝트 섹션 집계 — 홈에서 보여주는 planning 데이터 (비동기 로드)
    renderPlanningHomeSection();

    // Quick menu counts
    const qP = document.getElementById('qProjects'); if (qP) qP.textContent = `${activeCount}건 진행`;
    const qD = document.getElementById('qDaily'); if (qD) qD.textContent = `오늘 ${myTodayItems.length}건`;
    const qDel = document.getElementById('qDelivery'); if (qDel) qDel.textContent = `이번달 ${monthDel}건`;

    // 마감 상태 카드 3종 — 마감 초과 / 3일 이내 / 7일 이내
    // 프로젝트(전체) + 일일계획 할 일(본인/'전체' 공통, deadline 있고 미완료) 합산.
    const today0 = new Date(todayStr + 'T00:00:00');
    const meName = myName || '';
    const projDeadlines = projects
        .filter(p => p.status !== '완료' && p.deadline)
        .map(p => {
            const d = new Date(p.deadline + 'T00:00:00');
            const diff = Math.round((d - today0) / 86400000);
            return { kind: 'project', item: p, diff };
        });
    const taskDeadlines = dailyTasks
        .filter(t => {
            if (t.done || t.isDeadlineCopy) return false;
            if (!t.deadline && !t.date) return false;
            return t.assignee === meName || t.assignee === '전체';
        })
        .map(t => {
            const dl = t.deadline || t.date;
            const d = new Date(dl + 'T00:00:00');
            const diff = Math.round((d - today0) / 86400000);
            return { kind: 'task', item: { ...t, deadline: dl }, diff };
        });
    // 프로젝트를 먼저, 그 다음 할 일. 같은 종류 내에서는 마감일 빠른 순.
    const sortFn = (a, b) => {
        if (a.kind !== b.kind) return a.kind === 'project' ? -1 : 1;
        return a.diff - b.diff;
    };
    const deadlineList = [...projDeadlines, ...taskDeadlines];
    const overdueItems = deadlineList.filter(x => x.diff < 0).sort(sortFn);
    const soonItems = deadlineList.filter(x => x.diff >= 0 && x.diff <= 3).sort(sortFn);
    const weekItems = deadlineList.filter(x => x.diff > 3 && x.diff <= 7).sort(sortFn);

    const renderDeadlineCard = (items, listId, countId, kind) => {
        const listEl = document.getElementById(listId);
        const countEl = document.getElementById(countId);
        if (countEl) countEl.textContent = items.length;
        if (!listEl) return;
        if (items.length === 0) {
            listEl.innerHTML = `<div class="deadline-card-empty">해당 항목이 없습니다</div>`;
            return;
        }
        listEl.innerHTML = items.slice(0, 4).map(entry => {
            const diff = entry.diff;
            const isTask = entry.kind === 'task';
            const it = entry.item;
            let ddayLabel, ddayBg, ddayColor;
            if (kind === 'overdue') {
                ddayLabel = `D+${Math.abs(diff)}`;
                ddayBg = 'var(--red-light)'; ddayColor = 'var(--red)';
            } else if (kind === 'soon') {
                ddayLabel = diff === 0 ? 'D-DAY' : `D-${diff}`;
                ddayBg = 'var(--orange-light)'; ddayColor = 'var(--orange)';
            } else {
                ddayLabel = `D-${diff}`;
                ddayBg = 'var(--gray-100)'; ddayColor = 'var(--gray-700)';
            }
            const name = isTask ? it.task : ((it.client ? it.client + ' - ' : '') + it.name);
            const owner = isTask
                ? (it.assignee || '-')
                : (it.assignees && it.assignees.length ? it.assignees.join(', ') : (it.manager || '-'));
            const tag = isTask ? '할 일' : '매입매출';
            const tagColor = isTask ? 'var(--orange)' : 'var(--blue)';
            const tagBg = isTask ? 'var(--orange-light)' : 'var(--blue-light)';
            const onclick = isTask
                ? `closeModal();switchTab('daily');setTimeout(()=>openEditTask(${it.id}),100)`
                : `showProjectDetail(${it.id})`;
            return `<div class="deadline-card-row" onclick="${onclick}">
                <span class="dday" style="background:${ddayBg};color:${ddayColor}">${ddayLabel}</span>
                <span class="name"><span class="kind-tag" style="background:${tagBg};color:${tagColor}">${tag}</span> ${name}</span>
                <span class="meta">${owner} · ${fmtDisplay(it.deadline)}</span>
            </div>`;
        }).join('');
    };
    renderDeadlineCard(overdueItems, 'overdueList', 'overdueCount', 'overdue');
    renderDeadlineCard(soonItems, 'soonList', 'soonCount', 'soon');
    renderDeadlineCard(weekItems, 'weekList', 'weekCount', 'week');

    // Urgent — 본인 담당 + 전체(공통)만
    const me = myName || '';
    const urgentProjects = projects.filter(p => {
        if (!p.priority || !p.priority.includes('긴급')) return false;
        if (p.status === '완료') return false;
        const owners = p.assignees || [];
        return owners.includes(me) || owners.includes('전체');
    });
    const urgentTasks = dailyTasks.filter(t => {
        if (!t.priority || !t.priority.includes('긴급')) return false;
        if (t.done) return false;
        if (t.date > todayStr) return false;
        return t.assignee === me || t.assignee === '전체';
    });
    document.getElementById('urgentCount').textContent = urgentProjects.length + urgentTasks.length;

    let urgentHtml = '';
    urgentProjects.forEach(p => {
        urgentHtml += `<div class="urgent-item" onclick="showProjectDetail(${p.id})">
            <div class="urgent-dot"></div>
            <div class="urgent-info">
                <div class="urgent-name">${p.name}</div>
                <div class="urgent-sub">${p.assignees.join(', ')} · 마감 ${fmtDisplay(p.deadline)}</div>
            </div>
            <span class="urgent-type">매입매출</span>
        </div>`;
    });
    urgentTasks.forEach(t => {
        urgentHtml += `<div class="urgent-item" onclick="switchTab('daily')">
            <div class="urgent-dot"></div>
            <div class="urgent-info">
                <div class="urgent-name">${t.task}</div>
                <div class="urgent-sub">${t.assignee} · ${fmtDisplay(t.date)}</div>
            </div>
            <span class="urgent-type">할 일</span>
        </div>`;
    });
    document.getElementById('urgentList').innerHTML = urgentHtml || empty('긴급 항목이 없습니다');

    // Today schedule — 로그인 사용자 본인 할 일만
    const sorted = [...myTodayItems].sort((a, b) => a.done - b.done);
    let taskHtml = '';
    sorted.forEach(t => {
        taskHtml += `<div class="dash-task-item ${t.done ? 'completed' : ''}">
            <div class="dash-task-check ${t.done ? 'done' : ''}"></div>
            <span class="dash-task-name">${t.task}</span>
            <span class="dash-task-person">${t.assignee}</span>
        </div>`;
    });
    document.getElementById('todaySchedule').innerHTML = taskHtml || empty('오늘 할 일이 없습니다');

    // Project list — 진행 중 프로젝트, 마감 임박순
    const activeProjects = projects
        .filter(p => p.status === '진행 중')
        .sort((a, b) => {
            if (!a.deadline) return 1;
            if (!b.deadline) return -1;
            return a.deadline.localeCompare(b.deadline);
        })
        .slice(0, 6);
    let projHtml = '';
    activeProjects.forEach(p => {
        const owner = p.manager || (p.assignees && p.assignees.length ? p.assignees.join(', ') : '-');
        let ddayHtml = '';
        if (p.deadline) {
            const d0 = new Date(todayStr + 'T00:00:00');
            const dd = new Date(p.deadline + 'T00:00:00');
            const diff = Math.round((dd - d0) / 86400000);
            let label, bg, color;
            if (diff < 0) { label = `D+${Math.abs(diff)}`; bg = 'var(--red-light)'; color = 'var(--red)'; }
            else if (diff === 0) { label = 'D-DAY'; bg = 'var(--red-light)'; color = 'var(--red)'; }
            else if (diff <= 3) { label = `D-${diff}`; bg = 'var(--orange-light)'; color = 'var(--orange)'; }
            else { label = `D-${diff}`; bg = 'var(--blue-light)'; color = 'var(--blue)'; }
            ddayHtml = `<span class="dash-proj-dday" style="background:${bg};color:${color}">${label}</span>`;
        } else {
            ddayHtml = `<span class="dash-proj-dday" style="background:var(--gray-100);color:var(--gray-500)">미정</span>`;
        }
        projHtml += `<div class="dash-proj-item" onclick="showProjectDetail(${p.id})">
            <div class="dash-proj-info">
                <div class="dash-proj-name">${p.name}</div>
                <div class="dash-proj-meta">담당 ${owner}${p.deadline ? ' · 마감 ' + fmtDisplay(p.deadline) : ''}</div>
            </div>
            ${ddayHtml}
        </div>`;
    });
    document.getElementById('dashProjects').innerHTML = projHtml || empty('진행 중 매입매출 없음');
}

// =====================================
// PROJECTS
// =====================================
const CHECK_ITEMS = [
    { key: 'design', label: '디확 컨펌', short: '디확' },
    { key: 'workOrder', label: '작지 발송', short: '작지' },
    { key: 'advancePayment', label: '선금 입금', short: '선금' },
    { key: 'finalPayment', label: '잔금 입금', short: '잔금' },
    { key: 'invoice', label: '계산서 발행', short: '계산' },
    { key: 'supplierPayment', label: '공급처 송금', short: '공급' },
    { key: 'delivered', label: '납품 완료', short: '납품' }
];

function renderProjectList(dataArr, filter, tableBodyId, cardGridId) {
    const filtered = filter === 'all' ? dataArr : dataArr.filter(p => p.status === filter);
    const checkSvg = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`;

    // 각 프로젝트의 table row / card HTML 생성
    const rowHtmlById = new Map();
    const cardHtmlById = new Map();
    filtered.forEach(p => {
        const checks = p.checks || {};
        const checkDots = CHECK_ITEMS.map(item => {
            const v = checks[item.key];
            return `<div class="check-item" onclick="event.stopPropagation();toggleProjectCheck(${p.id},'${item.key}')" style="cursor:pointer"><div class="check-dot ${v ? 'done' : ''}" title="${item.label} (클릭하여 토글)">${v ? checkSvg : ''}</div><span class="check-label">${item.short}</span></div>`;
        }).join('');

        // 매출액 / 매입액 / 마진 — 컬러 강조 pill 스타일
        const purchaseTotal = p.supplierRevenue || 0;
        const marginVal = (p.revenue || 0) - purchaseTotal;
        const marginPctVal = p.revenue > 0 ? Math.round((marginVal / p.revenue) * 100) : 0;
        const supplierDisplay = p.supplier || '-';
        const pill = (bg, fg, text) => `<span style="display:inline-block;padding:4px 10px;border-radius:6px;background:${bg};color:${fg};font-weight:800;font-size:13px;white-space:nowrap">${text}</span>`;
        const revenueStr = pill('#E8F4FD', '#1B64DA', (p.revenue || 0).toLocaleString() + '원');
        const purchaseStr = purchaseTotal > 0
            ? pill('#FFF2E6', '#E67E22', purchaseTotal.toLocaleString() + '원')
            : '<span style="color:var(--text-tertiary)">-</span>';
        const marginStr = purchaseTotal > 0
            ? (marginVal >= 0
                ? pill('#E8F8EF', '#12B76A', marginVal.toLocaleString() + '원 (' + marginPctVal + '%)')
                : pill('#FEECEC', '#E03131', marginVal.toLocaleString() + '원 (' + marginPctVal + '%)'))
            : '<span style="color:var(--text-tertiary)">-</span>';

        const ownerStr = p.manager || (p.assignees && p.assignees.length ? p.assignees.join(', ') : '-');
        const statusCls = statusBadgeClass(p.status);
        const statusOptsHtml = ['시작 전', '진행 중', '완료'].map(s => `<option value="${s}"${s === p.status ? ' selected' : ''}>${s}</option>`).join('');
        rowHtmlById.set(p.id, `<tr onclick="projectRowClick(${p.id})" ondblclick="projectRowDblClick(${p.id})" style="cursor:pointer">
            <td><select class="status-select badge ${statusCls}" onclick="event.stopPropagation()" onchange="updateProjectStatus(${p.id}, this.value)">${statusOptsHtml}</select></td>
            <td><strong>${p.client || '-'}</strong></td>
            <td>${supplierDisplay}</td>
            <td>${p.name}</td>
            <td>${ownerStr}</td>
            <td>${revenueStr}</td>
            <td>${purchaseStr}</td>
            <td>${marginStr}</td>
            <td>${p.deadline ? fmtDisplay(p.deadline) : '-'}</td>
            <td><div class="checks-row">${checkDots}</div></td>
            <td><button class="edit-btn" onclick="event.stopPropagation();openEditProject(${p.id})">편집</button></td>
        </tr>`);

        cardHtmlById.set(p.id, `<div class="resp-card" onclick="showProjectDetail(${p.id})">
            <div class="resp-card-top">
                <div class="resp-card-title">${p.client || '-'} — ${p.name}</div>
                <span class="badge ${statusBadgeClass(p.status)}">${p.status}</span>
            </div>
            <div class="resp-card-meta">
                ${p.supplier ? `<div class="resp-card-row">매입처: ${p.supplier}</div>` : ''}
                <div class="resp-card-row"><strong>${p.assignees.join(', ')}</strong></div>
                <div class="resp-card-row" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
                    ${revenueStr}${purchaseTotal > 0 ? purchaseStr + marginStr : ''}
                </div>
                <div class="resp-card-row">마감 ${p.deadline ? fmtDisplay(p.deadline) : '-'}</div>
            </div>
        </div>`);
    });

    let tableHtml = '';
    let cardHtml = '';
    const colspan = 11;
    if (filter === 'all') {
        // 전체보기 — 시작 전 / 진행 중 / 완료 세 섹션으로 나눠서 출력
        const normalize = s => (s || '').replace(/\s+/g, '');
        const sections = [
            { key: '시작 전', color: '#A9B1BB', bg: '#F7F8FA' },
            { key: '진행 중', color: '#7CA9E6', bg: '#F3F8FE' },
            { key: '완료', color: '#8FD4AE', bg: '#F2FBF6' }
        ];
        // 정규화 매칭으로 버킷 분류 — 알 수 없는 상태는 '시작 전'에 합류
        const buckets = { '시작 전': [], '진행 중': [], '완료': [] };
        filtered.forEach(p => {
            const n = normalize(p.status);
            if (n === normalize('진행 중')) buckets['진행 중'].push(p);
            else if (n === normalize('완료')) buckets['완료'].push(p);
            else buckets['시작 전'].push(p);
        });
        sections.forEach(sec => {
            const group = buckets[sec.key];
            tableHtml += `<tr class="section-divider"><td colspan="${colspan}" style="padding:14px 0 6px 0;border:none;background:var(--white)"><div style="display:inline-flex;align-items:center;gap:10px;background:${sec.bg};color:${sec.color};font-weight:700;font-size:14px;padding:8px 16px;border-radius:8px;border:1px solid ${sec.color}55"><span>${sec.key}</span><span style="color:${sec.color};opacity:.8;font-weight:700">${group.length}</span></div></td></tr>`;
            if (group.length === 0) {
                tableHtml += `<tr class="section-empty"><td colspan="${colspan}" style="color:var(--text-tertiary);font-size:12px;padding:14px;text-align:center;background:var(--white)">해당 상태의 프로젝트가 없습니다</td></tr>`;
            } else {
                group.forEach(p => { tableHtml += rowHtmlById.get(p.id); });
            }
            cardHtml += `<div class="card-section-header" style="grid-column:1/-1;margin-top:10px"><div style="display:inline-flex;align-items:center;gap:10px;background:${sec.bg};color:${sec.color};font-weight:700;font-size:14px;padding:8px 16px;border-radius:8px;border:1px solid ${sec.color}55"><span>${sec.key}</span><span style="color:${sec.color};opacity:.8">${group.length}</span></div></div>`;
            if (group.length === 0) {
                cardHtml += `<div style="grid-column:1/-1;color:var(--text-tertiary);font-size:12px;padding:8px 14px">해당 상태의 프로젝트가 없습니다</div>`;
            } else {
                group.forEach(p => { cardHtml += cardHtmlById.get(p.id); });
            }
        });
    } else {
        filtered.forEach(p => {
            tableHtml += rowHtmlById.get(p.id);
            cardHtml += cardHtmlById.get(p.id);
        });
    }

    document.getElementById(tableBodyId).innerHTML = tableHtml;
    document.getElementById(cardGridId).innerHTML = cardHtml;
}

function projectRowClick(id) {
    showProjectDetail(id);
}
function projectRowDblClick(id) {
    openEditProject(id);
}

async function updateProjectStatus(id, newStatus) {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    p.status = newStatus;
    const update = { status: newStatus };
    // 상태를 '완료'로 바꾸면 체크리스트 전체 체크
    if (newStatus === '완료') {
        if (!p.checks) p.checks = {};
        CHECK_ITEMS.forEach(item => { p.checks[item.key] = true; });
        update.checks = p.checks;
    }
    renderProjects();
    if (p.category !== '해외 주문') {
        try {
            const { error } = await sb.from('projects_domestic').update(update).eq('id', id);
            if (error) throw error;
            showToast('상태가 변경되었습니다');
        } catch (err) {
            console.error('상태 저장 실패', err);
            showToast('DB 저장 실패: ' + err.message);
        }
    }
}

async function toggleProjectCheck(id, key) {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    if (!p.checks) p.checks = {};
    p.checks[key] = !p.checks[key];
    const update = { checks: p.checks };
    // 체크리스트 전체 체크 시 상태를 '완료'로 자동 변경
    const allChecked = CHECK_ITEMS.every(item => !!p.checks[item.key]);
    if (allChecked && p.status !== '완료') {
        p.status = '완료';
        update.status = '완료';
    }
    renderProjects();
    if (p.category !== '해외 주문') {
        try {
            const { error } = await sb.from('projects_domestic').update(update).eq('id', id);
            if (error) throw error;
        } catch (err) {
            console.error('체크 저장 실패', err);
            showToast('DB 저장 실패: ' + err.message);
        }
    }
}

// 입력칸 천단위 콤마 포맷 및 숫자 추출
function fmtProjectNumberInput(el) {
    const raw = String(el.value).replace(/[^0-9]/g, '');
    el.value = raw ? parseInt(raw).toLocaleString() : '';
}
function readProjectNumber(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    return parseInt(String(el.value).replace(/[^0-9]/g, '')) || 0;
}

function toggleCustomInput(selectId, inputId) {
    const sel = document.getElementById(selectId);
    const inp = document.getElementById(inputId);
    if (!sel || !inp) return;
    inp.style.display = sel.value === '기타' ? 'block' : 'none';
    if (sel.value !== '기타') inp.value = '';
}

// 국내 프로젝트 모달의 인쇄/포장 섹션 토글 (show=true 펼침, false 접기+값 초기화)
function toggleProjSection(secId, btnId, show, recalcFnName) {
    const sec = document.getElementById(secId);
    const btn = document.getElementById(btnId);
    if (!sec) return;
    sec.style.display = show ? '' : 'none';
    if (btn) btn.style.display = show ? 'none' : '';
    if (!show) {
        sec.querySelectorAll('input').forEach(el => {
            if (el.type === 'text' || el.type === 'number' || !el.type) el.value = '';
            if (el.id && el.id.endsWith('Custom')) el.style.display = 'none';
        });
        sec.querySelectorAll('select').forEach(el => { el.selectedIndex = 0; });
        if (recalcFnName && typeof window[recalcFnName] === 'function') {
            try { window[recalcFnName](); } catch (e) {}
        }
    }
}

function toggleShippingFields(prefix) {
    const typeEl = document.getElementById(prefix + 'ProjectShippingType') || document.getElementById(prefix + 'ShippingType');
    if (!typeEl) return;
    const type = typeEl.value;
    const boxCalc = document.getElementById(prefix + 'ShippingBoxCalc') || document.getElementById(prefix + 'ProjectShippingBoxCalc');
    const directCost = document.getElementById(prefix + 'ShippingCostDirect') || document.getElementById(prefix + 'ProjectShippingCostDirect');
    const vatGroup = document.getElementById(prefix + 'ShippingVatGroup') || document.getElementById(prefix + 'ProjectShippingVatGroup');
    if (boxCalc) boxCalc.style.display = type === '택배' ? 'block' : 'none';
    if (directCost) directCost.style.display = type === '퀵' ? 'block' : 'none';
    if (vatGroup) vatGroup.style.display = type ? 'block' : 'none';
}

function calcShippingCost(prefix) {
    const perBox = readProjectNumber(prefix + 'ProjectShipPerBox') || readProjectNumber(prefix + 'ShipPerBox');
    const boxes = readProjectNumber(prefix + 'ProjectShipBoxes') || readProjectNumber(prefix + 'ShipBoxes');
    const total = perBox * boxes;
    const el = document.getElementById(prefix + 'ProjectShipTotal') || document.getElementById(prefix + 'ShipTotal');
    if (el) el.textContent = total.toLocaleString() + ' 원';
}

function getShippingCost(prefix) {
    const type = document.getElementById(prefix + 'ProjectShippingType') || document.getElementById(prefix + 'ShippingType');
    if (!type) return 0;
    if (type.value === '택배') {
        const perBox = readProjectNumber(prefix + 'ProjectShipPerBox') || readProjectNumber(prefix + 'ShipPerBox');
        const boxes = readProjectNumber(prefix + 'ProjectShipBoxes') || readProjectNumber(prefix + 'ShipBoxes');
        return perBox * boxes;
    }
    if (type.value === '퀵') {
        return readProjectNumber(prefix + 'ProjectShippingCost') || readProjectNumber(prefix + 'ShippingCost');
    }
    return 0;
}

function toggleProjectExpand(id) {
    if (expandedProjectIds.has(id)) {
        expandedProjectIds.delete(id);
    } else {
        expandedProjectIds.add(id);
    }
    renderProjects();
}

function renderDomesticProjects() {
    renderProjectList(domesticProjects, currentDomesticFilter, 'domesticProjectTableBody', 'domesticProjectCardGrid');
}

function renderOverseasProjects() {
    renderProjectList(overseasProjects, currentOverseasFilter, 'overseasProjectTableBody', 'overseasProjectCardGrid');
}

function renderProjects() {
    renderDomesticProjects();
    renderOverseasProjects();
}

// =====================================
// DAILY PLAN
// =====================================
// 권한 등급 매핑 (사용자별 직접 매핑)
const ADMIN_USERS = ['김현호', '대표님']; // 관리자 계정: 모든 데이터 조회
const EXEC_USERS = ['이현주']; // 임원 계정: 전체 + 임원 + 본인
// 일반 계정: 유지은, 구정두 → 전체 + 본인만

// 기존 role 기반 호환용
const ADMIN_ROLES = ['관리자', '부장', '대표'];
const EXEC_ROLES = ['임원', '차장', '과장'];
let allProfiles = []; // {name, role} - Supabase에서 로드

function isAdminUser() {
    return currentUser && ADMIN_USERS.includes(currentUser.name);
}

function isExecUser() {
    return currentUser && EXEC_USERS.includes(currentUser.name);
}

function getVisiblePeople() {
    const allPeople = ['이현주', '김현호', '유지은', '구정두'];
    if (!currentUser) return allPeople;

    if (isAdminUser()) return allPeople;
    if (isExecUser()) return allPeople.filter(p => p === currentUser.name);

    // 일반: 자기 자신만
    return allPeople.filter(p => p === currentUser.name);
}

function getPeopleForFilter(filter) {
    const allPeople = ['이현주', '김현호', '유지은', '구정두'];
    if (filter === 'viewall') return getVisiblePeople();
    if (filter === 'ceo') return [];
    return allPeople.filter(p => p === filter);
}

function renderDailyPersonFilter() {
    const container = document.getElementById('dailyPersonFilter');
    if (!container) return;

    const visiblePeople = getVisiblePeople();
    const admin = isAdminUser();
    const exec = isExecUser();

    let html = '';

    // 전체보기 탭: 관리자에게만 표시
    if (admin) {
        html += `<button class="filter-chip ${currentPersonFilter === 'viewall' ? 'active' : ''}" data-person="viewall">전체보기</button>`;
    }

    // 관리자만 대표님 탭 표시
    if (admin) {
        html += `<button class="filter-chip ${currentPersonFilter === 'ceo' ? 'active' : ''}" data-person="ceo">대표님</button>`;
    }

    visiblePeople.forEach(p => {
        html += `<button class="filter-chip ${currentPersonFilter === p ? 'active' : ''}" data-person="${p}">${p}</button>`;
    });
    container.innerHTML = html;

    // 이벤트 바인딩
    container.querySelectorAll('[data-person]').forEach(chip => {
        chip.addEventListener('click', () => {
            container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentPersonFilter = chip.dataset.person;
            weekOffset = 0;
            monthOffset = 0;
            renderDaily();
        });
    });
}

function renderDaily() {
    // 포커스 보존: 인라인 입력에 포커스가 있었다면 어디에 있었는지 기억
    const _activeEl = document.activeElement;
    let _focusKey = null;
    let _focusValue = '';
    let _focusSelStart = 0;
    if (_activeEl && _activeEl.classList && _activeEl.classList.contains('daily-inline-input')) {
        if (_activeEl.classList.contains('wk-inline-input')) {
            _focusKey = `wk:${_activeEl.dataset.person || ''}:${_activeEl.dataset.date || ''}`;
        } else {
            _focusKey = `dc:${_activeEl.dataset.assignee || ''}`;
        }
        _focusValue = _activeEl.value || '';
        try { _focusSelStart = _activeEl.selectionStart || 0; } catch(e) {}
    }

    const todayStr = fmtDate(currentDate);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const d = currentDate;
    document.getElementById('currentDateDisplay').textContent =
        `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;

    // 렌더 끝난 뒤 포커스 복원 (queueMicrotask로 DOM 반영 직후)
    queueMicrotask(() => {
        if (!_focusKey) return;
        let target = null;
        if (_focusKey.startsWith('dc:')) {
            const a = _focusKey.slice(3);
            target = document.querySelector(`#dailyColumns .daily-inline-input[data-assignee="${a}"]`);
        } else if (_focusKey.startsWith('wk:')) {
            const [, p, dt] = _focusKey.split(':');
            target = document.querySelector(`#weeklyKanban .wk-inline-input[data-person="${p}"][data-date="${dt}"]`);
        }
        if (target) {
            target.value = _focusValue;
            target.focus();
            try { target.setSelectionRange(_focusSelStart, _focusSelStart); } catch(e) {}
        }
    });

    // 관리자가 아닌데 전체보기 상태면 본인 탭으로 전환
    if (!isAdminUser() && currentPersonFilter === 'viewall') {
        currentPersonFilter = currentUser ? currentUser.name : 'viewall';
    }

    renderDailyPersonFilter();

    const visiblePeople = getVisiblePeople();
    // 현재 필터가 볼 수 없는 사람이면 기본 탭으로 리셋 (관리자: 전체보기, 그외: 본인)
    if (currentPersonFilter !== 'viewall' && currentPersonFilter !== 'ceo' && !visiblePeople.includes(currentPersonFilter)) {
        currentPersonFilter = isAdminUser() ? 'viewall' : (currentUser ? currentUser.name : visiblePeople[0]);
        renderDailyPersonFilter();
    }
    const displayPeople = getPeopleForFilter(currentPersonFilter);
    const admin = isAdminUser();
    const exec = isExecUser();

    // 전체 컬럼: 항상 표시
    const showCommonColumn = true;
    // 임원 컬럼: 김현호, 대표님, 이현주에게만 표시. 유지은/구정두(일반)에게는 숨김
    const userName = currentUser ? currentUser.name : '';
    const showExecColumn = ADMIN_USERS.includes(userName) || EXEC_USERS.includes(userName);
    const showCeoColumn = (currentPersonFilter === 'ceo' || (currentPersonFilter === 'viewall' && admin));

    const checkSvg = `<svg width="14" height="14" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`;

    // 컬럼 제목 → 탭 필터 매핑
    function getTitleFilter(title) {
        if (title === '전체 (공통)') return null;
        if (title === '임원') return null;
        if (title === '대표님') return 'ceo';
        return title; // 개인 이름은 그대로
    }

    // 미완료(어제 이전까지) 컬럼 — 개인 탭에서만 노출 (전체 공통 업무는 전체 컬럼에 계속 남김)
    function renderOverdueColumn(person) {
        const overdue = dailyTasks.filter(t =>
            t.assignee === person &&
            t.date && t.date < todayStr &&
            !t.done &&
            !t.isDeadlineCopy
        ).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        if (overdue.length === 0) return '';
        const MS = 24*60*60*1000;
        const today0 = new Date(todayStr + 'T00:00:00');
        let itemsHtml = '';
        overdue.forEach(t => {
            const tagClass = (t.priority||'').includes('긴급') ? 'tag-urgent' : (t.priority||'').includes('낮음') ? 'tag-low' : 'tag-normal';
            const tagLabel = (t.priority||'').includes('긴급') ? '긴급' : (t.priority||'').includes('낮음') ? '낮음' : '보통';
            const labelStr = t.label ? `<span class="daily-label label-${getLabelClass(t.label)}">${t.label}</span>` : '';
            const clientStr = t.client ? `<span class="daily-client">📌 ${t.client}</span>` : '';
            const dObj = new Date(t.date + 'T00:00:00');
            const days = Math.max(1, Math.round((today0 - dObj) / MS));
            itemsHtml += `<div class="daily-item overdue-item" onclick="openEditTask(${t.id})" style="cursor:pointer">
                <div class="daily-checkbox" onclick="event.stopPropagation();toggleTask(${t.id})">${checkSvg}</div>
                <div class="daily-info">
                    <div class="daily-title">${t.task}</div>
                    <div class="daily-meta">
                        <span class="daily-tag ${tagClass}">${tagLabel}</span>
                        ${labelStr}
                        ${clientStr}
                    </div>
                    <div class="overdue-date-row"><span class="overdue-date-badge">${fmtDisplay(t.date)}</span><span class="overdue-days">${days}일 지남</span></div>
                </div>
            </div>`;
        });
        return `<div class="daily-column overdue-column">
            <div class="daily-col-header">
                <span class="daily-col-title">🔴 미완료 (${person})</span>
                <div class="daily-col-actions">
                    <span class="daily-col-count">${overdue.length}</span>
                </div>
            </div>
            <div class="daily-col-body">${itemsHtml}</div>
        </div>`;
    }

    function renderColumn(title, tasks, assignee) {
        const doneCount = tasks.filter(t => t.done).length;
        let itemsHtml = '';
        const sorted = [...tasks].sort((a, b) => a.done - b.done);
        sorted.forEach(t => {
            const tagClass = t.priority.includes('긴급') ? 'tag-urgent' : t.priority.includes('낮음') ? 'tag-low' : 'tag-normal';
            const tagLabel = t.priority.includes('긴급') ? '긴급' : t.priority.includes('낮음') ? '낮음' : '보통';
            const deadlineStr = t.deadline ? `마감 ${fmtDisplay(t.deadline)}` : '';
            const ddayStr = t.deadline ? getDday(t.deadline) : '';
            const labelStr = t.label ? `<span class="daily-label label-${getLabelClass(t.label)}">${t.label}</span>` : '';
            const clientStr = t.client ? `<span class="daily-client">📌 ${t.client}</span>` : '';
            const ddayClass = ddayStr.includes('D+') ? 'dday-over' : ddayStr.includes('D-Day') ? 'dday-today' : 'dday-left';
            const isDeadline = t.isDeadlineCopy;
            itemsHtml += `<div class="daily-item ${t.done ? 'completed' : ''} ${isDeadline ? 'deadline-item' : ''}" onclick="openEditTask(${t.id})" style="cursor:pointer;">
                <div class="daily-checkbox ${t.done ? 'checked' : ''}" onclick="event.stopPropagation();toggleTask(${t.id})">${checkSvg}</div>
                <div class="daily-info">
                    <div class="daily-title">${t.task}</div>
                    <div class="daily-meta">
                        <span class="daily-tag ${tagClass}">${tagLabel}</span>
                        ${labelStr}
                        ${clientStr}
                    </div>
                </div>
                ${isDeadline ? `<div class="deadline-badge-wrap"><span class="deadline-badge-lg">🔥 마감일</span></div>`
                : t.deadline ? `<div class="daily-dday-wrap">
                    <span class="daily-dday ${ddayClass}">${ddayStr}</span>
                    <span class="daily-dday-date">${fmtDisplay(t.deadline)}</span>
                </div>` : ''}
            </div>`;
        });
        const filterKey = getTitleFilter(title);
        const clickable = (currentPersonFilter === 'viewall' && filterKey) ? `onclick="switchDailyFilter('${filterKey}')"` : '';
        const titleClass = (currentPersonFilter === 'viewall' && filterKey) ? 'daily-col-title clickable' : 'daily-col-title';
        return `<div class="daily-column">
            <div class="daily-col-header">
                <span class="${titleClass}" ${clickable}>${title}</span>
                <div class="daily-col-actions">
                    <span class="daily-col-count">${doneCount}/${tasks.length}</span>
                    <button class="daily-add-btn" onclick="openQuickTask('${assignee}')"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14"/></svg> 새 할 일</button>
                </div>
            </div>
            <div class="daily-col-body">
                ${itemsHtml}
                <div class="daily-inline-add">
                    <input type="text" class="daily-inline-input" placeholder="할 일 입력 후 Enter" data-assignee="${assignee}">
                </div>
            </div>
        </div>`;
    }

    let html = '';

    // 개인 탭(대표님 포함)일 때: 본인 컬럼을 맨 앞에, 그 다음 전체/임원 순
    const isPersonalTab = currentPersonFilter !== 'viewall';

    const renderCommonCols = (includeCeo) => {
        let h = '';
        if (showCommonColumn) {
            // 전체(공통) 업무는 당일 + 과거 미체크까지 계속 노출 (미완료 컬럼으로 이동시키지 않음)
            const commonTasks = dailyTasks.filter(t =>
                t.assignee === '전체' &&
                (t.date === todayStr || (t.date && t.date < todayStr && !t.done))
            );
            h += renderColumn('전체 (공통)', commonTasks, '전체');
        }
        if (showExecColumn) {
            const execTasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === '임원');
            h += renderColumn('임원', execTasks, '임원');
        }
        if (includeCeo && showCeoColumn) {
            const ceoTasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === '대표님');
            h += renderColumn('대표님', ceoTasks, '대표님');
        }
        return h;
    };
    const renderPersonalCols = () => displayPeople.map(person => {
        const tasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === person);
        return renderColumn(person, tasks, person);
    }).join('');

    if (currentPersonFilter === 'ceo') {
        // 대표님 탭: 대표님 컬럼을 맨 앞에, 그 다음 전체/임원 + 미완료
        const ceoTasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === '대표님');
        html += renderColumn('대표님', ceoTasks, '대표님');
        html += renderCommonCols(false);
        html += renderOverdueColumn('대표님');
    } else if (isPersonalTab) {
        html += renderPersonalCols();
        html += renderCommonCols(false);
        displayPeople.forEach(person => { html += renderOverdueColumn(person); });
    } else {
        // 전체보기: 전체/임원/대표님/개인별 순
        html += renderCommonCols(true);
        html += renderPersonalCols();
    }

    document.getElementById('dailyColumns').innerHTML = html;

    // 인라인 입력에 keydown 리스너 부착 (한국어 assignee가 inline JS에 박힐 때의 escaping 문제 회피)
    document.querySelectorAll('#dailyColumns .daily-inline-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            // IME 조합 중인 한글 Enter는 무시 (조합 확정만 처리)
            if (e.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            const assignee = input.dataset.assignee || '';
            inlineAddTask(input, assignee);
        });
    });

    // 전체보기 외 모든 탭에서 주간 칸반보드 + 월간 캘린더 표시
    const kanbanWrap = document.getElementById('weeklyKanban');
    const calendarWrap = document.getElementById('monthlyCalendar');
    if (currentPersonFilter !== 'viewall') {
        kanbanWrap.style.display = 'block';
        calendarWrap.style.display = 'block';
        const kanbanAssignee = currentPersonFilter === 'ceo' ? '대표님' : currentPersonFilter;
        renderWeeklyKanban(kanbanAssignee);
        renderMonthlyCalendar(kanbanAssignee);
    } else {
        kanbanWrap.style.display = 'none';
        calendarWrap.style.display = 'none';
    }
}

function getWeekDates(baseDate, offset) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + (offset || 0) * 7);
    const day = d.getDay(); // 0=일, 1=월 ...
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const dt = new Date(monday);
        dt.setDate(monday.getDate() + i);
        dates.push(dt);
    }
    return dates;
}

function changeWeek(dir) {
    weekOffset += dir;
    renderDaily();
}

function resetWeek() {
    weekOffset = 0;
    renderDaily();
}

function renderWeeklyKanban(person) {
    const weekDates = getWeekDates(currentDate, weekOffset);
    const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
    const todayStr = fmtDate(new Date());

    const titleLabel = person === '전체' ? '전체 (공통)' : person === '임원' ? '임원' : person === '대표님' ? '대표님' : `${person}님의`;
    const weekLabel = weekOffset === 0 ? '이번 주' : weekOffset === -1 ? '지난 주' : weekOffset === 1 ? '다음 주' : '';

    let html = `<div class="weekly-kanban-header">
        <div class="wk-header-left">
            <h3 class="weekly-kanban-title">${titleLabel} 주간 계획</h3>
            <span class="weekly-kanban-range">${fmtDisplay(fmtDate(weekDates[0]))} ~ ${fmtDisplay(fmtDate(weekDates[6]))}${weekLabel ? ' (' + weekLabel + ')' : ''}</span>
        </div>
        <div class="wk-nav-btns">
            <button class="wk-nav-btn" onclick="changeWeek(-1)">← 지난주</button>
            <button class="wk-nav-btn wk-nav-today ${weekOffset === 0 ? 'active' : ''}" onclick="resetWeek()">이번 주</button>
            <button class="wk-nav-btn" onclick="changeWeek(1)">다음주 →</button>
        </div>
    </div>`;
    html += `<div class="weekly-kanban-board">`;

    // 공유 할 일 표시 여부
    const showCommonInKanban = (person !== '전체');
    const showExecInKanban = (person !== '전체' && person !== '임원') && (isAdminUser() || isExecUser());

    weekDates.forEach((date, i) => {
        const dateStr = fmtDate(date);
        const isToday = dateStr === todayStr;
        const isWeekend = i >= 5;

        // 전체 할 일 (맨 위) + 임원 할 일 + 개인 할 일
        const commonTasks = showCommonInKanban ? dailyTasks.filter(t => t.date === dateStr && t.assignee === '전체') : [];
        const execTasks = showExecInKanban ? dailyTasks.filter(t => t.date === dateStr && t.assignee === '임원') : [];
        const personalTasks = dailyTasks.filter(t => t.date === dateStr && t.assignee === person);
        const sortedCommon = [...commonTasks].sort((a, b) => a.done - b.done);
        const sortedExec = [...execTasks].sort((a, b) => a.done - b.done);
        const sortedPersonal = [...personalTasks].sort((a, b) => a.done - b.done);

        let itemsHtml = '';

        // 공유 할 일 렌더 헬퍼 (전체/임원 공통)
        function renderSharedTask(t, labelText, cssClass) {
            const tagClass = t.priority.includes('긴급') ? 'tag-urgent' : t.priority.includes('낮음') ? 'tag-low' : 'tag-normal';
            const tagLabel = t.priority.includes('긴급') ? '긴급' : t.priority.includes('낮음') ? '낮음' : '보통';
            const labelStr = t.label ? `<span class="daily-label label-${getLabelClass(t.label)}">${t.label}</span>` : '';
            const wkIsDeadline = t.isDeadlineCopy;
            return `<div class="wk-task ${cssClass} ${t.done ? 'completed' : ''} ${wkIsDeadline ? 'deadline-item' : ''}" draggable="true" data-task-id="${t.id}" onclick="openEditTask(${t.id})">
                <div class="wk-task-top">
                    <div class="daily-checkbox ${t.done ? 'checked' : ''}" onclick="event.stopPropagation();toggleTask(${t.id})">
                        <svg width="12" height="12" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                    </div>
                    <span class="wk-task-name">${t.task}</span>
                </div>
                <div class="wk-task-tags">
                    <span class="wk-common-label ${cssClass === 'wk-task-exec' ? 'wk-exec-label' : ''}">${labelText}</span>
                    <span class="daily-tag ${tagClass}">${tagLabel}</span>
                    ${labelStr}
                    ${wkIsDeadline ? `<span class="deadline-badge-lg wk-deadline-right">🔥 마감일</span>` : ''}
                </div>
            </div>`;
        }

        // 전체 할 일 (맨 위 고정)
        sortedCommon.forEach(t => { itemsHtml += renderSharedTask(t, '전체', 'wk-task-common'); });

        // 임원 할 일 (전체 다음)
        sortedExec.forEach(t => { itemsHtml += renderSharedTask(t, '임원', 'wk-task-exec'); });

        // 개인 할 일
        sortedPersonal.forEach(t => {
            const tagClass = t.priority.includes('긴급') ? 'tag-urgent' : t.priority.includes('낮음') ? 'tag-low' : 'tag-normal';
            const tagLabel = t.priority.includes('긴급') ? '긴급' : t.priority.includes('낮음') ? '낮음' : '보통';
            const labelStr = t.label ? `<span class="daily-label label-${getLabelClass(t.label)}">${t.label}</span>` : '';
            const wkIsDeadline = t.isDeadlineCopy;
            itemsHtml += `<div class="wk-task ${t.done ? 'completed' : ''} ${wkIsDeadline ? 'deadline-item' : ''}" draggable="true" data-task-id="${t.id}" onclick="openEditTask(${t.id})">
                <div class="wk-task-top">
                    <div class="daily-checkbox ${t.done ? 'checked' : ''}" onclick="event.stopPropagation();toggleTask(${t.id})">
                        <svg width="12" height="12" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                    </div>
                    <span class="wk-task-name">${t.task}</span>
                </div>
                <div class="wk-task-tags">
                    <span class="daily-tag ${tagClass}">${tagLabel}</span>
                    ${labelStr}
                    ${wkIsDeadline ? `<span class="deadline-badge-lg wk-deadline-right">🔥 마감일</span>` : ''}
                </div>
            </div>`;
        });

        const allTasks = [...commonTasks, ...execTasks, ...personalTasks];
        html += `<div class="wk-day-col ${isToday ? 'wk-today' : ''} ${isWeekend ? 'wk-weekend' : ''}" data-date="${dateStr}">
            <div class="wk-day-header">
                <span class="wk-day-name">${dayNames[i]}</span>
                <span class="wk-day-date">${date.getMonth()+1}/${date.getDate()}</span>
            </div>
            <div class="wk-day-body" data-date="${dateStr}">
                ${itemsHtml}
                <div class="daily-inline-add">
                    <input type="text" class="daily-inline-input wk-inline-input" placeholder="+ 할 일" data-person="${person}" data-date="${dateStr}">
                </div>
            </div>
        </div>`;
    });

    html += `</div>`;
    document.getElementById('weeklyKanban').innerHTML = html;

    // 주간 인라인 입력 keydown 리스너 부착
    document.querySelectorAll('#weeklyKanban .wk-inline-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            if (e.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            const p = input.dataset.person || '';
            const d = input.dataset.date || '';
            inlineAddWeeklyTask(input, p, d);
        });
    });

    // 드래그 앤 드롭 초기화
    initKanbanDragDrop();
}

async function inlineAddWeeklyTask(input, person, dateStr) {
    const task = input.value.trim();
    if (!task) return;
    input.value = '';
    const saved = await dbInsertTask({
        task, date: dateStr, assignee: person, target: '',
        priority: '🟡 보통', done: false
    });
    if (!saved) { input.value = task; return; }
    if (!dailyTasks.find(t => t.id === saved.id)) dailyTasks.push(saved);
    renderDaily();
    renderHome();
    showToast('할 일이 추가되었습니다');
    // 포커스는 renderDaily 내부 보존 로직이 자동 복원
}

function initKanbanDragDrop() {
    let draggedEl = null;

    document.querySelectorAll('.wk-task[draggable]').forEach(el => {
        el.addEventListener('dragstart', e => {
            draggedEl = el;
            el.classList.add('wk-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', el.dataset.taskId);
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('wk-dragging');
            document.querySelectorAll('.wk-day-body').forEach(b => b.classList.remove('wk-drop-target'));
            draggedEl = null;
        });
    });

    document.querySelectorAll('.wk-day-body').forEach(body => {
        body.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            body.classList.add('wk-drop-target');
        });
        body.addEventListener('dragleave', () => {
            body.classList.remove('wk-drop-target');
        });
        body.addEventListener('drop', e => {
            e.preventDefault();
            body.classList.remove('wk-drop-target');
            const taskId = parseInt(e.dataTransfer.getData('text/plain'));
            const newDate = body.dataset.date;
            const task = dailyTasks.find(t => t.id === taskId);
            if (task && task.date !== newDate) {
                task.date = newDate;
                dbUpdateTask(task.id, { date: newDate });
                renderDaily();
                renderHome();
                showToast('할 일이 이동되었습니다');
            }
        });
    });
}

function changeMonth(dir) {
    monthOffset += dir;
    renderDaily();
}

function resetMonth() {
    monthOffset = 0;
    renderDaily();
}

function renderMonthlyCalendar(person) {
    const baseDate = new Date(currentDate);
    baseDate.setMonth(baseDate.getMonth() + monthOffset);
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const todayStr = fmtDate(new Date());

    const titleLabel = person === '전체' ? '전체 (공통)' : person === '임원' ? '임원' : person === '대표님' ? '대표님' : `${person}님의`;
    const monthLabel = monthOffset === 0 ? '이번 달' : monthOffset === -1 ? '지난 달' : monthOffset === 1 ? '다음 달' : '';

    // 해당 월의 1일과 마지막 날
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay(); // 0=일

    // 달력 시작: 월요일 기준, 이전 달 날짜 채우기
    const startOffset = startDow === 0 ? 6 : startDow - 1;
    const calendarStart = new Date(firstDay);
    calendarStart.setDate(calendarStart.getDate() - startOffset);

    // 6주 = 42칸
    const cells = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(calendarStart);
        d.setDate(calendarStart.getDate() + i);
        cells.push(d);
    }

    let html = `<div class="mc-header">
        <div class="mc-header-left">
            <h3 class="mc-title">${titleLabel} 월간 계획</h3>
            <span class="mc-range">${year}년 ${month + 1}월${monthLabel ? ' (' + monthLabel + ')' : ''}</span>
        </div>
        <div class="wk-nav-btns">
            <button class="wk-nav-btn" onclick="changeMonth(-1)">← 지난달</button>
            <button class="wk-nav-btn wk-nav-today ${monthOffset === 0 ? 'active' : ''}" onclick="resetMonth()">이번 달</button>
            <button class="wk-nav-btn" onclick="changeMonth(1)">다음달 →</button>
        </div>
    </div>`;

    html += `<div class="mc-grid">`;
    // 요일 헤더
    const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
    dayNames.forEach((d, i) => {
        const weekendClass = i >= 5 ? 'mc-weekend-header' : '';
        html += `<div class="mc-dow ${weekendClass}">${d}</div>`;
    });

    // 공유 할 일 표시 여부
    const showCommonInCalendar = (person !== '전체');
    const showExecInCalendar = (person !== '전체' && person !== '임원') && (isAdminUser() || isExecUser());

    // 날짜 셀
    cells.forEach((d, i) => {
        const dateStr = fmtDate(d);
        const isCurrentMonth = d.getMonth() === month;
        const isToday = dateStr === todayStr;
        const isWeekend = i % 7 >= 5;

        const commonTasks = showCommonInCalendar ? dailyTasks.filter(t => t.date === dateStr && t.assignee === '전체') : [];
        const execTasks = showExecInCalendar ? dailyTasks.filter(t => t.date === dateStr && t.assignee === '임원') : [];
        const personalTasks = dailyTasks.filter(t => t.date === dateStr && t.assignee === person);
        const allTasks = [...commonTasks, ...execTasks, ...personalTasks];
        const doneCount = allTasks.filter(t => t.done).length;

        let tasksHtml = '';

        // 공유 할 일 렌더 헬퍼
        function renderSharedCalTask(t, labelText, cssClass) {
            const isDeadline = t.isDeadlineCopy;
            const checkClass = t.done ? 'mc-check checked' : 'mc-check';
            return `<div class="mc-task ${cssClass} ${t.done ? 'mc-task-done' : ''} ${isDeadline ? 'mc-task-deadline' : ''}" onclick="event.stopPropagation();openEditTask(${t.id})">
                <div class="${checkClass}" onclick="event.stopPropagation();toggleTask(${t.id})"><svg width="8" height="8" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
                <span class="mc-common-label ${cssClass === 'mc-task-exec' ? 'mc-exec-label' : ''}">${labelText}</span>
                <span class="mc-task-text">${t.task.replace(/\s*\(마감일\)\s*$/, '')}</span>
                ${isDeadline ? '<span class="mc-deadline-badge">🔥 마감일</span>' : ''}
            </div>`;
        }

        // 전체 할 일 (맨 위 고정)
        const sortedCommon = [...commonTasks].sort((a, b) => a.done - b.done);
        sortedCommon.forEach(t => { tasksHtml += renderSharedCalTask(t, '전체', 'mc-task-common'); });

        // 임원 할 일 (전체 다음)
        const sortedExec = [...execTasks].sort((a, b) => a.done - b.done);
        sortedExec.forEach(t => { tasksHtml += renderSharedCalTask(t, '임원', 'mc-task-exec'); });

        // 개인 할 일
        const sortedPersonal = [...personalTasks].sort((a, b) => a.done - b.done);
        sortedPersonal.forEach(t => {
            const isDeadline = t.isDeadlineCopy;
            const checkClass = t.done ? 'mc-check checked' : 'mc-check';
            tasksHtml += `<div class="mc-task ${t.done ? 'mc-task-done' : ''} ${isDeadline ? 'mc-task-deadline' : ''}" onclick="event.stopPropagation();openEditTask(${t.id})">
                <div class="${checkClass}" onclick="event.stopPropagation();toggleTask(${t.id})"><svg width="8" height="8" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
                <span class="mc-task-text">${t.task.replace(/\s*\(마감일\)\s*$/, '')}</span>
                ${isDeadline ? '<span class="mc-deadline-badge">🔥 마감일</span>' : ''}
            </div>`;
        });

        html += `<div class="mc-cell ${isCurrentMonth ? '' : 'mc-other-month'} ${isToday ? 'mc-today' : ''} ${isWeekend ? 'mc-weekend' : ''}" ondblclick="openCalendarAdd('${person}','${dateStr}')">
            <div class="mc-cell-header">
                <span class="mc-date ${isToday ? 'mc-date-today' : ''}">${d.getDate()}</span>
                ${allTasks.length > 0 ? `<span class="mc-count">${doneCount}/${allTasks.length}</span>` : ''}
            </div>
            <div class="mc-cell-body">${tasksHtml}</div>
        </div>`;
    });

    html += `</div>`;
    document.getElementById('monthlyCalendar').innerHTML = html;
}

function openCalendarAdd(person, dateStr) {
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const label = person === '전체' ? '전체 (공통)' : person;
    title.textContent = `새 할 일 — ${label} (${fmtDisplay(dateStr)})`;

    const assigneeOptions = ['전체', '임원', '대표님', '이현주', '김현호', '유지은', '구정두'];
    const assigneeHtml = assigneeOptions.map(a => `<option value="${a}" ${a === person ? 'selected' : ''}>${a === '전체' ? '전체 (공통)' : a}</option>`).join('');

    const labelOptions = ['개인', '회사 업무', '거래처 업무', '마케팅 업무'];
    const labelHtml = labelOptions.map(l => `<option value="${l}">${l}</option>`).join('');

    body.innerHTML = `
        <div class="form-group"><label class="form-label">할 일</label><input type="text" class="form-input" id="quickTaskName" placeholder="할 일 입력" ></div>
        <div class="form-group"><label class="form-label">담당자</label><select class="form-select" id="quickTaskAssignee">${assigneeHtml}</select></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" id="quickTaskDate" value="${dateStr}"></div>
            <div class="form-group"><label class="form-label">마감일</label><input type="date" class="form-input" id="quickTaskDeadline"></div>
        </div>
        <div class="form-group"><label class="form-label">라벨</label><select class="form-select" id="quickTaskLabel">${labelHtml}</select></div>
        <div class="form-group"><label class="form-label">우선순위</label><select class="form-select" id="quickTaskPriority"><option value="🟡 보통">보통</option><option value="🔴 긴급">긴급</option><option value="🔵 낮음">낮음</option></select></div>
        <div class="form-group"><label class="form-label">고객사</label>${buildClientDatalistField('quickTaskClient', '', 'quickClientList')}</div>
        <button class="form-submit" onclick="addQuickTask()">할 일 추가</button>`;
    document.getElementById('modalOverlay').classList.add('show'); openModalHistory();
}

function switchDailyFilter(filter) {
    currentPersonFilter = filter;
    renderDaily();
}

function openQuickTask(assignee) {
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    title.textContent = `새 할 일 — ${assignee === '전체' ? '전체 (공통)' : assignee}`;

    // 담당자 기본값: 관리자급은 '전체', 나머지는 로그인 계정명
    const defaultAssignee = isAdminUser() ? '전체' : (currentUser ? currentUser.name : assignee);
    const assigneeOptions = ['전체', '임원', '대표님', '이현주', '김현호', '유지은', '구정두'];
    const assigneeHtml = assigneeOptions.map(a => `<option value="${a}" ${a === defaultAssignee ? 'selected' : ''}>${a === '전체' ? '전체 (공통)' : a}</option>`).join('');

    // 라벨 옵션
    const labelOptions = ['개인', '회사 업무', '거래처 업무', '마케팅 업무'];
    const labelHtml = labelOptions.map(l => `<option value="${l}">${l}</option>`).join('');

    body.innerHTML = `
        <div class="form-group"><label class="form-label">할 일</label><input type="text" class="form-input" id="quickTaskName" placeholder="할 일 입력" ></div>
        <div class="form-group"><label class="form-label">담당자</label><select class="form-select" id="quickTaskAssignee">${assigneeHtml}</select></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" id="quickTaskDate" value="${fmtDate(currentDate)}"></div>
            <div class="form-group"><label class="form-label">마감일</label><input type="date" class="form-input" id="quickTaskDeadline"></div>
        </div>
        <div class="form-group"><label class="form-label">라벨</label><select class="form-select" id="quickTaskLabel">${labelHtml}</select></div>
        <div class="form-group"><label class="form-label">우선순위</label><select class="form-select" id="quickTaskPriority"><option value="🟡 보통">보통</option><option value="🔴 긴급">긴급</option><option value="🔵 낮음">낮음</option></select></div>
        <div class="form-group"><label class="form-label">고객사</label>${buildClientDatalistField('quickTaskClient', '', 'quickClientList')}</div>
        <button class="form-submit" onclick="addQuickTask()">할 일 추가</button>`;
    document.getElementById('modalOverlay').classList.add('show'); openModalHistory();
}

async function addQuickTask() {
    const task = document.getElementById('quickTaskName').value.trim();
    if (!task) { showToast('할 일을 입력해주세요'); return; }
    const assignee = document.getElementById('quickTaskAssignee').value;
    const date = document.getElementById('quickTaskDate').value;
    const deadline = document.getElementById('quickTaskDeadline').value || '';
    const label = document.getElementById('quickTaskLabel').value || '';
    const client = document.getElementById('quickTaskClient').value || '';
    const priority = document.getElementById('quickTaskPriority').value;
    const groupId = deadline && deadline !== date ? Date.now() : null;

    const saved = await dbInsertTask({
        task, date, assignee, deadline, label, client, target: '',
        priority, done: false, linkedGroup: groupId
    });
    if (!saved) return;
    dailyTasks.push(saved);

    // 마감일이 시작일과 다르면 마감일에도 연동 태스크 생성
    if (groupId) {
        const savedCopy = await dbInsertTask({
            task: `${task} (마감일)`,
            date: deadline, assignee, deadline, label, client, target: '',
            priority, done: false, linkedGroup: groupId, isDeadlineCopy: true
        });
        if (savedCopy) dailyTasks.push(savedCopy);
    }

    closeModal(); renderDaily(); renderHome();
    showToast('할 일이 추가되었습니다');
}

function buildClientDatalistField(inputId, currentValue, listId) {
    const escAttr = (s) => (s || '').toString().replace(/"/g, '&quot;');
    const names = clients
        .map(c => c.companyName)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort((a, b) => a.localeCompare(b));
    const opts = names.map(n => `<option value="${escAttr(n)}"></option>`).join('');
    return `<input type="text" class="form-input" id="${inputId}" list="${listId}" value="${escAttr(currentValue)}" placeholder="고객사 검색/선택" autocomplete="off">
        <datalist id="${listId}">${opts}</datalist>`;
}

function getDday(dateStr) {
    if (!dateStr) return '';
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(dateStr); target.setHours(0,0,0,0);
    const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '(D-Day)';
    if (diff > 0) return `(D-${diff})`;
    return `(D+${Math.abs(diff)})`;
}

function getLabelClass(label) {
    if (label === '개인') return 'personal';
    if (label === '회사 업무') return 'company';
    if (label === '거래처 업무') return 'client';
    if (label === '마케팅 업무') return 'marketing';
    return 'default';
}

function openEditTask(id) {
    const t = dailyTasks.find(x => x.id === id);
    if (!t) return;
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    title.textContent = '할 일 수정';

    const assigneeOptions = ['전체', '임원', '대표님', '이현주', '김현호', '유지은', '구정두'];
    const assigneeHtml = assigneeOptions.map(a => `<option value="${a}" ${a === t.assignee ? 'selected' : ''}>${a === '전체' ? '전체 (공통)' : a}</option>`).join('');

    const labelOptions = ['개인', '회사 업무', '거래처 업무', '마케팅 업무'];
    const labelHtml = labelOptions.map(l => `<option value="${l}" ${l === t.label ? 'selected' : ''}>${l}</option>`).join('');

    const priorityOptions = [['🟡 보통','보통'],['🔴 긴급','긴급'],['🔵 낮음','낮음']];
    const priorityHtml = priorityOptions.map(([v,l]) => `<option value="${v}" ${v === t.priority ? 'selected' : ''}>${l}</option>`).join('');

    body.innerHTML = `
        <div class="form-group"><label class="form-label">할 일</label><input type="text" class="form-input" id="editTaskName" value="${t.task.replace(/\s*\(마감일\)\s*$/, '')}" ></div>
        <div class="form-group"><label class="form-label">담당자</label><select class="form-select" id="editTaskAssignee">${assigneeHtml}</select></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" id="editTaskDate" value="${t.date}"></div>
            <div class="form-group"><label class="form-label">마감일</label><input type="date" class="form-input" id="editTaskDeadline" value="${t.deadline || ''}"></div>
        </div>
        <div class="form-group"><label class="form-label">라벨</label><select class="form-select" id="editTaskLabel">${labelHtml}</select></div>
        <div class="form-group"><label class="form-label">우선순위</label><select class="form-select" id="editTaskPriority">${priorityHtml}</select></div>
        <div class="form-group"><label class="form-label">고객사</label>${buildClientDatalistField('editTaskClient', t.client || '', 'editClientList')}</div>
        <div style="display:flex;gap:8px;">
            <button class="form-submit" style="flex:1;" onclick="saveEditTask(${id})">수정 완료</button>
            <button class="form-submit" style="flex:0;background:var(--red);min-width:80px;" onclick="deleteTask(${id})">삭제</button>
        </div>`;
    document.getElementById('modalOverlay').classList.add('show'); openModalHistory();
}

async function saveEditTask(id) {
    const t = dailyTasks.find(x => x.id === id);
    if (!t) return;
    const name = document.getElementById('editTaskName').value.trim();
    if (!name) { showToast('할 일을 입력해주세요'); return; }
    const newDeadline = document.getElementById('editTaskDeadline').value || '';
    const newAssignee = document.getElementById('editTaskAssignee').value;
    const newLabel = document.getElementById('editTaskLabel').value || '';
    const newClient = document.getElementById('editTaskClient').value || '';
    const newPriority = document.getElementById('editTaskPriority').value;
    const newDate = document.getElementById('editTaskDate').value;

    // 마감일 복사본을 수정하는 경우, 원본 이름에서 (마감일) 제거한 이름 사용
    const baseName = t.isDeadlineCopy ? name.replace(/\s*\(마감일\)\s*$/, '') : name;

    // 연동된 태스크들도 업데이트
    if (t.linkedGroup) {
        // 공통 필드는 그룹 일괄 업데이트
        await dbUpdateTasksByGroup(t.linkedGroup, {
            assignee: newAssignee, deadline: newDeadline,
            label: newLabel, client: newClient, priority: newPriority
        });
        // task 이름/date는 isDeadlineCopy 여부로 달라짐 → 개별 업데이트
        const linkedList = dailyTasks.filter(x => x.linkedGroup === t.linkedGroup);
        for (const linked of linkedList) {
            linked.assignee = newAssignee;
            linked.deadline = newDeadline;
            linked.label = newLabel;
            linked.client = newClient;
            linked.priority = newPriority;
            if (linked.isDeadlineCopy) {
                linked.task = `${baseName} (마감일)`;
                if (newDeadline) linked.date = newDeadline;
                await dbUpdateTask(linked.id, { task: linked.task, date: linked.date });
            } else {
                linked.task = baseName;
                await dbUpdateTask(linked.id, { task: linked.task });
            }
        }
    } else {
        t.task = name;
        t.assignee = newAssignee;
        t.date = newDate;
        t.deadline = newDeadline;
        t.label = newLabel;
        t.client = newClient;
        t.priority = newPriority;

        await dbUpdateTask(id, {
            task: name, assignee: newAssignee, date: newDate,
            deadline: newDeadline, label: newLabel, client: newClient, priority: newPriority
        });

        // 마감일이 새로 추가된 경우 연동 태스크 생성
        if (newDeadline && newDeadline !== newDate) {
            const groupId = Date.now();
            t.linkedGroup = groupId;
            await dbUpdateTask(id, { linkedGroup: groupId });
            const saved = await dbInsertTask({
                task: `${name} (마감일)`,
                date: newDeadline, assignee: newAssignee, deadline: newDeadline,
                label: newLabel, client: newClient, target: '', priority: newPriority,
                done: t.done, linkedGroup: groupId, isDeadlineCopy: true
            });
            if (saved) dailyTasks.push(saved);
        }
    }

    closeModal(); renderDaily(); renderHome();
    showToast('할 일이 수정되었습니다');
}

async function deleteTask(id) {
    const t = dailyTasks.find(x => x.id === id);
    if (!t) return;
    // 연동된 태스크도 함께 삭제
    if (t.linkedGroup) {
        await dbDeleteTasksByGroup(t.linkedGroup);
        for (let i = dailyTasks.length - 1; i >= 0; i--) {
            if (dailyTasks[i].linkedGroup === t.linkedGroup) dailyTasks.splice(i, 1);
        }
    } else {
        await dbDeleteTask(id);
        const idx = dailyTasks.findIndex(x => x.id === id);
        if (idx !== -1) dailyTasks.splice(idx, 1);
    }
    closeModal(); renderDaily(); renderHome();
    showToast('할 일이 삭제되었습니다');
}

async function inlineAddTask(input, assignee) {
    const task = input.value.trim();
    if (!task) return;
    // 즉시 입력창 비우기 (사용자 피드백) — 다음 입력 이어가게
    input.value = '';
    const saved = await dbInsertTask({
        task, date: fmtDate(currentDate), assignee,
        target: '본사', priority: '🟡 보통', done: false
    });
    if (!saved) {
        input.value = task; // 실패 시 복원
        return;
    }
    if (!dailyTasks.find(t => t.id === saved.id)) dailyTasks.push(saved);
    renderDaily();
    renderHome();
    showToast('할 일이 추가되었습니다');
    // 포커스는 renderDaily 내부 보존 로직이 자동 복원
}

async function toggleTask(id) {
    const task = dailyTasks.find(t => t.id === id);
    if (!task) return;
    const newDone = !task.done;
    task.done = newDone;
    // 연동된 태스크도 동일하게 체크/해제
    if (task.linkedGroup) {
        dailyTasks.filter(t => t.linkedGroup === task.linkedGroup).forEach(t => t.done = newDone);
        await dbUpdateTasksByGroup(task.linkedGroup, { done: newDone });
    } else {
        await dbUpdateTask(id, { done: newDone });
    }
    renderDaily();
    renderHome();
}

// =====================================
// DELIVERIES
// =====================================
function renderDeliveries() {
    let filtered = currentDeliveryTypeFilter === 'all'
        ? deliveries
        : deliveries.filter(d => d.type === currentDeliveryTypeFilter);

    // 연도/월 필터
    if (currentDeliveryYear !== 'all') {
        filtered = filtered.filter(d => d.date.startsWith(currentDeliveryYear));
    }
    if (currentDeliveryMonth !== 'all') {
        filtered = filtered.filter(d => {
            const m = d.date.split('-')[1];
            return m === currentDeliveryMonth;
        });
    }

    if (currentDeliverySearch) {
        filtered = filtered.filter(d =>
            d.recipient.toLowerCase().includes(currentDeliverySearch) ||
            d.product.toLowerCase().includes(currentDeliverySearch) ||
            d.tracking.toLowerCase().includes(currentDeliverySearch)
        );
    }

    // 연도/월 선택 UI 렌더
    renderDateFilter();

    const ratingOptions = ['', 'A 단골가능', 'B 대통령시계', 'C 평범', 'X 블랙'];

    const todayStr = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; })();
    let tableHtml = '';
    let cardHtml = '';
    filtered.forEach(d => {
        const isToday = d.date === todayStr;
        const todayCls = isToday ? ' delivery-today' : '';
        const ratingSelect = `<select class="inline-select" onchange="updateDeliveryRating(${d.id}, this.value)">
            ${ratingOptions.map(r => `<option value="${r}" ${d.rating === r ? 'selected' : ''}>${r || '-'}</option>`).join('')}
        </select>`;

        const trackingCell = `<div class="inline-tracking">
            <input type="text" class="inline-input" id="track-${d.id}" value="${d.tracking}" placeholder="운송장번호" onchange="autoSaveTracking(${d.id})">
            <button class="inline-save-btn" onclick="copyTrackingFromInput(${d.id})" title="운송장번호 복사">복사</button>
        </div>`;

        tableHtml += `<tr class="${todayCls.trim()}">
            <td class="td-check"><input type="checkbox" class="delivery-check" data-id="${d.id}" ${d._checked ? 'checked' : ''}></td>
            <td class="cell-editable" data-id="${d.id}" data-field="date" data-type="date">${fmtDisplay(d.date)}${isToday ? ' <span class="today-badge">오늘</span>' : ''}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="type" data-type="select" data-options="일반,중고,번개,당근,GS반택,ETSY"><span class="badge ${typeBadgeClass(d.type)}">${d.type}</span></td>
            <td class="cell-editable" data-id="${d.id}" data-field="sender" data-type="select" data-options="케이엘피코리아,김관택,이현주,김현호,유지은,구정두,황선영,(이현주),기타" style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.sender}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="recipient" style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><strong>${d.recipient}</strong></td>
            <td class="cell-editable" data-id="${d.id}" data-field="phone">${d.phone || '-'}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="zipcode">${d.zipcode || '-'}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="address" style="min-width:320px;word-break:break-all">${d.address}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="payment" data-type="select" data-options="선불,착불">${d.payment}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="product">${d.product}</td>
            <td class="cell-editable delivery-price-col" data-id="${d.id}" data-field="price" data-type="number">${d.price ? d.price.toLocaleString() + '원' : '-'}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="memo">${d.memo || '-'}</td>
            <td><span class="author-badge">${d.author || '-'}</span></td>
            <td>${trackingCell}</td>
            <td>${ratingSelect}</td>
            <td style="white-space:nowrap"><button class="edit-btn" onclick="openEditDelivery(${d.id})">편집</button> <button class="edit-btn" onclick="cloneDelivery(${d.id})" title="오늘 날짜로 복제">복제</button></td>
        </tr>`;

        cardHtml += `<div class="resp-card${todayCls}">
            <div class="resp-card-top">
                <div class="resp-card-title">${d.recipient}${isToday ? ' <span class="today-badge">오늘</span>' : ''}</div>
                <div style="display:flex;gap:6px;align-items:center">
                    <span class="badge ${typeBadgeClass(d.type)}">${d.type}</span>
                    <button class="edit-btn" onclick="openEditDelivery(${d.id})">편집</button>
                    <button class="edit-btn" onclick="cloneDelivery(${d.id})" title="오늘 날짜로 복제">복제</button>
                </div>
            </div>
            <div class="resp-card-meta">
                <div class="resp-card-row"><strong>${d.product}</strong></div>
                <div class="resp-card-row">${d.sender} · ${fmtDisplay(d.date)} · ${d.payment}</div>
                ${d.phone ? `<div class="resp-card-row">${d.phone}</div>` : ''}
                ${d.zipcode ? `<div class="resp-card-row">${d.zipcode} ${d.address}</div>` : `<div class="resp-card-row">${d.address}</div>`}
                <div class="resp-card-row delivery-price-col">${d.price ? d.price.toLocaleString() + '원' : ''}</div>
                ${d.memo ? `<div class="resp-card-row">${d.memo}</div>` : ''}
                <div class="resp-card-row">작성자: <span class="author-badge">${d.author || '-'}</span></div>
                <div class="resp-card-row">${trackingCell}</div>
                <div class="resp-card-row">${ratingSelect}</div>
            </div>
        </div>`;
    });

    document.getElementById('deliveryTableBody').innerHTML = tableHtml;
    document.getElementById('deliveryCardGrid').innerHTML = cardHtml;
}

function renderDateFilter() {
    const container = document.getElementById('deliveryDateFilter');
    if (!container) return;

    // 연도 목록 추출
    const years = [...new Set(deliveries.map(d => d.date.split('-')[0]))].sort().reverse();

    let html = `<select class="date-filter-select" id="deliveryYearSelect" onchange="setDeliveryYear(this.value)">
        <option value="all" ${currentDeliveryYear === 'all' ? 'selected' : ''}>전체 연도</option>
        ${years.map(y => `<option value="${y}" ${currentDeliveryYear === y ? 'selected' : ''}>${y}년</option>`).join('')}
    </select>
    <select class="date-filter-select" id="deliveryMonthSelect" onchange="setDeliveryMonth(this.value)">
        <option value="all" ${currentDeliveryMonth === 'all' ? 'selected' : ''}>전체 월</option>
        ${Array.from({length: 12}, (_, i) => {
            const m = String(i + 1).padStart(2, '0');
            return `<option value="${m}" ${currentDeliveryMonth === m ? 'selected' : ''}>${i + 1}월</option>`;
        }).join('')}
    </select>`;

    container.innerHTML = html;
}

function setDeliveryYear(val) {
    currentDeliveryYear = val;
    renderDeliveries();
}

function setDeliveryMonth(val) {
    currentDeliveryMonth = val;
    renderDeliveries();
}

function openEditDelivery(id) {
    const d = deliveries.find(x => x.id === id);
    if (!d) return;

    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    title.textContent = '택배 편집';
    body.innerHTML = `
        <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" id="editDelDate" value="${d.date}"></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">받는이</label><input type="text" class="form-input" id="editDelRecipient" value="${d.recipient}"></div>
            <div class="form-group"><label class="form-label">연락처</label><input type="text" class="form-input" id="editDelPhone" value="${d.phone}" placeholder="010-0000-0000" maxlength="14"></div>
        </div>
        <div class="form-row" style="grid-template-columns:100px 1fr">
            <div class="form-group"><label class="form-label">우편번호</label><input type="text" class="form-input" id="editDelZipcode" value="${d.zipcode}" placeholder="00000" maxlength="5"></div>
            <div class="form-group"><label class="form-label">주소</label><input type="text" class="form-input" id="editDelAddress" value="${d.address}" placeholder="배송 주소"></div>
        </div>
        <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
            <div class="form-group"><label class="form-label">종류</label>
                <select class="form-select" id="editDelType">
                    ${['일반','중고','번개','당근','GS반택','ETSY'].map(t => `<option value="${t}" ${d.type === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label class="form-label">발송인</label>
                ${(() => {
                    const senders = ['케이엘피코리아','김관택','이현주','김현호','유지은','구정두','황선영','(이현주)'];
                    const isCustom = d.sender && !senders.includes(d.sender);
                    const opts = senders.map(s => `<option value="${s}" ${d.sender === s ? 'selected' : ''}>${s}</option>`).join('');
                    return `<select class="form-select" id="editDelSender">
                        ${opts}
                        <option value="__custom" ${isCustom ? 'selected' : ''}>기타 (직접입력)</option>
                    </select>
                    <input type="text" class="form-input" id="editDelSenderCustom" placeholder="발송인을 입력하세요" value="${isCustom ? d.sender : ''}" style="display:${isCustom ? 'block' : 'none'};margin-top:6px">`;
                })()}
            </div>
            <div class="form-group"><label class="form-label">선/착불</label>
                <select class="form-select" id="editDelPayment">
                    <option value="선불" ${d.payment === '선불' ? 'selected' : ''}>선불</option>
                    <option value="착불" ${d.payment === '착불' ? 'selected' : ''}>착불</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">품목</label><input type="text" class="form-input" id="editDelProduct" value="${d.product}" placeholder="품목"></div>
            <div class="form-group delivery-price-col"><label class="form-label">판매가</label><input type="number" class="form-input" id="editDelPrice" value="${d.price || ''}" placeholder="0"></div>
        </div>
        <div class="form-group"><label class="form-label">배송메모</label><input type="text" class="form-input" id="editDelMemo" value="${d.memo}" placeholder="배송메모"></div>
        <div class="form-actions">
            <button class="form-submit" onclick="saveEditDelivery(${d.id})">저장</button>
            <button class="form-delete-btn" onclick="deleteDelivery(${d.id})">삭제</button>
        </div>`;
    document.getElementById('editDelPhone').addEventListener('input', formatPhoneInput);
    // 편집 모달 발송인 기타 토글
    const editSender = document.getElementById('editDelSender');
    if (editSender) {
        editSender.addEventListener('change', function() {
            const custom = document.getElementById('editDelSenderCustom');
            if (this.value === '__custom') {
                custom.style.display = 'block';
                custom.focus();
            } else {
                custom.style.display = 'none';
                custom.value = '';
            }
        });
    }
    document.getElementById('modalOverlay').classList.add('show'); openModalHistory();
}

async function saveEditDelivery(id) {
    const d = deliveries.find(x => x.id === id);
    if (!d) return;
    const patch = {
        date: document.getElementById('editDelDate').value,
        recipient: document.getElementById('editDelRecipient').value.trim(),
        phone: document.getElementById('editDelPhone').value.trim(),
        zipcode: document.getElementById('editDelZipcode').value.trim(),
        address: document.getElementById('editDelAddress').value.trim(),
        type: document.getElementById('editDelType').value,
        sender: (() => {
            const sel = document.getElementById('editDelSender').value;
            if (sel !== '__custom') return sel;
            return document.getElementById('editDelSenderCustom').value.trim() || '기타';
        })(),
        payment: document.getElementById('editDelPayment').value,
        product: document.getElementById('editDelProduct').value.trim(),
        price: parseInt(document.getElementById('editDelPrice').value) || 0,
        memo: document.getElementById('editDelMemo').value.trim()
    };
    Object.assign(d, patch);
    await dbUpdateDelivery(id, patch);
    closeModal();
    renderDeliveries();
    renderHome();
    showToast('택배가 수정되었습니다');
}

async function cloneDelivery(id) {
    const src = deliveries.find(x => x.id === id);
    if (!src) { showToast('원본 택배를 찾을 수 없습니다'); return; }
    if (!confirm(`"${src.recipient}" 택배를 오늘 날짜로 복제하시겠습니까?`)) return;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const saved = await dbInsertDelivery({
        date: todayStr,
        type: src.type,
        sender: src.sender,
        recipient: src.recipient,
        phone: src.phone,
        product: src.product,
        zipcode: src.zipcode,
        address: src.address,
        payment: src.payment,
        price: src.price,
        memo: src.memo,
        tracking: '',
        rating: src.rating,
        seller: src.seller || '1',
        author: currentUser ? currentUser.name : '-'
    });
    if (!saved) return;
    deliveries.unshift(saved);
    renderDeliveries();
    renderHome();
    showToast('택배가 복제되었습니다 (오늘 날짜)');
}

async function deleteDelivery(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await dbDeleteDelivery(id);
    const idx = deliveries.findIndex(x => x.id === id);
    if (idx !== -1) deliveries.splice(idx, 1);
    closeModal();
    renderDeliveries();
    renderHome();
    showToast('택배가 삭제되었습니다');
}

function copyTracking(num) {
    navigator.clipboard.writeText(num).then(() => showToast('운송장번호가 복사되었습니다')).catch(() => showToast('복사 실패'));
}

async function saveTracking(id) {
    const d = deliveries.find(x => x.id === id);
    if (!d) return;
    const input = document.getElementById(`track-${id}`);
    d.tracking = input.value.trim();
    await dbUpdateDelivery(id, { tracking: d.tracking });
    showToast('운송장번호가 저장되었습니다');
}

// 인라인 입력: 값이 바뀌면 자동 저장 (포커스 아웃 또는 Enter 시 onchange 발생)
async function autoSaveTracking(id) {
    const d = deliveries.find(x => x.id === id);
    if (!d) return;
    const input = document.getElementById(`track-${id}`);
    if (!input) return;
    const next = input.value.trim();
    if (next === (d.tracking || '')) return;
    d.tracking = next;
    await dbUpdateDelivery(id, { tracking: next });
    showToast(next ? '운송장번호가 저장되었습니다' : '운송장번호가 삭제되었습니다');
}

// 인라인 입력 옆 복사 버튼: 입력창의 현재 값을 클립보드에 복사
function copyTrackingFromInput(id) {
    const input = document.getElementById(`track-${id}`);
    if (!input) return;
    const num = input.value.trim();
    if (!num) {
        showToast('복사할 운송장번호가 없습니다');
        return;
    }
    copyTracking(num);
}

async function saveDetailTracking(id) {
    const d = deliveries.find(x => x.id === id);
    if (!d) return;
    const input = document.getElementById(`detail-track-${id}`);
    d.tracking = input.value.trim();
    await dbUpdateDelivery(id, { tracking: d.tracking });
    renderDeliveries();
    showToast('운송장번호가 저장되었습니다');
}

async function updateDeliveryRating(id, value) {
    const d = deliveries.find(x => x.id === id);
    if (!d) return;
    d.rating = value;
    await dbUpdateDelivery(id, { rating: value });
    showToast('평가가 저장되었습니다');
}

// =====================================
// DETAIL PANELS
// =====================================
async function showProjectDetail(id) {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    title.textContent = `${p.client || ''} — ${p.name}`;

    const escFn = s => (s || '').toString().replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
    const row = (label, val) => `<div class="m-detail-row" style="display:flex;gap:10px;padding:5px 0;border-bottom:1px solid var(--gray-100)"><div style="width:100px;color:var(--gray-500);font-size:12px;font-weight:600">${label}</div><div style="flex:1;font-size:14px;color:var(--gray-900)">${escFn(val) || '-'}</div></div>`;

    // 금액 계산
    const revenue = p.revenue || 0;
    const purchaseTotal = p.supplierRevenue || 0;
    const margin = revenue - purchaseTotal;
    const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;
    const hasSupplier = !!(p.supplier && p.supplierUnitPrice);
    const qty = p.qty || 0;

    // 부가비용 환산
    const feeCompute = (fee, vatLabel, applyLabel) => {
        if (!fee) return 0;
        const perUnit = (applyLabel || '1개당') !== '일괄';
        let total = perUnit ? fee * qty : fee;
        if ((vatLabel || 'VAT 별도') === 'VAT 별도') total = Math.round(total * 1.1);
        return total;
    };

    // 매출 내역
    const salesVatLabel = p.vat === 'include' ? 'VAT 포함' : 'VAT 별도';
    const salesProduct = salesVatLabel === 'VAT 별도'
        ? Math.round((p.unitPrice || 0) * qty * 1.1)
        : (p.unitPrice || 0) * qty;
    const salesPrint = feeCompute(p.printFee, p.printFeeVat, p.printFeeApply);
    const salesPack = feeCompute(p.packagingFee, p.packagingFeeVat, p.packagingFeeApply);

    // 배송비 계산
    const shipCompute = (cost, vatLabel) => {
        if (!cost) return 0;
        if ((vatLabel || 'VAT 별도') === 'VAT 별도') return Math.round(cost * 1.1);
        return cost;
    };
    const salesShipRaw = p.shippingCost || 0;
    const salesShip = shipCompute(salesShipRaw, p.shippingVat);
    const salesShipLabel = p.shippingType ? `${p.shippingType}` : '';

    // 매입 내역
    const supVatLabel = p.supplierUnitPriceVat || 'VAT 별도';
    const supProduct = supVatLabel === 'VAT 별도'
        ? Math.round((p.supplierUnitPrice || 0) * qty * 1.1)
        : (p.supplierUnitPrice || 0) * qty;
    const supPrint = feeCompute(p.supplierPrintFee, p.supplierPrintFeeVat, p.supplierPrintFeeApply);
    const supPack = feeCompute(p.supplierPackagingFee, p.supplierPackagingFeeVat, p.supplierPackagingFeeApply);
    const supShipRaw = p.supplierShippingCost || 0;
    const supShip = shipCompute(supShipRaw, p.supplierShippingVat);
    const supShipLabel = p.supplierShippingType ? `${p.supplierShippingType}` : '';

    // D-Day
    let dday = '';
    if (p.deadline) {
        const today = new Date(); today.setHours(0,0,0,0);
        const d = new Date(p.deadline);
        const diff = Math.round((d - today) / 86400000);
        if (diff > 0) dday = `D-${diff}`;
        else if (diff === 0) dday = 'D-DAY';
        else dday = `D+${-diff}`;
    }

    // 체크리스트
    const checks = p.checks || {};
    const checksHtml = CHECK_ITEMS.map(item => {
        const done = !!checks[item.key];
        return `<div onclick="toggleProjectCheck(${id},'${item.key}');setTimeout(()=>showProjectDetail(${id}),50)" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:${done ? 'var(--blue-light)' : 'var(--gray-50)'};border:1px solid ${done ? 'var(--blue)' : 'var(--gray-200)'};border-radius:8px;font-size:13px;cursor:pointer;transition:all .15s;color:var(--gray-900)">
            <span style="display:inline-flex;width:18px;height:18px;border-radius:50%;background:${done ? 'var(--blue)' : 'var(--gray-300)'};color:white;align-items:center;justify-content:center;font-size:12px;font-weight:700">${done ? '✓' : ''}</span>
            <span style="font-weight:${done ? '700' : '500'}">${item.label}</span>
        </div>`;
    }).join('');

    const secTitle = (icon, text) =>`<div style="display:flex;align-items:center;gap:6px;font-size:14px;font-weight:800;color:var(--gray-900);padding-bottom:8px;margin-bottom:10px;border-bottom:2px solid var(--gray-200)">${icon} ${text}</div>`;
    const cardBase = 'background:var(--white);border:1px solid var(--gray-200);border-radius:10px;padding:14px 18px;margin-bottom:14px;color:var(--gray-900)';
    const brLine = (label, val) => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:var(--gray-500)">${label}</span><strong style="color:var(--gray-900)">${val.toLocaleString()}원</strong></div>`;

    body.innerHTML = `
        <!-- 헤더 -->
        <div style="margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">
                <span class="badge ${statusBadgeClass(p.status)}">${p.status}</span>
                <span class="badge ${categoryBadgeClass(p.category)}">${p.category}</span>
                ${p.sourceDocNumber ? `<span class="badge" style="background:var(--blue-light);color:var(--blue)">DC ${escFn(p.sourceDocNumber)}</span>` : ''}
            </div>
            <h3 style="margin:0;font-size:20px;font-weight:800;color:var(--gray-900)">${escFn(p.client)}</h3>
            <div style="font-size:14px;color:var(--gray-500);margin-top:2px">${escFn(p.name)}</div>
        </div>

        <!-- 요약 스트립 -->
        <div class="m-detail-summary has-dday" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
            <div style="background:var(--blue-light);border:1px solid var(--gray-200);border-radius:10px;padding:12px;text-align:center">
                <div style="font-size:11px;color:var(--gray-500);font-weight:700;margin-bottom:4px">매출</div>
                <div style="font-size:17px;font-weight:800;color:var(--blue)">${revenue.toLocaleString()}<span style="font-size:12px">원</span></div>
            </div>
            <div style="background:${hasSupplier ? 'var(--orange-light)' : 'var(--gray-50)'};border:1px solid var(--gray-200);border-radius:10px;padding:12px;text-align:center">
                <div style="font-size:11px;color:var(--gray-500);font-weight:700;margin-bottom:4px">매입</div>
                <div style="font-size:17px;font-weight:800;color:${hasSupplier ? 'var(--orange)' : 'var(--gray-500)'}">${hasSupplier ? purchaseTotal.toLocaleString() + '<span style="font-size:12px">원</span>' : '-'}</div>
            </div>
            <div style="background:${hasSupplier ? (margin >= 0 ? 'var(--green-light)' : 'var(--red-light)') : 'var(--gray-50)'};border:1px solid var(--gray-200);border-radius:10px;padding:12px;text-align:center">
                <div style="font-size:11px;color:var(--gray-500);font-weight:700;margin-bottom:4px">마진 ${hasSupplier ? `(${marginPct}%)` : ''}</div>
                <div style="font-size:17px;font-weight:800;color:${hasSupplier ? (margin >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--gray-500)'}">${hasSupplier ? margin.toLocaleString() + '<span style="font-size:12px">원</span>' : '-'}</div>
            </div>
            <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:10px;padding:12px;text-align:center">
                <div style="font-size:11px;color:var(--gray-500);font-weight:700;margin-bottom:4px">납기 ${dday ? `<span style="color:var(--blue)">${dday}</span>` : ''}</div>
                <div style="font-size:14px;font-weight:800;color:var(--gray-900)">${p.deadline || '-'}</div>
            </div>
        </div>

        <!-- 기본 정보 -->
        <div class="m-sec-card" style="${cardBase}">
            <div class="m-sec-title">${secTitle('📋', '기본 정보')}</div>
            <div class="m-detail-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">
                <div>
                    ${row('매출처', p.client)}
                    ${row('매출처 담당자', p.contactPerson)}
                    ${row('매입처', p.supplier)}
                    ${row('매입처 담당자', p.supplierContact)}
                </div>
                <div>
                    ${row('본사 담당자', p.manager || (p.assignees || []).join(', '))}
                    ${row('상태', p.status)}
                    ${row('시작일', p.startDate)}
                    ${row('납기일', p.deadline)}
                </div>
            </div>
        </div>

        <!-- 제품 정보 -->
        <div class="m-sec-card" style="${cardBase}">
            <div class="m-sec-title">${secTitle('📦', '제품 정보')}</div>
            <div class="m-detail-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">
                <div>
                    ${row('품명', p.name)}
                    ${row('수량', `${qty.toLocaleString()} ${p.unit || ''}`)}
                    ${row('색상', p.color)}
                </div>
                <div>
                    ${row('인쇄 색상 및 사이즈', p.printColorSize)}
                    ${row('인쇄 방법', p.printMethod)}
                    ${row('포장', p.packaging)}
                    ${p.shippingType ? row('배송', `${p.shippingType}${p.shippingType === '택배' && p.shippingBoxes ? ` (${p.shippingBoxes}박스)` : ''}`) : ''}
                </div>
            </div>
        </div>

        <!-- 금액 상세 (매출·매입 나란히) -->
        <div class="m-finance-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
            <div style="background:var(--blue-light);border:1.5px solid var(--gray-200);border-left:4px solid var(--blue);border-radius:10px;padding:14px 16px;color:var(--gray-900)">
                <div style="font-size:14px;font-weight:800;color:var(--blue);padding-bottom:8px;margin-bottom:8px;border-bottom:2px solid var(--gray-200)">💰 매출 상세</div>
                <div style="font-size:11px;color:var(--gray-500);margin-bottom:6px">단가 ${(p.unitPrice||0).toLocaleString()}원 × ${qty.toLocaleString()}${p.unit||''} (${salesVatLabel})</div>
                ${brLine('제품 합계', salesProduct)}
                ${brLine('＋ 인쇄비', salesPrint)}
                ${brLine('＋ 포장비', salesPack)}
                ${salesShip ? brLine(`＋ 배송비 (${salesShipLabel})`, salesShip) : ''}
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;margin-top:8px;background:var(--white);border:1px solid var(--gray-200);border-radius:8px">
                    <span style="font-weight:800;color:var(--blue);font-size:13px">매출액</span>
                    <strong style="font-size:18px;color:var(--blue)">${revenue.toLocaleString()}원</strong>
                </div>
            </div>
            <div style="background:${hasSupplier ? 'var(--orange-light)' : 'var(--gray-50)'};border:1.5px solid var(--gray-200);border-left:4px solid ${hasSupplier ? 'var(--orange)' : 'var(--gray-300)'};border-radius:10px;padding:14px 16px;color:var(--gray-900)">
                <div style="font-size:14px;font-weight:800;color:${hasSupplier ? 'var(--orange)' : 'var(--gray-500)'};padding-bottom:8px;margin-bottom:8px;border-bottom:2px solid var(--gray-200)">🏭 매입 상세</div>
                ${!hasSupplier ? `<div style="color:var(--gray-500);font-size:13px;padding:20px 0;text-align:center">매입처 정보 없음</div>` : `
                    <div style="font-size:11px;color:var(--gray-500);margin-bottom:6px">매입단가 ${(p.supplierUnitPrice||0).toLocaleString()}원 × ${qty.toLocaleString()}${p.unit||''} (${supVatLabel})</div>
                    ${brLine('제품 합계', supProduct)}
                    ${brLine('＋ 매입 인쇄비', supPrint)}
                    ${brLine('＋ 매입 포장비', supPack)}
                    ${supShip ? brLine(`＋ 매입 배송비 (${supShipLabel})`, supShip) : ''}
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;margin-top:8px;background:var(--white);border:1px solid var(--gray-200);border-radius:8px">
                        <span style="font-weight:800;color:var(--orange);font-size:13px">매입액</span>
                        <strong style="font-size:18px;color:var(--orange)">${purchaseTotal.toLocaleString()}원</strong>
                    </div>
                `}
            </div>
        </div>

        <!-- 납기 및 배송 -->
        <div class="m-sec-card" style="${cardBase}">
            <div class="m-sec-title">${secTitle('🚚', '납기 및 배송')}</div>
            <div class="m-detail-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">
                <div>
                    ${row('납기일', p.deadline)}
                    ${row('수령인', p.recipient)}
                </div>
                <div>
                    ${row('연락처', p.phone)}
                    ${row('주소', p.address)}
                </div>
            </div>
        </div>

        <!-- 체크리스트 -->
        <div class="m-sec-card" style="${cardBase}">
            <div class="m-sec-title">${secTitle('✅', '진행 체크리스트')}</div>
            <div class="m-detail-4col" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${checksHtml}</div>
        </div>

        <!-- 디자인확인서 / 작업요청서 2열 -->
        <div class="m-doc-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
            <div style="background:var(--white);border:1px solid var(--gray-200);border-radius:10px;padding:14px 16px;color:var(--gray-900);min-width:0">
                ${secTitle('🖼️', '디자인확인서')}
                <div id="dcDocArea">${p.sourceDocNumber ? `<div style="color:var(--gray-500);font-size:13px">디자인확인서 로딩 중...</div>` : `<div style="color:var(--gray-500);font-size:13px;padding:12px;background:var(--gray-50);border-radius:8px">연결된 디자인확인서가 없습니다. 상단의 "디자인확인서 만들기" 버튼으로 생성하세요.</div>`}</div>
            </div>
            <div style="background:var(--white);border:1px solid var(--gray-200);border-radius:10px;padding:14px 16px;color:var(--gray-900);min-width:0">
                ${secTitle('📋', '작업요청서')}
                <div id="wrDocArea">${p.sourceDocNumber ? `<div style="color:var(--gray-500);font-size:13px">작업요청서 로딩 중...</div>` : `<div style="color:var(--gray-500);font-size:13px;padding:12px;background:var(--gray-50);border-radius:8px">디자인확인서가 먼저 연결되어야 작업요청서를 조회할 수 있습니다</div>`}</div>
            </div>
        </div>

        ${p.memo ? `
        <div style="background:var(--yellow-light);border:1px solid var(--gray-200);border-left:4px solid var(--yellow);border-radius:10px;padding:12px 16px;margin-bottom:14px;color:var(--gray-900)">
            <div style="font-size:11px;color:var(--yellow);font-weight:800;margin-bottom:4px">📝 메모</div>
            <div style="font-size:13px;white-space:pre-wrap;color:var(--gray-900)">${escFn(p.memo)}</div>
        </div>` : ''}

        <!-- 액션 버튼 -->
        <div class="m-detail-actions" style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
            <button class="form-submit" style="flex:1 1 180px;background:var(--blue)" onclick="createDocFromProject(${id},'dc')">📄 디자인확인서 만들기</button>
            <button class="form-submit" style="flex:1 1 180px;background:var(--klp-orange,#E67E22)" onclick="createDocFromProject(${id},'wr')">📋 작업요청서 만들기</button>
            <button class="form-submit" style="flex:1 1 160px;background:#16A34A" onclick="createQuoteFromProject(${id})">💰 견적서 만들기</button>
            <button class="form-submit" style="flex:1 1 120px" onclick="openEditProject(${id})">✏️ 편집</button>
            <button class="form-submit" style="flex:1 1 100px;background:var(--gray-200);color:var(--gray-800)" onclick="closeModal()">닫기</button>
        </div>`;
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.add('show'); openModalHistory();
    overlay.classList.add('modal-wide');

    // DC / WR 비동기 로드
    if (p.sourceDocNumber) {
        const renderDocCard = (r, kind) => {
            const titleColor = kind === 'DC' ? 'var(--blue)' : 'var(--orange)';
            const bg = kind === 'DC' ? 'var(--blue-light)' : 'var(--orange-light)';
            const viewUrl = `doc-generator.html#view-${encodeURIComponent(r.doc_number)}`;
            const imgHtml = `<div style="border-radius:8px;overflow:hidden;border:1px solid var(--gray-200);background:var(--white)"><iframe src="${viewUrl}" style="width:100%;aspect-ratio:794/1123;height:auto;border:0;display:block;background:#fff" loading="lazy" title="${escFn(r.doc_number)}"></iframe><div style="padding:6px 10px;background:var(--gray-50);border-top:1px solid var(--gray-200);text-align:right"><a href="${viewUrl}" target="_blank" style="font-size:11px;color:${titleColor};text-decoration:none;font-weight:700">새 탭에서 크게 보기 ↗</a></div></div>`;
            const clientLine = `${escFn(r.company_name || '')}${r.title ? ' — ' + escFn(r.title) : ''}`;
            return `<div style="background:${bg};border:1px solid var(--gray-200);border-radius:10px;padding:12px 14px;margin-bottom:10px;color:var(--gray-900)">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;flex-wrap:wrap">
                    <div style="min-width:0">
                        <div style="font-size:11px;color:${titleColor};font-weight:800">${escFn(r.doc_number)}</div>
                        <div style="font-size:13px;color:var(--gray-900);font-weight:700;margin-top:2px">${clientLine}</div>
                        ${r.product_name ? `<div style="font-size:12px;color:var(--gray-500);margin-top:2px">${escFn(r.product_name)}</div>` : ''}
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0">
                        <button onclick="downloadDoc('${escFn(r.doc_number)}','jpg')" style="padding:6px 12px;border:1.5px solid ${titleColor};border-radius:6px;background:var(--white);color:${titleColor};font-size:12px;font-weight:700;cursor:pointer">📷 JPG</button>
                        <button onclick="downloadDoc('${escFn(r.doc_number)}','pdf')" style="padding:6px 12px;border:1.5px solid ${titleColor};border-radius:6px;background:var(--white);color:${titleColor};font-size:12px;font-weight:700;cursor:pointer">📄 PDF</button>
                    </div>
                </div>
                ${imgHtml}
            </div>`;
        };

        // DC 로드
        try {
            const { data: dcData, error: dcErr } = await sb.from('confirmations')
                .select('*')
                .eq('doc_number', p.sourceDocNumber)
                .limit(1);
            const dcEl = document.getElementById('dcDocArea');
            if (dcEl) {
                if (dcErr || !dcData || dcData.length === 0) {
                    dcEl.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px">디자인확인서를 찾을 수 없습니다 (문서번호: ${escFn(p.sourceDocNumber)})</div>`;
                } else {
                    dcEl.innerHTML = renderDocCard(dcData[0], 'DC');
                }
            }
        } catch (err) {
            const dcEl = document.getElementById('dcDocArea');
            if (dcEl) dcEl.innerHTML = `<div style="color:var(--red);font-size:13px">DC 로드 실패: ${err.message}</div>`;
        }

        // WR 로드 (doc_number 가 `DC번호_` 로 시작하는 것들)
        try {
            const prefix = p.sourceDocNumber + '_';
            const { data: wrData, error: wrErr } = await sb.from('confirmations')
                .select('*')
                .like('doc_number', prefix + '%')
                .order('doc_number', { ascending: true });
            const wrEl = document.getElementById('wrDocArea');
            if (wrEl) {
                if (wrErr) {
                    wrEl.innerHTML = `<div style="color:var(--red);font-size:13px">WR 로드 실패: ${wrErr.message}</div>`;
                } else {
                    const wrs = (wrData || []).filter(d => d.doc_number && d.doc_number.startsWith(prefix) && d.status === '작업요청서');
                    if (wrs.length === 0) {
                        wrEl.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px;padding:12px;background:var(--gray-50);border-radius:8px">저장된 작업요청서가 없습니다. 상단의 "작업요청서 만들기" 버튼으로 생성하세요.</div>`;
                    } else {
                        wrEl.innerHTML = wrs.map(r => renderDocCard(r, 'WR')).join('');
                    }
                }
            }
        } catch (err) {
            const wrEl = document.getElementById('wrDocArea');
            if (wrEl) wrEl.innerHTML = `<div style="color:var(--red);font-size:13px">WR 로드 실패: ${err.message}</div>`;
        }
    }
}

// 프로젝트 → 견적서 만들기 (연결된 디자인확인서 기준)
function createQuoteFromProject(id) {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    if (!p.sourceDocNumber) {
        showToast('연결된 디자인확인서가 없습니다. 먼저 디자인확인서를 만들어주세요');
        return;
    }
    // 새 탭에서 견적서 오버레이 표시
    window.open('doc-generator.html#quote-' + encodeURIComponent(p.sourceDocNumber), '_blank');
}

// 상세보기의 DC/WR 다운로드 버튼 — 이미 떠 있는 iframe의 뷰를 사용해 그 자리에서 다운로드
function downloadDoc(docNum, fmt) {
    const iframes = document.querySelectorAll('#dcDocArea iframe, #wrDocArea iframe');
    let target = null;
    iframes.forEach(f => {
        const src = f.getAttribute('src') || '';
        // 해시 전체가 완전히 일치하는 iframe만 선택 (WR 문서번호가 DC 문서번호의 접미사라서 indexOf로 매칭하면 잘못된 iframe을 고름)
        const m = src.match(/#view-(.+)$/);
        if (m && decodeURIComponent(m[1]) === docNum) target = f;
    });
    if (!target || !target.contentWindow || typeof target.contentWindow.klpEmbedDownload !== 'function') {
        // fallback: 예전 방식
        window.open('doc-generator.html#dl-' + fmt + '-' + docNum, '_blank');
        return;
    }
    showToast(fmt.toUpperCase() + ' 생성 중...');
    try {
        const ret = target.contentWindow.klpEmbedDownload(fmt);
        if (ret && typeof ret.then === 'function') {
            ret.then(() => showToast(fmt.toUpperCase() + ' 다운로드 완료'))
               .catch(e => { console.error(e); showToast('다운로드 실패: ' + e.message); });
        }
    } catch (e) {
        console.error(e);
        showToast('다운로드 실패: ' + e.message);
    }
}

// =====================================
// 프로젝트 → 문서생성기 (DC/WR) prefill 이동
// =====================================
async function createDocFromProject(id, type) {
    const p = projects.find(x => x.id === id);
    if (!p) return;

    // WR 사전 조건 체크
    if (type === 'wr') {
        if (!p.sourceDocNumber) {
            showToast('먼저 디자인확인서를 만들어주세요');
            return;
        }
        if (!p.supplierUnitPrice) {
            showToast('매입 단가가 없습니다. 편집에서 매입처 상세를 먼저 입력해주세요');
            return;
        }
    }

    // 편집 모드로 갈지 신규 모드로 갈지 먼저 결정
    let editDocNumber = null;
    if (type === 'dc' && p.sourceDocNumber) {
        if (!confirm(`이미 연결된 디자인확인서(${p.sourceDocNumber})가 있습니다.\n프로젝트의 현재 데이터로 내용을 덮어써서 편집할까요?`)) {
            return;
        }
        editDocNumber = p.sourceDocNumber;
    } else if (type === 'wr') {
        // 기존 WR 있으면 편집 화면으로 이동
        try {
            const prefix = p.sourceDocNumber + '_';
            const { data } = await sb.from('confirmations')
                .select('doc_number,created_at,status')
                .like('doc_number', prefix + '%')
                .order('created_at', { ascending: false });
            const wrs = (data || []).filter(d => d.doc_number && d.doc_number.startsWith(prefix) && d.status === '작업요청서');
            if (wrs.length > 0) {
                const latest = wrs[0];
                const msg = wrs.length === 1
                    ? `이미 연결된 작업요청서(${latest.doc_number})가 있습니다.\n프로젝트의 현재 데이터로 내용을 덮어써서 편집할까요?`
                    : `이미 작업요청서 ${wrs.length}건이 있습니다.\n가장 최근 작업요청서(${latest.doc_number}) 내용을 프로젝트의 현재 데이터로 덮어써서 편집할까요?`;
                if (!confirm(msg)) return;
                editDocNumber = latest.doc_number;
            }
        } catch (e) {
            console.warn('WR 조회 실패', e);
        }
    }

    const isWr = type === 'wr';
    const prefill = {
        type,
        projectId: p.id,
        linkedDcDocNumber: p.sourceDocNumber || null,
        client: p.client || '',
        contactPerson: p.contactPerson || '',
        title: p.title || '',
        manager: p.manager || '',
        productName: p.name || '',
        quantity: p.qty || '',
        unit: p.unit || '개',
        // DC = 매출 / WR = 매입 값 사용
        unitPrice: isWr ? (p.supplierUnitPrice || '') : (p.unitPrice || ''),
        unitPriceVat: isWr ? (p.supplierUnitPriceVat || 'VAT 별도') : (p.vat === 'include' ? 'VAT 포함' : 'VAT 별도'),
        color: p.color || '-',
        printColorSize: p.printColorSize || '시안 확인',
        printMethod: p.printMethod || '없음',
        printFee: isWr ? (p.supplierPrintFee || 0) : (p.printFee || 0),
        printFeeVat: isWr ? (p.supplierPrintFeeVat || 'VAT 별도') : (p.printFeeVat || 'VAT 별도'),
        printFeeApply: isWr ? (p.supplierPrintFeeApply || '1개당') : (p.printFeeApply || '1개당'),
        packaging: p.packaging || '개별박스',
        packagingFee: isWr ? (p.supplierPackagingFee || 0) : (p.packagingFee || 0),
        packagingFeeVat: isWr ? (p.supplierPackagingFeeVat || 'VAT 별도') : (p.packagingFeeVat || 'VAT 별도'),
        packagingFeeApply: isWr ? (p.supplierPackagingFeeApply || '1개당') : (p.packagingFeeApply || '1개당'),
        shippingType: isWr ? (p.supplierShippingType || '') : (p.shippingType || ''),
        shippingCost: isWr ? (p.supplierShippingCost || 0) : (p.shippingCost || 0),
        shippingCostPerBox: isWr ? (p.supplierShippingCostPerBox || 0) : (p.shippingCostPerBox || 0),
        shippingBoxes: isWr ? (p.supplierShippingBoxes || 0) : (p.shippingBoxes || 0),
        shippingVat: isWr ? (p.supplierShippingVat || 'VAT 별도') : (p.shippingVat || 'VAT 별도'),
        deliveryDate: p.deadline || '',
        recipient: p.recipient || '',
        phone: p.phone || '',
        address: p.address || '',
        startDate: p.startDate || '',
        supplier: p.supplier || '',
        supplierContact: p.supplierContact || ''
    };
    try {
        localStorage.setItem('klp_doc_prefill', JSON.stringify(prefill));
    } catch (e) {
        console.error('prefill 저장 실패', e);
        showToast('사전 입력 저장 실패');
        return;
    }
    if (editDocNumber) {
        location.href = 'doc-generator.html#edit-' + encodeURIComponent(editDocNumber);
    } else {
        location.href = `doc-generator.html#${type}`;
    }
}

function openEditProject(id) {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    const isDomestic = p.category !== '해외 주문';
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    title.textContent = isDomestic ? '국내 프로젝트 수정' : '해외 프로젝트 수정';

    const checkDetails = {
        design: { label: '디확 컨펌', desc: '디자인 확인서 컨펌 완료' },
        workOrder: { label: '작지 발송', desc: '작업 지시서 발송 완료' },
        advancePayment: { label: '선금 입금', desc: '선금(계약금) 입금 확인' },
        finalPayment: { label: '잔금 입금', desc: '잔금 입금 확인' },
        invoice: { label: '계산서 발행', desc: '세금계산서 발행 완료' },
        supplierPayment: { label: '공급처 송금', desc: '공급처(협력업체) 대금 송금' },
        delivered: { label: '납품 완료', desc: '최종 납품 완료' }
    };
    const statusOpts = ['시작 전', '진행 중', '완료'];
    const vatCurrent = p.vat === 'include' ? 'include' : 'exclude';

    const checksHtml = Object.entries(checkDetails).map(([key, info]) => `
        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px;cursor:pointer;font-size:14px;border:1px solid var(--gray-100);border-radius:8px;background:var(--gray-50)">
            <input type="checkbox" id="editCheck-${key}" ${p.checks && p.checks[key] ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;margin-top:2px">
            <div style="flex:1">
                <div style="font-weight:700;color:var(--gray-900)">${info.label}</div>
                <div style="font-size:12px;color:var(--gray-500);margin-top:2px">${info.desc}</div>
            </div>
        </label>`).join('');

    const secCard = (inner) => `<div style="background:var(--white);border:1px solid var(--gray-200);border-radius:10px;padding:16px 20px;margin-bottom:16px;color:var(--gray-900)">${inner}</div>`;
    const printFeeVat = p.printFeeVat || 'VAT 별도';
    const printFeeApply = p.printFeeApply || '1개당';
    const packagingFeeVat = p.packagingFeeVat || 'VAT 별도';
    const packagingFeeApply = p.packagingFeeApply || '1개당';
    const supVatCurrent = p.supplierVat === 'include' || p.supplierUnitPriceVat === 'VAT 포함' ? 'include' : 'exclude';
    const supPrintFeeVat = p.supplierPrintFeeVat || 'VAT 별도';
    const supPrintFeeApply = p.supplierPrintFeeApply || '1개당';
    const supPackFeeVat = p.supplierPackagingFeeVat || 'VAT 별도';
    const supPackFeeApply = p.supplierPackagingFeeApply || '1개당';

    body.innerHTML = `
        <datalist id="clientsListDoc">${clients.map(c => `<option value="${(c.companyName || '').replace(/"/g, '&quot;')}"></option>`).join('')}</datalist>

        ${secCard(`
            <div class="form-section-title">📋 기본 정보</div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">매출처 <span style="color:var(--red)">*</span></label><input type="text" class="form-input" id="editProjectClient" list="clientsListDoc" autocomplete="off" value="${(p.client || '').replace(/"/g, '&quot;')}"></div>
                <div class="form-group"><label class="form-label">매출처 담당자</label><input type="text" class="form-input" id="editProjectContact" value="${(p.contactPerson || '').replace(/"/g, '&quot;')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">매입처 (작업요청서 발송 공장)</label><input type="text" class="form-input" id="editProjectSupplier" list="clientsListDoc" autocomplete="off" value="${(p.supplier || '').replace(/"/g, '&quot;')}" placeholder="공장/제작처 — 입력 시 매입처 상세 섹션이 나타납니다" oninput="toggleEditSupplierSection()"></div>
                <div class="form-group"><label class="form-label">매입처 담당자</label><input type="text" class="form-input" id="editProjectSupplierContact" value="${(p.supplierContact || '').replace(/"/g, '&quot;')}" placeholder="공장 담당자명"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">본사 담당자</label>
                    <select class="form-select" id="editProjectManager">
                        ${['이현주 실장','김현호 팀장','유지은 대리'].map(m=>`<option ${p.manager===m?'selected':''}>${m}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group"><label class="form-label">상태</label>
                    <select class="form-select" id="editProjectStatus">
                        ${statusOpts.map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('')}
                    </select>
                </div>
            </div>
        `)}

        ${secCard(`
            <div class="form-section-title">📦 제품 정보</div>
            <div class="form-group"><label class="form-label">품명 <span style="color:var(--red)">*</span></label><input type="text" class="form-input" id="editProjectName" value="${(p.name || '').replace(/"/g, '&quot;')}"></div>
            <div class="form-row" style="grid-template-columns:2fr 1fr">
                <div class="form-group"><label class="form-label">수량</label><input type="text" inputmode="numeric" class="form-input" id="editProjectQty" value="${p.qty ? Number(p.qty).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this);calcEditProjectRevenue();calcEditSupplierTotal()"></div>
                <div class="form-group"><label class="form-label">단위</label>
                    <select class="form-select" id="editProjectUnit">
                        ${['개','세트','장','박스','EA'].map(u=>`<option ${p.unit===u?'selected':''}>${u}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row" style="grid-template-columns:2fr 1fr">
                <div class="form-group"><label class="form-label" style="color:var(--blue);font-weight:800">매출 단가</label><input type="text" inputmode="numeric" class="form-input" id="editProjectUnitPrice" value="${p.unitPrice ? Number(p.unitPrice).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this);calcEditProjectRevenue()"></div>
                <div class="form-group"><label class="form-label">매출 VAT</label>
                    <select class="form-select" id="editProjectVat" onchange="calcEditProjectRevenue()">
                        <option value="exclude" ${vatCurrent==='exclude'?'selected':''}>VAT 별도</option>
                        <option value="include" ${vatCurrent==='include'?'selected':''}>VAT 포함</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">제품 색상</label><input type="text" class="form-input" id="editProjectColor" value="${(p.color || '-').replace(/"/g, '&quot;')}"></div>
                <div class="form-group"><label class="form-label">인쇄 색상 및 사이즈</label><input type="text" class="form-input" id="editProjectPrintColorSize" value="${(p.printColorSize || '').replace(/"/g, '&quot;')}"></div>
            </div>
        `)}

        ${(() => {
            const eHasPrint = (p.printMethod && p.printMethod !== '없음') || Number(p.printFee || p.printCost) > 0;
            const eHasPack = Number(p.packagingFee || p.packCost) > 0 || (p.packaging && p.packaging !== '개별박스');
            return secCard(`
            <div class="form-section-title">🖨️ 인쇄 · 포장 <span style="font-size:12px;font-weight:600;color:var(--blue);margin-left:6px">(매출 기준)</span></div>

            <div id="editPrintSec" style="display:${eHasPrint ? '' : 'none'};border-top:1px dashed var(--gray-200);margin-top:8px;padding-top:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div style="font-size:12px;font-weight:800;color:var(--gray-700);letter-spacing:.5px">🖨️ 인쇄</div>
                    <button type="button" onclick="toggleProjSection('editPrintSec','editPrintAdd',false,'calcEditProjectRevenue')" style="padding:2px 10px;border:1px solid var(--gray-300);background:transparent;color:var(--gray-600);border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">인쇄 방법</label>
                        <select class="form-select" id="editProjectPrintMethod" onchange="toggleCustomInput('editProjectPrintMethod','editProjectPrintMethodCustom')">
                            ${['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사','기타'].map(u=>{
                                const isCustom = !['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사','기타'].includes(p.printMethod);
                                const selected = p.printMethod===u || (u==='기타' && isCustom);
                                return `<option ${selected?'selected':''}>${u}</option>`;
                            }).join('')}
                        </select>
                        <input type="text" class="form-input" id="editProjectPrintMethodCustom" placeholder="인쇄 방법 직접 입력" value="${!['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사','기타',''].includes(p.printMethod) ? p.printMethod : ''}" style="margin-top:6px;display:${!['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사','기타',''].includes(p.printMethod) || p.printMethod==='기타' ? 'block' : 'none'}">
                    </div>
                </div>
                <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                    <div class="form-group"><label class="form-label">인쇄비</label><input type="text" inputmode="numeric" class="form-input" id="editProjectPrintFee" value="${(p.printFee || p.printCost) ? Number(p.printFee || p.printCost).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this);calcEditProjectRevenue()"></div>
                    <div class="form-group"><label class="form-label">VAT</label>
                        <select class="form-select" id="editProjectPrintFeeVat" onchange="calcEditProjectRevenue()">
                            <option ${printFeeVat==='VAT 별도'?'selected':''}>VAT 별도</option>
                            <option ${printFeeVat==='VAT 포함'?'selected':''}>VAT 포함</option>
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">적용 방식</label>
                        <select class="form-select" id="editProjectPrintFeeApply" onchange="calcEditProjectRevenue()">
                            <option ${printFeeApply==='1개당'?'selected':''}>1개당</option>
                            <option ${printFeeApply==='일괄'?'selected':''}>일괄</option>
                        </select>
                    </div>
                </div>
            </div>

            <div id="editPackSec" style="display:${eHasPack ? '' : 'none'};border-top:1px dashed var(--gray-200);margin-top:8px;padding-top:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div style="font-size:12px;font-weight:800;color:var(--gray-700);letter-spacing:.5px">📦 포장</div>
                    <button type="button" onclick="toggleProjSection('editPackSec','editPackAdd',false,'calcEditProjectRevenue')" style="padding:2px 10px;border:1px solid var(--gray-300);background:transparent;color:var(--gray-600);border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">포장</label>
                        <select class="form-select" id="editProjectPackaging" onchange="toggleCustomInput('editProjectPackaging','editProjectPackagingCustom')">
                            ${['개별박스','선물포장','선물포장+라벨부착','에어캡포장','기타'].map(u=>{
                                const isCustom = !['개별박스','선물포장','선물포장+라벨부착','에어캡포장','기타',''].includes(p.packaging);
                                const selected = p.packaging===u || (u==='기타' && isCustom);
                                return `<option ${selected?'selected':''}>${u}</option>`;
                            }).join('')}
                        </select>
                        <input type="text" class="form-input" id="editProjectPackagingCustom" placeholder="포장 방법 직접 입력" value="${!['개별박스','선물포장','선물포장+라벨부착','에어캡포장','기타',''].includes(p.packaging) ? p.packaging : ''}" style="margin-top:6px;display:${!['개별박스','선물포장','선물포장+라벨부착','에어캡포장','기타',''].includes(p.packaging) || p.packaging==='기타' ? 'block' : 'none'}">
                    </div>
                </div>
                <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                    <div class="form-group"><label class="form-label">포장비</label><input type="text" inputmode="numeric" class="form-input" id="editProjectPackFee" value="${(p.packagingFee || p.packCost) ? Number(p.packagingFee || p.packCost).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this);calcEditProjectRevenue()"></div>
                    <div class="form-group"><label class="form-label">VAT</label>
                        <select class="form-select" id="editProjectPackFeeVat" onchange="calcEditProjectRevenue()">
                            <option ${packagingFeeVat==='VAT 별도'?'selected':''}>VAT 별도</option>
                            <option ${packagingFeeVat==='VAT 포함'?'selected':''}>VAT 포함</option>
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">적용 방식</label>
                        <select class="form-select" id="editProjectPackFeeApply" onchange="calcEditProjectRevenue()">
                            <option ${packagingFeeApply==='1개당'?'selected':''}>1개당</option>
                            <option ${packagingFeeApply==='일괄'?'selected':''}>일괄</option>
                        </select>
                    </div>
                </div>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:8px;border-top:1px solid var(--gray-100)">
                <button type="button" id="editPrintAdd" onclick="toggleProjSection('editPrintSec','editPrintAdd',true)" style="flex:1;min-width:120px;padding:8px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:${eHasPrint ? 'none' : ''}">+ 인쇄 추가</button>
                <button type="button" id="editPackAdd" onclick="toggleProjSection('editPackSec','editPackAdd',true)" style="flex:1;min-width:120px;padding:8px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:${eHasPack ? 'none' : ''}">+ 포장 추가</button>
            </div>
            `)
        })()}

        ${secCard(`
            <div class="form-section-title">🚚 배송비</div>
            <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
                <div class="form-group"><label class="form-label">배송 방법</label>
                    <select class="form-select" id="editProjectShippingType" onchange="toggleShippingFields('edit');calcEditProjectRevenue()">
                        <option value="" ${!p.shippingType?'selected':''}>없음</option>
                        <option value="택배" ${p.shippingType==='택배'?'selected':''}>택배</option>
                        <option value="퀵" ${p.shippingType==='퀵'?'selected':''}>퀵</option>
                    </select>
                </div>
                <div class="form-group" id="editShippingVatGroup" style="display:${p.shippingType?'block':'none'}">
                    <label class="form-label">배송비 VAT</label>
                    <select class="form-select" id="editProjectShippingVat" onchange="calcEditProjectRevenue()">
                        <option ${(p.shippingVat||'VAT 별도')==='VAT 별도'?'selected':''}>VAT 별도</option>
                        <option ${p.shippingVat==='VAT 포함'?'selected':''}>VAT 포함</option>
                    </select>
                </div>
                <div class="form-group" id="editShippingCostDirect" style="display:${p.shippingType==='퀵'?'block':'none'}">
                    <label class="form-label">배송비</label>
                    <input type="text" inputmode="numeric" class="form-input" id="editProjectShippingCost" value="${p.shippingCost ? Number(p.shippingCost).toLocaleString() : ''}" placeholder="0" oninput="fmtProjectNumberInput(this);calcEditProjectRevenue()">
                </div>
            </div>
            <div id="editShippingBoxCalc" style="display:${p.shippingType==='택배'?'block':'none'}">
                <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
                    <div class="form-group"><label class="form-label">박스당 배송비</label>
                        <input type="text" inputmode="numeric" class="form-input" id="editProjectShipPerBox" value="${p.shippingCostPerBox ? Number(p.shippingCostPerBox).toLocaleString() : ''}" placeholder="0" oninput="fmtProjectNumberInput(this);calcShippingCost('edit');calcEditProjectRevenue()">
                    </div>
                    <div class="form-group"><label class="form-label">박스 수</label>
                        <input type="text" inputmode="numeric" class="form-input" id="editProjectShipBoxes" value="${p.shippingBoxes ? Number(p.shippingBoxes).toLocaleString() : ''}" placeholder="0" oninput="fmtProjectNumberInput(this);calcShippingCost('edit');calcEditProjectRevenue()">
                    </div>
                    <div class="form-group"><label class="form-label">총 배송비</label>
                        <div class="form-input" id="editProjectShipTotal" style="background:var(--gray-50);color:var(--gray-700);font-weight:700">${p.shippingCost ? Number(p.shippingCost).toLocaleString() + ' 원' : '0 원'}</div>
                    </div>
                </div>
            </div>
            <div class="form-group" style="margin-top:8px;padding-top:12px;border-top:2px solid var(--gray-200)">
                <label class="form-label" style="color:var(--blue);font-weight:800">💰 매출액 (자동계산)</label>
                <div id="editProjectRevenueBreakdown" style="background:var(--blue-light);border:1px solid var(--gray-200);border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;color:var(--gray-600)"></div>
                <div class="form-input" id="editProjectRevenueDisplay" style="background:var(--blue-light);color:var(--blue);font-weight:800;font-size:20px">${(p.revenue||0).toLocaleString()} 원</div>
            </div>
        `)}

        <div id="editSupplierDetailCard" style="background:var(--orange-light);border:1.5px solid var(--gray-200);border-left:4px solid var(--orange);border-radius:10px;padding:16px 20px;margin-bottom:16px;color:var(--gray-900);display:${p.supplier ? 'block' : 'none'}">
            <div class="form-section-title" style="color:var(--klp-orange,#E67E22)">🏭 매입처 상세 (작업요청서용)</div>
            <div class="form-row" style="grid-template-columns:2fr 1fr">
                <div class="form-group"><label class="form-label" style="color:var(--klp-orange,#E67E22);font-weight:800">매입 단가</label><input type="text" inputmode="numeric" class="form-input" id="editProjectSupUnitPrice" value="${p.supplierUnitPrice ? Number(p.supplierUnitPrice).toLocaleString() : ''}" placeholder="0" oninput="fmtProjectNumberInput(this);calcEditSupplierTotal()"></div>
                <div class="form-group"><label class="form-label">매입 VAT</label>
                    <select class="form-select" id="editProjectSupVat" onchange="calcEditSupplierTotal()">
                        <option value="exclude" ${supVatCurrent==='exclude'?'selected':''}>VAT 별도</option>
                        <option value="include" ${supVatCurrent==='include'?'selected':''}>VAT 포함</option>
                    </select>
                </div>
            </div>
            <div id="editSupPrintSec" style="display:${Number(p.supplierPrintFee) > 0 ? '' : 'none'};border-top:1px dashed #FFE0CC;margin-top:8px;padding-top:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div style="font-size:12px;font-weight:800;color:var(--klp-orange,#E67E22);letter-spacing:.5px">🖨️ 매입 인쇄비</div>
                    <button type="button" onclick="toggleProjSection('editSupPrintSec','editSupPrintAdd',false,'calcEditSupplierTotal')" style="padding:2px 10px;border:1px solid #FFD4A6;background:transparent;color:#B56500;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
                </div>
                <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                    <div class="form-group"><label class="form-label">매입 인쇄비</label><input type="text" inputmode="numeric" class="form-input" id="editProjectSupPrintFee" value="${p.supplierPrintFee ? Number(p.supplierPrintFee).toLocaleString() : ''}" placeholder="0" oninput="fmtProjectNumberInput(this);calcEditSupplierTotal()"></div>
                    <div class="form-group"><label class="form-label">VAT</label>
                        <select class="form-select" id="editProjectSupPrintFeeVat" onchange="calcEditSupplierTotal()">
                            <option ${supPrintFeeVat==='VAT 별도'?'selected':''}>VAT 별도</option>
                            <option ${supPrintFeeVat==='VAT 포함'?'selected':''}>VAT 포함</option>
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">적용 방식</label>
                        <select class="form-select" id="editProjectSupPrintFeeApply" onchange="calcEditSupplierTotal()">
                            <option ${supPrintFeeApply==='1개당'?'selected':''}>1개당</option>
                            <option ${supPrintFeeApply==='일괄'?'selected':''}>일괄</option>
                        </select>
                    </div>
                </div>
            </div>
            <div id="editSupPackSec" style="display:${Number(p.supplierPackagingFee) > 0 ? '' : 'none'};border-top:1px dashed #FFE0CC;margin-top:8px;padding-top:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div style="font-size:12px;font-weight:800;color:var(--klp-orange,#E67E22);letter-spacing:.5px">📦 매입 포장비</div>
                    <button type="button" onclick="toggleProjSection('editSupPackSec','editSupPackAdd',false,'calcEditSupplierTotal')" style="padding:2px 10px;border:1px solid #FFD4A6;background:transparent;color:#B56500;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
                </div>
                <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                    <div class="form-group"><label class="form-label">매입 포장비</label><input type="text" inputmode="numeric" class="form-input" id="editProjectSupPackFee" value="${p.supplierPackagingFee ? Number(p.supplierPackagingFee).toLocaleString() : ''}" placeholder="0" oninput="fmtProjectNumberInput(this);calcEditSupplierTotal()"></div>
                    <div class="form-group"><label class="form-label">VAT</label>
                        <select class="form-select" id="editProjectSupPackFeeVat" onchange="calcEditSupplierTotal()">
                            <option ${supPackFeeVat==='VAT 별도'?'selected':''}>VAT 별도</option>
                            <option ${supPackFeeVat==='VAT 포함'?'selected':''}>VAT 포함</option>
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">적용 방식</label>
                        <select class="form-select" id="editProjectSupPackFeeApply" onchange="calcEditSupplierTotal()">
                            <option ${supPackFeeApply==='1개당'?'selected':''}>1개당</option>
                            <option ${supPackFeeApply==='일괄'?'selected':''}>일괄</option>
                        </select>
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:8px;border-top:1px solid #FFE0CC">
                <button type="button" id="editSupPrintAdd" onclick="toggleProjSection('editSupPrintSec','editSupPrintAdd',true)" style="flex:1;min-width:120px;padding:8px 12px;border:1px dashed #FFD4A6;background:transparent;color:#B56500;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:${Number(p.supplierPrintFee) > 0 ? 'none' : ''}">+ 매입 인쇄 추가</button>
                <button type="button" id="editSupPackAdd" onclick="toggleProjSection('editSupPackSec','editSupPackAdd',true)" style="flex:1;min-width:120px;padding:8px 12px;border:1px dashed #FFD4A6;background:transparent;color:#B56500;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:${Number(p.supplierPackagingFee) > 0 ? 'none' : ''}">+ 매입 포장 추가</button>
            </div>
            <div style="font-size:13px;font-weight:800;color:var(--klp-orange,#E67E22);margin:14px 0 8px;padding-bottom:6px;border-bottom:1px solid #FFE0CC">🚚 매입 배송비</div>
            <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
                <div class="form-group"><label class="form-label">배송 방법</label>
                    <select class="form-select" id="editProjectSupShippingType" onchange="toggleShippingFields('editProjectSup');calcEditSupplierTotal()">
                        <option value="" ${!p.supplierShippingType?'selected':''}>없음</option>
                        <option value="택배" ${p.supplierShippingType==='택배'?'selected':''}>택배</option>
                        <option value="퀵" ${p.supplierShippingType==='퀵'?'selected':''}>퀵</option>
                    </select>
                </div>
                <div class="form-group" id="editProjectSupShippingVatGroup" style="display:${p.supplierShippingType?'block':'none'}">
                    <label class="form-label">배송비 VAT</label>
                    <select class="form-select" id="editProjectSupShippingVat" onchange="calcEditSupplierTotal()">
                        <option ${(p.supplierShippingVat||'VAT 별도')==='VAT 별도'?'selected':''}>VAT 별도</option>
                        <option ${p.supplierShippingVat==='VAT 포함'?'selected':''}>VAT 포함</option>
                    </select>
                </div>
                <div class="form-group" id="editProjectSupShippingCostDirect" style="display:${p.supplierShippingType==='퀵'?'block':'none'}">
                    <label class="form-label">배송비</label>
                    <input type="text" inputmode="numeric" class="form-input" id="editProjectSupShippingCost" value="${p.supplierShippingCost ? Number(p.supplierShippingCost).toLocaleString() : ''}" placeholder="0" oninput="fmtProjectNumberInput(this);calcEditSupplierTotal()">
                </div>
            </div>
            <div id="editProjectSupShippingBoxCalc" style="display:${p.supplierShippingType==='택배'?'block':'none'}">
                <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
                    <div class="form-group"><label class="form-label">박스당 배송비</label>
                        <input type="text" inputmode="numeric" class="form-input" id="editProjectSupShipPerBox" value="${p.supplierShippingCostPerBox ? Number(p.supplierShippingCostPerBox).toLocaleString() : ''}" placeholder="0" oninput="fmtProjectNumberInput(this);calcShippingCost('editProjectSup');calcEditSupplierTotal()">
                    </div>
                    <div class="form-group"><label class="form-label">박스 수</label>
                        <input type="text" inputmode="numeric" class="form-input" id="editProjectSupShipBoxes" value="${p.supplierShippingBoxes ? Number(p.supplierShippingBoxes).toLocaleString() : ''}" placeholder="0" oninput="fmtProjectNumberInput(this);calcShippingCost('editProjectSup');calcEditSupplierTotal()">
                    </div>
                    <div class="form-group"><label class="form-label">총 배송비</label>
                        <div class="form-input" id="editProjectSupShipTotal" style="background:var(--white);color:var(--gray-700);font-weight:700">${p.supplierShippingCost ? Number(p.supplierShippingCost).toLocaleString() + ' 원' : '0 원'}</div>
                    </div>
                </div>
            </div>
            <div class="form-group" style="margin-top:8px;padding-top:12px;border-top:2px solid #FFE0CC">
                <label class="form-label" style="color:var(--klp-orange,#E67E22);font-weight:800">💰 매입액 (자동계산)</label>
                <div id="editProjectSupBreakdown" style="background:var(--white);border:1px solid var(--gray-200);border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;color:var(--gray-600)"></div>
                <div class="form-input" id="editProjectSupTotalDisplay" style="background:var(--white);color:var(--orange);font-weight:800;font-size:20px">${(p.supplierRevenue||0).toLocaleString()} 원</div>
                <div id="editProjectMarginDisplay" style="margin-top:12px"></div>
            </div>
        </div>

        ${secCard(`
            <div class="form-section-title">🚚 납기 및 배송</div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">납기일</label><input type="date" class="form-input" id="editProjectDeadline" value="${p.deadline || ''}"></div>
                <div class="form-group"><label class="form-label">수령인</label><input type="text" class="form-input" id="editProjectRecipient" value="${(p.recipient || '').replace(/"/g, '&quot;')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">핸드폰</label><input type="text" class="form-input" id="editProjectPhone" value="${(p.phone || '').replace(/"/g, '&quot;')}"></div>
                <div class="form-group"><label class="form-label">주소</label><input type="text" class="form-input" id="editProjectAddress" value="${(p.address || '').replace(/"/g, '&quot;')}"></div>
            </div>
        `)}

        ${secCard(`
            <div class="form-section-title">✅ 체크리스트 및 메모</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                ${checksHtml}
            </div>
            <div class="form-group"><label class="form-label">메모</label><input type="text" class="form-input" id="editProjectMemo" value="${(p.memo || '').replace(/"/g, '&quot;')}"></div>
        `)}

        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="form-submit" style="flex:1 1 180px;background:var(--blue)" onclick="createDocFromProject(${p.id},'dc')">📄 디자인확인서 만들기</button>
            <button class="form-submit" style="flex:1 1 180px;background:var(--klp-orange,#E67E22)" onclick="createDocFromProject(${p.id},'wr')">📋 작업요청서 만들기</button>
            <button class="form-submit" style="flex:1 1 160px;background:#16A34A" onclick="createQuoteFromProject(${p.id})">💰 견적서 만들기</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
            <button class="form-submit" style="flex:1;background:var(--red)" onclick="deleteProject(${p.id})">🗑️ 삭제</button>
            <button class="form-submit" style="flex:2" onclick="updateProject(${p.id})">💾 수정 저장</button>
        </div>`;
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.add('show'); openModalHistory();
    overlay.classList.add('modal-wide');
    setTimeout(() => { calcEditProjectRevenue(); calcEditSupplierTotal(); }, 0);
}

function calcEditProjectRevenue() {
    const displayEl = document.getElementById('editProjectRevenueDisplay');
    if (!displayEl) return;
    const price = readProjectNumber('editProjectUnitPrice');
    const qty = readProjectNumber('editProjectQty');
    const vatEl = document.getElementById('editProjectVat');
    const vat = vatEl ? vatEl.value : 'exclude';
    let productTotal = price * qty;
    if (vat === 'exclude') productTotal = Math.round(productTotal * 1.1);
    const printTotal = _feeComponent('editProjectPrintFee','editProjectPrintFeeVat','editProjectPrintFeeApply',qty);
    const packTotal = _feeComponent('editProjectPackFee','editProjectPackFeeVat','editProjectPackFeeApply',qty);
    const shippingTotal = _shippingComponent('editProjectShippingType','editProjectShippingVat','editProjectShippingCost','editProjectShipPerBox','editProjectShipBoxes');
    const revenue = productTotal + printTotal + packTotal + shippingTotal;
    displayEl.textContent = revenue.toLocaleString() + ' 원';
    const bd = document.getElementById('editProjectRevenueBreakdown');
    if (bd) bd.innerHTML = _breakdownHtml(productTotal, printTotal, packTotal, shippingTotal);
    _renderMargin('editProjectMarginDisplay', revenue, _parseKRW('editProjectSupTotalDisplay'));
}

function toggleEditSupplierSection() {
    const supEl = document.getElementById('editProjectSupplier');
    const card = document.getElementById('editSupplierDetailCard');
    if (!supEl || !card) return;
    const hasSupplier = (supEl.value || '').trim().length > 0;
    card.style.display = hasSupplier ? 'block' : 'none';
    if (!hasSupplier) {
        const m = document.getElementById('editProjectMarginDisplay');
        if (m) m.innerHTML = '';
    }
}

function calcEditSupplierTotal() {
    const displayEl = document.getElementById('editProjectSupTotalDisplay');
    if (!displayEl) return;
    const price = readProjectNumber('editProjectSupUnitPrice');
    const qty = readProjectNumber('editProjectQty');
    const vatEl = document.getElementById('editProjectSupVat');
    const vat = vatEl ? vatEl.value : 'exclude';
    let productTotal = price * qty;
    if (vat === 'exclude') productTotal = Math.round(productTotal * 1.1);
    const printTotal = _feeComponent('editProjectSupPrintFee','editProjectSupPrintFeeVat','editProjectSupPrintFeeApply',qty);
    const packTotal = _feeComponent('editProjectSupPackFee','editProjectSupPackFeeVat','editProjectSupPackFeeApply',qty);
    const shippingTotal = _shippingComponent('editProjectSupShippingType','editProjectSupShippingVat','editProjectSupShippingCost','editProjectSupShipPerBox','editProjectSupShipBoxes');
    const total = productTotal + printTotal + packTotal + shippingTotal;
    displayEl.textContent = total.toLocaleString() + ' 원';
    const bd = document.getElementById('editProjectSupBreakdown');
    if (bd) bd.innerHTML = _breakdownHtml(productTotal, printTotal, packTotal, shippingTotal);
    _renderMargin('editProjectMarginDisplay', _parseKRW('editProjectRevenueDisplay'), total);
}

async function updateProject(id) {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    const getVal = (k) => { const el = document.getElementById(k); return el ? el.value.trim() : ''; };
    const getInt = (k) => parseInt(getVal(k)) || 0;

    const name = getVal('editProjectName');
    const client = getVal('editProjectClient');
    if (!name) { showToast('품명을 입력해주세요'); return; }
    if (!client) { showToast('거래처를 입력해주세요'); return; }

    const unitPrice = readProjectNumber('editProjectUnitPrice');
    const qty = readProjectNumber('editProjectQty');
    const vat = getVal('editProjectVat');
    let productTotal = unitPrice * qty;
    if (vat === 'exclude') productTotal = Math.round(productTotal * 1.1);
    // 매출액 = 단가 + 인쇄비 환산 + 포장비 환산
    const printTotal = _feeComponent('editProjectPrintFee','editProjectPrintFeeVat','editProjectPrintFeeApply',qty);
    const packTotal = _feeComponent('editProjectPackFee','editProjectPackFeeVat','editProjectPackFeeApply',qty);
    const shipTotal = _shippingComponent('editProjectShippingType','editProjectShippingVat','editProjectShippingCost','editProjectShipPerBox','editProjectShipBoxes');
    const revenue = productTotal + printTotal + packTotal + shipTotal;

    // 매입처 상세
    const supplierName = getVal('editProjectSupplier');
    const supUnit = readProjectNumber('editProjectSupUnitPrice');
    let supplierUnitPrice = 0, supplierUnitPriceVat = 'VAT 별도', supplierVat = 'exclude';
    let supplierPrintFee = 0, supplierPrintFeeVat = 'VAT 별도', supplierPrintFeeApply = '1개당';
    let supplierPackagingFee = 0, supplierPackagingFeeVat = 'VAT 별도', supplierPackagingFeeApply = '1개당';
    let supplierRevenue = 0;
    if (supplierName && supUnit > 0) {
        supplierVat = getVal('editProjectSupVat') || 'exclude';
        supplierUnitPriceVat = supplierVat === 'include' ? 'VAT 포함' : 'VAT 별도';
        supplierUnitPrice = supUnit;
        supplierPrintFee = readProjectNumber('editProjectSupPrintFee');
        supplierPrintFeeVat = getVal('editProjectSupPrintFeeVat') || 'VAT 별도';
        supplierPrintFeeApply = getVal('editProjectSupPrintFeeApply') || '1개당';
        supplierPackagingFee = readProjectNumber('editProjectSupPackFee');
        supplierPackagingFeeVat = getVal('editProjectSupPackFeeVat') || 'VAT 별도';
        supplierPackagingFeeApply = getVal('editProjectSupPackFeeApply') || '1개당';
        let supProductTotal = supUnit * qty;
        if (supplierVat === 'exclude') supProductTotal = Math.round(supProductTotal * 1.1);
        const supPrintTotal = _feeComponent('editProjectSupPrintFee','editProjectSupPrintFeeVat','editProjectSupPrintFeeApply',qty);
        const supPackTotal = _feeComponent('editProjectSupPackFee','editProjectSupPackFeeVat','editProjectSupPackFeeApply',qty);
        const supShipTotal = _shippingComponent('editProjectSupShippingType','editProjectSupShippingVat','editProjectSupShippingCost','editProjectSupShipPerBox','editProjectSupShipBoxes');
        supplierRevenue = supProductTotal + supPrintTotal + supPackTotal + supShipTotal;
    }

    const newChecks = {};
    Object.keys(p.checks || {}).forEach(k => {
        const el = document.getElementById(`editCheck-${k}`);
        newChecks[k] = el ? el.checked : false;
    });

    let newStatus = getVal('editProjectStatus');
    // 상태 '완료' → 체크리스트 전체 체크, 체크리스트 전체 체크 → 상태 '완료'
    if (newStatus === '완료') {
        CHECK_ITEMS.forEach(item => { newChecks[item.key] = true; });
    } else if (CHECK_ITEMS.every(item => !!newChecks[item.key])) {
        newStatus = '완료';
    }

    Object.assign(p, {
        name, client,
        supplier: supplierName,
        contactPerson: getVal('editProjectContact'),
        title: '',
        manager: getVal('editProjectManager'),
        status: newStatus,
        supplierContact: getVal('editProjectSupplierContact'),
        unitPrice, qty, vat, revenue,
        unit: getVal('editProjectUnit'),
        color: getVal('editProjectColor'),
        printColorSize: getVal('editProjectPrintColorSize'),
        printMethod: getVal('editProjectPrintMethod') === '기타' ? (getVal('editProjectPrintMethodCustom') || '기타') : getVal('editProjectPrintMethod'),
        printFee: readProjectNumber('editProjectPrintFee'),
        printCost: readProjectNumber('editProjectPrintFee'),
        printFeeVat: getVal('editProjectPrintFeeVat'),
        printFeeApply: getVal('editProjectPrintFeeApply'),
        packaging: getVal('editProjectPackaging') === '기타' ? (getVal('editProjectPackagingCustom') || '기타') : getVal('editProjectPackaging'),
        packagingFee: readProjectNumber('editProjectPackFee'),
        packCost: readProjectNumber('editProjectPackFee'),
        packagingFeeVat: getVal('editProjectPackFeeVat'),
        packagingFeeApply: getVal('editProjectPackFeeApply'),
        supplierUnitPrice,
        supplierUnitPriceVat,
        supplierVat,
        supplierPrintFee,
        supplierPrintFeeVat,
        supplierPrintFeeApply,
        supplierPackagingFee,
        supplierPackagingFeeVat,
        supplierPackagingFeeApply,
        supplierRevenue,
        supplierShippingType: getVal('editProjectSupShippingType'),
        supplierShippingVat: getVal('editProjectSupShippingVat') || 'VAT 별도',
        supplierShippingCostPerBox: readProjectNumber('editProjectSupShipPerBox'),
        supplierShippingBoxes: readProjectNumber('editProjectSupShipBoxes'),
        supplierShippingCost: getShippingCost('editProjectSup'),
        shippingType: getVal('editProjectShippingType'),
        shippingVat: getVal('editProjectShippingVat') || 'VAT 별도',
        shippingCostPerBox: readProjectNumber('editProjectShipPerBox'),
        shippingBoxes: readProjectNumber('editProjectShipBoxes'),
        shippingCost: getShippingCost('edit'),
        deadline: getVal('editProjectDeadline'),
        recipient: getVal('editProjectRecipient'),
        phone: getVal('editProjectPhone'),
        address: getVal('editProjectAddress'),
        checks: newChecks,
        memo: getVal('editProjectMemo')
    });

    if (p.category !== '해외 주문') {
        try {
            const { error } = await sb.from('projects_domestic').update({
                client: p.client,
                contact_person: p.contactPerson,
                title: p.title,
                manager: p.manager,
                product_name: p.name,
                quantity: p.qty,
                unit: p.unit,
                unit_price: p.unitPrice,
                unit_price_vat: vat === 'exclude' ? 'VAT 별도' : 'VAT 포함',
                color: p.color,
                print_color_size: p.printColorSize,
                print_method: p.printMethod,
                print_fee: p.printFee,
                packaging: p.packaging,
                packaging_fee: p.packagingFee,
                delivery_date: p.deadline || null,
                recipient: p.recipient,
                phone: p.phone,
                address: p.address,
                revenue: p.revenue,
                status: p.status,
                checks: p.checks,
                memo: p.memo,
                supplier: p.supplier,
                supplier_contact: p.supplierContact || '',
                print_fee_vat: p.printFeeVat,
                print_fee_apply: p.printFeeApply,
                packaging_fee_vat: p.packagingFeeVat,
                packaging_fee_apply: p.packagingFeeApply,
                supplier_unit_price: p.supplierUnitPrice || 0,
                supplier_unit_price_vat: p.supplierUnitPriceVat || 'VAT 별도',
                supplier_print_fee: p.supplierPrintFee || 0,
                supplier_print_fee_vat: p.supplierPrintFeeVat || 'VAT 별도',
                supplier_print_fee_apply: p.supplierPrintFeeApply || '1개당',
                supplier_packaging_fee: p.supplierPackagingFee || 0,
                supplier_packaging_fee_vat: p.supplierPackagingFeeVat || 'VAT 별도',
                supplier_packaging_fee_apply: p.supplierPackagingFeeApply || '1개당',
                supplier_revenue: p.supplierRevenue || 0,
                supplier_shipping_type: p.supplierShippingType || '',
                supplier_shipping_vat: p.supplierShippingVat || 'VAT 별도',
                supplier_shipping_cost_per_box: p.supplierShippingCostPerBox || 0,
                supplier_shipping_boxes: p.supplierShippingBoxes || 0,
                supplier_shipping_cost: p.supplierShippingCost || 0,
                shipping_type: p.shippingType || '',
                shipping_vat: p.shippingVat || 'VAT 별도',
                shipping_cost_per_box: p.shippingCostPerBox || 0,
                shipping_boxes: p.shippingBoxes || 0,
                shipping_cost: p.shippingCost || 0
            }).eq('id', id);
            if (error) throw error;
        } catch (err) {
            console.error('Supabase 수정 실패:', err);
            showToast('DB 수정 실패: ' + err.message);
        }
    }

    await syncProjectDeadlineTask(p);
    closeModal(); renderProjects(); renderHome();
    showToast('프로젝트가 수정되었습니다');
}

async function deleteProject(id) {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`"${p.name}" 프로젝트를 삭제하시겠습니까?`)) return;

    if (p.category !== '해외 주문') {
        try {
            const { error } = await sb.from('projects_domestic').delete().eq('id', id);
            if (error) throw error;
        } catch (err) {
            console.error('Supabase 삭제 실패:', err);
            showToast('DB 삭제 실패: ' + err.message);
            return;
        }
    }

    const dIdx = domesticProjects.findIndex(x => x.id === id);
    if (dIdx >= 0) domesticProjects.splice(dIdx, 1);
    const oIdx = overseasProjects.findIndex(x => x.id === id);
    if (oIdx >= 0) overseasProjects.splice(oIdx, 1);
    const pIdx = projects.findIndex(x => x.id === id);
    if (pIdx >= 0) projects.splice(pIdx, 1);

    await deleteProjectDeadlineTask(id);
    closeModal(); renderProjects(); renderHome();
    showToast('프로젝트가 삭제되었습니다');
}

function showDeliveryDetail(id) {
    // 사이드바 상세 패널 제거 — 더 이상 사용하지 않음
}

function closeDetail() {
    document.getElementById('detailOverlay').classList.remove('show');
}

// 백드롭 클릭 안전 가드 — 사용자가 모달 안에서 마우스를 누른 채 바깥(overlay)으로
// 드래그해서 떼면, 일반 click 이벤트는 mousedown/mouseup 의 공통 부모인 overlay 에 발화돼
// 모달이 의도치 않게 닫히는 문제가 있다. mousedown 도 overlay 본체에서 시작했을 때만 닫는다.
let _backdropMouseDownEl = null;
document.addEventListener('mousedown', (e) => { _backdropMouseDownEl = e.target; }, true);
function isBackdropClick(e, overlayEl) {
    return e.target === overlayEl && _backdropMouseDownEl === overlayEl;
}

// Click overlay to close
document.addEventListener('click', (e) => {
    const detailOverlay = document.getElementById('detailOverlay');
    const modalOverlay = document.getElementById('modalOverlay');
    if (detailOverlay && isBackdropClick(e, detailOverlay)) closeDetail();
    if (modalOverlay && isBackdropClick(e, modalOverlay)) closeModal();
});

// =====================================
// MODALS
// =====================================
function openModal(type) {
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');

    if (type === 'project-domestic' || type === 'project-overseas') {
        const isDomestic = type === 'project-domestic';
        title.textContent = isDomestic ? '새 국내 프로젝트' : '새 해외 프로젝트';
        const addType = isDomestic ? 'domestic' : 'overseas';
        const prefill = window._projectPrefill || {};
        window._projectPrefill = null;
        const v = (k, d = '') => (prefill[k] != null ? prefill[k] : d);

        if (isDomestic) {
            const secCard = (inner) => `<div style="background:var(--white);border:1px solid var(--gray-200);border-radius:10px;padding:16px 20px;margin-bottom:16px;color:var(--gray-900)">${inner}</div>`;
            const mgrDefault = (typeof getLoginManager === 'function' ? getLoginManager() : null) || v('manager') || '김현호 팀장';
            body.innerHTML = `
                <datalist id="clientsListDoc">${clients.map(c => `<option value="${(c.companyName || '').replace(/"/g, '&quot;')}"></option>`).join('')}</datalist>

                ${secCard(`
                    <div class="form-section-title">📋 기본 정보</div>
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">매출처 <span style="color:var(--red)">*</span></label><input type="text" class="form-input" id="newProjectClient" list="clientsListDoc" autocomplete="off" placeholder="거래처명" value="${v('client')}"></div>
                        <div class="form-group"><label class="form-label">매출처 담당자</label><input type="text" class="form-input" id="newProjectContact" placeholder="담당자" value="${v('contactPerson')}"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">매입처 (작업요청서 발송 공장)</label><input type="text" class="form-input" id="newProjectSupplier" list="clientsListDoc" autocomplete="off" placeholder="공장/제작처 — 입력 시 매입처 상세 섹션이 나타납니다" value="${v('supplier')}" oninput="toggleSupplierSection()"></div>
                        <div class="form-group"><label class="form-label">매입처 담당자</label><input type="text" class="form-input" id="newProjectSupplierContact" placeholder="공장 담당자명" value="${v('supplierContact')}"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">본사 담당자</label>
                            <select class="form-select" id="newProjectManager">
                                ${['이현주 실장','김현호 팀장','유지은 대리'].map(m => `<option ${mgrDefault===m?'selected':''}>${m}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group"><label class="form-label">상태</label>
                            <select class="form-select" id="newProjectStatus">
                                <option>시작 전</option><option>진행 중</option><option>완료</option>
                            </select>
                        </div>
                    </div>
                `)}

                ${secCard(`
                    <div class="form-section-title">📦 제품 정보</div>
                    <div class="form-group"><label class="form-label">품명 <span style="color:var(--red)">*</span></label><input type="text" class="form-input" id="newProjectName" placeholder="품명 입력" value="${v('productName') || v('name')}"></div>
                    <div class="form-row" style="grid-template-columns:2fr 1fr">
                        <div class="form-group"><label class="form-label">수량</label><input type="text" inputmode="numeric" class="form-input" id="newProjectQty" placeholder="0" value="${v('quantity') ? Number(v('quantity')).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this);calcProjectRevenue();calcSupplierTotal()"></div>
                        <div class="form-group"><label class="form-label">단위</label>
                            <select class="form-select" id="newProjectUnit">
                                ${['개','세트','장','박스','EA'].map(u=>`<option ${v('unit')===u?'selected':''}>${u}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-row" style="grid-template-columns:2fr 1fr">
                        <div class="form-group"><label class="form-label" style="color:var(--blue);font-weight:800">매출 단가</label><input type="text" inputmode="numeric" class="form-input" id="newProjectUnitPrice" placeholder="0" value="${v('unitPrice') ? Number(v('unitPrice')).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this);calcProjectRevenue();calcSupplierTotal()"></div>
                        <div class="form-group"><label class="form-label">매출 VAT</label>
                            <select class="form-select" id="newProjectVat" onchange="calcProjectRevenue()">
                                <option value="exclude" ${v('unitPriceVat')==='VAT 별도'||v('vat')==='exclude'||!v('vat')?'selected':''}>VAT 별도</option>
                                <option value="include" ${v('unitPriceVat')==='VAT 포함'||v('vat')==='include'?'selected':''}>VAT 포함</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">제품 색상</label><input type="text" class="form-input" id="newProjectColor" value="${v('color') || '-'}"></div>
                        <div class="form-group"><label class="form-label">인쇄 색상 및 사이즈</label><input type="text" class="form-input" id="newProjectPrintColorSize" value="${v('printColorSize') || '시안 확인'}"></div>
                    </div>
                `)}

                ${(() => {
                    const hasPrint = (v('printMethod') && v('printMethod') !== '없음') || Number(v('printFee')) > 0;
                    const hasPack = Number(v('packagingFee')) > 0 || (v('packaging') && v('packaging') !== '개별박스');
                    return secCard(`
                    <div class="form-section-title">🖨️ 인쇄 · 포장 <span style="font-size:12px;font-weight:600;color:var(--blue);margin-left:6px">(매출 기준)</span></div>

                    <div id="newPrintSec" style="display:${hasPrint ? '' : 'none'};border-top:1px dashed var(--gray-200);margin-top:8px;padding-top:8px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                            <div style="font-size:12px;font-weight:800;color:var(--gray-700);letter-spacing:.5px">🖨️ 인쇄</div>
                            <button type="button" onclick="toggleProjSection('newPrintSec','newPrintAdd',false,'calcProjectRevenue')" style="padding:2px 10px;border:1px solid var(--gray-300);background:transparent;color:var(--gray-600);border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
                        </div>
                        <div class="form-row">
                            <div class="form-group"><label class="form-label">인쇄 방법</label>
                                <select class="form-select" id="newProjectPrintMethod" onchange="toggleCustomInput('newProjectPrintMethod','newProjectPrintMethodCustom')">
                                    ${['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사','기타'].map(u=>{
                                        const isCustom = v('printMethod') && !['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사','기타'].includes(v('printMethod'));
                                        const selected = v('printMethod')===u || (u==='기타' && isCustom);
                                        return `<option ${selected?'selected':''}>${u}</option>`;
                                    }).join('')}
                                </select>
                                <input type="text" class="form-input" id="newProjectPrintMethodCustom" placeholder="인쇄 방법 직접 입력" value="${!['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사','기타',''].includes(v('printMethod')) ? v('printMethod') : ''}" style="margin-top:6px;display:none">
                            </div>
                        </div>
                        <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                            <div class="form-group"><label class="form-label">인쇄비</label><input type="text" inputmode="numeric" class="form-input" id="newProjectPrintFee" placeholder="0" value="${v('printFee') ? Number(v('printFee')).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this);calcProjectRevenue()"></div>
                            <div class="form-group"><label class="form-label">VAT</label>
                                <select class="form-select" id="newProjectPrintFeeVat" onchange="calcProjectRevenue()"><option>VAT 별도</option><option>VAT 포함</option></select>
                            </div>
                            <div class="form-group"><label class="form-label">적용 방식</label>
                                <select class="form-select" id="newProjectPrintFeeApply" onchange="calcProjectRevenue()"><option>1개당</option><option>일괄</option></select>
                            </div>
                        </div>
                    </div>

                    <div id="newPackSec" style="display:${hasPack ? '' : 'none'};border-top:1px dashed var(--gray-200);margin-top:8px;padding-top:8px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                            <div style="font-size:12px;font-weight:800;color:var(--gray-700);letter-spacing:.5px">📦 포장</div>
                            <button type="button" onclick="toggleProjSection('newPackSec','newPackAdd',false,'calcProjectRevenue')" style="padding:2px 10px;border:1px solid var(--gray-300);background:transparent;color:var(--gray-600);border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
                        </div>
                        <div class="form-row">
                            <div class="form-group"><label class="form-label">포장</label>
                                <select class="form-select" id="newProjectPackaging" onchange="toggleCustomInput('newProjectPackaging','newProjectPackagingCustom')">
                                    ${['개별박스','선물포장','선물포장+라벨부착','에어캡포장','기타'].map(u=>{
                                        const isCustom = v('packaging') && !['개별박스','선물포장','선물포장+라벨부착','에어캡포장','기타'].includes(v('packaging'));
                                        const selected = v('packaging')===u || (u==='기타' && isCustom);
                                        return `<option ${selected?'selected':''}>${u}</option>`;
                                    }).join('')}
                                </select>
                                <input type="text" class="form-input" id="newProjectPackagingCustom" placeholder="포장 방법 직접 입력" value="${!['개별박스','선물포장','선물포장+라벨부착','에어캡포장','기타',''].includes(v('packaging')) ? v('packaging') : ''}" style="margin-top:6px;display:none">
                            </div>
                        </div>
                        <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                            <div class="form-group"><label class="form-label">포장비</label><input type="text" inputmode="numeric" class="form-input" id="newProjectPackFee" placeholder="0" value="${v('packagingFee') ? Number(v('packagingFee')).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this);calcProjectRevenue()"></div>
                            <div class="form-group"><label class="form-label">VAT</label>
                                <select class="form-select" id="newProjectPackFeeVat" onchange="calcProjectRevenue()"><option>VAT 별도</option><option>VAT 포함</option></select>
                            </div>
                            <div class="form-group"><label class="form-label">적용 방식</label>
                                <select class="form-select" id="newProjectPackFeeApply" onchange="calcProjectRevenue()"><option>1개당</option><option>일괄</option></select>
                            </div>
                        </div>
                    </div>

                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:8px;border-top:1px solid var(--gray-100)">
                        <button type="button" id="newPrintAdd" onclick="toggleProjSection('newPrintSec','newPrintAdd',true)" style="flex:1;min-width:120px;padding:8px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:${hasPrint ? 'none' : ''}">+ 인쇄 추가</button>
                        <button type="button" id="newPackAdd" onclick="toggleProjSection('newPackSec','newPackAdd',true)" style="flex:1;min-width:120px;padding:8px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:${hasPack ? 'none' : ''}">+ 포장 추가</button>
                    </div>
                    `)
                })()}

                ${secCard(`
                    <div class="form-section-title">🚚 배송비</div>
                    <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
                        <div class="form-group"><label class="form-label">배송 방법</label>
                            <select class="form-select" id="newProjectShippingType" onchange="toggleShippingFields('new')">
                                <option value="">없음</option>
                                <option value="택배">택배</option>
                                <option value="퀵">퀵</option>
                            </select>
                        </div>
                        <div class="form-group" id="newShippingVatGroup" style="display:none">
                            <label class="form-label">배송비 VAT</label>
                            <select class="form-select" id="newProjectShippingVat">
                                <option>VAT 별도</option>
                                <option>VAT 포함</option>
                            </select>
                        </div>
                        <div class="form-group" id="newShippingCostDirect" style="display:none">
                            <label class="form-label">배송비</label>
                            <input type="text" inputmode="numeric" class="form-input" id="newProjectShippingCost" placeholder="0" oninput="fmtProjectNumberInput(this)">
                        </div>
                    </div>
                    <div id="newShippingBoxCalc" style="display:none">
                        <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
                            <div class="form-group"><label class="form-label">박스당 배송비</label>
                                <input type="text" inputmode="numeric" class="form-input" id="newProjectShipPerBox" placeholder="0" oninput="fmtProjectNumberInput(this);calcShippingCost('new')">
                            </div>
                            <div class="form-group"><label class="form-label">박스 수</label>
                                <input type="text" inputmode="numeric" class="form-input" id="newProjectShipBoxes" placeholder="0" oninput="fmtProjectNumberInput(this);calcShippingCost('new')">
                            </div>
                            <div class="form-group"><label class="form-label">총 배송비</label>
                                <div class="form-input" id="newProjectShipTotal" style="background:var(--gray-50);color:var(--gray-700);font-weight:700">0 원</div>
                            </div>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top:8px;padding-top:12px;border-top:2px solid var(--gray-200)">
                        <label class="form-label" style="color:var(--blue);font-weight:800">💰 매출액 (자동계산)</label>
                        <div id="newProjectRevenueBreakdown" style="background:var(--blue-light);border:1px solid var(--gray-200);border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;color:var(--gray-600)"></div>
                        <div class="form-input" id="newProjectRevenueDisplay" style="background:var(--blue-light);color:var(--blue);font-weight:800;font-size:20px">0 원</div>
                    </div>
                `)}

                <div id="supplierDetailCard" style="background:var(--orange-light);border:1.5px solid var(--gray-200);border-left:4px solid var(--orange);border-radius:10px;padding:16px 20px;margin-bottom:16px;color:var(--gray-900);display:none">
                    <div class="form-section-title" style="color:var(--klp-orange,#E67E22)">🏭 매입처 상세 (작업요청서용)</div>
                    <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:14px">매입 단가를 입력하면 저장 시 매입처 자식 프로젝트가 함께 생성됩니다. (수량·단위·품명은 위 제품 정보를 공유합니다)</div>
                    <div class="form-row" style="grid-template-columns:2fr 1fr">
                        <div class="form-group"><label class="form-label" style="color:var(--klp-orange,#E67E22);font-weight:800">매입 단가</label><input type="text" inputmode="numeric" class="form-input" id="newProjectSupUnitPrice" placeholder="0" oninput="fmtProjectNumberInput(this);calcSupplierTotal()"></div>
                        <div class="form-group"><label class="form-label">매입 VAT</label>
                            <select class="form-select" id="newProjectSupVat" onchange="calcSupplierTotal()">
                                <option value="exclude">VAT 별도</option>
                                <option value="include">VAT 포함</option>
                            </select>
                        </div>
                    </div>
                    <div id="newSupPrintSec" style="display:none;border-top:1px dashed #FFE0CC;margin-top:8px;padding-top:8px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                            <div style="font-size:12px;font-weight:800;color:var(--klp-orange,#E67E22);letter-spacing:.5px">🖨️ 매입 인쇄비</div>
                            <button type="button" onclick="toggleProjSection('newSupPrintSec','newSupPrintAdd',false,'calcSupplierTotal')" style="padding:2px 10px;border:1px solid #FFD4A6;background:transparent;color:#B56500;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
                        </div>
                        <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                            <div class="form-group"><label class="form-label">매입 인쇄비</label><input type="text" inputmode="numeric" class="form-input" id="newProjectSupPrintFee" placeholder="0" oninput="fmtProjectNumberInput(this);calcSupplierTotal()"></div>
                            <div class="form-group"><label class="form-label">VAT</label>
                                <select class="form-select" id="newProjectSupPrintFeeVat" onchange="calcSupplierTotal()"><option>VAT 별도</option><option>VAT 포함</option></select>
                            </div>
                            <div class="form-group"><label class="form-label">적용 방식</label>
                                <select class="form-select" id="newProjectSupPrintFeeApply" onchange="calcSupplierTotal()"><option>1개당</option><option>일괄</option></select>
                            </div>
                        </div>
                    </div>
                    <div id="newSupPackSec" style="display:none;border-top:1px dashed #FFE0CC;margin-top:8px;padding-top:8px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                            <div style="font-size:12px;font-weight:800;color:var(--klp-orange,#E67E22);letter-spacing:.5px">📦 매입 포장비</div>
                            <button type="button" onclick="toggleProjSection('newSupPackSec','newSupPackAdd',false,'calcSupplierTotal')" style="padding:2px 10px;border:1px solid #FFD4A6;background:transparent;color:#B56500;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
                        </div>
                        <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                            <div class="form-group"><label class="form-label">매입 포장비</label><input type="text" inputmode="numeric" class="form-input" id="newProjectSupPackFee" placeholder="0" oninput="fmtProjectNumberInput(this);calcSupplierTotal()"></div>
                            <div class="form-group"><label class="form-label">VAT</label>
                                <select class="form-select" id="newProjectSupPackFeeVat" onchange="calcSupplierTotal()"><option>VAT 별도</option><option>VAT 포함</option></select>
                            </div>
                            <div class="form-group"><label class="form-label">적용 방식</label>
                                <select class="form-select" id="newProjectSupPackFeeApply" onchange="calcSupplierTotal()"><option>1개당</option><option>일괄</option></select>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:8px;border-top:1px solid #FFE0CC">
                        <button type="button" id="newSupPrintAdd" onclick="toggleProjSection('newSupPrintSec','newSupPrintAdd',true)" style="flex:1;min-width:120px;padding:8px 12px;border:1px dashed #FFD4A6;background:transparent;color:#B56500;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">+ 매입 인쇄 추가</button>
                        <button type="button" id="newSupPackAdd" onclick="toggleProjSection('newSupPackSec','newSupPackAdd',true)" style="flex:1;min-width:120px;padding:8px 12px;border:1px dashed #FFD4A6;background:transparent;color:#B56500;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">+ 매입 포장 추가</button>
                    </div>
                    <div class="form-group" style="margin-top:8px;padding-top:12px;border-top:2px solid #FFE0CC">
                        <label class="form-label" style="color:var(--klp-orange,#E67E22);font-weight:800">💰 매입액 (자동계산)</label>
                        <div id="newProjectSupBreakdown" style="background:var(--white);border:1px solid var(--gray-200);border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;color:var(--gray-600)"></div>
                        <div class="form-input" id="newProjectSupTotalDisplay" style="background:var(--white);color:var(--orange);font-weight:800;font-size:20px">0 원</div>
                        <div id="newProjectMarginDisplay" style="margin-top:12px"></div>
                    </div>
                </div>

                ${secCard(`
                    <div class="form-section-title">🚚 납기 및 배송</div>
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">납기일</label><input type="date" class="form-input" id="newProjectDeadline" value="${v('deliveryDate') || v('deadline')}"></div>
                        <div class="form-group"><label class="form-label">수령인</label><input type="text" class="form-input" id="newProjectRecipient" value="${v('recipient')}"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">핸드폰</label><input type="text" class="form-input" id="newProjectPhone" placeholder="010-0000-0000" value="${v('phone')}"></div>
                        <div class="form-group"><label class="form-label">주소</label><input type="text" class="form-input" id="newProjectAddress" value="${v('address')}"></div>
                    </div>
                `)}

                ${secCard(`
                    <div class="form-section-title">📝 메모</div>
                    <div class="form-group"><input type="text" class="form-input" id="newProjectMemo" placeholder="특이사항" value="${v('memo')}"></div>
                `)}

                <button class="form-submit" onclick="addProject('${addType}')">프로젝트 추가</button>`;
            setTimeout(() => { calcProjectRevenue(); toggleSupplierSection(); calcSupplierTotal(); }, 0);
            document.getElementById('modalOverlay').classList.add('modal-wide');
        } else {
            // 해외: 기존 간단 폼 유지
            body.innerHTML = `
                <div class="form-group"><label class="form-label">거래처</label><input type="text" class="form-input" id="newProjectClient" placeholder="거래처명 입력"></div>
                <div class="form-group"><label class="form-label">품목명</label><input type="text" class="form-input" id="newProjectName" placeholder="품목명 입력"></div>
                <div class="form-row" style="grid-template-columns:1fr auto 1fr">
                    <div class="form-group"><label class="form-label">단가</label><input type="number" class="form-input" id="newProjectUnitPrice" placeholder="0" oninput="calcProjectRevenue()"></div>
                    <div class="form-group"><label class="form-label">VAT</label><select class="form-select" id="newProjectVat" onchange="calcProjectRevenue()" style="min-width:90px"><option value="include">포함</option><option value="exclude">별도</option></select></div>
                    <div class="form-group"><label class="form-label">수량</label><input type="number" class="form-input" id="newProjectQty" placeholder="0" oninput="calcProjectRevenue()"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">매출액 (자동계산)</label>
                    <div class="form-input" id="newProjectRevenueDisplay" style="background:var(--gray-50);color:var(--gray-700);font-weight:700">0 원</div>
                </div>
                <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
                    <div class="form-group"><label class="form-label">인쇄비</label><input type="number" class="form-input" id="newProjectPrintFee" placeholder="0"></div>
                    <div class="form-group"><label class="form-label">포장비</label><input type="number" class="form-input" id="newProjectPackFee" placeholder="0"></div>
                    <div class="form-group"><label class="form-label">배송비</label><input type="number" class="form-input" id="newProjectShipCost" placeholder="0"></div>
                </div>
                <div class="form-group"><label class="form-label">마감일</label><input type="date" class="form-input" id="newProjectDeadline"></div>
                <div class="form-group"><label class="form-label">메모</label><input type="text" class="form-input" id="newProjectMemo" placeholder="특이사항"></div>
                <button class="form-submit" onclick="addProject('${addType}')">프로젝트 추가</button>`;
        }
    } else if (type === 'daily') {
        title.textContent = '새 할 일';
        body.innerHTML = `
            <div class="form-group"><label class="form-label">할 일</label><input type="text" class="form-input" id="newTaskName" placeholder="할 일 입력"></div>
            <div class="form-group"><label class="form-label">담당자</label><select class="form-select" id="newTaskAssignee"><option value="전체">전체 (공통)</option><option value="임원">임원</option><option value="대표님">대표님</option><option value="이현주">이현주</option><option value="김현호">김현호</option><option value="유지은">유지은</option><option value="구정두">구정두</option></select></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" id="newTaskDate" value="${fmtDate(currentDate)}"></div>
                <div class="form-group"><label class="form-label">마감일</label><input type="date" class="form-input" id="newTaskDeadline"></div>
            </div>
            <div class="form-group"><label class="form-label">우선순위</label><select class="form-select" id="newTaskPriority"><option value="🟡 보통">보통</option><option value="🔴 긴급">긴급</option><option value="🔵 낮음">낮음</option></select></div>
            <button class="form-submit" onclick="addDailyTask()">할 일 추가</button>`;
    } else if (type === 'delivery') {
        title.textContent = '새 택배';
        body.innerHTML = `
            <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" id="newDelDate" value="${fmtDate(new Date())}"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">받는이</label><input type="text" class="form-input" id="newDelRecipient" placeholder="받는이"></div>
                <div class="form-group"><label class="form-label">연락처</label><input type="text" class="form-input" id="newDelPhone" placeholder="010-0000-0000" maxlength="14"></div>
            </div>
            <div class="form-row" style="grid-template-columns:100px 1fr">
                <div class="form-group"><label class="form-label">우편번호</label><input type="text" class="form-input" id="newDelZipcode" placeholder="00000" maxlength="5"></div>
                <div class="form-group"><label class="form-label">주소</label><input type="text" class="form-input" id="newDelAddress" placeholder="배송 주소"></div>
            </div>
            <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
                <div class="form-group"><label class="form-label">종류</label>
                    <select class="form-select" id="newDelType">
                        <option value="일반">일반</option>
                        <option value="중고">중고</option>
                        <option value="번개">번개</option>
                        <option value="당근">당근</option>
                        <option value="GS반택">GS반택</option>
                        <option value="ETSY">ETSY</option>
                        <option value="__custom">기타 (직접입력)</option>
                    </select>
                    <input type="text" class="form-input" id="newDelTypeCustom" placeholder="종류를 입력하세요" style="display:none;margin-top:6px">
                </div>
                <div class="form-group"><label class="form-label">발송인</label>
                    <select class="form-select" id="newDelSender">
                        <option value="케이엘피코리아">케이엘피코리아</option>
                        <option value="김관택">김관택</option>
                        <option value="이현주">이현주</option>
                        <option value="김현호">김현호</option>
                        <option value="유지은">유지은</option>
                        <option value="구정두">구정두</option>
                        <option value="황선영">황선영</option>
                        <option value="(이현주)">(이현주)</option>
                        <option value="__custom">기타 (직접입력)</option>
                    </select>
                    <input type="text" class="form-input" id="newDelSenderCustom" placeholder="발송인을 입력하세요" style="display:none;margin-top:6px">
                </div>
                <div class="form-group"><label class="form-label">선/착불</label><select class="form-select" id="newDelPayment"><option value="선불">선불</option><option value="착불">착불</option></select></div>
            </div>
            <div class="form-group delivery-price-col" id="newDelPriceGroup" style="display:none"><label class="form-label">판매가</label><input type="number" class="form-input" id="newDelPrice" placeholder="0"></div>
            <div class="form-row" style="grid-template-columns:140px 1fr">
                <div class="form-group"><label class="form-label">품목</label><input type="text" class="form-input" id="newDelProduct" placeholder="품목"></div>
                <div class="form-group"><label class="form-label">배송메모</label><input type="text" class="form-input" id="newDelMemo" placeholder="배송메모"></div>
            </div>
            <button class="form-submit" onclick="addDelivery()">택배 추가</button>`;
        // 연락처 자동 하이픈
        document.getElementById('newDelPhone').addEventListener('input', formatPhoneInput);
        // 종류 변경: 기타 토글 + 판매가 토글
        const priceTypes = ['중고', '번개', '당근', 'GS반택'];
        document.getElementById('newDelType').addEventListener('change', function() {
            const custom = document.getElementById('newDelTypeCustom');
            const priceGroup = document.getElementById('newDelPriceGroup');
            if (this.value === '__custom') {
                custom.style.display = 'block';
                custom.focus();
            } else {
                custom.style.display = 'none';
                custom.value = '';
            }
            priceGroup.style.display = priceTypes.includes(this.value) ? 'block' : 'none';
        });
        // 발송인 변경: 기타 토글
        document.getElementById('newDelSender').addEventListener('change', function() {
            const custom = document.getElementById('newDelSenderCustom');
            if (this.value === '__custom') {
                custom.style.display = 'block';
                custom.focus();
            } else {
                custom.style.display = 'none';
                custom.value = '';
            }
        });
    } else if (type === 'client') {
        openClientModal(null);
        return;
    } else if (type === 'client-overseas') {
        openClientOverseasModal(null);
        return;
    } else if (type === 'product') {
        openProductDBModal(null);
        return;
    }
    document.getElementById('modalOverlay').classList.add('show'); openModalHistory();
    const mb = document.getElementById('modalBody');
    if (mb) mb.scrollTop = 0;
}

// 인쇄비/포장비 같은 "부가비용"을 수량·적용방식·VAT에 맞춰 합계에 환산
function _feeComponent(feeId, vatId, applyId, qty) {
    const fee = readProjectNumber(feeId);
    if (!fee) return 0;
    const applyEl = document.getElementById(applyId);
    const vatEl = document.getElementById(vatId);
    const isPerUnit = applyEl ? applyEl.value === '1개당' : true;
    const vatExclude = vatEl ? vatEl.value === 'VAT 별도' : true;
    let total = isPerUnit ? fee * qty : fee;
    if (vatExclude) total = Math.round(total * 1.1);
    return total;
}

function _shippingComponent(typeId, vatId, costId, perBoxId, boxesId) {
    const typeEl = document.getElementById(typeId);
    if (!typeEl || !typeEl.value) return 0;
    const vatEl = document.getElementById(vatId);
    const vatExclude = vatEl ? vatEl.value === 'VAT 별도' : true;
    let cost = 0;
    if (typeEl.value === '택배') {
        cost = readProjectNumber(perBoxId) * readProjectNumber(boxesId);
    } else if (typeEl.value === '퀵') {
        cost = readProjectNumber(costId);
    }
    if (vatExclude && cost > 0) cost = Math.round(cost * 1.1);
    return cost;
}

function _breakdownHtml(productTotal, printTotal, packTotal, shippingTotal) {
    const r = (label, val) => `<div style="display:flex;justify-content:space-between;padding:3px 0"><span>${label}</span><strong style="color:var(--text-primary)">${val.toLocaleString()}원</strong></div>`;
    let html = r('제품 (단가 × 수량)', productTotal) + r('＋ 인쇄비', printTotal) + r('＋ 포장비', packTotal);
    if (shippingTotal) html += r('＋ 배송비', shippingTotal);
    return html;
}

// 마진 카드 렌더 — 매입액이 0이면 표시 안 함
function _renderMargin(marginId, rev, sup) {
    const el = document.getElementById(marginId);
    if (!el) return;
    if (sup <= 0) { el.innerHTML = ''; return; }
    const margin = rev - sup;
    const pct = rev > 0 ? Math.round(margin / rev * 100) : 0;
    const isNeg = margin < 0;
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:${isNeg ? '#FDECEC' : '#E8F8F0'};border-radius:8px;border:1.5px solid ${isNeg ? 'var(--red)' : '#16A34A'}">
        <span style="font-weight:800;color:var(--text-primary)">💵 예상 마진 <span style="font-size:11px;font-weight:600;color:var(--text-tertiary)">(매출 − 매입)</span></span>
        <strong style="font-size:20px;color:${isNeg ? 'var(--red)' : '#16A34A'}">${margin.toLocaleString()}원 <span style="font-size:14px;font-weight:600">(${pct}%)</span></strong>
    </div>`;
}

function _parseKRW(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    return parseInt((el.textContent || '').replace(/[^\d-]/g, '')) || 0;
}

function calcProjectRevenue() {
    const displayEl = document.getElementById('newProjectRevenueDisplay');
    if (!displayEl) return;
    const price = readProjectNumber('newProjectUnitPrice');
    const qty = readProjectNumber('newProjectQty');
    const vatEl = document.getElementById('newProjectVat');
    const vat = vatEl ? vatEl.value : 'exclude';
    let productTotal = price * qty;
    if (vat === 'exclude') productTotal = Math.round(productTotal * 1.1);
    const printTotal = _feeComponent('newProjectPrintFee', 'newProjectPrintFeeVat', 'newProjectPrintFeeApply', qty);
    const packTotal = _feeComponent('newProjectPackFee', 'newProjectPackFeeVat', 'newProjectPackFeeApply', qty);
    const shippingTotal = _shippingComponent('newProjectShippingType','newProjectShippingVat','newProjectShippingCost','newProjectShipPerBox','newProjectShipBoxes');
    const revenue = productTotal + printTotal + packTotal + shippingTotal;
    displayEl.textContent = revenue.toLocaleString() + ' 원';
    const bd = document.getElementById('newProjectRevenueBreakdown');
    if (bd) bd.innerHTML = _breakdownHtml(productTotal, printTotal, packTotal, shippingTotal);
    _renderMargin('newProjectMarginDisplay', revenue, _parseKRW('newProjectSupTotalDisplay'));
}

function toggleSupplierSection() {
    const supEl = document.getElementById('newProjectSupplier');
    const card = document.getElementById('supplierDetailCard');
    if (!supEl || !card) return;
    const hasSupplier = (supEl.value || '').trim().length > 0;
    card.style.display = hasSupplier ? 'block' : 'none';
    if (!hasSupplier) {
        const m = document.getElementById('newProjectMarginDisplay');
        if (m) m.innerHTML = '';
    }
}

function calcSupplierTotal() {
    const displayEl = document.getElementById('newProjectSupTotalDisplay');
    if (!displayEl) return;
    const price = readProjectNumber('newProjectSupUnitPrice');
    const qty = readProjectNumber('newProjectQty');
    const vatEl = document.getElementById('newProjectSupVat');
    const vat = vatEl ? vatEl.value : 'exclude';
    let productTotal = price * qty;
    if (vat === 'exclude') productTotal = Math.round(productTotal * 1.1);
    const printTotal = _feeComponent('newProjectSupPrintFee', 'newProjectSupPrintFeeVat', 'newProjectSupPrintFeeApply', qty);
    const packTotal = _feeComponent('newProjectSupPackFee', 'newProjectSupPackFeeVat', 'newProjectSupPackFeeApply', qty);
    const shippingTotal = _shippingComponent('newProjectSupShippingType','newProjectSupShippingVat','newProjectSupShippingCost','newProjectSupShipPerBox','newProjectSupShipBoxes');
    const total = productTotal + printTotal + packTotal + shippingTotal;
    displayEl.textContent = total.toLocaleString() + ' 원';
    const bd = document.getElementById('newProjectSupBreakdown');
    if (bd) bd.innerHTML = _breakdownHtml(productTotal, printTotal, packTotal, shippingTotal);
    _renderMargin('newProjectMarginDisplay', _parseKRW('newProjectRevenueDisplay'), total);
}

function openModalHistory() {
    if (!history.state || !history.state.modal) {
        history.pushState({ modal: true }, '');
    }
}
function closeModal(fromPopstate) {
    const overlay = document.getElementById('modalOverlay');
    const wasOpen = overlay.classList.contains('show');
    overlay.classList.remove('show');
    overlay.classList.remove('modal-wide');
    if (wasOpen && !fromPopstate && history.state && history.state.modal) {
        history.back();
    }
    currentPlanningQuill = null;
}

// ===== Add Handlers =====
async function addProject(type) {
    const name = document.getElementById('newProjectName').value.trim();
    const client = document.getElementById('newProjectClient').value.trim();
    if (!name) { showToast('품명을 입력해주세요'); return; }
    if (!client) { showToast('거래처를 입력해주세요'); return; }

    const unitPrice = readProjectNumber('newProjectUnitPrice');
    const qty = readProjectNumber('newProjectQty');
    const vat = document.getElementById('newProjectVat').value;
    let productTotal = unitPrice * qty;
    if (vat === 'exclude') productTotal = Math.round(productTotal * 1.1);
    // 국내 폼은 인쇄비·포장비를 매출액에 포함; 해외 폼은 단가×수량만
    const isDomesticForm = type === 'domestic';
    const printTotal = isDomesticForm ? _feeComponent('newProjectPrintFee','newProjectPrintFeeVat','newProjectPrintFeeApply',qty) : 0;
    const packTotal = isDomesticForm ? _feeComponent('newProjectPackFee','newProjectPackFeeVat','newProjectPackFeeApply',qty) : 0;
    const newShipTotal = isDomesticForm ? _shippingComponent('newProjectShippingType','newProjectShippingVat','newProjectShippingCost','newProjectShipPerBox','newProjectShipBoxes') : 0;
    const revenue = productTotal + printTotal + packTotal + newShipTotal;

    const assignee = currentUser ? currentUser.name : '';
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const getInt = (id) => readProjectNumber(id);

    const newProject = {
        id: Date.now(), name, client,
        contactPerson: getVal('newProjectContact'),
        title: '',
        manager: getVal('newProjectManager'),
        supplier: getVal('newProjectSupplier'),
        supplierContact: getVal('newProjectSupplierContact'),
        status: getVal('newProjectStatus') || "시작 전",
        priority: "🟢 보통", category: type === 'overseas' ? '해외 주문' : '국내 주문',
        assignees: [assignee],
        unitPrice, qty, vat, revenue,
        unit: getVal('newProjectUnit') || '개',
        color: getVal('newProjectColor'),
        printColorSize: getVal('newProjectPrintColorSize'),
        printMethod: getVal('newProjectPrintMethod') === '기타' ? (getVal('newProjectPrintMethodCustom') || '기타') : getVal('newProjectPrintMethod'),
        printFee: getInt('newProjectPrintFee'),
        printFeeVat: getVal('newProjectPrintFeeVat') || 'VAT 별도',
        printFeeApply: getVal('newProjectPrintFeeApply') || '1개당',
        packaging: getVal('newProjectPackaging') === '기타' ? (getVal('newProjectPackagingCustom') || '기타') : getVal('newProjectPackaging'),
        packagingFee: getInt('newProjectPackFee'),
        packagingFeeVat: getVal('newProjectPackFeeVat') || 'VAT 별도',
        packagingFeeApply: getVal('newProjectPackFeeApply') || '1개당',
        printCost: getInt('newProjectPrintFee'),
        packCost: getInt('newProjectPackFee'),
        shipCost: getShippingCost('new'),
        shippingType: getVal('newProjectShippingType'),
        shippingVat: getVal('newProjectShippingVat') || 'VAT 별도',
        shippingCostPerBox: readProjectNumber('newProjectShipPerBox'),
        shippingBoxes: readProjectNumber('newProjectShipBoxes'),
        shippingCost: getShippingCost('new'),
        startDate: fmtDate(new Date()),
        deadline: document.getElementById('newProjectDeadline').value,
        recipient: getVal('newProjectRecipient'),
        phone: getVal('newProjectPhone'),
        address: getVal('newProjectAddress'),
        checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false },
        memo: getVal('newProjectMemo')
    };

    // 매입처 상세 (통합 모델: 같은 행에 supplier_* 컬럼으로 저장)
    if (type === 'domestic' && newProject.supplier) {
        const supUnit = getInt('newProjectSupUnitPrice');
        if (supUnit > 0) {
            const supVatVal = getVal('newProjectSupVat') || 'exclude';
            const supVatLabel = supVatVal === 'include' ? 'VAT 포함' : 'VAT 별도';
            let supProductTotal = supUnit * newProject.qty;
            if (supVatVal === 'exclude') supProductTotal = Math.round(supProductTotal * 1.1);
            const supPrintTotal = _feeComponent('newProjectSupPrintFee','newProjectSupPrintFeeVat','newProjectSupPrintFeeApply',newProject.qty);
            const supPackTotal = _feeComponent('newProjectSupPackFee','newProjectSupPackFeeVat','newProjectSupPackFeeApply',newProject.qty);
            Object.assign(newProject, {
                supplierUnitPrice: supUnit,
                supplierUnitPriceVat: supVatLabel,
                supplierVat: supVatVal,
                supplierPrintFee: getInt('newProjectSupPrintFee'),
                supplierPrintFeeVat: getVal('newProjectSupPrintFeeVat') || 'VAT 별도',
                supplierPrintFeeApply: getVal('newProjectSupPrintFeeApply') || '1개당',
                supplierPackagingFee: getInt('newProjectSupPackFee'),
                supplierPackagingFeeVat: getVal('newProjectSupPackFeeVat') || 'VAT 별도',
                supplierPackagingFeeApply: getVal('newProjectSupPackFeeApply') || '1개당',
                supplierRevenue: supProductTotal + supPrintTotal + supPackTotal
            });
        }
    }

    if (type === 'domestic') {
        try {
            const { data, error } = await sb.from('projects_domestic').insert({
                client: newProject.client,
                contact_person: newProject.contactPerson,
                title: newProject.title,
                manager: newProject.manager,
                product_name: newProject.name,
                quantity: newProject.qty,
                unit: newProject.unit,
                unit_price: newProject.unitPrice,
                unit_price_vat: vat === 'exclude' ? 'VAT 별도' : 'VAT 포함',
                color: newProject.color,
                print_color_size: newProject.printColorSize,
                print_method: newProject.printMethod,
                print_fee: newProject.printFee,
                packaging: newProject.packaging,
                packaging_fee: newProject.packagingFee,
                delivery_date: newProject.deadline || null,
                recipient: newProject.recipient,
                phone: newProject.phone,
                address: newProject.address,
                revenue: newProject.revenue,
                status: newProject.status,
                priority: newProject.priority,
                category: newProject.category,
                assignees: newProject.assignees,
                start_date: newProject.startDate || null,
                checks: newProject.checks,
                memo: newProject.memo,
                supplier: newProject.supplier,
                supplier_contact: newProject.supplierContact || '',
                print_fee_vat: newProject.printFeeVat || 'VAT 별도',
                print_fee_apply: newProject.printFeeApply || '1개당',
                packaging_fee_vat: newProject.packagingFeeVat || 'VAT 별도',
                packaging_fee_apply: newProject.packagingFeeApply || '1개당',
                supplier_unit_price: newProject.supplierUnitPrice || 0,
                supplier_unit_price_vat: newProject.supplierUnitPriceVat || 'VAT 별도',
                supplier_print_fee: newProject.supplierPrintFee || 0,
                supplier_print_fee_vat: newProject.supplierPrintFeeVat || 'VAT 별도',
                supplier_print_fee_apply: newProject.supplierPrintFeeApply || '1개당',
                supplier_packaging_fee: newProject.supplierPackagingFee || 0,
                supplier_packaging_fee_vat: newProject.supplierPackagingFeeVat || 'VAT 별도',
                supplier_packaging_fee_apply: newProject.supplierPackagingFeeApply || '1개당',
                supplier_revenue: newProject.supplierRevenue || 0,
                shipping_type: newProject.shippingType || '',
                shipping_vat: newProject.shippingVat || 'VAT 별도',
                shipping_cost_per_box: newProject.shippingCostPerBox || 0,
                shipping_boxes: newProject.shippingBoxes || 0,
                shipping_cost: newProject.shippingCost || 0
            }).select().single();
            if (error) throw error;
            if (data) newProject.id = data.id;
        } catch (err) {
            console.error('Supabase 저장 실패:', err);
            showToast('DB 저장 실패 (로컬만 저장됨): ' + err.message);
        }
        domesticProjects.unshift(newProject);
    } else {
        overseasProjects.unshift(newProject);
    }
    projects.unshift(newProject);
    if (type === 'domestic') await syncProjectDeadlineTask(newProject);

    closeModal(); renderProjects(); renderHome();
    showToast('프로젝트가 추가되었습니다');
}

// Supabase에서 국내 프로젝트 로드
async function loadDomesticProjectsFromDb() {
    try {
        const { data, error } = await sb.from('projects_domestic').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        if (!data) return;
        // DB 데이터로 치환
        domesticProjects.length = 0;
        data.forEach(r => {
            domesticProjects.push({
                id: r.id,
                name: r.product_name || '',
                client: r.client || '',
                contactPerson: r.contact_person || '',
                title: r.title || '',
                manager: r.manager || '',
                supplier: r.supplier || '',
                supplierContact: r.supplier_contact || '',
                status: r.status || '시작 전',
                priority: r.priority || '🟢 보통',
                category: r.category || '국내 주문',
                assignees: r.assignees || [],
                unitPrice: r.unit_price || 0,
                qty: r.quantity || 0,
                unit: r.unit || '개',
                vat: r.unit_price_vat === 'VAT 포함' ? 'include' : 'exclude',
                revenue: r.revenue || 0,
                color: r.color || '',
                printColorSize: r.print_color_size || '',
                printMethod: r.print_method || '',
                printFee: r.print_fee || 0,
                printFeeVat: r.print_fee_vat || 'VAT 별도',
                printFeeApply: r.print_fee_apply || '1개당',
                packaging: r.packaging || '',
                packagingFee: r.packaging_fee || 0,
                packagingFeeVat: r.packaging_fee_vat || 'VAT 별도',
                packagingFeeApply: r.packaging_fee_apply || '1개당',
                // 매입처 상세 (통합 모델)
                supplierUnitPrice: r.supplier_unit_price || 0,
                supplierUnitPriceVat: r.supplier_unit_price_vat || 'VAT 별도',
                supplierVat: r.supplier_unit_price_vat === 'VAT 포함' ? 'include' : 'exclude',
                supplierPrintFee: r.supplier_print_fee || 0,
                supplierPrintFeeVat: r.supplier_print_fee_vat || 'VAT 별도',
                supplierPrintFeeApply: r.supplier_print_fee_apply || '1개당',
                supplierPackagingFee: r.supplier_packaging_fee || 0,
                supplierPackagingFeeVat: r.supplier_packaging_fee_vat || 'VAT 별도',
                supplierPackagingFeeApply: r.supplier_packaging_fee_apply || '1개당',
                supplierRevenue: r.supplier_revenue || 0,
                supplierShippingType: r.supplier_shipping_type || '',
                supplierShippingVat: r.supplier_shipping_vat || 'VAT 별도',
                supplierShippingCostPerBox: r.supplier_shipping_cost_per_box || 0,
                supplierShippingBoxes: r.supplier_shipping_boxes || 0,
                supplierShippingCost: r.supplier_shipping_cost || 0,
                printCost: r.print_fee || 0,
                packCost: r.packaging_fee || 0,
                shipCost: r.shipping_cost || 0,
                shippingType: r.shipping_type || '',
                shippingVat: r.shipping_vat || 'VAT 별도',
                shippingCostPerBox: r.shipping_cost_per_box || 0,
                shippingBoxes: r.shipping_boxes || 0,
                shippingCost: r.shipping_cost || 0,
                startDate: r.start_date || '',
                deadline: r.delivery_date || '',
                recipient: r.recipient || '',
                phone: r.phone || '',
                address: r.address || '',
                checks: r.checks || { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false },
                memo: r.memo || '',
                sourceDocNumber: r.source_doc_number || ''
            });
        });
        // projects 전체 재구성
        projects.length = 0;
        domesticProjects.forEach(p => projects.push(p));
        overseasProjects.forEach(p => projects.push(p));
    } catch (err) {
        console.error('국내 프로젝트 로드 실패 (테이블 미생성?):', err.message);
    }
}

// =====================================
// Supabase: daily_tasks & deliveries
// =====================================
function taskToDb(t) {
    return {
        task: t.task,
        date: t.date,
        assignee: t.assignee,
        target: t.target || '',
        priority: t.priority || '🟡 보통',
        done: !!t.done,
        deadline: t.deadline || null,
        label: t.label || '',
        client: t.client || '',
        linked_group: t.linkedGroup || null,
        is_deadline_copy: !!t.isDeadlineCopy,
        project_id: t.projectId || null
    };
}
function taskFromDb(r) {
    return {
        id: r.id,
        task: r.task,
        date: r.date,
        assignee: r.assignee,
        target: r.target || '',
        priority: r.priority || '🟡 보통',
        done: !!r.done,
        deadline: r.deadline || '',
        label: r.label || '',
        client: r.client || '',
        linkedGroup: r.linked_group || null,
        isDeadlineCopy: !!r.is_deadline_copy,
        projectId: r.project_id || null
    };
}
async function loadDailyTasksFromDb() {
    try {
        const { data, error } = await sb.from('daily_tasks').select('*').order('id', { ascending: true });
        if (error) throw error;
        dailyTasks.length = 0;
        (data || []).forEach(r => dailyTasks.push(taskFromDb(r)));
    } catch (err) {
        console.error('일일계획 로드 실패:', err.message);
        showToast('일일계획 로드 실패: ' + err.message);
    }
}

let dailyTasksChannel = null;
// ===== 전체 테이블 실시간 구독 =====
let _domesticRealtimeChannel = null;
let _tempRealtimeChannel = null;
let _deliveriesRealtimeChannel = null;
let _clientsRealtimeChannel = null;
let _planningRealtimeChannel = null;
let _planningRefreshTimer = null;

function scheduleRerender(fn, delay = 200) {
    // 단순 debounce — 여러 이벤트가 연달아 와도 한 번만 실행
    let t = scheduleRerender._timers || (scheduleRerender._timers = new Map());
    const prev = t.get(fn);
    if (prev) clearTimeout(prev);
    t.set(fn, setTimeout(() => { t.delete(fn); fn(); }, delay));
}

function subscribeDomesticProjectsRealtime() {
    if (_domesticRealtimeChannel) { sb.removeChannel(_domesticRealtimeChannel); _domesticRealtimeChannel = null; }
    _domesticRealtimeChannel = sb.channel('projects_domestic_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects_domestic' }, () => {
            scheduleRerender(async () => {
                await loadDomesticProjectsFromDb();
                try { renderProjects(); } catch (_) {}
                try { renderHome(); } catch (_) {}
            });
        })
        .subscribe();
}

function subscribeTempProjectsRealtime() {
    if (_tempRealtimeChannel) { sb.removeChannel(_tempRealtimeChannel); _tempRealtimeChannel = null; }
    _tempRealtimeChannel = sb.channel('projects_temp_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects_temp' }, () => {
            scheduleRerender(async () => {
                try { await loadTempProjects(); } catch (_) {}
            });
        })
        .subscribe();
}

function subscribeDeliveriesRealtime() {
    if (_deliveriesRealtimeChannel) { sb.removeChannel(_deliveriesRealtimeChannel); _deliveriesRealtimeChannel = null; }
    _deliveriesRealtimeChannel = sb.channel('deliveries_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => {
            scheduleRerender(async () => {
                await loadDeliveriesFromDb();
                try { renderDeliveries(); } catch (_) {}
                try { renderHome(); } catch (_) {}
            });
        })
        .subscribe();
}

function subscribeClientsRealtime() {
    if (_clientsRealtimeChannel) { sb.removeChannel(_clientsRealtimeChannel); _clientsRealtimeChannel = null; }
    _clientsRealtimeChannel = sb.channel('clients_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
            scheduleRerender(async () => {
                await loadClientsFromDb();
                try { renderClients(); } catch (_) {}
            });
        })
        .subscribe();
}

function subscribePlanningRealtime() {
    if (_planningRealtimeChannel) { sb.removeChannel(_planningRealtimeChannel); _planningRealtimeChannel = null; }
    const onAnyChange = () => {
        scheduleRerender(async () => {
            await loadPlanningProjects();
            const tab = document.getElementById('tab-planning');
            if (tab && tab.classList.contains('active')) {
                try { await renderPlanning({ skipLoad: true }); } catch (_) {}
            }
            try { renderPlanningHomeSection(); } catch (_) {}
        });
    };
    _planningRealtimeChannel = sb.channel('planning_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_projects' }, onAnyChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_posts' }, onAnyChange)
        .subscribe();
}

function subscribeAllRealtime() {
    try { subscribeDomesticProjectsRealtime(); } catch (e) { console.warn('domestic realtime fail', e); }
    try { subscribeTempProjectsRealtime(); } catch (e) { console.warn('temp realtime fail', e); }
    try { subscribeDeliveriesRealtime(); } catch (e) { console.warn('deliveries realtime fail', e); }
    try { subscribeClientsRealtime(); } catch (e) { console.warn('clients realtime fail', e); }
    try { subscribePlanningRealtime(); } catch (e) { console.warn('planning realtime fail', e); }
}

function subscribeDailyTasks() {
    if (dailyTasksChannel) {
        sb.removeChannel(dailyTasksChannel);
        dailyTasksChannel = null;
    }
    dailyTasksChannel = sb.channel('daily_tasks_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_tasks' }, (payload) => {
            let changed = false;
            if (payload.eventType === 'INSERT') {
                const row = taskFromDb(payload.new);
                if (!dailyTasks.find(t => t.id === row.id)) {
                    dailyTasks.push(row);
                    changed = true;
                }
            } else if (payload.eventType === 'UPDATE') {
                const row = taskFromDb(payload.new);
                const idx = dailyTasks.findIndex(t => t.id === row.id);
                if (idx !== -1) {
                    // 이미 동일한 내용이면 스킵 (자기 자신이 보낸 update 에코로 인한 불필요한 리렌더 방지)
                    if (JSON.stringify(dailyTasks[idx]) !== JSON.stringify(row)) {
                        dailyTasks[idx] = row;
                        changed = true;
                    }
                } else {
                    dailyTasks.push(row);
                    changed = true;
                }
            } else if (payload.eventType === 'DELETE') {
                const oldId = payload.old && payload.old.id;
                const idx = dailyTasks.findIndex(t => t.id === oldId);
                if (idx !== -1) {
                    dailyTasks.splice(idx, 1);
                    changed = true;
                }
            }
            if (!changed) return;
            renderDaily();
            renderHome();
        })
        .subscribe();
}
async function dbInsertTask(t) {
    const { data, error } = await sb.from('daily_tasks').insert(taskToDb(t)).select().single();
    if (error) { console.error(error); showToast('DB 저장 실패: ' + error.message); return null; }
    return taskFromDb(data);
}
async function dbUpdateTask(id, patch) {
    const map = { task:'task', date:'date', assignee:'assignee', target:'target', priority:'priority',
        done:'done', deadline:'deadline', label:'label', client:'client',
        linkedGroup:'linked_group', isDeadlineCopy:'is_deadline_copy' };
    const dbPatch = {};
    for (const [k, v] of Object.entries(patch)) {
        if (!map[k]) continue;
        dbPatch[map[k]] = (k === 'deadline' && !v) ? null : v;
    }
    if (Object.keys(dbPatch).length === 0) return;
    const { error } = await sb.from('daily_tasks').update(dbPatch).eq('id', id);
    if (error) { console.error(error); showToast('DB 수정 실패: ' + error.message); }
}
async function dbUpdateTasksByGroup(groupId, patch) {
    const map = { task:'task', date:'date', assignee:'assignee', target:'target', priority:'priority',
        done:'done', deadline:'deadline', label:'label', client:'client' };
    const dbPatch = {};
    for (const [k, v] of Object.entries(patch)) {
        if (!map[k]) continue;
        dbPatch[map[k]] = (k === 'deadline' && !v) ? null : v;
    }
    if (Object.keys(dbPatch).length === 0) return;
    const { error } = await sb.from('daily_tasks').update(dbPatch).eq('linked_group', groupId);
    if (error) { console.error(error); showToast('DB 수정 실패: ' + error.message); }
}
async function dbDeleteTask(id) {
    const { error } = await sb.from('daily_tasks').delete().eq('id', id);
    if (error) { console.error(error); showToast('DB 삭제 실패: ' + error.message); }
}
async function dbDeleteTasksByGroup(groupId) {
    const { error } = await sb.from('daily_tasks').delete().eq('linked_group', groupId);
    if (error) { console.error(error); showToast('DB 삭제 실패: ' + error.message); }
}

// 프로젝트 마감일 → 전체(공통) 일일 태스크 동기화
async function syncProjectDeadlineTask(p) {
    if (!p || !p.id) return;
    try {
        const { data: existing, error: selErr } = await sb.from('daily_tasks')
            .select('id').eq('project_id', p.id).limit(1);
        if (selErr) throw selErr;
        if (!p.deadline) {
            if (existing && existing.length > 0) {
                const { error: delErr } = await sb.from('daily_tasks').delete().eq('project_id', p.id);
                if (delErr) throw delErr;
            }
            return;
        }
        const taskName = `${p.client || ''} — ${p.name || ''} 마감`;
        const payload = {
            task: taskName,
            date: p.deadline,
            assignee: '전체',
            target: '',
            priority: '🔴 긴급',
            done: false,
            deadline: p.deadline,
            label: '거래처 업무',
            client: p.client || '',
            project_id: p.id,
            is_deadline_copy: false
        };
        let opErr;
        if (existing && existing.length > 0) {
            ({ error: opErr } = await sb.from('daily_tasks').update(payload).eq('id', existing[0].id));
        } else {
            ({ error: opErr } = await sb.from('daily_tasks').insert(payload));
        }
        if (opErr) throw opErr;
        // 로컬 배열도 즉시 반영 (구독이 늦게 올 수 있음)
        await loadDailyTasksFromDb();
        renderDaily();
        renderHome();
    } catch (err) {
        console.error('프로젝트 마감일 동기화 실패', err);
        let hint = '';
        if (/project_id/.test(err.message || '') || err.code === '42703' || err.code === 'PGRST204') {
            hint = '\n\nSupabase에서 다음 SQL을 실행해주세요:\nalter table public.daily_tasks add column if not exists project_id bigint;';
        }
        showToast('마감일 일정 동기화 실패: ' + err.message + hint);
    }
}
async function deleteProjectDeadlineTask(projectId) {
    try { await sb.from('daily_tasks').delete().eq('project_id', projectId); }
    catch (e) { console.error('프로젝트 태스크 삭제 실패', e); }
}

function deliveryToDb(d) {
    return {
        date: d.date,
        type: d.type || '일반',
        sender: d.sender || '',
        recipient: d.recipient,
        phone: d.phone || '',
        product: d.product || '',
        zipcode: d.zipcode || '',
        address: d.address || '',
        payment: d.payment || '선불',
        price: d.price || 0,
        memo: d.memo || '',
        tracking: d.tracking || '',
        rating: d.rating || '',
        seller: d.seller || '1',
        author: d.author || ''
    };
}
function deliveryFromDb(r) {
    return {
        id: r.id,
        date: r.date,
        type: r.type || '일반',
        sender: r.sender || '',
        recipient: r.recipient || '',
        phone: r.phone || '',
        product: r.product || '',
        zipcode: r.zipcode || '',
        address: r.address || '',
        payment: r.payment || '선불',
        price: r.price || 0,
        memo: r.memo || '',
        tracking: r.tracking || '',
        rating: r.rating || '',
        seller: r.seller || '1',
        author: r.author || ''
    };
}
async function loadDeliveriesFromDb() {
    try {
        const { data, error } = await sb.from('deliveries').select('*').order('date', { ascending: false }).order('id', { ascending: false });
        if (error) throw error;
        deliveries.length = 0;
        (data || []).forEach(r => deliveries.push(deliveryFromDb(r)));
    } catch (err) {
        console.error('택배 로드 실패:', err.message);
        showToast('택배 로드 실패: ' + err.message);
    }
}
async function dbInsertDelivery(d) {
    const { data, error } = await sb.from('deliveries').insert(deliveryToDb(d)).select().single();
    if (error) { console.error(error); showToast('DB 저장 실패: ' + error.message); return null; }
    return deliveryFromDb(data);
}
async function dbUpdateDelivery(id, patch) {
    const map = { date:'date', type:'type', sender:'sender', recipient:'recipient',
        phone:'phone', product:'product', zipcode:'zipcode', address:'address',
        payment:'payment', price:'price', memo:'memo', tracking:'tracking',
        rating:'rating', seller:'seller', author:'author' };
    const dbPatch = {};
    for (const [k, v] of Object.entries(patch)) {
        if (map[k]) dbPatch[map[k]] = v;
    }
    if (Object.keys(dbPatch).length === 0) return;
    const { error } = await sb.from('deliveries').update(dbPatch).eq('id', id);
    if (error) { console.error(error); showToast('DB 수정 실패: ' + error.message); }
}
async function dbDeleteDelivery(id) {
    const { error } = await sb.from('deliveries').delete().eq('id', id);
    if (error) { console.error(error); showToast('DB 삭제 실패: ' + error.message); }
}

// =====================================
// Supabase: clients
// =====================================
function clientToDb(c) {
    return {
        business_no: c.businessNo || '',
        company_name: c.companyName,
        ceo: c.ceo || '',
        phone: c.phone || '',
        fax: c.fax || '',
        mobile: c.mobile || '',
        email: c.email || '',
        zipcode: c.zipcode || '',
        address: c.address || '',
        biz_type: c.bizType || '',
        biz_item: c.bizItem || '',
        staff_name: c.staffName || '',
        staff_mobile: c.staffMobile || '',
        staff_email: c.staffEmail || '',
        grade: c.grade || '',
        category: c.category || ''
    };
}
function clientFromDb(r) {
    return {
        id: r.id,
        businessNo: r.business_no || '',
        companyName: r.company_name || '',
        ceo: r.ceo || '',
        phone: r.phone || '',
        fax: r.fax || '',
        mobile: r.mobile || '',
        email: r.email || '',
        zipcode: r.zipcode || '',
        address: r.address || '',
        bizType: r.biz_type || '',
        bizItem: r.biz_item || '',
        staffName: r.staff_name || '',
        staffMobile: r.staff_mobile || '',
        staffEmail: r.staff_email || '',
        grade: r.grade || '',
        category: r.category || ''
    };
}
async function loadClientsFromDb() {
    try {
        const all = [];
        let from = 0;
        const size = 1000;
        while (true) {
            const { data, error } = await sb.from('clients')
                .select('*')
                .order('company_name', { ascending: true })
                .range(from, from + size - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            data.forEach(r => all.push(clientFromDb(r)));
            if (data.length < size) break;
            from += size;
        }
        clients.length = 0;
        all.forEach(c => clients.push(c));
    } catch (err) {
        console.error('고객사 로드 실패:', err.message);
        showToast('고객사 로드 실패: ' + err.message);
    }
}
async function dbInsertClient(c) {
    const { data, error } = await sb.from('clients').insert(clientToDb(c)).select().single();
    if (error) { console.error(error); showToast('DB 저장 실패: ' + error.message); return null; }
    return clientFromDb(data);
}
// 인라인 편집 + 모달 수정 양쪽에서 쓰이므로 patch 의 실제 키만 DB 컬럼으로 매핑.
// (clientToDb 는 전체 필드를 강제 반환하므로 부분 업데이트에 쓰면 다른 필드가 빈 문자열로 덮여버림)
const CLIENT_FIELD_MAP = {
    businessNo: 'business_no',
    companyName: 'company_name',
    ceo: 'ceo',
    phone: 'phone',
    fax: 'fax',
    mobile: 'mobile',
    email: 'email',
    zipcode: 'zipcode',
    address: 'address',
    bizType: 'biz_type',
    bizItem: 'biz_item',
    staffName: 'staff_name',
    staffMobile: 'staff_mobile',
    staffEmail: 'staff_email',
    grade: 'grade',
    category: 'category'
};
async function dbUpdateClient(id, patch) {
    const dbPatch = {};
    for (const [k, v] of Object.entries(patch)) {
        if (CLIENT_FIELD_MAP[k] && v !== undefined) dbPatch[CLIENT_FIELD_MAP[k]] = v;
    }
    if (Object.keys(dbPatch).length === 0) return;
    const { error } = await sb.from('clients').update(dbPatch).eq('id', id);
    if (error) { console.error(error); showToast('DB 수정 실패: ' + error.message); }
}
async function dbDeleteClient(id) {
    const { error } = await sb.from('clients').delete().eq('id', id);
    if (error) { console.error(error); showToast('DB 삭제 실패: ' + error.message); }
}

function filterClients() {
    let list = clients;

    // 1) 카테고리 필터 (매출처/매입처/공란/전체)
    if (clientCategoryFilter === '매출처' || clientCategoryFilter === '매입처') {
        list = list.filter(c => (c.category || '') === clientCategoryFilter);
    } else if (clientCategoryFilter === '공란') {
        list = list.filter(c => c.category !== '매출처' && c.category !== '매입처');
    }

    // 2) 검색 필터
    if (clientSearch) {
        const q = clientSearch.toLowerCase();
        list = list.filter(c =>
            (c.companyName || '').toLowerCase().includes(q) ||
            (c.ceo || '').toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q) ||
            (c.mobile || '').toLowerCase().includes(q) ||
            (c.staffName || '').toLowerCase().includes(q) ||
            (c.address || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q)
        );
    }

    // 3) 정렬 (컬럼 헤더 클릭 시)
    if (clientSort.field) {
        const f = clientSort.field;
        const dir = clientSort.dir === 'desc' ? -1 : 1;
        list = [...list].sort((a, b) => {
            const av = (a[f] || '').toString();
            const bv = (b[f] || '').toString();
            return av.localeCompare(bv, 'ko') * dir;
        });
    }

    return list;
}

function setClientCategoryFilter(cat) {
    clientCategoryFilter = cat;
    clientPage = 1;
    // 칩 active 상태 반영
    document.querySelectorAll('#clientCategoryFilterBar .filter-chip').forEach(b => {
        b.classList.toggle('active', b.dataset.catFilter === cat);
    });
    renderClients();
}

function setClientSort(field) {
    if (clientSort.field === field) {
        clientSort.dir = clientSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        clientSort.field = field;
        clientSort.dir = 'asc';
    }
    clientPage = 1;
    renderClients();
}

function updateClientSortArrows() {
    document.querySelectorAll('#clientTable thead th.sortable').forEach(th => {
        const field = th.dataset.sort;
        const arrow = th.querySelector('.sort-arrow');
        if (!arrow) return;
        if (clientSort.field === field) {
            arrow.textContent = clientSort.dir === 'asc' ? ' ▲' : ' ▼';
            arrow.classList.add('active');
        } else {
            arrow.textContent = ' ⇅';
            arrow.classList.remove('active');
        }
    });
}

async function bulkDeleteClients() {
    if (selectedClientIds.size === 0) { showToast('선택된 거래처가 없습니다'); return; }
    const n = selectedClientIds.size;
    if (!confirm(`선택된 ${n}개 거래처를 정말 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;

    const ids = Array.from(selectedClientIds);
    // 500건씩 배치 삭제
    const BATCH = 500;
    let ok = 0, fail = 0;
    for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const { error } = await sb.from('clients').delete().in('id', chunk);
        if (error) { console.error(error); fail += chunk.length; continue; }
        ok += chunk.length;
    }
    // 로컬 상태 정리
    const idSet = new Set(ids);
    for (let i = clients.length - 1; i >= 0; i--) {
        if (idSet.has(clients[i].id)) clients.splice(i, 1);
    }
    selectedClientIds.clear();
    showToast(`삭제 완료: ${ok}건${fail ? ` / 실패 ${fail}건` : ''}`);
    renderClients();
}

const selectedClientIds = new Set();

function toggleClientSelect(id, el) {
    if (el.checked) selectedClientIds.add(id);
    else selectedClientIds.delete(id);
    const tr = el.closest('tr');
    if (tr) tr.classList.toggle('row-selected', el.checked);
    updateClientBulkBar();
    const pageChecks = document.querySelectorAll('#clientTableBody .client-row-check');
    const selAll = document.getElementById('clientSelectAll');
    if (selAll && pageChecks.length) {
        const all = Array.from(pageChecks).every(cb => cb.checked);
        const some = Array.from(pageChecks).some(cb => cb.checked);
        selAll.checked = all;
        selAll.indeterminate = !all && some;
    }
}

function toggleClientSelectAll(el) {
    const checks = document.querySelectorAll('#clientTableBody .client-row-check');
    checks.forEach(cb => {
        const id = Number(cb.dataset.id);
        cb.checked = el.checked;
        if (el.checked) selectedClientIds.add(id);
        else selectedClientIds.delete(id);
        const tr = cb.closest('tr');
        if (tr) tr.classList.toggle('row-selected', el.checked);
    });
    el.indeterminate = false;
    updateClientBulkBar();
}

function updateClientBulkBar() {
    const bar = document.getElementById('clientBulkBar');
    const cnt = document.getElementById('clientBulkCount');
    if (!bar || !cnt) return;
    const n = selectedClientIds.size;
    if (n === 0) {
        bar.style.display = 'none';
    } else {
        bar.style.display = 'flex';
        cnt.textContent = `${n}개 선택됨`;
    }
}

function clearClientSelection() {
    selectedClientIds.clear();
    renderClients();
}

async function applyClientBulkEdit() {
    if (selectedClientIds.size === 0) { showToast('선택된 고객사가 없습니다'); return; }
    const catSel = document.getElementById('clientBulkCategory');
    const gradeEnabled = document.getElementById('clientBulkGradeEnabled').checked;
    const gradeVal = document.getElementById('clientBulkGrade').value.trim();
    const catVal = catSel.value;
    const changeCat = catVal !== '__skip';
    if (!changeCat && !gradeEnabled) { showToast('변경할 항목을 선택해주세요'); return; }

    const ids = Array.from(selectedClientIds);
    const dbPatch = {};
    const localPatch = {};
    if (changeCat) { dbPatch.category = catVal; localPatch.category = catVal; }
    if (gradeEnabled) { dbPatch.grade = gradeVal; localPatch.grade = gradeVal; }

    if (!confirm(`${ids.length}개 고객사를 일괄 수정하시겠습니까?`)) return;

    let ok = 0, fail = 0;
    for (const id of ids) {
        const { error } = await sb.from('clients').update(dbPatch).eq('id', id);
        if (error) { console.error(error); fail++; continue; }
        const c = clients.find(x => x.id === id);
        if (c) Object.assign(c, localPatch);
        ok++;
    }
    showToast(`일괄 수정 완료: ${ok}건${fail ? ` / 실패 ${fail}건` : ''}`);
    selectedClientIds.clear();
    renderClients();
}

function renderClients() {
    const tbody = document.getElementById('clientTableBody');
    if (!tbody) return;
    const filtered = filterClients();
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / CLIENTS_PER_PAGE));
    if (clientPage > totalPages) clientPage = totalPages;
    if (clientPage < 1) clientPage = 1;
    const start = (clientPage - 1) * CLIENTS_PER_PAGE;
    const pageItems = filtered.slice(start, start + CLIENTS_PER_PAGE);

    const stats = document.getElementById('clientStats');
    if (stats) stats.textContent = `총 ${total.toLocaleString()}개 고객사 · ${clientPage} / ${totalPages} 페이지`;

    const esc = s => (s || '').toString().replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

    const catBadge = (cat) => {
        if (cat === '매입처') return `<span class="badge badge-purple">매입처</span>`;
        if (cat === '매출처') return `<span class="badge badge-blue">매출처</span>`;
        return '-';
    };
    tbody.innerHTML = pageItems.map(c => {
        const ed = (field, type, val, opts) => {
            const opt = opts ? ` data-options="${opts}"` : '';
            return `<td class="cell-editable" data-entity="client" data-id="${c.id}" data-field="${field}" data-type="${type}"${opt}>${val}</td>`;
        };
        const checked = selectedClientIds.has(c.id) ? 'checked' : '';
        return `<tr onclick="clientRowClick(${c.id})" style="cursor:pointer" ${checked ? 'class="row-selected"' : ''}>
        <td style="text-align:center" onclick="event.stopPropagation()"><input type="checkbox" class="client-row-check" data-id="${c.id}" ${checked} onclick="toggleClientSelect(${c.id}, this)" style="width:16px;height:16px;cursor:pointer"></td>
        ${ed('category', 'select', catBadge(c.category), '매입처,매출처,')}
        ${ed('companyName', 'text', `<strong>${esc(c.companyName)}</strong>`)}
        ${ed('ceo', 'text', esc(c.ceo) || '-')}
        ${ed('phone', 'text', esc(c.phone) || '-')}
        ${ed('mobile', 'text', esc(c.mobile) || '-')}
        ${ed('email', 'text', esc(c.email) || '-')}
        <td class="cell-editable" data-entity="client" data-id="${c.id}" data-field="address" data-type="text" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.address) || '-'}</td>
        ${ed('bizType', 'text', esc(c.bizType) || '-')}
        ${ed('bizItem', 'text', esc(c.bizItem) || '-')}
        ${ed('staffName', 'text', esc(c.staffName) || '-')}
        ${ed('grade', 'text', esc(c.grade) || '-')}
        <td><button class="edit-btn" onclick="event.stopPropagation();openEditClient(${c.id})">편집</button></td>
    </tr>`;
    }).join('') || `<tr><td colspan="13" style="text-align:center;padding:40px;color:var(--text-tertiary)">고객사가 없습니다</td></tr>`;

    // 일괄 수정 바 / 전체선택 체크박스 동기화
    updateClientBulkBar();
    const selAll = document.getElementById('clientSelectAll');
    if (selAll) {
        const pageIds = pageItems.map(c => c.id);
        const allChecked = pageIds.length > 0 && pageIds.every(id => selectedClientIds.has(id));
        const someChecked = pageIds.some(id => selectedClientIds.has(id));
        selAll.checked = allChecked;
        selAll.indeterminate = !allChecked && someChecked;
    }

    // 페이지네이션
    const pag = document.getElementById('clientPagination');
    if (pag) {
        if (totalPages <= 1) {
            pag.innerHTML = '';
        } else {
            const btn = (label, page, disabled, active) =>
                `<button class="filter-chip ${active ? 'active' : ''}" ${disabled ? 'disabled' : ''} onclick="gotoClientPage(${page})" style="min-width:36px">${label}</button>`;
            let html = '';
            html += btn('«', 1, clientPage === 1);
            html += btn('‹', clientPage - 1, clientPage === 1);
            const windowSize = 5;
            let s = Math.max(1, clientPage - Math.floor(windowSize / 2));
            let e = Math.min(totalPages, s + windowSize - 1);
            s = Math.max(1, e - windowSize + 1);
            for (let i = s; i <= e; i++) html += btn(i, i, false, i === clientPage);
            html += btn('›', clientPage + 1, clientPage === totalPages);
            html += btn('»', totalPages, clientPage === totalPages);
            pag.innerHTML = html;
        }
    }

    // 정렬 화살표 상태 반영
    updateClientSortArrows();
}

function gotoClientPage(p) {
    clientPage = p;
    renderClients();
}

function openClientModal(existing) {
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const c = existing || {};
    title.textContent = existing ? '고객사 수정' : '새 고객사';
    const v = k => (c[k] || '').toString().replace(/"/g, '&quot;');
    body.innerHTML = `
        <div class="form-row">
            <div class="form-group"><label class="form-label">회사명 <span style="color:var(--red)">*</span></label><input type="text" class="form-input" id="cliCompanyName" value="${v('companyName')}" placeholder="회사명" ></div>
            <div class="form-group"><label class="form-label">대표자</label><input type="text" class="form-input" id="cliCeo" value="${v('ceo')}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">사업자등록번호</label><input type="text" class="form-input" id="cliBusinessNo" value="${v('businessNo')}"></div>
            <div class="form-group"><label class="form-label">구분</label>
                <select class="form-select" id="cliCategory">
                    <option value="" ${!c.category ? 'selected' : ''}>선택 안함</option>
                    <option value="매입처" ${c.category === '매입처' ? 'selected' : ''}>매입처</option>
                    <option value="매출처" ${c.category === '매출처' ? 'selected' : ''}>매출처</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">전화</label><input type="text" class="form-input" id="cliPhone" value="${v('phone')}"></div>
            <div class="form-group"><label class="form-label">팩스</label><input type="text" class="form-input" id="cliFax" value="${v('fax')}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">핸드폰</label><input type="text" class="form-input" id="cliMobile" value="${v('mobile')}"></div>
            <div class="form-group"><label class="form-label">이메일</label><input type="text" class="form-input" id="cliEmail" value="${v('email')}"></div>
        </div>
        <div class="form-row" style="grid-template-columns:120px 1fr">
            <div class="form-group"><label class="form-label">우편번호</label><input type="text" class="form-input" id="cliZipcode" value="${v('zipcode')}"></div>
            <div class="form-group"><label class="form-label">주소</label><input type="text" class="form-input" id="cliAddress" value="${v('address')}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">업태</label><input type="text" class="form-input" id="cliBizType" value="${v('bizType')}"></div>
            <div class="form-group"><label class="form-label">업종</label><input type="text" class="form-input" id="cliBizItem" value="${v('bizItem')}"></div>
        </div>
        <div class="form-section-title">담당직원</div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">이름</label><input type="text" class="form-input" id="cliStaffName" value="${v('staffName')}"></div>
            <div class="form-group"><label class="form-label">핸드폰</label><input type="text" class="form-input" id="cliStaffMobile" value="${v('staffMobile')}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">이메일</label><input type="text" class="form-input" id="cliStaffEmail" value="${v('staffEmail')}"></div>
            <div class="form-group"><label class="form-label">등급</label><input type="text" class="form-input" id="cliGrade" value="${v('grade')}"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
            ${existing ? `<button class="form-submit" style="flex:1;background:var(--red)" onclick="deleteClient(${c.id})">🗑️ 삭제</button>` : ''}
            <button class="form-submit" style="flex:2" onclick="${existing ? `saveEditClient(${c.id})` : 'addClient()'}">💾 ${existing ? '수정 저장' : '추가'}</button>
        </div>`;
    document.getElementById('modalOverlay').classList.add('show'); openModalHistory();
}

function readClientForm() {
    return {
        companyName: document.getElementById('cliCompanyName').value.trim(),
        ceo: document.getElementById('cliCeo').value.trim(),
        businessNo: document.getElementById('cliBusinessNo').value.trim(),
        category: document.getElementById('cliCategory').value.trim(),
        phone: document.getElementById('cliPhone').value.trim(),
        fax: document.getElementById('cliFax').value.trim(),
        mobile: document.getElementById('cliMobile').value.trim(),
        email: document.getElementById('cliEmail').value.trim(),
        zipcode: document.getElementById('cliZipcode').value.trim(),
        address: document.getElementById('cliAddress').value.trim(),
        bizType: document.getElementById('cliBizType').value.trim(),
        bizItem: document.getElementById('cliBizItem').value.trim(),
        staffName: document.getElementById('cliStaffName').value.trim(),
        staffMobile: document.getElementById('cliStaffMobile').value.trim(),
        staffEmail: document.getElementById('cliStaffEmail').value.trim(),
        grade: document.getElementById('cliGrade').value.trim()
    };
}

async function addClient() {
    const form = readClientForm();
    if (!form.companyName) { showToast('회사명을 입력해주세요'); return; }
    const saved = await dbInsertClient(form);
    if (!saved) return;
    clients.push(saved);
    clients.sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));
    closeModal();
    renderClients();
    showToast('고객사가 추가되었습니다');
}

function openEditClient(id) {
    const c = clients.find(x => x.id === id);
    if (!c) return;
    openClientModal(c);
}

let _clientRowClickTimer = null;
function clientRowClick(id) {
    if (_clientRowClickTimer) clearTimeout(_clientRowClickTimer);
    _clientRowClickTimer = setTimeout(() => {
        _clientRowClickTimer = null;
        openClientDetail(id);
    }, 250);
}

function openClientDetail(id) {
    const c = clients.find(x => x.id === id);
    if (!c) return;
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    title.textContent = `${c.companyName} — 상세`;

    const esc = s => (s || '').toString().replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
    const cat = c.category === '매입처' ? `<span class="badge badge-purple">매입처</span>`
              : c.category === '매출처' ? `<span class="badge badge-blue">매출처</span>` : '';

    // 연동된 일일계획표 (client 필드가 회사명과 일치)
    const linkedTasks = dailyTasks
        .filter(t => t.client && t.client === c.companyName)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // 연동된 프로젝트 — 매출처(project.client) + 매입처(project.supplier) 양쪽 매칭
    const linkedProjectsMap = new Map();
    projects.forEach(p => {
        const asClient = p.client && p.client === c.companyName;
        const asSupplier = p.supplier && p.supplier === c.companyName;
        if (!asClient && !asSupplier) return;
        const role = asClient && asSupplier ? '매출+매입' : (asClient ? '매출' : '매입');
        linkedProjectsMap.set(p.id, { p, role });
    });
    const linkedProjects = Array.from(linkedProjectsMap.values())
        .sort((a, b) => (b.p.startDate || '').localeCompare(a.p.startDate || ''));

    const tasksHtml = linkedTasks.length === 0
        ? `<div style="color:var(--text-tertiary);font-size:13px;padding:8px 0">연동된 일일계획표가 없습니다</div>`
        : `<table class="data-table" style="margin-top:8px">
            <thead><tr><th style="width:100px">날짜</th><th>할 일</th><th style="width:90px">담당자</th><th style="width:60px">완료</th></tr></thead>
            <tbody>${linkedTasks.map(t => `<tr onclick="closeModal();switchTab('daily');setTimeout(()=>openEditTask(${t.id}),100)" style="cursor:pointer">
                <td>${esc(t.date)}</td>
                <td>${esc(t.task)}</td>
                <td>${esc(t.assignee)}</td>
                <td>${t.done ? '✅' : '⬜'}</td>
            </tr>`).join('')}</tbody>
        </table>`;

    const roleBadge = role => {
        if (role === '매출+매입') return `<span class="badge badge-purple">매출+매입</span>`;
        if (role === '매입') return `<span class="badge badge-purple">매입</span>`;
        return `<span class="badge badge-blue">매출</span>`;
    };
    const projectsHtml = linkedProjects.length === 0
        ? `<div style="color:var(--text-tertiary);font-size:13px;padding:8px 0">연동된 프로젝트가 없습니다</div>`
        : `<table class="data-table" style="margin-top:8px">
            <thead><tr><th style="width:90px">역할</th><th>품명</th><th style="width:100px">상태</th><th style="width:120px">납기</th><th style="width:120px">금액</th></tr></thead>
            <tbody>${linkedProjects.map(({ p, role }) => {
                const amount = role === '매입' ? (p.supplierRevenue || 0) : (p.revenue || 0);
                return `<tr onclick="closeModal();switchTab('${p.category === '해외 주문' ? 'projects-overseas' : 'projects-domestic'}');setTimeout(()=>showProjectDetail(${p.id}),100)" style="cursor:pointer">
                    <td>${roleBadge(role)}</td>
                    <td><strong>${esc(p.name)}</strong></td>
                    <td>${esc(p.status)}</td>
                    <td>${esc(p.deadline) || '-'}</td>
                    <td>${amount.toLocaleString()}원</td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;

    const row = (label, val) => `<div style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--gray-100)"><div style="width:100px;color:var(--text-tertiary);font-size:13px">${label}</div><div style="flex:1;font-size:14px">${esc(val) || '-'}</div></div>`;

    body.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
            ${cat}
            <h3 style="margin:0;font-size:20px">${esc(c.companyName)}</h3>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            <div>
                <div class="form-section-title">📋 기본 정보</div>
                <div style="background:var(--gray-50);border-radius:8px;padding:8px 14px;margin-bottom:12px">
                    ${row('대표자', c.ceo)}
                    ${row('사업자번호', c.businessNo)}
                    ${row('전화', c.phone)}
                    ${row('팩스', c.fax)}
                    ${row('핸드폰', c.mobile)}
                    ${row('이메일', c.email)}
                    ${row('우편번호', c.zipcode)}
                    ${row('주소', c.address)}
                    ${row('업태', c.bizType)}
                    ${row('업종', c.bizItem)}
                    ${row('등급', c.grade)}
                </div>
            </div>
            <div>
                <div class="form-section-title">👤 담당직원</div>
                <div style="background:var(--gray-50);border-radius:8px;padding:8px 14px;margin-bottom:16px">
                    ${row('이름', c.staffName)}
                    ${row('핸드폰', c.staffMobile)}
                    ${row('이메일', c.staffEmail)}
                </div>
                <div class="form-section-title">📅 연동된 일일계획표 (${linkedTasks.length}건)</div>
                ${tasksHtml}
                <div class="form-section-title" style="margin-top:16px">📦 연동된 프로젝트 (${linkedProjects.length}건)</div>
                ${projectsHtml}
            </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:20px">
            <button class="form-submit" style="flex:1" onclick="openEditClient(${id})">✏️ 편집</button>
            <button class="form-submit" style="flex:1;background:var(--gray-200);color:var(--gray-800)" onclick="closeModal()">닫기</button>
        </div>`;
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.add('show'); openModalHistory();
    overlay.classList.add('modal-wide');
}

async function saveEditClient(id) {
    const c = clients.find(x => x.id === id);
    if (!c) return;
    const form = readClientForm();
    if (!form.companyName) { showToast('회사명을 입력해주세요'); return; }
    Object.assign(c, form);
    await dbUpdateClient(id, form);
    clients.sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));
    closeModal();
    renderClients();
    showToast('고객사가 수정되었습니다');
}

async function deleteClient(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await dbDeleteClient(id);
    const idx = clients.findIndex(x => x.id === id);
    if (idx !== -1) clients.splice(idx, 1);
    closeModal();
    renderClients();
    showToast('고객사가 삭제되었습니다');
}

// =====================================
// Supabase: clients_overseas (해외 거래처 DB — 자료실)
// =====================================
function clientOverseasToDb(c) {
    return {
        company_name: c.companyName,
        items: c.items || '',
        phone: c.phone || '',
        email: c.email || '',
        location: c.location || '',
        biz_type: c.bizType || '',
        contact_name: c.contactName || '',
        production_history: Array.isArray(c.productionHistory) ? c.productionHistory : []
    };
}
function clientOverseasFromDb(r) {
    return {
        id: r.id,
        companyName: r.company_name || '',
        items: r.items || '',
        phone: r.phone || '',
        email: r.email || '',
        location: r.location || '',
        bizType: r.biz_type || '',
        contactName: r.contact_name || '',
        productionHistory: Array.isArray(r.production_history) ? r.production_history : []
    };
}
async function loadClientsOverseasFromDb() {
    try {
        const { data, error } = await sb.from('clients_overseas')
            .select('*')
            .order('company_name', { ascending: true });
        if (error) throw error;
        clientsOverseas.length = 0;
        (data || []).forEach(r => clientsOverseas.push(clientOverseasFromDb(r)));
    } catch (err) {
        console.error('해외 거래처 로드 실패:', err.message);
        // 테이블이 아직 없으면 조용히 무시 (마이그레이션 전)
        if (!/relation .* does not exist/i.test(err.message || '')) {
            showToast('해외 거래처 로드 실패: ' + err.message);
        }
    }
}
async function dbInsertClientOverseas(c) {
    const { data, error } = await sb.from('clients_overseas').insert(clientOverseasToDb(c)).select().single();
    if (error) { console.error(error); showToast('DB 저장 실패: ' + error.message); return null; }
    return clientOverseasFromDb(data);
}
async function dbUpdateClientOverseas(id, patch) {
    const dbPatch = clientOverseasToDb(patch);
    Object.keys(dbPatch).forEach(k => { if (dbPatch[k] === undefined) delete dbPatch[k]; });
    const { error } = await sb.from('clients_overseas').update(dbPatch).eq('id', id);
    if (error) {
        console.error(error);
        showToast('DB 수정 실패: ' + error.message + (error.hint ? ' — ' + error.hint : ''));
        return false;
    }
    return true;
}
async function dbDeleteClientOverseas(id) {
    const { error } = await sb.from('clients_overseas').delete().eq('id', id);
    if (error) { console.error(error); showToast('DB 삭제 실패: ' + error.message); }
}

function filterClientsOverseas() {
    if (!clientOverseasSearch) return clientsOverseas;
    const q = clientOverseasSearch.toLowerCase();
    return clientsOverseas.filter(c =>
        (c.companyName || '').toLowerCase().includes(q) ||
        (c.items || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.location || '').toLowerCase().includes(q) ||
        (c.contactName || '').toLowerCase().includes(q)
    );
}

function renderClientsOverseas() {
    const tbody = document.getElementById('clientOverseasTableBody');
    if (!tbody) return;
    const filtered = filterClientsOverseas();
    const stats = document.getElementById('clientOverseasStats');
    if (stats) stats.textContent = `총 ${filtered.length.toLocaleString()}개 해외 거래처`;

    const esc = s => (s || '').toString().replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
    const typeBadge = (t) => {
        if (t === '공장') return `<span class="badge badge-purple">공장</span>`;
        if (t === '에이전시') return `<span class="badge badge-blue">에이전시</span>`;
        return '-';
    };

    // 제작 이력 — 최신(발주일 내림차순) 1건을 발주일/품목/단가/수량 4개 셀로 풀어서 표시
    const latestProduction = (c) => {
        const hist = Array.isArray(c.productionHistory) ? c.productionHistory.filter(h => h && (h.item || h.qty || h.unit_price_usd || h.order_date)) : [];
        if (hist.length === 0) return null;
        const sorted = [...hist].sort((a, b) => (b.order_date || '').localeCompare(a.order_date || ''));
        return { latest: sorted[0], total: hist.length };
    };

    tbody.innerHTML = filtered.map(c => {
        const p = latestProduction(c);
        const latest = p ? p.latest : null;
        const more = p && p.total > 1 ? `<span style="font-size:11px;color:var(--gray-500);margin-left:6px">외 ${p.total - 1}건 발주</span>` : '';
        const rep = esc(c.items) || '-';  // 대표 생산 품목 = 자유입력 텍스트
        const itemCell = latest && latest.item ? `<strong>${esc(latest.item)}</strong>${more}` : '-';
        const dateCell = latest && latest.order_date ? esc(latest.order_date) : '-';
        const priceCell = latest && latest.unit_price_usd ? `$${Number(latest.unit_price_usd).toFixed(2)}` : '-';
        const qtyCell = latest && latest.qty ? `${Number(latest.qty).toLocaleString()}` : '-';
        return `
        <tr onclick="openEditClientOverseas(${c.id})" style="cursor:pointer">
            <td>${typeBadge(c.bizType)}</td>
            <td><strong>${esc(c.companyName)}</strong></td>
            <td>${rep}</td>
            <td>${esc(c.phone) || '-'}</td>
            <td>${esc(c.email) || '-'}</td>
            <td>${esc(c.location) || '-'}</td>
            <td>${esc(c.contactName) || '-'}</td>
            <td>${itemCell}</td>
            <td style="text-align:right">${priceCell}</td>
            <td style="text-align:right">${qtyCell}</td>
            <td>${dateCell}</td>
            <td><button class="edit-btn" onclick="event.stopPropagation();openEditClientOverseas(${c.id})">편집</button></td>
        </tr>`;
    }).join('') || `<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text-tertiary)">해외 거래처가 없습니다</td></tr>`;
}

function openClientOverseasModal(existing) {
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const c = existing || {};
    title.textContent = existing ? '해외 거래처 수정' : '새 해외 거래처';
    const v = k => (c[k] || '').toString().replace(/"/g, '&quot;');
    const bt = c.bizType || '';
    body.innerHTML = `
        <div class="form-row">
            <div class="form-group"><label class="form-label">회사명 <span style="color:var(--red)">*</span></label><input type="text" class="form-input" id="covCompanyName" value="${v('companyName')}" placeholder="회사명"></div>
            <div class="form-group"><label class="form-label">유형</label>
                <select class="form-select" id="covBizType">
                    <option value="" ${!bt ? 'selected' : ''}>선택 안함</option>
                    <option value="공장" ${bt === '공장' ? 'selected' : ''}>공장</option>
                    <option value="에이전시" ${bt === '에이전시' ? 'selected' : ''}>에이전시</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">대표 생산 품목</label><input type="text" class="form-input" id="covItems" value="${v('items')}" placeholder="예) 시계, 가죽 파우치"></div>
            <div class="form-group"><label class="form-label">담당자명</label><input type="text" class="form-input" id="covContactName" value="${v('contactName')}" placeholder="담당자 이름"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">연락처</label><input type="text" class="form-input" id="covPhone" value="${v('phone')}" placeholder="+86 ..."></div>
            <div class="form-group"><label class="form-label">이메일</label><input type="text" class="form-input" id="covEmail" value="${v('email')}" placeholder="name@company.com"></div>
        </div>
        <div class="form-row" style="grid-template-columns:1fr">
            <div class="form-group"><label class="form-label">위치</label><input type="text" class="form-input" id="covLocation" value="${v('location')}" placeholder="예) 중국 광저우 / 베트남 하노이"></div>
        </div>
        <div class="form-row" style="grid-template-columns:1fr">
            <div class="form-group">
                <label class="form-label">📋 제작 이력 (단가는 USD)</label>
                <div style="display:grid;grid-template-columns:130px 2fr 1fr 1fr 40px;gap:8px;font-size:11px;color:var(--gray-500);font-weight:700;margin-bottom:4px;padding:0 4px">
                    <div>발주일</div>
                    <div>품목</div>
                    <div style="text-align:right">단가 ($)</div>
                    <div style="text-align:right">수량</div>
                    <div></div>
                </div>
                <div id="covProductionList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"></div>
                <button type="button" onclick="addOverseasProductionRow()" style="width:100%;padding:10px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">+ 품목 추가</button>
            </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
            ${existing ? `<button class="form-submit" style="flex:1;background:var(--red)" onclick="deleteClientOverseas(${c.id})">🗑️ 삭제</button>` : ''}
            <button class="form-submit" style="flex:2" onclick="${existing ? `saveEditClientOverseas(${c.id})` : 'addClientOverseas()'}">💾 ${existing ? '수정 저장' : '추가'}</button>
        </div>`;
    // 기존 제작 이력 채우기 (없으면 빈 행 1개)
    const history = Array.isArray(c.productionHistory) ? c.productionHistory : [];
    if (history.length === 0) {
        addOverseasProductionRow();
    } else {
        history.forEach(h => addOverseasProductionRow(h));
    }
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    openModalHistory();
}

function addOverseasProductionRow(data) {
    const list = document.getElementById('covProductionList');
    if (!list) return;
    const d = data || {};
    const esc = s => (s == null ? '' : s.toString()).replace(/"/g, '&quot;');
    const row = document.createElement('div');
    row.className = 'cov-production-row';
    row.style.cssText = 'display:grid;grid-template-columns:130px 2fr 1fr 1fr 40px;gap:8px;align-items:center';
    row.innerHTML = `
        <input type="date" class="form-input cov-prod-date" value="${esc(d.order_date || '')}" style="margin:0">
        <input type="text" class="form-input cov-prod-item" placeholder="품목명" value="${esc(d.item)}" style="margin:0">
        <div style="position:relative">
            <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--gray-500);font-weight:700;font-size:13px;pointer-events:none">$</span>
            <input type="text" inputmode="decimal" class="form-input cov-prod-price" placeholder="0.00" value="${esc(d.unit_price_usd ?? '')}" style="margin:0;padding-left:22px;text-align:right">
        </div>
        <input type="text" inputmode="numeric" class="form-input cov-prod-qty" placeholder="0" value="${esc(d.qty ?? '')}" style="margin:0;text-align:right">
        <button type="button" onclick="removeOverseasProductionRow(this)" title="삭제" style="background:var(--gray-100);border:none;border-radius:8px;padding:8px 0;cursor:pointer;font-size:14px">🗑</button>
    `;
    list.appendChild(row);
}

function removeOverseasProductionRow(btn) {
    const row = btn.closest('.cov-production-row');
    if (row) row.remove();
}

function readOverseasProductionHistory() {
    const rows = document.querySelectorAll('#covProductionList .cov-production-row');
    const result = [];
    rows.forEach(row => {
        const orderDate = row.querySelector('.cov-prod-date').value || '';
        const item = row.querySelector('.cov-prod-item').value.trim();
        const priceRaw = (row.querySelector('.cov-prod-price').value || '').replace(/[^0-9.]/g, '');
        const qtyRaw = (row.querySelector('.cov-prod-qty').value || '').replace(/[^0-9]/g, '');
        const price = priceRaw ? parseFloat(priceRaw) : 0;
        const qty = qtyRaw ? parseInt(qtyRaw, 10) : 0;
        if (!orderDate && !item && !price && !qty) return;   // 전부 빈 행은 저장하지 않음
        result.push({ order_date: orderDate, item, unit_price_usd: price, qty });
    });
    return result;
}

function readClientOverseasForm() {
    return {
        companyName: document.getElementById('covCompanyName').value.trim(),
        bizType: document.getElementById('covBizType').value.trim(),
        items: document.getElementById('covItems').value.trim(),
        contactName: document.getElementById('covContactName').value.trim(),
        phone: document.getElementById('covPhone').value.trim(),
        email: document.getElementById('covEmail').value.trim(),
        location: document.getElementById('covLocation').value.trim(),
        productionHistory: readOverseasProductionHistory()
    };
}

async function addClientOverseas() {
    const form = readClientOverseasForm();
    if (!form.companyName) { showToast('회사명을 입력해주세요'); return; }
    const saved = await dbInsertClientOverseas(form);
    if (!saved) return;
    clientsOverseas.push(saved);
    clientsOverseas.sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));
    closeModal();
    renderClientsOverseas();
    showToast('해외 거래처가 추가되었습니다');
}

function openEditClientOverseas(id) {
    const c = clientsOverseas.find(x => x.id === id);
    if (!c) return;
    openClientOverseasModal(c);
}

async function saveEditClientOverseas(id) {
    const c = clientsOverseas.find(x => x.id === id);
    if (!c) return;
    const form = readClientOverseasForm();
    if (!form.companyName) { showToast('회사명을 입력해주세요'); return; }
    const ok = await dbUpdateClientOverseas(id, form);
    if (!ok) return;    // DB 실패 시 로컬 상태도 건드리지 않음 — 화면과 DB 불일치 방지
    Object.assign(c, form);
    clientsOverseas.sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));
    closeModal();
    renderClientsOverseas();
    showToast('해외 거래처가 수정되었습니다');
}

async function deleteClientOverseas(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await dbDeleteClientOverseas(id);
    const idx = clientsOverseas.findIndex(x => x.id === id);
    if (idx !== -1) clientsOverseas.splice(idx, 1);
    closeModal();
    renderClientsOverseas();
    showToast('해외 거래처가 삭제되었습니다');
}

// =====================================
// 마케팅 (업무 > 마케팅) — 캠페인 카드 + 배포 체크
// =====================================
function marketingLoginName() {
    if (!currentUser) return null;
    return currentUser.loginName || currentUser.name;
}
function marketingDisplayName(loginName) {
    return DISPLAY_NAME_MAP[loginName] || loginName;
}

function marketingFromDb(r) {
    return {
        id: r.id,
        title: r.title || '',
        content: r.content || '',
        channels: Array.isArray(r.channels) ? r.channels : [],
        deadline: r.deadline || '',
        memo: r.memo || '',
        imageUrl: r.image_url || '',
        distributions: (r.distributions && typeof r.distributions === 'object') ? r.distributions : {},
        createdBy: r.created_by || '',
        createdAt: r.created_at || ''
    };
}
function marketingToDb(c) {
    return {
        title: c.title,
        content: c.content || '',
        channels: Array.isArray(c.channels) ? c.channels : [],
        deadline: c.deadline || null,
        memo: c.memo || '',
        image_url: c.imageUrl || null,
        distributions: c.distributions || {},
        created_by: c.createdBy || ''
    };
}

async function loadMarketingCampaignsFromDb() {
    try {
        const { data, error } = await sb.from('marketing_campaigns')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        marketingCampaigns.length = 0;
        (data || []).forEach(r => marketingCampaigns.push(marketingFromDb(r)));
    } catch (err) {
        console.error('마케팅 로드 실패:', err.message);
        if (!/relation .* does not exist/i.test(err.message || '')) {
            showToast('마케팅 로드 실패: ' + err.message);
        }
    }
}

function filterMarketing() {
    if (!marketingSearch) return marketingCampaigns;
    const q = marketingSearch.toLowerCase();
    return marketingCampaigns.filter(c =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.content || '').toLowerCase().includes(q) ||
        (c.channels || []).some(ch => ch.toLowerCase().includes(q))
    );
}

function renderMarketing() {
    const grid = document.getElementById('marketingGrid');
    if (!grid) return;
    const list = filterMarketing();
    const stats = document.getElementById('marketingStats');
    if (stats) stats.textContent = `총 ${list.length.toLocaleString()}개 캠페인`;

    const esc = s => (s || '').toString().replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
    const me = marketingLoginName();

    if (list.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-tertiary)">등록된 마케팅 캠페인이 없습니다</div>`;
        return;
    }

    grid.innerHTML = list.map(c => {
        const chips = (c.channels || []).map(ch => `<span class="marketing-chip">${esc(ch)}</span>`).join('');
        const rows = MARKETING_DISTRIBUTORS.map(login => {
            const d = c.distributions[login] || {};
            const checked = !!d.done;
            const isMe = login === me;
            const doneAt = d.done_at ? new Date(d.done_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '';
            const display = marketingDisplayName(login);
            return `<label class="marketing-distrib-row ${isMe ? 'is-me' : ''} ${checked ? 'checked' : ''}">
                <input type="checkbox" ${checked ? 'checked' : ''} ${isMe ? '' : 'disabled'}
                    onchange="toggleMarketingDistribution(${c.id}, '${login}', this.checked)">
                <span class="marketing-distrib-name">${esc(display)}${isMe ? ' (나)' : ''}</span>
                ${checked && doneAt ? `<span class="marketing-distrib-done">${doneAt} 배포</span>` : ''}
            </label>`;
        }).join('');

        const contentId = `mktContent_${c.id}`;
        const deadlineHtml = c.deadline
            ? `<div class="marketing-deadline">📅 마감: ${esc(c.deadline)}</div>`
            : '';

        const imageHtml = c.imageUrl
            ? `<div class="marketing-card-image">
                <button class="marketing-image-download" onclick="event.stopPropagation();downloadMarketingImage(${c.id})" title="이미지 다운로드">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M12 5v14m0 0l-6-6m6 6l6-6M4 21h16"/></svg>
                    다운로드
                </button>
                <img src="${esc(c.imageUrl)}" alt="${esc(c.title)}" onclick="openMarketingImage('${esc(c.imageUrl)}')">
            </div>`
            : '';

        return `<div class="marketing-card">
            ${imageHtml}
            <div class="marketing-card-header">
                <div class="marketing-card-title">${esc(c.title)}</div>
                <button class="marketing-card-edit" onclick="openMarketingModal(${c.id})">✏️ 편집</button>
            </div>
            ${chips ? `<div class="marketing-channels">${chips}</div>` : ''}
            ${c.content ? `<div class="marketing-content" id="${contentId}">${esc(c.content)}</div>
                <div class="marketing-content-actions">
                    <button class="marketing-content-toggle" onclick="toggleMarketingContent('${contentId}', this)">전체 보기</button>
                    <button class="marketing-copy-btn" onclick="copyMarketingContent(${c.id})">📋 문구 복사</button>
                </div>` : ''}
            ${deadlineHtml}
            <div class="marketing-distrib">${rows}</div>
        </div>`;
    }).join('');
}

function toggleMarketingContent(id, btn) {
    const el = document.getElementById(id);
    if (!el) return;
    const open = el.classList.toggle('expanded');
    btn.textContent = open ? '접기' : '전체 보기';
}

function copyMarketingContent(campaignId) {
    const c = marketingCampaigns.find(x => x.id === campaignId);
    if (!c || !c.content) { showToast('복사할 문구가 없습니다'); return; }
    const text = c.content;
    const done = () => showToast('문구가 복사되었습니다');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => showToast('복사 실패 — 직접 복사해주세요'));
    } else {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            done();
        } catch (e) { showToast('복사 실패'); }
    }
}

async function toggleMarketingDistribution(campaignId, loginName, checked) {
    const me = marketingLoginName();
    if (loginName !== me) {
        showToast('본인 칸만 체크할 수 있습니다');
        renderMarketing();
        return;
    }
    const c = marketingCampaigns.find(x => x.id === campaignId);
    if (!c) return;
    const newDist = { ...c.distributions };
    if (checked) {
        newDist[loginName] = { done: true, done_at: new Date().toISOString() };
    } else {
        delete newDist[loginName];
    }
    // optimistic 업데이트
    c.distributions = newDist;
    renderMarketing();
    const { error } = await sb.from('marketing_campaigns')
        .update({ distributions: newDist })
        .eq('id', campaignId);
    if (error) {
        console.error(error);
        showToast('배포 체크 실패: ' + error.message);
        // 재로드로 복구
        await loadMarketingCampaignsFromDb();
        renderMarketing();
    }
}

function openMarketingModal(id) {
    const existing = id != null ? marketingCampaigns.find(x => x.id === id) : null;
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    title.textContent = existing ? '마케팅 편집' : '새 마케팅';
    const c = existing || { title: '', content: '', channels: [], deadline: '', memo: '', imageUrl: '' };
    const esc = s => (s || '').toString().replace(/"/g, '&quot;');
    const chipsHtml = MARKETING_CHANNEL_OPTIONS.map(opt => {
        const selected = (c.channels || []).includes(opt);
        return `<span class="chip ${selected ? 'selected' : ''}" data-channel="${esc(opt)}" onclick="toggleMarketingChannelChip(this)">${opt}</span>`;
    }).join('');

    const previewHtml = c.imageUrl
        ? `<img src="${esc(c.imageUrl)}" style="max-width:100%;max-height:240px;border-radius:10px;border:1px solid var(--gray-200);object-fit:contain;background:var(--gray-50)">`
        : `<div style="width:100%;height:120px;border:2px dashed var(--gray-300);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--gray-400);font-size:13px">이미지 없음</div>`;

    body.innerHTML = `
        <div class="form-row" style="grid-template-columns:1fr">
            <div class="form-group"><label class="form-label">제목 <span style="color:var(--red)">*</span></label>
                <input type="text" class="form-input" id="mktTitle" value="${esc(c.title)}" placeholder="예) 4월 특가 프로모션">
            </div>
        </div>
        <div class="form-row" style="grid-template-columns:1fr">
            <div class="form-group"><label class="form-label">이미지 (선택)</label>
                <input type="hidden" id="mktImage" value="${esc(c.imageUrl)}">
                <div id="mktImagePreview" style="margin-bottom:8px">${previewHtml}</div>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
                    <input type="file" id="mktImageFile" accept="image/*" style="display:none" onchange="handleMarketingImageUpload(event)">
                    <button type="button" class="btn-export" onclick="document.getElementById('mktImageFile').click()">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 19V5m0 0l-6 6m6-6l6 6M4 20h16"/></svg>
                        파일 업로드 (최대 4MB)
                    </button>
                    <button type="button" class="btn-export" onclick="clearMarketingImage()">삭제</button>
                </div>
                <div style="display:flex;gap:6px;align-items:center">
                    <input type="url" id="mktImageUrlInput" class="form-input" placeholder="또는 이미지 URL 붙여넣기 — https://..." value="${(c.imageUrl || '').startsWith('data:') ? '' : esc(c.imageUrl)}" style="flex:1">
                    <button type="button" class="btn-export" onclick="applyMarketingImageUrl()">URL 적용</button>
                </div>
                <div style="font-size:12px;color:var(--gray-500);margin-top:4px">파일 업로드와 URL 중 하나를 사용하세요.</div>
            </div>
        </div>
        <div class="form-row" style="grid-template-columns:1fr">
            <div class="form-group"><label class="form-label">마케팅 문구</label>
                <textarea class="form-input" id="mktContent" rows="14" style="min-height:280px;font-family:inherit;line-height:1.6;resize:vertical" placeholder="배포할 문구를 여기에 작성하세요&#10;&#10;여러 줄 작성이 가능합니다.">${esc(c.content)}</textarea>
            </div>
        </div>
        <div class="form-row" style="grid-template-columns:1fr">
            <div class="form-group"><label class="form-label">채널 (복수 선택)</label>
                <div class="marketing-channel-picker">${chipsHtml}</div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">마감일 (선택)</label>
                <input type="date" class="form-input" id="mktDeadline" value="${esc(c.deadline)}">
            </div>
            <div class="form-group"><label class="form-label">메모</label>
                <input type="text" class="form-input" id="mktMemo" value="${esc(c.memo)}" placeholder="추가 안내사항">
            </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
            ${existing ? `<button class="form-submit" style="flex:1;background:var(--red)" onclick="deleteMarketingCampaign(${c.id})">🗑️ 삭제</button>` : ''}
            <button class="form-submit" style="flex:2" onclick="${existing ? `saveMarketingCampaign(${c.id})` : 'addMarketingCampaign()'}">💾 ${existing ? '수정 저장' : '추가'}</button>
        </div>`;
    document.getElementById('modalOverlay').classList.add('show'); openModalHistory();
}

function handleMarketingImageUpload(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('이미지 파일만 업로드 가능합니다'); return; }
    if (file.size > 4 * 1024 * 1024) { showToast('4MB 이하 파일만 업로드 가능합니다'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        const hidden = document.getElementById('mktImage');
        if (hidden) hidden.value = dataUrl;
        const preview = document.getElementById('mktImagePreview');
        if (preview) preview.innerHTML = `<img src="${dataUrl}" style="max-width:100%;max-height:240px;border-radius:10px;border:1px solid var(--gray-200);object-fit:contain;background:var(--gray-50)">`;
    };
    reader.onerror = () => showToast('이미지 읽기 실패');
    reader.readAsDataURL(file);
}

function clearMarketingImage() {
    const hidden = document.getElementById('mktImage');
    if (hidden) hidden.value = '';
    const urlInput = document.getElementById('mktImageUrlInput');
    if (urlInput) urlInput.value = '';
    const preview = document.getElementById('mktImagePreview');
    if (preview) preview.innerHTML = `<div style="width:100%;height:120px;border:2px dashed var(--gray-300);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--gray-400);font-size:13px">이미지 없음</div>`;
}

function applyMarketingImageUrl() {
    const urlInput = document.getElementById('mktImageUrlInput');
    if (!urlInput) return;
    const url = (urlInput.value || '').trim();
    if (!url) { showToast('URL을 입력해주세요'); return; }
    if (!/^https?:\/\//i.test(url)) { showToast('http:// 또는 https:// 로 시작하는 URL만 사용 가능합니다'); return; }

    const preview = document.getElementById('mktImagePreview');
    const hidden = document.getElementById('mktImage');

    // 이미지 로드 테스트 후 반영
    const probe = new Image();
    probe.onload = () => {
        if (hidden) hidden.value = url;
        if (preview) preview.innerHTML = `<img src="${url.replace(/"/g, '&quot;')}" style="max-width:100%;max-height:240px;border-radius:10px;border:1px solid var(--gray-200);object-fit:contain;background:var(--gray-50)">`;
        showToast('이미지 URL이 적용되었습니다');
    };
    probe.onerror = () => showToast('이미지를 불러올 수 없는 URL입니다');
    probe.src = url;
}

function openMarketingImage(dataUrl) {
    // 전체화면 오버레이로 이미지 확대 보기
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<title>마케팅 이미지</title><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${dataUrl}" style="max-width:100%;max-height:100vh"></body>`);
}

function downloadMarketingImage(campaignId) {
    const c = marketingCampaigns.find(x => x.id === campaignId);
    if (!c || !c.imageUrl) { showToast('이미지가 없습니다'); return; }
    const url = c.imageUrl;
    const safe = (c.title || 'marketing').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'marketing';

    // data URL은 즉시 다운로드
    if (url.startsWith('data:')) {
        const extMatch = url.match(/^data:image\/([a-z0-9+]+)/i);
        const ext = extMatch ? extMatch[1].replace('jpeg', 'jpg') : 'png';
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safe}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('이미지가 다운로드되었습니다');
        return;
    }

    // 외부 URL — fetch + blob 으로 다운로드 (CORS 허용된 경우)
    fetch(url, { mode: 'cors' })
        .then(res => {
            if (!res.ok) throw new Error('fetch failed');
            return res.blob();
        })
        .then(blob => {
            const extMatch = blob.type && blob.type.match(/image\/([a-z0-9+]+)/i);
            let ext = extMatch ? extMatch[1].replace('jpeg', 'jpg') : null;
            if (!ext) {
                const urlExt = url.split('?')[0].match(/\.([a-z0-9]+)$/i);
                ext = urlExt ? urlExt[1].toLowerCase() : 'png';
            }
            const objUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objUrl;
            a.download = `${safe}.${ext}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
            showToast('이미지가 다운로드되었습니다');
        })
        .catch(() => {
            // CORS로 막힌 경우 — 새 탭에서 열기
            window.open(url, '_blank', 'noopener');
            showToast('새 탭에서 열었습니다 — 우클릭 후 "이미지 저장"으로 받아주세요');
        });
}

function toggleMarketingChannelChip(el) {
    el.classList.toggle('selected');
}

function readMarketingForm() {
    const title = document.getElementById('mktTitle').value.trim();
    const content = document.getElementById('mktContent').value.trim();
    const deadline = document.getElementById('mktDeadline').value;
    const memo = document.getElementById('mktMemo').value.trim();
    const imageUrl = (document.getElementById('mktImage').value || '').trim();
    const chips = document.querySelectorAll('.marketing-channel-picker .chip.selected');
    const channels = Array.from(chips).map(el => el.dataset.channel);
    return { title, content, channels, deadline, memo, imageUrl };
}

async function addMarketingCampaign() {
    const form = readMarketingForm();
    if (!form.title) { showToast('제목을 입력해주세요'); return; }
    const payload = marketingToDb({ ...form, distributions: {}, createdBy: marketingLoginName() || '' });
    const { data, error } = await sb.from('marketing_campaigns').insert(payload).select().single();
    if (error) { console.error(error); showToast('저장 실패: ' + error.message); return; }
    marketingCampaigns.unshift(marketingFromDb(data));
    closeModal();
    renderMarketing();
    showToast('마케팅 캠페인이 추가되었습니다');
}

async function saveMarketingCampaign(id) {
    const form = readMarketingForm();
    if (!form.title) { showToast('제목을 입력해주세요'); return; }
    const c = marketingCampaigns.find(x => x.id === id);
    if (!c) return;
    const patch = {
        title: form.title,
        content: form.content,
        channels: form.channels,
        deadline: form.deadline || null,
        memo: form.memo,
        image_url: form.imageUrl || null
    };
    const { error } = await sb.from('marketing_campaigns').update(patch).eq('id', id);
    if (error) { console.error(error); showToast('수정 실패: ' + error.message); return; }
    Object.assign(c, form);
    closeModal();
    renderMarketing();
    showToast('수정되었습니다');
}

async function deleteMarketingCampaign(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const { error } = await sb.from('marketing_campaigns').delete().eq('id', id);
    if (error) { console.error(error); showToast('삭제 실패: ' + error.message); return; }
    const idx = marketingCampaigns.findIndex(x => x.id === id);
    if (idx !== -1) marketingCampaigns.splice(idx, 1);
    closeModal();
    renderMarketing();
    showToast('삭제되었습니다');
}

// 엑셀 가져오기 (거래처등록 시트 기준)
async function importClientsFromExcel(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const confirmMsg = `${file.name} 을 가져옵니다.\n\n기존 DB에 추가 병합됩니다. (회사명 + 사업자등록번호 동일 시 중복 건너뜀)\n진행할까요?`;
    if (!confirm(confirmMsg)) { event.target.value = ''; return; }

    showToast('엑셀 파일 읽는 중...');
    try {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array' });
        const sheetName = wb.SheetNames.includes('거래처등록') ? '거래처등록' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // 헤더 행 찾기 (회사명, 대표자 등이 포함된 행)
        let headerRow = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const r = rows[i].map(x => (x || '').toString());
            if (r.includes('회사명') && r.includes('대표자')) { headerRow = i; break; }
        }
        if (headerRow === -1) { showToast('헤더(회사명/대표자)를 찾을 수 없습니다'); event.target.value = ''; return; }

        const headers = rows[headerRow].map(x => (x || '').toString().trim());
        const colIdx = {
            businessNo: headers.indexOf('사업자등록번호'),
            companyName: headers.indexOf('회사명'),
            ceo: headers.indexOf('대표자'),
            phone: headers.indexOf('전화'),
            fax: headers.indexOf('팩스'),
            mobile: headers.indexOf('핸드폰'),
            email: headers.indexOf('이메일'),
            zipcode: headers.indexOf('우편번호'),
            address: headers.indexOf('주소'),
            bizType: headers.indexOf('업태'),
            bizItem: headers.indexOf('업종'),
            staffName: headers.indexOf('담당직원'),
            staffMobile: headers.indexOf('담당직원 핸드폰'),
            staffEmail: headers.indexOf('담당직원 이메일'),
            grade: headers.indexOf('등급'),
            category: headers.indexOf('구분')
        };

        const dataRows = rows.slice(headerRow + 1);
        const toInsert = [];
        const existingKeys = new Set(clients.map(c => `${c.companyName}|${c.businessNo}`));

        dataRows.forEach(r => {
            const get = (k) => colIdx[k] >= 0 ? (r[colIdx[k]] || '').toString().trim() : '';
            const companyName = get('companyName');
            if (!companyName) return;
            const businessNo = get('businessNo');
            const key = `${companyName}|${businessNo}`;
            if (existingKeys.has(key)) return;
            existingKeys.add(key);
            toInsert.push(clientToDb({
                companyName, businessNo,
                ceo: get('ceo'), phone: get('phone'), fax: get('fax'),
                mobile: get('mobile'), email: get('email'),
                zipcode: get('zipcode'), address: get('address'),
                bizType: get('bizType'), bizItem: get('bizItem'),
                staffName: get('staffName'), staffMobile: get('staffMobile'), staffEmail: get('staffEmail'),
                grade: get('grade'), category: get('category')
            }));
        });

        if (toInsert.length === 0) {
            showToast('추가할 신규 고객사가 없습니다');
            event.target.value = '';
            return;
        }

        showToast(`${toInsert.length}건 업로드 중... (0/${toInsert.length})`);

        // 500건씩 배치 insert
        const batchSize = 500;
        let inserted = 0;
        for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            const { data, error } = await sb.from('clients').insert(batch).select();
            if (error) {
                console.error(error);
                showToast(`업로드 실패 (${inserted}건 저장됨): ` + error.message);
                break;
            }
            (data || []).forEach(r => clients.push(clientFromDb(r)));
            inserted += batch.length;
            showToast(`업로드 중... (${inserted}/${toInsert.length})`);
        }

        clients.sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));
        clientPage = 1;
        renderClients();
        showToast(`${inserted}건 업로드 완료`);
    } catch (err) {
        console.error(err);
        showToast('엑셀 가져오기 실패: ' + err.message);
    } finally {
        event.target.value = '';
    }
}

async function addDailyTask() {
    const task = document.getElementById('newTaskName').value.trim();
    if (!task) { showToast('할 일을 입력해주세요'); return; }
    const saved = await dbInsertTask({
        task,
        date: document.getElementById('newTaskDate').value,
        assignee: document.getElementById('newTaskAssignee').value,
        deadline: document.getElementById('newTaskDeadline').value || '',
        target: '',
        priority: document.getElementById('newTaskPriority').value,
        done: false
    });
    if (!saved) return;
    dailyTasks.push(saved);
    closeModal(); renderDaily(); renderHome();
    showToast('할 일이 추가되었습니다');
}

async function addDelivery() {
    const recipient = document.getElementById('newDelRecipient').value.trim();
    if (!recipient) { showToast('받는이를 입력해주세요'); return; }
    const typeSelect = document.getElementById('newDelType').value;
    const typeCustom = document.getElementById('newDelTypeCustom').value.trim();
    const type = typeSelect === '__custom' ? (typeCustom || '기타') : typeSelect;
    const senderSelect = document.getElementById('newDelSender').value;
    const senderCustom = document.getElementById('newDelSenderCustom').value.trim();
    const sender = senderSelect === '__custom' ? (senderCustom || '기타') : senderSelect;
    const saved = await dbInsertDelivery({
        recipient,
        date: document.getElementById('newDelDate').value || fmtDate(new Date()),
        type,
        sender,
        zipcode: document.getElementById('newDelZipcode').value.trim(),
        address: document.getElementById('newDelAddress').value.trim(),
        phone: document.getElementById('newDelPhone').value.trim(),
        payment: document.getElementById('newDelPayment').value,
        product: document.getElementById('newDelProduct').value.trim(),
        tracking: "",
        memo: document.getElementById('newDelMemo').value.trim(),
        price: parseInt(document.getElementById('newDelPrice').value) || 0,
        rating: "", seller: "1",
        author: currentUser ? currentUser.name : '-'
    });
    if (!saved) return;
    deliveries.unshift(saved);
    closeModal(); renderDeliveries(); renderHome();
    showToast('택배가 추가되었습니다');
}

// =====================================
// UTILITIES
// =====================================
function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDisplay(s) {
    if (!s) return '';
    const p = s.split('-');
    return `${parseInt(p[1])}/${parseInt(p[2])}`;
}

function formatPhoneInput(e) {
    const input = e.target;
    const digits = input.value.replace(/\D/g, '');
    let formatted = '';
    const isSafety = digits.startsWith('0502') || digits.startsWith('0508');
    const isSeoul  = digits.startsWith('02') && !isSafety;
    const isMobile = /^01[0-9]/.test(digits);

    if (isSafety) {
        // 안심번호 4-4-4
        if (digits.length <= 4) formatted = digits;
        else if (digits.length <= 8) formatted = digits.slice(0, 4) + '-' + digits.slice(4);
        else formatted = digits.slice(0, 4) + '-' + digits.slice(4, 8) + '-' + digits.slice(8, 12);
    } else if (isSeoul) {
        // 서울 02: 2-3-4 (9자리) / 2-4-4 (10자리)
        if (digits.length <= 2) formatted = digits;
        else if (digits.length <= 5) formatted = digits.slice(0, 2) + '-' + digits.slice(2);
        else if (digits.length <= 9) formatted = digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5, 9);
        else formatted = digits.slice(0, 2) + '-' + digits.slice(2, 6) + '-' + digits.slice(6, 10);
    } else if (isMobile) {
        // 휴대폰 010/011~: 3-4-4 (11자리)
        if (digits.length <= 3) formatted = digits;
        else if (digits.length <= 7) formatted = digits.slice(0, 3) + '-' + digits.slice(3);
        else formatted = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
    } else {
        // 지역번호 3자리 (031/032/033/041/042/043/044/051/.../070/0303): 3-3-4 (10자리) / 3-4-4 (11자리)
        if (digits.length <= 3) formatted = digits;
        else if (digits.length <= 6) formatted = digits.slice(0, 3) + '-' + digits.slice(3);
        else if (digits.length <= 10) formatted = digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6, 10);
        else formatted = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
    }
    input.value = formatted;
}

function empty(text) {
    return `<div class="empty-state"><div class="empty-text">${text}</div></div>`;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

function statusBadgeClass(s) {
    if (s === '진행 중') return 'badge-blue';
    if (s === '완료') return 'badge-green';
    return 'badge-gray';
}

function typeBadgeClass(t) {
    const map = { '일반': 'badge-blue', '번개': 'badge-red', '중고': 'badge-yellow', '당근': 'badge-orange', 'GS반택': 'badge-purple', 'ETSY': 'badge-gray' };
    return map[t] || 'badge-gray';
}

function categoryBadgeClass(c) {
    const map = { '국내 주문': 'badge-blue', '해외 주문': 'badge-purple', '자체 브랜드': 'badge-green', 'IP 콜라보': 'badge-orange', '유튜브': 'badge-red', '기타': 'badge-gray' };
    return map[c] || 'badge-gray';
}

// ===== Delivery Checkbox & Export =====
function toggleAllDeliveryCheck(checked) {
    document.querySelectorAll('.delivery-check').forEach(cb => {
        const id = Number(cb.dataset.id);
        const d = deliveries.find(x => x.id === id);
        if (d) d._checked = checked;
        cb.checked = checked;
    });
}

function exportLozen() {
    const selected = deliveries.filter(d => d._checked);
    if (selected.length === 0) {
        showToast('내보낼 택배를 체크해주세요');
        return;
    }

    const header = ['수화주', '우편번호', '주소', '전화번호', '휴대폰번호', '택배수량', '택배금액', '선/착불', '상품명', '상품옵션', '비고'];
    const rows = selected.map(d => [
        d.recipient,        // 수화주
        d.zipcode,          // 우편번호
        d.address,          // 주소
        '',                 // 전화번호 (빈칸)
        d.phone,            // 휴대폰번호
        1,                  // 택배수량 고정
        2750,               // 택배금액 고정
        d.payment,          // 선/착불
        d.product,          // 상품명
        '',                 // 상품옵션
        d.memo              // 비고
    ]);

    const wsData = [header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 열 너비 설정
    ws['!cols'] = [
        { wch: 12 }, { wch: 8 }, { wch: 40 }, { wch: 15 }, { wch: 15 },
        { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 20 }, { wch: 15 }, { wch: 20 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '택배주소');

    const today = new Date();
    const fname = `로젠택배_${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}.xlsx`;
    XLSX.writeFile(wb, fname);

    // 체크 해제
    selected.forEach(d => d._checked = false);
    renderDeliveries();
    const checkAll = document.getElementById('deliveryCheckAll');
    if (checkAll) checkAll.checked = false;

    showToast(`${selected.length}건 엑셀 내보내기 완료`);
}

// 체크박스 클릭 시 상태 저장
document.addEventListener('change', (e) => {
    if (e.target.classList.contains('delivery-check')) {
        const id = Number(e.target.dataset.id);
        const d = deliveries.find(x => x.id === id);
        if (d) d._checked = e.target.checked;
    }
});

// ===== Inline Cell Editing (double-click) =====
document.addEventListener('dblclick', (e) => {
    const cell = e.target.closest('.cell-editable');
    if (!cell || cell.querySelector('.cell-edit-input, .cell-edit-select')) return;

    // 행 클릭(모달) 타이머 취소
    if (_clientRowClickTimer) { clearTimeout(_clientRowClickTimer); _clientRowClickTimer = null; }

    const id = Number(cell.dataset.id);
    const field = cell.dataset.field;
    const type = cell.dataset.type || 'text';
    const entity = cell.dataset.entity || 'delivery';

    let row, dbUpdate, rerender;
    const tempFieldMap = { item: 'item', unitPrice: 'unit_price', unitPriceVat: 'unit_price_vat', supplierUnitPrice: 'supplier_unit_price', supplierUnitPriceVat: 'supplier_unit_price_vat', qty: 'qty', supplier: 'supplier', supplierContact: 'supplier_contact', date: 'date', client: 'client', clientContact: 'client_contact', revenue: 'revenue', supplierRevenue: 'supplier_revenue', printMethod: 'print_method', printFee: 'print_fee', printFeeApply: 'print_fee_apply', printFeeVat: 'print_fee_vat', packMethod: 'pack_method', packagingFee: 'packaging_fee', packagingFeeApply: 'packaging_fee_apply', packagingFeeVat: 'packaging_fee_vat', labelFee: 'label_fee', labelFeeVat: 'label_fee_vat', shippingBoxes: 'shipping_boxes', shippingFee: 'shipping_fee', shippingFeeVat: 'shipping_fee_vat' };
    if (entity === 'temp') {
        row = tempProjects.find(x => x.id === id);
        dbUpdate = (patch) => {
            const dbPatch = {};
            for (const [k, v] of Object.entries(patch)) dbPatch[tempFieldMap[k] || k] = v;
            return sb.from('projects_temp').update(dbPatch).eq('id', id);
        };
        rerender = renderTempProjects;
    } else if (entity === 'client') {
        row = clients.find(x => x.id === id);
        dbUpdate = (patch) => dbUpdateClient(id, patch);
        rerender = renderClients;
    } else {
        row = deliveries.find(x => x.id === id);
        dbUpdate = (patch) => dbUpdateDelivery(id, patch);
        rerender = renderDeliveries;
    }
    if (!row) return;

    const currentVal = row[field] ?? '';
    const originalHtml = cell.innerHTML;

    if (type === 'select') {
        const options = cell.dataset.options.split(',');
        const select = document.createElement('select');
        select.className = 'cell-edit-select';
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt || '-';
            if (opt === currentVal) o.selected = true;
            select.appendChild(o);
        });
        cell.innerHTML = '';
        cell.appendChild(select);
        select.focus();
        select.addEventListener('click', ev => ev.stopPropagation());

        const save = async () => {
            row[field] = select.value;
            await dbUpdate({ [field]: select.value });
            rerender();
            showToast('수정되었습니다');
        };
        select.addEventListener('change', save);
        select.addEventListener('blur', save);
    } else if (type === 'date') {
        const input = document.createElement('input');
        input.type = 'date';
        input.className = 'cell-edit-input';
        input.value = currentVal;
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.addEventListener('click', ev => ev.stopPropagation());

        const save = async () => {
            if (input.value) {
                row[field] = input.value;
                await dbUpdate({ [field]: input.value });
            }
            rerender();
            showToast('수정되었습니다');
        };
        input.addEventListener('change', save);
        input.addEventListener('blur', save);
    } else {
        const input = document.createElement('input');
        input.type = type === 'number' ? 'number' : 'text';
        input.className = 'cell-edit-input';
        input.value = type === 'number' ? (currentVal || '') : (currentVal === '-' ? '' : currentVal);
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.select();
        input.addEventListener('click', ev => ev.stopPropagation());

        const save = async () => {
            if (type === 'number') {
                row[field] = parseInt(input.value) || 0;
            } else {
                row[field] = input.value.trim();
            }
            const patch = { [field]: row[field] };
            // temp entity: 단가·수량 변경 시 매출액/매입액 재계산
            if (entity === 'temp' && ['unitPrice', 'supplierUnitPrice', 'qty'].includes(field)) {
                row.revenue = calcTempGroupRevenue(row);
                row.supplierRevenue = calcTempGroupSupRevenue(row);
                patch.revenue = row.revenue;
                patch.supplierRevenue = row.supplierRevenue;
            }
            await dbUpdate(patch);
            rerender();
            showToast('수정되었습니다');
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); save(); }
            if (ev.key === 'Escape') { cell.innerHTML = originalHtml; }
        });
    }
});

function ratingBadgeClass(r) {
    if (r.includes('A')) return 'badge-blue';
    if (r.includes('B')) return 'badge-green';
    if (r.includes('C')) return 'badge-yellow';
    if (r.includes('X')) return 'badge-red';
    return 'badge-gray';
}

// =====================================
// 상품 DB (제안서 시스템 파트 2)
// =====================================
// 상품 카테고리 — Supabase product_categories 테이블에서 로드. DB 미적용 시 아래 기본값 사용.
let PRODUCT_CATEGORIES = ['시계', '생활용품', '사무용품', '상패,트로피', '기타'];
async function loadProductCategoriesFromDb() {
    try {
        const { data, error } = await sb.from('product_categories')
            .select('name')
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true });
        if (error) throw error;
        if (Array.isArray(data) && data.length > 0) {
            PRODUCT_CATEGORIES = data.map(r => r.name);
        }
    } catch (err) {
        console.warn('카테고리 로드 실패(기본값 사용):', err.message);
    }
    try { renderProductCategoryChips(); } catch (e) {}
}
function renderProductCategoryChips() {
    const wrap = document.getElementById('productCategoryFilter');
    if (!wrap) return;
    const escAttr = s => String(s || '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
    const chips = ['all', ...PRODUCT_CATEGORIES];
    wrap.innerHTML = chips.map((cat) => {
        const label = cat === 'all' ? '전체' : cat;
        const isActive = (currentProductCategory || 'all') === cat;
        return `<button class="filter-chip${isActive ? ' active' : ''}" data-pcat="${escAttr(cat)}">${escAttr(label)}</button>`;
    }).join('') + `<button class="filter-chip" id="productCategoryAddBtn" style="border-style:dashed;color:var(--gray-600)" title="카테고리 추가">+ 카테고리</button>`;
    // 인라인 onclick 대신 이벤트 바인딩(따옴표 포함 카테고리명도 안전)
    wrap.querySelectorAll('[data-pcat]').forEach(btn => {
        btn.addEventListener('click', () => setProductCategory(btn.dataset.pcat));
    });
    const addBtn = wrap.querySelector('#productCategoryAddBtn');
    if (addBtn) addBtn.addEventListener('click', promptNewProductCategory);
}
function setProductCategory(cat) {
    currentProductCategory = cat;
    renderProductCategoryChips();
    renderProductDB();
}
async function promptNewProductCategory() {
    const name = (prompt('새 카테고리명을 입력하세요') || '').trim();
    if (!name) return;
    if (PRODUCT_CATEGORIES.includes(name)) { showToast('이미 존재하는 카테고리입니다'); return; }
    const { error } = await sb.from('product_categories').insert({ name, sort_order: 100 });
    if (error) {
        if (/relation .* does not exist/i.test(error.message || '')) {
            // 테이블이 아직 없으면 메모리에만 추가 (이번 세션 한정)
            PRODUCT_CATEGORIES.push(name);
            renderProductCategoryChips();
            showToast('카테고리 추가됨 (DB 미적용 — product_categories.sql 실행 필요)');
            return;
        }
        showToast('카테고리 추가 실패: ' + (error.message || ''));
        return;
    }
    PRODUCT_CATEGORIES.push(name);
    renderProductCategoryChips();
    showToast('카테고리가 추가되었습니다');
}
const PRINT_TYPES = ['불가', '레이저각인', '실크인쇄', '패드인쇄', '기타'];
const PACKAGING_TYPES = ['기본박스', '선물포장', '전용케이스', '전용보관함', '기타'];
const PRODUCT_STATUSES = ['판매 중', '품절', '단종'];

function productStatusBadge(s) {
    if (s === '판매 중') return 'badge-green';
    if (s === '품절') return 'badge-gray';
    if (s === '단종') return 'badge-red';
    return 'badge-gray';
}

function formatKRW(n) {
    return (n || 0).toLocaleString() + '원';
}

function productThumb(p) {
    if (p.image) {
        return `<img src="${p.image}" alt="${p.name}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid var(--gray-200)">`;
    }
    return `<div style="width:44px;height:44px;border-radius:8px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;color:var(--gray-400)"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>`;
}

// ===== 상품 DB Supabase 연동 =====
// 멀티-옵션 구조:
//   prints     : [{ type, fee, feeApply }, ...]
//   packagings : [{ type, fee, feeApply }, ...]
//   labels     : [{ note, fee, feeApply }, ...]
// 기본 옵션이 없는 상품은 빈 배열. 추가 버튼으로 0..N개 등록.
function _normPrintRow(o) {
    return {
        type: (o && o.type) || '레이저각인',
        customType: (o && o.customType) || '',     // type === '기타' 일 때 사용자가 직접 입력한 값
        fee: Number(o && o.fee) || 0,
        feeApply: (o && o.feeApply) || '1개당',
    };
}
function _normPackRow(o) {
    return {
        type: (o && o.type) || '선물포장',
        customType: (o && o.customType) || '',
        fee: Number(o && o.fee) || 0,
        feeApply: (o && o.feeApply) || '1개당',
    };
}
// 표시용: type 이 '기타' 이면 customType, 아니면 type 그대로
function _optDisplayType(o) {
    if (!o) return '-';
    if (o.type === '기타' && o.customType) return o.customType;
    return o.type || '-';
}
function _normLabelRow(o) {
    return {
        note: (o && o.note) || '',
        fee: Number(o && o.fee) || 0,
        feeApply: (o && o.feeApply) || '1개당',
    };
}
// 수량별 단가 한 행: { minQty, maxQty, price } — maxQty === 0 이면 '이상'
function _normBulkPriceRow(o) {
    return {
        minQty: Number(o && o.minQty) || 0,
        maxQty: Number(o && o.maxQty) || 0,
        price: Number(o && o.price) || 0,
    };
}
function productFromDb(r) {
    return {
        id: r.id,
        name: r.name || '',
        description: r.description || '',
        category: r.category || '기타',
        image: r.image || '',
        unitPrice: r.unit_price || 0,
        vatIncluded: r.vat_included !== false,
        prints: Array.isArray(r.prints) ? r.prints.map(_normPrintRow) : [],
        packagings: Array.isArray(r.packagings) ? r.packagings.map(_normPackRow) : [],
        labels: Array.isArray(r.labels) ? r.labels.map(_normLabelRow) : [],
        bulkPrices: Array.isArray(r.bulk_prices) ? r.bulk_prices.map(_normBulkPriceRow) : [],
        status: r.status || '판매 중',
        createdAt: r.created_at || new Date().toISOString(),
    };
}
function productToDb(p) {
    const prints = (p.prints || []).map(_normPrintRow);
    const packagings = (p.packagings || []).map(_normPackRow);
    const labels = (p.labels || []).map(_normLabelRow);
    const bulk_prices = (p.bulkPrices || []).map(_normBulkPriceRow);
    return {
        name: p.name || '',
        description: p.description || '',
        category: p.category || '기타',
        image: p.image || '',
        unit_price: Number(p.unitPrice) || 0,
        vat_included: !!p.vatIncluded,
        prints, packagings, labels, bulk_prices,
        // 레거시 단일 컬럼도 첫 항목 기준으로 함께 채워 하위 호환 유지
        print_type: prints[0] ? prints[0].type : '불가',
        print_fee: prints[0] ? prints[0].fee : 0,
        print_fee_apply: prints[0] ? prints[0].feeApply : '1개당',
        packaging_type: packagings[0] ? packagings[0].type : '',
        packaging_fee: packagings[0] ? packagings[0].fee : 0,
        packaging_fee_apply: packagings[0] ? packagings[0].feeApply : '1개당',
        label_available: labels.length > 0,
        label_fee: labels[0] ? labels[0].fee : 0,
        label_fee_apply: labels[0] ? labels[0].feeApply : '1개당',
        status: p.status || '판매 중',
    };
}
async function loadProductsFromDb() {
    try {
        const { data, error } = await sb.from('products')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        productsDB.length = 0;
        (data || []).forEach(r => productsDB.push(productFromDb(r)));
    } catch (err) {
        console.error('상품 DB 로드 실패:', err.message);
        if (!/relation .* does not exist/i.test(err.message || '')) {
            showToast('상품 DB 로드 실패: ' + err.message);
        }
    }
}
// '컬럼이 없다' / '스키마 캐시에 컬럼이 없다' 류 에러를 감지해 새 jsonb 컬럼을 빼고 재시도.
function _isMissingNewColumnError(err) {
    if (!err) return false;
    const msg = (err.message || '') + ' ' + (err.hint || '') + ' ' + (err.details || '');
    if (/column .* (prints|packagings|labels|bulk_prices)/i.test(msg)) return true;
    if (/Could not find the .* column/i.test(msg)) return true;
    if (/schema cache/i.test(msg) && /(prints|packagings|labels|bulk_prices)/i.test(msg)) return true;
    return false;
}
function _stripNewColumns(row) {
    const c = { ...row };
    delete c.prints;
    delete c.packagings;
    delete c.labels;
    delete c.bulk_prices;
    return c;
}
async function dbInsertProduct(p) {
    const payload = productToDb(p);
    let { data, error } = await sb.from('products').insert(payload).select().single();
    if (error && _isMissingNewColumnError(error)) {
        console.warn('products 테이블에 prints/packagings/labels 컬럼이 없어 레거시 컬럼만으로 재시도합니다. products.sql 을 다시 실행해주세요.');
        ({ data, error } = await sb.from('products').insert(_stripNewColumns(payload)).select().single());
    }
    if (error) {
        console.error('상품 저장 실패:', error);
        showToast('상품 저장 실패: ' + (error.message || '') + (error.hint ? ' — ' + error.hint : ''));
        return null;
    }
    return productFromDb(data);
}
async function dbUpdateProduct(id, patch) {
    const payload = productToDb(patch);
    let { data, error } = await sb.from('products').update(payload).eq('id', id).select().single();
    if (error && _isMissingNewColumnError(error)) {
        console.warn('products 테이블에 prints/packagings/labels 컬럼이 없어 레거시 컬럼만으로 재시도합니다. products.sql 을 다시 실행해주세요.');
        ({ data, error } = await sb.from('products').update(_stripNewColumns(payload)).eq('id', id).select().single());
    }
    if (error) {
        console.error('상품 수정 실패:', error);
        showToast('상품 수정 실패: ' + (error.message || '') + (error.hint ? ' — ' + error.hint : ''));
        return null;
    }
    return productFromDb(data);
}
async function dbDeleteProduct(id) {
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) { console.error(error); showToast('상품 삭제 실패: ' + error.message); return false; }
    return true;
}

// ===== 제안서 Supabase 연동 =====
function proposalFromDb(r) {
    return {
        id: r.id,
        title: r.title || '',
        clientName: r.client_name || '',
        clientContact: r.client_contact || '',
        clientPhone: r.client_phone || '',
        clientEmail: r.client_email || '',
        description: r.description || '',
        validUntil: r.valid_until || '',
        assignee: r.assignee || '',
        assigneePhone: r.assignee_phone || '',
        assigneeEmail: r.assignee_email || '',
        status: r.status || '작성 중',
        items: Array.isArray(r.items) ? r.items : [],
        totalAmount: r.total_amount || 0,
        sentDate: r.sent_date || '',
        shareLink: r.share_link || '',
        createdAt: r.created_at || new Date().toISOString(),
    };
}
function proposalToDb(p) {
    return {
        title: p.title || '',
        client_name: p.clientName || '',
        client_contact: p.clientContact || '',
        client_phone: p.clientPhone || '',
        client_email: p.clientEmail || '',
        description: p.description || '',
        valid_until: p.validUntil || null,           // 빈 문자열 → null (date 컬럼)
        assignee: p.assignee || '',
        assignee_phone: p.assigneePhone || '',
        assignee_email: p.assigneeEmail || '',
        status: p.status || '작성 중',
        items: Array.isArray(p.items) ? p.items : [],
        total_amount: Number(p.totalAmount) || 0,
        sent_date: p.sentDate || null,
        share_link: p.shareLink || '',
    };
}
async function loadProposalsFromDb() {
    try {
        const { data, error } = await sb.from('proposals')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        proposals.length = 0;
        (data || []).forEach(r => proposals.push(proposalFromDb(r)));
    } catch (err) {
        console.error('제안서 로드 실패:', err.message);
        if (!/relation .* does not exist/i.test(err.message || '')) {
            showToast('제안서 로드 실패: ' + err.message);
        }
    }
}
async function dbInsertProposal(p) {
    const { data, error } = await sb.from('proposals').insert(proposalToDb(p)).select().single();
    if (error) { console.error(error); showToast('제안서 저장 실패: ' + error.message); return null; }
    return proposalFromDb(data);
}
async function dbUpdateProposal(id, patch) {
    const { data, error } = await sb.from('proposals').update(proposalToDb(patch)).eq('id', id).select().single();
    if (error) { console.error(error); showToast('제안서 수정 실패: ' + error.message); return null; }
    return proposalFromDb(data);
}
async function dbDeleteProposal(id) {
    const { error } = await sb.from('proposals').delete().eq('id', id);
    if (error) { console.error(error); showToast('제안서 삭제 실패: ' + error.message); return false; }
    return true;
}

function renderProductDB() {
    // 요약 카드
    document.getElementById('pdbTotal').textContent = productsDB.length;
    document.getElementById('pdbActive').textContent = productsDB.filter(p => p.status === '판매 중').length;
    document.getElementById('pdbInactive').textContent = productsDB.filter(p => p.status === '품절' || p.status === '단종').length;

    // 필터링
    let filtered = productsDB;
    if (currentProductCategory !== 'all') {
        filtered = filtered.filter(p => p.category === currentProductCategory);
    }
    if (currentProductSearch) {
        const q = currentProductSearch;
        filtered = filtered.filter(p =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q)
        );
    }

    let tableHtml = '';
    let cardHtml = '';
    const feeUnit = apply => apply === '일괄' ? '일괄' : '개당';
    // 옵션 배열 → 셀 (여러 개 항목을 줄바꿈으로 표시, 없으면 '-')
    const printsCell = (arr) => {
        if (!arr || !arr.length) return `<span style="color:var(--gray-400);font-weight:600">-</span>`;
        return arr.map(o => {
            const fee = o.fee ? `<div style="font-size:11px;color:var(--gray-500);margin-top:2px">₩${(o.fee||0).toLocaleString()} ${feeUnit(o.feeApply)}</div>` : '';
            return `<div style="margin-bottom:4px"><span class="badge" style="background:#FAECE7;color:#712B13;font-weight:700">${_optDisplayType(o)}</span>${fee}</div>`;
        }).join('');
    };
    const packsCell = (arr) => {
        if (!arr || !arr.length) return `<span style="color:var(--gray-400)">-</span>`;
        return arr.map(o => {
            const fee = o.fee ? `<div style="font-size:11px;color:var(--gray-500);margin-top:2px">₩${(o.fee||0).toLocaleString()} ${feeUnit(o.feeApply)}</div>` : '';
            return `<div style="margin-bottom:4px"><span class="badge badge-green">${_optDisplayType(o)}</span>${fee}</div>`;
        }).join('');
    };
    const labelsCell = (arr) => {
        if (!arr || !arr.length) return `<span class="badge badge-red">불가</span>`;
        return arr.map(o => {
            const fee = o.fee ? `<div style="font-size:11px;color:var(--gray-500);margin-top:2px">₩${(o.fee||0).toLocaleString()} ${feeUnit(o.feeApply)}</div>` : '';
            const note = o.note ? ` ${o.note}` : '';
            return `<div style="margin-bottom:4px"><span class="badge badge-green">가능${note}</span>${fee}</div>`;
        }).join('');
    };
    const summaryRow = (label, arr, joiner) => {
        if (!arr || !arr.length) return `<div class="resp-card-row">${label}: -</div>`;
        const txt = arr.map(o => {
            // 라벨은 note 가 자유텍스트, 인쇄/포장은 type(+customType)
            const main = (o.note != null && !o.type) ? (o.note || '부착') : _optDisplayType(o);
            const fee = o.fee ? ` ₩${(o.fee||0).toLocaleString()} ${feeUnit(o.feeApply)}` : '';
            return `${main}${fee}`;
        }).join(' / ');
        return `<div class="resp-card-row">${label}: ${txt}</div>`;
    };
    filtered.forEach(p => {
        const priceStr = `${formatKRW(p.unitPrice)} <span style="font-size:11px;color:var(--gray-500)">(${p.vatIncluded ? 'VAT 포함' : 'VAT 별도'})</span>`;
        const prints = p.prints || [];
        const packs = p.packagings || [];
        const labels = p.labels || [];

        tableHtml += `<tr onclick="openProductDBModal(${p.id})" style="cursor:pointer">
            <td>${productThumb(p)}</td>
            <td>
                <div style="font-weight:700;color:var(--gray-900)">${p.name}</div>
                <div style="font-size:12px;color:var(--gray-500);font-weight:500;margin-top:2px">${p.description || ''}</div>
            </td>
            <td><span class="badge badge-gray">${p.category}</span></td>
            <td style="font-weight:700">${priceStr}</td>
            <td>${printsCell(prints)}</td>
            <td>${packsCell(packs)}</td>
            <td>${labelsCell(labels)}</td>
            <td><span class="badge ${productStatusBadge(p.status)}">${p.status}</span></td>
            <td onclick="event.stopPropagation()" style="cursor:default">
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                    <button class="edit-btn" style="font-size:11px;padding:5px 8px" onclick="duplicateProduct(${p.id})" title="복제">📋 복제</button>
                    <button class="form-delete-btn" style="font-size:11px;padding:5px 8px" onclick="deleteProduct(${p.id})" title="삭제">🗑️ 삭제</button>
                </div>
            </td>
        </tr>`;

        cardHtml += `<div class="resp-card" onclick="openProductDBModal(${p.id})">
            <div class="resp-card-top">
                <div style="display:flex;gap:12px;align-items:center">
                    ${productThumb(p)}
                    <div>
                        <div class="resp-card-title">${p.name}</div>
                        <div style="font-size:12px;color:var(--gray-500)">${p.description || ''}</div>
                    </div>
                </div>
                <span class="badge ${productStatusBadge(p.status)}">${p.status}</span>
            </div>
            <div class="resp-card-meta">
                <div class="resp-card-row"><span class="badge badge-gray">${p.category}</span> <strong>${priceStr}</strong></div>
                ${summaryRow('인쇄', prints)}
                ${summaryRow('포장', packs)}
                ${summaryRow('라벨', labels)}
            </div>
            <div onclick="event.stopPropagation()" style="display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--gray-100)">
                <button class="edit-btn" style="flex:1;font-size:12px" onclick="duplicateProduct(${p.id})">📋 복제</button>
                <button class="form-delete-btn" style="flex:1;font-size:12px" onclick="deleteProduct(${p.id})">🗑️ 삭제</button>
            </div>
        </div>`;
    });

    if (!tableHtml) {
        tableHtml = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--gray-500)">등록된 상품이 없습니다</td></tr>`;
    }
    document.getElementById('productTableBody').innerHTML = tableHtml;
    document.getElementById('productCardGrid').innerHTML = cardHtml;
}

// 상품 등록/편집 모달
// 편집 중인 상품의 옵션 행 상태 (인쇄/포장/라벨/수량별 단가 — 다중 행 지원)
let editingProduct = { prints: [], packagings: [], labels: [], bulkPrices: [] };

// 옵션 행 한 줄을 그린다. kind: 'print' | 'pack' | 'label'
function renderProductOptionRow(kind, idx, row) {
    const numFmt = n => (Number(n) || 0).toLocaleString();
    if (kind === 'label') {
        return `
        <div class="prod-opt-row" data-kind="label" data-idx="${idx}" style="display:grid;grid-template-columns:1fr 1fr 100px 36px;gap:8px;align-items:end;margin-bottom:8px">
            <div><label class="form-label">라벨 종류 (선택)</label>
                <input type="text" class="form-input prod-opt-note" placeholder="예) 메탈 라벨" value="${(row.note || '').replace(/"/g, '&quot;')}">
            </div>
            <div><label class="form-label">라벨 비용 (원)</label>
                <input type="text" inputmode="numeric" class="form-input prod-opt-fee" placeholder="0" value="${row.fee ? numFmt(row.fee) : ''}" oninput="fmtProjectNumberInput(this)">
            </div>
            <div><label class="form-label">적용</label>
                <select class="form-select prod-opt-apply">
                    <option value="1개당" ${row.feeApply === '1개당' ? 'selected' : ''}>1개당</option>
                    <option value="일괄" ${row.feeApply === '일괄' ? 'selected' : ''}>일괄</option>
                </select>
            </div>
            <button type="button" onclick="removeProductOption('label', ${idx})" title="삭제" style="background:none;border:1px solid var(--gray-200);border-radius:8px;color:var(--red);height:38px;cursor:pointer;font-size:16px">✕</button>
        </div>`;
    }
    const opts = kind === 'print' ? PRINT_TYPES : PACKAGING_TYPES;
    const labelTxt = kind === 'print' ? '인쇄 방식' : '포장 방식';
    const feeLabel = kind === 'print' ? '인쇄비' : '포장비';
    const cls = kind === 'print' ? 'print' : 'pack';
    const sel = (cur) => opts.map(o => `<option value="${o}" ${cur === o ? 'selected' : ''}>${o}</option>`).join('');
    const isEtc = row.type === '기타';
    const customVal = (row.customType || '').replace(/"/g, '&quot;');
    return `
    <div class="prod-opt-row" data-kind="${cls}" data-idx="${idx}" style="display:grid;grid-template-columns:1fr 1fr 100px 36px;gap:8px;align-items:end;margin-bottom:8px">
        <div><label class="form-label">${labelTxt}</label>
            <select class="form-select prod-opt-type" onchange="toggleProductCustomType(this)">${sel(row.type || opts[0])}</select>
            <input type="text" class="form-input prod-opt-custom" placeholder="직접 입력 (예: 자수, UV인쇄 등)" value="${customVal}" style="margin-top:6px;display:${isEtc ? 'block' : 'none'}">
        </div>
        <div><label class="form-label">${feeLabel} (원)</label>
            <input type="text" inputmode="numeric" class="form-input prod-opt-fee" placeholder="0" value="${row.fee ? numFmt(row.fee) : ''}" oninput="fmtProjectNumberInput(this)">
        </div>
        <div><label class="form-label">적용</label>
            <select class="form-select prod-opt-apply">
                <option value="1개당" ${row.feeApply === '1개당' ? 'selected' : ''}>1개당</option>
                <option value="일괄" ${row.feeApply === '일괄' ? 'selected' : ''}>일괄</option>
            </select>
        </div>
        <button type="button" onclick="removeProductOption('${cls}', ${idx})" title="삭제" style="background:none;border:1px solid var(--gray-200);border-radius:8px;color:var(--red);height:38px;cursor:pointer;font-size:16px">✕</button>
    </div>`;
}

// 인쇄/포장 select 가 '기타' 로 바뀌면 직접 입력 textbox 노출, 아니면 숨김
function toggleProductCustomType(selectEl) {
    const row = selectEl.closest('.prod-opt-row');
    if (!row) return;
    const customInput = row.querySelector('.prod-opt-custom');
    if (!customInput) return;
    customInput.style.display = selectEl.value === '기타' ? 'block' : 'none';
    if (selectEl.value === '기타') customInput.focus();
}

// 한 섹션(인쇄/포장/라벨)의 행들을 컨테이너에 다시 그린다.
function renderProductOptionSection(kind) {
    const containerId = kind === 'print' ? 'productPrintRows'
        : kind === 'pack' ? 'productPackRows'
        : 'productLabelRows';
    const arrKey = kind === 'print' ? 'prints'
        : kind === 'pack' ? 'packagings'
        : 'labels';
    const el = document.getElementById(containerId);
    if (!el) return;
    const rows = editingProduct[arrKey] || [];
    el.innerHTML = rows.map((r, i) => renderProductOptionRow(kind, i, r)).join('');
}

// DOM 의 옵션 행 입력값을 editingProduct 로 동기화 (행 추가/삭제 직전 호출).
function syncProductOptionsFromDom() {
    const collect = (kind) => {
        const containerId = kind === 'print' ? 'productPrintRows'
            : kind === 'pack' ? 'productPackRows'
            : 'productLabelRows';
        const root = document.getElementById(containerId);
        if (!root) return [];
        const rows = root.querySelectorAll(`.prod-opt-row[data-kind="${kind}"]`);
        return Array.from(rows).map(r => {
            const fee = (r.querySelector('.prod-opt-fee') || { value: '' }).value.replace(/[^0-9]/g, '');
            const apply = (r.querySelector('.prod-opt-apply') || { value: '1개당' }).value;
            if (kind === 'label') {
                const note = (r.querySelector('.prod-opt-note') || { value: '' }).value;
                return { note, fee: Number(fee) || 0, feeApply: apply };
            }
            const type = (r.querySelector('.prod-opt-type') || { value: '' }).value;
            const customType = (r.querySelector('.prod-opt-custom') || { value: '' }).value;
            return { type, customType, fee: Number(fee) || 0, feeApply: apply };
        });
    };
    editingProduct.prints = collect('print');
    editingProduct.packagings = collect('pack');
    editingProduct.labels = collect('label');
}

function addProductOption(kind) {
    syncProductOptionsFromDom();
    if (kind === 'print') {
        editingProduct.prints.push({ type: '레이저각인', fee: 0, feeApply: '1개당' });
    } else if (kind === 'pack') {
        editingProduct.packagings.push({ type: '선물포장', fee: 0, feeApply: '1개당' });
    } else if (kind === 'label') {
        editingProduct.labels.push({ note: '', fee: 0, feeApply: '1개당' });
    }
    renderProductOptionSection(kind);
}

function removeProductOption(kind, idx) {
    syncProductOptionsFromDom();
    const arrKey = kind === 'print' ? 'prints'
        : kind === 'pack' ? 'packagings'
        : 'labels';
    if (!editingProduct[arrKey]) return;
    editingProduct[arrKey].splice(idx, 1);
    renderProductOptionSection(kind);
}

// ===== 수량별 단가 행 =====
function renderProductBulkRow(idx, row) {
    const numFmt = n => (Number(n) || 0).toLocaleString();
    return `
    <div class="prod-bulk-row" data-idx="${idx}" style="display:grid;grid-template-columns:1fr 1fr 1fr 36px;gap:8px;align-items:end;margin-bottom:8px">
        <div><label class="form-label">최소 수량 (이상)</label>
            <input type="text" inputmode="numeric" class="form-input prod-bulk-min" placeholder="예: 10" value="${row.minQty ? numFmt(row.minQty) : ''}" oninput="fmtProjectNumberInput(this)">
        </div>
        <div><label class="form-label">최대 수량 (이하 · 비우면 무제한)</label>
            <input type="text" inputmode="numeric" class="form-input prod-bulk-max" placeholder="예: 49" value="${row.maxQty ? numFmt(row.maxQty) : ''}" oninput="fmtProjectNumberInput(this)">
        </div>
        <div><label class="form-label">단가 (원)</label>
            <input type="text" inputmode="numeric" class="form-input prod-bulk-price" placeholder="0" value="${row.price ? numFmt(row.price) : ''}" oninput="fmtProjectNumberInput(this)">
        </div>
        <button type="button" onclick="removeBulkPrice(${idx})" title="삭제" style="background:none;border:1px solid var(--gray-200);border-radius:8px;color:var(--red);height:38px;cursor:pointer;font-size:16px">✕</button>
    </div>`;
}
function renderProductBulkSection() {
    const el = document.getElementById('productBulkRows');
    if (!el) return;
    const rows = editingProduct.bulkPrices || [];
    el.innerHTML = rows.map((r, i) => renderProductBulkRow(i, r)).join('');
}
function syncProductBulkFromDom() {
    const root = document.getElementById('productBulkRows');
    if (!root) return;
    const rows = root.querySelectorAll('.prod-bulk-row');
    editingProduct.bulkPrices = Array.from(rows).map(r => {
        const min = (r.querySelector('.prod-bulk-min') || { value: '' }).value.replace(/[^0-9]/g, '');
        const max = (r.querySelector('.prod-bulk-max') || { value: '' }).value.replace(/[^0-9]/g, '');
        const price = (r.querySelector('.prod-bulk-price') || { value: '' }).value.replace(/[^0-9]/g, '');
        return { minQty: Number(min) || 0, maxQty: Number(max) || 0, price: Number(price) || 0 };
    });
}
function addBulkPrice() {
    syncProductBulkFromDom();
    if (!editingProduct.bulkPrices) editingProduct.bulkPrices = [];
    editingProduct.bulkPrices.push({ minQty: 0, maxQty: 0, price: 0 });
    renderProductBulkSection();
}
function removeBulkPrice(idx) {
    syncProductBulkFromDom();
    if (!editingProduct.bulkPrices) return;
    editingProduct.bulkPrices.splice(idx, 1);
    renderProductBulkSection();
}

function openProductDBModal(editId) {
    const overlay = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const p = editId ? productsDB.find(x => x.id === editId) : null;
    title.textContent = p ? '상품 편집' : '상품 등록';
    // 옵션 state 초기화 (편집이면 기존 배열 깊은 복사, 신규면 빈 배열)
    editingProduct = {
        prints: p && Array.isArray(p.prints) ? p.prints.map(_normPrintRow) : [],
        packagings: p && Array.isArray(p.packagings) ? p.packagings.map(_normPackRow) : [],
        labels: p && Array.isArray(p.labels) ? p.labels.map(_normLabelRow) : [],
        bulkPrices: p && Array.isArray(p.bulkPrices) ? p.bulkPrices.map(_normBulkPriceRow) : [],
    };
    const v = (k, d = '') => (p && p[k] != null ? p[k] : d);
    const sel = (opts, cur) => opts.map(o => `<option value="${o}" ${cur === o ? 'selected' : ''}>${o}</option>`).join('');
    body.innerHTML = `
        <input type="hidden" id="productEditId" value="${editId || ''}">
        <div class="form-group"><label class="form-label">상품명 <span style="color:var(--red)">*</span></label>
            <input type="text" class="form-input" id="productName" placeholder="상품명" value="${v('name')}"></div>
        <div class="form-group"><label class="form-label">상품 설명</label>
            <input type="text" class="form-input" id="productDescription" placeholder="간단 설명" value="${v('description')}"></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">카테고리</label>
                <select class="form-select" id="productCategory">${sel(PRODUCT_CATEGORIES, v('category') || '시계')}</select></div>
            <div class="form-group"><label class="form-label">상태</label>
                <select class="form-select" id="productStatus">${sel(PRODUCT_STATUSES, v('status') || '판매 중')}</select></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">단가 (원)</label>
                <input type="text" inputmode="numeric" class="form-input" id="productUnitPrice" placeholder="0" value="${v('unitPrice', 0) ? Number(v('unitPrice', 0)).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this)"></div>
            <div class="form-group"><label class="form-label">VAT 포함</label>
                <label style="display:flex;align-items:center;gap:8px;padding:10px 0;font-weight:500;color:var(--gray-700)">
                    <input type="checkbox" id="productVatIncluded" ${v('vatIncluded', true) ? 'checked' : ''}> 단가에 VAT 포함</label>
            </div>
        </div>

        <!-- 수량별 단가 (선택) — 수량 구간별 단가 -->
        <div class="form-group" style="margin-top:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <label class="form-label" style="margin:0">💰 수량별 단가 (선택)</label>
                <button type="button" onclick="addBulkPrice()" style="padding:6px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">+ 단가 추가</button>
            </div>
            <div id="productBulkRows"></div>
        </div>

        <!-- 인쇄 / 포장 / 라벨 — 동적 추가 행 (기본 0행, 추가 버튼으로 늘림) -->
        <div class="form-group" style="margin-top:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <label class="form-label" style="margin:0">🖨️ 인쇄 옵션</label>
                <button type="button" onclick="addProductOption('print')" style="padding:6px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">+ 인쇄 추가</button>
            </div>
            <div id="productPrintRows"></div>
        </div>

        <div class="form-group" style="margin-top:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <label class="form-label" style="margin:0">📦 포장 옵션</label>
                <button type="button" onclick="addProductOption('pack')" style="padding:6px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">+ 포장 추가</button>
            </div>
            <div id="productPackRows"></div>
        </div>

        <div class="form-group" style="margin-top:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <label class="form-label" style="margin:0">🏷️ 라벨 옵션</label>
                <button type="button" onclick="addProductOption('label')" style="padding:6px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">+ 라벨 추가</button>
            </div>
            <div id="productLabelRows"></div>
        </div>

        <div class="form-group"><label class="form-label">상품 이미지</label>
            <input type="hidden" id="productImage" value="${v('image')}">
            <div id="productImagePreview" style="margin-bottom:8px">
                ${v('image') ? `<img src="${v('image')}" style="max-width:200px;max-height:200px;border-radius:10px;border:1px solid var(--gray-200);object-fit:cover">` : `<div style="width:200px;height:140px;border:2px dashed var(--gray-300);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--gray-400);font-size:12px">이미지 없음</div>`}
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <label class="form-submit" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;cursor:pointer;font-size:13px;margin:0">
                    📁 파일 선택
                    <input type="file" accept="image/*" onchange="handleProductImageUpload(event)" style="display:none">
                </label>
                ${v('image') ? `<button type="button" class="form-delete-btn" style="padding:8px 14px;font-size:13px" onclick="clearProductImage()">이미지 제거</button>` : ''}
                <span style="font-size:11px;color:var(--gray-500)">PNG/JPG · 2MB 이하 권장</span>
            </div>
        </div>
        <div class="form-actions" style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
            <button class="form-submit" style="flex:1;min-width:120px" onclick="saveProduct()">${p ? '저장' : '상품 등록'}</button>
            ${p ? `<button class="edit-btn" style="padding:10px 14px" onclick="closeModal();duplicateProduct(${p.id})">📋 복제</button>` : ''}
            ${p ? `<button class="form-delete-btn" onclick="deleteProduct(${p.id})">🗑️ 삭제</button>` : ''}
        </div>
    `;
    // 옵션 행 초기 렌더 (배열이 비어 있으면 아무 것도 표시되지 않음 — 추가 버튼만 보임)
    renderProductOptionSection('print');
    renderProductOptionSection('pack');
    renderProductOptionSection('label');
    renderProductBulkSection();
    overlay.classList.add('show'); openModalHistory();
    const mb = document.getElementById('modalBody');
    if (mb) mb.scrollTop = 0;
}

// 이미지 파일 업로드 → base64 data URL로 hidden input에 저장 + 미리보기 갱신
function handleProductImageUpload(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('이미지 파일만 업로드 가능합니다'); return; }
    if (file.size > 4 * 1024 * 1024) { showToast('4MB 이하 파일만 업로드 가능합니다'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        const hidden = document.getElementById('productImage');
        if (hidden) hidden.value = dataUrl;
        const preview = document.getElementById('productImagePreview');
        if (preview) preview.innerHTML = `<img src="${dataUrl}" style="max-width:200px;max-height:200px;border-radius:10px;border:1px solid var(--gray-200);object-fit:cover">`;
    };
    reader.onerror = () => showToast('이미지 읽기 실패');
    reader.readAsDataURL(file);
}

function clearProductImage() {
    const hidden = document.getElementById('productImage');
    if (hidden) hidden.value = '';
    const preview = document.getElementById('productImagePreview');
    if (preview) preview.innerHTML = `<div style="width:200px;height:140px;border:2px dashed var(--gray-300);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--gray-400);font-size:12px">이미지 없음</div>`;
}

async function saveProduct() {
    const editId = parseInt(document.getElementById('productEditId').value) || 0;
    const name = document.getElementById('productName').value.trim();
    if (!name) { showToast('상품명을 입력해주세요'); return; }
    syncProductOptionsFromDom();                       // 옵션 행 입력값 → editingProduct
    syncProductBulkFromDom();                          // 수량별 단가 행 입력값 → editingProduct
    const data = {
        name,
        description: document.getElementById('productDescription').value.trim(),
        category: document.getElementById('productCategory').value,
        image: document.getElementById('productImage').value.trim(),
        unitPrice: readProjectNumber('productUnitPrice'),
        vatIncluded: document.getElementById('productVatIncluded').checked,
        prints: editingProduct.prints || [],
        packagings: editingProduct.packagings || [],
        labels: editingProduct.labels || [],
        bulkPrices: editingProduct.bulkPrices || [],
        status: document.getElementById('productStatus').value,
    };
    if (editId) {
        const updated = await dbUpdateProduct(editId, data);
        if (!updated) return;                          // DB 실패 시 모달 유지
        const idx = productsDB.findIndex(p => p.id === editId);
        if (idx >= 0) productsDB[idx] = updated;
        showToast('상품이 수정되었습니다');
    } else {
        const inserted = await dbInsertProduct(data);
        if (!inserted) return;
        productsDB.unshift(inserted);
        showToast('상품이 등록되었습니다');
    }
    closeModal();
    renderProductDB();
}

async function deleteProduct(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const ok = await dbDeleteProduct(id);
    if (!ok) return;
    const idx = productsDB.findIndex(p => p.id === id);
    if (idx >= 0) productsDB.splice(idx, 1);
    closeModal();
    closeDetail();
    renderProductDB();
    showToast('삭제되었습니다');
}

// 상품 복제 — 기존 상품의 모든 필드를 그대로 복사 + 이름에 "(사본)" 추가, id/createdAt 은 새로
async function duplicateProduct(id) {
    const src = productsDB.find(x => x.id === id);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    delete copy.id;
    delete copy.createdAt;
    copy.name = (src.name || '') + ' (사본)';
    const inserted = await dbInsertProduct(copy);
    if (!inserted) return;                         // dbInsertProduct 가 토스트 띄움
    productsDB.unshift(inserted);
    renderProductDB();
    showToast('상품이 복제되었습니다');
}

function showProductDetail(id) {
    const p = productsDB.find(x => x.id === id);
    if (!p) return;
    document.getElementById('detailPanelTitle').textContent = p.name;
    const row = (label, val) => `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--gray-100)"><span style="color:var(--gray-500);font-weight:600">${label}</span><span style="color:var(--gray-900);font-weight:700">${val}</span></div>`;
    const imgHtml = p.image
        ? `<img src="${p.image}" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px;border:1px solid var(--gray-200);margin-bottom:16px">`
        : `<div style="width:100%;height:180px;border-radius:12px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;color:var(--gray-400);margin-bottom:16px"><svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>`;
    document.getElementById('detailContent').innerHTML = `
        ${imgHtml}
        <div style="margin-bottom:16px">
            <span class="badge badge-gray">${p.category}</span>
            <span class="badge ${productStatusBadge(p.status)}" style="margin-left:6px">${p.status}</span>
        </div>
        <div style="color:var(--gray-600);font-size:13px;margin-bottom:16px">${p.description || '-'}</div>
        ${row('단가', `${formatKRW(p.unitPrice)} <span style="font-size:11px;color:var(--gray-500);font-weight:500">(${p.vatIncluded ? 'VAT 포함' : 'VAT 별도'})</span>`)}
        ${(() => {
            const fu = a => a === '일괄' ? '일괄' : '개당';
            const fmtArr = (arr, kind) => {
                if (!arr || !arr.length) return '-';
                return arr.map(o => {
                    const main = kind === 'label' ? (o.note || '부착') : _optDisplayType(o);
                    const fee = o.fee ? ` · ₩${(o.fee||0).toLocaleString()} ${fu(o.feeApply)}` : '';
                    return `${main}${fee}`;
                }).join('<br>');
            };
            return row('인쇄', fmtArr(p.prints, 'print'))
                + row('포장', fmtArr(p.packagings, 'pack'))
                + row('라벨', fmtArr(p.labels, 'label'));
        })()}
        <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
            <button class="form-submit" style="flex:1;min-width:100px" onclick="closeDetail();openProductDBModal(${p.id})">✏️ 편집</button>
            <button class="edit-btn" style="padding:10px 14px" onclick="closeDetail();duplicateProduct(${p.id})">📋 복제</button>
            <button class="form-delete-btn" onclick="deleteProduct(${p.id})">🗑️ 삭제</button>
        </div>
    `;
    document.getElementById('detailOverlay').classList.add('show');
}

// =====================================
// 제안서 관리 (제안서 시스템 파트 3)
// =====================================
const PROPOSAL_STATUSES = ['작성 중', '발송 완료', '계약 성사', '미성사'];

function proposalStatusBadge(s) {
    if (s === '작성 중') return 'badge-orange';
    if (s === '발송 완료') return 'badge-blue';
    if (s === '계약 성사') return 'badge-green';
    if (s === '미성사') return 'badge-gray';
    return 'badge-gray';
}

function renderProposals() {
    // 요약 카드
    document.getElementById('propTotal').textContent = proposals.length;
    document.getElementById('propSent').textContent = proposals.filter(p => p.status === '발송 완료').length;
    document.getElementById('propWon').textContent = proposals.filter(p => p.status === '계약 성사').length;
    // 이번 달 매출 — 계약 성사 상태이고 발송일(또는 createdAt) 이 이번 달인 건의 totalAmount 합
    const ymNow = fmtDate(new Date()).substring(0, 7);
    const monthRevenue = proposals
        .filter(p => p.status === '계약 성사')
        .filter(p => {
            const d = p.sentDate || (p.createdAt ? p.createdAt.substring(0, 10) : '');
            return d.startsWith(ymNow);
        })
        .reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    document.getElementById('propMonthRevenue').textContent = formatKRW(monthRevenue);

    // 필터링
    let filtered = proposals;
    if (currentProposalStatus !== 'all') {
        filtered = filtered.filter(p => p.status === currentProposalStatus);
    }
    if (currentProposalSearch) {
        const q = currentProposalSearch;
        filtered = filtered.filter(p =>
            (p.title || '').toLowerCase().includes(q) ||
            (p.clientName || '').toLowerCase().includes(q)
        );
    }

    // 최신순 정렬
    filtered = [...filtered].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    let tableHtml = '';
    let cardHtml = '';
    filtered.forEach(p => {
        const sentStr = p.sentDate ? fmtDisplay(p.sentDate) : '—';
        const shareBtn = p.shareLink
            ? `<button class="edit-btn" onclick="event.stopPropagation();copyProposalLink(${p.id})" title="공유 링크 복사"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></button>`
            : `<span style="color:var(--gray-400);font-size:12px">—</span>`;

        tableHtml += `<tr onclick="openProposalEditor(${p.id})" style="cursor:pointer">
            <td>
                <div style="font-weight:700;color:var(--gray-900)">${p.title}</div>
                <div style="font-size:11px;color:var(--gray-500);margin-top:2px">${(p.items || []).length}개 상품</div>
            </td>
            <td>
                <div style="font-weight:600">${p.clientName || '-'}</div>
                ${p.clientContact ? `<div style="font-size:11px;color:var(--gray-500)">${p.clientContact}</div>` : ''}
            </td>
            <td style="font-weight:800;color:var(--blue)">${formatKRW(p.totalAmount)}</td>
            <td><span class="badge ${proposalStatusBadge(p.status)}">${p.status}</span></td>
            <td>${sentStr}</td>
            <td>${p.assignee || '-'}</td>
            <td>${shareBtn}</td>
        </tr>`;

        cardHtml += `<div class="resp-card" onclick="openProposalEditor(${p.id})">
            <div class="resp-card-top">
                <div class="resp-card-title">${p.title}</div>
                <span class="badge ${proposalStatusBadge(p.status)}">${p.status}</span>
            </div>
            <div class="resp-card-meta">
                <div class="resp-card-row"><strong>${p.clientName || '-'}</strong>${p.clientContact ? ` · ${p.clientContact}` : ''}</div>
                <div class="resp-card-row" style="color:var(--blue);font-weight:800">${formatKRW(p.totalAmount)}</div>
                <div class="resp-card-row">${(p.items || []).length}개 상품 · ${p.assignee || '-'}</div>
                <div class="resp-card-row">${p.sentDate ? '발송 ' + fmtDisplay(p.sentDate) : '미발송'}</div>
            </div>
        </div>`;
    });

    if (!tableHtml) {
        tableHtml = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gray-500)">제안서가 없습니다</td></tr>`;
    }
    document.getElementById('proposalTableBody').innerHTML = tableHtml;
    document.getElementById('proposalCardGrid').innerHTML = cardHtml;
}

function copyProposalLink(id) {
    const p = proposals.find(x => x.id === id);
    if (!p || !p.shareLink) return;
    // shareLink 가 절대 URL(http/https) 이면 그대로 복사. 레거시 형식(#hash) 이면 origin 을 붙임.
    const link = p.shareLink || '';
    const full = /^https?:\/\//i.test(link) ? link : (location.origin + location.pathname + link);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(full).then(() => showToast('링크가 복사되었습니다')).catch(() => showToast('복사 실패'));
    } else {
        showToast('링크가 복사되었습니다');
    }
}

// 제안서 편집 상태 (편집 중인 제안서 객체 사본) — 저장 시 proposals에 반영
let editingProposal = null;

function _defaultAssignee() {
    if (currentUser && currentUser.name) return currentUser.name;
    return '김현호';
}

function openProposalEditor(id) {
    const existing = id ? proposals.find(p => p.id === id) : null;
    if (existing) {
        editingProposal = JSON.parse(JSON.stringify(existing));
    } else {
        editingProposal = {
            id: null,
            title: '',
            clientName: '',
            clientContact: '',
            clientPhone: '',
            clientEmail: '',
            description: '',
            validUntil: '',
            assignee: _defaultAssignee(),
            status: '작성 중',
            items: [],
            totalAmount: 0,
            sentDate: '',
            shareLink: '',
            createdAt: new Date().toISOString(),
        };
    }
    // 뷰 전환
    document.getElementById('proposalListView').style.display = 'none';
    document.getElementById('proposalEditorView').style.display = 'block';
    renderProposalEditor();
    window.scrollTo(0, 0);
    const mainWrap = document.querySelector('.main-wrap');
    if (mainWrap) mainWrap.scrollTo(0, 0);
}

function closeProposalEditor() {
    editingProposal = null;
    document.getElementById('proposalEditorView').style.display = 'none';
    document.getElementById('proposalEditorView').innerHTML = '';
    document.getElementById('proposalListView').style.display = 'block';
    renderProposals();
}

function renderProposalEditor() {
    if (!editingProposal) return;
    const ep = editingProposal;
    const isNew = !ep.id;
    const assignees = ['이현주', '김현호', '유지은', '구정두', '대표님'];
    const view = document.getElementById('proposalEditorView');

    // 상품 아이템 행 렌더
    const itemsHtml = ep.items.length === 0
        ? `<div style="padding:40px;text-align:center;color:var(--gray-500);font-size:13px">아직 담은 상품이 없습니다. "상품 DB에서 추가" 버튼으로 추가해주세요.</div>`
        : ep.items.map((it, idx) => {
            const p = productsDB.find(x => x.id === it.productId);
            if (!p) return '';
            const vatLabel = p.vatIncluded ? 'VAT 포함' : 'VAT 별도';
            return `<div class="proposal-item-row" draggable="true" data-idx="${idx}"
                ondragstart="onProposalItemDragStart(event, ${idx})"
                ondragover="onProposalItemDragOver(event)"
                ondragleave="onProposalItemDragLeave(event)"
                ondrop="onProposalItemDrop(event, ${idx})"
                ondragend="onProposalItemDragEnd(event)"
                style="display:grid;grid-template-columns:24px 56px 1fr 160px 120px 140px 40px;gap:12px;align-items:center;padding:12px;border-bottom:1px solid var(--gray-100);transition:background .12s">
                <div style="cursor:grab;user-select:none;color:var(--gray-400);font-size:18px;line-height:1;text-align:center" title="드래그하여 순서 변경">⋮⋮</div>
                ${p.image
                    ? `<img src="${p.image}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--gray-200)">`
                    : `<div style="width:56px;height:56px;border-radius:8px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;color:var(--gray-400)"><svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>`}
                <div style="min-width:0">
                    <div style="font-weight:700;color:var(--gray-900);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
                    <div style="font-size:12px;color:var(--gray-500);margin-top:2px">${p.description || ''}</div>
                    <span class="badge badge-gray" style="margin-top:4px">${p.category}</span>
                </div>
                <div style="text-align:right;font-weight:700">${formatKRW(p.unitPrice)}<div style="font-size:11px;color:var(--gray-500);font-weight:500">${vatLabel}</div></div>
                <div><input type="number" min="1" class="form-input" style="text-align:right" value="${it.quantity}" onchange="updateProposalItemQty(${idx}, this.value)"></div>
                <div style="text-align:right;font-weight:800;color:var(--blue)">${formatKRW(it.subtotal)}</div>
                <button type="button" onclick="removeProductFromProposal(${idx})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;padding:4px" title="삭제">✕</button>
            </div>`;
        }).join('');

    view.innerHTML = `
        <div class="content-toolbar" style="align-items:flex-start">
            <div>
                <h2 style="font-size:20px;font-weight:800;color:var(--gray-900);margin-bottom:4px">${isNew ? '새 제안서 작성' : '제안서 편집'}</h2>
                <p style="font-size:13px;color:var(--gray-500);font-weight:500">거래처 정보·상품·금액을 구성하고 저장하세요</p>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <button class="panel-link" style="padding:8px 14px;border:1px solid var(--gray-200);border-radius:8px;background:var(--white);color:var(--gray-700);font-weight:700" onclick="closeProposalEditor()">← 목록으로</button>
                <button class="panel-link" style="padding:8px 14px;border:1px solid var(--gray-200);border-radius:8px;background:var(--white);color:var(--gray-700);font-weight:700" onclick="openProposalPreview()">👁 미리보기</button>
                <button class="btn-primary" onclick="saveProposal()">💾 저장</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
            <!-- 거래처 정보 -->
            <div style="background:var(--white);border:1px solid var(--gray-200);border-radius:12px;padding:18px 20px">
                <div style="font-size:14px;font-weight:800;color:var(--gray-900);margin-bottom:12px">🏢 거래처 정보</div>
                <div class="form-group"><label class="form-label">거래처명 <span style="color:var(--red)">*</span></label>
                    <input type="text" class="form-input" id="epClientName" value="${ep.clientName || ''}" placeholder="거래처명"></div>
                <div class="form-group"><label class="form-label">담당자</label>
                    <input type="text" class="form-input" id="epClientContact" value="${ep.clientContact || ''}" placeholder="담당자 이름"></div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">연락처</label>
                        <input type="text" class="form-input" id="epClientPhone" value="${ep.clientPhone || ''}" placeholder="010-0000-0000"></div>
                    <div class="form-group"><label class="form-label">이메일</label>
                        <input type="email" class="form-input" id="epClientEmail" value="${ep.clientEmail || ''}" placeholder="email@example.com"></div>
                </div>
            </div>
            <!-- 제안서 정보 -->
            <div style="background:var(--white);border:1px solid var(--gray-200);border-radius:12px;padding:18px 20px">
                <div style="font-size:14px;font-weight:800;color:var(--gray-900);margin-bottom:12px">📄 제안서 정보 (KLP 담당)</div>
                <div class="form-group"><label class="form-label">제안서 제목 <span style="color:var(--red)">*</span></label>
                    <input type="text" class="form-input" id="epTitle" value="${ep.title || ''}" placeholder="예) 지플러스타워 준공 감사패 제안"></div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">유효기간</label>
                        <input type="date" class="form-input" id="epValidUntil" value="${ep.validUntil || ''}"></div>
                    <div class="form-group"><label class="form-label">KLP 담당자</label>
                        <select class="form-select" id="epAssignee">
                            ${assignees.map(a => `<option value="${a}" ${ep.assignee === a ? 'selected' : ''}>${a}</option>`).join('')}
                        </select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">KLP 담당자 연락처</label>
                        <input type="text" class="form-input" id="epAssigneePhone" value="${ep.assigneePhone || '02-2103-5757'}" placeholder="02-2103-5757"></div>
                    <div class="form-group"><label class="form-label">KLP 담당자 이메일</label>
                        <input type="email" class="form-input" id="epAssigneeEmail" value="${ep.assigneeEmail || 'klpkorea@agift.kr'}" placeholder="klpkorea@agift.kr"></div>
                </div>
                <div class="form-group"><label class="form-label">상태</label>
                    <select class="form-select" id="epStatus">
                        ${PROPOSAL_STATUSES.map(s => `<option value="${s}" ${ep.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select></div>
                <div class="form-group"><label class="form-label">제안 안내 문구</label>
                    <textarea class="form-input" id="epDescription" rows="3" placeholder="제안 배경·구성·특이사항 등">${ep.description || ''}</textarea></div>
            </div>
        </div>

        <!-- 담은 상품 -->
        <div style="background:var(--white);border:1px solid var(--gray-200);border-radius:12px;padding:18px 20px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">
                <div>
                    <span style="font-size:14px;font-weight:800;color:var(--gray-900)">🛒 담은 상품</span>
                    <span style="font-size:12px;color:var(--gray-500);font-weight:600;margin-left:8px">${ep.items.length}개 선택</span>
                </div>
                <button class="btn-primary" onclick="openProductPicker()">+ 상품 DB에서 추가</button>
            </div>
            <div id="proposalItemsList" style="border:1px solid var(--gray-100);border-radius:8px;overflow:hidden">
                ${itemsHtml}
            </div>
            <div style="display:flex;justify-content:flex-end;align-items:center;gap:14px;margin-top:14px;padding-top:14px;border-top:2px solid var(--gray-200)">
                <span style="color:var(--gray-600);font-weight:700">총 제안 금액</span>
                <span id="proposalTotalDisplay" style="font-size:24px;font-weight:900;color:var(--blue)">${formatKRW(ep.totalAmount)}</span>
            </div>
        </div>

        <!-- 발송 영역 -->
        <div style="background:var(--white);border:1px solid var(--gray-200);border-radius:12px;padding:18px 20px">
            <div style="font-size:14px;font-weight:800;color:var(--gray-900);margin-bottom:12px">📤 발송</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
                <button class="panel-link" style="padding:10px 16px;border:1px solid var(--gray-200);border-radius:8px;background:var(--white);color:var(--gray-700);font-weight:700" onclick="downloadProposalPdf(this)">📄 PDF 다운로드</button>
                <button class="btn-primary" onclick="generateShareLink()">🔗 링크 생성 및 공유</button>
            </div>
            ${ep.shareLink ? `<div style="margin-top:12px;padding:10px 14px;background:var(--blue-light);border-radius:8px;font-size:12px;color:var(--blue);font-weight:600;word-break:break-all">공유 링크: ${ep.shareLink}</div>` : ''}
        </div>
    `;
}

function recalcProposalTotal() {
    if (!editingProposal) return;
    let total = 0;
    editingProposal.items.forEach(it => {
        const p = productsDB.find(x => x.id === it.productId);
        if (!p) { it.subtotal = 0; return; }
        it.subtotal = (p.unitPrice || 0) * (it.quantity || 0);
        total += it.subtotal;
    });
    editingProposal.totalAmount = total;
}

// ===== 담은 상품 드래그 정렬 =====
let _proposalDragIdx = null;
// 행이 다시 렌더되기 전에, 사용자가 친 수량 input 값을 state 로 보존
function syncProposalItemsFromDom() {
    if (!editingProposal) return;
    const list = document.getElementById('proposalItemsList');
    if (!list) return;
    list.querySelectorAll('.proposal-item-row').forEach(r => {
        const idx = parseInt(r.dataset.idx, 10);
        if (!Number.isInteger(idx) || !editingProposal.items[idx]) return;
        const qtyInput = r.querySelector('input[type="number"]');
        if (qtyInput) {
            const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
            editingProposal.items[idx].quantity = qty;
        }
    });
}
function onProposalItemDragStart(e, idx) {
    _proposalDragIdx = idx;
    syncProposalEditorFromDom();        // 헤더 입력값 보존
    syncProposalItemsFromDom();         // 수량 입력값 보존
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(idx)); } catch (_) {}
    }
    e.currentTarget.style.opacity = '0.5';
}
function onProposalItemDragOver(e) {
    if (_proposalDragIdx === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    e.currentTarget.style.background = 'var(--blue-light)';
}
function onProposalItemDragLeave(e) {
    e.currentTarget.style.background = '';
}
function onProposalItemDrop(e, targetIdx) {
    e.preventDefault();
    e.currentTarget.style.background = '';
    const fromIdx = _proposalDragIdx;
    _proposalDragIdx = null;
    if (fromIdx === null || fromIdx === targetIdx) return;
    if (!editingProposal || !editingProposal.items) return;
    const items = editingProposal.items;
    if (fromIdx < 0 || fromIdx >= items.length || targetIdx < 0 || targetIdx >= items.length) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(targetIdx, 0, moved);
    recalcProposalTotal();
    renderProposalEditor();
}
function onProposalItemDragEnd(e) {
    _proposalDragIdx = null;
    if (e && e.currentTarget) e.currentTarget.style.opacity = '';
    // 안전망: 모든 행의 잔여 하이라이트 제거
    document.querySelectorAll('.proposal-item-row').forEach(r => { r.style.background = ''; });
}

// 편집 화면이 떠 있는 동안 사용자가 input 에 친 값을 editingProposal 로 동기화.
// 상품 추가/삭제/수량변경 등 리렌더 직전에 호출해야 입력이 날아가지 않는다.
function syncProposalEditorFromDom() {
    if (!editingProposal) return;
    const get = id => {
        const el = document.getElementById(id);
        return el ? el.value : undefined;
    };
    const t = get('epTitle');         if (t !== undefined) editingProposal.title = t.trim();
    const cn = get('epClientName');   if (cn !== undefined) editingProposal.clientName = cn.trim();
    const cc = get('epClientContact');if (cc !== undefined) editingProposal.clientContact = cc.trim();
    const cp = get('epClientPhone');  if (cp !== undefined) editingProposal.clientPhone = cp.trim();
    const ce = get('epClientEmail');  if (ce !== undefined) editingProposal.clientEmail = ce.trim();
    const vu = get('epValidUntil');   if (vu !== undefined) editingProposal.validUntil = vu;
    const as = get('epAssignee');     if (as !== undefined) editingProposal.assignee = as;
    const ap = get('epAssigneePhone');if (ap !== undefined) editingProposal.assigneePhone = ap;
    const ae = get('epAssigneeEmail');if (ae !== undefined) editingProposal.assigneeEmail = ae;
    const st = get('epStatus');       if (st !== undefined) editingProposal.status = st;
    const ds = get('epDescription');  if (ds !== undefined) editingProposal.description = ds.trim();
}

function updateProposalItemQty(index, val) {
    if (!editingProposal || !editingProposal.items[index]) return;
    syncProposalEditorFromDom();
    const qty = Math.max(1, parseInt(val) || 1);
    editingProposal.items[index].quantity = qty;
    recalcProposalTotal();
    renderProposalEditor();
}

function removeProductFromProposal(index) {
    if (!editingProposal) return;
    syncProposalEditorFromDom();
    editingProposal.items.splice(index, 1);
    recalcProposalTotal();
    renderProposalEditor();
}

function addProductToProposal(productId) {
    if (!editingProposal) return;
    if (editingProposal.items.find(it => it.productId === productId)) return; // 중복 방지
    const p = productsDB.find(x => x.id === productId);
    if (!p) return;
    editingProposal.items.push({ productId, quantity: 1, subtotal: p.unitPrice || 0 });
    recalcProposalTotal();
}

// 상품 선택 모달 — 상품 DB에서 판매 중 상품만 체크박스로
function openProductPicker() {
    if (!editingProposal) return;
    const overlay = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    title.textContent = '상품 DB에서 추가';
    const selectedIds = new Set(editingProposal.items.map(it => it.productId));
    const activeProducts = productsDB.filter(p => p.status === '판매 중');
    body.innerHTML = `
        <div style="font-size:13px;color:var(--gray-500);margin-bottom:12px">판매 중인 상품만 표시됩니다. 이미 담긴 상품은 비활성화됩니다.</div>
        <div style="display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow-y:auto">
            ${activeProducts.map(p => {
                const already = selectedIds.has(p.id);
                return `<label style="display:grid;grid-template-columns:24px 56px 1fr auto;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--gray-200);border-radius:8px;cursor:${already ? 'not-allowed' : 'pointer'};opacity:${already ? '0.5' : '1'}">
                    <input type="checkbox" class="product-picker-check" data-id="${p.id}" ${already ? 'checked disabled' : ''}>
                    ${p.image
                        ? `<img src="${p.image}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--gray-200)">`
                        : `<div style="width:48px;height:48px;border-radius:6px;background:var(--gray-100);display:flex;align-items:center;justify-content:center;color:var(--gray-400)"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16"/></svg></div>`}
                    <div style="min-width:0">
                        <div style="font-weight:700;color:var(--gray-900)">${p.name}</div>
                        <div style="font-size:11px;color:var(--gray-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.description || ''}</div>
                        <span class="badge badge-gray" style="margin-top:2px">${p.category}</span>
                    </div>
                    <div style="font-weight:800;color:var(--blue);white-space:nowrap">${formatKRW(p.unitPrice)}</div>
                </label>`;
            }).join('') || '<div style="text-align:center;padding:40px;color:var(--gray-500)">판매 중인 상품이 없습니다</div>'}
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
            <button class="panel-link" style="flex:1;padding:10px;border:1px solid var(--gray-200);border-radius:8px;background:var(--white);color:var(--gray-700);font-weight:700" onclick="closeModal()">취소</button>
            <button class="form-submit" style="flex:1" onclick="confirmProductPicker()">선택 완료</button>
        </div>
    `;
    overlay.classList.add('show'); openModalHistory();
}

function confirmProductPicker() {
    if (!editingProposal) { closeModal(); return; }
    // 상품 선택 모달 위에서 닫기 전에, 편집 폼의 입력값을 먼저 state 로 보존
    syncProposalEditorFromDom();
    const checks = document.querySelectorAll('.product-picker-check:not(:disabled):checked');
    checks.forEach(c => {
        const pid = parseInt(c.dataset.id);
        addProductToProposal(pid);
    });
    closeModal();
    renderProposalEditor();
}

// 미저장 제안서면 먼저 DB 에 INSERT 해서 실제 id 를 확보. 저장 성공 시 true 반환.
async function _ensureProposalSaved() {
    if (!editingProposal) return false;
    syncProposalEditorFromDom();
    if (editingProposal.id) {
        // 기존 제안서 — 변경분 저장 (조용히)
        const updated = await dbUpdateProposal(editingProposal.id, editingProposal);
        if (!updated) return false;
        const idx = proposals.findIndex(p => p.id === editingProposal.id);
        if (idx >= 0) proposals[idx] = updated;
        return true;
    }
    // 신규 — 필수값 체크 후 INSERT
    const title = (editingProposal.title || '').trim();
    const clientName = (editingProposal.clientName || '').trim();
    if (!title || !clientName) {
        showToast('거래처명과 제안서 제목을 먼저 입력해주세요');
        return false;
    }
    recalcProposalTotal();
    const inserted = await dbInsertProposal(editingProposal);
    if (!inserted) return false;
    editingProposal.id = inserted.id;
    editingProposal.createdAt = inserted.createdAt;
    proposals.unshift(inserted);
    return true;
}

async function generateShareLink() {
    if (!editingProposal) return;
    const ok = await _ensureProposalSaved();
    if (!ok) return;
    const url = `${location.origin}/proposal-view.html?id=${editingProposal.id}`;
    editingProposal.shareLink = url;
    // 링크를 DB 에 저장 (다음에 열어도 같은 링크 유지)
    await dbUpdateProposal(editingProposal.id, editingProposal);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => showToast('공유 링크가 복사되었습니다')).catch(() => showToast('링크 생성됨 (복사 실패)'));
    } else {
        showToast('공유 링크가 생성되었습니다');
    }
    renderProposalEditor();
}

// 견적 요청 — KLP 카카오톡 채널 채팅 페이지를 새 탭으로 연다.
// 메일 클라이언트가 없는 외부 고객도 즉시 문의 가능.
const KAKAO_CHAT_URL = 'http://pf.kakao.com/_xmGyUM/chat';
function requestQuoteEmail() {
    window.open(KAKAO_CHAT_URL, '_blank', 'noopener,noreferrer');
}

// 제안서 미리보기 컨테이너(.pp-wrap)를 캡처해 A4 멀티페이지 PDF 로 저장.
// 라이트 모드 강제(data-theme=dark 일시 제거), 비율 유지, 페이지 단위 슬라이스.
async function downloadProposalPdf(btn) {
    if (!editingProposal) return;
    // 미리보기가 열려있지 않으면 먼저 띄움 (이미 열려있다면 그대로)
    let opened = false;
    if (!document.getElementById('proposalPreviewOverlay') ||
        !document.getElementById('proposalPreviewOverlay').classList.contains('show')) {
        openProposalPreview();
        opened = true;
        // 렌더 끝나길 한 프레임 대기
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    const wrap = document.querySelector('#proposalPreviewOverlay .pp-wrap');
    if (!wrap) { showToast('미리보기 화면을 찾을 수 없습니다'); return; }

    const origLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'PDF 생성 중...'; }
    // 라이트 모드 강제 — 다크 테마 일시 해제
    const docEl = document.documentElement;
    const wasDark = docEl.getAttribute('data-theme') === 'dark';
    if (wasDark) docEl.removeAttribute('data-theme');
    // PDF 출력에 불필요한 인터랙션 영역(필터 칩·뷰 토글, 하단 CTA) 캡처 중 일시 숨김
    const hideEls = wrap.querySelectorAll('.pp-cta, .pp-filter-bar');
    const hidePrev = [];
    hideEls.forEach(el => { hidePrev.push(el.style.display); el.style.display = 'none'; });
    // 여백 압축 클래스 적용 — 캔버스 비율을 A4 에 가깝게 만들어 가장자리 빈 공간 최소화
    wrap.classList.add('pp-pdf-tight');
    try {
        const canvas = await html2canvas(wrap, {
            scale: 2,                          // 해상도
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            windowWidth: wrap.scrollWidth,
            windowHeight: wrap.scrollHeight,
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pw = pdf.internal.pageSize.getWidth();      // 210
        const ph = pdf.internal.pageSize.getHeight();     // 297
        // A4 한 페이지에 비율 유지하며 fit. 가장자리 여백 최소(2mm) 만 남김.
        const margin = 2;
        const innerW = pw - margin * 2;
        const innerH = ph - margin * 2;
        const ratio = Math.min(innerW / canvas.width, innerH / canvas.height);
        const finalW = canvas.width * ratio;
        const finalH = canvas.height * ratio;
        const x = (pw - finalW) / 2;
        const y = (ph - finalH) / 2;
        pdf.addImage(imgData, 'JPEG', x, y, finalW, finalH);
        const safeName = ((editingProposal.title || '제안서') + '_' + (editingProposal.clientName || '')).replace(/[\\/:*?"<>|]/g, '_');
        pdf.save(safeName + '.pdf');
    } catch (err) {
        console.error('PDF 생성 실패:', err);
        showToast('PDF 생성 실패: ' + (err.message || ''));
    } finally {
        // 숨겼던 영역 + 압축 클래스 복원
        hideEls.forEach((el, i) => { el.style.display = hidePrev[i] || ''; });
        wrap.classList.remove('pp-pdf-tight');
        if (wasDark) docEl.setAttribute('data-theme', 'dark');
        if (btn) { btn.disabled = false; btn.textContent = origLabel; }
        if (opened) closeProposalPreview();
    }
}

// =====================================
// 제안서 미리보기 카탈로그 (파트 5)
// =====================================
let currentPreviewFilter = 'all';
let currentPreviewView = 'gallery';

function _previewInitials(name) {
    if (!name) return 'KLP';
    const n = name.trim();
    return n.length >= 2 ? n.slice(-2) : n;
}
// 제안서 미리보기 담당자 카드에 표시할 직급 (이름 옆에 붙음)
function _assigneeRoleTitle(name) {
    if (!name) return '';
    const n = name.trim();
    if (n === '김관택' || n === '대표님') return '대표';
    if (n === '김현호') return '팀장';
    if (n === '이현주') return '실장';
    if (n === '유지은') return '대리';
    return '';
}

function _ppCollectProducts(ep) {
    // items + productsDB 조인
    return ep.items.map(it => {
        const p = productsDB.find(x => x.id === it.productId);
        if (!p) return null;
        return { ...p, _quantity: it.quantity, _subtotal: it.subtotal };
    }).filter(Boolean);
}

function _ppFilterProducts(list, filter) {
    if (filter === 'all') return list;
    if (filter === 'print') return list.filter(p => Array.isArray(p.prints) && p.prints.some(o => o.type && o.type !== '불가'));
    if (filter === 'gift') return list.filter(p => Array.isArray(p.packagings) && p.packagings.some(o => o.type === '선물포장'));
    if (filter === 'under100k') return list.filter(p => (p.unitPrice || 0) <= 100000);
    return list;
}

function openProposalPreview() {
    if (!editingProposal) return;
    syncProposalEditorFromDom();
    let overlay = document.getElementById('proposalPreviewOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'proposalPreviewOverlay';
        overlay.className = 'proposal-preview-overlay';
        document.body.appendChild(overlay);
    }
    currentPreviewFilter = 'all';
    currentPreviewView = 'gallery';
    renderProposalPreview();
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', _proposalPreviewEscHandler);
}

function _proposalPreviewEscHandler(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
        closeProposalPreview();
    }
}

function closeProposalPreview() {
    const overlay = document.getElementById('proposalPreviewOverlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', _proposalPreviewEscHandler);
}

function setPreviewFilter(f) {
    currentPreviewFilter = f;
    renderProposalPreview();
}

function setPreviewView(v) {
    currentPreviewView = v;
    renderProposalPreview();
}

function renderProposalPreview() {
    const overlay = document.getElementById('proposalPreviewOverlay');
    if (!overlay) return;
    const ep = editingProposal;
    if (!ep) { overlay.innerHTML = ''; return; }

    const all = _ppCollectProducts(ep);
    const filtered = _ppFilterProducts(all, currentPreviewFilter);

    const validHtml = ep.validUntil
        ? `유효기간: <span class="pp-valid">${fmtDisplay(ep.validUntil)}까지</span>`
        : '유효기간 미정';

    // 상품 카드 그리드
    const cardsHtml = filtered.map((p, idx) => {
        const vatLabel = p.vatIncluded ? 'VAT 포함' : 'VAT 별도';
        const badgeHtml = '';

        // 옵션 행 구성 (다중 인쇄/포장/라벨)
        // - 옵션 미선택(빈 배열) → 행 자체 숨김
        // - 비용 0원 → "포함" 으로 표기
        // - 라벨/태그 배경 제거하고 일반 텍스트로 표시
        const feeUnit = a => a === '일괄' ? '일괄' : '개당';
        const feeText = o => (Number(o.fee) || 0) > 0
            ? `${feeUnit(o.feeApply)} ₩${Number(o.fee).toLocaleString()}`
            : '포함';
        const prints = Array.isArray(p.prints) ? p.prints : [];
        const packs = Array.isArray(p.packagings) ? p.packagings : [];
        const labels = Array.isArray(p.labels) ? p.labels : [];
        const printRow = prints.length === 0
            ? ''
            : prints.map(o => `<div class="pp-opt-row"><span class="pp-opt-label">인쇄</span><span class="pp-opt-value"><span style="font-weight:600;color:#000">${_optDisplayType(o)}</span> <span style="color:#000;font-size:14px">${feeText(o)}</span></span></div>`).join('');
        const printFeeRow = '';
        const packRow = packs.length === 0
            ? ''
            : packs.map(o => `<div class="pp-opt-row"><span class="pp-opt-label">포장</span><span class="pp-opt-value"><span style="font-weight:600;color:#000">${_optDisplayType(o)}</span> <span style="color:#000;font-size:14px">${feeText(o)}</span></span></div>`).join('');
        const packFeeRow = '';
        const labelRow = labels.length === 0
            ? ''
            : labels.map(o => `<div class="pp-opt-row"><span class="pp-opt-label">라벨</span><span class="pp-opt-value"><span style="font-weight:600;color:#000">부착 가능${o.note ? ' · ' + o.note : ''}</span> <span style="color:#000;font-size:14px">${feeText(o)}</span></span></div>`).join('');

        const imgHtml = p.image
            ? `<img src="${p.image}" alt="${p.name}">`
            : `<svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`;

        // 수량별 단가 (있을 때만 단가 라인 아래에 작은 표 형태로)
        const bulks = Array.isArray(p.bulkPrices) ? p.bulkPrices.filter(b => (b.minQty || b.maxQty) && b.price) : [];
        const bulkLabel = (b) => {
            if (b.minQty && b.maxQty) return `${b.minQty.toLocaleString()}개 ~ ${b.maxQty.toLocaleString()}개`;
            if (b.minQty) return `${b.minQty.toLocaleString()}개 이상`;
            if (b.maxQty) return `${b.maxQty.toLocaleString()}개 이하`;
            return '';
        };
        const bulkHtml = bulks.length === 0 ? '' : `
            <div style="margin-top:10px;padding-top:10px;border-top:2px dashed #000;font-size:17px;color:#000">
                <div style="font-weight:800;color:#000;margin-bottom:6px;font-size:17px">수량별 단가</div>
                ${bulks.map(b => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:17px;color:#000"><span>${bulkLabel(b)}</span><span style="font-weight:800;color:#000">₩${(b.price || 0).toLocaleString()}</span></div>`).join('')}
            </div>`;

        return `<div class="pp-card">
            <div class="pp-card-img">
                ${imgHtml}
                ${badgeHtml}
            </div>
            <div class="pp-card-body">
                <div class="pp-card-name">${p.name}</div>
                ${p.description ? `<div class="pp-card-desc">${p.description}</div>` : ''}
                <div class="pp-card-price">${(Number(p.unitPrice) || 0) > 0 ? `₩${Number(p.unitPrice).toLocaleString()} <small>(${vatLabel})</small>` : '포함'}</div>
                ${bulkHtml}
                <div class="pp-card-opts">
                    ${printRow}
                    ${printFeeRow}
                    ${packRow}
                    ${packFeeRow}
                    ${labelRow}
                </div>
            </div>
        </div>`;
    }).join('');

    // 테이블 뷰
    const tableRows = filtered.map(p => {
        const vatLabel = p.vatIncluded ? 'VAT 포함' : 'VAT 별도';
        const fu = a => a === '일괄' ? '일괄' : '개당';
        const feeText2 = o => (Number(o.fee) || 0) > 0
            ? `₩${Number(o.fee).toLocaleString()} ${fu(o.feeApply)}`
            : '포함';
        const prints2 = Array.isArray(p.prints) ? p.prints : [];
        const packs2 = Array.isArray(p.packagings) ? p.packagings : [];
        const labels2 = Array.isArray(p.labels) ? p.labels : [];
        const printCell = prints2.length === 0
            ? '-'
            : prints2.map(o => `<div><span style="font-weight:600">${_optDisplayType(o)}</span> <span style="color:var(--gray-500)">${feeText2(o)}</span></div>`).join('');
        const packCell = packs2.length === 0
            ? '-'
            : packs2.map(o => `<div><span style="font-weight:600">${_optDisplayType(o)}</span> <span style="color:var(--gray-500)">${feeText2(o)}</span></div>`).join('');
        const labelCell = labels2.length === 0
            ? '-'
            : labels2.map(o => `<div><span style="font-weight:600">가능${o.note ? ' · ' + o.note : ''}</span> <span style="color:var(--gray-500)">${feeText2(o)}</span></div>`).join('');
        const bulks = Array.isArray(p.bulkPrices) ? p.bulkPrices.filter(b => (b.minQty || b.maxQty) && b.price) : [];
        const bulkLabel = (b) => {
            if (b.minQty && b.maxQty) return `${b.minQty.toLocaleString()}~${b.maxQty.toLocaleString()}개`;
            if (b.minQty) return `${b.minQty.toLocaleString()}개+`;
            if (b.maxQty) return `~${b.maxQty.toLocaleString()}개`;
            return '';
        };
        const bulkInline = bulks.length === 0 ? '' : `<div style="margin-top:4px;font-size:11px;color:var(--gray-600)">${bulks.map(b => `${bulkLabel(b)} <strong style="color:var(--gray-900)">₩${(b.price||0).toLocaleString()}</strong>`).join(' · ')}</div>`;
        return `<tr>
            <td><strong>${p.name}</strong>${p.description ? `<div style="font-size:11px;color:var(--gray-500);margin-top:2px">${p.description}</div>` : ''}</td>
            <td><span class="badge badge-gray">${p.category}</span></td>
            <td>${(Number(p.unitPrice) || 0) > 0 ? `<strong>₩${Number(p.unitPrice).toLocaleString()}</strong> <span style="color:var(--gray-500);font-size:11px">${vatLabel}</span>` : `<strong>포함</strong>`}${bulkInline}</td>
            <td>${printCell}</td>
            <td>${packCell}</td>
            <td>${labelCell}</td>
        </tr>`;
    }).join('');

    const productsHtml = currentPreviewView === 'gallery'
        ? `<div class="pp-grid">${cardsHtml || `<div style="grid-column:1/-1;text-align:center;color:var(--gray-500);padding:60px 0">해당 조건의 상품이 없습니다</div>`}</div>`
        : `<table class="pp-table-view"><thead><tr><th>상품명</th><th>카테고리</th><th>가격</th><th>인쇄</th><th>포장</th><th>라벨</th></tr></thead><tbody>${tableRows || `<tr><td colspan="6" style="text-align:center;padding:60px 0;color:var(--gray-500)">해당 조건의 상품이 없습니다</td></tr>`}</tbody></table>`;

    overlay.innerHTML = `
        <button class="pp-close" onclick="closeProposalPreview()" aria-label="닫기">
            <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
        <div class="pp-wrap">
            <!-- 프리미엄 다크 헤더 — 거래처 정보 -->
            <div class="pp-hero">
                <div class="pp-hero-circle3"></div>
                <div class="pp-hero-left">
                    <div class="pp-hero-title">${ep.title || '제안서 제목'}</div>
                    <div class="pp-hero-sub">${ep.clientName || '거래처'}${ep.clientContact ? ' · ' + ep.clientContact + ' 님' : ''}</div>
                    <div class="pp-hero-date">작성일 ${(ep.createdAt || '').substring(0, 10).replace(/-/g, '.')}</div>
                </div>
                <div class="pp-hero-right">
                    <img src="logo.png" alt="KLP KOREA" class="pp-hero-logo">
                </div>
            </div>

            <!-- 제안 안내 + KLP 담당자 -->
            <div class="pp-info-row">
                <div class="pp-info-card">
                    <div class="pp-info-title">제안 안내</div>
                    <div class="pp-info-desc">${(ep.description || '본 제안서는 아래 상품 구성을 기반으로 작성되었습니다.').replace(/\n/g, '<br>')}</div>
                    <div style="margin-top:14px;font-size:13px;color:var(--gray-600);font-weight:700">${validHtml}</div>
                </div>
                <div class="pp-info-card">
                    <div class="pp-info-title">담당자 정보</div>
                    <div class="pp-mgr-row">
                        <div class="pp-mgr-name">${ep.assignee || 'KLP 담당자'}${_assigneeRoleTitle(ep.assignee) ? ` <span style="font-size:17px;font-weight:600;color:#000;margin-left:6px">${_assigneeRoleTitle(ep.assignee)}</span>` : ''}</div>
                    </div>
                    <div class="pp-mgr-contact">
                        <div>📧 ${ep.assigneeEmail || 'klpkorea@agift.kr'}</div>
                        <div>📱 ${ep.assigneePhone || '02-2103-5757'}</div>
                    </div>
                </div>
            </div>

            <!-- 필터 + 뷰 전환 -->
            <div class="pp-filter-bar">
                <div class="pp-chips">
                    <button class="pp-chip ${currentPreviewFilter === 'all' ? 'active' : ''}" onclick="setPreviewFilter('all')">전체 (${all.length})</button>
                    <button class="pp-chip ${currentPreviewFilter === 'print' ? 'active' : ''}" onclick="setPreviewFilter('print')">인쇄 가능</button>
                    <button class="pp-chip ${currentPreviewFilter === 'gift' ? 'active' : ''}" onclick="setPreviewFilter('gift')">선물포장</button>
                    <button class="pp-chip ${currentPreviewFilter === 'under100k' ? 'active' : ''}" onclick="setPreviewFilter('under100k')">10만원 이하</button>
                </div>
                <div class="pp-view-toggle">
                    <button class="pp-view-btn ${currentPreviewView === 'gallery' ? 'active' : ''}" onclick="setPreviewView('gallery')" title="갤러리">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                    </button>
                    <button class="pp-view-btn ${currentPreviewView === 'table' ? 'active' : ''}" onclick="setPreviewView('table')" title="테이블">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
                    </button>
                </div>
            </div>

            ${productsHtml}

            <!-- 하단 CTA -->
            <div class="pp-cta">
                <div>
                    <div class="pp-cta-title">관심 있는 상품이 있으신가요?</div>
                    <div class="pp-cta-sub">문의사항은 우측 견적 요청하기 버튼을 눌러 카카오톡 상담을 통해 안내받으실 수 있습니다.</div>
                </div>
                <div class="pp-cta-btns">
                    <button class="pp-cta-btn" onclick="downloadProposalPdf(this)">📄 PDF 다운로드</button>
                    <button class="pp-cta-btn primary" onclick="requestQuoteEmail()">✉️ 견적 요청하기</button>
                </div>
            </div>

            <!-- 푸터 -->
            <div class="pp-footer">
                <strong>케이엘피코리아</strong> · 서울시 구로구 디지털로 32길 30, 901호 · 02-2103-5757 · klpkorea@agift.kr · www.klpkorea.co.kr<br>
                본 제안서는 케이엘피코리아의 자산이며, 무단 복제 및 배포를 금합니다.
            </div>
        </div>
    `;
}

async function saveProposal() {
    if (!editingProposal) return;
    // DOM 값 수집
    const title = document.getElementById('epTitle').value.trim();
    const clientName = document.getElementById('epClientName').value.trim();
    if (!clientName) { showToast('거래처명을 입력해주세요'); return; }
    if (!title) { showToast('제안서 제목을 입력해주세요'); return; }
    editingProposal.title = title;
    editingProposal.clientName = clientName;
    editingProposal.clientContact = document.getElementById('epClientContact').value.trim();
    editingProposal.clientPhone = document.getElementById('epClientPhone').value.trim();
    editingProposal.clientEmail = document.getElementById('epClientEmail').value.trim();
    editingProposal.validUntil = document.getElementById('epValidUntil').value;
    editingProposal.assignee = document.getElementById('epAssignee').value;
    editingProposal.assigneePhone = (document.getElementById('epAssigneePhone') || {}).value || '';
    editingProposal.assigneeEmail = (document.getElementById('epAssigneeEmail') || {}).value || '';
    const newStatus = document.getElementById('epStatus').value;
    if (newStatus === '발송 완료' && !editingProposal.sentDate) {
        editingProposal.sentDate = fmtDate(new Date());
    }
    editingProposal.status = newStatus;
    editingProposal.description = document.getElementById('epDescription').value.trim();
    recalcProposalTotal();

    if (editingProposal.id) {
        const updated = await dbUpdateProposal(editingProposal.id, editingProposal);
        if (!updated) return;
        const idx = proposals.findIndex(p => p.id === editingProposal.id);
        if (idx >= 0) proposals[idx] = updated;
        showToast('제안서가 저장되었습니다');
    } else {
        const inserted = await dbInsertProposal(editingProposal);
        if (!inserted) return;
        proposals.unshift(inserted);
        showToast('제안서가 등록되었습니다');
    }
    closeProposalEditor();
}


// ============================================================
// 중고마켓DB (업무 탭) — 김현호·김관택·이현주만 접근 가능
// ============================================================
const MARKETDB_ALLOWED = ['김관택','이현주','김현호'];
function marketdbCanAccess() {
    if (!currentUser) return false;
    const login = currentUser.loginName || currentUser.name;
    return MARKETDB_ALLOWED.includes(login);
}

const MARKETDB_SEED={"goods":[{"1":"No","2":"Yes","3":"Yes","4":"No","상태":"판매가능","상품명":"퇴마록 은장도","PRICE":"9.8","SALE":"6-5","상품 설명":"퇴마록 공식 굿즈 월향 레터나이프\n다른 구성품은 없고 월향 레터나이프와 박스만 있음","구성품":"레터나이프/박스","재고수량":"","판매 페이지":"https://tumblbug.com/toemarok_cb","재고 위치":"","중":"No","당":"No"},{"1":"Yes","2":"Yes","3":"Yes","4":"No","상태":"판매가능","상품명":"화산귀환 백아 목베개(택 없는 새상품)","PRICE":"3.9","SALE":"4-3","상품 설명":"택이 없어서 저렴하게 판매","구성품":"목베개+포스터","재고수량":"10","판매 페이지":"https://m.showroom.co.kr/product/detail.html?product_no=35095","재고 위치":"","중":"No","당":"No"},{"1":"Yes","2":"No","3":"No","4":"No","상태":"판매가능","상품명":"망아살 더던 포토카드 5종","PRICE":"0","SALE":"3","상품 설명":"5종 1세트 , 5종 다 있는지 확인하기","구성품":"포토카드 5종","재고수량":"","판매 페이지":"https://tumblbug.com/the_dawn_official","재고 위치":"","중":"No","당":"No"},{"1":"Yes","2":"No","3":"No","4":"No","상태":"판매가능","상품명":"망아살 더던 스페셜 매거진 + 대형 접지 포스터","PRICE":"2.9","SALE":"5","상품 설명":"매거진이랑 접지 포스터 같이 제공","구성품":"매거진/접지포스터","재고수량":"","판매 페이지":"https://tumblbug.com/the_dawn_official","재고 위치":"","중":"No","당":"No"},{"1":"No","2":"No","3":"No","4":"No","상태":"판매가능","상품명":"망아살 더 던 키링 세트 5종","PRICE":"3.8","SALE":"3","상품 설명":"아크릴 키링 5종 세트","구성품":"아크릴 키링 5종","재고수량":"","판매 페이지":"https://tumblbug.com/the_dawn_official","재고 위치":"","중":"No","당":"No"},{"1":"No","2":"Yes","3":"Yes","4":"No","상태":"판매가능","상품명":"하츠네미쿠 인형","PRICE":"4.8","SALE":"3","상품 설명":"하츠네미쿠 한국 공식 라이센스 20cm 인형","구성품":"인형, 품질보증서, 박스","재고수량":"50","판매 페이지":"https://smartstore.naver.com/klpkorea/products/10439191152","재고 위치":"","중":"No","당":"No"}],"misc":[{"1":"Yes","2":"No","3":"No","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 린 수면안대","PRICE":"1.6","SALE":"1.4","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824165261","재고 위치":""},{"1":"Yes","2":"No","3":"No","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 렌 수면안대","PRICE":"1.6","SALE":"1.4","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824165261","재고 위치":""},{"1":"Yes","2":"No","3":"No","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 피아프로 캐릭터즈 코롯토 6종","PRICE":"7.2","SALE":"5","상품 설명":"세트 구성으로 판매했을시","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824321366","재고 위치":""},{"1":"Yes","2":"No","3":"No","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 코롯토 - 미쿠","PRICE":"1.2","SALE":"0.9","상품 설명":"","구성품":"본품","재고수량":"2","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824321366","재고 위치":""},{"1":"Yes","2":"No","3":"No","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 코롯토 - 린","PRICE":"1.2","SALE":"0.9","상품 설명":"","구성품":"본품","재고수량":"2","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824321366","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 코롯토 - 렌","PRICE":"1.2","SALE":"0.9","상품 설명":"","구성품":"본품","재고수량":"2","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824321366","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 코롯토 - 루카","PRICE":"1.2","SALE":"0.9","상품 설명":"","구성품":"본품","재고수량":"2","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824321366","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 코롯토 - 메이코","PRICE":"1.2","SALE":"0.9","상품 설명":"","구성품":"본품","재고수량":"2","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824321366","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"No","상태":"품절","상품명":"하츠네미쿠 코롯토 - 카이토","PRICE":"1.2","SALE":"0.9","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824321366","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"No","상태":"판매가능","상품명":"하츠네미쿠 피아프로 캐릭터즈 아크릴 디오라마 5종","PRICE":"7.5","SALE":"5.5","상품 설명":"세트 구성으로 판매했을시","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824249235","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 아크릴 디오라마 - 미쿠","PRICE":"1.5","SALE":"1.2","상품 설명":"","구성품":"본품","재고수량":"2","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824249235","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 아크릴 디오라마 - 린&렌","PRICE":"1.5","SALE":"1.2","상품 설명":"","구성품":"본품","재고수량":"2","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824249235","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 아크릴 디오라마 - 루카","PRICE":"1.5","SALE":"1.2","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824249235","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 아크릴 디오라마 - 메이코","PRICE":"1.5","SALE":"1.2","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824249235","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 아크릴 디오라마 - 카이토","PRICE":"1.5","SALE":"1.2","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824249235","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 아크릴 스탠드 - 메이코","PRICE":"1.5","SALE":"1.2","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824286264","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"Yes","상태":"판매가능","상품명":"하츠네미쿠 아크릴 스탠드 - 루카","PRICE":"1.5","SALE":"1.2","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10824286264","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"No","상태":"판매가능","상품명":"나 혼자만 레벨업(나혼렙) 마그넷  세트 6종","PRICE":"7.2","SALE":"5","상품 설명":"세트 구성으로 판매했을시","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10603237024","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"판매가능","상품명":"나 혼자만 레벨업(나혼렙) 마그넷 세트 - 성진우 vol.1","PRICE":"1.2","SALE":"0.9","상품 설명":"","구성품":"본품","재고수량":"2","판매 페이지":"https://smartstore.naver.com/cchoice/products/10603237024","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"판매가능","상품명":"나 혼자만 레벨업(나혼렙) 마그넷 세트 - 성진우 vol.2","PRICE":"1.2","SALE":"0.9","상품 설명":"","구성품":"본품","재고수량":"2","판매 페이지":"https://smartstore.naver.com/cchoice/products/10603237024","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"판매가능","상품명":"나 혼자만 레벨업(나혼렙) 마그넷 세트 - 성진우 vol.3","PRICE":"1.2","SALE":"0.9","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10603237024","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"판매가능","상품명":"나 혼자만 레벨업(나혼렙) 마그넷 세트 - 차해인","PRICE":"1.2","SALE":"0.9","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10603237024","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"판매가능","상품명":"나 혼자만 레벨업(나혼렙) 마그넷 세트 - 유진호","PRICE":"1.2","SALE":"0.9","상품 설명":"","구성품":"본품","재고수량":"2","판매 페이지":"https://smartstore.naver.com/cchoice/products/10603237024","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"판매가능","상품명":"나 혼자만 레벨업(나혼렙) 마그넷 세트 - 최종인","PRICE":"1.2","SALE":"0.9","상품 설명":"","구성품":"본품","재고수량":"2","판매 페이지":"https://smartstore.naver.com/cchoice/products/10603237024","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"판매가능","상품명":"나 혼자만 레벨업(나혼렙) 아크릴 무드등","PRICE":"3.2","SALE":"2.5","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/10681020289","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"Yes","상태":"판매가능","상품명":"악역의 엔딩은 죽음뿐 아크릴 무드등","PRICE":"2.9","SALE":"2.5","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/11102578230","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"No","상태":"판매가능","상품명":"녹음의 관 금속 배치 2종 세트","PRICE":"2.56","SALE":"2","상품 설명":"2종 일괄 판매 ","구성품":"뱃지 2개","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/9380707585","재고 위치":""},{"1":"Yes","2":"No","3":"No","4":"No","상태":"판매가능","상품명":"그녀가 공작저로 가야 했던 사정 금속 배치 2종 세트","PRICE":"2.56","SALE":"2","상품 설명":"2종 일괄판매","구성품":"뱃지 2개","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/9205888451","재고 위치":""},{"1":"Yes","2":"No","3":"No","4":"No","상태":"판매가능","상품명":"악당의 아빠를 꼬셔라 금속배지 십자가","PRICE":"1.28","SALE":"1","상품 설명":"","구성품":"뱃지 1개","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/9380679825","재고 위치":""},{"1":"Yes","2":"No","3":"No","4":"No","상태":"판매가능","상품명":"악당의 아빠를 꼬셔라 금속 책갈피","PRICE":"0.38","SALE":"0.25","상품 설명":"","구성품":"본품","재고수량":"1","판매 페이지":"https://smartstore.naver.com/cchoice/products/9428692493","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"랜드스케이프 서울대 각인","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"4","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"랜드스케이프 무지","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"57","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"파카 조터 50주년 볼펜","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"31","판매 페이지":"","재고 위치":""}],"watch":[{"1":"Yes","2":"No","3":"No","4":"Yes","상태":"판매가능","상품명":"호크마 회중시계","PRICE":"5.9","SALE":"9","상품 설명":"프로젝트문 로보토미 코퍼레이션 호크마 회중시계","구성품":"회중시계/체인/품질보증서/캔/종이슬립","재고수량":"","판매 페이지":"","재고 위치":"창고"},{"1":"Yes","2":"Yes","3":"No","4":"No","상태":"판매가능","상품명":"전독시 회중시계","PRICE":"0","SALE":"11","상품 설명":"와디즈 및 서점에서 펀딩했던 전독시 양장본에 포함된 구성품","구성품":"회중시계/체인/품질보증서/캔/종이슬립","재고수량":"","판매 페이지":"https://www.wadiz.kr/web/campaign/detail/162105","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"No","상태":"판매가능","상품명":"로오히 1주년 회중시계","PRICE":"5.2","SALE":"3","상품 설명":"로드오브히어로즈 1주년 기념 굿즈","구성품":"회중시계/체인/품질보증서/박스/종이슬립/원형사진2종","재고수량":"","판매 페이지":"https://tumblbug.com/klpkorea_x_lord","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"No","상태":"판매가능","상품명":"로오히 3주년 탁상시계","PRICE":"5.9","SALE":"3","상품 설명":"로드오브히어로즈 3주년 기념 굿즈","구성품":"탁상시계/품질보증서/박스/종이슬립/안경닦이","재고수량":"","판매 페이지":"https://tumblbug.com/klpkorea_x_lord2","재고 위치":""},{"1":"No","2":"Yes","3":"Yes","4":"No","상태":"판매가능","상품명":"쿠키런 나침반 회중시계","PRICE":"5.9","SALE":"4","상품 설명":"","구성품":"회중시계/품질보증서/박스/종이슬립/안경닦이","재고수량":"","판매 페이지":"https://showroom.co.kr/product/detail.html?product_no=35129&cate_no=135&display_group=1","재고 위치":""},{"1":"No","2":"Yes","3":"Yes","4":"No","상태":"판매가능","상품명":"쿠키런킹덤 똑딱쿠키 시계탑","PRICE":"18.9","SALE":"9","상품 설명":"와디즈에서 펀딩했던 쿠키런 킹덤 탁상시계","구성품":"","재고수량":"200","판매 페이지":"https://showroom.co.kr/product/detail.html?product_no=35088&cate_no=135&display_group=1","재고 위치":""},{"1":"Yes","2":"No","3":"No","4":"No","상태":"판매가능","상품명":"청와대 손목시게","PRICE":"","SALE":"7","상품 설명":"","구성품":"","재고수량":"100","판매 페이지":"","재고 위치":""},{"1":"Yes","2":"Yes","3":"No","4":"No","상태":"판매가능","상품명":"박정희 메탈 손목시계","PRICE":"18","SALE":"10","상품 설명":"","구성품":"손목시계/박스/종이슬립","재고수량":"200","판매 페이지":"","재고 위치":""},{"1":"Yes","2":"No","3":"No","4":"No","상태":"판매가능","상품명":"김구&윤봉길 회중시계","PRICE":"90","SALE":"40","상품 설명":"광복회에서 vip 선물로 제공되었던 시계","구성품":"회중시계 2종/리플렛/박스/종이슬립","재고수량":"60","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"판매가능","상품명":"윤봉길 회중시계","PRICE":"","SALE":"","상품 설명":"광복회에서 vip 선물로 제공되었던 시계","구성품":"윤봉길 회중시계 1개","재고수량":"90","판매 페이지":"","재고 위치":""},{"1":"Yes","2":"Yes","3":"No","4":"No","상태":"판매가능","상품명":"강철의 연금술사 회중시계 200AP","PRICE":"9.8","SALE":"12","상품 설명":"초침 작동하는 엔틱 모델","구성품":"회중시계/체인2종/가죽지갑/안경닦이/품질보증서/캔","재고수량":"","판매 페이지":"https://showroom.co.kr/product/detail.html?product_no=35123&cate_no=136&display_group=1","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"No","상태":"판매가능","상품명":"강철의 연금술사 회중시계 200SP","PRICE":"9.8","SALE":"12","상품 설명":"초침 작동하는 유광 모델","구성품":"회중시계/체인2종/가죽지갑/안경닦이/품질보증서/캔","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"Yes","2":"No","3":"No","4":"No","상태":"판매가능","상품명":"강철의 연금술사 회중시계 500AP","PRICE":"","SALE":"16","상품 설명":"초침 작동하는 엔틱 모델","구성품":"회중시계/체인2종/가죽지갑/안경닦이/품질보증서/캔","재고수량":"","판매 페이지":"https://www.showroom.co.kr/product/detail.html?product_no=9636&cate_no=136&display_group=1","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"Yes","상태":"판매준비","상품명":"빈티지 앤틱 손목시계 1","PRICE":"","SALE":"3","상품 설명":"정상작동","구성품":"시계 1개 ","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 2","PRICE":"","SALE":"3","상품 설명":"정상작동","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 3","PRICE":"","SALE":"3","상품 설명":"정상작동","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 4","PRICE":"","SALE":"3","상품 설명":"정상작동","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"Yes","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 5","PRICE":"","SALE":"3","상품 설명":"정상작동","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 6","PRICE":"","SALE":"3","상품 설명":"정상작동","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 7","PRICE":"","SALE":"3","상품 설명":"정상작동","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 8","PRICE":"","SALE":"3","상품 설명":"정상작동","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 9","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 10","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 11","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 12","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 13","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 14","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 15","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 16","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 17","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 18","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 19","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 20","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 21","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 22","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"Yes","상태":"","상품명":"빈티지 앤틱 손목시계 23","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"빈티지 에버랜드 회중시계","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"Yes","4":"No","상태":"","상품명":"빈티지 포켓몬 회중시계","PRICE":"","SALE":"3","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 메탈 시계 RE300L_오토","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 가죭 시계 RE275L_브라운","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 메탈 시계 RE535L_실버","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 메탈 시계 RE255L_실버블랙","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 가죭 시계 RE2004M_브라운","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 메탈 시계 RE255M_블랙","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 가죭 시계 RE275M_브라운","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 메탈 시계 RE255M_실버블랙","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 가죭 시계 RE535M_브라운","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 가죭 시계 RE5450M_블랙","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 메탈 시계 RE255L_실버","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 가죭 시계 RE535M_블랙","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 가죭 시계 RE535L_블랙","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 메탈 시계 RE255M_실버","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 가죭 시계 RE2004L_브라운","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 메탈 시계 RE065_","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""},{"1":"No","2":"No","3":"No","4":"No","상태":"","상품명":"레노마 가죭 시계 RE5035_블랙","PRICE":"","SALE":"","상품 설명":"","구성품":"","재고수량":"","판매 페이지":"","재고 위치":""}]};

// Supabase 연동 (market_db 테이블)
const MARKETDB_CHECK_FIELDS = ['ceo_junggo','ceo_bungae','ceo_danggeun','iyj_junggo','iyj_bungae','iyj_danggeun','khh_junggo','khh_bungae','khh_danggeun','nko_junggo','nko_bungae'];
let MARKETDB = null;
let _marketdbLoading = null;

function marketRowFromDb(r) {
    const o = {
        id: r.id,
        '상품명': r.name || '',
        '상태': r.status || '판매가능',
        'PRICE': r.price || '',
        'SALE': r.sale || '',
        '상품 설명': r.description || '',
        '구성품': r.parts || '',
        '재고수량': r.qty || '',
        '재고 위치': r.location || '',
        '판매 페이지': r.page_url || '',
        image: r.image || ''
    };
    MARKETDB_CHECK_FIELDS.forEach(k => { o[k] = !!r[k]; });
    return o;
}

function marketRowToDb(r, cat) {
    const o = {
        category: cat,
        name: r['상품명'] || '',
        status: r['상태'] || '판매가능',
        price: r['PRICE'] || '',
        sale: r['SALE'] || '',
        description: r['상품 설명'] || '',
        parts: r['구성품'] || '',
        qty: r['재고수량'] || '',
        location: r['재고 위치'] || '',
        page_url: r['판매 페이지'] || '',
        image: r.image || ''
    };
    MARKETDB_CHECK_FIELDS.forEach(k => { o[k] = !!r[k]; });
    return o;
}

async function loadMarketdbFromDb() {
    if (_marketdbLoading) return _marketdbLoading;
    _marketdbLoading = (async () => {
        try {
            let { data, error } = await sb.from('market_db')
                .select('*')
                .order('category', { ascending: true })
                .order('sort_order', { ascending: true })
                .order('id', { ascending: true });
            if (error) throw error;
            // 테이블이 비어있으면 시드 일괄 삽입 후 재조회
            if (!data || data.length === 0) {
                const rows = [];
                ['watch','goods','misc'].forEach(cat => {
                    (MARKETDB_SEED[cat] || []).forEach((r, i) => {
                        // CSV의 1/2/3/4 → 담당자별 중고·번개·당근 일괄 체크
                        const ceo = r['1'] === 'Yes';
                        const iyj = r['2'] === 'Yes';
                        const khh = r['3'] === 'Yes';
                        const nko = r['4'] === 'Yes';
                        const mapped = Object.assign({}, r, {
                            image: '',
                            ceo_junggo: ceo, ceo_bungae: ceo, ceo_danggeun: ceo,
                            iyj_junggo: iyj, iyj_bungae: iyj, iyj_danggeun: iyj,
                            khh_junggo: khh, khh_bungae: khh, khh_danggeun: khh,
                            nko_junggo: nko, nko_bungae: nko
                        });
                        const row = marketRowToDb(mapped, cat);
                        row.sort_order = i;
                        rows.push(row);
                    });
                });
                if (rows.length > 0) {
                    const ins = await sb.from('market_db').insert(rows);
                    if (ins.error) throw ins.error;
                    const refetch = await sb.from('market_db')
                        .select('*')
                        .order('category', { ascending: true })
                        .order('sort_order', { ascending: true })
                        .order('id', { ascending: true });
                    if (refetch.error) throw refetch.error;
                    data = refetch.data || [];
                }
            }
            const buckets = { watch: [], goods: [], misc: [] };
            (data || []).forEach(r => {
                const cat = buckets[r.category] ? r.category : 'misc';
                buckets[cat].push(marketRowFromDb(r));
            });
            MARKETDB = buckets;
            subscribeMarketRealtime();
        } catch (err) {
            console.error('중고마켓DB 로드 실패:', err);
            showToast('중고마켓DB 로드 실패: ' + (err.message || err));
            MARKETDB = { watch: [], goods: [], misc: [] };
        } finally {
            _marketdbLoading = null;
        }
    })();
    return _marketdbLoading;
}

async function dbMarketInsert(item, cat) {
    const row = marketRowToDb(item, cat);
    // 기존 카테고리의 최솟값보다 작게 지정해 맨 위에 노출
    const existing = (MARKETDB && MARKETDB[cat]) || [];
    let minSort = 0;
    // DB에 sort_order가 남아 있을 수 있으므로 실제 값을 조회해 -1
    try {
        const res = await sb.from('market_db').select('sort_order').eq('category', cat).order('sort_order', { ascending: true }).limit(1);
        if (res && res.data && res.data.length > 0) minSort = (res.data[0].sort_order || 0) - 1;
    } catch (e) {}
    row.sort_order = minSort;
    const { data, error } = await sb.from('market_db').insert(row).select().single();
    if (error) { showToast('추가 실패: ' + error.message); return null; }
    return marketRowFromDb(data);
}

async function dbMarketUpdate(id, patch) {
    const { error } = await sb.from('market_db').update(patch).eq('id', id);
    if (error) { showToast('수정 실패: ' + error.message); return false; }
    return true;
}

async function dbMarketDelete(id) {
    const { error } = await sb.from('market_db').delete().eq('id', id);
    if (error) { showToast('삭제 실패: ' + error.message); return false; }
    return true;
}

// 같은 카테고리 내에서 위/아래로 이동 (sort_order swap)
async function moveMarketItem(ev, cat, idx, dir) {
    ev.stopPropagation();
    if (!MARKETDB || !MARKETDB[cat]) return;
    const list = MARKETDB[cat];
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const a = list[idx], b = list[targetIdx];
    // 순서를 뒤집기 위해 임시로 로컬 스왑
    list[idx] = b;
    list[targetIdx] = a;
    // DB는 sort_order 필드를 쓰는 게 깔끔하지만, 현재 seed sort_order=idx이므로 두 행의 sort_order를 교환
    // 안정적으로 하려면 전체 카테고리를 재번호화하는 것이 안전 (충돌 방지)
    const updates = list.map((r, i) => ({ id: r.id, sort_order: i }));
    // 개별 update 병렬 수행
    try {
        await Promise.all(updates.map(u => sb.from('market_db').update({ sort_order: u.sort_order }).eq('id', u.id)));
    } catch (err) {
        console.error('sort update failed', err);
        showToast('순서 변경 실패');
        // 롤백
        list[idx] = a;
        list[targetIdx] = b;
    }
    renderMarketdb();
}

// ---- Storage: 상품 이미지 업로드 ----
async function uploadMarketImage(file) {
    const ext = ((file.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = 'items/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const { error } = await sb.storage.from('market-db').upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    const { data } = sb.storage.from('market-db').getPublicUrl(path);
    return data.publicUrl;
}

// ---- Realtime 구독: 3명이 동시 작업 시 실시간 동기화 ----
let _marketRealtimeChannel = null;
function subscribeMarketRealtime() {
    if (_marketRealtimeChannel || !sb || !sb.channel) return;
    try {
        _marketRealtimeChannel = sb.channel('market_db_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'market_db' }, (payload) => {
                handleMarketRealtimePayload(payload);
            })
            .subscribe();
    } catch (e) { console.warn('realtime subscribe failed', e); }
}
function handleMarketRealtimePayload(payload) {
    if (!MARKETDB) return;
    const eventType = payload.eventType;
    const newRow = payload.new;
    const oldRow = payload.old;
    if (eventType === 'INSERT' && newRow) {
        const cat = newRow.category;
        if (MARKETDB[cat] && !MARKETDB[cat].find(x => x.id === newRow.id)) {
            MARKETDB[cat].unshift(marketRowFromDb(newRow));
        }
    } else if (eventType === 'UPDATE' && newRow) {
        const targetCat = newRow.category;
        let moved = false;
        ['watch','goods','misc'].forEach(c => {
            const idx = MARKETDB[c].findIndex(x => x.id === newRow.id);
            if (idx >= 0) {
                if (c === targetCat) {
                    MARKETDB[c][idx] = marketRowFromDb(newRow);
                } else {
                    MARKETDB[c].splice(idx, 1);
                    moved = true;
                }
            }
        });
        if (moved && MARKETDB[targetCat]) {
            MARKETDB[targetCat].unshift(marketRowFromDb(newRow));
        }
    } else if (eventType === 'DELETE' && oldRow) {
        ['watch','goods','misc'].forEach(c => {
            const idx = MARKETDB[c].findIndex(x => x.id === oldRow.id);
            if (idx >= 0) MARKETDB[c].splice(idx, 1);
        });
    }
    const tab = document.getElementById('tab-marketdb');
    if (tab && tab.classList.contains('active')) {
        renderMarketdb();
    }
}

let marketCurrentCat = 'all';
let marketCurrentPage = 1;
const MARKET_PER_PAGE = 50;
let marketSearchQuery = '';

function marketEsc(s) {
    return (s||'').toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function marketParseStatus(s) {
    if (!s) return '<span class="mbadge stop">-</span>';
    if (s.indexOf('판매가능')>=0) return '<span class="mbadge ok">판매가능</span>';
    if (s.indexOf('품절')>=0) return '<span class="mbadge soldout">품절</span>';
    return '<span class="mbadge stop">'+marketEsc(s)+'</span>';
}

function marketGetFiltered() {
    if (!MARKETDB) return [];
    let items = [];
    if (marketCurrentCat === 'all') {
        items = [].concat(
            MARKETDB.watch.map((x,i) => Object.assign({}, x, {_cat:'시계', _catKey:'watch', _idx:i})),
            MARKETDB.goods.map((x,i) => Object.assign({}, x, {_cat:'굿즈', _catKey:'goods', _idx:i})),
            MARKETDB.misc.map((x,i) => Object.assign({}, x, {_cat:'기타잡화', _catKey:'misc', _idx:i}))
        );
    } else {
        const catName = marketCurrentCat==='watch'?'시계':marketCurrentCat==='goods'?'굿즈':'기타잡화';
        items = MARKETDB[marketCurrentCat].map((x,i) => Object.assign({}, x, {_cat:catName, _catKey:marketCurrentCat, _idx:i}));
    }
    const q = (marketSearchQuery||'').toLowerCase();
    if (q) {
        items = items.filter(r => ((r['상품명']||'')+(r['상품 설명']||'')+(r['구성품']||'')).toLowerCase().indexOf(q)>=0);
    }
    return items;
}

async function renderMarketdb() {
    const tb = document.getElementById('marketTbody');
    if (!tb) return;
    if (!MARKETDB) {
        tb.innerHTML = '<tr><td colspan="20" style="text-align:center;padding:60px 20px;color:var(--text-tertiary)">불러오는 중...</td></tr>';
        await loadMarketdbFromDb();
    }
    const items = marketGetFiltered();
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total/MARKET_PER_PAGE));
    if (marketCurrentPage>totalPages) marketCurrentPage = totalPages;
    if (marketCurrentPage<1) marketCurrentPage = 1;
    const start = (marketCurrentPage-1)*MARKET_PER_PAGE;
    const pageItems = items.slice(start, start+MARKET_PER_PAGE);

    updateMarketStatus(items);
    updateMarketCounts();

    const catClass = {'시계':'watch','굿즈':'goods','기타잡화':'misc'};
    const catIcon = {'시계':'⌚','굿즈':'🎁','기타잡화':'📦'};

    if (pageItems.length === 0) {
        tb.innerHTML = '<tr><td colspan="21" style="text-align:center;padding:60px 20px;color:var(--text-tertiary)">상품이 없습니다</td></tr>';
        renderMarketPagination(0);
        return;
    }

    tb.innerHTML = pageItems.map(r => {
        const pageUrl = r['판매 페이지'];
        const pageHtml = pageUrl ? '<a href="'+marketEsc(pageUrl)+'" target="_blank" onclick="event.stopPropagation()">바로가기 ↗</a>' : '-';
        const tcls = catClass[r._cat]||'misc';
        const ticon = catIcon[r._cat]||'📦';
        const hasImg = !!r.image;
        const thumbInner = hasImg
            ? '<img src="'+r.image+'" style="width:100%;height:100%;object-fit:cover;border-radius:6px">'
            : ticon;
        const thumbCls = 'mthumb '+(hasImg?'':tcls);
        const thumbStyle = hasImg?'padding:0;overflow:hidden;background:#fff':'';
        const dataImg = hasImg?(' data-img="'+marketEsc(r.image)+'"'):'';
        const chk = (k,color) => '<div class="mchk '+color+(r[k]?' yes':'')+'" data-cat="'+r._catKey+'" data-idx="'+r._idx+'" data-key="'+k+'" onclick="marketToggleChk(event,this)"></div>';
        const noprop = ' onclick="event.stopPropagation()"';
        return '<tr onclick="openMarketModal(\''+r._catKey+'\','+r._idx+')">'+
            '<td><div class="'+thumbCls+'" data-icon="'+ticon+'" data-cls="'+tcls+'"'+dataImg+' style="'+thumbStyle+'">'+thumbInner+'</div></td>'+
            '<td>'+marketParseStatus(r['상태'])+'</td>'+
            '<td class="market-name"><div>'+marketEsc(r['상품명']||'-')+' <span style="font-size:10px;color:var(--text-tertiary);font-weight:500">· '+r._cat+'</span></div>'+(r['상품 설명']?'<div class="desc">'+marketEsc(r['상품 설명']).replace(/\n/g,' ')+'</div>':'')+'</td>'+
            '<td class="market-price">'+marketEsc(r['PRICE']||'-')+'</td>'+
            '<td class="market-sale">'+marketEsc(r['SALE']||'-')+'</td>'+
            '<td class="market-parts">'+marketEsc(r['구성품']||'-')+'</td>'+
            '<td>'+marketEsc(r['재고수량']||'-')+'</td>'+
            '<td>'+marketEsc(r['재고 위치']||'-')+'</td>'+
            '<td>'+pageHtml+'</td>'+
            '<td class="ceo-cell"'+noprop+'>'+chk('ceo_junggo','ceo')+'</td>'+
            '<td class="ceo-cell"'+noprop+'>'+chk('ceo_bungae','ceo')+'</td>'+
            '<td class="ceo-cell mcell-last"'+noprop+'>'+chk('ceo_danggeun','ceo')+'</td>'+
            '<td class="iyj-cell"'+noprop+'>'+chk('iyj_junggo','iyj')+'</td>'+
            '<td class="iyj-cell"'+noprop+'>'+chk('iyj_bungae','iyj')+'</td>'+
            '<td class="iyj-cell mcell-last"'+noprop+'>'+chk('iyj_danggeun','iyj')+'</td>'+
            '<td class="khh-cell"'+noprop+'>'+chk('khh_junggo','khh')+'</td>'+
            '<td class="khh-cell"'+noprop+'>'+chk('khh_bungae','khh')+'</td>'+
            '<td class="khh-cell mcell-last"'+noprop+'>'+chk('khh_danggeun','khh')+'</td>'+
            '<td class="nko-cell"'+noprop+'>'+chk('nko_junggo','nko')+'</td>'+
            '<td class="nko-cell mcell-last"'+noprop+'>'+chk('nko_bungae','nko')+'</td>'+
            '<td'+noprop+'><div class="market-sort-btns">'+
                '<button class="market-sort-btn" onclick="moveMarketItem(event,\''+r._catKey+'\','+r._idx+',-1)" title="위로">▲</button>'+
                '<button class="market-sort-btn" onclick="moveMarketItem(event,\''+r._catKey+'\','+r._idx+',1)" title="아래로">▼</button>'+
            '</div></td>'+
        '</tr>';
    }).join('');
    renderMarketPagination(totalPages);
    bindMarketThumbHovers();
}

function updateMarketCounts() {
    if (!MARKETDB) return;
    const all = MARKETDB.watch.length + MARKETDB.goods.length + MARKETDB.misc.length;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('mcnt-all', all);
    set('mcnt-watch', MARKETDB.watch.length);
    set('mcnt-goods', MARKETDB.goods.length);
    set('mcnt-misc', MARKETDB.misc.length);
}

const MARKET_PERSONS = [
    { key:'ceo', name:'대표님', fields:['ceo_junggo','ceo_bungae','ceo_danggeun'], labels:['중고','번개','당근'] },
    { key:'iyj', name:'이현주', fields:['iyj_junggo','iyj_bungae','iyj_danggeun'], labels:['중고','번개','당근'] },
    { key:'khh', name:'김현호', fields:['khh_junggo','khh_bungae','khh_danggeun'], labels:['중고','번개','당근'] },
    { key:'nko', name:'뉴코',    fields:['nko_junggo','nko_bungae'],               labels:['중고','번개'] }
];

function updateMarketStatus(items) {
    if (!items) items = marketGetFiltered();
    const total = items.length;
    const scope = marketCurrentCat==='all'?'전체':marketCurrentCat==='watch'?'시계':marketCurrentCat==='goods'?'굿즈':'기타잡화';
    const scopeEl = document.getElementById('marketStatusScope');
    if (scopeEl) scopeEl.textContent = scope + ' · 총 ' + total + '건';
    const grid = document.getElementById('marketStatusGrid');
    if (!grid) return;
    let html = '';
    MARKET_PERSONS.forEach(p => {
        const stats = p.fields.map((f,i) => {
            const n = items.reduce((a,r) => a + (r[f]?1:0), 0);
            const done = n>0 && n===total ? ' done' : '';
            return '<div class="stat'+done+'"><span class="plat">'+p.labels[i]+'</span><span class="frac">'+n+' / '+total+'</span></div>';
        }).join('');
        html += '<div class="market-person-card '+p.key+'"><div class="who">'+p.name+'</div><div class="stats">'+stats+'</div></div>';
    });
    grid.innerHTML = html;
}

function renderMarketPagination(totalPages) {
    const pag = document.getElementById('marketPagination');
    if (!pag) return;
    if (totalPages<=1) { pag.innerHTML = ''; return; }
    const btn = (label, page, disabled, active) =>
        '<button class="filter-chip '+(active?'active':'')+'" '+(disabled?'disabled':'')+' onclick="gotoMarketPage('+page+')" style="min-width:36px">'+label+'</button>';
    let html = '';
    html += btn('«', 1, marketCurrentPage===1);
    html += btn('‹', marketCurrentPage-1, marketCurrentPage===1);
    let s = Math.max(1, marketCurrentPage-2), e = Math.min(totalPages, s+4);
    s = Math.max(1, e-4);
    for (let i=s; i<=e; i++) html += btn(i, i, false, i===marketCurrentPage);
    html += btn('›', marketCurrentPage+1, marketCurrentPage===totalPages);
    html += btn('»', totalPages, marketCurrentPage===totalPages);
    pag.innerHTML = html;
}
function gotoMarketPage(p) { marketCurrentPage = p; renderMarketdb(); window.scrollTo({top:0,behavior:'smooth'}); }

async function marketToggleChk(ev, el) {
    ev.stopPropagation();
    const cat = el.dataset.cat, idx = Number(el.dataset.idx), key = el.dataset.key;
    if (!MARKETDB[cat] || !MARKETDB[cat][idx]) return;
    const item = MARKETDB[cat][idx];
    const newVal = !item[key];
    // Optimistic update
    item[key] = newVal;
    el.classList.toggle('yes');
    updateMarketStatus();
    const ok = await dbMarketUpdate(item.id, { [key]: newVal });
    if (!ok) {
        // 롤백
        item[key] = !newVal;
        el.classList.toggle('yes');
        updateMarketStatus();
    }
}

function bindMarketThumbHovers() {
    const tt = document.getElementById('marketThumbTooltip');
    if (!tt) return;
    document.querySelectorAll('#marketTable .mthumb').forEach(t => {
        t.addEventListener('mouseenter', () => {
            const cls = t.dataset.cls||'';
            const icon = t.dataset.icon||'📦';
            const img = t.dataset.img;
            if (img) {
                tt.className = '';
                tt.style.background = '#fff';
                tt.style.padding = '6px';
                tt.innerHTML = '<img src="'+img+'" style="width:100%;height:100%;object-fit:contain;border-radius:8px">';
            } else {
                tt.className = 'mthumb '+cls;
                tt.style.background = '';
                tt.style.padding = '';
                tt.textContent = icon;
            }
            tt.style.display = 'flex';
            const rect = t.getBoundingClientRect();
            let left = rect.right + 12;
            if (left+210 > window.innerWidth) left = rect.left - 212;
            tt.style.left = left+'px';
            tt.style.top = Math.max(8, rect.top+rect.height/2-100)+'px';
        });
        t.addEventListener('mouseleave', () => { tt.style.display = 'none'; });
    });
}

// ===== 모달 =====
let _marketEditCtx = null;
async function openMarketModal(cat, idx) {
    if (!marketdbCanAccess()) return;
    if (!MARKETDB) await loadMarketdbFromDb();
    const title = document.getElementById('marketModalTitle');
    const body = document.getElementById('marketModalBody');
    const isEdit = cat && idx != null && idx >= 0;
    _marketEditCtx = isEdit ? { cat, idx } : null;
    const r = isEdit ? MARKETDB[cat][idx] : {};
    title.textContent = isEdit ? '상품 편집' : '새 상품 추가';
    const val = k => marketEsc((r[k]||'').toString());
    const defaultCat = cat || (marketCurrentCat==='all'?'watch':marketCurrentCat);
    const catOpts = ['watch','goods','misc'].map(c => {
        const label = c==='watch'?'⌚ 시계':c==='goods'?'🎁 굿즈':'📦 기타잡화';
        return '<option value="'+c+'"'+(defaultCat===c?' selected':'')+'>'+label+'</option>';
    }).join('');
    const statuses = ['판매가능','품절','판매중지','단종'];
    const curStatus = r['상태']||'판매가능';
    const statusOpts = statuses.map(s => '<option value="'+s+'"'+(curStatus===s?' selected':'')+'>'+s+'</option>').join('');
    body.innerHTML =
        '<div class="form-group"><label class="form-label">상품 이미지</label>'+
          '<div style="display:flex;gap:12px;align-items:center">'+
            '<div id="mMImgPreview" style="width:88px;height:88px;border-radius:8px;border:1.5px dashed var(--gray-300);display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:11px;overflow:hidden;background:var(--gray-50);flex-shrink:0">'+(r.image?'<img src="'+r.image+'" style="width:100%;height:100%;object-fit:cover">':'없음')+'</div>'+
            '<div style="flex:1;display:flex;flex-direction:column;gap:6px">'+
              '<label style="padding:8px 14px;background:var(--blue);color:#fff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;text-align:center;width:140px">📁 파일 선택<input type="file" accept="image/*" onchange="handleMarketImgUpload(event)" style="display:none"></label>'+
              '<button type="button" onclick="clearMarketImg()" style="padding:6px 14px;background:#fee2e2;color:#991b1b;border:none;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;width:140px;'+(r.image?'':'display:none')+'" id="mMImgClearBtn">이미지 제거</button>'+
              '<span style="font-size:10px;color:var(--text-tertiary)">PNG/JPG · 4MB 이하</span>'+
            '</div>'+
            '<input type="hidden" id="mMImage" value="'+(r.image||'')+'">'+
          '</div>'+
        '</div>'+
        '<div class="form-row">'+
          '<div class="form-group"><label class="form-label">카테고리 *</label><select class="form-select" id="mMCat">'+catOpts+'</select></div>'+
          '<div class="form-group"><label class="form-label">상태</label><select class="form-select" id="mMStatus">'+statusOpts+'</select></div>'+
        '</div>'+
        '<div class="form-group"><label class="form-label">상품명 *</label><input type="text" class="form-input" id="mMName" value="'+val('상품명')+'" placeholder="예: 호크마 회중시계" ></div>'+
        '<div class="form-row">'+
          '<div class="form-group"><label class="form-label">PRICE (만원)</label><input type="text" class="form-input" id="mMPrice" value="'+val('PRICE')+'" placeholder="5.9"></div>'+
          '<div class="form-group"><label class="form-label">SALE (만원)</label><input type="text" class="form-input" id="mMSale" value="'+val('SALE')+'" placeholder="9"></div>'+
        '</div>'+
        '<div class="form-group"><label class="form-label">상품 설명</label><textarea class="form-input" id="mMDesc" rows="2" placeholder="상품 설명">'+val('상품 설명')+'</textarea></div>'+
        '<div class="form-group"><label class="form-label">구성품</label><input type="text" class="form-input" id="mMParts" value="'+val('구성품')+'" placeholder="회중시계/체인/품질보증서"></div>'+
        '<div class="form-row">'+
          '<div class="form-group"><label class="form-label">재고수량</label><input type="text" class="form-input" id="mMQty" value="'+val('재고수량')+'"></div>'+
          '<div class="form-group"><label class="form-label">재고 위치</label><input type="text" class="form-input" id="mMLoc" value="'+val('재고 위치')+'" placeholder="창고"></div>'+
        '</div>'+
        '<div class="form-group"><label class="form-label">판매 페이지 URL</label><input type="text" class="form-input" id="mMUrl" value="'+val('판매 페이지')+'" placeholder="https://..."></div>'+
        '<div style="display:flex;gap:8px;margin-top:16px">'+
          (isEdit?'<button class="form-submit" style="flex:1;background:var(--red)" onclick="deleteMarketItem()">🗑️ 삭제</button>':'')+
          '<button class="form-submit" style="flex:1;background:var(--gray-200);color:var(--gray-800)" onclick="closeMarketModal()">취소</button>'+
          '<button class="form-submit" style="flex:2" onclick="saveMarketItem()">💾 '+(isEdit?'저장':'추가')+'</button>'+
        '</div>';
    document.getElementById('marketModalOverlay').classList.add('show');
    setTimeout(() => { const el = document.getElementById('mMName'); if (el) el.focus(); }, 50);
}
function closeMarketModal() {
    document.getElementById('marketModalOverlay').classList.remove('show');
}
async function handleMarketImgUpload(ev) {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { showToast('이미지 파일만 업로드 가능합니다'); return; }
    if (f.size > 8*1024*1024) { showToast('8MB 이하만 업로드 가능합니다'); return; }
    ev.target.value = '';
    const preview = document.getElementById('mMImgPreview');
    if (preview) preview.innerHTML = '<span style="font-size:10px;color:var(--text-tertiary)">업로드 중...</span>';
    try {
        const url = await uploadMarketImage(f);
        const hidden = document.getElementById('mMImage');
        if (hidden) hidden.value = url;
        if (preview) preview.innerHTML = '<img src="'+url+'" style="width:100%;height:100%;object-fit:cover">';
        const clr = document.getElementById('mMImgClearBtn');
        if (clr) clr.style.display = 'block';
        showToast('이미지 업로드 완료');
    } catch (err) {
        console.error('image upload failed', err);
        showToast('이미지 업로드 실패: ' + (err.message || err));
        if (preview) preview.innerHTML = '없음';
    }
}
function clearMarketImg() {
    document.getElementById('mMImage').value = '';
    document.getElementById('mMImgPreview').innerHTML = '없음';
    document.getElementById('mMImgClearBtn').style.display = 'none';
}
async function saveMarketItem() {
    const newCat = document.getElementById('mMCat').value;
    const name = document.getElementById('mMName').value.trim();
    if (!name) { showToast('상품명을 입력해주세요'); return; }
    const base = {
        '상태': document.getElementById('mMStatus').value,
        '상품명': name,
        'PRICE': document.getElementById('mMPrice').value.trim(),
        'SALE': document.getElementById('mMSale').value.trim(),
        '상품 설명': document.getElementById('mMDesc').value.trim(),
        '구성품': document.getElementById('mMParts').value.trim(),
        '재고수량': document.getElementById('mMQty').value.trim(),
        '재고 위치': document.getElementById('mMLoc').value.trim(),
        '판매 페이지': document.getElementById('mMUrl').value.trim(),
        image: document.getElementById('mMImage').value
    };
    if (_marketEditCtx) {
        const old = MARKETDB[_marketEditCtx.cat][_marketEditCtx.idx];
        // 기존 체크 상태 유지
        MARKETDB_CHECK_FIELDS.forEach(k => { base[k] = !!old[k]; });
        const patch = marketRowToDb(base, newCat);
        const ok = await dbMarketUpdate(old.id, patch);
        if (!ok) return;
        const updated = Object.assign({}, old, base);
        if (_marketEditCtx.cat === newCat) {
            MARKETDB[_marketEditCtx.cat][_marketEditCtx.idx] = updated;
        } else {
            MARKETDB[_marketEditCtx.cat].splice(_marketEditCtx.idx, 1);
            MARKETDB[newCat].unshift(updated);
        }
        showToast('상품이 수정되었습니다');
    } else {
        MARKETDB_CHECK_FIELDS.forEach(k => { base[k] = false; });
        const saved = await dbMarketInsert(base, newCat);
        if (!saved) return;
        MARKETDB[newCat].unshift(saved);
        showToast('상품이 추가되었습니다');
    }
    closeMarketModal();
    renderMarketdb();
}
async function deleteMarketItem() {
    if (!_marketEditCtx) return;
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const old = MARKETDB[_marketEditCtx.cat][_marketEditCtx.idx];
    const ok = await dbMarketDelete(old.id);
    if (!ok) return;
    MARKETDB[_marketEditCtx.cat].splice(_marketEditCtx.idx, 1);
    closeMarketModal();
    renderMarketdb();
    showToast('상품이 삭제되었습니다');
}

function setupMarketdbHandlers() {
    document.querySelectorAll('#marketCatBar .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#marketCatBar .filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            marketCurrentCat = chip.dataset.mcat;
            marketCurrentPage = 1;
            renderMarketdb();
        });
    });
    const search = document.getElementById('marketSearch');
    if (search) {
        search.addEventListener('input', e => {
            marketSearchQuery = e.target.value;
            marketCurrentPage = 1;
            renderMarketdb();
        });
    }
    applyMarketdbPermission();
}
function applyMarketdbPermission() {
    const nav = document.getElementById('navMarketdb');
    if (nav) nav.style.display = marketdbCanAccess() ? '' : 'none';
}

document.addEventListener('keydown', e => {
    const tab = document.getElementById('tab-marketdb');
    const isActive = tab && tab.classList.contains('active');
    const modal = document.getElementById('marketModalOverlay');
    const modalOpen = modal && modal.classList.contains('show');
    if (e.key === 'F2' && isActive && marketdbCanAccess()) {
        e.preventDefault();
        openMarketModal(null, null);
    } else if (e.key === 'Escape' && modalOpen) {
        closeMarketModal();
    }
});

// =====================================
// 임시 프로젝트
// =====================================
let tempGroups = [];
const tempProjects = [];

async function loadTempProjects() {
    try {
        const { data, error } = await sb.from('projects_temp').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        tempProjects.length = 0;
        (data || []).forEach(r => {
            tempProjects.push({
                id: r.id,
                date: r.date || '',
                client: r.client || '',
                clientContact: r.client_contact || '',
                supplier: r.supplier || '',
                supplierContact: r.supplier_contact || '',
                item: r.item || '',
                unitPrice: r.unit_price || 0,
                unitPriceVat: r.unit_price_vat || 'VAT 별도',
                supplierUnitPrice: r.supplier_unit_price || 0,
                supplierUnitPriceVat: r.supplier_unit_price_vat || 'VAT 별도',
                qty: r.qty || 0,
                revenue: r.revenue || 0,
                supplierRevenue: r.supplier_revenue || 0,
                printMethod: r.print_method || '없음',
                printFee: r.print_fee || 0,
                printFeeApply: r.print_fee_apply || '1개당',
                printFeeVat: r.print_fee_vat || 'VAT 별도',
                packMethod: r.pack_method || '기본박스',
                packagingFee: r.packaging_fee || 0,
                packagingFeeApply: r.packaging_fee_apply || '일괄',
                packagingFeeVat: r.packaging_fee_vat || 'VAT 별도',
                labelFee: r.label_fee || 0,
                labelFeeApply: r.label_fee_apply || '1개당',
                labelFeeVat: r.label_fee_vat || 'VAT 별도',
                shippingBoxes: r.shipping_boxes || 0,
                shippingFee: r.shipping_fee || 0,
                shippingFeeVat: r.shipping_fee_vat || 'VAT 별도',
                supPrintMethod: r.sup_print_method || '없음',
                supPrintFee: r.sup_print_fee || 0,
                supPrintFeeApply: r.sup_print_fee_apply || '1개당',
                supPrintFeeVat: r.sup_print_fee_vat || 'VAT 별도',
                supPackMethod: r.sup_pack_method || '기본박스',
                supPackagingFee: r.sup_packaging_fee || 0,
                supPackagingFeeApply: r.sup_packaging_fee_apply || '일괄',
                supPackagingFeeVat: r.sup_packaging_fee_vat || 'VAT 별도',
                supLabelFee: r.sup_label_fee || 0,
                supLabelFeeApply: r.sup_label_fee_apply || '1개당',
                supLabelFeeVat: r.sup_label_fee_vat || 'VAT 별도',
                supShippingBoxes: r.sup_shipping_boxes || 0,
                supShippingFee: r.sup_shipping_fee || 0,
                supShippingFeeVat: r.sup_shipping_fee_vat || 'VAT 별도',
                quoteNote: r.quote_note || ''
            });
        });
    } catch (err) {
        console.error('임시 프로젝트 로드 실패:', err.message);
    }
    renderTempProjects();
}

function renderTempProjects() {
    const tbody = document.getElementById('tempProjectTableBody');
    const cardGrid = document.getElementById('tempProjectCardGrid');
    if (!tbody) return;

    const pill = (bg, fg, text) => `<span style="display:inline-block;padding:4px 10px;border-radius:6px;background:${bg};color:${fg};font-weight:800;font-size:13px;white-space:nowrap">${text}</span>`;

    // 날짜+매출처 기준 그룹핑
    const sorted = [...tempProjects].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.client || '').localeCompare(b.client || ''));
    tempGroups = [];
    const groups = tempGroups;
    sorted.forEach(p => {
        const key = (p.date || '') + '||' + (p.client || '');
        let g = groups.find(x => x.key === key);
        if (!g) { g = { key, date: p.date, client: p.client, clientContact: p.clientContact, quoteNote: p.quoteNote || '', items: [] }; groups.push(g); }
        if (!g.quoteNote && p.quoteNote) g.quoteNote = p.quoteNote;
        g.items.push(p);
    });

    let rowHtml = '';
    let cardHtml = '';
    const groupColors = ['var(--white)', 'var(--gray-50)'];

    groups.forEach((g, gi) => {
        const bgColor = groupColors[gi % 2];
        const dateStr = g.date ? g.date.replace(/-/g, '.') : '-';
        const rowspan = g.items.length;

        g.items.forEach((p, pi) => {
            const revWithVat = calcTempRevenueWithVat(p);
            const supWithVat = calcTempSupRevenueWithVat(p);
            const margin = revWithVat - supWithVat;
            const marginPct = revWithVat > 0 ? Math.round((margin / revWithVat) * 100) : 0;
            const revenueStr = pill('#E8F4FD', '#1B64DA', revWithVat.toLocaleString() + '원');
            const purchaseStr = supWithVat > 0
                ? pill('#FFF2E6', '#E67E22', supWithVat.toLocaleString() + '원')
                : '<span style="color:var(--text-tertiary)">-</span>';
            const marginStr = supWithVat > 0
                ? (margin >= 0
                    ? pill('#E8F8EF', '#12B76A', margin.toLocaleString() + '원 (' + marginPct + '%)')
                    : pill('#FEECEC', '#E03131', margin.toLocaleString() + '원 (' + marginPct + '%)'))
                : '<span style="color:var(--text-tertiary)">-</span>';

            const borderTop = pi === 0 && gi > 0 ? 'border-top:2px solid var(--gray-200);' : '';
            rowHtml += `<tr style="background:${bgColor};${borderTop}">`;
            // rowspan +1 for the group inline add row
            const rs = rowspan + 1;
            const ce = (field, type) => `class="cell-editable" data-id="${p.id}" data-field="${field}" data-type="${type || 'text'}" data-entity="temp"`;
            if (pi === 0) {
                rowHtml += `<td rowspan="${rs}" ${ce('date','date')} style="vertical-align:middle;font-weight:600;background:${bgColor};${borderTop};cursor:pointer">${dateStr}</td>`;
                rowHtml += `<td rowspan="${rs}" ${ce('client')} style="vertical-align:middle;background:${bgColor};${borderTop};cursor:pointer"><strong>${g.client || '-'}</strong></td>`;
                rowHtml += `<td rowspan="${rs}" ${ce('clientContact')} style="vertical-align:middle;background:${bgColor};${borderTop};cursor:pointer">${g.clientContact || '-'}</td>`;
            }
            const vatBadge = v => v === 'VAT 포함' ? '<div style="font-size:10px;color:#E67E22;font-weight:600">VAT포함</div>' : '<div style="font-size:10px;color:#1B64DA;font-weight:600">VAT별도</div>';
            const printTotal = (p.printFeeApply === '1개당') ? (p.printFee || 0) * (p.qty || 0) : (p.printFee || 0);
            const packTotal = (p.packagingFeeApply === '1개당') ? (p.packagingFee || 0) * (p.qty || 0) : (p.packagingFee || 0);
            const labelTotal = calcTempFeeTotal(p.labelFee, p.labelFeeApply || '1개당', p.qty || 0);
            const shipTotal = (p.shippingFee || 0) * (p.shippingBoxes || 0);
            const feeDetails = [
                printTotal > 0 ? `인쇄 ${printTotal.toLocaleString()}` : '',
                packTotal > 0 ? `포장 ${packTotal.toLocaleString()}` : '',
                labelTotal > 0 ? `라벨 ${labelTotal.toLocaleString()}` : '',
                shipTotal > 0 ? `택배 ${shipTotal.toLocaleString()}` : ''
            ].filter(Boolean);
            const feeBadge = feeDetails.length > 0 ? `<div style="margin-top:4px;font-size:10px;color:var(--text-tertiary);line-height:1.5">${feeDetails.map(f => '+' + f).join('<br>')}</div>` : '';

            // 매입 부대비용
            const supPrintTotal = calcTempFeeTotal(p.supPrintFee, p.supPrintFeeApply, p.qty || 0);
            const supPackTotal = calcTempFeeTotal(p.supPackagingFee, p.supPackagingFeeApply, p.qty || 0);
            const supLabelTotal = calcTempFeeTotal(p.supLabelFee, p.supLabelFeeApply || '1개당', p.qty || 0);
            const supShipTotal = (p.supShippingFee || 0) * (p.supShippingBoxes || 0);
            const supFeeDetails = [
                supPrintTotal > 0 ? `인쇄 ${supPrintTotal.toLocaleString()}` : '',
                supPackTotal > 0 ? `포장 ${supPackTotal.toLocaleString()}` : '',
                supLabelTotal > 0 ? `라벨 ${supLabelTotal.toLocaleString()}` : '',
                supShipTotal > 0 ? `택배 ${supShipTotal.toLocaleString()}` : ''
            ].filter(Boolean);
            const supFeeBadge = supFeeDetails.length > 0 ? `<div style="margin-top:4px;font-size:10px;color:var(--text-tertiary);line-height:1.5">${supFeeDetails.map(f => '+' + f).join('<br>')}</div>` : '';

            rowHtml += `<td ${ce('item')} style="cursor:pointer">${p.item || '-'}</td>
            <td ${ce('unitPrice','number')} style="cursor:pointer">${p.unitPrice ? p.unitPrice.toLocaleString() + '원' : '-'}${vatBadge(p.unitPriceVat)}</td>
            <td ${ce('qty','number')} style="cursor:pointer">${p.qty ? p.qty.toLocaleString() : '-'}</td>
            <td>${revenueStr}${feeBadge}</td>
            <td ${ce('supplier')} style="cursor:pointer">${p.supplier || '-'}</td>
            <td ${ce('supplierContact')} style="cursor:pointer">${p.supplierContact || '-'}</td>
            <td ${ce('supplierUnitPrice','number')} style="cursor:pointer">${p.supplierUnitPrice ? p.supplierUnitPrice.toLocaleString() + '원' : '-'}${vatBadge(p.supplierUnitPriceVat)}</td>
            <td>${purchaseStr}${supFeeBadge}</td>
            <td>${marginStr}</td>
            <td style="white-space:nowrap">
                ${pi === 0 ? `<button class="edit-btn" onclick="openTempGroupEdit(${gi})" style="color:#1B64DA;margin-right:4px">편집</button>` : ''}
                ${pi === 0 ? `<button class="edit-btn" onclick="openTempQuote(${gi})" style="color:#16A34A;margin-right:4px">견적서</button>` : ''}
                <button class="edit-btn" onclick="deleteTempProject(${p.id})" style="color:var(--toss-red)">삭제</button>
            </td></tr>`;
        });

        // 그룹 내 품목 추가 인라인 행
        const gDate = (g.date || '').replace(/'/g, "\\'");
        const gClient = (g.client || '').replace(/'/g, "\\'");
        const gContact = (g.clientContact || '').replace(/'/g, "\\'");
        rowHtml += `<tr class="temp-group-add-row" data-group="${gi}" style="background:${bgColor}">
            <td><input id="tempGrpItem_${gi}" placeholder="품목 추가" style="padding:5px 8px;border:1.5px solid var(--gray-200);border-radius:8px;font-size:12px;width:100%;background:var(--white);font-family:inherit;color:var(--gray-900)"></td>
            <td><input id="tempGrpUnitPrice_${gi}" placeholder="매출단가" style="padding:5px 8px;border:1.5px solid var(--gray-200);border-radius:8px;font-size:12px;width:100%;background:var(--white);font-family:inherit;color:var(--gray-900);text-align:right" oninput="fmtCommaTemp(this)"></td>
            <td><input id="tempGrpQty_${gi}" placeholder="수량" style="padding:5px 8px;border:1.5px solid var(--gray-200);border-radius:8px;font-size:12px;width:100%;background:var(--white);font-family:inherit;color:var(--gray-900);text-align:right" oninput="fmtCommaTemp(this)"></td>
            <td></td>
            <td><input id="tempGrpSupplier_${gi}" list="tempClientList" placeholder="매입처" autocomplete="off" style="padding:5px 8px;border:1.5px solid var(--gray-200);border-radius:8px;font-size:12px;width:100%;background:var(--white);font-family:inherit;color:var(--gray-900)"></td>
            <td><input id="tempGrpSupContact_${gi}" placeholder="담당자" style="padding:5px 8px;border:1.5px solid var(--gray-200);border-radius:8px;font-size:12px;width:100%;background:var(--white);font-family:inherit;color:var(--gray-900)"></td>
            <td><input id="tempGrpSupUnitPrice_${gi}" placeholder="매입단가" style="padding:5px 8px;border:1.5px solid var(--gray-200);border-radius:8px;font-size:12px;width:100%;background:var(--white);font-family:inherit;color:var(--gray-900);text-align:right" oninput="fmtCommaTemp(this)"></td>
            <td></td>
            <td></td>
            <td><button class="btn-primary" onclick="saveTempGroupItem(${gi},'${gDate}','${gClient}','${gContact}')" style="padding:5px 12px;font-size:12px;white-space:nowrap">+ 추가</button></td>
        </tr>`;

        // 카드뷰 — 그룹 단위
        const totalRev = g.items.reduce((s, p) => s + calcTempRevenueWithVat(p), 0);
        const totalSup = g.items.reduce((s, p) => s + calcTempSupRevenueWithVat(p), 0);
        const totalMargin = totalRev - totalSup;
        const totalMarginPct = totalRev > 0 ? Math.round((totalMargin / totalRev) * 100) : 0;
        cardHtml += `<div class="resp-card" onclick="openTempProjectModal(${g.items[0].id})">
            <div class="resp-card-top">
                <div class="resp-card-title">${g.client || '-'}${g.clientContact ? ' · ' + g.clientContact : ''}</div>
                <span style="font-size:12px;color:var(--text-tertiary)">${dateStr}</span>
            </div>
            <div class="resp-card-meta">
                <div class="resp-card-row">${g.items.map(p => p.item).join(', ')}</div>
                <div class="resp-card-row" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
                    ${pill('#E8F4FD', '#1B64DA', totalRev.toLocaleString() + '원')}
                    ${totalSup > 0 ? pill('#FFF2E6', '#E67E22', totalSup.toLocaleString() + '원') : ''}
                    ${totalSup > 0 ? (totalMargin >= 0
                        ? pill('#E8F8EF', '#12B76A', totalMargin.toLocaleString() + '원 (' + totalMarginPct + '%)')
                        : pill('#FEECEC', '#E03131', totalMargin.toLocaleString() + '원 (' + totalMarginPct + '%)')) : ''}
                </div>
            </div>
        </div>`;
    });

    if (!rowHtml) {
        rowHtml = '<tr><td colspan="13" style="text-align:center;padding:40px;color:var(--text-tertiary)">등록된 견적 의뢰가 없습니다</td></tr>';
    }
    tbody.innerHTML = rowHtml;
    if (cardGrid) cardGrid.innerHTML = cardHtml;
}

function getTodayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function calcTempAmounts() {
    const price = Number((document.getElementById('tempUnitPrice').value || '').replace(/[^0-9]/g, '')) || 0;
    const supPrice = Number((document.getElementById('tempSupUnitPrice').value || '').replace(/[^0-9]/g, '')) || 0;
    const qty = Number((document.getElementById('tempQty').value || '').replace(/[^0-9]/g, '')) || 0;
    const revEl = document.getElementById('tempRevenue');
    const supRevEl = document.getElementById('tempSupRevenue');
    revEl.value = (price * qty) ? (price * qty).toLocaleString() : '';
    supRevEl.value = (supPrice * qty) ? (supPrice * qty).toLocaleString() : '';
}

function openTempProjectModal(id) {
    const p = id ? tempProjects.find(x => x.id === id) : null;
    const isEdit = !!p;
    const today = getTodayStr();

    const html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h2 style="margin:0;font-size:18px">${isEdit ? '견적 의뢰 편집' : '새 견적 의뢰'}</h2>
        <button onclick="closeTempModal()" style="background:var(--gray-100);border:none;font-size:20px;cursor:pointer;color:var(--gray-500);padding:6px 10px;border-radius:10px">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
        <div class="field"><label>날짜</label><input type="date" id="tempDate" value="${isEdit ? (p.date || today) : today}"></div>
        <div style="display:flex;gap:12px">
            <div class="field" style="flex:2"><label>매출처</label><input id="tempClient" list="tempClientList" autocomplete="off" value="${isEdit ? (p.client || '') : ''}" placeholder="매출처명"></div>
            <div class="field" style="flex:1"><label>담당자</label><input id="tempClientContact" value="${isEdit ? (p.clientContact || '') : ''}" placeholder="담당자명"></div>
        </div>
        <div class="field"><label>품목</label><input id="tempItem" value="${isEdit ? (p.item || '') : ''}" placeholder="품목명"></div>
        <div style="display:flex;gap:12px">
            <div class="field" style="flex:1"><label>매출단가</label><input id="tempUnitPrice" value="${isEdit ? (p.unitPrice || '') : ''}" placeholder="0" oninput="fmtCommaTemp(this);calcTempAmounts()"></div>
            <div class="field" style="flex:1"><label>매입단가</label><input id="tempSupUnitPrice" value="${isEdit ? (p.supplierUnitPrice || '') : ''}" placeholder="0" oninput="fmtCommaTemp(this);calcTempAmounts()"></div>
            <div class="field" style="flex:1"><label>수량</label><input id="tempQty" value="${isEdit ? (p.qty || '') : ''}" placeholder="0" oninput="fmtCommaTemp(this);calcTempAmounts()"></div>
        </div>
        <div style="display:flex;gap:12px">
            <div class="field" style="flex:1"><label>매출액</label><input id="tempRevenue" value="${isEdit ? (p.revenue || '') : ''}" placeholder="자동계산" readonly style="background:var(--gray-100);cursor:default"></div>
            <div class="field" style="flex:1"><label>매입액</label><input id="tempSupRevenue" value="${isEdit ? (p.supplierRevenue || '') : ''}" placeholder="자동계산" readonly style="background:var(--gray-100);cursor:default"></div>
        </div>
        <div style="display:flex;gap:12px">
            <div class="field" style="flex:2"><label>매입처</label><input id="tempSupplier" list="tempClientList" autocomplete="off" value="${isEdit ? (p.supplier || '') : ''}" placeholder="매입처명"></div>
            <div class="field" style="flex:1"><label>담당자</label><input id="tempSupContact" value="${isEdit ? (p.supplierContact || '') : ''}" placeholder="담당자명"></div>
        </div>
        <button class="btn-primary" onclick="saveTempProject(${id || 'null'})" style="width:100%;padding:14px;font-size:15px;margin-top:4px">
            ${isEdit ? '수정' : '저장'}
        </button>
    </div>`;

    let overlay = document.getElementById('tempModalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tempModalOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(4px)';
        overlay.addEventListener('click', e => { if (isBackdropClick(e, overlay)) closeTempModal(); });
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div style="background:var(--white);border-radius:20px;padding:28px;width:90%;max-width:480px;box-shadow:0 16px 48px rgba(0,0,0,.15)">${html}</div>`;
    overlay.style.display = 'flex';

    // 콤마 포맷 적용
    ['tempUnitPrice', 'tempSupUnitPrice', 'tempQty', 'tempRevenue', 'tempSupRevenue'].forEach(elId => {
        const el = document.getElementById(elId);
        if (el && el.value) el.value = Number(el.value).toLocaleString();
    });
}

function closeTempModal() {
    const overlay = document.getElementById('tempModalOverlay');
    if (overlay) overlay.style.display = 'none';
}

function fmtCommaTemp(el) {
    const raw = el.value.replace(/[^0-9]/g, '');
    el.value = raw ? Number(raw).toLocaleString() : '';
}

async function saveTempProject(id) {
    const date = document.getElementById('tempDate').value || getTodayStr();
    const client = document.getElementById('tempClient').value.trim();
    const clientContact = document.getElementById('tempClientContact').value.trim();
    const supplier = document.getElementById('tempSupplier').value.trim();
    const supplierContact = document.getElementById('tempSupContact').value.trim();
    const item = document.getElementById('tempItem').value.trim();
    const unitPrice = Number((document.getElementById('tempUnitPrice').value || '').replace(/[^0-9]/g, '')) || 0;
    const supplierUnitPrice = Number((document.getElementById('tempSupUnitPrice').value || '').replace(/[^0-9]/g, '')) || 0;
    const qty = Number((document.getElementById('tempQty').value || '').replace(/[^0-9]/g, '')) || 0;
    const revenue = unitPrice * qty;
    const supplierRevenue = supplierUnitPrice * qty;

    if (!client && !item) {
        showToast('매출처 또는 품목을 입력해주세요');
        return;
    }

    const row = { date, client, client_contact: clientContact, supplier, supplier_contact: supplierContact, item, unit_price: unitPrice, supplier_unit_price: supplierUnitPrice, qty, revenue, supplier_revenue: supplierRevenue };

    try {
        if (id) {
            const { error } = await sb.from('projects_temp').update(row).eq('id', id);
            if (error) throw error;
            const p = tempProjects.find(x => x.id === id);
            if (p) { p.date = date; p.client = client; p.clientContact = clientContact; p.supplier = supplier; p.supplierContact = supplierContact; p.item = item; p.unitPrice = unitPrice; p.supplierUnitPrice = supplierUnitPrice; p.qty = qty; p.revenue = revenue; p.supplierRevenue = supplierRevenue; }
            showToast('수정 완료');
        } else {
            const { data, error } = await sb.from('projects_temp').insert(row).select().single();
            if (error) throw error;
            tempProjects.unshift({ id: data.id, date, client, clientContact, supplier, supplierContact, item, unitPrice, supplierUnitPrice, qty, revenue, supplierRevenue });
            showToast('저장 완료');
        }
    } catch (err) {
        console.error('임시 프로젝트 저장 실패:', err);
        showToast('저장 실패: ' + err.message);
        return;
    }

    closeTempModal();
    renderTempProjects();
}

function buildTempClientDatalist() {
    let dl = document.getElementById('tempClientList');
    if (!dl) {
        dl = document.createElement('datalist');
        dl.id = 'tempClientList';
        document.body.appendChild(dl);
    }
    const names = clients
        .map(c => c.companyName)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort((a, b) => a.localeCompare(b));
    dl.innerHTML = names.map(n => `<option value="${n.replace(/"/g, '&quot;')}"></option>`).join('');
}

async function saveTempGroupItem(gi, date, client, clientContact) {
    const item = document.getElementById(`tempGrpItem_${gi}`).value.trim();
    const unitPrice = Number((document.getElementById(`tempGrpUnitPrice_${gi}`).value || '').replace(/[^0-9]/g, '')) || 0;
    const qty = Number((document.getElementById(`tempGrpQty_${gi}`).value || '').replace(/[^0-9]/g, '')) || 0;
    const supplier = document.getElementById(`tempGrpSupplier_${gi}`).value.trim();
    const supplierContact = document.getElementById(`tempGrpSupContact_${gi}`).value.trim();
    const supplierUnitPrice = Number((document.getElementById(`tempGrpSupUnitPrice_${gi}`).value || '').replace(/[^0-9]/g, '')) || 0;
    const revenue = unitPrice * qty;
    const supplierRevenue = supplierUnitPrice * qty;

    if (!item) { showToast('품목을 입력해주세요'); return; }

    const row = { date, client, client_contact: clientContact, supplier, supplier_contact: supplierContact, item, unit_price: unitPrice, supplier_unit_price: supplierUnitPrice, qty, revenue, supplier_revenue: supplierRevenue, unit_price_vat: 'VAT 별도', supplier_unit_price_vat: 'VAT 별도', print_fee: 0, packaging_fee: 0, label_fee: 0, shipping_fee: 0 };

    try {
        const { data, error } = await sb.from('projects_temp').insert(row).select().single();
        if (error) throw error;
        tempProjects.unshift({ id: data.id, date, client, clientContact, supplier, supplierContact, item, unitPrice, supplierUnitPrice, qty, revenue, supplierRevenue, unitPriceVat: 'VAT 별도', supplierUnitPriceVat: 'VAT 별도', printFee: 0, packagingFee: 0, labelFee: 0, shippingFee: 0 });
        showToast('추가 완료');
    } catch (err) {
        console.error('임시 프로젝트 저장 실패:', err);
        showToast('저장 실패: ' + err.message);
        return;
    }
    renderTempProjects();
}

// 그룹 내 인라인 행에서 Enter 키로 저장
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('.temp-group-add-row')) {
        e.preventDefault();
        const row = e.target.closest('.temp-group-add-row');
        row.querySelector('.btn-primary').click();
    }
});

function calcTempInline() {
    const price = Number((document.getElementById('tempInUnitPrice').value || '').replace(/[^0-9]/g, '')) || 0;
    const supPrice = Number((document.getElementById('tempInSupUnitPrice').value || '').replace(/[^0-9]/g, '')) || 0;
    const qty = Number((document.getElementById('tempInQty').value || '').replace(/[^0-9]/g, '')) || 0;
    const rev = price * qty;
    const supRev = supPrice * qty;
    const margin = rev - supRev;
    const pill = (bg, fg, text) => `<span style="display:inline-block;padding:4px 10px;border-radius:6px;background:${bg};color:${fg};font-weight:800;font-size:13px;white-space:nowrap">${text}</span>`;
    document.getElementById('tempInRevenue').innerHTML = rev ? pill('#E8F4FD', '#1B64DA', rev.toLocaleString() + '원') : '-';
    document.getElementById('tempInSupRevenue').innerHTML = supRev ? pill('#FFF2E6', '#E67E22', supRev.toLocaleString() + '원') : '-';
    if (rev && supRev) {
        const pct = Math.round((margin / rev) * 100);
        document.getElementById('tempInMargin').innerHTML = margin >= 0
            ? pill('#E8F8EF', '#12B76A', margin.toLocaleString() + '원 (' + pct + '%)')
            : pill('#FEECEC', '#E03131', margin.toLocaleString() + '원 (' + pct + '%)');
    } else {
        document.getElementById('tempInMargin').innerHTML = '-';
    }
}

async function saveTempInline() {
    const date = document.getElementById('tempInDate').value || getTodayStr();
    const client = document.getElementById('tempInClient').value.trim();
    const clientContact = document.getElementById('tempInClientContact').value.trim();
    const item = document.getElementById('tempInItem').value.trim();
    const unitPrice = Number((document.getElementById('tempInUnitPrice').value || '').replace(/[^0-9]/g, '')) || 0;
    const supplierUnitPrice = Number((document.getElementById('tempInSupUnitPrice').value || '').replace(/[^0-9]/g, '')) || 0;
    const qty = Number((document.getElementById('tempInQty').value || '').replace(/[^0-9]/g, '')) || 0;
    const supplier = document.getElementById('tempInSupplier').value.trim();
    const supplierContact = document.getElementById('tempInSupContact').value.trim();
    const revenue = unitPrice * qty;
    const supplierRevenue = supplierUnitPrice * qty;

    if (!client && !item) {
        showToast('매출처 또는 품목을 입력해주세요');
        return;
    }

    const row = { date, client, client_contact: clientContact, supplier, supplier_contact: supplierContact, item, unit_price: unitPrice, supplier_unit_price: supplierUnitPrice, qty, revenue, supplier_revenue: supplierRevenue, unit_price_vat: 'VAT 별도', supplier_unit_price_vat: 'VAT 별도', print_fee: 0, packaging_fee: 0, label_fee: 0, shipping_fee: 0 };

    try {
        const { data, error } = await sb.from('projects_temp').insert(row).select().single();
        if (error) throw error;
        tempProjects.unshift({ id: data.id, date, client, clientContact, supplier, supplierContact, item, unitPrice, supplierUnitPrice, qty, revenue, supplierRevenue, unitPriceVat: 'VAT 별도', supplierUnitPriceVat: 'VAT 별도', printFee: 0, packagingFee: 0, labelFee: 0, shippingFee: 0 });
        showToast('저장 완료');
    } catch (err) {
        console.error('임시 프로젝트 저장 실패:', err);
        showToast('저장 실패: ' + err.message);
        return;
    }

    // 인라인 입력 초기화 — 날짜·매출처·담당자는 유지 (같은 프로젝트에 품목 연속 추가용)
    document.getElementById('tempInItem').value = '';
    document.getElementById('tempInUnitPrice').value = '';
    document.getElementById('tempInSupUnitPrice').value = '';
    document.getElementById('tempInQty').value = '';
    document.getElementById('tempInSupplier').value = '';
    document.getElementById('tempInSupContact').value = '';
    document.getElementById('tempInRevenue').innerHTML = '-';
    document.getElementById('tempInSupRevenue').innerHTML = '-';
    document.getElementById('tempInMargin').innerHTML = '-';
    document.getElementById('tempInItem').focus();
    renderTempProjects();
}

// 인라인 입력에서 Enter 키로 저장
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('#tempInlineRow')) {
        e.preventDefault();
        saveTempInline();
    }
});

async function deleteTempProject(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
        const { error } = await sb.from('projects_temp').delete().eq('id', id);
        if (error) throw error;
        const idx = tempProjects.findIndex(x => x.id === id);
        if (idx >= 0) tempProjects.splice(idx, 1);
        showToast('삭제 완료');
        renderTempProjects();
    } catch (err) {
        console.error('임시 프로젝트 삭제 실패:', err);
        showToast('삭제 실패: ' + err.message);
    }
}

// =====================================
// 임시 프로젝트 견적서
// =====================================
// =====================================
// 임시 프로젝트 그룹 편집 모달 (VAT + 부대비용)
// =====================================
function calcTempFeeTotal(fee, apply, qty) {
    return (apply === '1개당') ? (fee || 0) * qty : (fee || 0);
}

// VAT 포함가 기준 매출액
function calcTempRevenueWithVat(p) {
    const qty = p.qty || 0;
    const addVat = (amount, vat) => vat === 'VAT 포함' ? amount : Math.round(amount * 1.1);
    let total = addVat((p.unitPrice || 0) * qty, p.unitPriceVat);
    total += addVat(calcTempFeeTotal(p.printFee, p.printFeeApply, qty), p.printFeeVat);
    total += addVat(calcTempFeeTotal(p.packagingFee, p.packagingFeeApply, qty), p.packagingFeeVat);
    total += addVat(calcTempFeeTotal(p.labelFee, p.labelFeeApply || '1개당', qty), p.labelFeeVat);
    total += addVat((p.shippingFee || 0) * (p.shippingBoxes || 0), p.shippingFeeVat);
    return total;
}

// VAT 포함가 기준 매입액
function calcTempSupRevenueWithVat(p) {
    const qty = p.qty || 0;
    const addVat = (amount, vat) => vat === 'VAT 포함' ? amount : Math.round(amount * 1.1);
    let total = addVat((p.supplierUnitPrice || 0) * qty, p.supplierUnitPriceVat);
    total += addVat(calcTempFeeTotal(p.supPrintFee, p.supPrintFeeApply, qty), p.supPrintFeeVat);
    total += addVat(calcTempFeeTotal(p.supPackagingFee, p.supPackagingFeeApply, qty), p.supPackagingFeeVat);
    total += addVat(calcTempFeeTotal(p.supLabelFee, p.supLabelFeeApply || '1개당', qty), p.supLabelFeeVat);
    total += addVat((p.supShippingFee || 0) * (p.supShippingBoxes || 0), p.supShippingFeeVat);
    return total;
}

function calcTempGroupRevenue(p) {
    const qty = p.qty || 0;
    return (p.unitPrice || 0) * qty
        + calcTempFeeTotal(p.printFee, p.printFeeApply, qty)
        + calcTempFeeTotal(p.packagingFee, p.packagingFeeApply, qty)
        + calcTempFeeTotal(p.labelFee, p.labelFeeApply || '1개당', qty)
        + (p.shippingFee || 0) * (p.shippingBoxes || 0);
}

function calcTempGroupSupRevenue(p) {
    const qty = p.qty || 0;
    return (p.supplierUnitPrice || 0) * qty
        + calcTempFeeTotal(p.supPrintFee, p.supPrintFeeApply, qty)
        + calcTempFeeTotal(p.supPackagingFee, p.supPackagingFeeApply, qty)
        + calcTempFeeTotal(p.supLabelFee, p.supLabelFeeApply || '1개당', qty)
        + (p.supShippingFee || 0) * (p.supShippingBoxes || 0);
}

// 기타 선택 시 커스텀 입력 토글
function toggleTempCustom(selectEl, inputId) {
    const inp = document.getElementById(inputId);
    if (inp) inp.style.display = selectEl.value === '기타' ? 'block' : 'none';
}

// 부대비용 실시간 토탈 계산
function recalcTempFeeRow(prefix, i, qty) {
    const getN = id => Number((document.getElementById(id)?.value || '').replace(/[^0-9]/g, '')) || 0;
    const getV = id => document.getElementById(id)?.value || '';

    // 인쇄
    const pf = getN(`${prefix}_pf_${i}`), pfa = getV(`${prefix}_pfa_${i}`);
    const pfT = pfa === '1개당' ? pf * qty : pf;
    const pfEl = document.getElementById(`${prefix}_pf_total_${i}`);
    if (pfEl) pfEl.textContent = pfT ? `= ${pfT.toLocaleString()}원` : '';

    // 포장
    const pkf = getN(`${prefix}_pkf_${i}`), pkfa = getV(`${prefix}_pkfa_${i}`);
    const pkfT = pkfa === '1개당' ? pkf * qty : pkf;
    const pkfEl = document.getElementById(`${prefix}_pkf_total_${i}`);
    if (pkfEl) pkfEl.textContent = pkfT ? `= ${pkfT.toLocaleString()}원` : '';

    // 라벨
    const lf = getN(`${prefix}_lf_${i}`), lfa = getV(`${prefix}_lfa_${i}`);
    const lfT = lfa === '1개당' ? lf * qty : lf;
    const lfEl = document.getElementById(`${prefix}_lf_total_${i}`);
    if (lfEl) lfEl.textContent = lfT ? `= ${lfT.toLocaleString()}원` : '';

    // 택배
    const sf = getN(`${prefix}_sf_${i}`), sb = getN(`${prefix}_sb_${i}`);
    const sfT = sf * sb;
    const sfEl = document.getElementById(`${prefix}_sf_total_${i}`);
    if (sfEl) sfEl.textContent = sfT ? `= ${sfT.toLocaleString()}원` : '';
}

function openTempGroupEdit(gi) {
    const g = tempGroups[gi];
    if (!g || !g.items.length) return;

    const vatOpts = v => `<option${v !== 'VAT 포함' ? ' selected' : ''}>VAT 별도</option><option${v === 'VAT 포함' ? ' selected' : ''}>VAT 포함</option>`;
    const fmtV = n => n ? Number(n).toLocaleString() : '';
    const IS = 'padding:8px 10px;border:1.5px solid var(--gray-200);border-radius:10px;font-size:13px;width:100%;background:var(--white);font-family:inherit;color:var(--gray-900)';
    const SS = 'padding:6px 8px;border:1.5px solid var(--gray-200);border-radius:10px;font-size:12px;background:var(--white);font-family:inherit;width:100%;color:var(--gray-900)';
    const LB = 'font-size:11px;color:var(--gray-500);font-weight:600;margin-bottom:2px';
    const printMethods = ['없음','레이저각인','실크인쇄','패드인쇄','UV인쇄','전사인쇄','기타'];
    const packMethods = ['기본박스','선물포장','전용케이스','전용보관함','에어캡','기타'];

    // 기타 포함 방법 옵션 (기존 목록에 없으면 기타로 표시)
    const printMethodOpts = (v) => {
        const isCustom = v && !printMethods.includes(v);
        return printMethods.map(m => `<option${(isCustom ? '기타' : (v||'없음'))===m?' selected':''}>${m}</option>`).join('');
    };
    const packMethodOpts = (v) => {
        const isCustom = v && !packMethods.includes(v);
        return packMethods.map(m => `<option${(isCustom ? '기타' : (v||'기본박스'))===m?' selected':''}>${m}</option>`).join('');
    };
    const customVal = (v, list) => (v && !list.includes(v)) ? v : '';
    const customDisplay = (v, list) => (v && !list.includes(v)) || v === '기타' ? 'block' : 'none';
    const RC = (prefix, i, qty) => `recalcTempFeeRow('${prefix}',${i},${qty})`;
    const TL = 'font-size:11px;font-weight:700;color:#1B64DA;margin-top:4px;min-height:16px';

    // 부대비용 섹션 HTML 헬퍼 (compact 2-col layout)
    // hideMethod=true 면 인쇄/포장 '방법' 필드를 생략하고 비용만 렌더 (매출/매입이 방법을 공유하기 위함)
    const feeSection = (prefix, i, data, qty, hideMethod) => `
        <div style="background:var(--white);border-radius:8px;padding:10px;margin-bottom:6px;border:1px solid var(--gray-200)">
            <div style="font-size:11px;font-weight:700;color:var(--gray-500);margin-bottom:6px">🖨 인쇄${hideMethod ? ' 비용' : ''}</div>
            ${hideMethod ? `
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;align-items:end">
                <div><label style="${LB}">금액</label><input id="${prefix}_pf_${i}" value="${fmtV(data.pf)}" placeholder="0" oninput="fmtCommaTemp(this);${RC(prefix,i,qty)}" style="${IS};text-align:right"></div>
                <div><label style="${LB}">적용</label><select id="${prefix}_pfa_${i}" style="${SS}" onchange="${RC(prefix,i,qty)}"><option${(data.pfa||'1개당')==='1개당'?' selected':''}>1개당</option><option${data.pfa==='일괄'?' selected':''}>일괄</option></select></div>
                <div><label style="${LB}">VAT</label><select id="${prefix}_pfv_${i}" style="${SS}">${vatOpts(data.pfv)}</select></div>
            </div>` : `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:end">
                <div><label style="${LB}">방법</label><select id="${prefix}_pm_${i}" style="${SS}" onchange="toggleTempCustom(this,'${prefix}_pmc_${i}')">${printMethodOpts(data.pm)}</select><input id="${prefix}_pmc_${i}" placeholder="직접 입력" value="${customVal(data.pm, printMethods)}" style="${IS};margin-top:4px;display:${customDisplay(data.pm, printMethods)}"></div>
                <div><label style="${LB}">금액</label><input id="${prefix}_pf_${i}" value="${fmtV(data.pf)}" placeholder="0" oninput="fmtCommaTemp(this);${RC(prefix,i,qty)}" style="${IS};text-align:right"></div>
                <div><label style="${LB}">적용</label><select id="${prefix}_pfa_${i}" style="${SS}" onchange="${RC(prefix,i,qty)}"><option${(data.pfa||'1개당')==='1개당'?' selected':''}>1개당</option><option${data.pfa==='일괄'?' selected':''}>일괄</option></select></div>
                <div><label style="${LB}">VAT</label><select id="${prefix}_pfv_${i}" style="${SS}">${vatOpts(data.pfv)}</select></div>
            </div>`}
            <div id="${prefix}_pf_total_${i}" style="${TL}"></div>
        </div>
        <div style="background:var(--white);border-radius:8px;padding:10px;margin-bottom:6px;border:1px solid var(--gray-200)">
            <div style="font-size:11px;font-weight:700;color:var(--gray-500);margin-bottom:6px">📦 포장${hideMethod ? ' 비용' : ''}</div>
            ${hideMethod ? `
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;align-items:end">
                <div><label style="${LB}">금액</label><input id="${prefix}_pkf_${i}" value="${fmtV(data.pkf)}" placeholder="0" oninput="fmtCommaTemp(this);${RC(prefix,i,qty)}" style="${IS};text-align:right"></div>
                <div><label style="${LB}">적용</label><select id="${prefix}_pkfa_${i}" style="${SS}" onchange="${RC(prefix,i,qty)}"><option${(data.pkfa||'일괄')==='1개당'?' selected':''}>1개당</option><option${(data.pkfa||'일괄')==='일괄'?' selected':''}>일괄</option></select></div>
                <div><label style="${LB}">VAT</label><select id="${prefix}_pkfv_${i}" style="${SS}">${vatOpts(data.pkfv)}</select></div>
            </div>` : `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:end">
                <div><label style="${LB}">방법</label><select id="${prefix}_pkm_${i}" style="${SS}" onchange="toggleTempCustom(this,'${prefix}_pkmc_${i}')">${packMethodOpts(data.pkm)}</select><input id="${prefix}_pkmc_${i}" placeholder="직접 입력" value="${customVal(data.pkm, packMethods)}" style="${IS};margin-top:4px;display:${customDisplay(data.pkm, packMethods)}"></div>
                <div><label style="${LB}">금액</label><input id="${prefix}_pkf_${i}" value="${fmtV(data.pkf)}" placeholder="0" oninput="fmtCommaTemp(this);${RC(prefix,i,qty)}" style="${IS};text-align:right"></div>
                <div><label style="${LB}">적용</label><select id="${prefix}_pkfa_${i}" style="${SS}" onchange="${RC(prefix,i,qty)}"><option${(data.pkfa||'일괄')==='1개당'?' selected':''}>1개당</option><option${(data.pkfa||'일괄')==='일괄'?' selected':''}>일괄</option></select></div>
                <div><label style="${LB}">VAT</label><select id="${prefix}_pkfv_${i}" style="${SS}">${vatOpts(data.pkfv)}</select></div>
            </div>`}
            <div id="${prefix}_pkf_total_${i}" style="${TL}"></div>
        </div>
        <div style="background:var(--white);border-radius:8px;padding:10px;margin-bottom:6px;border:1px solid var(--gray-200)">
            <div style="font-size:11px;font-weight:700;color:var(--gray-500);margin-bottom:6px">🏷 라벨</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;align-items:end">
                <div><label style="${LB}">단가</label><input id="${prefix}_lf_${i}" value="${fmtV(data.lf)}" placeholder="0" oninput="fmtCommaTemp(this);${RC(prefix,i,qty)}" style="${IS};text-align:right"></div>
                <div><label style="${LB}">적용</label><select id="${prefix}_lfa_${i}" style="${SS}" onchange="${RC(prefix,i,qty)}"><option${(data.lfa||'1개당')==='1개당'?' selected':''}>1개당</option><option${data.lfa==='일괄'?' selected':''}>일괄</option></select></div>
                <div><label style="${LB}">VAT</label><select id="${prefix}_lfv_${i}" style="${SS}">${vatOpts(data.lfv)}</select></div>
            </div>
            <div id="${prefix}_lf_total_${i}" style="${TL}"></div>
        </div>
        <div style="background:var(--white);border-radius:8px;padding:10px;margin-bottom:6px;border:1px solid var(--gray-200)">
            <div style="font-size:11px;font-weight:700;color:var(--gray-500);margin-bottom:6px">🚚 택배</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;align-items:end">
                <div><label style="${LB}">박스수</label><input id="${prefix}_sb_${i}" value="${data.sb || ''}" placeholder="0" oninput="fmtCommaTemp(this);${RC(prefix,i,qty)}" style="${IS};text-align:right"></div>
                <div><label style="${LB}">박스당 단가</label><input id="${prefix}_sf_${i}" value="${fmtV(data.sf)}" placeholder="0" oninput="fmtCommaTemp(this);${RC(prefix,i,qty)}" style="${IS};text-align:right"></div>
                <div><label style="${LB}">VAT</label><select id="${prefix}_sfv_${i}" style="${SS}">${vatOpts(data.sfv)}</select></div>
            </div>
            <div id="${prefix}_sf_total_${i}" style="${TL}"></div>
        </div>`;

    const secStyle = (color, bg) => `border-left:3px solid ${color};background:${bg};border-radius:10px;padding:14px;margin-bottom:10px`;

    let itemsHtml = g.items.map((p, i) => `
    <div style="background:var(--gray-50);border-radius:14px;padding:16px;margin-bottom:14px">
        <div style="font-weight:700;font-size:15px;margin-bottom:14px;color:var(--gray-900)">${p.item || '품목 ' + (i + 1)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <!-- 매출 -->
            <div style="${secStyle('#1B64DA', 'rgba(27,100,218,0.05)')}">
                <div style="font-size:13px;font-weight:800;color:#1B64DA;margin-bottom:10px">매출</div>
                <div style="display:grid;grid-template-columns:1fr auto;gap:6px;align-items:end;margin-bottom:10px">
                    <div><label style="${LB}">단가</label><input id="tge_up_${i}" value="${fmtV(p.unitPrice)}" placeholder="0" oninput="fmtCommaTemp(this)" style="${IS};text-align:right"></div>
                    <div><label style="${LB}">VAT</label><select id="tge_upv_${i}" style="${SS}">${vatOpts(p.unitPriceVat)}</select></div>
                </div>
                ${feeSection('tge', i, { pm: p.printMethod, pf: p.printFee, pfa: p.printFeeApply, pfv: p.printFeeVat, pkm: p.packMethod, pkf: p.packagingFee, pkfa: p.packagingFeeApply, pkfv: p.packagingFeeVat, lf: p.labelFee, lfa: p.labelFeeApply, lfv: p.labelFeeVat, sb: p.shippingBoxes, sf: p.shippingFee, sfv: p.shippingFeeVat }, p.qty || 0)}
            </div>
            <!-- 매입 -->
            <div style="${secStyle('#E67E22', 'rgba(230,126,34,0.05)')}">
                <div style="font-size:13px;font-weight:800;color:#E67E22;margin-bottom:10px">매입</div>
                <div style="display:grid;grid-template-columns:1fr auto;gap:6px;align-items:end;margin-bottom:10px">
                    <div><label style="${LB}">단가</label><input id="tge_sup_${i}" value="${fmtV(p.supplierUnitPrice)}" placeholder="0" oninput="fmtCommaTemp(this)" style="${IS};text-align:right"></div>
                    <div><label style="${LB}">VAT</label><select id="tge_supv_${i}" style="${SS}">${vatOpts(p.supplierUnitPriceVat)}</select></div>
                </div>
                ${feeSection('tgs', i, { pm: p.supPrintMethod, pf: p.supPrintFee, pfa: p.supPrintFeeApply, pfv: p.supPrintFeeVat, pkm: p.supPackMethod, pkf: p.supPackagingFee, pkfa: p.supPackagingFeeApply, pkfv: p.supPackagingFeeVat, lf: p.supLabelFee, lfa: p.supLabelFeeApply, lfv: p.supLabelFeeVat, sb: p.supShippingBoxes, sf: p.supShippingFee, sfv: p.supShippingFeeVat }, p.qty || 0, true)}
            </div>
        </div>
    </div>`).join('');

    const html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 style="margin:0;font-size:17px">${g.client || '-'} · ${(g.date || '').replace(/-/g, '.')} 상세 편집</h2>
        <button onclick="closeTempModal()" style="background:var(--gray-100);border:none;font-size:20px;cursor:pointer;color:var(--gray-500);padding:6px 10px;border-radius:10px">✕</button>
    </div>
    ${itemsHtml}
    <div style="background:var(--gray-50);border-radius:14px;padding:16px;margin-bottom:14px">
        <div style="font-weight:700;font-size:14px;margin-bottom:10px;color:var(--gray-900)">견적서 비고</div>
        <textarea id="tge_quoteNote" rows="4" onkeydown="handleQuoteNoteKey(event)" onfocus="handleQuoteNoteFocus(event)" style="${IS};resize:vertical;min-height:80px;line-height:1.6">${g.quoteNote || '• 본 견적은 유효기간 내에만 유효하며, 자재·환율 변동 시 조정될 수 있습니다.\n• 제품은 선입금 50% 확인 후 제작되며, 잔금 결제 확인 후 출고됩니다.'}</textarea>
    </div>
    <button class="btn-primary" onclick="saveTempGroupEdit(${gi})" style="width:100%;padding:14px;font-size:15px;margin-top:4px">저장</button>`;

    let overlay = document.getElementById('tempModalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tempModalOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(4px)';
        overlay.addEventListener('click', e => { if (isBackdropClick(e, overlay)) closeTempModal(); });
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div style="background:var(--white);border-radius:20px;padding:28px;width:95%;max-width:960px;max-height:85vh;overflow-y:auto;box-shadow:0 16px 48px rgba(0,0,0,.15)">${html}</div>`;
    overlay.style.display = 'flex';

    // 초기 토탈 계산
    g.items.forEach((p, i) => {
        recalcTempFeeRow('tge', i, p.qty || 0);
        recalcTempFeeRow('tgs', i, p.qty || 0);
    });
}

// 견적서 비고 textarea — Enter 키로 자동 bullet 줄바꿈, 빈 상태 포커스 시 bullet prepend
function handleQuoteNoteKey(ev) {
    if (ev.key !== 'Enter' || ev.shiftKey) return;
    ev.preventDefault();
    const ta = ev.target;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const insert = '\n• ';
    ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
    const pos = start + insert.length;
    ta.selectionStart = ta.selectionEnd = pos;
}
function handleQuoteNoteFocus(ev) {
    const ta = ev.target;
    if (!ta.value.trim()) {
        ta.value = '• ';
        ta.selectionStart = ta.selectionEnd = ta.value.length;
    }
}

async function saveTempGroupEdit(gi) {
    const g = tempGroups[gi];
    if (!g) return;

    const getNum = id => Number((document.getElementById(id)?.value || '').replace(/[^0-9]/g, '')) || 0;
    const getVal = id => document.getElementById(id)?.value || '';

    const quoteNote = document.getElementById('tge_quoteNote')?.value || '';

    for (let i = 0; i < g.items.length; i++) {
        const p = g.items[i];
        p.quoteNote = quoteNote;

        // 단가
        p.unitPrice = getNum(`tge_up_${i}`);
        p.unitPriceVat = getVal(`tge_upv_${i}`);
        p.supplierUnitPrice = getNum(`tge_sup_${i}`);
        p.supplierUnitPriceVat = getVal(`tge_supv_${i}`);

        // 인쇄 (기타 시 커스텀 값)
        p.printMethod = getVal(`tge_pm_${i}`) === '기타' ? (getVal(`tge_pmc_${i}`) || '기타') : getVal(`tge_pm_${i}`);
        p.printFee = getNum(`tge_pf_${i}`);
        p.printFeeApply = getVal(`tge_pfa_${i}`);
        p.printFeeVat = getVal(`tge_pfv_${i}`);

        // 포장 (기타 시 커스텀 값)
        p.packMethod = getVal(`tge_pkm_${i}`) === '기타' ? (getVal(`tge_pkmc_${i}`) || '기타') : getVal(`tge_pkm_${i}`);
        p.packagingFee = getNum(`tge_pkf_${i}`);
        p.packagingFeeApply = getVal(`tge_pkfa_${i}`);
        p.packagingFeeVat = getVal(`tge_pkfv_${i}`);

        // 라벨
        p.labelFee = getNum(`tge_lf_${i}`);
        p.labelFeeApply = getVal(`tge_lfa_${i}`);
        p.labelFeeVat = getVal(`tge_lfv_${i}`);

        // 택배
        p.shippingBoxes = getNum(`tge_sb_${i}`);
        p.shippingFee = getNum(`tge_sf_${i}`);
        p.shippingFeeVat = getVal(`tge_sfv_${i}`);

        // 매입 부대비용 — 방법은 매출(tge)에서 복사, 비용만 tgs 에서 읽음
        p.supPrintMethod = p.printMethod;
        p.supPrintFee = getNum(`tgs_pf_${i}`);
        p.supPrintFeeApply = getVal(`tgs_pfa_${i}`);
        p.supPrintFeeVat = getVal(`tgs_pfv_${i}`);
        p.supPackMethod = p.packMethod;
        p.supPackagingFee = getNum(`tgs_pkf_${i}`);
        p.supPackagingFeeApply = getVal(`tgs_pkfa_${i}`);
        p.supPackagingFeeVat = getVal(`tgs_pkfv_${i}`);
        p.supLabelFee = getNum(`tgs_lf_${i}`);
        p.supLabelFeeApply = getVal(`tgs_lfa_${i}`);
        p.supLabelFeeVat = getVal(`tgs_lfv_${i}`);
        p.supShippingBoxes = getNum(`tgs_sb_${i}`);
        p.supShippingFee = getNum(`tgs_sf_${i}`);
        p.supShippingFeeVat = getVal(`tgs_sfv_${i}`);

        // 매출액/매입액 재계산
        p.revenue = calcTempGroupRevenue(p);
        p.supplierRevenue = calcTempGroupSupRevenue(p);

        const dbRow = {
            unit_price: p.unitPrice,
            unit_price_vat: p.unitPriceVat,
            supplier_unit_price: p.supplierUnitPrice,
            supplier_unit_price_vat: p.supplierUnitPriceVat,
            print_method: p.printMethod,
            print_fee: p.printFee,
            print_fee_apply: p.printFeeApply,
            print_fee_vat: p.printFeeVat,
            pack_method: p.packMethod,
            packaging_fee: p.packagingFee,
            packaging_fee_apply: p.packagingFeeApply,
            packaging_fee_vat: p.packagingFeeVat,
            label_fee: p.labelFee,
            label_fee_apply: p.labelFeeApply,
            label_fee_vat: p.labelFeeVat,
            shipping_boxes: p.shippingBoxes,
            shipping_fee: p.shippingFee,
            shipping_fee_vat: p.shippingFeeVat,
            sup_print_method: p.supPrintMethod,
            sup_print_fee: p.supPrintFee,
            sup_print_fee_apply: p.supPrintFeeApply,
            sup_print_fee_vat: p.supPrintFeeVat,
            sup_pack_method: p.supPackMethod,
            sup_packaging_fee: p.supPackagingFee,
            sup_packaging_fee_apply: p.supPackagingFeeApply,
            sup_packaging_fee_vat: p.supPackagingFeeVat,
            sup_label_fee: p.supLabelFee,
            sup_label_fee_apply: p.supLabelFeeApply,
            sup_label_fee_vat: p.supLabelFeeVat,
            sup_shipping_boxes: p.supShippingBoxes,
            sup_shipping_fee: p.supShippingFee,
            sup_shipping_fee_vat: p.supShippingFeeVat,
            revenue: p.revenue,
            supplier_revenue: p.supplierRevenue,
            quote_note: p.quoteNote
        };

        // Supabase JS 클라이언트는 에러를 throw 하지 않고 { data, error } 로 반환함.
        // try/catch 가 아니라 error 를 직접 확인해야 함.
        const { error } = await sb.from('projects_temp').update(dbRow).eq('id', p.id);
        if (error) {
            console.error('저장 실패 (id=' + p.id + '):', error);
            showToast('저장 실패: ' + (error.message || '알 수 없는 오류') + (error.hint ? ' — ' + error.hint : ''));
            return;
        }
    }

    showToast('저장 완료');
    closeTempModal();
    renderTempProjects();
}

let _tempQuoteGroup = null;

function _qRowTemp(k, v, first, last) {
    const bt = first ? '' : 'border-top:1px solid #eef0f5;';
    const bb = last ? '' : 'border-bottom:1px solid #eef0f5;';
    return `<tr><td style="padding:5px 10px;background:#f5f7fa;font-weight:700;color:#4a5568;width:72px;text-align:center;border-right:1px solid #e2e6ee;${bt}${bb}">${k}</td><td style="padding:5px 10px;color:#1a1d29;${bt}${bb}">${v}</td></tr>`;
}

function fmtNTemp(n) { return (n || 0).toLocaleString(); }

function numToKoreanAmountTemp(n) {
    if (!n || n <= 0) return '';
    const units = ['', '만', '억', '조'];
    const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const subs = ['', '천', '백', '십'];
    let result = '', num = Math.floor(n);
    for (let i = 0; num > 0 && i < units.length; i++) {
        const part = num % 10000; num = Math.floor(num / 10000);
        if (part === 0) continue;
        let partStr = '';
        let p = part;
        for (let j = 0; j < 4; j++) {
            const d = p % 10; p = Math.floor(p / 10);
            if (d === 0) continue;
            partStr = (d === 1 && j > 0 ? '' : digits[d]) + subs[j] + partStr;
        }
        result = partStr + units[i] + result;
    }
    return '일금 ' + result + '원정 (￦' + fmtNTemp(Math.floor(n)) + ')';
}

function openTempQuote(gi) {
    const g = tempGroups[gi];
    if (!g || !g.items.length) return;
    _tempQuoteGroup = g;
    renderTempQuoteDoc(g);
    document.getElementById('tempQuoteOverlay').style.display = 'block';
}

function closeTempQuote() {
    document.getElementById('tempQuoteOverlay').style.display = 'none';
    _tempQuoteGroup = null;
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('tempQuoteOverlay').style.display !== 'none') closeTempQuote();
});

function renderTempQuoteDoc(g) {
    const items = g.items;
    const dateStr = g.date || '';
    const fmtDate = d => d ? d.replace(/-/g, '.') : '';
    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // 품목별 계산 (VAT 포함/별도 반영)
    let totalSup = 0, totalVat = 0;
    const ic = 'padding:10px 6px;border-bottom:1px solid #eef0f5;text-align:right;color:#0B4F8F;font-weight:700';
    const icSub = 'padding:6px 12px;border-bottom:1px solid #eef0f5;color:#4a5568;font-size:10px';
    const itemRows = items.map(p => {
        const rawProd = (p.unitPrice || 0) * (p.qty || 0);
        let prodT, prodV;
        if (p.unitPriceVat === 'VAT 포함') {
            prodT = Math.round(rawProd / 1.1);
            prodV = rawProd - prodT;
        } else {
            prodT = rawProd;
            prodV = Math.round(prodT * 0.1);
        }
        totalSup += prodT;
        totalVat += prodV;

        let rows = `<tr>
            <td style="padding:10px 12px;border-bottom:1px solid #eef0f5;font-weight:700;color:#1a1d29;font-size:11px">${esc(p.item || '')}${p.unitPriceVat === 'VAT 포함' ? ' <span style="font-size:9px;color:#888">(VAT포함)</span>' : ''}</td>
            <td style="${ic}">${fmtNTemp(p.qty || 0)}</td>
            <td style="${ic}">${fmtNTemp(p.unitPrice || 0)}</td>
            <td style="${ic}">${fmtNTemp(prodT)}</td>
            <td style="${ic}">${fmtNTemp(prodV)}</td>
        </tr>`;

        // 부대비용 행
        // 인쇄/포장은 "방법"이 유의미하면 0원이어도 견적서에 표시 (인쇄 '없음' / 포장 '기본박스'는 제외)
        // 라벨/택배는 방법 개념이 없으므로 금액 > 0 인 경우만 표시
        const qty = p.qty || 0;
        const hasPrintMethod = !!p.printMethod && p.printMethod !== '없음';
        const hasPackMethod  = !!p.packMethod  && p.packMethod !== '기본박스';
        const fees = [
            { name: '인쇄비' + (hasPrintMethod ? ' (' + p.printMethod + ')' : ''), unitVal: p.printFee || 0, apply: p.printFeeApply || '1개당', vat: p.printFeeVat, show: hasPrintMethod || (p.printFee || 0) > 0 },
            { name: '포장비' + (hasPackMethod ? ' (' + p.packMethod + ')' : ''),    unitVal: p.packagingFee || 0, apply: p.packagingFeeApply || '일괄', vat: p.packagingFeeVat, show: hasPackMethod || (p.packagingFee || 0) > 0 },
            { name: '라벨비', unitVal: p.labelFee || 0, apply: p.labelFeeApply || '1개당', vat: p.labelFeeVat, show: (p.labelFee || 0) > 0 },
            { name: '택배비', unitVal: p.shippingFee || 0, apply: '박스', fQtyOverride: p.shippingBoxes || 0, vat: p.shippingFeeVat, show: (p.shippingFee || 0) > 0 }
        ].filter(f => f.show);

        fees.forEach(f => {
            const fQty = f.fQtyOverride !== undefined ? f.fQtyOverride : (f.apply === '1개당' ? qty : 1);
            const fTotal = f.unitVal * fQty;
            let fSup, fV;
            if (f.vat === 'VAT 포함') {
                fSup = Math.round(fTotal / 1.1);
                fV = fTotal - fSup;
            } else {
                fSup = fTotal;
                fV = Math.round(fTotal * 0.1);
            }
            totalSup += fSup;
            totalVat += fV;
            // 견적서에는 '1개당' / '일괄' 라벨 숨김 — 수량 컬럼으로 충분히 파악 가능
            // 택배의 '박스' 단위만 유지 (수량 단위가 개와 다르므로 명시 필요)
            const applyLabel = f.apply === '박스' ? ' <span style="font-size:9px;color:#888">' + fQty + '박스</span>' : '';
            rows += `<tr>
                <td style="${icSub}">　└ ${f.name}${applyLabel}${f.vat === 'VAT 포함' ? ' <span style="color:#E67E22">(포함)</span>' : ''}</td>
                <td style="${icSub};text-align:right">${fQty}</td>
                <td style="${icSub};text-align:right">${fmtNTemp(f.unitVal)}</td>
                <td style="${icSub};text-align:right">${fmtNTemp(fSup)}</td>
                <td style="${icSub};text-align:right">${fmtNTemp(fV)}</td>
            </tr>`;
        });

        return rows;
    }).join('');

    const grand = totalSup + totalVat;
    const koreanAmt = numToKoreanAmountTemp(grand);

    const headCell = 'background:#f5f7fa;color:#4a5568;padding:8px 6px;font-weight:700;font-size:10px;letter-spacing:.5px;border-bottom:1px solid #d5dae3';

    const manager = currentUser ? currentUser.name : '';

    document.getElementById('tempQuoteDocEl').innerHTML =
    `<div id="tempQuoteDocInner" style="width:794px;height:1123px;overflow:hidden;background:#fff;font-family:'Noto Sans KR',sans-serif;color:#1a1d29;position:relative;padding:30px 44px 22px;box-sizing:border-box;display:flex;flex-direction:column">
    <!-- 상단 -->
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding-bottom:8px;border-bottom:2px solid #0B4F8F;margin-bottom:10px;gap:14px">
      <div></div>
      <div style="text-align:center">
        <div style="font-family:serif;font-size:10px;color:#C8A35B;letter-spacing:5px;font-weight:700;margin-bottom:2px">ESTIMATE / QUOTATION</div>
        <div style="font-size:32px;font-weight:900;color:#0B4F8F;letter-spacing:14px;padding-left:14px;display:inline-block;line-height:1.1">견 적 서</div>
      </div>
      <div style="text-align:right;font-size:9.5px;color:#666;line-height:1.6;white-space:nowrap">
        발행일 <b style="color:#0B4F8F">${fmtDate(dateStr)}</b>
      </div>
    </div>
    <!-- 수신/공급자 -->
    <div style="display:flex;gap:10px;margin-bottom:12px">
      <div style="flex:1;border:1px solid #d5dae3;border-radius:8px;overflow:hidden;background:#fff">
        <div style="background:#0B4F8F;color:#fff;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:2px">수 신 · TO</div>
        <table style="width:100%;border-collapse:collapse;font-size:10.5px">
          ${_qRowTemp('거래처', '<b>' + esc(g.client || '') + '</b>', true)}
          ${_qRowTemp('담당자', esc(g.clientContact || ''))}
          ${_qRowTemp('TEL/FAX', '')}
          ${_qRowTemp('결제조건', '')}
          ${_qRowTemp('유효기간', '<span style="color:#c03545;font-weight:700">발행후 7일간 유효합니다</span>', false, true)}
        </table>
        <div style="padding:7px 12px;background:#f9fafc;border-top:1px solid #eef0f5;font-size:10px;color:#555;line-height:1.6">1. 귀사의 일익 번창하심을 기원합니다.<br>2. 하기와 같이 견적드리오니 검토 부탁드립니다.</div>
      </div>
      <div style="flex:1;border:1px solid #d5dae3;border-radius:8px;overflow:hidden;background:#fff">
        <div style="background:linear-gradient(135deg,#2B3856,#0B4F8F);color:#fff;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:2px">공급자 · FROM</div>
        <div style="padding:10px 10px 8px;background:#fff;border-bottom:1px solid #eef0f5;text-align:center">
          <img src="${typeof LOGO_DARK !== 'undefined' ? LOGO_DARK : ''}" style="height:24px">
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:10.5px">
          ${_qRowTemp('사업자번호', '114-81-93170')}
          ${_qRowTemp('대표자', `<span style="position:relative;display:inline-block">김관택<img src="${typeof STAMP !== 'undefined' ? STAMP : ''}" style="position:absolute;left:40px;top:-8px;width:46px;height:46px;object-fit:contain;pointer-events:none;mix-blend-mode:multiply;z-index:2"></span>`)}
          ${_qRowTemp('주 소', '<span style="font-size:9.5px;line-height:1.4">서울 구로구 디지털로32길 30,<br>코오롱빌란트1차 901호</span>')}
          ${_qRowTemp('업태/종목', '<span style="font-size:9.5px">제조·도매 / 시계 판촉물</span>')}
          ${_qRowTemp('담 당 자', esc(manager))}
          ${_qRowTemp('TEL/FAX', '02-2103-5757', false, true)}
        </table>
      </div>
    </div>
    <!-- 금액 바 -->
    <div style="background:linear-gradient(135deg,#0B4F8F 0%,#1a6bb0 100%);color:#fff;padding:14px 20px;border-radius:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 12px rgba(11,79,143,.18)">
      <div>
        <div style="font-size:10px;letter-spacing:3px;font-weight:600;color:rgba(255,255,255,.85);margin-bottom:3px">TOTAL AMOUNT</div>
        <div style="font-size:15px;font-weight:800;letter-spacing:.5px">${koreanAmt}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:900;letter-spacing:.5px">￦ ${fmtNTemp(grand)}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.8);margin-top:1px">부가세 포함가</div>
      </div>
    </div>
    <!-- 품목 테이블 -->
    <div style="border:1px solid #d5dae3;border-radius:8px 8px 0 0;overflow:hidden;background:#fff;flex:1;display:flex;flex-direction:column">
      <table style="width:100%;border-collapse:collapse;font-size:10.5px">
        <thead><tr>
          <th style="${headCell};text-align:left;padding-left:12px">품 명 및 규 격</th>
          <th style="${headCell};width:54px">수 량</th>
          <th style="${headCell};width:96px">단 가</th>
          <th style="${headCell};width:108px">공 급 가 액</th>
          <th style="${headCell};width:96px">부 가 세</th>
        </tr></thead>
        <tbody>
          ${itemRows}
          <tr><td colspan="5" style="background:#f5f7fa;text-align:center;font-weight:700;color:#4a5568;font-size:10.5px;padding:6px">- 이 하 여 백 -</td></tr>
        </tbody>
      </table>
    </div>
    <!-- 합계 -->
    <div style="display:flex;border:1px solid #d5dae3;border-top:2px solid #0B4F8F;border-radius:0 0 8px 8px;overflow:hidden;background:#f5f7fa">
      <div style="flex:1;padding:10px 14px;border-right:1px solid #e2e6ee"><div style="font-size:9px;font-weight:700;color:#6b7280;letter-spacing:2px">공급가액 · SUBTOTAL</div><div style="font-size:15px;font-weight:800;color:#1a1d29;margin-top:2px">${fmtNTemp(totalSup)}</div></div>
      <div style="flex:1;padding:10px 14px;border-right:1px solid #e2e6ee"><div style="font-size:9px;font-weight:700;color:#6b7280;letter-spacing:2px">부가세 · VAT</div><div style="font-size:15px;font-weight:800;color:#1a1d29;margin-top:2px">${fmtNTemp(totalVat)}</div></div>
      <div style="flex:1;padding:10px 14px;background:#0B4F8F;color:#fff"><div style="font-size:9px;font-weight:700;color:rgba(255,255,255,.8);letter-spacing:2px">합 계 · TOTAL</div><div style="font-size:18px;font-weight:800;color:#fff;margin-top:2px">${fmtNTemp(grand)}</div></div>
    </div>
    <!-- 비고 -->
    <div style="display:flex;border:1px solid #d5dae3;border-radius:8px;overflow:hidden;margin-top:10px;background:#fff">
      <div style="background:#f5f7fa;padding:10px 14px;font-weight:700;font-size:10.5px;color:#4a5568;border-right:1px solid #e2e6ee;display:flex;align-items:center;min-width:60px">비 고</div>
      <div style="padding:10px 14px;flex:1;font-size:10px;color:#666;min-height:36px;line-height:1.6;white-space:pre-line">${esc(g.quoteNote || '• 본 견적은 유효기간 내에만 유효하며, 자재·환율 변동 시 조정될 수 있습니다.\n• 제품은 선입금 50% 확인 후 제작되며, 잔금 결제 확인 후 출고됩니다.')}</div>
    </div>
    <!-- 푸터 -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid #e2e6ee;font-size:9px;color:#888">
      <div>시계전문몰 <span style="color:#0B4F8F;font-weight:600">www.showroom.co.kr</span> &nbsp;·&nbsp; 판촉용품몰 <span style="color:#0B4F8F;font-weight:600">www.agift.kr</span></div>
      <div style="color:#c03545;font-weight:700">klpkorea@agift.kr</div>
    </div>
    </div>`;
}

async function dlTempQuote(type) {
    if (!_tempQuoteGroup) return;
    const el = document.getElementById('tempQuoteDocEl');
    const b1 = document.getElementById('btnTempQuoteJpg');
    const b2 = document.getElementById('btnTempQuotePdf');
    b1.disabled = b2.disabled = true;
    b1.textContent = '생성 중...';
    b2.textContent = '생성 중...';
    try {
        const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: '#fff', logging: false, width: 794, height: 1123, windowWidth: 794, windowHeight: 1123 });
        const dateP = (_tempQuoteGroup.date || '').replace(/-/g, '');
        const fname = dateP + '_케이엘피코리아_' + (_tempQuoteGroup.client || '업체') + '_견적서';
        if (type === 'jpg') {
            const a = document.createElement('a');
            a.download = fname + '.jpg';
            a.href = canvas.toDataURL('image/jpeg', 0.92);
            a.click();
        } else {
            const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pw = pdf.internal.pageSize.getWidth();
            const ph = pdf.internal.pageSize.getHeight();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pw, ph);
            pdf.save(fname + '.pdf');
        }
    } catch (err) {
        alert('오류: ' + err.message);
    }
    b1.disabled = b2.disabled = false;
    b1.textContent = 'JPG 다운로드';
    b2.textContent = 'PDF 다운로드';
}

// ===== 프로젝트 (계획/협업) — localStorage 프로토타입 =====
const PLANNING_STORAGE_KEY = 'klp_planning_projects';
const PLANNING_CATEGORIES = [
    { key: 'propose',  label: '제안',   icon: '💡', bg: '#EFF6FF', fg: '#2563EB' },
    { key: 'research', label: '조사',   icon: '🔍', bg: '#F5F3FF', fg: '#7C3AED' },
    { key: 'material', label: '자료',   icon: '📎', bg: '#ECFDF5', fg: '#059669' },
    { key: 'urgent',   label: '긴급',   icon: '🔴', bg: '#FEF2F2', fg: '#DC2626' },
    { key: 'normal',   label: '보통',   icon: '🟢', bg: '#F0FDF4', fg: '#16A34A' }
];
const PLANNING_CATEGORY_TO_PRIORITY = {
    urgent: '🔴 긴급',
    normal: '🟢 보통',
    propose: '🟡 보통',
    research: '🟡 보통',
    material: '🟡 보통'
};
const PLANNING_STATUSES = ['진행 중', '보류', '완료'];
const PLANNING_PERIODS = [
    { key: 'week',  label: '주간 프로젝트', icon: '📆', sub: '이번 주 단위로 관리하는 프로젝트' },
    { key: 'month', label: '월간 프로젝트', icon: '🗓️', sub: '한 달 단위로 관리하는 프로젝트' },
    { key: 'year',  label: '연간 프로젝트', icon: '📅', sub: '연간 단위로 관리하는 장기 프로젝트' }
];
const PLANNING_CATEGORIES_ACCESS = [
    { key: 'personal', label: '개인', icon: '🔒', bg: '#FEF3C7', fg: '#B45309', note: '본인만 볼 수 있음' },
    { key: 'company',  label: '회사', icon: '🏢', bg: '#DBEAFE', fg: '#1D4ED8', note: '모두 공유' },
    { key: 'funding',  label: '펀딩', icon: '💸', bg: '#EDE9FE', fg: '#6D28D9', note: '관리자 3인 공유' },
    { key: 'family',   label: '가족', icon: '🏠', bg: '#FCE7F3', fg: '#BE185D', note: '모두 공유' }
];
const PLANNING_ASSIGNEES = ['이현주', '김현호', '유지은', '구정두', '대표님'];
const PLANNING_ALLOWED = ['김관택', '이현주', '김현호']; // loginName 기준 (김관택 = 대표님) — 회사 프로젝트 / 가족 프로젝트 열람 권한

function planningIsAdmin() {
    if (!currentUser) return false;
    const login = currentUser.loginName || currentUser.name;
    return PLANNING_ALLOWED.includes(login);
}
// mode: 'company'/'funding' = 관리자 3인만, 'personal' = 모두
function planningCanAccessMode(mode) {
    if (!currentUser) return false;
    if (mode === 'company') return planningIsAdmin();
    if (mode === 'funding') return planningIsAdmin();
    if (mode === 'personal') return true;
    return planningIsAdmin();
}
// 하위호환: 셋 중 하나라도 접근 가능한지
function planningCanAccess() {
    return planningCanAccessMode('personal') || planningCanAccessMode('company') || planningCanAccessMode('funding');
}
function applyPlanningPermission() {
    const navCo = document.getElementById('navPlanningCompany');
    if (navCo) navCo.style.display = planningCanAccessMode('company') ? '' : 'none';
    const navFu = document.getElementById('navPlanningFunding');
    if (navFu) navFu.style.display = planningCanAccessMode('funding') ? '' : 'none';
    const navPe = document.getElementById('navPlanningPersonal');
    if (navPe) navPe.style.display = planningCanAccessMode('personal') ? '' : 'none';
    const group = document.getElementById('navPlanningGroup');
    if (group) group.style.display = planningCanAccess() ? '' : 'none';
    const homeSec = document.getElementById('homePlanningSection');
    if (homeSec) homeSec.style.display = planningCanAccess() ? '' : 'none';
}

function planningCurrentOwner() {
    return currentUser ? (currentUser.loginName || String(currentUser.id || currentUser.name)) : '';
}

// 비용 입력 콤마 자동 포맷 (커서 위치 보정)
function fmtPlanningCostInput(el) {
    if (!el) return;
    const before = el.value;
    const cursorEnd = el.selectionStart;
    const digitsBeforeCursor = before.substring(0, cursorEnd).replace(/[^0-9]/g, '').length;
    const digits = before.replace(/[^0-9]/g, '');
    const formatted = digits ? Number(digits).toLocaleString() : '';
    el.value = formatted;
    // 커서 위치: 숫자 N개만큼 뒤의 위치 찾기
    let pos = 0, count = 0;
    while (pos < formatted.length && count < digitsBeforeCursor) {
        if (/[0-9]/.test(formatted[pos])) count++;
        pos++;
    }
    try { el.setSelectionRange(pos, pos); } catch (e) {}
}

// 개인 프로젝트 모달의 장소/비용 섹션 토글
function togglePlanningExtraSection(secId, btnId, show) {
    const sec = document.getElementById(secId);
    const btn = document.getElementById(btnId);
    if (!sec) return;
    sec.style.display = show ? '' : 'none';
    if (btn) btn.style.display = show ? 'none' : '';
    if (!show) {
        sec.querySelectorAll('input').forEach(el => { el.value = ''; });
    } else {
        const inp = sec.querySelector('input');
        if (inp) setTimeout(() => inp.focus(), 30);
    }
}
function planningLastDayOfMonth(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-').map(Number);
    if (!y || !m) return '';
    const d = new Date(y, m, 0);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function planningLastDayOfYear(y) {
    if (!y) return '';
    return `${y}-12-31`;
}
let planningProjects = [];
let currentPlanningProjectId = null;
let planningLoaded = false;
// 현재 선택된 프로젝트 메뉴: 'company' | 'personal'
let currentPlanningMode = 'personal';

function planningProjectFromDb(r) {
    return {
        id: r.id, name: r.name, description: r.description || '',
        status: r.status || '진행 중',
        period: r.period || 'month',
        access: r.access || 'company',
        targetMonth: r.target_month || '',
        targetYear: r.target_year || '',
        deadline: r.deadline || '',
        location: r.location || '',
        cost: r.cost != null ? Number(r.cost) : null,
        fundingMeta: (r.funding_meta && typeof r.funding_meta === 'object') ? r.funding_meta : null,
        createdBy: r.created_by || '',
        ownerLogin: r.owner_login || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        posts: []
    };
}
function planningProjectToDb(p) {
    return {
        name: p.name,
        description: p.description || '',
        status: p.status || '진행 중',
        period: p.period || 'month',
        access: p.access || 'company',
        target_month: p.targetMonth || '',
        target_year: p.targetYear || '',
        deadline: p.deadline || null,
        location: p.location || '',
        cost: (p.cost == null || p.cost === '') ? null : Number(p.cost),
        funding_meta: (p.fundingMeta && typeof p.fundingMeta === 'object') ? p.fundingMeta : null,
        created_by: p.createdBy || '',
        owner_login: p.ownerLogin || ''
    };
}
function planningPostFromDb(r) {
    return {
        id: r.id,
        projectId: r.project_id,
        parentId: r.parent_id,
        author: r.author || '',
        category: r.category || 'propose',
        title: r.title || '',
        content: r.content || '',
        vendor: r.vendor || '',
        deadline: r.deadline || '',
        assignees: Array.isArray(r.assignees) ? r.assignees : [],
        images: Array.isArray(r.images) ? r.images : [],
        taskStatus: r.task_status || 'todo',
        sortOrder: r.sort_order != null ? Number(r.sort_order) : null,
        createdAt: r.created_at
    };
}
// sort_order 컬럼이 아직 마이그레이션되지 않은 DB에서도 동작하도록 플래그로 관리
let planningSortOrderColumnAvailable = true;
function planningPostToDb(post, projectId) {
    const out = {
        project_id: projectId,
        parent_id: post.parentId || null,
        author: post.author || '',
        category: post.category || 'propose',
        title: post.title || '',
        content: post.content || '',
        vendor: post.vendor || '',
        deadline: post.deadline || null,
        assignees: post.assignees || [],
        images: post.images || [],
        task_status: post.taskStatus || 'todo'
    };
    if (post.sortOrder != null && planningSortOrderColumnAvailable) out.sort_order = post.sortOrder;
    return out;
}
function planningIsSortOrderSchemaError(err) {
    if (!err) return false;
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return msg.includes('sort_order') && (msg.includes('schema cache') || msg.includes('not find') || msg.includes('column'));
}

async function loadPlanningProjects() {
    try {
        const [projRes, postRes] = await Promise.all([
            sb.from('planning_projects').select('*').order('created_at', { ascending: false }),
            sb.from('planning_posts').select('*').order('created_at', { ascending: true })
        ]);
        if (projRes.error) throw projRes.error;
        if (postRes.error) throw postRes.error;
        const postsByProject = {};
        for (const row of (postRes.data || [])) {
            const post = planningPostFromDb(row);
            (postsByProject[post.projectId] = postsByProject[post.projectId] || []).push(post);
        }
        planningProjects = (projRes.data || []).map(row => {
            const proj = planningProjectFromDb(row);
            proj.posts = postsByProject[proj.id] || [];
            return proj;
        });
        planningLoaded = true;
    } catch (err) {
        console.error('planning load fail', err);
        showToast('프로젝트 로드 실패: ' + err.message);
    }
}

async function renderPlanningHomeSection() {
    if (!planningCanAccess()) return;
    try {
        if (!planningLoaded) await loadPlanningProjects();
        const me = currentUser ? (currentUser.name || '') : '';
        // 홈 섹션은 두 메뉴 모두 접근 가능한 프로젝트를 함께 표시
        const visible = planningProjects.filter(planningUserCanSeeProject);
        const today = new Date(); today.setHours(0,0,0,0);
        const plus7 = new Date(today); plus7.setDate(today.getDate() + 7);
        let myTodo = 0;
        let weekDue = 0;
        const rows = [];
        for (const proj of visible) {
            const posts = proj.posts || [];
            for (const post of posts) {
                if (post.parentId) continue;
                const assignees = Array.isArray(post.assignees) ? post.assignees : [];
                const isMine = me && assignees.includes(me);
                if (isMine && (post.taskStatus || 'todo') !== 'done') myTodo++;
                if (post.deadline) {
                    const d = new Date(post.deadline); d.setHours(0,0,0,0);
                    if (d >= today && d <= plus7 && (post.taskStatus || 'todo') !== 'done') weekDue++;
                }
                if (isMine && (post.taskStatus || 'todo') !== 'done') {
                    rows.push({ proj, post });
                }
            }
        }
        const totalEl = document.getElementById('planningTotalCount');
        const todoEl = document.getElementById('planningMyTodo');
        const weekEl = document.getElementById('planningWeekDue');
        if (totalEl) totalEl.textContent = visible.length;
        if (todoEl) todoEl.textContent = myTodo;
        if (weekEl) weekEl.textContent = weekDue;
        const listEl = document.getElementById('planningHomeList');
        if (!listEl) return;
        if (!rows.length) {
            listEl.innerHTML = `<div class="deadline-card-empty">담당 중인 할 일이 없습니다</div>`;
            return;
        }
        rows.sort((a, b) => {
            const da = a.post.deadline ? new Date(a.post.deadline).getTime() : Infinity;
            const db = b.post.deadline ? new Date(b.post.deadline).getTime() : Infinity;
            return da - db;
        });
        const statusColors = { todo: ['#F3F4F6','#4B5563','할 일'], doing: ['#EFF6FF','#2563EB','진행 중'], done: ['#ECFDF5','#059669','완료'] };
        listEl.innerHTML = rows.slice(0, 6).map(({ proj, post }) => {
            const s = statusColors[post.taskStatus || 'todo'];
            const ddStr = post.deadline ? planningFmtDate(post.deadline) : '미정';
            const dd = planningDDay(post.deadline);
            const ddBadge = dd ? `<span style="background:${dd.color};color:white;font-size:11px;font-weight:800;padding:2px 7px;border-radius:5px">${dd.label}</span>` : '';
            const preview = planningHtmlToText(post.content).slice(0, 60);
            // 회사/가족 → 회사 메뉴, 펀딩 → 펀딩 메뉴, 개인 → 개인 메뉴
            const projAcc = proj.access || 'company';
            const projMode = projAcc === 'personal' ? 'personal'
                           : projAcc === 'funding' ? 'funding'
                           : 'company';
            return `<div onclick="switchTab('planning-${projMode}');setTimeout(()=>openPlanningProject(${proj.id}),60)" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--gray-100);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='transparent'">
                <span style="background:${s[0]};color:${s[1]};font-size:11px;font-weight:800;padding:3px 8px;border-radius:5px;white-space:nowrap">${s[2]}</span>
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:700;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${planningEsc(proj.name)} · ${planningEsc(preview)}${preview.length >= 60 ? '...' : ''}</div>
                    <div style="font-size:11px;color:var(--gray-500);margin-top:2px">마감 ${planningEsc(ddStr)}</div>
                </div>
                ${ddBadge}
            </div>`;
        }).join('');
    } catch (err) {
        console.error('planning home render fail', err);
    }
}

async function uploadPlanningImage(file) {
    const extRaw = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const ext = extRaw || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error } = await sb.storage.from('planning-images').upload(path, file, {
        cacheControl: '3600', upsert: false, contentType: file.type || undefined
    });
    if (error) throw error;
    const { data } = sb.storage.from('planning-images').getPublicUrl(path);
    return data.publicUrl;
}
function planningCategoryMeta(key) {
    return PLANNING_CATEGORIES.find(c => c.key === key) || PLANNING_CATEGORIES[PLANNING_CATEGORIES.length - 1];
}
function planningEsc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// HTML → plain text (목록·미리보기·인덱스 슬라이스용)
function planningHtmlToText(html) {
    if (!html) return '';
    if (typeof html !== 'string') return String(html);
    // 기존 plain text 데이터 fast path: '<' 없으면 그대로 반환
    if (html.indexOf('<') === -1) return html;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
}

// HTML 정화 (출력용)
function planningSanitizeHtml(html) {
    if (!html) return '';
    if (typeof DOMPurify === 'undefined') {
        console.error('DOMPurify 미로드 — plain text로 fallback');
        return planningEsc(html);
    }
    if (!planningSanitizeHtml._hookRegistered) {
        DOMPurify.addHook('afterSanitizeAttributes', (node) => {
            if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
                node.setAttribute('rel', 'noopener noreferrer');
            }
        });
        planningSanitizeHtml._hookRegistered = true;
    }
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','span','div','blockquote',
                       'ol','ul','li','a','img','h1','h2','h3','h4','h5','h6',
                       'table','thead','tbody','tfoot','tr','td','th','caption','colgroup','col','hr','pre','code'],
        ALLOWED_ATTR: ['href','target','rel','src','alt','class','style',
                       'colspan','rowspan','width','height','align','valign','bgcolor','border','cellpadding','cellspacing','scope'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data:image\/(?:png|jpeg|gif|webp);base64,)|\/|#)/i
    });
}

// Quill 빈값 판정 (HTML이 <p><br></p>만 있어도 빈 것으로 처리)
function planningQuillIsEmpty(quill) {
    if (!quill) return true;
    const text = quill.getText().trim();
    if (text) return false;
    // 이미지가 있으면 빈 것 아님
    return quill.root.querySelectorAll('img').length === 0;
}

// 큰 base64 이미지를 캔버스로 다운스케일 (최대 변 1600px, JPEG 0.85)
async function planningResizeImageDataUrl(dataUrl, maxSide = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let w = img.naturalWidth, h = img.naturalHeight;
            const scale = Math.min(1, maxSide / Math.max(w, h));
            // base64는 raw 대비 ~33% 큼 → 2MB 문자열 ≈ raw 1.5MB
            if (scale >= 1 && dataUrl.length < 2 * 1024 * 1024) {
                resolve({ dataUrl, resized: false });
                return;
            }
            w = Math.round(w * scale);
            h = Math.round(h * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const out = canvas.toDataURL('image/jpeg', quality);
            resolve({ dataUrl: out, resized: true });
        };
        img.onerror = () => reject(new Error('이미지 로드 실패'));
        img.src = dataUrl;
    });
}

// 전역 보관: 현재 열린 모달의 Quill 인스턴스 (저장 핸들러가 참조)
let currentPlanningQuill = null;

// 4개 모달이 공유하는 빌더. div#containerId 자리에 Quill 마운트.
function mountPlanningRichEditor(containerId, initialHtml, opts) {
    opts = opts || {};
    const el = document.getElementById(containerId);
    if (!el) { console.warn('mountPlanningRichEditor: 컨테이너 없음', containerId); return null; }
    if (typeof Quill === 'undefined') {
        console.error('Quill 미로드');
        return null;
    }
    // 폰트·크기 화이트리스트 등록 (한 번만)
    if (!mountPlanningRichEditor._registered) {
        const Font = Quill.import('formats/font');
        Font.whitelist = ['sans', 'pretendard', 'nanumgothic', 'malgun', 'serif', 'mono'];
        Quill.register(Font, true);
        mountPlanningRichEditor._registered = true;
    }
    const quill = new Quill('#' + containerId, {
        theme: 'snow',
        placeholder: opts.placeholder || '내용을 입력하세요…',
        modules: {
            toolbar: {
                container: [
                    [{ font: ['sans', 'pretendard', 'nanumgothic', 'malgun', 'serif', 'mono'] },
                     { size: ['small', false, 'large', 'huge'] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ color: [] }, { background: [] }],
                    [{ align: [] }],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['blockquote'],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        }
    });
    if (initialHtml) {
        // dangerouslyPasteHTML은 Quill이 허용하지 않는 태그를 자동 정리
        quill.clipboard.dangerouslyPasteHTML(0, initialHtml);
    }
    // 이미지 붙여넣기 → 자동 리사이즈 (Quill 2.x clipboard 모듈 onCapturePaste 오버라이드)
    const clipboard = quill.getModule('clipboard');
    if (clipboard && typeof clipboard.onCapturePaste === 'function') {
        const originalOnCapturePaste = clipboard.onCapturePaste.bind(clipboard);
        clipboard.onCapturePaste = async function(e) {
            const items = e.clipboardData && e.clipboardData.items;
            if (items) {
                for (const item of items) {
                    if (item.kind === 'file' && item.type.startsWith('image/')) {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = item.getAsFile();
                        if (file) await insertResizedImageIntoQuill(quill, file);
                        return;
                    }
                }
            }
            return originalOnCapturePaste(e);
        };
    }
    // 이미지 드래그 드롭
    quill.root.addEventListener('drop', async (e) => {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        // 파일 드롭이면 무조건 브라우저 기본 동작(파일 열기) 차단
        e.preventDefault();
        const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (!imgs.length) return;
        for (const file of imgs) {
            await insertResizedImageIntoQuill(quill, file);
        }
    });
    // 툴바 이미지 버튼 → 자체 핸들러로 교체 (리사이즈 포함)
    const toolbar = quill.getModule('toolbar');
    toolbar.addHandler('image', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files && input.files[0];
            if (file) await insertResizedImageIntoQuill(quill, file);
        };
        input.click();
    });
    return quill;
}

// 파일 → base64 → 리사이즈 → Quill 커서 위치에 삽입
async function insertResizedImageIntoQuill(quill, file) {
    if (file.size > 20 * 1024 * 1024) { // 원본 20MB 초과는 거부
        showToast('이미지가 너무 큽니다 (20MB 초과)');
        return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('파일 읽기 실패'));
        r.readAsDataURL(file);
    });
    let finalUrl = dataUrl;
    try {
        const res = await planningResizeImageDataUrl(dataUrl);
        finalUrl = res.dataUrl;
        if (res.resized) showToast('이미지 크기를 조정했습니다');
    } catch (e) {
        console.warn('리사이즈 실패, 원본 사용', e);
    }
    // base64는 raw 대비 ~33% 큼 → 6.7MB 문자열 ≈ raw 5MB
    if (finalUrl.length > 6.7 * 1024 * 1024) {
        showToast('리사이즈 후에도 너무 큽니다 — 더 작은 이미지를 사용해주세요');
        return;
    }
    const range = quill.getSelection(true) || { index: quill.getLength() - 1, length: 0 };
    quill.insertEmbed(range.index, 'image', finalUrl, 'user');
    quill.setSelection(range.index + 1, 0);
}

function planningDDay(dateStr) {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
    if (isNaN(d.getTime())) return null;
    const diff = Math.round((d - today) / 86400000);
    let label, color;
    if (diff < 0) { label = `D+${-diff}`; color = '#9CA3AF'; }
    else if (diff === 0) { label = 'D-DAY'; color = '#DC2626'; }
    else if (diff <= 7) { label = `D-${diff}`; color = '#EA580C'; }
    else if (diff <= 30) { label = `D-${diff}`; color = '#2563EB'; }
    else { label = `D-${diff}`; color = '#6B7280'; }
    return { diff, label, color };
}
function planningFmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '방금';
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}시간 전`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}일 전`;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function renderPlanning(opts) {
    const skipLoad = opts && opts.skipLoad;
    const root = document.getElementById('planningRoot');
    if (!root) return;
    if (!skipLoad) {
        if (!planningLoaded) {
            root.innerHTML = `<div style="padding:40px;text-align:center;color:var(--gray-500)">불러오는 중...</div>`;
        }
        await loadPlanningProjects();
    }
    if (currentPlanningProjectId == null) {
        root.innerHTML = renderPlanningList();
    } else {
        const proj = planningProjects.find(p => p.id === currentPlanningProjectId);
        if (!proj) { currentPlanningProjectId = null; root.innerHTML = renderPlanningList(); return; }
        root.innerHTML = renderPlanningDetail(proj);
    }
}

// 현재 사용자가 해당 프로젝트를 볼 수 있는지 (모드와 무관하게 데이터 레벨)
function planningUserCanSeeProject(p) {
    const acc = p.access || 'company';
    if (acc === 'company') return planningIsAdmin();
    if (acc === 'family') return planningIsAdmin();
    if (acc === 'funding') return planningIsAdmin();
    if (acc === 'personal') {
        const me = planningCurrentOwner();
        return !!me && p.ownerLogin === me;
    }
    return false;
}
// 현재 메뉴(모드)의 리스트에 포함시킬지
function planningCanSeeProject(p) {
    if (!planningUserCanSeeProject(p)) return false;
    const acc = p.access || 'company';
    // 회사 메뉴 = 회사 + 가족 (관리자 3인 공유)
    if (currentPlanningMode === 'company') return acc === 'company' || acc === 'family';
    // 펀딩 메뉴 = 펀딩 (관리자 3인 공유)
    if (currentPlanningMode === 'funding') return acc === 'funding';
    // 개인 메뉴 = 본인의 개인 프로젝트만
    if (currentPlanningMode === 'personal') return acc === 'personal';
    return false;
}
function renderPlanningList() {
    const renderProjectCard = p => {
        const postCount = (p.posts || []).length;
        const last = (p.posts || []).reduce((m, x) => (!m || new Date(x.createdAt) > new Date(m.createdAt)) ? x : m, null);
        const lastStr = last ? `${planningEsc(last.author)} · ${planningFmtDate(last.createdAt)}` : '아직 게시물 없음';
        const statusColor = p.status === '완료' ? 'var(--green)' : p.status === '보류' ? 'var(--gray-500)' : 'var(--blue)';
        const statusBg = p.status === '완료' ? 'var(--green-light)' : p.status === '보류' ? 'var(--gray-100)' : 'var(--blue-light)';
        const posts = p.posts || [];
        const doneCount = posts.filter(x => (x.taskStatus || 'todo') === 'done').length;
        const progressPct = posts.length ? Math.round((doneCount / posts.length) * 100) : 0;
        const dd = planningDDay(p.deadline);
        const ddBadge = dd ? `<span style="background:${dd.color};color:white;font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;white-space:nowrap">${dd.label}</span>` : '';
        const access = PLANNING_CATEGORIES_ACCESS.find(c => c.key === (p.access || 'company')) || PLANNING_CATEGORIES_ACCESS[1];
        const accessBadge = `<span title="${access.note}" style="background:${access.bg};color:${access.fg};font-size:10px;font-weight:800;padding:3px 7px;border-radius:6px;white-space:nowrap">${access.icon} ${access.label}</span>`;
        return `
        <div draggable="true" ondragstart="planningProjectDragStart(event,${p.id})" ondragend="planningProjectDragEnd(event)" onclick="openPlanningProject(${p.id})" style="background:var(--white);border:1px solid var(--gray-200);border-radius:12px;padding:18px;cursor:grab;transition:all .15s;display:flex;flex-direction:column;gap:10px;user-select:none" onmouseover="this.style.borderColor='var(--blue)';this.style.boxShadow='0 2px 12px rgba(0,0,0,0.06)'" onmouseout="this.style.borderColor='var(--gray-200)';this.style.boxShadow='none'">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                <div style="font-size:16px;font-weight:800;color:var(--gray-900);line-height:1.3">${planningEsc(p.name)}</div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
                    ${accessBadge}
                    ${ddBadge}
                    <span style="background:${statusBg};color:${statusColor};font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;white-space:nowrap">${p.status}</span>
                </div>
            </div>
            ${p.deadline ? `<div style="font-size:12px;color:var(--gray-500)">⏰ 마감 ${planningEsc(p.deadline)}</div>` : ''}
            ${p.description ? `<div style="font-size:13px;color:var(--gray-500);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${planningEsc(planningHtmlToText(p.description))}</div>` : ''}
            ${(p.access === 'funding' && p.fundingMeta) ? (() => {
                const m = p.fundingMeta;
                const sym = m.currency === 'USD' ? '$' : '₩';
                const amt = m.targetAmount != null ? Number(m.targetAmount).toLocaleString() : '';
                const qty = m.targetQty != null ? Number(m.targetQty).toLocaleString() : '';
                const fp = (m.folderPath || '').trim();
                const fpEsc = fp ? planningEsc(fp).replace(/'/g, '&#39;') : '';
                return `<div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;font-size:13px">
                    ${m.platform ? `<span style="background:#EDE9FE;color:#6D28D9;padding:4px 10px;border-radius:6px;font-weight:700">💸 발행처 : ${planningEsc(m.platform)}</span>` : ''}
                    ${amt ? `<span style="background:#D1FAE5;color:#047857;padding:4px 10px;border-radius:6px;font-weight:700">🎯 목표금액 : ${sym}${amt}</span>` : ''}
                    ${qty ? `<span style="background:#DBEAFE;color:#1D4ED8;padding:4px 10px;border-radius:6px;font-weight:700">📦 목표수량 : ${qty}개</span>` : ''}
                    ${fp ? `<span onclick="event.stopPropagation();openFolderPath('${fpEsc}')" title="클릭하여 경로 복사" style="background:#FEF3C7;color:#92400E;padding:4px 10px;border-radius:6px;font-weight:700;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'Consolas','Courier New',monospace;font-size:12px" onmouseover="this.style.background='#FDE68A'" onmouseout="this.style.background='#FEF3C7'">📁 ${planningEsc(fp)}</span>` : ''}
                </div>`;
            })() : ''}
            ${posts.length ? `
            <div style="padding-top:4px">
                <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-500);margin-bottom:4px"><span>완료 ${doneCount}/${posts.length}</span><span>${progressPct}%</span></div>
                <div style="height:6px;background:var(--gray-100);border-radius:3px;overflow:hidden"><div style="width:${progressPct}%;height:100%;background:var(--green);transition:width .2s"></div></div>
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px dashed var(--gray-200);font-size:12px;color:var(--gray-500)">
                <span>💬 <strong style="color:var(--gray-900);font-weight:700">${postCount}</strong>개 카드</span>
                <span>${lastStr}</span>
            </div>
        </div>`;
    };

    const quickAddCard = (periodKey) => `
        <div onclick="openNewPlanningModal('${periodKey}')" style="background:transparent;border:2px dashed var(--gray-300,#D1D5DB);border-radius:12px;padding:18px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:120px;color:var(--gray-500);transition:all .15s" onmouseover="this.style.borderColor='var(--blue)';this.style.color='var(--blue)';this.style.background='var(--blue-light)'" onmouseout="this.style.borderColor='var(--gray-300)';this.style.color='var(--gray-500)';this.style.background='transparent'">
            <div style="font-size:28px;font-weight:700;line-height:1">+</div>
            <div style="font-size:12px;font-weight:700">추가하기</div>
        </div>`;

    const visibleProjects = planningProjects.filter(planningCanSeeProject);

    const modeLabel = currentPlanningMode === 'company' ? '🏢 회사 프로젝트'
                    : currentPlanningMode === 'funding' ? '💸 펀딩 프로젝트'
                    : '🧑 개인 프로젝트';
    const modeSub = currentPlanningMode === 'company' ? '회사/가족 공유 프로젝트 — 김관택·김현호·이현주만 열람 가능'
                  : currentPlanningMode === 'funding' ? '펀딩 프로젝트 — 김관택·김현호·이현주만 열람 가능'
                  : '본인이 작성한 개인 프로젝트만 표시됩니다';

    // 펀딩 모드: 진행/완료 2섹션, 기간 구분 없음
    if (currentPlanningMode === 'funding') {
        const fundSections = [
            { key: 'active', label: '진행 중', icon: '🚀', filter: p => p.status !== '완료' },
            { key: 'done',   label: '완료',   icon: '✅', filter: p => p.status === '완료' }
        ].map(sec => {
            const items = visibleProjects.filter(sec.filter).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
            const cards = items.map(renderProjectCard).join('');
            return `
            <section style="margin-bottom:28px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span style="font-size:22px">${sec.icon}</span>
                        <div>
                            <div style="font-size:16px;font-weight:800;color:var(--gray-900)">${sec.label} <span style="font-size:12px;color:var(--gray-500);font-weight:700;margin-left:6px">${items.length}개</span></div>
                        </div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px">${cards}${sec.key === 'active' ? quickAddCard('funding') : (cards ? '' : '<div style="padding:16px;color:var(--gray-400);font-size:13px">프로젝트가 없습니다</div>')}</div>
            </section>`;
        }).join('');
        return `
            <div style="padding:20px 24px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
                    <div>
                        <div style="font-size:22px;font-weight:800;color:var(--gray-900);margin-bottom:4px">${modeLabel}</div>
                        <div style="font-size:13px;color:var(--gray-500)">${modeSub}</div>
                    </div>
                    <button onclick="openNewPlanningModal()" title="F2" style="padding:9px 18px;background:var(--blue);color:white;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer">+ 새 프로젝트 (F2)</button>
                </div>
                ${fundSections}
            </div>`;
    }

    const sections = PLANNING_PERIODS.map(period => {
        const items = visibleProjects
            .filter(p => (p.period || 'month') === period.key)
            .sort((a, b) => {
                const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
                const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
                if (da !== db) return da - db;
                return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
            });
        const cards = items.map(renderProjectCard).join('');
        return `
        <section style="margin-bottom:28px">
            <div ondragover="planningSectionDragOver(event)" ondragleave="planningSectionDragLeave(event)" ondrop="planningSectionDrop(event,'${period.key}')" style="border-radius:12px;padding:4px;transition:background .15s">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span style="font-size:22px">${period.icon}</span>
                        <div>
                            <div style="font-size:16px;font-weight:800;color:var(--gray-900)">${period.label} <span style="font-size:12px;color:var(--gray-500);font-weight:700;margin-left:6px">${items.length}개</span></div>
                            <div style="font-size:11px;color:var(--gray-500)">${period.sub}</div>
                        </div>
                    </div>
                    <button onclick="openNewPlanningModal('${period.key}')" style="padding:7px 14px;background:var(--blue);color:white;border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer">+ 새 ${period.label}</button>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px">${cards}${quickAddCard(period.key)}</div>
            </div>
        </section>`;
    }).join('');

    return `
        <div style="padding:20px 24px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
                <div>
                    <div style="font-size:22px;font-weight:800;color:var(--gray-900);margin-bottom:4px">${modeLabel}</div>
                    <div style="font-size:13px;color:var(--gray-500)">${modeSub} · 카드를 다른 섹션으로 드래그하면 기간 구분이 바뀝니다</div>
                </div>
            </div>
            ${sections}
        </div>`;
}

let planningProjectDragId = null;
function planningProjectDragStart(ev, id) {
    planningProjectDragId = id;
    ev.dataTransfer.effectAllowed = 'move';
    try { ev.dataTransfer.setData('text/plain', 'proj:' + id); } catch (_) {}
    ev.currentTarget.style.opacity = '0.5';
    ev.stopPropagation();
}
function planningProjectDragEnd(ev) {
    ev.currentTarget.style.opacity = '';
    planningProjectDragId = null;
}
function planningSectionDragOver(ev) {
    if (!planningProjectDragId) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    ev.currentTarget.style.background = 'var(--blue-light)';
}
function planningSectionDragLeave(ev) {
    if (ev.currentTarget.contains(ev.relatedTarget)) return;
    ev.currentTarget.style.background = '';
}
async function planningSectionDrop(ev, newPeriod) {
    ev.preventDefault();
    ev.currentTarget.style.background = '';
    const id = planningProjectDragId;
    if (!id) return;
    const p = planningProjects.find(x => x.id === id);
    if (!p) return;
    if ((p.period || 'month') === newPeriod) return;
    try {
        const { error } = await sb.from('planning_projects').update({ period: newPeriod, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        p.period = newPeriod; p.updatedAt = new Date().toISOString();
        await renderPlanning();
        const meta = PLANNING_PERIODS.find(pp => pp.key === newPeriod);
        showToast(`"${p.name}" → ${meta ? meta.label : newPeriod}`);
    } catch (err) {
        console.error(err);
        showToast('이동 실패: ' + err.message);
    }
}


const PLANNING_TASK_STATUSES = [
    { key: 'todo',  label: '할 일',   bar: '#9CA3AF', bg: '#F3F4F6', text: '#4B5563' },
    { key: 'doing', label: '진행 중', bar: '#2563EB', bg: '#EFF6FF', text: '#2563EB' },
    { key: 'done',  label: '완료',    bar: '#059669', bg: '#ECFDF5', text: '#059669' }
];

function renderPlanningDetail(p) {
    const planningPostSortKey = (post) => {
        if (post.sortOrder != null && !isNaN(Number(post.sortOrder))) return Number(post.sortOrder);
        const t = post.createdAt ? new Date(post.createdAt).getTime() : 0;
        return isNaN(t) ? 0 : t;
    };
    const posts = (p.posts || []).slice().sort((a, b) => {
        const sa = planningPostSortKey(a), sb = planningPostSortKey(b);
        if (sa !== sb) return sa - sb;
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
    const parents = posts.filter(x => !x.parentId);
    const byParent = posts.reduce((acc, x) => {
        if (x.parentId) (acc[x.parentId] = acc[x.parentId] || []).push(x);
        return acc;
    }, {});

    const myNameForCard = currentUser ? currentUser.name : '';
    const renderCard = (post) => {
        const meta = planningCategoryMeta(post.category);
        const imgs = Array.isArray(post.images) ? post.images : (post.image ? [post.image] : []);
        const thumbHtml = imgs.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${imgs.slice(0,3).map(src => `<img src="${planningEsc(src)}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:1px solid var(--gray-200)">`).join('')}${imgs.length > 3 ? `<div style="width:60px;height:60px;background:var(--gray-100);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--gray-500)">+${imgs.length-3}</div>` : ''}</div>` : '';
        const isCardAuthor = !!myNameForCard && post.author === myNameForCard;
        const replyCount = (byParent[post.id] || []).length;
        const preview = planningHtmlToText(post.content).slice(0, 100);
        const hasInlineImg = !preview && post.content && /<img\b/i.test(post.content);
        const dd = planningDDay(post.deadline);
        const ddBadge = dd ? `<span style="background:${dd.color};color:white;font-size:12px;font-weight:800;padding:3px 9px;border-radius:6px">${dd.label}</span>` : '';
        const vendorTag = post.vendor ? `<div style="color:var(--orange);font-size:14px;font-weight:700;margin-top:8px">🏭 ${planningEsc(post.vendor)}</div>` : '';
        const assignees = Array.isArray(post.assignees) ? post.assignees : [];
        const assigneeText = assignees.length ? `<span style="font-size:15px;color:var(--gray-900)"><span style="color:var(--gray-500);font-weight:700">담당자:</span> <strong style="font-weight:800">${assignees.map(planningEsc).join(', ')}</strong></span>` : '<span></span>';
        const replyText = replyCount > 0 ? `<span style="font-size:14px;color:var(--blue);font-weight:800;white-space:nowrap">💬 댓글 : ${replyCount}개</span>` : '';
        const assigneeRow = (assignees.length || replyCount > 0) ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:12px;flex-wrap:wrap">${assigneeText}${replyText}</div>` : '';
        return `
        <div draggable="true" ondragstart="planningPostDragStart(event,${post.id})" ondragend="planningPostDragEnd(event)" ondragover="planningCardDragOver(event)" ondragleave="planningCardDragLeave(event)" ondrop="planningCardDrop(event,${post.id})" onclick="openPlanningPostDetail(${post.id})" style="background:var(--white);border:1px solid var(--gray-200);border-left:4px solid ${meta.fg};border-radius:12px;padding:14px 16px;cursor:grab;transition:all .12s;user-select:none" onmouseover="this.style.borderColor='var(--blue)';this.style.boxShadow='0 2px 10px rgba(0,0,0,0.08)'" onmouseout="this.style.borderColor='var(--gray-200)';this.style.boxShadow='none'">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <span style="background:${meta.bg};color:${meta.fg};font-size:12px;font-weight:800;padding:3px 9px;border-radius:6px">${meta.icon} ${meta.label}</span>
                    ${ddBadge}
                </div>
                ${isCardAuthor ? `<button onclick="event.stopPropagation();openPlanningCardEdit(${post.id})" title="편집" style="background:var(--white);border:1px solid var(--gray-200);color:var(--gray-600,#6B7280);font-size:12px;font-weight:700;padding:3px 10px;border-radius:6px;cursor:pointer;white-space:nowrap" onmouseover="this.style.borderColor='var(--blue)';this.style.color='var(--blue)'" onmouseout="this.style.borderColor='var(--gray-200)';this.style.color='var(--gray-600)'">✏️ 편집</button>` : ''}
            </div>
            ${post.title ? `<div style="font-size:19px;font-weight:800;color:var(--gray-900);line-height:1.4;letter-spacing:-0.01em;margin-bottom:6px">${planningEsc(post.title)}</div>` : ''}
            ${preview ? `<div style="font-size:14px;font-weight:500;color:var(--gray-700,#4B5563);line-height:1.5;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden">${planningEsc(preview)}${preview.length >= 100 ? '...' : ''}</div>` : (post.title || hasInlineImg ? '' : `<div style="font-size:14px;color:var(--gray-400);font-style:italic">내용 없음</div>`)}
            ${vendorTag}
            ${assigneeRow}
            ${thumbHtml}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px dashed var(--gray-200);font-size:11px;color:var(--gray-500);flex-wrap:wrap;gap:6px">
                <span><span style="color:var(--gray-500);font-weight:600">작성자</span> <strong style="color:var(--gray-700,#4B5563);font-weight:600">${planningEsc(post.author)}</strong></span>
                <span>${planningFmtDate(post.createdAt)}</span>
            </div>
        </div>`;
    };

    const columns = PLANNING_TASK_STATUSES.map(col => {
        const items = parents.filter(x => (x.taskStatus || 'todo') === col.key);
        const cardsHtml = items.map(renderCard).join('');
        const addBtn = `<button onclick="openNewPlanningPostForColumn('${col.key}')" style="width:100%;padding:12px;background:transparent;border:2px dashed var(--gray-300,#D1D5DB);border-radius:8px;color:var(--gray-500);font-size:13px;font-weight:700;cursor:pointer;transition:all .12s" onmouseover="this.style.borderColor='${col.bar}';this.style.color='${col.text}';this.style.background='${col.bg}'" onmouseout="this.style.borderColor='var(--gray-300)';this.style.color='var(--gray-500)';this.style.background='transparent'">+ 할 일 추가</button>`;
        return `
        <div class="planning-post-col" ondragover="planningPostDragOver(event)" ondragleave="planningPostDragLeave(event)" ondrop="planningPostDrop(event,'${col.key}')" style="flex:1;min-width:270px;background:var(--gray-50);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;transition:background .15s">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div style="display:flex;align-items:center;gap:8px">
                    <span style="width:8px;height:8px;border-radius:50%;background:${col.bar}"></span>
                    <span style="font-size:13px;font-weight:800;color:${col.text}">${col.label}</span>
                    <span style="background:${col.bg};color:${col.text};font-size:11px;font-weight:800;padding:2px 8px;border-radius:10px">${items.length}</span>
                </div>
                <button onclick="openNewPlanningPostForColumn('${col.key}')" title="이 컬럼에 새 카드" style="background:none;border:none;color:var(--gray-500);font-size:18px;line-height:1;cursor:pointer;padding:0 4px">+</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;min-height:80px">${cardsHtml}${addBtn}</div>
        </div>`;
    }).join('');

    const statusList = (p.access === 'funding') ? ['진행 중', '완료'] : PLANNING_STATUSES;
    const statusOpts = statusList.map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('');

    return `
        <div style="padding:20px 24px">
            <button onclick="closePlanningProject()" style="background:none;border:none;color:var(--gray-500);font-size:13px;cursor:pointer;padding:4px 0;margin-bottom:12px">← 프로젝트 목록</button>
            <div style="background:var(--white);border:1px solid var(--gray-200);border-radius:12px;padding:18px 20px;margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
                    <div style="flex:1;min-width:0">
                        <div style="font-size:22px;font-weight:800;color:var(--gray-900);margin-bottom:4px">${planningEsc(p.name)}</div>
                        ${(p.description && (planningHtmlToText(p.description) || /<img\b/i.test(p.description))) ? `<div class="ql-snow planning-content-readonly" style="font-size:13px;color:var(--gray-500);line-height:1.5"><div class="ql-editor" style="padding:0">${planningSanitizeHtml(p.description)}</div></div>` : ''}
                        ${(p.location || p.cost != null) ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:12px">
                            ${p.location ? `<span style="background:var(--blue-light,#DBEAFE);color:#1D4ED8;padding:3px 10px;border-radius:6px;font-weight:700">📍 ${planningEsc(p.location)}</span>` : ''}
                            ${p.cost != null ? `<span style="background:var(--green-light,#D1FAE5);color:#047857;padding:3px 10px;border-radius:6px;font-weight:700">💰 ${Number(p.cost).toLocaleString()}원</span>` : ''}
                        </div>` : ''}
                        ${(p.access === 'funding' && p.fundingMeta) ? (() => {
                            const m = p.fundingMeta;
                            const sym = m.currency === 'USD' ? '$' : '₩';
                            const amt = m.targetAmount != null ? Number(m.targetAmount).toLocaleString() : '';
                            const qty = m.targetQty != null ? Number(m.targetQty).toLocaleString() : '';
                            const unit = (m.targetAmount && m.targetQty) ? (m.currency === 'USD' ? (m.targetAmount / m.targetQty).toFixed(2) : Math.round(m.targetAmount / m.targetQty).toLocaleString()) : '';
                            const period = (m.startDate || m.endDate) ? `${planningEsc(m.startDate || '')} ~ ${planningEsc(m.endDate || '')}` : '';
                            const fp = (m.folderPath || '').trim();
                            const fpEsc = fp ? planningEsc(fp).replace(/'/g, '&#39;') : '';
                            return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;font-size:14px">
                                ${m.client ? `<span style="background:#F3F4F6;color:#374151;padding:5px 12px;border-radius:7px;font-weight:700">🏢 진행사 : ${planningEsc(m.client)}</span>` : ''}
                                ${m.manufacturer ? `<span style="background:#F3F4F6;color:#374151;padding:5px 12px;border-radius:7px;font-weight:700">🏭 제조사 : ${planningEsc(m.manufacturer)}</span>` : ''}
                                ${m.platform ? `<span style="background:#EDE9FE;color:#6D28D9;padding:5px 12px;border-radius:7px;font-weight:700">💸 발행처 : ${planningEsc(m.platform)}</span>` : ''}
                                ${amt ? `<span style="background:#D1FAE5;color:#047857;padding:5px 12px;border-radius:7px;font-weight:700">🎯 목표금액 : ${sym}${amt}</span>` : ''}
                                ${qty ? `<span style="background:#DBEAFE;color:#1D4ED8;padding:5px 12px;border-radius:7px;font-weight:700">📦 목표수량 : ${qty}개</span>` : ''}
                                ${unit ? `<span style="background:#FEF3C7;color:#92400E;padding:5px 12px;border-radius:7px;font-weight:700">💵 예상단가 : ${sym}${unit}</span>` : ''}
                                ${period ? `<span style="background:#FFE4E6;color:#BE123C;padding:5px 12px;border-radius:7px;font-weight:700">📅 기간 : ${period}</span>` : ''}
                            </div>
                            ${fp ? `<div style="margin-top:10px"><span onclick="openFolderPath('${fpEsc}')" title="클릭하여 경로 복사" style="display:inline-flex;align-items:center;gap:6px;background:#FEF3C7;color:#92400E;padding:6px 12px;border-radius:7px;font-weight:700;cursor:pointer;font-family:'Consolas','Courier New',monospace;font-size:13px;max-width:100%" onmouseover="this.style.background='#FDE68A'" onmouseout="this.style.background='#FEF3C7'">📁 ${planningEsc(fp)} <span style="font-size:11px;color:#A16207;font-family:Pretendard,sans-serif">📋 클릭하여 복사</span></span></div>` : ''}`;
                        })() : ''}
                        <div style="font-size:11px;color:var(--gray-500);margin-top:8px">만든 사람: ${planningEsc(p.createdBy)} · ${planningFmtDate(p.createdAt)}</div>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                        <select onchange="updatePlanningStatus(${p.id}, this.value)" style="padding:6px 10px;border:1px solid var(--gray-200);border-radius:8px;font-weight:700;font-size:12px">${statusOpts}</select>
                        <button onclick="openNewPlanningPostForColumn('todo')" ${currentPlanningMode === 'funding' ? 'title="F2"' : ''} style="padding:6px 12px;background:var(--blue);color:white;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">+ 새 카드${currentPlanningMode === 'funding' ? ' (F2)' : ''}</button>
                        <button onclick="openEditPlanningModal(${p.id})" style="padding:6px 10px;background:var(--gray-100);border:none;border-radius:8px;font-size:12px;cursor:pointer">✏️ 편집</button>
                        <button onclick="deletePlanningProject(${p.id})" style="padding:6px 10px;background:var(--red-light,#FEE);color:var(--red);border:none;border-radius:8px;font-size:12px;cursor:pointer">삭제</button>
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:stretch">${columns}</div>
        </div>`;
}

let planningPostDragId = null;
function planningPostSortKeyOf(post) {
    if (post.sortOrder != null && !isNaN(Number(post.sortOrder))) return Number(post.sortOrder);
    const t = post.createdAt ? new Date(post.createdAt).getTime() : 0;
    return isNaN(t) ? 0 : t;
}
function planningPostDragStart(ev, id) {
    planningPostDragId = id;
    ev.dataTransfer.effectAllowed = 'move';
    try { ev.dataTransfer.setData('text/plain', String(id)); } catch (_) {}
    ev.currentTarget.style.opacity = '0.5';
    ev.stopPropagation();
}
function planningPostDragEnd(ev) {
    ev.currentTarget.style.opacity = '';
    planningPostDragId = null;
}
function planningPostDragOver(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    ev.currentTarget.style.background = 'var(--blue-light)';
}
function planningPostDragLeave(ev) {
    if (ev.currentTarget.contains(ev.relatedTarget)) return;
    ev.currentTarget.style.background = '';
}
function planningCardDragOver(ev) {
    if (planningPostDragId === null) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'move';
    ev.currentTarget.style.borderTop = '3px solid var(--blue)';
}
function planningCardDragLeave(ev) {
    if (ev.currentTarget.contains(ev.relatedTarget)) return;
    ev.currentTarget.style.borderTop = '';
}
async function planningCardDrop(ev, targetPostId) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.style.borderTop = '';
    const draggedId = planningPostDragId || parseInt(ev.dataTransfer.getData('text/plain'), 10);
    planningPostDragId = null;
    if (!draggedId || draggedId === targetPostId) return;
    const p = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!p) return;
    const dragged = (p.posts || []).find(x => x.id === draggedId);
    const target = (p.posts || []).find(x => x.id === targetPostId);
    if (!dragged || !target) return;

    // 같은 컬럼 카드 정렬값 수집
    const targetStatus = target.taskStatus || 'todo';
    const sameColumn = (p.posts || [])
        .filter(x => !x.parentId && (x.taskStatus || 'todo') === targetStatus && x.id !== draggedId)
        .slice()
        .sort((a, b) => planningPostSortKeyOf(a) - planningPostSortKeyOf(b));
    const targetIdx = sameColumn.findIndex(x => x.id === targetPostId);
    if (targetIdx < 0) return;
    const targetKey = planningPostSortKeyOf(target);
    const prevKey = targetIdx === 0 ? targetKey - 1000 : planningPostSortKeyOf(sameColumn[targetIdx - 1]);
    const newSortOrder = (prevKey + targetKey) / 2;

    const patch = { sort_order: newSortOrder };
    if ((dragged.taskStatus || 'todo') !== targetStatus) patch.task_status = targetStatus;
    try {
        let { error } = await sb.from('planning_posts').update(patch).eq('id', draggedId);
        if (error && planningIsSortOrderSchemaError(error)) {
            planningSortOrderColumnAvailable = false;
            showToast('정렬 순서 기능을 쓰려면 planning_posts_sort_order.sql 실행 필요');
            return;
        }
        if (error) throw error;
        dragged.sortOrder = newSortOrder;
        if (patch.task_status) dragged.taskStatus = targetStatus;
        await renderPlanning({ skipLoad: true });
    } catch (err) {
        console.error(err);
        showToast('순서 변경 실패: ' + err.message);
    }
}
async function planningPostDrop(ev, newStatus) {
    ev.preventDefault();
    ev.currentTarget.style.background = '';
    const id = planningPostDragId || parseInt(ev.dataTransfer.getData('text/plain'), 10);
    planningPostDragId = null;
    if (!id) return;
    const p = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!p) return;
    const post = (p.posts || []).find(x => x.id === id);
    if (!post) return;
    // 같은 컬럼 끝으로 이동: max + 1000
    const sameColumn = (p.posts || [])
        .filter(x => !x.parentId && (x.taskStatus || 'todo') === newStatus && x.id !== id);
    const maxKey = sameColumn.length
        ? Math.max(...sameColumn.map(planningPostSortKeyOf))
        : 0;
    const newSortOrder = maxKey + 1000;
    const sameStatus = (post.taskStatus || 'todo') === newStatus;
    const patch = { sort_order: newSortOrder };
    if (!sameStatus) patch.task_status = newStatus;
    try {
        let { error } = await sb.from('planning_posts').update(patch).eq('id', id);
        if (error && planningIsSortOrderSchemaError(error)) {
            planningSortOrderColumnAvailable = false;
            // sort_order 빼고 task_status만 (필요한 경우) 재시도
            if (!sameStatus) {
                ({ error } = await sb.from('planning_posts').update({ task_status: newStatus }).eq('id', id));
            } else {
                showToast('정렬 순서 기능을 쓰려면 planning_posts_sort_order.sql 실행 필요');
                return;
            }
        }
        if (error) throw error;
        if (planningSortOrderColumnAvailable) post.sortOrder = newSortOrder;
        if (!sameStatus) post.taskStatus = newStatus;
        await renderPlanning({ skipLoad: true });
        if (!sameStatus) {
            const label = (PLANNING_TASK_STATUSES.find(s => s.key === newStatus) || {}).label || newStatus;
            showToast(`→ ${label}`);
        }
    } catch (err) {
        console.error(err);
        showToast('이동 실패: ' + err.message);
    }
}

function openNewPlanningPostForColumn(taskStatus) {
    const p = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!p) return;
    planningPostEditorMode = { mode: 'new', taskStatus, parentId: null };
    openPlanningPostEditor();
}

function openPlanningPostDetail(postId) {
    const p = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!p) return;
    const post = (p.posts || []).find(x => x.id === postId);
    if (!post) return;
    const replies = (p.posts || []).filter(x => x.parentId === postId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const meta = planningCategoryMeta(post.category);
    const imgs = Array.isArray(post.images) ? post.images : (post.image ? [post.image] : []);
    const imgHtml = imgs.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">${imgs.map(src => `<img src="${planningEsc(src)}" style="max-width:220px;max-height:220px;border-radius:8px;border:1px solid var(--gray-200);cursor:zoom-in;object-fit:cover" onclick="openPlanningImage('${String(src).replace(/'/g,'&#39;')}')">`).join('')}</div>` : '';
    const taskStatusBadges = PLANNING_TASK_STATUSES.map(s => {
        const active = (post.taskStatus || 'todo') === s.key;
        return `<button onclick="setPlanningPostTaskStatus(${post.id},'${s.key}')" style="padding:4px 10px;border:1px solid ${active ? s.bar : 'var(--gray-200)'};background:${active ? s.bg : 'var(--white)'};color:${active ? s.text : 'var(--gray-500)'};border-radius:6px;font-size:11px;font-weight:800;cursor:pointer">${s.label}</button>`;
    }).join('');
    const myName = currentUser ? currentUser.name : '';
    const repliesHtml = replies.map(r => {
        const rm = planningCategoryMeta(r.category);
        const rImgs = Array.isArray(r.images) ? r.images : (r.image ? [r.image] : []);
        const rImgHtml = rImgs.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${rImgs.map(src => `<img src="${planningEsc(src)}" style="max-width:140px;max-height:140px;border-radius:6px;border:1px solid var(--gray-200);cursor:zoom-in;object-fit:cover" onclick="openPlanningImage('${String(src).replace(/'/g,'&#39;')}')">`).join('')}</div>` : '';
        const isReplyAuthor = !!myName && r.author === myName;
        const replyEditBtn = isReplyAuthor ? `<button onclick="openPlanningReplyEdit(${r.id})" style="background:none;border:none;color:var(--blue);font-size:11px;font-weight:700;cursor:pointer;padding:0 4px">✏️ 편집</button>` : '';
        const replyDelBtn = isReplyAuthor ? `<button onclick="deletePlanningPost(${r.id})" style="background:none;border:none;color:var(--red);font-size:11px;cursor:pointer;padding:0 4px">삭제</button>` : '';
        return `<div style="background:var(--gray-50);border:1px solid var(--gray-200);border-left:3px solid ${rm.fg};border-radius:8px;padding:10px 12px;margin-left:24px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px;flex-wrap:wrap">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span style="background:${rm.bg};color:${rm.fg};font-size:10px;font-weight:800;padding:2px 6px;border-radius:5px">${rm.icon} ${rm.label}</span>
                    <strong style="font-size:12px;color:var(--gray-900)">${planningEsc(r.author)}</strong>
                    <span style="font-size:11px;color:var(--gray-500)">${planningFmtDate(r.createdAt)}</span>
                </div>
                <div style="display:flex;gap:2px;align-items:center">${replyEditBtn}${replyDelBtn}</div>
            </div>
            <div class="ql-snow planning-content-readonly" style="font-size:13px;color:var(--gray-900);line-height:1.5"><div class="ql-editor" style="padding:0">${planningSanitizeHtml(r.content || '')}</div></div>
            ${rImgHtml}
        </div>`;
    }).join('');

    const catOpts = PLANNING_CATEGORIES.map(c => `<option value="${c.key}">${c.icon} ${c.label}</option>`).join('');

    const body = document.getElementById('modalBody');
    if (!body) return;
    const dd = planningDDay(post.deadline);
    const ddBadge = dd ? `<span style="background:${dd.color};color:white;font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px">${dd.label}</span>` : '';
    const assignees = Array.isArray(post.assignees) ? post.assignees : [];
    const metaRows = [];
    if (post.vendor) metaRows.push(`<div style="font-size:12px;color:var(--gray-600,#4B5563)"><span style="color:var(--gray-500)">🏭 거래처:</span> <strong style="color:var(--orange)">${planningEsc(post.vendor)}</strong></div>`);
    if (post.deadline) metaRows.push(`<div style="font-size:12px;color:var(--gray-600,#4B5563)"><span style="color:var(--gray-500)">⏰ 마감일:</span> <strong>${planningEsc(post.deadline)}</strong> ${ddBadge}</div>`);
    if (assignees.length) metaRows.push(`<div style="font-size:12px;color:var(--gray-600,#4B5563);display:flex;gap:4px;align-items:center;flex-wrap:wrap"><span style="color:var(--gray-500)">👥 담당:</span> ${assignees.map(n => `<span style="background:var(--blue-light);color:var(--blue);font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">${planningEsc(n)}</span>`).join('')}</div>`);
    const metaBlock = metaRows.length ? `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;padding:10px 12px;background:var(--gray-50);border-radius:8px;border:1px solid var(--gray-200)">${metaRows.join('')}</div>` : '';
    const isPostAuthor = !!myName && post.author === myName;
    const postEditBtn = isPostAuthor ? `<button onclick="closeModal();openPlanningCardEdit(${post.id})" style="background:var(--white);border:1px solid var(--blue);color:var(--blue);font-size:12px;font-weight:700;padding:4px 12px;border-radius:6px;cursor:pointer">✏️ 편집</button>` : '';
    const postDelBtn = isPostAuthor ? `<button onclick="deletePlanningPost(${post.id});closeModal()" style="background:none;border:none;color:var(--red);font-size:12px;cursor:pointer">삭제</button>` : '';
    body.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <span style="background:${meta.bg};color:${meta.fg};font-size:12px;font-weight:800;padding:4px 10px;border-radius:6px">${meta.icon} ${meta.label}</span>
            <strong style="font-size:14px;color:var(--gray-900)">${planningEsc(post.author)}</strong>
            <span style="font-size:12px;color:var(--gray-500)">${planningFmtDate(post.createdAt)}</span>
            <div style="flex:1"></div>
            ${postEditBtn}
            ${postDelBtn}
        </div>
        <div style="display:flex;gap:6px;margin-bottom:14px">${taskStatusBadges}</div>
        ${post.title ? `<div style="font-size:22px;font-weight:800;color:var(--gray-900);line-height:1.35;letter-spacing:-0.01em;margin-bottom:12px">${planningEsc(post.title)}</div>` : ''}
        ${metaBlock}
        ${(post.content && (planningHtmlToText(post.content) || /<img\b/i.test(post.content))) ? `<div class="ql-snow planning-content-readonly" style="padding:12px;background:var(--gray-50);border-radius:8px"><div class="ql-editor" style="padding:0;font-size:14px;color:var(--gray-900);line-height:1.6">${planningSanitizeHtml(post.content)}</div></div>` : `<div style="font-size:14px;color:var(--gray-400);padding:12px;background:var(--gray-50);border-radius:8px">(내용 없음)</div>`}
        ${imgHtml}
        <div style="margin-top:18px">
            <div style="font-size:13px;font-weight:800;color:var(--gray-900);margin-bottom:10px">↩ 답글 ${replies.length}</div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">${repliesHtml || `<div style="color:var(--gray-400);font-size:12px;padding:12px;text-align:center;border:1px dashed var(--gray-200);border-radius:8px">아직 답글이 없습니다</div>`}</div>
            <div style="background:var(--white);border:1.5px solid var(--blue);border-radius:10px;padding:12px">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                    <select id="planningPostCategory" style="padding:8px 10px;border:1px solid var(--gray-200);background:var(--white);color:var(--gray-900);border-radius:8px;font-size:13px">${catOpts}</select>
                    <input id="planningPostAuthor" placeholder="작성자" value="${planningEsc(currentUser ? currentUser.name : '')}" style="padding:8px 10px;border:1px solid var(--gray-200);background:var(--white);color:var(--gray-900);border-radius:8px;font-size:13px">
                </div>
                <div id="planningPostContent" class="planning-reply-editor" style="margin-bottom:8px"></div>
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
                    <label style="padding:7px 10px;background:var(--gray-100);color:var(--gray-900);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
                        📁 이미지 파일 (복수 가능)
                        <input type="file" accept="image/*" multiple onchange="handlePlanningImageFiles(event)" style="display:none">
                    </label>
                    <input id="planningPostImageUrl" placeholder="또는 이미지 URL" style="flex:1;min-width:160px;padding:7px 10px;border:1px solid var(--gray-200);background:var(--white);color:var(--gray-900);border-radius:8px;font-size:12px">
                    <button type="button" onclick="addPlanningImageUrl()" style="padding:7px 10px;background:var(--gray-100);color:var(--gray-900);border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">URL 추가</button>
                </div>
                <div style="font-size:11px;color:var(--gray-500);margin-bottom:8px">파일 선택 창에서 Ctrl(또는 Shift) 키를 누른 채 클릭하면 여러 장을 한 번에 선택할 수 있습니다.</div>
                <div id="planningImagePreview" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"></div>
                <button onclick="submitPlanningReply(${post.id})" style="width:100%;padding:9px;background:var(--blue);color:white;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer">↩ 답글 작성</button>
            </div>
        </div>
    `;
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    planningPendingImages = [];
    refreshPlanningImagePreview();
    currentPlanningQuill = mountPlanningRichEditor('planningPostContent', '', { placeholder: '답글을 입력하세요…' });
    if (currentPlanningQuill) {
        const editor = currentPlanningQuill.root;
        editor.classList.add('compact');
        editor.style.minHeight = '100px';
    }
}

async function setPlanningPostTaskStatus(postId, newStatus) {
    const p = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!p) return;
    const post = (p.posts || []).find(x => x.id === postId);
    if (!post) return;
    try {
        const { error } = await sb.from('planning_posts').update({ task_status: newStatus }).eq('id', postId);
        if (error) throw error;
        post.taskStatus = newStatus;
        openPlanningPostDetail(postId);
        await renderPlanning({ skipLoad: true });
        const label = (PLANNING_TASK_STATUSES.find(s => s.key === newStatus) || {}).label || newStatus;
        showToast(`→ ${label}`);
    } catch (err) {
        console.error(err);
        showToast('상태 저장 실패: ' + err.message);
    }
}

let planningPostEditorMode = null;
let planningPendingAssignees = [];
function togglePlanningAssignee(name) {
    const i = planningPendingAssignees.indexOf(name);
    if (i >= 0) planningPendingAssignees.splice(i, 1);
    else planningPendingAssignees.push(name);
    const wrap = document.getElementById('planningAssigneeChips');
    if (wrap) wrap.innerHTML = renderPlanningAssigneeChips();
}
function renderPlanningAssigneeChips() {
    return PLANNING_ASSIGNEES.map(n => {
        const active = planningPendingAssignees.includes(n);
        return `<button type="button" onclick="togglePlanningAssignee('${planningEsc(n)}')" style="padding:6px 12px;border:1px solid ${active ? 'var(--blue)' : 'var(--gray-200)'};background:${active ? 'var(--blue-light)' : 'var(--white)'};color:${active ? 'var(--blue)' : 'var(--gray-600,#4B5563)'};border-radius:20px;font-size:12px;font-weight:700;cursor:pointer">${active ? '✓ ' : ''}${planningEsc(n)}</button>`;
    }).join('');
}
function openPlanningPostEditor() {
    const proj = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!proj) return;
    const body = document.getElementById('modalBody');
    if (!body) return;
    const mode = planningPostEditorMode || { mode: 'new', taskStatus: 'todo', parentId: null };
    const col = (PLANNING_TASK_STATUSES.find(s => s.key === mode.taskStatus) || PLANNING_TASK_STATUSES[0]);
    const catOpts = PLANNING_CATEGORIES.map(c => `<option value="${c.key}">${c.icon} ${c.label}</option>`).join('');
    planningPendingAssignees = [];
    body.innerHTML = `
        <div class="form-section-title">📌 <span style="color:var(--blue)">${planningEsc(proj.name)}</span>의 새 항목 추가 <span style="background:${col.bg};color:${col.text};font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;margin-left:8px">${col.label}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div class="form-group" style="margin:0"><label class="form-label">카테고리</label>
                <select id="planningPostCategory" class="form-select">${catOpts}</select>
            </div>
            <div class="form-group" style="margin:0"><label class="form-label">작성자</label>
                <input id="planningPostAuthor" class="form-input" placeholder="작성자" value="${planningEsc(currentUser ? currentUser.name : '')}">
            </div>
        </div>
        <div class="form-group"><label class="form-label">제목</label>
            <input id="planningPostTitle" class="form-input" placeholder="카드 제목을 입력하세요" style="font-weight:700">
        </div>
        <div class="form-group"><label class="form-label">내용</label>
            <div id="planningPostContent"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group"><label class="form-label">🏭 거래처 (선택)</label>
                <input id="planningPostVendor" class="form-input" placeholder="예: OO사, XX공장">
            </div>
            <div class="form-group"><label class="form-label">⏰ 마감일 (선택)</label>
                <input id="planningPostDeadline" class="form-input" type="date">
            </div>
        </div>
        <div class="form-group"><label class="form-label">👥 담당자 (여러 명 선택 가능)</label>
            <div id="planningAssigneeChips" style="display:flex;flex-wrap:wrap;gap:6px">${renderPlanningAssigneeChips()}</div>
        </div>
        <div class="form-group"><label class="form-label">📷 이미지 (여러 장 선택 가능)</label>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <label style="padding:8px 12px;background:var(--gray-100);color:var(--gray-900);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
                    📁 이미지 파일 선택 (복수 가능)
                    <input type="file" accept="image/*" multiple onchange="handlePlanningImageFiles(event)" style="display:none">
                </label>
                <input id="planningPostImageUrl" placeholder="또는 이미지 URL" style="flex:1;min-width:180px;padding:8px 10px;border:1px solid var(--gray-200);background:var(--white);color:var(--gray-900);border-radius:8px;font-size:13px">
                <button type="button" onclick="addPlanningImageUrl()" style="padding:8px 12px;background:var(--gray-100);color:var(--gray-900);border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">URL 추가</button>
            </div>
            <div style="font-size:11px;color:var(--gray-500);margin-top:6px">파일 선택 창에서 Ctrl(또는 Shift) 키를 누른 채 클릭하면 여러 장을 한 번에 선택할 수 있습니다.</div>
            <div id="planningImagePreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"></div>
        </div>
        <button class="form-submit" style="background:var(--blue);margin-top:6px" onclick="submitPlanningCard()">저장</button>
    `;
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    planningPendingImages = [];
    refreshPlanningImagePreview();
    currentPlanningQuill = mountPlanningRichEditor('planningPostContent', '', { placeholder: '내용을 자세히 입력하세요…' });
    setTimeout(() => { const el = document.getElementById('planningPostTitle'); if (el) el.focus(); }, 60);
}

function openPlanningCardEdit(postId) {
    const proj = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!proj) return;
    const post = (proj.posts || []).find(x => x.id === postId);
    if (!post) return;
    if (currentUser && post.author !== currentUser.name) { showToast('작성자만 편집할 수 있습니다'); return; }
    const body = document.getElementById('modalBody');
    if (!body) return;
    const catOpts = PLANNING_CATEGORIES.map(c => `<option value="${c.key}" ${c.key === post.category ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('');
    planningPendingAssignees = Array.isArray(post.assignees) ? post.assignees.slice() : [];
    planningPendingImages = (Array.isArray(post.images) ? post.images : []).map(url => ({ file: null, url }));
    body.innerHTML = `
        <div class="form-section-title">✏️ <span style="color:var(--blue)">${planningEsc(proj.name)}</span>의 카드 편집</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div class="form-group" style="margin:0"><label class="form-label">카테고리</label>
                <select id="planningPostCategory" class="form-select">${catOpts}</select>
            </div>
            <div class="form-group" style="margin:0"><label class="form-label">작성자</label>
                <input id="planningPostAuthor" class="form-input" value="${planningEsc(post.author || '')}">
            </div>
        </div>
        <div class="form-group"><label class="form-label">제목</label>
            <input id="planningPostTitle" class="form-input" placeholder="카드 제목을 입력하세요" value="${planningEsc(post.title || '')}" style="font-weight:700">
        </div>
        <div class="form-group"><label class="form-label">내용</label>
            <div id="planningPostContent"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group"><label class="form-label">🏭 거래처</label>
                <input id="planningPostVendor" class="form-input" value="${planningEsc(post.vendor || '')}">
            </div>
            <div class="form-group"><label class="form-label">⏰ 마감일</label>
                <input id="planningPostDeadline" class="form-input" type="date" value="${planningEsc(post.deadline || '')}">
            </div>
        </div>
        <div class="form-group"><label class="form-label">👥 담당자</label>
            <div id="planningAssigneeChips" style="display:flex;flex-wrap:wrap;gap:6px">${renderPlanningAssigneeChips()}</div>
        </div>
        <div class="form-group"><label class="form-label">📷 이미지 (여러 장 선택 가능)</label>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <label style="padding:8px 12px;background:var(--gray-100);color:var(--gray-900);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
                    📁 이미지 파일 선택 (복수 가능)
                    <input type="file" accept="image/*" multiple onchange="handlePlanningImageFiles(event)" style="display:none">
                </label>
                <input id="planningPostImageUrl" placeholder="또는 이미지 URL" style="flex:1;min-width:180px;padding:8px 10px;border:1px solid var(--gray-200);background:var(--white);color:var(--gray-900);border-radius:8px;font-size:13px">
                <button type="button" onclick="addPlanningImageUrl()" style="padding:8px 12px;background:var(--gray-100);color:var(--gray-900);border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">URL 추가</button>
            </div>
            <div style="font-size:11px;color:var(--gray-500);margin-top:6px">파일 선택 창에서 Ctrl(또는 Shift) 키를 누른 채 클릭하면 여러 장을 한 번에 선택할 수 있습니다.</div>
            <div id="planningImagePreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"></div>
        </div>
        <button class="form-submit" style="background:var(--blue);margin-top:6px" onclick="submitPlanningCardEdit(${postId})">저장</button>
    `;
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    refreshPlanningImagePreview();
    const initialHtml = planningSanitizeHtml(post.content || '');
    currentPlanningQuill = mountPlanningRichEditor('planningPostContent', initialHtml, { placeholder: '내용을 자세히 입력하세요…' });
    setTimeout(() => { const el = document.getElementById('planningPostTitle'); if (el) el.focus(); }, 60);
}

async function submitPlanningCardEdit(postId) {
    const p = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!p) return;
    const post = (p.posts || []).find(x => x.id === postId);
    if (!post) return;
    const titleEl = document.getElementById('planningPostTitle');
    const title = titleEl ? (titleEl.value || '').trim() : '';
    const quill = currentPlanningQuill;
    const isEmpty = planningQuillIsEmpty(quill);
    const content = (!quill || isEmpty) ? '' : quill.root.innerHTML;
    if (!title && isEmpty && !planningPendingImages.length) { showToast('제목, 내용 또는 이미지를 입력하세요'); return; }
    const author = (document.getElementById('planningPostAuthor').value || '').trim() || post.author;
    const category = document.getElementById('planningPostCategory').value;
    const vendor = (document.getElementById('planningPostVendor').value || '').trim();
    const deadline = document.getElementById('planningPostDeadline').value || '';
    let imageUrls;
    try {
        imageUrls = await resolvePlanningPendingImages();
    } catch (err) {
        showToast('이미지 업로드 실패: ' + err.message);
        return;
    }
    const patch = {
        author, category, title, content, vendor,
        deadline: deadline || null,
        assignees: planningPendingAssignees.slice(),
        images: imageUrls
    };
    try {
        const { error } = await sb.from('planning_posts').update(patch).eq('id', postId);
        if (error) throw error;
        Object.assign(post, {
            author, category, title, content, vendor,
            deadline: deadline || '',
            assignees: patch.assignees,
            images: imageUrls
        });
        planningPendingImages = [];
        planningPendingAssignees = [];
        closeModal();
        await renderPlanning({ skipLoad: true });
        showToast('수정되었습니다');
    } catch (err) {
        console.error(err);
        showToast('수정 실패: ' + err.message);
    }
}

async function submitPlanningCard() {
    const p = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!p) return;
    const titleEl = document.getElementById('planningPostTitle');
    const title = titleEl ? (titleEl.value || '').trim() : '';
    const quill = currentPlanningQuill;
    const isEmpty = planningQuillIsEmpty(quill);
    const content = (!quill || isEmpty) ? '' : quill.root.innerHTML;
    if (!title && isEmpty && !planningPendingImages.length) { showToast('제목, 내용 또는 이미지를 입력하세요'); return; }
    const author = (document.getElementById('planningPostAuthor').value || '').trim() || (currentUser ? currentUser.name : '익명');
    const category = document.getElementById('planningPostCategory').value;
    const vendor = (document.getElementById('planningPostVendor').value || '').trim();
    const deadline = document.getElementById('planningPostDeadline').value || '';
    const mode = planningPostEditorMode || { taskStatus: 'todo', parentId: null };
    let imageUrls;
    try {
        imageUrls = await resolvePlanningPendingImages();
    } catch (err) {
        showToast('이미지 업로드 실패: ' + err.message);
        return;
    }
    const targetStatus = mode.taskStatus || 'todo';
    const sameCol = (p.posts || []).filter(x => !x.parentId && (x.taskStatus || 'todo') === targetStatus);
    const maxKey = sameCol.length ? Math.max(...sameCol.map(planningPostSortKeyOf)) : 0;
    const newPost = {
        author, category, title, content, vendor, deadline,
        assignees: planningPendingAssignees.slice(),
        images: imageUrls,
        taskStatus: targetStatus,
        parentId: mode.parentId || null,
        sortOrder: maxKey + 1000
    };
    try {
        let { data, error } = await sb.from('planning_posts').insert(planningPostToDb(newPost, p.id)).select().single();
        if (error && planningIsSortOrderSchemaError(error)) {
            // sort_order 컬럼이 없는 환경 → 플래그 끄고 재시도
            planningSortOrderColumnAvailable = false;
            showToast('정렬 순서 기능을 쓰려면 planning_posts_sort_order.sql 실행 필요');
            ({ data, error } = await sb.from('planning_posts').insert(planningPostToDb(newPost, p.id)).select().single());
        }
        if (error) throw error;
        const inserted = planningPostFromDb(data);
        p.posts = p.posts || [];
        p.posts.push(inserted);
        // 담당자 일일계획표에 자동 등록 (작성일·마감일)
        try { await syncPlanningCardToDaily(p, inserted); }
        catch (e) { console.error('일일계획표 동기화 실패', e); }
        planningPendingImages = [];
        planningPendingAssignees = [];
        planningPostEditorMode = null;
        closeModal();
        await renderPlanning({ skipLoad: true });
    } catch (err) {
        console.error(err);
        showToast('카드 저장 실패: ' + err.message);
    }
}

async function syncPlanningCardToDaily(project, post) {
    const assignees = Array.isArray(post.assignees) ? post.assignees : [];
    if (!assignees.length) return;
    const priority = PLANNING_CATEGORY_TO_PRIORITY[post.category] || '🟡 보통';
    const createdDate = (post.createdAt || new Date().toISOString()).slice(0, 10);
    const summary = (post.title || planningHtmlToText(post.content) || '(내용 없음)').replace(/\s+/g, ' ').slice(0, 50);
    const baseTitle = `[${project.name}] ${summary}`;
    const insertedIds = [];
    for (const person of assignees) {
        const makeTask = (date, suffix, labelText) => ({
            task: `${baseTitle}${suffix}`,
            date, assignee: person, target: '',
            priority, done: false,
            deadline: post.deadline || '',
            label: labelText, client: project.name || ''
        });
        // 작성일 태스크
        const saved1 = await dbInsertTask(makeTask(createdDate, ' · 작성', '프로젝트 작성'));
        if (saved1) { dailyTasks.push(saved1); insertedIds.push(saved1.id); }
        // 마감일 태스크 (있고 작성일과 다를 때만)
        if (post.deadline && post.deadline !== createdDate) {
            const saved2 = await dbInsertTask(makeTask(post.deadline, ' · 마감 ⏰', '프로젝트 마감'));
            if (saved2) { dailyTasks.push(saved2); insertedIds.push(saved2.id); }
        }
    }
    try { renderDaily(); } catch (_) {}
    try { renderHome(); } catch (_) {}
    if (insertedIds.length) showToast(`일일계획표에 ${insertedIds.length}건 자동 등록`);
}

async function submitPlanningReply(parentPostId) {
    const p = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!p) return;
    const quill = currentPlanningQuill;
    const isEmpty = planningQuillIsEmpty(quill);
    const content = (!quill || isEmpty) ? '' : quill.root.innerHTML;
    if (isEmpty && !planningPendingImages.length) { showToast('내용 또는 이미지를 입력하세요'); return; }
    const author = (document.getElementById('planningPostAuthor').value || '').trim() || (currentUser ? currentUser.name : '익명');
    const category = document.getElementById('planningPostCategory').value;
    let imageUrls;
    try {
        imageUrls = await resolvePlanningPendingImages();
    } catch (err) {
        showToast('이미지 업로드 실패: ' + err.message);
        return;
    }
    const newPost = {
        author, category, content,
        images: imageUrls,
        parentId: parentPostId,
        taskStatus: 'todo'
    };
    try {
        const { data, error } = await sb.from('planning_posts').insert(planningPostToDb(newPost, p.id)).select().single();
        if (error) throw error;
        const inserted = planningPostFromDb(data);
        p.posts = p.posts || [];
        p.posts.push(inserted);
        planningPendingImages = [];
        openPlanningPostDetail(parentPostId);
        await renderPlanning({ skipLoad: true });
    } catch (err) {
        console.error(err);
        showToast('답글 저장 실패: ' + err.message);
    }
}

// 답글 편집 (작성자만)
function openPlanningReplyEdit(replyId) {
    const proj = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!proj) return;
    const reply = (proj.posts || []).find(x => x.id === replyId);
    if (!reply) return;
    if (currentUser && reply.author !== currentUser.name) { showToast('작성자만 편집할 수 있습니다'); return; }
    const body = document.getElementById('modalBody');
    if (!body) return;
    const catOpts = PLANNING_CATEGORIES.map(c => `<option value="${c.key}" ${c.key === reply.category ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('');
    planningPendingImages = (Array.isArray(reply.images) ? reply.images : []).map(url => ({ file: null, url }));
    body.innerHTML = `
        <div class="form-section-title">✏️ 답글 편집</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div class="form-group" style="margin:0"><label class="form-label">카테고리</label>
                <select id="planningPostCategory" class="form-select">${catOpts}</select>
            </div>
            <div class="form-group" style="margin:0"><label class="form-label">작성자</label>
                <input id="planningPostAuthor" class="form-input" value="${planningEsc(reply.author || '')}" readonly style="background:var(--gray-50);color:var(--gray-600)">
            </div>
        </div>
        <div class="form-group"><label class="form-label">내용</label>
            <div id="planningPostContent"></div>
        </div>
        <div class="form-group"><label class="form-label">📷 이미지 (여러 장 선택 가능)</label>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <label style="padding:8px 12px;background:var(--gray-100);color:var(--gray-900);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
                    📁 이미지 파일 선택 (복수 가능)
                    <input type="file" accept="image/*" multiple onchange="handlePlanningImageFiles(event)" style="display:none">
                </label>
                <input id="planningPostImageUrl" placeholder="또는 이미지 URL" style="flex:1;min-width:180px;padding:8px 10px;border:1px solid var(--gray-200);background:var(--white);color:var(--gray-900);border-radius:8px;font-size:13px">
                <button type="button" onclick="addPlanningImageUrl()" style="padding:8px 12px;background:var(--gray-100);color:var(--gray-900);border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">URL 추가</button>
            </div>
            <div style="font-size:11px;color:var(--gray-500);margin-top:6px">파일 선택 창에서 Ctrl(또는 Shift) 키를 누른 채 클릭하면 여러 장을 한 번에 선택할 수 있습니다.</div>
            <div id="planningImagePreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:6px">
            <button class="btn-export" onclick="openPlanningPostDetail(${reply.parentId})" style="flex:0 0 auto">취소</button>
            <button class="form-submit" style="flex:1;background:var(--blue)" onclick="submitPlanningReplyEdit(${reply.id})">수정 저장</button>
        </div>
    `;
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    refreshPlanningImagePreview();
    const initialHtml = planningSanitizeHtml(reply.content || '');
    currentPlanningQuill = mountPlanningRichEditor('planningPostContent', initialHtml, { placeholder: '답글 내용을 입력하세요…' });
    setTimeout(() => { if (currentPlanningQuill) currentPlanningQuill.focus(); }, 60);
}

async function submitPlanningReplyEdit(replyId) {
    const p = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!p) return;
    const reply = (p.posts || []).find(x => x.id === replyId);
    if (!reply) return;
    if (currentUser && reply.author !== currentUser.name) { showToast('작성자만 편집할 수 있습니다'); return; }
    const quill = currentPlanningQuill;
    const isEmpty = planningQuillIsEmpty(quill);
    const content = (!quill || isEmpty) ? '' : quill.root.innerHTML;
    if (isEmpty && !planningPendingImages.length) { showToast('내용 또는 이미지를 입력하세요'); return; }
    const category = document.getElementById('planningPostCategory').value;
    let imageUrls;
    try {
        imageUrls = await resolvePlanningPendingImages();
    } catch (err) {
        showToast('이미지 업로드 실패: ' + err.message);
        return;
    }
    const patch = { category, content, images: imageUrls };
    try {
        const { error } = await sb.from('planning_posts').update(patch).eq('id', replyId);
        if (error) throw error;
        Object.assign(reply, { category, content, images: imageUrls });
        planningPendingImages = [];
        openPlanningPostDetail(reply.parentId);
        await renderPlanning({ skipLoad: true });
        showToast('답글이 수정되었습니다');
    } catch (err) {
        console.error(err);
        showToast('수정 실패: ' + err.message);
    }
}

function openPlanningProject(id) {
    currentPlanningProjectId = id;
    planningPendingImages = [];
    const newHash = `#planning/p-${id}`;
    if (location.hash !== newHash) {
        history.pushState({ tab: 'planning', planningProjectId: id }, '', newHash);
    }
    renderPlanning();
}
function closePlanningProject() {
    currentPlanningProjectId = null;
    planningPendingImages = [];
    const newHash = `#planning-${currentPlanningMode}`;
    if (location.hash !== newHash) {
        history.pushState({ tab: `planning-${currentPlanningMode}` }, '', newHash);
    }
    renderPlanning();
}

function openNewPlanningModal(defaultPeriod) {
    const body = document.getElementById('modalBody');
    if (!body) return;
    // 펀딩 모드는 전용 폼
    if (currentPlanningMode === 'funding') {
        return openFundingPlanningModal(null);
    }
    const pd = defaultPeriod || 'month';
    const now = new Date();
    const curYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const curY = String(now.getFullYear());
    const yearOpts = [];
    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 5; y++) {
        yearOpts.push(`<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}년</option>`);
    }
    const extrasBlock = currentPlanningMode === 'personal' ? `
        <div class="form-group" id="newPlanningLocationSec" style="display:none;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <label class="form-label" style="margin:0">📍 장소</label>
                <button type="button" onclick="togglePlanningExtraSection('newPlanningLocationSec','newPlanningLocationAdd',false)" style="padding:2px 10px;border:1px solid var(--gray-300);background:transparent;color:var(--gray-600);border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
            </div>
            <input id="newPlanningLocation" class="form-input" placeholder="장소를 입력해주세요">
        </div>
        <div class="form-group" id="newPlanningCostSec" style="display:none;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <label class="form-label" style="margin:0">💰 비용</label>
                <button type="button" onclick="togglePlanningExtraSection('newPlanningCostSec','newPlanningCostAdd',false)" style="padding:2px 10px;border:1px solid var(--gray-300);background:transparent;color:var(--gray-600);border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
            </div>
            <input id="newPlanningCost" class="form-input" inputmode="numeric" placeholder="0" oninput="fmtPlanningCostInput(this)">
        </div>
        <div style="display:flex;gap:8px;margin-bottom:16px">
            <button type="button" id="newPlanningLocationAdd" onclick="togglePlanningExtraSection('newPlanningLocationSec','newPlanningLocationAdd',true)" style="flex:1;padding:8px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">+ 장소 추가</button>
            <button type="button" id="newPlanningCostAdd" onclick="togglePlanningExtraSection('newPlanningCostSec','newPlanningCostAdd',true)" style="flex:1;padding:8px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">+ 비용 추가</button>
        </div>
    ` : '';
    body.innerHTML = `
        <div class="form-section-title">+ 새 프로젝트</div>
        <div class="form-group"><label class="form-label">프로젝트 이름 *</label><input id="newPlanningName" class="form-input" placeholder="예: 원데이강의 준비, 시계 부품 구입"></div>
        <div class="form-group"><label class="form-label">설명 (선택)</label><div id="newPlanningDesc"></div></div>
        ${extrasBlock}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group"><label class="form-label">기간 구분</label>
                <select id="newPlanningPeriod" class="form-select" onchange="togglePlanningPeriodInputs()">${PLANNING_PERIODS.map(pp => `<option value="${pp.key}" ${pp.key === pd ? 'selected' : ''}>${pp.icon} ${pp.label}</option>`).join('')}</select>
            </div>
            <div class="form-group"><label class="form-label">상태</label>
                <select id="newPlanningStatus" class="form-select">${PLANNING_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
            </div>
        </div>
        <div id="newPlanningMonthWrap" class="form-group" style="display:${pd==='month'?'block':'none'}">
            <label class="form-label">🗓️ 마감 월</label>
            <input id="newPlanningTargetMonth" class="form-input" type="month" value="${curYM}">
            <div style="font-size:11px;color:var(--gray-500);margin-top:4px">마감일을 비워두면 이 월의 말일로 자동 설정</div>
        </div>
        <div id="newPlanningYearWrap" class="form-group" style="display:${pd==='year'?'block':'none'}">
            <label class="form-label">📅 마감 연도</label>
            <select id="newPlanningTargetYear" class="form-select">${yearOpts}</select>
            <div style="font-size:11px;color:var(--gray-500);margin-top:4px">마감일을 비워두면 해당 연도의 12월 31일로 자동 설정</div>
        </div>
        <div class="form-group"><label class="form-label">마감일 (선택)</label>
            <input id="newPlanningDeadline" class="form-input" type="date">
        </div>
        <button class="form-submit" style="background:var(--blue)" onclick="savePlanningProject()">저장</button>
    `;
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    currentPlanningQuill = mountPlanningRichEditor('newPlanningDesc', '', { placeholder: '이 프로젝트의 목표, 배경을 적어주세요' });
    setTimeout(() => {
        const el = document.getElementById('newPlanningName'); if (el) el.focus();
        const chosen = document.querySelector('.planning-access-option input[checked]') || document.querySelector('.planning-access-option input');
        if (chosen) {
            const lbl = chosen.closest('.planning-access-option');
            const c = PLANNING_CATEGORIES_ACCESS.find(x => x.key === chosen.value);
            if (lbl && c) { lbl.style.borderColor = c.fg; lbl.style.background = c.bg; }
        }
    }, 50);
}
function togglePlanningPeriodInputs() {
    const period = document.getElementById('newPlanningPeriod').value;
    const mw = document.getElementById('newPlanningMonthWrap');
    const yw = document.getElementById('newPlanningYearWrap');
    if (mw) mw.style.display = period === 'month' ? 'block' : 'none';
    if (yw) yw.style.display = period === 'year' ? 'block' : 'none';
}
function toggleEditPlanningPeriodInputs() {
    const period = document.getElementById('editPlanningPeriod').value;
    const mw = document.getElementById('editPlanningMonthWrap');
    const yw = document.getElementById('editPlanningYearWrap');
    if (mw) mw.style.display = period === 'month' ? 'block' : 'none';
    if (yw) yw.style.display = period === 'year' ? 'block' : 'none';
}
// =====================================
// 펀딩 프로젝트 전용 모달 (신규/편집 공용, p=null이면 신규)
// =====================================
const FUNDING_PLATFORMS = ['와디즈', '텀블벅', '킥스타터'];
const FUNDING_STATUSES = ['진행 중', '완료'];

function openFundingPlanningModal(p) {
    const body = document.getElementById('modalBody');
    const title = document.getElementById('modalTitle');
    if (!body) return;
    const isEdit = !!p;
    const m = (p && p.fundingMeta) ? p.fundingMeta : {};
    const esc = s => planningEsc(String(s == null ? '' : s));

    const platformRaw = m.platform || '';
    const platformIsStd = FUNDING_PLATFORMS.includes(platformRaw);
    const platformSelected = platformRaw ? (platformIsStd ? platformRaw : '기타') : '와디즈';
    const platformCustom = (!platformIsStd && platformRaw) ? platformRaw : '';
    const currency = m.currency === 'USD' ? 'USD' : 'KRW';
    const clientsList = (typeof clients !== 'undefined' ? clients : []).map(c => `<option value="${esc(c.companyName || '')}">`).join('');

    if (title) title.textContent = isEdit ? '💸 펀딩 프로젝트 편집' : '💸 새 펀딩 프로젝트';
    body.innerHTML = `
        <div class="form-section-title">💸 ${isEdit ? '펀딩 프로젝트 편집' : '새 펀딩 프로젝트'}</div>

        <div class="form-group">
            <label class="form-label">프로젝트 이름 <span style="color:var(--red)">*</span></label>
            <input id="fundPlanName" class="form-input" placeholder="예: KLP 스마트 워치 펀딩" value="${esc(p ? p.name : '')}">
        </div>

        <div class="form-group">
            <label class="form-label">설명</label>
            <div id="fundPlanDesc"></div>
        </div>

        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-group">
                <label class="form-label">진행사</label>
                <input id="fundPlanClient" class="form-input" list="fundPlanClientList" value="${esc(m.client || '케이엘피코리아(주)')}" placeholder="진행사 (고객사 DB)">
                <datalist id="fundPlanClientList">${clientsList}</datalist>
            </div>
            <div class="form-group">
                <label class="form-label">제조사</label>
                <input id="fundPlanManufacturer" class="form-input" value="${esc(m.manufacturer || '')}" placeholder="제조사 (해외거래처 DB — 연결 예정)">
            </div>
        </div>

        <div class="form-row" style="display:grid;grid-template-columns:2fr 1fr;gap:10px">
            <div class="form-group">
                <label class="form-label">목표 금액</label>
                <input id="fundPlanTargetAmount" class="form-input" inputmode="numeric" placeholder="0" value="${m.targetAmount != null ? Number(m.targetAmount).toLocaleString() : ''}" oninput="fmtPlanningCostInput(this);fundPlanRecalcUnit()">
            </div>
            <div class="form-group">
                <label class="form-label">통화</label>
                <select id="fundPlanCurrency" class="form-select" onchange="fundPlanRecalcUnit()">
                    <option value="KRW" ${currency === 'KRW' ? 'selected' : ''}>원화 (KRW)</option>
                    <option value="USD" ${currency === 'USD' ? 'selected' : ''}>달러 (USD)</option>
                </select>
            </div>
        </div>

        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-group">
                <label class="form-label">목표 수량</label>
                <input id="fundPlanTargetQty" class="form-input" inputmode="numeric" placeholder="0" value="${m.targetQty != null ? Number(m.targetQty).toLocaleString() : ''}" oninput="fmtPlanningCostInput(this);fundPlanRecalcUnit()">
            </div>
            <div class="form-group">
                <label class="form-label">예상 단가 (자동)</label>
                <div id="fundPlanUnitPrice" class="form-input" style="background:var(--gray-50);color:var(--gray-700);font-weight:700">-</div>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">발행처</label>
            <select id="fundPlanPlatform" class="form-select" onchange="fundPlanTogglePlatformCustom()">
                ${FUNDING_PLATFORMS.concat(['기타']).map(k => `<option ${platformSelected === k ? 'selected' : ''}>${k}</option>`).join('')}
            </select>
            <input id="fundPlanPlatformCustom" class="form-input" placeholder="발행처 직접 입력" value="${esc(platformCustom)}" style="margin-top:6px;display:${platformSelected === '기타' ? '' : 'none'}">
        </div>

        <div class="form-group">
            <label class="form-label">📁 폴더 경로 <span style="color:var(--gray-400);font-weight:400;font-size:11px">(예: D:\\프로젝트\\펀딩\\2026\\스마트워치)</span></label>
            <input id="fundPlanFolderPath" class="form-input" placeholder="네트워크/로컬 폴더 경로를 붙여넣으세요" value="${esc(m.folderPath || '')}" style="font-family:'Consolas','Courier New',monospace;font-size:13px">
            <div style="font-size:11px;color:var(--gray-500);margin-top:4px;line-height:1.5">💡 저장 후 프로젝트 카드/상세에서 경로를 클릭하면 클립보드에 복사됩니다. (브라우저 보안 정책상 파일 탐색기를 자동으로 여는 것은 제한적입니다 — 파일 탐색기 주소창에 붙여넣어 열어주세요)</div>
        </div>

        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-group">
                <label class="form-label">진행 시작일</label>
                <input id="fundPlanStartDate" class="form-input" type="date" value="${esc(m.startDate || '')}">
            </div>
            <div class="form-group">
                <label class="form-label">진행 종료일</label>
                <input id="fundPlanEndDate" class="form-input" type="date" value="${esc(m.endDate || '')}">
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">상태</label>
            <select id="fundPlanStatus" class="form-select">
                ${FUNDING_STATUSES.map(s => `<option ${(p ? p.status : '진행 중') === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
        </div>

        <div style="display:flex;gap:8px;margin-top:16px">
            ${isEdit ? `<button class="btn-export" onclick="deletePlanningProject(${p.id})" style="color:var(--red);border-color:var(--red)">삭제</button>` : ''}
            <button class="form-submit" style="flex:1;background:var(--blue)" onclick="saveFundingPlanningProject(${isEdit ? p.id : 'null'})">${isEdit ? '수정 저장' : '저장'}</button>
        </div>
    `;
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    const fundInitialHtml = (p && p.description) ? planningSanitizeHtml(p.description) : '';
    currentPlanningQuill = mountPlanningRichEditor('fundPlanDesc', fundInitialHtml, { placeholder: '펀딩 개요, 목표, 배경 등' });
    openModalHistory();
    setTimeout(() => { try { fundPlanRecalcUnit(); } catch (e) {} const el = document.getElementById('fundPlanName'); if (el && !isEdit) el.focus(); }, 30);
}

function fundPlanTogglePlatformCustom() {
    const sel = document.getElementById('fundPlanPlatform');
    const inp = document.getElementById('fundPlanPlatformCustom');
    if (!sel || !inp) return;
    if (sel.value === '기타') { inp.style.display = ''; setTimeout(() => inp.focus(), 30); }
    else { inp.style.display = 'none'; inp.value = ''; }
}

function fundPlanRecalcUnit() {
    const amtStr = (document.getElementById('fundPlanTargetAmount') || {}).value || '';
    const qtyStr = (document.getElementById('fundPlanTargetQty') || {}).value || '';
    const cur = (document.getElementById('fundPlanCurrency') || {}).value || 'KRW';
    const amt = Number(amtStr.replace(/[^0-9.]/g, '')) || 0;
    const qty = Number(qtyStr.replace(/[^0-9.]/g, '')) || 0;
    const disp = document.getElementById('fundPlanUnitPrice');
    if (!disp) return;
    if (!amt || !qty) { disp.textContent = '-'; return; }
    const unit = amt / qty;
    const symbol = cur === 'USD' ? '$' : '₩';
    const rounded = cur === 'USD' ? unit.toFixed(2) : Math.round(unit).toLocaleString();
    disp.textContent = `${symbol} ${rounded}`;
}

async function saveFundingPlanningProject(id) {
    const v = (idd, def = '') => { const el = document.getElementById(idd); return el ? (el.value || def) : def; };
    const name = (v('fundPlanName') || '').trim();
    if (!name) { showToast('프로젝트 이름을 입력하세요'); return; }
    const quill = currentPlanningQuill;
    const isEmpty = planningQuillIsEmpty(quill);
    const description = (!quill || isEmpty) ? '' : quill.root.innerHTML;
    const status = v('fundPlanStatus', '진행 중');
    const client = (v('fundPlanClient') || '').trim();
    const manufacturer = (v('fundPlanManufacturer') || '').trim();
    const targetAmountStr = v('fundPlanTargetAmount', '');
    const targetQtyStr = v('fundPlanTargetQty', '');
    const targetAmount = targetAmountStr ? Number(targetAmountStr.replace(/[^0-9.]/g, '')) : null;
    const targetQty = targetQtyStr ? Number(targetQtyStr.replace(/[^0-9.]/g, '')) : null;
    const currency = v('fundPlanCurrency', 'KRW');
    const platformSel = v('fundPlanPlatform', '와디즈');
    const platformCustom = (v('fundPlanPlatformCustom') || '').trim();
    const platform = platformSel === '기타' ? (platformCustom || '기타') : platformSel;
    const startDate = v('fundPlanStartDate', '') || null;
    const endDate = v('fundPlanEndDate', '') || null;
    const folderPath = (v('fundPlanFolderPath') || '').trim();

    const fundingMeta = {
        client, manufacturer,
        targetAmount: targetAmount == null ? null : targetAmount,
        targetQty: targetQty == null ? null : targetQty,
        currency, platform,
        startDate: startDate || '',
        endDate: endDate || '',
        folderPath
    };

    const deadline = endDate || null;

    try {
        if (id) {
            const patch = {
                name, description, status,
                access: 'funding',
                funding_meta: fundingMeta,
                deadline,
                updated_at: new Date().toISOString()
            };
            const { error } = await sb.from('planning_projects').update(patch).eq('id', id);
            if (error) throw error;
            closeModal();
            await renderPlanning();
            showToast('수정되었습니다');
        } else {
            const payload = planningProjectToDb({
                name, description, status,
                period: 'month',
                access: 'funding',
                deadline,
                fundingMeta,
                createdBy: currentUser ? currentUser.name : '익명',
                ownerLogin: planningCurrentOwner()
            });
            const { data, error } = await sb.from('planning_projects').insert(payload).select().single();
            if (error) throw error;
            closeModal();
            currentPlanningProjectId = data.id;
            await renderPlanning();
            showToast('펀딩 프로젝트가 만들어졌습니다');
        }
    } catch (err) {
        console.error(err);
        showToast('저장 실패: ' + err.message);
    }
}

function openEditPlanningModal(id) {
    const p = planningProjects.find(x => x.id === id);
    if (!p) return;
    const body = document.getElementById('modalBody');
    if (!body) return;
    // 펀딩 프로젝트는 전용 폼 (access=funding 또는 현재 모드=funding)
    if ((p.access || '') === 'funding' || currentPlanningMode === 'funding') {
        return openFundingPlanningModal(p);
    }
    const pd = p.period || 'month';
    const now = new Date();
    const yearOpts = [];
    for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 5; y++) {
        yearOpts.push(`<option value="${y}" ${String(y) === String(p.targetYear || now.getFullYear()) ? 'selected' : ''}>${y}년</option>`);
    }
    const isPersonal = (p.access || 'company') === 'personal';
    const hasLocation = !!(p.location && p.location.trim());
    const hasCost = p.cost != null && p.cost !== '';
    const costFormatted = hasCost ? Number(p.cost).toLocaleString() : '';
    const editExtrasBlock = isPersonal ? `
        <div class="form-group" id="editPlanningLocationSec" style="display:${hasLocation ? '' : 'none'};background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <label class="form-label" style="margin:0">📍 장소</label>
                <button type="button" onclick="togglePlanningExtraSection('editPlanningLocationSec','editPlanningLocationAdd',false)" style="padding:2px 10px;border:1px solid var(--gray-300);background:transparent;color:var(--gray-600);border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
            </div>
            <input id="editPlanningLocation" class="form-input" placeholder="장소를 입력해주세요" value="${planningEsc(p.location || '')}">
        </div>
        <div class="form-group" id="editPlanningCostSec" style="display:${hasCost ? '' : 'none'};background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <label class="form-label" style="margin:0">💰 비용</label>
                <button type="button" onclick="togglePlanningExtraSection('editPlanningCostSec','editPlanningCostAdd',false)" style="padding:2px 10px;border:1px solid var(--gray-300);background:transparent;color:var(--gray-600);border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
            </div>
            <input id="editPlanningCost" class="form-input" inputmode="numeric" placeholder="0" value="${costFormatted}" oninput="fmtPlanningCostInput(this)">
        </div>
        <div style="display:flex;gap:8px;margin-bottom:16px">
            <button type="button" id="editPlanningLocationAdd" onclick="togglePlanningExtraSection('editPlanningLocationSec','editPlanningLocationAdd',true)" style="flex:1;padding:8px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:${hasLocation ? 'none' : ''}">+ 장소 추가</button>
            <button type="button" id="editPlanningCostAdd" onclick="togglePlanningExtraSection('editPlanningCostSec','editPlanningCostAdd',true)" style="flex:1;padding:8px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:${hasCost ? 'none' : ''}">+ 비용 추가</button>
        </div>
    ` : '';
    body.innerHTML = `
        <div class="form-section-title">✏️ 프로젝트 편집</div>
        <div class="form-group"><label class="form-label">프로젝트 이름 *</label><input id="editPlanningName" class="form-input" value="${planningEsc(p.name)}"></div>
        <div class="form-group"><label class="form-label">설명</label><div id="editPlanningDesc"></div></div>
        ${editExtrasBlock}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group"><label class="form-label">기간 구분</label>
                <select id="editPlanningPeriod" class="form-select" onchange="toggleEditPlanningPeriodInputs()">${PLANNING_PERIODS.map(pp => `<option value="${pp.key}" ${pp.key === pd ? 'selected' : ''}>${pp.icon} ${pp.label}</option>`).join('')}</select>
            </div>
            <div class="form-group"><label class="form-label">상태</label>
                <select id="editPlanningStatus" class="form-select">${PLANNING_STATUSES.map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
            </div>
        </div>
        <div id="editPlanningMonthWrap" class="form-group" style="display:${pd==='month'?'block':'none'}">
            <label class="form-label">🗓️ 마감 월</label>
            <input id="editPlanningTargetMonth" class="form-input" type="month" value="${planningEsc(p.targetMonth || '')}">
            <div style="font-size:11px;color:var(--gray-500);margin-top:4px">마감일을 비워두면 이 월의 말일로 자동 설정</div>
        </div>
        <div id="editPlanningYearWrap" class="form-group" style="display:${pd==='year'?'block':'none'}">
            <label class="form-label">📅 마감 연도</label>
            <select id="editPlanningTargetYear" class="form-select">${yearOpts}</select>
            <div style="font-size:11px;color:var(--gray-500);margin-top:4px">마감일을 비워두면 해당 연도의 12월 31일로 자동 설정</div>
        </div>
        <div class="form-group"><label class="form-label">마감일 (선택)</label>
            <input id="editPlanningDeadline" class="form-input" type="date" value="${planningEsc(p.deadline || '')}">
        </div>
        ${planningIsAdmin() ? `
        <div class="form-group"><label class="form-label">📂 공개 범위 (이동)</label>
            <select id="editPlanningAccess" class="form-select">
                <option value="company" ${(p.access || 'company') === 'company' ? 'selected' : ''}>🏢 회사 (관리자 3인 공유)</option>
                <option value="personal" ${(p.access || 'company') === 'personal' ? 'selected' : ''}>🔒 개인 (본인만)</option>
            </select>
            <div style="font-size:11px;color:var(--gray-500);margin-top:4px">변경 시 해당 메뉴로 이동합니다. 개인으로 이동하면 본인 소유로 전환됩니다.</div>
        </div>` : ''}
        <button class="form-submit" style="background:var(--blue)" onclick="savePlanningProjectEdit(${id})">저장</button>
    `;
    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    const editInitialHtml = planningSanitizeHtml(p.description || '');
    currentPlanningQuill = mountPlanningRichEditor('editPlanningDesc', editInitialHtml, { placeholder: '이 프로젝트의 목표, 배경을 적어주세요' });
}
async function savePlanningProject() {
    const name = (document.getElementById('newPlanningName').value || '').trim();
    if (!name) { showToast('프로젝트 이름을 입력하세요'); return; }
    const quill = currentPlanningQuill;
    const isEmpty = planningQuillIsEmpty(quill);
    const desc = (!quill || isEmpty) ? '' : quill.root.innerHTML;
    const status = document.getElementById('newPlanningStatus').value;
    const period = document.getElementById('newPlanningPeriod').value;
    let deadline = document.getElementById('newPlanningDeadline').value || '';
    // 공개 범위는 현재 메뉴에 따라 자동 설정 (회사 → company, 펀딩 → funding, 개인 → personal)
    const access = currentPlanningMode === 'company' ? 'company'
                 : currentPlanningMode === 'funding' ? 'funding'
                 : 'personal';
    const locEl = document.getElementById('newPlanningLocation');
    const costEl = document.getElementById('newPlanningCost');
    const location = locEl && locEl.offsetParent !== null ? (locEl.value || '').trim() : '';
    const costStr = costEl && costEl.offsetParent !== null ? (costEl.value || '') : '';
    const cost = costStr ? Number(costStr.replace(/[^0-9]/g, '')) : null;
    const targetMonth = period === 'month' ? (document.getElementById('newPlanningTargetMonth').value || '') : '';
    const targetYear = period === 'year' ? (document.getElementById('newPlanningTargetYear').value || '') : '';
    if (!deadline) {
        if (period === 'month' && targetMonth) deadline = planningLastDayOfMonth(targetMonth);
        else if (period === 'year' && targetYear) deadline = planningLastDayOfYear(targetYear);
    }
    const payload = planningProjectToDb({
        name, description: desc, status, period, deadline,
        access, targetMonth, targetYear, location, cost,
        createdBy: currentUser ? currentUser.name : '익명',
        ownerLogin: planningCurrentOwner()
    });
    try {
        const { data, error } = await sb.from('planning_projects').insert(payload).select().single();
        if (error) throw error;
        closeModal();
        currentPlanningProjectId = data.id;
        await renderPlanning();
        showToast('프로젝트를 만들었습니다');
    } catch (err) {
        console.error(err);
        showToast('저장 실패: ' + err.message);
    }
}
async function savePlanningProjectEdit(id) {
    const p = planningProjects.find(x => x.id === id);
    if (!p) return;
    const name = (document.getElementById('editPlanningName').value || '').trim();
    if (!name) { showToast('이름을 입력하세요'); return; }
    const quill = currentPlanningQuill;
    const isEmpty = planningQuillIsEmpty(quill);
    const description = (!quill || isEmpty) ? '' : quill.root.innerHTML;
    const status = document.getElementById('editPlanningStatus').value;
    const period = document.getElementById('editPlanningPeriod').value;
    // 공개 범위 — 관리자만 회사 ↔ 개인 이동 가능. 그 외엔 기존 값 유지
    const accessEl = document.getElementById('editPlanningAccess');
    const prevAccess = p.access || 'company';
    let access = (planningIsAdmin() && accessEl) ? accessEl.value : prevAccess;
    // 'family' 레거시 보호: 가족 프로젝트도 회사 메뉴에 노출되므로, 회사를 그대로 두면 family 유지
    if (prevAccess === 'family' && access === 'company') access = 'family';
    const accessChanged = access !== prevAccess;
    // 회사 → 개인으로 이동 시 본인을 소유자로 지정 (개인 메뉴에서 보이도록)
    const newOwnerLogin = (accessChanged && access === 'personal') ? planningCurrentOwner() : (p.ownerLogin || '');
    const editLocEl = document.getElementById('editPlanningLocation');
    const editCostEl = document.getElementById('editPlanningCost');
    const location = editLocEl && editLocEl.offsetParent !== null ? (editLocEl.value || '').trim() : '';
    const editCostStr = editCostEl && editCostEl.offsetParent !== null ? (editCostEl.value || '') : '';
    const cost = editCostStr ? Number(editCostStr.replace(/[^0-9]/g, '')) : null;
    const targetMonth = period === 'month' ? (document.getElementById('editPlanningTargetMonth').value || '') : '';
    const targetYear = period === 'year' ? (document.getElementById('editPlanningTargetYear').value || '') : '';
    let deadline = document.getElementById('editPlanningDeadline').value || '';
    if (!deadline) {
        if (period === 'month' && targetMonth) deadline = planningLastDayOfMonth(targetMonth);
        else if (period === 'year' && targetYear) deadline = planningLastDayOfYear(targetYear);
    }
    const patch = {
        name, description, status, period, access,
        target_month: targetMonth, target_year: targetYear,
        deadline: deadline || null,
        location: location || '',
        cost: cost == null ? null : cost,
        owner_login: newOwnerLogin,
        updated_at: new Date().toISOString()
    };
    try {
        const { error } = await sb.from('planning_projects').update(patch).eq('id', id);
        if (error) throw error;
        closeModal();
        if (accessChanged) {
            // 이동된 메뉴로 전환 (회사 ↔ 개인)
            currentPlanningProjectId = null;
            switchTab('planning-' + access);
            showToast(access === 'company' ? '🏢 회사 프로젝트로 이동했습니다' : '🔒 개인 프로젝트로 이동했습니다');
        } else {
            await renderPlanning();
            showToast('수정되었습니다');
        }
    } catch (err) {
        console.error(err);
        showToast('수정 실패: ' + err.message);
    }
}
async function deletePlanningProject(id) {
    if (!confirm('이 프로젝트를 삭제할까요? 모든 게시물이 함께 사라집니다.')) return;
    try {
        const { error } = await sb.from('planning_projects').delete().eq('id', id);
        if (error) throw error;
        currentPlanningProjectId = null;
        await renderPlanning();
        showToast('삭제되었습니다');
    } catch (err) {
        console.error(err);
        showToast('삭제 실패: ' + err.message);
    }
}
async function updatePlanningStatus(id, newStatus) {
    try {
        const { error } = await sb.from('planning_projects').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        const p = planningProjects.find(x => x.id === id);
        if (p) { p.status = newStatus; p.updatedAt = new Date().toISOString(); }
        showToast(`상태: ${newStatus}`);
    } catch (err) {
        console.error(err);
        showToast('상태 저장 실패: ' + err.message);
    }
}
// planningPendingImages: [{file: File|null, url: string (preview or final URL)}]
let planningPendingImages = [];
let planningImageDragIdx = null;
function refreshPlanningImagePreview() {
    const box = document.getElementById('planningImagePreview');
    if (!box) return;
    const total = planningPendingImages.length;
    const hint = total > 1 ? `<div style="width:100%;font-size:11px;color:var(--gray-500);margin-bottom:4px">💡 사진을 드래그하거나 ◀ ▶ 버튼으로 순서를 바꿀 수 있습니다</div>` : '';
    box.innerHTML = hint + planningPendingImages.map((item, i) => `
        <div draggable="true"
             ondragstart="planningImageDragStart(event, ${i})"
             ondragover="planningImageDragOver(event)"
             ondragleave="planningImageDragLeave(event)"
             ondrop="planningImageDrop(event, ${i})"
             ondragend="planningImageDragEnd(event)"
             data-img-idx="${i}"
             style="position:relative;display:inline-flex;flex-direction:column;align-items:center;gap:4px;padding:6px;border:1px solid var(--gray-200);border-radius:10px;background:var(--white);cursor:grab;transition:all .12s">
            <div style="position:relative">
                <img src="${planningEsc(item.url)}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;pointer-events:none">
                <span style="position:absolute;top:2px;left:2px;background:rgba(0,0,0,0.7);color:white;font-size:10px;font-weight:800;padding:1px 6px;border-radius:4px">${i + 1}</span>
                ${item.file ? `<span style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.6);color:white;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px">업로드 대기</span>` : ''}
                <button type="button" onclick="removePlanningPendingImage(${i})" style="position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:var(--red);color:white;border:none;font-size:12px;font-weight:700;cursor:pointer;line-height:1;z-index:2">×</button>
            </div>
            ${total > 1 ? `<div style="display:flex;gap:2px;width:100%;justify-content:center">
                <button type="button" onclick="movePlanningPendingImage(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="왼쪽으로" style="flex:1;padding:2px;background:${i === 0 ? 'var(--gray-50)' : 'var(--gray-100)'};color:${i === 0 ? 'var(--gray-300)' : 'var(--gray-700)'};border:none;border-radius:4px;font-size:11px;font-weight:700;cursor:${i === 0 ? 'not-allowed' : 'pointer'};line-height:1">◀</button>
                <button type="button" onclick="movePlanningPendingImage(${i}, 1)" ${i === total - 1 ? 'disabled' : ''} title="오른쪽으로" style="flex:1;padding:2px;background:${i === total - 1 ? 'var(--gray-50)' : 'var(--gray-100)'};color:${i === total - 1 ? 'var(--gray-300)' : 'var(--gray-700)'};border:none;border-radius:4px;font-size:11px;font-weight:700;cursor:${i === total - 1 ? 'not-allowed' : 'pointer'};line-height:1">▶</button>
            </div>` : ''}
        </div>`).join('');
}
function removePlanningPendingImage(idx) {
    const item = planningPendingImages[idx];
    if (item && item.file && item.url && item.url.startsWith('blob:')) {
        try { URL.revokeObjectURL(item.url); } catch (_) {}
    }
    planningPendingImages.splice(idx, 1);
    refreshPlanningImagePreview();
}
function movePlanningPendingImage(idx, delta) {
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= planningPendingImages.length) return;
    const [item] = planningPendingImages.splice(idx, 1);
    planningPendingImages.splice(newIdx, 0, item);
    refreshPlanningImagePreview();
}
function planningImageDragStart(ev, idx) {
    planningImageDragIdx = idx;
    ev.dataTransfer.effectAllowed = 'move';
    try { ev.dataTransfer.setData('text/plain', String(idx)); } catch (_) {}
    ev.currentTarget.style.opacity = '0.4';
}
function planningImageDragOver(ev) {
    if (planningImageDragIdx === null) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    ev.currentTarget.style.borderColor = 'var(--blue)';
    ev.currentTarget.style.background = 'var(--blue-light, #DBEAFE)';
}
function planningImageDragLeave(ev) {
    if (ev.currentTarget.contains(ev.relatedTarget)) return;
    ev.currentTarget.style.borderColor = '';
    ev.currentTarget.style.background = '';
}
function planningImageDrop(ev, targetIdx) {
    ev.preventDefault();
    ev.currentTarget.style.borderColor = '';
    ev.currentTarget.style.background = '';
    const fromIdx = planningImageDragIdx;
    planningImageDragIdx = null;
    if (fromIdx === null || fromIdx === targetIdx) return;
    const [item] = planningPendingImages.splice(fromIdx, 1);
    planningPendingImages.splice(targetIdx, 0, item);
    refreshPlanningImagePreview();
}
function planningImageDragEnd(ev) {
    planningImageDragIdx = null;
    ev.currentTarget.style.opacity = '';
}
function handlePlanningImageFiles(ev) {
    const files = Array.from(ev.target.files || []);
    files.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        planningPendingImages.push({ file, url: URL.createObjectURL(file) });
    });
    refreshPlanningImagePreview();
    ev.target.value = '';
}
function addPlanningImageUrl() {
    const el = document.getElementById('planningPostImageUrl');
    if (!el) return;
    const url = (el.value || '').trim();
    if (!url) return;
    planningPendingImages.push({ file: null, url });
    el.value = '';
    refreshPlanningImagePreview();
}
async function resolvePlanningPendingImages() {
    const out = [];
    for (const item of planningPendingImages) {
        if (item.file) {
            const publicUrl = await uploadPlanningImage(item.file);
            out.push(publicUrl);
            if (item.url && item.url.startsWith('blob:')) {
                try { URL.revokeObjectURL(item.url); } catch (_) {}
            }
        } else if (item.url) {
            out.push(item.url);
        }
    }
    return out;
}
function openPlanningImage(src) {
    const win = window.open('', '_blank');
    if (win) win.document.write(`<title>이미지</title><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${src}" style="max-width:100%;max-height:100vh"></body>`);
}

// 폴더 경로 클릭: 클립보드 복사 + file:// 열기 시도 (브라우저 보안상 https에서는 대부분 차단됨)
function openFolderPath(rawPath) {
    if (!rawPath) return;
    const path = String(rawPath).trim();
    const copy = (text, ok, fail) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(ok).catch(fail);
        } else {
            try {
                const ta = document.createElement('textarea');
                ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                ok();
            } catch (e) { fail(e); }
        }
    };
    copy(path,
        () => {
            showToast('📋 경로 복사 완료 — 탐색기 주소창에 붙여넣기');
            // file:// 열기 시도 (브라우저가 차단할 수 있음 — 차단되어도 무해)
            try {
                let url = path.replace(/\\/g, '/');
                if (!/^[a-zA-Z]+:\/\//.test(url)) url = 'file:///' + url.replace(/^\/+/, '');
                window.open(url, '_blank');
            } catch (_) {}
        },
        () => { showToast('복사 실패 — 직접 복사해주세요'); }
    );
}
async function deletePlanningPost(postId) {
    if (!confirm('이 카드를 삭제할까요? (답글도 함께 삭제)')) return;
    const p = planningProjects.find(x => x.id === currentPlanningProjectId);
    if (!p) return;
    const target = (p.posts || []).find(x => x.id === postId);
    const isReply = target && target.parentId;
    try {
        // 자식 먼저 삭제 후 본인 삭제
        await sb.from('planning_posts').delete().eq('parent_id', postId);
        const { error } = await sb.from('planning_posts').delete().eq('id', postId);
        if (error) throw error;
        p.posts = (p.posts || []).filter(x => x.id !== postId && x.parentId !== postId);
        const modalOpen = document.getElementById('modalOverlay').classList.contains('show');
        if (isReply && modalOpen) openPlanningPostDetail(target.parentId);
        await renderPlanning({ skipLoad: true });
    } catch (err) {
        console.error(err);
        showToast('삭제 실패: ' + err.message);
    }
}

// =====================================
// 견적서 만들기 (단독 견적서) — Supabase quotes 테이블
// =====================================
let quotes = [];
let _editingQuoteId = null;
let _previewingQuote = null;
let currentQuoteYear = 'all';
let currentQuoteMonth = 'all';

// 표준 옵션 (기타는 커스텀 입력)
const QUOTE_PRINT_METHODS = ['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사'];
const QUOTE_PACKAGING_OPTIONS = ['개별박스','선물포장','선물포장+라벨부착','에어캡포장'];

function defaultQuoteItem() {
    return {
        productName: '',
        quantity: 0,
        unit: '개',
        unitPrice: 0,
        unitPriceVat: 'VAT 별도',
        printMethod: '없음',
        printFee: 0,
        printFeeVat: 'VAT 별도',
        printFeeApply: '1개당',
        packaging: '개별박스',
        packagingFee: 0,
        packagingFeeVat: 'VAT 별도',
        packagingFeeApply: '1개당',
        moldFee: 0,
        moldFeeVat: 'VAT 별도',
        moldFeeApply: '일괄',
        sampleFee: 0,
        sampleFeeVat: 'VAT 별도',
        sampleFeeApply: '일괄'
    };
}

// 표준 옵션이면 그대로, 아니면 '기타' + 커스텀 값으로 분리
function resolveQuoteOption(value, options) {
    return options.includes(value) ? { selected: value, custom: '' } : { selected: '기타', custom: value || '' };
}

function quoteFromDb(r) {
    let items = Array.isArray(r.items) && r.items.length ? r.items.map(it => Object.assign(defaultQuoteItem(), it)) : null;
    if (!items) {
        // 레거시: flat 컬럼으로부터 단일 품목 배열 복원
        items = [Object.assign(defaultQuoteItem(), {
            productName: r.product_name || '',
            quantity: Number(r.quantity) || 0,
            unit: r.unit || '개',
            unitPrice: Number(r.unit_price) || 0,
            unitPriceVat: r.unit_price_vat || 'VAT 별도',
            printMethod: r.print_method || '없음',
            printFee: Number(r.print_fee) || 0,
            printFeeVat: r.print_fee_vat || 'VAT 별도',
            printFeeApply: r.print_fee_apply || '1개당',
            packaging: r.packaging || '개별박스',
            packagingFee: Number(r.packaging_fee) || 0,
            packagingFeeVat: r.packaging_fee_vat || 'VAT 별도',
            packagingFeeApply: r.packaging_fee_apply || '1개당'
        })];
    }
    return {
        id: r.id,
        docNumber: r.doc_number || '',
        date: r.doc_date || '',
        validUntil: r.valid_until || '',
        companyName: r.company_name || '',
        contactPerson: r.contact_person || '',
        manager: r.manager || '',
        items: items,
        shippingType: r.shipping_type || '',
        shippingCost: Number(r.shipping_cost) || 0,
        shippingVat: r.shipping_vat || 'VAT 별도',
        deliveryDate: r.delivery_date || '',
        recipient: r.recipient || '',
        phone: r.phone || '',
        address: r.address || '',
        note: r.note || '',
        author: r.author || '',
        createdAt: r.created_at || ''
    };
}

function quoteToDb(q) {
    const items = Array.isArray(q.items) && q.items.length ? q.items : [defaultQuoteItem()];
    const first = items[0];
    return {
        doc_number: q.docNumber || null,
        doc_date: q.date,
        valid_until: q.validUntil || null,
        company_name: q.companyName,
        contact_person: q.contactPerson || '',
        manager: q.manager || '',
        // items JSONB (정식 저장소) + 첫 품목은 flat 컬럼에도 저장(NOT NULL 컬럼 + 레거시 조회 호환)
        items: items,
        product_name: first.productName || '',
        quantity: Number(first.quantity) || 0,
        unit: first.unit || '개',
        unit_price: Number(first.unitPrice) || 0,
        unit_price_vat: first.unitPriceVat || 'VAT 별도',
        color: first.color || '-',
        print_color_size: first.printColorSize || '시안 확인',
        print_method: first.printMethod || '없음',
        print_fee: Number(first.printFee) || 0,
        print_fee_vat: first.printFeeVat || 'VAT 별도',
        print_fee_apply: first.printFeeApply || '1개당',
        packaging: first.packaging || '개별박스',
        packaging_fee: Number(first.packagingFee) || 0,
        packaging_fee_vat: first.packagingFeeVat || 'VAT 별도',
        packaging_fee_apply: first.packagingFeeApply || '1개당',
        shipping_type: q.shippingType || '',
        shipping_cost: Number(q.shippingCost) || 0,
        shipping_vat: q.shippingVat || 'VAT 별도',
        delivery_date: q.deliveryDate || null,
        recipient: q.recipient || '',
        phone: q.phone || '',
        address: q.address || '',
        note: q.note || '',
        author: q.author || ''
    };
}

async function loadQuotesFromDb() {
    try {
        const { data, error } = await sb.from('quotes').select('*').order('doc_date', { ascending: false }).order('id', { ascending: false });
        if (error) throw error;
        quotes.length = 0;
        (data || []).forEach(r => quotes.push(quoteFromDb(r)));
    } catch (err) {
        console.error('견적서 로드 실패:', err.message);
        showToast('견적서 로드 실패: ' + err.message);
    }
}

async function dbInsertQuote(q) {
    const { data, error } = await sb.from('quotes').insert(quoteToDb(q)).select().single();
    if (error) { console.error(error); showToast('견적서 저장 실패: ' + error.message); return null; }
    return quoteFromDb(data);
}

async function dbUpdateQuote(id, q) {
    const { data, error } = await sb.from('quotes').update(quoteToDb(q)).eq('id', id).select().single();
    if (error) { console.error(error); showToast('견적서 수정 실패: ' + error.message); return null; }
    return quoteFromDb(data);
}

async function dbDeleteQuote(id) {
    const { error } = await sb.from('quotes').delete().eq('id', id);
    if (error) { console.error(error); showToast('견적서 삭제 실패: ' + error.message); return false; }
    return true;
}

// 견적 계산 — 다중 품목 지원
// 반환: { items: [{prodT, prodV, prT, prV, pkT, pkV, hasPr, hasPk}, ...],
//          shT, shV, hasSh, sup, vat, grand }
function calcQuoteFromFields(q) {
    const items = Array.isArray(q.items) ? q.items : [];
    let sup = 0, vat = 0;
    const perItem = items.map(it => {
        const qty = Number(it.quantity) || 0;
        const up = Number(it.unitPrice) || 0;
        const prodT = up * qty;
        const prodV = it.unitPriceVat === 'VAT 별도' ? Math.round(prodT * 0.1) : 0;
        const pf = Number(it.printFee) || 0;
        const hasPr = pf > 0 || (it.printMethod && it.printMethod !== '없음');
        const prT = pf > 0 ? (it.printFeeApply === '1개당' ? pf * qty : pf) : 0;
        const prV = (it.printFeeVat === 'VAT 별도') ? Math.round(prT * 0.1) : 0;
        const pkf = Number(it.packagingFee) || 0;
        const hasPk = pkf > 0;
        const pkT = hasPk ? (it.packagingFeeApply === '1개당' ? pkf * qty : pkf) : 0;
        const pkV = (it.packagingFeeVat === 'VAT 별도') ? Math.round(pkT * 0.1) : 0;
        const mf = Number(it.moldFee) || 0;
        const hasMold = mf > 0;
        const mT = hasMold ? (it.moldFeeApply === '1개당' ? mf * qty : mf) : 0;
        const mV = (it.moldFeeVat === 'VAT 별도') ? Math.round(mT * 0.1) : 0;
        const sf = Number(it.sampleFee) || 0;
        const hasSample = sf > 0;
        const sT = hasSample ? (it.sampleFeeApply === '1개당' ? sf * qty : sf) : 0;
        const sV = (it.sampleFeeVat === 'VAT 별도') ? Math.round(sT * 0.1) : 0;
        sup += prodT + prT + pkT + mT + sT;
        vat += prodV + prV + pkV + mV + sV;
        return { prodT, prodV, prT, prV, pkT, pkV, mT, mV, sT, sV, hasPr, hasPk, hasMold, hasSample };
    });
    const shT = Number(q.shippingCost) || 0;
    const hasSh = shT > 0;
    const shV = (hasSh && q.shippingVat === 'VAT 별도') ? Math.round(shT * 0.1) : 0;
    sup += shT;
    vat += shV;
    return { items: perItem, shT, shV, hasSh, sup, vat, grand: sup + vat };
}

// ===== 리스트 뷰 =====
function renderQuoteDateFilter() {
    const container = document.getElementById('quoteDateFilter');
    if (!container) return;
    const years = [...new Set(quotes.map(q => (q.date || '').split('-')[0]).filter(Boolean))].sort().reverse();
    const html = `
        <select class="date-filter-select" id="quoteYearSelect" onchange="setQuoteYear(this.value)">
            <option value="all" ${currentQuoteYear === 'all' ? 'selected' : ''}>전체 연도</option>
            ${years.map(y => `<option value="${y}" ${currentQuoteYear === y ? 'selected' : ''}>${y}년</option>`).join('')}
        </select>
        <select class="date-filter-select" id="quoteMonthSelect" onchange="setQuoteMonth(this.value)">
            <option value="all" ${currentQuoteMonth === 'all' ? 'selected' : ''}>전체 월</option>
            ${Array.from({length:12}, (_, i) => {
                const m = String(i+1).padStart(2,'0');
                return `<option value="${m}" ${currentQuoteMonth === m ? 'selected' : ''}>${i+1}월</option>`;
            }).join('')}
        </select>`;
    container.innerHTML = html;
}

function setQuoteYear(v) { currentQuoteYear = v; renderQuotes(); }
function setQuoteMonth(v) { currentQuoteMonth = v; renderQuotes(); }

function renderQuotes() {
    renderQuoteDateFilter();
    const searchEl = document.getElementById('quoteSearch');
    const search = (searchEl ? searchEl.value : '').trim().toLowerCase();

    const filtered = quotes.filter(q => {
        if (currentQuoteYear !== 'all' && !(q.date || '').startsWith(currentQuoteYear)) return false;
        if (currentQuoteMonth !== 'all') {
            const parts = (q.date || '').split('-');
            if (parts[1] !== currentQuoteMonth) return false;
        }
        if (search) {
            const items = Array.isArray(q.items) ? q.items : [];
            const productNames = items.map(it => it.productName || '').join(' ');
            const hay = `${q.companyName} ${q.contactPerson} ${productNames} ${q.docNumber} ${q.manager}`.toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    const stats = document.getElementById('quoteStats');
    if (stats) {
        const total = filtered.reduce((s, q) => s + calcQuoteFromFields(q).grand, 0);
        stats.innerHTML = `총 <b>${filtered.length}</b>건 · 합계 <b>${total.toLocaleString()}</b>원`;
    }

    const fmtDisplayDate = d => d ? d.replace(/-/g, '.') : '-';
    let tableHtml = '';
    let cardHtml = '';
    filtered.forEach(q => {
        const est = calcQuoteFromFields(q);
        const items = Array.isArray(q.items) ? q.items : [];
        const first = items[0] || { productName: '', quantity: 0, unit: '' };
        const productDisplay = items.length > 1
            ? `${escHtml(first.productName)} <span style="color:var(--gray-400);font-size:12px">외 ${items.length - 1}건</span>`
            : escHtml(first.productName);
        const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
        const qtyDisplay = items.length > 1
            ? `${totalQty.toLocaleString()} <span style="color:var(--gray-400);font-size:12px">(${items.length}종)</span>`
            : `${(first.quantity || 0).toLocaleString()} ${escHtml(first.unit || '')}`;

        tableHtml += `<tr>
            <td>${fmtDisplayDate(q.date)}</td>
            <td>${q.docNumber || '-'}</td>
            <td style="font-weight:700">${escHtml(q.companyName)}</td>
            <td>${escHtml(q.contactPerson)}</td>
            <td>${productDisplay}</td>
            <td style="text-align:right">${qtyDisplay}</td>
            <td style="text-align:right;font-weight:700;color:#0B4F8F">${est.grand.toLocaleString()}원</td>
            <td>${escHtml(q.manager || '-')}</td>
            <td style="white-space:nowrap">
                <button class="edit-btn" onclick="openQuotePreviewById(${q.id})" style="color:#0B4F8F">미리보기</button>
                <button class="edit-btn" onclick="openQuoteModal(${q.id})">편집</button>
                <button class="edit-btn" onclick="cloneQuote(${q.id})" title="복제">복제</button>
                <button class="edit-btn" onclick="deleteQuote(${q.id})" style="color:var(--red)">삭제</button>
            </td>
        </tr>`;

        cardHtml += `<div class="resp-card">
            <div class="resp-card-top">
                <div class="resp-card-title">${escHtml(q.companyName)}</div>
                <div style="display:flex;gap:6px">
                    <button class="edit-btn" onclick="openQuotePreviewById(${q.id})" style="color:#0B4F8F">미리보기</button>
                    <button class="edit-btn" onclick="openQuoteModal(${q.id})">편집</button>
                </div>
            </div>
            <div class="resp-card-meta">
                <div class="resp-card-row"><strong>${productDisplay}</strong></div>
                <div class="resp-card-row">${fmtDisplayDate(q.date)} · ${escHtml(q.docNumber || '-')}</div>
                <div class="resp-card-row">${qtyDisplay} · <span style="color:#0B4F8F;font-weight:800">${est.grand.toLocaleString()}원</span></div>
                <div class="resp-card-row">담당자: ${escHtml(q.contactPerson)} · 본사: ${escHtml(q.manager || '-')}</div>
                <div style="display:flex;gap:6px;margin-top:6px">
                    <button class="edit-btn" onclick="cloneQuote(${q.id})">복제</button>
                    <button class="edit-btn" onclick="deleteQuote(${q.id})" style="color:var(--red)">삭제</button>
                </div>
            </div>
        </div>`;
    });

    const tbody = document.getElementById('quotesTableBody');
    if (tbody) tbody.innerHTML = tableHtml || `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--gray-400)">견적서가 없습니다. 우측 상단 <b>새 견적서 만들기</b> 버튼을 눌러 작성하세요.</td></tr>`;
    const cards = document.getElementById('quotesCardGrid');
    if (cards) cards.innerHTML = cardHtml;
}

function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== 견적서 입력 모달 (국내 프로젝트 스타일 재사용, 다중 품목 + 선택적 부가비용) =====
function _qVatSelect(cls, cur) {
    return `<select class="form-select ${cls}" onchange="recalcQuoteEst()">
        <option ${cur === 'VAT 별도' || !cur ? 'selected' : ''}>VAT 별도</option>
        <option ${cur === 'VAT 포함' ? 'selected' : ''}>VAT 포함</option>
    </select>`;
}
function _qApplySelect(cls, cur, def) {
    const d = cur || def || '1개당';
    return `<select class="form-select ${cls}" onchange="recalcQuoteEst()">
        <option ${d === '1개당' ? 'selected' : ''}>1개당</option>
        <option ${d === '일괄' ? 'selected' : ''}>일괄</option>
    </select>`;
}

function quoteItemCardHtml(idx, it) {
    const sel = (cur, val) => cur === val ? 'selected' : '';
    const removeBtn = idx > 0
        ? `<button type="button" onclick="removeQuoteItem(${idx})" style="padding:4px 10px;border:1px solid var(--red);background:transparent;color:var(--red);border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit">− 품목 삭제</button>`
        : '';

    // 표준 옵션 매핑 (기타 + 커스텀 분리)
    const pm = resolveQuoteOption(it.printMethod || '없음', QUOTE_PRINT_METHODS);
    const pk = resolveQuoteOption(it.packaging || '개별박스', QUOTE_PACKAGING_OPTIONS);

    // 어느 섹션을 펼친 채로 시작할지 (값이 있으면 자동 펼침)
    const showPrint = (it.printMethod && it.printMethod !== '없음') || Number(it.printFee) > 0;
    const showPack = Number(it.packagingFee) > 0;
    const showMold = Number(it.moldFee) > 0;
    const showSample = Number(it.sampleFee) > 0;

    const sectionHeader = (icon, label, key) => `<div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0">
        <div style="font-size:12px;font-weight:800;color:var(--gray-700);letter-spacing:.5px">${icon} ${label}</div>
        <button type="button" onclick="toggleQuoteItemSection(${idx},'${key}',false)" style="padding:2px 10px;border:1px solid var(--gray-300);background:transparent;color:var(--gray-600);border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">× 제거</button>
    </div>`;

    return `<div class="quote-item-card" data-item-idx="${idx}" style="background:var(--white);border:1px solid var(--gray-200);border-radius:10px;padding:16px 20px;margin-bottom:12px;color:var(--gray-900)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div class="form-section-title" style="margin:0;padding:0;border:none">📦 품목 ${idx + 1}</div>
            ${removeBtn}
        </div>

        <!-- 기본 입력: 품명 / 수량 / 단가 -->
        <div class="form-group"><label class="form-label">품명 <span style="color:var(--red)">*</span></label><input type="text" class="form-input qi-productName" placeholder="시계 상패" value="${escHtml(it.productName || '')}"></div>
        <div class="form-row" style="grid-template-columns:2fr 1fr">
            <div class="form-group"><label class="form-label">수량 <span style="color:var(--red)">*</span></label><input type="number" min="0" class="form-input qi-quantity" placeholder="0" value="${it.quantity || ''}" oninput="recalcQuoteEst()"></div>
            <div class="form-group"><label class="form-label">단위</label>
                <select class="form-select qi-unit">
                    ${['개','세트','장','박스','EA'].map(u => `<option ${sel(it.unit || '개', u)}>${u}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row" style="grid-template-columns:2fr 1fr">
            <div class="form-group"><label class="form-label" style="color:var(--blue);font-weight:800">단가 <span style="color:var(--red)">*</span></label><input type="number" min="0" class="form-input qi-unitPrice" placeholder="0" value="${it.unitPrice || ''}" oninput="recalcQuoteEst()"></div>
            <div class="form-group"><label class="form-label">VAT</label>${_qVatSelect('qi-unitPriceVat', it.unitPriceVat || 'VAT 별도')}</div>
        </div>

        <!-- 인쇄 (토글) -->
        <div class="qi-section qi-section-print" style="display:${showPrint ? '' : 'none'};border-top:1px dashed var(--gray-200);margin-top:12px;padding-top:8px">
            ${sectionHeader('🖨️', '인쇄', 'print')}
            <div class="form-row">
                <div class="form-group"><label class="form-label">인쇄 방법</label>
                    <select class="form-select qi-printMethod" onchange="onQuoteOtherSelectChange(this,'qi-printMethodCustom');recalcQuoteEst()">
                        ${QUOTE_PRINT_METHODS.concat(['기타']).map(u => `<option ${sel(pm.selected, u)}>${u}</option>`).join('')}
                    </select>
                    <input type="text" class="form-input qi-printMethodCustom" placeholder="인쇄 방법 직접 입력" value="${escHtml(pm.custom)}" oninput="recalcQuoteEst()" style="margin-top:6px;display:${pm.selected === '기타' ? '' : 'none'}">
                </div>
                <div class="form-group"></div>
            </div>
            <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                <div class="form-group"><label class="form-label">인쇄비</label><input type="number" min="0" class="form-input qi-printFee" placeholder="0" value="${it.printFee || ''}" oninput="recalcQuoteEst()"></div>
                <div class="form-group"><label class="form-label">VAT</label>${_qVatSelect('qi-printFeeVat', it.printFeeVat)}</div>
                <div class="form-group"><label class="form-label">적용</label>${_qApplySelect('qi-printFeeApply', it.printFeeApply, '1개당')}</div>
            </div>
        </div>

        <!-- 포장 (토글) -->
        <div class="qi-section qi-section-pack" style="display:${showPack ? '' : 'none'};border-top:1px dashed var(--gray-200);margin-top:12px;padding-top:8px">
            ${sectionHeader('📦', '포장', 'pack')}
            <div class="form-row">
                <div class="form-group"><label class="form-label">포장</label>
                    <select class="form-select qi-packaging" onchange="onQuoteOtherSelectChange(this,'qi-packagingCustom')">
                        ${QUOTE_PACKAGING_OPTIONS.concat(['기타']).map(u => `<option ${sel(pk.selected, u)}>${u}</option>`).join('')}
                    </select>
                    <input type="text" class="form-input qi-packagingCustom" placeholder="포장 직접 입력" value="${escHtml(pk.custom)}" style="margin-top:6px;display:${pk.selected === '기타' ? '' : 'none'}">
                </div>
                <div class="form-group"></div>
            </div>
            <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                <div class="form-group"><label class="form-label">포장비</label><input type="number" min="0" class="form-input qi-packagingFee" placeholder="0" value="${it.packagingFee || ''}" oninput="recalcQuoteEst()"></div>
                <div class="form-group"><label class="form-label">VAT</label>${_qVatSelect('qi-packagingFeeVat', it.packagingFeeVat)}</div>
                <div class="form-group"><label class="form-label">적용</label>${_qApplySelect('qi-packagingFeeApply', it.packagingFeeApply, '1개당')}</div>
            </div>
        </div>

        <!-- 금형비 (토글) -->
        <div class="qi-section qi-section-mold" style="display:${showMold ? '' : 'none'};border-top:1px dashed var(--gray-200);margin-top:12px;padding-top:8px">
            ${sectionHeader('🔧', '금형비', 'mold')}
            <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                <div class="form-group"><label class="form-label">금형비</label><input type="number" min="0" class="form-input qi-moldFee" placeholder="0" value="${it.moldFee || ''}" oninput="recalcQuoteEst()"></div>
                <div class="form-group"><label class="form-label">VAT</label>${_qVatSelect('qi-moldFeeVat', it.moldFeeVat)}</div>
                <div class="form-group"><label class="form-label">적용</label>${_qApplySelect('qi-moldFeeApply', it.moldFeeApply, '일괄')}</div>
            </div>
        </div>

        <!-- 샘플비 (토글) -->
        <div class="qi-section qi-section-sample" style="display:${showSample ? '' : 'none'};border-top:1px dashed var(--gray-200);margin-top:12px;padding-top:8px">
            ${sectionHeader('🎁', '샘플비', 'sample')}
            <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                <div class="form-group"><label class="form-label">샘플비</label><input type="number" min="0" class="form-input qi-sampleFee" placeholder="0" value="${it.sampleFee || ''}" oninput="recalcQuoteEst()"></div>
                <div class="form-group"><label class="form-label">VAT</label>${_qVatSelect('qi-sampleFeeVat', it.sampleFeeVat)}</div>
                <div class="form-group"><label class="form-label">적용</label>${_qApplySelect('qi-sampleFeeApply', it.sampleFeeApply, '일괄')}</div>
            </div>
        </div>

        <!-- 추가 버튼 (이미 추가된 섹션은 숨김) -->
        <div class="qi-add-buttons" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-100)">
            <button type="button" class="qi-add-print" onclick="toggleQuoteItemSection(${idx},'print',true)" style="flex:1;min-width:120px;padding:8px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:${showPrint ? 'none' : ''}">+ 인쇄 추가</button>
            <button type="button" class="qi-add-pack" onclick="toggleQuoteItemSection(${idx},'pack',true)" style="flex:1;min-width:120px;padding:8px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:${showPack ? 'none' : ''}">+ 포장 추가</button>
            <button type="button" class="qi-add-mold" onclick="toggleQuoteItemSection(${idx},'mold',true)" style="flex:1;min-width:120px;padding:8px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:${showMold ? 'none' : ''}">+ 금형비 추가</button>
            <button type="button" class="qi-add-sample" onclick="toggleQuoteItemSection(${idx},'sample',true)" style="flex:1;min-width:120px;padding:8px 12px;border:1px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:${showSample ? 'none' : ''}">+ 샘플비 추가</button>
        </div>
    </div>`;
}

// 섹션 토글 (펼치기/접기 + 접을 때 값 초기화)
function toggleQuoteItemSection(idx, key, show) {
    const card = document.querySelector(`.quote-item-card[data-item-idx="${idx}"]`);
    if (!card) return;
    const section = card.querySelector(`.qi-section-${key}`);
    const addBtn = card.querySelector(`.qi-add-${key}`);
    if (!section) return;
    if (show) {
        section.style.display = '';
        if (addBtn) addBtn.style.display = 'none';
    } else {
        section.style.display = 'none';
        if (addBtn) addBtn.style.display = '';
        // 값 초기화
        section.querySelectorAll('input').forEach(el => { el.value = ''; el.style.display = el.classList.contains('qi-printMethodCustom') || el.classList.contains('qi-packagingCustom') ? 'none' : ''; });
        section.querySelectorAll('select').forEach(el => { el.selectedIndex = 0; });
        recalcQuoteEst();
    }
}

// 드롭다운에서 '기타' 선택 시 옆 커스텀 입력 토글
function onQuoteOtherSelectChange(selectEl, customCls) {
    const card = selectEl.closest('.quote-item-card');
    if (!card) return;
    const customInput = card.querySelector('.' + customCls);
    if (!customInput) return;
    if (selectEl.value === '기타') {
        customInput.style.display = '';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
}

function addQuoteItem() {
    const list = document.getElementById('quoteItemsList');
    if (!list) return;
    const idx = list.querySelectorAll('.quote-item-card').length;
    list.insertAdjacentHTML('beforeend', quoteItemCardHtml(idx, defaultQuoteItem()));
    recalcQuoteEst();
    const newCard = list.querySelector(`.quote-item-card[data-item-idx="${idx}"]`);
    if (newCard) newCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function removeQuoteItem(idx) {
    const list = document.getElementById('quoteItemsList');
    if (!list) return;
    const cards = list.querySelectorAll('.quote-item-card');
    if (cards.length <= 1) { showToast('최소 1개 이상의 품목이 필요합니다'); return; }
    // 현재 상태 읽어서 삭제 후 다시 렌더 (인덱스 재정렬)
    const items = readQuoteItems();
    items.splice(idx, 1);
    list.innerHTML = items.map((it, i) => quoteItemCardHtml(i, it)).join('');
    recalcQuoteEst();
}

function readQuoteItems() {
    const list = document.getElementById('quoteItemsList');
    if (!list) return [];
    return Array.from(list.querySelectorAll('.quote-item-card')).map(card => {
        const get = cls => (card.querySelector('.' + cls) || {}).value || '';
        // 기타일 경우 커스텀 입력값으로 대체 (없으면 '기타' 그대로)
        const resolveOther = (selVal, customVal) => selVal === '기타' ? (customVal.trim() || '기타') : selVal;
        const printMethod = resolveOther(get('qi-printMethod') || '없음', get('qi-printMethodCustom'));
        const packaging = resolveOther(get('qi-packaging') || '개별박스', get('qi-packagingCustom'));
        return {
            productName: get('qi-productName').trim(),
            quantity: Number(get('qi-quantity')) || 0,
            unit: get('qi-unit') || '개',
            unitPrice: Number(get('qi-unitPrice')) || 0,
            unitPriceVat: get('qi-unitPriceVat') || 'VAT 별도',
            printMethod: printMethod,
            printFee: Number(get('qi-printFee')) || 0,
            printFeeVat: get('qi-printFeeVat') || 'VAT 별도',
            printFeeApply: get('qi-printFeeApply') || '1개당',
            packaging: packaging,
            packagingFee: Number(get('qi-packagingFee')) || 0,
            packagingFeeVat: get('qi-packagingFeeVat') || 'VAT 별도',
            packagingFeeApply: get('qi-packagingFeeApply') || '1개당',
            moldFee: Number(get('qi-moldFee')) || 0,
            moldFeeVat: get('qi-moldFeeVat') || 'VAT 별도',
            moldFeeApply: get('qi-moldFeeApply') || '일괄',
            sampleFee: Number(get('qi-sampleFee')) || 0,
            sampleFeeVat: get('qi-sampleFeeVat') || 'VAT 별도',
            sampleFeeApply: get('qi-sampleFeeApply') || '일괄'
        };
    });
}

function openQuoteModal(id) {
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const isEdit = id != null;
    const q = isEdit ? quotes.find(x => x.id === id) : null;
    _editingQuoteId = isEdit ? id : null;

    const today = getTodayStr();
    const v = (field, def = '') => q && q[field] != null && q[field] !== '' ? q[field] : def;
    const sel = (cur, val) => cur === val ? 'selected' : '';
    const mgrDefault = q ? (q.manager || loginManagerDisplay()) : loginManagerDisplay();
    const secCard = inner => `<div style="background:var(--white);border:1px solid var(--gray-200);border-radius:10px;padding:16px 20px;margin-bottom:16px;color:var(--gray-900)">${inner}</div>`;
    const items = (q && Array.isArray(q.items) && q.items.length) ? q.items : [defaultQuoteItem()];

    title.textContent = isEdit ? `견적서 편집 — ${q.companyName}` : '새 견적서';

    body.innerHTML = `
        <datalist id="quoteClientsListModal">${(typeof clients !== 'undefined' ? clients : []).map(c => `<option value="${(c.companyName || '').replace(/"/g, '&quot;')}"></option>`).join('')}</datalist>

        ${secCard(`
            <div class="form-section-title">📋 문서 정보</div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">발행일 <span style="color:var(--red)">*</span></label><input type="date" class="form-input" id="qDate" value="${v('date', today)}"></div>
                <div class="form-group"><label class="form-label">유효기간</label><input type="date" class="form-input" id="qValidUntil" value="${v('validUntil', addDays(today, 7))}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">업체명 <span style="color:var(--red)">*</span></label><input type="text" class="form-input" id="qCompanyName" list="quoteClientsListModal" autocomplete="off" placeholder="거래처명" value="${escHtml(v('companyName'))}"></div>
                <div class="form-group"><label class="form-label">담당자</label><input type="text" class="form-input" id="qContactPerson" placeholder="담당자님" value="${escHtml(v('contactPerson'))}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">본사 담당자</label>
                    <select class="form-select" id="qManager">
                        ${['이현주 실장','김현호 팀장','유지은 대리'].map(m => `<option ${sel(mgrDefault, m)}>${m}</option>`).join('')}
                    </select>
                </div>
            </div>
        `)}

        <div id="quoteItemsList">
            ${items.map((it, i) => quoteItemCardHtml(i, it)).join('')}
        </div>

        <button type="button" onclick="addQuoteItem()" style="width:100%;padding:12px;border:2px dashed var(--gray-300);background:transparent;color:var(--gray-700);border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:16px">+ 품목 추가</button>

        ${secCard(`
            <div class="form-section-title">🚚 배송</div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">배송 방법</label>
                    <select class="form-select" id="qShippingType" onchange="recalcQuoteEst()">
                        <option value="" ${!v('shippingType') ? 'selected' : ''}>없음</option>
                        <option ${sel(v('shippingType'), '택배')}>택배</option>
                        <option ${sel(v('shippingType'), '퀵')}>퀵</option>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">배송비</label><input type="number" min="0" class="form-input" id="qShippingCost" placeholder="0" value="${v('shippingCost') || ''}" oninput="recalcQuoteEst()"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">VAT</label>
                    <select class="form-select" id="qShippingVat" onchange="recalcQuoteEst()">
                        <option ${sel(v('shippingVat','VAT 별도'), 'VAT 별도')}>VAT 별도</option>
                        <option ${sel(v('shippingVat'), 'VAT 포함')}>VAT 포함</option>
                    </select>
                </div>
                <div class="form-group"></div>
            </div>
        `)}

        ${secCard(`
            <div class="form-section-title">📝 납기 및 수령 (선택)</div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">납기일</label><input type="date" class="form-input" id="qDeliveryDate" value="${v('deliveryDate')}"></div>
                <div class="form-group"><label class="form-label">수령인</label><input type="text" class="form-input" id="qRecipient" placeholder="수령인 이름" value="${escHtml(v('recipient'))}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">핸드폰번호</label><input type="text" class="form-input" id="qPhone" placeholder="010-0000-0000" value="${escHtml(v('phone'))}"></div>
                <div class="form-group"><label class="form-label">주소</label><input type="text" class="form-input" id="qAddress" placeholder="배송지 주소" value="${escHtml(v('address'))}"></div>
            </div>
        `)}

        ${secCard(`
            <div class="form-section-title">💬 비고</div>
            <div class="form-group"><textarea class="form-input" id="qNote" rows="3" placeholder="• 본 견적은 유효기간 내에만 유효하며, 자재·환율 변동 시 조정될 수 있습니다.&#10;• 제품은 선입금 50% 확인 후 제작되며, 잔금 결제 확인 후 출고됩니다." style="resize:vertical;min-height:80px">${escHtml(v('note'))}</textarea></div>
        `)}

        <div id="qEstPreview" style="display:none;background:var(--white);border:1px solid var(--gray-200);border-radius:10px;padding:16px 20px;margin-bottom:16px">
            <div class="form-section-title" style="margin-top:0">💰 최종 견적 금액</div>
            <div id="qEstBody"></div>
        </div>

        <button class="form-submit" onclick="saveQuoteAndPreview()" style="background:linear-gradient(135deg,#16A34A,#15803D)">💰 ${isEdit ? '견적서 수정' : '견적서 만들기'}</button>
    `;

    document.getElementById('modalOverlay').classList.add('show', 'modal-wide');
    openModalHistory();
    const mb = document.getElementById('modalBody');
    if (mb) mb.scrollTop = 0;
    recalcQuoteEst();
}

function readQuoteForm() {
    const v = id => (document.getElementById(id) || {}).value || '';
    return {
        docNumber: _editingQuoteId ? (quotes.find(x => x.id === _editingQuoteId) || {}).docNumber || '' : '',
        date: v('qDate'),
        validUntil: v('qValidUntil'),
        companyName: v('qCompanyName').trim(),
        contactPerson: v('qContactPerson').trim(),
        manager: v('qManager'),
        items: readQuoteItems(),
        shippingType: v('qShippingType'),
        shippingCost: Number(v('qShippingCost')) || 0,
        shippingVat: v('qShippingVat'),
        deliveryDate: v('qDeliveryDate'),
        recipient: v('qRecipient'),
        phone: v('qPhone'),
        address: v('qAddress'),
        note: v('qNote'),
        author: currentUser ? currentUser.name : ''
    };
}

function recalcQuoteEst() {
    const q = readQuoteForm();
    const est = calcQuoteFromFields(q);
    const body = document.getElementById('qEstBody');
    const wrap = document.getElementById('qEstPreview');
    if (!body || !wrap) return;
    const hasAnyValue = (q.items || []).some(it => (Number(it.quantity) > 0) && (Number(it.unitPrice) > 0));
    if (!hasAnyValue) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    const row = (label, val) => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:var(--gray-600)">${label}</span><span style="font-weight:700;color:var(--gray-900)">${val.toLocaleString()}원</span></div>`;
    const itemLines = (q.items || []).map((it, i) => {
        const e = est.items[i] || {};
        const name = (it.productName || '').trim() || `품목 ${i + 1}`;
        const parts = [row(`${escHtml(name)} 공급가`, e.prodT || 0)];
        if (e.prT) parts.push(row(`　└ 인쇄비`, e.prT));
        if (e.hasPk) parts.push(row(`　└ 포장비`, e.pkT || 0));
        if (e.hasMold) parts.push(row(`　└ 금형비`, e.mT || 0));
        if (e.hasSample) parts.push(row(`　└ 샘플비`, e.sT || 0));
        return parts.join('');
    }).join('');
    body.innerHTML = `
        ${itemLines}
        ${est.hasSh ? row('배송비', est.shT) : ''}
        <div style="border-top:1px solid var(--border);margin:8px 0;padding-top:8px">
            ${row('공급가 합계', est.sup)}
            ${row('부가세', est.vat)}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;margin-top:8px;background:linear-gradient(135deg,#0B4F8F,#1a6bb0);color:#fff;border-radius:8px">
            <span style="font-weight:700">최종 합계</span>
            <span style="font-size:20px;font-weight:900">￦${est.grand.toLocaleString()}</span>
        </div>`;
}

function addDays(dateStr, days) {
    try {
        const d = new Date(dateStr);
        if (isNaN(d)) return '';
        d.setDate(d.getDate() + days);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    } catch (e) { return ''; }
}

function loginManagerDisplay() {
    if (!currentUser) return '김현호 팀장';
    const map = { '이현주': '이현주 실장', '김현호': '김현호 팀장', '유지은': '유지은 대리' };
    return map[currentUser.name] || '김현호 팀장';
}

function buildQuoteClientsDatalist() {
    const list = document.getElementById('quoteClientsList');
    if (!list || typeof clients === 'undefined' || !Array.isArray(clients)) return;
    const names = [...new Set(clients.map(c => c.companyName).filter(Boolean))];
    list.innerHTML = names.map(n => `<option value="${escHtml(n)}">`).join('');
}

function nextQuoteDocNumber(dateStr) {
    const yy = (dateStr || getTodayStr()).substring(2, 4);
    const prefix = `Q${yy}-`;
    const existing = quotes
        .map(q => q.docNumber || '')
        .filter(n => n.startsWith(prefix))
        .map(n => parseInt(n.substring(prefix.length), 10))
        .filter(n => !isNaN(n));
    const next = existing.length ? Math.max(...existing) + 1 : 1;
    return prefix + String(next).padStart(3, '0');
}

async function saveQuoteAndPreview() {
    const q = readQuoteForm();
    if (!q.date) { showToast('발행일을 입력해주세요'); document.getElementById('qDate').focus(); return; }
    if (!q.companyName) { showToast('업체명을 입력해주세요'); document.getElementById('qCompanyName').focus(); return; }
    if (!Array.isArray(q.items) || !q.items.length) { showToast('품목이 없습니다'); return; }
    for (let i = 0; i < q.items.length; i++) {
        const it = q.items[i];
        const card = document.querySelector(`.quote-item-card[data-item-idx="${i}"]`);
        const focusField = cls => { const el = card && card.querySelector('.' + cls); if (el) el.focus(); };
        if (!it.productName) { showToast(`품목 ${i + 1}: 품명을 입력해주세요`); focusField('qi-productName'); return; }
        if (!it.quantity) { showToast(`품목 ${i + 1}: 수량을 입력해주세요`); focusField('qi-quantity'); return; }
        if (!it.unitPrice) { showToast(`품목 ${i + 1}: 단가를 입력해주세요`); focusField('qi-unitPrice'); return; }
    }

    let saved;
    if (_editingQuoteId) {
        saved = await dbUpdateQuote(_editingQuoteId, q);
        if (!saved) return;
        const idx = quotes.findIndex(x => x.id === _editingQuoteId);
        if (idx >= 0) quotes[idx] = saved;
        showToast('견적서가 수정되었습니다');
    } else {
        q.docNumber = nextQuoteDocNumber(q.date);
        saved = await dbInsertQuote(q);
        if (!saved) return;
        quotes.unshift(saved);
        showToast('견적서가 저장되었습니다');
    }
    closeModal();
    renderQuotes();
    openQuotePreviewById(saved.id);
}

async function deleteQuote(id) {
    const q = quotes.find(x => x.id === id);
    if (!q) return;
    if (!confirm(`'${q.companyName} — ${q.productName}' 견적서를 삭제할까요?`)) return;
    const ok = await dbDeleteQuote(id);
    if (!ok) return;
    const idx = quotes.findIndex(x => x.id === id);
    if (idx >= 0) quotes.splice(idx, 1);
    renderQuotes();
    showToast('견적서가 삭제되었습니다');
}

async function cloneQuote(id) {
    const src = quotes.find(x => x.id === id);
    if (!src) return;
    const copy = { ...src };
    delete copy.id;
    copy.items = (src.items || []).map(it => ({ ...it })); // 깊은 복사
    copy.date = getTodayStr();
    copy.validUntil = addDays(copy.date, 7);
    copy.docNumber = nextQuoteDocNumber(copy.date);
    copy.author = currentUser ? currentUser.name : '';
    const saved = await dbInsertQuote(copy);
    if (!saved) return;
    quotes.unshift(saved);
    renderQuotes();
    showToast('견적서를 복제했습니다');
    openQuoteModal(saved.id);
}

// ===== 미리보기 =====
function openQuotePreviewById(id) {
    const q = quotes.find(x => x.id === id);
    if (!q) return;
    _previewingQuote = q;
    renderQuotePreviewDoc(q);
    document.getElementById('quotePreviewOverlay').style.display = 'block';
    document.addEventListener('keydown', _quotePreviewEscHandler);
}

function closeQuotePreview() {
    document.getElementById('quotePreviewOverlay').style.display = 'none';
    _previewingQuote = null;
    document.removeEventListener('keydown', _quotePreviewEscHandler);
}

function _quotePreviewEscHandler(e) {
    if (e.key === 'Escape' || e.key === 'Esc') closeQuotePreview();
}

function _qRowQuote(label, value, highlight, isLast) {
    const br = isLast ? '' : ';border-bottom:1px solid #eef0f5';
    const hl = highlight ? ';font-weight:800;font-size:11.5px' : '';
    return `<tr><td style="padding:5px 10px;background:#f5f7fa;font-weight:700;color:#4a5568;width:72px;text-align:center;border-right:1px solid #e2e6ee${br}">${label}</td><td style="padding:5px 10px;color:#1a1d29${br}${hl}">${value}</td></tr>`;
}

function numToKoreanAmountQuote(n) {
    n = Math.floor(Number(n) || 0);
    if (n <= 0) return '영원 정';
    const digits = ['','일','이','삼','사','오','육','칠','팔','구'];
    const units = ['','십','백','천'];
    const bigUnits = ['','만','억','조','경'];
    let str = '';
    let gi = 0;
    while (n > 0) {
        const g = n % 10000;
        n = Math.floor(n / 10000);
        if (g > 0) {
            let gs = '';
            const s = String(g);
            for (let i = 0; i < s.length; i++) {
                const d = parseInt(s[i]);
                const u = s.length - 1 - i;
                if (d > 0) gs += digits[d] + units[u];
            }
            str = gs + bigUnits[gi] + str;
        }
        gi++;
    }
    return str + '원 정';
}

function renderQuotePreviewDoc(q) {
    const e = calcQuoteFromFields(q);
    const sup = e.sup, vat = e.vat, grand = e.grand;
    const items = Array.isArray(q.items) ? q.items : [];
    const firstItem = items[0] || {};
    const vatLabel = firstItem.unitPriceVat === 'VAT 포함' ? '부가세 포함가' : '부가세 별도가';
    const koreanAmt = numToKoreanAmountQuote(grand);
    const fmtN = n => (Number(n) || 0).toLocaleString();
    const fmtDate = d => d ? d.replace(/-/g, '.') : '';
    const esc = escHtml;

    const headCell = 'background:#f5f7fa;color:#4a5568;padding:8px 6px;font-weight:700;font-size:10px;letter-spacing:.5px;border-bottom:1px solid #d5dae3';
    const itemCell = 'padding:10px 6px;border-bottom:1px solid #eef0f5;text-align:right;color:#0B4F8F;font-weight:700';
    const subCell = 'padding:6px 6px;border-bottom:1px solid #eef0f5;text-align:right;color:#4a5568;font-size:10px';
    const logo = typeof LOGO_DARK !== 'undefined' ? LOGO_DARK : '';
    const stamp = typeof STAMP !== 'undefined' ? STAMP : '';
    const noteText = q.note ? q.note : '• 본 견적은 유효기간 내에만 유효하며, 자재·환율 변동 시 조정될 수 있습니다.\n• 제품은 선입금 50% 확인 후 제작되며, 잔금 결제 확인 후 출고됩니다.';

    // 품목별 행 생성
    const itemRowsHtml = items.map((it, i) => {
        const ei = e.items[i] || {};
        const qty = Number(it.quantity) || 0;
        const up = Number(it.unitPrice) || 0;
        let rows = `<tr>
            <td style="padding:10px 12px;border-bottom:1px solid #eef0f5;font-weight:700;color:#1a1d29;font-size:11px">${esc(it.productName || '')}${it.unitPriceVat === 'VAT 포함' ? ' <span style="font-size:9px;color:#888">(VAT포함)</span>' : ''}</td>
            <td style="${itemCell}">${qty}</td>
            <td style="${itemCell}">${fmtN(up)}</td>
            <td style="${itemCell}">${fmtN(ei.prodT || 0)}</td>
            <td style="${itemCell}">${fmtN(ei.prodV || 0)}</td>
        </tr>`;
        if (ei.hasPr) {
            rows += `<tr>
                <td style="padding:6px 12px;border-bottom:1px solid #eef0f5;color:#4a5568;font-size:10px">　└ 인쇄비 (${esc(it.printMethod || '')}) <span style="font-size:9px;color:#888">${esc(it.printFeeApply)} / ${esc(it.printFeeVat)}</span></td>
                <td style="${subCell}">${it.printFeeApply === '1개당' ? qty : 1}</td>
                <td style="${subCell}">${fmtN(Number(it.printFee) || 0)}</td>
                <td style="${subCell}">${fmtN(ei.prT || 0)}</td>
                <td style="${subCell}">${fmtN(ei.prV || 0)}</td>
            </tr>`;
        }
        if (ei.hasPk) {
            rows += `<tr>
                <td style="padding:6px 12px;border-bottom:1px solid #eef0f5;color:#4a5568;font-size:10px">　└ 포장비 (${esc(it.packaging || '')}) <span style="font-size:9px;color:#888">${esc(it.packagingFeeApply)} / ${esc(it.packagingFeeVat)}</span></td>
                <td style="${subCell}">${it.packagingFeeApply === '1개당' ? qty : 1}</td>
                <td style="${subCell}">${fmtN(Number(it.packagingFee) || 0)}</td>
                <td style="${subCell}">${fmtN(ei.pkT || 0)}</td>
                <td style="${subCell}">${fmtN(ei.pkV || 0)}</td>
            </tr>`;
        }
        if (ei.hasMold) {
            rows += `<tr>
                <td style="padding:6px 12px;border-bottom:1px solid #eef0f5;color:#4a5568;font-size:10px">　└ 금형비 <span style="font-size:9px;color:#888">${esc(it.moldFeeApply || '일괄')} / ${esc(it.moldFeeVat || 'VAT 별도')}</span></td>
                <td style="${subCell}">${it.moldFeeApply === '1개당' ? qty : 1}</td>
                <td style="${subCell}">${fmtN(Number(it.moldFee) || 0)}</td>
                <td style="${subCell}">${fmtN(ei.mT || 0)}</td>
                <td style="${subCell}">${fmtN(ei.mV || 0)}</td>
            </tr>`;
        }
        if (ei.hasSample) {
            rows += `<tr>
                <td style="padding:6px 12px;border-bottom:1px solid #eef0f5;color:#4a5568;font-size:10px">　└ 샘플비 <span style="font-size:9px;color:#888">${esc(it.sampleFeeApply || '일괄')} / ${esc(it.sampleFeeVat || 'VAT 별도')}</span></td>
                <td style="${subCell}">${it.sampleFeeApply === '1개당' ? qty : 1}</td>
                <td style="${subCell}">${fmtN(Number(it.sampleFee) || 0)}</td>
                <td style="${subCell}">${fmtN(ei.sT || 0)}</td>
                <td style="${subCell}">${fmtN(ei.sV || 0)}</td>
            </tr>`;
        }
        return rows;
    }).join('');

    document.getElementById('quotePreviewDocEl').innerHTML =
    `<div id="quotePreviewDocInner" style="width:794px;height:1123px;overflow:hidden;background:#fff;font-family:'Noto Sans KR',sans-serif;color:#1a1d29;position:relative;padding:30px 44px 22px;box-sizing:border-box;display:flex;flex-direction:column">
        <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding-bottom:8px;border-bottom:2px solid #0B4F8F;margin-bottom:10px;gap:14px">
            <div></div>
            <div style="text-align:center">
                <div style="font-family:serif;font-size:10px;color:#C8A35B;letter-spacing:5px;font-weight:700;margin-bottom:2px">ESTIMATE / QUOTATION</div>
                <div style="font-size:32px;font-weight:900;color:#0B4F8F;letter-spacing:14px;padding-left:14px;display:inline-block;line-height:1.1">견 적 서</div>
            </div>
            <div style="text-align:right;font-size:9.5px;color:#666;line-height:1.6;white-space:nowrap">
                문서번호 <b style="color:#0B4F8F">${esc(q.docNumber || '')}</b><br>
                발행일 <b style="color:#0B4F8F">${fmtDate(q.date)}</b>
            </div>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:12px">
            <div style="flex:1;border:1px solid #d5dae3;border-radius:8px;overflow:hidden;background:#fff">
                <div style="background:#0B4F8F;color:#fff;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:2px">수 신 · TO</div>
                <table style="width:100%;border-collapse:collapse;font-size:10.5px">
                    ${_qRowQuote('거래처', esc(q.companyName || ''), true)}
                    ${_qRowQuote('담당자', esc(q.contactPerson || ''))}
                    ${_qRowQuote('TEL/FAX', '')}
                    ${_qRowQuote('결제조건', '')}
                    ${_qRowQuote('유효기간', '<span style="color:#c03545;font-weight:700">발행후 7일간 유효합니다</span>', false, true)}
                </table>
                <div style="padding:7px 12px;background:#f9fafc;border-top:1px solid #eef0f5;font-size:10px;color:#555;line-height:1.6">1. 귀사의 일익 번창하심을 기원합니다.<br>2. 하기와 같이 견적드리오니 검토 부탁드립니다.</div>
            </div>
            <div style="flex:1;border:1px solid #d5dae3;border-radius:8px;overflow:hidden;background:#fff">
                <div style="background:linear-gradient(135deg,#2B3856,#0B4F8F);color:#fff;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:2px">공급자 · FROM</div>
                <div style="padding:10px 10px 8px;background:#fff;border-bottom:1px solid #eef0f5;text-align:center">
                    <img src="${logo}" style="height:24px">
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:10.5px">
                    ${_qRowQuote('사업자번호', '114-81-93170')}
                    ${_qRowQuote('대표자', `<span style="position:relative;display:inline-block">김관택<img src="${stamp}" style="position:absolute;left:40px;top:-8px;width:46px;height:46px;object-fit:contain;pointer-events:none;mix-blend-mode:multiply;z-index:2"></span>`)}
                    ${_qRowQuote('주 소', '<span style="font-size:9.5px;line-height:1.4">서울 구로구 디지털로32길 30,<br>코오롱빌란트1차 901호</span>')}
                    ${_qRowQuote('업태/종목', '<span style="font-size:9.5px">제조·도매 / 시계 판촉물</span>')}
                    ${_qRowQuote('담 당 자', esc(q.manager || ''))}
                    ${_qRowQuote('TEL/FAX', '02-2103-5757', false, true)}
                </table>
            </div>
        </div>
        <div style="background:linear-gradient(135deg,#0B4F8F 0%,#1a6bb0 100%);color:#fff;padding:14px 20px;border-radius:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 12px rgba(11,79,143,.18)">
            <div>
                <div style="font-size:10px;letter-spacing:3px;font-weight:600;color:rgba(255,255,255,.85);margin-bottom:3px">TOTAL AMOUNT</div>
                <div style="font-size:15px;font-weight:800;letter-spacing:.5px">${koreanAmt}</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:26px;font-weight:900;letter-spacing:.5px">￦ ${fmtN(grand)}</div>
                <div style="font-size:10px;color:rgba(255,255,255,.8);margin-top:1px">${vatLabel}</div>
            </div>
        </div>
        <div style="border:1px solid #d5dae3;border-radius:8px 8px 0 0;overflow:hidden;background:#fff;flex:1;display:flex;flex-direction:column">
            <table style="width:100%;border-collapse:collapse;font-size:10.5px">
                <thead><tr>
                    <th style="${headCell};text-align:left;padding-left:12px">품 명 및 규 격</th>
                    <th style="${headCell};width:54px">수 량</th>
                    <th style="${headCell};width:96px">단 가</th>
                    <th style="${headCell};width:108px">공 급 가 액</th>
                    <th style="${headCell};width:96px">부 가 세</th>
                </tr></thead>
                <tbody>
                    ${itemRowsHtml}
                    ${e.hasSh ? `<tr>
                        <td style="padding:8px 12px;border-bottom:1px solid #eef0f5;color:#4a5568;font-size:10.5px">배송비 (${esc(q.shippingType || '')}) <span style="font-size:9px;color:#888">/ ${esc(q.shippingVat)}</span></td>
                        <td style="${itemCell}">1</td>
                        <td style="${itemCell}">${fmtN(q.shippingCost || 0)}</td>
                        <td style="${itemCell}">${fmtN(e.shT)}</td>
                        <td style="${itemCell}">${fmtN(e.shV || 0)}</td>
                    </tr>` : ''}
                    <tr><td colspan="5" style="background:#f5f7fa;text-align:center;font-weight:700;color:#4a5568;font-size:10.5px;padding:6px">- 이 하 여 백 -</td></tr>
                </tbody>
            </table>
        </div>
        <div style="display:flex;border:1px solid #d5dae3;border-top:2px solid #0B4F8F;border-radius:0 0 8px 8px;overflow:hidden;background:#f5f7fa">
            <div style="flex:1;padding:10px 14px;border-right:1px solid #e2e6ee"><div style="font-size:9px;font-weight:700;color:#6b7280;letter-spacing:2px">공급가액 · SUBTOTAL</div><div style="font-size:15px;font-weight:800;color:#1a1d29;margin-top:2px">${fmtN(sup)}</div></div>
            <div style="flex:1;padding:10px 14px;border-right:1px solid #e2e6ee"><div style="font-size:9px;font-weight:700;color:#6b7280;letter-spacing:2px">부가세 · VAT</div><div style="font-size:15px;font-weight:800;color:#1a1d29;margin-top:2px">${fmtN(vat)}</div></div>
            <div style="flex:1;padding:10px 14px;background:#0B4F8F;color:#fff"><div style="font-size:9px;font-weight:700;color:rgba(255,255,255,.8);letter-spacing:2px">합 계 · TOTAL</div><div style="font-size:18px;font-weight:800;color:#fff;margin-top:2px">${fmtN(grand)}</div></div>
        </div>
        <div style="display:flex;border:1px solid #d5dae3;border-radius:8px;overflow:hidden;margin-top:10px;background:#fff">
            <div style="background:#f5f7fa;padding:10px 14px;font-weight:700;font-size:10.5px;color:#4a5568;border-right:1px solid #e2e6ee;display:flex;align-items:center;min-width:60px">비 고</div>
            <div style="padding:10px 14px;flex:1;font-size:10px;color:#666;min-height:36px;line-height:1.6;white-space:pre-line">${esc(noteText)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid #e2e6ee;font-size:9px;color:#888">
            <div>시계전문몰 <span style="color:#0B4F8F;font-weight:600">www.showroom.co.kr</span> &nbsp;·&nbsp; 판촉용품몰 <span style="color:#0B4F8F;font-weight:600">www.agift.kr</span></div>
            <div style="color:#c03545;font-weight:700">klpkorea@agift.kr</div>
        </div>
    </div>`;
}

async function dlQuotePreview(type) {
    if (!_previewingQuote) return;
    const el = document.getElementById('quotePreviewDocEl');
    const b1 = document.getElementById('btnQuotePreviewJpg');
    const b2 = document.getElementById('btnQuotePreviewPdf');
    b1.disabled = b2.disabled = true;
    b1.textContent = '생성 중...';
    b2.textContent = '생성 중...';
    try {
        const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: '#fff', logging: false, width: 794, height: 1123, windowWidth: 794, windowHeight: 1123 });
        const q = _previewingQuote;
        const dateP = (q.date || '').replace(/-/g, '').substring(2);
        const firstItem = (q.items && q.items[0]) || {};
        const productLabel = firstItem.productName ? (firstItem.productName + (q.items.length > 1 ? ` 외 ${q.items.length - 1}건` : '')) : '품명';
        const fname = dateP + '_케이엘피코리아_' + (q.companyName || '업체') + '_' + productLabel + '_견적서';
        if (type === 'jpg') {
            const a = document.createElement('a');
            a.download = fname + '.jpg';
            a.href = canvas.toDataURL('image/jpeg', 0.92);
            a.click();
        } else {
            const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pw = pdf.internal.pageSize.getWidth();
            const ph = pdf.internal.pageSize.getHeight();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pw, ph);
            pdf.save(fname + '.pdf');
        }
    } catch (err) {
        console.error(err);
        showToast('다운로드 실패: ' + err.message);
    }
    b1.disabled = b2.disabled = false;
    b1.textContent = '📷 JPG';
    b2.textContent = '📄 PDF';
}
