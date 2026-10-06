import { ctx, log, emit } from "../core/bus.js";
import { settings, DEFAULTS } from "../core/settings.js";
import { ownBase } from "../core/http.js";

/**
 * 统一模板核心：字段注册表。
 * 面板控件全部由这张表生成，不再手写 HTML 字符串。
 * type: check | select | number | text | password | textarea | button
 */
export const FIELDS = [
    { group: "自动检测注入", type: "check", key: "interceptEnabled", label: "启用自动检测注入" },
    { group: "自动检测注入", type: "check", key: "enabled", label: "启用 function tool（AI 可主动调用查卡等能力）" },
    { group: "自动检测注入", type: "check", key: "detectBrackets", label: "识别括号词段" },
    { group: "自动检测注入", type: "check", key: "detectPasscode", label: "识别 8 位卡密" },
    { group: "自动检测注入", type: "check", key: "detectWholeMessage", label: "整条消息就是一个卡名时也识别" },
    { group: "自动检测注入", type: "check", key: "detectFreeText", label: "自由文本里的卡名（用本地卡名索引）", hint: "关掉后只在出现触发词或指令时才查卡。" },
    { group: "自动检测注入", type: "check", key: "naturalCommands", label: "自然语言触发词", hint: "直接打「开卡包 超级包06」「查卡 灰流丽」「今日商店」等就会执行。" },
    { group: "自动检测注入", type: "select", key: "scanScope", label: "扫描范围", hint: "只扫最后一条玩家消息，或连同最近几条一起扫。", options: [["last_user", "只看最后一条玩家消息"], ["all", "最近几条消息都看"]] },
    { group: "自动检测注入", type: "select", key: "detectStrictness", label: "识别严格程度", hint: "最严格：只认完整卡名（名字里有没有空格都认，例如「黑魔女迪亚贝尔斯塔」也能查到），几乎不误报；适中：允许「够具体」的名字片段（1–6 张）；宽松：片段判定最松、命中更多，但可能误报。", options: [["strict", "最严格：只认完整卡名"], ["normal", "适中：允许够具体的名字片段（推荐）"], ["loose", "宽松：尽量多命中（可能误报）"]] },
    { group: "自动检测注入", type: "number", key: "scanDepth", label: "扫描条数（「最近几条」时生效）", hint: "连最近几条消息一起找卡名（1-20，默认 3，与 v1 相同）。v1 里这个数字写死为 3。", min: 1, max: 20 },
    { group: "自动检测注入", type: "check", key: "duelBoard", label: "盘面内容进入提示词", hint: "开启后决斗盘状态会随注入一起给 AI。" },
    { group: "提示词", type: "button", key: "promptEditor", label: "查看 / 编辑提示词", action: "promptEditor" },
    { group: "提示词", type: "select", key: "bodyEditMode", label: "发送体改写（官方 CHAT_COMPLETION_PROMPT_READY 钩子）", hint: "off＝不动发送体（默认）；append＝把识别到的卡片资料直接追加到最后一条玩家消息里（与「注入」不同：这是改即将发送的消息本身）。", options: [["off", "off — 不动（默认）"], ["append", "append — 追加到玩家消息最后一楼"]] },
    { group: "提示词", type: "select", key: "injectLayers", label: "注入分层", hint: "minimal 最省上下文（只给效果与数值）；normal 加字段与禁限；full 再加发售、官方补充说明与最近裁定。", options: [["minimal", "minimal — 只给打牌要用的"], ["normal", "normal — 加字段与禁限"], ["full", "full — 再加发售/补充说明/裁定"]] },
    { group: "提示词", type: "select", key: "triggerMode", label: "触发方式", options: [["full", "全部：自由文本 + 触发词 + 指令"], ["keyword", "仅触发词 + 指令"], ["command", "仅指令：完全隔离"]] },
    { group: "提示词", type: "check", key: "capabilityHint", label: "注入模块速查表" },
    { group: "提示词", type: "number", key: "injectBudget", label: "提示词预算（字符）", min: 300, max: 20000, step: 100 },
    { group: "提示词", type: "select", key: "injectPosition", label: "注入位置", options: [["chat", "聊天内（可设深度，推荐）"], ["before", "主提示词之前"], ["after", "主提示词之后"]] },
    { group: "提示词", type: "number", key: "injectDepth", label: "聊天内注入深度（0=最后一条之后）", min: 0, max: 20 },
    { group: "提示词", type: "check", key: "skipQuiet", label: "摘要等 quiet 生成不注入" },
    { group: "提示词", type: "textarea", key: "injectNote", label: "附加处理要求（留空不加）" },
    { group: "提示词", type: "select", key: "injectNotePosition", label: "注入附注的位置", hint: "tail＝跟在卡片资料之后（默认，适合「这段资料怎么用」）；head＝放在整块最前面（适合「全局设定/风格/立场」类文本，AI 更容易当成总纲）。", options: [["tail", "tail — 跟在卡片资料后（默认）"], ["head", "head — 放在整块最前"]] },
    { group: "提示词", type: "note", label: "「注入附注」里的文字会原样进入发给 AI 的提示词（预算不足时优先保留它，不会先被截断）。" },
    { group: "查询内容", type: "textarea", key: "aliases", label: "俗称表（每行一条：俗称=官方名）", hint: "例：杀调=杀手旋律。识别与查卡时会先把俗称换成官方名，所以「我发动杀调」也能查到「杀手旋律」。# 开头是注释。" },
    { group: "查询内容", type: "check", key: "includeImage", label: "卡图 Markdown" },
    { group: "查询内容", type: "check", key: "includeField", label: "字段（系列）" },
    { group: "查询内容", type: "check", key: "includeRelease", label: "首次发售" },
    { group: "查询内容", type: "check", key: "includeBanlist", label: "禁限状态" },
    { group: "查询内容", type: "check", key: "includeSupplement", label: "官方补充说明" },
    { group: "查询内容", type: "check", key: "includeFaq", label: "附带最近 3 条官方裁定" },
    { group: "查询内容", type: "select", key: "banlistRegion", label: "禁限表区域", options: [["cn", "官方简中"], ["ja", "OCG 日文"], ["en", "TCG 英文"]] },
    { group: "查询内容", type: "check", key: "useYgoprodeck", label: "允许访问 db.ygoprodeck.com", hint: "用于取异画与英文名；关闭后只用本地数据（异画索引已内置，仍可离线看）。" },
    { group: "查询内容", type: "check", key: "handImages", label: "起手模拟显示卡图" },
    { group: "查询内容", type: "number", key: "cardImgMax", label: "聊天里卡图最大宽度（像素）", min: 120, max: 900, step: 20 },
    { group: "外部接口", type: "note", label: "外部接口：开着「跟随酒馆主连接」就用你酒馆正在用的模型（不需要任何额外配置）；关掉则用下面填的地址/密钥/模型。触发时先让外部模型处理，再把结果连同卡面数据交给主 AI。" },
    { group: "外部接口", type: "check", key: "apiEnabled", label: "启用外部接口", hint: "总开关。关闭时插件绝不向外发送任何内容（只用本地卡库）。" },
    { group: "外部接口", type: "check", key: "apiFollowMain", label: "跟随酒馆主连接（地址与模型实时取自主连接，下面填的仅作备用）", hint: "开着＝用你酒馆里正在用的模型；关掉＝只用下面填的地址与模型。" },
    { group: "外部接口", type: "check", key: "apiExternalAiOwnSearch", label: "用外部 AI 时停用插件自主搜索（直接把玩家输入交给外部 AI）", hint: "默认关：本地检索与外部 AI 结果【并存】（卡面、效果、卡图都会给 AI）。勾上则把整句直接交给外部 AI、不再注入本地卡面数据（只保留卡图链接）。" },
    { group: "外部接口", type: "text", key: "apiUrl", label: "接口地址", hint: "例：https://api.deepseek.com（填到 /v1 也行；会自动补 /chat/completions）。跟随主连接时这里只作备用。" },
    { group: "外部接口", type: "password", key: "apiKey", label: "API 密钥", hint: "sk-…（留空＝不鉴权）。跟随主连接时用主连接里的密钥。" },
    { group: "外部接口", type: "select", key: "apiModel", label: "模型", hint: "先点右边的「连接 / 拉取模型」，拉不到就选「手动填写」自己写。", optionsProvider: function () { const list = (typeof getApiModels === "function" ? getApiModels() : []) || []; const out = [["", "（默认 gpt-3.5-turbo）"]]; for (const mm of list) out.push([mm, mm]); out.push(["__manual__", "手动填写…"]); return out; } },
    { group: "外部接口", type: "text", key: "apiModelManual", label: "模型（手动填写的名字）", hint: "上面选「手动填写…」时用这一项。" },
    { group: "外部接口", type: "button", key: "apiPullModels", label: "连接 / 拉取模型", action: "apiPullModels" },
    { group: "外部接口", type: "button", key: "apiTest", label: "发送测试", action: "apiTest" },
    { group: "外部接口", type: "check", key: "apiNonBlocking", label: "外部 AI 不阻塞生成（结果下一轮生效，推荐：发送后立刻出字）" },
    { group: "外部接口 · 高级", type: "select", key: "apiProfile", label: "副 API 用哪条连接", hint: "来自酒馆「连接管理器」里保存的连接；选「自动」＝用第一条。", optionsProvider: function () { const list = (typeof listExternalProfiles === "function") ? listExternalProfiles() : []; const out = [["", "自动（第一条连接）"]]; for (const p of list) out.push([p.id, p.name + "（" + (p.model || p.api || "?") + "）"]); return out; } },
    { group: "外部接口 · 高级", type: "textarea", key: "apiInstruction", label: "给副 API 的指令", hint: "副 API 收到的系统指令：告诉它要做什么（例如「只回答规则问题，200 字内，不要编造」）。" },
    { group: "外部接口 · 高级", type: "number", key: "apiBudget", label: "外部处理预算（毫秒）", hint: "超过这个时间就不等它了，直接用本地数据继续（保证回复不被拖慢）。", min: 1000, max: 60000, step: 500 },
    { group: "外部接口 · 高级", type: "number", key: "apiMaxTokens", label: "副 API 最大输出（tokens）", min: 64, max: 65535, step: 64 },
    { group: "外部接口 · 高级", type: "check", key: "apiViaServer", label: "拉模型/测试时先走服务端路由", hint: "关掉就只用客户端直连（TauriTavern 建议关掉：服务器上通常没有 /api/backends 接口）。" },
    { group: "外部接口 · 高级", type: "check", key: "apiWebhookReplace", label: "回写时丢弃插件原始数据（只给 AI 对方的结果）", hint: "v1 同款：勾上后注入里只保留外部 AI 的结果，不再附带本地卡面数据（外部调用失败时仍然保留本地数据，不会让 AI 空手）。" },
    { group: "玩法", type: "check", key: "summonAutoApply", label: "召唤检查通过时自动上盘", hint: "勾上后：检查合法就自动执行（祭品/素材送墓、怪兽上场、用掉本回合通招），并把结果写进盘面。关掉则只判定不动盘面。" },
    { group: "玩法", type: "check", key: "shopIncludeDiy", label: "DIY 卡也进商店 / 卡库抽卡", hint: "勾上（默认）：每日商店与随机抽卡会把你的 DIY 卡混进池子；关掉只用真实卡库。" },
    { group: "查询内容", type: "number", key: "maxResults", label: "搜索结果上限", hint: "模糊搜索最多返回几条（1-50，默认 5）。", min: 1, max: 50 },
    { group: "玩法", type: "number", key: "packSize", label: "每包抽几张", hint: "开卡包/随机抽卡每次抽几张（1-20，默认 5）。", min: 1, max: 20 },
    { group: "玩法", type: "number", key: "packMinSize", label: "卡池下限（几张以下不当作卡包）", hint: "卡池太小的包会被跳过（1-300，默认 20）。", min: 1, max: 300 },
    { group: "玩法", type: "number", key: "handRuns", label: "起手模拟次数", hint: "起手模拟默认跑几次（1-200，默认 1）。", min: 1, max: 200 },
    { group: "玩法", type: "button", key: "deckValidate", label: "校验聊天里的卡组", action: "deckValidate" },
    { group: "玩法", type: "button", key: "deckHand", label: "起手模拟（聊天里的卡组）", action: "deckHand" },
    { group: "玩法", type: "button", key: "deckImage", label: "卡组展示图（聊天里的卡组）", action: "deckImage" },
    { group: "玩法", type: "check", key: "poolSynchro", label: "抽卡卡池：包含同调", hint: "关掉后随机抽卡不会抽到同调怪兽。" },
    { group: "玩法", type: "check", key: "poolXyz", label: "抽卡卡池：包含超量", hint: "关掉后不会抽到超量怪兽。" },
    { group: "玩法", type: "check", key: "poolPendulum", label: "抽卡卡池：包含灵摆", hint: "关掉后不会抽到灵摆怪兽。" },
    { group: "玩法", type: "check", key: "poolLink", label: "抽卡卡池：包含连接", hint: "关掉后不会抽到连接怪兽。" },
    { group: "玩法", type: "button", key: "diyNew", label: "＋ 新建 DIY 卡（图形编辑器）", action: "diyNew" },
    { group: "玩法", type: "button", key: "diyList", label: "我的 DIY 卡（图形列表）", action: "diyList" },
    { group: "玩法", type: "select", key: "diyFrameMode", label: "DIY 卡面渲染方式", hint: "css＝自绘卡面（默认，永远可用）；real＝真实卡框 PNG（素材已内置；某张加载失败会自动回退 css）。", options: [["css", "自绘卡面（css）"], ["real", "真实卡框 PNG（real）"]] },
    { group: "玩法", type: "button", key: "diyCheckAssets", label: "检查卡框素材", action: "diyCheckAssets" },
    { group: "玩法", type: "select", key: "diyFrameMode", label: "DIY 卡框模式", options: ["real", "css"], optionLabels: ["真卡框（素材）", "自绘（简版）"], hint: "real＝用 assets/yugioh 的真卡框；css＝简版自绘" },
    { group: "联动", type: "check", key: "vrmReaction", label: "抽到稀有卡时让 VRM 角色做表情（需装 VRM 扩展）" },
    { group: "联动", type: "check", key: "webSearchFallback", label: "本地查不到时用网络搜索（需装 Web Search 扩展）" },
    { group: "日志", type: "check", key: "logVerbose", label: "详细日志" },
    { group: "日志", type: "button", key: "logView", label: "查看日志", action: "logView" },
    { group: "查看", type: "button", key: "viewCard", label: "查卡（图形视图，弹出输入框用命令更快）", action: "viewCard" },
    { group: "查看", type: "button", key: "viewCollection", label: "📖 收藏册", action: "viewCollection" },
    { group: "查看", type: "button", key: "viewShop", label: "🏪 每日商店", action: "viewShop" },
    { group: "查看", type: "button", key: "viewBoard", label: "⚔️ 决斗盘", action: "viewBoard" },
    { group: "查看", type: "button", key: "viewRecap", label: "📜 本局卡表", action: "viewRecap" },
    { group: "维护", type: "button", key: "clearCache", label: "清空缓存（含持久缓存）", action: "clearCache" },
    { group: "维护", type: "button", key: "dbImport", label: "📥 安装数据库（手动选文件）", action: "dbImport", hint: "v1 模式：把 卡名索引/卡表/字段表/异画索引 装进 IndexedDB，装了就不依赖 data/ 目录。" },
    { group: "维护", type: "button", key: "dbImportUrl", label: "🔗 从 URL 安装数据库", action: "dbImportUrl", hint: "给一个目录地址（以 / 结尾）或单个文件地址。" },
    { group: "维护", type: "button", key: "dbTest", label: "🧪 测试数据库", action: "dbTest", hint: "报告 4 个库各读到多少、来源是手动安装还是随包文件，并真查一张卡。" },
    { group: "维护", type: "button", key: "dbUninstall", label: "🗑 卸载手动安装的数据库", action: "dbUninstall", hint: "清掉 IndexedDB 里手动装的那份，回到随包 data/。" },
    { group: "维护", type: "button", key: "cacheInfo", label: "查看缓存状态", action: "cacheInfo" },
    { group: "日志", type: "check", key: "logEnabled", label: "启用日志" },
    { group: "日志", type: "check", key: "logToast", label: "注入时弹提示", hint: "每次自动注入都会弹一个小提示，便于确认是否生效。" },
    { group: "日志", type: "check", key: "stripCitations", label: "自动去掉回复里的 [^1] 类引用标记", hint: "模型看到资料常自己加脚注，这里可以自动清理。" },
    { group: "日志", type: "check", key: "resultPopup", label: "结果用弹窗面板显示" },
    { group: "日志", type: "check", key: "resultInject", label: "结果同时注入提示词" },
    { group: "栏目隔离", type: "check", key: "isolateCommand", label: "仅指令触发（总隔离）", hint: "勾上后只有 /ygo… 指令生效：自动检测卡名、自然语言触发词（开一包 / 购买 / 决斗盘…）全部不做。指令与酒馆助手的指令按钮不受影响。" },
    { group: "栏目隔离", type: "note", key: "isolateNote", label: "下面每一项可以单独停用一个栏目的自动行为（指令仍然可用）：" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:自动检测注入", label: "停用「自动检测注入」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:提示词", label: "停用「提示词」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:查询内容", label: "停用「查询内容」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:外部接口", label: "停用「外部接口」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:玩法", label: "停用「玩法」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:联动", label: "停用「联动」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:日志", label: "停用「日志」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:查看", label: "停用「查看」栏目" },

];

export const ISOLATION_GROUPS = ["自动检测注入", "提示词", "查询内容", "外部接口", "玩法", "联动", "日志", "查看"];
export const GROUP_KEY_PREFIX = "groupsDisabled:";

export function fieldId(key) { return "ygo2_" + key; }

/** 连接列表提供者（由入口注入，避免界面层直接依赖外部接口模块） */
let listExternalProfiles = null;
let getApiModels = null;
/** 识别严格程度：strict 最严格（只认完整卡名）/ normal 适中 / loose 宽松。面板、脚本、对外接口共用。 */
export function applyStrictness(level) {
    const map = { strict: "最严格：只认完整卡名（名字有没有空格都认）", normal: "适中：允许够具体的名字片段", loose: "宽松：尽量多命中（可能误报）" };
    const key = String(level || "").trim().toLowerCase();
    const value = (key === "strict" || key === "最严格" || key === "3") ? "strict" : (key === "loose" || key === "宽松" || key === "1") ? "loose" : "normal";
    settings.set("detectStrictness", value);
    const text = "识别严格程度 = " + value + "（" + map[value] + "）";
    try { log("面板", text); } catch (error) { /* 忽略 */ }
    return text;
}

export function registerStrictnessAction() {
    registry.provide("runAction:strictness", async function (args) { return applyStrictness((args && (args.level || args.value)) || "normal"); });
    registry.provide("strictness:get", async function () { return String(settings.get("detectStrictness") || "normal"); });
    log("面板", "识别严格程度动作已注册（runAction:strictness）");
}
export function configure(options) {
    if (options && typeof options.listExternalProfiles === "function") listExternalProfiles = options.listExternalProfiles;
    if (options && typeof options.getApiModels === "function") getApiModels = options.getApiModels;
}

/** 控件值读取（处理 groupsDisabled:<栏目> 这类合成键） */
export function readFieldValue(key, values) {
    const v = values || {};
    if (String(key).indexOf(GROUP_KEY_PREFIX) === 0) {
        const name = String(key).slice(GROUP_KEY_PREFIX.length);
        return Array.isArray(v.groupsDisabled) && v.groupsDisabled.indexOf(name) >= 0;
    }
    return v[key];
}

/** 控件值写入（合成键写回数组） */
export function writeFieldValue(key, value) {
    if (String(key).indexOf(GROUP_KEY_PREFIX) === 0) {
        const name = String(key).slice(GROUP_KEY_PREFIX.length);
        const cur = settings.get("groupsDisabled");
        const list = Array.isArray(cur) ? cur.slice() : [];
        const has = list.indexOf(name) >= 0;
        if (value && !has) list.push(name);
        if (!value && has) list.splice(list.indexOf(name), 1);
        settings.set("groupsDisabled", list);
        return list;
    }
    settings.set(key, value);
    return value;
}

/** DOM 守卫：无 document 的环境（Node 自检、无头客户端）不应抛错 */
function doc() { return typeof document !== "undefined" ? document : null; }

/**
 * 等待宿主元素出现。
 * 为什么需要：扩展模块可能在设置抽屉建好之前就被求值（v1 用 jQuery(ready) 规避，
 * 实测 v1 能正常显示、v2 首版界面空白就是这个原因）。
 * 这里用「DOM ready + 轮询」两步，且可注入以便测试。
 */
export async function waitForHost(options) {
    const o = options || {};
    const tries = Number(o.tries) || 40;
    const delay = Number(o.delay) || 250;
    const getHost = o.getHost || function () { const d = doc(); return d ? (d.getElementById("extensions_settings2") || d.getElementById("extensions_settings")) : null; };
    const sleep = o.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    // ① 先等 DOM ready（readyState=loading 时等 DOMContentLoaded）
    const d = doc();
    if (d && d.readyState === "loading" && typeof d.addEventListener === "function") {
        await new Promise(function (resolve) {
            const done = function () { resolve(); };
            d.addEventListener("DOMContentLoaded", done, { once: true });
            setTimeout(done, 3000);   // 兜底：3 秒后无论如何继续
        });
    }
    // ② 再轮询宿主元素
    for (let i = 0; i < tries; i++) {
        const host = getHost();
        if (host) return host;
        await sleep(delay);
    }
    return null;
}
export function groupNames() {
    const out = [];
    for (const f of FIELDS) if (out.indexOf(f.group) < 0) out.push(f.group);
    return out;
}

/** 纯函数：单个控件 → HTML。可在 Node 里单测，不需要 DOM。 */
/** 纯函数：取一个 select 的选项（静态 options 优先，其次 optionsProvider 实时取） */
export function optionListOf(f) {
    if (!f) return [];
    if (f.options && f.options.length) return f.options;
    if (typeof f.optionsProvider === "function") { try { return f.optionsProvider() || []; } catch (error) { return []; } }
    return [];
}

/** 重建某个下拉的选项（值保持当前选中；"拉取模型"之后必须调它，否则 DOM 还是旧的） */
export function refreshSelect(f) {
    const d = doc();
    if (!d || !f || f.type !== "select") return false;
    const el = d.getElementById(fieldId(f.key));
    if (!el) return false;
    const list = optionListOf(f);
    if (!list.length) return false;
    const keep = el.value !== undefined && el.value !== null && el.value !== "" ? String(el.value) : String(settings.get(f.key) === undefined ? "" : settings.get(f.key));
    el.innerHTML = list.map(function (pair) {
        const value = String(pair[0]);
        const label = String(pair[1]);
        return '<option value="' + value + '"' + (value === keep ? " selected" : "") + '>' + label + "</option>";
    }).join("");
    if (keep) { try { el.value = keep; } catch (error) { /* 忽略 */ } }
    return true;
}

/** 重建所有"动态选项"的下拉（拉取模型 / 连接列表变化后调用） */
export function refreshDynamicSelects() {
    let n = 0;
    for (const f of FIELDS) {
        if (f.type !== "select" || typeof f.optionsProvider !== "function") continue;
        if (refreshSelect(f)) n++;
    }
    return n;
}

export function renderControl(f, value) {
    const id = fieldId(f.key);
    const q = String.raw`"`;
    const attr = function (name, val) { return " " + name + "=" + q + String(val) + q; };
    const hint = f.hint ? '<div class="ygo2-hint">' + f.hint + '</div>' : "";
    const wrap = function (inner) { return '<div class="ygo2-field" data-key="' + f.key + '">' + inner + hint + '</div>'; };
    // 复选框：用酒馆自己的 checkbox_label 结构，天然跟随主题
    if (f.type === "check") {
        return wrap('<label class="checkbox_label ygo2-check" for="' + id + '">' +
            '<input type="checkbox"' + attr("id", id) + (value ? " checked" : "") + '>' +
            '<span>' + f.label + '</span></label>');
    }
    const label = '<label class="ygo2-label" for="' + id + '">' + f.label + '</label>';
    if (f.type === "select") {
        const optList = optionListOf(f);
        const opts = (optList || []).map(function (pair) {
            return '<option value=' + q + pair[0] + q + (String(value) === pair[0] ? " selected" : "") + '>' + pair[1] + '</option>';
        }).join("");
        return wrap(label + '<select class=' + q + 'text_pole ygo2-select' + q + attr("id", id) + '>' + opts + '</select>');
    }
    if (f.type === "number") {
        let attrs = "";
        if (f.min !== undefined) attrs += attr("min", f.min);
        if (f.max !== undefined) attrs += attr("max", f.max);
        if (f.step !== undefined) attrs += attr("step", f.step);
        return wrap(label + '<input type=' + q + 'number' + q + ' class=' + q + 'text_pole ygo2-input' + q + attr("id", id) + attr("value", value === undefined ? "" : value) + attrs + '>');
    }
    if (f.type === "textarea") {
        return wrap(label + '<textarea class=' + q + 'text_pole ygo2-textarea' + q + attr("id", id) + attr("rows", 3) + '>' + String(value === undefined ? "" : value) + '</textarea>');
    }
    if (f.type === "password") {
        return wrap(label + '<input type=' + q + 'password' + q + ' class=' + q + 'text_pole ygo2-input' + q + attr("id", id) + attr("value", value === undefined ? "" : value) + ' autocomplete=' + q + 'off' + q + '>');
    }
    if (f.type === "text") {
        return wrap(label + '<input type=' + q + 'text' + q + ' class=' + q + 'text_pole ygo2-input' + q + attr("id", id) + attr("value", value === undefined ? "" : value) + ' autocomplete=' + q + 'off' + q + '>');
    }
    if (f.type === "note") {
        return '<div class="ygo2-note">' + f.label + '</div>';
    }
    if (f.type === "button") {
        return wrap('<div class=' + q + 'menu_button ygo2-button' + q + attr("id", id) + attr("data-action", f.action || f.key) + '>' + f.label + '</div>');
    }
    return wrap('<!-- 未知控件类型：' + f.type + ' -->');
}

/** 纯函数：按注册表渲染全部分组（每组一个 details）。 */
export function renderGroups(values) {
    const v = values || {};
    const folds = v.uiFolds || {};
    const q = String.raw`"`;
    return groupNames().map(function (group) {
        const open = folds[group] !== false ? " open" : "";
        const body = FIELDS.filter(function (f) { return f.group === group; }).map(function (f) { return renderControl(f, readFieldValue(f.key, v)); }).join("\n");
        return "<details class=" + q + "ygo2-fold" + q + open + "><summary>" + group + "</summary><div class=" + q + "ygo2-fold-body" + q + ">" + body + "</div></details>";
    }).join("\n");
}

/** 纯函数：注册表自检（Node 里可跑：key 拼错、类型非法、id 前缀、缺 options）。 */
export function registryProblems() {
    const problems = [];
    const valid = ["check", "select", "number", "text", "password", "textarea", "button", "note"];
    for (const f of FIELDS) {
        if (valid.indexOf(f.type) < 0) problems.push(f.key + " 类型非法：" + f.type);
        if (!f.key && f.type !== "note") problems.push("缺少 key（group=" + f.group + "）");
        if (!f.label) problems.push((f.key || f.type) + " 缺少 label");
        if (f.type !== "button" && f.type !== "note" && f.key && String(f.key).indexOf(GROUP_KEY_PREFIX) !== 0 && !(f.key in DEFAULTS)) problems.push(f.key + " 不在 DEFAULTS 里");   // groupsDisabled:<栏目> 是合成键，写回数组，不在 DEFAULTS
        if (f.key && fieldId(f.key).indexOf("ygo2_") !== 0) problems.push(f.key + " id 前缀不对");
        if (f.type === "select" && !(f.options || []).length && typeof f.optionsProvider !== "function") problems.push(f.key + " 缺少 options");
    }
    return problems;
}

/** 取不到 settings.html 时用的内联外壳（保证面板一定能挂上） */
export const INLINE_SHELL = [
    '<div id="ygo2_settings" class="ygo2-panel">',
    '  <div class="inline-drawer">',
    '    <div class="inline-drawer-toggle inline-drawer-header">',
    '      <b>游戏王查卡器 v2</b>',
    '      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>',
    '    </div>',
    '    <div class="inline-drawer-content"></div>',
    '  </div>',
    '</div>',
].join("\n");

async function loadPanelHtml() {
    try {
        const response = await fetch(ownBase() + "settings.html");
        if (response && response.ok) {
            const text = await response.text();
            // 防御：拿到的必须是 HTML 而不是别的（曾经出现过把非 HTML 当 HTML 用的坑）
            if (text && text.indexOf("ygo2_settings") >= 0) return text;
            log("面板", "settings.html 内容异常，改用内联外壳");
        } else {
            log("面板", "settings.html 读取失败 HTTP " + (response ? response.status : "?") + "，改用内联外壳");
        }
    } catch (error) {
        log("面板", "settings.html 读取异常（" + (error && error.message ? error.message : error) + "），改用内联外壳");
    }
    return INLINE_SHELL;
}

export function bindControl(f) {
    const d = doc();
    if (!d) return false;
    const el = d.getElementById(fieldId(f.key));
    if (!el) return false;
    // 动态下拉：展开/聚焦前先按最新数据重建选项（拉取模型后立刻能看到）
    if (f.type === "select" && typeof f.optionsProvider === "function") {
        el.addEventListener("mousedown", function () { refreshSelect(f); });
        el.addEventListener("focus", function () { refreshSelect(f); });
    }
    el.addEventListener("change", function () {
        let value;
        if (f.type === "check") value = !!el.checked;
        else if (f.type === "number") value = Math.max(f.min === undefined ? 0 : f.min, Number(el.value) || 0);
        else value = String(el.value);
        writeFieldValue(f.key, value);
    });
    return true;
}

/** 按钮结果的统一出口：无论走哪条路，用户都一定能看到东西（这是"按了没反应"的根因） */
export async function showActionFeedback(field, out) {
    const text = typeof out === "string" ? out : (out && typeof out.text === "string" ? out.text : "");
    const key = (field && (field.label || field.key)) || "按钮";
    if (!text) { log("面板", key + "：执行完毕（无输出）"); toast("「" + key + "」执行完毕（无输出）"); return ""; }
    log("面板", key + " → " + text.slice(0, 200));
    try {
        const c = (typeof SillyTavern !== "undefined" && SillyTavern.getContext) ? SillyTavern.getContext() : null;
        if (settings.get("resultPopup") !== false && c && typeof c.callGenericPopup === "function") {
            const types = c.POPUP_TYPE || {};
            await c.callGenericPopup(buildFeedbackHtml(key, text), types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "关闭" });
            return text;
        }
    } catch (error) { log("面板", key + " 弹窗失败，改用提示：" + (error && error.message ? error.message : error)); }
    toast(text.length > 220 ? text.slice(0, 220) + "…（完整内容见「日志」）" : text);
    return text;
}

