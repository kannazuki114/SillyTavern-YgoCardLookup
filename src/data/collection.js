import { log, ctx } from "../core/bus.js";
import { registry } from "../core/registry.js";
import { settings } from "../core/settings.js";
import { getStatsIndex, normalizeKey } from "./indexes.js";
import { imageUrl, findCard } from "./cards.js";

/** ── 统一模板（数据模块）：常量 → 纯函数 → 状态存取 → register → exports ── */

/** 1) 常量 */
export const STATS_KEYS = { collection: "collection", total: "collectionTotal", recent: "collectionRecent", diy: "diyCards", aliases: "aliases" };
export const DIY_CATEGORIES = ["怪兽", "魔法", "陷阱"];
export const DIY_MONSTER_FRAMES = ["通常", "效果", "仪式", "融合", "同调", "超量", "连接", "灵摆"];

/** 2) 纯函数 */
/** 俗称表："俗称=正式名" 每行一条 */
export function parseAliases(text) {
    const map = new Map();
    for (const line of String(text || "").split("\n")) {
        const s = line.trim();
        if (!s || s.charAt(0) === "#") continue;                       // 支持 # 注释
        const parts = s.split(/[=＝:：]/);
        if (parts.length < 2) continue;
        const from = normalizeKey(parts[0]);
        const to = parts.slice(1).join("=").trim();                    // 右侧允许再出现 =
        if (from && to) map.set(from, to);
    }
    return map;
}

/** 当前生效的俗称表（来自设置） */
export function aliasMap() { return parseAliases(settings.get("aliases")); }

/** 单个名字 → 官方名（精确匹配；查不到原样返回）——与 v1 的 resolveAlias 同语义 */
export function resolveAliasName(name) {
    const raw = String(name === undefined || name === null ? "" : name).trim();
    if (!raw) return raw;
    const hit = aliasMap().get(normalizeKey(raw));
    return hit || raw;
}

/** 把句子里的俗称按官方名替换（用于卡名识别） */
export function applyAliasesToText(text) { return applyAliases(text, aliasMap()); }

/** 学一条俗称（写进设置；重复或自我映射返回 false） */
export function learnAlias(from, to) {
    const f = String(from || "").trim(), t = String(to || "").trim();
    if (!f || !t || normalizeKey(f) === normalizeKey(t)) return false;
    const map = aliasMap();
    if (map.get(normalizeKey(f)) === t) return false;
    map.set(normalizeKey(f), t);
    const lines = [...map.entries()].map(function (e) { return e[0] + "=" + e[1]; });
    settings.set("aliases", lines.join("\n"));
    log("俗称", "已记录俗称：" + f + " → " + t);
    return true;
}

export function applyAliases(text, map) {
    let out = String(text || "");
    for (const [from, to] of map) {
        if (!from) continue;
        const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        out = out.replace(re, to);
    }
    return out;
}

/** DIY 卡的"类型/数值"文本：与卡库同一套方言，便于走同一条管线 */
export function diyTypeText(card) {
    const c = card || {};
    if (c.category === "魔法") return "[魔法]";
    if (c.category === "陷阱") return "[陷阱]";
    const kinds = ["怪兽"];
    const frame = String(c.frame || "效果");
    if (frame !== "通常") kinds.push(frame);
    const head = "[" + kinds.join("|") + "] " + (c.race || "？") + "/" + (c.attribute || "？");
    const atk = c.atk === undefined || c.atk === null || c.atk === "" ? "?" : String(c.atk);
    const def = c.def === undefined || c.def === null || c.def === "" ? "?" : String(c.def);
    const isLink = frame === "连接";
    const isXyz = frame === "超量";
    const scale = isLink ? "[LINK-" + (Number(c.link) || 1) + "]" : (isXyz ? "[☆" + (Number(c.rank) || 1) + "]" : "[★" + (Number(c.level) || 1) + "]");
    const tail = isLink ? atk + "/-" : atk + "/" + def;
    return head + "§" + scale + " " + tail;
}

export function normalizeDiyCard(input) {
    const c = input || {};
    const category = DIY_CATEGORIES.indexOf(c.category) >= 0 ? c.category : "怪兽";
    const frame = category === "怪兽" ? (DIY_MONSTER_FRAMES.indexOf(c.frame) >= 0 ? c.frame : "效果") : "";
    return {
        name: String(c.name || "").trim(),
        category: category,
        frame: frame,
        attribute: String(c.attribute || "").trim(),
        race: String(c.race || "").trim(),
        level: c.level === undefined ? 1 : Number(c.level) || 0,
        rank: c.rank === undefined ? 1 : Number(c.rank) || 0,
        link: c.link === undefined ? 1 : Number(c.link) || 0,
        scale: c.scale === undefined ? 0 : Number(c.scale) || 0,
        atk: c.atk === undefined || c.atk === "" ? 0 : Number(c.atk) || 0,
        def: c.def === undefined || c.def === "" ? 0 : Number(c.def) || 0,
        condition: String(c.condition || "").trim(),
        desc: String(c.desc || "").trim(),
        image: String(c.image || "").trim(),
        subtype: String(c.subtype || "").trim(),
        setcode: String(c.setcode || "").trim(),
        passcode: String(c.passcode || "").trim(),
    };
}

