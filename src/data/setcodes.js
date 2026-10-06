import { getSetnames } from "./indexes.js";

/**
 * setcode（字段位域）工具 —— 纯函数集中在这里，别再让 cards / deck / packs 互相 import 成环。
 *
 * 规则（与现实数据核对过）：
 *   · card-stats.tsv 的 setcode 是十进制文本，值本身是【位域】：每 16 位一个字段码
 *     （例：被封印的艾克佐迪亚 14549056 = 0xDE0040 → 0x40「被封印」+ 0xDE「艾克佐迪亚」）
 *   · setnames.json 的键是【不带 0x 的小写十六进制】（例："dd" = 青眼），不是十进制
 *   · 有些卡 setcode 超过 2^53（如 36592129229979790），所以用 BigInt 拆，别用 Number + &
 */

/** 十进制/十六进制文本 → 16 位字段码数组（低位在前，去重；解析不了返回 []） */
export function splitSetcodes(raw) {
    const s = String(raw === undefined || raw === null ? "" : raw).trim();
    if (!s) return [];
    const out = [];
    // 接口偶尔给 "0x40,0xde" 这种逗号列表，本地 tsv 给单个十进制位域 —— 两种都要吃
    for (const piece of s.split(/[,\s]+/).filter(Boolean)) {
        let n = null;
        try { n = /^0x/i.test(piece) ? BigInt(piece) : (/^\d+$/.test(piece) ? BigInt(piece) : null); } catch (error) { n = null; }
        if (n === null) continue;
        while (n > 0n) {
            const code = Number(n & 0xffffn);
            if (code > 0 && out.indexOf(code) < 0) out.push(code);
            n = n >> 16n;
        }
    }
    return out;
}

/** 单个字段码 → 字段名（接受数字或 "0x…"/十六进制串）；查不到返回 "" */
export function fieldNameOf(setnames, code) {
    if (!setnames || typeof setnames.get !== "function") return "";
    const n = typeof code === "number" ? code : parseInt(String(code).replace(/^0x/i, ""), 16);
    if (!Number.isFinite(n) || n <= 0) return "";
    const hex = Math.floor(n).toString(16);
    const hit = setnames.get(hex) || setnames.get("0x" + hex);
    if (!hit) return "";
    if (typeof hit === "string") return hit;
    return String(hit.cn || hit.sc || hit.jp || hit.en || "");
}

/** 位域文本 → 该卡的全部字段名（去重，低位字段在前）；查不到返回 [] */
export function fieldNamesOf(setnames, raw) {
    const out = [];
    for (const code of splitSetcodes(raw)) {
        const name = fieldNameOf(setnames, code);
        if (name && out.indexOf(name) < 0) out.push(name);
    }
    return out;
}

/** 位域文本 → 该卡的全部字段名（含日文名，供"字段: 青眼（青眼の白龍）"用） */
export function fieldNamesWithJpOf(setnames, raw) {
    const cn = [];
    const jp = [];
    for (const code of splitSetcodes(raw)) {
        const hit = (function () {
            if (!setnames || typeof setnames.get !== "function") return null;
            const hex = code.toString(16);
            return setnames.get(hex) || setnames.get("0x" + hex) || null;
        })();
        if (!hit) continue;
        const nm = typeof hit === "string" ? hit : String(hit.cn || hit.sc || hit.en || "");
        const j = typeof hit === "object" && hit ? String(hit.jp || "") : "";
        if (nm && cn.indexOf(nm) < 0) cn.push(nm);
        if (j && jp.indexOf(j) < 0) jp.push(j);
    }
    return { cn: cn, jp: jp };
}

/** 懒取字段表 + 位域文本 → 字段名（异步便捷入口） */
export async function fieldNamesForSetcode(raw) {
    const setnames = await getSetnames();
    return fieldNamesOf(setnames, raw);
}

export const setcodes = { splitSetcodes, fieldNameOf, fieldNamesOf, fieldNamesWithJpOf, fieldNamesForSetcode };
