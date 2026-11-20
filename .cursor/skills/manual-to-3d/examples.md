# 案例：蓝牙无线鼠标说明书 → 3D 演示

脚本：`src/domain/manual/library/mouse-bt54.ts`，原图：`public/manuals/mouse-bt54/`。

## 1. 逐页转写（节选）

| 页 | 小节 | 原文指令 | 实体 | 状态变化 |
|---|---|---|---|---|
| 1 | 包装内容 | 鼠标、USB-A 接收器、Type-C 接收器、USB 充电线、说明书各 1 | 全部配件 | → `package` |
| 1 | 基本参数 | 115×55×22mm、3–10 米、57.7G、450mAh… | — | → `params`，鼠标尺寸 |
| 2 | 产品功能 | DPI 五档 1000–3200；滚轮及翻页键；充电指示灯；左右键 | 滚轮、DPI、充电灯 | 标注 + spin / press |
| 3 | 底部图 | Type-C 充电口、蓝牙/2.4G 开关、电源开关、感光孔、两个接收器 | 底面全部 | 翻面 + 标注 |
| 3 | USB-A 连接 | 拔出接收器 → 插电脑 → 打开电源 → 向右拨到 2.4G → 靠近，黄灯闪几秒熄灭 | 接收器、开关、底部灯 | 换父级、拨钮、`blinkThenOff` |
| 4 | Type-C 连接 | 同上，换 Type-C 接收器和 Type-C 口 | — | 复用 USB-A 步骤 |
| 4 | 蓝牙连接 | 开电源 → 向左拨到蓝牙，蓝灯闪 → 电脑「添加设备」→ 选 BT5.4 Mouse → 已连接 | 屏幕、底部灯 | 屏幕 ui 四个界面 |
| 4 | 使用注意 | 自动回连、3–5 秒延迟、Win 蓝牙 4.0、Mac 滚轮、iOS13 辅助触控 | 屏幕 | 一屏注意事项 |
| 4–5 | 排查 | 检查接收器 / 设备管理器；有无黄灯；换 USB 口；关电源 → 拔插接收器 → 开电源重新配对 | 接收器、开关、灯 | `kind: 'repair'` 8 步 |
| 5 | 充电 | 红灯充电 2–3 小时、充满绿灯、10–25 天、≤ 5V | 线缆、充电灯 | 线缆出现并插入、灯色 |

→ 5 个指南：USB-A（9 步）、Type-C（6）、蓝牙（6）、充电（4）、连不上排查（8）。

## 2. 实体清单与坐标

- 场景：桌面 y=0；笔记本底座 320×220×14 居中（中心 z=-40），左侧三个接口（Type-C、USB×2）；鼠标在右侧 `[250, 0, 30]`。
- 鼠标：`shell` w55 l115 h22，前端 -z；顶部滚轮 / DPI / 充电灯用 `on` 贴表面；底面零件 y≈0、`rot: [90,0,0]` 朝下。
- 底视图左右：翻面（绕 z 180°）后从上方看，画面左 = 鼠标局部 +x。所以说明书底视图左侧的模式开关放在 x=+4，右侧的电源开关放在 x=-13；「向右拨到 2.4G」= 向 -x 移动。
- 开关档位：模式 BT x=7.5 / 2.4G x=0.5；电源 OFF x=-15.5 / ON x=-10.5。
- 接收器：原点在插头与外壳交界，插头朝 +x；插进笔记本左侧（朝 -x 的面）时 `rot: [0,0,0]`，`at.x = -160`。

## 3. 关键片段

拔出（via 出仓口，避免穿壳）：
```ts
'recv-a': { parent: null, at: [205, 42, 70], via: [253, 52, 66], dur: 1.2 },
```

插入（用 `plug`，不要手算 parent/at/rot/via）：
```ts
'recv-a': { plug: { hole: 'port-la2', back: 55 }, lift: 25, dur: 1.8 },
screen: { ui: { cursor: true, toast: '发现新设备 · USB Receiver' }, delay: 1.9 },
```

靠近时绕开笔记本 + 底部灯细节窗：
```ts
const FRONT: Vec3 = [-60, 30, 210]
set: {
  mouse: { parent: null, at: [-265, 0, -40], rot: [0, -60, 0], via: FRONT, lift: 30, dur: 1.8 },
  'status-led': { light: 'blinkThenOff', color: '#f5b400', delay: 1.6 },
},
zoom: { target: 'status-led', dir: 'under', dist: 120, caption: '底部指示灯（从桌面下方看）' },
```

充电线两端各自 `plug`：
```ts
'cable-a': { visible: true, plug: 'port-la2', delay: 1.2, dur: 1.4, lift: 30 },
'cable-c': { visible: true, plug: 'port-c', delay: 1.2, dur: 1.4, lift: 30 },
```

复用：`pairSteps(prefix, recv, portZ, page)` 生成开电源 / 拨 2.4G / 靠近 / 使用。设计走查见 [walkthrough.md](walkthrough.md)。

## 4. 审计与截图里修过的问题

| 现象 | 原因 | 修正 |
|---|---|---|
| 穿地 1.6 mm | 拨钮 / 接收器凸出底面 | 抬高局部 y |
| 途中穿笔记本 | 贴桌面横移 | `via: FRONT` + `lift` |
| 近景标注飞出 / 挡细节窗 | offset 过大 | 25–50 mm，错开细节窗 |
| 接口只看见插头端面 | 镜头正对 | 斜看 |
| 闪烁灯截图是灭的 | 截在灭半周期 | `npm run shoot` 取亮半周期 |
