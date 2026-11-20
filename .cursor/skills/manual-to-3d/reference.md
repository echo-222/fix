# 场景脚本参考（ManualSpec）

源码：类型 `src/domain/manual/types.ts`，编译 `src/domain/manual/compile.ts`，姿态 `pose.ts`，审计 `audit.ts`，渲染 `src/three/manual/ManualStage.tsx`。
建模手艺见 [craft.md](craft.md)，验证见 [verify.md](verify.md)。

## 目录
- 文件结构
- 形体 Shape
- 零件 SpecPart
- 状态 PartState（含 plug）
- 动作 Action
- 标注 / 镜头 / 细节窗
- 步骤 / 指南 / 整体
- 编译语义（重要）
- 动词 → 脚本
- 朝向速查
- 真实材质（finish）
- 外观模型（Tripo）

## 文件结构

```ts
// src/domain/manual/library/<id>.ts
import type { ManualSpec, SpecPart } from '../types'

const parts: SpecPart[] = [ /* ... */ ]

export const myProduct: ManualSpec = {
  id: 'my-product', name: '产品名', desc: '首页卡片的一句话简介', category: '电子产品',
  dims: { width, depth, height },              // mm，显示在顶栏
  source: { title: '原说明书标题', images: [{ src: '/manuals/my-product/p1-3.jpg', pages: '第 1–3 页' }] },
  // 官方下载、未获授权：source: { title, url: '官方原文地址', images: [] }
  package: [{ name: '主机', qty: 1, spec: '…' }],
  params: [{ label: '电池', value: '450 mAh', note: '…' }],
  parts,
  initial: { /* 所有指南共用的初始状态 */ },
  stageSize: 900,                               // 场景范围，决定网格淡出
  guides: [ /* SpecGuide[] */ ],
}
```

文件放在 `library/` 下并导出即可自动注册（`index.ts` 用 `import.meta.glob` 收集所有导出的 `ManualSpec`）。辅助函数可以放在同目录的其他文件里，只要不导出 `ManualSpec` 就不会出现在首页。

## 形体 Shape

| type | 参数 | 原点 / 朝向 | 适合 |
|---|---|---|---|
| `box` | `size: [x,y,z]`, `chamfer?` | 中心 | 按键、拨钮、插头、机身块 |
| `slab` | `w`(x), `d`(z), `h`(y), `r?` 圆角 | 底面中心，向 +y 挤出 | 笔记本、手机、面板、说明书、托盘 |
| `cylinder` | `r`, `h`, `axis?`='y', `r2?`（顶半径） | 中心 | 滚轮、旋钮、电池、立柱 |
| `shell` | `w`, `l`, `h`, `base?`, `n?`=2.4, `taper?`, `peak?`, `seams?` | 底面中心，前端 -z | 鼠标、遥控器、剃须刀、耳机仓等圆润外壳 |
| `hole` | `w`, `h`, `r?` | 平面，朝 +z | 接口、开关槽、感应孔、凹槽、键盘区 |
| `led` | `r`, `color?` | 平面，朝 +z | 指示灯 |
| `screen` | `w`, `h` | 平面，朝 +z | 电脑 / 手机 / 设备屏幕 |
| `text` | `text`, `size`（字高） | 平面，朝 +z | 丝印、档位文字、标签 |
| `compound` | `items: (Shape & {at?, rot?, fill?, finish?})[]` | 父零件原点 | 一个零件由多块组成（接收器 = 插头 + 外壳） |
| `cable` | `from/to: {part, at, dir}`, `r?`=1.8, `slack?`=1 | 世界坐标 | 充电线、数据线；两端随零件移动 |
| `poly` | `points: [x, z][]`（≥ 3，不自交），`h` | 俯视多边形，y ∈ [0, h] | 杠杆、凸轮、连杆、齿条、钥匙齿形、内齿圈的一段扇形 |
| `sheet` | `points: [x, z][]`, `th?`=0.3, `back?`, `backFinish?` | 薄纸片，y ∈ [0, th]；正面用零件的 fill / finish，背面用 back | 立体书、卡片（折纸用 `origami`）；每条边怎么画由状态 `edges` 定 |
| `gear` | `teeth`（整数 ≥ 6），`r`（分度圆半径），`h`，`axis?`='y'，`bore?` | 中心；齿 0 在角度 0（+x） | 直齿轮。模数 m = 2r / teeth，齿顶 r + m，齿根 r − 1.25m |

