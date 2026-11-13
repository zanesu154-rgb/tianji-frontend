// 资源详情页与路由辅助

// ==================== 资源详情页 ====================
const DEFAULT_TITLE = document.title;
const CATEGORY_EMOJI = { addon: '🧩', texture: '🎨', shader: '✨', map: '🗺️' };
const STATUS_LABELS = { todo: '待汉化', doing: '汉化中', done: '已汉化' };
let currentItemId = null;
let itemPageImages = [];
let itemPageImageIdx = 0;
let itemPageRenderToken = 0;

function itemShareUrl(id) {
    return location.origin + location.pathname + '#item/' + encodeURIComponent(id);
}

// 分享链接：GitHub Pages 上为每个资源生成的静态分享页 s/<id>.html
// （QQ 会拦截 railway.app 域名的链接，所以分享页放在网站自己的域名下）
// 页面里有该资源的标题/简介/封面，聊天软件据此生成卡片；打开后自动跳到详情页。
// 新资源的分享页要等下次部署才生成，在此之前链接由 404.html 兜底跳到详情页。
function itemPreviewUrl(item) {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    return item.status === STATUS.DONE
        ? `${base}s/${encodeURIComponent(item.id)}.html`
        : itemShareUrl(item.id);   // 未上架的只有管理员能看，不生成分享页
}

