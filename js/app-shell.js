// 安卓 App（Capacitor 外壳）里的适配。网页版里这些都不生效。
// - 外部链接 / 下载交给手机浏览器
// - 系统分享面板
// - 安卓返回键：先关弹窗 / 菜单，再返回上一页，首页连按两次退出
// - 启动时检查有没有新版本 App
const APP_RELEASES_URL = 'https://github.com/zanesu154-rgb/tianji-frontend/releases/latest';
const APP_RELEASES_API = 'https://api.github.com/repos/zanesu154-rgb/tianji-frontend/releases/latest';

const IS_APP = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
const appPlugin = name => (IS_APP && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;

// 打开外部链接：App 里交给系统浏览器（在 App 里直接下载大多会失败）
function openExternal(url) {
    const launcher = appPlugin('AppLauncher');
    if (launcher) {
        launcher.openUrl({ url }).catch(() => window.open(url, '_blank'));
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

function canSystemShare() {
    return !!(appPlugin('Share') || navigator.share);
}

async function systemShare(url, title) {
    const share = appPlugin('Share');
    if (share) return share.share({ title: title || '天际译栈', url, dialogTitle: '分享到' });
    return navigator.share({ url });
}

// 版本号比较：'1.2.10' > '1.2.9'
function versionNewer(a, b) {
    const pa = String(a).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    }
    return false;
}

async function checkAppUpdate() {
    const app = appPlugin('App');
    if (!app) return;
    try {
        const today = new Date().toDateString();
        if (localStorage.getItem('tianji_app_update_checked') === today) return;
        localStorage.setItem('tianji_app_update_checked', today);
        const [info, res] = await Promise.all([app.getInfo(), fetch(APP_RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })]);
        if (!res.ok) return;
        const rel = await res.json();
        const latest = String(rel.tag_name || '').replace(/^v/, '');
        if (!latest || !versionNewer(latest, info.version)) return;
        if (localStorage.getItem('tianji_app_update_skip') === latest) return;
        const apk = (rel.assets || []).find(a => /\.apk$/i.test(a.name));
        if (confirm(`天际译栈 App 有新版本 v${latest}（当前 v${info.version}），现在去下载吗？\n\n点「取消」这个版本就不再提醒。`)) {
            openExternal(apk ? apk.browser_download_url : (rel.html_url || APP_RELEASES_URL));
        } else {
            localStorage.setItem('tianji_app_update_skip', latest);
        }
    } catch (e) { }
}

function setupAppShell() {
    document.documentElement.classList.toggle('in-app', IS_APP);
    if (!IS_APP) return;

    // target="_blank" 的链接（B站主页、汉化工具等）在外部风险提醒之后交给系统浏览器
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[target="_blank"]');
        if (!link || e.defaultPrevented) return;
        e.preventDefault();
        openExternal(link.href);
    });

    // 安卓返回键
    const app = appPlugin('App');
    if (app) {
        let lastBack = 0;
        app.addListener('backButton', () => {
            const modals = [...document.querySelectorAll('.modal-overlay.show')];
            if (modals.length) { modals[modals.length - 1].classList.remove('show'); return; }
            const lb = document.getElementById('lightbox');
            if (lb && lb.classList.contains('show')) { closeLightbox(); return; }
            const menu = document.getElementById('menuDropdown');
            if (menu && menu.classList.contains('show')) { menu.classList.remove('show'); return; }
            if (currentPage !== 'home' || location.hash) {
                if (history.length > 1) history.back();
                else { history.replaceState(null, '', location.pathname + location.search); showPage('home'); }
                return;
            }
            if (Date.now() - lastBack < 2000) { app.exitApp(); return; }
            lastBack = Date.now();
            showToast('再按一次退出天际译栈');
        });
        app.getInfo().then(info => {
            const el = document.getElementById('appVersionLabel');
            if (el) el.textContent = `App v${info.version}`;
        }).catch(() => { });
    }
    setTimeout(checkAppUpdate, 3000);
}
