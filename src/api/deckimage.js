import { ctx, log } from "../core/bus.js";
import { deckArgText, deckFromChat } from "../data/deck.js";
import { registry } from "../core/registry.js";
import { settings } from "../core/settings.js";
import { escapeHtml } from "../ui/result.js";
import { getStatsIndex, normalizeKey } from "../data/indexes.js";
import { parseDeckText } from "../data/deck.js";
import { imageUrl } from "../data/cards.js";

/** ── 统一模板（接口模块）：常量 → 纯函数 → 打开 → register → exports ── */

/** 1) 常量 */
export const GROUPS = [["主卡组", "main"], ["额外卡组", "extra"], ["副卡组", "side"]];

/** 2) 纯函数：卡表 → {entries, unknown, stats}（全部本地解析，失败项单独列出） */
export async function resolveDeck(text) {
    const pickedDI = deckArgText(text);
    const deck = parseDeckText(pickedDI.text);
    const stats = await getStatsIndex();
    const out = { main: [], extra: [], side: [], unknown: [], counts: { main: 0, extra: 0, side: 0 }, kinds: { monster: 0, spell: 0, trap: 0 } };
    for (const group of GROUPS) {
        const bucket = group[1];
        for (const item of deck[bucket] || []) {
            const row = stats.byId.get(String(item.name)) || stats.byName.get(normalizeKey(item.name));
            if (!row) { out.unknown.push(item.name + "×" + item.count); continue; }
            out[bucket].push({ row: row, count: item.count, input: item.name });
            out.counts[bucket] += item.count;
            const text2 = String(row.typeText || "");
            if (text2.indexOf("[怪兽") >= 0) out.kinds.monster += item.count;
            else if (text2.indexOf("[魔法") >= 0) out.kinds.spell += item.count;
            else if (text2.indexOf("[陷阱") >= 0) out.kinds.trap += item.count;
        }
    }
    return out;
}

/** 纯函数：生成独立 HTML 展示页（暗色网格；可单独断言） */
export function deckImageHtml(resolved) {
    // 防御：传进来的是 Promise（忘了 await）或缺 counts 时，给出可读提示而不是抛异常
    if (resolved && typeof resolved.then === "function") return '<div class="ygo2-view"><div class="ygo2-view-head">卡组展示图</div><div>数据还没准备好（resolveDeck 是异步的，请先 await 再传入）。</div></div>';
    const r = resolved || { main: [], extra: [], side: [], counts: {}, kinds: {}, unknown: [] };
    if (!r.counts || typeof r.counts !== "object") r.counts = { main: 0, extra: 0, side: 0 };
    const total = (r.counts.main || 0) + (r.counts.extra || 0) + (r.counts.side || 0);
    const sections = [];
    for (const group of GROUPS) {
        const items = r[group[1]] || [];
        if (!items.length) continue;
        const cells = [];
        for (const item of items) {
            for (let i = 0; i < item.count; i++) {
                cells.push('<figure class="c"><img loading="lazy" src="' + escapeHtml(imageUrl(item.row.id)) + '" alt=""><figcaption>' + escapeHtml(item.row.name) + '</figcaption></figure>');
            }
        }
        sections.push('<h2>' + group[0] + '（' + (r.counts[group[1]] || 0) + '）</h2><div class="g">' + cells.join("") + '</div>');
    }
    const meta = '合计 ' + total + ' 张 · 怪兽 ' + (r.kinds.monster || 0) + ' / 魔法 ' + (r.kinds.spell || 0) + ' / 陷阱 ' + (r.kinds.trap || 0)
        + (r.unknown && r.unknown.length ? ' · 未识别 ' + r.unknown.length + ' 条' : '');
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>游戏王卡组 · ' + total + ' 张</title><style>'
        + 'body{font-family:system-ui,"Microsoft YaHei",sans-serif;background:#14161a;color:#e8e8e8;margin:0;padding:24px}'
        + 'h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 10px;color:#9fd0ff;font-weight:600}'
        + '.meta{color:#9aa0a6;font-size:13px;margin-bottom:8px}'
        + '.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}'
        + '.c{margin:0;background:#1d2026;border:1px solid #2a2e36;border-radius:6px;padding:4px}'
        + '.c img{width:100%;display:block;border-radius:4px}'
        + '.c figcaption{font-size:11px;color:#c9ccd1;margin-top:4px;line-height:1.25;word-break:break-all}'
        + '</style></head><body><h1>游戏王卡组 · ' + total + ' 张</h1><div class="meta">' + escapeHtml(meta) + '</div>'
        + sections.join("")
        + (r.unknown && r.unknown.length ? '<h2>未识别（' + r.unknown.length + '）</h2><div class="meta">' + escapeHtml(r.unknown.join("、")) + '</div>' : '')
        + '</body></html>';
}

