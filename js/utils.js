// 工具函数、外部链接风险提醒

// ==================== 工具函数 ====================
// 同时转义引号，保证插入到属性值（value="..."、data-*="..."）里也安全
// ==================== 头像 ====================
// key 为空时显示首字头像，颜色按名字固定
const AVATAR_COLORS = ['#1e4d6b', '#2f7d68', '#9a6a1c', '#7a4fa3', '#b23a2a', '#3c5aa6', '#0f766e', '#a21caf'];
function avatarUrl(key) {
    return key ? `${API_BASE}/avatars/${encodeURIComponent(key)}` : '';
}
function avatarHtml(key, name, cls = '') {
    const n = String(name || '?');
    if (key) return `<img class="avatar ${cls}" src="${avatarUrl(key)}" alt="" loading="lazy" draggable="false">`;
    let h = 0;
    for (const ch of n) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return `<span class="avatar avatar-letter ${cls}" style="background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}" aria-hidden="true">${escapeHtml(Array.from(n)[0] || '?')}</span>`;
}

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

// ---------- 昵称长度：汉字算 2，字母数字算 1，最多 16 ----------
const USERNAME_MAX_WIDTH = 16;
function nameWidth(name) {
    let w = 0;
    for (const ch of String(name)) w += ch.charCodeAt(0) > 0xff ? 2 : 1;
    return w;
}
function usernameError(name) {
    if (name.length < 2) return '用户名至少 2 个字符';
    if (nameWidth(name) > USERNAME_MAX_WIDTH) return '用户名太长：最多 8 个汉字或 16 个字母';
    if (!/^[\w一-龥]+$/.test(name)) return '用户名只能包含字母、数字、下划线、中文';
    return '';
}
// 输入框下方实时显示「x / 16」
function bindNameCounter(input, anchor = input) {
    const hint = document.createElement('div');
    hint.className = 'name-counter';
    anchor.insertAdjacentElement('afterend', hint);
    const update = () => {
        const w = nameWidth(input.value.trim());
        hint.textContent = w ? `${w} / ${USERNAME_MAX_WIDTH}（汉字算 2 个字符）` : '';
        hint.classList.toggle('over', w > USERNAME_MAX_WIDTH);
    };
    input.addEventListener('input', update);
    input.addEventListener('focus', update);
    update();
    return update;
}
