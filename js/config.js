// 配置、全局状态、主题

// ==================== 配置 ====================
const API_BASE = 'https://tianji-server-production-d7f3.up.railway.app/api';
const TOKEN_KEY = 'tianji_token';
const THEME_KEY = 'tianji_theme';
const CACHE_KEY = 'tianji_items_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟
const UNREAD_POLL_MS = 90 * 1000; // 未读消息轮询间隔

// ==================== 状态 ====================
let items = [];
let searchQuery = '';
let authToken = localStorage.getItem(TOKEN_KEY) || '';
let isAdmin = false;
let currentUsername = localStorage.getItem('tianji_username') || '';
let currentRole = localStorage.getItem('tianji_role') || '';
let editingItemId = null;
let currentCategory = 'all';
let currentFeedbackItem = { id: '', name: '' };
let unreadCount = 0;
let unreadTimer = null;
let reviewingSubmission = null;   // 管理员正在审核的投稿
let composeTarget = null;         // 发消息对象：{ id, name } 或 'all'
let gmSubStatus = 'pending';

const moduleExpanded = {
    pending: false,
    done: false
};

const STATUS = {
    TODO: 'todo',
    DOING: 'doing',
    DONE: 'done'
};

// ==================== 主题切换 ====================
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { }
}
