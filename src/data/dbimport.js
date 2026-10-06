/**
 * 手动安装数据库（v1 模式）
 *
 * 与 v1 相同的思路：数据库不依赖扩展目录里的 data/，而是**装进 IndexedDB**，
 * 读取时优先用它（见 http.js 的 dataFile）。适合"另一台设备只拿到扩展、没拿到 data/"的情况。
 *
 * 安装方式两种：
 *   1) 选本地文件（卡名索引 / 卡表 / 字段表 / 异画索引）
 *   2) 填一个 URL（一行一个文件名或一个目录地址）
 */
import { ctx, log } from "../core/bus.js";
import { registry } from "../core/registry.js";
import { idbSet, idbGet, idbDel, IDB_NAME, dataFile } from "../core/http.js";

/** 需要安装的四个数据库文件（名字必须与代码里的读取名一致） */
export const DB_FILES = ["card-names.txt", "card-stats.tsv", "setnames.json", "art-index.json"];

/** 每个文件的识别特征（装错文件时能当场发现） */
const SHAPE = {
    // 结构化校验：只看"长得像不像"，**不看大小**（旧版写死了 >1000 字符，会把合法的小数据集误判成装错）
    "card-names.txt": function (t) {
        const lines = String(t).split("\n").filter(function (x) { return x.trim(); });
        return lines.length >= 1 && !/\t/.test(t);                       // 每行一个名字，且不该出现制表符
    },
    "card-stats.tsv": function (t) {
        const lines = String(t).split("\n").filter(function (x) { return x.trim(); });
        for (const line of lines.slice(0, 50)) {
            const cols = line.split("\t");
            if (cols.length >= 5 && /^\d{3,}$/.test(cols[0])) return true;   // 首列是卡密、至少 5 列
        }
        return false;
    },
    "setnames.json": function (t) {
        try {
            const o = JSON.parse(t);
            if (!o || typeof o !== "object" || Array.isArray(o)) return false;
            const keys = Object.keys(o);
            if (!keys.length) return false;
            return typeof o[keys[0]] === "object" && o[keys[0]] !== null;    // 值应是 {cn,jp}
        } catch (error) { return false; }
    },
    "art-index.json": function (t) {
        try { const o = JSON.parse(t); return !!o && typeof o === "object" && !Array.isArray(o); } catch (error) { return false; }
    },
};
export function dbKey(name) { return "db:" + String(name || ""); }

/**
 * ★ 装库/卸载之后必须做两件事，否则"装完用不了"：
 *   ① 删掉普通键名（缓存区）里的整份文件缓存 —— 旧的随包副本会盖住刚装的库；
 *   ② 让内存里的懒索引重建 —— 本会话如果已经查过一次（拿到了"卡库还没载入"），
 *      空索引会被一直缓存，以前必须刷新页面才生效。
 */
export async function refreshAfterDbChange(what) {
    for (const f of DB_FILES) { try { await idbDel(f); } catch (error) { /* 忽略 */ } }
    try { if (registry.has("index:reset")) await registry.call("index:reset"); } catch (error) { /* 忽略 */ }
    log("数据库", (what || "数据库变更") + "：索引已重置，下一次查询重新读取");
    return true;
}

/** 把一段文本作为某个数据库文件装进 IndexedDB；返回 { ok, error } */
export async function dbImportFromText(name, text) {
    const file = String(name || "").trim();
    if (DB_FILES.indexOf(file) < 0) return { ok: false, error: "不认识的文件名：" + file + "（需要：" + DB_FILES.join(" / ") + "）" };
    const body = String(text || "");
    if (!body) return { ok: false, error: file + " 内容为空" };
    const shape = SHAPE[file];
    if (shape && !shape(body)) return { ok: false, error: file + " 内容不像这个文件（可能选错了；卡名索引应为每行一个名字，卡表应为制表符分隔）" };
    const ok = await idbSet(dbKey(file), body, 0);
    if (!ok) return { ok: false, error: "写入 IndexedDB 失败（客户端可能禁用了 IndexedDB）" };
    log("数据库", "已手动安装：" + file + "（" + Math.round(body.length / 1024) + " KB）");
    await refreshAfterDbChange("安装 " + file);
    return { ok: true, bytes: body.length };
}

