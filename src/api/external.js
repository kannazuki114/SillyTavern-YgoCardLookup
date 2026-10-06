import { ctx, log } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { registry } from "../core/registry.js";

/** ── 统一模板（外部接口模块）：常量 → 纯函数 → 三条通道 → 降级链 → register → exports ── */

/** 1) 常量：模式与默认值 */
/** 输出 token 上限（面板可设的最大值） */
export const MAX_TOKENS_CEILING = 65535;

/** 归一"最大输出 token"（纯函数）：空/0/非数字 → fallback(800)；<64 → 64；>65535 → 65535 */
export function clampMaxTokens(value, fallback) {
    const n = Number(value);
    const base = (Number.isFinite(n) && n > 0) ? n : (Number(fallback) || 800);
    return Math.max(64, Math.min(MAX_TOKENS_CEILING, Math.floor(base)));
}

export const MODES = [
    { key: "auto", label: "自动（推荐：有哪条用哪条）" },
    { key: "off", label: "关闭（只用本地数据）" },
    { key: "ttmain", label: "tt 主连接（用当前主模型）" },
    { key: "main", label: "酒馆助手（generateRaw）" },
    { key: "route", label: "自填地址（内部先服务端路由、再客户端直连）" },
];
export const ROUTE_GENERATE = "/api/backends/chat-completions/generate";
export const ROUTE_STATUS = "/api/backends/chat-completions/status";
export const MANUAL_MODEL = "__manual__";
export const DEFAULT_TIMEOUT = 30000;
export const BREAK_THRESHOLD = 3;      // 连续失败几次就熔断
export const BREAK_COOLDOWN = 60000;   // 熔断冷却毫秒

/** 纯函数：路由请求体。
 *  实测官方源码（src/endpoints/backends/chat-completions.js）：
 *   - custom 源的密钥取自服务器设置（SECRET_KEYS.CUSTOM），请求里带的 proxy_password 会被忽略；
 *   - openai 源支持 reverse_proxy + proxy_password（用户自带地址与密钥）。
 *  所以"带密钥"时必须走 openai 源，否则鉴权一定失败。 */
/** 纯函数：把用户填的地址归一成"base"（官方是 base + /chat/completions + /models，多填会拼错）
 *  - 末尾斜杠去掉（否则会出现 //chat/completions）
 *  - 末尾的 /chat/completions 或 /completions 去掉（用户常直接贴整条端点）
 *  - 末尾的 /models 去掉（从"拉取模型"复制来的） */
/** v1 的 apiChatUrl 原样移植：把用户填的地址补成 <base>[/v1]/chat/completions
 *  v1（index.js:2249）实测可用：末尾去斜杠；没带 /chat/completions 就补；base 里没有 /v1 就插一个。 */
export function directChatUrl(base) {
    let u = String(base || "").trim().replace(/\/+$/, "");
    if (!u) return "";
    if (!/\/chat\/completions$/.test(u)) u += (u.indexOf("/v1") >= 0 ? "" : "/v1") + "/chat/completions";
    return u;
}

/** v1 的 apiModelsUrl 移植：优先 <base>/models，base 里已有 /v1 就只用它 */
export function directModelsUrls(base) {
    const b = String(base || "").trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
    if (!b) return [];
    return b.indexOf("/v1") >= 0 ? [b + "/models"] : [b + "/models", b + "/v1/models"];
}

/** 浏览器直连（不经过酒馆服务端）：v1 用的就是这条路，TauriTavern 里没有 /api/backends 也能用 */
export async function callDirect(args) {
    const a = args || {};
    const u = directChatUrl(a.baseUrl || settings.get("apiUrl"));
    if (!u) return { ok: false, via: "direct", error: "没有填写 API 地址" };
    const key = String(a.apiKey || settings.get("apiKey") || "").trim();
    const doFetch = (typeof fetch === "function") ? fetch : null;
    if (!doFetch) return { ok: false, via: "direct", error: "当前环境没有 fetch" };
    const headers = { "Content-Type": "application/json" };
    if (key) { headers["Authorization"] = "Bearer " + key; headers["X-API-Key"] = key; }
    const body = {
        model: String(a.model || effectiveModel() || "").trim() || "gpt-3.5-turbo",
        messages: a.messages || buildMessages(a.system, a.user),
        temperature: 0.3,
        max_tokens: clampMaxTokens(a.maxTokens || settings.get("apiMaxTokens")),
        stream: false,
    };
    try {
        const res = await withTimeout(doFetch(u, { method: "POST", headers: headers, body: JSON.stringify(body) }), a.timeoutMs || DEFAULT_TIMEOUT, "直连请求");
        const raw = String(await res.text().catch(function () { return ""; }));
        if (!res.ok) {
            log("外部", "直连 HTTP " + res.status + "：" + raw.slice(0, 150).replace(/\s+/g, " "));
            return { ok: false, via: "direct", error: "HTTP " + res.status + "：" + raw.slice(0, 200).replace(/\s+/g, " "), raw: raw };
        }
        let out = "";
        let fr = "";
        try {
            const data = JSON.parse(raw);
            fr = finishReasonOf(data);
            if (fr === "length") log("外部", "⚠️ 直连返回被截断（finish_reason=length，输出 token 用完）：建议调大「副 API 最大输出」，或换非推理模型");
            out = String((data && data.choices && data.choices[0] && ((data.choices[0].message && data.choices[0].message.content) || data.choices[0].text)) || "").trim();
        } catch (error) { out = raw.trim(); }
        if (!out) return { ok: false, via: "direct", error: "返回里没有内容", raw: raw };
        recordSuccess();
        log("外部", "直连返回 " + out.length + " 字");
        return { ok: true, via: "direct", text: out, raw: raw, finishReason: fr };
    } catch (error) {
        const msg = (error && error.message) ? error.message : String(error);
        recordFailure();
        log("外部", "直连失败：" + msg);
        return { ok: false, via: "direct", error: msg };
    }
}

