import { ctx, log } from "./bus.js";

/** 旧扩展目录：v2 只读引用它的索引与素材，不复制大文件。 */
export const LEGACY_BASE = "/scripts/extensions/third-party/ygo-card-lookup/";

export const EXT_PATH = "/scripts/extensions/third-party/ygo-card-lookup-v2/";
let baseOverride = null;
/** 本扩展自己的目录（打包为经典脚本后用固定路径；测试可覆盖） */
export function ownBase() {
    if (baseOverride) return baseOverride;
    // ① 宿主给的扩展路径：**任何目录名都接受**（从 GitHub 安装时目录名 = 仓库名，例如 ygo-card-lookup）
    try {
        const c = typeof ctx === "function" ? ctx() : null;
        const fromHost = c && c.extensionPath ? String(c.extensionPath) : "";
        if (fromHost && fromHost.indexOf("ygo-card-lookup") >= 0) return fromHost;
    } catch (error) { /* 忽略 */ }
    // ② 从页面上的 <script> 反推自身目录（这个最准，和目录名无关）
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
    return function ensure() {
        if (!promise) {
            promise = Promise.resolve().then(builder).catch(function (error) { promise = null; throw error; });
        }
        return promise;
    };
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
export async function clearAllCache() {
    mem.clear();
    const ok = await idbClear();
    log("缓存", "缓存已清空（持久缓存：" + (ok ? "已清" : "不可用") + "）");
    return ok;
}
export function hostReady() { const c = ctx(); return !!(c && (c.chat || c.extensionSettings)); }
