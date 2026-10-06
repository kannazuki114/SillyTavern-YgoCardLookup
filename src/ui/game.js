import { waitForElement } from "./prompt.js";
import { ctx, log } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { registry } from "../core/registry.js";
import { escapeHtml } from "./result.js";
import { writeBuyRequest } from "./sendbox.js";
import { getStatsIndex } from "../data/indexes.js";
import { imageUrl, findCard, parseTypeText } from "../data/cards.js";
import { collectionState, pickSeeded, shopSeed, chatScopeKey, todayKey } from "../data/collection.js";
import { getBoard, PHASES, SIDE_LABEL, recapRows } from "../data/board.js";

/** ── 统一模板（界面模块）：常量 → 纯函数（生成 HTML） → 打开 → register → exports ── */

/** 1) 常量 */
export const ZONE_LABEL = { field: "场上", hand: "手牌", grave: "墓地", extra: "额外", banished: "除外" };
export const GRID_CLASS = "ygo2-grid";

/** 2) 纯函数（都可断言，不碰 DOM） */
function cardsGrid(items) {
    return '<div class="' + GRID_CLASS + '">' + items.map(function (it) {
        return '<figure class="ygo2-cell' + (it.dim ? " dim" : "") + '">' +
            (it.id ? '<img loading="lazy" src="' + escapeHtml(imageUrl(it.id)) + '" alt="">' : '<div class="ygo2-cell-ph">?</div>') +
            '<figcaption title="' + escapeHtml(it.name || "") + '">' + escapeHtml(it.name || "") + '</figcaption>' +
            (it.note ? '<span class="ygo2-cell-note">' + escapeHtml(it.note) + '</span>' : "") +
            (it.buy ? '<div class="ygo2-buy menu_button" data-ygo2-buy="' + escapeHtml(it.buy) + '">购买</div>' : "") +
            '</figure>';
    }).join("") + '</div>';
}

/** 收藏册：已收集卡 + 进度（未收集的只显示数量，不铺满屏） */
export async function collectionHtml(args) {
    const state = collectionState();
    const stats = await getStatsIndex();
    const kinds = Object.keys(state.map).length;
    const total = stats.rows.length;
    const pct = total ? (kinds / total * 100) : 0;
    const owned = Object.keys(state.map).map(function (id) { return stats.byId.get(String(id)); }).filter(Boolean);
    let picked = owned;
    const keyword = String((args && args.series) || "").trim();
    if (keyword) picked = owned.filter(function (r) { return r.name.indexOf(keyword) >= 0; });
    picked = picked.slice(0, 240);
    return '<div class="ygo2-view">' +
        '<div class="ygo2-view-head">📖 收藏册<small>已收集 ' + kinds + " / " + total + " 种（" + pct.toFixed(1) + "%）｜累计抽到 " + state.total + ' 张' + (keyword ? "｜筛选：" + escapeHtml(keyword) : "") + '</small></div>' +
        '<div class="ygo2-progress"><i style="width:' + pct.toFixed(2) + '%"></i></div>' +
        (picked.length ? cardsGrid(picked.map(function (r) { return { id: r.id, name: r.name, note: (state.map[r.id] || 0) + " 张" }; }))
            : '<div class="ygo2-empty">' + (keyword ? "这个系列还没有收集到卡。" : "还没有收集到卡：开卡包、抽卡或商店获得后会记在这里。") + '</div>') +
        '</div>';
}

/** 每日商店：当天固定的几件（同一天同一聊天不变） */
export async function shopHtml(args) {
    const stats = await getStatsIndex();
    const size = Math.max(1, Math.min(20, Number((args && args.size) || settings.get("shopSize")) || 5));
    const day = (args && args.date) || todayKey();
    const includeDiy = settings.get("shopIncludeDiy") !== false;
    const pool = stats.rows.map(function (r) { return r.id; });
    if (includeDiy) for (const c of settings.get("diyCards") || []) if (c && c.name) pool.push("diy:" + c.name);
    const picked = pickSeeded(pool, size, shopSeed(day, chatScopeKey()));
    const items = picked.map(function (id) {
        if (String(id).indexOf("diy:") === 0) return { name: String(id).slice(4) + "（DIY 卡）", note: "DIY", buy: String(id).slice(4) };
        const row = stats.byId.get(String(id));
        return row ? { id: row.id, name: row.name, note: row.typeText ? row.typeText.slice(0, 18) : "", buy: row.name } : null;
    }).filter(Boolean);
    return '<div class="ygo2-view">' +
        '<div class="ygo2-view-head">🏪 每日商店 · ' + escapeHtml(day) + '<small>共 ' + items.length + ' 件｜同一天同一聊天固定不变，过一天才会换一批（不能刷新）</small></div>' +
        cardsGrid(items) +
        '</div>';
}

