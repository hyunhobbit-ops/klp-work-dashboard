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
    await loadDailyTasksFromDb();
    await loadDeliveriesFromDb();
    await loadClientsFromDb();
    subscribeDailyTasks();
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
let clientSearch = '';
let clientPage = 1;
const CLIENTS_PER_PAGE = 50;
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
    setupTheme();
    setupTopbar();
    setupSidebar();
    setupTabs();
    setupFilters();
    setupDateNav();
    setupSearch();
    setupShortcuts();
    checkAuth();
});

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

function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('klp_theme', theme);
}

function setupShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
            const deliveryTab = document.getElementById('tab-delivery');
            if (deliveryTab && deliveryTab.classList.contains('active')) {
                e.preventDefault();
                openModal('delivery');
                return;
            }
            const clientTab = document.getElementById('tab-clients');
            if (clientTab && clientTab.classList.contains('active')) {
                e.preventDefault();
                openModal('client');
                return;
            }
            const domProjTab = document.getElementById('tab-projects-domestic');
            if (domProjTab && domProjTab.classList.contains('active')) {
                e.preventDefault();
                openModal('project-domestic');
                return;
            }
            const ovProjTab = document.getElementById('tab-projects-overseas');
            if (ovProjTab && ovProjTab.classList.contains('active')) {
                e.preventDefault();
                openModal('project-overseas');
                return;
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

    // 탭 전환 시 스크롤 위로
    window.scrollTo(0, 0);
    const mainWrap = document.querySelector('.main-wrap');
    if (mainWrap) mainWrap.scrollTo(0, 0);
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
    const clientSearchEl = document.getElementById('clientSearch');
    if (clientSearchEl) {
        clientSearchEl.addEventListener('input', e => {
            clientSearch = e.target.value;
            clientPage = 1;
            renderClients();
        });
    }
}