/** 纯函数：文本摘要（命令/简报用） */
export async function deckImageText(text) {
    const r = await resolveDeck(text);
    const total = (r.counts.main || 0) + (r.counts.extra || 0) + (r.counts.side || 0);
    if (!total) return "卡表里没有能在本地卡库匹配到的卡（请检查译名）。" + (r.unknown.length ? " 未识别：" + r.unknown.join("、") : "");
    return "🃏 卡组展示图已生成：合计 " + total + " 张（主 " + r.counts.main + " / 额外 " + r.counts.extra + " / 副 " + r.counts.side + "）"
        + "，怪兽 " + r.kinds.monster + " / 魔法 " + r.kinds.spell + " / 陷阱 " + r.kinds.trap
        + (r.unknown.length ? "；未识别 " + r.unknown.length + " 条：" + r.unknown.slice(0, 6).join("、") : "");
}

/** 从最近几条聊天里找一份"能解析出主卡组"的卡表（面板按钮 / 自然语言触发共用） */
export function latestDeckText(maxScan) {
    const c = ctx();
    const chat = Array.isArray(c.chat) ? c.chat : [];
    const limit = Math.max(1, Number(maxScan) || 5);
    const block = deckFromChat(chat, limit);
    if (block) return block;
    for (let i = chat.length - 1, n = 0; i >= 0 && n < limit; i--) {
        const mes = String((chat[i] && chat[i].mes) || "");
        if (!mes) continue;
        if (mes.indexOf("卡组") < 0 && mes.indexOf("主卡组") < 0 && mes.indexOf("<deck>") < 0) continue;
        n++;
        const picked = deckArgText(mes);
        const body = picked && picked.text ? picked.text : mes;
        // 必须有"数量 + 卡名"的行，且至少 3 行，才当卡表（避免把随口一句"卡组"当成卡表）
        if (!/\d+\s*\S+/.test(body) || body.split("\n").length < 3) continue;
        if (parseDeckText(body).main.length) return body;
    }
    return "";
}

/** 3) 打开：新标签页（Blob）优先，回退到弹窗预览 */
export async function openDeckImage(text) {
    const r = await resolveDeck(text);
    const total = (r.counts.main || 0) + (r.counts.extra || 0) + (r.counts.side || 0);
    if (!total) return await deckImageText(text);
    const html = deckImageHtml(r);
    const c = ctx();
    const w = typeof window !== "undefined" ? window : null;
    try {
        if (w && typeof w.open === "function" && typeof URL !== "undefined" && typeof Blob !== "undefined") {
            const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
            const tab = w.open(url, "_blank");
            if (tab) { log("卡组图", "已在新标签页打开（" + total + " 张）"); return await deckImageText(text) + "（已在新标签页打开）"; }
        }
    } catch (error) { log("卡组图", "新标签页打开失败：" + (error && error.message ? error.message : error)); }
    if (c && typeof c.callGenericPopup === "function") {
        const types = c.POPUP_TYPE || {};
        try {
            await c.callGenericPopup(html, types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "关闭" });
            return await deckImageText(text);
        } catch (error) { log("卡组图", "弹窗预览失败：" + (error && error.message ? error.message : error)); }
    }
    return await deckImageText(text) + "（当前环境无法打开图片页）";
}

/** 4) 注册能力 */
export function registerDeckImage() {
    registry.provide("cmd:deckimage", async function (args) {
        const text = deckArgText(args).text;
        if (!text) return "要生成卡组图的话，请把卡表贴在命令后面（每行「3 卡名」），或先发一条卡表消息。";
        return await openDeckImage(text);
    });
    // 面板按钮走的就是这个能力（index.js 的 PANEL_ACTIONS.deckImage）；以前只有 cmd:/runAction: 两个键，
    // 按钮必然报「未注册的能力：tool:deckimage」。
    registry.provide("tool:deckimage", async function (args) {
        const a = args || {};
        const given = String(a.deck || a.text || "").trim();
        if (given) return await openDeckImage(given);
        const found = latestDeckText(5);
        if (!found) return "聊天里没找到卡表。把卡组写成 <deck>…</deck>（每行「3 卡名」）发一条消息，或直接把卡表贴在命令后面：/ygodeckimage 3 青眼白龙";
        return await openDeckImage(found);
    });
    registry.provide("runAction:deckimage", async function (trigger) {
        if (!trigger || trigger.action !== "deckimage") return [];
        // ★ 正则以前写成 /d+s*S+/（反斜杠丢了）→ 永远不匹配，自然语言「卡组图」永远没结果
        const found = latestDeckText(3);
        if (!found) return [];
        return [{ name: "卡组展示图", text: await openDeckImage(found) }];
    });
    log("接口", "卡组展示图已注册（cmd:deckimage / tool:deckimage / runAction:deckimage）");
}

export const deckImage = { GROUPS, resolveDeck, deckImageHtml, deckImageText, openDeckImage, latestDeckText, registerDeckImage };
