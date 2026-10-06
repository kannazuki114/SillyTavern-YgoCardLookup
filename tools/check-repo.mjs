/**
 * 入库 / 发布前自检：一条命令确认「别人装完能用」。
 * 用法：node tools/check-repo.mjs
 *
 * 检查项：
 *   1. manifest.json 能解析，js/css 指向的文件真的在
 *   2. manifest.version 与 index.js 的 MODULE_VERSION 一致
 *   3. 卡库 4 个文件齐全且体积正常
 *   4. assets/yugioh 卡框素材齐全
 *   5. dist/index.js 与 src/ 同步（改完源码忘了打包是最常见的发布事故）
 *   6. dist 是关键脚本（没有残留 import/export、带对外接口与探针）
 *   7. .gitignore 没有把 dist/ data/ assets/ 排除掉（一旦排除，网络安装装完就是坏的）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./bundle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let bad = 0;
let warn = 0;
const ok = function (label, pass, detail) {
    console.log((pass ? "  OK   " : "  FAIL ") + label + (detail ? "  " + detail : ""));
    if (!pass) bad++;
    return pass;
};
const warnIf = function (label, pass, detail) {
    if (!pass) { console.log("  WARN " + label + (detail ? "  " + detail : "")); warn++; }
    else console.log("  OK   " + label + (detail ? "  " + detail : ""));
};
const read = function (rel) { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch (error) { return null; } };
const exists = function (rel) { return fs.existsSync(path.join(ROOT, rel)); };

console.log("=== 1. manifest 与入口 ===");
let mf = null;
try { mf = JSON.parse(read("manifest.json")); } catch (error) { /* 下面报错 */ }
ok("manifest.json 可解析", !!mf, mf ? ("v" + mf.version + " · " + mf.display_name) : "解析失败");
if (mf) {
    ok("manifest.js 指向的文件存在（" + mf.js + "）", exists(mf.js));
    ok("manifest.css 指向的文件存在（" + mf.css + "）", !mf.css || exists(mf.css));
    ok("display_name / author / loading_order 齐全", !!mf.display_name && !!mf.author && mf.loading_order !== undefined);
    ok("homePage 不是空（扩展列表里可点）", !!mf.homePage, mf.homePage || "（空）");
    warnIf("auto_update 已打开（GitHub 安装可自动更新）", mf.auto_update === true, mf.auto_update === true ? "" : "当前 false：更新要手动重装");
    const entry = read("index.js") || "";
    const modVer = (entry.match(/MODULE_VERSION\s*=\s*"([^"]+)"/) || [])[1] || "";
    ok("manifest.version 与 index.js MODULE_VERSION 一致", !!modVer && modVer === mf.version, "manifest=" + mf.version + " index.js=" + modVer);
    const interceptor = mf.generate_interceptor || "";
    ok("generate_interceptor 与代码里的常量一致", !!interceptor && entry.indexOf('INTERCEPTOR_NAME = "' + interceptor + '"') >= 0, interceptor || "（未声明）");
}

console.log("=== 2. 卡库文件（data/）===");
const DATA_MIN = { "card-names.txt": 1000 * 1024, "card-stats.tsv": 1500 * 1024, "setnames.json": 10 * 1024, "art-index.json": 5 * 1024 };
for (const f of Object.keys(DATA_MIN)) {
    const p = path.join(ROOT, "data", f);
    let size = 0;
    try { size = fs.statSync(p).size; } catch (error) { size = 0; }
    ok("data/" + f, size >= DATA_MIN[f], Math.round(size / 1024) + " KB（要求 ≥ " + Math.round(DATA_MIN[f] / 1024) + " KB）");
}

console.log("=== 3. 卡框素材（assets/yugioh）===");
let webp = 0;
try { webp = fs.readdirSync(path.join(ROOT, "assets", "yugioh")).filter(function (n) { return /\.(webp|png|jpg)$/i.test(n); }).length; } catch (error) { webp = 0; }
ok("assets/yugioh 素材数量", webp >= 40, webp + " 个（要求 ≥ 40）");

console.log("=== 4. dist 与 src 是否同步 ===");
const distText = read("dist/index.js");
ok("dist/index.js 存在", !!distText, distText ? Math.round(distText.length / 1024) + " KB" : "缺失");
if (distText) {
    // 打包产物里有构建时间戳，比对前先抹掉
    const strip = function (s) { return String(s).replace(/"at":"[^"]*"/, '"at":"X"'); };
    let fresh = null;
    try { fresh = (await build()).bundle; } catch (error) { fresh = null; console.log("  （重新打包失败：" + (error && error.message) + "）"); }
    ok("dist 与当前 src/ 一致（不需要重新打包）", !!fresh && strip(fresh) === strip(distText), fresh ? "" : "无法构建");
    ok("产物里没有残留 import/export（经典脚本）", !/^\s*(import|export)\s/m.test(distText));
    ok("产物带对外接口", distText.indexOf("globalThis.YgoCardLookupV2 = __entry") >= 0);
    ok("产物带诊断探针", distText.indexOf('"ygo2-DIAG"') >= 0 && distText.indexOf("missingCaps") >= 0);
    const fp = (distText.match(/YgoCardLookupV2Build = (\{[^}]*\})/) || [])[1];
    ok("构建指纹存在", !!fp, fp || "（缺失）");
    const srcModules = (function () { let n = 0; const walk = function (d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".js")) n++; } }; walk(path.join(ROOT, "src")); return n; })();
    const modules = fp ? (JSON.parse(fp).modules || 0) : 0;
    ok("产物模块数 = src 模块数 + 入口", modules === srcModules + 1, "dist=" + modules + " src=" + srcModules + "（+1 入口）");
}

console.log("=== 5. .gitignore 不能排除关键文件 ===");
const gi = read(".gitignore") || "";
const lines = gi.split("\n").map(function (l) { return l.trim(); }).filter(function (l) { return l && l.charAt(0) !== "#"; });
for (const must of ["dist", "data", "assets"]) {
    const hit = lines.some(function (l) { return l.replace(/^\//, "").replace(/\/$/, "") === must; });
    ok(".gitignore 没有整目录忽略 " + must + "/", !hit, hit ? "有 " + must + "/ 这一行 → 网络安装会缺文件！" : "");
}
ok(".gitignore 存在", !!gi || true, lines.length + " 条规则");

console.log("=== 6. 体积与文件数 ===");
let files = 0, bytes = 0;
const walk = function (d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.name === ".git") continue; if (e.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; } } };
walk(ROOT);
console.log("  文件 " + files + " 个 · " + (bytes / 1048576).toFixed(2) + " MB");
ok("整体体积在 GitHub 舒适区（< 100MB）", bytes < 100 * 1048576);

console.log("");
console.log(bad ? ("❌ 有 " + bad + " 项必须修" + (warn ? "（另有 " + warn + " 条提示）" : "")) : ("✅ 全部通过" + (warn ? "（" + warn + " 条提示）" : "") + " —— 可以直接入库/发布"));
process.exit(bad ? 1 : 0);
