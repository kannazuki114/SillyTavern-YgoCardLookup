import { ctx, log, emit } from "./bus.js";
import { registry } from "./registry.js";

/** ── 统一模板（核心模块）：常量 → 纯函数 → 挂载 → exports ── */

/** 用到的官方事件（文档：MESSAGE_SENT / MESSAGE_RECEIVED / CHAT_CHANGED / GENERATION_ENDED / APP_READY） */
/** 额外钩子：不在 USED_EVENTS 里（那个列表是"通用事件→hooks"，这条有自己的处理器） */
export const EXTRA_EVENTS = ["CHAT_COMPLETION_PROMPT_READY", "GENERATION_AFTER_COMMANDS"];

export const USED_EVENTS = ["APP_READY", "CHAT_CHANGED", "MESSAGE_SENT", "MESSAGE_RECEIVED", "GENERATION_ENDED", "SETTINGS_UPDATED"];

/** 纯函数：取事件源（SillyTavern.getContext() 提供） */
export function eventSource() {
    const c = ctx();
    return c && c.eventSource ? c.eventSource : null;
}

export function eventTypes() {
    const c = ctx();
    return (c && c.event_types) || {};
}

/**
 * 挂载官方事件：
 * APP_READY        → 预热索引（不阻塞）
 * CHAT_CHANGED     → 清掉上一聊天的临时状态（盘面/本局记录）
 * MESSAGE_SENT     → 记录玩家消息（供"本局卡表"用）
 * GENERATION_ENDED → 取回非阻塞的外部结果（下一轮生效）
 */
export async function mountEvents(hooks) {
    const src = eventSource();
    const types = eventTypes();
    if (!src || typeof src.on !== "function") { log("事件", "当前客户端没有 eventSource，跳过挂载"); return 0; }
    const h = hooks || {};
    let mounted = 0;
    const on = function (name, fn) {
        const key = types[name] || name;
        if (!key || typeof fn !== "function") return;
        try { src.on(key, fn); mounted++; } catch (error) { console.warn("[YGO2] 事件挂载失败 " + name, error); }
    };
    on("APP_READY", function () { if (h.onReady) return h.onReady(); });
    on("CHAT_CHANGED", async function () { if (h.onChatChanged) await h.onChatChanged(); emit("chatChanged", {}); });
    on("MESSAGE_SENT", function (id) { if (h.onMessageSent) return h.onMessageSent(id); });
    on("MESSAGE_SENT", function () { if (h.onMessageSentFallback) return h.onMessageSentFallback(); });
    // ★ v1 的兜底通道：桌面客户端（tt）不执行 manifest 的 generate_interceptor，
    //   也不触发 CHAT_COMPLETION_PROMPT_READY；这个事件在**提示词组装前**触发，
    //   在这里改 ctx().chat 的最后一条消息，改动会真的进入本次发送。
    on("GENERATION_AFTER_COMMANDS", function (type) { if (h.onAfterCommands) return h.onAfterCommands(type); });
    on("MESSAGE_RECEIVED", function (id) { if (h.onMessageReceived) return h.onMessageReceived(id); });
    on("GENERATION_ENDED", async function () { if (h.onGenerationEnded) await h.onGenerationEnded(); emit("generationEnded", {}); });
    on("SETTINGS_UPDATED", function () { if (h.onSettingsUpdated) return h.onSettingsUpdated(); });
    log("事件", "已挂载 " + mounted + " 个事件");
    // 发送体改写钩子（官方 CHAT_COMPLETION_PROMPT_READY）：注册表里有人装才挂，失败不影响其它事件
    try {
        if (registry.has("sendbody:on")) {
            const ok = await registry.call("sendbody:on", src, types);   // 漏了 await：以前恒报"已挂载"，失败还会变成未处理的 Promise 拒绝
            log("事件", ok ? "发送体钩子已挂载：" + EXTRA_EVENTS.join(",") : "发送体钩子未挂上（宿主事件不可用）");
        }
    } catch (error) {
        console.warn("[YGO2] 发送体钩子挂载失败", error);
    }
    return mounted;
}

export const events = { USED_EVENTS, EXTRA_EVENTS, eventSource, eventTypes, mountEvents };
