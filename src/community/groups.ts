/**
 * 首页品类那一行只放大类：说明书自己的品类（游戏机、路由器……）还留在卡片和名牌上，
 * 筛选按这里归到的大类。AI 导入、用户发笔记时填的品类不在表里，就按关键词归，归不进去的放「其他」。
 */
const GROUPS: [group: string, categories: string[], keywords: RegExp][] = [
  ['电子产品', ['电子产品', '游戏机', '智能摄像头', '路由器', '打印机', '电脑装机'], /电子|数码|电脑|手机|平板电脑|耳机|音箱|相机|摄像|监控|游戏|路由|网络|打印|键盘|鼠标|显示器|投影/],
  ['家用电器', ['扫地机器人', '清洁电器', '小厨电', '净水器', '空调', '卫浴'], /电器|家电|厨|咖啡|空调|冰箱|洗衣|烘干|净水|热水|吸尘|扫地|拖地|卫浴|马桶|风扇|暖风|加湿|除湿|电视/],
  ['家具', ['平板家具', 'DIY 家具'], /家具|柜|桌|椅|床|架|沙发/],
  ['出行', ['婴儿推车', '电动出行'], /出行|推车|童车|滑板|自行车|电动车|汽车/],
  ['安全', ['智能门锁', '安全应急'], /安全|门锁|消防|灭火|应急|报警|急救/],
  ['折纸', ['折纸'], /折纸|纸飞机|纸鹤|纸艺/],
  ['立体书', ['立体书'], /立体书|立体贺卡|立体卡片|pop-?up|剪纸/i],
  ['物理原理', ['物理原理'], /物理|力学|电路|杠杆|滑轮|摆|光学|磁/],
  ['机械结构', ['机械结构'], /机械|齿轮|发动机|引擎|连杆|凸轮|锁芯|传动/],
]

export const OTHER_GROUP = '其他'
export const GROUP_ORDER = [...GROUPS.map(([g]) => g), OTHER_GROUP]

const memo = new Map<string, string>()

export function groupOf(category: string) {
  let g = memo.get(category)
  if (g === undefined) {
    g = GROUPS.find(([, list]) => list.includes(category))?.[0]
      ?? GROUPS.find(([, , re]) => re.test(category))?.[0]
      ?? OTHER_GROUP
    memo.set(category, g)
  }
  return g
}
