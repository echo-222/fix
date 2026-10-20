# 场景脚本参考（ManualSpec）

源码：类型 `src/domain/manual/types.ts`，编译 `src/domain/manual/compile.ts`，渲染 `src/three/manual/ManualStage.tsx`。

## 目录
- 文件结构
- 形体 Shape
- 零件 SpecPart
- 状态 PartState
- 动作 Action
- 标注 / 镜头 / 细节窗
- 步骤 / 指南 / 整体
- 编译语义（重要）
- 动词 → 脚本
- 朝向速查
- 验证技巧

## 文件结构

```ts
// src/domain/manual/library/<id>.ts
import type { ManualSpec, SpecPart } from '../types'

const parts: SpecPart[] = [ /* ... */ ]

export const myProduct: ManualSpec = {
  id: 'my-product', name: '产品名', desc: '菜单里的一句话', category: '电子产品',
  dims: { width, depth, height },              // mm，显示在顶栏
  source: { title: '原说明书标题', images: [{ src: '/manuals/my-product/p1-3.jpg', pages: '第 1–3 页' }] },
  package: [{ name: '主机', qty: 1, spec: '…' }],
  params: [{ label: '电池', value: '450 mAh', note: '…' }],
  parts,
  initial: { /* 所有指南共用的初始状态 */ },
  stageSize: 900,                               // 场景范围，决定网格淡出
  guides: [ /* SpecGuide[] */ ],
}
```

然后在 `library/index.ts` 的 `MANUALS` 数组里加上 `myProduct`。

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
| `compound` | `items: (Shape & {at?, rot?, fill?})[]` | 父零件原点 | 一个零件由多块组成（接收器 = 插头 + 外壳） |
| `cable` | `from/to: {part, at, dir}`, `r?`=1.8, `slack?`=1 | 世界坐标 | 充电线、数据线；两端随零件移动 |

`shell` 细节：`n` 越大越方（2 = 椭圆）；`taper` 前端收窄比例；`peak` 最高点位置（-1 前 … 1 后）；`seams` 是顶面分模线 `[x, z][]` 折线（按键缝、滚轮槽）。

`fill`：`white`（默认）、`warm`（纸张 / 木材）、`shade`（浅灰：凹槽、金属件）、`dark`（深色：接口、感应孔）。`hole` 默认 `shade`。

## 零件 SpecPart

```ts
{ id, name, spec?, shape, parent?, at?, rot?, pivot?, fill?, visible? }
```
- `at`：相对父零件的坐标 `[x,y,z]`，或贴外壳表面 `{ on: [x, z], dy? }`（父零件必须是 shell）。
- `rot`：欧拉角（**度**，XYZ 顺序）。
- `pivot`：几何体整体平移，用来设定转轴（屏幕盖板转轴在后沿：`pivot: [0, 0, d/2]`）。
- `visible: false`：初始隐藏（配件、线缆在需要时才出现）。

## 状态 PartState（写在 initial / start / step.set 里）

| 字段 | 含义 |
|---|---|
| `parent` | 换父级；`null` = 放回世界 |
| `at`, `rot` | 新的局部位置 / 姿态 |
| `visible` | 显示 / 隐藏（出现在过渡开始时，消失在过渡结束时） |
| `light` | `off` / `on` / `blink` / `blinkThenOff`（闪约 3.6 秒后熄灭）；只能用于 led |
| `color` | 灯色 |
| `ui` | 屏幕界面（只能用于 screen），`null` = 桌面 |
| `lift` | 过渡时抛物线抬高（mm） |
| `via` | 过渡路径经过的世界坐标点 |
| `delay`, `dur` | 过渡延迟 / 时长（秒，dur 默认 1.1） |

`ScreenUI`：`{ app?, title?, items?: {text, sub?, state?: 'normal'|'selected'|'done'|'muted'}[], button?, buttonActive?, toast?, cursor? }`。只给 `toast` / `cursor` 时画桌面 + 通知。

## 动作 Action（本步循环播放，不改变状态）

| type | 参数 | 用途 |
|---|---|---|
| `press` | `part`, `depth?`=1.2 | 按键按下回弹 |
| `spin` | `part`, `axis?`='x' | 滚轮 / 旋钮转动 |
| `shake` | `part`, `axis?`, `amp?`=1.5 | 检查插紧、晃动 |
| `glide` | `part` | 鼠标在桌面画 8 字；屏幕上 `cursor: true` 的光标同步移动 |

动作默认在本步所有过渡结束后开始，可用 `delay` 覆盖。

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

## 编译语义（重要）

1. 每个指南从 `零件默认 + initial + guide.start` 出发，逐步应用 `set`，状态累积。每一步都编译成「起始帧 → 结束帧」，所以跳到任意一步都能正确播放。
2. 换父级且没给 `at`：保持世界坐标不动，只换跟随关系。
3. 父级不变：在局部坐标里插值（父零件同时移动时子零件跟着走）。父级改变或有 `via`：在世界坐标里插值到新父级的实时位置。
4. 灯和屏幕在该零件过渡开始（`delay`）时切换。
5. 校验（`issues`）会拦下：重复 id、引用不存在的零件、父子成环、`on` 用在非 shell 父级、给非 led 设置 light、给非 screen 设置 ui、无效数字、空指南。

## 动词 → 脚本

| 说明书动词 | 写法 |
|---|---|
| 取出 / 拔出 | `{ parent: null, at: 世界坐标, lift: 20 }` |
| 插入 X 口 | `{ parent: 'host', at: 接口局部坐标, rot, via: 接口外侧一点, dur: 1.6–1.8 }` |
| 拔出再插回 | 位置不变 + `via: 外侧点` |
| 换一个接口 | 新 `at` + `via` 在两个接口之间的外侧 |
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

## 验证技巧

- 校验：`npm run check:manuals`（Vite 加载 TS，逐个编译 MANUALS，打印每个指南的步数与问题）。
- 浏览器自动化截图时，后台标签页的 requestAnimationFrame 会被节流：
  1. 从 `performance.getEntriesByType('resource')` 找到 `/src/store.ts` 和 `@react-three_fiber.js` 的 URL 并动态 import；
  2. `useApp.getState().setProduct('manual:<id>')`、`setGuide(id)`、`go(i)`；
  3. 循环 `fiber.advance(performance.now())`（用 MessageChannel 让出线程，不要用 setTimeout），持续约 1.3 秒让相机飞完；
  4. 把 `anim.start` 设为 `performance.now() - 6000` 让本步动画跑完；
  5. 对 `fiber._roots` 里每个画布执行 `gl.render(scene, camera)` 后 `canvas.toDataURL()`，主画布 + 细节窗拼成一张图。
- 标注是 DOM 层（`.callout-layer`），画布截图里看不到；需要的话按 `.callout` 的 `getBoundingClientRect()` 叠画到截图上。
- 闪烁灯截图可能正好落在「灭」的半周期，换一个时间点再截。
