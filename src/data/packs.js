import { log } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { registry } from "../core/registry.js";
import { fetchJson, cached, lazyIndex } from "../core/http.js";
import { getStatsIndex, normalizeKey } from "./indexes.js";
import { addToCollection } from "./collection.js";
import { findCard } from "./cards.js";

/** ── 统一模板（数据模块）：常量 → 纯函数 → 懒索引 → register → exports ── */

/** 1) 常量 */
export const RELEASE_URL = "https://ygocdb.com/api/v0/releaseDates.json";
export const REGIONS = ["sc", "jp", "en"];
export const REGION_LABEL = { sc: "简中", jp: "日文", en: "英文" };

let fetchImpl = null;
let rng = Math.random;
export function configure(options) {
    if (options && typeof options.fetchJson === "function") fetchImpl = options.fetchJson;
    if (options && typeof options.random === "function") rng = options.random;
}
function doFetch(url, ms) { return fetchImpl ? fetchImpl(url, ms) : fetchJson(url, {}, ms); }

/** 2) 纯函数 */
/** 按 地区+包名 分组，还原每个真实卡包的首发卡池 */
export function buildPackIndex(rows) {
    const packs = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        const rel = row && row.release;
        if (!rel) continue;
        for (const region of Object.keys(rel)) {
            const info = rel[region] || {};
            const name = String(info.pack || "").trim();
            if (!name) continue;
            const key = region + "|" + name;
            let pack = packs.get(key);
            if (!pack) { pack = { key: key, region: region, name: name, date: String(info.date || ""), cards: [] }; packs.set(key, pack); }
            pack.cards.push(String(row.id));
            if (info.date && (!pack.date || String(info.date) < pack.date)) pack.date = String(info.date);
        }
    }
    return [...packs.values()];
}

export function listPacks(index, options) {
    const o = options || {};
    const keyword = normalizeKey(o.keyword || "");
    const region = o.region && o.region !== "any" ? o.region : null;
    const limit = Math.max(1, Math.min(200, Number(o.limit) || 25));
    let list = (index || []).slice();
    if (region) list = list.filter(function (p) { return p.region === region; });
    if (keyword) list = list.filter(function (p) { return normalizeKey(p.name).indexOf(keyword) >= 0; });
    list.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    return { total: list.length, items: list.slice(0, limit) };
}

export function findPack(index, name, region) {
    const key = normalizeKey(name || "");
    if (!key) return null;
    const candidates = (index || []).filter(function (p) { return !region || p.region === region; });
    let exact = candidates.filter(function (p) { return normalizeKey(p.name) === key; });
    if (exact.length) return exact[0];
    let partial = candidates.filter(function (p) { return normalizeKey(p.name).indexOf(key) >= 0; });
    if (partial.length) { partial.sort(function (a, b) { return b.cards.length - a.cards.length; }); return partial[0]; }
    return null;
}

/** 从卡池抽 n 张（rng 可注入 → 可确定性测试） */
/** 卡池开关（面板「玩法」组）：关掉的类别不进入卡池 —— 与 v1 同一套判定 */
export const POOL_SWITCHES = [["poolSynchro", ["同调"]], ["poolXyz", ["超量"]], ["poolPendulum", ["灵摆"]], ["poolLink", ["连接", "链接"]]];
export function poolExcludes(row) {
    const text = String((row && row.typeText) || "");
    for (const pair of POOL_SWITCHES) {
        if (settings.get(pair[0]) === false && pair[1].some(function (k) { return text.indexOf(k) >= 0; })) return true;
    }
    return false;
}
/** 按开关过滤后的卡池（stats 可选，用于把 id 还原成行） */
export function poolInPlay(pool, stats) {
    if (!stats) return pool || [];
    return (pool || []).filter(function (id) { const row = stats.byId.get(String(id)); return row ? !poolExcludes(row) : true; });
}
/** 一包抽几张（面板「玩法 → 每包几张」，1-20；v1 默认 5） */
export function packCount(args) {
    const a = args || {};
    return Math.max(1, Math.min(20, Number(a.count) || Number(settings.get("packSize")) || 5));
}

