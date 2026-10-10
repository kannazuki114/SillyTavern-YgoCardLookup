# 更新日志

## 0.2.2 · 2026-10-11

- 禁限表区域新增「无限制」无禁限规则模式；查卡、禁限查询、自然语言触发、卡组校验与召唤检查统一遵循设置，并跳过禁限网络请求。卡组张数和同名最多 3 张仍生效。
- 修复指定地区查询单卡时误用面板地区；禁限校验支持卡密卡表。
- DIY 图形列表遵循真实/自绘渲染设置；仅卡框素材失败时整卡回退，失效的卡图/图标不再误触发整卡回退。
- 校正真实卡框的卡图、名称、星级、属性、文字与连接箭头位置；显示灵摆刻度、类型行；魔法/陷阱不再显示怪兽星级。
- 修复切换类别后魔法/陷阱子类型选项不更新，以及 DIY 列表名称未转义；校正真实卡框默认值和 WebP 提示。
- 扩展回归测试：无禁限模式及地区切换、10 种卡框实际加载、48 个素材解码、真实/自绘列表及失败回退。

## 0.2.1 · 2026-10-10

- 修复跨轮旧注入残留、关闭开关后残留、并发旧查询覆盖新结果、快速发送被兜底跳过，以及宿主拦截器与事件兜底重复抽卡。
- 事件回调返回完整异步任务；发送体只保留官方钩子，事件兜底由入口统一执行。
- 修复仅指令模式误禁玩法命令、停用栏目后仍弹窗、动作栏目映射缺失。
- 接通自然语言卡组校验；修复抽卡/起手数量、无关触发改写严格程度，以及 detectOnce 只询问部分提供者。
- 修复中文/大写卡组标签、卡密被当作数量、卡组图/起手不识别卡密、卡组图命令不读取聊天卡表、DIY add 参数和决斗盘移动参数。
- 断网禁限表明确显示不可用，不再误报无限制/检查通过；空网络索引允许恢复后重试。
- 修复卡图尺寸 CSS、面板文本未转义，以及卡图加载失败时商店说明遮住购买按钮。
- 自检恢复收藏/DIY/设置与宿主上下文，并清理超时定时器。
- 新增运行回归与真实浏览器测试脚本，覆盖 DOM 点击和 IndexedDB 安装、刷新、缓存保留及卸载。

## 0.2.0

首个完整版：在 v1（`SillyTavern-YgoCardLookup` v3.75.0）之外重写的 v2 统一模板版本（`src/` 分层 + `registry` 能力表 + 单文件打包产物）。

### 新增

- 统一模板架构：`core / data / inject / ui / api` 五层，层间只走 `registry` 与 `settings`；面板控件由字段表生成（11 组 / 98 控件）
- 单文件打包：`tools/bundle.mjs` → `dist/index.js`（经典脚本，宿主只加载一个文件）
- 本地卡库：14281 张 / 598 字段 / 59830 别名，随包附带（`data/`），断网可用
- 手动安装数据库（IndexedDB）：手动选文件 / 从 URL / 一键联网更新（百鸽 cards.zip）；「测试数据库」报告来源与真实查询结果
- 40 项 `/ygoselftest` 自检（含必需能力清单、对外接口、面板字段注册表、构建指纹）
- 对外接口 `globalThis.YgoCardLookupV2`：`call / actions / ready / on / off / export / import`，供酒馆助手脚本等外部调用
- 事件兜底注入：宿主不执行 `generate_interceptor` 时，在 `GENERATION_AFTER_COMMANDS` / `MESSAGE_SENT` 用同一个拦截器补注

### 修复（本轮集中修复的缺陷）

**装配层**

