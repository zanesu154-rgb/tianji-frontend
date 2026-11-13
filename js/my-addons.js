// 栈主的附加包：列表页 #addons、详情页 #addons/<id>[/log|/code]
// 详情页三个标签：介绍（简介 + 描述 + 下载）、更新日志、脚本结构树
// 访客只读；管理员可以编辑基本信息、更新日志全文、脚本结构（改说明 / 增删文件 / 导入新扫描）
const MA = {
    list: null,                 // 列表缓存
    addon: null,                // 当前详情
    structure: null,            // 当前脚本结构
    structureFor: null,
    tab: 'intro',
    file: null,                 // 结构树中选中的文件
    query: '',
    openDirs: new Set(),
    editingDesc: false
};
const MA_TABS = { intro: '介绍', log: '更新日志', code: '脚本结构' };

// ==================== 更新日志：解析栈主自己的格式 ====================
// 测试版更新日志 / 稳定版更新日志 → 分组；[A]版更新日志、v1.2.0-标题、v1.8.0 标题 → 版本
// 1.xxx → 条目；缩进的 1.xxx → 子条目；缩进的其他文字 → 补充说明；版本之间的单独一行 → 提示（挂到下一个版本）
function parseChangelog(text) {
    const versions = [];
    let group = 'stable';
    let cur = null;
    let pendingNotice = [];
    for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
        if (!raw.trim()) continue;
        const indented = /^(\s{2,}|\t)/.test(raw);
        const line = raw.trim();
        if (/^测试版(更新日志)?$/.test(line)) { group = 'test'; cur = null; continue; }
        if (/^(稳定版|正式版)(更新日志)?$/.test(line)) { group = 'stable'; cur = null; continue; }
        let m = /^\[(.+?)\]\s*版?(更新日志)?$/.exec(line);
        const mv = /^(v\d+(?:\.\d+)*)(?:\s*[-—–\s]\s*(.+))?$/i.exec(line);
        if (m || mv) {
            cur = m
                ? { ver: `${m[1]} 版`, title: '', group: 'test', items: [], notices: pendingNotice }
                : { ver: mv[1].toLowerCase(), title: (mv[2] || '').trim(), group, items: [], notices: pendingNotice };
            pendingNotice = [];
            versions.push(cur);
            continue;
        }
        m = /^(\d+)\s*[.、．]\s*(.*)$/.exec(line);
        if (m && cur) {
            if (indented && cur.items.length) cur.items[cur.items.length - 1].subs.push(m[2]);
            else cur.items.push({ text: m[2], subs: [], notes: [] });
            continue;
        }
        if (cur && indented && cur.items.length) {
            cur.items[cur.items.length - 1].notes.push(line);
            continue;
        }
        if (cur && cur.items.length === 0 && !/^⚠/.test(line)) {
            cur.items.push({ text: line, subs: [], notes: [] });
            continue;
        }
        // 版本之间的独立提示
        pendingNotice.push(line.replace(/^⚠️?\s*|\s*⚠️?$/g, ''));
    }
    return versions;
}

function latestVersion(addon) {
    const vs = parseChangelog(addon.changelog);
    const stable = vs.filter(v => v.group === 'stable');
    return (stable.length ? stable : vs).slice(-1)[0] || null;
}

// ==================== 数据 ====================
async function maLoadList(force) {
    if (MA.list && !force) return MA.list;
    MA.list = await api('GET', '/my-addons');
    return MA.list;
}

async function maLoadStructure(id) {
    if (MA.structureFor === id && MA.structure !== undefined && MA.structure !== null) return MA.structure;
    MA.structure = await api('GET', `/my-addons/${encodeURIComponent(id)}/structure`);
    MA.structureFor = id;
    return MA.structure;
}

// ==================== 路由入口 ====================
// arg: '' → 列表；'<id>' 或 '<id>/<tab>' → 详情
function renderAddonsPage(arg) {
    const [id, tab] = String(arg || '').split('/');
    const root = document.getElementById('addonsContent');
    if (!id) {
        document.title = '栈主的附加包 - ' + DEFAULT_TITLE;
        root.innerHTML = maSkeleton();
        maLoadList(true).then(renderAddonList).catch(e => { root.innerHTML = maError(e); });
        return;
    }
    const newAddon = !MA.addon || MA.addon.id !== id;
    MA.tab = MA_TABS[tab] ? tab : 'intro';
    if (newAddon) {
        MA.addon = null; MA.file = null; MA.query = ''; MA.openDirs = new Set(); MA.editingDesc = false;
        root.innerHTML = maSkeleton();
    }
    api('GET', `/my-addons/${encodeURIComponent(id)}`).then(a => {
        MA.addon = a;
        document.title = `${a.name} - 栈主的附加包`;
        renderAddonDetail();
    }).catch(e => { root.innerHTML = maError(e); });
}

function maSkeleton() {
    return `<div class="ip-card"><div class="ip-skeleton" style="height:28px;width:45%;border-radius:8px;"></div>
        <div class="ip-skeleton" style="height:16px;width:70%;margin-top:14px;border-radius:6px;"></div>
        <div class="ip-skeleton" style="height:120px;margin-top:20px;border-radius:14px;"></div></div>`;
}
function maError(e) {
    return `<div class="ip-card"><div class="ip-empty">加载失败：${escapeHtml(e.message || '')}</div></div>`;
}

