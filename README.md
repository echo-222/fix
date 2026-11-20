<img src="public/logo.svg" width="72" alt="懂了 Dongle" />

# 懂了 Dongle · 3D 说明书社区

一个分享「看得懂的说明书」的社区。名字取「懂了」和 dongle（插在电脑上的 USB 接收器）谐音；图标是一只亮起来的灯泡，灯丝就是一笔连写、正在发光的 dongle：看完演示的那一下就是「懂了」。打开后先是等待页，然后进入 **3D 说明书广场**：所有说明书的模型以 45° 等轴视角摆在一张画着灰色虚线格子的白底上，拖动浏览；搜索或选品类时，最匹配的一份挪到正中间，其他匹配的和相关的围在它周围，不相关的变淡退到外圈。顶部可以切换到**卡片视图**（瀑布流封面卡片）。点任意一个模型或卡片，就是可交互的 3D 安装 / 使用 / 排障演示，可以点赞、收藏、评论；右上角「我的」切到自己的收藏、点赞、发布和导入，同样能用广场或卡片看。用户可以写使用笔记（关联某份说明书、配图），也可以上传说明书 PDF 或照片，由 AI 按内置的 manual-to-3d 方法生成 3D 指导后发布。

内置内容：22 份**品牌说明书**的 3D 演示（鼠标、游戏机、摄像头、扫地机器人、吸尘器、咖啡机、净水器、空调、马桶盖、路由器、门锁、打印机、电脑装机、宜家家具、婴儿推车、滑板车、灭火器），以及**铝型材书桌**和三款**光轴家具**（落地置物架、边几、挂衣架），后者可自定义尺寸、材料和配件。

## 运行

```bash
npm install
npm run dev          # 打开终端显示的地址；手机连同一局域网可用 Network 地址访问
```

第一次打开是登录页：在 `.env.local` 里写 `ADMIN_EMAILS=你的邮箱`，用这个邮箱注册（不用邀请码）就是管理员。

```bash
npm run build && npm start          # 线上方式：一个 Node 进程同时出静态页面和接口（默认 127.0.0.1:3000）
npm run api:selftest                # 起一个临时服务，把注册、登录、收藏、后台、导入的说明书谁看得到、停用、改密码、验证码等 70 项走一遍
npm run import:selftest             # 假模型 + 临时服务，把「上传说明书 → 3D」整条流水线（含无头 Chrome 截图复核）跑一遍，约 2 分钟
npm run admin -- users              # 命令行管理：users / invites / invite 5 1 第一批 / admin 邮箱 [密码] [昵称] / passwd 邮箱 新密码
```

## 账号与管理后台

- **登录页**：等待页的灯泡亮起后原地变成登录页，有「登录 / 注册」。注册填**内测邀请码**、邮箱、昵称、密码；`ADMIN_EMAILS` 里的邮箱不用邀请码。邀请链接 `https://gulugulu.tripolabs.com/dongle/?invite=XXXX` 打开直接到注册并填好邀请码。忘了密码找管理员在后台「重置密码」（生成临时密码），登录后在头像菜单「修改密码」里换掉。
- **邮箱验证码（默认关）**：服务器设 `EMAIL_VERIFY=1` 后注册要邮箱验证码（6 位，10 分钟有效，60 秒能重发一次，错 5 次作废），登录页多一个「忘记密码」用验证码自己重设；发信用 `SMTP_*`，没配时验证码打印在服务端日志、显示在后台概览页。
- **登录态**：HttpOnly Cookie（`dongle_sid`，30 天，用着就续期），数据库里只存 token 的哈希；密码用 scrypt。登录、注册、改密码按 IP 和邮箱限频，跨站 POST 一律拒绝。
- **和用户绑定的数据**全部记在服务端（`server/sql.ts` 的 SQLite，`data/dongle.db`）：资料、收藏、点赞、评论、发布的笔记、登录设备、每次打开说明书（同一人同一篇 10 分钟内算一次）、在线心跳和正在看的页面。客户端发的操作里的用户 id 会被服务端换成当前登录的人。
- **管理后台** `#/admin`：管理员在首页右上角多一个黑色「后台」按钮（头像菜单里也有）。
  - 概览：注册、在线、24 小时活跃、打开、收藏、点赞、评论、发布、AI 生成（总数、今天、在跑几个）、剩余邀请名额等数字，14 天趋势，在线的人和他们正在看什么，热门说明书，**实时动态**（SSE 推送，谁打开 / 收藏 / 点赞 / 评论 / 发布了什么，新的一条闪一下）。开了邮箱验证但没配邮件时，这里显示还没用掉的验证码。
  - 用户：搜索、按在线 / 管理员 / 已停用筛选；点进去看他的收藏、点赞、发布、评论、登录设备、行为记录，能停用（填原因，登录时提示对方）/ 恢复、强制下线、重置密码（临时密码只显示一次）、设为管理员、清空内容、删单条评论或笔记。
  - 生成 `#/admin/imports`：所有用户用 AI 生成的全部任务（生成中的、完成的、失败 / 取消 / 服务器重启中断的、导入后被用户删掉的，以及有任务表之前留下中间产物的早期任务），按状态筛选、搜标题 / 文件名 / 用户 / 任务号；生成中的几秒刷新一次。点进去看：上传的原页和产品照片、分流结果（链路、skill、把握、理由）、输入选项和补充说明、生成结果（指南、步数、AI 推断的内容）、审计问题和提醒、外观模型、完整运行记录、中间产物文件（转写稿、每轮脚本、审计结果、模型原始回复，点开是原始 JSON / 文本）；能直接打开生成的 3D 演示（用户删掉的也能），生成中的可以替用户取消。
  - 热度 `#/admin/trends`：联网监控市场热度（电商·新闻、小红书、B 站三个来源）、自动把热门产品做成 3D 说明书发到广场（见下面「热榜」）。看这期各来源的风向、品牌榜（可导出 CSV）、上榜产品的热度走势和适合度、来源链接、生成状态；能立即扫描、检测联网、改设置，对每一款生成 / 上架 / 下架 / 取消 / 忽略。
  - 内容：所有用户发布的笔记和评论，可删除。
  - 邀请码：批量生成（个数、每个能用几次、有效期、备注），复制邀请链接，停用 / 恢复，看每个码被谁用了。
- **截图脚本**：`#/cover/…`、`#/sprite/…` 不用登录；`npm run shoot` 会设 `DONGLE_AUTH_BYPASS=1`，开发服务器把所有请求当成一个只读的脚本用户。

## 部署上线（https://gulugulu.tripolabs.com/dongle/）

