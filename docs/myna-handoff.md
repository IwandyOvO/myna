# Myna — 产品规格与实现交接文档

> 用途：把已验证的高保真原型（见同目录 `myna-prototype-v0.8.html`，单文件、可直接浏览器打开点）落地为真实产品。
> 本文档是唯一规格来源：功能、文案、量表、视觉参数均以本文为准；原型是交互与视觉的参照实现。
> 目标平台：iOS + Android 双端；主攻市场：北美（UI/导航习惯按北美主流 App 对齐，见 §3）。
> 当前规格版本：v0.8.1（v0.8.0 + 2026-11 产品决策：§4.3 中文通用产品量表、§4.4 盲评 24 小时窗口）。

---

## 1. 产品概览

**Myna** 是一款"万物评价"轻社交 App：用户可以给**任何东西**（一瓶饮料、一包零食、一门课）或**任何事**（要不要去团建、要不要赴约）打分，并用一句话说理由。所有评价聚合成公开的**最佳榜 / 踩雷榜**，帮后来者做决定。

- Slogan：中文「听听大家怎么说」/ English: "hear what everyone's saying"
- 名字由来：Myna = 八哥，学人说话的鸟——把大家的声音学回来给你听。自带吉祥物（八哥）。
- 核心循环：刷到东西/事 → 看大家打了几分 → 自己也打一分 → 榜单实时变化。
- 差异化：① 不只是商品，**事件类评价**（去/不去）是第二大类；② 每个细分类有**专属趣味评价量表**（见 §4.2）；③ 榜单双列：最佳榜 + 踩雷榜同等重要；④ 链接识品（从社交平台分享进来查评价，见 §7）。

## 2. 品牌与视觉规范

| 项目 | 定版 |
|---|---|
| 品牌名 | Myna（注意商标风险，见 §13） |
| Logo | （2026-11-12 定版）**行走的八哥**：黑白剪影风格，侧身行走、张嘴鸣叫，翅膀由一道留白弧线勾出，笑眯眯的弯眼睛（留白弧线），头顶两道"叫声"短线。App 图标为白底黑鸟；首页顶栏左上角只放八哥；登录页为八哥 + "Myna" 字标（末字 **a** 番茄红）。深色模式下黑白反转。源文件与全套尺寸生成脚本：`tools/brand/build-icons.cjs` |
| 主色 | `#FF5A3C`（番茄红） |
| 点缀色 | `#FFC93C`（黄，八哥喙/眼圈） |
| 浅色底 | `#F6F5F2` |
| 深色模式 | 全套支持，与浅色一一对应 |
| 硬约束 | **全站禁止使用 💩 emoji**（负面档统一用 👎；踩雷榜图标用 📉）；**中文标签文案 ≤ 4 个字** |

## 3. 信息架构与导航（v0.8 定版，按北美习惯）

- **底部导航 5 位**：首页 / 附近 / **发布（中央凸起圆形 + 按钮，主色、白加号、阴影，点击直达发布页）** / 榜单 / 我的。
- **左侧隐藏抽屉（Drawer）**：主 Tab 页顶栏最左 ☰ 打开，约 78% 屏宽滑入 + 半透明遮罩；点遮罩 / ✕ / 左滑关闭。内容自上而下：
  1. 用户区：头像 + 昵称 + ID + 信誉分（点击进「我的」）
  2. 主菜单：🔗 链接识品、⚙️ 设置（两者均为**独立页面**，带返回键，返回打开前的 Tab）
  3. 次级菜单：🏆 我的成就、⭐ 我的收藏、🕘 浏览历史、📝 草稿箱
  4. 底部小字版本号
- 首页顶栏：☰ ｜ Logo ｜ 搜索 ｜ 🌐（内容语言筛选，未全选时角标显示已选数）｜ 🔔
- 明确不要：右侧贴边悬浮按钮（国内 App 样式，不符合北美习惯）。

## 4. 核心机制：评价系统

### 4.1 内容分类（两级）

| 大类 | 细分分类（6） |
|---|---|
| 产品 product | 饮料、零食、电子产品、美妆个护、餐饮美食、日用百货 |
| 事件 event | 生活、情感、职场、家庭、教育、其他 |

帖子（post）字段至少包含：大类、细分类、标题、描述、图片（可选）、位置（可选）、内容语言、是否盲评。

### 4.2 分类专属评价量表（核心资产，逐字实现）