/** 直连拉模型（v1 的浏览器分支）：逐条试，失败原因全部记下来 */
export async function fetchModelsDirect(args) {
    const a = args || {};
    const key = String(a.apiKey || settings.get("apiKey") || "").trim();
    const doFetch = (typeof fetch === "function") ? fetch : null;
    const tried = [];
    if (!doFetch) return { ok: false, error: "当前环境没有 fetch", models: [], tried: tried };
    for (const u of directModelsUrls(a.baseUrl || settings.get("apiUrl"))) {
        try {
            const res = await withTimeout(doFetch(u, { method: "GET", headers: key ? { "Authorization": "Bearer " + key } : {} }), a.timeoutMs || 15000, "直连拉模型");
            const raw = String(await res.text().catch(function () { return ""; }));
            tried.push("直连 " + u + " → HTTP " + res.status);
            if (res.status === 401 || res.status === 403) return { ok: false, error: "密钥被拒绝（HTTP " + res.status + "）", models: [], tried: tried };
            if (!res.ok) continue;
            const models = parseModelList(raw);
            if (models.length) return { ok: true, models: models, tried: tried, via: "direct", url: u };
            tried.push("（返回里没有模型列表）");
        } catch (error) {
            tried.push("直连 " + u + " → " + ((error && error.message) ? error.message : String(error)));
        }
    }
    return { ok: false, error: "直连也没拉到模型列表", models: [], tried: tried };
}

/** 纯函数：从任意返回体里挖模型名（v1 的三种形态都兼容） */
export function parseModelList(raw) {
    let data = null;
    try { data = JSON.parse(String(raw || "")); } catch (error) { return []; }
    const list = Array.isArray(data) ? data : ((data && (data.data || data.models)) || []);
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const m of list) { const id = String((m && (m.id || m.name || m.model)) || m || "").trim(); if (id && out.indexOf(id) < 0) out.push(id); }
    return out;
}

export function normalizeBaseUrl(url) {
    let u = String(url || "").trim();
    if (!u) return "";
    u = u.replace(/\/+$/, "");
    u = u.replace(/\/chat\/completions$/i, "");
    u = u.replace(/\/completions$/i, "");
    u = u.replace(/\/models$/i, "");
    return u.replace(/\/+$/, "");
}

/** 是否 TauriTavern 宿主（照抄参考插件 host-detect：窗口上挂 __TAURITAVERN__） */
export function isTauriTavern() {
    try {
        const g = globalThis;
        return Boolean(g.__TAURITAVERN__ || (g.window && g.window.__TAURITAVERN__));
    } catch (error) { return false; }
}

/** 参考插件（龙血玄黄·数据库 1.2.5）的**可用契约**：custom 源 + custom_url + 密钥放 custom_include_headers。
 *  实测要点（逐条对齐该插件 src/service/ai/api-call.ts:223/281-340）：
 *   - TT 与 ST 都走 chat_completion_source: "custom"（TT 下不认 openai+proxy_password 那套）；
 *   - 密钥不是 proxy_password，而是 custom_include_headers 里的 YAML 字符串 "Authorization: Bearer sk-…"；
 *   - TT 额外带 custom_api_format: "openai_compat"（四值契约之一），ST 不识别该字段；
 *   - 关掉联网/图片/推理与工具，避免被宿主的包装改写（tool_choice: "none"）。 */
export function buildRouteBody(args) {
    const a = args || {};
    const baseUrl = normalizeBaseUrl(a.baseUrl) || String(a.baseUrl || "").trim();
    const apiKey = String(a.apiKey || "").trim();
    const body = {
        messages: a.messages || buildMessages(a.system, a.user),
        model: String(a.model || "").trim() || "gpt-3.5-turbo",
        max_tokens: clampMaxTokens(a.maxTokens),
        temperature: 0.3,
        top_p: 0.9,
        stream: false,
        chat_completion_source: "custom",
        custom_url: baseUrl,
        custom_include_headers: apiKey ? ("Authorization: Bearer " + apiKey + String.fromCharCode(10) + "X-API-Key: " + apiKey) : "",
        reverse_proxy: baseUrl,
        proxy_password: "",
        group_names: [],
        include_reasoning: false,
        reasoning_effort: "medium",
        enable_web_search: false,
        request_images: false,
        tool_choice: "none",
    };
    if (isTauriTavern()) body.custom_api_format = "openai_compat";
    return body;
}

/** 旧写法（原版 SillyTavern 的 openai 源 + reverse_proxy + proxy_password）：ST 下作为第二尝试 */
export function buildRouteBodySTNative(args) {
    const a = args || {};
    const baseUrl = normalizeBaseUrl(a.baseUrl) || String(a.baseUrl || "").trim();
    const apiKey = String(a.apiKey || "").trim();
    const body = { model: String(a.model || "").trim() || "gpt-3.5-turbo", stream: false };
    body.chat_completion_source = "openai";
    body.reverse_proxy = baseUrl;
    if (apiKey) body.proxy_password = apiKey;
    if (a.messages) body.messages = a.messages;
    if (a.maxTokens) body.max_tokens = clampMaxTokens(a.maxTokens);
    return body;
}

/** 当前生效的模型名（下拉选了「手动填写」就用输入框里的） */
export function effectiveModel() {
    const picked = String(settings.get("apiModel") || "").trim();
    if (picked === MANUAL_MODEL) return String(settings.get("apiModelManual") || "").trim();
    return picked;
}

