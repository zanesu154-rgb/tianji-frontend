// 栈主推荐：首页大图轮播 + 汉化中数量
// - 管理员在编辑弹窗勾选「栈主推荐」加入轮播，按加入时间排序
// - 搜索时、翻到第 2 页以后隐藏
// - 自动轮换（鼠标悬停 / 页面不可见时暂停），手机可左右滑动
const FEATURED_INTERVAL = 6000;
const ft = { list: [], index: 0, sig: '', timer: null, paused: false };

function featuredCover(item) {
    return String(item.images || '').split('\n').map(x => x.trim()).find(Boolean) || '';
}

function featuredSlideHtml(item, i) {
    const cover = featuredCover(item);
    const name = item.translated || item.original;
    const sub = item.translated ? item.original : '';
    const meta = [
        `<span>${CATEGORY_EMOJI[item.category] || '🧩'} ${CATEGORY_LABELS[item.category] || '附加包'}</span>`,
        item.mcVersion ? `<span>适用 ${escapeHtml(item.mcVersion)}</span>` : '',
        item.ratingCount ? `<span>★ ${item.ratingAvg.toFixed(1)}</span>` : '',
        item.testing ? '<span>🧪 测试中</span>' : ''
    ].join('');
    return `<a class="ft-slide${cover ? '' : ' no-cover'} cat-${escapeHtml(item.category || 'addon')}" href="#item/${encodeURIComponent(item.id)}"
            role="group" aria-roledescription="slide" aria-label="${i + 1} / ${ft.list.length}：${escapeHtml(name)}" data-ft-index="${i}" draggable="false">
        ${cover ? `<img class="ft-bg" src="${escapeHtml(cover)}" alt="" referrerpolicy="no-referrer" draggable="false" ${i ? 'loading="lazy"' : ''}
            onerror="this.closest('.ft-slide').classList.add('no-cover'); this.remove();">` : ''}
        <span class="ft-emoji" aria-hidden="true">${CATEGORY_EMOJI[item.category] || '🧩'}</span>
        <div class="ft-shade"></div>
        <div class="ft-content">
            <span class="ft-badge">⭐ 栈主推荐</span>
            <h3 class="ft-title">${escapeHtml(name)}</h3>
            ${sub ? `<div class="ft-sub">${escapeHtml(sub)}</div>` : ''}
            ${item.description ? `<p class="ft-desc">${escapeHtml(item.description)}</p>` : ''}
            <div class="ft-meta">${meta}</div>
            <span class="ft-cta">查看详情 →</span>
        </div>
        ${isAdmin ? `<button class="ft-remove" data-ft-remove="${escapeHtml(item.id)}" title="移出推荐">✕ 移出推荐</button>` : ''}
    </a>`;
}

function renderFeatured(allDone) {
    const box = document.getElementById('featuredHero');
    const list = allDone.filter(i => i.featured > 0).sort((a, b) => a.featured - b.featured);
    const show = list.length > 0 && !searchQuery && donePage === 1;
    box.style.display = show ? '' : 'none';
    if (!show) { stopFeatured(); return; }

    // 内容没变就不重绘，保持当前播放位置
    const sig = list.map(i => [i.id, i.translated, i.original, featuredCover(i), i.description, i.mcVersion, i.ratingAvg].join('|')).join('§') + isAdmin;
    if (sig !== ft.sig) {
        const prevId = ft.list[ft.index] && ft.list[ft.index].id;
        ft.list = list;
        ft.sig = sig;
        const keep = list.findIndex(i => i.id === prevId);
        ft.index = keep >= 0 ? keep : 0;
        const many = list.length > 1;
        box.innerHTML = `
            <div class="ft-viewport">
                <div class="ft-track" id="ftTrack">${list.map(featuredSlideHtml).join('')}</div>
            </div>
            ${many ? `<button class="ft-arrow prev" data-ft-go="-1" aria-label="上一个">‹</button>
                <button class="ft-arrow next" data-ft-go="1" aria-label="下一个">›</button>
                <div class="ft-dots" role="tablist">${list.map((it, i) => `<button class="ft-dot" data-ft-dot="${i}" aria-label="第 ${i + 1} 个：${escapeHtml(it.translated || it.original)}"></button>`).join('')}</div>` : ''}`;
    }
    showFeatured(ft.index, false);
    startFeatured();
}

function showFeatured(i, animate = true) {
    const n = ft.list.length;
    if (!n) return;
    ft.index = ((i % n) + n) % n;
    const track = document.getElementById('ftTrack');
    if (!track) return;
    track.style.transition = animate ? '' : 'none';
    track.style.transform = `translateX(${-ft.index * 100}%)`;
    if (!animate) { void track.offsetWidth; track.style.transition = ''; }
    document.querySelectorAll('#featuredHero .ft-dot').forEach((d, k) => {
        d.classList.toggle('active', k === ft.index);
        d.setAttribute('aria-selected', k === ft.index ? 'true' : 'false');
    });
    // 只让当前这张可以用 Tab 选中
    track.querySelectorAll('.ft-slide').forEach((s, k) => {
        s.tabIndex = k === ft.index ? 0 : -1;
        s.setAttribute('aria-hidden', k === ft.index ? 'false' : 'true');
    });
}

