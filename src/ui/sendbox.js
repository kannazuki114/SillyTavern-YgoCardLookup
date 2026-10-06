import { ctx, log } from "../core/bus.js";
import { registry } from "../core/registry.js";

/** ── 统一模板（界面模块）：常量 → 纯函数 → 写入 → register → exports ── */

/** 1) 常量 */
export const SEND_BOX_ID = "send_textarea";
export const DEFAULT_SEPARATOR = "\n";

/** 2) 纯函数：把新文本合进发送栏现有内容（可断言） */
export function composeSendText(prev, text, options) {
    const o = options || {};
    const before = String(prev === undefined || prev === null ? "" : prev);
    const add = String(text === undefined || text === null ? "" : text);
    if (!add) return before;
    if (o.append === false) return add;                       // 替换模式
    if (!before.trim()) return add;                            // 空栏直接写
    const sep = o.separator === undefined ? DEFAULT_SEPARATOR : String(o.separator);
    return before.replace(/[ \t\n]+$/, "") + sep + add;
}

/** 3) 写入：设置值 + 派发 input 事件（酒馆据此更新内部状态）+ 聚焦 */
export function sendBoxElement() {
    const c = ctx();
    const d = (typeof document !== "undefined") ? document : null;
    if (!d) return null;
    return d.getElementById(SEND_BOX_ID)
        || (typeof d.querySelector === "function" ? d.querySelector("#" + SEND_BOX_ID) : null);
}

export function writeToSendBox(text, options) {
    const el = sendBoxElement();
    if (!el) { log("发送栏", "找不到发送栏（#" + SEND_BOX_ID + "），已跳过写入"); return { ok: false, reason: "no-send-box" }; }
    const next = composeSendText(el.value, text, options);
    el.value = next;
    // 关键：必须派发 input，否则酒馆内部状态与发送按钮不会更新
    try {
        const d = (typeof document !== "undefined") ? document : null;
        if (d && typeof d.createEvent === "function") {
            const ev = d.createEvent("Event");
            ev.initEvent("input", true, true);
            el.dispatchEvent(ev);
        } else if (typeof Event === "function") {
            el.dispatchEvent(new Event("input", { bubbles: true }));
        }
    } catch (error) { log("发送栏", "派发 input 事件失败：" + (error && error.message ? error.message : error)); }
    try { if (typeof el.focus === "function") el.focus(); } catch (error) { /* 忽略 */ }
    log("发送栏", "已写入 " + String(text || "").length + " 字（当前共 " + next.length + " 字）");
    return { ok: true, value: next };
}

/** 供外部按名字发起的便捷写入（例如「购买 青眼白龙」） */
export function writeBuyRequest(name) { return writeToSendBox("购买 " + String(name || "").trim()); }

/** 4) 注册能力（数据层不 import 界面层，统一走 registry） */
export function registerSendBox() {
    registry.provide("ui:sendbox", async function (args) { return writeToSendBox((args && args.text) || "", args || {}); });
    registry.provide("ui:buy", async function (args) { return writeBuyRequest(args && args.name); });
    log("界面", "发送栏写入能力已注册（ui:sendbox / ui:buy）");
}

export const sendbox = { SEND_BOX_ID, DEFAULT_SEPARATOR, composeSendText, sendBoxElement, writeToSendBox, writeBuyRequest, registerSendBox };