`shell` 细节：`n` 越大越方（2 = 椭圆）；`taper` 前端收窄比例；`peak` 最高点位置（-1 前 … 1 后）；`seams` 是顶面分模线 `[x, z][]` 折线（按键缝、滚轮槽）。

`fill`：`white`（默认）、`warm`（纸张 / 木材）、`shade`（浅灰：凹槽、金属件）、`dark`（深色：接口、感应孔）。`hole` 默认 `shade`。

## 零件 SpecPart

```ts
{ id, name, spec?, shape, parent?, at?, rot?, pivot?, fill?, finish?, model?, baked?, visible? }
```
- `finish`：真实材质模式下的材质，见「真实材质」。
- `model`：外观网格 `{ src, node?, rot?, fit?, crop?, frame? }`；`baked`：父零件的外观网格里已经有这个零件。见文末「外观模型」。
- `at`：相对父零件的坐标 `[x,y,z]`，或贴外壳表面 `{ on: [x, z], dy? }`（父零件必须是 shell）。
- `rot`：欧拉角（**度**，XYZ 顺序）。
- `pivot`：几何体整体平移，用来设定转轴（屏幕盖板转轴在后沿：`pivot: [0, 0, d/2]`）。
- `visible: false`：初始隐藏（配件、线缆在需要时才出现）。

## 状态 PartState（写在 initial / start / step.set 里）

| 字段 | 含义 |
|---|---|
| `parent` | 换父级；`null` = 放回世界 |
| `at`, `rot` | 新的局部位置 / 姿态 |
| `plug` | 插进 hole：自动对准；`roll` 绕插入轴转；`depth` 再推进（负=半插）；`back` 外侧途经距离（默认 30，0=直推） |
| `visible` | 显示 / 隐藏（出现在过渡开始时，消失在过渡结束时） |
| `light` | `off` / `on` / `blink` / `blinkThenOff`（闪约 3.6 秒后熄灭）；只能用于 led |
| `color` | 灯色 |
| `ui` | 屏幕界面（只能用于 screen），`null` = 桌面 |
| `lift` | 过渡时抛物线抬高（mm） |
| `via` | 过渡路径经过的世界坐标点（plug 默认自动生成） |
| `arc` | 绕点转过去而不是走直线（翻折、翻盖、开门）：`[x,y,z]` 或 `{ at, axis }`，父零件局部坐标，点要在转轴上；正好 180° 时必须写 `axis`（按右手定则从这个方向转）。父级不变、没有 `via` 时才生效 |
| `edges` | 只用于 `sheet`：每个字符对应 `points[i] → points[i+1]`，`h` 黑线、`s` 浅灰折痕、`-` 不画；长度必须等于点数。和灯一样在过渡开始时切换 |
| `delay`, `dur` | 过渡延迟 / 时长（秒，dur 默认 1.1） |

插头约定：原点在插头与外壳交界，插头朝局部 +x。hole 平面朝 +Z（外法线）。

`ScreenUI`：`{ app?, title?, items?: {text, sub?, state?: 'normal'|'selected'|'done'|'muted'}[], button?, buttonActive?, toast?, cursor? }`。只给 `toast` / `cursor` 时画桌面 + 通知。

## 动作 Action（本步循环播放，不改变状态）

| type | 参数 | 用途 |
|---|---|---|
| `press` | `part`, `depth?`=1.2 | 按键按下回弹 |
| `spin` | `part`, `axis?`='x', `speed?`（圈 / 秒，缺省约 0.64，负数反转） | 滚轮、旋钮、齿轮、曲轴。正转 = 从轴的正方向看顺时针 |
| `swing` | `part`, `axis?`='z', `amp`（度）, `period?`=2, `phase?`（0–1）, `clip?`, `crank?` | 摆锤、跷跷板、连杆：角度 = amp × sin(2π(t / period + phase))；`clip: 'pos' \| 'neg'` 只留半波（牛顿摆两端轮流摆）；`crank: true` 按连杆算 asin(sin(amp) × sin(…)) |
| `slide` | `part`, `axis?`='y', `amp`（mm）, `period?`, `phase?`, `clip?`, `rod?` | 活塞、气门、齿条：位移 = amp × sin(…)；给 `rod`（连杆长）时按曲柄滑块精确算，amp = 曲柄半径 |
| `shake` | `part`, `axis?`, `amp?`=1.5 | 检查插紧、晃动 |
| `glide` | `part` | 鼠标在桌面画 8 字；屏幕上 `cursor: true` 的光标同步移动 |

动作默认在本步所有过渡结束后开始，可用 `delay` 覆盖。动作作用在零件局部坐标里，子零件跟着走（摆锤的线和球做成一个父零件）。审计只看状态和过渡，不看循环动作，动作要靠截图检查。

