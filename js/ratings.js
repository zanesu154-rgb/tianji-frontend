// 排序（默认 / 热门 / 最新 / 评分）与评分

const SORT_KEY = 'tianji_sort';
const VOTER_KEY = 'tianji_voter_id';
const SORT_MODES = ['default', 'hot', 'new', 'rating'];
const SORT_HINTS = {
    hot: '按近 30 天点击量',
    new: '按收录时间',
    rating: '按评分（评分人数少时向全站平均靠拢）'
};
// 评分排序的先验权重：相当于每个资源先有 5 个「全站平均分」的虚拟评分，
// 评分人数少时分数向全站平均靠拢，1 个人打 5 星不会排在多人一致好评的资源前面
const RATING_PRIOR = 5;

let currentSort = (() => {
    try {
        const v = localStorage.getItem(SORT_KEY);
        return SORT_MODES.includes(v) ? v : 'default';
    } catch (e) {
        return 'default';
    }
})();
let myRatings = {};   // { itemId: 我的评分 }

// 访客评分用的匿名标识，保存在本浏览器
function getVoterId() {
    try {
        let id = localStorage.getItem(VOTER_KEY);
        if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
            id = (crypto.randomUUID ? crypto.randomUUID()
                : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12));
            localStorage.setItem(VOTER_KEY, id);
        }
        return id;
    } catch (e) {
        return 'nostorage-' + Math.random().toString(36).slice(2, 12);
    }
}

// ---------- 排序 ----------
function bayesRating(item, mean) {
    const n = item.ratingCount || 0;
    if (!n) return -1;   // 没人评分的排在最后
    return (RATING_PRIOR * mean + item.ratingAvg * n) / (RATING_PRIOR + n);
}

function sortDoneItems(list) {
    if (currentSort === 'default') return list;
    const order = new Map(list.map((it, i) => [it.id, i]));
    const tie = (a, b) => order.get(a.id) - order.get(b.id);   // 同分时保持默认顺序
    const arr = list.slice();
    if (currentSort === 'hot') {
        arr.sort((a, b) => (b.hot || 0) - (a.hot || 0) || tie(a, b));
    } else if (currentSort === 'new') {
        arr.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0) || tie(a, b));
    } else if (currentSort === 'rating') {
        const rated = items.filter(i => i.status === STATUS.DONE && i.ratingCount);
        const total = rated.reduce((s, i) => s + i.ratingCount, 0);
        const mean = total ? rated.reduce((s, i) => s + i.ratingAvg * i.ratingCount, 0) / total : 0;
        arr.sort((a, b) => bayesRating(b, mean) - bayesRating(a, mean)
            || (b.ratingCount || 0) - (a.ratingCount || 0) || tie(a, b));
    }
    return arr;
}

function updateSortBar() {
    document.querySelectorAll('#sortBar .sort-chip').forEach(c => {
        const active = c.dataset.sort === currentSort;
        c.classList.toggle('active', active);
        c.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    let hint = SORT_HINTS[currentSort] || '';
    if (isAdmin && currentSort !== 'default') hint += '（切回默认才能拖动排序）';
    document.getElementById('sortHint').textContent = hint;
}

function setSort(mode) {
    if (!SORT_MODES.includes(mode) || mode === currentSort) return;
    currentSort = mode;
    try { localStorage.setItem(SORT_KEY, mode); } catch (e) { }
    updateSortBar();
    render();
    document.getElementById('doneList').scrollTop = 0;
}

// ---------- 列表上的小标签 ----------
function fmtShortDate(sec) {
    const d = new Date(Number(sec) * 1000);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function itemStatBadges(item) {
    let html = '';
    if (currentSort === 'hot' && item.hot) {
        html += `<span class="item-stat hot" title="近 30 天点击 ${item.hot} 次">🔥 ${item.hot}</span>`;
    }
    if (currentSort === 'new' && item.createdAt) {
        html += `<span class="item-stat" title="收录于 ${escapeHtml(new Date(item.createdAt * 1000).toLocaleDateString())}">${fmtShortDate(item.createdAt)}</span>`;
    }
    if (item.ratingCount) {
        html += `<span class="item-stat rating" title="${item.ratingCount} 人评分">★ ${item.ratingAvg.toFixed(1)}</span>`;
    }
    return html;
}

// ---------- 详情页评分区 ----------
function starsHtml(avg) {
    const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
    return `<span class="stars-static" aria-label="${avg.toFixed(1)} 星">★★★★★<span class="fill" style="width:${pct}%">★★★★★</span></span>`;
}

function ratingSectionHtml(item) {
    const n = item.ratingCount || 0;
    const avg = item.ratingAvg || 0;
    const mine = myRatings[item.id] || 0;
    const summary = n
        ? `<span class="ip-rating-avg">${avg.toFixed(1)}</span>
           <div>${starsHtml(avg)}<div class="ip-rating-count">${n} 人评分</div></div>`
        : `<div>${starsHtml(0)}<div class="ip-rating-count">还没有人评分，来做第一个吧</div></div>`;
    const mineHtml = isAdmin
        ? `<span class="ip-rating-count">管理员的评分不计入</span>`
        : `<span>${mine ? '我的评分' : '点星星评分'}</span>
           <div class="star-input" data-ip-stars>${[5, 4, 3, 2, 1].map(s =>
                `<button type="button" class="${s <= mine ? 'on' : ''}" data-ip-star="${s}" title="${s} 星" aria-label="${s} 星">★</button>`
            ).join('')}</div>
           ${mine ? '<button type="button" class="ip-unrate" data-ip-unrate>撤销</button>' : ''}`;
    return `<div class="ip-rating">
        <div class="ip-rating-summary">${summary}</div>
        <div class="ip-rating-mine">${mineHtml}</div>
    </div>`;
}

async function loadMyRatings() {
    try {
        myRatings = (await api('GET', `/ratings/mine?voterId=${encodeURIComponent(getVoterId())}`)) || {};
    } catch (e) {
        myRatings = {};
    }
    if (currentPage === 'item' && currentItemId) renderItemPage(currentItemId);
}

async function rateItem(id, score) {
    const box = document.querySelector('[data-ip-stars]');
    if (box) box.classList.add('busy');
    try {
        const path = `/ratings/${encodeURIComponent(id)}`;
        const r = score
            ? await api('POST', path, { score, voterId: getVoterId() })
            : await api('DELETE', path, { voterId: getVoterId() });
        if (score) myRatings[id] = score;
        else delete myRatings[id];
        const it = items.find(i => i.id === id);
        if (it) {
            it.ratingAvg = r.avg;
            it.ratingCount = r.count;
            if (!isAdmin) setCachedItems(items);
        }
        if (itemPageFetched && itemPageFetched.id === id) {
            itemPageFetched.ratingAvg = r.avg;
            itemPageFetched.ratingCount = r.count;
        }
        showToast(score ? `已评 ${score} 星，谢谢！` : '已撤销评分');
        render();   // 同时刷新详情页
    } catch (e) {
        showToast(e.message || '评分失败');
        if (box) box.classList.remove('busy');
    }
}

function setupSortBarEvents() {
    document.getElementById('sortBar').addEventListener('click', (e) => {
        const chip = e.target.closest('.sort-chip');
        if (chip) setSort(chip.dataset.sort);
    });
    updateSortBar();
}