/** 2) 宿主 API 探测（一律做存在性检查，缺了不报错、只降级） */
export function hostApis() {
    const c = ctx() || {};
    const g = (typeof globalThis !== "undefined" ? globalThis : {});
    const th = g.TavernHelper || (c.TavernHelper || null);
    const cm = (c.ConnectionManagerRequestService) || (g.SillyTavern && g.SillyTavern.getContext ? (g.SillyTavern.getContext() || {}).ConnectionManagerRequestService : null) || null;
    const headers = typeof c.getRequestHeaders === "function" ? c.getRequestHeaders() : null;
    return { connectionManager: cm, tavernHelper: th, headers: headers, raw: c };
}
export function capabilityReport() {
    const h = hostApis();
    return {
        secondary: !!(h.connectionManager && typeof h.connectionManager.sendRequest === "function"),
        main: !!(h.tavernHelper && typeof h.tavernHelper.generateRaw === "function"),
        route: !!h.headers,
        profiles: listProfiles().length,
    };
}
/** 连接配置列表（官方：extensionSettings.connectionManager.profiles） */
export function listProfiles() {
    try {
        const c = ctx() || {};
        const list = c.extensionSettings && c.extensionSettings.connectionManager && c.extensionSettings.connectionManager.profiles;
        if (!Array.isArray(list)) return [];
        return list.map(function (p) { return { id: String(p.id || ""), name: String(p.name || p.id || ""), api: String(p.api || ""), model: String(p.model || "") }; }).filter(function (p) { return p.id; });
    } catch (error) { return []; }
}
/** 选连接：先按 id，再按名字（都不给则取第一条有效的） */
export function pickProfile(wanted) {
    const list = listProfiles();
    if (!list.length) return null;
    const w = String(wanted || "").trim();
    if (!w) return list[0];
    return list.filter(function (p) { return p.id === w; })[0] || list.filter(function (p) { return p.name === w; })[0] || list[0];
}

/** 3) 纯函数：消息组装（复用于三条通道） */
export function buildMessages(system, user) {
    const out = [];
    if (String(system || "").trim()) out.push({ role: "system", content: String(system) });
    out.push({ role: "user", content: String(user || "") });
    return out;
}
/** 从各种返回形态里取纯文本（TH 的 generateRaw 可能返回字符串或详情对象） */
/**
 * 从任意兼容响应里取 finish_reason（纯函数）。
 *   "stop" 正常说完；"length" **被输出 token 上限截断**（推理模型把预算花在思考上时很常见）。
 * 插件据此在注入里明确标注"这段被截断了"，不再把半句话当完整结果用。
 */
export function finishReasonOf(payload) {
    if (!payload || typeof payload !== "object") return "";
    if (Array.isArray(payload.choices) && payload.choices[0] && payload.choices[0].finish_reason) return String(payload.choices[0].finish_reason);
    if (typeof payload.finish_reason === "string") return payload.finish_reason;
    return "";
}

export function extractText(result) {
    if (result === undefined || result === null) return "";
    if (typeof result === "string") return result;
    if (typeof result === "object") {
        if (typeof result.content === "string") return result.content;
        if (typeof result.text === "string") return result.text;
        if (result.message && typeof result.message.content === "string") return result.message.content;
        if (Array.isArray(result.choices) && result.choices[0]) {
            const c0 = result.choices[0];
            if (c0.message && typeof c0.message.content === "string") return c0.message.content;
            if (typeof c0.text === "string") return c0.text;
        }
    }
    return String(result);
}
/** 纯函数：组装给外部模型的提问（卡面数据 + 玩家原话 + 自定义指令） */
/** 给外部 AI 的默认指令（字段读取 → 是不是卡的判定 → 强制用内置工具 → 固定输出格式） */
export const EXTERNAL_INSTRUCTION = "你是游戏王卡牌资料的检索与核对助手。插件（查卡器 v2）会把对话里识别出的**字段**交给你，并附上本地卡库已经取到的卡面资料。" +
    "\n" + "" +
    "\n" + "【第一步 · 读取字段】" +
    "\n" + "输入里的\"字段\"可能是：一条卡名、一个系列/字段名（如「天气」「白银城」「青眼」「黄金国」）、俗称、英文名、卡密；也可能是普通词语（场景描写、语气词、人名、地名、招式名）。请逐条处理，不要合并猜测。" +
    "\n" + "" +
    "\n" + "【第二步 · 先判定\"这是不是卡\"】" +
    "\n" + "· 卡：能对应到一张具体卡（卡名 / 英文名 / 俗称 / 卡密）→ 用工具取真值。" +
    "\n" + "· 系列/字段：对应一组卡 → 用 find_yugioh_series_cards。" +
    "\n" + "· 不是卡：日常词、拟声词、人名、地名、招式名等 → 直接忽略：不查、不贴卡图、不提卡牌。" +
    "\n" + "· 拿不准时按\"不是卡\"处理，并在输出里标注\"未确认\"。" +
    "\n" + "" +
    "\n" + "【第三步 · 必须用内置工具检索，不要凭记忆】" +
    "\n" + "· 单卡数值/效果/译名/卡密 → get_yugioh_card" +
    "\n" + "· 名字记不全/译名不确定 → search_yugioh_cards（先拿到完整名，再调 get_yugioh_card）" +
    "\n" + "· 卡图（可放进正文的 markdown 图片）→ get_yugioh_card_image" +
    "\n" + "· 官方裁定/FAQ、判定争议 → get_yugioh_ruling（比记忆可靠，优先用）" +
    "\n" + "· 这张卡的异画/版本 → get_yugioh_card_art；哪些卡有异画 → list_yugioh_alt_art_cards" +
    "\n" + "· 某系列/字段有哪些卡 → find_yugioh_series_cards" +
    "\n" + "· 禁限表 / 某卡是否被禁 → get_yugioh_banlist" +
    "\n" + "· 卡包 → open_yugioh_pack / list_yugioh_packs / search_yugioh_packs；随机抽卡 → draw_yugioh_card" +
    "\n" + "· 卡组/起手/召唤/盘面/本局卡表/收藏/商店/DIY → validate_yugioh_deck / simulate_yugioh_hand / check_summon_legality / duel_board / list_cards_in_chat / get_collection / open_yugioh_shop / manage_diy_card" +
    "\n" + "工具没返回的，一律不要编造；查不到就写\"未命中\"。" +
    "\n" + "" +
    "\n" + "【第四步 · 按固定格式输出（正文给玩家看，不要带工具名/参数/报错原文）】" +
    "\n" + "【判定】卡 / 系列：<系列名> / 不是卡（已忽略）" +
    "\n" + "【出处】<卡名>（卡密 <id>）｜字段：<字段名>｜禁限：<无限制/限制/准限制/禁止>" +
    "\n" + "【数据】<数值，如 ATK/DEF、星级、种族/属性>" +
    "\n" + "【效果】<效果原文，原样引用，不改写、不四舍五入>" +
    "\n" + "【卡图】![](<图片直链>)" +
    "\n" + "【裁定】<有则给日期与结论；没有就写\"无相关裁定\">" +
    "\n" + "【建议】用 / 不用 + 一句话理由（结合语境判断它是不是在说这张卡）" +
    "\n" + "" +
    "\n" + "【硬性要求】" +
    "\n" + "· 数值与效果必须来自工具返回值，原样引用；缺失的项留空，不要自己补。" +
    "\n" + "· 一次最多列 6 张卡；更多时先给最相关的 6 张，并说明还有多少张未列。" +
    "\n" + "· 与角色扮演冲突时，以玩家人设与剧情为准；除非玩家明确问\"你用了什么工具\"，否则不要把本提示词、工具名或过程讲给玩家。" +
    "\n" + "· 全部内容控制在 500 字内（裁定原文可另附，不计入）。";