- `injectFallback:run` 从未注册（`registerInterceptorHooks()` 没人调用）→ 桌面端自动注入整条兜底链失效；已接上
- `installPublicApi()` 从未调用 → `YgoCardLookupV2.call` 不存在；且数据层是同步的，装早了会被打包器结尾的 `globalThis.YgoCardLookupV2 = __entry` 覆盖 → 改为同步装配结束后单独一层挂载 + `APP_READY` 再补挂
- `registerSendBox()` / `installBuyDelegate()` 从未调用 → `ui:sendbox`、`ui:buy` 缺失、商店「购买」按钮点了没反应；已接上
- 面板「卡组展示图」调用不存在的 `tool:deckimage` → 补上能力；`panel.registerStrictnessAction()` 里 `panel`/`registry` 都未定义 → 改为正确导入
- `REQUIRED_CAPS` 只声明从不校验 → 启动时真校验并写进 `ygo2-DIAG` 探针（`missingCaps`），自检里也加了一项
- 面板挂载 `await` 在主装配里 → 宿主抽屉晚出现时把接口层/事件层一起拖最多 10 秒；改为不阻塞（启动 11s → 0.14s）
- 面板字段表重复注册 `diyFrameMode`（重复 DOM id、第二个下拉渲染成 e/s、"改了不保存"）→ 删除重复项，并接入 `registryProblems()` 自检
- `events.js` 挂载发送体钩子漏 `await`（日志恒报成功 + 可能未处理拒绝）

**数据层**

- 系列查询：`decodeSetcodes` 只做"十进制文本里能切出该码"的子串命中 → 字段码 1（正义盟军）实测命中 1828 张无关卡；改为按 **16 位块整块匹配**（现 21 张）；`splitSetcodes` 用 BigInt，顺带修掉 4 张 setcode 超 2^53 的精度丢失
- 字段名表键格式错（`sn.get("0x…")` 永远查不到，退化查十进制串还会张冠李戴：0xa 入魔 → 薰风）→ 统一到 `src/data/setcodes.js` 的 `fieldNameOf`
- 多字段卡（位域 setcode）整行「字段」消失（577 张）→ 按 16 位块逐块查表，例：被封印的艾克佐迪亚 → 被封印 / 艾克佐迪亚
- `cards.js` 里重复的字段解析块引用了未声明的 `hit`（ReferenceError 被吞、整块死代码）→ 删除重复块
- 在线兜底卡的 `types` 是换行版，本地按 `§` 解析 → 新增 `normalizeApiTypes()`（ATK/DEF 不再丢）
- 禁限区域在卡组校验与「禁限表」触发词里写死 `cn` → 跟随面板设置
- 抽卡筛选参数（kind/attribute/race/atk_min/archetype）、`/ygorecap scope=`、`/ygoshop date=`、DIY 的 `type`↔`category` 全部此前被忽略 → 全部生效
- 开包/抽卡卡图 URL 写死图源 → 改用 `imageUrl()`（9 位先行卡走另一图源）
- 卡组校验输出里混进源码残片（`已跳过：' + '' + '`）→ 修掉
- 断网时 `/ygopack`、禁限查询直接抛异常 → 改为优雅退化（且不把失败结果写进 12 小时缓存）
- 自然语言触发词「查卡 青眼白龙」「起手概率」命中后无人 provide 对应能力，反而把自由文本兜底挡掉 → 新增 `runAction:card` / `runAction:hand`，并让拦截器在触发词没产出资料时退回自由文本识别
- `detect.js` 里重复的 `words` 键把「起手概率」整个盖掉 → 合并
- 引用清理只改 `mes` 不改 swipe（v1 改两处）→ 补上，并按宿主给的 message id 清理
- `searchNames` 同一张卡可能同时进两个桶（结果重复）→ 去重

**接口/界面**

- `ready()` 等的是没人注册的键（`getNameIndex`…）→ 改为 `index:names/index:stats/index:setnames`，真正等索引
- `collection:state` / `collection:import` 从未 provide → 收藏册导出恒空、导入静默跳过（还漏了 `await`）→ 已实现
- `external:ask` 读的是不存在的设置项 `apiTimeout`，调用方算好的预算被丢掉（面板"8 秒/不阻塞"形同虚设）→ 尊重 `timeoutMs`
- `withTimeout` 只用 `Promise.race` 从不 abort → 新增 `fetchWithTimeout()`（AbortController）
- 自动模式永远选不到 `direct` 通道（`channelAvailability` 少了这一行）→ 补上
- `buildExternalSystem` 引用未定义的 `text`（副 AI 拿不到玩家这句话）且没 await → 修好
- `/ygoselftest` 会改用户设置却不还原（俗称表 / apiMode 可能被永久改掉）→ 全部 try/finally；「构建指纹」恒真 → 改为真断言
- 「结果用弹窗面板显示」关掉时，收藏册/商店/决斗盘/查卡等按钮静默无反应 → 退回文本输出
- `.ygo2-feedback`（所有面板按钮结果的容器）没有任何 CSS 规则 → 补上

