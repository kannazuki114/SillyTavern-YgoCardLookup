import { ctx, log } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { registry } from "../core/registry.js";

/** ── 统一模板（注入模块）：常量 → 纯函数 → 挂载 → register → exports ── */

/** 1) 常量：要清理的引用标记形态 */
export const PATTERNS = [
    /\[\^\d+\]/g,          // [^1]
    /\[\^[^\]]{1,12}\]/g,   // [^note]
    /【\^\d+】/g,            // 【^1】
    /\(\^\d+\)/g,          // (^1)
];

/** 2) 纯函数：去掉引用标记（可断言） */
export function stripCitations(text) {
    let out = String(text === undefined || text === null ? "" : text);
    for (const re of PATTERNS) out = out.replace(re, "");
    // 清理残留的空括号/多余空格
    out = out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([，。；：！？、])/g, "$1");
    return out;
}

/** 3) 清理聊天里的引用标记（返回值表示是否改动过） */
export function cleanMessageAt(index) {
    if (settings.get("stripCitations") === false) return false;
    const c = ctx();
    const chat = Array.isArray(c.chat) ? c.chat : [];
    const m = chat[index];
    if (!m || typeof m.mes !== "string") return false;
    const cleaned = stripCitations(m.mes);
    if (cleaned === m.mes) return false;
    m.mes = cleaned;
    log("引用", "已清理第 " + index + " 楼的引用标记");
    return true;
}

/** 清理最后一条角色消息（MESSAGE_RECEIVED 的常见用法） */
export function cleanLastMessage() {
    const c = ctx();
    const chat = Array.isArray(c.chat) ? c.chat : [];
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i] && !chat[i].is_user) return cleanMessageAt(i);
    }
    return false;
}

/** 4) 注册能力（事件层会在 MESSAGE_RECEIVED 时调用） */
export function registerCleanup() {
    registry.provide("cleanupLastMessage", async function () { return cleanLastMessage(); });
    registry.provide("stripCitations", async function (text) { return stripCitations(text); });
    log("引用", "引用清理已注册（cleanupLastMessage）");
}

export const cleanup = { PATTERNS, stripCitations, cleanMessageAt, cleanLastMessage, registerCleanup };
