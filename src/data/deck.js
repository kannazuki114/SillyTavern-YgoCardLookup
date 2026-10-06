import { ctx, log } from "../core/bus.js";
import { registry } from "../core/registry.js";
import { getStatsIndex, getSetnames, normalizeKey } from "./indexes.js";
import { splitSetcodes, fieldNamesOf } from "./setcodes.js";
import { seededRandom, todayKey } from "./collection.js";
import { settings } from "../core/settings.js";
import { imageUrl } from "./cards.js";
import { getLimits } from "./rules.js";

/** ── 统一模板（数据模块）：常量 → 纯函数 → 业务 → register → exports ── */

/** 1) 常量：官方规则里本地可判定的部分 */
export const RULES = { mainMin: 40, mainMax: 60, extraMax: 15, sideMax: 15, sameNameMax: 3 };

/** 2) 纯函数 */
/** 解析卡表文本：支持 "3 卡名" / "卡名 x3" / "卡名"；支持分区标记 */
/**
 * 从任意文本里取 <deck>…</deck> 包裹的卡表（允许属性、大小写、全角尖括号；也认 <牌组>／<卡组>）。
 * 典型用途：角色卡/最新消息里写的卡组块。
 */
export function extractDeckBlock(text) {
    const raw = String(text === undefined || text === null ? "" : text).replace(/＜/g, "<").replace(/＞/g, ">");
    const m = /<(?:deck|卡组|牌组)\b[^>]*>([\s\S]*?)<\/(?:deck|卡组|牌组)\s*>/i.exec(raw);
    return m ? String(m[1]).trim() : "";
}

/** 从聊天记录里找最近的 <deck> 块（从最新一条往前找，最多看 limit 条） */
export function deckFromChat(chat, limit) {
    const list = Array.isArray(chat) ? chat : [];
    const max = Math.max(1, Math.min(50, Number(limit) || 10));
    for (let i = list.length - 1; i >= 0 && i >= list.length - max; i--) {
        const msg = list[i];
        if (!msg || typeof msg !== "object") continue;
        const body = String(msg.mes !== undefined ? msg.mes : (msg.content !== undefined ? msg.content : ""));
        if (body.indexOf("deck") < 0 && body.indexOf("<卡组") < 0 && body.indexOf("<牌组") < 0) continue;
        const block = extractDeckBlock(body);
        if (block) { log("卡组", "从第 " + (i + 1) + " 条消息的 <deck> 块读到卡表（" + block.split("\n").filter(Boolean).length + " 行）"); return block; }
    }
    return "";
}