同步要点：
- 啮合齿轮：模数相同、中心距 = r₁ + r₂，转速与齿数成反比、方向相反（`speed` 一正一负）；一个齿要正对另一个的齿槽（齿数为偶数时转半个齿距 `180 / teeth` 度）。
- 齿轮齿条：齿轮 `swing` amp α（度），齿条 `slide` 同 period / phase，amp = r × α × π / 180。
- 曲柄滑块（发动机）：曲柄 `spin` speed = 1 / P；活塞 `slide` amp = 曲柄半径、`rod` = 连杆长、phase 0.5；连杆挂在活塞下当子零件，`swing` axis z、`crank: true`、amp = asin(r / L)、phase 0.25。符号以截图为准。
- 行星齿轮：Willis 公式 (ωs − ωc) / (ωr − ωc) = −Zr / Zs；行星轮挂在行星架下，局部转速 = −(ωs − ωc) × Zs / Zp。

## 标注 / 镜头 / 细节窗

```ts
callouts: [{ part, text, sub?, at?: [局部锚点], offset?: [世界偏移, 默认 0,40,0] }]
camera:   { target: 零件id | [x,y,z], offset?, dir: 预设名 | [x,y,z], dist }
zoom:     { ...CameraSpec, caption }      // 右上角圆形细节窗，同一场景的近景
marker?:  零件id | [x,y,z]                 // 红圈位置，缺省为 zoom 目标
orbit?:   true                              // 镜头缓慢环绕（适合总览）
```
`dir` 预设：`front`、`iso`、`top`、`left`、`right`、`back`、`low`、`under`（从下往上看，只建议用于 zoom）。
`target` 用零件 id 时取该零件**本步结束时**的世界位置。

## 步骤 / 指南 / 整体

```ts
SpecStep  { id, title, desc, tip?, chips?: {label, sub?}[], page?, camera, set?, highlight?, actions?, callouts?, zoom?, marker?, orbit? }
SpecGuide { id, title, kind: 'usage' | 'assembly' | 'repair', start?, steps }
```

### 教程类（折纸、立体书、物理原理、机械结构）
没有说明书的东西写成 `genre: 'tutorial'`：面板标题变成「材料与要点 · 参考资料」，`package` 当材料清单、`params` 当要点（公式、数字），步骤不要求 `page`，审计不报缺页码。`source` 写参考页面：`{ title, url, images: [] }`，步骤文字自己写、不抄原文，参考图不进 `public/`。首页按 `category` 归到「折纸」「立体书」「物理原理」「机械结构」四个大类（`src/community/groups.ts`），种子笔记自动换成教程文案。样板：`origami-dart.ts`（折纸）、`popup-parallel.ts`（立体书平行折，`popup-kit.ts` 是共用帮手）、`physics-pulley.ts`（滑轮组、绳子缠绕）、`mech-gear-train.ts`（齿轮、齿条、同步动作）。

折纸另有一份 skill：[origami-3d](../origami-3d/SKILL.md)。一张 `origami` 纸（`shape.ops` 是折纸程序：fold / unfold / flip / turn / rotate / stand / draw），编译时由 `src/domain/manual/origami.ts` 一步步模拟，`OrigamiView` 画成一张连续的纸（折边弯过去、两面不同色、厚度、明暗、投影）；步骤只切换 `fold: k`。TS 里用 `Paper` 帮手写（`paper.fold / bring / unfold / stand / rotate / view / set`）。不支持压平折（squash）、内翻折（reverse）这类需要面变形的折法。

## 编译语义（重要）

1. 每个指南从 `零件默认 + initial + guide.start` 出发，逐步应用 `set`，状态累积。每一步都编译成「起始帧 → 结束帧」，所以跳到任意一步都能正确播放。
2. 换父级且没给 `at`：保持世界坐标不动，只换跟随关系。
3. 父级不变：在局部坐标里插值（父零件同时移动时子零件跟着走）。父级改变或有 `via`：在世界坐标里插值到新父级的实时位置。
4. 灯和屏幕在该零件过渡开始（`delay`）时切换。
5. 校验（`issues`）会拦下：重复 id、引用不存在的零件、父子成环、`on` 用在非 shell 父级、给非 led 设置 light、给非 screen 设置 ui、无效数字、空指南。

## 动词 → 脚本

