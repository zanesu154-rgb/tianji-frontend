// 未读消息、消息页

// ==================== 未读消息 ====================
function setUnread(n) {
    unreadCount = Math.max(0, Number(n) || 0);
    const text = unreadCount > 99 ? '99+' : String(unreadCount);
    ['menuUnreadBadge', 'msgNavBadge'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('show', unreadCount > 0);
    });
    document.getElementById('menuDot').classList.toggle('show', unreadCount > 0);
}

async function refreshUnread() {
    if (!isLoggedIn()) return;
    try {
        const data = await api('GET', isAdmin ? '/chats/admin/unread-count' : '/messages/unread-count');
        setUnread(data.unread);
        // 对话开着时有新消息：刷新对话（会顺便标为已读）
        if (data.unread > 0 && chatState.open && currentPage === 'account') {
            if (isAdmin || data.chat > 0) loadChat(true);
        }
        if (data.unread > 0 && isAdmin && !chatState.open && currentPage === 'account'
            && document.getElementById('section-messages').style.display !== 'none') loadAdminInbox();
    } catch (e) { }
}

function startUnreadPolling() {
    stopUnreadPolling();
    if (!isLoggedIn()) return;
    refreshUnread();
    unreadTimer = setInterval(() => {
        if (document.visibilityState === 'visible') refreshUnread();
    }, UNREAD_POLL_MS);
}

function stopUnreadPolling() {
    if (unreadTimer) clearInterval(unreadTimer);
    unreadTimer = null;
}

// ==================== 消息页 ====================
let messages = [];

let chatSummary = null;

