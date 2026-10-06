import { ctx, log } from "./bus.js";

/** 旧扩展目录：v2 只读引用它的索引与素材，不复制大文件。 */
export const LEGACY_BASE = "/scripts/extensions/third-party/ygo-card-lookup/";

export const EXT_PATH = "/scripts/extensions/third-party/ygo-card-lookup-v2/";
let baseOverride = null;
/** 本扩展自己的目录：经典脚本在【求值那一刻】document.currentScript 就是它自己，和目录/仓库叫什么名字无关。
 *  这是最可靠的一路 —— 从 GitHub 安装时目录名 = 仓库名（可能是 SillyTavern-YgoCardLookup-v2 这种），
 *  以前只认名字里含 "ygo-card-lookup" 的目录，换个仓库名 data/ 就全找不到了。 */
let selfBase = null;
export function captureSelfBase() {
    try {
        if (selfBase) return selfBase;
        const doc = (typeof document !== "undefined") ? document : null;
        const cur = doc && doc.currentScript ? doc.currentScript : null;
        const src = cur ? String(cur.getAttribute("src") || cur.src || "") : "";
        const at = src.indexOf("/scripts/extensions/");
        if (at >= 0 && src.lastIndexOf("/") > at) {
            let head = src.slice(0, src.lastIndexOf("/") + 1);      // 脚本所在目录
            if (/\/dist\/$/.test(head)) head = head.slice(0, -5);   // 产物在 dist/ 下 → 回到扩展根目录（data/ 与 assets/ 在根上）
            selfBase = head;
        }
    } catch (error) { /* 忽略 */ }
    return selfBase;
}
/** 本扩展自己的目录（打包为经典脚本后用固定路径；测试可覆盖） */
export function ownBase() {
    if (baseOverride) return baseOverride;
    // ① 自己脚本所在目录（最准）
    if (selfBase) return selfBase;
    // ② 宿主给的扩展路径：只要它看起来像扩展目录就接受（不再强制目录名里含 ygo-card-lookup）
    try {
        const c = typeof ctx === "function" ? ctx() : null;
        const fromHost = c && c.extensionPath ? String(c.extensionPath) : "";
        if (fromHost && (fromHost.indexOf("/scripts/extensions/") >= 0 || fromHost.indexOf("ygo-card-lookup") >= 0)) return fromHost;
    } catch (error) { /* 忽略 */ }
    // ③ 从页面上的 <script> 反推自身目录（名字对得上的优先）
    try {
        const doc = (typeof document !== "undefined") ? document : null;
        if (doc) {
            const list = doc.querySelectorAll("script[src]");
            for (const el of list) {
                const src = String(el.getAttribute("src") || el.src || "");
                const at = src.indexOf("/scripts/extensions/");
                if (at < 0 || src.indexOf("ygo-card-lookup") < 0) continue;
                const head = src.slice(0, at) + src.slice(at, src.lastIndexOf("/") + 1);
                if (head) return head;
            }
        }
    } catch (error) { /* 忽略 */ }
    // ③ 兜底：常用目录名（两个都试，反正 dataFile 会轮询候选）
    return EXT_PATH;
}

export function setOwnBase(url) { baseOverride = url ? String(url) : null; }

/** 本扩展 manifest 里独一无二的标记（用来确认"某个目录是不是我自己"） */
export const OWN_MARKER = "YgoCardLookupV2";

/** 收集"有可能是我自己目录"的路径，按可信度排序（用于异步确认） */
export function candidateBases() {
    const out = [];
    const push = function (u) { const s = String(u || "").trim(); if (s && out.indexOf(s) < 0) out.push(s); };
    push(baseOverride);
    push(selfBase);
    try {
        const c = typeof ctx === "function" ? ctx() : null;
        const fromHost = c && c.extensionPath ? String(c.extensionPath) : "";
        if (fromHost) push(fromHost.replace(/\/?$/, "/"));
    } catch (error) { /* 忽略 */ }
    // 页面上的 <script src> / <link href>：只要落在扩展目录里就收，**不管目录叫什么名字**
    // （桌面客户端是用 ES 模块方式加载扩展的，此时 document.currentScript 为 null，
    //   只有靠这些线索 + manifest 探测才能认出自己）
    try {
        const doc = (typeof document !== "undefined") ? document : null;
        if (doc && typeof doc.querySelectorAll === "function") {
            for (const el of doc.querySelectorAll("script[src]")) {
                const src = String(el.getAttribute("src") || el.src || "");
                const at = src.indexOf("/scripts/extensions/");
                if (at >= 0 && src.lastIndexOf("/") > at) push(src.slice(0, src.lastIndexOf("/") + 1).replace(/dist\/$/, ""));
            }
            for (const el of doc.querySelectorAll("link[href]")) {
                const href = String(el.getAttribute("href") || el.href || "");
                const at = href.indexOf("/scripts/extensions/");
                if (at >= 0 && href.lastIndexOf("/") > at) push(href.slice(0, href.lastIndexOf("/") + 1));
            }
        }
    } catch (error) { /* 忽略 */ }
    push(EXT_PATH);
    push(LEGACY_BASE);
    return out;
}