/** 决斗盘：双方 LP / 场上 / 手牌 / 墓地 + 回合与阶段 */
export async function boardHtml() {
    const b = getBoard();
    const side = function (key) {
        const s = b[key];
        const zone = function (name) {
            const list = s[name] || [];
            return '<div class="ygo2-zone"><b>' + ZONE_LABEL[name] + '（' + list.length + '）</b>' +
                (list.length ? list.map(function (c) { return '<span class="ygo2-chip" title="' + escapeHtml(c.position || "") + '">' + escapeHtml(c.name) + '</span>'; }).join("") : '<span class="ygo2-chip-empty">空</span>') + '</div>';
        };
        return '<div class="ygo2-side ' + (key === "me" ? "me" : "opp") + '">' +
            '<div class="ygo2-side-head">' + SIDE_LABEL[key] + '<b>LP ' + s.lp + '</b></div>' +
            zone("field") + zone("hand") + zone("grave") +
            '</div>';
    };
    return '<div class="ygo2-view">' +
        '<div class="ygo2-view-head">⚔️ 决斗盘 · 第 ' + b.turn + ' 回合 · ' + PHASES[b.phaseIndex] + '<small>盘面只记录事实，谁强谁弱由 AI 判断</small></div>' +
        '<div class="ygo2-board">' + side("opp") + side("me") + '</div>' +
        (b.log.length ? '<div class="ygo2-board-log">最近：' + b.log.slice(-6).map(escapeHtml).join("；") + '</div>' : "") +
        '</div>';
}

/** 本局卡表：聊到过的卡（图形版） */
export async function recapHtml(args) {
    const res = await recapRows((args && args.limit) || 60);
    return '<div class="ygo2-view">' +
        '<div class="ygo2-view-head">📜 本局卡表<small>共 ' + res.rows.length + ' 种（扫描：' + (res.scale === "all" ? "最近 30 条消息" : "最近 5 条玩家消息") + '）</small></div>' +
        (res.rows.length ? cardsGrid(res.rows.map(function (r) { return { id: r.id, name: r.name, note: r.typeText ? r.typeText.slice(0, 16) : "" }; }))
            : '<div class="ygo2-empty">本局还没识别到卡名。</div>') +
        '</div>';
}

/** 单卡图形视图：卡图 + 数值表 */
export async function cardHtml(query) {
    const row = await findCard(query);
    if (!row) return '<div class="ygo2-view"><div class="ygo2-empty">没有找到「' + escapeHtml(String(query || "")) + '」。</div></div>';
    const t = parseTypeText(row.typeText);
    const pairs = [
        ["密码(ID)", row.id], ["CID", row.cid || "-"], ["英文名", row.en || "-"],
        ["别名", (row.aliases || []).join(" / ") || "-"],
        ["类型", (t.kinds || []).join("｜") || "-"],
        ["种族 / 属性", (t.race || "-") + " / " + (t.attribute || "-")],
        [t.levelMark === "☆" ? "阶级" : "星级", t.level ? t.levelMark + t.level : "-"],
        ["连接值", t.link ? "LINK-" + t.link : "-"],
        ["攻击 / 守备", (t.atk === "" ? "?" : t.atk) + " / " + (t.def === "" ? "?" : t.def)],
    ];
    return '<div class="ygo2-view ygo2-card-view">' +
        '<div class="ygo2-card-figure"><img src="' + escapeHtml(imageUrl(row.id)) + '" alt=""><div class="ygo2-card-name">' + escapeHtml(row.name) + '</div></div>' +
        '<table class="ygo2-card-table">' + pairs.map(function (p) { return '<tr><th>' + escapeHtml(p[0]) + '</th><td>' + escapeHtml(String(p[1])) + '</td></tr>'; }).join("") + '</table>' +
        '</div>';
}
/** 查卡入口：弹窗内输入（不依赖宿主的 prompt，tt 里也能用） */
export async function openCardInput() {
    const c = ctx();
    if (!c || typeof c.callGenericPopup !== "function") return "当前环境不支持弹窗，请用 /ygocard <卡名> 查询。";
    const types = c.POPUP_TYPE || {};
    const html = '<div class="ygo2-view"><div class="ygo2-view-head">查询卡片<small>输入卡名 / 别名 / 英文名 / 8 位卡密，回车或点「查询」</small></div>' +
        '<input class="text_pole" id="ygo2_card_query" type="text" placeholder="例如：青眼白龙 / Blue-Eyes / 89631139" style="width:100%">' +
        '<div class="ygo2-diy-actions"><div class="menu_button" id="ygo2_card_go">查询</div></div></div>';
    const promise = c.callGenericPopup(html, types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "关闭" });
    try {
        const box = await waitForElement("ygo2_card_query");
        if (box) {
            const d = typeof document !== "undefined" ? document : null;
            const go = d ? d.getElementById("ygo2_card_go") : null;
            const run = async function () {
                const q = String(box.value || "").trim();
                if (!q) return;
                const detail = await cardHtml(q);
                const wrap = box.parentNode;
                if (wrap) wrap.innerHTML = detail;
            };
            if (go) go.addEventListener("click", function () { Promise.resolve(run()).catch(function () { /* 忽略 */ }); });
            box.addEventListener("keydown", function (e) { if (e && e.key === "Enter") { Promise.resolve(run()).catch(function () { /* 忽略 */ }); } });
            try { box.focus(); } catch (error) { /* 忽略 */ }
        }
    } catch (error) { log("界面", "查卡输入框绑定失败：" + (error && error.message ? error.message : error)); }
    try { await promise; } catch (error) { /* 关闭方式不影响 */ }
    return "查卡弹窗已关闭。";
}

