// 工具函数、外部链接风险提醒

// ==================== 工具函数 ====================
// 同时转义引号，保证插入到属性值（value="..."、data-*="..."）里也安全
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatTime(sec) {
    if (!sec) return '';
    const d = new Date(Number(sec) * 1000);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 7 * 86400) return Math.floor(diff / 86400) + ' 天前';
    return d.toLocaleDateString();
}

const CATEGORY_LABELS = { addon: '附加包', texture: '材质包', shader: '光影', map: '地图' };

function showToast(text) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
}

// ==================== 外部链接风险提醒 ====================
function showExternalWarning(url, onConfirm, onCopy) {
    const modal = document.getElementById('externalWarningModal');
    const urlInput = document.getElementById('externalWarningUrl');
    const confirmBtn = document.getElementById('externalWarningConfirm');
    const cancelBtn = document.getElementById('externalWarningCancel');
    const copyBtn = document.getElementById('externalWarningCopy');

    urlInput.value = url;
    modal.classList.add('show');

    // 用 cloneNode 替换，清掉旧的事件监听，避免多次绑定
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    newConfirm.addEventListener('click', () => {
        modal.classList.remove('show');
        if (onConfirm) onConfirm();
    });

    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    newCancel.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    const newCopy = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(newCopy, copyBtn);
    newCopy.addEventListener('click', () => {
        copyText(url);
        if (onCopy) onCopy();
    });

    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove('show');
    };
}

function hasChinese(text) {
    return /[\u4e00-\u9fa5]/.test(text);
}

function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (authToken) h['Authorization'] = 'Bearer ' + authToken;
    return h;
}

// 统一请求：自动带 token、解析 JSON；带 token 却返回 401 时说明登录已失效，自动退出
async function api(method, path, body) {
    let res;
    try {
        res = await fetch(API_BASE + path, {
            method,
            headers: authHeaders(),
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    } catch (e) {
        const err = new Error('网络错误，请检查网络后重试');
        err.network = true;
        throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { }
    if (!res.ok) {
        if (res.status === 401 && authToken) handleSessionExpired();
        const err = new Error((data && data.error) || `请求失败（${res.status}）`);
        err.status = res.status;
        throw err;
    }
    return data;
}

let sessionExpiredShown = false;
function handleSessionExpired() {
    if (sessionExpiredShown) return;
    sessionExpiredShown = true;
    logout(true);
    showToast('登录已过期，请重新登录');
    setTimeout(() => { sessionExpiredShown = false; }, 3000);
}
