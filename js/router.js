// 页面切换

// ==================== 页面切换（带动画） ====================
let currentPage = 'home';
let isSwitching = false;
const ACCOUNT_SECTIONS = ['profile', 'security', 'messages', 'my-submissions', 'danger', 'gm'];

// 根据身份填充账户中心、显示/隐藏对应入口
function fillAccountPage() {
    const isAdminUser = currentRole === 'admin';
    const input = document.getElementById('accountUsername');
    input.value = currentUsername || '';
    input.disabled = isAdminUser;
    document.getElementById('accountRole').textContent = isAdminUser ? '管理员' : '普通用户';
    // 隐藏的用户名字段：让密码管理器知道改密/注销表单属于哪个账号
    document.querySelectorAll('.account-username-hint').forEach(el => { el.value = currentUsername || ''; });
    document.getElementById('saveUsernameBtn').style.display = isAdminUser ? 'none' : '';
    document.getElementById('savePasswordBtn').style.display = isAdminUser ? 'none' : '';

    // 危险操作、消息、投稿只对普通用户显示；GM 面板只对管理员显示
    document.querySelectorAll('.account-nav-item[data-section="danger"], .account-nav-item[data-user-only]').forEach(el => {
        el.style.display = isAdminUser ? 'none' : '';
    });
    document.getElementById('gmNavBtn').style.display = isAdminUser ? '' : 'none';
}

function sectionAllowed(section) {
    if (!ACCOUNT_SECTIONS.includes(section)) return false;
    const isAdminUser = currentRole === 'admin';
    if (section === 'gm') return isAdminUser;
    if (['my-submissions', 'danger'].includes(section)) return !isAdminUser;
    return true;
}

function showAccountSection(section) {
    if (!sectionAllowed(section)) section = 'profile';
    document.querySelectorAll('.account-nav-item').forEach(b => {
        b.classList.toggle('active', b.dataset.section === section);
    });
    document.querySelectorAll('.account-section').forEach(sec => {
        sec.style.display = sec.id === 'section-' + section ? 'block' : 'none';
    });

    if (section === 'messages') loadMessages();
    else if (section === 'my-submissions') loadMySubmissions();
    else if (section === 'gm') loadGmData();

    const hash = section === 'profile' ? '#account' : `#account/${section}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
}

function setTopNavForPage(page) {
    const onHome = page === 'home';
    document.getElementById('searchToggleBtn').style.display = onHome ? '' : 'none';
    document.querySelector('.menu-wrap').style.display = onHome ? '' : 'none';
    document.getElementById('homeBtn').style.display = onHome ? 'none' : '';
}

const PAGE_IDS = { home: 'pageHome', account: 'pageAccount', item: 'pageItem', addons: 'pageAddons' };
let currentAddonsArg = null;
// 离开主页时记住滚动位置（含两个列表模块内部的滚动），回来时恢复
let homeScrollState = null;

function saveHomeScroll() {
    homeScrollState = {
        y: window.scrollY,
        pending: document.getElementById('pendingList').scrollTop,
        done: document.getElementById('doneList').scrollTop
    };
}

function restoreHomeScroll() {
    if (!homeScrollState) { window.scrollTo(0, 0); return; }
    const st = homeScrollState;
    document.getElementById('pendingList').scrollTop = st.pending;
    document.getElementById('doneList').scrollTop = st.done;
    window.scrollTo({ top: st.y, behavior: 'instant' });
}

function showPage(page, arg) {
    if (page === 'account' && !isLoggedIn()) { openLoginModal(); return; }

    // 同一页面内切换：账户分区 / 另一个资源
    if (page === currentPage) {
        if (page === 'account' && arg) showAccountSection(arg);
        if (page === 'item' && arg && arg !== currentItemId) {
            renderItemPage(arg);
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
        if (page === 'addons' && (arg || '') !== currentAddonsArg) {
            const sameAddon = (arg || '').split('/')[0] === (currentAddonsArg || '').split('/')[0];
            currentAddonsArg = arg || '';
            renderAddonsPage(currentAddonsArg);
            if (!sameAddon) window.scrollTo({ top: 0, behavior: 'instant' });
        }
        return;
    }
    if (isSwitching) return;

    document.getElementById('menuDropdown').classList.remove('show');
    document.getElementById('searchPanel').classList.remove('show');
    document.getElementById('searchInput').setAttribute('readonly', '');

    const leavingEl = document.getElementById(PAGE_IDS[currentPage]);
    const enteringEl = document.getElementById(PAGE_IDS[page]);
    if (currentPage === 'home') saveHomeScroll();
    if (currentPage === 'item') { closeLightbox(); document.title = DEFAULT_TITLE; currentItemId = null; }
    if (currentPage === 'addons') { document.title = DEFAULT_TITLE; currentAddonsArg = null; }

    // 详情页内容先渲染，切换动画结束时已经准备好
    if (page === 'item') renderItemPage(arg);
    if (page === 'addons') { currentAddonsArg = arg || ''; renderAddonsPage(currentAddonsArg); }

    isSwitching = true;
    currentPage = page;
    leavingEl.classList.add('page-leaving');

    setTimeout(() => {
        leavingEl.style.display = 'none';
        leavingEl.classList.remove('page-leaving');
        enteringEl.style.display = 'flex';
        enteringEl.classList.add('page-entering');
        setTopNavForPage(page);

        if (page === 'account') {
            fillAccountPage();
            showAccountSection(arg || 'profile');
        } else if (page === 'home' && location.hash && !location.hash.startsWith('#item/')) {
            history.replaceState(null, '', location.pathname + location.search);
        }

        if (page === 'home') restoreHomeScroll();
        else window.scrollTo({ top: 0, behavior: 'instant' });

        setTimeout(() => {
            enteringEl.classList.remove('page-entering');
            isSwitching = false;
            // 动画期间如果地址又变了（快速点后退），以地址为准
            const r = parseRoute();
            if (r.page !== currentPage || (r.page === 'item' && r.id !== currentItemId)
                || (r.page === 'addons' && (r.arg || '') !== currentAddonsArg)) routeFromLocation();
        }, 340);
    }, 280);
}

function setupNavEvents() {
    // ========== 账户中心导航 ==========
    document.querySelectorAll('.account-nav-item').forEach(btn => {
        btn.addEventListener('click', () => showAccountSection(btn.dataset.section));
    });

    // 返回主页
    document.getElementById('homeBtn').addEventListener('click', () => {
        if (currentPage === 'item') goBackToList();
        else showPage('home');
    });
}