每个帖子按其**细分类**套用专属五档量表（1=最差 → 5=最好）。详情页分布条、评价弹窗、评论档位徽章、榜单详情、"我的评价"、发布页量表提示，**全线统一按此解析**。中文与 English 有全量专属文案；其余 5 种 UI 语言回退该大类的通用量表（§4.3）。

**产品类（中文 | English）**

| 分类 | 1 档 | 2 档 | 3 档 | 4 档 | 5 档 |
|---|---|---|---|---|---|
| 饮料 | 👎 一口皱眉 \| Meme-Face Bad | 😖 差点意思 \| Falls Short | 😐 白开水+ \| Meh | 😋 好喝 \| Tasty | 🤩 吨吨吨 \| Chug-worthy |
| 零食 | 👎 拆开后悔 \| Instant Regret | 😖 就这？ \| That's It? | 😐 解个馋 \| Snackable | 😋 停不下来 \| Can't Stop | 🤩 一包炫完 \| Demolished |
| 电子产品 | 👎 到手吃灰 \| Dust Collector | 😖 智商税 \| Sucker Tax | 😐 能用 \| It Works | 😄 真香 \| Actually Great | 🤩 闭眼入 \| No-Brainer |
| 美妆个护 | 👎 拔草预警 \| De-influenced | 😖 鸡肋 \| Pointless | 😐 无功无过 \| Just Fine | 😊 回购款 \| Repurchase | 🤩 本命 \| Holy Grail |
| 餐饮美食 | 👎 味同嚼蜡 \| Like Chewing Wax | 😖 名不副实 \| Overhyped | 😐 填饱肚子 \| Fills You Up | 😋 下饭 \| Hits the Spot | 🤩 排队也值 \| Worth the Line |
| 日用百货 | 👎 闲置加一 \| Clutter +1 | 😖 有点拉胯 \| Kinda Flimsy | 😐 凑合 \| Usable | 😄 好用 \| Handy | 🤩 无限回购 \| Restock Forever |

**事件类（中文 | English）**

| 分类 | 1 档 | 2 档 | 3 档 | 4 档 | 5 档 |
|---|---|---|---|---|---|
| 生活 | 🙅 去了后悔 \| Instant Regret | 😒 浪费时间 \| Waste of Time | 🤔 看心情 \| Depends | 👍 值得一去 \| Worth It | 🚀 冲就完了 \| Just Go |
| 情感 | 💔 快跑 \| Run | 😒 下头 \| The Ick | 🤔 再观察 \| Keep Watching | 💗 有点心动 \| Butterflies | 😍 锁死 \| Lock It Down |
| 职场 | 👎 想辞职了 \| Want to Quit Already | 😖 内耗 \| Soul-Draining | 😐 混日子 \| Paycheck Mode | 😄 有奔头 \| Promising | 🚀 前途无量 \| Sky's the Limit |
| 家庭 | 🙅 能躲就躲 \| Dodge If Possible | 😖 压力山大 \| Stressful | 😐 例行公事 \| Routine | 😊 挺温馨 \| Cozy | 🥰 治愈 \| Healing |
| 教育 | 👎 学个寂寞 \| Learned a Whole Lot of Nothing | 😖 催眠 \| Snoozefest | 😐 中规中矩 \| By the Book | 😄 干货满满 \| Packed With Value | 🤩 听君一席 \| Mind-Blown |

文案尺度（给后续新增分类的写作规范）：**有梗但不骂人**，朋友间吐槽的强度；禁止攻击性/粗口表达；第一版曾用"刷锅水/狗都不吃"被否（太狠）、第二版"避雷/还行"被否（太素），定版即上表。

### 4.3 通用量表（兜底）

- 产品通用：👎 踩雷 / 😖 不太行 / 😐 一般 / 😋 不错 / 🤩 顶级（English: Terrible / Bad / Okay / Good / Top Tier 量级对应即可）（v0.8.1：原"屎/不好喝/好喝"违反 §4.2 尺度且只适合饮料，已替换）
- 事件通用（细分类"其他"也用它）：🙅 别去 / 😒 不推荐 / 🤔 看情况 / 👍 值得去 / 🚀 必冲（English: Skip It / Not Recommended / Depends / Worth It / Must Go）

### 4.4 评分与聚合

