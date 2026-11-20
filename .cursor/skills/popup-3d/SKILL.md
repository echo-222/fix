---
name: popup-3d
description: Turns a pop-up book / 立体贺卡 / paper-engineering tutorial (photos, PDF pages, diagrams, or a mechanism name to look up) into an interactive 3D demo in the 懂了 Dongle app — rigid paper pieces (sheet) hinged on the page so that opening the book drives every piece, with exact parallel-fold, V-fold, pull-tab, wheel and flap mechanics, cut / crease lines and layered thickness. Use when the user asks for 立体书 / 立体贺卡 / pop-up / 纸艺机关 tutorials, wants an item in the 立体书 category, or when the website import pipeline classifies an upload as a pop-up tutorial.
---

# 立体书 / 立体贺卡 → 3D 交互演示

产物是一份 `ManualSpec`（`genre: 'tutorial'`、`category: '立体书'`）。纸片用 `sheet`（薄多边形，两面不同色），每片纸挂在它粘住的那一页上，绕自己的折痕转。
通用的场景脚本写法（零件、状态、动作、镜头、审计）见 [manual-to-3d 的 reference.md](../manual-to-3d/reference.md)；这份 skill 只讲立体书特有的东西。

- 机关配方、坐标、层高、角度表：[reference.md](reference.md)
- 样板：`popup-parallel.ts`（平行折：一张卡两刀弹出盒子，精确的平行四边形联动）· `popup-vfold.ts`（V 形折：山峰跨中缝）· `popup-pulltab.ts`（拉片窗口卡、四季转盘卡）· `popup-kit.ts`（矩形、圆、开窗纸片的帮手）

## 那条真正重要的原则

**纸是刚体，机关是连杆。** 每片纸只能绕自己的折痕（铰链）转；书页一开一合，带着粘在上面的纸片一起转，纸片之间的铰链把它们约束成平行四边形（平行折）或球面连杆（V 形折）。
所以先想清楚「每片纸粘在哪一页、绕哪条线转、书张开到某个角度时它转了多少」，再写状态，不要凭感觉摆姿态。关键帧（合上 / 90° / 摊平）必须按几何算准，过渡途中允许小误差。

好的立体书演示要同时做到：
1. **打开就弹起来**：「开合演示」里书页一动，所有机关跟着动，同一组 `dur` / `delay`。
2. **看得出是纸**：两面不同色（`fill` / `finish` 正面，`back` / `backFinish` 背面）、有层次（每层抬高 0.05 mm 以上，不互相穿插）、剪口和折痕用 `edges` 画出来。
3. **跟着做得出来**：尺寸、剪多长、粘在哪、角度多少都写清楚（chips / params），制作步骤和成品演示分成两个指南。

## 工作流

```
- [ ] 0 认机关：平行折 / V 形折 / 拉片 / 转盘 / 翻盖 / 层叠（reference.md「机关一览」）
- [ ] 1 定卡片：纸张尺寸、对折方向、中缝坐标；每片纸的轮廓和铰链线
- [ ] 2 定层高：合上时从下往上每片纸的 y 区间（reference.md「层高」）
- [ ] 3 写零件：书页、机关纸片、铰链（看不见的 ghost 父零件）、道具（剪刀、胶棒、铅笔）
- [ ] 4 算关键帧：合上 / 90° / 摊平时每片纸的 rot（配方和角度表）
- [ ] 5 写指南：「做一个 …」assembly（画线 → 剪 → 折 → 粘 → 合上压紧 → 打开）+「开合演示 / 原理」usage
- [ ] 6 审计归零 + 截图看：合上时什么都不露出卡外、打开时不穿插
```

### 0. 能不能做

| 能做 | 怎么做 |
|---|---|
| 平行折（盒子、台阶、立起来的小人） | 两片小条分别挂在两页上，和书页同角度 / 反角度转（精确） |
| V 形折（山峰、嘴巴、翅膀） | 两片纸各绕自己的粘贴线转，角度按 reference.md 的表取 |
| 拉片、滑块 | 夹在滑轨中间的纸片沿轨道 `at` 移动，或 `slide` 循环 |
| 转盘、转轮 | 圆片挂在铆钉上，`rot` 绕铆钉转，或 `spin` 循环 |
| 翻盖、门、翻页 | 绕边线的铰链 `rot` + `arc` |
| 层叠场景（泡棉垫高、前后几层景片） | 每层固定高度，垫块用薄 `box` |

**做不了**：纸片弯曲成弧面（只能用几片平纸拼）、橡皮筋 / 弹簧的弹性、纸片在过渡途中变形。碰到就简化成刚体版本，并在 notes 里说明。

### 1–2. 卡片、坐标与层高

坐标约定（和样板一致）：毫米，Y 向上，桌面 y = 0，观众在 +Z。书**横着**对折时中缝沿 x 轴、在 z = 0：下半页平放（z ∈ [0, D] 朝观众），上半页绕中缝转，`rot: [α, 0, 0]`：α = 0 摊平（伸向 −z）、90 竖直、180 合上。竖着对折（左右翻）时中缝沿 z 轴，见 reference.md。
合上时纸是叠在一起的：先列出从下往上每片纸的 y 区间（纸厚 0.3，层间留 0.05），转轴抬到两层之间，再用 `pivot` 把纸面放回原处，这样合上时不会互相穿插。

