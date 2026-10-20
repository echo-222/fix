---
name: manual-to-3d
description: Turns any product manual (说明书 photos, PDF pages or text — electronics, appliances, tools, furniture) into an interactive 3D line-art demo in the 修理工 app by analysing the pages, modelling parts from primitives, scripting per-step states (moves, switches, lights, screens, cables), then validating and visually verifying. Use when the user asks to convert a 说明书 / user manual / quick-start guide / installation or repair instructions into a 3D演示 or interactive guide, or to add a new product manual to the app.
---

# 说明书 → 3D 交互演示

把一份说明书变成「线稿 3D 场景 + 分步动画 + 细节放大 + 原文溯源」。
核心产物是一份**场景脚本** `ManualSpec`（`src/domain/manual/types.ts`），编译器与渲染器已经通用，**新增说明书通常只需要写一个脚本文件**。

- 脚本格式完整参考：[reference.md](reference.md)
- 完整案例（蓝牙鼠标，5 页 → 5 个指南 33 步）：[examples.md](examples.md)

## 0. 先分流

| 说明书类型 | 做法 |
|---|---|
| 电子产品、小家电、工具、玩具……有开关 / 指示灯 / 屏幕 / 接口，或「先做 A 再做 B」的使用流程 | **场景脚本**（本 skill 主体） |
| 结构件尺寸可调、需要算料的家具（铝型材 / 光轴） | 参数化生成器：`src/domain/desk.ts`、`src/domain/shaft/*`，参照已有三款 |
| 固定尺寸家具的组装说明 | 也用场景脚本：零件用 box / slab / cylinder，步骤用「从 via 点移到安装位」 |

拿不准时用场景脚本——它覆盖面最大。

## 工作流（复制这份清单，逐项勾选）

```
- [ ] 1 收集页面：照片放进 public/manuals/<id>/，记录每张图包含哪几页
- [ ] 2 逐页转写：页码 | 小节 | 原文指令 | 涉及实体 | 状态变化
- [ ] 3 实体清单：产品零件 + 场景道具 + 每个可变状态（开关档位 / 灯色与闪法 / 屏幕界面）
- [ ] 4 定坐标约定：单位 mm、Y 向上、地面 y=0、观众在 +Z；产品局部前方；翻面姿态
- [ ] 5 建模：src/domain/manual/library/<id>.ts 的 parts
- [ ] 6 写指南与步骤：一条原文指令 = 一步，set 只写变化
- [ ] 7 镜头 / 高亮 / 标注 / 细节窗 / 页码
- [ ] 8 注册 + 校验：library/index.ts → npm run check:manuals → npx tsc --noEmit → npm run build
- [ ] 9 视觉验证：逐步截图检查，修完再交付
```

### 1. 收集页面
- 把用户给的图片复制到 `public/manuals/<id>/`（`<id>` 小写 + 连字符，如 `mouse-bt54`）。
- `source.images` 里写清每张图对应的页码（「封面 · 第 1–2 页」），面板「原说明书」会展示它们。

### 2. 逐页转写（最重要的一步，别跳）
先把**每一页**转成表格，再动手建模。每条指令归到一个动作动词（见 reference.md「动词 → 脚本」）：
取出、插入、拔出、拨动、按下、旋转、翻面、靠近、连接线缆、观察指示灯、电脑/手机上操作、等待。
同时摘出：包装清单、基本参数、注意事项、故障排查——它们分别进入 `package`、`params`、步骤的 `tip`、`kind: 'repair'` 指南。

原文没写清的空间关系（开关在左还是右、灯在哪一面），**以图为准**；图也看不清就按常见产品布局并在交付时说明。

### 3. 实体清单
- 产品本体与所有用户会碰到的零件（按键、滚轮、开关拨钮、接口、指示灯、仓盖、配件）。
- 场景道具：说明书里出现的电脑 / 手机 / 插座 / 墙面。道具只做到能讲清步骤的精度。
- 每个可变状态列出全部取值：开关档位坐标、灯色 + 闪法（常亮 / 闪烁 / 闪几秒熄灭）、屏幕上依次出现的界面。
- 尺寸优先用说明书参数（如「115×55×22mm」），其余按真实产品比例估算。

