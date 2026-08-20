# 内置猫叫声 · 来源与许可

用户还没有自己的录音时，App 里预置的 6 段声音。

**全部为 CC0 或公有领域** —— 这个项目要真实发布（网页 + 桌面安装包 + 移动端），
所以刻意避开了 CC BY-SA 等传染性 copyleft 许可，以及一切来源不明的音频。

素材均来自 Wikimedia Commons。

| 文件 | 对应类型 | 原始名称 | 许可 | 作者 |
|---|---|---|---|---|
| `sweet.ogg` | sweet | Meow of a pleading cat.oga | **Public domain** | Heismark |
| `food.ogg` | food | GettingOutImpatient.ogg | **Public domain** | Heismark |
| `sleepy.ogg` | sleepy | Maullido de gata hembra joven.ogg | **CC0** | George Miquilena |
| `purr.ogg` | purr | Purring cat.oga | **Public domain** | Mysid |
| `mystery.ogg` | mystery | Maullido de gata hembra.ogg | **CC0** | George Miquilena |
| `protest.wav` | protest | Meow of a Siamese cat - freemaster2.wav | **CC0** | freemaster2 |

## 原始链接

- `sweet.ogg` — https://upload.wikimedia.org/wikipedia/commons/6/6b/Meow_of_a_pleading_cat.oga?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original
- `food.ogg` — https://upload.wikimedia.org/wikipedia/commons/c/c0/GettingOutImpatient.ogg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original
- `sleepy.ogg` — https://upload.wikimedia.org/wikipedia/commons/c/c0/Maullido_de_gata_hembra_joven.ogg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original
- `purr.ogg` — https://upload.wikimedia.org/wikipedia/commons/d/db/Purring_cat.oga?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original
- `mystery.ogg` — https://upload.wikimedia.org/wikipedia/commons/1/1c/Maullido_de_gata_hembra.ogg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original
- `protest.wav` — https://upload.wikimedia.org/wikipedia/commons/8/81/Meow_of_a_Siamese_cat_-_freemaster2.wav?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original

## 替换掉它们

这些只是占位，让没有猫（或猫今天不配合）的人也能立刻看到产品长什么样。
用户录下第一段真实的猫叫之后，它们就只是泡泡场里的背景。

## 格式说明

5 个 ogg + 1 个 wav。ogg 在 Chromium（Electron 桌宠）和安卓上都没问题，
但 **iOS Safari 不支持 ogg** —— 移动端 PWA 在 iOS 上这几段会静音回退到合成音。
要彻底解决需要转成 m4a/aac，本机没有 ffmpeg，留作后续。