async function loadMessages() {
    const listEl = document.getElementById('msgList');
    // 从 GM 用户列表点「私信」进来时直接打开对话
    if (pendingChatUser) {
        const uid = pendingChatUser;
        pendingChatUser = null;
        openChat(isAdmin ? uid : null);
        return;
    }
    closeChatView();
    if (isAdmin) { loadAdminInbox(); return; }
    try {
        const data = await api('GET', '/messages');
        messages = data.list || [];
        chatSummary = data.chat || null;
        setUnread(data.unread + (chatSummary ? chatSummary.unread : 0));
        renderMessages();
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

function renderMessages() {
    const listEl = document.getElementById('msgList');
    const summary = document.getElementById('msgSummary');
    const noticeUnread = messages.filter(m => !m.is_read).length;
    summary.textContent = messages.length ? `共 ${messages.length} 条通知，${noticeUnread} 条未读` : '';
    document.getElementById('msgReadAllBtn').disabled = noticeUnread === 0;
    // 顶部：和栈主的私信对话
    const c = chatSummary;
    const chatCard = c && c.last ? `
        <button class="chat-entry${c.unread ? ' unread' : ''}" data-chat-open>
            <span class="chat-entry-avatar">栈</span>
            <span class="chat-entry-main">
                <span class="chat-entry-title">与栈主的对话${c.unread ? `<span class="chat-unread">${c.unread}</span>` : ''}</span>
                <span class="chat-entry-last">${c.last.sender === 'user' ? '我：' : ''}${escapeHtml(c.last.content)}</span>
            </span>
            <span class="msg-time">${formatTime(c.last.created_at)}</span>
        </button>` : '';
    if (!messages.length) {
        listEl.innerHTML = chatCard + (chatCard ? '' : '<div class="account-empty">还没有消息～<br>反馈被处理、投稿被审核时会在这里通知你</div>');
        return;
    }
    const icons = { feedback: '💬', comment: '💬', submission: '📤', admin: '📢', system: '🔔' };
    // 消息末尾的 #item/<id> 变成「查看」按钮
    const splitLink = c => {
        const m = /\n*#item\/([^\s]+)\s*$/.exec(c || '');
        return m ? [c.slice(0, m.index), m[1]] : [c, ''];
    };
    listEl.innerHTML = chatCard + messages.map(m => {
        const [text, itemId] = splitLink(m.content);
        return `
        <div class="msg-card ${m.is_read ? '' : 'unread'}" data-msg-id="${escapeHtml(m.id)}">
            <div class="msg-head">
                <span>${icons[m.type] || '🔔'}</span>
                <span class="msg-title">${escapeHtml(m.title)}</span>
                <span class="msg-time" title="${escapeHtml(new Date(m.created_at * 1000).toLocaleString())}">${formatTime(m.created_at)}</span>
            </div>
            ${text ? `<div class="msg-content">${escapeHtml(text)}</div>` : ''}
            <div class="msg-actions">
                ${itemId ? `<a class="gm-btn" href="#item/${encodeURIComponent(itemId)}">查看 →</a>` : ''}
                ${m.type === 'admin' ? `<button class="gm-btn" data-msg-reply="${escapeHtml(m.title)}">回复栈主</button>` : ''}
                <button class="gm-btn danger" data-msg-delete="${escapeHtml(m.id)}">删除</button>
            </div>
        </div>`;
    }).join('');
}

async function markMessageRead(id) {
    const m = messages.find(x => x.id === id);
    if (!m || m.is_read) return;
    m.is_read = 1;
    setUnread(unreadCount - 1);
    if (!chatState.open) renderMessages();
    try { await api('PUT', `/messages/${encodeURIComponent(id)}/read`); } catch (e) { }
}

// ==================== 私信 ====================
// 普通用户：只有一条和栈主的对话；栈主：和每个用户各一条
const chatState = { open: false, userId: null, user: null, list: [], blocked: false, canReply: false, quote: '', draft: '' };
let pendingChatUser = null;

// 栈主从 GM 用户列表打开某人的私信
function openChatWith(userId) {
    pendingChatUser = userId;
    if (currentPage === 'account' && document.getElementById('section-messages').style.display !== 'none') loadMessages();
    else showPage('account', 'messages');
}

function closeChatView() {
    chatState.open = false;
    chatState.quote = '';
    document.getElementById('chatView').style.display = 'none';
    document.getElementById('msgList').style.display = '';
    document.getElementById('msgToolbar').style.display = isAdmin ? 'none' : '';
}

async function loadAdminInbox() {
    const listEl = document.getElementById('msgList');
    document.getElementById('msgToolbar').style.display = 'none';
    try {
        const list = await api('GET', '/chats/admin');
        setUnread(list.reduce((n, c) => n + c.unread, 0));
        if (!list.length) {
            listEl.innerHTML = '<div class="account-empty">还没有私信～<br>在 GM 面板的用户列表里点「私信」给用户发消息，对方可以直接回复你</div>';
            return;
        }
        listEl.innerHTML = list.map(c => `
            <button class="chat-entry${c.unread ? ' unread' : ''}" data-chat-user="${escapeHtml(c.user_id)}">
                <span class="chat-entry-avatar">${escapeHtml((c.username || '?').slice(0, 1))}</span>
                <span class="chat-entry-main">
                    <span class="chat-entry-title">${escapeHtml(c.username)}
                        ${c.blocked ? '<span class="chat-blocked-tag">已拉黑</span>' : ''}
                        ${c.unread ? `<span class="chat-unread">${c.unread}</span>` : ''}</span>
                    <span class="chat-entry-last">${c.last_sender === 'admin' ? '我：' : ''}${escapeHtml(c.last_content)}</span>
                </span>
                <span class="msg-time">${formatTime(c.last_at)}</span>
            </button>`).join('');
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

async function openChat(userId, quote) {
    chatState.open = true;
    chatState.userId = userId || null;
    chatState.quote = quote || '';
    chatState.list = [];
    chatState.draft = '';
    document.getElementById('msgList').style.display = 'none';
    document.getElementById('msgToolbar').style.display = 'none';
    const view = document.getElementById('chatView');
    view.style.display = '';
    view.innerHTML = '<div class="account-empty">加载中...</div>';
    await loadChat(false);
    startChatPolling();
    const input = document.getElementById('chatInput');
    if (input && quote) input.focus();
}

// 对话开着时每 15 秒刷新一次
let chatTimer = null;
function startChatPolling() {
    if (chatTimer) clearInterval(chatTimer);
    chatTimer = setInterval(() => {
        if (!chatState.open || currentPage !== 'account') { clearInterval(chatTimer); chatTimer = null; return; }
        if (document.visibilityState === 'visible') loadChat(true);
    }, 15000);
}
const chatSig = () => chatState.list.map(m => m.id + (m.is_read ? 'r' : '')).join(',') + '|' + chatState.blocked + chatState.canReply;

async function loadChat(silent) {
    const before = chatSig();
    try {
        if (isAdmin) {
            const data = await api('GET', `/chats/admin/${encodeURIComponent(chatState.userId)}`);
            chatState.user = data.user;
            chatState.list = data.list;
            chatState.blocked = !!data.user.blocked;
            chatState.canReply = !data.user.deleted;
        } else {
            const data = await api('GET', '/chats/mine');
            chatState.list = data.list;
            chatState.blocked = data.blocked;
            chatState.canReply = data.canReply;
            if (data.list.some(m => m.sender === 'admin' && !m.is_read)) await api('PUT', '/chats/mine/read');
        }
        // 后台刷新时没有变化就不重绘（不打断输入）
        if (!silent || chatSig() !== before || !document.getElementById('chatList')) renderChat();
        refreshUnreadQuiet();
    } catch (e) {
        if (!silent) document.getElementById('chatView').innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

// 只更新红点，不触发对话刷新
async function refreshUnreadQuiet() {
    try {
        const data = await api('GET', isAdmin ? '/chats/admin/unread-count' : '/messages/unread-count');
        setUnread(data.unread);
    } catch (e) { }
}

function chatTime(ts) {
    const d = new Date(ts * 1000);
    const now = new Date();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (d.toDateString() === now.toDateString()) return hm;
    return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function renderChat() {
    const view = document.getElementById('chatView');
    const input = document.getElementById('chatInput');
    if (input) chatState.draft = input.value;
    const mineSender = isAdmin ? 'admin' : 'user';
    const title = isAdmin ? (chatState.user ? chatState.user.username : '') : '与栈主的对话';
    let lastDay = '';
    const bubbles = chatState.list.map(m => {
        const day = new Date(m.created_at * 1000).toDateString();
        const sep = day !== lastDay ? `<div class="chat-day">${escapeHtml(new Date(m.created_at * 1000).toLocaleDateString())}</div>` : '';
        lastDay = day;
        const mine = m.sender === mineSender;
        return `${sep}<div class="chat-row${mine ? ' mine' : ''}">
            <div class="chat-bubble">
                ${m.quote ? `<div class="chat-quote">回复「${escapeHtml(m.quote)}」</div>` : ''}
                <div class="chat-text">${linkifyText(m.content)}</div>
                <div class="chat-meta">${chatTime(m.created_at)}${mine && m.is_read ? ' · 已读' : ''}</div>
            </div>
        </div>`;
    }).join('');

    let composer;
    if (!isAdmin && chatState.blocked) {
        composer = '<div class="chat-locked">你暂时无法给栈主发送消息</div>';
    } else if (!isAdmin && !chatState.canReply) {
        composer = '<div class="chat-locked">栈主给你发消息后，就可以在这里回复了</div>';
    } else if (isAdmin && chatState.user && chatState.user.deleted) {
        composer = '<div class="chat-locked">这个用户已注销</div>';
    } else {
        composer = `<div class="chat-composer">
            ${chatState.quote ? `<div class="chat-quote-bar">回复「${escapeHtml(chatState.quote)}」<button data-chat-unquote title="取消引用">✕</button></div>` : ''}
            <div class="chat-composer-row">
                <textarea id="chatInput" maxlength="${isAdmin ? 2000 : 1000}" rows="2" placeholder="${isAdmin ? '回复 ' + escapeHtml(title) + '…' : '回复栈主…'}${matchMedia('(pointer: fine)').matches ? '（Ctrl+Enter 发送）' : ''}">${escapeHtml(chatState.draft)}</textarea>
                <button class="btn btn-primary" data-chat-send>发送</button>
            </div>
            ${isAdmin && chatState.blocked ? '<div class="chat-hint">对方已被拉黑，不能再给你发消息；你仍然可以给他发</div>' : ''}
        </div>`;
    }
    view.innerHTML = `
        <div class="chat-head">
            <button class="gm-btn" data-chat-back>← 返回</button>
            <span class="chat-title">${escapeHtml(title)}${isAdmin && chatState.blocked ? '<span class="chat-blocked-tag">已拉黑</span>' : ''}</span>
            ${isAdmin && chatState.user && !chatState.user.deleted ? `<span class="chat-head-actions">
                <button class="gm-btn${chatState.blocked ? '' : ' danger'}" data-chat-block>${chatState.blocked ? '取消拉黑' : '拉黑'}</button>
                <button class="gm-btn danger" data-chat-clear>删除对话</button>
            </span>` : (isAdmin ? '<span class="chat-head-actions"><button class="gm-btn danger" data-chat-clear>删除对话</button></span>' : '')}
        </div>
        <div class="chat-list" id="chatList">${bubbles || '<div class="chat-empty">还没有消息</div>'}</div>
        ${composer}`;
    const list = document.getElementById('chatList');
    list.scrollTop = list.scrollHeight;
}

async function sendChat() {
    const input = document.getElementById('chatInput');
    const content = input.value.trim();
    if (!content) { showToast('内容不能为空'); return; }
    const btn = document.querySelector('[data-chat-send]');
    btn.disabled = true;
    try {
        if (isAdmin) await api('POST', `/chats/admin/${encodeURIComponent(chatState.userId)}`, { content });
        else await api('POST', '/chats/mine', { content, quote: chatState.quote });
        chatState.draft = '';
        chatState.quote = '';
        input.value = '';
        await loadChat(true);
    } catch (e) {
        showToast(e.message || '发送失败');
    } finally {
        const b = document.querySelector('[data-chat-send]');
        if (b) b.disabled = false;
    }
}

function setupChatEvents() {
    const view = document.getElementById('chatView');
    view.addEventListener('keydown', (e) => {
        if (e.target.id === 'chatInput' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendChat();
        }
    });
    view.addEventListener('click', async (e) => {
        const t = e.target;
        if (t.closest('[data-chat-send]')) { sendChat(); return; }
        if (t.closest('[data-chat-back]')) { loadMessages(); return; }
        if (t.closest('[data-chat-unquote]')) {
            const input = document.getElementById('chatInput');
            if (input) chatState.draft = input.value;
            chatState.quote = '';
            renderChat();
            return;
        }
        const url = t.closest('[data-ip-url]');
        if (url) {
            showExternalWarning(url.dataset.ipUrl, () => window.open(url.dataset.ipUrl, '_blank', 'noopener,noreferrer'));
            return;
        }
        if (t.closest('[data-chat-block]')) {
            const to = !chatState.blocked;
            const name = chatState.user.username;
            if (to && !confirm(`拉黑「${name}」？\n拉黑后对方不能再给你发私信，你仍然可以给他发；随时可以取消。`)) return;
            try {
                await api('PUT', `/chats/admin/${encodeURIComponent(chatState.userId)}/block`, { blocked: to });
                chatState.blocked = to;
                chatState.user.blocked = to;
                showToast(to ? '已拉黑' : '已取消拉黑');
                renderChat();
            } catch (err) { showToast(err.message); }
            return;
        }
        if (t.closest('[data-chat-clear]')) {
            if (!confirm('删除和这个用户的全部私信记录？对方那边也会一起消失。')) return;
            try {
                await api('DELETE', `/chats/admin/${encodeURIComponent(chatState.userId)}`);
                showToast('已删除');
                loadMessages();
            } catch (err) { showToast(err.message); }
        }
    });
}

function setupMessageEvents() {
    setupChatEvents();
    // ---------- 消息 ----------
    document.getElementById('msgList').addEventListener('click', async (e) => {
        const openBtn = e.target.closest('[data-chat-open]');
        if (openBtn) { openChat(null); return; }
        const userBtn = e.target.closest('[data-chat-user]');
        if (userBtn) { openChat(userBtn.dataset.chatUser); return; }
        const replyBtn = e.target.closest('[data-msg-reply]');
        if (replyBtn) {
            const card = replyBtn.closest('.msg-card');
            if (card && card.classList.contains('unread')) markMessageRead(card.dataset.msgId);
            openChat(null, replyBtn.dataset.msgReply);
            return;
        }
        const delBtn = e.target.closest('[data-msg-delete]');
        if (delBtn) {
            const id = delBtn.dataset.msgDelete;
            try {
                await api('DELETE', `/messages/${encodeURIComponent(id)}`);
                const m = messages.find(x => x.id === id);
                if (m && !m.is_read) setUnread(unreadCount - 1);
                messages = messages.filter(x => x.id !== id);
                renderMessages();
            } catch (err) { showToast(err.message); }
            return;
        }
        const card = e.target.closest('.msg-card.unread');
        if (card) markMessageRead(card.dataset.msgId);
    });

    document.getElementById('msgReadAllBtn').addEventListener('click', async () => {
        try {
            await api('PUT', '/messages/read-all');
            messages.forEach(m => { m.is_read = 1; });
            setUnread(chatSummary ? chatSummary.unread : 0);
            renderMessages();
        } catch (err) { showToast(err.message); }
    });

    document.getElementById('msgClearReadBtn').addEventListener('click', async () => {
        if (!messages.some(m => m.is_read)) { showToast('没有已读消息'); return; }
        if (!confirm('删除所有已读消息？')) return;
        try {
            await api('DELETE', '/messages/read');
            messages = messages.filter(m => !m.is_read);
            renderMessages();
        } catch (err) { showToast(err.message); }
    });
}