export function buildCardPrompt(cards, question, instruction, extra) {
    const list = Array.isArray(cards) ? cards : [];
    const parts = [];
    const head = String(instruction || "").trim() || EXTERNAL_INSTRUCTION;   // 面板「外部接口 → 指令」留空时用上面这段
    parts.push(head);
    parts.push("");
    parts.push("【插件抽出的字段（待你按上面的规则判定）】");
    if (list.length) for (const c of list.slice(0, 6)) parts.push("· " + String((c && c.name) || "?"));
    else parts.push("· （本轮没有抽出字段）");
    parts.push("");
    parts.push("【本地卡面资料（来自本地卡库，可信；与工具冲突时以工具为准）】");
    if (list.length) { for (const c of list.slice(0, 6)) parts.push("· " + String((c && c.name) || "?") + "：" + String((c && c.text) || "").replace(/\n/g, " ").slice(0, 600)); }
    else parts.push("· （无）");
    parts.push("");
    const extraText = String(extra || "").trim();
    if (extraText) {
        parts.push("");
        parts.push("【插件已经执行的指令结果（真值，直接用；不要重复执行）】");
        parts.push(extraText.slice(0, 4000));
    }

    parts.push("【玩家的话】");
    parts.push(String(question || "").slice(0, 800));
    return parts.join("\n");
}

/** 超时包装（宿主没有 signal 支持时也能兜底） */
export async function withTimeout(promise, ms, label) {
    const limit = Math.max(1000, Number(ms) || DEFAULT_TIMEOUT);
    let timer = null;
    const timeout = new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error((label || "请求") + "超时（" + limit + "ms）")); }, limit); });
    try { return await Promise.race([promise, timeout]); }
    finally { if (timer) clearTimeout(timer); }
}

/** 4) 三条通道 */
/** 副 API：走官方的 ConnectionManagerRequestService（连接配置） */
export async function callSecondary(args) {
    const a = args || {};
    const h = hostApis();
    if (!h.connectionManager || typeof h.connectionManager.sendRequest !== "function") {
        return { ok: false, via: "secondary", error: "副 API 不可用（没有 ConnectionManagerRequestService；请确认酒馆的「连接管理器」已启用）" };
    }
    const profile = pickProfile(a.profileId);
    if (!profile) return { ok: false, via: "secondary", error: "没有可用的连接配置（先在酒馆「连接管理器」里保存一条）" };
    try {
        const messages = a.messages || buildMessages(a.system, a.user);
        // 官方签名：sendRequest(profileId, prompt, maxTokens, custom, overridePayload)
        const result = await withTimeout(
            h.connectionManager.sendRequest(profile.id, messages, clampMaxTokens(a.maxTokens || settings.get("apiMaxTokens")), { extractData: true, includePreset: true, includeInstruct: true }),
            a.timeoutMs, "副 API");
        const text = extractText(result);
        if (!text.trim()) return { ok: false, via: "secondary", error: "副 API 返回空内容", profile: profile };
        log("外部", "副 API（" + profile.name + "）返回 " + text.length + " 字");
        return { ok: true, via: "secondary", text: text, profile: profile };
    } catch (error) {
        return { ok: false, via: "secondary", error: "副 API 失败：" + (error && error.message ? error.message : error), profile: profile };
    }
}

