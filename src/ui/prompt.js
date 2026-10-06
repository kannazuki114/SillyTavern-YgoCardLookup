import { ctx, log } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { registry } from "../core/registry.js";
import { SHEET, JUDGE, EXTERNAL_INSTRUCTION } from "../inject/build.js";
import { escapeHtml } from "./result.js";

/** ── 统一模板（界面模块）：常量 → 纯函数 → 挂载 → register → exports ── */

/** 1) 常量：可编辑的提示词项（留空 = 用内置默认，与 v1 语义一致） */
export const ROOT_ID = "ygo2_prompt_editor";
export const FIELDS = [
    { key: "promptSheet", id: "ygo2_pe_sheet", label: "模块速查表（告诉 AI 有哪些能力、什么时候用）", rows: 10, fallback: SHEET },
    { key: "promptJudge", id: "ygo2_pe_judge", label: "卡名判断提示（把「是否采用」的决定权交给 AI）", rows: 4, fallback: JUDGE },
    { key: "injectNote", id: "ygo2_pe_note", label: "附加处理要求（每次注入都附上，留空则不加）", rows: 3, fallback: "" },
    { key: "apiInstruction", id: "ygo2_pe_ext", label: "发给外部 AI 的说明（仅在启用外部接口时用）", rows: 5, fallback: EXTERNAL_INSTRUCTION },
];

let docRef = null;
export function configure(options) {
    // 允许用 documentRef: null 显式清空（测试隔离需要；否则会把上一个测试的假文档带给别的模块）
    if (options && "documentRef" in options) docRef = options.documentRef || null;
}
function doc() { return docRef || (typeof document !== "undefined" ? document : null); }

/** 2) 纯函数 */
/** 编辑器 HTML（纯函数，可断言；内容一律转义） */
export function editorHtml(values) {
    const v = values || {};
    const parts = ['<div id="' + ROOT_ID + '" class="ygo2-prompt-editor">',
        '<p class="ygo2-pe-hint">下面是插件实际会用的提示词。<b>留空即恢复内置默认</b>；改动会立即保存。</p>',
        '<div class="ygo2-pe-bar"><div class="menu_button" id="ygo2_pe_reset">全部恢复默认</div></div>'];
    for (const f of FIELDS) {
        const raw = String(v[f.key] || "").trim();
        const shown = raw || String(f.fallback || "");
        parts.push('<label class="ygo2-label" for="' + f.id + '">' + escapeHtml(f.label) + '</label>');
        parts.push('<textarea class="text_pole ygo2-textarea" id="' + f.id + '" rows="' + f.rows + '" data-key="' + f.key + '">' + escapeHtml(shown) + '</textarea>');
        parts.push('<small class="ygo2-pe-state">' + (raw ? "【自定义】清空此项即回到默认" : "【默认】") + '</small>');
    }
    parts.push('</div>');
    return parts.join("\n");
}

/** 纯函数：等元素出现（弹窗插入 DOM 是异步的；v1 用轮询解决） */
export async function waitForElement(id, options) {
    const o = options || {};
    const tries = Number(o.tries) || 40;
    const delay = Number(o.delay) || 50;
    const getEl = o.getEl || function (x) { const d = doc(); return d ? d.getElementById(x) : null; };
    const sleep = o.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    for (let i = 0; i < tries; i++) {
        const el = getEl(id);
        if (el) return el;
        await sleep(delay);
    }
    return null;
}

/** 纯函数：把编辑框的值写入设置（留空则清空该键 → 回落默认） */
export function applyValues(values) {
    const out = {};
    for (const f of FIELDS) {
        if (!values || !(f.key in values)) continue;
        const text = String(values[f.key] === undefined || values[f.key] === null ? "" : values[f.key]);
        settings.set(f.key, text.trim() ? text : "");
        out[f.key] = text.trim() ? "自定义" : "默认";
    }
    return out;
}

/** 3) 挂载：打开编辑器（弹窗期间轮询绑定，不等关闭） */
export async function openPromptEditor() {
    const c = ctx();
    if (!c || typeof c.callGenericPopup !== "function") { log("提示词", "当前环境不支持弹窗"); return false; }
    const html = editorHtml(settings.all());
    const types = c.POPUP_TYPE || {};
    const promise = c.callGenericPopup(html, types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "保存并关闭" });
    const root = await waitForElement(ROOT_ID);
    if (!root) { log("提示词", "编辑器没有显示（弹窗被拦截或结构变化）"); return false; }
    let bound = 0;
    for (const f of FIELDS) {
        const el = root.querySelector ? root.querySelector("#" + f.id) : null;
        if (!el) continue;
        el.addEventListener("change", function () {
            const r = applyValues({ [f.key]: el.value });
            log("提示词", f.key + " → " + r[f.key]);
        });
        bound++;
    }
    const reset = root.querySelector ? root.querySelector("#ygo2_pe_reset") : null;
    if (reset) {
        reset.addEventListener("click", function () {
            applyValues({ promptSheet: "", promptJudge: "", injectNote: "", apiInstruction: "" });
            for (const f of FIELDS) {
                const el = root.querySelector ? root.querySelector("#" + f.id) : null;
                if (el) el.value = String(f.fallback || "");
            }
            log("提示词", "已全部恢复默认");
        });
    }
    log("提示词", "编辑器已打开（绑定 " + bound + "/" + FIELDS.length + " 项）");
    try { await promise; } catch (error) { /* 关闭方式不影响已保存的改动 */ }
    return bound > 0;
}

/** 4) 注册能力 */
export function registerPromptEditor() {
    registry.provide("ui:prompt", async function () { return await openPromptEditor(); });
    log("界面", "提示词编辑器已注册（ui:prompt）");
}

export const promptEditor = { ROOT_ID, FIELDS, configure, editorHtml, waitForElement, applyValues, openPromptEditor, registerPromptEditor };