/** 当前已安装情况 */
export async function dbInstalled() {
    const out = [];
    for (const f of DB_FILES) {
        const t = await idbGet(dbKey(f), 0).catch(function () { return ""; });
        out.push({ file: f, bytes: t ? t.length : 0 });
    }
    return out;
}

/** 卸载（清掉手动安装的数据库） */
export async function dbUninstall() {
    let n = 0;
    for (const f of DB_FILES) { try { await idbDel(dbKey(f)); n++; } catch (error) { /* 忽略 */ } }
    await refreshAfterDbChange("卸载手动安装的数据库");
    return n;
}

/** 测试：逐个报告"读到了吗、多少条、样例能不能查到" */
export async function dbTestReport() {
    const lines = ["🧪 数据库自检 · 手动安装 + 随包文件 两级"];
    const inst = await dbInstalled();
    const manual = inst.filter(function (x) { return x.bytes > 0; });
    lines.push("手动安装（IndexedDB）：" + (manual.length ? manual.map(function (x) { return x.file + " " + Math.round(x.bytes / 1024) + "KB"; }).join("、") : "无"));
    lines.push("读取优先级：IndexedDB → 随包 data/ → 旧版目录");
    lines.push("");
    let bad = 0;
    for (const f of DB_FILES) {
        const t = await dataFile(f).catch(function () { return ""; });
        if (!t) { bad++; lines.push("❌ " + f + " —— 读不到（既没手动安装，包里也没有）"); continue; }
        const shape = SHAPE[f];
        const like = !shape || shape(t);
        lines.push((like ? "✅ " : "❌ ") + f + " —— " + Math.round(t.length / 1024) + " KB" + (like ? "" : "（内容不像这个文件）"));
        if (!like) bad++;
    }
    // 真实查询一次，验证索引可用
    try {
        const r = await registry.call("tool:card", { query: "青眼白龙" });   // 走注册表：避免与 cards.js 形成循环依赖
        const ok = String(r).indexOf("89631139") >= 0;
        if (!ok) bad++;
        lines.push("");
        lines.push((ok ? "✅ " : "❌ ") + "实际查询：青眼白龙 → " + (ok ? "89631139 ✓" : String(r).slice(0, 60)));
    } catch (error) { bad++; lines.push("❌ 实际查询抛错：" + (error && error.message ? error.message : error)); }
    lines.push("");
    lines.push(bad === 0 ? "结论：数据库可用 ✓（查卡/卡组/开包等功能均可离线使用）" : "结论：有 " + bad + " 项异常 —— 请用「手动安装数据库」把 4 个文件装上");
    const text = lines.join(String.fromCharCode(10));
    log("数据库", "自检完成：" + (bad === 0 ? "全部正常" : bad + " 项异常"));
    return text;
}

