// 网页导入的第一步：分流。先让模型看一眼上传的资料属于哪条生成链路，再按链路选 skill：
// 每条链路对应 .cursor/skills/ 下的一份 skill（提示词在 manualSkill.ts 里按链路现读 skill 文档拼），
// 不属于任何一类的走 freeform-3d（自由生成）。改链路的判断标准只改这里的 ROUTES。

export type Route = 'manual' | 'origami' | 'popup' | 'physics' | 'mechanism' | 'free'
/** 分流结果：六条生成链路，外加两种不生成场景脚本的情况（型材家具走参数化、做不了） */
export type Verdict = Route | 'desk' | 'reject'

export interface RouteInfo {
  /** 前端显示的中文名 */
  label: string
  /** .cursor/skills/ 下的目录名 */
  skill: string
  /** 给分流模型看的判断标准 */
  when: string
  /** 教程类链路的固定品类（首页大类）；没有则由模型按内容定 */
  category?: string
  /** 保存成 genre: 'tutorial'（自由生成由模型定） */
  tutorial: boolean
  /** 用户勾了「真实外观」时，这条链路走不走 Tripo 外观模型 */
  appearance: boolean
  /** 写脚本时附上的库里样板（id），展开成 JSON */
  examples: string[]
}

export const ROUTES: Record<Route, RouteInfo> = {
  manual: {
    label: '产品说明书', skill: 'manual-to-3d', tutorial: false, appearance: true, examples: ['mouse-bt54'],
    when: '某个具体产品（电子产品、家电、工具、家具、玩具、车辆、婴儿用品……）的使用、安装、组装、维修、故障排查说明：官方说明书、快速入门、安装图、宜家 / 乐高式组装图都算。',
  },
  origami: {
    label: '折纸', skill: 'origami-3d', category: '折纸', tutorial: true, appearance: false, examples: ['origami-cup', 'origami-dog'],
    when: '一张纸只靠折（不剪不粘）做成作品的图解、教程截图或视频关键帧：纸飞机、纸鹤、纸杯、动物、爱心……',
  },
  popup: {
    label: '立体书', skill: 'popup-3d', category: '立体书', tutorial: true, appearance: false, examples: ['popup-parallel', 'popup-vfold'],
    when: '纸艺机关：打开书页 / 贺卡会弹起来或会动的结构（平行折、V 形折、拉片、转盘、翻盖、层叠），立体贺卡、立体书、剪纸立体卡的做法。',
  },
  physics: {
    label: '物理原理', skill: 'physics-3d', category: '物理原理', tutorial: true, appearance: false, examples: ['physics-newton-cradle', 'physics-lever'],
    when: '讲一条物理规律或一个物理实验：力学（杠杆、滑轮、摆、碰撞、浮力、斜面、弹簧）、电路、光学、磁、热、声、波；课本页、实验手册、讲义、科普图。',
  },
  mechanism: {
    label: '机械结构', skill: 'mechanism-3d', category: '机械结构', tutorial: true, appearance: false, examples: ['mech-gear-train', 'mech-four-stroke'],
    when: '讲一类机器内部怎么动、怎么传动：齿轮、齿条、连杆、凸轮、曲柄滑块、发动机、变速箱、行星轮、锁芯、钟表、液压……；结构原理图、剖面图、拆解图、机械课讲义。',
  },
  free: {
    label: '其他（自由生成）', skill: 'freeform-3d', tutorial: true, appearance: true, examples: ['physics-newton-cradle', 'mouse-bt54'],
    when: '上面都不是，但能用实物和动作讲清楚的任何内容：烹饪冲饮、手工木工、绳结、化学 / 生物实验、运动健身、急救、软件 / App 操作、天文地理、流程规则、科普……；以及拿不准属于哪一类的资料。',
  },
}

/** 拿不准时宁可走自由生成：专门链路的把握低于这个值就改走 free */
const MIN_CONFIDENCE = 0.4

export function classifySystem() {
  const routes = (Object.entries(ROUTES) as [Route, RouteInfo][]).map(([id, r]) => `- ${id}（${r.label} → ${r.skill}）：${r.when}`).join('\n')
  return `你是「懂了 Dongle」网站导入流程的第一步：分流。用户上传了一份资料（PDF 逐页图或照片，可能附 PDF 文字层和一句补充说明），网站要把它做成 3D 交互演示（3D 场景 + 分步动画）。
你只判断它该走哪条生成链路，不写内容。每条链路有自己的 skill，选对了生成效果才好。

# 链路
${routes}
- desk（参数化型材家具）：铝型材 / 光轴搭的、尺寸可调要算料的桌子、架子（网站另有参数化流程）。
- reject（做不了）：空白页、糊得完全看不清、没有任何可讲的内容，或违法违规内容。

# 边界
- 某个具体产品的说明书，即使里面讲到了齿轮、电路原理，也选 manual：用户要的是这个产品怎么用。
- 讲「一类机器怎么工作」而不是「某个型号怎么用」→ mechanism。
- 重点在规律和数值（力、能量、电流、光路）→ physics；重点在零件怎么带动零件 → mechanism。课本上的杠杆、滑轮算 physics，齿轮传动、曲柄滑块算 mechanism。
- 纸艺：只折不剪 → origami；要剪、要粘、打开会弹起来 → popup。
- 拿不准就选 free（自由生成也能做好），confidence 写低一点。不要轻易选 reject：只要有能讲的内容就选一条链路。
- 用户补充说明里明确说了类型（「这是折纸」「做成机械原理演示」），以用户为准。

# 输出（只输出一个 JSON 对象）
{ "route": "manual | origami | popup | physics | mechanism | free | desk | reject",
  "confidence": 0.0,
  "subject": "这份资料讲什么（中文一句话，≤ 30 字，例如「美的空调遥控器的使用说明」「四冲程发动机的工作循环」）",
  "reason": "为什么归这一类（中文一两句，说出看到的关键证据：标题、图示、步骤、符号）",
  "second": "第二可能的链路，没有写 null" }`
}

/** 分流请求的用户消息开头（mock-llm 靠它认请求） */
export const CLASSIFY_LEAD = '请判断这份资料该走哪条生成链路。'

const VERDICTS = new Set<string>([...Object.keys(ROUTES), 'desk', 'reject'])

export interface Classified {
  verdict: Verdict
  /** 实际走的链路（desk / reject 时没有） */
  route?: Route
  /** 模型给的链路（被改成 free 时和 route 不同） */
  guess: Verdict
  confidence: number
  subject: string
  reason: string
}

/** 整理模型的分流结果：不认识的链路、专门链路但把握太低，都改走自由生成 */
export function classified(raw: Record<string, unknown>): Classified {
  const guess = (VERDICTS.has(String(raw.route)) ? raw.route : 'free') as Verdict
  const n = Number(raw.confidence)
  const confidence = raw.confidence == null || !Number.isFinite(n) ? 0.5 : Math.max(0, Math.min(1, n > 1 ? n / 100 : n))
  const special = guess !== 'free' && guess !== 'manual' && guess !== 'desk' && guess !== 'reject'
  const verdict: Verdict = special && confidence < MIN_CONFIDENCE ? 'free' : guess
  return {
    verdict,
    route: verdict === 'desk' || verdict === 'reject' ? undefined : verdict,
    guess,
    confidence,
    subject: String(raw.subject ?? '').slice(0, 80),
    reason: String(raw.reason ?? '').slice(0, 300),
  }
}
