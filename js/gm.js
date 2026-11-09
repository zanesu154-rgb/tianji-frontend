// GM 面板

// ==================== GM 面板 ====================
async function loadGmData() {
    await Promise.all([loadGmStats(), loadGmSubmissions(), loadGmFeedback(), loadGmUsers(), loadGmClicks()]);
}

let gmClickDays = 7;
const LINK_FIELD_LABELS = { translationLink: '汉化', originalLink: '原版', authorLink: '作者直链' };

async function loadGmClicks() {
    const summary = document.getElementById('gmClickSummary');
    const listEl = document.getElementById('gmClickList');
    try {
        const data = await api('GET', `/gm/clicks?days=${gmClickDays}`);
        const rangeText = data.days ? `近 ${data.days} 天` : '全部时间';
        summary.textContent = `${rangeText}共 ${data.total} 次点击，涉及 ${data.itemCount} 个项目 · 今日 ${data.today} 次（同一访客对同一链接每天只计一次）`;
        renderVisitChart(data.trend, 'gmClickChart', '次点击');
        if (!data.ranking.length) {
            listEl.innerHTML = '<div class="account-empty">这段时间还没有点击记录</div>';
            return;
        }
        listEl.innerHTML = data.ranking.map((r, idx) => {
            const name = r.translated ? `${r.original}（${r.translated}）` : r.original;
            const detail = Object.entries(r.fields)
                .sort((a, b) => (b[1].open + b[1].copy) - (a[1].open + a[1].copy))
                .map(([f, v]) => `<span>${LINK_FIELD_LABELS[f] || f}：跳转 ${v.open} · 复制 ${v.copy}</span>`)
                .join('');
            return `
                <div class="click-rank-row">
                    <span class="click-rank-no">${idx + 1}</span>
                    <div class="click-rank-main">
                        <div class="click-rank-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
                        <div class="click-rank-detail">${detail}</div>
                    </div>
                    <span class="click-rank-total">${r.total}</span>
                </div>`;
        }).join('');
    } catch (e) {
        summary.textContent = e.message || '加载失败';
        listEl.innerHTML = '';
    }
}

async function loadGmStats() {
    try {
        const data = await api('GET', '/gm/visits');
        document.getElementById('gmTodayVisits').textContent = data.today;
        document.getElementById('gmTotalUsers').textContent = data.totalUsers;
        document.getElementById('gmPendingSubs').textContent = data.pendingSubmissions ?? 0;
        document.getElementById('gmPendingFeedback').textContent = data.pendingFeedback ?? 0;
        renderVisitChart(data.trend);
    } catch (e) {
        console.error('加载访客数据失败', e);
    }
}

let gmSubmissions = [];

