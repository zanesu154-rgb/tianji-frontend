// 待测试：详情页的测试提示、测试反馈弹窗、转正
const TEST_REPORT_LABELS = { ok: '✅ 测试通过', missing: '⚠️ 有没汉化的内容', wrong: '✏️ 有翻译错误' };
let testItemId = null;
let testMine = null;

async function loadTestSummary(itemId) {
    const el = document.getElementById('ipTestSummary');
    if (!el) return;
    try {
        const s = await api('GET', `/items/${encodeURIComponent(itemId)}/tests`);
        if (!document.getElementById('ipTestSummary')) return;
        testMine = s.mine;
        const parts = [];
        parts.push(`<span class="ok">✅ ${s.ok} 人测试通过</span>`);
        if (s.issues) parts.push(`<span class="bad">⚠️ ${s.issues} 人报告问题</span>`);
        el.innerHTML = parts.join('<span class="sep">·</span>')
            + (s.mine ? `<span class="mine">你的反馈：${TEST_REPORT_LABELS[s.mine]}（可以重新提交）</span>` : '');
    } catch (e) { el.textContent = ''; }
}

function ensureTestModal() {
    if (document.getElementById('testModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="testModal">
        <div class="modal-card test-modal">
            <h3>🧪 测试反馈</h3>
            <p class="test-modal-hint">玩过之后，这个汉化怎么样？</p>
            <div class="test-options" role="radiogroup">
                <label class="test-option"><input type="radio" name="testResult" value="ok"><span><b>✅ 汉化完整</b><small>没发现没汉化或翻译错误的地方</small></span></label>
                <label class="test-option"><input type="radio" name="testResult" value="missing"><span><b>⚠️ 有没汉化的内容</b><small>还有英文没翻，或者显示成代码</small></span></label>
                <label class="test-option"><input type="radio" name="testResult" value="wrong"><span><b>✏️ 有翻译错误</b><small>翻得不对、不通顺或者有错别字</small></span></label>
            </div>
            <div class="modal-field">
                <label id="testContentLabel">补充说明 <span class="field-hint">（选填）</span></label>
                <textarea id="testContent" maxlength="500" placeholder="在哪里看到的？比如：第二章 NPC 对话、合成台物品名…"></textarea>
            </div>
            <p class="test-modal-note">反馈会显示在评论区；栈主处理后会通知你。</p>
            <div class="modal-actions">
                <button class="btn" data-test-close>取消</button>
                <button class="btn btn-primary" id="testSubmitBtn">提交</button>
            </div>
        </div>
    </div>`);
    const m = document.getElementById('testModal');
    let down = false;
    m.addEventListener('pointerdown', e => { down = e.target === m; });
    m.addEventListener('click', e => {
        if ((e.target === m && down) || e.target.closest('[data-test-close]')) m.classList.remove('show');
        down = false;
    });
    m.addEventListener('change', e => {
        if (e.target.name !== 'testResult') return;
        const needText = e.target.value !== 'ok';
        document.getElementById('testContentLabel').innerHTML = needText
            ? '具体在哪里<span class="required-mark">*</span>'
            : '补充说明 <span class="field-hint">（选填）</span>';
    });
    document.getElementById('testSubmitBtn').addEventListener('click', submitTestReport);
}

function openTestReport(itemId) {
    if (!isLoggedIn()) {
        showToast('登录后才能提交测试反馈');
        openLoginModal();
        return;
    }
    ensureTestModal();
    testItemId = itemId;
    document.querySelectorAll('#testModal input[name=testResult]').forEach(r => { r.checked = r.value === testMine; });
    document.getElementById('testContent').value = '';
    const sel = document.querySelector('#testModal input[name=testResult]:checked');
    document.getElementById('testContentLabel').innerHTML = sel && sel.value !== 'ok'
        ? '具体在哪里<span class="required-mark">*</span>' : '补充说明 <span class="field-hint">（选填）</span>';
    document.getElementById('testModal').classList.add('show');
}

async function submitTestReport() {
    const sel = document.querySelector('#testModal input[name=testResult]:checked');
    if (!sel) { showToast('请选择测试结果'); return; }
    const content = document.getElementById('testContent').value.trim();
    if (sel.value !== 'ok' && !content) { showToast('请写一下具体在哪里，方便栈主修改'); document.getElementById('testContent').focus(); return; }
    const btn = document.getElementById('testSubmitBtn');
    btn.disabled = true;
    try {
        await api('POST', '/comments', { itemId: testItemId, report: sel.value, content });
        document.getElementById('testModal').classList.remove('show');
        showToast(sel.value === 'ok' ? '感谢测试！' : '反馈已提交，栈主处理后会通知你');
        loadTestSummary(testItemId);
        if (typeof loadComments === 'function') loadComments(testItemId);
    } catch (e) {
        showToast(e.message || '提交失败');
    } finally {
        btn.disabled = false;
    }
}

async function promoteTesting(item) {
    if (!confirm(`把「${item.translated || item.original}」转为已汉化（正式版）吗？\n所有提交过测试反馈的人会收到上线通知。`)) return;
    try {
        const row = await apiUpdate(item.id, { testing: 0 });
        Object.assign(item, mapItemRow(row));
        showToast('已转为已汉化，已通知参与测试的人');
        renderItemPage(item.id);
        render();
    } catch (e) { showToast(e.message || '操作失败'); }
}
