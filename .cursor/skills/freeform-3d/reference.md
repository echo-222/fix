# 自由生成参考：题材配方 · 造型速查 · 动作技巧

形体、状态、动作的完整定义见 [manual-to-3d 的 reference.md](../manual-to-3d/reference.md)，类型以 `src/domain/manual/types.ts` 为准。毫米 / 度 / 秒，Y 向上，地面 y = 0，观众在 +Z。

## 目录
- 题材配方
- 造型速查
- 动作技巧
- 镜头速查
- 最小骨架（JSON）

## 题材配方

| 题材 | 舞台和实物 | 主要手段 |
|---|---|---|
| 烹饪、冲饮 | 台面 slab（1200 × 600）+ 灶 / 电磁炉 + 锅（cylinder r 120）+ 食材（box / 倒角 box / cylinder）+ 量杯、勺 | 食材 `lift` 放进锅（换父级挂到锅上）；勺子 `swing` / `spin` 搅拌；火苗 = 一圈橙色小锥 `swing` 循环；沸腾 = 小球 `slide` 相位错开；chips 写火候和时间 |
| 手工、木工、缝纫 | 工作台 + 材料（slab / poly）+ 工具 compound（锯、钻、针、尺） | 工具 `slide` 来回（锯、画线）；切开 = 一块换成两块（visible 切换）；钻孔 = hole 出现；粘合 / 拼装 = `at` 移到一起 |
| 绳结 | 绳子 = `cable`（两端挂在「绳头」小零件上）或一串短 cylinder；手 / 柱子当参照 | 绳头零件 `via` 沿穿绕路径移动，cable 跟着弯；打紧后的形状用预先摆好的一串 cylinder 换上 |
| 化学、生物实验 | 实验台 + 试管架 + 试管 / 烧杯（cylinder + 杯口深色 hole）+ 液体（矮 cylinder，有颜色的 finish）+ 酒精灯 | 倾倒 = 容器 `rot` + `arc` 绕杯口；液面升高 / 变色 = 换一份液体零件；气泡 = 小球 `slide`；沉淀 = 小 box 在杯底出现；chips 写用量、温度、现象 |
| 人体动作、运动、急救 | 人偶（躯干 box + 头 倒角 box + 四肢 cylinder，按关节挂接）+ 地面 / 垫子 | 关节 `rot`（原点在关节）；循环动作 `swing`（摆臂）/ `slide`（按压，CPR 周期 0.55 s ≈ 110 次 / 分）；callouts 标部位和深度 |
| 软件、App、网页操作 | 手机（slab 72 × 8 × 150 立着）或笔记本 + `screen` | 每步换 `ui`：`title` 页面名、`items` 列表（选中 `selected`、完成 `done`）、`button` + `buttonActive`、`toast`；点按用一个手指零件 `press`，或 `cursor: true` |
| 天文、地理 | 太阳 / 地球 / 月亮 = 倒角 box 球；地面、山体 poly / slab | 公转 = 中心放驱动零件 `spin`，星球挂在它下面离开一段距离；自转 = 星球自己 `spin`；地轴倾斜 `rot: [0, 0, 23.4]`；时间缩放写进 tip |
| 交通、流程、规则 | 路面 slab + 斑马线 + 小车 compound + 红绿灯（led） | 车 `at` 前进；信号灯 `light` 切换；流程的每个环节一个站点，主角零件依次移过去 |
| 数学、几何 | 立体（box / cylinder / poly 挤出）、展开图（sheet + 铰链） | 展开 / 折叠 = sheet 绕铰链 `rot`；切开看截面 = 换件；体积对比 = 并排 + chips 算式 |
| 植物、园艺 | 花盆 cylinder + 土 + 种子 / 茎（cylinder）/ 叶（倒角薄 box） | 生长 = 不同大小的植株依次换件；浇水 = 水壶 `rot` 倾倒 |
| 乐器 | 琴身、琴弦（细 cylinder）、琴键（box） | 弦振动 `slide` 小幅快周期（amp 0.6、period 0.08）；按键 `press` |
| 建筑、结构、搭建 | 地面 + 构件（box / slab / cylinder） | 一层层出现（`visible` + 递增 `delay`）或从旁边 `at` 移进来 |
| 没有说明书的产品用法 | 产品本体 + 使用场景道具 | 按 manual-to-3d 的写法：开关、灯、接口、屏幕 |

## 造型速查

| 东西 | 写法 |
|---|---|
| 球 | `{ "type": "box", "size": [40, 40, 40], "chamfer": 20 }`（chamfer = 半边长） |
| 圆锥 / 火苗 / 笔尖 | `{ "type": "cylinder", "r": 10, "r2": 0, "h": 30 }` |
| 杯、碗、锅 | `cylinder`（`r2` > r 时口大底小）+ 顶面一个深色 `hole`（`rot: [-90, 0, 0]`）当开口 |
| 液体 | 比容器略细略矮的 `cylinder`，`finish: { "color": "#8fc9ef", "roughness": 0.1 }`，挂在容器上 |
| 人偶 | 躯干 box（360 × 520 × 200）→ 上臂 cylinder（原点在肩，形体用 `at` 往下挪半长）→ 前臂（原点在肘）→ 手（倒角 box）；腿同理；头 = 倒角 box 球 |
| 手（拿东西） | 倒角 box（80 × 30 × 100）；拿着的工具挂成手的子零件 |
| 植物叶子 | 薄 box + chamfer，或 `poly` 叶形 |
| 箭头、标牌、指示 | `poly` 画箭头（厚 1–2），或 `text`；能用实物表达时少用箭头 |
| 管子、杆、绳段 | `cylinder`，`axis` 沿长度方向 |
| 软绳、电线 | `cable`：`from` / `to` 挂在零件上，`slack` 调下垂 |
| 地面区域、垫子、桌布 | 薄 `slab`（h 2–20），`r` 圆角 |
| 屏幕 | `screen`（朝 +Z），挂在手机 / 电脑零件上，内容写在状态 `ui` 里 |
| 多块组成的东西 | `compound`：items 各自 `at` / `rot` / `fill` / `finish` |

