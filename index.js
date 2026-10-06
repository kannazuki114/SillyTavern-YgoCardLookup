/**
 * 查卡器 v2 入口：只负责装配，不写业务逻辑。
 * 统一模板：
 *   1) 模块分五层：core（总线/设置/取数/注册表/事件）、data（数据与业务）、inject（识别与注入）、ui（界面）、api（工具/命令/联动/自检）
 *   2) 层间只通过 registry（能力注册表）与 settings 通信，模块之间不直接 import 业务实现
 *   3) 所有 DOM id 以 ygo2_ 开头，所有 CSS 类以 ygo2- 开头；面板 HTML 放 settings.html
 *   4) 数据文件复用旧扩展目录（只读），自带素材（如 data/art-index.json）放本目录
 */
import { ctx, log, logLines, setLogEnabled, setLogVerbose, on } from "./src/core/bus.js";
import { settings } from "./src/core/settings.js";
import { registry } from "./src/core/registry.js";
import { mountEvents } from "./src/core/events.js";

import { registerIndexes } from "./src/data/indexes.js";
import { registerCards, registerCardResolver } from "./src/data/cards.js";
import { registerRules } from "./src/data/rules.js";
import { registerSummon } from "./src/data/summon.js";
import { registerExternal, listProfiles as listExternalProfileList } from "./src/api/external.js";
import { registerPublicApi, installPublicApi } from "./src/api/public-api.js";
import { ownBase, captureSelfBase, clearAllCache } from "./src/core/http.js";
import * as indexes from "./src/data/indexes.js";
import { registerPacks } from "./src/data/packs.js";
import { registerCollection } from "./src/data/collection.js";
import { registerDeck } from "./src/data/deck.js";
import { registerBoard } from "./src/data/board.js";
import { registerArt } from "./src/data/art.js";

import { registerWriter, clearInjection } from "./src/inject/writer.js";
import { registerSendBox } from "./src/ui/sendbox.js";
import { registerCleanup, cleanLastMessage } from "./src/inject/cleanup.js";
import { registerSendBody } from "./src/inject/sendbody.js";
import { createInterceptor, registerInterceptorHooks } from "./src/inject/interceptor.js";

import { mountPanel, registerStrictnessAction, registryProblems } from "./src/ui/panel.js";
import { configure as configurePanel, refreshDynamicSelects } from "./src/ui/panel.js";
import { registerResult } from "./src/ui/result.js";
import { registerPromptEditor } from "./src/ui/prompt.js";
import { registerDiyUi, openDiyEditor, diyCardHtml, installFrameFallback } from "./src/ui/diy.js";
import { registerGameUi, openCollection, openShop, openBoard, openRecap, openCard, openCardInput, installBuyDelegate } from "./src/ui/game.js";

import { registerTools } from "./src/api/tools.js";
import { registerCommands } from "./src/api/commands.js";
import { registerIntegrations } from "./src/api/integrations.js";
import { registerSelfTest } from "./src/api/selftest.js";
import { registerDeckImage } from "./src/api/deckimage.js";

export const MODULE_VERSION = "0.2.0";

// ★ 必须在"脚本求值这一刻"记录自身目录：之后 document.currentScript 就变回 null 了。
//   这样无论仓库/文件夹叫什么名字，data/ 与 assets/ 都能定位到（GitHub 安装时目录名 = 仓库名）。
captureSelfBase();

/**
 * 磁盘探针（诊断用）：把关键阶段写进 extensionSettings 的一个独立键，
 * 这样即使界面/控制台拿不到，也能从 data/default-user/settings.json 读出到底走到哪一步。
 * 阶段含义：
 *   module-evaluated → 入口模块开始执行（说明所有静态 import 都成功了）
 *   booted           → 装配结束（extra.ok 表示是否全部成功，extra.layers 列出每层结果）
 *   boot-failed      → 装配过程抛异常（extra.error）
 * 注意：如果连 module-evaluated 都没有，说明是 import/协议层失败（模块根本没执行）。
 */
export const PROBE_KEY = "ygo2-DIAG";
export function probe(stage, extra) {
    try {
        const c = (globalThis.SillyTavern && typeof globalThis.SillyTavern.getContext === "function") ? globalThis.SillyTavern.getContext() : null;
        const store = c && c.extensionSettings;
        if (!store) { return false; }
        store[PROBE_KEY] = Object.assign({ stage: stage, at: new Date().toISOString(), version: MODULE_VERSION, hasModule: true }, extra || {});
        if (typeof c.saveSettingsDebounced === "function") c.saveSettingsDebounced();
        if (typeof c.saveSettings === "function") c.saveSettings();
        return true;
    } catch (error) { return false; }
}
probe("module-evaluated", { note: "入口开始执行（静态 import 全部成功）" });
export const INTERCEPTOR_NAME = "YgoCardLookupV2_Intercept";

