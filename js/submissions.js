// 我的投稿

// ==================== 我的投稿 ====================
const SUB_STATUS = {
    pending: ['pending', '⏳ 待审核'],
    approved: ['approved', '✅ 已通过'],
    rejected: ['rejected', '✕ 未通过']
};

function subLinksHtml(s) {
    if (s.kind === 'request') {
        return s.author_link ? `<div class="sub-links">链接：${escapeHtml(s.author_link)}</div>` : '';
    }
    const links = [
        ['原版', s.original_link], ['汉化', s.translation_link], ['作者', s.author_link]
    ].filter(([, v]) => v);
    if (!links.length) return '';
    return `<div class="sub-links">${links.map(([k, v]) => `${k}：${escapeHtml(v)}`).join('<br>')}</div>`;
}

function subCardHtml(s, actionsHtml) {
    const [cls, label] = SUB_STATUS[s.status] || SUB_STATUS.pending;
    const isRequest = s.kind === 'request';
    const wants = Number(s.want_count) || 0;
    return `
        <div class="sub-card${isRequest ? ' request' : ''}">
            <div class="sub-head">
                ${isRequest ? '<span class="sub-kind-badge">🙋 求汉化</span>' : ''}
                <span class="sub-name">${escapeHtml(s.original)}${s.translated ? ` <span class="trans">（${escapeHtml(s.translated)}）</span>` : ''}</span>
                <span class="sub-status ${cls}">${isRequest && s.status === 'approved' ? '✅ 已接受' : (isRequest && s.status === 'rejected' ? '✕ 未接受' : label)}</span>
            </div>
            <div class="sub-meta">
                <span>${CATEGORY_LABELS[s.category] || '附加包'}</span>
                ${isRequest ? (wants > 1 || s.status === 'pending' ? `<span class="want-chip">🙋 ${wants || 1} 人想要</span>` : '')
                    : `<span>作者：${escapeHtml(s.author || '佚名')}</span>`}
                ${isAdmin ? `<span>${isRequest ? '提出人' : '投稿人'}：${escapeHtml(s.username)}</span>` : ''}
                <span>${formatTime(s.created_at)}</span>
            </div>
            ${s.description ? `<div class="sub-desc">${escapeHtml(s.description)}</div>` : ''}
            ${subLinksHtml(s)}
            ${s.review_note ? `<div class="sub-note">${s.status === 'rejected' ? (isRequest ? '拒绝原因' : '驳回原因') : '栈主留言'}：${escapeHtml(s.review_note)}</div>` : ''}
            ${actionsHtml ? `<div class="sub-actions">${actionsHtml}</div>` : ''}
        </div>`;
}

async function loadMySubmissions() {
    const listEl = document.getElementById('mySubList');
    try {
        const list = await api('GET', '/submissions/mine');
        if (!list.length) {
            listEl.innerHTML = '<div class="account-empty">还没有投稿，点右上角「新投稿」分享你发现的好资源，或者「求汉化」告诉栈主你想要什么～</div>';
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
let submitKind = 'full';

// 投成品 / 求汉化 切换：求汉化只需要英文名 + 一个链接
function setSubmitKind(kind) {
    submitKind = kind === 'request' ? 'request' : 'full';
    const req = submitKind === 'request';
    const modal = document.getElementById('submitModal');
    modal.classList.toggle('is-request', req);
    modal.querySelectorAll('[data-sub-kind]').forEach(b => {
        const on = b.dataset.subKind === submitKind;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.getElementById('subModalTitle').textContent = req ? '求汉化' : '投稿资源';
    document.getElementById('subKindHint').textContent = req
        ? '想玩但还没有汉化的资源？告诉栈主，接受后会加入待汉化列表，处理结果会通过站内消息通知你。'
        : '分享你找到的汉化资源，审核通过后会上架到展示区。';
    document.getElementById('subAuthorLinkLabel').innerHTML = req
        ? '作者直链<span class="required-mark">*</span> <span class="field-hint">（没有就填原版链接）</span>'
        : '作者直链';
    document.getElementById('subAuthorLink').placeholder = req ? 'https://...' : '可选';
    document.getElementById('subSubmitBtn').textContent = req ? '🙋 提交请求' : '📤 提交投稿';
}

function openSubmitModal(kind) {
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
    setSubmitKind(typeof kind === 'string' ? kind : 'full');
    document.getElementById('submitModal').classList.add('show');
    setTimeout(() => document.getElementById('subOriginal').focus(), 100);
}

async function submitRequest() {
    const v = id => document.getElementById(id).value.trim();
    const body = { kind: 'request', original: v('subOriginal'), link: v('subAuthorLink'), category: document.getElementById('subCategory').value };
    if (!body.original) { showToast('请填写资源的英文名'); return; }
    if (!body.link) { showToast('请填写作者直链（没有就填原版链接）'); return; }
    const btn = document.getElementById('subSubmitBtn');
    btn.disabled = true;
    try {
        const r = await api('POST', '/submissions', body);
        document.getElementById('submitModal').classList.remove('show');
        if (r.merged === 'item') showToast(`这个资源已经在待汉化列表里了，已为你 +1（${r.wantCount} 人想要）`);
        else if (r.merged === 'request') showToast(`已经有人请求过了，已为你 +1（${r.wantCount} 人想要）`);
        else showToast('请求已提交，等待栈主处理～');
        if (currentPage === 'account') loadMySubmissions();
    } catch (e) {
        showToast(e.message || '提交失败');
    } finally {
        btn.disabled = false;
    }
}

async function submitSubmission() {
    if (submitKind === 'request') return submitRequest();
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
    document.getElementById('newSubmissionBtn').addEventListener('click', () => openSubmitModal('full'));
    document.getElementById('newRequestBtn').addEventListener('click', () => openSubmitModal('request'));
    document.getElementById('subKindTabs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-sub-kind]');
        if (b) setSubmitKind(b.dataset.subKind);
    });
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
        openSubmitModal('full');
    });

    // 切回页面时刷新未读数
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshUnread();
    });
}
