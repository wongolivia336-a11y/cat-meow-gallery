# 视觉素材交接单 · meow gallery

给生图工具的规格说明。**先读「为什么需要素材」和「必须先做的一件事」，再看清单。**

推荐工具：**Recraft**（能锁风格批量出图，且可导出 SVG，无损缩放）。
其次是任何支持 image-to-image / 风格参考的工具。

---

## 必须先做的一件事：喂多米的真实照片

只给文字描述，模型会给你一只**泛型猫**。那就没有"个性"可言了。

**找 3-5 张多米的照片**（正脸清晰、光线均匀、背景简单），
用工具的 image-to-image 或风格参考功能喂进去。

这是"个性"这个词唯一能落地的地方。少了这一步，下面所有规格都只能产出好看但不属于你的东西。

### 多米的外观（已确定）

参考图：`assets/domi-reference.png`

> **银虎斑短毛猫（银渐层 / 美短银虎斑）。**
> 银白色底毛，背部和头顶有深灰色虎斑纹，胸口、下巴、四只爪子是纯白的。
> 圆脸、圆头、短鼻，**大而圆的浅绿色眼睛**（这是最强的辨识特征）。
> 粉色小鼻头，白色长胡须，短毛蓬松。

**把这段文字 + 参考图一起喂给生图工具。**

⚠️ 参考图本身是照片级 3D 渲染、深色背景 —— 那是**风格反面教材**。
只借用它的"这只猫长什么样"，风格必须完全按下面的锚点走。
prompt 里建议显式加一句 `NOT photorealistic, NOT 3D render`。

---

## 为什么需要素材：代码画不出笔压

现在的猫脸是 canvas 代码画的，问题很具体：

| | 真实手绘 | 代码 |
|---|---|---|
| 耳朵 | 不对称、带弧度、一只高一只低 | 完美等腰三角形 |
| 线条 | 起笔重、收笔轻，有笔压变化 | 全程等宽 |
| 眼睛 | 两只不一样大、位置微偏 | 数学对称 |
| 胡须 | 长短不一、角度随意、带弧 | 精确等距直线 |

**「完美的几何」正是稚拙风的反面。** rough.js 能抖动轮廓，但抖不出笔压和起收笔。

---

## 设计原则：可爱只能集中在一个点

「可爱」和「简约/留白」天生打架。解法是：

> 把可爱压缩到**一两个高密度的点**上，其余地方极度克制。

**多米的脸就是那个点。** 它可以画得很详细。
其余所有元素（泡泡轮廓、按钮、图标）都必须保持极简，不许抢戏。

---

## 交给生图 ✅ / 已由代码生成 ⚙️

| 生图工具做 ✅ | 代码已经在做 ⚙️（别画） |
|---|---|
| 多米的 6 种表情头像 | 泡泡轮廓（尺寸随录音时长连续变化） |
| 多米全身像（空状态用） | 泡泡的抖动手绘线 |
| 纸张纹理（可选） | 破裂动画、碎片 |
| | 收藏的小星星 |

泡泡尺寸在 30–94px 半径之间连续变化，**位图跟不上**，所以轮廓必须留给代码。

---

## 风格锚点（每个 prompt 都带上）

```
naive childlike crayon drawing, wobbly uneven hand-drawn ink outline
with visible pressure variation (thick at stroke start, thin at the flick),
flat opaque fill with slight off-register color (fill spills past the line),
warm dark brown ink #443e37 outline, NOT black,
asymmetric and slightly clumsy — one ear higher than the other,
eyes not exactly the same size, whiskers of uneven length,
no gradients, no gloss, no 3D, no drop shadow, no digital smoothness,
picture-book illustration
```

**几条关键的理由：**

- `pressure variation` — 这是代码做不到、而你最需要的东西
- `off-register`（颜色涂出线外）— 稚拙风最有效的单一特征，比线条抖动还管用
- `asymmetric` / `one ear higher` — 对称是"代码感"的来源，必须主动破坏
- `brown ink not black` — 纯黑会让画面立刻变回矢量卡通
- `no gradients / no gloss` — 渐变是玻璃感的语言，和这版设计直接冲突

## 配色（锁死，只用这些）

```
纸底 #fdfcf9   墨线 #443e37
粉 #f77ea2   黄 #f9c22e   薄荷 #5cc9a7
天蓝 #6aaeee   紫 #a98ce4   橘红 #f4744d
```

---

## 素材 A：多米的 6 种表情（最高优先级）