/** 主 API：酒馆助手的 generateRaw（官方签名见 JS-Slash-Runner 的 generate.d.ts） */
export async function callMain(args) {
    const a = args || {};
    const h = hostApis();
    if (!h.tavernHelper || typeof h.tavernHelper.generateRaw !== "function") {
        return { ok: false, via: "main", error: "主 API 不可用（没有酒馆助手的 generateRaw；请安装/启用 JS-Slash-Runner）" };
    }
    try {
        const ordered = [];
        if (String(a.system || "").trim()) ordered.push({ role: "system", content: String(a.system) });
        ordered.push({ role: "user", content: String(a.user || "") });
        const result = await withTimeout(
            h.tavernHelper.generateRaw({ ordered_prompts: ordered, should_stream: false, should_silence: true }),
            a.timeoutMs, "主 API");
        const text = extractText(result);
        if (!text.trim()) return { ok: false, via: "main", error: "主 API 返回空内容" };
        log("外部", "主 API（generateRaw）返回 " + text.length + " 字");
        return { ok: true, via: "main", text: text };
    } catch (error) {
        return { ok: false, via: "main", error: "主 API 失败：" + (error && error.message ? error.message : error) };
    }
}

/** 服务器路由：直接 POST 官方 /api/backends/chat-completions/generate（custom 源不要求 apiKey） */
/** 各通道当前是否可用（测试面板与「自动」模式共用同一套判定，避免两处不一致） */
export function channelAvailability() {
    let c = null;
    try { c = (typeof SillyTavern !== "undefined" && SillyTavern.getContext) ? SillyTavern.getContext() : null; } catch (error) { c = null; }
    const profiles = (c && c.extensionSettings && c.extensionSettings.connectionManager && c.extensionSettings.connectionManager.profiles) || [];
    const th = (typeof TavernHelper !== "undefined") ? TavernHelper : ((c && c.TavernHelper) || null);
    const tt = ttMainAvailable();
    const baseUrl = String(settings.get("apiUrl") || "").trim();
    const rows = [
        { key: "ttmain", name: "tt 主连接直发", can: tt.ok, why: tt.ok ? ("主连接源 " + (tt.source || "?") + "，模型 " + (tt.model || "（跟随宿主）")) : "宿主主连接不是 Chat Completion" },
        { key: "main", name: "酒馆助手 generateRaw", can: !!(th && typeof th.generateRaw === "function"), why: (th && typeof th.generateRaw === "function") ? "检测到 TavernHelper.generateRaw" : "没有检测到酒馆助手（JS-Slash-Runner）" },
        { key: "secondary", name: "连接配置（酒馆连接管理器）", can: profiles.length > 0, why: profiles.length ? (profiles.length + " 条：" + profiles.map(function (p) { return p.name || p.id; }).join("、")) : "没有保存任何连接配置" },
        { key: "route", name: "自填地址（服务端路由 → 失败自动直连）", can: !!baseUrl, why: baseUrl ? ("地址 " + baseUrl) : "没填接口地址" },
    ];
    return { rows: rows, available: rows.filter(function (r) { return r.can; }).map(function (r) { return r.key; }), tt: tt, profiles: profiles.length, baseUrl: baseUrl };
}

/** tt / 酒馆主连接是否可用于 Chat Completion 直发（照抄参考插件 ai-gateway.ts:114）。
 *  判定：宿主 mainApi === 'openai' 且存在 chatCompletionSettings。 */
export function ttMainAvailable() {
    try {
        const c = (typeof SillyTavern !== "undefined" && SillyTavern.getContext) ? SillyTavern.getContext() : null;
        return !!(c && c.mainApi === "openai" && c.chatCompletionSettings) ? { ok: true, source: String(c.chatCompletionSettings.chat_completion_source || ""), model: (typeof c.getChatCompletionModel === "function" ? c.getChatCompletionModel() : c.chatCompletionSettings.custom_model || "") } : { ok: false, source: "", model: "" };
    } catch (error) { return { ok: false, source: "", model: "" }; }
}

/** 这些源的 reverse_proxy/proxy_password 才被宿主采纳（照抄参考插件的同名白名单） */
export const MAIN_PROXY_SOURCES = ["claude", "openai", "mistralai", "makersuite", "vertexai", "deepseek", "xai"];

/** 纯函数：按宿主主连接设置组装请求体（照抄参考插件 sendMainApiChatCompletionRequest） */
export function buildTTMainBody(messages, oai, model, maxTokens) {
    const o = oai || {};
    const source = String(o.chat_completion_source || "");
    const body = {
        stream: false,
        messages: messages || [],
        model: model || undefined,
        chat_completion_source: source,
        max_tokens: clampMaxTokens(maxTokens || o.openai_max_tokens),
        temperature: Number.isFinite(Number(o.temp_openai)) ? Number(o.temp_openai) : undefined,
        top_p: Number.isFinite(Number(o.top_p_openai)) ? Number(o.top_p_openai) : undefined,
        custom_prompt_post_processing: o.custom_prompt_post_processing,
    };
    if (o.reverse_proxy && MAIN_PROXY_SOURCES.indexOf(source) >= 0) { body.reverse_proxy = o.reverse_proxy; body.proxy_password = o.proxy_password; }
    if (source === "custom") {
        body.custom_url = o.custom_url;
        body.custom_include_body = o.custom_include_body;
        body.custom_exclude_body = o.custom_exclude_body;
        body.custom_include_headers = o.custom_include_headers;
    }
    if (source === "claude") body.claude_use_sysprompt = o.claude_use_sysprompt;
    if (source === "makersuite" || source === "vertexai") body.use_makersuite_sysprompt = o.use_makersuite_sysprompt;
    return body;
}