function startFeatured() {
    stopFeatured();
    if (ft.list.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ft.timer = setInterval(() => {
        if (ft.paused || document.visibilityState !== 'visible' || currentPage !== 'home') return;
        showFeatured(ft.index + 1);
    }, FEATURED_INTERVAL);
}
function stopFeatured() {
    if (ft.timer) clearInterval(ft.timer);
    ft.timer = null;
}

// ---------- 汉化中数量 ----------
let progressCounts = null;   // 访客：从 /items/progress 取；管理员：直接从列表算

async function refreshProgress() {
    if (isAdmin) return;
    try {
        progressCounts = await api('GET', '/items/progress');
        updateProgressChips();
    } catch (e) { }
}

function updateProgressChips(doingLocal, todoLocal) {
    const doing = isAdmin ? doingLocal : (progressCounts ? progressCounts.doing : 0);
    const chip = document.getElementById('doingChip');
    if (doing === undefined) return;
    chip.style.display = doing > 0 ? '' : 'none';
    chip.innerHTML = `🔧 ${doing}<span class="dc-label"> 个汉化中</span>`;
    chip.title = `${doing} 个资源正在汉化中`;
    if (isAdmin && todoLocal !== undefined) {
        document.getElementById('pendingSplit').textContent = `汉化中 ${doingLocal} · 待汉化 ${todoLocal}`;
    }
}

function setupFeaturedEvents() {
    const box = document.getElementById('featuredHero');
    box.addEventListener('mouseenter', () => { ft.paused = true; });
    box.addEventListener('mouseleave', () => { ft.paused = false; });
    box.addEventListener('focusin', () => { ft.paused = true; });
    box.addEventListener('focusout', () => { ft.paused = false; });

    // 手机左右滑动：轮播跟着手指走，松手后超过 1/5 宽度（或快速一划）就翻页，否则弹回。
    // 用 touch 事件 + 横向时 preventDefault：pointer 事件在手机上一横滑就会被浏览器的页面滚动接管（pointercancel）
    let touch = null;
    let swiped = false;
    const track = () => document.getElementById('ftTrack');
    box.addEventListener('touchstart', (e) => {
        if (ft.list.length < 2 || e.touches.length !== 1) return;
        const t = e.touches[0];
        touch = { x: t.clientX, y: t.clientY, t: Date.now(), dir: null, dx: 0, w: box.clientWidth };
        swiped = false;
        ft.paused = true;
    }, { passive: true });
    box.addEventListener('touchmove', (e) => {
        if (!touch) return;
        const t = e.touches[0];
        const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
        if (!touch.dir) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            touch.dir = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        }
        if (touch.dir !== 'x') return;   // 竖向：交给页面滚动
        e.preventDefault();
        const last = ft.list.length - 1;
        // 第一张往右 / 最后一张往左时加阻力
        const edge = (ft.index === 0 && dx > 0) || (ft.index === last && dx < 0);
        touch.dx = edge ? dx * 0.35 : dx;
        const tr = track();
        tr.style.transition = 'none';
        tr.style.transform = `translateX(calc(${-ft.index * 100}% + ${touch.dx}px))`;
    }, { passive: false });
    const endTouch = () => {
        if (!touch) return;
        const { dir, dx, w, t } = touch;
        touch = null;
        ft.paused = false;
        track().style.transition = '';
        if (dir !== 'x') { return; }
        swiped = true;
        const fast = Math.abs(dx) > 30 && Date.now() - t < 250;
        if (Math.abs(dx) > w / 5 || fast) showFeatured(ft.index + (dx < 0 ? 1 : -1));
        else showFeatured(ft.index);
        startFeatured();
    };
    box.addEventListener('touchend', endTouch);
    box.addEventListener('touchcancel', endTouch);

    box.addEventListener('click', async (e) => {
        if (swiped) { e.preventDefault(); swiped = false; return; }
        const t = e.target;
        const go = t.closest('[data-ft-go]');
        if (go) { e.preventDefault(); showFeatured(ft.index + Number(go.dataset.ftGo)); startFeatured(); return; }
        const dot = t.closest('[data-ft-dot]');
        if (dot) { e.preventDefault(); showFeatured(Number(dot.dataset.ftDot)); startFeatured(); return; }
        const rm = t.closest('[data-ft-remove]');
        if (rm) {
            e.preventDefault();
            e.stopPropagation();
            const item = items.find(i => i.id === rm.dataset.ftRemove);
            if (!item || !confirm(`把「${item.translated || item.original}」移出栈主推荐？`)) return;
            try {
                await apiUpdate(item.id, { featured: 0 });
                item.featured = 0;
                render();
                showToast('已移出推荐');
            } catch (err) { showToast(err.message || '操作失败'); }
        }
    });
    box.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { showFeatured(ft.index - 1); startFeatured(); }
        if (e.key === 'ArrowRight') { showFeatured(ft.index + 1); startFeatured(); }
    });
    refreshProgress();
}