| 说明书动词 | 写法 |
|---|---|
| 取出 / 拔出 | `{ parent: null, at: 世界坐标, via: 仓口正上方, lift?: 20 }` |
| 插入 X 口 | `{ plug: 'port-id', dur: 1.6–1.8 }` 或 `{ plug: { hole, back: 55 }, lift: 25 }` |
| 插紧（半插→到底） | `{ plug: { hole, back: 0 }, dur: 0.8 }` |
| 拔出再插回 | `{ plug: { hole, back: 60 } }`（位置相同也会走 via） |
| 换一个接口 | `{ plug: { hole: 'port-la2', back: 45 } }` |
| 拨动开关到 X | 拨钮 `{ at: 档位坐标, dur: 0.5 }` + `highlight` + `zoom` |
| 按下 / 长按 | `actions: [{ type: 'press', part }]` |
| 翻到底部 | 本体 `{ at: [x, 高度, z], rot: [0, 0, 180], lift: 45, dur: 1.4 }`，镜头从上方看 |
| 靠近 / 放到 | 本体 `{ at, rot, lift }` |
| 指示灯亮 / 闪 / 闪后熄灭 | `{ light, color, delay }` |
| 电脑 / 手机上操作 | 屏幕 `{ ui: {...}, delay }`；选中项用 `state: 'selected'`，完成用 `done` + `toast` |
| 连接线缆 | 线缆与两个插头 `visible: true`，插头分别换父级插入 |
| 检查是否插紧 | `actions: [{ type: 'shake', part, axis: 插入方向 }]` |
| 注意 / 警告 | `tip`；数值类写进 `chips` |
| 故障现象 → 处理 | `kind: 'repair'` 指南，每个分支一步，标题写「现象：处理」 |

## 朝向速查（平面类形体默认朝 +Z）

| 想朝向 | rot |
|---|---|
| 朝上 +y（顶面的灯、键盘区） | `[-90, 0, 0]` |
| 朝下 -y（底面的孔、灯） | `[90, 0, 0]` |
| 底面文字（绕 z 翻面后从上方读） | `[90, 0, 180]` |
| 朝左 -x（左侧接口） | `[0, -90, 0]` |
| 朝右 +x | `[0, 90, 0]` |
| 朝后 -z（前端接口，前方为 -z 时） | `[0, 180, 0]` |

插头类零件约定：原点在插头与外壳交界，插头朝局部 +x。插进朝 -x 的接口用 `rot: [0, 0, 0]`；插进朝 -z 的接口（插头指向 +z）用 `rot: [0, -90, 0]`。

绕 y 轴转 θ（`rot: [0, θ, 0]`）后，局部前方 -z 指向世界 `(-sin θ, 0, -cos θ)`：θ = -90 朝 +x，θ = 90 朝 -x，θ = 180 朝 +z（朝向观众）。仍不确定时截图看，比心算可靠。

## 真实材质（finish）

说明书页「设置 → 展示方式」选「写实」后，几何体也可以换成带光照的实体材质（线稿模式不受影响）。板式家具、五金、工具这类本身就是规整形状的东西，真实感主要靠材质，不需要外观模型。

```ts
// ManualSpec：按 fill 给缺省材质；不写则没写 finish 的零件在真实外观模式下仍是线稿
finishes: { white: 'board-white', shade: 'zinc', dark: 'zinc', warm: 'wood' },
// 零件 / compound 子项单独覆盖
{ id: 'back', shape: …, finish: 'fiberboard' }
{ type: 'cylinder', r: 14, h: 110, fill: 'warm', finish: { color: '#c8372d', roughness: 0.45 } }
```
- 预设：`plastic-white` `plastic-grey` `plastic-black` `rubber` `board-white`（白色饰面板）`fiberboard`（背板 / 抽屉底）`wood` `cardboard` `paper` `wall` `steel` `zinc`（镀锌五金）`hole`（钻孔、开口的暗色）。自定义写 `{ color: '#rrggbb', roughness?: 0–1, metalness?: 0–1 }`。
- 优先级：子项 `finish` → 零件 `finish` → `finishes[fill]`。`hole` 子项不继承零件的 `finish`（孔不该是面板的颜色），要单独写或走 `finishes[fill]`。
- `led` / `screen` / `text` 不受影响，照常发光 / 显示。
- 有 `finishes`、任一 `finish` 或任一 `model` 的说明书，「设置」里的「写实」才能选；否则它是灰的，只有线稿。
- 电子产品常用：`{ white: 'plastic-white', shade: 'plastic-grey', dark: 'plastic-black', warm: 'paper' }`；家具：`{ white: 'board-white', shade: 'zinc', dark: 'zinc', warm: 'wood' }`，再把背板、塑料脚、纸箱、工具手柄单独写。