export function drawFromPool(pool, count, random) {
    const pick = random || rng;
    const list = (pool || []).slice();
    const want = Math.max(1, Math.min(list.length, Number(count) || 1));
    const out = [];
    while (out.length < want && list.length) {
        const i = Math.floor(pick() * list.length) % list.length;
        out.push(list.splice(i, 1)[0]);
    }
    return out;
}

/** 抽到的卡里有没有"额外卡组类型"（用来给 VRM 一个明确的稀有判定，规则写在注释里可复核） */
export function isRareDraw(cards) {
    return (cards || []).some(function (c) { return /融合|同调|超量|连接|仪式/.test(String((c && c.typeText) || "")); });
}

/** 开完包触发联动（VRM 表情）；失败/未开都不影响开包结果 */
function firePackReaction(cards) {
    try {
        if (!registry.has("integration:vrm")) return;
        const event = isRareDraw(cards) ? "pack_rare" : "pack_normal";
        Promise.resolve(registry.call("integration:vrm", { event: event })).catch(function () { /* 联动失败不影响开包 */ });
    } catch (error) { /* 忽略 */ }
}

export function formatPackDraw(pack, cards) {
    const lines = ["🎴 开卡包：" + pack.name + "（" + REGION_LABEL[pack.region] + (pack.date ? " · " + pack.date : "") + "）"];
    lines.push("该包首发卡池 " + pack.cards.length + " 张，抽 " + cards.length + " 张：");
    for (let i = 0; i < cards.length; i++) {
        lines.push("", "[" + (i + 1) + "] " + cards[i].name + "（" + cards[i].id + "）", cards[i].typeText);
        lines.push("卡图: ![](" + cards[i].image + ")");
    }
    return lines.join("\n");
}

/** 3) 懒索引 */
export const getReleaseRows = lazyIndex(async function () {
    return await cached("releases", 12 * 3600 * 1000, async function () { return await doFetch(RELEASE_URL, 60000); });
});
export const getPackIndex = lazyIndex(async function () {
    const rows = await getReleaseRows();
    const index = buildPackIndex(rows);
    log("数据", "卡包索引已建立：" + index.length + " 个卡包");
    return index;
});

/** 行(带 image/name/typeText) 组装：供开包展示 */
async function rowsToCards(ids) {
    const stats = await getStatsIndex();
    const out = [];
    for (const id of ids) {
        const row = stats.byId.get(String(id));
        if (!row) continue;
        out.push({ id: row.id, cid: row.cid, name: row.name, typeText: row.typeText, image: "https://cdn.233.momobako.com/ygopro/pics/" + row.id + ".jpg" });
    }
    return out;
}

/** 4) 业务文本（工具与命令共用） */
export async function openPackText(args) {
    const index = await getPackIndex();
    const region = args.region && REGIONS.indexOf(args.region) >= 0 ? args.region : (settings.get("packRegion") || "sc");   // 面板「玩法 → 卡包地区」
    const minSize = Math.max(1, Number(settings.get("packMinSize")) || 20);   // 面板「玩法 → 卡池下限」
    let pack = args.pack ? findPack(index, args.pack, args.region ? region : null) : null;
    if (pack && minSize > 1 && (pack.cards || []).length < minSize) { log("数据", "卡包「" + pack.name + "」卡池 " + (pack.cards || []).length + " 张 < 下限 " + minSize + "，改随机抽"); pack = null; }
    if (!pack) {
        // 没指定包名时：从卡库里随机抽（保底体验，不编造卡包）
        const stats = await getStatsIndex();
        const pool = stats.rows.map(function (r) { return r.id; });
        const picked = drawFromPool(poolInPlay(pool.concat(diyPoolEntries().map(function (d) { return d.id; })), stats), packCount(args), rng);
        const cards = await rowsToCards(picked);
        try { addToCollection(picked); } catch (error) { /* 卡册记录失败不影响抽卡 */ }
        return "🎴 没有指定卡包名，从现有卡库随机抽 " + cards.length + " 张：\n" + cards.map(function (c, i) { return (i + 1) + ". " + c.name; }).join("\n");
    }
    const picked = drawFromPool(pack.cards, packCount(args), rng);
    const cards = await rowsToCards(picked);
    try { addToCollection(picked); } catch (error) { /* 卡册记录失败不影响抽卡 */ }
    firePackReaction(cards);
    return formatPackDraw(pack, cards);
}

