# meow gallery

一个私人猫声屏保 App：猫猫的 meow、purr、mrrp、半夜叫不再是音频文件列表，
而是一屏会自由漂浮、互相碰撞、戳一下就"啪"地破掉发出声音的泡泡。

灵感来源是小时候电脑上那个泡泡屏保。

## 交互模型

| 动作 | 结果 |
|---|---|
| 短按泡泡 | 泡泡破裂 → 播放它录到的声音 → 1.5 秒后重新飘回来 |
| 长按泡泡（500ms） | 收藏/取消收藏，泡泡上出现手绘小星星 |
| 吹泡泡按钮 | 开始录音，屏幕中央出现一颗跟着你声音抖动的大泡泡 |
| 筛选 / 搜索 | 不切视图，不符合的泡泡直接淡出飘走 |

## 形态即数据

泡泡长什么样完全由声音决定，这是产品的核心：

- **录得越久 → 泡泡越大**（用 sqrt 收敛，录 30 秒不会撑爆屏幕）
- **声音越响 → 录音时泡泡脉动越大、轮廓抖得越狠**
- **音高越高 → 颜色越暖**（用频谱质心近似基频，够用且便宜）
- **波形起伏越丰富 → 色相偏移越多**

## 技术架构

```
index.html      画布 + 覆盖层 UI + SVG 抖动滤镜定义
styles.css      手绘风格系统（伪元素承载边框吃滤镜，文字层保持清晰）
bubbles.js      泡泡物理场：Matter.js 算位置，rough.js 预渲染贴图，逐帧只 drawImage
app.js          数据层 + 音频层（录音 / IndexedDB / 播放 / 筛选）
vendor/         matter.min.js, rough.js（本地化，为离线 PWA 做准备）
devserver.py    开发服务器，强制 no-store
```

### 三个关键工程决策

**1. 预渲染，不要每帧重画手绘线条**
rough.js 生成手绘线条（每条线画两遍 + 随机扰动）是有成本的。
每颗泡泡在创建时把自己画进一张离屏 canvas，之后每帧只做 `drawImage`。
"算一次然后变换" vs "每帧重算" 是所有动效性能问题的分水岭。

**2. filter 会污染整个子树**
CSS `filter` 把子树先合成成位图再扭曲，子元素写 `filter: none` 无效。
所以手绘边框必须由**伪元素**承载并沉到 `z-index: -1`，
文字作为兄弟层留在上面 —— 否则字全是歪的。

**3. MediaRecorder 不给实时波形**
想让泡泡跟着声音抖，必须另接一条 Web Audio 分析支路
（`createMediaStreamSource` → `AnalyserNode`）。
注意**不要**连到 `destination`，否则麦克风声音会放出来直接啸叫。

## 无障碍

canvas 里的内容屏幕阅读器一个字都读不到。
`#srMirror` 是一个视觉隐藏但可聚焦的镜像列表，键盘和读屏用户从这里戳泡泡。
聚焦时会显形，否则键盘用户不知道自己在哪。

## 暂不做

- 不做猫语 AI 翻译
- 不做公开社区、审核、举报、关系链
- 不做复杂音频剪辑、混音、滤镜
- 不做健康监测和医疗判断

## 桌宠模式（Electron）

泡泡飘在你真实的桌面上，平时整窗点击穿透，只有鼠标悬在泡泡上时才接管点击。

```bash
npm run pet
```

- **托盘图标**：单击切换控制界面（录音、筛选、改猫名）
- **Esc**：退出控制界面，回到穿透状态
- **退出**：托盘右键 → 退出

### 为什么是桌宠而不是屏保

屏保是"你不在的时候"出现的，一动鼠标就退出。
而"工作间隙的休息"这个场景里，人就坐在电脑前 —— 屏保根本不会启动。

### 两个装机坑

**1. Electron 二进制下不来**
`npm install` 会显示成功，但 `node_modules/electron/dist` 是空的 ——
postinstall 从 GitHub Releases 下载被墙掉了，而且它**不报错**。

```bash
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js
```

**2. 不能用 `loadFile()`**
`file://` 的 origin 是 null，不算安全上下文，`getUserMedia` 会被直接拒绝，
录音功能静默失败。所以主进程注册了一个 `meow://` 私有协议
（`registerSchemesAsPrivileged` 里标了 `secure: true`）来加载页面。

## 本地运行

```bash
python devserver.py 8765
```

然后访问 http://127.0.0.1:8765/ 。

用 `python -m http.server` 也能跑，但它会发 `Last-Modified`，
浏览器据此做启发式缓存，改完代码刷新还在跑旧版本 —— 别用。

## 还没做

- [ ] PWA：manifest + Service Worker，可安装到手机主屏、离线可用
- [ ] 真实手绘素材（猫咪、空状态、mood 图标），见 `ASSET_BRIEF.md`
- [ ] 中文手写字体（现在 Comic Sans 只对拉丁字符生效，中文 fallback 到了幼圆）
- [ ] iOS Safari 实机验证：需 HTTPS、播放需用户手势、MediaRecorder 要 14.3+