async function loadGmSubmissions() {
    const listEl = document.getElementById('gmSubList');
    try {
        gmSubmissions = await api('GET', `/submissions/all?status=${gmSubStatus}`);
        if (!gmSubmissions.length) {
            const empty = { pending: '没有待审核的投稿 🎉', approved: '还没有通过的投稿', rejected: '还没有驳回的投稿' };
            listEl.innerHTML = `<div class="account-empty">${empty[gmSubStatus]}</div>`;
            return;
        }
        listEl.innerHTML = gmSubmissions.map(s => subCardHtml(s,
            s.status === 'pending'
                ? `<button class="gm-btn" data-sub-review="${escapeHtml(s.id)}">审核</button>`
                : `<button class="gm-btn danger" data-sub-delete="${escapeHtml(s.id)}">删除记录</button>`
        )).join('');
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

const REVIEW_FIELDS = {
    reviewOriginal: 'original', reviewTranslated: 'translated', reviewAuthor: 'author',
    reviewOriginalLink: 'original_link', reviewTranslationLink: 'translation_link',
    reviewAuthorLink: 'author_link', reviewDescription: 'description'
};

function openReviewModal(id) {
    const s = gmSubmissions.find(x => x.id === id);
    if (!s) return;
    reviewingSubmission = s;
    Object.entries(REVIEW_FIELDS).forEach(([elId, key]) => {
        document.getElementById(elId).value = s[key] || '';
    });
    document.getElementById('reviewCategory').value = s.category || 'addon';
    document.getElementById('reviewStatus').value = (s.translation_link || s.translated) ? 'done' : 'todo';
    document.getElementById('reviewNote').value = '';
    document.getElementById('reviewMeta').textContent = `投稿人：${s.username} · ${new Date(s.created_at * 1000).toLocaleString()}`;
    document.getElementById('reviewModal').classList.add('show');
}

function closeReviewModal() {
    document.getElementById('reviewModal').classList.remove('show');
    reviewingSubmission = null;
}

async function approveSubmission() {
    if (!reviewingSubmission) return;
    const v = id => document.getElementById(id).value.trim();
    const body = {
        original: v('reviewOriginal'),
        translated: v('reviewTranslated'),
        author: v('reviewAuthor'),
        category: document.getElementById('reviewCategory').value,
        originalLink: v('reviewOriginalLink'),
        translationLink: v('reviewTranslationLink'),
        authorLink: v('reviewAuthorLink'),
        description: v('reviewDescription'),
        status: document.getElementById('reviewStatus').value,
        note: v('reviewNote')
    };
    if (!body.original) { showToast('英文原名不能为空'); return; }
    try {
        await api('PUT', `/submissions/${encodeURIComponent(reviewingSubmission.id)}/approve`, body);
        closeReviewModal();
        showToast('已通过并上架');
        loadGmSubmissions();
        loadGmStats();
        await loadItems(false);
        render();
    } catch (e) {
        showToast(e.message || '操作失败');
    }
}

async function rejectSubmission() {
    if (!reviewingSubmission) return;
    const reason = document.getElementById('reviewNote').value.trim();
    if (!reason && !confirm('没有填写驳回原因，确定直接驳回吗？')) return;
    try {
        await api('PUT', `/submissions/${encodeURIComponent(reviewingSubmission.id)}/reject`, { reason });
        closeReviewModal();
        showToast('已驳回');
        loadGmSubmissions();
        loadGmStats();
    } catch (e) {
        showToast(e.message || '操作失败');
    }
}

async function loadGmFeedback() {
    const listEl = document.getElementById('gmFeedbackList');
    const countEl = document.getElementById('gmFeedbackCount');
    try {
        const list = await api('GET', '/feedback/all');
        const pendingCount = list.filter(f => f.status === 'pending').length;
        countEl.textContent = `（待处理 ${pendingCount} / 共 ${list.length}）`;
        if (list.length === 0) {
            listEl.innerHTML = '<div class="account-empty">暂无反馈</div>';
            return;
        }
        listEl.innerHTML = list.map(f => {
            const resolved = f.status === 'resolved';
            return `
                <div class="gm-feedback-card ${resolved ? 'resolved' : ''}">
                    <div class="gm-feedback-meta">
                        <span>👤 ${escapeHtml(f.username)}</span>
                        <span>📦 <span class="gm-feedback-item-name">${escapeHtml(f.item_name)}</span></span>
                        <span>🕐 ${escapeHtml(new Date(f.created_at * 1000).toLocaleString())}</span>
                        ${resolved ? '<span style="color:#16a34a;">✅ 已处理</span>' : ''}
                    </div>
                    <div class="gm-feedback-content">${escapeHtml(f.content)}</div>
                    ${f.reply ? `<div class="gm-feedback-reply">回复：${escapeHtml(f.reply)}</div>` : ''}
                    <div class="gm-feedback-actions">
                        ${!resolved ? `<button class="gm-btn" data-fb-resolve="${escapeHtml(f.id)}">回复并处理</button>` : ''}
                        <button class="gm-btn danger" data-fb-delete="${escapeHtml(f.id)}">删除</button>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

async function loadGmUsers() {
    const listEl = document.getElementById('gmUserList');
    try {
        const users = await api('GET', '/gm/users');
        if (users.length === 0) {
            listEl.innerHTML = '<div style="padding:1rem;color:var(--text-light);text-align:center;">暂无注册用户</div>';
            return;
        }
        listEl.innerHTML = users.map(u => `
            <div class="gm-user-row">
                <span class="gm-user-name">${escapeHtml(u.username)}</span>
                <span class="gm-user-role ${u.role === 'admin' ? 'admin' : ''}">${u.role === 'admin' ? '管理员' : '普通用户'}</span>
                <span class="gm-user-date">${escapeHtml(new Date(u.created_at * 1000).toLocaleDateString())}</span>
                <div class="gm-user-actions">
                    <button class="gm-btn" data-gm-message="${escapeHtml(u.id)}" data-gm-name="${escapeHtml(u.username)}">发消息</button>
                    <button class="gm-btn" data-gm-reset="${escapeHtml(u.id)}" data-gm-name="${escapeHtml(u.username)}">重置密码</button>
                    <button class="gm-btn danger" data-gm-delete="${escapeHtml(u.id)}" data-gm-name="${escapeHtml(u.username)}">删除</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

function renderVisitChart(trend, svgId = 'gmChart', unit = '位访客') {
    const svg = document.getElementById(svgId);
    if (!svg || !trend || trend.length < 2) return;

    const W = 600, H = 180;
    const padding = { top: 20, right: 20, bottom: 30, left: 30 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;
    // 刻度取整：每格 step 个访客，保证 5 条网格线的数值都是不重复的整数
    const rawMax = Math.max(...trend.map(t => t.count), 1);
    const step = Math.ceil(rawMax / 4);
    const maxCount = step * 4;

    const points = trend.map((t, i) => ({
        x: padding.left + (i / (trend.length - 1)) * chartW,
        y: padding.top + chartH - (t.count / maxCount) * chartH,
        ...t
    }));
    const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const areaPoints = `${padding.left},${padding.top + chartH} ${polylinePoints} ${padding.left + chartW},${padding.top + chartH}`;

    let gridLines = '';
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH / 4) * i;
        gridLines += `<line class="grid" x1="${padding.left}" y1="${y}" x2="${padding.left + chartW}" y2="${y}" />
            <text x="${padding.left - 4}" y="${y + 3}" text-anchor="end">${maxCount - step * i}</text>`;
    }

    let dots = '';
    let labels = '';
    const last = points.length - 1;
    points.forEach((p, i) => {
        dots += `<circle cx="${p.x}" cy="${p.y}" r="3"><title>${p.date}：${p.count} ${unit}</title></circle>`;
        if (i % 3 === 0 || i === last) {
            labels += `<text x="${p.x}" y="${H - 8}" text-anchor="middle">${p.date.slice(5)}</text>`;
        }
    });

    svg.innerHTML = `${gridLines}<polygon class="chart-area" points="${areaPoints}" /><polyline points="${polylinePoints}" />${dots}${labels}`;
}

function openCompose(target) {
    composeTarget = target;
    document.getElementById('composeTitle').textContent =
        target === 'all' ? '群发通知（所有注册用户）' : `发消息给「${target.name}」`;
    document.getElementById('composeSubject').value = target === 'all' ? '站点通知' : '';
    document.getElementById('composeContent').value = '';
    document.getElementById('composeModal').classList.add('show');
    setTimeout(() => document.getElementById('composeContent').focus(), 100);
}

async function sendCompose() {
    const title = document.getElementById('composeSubject').value.trim();
    const content = document.getElementById('composeContent').value.trim();
    if (!content) { showToast('请填写消息内容'); return; }
    try {
        if (composeTarget === 'all') {
            if (!confirm('确定发送给所有注册用户吗？')) return;
            const data = await api('POST', '/gm/broadcast', { title, content });
            showToast(`已发送给 ${data.count} 位用户`);
        } else {
            await api('POST', `/gm/users/${encodeURIComponent(composeTarget.id)}/message`, { title, content });
            showToast('消息已发送');
        }
        document.getElementById('composeModal').classList.remove('show');
    } catch (e) {
        showToast(e.message || '发送失败');
    }
}

function setupGmEvents() {
    // ---------- GM 面板 ----------
    document.getElementById('gmNavBtn').addEventListener('click', loadGmData);

    document.getElementById('gmClickTabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.gm-tab');
        if (!tab) return;
        gmClickDays = Number(tab.dataset.days);
        document.querySelectorAll('#gmClickTabs .gm-tab').forEach(t => t.classList.toggle('active', t === tab));
        loadGmClicks();
    });

    document.getElementById('gmSubTabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.gm-tab');
        if (!tab) return;
        gmSubStatus = tab.dataset.status;
        document.querySelectorAll('#gmSubTabs .gm-tab').forEach(t => t.classList.toggle('active', t === tab));
        loadGmSubmissions();
    });

    document.getElementById('gmSubList').addEventListener('click', async (e) => {
        const reviewBtn = e.target.closest('[data-sub-review]');
        if (reviewBtn) { openReviewModal(reviewBtn.dataset.subReview); return; }
        const delBtn = e.target.closest('[data-sub-delete]');
        if (delBtn) {
            if (!confirm('删除这条投稿记录？（已上架的项目不受影响）')) return;
            try {
                await api('DELETE', `/submissions/${encodeURIComponent(delBtn.dataset.subDelete)}`);
                loadGmSubmissions();
            } catch (err) { showToast(err.message); }
        }
    });

    document.querySelectorAll('[data-gm-jump]').forEach(card => {
        card.addEventListener('click', () => {
            const target = document.getElementById(card.dataset.gmJump);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    document.getElementById('reviewApproveBtn').addEventListener('click', approveSubmission);
    document.getElementById('reviewRejectBtn').addEventListener('click', rejectSubmission);
    document.getElementById('reviewCancelBtn').addEventListener('click', closeReviewModal);

    document.getElementById('gmFeedbackList').addEventListener('click', async (e) => {
        const resolveBtn = e.target.closest('[data-fb-resolve]');
        if (resolveBtn) {
            const reply = prompt('回复反馈人（可留空，会通过站内消息通知对方）：', '');
            if (reply === null) return; // 取消
            try {
                await api('PUT', `/feedback/${encodeURIComponent(resolveBtn.dataset.fbResolve)}/resolve`, { reply: reply.trim() });
                showToast('已处理');
                loadGmFeedback();
                loadGmStats();
            } catch (err) { showToast(err.message); }
            return;
        }
        const deleteBtn = e.target.closest('[data-fb-delete]');
        if (deleteBtn) {
            if (!confirm('确定删除这条反馈吗？')) return;
            try {
                await api('DELETE', `/feedback/${encodeURIComponent(deleteBtn.dataset.fbDelete)}`);
                loadGmFeedback();
                loadGmStats();
            } catch (err) { showToast(err.message); }
        }
    });

    document.getElementById('gmBroadcastBtn').addEventListener('click', () => openCompose('all'));
    document.getElementById('composeSendBtn').addEventListener('click', sendCompose);
    document.getElementById('composeCancelBtn').addEventListener('click', () => {
        document.getElementById('composeModal').classList.remove('show');
    });

    document.getElementById('gmUserList').addEventListener('click', async (e) => {
        const msgBtn = e.target.closest('[data-gm-message]');
        if (msgBtn) {
            openCompose({ id: msgBtn.dataset.gmMessage, name: msgBtn.dataset.gmName });
            return;
        }

        const resetBtn = e.target.closest('[data-gm-reset]');
        if (resetBtn) {
            const newPwd = prompt(`为「${resetBtn.dataset.gmName}」设置新密码（至少 6 位）：`);
            if (!newPwd) return;
            if (newPwd.length < 6) { showToast('密码至少 6 位'); return; }
            try {
                await api('PUT', `/gm/users/${encodeURIComponent(resetBtn.dataset.gmReset)}/password`, { newPassword: newPwd });
                showToast('密码已重置，该用户需要重新登录');
            } catch (err) { showToast(err.message || '重置失败'); }
            return;
        }

        const deleteBtn = e.target.closest('[data-gm-delete]');
        if (deleteBtn) {
            if (!confirm(`⚠️ 确定要删除用户「${deleteBtn.dataset.gmName}」吗？此操作不可恢复！`)) return;
            try {
                await api('DELETE', `/gm/users/${encodeURIComponent(deleteBtn.dataset.gmDelete)}`);
                showToast('用户已删除');
                loadGmUsers();
                loadGmStats();
            } catch (err) { showToast(err.message || '删除失败'); }
        }
    });
}
