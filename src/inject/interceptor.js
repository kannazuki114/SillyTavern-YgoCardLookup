import { ctx, log, emit } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { registry } from "../core/registry.js";
import { matchTrigger, findSegments, allowsFreeText } from "./detect.js";
import { buildInjection } from "./build.js";

/** 取最后一次玩家消息（按 scanScope 决定扫哪些）。 */
/** 扫描条数：与 v1 同一个键同一范围（1-20，默认 3） */
export function scanDepthValue(raw) {
    // 与 v1 的绑定逐字一致：Math.max(1, Math.min(20, Number(value) || 3))
    // 所以 0 / 空 / 非数字 → 3（v1 同理），负数 → 1，超过 20 → 20
    const n = Number(raw === undefined || raw === null || raw === "" ? settings.get("scanDepth") : raw) || 3;
    return Math.max(1, Math.min(20, Math.floor(n)));
}

/**
 * 取本轮的"待检测文本"。
 *   scope === "all"       → 最近 N 条消息（含 AI 回复），N 由 scanDepth 决定（v1 同款，之前写死 3 条）
 *   scope === "last_user" → 最后一条玩家消息
 */
export function lastUserText(chat, scope, depth) {
    const list = Array.isArray(chat) ? chat : [];
    if (scope === "all") {
        const n = scanDepthValue(depth);
        const all = list.filter(function (m) { return m && m.mes; }).map(function (m) { return String(m.mes); });
        return all.slice(-n).join("\n");
    }
    for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        if (m && m.mes && m.is_user) return String(m.mes);
    }
    return "";
}

/**
 * 拦截器主体：纯编排。依赖通过 registry 取（数据层未注册时自动降级为"不认识卡名"）。
 */
export const TRIGGER_LABELS = {
    pack: "开卡包", packsearch: "卡包搜索", draw: "随机抽卡", shop: "每日商店", buy: "购买",
    deck: "卡组校验", deckimage: "卡组展示图", hand: "起手模拟", board: "决斗盘", duel: "决斗盘",
    summon: "召唤检查", rule: "官方裁定", art: "异画", alias: "俗称表", album: "收藏册",
    recap: "本局卡表", series: "字段查询", selftest: "自检", card: "查卡", search: "模糊搜索",
};
/** 组装给外部模型的系统提示（有 external 模块就用它的 buildCardPrompt；否则退化为简易拼装） */
function buildExternalSystem(conf, cards) {
    const instruction = conf.apiInstruction;
    if (registry.has("external:prompt")) {
        try { return registry.call("external:prompt", { cards: cards, question: String(text || "").slice(0, 800), instruction: instruction }); } catch (error) { /* 退化为下面 */ }
    }
    const head = String(instruction || "").trim() || "你是游戏王规则助手，只用给定资料回答，不要编造。";
    const body = (cards || []).slice(0, 6).map(function (c) { return "· " + c.name + "：" + String(c.text || "").replace(/\n/g, " ").slice(0, 400); }).join("\n");
    return head + "\n\n【卡面资料】\n" + body;
}

/** 拦截器最近一次被宿主调用的时间（兜底注入据此判断） */
let lastRunAt = 0;

/** 兜底注入：宿主没有调用拦截器（不支持 generate_interceptor / 调用失败）时，
 *  在 MESSAGE_SENT（玩家消息已入楼、提示词还没组装）用**同一个拦截器**再跑一次 ——
 *  直接复用同一个函数，所以两条链路行为必然一致，不会出现"两套实现不同步"。
 *  v1 的「拦截器不生效时改用事件兜底注入」就是这个语义。 */
export async function runFallback() {
    if (settings.get("injectionFallback") === false) return { ok: false, reason: "设置里已关闭兜底注入" };
    if (lastRunAt && Date.now() - lastRunAt < 5000) return { ok: false, reason: "拦截器本轮已运行（" + (Date.now() - lastRunAt) + "ms 前），不需要兜底" };
    const c = (typeof ctx === "function") ? ctx() : null;
    const chat = (c && Array.isArray(c.chat)) ? c.chat : null;
    if (!chat || !chat.length) return { ok: false, reason: "拿不到聊天记录" };
    if (typeof builtInterceptor !== "function") return { ok: false, reason: "拦截器尚未建立" };
    const before = lastRunAt;
    try {
        const out = await builtInterceptor(chat, 0, null, "normal");
        return { ok: true, injected: !!out, chars: String(out || "").length };
    } catch (error) {
        return { ok: false, reason: "兜底注入失败：" + ((error && error.message) ? error.message : String(error)) };
    } finally {
        // 无论成功失败，都别让同一轮反复兜底
        if (!lastRunAt || lastRunAt === before) lastRunAt = Date.now();
    }
}

