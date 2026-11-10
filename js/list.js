// 列表渲染、条目操作、反馈

// ==================== 渲染 ====================
function filterItems(list) {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(item => {
        const orig = (item.original || '').toLowerCase();
        const trans = (item.translated || '').toLowerCase();
        const author = (item.author || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const ver = (item.mcVersion || '').toLowerCase();
        return orig.includes(q) || trans.includes(q) || author.includes(q) || desc.includes(q) || ver.includes(q);
    });
}

function filterDoneItems(list) {
    let result = list;
    // 先按分类筛选
    if (currentCategory && currentCategory !== 'all') {
        result = result.filter(item => (item.category || 'addon') === currentCategory);
    }
    // 再按搜索关键词筛选（与待汉化共用同一套搜索规则）
    return filterItems(result);
}

function render() {
    const allPending = items.filter(i => i.status !== STATUS.DONE);
    const doing = allPending.filter(i => i.status === STATUS.DOING);
    const todo = allPending.filter(i => i.status !== STATUS.DOING);
    const sortedPending = [...doing, ...todo];

    const allDone = items.filter(i => i.status === STATUS.DONE);

    const filteredPending = filterItems(sortedPending);             // 待汉化：只搜索
    const filteredDone = sortDoneItems(filterDoneItems(allDone));   // 已汉化：搜索 + 分类 + 排序

    document.getElementById('pendingCount').textContent = allPending.length;
    document.getElementById('doneCount').textContent = allDone.length;

    // 访客看不到待汉化模块
    document.getElementById('pendingModule').style.display = isAdmin ? '' : 'none';

    // 展示区分批显示：筛选条件变化时回到第一批
    const viewKey = [searchQuery, currentCategory, currentSort, doneView].join('|');
    if (viewKey !== lastDoneViewKey) {
        doneShown = DONE_PAGE_SIZE;
        lastDoneViewKey = viewKey;
    }
    const visibleDone = filteredDone.slice(0, doneShown);

    renderList('pendingList', filteredPending, false);
    renderList('doneList', visibleDone, true);
    updateLoadMore(filteredDone.length - visibleDone.length);
    updateViewSwitch();

    updateModuleStyles();

    // 数据变化时同步刷新正在看的详情页
    if (currentPage === 'item' && currentItemId) renderItemPage(currentItemId);
}

function updateModuleStyles() {
    const pendingModule = document.getElementById('pendingModule');
    const doneModule = document.getElementById('doneModule');
    const pendingToggle = document.getElementById('pendingToggle');
    const doneToggle = document.getElementById('doneToggle');

    // 处理待汉化模块（展示区始终完整显示，用「显示更多」分批加载）
    handleModuleToggle(pendingModule, pendingToggle, moduleExpanded.pending);
}

function handleModuleToggle(moduleEl, toggleBtn, expanded) {
    const bodyEl = moduleEl.querySelector('.module-body');
    if (!bodyEl) return;

    if (expanded) {
        // 展开
        moduleEl.classList.add('module-expanded');
        toggleBtn.textContent = '▲';
        // 先量一下真实高度，赋给它作为动画终点
        const targetHeight = bodyEl.scrollHeight;
        bodyEl.style.maxHeight = targetHeight + 'px';
        // 动画结束后让它自适应
        clearTimeout(bodyEl._expandTimer);
        bodyEl._expandTimer = setTimeout(() => {
            if (moduleEl.classList.contains('module-expanded')) {
                bodyEl.style.maxHeight = 'none';
            }
        }, 370);
    } else {
        // 收起
        // 如果当前是 none，先恢复成具体高度才能过渡
        if (bodyEl.style.maxHeight === 'none') {
            bodyEl.style.maxHeight = bodyEl.scrollHeight + 'px';
            void bodyEl.offsetHeight;
        }
        moduleEl.classList.remove('module-expanded');
        toggleBtn.textContent = '▼';
        // 移除 inline style，让 CSS 的 260px 生效
        bodyEl.style.maxHeight = '';
    }
}

function renderList(containerId, list, isDoneSection) {
    const container = document.getElementById(containerId);
    // 展示区按当前视图显示网格或列表；待汉化（管理员）始终是列表
    const view = isDoneSection ? doneView : 'list';
    container.classList.toggle('view-grid', view === 'grid');
    container.classList.toggle('view-list', view === 'list');

    if (!list.length) {
        let msg = searchQuery ? '没有匹配的搜索结果' : (isDoneSection ? '暂无已汉化项目' : '还没有项目');
        container.innerHTML = `<div class="empty-msg">${msg}</div>`;
        return;
    }

    // 拖动排序只在列表视图 + 默认排序下可用；展开编辑链接只在列表视图
    const canDrag = isAdmin && (!isDoneSection || (view === 'list' && currentSort === 'default'));
    const canExpand = isAdmin && view === 'list';

    let html = '';
    list.forEach(item => {
        const id = escapeHtml(item.id);
        const href = `#item/${encodeURIComponent(item.id)}`;
        const orig = item.original || '未知';
        const trans = item.translated || '';
        const author = item.author || '佚名';
        const status = item.status || STATUS.TODO;
        const isDone = status === STATUS.DONE;
        const isDoing = status === STATUS.DOING;
        const cat = item.category || 'addon';
        const cover = itemImages(item)[0] || '';

        const statusIcon = isDone ? '' : `<span class="status-icon ${isDoing ? 'in-progress' : ''}" data-action="cycle-status" data-id="${id}" title="点击切换状态">${isDoing ? '⏳' : '□'}</span>`;

        const sub = trans
            ? `<div class="card-sub" title="${escapeHtml(trans)}">${escapeHtml(trans)}</div>`
            : (isAdmin && isDone ? '<div class="card-sub muted">未填写中译名</div>' : '');

        const admin = isAdmin ? `
                <div class="card-admin">
                    ${canDrag ? `<span class="drag-handle" data-id="${id}" title="按住拖动排序">⋮⋮</span>` : ''}
                    ${statusIcon}
                    <span class="card-admin-spacer"></span>
                    <button class="edit-icon-btn" data-action="edit-item" data-id="${id}" title="编辑">✏️</button>
                    ${canExpand ? `<button class="expand-btn" data-action="expand" data-id="${id}" title="展开编辑链接">${item.expanded ? '▲' : '▼'}</button>` : ''}
                </div>` : '';

        const details = canExpand ? `<div class="item-details${item.expanded ? ' show' : ''}" data-details-id="${id}"
                    ${item.expanded ? 'data-loaded="1" style="max-height:none"' : ''}>${item.expanded ? buildDetailsHtml(item) : ''}</div>` : '';

        html += `
            <div class="item card${isDone ? '' : ' pending'}" data-id="${id}">
                <div class="card-cover cat-${cat}${cover ? '' : ' no-img'}">
                    ${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('no-img'); this.remove()">` : ''}
                    <span class="card-cover-ph" aria-hidden="true">${CATEGORY_EMOJI[cat] || '🧩'}</span>
                    ${isDoneSection ? `<span class="card-cat">${CATEGORY_LABELS[cat] || '附加包'}</span>` : ''}
                    ${isDoneSection && item.mcVersion ? `<span class="card-ver" title="适用版本 ${escapeHtml(item.mcVersion)}">${escapeHtml(item.mcVersion)}</span>` : ''}
                </div>
                <div class="card-body">
                    <div class="item-name"><a class="item-link card-link" href="${href}" data-item-link="${id}" title="${escapeHtml(orig)}"><span class="orig">${escapeHtml(orig)}</span></a></div>
                    ${sub}
                    <div class="card-meta">
                        <span class="author-name" title="作者：${escapeHtml(author)}">${escapeHtml(author)}</span>
                        ${isDoneSection ? itemStatBadges(item) : ''}
                    </div>
                </div>${admin}
                ${details}
            </div>
        `;
    });
    container.innerHTML = html;
}

// ---------- 视图切换与分批显示 ----------
function updateLoadMore(remaining) {
    const btn = document.getElementById('doneMore');
    if (remaining > 0) {
        btn.textContent = `显示更多（还有 ${remaining} 个）`;
        btn.style.display = '';
    } else {
        btn.style.display = 'none';
    }
}

function updateViewSwitch() {
    document.querySelectorAll('#viewSwitch .view-btn').forEach(b => {
        const active = b.dataset.view === doneView;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function setDoneView(view) {
    if (view !== 'grid' && view !== 'list') return;
    if (view === doneView) return;
    doneView = view;
    try { localStorage.setItem(VIEW_KEY, view); } catch (e) { }
    render();
    updateSortBar();
}

function buildDetailsHtml(item) {
    const isDone = item.status === STATUS.DONE;
    let detailsHtml = '';

    if (item.description) {
        detailsHtml += `<div class="item-description">${escapeHtml(item.description)}</div>`;
    }

    const linkFields = isDone
        ? [
            { label: '作者直链', field: 'authorLink' },
            { label: '汉化链接', field: 'translationLink' },
            { label: '原版链接', field: 'originalLink' }
        ]
        : [{ label: '原版链接', field: 'originalLink' }];

    linkFields.forEach(({ label, field }) => {
        const val = item[field] || '';
        const readonlyHtml = isAdmin
            ? `<input type="text" class="detail-input" data-field="${field}" data-id="${escapeHtml(item.id)}" value="${escapeHtml(val)}" placeholder="https://..." autocomplete="off" name="tianji-link-${field}" data-lpignore="true" data-1p-ignore="true" data-form-type="other">`
            : `<div class="detail-readonly">${val ? escapeHtml(val) : '<span style="color:var(--text-light);">未填写</span>'}</div>`;
        const clickN = isAdmin && item.clicks ? (item.clicks[field] || 0) : null;
        const clickHtml = clickN !== null && val
            ? `<span class="click-count" title="累计点击（跳转 + 复制）">👆 ${clickN}</span>` : '';
        detailsHtml += `
    <div class="detail-row">
        <span class="detail-label">${label}${clickHtml}</span>
        ${readonlyHtml}
        <div class="btn-group">
            <button class="copy-btn" data-copy="${field}" data-id="${escapeHtml(item.id)}">📋 复制</button>
            <a class="open-btn" href="javascript:void(0)" data-action="open-link" data-id="${escapeHtml(item.id)}" data-field="${field}">🔗 跳转</a>
        </div>
    </div>
`;
    });

    return detailsHtml;
}

// ==================== 操作 ====================
async function cycleStatus(id) {
    if (!isAdmin) return;
    const item = items.find(i => i.id === id);
    if (!item) return;
    const current = item.status || STATUS.TODO;

    let newStatus;
    if (current === STATUS.TODO) newStatus = STATUS.DOING;
    else if (current === STATUS.DOING) newStatus = STATUS.DONE;
    else newStatus = STATUS.TODO;

    try {
        await apiUpdate(id, { status: newStatus });
        item.status = newStatus;

        // 重置详情状态（因为状态变了，详情内容可能不一样，需要重新注入）
        const itemEl = document.querySelector(`.item[data-id="${id}"]`);
        if (itemEl) {
            const detailsEl = itemEl.querySelector('.item-details');
            if (detailsEl) {
                detailsEl.classList.remove('show');
                detailsEl.style.maxHeight = '';
                detailsEl.innerHTML = '';
                delete detailsEl.dataset.loaded;
                clearTimeout(detailsEl._expandTimer);
                clearTimeout(detailsEl._collapseTimer);
            }
        }
        item.expanded = false;

        render();

        // 如果变成已汉化但没中译名，自动展开编辑弹窗
        if (newStatus === STATUS.DONE && !item.translated) {
            setTimeout(() => openEditModal(id), 100);
        }
    } catch (e) {
        showToast(e.message || '操作失败');
    }
}

function toggleExpand(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;

    const itemEl = document.querySelector(`.item[data-id="${id}"]`);
    if (!itemEl) return;
    const detailsEl = itemEl.querySelector('.item-details');
    if (!detailsEl) return;

    const isOpening = !item.expanded;
    item.expanded = isOpening;

    if (isOpening) {
        // 1. 先注入内容（如果还没注入过）
        if (!detailsEl.dataset.loaded) {
            detailsEl.innerHTML = buildDetailsHtml(item);
            detailsEl.dataset.loaded = '1';
        }
        // 2. 触发动画：先让 max-height 有值，再在下一帧加 .show
        detailsEl.classList.remove('show');
        // 强制 reflow，确保 transition 能触发
        void detailsEl.offsetHeight;
        detailsEl.classList.add('show');

        // 3. 动画结束后把 max-height 设为 none，让内容自适应（避免超高内容被截断）
        clearTimeout(detailsEl._expandTimer);
        detailsEl._expandTimer = setTimeout(() => {
            if (detailsEl.classList.contains('show')) {
                detailsEl.style.maxHeight = 'none';
            }
        }, 350);
    } else {
        // 收起：先把 max-height 从 none 恢复成具体值，才能过渡
        if (detailsEl.style.maxHeight === 'none') {
            detailsEl.style.maxHeight = detailsEl.scrollHeight + 'px';
            // 强制 reflow
            void detailsEl.offsetHeight;
        }
        detailsEl.style.maxHeight = '';
        detailsEl.classList.remove('show');

        // 收起动画结束后，可以清空内容释放 DOM（可选）
        clearTimeout(detailsEl._collapseTimer);
        detailsEl._collapseTimer = setTimeout(() => {
            if (!detailsEl.classList.contains('show')) {
                // 保留 dataset.loaded 状态，避免再次展开时重复注入
                // 如果想进一步省内存，这里可以清空 innerHTML 并删掉 data-loaded
            }
        }, 350);
    }
}

function openFeedback(id, name) {
    if (!isLoggedIn()) {
        showToast('登录后才能反馈哦');
        openLoginModal();
        return;
    }
    currentFeedbackItem.id = id;
    currentFeedbackItem.name = name;
    document.getElementById('feedbackItemName').value = name;
    document.getElementById('feedbackContent').value = '';
    document.getElementById('feedbackModal').classList.add('show');
    setTimeout(() => document.getElementById('feedbackContent').focus(), 100);
}

function setupListEvents() {
    document.getElementById('viewSwitch').addEventListener('click', (e) => {
        const b = e.target.closest('.view-btn');
        if (b) setDoneView(b.dataset.view);
    });
    document.getElementById('doneMore').addEventListener('click', () => {
        doneShown += DONE_PAGE_SIZE;
        render();
    });

    document.getElementById('editStatus').addEventListener('change', syncEditTranslatedField);

    const app = document.querySelector('.app');

    // ========== 反馈功能 ==========
    app.addEventListener('click', (e) => {
        const feedbackBtn = e.target.closest('[data-action="feedback"]');
        if (!feedbackBtn) return;
        e.preventDefault();
        e.stopPropagation();
        openFeedback(feedbackBtn.dataset.id, feedbackBtn.dataset.name);
    });

    document.getElementById('feedbackCancelBtn').addEventListener('click', () => {
        document.getElementById('feedbackModal').classList.remove('show');
    });

    document.getElementById('feedbackSubmitBtn').addEventListener('click', async () => {
        const content = document.getElementById('feedbackContent').value.trim();
        if (!content) { showToast('请填写反馈内容'); return; }
        if (content.length > 500) { showToast('反馈内容不能超过 500 字'); return; }
        const btn = document.getElementById('feedbackSubmitBtn');
        btn.disabled = true;
        try {
            await api('POST', '/feedback', {
                itemId: currentFeedbackItem.id,
                itemName: currentFeedbackItem.name,
                content
            });
            showToast('反馈已提交，处理后会通过消息通知你');
            document.getElementById('feedbackModal').classList.remove('show');
        } catch (err) {
            showToast(err.message || '提交失败');
        } finally {
            btn.disabled = false;
        }
    });

    // 主题切换
    document.getElementById('themeToggleBtn').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
    });
}
