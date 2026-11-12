// 编辑弹窗、复制/跳转、导入、导出

// 编辑弹窗里的版本信息输入框 → 条目字段
const EDIT_VERSION_FIELDS = [
    ['editMcVersion', 'mcVersion'],
    ['editPackVersion', 'packVersion'],
    ['editAuthorUpdated', 'authorUpdated'],
    ['editTranslationVersion', 'translationVersion']
];

// ==================== 编辑弹窗 ====================
function openEditModal(id) {
    if (!isAdmin) return;
    const item = items.find(i => i.id === id);
    if (!item) return;
    editingItemId = id;

    document.getElementById('editOriginal').value = item.original || '';
    document.getElementById('editTranslated').value = item.translated || '';
    document.getElementById('editAuthor').value = item.author || '佚名';
    document.getElementById('editDescription').value = item.description || '';
    document.getElementById('editDetailDesc').value = item.detailDesc || '';
    document.getElementById('editCategory').value = item.category || 'addon';
    document.getElementById('editStatus').value = item.status || STATUS.TODO;
    document.getElementById('editImages').value = item.images || '';
    EDIT_VERSION_FIELDS.forEach(([elId, key]) => {
        document.getElementById(elId).value = item[key] || '';
    });
    syncEditTranslatedField();

    document.getElementById('editModal').classList.add('show');
    document.getElementById('editOriginal').focus();
}

// 只有「已汉化」状态才需要填写中文译名
function syncEditTranslatedField() {
    const isDone = document.getElementById('editStatus').value === STATUS.DONE;
    document.getElementById('editTranslatedField').style.display = isDone ? 'block' : 'none';
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
    editingItemId = null;
}

async function saveEditModal() {
    if (!editingItemId) return;
    const item = items.find(i => i.id === editingItemId);
    if (!item) return;

    const fields = {
        original: document.getElementById('editOriginal').value.trim() || item.original,
        author: document.getElementById('editAuthor').value.trim() || '佚名',
        description: document.getElementById('editDescription').value.trim(),
        detailDesc: document.getElementById('editDetailDesc').value.trim(),
        category: document.getElementById('editCategory').value,
        status: document.getElementById('editStatus').value,
        translated: document.getElementById('editTranslated').value.trim(),
        images: document.getElementById('editImages').value.trim(),
        ...Object.fromEntries(EDIT_VERSION_FIELDS.map(([elId, key]) => [key, document.getElementById(elId).value.trim()]))
    };

    try {
        const row = await apiUpdate(editingItemId, fields);
        const clicks = item.clicks;
        Object.assign(item, mapItemRow(row));   // 用服务器整理后的数据（图片去重等）
        item.clicks = clicks;

        // 详情内容需要重新生成
        const itemEl = document.querySelector(`.item[data-id="${editingItemId}"]`);
        if (itemEl) {
            const detailsEl = itemEl.querySelector('.item-details');
            if (detailsEl) {
                detailsEl.classList.remove('show');
                detailsEl.style.maxHeight = '';
                detailsEl.innerHTML = '';
                delete detailsEl.dataset.loaded;
                clearTimeout(detailsEl._expandTimer);
            }
        }
        item.expanded = false;

        closeEditModal();
        render();
        showToast('已保存');
    } catch (e) {
        showToast(e.message || '保存失败');
    }
}

async function deleteFromModal() {
    if (!editingItemId) return;
    const item = items.find(i => i.id === editingItemId);
    if (!item) return;
    if (!confirm(`确定要移除「${item.original}」吗？`)) return;

    try {
        const deletedId = editingItemId;
        await apiDelete(deletedId);
        items = items.filter(i => i.id !== deletedId);
        closeEditModal();
        if (currentPage === 'item' && currentItemId === deletedId) goBackToList();
        render();
        showToast('已移除');
    } catch (e) {
        showToast(e.message || '移除失败');
    }
}

// ==================== 复制/跳转 ====================
function copyText(text) {
    if (!text) { showToast('链接为空'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast('已复制')).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) showToast('已复制');
    else prompt('请手动复制:', text);
}

// 记录链接点击（管理员自己的点击不计）；失败不影响用户操作
function trackClick(id, field, action) {
    if (isAdmin || !id || !field) return;
    try {
        fetch(`${API_BASE}/items/${encodeURIComponent(id)}/click`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ field, action }),
            keepalive: true   // 页面跳走时请求也能发出去
        }).catch(() => { });
    } catch (e) { }
}

function openLink(id, field) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    let url = (item[field] || '').trim();
    if (!url) { showToast('链接为空'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    // 走风险提醒；确认访问才算一次「跳转」，在提醒框里复制算一次「复制」
    showExternalWarning(url, () => {
        trackClick(id, field, 'open');
        window.open(url, '_blank', 'noopener,noreferrer');
    }, () => trackClick(id, field, 'copy'));
}

// ==================== 导入 ====================
async function importList() {
    const input = document.getElementById('importInput');
    const raw = input.value.trim();
    if (!raw) return;

    const lines = raw.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
    const newItems = [];

    lines.forEach(line => {
        let author = '佚名';
        let rest = line;
        const pipeIdx = line.lastIndexOf('|');
        if (pipeIdx !== -1) {
            author = line.slice(pipeIdx + 1).trim() || '佚名';
            rest = line.slice(0, pipeIdx).trim();
        }

        const match = rest.match(/^([^(（]+)[(（]([^)）]+)[)）]/);
        let original = '', translated = '';
        if (match) {
            original = match[1].trim();
            translated = match[2].trim();
        } else {
            original = rest.trim();
        }
        if (!original) return;

        if (items.some(i => i.original.toLowerCase() === original.toLowerCase())) return;

        const status = (translated && hasChinese(translated)) ? STATUS.DONE : STATUS.TODO;
        newItems.push({
            original,
            translated,
            author,
            status
        });
    });

    if (newItems.length === 0) {
        showToast('没有可导入的新项目');
        return;
    }

    try {
        await apiBatchCreate(newItems);
        await loadItems(false);
        render();
        input.value = '';
        document.getElementById('importInputWrap').style.display = 'none';
        showToast(`成功导入 ${newItems.length} 条`);
    } catch (e) {
        showToast('导入失败');
    }
}

// ==================== 导出 ====================
function exportData() {
    const exportItems = items.map(item => ({
        original: item.original,
        translated: item.translated,
        author: item.author,
        authorLink: item.authorLink,
        translationLink: item.translationLink,
        originalLink: item.originalLink,
        description: item.description || '',
        detailDesc: item.detailDesc || '',
        status: item.status || STATUS.TODO,
        category: item.category || 'addon',
        images: item.images || '',
        mcVersion: item.mcVersion || '',
        packVersion: item.packVersion || '',
        authorUpdated: item.authorUpdated || '',
        translationVersion: item.translationVersion || ''
    }));
    const dataStr = `// 天际译栈 汉化数据导出\n// 导出时间: ${new Date().toLocaleString()}\nconst TRANSLATION_DATA = ${JSON.stringify(exportItems, null, 2)};\n`;
    const blob = new Blob([dataStr], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `天际译栈_汉化数据_${new Date().toISOString().slice(0, 10)}.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