/** createInterceptor 建立的拦截器引用（runFallback 复用同一个） */
let builtInterceptor = null;

export function registerInterceptorHooks() {
    registry.provide("injectFallback:run", async function () { return await runFallback(); });
}

export function createInterceptor() {
    const interceptor = async function (chat, contextSize, abort, type) {
        lastRunAt = Date.now();   // 标记"拦截器本轮确实被宿主调用了"，兜底注入据此判断是否需要出手
        try { log("拦截", "被调用（chat " + ((chat && chat.length) || 0) + " 条，type=" + String(type || "") + "）"); } catch (e0) { /* 忽略 */ }
        const conf = settings.all();
        if (!conf.interceptEnabled) return;
        // 栏目隔离：整个「自动检测注入」栏目被停用 → 不做任何自动检测
        if (settings.groupEnabled && settings.groupEnabled("自动检测注入") === false) { log("拦截", "「自动检测注入」栏目已停用，跳过"); return; }
        // 总隔离「仅指令触发」：自动检测一律不做（指令照常可用）
        if (settings.isolationActive && settings.isolationActive()) { log("拦截", "已开启仅指令触发（总隔离），跳过自动检测"); return; }
        if (conf.triggerMode === "command") { log("拦截", "仅指令模式，不做自主检测"); return; }
        // 官方文档：type 会给出本次生成的来源（quiet/regenerate/impersonate/swipe…）。
        // quiet 多为摘要/翻译等内部生成，注入卡资料纯属浪费上下文，默认跳过。
        if (conf.skipQuiet !== false && type === "quiet") { log("拦截", "quiet 生成，跳过注入"); return; }
        const text = lastUserText(chat, conf.scanScope, conf.scanDepth);
        if (!text) return;
        const started = Date.now();
        let trigger = conf.naturalCommands === false ? null : matchTrigger(text);
        // 栏目隔离：动作所属栏目被停用 → 忽略这个触发词
        if (trigger && settings.actionAllowed && settings.actionAllowed(trigger.action) === false) {
            log("拦截", "「" + (settings.actionGroup ? settings.actionGroup(trigger.action) : "?") + "」栏目已停用，忽略触发 " + trigger.action);
            trigger = null;
        }
        let cards = [];
        let kind = "";
        if (trigger) {
            kind = "trigger:" + trigger.action;
            cards = await runTrigger(trigger);
        }
        const freeGroupOn = settings.groupEnabled ? settings.groupEnabled("查询内容") !== false : true;
        if ((!cards || !cards.length) && !trigger && freeGroupOn && conf.detectFreeText !== false && allowsFreeText() && registry.has("resolveCards")) {
            kind = "freetext";
            cards = await registry.call("resolveCards", text);
        } else if (allowsFreeText() && registry.has("scanCards")) {
            kind = "scan";
            cards = await registry.call("scanCards", text);
        }
        // v1 的「用外部 AI 时停用插件自主搜索」：外部接口可用且该开关开着 → 本地检测/触发词全部跳过，直接把玩家输入交给外部 AI
    const externalReady = registry.has("external:ask") && settings.groupEnabled("外部接口") !== false && conf.apiEnabled !== false && String(conf.apiMode || "off") !== "off";
    const externalOnly = externalReady && conf.apiExternalAiOwnSearch !== false;
    const detectedCards = (cards || []).slice();   // 清空之前留一份：卡图页脚要用（外部独占时本地卡面丢弃、但卡图仍要送）
    if (externalOnly && (cards && cards.length)) { cards = []; kind = "external"; log("拦截", "外部 AI 模式：跳过本地自主搜索（仍会走外部接口）"); }
    if ((!cards || !cards.length) && !externalOnly) { log("拦截", "本条没有可用资料（" + (kind || "无触发") + "）"); return; }
        let injection = buildInjection(cards, {});
        // 外部接口（副 API 优先 → 主 API 兜底）：先让外部模型处理，再把结果连同卡面数据交给主 AI
        if (registry.has("external:ask") && settings.groupEnabled("外部接口") !== false && conf.apiEnabled !== false && String(conf.apiMode || "off") !== "off") {
            try {
                // 不阻塞模式：超预算就跳过（默认开）；关掉则给足时间（最多 60 秒）
                const budget = conf.apiNonBlocking === false
                    ? Math.max(1000, Math.min(60000, Number(conf.apiBudget) || 30000) * 4)
                    : Math.max(1000, Number(conf.apiBudget) || 8000);
                const ext = await registry.call("external:ask", {
                    mode: conf.apiMode,
                    profileId: conf.apiProfile,
                    maxTokens: conf.apiMaxTokens,
                    timeoutMs: budget,
                    system: buildExternalSystem(conf, cards),
                    user: text,
                });
                if (ext && ext.ok && ext.text) {
                    const cutNote = (ext.finishReason === "length") ? "\n⚠️（这段外部结果被截断了：模型输出达到 token 上限，可能不完整；可在面板「外部接口 · 高级」调大「副 API 最大输出」）" : "";
                    if (cutNote) log("外部", "⚠️ 外部结果被截断（finish_reason=length），已在注入里标注");
                    const extBlock = "\n\n【外部 AI 处理结果（" + ext.via + "）】\n" + String(ext.text).slice(0, 2000) + cutNote + "\n***";
                      // 本地没有任何资料时（外部 AI 模式），外部结果自己就是全部注入内容
                      // v1 的「回写时丢弃插件原始数据（只给 AI 对方的结果）」：开着就只留外部结果，去掉本地卡面
                      if (conf.apiWebhookReplace === true) injection = "";
                      injection = injection ? injection.replace(/\n\*\*\*$/, extBlock) : ("***" + extBlock);
                    log("外部", "外部处理成功（" + ext.via + "）：" + String(ext.text).length + " 字");
                } else {
                    log("外部", "外部处理未生效：" + ((ext && ext.error) || "无返回"));
                }
            } catch (error) { log("外部", "外部处理异常（不影响本地注入）：" + (error && error.message ? error.message : error)); }
        }
        // 盘面随注入一起给 AI（开关：duelBoard）
        if (conf.duelBoard !== false && registry.has("boardText")) {
            try { const bt = await registry.call("boardText"); if (bt && bt.indexOf("LP") >= 0) injection = injection.replace(/\n\*\*\*$/, "\n\n" + bt + "\n***"); } catch (error) { /* 取不到不影响 */ }
        }
        // 结果同时注入（开关：resultInject）
        if (conf.resultInject === true && registry.has("lastResultText")) {
            try { const rt = await registry.call("lastResultText"); if (rt) injection = injection.replace(/\n\*\*\*$/, "\n\n【上一轮查询结果】\n" + String(rt).slice(0, 800) + "\n***"); } catch (error) { /* 忽略 */ }
        }
        if (!injection) return;
        // 外部钩子：允许别的脚本过滤/改写注入内容（v1 hooks.filterInjection 同义）
        if (registry.has("hook:filterInjection")) {
            try { const f = await registry.call("hook:filterInjection", injection); if (typeof f === "string" && f) injection = f; }
            catch (error) { log("拦截", "filterInjection 钩子出错（已忽略）"); }
        }
        // 卡图页脚：预算截断发生在 buildInjection 内部，页脚在其后追加，所以卡图链接【不会被切】；
        // 外部 AI 独占模式（本地卡面被丢弃）时，这一段也保证卡图照样送到 AI。
        if (conf.includeImage !== false && detectedCards.length) {
            try {
                const links = [];
                for (const c of detectedCards) {
                    const found = String((c && c.text) || "").match(/!\[\]\(([^)\s]+)\)/g) || [];
                    for (const l of found) if (links.indexOf(l) < 0) links.push(l);
                }
                const cut = injection.indexOf("超出预算已截断") >= 0;
                const lost = links.filter(function (l) { return injection.indexOf(l) < 0; });
                if (links.length && (cut || lost.length)) {
                    injection = injection.replace(/\n\*\*\*$/, "\n\n【卡图】（markdown 图片链接，可直接放进正文）\n" + links.join("\n") + "\n***");
                    if (lost.length) log("拦截", "预算截断吃掉了 " + lost.length + " 个卡图链接，已在页脚补回");
                }
            } catch (error) { /* 卡图页脚失败不影响注入 */ }
        }
        const written = await registry.has("writeInjection") ? await registry.call("writeInjection", injection) : false;
        log("注入", cards.length + " 张卡 → " + injection.length + " 字（" + kind + "，" + (Date.now() - started) + "ms）写入=" + written);
        if (conf.logToast === true) {
            try { const toaster = ctx().toastr; if (toaster && typeof toaster.info === "function") toaster.info("查卡器：已注入 " + cards.length + " 张卡资料"); } catch (error) { /* 忽略 */ }
        }
        emit("inject", { cards: cards.length, chars: injection.length, kind: kind, written: written });
        // 每次触发都给可见回执（v1 的行为）：标题写明触发路径，内容是被识别到的卡
        if (conf.resultPopup !== false && registry.has("ui:result")) {
            const action = kind.indexOf("trigger:") === 0 ? kind.slice(8) : "";
            const label = action ? "触发词「" + (TRIGGER_LABELS[action] || action) + "」"
                : kind === "freetext" ? "自由文本识别"
                : kind === "scan" ? "整句扫描"
                : (kind || "识别");
            const body = cards.slice(0, 8).map(function (c) { return (String(c.text || "").indexOf("【") === 0 ? "" : "【" + c.name + "】" + String.fromCharCode(10)) + String(c.text || "").slice(0, 700); }).join(String.fromCharCode(10) + String.fromCharCode(10));
            const note = String.fromCharCode(10) + String.fromCharCode(10) + "—— 本条路径：" + label + "；已注入 " + injection.length + " 字" + (written ? "（写入成功）" : "（写入失败，请检查注入位置设置）");
            Promise.resolve(registry.call("ui:result", { title: "查卡器 · " + label + " → " + cards.length + " 张卡", text: body + note })).catch(function () { /* 弹窗失败不影响注入 */ });
        }
        return injection;
    };
        // 对外包一层"永不抛错"：拦截器里任何异常都不许影响生成（宁可没注入，也不能让玩家发不出去）
        const safeInterceptor = async function (chat, contextSize, abort, type) {
            try { return await interceptor(chat, contextSize, abort, type); }
            catch (error) {
                try { log("拦截", "⚠️ 拦截器内部出错，已忽略、不影响生成：" + (error && error.message ? error.message : error)); } catch (e1) { /* 忽略 */ }
                return "";
            }
        };
        builtInterceptor = safeInterceptor;
    return safeInterceptor;
}