export async function listPacksText(args) {
    const index = await getPackIndex();
    const region = args.region || settings.get("packRegion") || "sc";   // 面板「玩法 → 卡包地区」
    const res = listPacks(index, { keyword: args.keyword, region: region, limit: 25 });
    if (!res.total) return "没有找到匹配的卡包。";
    const lines = ["卡包列表（" + (args.region ? REGION_LABEL[args.region] || args.region : "优先 " + (REGION_LABEL[region] || region)) + "，共 " + res.total + " 个匹配，按发售时间倒序显示 " + res.items.length + " 个）："];
    for (const p of res.items) lines.push("- " + p.name + "（" + (p.date || "未知") + " · " + REGION_LABEL[p.region] + " · " + p.cards.length + " 张）");
    return lines.join("\n");
}

export async function searchPacksText(args) {
    const index = await getPackIndex();
    const keyword = String(args.keyword || "").trim();
    if (!keyword) return "想查哪个关键词的卡包？";
    const byName = listPacks(index, { keyword: keyword, limit: 20 });
    const lines = ["🔎 「" + keyword + "」相关卡包"];
    if (byName.total) {
        lines.push("", "【卡包名里含「" + keyword + "」的卡包】" + byName.total + " 个：");
        for (const p of byName.items) lines.push("- " + p.name + "（" + p.date + " · " + REGION_LABEL[p.region] + "）");
    } else lines.push("", "【卡包名里含「" + keyword + "」的卡包】没有这样的卡包。");
    // 由卡名反查：该系列卡出现在哪些包里
    const stats = await getStatsIndex();
    const key = normalizeKey(keyword);
    const members = stats.rows.filter(function (r) { return normalizeKey(r.name).indexOf(key) >= 0; }).slice(0, 200);
    if (members.length) {
        const ids = new Set(members.map(function (r) { return r.id; }));
        const hit = index.filter(function (p) { return p.cards.some(function (id) { return ids.has(id); }); });
        hit.sort(function (a, b) { return b.cards.filter(function (id) { return ids.has(id); }).length - a.cards.filter(function (id) { return ids.has(id); }).length; });
        lines.push("", "【含「" + keyword + "」系列卡（" + members.length + " 张）的卡包】" + hit.length + " 个：");
        for (const p of hit.slice(0, 10)) {
            const n = p.cards.filter(function (id) { return ids.has(id); }).length;
            lines.push("- " + p.name + "（" + p.date + " · " + REGION_LABEL[p.region] + " · 含 " + n + " 张）");
        }
    }
    return lines.join("\n");
}

/** DIY 卡进卡池：把「设置里的 DIY 卡」做成和真实卡同形的条目（id 用 diy: 前缀，便于识别） */
export function diyPoolEntries() {
    if (settings.get("shopIncludeDiy") === false) return [];   // 面板「玩法 → DIY 卡也进商店 / 卡库抽卡」
    const out = [];
    for (const c of (settings.get("diyCards") || [])) {
        if (!c || !c.name) continue;
        out.push({ id: "diy:" + String(c.name), name: String(c.name), typeText: "[DIY 卡] " + String(c.typeText || ""), image: "" });
    }
    return out;
}

/** 把 DIY 条目转成展示用文本（没有卡图） */
function diyLine(entry, index) {
    return "[" + (index + 1) + "] " + entry.name + "\n" + entry.typeText + (entry.image ? "\n![](" + entry.image + ")" : "\n（DIY 卡，没有卡图）");
}