/** 卡组文本的来源：优先显式传入，其次读聊天里的 <deck> 块 */
export function deckArgText(args) {
    // 参数可以是 {deck} 对象，也可以直接是卡表字符串（deckimage 里就是传字符串）
    const own = String((typeof args === "string" ? args : ((args && (args.deck || args.text)) || ""))).trim();
    if (own) return { text: own, fromChat: false };
    const c = ctx();
    const fromChat = deckFromChat(c && c.chat);
    return { text: fromChat, fromChat: !!fromChat };
}
export function parseDeckText(text) {
    const out = { main: [], extra: [], side: [] };
    let bucket = "main";
    for (const raw of String(text || "").split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        if (/^(#+\s*)?(主卡组|main)$/i.test(line)) { bucket = "main"; continue; }
        if (/^(#+\s*)?(额外卡组|额外|extra)$/i.test(line)) { bucket = "extra"; continue; }
        if (/^(#+\s*)?(副卡组|副|side)$/i.test(line)) { bucket = "side"; continue; }
        if (line[0] === "#" || line[0] === "!") continue;
        let count = 1, name = line;
        let m = /^(\d+)\s*[x×*]?\s*(.+)$/.exec(line);
        if (m) { count = Number(m[1]) || 1; name = m[2].trim(); }
        else { m = /^(.+?)\s*[x×*]\s*(\d+)$/.exec(line); if (m) { name = m[1].trim(); count = Number(m[2]) || 1; } }
        name = name.replace(/^\d+\s*[x×*]?\s*/, "").trim();
        if (!name) continue;
        out[bucket].push({ name: name, count: Math.max(1, Math.min(99, count)) });
    }
    return out;
}

export function deckSize(deck) { return deck.main.reduce(function (n, e) { return n + e.count; }, 0); }
export function extraSize(deck) { return (deck.extra || []).reduce(function (n, e) { return n + e.count; }, 0); }
export function sideSize(deck) { return (deck.side || []).reduce(function (n, e) { return n + e.count; }, 0); }

/** 把名字归并成"每张卡投入总数"（同名卡在三个区里也算总投入） */
export function mergeByName(deck) {
    const map = new Map();
    for (const zone of ["main", "extra", "side"]) {
        for (const e of deck[zone] || []) {
            const key = normalizeKey(e.name);
            const cur = map.get(key) || { name: e.name, count: 0, zones: [] };
            cur.count += e.count;
            if (cur.zones.indexOf(zone) < 0) cur.zones.push(zone);
            map.set(key, cur);
        }
    }
    return map;
}

/** 本地可判定的卡组问题（数量 / 同名 / 禁限）；禁止卡与限制卡按当前禁限表 */
export function deckProblems(deck, limits, region) {
    const problems = [];
    const main = deckSize(deck), extra = extraSize(deck), side = sideSize(deck);
    if (main < RULES.mainMin || main > RULES.mainMax) problems.push("主卡组 " + main + " 张（应为 " + RULES.mainMin + "-" + RULES.mainMax + " 张）");
    if (extra > RULES.extraMax) problems.push("额外卡组 " + extra + " 张（最多 " + RULES.extraMax + " 张）");
    if (side > RULES.sideMax) problems.push("副卡组 " + side + " 张（最多 " + RULES.sideMax + " 张）");
    const merged = mergeByName(deck);
    for (const entry of merged.values()) {
        if (entry.count > RULES.sameNameMax) problems.push("「" + entry.name + "」投入 " + entry.count + " 张（同名卡最多 " + RULES.sameNameMax + " 张）");
    }
    return { problems: problems, main: main, extra: extra, side: side, merged: merged };
}

/** 禁限检查需要卡库（单独一步，避免离线时整块失败） */
export async function banlistProblems(merged, limits, region) {
    const out = [];
    const stats = await getStatsIndex();
    for (const entry of merged.values()) {
        const row = stats.byName.get(normalizeKey(entry.name));
        if (!row) { out.push("「" + entry.name + "」在本地卡库里找不到（译名可能有出入）"); continue; }
        const r = (limits || {})[region] || (limits || {}).cn;
        if (!r) continue;
        const keys = [String(row.cid || ""), String(row.id || "")];
        if (keys.some(function (k) { return r.forbidden.has(k); })) out.push("「" + row.name + "」是禁止卡，不能投入");
        else if (keys.some(function (k) { return r.limited.has(k); }) && entry.count > 1) out.push("「" + row.name + "」是限制卡（1 张），当前投入 " + entry.count + " 张");
        else if (keys.some(function (k) { return r.semi.has(k); }) && entry.count > 2) out.push("「" + row.name + "」是准限制卡（2 张），当前投入 " + entry.count + " 张");
    }
    return out;
}

/** 区域显示名（面板「查询内容 → 禁限表区域」用哪块表就显示哪块） */
export function regionNameOf(region) {
    return region === "ja" || region === "jp" ? "OCG 日文" : region === "en" ? "TCG 英文" : "官方简中";
}
export function validateDeckText(deck, limits, region) {
    const base = deckProblems(deck, limits, region);
    const lines = ["📋 卡组校验", "主卡组 " + base.main + " 张 / 额外 " + base.extra + " 张 / 副卡组 " + base.side + " 张，合计 " + (base.main + base.extra + base.side) + " 张"];
    const regionName = region === "jp" ? "OCG 日文" : region === "en" ? "TCG 英文" : "官方简中";
    if (base.problems.length) { lines.push("", "❌ 数量/同名问题 " + base.problems.length + " 处："); for (const p of base.problems) lines.push("· " + p); }
    else lines.push("", "✅ 数量与同名限制没有问题。");
    return { text: lines.join("\n"), base: base };
}

/** 起手模拟：rng 可注入 → 可确定性测试 */
export function simulateHand(pool, draw, runs, random) {
    const rnd = random || Math.random;
    const results = [];
    for (let r = 0; r < Math.max(1, Number(runs) || 1); r++) {
        const list = pool.slice();
        const hand = [];
        // 注意：上限必须在抽牌前算好。之前写成 Math.min(draw, list.length) 放在条件里，
        // list 会随抽牌变短，导致抽到一半就退出（6 张牌抽 5 张只出 3 张）。
        const want = Math.max(1, Math.min(Number(draw) || 5, list.length));
        while (hand.length < want) {
            const i = Math.floor(rnd() * list.length) % list.length;
            hand.push(list.splice(i, 1)[0]);
        }
        results.push(hand);
    }
    return results;
}

/**
 * 系列/字段检索：名字命中 + setcode 解码命中。
 * ★ 必须是"整块命中"：以前写成"十进制文本里能切出这个码就算"，结果字段码 1（正义盟军）
 *   会把 setcode=152、14549056… 这些卡全算成成员（实测 14281 张里命中 1828 张）。
 */
export function decodeSetcodes(digits, codeSet) {
    if (!codeSet || typeof codeSet.has !== "function") return [];
    const found = [];
    for (const code of splitSetcodes(digits)) {
        const key = String(code);
        if (codeSet.has(key) && found.indexOf(key) < 0) found.push(key);
    }
    return found;
}

/** 字段名 → 十进制 code 集合（setnames 键是十六进制） */
export async function seriesCodes(series) {
    const setnames = await getSetnames();
    const key = normalizeKey(series);
    const codes = new Set();
    const labelOf = function (v) { return typeof v === "string" ? v : String((v && (v.cn || v.sc || v.jp)) || ""); };
    for (const [hex, raw] of setnames) {
        const label = labelOf(raw);
        const n = normalizeKey(label);
        if (!n) continue;
        if (n === key || n.indexOf(key) >= 0 || key.indexOf(n) >= 0) codes.add(String(parseInt(hex, 16)));
    }
    return codes;
}

export async function seriesMembers(series) {
    const stats = await getStatsIndex();
    const key = normalizeKey(series);
    const byName = stats.rows.filter(function (r) {
        if (normalizeKey(r.name).indexOf(key) >= 0) return true;
        return r.aliases.some(function (a) { return normalizeKey(a).indexOf(key) >= 0; });
    });
    const codes = await seriesCodes(series);
    const byCode = codes.size ? stats.rows.filter(function (r) { return decodeSetcodes(r.setcode, codes).length > 0; }) : [];
    const map = new Map();
    for (const r of byName) map.set(r.id, r);
    for (const r of byCode) if (!map.has(r.id)) map.set(r.id, r);
    return { members: [...map.values()], byName: byName.length, byCode: byCode.length, codes: codes.size };
}

/** 3) 业务文本 */
export async function seriesText(series) {
    const res = await seriesMembers(series);
    if (!res.members.length) return "没有找到「" + String(series || "") + "」相关的卡（可以换官方译名/字段名再试）。";
    const names = res.members.map(function (r) { return r.name; });
    return "【" + series + "】共 " + res.members.length + " 张（名字命中 " + res.byName + "，字段码命中 " + res.byCode + "）：\n" + names.slice(0, 60).join("、") + (names.length > 60 ? " …" : "");
}

export async function handText(args) {
    const picked = deckArgText(args);
    const deck = parseDeckText(picked.text);
    const stats = await getStatsIndex();
    const pool = [];
    for (const e of deck.main) {
        const row = stats.byName.get(normalizeKey(e.name));
        if (row) for (let i = 0; i < e.count; i++) pool.push(row);
    }
    if (!pool.length) return "卡表里没有能在本地卡库匹配到的卡（请检查译名）。";
    const draw = Math.max(1, Math.min(15, Number(args.draw) || Number(settings.get("handDraw")) || 5));
    const runs = Math.max(1, Math.min(200, Number(args.runs) || Number(settings.get("handRuns")) || 1));   // 面板「玩法 → 起手模拟次数」
    const rnd = seededRandom(String(args.seed || "hand"));
    const results = simulateHand(pool, draw, runs, rnd);
    const lines = ["🃏 起手模拟（主卡组 " + pool.length + " 张，抽 " + draw + " 张" + (runs > 1 ? "，" + runs + " 次" : "") + "）"];
    results.forEach(function (hand, i) {
        lines.push("", (runs > 1 ? "第 " + (i + 1) + " 次：" : "") + hand.map(function (r) { return r.name; }).join("、"));
        if (settings.get("handImages") !== false) {
            lines.push(hand.map(function (r) { return "![](" + imageUrl(r.id) + ")"; }).join(" "));
        }
    });
    return lines.join("\n");
}

/** 4) 注册能力 */
export function registerDeck() {
    // 对外能力：setcode（十进制或 0x 十六进制）→ 字段名数组（唯一调用方 cards.js 要的就是名字）
    registry.provide("decodeSetcodes", async function (args) {
        const raw = Array.isArray(args) ? args : ((args && (args.codes || args.setcode || args.query)) || []);
        const list = Array.isArray(raw) ? raw : [raw];
        const setnames = await getSetnames();
        const names = [];
        for (const item of list) for (const nm of fieldNamesOf(setnames, item)) if (names.indexOf(nm) < 0) names.push(nm);
        return names;
    });
    registry.provide("tool:deck", async function (args) {
        const picked = deckArgText(args);
        const deck = parseDeckText(picked.text);
        if (!deck.main.length) return picked.fromChat ? "聊天里没有 <deck>…</deck> 卡表块。把卡组写成 <deck>…</deck>（每行「3 卡名」）发一条消息，或直接把卡表贴给我。" : "卡表是空的：请按「3 卡名」每行一张贴给我。";
        const region = settings.get("banlistRegion") || "cn";
        const base = validateDeckText(deck, null, region);
        let text = base.text;
        try {
            const limits = await getLimits();
            const extra = await banlistProblems(base.base.merged, limits, region);
            const unknown = extra.filter(function (x) { return x.indexOf("找不到") >= 0; });
            const real = extra.filter(function (x) { return x.indexOf("找不到") < 0; });
            if (real.length) text += "\n\n❌ 禁限问题 " + real.length + " 处：\n" + real.map(function (x) { return "· " + x; }).join("\n");
            else text += "\n\n✅ 禁限表检查通过（" + (regionNameOf(region)) + "）。";
            if (unknown.length) text += "\n\n（另有 " + unknown.length + " 张在本地卡库没找到，已跳过：" + unknown.slice(0, 5).map(function (x) { return x.replace(/^「|」.*$/g, ""); }).join("、") + "）";
        } catch (error) { text += "\n\n（禁限表不可用，本次只做了数量与同名检查）"; }
        return (picked.fromChat ? "（卡表来自聊天里的 <deck> 块）\n\n" : "") + text;
    });
    registry.provide("tool:hand", async function (args) { return await handText(args || {}); });
    registry.provide("tool:series", async function (args) { return await seriesText(args && args.series); });
    registry.provide("runAction:deck", async function (trigger) {
        const a = trigger && trigger.action;
        if (a === "series") return [{ name: "系列卡表", text: await seriesText(trigger.arg) }];
        if (a === "deck") return [];
        return [];
    });
    // ★ 自然语言触发词「起手模拟 / 起手概率」：读聊天里的 <deck> 卡表（与 /ygohand 同一套逻辑）。
    //   以前 hand 这个动作没有任何数据模块实现，触发词命中后同样什么都不注入。
    registry.provide("runAction:hand", async function (trigger) {
        if (!trigger || trigger.action !== "hand") return [];
        const picked = deckArgText("");
        const deck = parseDeckText(picked.text);
        if (!deck.main.length) return [{ name: "起手模拟", text: "要模拟起手的话，先把卡组贴出来（每行「3 卡名」），或写成 <deck>…</deck> 块发一条消息。" }];
        const arg = String(trigger.arg || "").trim();
        const draw = /^d{1,3}$/.test(arg) ? Number(arg) : undefined;
        return [{ name: "起手模拟", text: await handText({ deck: picked.text, draw: draw }) }];
    });
    log("数据", "卡组能力已注册（deck/hand/series）");
}

export const deckMod = { extractDeckBlock, deckFromChat, deckArgText, RULES, parseDeckText, deckSize, extraSize, sideSize, mergeByName, deckProblems, banlistProblems, validateDeckText, simulateHand, decodeSetcodes, seriesCodes, seriesMembers, seriesText, handText, registerDeck };
