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
            if (isAdmin || (chatState.peerId ? data.dm > 0 : data.chat > 0)) loadChat(true);
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
    if (pendingPeer) {
        const pid = pendingPeer;
        pendingPeer = null;
        openPeerChat(pid);
        return;
    }
    closeChatView();
    if (isAdmin) { loadAdminInbox(); return; }
    try {
        const [data, peers] = await Promise.all([api('GET', '/messages'), api('GET', '/social/dms').catch(() => [])]);
        messages = data.list || [];
        chatSummary = data.chat || null;
        peerConversations = peers;
        setUnread(data.unread + (chatSummary ? chatSummary.unread : 0) + (data.dm || 0));
        renderMessages();
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

let peerConversations = [];
let pendingPeer = null;

// 对话列表里「最后一条」的预览
function lastPreview(content, recalled, mine, otherName = '对方') {
    if (recalled) return mine ? '你撤回了一条消息' : `${otherName}撤回了一条消息`;
    return (mine ? '我：' : '') + escapeHtml(content);
}
const shortName = n => [...String(n)].length > 8 ? [...String(n)].slice(0, 8).join('') + '…' : n;
const chatNameHtml = name => `<span class="chat-name">${escapeHtml(name)}</span>`;

// 用户之间的对话入口
function peerCardsHtml() {
    return peerConversations.map(c => `
        <button class="chat-entry${c.unread ? ' unread' : ''}" data-peer-open="${escapeHtml(c.user_id)}">
            ${avatarHtml(c.avatar, c.username, 'chat-entry-avatar')}
            <span class="chat-entry-main">
                <span class="chat-entry-title">${chatNameHtml(c.username)}${c.unread ? `<span class="chat-unread">${c.unread}</span>` : ''}</span>
                <span class="chat-entry-last">${lastPreview(c.last_content, c.last_recalled, c.last_mine)}</span>
            </span>
            <span class="msg-time">${formatTime(c.last_at)}</span>
        </button>`).join('');
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
                <span class="chat-entry-last">${lastPreview(c.last.content, c.last.recalled, c.last.sender === 'user', '栈主')}</span>
            </span>
            <span class="msg-time">${formatTime(c.last.created_at)}</span>
        </button>` : '';
    const convs = chatCard + peerCardsHtml();
    const convBlock = convs ? `<div class="msg-group-title">私信</div>${convs}` : '';
    if (!messages.length) {
        listEl.innerHTML = convBlock || '<div class="account-empty">还没有消息～<br>反馈被处理、投稿被审核时会在这里通知你</div>';
        return;
    }
    listEl.innerHTML = convBlock + (convBlock ? '<div class="msg-group-title">通知</div>' : '') + messages.map(noticeCardHtml).join('');
}

// 消息末尾的 #item/<id> 变成「查看」按钮
function splitLink(c) {
    const m = /\n*#item\/([^\s]+)\s*$/.exec(c || '');
    return m ? [c.slice(0, m.index), m[1]] : [c, ''];
}

const NOTICE_ICONS = { feedback: '💬', comment: '💬', submission: '📤', admin: '📢', system: '🔔' };
function noticeCardHtml(m) {
    const icons = NOTICE_ICONS;
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
}

async function markMessageRead(id) {
    const m = messages.find(x => x.id === id);
    if (!m || m.is_read) return;
    m.is_read = 1;
    setUnread(unreadCount - 1);
    if (!chatState.open) rerenderMessageList();
    try { await api('PUT', `/messages/${encodeURIComponent(id)}/read`); } catch (e) { }
}

// ==================== 私信 ====================
// 普通用户：只有一条和栈主的对话；栈主：和每个用户各一条
const chatState = { open: false, userId: null, peerId: null, user: null, list: [], blocked: false, canReply: false, iBlocked: false, blockedMe: false, quote: '', draft: '' };

// 从用户空间点「私信」：打开和这个用户的对话
function openPeerChatFromSpace(userId) {
    pendingPeer = userId;
    if (currentPage === 'account' && document.getElementById('section-messages').style.display !== 'none') loadMessages();
    else showPage('account', 'messages');
}

function openPeerChat(userId) {
    return openChat(null, '', userId);
}
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

// 栈主的消息页：私信对话 + 系统通知（比如「3 人测试通过」）
let adminConvs = [];
async function loadAdminInbox() {
    const listEl = document.getElementById('msgList');
    document.getElementById('msgToolbar').style.display = 'none';
    try {
        const [convs, notices] = await Promise.all([api('GET', '/chats/admin'), api('GET', '/messages').catch(() => ({ list: [] }))]);
        adminConvs = convs;
        messages = notices.list || [];
        renderAdminInbox();
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

function renderAdminInbox() {
    const listEl = document.getElementById('msgList');
    const noticeUnread = messages.filter(m => !m.is_read).length;
    setUnread(adminConvs.reduce((n, c) => n + c.unread, 0) + noticeUnread);
    const convHtml = adminConvs.map(c => `
        <button class="chat-entry${c.unread ? ' unread' : ''}" data-chat-user="${escapeHtml(c.user_id)}">
            ${c.avatar ? avatarHtml(c.avatar, c.username, 'chat-entry-avatar') : `<span class="chat-entry-avatar">${escapeHtml((c.username || '?').slice(0, 1))}</span>`}
            <span class="chat-entry-main">
                <span class="chat-entry-title">${chatNameHtml(c.username)}
                    ${c.blocked ? '<span class="chat-blocked-tag">已拉黑</span>' : ''}
                    ${c.unread ? `<span class="chat-unread">${c.unread}</span>` : ''}</span>
                <span class="chat-entry-last">${lastPreview(c.last_content, c.last_recalled, c.last_sender === 'admin')}</span>
            </span>
            <span class="msg-time">${formatTime(c.last_at)}</span>
        </button>`).join('');
    if (!adminConvs.length && !messages.length) {
        listEl.innerHTML = '<div class="account-empty">还没有消息～<br>在 GM 面板的用户列表里点「私信」给用户发消息，对方可以直接回复你</div>';
        return;
    }
    listEl.innerHTML = (convHtml ? `<div class="msg-group-title">私信</div>${convHtml}` : '')
        + (messages.length ? `<div class="msg-group-title">通知</div>${messages.map(noticeCardHtml).join('')}` : '');
}

function rerenderMessageList() {
    if (isAdmin) renderAdminInbox(); else renderMessages();
}

async function openChat(userId, quote, peerId) {
    chatState.open = true;
    chatState.userId = userId || null;
    chatState.peerId = peerId || null;
    chatState.user = null;
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
const chatSig = () => chatState.list.map(m => m.id + (m.is_read ? 'r' : '') + (m.recalled ? 'x' : '')).join(',') + '|' + chatState.blocked + chatState.canReply + chatState.iBlocked + chatState.blockedMe;

async function loadChat(silent) {
    const before = chatSig();
    try {
        if (chatState.peerId) {
            const data = await api('GET', `/social/dms/${encodeURIComponent(chatState.peerId)}`);
            chatState.user = data.user;
            // 统一成 sender 字段：自己发的记为 me
            chatState.list = data.list.map(m => ({ ...m, sender: m.mine ? 'me' : 'them' }));
            chatState.iBlocked = data.iBlocked;
            chatState.blockedMe = data.blockedMe;
        } else if (isAdmin) {
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

// 撤回：普通用户 2 分钟内；栈主发的不限时
const RECALL_SECONDS = 120;
function canRecall(m) {
    if (!chatState.peerId && isAdmin) return true;
    return Date.now() / 1000 - Number(m.created_at) < RECALL_SECONDS;
}
async function recallChat(id) {
    const url = chatState.peerId ? `/social/dms/recall/${encodeURIComponent(id)}`
        : (isAdmin ? `/chats/admin/recall/${encodeURIComponent(id)}` : `/chats/mine/recall/${encodeURIComponent(id)}`);
    try {
        await api('POST', url);
        const m = chatState.list.find(x => x.id === id);
        if (m) { m.recalled = true; m.content = ''; }
        renderChat();
        showToast('已撤回');
    } catch (e) {
        showToast(e.message || '撤回失败');
        loadChat(true);
    }
}

function renderChat() {
    const view = document.getElementById('chatView');
    const input = document.getElementById('chatInput');
    if (input) chatState.draft = input.value;
    const peer = !!chatState.peerId;
    const mineSender = peer ? 'me' : (isAdmin ? 'admin' : 'user');
    const title = peer || isAdmin ? (chatState.user ? chatState.user.username : '') : '与栈主的对话';
    let lastDay = '';
    const bubbles = chatState.list.map(m => {
        const day = new Date(m.created_at * 1000).toDateString();
        const sep = day !== lastDay ? `<div class="chat-day">${escapeHtml(new Date(m.created_at * 1000).toLocaleDateString())}</div>` : '';
        lastDay = day;
        const mine = m.sender === mineSender;
        if (Number(m.recalled) === 1 || m.recalled === true) {
            const who = mine ? '你' : (peer ? '对方' : (isAdmin ? '对方' : '栈主'));
            return `${sep}<div class="chat-recalled">${who}撤回了一条消息</div>`;
        }
        const recall = mine && canRecall(m)
            ? `<button class="chat-recall" data-chat-recall="${escapeHtml(m.id)}" title="撤回这条消息">撤回</button>` : '';
        return `${sep}<div class="chat-row${mine ? ' mine' : ''}" data-msg-id="${escapeHtml(m.id)}">
            <div class="chat-bubble">
                ${m.quote ? `<div class="chat-quote">回复「${escapeHtml(m.quote)}」</div>` : ''}
                <div class="chat-text">${linkifyText(m.content)}</div>
                <div class="chat-meta">${chatTime(m.created_at)}${mine && m.is_read ? ' · 已读' : ''}${recall}</div>
            </div>
        </div>`;
    }).join('');

    let composer;
    if (peer && chatState.iBlocked) {
        composer = '<div class="chat-locked">你已拉黑对方 <button class="gm-btn" data-peer-block>取消拉黑</button></div>';
    } else if (peer && chatState.blockedMe) {
        composer = '<div class="chat-locked">对方暂时不接收你的私信</div>';
    } else if (peer) {
        composer = `<div class="chat-composer"><div class="chat-composer-row">
            <textarea id="chatInput" maxlength="1000" rows="2" placeholder="发给 ${escapeHtml(shortName(title))}…${matchMedia('(pointer: fine)').matches ? '（Ctrl+Enter 发送）' : ''}">${escapeHtml(chatState.draft)}</textarea>
            <button class="btn btn-primary" data-chat-send>发送</button>
        </div></div>`;
    } else if (!isAdmin && chatState.blocked) {
        composer = '<div class="chat-locked">你暂时无法给栈主发送消息</div>';
    } else if (!isAdmin && !chatState.canReply) {
        composer = '<div class="chat-locked">栈主给你发消息后，就可以在这里回复了</div>';
    } else if (isAdmin && chatState.user && chatState.user.deleted) {
        composer = '<div class="chat-locked">这个用户已注销</div>';
    } else {
        composer = `<div class="chat-composer">
            ${chatState.quote ? `<div class="chat-quote-bar">回复「${escapeHtml(chatState.quote)}」<button data-chat-unquote title="取消引用">✕</button></div>` : ''}
            <div class="chat-composer-row">
                <textarea id="chatInput" maxlength="${isAdmin ? 2000 : 1000}" rows="2" placeholder="${isAdmin ? '回复 ' + escapeHtml(shortName(title)) + '…' : '回复栈主…'}${matchMedia('(pointer: fine)').matches ? '（Ctrl+Enter 发送）' : ''}">${escapeHtml(chatState.draft)}</textarea>
                <button class="btn btn-primary" data-chat-send>发送</button>
            </div>
            ${isAdmin && chatState.blocked ? '<div class="chat-hint">对方已被拉黑，不能再给你发消息；你仍然可以给他发</div>' : ''}
        </div>`;
    }
    const spaceId = peer ? chatState.peerId : (isAdmin && chatState.user && !chatState.user.deleted ? chatState.userId : null);
    const titleHtml = spaceId
        ? `<a class="chat-title-link" href="#user/${encodeURIComponent(spaceId)}" title="查看 ${escapeHtml(title)} 的空间">${avatarHtml(chatState.user && chatState.user.avatar, title, 'chat-head-avatar')}${chatNameHtml(title)}</a>`
        : chatNameHtml(title);
    view.innerHTML = `
        <div class="chat-head">
            <button class="gm-btn" data-chat-back>← 返回</button>
            <span class="chat-title">${titleHtml}${(isAdmin && !peer && chatState.blocked) || (peer && chatState.iBlocked) ? '<span class="chat-blocked-tag">已拉黑</span>' : ''}</span>
            ${peer ? `<span class="chat-head-actions"><button class="gm-btn${chatState.iBlocked ? '' : ' danger'}" data-peer-block>${chatState.iBlocked ? '取消拉黑' : '拉黑'}</button></span>` : ''}
            ${!peer && isAdmin && chatState.user && !chatState.user.deleted ? `<span class="chat-head-actions">
                <button class="gm-btn${chatState.blocked ? '' : ' danger'}" data-chat-block>${chatState.blocked ? '取消拉黑' : '拉黑'}</button>
                <button class="gm-btn danger" data-chat-clear>删除对话</button>
            </span>` : (!peer && isAdmin ? '<span class="chat-head-actions"><button class="gm-btn danger" data-chat-clear>删除对话</button></span>' : '')}
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
        if (chatState.peerId) await api('POST', `/social/dms/${encodeURIComponent(chatState.peerId)}`, { content });
        else if (isAdmin) await api('POST', `/chats/admin/${encodeURIComponent(chatState.userId)}`, { content });
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
    // 长按（手机）/ 右键（电脑）自己的消息 → 显示「撤回」
    const showActions = row => {
        if (!row || !row.querySelector('.chat-recall')) return false;
        view.querySelectorAll('.chat-row.show-actions').forEach(r => r !== row && r.classList.remove('show-actions'));
        row.classList.add('show-actions');
        return true;
    };
    let pressTimer = null;
    view.addEventListener('touchstart', (e) => {
        const row = e.target.closest('.chat-row.mine');
        if (!row || e.target.closest('a, button')) return;
        pressTimer = setTimeout(() => {
            pressTimer = null;
            if (showActions(row) && navigator.vibrate) navigator.vibrate(15);
        }, 450);
    }, { passive: true });
    const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
    view.addEventListener('touchend', cancelPress);
    view.addEventListener('touchmove', cancelPress, { passive: true });
    view.addEventListener('contextmenu', (e) => {
        const row = e.target.closest('.chat-row.mine');
        if (row && !e.target.closest('a') && showActions(row)) e.preventDefault();
    });
    view.addEventListener('keydown', (e) => {
        if (e.target.id === 'chatInput' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendChat();
        }
    });
    view.addEventListener('click', async (e) => {
        const t = e.target;
        if (t.closest('[data-chat-send]')) { sendChat(); return; }
        const rc = t.closest('[data-chat-recall]');
        if (rc) { recallChat(rc.dataset.chatRecall); return; }
        // 点别处收起「撤回」按钮
        view.querySelectorAll('.chat-row.show-actions').forEach(r => { if (!r.contains(t)) r.classList.remove('show-actions'); });
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
            showExternalWarning(url.dataset.ipUrl, () => openExternal(url.dataset.ipUrl));
            return;
        }
        if (t.closest('[data-peer-block]')) {
            const to = !chatState.iBlocked;
            if (to && !confirm(`拉黑「${chatState.user.username}」？\n拉黑后对方不能再给你发私信；你也要先取消拉黑才能给他发。`)) return;
            try {
                await api('PUT', `/social/users/${encodeURIComponent(chatState.peerId)}/block`, { blocked: to });
                chatState.iBlocked = to;
                showToast(to ? '已拉黑' : '已取消拉黑');
                renderChat();
            } catch (err) { showToast(err.message); }
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
        const peerBtn = e.target.closest('[data-peer-open]');
        if (peerBtn) { openPeerChat(peerBtn.dataset.peerOpen); return; }
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
                rerenderMessageList();
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
            rerenderMessageList();
        } catch (err) { showToast(err.message); }
    });

    document.getElementById('msgClearReadBtn').addEventListener('click', async () => {
        if (!messages.some(m => m.is_read)) { showToast('没有已读消息'); return; }
        if (!confirm('删除所有已读消息？')) return;
        try {
            await api('DELETE', '/messages/read');
            messages = messages.filter(m => !m.is_read);
            rerenderMessageList();
        } catch (err) { showToast(err.message); }
    });
}