/** 面板按钮动作（panel.js 会按注册表把按钮接到这里） */
/** 聊天里卡图最大宽度：写成一条 CSS 规则（随设置变化重新注入） */
function installCardImgCss() {
    try {
        if (typeof document === "undefined") return;
        const px = Math.max(120, Math.min(900, Number(settings.get("cardImgMax")) || 360));
        let el = document.getElementById("ygo2-img-style");
        if (!el) { el = document.createElement("style"); el.id = "ygo2-img-style"; document.head.appendChild(el); }
        el.textContent = '.mes_text img.ygo2-card-img{max-width:min(100%," + px + "px);height:auto;border-radius:6px}';
    } catch (error) { /* 无 DOM 时忽略 */ }
}

/** 隔离设置生效：日志栏目停用 → 不记日志；面板改动后立即应用 */
function applyIsolation() {
    try {
        const logsOn = settings.groupEnabled ? settings.groupEnabled("日志") !== false : true;
        setLogEnabled(logsOn && settings.get("logEnabled") !== false);
        setLogVerbose(settings.get("logVerbose") !== false);
        installCardImgCss();
    } catch (error) { /* 忽略 */ }
}

export const PANEL_ACTIONS = {
    deckValidate: async function () { try { const out = await registry.call("tool:deck", {}); await registry.call("ui:result", { title: "查卡器 · 卡组校验", text: String(out || "") }); return String(out || ""); } catch (error) { return "卡组校验失败：" + (error && error.message ? error.message : error); } },
    deckHand: async function () { try { const out = await registry.call("tool:hand", { draw: Number((typeof settings !== "undefined" && settings.get && settings.get("handDraw")) || 5) || 5, runs: Number((typeof settings !== "undefined" && settings.get && settings.get("handRuns")) || 1) || 1 }); await registry.call("ui:result", { title: "查卡器 · 起手模拟", text: String(out || "") }); return String(out || ""); } catch (error) { return "起手模拟失败：" + (error && error.message ? error.message : error); } },
    deckImage: async function () { try { const out = await registry.call("tool:deckimage", {}); await registry.call("ui:result", { title: "查卡器 · 卡组展示图", text: String(out || "") }); return String(out || ""); } catch (error) { return "卡组展示图失败：" + (error && error.message ? error.message : error); } },
    promptEditor: async function () { return await registry.call("ui:prompt", {}); },
    viewCard: async function () {
        // 零输入优先：聊天里最近有卡名就直接弹图形视图（比让人先打字快）
        const c = ctx();
        const chat = Array.isArray(c.chat) ? c.chat : [];
        for (let i = chat.length - 1; i >= 0 && i >= chat.length - 6; i--) {
            const msg = chat[i];
            if (!msg || !msg.mes) continue;
            if (registry.has("resolveCards")) {
                try {
                    const cards = await registry.call("resolveCards", String(msg.mes));
                    if (cards && cards.length) { await openCard({ query: cards[0].name }); return "已显示最近的卡：" + cards[0].name; }
                } catch (error) { /* 继续往前找 */ }
            }
        }
        return await openCardInput();   // 聊天里没有卡名 → 弹带输入框的查卡窗
    },
    viewCollection: async function () { return await openCollection({}); },
    viewShop: async function () { return await openShop({}); },
    viewBoard: async function () { return await openBoard(); },
    viewRecap: async function () { return await openRecap({}); },
    diyCheckAssets: async function () { return await registry.call("diyCheckAssets", {}); },
    diyNew: async function () { return await openDiyEditor(""); },
    diyList: async function () {
        const list = settings.get("diyCards") || [];
        if (!list.length) return "还没有 DIY 卡，点「＋ 新建 DIY 卡」创建第一张。";
        const html = '<div class="ygo2-diy-list">' + list.map(function (card) { return '<div class="ygo2-diy-list-item">' + diyCardHtml(card, "small") + '<div class="ygo2-diy-list-name">' + String(card.name || "") + '</div></div>'; }).join("") + '</div>';
        const c = ctx();
        if (typeof c.callGenericPopup === "function") { const t = c.POPUP_TYPE || {}; await c.callGenericPopup(html, t.TEXT === undefined ? 1 : t.TEXT, "", { wide: true, large: true, okButton: "关闭" }); return "共 " + list.length + " 张 DIY 卡（已在面板中显示）。"; }
        return "共 " + list.length + " 张 DIY 卡：" + list.map(function (x) { return x.name; }).join("、");
    },
    selftest: async function () { return await registry.call("cmd:selftest", {}); },
    clearCache: async function () {
        const ok = await clearAllCache();
        // 索引也要一起重建，否则"清完缓存还是旧的"（懒索引只在进程内缓存）
        try { if (registry.has("index:reset")) await registry.call("index:reset"); } catch (error) { /* 忽略 */ }
        return ok ? "✅ 缓存已清空（内存 + 持久；手动安装的数据库保留）" : "内存缓存已清空；当前环境没有 IndexedDB，没有持久缓存可清。";
    },
    cacheInfo: async function () {
        const caps = await registry.call("external:capability");
        const hasIdb = (function () { try { return typeof indexedDB !== "undefined" && !!indexedDB; } catch (error) { return false; } })();
        return "缓存状态：" + (hasIdb ? "浏览器支持 IndexedDB（卡库会持久缓存，重启免重下）" : "当前环境没有 IndexedDB（只用内存缓存）")
            + "；数据文件 " + JSON.stringify(indexes.FILES) + "；连接配置 " + caps.profiles + " 条。";
    },
    apiPullModels: async function () {
        const out = await registry.call("external:models", { baseUrl: settings.get("apiUrl"), apiKey: settings.get("apiKey") });
        if (String(out).indexOf("✅") === 0) {
            // 关键：把新模型灌进下拉的 DOM，否则界面还是旧选项（之前"拉取后不显示"的原因）
            let n = 0;
            try { n = refreshDynamicSelects(); } catch (error) { log("面板", "刷新下拉失败：" + (error && error.message ? error.message : error)); }
            const list = settings.get("apiModels") || [];
            if (list.length && !String(settings.get("apiModel") || "").trim()) {
                settings.set("apiModel", list[0]);
                settings.save();
                try { refreshDynamicSelects(); } catch (error) { /* 忽略 */ }
                return out + "\n（已刷新下拉 " + n + " 处，并默认选中第一个：" + list[0] + "）";
            }
            return out + "\n（已刷新下拉 " + n + " 处）";
        }
        return out;
    },
    apiTest: async function () { return await registry.call("external:test", { mode: settings.get("apiMode") }); },
    logView: async function () { return logLines().slice(-40).join("\n") || "（暂无日志）"; },
};