/** 弹窗选文件 → 逐个安装（浏览器里用 input[type=file]） */
export async function dbPickAndInstall() {
    const doc = (typeof document !== "undefined") ? document : null;
    if (!doc) return "当前环境没有 document，无法选文件（可在脚本里调用 runAction:dbImport 传文本）";
    return await new Promise(function (resolve) {
        const input = doc.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = ".txt,.tsv,.json,text/plain,application/json";
        input.style.display = "none";
        doc.body.appendChild(input);
        input.addEventListener("change", async function () {
            const list = input.files ? Array.prototype.slice.call(input.files) : [];
            const out = [];
            for (const f of list) {
                const name = String(f.name || "");
                if (DB_FILES.indexOf(name) < 0) { out.push("⏭ 跳过 " + name + "（不是需要的 4 个文件之一）"); continue; }
                const text = await new Promise(function (res) { const r = new FileReader(); r.onload = function () { res(String(r.result || "")); }; r.onerror = function () { res(""); }; r.readAsText(f); });
                const r = await dbImportFromText(name, text);
                out.push((r.ok ? "✅ " : "❌ ") + name + (r.ok ? "：" + Math.round((r.bytes || 0) / 1024) + " KB" : "：" + r.error));
            }
            try { input.remove(); } catch (error) { /* 忽略 */ }
            const text = ["📥 手动安装数据库", ""].concat(out).concat(["", "装完请点「测试数据库」验证。"]) .join(String.fromCharCode(10));
            resolve(text);
        });
        input.click();
    });
}

/** 从 URL 安装：{ url } 指到一个目录（末尾带 /）或直接给单个文件地址 */
export async function dbImportFromUrl(args) {
    const base = String((args && args.url) || "").trim();
    if (!base) return "请填写 URL（目录地址以 / 结尾，或直接给某个文件地址）";
    const out = [];
    const one = /\.(txt|tsv|json)$/i.test(base);
    for (const f of DB_FILES) {
        if (one && base.indexOf(f) < 0) continue;
        const url = one ? base : base.replace(/\/?$/, "/") + f;
        try {
            const res = await fetch(url);
            if (!res || !res.ok) { out.push("❌ " + f + "：HTTP " + (res ? res.status : "无响应")); continue; }
            const text = await res.text();
            const r = await dbImportFromText(f, text);
            out.push((r.ok ? "✅ " : "❌ ") + f + (r.ok ? "：" + Math.round((r.bytes || 0) / 1024) + " KB" : "：" + r.error));
        } catch (error) { out.push("❌ " + f + "：" + (error && error.message ? error.message : error)); }
    }
    return ["📥 从 URL 安装数据库", ""].concat(out).join(String.fromCharCode(10));
}


/* ------------------------------------------------------------------ *
 * 联网自动更新（照搬 v1：百鸽 cards.zip + ygopro strings.conf）
 *   v1 用纯手写 zip 解析 + 浏览器自带 DecompressionStream，零第三方依赖；
 *   这里原样搬过来，只是把缓存从 localforage 换成 v2 自己的 IndexedDB 层。
 * ------------------------------------------------------------------ */
export const DB_INDEX_URL = "https://ygocdb.com/api/v0/cards.zip";
export const DB_SETNAMES_URL = "https://raw.githubusercontent.com/salix5/ygopro/master/strings.conf";

/** 从 cards.zip 里抽出 cards.json 文本（v1 的 inflateCardsJson 原样移植） */
export async function inflateCardsJson(buffer) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const decoder = new TextDecoder();
    let eocd = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("不是有效的 zip 文件（没找到中央目录）");
    const count = view.getUint16(eocd + 10, true);
    let pointer = view.getUint32(eocd + 16, true);
    for (let i = 0; i < count; i++) {
        if (view.getUint32(pointer, true) !== 0x02014b50) break;
        const method = view.getUint16(pointer + 10, true);
        const compressedSize = view.getUint32(pointer + 20, true);
        const nameLength = view.getUint16(pointer + 28, true);
        const extraLength = view.getUint16(pointer + 30, true);
        const commentLength = view.getUint16(pointer + 32, true);
        const localOffset = view.getUint32(pointer + 42, true);
        const name = decoder.decode(buffer.subarray(pointer + 46, pointer + 46 + nameLength));
        pointer += 46 + nameLength + extraLength + commentLength;
        if (name.indexOf("cards.json") < 0) continue;
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const data = buffer.subarray(start, start + compressedSize);
        if (method !== 8) return decoder.decode(data);
        if (typeof DecompressionStream !== "function") throw new Error("当前客户端不支持 DecompressionStream，无法解压");
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return await new Response(stream).text();
    }
    throw new Error("zip 里没有找到 cards.json");
}

