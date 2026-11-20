---
name: origami-3d
description: Turns an origami tutorial (折纸图解 photos, step diagrams, video keyframes, or a model name to look up online) into an interactive 3D folding demo in the 懂了 Dongle app — one continuous sheet of paper simulated fold by fold from a JSON fold program, with curved creases, two-coloured sides, thickness, shading and a 3D finished model for the cover. Use when the user asks for 折纸 / origami / 纸飞机 / 千纸鹤-style tutorials, wants an origami item added to the 折纸 category, or when the website import pipeline classifies an upload as an origami diagram.
---

# 折纸图解 → 3D 折纸演示

产物是一份 `ManualSpec`（`genre: 'tutorial'`、`category: '折纸'`），里面**只有一个零件**：一张 `origami` 纸。
纸怎么折写在 `shape.ops`（折纸程序，JSON），编译时引擎一步步模拟出每块面的姿态；步骤只切换 `fold: k`（折到第 k 步）。

- 折纸程序语言、坐标、正负号：[reference.md](reference.md)
- 截图复核清单：[verify.md](verify.md)
- 引擎：`src/domain/manual/origami.ts`（模拟）· `src/three/manual/OrigamiView.tsx`（渲染）· 类型 `OrigamiShape` / `FoldOp`（`src/domain/manual/types.ts`）
- 样板：`origami-dart.ts`（纸飞机：对折打开、斜边、山折、立体展开）· `origami-cup.ts`（只折一层、往里塞、撑开杯口）· `origami-dog.ts`（画眼睛鼻子、立起来）· `origami-heart.ts`（翻面、山折小角、立起来当摆件）

## 那条真正重要的原则

**按顺序一折一折地模拟，不要摆结果。** 折纸的层次（谁压在谁上面）在任何一张图里都看不见，但每一折对层次的影响是确定的：照图解的顺序一步步执行，层次自然就对了。
这也是 FoldingAgent（SIGGRAPH Asia 2026）的做法：把图解 / 视频拆成「上一帧 → 下一帧」的转换，每次只选一个动作（fold / unfold / rotate / flip），模拟器维护几何、层序和折痕，再拿渲染结果和原图对照，不对就退回重来。

好的折纸演示要同时做到：
1. **一张连续的纸**：所有面都连着，折边是弯过去的圆边，不是一块块飘着的碎片（引擎自动做到，前提是用 ops 写，而不是拼多个零件）。
2. **看得出立体**：两面颜色不同、有厚度、有明暗、折过去的那片压在上面；**最后一步一定是立体成品**（立起来、撑开、翅膀张开），封面和广场图就取这一步。
3. **数字可信**：纸张尺寸、折到哪个点（角对角、边对中线、往后折多少 mm）都来自参考教程，算出来的写进 chips / params。

## 工作流

复制这份清单逐项打勾：

```
- [ ] 0 判断能不能做（只用简单折）、选纸
- [ ] 1 找参考教程，记下来源链接和数字
- [ ] 2 逐步转写图解：符号 → 动作 → 参考点
- [ ] 3 写折纸程序 ops（一图一折），引擎零报错
- [ ] 4 立体收尾：stand / rotate 让成品立起来
- [ ] 5 写指南和步骤（镜头、高亮、chips、tip）
- [ ] 6 验证：probe → check:manuals → 截图逐张看 → 封面 / 广场图
```

### 0. 能不能做

引擎支持的是「简单折」（Pureland 折纸的全部 + 立体造型）：

| 支持 | 图解里长什么样 |
|---|---|
| 谷折 / 山折（整叠或只折某几层） | 虚线 `- - -` + 箭头 / 点划线 `-·-·-` |
| 折了再打开（压折痕） | 箭头折过去又折回来 |
| 翻面、在桌上转 | 带圈的翻转箭头 / 旋转符号 |
| 折一半（立起来 90°） | 箭头只到半路 |
| 立体造型：绕旧折痕转开 / 立起来 / 撑开 | 「打开」「立起来」「撑开」 |
| 画眼睛、鼻子 | 黑点 |