/** 纯函数：按钮结果的弹窗 HTML（自己转义） */
export function buildFeedbackHtml(title, text) {
    const esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
    return '<div class="ygo2-view"><div class="ygo2-view-head">' + esc(title) + '</div><pre class="ygo2-feedback">' + esc(text) + '</pre></div>';
}

function toast(msg) {
    try {
        const c = (typeof SillyTavern !== "undefined" && SillyTavern.getContext) ? SillyTavern.getContext() : null;
        const t = (c && c.toastr) || (typeof toastr !== "undefined" ? toastr : null);
        if (t && typeof t.info === "function") t.info(String(msg), "查卡器 v2", { timeOut: 5000 });
    } catch (error) { /* 没有提示组件也没关系，日志里一定有 */ }
}

export function bindActions(actions) {
    let bound = 0;
    const d = doc();
    if (!d) return 0;
    for (const f of FIELDS) {
        if (f.type !== "button") continue;
        const el = d.getElementById(fieldId(f.key));
        const fn = actions ? actions[f.action || f.key] : null;
        if (!el || typeof fn !== "function") continue;
        el.addEventListener("click", async function () {
            const label = el.textContent;
            el.textContent = "处理中…";
            el.style.opacity = "0.7";
            try { await showActionFeedback(f, await fn()); }
            catch (error) { await showActionFeedback(f, "❌ 执行失败：" + (error && error.message ? error.message : error)); }
            finally { el.textContent = label; el.style.opacity = ""; }
        });
        bound++;
    }
    return bound;
}

