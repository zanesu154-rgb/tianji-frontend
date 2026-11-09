// 顶栏、搜索、菜单、公告编辑、弹窗等界面事件

function setupChromeEvents() {
    const app = document.querySelector('.app');
    // ========== 外部链接风险提醒 ==========
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[target="_blank"]');
        if (!link) return;
        const href = link.href || '';

        // 已确认过的直接放行
        if (link.dataset.confirmed === '1') {
            delete link.dataset.confirmed;
            return;
        }

        // 同域链接不拦截
        try {
            const url = new URL(href);
            if (url.hostname === location.hostname) return;

            // ⭐ 白名单：自己的其他站点不拦截
            const WHITELIST = [
                'zanesu154-rgb.github.io'   // 包括 tianji-frontend、tianji-turn-addon 等
            ];
            if (WHITELIST.includes(url.hostname)) return;
        } catch (err) {
            return;
        }

        e.preventDefault();
        showExternalWarning(href, () => {
            link.dataset.confirmed = '1';
            link.click();
        });
    }, true);

    // ========== 窗口 resize 时重新检测公告 ==========
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            checkAnnouncementOverflow();
        }, 200);
    });

    // ========== 归档菜单 ==========
    const archiveBtn = document.getElementById('archiveBtn');
    const archiveMenu = document.getElementById('archiveMenu');
    const archiveBtnLabel = document.getElementById('archiveBtnLabel');

    archiveBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        // 已展开 → 收起
        if (archiveMenu.classList.contains('show')) {
            archiveMenu.classList.remove('show');
            return;
        }

        // 展开前先定位（让菜单知道正确位置）
        const rect = archiveBtn.getBoundingClientRect();
        archiveMenu.style.top = (rect.bottom + 6) + 'px';
        archiveMenu.style.left = '0px';

        // 显示菜单（现在 JS 还没加 .show，但菜单需要先有宽度才能量）
        archiveMenu.classList.add('show');

        // 量宽度后再居中
        const menuWidth = archiveMenu.offsetWidth;
        const centerX = rect.left + rect.width / 2;
        let left = centerX - menuWidth / 2;

        // 防止超出屏幕
        if (left < 8) left = 8;
        if (left + menuWidth > window.innerWidth - 8) {
            left = window.innerWidth - menuWidth - 8;
        }
        archiveMenu.style.left = left + 'px';
    });

    archiveMenu.querySelectorAll('.archive-menu-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cat = btn.dataset.category;
            currentCategory = cat;

            const labelMap = {
                all: '全部',
                addon: '附加包',
                texture: '材质包',
                shader: '光影',
                map: '地图'
            };
            archiveBtnLabel.textContent = labelMap[cat] || '全部';

            archiveMenu.querySelectorAll('.archive-menu-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            archiveMenu.classList.remove('show');
            render();
        });
    });

    // 点击其他区域关闭
    document.addEventListener('click', (e) => {
        if (!archiveMenu.contains(e.target) && e.target !== archiveBtn) {
            archiveMenu.classList.remove('show');
        }
    });

    // 滚动时关闭菜单（防止它悬浮错位）
    window.addEventListener('scroll', () => {
        archiveMenu.classList.remove('show');
    }, { passive: true });

    // ========== 顶栏滚动隐藏/显示 ==========
    (function setupTopNavScroll() {
        const topNav = document.querySelector('.top-nav');
        if (!topNav) return;

        let lastScrollY = window.scrollY;
        let ticking = false;
        const THRESHOLD = 8;       // 滚动多少像素才触发（防止抖动）
        const TOP_OFFSET = 60;     // 页面顶部多少像素内始终显示

        function onScroll() {
            const currentY = window.scrollY;

            // 页面靠近顶部时始终显示
            if (currentY <= TOP_OFFSET) {
                topNav.classList.remove('hidden');
                lastScrollY = currentY;
                return;
            }

            const delta = currentY - lastScrollY;

            if (Math.abs(delta) < THRESHOLD) return;

            if (delta > 0) {
                // 向下滚动 → 隐藏
                topNav.classList.add('hidden');
            } else {
                // 向上滚动 → 显示
                topNav.classList.remove('hidden');
            }

            lastScrollY = currentY;
        }

        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    onScroll();
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    })();
    // 公告栏关闭
    // 公告栏关闭（仅本次会话有效，刷新后重新出现）
    const annBar = document.getElementById('announcementBar');
    const annClosed = sessionStorage.getItem('tianji_announcement_closed');
    if (annClosed === '1') {
        annBar.style.display = 'none';
    }
    document.getElementById('announcementClose').addEventListener('click', () => {
        annBar.style.display = 'none';
        try { sessionStorage.setItem('tianji_announcement_closed', '1'); } catch (e) { }
    });

    // 模块展开/收起
    document.getElementById('pendingToggle').addEventListener('click', function () {
        moduleExpanded.pending = !moduleExpanded.pending;
        updateModuleStyles();
    });
    document.getElementById('doneToggle').addEventListener('click', function () {
        moduleExpanded.done = !moduleExpanded.done;
        updateModuleStyles();
    });

    // ========== 搜索面板 ==========
    const searchPanel = document.getElementById('searchPanel');
    const searchToggleBtn = document.getElementById('searchToggleBtn');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');

    // 浏览器自动填充（密码管理器）写进来的内容不算用户搜索
    function isAutofilled(el) {
        try { return el.matches(':autofill'); } catch (e) { }
        try { return el.matches(':-webkit-autofill'); } catch (e) { }
        return false;
    }

    // 把搜索框的值恢复成用户真正输入过的内容
    function syncSearchInput() {
        if (searchInput.value !== searchQuery) searchInput.value = searchQuery;
        searchClear.style.display = searchQuery ? 'block' : 'none';
    }

    searchToggleBtn.addEventListener('click', () => {
        const isOpen = searchPanel.classList.contains('show');
        if (isOpen) {
            searchPanel.classList.remove('show');
            searchInput.setAttribute('readonly', '');   // 关闭时只读，浏览器不会往里自动填充
        } else {
            syncSearchInput();
            searchInput.removeAttribute('readonly');
            searchPanel.classList.add('show');
            setTimeout(() => searchInput.focus(), 280);
        }
    });

    searchInput.addEventListener('input', function () {
        // 面板没打开时用户不可能在输入，这类写入都来自自动填充
        if (!searchPanel.classList.contains('show') || isAutofilled(this)) {
            syncSearchInput();
            return;
        }
        searchQuery = this.value.trim();
        searchClear.style.display = searchQuery ? 'block' : 'none';
        render();
    });

    // 自动填充有时不触发 input 事件，失焦/重新聚焦时再校正一次
    searchInput.addEventListener('focus', function () {
        if (isAutofilled(this)) syncSearchInput();
    });

    searchClear.addEventListener('click', function () {
        searchInput.value = '';
        searchQuery = '';
        searchClear.style.display = 'none';
        render();
    });

    // ========== 下拉菜单 ==========
    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const menuDropdown = document.getElementById('menuDropdown');

    menuToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.classList.toggle('show');
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
        if (!menuDropdown.contains(e.target) && e.target !== menuToggleBtn) {
            menuDropdown.classList.remove('show');
        }
    });

    // 事件委托
    app.addEventListener('click', (e) => {
        const statusIcon = e.target.closest('[data-action="cycle-status"]');
        if (statusIcon) { cycleStatus(statusIcon.dataset.id); return; }

        const expandBtn = e.target.closest('[data-action="expand"]');
        if (expandBtn) { toggleExpand(expandBtn.dataset.id); return; }

        const editBtn = e.target.closest('[data-action="edit-item"]');
        if (editBtn) { openEditModal(editBtn.dataset.id); return; }

        const copyBtn = e.target.closest('[data-copy]');
        if (copyBtn) {
            const item = items.find(i => i.id === copyBtn.dataset.id);
            if (item) {
                const val = item[copyBtn.dataset.copy] || '';
                copyText(val);
                if (val) trackClick(item.id, copyBtn.dataset.copy, 'copy');
            }
            return;
        }

        const openBtn = e.target.closest('[data-action="open-link"]');
        if (openBtn) {
            e.preventDefault();
            openLink(openBtn.dataset.id, openBtn.dataset.field);
            return;
        }
    });

    // 链接输入（仅管理员，失焦时保存）
    app.addEventListener('blur', async (e) => {
        const input = e.target.closest('.detail-input');
        if (!input || !isAdmin) return;
        const id = input.dataset.id;
        const field = input.dataset.field;
        const item = items.find(i => i.id === id);
        if (!item) return;
        if (item[field] === input.value.trim()) return;
        try {
            await apiUpdate(id, { [field]: input.value.trim() });
            item[field] = input.value.trim();
            showToast('已保存');
        } catch (err) {
            showToast('保存失败');
        }
    }, true);
}