- 每帖维护：五档各自票数、总评价数、均分（1–5，一位小数）。
- 详情页展示五档分布条（档位标签用量表文案）+ 均分 + 总数。
- **盲评帖**：帖子可设为盲评——发布后 24 小时内，用户未评价前，均分与分布全部打码（显示 ?.?），评价后解锁；24 小时后自动公开，并可正常进榜（盲评期内不进榜，避免泄露均分）。用于防从众的新品首评场景。（v0.8.1）
- **自动标签**：满足条件自动打标——「潜力新品」（新帖且高分段占比高）、「踩雷预警」（低分段占比高）。阈值可配置，运营参数。

### 4.5 评价与改评规则

- 评价 = 选一档（必填）+ 文字理由（可选）。
- 已评价后按钮变「已评价 ✓」；详情页可改评，**每帖最多改 3 次**，按钮显示剩余次数。
- 改过的评价，其评论下方显示 11px 浅灰小字「已编辑」。
- 用户自己的评价会同步出现在帖子评论流中（带档位徽章）。

### 4.6 评论

- 评论流按档位筛选（chip：全部 / 5 档各一），每条评论带作者所评档位的徽章（emoji + 量表短标签）。
- 常规点赞、回复可按通用社交产品实现（原型仅做了点赞态）。


## 5. 页面与功能规格

### 5.1 首页
- 信息流帖子卡：作者、分类 chip、标题、描述摘要、图片、均分徽章（盲评帖打码）、评价数、所在城市/距离（有位置时）。
- 顶部横向滚动分类 chips：推荐 + 11 个细分类，点选过滤信息流。
- 右上角 🌐：内容语言多选筛选（底部 sheet，7 种内容语言，未全选时角标显示已选数量）。
- 未评价帖卡上有「去评价」入口；已评价显示「已评价 ✓」。

### 5.2 详情页
- 全量信息 + 五档分布条（量表文案）+ 评价入口 + 评论流（档位筛选）。
- 榜单条目点进来共用此详情页（榜单是入口，不是另一套页面）。

### 5.3 发布页
- 大类切换（产品/事件）联动细分类 chips（各 6 个）。
- 标题、描述输入框：**placeholder 示例文案按所选细分类动态切换**（§5.4 表，中英全量；其余 5 语言用大类通用示例）。
- 位置：真实 GPS 定位（系统定位 + 逆地理编码显示地名），失败回退手动城市列表；可不加。
- 盲评开关；量表提示行（显示当前分类将使用的五档量表）。
- 发布成功后帖子出现在首页流首位（原型行为；正式版按推荐/时间策略）。

### 5.4 发布页示例文案表（placeholder，中英）

| 分类 | 标题示例（中） | 描述示例（中） | Title (EN) | Desc (EN) |
|---|---|---|---|---|
| 饮料 | 比如：新出的樱花汽水，好喝吗？ | 比如：什么口味、多少钱、在哪买到的，第一口什么感觉… | e.g. Is the new sakura soda any good? | Flavor, price, where you got it, first sip… |
| 零食 | 比如：新出的螺蛳粉薯片，好吃吗？ | 比如：什么味道、脆不脆、多少钱一包… | e.g. Are the new luosifen chips good? | Flavor, crunch, price per bag… |
| 电子产品 | 比如：刚发布的降噪耳机，值得买吗？ | 比如：价格、用了几天、和上一代比怎么样… | e.g. Are the new noise-cancelling earbuds worth it? | Price, days used, vs the last gen… |
| 美妆个护 | 比如：新出的修护面膜，好用吗？ | 比如：肤质、使用感、有没有过敏… | e.g. Is the new repair mask any good? | Your skin type, how it feels, any irritation… |
| 餐饮美食 | 比如：楼下新开的拉面店，好吃吗？ | 比如：招牌菜、价格、要不要排队… | e.g. Is the new ramen place downstairs good? | Signature dish, price, wait time… |
| 日用百货 | 比如：新买的抽屉收纳盒，好用吗？ | 比如：材质、容量、是真方便还是占地方… | e.g. Is this drawer organizer actually useful? | Material, capacity, handy or just clutter… |
| 生活 | 比如：周末的跳蚤市集，值得去吗？ | 比如：时间地点、门票、适合带谁一起… | e.g. Is the weekend flea market worth going to? | When, where, ticket, who to bring… |
| 情感 | 比如：相亲对象约我看电影，去吗？ | 比如：对方什么情况、我纠结在哪… | e.g. My blind date asked me to a movie — should I go? | About them, and what's holding you back… |
| 职场 | 比如：部门团建去爬山，去吗？ | 比如：自费还是公司出、都有谁、要不要请假… | e.g. Team outing is a hike — should I go? | Who pays, who's going, is it skippable… |
| 家庭 | 比如：周末家庭聚餐，去吗？ | 比如：都有谁、在哪吃、我纠结在哪… | e.g. Family dinner this weekend — should I go? | Who's there, where, what's the dilemma… |
| 教育 | 比如：周一早八的选修课，值得选吗？ | 比如：老师怎么样、给分松不松、点名吗… | e.g. Is the 8am elective worth taking? | The teacher, grading, attendance… |
| 其他 | 比如：朋友约我去露营，去吗？ | 比如：时间地点、都有谁、大概什么情况… | e.g. Friends invited me camping — should I go? | When, where, who, the situation… |

