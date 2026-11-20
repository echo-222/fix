---
name: manual-to-3d
description: Turns any product manual (说明书 photos, PDF pages or text — electronics, appliances, tools, furniture) into an interactive 3D line-art demo in the 懂了 Dongle app by analysing the pages, modelling parts from primitives, scripting per-step states (moves, plugs, switches, lights, screens, cables), then auditing geometry and visually verifying with screenshots. Use when the user asks to convert a 说明书 / user manual / quick-start guide / installation or repair instructions into a 3D演示 or interactive guide, or to add a new product manual to the app.
---

# 说明书 → 3D 交互演示

把一份说明书变成「线稿 3D 场景 + 分步动画 + 细节放大 + 原文溯源」。
核心产物是一份**场景脚本** `ManualSpec`（`src/domain/manual/types.ts`）。编译器、渲染器、场景审计已经通用——**新增说明书通常只写一个脚本文件**。

- 脚本 API：[reference.md](reference.md)
- 建模与镜头手艺：[craft.md](craft.md)
- 审计与截图验证：[verify.md](verify.md)
- 完整案例（蓝牙鼠标）：[examples.md](examples.md) · 设计走查：[walkthrough.md](walkthrough.md)

## 那条真正重要的原则

**说明书里的动作，就是场景里的状态变化。** 不要画箭头和示意图；用真实零件的移动、拨动、插入、亮灯、屏幕界面把原文指令「演」出来。数字、页码、灯色、档位名都来自说明书（或明确标注为推断）。

和 anatomy 的对应关系（本 skill 不画等距 SVG，而是写 懂了 Dongle 的 `ManualSpec`）：

| anatomy | 本 skill |
|---|---|
| Truth first（真实数字与行为） | 逐页转写表：原文指令 → 实体 → 状态变化 |
| Invent the object | 产品本身就是对象；场景道具只建到能讲清步骤 |
| Parts list | `parts: SpecPart[]`，父子挂接 |
| Plan the world | mm、Y 上、地面 y=0；产品局部前方写在文件头 |
| Build geometry once | 基本形体拼模型；步骤只改状态 |
| Make it live | `set` / `plug` / `actions` / 灯 / 屏幕 |
| Verify like a critic | `npm run check:manuals`（审计归零）+ `npm run shoot`（逐张看 PNG） |

## 0. 先分流

| 说明书类型 | 做法 |
|---|---|
| 电子产品、小家电、工具……有开关 / 灯 / 屏幕 / 接口，或「先 A 再 B」的流程 | **场景脚本**（本 skill） |
| 尺寸可调、要算料的家具（铝型材 / 光轴） | 参数化：`src/domain/desk.ts`、`src/domain/shaft/*` |
| 固定尺寸家具的组装说明 | 也用场景脚本：box / slab / cylinder + via 移到安装位 |
| 教程：折纸、立体书、物理原理、机械结构 | 换对应的 skill：[origami-3d](../origami-3d/SKILL.md)、[popup-3d](../popup-3d/SKILL.md)、[physics-3d](../physics-3d/SKILL.md)、[mechanism-3d](../mechanism-3d/SKILL.md)（都是场景脚本 + `genre: 'tutorial'`，本 skill 的 reference.md 是它们的通用参考）。没有原文时联网找一份参考教程当「原文」（步骤、数字、来源链接），跳过第 1 步收集页面和第 10 步外观模型 |
| 上面都不是，但能用实物和动作讲清楚（菜谱、手工、化学实验、急救、软件操作……） | [freeform-3d](../freeform-3d/SKILL.md)：先写讲解提纲，再找实物载体搭舞台 |

拿不准时用场景脚本。网页导入时这一步由服务器自动做（`server/skillRouter.ts`），每条链路读哪份 skill 见 README「导入说明书 → 3D」。

## 工作流（复制这份清单）

```
- [ ] 1 收集页面 → 自有 / 已授权：public/manuals/<id>/；官方未授权：manuals-src/<id>/ + source.url
- [ ] 2 逐页转写（页 | 小节 | 原文 | 实体 | 状态变化）——别跳
- [ ] 3 实体清单 + 可变状态（档位坐标、灯色闪法、屏幕界面）
- [ ] 4 坐标约定写进脚本文件头
- [ ] 5 建模 parts（≤60 零件；<1.5 mm 靠 zoom）
- [ ] 6 指南与步骤：一条原文指令 = 一步；插入用 plug
- [ ] 7 镜头 / highlight / callouts / zoom / page
- [ ] 8 注册 → npm run check:manuals（audit passed）→ tsc → build
- [ ] 9 npm run shoot -- <id>，逐张 PNG 对照 verify.md 清单
- [ ] 10 给主体和大件挂 Tripo 外观模型（默认要做）：先给子零件归类（一物一画）、参考图里抹平要做成几何体的按键 / 屏幕 → model:info 定朝向 → check:manuals → shoot（含 --real）
```