function setupMiscEvents() {
    const menuDropdown = document.getElementById('menuDropdown');
    // 赞助
    document.getElementById('sponsorBtn').addEventListener('click', () => {
        document.getElementById('qrModal').classList.add('show');
    });
    document.getElementById('qrCloseBtn').addEventListener('click', () => {
        document.getElementById('qrModal').classList.remove('show');
    });

    // ========== 菜单：登录/退出 ==========
    document.getElementById('menuLoginBtn').addEventListener('click', () => {
        menuDropdown.classList.remove('show');
        if (isLoggedIn()) {
            showPage('account');
        } else {
            openLoginModal();
        }
    });

    // 编辑弹窗
    document.getElementById('editSaveBtn').addEventListener('click', saveEditModal);
    document.getElementById('editCancelBtn').addEventListener('click', closeEditModal);
    document.getElementById('editDeleteBtn').addEventListener('click', deleteFromModal);

    // 管理员工具栏
    document.getElementById('importToggleBtn').addEventListener('click', () => {
        const wrap = document.getElementById('importInputWrap');
        const isHidden = wrap.style.display === 'none' || !wrap.style.display;
        wrap.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) document.getElementById('importInput').focus();
    });
    document.getElementById('importConfirmBtn').addEventListener('click', importList);
    document.getElementById('importInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') importList();
    });
    document.getElementById('exportBtn').addEventListener('click', exportData);
    // JS 快速导入
    document.getElementById('jsImportBtn').addEventListener('click', () => {
        document.getElementById('jsFileInput').click();
    });

    document.getElementById('jsFileInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        try {
            const text = await file.text();
            // 去掉 BOM
            const cleanText = text.replace(/^\uFEFF/, '');

            let data;
            // 1. 尝试匹配 const TRANSLATION_DATA = [...] 带分号
            let match = cleanText.match(/const\s+TRANSLATION_DATA\s*=\s*(\[[\s\S]*?\]);/);
            // 2. 尝试匹配不带分号的
            if (!match) {
                match = cleanText.match(/const\s+TRANSLATION_DATA\s*=\s*(\[[\s\S]*?\])/);
            }
            if (match) {
                // 用 Function 构造器来解析 JS 对象字面量（比 JSON.parse 宽松）
                try {
                    data = JSON.parse(match[1]);
                } catch (jsonErr) {
                    // 如果 JSON.parse 失败，用 Function 解析 JS 语法
                    data = (new Function('return ' + match[1]))();
                }
            } else {
                // 尝试直接当 JSON 数组解析
                try {
                    data = JSON.parse(cleanText);
                } catch (jsonErr) {
                    // 再试试当 JS 表达式解析
                    data = (new Function('return ' + cleanText))();
                }
            }
            if (!Array.isArray(data)) throw new Error('不是数组');

            // 过滤掉 original 为空的条目
            const validItems = data.filter(it => it.original && it.original.trim());

            // 过滤掉已存在的
            const newItems = validItems.filter(it => {
                return !items.some(existing =>
                    existing.original.toLowerCase() === it.original.toLowerCase()
                );
            });

            if (newItems.length === 0) {
                showToast('没有新项目可导入（可能都已存在或 original 为空）');
                return;
            }

            // 逐个转换字段名
            const batch = newItems.map(it => ({
                original: it.original,
                translated: it.translated || '',
                author: it.author || '佚名',
                authorLink: it.authorLink || it.author_link || '',
                translationLink: it.translationLink || it.translation_link || '',
                originalLink: it.originalLink || it.original_link || '',
                description: it.description || '',
                status: it.status || 'todo',
                category: it.category || 'addon'   // ⭐
            }));

            await apiBatchCreate(batch);
            await loadItems(false);
            render();
            showToast(`成功导入 ${batch.length} 条`);
        } catch (err) {
            showToast('文件格式不正确：' + err.message);
        }
    });


    // ========== 公告编辑 ==========
    document.getElementById('announcementEditBtn').addEventListener('click', () => {
        const current = announcementList.join('\n');
        document.getElementById('announcementInput').value = current;
        document.getElementById('announcementModal').classList.add('show');
        document.getElementById('announcementInput').focus();
    });

    document.getElementById('announcementCancelBtn').addEventListener('click', () => {
        document.getElementById('announcementModal').classList.remove('show');
    });

    document.getElementById('announcementSaveBtn').addEventListener('click', async () => {
        const value = document.getElementById('announcementInput').value.trim();
        try {
            await saveAnnouncement(value);
            // 重新加载公告列表并刷新轮播
            const lines = value.split(/\n/).map(s => s.trim()).filter(s => s.length > 0);
            announcementList = lines.length > 0 ? lines : ['欢迎来到天际译栈！'];
            renderAnnouncement();
            startAnnouncementRotate();
            document.getElementById('announcementModal').classList.remove('show');
            showToast('公告已更新');
        } catch (err) {
            showToast('保存失败');
        }
    });

    document.getElementById('announcementModal').addEventListener('click', (e) => {
        if (e.target.id === 'announcementModal') {
            document.getElementById('announcementModal').classList.remove('show');
        }
    });

    // 只有纯展示类弹窗允许点外部关闭；编辑、反馈、投稿等需要填写的弹窗只能用按钮或 Esc 关闭，
    // 避免误触丢失已填内容。
    // 另外必须是「按下和松开都在遮罩上」才算点外部：在输入框里拖选文字、松手落在框外时不会关闭。
    ['qrModal', 'loginModal'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        let downOnOverlay = false;
        el.addEventListener('pointerdown', (e) => { downOnOverlay = e.target === el; });
        el.addEventListener('click', (e) => {
            if (e.target === el && downOnOverlay) el.classList.remove('show');
            downOnOverlay = false;
        });
    });

    // Esc 关闭最上层弹窗
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const open = [...document.querySelectorAll('.modal-overlay.show')].pop();
        if (!open) return;
        open.classList.remove('show');
        if (open.id === 'editModal') editingItemId = null;
        if (open.id === 'reviewModal') reviewingSubmission = null;
    });
}