export async function mountPanel(actions) {
    const d = doc();
    if (!d) { log("面板", "当前环境没有 DOM，跳过挂载（不影响命令与工具）"); return false; }
    if (d.getElementById("ygo2_settings")) { log("面板", "面板已存在，跳过重复挂载"); return true; }
    const host = await waitForHost({});
    if (!host) { log("面板", "等了 10 秒仍未找到设置抽屉宿主（extensions_settings2 / extensions_settings），跳过挂载"); return false; }
    if (d.getElementById("ygo2_settings")) return true;
    try {
        const shell = await loadPanelHtml();
        host.insertAdjacentHTML("beforeend", shell);
        const content = d.querySelector("#ygo2_settings .inline-drawer-content");
        if (!content) { log("面板", "settings.html 结构不对（缺 inline-drawer-content）"); return false; }
        content.innerHTML = renderGroups(settings.all());
        let bound = 0;
        for (const f of FIELDS) if (f.type !== "button" && bindControl(f)) bound++;
        const actionCount = bindActions(actions);
        log("面板", "已挂载 " + FIELDS.length + " 个控件（绑定 " + bound + "，按钮 " + actionCount + "）");
        emit("panel", { fields: FIELDS.length, bound: bound, actions: actionCount });
        return true;
    } catch (error) {
        console.error("[YGO2] 面板挂载失败", error);
        log("面板", "挂载失败：" + (error && error.message ? error.message : error));
        return false;
    }
}

export const panel = { applyStrictness, registerStrictnessAction, configure, optionListOf, refreshSelect, refreshDynamicSelects, showActionFeedback, buildFeedbackHtml, FIELDS, waitForHost, INLINE_SHELL, groupNames, fieldId, renderControl, renderGroups, registryProblems, mountPanel, bindControl, bindActions };
