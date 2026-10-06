import { log } from "../core/bus.js";
import { registry } from "../core/registry.js";
import { fetchJson, cached, lazyIndex } from "../core/http.js";
import { settings } from "../core/settings.js";
import { getStatsIndex, normalizeKey } from "./indexes.js";
import { findCard, cardDetail } from "./cards.js";

/** ── 统一模板（数据模块）：常量 → 纯函数 → 懒索引 → register → exports ── */

/** 1) 常量 */
export const LIMITS_URL = "https://ygocdb.com/api/v0/limits.json";
export const CARD_DETAIL_URL = "https://ygocdb.com/api/v0/card/";
export const REGIONS = ["cn", "ja", "en"];
export const REGION_LABEL = { cn: "官方简中", ja: "OCG 日文", en: "TCG 英文" };
export const STATUS_TEXT = { forbidden: "禁止卡", limited: "限制 1 张", semi: "准限制 2 张", none: "无限制" };   // none 也要有中文标签（否则对外返回 label:"none"）

let fetchImpl = null;
export function configure(options) { if (options && typeof options.fetchJson === "function") fetchImpl = options.fetchJson; }
function doFetch(url, ms) { return fetchImpl ? fetchImpl(url, ms) : fetchJson(url, {}, ms); }

/** 2) 纯函数 */
/** 解析禁限表：键是 CID（不是 8 位密码），这一条已用线上数据核对过 */
/** 接口取不到时的空表（形状与 parseLimits 一致）——让调用方走"未取到"分支，而不是让整个能力抛异常 */
export function emptyLimits() {
    const one = function () { return { date: "", forbidden: new Set(), limited: new Set(), semi: new Set(), names: { forbidden: {}, limited: {}, semi: {} } }; };
    return { cn: one(), ja: one(), en: one() };
}
export function parseLimits(json) {
    const data = typeof json === "string" ? JSON.parse(json) : (json || {});
    const out = {};
    for (const region of Object.keys(data)) {
        const src = data[region] || {};
        const toSet = function (obj) { return new Set(Object.keys(obj || {}).map(function (k) { return String(k); })); };
        out[region] = {
            date: String(src.date || ""),
            forbidden: toSet(src.forbidden),
            limited: toSet(src.limited),
            semi: toSet(src.semi_limited),
            names: { forbidden: src.forbidden || {}, limited: src.limited || {}, semi: src.semi_limited || {} },
        };
    }
    return out;
}

/** 查禁限状态：同时接受 CID 与 8 位密码 */
export function banlistStatus(limits, region, row) {
    if (!limits || !row) return "unknown";
    const r = limits[region] || limits.cn;
    if (!r) return "unknown";
    const keys = [String(row.cid || ""), String(row.id || "")].filter(Boolean);
    for (const key of keys) {
        if (r.forbidden.has(key)) return "forbidden";
        if (r.limited.has(key)) return "limited";
        if (r.semi.has(key)) return "semi";
    }
    return "none";
}

/** 通常召唤需要的祭品数（只算本地能确定的部分，不越界推断特殊召唤） */
export function tributeNeeded(row) {
    const text = String((row && row.typeText) || "");
    if (text.indexOf("[怪兽") < 0) return null;
    if (text.indexOf("连接") >= 0) return { legal: false, reason: "连接怪兽不能通常召唤，只能作为连接素材出场" };
    if (text.indexOf("仪式") >= 0) return { legal: false, reason: "仪式怪兽需要仪式魔法卡进行仪式召唤" };
    if (/融合|同调|超量/.test(text)) return { legal: false, reason: "这类怪兽需要对应的特殊召唤（融合/同调/超量召唤）" };
    const m = /\[(★|☆)(\d+)\]/.exec(text);
    const level = m ? Number(m[2]) : 0;
    if (!level) return null;
    if (level <= 4) return { legal: true, tributes: 0, reason: "4 星以下可以直接通常召唤" };
    if (level <= 6) return { legal: true, tributes: 1, reason: level + " 星需要 1 只祭品" };
    return { legal: true, tributes: 2, reason: level + " 星需要 2 只祭品" };
}

/** 召唤合法性文本 */
export async function summonText(args) {
    const row = await findCard(args.query);
    if (!row) return "没有找到「" + String(args.query || "") + "」。";
    const need = tributeNeeded(row);
    const lines = ["⚖️ 召唤检查 · " + (args.method || "通常召唤") + "「" + row.name + "」"];
    if (!need) {
        lines.push("这张卡的类型信息不足，无法在本地判断（请给完整卡名，或直接问官方裁定）。");
        return lines.join("\n");
    }
    if (!need.legal) lines.push("❌ 不能这样出场：" + need.reason);
    else lines.push(need.tributes ? "需要祭品：" + need.tributes + " 只（" + need.reason + "）" : "✅ 可以直接通常召唤（" + need.reason + "）");
    try {
        const limits = await getLimits();
        const status = banlistStatus(limits, "cn", row);
        if (status !== "unknown" && status !== "none") lines.push("⚠️ 禁限状态（" + REGION_LABEL.cn + "）：" + STATUS_TEXT[status]);
    } catch (error) { /* 禁限表不可用不影响主判定 */ }
    lines.push("", "（本判定只覆盖通常召唤的祭品数与禁限状态；特殊召唤的素材要求请用官方裁定确认。）");
    return lines.join("\n");
}