function maSeal(name) {
    const t = Array.from(name || '附加').slice(0, 2);
    return `<span class="ma-seal" aria-hidden="true">${escapeHtml(t[0] || '')}<br>${escapeHtml(t[1] || '')}</span>`;
}

function maDate(ts) {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// ==================== 列表 ====================
function renderAddonList(list) {
    const root = document.getElementById('addonsContent');
    const cards = list.map(a => {
        const v = latestVersion(a);
        return `<a class="ma-card" href="#addons/${encodeURIComponent(a.id)}">
            ${a.cover ? `<div class="ma-card-cover"><img src="${escapeHtml(a.cover)}" alt="" loading="lazy"></div>` : `<div class="ma-card-cover ma-card-cover-empty">${maSeal(a.name)}</div>`}
            <div class="ma-card-body">
                <div class="ma-card-title">${escapeHtml(a.name)}${v ? `<span class="ma-ver">${escapeHtml(v.ver)}</span>` : ''}</div>
                ${a.subtitle ? `<div class="ma-card-sub">${escapeHtml(a.subtitle)}</div>` : ''}
                ${a.intro ? `<p class="ma-card-intro">${escapeHtml(a.intro)}</p>` : ''}
                <div class="ma-card-meta">更新于 ${maDate(a.updated_at)}${a.has_structure ? ' · 含脚本结构' : ''}</div>
            </div>
        </a>`;
    }).join('');
    root.innerHTML = `
        <div class="ma-list-head">
            <div>
                <h1 class="ma-list-title">栈主的附加包</h1>
                <p class="ma-list-sub">栈主自己做的附加包：介绍、下载、更新日志，还能看看脚本是怎么搭起来的。</p>
            </div>
            ${isAdmin ? '<button class="btn btn-primary" data-ma-new>＋ 新增附加包</button>' : ''}
        </div>
        ${list.length ? `<div class="ma-grid">${cards}</div>` : '<div class="ip-card"><div class="ip-empty">还没有附加包</div></div>'}`;
}

// ==================== 详情 ====================
function renderAddonDetail() {
    const a = MA.addon;
    if (!a) return;
    const root = document.getElementById('addonsContent');
    const v = latestVersion(a);
    const tabs = Object.entries(MA_TABS)
        .filter(([k]) => k !== 'code' || a.has_structure || isAdmin)
        .map(([k, label]) => `<button class="ma-tab${MA.tab === k ? ' active' : ''}" data-ma-tab="${k}" role="tab" aria-selected="${MA.tab === k}">${label}</button>`).join('');
    const dl = a.links.length
        ? a.links.map((l, i) => `<button class="ma-dl${i === 0 ? ' primary' : ''}" data-ma-link="${i}">⬇ ${escapeHtml(l.label || '下载')}</button>`).join('')
        : (isAdmin ? '<span class="ma-hint">还没有下载链接，点「编辑信息」添加</span>' : '<span class="ma-hint">下载链接即将上线</span>');
    root.innerHTML = `
        <article class="ip-card ma-hero">
            ${a.cover ? `<div class="ma-hero-cover"><img src="${escapeHtml(a.cover)}" alt=""></div>` : ''}
            <div class="ma-hero-head">
                ${maSeal(a.name)}
                <div class="ma-hero-titles">
                    <h1 class="ip-title">${escapeHtml(a.name)}</h1>
                    ${a.subtitle ? `<div class="ma-hero-sub">${escapeHtml(a.subtitle)}</div>` : ''}
                    <div class="ma-hero-meta">
                        ${v ? `<span class="ma-ver">${escapeHtml(v.ver)}${v.title ? ' · ' + escapeHtml(v.title) : ''}</span>` : ''}
                        <span>更新于 ${maDate(a.updated_at)}</span>
                    </div>
                </div>
            </div>
            ${a.intro ? `<p class="ma-intro">${escapeHtml(a.intro)}</p>` : (isAdmin ? '<p class="ma-intro ma-hint">还没有简介，点「编辑信息」填写</p>' : '')}
            <div class="ma-dls">${dl}</div>
            ${isAdmin ? `<div class="ma-admin-bar">
                <button class="gm-btn" data-ma-edit>✏️ 编辑信息</button>
                <button class="gm-btn" data-ma-edit-log>📝 编辑更新日志</button>
                <button class="gm-btn danger" data-ma-delete>🗑 删除</button>
            </div>` : ''}
        </article>
        <div class="ma-tabs" role="tablist">${tabs}</div>
        <div id="maTabBody"></div>`;
    renderAddonTab();
}

function renderAddonTab() {
    const body = document.getElementById('maTabBody');
    if (!body || !MA.addon) return;
    if (MA.tab === 'log') body.innerHTML = changelogHtml(MA.addon);
    else if (MA.tab === 'code') {
        if (MA.structureFor === MA.addon.id && MA.structure) { body.innerHTML = structureHtml(); maAfterStructureRender(); }
        else {
            body.innerHTML = '<div class="ip-card"><div class="ip-skeleton" style="height:300px;border-radius:14px;"></div></div>';
            maLoadStructure(MA.addon.id).then(() => {
                if (MA.tab !== 'code') return;
                body.innerHTML = structureHtml();
                maAfterStructureRender();
            }).catch(e => { body.innerHTML = maError(e); });
        }
    } else body.innerHTML = introHtml(MA.addon);
}

function introHtml(a) {
    const v = latestVersion(a);
    const latest = v ? `<section class="ip-section">
            <h2>最新更新 <span class="ma-h2-sub">${escapeHtml(v.ver)}${v.title ? ' · ' + escapeHtml(v.title) : ''}</span></h2>
            ${versionBodyHtml(v)}
            <button class="ma-more" data-ma-tab="log">查看完整更新日志 →</button>
        </section>` : '';
    return `<article class="ip-card">
        <section class="ip-section" style="margin-top:0">
            <h2>介绍</h2>
            ${a.description ? `<div class="ip-desc">${linkifyText(a.description)}</div>`
            : `<div class="ip-empty">${isAdmin ? '还没有介绍，点上方「编辑信息」填写' : '栈主还在写介绍～'}</div>`}
        </section>
        ${latest}
    </article>`;
}

// ---------- 更新日志 ----------
function versionBodyHtml(v) {
    const notices = v.notices.map(n => `<div class="ma-notice">⚠️ ${escapeHtml(n)}</div>`).join('');
    const items = v.items.map(it => `<li>${escapeHtml(it.text)}
        ${it.notes.length ? `<div class="ma-item-note">${it.notes.map(escapeHtml).join('<br>')}</div>` : ''}
        ${it.subs.length ? `<ol class="ma-subs">${it.subs.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>` : ''}
    </li>`).join('');
    return notices + (items ? `<ol class="ma-items">${items}</ol>` : '');
}

function changelogHtml(a) {
    const vs = parseChangelog(a.changelog);
    if (!vs.length) {
        return `<article class="ip-card"><div class="ip-empty">${isAdmin ? '还没有更新日志，点上方「编辑更新日志」填写' : '暂无更新日志'}</div></article>`;
    }
    const stable = vs.filter(v => v.group === 'stable').reverse();
    const test = vs.filter(v => v.group === 'test');
    const card = (v, open) => `<details class="ma-ver-card${v.title ? ' major' : ''}"${open ? ' open' : ''}>
        <summary>
            <span class="ma-ver-name">${escapeHtml(v.ver)}</span>
            ${v.title ? `<span class="ma-ver-title">${escapeHtml(v.title)}</span>` : ''}
            ${v.notices.length ? '<span class="ma-ver-warn" title="有重要提示">⚠️</span>' : ''}
            <span class="ma-ver-count">${v.items.length} 项</span>
        </summary>
        <div class="ma-ver-body">${versionBodyHtml(v)}</div>
    </details>`;
    const majors = stable.filter(v => v.title).length;
    return `<article class="ip-card">
        <section class="ip-section" style="margin-top:0">
            <h2>更新日志 <span class="ma-h2-sub">${stable.length} 个正式版本${majors ? `，其中 ${majors} 次大更新` : ''}</span></h2>
            <div class="ma-timeline">${stable.map((v, i) => card(v, i < 3)).join('')}</div>
            ${test.length ? `<details class="ma-test-group">
                <summary>测试版（${escapeHtml(test[0].ver.replace(' 版', ''))} – ${escapeHtml(test[test.length - 1].ver.replace(' 版', ''))}，共 ${test.length} 个版本）</summary>
                <div class="ma-timeline">${test.slice().reverse().map(v => card(v, false)).join('')}</div>
            </details>` : ''}
        </section>
    </article>`;
}

// ---------- 脚本结构 ----------
const MA_LAYER_NAMES = { main: '入口', sys: '玩法系统', fx: '特效', core: '底层工具', cfg: '数据配置' };
function maLayer(k) {
    if (!k.includes('/')) return 'main';
    if (k.startsWith('config/') || k.startsWith('lib/')) return 'cfg';
    if (k.startsWith('core/')) return 'core';
    if (k.startsWith('fx/')) return 'fx';
    return 'sys';
}
function maUsedBy(files) {
    const by = {};
    Object.keys(files).forEach(k => { by[k] = []; });
    for (const [k, f] of Object.entries(files)) for (const [to, names] of f.i) if (by[to]) by[to].push([k, names]);
    return by;
}
function maLoaded(files) {
    // 从入口出发能加载到的文件；其余是「未启用」
    const entry = files['main.js'] ? 'main.js' : Object.keys(files).find(k => !k.includes('/'));
    const seen = new Set();
    if (!entry) return seen;
    const q = [entry];
    seen.add(entry);
    while (q.length) {
        const k = q.shift();
        for (const [to] of (files[k] ? files[k].i : [])) if (files[to] && !seen.has(to)) { seen.add(to); q.push(to); }
    }
    return seen;
}
function maSubName(dir) {
    const s = MA.structure;
    const key = dir.split('/').pop();
    return (s && s.sub && s.sub[key]) || '';
}

function structureHtml() {
    const s = MA.structure;
    if (!s || !s.files || !Object.keys(s.files).length) {
        return `<article class="ip-card"><div class="ip-empty">还没有脚本结构</div>
            ${isAdmin ? `<div class="ma-admin-bar" style="justify-content:center"><button class="gm-btn" data-ma-import>📥 导入结构（扫描生成的 HTML / JSON）</button></div>` : ''}</article>`;
    }
    const files = s.files;
    const keys = Object.keys(files);
    const lines = keys.reduce((n, k) => n + files[k].l, 0);
    // 分层概览：systems 下按子系统，其他按大类
    const groups = {};
    for (const k of keys) {
        const layer = maLayer(k);
        const g = layer === 'sys' ? k.split('/').slice(0, 2).join('/') : layer;
        (groups[g] = groups[g] || { layer, n: 0, l: 0 });
        groups[g].n++; groups[g].l += files[k].l;
    }
    const chip = (g, label, v) => `<button class="ma-chip ma-l-${v.layer}" data-ma-dir="${escapeHtml(g)}">${escapeHtml(label)}<i>${v.n} 个 · ${v.l.toLocaleString()} 行</i></button>`;
    const sysChips = Object.entries(groups).filter(([, v]) => v.layer === 'sys').sort((a, b) => b[1].l - a[1].l)
        .map(([g, v]) => chip(g, maSubName(g) || g.split('/')[1], v)).join('');
    const otherChips = ['main', 'fx', 'core', 'cfg'].filter(l => groups[l])
        .map(l => chip(l, MA_LAYER_NAMES[l], groups[l])).join('');
    return `<article class="ip-card ma-code">
        <section class="ip-section" style="margin-top:0">
            <h2>脚本结构 <span class="ma-h2-sub">${s.ver ? escapeHtml(s.ver) + ' · ' : ''}${s.date ? escapeHtml(s.date) : ''}</span></h2>
            <p class="ma-code-lede">${s.root ? `行为包 <code>${escapeHtml(s.root)}</code> 下` : ''}全部脚本文件，以及它们互相之间怎么调用。点分类或文件名查看说明。</p>
            <div class="ma-stats"><span><b>${keys.length}</b> 个文件</span><span><b>${lines.toLocaleString()}</b> 行代码</span><span><b>${Object.values(groups).filter(v => v.layer === 'sys').length}</b> 个玩法系统</span></div>
            <div class="ma-chips">${sysChips}</div>
            <div class="ma-chips ma-chips-base">${otherChips}</div>
            ${isAdmin ? `<div class="ma-admin-bar">
                <button class="gm-btn" data-ma-add-file>＋ 新增文件</button>
                <button class="gm-btn" data-ma-import>📥 导入新扫描</button>
                <button class="gm-btn" data-ma-export>📤 导出 JSON</button>
            </div>` : ''}
        </section>
        <div class="ma-browser">
            <nav class="ma-tree" aria-label="文件树">
                <input class="ma-search" id="maSearch" type="search" placeholder="搜索文件名或说明，如：渡劫、剑域" value="${escapeHtml(MA.query)}">
                <div id="maTree"></div>
            </nav>
            <div class="ma-detail" id="maDetail" aria-live="polite"></div>
        </div>
    </article>`;
}

function maTreeData() {
    const root = {};
    for (const k of Object.keys(MA.structure.files)) {
        const parts = k.split('/');
        let n = root;
        for (let i = 0; i < parts.length - 1; i++) n = (n[parts[i] + '/'] = n[parts[i] + '/'] || {});
        n[parts[parts.length - 1]] = k;
    }
    return root;
}

function renderMaTree() {
    const el = document.getElementById('maTree');
    if (!el) return;
    const files = MA.structure.files;
    const q = MA.query.trim().toLowerCase();
    const hit = k => !q || k.toLowerCase().includes(q) || (files[k].d || '').toLowerCase().includes(q);
    const ORDER = ['main.js', 'systems/', 'fx/', 'core/', 'config/', 'lib/'];
    const count = n => Object.values(n).reduce((c, v) => c + (typeof v === 'string' ? (hit(v) ? 1 : 0) : count(v)), 0);
    const walk = (n, path, depth) => {
        const keys = Object.keys(n).sort((a, b) => {
            const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
            if (depth === 0 && (ia >= 0 || ib >= 0)) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
            const da = typeof n[a] !== 'string', db = typeof n[b] !== 'string';
            if (da !== db) return da ? -1 : 1;
            return a.localeCompare(b);
        });
        return '<ul>' + keys.map(key => {
            const v = n[key];
            if (typeof v === 'string') {
                if (!hit(v)) return '';
                return `<li><button class="ma-file ma-l-${maLayer(v)}${MA.file === v ? ' on' : ''}" data-ma-file="${escapeHtml(v)}" title="${escapeHtml(files[v].d)}">
                    <span class="nm">${escapeHtml(key)}</span><span class="ln">${files[v].l}</span></button></li>`;
            }
            const p = path + key;
            const c = count(v);
            if (q && !c) return '';
            const open = q ? true : MA.openDirs.has(p);
            const label = maSubName(p.slice(0, -1));
            return `<li><button class="ma-dir${open ? '' : ' closed'}" data-ma-path="${escapeHtml(p)}">
                <span class="car">▾</span>${escapeHtml(key)}${label ? `<span class="ma-dir-label">${escapeHtml(label)}</span>` : ''}<em>${c}</em></button>
                ${open ? walk(v, p, depth + 1) : ''}</li>`;
        }).join('') + '</ul>';
    };
    el.innerHTML = walk(maTreeData(), '', 0) || '<div class="ip-empty">没有匹配的文件</div>';
}

function maFileLink(k) {
    const files = MA.structure.files;
    if (!files[k]) return `<span class="ma-missing">${escapeHtml(k)}</span>`;
    // systems/ 下显示「子系统/文件名」，避免多个 index.js 分不清
    const label = k.startsWith('systems/') ? k.slice(8) : k;
    return `<button class="ma-flink ma-l-${maLayer(k)}" data-ma-file="${escapeHtml(k)}" title="${escapeHtml(files[k].d)}">${escapeHtml(label)}</button>`;
}

function renderMaDetail() {
    const el = document.getElementById('maDetail');
    if (!el) return;
    const files = MA.structure.files;
    const k = MA.file;
    const f = files[k];
    if (!f) {
        el.innerHTML = '<div class="ma-detail-empty">← 选择一个文件查看说明</div>';
        return;
    }
    const by = maUsedBy(files)[k] || [];
    const loaded = maLoaded(files).has(k);
    const sub = maLayer(k) === 'sys' ? maSubName(k.split('/').slice(0, 2).join('/')) : MA_LAYER_NAMES[maLayer(k)];
    // 超过 12 条时先折叠
    const rel = (list, emptyText) => {
        if (!list.length) return `<div class="ma-none">${emptyText}</div>`;
        const row = ([to, names]) => `<div class="ma-rel">${maFileLink(to)}${names.length ? `<span class="ma-names">${names.map(escapeHtml).join('、')}</span>` : ''}</div>`;
        const head = list.slice(0, 12).map(row).join('');
        const rest = list.slice(12);
        return `<div class="ma-rels">${head}${rest.length ? `<details class="ma-rels-more"><summary>展开其余 ${rest.length} 个</summary>${rest.map(row).join('')}</details>` : ''}</div>`;
    };
    const descHtml = MA.editingDesc
        ? `<div class="ma-desc-edit"><input id="maDescInput" maxlength="500" value="${escapeHtml(f.d)}">
            <button class="btn btn-primary" data-ma-desc-save>保存</button><button class="gm-btn" data-ma-desc-cancel>取消</button></div>`
        : `<p class="ma-desc">${f.d ? escapeHtml(f.d) : '<span class="ma-none">暂无说明</span>'}</p>`;
    el.innerHTML = `
        <div class="ma-path ma-l-${maLayer(k)}">${escapeHtml(k)}</div>
        ${descHtml}
        <div class="ma-kv">
            <span>分类 <b>${escapeHtml(sub || '')}</b></span>
            <span>行数 <b>${f.l}</b></span>
            <span>引用 <b>${f.i.length}</b></span>
            <span>被引用 <b>${by.length}</b></span>
            ${loaded ? '' : '<span class="ma-off">未启用</span>'}
        </div>
        ${isAdmin ? `<div class="ma-admin-bar">
            ${MA.editingDesc ? '' : '<button class="gm-btn" data-ma-desc-edit>✏️ 改说明</button>'}
            <button class="gm-btn" data-ma-lines>改行数</button>
            <button class="gm-btn danger" data-ma-del-file>删除这个文件</button>
        </div>` : ''}
        <div class="ma-blk"><h4>它用到了（${f.i.length}）</h4>${rel(f.i, '不依赖其他文件')}</div>
        <div class="ma-blk"><h4>谁用到了它（${by.length}）</h4>${rel(by, loaded ? '没有其他文件引用' : '没有任何文件加载它，游戏里暂未启用')}</div>
        ${f.e.length ? `<div class="ma-blk"><h4>监听的游戏事件</h4><div class="ma-tags">${f.e.map(x => `<span>${escapeHtml(x)}</span>`).join('')}</div></div>` : ''}
        ${f.x.length ? `<div class="ma-blk"><h4>对外提供</h4><div class="ma-tags">${f.x.map(x => `<span>${escapeHtml(x)}</span>`).join('')}</div></div>` : ''}`;
    if (MA.editingDesc) {
        const input = document.getElementById('maDescInput');
        input.focus();
        input.select();
    }
}

function maAfterStructureRender() {
    const files = MA.structure && MA.structure.files;
    if (!files || !Object.keys(files).length) return;
    if (!MA.file || !files[MA.file]) {
        MA.file = files['main.js'] ? 'main.js' : Object.keys(files).sort()[0];
    }
    maRevealFile(MA.file);
    renderMaTree();
    renderMaDetail();
}

function maRevealFile(k) {
    const parts = k.split('/');
    for (let i = 1; i < parts.length; i++) MA.openDirs.add(parts.slice(0, i).join('/') + '/');
}

function maSelectFile(k, scroll) {
    if (!MA.structure.files[k]) return;
    MA.file = k;
    MA.editingDesc = false;
    maRevealFile(k);
    renderMaTree();
    renderMaDetail();
    if (scroll) {
        const d = document.getElementById('maDetail');
        if (d && window.innerWidth <= 820) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const on = document.querySelector('.ma-file.on');
    if (on && on.scrollIntoViewIfNeeded) on.scrollIntoViewIfNeeded(false);
}

async function maSaveStructure(msg) {
    try {
        await api('PUT', `/my-addons/${encodeURIComponent(MA.addon.id)}/structure`, { structure: MA.structure });
        MA.addon.has_structure = Object.keys(MA.structure.files || {}).length > 0;
        showToast(msg || '已保存');
        return true;
    } catch (e) {
        showToast(e.message || '保存失败');
        return false;
    }
}

// ---------- 导入扫描结果：支持扫描生成的 HTML（含 const D / META / SUB）或导出的 JSON ----------
function maParseStructureFile(text) {
    const t = text.trim();
    if (t.startsWith('{')) {
        const j = JSON.parse(t);
        return j.files ? j : { files: j };
    }
    const grab = name => {
        const m = new RegExp(`const\\s+${name}\\s*=\\s*(\\{.*\\});?\\s*$`, 'm').exec(text);
        return m ? m[1] : null;
    };
    const D = grab('D');
    if (!D) throw new Error('没有在文件里找到脚本结构数据');
    const META = grab('META');
    const SUB = grab('SUB');
    const sub = {};
    if (SUB) for (const m of SUB.matchAll(/([\w$]+)\s*:\s*"([^"]*)"/g)) sub[m[1]] = m[2];
    let meta = {};
    try { meta = META ? JSON.parse(META) : {}; } catch (e) { meta = {}; }
    return { ver: meta.ver || '', date: meta.date || '', sub, files: JSON.parse(D) };
}

// 只保留访客需要的字段；以 _ 开头的测试钩子不展示
function maCleanImported(s, keepDesc) {
    const old = (MA.structure && MA.structure.files) || {};
    const files = {};
    for (const [k, f] of Object.entries(s.files || {})) {
        files[k] = {
            l: Number(f.l) || 0,
            d: keepDesc && old[k] && old[k].d ? old[k].d : (f.d || ''),
            i: (f.i || []).map(x => [x[0], (x[1] || []).filter(n => !String(n).startsWith('_')), x[2] ? 1 : 0]),
            x: (f.x || []).filter(n => !String(n).startsWith('_')),
            e: f.e || []
        };
    }
    return {
        ver: s.ver || '', date: s.date || '',
        root: s.root || (MA.structure && MA.structure.root) || '',
        sub: Object.keys(s.sub || {}).length ? s.sub : ((MA.structure && MA.structure.sub) || {}),
        files
    };
}

function maPickImportFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,.json,text/html,application/json';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        try {
            const parsed = maParseStructureFile(await file.text());
            const n = Object.keys(parsed.files).length;
            const hasOld = MA.structure && MA.structure.files && Object.keys(MA.structure.files).length;
            if (!confirm(`读取到 ${n} 个文件${parsed.ver ? `（${parsed.ver}）` : ''}，要替换现在的脚本结构吗？`)) return;
            const keep = hasOld ? confirm('已有文件的说明是否保留你改过的版本？\n\n确定 = 保留现在的说明（只有新文件用扫描结果的说明）\n取消 = 全部用扫描结果的说明') : false;
            MA.structure = maCleanImported(parsed, keep);
            MA.structureFor = MA.addon.id;
            MA.file = null;
            if (await maSaveStructure(`已导入 ${n} 个文件`)) renderAddonDetail();
        } catch (e) {
            showToast('导入失败：' + (e.message || '格式不正确'));
        }
    };
    input.click();
}

