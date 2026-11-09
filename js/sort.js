// 拖动排序（鼠标 / 触屏）

function setupSortEvents() {
    const app = document.querySelector('.app');
    // ========== 拖拽排序（仅管理员，鼠标 / 触屏通用） ==========
    // 用 Pointer Events 实现：原生 HTML5 拖放在手机浏览器上不会触发。
    // 按住 ⋮⋮ 手柄拖动，经过相邻项目的中线时交换位置，靠近屏幕上下边缘自动滚动。
    let sort = null;

    function sortGroupOf(id) {
        // 待汉化模块里「汉化中」固定排在「待汉化」前面，只能和同状态的项目互换
        const it = items.find(i => i.id === id);
        if (!it) return '';
        return it.status === STATUS.DONE ? 'done' : it.status;
    }

    function sortSiblings() {
        return [...sort.list.querySelectorAll(':scope > .item')]
            .filter(el => el !== sort.el && sortGroupOf(el.dataset.id) === sort.group);
    }

    function positionDragged() {
        const el = sort.el;
        el.style.transform = '';
        const naturalTop = el.getBoundingClientRect().top;
        el.style.transform = `translateY(${sort.pointerY - sort.grabOffset - naturalTop}px)`;
    }

    function maybeSwap() {
        const el = sort.el;
        let moved = true;
        while (moved) {
            moved = false;
            el.style.transform = '';
            const siblings = sortSiblings();
            const rect = el.getBoundingClientRect();
            // 用被拖项目自身的中心（而不是手指位置）判断，手柄在卡片哪里都一样跟手
            const center = sort.pointerY - sort.grabOffset + rect.height / 2;
            const prev = siblings.filter(s => s.getBoundingClientRect().top < rect.top).pop();
            const next = siblings.find(s => s.getBoundingClientRect().top > rect.top);
            if (prev) {
                const r = prev.getBoundingClientRect();
                if (center < r.top + r.height / 2) { prev.before(el); moved = true; continue; }
            }
            if (next) {
                const r = next.getBoundingClientRect();
                if (center > r.top + r.height / 2) { next.after(el); moved = true; }
            }
        }
        positionDragged();
    }

    // 指针离边缘越近滚得越快
    function edgeSpeed(y, top, bottom, edge) {
        if (y < top + edge) return -Math.ceil((top + edge - y) / 5);
        if (y > bottom - edge) return Math.ceil((y - (bottom - edge)) / 5);
        return 0;
    }

    function autoScrollLoop() {
        if (!sort) return;
        const list = sort.list;
        // 模块收起时列表本身是一个可滚动的小窗口，先滚列表
        if (list.scrollHeight > list.clientHeight + 1) {
            const r = list.getBoundingClientRect();
            const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, window.innerHeight);
            const dy = edgeSpeed(sort.pointerY, top, bottom, Math.min(48, (bottom - top) / 4));
            if (dy) list.scrollTop += dy;
        }
        // 靠近屏幕上下边缘时滚动整个页面
        const wdy = edgeSpeed(sort.pointerY, 0, window.innerHeight, 70);
        if (wdy) window.scrollBy({ top: wdy, behavior: 'instant' });
        sort.raf = requestAnimationFrame(autoScrollLoop);
    }

    app.addEventListener('pointerdown', (e) => {
        if (!isAdmin || sort) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const handle = e.target.closest('.drag-handle');
        if (!handle) return;
        const el = handle.closest('.item');
        const list = el && el.parentElement;
        if (!el || !list) return;
        e.preventDefault();

        const rect = el.getBoundingClientRect();
        sort = {
            el, list, handle,
            pointerId: e.pointerId,
            group: sortGroupOf(el.dataset.id),
            startOrder: [...list.querySelectorAll(':scope > .item')].map(x => x.dataset.id),
            grabOffset: e.clientY - rect.top,
            pointerY: e.clientY,
            raf: 0
        };
        try { handle.setPointerCapture(e.pointerId); } catch (err) { }
        el.classList.add('dragging');
        document.body.classList.add('is-sorting');
        // 关闭浏览器的滚动锚定：否则项目往上移动时浏览器会自动滚动页面来"补偿"，列表就跟不上手指
        document.documentElement.style.overflowAnchor = 'none';
        document.body.style.overflowAnchor = 'none';
        list.style.overflowAnchor = 'none';
        if (navigator.vibrate && e.pointerType === 'touch') navigator.vibrate(12);
        sort.raf = requestAnimationFrame(autoScrollLoop);
    });

    document.addEventListener('pointermove', (e) => {
        if (!sort || e.pointerId !== sort.pointerId) return;
        if (e.cancelable) e.preventDefault();
        sort.pointerY = e.clientY;
        maybeSwap();
    });

    async function finishSort(cancelled) {
        if (!sort) return;
        const { el, list, handle, pointerId, startOrder, raf } = sort;
        sort = null;
        cancelAnimationFrame(raf);
        try { handle.releasePointerCapture(pointerId); } catch (err) { }
        el.classList.remove('dragging');
        el.style.transform = '';
        document.body.classList.remove('is-sorting');
        document.documentElement.style.overflowAnchor = '';
        document.body.style.overflowAnchor = '';
        list.style.overflowAnchor = '';

        const newOrder = [...list.querySelectorAll(':scope > .item')].map(x => x.dataset.id);
        if (cancelled || newOrder.join() === startOrder.join()) {
            if (cancelled) render();
            return;
        }

        // 列表里的项目（可能被搜索/分类过滤过）按新顺序填回它们在 items 中原来占的位置
        const idSet = new Set(newOrder);
        const slots = [];
        items.forEach((it, idx) => { if (idSet.has(it.id)) slots.push(idx); });
        const byId = new Map(items.map(it => [it.id, it]));
        const next = items.slice();
        newOrder.forEach((id, k) => { next[slots[k]] = byId.get(id); });
        items = next;
        render();

        try {
            await apiReorder(items.map((it, idx) => ({ id: it.id, sortOrder: idx })));
            showToast('排序已保存');
        } catch (err) {
            showToast(err.message || '排序保存失败');
            await loadItems(false);
            render();
        }
    }

    // 页面或列表在拖动过程中滚动（惯性滚动、自动滚动）时也要重新判断位置
    // capture 阶段能收到任何元素的滚动事件
    document.addEventListener('scroll', () => {
        if (sort) maybeSwap();
    }, { passive: true, capture: true });

    document.addEventListener('pointerup', (e) => {
        if (sort && e.pointerId === sort.pointerId) finishSort(false);
    });
    document.addEventListener('pointercancel', (e) => {
        if (sort && e.pointerId === sort.pointerId) finishSort(true);
    });
    // 拖动中按 Esc 取消
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sort) finishSort(true);
    });
    // 手柄上禁用长按菜单（iOS/安卓长按会弹出系统菜单）
    app.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.drag-handle')) e.preventDefault();
    });
}