**数据库安装（本轮补充修复）**

- 装了库但**本次会话不生效**（懒索引已解析成空并永久缓存）→ 新增 `index:reset`，装/卸库后自动重置；实测装完立刻可查卡
- 「清空缓存」会连**手动安装的数据库**一起删掉（`idbClear` 清空整个对象存储）→ 改为只清缓存区（保留 `db:` 前缀）
- 旧的"整份文件"缓存可能盖住刚装的库 → 装/卸库时一并清掉这几个缓存键
- 卸载后本会话仍用旧库 → 现在立刻回到随包 `data/`
- 文案错字「百鹤」→「百鸽」

**定位与兼容**

- 插件目录定位以前要求路径里含 `ygo-card-lookup` → 从 GitHub 安装（目录名 = 仓库名，如 `SillyTavern-YgoCardLookup-v2`）时 `data/`、`assets/` 全部找不到；现改为"脚本求值时的 `document.currentScript`（并自动剥掉 `dist/`）→ 宿主 `extensionPath` → 页面 `<script>` 扫描 → 常量"四级兜底，**目录名随便取**
- **宿主用 ES 模块方式加载扩展时（桌面客户端就是如此）`document.currentScript` 为 null、宿主也不提供 `extensionPath`** → 只能退回写死的常量路径，别人的安装目录名一不同就 `settings.html`/`data/`/`assets/` 全部 404；新增**自定位层**：收集页面上的 `<script src>`/`<link href>` 候选目录，逐个读 `manifest.json`，看到本扩展标记才认下来（实测任意目录名都能认对）
- 面板按钮"界面已自己弹窗"时不再误报「执行完毕（无输出）」（改为「已显示（见弹窗）」）
- **异画索引（`art-index.json`）以前用裸 `fetch` 读**，绕过了"手动安装进 IndexedDB"的那份 → 手动装库后异画索引读不到（自检固定 38/40、"异画本地索引/异画卡表"两项失败）；改为走 `dataFile`（IndexedDB → 随包 data/ → 旧目录），手动装库后异画功能完整
- **中文语序「卡名+触发词」取不到参数**（「黑魔女异画」→ `art` 但参数为空，拿不到异画列表）：触发词匹配现在带上"词前那段"，拦截器在参数为空时用它补参，并**先过一遍卡名识别**（俗称「黑魔女」→ 真名「黑魔女 迪亚贝尔斯塔」），且只在唯一候选时替换
- 异画查询解析不到卡时改为返回空数组，让拦截器**退回自由文本识别**（注入这张卡本身的资料），不再把「没有找到「xxx」。」当成"已找到的资料"注入、把兜底路径挡掉
- 发送体改写（append）里卡名重复：卡面文本本身就以「【卡名】」开头，`sendbody.js` 又拼了一次 → 追加到消息里出现「【黑魔女 迪亚贝尔斯塔】【黑魔女 迪亚贝尔斯塔】别名: …」；已改为只在缺标题时补
- **补上两个"代码在读、面板却没有控件"的设置**：`apiMode`（外部接口「通道选择」：自动/tt 主连接/酒馆助手/连接配置/自填地址/关闭，实测 off 与 auto 与 route 走向确实不同）、`diyFrameBase`（DIY 自定义卡框目录，实测留空走自带素材、填了会自动补尾斜杠）
- `runAction:strictness` 被 `ui/panel.js` 与 `api/tools.js` 两处 provide（后注册者覆盖前者，导致面板版的 `"3"`/`"1"` 数字别名失效）→ 只保留 `api/tools.js` 一处并补齐数字别名
- `ygo2-DIAG` 探针增加 `base` 字段（记录解析到的扩展目录，便于排查）
