---
name: physics-3d
description: Turns a physics principle or experiment (课本页、实验手册、科普图、讲义 PDF, or a topic to look up) into an interactive 3D demo in the 懂了 Dongle app — a real-scale apparatus whose motion obeys the law quantitatively (lever balance, pulleys, pendulums, collisions, springs, circuits, optics, waves), with computed numbers in chips / callouts / params and step-by-step "change one variable, watch what happens". Use when the user asks for 物理原理 / 物理实验 / 力学 / 电路 / 光学 demos, wants an item in the 物理原理 category, or when the website import pipeline classifies an upload as a physics principle.
---

# 物理原理 → 3D 交互演示

产物是一份 `ManualSpec`（`genre: 'tutorial'`、`category: '物理原理'`）：一张实验台 + 实物大小的器材，每一步改一个变量、演示一个现象，数字按公式算出来标在旁边。
通用的场景脚本写法见 [manual-to-3d 的 reference.md](../manual-to-3d/reference.md)；这份 skill 只讲物理演示特有的东西。

- 现象配方（杠杆、滑轮、摆、碰撞、弹簧、斜面、电路、光路、波、浮力、磁）：[reference.md](reference.md)
- 样板：`physics-lever.ts`（杠杆平衡 F₁L₁ = F₂L₂、三类杠杆）· `physics-pulley.ts`（定滑轮 / 动滑轮 / 滑轮组，绳子是 cable，拉动同步）· `physics-newton-cradle.ts`（牛顿摆，swing 的 clip / phase）· `physics-circuit.ts`（串联并联，闸刀开关、灯泡亮度、导线）

## 那条真正重要的原则

**演的是实验，不是公式。** 找一个能亲手做的实验装置（课本上的那一套），按实物尺寸建出来；每个现象都是装置的状态变化或循环动作，而且**数量上对**：周期按 T = 2π√(L/g) 算，杠杆按力矩算倾不倾，滑轮组绳端走 n 倍的距离，串联灯比并联暗。
公式和数字不画在空中，而是放在 params（要点）、chips（这一步的计算）和 callouts（贴在器材上的读数）里。

好的物理演示要同时做到：
1. **一眼认出器材**：铁架台、刻度尺、砝码、弹簧测力计、电池盒、灯座……按实物比例，配真实材质（`finish`）。
2. **控制变量**：一步只改一个量（加一个砝码、挪一格、拉长摆线、合上开关），对照前后的现象。
3. **算出来的数字**：每个读数写清代入过程（chips：「F₁L₁ = 9.8 × 0.3 = 2.94 N·m」），近似和理想化写明（不计摩擦、小角度）。

## 工作流

```
- [ ] 0 认规律：这页讲的是哪条定律 / 哪个现象，标准实验是什么
- [ ] 1 定数字：器材尺寸、质量、电压……从原文取，没写的按课本常见值并标「推断」
- [ ] 2 设计装置：实验台 + 器材（≤ 45 个零件），坐标、哪些零件会动、绕哪里转
- [ ] 3 算状态：每个变量取值下装置的姿态（角度、位移、亮灭、周期），公式写进 notes
- [ ] 4 写指南：「搭实验」（可选）+「观察现象」（主线）+「生活里的例子」或「常见误区」
- [ ] 5 文案：params 放公式和条件，chips 放这一步的计算，callouts 贴读数
- [ ] 6 审计归零 + 截图看（循环动作审计看不到，要靠截图）
```

### 0. 现象 → 引擎

| 现象 | 写法 |
|---|---|
| 平衡 / 倾斜（杠杆、天平、跷跷板） | 横梁 `rot` 绕支点转；砝码挂成横梁的子零件跟着倾斜 |
| 往复、振动（弹簧振子、活塞、拉绳） | `slide`：amp、period 按公式；多个零件同 period 同 phase 才同步 |
| 摆动（单摆、牛顿摆、秋千） | 零件原点放在摆轴上，`swing`：amp（度）、period = 2π√(L/g)；`clip` 只留半边 |
| 转动（滑轮、齿轮、风车、电机） | `spin`：speed（圈 / 秒）由线速度 / 半径算 |
| 开关、通断、亮暗 | 闸刀 `rot`；灯泡里的 `led`：`light` + `color`，亮暗用颜色（暗橙 → 亮黄）和大小两只 led 切换 |
| 绳子、导线、弹簧线 | `cable`（两端挂零件，随零件移动实时弯曲）；绕过滑轮的半圈用 slack 调 |
| 光线 | 细长 `box`（2 × 2 × 长度）从光源射出，`rot` 按反射 / 折射角算 |
| 波 | 一排小球各自 `slide` / `swing`，phase 依次 + 1/N |
| 读数（测力计、刻度、电表） | `text` 挂在表盘上，换读数 = 两个 text 用 `visible` 切换；或 callout |

