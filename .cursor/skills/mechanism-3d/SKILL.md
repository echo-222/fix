---
name: mechanism-3d
description: Turns a mechanical-structure explanation (结构原理图、剖面图、拆解图、机械课讲义、科普页, or a machine to look up) into an interactive 3D demo in the 懂了 Dongle app — real gears with exact meshing, ratios and phases, crank-slider, cams, linkages, planetary sets, locks and escapements, with cutaway housings, exploded assembly and every moving part driven from one synchronized clock. Use when the user asks how a machine / 机械结构 / 传动 / 发动机 / 变速箱 / 锁芯 / 钟表 works, wants an item in the 机械结构 category, or when the website import pipeline classifies an upload as a mechanism.
---

# 机械结构 → 3D 交互演示

产物是一份 `ManualSpec`（`genre: 'tutorial'`、`category: '机械结构'`）：把机器剖开，所有运动件按真实的传动关系一起动，一步讲一级传动。
通用的场景脚本写法见 [manual-to-3d 的 reference.md](../manual-to-3d/reference.md)；这份 skill 只讲机构特有的东西。

- 机构配方（齿轮、齿条、行星轮、曲柄滑块、凸轮、连杆、带 / 链、棘轮、擒纵、锁芯）与剖面、爆炸图：[reference.md](reference.md)
- 样板：`mech-gear-train.ts`（齿轮啮合、传动比、惰轮、齿条）· `mech-planetary.ts`（行星轮、内齿圈用 poly 拼）· `mech-four-stroke.ts`（发动机剖面、曲柄滑块、凸轮配气、隐藏的驱动零件）· `mech-pin-tumbler.ts`（锁芯剖面、弹子被钥匙顶到剪切线）

## 那条真正重要的原则

**零件带零件：每个动作都要有来源。** 先画出传动链（谁是主动件 → 经过什么 → 到输出件），定一个主时钟（主动件转一圈 P 秒），其余每个零件的速度、行程、相位都从传动比算出来。
不要让零件各转各的：齿轮转速和齿数成反比、相邻反向；活塞和曲轴同周期；凸轮轴是曲轴的一半转速。数字对了，画面自然就「咬」上了。

好的机构演示要同时做到：
1. **看得见里面**：外壳只留后半边（剖面），运动件画完整；或者半透明感靠「先整机、再拆外壳」两步。
2. **动得对**：传动比、转向、相位、行程都按尺寸算；啮合处一个齿正对另一个的齿槽。
3. **一级一级讲**：总览全速运转 → 每一步高亮一级传动（主动件、中间件、输出件）→ 最后讲为什么这样设计（减速增扭、换向、配气正时）。

## 工作流

```
- [ ] 0 画传动链：主动件 → … → 输出件，每一级是什么机构（齿轮 / 连杆 / 凸轮 / 带）
- [ ] 1 定数字：齿数、模数、中心距、行程、连杆长、转速比，从原文取，缺的按常见设计推断
- [ ] 2 定坐标和轴：尽量让所有轴平行于同一根坐标轴；剖切面（通常 z = 0，留 z ≤ 0 的壳体）
- [ ] 3 建零件：运动件完整、壳体剖开；转动件原点在轴心；需要组合运动的加隐藏驱动零件
- [ ] 4 定主时钟 P，按传动比算每个 spin / swing / slide 的 speed / amp / period / phase
- [ ] 5 写指南：「看它怎么动」（usage 主线）+「拆开 / 装起来」（assembly，爆炸图）+ 可选「常见故障」（repair）
- [ ] 6 审计归零 + 截图看啮合、同步、剖面
```

### 0. 机构 → 引擎

| 机构 | 写法 |
|---|---|
| 直齿轮 | `gear`（teeth、r = 分度圆半径、h、axis）；啮合：模数相同、中心距 = r₁ + r₂；`spin` 速度比 = 齿数反比、方向相反 |
| 齿条 | `poly` 画齿形；齿轮 `swing` 与齿条 `slide` 同 period / phase，行程 = r × 角度（弧度） |
| 内齿圈 | 两块 `poly` 半圆环（带内齿）拼成 |
| 曲柄滑块（发动机、压缩机） | 曲柄 `spin`；活塞 `slide` + `rod`（连杆长）精确算；连杆挂在活塞下 `swing crank: true` |
| 凸轮 + 从动件 | 凸轮 `poly` 轮廓 + `spin`；从动件 `slide`（`clip: 'pos'`，周期 = 凸轮一圈） |
| 带传动 / 链传动 | 两个轮 `spin`，速度比 = 直径反比、同向；带 / 链静止画（`cable` 或细 box 拼） |
| 棘轮、擒纵、分度 | 一步一格：状态里 `rot` 每步加一个齿的角度；擒纵叉 `swing` |
| 锁芯、卡扣、弹子 | 状态里 `at`（被顶起 / 落下），用 `via` + 负的 `lift` 拼「先升、平走、再落」 |
| 连杆（四连杆、雨刮器） | 曲柄 `spin`，摇杆 `swing`（同 period，amp 按几何算），连杆用 `swing crank` 近似或静止关键帧 |
| 组合运动（只开一段的气门） | 看不见的驱动父零件做一个动作，子零件再叠一个动作 |