// 秒级时间戳 → YYYY/MM/DD
function fmtDate(sec) {
    if (!sec) return '';
    const d = new Date(Number(sec) * 1000);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// 简介里的网址变成可点击链接（同样走外链提醒）
function linkifyText(text) {
    return escapeHtml(text).replace(/https?:\/\/[^\s<>"']+/g,
        url => `<a data-ip-url="${url}">${url}</a>`);
}

async function fetchSingleItem(id) {
    try {
        return mapItemRow(await api('GET', `/items/${encodeURIComponent(id)}`));
    } catch (e) {
        return null;
    }
}

function relatedItems(item, n = 6) {
    const cat = item.category || 'addon';
    const pool = items.filter(i => i.status === STATUS.DONE && (i.category || 'addon') === cat);
    const idx = pool.findIndex(i => i.id === item.id);
    // 从当前项目之后开始取，看完一个能顺着看下一个
    const ordered = idx >= 0 ? pool.slice(idx + 1).concat(pool.slice(0, idx)) : pool;
    return ordered.filter(i => i.id !== item.id).slice(0, n);
}

// 版本小框：只显示值，不写文字；悬停/长按可看说明
function versionChip(value, kind, tip) {
    if (!value) return '';
    return `<span class="ip-ver ip-ver-${kind}" title="${tip}：${escapeHtml(value)}" aria-label="${tip} ${escapeHtml(value)}">${escapeHtml(value)}</span>`;
}

// 2026-03-05 → 2026/03/05
function fmtIsoDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? `${m[1]}/${m[2]}/${m[3]}` : (s || '');
}

function buildItemPageHtml(item) {
    const imgs = itemImages(item);
    const isDone = item.status === STATUS.DONE;
    const title = item.original || '未知';
    const cat = item.category || 'addon';

    const gallery = imgs.length ? `
        <div class="ip-gallery">
            <button class="ip-cover" data-ip-cover title="查看大图">
                <img id="ipCoverImg" src="${escapeHtml(imgs[0])}" alt="${escapeHtml(title)}" referrerpolicy="no-referrer"
                    onerror="this.closest('.ip-gallery').style.display='none'">
            </button>
            ${imgs.length > 1 ? `<div class="ip-thumbs">${imgs.map((u, i) => `
                <button class="ip-thumb ${i === 0 ? 'active' : ''}" data-ip-thumb="${i}">
                    <img src="${escapeHtml(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()">
                </button>`).join('')}</div>` : ''}
        </div>` : '';

    const links = [
        ['translationLink', '⬇ 汉化版下载', true],
        ['authorLink', '作者直链', false],
        ['originalLink', '原版下载', false]
    ].filter(([f]) => (item[f] || '').trim());

    const clickBadge = f => (isAdmin && item.clicks)
        ? ` <span class="click-count" title="累计点击（跳转 + 复制）">👆 ${item.clicks[f] || 0}</span>` : '';

    const downloads = links.length ? links.map(([f, label, primary]) => `
        <div class="ip-dl ${primary ? 'primary' : ''}">
            <div class="ip-dl-info">
                <div class="ip-dl-label">${label}${clickBadge(f)}</div>
                <div class="ip-dl-url">${escapeHtml(item[f])}</div>
            </div>
            <div class="ip-dl-btns">
                <button class="ip-dl-copy" data-ip-copy="${f}">📋 复制</button>
                <button class="ip-dl-go" data-ip-open="${f}">🔗 前往</button>
            </div>
        </div>`).join('') : '<div class="ip-empty">暂无下载链接</div>';

    const author = escapeHtml(item.author || '佚名');

    const related = isDone ? relatedItems(item) : [];
    const relatedHtml = related.length ? `
        <div class="ip-related-wrap">
            <h2>更多${CATEGORY_LABELS[cat] || ''}</h2>
            <div class="ip-related">${related.map(r => {
                const c = itemImages(r)[0];
                return `
                <a class="ip-rel-card" href="#item/${encodeURIComponent(r.id)}" data-item-link="${escapeHtml(r.id)}">
                    <div class="ip-rel-thumb">${c
                        ? `<img src="${escapeHtml(c)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${CATEGORY_EMOJI[r.category || 'addon'] || '🧩'}'))">`
                        : (CATEGORY_EMOJI[r.category || 'addon'] || '🧩')}</div>
                    <div class="ip-rel-body">
                        <div class="ip-rel-name">${escapeHtml(r.original)}</div>
                        <div class="ip-rel-sub">${escapeHtml(r.translated || r.author || '')}</div>
                    </div>
                </a>`;
            }).join('')}</div>
        </div>` : '';

    return `
        <article class="ip-card">
            ${gallery}
            <div class="ip-tags">
                <span class="ip-tag">${CATEGORY_EMOJI[cat] || ''} ${CATEGORY_LABELS[cat] || '附加包'}</span>
                ${versionChip(item.mcVersion, 'mc', '适用版本')}
                ${!isDone ? `<span class="ip-tag muted">${STATUS_LABELS[item.status] || ''}</span>` : ''}
            </div>
            <h1 class="ip-title">${escapeHtml(title)}</h1>
            ${item.translated || item.packVersion ? `<div class="ip-subtitle">${item.translated ? `<span>${escapeHtml(item.translated)}</span>` : ''}${versionChip(item.packVersion, 'pack', '包体版本')}</div>` : ''}
            <div class="ip-byline"><span>作者：${author}</span></div>
            <div class="ip-actions">
                ${links.length ? '<button class="gm-btn ip-jump-btn" data-ip-jump>⬇ 前往下载</button>' : ''}
                <button class="gm-btn" data-ip-share>🔗 分享</button>
                ${!isAdmin && isDone ? `<button class="gm-btn" data-ip-feedback>💬 反馈问题</button>` : ''}
                ${isAdmin ? `<button class="gm-btn" data-ip-edit>✏️ 编辑</button>` : ''}
            </div>

            ${item.translationVersion ? `<div class="ip-ver-row">${versionChip(item.translationVersion, 'trans', '汉化版本')}</div>` : ''}

            <section class="ip-section">
                <h2>简介</h2>
                ${item.description ? `<div class="ip-desc">${linkifyText(item.description)}</div>` : '<div class="ip-empty">暂无简介</div>'}
            </section>

            ${item.detailDesc ? `<section class="ip-section">
                <h2>描述</h2>
                <div class="ip-desc">${linkifyText(item.detailDesc)}</div>
            </section>` : ''}

            <section class="ip-section" id="ipDownloads">
                <h2>下载</h2>
                <div class="ip-downloads">${downloads}</div>
            </section>

            ${isDone ? ratingSectionHtml(item) : ''}

            <div class="ip-meta">
                ${item.authorUpdated ? `<span>作者更新于 ${fmtIsoDate(item.authorUpdated)}</span>` : ''}
                ${item.contentUpdated ? `<span>本站更新于 ${fmtDate(item.contentUpdated)}</span>` : ''}
                ${item.createdAt ? `<span>收录于 ${fmtDate(item.createdAt)}</span>` : ''}
            </div>
        </article>
        ${relatedHtml}
        ${isDone || isAdmin ? commentsSectionHtml() : ''}`;
}

async function renderItemPage(id) {
    const token = ++itemPageRenderToken;
    currentItemId = id;
    const root = document.getElementById('itemPageContent');
    let item = items.find(i => i.id === id);
    if (!item) {
        root.innerHTML = `<article class="ip-card">
            <div class="ip-skeleton" style="height:200px;border-radius:18px;"></div>
            <div class="ip-skeleton" style="width:60%;height:1.6rem;"></div>
            <div class="ip-skeleton" style="width:40%;"></div>
            <div class="ip-skeleton" style="width:90%;"></div></article>`;
        item = await fetchSingleItem(id);
        itemPageFetched = item;
        if (token !== itemPageRenderToken) return;   // 期间又切换了页面
    }
    if (!item) {
        document.title = '资源不存在 - 天际译栈';
        root.innerHTML = `<article class="ip-card" style="text-align:center;padding:3rem 1rem;">
            <div style="font-size:2.4rem;">🔍</div>
            <h1 class="ip-title" style="font-size:1.2rem;margin-top:0.6rem;">资源不存在或已下架</h1>
            <p class="ip-empty" style="margin-top:0.5rem;">可以回到列表搜索看看</p>
            <button class="btn btn-primary" style="margin-top:1rem;" data-ip-home>返回列表</button>
        </article>`;
        return;
    }
    document.title = `${item.translated || item.original} - 天际译栈`;
    itemPageImages = itemImages(item);
    itemPageImageIdx = 0;
    root.innerHTML = buildItemPageHtml(item);
    if (document.getElementById('ipComments')) loadComments(item.id);
}

// 直接打开分享链接时列表可能还没加载，用单独请求到的条目兜底，保证页面上的按钮立即可用
let itemPageFetched = null;

function getCurrentPageItem() {
    return items.find(i => i.id === currentItemId)
        || (itemPageFetched && itemPageFetched.id === currentItemId ? itemPageFetched : null);
}

// ---------- 图片 ----------
function selectItemImage(idx) {
    if (!itemPageImages.length) return;
    itemPageImageIdx = (idx + itemPageImages.length) % itemPageImages.length;
    const img = document.getElementById('ipCoverImg');
    if (img) img.src = itemPageImages[itemPageImageIdx];
    document.querySelectorAll('.ip-thumb').forEach(t => {
        t.classList.toggle('active', Number(t.dataset.ipThumb) === itemPageImageIdx);
    });
}

function openLightbox(idx) {
    if (!itemPageImages.length) return;
    itemPageImageIdx = idx;
    updateLightbox();
    document.getElementById('lightbox').classList.add('show');
}

function updateLightbox() {
    const n = itemPageImages.length;
    document.getElementById('lightboxImg').src = itemPageImages[itemPageImageIdx];
    document.getElementById('lbCount').textContent = n > 1 ? `${itemPageImageIdx + 1} / ${n}` : '';
    document.getElementById('lbPrev').style.display = n > 1 ? '' : 'none';
    document.getElementById('lbNext').style.display = n > 1 ? '' : 'none';
}

function stepLightbox(d) {
    const n = itemPageImages.length;
    if (n < 2) return;
    itemPageImageIdx = (itemPageImageIdx + d + n) % n;
    updateLightbox();
    selectItemImage(itemPageImageIdx);
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('show');
}

// 顶部「前往下载」：平滑滚动到下载区并短暂高亮
function jumpToDownloads() {
    const sec = document.getElementById('ipDownloads');
    if (!sec) return;
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const box = sec.querySelector('.ip-downloads');
    if (box) {
        box.classList.remove('ip-flash');
        void box.offsetWidth;   // 重新触发动画
        box.classList.add('ip-flash');
    }
}

// ---------- 分享 ----------
// 只分享链接本身：聊天软件收到「单独的链接」才会抓取页面生成卡片，夹带文字会变成普通文本消息
let shareTarget = null;

function shareSummary(item) {
    const text = String(item.description || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    const summary = text.length > 60 ? text.slice(0, 60) + '…' : text;
    return summary || `${CATEGORY_LABELS[item.category || 'addon'] || '附加包'}汉化版下载 · 作者：${item.author || '佚名'}`;
}

function shareItem(item) {
    shareTarget = { url: itemPreviewUrl(item), item };
    const title = item.translated ? `${item.translated}（${item.original}）` : item.original;
    const cover = itemImages(item)[0] || '';
    document.getElementById('sharePreview').innerHTML = `
        <div class="share-preview-text">
            <div class="share-preview-title">${escapeHtml(title)} - 天际译栈</div>
            <div class="share-preview-desc">${escapeHtml(shareSummary(item))}</div>
            <div class="share-preview-site">🌌 天际译栈</div>
        </div>
        <div class="share-preview-img">${cover
            ? `<img src="${escapeHtml(cover)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🌌'}))">`
            : '<span>🌌</span>'}</div>`;
    document.getElementById('shareUrl').textContent = shareTarget.url;
    document.getElementById('shareSystemBtn').style.display = navigator.share ? '' : 'none';
    document.getElementById('shareModal').classList.add('show');
}

function closeShareModal() {
    document.getElementById('shareModal').classList.remove('show');
}

function setupShareEvents() {
    document.getElementById('shareCopyBtn').addEventListener('click', () => {
        if (!shareTarget) return;
        const url = shareTarget.url;
        const done = () => { showToast('链接已复制，单独发送即可显示为卡片'); closeShareModal(); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done).catch(() => { fallbackCopy(url); closeShareModal(); });
        } else {
            fallbackCopy(url);
            closeShareModal();
        }
    });
    document.getElementById('shareSystemBtn').addEventListener('click', async () => {
        if (!shareTarget || !navigator.share) return;
        try {
            // 只传 url，不传 text：接收方（QQ 等）才会把它当作链接卡片
            await navigator.share({ url: shareTarget.url });
            closeShareModal();
        } catch (e) {
            if (!e || e.name !== 'AbortError') showToast('当前浏览器不支持系统分享，请复制链接');
        }
    });
    document.getElementById('shareCloseBtn').addEventListener('click', closeShareModal);
    const modal = document.getElementById('shareModal');
    let downOnOverlay = false;
    modal.addEventListener('pointerdown', (e) => { downOnOverlay = e.target === modal; });
    modal.addEventListener('click', (e) => {
        if (e.target === modal && downOnOverlay) closeShareModal();
        downOnOverlay = false;
    });
}

// ---------- 路由 ----------
// #item/<id> 详情页；#account[/分区] 账户中心；其他为主页
function parseRoute() {
    const h = location.hash;
    if (h.startsWith('#item/')) {
        return { page: 'item', id: decodeURIComponent(h.slice(6)) };
    }
    if (h.startsWith('#account')) return { page: 'account', section: h.split('/')[1] || 'profile' };
    if (h === '#addons' || h.startsWith('#addons/')) return { page: 'addons', arg: decodeURIComponent(h.slice(7).replace(/^\//, '')) };
    return { page: 'home' };
}

// 站内打开详情页：记录层级，「返回列表」可以一次回到列表原位置
function openItemPage(id) {
    const depth = (history.state && history.state.itemDepth) || 0;
    history.pushState({ itemDepth: depth + 1 }, '', '#item/' + encodeURIComponent(id));
    routeFromLocation();
}

function goBackToList() {
    const depth = (history.state && history.state.itemDepth) || 0;
    if (depth > 0) {
        history.go(-depth);   // 触发 popstate → 回到主页
    } else {
        // 直接从分享链接进入：没有可以后退的列表页
        history.replaceState(null, '', location.pathname + location.search);
        showPage('home');
    }
}

function routeFromLocation() {
    const r = parseRoute();
    if (r.page === 'item') {
        showPage('item', r.id);
    } else if (r.page === 'account') {
        if (currentPage !== 'account') showPage('account', r.section);
    } else if (r.page === 'addons') {
        showPage('addons', r.arg);
    } else if (currentPage !== 'home') {
        showPage('home');
    }
}

function setupItemPageEvents() {
    // ---------- 资源详情页 ----------
    // 站内的详情链接用 pushState 打开（Ctrl/⌘ 点击仍可在新标签页打开）
    document.addEventListener('click', (e) => {
        const link = e.target.closest('[data-item-link]');
        if (!link || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        openItemPage(link.dataset.itemLink);
    }, true);

    window.addEventListener('popstate', routeFromLocation);
    window.addEventListener('hashchange', routeFromLocation);

    document.getElementById('itemBackBtn').addEventListener('click', goBackToList);

    document.getElementById('pageItem').addEventListener('click', (e) => {
        const item = getCurrentPageItem();
        const t = e.target;
        if (t.closest('[data-ip-home]')) { goBackToList(); return; }
        if (!item) return;

        const thumb = t.closest('[data-ip-thumb]');
        if (thumb) { selectItemImage(Number(thumb.dataset.ipThumb)); return; }
        if (t.closest('[data-ip-cover]')) { openLightbox(itemPageImageIdx); return; }

        const open = t.closest('[data-ip-open]');
        if (open) { openLink(item.id, open.dataset.ipOpen); return; }

        const copy = t.closest('[data-ip-copy]');
        if (copy) {
            const val = item[copy.dataset.ipCopy] || '';
            copyText(val);
            if (val) trackClick(item.id, copy.dataset.ipCopy, 'copy');
            return;
        }

        const url = t.closest('[data-ip-url]');
        if (url) {
            const href = url.dataset.ipUrl;
            showExternalWarning(href, () => window.open(href, '_blank', 'noopener,noreferrer'));
            return;
        }

        const star = t.closest('[data-ip-star]');
        if (star) { rateItem(item.id, Number(star.dataset.ipStar)); return; }
        if (t.closest('[data-ip-unrate]')) { rateItem(item.id, 0); return; }

        if (t.closest('[data-ip-jump]')) { jumpToDownloads(); return; }
        if (t.closest('[data-ip-share]')) { shareItem(item); return; }
        if (t.closest('[data-ip-feedback]')) { focusCommentBox(true); return; }
        if (t.closest('[data-ip-edit]')) { openEditModal(item.id); return; }
    });

    // 大图查看
    document.getElementById('lbClose').addEventListener('click', closeLightbox);
    document.getElementById('lbPrev').addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(-1); });
    document.getElementById('lbNext').addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(1); });
    document.getElementById('lightbox').addEventListener('click', (e) => {
        if (e.target.id === 'lightbox') closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('lightbox').classList.contains('show')) return;
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') stepLightbox(-1);
        else if (e.key === 'ArrowRight') stepLightbox(1);
    });
    // 手机上左右滑动切换图片
    let lbTouchX = null;
    document.getElementById('lightbox').addEventListener('touchstart', (e) => { lbTouchX = e.touches[0].clientX; }, { passive: true });
    document.getElementById('lightbox').addEventListener('touchend', (e) => {
        if (lbTouchX === null) return;
        const dx = e.changedTouches[0].clientX - lbTouchX;
        lbTouchX = null;
        if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
    });

    // 账户中心退出登录
}