export async function drawText(args) {
    const stats = await getStatsIndex();
    const pool = stats.rows.map(function (r) { return r.id; });
    const diy = diyPoolEntries();
    for (const d of diy) pool.push(d.id);        // DIY 卡也进抽卡池
    const picked = drawFromPool(poolInPlay(pool, stats), Number(args.count) || 2, rng);
    try { addToCollection(picked); } catch (error) { /* 卡册记录失败不影响抽卡 */ }
    const diyMap = new Map(diy.map(function (d) { return [d.id, d]; }));
    const rows = [];
    const realIds = picked.filter(function (id) { return !diyMap.has(String(id)); });
    const realCards = await rowsToCards(realIds);
    let ri = 0;
    for (const id of picked) {
        const d = diyMap.get(String(id));
        rows.push(d ? diyLine(d, rows.length) : (function () { const c = realCards[ri++]; return c ? "[" + rows.length + "] " + c.name + "\n" + c.typeText + "\n![](" + c.image + ")" : ""; })());
    }
    return "🎲 随机抽卡（卡库共 " + stats.rows.length + " 张" + (diy.length ? " + DIY " + diy.length + " 张" : "") + "）\n" + rows.filter(Boolean).join("\n\n");
}

/** 触发词派发（拦截器用 runAction） */
export async function runAction(trigger) {
    const action = trigger && trigger.action;
    const arg = trigger && trigger.arg;
    if (action === "pack") return [{ name: "开卡包", text: await openPackText({ pack: arg }) }];
    if (action === "draw") return [{ name: "抽卡", text: await drawText({ count: 2 }) }];
    if (action === "packsearch") {
        // 没有关键词就明确问回去，绝不替用户猜一个卡名（曾经这里写死 "青眼"，导致查什么都是青眼）
        if (!String(arg || "").trim()) return [{ name: "卡包查询", text: "想查哪个系列的卡包？例如「白银城卡包有哪些」或「查卡包 黑魔导」。" }];
        return [{ name: "卡包查询", text: await searchPacksText({ keyword: arg }) }];
    }
    return [];
}

/** 4b) 注册能力 */
export function registerPacks() {
    registry.provide("tool:pack", async function (args) { return await openPackText(args || {}); });
    registry.provide("tool:packlist", async function (args) { return await listPacksText(args || {}); });
    registry.provide("tool:packsearch", async function (args) { return await searchPacksText(args || {}); });
    registry.provide("tool:draw", async function (args) { return await drawText(args || {}); });
    registry.provide("runAction", async function (trigger) { return await runAction(trigger); });
registry.provide("releaseDateOf", async function (id) { return await releaseDateOf(id); });
    registry.provide("index:packs", getPackIndex);
    log("数据", "卡包能力已注册（pack/packlist/packsearch/draw/runAction）");
}


/** 某张卡的首次发售日期（扫本地发售记录；找不到返回空串） *//**
 * 某张卡的首次发售日期。
 * 真实数据形状（踩过的坑）：releaseDates.json 是**数组**，元素形如
 *   { cid, id, release: { jp: { date, pack }, en: { … }, sc: { … } } }
 * 旧实现找的是 r.cards / r.card / r.date —— 这三个字段都不存在，所以「首次发售」一直是空的。
 * 这里按 r.id 查，并取各语言地区里**最早**的日期。
 */
export async function releaseDateOf(id) {
    const want = String(id || "").trim();
    if (!want) return "";
    try {
        const rows = await getReleaseRows();
        for (const r of (Array.isArray(rows) ? rows : [])) {
            if (!r) continue;
            // 新形状：按 id 精确命中，取各地区最早日期
            if (String(r.id) === want && r.release && typeof r.release === "object") {
                let best = "";
                for (const key of Object.keys(r.release)) {
                    const d = (r.release[key] && r.release[key].date) ? String(r.release[key].date) : "";
                    if (d && (!best || d < best)) best = d;
                }
                if (best) return best;
                continue;
            }
            // 兼容旧形状（{date, cards:[…]}）：留着不碍事
            const ids = Array.isArray(r.cards) ? r.cards : (r.card ? [r.card] : []);
            for (const c of ids) {
                if (String(c) !== want) continue;
                const d = String(r.date || "");
                if (d) return d;
            }
        }
        return "";
    } catch (error) { return ""; }
}
export const packs = { isRareDraw, releaseDateOf, RELEASE_URL, REGIONS, REGION_LABEL, configure, buildPackIndex, listPacks, findPack, drawFromPool, formatPackDraw, getReleaseRows, getPackIndex, openPackText, listPacksText, searchPacksText, drawText, runAction, registerPacks };
