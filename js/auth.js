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
    document.getElementById('menuMessagesBtn').style.display = regular ? '' : 'none';
    document.getElementById('menuSubmitBtn').style.display = regular ? '' : 'none';
    if (!regular) setUnread(0);
    // 登录状态变化后刷新评论区（显示输入框 / 我的评论可删除等）
    if (currentPage === 'item' && typeof cmState !== 'undefined' && cmState.itemId) loadComments(cmState.itemId);
    if (currentPage === 'addons' && typeof renderAddonsPage === 'function') renderAddonsPage(currentAddonsArg || '');
}

function saveSession(token, username, role) {
    authToken = token;
    currentUsername = username;
    currentRole = role || 'user';
    isAdmin = currentRole === 'admin';
    try {
        localStorage.setItem(TOKEN_KEY, authToken);
        localStorage.setItem('tianji_username', currentUsername);
        localStorage.setItem('tianji_role', currentRole);
    } catch (e) { }
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
    } catch (e) { }
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
        saveSession(authToken, data.username, data.role);
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
        saveSession(data.token, data.username || username, data.role);
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
        saveSession(data.token, data.username || username, data.role);
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