/** 异步确认自己的目录：逐个候选读 manifest.json，看到本扩展的标记就认下来并覆盖 baseOverride。
 *  这一步是"目录名任意 / 宿主不给定位信息"时唯一可靠的兜底 —— 否则 data/、assets/、settings.html 全 404。 */
let discoverPromise = null;
export async function discoverOwnBase() {
    if (baseOverride) return baseOverride;
    if (discoverPromise) return discoverPromise;
    discoverPromise = (async function () {
        for (const dir of candidateBases()) {
            try {
                const res = await fetch(dir + "manifest.json", { cache: "no-store" });
                if (!res || !res.ok) continue;
                const text = await res.text();
                if (text.indexOf(OWN_MARKER) < 0) continue;
                setOwnBase(dir);
                log("数据", "扩展目录已确认：" + dir + "（靠 manifest 探测）");
                return dir;
            } catch (error) { /* 换下一个候选 */ }
        }
        return null;
    })();
    return discoverPromise;
}


/** 读扩展自带文本；v2 目录缺失时回退旧目录。 */
/** 数据文件候选 URL：自身目录优先，其次两个常见目录名（去重） */
export function dataCandidates(name) {
    const file = String(name || "");
    // 调用方可能只传文件名（如 "card-stats.tsv"）——自动补上 data/ 这一层；
    // 这就是"数据文件明明在、却读不到"的根因，必须两种写法都试。
    const names = [file];
    if (file.indexOf("data/") !== 0 && file.indexOf("/") < 0) names.push("data/" + file);
    const out = [];
    for (const base of [ownBase(), EXT_PATH, LEGACY_BASE]) {
        for (const n of names) {
            const u = base + n;
            if (out.indexOf(u) < 0) out.push(u);
        }
    }
    return out;
}

export async function dataFile(name, fetchImpl) {
    // ① 先用"手动安装"进 IndexedDB 的那一份（v1 模式；装了就用它，没装就往下走）
    try { const hit = await idbGet("db:" + String(name || ""), 0); if (hit) return hit; } catch (error) { /* 没有 IndexedDB 就跳过 */ }
    const doFetch = fetchImpl || ((typeof fetch === "function") ? fetch : null);
    if (!doFetch) { log("数据", "读取失败：" + name + "（当前环境没有可用的 fetch）"); return ""; }
    const tried = [];
    for (const url of dataCandidates(name)) {
        try {
            const response = await doFetch(url);
            if (response && response.ok) {
                const text = await response.text();
                if (text && text.length) return text;
                tried.push(url + "→ 内容为空");
            } else {
                tried.push(url + "→ HTTP " + (response ? response.status : "无响应"));
            }
        } catch (error) {
            tried.push(url + "→ " + (error && error.message ? error.message : String(error)));
        }
    }
    // 不再静默：把每个候选 URL 与失败原因都写出来（排查"卡库没有"就靠这行）
    log("数据", "读取失败：" + name + "（已尝试 " + tried.length + " 处：" + tried.join("；") + "）");
    return "";
}


/** 带超时的 JSON 取数。 */
export async function fetchJson(url, options, timeoutMs, fetchImpl) {
    const doFetch = fetchImpl || fetch;
    const ms = Number(timeoutMs) || 15000;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, ms) : null;
    try {
        const init = Object.assign({}, options || {});
        if (controller) init.signal = controller.signal;
        const response = await doFetch(url, init);
        if (!response.ok) throw new Error("HTTP " + response.status);
        return await response.json();
    } finally {
        if (timer) clearTimeout(timer);
    }
}

const mem = new Map();
export async function cached(key, ttlMs, producer) {
    const hit = mem.get(key);
    const now = Date.now();
    if (hit && now - hit.at < (ttlMs || 60000)) return hit.value;
    const value = await producer();
    mem.set(key, { at: now, value: value });
    return value;
}
export function clearCache() { mem.clear(); }

/** 懒构建 + 复用（并发只会构建一次），失败后允许重试。 */
export function lazyIndex(builder) {
    let promise = null;
    const ensure = function () {
        if (!promise) {
            promise = Promise.resolve().then(builder).catch(function (error) { promise = null; throw error; });
        }
        return promise;
    };
    /** ★ 手动安装/卸载卡库、清缓存之后必须调它：否则本次会话一直用旧（可能是空的）索引，
     *   表现就是"装完卡库还是要刷新页面才生效"。 */
    ensure.reset = function () { promise = null; };
    return ensure;
}

/** ── IndexedDB 持久缓存（真实现）：卡库文件重启后不用重新下载 ── */

export const IDB_NAME = "ygo2-cache";
export const IDB_STORE = "files";
export const IDB_VERSION = 1;
export const DEFAULT_TTL = 7 * 24 * 3600 * 1000;   // 默认 7 天

