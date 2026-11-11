# 天际译栈前端 (tianji-frontend)

纯静态网站，部署在 GitHub Pages，没有构建步骤：改完文件推到 `main` 即上线。

## 文件结构

```
index.html        页面结构（HTML）
css/              样式，按 index.html 里的顺序加载（顺序会影响样式优先级，不要随意调换）
  base.css          主题变量与基础样式
  home.css          主页：公告栏、列表模块、条目卡片、弹窗、页脚
  nav.css           顶部导航栏、搜索面板
  account.css       账户中心
  item-page.css     资源详情页、列表缩略图、大图查看
  layout.css        页面切换动画、响应式、登录注册 Tab
  gm.css            GM 面板
  features.css      消息、投稿、排序、点击量、评分等
  cards.css         主页资源卡片（网格 / 列表视图），最后加载
js/               脚本，普通 <script defer>，按顺序加载，共享全局作用域
  config.js         后端地址 API_BASE、全局状态、主题
  utils.js          工具函数、外部链接提醒
  data.js           数据缓存、API 请求
  announcement.js   公告轮播
  list.js           列表渲染、条目操作、反馈
  edit.js           编辑弹窗、复制/跳转、导入导出
  auth.js           登录状态、登录/注册
  messages.js       站内消息
  submissions.js    投稿
  gm.js             GM 面板
  account.js        账户中心设置
  item-page.js      资源详情页
  ratings.js        排序（默认/热门/最新/评分）与评分
  router.js         页面切换
  sort.js           拖动排序
  ui.js             顶栏、搜索、菜单、公告编辑等界面事件
  main.js           事件绑定入口与初始化（最后加载）
```

每个模块的事件在各自文件的 `setupXxxEvents()` 里注册，由 `main.js` 的 `setupEvents()` 统一调用。

## 更新缓存

`index.html` 里引用 css/js 时带有 `?v=日期` 参数。改了 css/js 后把它改成新的值（全部替换即可），
访客的浏览器才会加载新文件，而不是继续用缓存的旧版本。

## 部署与分享页

网站由 `.github/workflows/deploy.yml` 部署到 GitHub Pages（仓库 Settings → Pages → Source 需选择 **GitHub Actions**）。

部署时 `scripts/build-site.mjs` 会从后端拉取已上架的资源，为每个资源生成分享页 `s/<id>.html`：
页面里带有该资源的标题、简介和封面，QQ / Telegram / Discord 等发送链接时据此显示成卡片，打开后自动跳到详情页。

- 推送到 main：立即部署
- 每 30 分钟：自动重新生成分享页（内容没变时跳过部署）
- 也可以在 Actions 页面手动运行 **Deploy site**
- 还没生成分享页的新资源，链接由 `404.html` 兜底跳转到详情页

本地构建预览：`node scripts/build-site.mjs _site`
