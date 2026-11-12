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
    if (!isRegularUser()) return;
    try {
        const data = await api('GET', '/messages/unread-count');
        setUnread(data.unread);
    } catch (e) { }
}

function startUnreadPolling() {
    stopUnreadPolling();
    if (!isRegularUser()) return;
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

async function loadMessages() {
    const listEl = document.getElementById('msgList');
    try {
        const data = await api('GET', '/messages');
        messages = data.list || [];
        setUnread(data.unread);
        renderMessages();
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

function renderMessages() {
    const listEl = document.getElementById('msgList');
    const summary = document.getElementById('msgSummary');
    summary.textContent = messages.length ? `共 ${messages.length} 条，${unreadCount} 条未读` : '';
    document.getElementById('msgReadAllBtn').disabled = unreadCount === 0;
    if (!messages.length) {
        listEl.innerHTML = '<div class="account-empty">还没有消息～<br>反馈被处理、投稿被审核时会在这里通知你</div>';
        return;
    }
    const icons = { feedback: '💬', comment: '💬', submission: '📤', admin: '📢', system: '🔔' };
    // 消息末尾的 #item/<id> 变成「查看」按钮
    const splitLink = c => {
        const m = /\n*#item\/([^\s]+)\s*$/.exec(c || '');
        return m ? [c.slice(0, m.index), m[1]] : [c, ''];
    };
    listEl.innerHTML = messages.map(m => {
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
    renderMessages();
    try { await api('PUT', `/messages/${encodeURIComponent(id)}/read`); } catch (e) { }
}

function setupMessageEvents() {
    // ---------- 消息 ----------
    document.getElementById('msgList').addEventListener('click', async (e) => {
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
            setUnread(0);
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
