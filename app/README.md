# 天际译栈 · 安卓 App

App 是一个外壳（[Capacitor](https://capacitorjs.com/)），打开后直接加载线上网站
`https://zanesu154-rgb.github.io/tianji-frontend/`。**网站更新后 App 里立刻就是新版**，
只有改图标、名字或外壳功能时才需要重新发版。

## 发布新版本

推送一个以 `v` 开头的版本标签，GitHub Actions 会自动编译、签名，并把 APK 挂到 Release：

```bash
git tag v1.0.0
git push origin v1.0.0
```

- 版本号写成 `v主.次.修订`（比如 `v1.2.3`），App 内部版本号会自动算成 10203，保证新版能覆盖安装旧版。
- 也可以在 Actions 页面手动运行「Android APK」，只生成安装包（在运行记录的 Artifacts 里下载），不发 Release。

## 第一次使用：配置签名（只做一次）

安卓 App 必须签名，**以后每个版本都要用同一个签名文件**，丢了就没法覆盖安装旧版，请务必备份。

1. 在自己电脑上生成签名文件（需要装 Java；按提示设置密码，两个密码可以相同）：

   ```bash
   keytool -genkeypair -v -keystore tianji-release.jks -alias tianji -keyalg RSA -keysize 2048 -validity 36500
   ```

2. 把签名文件转成文本：

   ```bash
   # macOS / Linux
   base64 -i tianji-release.jks | tr -d '\n' > keystore.txt
   # Windows PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("tianji-release.jks")) | Out-File keystore.txt
   ```

3. 打开仓库 **Settings → Secrets and variables → Actions → New repository secret**，添加 4 个：

   | 名称 | 内容 |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | keystore.txt 里的全部文字 |
   | `ANDROID_KEYSTORE_PASSWORD` | 签名文件的密码 |
   | `ANDROID_KEY_ALIAS` | `tianji`（上面命令里 `-alias` 后面的名字） |
   | `ANDROID_KEY_PASSWORD` | 密钥的密码 |

   ⚠️ 这些内容不要发给任何人，也不要提交到仓库里。`tianji-release.jks` 自己保存好、多备份一份。

## 更换图标

`icons/` 里有三套图标（`a` 星光书栈、`b` 译字印章、`c` 方块对话），`ICON` 文件里写的是当前用哪一套。
改成别的字母并发一个新版本即可。想用自己的图片，就照着 `icons/a/` 放一套同名 PNG：

- `icon-only.png`：1024×1024 完整图标
- `icon-foreground.png`：1024×1024 透明底，只有中间的图案（安卓自适应图标的前景，图案放在中间约 2/3 范围内）
- `icon-background.png`：1024×1024 背景
- `splash.png`：2732×2732 启动画面

## App 里和网页版不同的地方

网站会自动识别自己是不是在 App 里（`js/app-shell.js`）：

- 安卓返回键：先关弹窗 / 菜单，再返回上一页；在首页连按两次退出
- 下载链接、外部链接交给手机浏览器打开（在 App 里直接下载大多会失败）
- 分享按钮调用系统分享面板
- 启动时检查 GitHub 上有没有新版本 App，有就提示去下载（每天最多提示一次）
- 不显示网页底部的「下载 App」按钮