**不支持**：内翻折 / 外翻折（reverse fold）、压平折（squash）、花瓣折（petal）、沉折（sink）、一次收拢多条折痕（collapse，正方基本型 / 双三角基本型 / 鹤）。
碰到这些：先找同一个作品的「简化版」（很多入门作品就是简单折）；实在不行就换作品，并在 notes / params 里说明。不要硬凑出看起来像、层次却是错的结果。

纸：正方形 15 cm（入门作品）、A4 210 × 297 mm（纸飞机）。单面色纸写 `color`，白面用缺省；双面同色把 `white` 也写成同一个颜色。大多数作品**白面朝上开始**（缺省 `up: 'white'`）。

### 1. 找参考教程

联网找一份图解清楚的教程当「原文」（Origami Resource Center、Fold 'N Fly、wikiHow、PlayOwl 之类），记：
- 来源标题 + URL → `source: { title, url, images: [] }`（参考图不进 `public/`，文字自己写）；
- 纸张尺寸、每一折对齐到哪里、往后折多少；
- 成品尺寸（宽 × 高）→ `dims`、params。

### 2. 逐步转写

先列一张表（写在文件头注释或 notes 里），一行一个图解步骤：

| 步 | 图上的符号 | 动作 | 参考点（图解坐标） |
|---|---|---|---|
| 2 | 下角虚线箭头到上角 | 谷折 | bring 下角 [0, −a] onto 上角 [0, a] |
| 5 | 点划线、箭头往后 | 山折，只折前片 | line …，under，only: { moved: 2 } |

坐标永远是**纸当前摆在桌上的位置**（俯视，x 向右，y 朝远离观众），不是展开图坐标。每写一行之前先想清楚：上一步之后，这个角 / 这条边现在在哪？（不确定就用 probe 打印包围盒，或用 `{ flap: 点 }` 按位置选层。）

### 3. 写折纸程序

一个图解步骤 = 一个 op（「折了再打开」= `fold` + `unfold` 两个 op，各算一步，方便演示）。优先用**点对点**的写法：

- 「把 A 角折到 B 点」→ `{ op: 'fold', bring: A, onto: B }`（折线 = AB 的中垂线，A 那一侧翻过去）；
- 「沿这条线折」→ `{ op: 'fold', line: [P, Q], move: 要翻过去那一侧的任意一点 }`；
- 山折加 `under: true`；只折最上面几层用 `only`（`{ moved: k }` = 第 k 步折过来的那片）。

细节、正负号、选层规则见 [reference.md](reference.md)。引擎报错会写明「第 k 步（op）：原因」，照着改。

### 4. 立体收尾

压平的成品放在封面上就是一张平面。最后加一两步把它「变成立体」：
- 纸飞机：`stand`（沿机身底边立起来）→ `rotate` 两边机翼各打开到上反角；
- 纸杯：`stand` → `rotate` 前后两片撑开杯口；
- 小狗脸 / 爱心：`stand`（或 `rotate` 绕底边）立起来，像摆件一样斜靠；
- 鹤、青蛙这类本身立体的作品：同样用 rotate 把翅膀 / 腿掰到成品姿态。

### 5. 指南和步骤

- 指南 1「折一个 …」（`kind: 'assembly'`）：第 0 步是平铺的纸（`set: { 纸: { fold: 0 } }`，高亮整张纸，chips 写纸张尺寸），之后每一步 `set: { 纸: { fold: k } }`、`highlight: [纸]`（本步翻动的面自动提亮、描边加粗）。
- 指南 2「玩起来 / 用起来 / 送出去」（`kind: 'usage'`）：`start: { 纸: { fold: 最后一步 } }`，讲怎么玩、怎么调（纸飞机试飞调整、纸杯装东西、在背面写字）。
- 镜头：TS 样板用 `paper.view(k, dir)`；网站导入时**只写 `camera: { dir }`**，服务器按那一步纸的实际形状补 `target` / `dist`。平铺的几步从斜上方看（`[0.1, 1, 0.6]`），山折的步骤压低一点看得见背面（`[0.1, 0.75, 1]`），立体成品从斜前方（`[0.5, 0.45, 1]`）并 `orbit: true`。
- 文案：title 动词开头（「下角对折到上角」），desc 讲对齐到哪里，tip 讲容易错的地方；chips 放角度、距离（「与中线 22.5°」「往后折约 1.2 cm」）。