export async function openCard(args) { return await showView("卡牌 · " + String((args && args.query) || ""), await cardHtml(args && args.query)); }

/** 点击委派：商店里的「购买」按钮只把文字写进发送栏（不改状态，发不发由用户决定） */
let delegated = false;
export function installBuyDelegate() {
    if (delegated) return false;
    const d = (typeof document !== "undefined") ? document : null;
    if (!d || typeof d.addEventListener !== "function") return false;
    d.addEventListener("click", function (event) {
        const el = event && event.target && event.target.closest ? event.target.closest("[data-ygo2-buy]") : null;
        if (!el) return;
        const name = el.getAttribute("data-ygo2-buy") || "";
        const res = writeBuyRequest(name);
        if (res && res.ok) { try { if (typeof event.preventDefault === "function") event.preventDefault(); } catch (error) { /* 忽略 */ } }
    }, true);
    delegated = true;
    log("界面", "已安装商店「购买」点击委派（只写发送栏）");
    return true;
}

/** 3) 打开：统一走弹窗（受 resultPopup 开关控制） */
export async function showView(title, html) {
    const c = ctx();
    if (settings.get("resultPopup") === false || !c || typeof c.callGenericPopup !== "function") {
        // 面板「结果用弹窗面板显示」关掉时，以前这里直接 return false —— 收藏册/商店/决斗盘/本局卡表/查卡/两个编辑器
        // 全都变成"按了没反应"。现在退回文本：走按钮的 toast/日志通道，用户至少能看到内容。
        const plain = String(html || "")
            .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<br\s*\/?>/gi, "\n").replace(/<\/[^>]+>/g, " ").replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        log("界面", "未弹窗（" + title + "）：" + plain.slice(0, 200));
        return plain ? (title + "：\n" + plain.slice(0, 4000)) : false;
    }
    const types = c.POPUP_TYPE || {};
    try {
        await c.callGenericPopup(html, types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "关闭" });
        log("界面", "已显示 " + title);
        return true;
    } catch (error) { log("界面", title + " 弹窗失败：" + (error && error.message ? error.message : error)); return false; }
}

export async function openCollection(args) { return await showView("收藏册", await collectionHtml(args)); }
export async function openShop(args) { return await showView("每日商店", await shopHtml(args)); }
export async function openBoard() { return await showView("决斗盘", await boardHtml()); }
export async function openRecap(args) { return await showView("本局卡表", await recapHtml(args)); }

/** 4) 注册能力 */
export function registerGameUi() {
    registry.provide("ui:collection", async function (args) { return await openCollection(args); });
    registry.provide("ui:shop", async function (args) { return await openShop(args); });
    registry.provide("ui:board", async function () { return await openBoard(); });
    registry.provide("ui:recap", async function (args) { return await openRecap(args); });
    registry.provide("ui:card", async function (args) { return await openCard(args); });
    log("界面", "图形面板已注册（收藏册 / 商店 / 决斗盘 / 本局卡表）");
}

export const gameUi = { ZONE_LABEL, openCardInput, installBuyDelegate, cardHtml, openCard, GRID_CLASS, collectionHtml, shopHtml, boardHtml, recapHtml, showView, openCollection, openShop, openBoard, openRecap, registerGameUi };