**做不了**：流体流动、粒子、形变（弹簧拉长、绳子伸缩）、真实的物理模拟（引擎只播你算好的动作）。用「换零件」（两份不同长度的弹簧 `visible` 切换）、「代表物」（一排小球表示电流 / 水流）简化，并在 tip 或 notes 里写明。

### 2–3. 装置与状态

- 坐标：毫米，Y 向上，桌面 y = 0，观众在 +Z。会转的零件**原点放在转轴上**（横梁原点在支点尖、摆的原点在悬点），否则 `rot` / `swing` 会绕错地方转。
- 一个装置的几个零件同时动时，用同一个 `delay` / `dur`（状态）或同一个 `period` / `phase`（动作）。
- 几组对比装置并排放（滑轮 A / B / C、串联 / 并联两块板），各指南用 `start` 藏掉不用的那组，或一步一步亮出来。
- 审计只看静止姿态和状态过渡，不看循环动作：动作的最大幅度时也不能穿插，要自己按几何算（摆幅、行程）。

### 4–5. 指南、文案

- 指南 1「观察 …」（`kind: 'usage'`，主线）：第 1 步总览装置（`orbit: true`），之后一步一个变量，最后一步总结规律（callouts 标出各量）。
- 可选「搭实验」（`kind: 'assembly'`）：器材一件件放上去；可选「生活里的 …」（`usage`，三个实例并排）或「常见误区」（`kind: 'repair'`，标题「误区：…」）。
- title 写现象（「加一个砝码：左边沉下去」），desc 讲为什么（用到哪个量），tip 讲实验时的注意（「摆角别超过 10°，周期公式才准」）。
- params：定律 / 公式（`T = 2π√(L/g)`）+ 适用条件 + 本装置的数值；package：器材清单（规格写真实值）。

### 6. 验证（命令行）

```bash
npm run check:manuals -- <id>
SHOOT_PORT=52xx node scripts/shoot-manuals.mjs <id>   # 截图在动作开始后约 0.5 s，看最大幅度附近的样子
npm run plaza -- manual:<id> && npm run covers -- manual:<id>
```

## 转写要点（网站导入）

物理原理资料（课本页、实验手册、讲义）：rows 一条 = 一个实验操作或一个要观察的现象（「在左边 30 cm 处挂 2 个钩码」「合上开关，观察两灯亮度」），text 照抄原文，change 写成装置的变化（哪个零件怎么动、哪个读数变成多少）。entities 写器材和尺寸 / 质量 / 电压。另外加一个字段
"physics": { "law": "规律名称", "formula": "公式（纯文本，例如 F1·L1 = F2·L2）", "conditions": "适用条件 / 理想化（不计摩擦、小角度）", "quantities": [ { "symbol": "L", "name": "摆长", "value": "0.2", "unit": "m", "source": "原文 / 推断" } ], "experiment": "标准实验装置一句话", "observations": ["每个对照要看到的现象"], "unsupported": ["引擎做不了的现象（流体、形变），打算怎么简化"] }。

## 复核清单

- [ ] 器材认得出、比例对（砝码、测力计、电池盒不是一堆方块）
- [ ] 每个现象数量上对：倾向哪边、转得快慢、周期、绳端走多远、灯亮不亮 / 谁更亮，和 params 的公式一致
- [ ] 会动的零件绕对了轴（原点在支点 / 悬点上），动起来不穿过别的器材和桌面
- [ ] 同一装置的几个动作同步（同 period / phase / delay），绳子、导线跟着零件走、没穿过实体
- [ ] 一步只改一个变量，前后对照看得清；最后有一步总结规律
- [ ] chips / callouts 的数字和计算过程正确，单位齐全；理想化条件写明
- [ ] 镜头看得到变化的那部分（读数、灯、摆的最低点）

## 网站后台

网页导入流程分流为「物理原理」（`physics`）后用这份 skill：转写（上面的转写要点）→ 写 ManualSpec JSON → 编译 + 审计 + 修复 → 保存 → 截图复核（上面的复核清单）。不走 Tripo 外观模型。提示词由 `server/manualSkill.ts` 每次现读本文件和 reference.md 拼成，样板是 `physics-newton-cradle` 和 `physics-lever` 的 JSON。

## 参考

- OpenStax《College Physics 2e》：简单机械、振动与波、电路章节的标准实验和数值。[openstax.org](https://openstax.org/details/books/college-physics-2e)
- The Physics Classroom：电路、光、运动的讲法和常见误区。[physicsclassroom.com](https://www.physicsclassroom.com/)
- PhET Interactive Simulations（科罗拉多大学）：每个现象「改一个量、看结果」的交互设计。[phet.colorado.edu](https://phet.colorado.edu/)