### 3–4. 零件与关键帧

- 每片机关纸的 `parent` 是它粘住的那一页；要绕斜线转的，先挂一个**铰链零件**（ghost：`shape: { type: 'text', text: ' ', size: 0.5 }`，保持可见——隐藏的父零件会把子零件一起藏掉），用铰链的 `rot: [0, θ, 0]` 把局部 x 轴摆到折痕方向，纸片挂在铰链下面、只改 `rot: [ψ, 0, 0]`。这样每个状态只有一个角度，不用心算欧拉角。
- 剪口、折痕在纸上画出来：`edges` 每个字符对应一条边（`h` 黑线、`s` 浅灰折痕、`-` 还没出现），剪之前 `-`、画线后 `s`、剪开后 `h`。
- 制作步骤里的工具（铅笔、美工刀、胶棒）是 `compound` 道具，用 `slide` 沿线来回演示画线 / 切割 / 涂胶，做完 `visible: false`。

### 5. 指南和步骤

- 指南 1「做一个 …」（`kind: 'assembly'`）：材料摊开 → 对折出中缝 → 画线 → 剪 → 折 → 粘 → 合上压紧 → 打开到 90° → 摊平。一个动作一步。
- 指南 2「开合演示」或「原理：为什么会弹起来」（`kind: 'usage'`）：`start` 设成做好、合上的状态；合上 → 45° → 90° → 135° → 摊平，各一步；最后一步讲规则（粘贴角 < V 角、两条小条等长……），配 callouts。
- 镜头：做的时候从斜上方看桌面（`dir` ≈ `[0.15, 1, 0.6]`），开合演示从斜前方压低看（`[0.15, 0.3, 1]`），合上从上方看（`[0.25, 1, 0.65]`）。
- 文案：title 动词开头（「沿中缝剪两刀」），desc 写尺寸和对齐位置，tip 写最容易失败的地方（粘贴边离中缝太近会撕、尖角没压在中缝上会扭）；数字放 chips（「剪口 51 mm」「粘贴角 45°」）。

### 6. 验证（命令行）

```bash
npm run check:manuals -- <id>                       # 穿插 / 穿地 / 镜头……归零
SHOOT_PORT=52xx node scripts/shoot-manuals.mjs <id>  # 每步截图 + 联系表，逐张看
npm run plaza -- manual:<id> && npm run covers -- manual:<id>
```

## 转写要点（网站导入）

立体书 / 立体贺卡教程：rows 一条 = 图上一个制作动作（画线、剪、折、粘、合上、打开），text 照抄文字，change 写清楚：哪片纸、沿哪条线、剪多长 / 折多少度 / 粘在哪页的什么位置。entities 里每片纸写尺寸（mm）和它粘在哪一页；看不清的尺寸按常见做法估计并写进 inferred。另外加一个字段
"popup": { "card": "卡纸尺寸、对折方向（横 / 竖）、对折后尺寸", "mechanisms": [ { "type": "parallel | vfold | pulltab | wheel | flap | layer | other", "pieces": ["涉及的纸片"], "key": "关键尺寸和角度（剪口长、粘贴角、V 角、拉片行程）" } ], "unsupported": ["做不了的部分（弯曲纸面、弹性件），打算怎么简化"] }。

## 复核清单

- [ ] 合上时：所有纸片压平在两页之间，没有任何一块露出卡片轮廓，层与层不穿插
- [ ] 打开时：每片纸都还粘在它那一页上（粘贴边不离开书页），绕的是自己的折痕，而不是飘起来
- [ ] 平行折：两片小条和书页组成平行四边形（盒子的面互相平行），摊平时盒子正好收平
- [ ] V 形折：两片山脊在每个关键帧重合；摊平时山脊竖直（90° V 角）或按设计倾斜
- [ ] 正反面颜色对：画了图的那面朝着读者
- [ ] 剪口 / 折痕的 edges 和步骤一致：剪之前不画，剪开后是黑线，压折痕是浅灰
- [ ] 每一步高亮的是这一步动的纸片，镜头看得到它（开合演示从斜前方压低看）
- [ ] 文案里的尺寸、角度和 params / chips 一致

## 网站后台

网页导入流程分流为「立体书」（`popup`）后用这份 skill：转写（上面的转写要点）→ 写 ManualSpec JSON → 编译 + 审计 + 修复 → 保存 → 截图复核（上面的复核清单）。不走 Tripo 外观模型。提示词由 `server/manualSkill.ts` 每次现读本文件和 reference.md 拼成，样板是 `popup-parallel` 和 `popup-vfold` 的 JSON。

## 参考

- Robert Sabuda · Single Sheet Layer（平行折，一张卡两刀）：[robertsabuda.com](https://robertsabuda.com/)
- Superplexus · V-Folds（粘贴角和 V 角的规则）：[school.superplexus.com](https://school.superplexus.com/3d-design/possible-projects/pop-up-book/mechanisms-1/v-folds)
- Duncan Birmingham《Pop-Up Design and Paper Mechanics》：平行折、V 形折、拉片、转盘的几何。
