// GM 面板

// ==================== GM 面板 ====================
async function loadGmData() {
    await Promise.all([loadGmStats(), loadGmSubmissions(), loadGmFeedback(), loadGmUsers(), loadGmClicks()]);
}

let gmClickDays = 7;
const LINK_FIELD_LABELS = { translationLink: '汉化', originalLink: '原版', authorLink: '作者直链' };

// 点击排行的一行：点整行进入这个资源的点击详情
function clickRowHtml(r, idx) {
    const name = r.translated ? `${r.original}（${r.translated}）` : r.original;
    const detail = Object.entries(r.fields)
        .sort((a, b) => (b[1].open + b[1].copy) - (a[1].open + a[1].copy))
        .map(([f, v]) => `<span>${LINK_FIELD_LABELS[f] || f}：跳转 ${v.open} · 复制 ${v.copy}</span>`)
        .join('');
    return `
        <a class="click-rank-row clickable" href="#account/gm-click/${encodeURIComponent(r.id)}" title="查看「${escapeHtml(name)}」的点击详情">
            <span class="click-rank-no">${idx + 1}</span>
            <div class="click-rank-main">
                <div class="click-rank-name">${escapeHtml(name)}</div>
                <div class="click-rank-detail">${detail}</div>
            </div>
            <span class="click-rank-total">${r.total}</span>
            <span class="click-rank-go">›</span>
        </a>`;
}

const GM_PREVIEW_CLICKS = 10;
async function loadGmClicks() {
    const summary = document.getElementById('gmClickSummary');
    const listEl = document.getElementById('gmClickList');
    const more = document.getElementById('gmClickMore');
    try {
        const data = await api('GET', `/gm/clicks?days=${gmClickDays}`);
        const rangeText = data.days ? `近 ${data.days} 天` : '全部时间';
        summary.textContent = `${rangeText}共 ${data.total} 次点击，涉及 ${data.itemCount} 个项目 · 今日 ${data.today} 次（同一访客对同一链接每天只计一次）`;
        renderVisitChart(data.trend, 'gmClickChart', '次点击');
        more.style.display = data.itemCount > GM_PREVIEW_CLICKS ? '' : 'none';
        more.textContent = `查看全部 ${data.itemCount} 个项目 ›`;
        if (!data.ranking.length) {
            listEl.innerHTML = '<div class="account-empty">这段时间还没有点击记录</div>';
            return;
        }
        listEl.innerHTML = data.ranking.slice(0, GM_PREVIEW_CLICKS).map(clickRowHtml).join('');
    } catch (e) {
        summary.textContent = e.message || '加载失败';
        listEl.innerHTML = '';
    }
}

// ---------- 点击量详情页（全部 + 搜索） ----------
let gmClicksPageDays = 7;
let gmClicksPageData = null;
async function loadGmClicksPage() {
    const summary = document.getElementById('gmClicksSummary');
    document.querySelectorAll('#gmClicksTabs .gm-tab').forEach(t => t.classList.toggle('active', Number(t.dataset.days) === gmClicksPageDays));
    summary.textContent = '加载中...';
    try {
        gmClicksPageData = await api('GET', `/gm/clicks?days=${gmClicksPageDays}&all=1`);
        renderGmClicksPage();
    } catch (e) {
        summary.textContent = e.message || '加载失败';
    }
}
function renderGmClicksPage() {
    const data = gmClicksPageData;
    if (!data) return;
    const q = document.getElementById('gmClicksSearch').value.trim().toLowerCase();
    // 排名按全部数据算，搜索只是筛选
    const rows = data.ranking.map((r, i) => [r, i]).filter(([r]) => !q
        || (r.original || '').toLowerCase().includes(q) || (r.translated || '').toLowerCase().includes(q));
    const rangeText = data.days ? `近 ${data.days} 天` : '全部时间';
    document.getElementById('gmClicksSummary').textContent = q
        ? `找到 ${rows.length} 个项目（${rangeText}共 ${data.itemCount} 个有点击）`
        : `${rangeText}共 ${data.total} 次点击，涉及 ${data.itemCount} 个项目 · 点任意一行查看详情`;
    gmPaged('clicks', rows, document.getElementById('gmClicksList'), document.getElementById('gmClicksPager'),
        ([r, i]) => clickRowHtml(r, i), q ? '没有匹配的资源' : '这段时间还没有点击记录', '个');
}