服务器是阿里云北京的 Alibaba Cloud Linux（`ssh gulugulu`）。站点挂在 `/dongle/` 子路径下：前端用 `BASE_PATH=/dongle/` 打包（`deploy.sh` 会设；代码里的 `/api/…`、`/models/…` 这类根路径用的时候经过 `src/base.ts` 的 `withBase` 加上前缀），nginx 出 `dist/` 的静态文件，`/dongle/api/` 和 `/dongle/imported/`（网页导入的说明书）去掉前缀转给本机 3000 端口的 Node（systemd 服务 `dongle`），登录 cookie 只发给 `/dongle`。域名根目录 `/` 暂时跳到 `/dongle/`（`deploy/site.conf`）。数据在服务器的 `/var/lib/dongle/`。

```bash
bash deploy/setup-server.sh            # 只要做一次：装 Node 24、nginx，建用户和目录，写 nginx 和 systemd 配置
npm run deploy                         # 每次更新：本地 build → 上传 → 装依赖 → 重启服务 → 自检，起不来自动切回上个版本
bash deploy/https.sh ip                # 域名没备案时：给服务器 IP 上 Let's Encrypt 的 IP 证书（6 天有效，每天两次检查自动续）
REDIRECT=1 bash deploy/https.sh ip     # 确认 https://<IP> 能打开后：http 全部跳到 https
bash deploy/https.sh domain 邮箱        # 域名 A 记录指到服务器以后：申请 gulugulu.tripolabs.com 的证书（DOMAIN=… 可换），更新站点配置，http 和 IP 都跳到 https://gulugulu.tripolabs.com/dongle/
```

域名 `gulugulu.tripolabs.com` 的 A 记录指向 `101.200.155.150`（阿里云解析）。服务器在大陆，域名要有 ICP 备案，否则阿里云会拦截（打开显示备案提示页）。

服务器上的配置在 `/etc/dongle.env`（`ADMIN_EMAILS`、`EMAIL_VERIFY`、`SMTP_*`、`AI_*`、`TRIPO_*`，格式同 `.env.example`，只有 root 能读），改完 `systemctl restart dongle`。查日志：`ssh gulugulu journalctl -u dongle -f`。数据库每天 4 点备份到 `/var/backups/dongle/`（保留 14 天，图片增量拷贝，导入的说明书整份覆盖拷贝）。服务器上的命令行管理：`ssh gulugulu 'cd /srv/dongle/current && sudo -u dongle DATA_DIR=/var/lib/dongle node server/cli.ts users'`。

**线上的网页导入说明书**：流水线跑在 `dongle` 服务里（第一次用到时在进程里起一个不监听端口的 Vite 读场景脚本；截图复核另起 Vite + `/opt` 下的无头 Chrome，`setup-server.sh` 装好 Chrome、中文字体和减面用的 gltf-transform）。所以每个版本除了 `dist/` 还带着源码、`scripts/` 和完整依赖（含 devDependencies）。生成的说明书在 `/var/lib/dongle/imported/`，中间产物在 `/var/lib/dongle/import-work/<任务号>/`，缓存在 `/var/cache/dongle/`。没发布的只有导入的人和管理员看得到，导入的人自己发布以后大家都能看（`server/imports.ts`）。每人同时 1 个、全站同时 `MANUAL_MAX_JOBS`（缺省 2）个任务，普通用户每天最多 `MANUAL_DAILY_LIMIT`（缺省 10）份。服务器在北京，连不上 `api.openai.com`：`AI_BASE_URL` 填国内能连的 OpenAI 兼容中转，或者保留 OpenAI 地址、加 `NODE_USE_ENV_PROXY=1` 和 `HTTPS_PROXY=http://代理:端口`（Tripo 国内站直连）。在服务器的环境里把整条流水线跑一遍（假模型，不花钱）：

```bash
ssh gulugulu 'systemd-run --wait --pipe -p User=dongle -p WorkingDirectory=/srv/dongle/current -p PrivateTmp=yes -p ProtectSystem=strict \
  -p ReadWritePaths=/var/lib/dongle -p CacheDirectory=dongle -p Environment="HOME=/var/cache/dongle DONGLE_VITE_CACHE=/var/cache/dongle/vite \
  CHROME_PATH=/opt/chrome-headless-shell-linux64/chrome-headless-shell" node scripts/import-selftest.mjs'
```

## 社区

| 地址 | 页面 |
|---|---|
| `#/` | 说明书广场：拖动 / 滚轮平移，捏合或 Ctrl + 滚轮缩放，左下角回到中心、放大、缩小；正对画面中心的模型和鼠标停留的模型显示名牌。手机上点一个不在中心的模型，先把它滑到中心、抬起并亮出名牌，再点一次才打开；电脑上点哪个直接打开。顶部按大类筛选（电子产品、家用电器、家具、出行、安全，教程类的折纸、立体书、物理原理、机械结构，归不进去的是「其他」；细分品类到大类的对应在 `src/community/groups.ts`，新品类先按名单、再按关键词归类，网页导入的按 AI 识别的品类归）和搜索（标题、品类、品牌、标签、指南和步骤标题、正文、作者）。右下角黑色「+」点开后弹出「发布笔记」「上传说明书」两个选项（「发布笔记」直接进写笔记表单）。右上角「我的」和头像合成一个按钮组，点「我的」：品类那一行换成「‹ 我的」+ 收藏 / 点赞 / 发布 / 导入四个二级 tab，广场和卡片只显示这一类（「我的」里使用笔记也上广场，有配图用配图、没有就借关联说明书的模型图），搜索在这一类里搜；点「‹ 我的」、再点一次「我的」或按 Esc 回到全部。搜索框右边的「广场 / 卡片」切换视图（记在 localStorage，下次打开保持）：卡片视图是说明书和使用笔记混排的瀑布流，可按「推荐 / 最新」排序，搜索时最匹配的排在左上角并加奶黄描边。点开说明书再返回，广场停在原来的位置，卡片列表停在原来的滚动位置 |
| `#/note/<id>` | 笔记页：3D 说明书页面。底部控制条左边是点赞、收藏、笔记（评论），右边是步骤条；点「笔记」后笔记与评论从底部升起，盖住步骤说明和进度条，模型移到上方露出来的部分（往下拖、点把手、Esc 或 × 收起）；左上角「设置」切换线稿 / 写实（有写实外观（外观模型或材质）的说明书打开时默认写实，只有线稿的显示线稿；切换只对这次打开有效，不记在本机）、浅灰线（预览未安装的零件）、细节放大窗；右上角下拉切换指南、打开包装与参数。用户笔记进来先展开正文 |
| `#/sprite/<产品>[/<指南>/<步骤>][?hide=零件id,…]` | 广场模型图渲染页：正交等轴相机、透明背景、柔光材质（只给脚本用） |
| `#/cover/<产品>[/<指南>[/<步骤>[/<镜头倍数>]]]` | 封面渲染页（只给脚本用） |

