// 数据缓存与 API 请求

// ==================== 数据缓存 ====================
function getCachedItems() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { data, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp > CACHE_TTL) return null;
        return data;
    } catch (e) {
        return null;
    }
}

function setCachedItems(data) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    } catch (e) { }
}

function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) { }
}

// ==================== API 调用 ====================
async function loadItems(useCache = true) {
    // 管理员不用缓存，直接拉最新
    if (!isAdmin && useCache) {
        const cached = getCachedItems();
        if (cached) {
            items = cached;
            render();
            // 后台静默刷新，拿到新数据后重新渲染
            fetchFreshItems().then(changed => { if (changed) render(); });
            return;
        }
    }
    await fetchFreshItems();
}

// 后端字段 → 前端字段
function mapItemRow(r) {
    return {
        id: r.id,
        original: r.original,
        translated: r.translated,
        author: r.author,
        authorLink: r.author_link,
        translationLink: r.translation_link,
        originalLink: r.original_link,
        description: r.description,
        detailDesc: r.detail_desc || '',              // 详情页「描述」
        status: r.status,
        category: r.category || 'addon',
        images: r.images || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        contentUpdated: Number(r.content_updated) || Number(r.created_at) || 0,   // 内容最后修改（不含排序）
        mcVersion: r.mc_version || '',                 // 适用版本
        packVersion: r.pack_version || '',             // 包体版本
        authorUpdated: r.author_updated || '',         // 作者更新日期 YYYY-MM-DD
        translationVersion: r.translation_version || '', // 汉化版本
        hot: Number(r.hot) || 0,                       // 近 30 天点击
        ratingAvg: Number(r.rating_avg) || 0,
        ratingCount: Number(r.rating_count) || 0,
        wantCount: Number(r.want_count) || 0,            // 汉化请求「想要」人数（仅管理员接口返回）
        clicks: r.clicks || null,          // 仅管理员接口返回
        expanded: false
    };
}

function itemImages(item) {
    return String(item.images || '').split('\n').map(x => x.trim()).filter(Boolean);
}

// 返回数据是否有变化
async function fetchFreshItems() {
    try {
        const rows = await api('GET', isAdmin ? '/items?all=1' : '/items');
        const expandedIds = new Set(items.filter(i => i.expanded).map(i => i.id));
        const next = rows.map(r => ({ ...mapItemRow(r), expanded: expandedIds.has(r.id) }));
        const strip = list => JSON.stringify(list.map(({ expanded, ...rest }) => rest));
        const changed = strip(next) !== strip(items);
        items = next;
        if (!isAdmin) setCachedItems(items);
        return changed;
    } catch (e) {
        console.error('加载失败', e);
        if (items.length === 0) {
            showToast('加载数据失败，请刷新重试');
            const doneList = document.getElementById('doneList');
            if (doneList && doneList.querySelector('.skeleton-item')) {
                doneList.innerHTML = '<div class="empty-msg">加载失败，请刷新页面重试</div>';
            }
        }
        return false;
    }
}

async function apiCreate(item) {
    const data = await api('POST', '/items', item);
    clearCache();
    return data;
}

async function apiUpdate(id, fields) {
    const data = await api('PUT', `/items/${encodeURIComponent(id)}`, fields);
    clearCache();
    return data;
}

async function apiDelete(id) {
    await api('DELETE', `/items/${encodeURIComponent(id)}`);
    clearCache();
}

async function apiBatchCreate(list) {
    const data = await api('POST', '/items/batch', list);
    clearCache();
    return data;
}

async function apiReorder(list) {
    const data = await api('PUT', '/items/reorder', list);
    clearCache();
    return data;
}

async function apiBatchUpdate(list) {
    const data = await api('PUT', '/items/batch-update', list);
    clearCache();
    return data;
}