/** cards.json → { namesText, statsText }（格式与内置的 card-names.txt / card-stats.tsv 完全一致） */
export function buildDbTextsFromCards(cards) {
    const fields = ["sc_name", "cn_name", "md_name", "nwbbs_n", "cnocg_n", "jp_name", "en_name"];
    const names = [];
    const seen = {};
    for (const key of Object.keys(cards)) {
        const card = cards[key];
        for (const f of fields) {
            const v = card && card[f];
            if (typeof v !== "string") continue;
            const name = v.trim();
            if (!name) continue;
            const isLatin = /^[\x00-\x7F]+$/.test(name);
            if (isLatin ? name.length < 5 : name.length < 2) continue;
            const key2 = isLatin ? name.toLowerCase() : name;
            if (seen[key2]) continue;
            seen[key2] = 1; names.push(key2);
        }
    }
    const statsRows = [];
    for (const key of Object.keys(cards)) {
        const card = cards[key];
        if (!card || !card.id) continue;
        const displayName = card.sc_name || card.cn_name || card.md_name || card.nwbbs_n || card.cnocg_n || "";
        const types = String((card.text && card.text.types) || "").split("\n").join("§");
        const aliasList = [];
        for (const f of ["sc_name", "cn_name", "md_name", "nwbbs_n", "cnocg_n", "jp_name"]) {
            const v = String(card[f] || "").trim();
            if (!v || v === displayName || aliasList.indexOf(v) >= 0) continue;
            aliasList.push(v);
        }
        const setcode = (card.data && card.data.setcode) || 0;
        statsRows.push(String(card.id) + "\t" + String(card.cid || 0) + "\t" + displayName + "\t" + types + "\t" + String(setcode) + "\t" + String(card.en_name || "").split("\t").join(" ") + "\t" + aliasList.join("|"));
    }
    return { namesText: names.join("\n"), statsText: statsRows.join("\n"), nameCount: names.length, statCount: statsRows.length };
}