/** 分层装配：任一层失败都只记日志，不拖垮其他层（自检/命令仍可用） */
async function step(name, fn) {
    try {
        const value = await fn();
        log("启动", "✓ " + name);
        return { name: name, ok: true, value: value };
    } catch (error) {
        console.error("[YGO2] " + name + " 装配失败", error);
        log("启动", "✗ " + name + "：" + (error && error.message ? error.message : error));
        return { name: name, ok: false, error: error && error.message ? error.message : String(error) };
    }
}

/** 启动必需能力清单：任何一项缺失都说明某一层没接上（曾经出现"5 层全 ok 但 external 一个没注册"） */
export const REQUIRED_CAPS = [
    "tool:card", "tool:pack", "tool:board", "ui:result", "ui:prompt", "writeInjection",
    "resolveCards", "runAction", "index:limits", "checkSummon", "external:ask", "external:test",
    "external:models", "ui:diy", "ui:sendbox", "ui:buy", "sendbody:on", "sendbody:handle", "boardText", "cleanupLastMessage",
    "injectFallback:run", "strictness:get", "tool:deckimage", "collection:state", "decodeSetcodes",
];

async function boot() {
    log("启动", "查卡器 v2 " + MODULE_VERSION + " 开始装配");
    // TauriTavern 文档：扩展使用宿主 ABI 前应先等它就绪。
    // 上游 SillyTavern 没有这个对象，这里会直接跳过（不影响启动）。
    try {
        const tt = globalThis.__TAURITAVERN__;
        if (tt && tt.ready && typeof tt.ready.then === "function") { await tt.ready; log("启动", "已等待 TauriTavern 宿主就绪"); }
    } catch (error) { log("启动", "等待 tt 宿主失败（继续启动）：" + (error && error.message ? error.message : error)); }
    settings.reload();
    setLogEnabled(settings.get("logEnabled") !== false);
    installCardImgCss();
    const report = [];
    const missingCaps = [];
    // ── 数据层
    report.push(await step("数据层", async function () {
        registerIndexes(); registerCards(); registerCardResolver(); registerRules(); registerSummon(); registerExternal();
        registerPublicApi();
        registerPacks(); registerCollection(); registerDeck(); registerBoard(); registerArt();
    }));
    // ── 注入层
    report.push(await step("注入层", async function () {
        registerWriter();
        registerCleanup();
        registerSendBody();
        registerInterceptorHooks();   // ★ 注册 injectFallback:run：宿主不调 generate_interceptor 时靠它兜底
        const interceptor = createInterceptor();
        interceptor.clearInjection = clearInjection;
        globalThis[INTERCEPTOR_NAME] = interceptor;
    }));
    // ── 界面层（无 DOM 时应优雅跳过，不抛错）
    report.push(await step("界面层", async function () {
        registerResult(); registerPromptEditor(); registerDiyUi(); registerGameUi(); registerSendBox();
        installBuyDelegate();   // ★ 商店「购买」按钮的点击委派（不装就点了没反应）
        try { registerStrictnessAction(); } catch (error) { log("启动", "严格程度动作注册失败：" + (error && error.message ? error.message : error)); }
        installFrameFallback();
        try { configurePanel({ listExternalProfiles: function () { return listExternalProfileList(); }, getApiModels: function () { return settings.get("apiModels") || []; } }); } catch (error) { /* 面板可选 */ }
        applyIsolation();
        on("settings", function () { applyIsolation(); });
        // 面板字段注册表自检（重复 key / 非法类型 / 缺 options 都能在这里暴露）
        try {
            const problems = registryProblems();
            if (problems.length) log("面板", "⚠️ 字段注册表有问题 " + problems.length + " 条：" + problems.slice(0, 6).join("；"));
        } catch (error) { log("面板", "字段注册表自检失败：" + (error && error.message ? error.message : error)); }
        // ★ 不再 await：宿主设置抽屉晚出现时，等待最坏要 10 秒，会把接口层/事件层一起拖住
        panelMount = mountPanel(PANEL_ACTIONS).then(function (mounted) {
            log("面板", mounted ? "挂载完成" : "暂未找到设置抽屉宿主，稍后打开设置时会自动重试");
            return mounted;
        }).catch(function (error) {
            log("面板", "挂载异常（不影响命令与工具）：" + (error && error.message ? error.message : error));
            return false;
        });
        return true;
    }));
    // ── 接口层
    report.push(await step("接口层", async function () {
        registerTools(); registerCommands(); registerIntegrations(); registerDeckImage();
        registerSelfTest({ requiredCaps: function () { return REQUIRED_CAPS.filter(function (cap) { return !registry.has(cap); }); } });
    }));
    // ── 事件层
    report.push(await step("事件层", async function () {
        return mountEvents({
            onReady: function () {
                log("启动", "APP_READY");
                // 再挂一次（幂等）：有些宿主会在页面初始化更晚的时候重建 globalThis 上的对象
                try { installPublicApi(); } catch (error) { log("启动", "对外接口补挂失败：" + (error && error.message ? error.message : error)); }
            },
            onChatChanged: function () { clearInjection(); log("启动", "切换聊天：已清空注入"); },
            // ★ 兜底通道（v1 同款）：桌面客户端既不调 generate_interceptor、也不触发 PROMPT_READY，
            //   只有 GENERATION_AFTER_COMMANDS 在"提示词组装前"触发 —— 资料在这里追加才真的进本次发送。
            onAfterCommands: async function (type) {
                try {
                    const t = String(type || "");
                    if (t === "quiet") return;
                    const c = ctx();
                    const chat = (c && Array.isArray(c.chat)) ? c.chat : null;
                    if (!chat || !chat.length) return;
                    // 1) 发送体改写（bodyEditMode=append 时把资料追加到最后一条玩家消息）
                    if (registry.has("sendbody:handle")) {
                        const n = await registry.call("sendbody:handle", { chat: chat });
                        if (n) log("发送体", "兜底通道：已把资料追加进即将发送的消息（" + n + " 处）");
                    }
                    // 2) 提示词注入兜底（拦截器没被调用时补一次）
                    if (registry.has("injectFallback:run")) {
                        const r = await registry.call("injectFallback:run");
                        if (r && r.ok) log("兜底", r.injected ? ("GENERATION_AFTER_COMMANDS 兜底注入 " + r.chars + " 字") : "兜底：本轮没有可注入的内容");
                    }
                } catch (error) { log("兜底", "兜底通道异常（不影响生成）：" + (error && error.message ? error.message : error)); }
            },
            onMessageReceived: function (id) { try { cleanLastMessage(id); } catch (error) { /* 清理失败不影响消息 */ } },
            // 兜底注入：宿主没调拦截器（例如不支持 generate_interceptor）时，玩家消息入楼后补一次
            onMessageSentFallback: async function () {
                try {
                    if (!registry.has("injectFallback:run")) return;
                    const r = await registry.call("injectFallback:run");
                    if (r && r.ok) log("兜底", r.injected ? ("MESSAGE_SENT 兜底注入 " + r.chars + " 字") : "兜底：本轮没有可注入的内容");
                    else if (r && r.reason) log("兜底", r.reason);
                } catch (error) { log("兜底", "兜底注入异常（不影响生成）：" + (error && error.message ? error.message : error)); }
            },
        });
    }));
    // ── 对外接口：必须等"同步装配"全部结束之后再挂。
    //    打包产物在入口模块返回之后才执行 globalThis.YgoCardLookupV2 = __entry，
    //    而数据层那一段是纯同步的 —— 在那里装的话会被这一行整个覆盖掉（实测踩过）。
    report.push(await step("对外接口", async function () { installPublicApi(); return true; }));
    const failed = report.filter(function (r) { return !r.ok; });
    // ★ REQUIRED_CAPS 校验（以前只声明不校验，能力缺失永远看不出来）
    for (const cap of REQUIRED_CAPS) { if (!registry.has(cap)) missingCaps.push(cap); }
    log("启动", "装配完成：能力 " + registry.list().length + " 项" + (failed.length ? "，失败层：" + failed.map(function (r) { return r.name; }).join("、") : "，全部成功"));
    if (missingCaps.length) log("启动", "⚠️ 缺少必需能力 " + missingCaps.length + " 项：" + missingCaps.join("、"));
    probe("booted", {
        ok: failed.length === 0,
        capabilities: registry.list().length,
        layers: report.map(function (r) { return r.name + ":" + (r.ok ? "ok" : "fail"); }),
        missingCaps: missingCaps,
        interceptor: typeof globalThis[INTERCEPTOR_NAME] === "function",
        domHost: (function () { try { return !!(document.getElementById("extensions_settings2") || document.getElementById("extensions_settings")); } catch (e) { return false; } })(),
        panelMounted: (function () { try { return !!document.getElementById("ygo2_settings"); } catch (e) { return false; } })(),
        base: (function () { try { return ownBase(); } catch (e) { return "?"; } })(),
    });
    return { ok: failed.length === 0 && missingCaps.length === 0, report: report, capabilities: registry.list().length, missingCaps: missingCaps, interceptor: typeof globalThis[INTERCEPTOR_NAME] === "function" };
}