## 外观模型（Tripo）

```ts
model: { src: '/models/<id>/<name>.glb', node?: 'tripo_part_3', align?: true, rot?: [x, y, z], fit?: 'contain' | 'stretch',
         crop?: { min?: [x, y, z], max?: [x, y, z], cut?: { min, max }[] }, frame?: { min: [x, y, z], max: [x, y, z] } }
```
- `crop`：按 `rot` 之后（零件局部轴向）的包围盒比例 0–1 给保留范围。三角形沿裁切面精确切开（属性插值），切口按连通的一圈补平面封口（颜色取切口一圈贴图的平均色），再按剩下的部分对齐代理。例：电源出线端多生成一圈线缆，转到零件 +x 后写 `crop: { max: [0.87, 1, 1] }`。先用 `npm run model:info -- <glb> --slice <模型轴>` 看截面在哪里突变，再换算到零件轴；如果多余物体是直接长在表面上的（线缆插在面板上），齐根裁会露洞，留一小截。
- `crop.cut`：在保留范围里再挖掉几个框（同样按比例），挖出来的那块一般挂到要单独动的子零件上（扳手、支架），见下面「一个模型切成几块」。
- `frame`：整个模型（`rot` 之后）的包围盒落在本零件局部坐标里的哪里（mm），三轴各自拉伸；写了就不按代理包围盒对齐（`fit` 不起作用）。一个 GLB 切成几块时每块都写同一个世界框（减去零件原点），原位时拼回去严丝合缝。
- 渲染：`align` 先按主轴把斜放的模型转正（只在包围盒明显变小时生效），`rot`（度，XYZ）再转到零件局部朝向，最后按 `shape` 的包围盒对齐：`contain`（缺省）等比缩放后居中，`stretch` 三轴各自拉满。`pivot` 照常生效。
- `fit`：比例和代理差 15% 以内用 `contain`；生成比例偏了（常见）用 `stretch`，但只在拉伸不破坏关键特征的轴上可接受（电源沿高度拉伸，顶面圆风扇不变形）。
- `shape` 不能省：审计按它算穿插、插接、镜头；GLB 加载中或失败时也显示它。外观和代理差太多时，先改 `shape` 让它贴近真实尺寸。
- 显示：默认线稿（轮廓线 + 70° 以上的折边，轮廓前把面法线平滑 4 轮）；「设置 → 写实」切到 GLB 自带材质（几何体按「真实材质」一节上材质）。AI 网格的线稿可辨认但边线断续、像手绘，真实材质明显更好看。
- 不挂模型：`hole` / `led` / `screen` / `text` / `cable`（编译报错），以及会单独动的小部件（压杆、卡扣、开关），它们是子零件，叠在模型表面，所以参考图里要先抹平（见下面「一物一画」）。
- `baked: true`（写在子零件上）：整机照片生成的模型里已经带着它（上盖、面板、盖板、清洗盘、藏在里面的尘袋）。它待在原位的步骤里不单独画；某一步它被打开 / 取出，模型那份就不对了（盖子还合着、尘盒从实心顶面冒出来），这一步父零件改画代理 `shape`（真实外观下套 `finishes` 材质），所有 baked 子零件单独画。父零件必须有 `model`；指示灯、屏幕、线缆不能 baked；原位时要高亮或按的件也不行（审计报 `baked`：原位时只有模型里那份，看不到）。打开动作多的整机，代理 `shape` 要建得像样一点，它会在这些步骤里露脸。