**做不了**：带 / 链真的绕着走、弹簧真的压缩、零件形变、流体。带和链静止画、轮子转；弹簧整体平移或几份切换；气流用箭头零件（`poly`）显示 / 隐藏。写进 notes。

### 2–3. 坐标、零件、剖面

- 毫米，Y 向上，地面 y = 0，观众在 +Z。剖切面放在 z = 0：壳体只留 z ≤ 0 那一半（`poly` 画 xy 剖面 `rot: [90, 0, 0]` 挤出，或 compound 拼），运动件完整，镜头从 +Z 稍偏上看。
- 转动件**原点在轴心**；轴沿哪个坐标轴，`gear.axis` / `spin.axis` 就写哪个。挂在转动件上的零件（曲柄销、摇把、记号点）做成子零件，跟着转。
- 齿轮上加一个记号点（深色小 cylinder），转速比才看得出来。

### 4. 主时钟

- 选主动件一圈 P 秒（2–4 s 看得清）。其他零件：齿轮 speed = speed₁ × (−z₁ / z₂)；凸轮轴 = 曲轴 / 2；活塞 period = P；摆动件 period = 曲柄周期。
- 同一指南里所有动作写**同一个 delay**；要让动画从某个相位开始，就给所有动作同一个负 delay（例如从压缩冲程开始）。

### 5. 指南、文案

- 指南 1「看它怎么动」（`kind: 'usage'`）：第 1 步全速运转总览（`orbit: true`）；之后每步高亮一级（主动件 → 中间 → 输出），其余零件照转；最后一步讲设计目的。
- 指南 2「拆开看」/「装起来」（`kind: 'assembly'`）：从整机开始，外壳 → 盖板 → 运动件一件件沿装配方向移开（`at` + `lift`），或反过来一件件装回去。
- 可选「常见故障」（`kind: 'repair'`）：现象 → 原因（打齿、卡死、配错弹子），一步一个。
- title 讲这一级做什么（「曲轴转一圈，活塞走两趟」），desc 讲数字（齿数、传动比、行程），chips 放算式（「i = 36 ÷ 12 = 3」），callouts 标转向和零件名。

### 6. 验证（命令行）

```bash
npm run check:manuals -- <id>
SHOOT_PORT=52xx node scripts/shoot-manuals.mjs <id>
npm run plaza -- manual:<id> && npm run covers -- manual:<id>
```

## 转写要点（网站导入）

机械结构资料（原理图、剖面图、拆解图、讲义）：rows 一条 = 一级传动或一个工作阶段（「曲轴带动凸轮轴，转速减半」「进气冲程：进气门开、活塞下行」），text 照抄原文，change 写成零件的运动（谁转 / 摆 / 往复、方向、和谁同步）。entities 写每个零件的尺寸和运动方式（转动 / 摆动 / 往复 / 静止）。另外加一个字段
"mechanism": { "driver": "主动件", "output": "输出件", "chain": [ { "from": "零件", "to": "零件", "type": "gear | rack | belt | chain | crank-slider | cam | linkage | screw | ratchet | other", "ratio": "传动比或行程（例如 24:12、行程 55 mm）", "note": "" } ], "numbers": [ { "name": "齿数 / 模数 / 行程 / 连杆长 / 转速", "value": "", "source": "原文 / 推断" } ], "cutaway": "要剖开哪些壳体才看得见运动件", "unsupported": ["引擎做不了的（带真的绕着走、弹簧压缩），打算怎么简化"] }。

## 复核清单

- [ ] 传动链完整：每个动的零件都能追到主动件，没有「自己在转」的零件
- [ ] 啮合对：模数相同、中心距 = r₁ + r₂；近看一个齿卡在对面的齿槽里，没有穿插
- [ ] 转速和转向对：转速与齿数成反比、相邻齿轮反向、惰轮不改传动比；带传动同向
- [ ] 同步：活塞、连杆、曲轴同周期；凸轮半速；所有动作同一个 delay
- [ ] 剖面看得清运动件；壳体没有挡住要看的那一级，镜头从剖开的一面看
- [ ] 每步高亮这一级的零件，chips 的传动比 / 行程算式正确
- [ ] 拆装指南的移动方向是真实的装配方向，不穿过别的零件

## 网站后台

网页导入流程分流为「机械结构」（`mechanism`）后用这份 skill：转写（上面的转写要点）→ 写 ManualSpec JSON → 编译 + 审计 + 修复 → 保存 → 截图复核（上面的复核清单）。不走 Tripo 外观模型（要看的是内部结构）。提示词由 `server/manualSkill.ts` 每次现读本文件和 reference.md 拼成，样板是 `mech-gear-train` 和 `mech-four-stroke` 的 JSON。

## 参考

- KHK 小原齿轮 · Gear Technical Reference：模数、中心距、传动比、行星齿轮的装配条件。[khkgears.net](https://khkgears.net/new/gear_knowledge/gear_technical_reference/)
- 507 Mechanical Movements（Henry T. Brown，1868）：常见机构的图解目录。[507movements.com](https://507movements.com/)
- Animagraffs / Bartosz Ciechanowski 的机械讲解（发动机、手表、锁）：剖面 + 同步动画的讲法。[ciechanow.ski](https://ciechanow.ski/)
