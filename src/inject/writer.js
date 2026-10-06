import { ctx, log } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { registry } from "../core/registry.js";

/** ── 统一模板（注入模块）：常量 → 纯函数 → 写入 → register → exports ── */

/** 1) 常量：固定 id → 每轮覆盖同一注入（官方 /inject 语义：同 id 覆盖，空串取消） */
export const INJECTION_ID = "YgoCardLookupV2";

/** 2) 纯函数：位置名 → extension_prompt_types 数值 */
export function positionValue(name, types) {
    const t = types || { IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 };
    const key = String(name || "chat").toLowerCase();
    // 兼容历史写法：in_chat / in_prompt / before_prompt
    if (key === "before" || key === "before_prompt") return t.BEFORE_PROMPT !== undefined ? t.BEFORE_PROMPT : 2;
    if (key === "after" || key === "in_prompt") return t.IN_PROMPT !== undefined ? t.IN_PROMPT : 0;
    return t.IN_CHAT !== undefined ? t.IN_CHAT : 1;
}

/** 3) 写入：官方 setExtensionPrompt(id, text, position, depth) */
export function writeInjection(text) {
    const c = ctx();
    const set = c.setExtensionPrompt;
    if (typeof set !== "function") { log("注入", "当前客户端不支持 setExtensionPrompt，跳过写入"); return false; }
    const position = positionValue(settings.get("injectPosition"), c.extension_prompt_types);
    const depth = Math.max(0, Number(settings.get("injectDepth")) || 0);
    try {
        set(INJECTION_ID, String(text || ""), position, depth);
        return true;
    } catch (error) {
        console.warn("[YGO2] 注入写入失败", error);
        return false;
    }
}

/** 清空本扩展的注入（官方语义：空字符串即取消） */
export function clearInjection() { return writeInjection(""); }

/** 4) 注册：拦截器默认走官方写入；测试可覆盖 */
export function registerWriter() {
    registry.provide("writeInjection", async function (text) { return writeInjection(text); });
    log("注入", "写入能力已注册（writeInjection → setExtensionPrompt）");
}

export const writer = { INJECTION_ID, positionValue, writeInjection, clearInjection, registerWriter };