### 1. 收集页面
`<id>` 小写连字符（品牌-型号，如 `roborock-p10`）。
- **用户自己拍的 / 已获授权**：图片进 `public/manuals/<id>/`，`source.images` 写清每张对应页码，面板「原说明书」会展示。
- **从品牌官网下载、未获授权**：只从官网或官方 CDN 下载，PDF 与逐页图放 `manuals-src/<id>/`（已 gitignore，不进网页）。`source.images: []`，`source.url` 填官方地址，面板只给链接和页码。
- PDF 转逐页图 + 文字：`python3 scripts/pdf-pages.py manuals-src/<id>/manual.pdf manuals-src/<id>/pages [--dpi 150] [--pages 3-12]`，读 `p01.jpg…` 看图、读 `text.md` 核对数字和原句。

### 2. 逐页转写（质量大半在这里决定）
先表格再建模。动词归类见 [reference.md](reference.md)「动词 → 脚本」。包装→`package`，参数→`params`，注意→`tip`，排查→`kind: 'repair'`。
空间关系**以图为准**；图不清按常见布局，交付时说明推断。

### 3–5. 实体、坐标、建模
见 [craft.md](craft.md)。要点：父子关系表达「跟着走」；贴壳用 `{ on: [x,z], dy }`；翻面绕 z 180° 后左右镜像，对照底视图。

### 6. 步骤
- 一条原文指令 = 一个 `SpecStep`；`set` 只写变化。
- **插入接口用 `plug`**，不要手算 `parent`/`at`/`rot`/`via`：`{ plug: 'port-la2' }` 或 `{ plug: { hole, roll?, depth?, back? } }`。
- 绕开障碍用 `via`；抬起用 `lift`；同一步先后用 `delay`。
- 指南间用 `start` / 共用用 `initial`。

### 7. 镜头与溯源
每步必有 `camera` 与 `page`。高亮本步操作件；小件（<15 mm）配 `zoom`；`callouts` ≤ 6。细节见 craft.md。

### 8. 注册与审计
1. 在 `src/domain/manual/library/` 新建 `<id>.ts` 并 `export` 一个 `ManualSpec`，自动注册；首页广场的品类筛选按 `category`（顺序见 `index.ts` 的 `CATEGORY_ORDER`）。
2. `npm run check:manuals` → 必须 `audit passed`（穿地 / 穿插含途中 / 插接 / 镜头 / 灯 / 标注……全部 0 problems）。
3. `npm run audit:selftest` 在改过审计逻辑后跑一次。
4. `npx tsc --noEmit`，`npm run build`。

### 9. 视觉验证
`npm run shoot -- <id>`（可加 `--guide <gid>` / `--phone`）。打开 `shots/<id>/` 里每张 PNG 和 `*-sheet.png`，按 [verify.md](verify.md) 勾选。修完再交付。

### 10. 外观模型（默认要做，Tripo 生成）
**真实外观 + 原有骨架**：GLB 只替换零件的外观，`shape` 仍是审计用的碰撞代理和加载占位，所以步骤、插接、审计都不变。
**默认每份说明书都做**：只要有产品主体或体积大的刚性件，就生成外观模型，尽量让产品看起来像真的；只有板式家具、五金、工具这类本身就是规整形状的，才只用 `finishes` 材质代替（见本节末尾）。`npm run tripo:check` 没配好时在交付说明里写明缺了这一步。
网页导入（`server/appearance.ts`）自动做这一步：AI 按下面的规则选件、定参考图（用户另传的产品照片 > 说明书里的产品图 > 英文文字描述）、要涂白和要抹平的区域，服务器裁图后调用同一份 `scripts/tripo.mjs`，再截六向图让 AI 认正面、换算 `rot`，按包围盒比例选 `fit`，挂上后重新审计。

**一物一画**：同一个东西只能有一种画法，要么在外观模型里，要么是几何体，不能两样都有。模型自带一排按键、上面又叠一排几何按键，写实下两层互相遮挡、对不齐（美的空调遥控器就这样把按键盖住了）。生成之前，先把模型零件的每个直接子零件归类：

| 归类 | 哪些件 | 做法 |
|---|---|---|
| 几何体 | 步骤里要按 / 拨 / 转 / 高亮的件（按键、旋钮、开关、拨杆、卡扣、压杆）；接口、指示灯、屏幕、文字；成排重复的规整小东西（按键阵列、格栅、螺丝） | 参考图里**用外壳颜色抹平**，模型里就没有它（文字生成：prompt 写 "smooth blank front, no buttons, no screen"）。不写 `baked` |
| `baked` | 大块的、平时待在原位、只在个别步骤打开或取出的件（上盖、面板、盖板、尘盒、提把） | 留在参考图里一起生成。原位时不单独画，被打开 / 取出那步换回代理形状 |
| 两样都不用管 | 参考图里看不见的（装在里面的电池、滤网，背面的接口） | 保持几何体 |