笔记 id：内置说明书是 `m-<说明书 id>`（参数化家具是 `m-desk` / `m-shelf` / `m-table` / `m-rack`），用户发布的是 `p-…`。旧的 `?open=manual:<id>` 链接会自动跳到对应笔记。

- **发布**：首页「发布」→ 写使用笔记（选关联的说明书、标题、正文、最多 6 张图、标签），或上传说明书 → 生成 3D 后在完成页直接填写发布。自己导入但还没发布的说明书显示在「我的 → 导入」（只有自己和管理员看得到），标为「未发布」，打开后在笔记面板里可以补发。
- **互动**：点赞、收藏、评论、回复（两层）、给评论点赞；自己的笔记和评论可以删除。
- **身份**：要登录（见「账号与管理后台」），首页右上角头像里可以改昵称、退出登录。
- **数据**：接口是 `/api/community/*`（`server/community.ts`，开发服务器由 `server/api.ts` 挂上，线上由 `server/main.ts`），数据在 `data/dongle.db`，图片存 `data/community-media/`（已 gitignore）。旧版的 `data/community.json` 第一次启动时自动导入。
- **示例互动**：内置说明书的点赞 / 收藏数、几条示例评论和示例用户是生成出来的，只为让原型看起来像社区，不写进数据库。上线前把 `src/community/seed.ts` 里的 `DEMO_ACTIVITY` 改成 `false`。
- **广场排布**（`src/community/plaza.ts`）：格子按地面上到中心格的距离一圈圈往外排。没有搜索时从最热的一份开始，每格接上和上一格最相关的（同产品 > 同品类 > 同类家电 > 同品牌 > 共同标签）；搜索 / 选品类时最匹配的放中心，其余匹配的按匹配度和相关度围在周围，不匹配但相关的半透明，其余淡出。换排布时模型沿地面滑到新位置。格子宽度 `TW` 取模型图边长 `S` 的 2 倍（`Plaza.tsx`）：按 26 张模型图实测的最大宽高，`TW ≥ 1.8·S` 时任意两格的模型都碰不到，加新模型后若比现有的明显更高更宽，用 `node shots/plaza-check.mjs` 看「overlapping model pairs」是不是 0。
- **广场模型图**：每份说明书一张 `public/plaza/<id>.webp`（600×600 透明底，等轴视角），模型的包围框记在 `src/community/plaza.json`（点击区域、名牌位置用）。由脚本无头渲染：墙、插座、工具、水管这类道具按零件名自动藏掉，用哪一步、另外藏哪些零件在 `scripts/picks.mjs` 的 `PICK` / `PLAZA_PICK` / `PLAZA_HIDE` 里调。没有模型图的（网页导入的说明书）显示上传的照片或一个方块。

```bash
npm run plaza                                # 全部
npm run plaza -- dyson-v12 desk              # 只渲染这几份
```

- **封面**：`npm run covers [-- <id>…]` 渲染 `public/covers/<id>.webp`（480×600 竖版，透视镜头），用作卡片视图的封面；用户笔记有配图时用第一张图。改了说明书的零件或主题色后，`npm run plaza` 和 `npm run covers` 都要重跑。

### 配置 AI（可选）

```bash
cp .env.example .env.local   # 填写 AI_API_KEY
```

任何兼容 OpenAI Chat Completions、支持图片输入的模型都可以（OpenAI、通义千问 qwen-vl-max 等）。说明书 → 3D 流水线一次要输出几万字的 JSON，建议在 `AI_MANUAL_MODEL` 填最强的一档（如 gpt-5.5）。Key 只保存在本地开发服务器，不会发到浏览器。未配置时，导入只能用铝型材桌的示例解析演示。

### 配置 Tripo 3D（生成真实零件模型；网页导入也会用）

在 `.env.local` 填 `TRIPO_API_KEY`（国内站 Key 配 `https://openapi.tripo3d.com/v3`，国际站配 `https://openapi.tripo3d.ai/v3`），然后：

```bash
npm run tripo:check                    # 查余额验证 Key 和站点，不扣积分
npm run tripo -- pc-build-b650m --dry  # 只打印要发的请求；去掉 --dry 才真正生成（扣积分）
npm run model:info -- public/models/pc-build-b650m/gpu.glb   # 看模型尺寸，斜放时提示 align
```

`npm run dev` 后打开 `/scripts/model-views.html?src=/models/pc-build-b650m/gpu.glb` 可以从六个方向看模型（分割结果加 `&parts=1&explode=0.5`）；不开浏览器的话，`npm run model:views -- public/models/pc-build-b650m/gpu.glb` 截成一张六向图放到 `shots/model-views/`。

生成任务写在 `models/<说明书 id>/tripo.json`，成品放到 `public/models/<id>/`，在说明书脚本的零件上加 `model: { src, rot }` 就会替换该零件的外观；步骤、动画和审计仍按原来的几何体计算。说明书页左上角「设置 → 展示方式」在线稿和写实之间切换。详细流程见 `.cursor/skills/manual-to-3d/SKILL.md` 第 10 步。

要像真的产品，就用**真实产品图**生成（图生模型），不要用文字描述：电脑装机的显卡（微星 RTX 4060 VENTUS 2X）、电源（微星 MAG A650BN）、散热器（AMD Wraith Stealth）、内存（金士顿 FURY Beast DDR5），以及石头 P10 的机器人和基座（官网 Q Revo 产品图 + 苏宁旗舰店套装版正面图）都是照产品图生成的。参考图放 `models/<id>/refs/`（版权归品牌方，已 gitignore），型号和图片地址记在同目录的 `sources.json`。几条实测经验：

