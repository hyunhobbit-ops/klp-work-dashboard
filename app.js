// ========================================
// KLP KOREA Work Dashboard v2
// ========================================

// ===== Supabase =====
const SUPABASE_URL = 'https://vtulmuxkriklpiibiues.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dWxtdXhrcmlrbHBpaWJpdWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzQwNTYsImV4cCI6MjA5MTM1MDA1Nn0.0v5i8IpF4ZbAByI3eM_X4Hj3zNn7wghQEFlZAEWzWVA';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null; // { id, name, role }

// ===== Auth =====
async function checkAuth() {
    const saved = localStorage.getItem('klp_user');
    if (saved) {
        currentUser = JSON.parse(saved);
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

    currentUser = { id: data.id, name: data.name, role: data.role };
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

function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    renderAll();
}

// Enter key to login
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') {
        handleLogin();
    }
});

// ===== Data =====
const projects = [
    { id: 1, name: "러쉬 성수동 제안", client: "러쉬", supplier: "", status: "진행 중", priority: "🔴 긴급", category: "국내 주문", assignees: ["이현주"], progress: "25%", revenue: 0, startDate: "2026-04-07", deadline: "2026-04-10", checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "내일까지 제안서 준다고 함" },
    { id: 2, name: "지플러스타워 골드바 감사패", client: "지플러스타워", supplier: "", status: "진행 중", priority: "🟡 높음", category: "국내 주문", assignees: ["김현호"], progress: "50%", revenue: 0, startDate: "2026-03-19", deadline: "2026-04-15", checks: { design: true, workOrder: true, advancePayment: true, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "견적 발송 완료" },
    { id: 3, name: "미니클락 스토어팜 판매 계획", client: "자체", supplier: "", status: "진행 중", priority: "🟢 보통", category: "자체 브랜드", assignees: ["이현주", "김현호"], progress: "50%", revenue: 0, startDate: "2026-03-10", deadline: "2026-04-30", checks: { design: true, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "빈티지 시계 + 미니클락 상세 계획 작성" },
    { id: 4, name: "굿즈덕 클로드 리뉴얼", client: "자체", supplier: "", status: "진행 중", priority: "🟢 보통", category: "자체 브랜드", assignees: ["김현호"], progress: "25%", revenue: 0, startDate: "2026-04-01", deadline: "2026-04-30", checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "" },
    { id: 5, name: "해외 PO 시스템 구축", client: "본사", supplier: "", status: "진행 중", priority: "🟡 높음", category: "해외 주문", assignees: ["이현주"], progress: "75%", revenue: 0, startDate: "2026-03-20", deadline: "2026-04-12", checks: { design: true, workOrder: true, advancePayment: true, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "해외 PO 만들기 진행 중" },
    { id: 6, name: "빵 주문서 양식 제작", client: "본사", supplier: "", status: "완료", priority: "🟢 보통", category: "기타", assignees: ["김현호"], progress: "100%", revenue: 0, startDate: "2026-03-25", deadline: "2026-03-31", checks: { design: true, workOrder: true, advancePayment: true, finalPayment: true, invoice: true, supplierPayment: true, delivered: true }, memo: "완료" },
    { id: 7, name: "회사 재고 소진 프로젝트", client: "자체", supplier: "", status: "진행 중", priority: "🟡 높음", category: "자체 브랜드", assignees: ["이현주", "김현호"], progress: "25%", revenue: 0, startDate: "2026-03-12", deadline: "2026-12-31", checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "2026년 재고소진의 해" },
    { id: 8, name: "제안서 DB 구축", client: "본사", supplier: "", status: "시작 전", priority: "🟢 보통", category: "기타", assignees: ["이현주"], progress: "0%", revenue: 0, startDate: "", deadline: "2026-04-20", checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false }, memo: "" },
];

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
let currentPersonFilter = 'all';
let currentProjectFilter = 'all';
let currentDeliveryTypeFilter = 'all';
let currentDeliverySearch = '';

// ===== Page Titles =====
const pageTitles = {
    home: '홈',
    projects: '프로젝트 진행사항',
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
    document.querySelectorAll('[data-filter]').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentProjectFilter = chip.dataset.filter;
            renderProjects();
        });
    });
    document.querySelectorAll('[data-person]').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentPersonFilter = chip.dataset.person;
            renderDaily();
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
function renderProjects() {
    const filtered = currentProjectFilter === 'all'
        ? projects
        : projects.filter(p => p.status === currentProjectFilter);

    const checkSvg = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`;

    let tableHtml = '';
    let cardHtml = '';
    filtered.forEach(p => {
        const pNum = parseInt(p.progress) || 0;
        const checksArr = Object.values(p.checks);
        const checkDots = checksArr.map(v => `<div class="check-dot ${v ? 'done' : ''}">${v ? checkSvg : ''}</div>`).join('');

        tableHtml += `<tr onclick="showProjectDetail(${p.id})">
            <td><strong>${p.name}</strong></td>
            <td><span class="badge ${statusBadgeClass(p.status)}">${p.status}</span></td>
            <td>${p.priority}</td>
            <td><span class="badge ${categoryBadgeClass(p.category)}">${p.category}</span></td>
            <td>${p.assignees.join(', ')}</td>
            <td>${p.deadline ? fmtDisplay(p.deadline) : '-'}</td>
            <td><div class="progress-cell"><div class="progress-bar"><div class="progress-fill pf-${pNum}"></div></div><span class="progress-pct">${p.progress}</span></div></td>
            <td><div class="checks-row">${checkDots}</div></td>
        </tr>`;

        cardHtml += `<div class="resp-card" onclick="showProjectDetail(${p.id})">
            <div class="resp-card-top">
                <div class="resp-card-title">${p.name}</div>
                <span class="badge ${statusBadgeClass(p.status)}">${p.status}</span>
            </div>
            <div class="resp-card-meta">
                <div class="resp-card-row">${p.priority} · <span class="badge ${categoryBadgeClass(p.category)}">${p.category}</span></div>
                <div class="resp-card-row"><strong>${p.assignees.join(', ')}</strong> · 마감 ${p.deadline ? fmtDisplay(p.deadline) : '-'}</div>
                <div class="resp-card-row" style="margin-top:4px"><div class="progress-cell" style="flex:1"><div class="progress-bar"><div class="progress-fill pf-${pNum}"></div></div><span class="progress-pct">${p.progress}</span></div></div>
            </div>
        </div>`;
    });

    document.getElementById('projectTableBody').innerHTML = tableHtml;
    document.getElementById('projectCardGrid').innerHTML = cardHtml;
}

// =====================================
// DAILY PLAN
// =====================================
function renderDaily() {
    const todayStr = fmtDate(currentDate);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const d = currentDate;
    document.getElementById('currentDateDisplay').textContent =
        `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;

    const people = ['이현주', '김현호', '유지은', '구정두'];
    const displayPeople = currentPersonFilter === 'all'
        ? people
        : people.filter(p => p === currentPersonFilter);

    const checkSvg = `<svg width="14" height="14" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`;

    let html = '';
    displayPeople.forEach(person => {
        const tasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === person);
        const doneCount = tasks.filter(t => t.done).length;

        let itemsHtml = '';
        const sorted = [...tasks].sort((a, b) => a.done - b.done);
        sorted.forEach(t => {
            const tagClass = t.priority.includes('긴급') ? 'tag-urgent' : t.priority.includes('낮음') ? 'tag-low' : 'tag-normal';
            const tagLabel = t.priority.includes('긴급') ? '긴급' : t.priority.includes('낮음') ? '낮음' : '보통';

            itemsHtml += `<div class="daily-item ${t.done ? 'completed' : ''}">
                <div class="daily-checkbox ${t.done ? 'checked' : ''}" onclick="toggleTask(${t.id})">${checkSvg}</div>
                <div class="daily-info">
                    <div class="daily-title">${t.task}</div>
                    <div class="daily-meta">
                        <span class="daily-tag ${tagClass}">${tagLabel}</span>
                        <span class="daily-target">${t.target}</span>
                    </div>
                </div>
            </div>`;
        });

        html += `<div class="daily-column">
            <div class="daily-col-header">
                <span class="daily-col-title">${person}</span>
                <span class="daily-col-count">${doneCount}/${tasks.length}</span>
            </div>
            <div class="daily-col-body">${itemsHtml || empty('할 일 없음')}</div>
        </div>`;
    });

    document.getElementById('dailyColumns').innerHTML = html;
}

