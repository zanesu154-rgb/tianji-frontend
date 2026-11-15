// 登录状态、登录/注册

// ==================== 登录 ====================
function isLoggedIn() {
    return !!(authToken && currentUsername);
}

// 普通注册用户（管理员没有消息/投稿）
function isRegularUser() {
    return isLoggedIn() && currentRole !== 'admin';
}

function updateLoginUI() {
    const toolbar = document.getElementById('adminToolbar');
    const annEditBtn = document.getElementById('announcementEditBtn');
    const loginText = document.getElementById('menuLoginText');

    if (isLoggedIn()) {
        loginText.textContent = currentUsername + (currentRole === 'admin' ? ' (管理员)' : '');
        toolbar.style.display = isAdmin ? '' : 'none';
        if (annEditBtn) annEditBtn.style.display = isAdmin ? '' : 'none';
    } else {
        loginText.textContent = '登录 / 注册';
        toolbar.style.display = 'none';
        if (annEditBtn) annEditBtn.style.display = 'none';
    }

    const regular = isRegularUser();
    // 消息：普通用户看通知和私信，栈主看所有私信对话
    document.getElementById('menuMessagesBtn').style.display = isLoggedIn() ? '' : 'none';
    document.getElementById('menuSubmitBtn').style.display = regular ? '' : 'none';
    if (!isLoggedIn()) setUnread(0);
    // 登录状态变化后刷新评论区（显示输入框 / 我的评论可删除等）
    if (currentPage === 'item' && typeof cmState !== 'undefined' && cmState.itemId) loadComments(cmState.itemId);
    if (currentPage === 'addons' && typeof renderAddonsPage === 'function') renderAddonsPage(currentAddonsArg || '');
    if (currentPage === 'user' && currentUserPageId && typeof renderUserPage === 'function') renderUserPage(currentUserPageId);
    renderUserMenu();
}

function saveSession(token, username, role, avatar, id) {
    if (id !== undefined) {
        currentUserId = id || '';
        try { localStorage.setItem('tianji_uid', currentUserId); } catch (e) { }
    }
    authToken = token;
    currentUsername = username;
    currentRole = role || 'user';
    isAdmin = currentRole === 'admin';
    try {
        localStorage.setItem(TOKEN_KEY, authToken);
        localStorage.setItem('tianji_username', currentUsername);
        localStorage.setItem('tianji_role', currentRole);
    } catch (e) { }
    if (avatar !== undefined) setCurrentAvatar(avatar);
}

function setCurrentAvatar(key) {
    currentAvatar = key || '';
    try { localStorage.setItem('tianji_avatar', currentAvatar); } catch (e) { }
    renderUserMenu();
}

// 右上角：未登录是 ☰，登录后变成头像；下拉菜单顶部显示头像和用户名
function renderUserMenu() {
    const btn = document.getElementById('menuToggleBtn');
    const icon = document.getElementById('menuToggleIcon');
    const logged = isLoggedIn();
    btn.classList.toggle('has-avatar', logged);
    btn.title = logged ? currentUsername : '菜单';
    icon.innerHTML = logged ? avatarHtml(currentAvatar, currentUsername, 'menu-avatar') : '☰';
    const head = document.getElementById('menuProfileBtn');
    head.style.display = logged ? '' : 'none';
    if (logged) {
        head.innerHTML = `${avatarHtml(currentAvatar, currentUsername, 'menu-profile-avatar')}
            <span class="menu-profile-main">
                <span class="menu-profile-name">${escapeHtml(currentUsername)}</span>
                <span class="menu-profile-role">${currentRole === 'admin' ? '栈主' : '普通用户'}</span>
            </span>
            <span class="menu-profile-go">个人主页 ›</span>`;
    }
    document.querySelectorAll('[data-menu-logged]').forEach(el => { el.style.display = logged ? '' : 'none'; });
    document.querySelectorAll('[data-menu-user]').forEach(el => { el.style.display = logged && currentRole !== 'admin' ? '' : 'none'; });
    document.querySelectorAll('[data-menu-admin]').forEach(el => { el.style.display = logged && currentRole === 'admin' ? '' : 'none'; });
    document.getElementById('menuLoginBtn').style.display = logged ? 'none' : '';
    document.getElementById('menuMessagesBtn').style.display = logged ? '' : 'none';
    // 在账户中心时，左侧（手机上方）已有这些分区，菜单里就不再重复
    if (currentPage === 'account') {
        document.querySelectorAll('[data-menu-acc-dup]').forEach(el => { el.style.display = 'none'; });
    }
    document.getElementById('menuProfileBtn').classList.toggle('on-account', currentPage === 'account');
    setTopNavForPage(currentPage);
}

