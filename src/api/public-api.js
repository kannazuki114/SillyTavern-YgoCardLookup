import { log, emit } from "../core/bus.js";
import { settings, reload as reloadSettings } from "../core/settings.js";
import { registry } from "../core/registry.js";

/**
 * 对外扩展接口（挂到 globalThis.YgoCardLookupV2 上）—— 照抄 v1 的 globalThis.YgoCardLookup 语义：
 *   actions()                        列出可用动作
 *   ready()                          等索引载入完成
 *   registerAction(name, fn)         注册自定义动作
 *   call(action, params)             取数据（不弹面板、不注入）：{ ok, action, text, ms }
 *   on(event, fn) / off(event, fn)   订阅（result / error / inject 等）
 *   hooks.transformResult / filterInjection / resolveCard   三个钩子
 *   export() / import(data, {mode})  迁移收藏册 / DIY / 俗称表 / 卡池 / 盘面
 * 任何一步失败都返回 { ok:false, error }，绝不抛给调用方（外部脚本不该因为查卡器崩掉）。
 */

export const MODULE_VERSION_PUBLIC = "2.0.0";

/** 三个钩子：外部脚本可覆盖（transformResult 改返回值、filterInjection 改注入、resolveCard 兜底解析） */
export const hooks = { transformResult: null, filterInjection: null, resolveCard: null };

const listeners = new Map();
const customActions = Object.create(null);

function emitApi(event, payload) {
    const list = listeners.get(String(event || ""));
    if (list) for (const fn of list.slice()) {
        try { fn(payload); } catch (error) { log("对外接口", "订阅者出错（已忽略）：" + (error && error.message ? error.message : error)); }
    }
    try { emit("public:" + String(event || ""), payload); } catch (error) { /* 总线失败不影响 */ }
}

/** 当前可用动作：注册表里的 runAction:xxx / tool:xxx / cmd:xxx，去掉前缀 + 自定义动作 */
export function actions() {
    const out = [];
    for (const key of registry.list()) {
        const m = /^(?:runAction|tool|cmd|ui):(.+)$/.exec(String(key));   // ui: 也暴露（sendbox/buy/collection…），酒馆助手脚本直接按动作名调
        if (m && out.indexOf(m[1]) < 0) out.push(m[1]);
    }
    for (const k of Object.keys(customActions)) if (out.indexOf(k) < 0) out.push(k);
    return out.sort();
}

/** 等索引就绪（外部脚本调用前可以先 await） */
export async function ready() {
    const pending = [];
    // 数据层注册的键是 index:names / index:stats / index:setnames；
    // 以前这里写 getNameIndex/getStatsIndex/getSetnames（三个都不存在）→ pending 恒空，ready() 立刻返回 true，
    // 外部脚本"等就绪再查卡"会随机查不到。
    for (const name of ["index:names", "index:stats", "index:setnames"]) {
        if (registry.has(name)) { try { pending.push(registry.call(name)); } catch (error) { /* 忽略 */ } }
    }
    await Promise.allSettled(pending);
    return true;
}

/** 注册自定义动作：之后 YgoCardLookupV2.call('你的名字', {...}) 可用 */
export function registerAction(name, fn) {
    const key = String(name || "").trim();
    if (!key || typeof fn !== "function") return false;
    customActions[key] = fn;
    return true;
}

/** 纯函数：动作名 → 注册表能力键（按优先级） */
export function actionKeys(name) {
    const n = String(name || "").trim();
    if (!n) return [];
    return ["tool:" + n, "cmd:" + n, "runAction:" + n, "ui:" + n];
}

/** 调用一个动作，返回 { ok, action, text, ms }（永不抛错） */
export async function call(action, params) {
    const name = String(action || "").trim();
    const started = Date.now();
    const fn = customActions[name];
    if (!fn && !actionKeys(name).some(function (k) { return registry.has(k); })) {
        return { ok: false, action: name, error: "没有这个动作：" + name, actions: actions(), ms: Date.now() - started };
    }
    try {
        let text = "";
        if (fn) text = String((await fn(params || {})) ?? "");
        else {
            for (const key of actionKeys(name)) {
                if (!registry.has(key)) continue;
                const out = await registry.call(key, params || {});
                if (out && typeof out === "object" && typeof out.text === "string") text = out.text;
                else if (typeof out === "string") text = out;
                else text = String((out && (out.name || out.id)) || "");
                break;
            }
        }
        // 查不到时交给外部解析器兜底（与 v1 同名同义）
        if (typeof hooks.resolveCard === "function" && /未命中|没有找到|没找到|查无此卡|无法确定/.test(text)) {
            try {
                const extra = await hooks.resolveCard({ action: name, params: params || {} });
                if (typeof extra === "string" && extra.trim()) text = extra;
            } catch (error) { log("对外接口", "resolveCard 钩子出错（已忽略）：" + (error && error.message ? error.message : error)); }
        }
        if (typeof hooks.transformResult === "function") {
            try { const t = await hooks.transformResult(text, { action: name, params: params || {} }); if (typeof t === "string") text = t; }
            catch (error) { log("对外接口", "transformResult 钩子出错（已忽略）：" + (error && error.message ? error.message : error)); }
        }
        const out = { ok: true, action: name, text: text, ms: Date.now() - started };
        emitApi("result", out);
        return out;
    } catch (error) {
        const out = { ok: false, action: name, error: String((error && error.message) || error), ms: Date.now() - started };
        emitApi("error", out);
        return out;
    }
}

