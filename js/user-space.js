// 用户空间 #user/<id>
// 公开展示：头像、用户名、加入时间、投稿贡献、评论数
// 登录后可以：私信对方、拉黑 / 取消拉黑（栈主不在用户表里，不会出现在这里，也不能被拉黑）
let userSpace = null;

function usDate(ts) {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

async function renderUserPage(id) {
    const root = document.getElementById('userContent');
    if (!userSpace || userSpace.id !== id) {
        root.innerHTML = `<div class="ip-card"><div class="us-hero-skel">
            <div class="ip-skeleton" style="width:88px;height:88px;border-radius:50%;"></div>
            <div style="flex:1"><div class="ip-skeleton" style="height:24px;width:40%;border-radius:8px;"></div>
            <div class="ip-skeleton" style="height:14px;width:60%;margin-top:12px;border-radius:6px;"></div></div></div></div>`;
    }
    try {
        const u = await api('GET', `/social/users/${encodeURIComponent(id)}`);
        if (currentUserPageId !== id) return;
        userSpace = u;
        document.title = `${u.username} 的空间 - ${DEFAULT_TITLE}`;
        root.innerHTML = userSpaceHtml(u);
    } catch (e) {
        root.innerHTML = `<div class="ip-card"><div class="ip-empty">${escapeHtml(e.message || '加载失败')}</div></div>`;
    }
}

function userSpaceHtml(u) {
    const logged = isLoggedIn();
    let actions = '';
    if (u.isMe) {
        actions = '<button class="btn" data-us-edit>✏️ 编辑资料</button>';
    } else if (isAdmin) {
        // 栈主：用栈主私信（对方可以回复）
        actions = '<button class="btn btn-primary" data-us-admin-chat>💬 私信</button>';
    } else if (logged) {
        actions = `<button class="btn btn-primary" data-us-dm ${u.iBlocked || u.blockedMe ? 'disabled' : ''}>💬 私信</button>
            <button class="btn${u.iBlocked ? '' : ' us-block-btn'}" data-us-block>${u.iBlocked ? '取消拉黑' : '🚫 拉黑'}</button>`;
    } else {
        actions = '<button class="btn btn-primary" data-us-login>登录后私信</button>';
    }
    const note = !u.isMe && !isAdmin && logged
        ? (u.iBlocked ? '<div class="us-note">你已拉黑对方，对方不能给你发私信</div>'
            : (u.blockedMe ? '<div class="us-note">对方暂时不接收你的私信</div>' : ''))
        : '';

    const cards = u.contributions.map(c => {
        const name = c.translated || c.original;
        const sub = c.translated ? c.original : '';
        const isDone = c.status === 'done';
        const cover = c.cover
            ? `<img src="${escapeHtml(c.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${CATEGORY_EMOJI[c.category] || '🧩'}'))">`
            : (CATEGORY_EMOJI[c.category] || '🧩');
        const tag = c.kind === 'request'
            ? `<span class="us-tag req">${isDone ? '🙋 求汉化 · 已汉化' : '🙋 求汉化 · 待汉化'}</span>`
            : `<span class="us-tag">${CATEGORY_LABELS[c.category] || '附加包'}</span>`;
        const inner = `<div class="us-card-cover">${cover}</div>
            <div class="us-card-body">
                <div class="us-card-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
                ${sub ? `<div class="us-card-sub" title="${escapeHtml(sub)}">${escapeHtml(sub)}</div>` : ''}
                <div class="us-card-meta">${tag}${c.at ? `<span>${usDate(c.at)}</span>` : ''}</div>
            </div>`;
        // 还没上架（待汉化）的资源访客打不开，所以不做成链接
        return isDone
            ? `<a class="us-card" href="#item/${encodeURIComponent(c.id)}">${inner}</a>`
            : `<div class="us-card pending">${inner}</div>`;
    }).join('');

    return `
        <article class="ip-card us-hero">
            <div class="us-hero-main">
                ${avatarHtml(u.avatar, u.username, 'us-avatar')}
                <div class="us-hero-text">
                    <h1 class="us-name">${escapeHtml(u.username)}${u.isMe ? '<span class="us-me">我</span>' : ''}</h1>
                    <div class="us-joined">${usDate(u.created_at)} 加入天际译栈</div>
                    <div class="us-stats">
                        <span><b>${u.stats.contributions}</b>投稿上架</span>
                        <span><b>${u.stats.requests}</b>求汉化被采纳</span>
                        <span><b>${u.stats.comments}</b>条评论</span>
                    </div>
                </div>
            </div>
            <div class="us-actions">${actions}</div>
            ${note}
        </article>
        <article class="ip-card">
            <section class="ip-section" style="margin-top:0">
                <h2>投稿贡献 <span class="ma-h2-sub">${u.contributions.length ? u.contributions.length + ' 个' : ''}</span></h2>
                ${cards ? `<div class="us-grid">${cards}</div>`
                    : `<div class="ip-empty">${u.isMe ? '还没有投稿，去「投稿资源」分享你找到的汉化吧～' : '还没有投稿贡献'}</div>`}
            </section>
        </article>`;
}

function setupUserSpaceEvents() {
    document.getElementById('userBackBtn').addEventListener('click', () => {
        if (history.length > 1) history.back();
        else { history.replaceState(null, '', location.pathname + location.search); showPage('home'); }
    });
    document.getElementById('userContent').addEventListener('click', async (e) => {
        const t = e.target;
        const u = userSpace;
        if (!u) return;
        if (t.closest('[data-us-login]')) { openLoginModal(); return; }
        if (t.closest('[data-us-edit]')) { showPage('account', 'profile'); return; }
        if (t.closest('[data-us-admin-chat]')) { openChatWith(u.id); return; }
        if (t.closest('[data-us-dm]')) { openPeerChatFromSpace(u.id); return; }
        if (t.closest('[data-us-block]')) {
            const to = !u.iBlocked;
            if (to && !confirm(`拉黑「${u.username}」？\n拉黑后对方不能再给你发私信；你也要先取消拉黑才能给他发。随时可以取消。`)) return;
            try {
                await api('PUT', `/social/users/${encodeURIComponent(u.id)}/block`, { blocked: to });
                u.iBlocked = to;
                document.getElementById('userContent').innerHTML = userSpaceHtml(u);
                showToast(to ? '已拉黑' : '已取消拉黑');
            } catch (err) { showToast(err.message); }
        }
    });
}