- 一张干净的 3/4 角度产品图最稳；多视图要求各张比例一致，否则会生成一个厚块。
- 图边上露出的线缆、配件会被当成产品的一部分：先在图上涂掉；生成后仍多出来的，用零件上的 `model.crop` 按比例裁掉（`npm run model:info -- <glb> --slice z` 看截面定裁切位置）。
- 减面用本地的 `optimize` 步骤（gltf-transform，约 4 万面 + 1024 WebP 贴图，1.5 MB 左右），别用 Tripo 的减面：它会把散热器风罩这种薄壳吃掉。
- **一物一画**：一个东西要么在模型里，要么是几何体，不能两样都有，否则「写实」下两层互相遮挡（美的遥控器的几何按键盖住过模型自带的按键）。步骤里要按、要高亮的按键、旋钮、屏幕、指示灯，以及成排重复的规整小东西，都做成几何体，生成前用 `node scripts/ref-cover.mjs <原图.jpg> <输出.jpg> x0,y0,x1,y1 …` 把它们在参考图里按四周外壳的颜色抹平。抹平后只剩一块光板的（遥控器、开关面板），整件用几何体，不生成（Tripo 认不出光板会乱补）。
- 整机照片生成的模型里已经带着的大件（上盖、面板、盖板、尘盒）：这些子零件写 `baked: true`。它们在原位时不再单独画；打开 / 取出它们的那几步，整机换成带材质的几何体（模型里的盖子是合着的，不能用）。原位时要按或高亮的件不能 baked（看不到），`check:manuals` 会报。

**不用生成模型的真实外观**：板式家具、五金、工具本身就是规整形状，在说明书上写 `finishes`（按 fill 给材质）、个别零件写 `finish`，几何体就会在「写实」展示下换成白色饰面板、纤维板、镀锌五金、木榫等材质。IKEA MALM 就是这样做的。

## 功能

- **安装指南**：按配置自动生成 9–12 步，每步新零件以加粗黑线 + 奶黄填色飞入、内六角扳手动画、右上角的细节圆窗演示接头（T 型螺母滑入、弹片螺母旋转、角码、脚杯、连接板等）。
- **修复指南**：桌子晃动、桌面下沉、更换脚杯 / 脚轮，必要时用灰色虚线显示建议加装的零件。
- **自定义设计**：尺寸、桌腿 / 横梁型材、连接方式、下横撑、中间梁、脚、线槽、后挂架、桌面材质，实时给出下挠、晃动、重量、参考价和结构警告。
- **零件清单**：型材切割清单（按长度合并，可直接发给商家）、五金、工具，支持复制和导出 JSON。
- **导入说明书 → 3D**：上传 PDF（可选页码）或照片，一次最多 40 页，生成后可以直接发布到社区，不发布的存在「我的 → 导入」，只有自己看得到。见下一节。
- **铝型材桌参数化导入**：识别成铝型材桌时（或在导入弹窗里点「按参数化方式解析」），AI 抽取尺寸等参数，标注每个参数来自说明书还是默认值，之后可以改尺寸。

### 导入说明书 → 3D 交互说明书

首页「上传说明书 PDF / 照片」（或「发布 → 上传说明书」）。除了产品说明书，折纸图解、立体书做法、物理实验、机械原理，以及菜谱、手工这类其他教程也能传。开发服务器和线上服务器上的流水线（`server/manualPipeline.ts`）是各个 skill 的自动版：先分流，再按链路在请求时直接读对应 `.cursor/skills/<skill>/` 的文档拼提示词（`server/manualSkill.ts`），改 skill 即改流水线：

0. **分流**（`server/skillRouter.ts`）：先用低清页图 + 文字层开头问一次模型「这份资料走哪条链路」，回链路、把握、一句话主题和理由（弹窗里显示）：

   | 链路 | skill | 品类 / genre | 真实外观 |
   | --- | --- | --- | --- |
   | 产品说明书 | `manual-to-3d` | 模型定 / manual | 走 Tripo |
   | 折纸 | `origami-3d` | 折纸 / tutorial | 不走 |
   | 立体书 | `popup-3d` | 立体书 / tutorial | 不走 |
   | 物理原理 | `physics-3d` | 物理原理 / tutorial | 不走 |
   | 机械结构 | `mechanism-3d` | 机械结构 / tutorial | 不走 |
   | 其他（自由生成） | `freeform-3d` | 模型定（优先已有品类） / 具体产品 manual、其余 tutorial | 走 Tripo |

   另有两种不生成场景脚本的：铝型材桌转参数化流程，空白页 / 看不清 / 没内容的拒绝。专门链路把握低于 0.4 时改走自由生成（宁可通用，不套错 skill）。判断标准只在 `skillRouter.ts` 的 `ROUTES` 里改。
1. **转写**：逐页读图（PDF 另带文字层）。提示词是这条链路 skill 的摘要 +「转写要点」一节（各 skill 的 `## 转写要点` 规定额外字段：折纸的纸张、立体书的机关、物理的公式和量、机械的传动链、自由生成的讲解提纲）。快速指南这种海报式大幅面页，浏览器会切成「整页缩略 + 高清局部」再上传。
2. **写脚本**：按 skill 建模、写指南和每一步，输出 `ManualSpec` JSON。说明书和折纸用原来的专用提示词；立体书、物理、机械、自由生成共用一套拼法：网站规则（纯 JSON、字段、品类、文案）+ 这份 skill 的 SKILL.md 和 reference.md + manual-to-3d 的场景脚本参考、craft.md、`types.ts` + 库里 1–2 份同类样板。折纸写一份折纸程序（`origami` 纸的 `ops`），镜头只写方向，服务器按每一步纸折成的形状补上取景距离。
3. **审计 + 自动修复**：结构检查 → 编译 → 场景审计（穿地、穿插、插接、镜头、细节窗……），把问题原样交给模型改，最多 4 轮。
4. **保存**：`IMPORT_DIR/<id>/spec.json`（本地是 `public/imported/`，线上是 `/var/lib/dongle/imported/`；+ 勾选时保存原页图），登记在同目录的 `index.json`（记着是谁导入的），重新加载后出现在「我的 → 导入」里。前端经 `/imported/…` 取，服务端按账号过滤（`server/imports.ts`）。只上传一份 PDF 时，步骤上的「说明书 第 N 页」就是原文件的页码。
5. **真实外观**（配了 `TRIPO_API_KEY` 时默认开，`server/appearance.ts`）：skill 第 10 步的自动版。模型选出主体和大件（最多 `TRIPO_MAX_PARTS` 个，缺省 4），给每件定参考图：弹窗里另传的「产品照片」最好，其次是说明书页里这件的产品图（模型给出框、要涂白的引线和箭头、要按外壳颜色抹平的按键和屏幕（这些保持几何体，免得和模型叠两层），服务器裁成白底方图；背景是纯色时会把框收紧到产品像素、照片的框偏紧时自动放宽到框全），都没有就用英文描述走文字生成。然后用同一份 `scripts/tripo.mjs` 生成 + 本地减面，成品在 `public/imported/<id>/models/`；再截六向图让模型认正面和顶面、换算 `rot`（模型说的朝向和参考图高宽比明显对不上时按默认），按和代理形状的比例选 `fit`，挂上后重新审计（多出问题就不挂）。模型偶尔回的不是 JSON 会自动重问一次，原始回复存在 `manuals-src/imports/<job>/raw-*.txt`。每件约 20–40 积分、3–5 分钟（几件并行）。挂了模型的说明书打开时默认就是「写实」显示。
6. **截图复核**（可选）：无头浏览器逐步截图（挂了外观模型时用「写实」显示），把联系表和原页一起给模型对照，再修一轮；改坏了就退回复核前的版本。说明书、折纸按各自的 verify.md 看，其余链路按 skill 里的 `## 复核清单`。

