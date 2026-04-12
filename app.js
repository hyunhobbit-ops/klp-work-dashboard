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

function updateSidebarUser() {
    const initials = currentUser.name.length >= 2
        ? currentUser.name.slice(-2)
        : currentUser.name;
    document.getElementById('userAvatar').textContent = initials;
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role;
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
    // 프로필 목록 로드 (임원 구분용)
    const { data } = await sb.from('profiles').select('name, role');
    if (data) allProfiles = data;
    await loadDomesticProjectsFromDb();
    renderAll();
    // URL 해시 → 탭 전환 (문서생성기에서 이동해온 경우 등)
    const hash = location.hash.replace('#', '');
    if (hash && document.getElementById('tab-' + hash)) {
        switchTab(hash);
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
    { id: 1, name: "러쉬 성수동 제안", client: "러쉬", supplier: "", status: "진행 중", priority: "🔴 긴급", category: "국내 주문", assignees: ["이현주"], progress: "25%", revenue: 0, startDate: "2026-04-07", deadline: "2026-04-10", checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "내일까지 제안서 준다고 함" },
    { id: 2, name: "지플러스타워 골드바 감사패", client: "지플러스타워", supplier: "", status: "진행 중", priority: "🟡 높음", category: "국내 주문", assignees: ["김현호"], progress: "50%", revenue: 0, startDate: "2026-03-19", deadline: "2026-04-15", checks: { design: true, workOrder: true, advancePayment: true, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "견적 발송 완료" },
    { id: 3, name: "미니클락 스토어팜 판매 계획", client: "자체", supplier: "", status: "진행 중", priority: "🟢 보통", category: "자체 브랜드", assignees: ["이현주", "김현호"], progress: "50%", revenue: 0, startDate: "2026-03-10", deadline: "2026-04-30", checks: { design: true, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "빈티지 시계 + 미니클락 상세 계획 작성" },
    { id: 4, name: "굿즈덕 클로드 리뉴얼", client: "자체", supplier: "", status: "진행 중", priority: "🟢 보통", category: "자체 브랜드", assignees: ["김현호"], progress: "25%", revenue: 0, startDate: "2026-04-01", deadline: "2026-04-30", checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "" },
    { id: 6, name: "빵 주문서 양식 제작", client: "본사", supplier: "", status: "완료", priority: "🟢 보통", category: "기타", assignees: ["김현호"], progress: "100%", revenue: 0, startDate: "2026-03-25", deadline: "2026-03-31", checks: { design: true, workOrder: true, advancePayment: true, finalPayment: true, invoice: true, supplierPayment: true, delivered: true }, memo: "완료" },
    { id: 7, name: "회사 재고 소진 프로젝트", client: "자체", supplier: "", status: "진행 중", priority: "🟡 높음", category: "자체 브랜드", assignees: ["이현주", "김현호"], progress: "25%", revenue: 0, startDate: "2026-03-12", deadline: "2026-12-31", checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "2026년 재고소진의 해" },
    { id: 8, name: "제안서 DB 구축", client: "본사", supplier: "", status: "시작 전", priority: "🟢 보통", category: "기타", assignees: ["이현주"], progress: "0%", revenue: 0, startDate: "", deadline: "2026-04-20", checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "" },
];

// 해외 프로젝트
const overseasProjects = [
    { id: 5, name: "해외 PO 시스템 구축", client: "본사", supplier: "", status: "진행 중", priority: "🟡 높음", category: "해외 주문", assignees: ["이현주"], progress: "75%", revenue: 0, startDate: "2026-03-20", deadline: "2026-04-12", checks: { design: true, workOrder: true, advancePayment: true, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "해외 PO 만들기 진행 중" },
];

// 홈 등에서 전체 프로젝트 참조용
const projects = [...domesticProjects, ...overseasProjects];

const dailyTasks = [
    { id: 1, task: "해외 PO 만들기", date: "2026-04-09", assignee: "이현주", target: "본사", priority: "🔴 긴급", done: false },
    { id: 2, task: "빔프로젝터 알아보기", date: "2026-04-09", assignee: "이현주", target: "본사", priority: "🟡 보통", done: false },
    { id: 3, task: "세무 재고자산 리스트 보내기", date: "2026-04-09", assignee: "이현주", target: "회계", priority: "🔴 긴급", done: false },
    { id: 4, task: "제안서 DB만들기", date: "2026-04-09", assignee: "이현주", target: "본사", priority: "🟡 보통", done: false },
    { id: 5, task: "러쉬성수동 제안서 작성", date: "2026-04-09", assignee: "이현주", target: "거래처", priority: "🔴 긴급", done: false },
    { id: 6, task: "굿즈덕 클로드 리뉴얼 진행", date: "2026-04-09", assignee: "김현호", target: "본사", priority: "🟡 보통", done: false },
    { id: 7, task: "중고나라 사업자 가입 확인", date: "2026-04-09", assignee: "김현호", target: "개인", priority: "🔵 낮음", done: true },
    { id: 8, task: "세무사 최종 마감 결산 보고", date: "2026-04-08", assignee: "이현주", target: "회계", priority: "🔴 긴급", done: true },
    { id: 9, task: "스토어팜 상세페이지 작업", date: "2026-04-08", assignee: "김현호", target: "본사", priority: "🟡 보통", done: true },
    { id: 10, task: "각 중고 채널별 사업자 가입", date: "2026-04-08", assignee: "김현호", target: "개인", priority: "🟡 보통", done: false },
    { id: 11, task: "거래처 견적서 발송", date: "2026-04-10", assignee: "이현주", target: "거래처", priority: "🟡 보통", done: false },
    { id: 12, task: "유튜브 촬영 스케줄 조율", date: "2026-04-10", assignee: "김현호", target: "유튜브", priority: "🔵 낮음", done: false },
    { id: 13, task: "주간 회의 준비", date: "2026-04-09", assignee: "전체", target: "본사", priority: "🟡 보통", done: false },
    { id: 14, task: "월간 보고서 제출", date: "2026-04-10", assignee: "전체", target: "본사", priority: "🔴 긴급", done: false },
    { id: 15, task: "사무실 정리", date: "2026-04-11", assignee: "전체", target: "본사", priority: "🔵 낮음", done: false },
];

const deliveries = [
    { id: 1, recipient: "이기석", date: "2026-04-08", type: "일반", sender: "케이엘피코리아", zipcode: "06234", address: "서울 강남구 역삼동 123-4", phone: "010-1234-5678", payment: "선불", product: "미니클락 골드", tracking: "6012345678901", memo: "", price: 85000, rating: "A 단골가능", seller: "1", author: "김현호" },
    { id: 2, recipient: "최자회", date: "2026-04-08", type: "일반", sender: "케이엘피코리아", zipcode: "13487", address: "경기 성남시 분당구 판교로 256", phone: "010-9876-5432", payment: "선불", product: "대통령 시계 세트", tracking: "6012345678902", memo: "부재시 경비실", price: 150000, rating: "B 대통령시계", seller: "1", author: "김현호" },
    { id: 3, recipient: "김상모", date: "2026-04-08", type: "번개", sender: "김현호", zipcode: "04523", address: "서울 중구 남대문로 1가", phone: "010-5555-1234", payment: "착불", product: "빈티지 세이코 다이버", tracking: "6012345678903", memo: "", price: 280000, rating: "A 단골가능", seller: "2", author: "김현호" },
    { id: 4, recipient: "김윤정", date: "2026-04-07", type: "중고", sender: "이현주", zipcode: "08376", address: "서울 구로구 디지털로 300", phone: "010-3333-4444", payment: "선불", product: "카시오 빈티지", tracking: "6012345678904", memo: "", price: 45000, rating: "C 평범", seller: "1", author: "이현주" },
    { id: 5, recipient: "김석진", date: "2026-04-08", type: "당근", sender: "이현주", zipcode: "03722", address: "서울 서대문구 연세로 50", phone: "010-7777-8888", payment: "선불", product: "벽시계 빈티지", tracking: "", memo: "직거래 예정", price: 35000, rating: "", seller: "1", author: "이현주" },
    { id: 6, recipient: "이서윤", date: "2026-04-03", type: "ETSY", sender: "케이엘피코리아", zipcode: "", address: "CA 90001, Los Angeles", phone: "", payment: "선불", product: "Korean Clock Set", tracking: "EV123456789KR", memo: "해외배송 EMS", price: 120000, rating: "", seller: "1", author: "이현주" },
    { id: 7, recipient: "이재호", date: "2026-04-07", type: "일반", sender: "구정두", zipcode: "41256", address: "대구 동구 동대구로 550", phone: "010-2222-3333", payment: "선불", product: "미니클락 실버", tracking: "6012345678906", memo: "", price: 85000, rating: "C 평범", seller: "1", author: "구정두" },
    { id: 8, recipient: "이영찬", date: "2026-04-07", type: "번개", sender: "김현호", zipcode: "48058", address: "부산 해운대구 해운대로 100", phone: "010-6666-9999", payment: "착불", product: "롤렉스 빈티지", tracking: "6012345678907", memo: "시간 약속 필수", price: 450000, rating: "A 단골가능", seller: "2", author: "김현호" },
    { id: 9, recipient: "김윤수", date: "2026-04-07", type: "일반", sender: "케이엘피코리아", zipcode: "06611", address: "서울 서초구 강남대로 27", phone: "010-1111-2222", payment: "선불", product: "기업 감사패 시계", tracking: "6012345678908", memo: "법인 배송", price: 300000, rating: "A 단골가능", seller: "1", author: "이현주" },
    { id: 10, recipient: "김연지", date: "2026-04-06", type: "GS반택", sender: "이현주", zipcode: "10326", address: "경기 고양시 일산서구 중앙로", phone: "010-4444-5555", payment: "선불", product: "미니클락 핑크", tracking: "", memo: "GS 반택 접수", price: 65000, rating: "", seller: "1", author: "이현주" },
];

// ===== State =====
let currentDate = new Date(2026, 3, 9);
let currentPersonFilter = 'viewall';
let weekOffset = 0;
let monthOffset = 0;
let currentDomesticFilter = 'all';
let currentOverseasFilter = 'all';
let currentDeliveryTypeFilter = 'all';
let currentDeliverySearch = '';
let currentDeliveryYear = 'all';
let currentDeliveryMonth = 'all';

// ===== Page Titles =====
const pageTitles = {
    home: '홈',
    'projects-domestic': '프로젝트 진행사항 — 국내',
    'projects-overseas': '프로젝트 진행사항 — 해외',
    daily: '일일계획표',
    delivery: '택배 관리',
    docs: '회사 문서',
    manual: '회사 매뉴얼',
    clients: '고객사 리스트'
};

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    setupTopbar();
    setupSidebar();
    setupTabs();
    setupFilters();
    setupDateNav();
    setupSearch();
    checkAuth();
});

// ===== Topbar =====
function setupTopbar() {
    const now = new Date(2026, 3, 9);
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

function switchTab(tabId) {
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const navBtn = document.querySelector(`[data-tab="${tabId}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Update content
    document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
    const tab = document.getElementById(`tab-${tabId}`);
    if (tab) tab.classList.add('active');

    // Update page title
    document.getElementById('pageTitle').textContent = pageTitles[tabId] || '';

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');
}

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
}

// ===== Render All =====
function renderAll() {
    renderHome();
    renderProjects();
    renderDaily();
    renderDeliveries();
}

// =====================================
// HOME DASHBOARD
// =====================================
function renderHome() {
    const todayStr = fmtDate(currentDate);
    const activeCount = projects.filter(p => p.status === '진행 중').length;
    const todayItems = dailyTasks.filter(t => t.date === todayStr);
    const todayDone = todayItems.filter(t => t.done).length;
    const rate = todayItems.length ? Math.round((todayDone / todayItems.length) * 100) : 0;
    const monthDel = deliveries.filter(d => d.date.startsWith('2026-04')).length;

    // Summary cards
    document.getElementById('activeProjects').textContent = activeCount;
    document.getElementById('todayTasks').textContent = todayItems.length;
    document.getElementById('completionRate').textContent = rate + '%';
    document.getElementById('monthDelivery').textContent = monthDel;

    // Quick menu counts
    document.getElementById('qProjects').textContent = `${activeCount}건 진행`;
    document.getElementById('qDaily').textContent = `오늘 ${todayItems.length}건`;
    document.getElementById('qDelivery').textContent = `이번달 ${monthDel}건`;

    // Urgent
    const urgentProjects = projects.filter(p => p.priority.includes('긴급') && p.status !== '완료');
    const urgentTasks = dailyTasks.filter(t => t.priority.includes('긴급') && !t.done && t.date <= todayStr);
    document.getElementById('urgentCount').textContent = urgentProjects.length + urgentTasks.length;

    let urgentHtml = '';
    urgentProjects.forEach(p => {
        urgentHtml += `<div class="urgent-item" onclick="showProjectDetail(${p.id})">
            <div class="urgent-dot"></div>
            <div class="urgent-info">
                <div class="urgent-name">${p.name}</div>
                <div class="urgent-sub">${p.assignees.join(', ')} · 마감 ${fmtDisplay(p.deadline)}</div>
            </div>
            <span class="urgent-type">프로젝트</span>
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

    // Today schedule
    const sorted = [...todayItems].sort((a, b) => a.done - b.done);
    let taskHtml = '';
    sorted.forEach(t => {
        taskHtml += `<div class="dash-task-item ${t.done ? 'completed' : ''}">
            <div class="dash-task-check ${t.done ? 'done' : ''}"></div>
            <span class="dash-task-name">${t.task}</span>
            <span class="dash-task-person">${t.assignee}</span>
        </div>`;
    });
    document.getElementById('todaySchedule').innerHTML = taskHtml || empty('오늘 할 일이 없습니다');

    // Project progress
    const activeProjects = projects.filter(p => p.status === '진행 중').slice(0, 5);
    let projHtml = '';
    activeProjects.forEach(p => {
        const pNum = parseInt(p.progress) || 0;
        projHtml += `<div class="dash-proj-item" onclick="showProjectDetail(${p.id})">
            <div class="dash-proj-info">
                <div class="dash-proj-name">${p.name}</div>
                <div class="dash-proj-meta">${p.assignees.join(', ')} · ${p.category}</div>
            </div>
            <div class="dash-proj-progress">
                <div class="progress-cell">
                    <div class="progress-bar"><div class="progress-fill pf-${pNum}"></div></div>
                    <span class="progress-pct">${p.progress}</span>
                </div>
            </div>
        </div>`;
    });
    document.getElementById('dashProjects').innerHTML = projHtml || empty('진행 중 프로젝트 없음');

    // Recent deliveries
    const recent = [...deliveries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    let delHtml = '';
    recent.forEach(d => {
        delHtml += `<div class="dash-del-item" onclick="showDeliveryDetail(${d.id})">
            <span class="dash-del-type badge ${typeBadgeClass(d.type)}">${d.type}</span>
            <div class="dash-del-info">
                <div class="dash-del-name">${d.recipient} — ${d.product}</div>
                <div class="dash-del-sub">${d.sender} · ${d.payment}</div>
            </div>
            <span class="dash-del-date">${fmtDisplay(d.date)}</span>
        </div>`;
    });
    document.getElementById('dashDeliveries').innerHTML = delHtml || empty('최근 택배 없음');
}

// =====================================
// PROJECTS
// =====================================
function renderProjectList(dataArr, filter, tableBodyId, cardGridId) {
    const filtered = filter === 'all' ? dataArr : dataArr.filter(p => p.status === filter);
    const checkSvg = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`;

    let tableHtml = '';
    let cardHtml = '';
    filtered.forEach(p => {
        const pNum = parseInt(p.progress) || 0;
        const checksArr = Object.values(p.checks);
        const checkDots = checksArr.map(v => `<div class="check-dot ${v ? 'done' : ''}">${v ? checkSvg : ''}</div>`).join('');

        const revenueStr = (p.revenue || 0).toLocaleString() + '원';

        tableHtml += `<tr onclick="showProjectDetail(${p.id})">
            <td><strong>${p.client || '-'}</strong></td>
            <td>${p.name}</td>
            <td><span class="badge ${statusBadgeClass(p.status)}">${p.status}</span></td>
            <td>${p.assignees.join(', ')}</td>
            <td>${revenueStr}</td>
            <td>${p.deadline ? fmtDisplay(p.deadline) : '-'}</td>
            <td><div class="progress-cell"><div class="progress-bar"><div class="progress-fill pf-${pNum}"></div></div><span class="progress-pct">${p.progress}</span></div></td>
            <td><div class="checks-row">${checkDots}</div></td>
        </tr>`;

        cardHtml += `<div class="resp-card" onclick="showProjectDetail(${p.id})">
            <div class="resp-card-top">
                <div class="resp-card-title">${p.client || '-'} — ${p.name}</div>
                <span class="badge ${statusBadgeClass(p.status)}">${p.status}</span>
            </div>
            <div class="resp-card-meta">
                <div class="resp-card-row"><strong>${p.assignees.join(', ')}</strong> · 매출 ${revenueStr}</div>
                <div class="resp-card-row">마감 ${p.deadline ? fmtDisplay(p.deadline) : '-'}</div>
                <div class="resp-card-row" style="margin-top:4px"><div class="progress-cell" style="flex:1"><div class="progress-bar"><div class="progress-fill pf-${pNum}"></div></div><span class="progress-pct">${p.progress}</span></div></div>
            </div>
        </div>`;
    });

    document.getElementById(tableBodyId).innerHTML = tableHtml;
    document.getElementById(cardGridId).innerHTML = cardHtml;
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

    // 전체보기 탭: 모든 사용자에게 표시
    html += `<button class="filter-chip ${currentPersonFilter === 'viewall' ? 'active' : ''}" data-person="viewall">전체보기</button>`;

    // 관리자 또는 임원만 대표님 탭 표시
    if (admin || exec) {
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
    const todayStr = fmtDate(currentDate);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const d = currentDate;
    document.getElementById('currentDateDisplay').textContent =
        `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;

    renderDailyPersonFilter();

    const visiblePeople = getVisiblePeople();
    // 현재 필터가 볼 수 없는 사람이면 전체보기로 리셋
    if (currentPersonFilter !== 'viewall' && currentPersonFilter !== 'ceo' && !visiblePeople.includes(currentPersonFilter)) {
        currentPersonFilter = 'viewall';
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
    const showCeoColumn = (currentPersonFilter === 'ceo' || (currentPersonFilter === 'viewall' && (admin || exec)));

    const checkSvg = `<svg width="14" height="14" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`;

    // 컬럼 제목 → 탭 필터 매핑
    function getTitleFilter(title) {
        if (title === '전체 (공통)') return null;
        if (title === '임원') return null;
        if (title === '대표님') return 'ceo';
        return title; // 개인 이름은 그대로
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
                    <input type="text" class="daily-inline-input" placeholder="할 일 입력 후 Enter" onkeydown="if(event.key==='Enter')inlineAddTask(this,'${assignee}')">
                </div>
            </div>
        </div>`;
    }

    let html = '';

    // "전체" 공통 할 일 컬럼 (담당자가 '전체'인 항목)
    if (showCommonColumn) {
        const commonTasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === '전체');
        html += renderColumn('전체 (공통)', commonTasks, '전체');
    }

    // "임원" 컬럼 (담당자가 '임원'인 항목)
    if (showExecColumn) {
        const execTasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === '임원');
        html += renderColumn('임원', execTasks, '임원');
    }

    // "대표님" 컬럼 (담당자가 '대표님'인 항목)
    if (showCeoColumn) {
        const ceoTasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === '대표님');
        html += renderColumn('대표님', ceoTasks, '대표님');
    }

    // 개인별 컬럼
    displayPeople.forEach(person => {
        const tasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === person);
        html += renderColumn(person, tasks, person);
    });

    document.getElementById('dailyColumns').innerHTML = html;

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
                    <input type="text" class="daily-inline-input wk-inline-input" placeholder="+ 할 일" onkeydown="if(event.key==='Enter')inlineAddWeeklyTask(this,'${person}','${dateStr}')">
                </div>
            </div>
        </div>`;
    });

    html += `</div>`;
    document.getElementById('weeklyKanban').innerHTML = html;

    // 드래그 앤 드롭 초기화
    initKanbanDragDrop();
}

function inlineAddWeeklyTask(input, person, dateStr) {
    const task = input.value.trim();
    if (!task) return;
    dailyTasks.push({
        id: Date.now(), task,
        date: dateStr,
        assignee: person,
        target: '',
        priority: '🟡 보통',
        done: false
    });
    renderDaily();
    renderHome();
    showToast('할 일이 추가되었습니다');
    // 포커스 유지
    setTimeout(() => {
        const inputs = document.querySelectorAll(`.wk-day-body[data-date="${dateStr}"] .wk-inline-input`);
        if (inputs.length) inputs[0].focus();
    }, 50);
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
        <div class="form-group"><label class="form-label">할 일</label><input type="text" class="form-input" id="quickTaskName" placeholder="할 일 입력" autofocus></div>
        <div class="form-group"><label class="form-label">담당자</label><select class="form-select" id="quickTaskAssignee">${assigneeHtml}</select></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" id="quickTaskDate" value="${dateStr}"></div>
            <div class="form-group"><label class="form-label">마감일</label><input type="date" class="form-input" id="quickTaskDeadline"></div>
        </div>
        <div class="form-group"><label class="form-label">라벨</label><select class="form-select" id="quickTaskLabel">${labelHtml}</select></div>
        <div class="form-group"><label class="form-label">우선순위</label><select class="form-select" id="quickTaskPriority"><option value="🟡 보통">보통</option><option value="🔴 긴급">긴급</option><option value="🔵 낮음">낮음</option></select></div>
        <div class="form-group"><label class="form-label">거래처</label><select class="form-select" id="quickTaskClient"><option value="">선택 안함</option></select><p class="form-hint" style="color:var(--text-tertiary);font-size:12px;margin-top:4px;">추후 고객사 DB 연동 예정</p></div>
        <button class="form-submit" onclick="addQuickTask()">할 일 추가</button>`;
    document.getElementById('modalOverlay').classList.add('show');
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
        <div class="form-group"><label class="form-label">할 일</label><input type="text" class="form-input" id="quickTaskName" placeholder="할 일 입력" autofocus></div>
        <div class="form-group"><label class="form-label">담당자</label><select class="form-select" id="quickTaskAssignee">${assigneeHtml}</select></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" id="quickTaskDate" value="${fmtDate(currentDate)}"></div>
            <div class="form-group"><label class="form-label">마감일</label><input type="date" class="form-input" id="quickTaskDeadline"></div>
        </div>
        <div class="form-group"><label class="form-label">라벨</label><select class="form-select" id="quickTaskLabel">${labelHtml}</select></div>
        <div class="form-group"><label class="form-label">우선순위</label><select class="form-select" id="quickTaskPriority"><option value="🟡 보통">보통</option><option value="🔴 긴급">긴급</option><option value="🔵 낮음">낮음</option></select></div>
        <div class="form-group"><label class="form-label">거래처</label><select class="form-select" id="quickTaskClient"><option value="">선택 안함</option></select><p class="form-hint" style="color:var(--text-tertiary);font-size:12px;margin-top:4px;">추후 고객사 DB 연동 예정</p></div>
        <button class="form-submit" onclick="addQuickTask()">할 일 추가</button>`;
    document.getElementById('modalOverlay').classList.add('show');
}

function addQuickTask() {
    const task = document.getElementById('quickTaskName').value.trim();
    if (!task) { showToast('할 일을 입력해주세요'); return; }
    const assignee = document.getElementById('quickTaskAssignee').value;
    const date = document.getElementById('quickTaskDate').value;
    const deadline = document.getElementById('quickTaskDeadline').value || '';
    const label = document.getElementById('quickTaskLabel').value || '';
    const client = document.getElementById('quickTaskClient').value || '';
    const priority = document.getElementById('quickTaskPriority').value;
    const groupId = deadline && deadline !== date ? Date.now() : null;

    dailyTasks.push({
        id: Date.now(), task,
        date, assignee, deadline, label, client, target: '', priority, done: false,
        linkedGroup: groupId
    });

    // 마감일이 시작일과 다르면 마감일에도 연동 태스크 생성
    if (groupId) {
        dailyTasks.push({
            id: Date.now() + 1, task: `${task} (마감일)`,
            date: deadline, assignee, deadline, label, client, target: '', priority, done: false,
            linkedGroup: groupId, isDeadlineCopy: true
        });
    }

    closeModal(); renderDaily(); renderHome();
    showToast('할 일이 추가되었습니다');
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
        <div class="form-group"><label class="form-label">할 일</label><input type="text" class="form-input" id="editTaskName" value="${t.task.replace(/\s*\(마감일\)\s*$/, '')}" autofocus></div>
        <div class="form-group"><label class="form-label">담당자</label><select class="form-select" id="editTaskAssignee">${assigneeHtml}</select></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" id="editTaskDate" value="${t.date}"></div>
            <div class="form-group"><label class="form-label">마감일</label><input type="date" class="form-input" id="editTaskDeadline" value="${t.deadline || ''}"></div>
        </div>
        <div class="form-group"><label class="form-label">라벨</label><select class="form-select" id="editTaskLabel">${labelHtml}</select></div>
        <div class="form-group"><label class="form-label">우선순위</label><select class="form-select" id="editTaskPriority">${priorityHtml}</select></div>
        <div class="form-group"><label class="form-label">거래처</label><select class="form-select" id="editTaskClient"><option value="">선택 안함</option></select><p class="form-hint" style="color:var(--text-tertiary);font-size:12px;margin-top:4px;">추후 고객사 DB 연동 예정</p></div>
        <div style="display:flex;gap:8px;">
            <button class="form-submit" style="flex:1;" onclick="saveEditTask(${id})">수정 완료</button>
            <button class="form-submit" style="flex:0;background:var(--red);min-width:80px;" onclick="deleteTask(${id})">삭제</button>
        </div>`;
    document.getElementById('modalOverlay').classList.add('show');
}

function saveEditTask(id) {
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
        dailyTasks.filter(x => x.linkedGroup === t.linkedGroup).forEach(linked => {
            linked.assignee = newAssignee;
            linked.deadline = newDeadline;
            linked.label = newLabel;
            linked.client = newClient;
            linked.priority = newPriority;
            if (linked.isDeadlineCopy) {
                linked.task = `${baseName} (마감일)`;
                if (newDeadline) linked.date = newDeadline;
            } else {
                linked.task = baseName;
            }
        });
    } else {
        t.task = name;
        t.assignee = newAssignee;
        t.date = newDate;
        t.deadline = newDeadline;
        t.label = newLabel;
        t.client = newClient;
        t.priority = newPriority;

        // 마감일이 새로 추가된 경우 연동 태스크 생성
        if (newDeadline && newDeadline !== newDate) {
            const groupId = Date.now();
            t.linkedGroup = groupId;
            dailyTasks.push({
                id: Date.now() + 1, task: `${name} (마감일)`,
                date: newDeadline, assignee: newAssignee, deadline: newDeadline,
                label: newLabel, client: newClient, target: '', priority: newPriority,
                done: t.done, linkedGroup: groupId, isDeadlineCopy: true
            });
        }
    }

    closeModal(); renderDaily(); renderHome();
    showToast('할 일이 수정되었습니다');
}

function deleteTask(id) {
    const t = dailyTasks.find(x => x.id === id);
    if (!t) return;
    // 연동된 태스크도 함께 삭제
    if (t.linkedGroup) {
        for (let i = dailyTasks.length - 1; i >= 0; i--) {
            if (dailyTasks[i].linkedGroup === t.linkedGroup) dailyTasks.splice(i, 1);
        }
    } else {
        const idx = dailyTasks.findIndex(x => x.id === id);
        if (idx !== -1) dailyTasks.splice(idx, 1);
    }
    closeModal(); renderDaily(); renderHome();
    showToast('할 일이 삭제되었습니다');
}

function inlineAddTask(input, assignee) {
    const task = input.value.trim();
    if (!task) return;
    dailyTasks.push({
        id: Date.now(), task,
        date: fmtDate(currentDate),
        assignee: assignee,
        target: '본사',
        priority: '🟡 보통',
        done: false
    });
    renderDaily();
    renderHome();
    showToast('할 일이 추가되었습니다');
    // 렌더링 후 일일계획 같은 컬럼의 인라인 입력에 포커스 유지
    const inputs = document.querySelectorAll('#dailyColumns .daily-inline-input');
    inputs.forEach(el => {
        if (el.getAttribute('onkeydown').includes(`'${assignee}'`)) el.focus();
    });
}

function toggleTask(id) {
    const task = dailyTasks.find(t => t.id === id);
    if (task) {
        const newDone = !task.done;
        task.done = newDone;
        // 연동된 태스크도 동일하게 체크/해제
        if (task.linkedGroup) {
            dailyTasks.filter(t => t.linkedGroup === task.linkedGroup).forEach(t => t.done = newDone);
        }
        renderDaily();
        renderHome();
    }
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

    let tableHtml = '';
    let cardHtml = '';
    filtered.forEach(d => {
        const ratingSelect = `<select class="inline-select" onchange="updateDeliveryRating(${d.id}, this.value)">
            ${ratingOptions.map(r => `<option value="${r}" ${d.rating === r ? 'selected' : ''}>${r || '-'}</option>`).join('')}
        </select>`;

        const trackingCell = `<div class="inline-tracking">
            <input type="text" class="inline-input" id="track-${d.id}" value="${d.tracking}" placeholder="운송장번호">
            <button class="inline-save-btn" onclick="saveTracking(${d.id})">저장</button>
        </div>`;

        tableHtml += `<tr>
            <td class="td-check"><input type="checkbox" class="delivery-check" data-id="${d.id}" ${d._checked ? 'checked' : ''}></td>
            <td class="cell-editable" data-id="${d.id}" data-field="date" data-type="date">${fmtDisplay(d.date)}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="type" data-type="select" data-options="일반,중고,번개,당근,GS반택,ETSY"><span class="badge ${typeBadgeClass(d.type)}">${d.type}</span></td>
            <td class="cell-editable" data-id="${d.id}" data-field="sender" data-type="select" data-options="케이엘피코리아,김관택,이현주,김현호,유지은,구정두">${d.sender}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="recipient"><strong>${d.recipient}</strong></td>
            <td class="cell-editable" data-id="${d.id}" data-field="phone">${d.phone || '-'}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="product">${d.product}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="zipcode">${d.zipcode || '-'}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="address" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.address}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="payment" data-type="select" data-options="선불,착불">${d.payment}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="price" data-type="number">${d.price ? d.price.toLocaleString() + '원' : '-'}</td>
            <td class="cell-editable" data-id="${d.id}" data-field="memo">${d.memo || '-'}</td>
            <td><span class="author-badge">${d.author || '-'}</span></td>
            <td>${trackingCell}</td>
            <td>${ratingSelect}</td>
            <td><button class="edit-btn" onclick="openEditDelivery(${d.id})">편집</button></td>
        </tr>`;

        cardHtml += `<div class="resp-card">
            <div class="resp-card-top">
                <div class="resp-card-title">${d.recipient}</div>
                <div style="display:flex;gap:6px;align-items:center">
                    <span class="badge ${typeBadgeClass(d.type)}">${d.type}</span>
                    <button class="edit-btn" onclick="openEditDelivery(${d.id})">편집</button>
                </div>
            </div>
            <div class="resp-card-meta">
                <div class="resp-card-row"><strong>${d.product}</strong></div>
                <div class="resp-card-row">${d.sender} · ${fmtDisplay(d.date)} · ${d.payment}</div>
                ${d.phone ? `<div class="resp-card-row">${d.phone}</div>` : ''}
                ${d.zipcode ? `<div class="resp-card-row">${d.zipcode} ${d.address}</div>` : `<div class="resp-card-row">${d.address}</div>`}
                <div class="resp-card-row">${d.price ? d.price.toLocaleString() + '원' : ''}</div>
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
            <div class="form-group"><label class="form-label">연락처</label><input type="text" class="form-input" id="editDelPhone" value="${d.phone}" placeholder="010-0000-0000" maxlength="13"></div>
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
                <select class="form-select" id="editDelSender">
                    ${['케이엘피코리아','김관택','이현주','김현호','유지은','구정두'].map(s => `<option value="${s}" ${d.sender === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
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
            <div class="form-group"><label class="form-label">판매가</label><input type="number" class="form-input" id="editDelPrice" value="${d.price || ''}" placeholder="0"></div>
        </div>
        <div class="form-group"><label class="form-label">배송메모</label><input type="text" class="form-input" id="editDelMemo" value="${d.memo}" placeholder="배송메모"></div>
        <div class="form-actions">
            <button class="form-submit" onclick="saveEditDelivery(${d.id})">저장</button>
            <button class="form-delete-btn" onclick="deleteDelivery(${d.id})">삭제</button>
        </div>`;
    document.getElementById('editDelPhone').addEventListener('input', formatPhoneInput);
    document.getElementById('modalOverlay').classList.add('show');
}

function saveEditDelivery(id) {
    const d = deliveries.find(x => x.id === id);
    if (!d) return;
    d.date = document.getElementById('editDelDate').value;
    d.recipient = document.getElementById('editDelRecipient').value.trim();
    d.phone = document.getElementById('editDelPhone').value.trim();
    d.zipcode = document.getElementById('editDelZipcode').value.trim();
    d.address = document.getElementById('editDelAddress').value.trim();
    d.type = document.getElementById('editDelType').value;
    d.sender = document.getElementById('editDelSender').value;
    d.payment = document.getElementById('editDelPayment').value;
    d.product = document.getElementById('editDelProduct').value.trim();
    d.price = parseInt(document.getElementById('editDelPrice').value) || 0;
    d.memo = document.getElementById('editDelMemo').value.trim();
    closeModal();
    renderDeliveries();
    renderHome();
    showToast('택배가 수정되었습니다');
}

function deleteDelivery(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
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

function saveTracking(id) {
    const d = deliveries.find(x => x.id === id);
    if (!d) return;
    const input = document.getElementById(`track-${id}`);
    d.tracking = input.value.trim();
    showToast('운송장번호가 저장되었습니다');
}

function saveDetailTracking(id) {
    const d = deliveries.find(x => x.id === id);
    if (!d) return;
    const input = document.getElementById(`detail-track-${id}`);
    d.tracking = input.value.trim();
    renderDeliveries();
    showToast('운송장번호가 저장되었습니다');
}

function updateDeliveryRating(id, value) {
    const d = deliveries.find(x => x.id === id);
    if (!d) return;
    d.rating = value;
    showToast('평가가 저장되었습니다');
}

// =====================================
// DETAIL PANELS
// =====================================
function showProjectDetail(id) {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    const checkLabels = { design: '디확 컨펌', workOrder: '작지 발송', advancePayment: '선금 입금', finalPayment: '잔금 입금', invoice: '계산서 발행', supplierPayment: '공급처 송금', delivered: '납품 완료' };

    let checksHtml = '';
    Object.entries(p.checks).forEach(([key, val]) => {
        checksHtml += `<div class="detail-row">
            <span class="detail-label">${checkLabels[key]}</span>
            <span class="detail-value" style="color:${val ? 'var(--green)' : 'var(--gray-400)'};font-weight:700">${val ? '✓ 완료' : '미완료'}</span>
        </div>`;
    });

    const revenueStr = (p.revenue || 0).toLocaleString() + '원';
    const unitPriceStr = p.unitPrice ? p.unitPrice.toLocaleString() + '원' : '-';
    const vatStr = p.vat === 'exclude' ? '(VAT 별도)' : p.vat === 'include' ? '(VAT 포함)' : '';
    const printCostStr = p.printCost ? p.printCost.toLocaleString() + '원' : '-';
    const packCostStr = p.packCost ? p.packCost.toLocaleString() + '원' : '-';
    const shipCostStr = p.shipCost ? p.shipCost.toLocaleString() + '원' : '-';

    document.getElementById('detailPanelTitle').textContent = '프로젝트 상세';
    const row = (label, value) => value ? `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></div>` : '';
    document.getElementById('detailContent').innerHTML = `
        <h2 class="detail-title">${p.client || ''} — ${p.name}</h2>
        <div class="detail-section">
            <div class="detail-section-title">기본 정보</div>
            <div class="detail-row"><span class="detail-label">거래처</span><span class="detail-value">${p.client || '-'}</span></div>
            ${row('거래처 담당자', p.contactPerson)}
            ${row('제목', p.title)}
            ${row('본사 담당자', p.manager)}
            <div class="detail-row"><span class="detail-label">품명</span><span class="detail-value">${p.name}</span></div>
            <div class="detail-row"><span class="detail-label">상태</span><span class="detail-value"><span class="badge ${statusBadgeClass(p.status)}">${p.status}</span></span></div>
            <div class="detail-row"><span class="detail-label">담당</span><span class="detail-value">${p.assignees.join(', ')}</span></div>
            <div class="detail-row"><span class="detail-label">시작일</span><span class="detail-value">${p.startDate ? fmtDisplay(p.startDate) : '-'}</span></div>
            <div class="detail-row"><span class="detail-label">납기일</span><span class="detail-value">${p.deadline ? fmtDisplay(p.deadline) : '-'}</span></div>
            <div class="detail-row"><span class="detail-label">진행률</span><span class="detail-value">${p.progress}</span></div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">금액 정보</div>
            <div class="detail-row"><span class="detail-label">단가</span><span class="detail-value">${unitPriceStr} ${vatStr}</span></div>
            <div class="detail-row"><span class="detail-label">수량</span><span class="detail-value">${p.qty ? p.qty + ' ' + (p.unit || '개') : '-'}</span></div>
            <div class="detail-row"><span class="detail-label">매출액</span><span class="detail-value" style="font-weight:700;color:var(--blue)">${revenueStr}</span></div>
            <div class="detail-row"><span class="detail-label">인쇄비</span><span class="detail-value">${printCostStr}</span></div>
            <div class="detail-row"><span class="detail-label">포장비</span><span class="detail-value">${packCostStr}</span></div>
            ${row('배송비', shipCostStr !== '-' ? shipCostStr : null)}
        </div>
        ${(p.color || p.printColorSize || p.printMethod || p.packaging) ? `
        <div class="detail-section">
            <div class="detail-section-title">제품 사양</div>
            ${row('색상', p.color)}
            ${row('인쇄 색상/사이즈', p.printColorSize)}
            ${row('인쇄 방법', p.printMethod)}
            ${row('포장', p.packaging)}
        </div>` : ''}
        ${(p.recipient || p.phone || p.address) ? `
        <div class="detail-section">
            <div class="detail-section-title">배송 정보</div>
            ${row('수령인', p.recipient)}
            ${row('핸드폰', p.phone)}
            ${row('주소', p.address)}
        </div>` : ''}
        <div class="detail-section">
            <div class="detail-section-title">체크리스트</div>
            ${checksHtml}
        </div>
        ${p.memo ? `<div class="detail-section"><div class="detail-section-title">메모</div><p style="font-size:14px;color:var(--gray-700);line-height:1.7">${p.memo}</p></div>` : ''}`;
    document.getElementById('detailOverlay').classList.add('show');
}

function showDeliveryDetail(id) {
    // 사이드바 상세 패널 제거 — 더 이상 사용하지 않음
}

function closeDetail() {
    document.getElementById('detailOverlay').classList.remove('show');
}

// Click overlay to close
document.addEventListener('click', (e) => {
    if (e.target.id === 'detailOverlay') closeDetail();
    if (e.target.id === 'modalOverlay') closeModal();
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
            body.innerHTML = `
                <div class="form-section-title">📋 기본 정보</div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">거래처 <span style="color:var(--red)">*</span></label><input type="text" class="form-input" id="newProjectClient" placeholder="거래처명" value="${v('client')}"></div>
                    <div class="form-group"><label class="form-label">거래처 담당자</label><input type="text" class="form-input" id="newProjectContact" placeholder="담당자" value="${v('contactPerson')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">제목</label><input type="text" class="form-input" id="newProjectTitle" placeholder="예: 상패 시안" value="${v('title')}"></div>
                    <div class="form-group"><label class="form-label">본사 담당자</label>
                        <select class="form-select" id="newProjectManager">
                            <option ${v('manager')==='이현주 실장'?'selected':''}>이현주 실장</option>
                            <option ${v('manager')==='김현호 팀장'||!v('manager')?'selected':''}>김현호 팀장</option>
                            <option ${v('manager')==='유지은 대리'?'selected':''}>유지은 대리</option>
                        </select>
                    </div>
                </div>

                <div class="form-section-title">📦 제품 정보</div>
                <div class="form-group"><label class="form-label">품명 <span style="color:var(--red)">*</span></label><input type="text" class="form-input" id="newProjectName" placeholder="품명 입력" value="${v('productName') || v('name')}"></div>
                <div class="form-row" style="grid-template-columns:2fr 1fr">
                    <div class="form-group"><label class="form-label">수량</label><input type="number" class="form-input" id="newProjectQty" placeholder="0" value="${v('quantity')}" oninput="calcProjectRevenue()"></div>
                    <div class="form-group"><label class="form-label">단위</label>
                        <select class="form-select" id="newProjectUnit">
                            ${['개','세트','장','박스','EA'].map(u=>`<option ${v('unit')===u?'selected':''}>${u}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row" style="grid-template-columns:2fr 1fr">
                    <div class="form-group"><label class="form-label">단가</label><input type="number" class="form-input" id="newProjectUnitPrice" placeholder="0" value="${v('unitPrice')}" oninput="calcProjectRevenue()"></div>
                    <div class="form-group"><label class="form-label">VAT</label>
                        <select class="form-select" id="newProjectVat" onchange="calcProjectRevenue()">
                            <option value="exclude" ${v('unitPriceVat')==='VAT 별도'||v('vat')==='exclude'||!v('vat')?'selected':''}>VAT 별도</option>
                            <option value="include" ${v('unitPriceVat')==='VAT 포함'||v('vat')==='include'?'selected':''}>VAT 포함</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">매출액 (자동계산)</label>
                    <div class="form-input" id="newProjectRevenueDisplay" style="background:var(--gray-50);color:var(--gray-700);font-weight:700">0 원</div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">색상</label><input type="text" class="form-input" id="newProjectColor" value="${v('color') || '-'}"></div>
                    <div class="form-group"><label class="form-label">인쇄 색상/사이즈</label><input type="text" class="form-input" id="newProjectPrintColorSize" value="${v('printColorSize') || '시안 확인'}"></div>
                </div>

                <div class="form-section-title">🖨️ 인쇄 / 포장</div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">인쇄 방법</label>
                        <select class="form-select" id="newProjectPrintMethod">
                            ${['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사','기타'].map(u=>`<option ${v('printMethod')===u?'selected':''}>${u}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">인쇄비</label><input type="number" class="form-input" id="newProjectPrintFee" placeholder="0" value="${v('printFee')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">포장</label>
                        <select class="form-select" id="newProjectPackaging">
                            ${['개별박스','선물포장','선물포장+라벨부착','에어캡포장','기타'].map(u=>`<option ${v('packaging')===u?'selected':''}>${u}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">포장비</label><input type="number" class="form-input" id="newProjectPackFee" placeholder="0" value="${v('packagingFee')}"></div>
                </div>

                <div class="form-section-title">🚚 납기 및 배송</div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">납기일</label><input type="date" class="form-input" id="newProjectDeadline" value="${v('deliveryDate') || v('deadline')}"></div>
                    <div class="form-group"><label class="form-label">수령인</label><input type="text" class="form-input" id="newProjectRecipient" value="${v('recipient')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">핸드폰</label><input type="text" class="form-input" id="newProjectPhone" placeholder="010-0000-0000" value="${v('phone')}"></div>
                    <div class="form-group"><label class="form-label">주소</label><input type="text" class="form-input" id="newProjectAddress" value="${v('address')}"></div>
                </div>

                <div class="form-group"><label class="form-label">메모</label><input type="text" class="form-input" id="newProjectMemo" placeholder="특이사항" value="${v('memo')}"></div>
                <button class="form-submit" onclick="addProject('${addType}')">프로젝트 추가</button>`;
            setTimeout(calcProjectRevenue, 0);
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
                <div class="form-group"><label class="form-label">연락처</label><input type="text" class="form-input" id="newDelPhone" placeholder="010-0000-0000" maxlength="13"></div>
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
                    </select>
                </div>
                <div class="form-group"><label class="form-label">선/착불</label><select class="form-select" id="newDelPayment"><option value="선불">선불</option><option value="착불">착불</option></select></div>
            </div>
            <div class="form-group" id="newDelPriceGroup" style="display:none"><label class="form-label">판매가</label><input type="number" class="form-input" id="newDelPrice" placeholder="0"></div>
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
    }
    document.getElementById('modalOverlay').classList.add('show');
}

function calcProjectRevenue() {
    const priceEl = document.getElementById('newProjectUnitPrice');
    const qtyEl = document.getElementById('newProjectQty');
    const vatEl = document.getElementById('newProjectVat');
    const displayEl = document.getElementById('newProjectRevenueDisplay');
    if (!priceEl || !qtyEl || !displayEl) return;
    const price = parseInt(priceEl.value) || 0;
    const qty = parseInt(qtyEl.value) || 0;
    const vat = vatEl ? vatEl.value : 'exclude';
    let revenue = price * qty;
    if (vat === 'exclude') revenue = Math.round(revenue * 1.1);
    displayEl.textContent = revenue.toLocaleString() + ' 원';
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('show');
}

// ===== Add Handlers =====
async function addProject(type) {
    const name = document.getElementById('newProjectName').value.trim();
    const client = document.getElementById('newProjectClient').value.trim();
    if (!name) { showToast('품명을 입력해주세요'); return; }
    if (!client) { showToast('거래처를 입력해주세요'); return; }

    const unitPrice = parseInt(document.getElementById('newProjectUnitPrice').value) || 0;
    const qty = parseInt(document.getElementById('newProjectQty').value) || 0;
    const vat = document.getElementById('newProjectVat').value;
    let revenue = unitPrice * qty;
    if (vat === 'exclude') revenue = Math.round(revenue * 1.1);

    const assignee = currentUser ? currentUser.name : '';
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const getInt = (id) => parseInt(getVal(id)) || 0;

    const newProject = {
        id: Date.now(), name, client,
        contactPerson: getVal('newProjectContact'),
        title: getVal('newProjectTitle'),
        manager: getVal('newProjectManager'),
        supplier: "", status: "시작 전",
        priority: "🟢 보통", category: type === 'overseas' ? '해외 주문' : '국내 주문',
        assignees: [assignee],
        progress: "0%",
        unitPrice, qty, vat, revenue,
        unit: getVal('newProjectUnit') || '개',
        color: getVal('newProjectColor'),
        printColorSize: getVal('newProjectPrintColorSize'),
        printMethod: getVal('newProjectPrintMethod'),
        printFee: getInt('newProjectPrintFee'),
        packaging: getVal('newProjectPackaging'),
        packagingFee: getInt('newProjectPackFee'),
        printCost: getInt('newProjectPrintFee'),
        packCost: getInt('newProjectPackFee'),
        shipCost: getInt('newProjectShipCost'),
        startDate: fmtDate(new Date()),
        deadline: document.getElementById('newProjectDeadline').value,
        recipient: getVal('newProjectRecipient'),
        phone: getVal('newProjectPhone'),
        address: getVal('newProjectAddress'),
        checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false },
        memo: getVal('newProjectMemo')
    };

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
                progress: newProject.progress,
                start_date: newProject.startDate || null,
                checks: newProject.checks,
                memo: newProject.memo
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
                supplier: '',
                status: r.status || '시작 전',
                priority: r.priority || '🟢 보통',
                category: r.category || '국내 주문',
                assignees: r.assignees || [],
                progress: r.progress || '0%',
                unitPrice: r.unit_price || 0,
                qty: r.quantity || 0,
                unit: r.unit || '개',
                vat: r.unit_price_vat === 'VAT 포함' ? 'include' : 'exclude',
                revenue: r.revenue || 0,
                color: r.color || '',
                printColorSize: r.print_color_size || '',
                printMethod: r.print_method || '',
                printFee: r.print_fee || 0,
                packaging: r.packaging || '',
                packagingFee: r.packaging_fee || 0,
                printCost: r.print_fee || 0,
                packCost: r.packaging_fee || 0,
                shipCost: 0,
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

function addDailyTask() {
    const task = document.getElementById('newTaskName').value.trim();
    if (!task) { showToast('할 일을 입력해주세요'); return; }
    dailyTasks.push({
        id: Date.now(), task,
        date: document.getElementById('newTaskDate').value,
        assignee: document.getElementById('newTaskAssignee').value,
        deadline: document.getElementById('newTaskDeadline').value || '',
        target: '',
        priority: document.getElementById('newTaskPriority').value,
        done: false
    });
    closeModal(); renderDaily(); renderHome();
    showToast('할 일이 추가되었습니다');
}

function addDelivery() {
    const recipient = document.getElementById('newDelRecipient').value.trim();
    if (!recipient) { showToast('받는이를 입력해주세요'); return; }
    const typeSelect = document.getElementById('newDelType').value;
    const typeCustom = document.getElementById('newDelTypeCustom').value.trim();
    const type = typeSelect === '__custom' ? (typeCustom || '기타') : typeSelect;
    deliveries.unshift({
        id: Date.now(), recipient,
        date: document.getElementById('newDelDate').value || fmtDate(new Date()),
        type,
        sender: document.getElementById('newDelSender').value,
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
    if (digits.length <= 3) {
        formatted = digits;
    } else if (digits.length <= 7) {
        formatted = digits.slice(0, 3) + '-' + digits.slice(3);
    } else {
        formatted = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
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

    const id = Number(cell.dataset.id);
    const field = cell.dataset.field;
    const type = cell.dataset.type || 'text';
    const d = deliveries.find(x => x.id === id);
    if (!d) return;

    const currentVal = d[field] ?? '';
    const originalHtml = cell.innerHTML;

    if (type === 'select') {
        const options = cell.dataset.options.split(',');
        const select = document.createElement('select');
        select.className = 'cell-edit-select';
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            if (opt === currentVal) o.selected = true;
            select.appendChild(o);
        });
        cell.innerHTML = '';
        cell.appendChild(select);
        select.focus();

        const save = () => {
            d[field] = select.value;
            renderDeliveries();
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

        const save = () => {
            if (input.value) d[field] = input.value;
            renderDeliveries();
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

        const save = () => {
            if (type === 'number') {
                d[field] = parseInt(input.value) || 0;
            } else {
                d[field] = input.value.trim();
            }
            renderDeliveries();
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
