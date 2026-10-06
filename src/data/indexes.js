import { log } from "../core/bus.js";
import { registry } from "../core/registry.js";
import { dataFile, dataFileCached, lazyIndex } from "../core/http.js";

/** ── 统一模板（数据模块）：常量 → 纯函数 → 懒索引 → register → exports ── */

/** 1) 常量 */
export const FILES = { names: "card-names.txt", stats: "card-stats.tsv", setnames: "setnames.json" };

let readText = function (name) { return dataFileCached(name); };   // 默认：带 IndexedDB 持久缓存（重启免重下）
/** 注入读取器（测试时用本地文件；运行时用 dataFile） */
export function configure(options) {
    if (options && typeof options.readText === "function") readText = options.readText;
}

/** 2) 纯函数 */
/** 归一化：全角转半角、去装饰与标点，和 detect.normalize 保持同一套规则 */
export function normalizeKey(text) {
    let s = String(text === undefined || text === null ? "" : text);
    if (typeof s.normalize === "function") s = s.normalize("NFKC");
    return s.replace(/[\u200b-\u200f\uFE0F]/g, "").replace(/[「」『』《》【】〖〗\[\]()（）・·\s]/g, "").trim();
}

/** card-names.txt：每行一个 JSON 字符串 */
export function parseNames(text) {
    const map = new Map();
    for (const line of String(text || "").split("\n")) {
        const raw = line.trim();
        if (!raw) continue;
        let name = raw;
        try { name = JSON.parse(raw); } catch (error) { /* 未加引号的行也接受 */ }
        name = String(name || "").trim();
        if (!name) continue;
        const key = normalizeKey(name);
        if (key && !map.has(key)) map.set(key, name);
    }
    return map;
}

/** card-stats.tsv：7 列 → 结构化行 */
export function parseStats(text) {
    const rows = [];
    const byId = new Map();
    const byName = new Map();
    const aliasRows = [];
    for (const line of String(text || "").split("\n")) {
        if (!line.trim()) continue;
        const c = line.split("\t");
        if (c.length < 3) continue;
        const row = { id: c[0], cid: c[1] || "", name: c[2] || "", typeText: c[3] || "", setcode: c[4] || "", en: c[5] || "", aliases: (c[6] || "").split("|").filter(Boolean) };
        if (!row.id || !row.name) continue;
        rows.push(row);
        byId.set(row.id, row);
        // 第一遍：只登记"这张卡自己的名字"，正名优先
        const own = normalizeKey(row.name);
        if (own && !byName.has(own)) byName.set(own, row);
        aliasRows.push({ row: row, keys: row.aliases.concat(row.en ? [row.en] : []) });
    }
    // 第二遍：别名 / 英文名只在正名没占这个键时登记
    // （否则别的卡的别名会抢走这张卡的正名键，例如「魔法卡「敌人操纵器」」被「敌人控制器」占掉）
    for (const item of aliasRows) {
        for (const k of item.keys) { const key = normalizeKey(k); if (key && !byName.has(key)) byName.set(key, item.row); }
    }
    return { rows: rows, byId: byId, byName: byName };
}

/** setnames.json：0x… → 字段名（值可能是对象，取 sc/zh/en 任一） */
export function parseSetnames(textOrObject) {
    // 数据文件是 v1 同款：{"0xdd":{"cn":"青眼","jp":"青眼の白龍"}} —— 必须保留 cn/jp 两项，
    // 之前压成"只留 cn 的字符串"，导致日文系列名（如「天気」）查不到、字段行也不显示日文。
    const map = new Map();
    let obj = textOrObject;
    if (typeof textOrObject === "string") { try { obj = JSON.parse(textOrObject); } catch (error) { obj = null; } }
    if (!obj || typeof obj !== "object") return map;
    for (const key of Object.keys(obj)) {
        const item = obj[key];
        const k = String(key).replace(/^0x/i, "").toLowerCase();
        if (!k || !item) continue;
        if (typeof item === "string") { map.set(k, { cn: item, jp: "" }); continue; }
        const cn = String(item.cn || item.sc || "").trim();
        const jp = String(item.jp || "").trim();
        if (!cn && !jp) continue;
        map.set(k, { cn: cn, jp: jp });
    }
    return map;
}
/** 3) 懒索引（并发只构建一次） */
export const getNameIndex = lazyIndex(async function () { return parseNames(await readText(FILES.names)); });
export const getStatsIndex = lazyIndex(async function () { return parseStats(await readText(FILES.stats)); });
export const getSetnames = lazyIndex(async function () { return parseSetnames(await readText(FILES.setnames)); });

/** ★ 重置懒索引：手动安装/卸载卡库、清缓存之后调用，下一次查询就会重新读数据源。
 *  没有它的时候：先在没库的状态下查过一次卡（索引被解析成空并缓存），装完库本会话仍然查不到，
 *  必须刷新页面 —— 实测就是这个坑。 */
export function resetIndexes() {
    try { getNameIndex.reset(); getStatsIndex.reset(); getSetnames.reset(); } catch (error) { /* 忽略 */ }
    log("数据", "卡库索引已重置（下次查询重新读取数据源）");
    return true;
}

/** 4) 注册能力（数据层对外只暴露这几个） */
export function registerIndexes() {
    registry.provide("index:names", getNameIndex);
    registry.provide("index:stats", getStatsIndex);
    registry.provide("index:setnames", getSetnames);
    registry.provide("index:reset", async function () { return resetIndexes(); });
    log("数据", "索引能力已注册（names/stats/setnames/reset）");
}

/** 5) 导出 */
export const indexes = { FILES, configure, normalizeKey, parseNames, parseStats, parseSetnames, getNameIndex, getStatsIndex, getSetnames, resetIndexes, registerIndexes };