弹窗可以关掉（「后台运行」），任务在服务器上继续跑：「我的 → 导入」最上面一排是生成任务卡片（原页缩略、当前阶段、第几步、已用时间），点一下回到这个任务的进度弹窗；生成好了还没载入成草稿的、没成功还没看过原因的也在这里，看过就不再列。有任务在跑时右上角「我的」和「导入」tab 上有个跳动的小点，这时点「我的」直接进「导入」。可以随时取消。

任务存进 SQLite 的 `import_jobs` 表（`server/importJobs.ts`）：跑的时候每 2 秒写一次进度（兼作心跳），结束时写结果，所以服务器重启、开发时 Vite 重载都不丢记录；心跳停了 90 秒（服务器重启 / 崩溃）的标成「中断」，中断前已经保存过的照样能打开。取消请求也记在库里，由跑任务的那个进程接着处理。每个任务的上传原页（`pages/`）、产品照片（`photos/`）和中间产物（转写稿、每轮脚本、审计结果、截图）在 `manuals-src/imports/<任务号>/`（线上 `/var/lib/dongle/import-work/`），排查效果时看这里，也都能在管理后台「生成」里看。用户删掉导入的说明书只是标记删除（`index.json` 里记 `deleted` / `deletedBy`），从他的「我的 → 导入」里拿掉，文件不动，管理员照样能打开；管理员自己「我的 → 导入」里只有自己的导入。导入的说明书同样能用 `npm run check:manuals -- <id>`、`npm run shoot -- <id>` 检查；`public/imported/` 已 gitignore，要正式收录某一份时，把它整理成 `library/` 里的 `.ts`。

没有模型额度时，可以用假模型把整条流水线跑一遍（默认回放库里的小米路由器，并故意埋两个错来验证修复循环；按 id 前缀分流，每个请求检查提示词里拼进了这条链路的 skill）：

```bash
node scripts/mock-llm.mjs
AI_BASE_URL=http://127.0.0.1:5190/v1 AI_API_KEY=mock AI_MANUAL_MODEL=mock-skill npx vite --port 5181
SELFTEST_MANUAL=origami-cup npm run import:selftest            # 折纸：回放纸杯，镜头只留方向、埋一个错的步号
SELFTEST_MANUAL=popup-vfold npm run import:selftest            # 立体书（physics-newton-cradle / mech-gear-train 同理）
MOCK_ROUTE=free npm run import:selftest                        # 自由生成
SELFTEST_MANUAL=popup-parallel MOCK_CONFIDENCE=0.2 npm run import:selftest   # 把握太低，改走自由生成
```

### 热榜：监控市场热度，自动做成 3D 说明书上广场

后台「热度」（`server/trends.ts`）定时联网搜索市场上正火、适合做交互演示的产品，库里没有的自动找品牌官方说明书生成，复核通过就以系统账号「懂了热榜」发到广场，首页按热度排序：

1. **扫描**：用现有的 AI 服务带联网搜索问一次（`server/webSearch.ts`，不用另配 Key）：依次试 Responses API 的 `web_search`（老版本 `web_search_preview`）、Chat Completions 的 `web_search_options`、通义的 `enable_search`，试通的方式记在库里。都不支持时扫描失败并写明原因，后台「检测联网」也能先试一下；这时在 `.env.local` 设 `AI_SEARCH_MODEL`（需要时再设 `AI_SEARCH_BASE_URL` / `AI_SEARCH_API_KEY`）换一个能联网的模型或服务。网络断开（握手被重置、流读到一半断了、流里回 error 事件、3 分钟一个字节都没来）会等 3 / 9 / 27 秒重试，生成流水线的模型调用也一样；某个来源整个没扫成的（配置问题除外），歇半分钟再单独扫一遍。

   每次扫描分三个信号来源并行搜，后台设置里可以只开一部分：
   - **电商·新闻**：电商热卖榜和大促战报、众筹、新品首销、指数和热搜、科技消费媒体。
   - **小红书**：没有开放接口（要登录和签名），靠联网搜索看蒲公英合作笔记 / 种草笔记、千瓜 · 新红 · 灰豚这类第三方榜单和媒体报道。
   - **B 站**：服务器先直接调 B 站公开接口（`server/trendBili.ts`，不用登录）拿科技数码区和汽车区排行、全站热门里相关分区的视频、热搜词，把这份「B 站实况」连同恰饭 / 商单、火烧云 · 飞瓜榜单的搜索要求一起交给模型；接口被风控时领一个访客 buvid 重试一次，还不行就只靠联网搜索。

   三份结果按品牌 + 型号、别名归一合并：同一款在几个来源都热，取最高热度再每多一个来源加 5 分，信号标出来源。这次没扫到的来源（没扫成或关掉了）沿用上次在那个来源的热度，3 天内有效，免得一个来源断网就把排名拉低。模型按这些最近 14 天的信号，挑出一批具体到型号的产品，每款给热度（0–100）、适合做 3D 演示的程度（0–100）、理由、带链接的信号、品牌官网域名、搜到的官方说明书地址，并对照广场上已有的说明书标出「库里已有」。同一款多次上榜会合并（品牌 + 型号、别名归一），记下每次的热度做走势；很久没再上榜的热度慢慢衰减。
