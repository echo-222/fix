// 把 skill 内置进网页导入流程：分流（skillRouter.ts）之后，按链路每次请求现读对应 skill 的文档和类型定义拼成提示词，
// 改了 skill 不用改这里。系统提示词在一个任务的各轮调用里保持一致，方便服务商做前缀缓存。
//   manual → manual-to-3d · origami → origami-3d · popup → popup-3d · physics → physics-3d · mechanism → mechanism-3d · free → freeform-3d
// 每份 skill 的 SKILL.md 里「## 转写要点」给转写用、「## 复核清单」给截图复核用（manual-to-3d、origami-3d 用各自的 verify.md）。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROUTES, type Route } from './skillRouter.ts'

const SKILLS = '.cursor/skills'
const SKILL_DIR = join(SKILLS, 'manual-to-3d')
const ORIGAMI_DIR = join(SKILLS, 'origami-3d')
const TYPES = 'src/domain/manual/types.ts'
const dirOf = (route: Route) => join(SKILLS, ROUTES[route].skill)

function doc(name: string, dir = SKILL_DIR) {
  const path = join(dir, name)
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf8').replace(/^---[\s\S]*?---\s*/, '').trim()
}

/** 一节的范围：从标题到下一个同级或更高级的标题 */
function span(text: string, heading: string): [number, number] | null {
  const a = text.indexOf(heading)
  if (a < 0) return null
  const level = heading.match(/^#+/)![0].length
  const next = new RegExp(`\\n#{1,${level}} `, 'g')
  next.lastIndex = a + heading.length
  const m = next.exec(text)
  return [a, m ? m.index + 1 : text.length]
}

/** 去掉一节 */
function drop(text: string, heading: string) {
  const s = span(text, heading)
  return s ? text.slice(0, s[0]) + text.slice(s[1]) : text
}

/** 取一节的正文（不含标题行） */
function section(text: string, heading: string) {
  const s = span(text, heading)
  if (!s) return ''
  const body = text.slice(s[0], s[1])
  return body.slice(body.indexOf('\n') + 1).trim()
}

/** reference.md 的「外观模型」保留格式和实测经验；定朝向、生成清单是命令行步骤，网页流程由服务器做 */
function reference() {
  return drop(drop(doc('reference.md'), '### 定朝向'), '### 生成清单')
}

/** SKILL.md 里和网页流水线无关的部分（命令行、外观模型、交付说明）去掉 */
function skillCore() {
  const text = doc('SKILL.md')
  const cut = (s: string, from: string, to?: string) => {
    const a = s.indexOf(from)
    if (a < 0) return s
    const b = to ? s.indexOf(to, a + from.length) : -1
    return s.slice(0, a) + (b < 0 ? '' : s.slice(b))
  }
  return cut(cut(text, '### 10. 外观模型', '## 交付时说明'), '## 交付时说明', '## 扩展脚本格式时')
}

const JSON_RULES = `
## 你在网站流水线里的位置
网站已经替你做了：收集页面（上传的图片 / PDF 逐页图，第 N 张 = 第 N 页）、注册、编译校验、场景审计、截图。
你负责 skill 的第 2–7 步，产物是一份 ManualSpec，但必须写成**纯 JSON**：
- 不能有函数、变量、常量、注释、表达式、展开运算；所有数值写成字面量（最多 1 位小数）。
- skill 文档和示例里的 TypeScript 片段（bx()、cy()、plug()、add() 这类 helper、const 常量）只是写法示意，你要把它们展开成 JSON 字面量。
- 不要写 source（服务器填）。零件的 model / baked 由网站的外观流程（Tripo 生成）填：不要自己加；脚本里已经有的 model 只能调 rot / fit / crop，src 不动。
- 材质可以写：spec.finishes 按 fill 给缺省，个别零件写 finish（见 reference.md「真实材质」）。
- id：小写字母、数字、连字符（品牌-型号，例如 xiaomi-lamp-1s）。零件 / 指南 / 步骤 id 同样用短横线小写英文。
- 中文文案：name、desc、title、tip、callout、chips 都用简体中文，数字、灯色、档位名照抄说明书。
- 每一步都要有 camera 和 page（page = 第几张上传页，从 1 开始）。
- 零件数 ≤ 60；看不清的空间关系按常见布局推断，并在 params 或 tip 里说明「推断」。
- 坐标单位毫米，Y 向上，地面 y = 0，观众在 +Z；产品默认摆在原点附近、底面贴地。`

export function authorSystem(exampleJson: string) {
  return [
    '你是「懂了 Dongle」网站内置的说明书 → 3D 交互演示生成器，严格按下面的 manual-to-3d skill 工作。',
    JSON_RULES,
    '\n# Skill：manual-to-3d\n' + skillCore(),
    '\n# reference.md（脚本 API）\n' + reference(),
    '\n# craft.md（建模与镜头手艺）\n' + doc('craft.md'),
    '\n# examples.md（案例）\n' + doc('examples.md'),
    '\n# types.ts（ManualSpec 的权威类型定义；JSON 必须符合它）\n```ts\n' + readFileSync(TYPES, 'utf8') + '\n```',
    '\n# 完整示例：蓝牙鼠标说明书的 ManualSpec（已展开成 JSON；照这个结构和细致程度写）\n```json\n' + exampleJson + '\n```',
  ].join('\n')
}

const ORIGAMI_JSON_RULES = `
## 你在网站流水线里的位置
用户上传的是折纸图解（教程截图 / 图解照片 / 视频关键帧）。网站已经替你做了：收集图片（第 N 张 = 第 N 页）、编译时模拟折纸程序、场景审计、截图。
你负责 skill 的第 2–5 步，产物是一份 ManualSpec，必须写成**纯 JSON**：
- 不能有函数、变量、注释、表达式；所有数值写成字面量（最多 1 位小数）。skill 里的 TS 写法（paper.fold(...)、paper.view(...)）只是示意，你要写成 shape.ops 里的 op 对象。
- 顶层：id（小写连字符，例如 origami-crane-easy）、name、desc（≤ 30 字）、category 固定 "折纸"、genre 固定 "tutorial"、dims（成品宽 / 深 / 高 mm）、package（材料：纸张尺寸颜色）、params（难度、折数、关键对齐、成品尺寸）、parts、guides、notes。
- parts 只有一个 origami 零件；不要写 model / finishes / parent / plug，不要写别的零件。不要写 source（服务器填）。
- 步骤：set 只写 { "<纸 id>": { "fold": k } }；camera 只写 { "dir": [x, y, z] }（服务器按那一步纸的形状补 target / dist）；highlight 写 ["<纸 id>"]；page = 这一步对应第几张上传图（从 1 开始）。
- 中文文案：name、desc、title、tip、chips 用简体中文；数字照抄教程或写明推断。
- 坐标单位毫米；折纸程序用图解坐标 [x, y]（俯视，y 朝远离观众），永远是纸当前的位置。`

/** 折纸图解走 origami-3d skill：skill 文档 + 类型定义 + 库里折纸作品的 JSON 样板 */
export function origamiSystem(exampleJson: string) {
  const skill = doc('SKILL.md', ORIGAMI_DIR)
  return [
    '你是「懂了 Dongle」网站内置的折纸图解 → 3D 折纸演示生成器，严格按下面的 origami-3d skill 工作。',
    ORIGAMI_JSON_RULES,
    '\n# Skill：origami-3d\n' + skill.slice(0, skill.indexOf('### 6. 验证')) + skill.slice(skill.indexOf('## 参考')),
    '\n# reference.md（折纸程序语言）\n' + doc('reference.md', ORIGAMI_DIR),
    '\n# types.ts（ManualSpec 的权威类型定义；JSON 必须符合它）\n```ts\n' + readFileSync(TYPES, 'utf8') + '\n```',
    '\n# 完整示例：库里的折纸作品（已展开成 JSON，镜头只留 dir；照这个结构和细致程度写）\n```json\n' + exampleJson + '\n```',
  ].join('\n')
}

export const ORIGAMI_AUTHOR_TASK = `按上面的逐步转写和图解图片，写出完整的 ManualSpec JSON（只输出这个 JSON 对象）。
先在心里做完 skill 的第 0–5 步：判断每一步是不是简单折（不支持的折法找简化写法，并在 notes 里说明）→ 定纸张尺寸、颜色和起手朝向 → 逐步写 ops（一张图一个 op，「折了再打开」拆两个；角对角、角对点用 bring / onto）→ 最后加立体收尾（stand / rotate），让成品立起来 → 写指南：「折一个 …」（第 0 步 fold: 0 平铺，之后每步 fold: k）和「玩起来 / 用起来」（start 为最后一步）。
在 "notes" 里写：起手坐标（纸的四个角在哪）、每个 op 的参考点怎么来的、哪些地方是推断或简化。`

export function origamiReviewTask(round: number) {
  return `第 ${round} 轮视觉复核。附图依次是：各指南的截图联系表（每格是一步折完的样子），以及上传的折纸图解。
按 origami-3d skill 的 verify.md 逐项对照：每一步的轮廓、哪片在上面、露出的是白面还是彩面、有没有整叠一起翻（应该只折一层）、最后一步是不是立体成品、镜头是否合适。
改折纸程序时整体替换零件的 shape（parts 里写完整的 origami shape），步骤的 fold 要跟着 ops 的步数调整；镜头不合适就把 camera 改成只写 dir（服务器重新取景）。
只修真正看得出的问题；画面没问题就返回 {"notes": "无需修改"}。

# verify.md
${doc('verify.md', ORIGAMI_DIR)}

${PATCH_FORMAT}`
}

/** 转写请求的用户消息开头（mock-llm 靠它认请求） */
export const TRANSCRIBE_LEAD = '资料共'

const PAGES_NOTE = '用户上传了逐页图片（第 N 张 = 第 N 页），可能附带 PDF 里抽出的文字。逐页读图，不要跳页、不要编造；看不清的写「看不清」。'

function transcriptSchema(route: Route) {
  const r = ROUTES[route]
  const name = route === 'manual' ? '中文产品名（含品牌型号）' : '中文名称（作品 / 实验 / 机构 / 主题）'
  const category = r.category ? `${r.category}` : route === 'manual' ? '电子产品 / 小家电 / 工具 / 家具 …' : '2–4 字中文品类（烹饪 / 手工 / 化学实验 / 急救 …）'
  return `
# 输出（只输出一个 JSON 对象）
{
  "product": { "name": "${name}", "brand": "", "model": "", "category": "${category}", "desc": "菜单里的一句话介绍（≤ 30 字）", "idHint": "小写连字符英文（品牌-型号或主题）" },
  "dims": { "width": 0, "depth": 0, "height": 0, "evidence": "尺寸出处或推断依据（成品 / 装置 / 场景的外形尺寸，mm）" },
  "pages": [ { "page": 1, "summary": "这一页讲什么" } ],
  "rows": [ { "page": 1, "section": "小节", "text": "原文（照抄关键句）", "entities": ["涉及的实体"], "change": "场景里的状态变化（移动 / 插入 / 开关 / 灯 / 屏幕 / 转动 / 出现 …）" } ],
  "entities": [ { "name": "", "kind": "body | cover | button | switch | knob | port | led | screen | cable | accessory | fastener | panel | material | tool | prop | other", "size": "尺寸（mm，原文或估计）", "where": "位置（以图为准）", "states": ["可变状态，例如档位、灯色闪法、屏幕界面、角度"] } ],
  "package": [ { "name": "", "qty": 1, "spec": "" } ],
  "params": [ { "label": "", "value": "", "note": "" } ],
  "guides": [ { "title": "", "kind": "usage | assembly | repair", "pages": [1, 2], "steps": ["一条原文指令一句话"] } ],
  "inferred": ["哪些位置 / 尺寸 / 数字是推断的"],
  "confidence": 0.0
}`
}

/** 转写：按链路读对应 skill 的摘要和「转写要点」（说明书链路用 manual-to-3d 的摘要和动词表） */
export function transcribeSystem(route: Route) {
  const r = ROUTES[route]
  if (route === 'manual') {
    const skill = doc('SKILL.md')
    const verbs = (() => {
      const text = doc('reference.md')
      const a = text.indexOf('## 动词 → 脚本')
      const b = text.indexOf('\n## ', a + 5)
      return a < 0 ? '' : text.slice(a, b < 0 ? undefined : b)
    })()
    return [
      '你是「懂了 Dongle」网站内置的说明书分析器。这份资料已经分流为产品说明书，你执行 manual-to-3d skill 的第 2–3 步（逐页转写、实体清单）。',
      PAGES_NOTE,
      '\n# Skill 摘要\n' + skill.slice(0, skill.indexOf('## 工作流')),
      '\n' + verbs,
      transcriptSchema(route),
    ].join('\n')
  }
  const skill = doc('SKILL.md', dirOf(route))
  return [
    `你是「懂了 Dongle」网站内置的资料分析器。这份资料已经分流为「${r.label}」，接下来按 ${r.skill} skill 做成 3D 交互演示；你负责其中的转写：逐页读图，把步骤、实体、数字整理出来，给下一步写场景脚本用。`,
    PAGES_NOTE,
    `\n# Skill 摘要（${r.skill}）\n` + skill.slice(0, Math.max(0, skill.indexOf('## 工作流'))),
    '\n# 转写要点\n' + section(skill, '## 转写要点'),
    transcriptSchema(route),
  ].join('\n')
}

export const AUTHOR_TASK = `按上面的逐页转写和页面图片，写出完整的 ManualSpec JSON（只输出这个 JSON 对象）。
先在心里做完 skill 的第 3–7 步：实体与可变状态 → 坐标约定 → 建模 parts（父子挂接、接口用 hole、灯用 led、屏幕用 screen）→ 指南与步骤（一条原文指令 = 一步，插接用 plug）→ 每步 camera / highlight / callouts / zoom / page。
坐标约定写进顶层 "notes" 字段（字符串：原点、前方朝向、主要零件布局），方便后续修改。`

export const PATCH_FORMAT = `只输出一个 JSON 补丁对象，不要重写整份脚本：
{
  "notes": "这轮改了什么（中文，一两句）",
  "parts": [ /* 新增或修改的 SpecPart，按 id 匹配 */ ],
  "removeParts": [ "零件 id" ],
  "initial": { /* 可选：整体替换 initial */ },
  "guides": [ /* 可选：SpecGuide（按 id），steps 列表决定步骤顺序、没列出的步骤会删掉，改动很大时用 */ ],
  "steps": [ { "guide": "指南 id", "after": "可选：新步骤插在哪一步之后", "step": { /* SpecStep，按 id 修改或新增 */ } } ],
  "removeSteps": [ { "guide": "指南 id", "id": "步骤 id" } ],
  "top": { /* 可选：name / desc / dims / stageSize / package / params 等顶层字段 */ }
}
已有的零件 / 步骤按 id 和原来的合并：只写 id 和要改的字段即可（顶层字段整体替换，比如改 camera 要写完整的 camera），值写 null 表示删掉这个字段；新增的要写完整。
引用的零件 id 必须存在（或在同一个补丁里新增）。`

export function repairTask(problems: string[], round: number) {
  return `第 ${round} 轮修复。网站对当前脚本做了编译校验和场景审计（规则见 skill 的 verify.md / reference.md「编译语义」），发现下面的问题。
逐条修到 0 problems；warnings 能修就修。修的时候遵守 craft.md：穿插 / 穿地就调整位置或尺寸，插接不对就改用 plug，镜头问题调整 camera（dist / dir / target），小件补 zoom。

问题：
${problems.map((p) => '- ' + p).join('\n')}

${PATCH_FORMAT}`
}

export function appearanceTask(max: number, photos: number) {
  return `第 10 步：真实外观模型（Tripo）。网站按你的计划调用 Tripo 生成 GLB 网格，挂到零件的 model 上替换外观；shape 仍是审计和动画用的代理，步骤不变。
默认要做：只要有合适的零件就生成，让产品看起来像真的。
${photos ? `附图先是用户另传的 ${photos} 张产品照片（「产品照片 N」），然后是说明书原页（「第 N 页」）。` : '附图是说明书原页（「第 N 页」），用户没有另传产品照片。'}

选件（最多 ${max} 个，按重要性排）：
- 选产品主体和体积大、外形复杂、刚性的件：机身、主机、底座 / 基站、手柄、水箱、配件主体。整机能一次生成就别拆碎。
- 不选：hole / led / screen / text / cable；会单独动的小部件（按键、开关、压杆、卡扣、保险销），它们保持几何体叠在模型表面；板式家具的板件、五金、螺丝、工具，这些用 finishes 材质。
- 一物一画：同一个东西只能有一种画法，要么在模型里，要么是几何体。模型里自带一排按键、上面又叠一排几何按键，会两层互相遮挡、对不上。所以模型零件的每个直接子零件（cable 除外）必须归进下面一类：
  · geometry（保持几何体，模型里不要有它）：步骤里要按 / 拨 / 转 / 高亮的件（按键、旋钮、开关、拨杆、卡扣）、led / screen / hole / text、成排重复的规整小东西（按键阵列、格栅、螺丝）、参考图里看不见的（装在里面的电池、滤网，背面的接口）。看得见的那些要在参考图里用 cover 抹平，text 生成就在 prompt 里写明不要（"smooth blank front panel, no buttons, no screen"）。
  · baked（长在模型里，原位时不重复画，被打开 / 取出的那步自动换回代理形状）：大块的、平时待在原位、只在个别步骤打开或取出的件（上盖、面板、盖板、尘盒、提把）。要按 / 转的件不能 baked（原位时只有模型里那一份，动作看不到）；led / screen 不能 baked。
  模型只管外壳和主体曲面，简单、重复、要演示的细节都交给几何体。
- 抹平后只剩一块光板的件（遥控器、开关面板、平板面板：特征全在按键和屏幕上）不选：Tripo 认不出光板会乱补出把手、凸起，几何体本来就画得干净。

参考图（按优先级选一个）：
1. 产品照片：source "photo"，image = 照片序号。只给照片里占了一大块的件用（通常是整机 / 主体）；在照片里只是一小块的部件（喷嘴、按键、旋钮）用 "text"。
2. 说明书页里这个零件完整、清楚的单独图（产品照片、渲染图、整机外观线稿都行；爆炸图、局部特写、被手挡住的不行）：source "page"，image = 页号。
3. 都没有：source "text"，只靠 prompt 生成（像个通用款，但比几何体真实）。
box：参考图里这个零件的包围框 [x0, y0, x1, y1]，按整张图宽高的比例（0–1，左上角为 0），框住整个零件、别切边。
erase：box 里要涂白的东西 [[x0, y0, x1, y1], …]（同样按整张图比例）：产品外面的引线、箭头、标注文字、手、线缆、别的配件。不涂掉会被生成进模型；没有就 []。
cover：零件表面上要用周围外壳颜色抹平的东西 [[x0, y0, x1, y1], …]（同样按整张图比例）：geometry 里参考图上看得见的按键区、屏幕、指示灯、接口、开关、压杆。框贴着它画，框外一圈要是外壳（不是背景）；一片按键可以一个框框住。不抹平就会被生成进模型，和几何体叠两层；没有就 []。
prompt：英文，60 词以内，每个零件都要写（图片生成失败时用）：类别 + 外形 + 颜色材质 + 主要特征，比例用文字描述（"height about twice the width"），写明摆放（"standing upright, front facing the viewer"）；不写型号、数字、品牌字样（会被印到贴图上）。
front / up：参考图里朝着镜头的那一面、图上朝上的那一面，各是零件局部坐标的哪根轴（"+z"、"-y" …）。脚本约定零件正面 +z、顶面 +y，直立拍的照片就是 "+z" / "+y"（绝大多数情况，拿不准就写这个）；只有零件在脚本里平躺、照片却是正对着它的大面拍的（平放的遥控器、扫地机俯拍）才不同，比如 front "+y"、up "-z"。
finishes：给没挂模型的几何体上材质（见 reference.md「真实材质」）；脚本里已有就不写。

只输出一个 JSON 对象：
{ "models": [ { "part": "零件 id", "source": "photo" | "page" | "text", "image": 1, "box": [0.1, 0.2, 0.6, 0.9], "erase": [], "cover": [], "prompt": "…", "front": "+z", "up": "+y", "baked": ["子零件 id"], "geometry": ["子零件 id"] } ],
  "finishes": { "white": "plastic-white", "shade": "plastic-grey", "dark": "plastic-black", "warm": "paper" },
  "notes": "中文一两句：选了哪些、参考图用的哪张" }
没有合适的零件就返回 { "models": [], "notes": "原因" }。`
}

export const ORIENT_TASK = `上面每个外观模型附了参考（图片或文字描述）和一张六向图：8 格分别是从 +Z、-Z、+X、-X、+Y、-Y 看过去和两张斜视，每格标题写着从哪根轴看。逐个判断：
- ok：模型是不是这个零件（大体形状对、没缺一大块、没多出别的物体）。明显不是就 false，issue 写原因。
- front：产品正面（参考图里朝向观众的一面，或有按键 / 屏幕 / 标志 / 出风口的一面）朝模型的哪根轴：正面出现在「从 +X 看」那一格就填 "+x"，以此类推。
- up：产品顶面朝模型的哪根轴，通常 "+y"。
只输出一个 JSON 对象：{ "models": [ { "name": "模型名", "ok": true, "front": "+x", "up": "+y", "issue": "" } ] }`

export function reviewTask(round: number) {
  return `第 ${round} 轮视觉复核。附图依次是：各指南的截图联系表（每格是一步的实际画面），以及说明书原页。
按 skill 的 verify.md 人工清单逐项对照：零件是否摆对、朝向 / 左右是否和说明书图一致、本步操作件是否高亮且在画面中、镜头是否太远太近或被遮挡、细节窗是否对准、标注是否遮挡、灯和屏幕是否表达了原文。
镜头：从正上方 / 正下方看（camera.dir 接近 [0, ±1, 0]）只能看到顶面，认不出产品，除非这一步就是看顶面；一般改成斜前上方，比如 [0.4, 0.5, 1]。
挂了外观模型（model）的零件：截图是「写实」显示，看正面是否朝对、是否躺倒 / 倒立、和周围零件贴不贴；朝向不对就在 parts 里给这个零件新的 model.rot（src 不变）。
只修真正看得出的问题；画面没问题就返回 {"notes": "无需修改"}。

# verify.md
${doc('verify.md')}

${PATCH_FORMAT}`
}

// ---------- 立体书 / 物理原理 / 机械结构 / 自由生成：同一套拼法，读各自的 skill ----------

/** 场景脚本的通用参考：去掉外观模型（Tripo）和命令行验证 */
const sceneReference = () => drop(drop(doc('reference.md'), '## 外观模型'), '## 验证')

function skillRules(route: Route, categories: string[]) {
  const r = ROUTES[route]
  const kind = r.category
    ? `- category 固定 "${r.category}"，genre 固定 "tutorial"。`
    : `- category：优先从网站已有的品类里选（${categories.join('、')}）；都不合适就写一个 2–4 字的中文名词（例如 烹饪、手工、化学实验、运动健康、急救、软件操作）。\n- genre：讲某个具体产品（有品牌型号）怎么用写 "manual"，其余写 "tutorial"。`
  return `
## 你在网站流水线里的位置
网站已经替你做了：收集页面（上传的图片 / PDF 逐页图，第 N 张 = 第 N 页）、分流（这份资料是「${r.label}」）、编译校验、场景审计、截图。
你负责按 ${r.skill} skill 写出一份 ManualSpec，必须是**纯 JSON**：
- 不能有函数、变量、常量、注释、表达式、展开运算；所有数值写成算好的字面量（一般 1 位小数，纸片层高、齿轮相位这类可以到 3 位）。skill 文档和样板里的 TypeScript 写法（const、helper 函数、Math.xxx）只是示意，要展开成 JSON 字面量。
- 顶层：id（小写字母、数字、连字符，例如 ${route === 'free' ? 'pour-over-coffee' : route === 'popup' ? 'popup-castle-card' : route === 'physics' ? 'physics-simple-pendulum' : 'mech-worm-gear'}）、name（≤ 16 字）、desc（≤ 30 字）、category、genre、dims（成品 / 装置的宽深高 mm）、package、params、parts、initial（可选）、guides、stageSize、finishes（可选）、notes。
${kind}
- package 当材料 / 器材 / 工具清单，params 当要点（关键数字、公式、条件、安全提醒）。
- 不要写 source（服务器填）。不要写零件的 model / baked（外观模型由网站的外观流程生成）。
- 零件 / 指南 / 步骤 id 用短横线小写英文；每一步都要有 camera（{ target, dir, dist }）和 page（这一步对应第几张上传图，从 1 开始）。
- 中文文案：name、desc、title、tip、callout、chips 用简体中文；数字照抄原文，推断的写明。
- 零件数 ≤ 60；坐标单位毫米，Y 向上，地面 y = 0，观众在 +Z；会转的零件原点放在转轴上。`
}

/** 立体书 / 物理原理 / 机械结构 / 自由生成：skill + 它的 reference + 场景脚本通用参考 + 类型 + 样板 */
function skillSystem(route: Route, exampleJson: string, categories: string[]) {
  const r = ROUTES[route]
  const dir = dirOf(route)
  const skill = ['## 转写要点', '### 6. 验证', '## 网站后台'].reduce(drop, doc('SKILL.md', dir))
  return [
    `你是「懂了 Dongle」网站内置的「${r.label}」→ 3D 交互演示生成器，严格按下面的 ${r.skill} skill 工作；场景脚本的通用写法（形体、状态、动作、镜头、编译语义）见后面的 manual-to-3d 参考。`,
    skillRules(route, categories),
    `\n# Skill：${r.skill}\n` + skill,
    `\n# ${r.skill} / reference.md\n` + doc('reference.md', dir),
    '\n# 场景脚本参考（manual-to-3d / reference.md）\n' + sceneReference(),
    '\n# craft.md（建模与镜头手艺）\n' + doc('craft.md'),
    '\n# types.ts（ManualSpec 的权威类型定义；JSON 必须符合它）\n```ts\n' + readFileSync(TYPES, 'utf8') + '\n```',
    `\n# 完整示例：库里的 ${r.examples.join('、')}（已展开成 JSON；照这个结构和细致程度写，数值换成这份资料的）\n\`\`\`json\n${exampleJson}\n\`\`\``,
  ].join('\n')
}

/** 写脚本、修复、复核共用的系统提示词（一个任务里不变） */
export function systemFor(route: Route, exampleJson: string, categories: string[]) {
  if (route === 'manual') return authorSystem(exampleJson)
  if (route === 'origami') return origamiSystem(exampleJson)
  return skillSystem(route, exampleJson, categories)
}

const FOCUS: Partial<Record<Route, string>> = {
  popup: '先列合上时的层高表；每片纸挂在它粘住的那一页上，绕斜折痕转的加铰链零件；开合关键帧按 reference.md 的配方和角度表算，书页和联动的纸片同 dur / delay',
  physics: '先定标准实验装置并按实物尺寸建；每个现象的数量按公式算准（计算写进 notes），会动的零件原点放在转轴上，同一装置的动作同 period / phase / delay',
  mechanism: '先画传动链、定主时钟，按传动比算每个 spin / swing / slide；齿轮按模数和中心距摆、相位错开半个齿距；壳体剖开只留 z ≤ 0，运动件完整',
  free: '先写讲解提纲（主题、受众、终点、3–6 个关键时刻），再按题材配方找实物载体搭舞台；每一步都要有看得见的变化，第 1 步总览、最后一步是成品 / 结论',
}

export function authorTask(route: Route) {
  if (route === 'manual') return AUTHOR_TASK
  if (route === 'origami') return ORIGAMI_AUTHOR_TASK
  return `按上面的逐页转写和页面图片，写出完整的 ManualSpec JSON（只输出这个 JSON 对象）。
先在心里按 ${ROUTES[route].skill} skill 的工作流清单逐项做完（命令行验证那一项跳过）：${FOCUS[route]}。
做完对照 skill 的「复核清单」自查一遍再输出。
在顶层 "notes" 字段（字符串）里写：坐标约定（原点、朝向、主要零件布局）、关键数字和计算过程、哪些是推断或简化。`
}

/** 截图复核：说明书、折纸用各自的 verify.md，其余用 skill 里的「复核清单」 */
export function reviewTaskFor(route: Route, round: number) {
  if (route === 'manual') return reviewTask(round)
  if (route === 'origami') return origamiReviewTask(round)
  const r = ROUTES[route]
  return `第 ${round} 轮视觉复核。附图依次是：各指南的截图联系表（每格是一步过渡结束后的画面；循环动作只截到其中一瞬间），以及上传的原页。
按 ${r.skill} skill 的复核清单逐项对照，再看通用问题：零件摆得对不对、本步要看的零件是否高亮且在画面中、镜头是否太远太近或被遮挡、标注是否遮挡、画面和标题说的是否一致。
镜头：从正上方 / 正下方看（camera.dir 接近 [0, ±1, 0]）只看得到顶面，除非这一步就是看顶面；一般改成斜前上方，比如 [0.4, 0.5, 1]。
只修真正看得出的问题；画面没问题就返回 {"notes": "无需修改"}。

# 复核清单（${r.skill}）
${section(doc('SKILL.md', dirOf(route)), '## 复核清单')}

${PATCH_FORMAT}`
}