export function on(event, handler) {
    const key = String(event || "").trim();
    if (!key || typeof handler !== "function") return false;
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(handler);
    return true;
}

export function off(event, handler) {
    const list = listeners.get(String(event || "").trim());
    if (!list) return false;
    const at = list.indexOf(handler);
    if (at >= 0) list.splice(at, 1);
    return at >= 0;
}

/** 导出可迁移数据（收藏册 / DIY / 俗称表 / 卡池开关 / 盘面）—— 异步：收藏册要走能力表 */
export async function exportData() {
    const out = {
        version: MODULE_VERSION_PUBLIC,
        at: new Date().toISOString(),
        aliases: String(settings.get("aliases") || ""),
        diyCards: settings.get("diyCards") || [],
        pool: {
            synchro: settings.get("poolSynchro") !== false,
            xyz: settings.get("poolXyz") !== false,
            pendulum: settings.get("poolPendulum") !== false,
            link: settings.get("poolLink") !== false,
        },
    };
    // 漏了 await：以前就算能力存在，这里存进去的也是 Promise（JSON 序列化后变 {}）
    try { if (registry.has("collection:state")) out.collection = await registry.call("collection:state"); } catch (error) { /* 忽略 */ }
    return out;
}

/** 导入（白名单字段；mode=merge 保留现有多余项，replace 直接覆盖）—— 异步：收藏册要走能力表 */
export async function importData(data, options) {
    const payload = (data && typeof data === "object") ? data : null;
    if (!payload) return { ok: false, error: "需要传一个对象" };
    const mode = String((options && options.mode) || "merge");
    const applied = [];
    try {
        if (typeof payload.aliases === "string") { settings.set("aliases", payload.aliases); applied.push("aliases"); }
        if (Array.isArray(payload.diyCards)) {
            const byName = new Map();
            const list = mode === "replace" ? payload.diyCards : (settings.get("diyCards") || []).concat(payload.diyCards);
            for (const item of list) if (item && item.name) byName.set(String(item.name), item);
            settings.set("diyCards", Array.from(byName.values()));
            applied.push("diyCards");
        }
        if (payload.pool && typeof payload.pool === "object") {
            for (const [k, key] of [["synchro", "poolSynchro"], ["xyz", "poolXyz"], ["pendulum", "poolPendulum"], ["link", "poolLink"]]) {
                if (k in payload.pool) settings.set(key, !!payload.pool[k]);
            }
            applied.push("pool");
        }
        if (payload.collection && typeof payload.collection === "object" && registry.has("collection:import")) {
            await registry.call("collection:import", { collection: payload.collection, mode: mode });
            applied.push("collection");
        }
        settings.save();
        reloadSettings();
        return { ok: true, mode: mode, applied: applied };
    } catch (error) {
        return { ok: false, error: "导入失败：" + (error && error.message ? error.message : error), applied: applied };
    }
}

/** 注册能力（供拦截器等内部链路使用 filterInjection 钩子） */
export function registerPublicApi() {
    registry.provide("hook:filterInjection", async function (text) {
        if (typeof hooks.filterInjection !== "function") return text;
        try { const t = await hooks.filterInjection(String(text || "")); return typeof t === "string" ? t : text; }
        catch (error) { log("对外接口", "filterInjection 钩子出错（已忽略）：" + (error && error.message ? error.message : error)); return text; }
    });
    registry.provide("public:actions", async function () { return actions(); });
    registry.provide("public:call", async function (args) { const a = args || {}; return await call(a.action, a.params); });
}

/** 把接口挂到 globalThis.YgoCardLookupV2（不覆盖原有字段，只合并） */
export function installPublicApi(target) {
    const t = target || (typeof globalThis !== "undefined" ? globalThis.YgoCardLookupV2 : null) || {};
    const api = {
        version: MODULE_VERSION_PUBLIC,
        hooks: hooks,
        actions: actions,
        ready: ready,
        registerAction: registerAction,
        call: call,
        on: on,
        off: off,
        export: exportData,
        import: importData,
    };
    for (const k of Object.keys(api)) { try { t[k] = api[k]; } catch (error) { /* 只读则跳过 */ } }
    try { if (typeof globalThis !== "undefined") globalThis.YgoCardLookupV2 = t; } catch (error) { /* 忽略 */ }
    return t;
}

export const publicApi = { MODULE_VERSION_PUBLIC, hooks, actions, ready, registerAction, actionKeys, call, on, off, exportData, importData, registerPublicApi, installPublicApi };
