import { settings } from "../core/settings.js";
import { ctx, log, emit, logLines } from "../core/bus.js";
import { registry } from "../core/registry.js";

/** ── 统一模板（界面模块）：常量 → 纯函数(生成 HTML) → 挂载 → exports ── */

/** 1) 常量 */
export const CLASS = { root: "ygo2-result", title: "ygo2-result-title", body: "ygo2-result-body" };

// 样式照 v1（v1 的 RESULT_STYLE / RESULT_IMG_STYLE 原样）
export const RESULT_STYLE = "font-size:14px;line-height:1.55;";
export const RESULT_IMG_STYLE = "max-width:130px;border-radius:6px;margin:3px 6px 3px 0;vertical-align:middle;border:1px solid rgba(128,128,128,.35);background:rgba(0,0,0,.08);";
// 正文滚动：v1 的 max-height:62vh + overflow:auto（配合 callGenericPopup 的 allowVerticalScrolling）
export const RESULT_BODY_STYLE = "max-height:62vh;overflow:auto;padding-right:4px";

/** 2) 纯函数（可断言、无 DOM 依赖） */
/** 转义：面板里渲染的是数据，必须防注入 */
export function escapeHtml(text) {
    return String(text === undefined || text === null ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** 把 markdown图片/表格先转成安全 HTML？—— 不转，保持纯文本 + 换行，避免渲染差异。 */
export function buildResultHtml(title, text) {
    // 照 v1 的 resultPanelHtml：先整体转义，再把 ![](url) 换成真图片，最后换行
    const safe = escapeHtml(text);
    const body = safe
        .replace(/!\[\]\(([^)\s]+)\)/g, function (m, u) { return /^https?:\/\//i.test(String(u)) ? "<img src=\"" + u + "\" style=\"" + RESULT_IMG_STYLE + "\">" : m; })
        .split("\n").join("<br>");
    return "<div class=\"" + CLASS.root + "\" style=\"" + RESULT_STYLE + "\">"
        + "<div class=\"" + CLASS.title + "\" style=\"font-weight:600;font-size:16px;margin:0 0 8px 0;padding-bottom:6px;border-bottom:1px solid rgba(128,128,128,.35)\">" + escapeHtml(title) + "</div>"
        + "<div class=\"" + CLASS.body + "\" style=\"" + RESULT_BODY_STYLE + "\">" + body + "</div>"
        + "</div>";
}

/** 3) 挂载：优先弹窗（酒馆 callGenericPopup），失败则退回控制台日志 */
let lastResult = "";
export function lastResultText() { return lastResult; }
export async function openResult(title, text, options) {
    const o = options || {};
    lastResult = String(title || "") + "\n" + String(text || "");
    const html = buildResultHtml(title, text);
    const c = ctx();
    const allowPopup = settings.get("resultPopup") !== false;
    try {
        if (allowPopup && c && typeof c.callGenericPopup === "function") {
            const types = c.POPUP_TYPE || {};
            await c.callGenericPopup(html, types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "关闭" });
            log("面板", "已弹出：" + title);
            emit("result", { title: title, chars: String(text || "").length, shown: true });
            return true;
        }
    } catch (error) { console.warn("[YGO2] 弹窗失败", error); }
    log("面板", "无法弹窗，改为日志输出：" + title + "（" + String(text || "").length + " 字）");
    emit("result", { title: title, chars: String(text || "").length, shown: false });
    if (o.logToConsole !== false) console.log("[YGO2] " + title + "\n" + String(text || ""));
    return false;
}

/** 3b) 挂到 registry：数据层只管产出文本，界面层负责展示 */
export function registerResult() {
    registry.provide("ui:result", async function (args) { return await openResult(args.title || "查卡器", args.text || "", {}); });
    registry.provide("runAction:log", async function (args) { const n = Math.max(1, Math.min(200, Number((args && args.lines) || 30))); return logLines().slice(-n).join(String.fromCharCode(10)) || "（暂无日志）"; });
    registry.provide("lastResultText", async function () { return lastResult; });
    log("面板", "结果展示能力已注册（ui:result）");
}

export const result = { CLASS, RESULT_STYLE, RESULT_IMG_STYLE, RESULT_BODY_STYLE, escapeHtml, buildResultHtml, openResult, registerResult };
