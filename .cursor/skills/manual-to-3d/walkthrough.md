# Walkthrough：蓝牙无线鼠标

`src/domain/manual/library/mouse-bt54.ts` 怎么从 5 页说明书长成 5 个指南 33 步。质量标准见该文件与 `npm run check:manuals` 的 audit passed。

## 1. Truth（逐页转写）

| 页 | 变成什么 |
|---|---|
| 1 包装 / 参数 | `package`、`params`、尺寸 115×55×22 |
| 2 顶部功能 | 认识按键步：spin 滚轮、press DPI、zoom |
| 3 底部 + USB-A | 翻面标注 → 拔接收器 → `plug` 进 USB → 开电源 / 拨 2.4G / 靠近黄灯 |
| 4 Type-C / 蓝牙 / 注意 | 复用 `pairSteps`；蓝牙四屏 `ScreenUI` |
| 5 排查 + 充电 | `kind: 'repair'`；线缆两端 `plug` |

完整表见 [examples.md](examples.md)。

## 2. 对象与场景

桌面 y=0；笔记本底座居中（中心 z=-40），左侧三口；鼠标右侧 `[250,0,30]`。
鼠标 `shell`：前方 -z；顶面零件 `{ on }`；底面 `rot: [90,0,0]`。
翻面后画面左 = 局部 +x → 模式开关在底视图左侧所以 x=+4，「向右拨 2.4G」= 向 -x。

## 3. 零件组（31）

- 道具：laptop、keyboard、touchpad、lid、screen、三口
- 本体：mouse shell + 滚轮 / DPI / 充电灯 / 充电口
- 底面：模式槽与拨钮、电源槽与拨钮、丝印、感应孔、状态灯、收纳仓
- 配件：recv-a / recv-c、充电线两端 + cable、说明书

拨钮 y=0.35、接收器收纳 y≈3，避免穿地（审计曾抓到 -1.6 mm）。

## 4. 关键脚本模式

**插入（plug，别手算姿态）**
```ts
'recv-a': { plug: { hole: 'port-la2', back: 55 }, lift: 25, dur: 1.8 },
```

**拔出（via 出仓口）**
```ts
'recv-a': { parent: null, at: [205, 42, 70], via: [253, 52, 66], dur: 1.2 },
```

**绕开笔记本（via + lift）**
```ts
const FRONT: Vec3 = [-60, 30, 210]
const NEAR = { parent: null, at: [-265, 0, -40], rot: [0, -60, 0], via: FRONT, lift: 30, dur: 1.8 }
```

**复用**：`pairSteps(prefix, recv, portZ, page)` 生成开电源 / 拨模式 / 靠近 / 使用。

## 5. 验证里修过的问题

| 现象 | 原因 | 修 |
|---|---|---|
| 穿地 1.6 mm | 拨钮/接收器凸出底面 | 抬高局部 y |
| 途中穿笔记本 | 贴桌面横移 | FRONT via + lift；HOME/FLIP 从 NEAR 回来也绕 |
| 拔出穿壳 | 直线离开 | via 仓口上方 |
| 细节窗灯太小 | dist 过大 / extent 算错 | 调 dist；审计用真实 extent |
| 手机标注出画 | offset 过大 | 挪到对侧 / 减小 |
| 高亮小件无 zoom | 步骤漏了 | 顶部功能步加 zoom |

跑通：`npm run check:manuals` → audit passed；`npm run shoot -- mouse-bt54` → 读 `shots/mouse-bt54/*-sheet.png`。
