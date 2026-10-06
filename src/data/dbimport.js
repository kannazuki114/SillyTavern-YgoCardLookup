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
import { cardText } from "./cards.js";   // 用具名导入：打包成经典脚本时动态 import / 命名空间导入都不可用

/** 需要安装的四个数据库文件（名字必须与代码里的读取名一致） */
export const DB_FILES = ["card-names.txt", "card-stats.tsv", "setnames.json", "art-index.json"];

/** 每个文件的识别特征（装错文件时能当场发现） */
const SHAPE = {
    "card-names.txt": function (t) { return t.indexOf("\n") > 0 && t.length > 1000 && t.indexOf("\t") < 0; },
    "card-stats.tsv": function (t) { return t.indexOf("\t") > 0 && /\t\d+\t/.test(t) && t.length > 1000; },
    "setnames.json": function (t) { try { const o = JSON.parse(t); return o && typeof o === "object" && Object.keys(o).length > 50; } catch (error) { return false; } },
    "art-index.json": function (t) { try { const o = JSON.parse(t); return o && typeof o === "object" && Object.keys(o).length > 10; } catch (error) { return false; } },
};

export function dbKey(name) { return "db:" + String(name || ""); }

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
        const r = await cardText({ query: "青眼白龙" });
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

export function registerDbImport() {
    registry.provide("runAction:dbImport", async function (a) { return await dbPickAndInstall(); });
    registry.provide("runAction:dbImportText", async function (a) { const r = await dbImportFromText((a && a.name) || "", (a && a.text) || ""); return r.ok ? "✅ 已安装 " + (a && a.name) : "❌ " + r.error; });
    registry.provide("runAction:dbImportUrl", async function (a) { return await dbImportFromUrl(a || {}); });
    registry.provide("runAction:dbTest", async function () { return await dbTestReport(); });
    registry.provide("runAction:dbUninstall", async function () { const n = await dbUninstall(); return "已卸载手动安装的数据库 " + n + " 项"; });
    registry.provide("tool:dbtest", async function () { return await dbTestReport(); });
    log("数据库", "手动安装能力已注册（dbImport / dbImportUrl / dbTest / dbUninstall）");
}

export const dbImport = { DB_FILES, dbKey, dbImportFromText, dbInstalled, dbUninstall, dbTestReport, dbPickAndInstall, dbImportFromUrl, registerDbImport };