### 5.5 附近页
- 基于 GPS 的附近帖子流，每帖带距离（如 0.5km）；半径过滤：1km / 5km / 10km / 全城；「重新定位」按钮。

### 5.6 我的页
- 头卡：头像、昵称、ID、**信誉分**（并入头卡）。
- 统计行：发布数 / 评价数 / 获赞数，均可点击进对应列表页（我的发布 / 我的评价 / 获赞记录）。
- 「我的徽章」展示卡：已解锁徽章横排 + 「+N 全部」，点击进成就页。
- 「本周战报」卡：本周评价数、新徽章、信誉分变化等（运营文案位）。
- 「常用功能」宫格：收藏 / 历史 / 草稿箱 / 关注（各有列表页；草稿可点开续写发布页）。

### 5.7 成就页
- 徽章墙共 **11 枚**（示例定版 3 枚已解锁：🏅金舌头·连续30天、🎖️早鸟品鉴师、🛡️避雷达人；其余 8 枚为品鉴/避雷/社交类常规设计，实现时可按此风格补齐并回填文案）。
- 限时挑战区（进度如 2/5）；成就达人榜（用户排行）。

### 5.8 设置页（从抽屉进入，独立页带返回）
- 顶部账户卡 + 第三方登录横排：邮箱、Google、Facebook、Apple。
- 分组卡片：通用（UI 语言 7 种、深色模式）、内容与隐私（内容可见范围三段选、屏蔽名单、清除缓存并显示大小）、支持与关于（版本号 v0.8.0 等）。

### 5.9 国际化
- **UI 语言 7 种**：简体中文、English、Español、Français、日本語、한국어、Italiano；默认跟随系统语言，可在设置中切换；全部界面文案走词典。
- **内容语言**与 UI 语言是两套：内容按帖子的语言用 §5.1 的 🌐 多选过滤（种子内容含中/英/西/日）。

## 6. 榜单规则

- 维度：时间（**月榜 / 总榜**）× 类别（**饮料 / 食品 / 事件**）× 方向（**🌟 最佳 Top 20 / 📉 踩雷 Top 20**）。
- 榜单帖子口径映射：饮料榜条目用饮料量表、食品榜用餐饮美食量表、事件榜用事件通用量表（详情页按此解析）。
- 月榜带**赛季制**（每月重置、赛季结算徽章位）。
- 排序建议：均分为主、评价数为门槛（防小样本刷榜，实现时设最低评价数，如 ≥50 才入榜——运营参数）。

## 7. 链接识品（重点专项，已踩过坑，务必按此实现）

功能目标：用户在小红书 / Instagram / Facebook 看到产品视频，想查"大家给它打几分"，把内容送进 Myna 得到结果。

### 7.1 已验证的结论（别重走弯路）
- **不要做服务端爬取/抓取**：实测从服务器抓小红书链接只能拿到风控/登录页；且这违反平台 ToS。
- **用户授权 ≠ 平台授权**：用户同意我们读 TA 的账号，不等于平台授权我们批量/自动读取。
- **主通道 = 系统分享（定版）**：用户在原 App 点「分享 → Myna」，iOS Share Extension / Android App Links + intent 接收**整段分享文案**（通常自带标题文案 + 链接）。Myna 对文案全文做产品关键词/实体匹配：
  - 命中已有帖子 → 显示评分卡，可跳详情；
  - 命中已知产品但无评价 → 显示"暂无评价"，给「发起问询」按钮，预填发布页（分类 + 标题如「{产品名}，好吃吗？」）；
  - 未命中 → **诚实显示"没能识别出产品"+ 原因说明**，并提供手动输入产品名查询（对帖子库+榜单库做包含匹配）。