/** 确定性伪随机（同种子必同序列） */
export function seededRandom(seed) {
    let h = 2166136261;
    const s = String(seed);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    let state = h >>> 0;
    return function next() {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/** 纯函数：商店可选的池子（真实卡 + DIY 卡，受「DIY 卡也进商店 / 卡库抽卡」控制）。
 *  抽成函数是为了能确定性测试 —— 之前只有概率抽到 DIY，测不出来。 */
export function shopPool(stats) {
    const pool = (stats && stats.rows ? stats.rows : []).map(function (r) { return r.id; });
    if (settings.get("shopIncludeDiy") === false) return pool;
    for (const c of (settings.get("diyCards") || [])) if (c && c.name) pool.push("diy:" + c.name);
    return pool;
}

export function shopSeed(day, chatKey) { return "ygo2-shop-" + String(day) + "-" + String(chatKey || "default"); }

export function chatScopeKey() {
    const c = ctx();
    if (c && c.chatId) return String(c.chatId);
    const chat = c && c.chat;
    if (Array.isArray(chat) && chat.length && chat[0] && chat[0].avatar) return String(chat[0].avatar);
    return "default";
}

/** 从卡池里按种子挑固定的一批 */
export function pickSeeded(pool, size, seed) {
    const list = (pool || []).slice();
    const want = Math.max(1, Math.min(list.length, Number(size) || 5));
    const rnd = seededRandom(seed);
    const out = [];
    while (out.length < want && list.length) {
        const i = Math.floor(rnd() * list.length) % list.length;
        out.push(list.splice(i, 1)[0]);
    }
    return out;
}

export function todayKey(now) { const d = now ? new Date(now) : new Date(); return d.toISOString().slice(0, 10); }

/** 3) 状态存取（都存在 settings 里，天然持久化） */
export function collectionState() {
    const s = settings.all();
    return { map: s[STATS_KEYS.collection] || {}, total: Number(s[STATS_KEYS.total]) || 0, recent: s[STATS_KEYS.recent] || [] };
}

export function addToCollection(ids) {
    const state = collectionState();
    const map = Object.assign({}, state.map);
    const recent = state.recent.slice();
    let added = 0;
    for (const id of ids || []) {
        const key = String(id);
        if (!key) continue;
        if (!map[key]) { map[key] = 0; added++; }
        map[key] += 1;
        recent.unshift(key);
    }
    settings.save({ [STATS_KEYS.collection]: map, [STATS_KEYS.total]: state.total + (ids || []).length, [STATS_KEYS.recent]: recent.slice(0, 30) });
    return { added: added, kinds: Object.keys(map).length, total: state.total + (ids || []).length };
}

/** 4) 业务文本 */
/** 购入一张卡：按卡名解析 → 计入收藏册（没有货币系统，价格交给 AI 叙事） */
export async function buyCard(query) {
    const q = String(query || "").trim();
    if (!q) return "要买哪张卡？";
    const row = await findCard(q);
    if (!row) return "商店里没有「" + q + "」，也可能是译名不同（可以先用 search_yugioh_cards 模糊搜）。";
    const res = addToCollection([row.id]);
    return "🛒 已购入「" + row.name + "」（" + row.id + "），收藏册现有 " + res.kinds + " 种 / 累计 " + res.total + " 张。";
}

export async function collectionText(args) {
    const state = collectionState();
    const stats = await getStatsIndex();
    const kinds = Object.keys(state.map).length;
    const lines = ["📖 收藏册", "已收集 " + kinds + " / " + stats.rows.length + " 种（" + (kinds / stats.rows.length * 100).toFixed(1) + "%）｜累计抽到 " + state.total + " 张"];
    const recent = state.recent.slice(0, 10).map(function (id) { return stats.byId.get(String(id)); }).filter(Boolean);
    if (recent.length) lines.push("", "最近获得：", recent.map(function (r) { return "· " + r.name + "（" + r.id + "）"; }).join("\n"));
    if (args && args.series) {
        const key = normalizeKey(args.series);
        const hit = stats.rows.filter(function (r) { return normalizeKey(r.name).indexOf(key) >= 0 && state.map[r.id]; });
        lines.push("", "【" + args.series + "】已收集 " + hit.length + " 种：" + (hit.slice(0, 30).map(function (r) { return r.name; }).join("、") || "（还没有）"));
    }
    return lines.join("\n");
}

export async function shopText(args) {
    const size = Math.max(1, Math.min(20, Number((args && args.size) || settings.get("shopSize")) || 5));
    const day = (args && args.date) || todayKey();
    const stats = await getStatsIndex();
    const includeDiy = settings.get("shopIncludeDiy") !== false;
    const pool = stats.rows.map(function (r) { return r.id; });
    if (includeDiy) for (const c of settings.get("diyCards") || []) if (c && c.name) pool.push("diy:" + c.name);
    const picked = pickSeeded(pool, size, shopSeed(day, chatScopeKey()));
    const lines = ["🏪 每日商店 · " + day + "（共 " + picked.length + " 件）", "同一天同一聊天固定不变，过一天才会换一批，不能手动刷新。", ""];
    picked.forEach(function (id, i) {
        if (String(id).indexOf("diy:") === 0) { lines.push("[" + (i + 1) + "] " + String(id).slice(4) + "（DIY 卡）"); return; }
        const row = stats.byId.get(String(id));
        if (!row) return;
        lines.push("[" + (i + 1) + "] " + row.name + "（" + row.id + "）", row.typeText, "卡图: ![](" + imageUrl(row.id) + ")");
    });
    return lines.join("\n");
}

export function aliasText() {
    const map = aliasMap();
    if (!map.size) return "📖 俗称表为空（面板「查询内容 → 俗称表」里按「俗称=官方名」每行一条添加，或发 /ygoalias 杀调=杀手旋律）。";
    const lines = ["📖 俗称表（" + map.size + " 条）"];
    for (const [from, to] of map) lines.push("· " + from + " → " + to);
    return lines.join("\n");
}

export async function diyListText() {
    const list = settings.get("diyCards") || [];
    if (!list.length) return "还没有 DIY 卡。可以用工具 manage_diy_card 的 add 动作创建。";
    const lines = ["🃏 DIY 卡（" + list.length + " 张）"];
    for (const c of list) { lines.push("", "【" + c.name + "】", diyTypeText(c), c.desc ? c.desc : "（无效果文本）"); }
    return lines.join("\n");
}

export async function manageDiy(args) {
    const action = String((args && args.action) || "list");
    const list = (settings.get("diyCards") || []).slice();
    if (action === "list") return await diyListText();
    if (action === "editor") {
        // 交给界面层打开图形编辑器（数据层不 import 界面层，走 registry）
        if (registry.has("ui:diy")) { await registry.call("ui:diy", { name: (args && args.name) || "" }); return "已打开 DIY 图形编辑器。"; }
        return "当前环境不支持弹窗，可用 add 动作直接创建。";
    }
    if (action === "add" || action === "edit") {
        const card = normalizeDiyCard(args);
        if (!card.name) return "DIY 卡至少要有一个名字。";
        const i = list.findIndex(function (c) { return c.name === card.name; });
        if (i >= 0) list[i] = card; else list.push(card);
        settings.save({ [STATS_KEYS.diy]: list });
        return "已" + (i >= 0 ? "更新" : "新建") + "DIY 卡【" + card.name + "】\n" + diyTypeText(card);
    }
    if (action === "del" || action === "delete") {
        const name = String((args && args.name) || "").trim();
        const next = list.filter(function (c) { return c.name !== name; });
        if (next.length === list.length) return "没有找到叫「" + name + "」的 DIY 卡。";
        settings.save({ [STATS_KEYS.diy]: next });
        return "已删除 DIY 卡【" + name + "】";
    }
    return "未知动作：" + action + "（可用 list / add / edit / del）";
}

/** 4b) 注册能力 */
export function registerCollection() {
    registry.provide("tool:collection", async function (args) { return await collectionText(args || {}); });
    registry.provide("tool:shop", async function (args) { return await shopText(args || {}); });
    registry.provide("tool:diy", async function (args) { return await manageDiy(args || {}); });
    registry.provide("cmd:alias", async function (args) {
        const raw = String((args && (args.query || args.arg || args.text)) || "").trim();
        if (raw && /[=＝:：]/.test(raw)) {
            const i = raw.search(/[=＝:：]/);
            const added = learnAlias(raw.slice(0, i), raw.slice(i + 1).replace(/^[=＝:：]+/, "").trim());
            return (added ? "✅ 已添加俗称：" : "ℹ️ 这条俗称已存在：") + raw.trim() + "\n\n" + aliasText();
        }
        return aliasText();
    });
    registry.provide("resolveAliasName", async function (name) { return resolveAliasName(name); });
    registry.provide("applyAliasesToText", async function (text) { return applyAliasesToText(text); });
    registry.provide("learnAlias", async function (args) { return learnAlias(args && args.from, args && args.to); });
    registry.provide("collection:add", async function (ids) { return addToCollection(ids); });
    registry.provide("runAction:collection", async function (trigger) {
        const a = trigger && trigger.action;
        if (a === "shop") return [{ name: "每日商店", text: await shopText({}) }];
        if (a === "album") return [{ name: "收藏册", text: await collectionText({}) }];
        if (a === "alias") return [{ name: "俗称表", text: aliasText() }];
        if (a === "buy") return [{ name: "购买", text: await buyCard(trigger.arg) }];
        return [];
    });
    log("数据", "收集/商店/DIY/俗称能力已注册");
}

export const collection = { shopPool, STATS_KEYS, buyCard, aliasMap, resolveAliasName, applyAliasesToText, learnAlias, DIY_CATEGORIES, DIY_MONSTER_FRAMES, parseAliases, applyAliases, diyTypeText, normalizeDiyCard, seededRandom, shopSeed, chatScopeKey, pickSeeded, todayKey, collectionState, addToCollection, collectionText, shopText, aliasText, diyListText, manageDiy, registerCollection };