/** 供面板/命令复用的单次检测（不写入提示词）。 */
export async function detectOnce(text) {
    const trigger = matchTrigger(text);
    if (trigger && registry.has("runAction")) return { kind: "trigger:" + trigger.action, cards: await registry.call("runAction", trigger) };
    if (allowsFreeText() && registry.has("resolveCards")) return { kind: "freetext", cards: await registry.call("resolveCards", text) };
    return { kind: "none", cards: [] };
}


/**
 * 触发词派发契约：任何数据模块都可以 registry.provide("runAction:<名字>", fn) 或 "runAction"。
 * 拦截器按注册顺序依次询问，第一个返回非空结果的即采用。新增模块不需要改这里。
 */
export async function runTrigger(trigger) {
    const keys = registry.list().filter(function (k) { return k === "runAction" || k.indexOf("runAction:") === 0; });
    for (const key of keys) {
        try {
            const out = await registry.call(key, trigger);
            // 只认数组：runAction:* 里有些能力返回字符串（如日志），不能让它们抢走触发词派发
            if (Array.isArray(out) && out.length) return out;
        } catch (error) { log("拦截", "派发 " + key + " 失败：" + (error && error.message ? error.message : error)); }
    }
    return [];
}

export const interceptor = { createInterceptor, registerInterceptorHooks, runFallback, scanDepthValue, detectOnce, lastUserText, runTrigger };