- **红线：绝不编造识别结果**。识别不了就说识别不了（原型 v0.4 曾用关键词瞎猜编造结果，被用户实测抓包，这是本项目最严重的一次翻车）。
- 备用方案（高风险，二期再评估）：App 内 webview 用用户本人登录态打开链接读页面——有风控限号、ToS、苹果审核风险；禁止让用户在 Myna 界面内输入第三方平台密码。
- 官方 API 仅对内容创作者本人的内容有效，不适合做通用识品。

### 7.2 演示案例（验收用例）
- 分享文案含「缺德舅 / Trader Joe's / 椰子糕 / 爆米花 / taco」→ 识别出 3 个未评价产品（泰国椰子糕、酸咸甜爆米花、Seasoned Taco 零食），每个带「发起问询」。
- 光秃短链（如只有 xhslink 短链接、无文案）→ 未识别态 + 手动查询入口。

## 8. 用户体系

- **信誉分**（演示值 92）：由评价质量、被赞、被采纳、违规记录综合计算；展示于头卡与抽屉用户区。算法一期可简化为规则分。
- **徽章体系**：共 11 枚（见 §5.7），与成就页、限时挑战、达人榜联动。
- 演示账号（种子）：昵称「干饭鉴黄师」@foodjudge_007，信誉分 92，12 发布 / 348 评价 / 1.2k 获赞。

## 9. 数据模型（建议，PostgreSQL）

```
users(id, nickname, handle, avatar_url, reputation, locale, created_at)
auth_identities(id, user_id, provider[email|google|facebook|apple], provider_uid)
posts(id, author_id, type[product|event], category, title, body, image_urls[],
      lang, blind bool, lat, lng, place_name, status, created_at)
post_stats(post_id, c1, c2, c3, c4, c5, total, avg)  -- 五档票数与均分，可由 ratings 聚合维护
ratings(id, post_id, user_id, tier[1..5], reason_text, edited_count[0..3], created_at, updated_at)
comments(id, post_id, user_id, tier_snapshot, body, like_count, edited bool, created_at)
boards(id, period[monthly|all], category[drinks|food|event], direction[best|worst], season)
board_entries(board_id, post_id, rank, avg, total)
badges(id, key, name_i18n, icon, rule)
user_badges(user_id, badge_id, unlocked_at)
favorites(user_id, post_id) / follows(follower_id, followee_id) / views(user_id, post_id, ts)
drafts(id, user_id, payload_json, updated_at)
share_imports(id, user_id, raw_text, source, matched_post_id, status[matched|unmatched|inquired])
blocks(user_id, blocked_user_id)
```

均分/榜单建议用定时任务或物化视图聚合，避免实时全表扫描；月榜按 season 分区。

## 10. API 草案（REST，供参考）

```
POST   /auth/{provider}                 登录（email/google/facebook/apple）
GET    /feed?category=&langs=&cursor=   首页流
GET    /posts/:id                       详情（含分布、我的评价态）
POST   /posts                           发布（type/category/title/body/images/blind/location）
POST   /posts/:id/ratings               评价 {tier, reason}
PATCH  /posts/:id/ratings/me            改评（校验 edited_count<3）
GET    /posts/:id/comments?tier=        评论（可按档筛选）
GET    /boards?period=&category=&direction=  榜单
GET    /nearby?lat=&lng=&radius_km=     附近
POST   /share-imports                   提交分享文案 → {status, matches[]|post}
GET    /search?q=                       手动查产品名（帖子+榜单包含匹配）
GET    /me /me/posts /me/ratings /me/badges /me/weekly
GET    /badges                          成就墙与挑战
PUT    /me/settings                     语言/可见范围/屏蔽名单
POST   /drafts / GET /drafts            草稿
```

## 11. 技术选型建议

- 客户端：React Native 或 Flutter 一套双端（原型为 390×844 手机框视觉，设计稿以原型截图为准）；抽屉、底部 sheet、中央凸起发布钮均为标准组件。
- 服务端：任意主流栈（Node/NestJS 或 Go）+ PostgreSQL + Redis（榜单缓存、计数）；图片走对象存储 + CDN。
- 定位：系统 Geolocation；逆地理编码可用 BigDataCloud（原型用的免费接口）或 Google/Mapbox Geocoding（北美正式上线建议后者）。
- 分享入口：iOS Share Extension、Android intent-filter（ACTION_SEND text/plain）——§7 的落地关键，优先排期。
- i18n：词典文件按 §5.9 的 7 语言组织；量表文案是词典的一部分（§4.2/4.3）。

