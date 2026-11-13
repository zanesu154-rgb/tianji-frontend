// 事件绑定入口与初始化

// 事件绑定入口：按原来的顺序依次注册各模块的事件
function setupEvents() {
    setupGmEvents();
    setupMessageEvents();
    setupSubmissionEvents();
    setupListEvents();
    setupNavEvents();
    setupItemPageEvents();
    setupAccountEvents();
    setupAuthEvents();
    setupChromeEvents();
    setupSortEvents();
    setupMiscEvents();
    setupSortBarEvents();
    setupShareEvents();
    setupCommentEvents();
    setupMyAddonsEvents();
}

// ==================== 初始化 ====================
async function init() {
    // 前进/后退时由我们自己恢复列表滚动位置，避免浏览器自动恢复时页面还没显示导致回到顶部
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');

    // 先绑定事件，保证后端冷启动较慢时按钮也能立即响应
    setupEvents();
    updateLoginUI();

    // 搜索框保持只读，打开搜索面板时才解除（防止浏览器自动填充）
    document.getElementById('searchInput').value = '';

    // 初始页面（无动画）
    const route = parseRoute();
    const wantAccount = route.page === 'account' && isLoggedIn();
    const initialSection = route.section || 'profile';
    const initialPage = wantAccount ? 'account' : (['item', 'addons'].includes(route.page) ? route.page : 'home');
    document.getElementById('searchPanel').classList.remove('show');
    document.getElementById('menuDropdown').classList.remove('show');
    Object.entries(PAGE_IDS).forEach(([pg, elId]) => {
        document.getElementById(elId).style.display = pg === initialPage ? 'flex' : 'none';
    });
    setTopNavForPage(initialPage);
    currentPage = initialPage;
    if (initialPage === 'home' && location.hash) {
        history.replaceState(null, '', location.pathname + location.search);
    }
    if (initialPage === 'item') renderItemPage(route.id);
    if (initialPage === 'addons') { currentAddonsArg = route.arg || ''; renderAddonsPage(currentAddonsArg); }

    // 公告和登录状态并行请求
    fetchAnnouncement();
    await tryLogin();
    updateLoginUI();
    updateSortBar();
    startUnreadPolling();
    loadMyRatings();

    if (currentPage === 'account') {
        if (isLoggedIn()) {
            fillAccountPage();
            showAccountSection(initialSection);
        } else {
            // token 已失效
            document.getElementById('pageAccount').style.display = 'none';
            document.getElementById('pageHome').style.display = 'flex';
            setTopNavForPage('home');
            currentPage = 'home';
            history.replaceState(null, '', location.pathname + location.search);
        }
    }

    await loadItems(true);
    render();
    if (window.tianjiSplashDone) window.tianjiSplashDone();
}

init();
