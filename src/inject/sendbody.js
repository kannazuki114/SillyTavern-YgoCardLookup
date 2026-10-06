import { ctx, log } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { registry } from "../core/registry.js";
// 与注入路径共用同一份「仅供参考/是否采用由你决定」文案，避免两处漂移
import { judgeText } from "./build.js";

/**
 * 发送体改写（官方钩子 CHAT_COMPLETION_PROMPT_READY）。
 *
 * 官方源码证据：
 *  - public/script.js:3976-3980 —— 事件后 `prompt = eventData.chat`，所以此处改动会真的发出去；
 *  - public/scripts/openai.js:1607-1614 —— `const chat = chatCompletion.getChat()` 之后发事件，随后仍用同一个
 *    `chat` 变量，因此**必须原地修改数组**（push/splice/改元素），替换 eventData.chat 在 tt 这条路上不生效。
 *
 * 与「注入」的区别：注入（setExtensionPrompt）是另开一块提示；这里是直接改即将发送的消息序列本身。
 */

export const MODES = ["off", "append"];

/** 纯函数：找最后一条"玩家消息"的下标（role=user，且不是我们自己插进去的） */
/**
 * 一条消息的正文：酒馆两种形状都要认。
 *   · OpenAI/生成链路：{ role: "user"|"assistant", content }
 *   · 官方聊天对象：  { is_user: true, mes }
 * 之前只认 content + role，真实客户端若给的是 is_user/mes，整个发送体改写会**静默不生效**。
 */
export function messageText(m) {
    if (!m || typeof m !== "object") return "";
    if (typeof m.content === "string") return m.content;
    if (typeof m.mes === "string") return m.mes;
    return "";
}

/** 是否玩家消息（两种形状都认） */
export function isUserMessage(m) {
    if (!m || typeof m !== "object") return false;
    if (m.is_user === true) return true;
    if (m.role === "user") return true;
    return false;
}

/** 写回正文：沿用这条消息**原本**的字段（有 content 就写 content，否则写 mes） */
export function setMessageText(m, text) {
    if (!m || typeof m !== "object") return false;
    if (typeof m.content === "string") { m.content = text; return true; }
    if (typeof m.mes === "string") { m.mes = text; return true; }
    m.content = text;
    return true;
}

export function lastUserIndex(chat) {
    if (!Array.isArray(chat)) return -1;
    for (let i = chat.length - 1; i >= 0; i--) {
        const m = chat[i];
        if (!m) continue;
        const hasText = (typeof m.content === "string") || (typeof m.mes === "string");
        if (hasText && isUserMessage(m)) return i;
    }
    return -1;
}

/** 纯函数：把一段资料追加到最后一条玩家消息里（原地改，返回是否改过） */
export function appendToLastUser(chat, block, marker) {
    const idx = lastUserIndex(chat);
    if (idx < 0 || !block) return false;
    const msg = chat[idx];
    const tag = marker || "【查卡器资料】";
    const prev = messageText(msg);
    if (prev.indexOf(tag) >= 0) return false;   // 已有就别重复追加（认 content / mes 两种形状）
    return setMessageText(msg, prev + "\n\n" + tag + "\n" + block);   // 写回这条消息原本用的字段
}


/** 纯函数：把上一轮追加过的资料去掉（切开关/换内容时不残留） */
export function stripMarker(chat, marker) {
    const tag = marker || "【查卡器资料】";
    let n = 0;
    if (!Array.isArray(chat)) return 0;
    for (const m of chat) {
        const text = messageText(m);
        if (!text) continue;
        const at = text.indexOf("\n\n" + tag);
        if (at >= 0) { setMessageText(m, text.slice(0, at)); n++; }
    }
    return n;
}


/** 纯函数+注册表：算这次要追加的资料 —— 从最后一条玩家消息里识别卡（不需要额外输入） */
export async function buildBlock(chat) {
    if (!registry.has("resolveCards")) return "";
    const idx = lastUserIndex(chat);
    if (idx < 0) return "";
    const text = messageText(chat[idx]);
    if (!text.trim()) return "";
    try {
        const cards = await registry.call("resolveCards", text);
        if (!cards || !cards.length) return "";
        const rows = [];
        for (const c of cards.slice(0, 6)) rows.push("【" + c.name + "】" + String(c.text || "").slice(0, 500));
        // 资料末尾固定附上「仅供参考 / 是否采用由你决定」：与注入路径同一份文案，用户改「提示词 → 判断提示」时两处同时变。
        // 每张卡片行已截断到 500 字，标注不会被挤掉（这条路径没有预算截断）。
        const judge = String(judgeText() || "").trim();
        return rows.join(String.fromCharCode(10) + String.fromCharCode(10)) + (judge ? String.fromCharCode(10, 10) + judge : "");
    } catch (error) { return ""; }
}