let dbPromise = null;

function idbFactory() {
    try { return (typeof indexedDB !== "undefined" && indexedDB) ? indexedDB : null; } catch (error) { return null; }
}

function openDb() {
    const factory = idbFactory();
    if (!factory) return Promise.resolve(null);
    if (!dbPromise) {
        dbPromise = new Promise(function (resolve) {
            let req = null;
            try { req = factory.open(IDB_NAME, IDB_VERSION); } catch (error) { resolve(null); return; }
            req.onupgradeneeded = function () {
                try { const db = req.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); } catch (error) { /* 忽略 */ }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { resolve(null); };
            req.onblocked = function () { resolve(null); };
        });
    }
    return dbPromise;
}

function tx(db, mode, run) {
    return new Promise(function (resolve) {
        try {
            const t = db.transaction(IDB_STORE, mode);
            const store = t.objectStore(IDB_STORE);
            const req = run(store);
            t.oncomplete = function () { resolve(req && req.result !== undefined ? req.result : true); };
            t.onerror = function () { resolve(false); };
            t.onabort = function () { resolve(false); };
        } catch (error) { resolve(false); }
    });
}

/** 读缓存：命中且未过期返回字符串，否则返回 null（任何异常都当作未命中） */
export async function idbGet(key, ttlMs) {
    const db = await openDb();
    if (!db) return null;
    const want = String(key || "");
    if (!want) return null;
    const row = await new Promise(function (resolve) {
        try {
            const t = db.transaction(IDB_STORE, "readonly");
            const req = t.objectStore(IDB_STORE).get(want);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { resolve(null); };
        } catch (error) { resolve(null); }
    });
    if (!row || typeof row.value !== "string") return null;
    const ttl = ttlMs === undefined ? DEFAULT_TTL : Number(ttlMs);
    if (Number.isFinite(ttl) && ttl > 0 && Date.now() - Number(row.at || 0) > ttl) {
        log("缓存", "持久缓存已过期：" + want);
        return null;
    }
    log("缓存", "持久缓存命中：" + want + "（" + (row.value.length / 1024).toFixed(0) + " KB）");
    return row.value;
}

/** 写缓存：成功返回 true；没有 IndexedDB 或失败返回 false（不影响主流程） */
export async function idbSet(key, value, ttlMs) {
    const db = await openDb();
    if (!db) return false;
    const want = String(key || "");
    if (!want || typeof value !== "string") return false;
    const ok = await tx(db, "readwrite", function (store) {
        return store.put({ value: value, at: Date.now(), ttl: ttlMs === undefined ? DEFAULT_TTL : Number(ttlMs) }, want);
    });
    return ok !== false;
}

/** 删一条 / 清空（维护按钮用） */
export async function idbDel(key) {
    const db = await openDb();
    if (!db) return false;
    return (await tx(db, "readwrite", function (store) { return store.delete(String(key || "")); })) !== false;
}
export async function idbClear() {
    const db = await openDb();
    if (!db) return false;
    return (await tx(db, "readwrite", function (store) { return store.clear(); })) !== false;
}

/** 带持久缓存的读文件：先 IndexedDB → 再按普通方式取 → 写回缓存 */
export async function dataFileCached(name, ttlMs, fetchImpl) {
    const key = String(name || "");
    if (!key) return "";
    const hit = await idbGet(key, ttlMs);
    if (hit !== null) return hit;
    const text = await dataFile(key, fetchImpl);
    if (text) { try { await idbSet(key, text, ttlMs); } catch (error) { /* 缓存失败不影响读取 */ } }
    return text;
}

/** 清空全部缓存（内存 + 持久） */
/** 清持久缓存，但保留指定前缀的条目（"db:" 是手动安装的数据库，不是缓存，不能被一起删掉） */
export async function idbClearExcept(keepPrefix) {
    const db = await openDb();
    if (!db) return false;
    const prefix = String(keepPrefix || "");
    return (await tx(db, "readwrite", function (store) {
        if (typeof store.openCursor !== "function") return store.clear();
        const req = store.openCursor();
        req.onsuccess = function () {
            const cur = req.result;
            if (!cur) return;
            try {
                if (prefix && String(cur.key).indexOf(prefix) === 0) { cur.continue(); return; }
                cur.delete();
            } catch (error) { /* 忽略 */ }
            try { cur.continue(); } catch (error) { /* 忽略 */ }
        };
        return req;
    })) !== false;
}

export async function clearAllCache() {
    mem.clear();
    // ★ 以前是 idbClear()：把整个对象存储清空 —— 连用户"手动安装的数据库"也一起删了
    const ok = await idbClearExcept("db:");
    log("缓存", "缓存已清空（持久缓存：" + (ok ? "已清" : "不可用") + "；手动安装的数据库保留）");
    return ok;
}
export function hostReady() { const c = ctx(); return !!(c && (c.chat || c.extensionSettings)); }
