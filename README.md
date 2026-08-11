# meow gallery

[中文](README.md) | [English](README.en.md)

> 手机捉住猫叫，电脑把它吹回来。

meow gallery 是一只装着真实猫声的桌面宠物。多米平时在屏幕角落睡觉、舔爪、观察鼠标；
工作到点后，它拿出泡泡水，把你录下的 meow、purr 和半夜叫吹成一屏可以戳的声音泡泡。

它不是音频管理器，也不是催你打卡的番茄钟，而是一个可以被忽略、也值得偶尔停下来的休息仪式。

[打开网页版](https://domi-meow-gallery.vercel.app/) ·
[下载桌面版](https://github.com/wongolivia336-a11y/cat-meow-gallery/releases/latest) ·
[查看 Releases](https://github.com/wongolivia336-a11y/cat-meow-gallery/releases)

![多米角色设定](assets/domi-character-sheet.png)

---

## 这是什么

**一个休息仪式，不是一个音频管理器。**

这个区别决定了几乎所有设计判断：休息的时候不该看见搜索框和筛选器，
不该需要"阅读"，不该有认知负担。所以空闲 4 秒后界面会整个淡出，只剩泡泡。

### 两套模式，不是两种布局

| | capture（手机） | ambient（电脑） |
|---|---|---|
| 角色 | 工具 | 屏保 / 桌宠 |
| 你在干嘛 | 来录一段猫叫 | 工作累了抬眼看两眼 |
| 录音按钮 | 永远在、永远大 | 收起 |
| 泡泡密度 | 0.16，只当背景 | 一段真实录音对应一颗 |
| 空闲淡出 | ❌ 藏起录音按钮是敌意设计 | ✅ 4 秒后界面退场 |

---

## 三种产品形态

| 形态 | 现在能做什么 | 安装方式 |
|---|---|---|
| 手机 App | 录音、整理、上传猫声，是主要采集端 | Android APK；iOS TestFlight / App Store |
| 网页版 | 免安装体验、账号登录、查看声音泡泡 | 浏览器直接打开 |
| 桌面桌宠 | 常驻桌面四角、定时出场、托盘控制、播放同步声音 | Windows 免安装 ZIP；macOS DMG |

三端使用同一邮箱账号。Supabase Auth 负责邮箱验证码登录，私有 Storage 保存音频，Postgres + RLS
保证每个用户只能读取自己的猫咪、录音、设备和桌宠设置。离线时仍先保存本地，联网后同步。

Supabase Auth 的 `Site URL` 与 Redirect URL allow list 都必须包含
`https://domi-meow-gallery.vercel.app/`。Magic Link 模板若希望发送 6 位验证码而不是确认链接，
应使用 `{{ .Token }}`，客户端会用 `verifyOtp` 完成登录。

## 下载与安装

### 桌面版

官网“关于 · 下载”提供站内下载入口：

- Windows：`/downloads/windows`，免安装 ZIP
- Apple Silicon Mac：`/downloads/mac-arm64`
- Intel Mac：`/downloads/mac-intel`
- Android：`/downloads/android`

安装包由 `.github/workflows/desktop-release.yml` 构建：推送 `v*` 标签会自动生成 Windows 和 macOS 安装包并附加到 Release。

当前测试版尚未购买 Windows/macOS 代码签名证书，系统可能显示“未知发布者”或 Gatekeeper 提示；
正式公开分发前需要补齐签名和 notarization。

### 手机 App

`android/` 与 `ios/` 是 Capacitor 原生工程，共用现有录音和泡泡内核：

- Android 可以由 GitHub Actions 生成可直接安装的 APK；正式上架使用签名 AAB；
- iOS 工程已经生成，但 IPA/TestFlight 必须绑定 Apple Developer 账号、证书和 provisioning profile；
- 原生工程均已声明麦克风用途，Android 配置 `RECORD_AUDIO`，iOS 配置 `NSMicrophoneUsageDescription`。

网页版仍保留 PWA 作为免安装备用入口：

- Android Chrome：打开“关于 · 下载”，点击“安装到手机”；
- iPhone Safari：点击分享按钮，再选择“添加到主屏幕”；
- 安装后以独立窗口运行，核心界面可离线打开。

麦克风录音仍需要 HTTPS 和用户授权。

## 本地运行

### 网页

```bash
python devserver.py 8765
```

### 桌宠（Electron）

泡泡飘在你真实的桌面上，平时整窗**点击穿透**，只有鼠标悬在泡泡上时才接管点击。

```bash
npm install
npm run pet
```

- **托盘图标**单击 → 打开控制界面（录音、筛选、改猫名）
- **多米本体右键** → 打开与托盘相同的休息、清屏和位置设置
- **Esc** → 退回穿透状态
- **退出** → 托盘右键
- **再次唤醒** → 双击桌面或开始菜单里的 `meow gallery`；也可在右键设置中开启“开机自动启动”

### 多米休息提醒（第一版）

- 多米平时在所选桌面角落睡觉，鼠标靠近时会抬眼观察；右键才接管设置
- 默认每 50 分钟从屏幕边缘走入，把用户真实录下的声音逐颗吹回来
- 一段录音严格对应一颗泡泡；收藏少时泡泡更大，收藏多时自动缩小，不复制填屏
- 泡泡被戳破后不会重生；全部戳完即清屏，也可设置 2 / 5 / 10 分钟自动清屏
- 托盘或多米右键可立即休息、清屏、推迟、跳过、暂停，并切换 25 / 50 / 90 分钟
- 锁屏、休眠期间暂停计时，恢复后继续

角色身份基准见 `assets/domi-character-sheet.png`：折耳银渐层、浅绿色大眼、
粉色鼻子旁的一撮黑色特征，以及粉黑相间的爪垫。

> **为什么是桌宠不是屏保**
> 屏保是"你不在的时候"出现的，一动鼠标就退出。
> 而"工作间隙的休息"这个场景里，人就坐在电脑前 —— 屏保根本不会启动。

#### ⚠️ 装机坑：Electron 二进制下不来

`npm install` 会显示成功，但 `node_modules/electron/dist` 是空的 ——
postinstall 从 GitHub Releases 下载被墙掉了，**而且它不报错**。

```bash
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js
```

---

## 代码结构

核心文件保持零构建步骤，直接开浏览器就能跑。界面可在右上角切换中文 / English，桌宠托盘也提供相同语言选项。

```
index.html      结构 + 手绘抖动滤镜的 SVG 定义
styles.css      手绘 UI 系统（设计 token、抖动边框机制、两套模式）
bubbles.js      泡泡场：物理 + 预渲染 + 绘制
domi.js         多米桌宠：预渲染姿态 + 常驻/出场状态机
i18n.js         网页、手机与桌宠控制界面的中英双语文案
app.js          数据、录音、播放、存储、界面逻辑
electron/       桌宠主进程与 preload
```

### bubbles.js 的三层职责

1. **物理层** — Matter.js 只管"泡泡在哪"（位置、速度、碰撞、弹性）
2. **外观层** — rough.js 把每颗泡泡**预渲染成一张小图**，一生只画一次
3. **绘制层** — 每帧只做 `drawImage`，不重算任何手绘线条

> 这是整个项目最重要的性能决策。
> 手绘线条的生成是有成本的，每帧重画 40 颗泡泡的轮廓会让低端机跪掉。
> **"算一次，之后只做变换"是所有动效性能问题的分水岭。**

---

## 几个值得记下来的设计决策

**手绘边框不能直接加 `filter`**
CSS 的 `filter` 会把整个子树先合成成位图再扭曲，子元素写 `filter: none` 完全无效。
所以形状层和内容层必须做**兄弟**而不是父子：伪元素承载 border/填色/投影/滤镜并沉到
`z-index: -1`，文字留在上面保持清晰。

**泡泡里不写字**
休息模式下不该发生"阅读"行为 —— 文字要读，读就是认知负担；表情是"看"的，一眼就过。
标题保留在无障碍镜像和控制界面里，信息没丢。

**泡泡本身就是多米的脸**
不做 6 个不同图标，做同一张脸的 6 种表情。耳朵从泡泡内侧顶出来。
不增加任何元素，却同时拿到可爱 / 个性 / 简约。

六种表情的视觉基准见 `assets/domi-face-doodle-reference.png`。运行时没有直接缩放这张大图，
而是按同一套特征在 Canvas 上预渲染，以适配 30–94px 连续变化的泡泡并保持性能。

**主动把线条画歪**
「完美的几何」正是稚拙风的反面。所以代码里有专门的 `jitterLine` / `inkStroke`，
制造不对称的耳朵、大小不一的眼睛、长短不齐的胡须，以及**笔压**（起笔重、收笔轻）——
这是 rough.js 也给不了的东西。

**桌宠泡泡就是收藏本身**
桌宠不靠预设或复制填满屏幕。一段真实录音严格对应一颗泡泡；零录音就是零泡泡。
收藏少时泡泡更大，收藏多时逐渐缩小，让用户一眼看见自己积累了多少声音。

**降噪只做三件安全的事**
浏览器和 RNNoise 这类降噪模型都是**按人声训练**的，判断"什么该保留"的标准是
人类语音的频谱特征 —— **猫叫很可能被整段判成噪声消掉**。
所以 `noiseSuppression` 默认关闭（可开关，方便 A/B），实际做的是：

1. 高通 120Hz —— 切掉空调风扇的低频轰鸣。猫叫基频 700–1500Hz，完全不受影响
2. 提亮 + 限幅 —— 猫离麦克风远、叫声轻，不提亮戳破了几乎没声音
3. 切首尾静音 —— 泡泡破了却隔半秒才响，因果关系就断了

第 3 条只存裁剪点当元数据、播放时应用，不重新编码 ——
浏览器没法把 AudioBuffer 编回 opus，真裁就只能存 WAV，体积大十倍。

---

## 技术栈

- 原生 JS，无框架，无构建步骤
- [Matter.js](https://github.com/liabru/matter-js) — 2D 物理
- [rough.js](https://github.com/rough-stuff/rough) — 手绘图形
- [站酷快乐体](https://fonts.google.com/specimen/ZCOOL+KuaiLe) — 中文稚拙字体，免费商用
- IndexedDB 存音频 Blob，localStorage 存元数据
- Electron 43 — 桌宠

视觉参考：[Excalidraw](https://github.com/excalidraw/excalidraw)、
[Wired Elements](https://github.com/rough-stuff/wired-elements)、
[oneko.js](https://github.com/adryd325/oneko.js)

---

## 下一步

- [ ] 完成 Apple Developer 签名并发布 iOS TestFlight
- [ ] 为 Windows / macOS 正式分发补齐代码签名与 notarization
- [ ] 继续扩充多米的稚拙手绘动作素材与过渡动画

更多产品笔记见 [PRODUCT_NOTES.md](PRODUCT_NOTES.md)。
