// 详情页评论区（含公开反馈）
// 显示规则：
// - 楼层按时间倒序；勾了「反馈」的楼层带「反馈」标签，栈主处理后折叠成一行「✓ 已处理」，点开可看全文
// - 楼中楼：栈主的回复默认显示，其他人的讨论默认折叠成「展开 N 条讨论」
const COMMENT_MAX = 500;
const cmState = {
    itemId: null,
    list: [],
    loaded: false,
    openFloors: new Set(),     // 手动展开的「已处理」反馈
    openThreads: new Set(),    // 展开了讨论的楼层
    replyTo: null,             // 正在回复的评论 id
    draft: '',
    replyDraft: '',
    isFeedback: false
};

function commentsSectionHtml() {
    return `<article class="ip-card ip-comments" id="ipComments">
        <section class="ip-section" style="margin-top:0">
            <h2>评论 <span class="cm-total" id="cmTotal"></span></h2>
            <div id="cmBody"><div class="ip-skeleton" style="height:70px;border-radius:14px;"></div></div>
        </section>
    </article>`;
}

async function loadComments(itemId) {
    if (cmState.itemId !== itemId) {
        Object.assign(cmState, {
            itemId, list: [], loaded: false, replyTo: null, draft: '', replyDraft: '', isFeedback: false,
            openFloors: new Set(), openThreads: new Set()
        });
    } else if (cmState.loaded) {
        renderComments();   // 详情页重绘时先用已有数据，避免闪烁
    }
    try {
        const list = await api('GET', `/comments?item=${encodeURIComponent(itemId)}`);
        if (cmState.itemId !== itemId) return;
        cmState.list = list;
        cmState.loaded = true;
        renderComments();
    } catch (e) {
        const body = document.getElementById('cmBody');
        if (body && cmState.itemId === itemId && !cmState.loaded) {
            body.innerHTML = `<div class="ip-empty">评论加载失败：${escapeHtml(e.message || '')}</div>`;
        }
    }
}

