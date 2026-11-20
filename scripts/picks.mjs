/**
 * 截图脚本（covers.mjs / plaza.mjs）共用：产品 → '<指南 id>[/<步骤序号，从 0 开始>[/<镜头距离倍数，默认 1.2>]]'，
 * 挑整机完整、镜头够远的一步。只写指南时：安装类取最后一步，其他取第一步。镜头距离只有封面用。
 */
export const PICK = {
  'manual:mouse-bt54': 'usb-a/1/1.5',
  'manual:nintendo-switch-oled': 'joycon/9',
  'manual:xiaomi-camera-c400': 'intro/4/1.35',
  'manual:ecovacs-t90s-pro': 'setup/4',
  'manual:roborock-p10': 'first-use/6',
  'manual:roborock-p20-pro': 'first-use/2',
  'manual:dyson-v12': 'use/0/1.0',
  'manual:nespresso-essenza-mini': 'coffee/3',
  'manual:xiaomi-water-purifier': 'replace/7',
  'manual:midea-ac-ks1': 'filter/1/1.1',
  'manual:zhimi-toilet-seat-s': 'use/2',
  'manual:tplink-xdr6088': 'connect/0/1.5',
  'manual:xiaomi-lock-mjznms02lm': 'install/9',
  'manual:epson-l3258': 'charge/5',
  'manual:pc-build-b650m': 'case/10',
  'manual:ikea-jonaxel': 'wall/6',
  'manual:ikea-kallax': 'vertical/9',
  'manual:ikea-malm': 'runners/5/1.7',
  'manual:goodbaby-pockit': 'unfold/6',
  'manual:xiaomi-scooter-3-lite': 'fold/6',
  'manual:mech-gear-train': 'train/4/2.2',
  'manual:origami-dart': 'fold/11/1.8',
  'manual:origami-cup': 'fold/7/1.7',
  'manual:origami-dog': 'draw/2/1.7',
  'manual:origami-heart': 'gift/2/1.6',
  'manual:physics-lever': 'balance/2/1.8',
  'manual:physics-pulley': 'fixed/0/1.6',
  'manual:popup-vfold': 'motion/2',
}

/** 广场模型图另挑的步骤（要整机摆在地上的样子），没写的用 PICK */
export const PLAZA_PICK = {
  'manual:xiaomi-water-purifier': 'install',
  'manual:origami-dart': 'fold',
}

/** 广场模型图另外藏掉的零件 id：墙、插座、工具这类道具按名字自动藏（three/Scene.tsx 的 SCENERY），这里只写剩下的 */
export const PLAZA_HIDE = {
  'manual:midea-ac-ks1': ['remote', 'cloth', 'cord', 'plug'],
  'manual:xiaomi-water-purifier': ['bag-ppc', 'bag-ro'],
  'manual:xiaomi-camera-c400': ['card', 'booklet', 'mount'],
}

export const slugOf = (id) => id.replace(/^manual:/, '')