/** strings.conf → setnames.json 文本（v1 的 parseSetnames 同款规则） */
export function buildSetnamesJson(text) {
    const map = {};
    for (const raw of String(text || "").split("\n")) {
        const line = raw.replace(/\r$/, "");
        if (/^\s*#/.test(line)) continue;
        const m = line.match(/^!setname\s+0x([0-9a-fA-F]+)\s+(.+)$/);
        if (!m) continue;
        const code = "0x" + parseInt(m[1], 16).toString(16);
        if (map[code]) continue;
        const parts = m[2].split("\t").map(function (x) { return x.trim(); }).filter(Boolean);
        if (!parts[0]) continue;
        map[code] = { cn: parts[0], jp: parts[1] || "" };
    }
    return { text: JSON.stringify(map), count: Object.keys(map).length };
}

/** 一键联网更新：下载 cards.zip → 生成卡名索引/卡表 → 存 IndexedDB；再拉 strings.conf → 字段表 */
export async function dbUpdateOnline(args) {
    const a = args || {};
    const indexUrl = String(a.indexUrl || "").trim() || DB_INDEX_URL;
    const setnamesUrl = String(a.setnamesUrl || "").trim() || DB_SETNAMES_URL;
    const lines = ["🔄 联网更新数据库（v1 同款：百鸽 cards.zip）", ""];
    let ok = 0;
    // ① cards.zip → card-names.txt + card-stats.tsv
    try {
        log("数据库", "开始下载 " + indexUrl);
        const res = await fetch(indexUrl, { cache: "no-store" });
        if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "无响应"));
        const buffer = new Uint8Array(await res.arrayBuffer());
        lines.push("✅ 下载完成：" + Math.round(buffer.length / 1048576 * 10) / 10 + " MB");
        const json = await inflateCardsJson(buffer);
        const cards = JSON.parse(json);
        const built = buildDbTextsFromCards(cards);
        const r1 = await dbImportFromText("card-names.txt", built.namesText);
        const r2 = await dbImportFromText("card-stats.tsv", built.statsText);
        lines.push((r1.ok ? "✅" : "❌") + " card-names.txt：" + built.nameCount + " 条" + (r1.ok ? "" : " —— " + r1.error));
        lines.push((r2.ok ? "✅" : "❌") + " card-stats.tsv：" + built.statCount + " 行" + (r2.ok ? "" : " —— " + r2.error));
        if (r1.ok) ok++; if (r2.ok) ok++;
    } catch (error) {
        lines.push("❌ 下载/解压失败：" + (error && error.message ? error.message : error));
        lines.push("   （若网络不通，可用「📥 安装数据库」手动选文件，或换成镜像地址）");
    }
    // ② strings.conf → setnames.json
    try {
        const res = await fetch(setnamesUrl, { cache: "no-store" });
        if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "无响应"));
        const conf = await res.text();
        const sn = buildSetnamesJson(conf);
        const r3 = await dbImportFromText("setnames.json", sn.text);
        lines.push((r3.ok ? "✅" : "❌") + " setnames.json：" + sn.count + " 个字段" + (r3.ok ? "" : " —— " + r3.error));
        if (r3.ok) ok++;
    } catch (error) {
        lines.push("⚠️ 字段表更新失败（不影响其它）：" + (error && error.message ? error.message : error));
    }
    lines.push("");
    lines.push("本次成功 " + ok + "/3 项。点「🧪 测试数据库」确认。");
    return lines.join(String.fromCharCode(10));
}
/** 本地卡库没载入时给人的指引（缺 data/ 又没用联网更新/手动安装时最常见） */
export function dbMissingHint(what) {
    return String(what || "本地卡库") + "还没载入。请在面板「维护」里任选一种：\n"
        + "  ① 🔄 联网更新数据库（百鸽） —— 一键下载并解压，最省事\n"
        + "  ② 📥 安装数据库（手动选文件） —— 选 card-names.txt / card-stats.tsv / setnames.json / art-index.json\n"
        + "  ③ 🔗 从 URL 安装数据库 —— 给一个目录地址\n"
        + "装完点「🧪 测试数据库」确认（应显示 4/4 通过）。";
}

/** 索引是否为空（用于判断"是不是没载入卡库"） */
export function isDbEmpty(stats) {
    return !stats || !stats.rows || !stats.rows.length;
}
export function registerDbImport() {
    registry.provide("runAction:dbImport", async function (a) { return await dbPickAndInstall(); });
    registry.provide("runAction:dbImportText", async function (a) { const r = await dbImportFromText((a && a.name) || "", (a && a.text) || ""); return r.ok ? "✅ 已安装 " + (a && a.name) : "❌ " + r.error; });
    registry.provide("runAction:dbImportUrl", async function (a) { return await dbImportFromUrl(a || {}); });
    registry.provide("runAction:dbTest", async function () { return await dbTestReport(); });
    registry.provide("runAction:dbUninstall", async function () { const n = await dbUninstall(); return "已卸载手动安装的数据库 " + n + " 项"; });
    registry.provide("tool:dbtest", async function () { return await dbTestReport(); });
    registry.provide("runAction:dbUpdateOnline", async function (a) { return await dbUpdateOnline(a || {}); });
    log("数据库", "手动安装能力已注册（dbImport / dbImportUrl / dbTest / dbUninstall）");
}

export const dbImport = { dbMissingHint, isDbEmpty, DB_FILES, dbKey, refreshAfterDbChange, dbImportFromText, dbInstalled, dbUninstall, dbTestReport, dbPickAndInstall, dbImportFromUrl, dbUpdateOnline, inflateCardsJson, buildDbTextsFromCards, buildSetnamesJson, registerDbImport };