function clearSession() {
    authToken = '';
    isAdmin = false;
    currentUsername = '';
    currentRole = '';
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('tianji_username');
        localStorage.removeItem('tianji_role');
        localStorage.removeItem('tianji_avatar');
        localStorage.removeItem('tianji_uid');
    } catch (e) { }
    currentAvatar = '';
    currentUserId = '';
}

async function tryLogin() {
    if (!authToken) {
        clearSession();
        return;
    }
    // 先按本地记录的角色显示，避免网络慢时管理员界面闪烁
    isAdmin = currentRole === 'admin';
    try {
        const data = await api('GET', '/users/me');
        saveSession(authToken, data.username, data.role, data.avatar || '', data.id || '');
    } catch (e) {
        if (e.status === 401) clearSession();
        // 网络错误：保留本地登录状态，稍后再试
    }
}

// ==================== 登录 / 注册 ====================
function openLoginModal() {
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('registerUsername').value = '';
    document.getElementById('registerPassword').value = '';
    document.getElementById('registerConfirm').value = '';
    switchAuthTab('login');
    document.getElementById('loginModal').classList.add('show');
    setTimeout(() => document.getElementById('loginUsername').focus(), 100);
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('show');
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.getElementById('panel-login').style.display = tab === 'login' ? '' : 'none';
    document.getElementById('panel-register').style.display = tab === 'register' ? '' : 'none';
}

async function afterAuthSuccess(toastText) {
    closeLoginModal();
    updateLoginUI();
    updateSortBar();
    startUnreadPolling();
    loadMyRatings();   // 登录后按账号显示自己的评分
    showToast(toastText);
    await loadItems(false);
    render();
}

let authBusy = false;

async function submitLogin() {
    if (authBusy) return;
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!username || !password) {
        showToast('请填写用户名和密码');
        return;
    }
    authBusy = true;
    try {
        const data = await api('POST', '/users/login', { username, password });
        saveSession(data.token, data.username || username, data.role, data.avatar || '', data.id || '');
        await afterAuthSuccess(currentRole === 'admin' ? '管理员登录成功' : '登录成功');
    } catch (e) {
        showToast(e.message || '登录失败');
    } finally {
        authBusy = false;
    }
}

async function submitRegister() {
    if (authBusy) return;
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirm').value;

    if (!username || !password || !confirm) { showToast('请填写完整'); return; }
    if (username.length < 2 || username.length > 20) { showToast('用户名长度 2-20 个字符'); return; }
    if (!/^[\w一-龥]+$/.test(username)) { showToast('用户名只能包含字母、数字、下划线、中文'); return; }
    if (password !== confirm) { showToast('两次输入的密码不一致'); return; }
    if (password.length < 6) { showToast('密码至少 6 位'); return; }

    authBusy = true;
    try {
        const data = await api('POST', '/users/register', { username, password });
        saveSession(data.token, data.username || username, data.role, '', data.id || '');
        await afterAuthSuccess('注册成功，已自动登录');
    } catch (e) {
        showToast(e.message || '注册失败');
    } finally {
        authBusy = false;
    }
}

function logout(silent) {
    clearSession();
    stopUnreadPolling();
    messages = [];
    updateLoginUI();
    updateSortBar();
    loadMyRatings();
    loadItems(true).then(render);
    showPage('home');
    if (!silent) showToast('已退出');
}

function setupAuthEvents() {
    // ========== 登录/注册弹窗 ==========
    document.getElementById('loginSubmitBtn').addEventListener('click', submitLogin);
    document.getElementById('loginCancelBtn').addEventListener('click', closeLoginModal);
    document.getElementById('loginUsername').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('loginPassword').focus();
    });
    document.getElementById('loginPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitLogin();
    });

    document.getElementById('registerSubmitBtn').addEventListener('click', submitRegister);
    document.getElementById('registerCancelBtn').addEventListener('click', closeLoginModal);
    document.getElementById('registerConfirm').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitRegister();
    });

    // 切换 tab
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
    });
}
