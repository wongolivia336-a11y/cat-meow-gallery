# meow gallery · Next session

更新时间：2026-08-11  
当前稳定版本：`v0.2.5` / `4e11a3e`

## 明天首先处理：iOS 真机与 TestFlight

- [ ] 登录 [Apple Developer 中文站](https://developer.apple.com/cn/)，确认 Apple ID 已开启双重认证。
- [ ] 决定是否加入 Apple Developer Program；TestFlight 与 App Store 分发需要付费开发者计划。
- [ ] 准备一台 Mac，并安装稳定版 Xcode；Windows 电脑不能完成 iOS 签名和上传。
- [ ] 在 Xcode 打开 `ios/App/App.xcodeproj`，选择开发团队并检查 Bundle Identifier 唯一且长期不再改名。
- [ ] 配置 Signing & Capabilities、Development/Distribution Certificate 和 Provisioning Profile。
- [ ] 核对麦克风权限说明、App 名称、图标、启动画面和中英文本地化。
- [ ] 用真实 iPhone 验收：录音、回放、邮箱验证码登录、云同步、离线保存和恢复。
- [ ] 在 App Store Connect 创建 App 条目，补齐隐私政策 URL、录音/账号数据说明、年龄分级和测试信息。
- [ ] Archive 并上传首个 TestFlight 构建，先开放内部测试；记录审核或上传报错。

## 三端产品验收

- [ ] 手机 App：确认中文/English 切换、录音权限和安全区布局。
- [ ] 网页版：确认 Vercel 正式域名、验证码回跳、下载入口和移动浏览器体验。
- [ ] Windows 桌宠：确认多米自由拖拽、重启后位置恢复、右键菜单和托盘双语。
- [ ] macOS 桌宠：在真实 Mac 验证透明窗口、点击穿透、托盘菜单、麦克风权限和 DMG。
- [ ] 云同步：使用同一账号完成“手机录一颗 → 电脑出现一颗 → 点击播放”的端到端验收。
- [ ] 泡泡规则：继续保持零预设、一段真实录音对应一颗泡泡、数量少则大、数量多则缩小。

## 多米视觉资产

- [ ] 在真实桌面观察当前位图动作的清晰度、边缘透明度和不同缩放比例。
- [ ] 优化睡觉、舔爪、观察鼠标、走入、举爪蘸泡泡水、吹泡泡六组姿态之间的过渡。
- [ ] 保持识别特征：折耳银渐层、浅绿眼睛、粉色鼻子旁黑色小斑、粉黑相间爪垫。
- [ ] 如需生成新版素材，先保留候选文件并人工确认，再替换运行时资产。

## 版本管理与发布纪律

- [ ] 开始开发前执行 `git pull --ff-only origin main`，确认工作区干净。
- [ ] 每个可独立回退的功能单独提交，使用清楚的 `feat:` / `fix:` / `docs:` 提交信息。
- [ ] 发布前运行 JS 语法检查、`npm run mobile:sync`、网页冒烟测试和对应平台构建。
- [ ] 同步更新 `package.json`、`package-lock.json`、Service Worker 缓存版本和资源查询版本。
- [ ] 先 Push `main`，确认远端提交；再创建下一个语义化标签（预计 `v0.2.6`）。
- [ ] Push 标签后等待 Desktop release 与 Android release 全部成功。
- [ ] 检查 Release 确实包含 Windows ZIP/EXE、macOS 双架构 DMG 和 Android APK，并测试官网稳定下载链接。
- [ ] iOS 建立可重复签名流程后，再把 TestFlight 构建号与 Git 标签建立对应关系。

## 明天的完成定义

至少完成以下一项可验证结果：

1. iPhone 真机成功安装并完成一次真实录音；或
2. 首个 TestFlight 构建成功上传；或
3. 明确记录 Apple 账号/设备/签名阻塞点，并完成其余三端回归。

任何完成项都需要：代码与文档同步更新、验证记录明确、提交并 Push GitHub。
