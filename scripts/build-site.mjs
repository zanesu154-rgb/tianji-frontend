// 构建要部署到 GitHub Pages 的站点目录：
//   1. 复制网站文件（index.html、css、js、img）
//   2. 从后端拉取已上架资源，为每个资源生成 s/<id>.html 分享页
//      （带该资源的标题、简介、封面，QQ 等聊天软件据此生成卡片；真人打开后跳到 #item/<id>）
//   3. 生成 404.html：还没生成分享页的新资源也能跳到详情页
//   4. 生成 s/manifest.json，记录分享页内容的哈希，用于判断是否需要重新部署
//
// 用法：node scripts/build-site.mjs <输出目录>
// 环境变量：
//   API_BASE   后端地址，默认读取 js/config.js 里的 API_BASE
//   SITE_URL   网站地址（以 / 结尾），默认 https://zanesu154-rgb.github.io/tianji-frontend/
//   ALLOW_API_FAILURE=1  拉取后端失败时仍然构建（只是没有分享页），否则失败退出

import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) {
    console.error('用法：node scripts/build-site.mjs <输出目录>');
    process.exit(1);
}

const SITE_URL = (process.env.SITE_URL || 'https://zanesu154-rgb.github.io/tianji-frontend/').replace(/\/?$/, '/');
const API_BASE = (process.env.API_BASE || (() => {
    const m = /const API_BASE\s*=\s*['"]([^'"]+)['"]/.exec(readFileSync(join(ROOT, 'js/config.js'), 'utf8'));
    if (!m) throw new Error('js/config.js 里找不到 API_BASE');
    return m[1];
})()).replace(/\/$/, '');

const SITE_NAME = '天际译栈';
const SITE_DESC = '我的世界基岩版附加包汉化分享';
const IMG_WIDE = SITE_URL + 'img/share-card.jpg';
const IMG_SQUARE = SITE_URL + 'img/share-icon.jpg';
const CATEGORY_LABELS = { addon: '附加包', texture: '材质包', shader: '光影', map: '地图' };

function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function summarize(text, max = 100) {
    const t = String(text || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max) + '…' : t;
}

function sharePage(item) {
    const name = item.translated ? `${item.translated}（${item.original}）` : item.original;
    const title = `${name} - ${SITE_NAME}`;
    const description = [
        summarize(item.description) || `${CATEGORY_LABELS[item.category] || '附加包'}汉化版下载`,
        item.mc_version ? `适用 ${item.mc_version}` : '',
        item.translation_version ? `汉化 ${item.translation_version}` : '',
        `作者：${item.author || '佚名'}`
    ].filter(Boolean).join(' · ');
    const cover = String(item.images || '').split('\n').map(s => s.trim()).find(s => /^https?:\/\//i.test(s)) || '';
    const wide = cover || IMG_WIDE;
    const square = cover || IMG_SQUARE;
    const shareUrl = `${SITE_URL}s/${item.id}.html`;
    const target = `${SITE_URL}#item/${encodeURIComponent(item.id)}`;
    // 只用 JS 跳转：抓取程序不执行 JS，会停在本页读取下面的 meta；meta refresh 可能被抓取程序跟随
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(target)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(shareUrl)}">
<meta property="og:image" content="${esc(wide)}">${cover ? '' : `
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">`}
<meta property="og:locale" content="zh_CN">
<meta itemprop="name" content="${esc(title)}">
<meta itemprop="description" content="${esc(description)}">
<meta itemprop="image" content="${esc(square)}">
<link rel="image_src" href="${esc(square)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(wide)}">
<script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')});</script>
<style>body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f6fa;color:#334155}a{color:#1e4a72}</style>
</head>
<body><p>正在打开 <a href="${esc(target)}">${esc(name)}</a> …</p></body>
</html>
`;
}

// GitHub Pages 找不到文件时返回 404.html：
// s/<id>.html 还没生成时跳到该资源的详情页，其他路径回首页
function notFoundPage() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${SITE_NAME}</title>
<script>
(function () {
    var base = ${JSON.stringify(SITE_URL)};
    var m = /\\/s\\/([A-Za-z0-9-]+)(?:\\.html)?\\/?$/.exec(location.pathname);
    location.replace(m ? base + '#item/' + m[1] : base);
})();
</script>
</head>
<body><p>正在跳转到 <a href="${esc(SITE_URL)}">${SITE_NAME}</a> …</p></body>
</html>
`;
}

async function fetchItems() {
    const res = await fetch(`${API_BASE}/items`, { headers: { 'User-Agent': 'tianji-site-builder' } });
    if (!res.ok) throw new Error(`后端返回 ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('后端返回的数据格式不对');
    return rows.filter(r => r && r.status === 'done' && /^[A-Za-z0-9-]{1,100}$/.test(String(r.id)));
}

// ---------- 构建 ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const name of ['index.html', 'css', 'js', 'img']) {
    cpSync(join(ROOT, name), join(OUT, name), { recursive: true });
}
writeFileSync(join(OUT, '.nojekyll'), '');   // 不让 GitHub Pages 用 Jekyll 处理
writeFileSync(join(OUT, '404.html'), notFoundPage());

let items = [];
let apiOk = true;
try {
    items = await fetchItems();
} catch (e) {
    apiOk = false;
    console.error('⚠️ 拉取资源失败：', e.message);
    if (process.env.ALLOW_API_FAILURE !== '1') process.exit(1);
}

mkdirSync(join(OUT, 's'), { recursive: true });
const hash = createHash('sha256');
for (const item of items.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const html = sharePage(item);
    writeFileSync(join(OUT, 's', `${item.id}.html`), html);
    hash.update(item.id).update(html);
}
// 网站文件本身也计入哈希：改了页面代码时也会重新部署
for (const f of ['index.html']) hash.update(readFileSync(join(ROOT, f)));
const digest = hash.digest('hex');
writeFileSync(join(OUT, 's', 'manifest.json'), JSON.stringify({ hash: digest, count: items.length, apiOk }) + '\n');

console.log(`✅ 已生成 ${items.length} 个分享页，哈希 ${digest.slice(0, 12)}`);

// 定时任务：和线上的 manifest 比较，没变化就不部署
if (process.env.GITHUB_OUTPUT) {
    let changed = true;
    if (process.env.SKIP_IF_UNCHANGED === '1') {
        try {
            const live = await (await fetch(SITE_URL + 's/manifest.json', { cache: 'no-store' })).json();
            changed = live.hash !== digest;
        } catch (e) {
            changed = true;
        }
    }
    appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    console.log(changed ? '有变化，需要部署' : '没有变化，跳过部署');
}