function toggleTask(id) {
    const task = dailyTasks.find(t => t.id === id);
    if (task) {
        task.done = !task.done;
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

    if (currentDeliverySearch) {
        filtered = filtered.filter(d =>
            d.recipient.toLowerCase().includes(currentDeliverySearch) ||
            d.product.toLowerCase().includes(currentDeliverySearch) ||
            d.tracking.toLowerCase().includes(currentDeliverySearch)
        );
    }

    const ratingOptions = ['', 'A 단골가능', 'B 대통령시계', 'C 평범', 'X 블랙'];

    let tableHtml = '';
    let cardHtml = '';
    filtered.forEach(d => {
        const ratingSelect = `<select class="inline-select" onchange="event.stopPropagation();updateDeliveryRating(${d.id}, this.value)">
            ${ratingOptions.map(r => `<option value="${r}" ${d.rating === r ? 'selected' : ''}>${r || '-'}</option>`).join('')}
        </select>`;

        const trackingCell = `<div class="inline-tracking" onclick="event.stopPropagation()">
            <input type="text" class="inline-input" id="track-${d.id}" value="${d.tracking}" placeholder="운송장번호">
            <button class="inline-save-btn" onclick="saveTracking(${d.id})">저장</button>
        </div>`;

        tableHtml += `<tr>
            <td onclick="showDeliveryDetail(${d.id})">${fmtDisplay(d.date)}</td>
            <td onclick="showDeliveryDetail(${d.id})"><span class="badge ${typeBadgeClass(d.type)}">${d.type}</span></td>
            <td onclick="showDeliveryDetail(${d.id})">${d.sender}</td>
            <td onclick="showDeliveryDetail(${d.id})"><strong>${d.recipient}</strong></td>
            <td onclick="showDeliveryDetail(${d.id})">${d.phone || '-'}</td>
            <td onclick="showDeliveryDetail(${d.id})">${d.product}</td>
            <td onclick="showDeliveryDetail(${d.id})">${d.zipcode || '-'}</td>
            <td onclick="showDeliveryDetail(${d.id})" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.address}</td>
            <td onclick="showDeliveryDetail(${d.id})">${d.payment}</td>
            <td onclick="showDeliveryDetail(${d.id})">${d.price ? d.price.toLocaleString() + '원' : '-'}</td>
            <td onclick="showDeliveryDetail(${d.id})">${d.memo || '-'}</td>
            <td onclick="showDeliveryDetail(${d.id})"><span class="author-badge">${d.author || '-'}</span></td>
            <td class="td-no-click">${trackingCell}</td>
            <td class="td-no-click">${ratingSelect}</td>
        </tr>`;

        cardHtml += `<div class="resp-card" onclick="showDeliveryDetail(${d.id})">
            <div class="resp-card-top">
                <div class="resp-card-title">${d.recipient}</div>
                <span class="badge ${typeBadgeClass(d.type)}">${d.type}</span>
            </div>
            <div class="resp-card-meta">
                <div class="resp-card-row"><strong>${d.product}</strong></div>
                <div class="resp-card-row">${d.sender} · ${fmtDisplay(d.date)} · ${d.payment}</div>
                ${d.phone ? `<div class="resp-card-row">${d.phone}</div>` : ''}
                ${d.zipcode ? `<div class="resp-card-row">${d.zipcode} ${d.address}</div>` : `<div class="resp-card-row">${d.address}</div>`}
                <div class="resp-card-row">${d.price ? d.price.toLocaleString() + '원' : ''}</div>
                ${d.memo ? `<div class="resp-card-row">${d.memo}</div>` : ''}
                <div class="resp-card-row">작성자: <span class="author-badge">${d.author || '-'}</span></div>
                <div class="resp-card-row" onclick="event.stopPropagation()">${trackingCell}</div>
                <div class="resp-card-row" onclick="event.stopPropagation()">${ratingSelect}</div>
            </div>
        </div>`;
    });

    document.getElementById('deliveryTableBody').innerHTML = tableHtml;
    document.getElementById('deliveryCardGrid').innerHTML = cardHtml;
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

    document.getElementById('detailPanelTitle').textContent = '프로젝트 상세';
    document.getElementById('detailContent').innerHTML = `
        <h2 class="detail-title">${p.name}</h2>
        <div class="detail-section">
            <div class="detail-section-title">기본 정보</div>
            <div class="detail-row"><span class="detail-label">상태</span><span class="detail-value"><span class="badge ${statusBadgeClass(p.status)}">${p.status}</span></span></div>
            <div class="detail-row"><span class="detail-label">우선순위</span><span class="detail-value">${p.priority}</span></div>
            <div class="detail-row"><span class="detail-label">카테고리</span><span class="detail-value">${p.category}</span></div>
            <div class="detail-row"><span class="detail-label">담당</span><span class="detail-value">${p.assignees.join(', ')}</span></div>
            <div class="detail-row"><span class="detail-label">거래처</span><span class="detail-value">${p.client || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">시작일</span><span class="detail-value">${p.startDate ? fmtDisplay(p.startDate) : '-'}</span></div>
            <div class="detail-row"><span class="detail-label">마감일</span><span class="detail-value">${p.deadline ? fmtDisplay(p.deadline) : '-'}</span></div>
            <div class="detail-row"><span class="detail-label">진행률</span><span class="detail-value">${p.progress}</span></div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">체크리스트</div>
            ${checksHtml}
        </div>
        ${p.memo ? `<div class="detail-section"><div class="detail-section-title">메모</div><p style="font-size:14px;color:var(--gray-700);line-height:1.7">${p.memo}</p></div>` : ''}`;
    document.getElementById('detailOverlay').classList.add('show');
}

function showDeliveryDetail(id) {
    const d = deliveries.find(x => x.id === id);
    if (!d) return;

    document.getElementById('detailPanelTitle').textContent = '택배 상세';
    document.getElementById('detailContent').innerHTML = `
        <div class="detail-section">
            <div class="detail-row"><span class="detail-label">날짜</span><span class="detail-value">${fmtDisplay(d.date) || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">종류</span><span class="detail-value"><span class="badge ${typeBadgeClass(d.type)}">${d.type || '-'}</span></span></div>
            <div class="detail-row"><span class="detail-label">발송인</span><span class="detail-value">${d.sender || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">받는이</span><span class="detail-value"><strong>${d.recipient || '-'}</strong></span></div>
            <div class="detail-row"><span class="detail-label">연락처</span><span class="detail-value">${d.phone || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">품목</span><span class="detail-value">${d.product || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">우편번호</span><span class="detail-value">${d.zipcode || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">주소</span><span class="detail-value">${d.address || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">선/착불</span><span class="detail-value">${d.payment || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">판매가</span><span class="detail-value">${d.price ? d.price.toLocaleString() + '원' : '-'}</span></div>
            <div class="detail-row"><span class="detail-label">배송메모</span><span class="detail-value">${d.memo || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">작성자</span><span class="detail-value"><span class="author-badge">${d.author || '-'}</span></span></div>
            <div class="detail-row"><span class="detail-label">운송장번호</span><span class="detail-value"><div class="inline-tracking detail-tracking"><input type="text" class="inline-input" id="detail-track-${d.id}" value="${d.tracking}" placeholder="운송장번호 입력"><button class="inline-save-btn" onclick="saveDetailTracking(${d.id})">저장</button>${d.tracking ? `<button class="inline-copy-btn" onclick="copyTracking('${d.tracking}')">복사</button>` : ''}</div></span></div>
            <div class="detail-row"><span class="detail-label">평가</span><span class="detail-value">${d.rating ? `<span class="badge ${ratingBadgeClass(d.rating)}">${d.rating}</span>` : '-'}</span></div>
        </div>`;
    document.getElementById('detailOverlay').classList.add('show');
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

    if (type === 'project') {
        title.textContent = '새 프로젝트';
        body.innerHTML = `
            <div class="form-group"><label class="form-label">프로젝트명</label><input type="text" class="form-input" id="newProjectName" placeholder="프로젝트명 입력"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">카테고리</label><select class="form-select" id="newProjectCategory"><option value="국내 주문">국내 주문</option><option value="해외 주문">해외 주문</option><option value="자체 브랜드">자체 브랜드</option><option value="IP 콜라보">IP 콜라보</option><option value="유튜브">유튜브</option><option value="기타">기타</option></select></div>
                <div class="form-group"><label class="form-label">우선순위</label><select class="form-select" id="newProjectPriority"><option value="🟢 보통">보통</option><option value="🟡 높음">높음</option><option value="🔴 긴급">긴급</option><option value="⚪ 낮음">낮음</option></select></div>
            </div>
            <div class="form-group"><label class="form-label">거래처</label><input type="text" class="form-input" id="newProjectClient" placeholder="거래처명"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">담당자</label><select class="form-select" id="newProjectAssignee"><option value="김현호">김현호</option><option value="이현주">이현주</option><option value="사장님">사장님</option></select></div>
                <div class="form-group"><label class="form-label">마감일</label><input type="date" class="form-input" id="newProjectDeadline"></div>
            </div>
            <div class="form-group"><label class="form-label">메모</label><input type="text" class="form-input" id="newProjectMemo" placeholder="특이사항"></div>
            <button class="form-submit" onclick="addProject()">프로젝트 추가</button>`;
    } else if (type === 'daily') {
        title.textContent = '새 할 일';
        body.innerHTML = `
            <div class="form-group"><label class="form-label">할 일</label><input type="text" class="form-input" id="newTaskName" placeholder="할 일 입력"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">담당자</label><select class="form-select" id="newTaskAssignee"><option value="이현주">이현주</option><option value="김현호">김현호</option><option value="유지은">유지은</option><option value="구정두">구정두</option></select></div>
                <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" id="newTaskDate" value="${fmtDate(currentDate)}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">대상</label><select class="form-select" id="newTaskTarget"><option value="본사">본사</option><option value="거래처">거래처</option><option value="회계">회계</option><option value="개인">개인</option><option value="유튜브">유튜브</option></select></div>
                <div class="form-group"><label class="form-label">우선순위</label><select class="form-select" id="newTaskPriority"><option value="🟡 보통">보통</option><option value="🔴 긴급">긴급</option><option value="🔵 낮음">낮음</option></select></div>
            </div>
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

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('show');
}

// ===== Add Handlers =====
function addProject() {
    const name = document.getElementById('newProjectName').value.trim();
    if (!name) { showToast('프로젝트명을 입력해주세요'); return; }
    projects.unshift({
        id: Date.now(), name,
        client: document.getElementById('newProjectClient').value.trim(),
        supplier: "", status: "시작 전",
        priority: document.getElementById('newProjectPriority').value,
        category: document.getElementById('newProjectCategory').value,
        assignees: [document.getElementById('newProjectAssignee').value],
        progress: "0%", revenue: 0, startDate: fmtDate(currentDate),
        deadline: document.getElementById('newProjectDeadline').value,
        checks: { design: false, workOrder: false, advancePayment: false, finalPayment: false, invoice: false, supplierPayment: false, delivered: false },
        memo: document.getElementById('newProjectMemo').value.trim()
    });
    closeModal(); renderProjects(); renderHome();
    showToast('프로젝트가 추가되었습니다');
}

function addDailyTask() {
    const task = document.getElementById('newTaskName').value.trim();
    if (!task) { showToast('할 일을 입력해주세요'); return; }
    dailyTasks.push({
        id: Date.now(), task,
        date: document.getElementById('newTaskDate').value,
        assignee: document.getElementById('newTaskAssignee').value,
        target: document.getElementById('newTaskTarget').value,
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

function ratingBadgeClass(r) {
    if (r.includes('A')) return 'badge-blue';
    if (r.includes('B')) return 'badge-green';
    if (r.includes('C')) return 'badge-yellow';
    if (r.includes('X')) return 'badge-red';
    return 'badge-gray';
}
