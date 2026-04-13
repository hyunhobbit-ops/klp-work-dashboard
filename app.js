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
    setupTopbar();
    setupSidebar();
    setupTabs();
    setupFilters();
    setupDateNav();
    setupSearch();
    setupShortcuts();
    checkAuth();
});

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
    // 매출처(부모) 행만 메인 목록에 표시. 매입처(자식) 행은 상세 모달에서 표시.
    const baseList = dataArr.filter(p => !p.parentProjectId);
    const filtered = filter === 'all' ? baseList : baseList.filter(p => p.status === filter);
    const checkSvg = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`;

    // 자식 개수 계산 (배지 표시용)
    const childCountByParent = {};
    dataArr.filter(p => p.parentProjectId).forEach(c => {
        childCountByParent[c.parentProjectId] = (childCountByParent[c.parentProjectId] || 0) + 1;
    });

    // 부모별 자식 목록 캐싱
    const childrenByParent = {};
    dataArr.filter(p => p.parentProjectId).forEach(c => {
        (childrenByParent[c.parentProjectId] = childrenByParent[c.parentProjectId] || []).push(c);
    });

    let tableHtml = '';
    let cardHtml = '';
    filtered.forEach(p => {
        const childCount = childCountByParent[p.id] || 0;
        const supplierBadge = childCount > 0 ? ` <span class="badge badge-orange" style="font-size:10px">매입 ${childCount}</span>` : '';
        const pNum = parseInt(p.progress) || 0;
        const checks = p.checks || {};
        const checkDots = CHECK_ITEMS.map(item => {
            const v = checks[item.key];
            return `<div class="check-item" onclick="event.stopPropagation();toggleProjectCheck(${p.id},'${item.key}')" style="cursor:pointer"><div class="check-dot ${v ? 'done' : ''}" title="${item.label} (클릭하여 토글)">${v ? checkSvg : ''}</div><span class="check-label">${item.short}</span></div>`;
        }).join('');

        const revenueStr = (p.revenue || 0).toLocaleString() + '원';

        // 매입액(자식 합계) / 마진 계산
        const childrenForP = childrenByParent[p.id] || [];
        // 매입처: 자식 매입처 이름들 (없으면 부모 자체 supplier)
        const childSuppliers = childrenForP.map(c => c.supplier).filter(Boolean);
        const supplierDisplay = childSuppliers.length > 0
            ? (childSuppliers.length <= 2 ? childSuppliers.join(', ') : `${childSuppliers[0]} 외 ${childSuppliers.length - 1}곳`)
            : (p.supplier || '-');
        const purchaseTotal = childrenForP.reduce((s, c) => s + (c.revenue || 0), 0);
        const marginVal = (p.revenue || 0) - purchaseTotal;
        const marginPctVal = p.revenue > 0 ? Math.round((marginVal / p.revenue) * 100) : 0;
        const purchaseStr = purchaseTotal > 0 ? purchaseTotal.toLocaleString() + '원' : '-';
        const marginStr = purchaseTotal > 0
            ? `<span style="color:${marginVal >= 0 ? 'var(--blue)' : 'var(--red)'};font-weight:700">${marginVal.toLocaleString()}원 (${marginPctVal}%)</span>`
            : '-';

        const ownerStr = p.manager || (p.assignees && p.assignees.length ? p.assignees.join(', ') : '-');
        tableHtml += `<tr onclick="projectRowClick(${p.id})" ondblclick="projectRowDblClick(${p.id})" style="cursor:pointer">
            <td><span class="badge ${statusBadgeClass(p.status)}">${p.status}</span></td>
            <td><strong>${p.client || '-'}</strong>${supplierBadge}</td>
            <td>${supplierDisplay}</td>
            <td>${p.name}</td>
            <td>${ownerStr}</td>
            <td>${revenueStr}</td>
            <td>${purchaseStr}</td>
            <td>${marginStr}</td>
            <td>${p.deadline ? fmtDisplay(p.deadline) : '-'}</td>
            <td><div class="checks-row">${checkDots}</div></td>
            <td><button class="edit-btn" onclick="event.stopPropagation();openEditProject(${p.id})">편집</button></td>
        </tr>`;

        cardHtml += `<div class="resp-card" onclick="showProjectDetail(${p.id})">
            <div class="resp-card-top">
                <div class="resp-card-title">${p.client || '-'} — ${p.name}</div>
                <span class="badge ${statusBadgeClass(p.status)}">${p.status}</span>
            </div>
            <div class="resp-card-meta">
                ${p.supplier ? `<div class="resp-card-row">매입처: ${p.supplier}</div>` : ''}
                <div class="resp-card-row"><strong>${p.assignees.join(', ')}</strong> · 매출 ${revenueStr}</div>
                <div class="resp-card-row">마감 ${p.deadline ? fmtDisplay(p.deadline) : '-'}</div>
                <div class="resp-card-row" style="margin-top:4px"><div class="progress-cell" style="flex:1"><div class="progress-bar"><div class="progress-fill pf-${pNum}"></div></div><span class="progress-pct">${p.progress}</span></div></div>
            </div>
        </div>`;
    });

    document.getElementById(tableBodyId).innerHTML = tableHtml;
    document.getElementById(cardGridId).innerHTML = cardHtml;
}

let _projectRowClickTimer = null;
function projectRowClick(id) {
    if (_projectRowClickTimer) clearTimeout(_projectRowClickTimer);
    _projectRowClickTimer = setTimeout(() => {
        _projectRowClickTimer = null;
        showProjectDetail(id);
    }, 250);
}
function projectRowDblClick(id) {
    if (_projectRowClickTimer) { clearTimeout(_projectRowClickTimer); _projectRowClickTimer = null; }
    openEditProject(id);
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
    const todayStr = fmtDate(currentDate);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const d = currentDate;
    document.getElementById('currentDateDisplay').textContent =
        `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;

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
                    <input type="text" class="daily-inline-input" placeholder="할 일 입력 후 Enter" onkeydown="if(event.key==='Enter')inlineAddTask(this,'${assignee}')">
                </div>
            </div>
        </div>`;
    }

    let html = '';

    // 개인별 탭일 때: 개인 컬럼을 맨 앞에, 그 다음 전체/임원/대표님 순
    const isPersonalTab = currentPersonFilter !== 'viewall' && currentPersonFilter !== 'ceo';

    const renderCommonCols = () => {
        let h = '';
        if (showCommonColumn) {
            const commonTasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === '전체');
            h += renderColumn('전체 (공통)', commonTasks, '전체');
        }
        if (showExecColumn) {
            const execTasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === '임원');
            h += renderColumn('임원', execTasks, '임원');
        }
        if (showCeoColumn) {
            const ceoTasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === '대표님');
            h += renderColumn('대표님', ceoTasks, '대표님');
        }
        return h;
    };
    const renderPersonalCols = () => displayPeople.map(person => {
        const tasks = dailyTasks.filter(t => t.date === todayStr && t.assignee === person);
        return renderColumn(person, tasks, person);
    }).join('');

    if (isPersonalTab) {
        html += renderPersonalCols();
        html += renderCommonCols();
    } else {
        html += renderCommonCols();
        html += renderPersonalCols();
    }

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

async function inlineAddWeeklyTask(input, person, dateStr) {
    const task = input.value.trim();
    if (!task) return;
    const saved = await dbInsertTask({
        task, date: dateStr, assignee: person, target: '',
        priority: '🟡 보통', done: false
    });
    if (!saved) return;
    dailyTasks.push(saved);
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
    const saved = await dbInsertTask({
        task, date: fmtDate(currentDate), assignee,
        target: '본사', priority: '🟡 보통', done: false
    });
    if (!saved) return;
    dailyTasks.push(saved);
    renderDaily();
    renderHome();
    showToast('할 일이 추가되었습니다');
    // 렌더링 후 일일계획 같은 컬럼의 인라인 입력에 포커스 유지
    const inputs = document.querySelectorAll('#dailyColumns .daily-inline-input');
    inputs.forEach(el => {
        if (el.getAttribute('onkeydown').includes(`'${assignee}'`)) el.focus();
    });
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
        sender: document.getElementById('editDelSender').value,
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
    const row = (label, val) => `<div style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--gray-100)"><div style="width:110px;color:var(--text-tertiary);font-size:13px">${label}</div><div style="flex:1;font-size:14px">${escFn(val) || '-'}</div></div>`;

    // 자식(매입처) 데이터
    const children = projects.filter(x => x.parentProjectId === p.id);
    const purchaseTotal = children.reduce((s, c) => s + (c.revenue || 0), 0);
    const margin = (p.revenue || 0) - purchaseTotal;
    const marginPct = p.revenue > 0 ? Math.round((margin / p.revenue) * 100) : 0;

    // 매입처 카드
    const suppliersHtml = children.length === 0
        ? `<div style="color:var(--text-tertiary);font-size:13px;padding:12px;background:var(--gray-50);border-radius:8px">등록된 매입처가 없습니다.<br>문서생성기 작업요청서에서 "프로젝트 진행사항(국내)으로 내보내기"로 추가할 수 있습니다.</div>`
        : children.map(c => `<div style="border:1px solid #FFE0CC;border-radius:8px;padding:12px;margin-bottom:8px;background:#FFF8F2;cursor:pointer" onclick="event.stopPropagation();openEditProject(${c.id})">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <div style="font-size:15px"><strong>${escFn(c.supplier || '-')}</strong> <span style="color:var(--text-tertiary);font-size:12px;margin-left:6px">${escFn(c.name || '')}</span></div>
                <span class="badge ${statusBadgeClass(c.status)}">${escFn(c.status)}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px 14px;font-size:13px;color:var(--text-secondary)">
                <div>매입가: <strong>${(c.unitPrice || 0).toLocaleString()}원</strong></div>
                <div>수량: <strong>${(c.qty || 0).toLocaleString()}${c.unit || ''}</strong></div>
                <div>매입 합계: <strong>${(c.revenue || 0).toLocaleString()}원</strong></div>
                ${c.printFee ? `<div>인쇄비: ${(c.printFee).toLocaleString()}원</div>` : '<div></div>'}
                ${c.packagingFee ? `<div>포장비: ${(c.packagingFee).toLocaleString()}원</div>` : '<div></div>'}
                ${c.deadline ? `<div>납기: ${escFn(c.deadline)}</div>` : '<div></div>'}
                ${c.sourceDocNumber ? `<div style="grid-column:1/-1;font-size:11px;color:var(--text-tertiary)">WR: ${escFn(c.sourceDocNumber)}</div>` : ''}
            </div>
        </div>`).join('');

    // 체크리스트
    const checks = p.checks || {};
    const checksHtml = CHECK_ITEMS.map(item => {
        const done = !!checks[item.key];
        return `<div onclick="toggleProjectCheck(${id},'${item.key}');setTimeout(()=>showProjectDetail(${id}),50)" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:${done ? '#E8F4FD' : 'var(--gray-50)'};border:1px solid ${done ? 'var(--blue)' : 'var(--gray-200)'};border-radius:8px;font-size:13px;cursor:pointer;transition:all .15s">
            <span style="display:inline-flex;width:18px;height:18px;border-radius:50%;background:${done ? 'var(--blue)' : 'var(--gray-300)'};color:white;align-items:center;justify-content:center;font-size:12px;font-weight:700">${done ? '✓' : ''}</span>
            <span style="font-weight:${done ? '700' : '500'}">${item.label}</span>
        </div>`;
    }).join('');

    // 이미지 placeholder
    const imagesPlaceholder = p.sourceDocNumber
        ? `<div id="dcImagesArea"><div style="color:var(--text-tertiary);font-size:13px">디자인확인서 이미지 로딩 중...</div></div>`
        : `<div style="color:var(--text-tertiary);font-size:13px;padding:12px;background:var(--gray-50);border-radius:8px">연결된 디자인확인서가 없습니다</div>`;

    const sectionTitle = (icon, text) => `<div style="display:flex;align-items:center;gap:6px;font-size:15px;font-weight:800;color:var(--text-primary);padding-bottom:8px;margin-bottom:10px;border-bottom:2px solid var(--gray-200)">${icon} ${text}</div>`;

    body.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;flex-wrap:wrap">
            <span class="badge ${statusBadgeClass(p.status)}">${p.status}</span>
            <span class="badge ${categoryBadgeClass(p.category)}">${p.category}</span>
            <h3 style="margin:0;font-size:20px">${escFn(p.client)} — ${escFn(p.name)}</h3>
        </div>

        <!-- 섹션 1: 프로젝트 기본정보 -->
        <div style="background:#fff;border:1px solid var(--gray-200);border-radius:10px;padding:16px;margin-bottom:16px">
            ${sectionTitle('📋', '프로젝트 기본정보')}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">
                <div>
                    ${row('매출처', p.client)}
                    ${row('매출처 담당자', p.contactPerson)}
                    ${row('매입처', p.supplier)}
                    ${row('매입처 담당자', p.supplierContact)}
                    ${row('본사 담당자', p.manager || (p.assignees || []).join(', '))}
                    ${row('품명', p.name)}
                    ${row('수량', `${(p.qty || 0).toLocaleString()} ${p.unit || ''}`)}
                    ${row('단가', (p.unitPrice || 0).toLocaleString() + '원')}
                    ${row('VAT', p.vat === 'include' ? 'VAT 포함' : 'VAT 별도')}
                    ${row('매출액', (p.revenue || 0).toLocaleString() + '원')}
                </div>
                <div>
                    ${row('색상', p.color)}
                    ${row('인쇄 색상/사이즈', p.printColorSize)}
                    ${row('인쇄 방법', p.printMethod)}
                    ${row('포장', p.packaging)}
                    ${row('시작일', p.startDate)}
                    ${row('납기일', p.deadline)}
                    ${row('수령인', p.recipient)}
                    ${row('주소', `${p.address || ''}${p.phone ? ` (${p.phone})` : ''}`)}
                </div>
            </div>
            ${p.memo ? `<div style="margin-top:12px;background:var(--gray-50);border-radius:8px;padding:10px 14px;font-size:13px;white-space:pre-wrap"><span style="color:var(--text-tertiary);font-weight:700">메모</span><br>${escFn(p.memo)}</div>` : ''}
        </div>

        <!-- 섹션 2: 매입처 정보 -->
        <div style="background:#fff;border:1px solid var(--gray-200);border-radius:10px;padding:16px;margin-bottom:16px">
            ${sectionTitle('🏭', `매입처 정보 (${children.length}건)`)}
            ${suppliersHtml}
        </div>

        <!-- 섹션 3: 체크리스트 + 비용 요약 + 시안 이미지 -->
        <div style="background:#fff;border:1px solid var(--gray-200);border-radius:10px;padding:16px;margin-bottom:16px">
            ${sectionTitle('✅', '체크리스트 및 비용 요약')}
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">${checksHtml}</div>

            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
                <div style="background:#E8F4FD;border-radius:8px;padding:14px;text-align:center">
                    <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px">매출 합계</div>
                    <div style="font-size:18px;font-weight:800;color:var(--blue)">${(p.revenue || 0).toLocaleString()}원</div>
                </div>
                <div style="background:#FFF5F0;border-radius:8px;padding:14px;text-align:center">
                    <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px">매입 합계</div>
                    <div style="font-size:18px;font-weight:800;color:var(--klp-orange,#E67E22)">${purchaseTotal.toLocaleString()}원</div>
                </div>
                <div style="background:${margin >= 0 ? '#E8F8F0' : '#FDECEC'};border-radius:8px;padding:14px;text-align:center">
                    <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px">마진 (${marginPct}%)</div>
                    <div style="font-size:18px;font-weight:800;color:${margin >= 0 ? 'var(--green,#16A34A)' : 'var(--red)'}">${margin.toLocaleString()}원</div>
                </div>
            </div>

            <div style="font-size:13px;font-weight:700;color:var(--text-secondary);margin-bottom:8px">🖼️ 디자인확인서 시안 이미지</div>
            ${imagesPlaceholder}
        </div>

        <div style="display:flex;gap:8px;margin-top:16px">
            <button class="form-submit" style="flex:1" onclick="openEditProject(${id})">✏️ 편집</button>
            <button class="form-submit" style="flex:1;background:var(--gray-200);color:var(--gray-800)" onclick="closeModal()">닫기</button>
        </div>`;
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.add('show');
    overlay.classList.add('modal-wide');

    // DC 이미지 비동기 로드
    if (p.sourceDocNumber) {
        try {
            const { data, error } = await sb.from('confirmations')
                .select('images_data')
                .eq('doc_number', p.sourceDocNumber)
                .limit(1);
            const area = document.getElementById('dcImagesArea');
            if (!area) return;
            if (error || !data || data.length === 0 || !data[0].images_data) {
                area.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px">디자인확인서 이미지를 찾을 수 없습니다 (문서번호: ${escFn(p.sourceDocNumber)})</div>`;
                return;
            }
            let imgs;
            try { imgs = JSON.parse(data[0].images_data); } catch(e) { imgs = null; }
            if (!imgs || (!imgs.main && (!imgs.subs || imgs.subs.length === 0))) {
                area.innerHTML = `<div style="color:var(--text-tertiary);font-size:13px">디자인확인서에 첨부된 이미지가 없습니다</div>`;
                return;
            }
            let html = '';
            if (imgs.main) {
                html += `<div style="margin-bottom:8px"><img src="${imgs.main}" style="max-width:100%;border-radius:8px;border:1px solid var(--gray-200);cursor:pointer" onclick="window.open('${imgs.main}','_blank')"></div>`;
            }
            if (imgs.subs && imgs.subs.length > 0) {
                html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">`;
                imgs.subs.forEach(s => {
                    html += `<img src="${s}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;border:1px solid var(--gray-200);cursor:pointer" onclick="window.open('${s}','_blank')">`;
                });
                html += `</div>`;
            }
            area.innerHTML = html;
        } catch (err) {
            const area = document.getElementById('dcImagesArea');
            if (area) area.innerHTML = `<div style="color:var(--red);font-size:13px">이미지 로드 실패: ${err.message}</div>`;
        }
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
    const progressOpts = ['0%', '25%', '50%', '75%', '100%'];
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

    body.innerHTML = `
        <datalist id="clientsListDoc">${clients.map(c => `<option value="${(c.companyName || '').replace(/"/g, '&quot;')}"></option>`).join('')}</datalist>

        ${secCard(`
            <div class="form-section-title">📋 기본 정보</div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">매출처 <span style="color:var(--red)">*</span></label><input type="text" class="form-input" id="editProjectClient" list="clientsListDoc" autocomplete="off" value="${(p.client || '').replace(/"/g, '&quot;')}"></div>
                <div class="form-group"><label class="form-label">매출처 담당자</label><input type="text" class="form-input" id="editProjectContact" value="${(p.contactPerson || '').replace(/"/g, '&quot;')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">매입처 (작업요청서 발송 공장)</label><input type="text" class="form-input" id="editProjectSupplier" list="clientsListDoc" autocomplete="off" value="${(p.supplier || '').replace(/"/g, '&quot;')}" placeholder="공장/제작처"></div>
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
                <div class="form-group"><label class="form-label">수량</label><input type="text" inputmode="numeric" class="form-input" id="editProjectQty" value="${p.qty ? Number(p.qty).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this);calcEditProjectRevenue()"></div>
                <div class="form-group"><label class="form-label">단위</label>
                    <select class="form-select" id="editProjectUnit">
                        ${['개','세트','장','박스','EA'].map(u=>`<option ${p.unit===u?'selected':''}>${u}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row" style="grid-template-columns:2fr 1fr">
                <div class="form-group"><label class="form-label">단가</label><input type="text" inputmode="numeric" class="form-input" id="editProjectUnitPrice" value="${p.unitPrice ? Number(p.unitPrice).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this);calcEditProjectRevenue()"></div>
                <div class="form-group"><label class="form-label">VAT</label>
                    <select class="form-select" id="editProjectVat" onchange="calcEditProjectRevenue()">
                        <option value="exclude" ${vatCurrent==='exclude'?'selected':''}>VAT 별도</option>
                        <option value="include" ${vatCurrent==='include'?'selected':''}>VAT 포함</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">매출액 (자동계산)</label>
                <div class="form-input" id="editProjectRevenueDisplay" style="background:var(--gray-50);color:var(--blue);font-weight:800;font-size:18px">${(p.revenue||0).toLocaleString()} 원</div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">색상</label><input type="text" class="form-input" id="editProjectColor" value="${(p.color || '-').replace(/"/g, '&quot;')}"></div>
                <div class="form-group"><label class="form-label">인쇄 색상/사이즈</label><input type="text" class="form-input" id="editProjectPrintColorSize" value="${(p.printColorSize || '').replace(/"/g, '&quot;')}"></div>
            </div>
        `)}

        ${secCard(`
            <div class="form-section-title">🖨️ 인쇄 / 포장</div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">인쇄 방법</label>
                    <select class="form-select" id="editProjectPrintMethod">
                        ${['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사','기타'].map(u=>`<option ${p.printMethod===u?'selected':''}>${u}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                <div class="form-group"><label class="form-label">인쇄비</label><input type="text" inputmode="numeric" class="form-input" id="editProjectPrintFee" value="${(p.printFee || p.printCost) ? Number(p.printFee || p.printCost).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this)"></div>
                <div class="form-group"><label class="form-label">VAT</label>
                    <select class="form-select" id="editProjectPrintFeeVat">
                        <option ${printFeeVat==='VAT 별도'?'selected':''}>VAT 별도</option>
                        <option ${printFeeVat==='VAT 포함'?'selected':''}>VAT 포함</option>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">적용 방식</label>
                    <select class="form-select" id="editProjectPrintFeeApply">
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
                <div class="form-group"><label class="form-label">포장비</label><input type="text" inputmode="numeric" class="form-input" id="editProjectPackFee" value="${(p.packagingFee || p.packCost) ? Number(p.packagingFee || p.packCost).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this)"></div>
                <div class="form-group"><label class="form-label">VAT</label>
                    <select class="form-select" id="editProjectPackFeeVat">
                        <option ${packagingFeeVat==='VAT 별도'?'selected':''}>VAT 별도</option>
                        <option ${packagingFeeVat==='VAT 포함'?'selected':''}>VAT 포함</option>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">적용 방식</label>
                    <select class="form-select" id="editProjectPackFeeApply">
                        <option ${packagingFeeApply==='1개당'?'selected':''}>1개당</option>
                        <option ${packagingFeeApply==='일괄'?'selected':''}>일괄</option>
                    </select>
                </div>
            </div>
        `)}

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

        <div style="display:flex;gap:8px;margin-top:12px">
            <button class="form-submit" style="flex:1;background:var(--red)" onclick="deleteProject(${p.id})">🗑️ 삭제</button>
            <button class="form-submit" style="flex:2" onclick="updateProject(${p.id})">💾 수정 저장</button>
        </div>`;
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.add('show');
    overlay.classList.add('modal-wide');
}

function calcEditProjectRevenue() {
    const price = readProjectNumber('editProjectUnitPrice');
    const qty = readProjectNumber('editProjectQty');
    const vat = document.getElementById('editProjectVat').value;
    let revenue = price * qty;
    if (vat === 'exclude') revenue = Math.round(revenue * 1.1);
    document.getElementById('editProjectRevenueDisplay').textContent = revenue.toLocaleString() + ' 원';
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
    let revenue = unitPrice * qty;
    if (vat === 'exclude') revenue = Math.round(revenue * 1.1);

    const newChecks = {};
    Object.keys(p.checks || {}).forEach(k => {
        const el = document.getElementById(`editCheck-${k}`);
        newChecks[k] = el ? el.checked : false;
    });

    Object.assign(p, {
        name, client,
        supplier: getVal('editProjectSupplier'),
        contactPerson: getVal('editProjectContact'),
        title: '',
        manager: getVal('editProjectManager'),
        status: getVal('editProjectStatus'),
        progress: p.progress || '0%',
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
                progress: p.progress,
                checks: p.checks,
                memo: p.memo,
                supplier: p.supplier,
                supplier_contact: p.supplierContact || '',
                print_fee_vat: p.printFeeVat,
                print_fee_apply: p.printFeeApply,
                packaging_fee_vat: p.packagingFeeVat,
                packaging_fee_apply: p.packagingFeeApply
            }).eq('id', id);
            if (error) throw error;
        } catch (err) {
            console.error('Supabase 수정 실패:', err);
            showToast('DB 수정 실패: ' + err.message);
        }
    }

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
                        <div class="form-group"><label class="form-label">매입처 (작업요청서 발송 공장)</label><input type="text" class="form-input" id="newProjectSupplier" list="clientsListDoc" autocomplete="off" placeholder="공장/제작처" value="${v('supplier')}"></div>
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
                        <div class="form-group"><label class="form-label">수량</label><input type="text" inputmode="numeric" class="form-input" id="newProjectQty" placeholder="0" value="${v('quantity') ? Number(v('quantity')).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this);calcProjectRevenue()"></div>
                        <div class="form-group"><label class="form-label">단위</label>
                            <select class="form-select" id="newProjectUnit">
                                ${['개','세트','장','박스','EA'].map(u=>`<option ${v('unit')===u?'selected':''}>${u}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-row" style="grid-template-columns:2fr 1fr">
                        <div class="form-group"><label class="form-label">단가</label><input type="text" inputmode="numeric" class="form-input" id="newProjectUnitPrice" placeholder="0" value="${v('unitPrice') ? Number(v('unitPrice')).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this);calcProjectRevenue()"></div>
                        <div class="form-group"><label class="form-label">VAT</label>
                            <select class="form-select" id="newProjectVat" onchange="calcProjectRevenue()">
                                <option value="exclude" ${v('unitPriceVat')==='VAT 별도'||v('vat')==='exclude'||!v('vat')?'selected':''}>VAT 별도</option>
                                <option value="include" ${v('unitPriceVat')==='VAT 포함'||v('vat')==='include'?'selected':''}>VAT 포함</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">매출액 (자동계산)</label>
                        <div class="form-input" id="newProjectRevenueDisplay" style="background:var(--gray-50);color:var(--blue);font-weight:800;font-size:18px">0 원</div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">색상</label><input type="text" class="form-input" id="newProjectColor" value="${v('color') || '-'}"></div>
                        <div class="form-group"><label class="form-label">인쇄 색상/사이즈</label><input type="text" class="form-input" id="newProjectPrintColorSize" value="${v('printColorSize') || '시안 확인'}"></div>
                    </div>
                `)}

                ${secCard(`
                    <div class="form-section-title">🖨️ 인쇄 / 포장</div>
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">인쇄 방법</label>
                            <select class="form-select" id="newProjectPrintMethod">
                                ${['없음','실크인쇄','레이저각인','UV인쇄','패드인쇄','열전사','기타'].map(u=>`<option ${v('printMethod')===u?'selected':''}>${u}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-row" style="grid-template-columns:2fr 1fr 1fr">
                        <div class="form-group"><label class="form-label">인쇄비</label><input type="text" inputmode="numeric" class="form-input" id="newProjectPrintFee" placeholder="0" value="${v('printFee') ? Number(v('printFee')).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this)"></div>
                        <div class="form-group"><label class="form-label">VAT</label>
                            <select class="form-select" id="newProjectPrintFeeVat"><option>VAT 별도</option><option>VAT 포함</option></select>
                        </div>
                        <div class="form-group"><label class="form-label">적용 방식</label>
                            <select class="form-select" id="newProjectPrintFeeApply"><option>1개당</option><option>일괄</option></select>
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
                        <div class="form-group"><label class="form-label">포장비</label><input type="text" inputmode="numeric" class="form-input" id="newProjectPackFee" placeholder="0" value="${v('packagingFee') ? Number(v('packagingFee')).toLocaleString() : ''}" oninput="fmtProjectNumberInput(this)"></div>
                        <div class="form-group"><label class="form-label">VAT</label>
                            <select class="form-select" id="newProjectPackFeeVat"><option>VAT 별도</option><option>VAT 포함</option></select>
                        </div>
                        <div class="form-group"><label class="form-label">적용 방식</label>
                            <select class="form-select" id="newProjectPackFeeApply"><option>1개당</option><option>일괄</option></select>
                        </div>
                    </div>
                `)}

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
            setTimeout(calcProjectRevenue, 0);
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
    } else if (type === 'client') {
        openClientModal(null);
        return;
    }
    document.getElementById('modalOverlay').classList.add('show');
}