// ==================== 编辑弹窗 ====================
function maEnsureModals() {
    if (document.getElementById('maEditModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="maEditModal">
        <div class="modal-card ma-modal">
            <h3 id="maEditTitle">编辑附加包</h3>
            <div class="modal-field"><label>名称<span class="required-mark">*</span></label><input id="maName" maxlength="60"></div>
            <div class="modal-field"><label>副标题</label><input id="maSubtitle" maxlength="120" placeholder="一句话说明，比如：我的世界基岩版 · 武道修炼附加包"></div>
            <div class="modal-field"><label>简介 <span class="field-hint">（显示在标题下面，建议两三句话）</span></label><textarea id="maIntro" maxlength="1000" style="min-height:70px"></textarea></div>
            <div class="modal-field"><label>介绍 <span class="field-hint">（「介绍」标签里的详细内容，支持换行，网址会自动变成链接）</span></label><textarea id="maDesc" maxlength="20000" style="min-height:150px"></textarea></div>
            <div class="modal-field"><label>下载链接 <span class="field-hint">（每行一个：名称 | 链接，第一个会作为主按钮）</span></label>
                <textarea id="maLinks" class="ma-mono" style="min-height:80px" placeholder="蓝奏云 | https://...&#10;123云盘 | https://..."></textarea></div>
            <div class="modal-field"><label>封面图片链接</label><input id="maCover" maxlength="1000" placeholder="可选，https://..."></div>
            <div class="modal-actions">
                <button class="btn" data-ma-close>取消</button>
                <button class="btn btn-primary" id="maEditSave">保存</button>
            </div>
        </div>
    </div>
    <div class="modal-overlay" id="maLogModal">
        <div class="modal-card ma-modal ma-log-modal">
            <h3>编辑更新日志</h3>
            <p class="ma-log-help">格式和你平时写的一样：<code>稳定版更新日志</code> / <code>测试版更新日志</code> 分组，<code>v1.8.8</code> 或 <code>v1.9.0-某某更新</code> 开始一个版本，<code>1.xxx</code> 是条目，前面加 4 个空格是子条目，版本之间单独一行是提示。新版本写在最后面。</p>
            <textarea id="maLogText" class="ma-mono" spellcheck="false"></textarea>
            <div class="modal-actions">
                <button class="gm-btn" id="maLogAddVer">＋ 插入新版本</button>
                <span style="flex:1"></span>
                <button class="btn" data-ma-close>取消</button>
                <button class="btn btn-primary" id="maLogSave">保存</button>
            </div>
        </div>
    </div>`);
    for (const id of ['maEditModal', 'maLogModal']) {
        const m = document.getElementById(id);
        let down = false;
        m.addEventListener('pointerdown', e => { down = e.target === m; });
        m.addEventListener('click', e => {
            if ((e.target === m && down) || e.target.closest('[data-ma-close]')) {
                if (id === 'maLogModal' && maLogDirty() && !confirm('更新日志还没保存，确定关闭吗？')) return;
                m.classList.remove('show');
            }
            down = false;
        });
    }
    document.getElementById('maEditSave').addEventListener('click', maSaveInfo);
    document.getElementById('maLogSave').addEventListener('click', maSaveLog);
    document.getElementById('maLogAddVer').addEventListener('click', () => {
        const ta = document.getElementById('maLogText');
        const vs = parseChangelog(ta.value).filter(v => v.group === 'stable');
        const last = vs.length ? vs[vs.length - 1].ver : 'v1.0.0';
        const p = last.replace(/^v/, '').split('.').map(n => Number(n) || 0);
        while (p.length < 3) p.push(0);
        p[p.length - 1]++;
        const add = `\n\nv${p.join('.')}\n1.`;
        ta.value = ta.value.replace(/\s+$/, '') + add;
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        ta.scrollTop = ta.scrollHeight;
    });
}

let maEditingNew = false;
let maLogOriginal = '';
function maLogDirty() {
    return document.getElementById('maLogText').value !== maLogOriginal;
}

function maOpenEdit(isNew) {
    maEnsureModals();
    maEditingNew = isNew;
    const a = isNew ? { name: '', subtitle: '', intro: '', description: '', links: [], cover: '' } : MA.addon;
    document.getElementById('maEditTitle').textContent = isNew ? '新增附加包' : '编辑附加包';
    document.getElementById('maName').value = a.name;
    document.getElementById('maSubtitle').value = a.subtitle;
    document.getElementById('maIntro').value = a.intro;
    document.getElementById('maDesc').value = a.description || '';
    document.getElementById('maLinks').value = a.links.map(l => `${l.label} | ${l.url}`).join('\n');
    document.getElementById('maCover').value = a.cover;
    document.getElementById('maEditModal').classList.add('show');
}

async function maSaveInfo() {
    const v = id => document.getElementById(id).value.trim();
    const links = [];
    for (const line of document.getElementById('maLinks').value.split('\n')) {
        if (!line.trim()) continue;
        const i = line.lastIndexOf('|');
        const url = (i >= 0 ? line.slice(i + 1) : line).trim();
        const label = (i >= 0 ? line.slice(0, i) : '').trim() || '下载';
        if (!/^https?:\/\//i.test(url)) { showToast(`链接要以 http:// 或 https:// 开头：${url}`); return; }
        links.push({ label, url });
    }
    const body = { name: v('maName'), subtitle: v('maSubtitle'), intro: v('maIntro'), description: document.getElementById('maDesc').value.trim(), links, cover: v('maCover') };
    if (!body.name) { showToast('请填写名称'); return; }
    const btn = document.getElementById('maEditSave');
    btn.disabled = true;
    try {
        if (maEditingNew) {
            const r = await api('POST', '/my-addons', body);
            document.getElementById('maEditModal').classList.remove('show');
            showToast('已新增');
            location.hash = '#addons/' + encodeURIComponent(r.id);
        } else {
            await api('PUT', `/my-addons/${encodeURIComponent(MA.addon.id)}`, body);
            document.getElementById('maEditModal').classList.remove('show');
            showToast('已保存');
            renderAddonsPage(MA.addon.id + '/' + MA.tab);
        }
    } catch (e) {
        showToast(e.message || '保存失败');
    } finally {
        btn.disabled = false;
    }
}

function maOpenLog() {
    maEnsureModals();
    maLogOriginal = MA.addon.changelog || '';
    document.getElementById('maLogText').value = maLogOriginal;
    document.getElementById('maLogModal').classList.add('show');
    const ta = document.getElementById('maLogText');
    setTimeout(() => { ta.scrollTop = ta.scrollHeight; }, 50);
}

async function maSaveLog() {
    const text = document.getElementById('maLogText').value;
    const btn = document.getElementById('maLogSave');
    btn.disabled = true;
    try {
        await api('PUT', `/my-addons/${encodeURIComponent(MA.addon.id)}`, { changelog: text });
        MA.addon.changelog = text;
        maLogOriginal = text;
        document.getElementById('maLogModal').classList.remove('show');
        showToast('更新日志已保存');
        renderAddonsPage(MA.addon.id + '/' + MA.tab);
    } catch (e) {
        showToast(e.message || '保存失败');
    } finally {
        btn.disabled = false;
    }
}

// ==================== 事件 ====================
function setupMyAddonsEvents() {
    document.getElementById('myAddonsBtn').addEventListener('click', () => { location.hash = '#addons'; });
    document.getElementById('addonsBackBtn').addEventListener('click', () => {
        const r = parseRoute();
        if (r.page === 'addons' && r.arg) { location.hash = '#addons'; return; }
        history.replaceState(null, '', location.pathname + location.search);
        showPage('home');
    });

    const page = document.getElementById('pageAddons');
    page.addEventListener('input', (e) => {
        if (e.target.id === 'maSearch') {
            MA.query = e.target.value;
            renderMaTree();
        }
    });
    page.addEventListener('keydown', (e) => {
        if (e.target.id === 'maDescInput') {
            if (e.key === 'Enter') { e.preventDefault(); page.querySelector('[data-ma-desc-save]').click(); }
            if (e.key === 'Escape') { MA.editingDesc = false; renderMaDetail(); }
        }
    });
    page.addEventListener('click', async (e) => {
        const t = e.target;
        const get = sel => t.closest(sel);
        let el;
        if (get('[data-ma-new]')) { maOpenEdit(true); return; }
        if ((el = get('[data-ma-tab]'))) {
            const tab = el.dataset.maTab;
            if (tab === MA.tab) return;
            MA.tab = tab;
            currentAddonsArg = MA.addon.id + (tab === 'intro' ? '' : '/' + tab);
            history.replaceState(history.state, '', `#addons/${encodeURIComponent(MA.addon.id)}${tab === 'intro' ? '' : '/' + tab}`);
            document.querySelectorAll('.ma-tab').forEach(b => {
                b.classList.toggle('active', b.dataset.maTab === tab);
                b.setAttribute('aria-selected', b.dataset.maTab === tab);
            });
            renderAddonTab();
            if (el.classList.contains('ma-more')) document.querySelector('.ma-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        if ((el = get('[data-ma-link]'))) {
            const l = MA.addon.links[Number(el.dataset.maLink)];
            if (l) showExternalWarning(l.url, () => window.open(l.url, '_blank', 'noopener,noreferrer'));
            return;
        }
        if ((el = get('[data-ip-url]'))) {
            const href = el.dataset.ipUrl;
            showExternalWarning(href, () => window.open(href, '_blank', 'noopener,noreferrer'));
            return;
        }
        if (get('[data-ma-edit]')) { maOpenEdit(false); return; }
        if (get('[data-ma-edit-log]')) { maOpenLog(); return; }
        if (get('[data-ma-delete]')) {
            if (!confirm(`确定删除「${MA.addon.name}」吗？简介、更新日志、脚本结构都会一起删除，无法恢复。`)) return;
            try {
                await api('DELETE', `/my-addons/${encodeURIComponent(MA.addon.id)}`);
                showToast('已删除');
                MA.addon = null;
                location.hash = '#addons';
            } catch (err) { showToast(err.message); }
            return;
        }

        // ----- 脚本结构 -----
        if ((el = get('[data-ma-path]'))) {
            const p = el.dataset.maPath;
            if (MA.openDirs.has(p)) MA.openDirs.delete(p); else MA.openDirs.add(p);
            renderMaTree();
            return;
        }
        if ((el = get('[data-ma-file]'))) { maSelectFile(el.dataset.maFile, !el.closest('.ma-tree')); return; }
        if ((el = get('[data-ma-dir]'))) {
            const g = el.dataset.maDir;
            const pre = { main: '', fx: 'fx/', core: 'core/', cfg: 'config/' }[g] ?? (g + '/');
            const first = Object.keys(MA.structure.files).sort().find(k => g === 'main' ? !k.includes('/') : k.startsWith(pre));
            MA.query = '';
            const s = document.getElementById('maSearch');
            if (s) s.value = '';
            if (first) {
                maSelectFile(first, false);
                document.querySelector('.ma-browser').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            return;
        }
        if (get('[data-ma-desc-edit]')) { MA.editingDesc = true; renderMaDetail(); return; }
        if (get('[data-ma-desc-cancel]')) { MA.editingDesc = false; renderMaDetail(); return; }
        if (get('[data-ma-desc-save]')) {
            const f = MA.structure.files[MA.file];
            const before = f.d;
            f.d = document.getElementById('maDescInput').value.trim();
            if (await maSaveStructure('说明已保存')) { MA.editingDesc = false; renderMaTree(); renderMaDetail(); }
            else f.d = before;
            return;
        }
        if (get('[data-ma-lines]')) {
            const f = MA.structure.files[MA.file];
            const v = prompt('这个文件有多少行？', f.l);
            if (v === null) return;
            const n = Math.max(0, Math.round(Number(v)));
            if (!Number.isFinite(n)) { showToast('请输入数字'); return; }
            const before = f.l;
            f.l = n;
            if (await maSaveStructure()) { renderAddonTab(); } else f.l = before;
            return;
        }
        if (get('[data-ma-del-file]')) {
            const k = MA.file;
            if (!confirm(`从结构里删除 ${k} 吗？（不会影响你的附加包本身）`)) return;
            const backup = MA.structure.files[k];
            delete MA.structure.files[k];
            if (await maSaveStructure('已删除')) { MA.file = null; renderAddonTab(); }
            else MA.structure.files[k] = backup;
            return;
        }
        if (get('[data-ma-add-file]')) {
            const k = (prompt('新文件的路径（相对脚本目录），例如 systems/world/newThing.js', MA.file ? MA.file.replace(/[^/]+$/, '') : 'systems/') || '').trim().replace(/^\/+/, '');
            if (!k) return;
            if (MA.structure.files[k]) { showToast('这个文件已经存在'); maSelectFile(k, true); return; }
            const d = (prompt('这个文件是做什么的？（一句话说明）', '') || '').trim();
            MA.structure.files[k] = { l: 0, d, i: [], x: [], e: [] };
            if (await maSaveStructure('已新增')) { MA.file = k; renderAddonTab(); }
            else delete MA.structure.files[k];
            return;
        }
        if (get('[data-ma-import]')) { maPickImportFile(); return; }
        if (get('[data-ma-export]')) {
            const blob = new Blob([JSON.stringify(MA.structure, null, 1)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${MA.addon.name}-脚本结构.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }
    });
}
