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
    // ★ swipe 记录要一起改（v1 同款：ygo-card-lookup/index.js:3013）：只改 m.mes 的话，
    //   点 ◀/▶ 切回旧 swipe 或从 swipes 重渲染，[^1] 又会冒出来。
    let touchedSwipe = false;
    if (Array.isArray(m.swipes) && typeof m.swipe_id === "number" && typeof m.swipes[m.swipe_id] === "string") {
        const sw = stripCitations(m.swipes[m.swipe_id]);
        if (sw !== m.swipes[m.swipe_id]) { m.swipes[m.swipe_id] = sw; touchedSwipe = true; }
    }
    if (cleaned === m.mes && !touchedSwipe) return false;
    m.mes = cleaned;
    log("引用", "已清理第 " + index + " 楼的引用标记" + (touchedSwipe ? "（含 swipe 记录）" : ""));
    return true;
}

/** 清理最后一条角色消息（MESSAGE_RECEIVED 的常见用法） */
export function cleanLastMessage(id) {
    const c = ctx();
    const chat = Array.isArray(c.chat) ? c.chat : [];
    // MESSAGE_RECEIVED 给的就是刚进楼的那一条（宿主传的是 index）——给了就清它，
    // 别再去"猜最后一条非玩家消息"（聊天里有系统/旁白楼时会清错人）
    const idx = Number(id);
    if (Number.isInteger(idx) && idx >= 0 && idx < chat.length) return cleanMessageAt(idx);
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
