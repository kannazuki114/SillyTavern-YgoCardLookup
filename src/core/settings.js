import { ctx, log, emit } from "./bus.js";

export const KEY = "ygo-card-lookup-v2";

/** 全部设置项集中在此。新增选项必须同时给默认值，避免运行期出现 undefined。 */
export const DEFAULTS = {
    enabled: true,             // 是否注册 function tool（AI 可主动调用）
    interceptEnabled: true,
    triggerMode: "full",
    detectBrackets: true,
    detectPasscode: true,
    detectWholeMessage: true,
    capabilityHint: true,
    bodyEditMode: "off",          // 发送体改写：off 不动 / append 把识别到的卡片资料追加到最后一条玩家消息（官方 CHAT_COMPLETION_PROMPT_READY 钩子）
    injectLayers: "full",         // 注入分层：minimal 只给打牌要用的 / normal 加字段与禁限 / full 再加发售、补充说明与裁定
    injectNote: "",
    injectNotePosition: "tail",   // 附注位置：tail 跟在卡片资料后（默认）/ head 放在整块最前
    promptSheet: "",
    promptJudge: "",
    injectPosition: "chat",     // chat（聊天内，官方 /inject position=chat）/ before / after
    injectDepth: 4,             // 官方默认深度 4：0=最后一条消息之后，1=之前，依此类推
    vrmReaction: false,        // 抽到稀有卡时让 VRM 角色做表情（需装 VRM 扩展）
    webSearchFallback: false,  // 本地查不到时用 /websearch 联网（需装 Web Search 扩展）
    skipQuiet: true,            // 摘要等 quiet 生成不注入（官方 type 参数给出生成来源）
    injectionFallback: true,      // v1 的「拦截器不生效时改用事件兜底注入」：宿主不支持 generate_interceptor 时，在 MESSAGE_SENT 用同一拦截器补一次
    injectBudget: 2500,
    scanScope: "last_user",
    scanDepth: 3,                  // v1 的「扫描深度」：连最近几条消息一起看（1-20）
    includeImage: true,
    includeField: true,
    includeRelease: true,
    includeBanlist: true,
    includeSupplement: true,
    includeFaq: false,
    banlistRegion: "cn",
    maxResults: 5,
    apiEnabled: true,          // 想彻底不打扰就关掉它；默认开，但 auto 只在检测到可用通道时才发请求
    apiFollowMain: true,        // v1 的「跟随酒馆主连接」：地址与模型实时取自主连接，下面填的仅作备用
    apiMode: "auto",            // 默认自动：有哪条通道就用哪条（v1 的"跟随主连接"就是这个意思）
    apiProfile: "",              // 副 API 用哪条连接（空＝第一条）
    apiBudget: 8000,             // 外部处理预算毫秒（超时就不等）
    apiMaxTokens: 65535,         // 副 API 最大输出（默认 65535；个别网关有上限，被拒时调小）
    apiWebhookReplace: false,      // v1 的「回写时丢弃插件原始数据」：只给 AI 外部结果，去掉本地卡面
    apiNonBlocking: true,
    apiUrl: "",
    apiKey: "",
    apiModel: "",               // 选中的模型（下拉里选；选「手动填写」时用 apiModelManual）
    apiModelManual: "",         // 手动填写的模型名
    apiModels: [],
    apiViaServer: true,         // 先试服务端路由，失败自动直连（TauriTavern 里通常只有直连可用）              // 「拉取模型」拉回来的列表（供下拉使用）
    apiInstruction: "",
    apiExternalAiOwnSearch: false,  // 默认关：本地检索与外部结果【并存】。勾上则整句直接交给外部 AI（本地卡面不再注入，卡图仍会送）
    packRegion: "sc",
    packSize: 5,
    packMinSize: 20,
    shopSize: 5,
    shopIncludeDiy: true,
    handDraw: 5,
    handRuns: 1,
    handImages: true,
    poolSynchro: true,
    poolXyz: true,
    poolPendulum: true,
    poolLink: true,
    stripCitations: true,
    logVerbose: false,
    detectFreeText: true,
    detectStrictness: "normal",   // 识别严格程度：strict 只认完整卡名 / normal 适中 / loose 宽松      // 自由文本里的卡名（用本地卡名索引）
    naturalCommands: true,     // 自然语言触发词
    duelBoard: true,           // 盘面内容进入提示词
    useYgoprodeck: true,       // 允许访问 db.ygoprodeck.com（异画/英文名）
    resultPopup: true,         // 结果用弹窗面板显示
    resultInject: false,       // 结果同时注入提示词
    logEnabled: true,          // 启用日志
    logToast: false,           // 注入时弹提示
    cardImgMax: 360,
    summonAutoApply: true,       // 召唤检查通过时自动落到决斗盘（祭品送墓、怪兽上场、用掉本回合通招）
    isolateCommand: false,      // 隔离：勾上后只有指令（/ygo…）触发，一切自动检测/自然语言触发都不生效
    groupsDisabled: [],         // 栏目隔离：列在这里的栏目整体停用（自动检测注入/提示词/查询内容/外部接口/玩法/联动/日志/查看）
    diyFrameMode: "real",        // DIY 卡面：css 自绘 / real 真实卡框 WebP（素材在 assets/yugioh/）
    diyFrameBase: "",           // 自定义卡框目录（留空＝用自带素材）           // 聊天里卡图最大宽度（像素）
    collection: {},
    collectionTotal: 0,
    collectionRecent: [],
    diyCards: [],
    aliases: "",                    // 俗称表：默认空（自己去面板填，格式「俗称=官方名」每行一条，# 开头是注释）。曾经默认写「白龙=青眼」，会把用户的「白龙」悄悄改成「青眼」
    uiFolds: {},
};