// ---------- 单个资源的点击详情 ----------
let gmClickItemDays = 30;
let gmClickItemId = null;
async function loadGmClickItem(itemId) {
    if (itemId) gmClickItemId = itemId;
    const summary = document.getElementById('gmClickItemSummary');
    const fieldsEl = document.getElementById('gmClickItemFields');
    document.querySelectorAll('#gmClickItemTabs .gm-tab').forEach(t => t.classList.toggle('active', Number(t.dataset.days) === gmClickItemDays));
    summary.textContent = '加载中...';
    fieldsEl.innerHTML = '';
    try {
        const d = await api('GET', `/gm/clicks/${encodeURIComponent(gmClickItemId)}?days=${gmClickItemDays}`);
        const name = d.item.translated ? `${d.item.original}（${d.item.translated}）` : d.item.original;
        document.getElementById('gmClickItemTitle').textContent = name;
        document.getElementById('gmClickItemLink').href = '#item/' + encodeURIComponent(d.item.id);
        const rangeText = d.days ? `近 ${d.days} 天` : '全部时间';
        summary.textContent = `${rangeText}共 ${d.total} 次点击${d.firstDate ? ` · 最早记录 ${d.firstDate}` : ''}${d.days ? '' : '（走势图显示最近 90 天）'}`;
        renderVisitChart(d.trend, 'gmClickItemChart', '次点击');
        const fieldOrder = ['translationLink', 'authorLink', 'originalLink'];
        const entries = Object.entries(d.fields).sort((a, b) => fieldOrder.indexOf(a[0]) - fieldOrder.indexOf(b[0]));
        fieldsEl.innerHTML = entries.length ? `
            <div class="gm-field-row head"><span>链接</span><span>跳转</span><span>复制</span><span>合计</span></div>
            ${entries.map(([f, v]) => `<div class="gm-field-row"><span>${LINK_FIELD_LABELS[f] || escapeHtml(f)}</span><span>${v.open}</span><span>${v.copy}</span><span><b>${v.open + v.copy}</b></span></div>`).join('')}`
            : '<div class="account-empty">这段时间没有点击</div>';
    } catch (e) {
        summary.textContent = e.message || '加载失败';
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

// ==================== 通用：GM 列表页分页 ====================
const GM_PAGE_SIZE = 10;
const GM_PREVIEW_N = 3;
const gmPages = {};   // 每个列表页当前页码
// 渲染一页：rows = 已筛选好的全部数据
function gmPaged(key, rows, listEl, pagerEl, rowHtml, emptyText, unit = '条') {
    const pageCount = Math.max(1, Math.ceil(rows.length / GM_PAGE_SIZE));
    let page = Math.min(gmPages[key] || 1, pageCount);
    gmPages[key] = page;
    listEl.innerHTML = rows.length
        ? rows.slice((page - 1) * GM_PAGE_SIZE, page * GM_PAGE_SIZE).map(rowHtml).join('')
        : `<div class="account-empty">${emptyText}</div>`;
    if (pageCount <= 1) { pagerEl.style.display = 'none'; pagerEl.innerHTML = ''; return; }
    pagerEl.style.display = '';
    pagerEl.innerHTML = pagerHtml(page, pageCount, rows.length, unit);
}
// 换页后回到列表顶部
function gmGoPage(key, n, render, anchorEl) {
    if (!Number.isFinite(n) || n < 1 || n === gmPages[key]) return;
    gmPages[key] = n;
    render();
    const top = anchorEl.getBoundingClientRect().top + window.scrollY - (document.querySelector('.top-nav').offsetHeight + 12);
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}
const gmMatch = (q, ...vals) => !q || vals.some(v => String(v || '').toLowerCase().includes(q));
const gmBadge = (el, n) => { const b = el.querySelector('.gm-board-badge'); if (b) b.textContent = n || ''; };

// ==================== 投稿审核 ====================
let gmSubmissions = [];
let gmSubKind = 'item';     // item = 成品投稿，request = 汉化请求
const isRequestSub = s => s.kind === 'request';

function gmSubCard(s) {
    return subCardHtml(s,
        s.status === 'pending'
            ? `<button class="gm-btn" data-sub-review="${escapeHtml(s.id)}">${isRequestSub(s) ? '处理' : '审核'}</button>`
            : `<button class="gm-btn danger" data-sub-delete="${escapeHtml(s.id)}">删除记录</button>`);
}

async function fetchGmSubmissions() {
    gmSubmissions = await api('GET', '/submissions/all');
    return gmSubmissions;
}

// 面板预览：最新 3 条待审核
async function loadGmSubmissions() {
    const listEl = document.getElementById('gmSubList');
    try {
        await fetchGmSubmissions();
        const pending = gmSubmissions.filter(s => s.status === 'pending');
        const req = pending.filter(isRequestSub).length;
        document.getElementById('gmSubPreviewCount').textContent = pending.length
            ? `待审核 ${pending.length}（成品 ${pending.length - req} · 请求 ${req}）` : '';
        listEl.innerHTML = pending.length
            ? pending.slice(0, GM_PREVIEW_N).map(gmSubCard).join('')
            : '<div class="account-empty">没有待审核的投稿 🎉</div>';
        document.getElementById('gmSubMore').textContent = pending.length > GM_PREVIEW_N
            ? `还有 ${pending.length - GM_PREVIEW_N} 条待审核，进入投稿审核 ›` : '进入投稿审核 ›';
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

// 独立页：成品投稿 / 汉化请求 × 待审核 / 已通过 / 已驳回
async function loadGmSubsPage() {
    const listEl = document.getElementById('gmSubsList');
    if (!gmSubmissions.length) listEl.innerHTML = '加载中...';
    try {
        await fetchGmSubmissions();
        renderGmSubsPage();
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}
function renderGmSubsPage() {
    const q = document.getElementById('gmSubsSearch').value.trim().toLowerCase();
    document.querySelectorAll('#gmSubBoards .gm-board').forEach(b => {
        const isReq = b.dataset.kind === 'request';
        b.classList.toggle('active', b.dataset.kind === gmSubKind);
        gmBadge(b, gmSubmissions.filter(s => s.status === 'pending' && isRequestSub(s) === isReq).length);
    });
    const ofKind = gmSubmissions.filter(s => isRequestSub(s) === (gmSubKind === 'request'));
    document.querySelectorAll('#gmSubTabs .gm-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.status === gmSubStatus);
        const n = ofKind.filter(s => s.status === t.dataset.status).length;
        const label = { pending: '待审核', approved: gmSubKind === 'request' ? '已接受' : '已通过', rejected: gmSubKind === 'request' ? '已拒绝' : '已驳回' }[t.dataset.status];
        t.textContent = n ? `${label} ${n}` : label;
    });
    const rows = ofKind.filter(s => s.status === gmSubStatus
        && gmMatch(q, s.original, s.translated, s.author, s.username, s.description));
    const what = gmSubKind === 'request' ? '汉化请求' : '投稿';
    const empty = q ? '没有匹配的记录'
        : { pending: `没有待审核的${what} 🎉`, approved: `还没有${gmSubKind === 'request' ? '接受' : '通过'}的${what}`, rejected: `还没有${gmSubKind === 'request' ? '拒绝' : '驳回'}的${what}` }[gmSubStatus];
    gmPaged('subs', rows, document.getElementById('gmSubsList'), document.getElementById('gmSubsPager'), gmSubCard, empty);
}
function refreshGmSubs() {
    loadGmSubmissions().then(() => {
        if (document.getElementById('section-gm-subs').style.display !== 'none') renderGmSubsPage();
    });
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
    const isRequest = s.kind === 'request';
    const modal = document.getElementById('reviewModal');
    modal.classList.toggle('is-request', isRequest);
    document.getElementById('reviewTitle').textContent = isRequest ? '处理汉化请求' : '审核投稿';
    document.getElementById('reviewNoteLabel').textContent = isRequest ? '留言 / 拒绝原因' : '给投稿人的留言 / 驳回原因';
    document.getElementById('reviewNote').placeholder = isRequest ? '可选，会通过站内消息发送给所有想要的人' : '可选，会通过站内消息发送给投稿人';
    document.getElementById('reviewApproveBtn').textContent = isRequest ? '✓ 接受（加入待汉化）' : '✓ 通过';
    document.getElementById('reviewRejectBtn').textContent = isRequest ? '✕ 拒绝' : '✕ 驳回';
    if (isRequest) document.getElementById('reviewStatus').value = 'todo';
    const wants = Number(s.want_count) || 1;
    document.getElementById('reviewMeta').textContent = `${isRequest ? '提出人' : '投稿人'}：${s.username}${isRequest ? ` · ${wants} 人想要` : ''} · ${new Date(s.created_at * 1000).toLocaleString()}`;
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
        const wasRequest = reviewingSubmission.kind === 'request';
        closeReviewModal();
        showToast(wasRequest ? '已接受，已加入待汉化列表' : '已通过并上架');
        refreshGmSubs();
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
    if (!reason && !confirm(reviewingSubmission.kind === 'request' ? '没有填写拒绝原因，确定直接拒绝吗？' : '没有填写驳回原因，确定直接驳回吗？')) return;
    try {
        await api('PUT', `/submissions/${encodeURIComponent(reviewingSubmission.id)}/reject`, { reason });
        const wasRequest = reviewingSubmission.kind === 'request';
        closeReviewModal();
        showToast(wasRequest ? '已拒绝' : '已驳回');
        refreshGmSubs();
        loadGmStats();
    } catch (e) {
        showToast(e.message || '操作失败');
    }
}

// 反馈：评论区里勾了「反馈」的楼层 + 以前私下提交的旧反馈
function gmCommentCardHtml(c, isFeedback) {
    const resolved = isFeedback && c.status === 'resolved';
    const replies = Number(c.reply_count) || 0;
    return `
        <div class="gm-feedback-card ${resolved ? 'resolved' : ''}">
            <div class="gm-feedback-meta">
                <span>👤 ${escapeHtml(c.username)}</span>
                <span>📦 <a class="gm-feedback-item-name" href="#item/${encodeURIComponent(c.item_id)}">${escapeHtml(c.item_name || '已删除的资源')}</a></span>
                <span>🕐 ${escapeHtml(new Date(c.created_at * 1000).toLocaleString())}</span>
                ${!isFeedback && Number(c.is_feedback) === 1 ? '<span class="cm-tag fb">反馈</span>' : ''}
                ${!isFeedback && c.parent_id ? '<span class="cm-tag">回复</span>' : ''}
                ${c.report ? `<span class="cm-tag test-${escapeHtml(c.report)}">${escapeHtml(TEST_REPORT_LABELS[c.report] || '测试反馈')}</span>` : ''}
                ${String(c.user_id || '').startsWith('guest:') ? '<span class="cm-tag">未登录</span>' : ''}
                ${resolved ? '<span style="color:#16a34a;">✅ 已处理</span>' : ''}
                ${replies ? `<span>💬 ${replies} 条回复${Number(c.admin_replies) ? '（含栈主）' : ''}</span>` : ''}
            </div>
            <div class="gm-feedback-content">${escapeHtml(c.content)}</div>
            <div class="gm-feedback-actions">
                <a class="gm-btn" href="#item/${encodeURIComponent(c.item_id)}">查看</a>
                ${isFeedback && !resolved ? `<button class="gm-btn" data-cm-gm-resolve="${escapeHtml(c.id)}">回复并处理</button>` : ''}
                <button class="gm-btn danger" data-cm-gm-delete="${escapeHtml(c.id)}">删除</button>
            </div>
        </div>`;
}

// 旧版私下反馈（只有栈主能看到）
function gmOldFeedbackHtml(f) {
    const resolved = f.status === 'resolved';
    return `
        <div class="gm-feedback-card ${resolved ? 'resolved' : ''}">
            <div class="gm-feedback-meta">
                <span class="cm-tag">旧反馈 · 仅你可见</span>
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
}

// 反馈统一成一个列表：评论区反馈楼层 + 旧反馈
let gmFeedbackAll = [];
let gmRecentAll = [];
async function fetchGmFeedback() {
    const [cm, old] = await Promise.all([api('GET', '/comments/admin'), api('GET', '/feedback/all')]);
    gmFeedbackAll = [
        ...cm.feedback.map(c => ({ ...c, _old: false, _open: c.status !== 'resolved' })),
        ...old.map(f => ({ ...f, _old: true, _open: f.status === 'pending' }))
    ].sort((a, b) => (b._open - a._open) || (b.created_at - a.created_at));
    gmRecentAll = cm.recent;
}
const gmFbHtml = f => f._old ? gmOldFeedbackHtml(f) : gmCommentCardHtml(f, true);

// 面板预览：反馈 3 条（待处理优先）+ 最近评论 3 条
async function loadGmFeedback() {
    const listEl = document.getElementById('gmFeedbackList');
    const recentEl = document.getElementById('gmRecentComments');
    try {
        await fetchGmFeedback();
        const open = gmFeedbackAll.filter(f => f._open);
        document.getElementById('gmFeedbackCount').textContent = gmFeedbackAll.length ? `待处理 ${open.length} / 共 ${gmFeedbackAll.length}` : '';
        listEl.innerHTML = open.length
            ? open.slice(0, GM_PREVIEW_N).map(gmFbHtml).join('')
            : `<div class="account-empty">${gmFeedbackAll.length ? '反馈都处理完了 🎉' : '暂无反馈'}</div>`;
        document.getElementById('gmFeedbackMore').textContent = open.length > GM_PREVIEW_N
            ? `还有 ${open.length - GM_PREVIEW_N} 条待处理，进入反馈管理 ›` : '进入反馈管理 ›';
        document.getElementById('gmRecentCount').textContent = gmRecentAll.length ? `共 ${gmRecentAll.length} 条` : '';
        recentEl.innerHTML = gmRecentAll.length
            ? gmRecentAll.slice(0, GM_PREVIEW_N).map(c => gmCommentCardHtml(c, false)).join('')
            : '<div class="account-empty">还没有评论</div>';
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

// ---------- 反馈管理页：待处理 / 已处理 ----------
let gmFbBoard = 'open';
async function loadGmFeedbackPage() {
    const listEl = document.getElementById('gmFbList');
    if (!gmFeedbackAll.length) listEl.innerHTML = '加载中...';
    try {
        await fetchGmFeedback();
        renderGmFeedbackPage();
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}
function renderGmFeedbackPage() {
    const q = document.getElementById('gmFbSearch').value.trim().toLowerCase();
    document.querySelectorAll('#gmFbBoards .gm-board').forEach(b => {
        b.classList.toggle('active', b.dataset.fb === gmFbBoard);
        gmBadge(b, gmFeedbackAll.filter(f => f._open === (b.dataset.fb === 'open')).length);
    });
    const rows = gmFeedbackAll.filter(f => f._open === (gmFbBoard === 'open')
        && gmMatch(q, f.item_name, f.username, f.content));
    gmPaged('fb', rows, document.getElementById('gmFbList'), document.getElementById('gmFbPager'), gmFbHtml,
        q ? '没有匹配的反馈' : (gmFbBoard === 'open' ? '没有待处理的反馈 🎉' : '还没有已处理的反馈'));
}

// ---------- 评论管理页：全部 / 反馈楼层 / 测试报告 ----------
let gmCmBoard = 'all';
const GM_CM_FILTERS = {
    all: () => true,
    feedback: c => Number(c.is_feedback) === 1 && !c.parent_id,
    test: c => !!c.report
};
async function loadGmCommentsPage() {
    const listEl = document.getElementById('gmCmList');
    if (!gmRecentAll.length) listEl.innerHTML = '加载中...';
    try {
        await fetchGmFeedback();
        renderGmCommentsPage();
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}
function renderGmCommentsPage() {
    const q = document.getElementById('gmCmSearch').value.trim().toLowerCase();
    document.querySelectorAll('#gmCmBoards .gm-board').forEach(b => {
        b.classList.toggle('active', b.dataset.cm === gmCmBoard);
        gmBadge(b, gmRecentAll.filter(GM_CM_FILTERS[b.dataset.cm]).length);
    });
    const rows = gmRecentAll.filter(c => GM_CM_FILTERS[gmCmBoard](c) && gmMatch(q, c.item_name, c.username, c.content));
    gmPaged('cm', rows, document.getElementById('gmCmList'), document.getElementById('gmCmPager'),
        c => gmCommentCardHtml(c, false), q ? '没有匹配的评论' : '这里还没有评论');
}

// 处理 / 删除后刷新面板和当前打开的页面
function refreshGmComments() {
    loadGmFeedback().then(() => {
        if (document.getElementById('section-gm-feedback').style.display !== 'none') renderGmFeedbackPage();
        if (document.getElementById('section-gm-comments').style.display !== 'none') renderGmCommentsPage();
    });
    loadGmStats();
}

// 用户行：用户名可点击进入空间
function gmUserRowHtml(u) {
    const subs = Number(u.approved_subs) || 0;
    const comments = Number(u.comments) || 0;
    return `
        <div class="gm-user-row">
            <a class="gm-user-link" href="#user/${encodeURIComponent(u.id)}" title="查看空间">
                ${avatarHtml(u.avatar, u.username, 'gm-user-avatar')}
                <span class="gm-user-name">${escapeHtml(u.username)}</span>
            </a>
            <span class="gm-user-role ${u.role === 'admin' ? 'admin' : ''}">${u.role === 'admin' ? '管理员' : '普通用户'}</span>
            ${Number(u.blocked) ? '<span class="chat-blocked-tag">已拉黑</span>' : ''}
            <span class="gm-user-stat" title="审核通过的投稿 / 评论数">📤 ${subs} · 💬 ${comments}</span>
            <span class="gm-user-date">${escapeHtml(new Date(u.created_at * 1000).toLocaleDateString())}</span>
            <div class="gm-user-actions">
                <button class="gm-btn" data-gm-message="${escapeHtml(u.id)}" data-gm-name="${escapeHtml(u.username)}">私信</button>
                <button class="gm-btn" data-gm-reset="${escapeHtml(u.id)}" data-gm-name="${escapeHtml(u.username)}">重置密码</button>
                <button class="gm-btn danger" data-gm-delete="${escapeHtml(u.id)}" data-gm-name="${escapeHtml(u.username)}">删除</button>
            </div>
        </div>`;
}

const GM_PREVIEW_USERS = 8;
let gmUsersCache = [];
async function loadGmUsers() {
    const listEl = document.getElementById('gmUserList');
    const more = document.getElementById('gmUserMore');
    try {
        gmUsersCache = await api('GET', '/gm/users');
        if (gmUsersCache.length === 0) {
            listEl.innerHTML = '<div style="padding:1rem;color:var(--text-light);text-align:center;">暂无注册用户</div>';
            more.style.display = 'none';
            return;
        }
        listEl.innerHTML = gmUsersCache.slice(0, GM_PREVIEW_USERS).map(gmUserRowHtml).join('');
        more.style.display = gmUsersCache.length > GM_PREVIEW_USERS ? '' : 'none';
        more.textContent = `查看全部 ${gmUsersCache.length} 位用户 ›`;
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

// ---------- 全部用户页（搜索 + 排序） ----------
async function loadGmUsersPage() {
    const listEl = document.getElementById('gmUsersList');
    if (!gmUsersCache.length) listEl.innerHTML = '加载中...';
    try {
        gmUsersCache = await api('GET', '/gm/users');
        renderGmUsersPage();
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}
function renderGmUsersPage() {
    const q = document.getElementById('gmUsersSearch').value.trim().toLowerCase();
    const sort = document.getElementById('gmUsersSort').value;
    let rows = gmUsersCache.filter(u => !q || u.username.toLowerCase().includes(q));
    const by = {
        new: (a, b) => b.created_at - a.created_at,
        old: (a, b) => a.created_at - b.created_at,
        subs: (a, b) => (Number(b.approved_subs) - Number(a.approved_subs)) || (b.created_at - a.created_at),
        comments: (a, b) => (Number(b.comments) - Number(a.comments)) || (b.created_at - a.created_at),
        blocked: (a, b) => (Number(b.blocked) - Number(a.blocked)) || (b.created_at - a.created_at)
    }[sort];
    rows = rows.slice().sort(by);
    document.getElementById('gmUsersCount').textContent = q ? `${rows.length} / ${gmUsersCache.length}` : `共 ${gmUsersCache.length} 位`;
    gmPaged('users', rows, document.getElementById('gmUsersList'), document.getElementById('gmUsersPager'),
        gmUserRowHtml, q ? '没有匹配的用户' : '暂无注册用户', '位');
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
        dots += `<circle cx="${p.x}" cy="${p.y}" r="${points.length > 40 ? 1.8 : 3}"><title>${p.date}：${p.count} ${unit}</title></circle>`;
        // 点多时标签稀疏一点，最多 8 个左右
        const every = Math.max(3, Math.ceil(points.length / 8));
        if ((i % every === 0 && last - i >= every / 2) || i === last) {
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

    // ---------- 投稿审核页 ----------
    const onSubAction = async (e) => {
        const reviewBtn = e.target.closest('[data-sub-review]');
        if (reviewBtn) { openReviewModal(reviewBtn.dataset.subReview); return; }
        const delBtn = e.target.closest('[data-sub-delete]');
        if (delBtn) {
            if (!confirm('删除这条投稿记录？（已上架的项目不受影响）')) return;
            try {
                await api('DELETE', `/submissions/${encodeURIComponent(delBtn.dataset.subDelete)}`);
                refreshGmSubs();
            } catch (err) { showToast(err.message); }
        }
    };
    document.getElementById('gmSubList').addEventListener('click', onSubAction);
    document.getElementById('gmSubsList').addEventListener('click', onSubAction);
    document.getElementById('gmSubBoards').addEventListener('click', (e) => {
        const b = e.target.closest('.gm-board');
        if (!b || b.dataset.kind === gmSubKind) return;
        gmSubKind = b.dataset.kind;
        gmSubStatus = 'pending';
        gmPages.subs = 1;
        renderGmSubsPage();
    });
    document.getElementById('gmSubTabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.gm-tab');
        if (!tab) return;
        gmSubStatus = tab.dataset.status;
        gmPages.subs = 1;
        renderGmSubsPage();
    });
    document.getElementById('gmSubsSearch').addEventListener('input', () => { gmPages.subs = 1; renderGmSubsPage(); });

    // ---------- 反馈 / 评论管理页 ----------
    document.getElementById('gmFbBoards').addEventListener('click', (e) => {
        const b = e.target.closest('.gm-board');
        if (!b) return;
        gmFbBoard = b.dataset.fb;
        gmPages.fb = 1;
        renderGmFeedbackPage();
    });
    document.getElementById('gmFbSearch').addEventListener('input', () => { gmPages.fb = 1; renderGmFeedbackPage(); });
    document.getElementById('gmCmBoards').addEventListener('click', (e) => {
        const b = e.target.closest('.gm-board');
        if (!b) return;
        gmCmBoard = b.dataset.cm;
        gmPages.cm = 1;
        renderGmCommentsPage();
    });
    document.getElementById('gmCmSearch').addEventListener('input', () => { gmPages.cm = 1; renderGmCommentsPage(); });

    // ---------- 各列表页的分页条 ----------
    [['subs', 'gmSubsPager', 'gmSubsList', () => renderGmSubsPage()],
     ['fb', 'gmFbPager', 'gmFbList', () => renderGmFeedbackPage()],
     ['cm', 'gmCmPager', 'gmCmList', () => renderGmCommentsPage()],
     ['users', 'gmUsersPager', 'gmUsersList', () => renderGmUsersPage()],
     ['clicks', 'gmClicksPager', 'gmClicksList', () => renderGmClicksPage()]
    ].forEach(([key, pagerId, listId, render]) => {
        bindPager(document.getElementById(pagerId), n => gmGoPage(key, n, render, document.getElementById(listId).closest('section')));
    });

    document.getElementById('reviewApproveBtn').addEventListener('click', approveSubmission);
    document.getElementById('reviewRejectBtn').addEventListener('click', rejectSubmission);
    document.getElementById('reviewCancelBtn').addEventListener('click', closeReviewModal);

    // 评论区反馈 / 最近评论
    const onGmComment = async (e) => {
        const r = e.target.closest('[data-cm-gm-resolve]');
        if (r) {
            const reply = prompt('回复反馈人（可留空；回复会显示在评论区，并通过站内消息通知对方）：', '');
            if (reply === null) return;
            try {
                await api('PUT', `/comments/${encodeURIComponent(r.dataset.cmGmResolve)}/resolve`, { reply: reply.trim() });
                showToast('已处理');
                refreshGmComments();
            } catch (err) { showToast(err.message); }
            return;
        }
        const d = e.target.closest('[data-cm-gm-delete]');
        if (d) {
            if (!confirm('确定删除这条评论吗？（楼层下的回复会一起删除）')) return;
            try {
                await api('DELETE', `/comments/${encodeURIComponent(d.dataset.cmGmDelete)}`);
                showToast('已删除');
                refreshGmComments();
            } catch (err) { showToast(err.message); }
        }
    };
    const onOldFeedback = async (e) => {
        const resolveBtn = e.target.closest('[data-fb-resolve]');
        if (resolveBtn) {
            const reply = prompt('回复反馈人（可留空，会通过站内消息通知对方）：', '');
            if (reply === null) return; // 取消
            try {
                await api('PUT', `/feedback/${encodeURIComponent(resolveBtn.dataset.fbResolve)}/resolve`, { reply: reply.trim() });
                showToast('已处理');
                refreshGmComments();
            } catch (err) { showToast(err.message); }
            return;
        }
        const deleteBtn = e.target.closest('[data-fb-delete]');
        if (deleteBtn) {
            if (!confirm('确定删除这条反馈吗？')) return;
            try {
                await api('DELETE', `/feedback/${encodeURIComponent(deleteBtn.dataset.fbDelete)}`);
                refreshGmComments();
            } catch (err) { showToast(err.message); }
        }
    };
    ['gmFeedbackList', 'gmRecentComments', 'gmFbList', 'gmCmList'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('click', onGmComment);
        el.addEventListener('click', onOldFeedback);
    });

    document.getElementById('gmBroadcastBtn').addEventListener('click', () => openCompose('all'));
    document.getElementById('composeSendBtn').addEventListener('click', sendCompose);
    document.getElementById('composeCancelBtn').addEventListener('click', () => {
        document.getElementById('composeModal').classList.remove('show');
    });

    // 统计卡片 → 详情页
    document.querySelectorAll('[data-gm-go]').forEach(card => {
        card.addEventListener('click', () => { location.hash = '#account/' + card.dataset.gmGo; });
    });
    document.getElementById('gmClicksTabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.gm-tab');
        if (!tab) return;
        gmClicksPageDays = Number(tab.dataset.days);
        loadGmClicksPage();
    });
    document.getElementById('gmClicksSearch').addEventListener('input', () => { gmPages.clicks = 1; renderGmClicksPage(); });
    document.getElementById('gmClickItemTabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.gm-tab');
        if (!tab) return;
        gmClickItemDays = Number(tab.dataset.days);
        loadGmClickItem();
    });
    document.getElementById('gmUsersSearch').addEventListener('input', () => { gmPages.users = 1; renderGmUsersPage(); });
    document.getElementById('gmUsersSort').addEventListener('change', () => { gmPages.users = 1; renderGmUsersPage(); });
    document.getElementById('gmUsersList').addEventListener('click', onGmUserAction);

    document.getElementById('gmUserList').addEventListener('click', onGmUserAction);
}

async function onGmUserAction(e) {
    {
        const msgBtn = e.target.closest('[data-gm-message]');
        if (msgBtn) {
            // 私信：打开和这个用户的对话（对方可以回复）
            openChatWith(msgBtn.dataset.gmMessage);
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
                if (currentPage === 'account' && location.hash.startsWith('#account/gm-users')) loadGmUsersPage();
                else { loadGmUsers(); loadGmStats(); }
            } catch (err) { showToast(err.message || '删除失败'); }
        }
    }
}