### 6. 验证

```bash
node scripts/origami-probe.mjs <id>          # 每步：op、动了几块面、抬起高度、包围盒、引擎报错；成品左右镜像误差
npm run check:manuals -- <id>                # 编译 + 场景审计，归零
SHOOT_PORT=52xx node scripts/shoot-manuals.mjs <id>   # 每一步的截图 + 联系表，逐张看
npm run plaza -- manual:<id> && npm run covers -- manual:<id>   # 广场模型图、封面
```

- 对称的作品（纸飞机、爱心、小狗脸）镜像误差应该 < 1 mm；大了说明某一折的参考点写错了。
- 截图按 [verify.md](verify.md) 逐项看，尤其是「翻过去的那片在上面」「白面 / 彩面对不对」「最后一步是立体的」。
- 封面、广场图在 `scripts/picks.mjs` 里挑立体成品那一步（`'manual:<id>': '<指南>/<步序号>/<镜头倍数>'`，封面是竖版，倍数 1.6–1.8）。

## 转写要点（网站导入）

折纸图解（教程截图、图解照片、视频关键帧）：product.category 写 "折纸"；rows 一条 = 图上一步，text 照抄文字，change 写清楚：图上的符号（谷折虚线 / 山折点划线 / 折了再打开 / 翻面 / 旋转 / 往里塞 / 撑开）、哪个角或哪条边折到哪里（「下角折到上角」「左下斜边对齐中线」）、只折前面一层还是整叠。另外加两个字段
"paper": { "size": "15 × 15 cm 或 A4", "color": "#rrggbb（彩色面）", "white": "#rrggbb（另一面）", "start": "白面朝上 / 彩面朝上，正方形还是菱形摆放" }，
"unsupported": ["内翻折 / 压平折 / 沉折 / 收拢这类简单折以外的步骤（第几步、怎么折的）"]。

## 网站后台

网页导入的分流步骤判为折纸图解（`origami`）后用这份 skill：转写（上面的转写要点）→ 写 ManualSpec JSON（ops 写成字面量）→ 编译 + 审计 + 修复（镜头只写 dir，服务器按纸的形状补 target / dist）→ 保存 → 截图复核（[verify.md](verify.md)）。不走 Tripo 外观模型（纸由引擎画）。提示词由 `server/manualSkill.ts` 每次现读本文件、reference.md 和 verify.md 拼成。

## 参考

- FoldingAgent（Moriya 等，SIGGRAPH Asia 2026）：把折纸视频转成参数化折叠程序，动作语言 fold / unfold / rotate / flip，模拟器维护层序，critic 对照原图。[论文](https://arxiv.org/abs/2609.00377) · [代码](https://github.com/maya-moriya/FoldingAgent)
- Origami Simulator（Ghassaei、Demaine、Gershenfeld，MIT 许可）：按折痕图同时折所有折痕的 GPU 模拟，适合看「收拢」类作品。[origamisimulator.org](https://origamisimulator.org/) · [GitHub](https://github.com/amandaghassaei/OrigamiSimulator)
- Rabbit Ear（GPL-3.0，只参考思路、不引入代码）：FOLD 格式、平折可行性、层序计算。[rabbitear.org](https://rabbitear.org/)
- 图解符号：吉泽–蓝德列特体系（Yoshizawa–Randlett system）。