### 一物一画（模型和几何体只能二选一）
一个东西要么在模型里（`baked` 或干脆不建），要么是几何体，两样都有就是两层：写实下几何体叠在模型表面，位置、大小和模型自带的那份永远对不齐，互相遮挡。
- **美的空调遥控器（2026-11）**：参考图是带全部按键和液晶屏的正面照，模型生成出了按键和屏幕；脚本里又按 4 行 × 3 列的方格放了 14 个几何按键和一块屏幕。写实下几何按键盖住了模型上的真按键，排列也不一样。先试了把液晶和按键区抹平重新生成：剩下一根白光板，Tripo 认不出是什么，生成了一块歪扭、背后带个把手的板（40 积分白花）。最后整只遥控器用几何体（倒角方块 + 白塑料材质），几何按键按照片里的真实位置和形状（圆键、四段方向环 + 确定键、胶囊键）重新排，写实和线稿都只有一层。
- **抹平之后只剩光板的，别生成**：遥控器、平板面板、开关面板这类，特征全在按键和屏幕上，抹平后只剩一个简单外形，Tripo 没有线索会乱补（把手、凸起、扭曲），而倒角方块 / `shell` + 材质本来就画得干净。抹平适合外形本身有特征的件（机身曲面、出风口、手柄、底座），按键只是其中一小块。
- 判断顺序：① 这个件在哪一步被按 / 拨 / 转 / 高亮 / 指着讲？是 → 几何体。② 是接口、灯、屏幕、文字，或成排重复的规整小东西（按键阵列、格栅、螺丝）？是 → 几何体（简单形状几何体画得比 AI 网格干净）。③ 是大块的、只在个别步骤打开或取出的件（上盖、面板、尘盒）？是 → 留在模型里写 `baked`。④ 都不是：说明书里不演示它，就别建几何体，让模型画。
- 归成几何体、又在参考图里看得见的，生成前抹平：`node scripts/ref-cover.mjs <原图> <输出.jpg> x0,y0,x1,y1 …`（像素坐标，或 0–1 的比例）。每个框按框外一圈的颜色向里插值，外壳的明暗渐变会带过去；框要贴着外壳画（框外是背景就会抹成背景色），一片按键可以一个框框住。PNG 先转 JPEG（macOS：`sips -s format jpeg in.png --out in.jpg`）。网页导入的 `cover` 用的是同一个函数（`server/refImage.ts`）。
- 挨得很近的几个键（Joy-Con 的 ABXY）别一个大框里抹，也别让框的边压在别的键或它的阴影上：框外一圈采到哪个键，那个键的颜色就会拉成一道条纹。分开框，先盖小的、再盖旁边的，然后按同样顺序再盖一遍（第二遍的边采到的都是已经抹干净的外壳）。抹完用放大图看一遍有没有条纹、残影。
- 文字生成的模型同理：prompt 写明 "smooth blank front panel, no buttons, no screen"。
- 原来 `baked` 或藏在代理里的键改成几何体后，要看它**露不露得出来**：`fit: 'stretch'` 按包围盒拉伸，生成的模型比例（机身偏厚、摇杆偏矮）和代理不一样时，模型真正的表面不在代理表面上，几何键会整个陷进模型里看不见（Switch 右 Joy-Con：代理正面 z = 7，模型拉伸后正面在 z ≈ 14）。用 `npm run model:info -- <glb> --slice <轴>` 看截面在哪儿突变，换算出模型表面的位置，把代理和几何键都挪到那个面上；键的平面位置按参考照片量（零件包围盒对应照片里产品的外沿）。
- 已经生成了带按键的模型：重新生成一个抹平的（图生模型约 40 积分），或者按上一条整件改用几何体；不要靠几何体盖住或缩小几何体凑合。
- 重新生成后先和旧模型并排看六向图（旧 GLB 先拷到项目里，比如 `shots/old-glb/`，`model:views` 只读得到开发服务器能访问的文件），再改 `rot` / `crop`：同一张图两次生成也可能不一样。2026-11 这一轮遇到过：朝向转了 90°、出线端的线缆生成成一个把手似的环（电源，`rot` 改 180° 后 `crop` 掉）、白色机身的贴图整体发灰（咖啡机，重跑一次就对了）、前后两面各长一根摇杆（Joy-Con，旧模型也这样）。贴图不对只能重跑，`crop` 救不了。
- 几何按键照着照片排：位置、形状（圆键、胶囊键、方向环）、大小按产品照片量，不按说明书线稿的示意方格。
- 模型只覆盖代理的一部分时（生成的基座斜坡比说明书短），`crop` 掉那部分，让代理里单独的零件（底板）补上；代理上有一块模型里没有的突出（套件背部伸出 20 mm，接口在它底面），拆成单独的子零件，否则真实外观下接口悬空。