/** 禁限表文本 */
/**
 * 禁限表文本。
 *   banlistText()               → 整张表（禁止/限制/准限制）+ 一句"未列出＝无限制"的说明
 *   banlistText(null, query)    → 只查这一张卡的状态（会明确回答"无限制"，不再让 AI 自己推断）
 */
export async function banlistText(region, query) {
    const limits = await getLimits();
    const key = REGIONS.indexOf(region || settings.get("banlistRegion") || "cn") >= 0 ? (region || settings.get("banlistRegion") || "cn") : "cn";
    const data = limits[key];
    if (!data) return "未能获取禁限卡表。";
    const label = REGION_LABEL[key] || key;
    // 指定了卡名/卡密 → 只回这一张（含"无限制"）
    if (query) {
        const st = await banlistStatusOf(query);
        const name = String(query).trim();
        if (st.status === "unknown") return "禁限查询：" + name + " —— " + (st.label || "查询失败") + "。";
        const note = st.status === "none"
            ? "（该卡不在禁止/限制/准限制名单里，按当前表可以放满 3 张；同名卡合计上限以官方规则为准）"
            : "（同名卡合计上限：" + (st.status === "forbidden" ? "0 张" : st.status === "limited" ? "1 张" : "2 张") + "）";
        return "禁限状态：" + name + " —— " + (st.label || st.status) + " · " + label + "（生效日期 " + (data.date || "未知") + "）\n" + note;
    }
    const section = function (title, map) {
        const names = Object.keys(map || {}).map(function (k) { return map[k]; });
        if (!names.length) return "【" + title + "】0 张";
        return "【" + title + "】" + names.length + " 张\n" + names.slice(0, 60).join("、") + (names.length > 60 ? " …" : "");
    };
    return "游戏王禁限卡表 · " + label + "（生效日期 " + (data.date || "未知") + "）\n\n"
        + section("禁止", data.names.forbidden) + "\n\n"
        + section("限制 1 张", data.names.limited) + "\n\n"
        + section("准限制 2 张", data.names.semi) + "\n\n"
        + "【无限制】除上面三档以外的卡都是无限制（可放满 3 张）。想知道某张卡具体属于哪一档，用 get_yugioh_banlist 带上 query（卡名或卡密）精确查询。";
}

/** 检索关键词上限（字数）：裁定关键词、多卡检索都按它截断 */
export const KEYWORD_MAX = 200;

/** 官方裁定（网络；失败时明确说明，禁止编造） */
/** 去掉 HTML 标签与常见实体（百鸽的问答原文带标签） */
export function stripHtml(text) {
    return String(text === undefined || text === null ? "" : text)
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
}

/** 裁定条目：在响应顶层（faqs 与 data 同级），不是 data.faqs */
export function faqList(payload) {
    const p = payload || {};
    if (Array.isArray(p.faqs)) return p.faqs;
    if (p.data && Array.isArray(p.data.faqs)) return p.data.faqs;
    return [];
}

/** 官方裁定（网络；失败时明确说明，禁止编造） */
export async function rulingText(args) {
    const row = await findCard(args.query);
    if (!row) return "没有找到「" + String(args.query || "") + "」。";
    try {
        const payload = await cardDetail(row.id, { full: true });   // 与 cards.js 共用同一个缓存键（同一 URL 不再取两次）
        const faqs = faqList(payload);
        if (!faqs.length) return "「" + row.name + "」在官方裁定库里没有条目（共 0 条）。";
        const keyword = String((args && args.keyword) || "").trim().slice(0, KEYWORD_MAX);   // 关键词最长 200 字
        let matched = faqs;
        if (keyword) {
            const k = keyword.toLowerCase();
            matched = faqs.filter(function (f) {
                return (stripHtml(f.title) + " " + stripHtml(f.question) + " " + stripHtml(f.answer)).toLowerCase().indexOf(k) >= 0;
            });
            if (!matched.length) matched = faqs;
        }
        const sorted = matched.slice().sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
        const limit = Math.max(1, Math.min(20, Number((args && args.limit) || 5)));
        const shown = sorted.slice(0, limit);
        const lines = ["⚖️ 官方裁定 · " + row.name, "共 " + faqs.length + " 条" + (keyword ? "，含「" + keyword + "」的 " + matched.length + " 条" : "") + "（原文日文），按日期倒序显示 " + shown.length + " 条："];
        shown.forEach(function (f, i) {
            lines.push("", "[" + (i + 1) + "] " + String(f.date || "") + (f.fid ? "（fid " + f.fid + "）" : ""));
            const q = stripHtml(f.question);
            const a = stripHtml(f.answer);
            if (q) lines.push("问：" + q);
            if (a) lines.push("答：" + a);
        });
        return lines.join("\n");
    } catch (error) {
        return "裁定获取失败：" + (error && error.message ? error.message : error) + "（网络问题请稍后重试，不要凭记忆作答）";
    }
}