模型只管外壳和主体曲面，简单、重复、要演示的细节都交给几何体。已经生成了带按键的模型、又要几何按键时，**重新生成**一个抹平的，不要两层将就。抹平后只剩一块光板的（遥控器、开关面板），整件直接用几何体：Tripo 认不出光板会乱补（美的遥控器抹平后生成出了把手）。审计会拦一半：`baked` 的件在原位时被高亮或按，会报「看不到」；几何体和模型重叠审计看不出，只能靠写实截图（verify.md）。

1. 选件：产品主体和体积大、外形复杂、刚性的件（机身、主机、底座 / 基站、显卡、电源、散热器）。接口、指示灯、屏幕、线缆、螺丝和要动的小部件保持几何体（编译器会拦），并按上表在参考图里抹平。
2. **定型号、找真图**：要像真的，就用图生模型，不用文字生成（文字只能出「一块通用显卡」）。说明书没指定型号的配件，按常见搭配选一款具体型号写进 `spec` 和文件头的推断说明；联网找官方产品图（品牌官网、电商详情页大图），首选一张干净的 3/4 角度图，存 `models/<id>/refs/`（版权归品牌方，gitignore），型号、页面和图片地址记在 `refs/sources.json`。
3. **清理参考图**：图里露出的线缆、配件、包装会被当成产品的一部分，先涂掉；按上表归成几何体的按键、屏幕、指示灯，用 `node scripts/ref-cover.mjs <原图> <输出.jpg> x0,y0,x1,y1 …` 按四周外壳的颜色抹平（框贴着外壳画）。多视图（`multiview-to-model`）要求各张同一比例、同一距离拍，混用不同来源的图会生成厚块，拿不准就只用单张。
4. `npm run tripo:check` 确认余额。写 `models/<id>/tripo.json`（`image-to-model` → 本地 `optimize`），`npm run tripo -- <id> [--only a,b] [--dry]`。成品落到 `public/models/<id>/<name>.glb`，积分与 task_id 记在 `models/<id>/tripo.log.json`。先看 `raw/*.webp` 预览：造型不对就修图再 `--only <name> --force`。
5. 定朝向：`npm run model:info` + `npm run model:views -- <glb>`（六向图 PNG），换算成 `rot`（斜放的加 `align: true`），在零件上写 `model: { src, align?, rot, fit, crop? }`。生成时多出来、修图也没去掉的东西，用 `model:info --slice <轴>` 找截面突变的位置，`crop` 按比例裁掉。整机模型里已经带着的大件（上盖、面板、盖板）写 `baked: true`，并给说明书写 `finishes`，打开这些部件的步骤会换成带材质的代理形状；要按 / 高亮的按键不能 baked。整机里要折叠、转动、拆下的件（竖管、扳手、支架）沿真实分开处切成几块：`crop.cut` 挖出来挂到子零件上，每块写同一个 `frame`，框用 `npm run model:section` 量（reference.md「一个模型切成几块」）。
6. `check:manuals` → `npm run shoot -- <id>`（线稿）和 `--real`（真实材质）各看一遍：朝向对不对、和代理包围盒贴不贴、子零件（接口、螺丝）是否还在表面上、拆开 / 折叠时切口是不是平整的封口（没有碎面、透背景的缝）、**有没有两层**（模型自带的按键 / 屏幕上又叠了一套几何体）。
7. 试验结束把清单改回最终流程、废弃结果移出 `public/`，免得重跑时重新扣费。
格式、定朝向步骤、实测经验见 [reference.md](reference.md)「外观模型」。
板式家具、五金、工具不用生成模型：写 `finishes` / `finish` 给几何体上材质就够了（[reference.md](reference.md)「真实材质」）。

### 11. 广场模型图
`npm run plaza -- <id>` 生成首页广场上的等轴模型图（`public/plaza/<id>.webp` + `src/community/plaza.json`）。打开图看一眼：墙、插座、工具、水管这类道具按零件名自动藏掉（`three/Scene.tsx` 的 `SCENERY`），漏掉的零件 id 写进 `scripts/picks.mjs` 的 `PLAZA_HIDE`；默认那一步不是整机摆好的样子，就在 `PLAZA_PICK` 另挑一步。

## 交付时说明
1. 转写摘要：几页、几个指南、多少步、各指南对应页。
2. 在哪里看：首页广场搜产品名，最匹配的会挪到正中间，点模型打开（或直接打开 `#/note/m-<id>`）。
3. 哪些是推断的位置 / 尺寸。
4. 挂了外观模型的零件：照哪款产品的哪张图生成、用了多少积分；模型是 AI 按产品图重建的，细节（字样、散热孔数量）不保证逐一对得上。

## 扩展脚本格式时
- 新形体：`types.ts` → `shapes.ts` → `ManualStage` 的 `ShapeView`
- 新动作：`types.ts` → `pose.ts`（求解）→ `ManualStage`
- 新审计：`audit.ts`（并在 `audit-selftest.mjs` 埋一个故障）
保持「脚本只描述、不写渲染代码」。
