import { ctx, log, emit } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { registry } from "../core/registry.js";

/** ── 统一模板（接口模块）：常量 → 纯函数 → 执行 → register → exports ── */

/** 1) 常量：对接的外部扩展命令（B = 内置/三方扩展提供的斜杠命令） */
export const VRM = { expression: "vrmexpression", motion: "vrmmotion", model: "vrmmodel" };
export const WEBSEARCH = "websearch";

/** 卡牌事件 → VRM 表情建议（分类表情用的是 GoEmotions 风格名） */
export const REACTION_BY_EVENT = {
    pack_rare: { expression: "amusement", motion: "idle", why: "抽到稀有卡" },
    pack_common: { expression: "neutral", motion: "idle", why: "普通抽卡" },
    duel_win: { expression: "joy", motion: "idle", why: "决斗获胜" },
    duel_lose: { expression: "disappointment", motion: "idle", why: "决斗失利" },
    shop: { expression: "curiosity", motion: "idle", why: "逛商店" },
};

/** 2) 纯函数：生成斜杠命令文本（可断言） */
export function slashText(name, named, unnamed) {
    const parts = ["/" + String(name || "").trim()];
    for (const key of Object.keys(named || {})) {
        const v = named[key];
        if (v === undefined || v === null || v === "") continue;
        parts.push(key + "=" + String(v));
    }
    const text = String(unnamed === undefined || unnamed === null ? "" : unnamed).trim();
    if (text) parts.push(text);
    return parts.join(" ");
}

/** 纯函数：事件 → 表情命令（没有对应事件时返回 null） */
export function reactionFor(event) {
    const r = REACTION_BY_EVENT[event];
    if (!r) return null;
    return { event: event, expression: r.expression, motion: r.motion, why: r.why };
}

/** 3) 执行：三重降级（官方函数 → 旧函数 → 直接调命令回调） */
export function availableCommands() {
    const c = ctx();
    const parser = c.SlashCommandParser;
    if (parser && parser.commands && typeof parser.commands === "object") return Object.keys(parser.commands);
    return [];
}

export function hasCommand(name) {
    return availableCommands().indexOf(String(name)) >= 0;
}

export async function runSlash(text) {
    const c = ctx();
    try {
        if (typeof c.executeSlashCommandsWithOptions === "function") return { ok: true, via: "withOptions", result: await c.executeSlashCommandsWithOptions(text, { showOutput: false }) };
        if (typeof c.executeSlashCommands === "function") return { ok: true, via: "execute", result: await c.executeSlashCommands(text) };
        const m = /^\/([^\s]+)\s*(.*)$/.exec(String(text));
        if (m) {
            const parser = c.SlashCommandParser;
            const cmd = parser && parser.commands ? parser.commands[m[1]] : null;
            if (cmd && typeof cmd.callback === "function") {
                const rest = m[2] || "";
                const named = {};
                const unnamed = [];
                for (const token of rest.split(/\s+/)) {
                    if (!token) continue;
                    const eq = token.indexOf("=");
                    if (eq > 0) named[token.slice(0, eq)] = token.slice(eq + 1);
                    else unnamed.push(token);
                }
                const value = await cmd.callback(named, unnamed.join(" "));
                return { ok: true, via: "callback", result: value };
            }
        }
    } catch (error) {
        return { ok: false, via: "error", error: error && error.message ? error.message : String(error) };
    }
    return { ok: false, via: "unsupported", error: "当前客户端不支持执行斜杠命令" };
}

/** VRM 反应（默认关闭；未装 VRM 时静默跳过） */
export async function vrmReact(event) {
    if (settings.get("vrmReaction") !== true) return { ok: false, reason: "设置里未开启 VRM 反应" };
    const r = reactionFor(event);
    if (!r) return { ok: false, reason: "没有为事件 " + event + " 配置表情" };
    if (!hasCommand(VRM.expression)) return { ok: false, reason: "没有检测到 VRM 扩展（命令 " + VRM.expression + " 不存在）" };
    const res = await runSlash(slashText(VRM.expression, {}, r.expression));
    log("联动", "VRM " + r.expression + "（" + r.why + "）→ " + (res.ok ? "已发送" : "失败：" + res.error));
    emit("vrm", { event: event, expression: r.expression, ok: res.ok });
    return res;
}

/** 联网搜索后备（默认关闭；装了 Web Search 才可用） */
export async function webSearch(query) {
    const q = String(query || "").trim();
    if (!q) return { ok: false, reason: "查询为空" };
    if (settings.get("webSearchFallback") !== true) return { ok: false, reason: "设置里未开启联网后备" };
    if (!hasCommand(WEBSEARCH)) return { ok: false, reason: "没有检测到 Web Search 扩展" };
    const res = await runSlash(slashText(WEBSEARCH, { links: "off", snippets: "on" }, q));
    log("联动", "联网搜索「" + q + "」→ " + (res.ok ? "已发送" : "失败：" + res.error));
    return res;
}

/** 4) 注册能力（工具表里的能力名保持与数据层一致，避免抢注册） */
export function registerIntegrations() {
    registry.provide("integration:vrm", async function (args) { return await vrmReact((args && args.event) || ""); });
    registry.provide("integration:websearch", async function (args) { return await webSearch(args && args.query); });
    registry.provide("integration:status", async function () {
        const cmds = availableCommands();
        return {
            vrm: cmds.some(function (k) { return k.indexOf("vrm") === 0; }),
            websearch: cmds.indexOf(WEBSEARCH) >= 0,
            total: cmds.length,
        };
    });
    log("联动", "外部扩展联动已注册（VRM / Web Search）");
}

export const integrations = { VRM, WEBSEARCH, REACTION_BY_EVENT, slashText, reactionFor, availableCommands, hasCommand, runSlash, vrmReact, webSearch, registerIntegrations };