/** 旧版(v1)设置迁移：五个外部开关合成一个 apiMode，其余按名搬运。 */
export function migrate(raw) {
    const out = Object.assign({}, DEFAULTS, raw || {});
    if (raw && raw.apiMode === undefined) {
        const rt = raw.apiWebhookRoundtrip === true;
        // 旧版本的收件箱模式已移除：v1 里选了 inbox/both 的用户统一归到 roundtrip（往返），避免留下无效值
        const inbox = raw.apiInboxEnabled === true;
        out.apiMode = (rt || inbox) ? "roundtrip" : (raw.apiWebhook || raw.apiUrl) ? "push" : "local";
    out.apiUrl = raw.apiUrl || raw.apiWebhook || "";
        out.apiKey = raw.apiKey || raw.apiWebhookKey || "";
        out.apiModel = raw.apiModel || raw.apiExternalModel || "";
    if (raw.apiFollowMain !== undefined) out.apiFollowMain = raw.apiFollowMain !== false;   // v1 同名开关直接搬
    if (raw.apiViaTavernProxy !== undefined) out.apiViaServer = raw.apiViaTavernProxy !== false;
        out.triggerMode = raw.triggerMode || (raw.commandOnly === true ? "command" : raw.detectFreeText === false ? "keyword" : "full");
    }

    // 无条件规范化：v1 存盘里可能就是 local/push/roundtrip（有值时上面整块会被跳过，所以必须放在最后）
    const MODE_WHITELIST = ["off", "auto", "url", "secondary", "secondary-then-main", "main", "ttmain", "route", "direct"];   // direct = 客户端直连（tt 用这个）
    if (out.apiMode === "local" || out.apiMode === "push") out.apiMode = "off";
    if (out.apiMode === "roundtrip" || out.apiMode === "inbox" || out.apiMode === "both") out.apiMode = "secondary-then-main";
    if (out.apiMode === "url" || out.apiMode === "route" || out.apiMode === "direct" || out.apiMode === "push") out.apiMode = "route";   // 三个自填地址写法统一成 route（内部会自动服务端→直连）
    if (MODE_WHITELIST.indexOf(String(out.apiMode)) < 0) out.apiMode = "off";

    return out;
}

let cache = null;
let storeFallback = null;   // 宿主没给 extensionSettings 时的持久兜底（避免"写完就丢"）
function store() {
    const c = ctx();
    if (c && c.extensionSettings && typeof c.extensionSettings === "object") return c.extensionSettings;
    if (!storeFallback) {
        storeFallback = {};
        log("设置", "宿主 context 里没有 extensionSettings，已启用内存兜底（仅本次会话有效）");
    }
    return storeFallback;
}

export function read() { return migrate(store()[KEY]); }
export function get(key) { if (!cache) cache = read(); return key ? cache[key] : cache; }
export function all() { return get(); }
export function reload() { cache = read(); return cache; }
export function save(patch) {
    const next = Object.assign({}, read(), patch || {});
    store()[KEY] = next;
    cache = next;
    const c = ctx();
    if (typeof c.saveSettingsDebounced === "function") c.saveSettingsDebounced();
    emit("settings", cache);
    return cache;
}
export function set(key, value) { const patch = {}; patch[key] = value; return save(patch); }

/** 总隔离：只看指令触发（不改动用户自己的其它设置，只在读取时生效） */
export function isolationActive() { return get("isolateCommand") === true; }

/** 栏目是否启用（栏目隔离） */
export function groupEnabled(name) {
    if (isolationActive()) {
        // 总隔离下：只有「查询内容」与「查看」这些"看结果"的栏目还允许自动动作，其余自动行为一律停
        if (name === "自动检测注入" || name === "玩法" || name === "联动" || name === "外部接口") return false;
    }
    const off = get("groupsDisabled");
    return !(Array.isArray(off) && off.indexOf(name) >= 0);
}

/** 供界面层判断"这个动作属于哪个栏目"（触发词/命令共用） */
export const ACTION_GROUP = {
    card: "查询内容", search: "查询内容", rule: "查询内容", ruling: "查询内容", banlist: "查询内容", series: "查询内容", art: "查询内容", alias: "查询内容", recap: "查询内容",
    pack: "玩法", packlist: "玩法", packsearch: "玩法", draw: "玩法", shop: "玩法", buy: "玩法", deck: "玩法", deckimage: "玩法", hand: "玩法", summon: "玩法", collection: "玩法", album: "玩法", board: "玩法", duel: "玩法", diy: "玩法",
    log: "日志", selftest: "日志",
};
export function actionGroup(action) { return ACTION_GROUP[String(action || "")] || ""; }
export function actionAllowed(action, source) {
    const g = actionGroup(action);
    if (!g) return true;
    // 用户指令仍遵循显式栏目停用，但不受自动触发总隔离影响。
    if (source === "command") {
        const off = get("groupsDisabled");
        return !(Array.isArray(off) && off.indexOf(g) >= 0);
    }
    return groupEnabled(g);
}

export const settings = {
    KEY: KEY,
    DEFAULTS: DEFAULTS,
    migrate: migrate,
    load: async function () { reload(); log("启动", "设置已载入（" + Object.keys(cache).length + " 项）"); return cache; },
    get: get,
    all: all,
    set: set,
    save: save,
    reload: reload,
    isolationActive: isolationActive,
    groupEnabled: groupEnabled,
    actionGroup: actionGroup,
    actionAllowed: actionAllowed,
    ACTION_GROUP: ACTION_GROUP,
};