2. **排队**：打开「自动监控」后，热度和适合度都到线、库里没有的新品按热度 × 适合度排进生成队列，每天最多 `每日额度` 份（默认 5，开始生成才算；找说明书的尝试最多额度的 3 倍）。管理员手动点「生成」的不占额度。一次只做一份，全站生成任务还受 `MANUAL_MAX_JOBS` 限制。
3. **找官方说明书**（`server/trendSource.ts`）：先试扫描时给的地址，不行再专门搜一次。第一跳必须是品牌官方域名，说明书聚合站、文库、网盘、电商、社交平台一律不要；每一跳都不访问内网地址，限 80 MB。产品介绍 / 购买页（标题带价格、购买又没提说明书）、截出来是官网拦截 / 验证页（无头浏览器和海外 IP 常被拦）或几乎没字的网页，都换下一个地址。PDF 在服务器上用 pdfjs + `@napi-rs/canvas` 渲染（多语言合订本挑中文最多的连续 20 页，带文字层），网页版说明书用无头 Chrome 分段截图（`scripts/page-shots.mjs`），图片直接用。原文件留在 `IMPORT_WORK_DIR/trend-*/`。
4. **生成**：走和网页导入同一条流水线（分流、转写、写脚本、审计修复、外观、截图复核），任务记在「懂了热榜」名下（后台「生成」里看得到全过程），说明书来源记成官网地址，不保存原页图。
5. **上架**：至少 4 步、审计零问题、截图复核做了且没有退回，才自动发到广场（标签带「热门」）；没过的停在「待确认」，写明原因，管理员看过 3D 后手动上架或重新生成。关掉「复核通过自动上架」则全部等确认。
6. **广场排序**：`GET /api/trends` 给出广场上看得到的热门说明书（库里已有的 + 热榜发布的）和热度排名。首页推荐分加上热度 × 0.5，品类最前面多一个「热门」（只看热榜上的，最热的在广场中心），卡片和名牌上标「热门 No.N」。
7. **品牌榜**：每次扫描每个来源顺带列出最火的品牌（默认 15 个，设置里 5–30），子品牌并进母品牌（米家 / Redmi → 小米），姐妹品牌分开；跨来源合并、加分、衰减和产品一样，记走势。上期前 10 名作为线索带进下一次扫描（只是线索，要重新搜到才算）。后台「品牌榜」能展开看为什么火、眼下爆款、我们榜上挂在它名下的产品，点「看产品」筛出上榜产品，能忽略 / 恢复，「导出 CSV」下载 `懂了品牌榜-日期.csv`（Excel 直接打开）。

调度在开发服务器和线上服务器里各起一个 20 秒的定时器，同一个库只有拿着租约（`kv` 表）的进程干活：本地同时开着几个开发服务器时，自动扫描和生成只在其中一个里跑，手动扫描和检测在你点的那个里跑。扫描、找说明书中途服务重启的，25 分钟后标成中断；被重启打断的找说明书 / 生成自动重新排队一次（不再占额度），再被打断才算失败。自动监控默认关，本地开发时手动扫描试效果就行，线上在后台打开。数据在 `trend_items`、`trend_brands`、`trend_scans`、`kv` 四张表。

不花钱地端到端测一遍（假模型带假的联网搜索、假的 B 站接口和假的「品牌官网」，临时数据目录；小红书那次故意断一次网测重试）：`npm run trend:selftest`。

### 光轴家具

三款各用一种典型连接方式，光轴直径 Ø10–20、镀铬 / 304 不锈钢可选：

| 家具 | 连接方式 | 可自定义 |
|---|---|---|
| 光轴落地置物架 | 光轴穿板，限位环托住层板，底层 / 顶层上下夹紧 | 尺寸、层数、板材、调节脚 / 脚套、背部加强横杆、单层载重 |
| 光轴边几 | SHF 法兰支座木螺丝固定在桌面下，倒置组装后翻正 | 尺寸、法兰内缩、下层板及高度、底脚 |
| 光轴挂衣架 | T 型夹（盲孔插立柱）+ 十字夹（两通孔） | 立柱间距、高度、挂衣杆外伸、鞋架横杆、加强横杆、挂衣重量 |

结构评估（层板 / 挂衣杆下弯、限位环 / 夹具防滑承载、长细比）为经验估算，承载值假设光轴已擦净防锈油、顶丝拧紧。

### 电子产品说明书（场景脚本）

非参数化的说明书（电子产品、小家电、工具）用一份**场景脚本**描述：零件由基本形体拼成，每一步只写状态变化（移动 / 换父级 / 开关档位 / 指示灯 / 屏幕界面 / 线缆），编译器校验后生成通用的指南步骤。

第一份是**蓝牙无线鼠标**（品类「电子产品」），5 页说明书 → 5 个指南 33 步：

| 指南 | 步数 | 原说明书 |
|---|---|---|
| 2.4G 连接 · USB-A 接收器 | 9 | 第 1–3 页（含清点包装、顶部按键、底部结构） |
| 2.4G 连接 · Type-C 接收器 | 6 | 第 4 页 |
| 蓝牙连接 | 6 | 第 4 页（电脑上的蓝牙设置界面逐屏演示） |
| 充电 | 4 | 第 5 页（红灯 / 绿灯、充电线实时弯曲） |
| 连不上？逐项排查 | 8 | 第 4–5 页 |

每步标注原文页码，「包装与参数」面板里可查看包装清单、基本参数和原说明书照片。

### 品牌说明书

原文均为品牌官网公开下载的说明书，**没有品牌授权，所以不放原图**：「包装与参数 → 说明书原文」只给官方链接，每步的「说明书 第 N 页」对应官方原文的页码。

| 品类 | 产品 | 指南 / 步数 | 原文 |
|---|---|---|---|
| 扫地机器人 | 科沃斯 地宝 T90S PRO 上下水 | 5 / 40 | 说明书 32 页 |
| 扫地机器人 | 石头 P10 智能上下水套装版 | 4 / 40 | 说明书 19 页 |
| 扫地机器人 | 石头 P20 Pro 智能上下水版 | 4 / 39 | 说明书 20 页 |
| 路由器 | TP-LINK TL-XDR6088 易展Turbo版 | 5 / 39 | 快速安装指南 2 页 |
| 路由器 | Xiaomi 路由器 AX3000T | 5 / 37 | 12 折页说明书 |
| 智能门锁 | 小米智能门锁（标准锁体版） | 5 / 40 | 说明书 8 页 + 安装须知 |
| 打印机 | 爱普生 L3258 墨仓式 | 5 / 40 | 《首先阅读》+《用户指南》 |
| 电脑装机 | 电脑装机操作清单（微星 MAG B650M MORTAR WIFI） | 5 / 45 | 主板说明书简体中文部分 |
| 平板家具 | IKEA JONAXEL 尤纳赛尔 衣柜组合 | 4 / 27 | 框架 + 挂衣杆两份说明书 |
| 平板家具 | IKEA MALM 马尔姆 三斗抽屉柜 | 5 / 38 | 柜体 + 抽屉两份说明书 |
| 婴儿推车 | 好孩子 POCKIT 口袋车 | 5 / 31 | 无文字图解 18 页 |