export { boot };

/**
 * tt（TauriTavern）通过 manifest 的 hooks.activate 调用这个函数；上游 ST 不认识 hooks，走下面的自动启动。
 * 两套入口共用同一个单次启动守卫，避免重复装配（tt 若两者都触发，第二次会直接返回上次结果）。
 */
let bootPromise = null;
/** 面板挂载是异步的（不阻塞启动）；这里留个句柄供诊断/测试 await */
let panelMount = null;
export function whenPanelMounted() { return panelMount || Promise.resolve(false); }
export function ygo2Activate() { return ensureBoot(); }
export function ensureBoot() {
    if (!bootPromise) bootPromise = boot().catch(function (error) { console.error("[YGO2] 启动失败", error); bootPromise = null; throw error; });
    return bootPromise;
}

// 浏览器里自动启动（Node 测试环境没有 SillyTavern，此时只导出 boot 供断言）
if (typeof globalThis !== "undefined" && (globalThis.SillyTavern || (ctx() && ctx().extensionSettings))) {
    ensureBoot().catch(function (error) {
        console.error("[YGO2] 启动失败", error);
        probe("boot-failed", { error: String(error && error.message ? error.message : error).slice(0, 300) });
    });
} else {
    probe("not-started", { reason: "没有检测到 SillyTavern 上下文，自动启动被跳过" });
}