### 4. 坐标约定（写在脚本文件头注释里）
- 产品局部「前方」（例如鼠标滚轮方向 = -z），左右按用户正常使用时的视角。
- 需要看底面时用「翻面」姿态：绕 z 轴 180°，`at.y` 抬高产品高度。**翻面后左右会镜像**，对照说明书底视图核对一次。
- 平面类形体（hole / led / screen / text）默认朝 +Z，用 `rot` 转向，常用角度见 reference.md「朝向速查」。

### 5. 建模原则
- 用最少的基本形体讲清楚：外壳 `shell`、板状 `slab`、方块 `box`（带 chamfer）、圆柱 `cylinder`、开孔/接口 `hole`、灯 `led`、屏幕 `screen`、丝印 `text`、组合 `compound`、线缆 `cable`。
- **父子关系**表达「跟着走」：按键、灯、接口挂在本体上；插进电脑的接收器改挂到电脑上。
- 贴在曲面外壳上的零件用 `at: { on: [x, z], dy }`，自动落到表面高度。
- 小于 1.5 mm 的细节不要建；靠 `zoom` 细节窗和标注讲。
- 零件数量控制在 60 以内，单个场景范围 ≤ 1.5 m（`stageSize`）。

### 6. 步骤编排
- 一条原文指令 = 一个 `SpecStep`；标题用动词开头（「插入电脑 USB 口」）。
- `set` 只写**本步变化**的零件；状态会自动累积到后续步骤。
- 同一步里的先后顺序用 `delay`：先翻面（dur 1.4），再拨开关（delay 1.6）。
- 拔出再插回、绕开障碍物用 `via`（路径经过该世界坐标点）；从桌面拿起用 `lift`。
- 换父级不给 `at` 时保持世界位置不动（适合「拔出后先放在原地」）。
- 每个指南的起始状态用 `start`，所有指南共用的用 `initial`。指南之间互不影响。
- 故障排查单独成一个 `kind: 'repair'` 指南，每个排查分支一步。

### 7. 镜头、标注与溯源
- 每步必填 `camera`；整体用 `dist` 1000–1300，近景 250–450，细节窗 `zoom` 70–140。
- `highlight` 只放本步要操作的零件（红色线稿）。
- `callouts` 每步 ≤ 6 个；近景下 offset 25–50 mm，远景 60–100 mm，左右分开排避免重叠。
- 小部件（< 15 mm）一律配 `zoom` 细节窗，`caption` 写结论（「黄灯闪烁 = 电源正常」）。
- 每步写 `page`，界面上自动显示「说明书 第 N 页」。注意事项写进 `tip`，参数写进 `chips`。

### 8. 注册与校验
1. 在 `src/domain/manual/library/index.ts` 的 `MANUALS` 里加入新脚本（菜单「选择家具 / 说明书」自动出现）。
2. `npm run check:manuals` —— 引用不存在的零件、父子成环、`on` 用在非外壳父级、给非灯设置 light 等都会报出，必须为 0 问题。
3. `npx tsc --noEmit`，`npm run build`（沙箱里 build 需要完整权限）。

### 9. 视觉验证（必须做）
打开 App → 菜单 → 选择家具 / 说明书 → 新产品，逐个指南逐步检查：
- [ ] 文字 / 丝印没有镜像，左右与说明书插图一致
- [ ] 没有零件穿进地面或彼此穿插；插头确实进了接口
- [ ] 标注都在画面内、互不遮挡；细节窗看得到目标
- [ ] 指示灯朝向镜头可见（底部灯用 `dir: 'under'` 的细节窗）
- [ ] 线缆没有打结或穿过物体（调 `slack` 和插头朝向）
- [ ] 屏幕界面文字完整

后台标签页会节流渲染：截图前要让动画与相机飞行跑完（见 reference.md「验证技巧」）。

## 交付给用户时说明
1. 处理步骤分析（转写表的摘要：几页、几个指南、多少步、每个指南对应哪几页）。
2. 实现了什么、在哪里看（菜单 → 选择家具 / 说明书 → 产品名）。
3. 哪些地方是推断的（说明书没写清的位置 / 尺寸）。

## 需要扩展脚本格式时
- 新形体：`types.ts` 的 `Shape` → `three/manual/shapes.ts`（几何）→ `ManualStage.tsx` 的 `ShapeView`。
- 新动作：`types.ts` 的 `Action` → `ManualStage.tsx` 的 `solve()`。
- 新校验：`compile.ts` 的 `compileManual()` 往 `issues` 里推消息。
保持「脚本只描述、不写代码」——任何产品都能只靠数据描述。