### 一个模型切成几块（拆开、折叠、会动的件）
整机照片生成的一个 GLB 里，会动的件（竖管、扳手、支架、车把）和主体长在一起。要它们动起来，就沿真实的分开处切成几块，每块挂在自己的零件上，而不是把它写成 `baked` 再换代理：baked 的件一动，父零件整个换成代理方块（米家滑板车折叠关节在组装 1–3 步、折叠 2–7 步都变成了黑方块）。
- 每块写同一个 `frame`（整个模型在世界里的框，减去零件原点在世界里的位置），不要各自按代理包围盒 `stretch`：各段拉伸比例不一样，原位时对不齐（滑板车车把那段差了 15 mm）。
- 子零件从父零件那块里挖出来：父零件写 `crop.cut: [框]`，子零件写 `crop: { min, max }` 等于那几个框的并集（不是长方体时用外框 + `cut` 减掉多出来的角）。两边的框必须一模一样，否则多一层或缺一条。
- 框怎么量：`npm run model:section -- <glb> --rot <同 model.rot> --axes xy --window h0,h1,v0,v1 --slab d0,d1`，比例和 `crop` 一样，只画深度在 slab 里的一层，网格每 `--step` 一条，红蓝粗线每 5 格，刻度直接读。看局部外观用 `npm run model:views -- <glb> --focus x0,y0,z0,x1,y1,z1`（GLB 自己的轴，不是 rot 之后的）。
- **切口要横穿细杆**：框的每个面切过去，截面得是闭合的一圈（杆、板、管），封口才补得满。框边擦着实体的壁、薄边或者两件的接缝走，切出来是开口的碎线，扇形补不成面，会露出碎三角和透到背景的缝（滑板车：扳手框下沿擦着板底边和挂钩尖，开了一道缝；抬高到横穿扳手板就好了）。
- **框别把相邻的壁一起挖走**：生成的网格里，贴得很近的两件常常连在一起，背后那面墙有时根本没生成。支架框离踏板侧壁只差几毫米，框的边压到侧壁上，就把一条侧壁跟着支腿一起带走，车身上留下一个洞，支腿上挂着一块板。用截面图量出两件之间的空隙，框边放在空隙里；弯过去和别的件长在一起的那一小截（支脚尖）宁可留在车身上。
- 模型里已经有的件就别再用几何体画一份（滑板车模型里自带收起的支架，再加一根几何支腿就是两层）。挖出来以后，零件 `shape` 只是审计用的代理。
- 验证：`shoot --real` 拍拆开、折叠、打开的每一步，放大看切口（`scripts/shoot-manuals.mjs` 的 `--scale 3`）。临时把封口涂成醒目的颜色（`buildCaps` 里 `color.setRGB(1, 0, 1)`）最好认：品红面是正常的封口，白色的缝和碎三角就是框没切好。

### 定朝向（每个模型都要做）
Tripo 输出 Y 轴向上、最长边归一到约 1 m，但**朝哪边、正不正都不固定**（这次 4 个零件 4 种摆法，内存条还斜了 20° 多）。
1. `npm run model:info -- <glb>`：尺寸、面数；斜放时会提示 `align: true` 并给出转正后的真实比例。
2. `npm run model:views -- <glb> [--parts]`（无头截图到 `shots/model-views/<id>-<name>.png`，用 Read 看；`models/<id>/raw/` 里的中间结果也能看），或 `npm run dev` 后打开 `/scripts/model-views.html?src=/models/<id>/<name>.glb`：六向 + 两个等轴测视图，每格写着屏幕右 / 上对应哪根轴。认出特征朝向（风扇朝 +X、金手指朝 -Y、挡板在 +Z…）。分割结果加 `&parts=1&explode=0.5` 看每块怎么分。
3. 列出「模型轴 → 零件轴」的对应，三列组成旋转矩阵 R（det 必须 +1，否则说明某个特征认反了），换成 XYZ 欧拉角：`y = asin(R13)`，`x = atan2(-R23, R33)`，`z = atan2(-R12, R11)`。
4. `shoot` 截一张验证；子零件（接口、开关）应仍贴在模型表面对应位置。

### 生成清单
`models/<id>/tripo.json`（`npm run tripo -- <id>` 读取）：

