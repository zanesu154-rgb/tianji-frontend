// 公告轮播

// ==================== 公告轮播 ====================
let announcementList = [];
let announcementIndex = 0;
let announcementTimer = null;
let announcementRafId = null;

async function fetchAnnouncement() {
    try {
        const res = await fetch(`${API_BASE}/settings/announcement`);
        const data = await res.json();
        const raw = (data.value || '欢迎来到天际译栈！').toString();
        announcementList = raw.split(/\n/).map(s => s.trim()).filter(s => s.length > 0);
        if (announcementList.length === 0) {
            announcementList = ['欢迎来到天际译栈！'];
        }
    } catch (e) {
        announcementList = ['欢迎来到天际译栈！'];
    }
    renderAnnouncement();
    startAnnouncementRotate();
}

function renderAnnouncement() {
    const track = document.getElementById('announcementTrack');
    if (!track) return;

    // 末尾复制第一条，实现 A-B-C-A 无缝循环
    const list = announcementList.length > 1
        ? [...announcementList, announcementList[0]]
        : [...announcementList];

    track.innerHTML = list
        .map(text => `<div class="announcement-text"><span>${escapeHtml(text)}</span></div>`)
        .join('');

    announcementIndex = 0;
    resetTrackPosition();
    requestAnimationFrame(() => {
        checkAnnouncementOverflow();
    });
}

function resetTrackPosition() {
    const track = document.getElementById('announcementTrack');
    if (!track) return;
    track.style.transition = 'none';
    track.style.transform = 'translateY(0)';
    void track.offsetHeight;
    track.style.transition = '';
}

function checkAnnouncementOverflow() {
    const viewport = document.getElementById('announcementViewport');
    const items = document.querySelectorAll('#announcementTrack .announcement-text');
    if (!viewport || !items.length) return;

    // 视口宽度要扣掉右侧编辑/关闭按钮宽度（约 40px）
    const reservedRight = 44;
    const viewportWidth = viewport.clientWidth - reservedRight;

    items.forEach(el => {
        const span = el.querySelector('span');
        if (!span) return;
        el.classList.remove('scrolling');
        el.dataset.overflow = '0';
        // 量实际宽度
        const textWidth = span.scrollWidth;
        if (textWidth > viewportWidth) {
            el.dataset.overflow = '1';
            el.dataset.textWidth = textWidth;
        }
    });
}

// 单条公告展示：停顿 → 滚动 → 停顿 → 下一条
function playAnnouncement(index) {
    const track = document.getElementById('announcementTrack');
    if (!track) return;
    const items = track.querySelectorAll('.announcement-text');
    if (!items.length) return;

    // 先把当前条目滚到对应位置
    const lineHeight = items[0].offsetHeight || 21;
    track.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    track.style.transform = `translateY(-${index * lineHeight}px)`;

    const el = items[index];
    if (!el) return;
    const span = el.querySelector('span');
    if (!span) return;

    // 重置 span 位置
    span.style.transition = 'none';
    span.style.transform = 'translateX(0)';
    void span.offsetHeight;

    const isOverflow = el.dataset.overflow === '1';

    // 停顿 2 秒
    announcementTimer = setTimeout(() => {
        if (!isOverflow) {
            // 不超长，直接进下一条
            nextAnnouncement(index);
            return;
        }

        // 超长：滚动
        const viewport = document.getElementById('announcementViewport');
        const reservedRight = 44;
        const visibleWidth = viewport.clientWidth - reservedRight;
        const textWidth = span.scrollWidth;
        const scrollDistance = textWidth - visibleWidth;

        if (scrollDistance <= 0) {
            nextAnnouncement(index);
            return;
        }

        // 滚动速度：35 px/秒（可根据需要调整，数值越小越慢）
        const SPEED = 35;
        const duration = (scrollDistance / SPEED) * 1000;

        span.style.transition = `transform ${duration}ms linear`;
        span.style.transform = `translateX(-${scrollDistance}px)`;

        // 滚动结束后等待 2 秒，切下一条
        announcementTimer = setTimeout(() => {
            nextAnnouncement(index);
        }, duration + 2000);
    }, 6000);
}

function nextAnnouncement(currentIndex) {
    const next = currentIndex + 1;
    const track = document.getElementById('announcementTrack');
    if (!track) return;
    const items = track.querySelectorAll('.announcement-text');
    if (!items.length) return;

    const lineHeight = items[0].offsetHeight || 21;

    if (next >= announcementList.length) {
        // 到达假 A：先平滑滚过去
        track.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
        track.style.transform = `translateY(-${next * lineHeight}px)`;

        // 动画结束后无动画重置回真 A
        setTimeout(() => {
            track.style.transition = 'none';
            track.style.transform = 'translateY(0)';
            void track.offsetHeight;

            document.querySelectorAll('#announcementTrack .announcement-text > span').forEach(sp => {
                sp.style.transition = 'none';
                sp.style.transform = 'translateX(0)';
            });

            setTimeout(() => {
                playAnnouncement(0);
            }, 150);
        }, 520);
    } else {
        playAnnouncement(next);
    }
}

function startAnnouncementRotate() {
    if (announcementTimer) clearTimeout(announcementTimer);
    if (announcementRafId) cancelAnimationFrame(announcementRafId);
    if (announcementList.length === 0) return;

    // 延迟一点等 DOM 就绪
    setTimeout(() => {
        playAnnouncement(0);
    }, 200);
}

async function saveAnnouncement(value) {
    return api('PUT', '/settings/announcement', { value });
}