### 输出规格

- **一张 sprite sheet，3 列 × 2 行**
- 每格 **512 × 512**，整图 **1536 × 1024**
- **纯白背景**（模型给不出干净 alpha，白底我来抠；别用透明底或彩色底）
- 每格里是**一个完整的多米头像**（含头部轮廓、耳朵、五官），居中，四周留 12% 空白
- 6 格线宽必须一致

### 为什么必须一次出一张图

6 个表情分 6 次生成，线宽、笔触、毛色、脸型必然对不齐，拼在一起会很脏。
**单次生成内模型会自发保持一致**，这是目前最可靠的一致性手段。

### 六格内容（顺序固定，代码按索引切）

| 序号 | 位置 | mood id | 表情 |
|---|---|---|---|
| 1 | 左上 | `sweet` | 撒娇：眯眯笑眼，小嘴微张，头微微歪 |
| 2 | 中上 | `food` | 饭盆：眼睛瞪圆发亮，嘴张开，一副"快开饭"的急切 |
| 3 | 右上 | `sleepy` | 困困：闭眼，嘴小小一条，整体往下塌 |
| 4 | 左下 | `purr` | 呼噜：闭眼满足，ω 形嘴，脸颊鼓一点 |
| 5 | 中下 | `mystery` | 疑惑：一只眼睁一只眼眯，头歪，嘴歪 |
| 6 | 右下 | `protest` | 抗议：眉毛下压，嘴张开在叫，耳朵微微后折 |

### prompt 模板

```
A 3x2 grid of six cat head illustrations on a plain pure white background,
evenly spaced, uniform line weight, the SAME cat in all six cells.
The cat (same in every cell): a round-faced silver tabby shorthair kitten,
silvery-white base coat with dark grey tabby stripes on head and back,
pure white chin chest and paws, big round pale-green eyes, pink nose.
NOT photorealistic, NOT a 3D render, NOT fluffy rendered fur —
flat naive crayon illustration only.
Six expressions, left to right, top to bottom:
1) sweet squinting happy eyes with small open mouth, head slightly tilted
2) wide excited round eyes, mouth open, eager
3) eyes closed, tiny line mouth, sleepy and drooping
4) eyes closed contentedly, omega-shaped mouth, cheeks puffed
5) one eye open one squinted, head tilted, crooked mouth, puzzled
6) brows lowered, mouth open mid-yowl, ears folded back, protesting
[风格锚点]
```

---

## 素材 B：多米全身像（空状态用）

一只都还没录的时候显示。多米对着一根没吹起来的泡泡棒发呆。

- 700 × 700，纯白背景

```
a naive childlike crayon drawing of 【多米的外观】 sitting beside
an empty bubble wand, looking slightly disappointed, [风格锚点]
```

---

## 素材 C：纸张纹理（可选）

水彩纸 / 牛皮纸扫描质感，无内容，可平铺，约 1200 × 1200。

拿到后在 `styles.css` 的 `body::before` 里把那行
`url("data:image/svg+xml,...")` 换成 `url("assets/paper.jpg")` 即可，
**其余代码一行都不用动** —— 那个位置留了插槽和注释。

---

## 交付方式

放到 `assets/` 目录，文件名固定（代码按这个名字找）：

```
assets/domi-faces.png     ← 素材 A，1536×1024 的 3×2 sprite sheet
assets/domi-full.png      ← 素材 B
assets/paper.jpg          ← 素材 C（可选）
```

如果 Recraft 能导出 SVG，**优先给 SVG**（`domi-faces.svg`），无损缩放更好。

---

## 验收清单

拿到素材后逐条对：

- [ ] 六格里是**同一只猫**，毛色花纹一致
- [ ] 看得出是多米，不是一只泛型猫
- [ ] 线条颜色是暖褐 `#443e37` 一类，不是纯黑
- [ ] 有笔压变化（线条粗细不均）
- [ ] 有 off-register（填色溢出轮廓）
- [ ] 有不对称（耳朵、眼睛不完全对称）
- [ ] 没有渐变、高光、投影、3D
- [ ] 六格线宽一致
- [ ] 缩到 60px 仍能分辨是哪种表情 ← **最容易翻车的一条**
- [ ] 放到米白底 `#fdfcf9` 上不脏、不跳

最后一条特别重要：泡泡最小的时候脸只有 60px 左右。
细节画太多，缩小后会糊成一团。**宁可简单，不可繁复。**