/** 用宿主主连接直发生成端点（不需要任何"连接配置"，tt 里最省事的一条） */
export async function callTTMain(args) {
    const a = args || {};
    const av = ttMainAvailable();
    if (!av.ok) return { ok: false, via: "ttmain", error: "宿主主连接不是 Chat Completion（mainApi≠openai 或缺 chatCompletionSettings）" };
    const h = hostApis();
    if (!h.headers) return { ok: false, via: "ttmain", error: "拿不到请求头（getRequestHeaders 不可用）" };
    const doFetch = (typeof fetch === "function") ? fetch : null;
    if (!doFetch) return { ok: false, via: "ttmain", error: "当前环境没有 fetch" };
    let body = null;
    try {
        const c = SillyTavern.getContext();
        const oai = c.chatCompletionSettings || {};
        body = buildTTMainBody(a.messages || buildMessages(a.system, a.user), oai, av.model || a.model, a.maxTokens || settings.get("apiMaxTokens"));
        // 宿主有 ChatCompletionService.createRequestData 时用它归一（与宿主内部一致）
        const svc = c.ChatCompletionService;
        if (svc && typeof svc.createRequestData === "function") { try { body = Object.assign(svc.createRequestData.call(svc, body), { stream: false }); } catch (error) { /* 用原体 */ } }
        body.tool_choice = "none";
    } catch (error) { return { ok: false, via: "ttmain", error: "组装请求体失败：" + ((error && error.message) ? error.message : String(error)) }; }
    try {
        const res = await withTimeout(doFetch(ROUTE_GENERATE, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, h.headers), body: JSON.stringify(body) }), a.timeoutMs || DEFAULT_TIMEOUT, "主连接直发");
        const raw = await readBody(res);
        if (!res.ok) { const e = "HTTP " + res.status + "：" + String(raw).slice(0, 200).replace(/\s+/g, " "); recordFailure(); return { ok: false, via: "ttmain", error: e, raw: raw }; }
        let payload = null;
        try { payload = JSON.parse(raw); } catch (error) { payload = null; }
        const text = payload ? extractText(payload) : String(raw || "").trim();
        const fr = finishReasonOf(payload);
        if (fr === "length") log("外部", "⚠️ 返回被截断（finish_reason=length）：建议调大「副 API 最大输出」");
        if (!text) { recordFailure(); return { ok: false, via: "ttmain", error: "返回里没有内容", raw: raw }; }
        recordSuccess();
        log("外部", "主连接直发返回 " + text.length + " 字（源 " + body.chat_completion_source + "）");
        return { ok: true, via: "ttmain", text: text, raw: raw, source: body.chat_completion_source, finishReason: fr };
    } catch (error) {
        const msg = (error && error.message) ? error.message : String(error);
        recordFailure();
        return { ok: false, via: "ttmain", error: msg };
    }
}

export async function callRoute(args) {
    const a = args || {};
    const h = hostApis();
    if (!h.headers) return { ok: false, via: "route", error: "拿不到请求头（getRequestHeaders 不可用）" };
    const doFetch = (typeof fetch === "function") ? fetch : null;
    if (!doFetch) return { ok: false, via: "route", error: "当前环境没有 fetch" };
    const tries = [buildRouteBody({ baseUrl: a.baseUrl || settings.get("apiUrl"), apiKey: a.apiKey || settings.get("apiKey"), model: a.model || effectiveModel(), messages: a.messages || buildMessages(a.system, a.user), maxTokens: a.maxTokens || settings.get("apiMaxTokens") })];
    // 非 TT 时，再补一次原版 ST 的 openai 写法（两种源在不同宿主上各有支持）
    if (!isTauriTavern()) tries.push(buildRouteBodySTNative({ baseUrl: a.baseUrl || settings.get("apiUrl"), apiKey: a.apiKey || settings.get("apiKey"), model: a.model || effectiveModel(), messages: a.messages || buildMessages(a.system, a.user), maxTokens: a.maxTokens || settings.get("apiMaxTokens") }));
    const notes = [];
    for (const body of tries) {
        try {
            const res = await withTimeout(doFetch(ROUTE_GENERATE, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, h.headers), body: JSON.stringify(body) }), a.timeoutMs || DEFAULT_TIMEOUT, "服务器路由");
            const raw = await readBody(res);
            if (!res.ok) {
                notes.push(body.chat_completion_source + " → HTTP " + res.status + (raw ? "：" + raw.slice(0, 120).replace(/\s+/g, " ") : ""));
                continue;
            }
            // extractText 收对象：JSON 能解析就用解析结果，否则退回原文
            let payload = null;
            try { payload = JSON.parse(raw); } catch (error) { payload = null; }
            const text = payload ? extractText(payload) : String(raw || "").trim();
            const fr = finishReasonOf(payload);
            if (fr === "length") log("外部", "⚠️ 返回被截断（finish_reason=length）：建议调大「副 API 最大输出」");
            if (text.trim()) { recordSuccess(); log("外部", "路由（" + body.chat_completion_source + "）返回 " + text.length + " 字"); return { ok: true, via: "route", text: text, raw: raw, source: body.chat_completion_source , finishReason: fr }; }
            notes.push(body.chat_completion_source + " → 返回空内容");
        } catch (error) {
            notes.push(body.chat_completion_source + " → " + ((error && error.message) ? error.message : String(error)));
        }
    }
    recordFailure();
    return { ok: false, via: "route", error: "服务器路由失败：" + notes.join(" | "), tried: notes };
}

/** 兼容读取响应体：宿主给的 Response 可能只有 text() 或只有 json()（两边都试） */
export async function readBody(res) {
    if (!res) return "";
    if (typeof res.text === "function") {
        try { const t = String(await res.text()); if (t) return t; } catch (error) { /* 试 json */ }
    }
    if (typeof res.json === "function") {
        try { return JSON.stringify(await res.json()); } catch (error) { /* 放弃 */ }
    }
    return "";
}

