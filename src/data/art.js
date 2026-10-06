import { log } from "../core/bus.js";
import { registry } from "../core/registry.js";
import { fetchJson, cached, lazyIndex, ownBase } from "../core/http.js";
import { settings } from "../core/settings.js";
import { findCard } from "./cards.js";
import { getStatsIndex } from "./indexes.js";

/** ── 统一模板（数据模块）：常量 → 纯函数 → 懒取数 → register → exports ── */

/** 1) 常量 */
export const YGOPRODECK_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
export const ART_TTL = 24 * 3600 * 1000;

let fetchImpl = null;
let readText = null;   // 浏览器默认走 fetch；测试注入本地文件
export function configure(options) {
    if (options && typeof options.fetchJson === "function") fetchImpl = options.fetchJson;
    if (options && typeof options.readText === "function") readText = options.readText;
}

/** 本地异画索引（data/art-index.json，随插件分发；离线可用） */
export function artIndexUrl() { return ownBase() + "data/art-index.json"; }
export async function readIndexText() {
    if (readText) return await readText("art-index.json");
    const response = await fetch(artIndexUrl());
    if (!response.ok) throw new Error("异画索引读取失败 HTTP " + response.status);
    return await response.text();
}
export const getArtIndex = lazyIndex(async function () {
    const data = JSON.parse(await readIndexText());
    const out = {};
    for (const key of Object.keys(data)) { if (key === "_meta") continue; const v = data[key]; out[key] = { n: Number(v.n) || (v.arts ? v.arts.length : 0), arts: Array.isArray(v.arts) ? v.arts.map(String) : [], cn: String(v.cn || ""), en: String(v.en || "") }; }
    return out;
});
export function artImageUrl(artId) { return "https://images.ygoprodeck.com/images/cards/" + String(artId) + ".jpg"; }
function doFetch(url, ms) { return fetchImpl ? fetchImpl(url, ms) : fetchJson(url, {}, ms); }

/** 2) 纯函数 */
/** 归一 card_images（YGOPRODeck 的异画数组） */
export function artList(payload) {
    const card = payload && Array.isArray(payload.data) ? payload.data[0] : null;
    const images = card && Array.isArray(card.card_images) ? card.card_images : [];
    return images.map(function (im, i) {
        return { index: i + 1, id: String(im.id || ""), url: String(im.image_url || ""), small: String(im.image_url_small || "") };
    }).filter(function (x) { return x.url; });
}

export function artText(name, arts) {
    if (!arts.length) return "「" + name + "」没有查到异画数据（YGOPRODeck 未收录，可能是 OCG 专属卡或网络不通）。";
    const lines = ["🎨 异画 · " + name + "（共 " + arts.length + " 个版本）"];
    arts.forEach(function (a) { lines.push("[" + a.index + "] ![](" + a.url + ")"); });
    return lines.join("\n");
}

/** 3) 取数：先按英文名（能拿到全部异画），再退回按密码（通常只有一张） */
export async function fetchArtsByEnglish(enName) {
    const name = String(enName || "").trim();
    if (!name) return [];
    const payload = await cached("art:name:" + name, ART_TTL, async function () {
        return await doFetch(YGOPRODECK_URL + "?name=" + encodeURIComponent(name), 15000);
    });
    return artList(payload);
}

export async function fetchArtsById(id) {
    const key = String(id || "").trim();
    if (!key) return [];
    const payload = await cached("art:id:" + key, ART_TTL, async function () {
        return await doFetch(YGOPRODECK_URL + "?id=" + key, 15000);
    });
    return artList(payload);
}

export async function artOf(query) {
    const row = await findCard(query);
    if (!row) return { row: null, arts: [], source: "none" };
    // ① 本地索引（离线可用，随插件分发）
    try {
        const index = await getArtIndex();
        const hit = index[String(row.id)];
        if (hit && hit.arts.length > 1) {
            return { row: row, source: "local", arts: hit.arts.map(function (id, i) { return { index: i + 1, id: id, url: artImageUrl(id), small: artImageUrl(id) }; }) };
        }
    } catch (error) { log("异画", "本地索引不可用：" + (error && error.message ? error.message : error)); }
    // ② 网络后备（先英文名，再密码）
    if (settings.get("useYgoprodeck") === false) return { row: row, arts: [], source: "none" };
    let arts = [];
    try { if (row.en) arts = await fetchArtsByEnglish(row.en); } catch (error) { log("异画", "按英文名取失败：" + (error && error.message ? error.message : error)); }
    if (!arts.length) { try { arts = await fetchArtsById(row.id); } catch (error) { log("异画", "按密码取失败：" + (error && error.message ? error.message : error)); } }
    return { row: row, arts: arts, source: arts.length ? "remote" : "none" };
}

/** 列出索引里全部有异画的卡（离线） */
async function listAltArtCardsInner(limit) {
    const index = await getArtIndex();
    const stats = await getStatsIndex();
    const keys = Object.keys(index).sort(function (a, b) { return index[b].n - index[a].n || Number(a) - Number(b); });
    const want = Math.max(1, Math.min(200, Number(limit) || 60));
    const lines = ["🎨 有异画的卡（本地索引，共 " + keys.length + " 张 / " + keys.reduce(function (n, k) { return n + index[k].n; }, 0) + " 张版本图）"];
    for (const key of keys.slice(0, want)) {
        const row = stats.byId.get(key);
        const label = (row && row.name) || index[key].cn || index[key].en || "（未知卡名）";
        lines.push("· " + label + "（" + key + "）" + index[key].n + " 版");
    }
    if (keys.length > want) lines.push("…（还有 " + (keys.length - want) + " 张，可提高 limit）");
    lines.push("", "想看某张卡的全部版本图：用异画工具传它的卡名。");
    return lines.join("\n");
}

export async function artTextFor(query) {
    const q = String(query || "").trim();
    if (!q) return "想看哪张卡的异画？";
    const res = await artOf(q);
    if (!res.row) return "没有找到「" + q + "」。";
    if (!res.arts.length) return "「" + res.row.name + "」没有查到异画数据（YGOPRODeck 未收录，可能是 OCG 专属卡或网络不通）。";
    return artText(res.row.name, res.arts);
}

/** 4) 注册能力 */
export function registerArt() {
    registry.provide("tool:art", async function (args) { return await artTextFor(args && args.query); });
    registry.provide("tool:artlist", async function (args) { return await listAltArtCards(args && args.limit); });
    registry.provide("runAction:art", async function (trigger) {
        if (!trigger) return [];
        if (trigger.action === "artlist") return [{ name: "异画卡表", text: await listAltArtCards(60) }];
        if (trigger.action !== "art") return [];
        return [{ name: "异画", text: await artTextFor(trigger.arg) }];
    });
    log("数据", "异画能力已注册（art）");
}

export const artMod = { YGOPRODECK_URL, artIndexUrl, readIndexText, getArtIndex, artImageUrl, listAltArtCards, ART_TTL, configure, artList, artText, fetchArtsByEnglish, fetchArtsById, artOf, artTextFor, registerArt };

/** 对外入口：本地异画索引不可用时给友好提示，绝不抛错 */
export async function listAltArtCards() {
    try { return await listAltArtCardsInner.apply(null, arguments); }
    catch (error) {
        log("异画", "本地异画索引不可用：" + (error && error.message ? error.message : error));
        return "🎨 本地异画索引暂时不可用（浏览器里通常可用；也可能是扩展的 data/art-index.json 缺失）。可以改用「这张卡有哪些异画」按卡名查。";
    }
}