// ===== Render All =====
function renderAll() {
    renderHome();
    renderProjects();
    renderDaily();
    renderDeliveries();
    renderClients();
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

    // Quick menu counts
    const qP = document.getElementById('qProjects'); if (qP) qP.textContent = `${activeCount}건 진행`;
    const qD = document.getElementById('qDaily'); if (qD) qD.textContent = `오늘 ${myTodayItems.length}건`;
    const qDel = document.getElementById('qDelivery'); if (qDel) qDel.textContent = `이번달 ${monthDel}건`;

    // 마감 상태 카드 3종 — 마감 초과 / 3일 이내 / 이번 주
    const today0 = new Date(todayStr + 'T00:00:00');
    const deadlineList = projects
        .filter(p => p.status !== '완료' && p.deadline)
        .map(p => {
            const d = new Date(p.deadline + 'T00:00:00');
            const diff = Math.round((d - today0) / 86400000);
            return { p, diff };
        });
    const overdueItems = deadlineList.filter(x => x.diff < 0).sort((a, b) => a.diff - b.diff);
    const soonItems = deadlineList.filter(x => x.diff >= 0 && x.diff <= 3).sort((a, b) => a.diff - b.diff);
    const weekItems = deadlineList.filter(x => x.diff > 3 && x.diff <= 7).sort((a, b) => a.diff - b.diff);

    const renderDeadlineCard = (items, listId, countId, kind) => {
        const listEl = document.getElementById(listId);
        const countEl = document.getElementById(countId);
        if (countEl) countEl.textContent = items.length;
        if (!listEl) return;
        if (items.length === 0) {
            listEl.innerHTML = `<div class="deadline-card-empty">해당 항목이 없습니다</div>`;
            return;
        }
        listEl.innerHTML = items.slice(0, 4).map(({ p, diff }) => {
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
            const owner = (p.assignees && p.assignees.length ? p.assignees.join(', ') : (p.manager || '-'));
            return `<div class="deadline-card-row" onclick="showProjectDetail(${p.id})">
                <span class="dday" style="background:${ddayBg};color:${ddayColor}">${ddayLabel}</span>
                <span class="name">${p.name}</span>
                <span class="meta">${owner} · ${fmtDisplay(p.deadline)}</span>
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
    document.getElementById('dashProjects').innerHTML = projHtml || empty('진행 중 프로젝트 없음');
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
    renderProjects();
    if (p.category !== '해외 주문') {
        try {
            const { error } = await sb.from('projects_domestic').update({ status: newStatus }).eq('id', id);
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
    renderProjects();
    if (p.category !== '해외 주문') {
        try {
            const { error } = await sb.from('projects_domestic').update({ checks: p.checks }).eq('id', id);
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
            const commonTasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === '전체');
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
        // 대표님 탭: 대표님 컬럼을 맨 앞에, 그 다음 전체/임원
        const ceoTasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === '대표님');
        html += renderColumn('대표님', ceoTasks, '대표님');
        html += renderCommonCols(false);
    } else if (isPersonalTab) {
        html += renderPersonalCols();
        html += renderCommonCols(false);
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
        <div class="form-group"><label class="form-label">할 일</label><input type="text" class="form-input" id="quickTaskName" placeholder="할 일 입력" autofocus></div>
        <div class="form-group"><label class="form-label">담당자</label><select class="form-select" id="quickTaskAssignee">${assigneeHtml}</select></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">날짜</label><input type="date" class="form-input" id="quickTaskDate" value="${dateStr}"></div>
            <div class="form-group"><label class="form-label">마감일</label><input type="date" class="form-input" id="quickTaskDeadline"></div>
        </div>
        <div class="form-group"><label class="form-label">라벨</label><select class="form-select" id="quickTaskLabel">${labelHtml}</select></div>
        <div class="form-group"><label class="form-label">우선순위</label><select class="form-select" id="quickTaskPriority"><option value="🟡 보통">보통</option><option value="🔴 긴급">긴급</option><option value="🔵 낮음">낮음</option></select></div>
        <div class="form-group"><label class="form-label">고객사</label>${buildClientDatalistField('quickTaskClient', '', 'quickClientList')}</div>
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
        <div class="form-group"><label class="form-label">고객사</label>${buildClientDatalistField('quickTaskClient', '', 'quickClientList')}</div>
        <button class="form-submit" onclick="addQuickTask()">할 일 추가</button>`;
    document.getElementById('modalOverlay').classList.add('show');
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
        <div class="form-group"><label class="form-label">할 일</label><input type="text" class="form-input" id="editTaskName" value="${t.task.replace(/\s*\(마감일\)\s*$/, '')}" autofocus></div>
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
    document.getElementById('modalOverlay').classList.add('show');
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
            <td class="cell-editable" data-id="${d.id}" data-field="sender" data-type="select" data-options="케이엘피코리아,김관택,이현주,김현호,유지은,구정두,기타">${d.sender}</td>
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
                    const senders = ['케이엘피코리아','김관택','이현주','김현호','유지은','구정두'];
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
            <div class="form-group"><label class="form-label">판매가</label><input type="number" class="form-input" id="editDelPrice" value="${d.price || ''}" placeholder="0"></div>
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
    document.getElementById('modalOverlay').classList.add('show');
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
    const row = (label, val) => `<div style="display:flex;gap:10px;padding:5px 0;border-bottom:1px solid var(--gray-100)"><div style="width:100px;color:var(--text-tertiary);font-size:12px;font-weight:600">${label}</div><div style="flex:1;font-size:14px;color:var(--text-primary)">${escFn(val) || '-'}</div></div>`;

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

    // 매입 내역
    const supVatLabel = p.supplierUnitPriceVat || 'VAT 별도';
    const supProduct = supVatLabel === 'VAT 별도'
        ? Math.round((p.supplierUnitPrice || 0) * qty * 1.1)
        : (p.supplierUnitPrice || 0) * qty;
    const supPrint = feeCompute(p.supplierPrintFee, p.supplierPrintFeeVat, p.supplierPrintFeeApply);
    const supPack = feeCompute(p.supplierPackagingFee, p.supplierPackagingFeeVat, p.supplierPackagingFeeApply);

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
        return `<div onclick="toggleProjectCheck(${id},'${item.key}');setTimeout(()=>showProjectDetail(${id}),50)" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:${done ? '#E8F4FD' : 'var(--gray-50)'};border:1px solid ${done ? 'var(--blue)' : 'var(--gray-200)'};border-radius:8px;font-size:13px;cursor:pointer;transition:all .15s">
            <span style="display:inline-flex;width:18px;height:18px;border-radius:50%;background:${done ? 'var(--blue)' : 'var(--gray-300)'};color:white;align-items:center;justify-content:center;font-size:12px;font-weight:700">${done ? '✓' : ''}</span>
            <span style="font-weight:${done ? '700' : '500'}">${item.label}</span>
        </div>`;
    }).join('');

    const secTitle = (icon, text) =>`<div style="display:flex;align-items:center;gap:6px;font-size:14px;font-weight:800;color:var(--text-primary);padding-bottom:8px;margin-bottom:10px;border-bottom:2px solid var(--gray-200)">${icon} ${text}</div>`;
    const cardBase = 'background:#fff;border:1px solid var(--gray-200);border-radius:10px;padding:14px 18px;margin-bottom:14px';
    const brLine = (label, val) => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:var(--text-secondary)">${label}</span><strong style="color:var(--text-primary)">${val.toLocaleString()}원</strong></div>`;

    body.innerHTML = `
        <!-- 헤더 -->
        <div style="margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">
                <span class="badge ${statusBadgeClass(p.status)}">${p.status}</span>
                <span class="badge ${categoryBadgeClass(p.category)}">${p.category}</span>
                ${p.sourceDocNumber ? `<span class="badge" style="background:#E8F4FD;color:var(--blue)">DC ${escFn(p.sourceDocNumber)}</span>` : ''}
            </div>
            <h3 style="margin:0;font-size:20px;font-weight:800;color:var(--text-primary)">${escFn(p.client)}</h3>
            <div style="font-size:14px;color:var(--text-secondary);margin-top:2px">${escFn(p.name)}</div>
        </div>

        <!-- 요약 스트립 -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
            <div style="background:#E8F4FD;border:1px solid #CFE3F5;border-radius:10px;padding:12px;text-align:center">
                <div style="font-size:11px;color:var(--text-tertiary);font-weight:700;margin-bottom:4px">매출</div>
                <div style="font-size:17px;font-weight:800;color:var(--blue)">${revenue.toLocaleString()}<span style="font-size:12px">원</span></div>
            </div>
            <div style="background:${hasSupplier ? '#FFF5F0' : 'var(--gray-50)'};border:1px solid ${hasSupplier ? '#FFE0CC' : 'var(--gray-200)'};border-radius:10px;padding:12px;text-align:center">
                <div style="font-size:11px;color:var(--text-tertiary);font-weight:700;margin-bottom:4px">매입</div>
                <div style="font-size:17px;font-weight:800;color:${hasSupplier ? 'var(--klp-orange,#E67E22)' : 'var(--text-tertiary)'}">${hasSupplier ? purchaseTotal.toLocaleString() + '<span style="font-size:12px">원</span>' : '-'}</div>
            </div>
            <div style="background:${hasSupplier ? (margin >= 0 ? '#E8F8F0' : '#FDECEC') : 'var(--gray-50)'};border:1px solid ${hasSupplier ? (margin >= 0 ? '#B7E4C7' : '#F5B4B4') : 'var(--gray-200)'};border-radius:10px;padding:12px;text-align:center">
                <div style="font-size:11px;color:var(--text-tertiary);font-weight:700;margin-bottom:4px">마진 ${hasSupplier ? `(${marginPct}%)` : ''}</div>
                <div style="font-size:17px;font-weight:800;color:${hasSupplier ? (margin >= 0 ? '#16A34A' : 'var(--red)') : 'var(--text-tertiary)'}">${hasSupplier ? margin.toLocaleString() + '<span style="font-size:12px">원</span>' : '-'}</div>
            </div>
            <div style="background:#F5F5F7;border:1px solid var(--gray-200);border-radius:10px;padding:12px;text-align:center">
                <div style="font-size:11px;color:var(--text-tertiary);font-weight:700;margin-bottom:4px">납기 ${dday ? `<span style="color:var(--blue)">${dday}</span>` : ''}</div>
                <div style="font-size:14px;font-weight:800;color:var(--text-primary)">${p.deadline || '-'}</div>
            </div>
        </div>

        <!-- 기본 정보 -->
        <div style="${cardBase}">
            ${secTitle('📋', '기본 정보')}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">
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
        <div style="${cardBase}">
            ${secTitle('📦', '제품 정보')}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">
                <div>
                    ${row('품명', p.name)}
                    ${row('수량', `${qty.toLocaleString()} ${p.unit || ''}`)}
                    ${row('색상', p.color)}
                </div>
                <div>
                    ${row('인쇄 색상/사이즈', p.printColorSize)}
                    ${row('인쇄 방법', p.printMethod)}
                    ${row('포장', p.packaging)}
                </div>
            </div>
        </div>

        <!-- 금액 상세 (매출·매입 나란히) -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
            <div style="background:#F5FBFF;border:1.5px solid #CFE3F5;border-left:4px solid var(--blue);border-radius:10px;padding:14px 16px">
                <div style="font-size:14px;font-weight:800;color:var(--blue);padding-bottom:8px;margin-bottom:8px;border-bottom:2px solid #CFE3F5">💰 매출 상세</div>
                <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">단가 ${(p.unitPrice||0).toLocaleString()}원 × ${qty.toLocaleString()}${p.unit||''} (${salesVatLabel})</div>
                ${brLine('제품 합계', salesProduct)}
                ${brLine('＋ 인쇄비', salesPrint)}
                ${brLine('＋ 포장비', salesPack)}
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;margin-top:8px;background:#E8F4FD;border-radius:8px">
                    <span style="font-weight:800;color:var(--blue);font-size:13px">매출액</span>
                    <strong style="font-size:18px;color:var(--blue)">${revenue.toLocaleString()}원</strong>
                </div>
            </div>
            <div style="background:${hasSupplier ? '#FFF8F2' : 'var(--gray-50)'};border:1.5px solid ${hasSupplier ? '#FFE0CC' : 'var(--gray-200)'};border-left:4px solid ${hasSupplier ? 'var(--klp-orange,#E67E22)' : 'var(--gray-300)'};border-radius:10px;padding:14px 16px">
                <div style="font-size:14px;font-weight:800;color:${hasSupplier ? 'var(--klp-orange,#E67E22)' : 'var(--text-tertiary)'};padding-bottom:8px;margin-bottom:8px;border-bottom:2px solid ${hasSupplier ? '#FFE0CC' : 'var(--gray-200)'}">🏭 매입 상세</div>
                ${!hasSupplier ? `<div style="color:var(--text-tertiary);font-size:13px;padding:20px 0;text-align:center">매입처 정보 없음</div>` : `
                    <div style="font-size:13px;color:var(--text-primary);margin-bottom:4px"><strong>${escFn(p.supplier)}</strong>${p.supplierContact ? `<span style="color:var(--text-tertiary);font-size:12px"> · ${escFn(p.supplierContact)}</span>` : ''}</div>
                    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">매입단가 ${(p.supplierUnitPrice||0).toLocaleString()}원 × ${qty.toLocaleString()}${p.unit||''} (${supVatLabel})</div>
                    ${brLine('제품 합계', supProduct)}
                    ${brLine('＋ 매입 인쇄비', supPrint)}
                    ${brLine('＋ 매입 포장비', supPack)}
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;margin-top:8px;background:#fff;border:1px solid #FFE0CC;border-radius:8px">
                        <span style="font-weight:800;color:var(--klp-orange,#E67E22);font-size:13px">매입액</span>
                        <strong style="font-size:18px;color:var(--klp-orange,#E67E22)">${purchaseTotal.toLocaleString()}원</strong>
                    </div>
                `}
            </div>
        </div>

        <!-- 납기 및 배송 -->
        <div style="${cardBase}">
            ${secTitle('🚚', '납기 및 배송')}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">
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
        <div style="${cardBase}">
            ${secTitle('✅', '진행 체크리스트')}
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${checksHtml}</div>
        </div>

        <!-- 디자인확인서 -->
        <div style="${cardBase}">
            ${secTitle('🖼️', '디자인확인서')}
            <div id="dcDocArea">${p.sourceDocNumber ? `<div style="color:var(--text-tertiary);font-size:13px">디자인확인서 로딩 중...</div>` : `<div style="color:var(--text-tertiary);font-size:13px;padding:12px;background:var(--gray-50);border-radius:8px">연결된 디자인확인서가 없습니다. 상단의 "디자인확인서 만들기" 버튼으로 생성하세요.</div>`}</div>
        </div>

        <!-- 작업요청서 -->
        <div style="${cardBase}">
            ${secTitle('📋', '작업요청서')}
            <div id="wrDocArea">${p.sourceDocNumber ? `<div style="color:var(--text-tertiary);font-size:13px">작업요청서 로딩 중...</div>` : `<div style="color:var(--text-tertiary);font-size:13px;padding:12px;background:var(--gray-50);border-radius:8px">디자인확인서가 먼저 연결되어야 작업요청서를 조회할 수 있습니다</div>`}</div>
        </div>

        ${p.memo ? `
        <div style="background:#FFFBF0;border:1px solid #FDE68A;border-left:4px solid #F59E0B;border-radius:10px;padding:12px 16px;margin-bottom:14px">
            <div style="font-size:11px;color:#92400E;font-weight:800;margin-bottom:4px">📝 메모</div>
            <div style="font-size:13px;white-space:pre-wrap;color:var(--text-primary)">${escFn(p.memo)}</div>
        </div>` : ''}

        <!-- 액션 버튼 -->
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
            <button class="form-submit" style="flex:1 1 180px;background:var(--blue)" onclick="createDocFromProject(${id},'dc')">📄 디자인확인서 만들기</button>
            <button class="form-submit" style="flex:1 1 180px;background:var(--klp-orange,#E67E22)" onclick="createDocFromProject(${id},'wr')">📋 작업요청서 만들기</button>
            <button class="form-submit" style="flex:1 1 120px" onclick="openEditProject(${id})">✏️ 편집</button>
            <button class="form-submit" style="flex:1 1 100px;background:var(--gray-200);color:var(--gray-800)" onclick="closeModal()">닫기</button>
        </div>`;
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.add('show');
    overlay.classList.add('modal-wide');

    // DC / WR 비동기 로드
    if (p.sourceDocNumber) {
        const renderDocCard = (r, kind) => {
            const titleColor = kind === 'DC' ? 'var(--blue)' : 'var(--klp-orange,#E67E22)';
            const bg = kind === 'DC' ? '#F5FBFF' : '#FFF8F2';
            const brd = kind === 'DC' ? '#CFE3F5' : '#FFE0CC';
            const viewUrl = `doc-generator.html#view-${encodeURIComponent(r.doc_number)}`;
            const imgHtml = `<div style="border-radius:8px;overflow:hidden;border:1px solid var(--gray-200);background:#fff"><iframe src="${viewUrl}" style="width:100%;height:560px;border:0;display:block;background:#fff" loading="lazy" title="${escFn(r.doc_number)}"></iframe><div style="padding:6px 10px;background:var(--gray-50);border-top:1px solid var(--gray-200);text-align:right"><a href="${viewUrl}" target="_blank" style="font-size:11px;color:${titleColor};text-decoration:none;font-weight:700">새 탭에서 크게 보기 ↗</a></div></div>`;
            const clientLine = `${escFn(r.company_name || '')}${r.title ? ' — ' + escFn(r.title) : ''}`;
            return `<div style="background:${bg};border:1px solid ${brd};border-radius:10px;padding:12px 14px;margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;flex-wrap:wrap">
                    <div style="min-width:0">
                        <div style="font-size:11px;color:${titleColor};font-weight:800">${escFn(r.doc_number)}</div>
                        <div style="font-size:13px;color:var(--text-primary);font-weight:700;margin-top:2px">${clientLine}</div>
                        ${r.product_name ? `<div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">${escFn(r.product_name)}</div>` : ''}
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0">
                        <button onclick="downloadDoc('${escFn(r.doc_number)}','jpg')" style="padding:6px 12px;border:1.5px solid ${titleColor};border-radius:6px;background:#fff;color:${titleColor};font-size:12px;font-weight:700;cursor:pointer">📷 JPG</button>
                        <button onclick="downloadDoc('${escFn(r.doc_number)}','pdf')" style="padding:6px 12px;border:1.5px solid ${titleColor};border-radius:6px;background:#fff;color:${titleColor};font-size:12px;font-weight:700;cursor:pointer">📄 PDF</button>
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

// 상세보기의 DC/WR 다운로드 버튼 — 새 탭으로 doc-generator 열어 자동 렌더+다운로드
function downloadDoc(docNum, fmt) {
    window.open('doc-generator.html#dl-' + fmt + '-' + docNum, '_blank');
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

    const secCard = (inner) => `<div style="background:#fff;border:1px solid var(--gray-200);border-radius:10px;padding:16px 20px;margin-bottom:16px">${inner}</div>`;
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
                <div class="form-group"><label class="form-label">색상</label><input type="text" class="form-input" id="editProjectColor" value="${(p.color || '-').replace(/"/g, '&quot;')}"></div>
                <div class="form-group"><label class="form-label">인쇄 색상/사이즈</label><input type="text" class="form-input" id="editProjectPrintColorSize" value="${(p.printColorSize || '').replace(/"/g, '&quot;')}"></div>
            </div>
        `)}

        ${secCard(`
            <div class="form-section-title">🖨️ 인쇄 / 포장 <span style="font-size:12px;font-weight:600;color:var(--blue);margin-left:6px">(매출 기준)</span></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">인쇄 방법</label>
                    <select class="form-select" id="editProjectPrintMethod">
                        ${['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사','기타'].map(u=>`<option ${p.printMethod===u?'selected':''}>${u}</option>`).join('')}
                    </select>
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
            <div class="form-row">
                <div class="form-group"><label class="form-label">포장</label>
                    <select class="form-select" id="editProjectPackaging">
                        ${['개별박스','선물포장','선물포장+라벨부착','에어캡포장','기타'].map(u=>`<option ${p.packaging===u?'selected':''}>${u}</option>`).join('')}
                    </select>
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
            <div class="form-group" style="margin-top:8px;padding-top:12px;border-top:2px solid var(--gray-200)">
                <label class="form-label" style="color:var(--blue);font-weight:800">💰 매출액 (자동계산)</label>
                <div id="editProjectRevenueBreakdown" style="background:#F5FBFF;border:1px solid #CFE3F5;border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;color:var(--text-secondary)"></div>
                <div class="form-input" id="editProjectRevenueDisplay" style="background:#E8F4FD;color:var(--blue);font-weight:800;font-size:20px">${(p.revenue||0).toLocaleString()} 원</div>
            </div>
        `)}

        <div id="editSupplierDetailCard" style="background:#FFF8F2;border:1.5px solid #FFE0CC;border-left:4px solid var(--klp-orange,#E67E22);border-radius:10px;padding:16px 20px;margin-bottom:16px;display:${p.supplier ? 'block' : 'none'}">
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
            <div class="form-group" style="margin-top:8px;padding-top:12px;border-top:2px solid #FFE0CC">
                <label class="form-label" style="color:var(--klp-orange,#E67E22);font-weight:800">💰 매입액 (자동계산)</label>
                <div id="editProjectSupBreakdown" style="background:#fff;border:1px solid #FFE0CC;border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;color:var(--text-secondary)"></div>
                <div class="form-input" id="editProjectSupTotalDisplay" style="background:#fff;color:var(--klp-orange,#E67E22);font-weight:800;font-size:20px">${(p.supplierRevenue||0).toLocaleString()} 원</div>
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
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
            <button class="form-submit" style="flex:1;background:var(--red)" onclick="deleteProject(${p.id})">🗑️ 삭제</button>
            <button class="form-submit" style="flex:2" onclick="updateProject(${p.id})">💾 수정 저장</button>
        </div>`;
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.add('show');
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
    const revenue = productTotal + printTotal + packTotal;
    displayEl.textContent = revenue.toLocaleString() + ' 원';
    const bd = document.getElementById('editProjectRevenueBreakdown');
    if (bd) bd.innerHTML = _breakdownHtml(productTotal, printTotal, packTotal);
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
    const total = productTotal + printTotal + packTotal;
    displayEl.textContent = total.toLocaleString() + ' 원';
    const bd = document.getElementById('editProjectSupBreakdown');
    if (bd) bd.innerHTML = _breakdownHtml(productTotal, printTotal, packTotal);
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
    const revenue = productTotal + printTotal + packTotal;

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
        supplierRevenue = supProductTotal + supPrintTotal + supPackTotal;
    }

    const newChecks = {};
    Object.keys(p.checks || {}).forEach(k => {
        const el = document.getElementById(`editCheck-${k}`);
        newChecks[k] = el ? el.checked : false;
    });

    Object.assign(p, {
        name, client,
        supplier: supplierName,
        contactPerson: getVal('editProjectContact'),
        title: '',
        manager: getVal('editProjectManager'),
        status: getVal('editProjectStatus'),
        supplierContact: getVal('editProjectSupplierContact'),
        unitPrice, qty, vat, revenue,
        unit: getVal('editProjectUnit'),
        color: getVal('editProjectColor'),
        printColorSize: getVal('editProjectPrintColorSize'),
        printMethod: getVal('editProjectPrintMethod'),
        printFee: readProjectNumber('editProjectPrintFee'),
        printCost: readProjectNumber('editProjectPrintFee'),
        printFeeVat: getVal('editProjectPrintFeeVat'),
        printFeeApply: getVal('editProjectPrintFeeApply'),
        packaging: getVal('editProjectPackaging'),
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
                supplier_revenue: p.supplierRevenue || 0
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
            const secCard = (inner) => `<div style="background:#fff;border:1px solid var(--gray-200);border-radius:10px;padding:16px 20px;margin-bottom:16px">${inner}</div>`;
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
                        <div class="form-group"><label class="form-label">색상</label><input type="text" class="form-input" id="newProjectColor" value="${v('color') || '-'}"></div>
                        <div class="form-group"><label class="form-label">인쇄 색상/사이즈</label><input type="text" class="form-input" id="newProjectPrintColorSize" value="${v('printColorSize') || '시안 확인'}"></div>
                    </div>
                `)}

                ${secCard(`
                    <div class="form-section-title">🖨️ 인쇄 / 포장 <span style="font-size:12px;font-weight:600;color:var(--blue);margin-left:6px">(매출 기준)</span></div>
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">인쇄 방법</label>
                            <select class="form-select" id="newProjectPrintMethod">
                                ${['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사','기타'].map(u=>`<option ${v('printMethod')===u?'selected':''}>${u}</option>`).join('')}
                            </select>
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
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">포장</label>
                            <select class="form-select" id="newProjectPackaging">
                                ${['개별박스','선물포장','선물포장+라벨부착','에어캡포장','기타'].map(u=>`<option ${v('packaging')===u?'selected':''}>${u}</option>`).join('')}
                            </select>
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
                    <div class="form-group" style="margin-top:8px;padding-top:12px;border-top:2px solid var(--gray-200)">
                        <label class="form-label" style="color:var(--blue);font-weight:800">💰 매출액 (자동계산)</label>
                        <div id="newProjectRevenueBreakdown" style="background:#F5FBFF;border:1px solid #CFE3F5;border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;color:var(--text-secondary)"></div>
                        <div class="form-input" id="newProjectRevenueDisplay" style="background:#E8F4FD;color:var(--blue);font-weight:800;font-size:20px">0 원</div>
                    </div>
                `)}

                <div id="supplierDetailCard" style="background:#FFF8F2;border:1.5px solid #FFE0CC;border-left:4px solid var(--klp-orange,#E67E22);border-radius:10px;padding:16px 20px;margin-bottom:16px;display:none">
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
                    <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                        <div class="form-group"><label class="form-label">매입 인쇄비</label><input type="text" inputmode="numeric" class="form-input" id="newProjectSupPrintFee" placeholder="0" oninput="fmtProjectNumberInput(this);calcSupplierTotal()"></div>
                        <div class="form-group"><label class="form-label">VAT</label>
                            <select class="form-select" id="newProjectSupPrintFeeVat" onchange="calcSupplierTotal()"><option>VAT 별도</option><option>VAT 포함</option></select>
                        </div>
                        <div class="form-group"><label class="form-label">적용 방식</label>
                            <select class="form-select" id="newProjectSupPrintFeeApply" onchange="calcSupplierTotal()"><option>1개당</option><option>일괄</option></select>
                        </div>
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
                    <div class="form-group" style="margin-top:8px;padding-top:12px;border-top:2px solid #FFE0CC">
                        <label class="form-label" style="color:var(--klp-orange,#E67E22);font-weight:800">💰 매입액 (자동계산)</label>
                        <div id="newProjectSupBreakdown" style="background:#fff;border:1px solid #FFE0CC;border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;color:var(--text-secondary)"></div>
                        <div class="form-input" id="newProjectSupTotalDisplay" style="background:#fff;color:var(--klp-orange,#E67E22);font-weight:800;font-size:20px">0 원</div>
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
                        <option value="__custom">기타 (직접입력)</option>
                    </select>
                    <input type="text" class="form-input" id="newDelSenderCustom" placeholder="발송인을 입력하세요" style="display:none;margin-top:6px">
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
    }
    document.getElementById('modalOverlay').classList.add('show');
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

// 매출/매입 내역 한 줄
function _breakdownHtml(productTotal, printTotal, packTotal, accent) {
    const r = (label, val) => `<div style="display:flex;justify-content:space-between;padding:3px 0"><span>${label}</span><strong style="color:var(--text-primary)">${val.toLocaleString()}원</strong></div>`;
    return r('제품 (단가 × 수량)', productTotal) + r('＋ 인쇄비', printTotal) + r('＋ 포장비', packTotal);
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
    const revenue = productTotal + printTotal + packTotal;
    displayEl.textContent = revenue.toLocaleString() + ' 원';
    const bd = document.getElementById('newProjectRevenueBreakdown');
    if (bd) bd.innerHTML = _breakdownHtml(productTotal, printTotal, packTotal);
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
    const total = productTotal + printTotal + packTotal;
    displayEl.textContent = total.toLocaleString() + ' 원';
    const bd = document.getElementById('newProjectSupBreakdown');
    if (bd) bd.innerHTML = _breakdownHtml(productTotal, printTotal, packTotal);
    _renderMargin('newProjectMarginDisplay', _parseKRW('newProjectRevenueDisplay'), total);
}

function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('show');
    overlay.classList.remove('modal-wide');
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
    const revenue = productTotal + printTotal + packTotal;

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
        printMethod: getVal('newProjectPrintMethod'),
        printFee: getInt('newProjectPrintFee'),
        printFeeVat: getVal('newProjectPrintFeeVat') || 'VAT 별도',
        printFeeApply: getVal('newProjectPrintFeeApply') || '1개당',
        packaging: getVal('newProjectPackaging'),
        packagingFee: getInt('newProjectPackFee'),
        packagingFeeVat: getVal('newProjectPackFeeVat') || 'VAT 별도',
        packagingFeeApply: getVal('newProjectPackFeeApply') || '1개당',
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
                supplier_revenue: newProject.supplierRevenue || 0
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
async function dbUpdateClient(id, patch) {
    const dbPatch = clientToDb(patch);
    // patch might be partial — strip undefined
    Object.keys(dbPatch).forEach(k => { if (dbPatch[k] === undefined) delete dbPatch[k]; });
    const { error } = await sb.from('clients').update(dbPatch).eq('id', id);
    if (error) { console.error(error); showToast('DB 수정 실패: ' + error.message); }
}
async function dbDeleteClient(id) {
    const { error } = await sb.from('clients').delete().eq('id', id);
    if (error) { console.error(error); showToast('DB 삭제 실패: ' + error.message); }
}

function filterClients() {
    if (!clientSearch) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter(c =>
        (c.companyName || '').toLowerCase().includes(q) ||
        (c.ceo || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.mobile || '').toLowerCase().includes(q) ||
        (c.staffName || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
    );
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
        return `<tr onclick="clientRowClick(${c.id})" style="cursor:pointer">
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
    }).join('') || `<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text-tertiary)">고객사가 없습니다</td></tr>`;

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
            <div class="form-group"><label class="form-label">회사명 <span style="color:var(--red)">*</span></label><input type="text" class="form-input" id="cliCompanyName" value="${v('companyName')}" placeholder="회사명" autofocus></div>
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
    document.getElementById('modalOverlay').classList.add('show');
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
    overlay.classList.add('show');
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
    // 0502로 시작하는 번호는 4-4-4 양식 (0000-0000-0000)
    if (digits.startsWith('0502')) {
        if (digits.length <= 4) {
            formatted = digits;
        } else if (digits.length <= 8) {
            formatted = digits.slice(0, 4) + '-' + digits.slice(4);
        } else {
            formatted = digits.slice(0, 4) + '-' + digits.slice(4, 8) + '-' + digits.slice(8, 12);
        }
    } else {
        if (digits.length <= 3) {
            formatted = digits;
        } else if (digits.length <= 7) {
            formatted = digits.slice(0, 3) + '-' + digits.slice(3);
        } else {
            formatted = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
        }
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
    if (entity === 'client') {
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
            await dbUpdate({ [field]: row[field] });
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
