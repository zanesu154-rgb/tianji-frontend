// 我的投稿

// ==================== 我的投稿 ====================
const SUB_STATUS = {
    pending: ['pending', '⏳ 待审核'],
    approved: ['approved', '✅ 已通过'],
    rejected: ['rejected', '✕ 未通过']
};

function subLinksHtml(s) {
    const links = [
        ['原版', s.original_link], ['汉化', s.translation_link], ['作者', s.author_link]
    ].filter(([, v]) => v);
    if (!links.length) return '';
    return `<div class="sub-links">${links.map(([k, v]) => `${k}：${escapeHtml(v)}`).join('<br>')}</div>`;
}

function subCardHtml(s, actionsHtml) {
    const [cls, label] = SUB_STATUS[s.status] || SUB_STATUS.pending;
    return `
        <div class="sub-card">
            <div class="sub-head">
                <span class="sub-name">${escapeHtml(s.original)}${s.translated ? ` <span class="trans">（${escapeHtml(s.translated)}）</span>` : ''}</span>
                <span class="sub-status ${cls}">${label}</span>
            </div>
            <div class="sub-meta">
                <span>${CATEGORY_LABELS[s.category] || '附加包'}</span>
                <span>作者：${escapeHtml(s.author || '佚名')}</span>
                ${isAdmin ? `<span>投稿人：${escapeHtml(s.username)}</span>` : ''}
                <span>${formatTime(s.created_at)}</span>
            </div>
            ${s.description ? `<div class="sub-desc">${escapeHtml(s.description)}</div>` : ''}
            ${subLinksHtml(s)}
            ${s.review_note ? `<div class="sub-note">${s.status === 'rejected' ? '驳回原因' : '栈主留言'}：${escapeHtml(s.review_note)}</div>` : ''}
            ${actionsHtml ? `<div class="sub-actions">${actionsHtml}</div>` : ''}
        </div>`;
}

async function loadMySubmissions() {
    const listEl = document.getElementById('mySubList');
    try {
        const list = await api('GET', '/submissions/mine');
        if (!list.length) {
            listEl.innerHTML = '<div class="account-empty">还没有投稿，点右上角「新投稿」分享你发现的好资源吧～</div>';
            return;
        }
        listEl.innerHTML = list.map(s => subCardHtml(s,
            s.status === 'pending' ? `<button class="gm-btn danger" data-sub-withdraw="${escapeHtml(s.id)}">撤回</button>` : ''
        )).join('');
    } catch (e) {
        listEl.innerHTML = `<div class="account-empty">${escapeHtml(e.message || '加载失败')}</div>`;
    }
}

const SUB_FIELDS = ['subOriginal', 'subTranslated', 'subAuthor', 'subOriginalLink', 'subTranslationLink', 'subAuthorLink', 'subDescription'];

function openSubmitModal() {
    if (!isLoggedIn()) {
        showToast('请先登录后再投稿');
        openLoginModal();
        return;
    }
    if (!isRegularUser()) {
        showToast('管理员请直接用「导入项目」添加');
        return;
    }
    SUB_FIELDS.forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('subCategory').value = 'addon';
    document.getElementById('submitModal').classList.add('show');
    setTimeout(() => document.getElementById('subOriginal').focus(), 100);
}

async function submitSubmission() {
    const v = id => document.getElementById(id).value.trim();
    const body = {
        original: v('subOriginal'),
        translated: v('subTranslated'),
        author: v('subAuthor'),
        category: document.getElementById('subCategory').value,
        originalLink: v('subOriginalLink'),
        translationLink: v('subTranslationLink'),
        authorLink: v('subAuthorLink'),
        description: v('subDescription')
    };
    if (!body.original) { showToast('请填写资源名称'); return; }
    if (!body.originalLink && !body.translationLink) { showToast('原版链接和汉化链接至少填一个'); return; }

    const btn = document.getElementById('subSubmitBtn');
    btn.disabled = true;
    try {
        await api('POST', '/submissions', body);
        document.getElementById('submitModal').classList.remove('show');
        showToast('投稿成功，等待栈主审核～');
        if (currentPage === 'account') loadMySubmissions();
    } catch (e) {
        showToast(e.message || '投稿失败');
    } finally {
        btn.disabled = false;
    }
}

function setupSubmissionEvents() {
    // ---------- 投稿 ----------
    document.getElementById('newSubmissionBtn').addEventListener('click', openSubmitModal);
    document.getElementById('subSubmitBtn').addEventListener('click', submitSubmission);
    document.getElementById('subCancelBtn').addEventListener('click', () => {
        document.getElementById('submitModal').classList.remove('show');
    });
    document.getElementById('mySubList').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-sub-withdraw]');
        if (!btn) return;
        if (!confirm('确定撤回这条投稿吗？')) return;
        try {
            await api('DELETE', `/submissions/mine/${encodeURIComponent(btn.dataset.subWithdraw)}`);
            showToast('已撤回');
            loadMySubmissions();
        } catch (err) { showToast(err.message); }
    });

    document.getElementById('menuMessagesBtn').addEventListener('click', () => {
        document.getElementById('menuDropdown').classList.remove('show');
        showPage('account', 'messages');
    });
    document.getElementById('menuSubmitBtn').addEventListener('click', () => {
        document.getElementById('menuDropdown').classList.remove('show');
        openSubmitModal();
    });

    // 切回页面时刷新未读数
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshUnread();
    });
}