/** 拉取模型列表：走官方 /status（与 /generate 同一套 source 规则），结果写进设置供面板下拉使用 */
export async function fetchModels(args) {
    const a = args || {};
    const tried = [];
    // ① 酒馆服务端路由（有才走；TauriTavern 里通常没有这个接口）
    if (settings.get("apiViaServer") !== false) {
        const h = hostApis();
        const baseUrl = normalizeBaseUrl(a.baseUrl || settings.get("apiUrl"));
        if (h.headers && baseUrl) {
            const body = buildRouteBody({ baseUrl: baseUrl, apiKey: a.apiKey || settings.get("apiKey"), model: "x" });
            delete body.stream;
            try {
                const doFetch = (typeof fetch === "function") ? fetch : null;
                if (doFetch) {
                    const res = await withTimeout(doFetch(ROUTE_STATUS, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, h.headers), body: JSON.stringify(body) }), a.timeoutMs || 15000, "服务端拉模型");
                    const raw = String(await res.text().catch(function () { return ""; }));
                    tried.push("服务端 " + baseUrl + " → HTTP " + res.status);
                    if (res.ok) {
                        const models = parseModelList(raw);
                        if (models.length) { settings.set("apiModels", models); log("外部", "服务端拉到 " + models.length + " 个模型"); return { ok: true, models: models, tried: tried, via: "server" }; }
                        tried.push("（服务端返回里没有模型列表）");
                    }
                }
            } catch (error) { tried.push("服务端失败：" + ((error && error.message) ? error.message : String(error))); }
        }
    }
    // ② 浏览器直连兜底（v1 的做法，tt 里靠这条）
    const direct = await fetchModelsDirect({ baseUrl: a.baseUrl, apiKey: a.apiKey, timeoutMs: a.timeoutMs });
    for (const t of (direct.tried || [])) tried.push(t);
    if (direct.ok) {
        settings.set("apiModels", direct.models);
        settings.set("apiModelsVia", direct.via || "direct");
        log("外部", "直连拉到 " + direct.models.length + " 个模型");
        return { ok: true, models: direct.models, tried: tried, via: direct.via || "direct" };
    }
    return { ok: false, error: direct.error, models: [], tried: tried };
}

/** 5) 熔断（连续失败 N 次后冷却，避免每次生成都去撞墙） */
let failStreak = 0;
let brokenUntil = 0;
export function circuitState() { return { failStreak: failStreak, brokenUntil: brokenUntil, broken: Date.now() < brokenUntil }; }
export function recordSuccess() { failStreak = 0; brokenUntil = 0; }
export function recordFailure() { failStreak++; if (failStreak >= BREAK_THRESHOLD) { brokenUntil = Date.now() + BREAK_COOLDOWN; log("外部", "连续失败 " + failStreak + " 次，熔断 " + (BREAK_COOLDOWN / 1000) + " 秒"); } }
export function resetCircuit() { failStreak = 0; brokenUntil = 0; }

/** 6) 降级链：按模式依次尝试 */
/** 自动模式的优先顺序：tt 主连接 → 酒馆助手 → 连接配置 → 自填地址（服务端 → 直连） */
export const AUTO_ORDER = ["ttmain", "main", "secondary", "route", "direct"];

/** 纯函数：按 v1 的两个开关决定"先问谁"。
 *  跟随主连接（v1 apiFollowMain，默认开）→ 先用主连接那条；关掉 → 先用你自己填的地址。
 *  经酒馆代理（v1 apiViaTavernProxy，默认开）→ ttmain 走宿主转发；关掉 → 直接用宿主地址从浏览器发。 */
export function resolveOrder() {
    const follow = settings.get("apiFollowMain") !== false;
    const viaServer = settings.get("apiViaServer") !== false;
    const host = follow ? ["ttmain", "main"] : [];
    const own = ["route", "direct"];
    const base = follow ? host.concat(own) : own.concat(host);
    if (!viaServer) return base.filter(function (v) { return v !== "ttmain"; });
    return base;
}

export async function askExternal(args) {
    const a = args || {};
    const mode = String(a.mode || settings.get("apiMode") || "off");
    const timeoutMs = Math.max(3000, Number(settings.get("apiTimeout")) || DEFAULT_TIMEOUT);
    const base = { system: a.system, user: a.user, messages: a.messages, maxTokens: a.maxTokens || settings.get("apiMaxTokens"), profileId: a.profileId || settings.get("apiProfile"), baseUrl: a.baseUrl, apiKey: a.apiKey, model: a.model, timeoutMs: timeoutMs };
    if (mode === "off") return { ok: false, via: "off", text: "", tried: [], error: "外部接口已关闭（面板「外部接口」里可开启）" };
    if (circuitState().broken) return { ok: false, via: "circuit", text: "", tried: [], error: "外部接口暂时熔断中（连续失败），稍后再试" };
        let order;
        if (mode === "secondary-then-main") order = ["secondary", "main"];
        else if (mode === "route") order = ["route", "direct"];
        else if (mode === "auto") {
            // 自动：只挑当前真的能用的通道，谁先成谁上
            let avail = [];
            try { avail = channelAvailability().available; } catch (error) { avail = []; }
            // v1 语义：跟随主连接 → 先用主连接；否则先用自填地址。只挑当前真能用的。
            order = resolveOrder().filter(function (v) { return avail.indexOf(v) >= 0; });
            if (!order.length) return { ok: false, via: "auto", text: "", tried: [], error: "自动模式：没有检测到可用通道（先在面板里填自填地址，或确认主连接/酒馆助手可用）" };
        } else order = [mode];
    const tried = [];
    for (const via of order) {
        const fn = via === "secondary" ? callSecondary : via === "main" ? callMain : via === "ttmain" ? callTTMain : via === "direct" ? callDirect : callRoute;
        const r = await fn(base);
        tried.push({ via: via, ok: !!r.ok, error: r.error || "" });
        if (r.ok) { recordSuccess(); return { ok: true, via: via, text: r.text, tried: tried, profile: r.profile || null, finishReason: r.finishReason || "" }; }
    }
    recordFailure();
    return { ok: false, via: order[order.length - 1], text: "", tried: tried, error: (tried[tried.length - 1] || {}).error || "外部接口不可用" };
}