第二批（日常用得最多、最常需要看操作演示的产品）：

| 品类 | 产品 | 指南 / 步数 | 原文 |
|---|---|---|---|
| 游戏机 | Nintendo Switch（OLED 版） | 5 / 39 | 腾讯 Switch 官网技术支持 + 任天堂 Important Information |
| 智能摄像头 | 小米智能摄像机2 云台版（C400） | 5 / 34 | 使用说明书 |
| 清洁电器 | 戴森 V12 Detect Slim | 5 / 40 | 操作手册 |
| 小厨电 | Nespresso Essenza Mini 胶囊咖啡机 | 5 / 37 | Original 系列使用说明书 |
| 净水器 | 米家净水器 1000G（MR1082） | 4 / 40 | 使用说明书 12 页 |
| 空调 | 美的 酷省电 KFR-35GW/N8KS1-1 壁挂式 | 5 / 40 | 使用安装说明书 |
| 卫浴 | 智米智能马桶盖 S（ZNMTG02ZM） | 4 / 40 | 使用说明书 |
| 平板家具 | IKEA KALLAX 卡莱克 格架单元 77×147 | 4 / 30 | 组装说明 AA-2703471 |
| 电动出行 | 米家电动滑板车3 青春版 | 5 / 40 | 使用说明书 |
| 安全应急 | 手提式干粉灭火器 MF/ABC4（4 kg） | 4 / 30 | 厂家《使用维修手册》 |

除 KALLAX（用 `finishes` 材质）外，第二批都用产品图生成了 Tripo 外观模型，「写实」展示下显示。

尺寸来自说明书和官网参数；说明书没写的（外壳细节、零件厚度等）按产品照片估算，只求结构关系正确。

### 教程（折纸、立体书、物理原理、机械结构）

没有官方说明书的东西写成 `genre: 'tutorial'`：面板是「材料与要点 · 参考资料」，步骤文字自己写，`source.url` 指向参考教程，参考图不进仓库。

| 大类 | 条目 | 指南 / 步数 | 参考 |
|---|---|---|---|
| 折纸 | 经典飞镖纸飞机 | 2 / 17 | Fold 'N Fly · Basic Dart |
| 折纸 | 折纸杯 | 2 / 10 | Origami Diagrams · Paper Cup |
| 折纸 | 小狗脸 | 2 / 13 | Origami Diagrams · Dog Face |
| 折纸 | 折纸爱心 | 2 / 15 | PlayOwl · Easy Origami Heart |
| 立体书 | 平行折：弹出小盒子 | 2 / 18 | Robert Sabuda · Single Sheet Layer |
| 立体书 | V 形折：弹起的山峰 | 2 / 16 | Superplexus · V-Folds |
| 立体书 | 拉片与转盘：会变的卡片 | 2 / 17 | Stamptastic Designs · Pull Tab Window Cards |
| 物理原理 | 杠杆：F₁L₁ = F₂L₂ 与三类杠杆 | 2 / 9 | OpenStax · College Physics 2e 9.5 |
| 物理原理 | 滑轮与滑轮组：F = G / n | 3 / 11 | UW–Madison · Wonders of Physics |
| 物理原理 | 牛顿摆：动量和动能一起守恒 | 2 / 9 | Virginia Tech · Newton's Cradle |
| 物理原理 | 串联与并联电路 | 2 / 12 | The Physics Classroom |
| 机械结构 | 齿轮传动：减速、换向与齿条 | 2 / 7 | KHK · Gear Trains |
| 机械结构 | 四冲程发动机：吸、压、爆、排 | 2 / 8 | Wikipedia · Four-stroke engine |
| 机械结构 | 行星齿轮：一套齿轮三种速比 | 2 / 8 | KHK · Gear Technical Reference |
| 机械结构 | 弹子锁：锁芯怎么开 | 2 / 7 | Wikipedia · Pin tumbler lock |

折纸由折纸引擎模拟（`src/domain/manual/origami.ts`，写法见 `.cursor/skills/origami-3d/`）：一张纸按折纸程序一步步折，画成连续的纸——折边是弯过去的、两面不同色、有厚度和明暗、地上有柔和的投影，每份最后一步都是立起来的立体成品（封面和广场图取这一步）。`node scripts/origami-probe.mjs <id>` 打印每一步动了几块面、包围盒和成品的左右镜像误差。

### 新增说明书

按 `.cursor/skills/manual-to-3d/SKILL.md` 写 `src/domain/manual/library/<id>.ts`，导出一个 `ManualSpec` 即自动注册，广场顶部按 `category` 所属的大类筛选（`src/community/groups.ts`；新品类不在名单里又没命中关键词时会落到「其他」，记得补进名单）。同目录的公共函数文件不要导出 `ManualSpec`。

原文放哪里：

- 自有或已授权：页面图片放 `public/manuals/<id>/`，写进 `source.images`，面板里直接显示。
- 官网下载、未授权：PDF 和逐页图放 `manuals-src/<id>/`（已 gitignore，只在本地做建模参考），`source.images` 留空，`source.url` 填官方下载地址。

```bash
python3 scripts/pdf-pages.py manual.pdf manuals-src/<id> --dpi 110   # PDF → pNN.jpg + text.md（需 PyMuPDF）
npm run check:manuals    # 脚本校验 + 场景审计，须 audit passed
npm run shoot -- <id>    # 逐步截图 + 每个指南一张联系表 → shots/<id>/，逐张看完再交付
npm run plaza -- <id>    # 生成广场模型图 public/plaza/<id>.webp + plaza.json，到首页看一眼有没有道具没藏掉
```

快捷键：← → 切换步骤，空格播放 / 暂停。

## 结构