function calcProjectRevenue() {
    const displayEl = document.getElementById('newProjectRevenueDisplay');
    if (!displayEl) return;
    const price = readProjectNumber('newProjectUnitPrice');
    const qty = readProjectNumber('newProjectQty');
    const vatEl = document.getElementById('newProjectVat');
    const vat = vatEl ? vatEl.value : 'exclude';
    let revenue = price * qty;
    if (vat === 'exclude') revenue = Math.round(revenue * 1.1);
    displayEl.textContent = revenue.toLocaleString() + ' 원';
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
    let revenue = unitPrice * qty;
    if (vat === 'exclude') revenue = Math.round(revenue * 1.1);

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
        progress: "0%",
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
                memo: newProject.memo,
                supplier: newProject.supplier,
                supplier_contact: newProject.supplierContact || '',
                print_fee_vat: newProject.printFeeVat || 'VAT 별도',
                print_fee_apply: newProject.printFeeApply || '1개당',
                packaging_fee_vat: newProject.packagingFeeVat || 'VAT 별도',
                packaging_fee_apply: newProject.packagingFeeApply || '1개당'
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
                supplier: r.supplier || '',
                supplierContact: r.supplier_contact || '',
                parentProjectId: r.parent_project_id || null,
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
                printFeeVat: r.print_fee_vat || 'VAT 별도',
                printFeeApply: r.print_fee_apply || '1개당',
                packaging: r.packaging || '',
                packagingFee: r.packaging_fee || 0,
                packagingFeeVat: r.packaging_fee_vat || 'VAT 별도',
                packagingFeeApply: r.packaging_fee_apply || '1개당',
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
        is_deadline_copy: !!t.isDeadlineCopy
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
        isDeadlineCopy: !!r.is_deadline_copy
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
            if (payload.eventType === 'INSERT') {
                const row = taskFromDb(payload.new);
                if (!dailyTasks.find(t => t.id === row.id)) {
                    dailyTasks.push(row);
                }
            } else if (payload.eventType === 'UPDATE') {
                const row = taskFromDb(payload.new);
                const idx = dailyTasks.findIndex(t => t.id === row.id);
                if (idx !== -1) dailyTasks[idx] = row;
                else dailyTasks.push(row);
            } else if (payload.eventType === 'DELETE') {
                const oldId = payload.old && payload.old.id;
                const idx = dailyTasks.findIndex(t => t.id === oldId);
                if (idx !== -1) dailyTasks.splice(idx, 1);
            }
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

    // 연동된 프로젝트 (project.client 가 회사명과 일치)
    const linkedProjects = projects
        .filter(p => p.client && p.client === c.companyName)
        .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

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

    const projectsHtml = linkedProjects.length === 0
        ? `<div style="color:var(--text-tertiary);font-size:13px;padding:8px 0">연동된 프로젝트가 없습니다</div>`
        : `<table class="data-table" style="margin-top:8px">
            <thead><tr><th>품명</th><th style="width:100px">상태</th><th style="width:100px">진행률</th><th style="width:120px">납기</th><th style="width:120px">매출액</th></tr></thead>
            <tbody>${linkedProjects.map(p => `<tr onclick="closeModal();switchTab('${p.category === '해외 주문' ? 'projects-overseas' : 'projects-domestic'}');setTimeout(()=>openEditProject(${p.id}),100)" style="cursor:pointer">
                <td><strong>${esc(p.name)}</strong></td>
                <td>${esc(p.status)}</td>
                <td>${esc(p.progress)}</td>
                <td>${esc(p.deadline) || '-'}</td>
                <td>${(p.revenue || 0).toLocaleString()}원</td>
            </tr>`).join('')}</tbody>
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
    const saved = await dbInsertDelivery({
        recipient,
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
