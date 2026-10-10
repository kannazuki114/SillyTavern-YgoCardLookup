# 游戏王查卡器 v2 · SillyTavern / TauriTavern 扩展

给酒馆加一个**离线游戏王卡库 + 打牌工具**的第三方扩展：查卡、官方裁定、卡组校验、起手模拟、开卡包、抽卡、收藏册、每日商店、真实卡框 DIY、决斗盘，并把识别到的卡面资料自动注入提示词。

- 卡库：**14281 张 / 598 字段 / 59830 别名**，全部随扩展附带（`data/`），断网可用
- 识别：括号词段 / 8 位卡密 / 自然语言触发词（「开一包」「今日商店」「查卡 灰流丽」）/ 自由文本卡名
- 注入：拦截生成请求把资料写进提示词；宿主不支持拦截器时走事件兜底
- 工具：20 个 function tool（AI 可主动查卡、查禁限、校验卡组…）+ 17 条斜杠命令
- 面板：11 个分组、105 个控件（含栏目隔离、外部接口、维护）

「查询内容 → 禁限表区域」可选择 **无限制**：作为无禁限规则模式，不套用任何地区禁限表，也不请求在线禁限数据；卡组张数和同名卡合计最多 3 张的检查仍保留。工具省略 `region` 时遵循面板设置，显式传 `cn` / `ja` / `en` 可查询指定地区，`none` 表示无禁限规则。

DIY 默认使用内置 WebP 真实卡框，编辑器与图形列表采用同一设置。卡图加载失败会保留卡框；卡框本身加载失败时自动回退自绘版。

## 安装

### 方式一：用扩展安装器（推荐）

1. 酒馆 → 扩展 → **安装扩展**，填入本仓库地址
   `https://github.com/kannazuki114/SillyTavern-YgoCardLookup-v2`
2. 装完勾选启用 → 刷新页面（F5）
3. 首次使用先跑一次 `/ygoselftest`，首行应显示 **40/40 通过**

> 网络安装是整仓库克隆：`dist/`（产物）、`data/`（卡库 3.4MB）、`assets/`（卡框素材）都会一起下载，装完**开箱即用**，不需要额外装数据库。

### 方式二：手动复制

把整个目录放进 `data/<你的用户名>/extensions/third-party/` 下即可。**目录名叫什么都可以**——插件会自己定位自己的 `data/` 与 `assets/`（用脚本自身位置 + 宿主给的扩展路径双重兜底）。

### 如果只拿到了代码、没有 data/

面板「维护」里有三种办法把卡库装上（装进 IndexedDB，读取优先级：IndexedDB → 随包 `data/` → 旧版目录）：

| 按钮 | 说明 |
| --- | --- |
| 🔄 联网更新数据库（百鸽） | 一键下载 cards.zip（约 2.3MB）→ 解压 → 生成卡名索引/卡表，并更新字段表 |
| 📥 安装数据库（手动选文件） | 选 `card-names.txt` / `card-stats.tsv` / `setnames.json` / `art-index.json` 四个文件 |
| 🔗 从 URL 安装数据库 | 给一个目录地址（以 `/` 结尾）或单个文件地址 |
| 🧪 测试数据库 | 报告 4 个库各读到多少、来源是手动安装还是随包文件，并真查一张卡 |

装完**立刻生效**（不需要刷新页面）。「清空缓存」不会删掉手动安装的数据库。

## 命令一览

| 命令 | 作用 |
| --- | --- |
| `/ygocard 青眼白龙` | 查单卡（数值/效果/字段/禁限/卡图） |
| `/ygorule 灰流丽` | 官方裁定 / FAQ |
| `/ygoart 黑魔导` | 异画版本 |
| `/ygopack 超级包06` | 按真实卡包首发卡池开包（可加 `count=` `region=`） |
| `/ygodraw count=2 kind=怪兽` | 随机抽卡（可按类型/属性/种族/攻击/字段筛） |
| `/ygodeck` | 卡组校验（自动读聊天里的 `<deck>` 块） |
| `/ygohand draw=5 runs=3` | 起手模拟 |
| `/ygosummon 青眼白龙` | 召唤合法性检查（通过可自动上盘） |
| `/ygoduel` | 决斗盘（LP/手牌/场上/阶段） |
| `/ygorecap scope=all` | 本局卡表 |
| `/ygoshop date=2026-01-01` | 每日商店（同一天同一聊天固定） |
| `/ygoalbum 青眼` | 收藏册 |
| `/ygoalias 杀调=杀手旋律` | 俗称表 |
| `/ygodiy` | DIY 自制卡编辑器 |
| `/ygodeckimage` | 卡组展示图（新标签页） |
| `/ygoselftest` | 功能自检（40 项） |
| `/ygoprompt` | 提示词查看/编辑 |

## 数据来源

| 用途 | 来源 | 是否必须联网 |
| --- | --- | --- |
| 卡名/数值/字段（`data/` 三个文件） | 百鸽 ygocdb.com 的 cards.zip 导出，随包附带 | 否 |
| 卡图 | `cdn.233.momobako.com`（9 位先行卡走 `cdntx.moecube.com`） | 是（仅显示图片） |
| 官方裁定 / 禁限表 / 发售表 | 百鸽 API | 是（取不到会**优雅退化**，不影响本地查卡） |
| 异画索引 | 随包 `data/art-index.json` | 否 |

## 开发

```bash
node tools/bundle.mjs     # 改完 src/ 必须重新打包：生成宿主实际加载的 dist/index.js
node tools/check-repo.mjs # 入库/发布前自检：文件是否齐全、dist 是否与 src 同步、有没有被 .gitignore 排除
node tools/test-runtime.mjs --round=1 # 回归：真实 dist/data + 模拟宿主，断网与模拟接口返回
node tools/test-browser.mjs --round=1 # 浏览器：需可解析 playwright 和本机 Chrome，真实 DOM/IndexedDB + 模拟宿主
```

回归测试的模拟接口返回不代表真实联网接口可用。浏览器测试禁止外部请求；实际安装后仍可用 `/ygoselftest` 验证当前酒馆与网络环境。

架构约定（详见 `src/`）：`index.js` 只做装配；五层 `core / data / inject / ui / api`；层间只通过 `registry` 能力表与 `settings` 通信；DOM id 以 `ygo2_` 开头、CSS 类以 `ygo2-` 开头；面板控件由 `src/ui/panel.js` 的字段表生成。

发布新版本时请**同时**改 `manifest.json` 的 `version` 与 `index.js` 的 `MODULE_VERSION`，并记一笔 `CHANGELOG.md`。

## 许可

MIT（见 `LICENSE`）。卡名、卡图、裁定文本版权归原作者与官方所有，本扩展只做本地索引与展示。