/** 7) 注册能力 */
export function registerExternal() {
    registry.provide("external:prompt", async function (args) { const a = args || {}; return buildCardPrompt(a.cards, a.question || a.text || "", a.instruction); });   // 之前第二个参数写死 ""，导致【玩家的话】永远是空的（实测发现）
    registry.provide("external:ask", async function (args) { return await askExternal(args || {}); });
    registry.provide("external:profiles", async function () { return listProfiles(); });
    registry.provide("external:capability", async function () { return capabilityReport(); });
    registry.provide("external:models", async function (args) {
        const r = await fetchModels(args || {});
        if (!r.ok) return "❌ " + r.error;
        return "✅ 拉取到 " + r.models.length + " 个模型：" + r.models.slice(0, 30).join("、") + "\n\n已写入面板「服务器路由：模型」下拉，去选一个再点测试。";
    });
    registry.provide("external:test", async function (args) {
        // 全通道探测：不管 apiMode 设成什么，逐条报告"这条通道现在能不能用"，最后给出建议
        const a = args || {};
        const c = (typeof SillyTavern !== "undefined" && SillyTavern.getContext) ? SillyTavern.getContext() : null;
        const lines = ["🔌 外部接口 · 全通道探测", ""];
        const mode = String(a.mode || settings.get("apiMode") || "off");
        lines.push("当前处理方式：" + mode);
        if (settings.get("apiEnabled") === false) { lines.push("", "❌ 总开关是关的（面板「外部接口 → 启用外部接口」）"); return lines.join("\n"); }
        // 各通道可用性（与「自动」模式共用同一套判定，避免两处不一致）
        let av = { rows: [], available: [] };
        try { av = channelAvailability(); } catch (error) { av = { rows: [], available: [] }; }
        const rows = av.rows;
        lines.push("", "【通道可用性】");
        for (const r of rows.filter(function (x) { return x.can; })) lines.push("  ✅ " + r.name + " —— " + r.why);
        if (!rows.some(function (x) { return x.can; })) lines.push("  （没有检测到可用通道）");
        const off2 = rows.filter(function (x) { return !x.can; });
        if (off2.length) lines.push("  （不需要管的：" + off2.map(function (x) { return x.name; }).join("、") + "）");
        // 真发一条最小请求：优先测当前方式，再测其它可用通道（最多 3 条，避免一直等）
        const order = [mode].concat(rows.filter(function (r) { return r.can; }).map(function (r) { return r.key; })).filter(function (v, i, arr) { return v && v !== "off" && v !== "secondary-then-main" && arr.indexOf(v) === i; });
        const probed = [];
        lines.push("", "【试发一条（ping）】");
        for (const via of order.slice(0, 3)) {
            const r = await askExternal({ mode: via, user: "ping", maxTokens: 64 });
            probed.push({ via: via, ok: !!r.ok, text: r.text || "", error: r.error || "" });
            lines.push("  " + (r.ok ? "✅" : "❌") + " " + via + "：" + (r.ok ? ("返回 " + String(r.text || "").length + " 字：" + String(r.text || "").slice(0, 40)) : r.error));
            if (r.tried && r.tried.length) for (const t of r.tried) lines.push("       · " + t.via + "：" + (t.ok ? "OK" : t.error));
        }
        const good = probed.filter(function (p) { return p.ok; });
        lines.push("");
        if (good.length) {
            lines.push("结论：可用 ✓ 建议把「处理方式」设为：" + good[0].via + "（测试通过的第一条）");
            if (mode !== good[0].via) lines.push("（你现在设的是 " + mode + "，它" + (probed.some(function (p) { return p.via === mode && p.ok; }) ? "也可用" : "不可用") + "）");
        } else {
            lines.push("结论：都不通 ❌ 按下面顺序排查：");
            lines.push("  1) 若用「tt 主连接直发」：先在酒馆里把主连接（Chat Completion）配好，能在聊天里正常出话即可");
            lines.push("  2) 若用「OpenAI 兼容」：地址填到 /v1 为止 + 密钥 + 模型名手填（拉不到列表不影响）");
            lines.push("  3) 拉不到模型列表与能不能生成是两件事：列表拉不到也能生成");
            lines.push("  4) 把上面每条的 HTTP 状态与错误原文发我，可精确定位");
        }
        return lines.join("\n");
    });
    log("外部", "外部接口能力已注册（external:ask / profiles / capability / test）");
}

export const external = { EXTERNAL_INSTRUCTION, buildCardPrompt, MAX_TOKENS_CEILING, clampMaxTokens, finishReasonOf, MODES, MANUAL_MODEL, resolveOrder, channelAvailability, ttMainAvailable, buildTTMainBody, callTTMain, MAIN_PROXY_SOURCES, readBody, isTauriTavern, buildRouteBodySTNative, directChatUrl, directModelsUrls, callDirect, fetchModelsDirect, parseModelList, normalizeBaseUrl, ROUTE_STATUS, buildRouteBody, effectiveModel, fetchModels, buildCardPrompt, ROUTE_GENERATE, DEFAULT_TIMEOUT, BREAK_THRESHOLD, BREAK_COOLDOWN, hostApis, capabilityReport, listProfiles, pickProfile, buildMessages, extractText, withTimeout, callSecondary, callMain, callRoute, circuitState, recordSuccess, recordFailure, resetCircuit, askExternal, registerExternal };