```
index.html         等待页（白色圆盘 + 灯丝写出 dongle、灯泡亮起来的动画，在 JS 加载前就显示）
server/            Vite 中间件：/api/analyze（铝型材桌参数）、/api/manual/*（说明书 → 3D 流水线：llm / skillRouter / manualSkill / manualPipeline，任务记录 importJobs）、/api/community/*（communityPlugin）、/api/admin/*（admin）、热榜（trends：调度 / 扫描 / 品牌榜 / 生成 / 上架，webSearch：联网搜索，trendBili：B 站公开接口，trendSource：官方说明书下载和转页）
src/community/     社区数据：db（类型 + 服务端和前端共用的操作校验）、seed（内置说明书 → 笔记、示例互动）、store；plaza（广场排布：相关度、搜索打分、螺旋格子）+ plaza.json（模型图包围框）；trends（广场的热度）
src/router.ts      hash 路由：首页 / 笔记 / 模型图 / 封面
src/domain/        纯逻辑：型材数据、桌子生成器（零件 / 清单 / 结构评估）、步骤生成
src/domain/shaft/  光轴家具：规格表（光轴 / 限位环 / SHF / 夹具 / 板材）、三款生成器与安装 / 修复步骤
src/domain/manual/ 场景脚本：types / compile / pose / audit / library/<id>.ts
src/three/manual/  渲染：形体、姿态插值、灯 / 屏幕 / 线缆
public/logo.svg    品牌图标（透明底）；favicon.svg 是白底圆角版；它们和 apple-touch-icon.png 都由 npm run icons 生成
public/manuals/    自有 / 已授权的说明书原图
public/models/     外观模型 GLB（Tripo 生成 + 本地减面）
public/plaza/      广场模型图（npm run plaza 生成）
public/covers/     竖版封面（npm run covers 生成，卡片视图用）
public/imported/   网页导入生成的说明书（gitignore）
data/              社区数据 community.json + 用户上传的图片（gitignore）
models/            Tripo 生成任务、日志、参考图来源（refs/sources.json）
manuals-src/       官网下载的说明书 PDF 与逐页图、导入任务的中间产物（gitignore，仅本地参考）
scripts/           check-manuals、audit-selftest、shoot-manuals、plaza、covers（共用 picks）、icons（图形在 brand-icon）、pdf-pages.py、tripo、ref-cover（参考图抹平按键）、model-info、model-views、mock-llm、page-shots（网页版说明书截图）、import-selftest / trend-selftest
.cursor/skills/    manual-to-3d（SKILL + craft / verify / walkthrough / reference）、origami-3d、popup-3d、physics-3d、mechanism-3d、freeform-3d（网页导入按分流结果选用）
src/ai/            图片压缩、解析接口、示例数据、PDF 转图与导入任务（manualImport）
src/three/         线稿、主场景、细节圆窗
src/ui/            说明书页（ManualView）：顶栏（设置弹层 + 指南下拉）、步骤、控制条、设计面板、清单、导入
src/ui/admin/      管理后台（概览、用户、生成、热度、内容、邀请码）
src/ui/community/  首页（HomePage：顶栏、品类 /「我的」二级 tab、视图切换、发布入口；ImportJobs：「导入」里的生成任务卡片）+ 广场（Plaza：虚线格子、平移缩放、模型格子）+ 卡片视图（CardFeed：瀑布流）、笔记页、笔记 + 评论面板、发布、模型图 / 封面渲染页
src/styles.css     全站样式（白底 + 黑灰奶黄，见下）
docs/              铝型材家具调研
```

### 界面风格：纯白 + 黑灰奶黄

主题色是纯白（`--bg: #fff`），辅助色只有三种：黑（`--ink` / `--accent`，主按钮、文字、名牌）、灰（`--muted` / `--faint` / `--bg-lo`，次要文字、输入框和轨道的浅灰底）、奶黄（`--cream*`，选中的按钮和标签、进度条、搜索命中、焦点圈）。控件靠很淡的中性阴影浮起（`--raise-*`），输入框、开关轨道是浅灰底加内阴影（`--inset-*`），界面元素不画边框，描边只留给 3D 线稿本身。颜色和阴影都是 `src/styles.css` 顶部的 CSS 变量。

广场的地面就是白底加灰色虚线的等轴格子（`Plaza.tsx` 的 `floor()` 生成 SVG 平铺，缩放时线宽保持 1px 左右），没有台子；搜索时最匹配的那格铺奶黄，其他匹配的铺浅奶黄。模型用柔光材质（中性灰的写实着色 + 淡线）。3D 说明书页的舞台地面和广场一样：白底、`#cdcdcd` 灰色虚线方格（每格边上 17 段，一格约为场景范围的 1/5），加零件落在地上的软投影（贴地的一圈暗 + 沿左上方来光斜投的淡影，都在 `src/three/StageFloor.tsx`）；线稿面带固定光向的明暗（顶面白、右侧面最暗，`LineArt.tsx` 的 `shaded()`），描边 0.8px、本步操作的零件 1.7px。候选配色都在 `src/three/stage.ts` 的 `STAGE_TONES` 里（纯白、雾灰、石灰、奶黄、聚光、影棚、展厅），改 `DEFAULT_STAGE` 换默认，在地址的 `#` 前加 `?stage=<名字>` 可以临时预览，`node shots/stage-check.mjs [名字…]` 批量截对比图。封面渲染页固定白底。本步操作的零件是加粗黑线 + 奶黄填色（`src/three/LineArt.tsx` 的 `ACCENT` / `HIGHLIGHT`），方向箭头也是黑色；指示灯、设备屏幕和产品本身的颜色（灭火器红、滑板车红等）是说明书内容，不跟主题走。

品牌图标是一只亮着的灯泡，用的是说明书里「本步操作的零件」的画法：黑色描边、奶黄玻璃（左上一道白色高光）、浅灰螺口（螺纹画成微微下弯的弧，像略微俯视），上方五道光芒。灯丝是一笔连写的小写 dongle（字形取自单线字体 Hershey Script，平滑成曲线），深橙色的芯外面一圈模糊的金黄光晕，两根支架丝从灯头伸上来接住 d 的碗底和 e 的收尾；小尺寸下看不清字，就是一团发光的灯丝。

图形只在 `scripts/brand-icon.mjs` 里定义一次（灯泡比例、灯丝字形和笔顺、颜色、线宽），改完跑 `npm run icons` 重新生成全部产物：`public/logo.svg`（透明底，首页左上角和 README 用）、`public/favicon.svg`（白底圆角、线条加粗，16px 的浏览器标签也看得清）、`public/apple-touch-icon.png`（iOS 添加到主屏幕用的 180×180 PNG），以及 `index.html` 等待页里 `icons:start` / `icons:end` 之间的分层 SVG 和灯丝 keyframes。等待页动画周期 3.2 秒：灯泡落下（灯是灰的），灯丝像手写一样一笔笔写出发光的 dongle（三笔，按笔画长度分配时间，写字匀速），写完的那一刻玻璃变奶黄、背后起光晕、光芒从中间往两边画出来，然后熄灭重来。灯泡落下、亮灯、光芒这几段 keyframes 是手写的，时间点要和 `brand-icon.mjs` 里 `splash()` 的写字区间（18%–52%）对上。

调研结论与设计依据见 [docs/铝型材家具调研.md](docs/铝型材家具调研.md)。