```json
{ "jobs": [
  { "name": "gpu", "steps": [
    { "type": "image-to-model", "image": "models/<id>/refs/gpu-3q.jpg", "texture": true, "pbr": true, "texture_quality": "detailed" },
    { "type": "optimize", "ratio": 0.03, "error": 0.001, "texture_size": 1024 }
  ] },
  { "name": "gpu-mv", "steps": [
    { "type": "multiview-to-model", "images": { "front": "models/<id>/refs/gpu-front.jpg", "right": "models/<id>/refs/gpu-right.jpg" }, "texture": true }
  ] },
  { "name": "station", "steps": [
    { "type": "text-to-model", "prompt": "…", "texture": false, "pbr": false, "generate_parts": true },
    { "type": "decimate", "face_limit": 20000 }
  ] }
] }
```
- `type`：`text-to-model` / `image-to-model` / `multiview-to-model` / `segment` / `complete` / `decimate` / `texture` / `convert`；其余字段原样作为请求参数。后处理步骤自动用上一步的 task_id，也可写 `"input": "<task_id>"` 接着处理以前的结果（不用重新生成）。`image` / `images` 是相对项目根目录的本地路径，脚本先上传；多视图的 `front` 必填、至少两张，`left` / `right` 指物体自己的左右。
- `optimize`（本地，不扣积分）：用 gltf-transform 对上一步的结果减面 + 贴图转 WebP，`ratio` 是保留面数比例。Tripo 带贴图的高清结果约 140 万面、45 MB，`ratio 0.03` 得到约 4 万面、1.5 MB，薄壳细节都在；**不要用 Tripo 的 `decimate`**，它把散热器风罩这种薄壳整片吃掉了。
- 生成类缺省用 `.env.local` 的 `TRIPO_MODEL`；`generate_parts: true` 必须配 `texture: false, pbr: false`。
- 已完成的 job 再跑会跳过（`--force` 重来）；提交后中断（断网、Ctrl+C、后台进程随终端退出）的任务再跑会接着等原 task_id，不重复扣费；接着等时别带 `--force`，带了会重新提交、再扣一次。中间结果在 `models/<id>/raw/`（gitignore），预览图同目录。
- 试验完把清单改回最终流程、把废弃结果移出 `public/`：清单里的 job 只要 `public/models/<id>/<name>.glb` 不在就会重新生成（重新扣费）。
- 价格（积分）：文字 10 / 带贴图 20；图片 20 / 30；`generate_parts` +20；`smart_low_poly` +10；分割 40；补全 50；减面 30。国内站约 ¥0.07 / 积分。带贴图一次约 2–3.5 分钟，可并行。

### 图生模型（真实外观，2026-10 实测）
- 电脑装机的 4 件按官方产品图各生成一次就成了（显卡、散热器、内存、电源），贴图上的字样、风扇、散热鳍片都对得上；文字生成的版本只能看出「是一块显卡」。
- 单张 3/4 角度图优于多视图：显卡用正面 + 背面 + 侧面三张拼多视图，其中一张拍得更近，结果成了一个厚块，白花 70 积分。
- 参考图边上露出的东西一定会被生成出来（电源图右边一截线缆 → 模型多一圈线）；涂掉之后 Tripo 仍可能按「电源都有线」补一小截，用 `crop` 处理。
- 价格：`texture_quality: "detailed"` 的图生模型 40 积分 / 件，本地 `optimize` 免费。
- 整机（石头 P10）：机器人和基座分开生成，各用一张图。机器人取官方图里停在基座上的那台，把基座涂白、被挡住的顶面按亮面颜色补齐；基座只有一张约 200 × 400 px 的正面图，放大 3 倍 + 锐化后生成，正面和贴图很好，背面深度是猜的（多出一块），用 `crop` 去掉。
- 只有正面图时深度方向不可信：先用 `model:info --slice` 找真实的前后面（截面突变处），`crop` 卡在真实面外 0.5% 左右，不要卡在面上（切口封口和那个面重叠，会闪）。

### 文字生成：提示词与选型（2026-10 实测）
- **一次成功率约一半**：显卡、散热器一次就好；电源、内存条各试了 2–3 次。每次生成都是新的随机样本，预算按每件 2 次算。
- 比例用文字描述（「高度略大于宽度的一半」「像尺子一样薄」），**不写数字、型号**：「DDR5 133 mm」会被直接印到贴图上。写清朝向（「long side horizontal」「lying flat」），负向词加反面（「vertical, standing upright」）。
- 生成比例常偏 30–50%，靠 `fit: 'stretch'` 和 `shape` 兜底；关键尺寸（插槽长度、接口位置）以 `shape` 为准。
- 线稿要干净：选定一个造型好的结果后本地 `optimize`（形状、贴图不变，边线更直）。**不要**用 `smart_low_poly` 重新生成——它是另一次随机抽样，这次两件都比高模差。
- 可拆整机：`generate_parts` 优于「生成 → 分割 → 补全」——30 vs 100 积分、3 vs 12 分钟，按语义分块（机身 / 顶盖 / 两个水箱 / 底板）；分割路线会把部件粘在一起。两者都会出约 145 万面、30–40 MB，必须 `decimate`（到 2 万面约 5 MB，节点名不变）。
- 负向提示词挡不住强关联物体：基站两次都带出了扫地机器人，要么改 `shape` 时用 `node` 只取需要的块，要么接受多一块。

## 验证

见 [verify.md](verify.md)。日常：`npm run check:manuals`（须 `audit passed`）→ `npm run shoot -- <id>` → 逐张看 PNG。