## 12. 种子数据（原型同款，供联调/演示）

帖子（节选）：
- 樱花白桃味可乐（饮料，**盲评**，分布 [12,28,70,140,114]）
- 螺蛳粉味薯片（零食，分布 [180,120,80,40,22]，均分约 2.1，踩雷向）
- 周五早八去不去（教育/事件）
- 0 糖乌龙茶气泡水（饮料，潜力新品）
- 食堂黄焖鸡（餐饮美食）
- 部门团建密室逃脱 AA128（职场/事件）
- 英文帖 Monster Ultra Peachy Keen；西语帖 Coca-Cola Cherry Vainilla；日语帖 桜味コーラ（用于内容语言过滤演示）
- 附近帖：塔可车 2.1km、社区瑜伽课 0.5km 等带距离样本

榜单：饮料/食品/事件 × 最佳/踩雷各 20 条（名称+均分），总榜评价数约为月榜 5 倍量级。

## 13. 合规与风险（重要，先看再动手）

1. **商标**：Myna 尚未做正式商标检索。已知撞名：① 日本 "My Number" 个人编号卡生态的 MynaApp（数字厅，安装量大）；② Canonical 的 Ubuntu 语音转文字工具 Myna；③ 新加坡同名家庭助手 App（小体量）。北美消费品牌暂未见知名撞名，但**正式立项/上架前必须找律师做 USPTO 正查**，本项未完成。
2. **平台 ToS**：链接识品只能走 §7 的系统分享方案；不要爬取小红书/IG/FB 页面，不要内嵌收集第三方账号密码（苹果审核 5.2.2 与账号安全红线）。
3. **UGC 合规**：上架必需举报/拉黑/内容审核机制（App Store 1.2 条款）；设置页已有屏蔽名单与可见范围，是为此预留。
4. **定位权限**：发布与附近页用 GPS，权限文案与拒绝后的手动回退路径必须完整。

## 14. 未决事项（实现前与产品方确认）

- GPS 定位在原型沙箱内无法实测，真机行为（一键定位→逆地理编码显示地名）需在真机首验。
- 冷启动策略未定：建议滩头选饮料/零食单品类或校园场景先攒评价密度，再扩全品类（产品方内部结论，未写入本规格的硬需求）。
- 榜单入榜最低评价数、自动标签阈值、信誉分算法均为运营参数，需单独定版。

## 15. 版本演进（原型 v0.1 → v0.8，供理解取舍背景）

- v0.1 核心骨架：信息流/详情/五档评价/发布/榜单/我的。
- v0.2 改评上限与已编辑标记、榜单可进详情、分类两级联动、成就墙、设置页、7 语言 UI + 内容过滤、深色模式。
- v0.3 成就独立页、统计可点、真实 GPS、首页细分类 chips。
- v0.4 内容语言筛选移到首页 🌐、链接识品、附近页、我的页战报/宫格、成就挑战与达人榜、设置页人性化重做。
- v0.5 底部 6 Tab、我的页徽章展示卡（后 v0.8 导航再次重构，6 Tab 方案已废弃）。
- v0.6 定名 Myna + 八哥 Logo + Slogan；识品按 §7 诚实化重做。
- v0.7 分类专属量表定版（§4.2）、💩 清零、标签 ≤4 字；v0.7.1 发布示例文案按分类（§5.4）。
- v0.8 导航北美化（§3）：5 Tab + 中央发布、左抽屉收纳识品与设置。

## 16. 建议实现顺序

1. **MVP**：账号（四种登录）、信息流/详情/发布/评价改评、分类量表、榜单、我的页、设置、7 语言框架、深色模式。
2. **二期**：系统分享识品（§7）、附近 GPS、成就/信誉/挑战、草稿与收藏历史。
3. **三期**：赛季运营、品牌新品合作（收入方向，未定版）。

---
*文档结束。配套文件：`myna-prototype-v0.8.html`（高保真可交互原型，浏览器打开即可点击体验，数据为内存态、刷新重置）。*