/**
 * 多卡互动裁定：同时出现多张卡时，优先给"同时提到这几张卡"的官方裁定。
 *
 * 为什么需要它：单卡最近 3 条只能回答"这张卡怎么用"，回答不了"这两张卡一起上场怎么判"。
 * 做法：取每张卡的 FAQ 池（cached，24h）→ 合并去重 → 按"提到了几张卡"打分 →
 *       有一条同时提到全部卡时，就只给这些（这就是"优先"）；否则退化为相关度最高的几条。
 */
/**
 * 纯函数：把"每张卡的 FAQ 池"排成"多卡互动裁定"文本。
 *
 * 排序规则（这就是"优先"的含义）：
 *   1. 同时提到全部卡的条文排最前（分数 +1000）
 *   2. 其次按"提到几张卡"（每张 +10）与"被几张卡共用"（+1）
 *   3. 回退时**按卡轮转**：某张卡的条文不会被另一张卡的条文量压死（灰流丽 79 条 vs 增援 13 条）
 * 抽成纯函数是为了能不联网、确定性地测排序。
 */
export function renderCrossRulings(pools, names, keyword, limit) {
    const list = Array.isArray(pools) ? pools.filter(function (p) { return p && p.name && Array.isArray(p.faqs) && p.faqs.length; }) : [];
    const who = (Array.isArray(names) ? names : []).map(function (n) { return String(n || "").trim(); }).filter(Boolean);
    if (list.length < 2 || who.length < 2) return "";
    const kw = String(keyword || "").trim().slice(0, KEYWORD_MAX);
    const byKey = new Map();
    for (const p of list) {
        for (const f of p.faqs) {
            const key = String(f.fid || f.id || (String(f.question || "") + "|" + String(f.answer || ""))).slice(0, 100);
            if (!byKey.has(key)) byKey.set(key, { faq: f, owners: [] });
            const e = byKey.get(key);
            if (e.owners.indexOf(p.name) < 0) e.owners.push(p.name);
        }
    }
    const lower = function (s) { return stripHtml(s).toLowerCase(); };
    const scored = [];
    for (const e of byKey.values()) {
        const text = lower(e.faq.title) + " " + lower(e.faq.question) + " " + lower(e.faq.answer);
        if (kw && text.indexOf(kw.toLowerCase()) < 0) continue;
        const mentioned = who.filter(function (n) { return text.indexOf(n.toLowerCase()) >= 0; });
        scored.push({ faq: e.faq, owners: e.owners, mentioned: mentioned, all: mentioned.length === who.length, score: (mentioned.length === who.length ? 1000 : 0) + mentioned.length * 10 + e.owners.length });
    }
    if (!scored.length) return "";
    scored.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return String(b.faq.date || "").localeCompare(String(a.faq.date || ""));
    });
    const max = Math.max(1, Math.min(5, Number(limit) || 3));
    const allHit = scored.filter(function (s) { return s.all; });
    let shown = [];
    if (allHit.length) shown = allHit.slice(0, max);
    else {
        // 回退：按卡轮转，保证每张有条例文的卡至少出现一次
        const groups = new Map();
        for (const s of scored) {
            const key = s.mentioned.length ? s.mentioned[0] : (s.owners[0] || "其他");
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(s);
        }
        const order = Array.from(groups.keys());
        let round = 0;
        while (shown.length < max && round < 50) {
            let added = false;
            for (const k of order) {
                const g = groups.get(k);
                if (g.length > round) { shown.push(g[round]); added = true; }
                if (shown.length >= max) break;
            }
            if (!added) break;
            round++;
        }
    }
    const cardCount = shown.length ? new Set(shown.map(function (s) { return s.mentioned[0] || (s.owners[0] || ""); })).size : 0;
    const lines = ["⚖️ 多卡互动裁定 · " + who.join(" + ")];
    lines.push(allHit.length
        ? ("同时提到这 " + who.length + " 张卡的有 " + allHit.length + " 条" + (kw ? "（关键词「" + kw + "」）" : "") + "，显示 " + shown.length + " 条：")
        : ("没有一条同时提到全部 " + who.length + " 张；下面是提到最多张的 " + shown.length + " 条（覆盖 " + cardCount + " 张卡，各条分别提到 " + shown.map(function (s) { return s.mentioned.length; }).join(" / ") + " 张）："));
    shown.forEach(function (s, i) {
        lines.push("", "[" + (i + 1) + "] " + String(s.faq.date || "") + (s.faq.fid ? "（fid " + s.faq.fid + "）" : "") + (s.mentioned.length ? "（提到 " + s.mentioned.join("、") + "）" : ""));
        const q = stripHtml(s.faq.question);
        const a = stripHtml(s.faq.answer);
        if (q) lines.push("问：" + q);
        if (a) lines.push("答：" + a);
    });
    return lines.join("\n");
}

