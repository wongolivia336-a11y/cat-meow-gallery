# 图片素材交接单 · 稚拙手绘 doodle 风

给生图 Agent 的需求说明。**先读「分工原则」再看清单**，否则容易画出用不上的东西。

---

## 分工原则：会变的交给代码，不变的交给图

这个项目的泡泡尺寸是连续变化的（`app.js` 里 `154px ~ 278px` 之间任意值，由录音时长和响度算出），
颜色也随情绪旋转色相。**任何需要随数据缩放或变色的东西，都不能用位图**——
手绘线条一拉伸，笔触粗细就崩了。

所以：

| 交给生图 Agent ✅ | 已由 CSS 生成 ⚙️（不用画） |
|---|---|
| 猫咪主角（首页 mascot） | 泡泡外框、卡片边、按钮边 |
| 空状态插画（一颗都没有时） | 所有抖动线条（4 种笔迹随机分配） |
| 6 个声音类型图标 | 波形条 |
| 装饰性 doodle 小件 | 纸纹颗粒、手账方格 |
| 真实纸张扫描纹理（可选） | 硬边偏移投影 |

---

## 两个必须提前规避的坑

### 1. 一致性：一次生成，不要分次

6 个图标分 6 次生成，线宽、笔触、饱和度必然对不齐，拼在一起会很脏。

**做法**：让模型在**一张图里**画完整套，再切片。prompt 里明确网格结构：

> a 3x2 grid of six icons on a plain white background, evenly spaced, uniform line weight

单次生成内模型会自发保持风格一致，这是目前最可靠的一致性手段。

### 2. 透明底：模型给不出干净 alpha

要么统一生成在**纯白底**上后期抠图，要么接受"贴纸感"——
本项目纸底是米黄 `#fbf2e0`，白边贴纸压在米黄纸上，在稚拙风里反而是加分的。
**建议直接走贴纸路线，省一道工序。**

---

## 风格锚点（每个 prompt 都带上）

```
naive childlike crayon drawing, wobbly uneven hand-drawn ink outline,
flat opaque fill with slight off-register color (fill spills past the line),
warm dark brown ink #463a30 outline, NOT black,
visible paper grain, no gradients, no gloss, no 3D, no drop shadow,
picture-book illustration, slightly clumsy proportions
```

**关键几条的理由**：
- `off-register`（颜色没涂准、溢出线外）——这是稚拙风最有效的单一特征，比线条抖动还管用
- `brown ink not black`——纯黑会让画面立刻变回矢量卡通
- `no gradients / no gloss`——渐变是玻璃感的语言，和这一版设计直接冲突

## 配色（务必锁死，让模型只用这几个色）

```
纸底 #fbf2e0   墨线 #463a30
粉 #f58ba8   黄 #f6c445   薄荷 #74c4a8
天蓝 #7fb2e5   紫 #b096dd   橘红 #ee7b58
```

---

## 素材清单

### A. 猫咪主角 — `assets/cat-mascot.png`（替换现有）
坐着的猫，旁边飘着几颗泡泡。尺寸约 900×900，透明底或白底。
> a naive childlike crayon drawing of a chubby cat sitting beside floating soap bubbles, [风格锚点]

### B. 空状态插画 — `assets/empty-state.png`
猫对着空罐子/没吹起来的泡泡棒发呆。约 700×700。
> a naive childlike crayon drawing of a cat looking at an empty bubble wand, slightly disappointed, [风格锚点]

### C. 声音类型图标 ×6 — `assets/moods.png`（一张 sprite sheet，3×2）
六格内容（顺序固定，代码按索引切）：
1. 撒娇喵 — 张嘴的猫头，几条短弧线代表声音
2. 呼噜 — 闭眼的猫头，三条波浪线
3. 饭盆通知 — 猫爪拍碗
4. 半夜叫 — 月亮 + 猫剪影
5. 啾啾 — 猫抬头看鸟，小鸟一只
6. 抗议 — 炸毛猫，头顶闪电

> a 3x2 grid of six simple icons on a plain white background, evenly spaced, uniform line weight: [六格内容], [风格锚点]

### D. 装饰小件 — `assets/doodles.png`（一张 4×2 sprite sheet）
爪印 / 小鱼骨 / 毛线球 / 五角星 / 小心心 / 短波浪线 / 小音符 / 泡泡串。
每个都要极简，2~5 笔画完。
> a 4x2 grid of tiny minimal doodle stickers on a plain white background: [内容], each drawn in 2-5 strokes, [风格锚点]

### E. 纸张纹理（可选）— `assets/paper.jpg`
水彩纸/牛皮纸扫描质感，无内容，可平铺。约 1200×1200。
拿到后在 `styles.css` 的 `body::before` 里把那行 `url("data:image/svg+xml,...")`
换成 `url("assets/paper.jpg")` 即可，**其余代码一行都不用动**——那个位置我留了插槽和注释。

---

## 验收标准

拿到素材后逐条对：

- [ ] 线条颜色是暖褐 `#463a30` 一类，不是纯黑
- [ ] 有 off-register（填色溢出轮廓）
- [ ] 没有渐变、高光、投影、3D
- [ ] sprite sheet 内部线宽一致
- [ ] 放到米黄纸底 `#fbf2e0` 上不脏、不跳
- [ ] 缩到 32px（图标）仍能认出是什么