function cmText(t) {
    return escapeHtml(t).replace(/https?:\/\/[^\s<>"']+/g, url => `<a data-ip-url="${url}">${url}</a>`);
}

function cmAvatar(c) {
    return `<span class="cm-avatar${c.is_admin ? ' admin' : ''}" aria-hidden="true">${escapeHtml((c.username || '?').slice(0, 1))}</span>`;
}

function cmName(c) {
    return `<span class="cm-user${c.is_admin ? ' admin' : ''}">${escapeHtml(c.username)}</span>`;
}

function cmCanDelete(c) {
    return isAdmin || c.mine;
}

function cmComposerHtml() {
    if (!isLoggedIn()) {
        return `<div class="cm-login">登录后可以发表评论和反馈 <button class="gm-btn" data-cm-login>登录 / 注册</button></div>`;
    }
    return `<div class="cm-composer">
        <textarea id="cmInput" maxlength="${COMMENT_MAX}" placeholder="${isAdmin ? '以栈主身份发言…' : '说点什么…链接失效、汉化有问题可以勾选「反馈」'}">${escapeHtml(cmState.draft)}</textarea>
        <div class="cm-composer-bar">
            ${isAdmin ? '' : `<label class="cm-fb-check"><input type="checkbox" id="cmIsFeedback" ${cmState.isFeedback ? 'checked' : ''}> 这是反馈<span class="cm-fb-hint">（链接失效 / 汉化问题）</span></label>`}
            <span class="cm-count" id="cmCount">${cmState.draft.length}/${COMMENT_MAX}</span>
            <button class="btn btn-primary cm-send" data-cm-send>发送</button>
        </div>
    </div>`;
}

function cmReplyBoxHtml(target) {
    return `<div class="cm-reply-box">
        <textarea id="cmReplyInput" maxlength="${COMMENT_MAX}" placeholder="回复 ${escapeHtml(target.username)}…">${escapeHtml(cmState.replyDraft)}</textarea>
        <div class="cm-composer-bar">
            <span class="cm-count"></span>
            <button class="gm-btn" data-cm-cancel-reply>取消</button>
            <button class="btn btn-primary cm-send" data-cm-send-reply>回复</button>
        </div>
    </div>`;
}

function cmActionsHtml(c, floor) {
    const btns = [];
    if (isLoggedIn()) btns.push(`<button class="cm-act" data-cm-reply="${escapeHtml(c.id)}">回复</button>`);
    if (isAdmin && floor && c.is_feedback) {
        btns.push(c.status === 'resolved'
            ? `<button class="cm-act" data-cm-reopen="${escapeHtml(c.id)}">重新打开</button>`
            : `<button class="cm-act strong" data-cm-resolve="${escapeHtml(c.id)}">✓ 标记已处理</button>`);
    }
    if (cmCanDelete(c)) btns.push(`<button class="cm-act danger" data-cm-delete="${escapeHtml(c.id)}">删除</button>`);
    if (floor && c.is_feedback && c.status === 'resolved') btns.push(`<button class="cm-act" data-cm-fold="${escapeHtml(c.id)}">收起</button>`);
    return btns.length ? `<div class="cm-actions">${btns.join('')}</div>` : '';
}

function cmReplyHtml(r) {
    return `<div class="cm-reply${r.is_admin ? ' admin' : ''}" data-cm-id="${escapeHtml(r.id)}">
        <div class="cm-head">${cmAvatar(r)}${cmName(r)}${r.reply_to ? `<span class="cm-reply-to">回复 ${escapeHtml(r.reply_to)}</span>` : ''}
            <span class="cm-time" title="${escapeHtml(new Date(r.created_at * 1000).toLocaleString())}">${formatTime(r.created_at)}</span></div>
        <div class="cm-content">${cmText(r.content)}</div>
        ${cmActionsHtml(r, false)}
        ${cmState.replyTo === r.id ? cmReplyBoxHtml(r) : ''}
    </div>`;
}

function cmFloorHtml(c, replies) {
    const resolved = c.is_feedback && c.status === 'resolved';
    if (resolved && !cmState.openFloors.has(c.id)) {
        const snippet = c.content.length > 40 ? c.content.slice(0, 40) + '…' : c.content;
        return `<div class="cm-floor folded" data-cm-id="${escapeHtml(c.id)}">
            <button class="cm-folded-bar" data-cm-unfold="${escapeHtml(c.id)}">
                <span class="cm-tag done">✓ 已处理</span>
                <span class="cm-folded-text"><b>${escapeHtml(c.username)}</b>：${escapeHtml(snippet)}</span>
                <span class="cm-folded-more">展开</span>
            </button>
        </div>`;
    }
    const adminReplies = replies.filter(r => r.is_admin);
    const others = replies.length - adminReplies.length;
    // 正在回复折叠讨论里的某一条时，自动展开
    const threadOpen = cmState.openThreads.has(c.id) || replies.some(r => !r.is_admin && r.id === cmState.replyTo);
    const shown = threadOpen ? replies : adminReplies;
    const toggle = others ? `<button class="cm-thread-toggle" data-cm-thread="${escapeHtml(c.id)}">${threadOpen ? '收起讨论' : `展开 ${others} 条讨论`}</button>` : '';
    return `<div class="cm-floor${c.is_feedback ? ' feedback' : ''}${resolved ? ' resolved' : ''}" data-cm-id="${escapeHtml(c.id)}">
        <div class="cm-head">${cmAvatar(c)}${cmName(c)}
            ${c.is_feedback ? (resolved ? '<span class="cm-tag done">✓ 已处理</span>' : '<span class="cm-tag fb">反馈</span>') : ''}
            <span class="cm-time" title="${escapeHtml(new Date(c.created_at * 1000).toLocaleString())}">${formatTime(c.created_at)}</span></div>
        <div class="cm-content">${cmText(c.content)}</div>
        ${cmActionsHtml(c, true)}
        ${cmState.replyTo === c.id ? cmReplyBoxHtml(c) : ''}
        ${shown.length || toggle ? `<div class="cm-replies">${shown.map(cmReplyHtml).join('')}${toggle}</div>` : ''}
    </div>`;
}

function renderComments() {
    const body = document.getElementById('cmBody');
    if (!body) return;
    // 保留正在输入的内容
    const input = document.getElementById('cmInput');
    if (input) cmState.draft = input.value;
    const rInput = document.getElementById('cmReplyInput');
    if (rInput) cmState.replyDraft = rInput.value;
    const fb = document.getElementById('cmIsFeedback');
    if (fb) cmState.isFeedback = fb.checked;

    const floors = cmState.list.filter(c => !c.parent_id).sort((a, b) => b.created_at - a.created_at);
    const byParent = {};
    cmState.list.filter(c => c.parent_id).forEach(r => (byParent[r.parent_id] = byParent[r.parent_id] || []).push(r));
    Object.values(byParent).forEach(arr => arr.sort((a, b) => a.created_at - b.created_at));

    document.getElementById('cmTotal').textContent = cmState.list.length ? `· ${cmState.list.length}` : '';
    body.innerHTML = cmComposerHtml() + (floors.length
        ? `<div class="cm-list">${floors.map(c => cmFloorHtml(c, byParent[c.id] || [])).join('')}</div>`
        : '<div class="ip-empty cm-empty">还没有评论，来抢沙发吧～</div>');
}

// 「反馈问题」按钮：滚动到评论框并勾选反馈
function focusCommentBox(asFeedback) {
    const sec = document.getElementById('ipComments');
    if (!sec) return;
    if (!isLoggedIn()) {
        sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('登录后才能反馈哦');
        openLoginModal();
        return;
    }
    const fb = document.getElementById('cmIsFeedback');
    if (fb && asFeedback) { fb.checked = true; cmState.isFeedback = true; }
    sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = document.getElementById('cmInput');
    if (input) setTimeout(() => input.focus({ preventScroll: true }), 350);
}

async function postComment(body, btn) {
    if (!body.content) { showToast('内容不能为空'); return false; }
    if (btn) btn.disabled = true;
    try {
        await api('POST', '/comments', { itemId: cmState.itemId, ...body });
        return true;
    } catch (e) {
        showToast(e.message || '发送失败');
        return false;
    } finally {
        if (btn) btn.disabled = false;
    }
}

function setupCommentEvents() {
    const root = document.getElementById('itemPageContent');
    root.addEventListener('input', (e) => {
        if (e.target.id === 'cmInput') {
            cmState.draft = e.target.value;
            const cnt = document.getElementById('cmCount');
            if (cnt) cnt.textContent = `${e.target.value.length}/${COMMENT_MAX}`;
        } else if (e.target.id === 'cmReplyInput') {
            cmState.replyDraft = e.target.value;
        } else if (e.target.id === 'cmIsFeedback') {
            cmState.isFeedback = e.target.checked;
        }
    });
    root.addEventListener('change', (e) => {
        if (e.target.id === 'cmIsFeedback') cmState.isFeedback = e.target.checked;
    });

    root.addEventListener('click', async (e) => {
        const t = e.target;
        if (!t.closest || !t.closest('#ipComments')) return;
        const get = sel => t.closest(sel);
        let el;

        if (get('[data-cm-login]')) { openLoginModal(); return; }

        if ((el = get('[data-cm-send]'))) {
            const content = (document.getElementById('cmInput').value || '').trim();
            const isFeedback = !!(document.getElementById('cmIsFeedback') || {}).checked;
            if (await postComment({ content, isFeedback }, el)) {
                cmState.draft = '';
                cmState.isFeedback = false;
                const input = document.getElementById('cmInput');
                if (input) input.value = '';
                const fb = document.getElementById('cmIsFeedback');
                if (fb) fb.checked = false;
                showToast(isFeedback ? '反馈已提交，栈主处理后会通知你' : '已发送');
                loadComments(cmState.itemId);
            }
            return;
        }

        if ((el = get('[data-cm-reply]'))) {
            const id = el.dataset.cmReply;
            cmState.replyTo = cmState.replyTo === id ? null : id;
            cmState.replyDraft = '';
            renderComments();
            const ri = document.getElementById('cmReplyInput');
            if (ri) ri.focus();
            return;
        }
        if (get('[data-cm-cancel-reply]')) {
            cmState.replyTo = null;
            cmState.replyDraft = '';
            renderComments();
            return;
        }
        if ((el = get('[data-cm-send-reply]'))) {
            const content = (document.getElementById('cmReplyInput').value || '').trim();
            const target = cmState.list.find(c => c.id === cmState.replyTo);
            if (!target) return;
            if (await postComment({ content, parentId: target.id }, el)) {
                const floorId = target.parent_id || target.id;
                // 自己参与的讨论保持展开
                if (!isAdmin) cmState.openThreads.add(floorId);
                cmState.replyTo = null;
                cmState.replyDraft = '';
                showToast('已回复');
                loadComments(cmState.itemId);
            }
            return;
        }

        if ((el = get('[data-cm-thread]'))) {
            const id = el.dataset.cmThread;
            if (cmState.openThreads.has(id)) cmState.openThreads.delete(id); else cmState.openThreads.add(id);
            renderComments();
            return;
        }
        if ((el = get('[data-cm-unfold]'))) { cmState.openFloors.add(el.dataset.cmUnfold); renderComments(); return; }
        if ((el = get('[data-cm-fold]'))) { cmState.openFloors.delete(el.dataset.cmFold); renderComments(); return; }

        if ((el = get('[data-cm-resolve]'))) {
            const reply = prompt('处理这条反馈（可填写回复，会显示在评论区并通知对方；留空直接标记已处理）：', '');
            if (reply === null) return;
            try {
                await api('PUT', `/comments/${encodeURIComponent(el.dataset.cmResolve)}/resolve`, { reply: reply.trim() });
                cmState.openFloors.delete(el.dataset.cmResolve);
                showToast('已标记为已处理');
                loadComments(cmState.itemId);
            } catch (err) { showToast(err.message); }
            return;
        }
        if ((el = get('[data-cm-reopen]'))) {
            try {
                await api('PUT', `/comments/${encodeURIComponent(el.dataset.cmReopen)}/resolve`, { reopen: true });
                showToast('已重新打开');
                loadComments(cmState.itemId);
            } catch (err) { showToast(err.message); }
            return;
        }
        if ((el = get('[data-cm-delete]'))) {
            const c = cmState.list.find(x => x.id === el.dataset.cmDelete);
            const hasReplies = c && !c.parent_id && cmState.list.some(x => x.parent_id === c.id);
            if (!confirm(hasReplies ? '确定删除这条评论吗？下面的回复会一起删除。' : '确定删除这条评论吗？')) return;
            try {
                await api('DELETE', `/comments/${encodeURIComponent(el.dataset.cmDelete)}`);
                showToast('已删除');
                loadComments(cmState.itemId);
            } catch (err) { showToast(err.message); }
        }
    });
}