/** 多卡互动裁定（网络取池 + 纯函数排序） */
export async function crossRulingText(args) {
    const o = args || {};
    const raw = Array.isArray(o.cards) ? o.cards : [];
    const names = [];
    for (const c of raw) {
        const n = String((c && (c.name || c)) || "").trim();
        if (n && names.indexOf(n) < 0) names.push(n);
    }
    if (names.length < 2) return "";
    const pools = [];
    for (const n of names) {
        const row = await findCard(n);
        if (!row) continue;
        try {
            const payload = await cardDetail(row.id, { full: true });   // 与 cards.js 共用同一个缓存键（同一 URL 不再取两次）
            const faqs = faqList(payload);
            if (faqs.length) pools.push({ name: row.name, faqs: faqs });
        } catch (error) { /* 单张卡取不到不影响其他 */ }
    }
    return renderCrossRulings(pools, names, o.keyword, o.limit);
}

/** 3) 懒索引 */
export const getLimits = lazyIndex(async function () {
    // 以前这里直接 await doFetch：断网/接口挂了就抛出去，/ygodeck 与禁限查询整个报错。
    // 现在退化成空表（"未能获取禁限卡表"），其它本地判定照常。
    try { return parseLimits(await doFetch(LIMITS_URL, 20000)); }
    catch (error) {
        log("数据", "禁限表取不到（" + (error && error.message ? error.message : error) + "）：禁限相关判定暂时不可用");
        return emptyLimits();
    }
});

/** 4) 注册能力 */
/** 触发词派发（与 packs.runAction 合并注册；同一个 key 后注册者覆盖前者，因此集中在这里做总派发） */
export async function runAction(trigger) {
    const action = trigger && trigger.action;
    const arg = (trigger && trigger.arg) || "";
    if (action === "banlist") return [{ name: arg ? "禁限状态" : "禁限卡表", text: await banlistText(settings.get("banlistRegion") || "cn", arg) }];
    if (action === "rule") {
        if (!arg) return [];
        const text = await rulingText({ query: arg, limit: 3 });
        return [{ name: "官方裁定", text: text }];
    }
    return [];
}

/** 单卡禁限状态（面板「查询内容 → 禁限状态」用）：返回 {status, label, region} */
export async function banlistStatusOf(query) {
    const row = await findCard(query);
    if (!row) return { status: "unknown", label: "未找到这张卡", region: "" };
    const region = settings.get("banlistRegion") || "cn";
    try {
        const limits = await getLimits();
        const status = banlistStatus(limits, region, row);
        return { status: status, label: STATUS_TEXT[status] || status, region: REGION_LABEL[region] || region };
    } catch (error) { return { status: "unknown", label: "禁限表不可用", region: region }; }
}

export function registerRules() {
    registry.provide("runAction:rules", async function (trigger) { return await runAction(trigger); });
    registry.provide("banlistStatusOf", async function (q) { return await banlistStatusOf(q); });
registry.provide("tool:banlist", async function (args) { return await banlistText(args && args.region, args && (args.query || args.card)); });
    registry.provide("tool:summon", async function (args) { return registry.has("checkSummon") ? await registry.call("checkSummon", args || {}) : await summonText(args || {}); });
    registry.provide("tool:ruling", async function (args) { return await rulingText(args || {}); });
    registry.provide("ruling:cross", async function (args) { return await crossRulingText(args || {}); });
    registry.provide("index:limits", getLimits);
    log("数据", "规则能力已注册（banlist/summon/ruling）");
}

export const rules = { KEYWORD_MAX, crossRulingText, renderCrossRulings, checkSummonDelegated: true, banlistStatusOf, stripHtml, faqList, LIMITS_URL, CARD_DETAIL_URL, REGIONS, REGION_LABEL, STATUS_TEXT, configure, parseLimits, banlistStatus, tributeNeeded, summonText, banlistText, rulingText, getLimits, registerRules };