/** 处理一次"发送体就绪"事件：原地改 chat。返回改动条数（0 表示没动） */
export async function handlePromptReady(eventData) {
    if (!eventData || eventData.dryRun === true) return 0;                // 预览/计数不算真发送
    const chat = eventData.chat;
    if (!Array.isArray(chat) || !chat.length) return 0;
    try { if (typeof settings.isolationActive === "function" && settings.isolationActive()) return 0; } catch (error) { /* 没有该能力就继续 */ }
    const mode = String(settings.get("bodyEditMode") || "off");
    if (mode !== "append") { const n = stripMarker(chat); if (n) log("发送体", "已清掉上一轮追加的资料 " + n + " 处"); return 0; }
    const block = await buildBlock(chat);
    if (!block) return 0;
    const changed = appendToLastUser(chat, block) ? 1 : 0;
    if (changed) log("发送体", "已把资料追加到最后一条玩家消息（" + block.length + " 字）");
    return changed;
}

/** 注册：拿到宿主 eventSource 后由事件层调用（事件名缺失时安全跳过） */
export function installSendBody(source, eventTypes, name) {
    if (!source || typeof source.on !== "function") return false;
    const key = name || "CHAT_COMPLETION_PROMPT_READY";
    const mapped = function (k) { return (eventTypes && eventTypes[k]) || k; };
    let mounted = 0;
    // ① 官方 ST 钩子（真正基于 SillyTavern 生成链路时有效）
    try {
        source.on(mapped(key), function (eventData) {
            Promise.resolve(handlePromptReady(eventData)).catch(function (error) {
                log("发送体", "处理失败（不影响发送）：" + (error && error.message ? error.message : error));
            });
        });
        mounted++;
        log("发送体", "已挂上发送体钩子：" + mapped(key));
    } catch (error) { log("发送体", "官方钩子挂载失败（不影响发送）：" + (error && error.message ? error.message : error)); }
    // ② v1 的兜底通道：桌面客户端（tt）既不执行 generate_interceptor、也不触发上面的官方钩子，
    //    只在 GENERATION_AFTER_COMMANDS（提示词组装前）与 MESSAGE_SENT 触发 —— 资料必须在这里追加才进本次发送。
    const runChannel = function (label) {
        try {
            const c = ctx();
            const chat = (c && Array.isArray(c.chat)) ? c.chat : null;
            if (!chat || !chat.length) return;
            Promise.resolve(handlePromptReady({ chat: chat })).then(function (n) {
                if (n) log("发送体", label + "：已把资料追加进即将发送的消息（" + n + " 处）");
                if (registry.has("injectFallback:run")) {
                    return registry.call("injectFallback:run").then(function (r) {
                        if (r && r.ok) log("兜底", label + " 兜底注入 " + r.chars + " 字");
                    });
                }
            }).catch(function (error) {
                log("发送体", label + " 处理失败（不影响发送）：" + (error && error.message ? error.message : error));
            });
        } catch (error) { try { log("发送体", label + " 异常（不影响发送）：" + (error && error.message ? error.message : error)); } catch (e2) { /* 忽略 */ } }
    };
    for (const k of ["GENERATION_AFTER_COMMANDS", "MESSAGE_SENT"]) {
        try {
            source.on(mapped(k), function (a) { if (String(a || "") === "quiet") return; runChannel(mapped(k)); });
            mounted++;
            log("发送体", "已挂兜底通道：" + mapped(k));
        } catch (error) { log("发送体", "兜底通道挂载失败：" + mapped(k)); }
    }
    return mounted > 0;
}

export function registerSendBody() {
    registry.provide("sendbody:handle", async function (data) { return await handlePromptReady(data); });
    registry.provide("sendbody:on", function (source, eventTypes) { return installSendBody(source, eventTypes); });
}

export const sendbody = { MODES, messageText, isUserMessage, setMessageText, handlePromptReady, appendToLastUser, stripMarker, lastUserIndex, buildBlock, installSendBody, registerSendBody };