颜色：线稿模式只有四种 `fill`（white / warm / shade / dark）区分深浅；写实模式用 `finish`（材质名或 `{ color }`）。主角零件、液体、食材都给 `finish` 颜色。

## 动作技巧

**换件（最常用）**：同一个东西的两个样子做成两个零件（面团 → 面饼、清水 → 红色溶液、小苗 → 大苗），放在同一位置；变化那一步写 `{ "old": { "visible": false, "dur": 0.05 }, "new": { "visible": true } }`。几个关键形状依次换，就是「变形」。

**分段出现**：一组零件 `visible: true` + 递增 `delay`（0.2 s 一个），表示依次发生（光线射出、积木一层层搭、频闪照片）。

**跟随**：拿起 = 换父级挂到手 / 工具上（`parent: 'hand'`），放下 = 换回桌面（`parent: null` + `at`）。换父级时不写 `at` 会保持世界位置不动。

**路径**：`lift` 抛物线抬起（放进锅、跨过障碍），`via` 途经一个点（绕过去、穿过去），`arc` 绕一个点转（倾倒、翻开、关节）。

**驱动 / 铰链零件**：要绕不在零件上的点转（公转、绕杯口倒、沿斜面滑），加一个父零件当转轴：`shape: { "type": "text", "text": " ", "size": 0.5 }`（画面上看不见，但必须**保持可见**，隐藏的父零件会把子零件一起藏掉），父零件转 / 动，子零件跟着走。

**循环动作**（不改状态，本步一直播）：

| 动作 | 用途 | 关键参数 |
|---|---|---|
| `press` | 按键、点屏幕、按压 | `depth` |
| `spin` | 搅拌、转轮、风扇、自转 | `axis`、`speed`（圈 / 秒，正 = 从轴正方向看顺时针） |
| `swing` | 摆臂、晃动、翻炒、摆钟 | `axis`、`amp`（度）、`period`、`phase`、`clip` |
| `slide` | 来回推、锯、按压、上下浮、振动 | `axis`、`amp`（mm）、`period`、`phase`、`clip` |
| `shake` | 摇一摇、检查是否装牢 | `axis`、`amp` |

几个零件要同步就写同一个 period / phase / delay；要错开（气泡、火苗）就 phase 依次 + 0.2。

**灯和屏幕**：`led` 的 `light: 'on' | 'blink' | 'blinkThenOff' | 'off'`、`color`；`screen` 的 `ui` 每步换一页。它们在零件过渡开始（`delay`）时切换。

**一步不要太长**：一步的过渡 ≤ 6 s；先后发生的两件事用 `delay` 串起来，超过就拆两步。

## 镜头速查

| 看什么 | dist | dir |
|---|---|---|
| 手掌大小的东西（试管、手机、绳结） | 250–450 | `[0.35, 0.45, 1]` |
| 桌面场景（做菜、实验、手工） | 700–1200 | `[0.4, 0.6, 1]` |
| 人、家具、小房间 | 2500–4500 | `[0.5, 0.35, 1]` |
| 细节窗 zoom | 80–160 | 正对要看的那一面 |

`target` 写零件 id（取这一步结束时它的位置）或世界坐标。不要从正上方 `[0, 1, 0]` 看，除非就是看顶面。

## 最小骨架（JSON）

```json
{
  "id": "pour-over-coffee",
  "name": "手冲咖啡：一杯的 4 个阶段",
  "desc": "从磨豆到萃取，看清水量、温度和时间怎么配合。",
  "category": "烹饪",
  "genre": "tutorial",
  "dims": { "width": 600, "depth": 400, "height": 300 },
  "package": [{ "name": "咖啡豆", "qty": 1, "spec": "15 g，中细研磨" }],
  "params": [{ "label": "粉水比", "value": "1 : 15", "note": "15 g 粉 → 225 ml 水" }],
  "stageSize": 900,
  "notes": "主题 / 受众 / 终点；坐标：台面 y = 0，滤杯在原点；推断：器具尺寸按常见款",
  "parts": [
    { "id": "counter", "name": "台面", "shape": { "type": "slab", "w": 600, "d": 400, "h": 20, "r": 8 }, "fill": "warm", "finish": "wood" },
    { "id": "server", "name": "分享壶", "at": [0, 75, 0], "shape": { "type": "cylinder", "r": 55, "r2": 50, "h": 110 }, "finish": { "color": "#dfe8ec", "roughness": 0.1 } }
  ],
  "guides": [
    {
      "id": "brew", "title": "冲一杯", "kind": "assembly",
      "steps": [
        { "id": "overview", "title": "备好器具", "desc": "滤杯放在分享壶上，旁边是磨好的 15 g 咖啡粉和 92 ℃ 的热水。", "camera": { "target": "server", "dir": [0.4, 0.6, 1], "dist": 900 }, "highlight": ["server"], "orbit": true, "page": 1 }
      ]
    }
  ]
}
```
每一步都要有 `id`、`title`、`desc`、`camera`（`target` / `dir` / `dist`）和 `page`（对应第几张上传图）。注意原点：`cylinder` / `box` 的原点在中心（摆在台面上 y = 台面高 + 半高），`slab` / `shell` / `poly` 的原点在底面。
