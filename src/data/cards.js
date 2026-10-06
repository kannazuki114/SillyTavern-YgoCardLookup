import { log } from "../core/bus.js";
import { registry } from "../core/registry.js";
import { settings } from "../core/settings.js";
import { fetchJson, cached } from "../core/http.js";
import { getNameIndex, getStatsIndex, normalizeKey } from "./indexes.js";
import { splitSetcodes, fieldNameOf, fieldNamesWithJpOf } from "./setcodes.js";

/** 1) 常量 */
export const API_SEARCH = "https://ygocdb.com/api/v0/?search=";
export const API_CARD = "https://ygocdb.com/api/v0/card/";
export const SITE_CARD = "https://ygocdb.com/card/";   // 百科页（v1 每张卡都会给这个链接）
export const IMAGE_BASE = "https://cdn.233.momobako.com/ygopro/pics/";
export const PRE_IMAGE_BASE = "https://cdntx.moecube.com/ygopro-super-pre/data/pics/";

let fetchImpl = null;
export function configure(options) { if (options && typeof options.fetchJson === "function") fetchImpl = options.fetchJson; }
function doFetch(url, ms) { return fetchImpl ? fetchImpl(url, ms) : fetchJson(url, {}, ms); }

/** 2) 纯函数 */
/** 接口返回的 types 是"换行版"（"[怪兽|效果] 念动力/暗\n[★4] 1900/300"），本地卡库与 parseTypeText 用的是 § 分隔；
 *  直接塞进去会让 ATK/DEF 解析不到（parts[1] 为空）并把换行带进注入文本。 */
export function normalizeApiTypes(types) {
    const s = String(types === undefined || types === null ? "" : types);
    if (!s) return "";
    if (s.indexOf("§") >= 0) return s.trim();
    return s.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean).join("§");
}

/** 卡图 URL：9 位视为超先行卡 */
export function imageUrl(id) {
    const key = String(id || "").trim();
    if (!/^\d+$/.test(key)) return "";
    return (key.length >= 9 ? PRE_IMAGE_BASE : IMAGE_BASE) + key + ".jpg";
}

/** 解析类型/数值文本："[怪兽|通常] 龙/光§[★8] 3000/2500" */
export function parseTypeText(typeText) {
    const s = String(typeText || "");
    const parts = s.split("§");
    const head = parts[0] || "";
    // 方括号内是卡种（怪兽|效果|连接），方括号后是 种族/属性
    const bracket = /^\[([^\]]*)\]/.exec(head);
    const kinds = bracket ? bracket[1].split("|").filter(Boolean) : [];
    const rest = bracket ? head.slice(bracket[0].length).trim() : head.trim();
    const ra = rest.split("/").filter(Boolean);
    const scale = /\[(★|☆)(\d+)\]|\[LINK-(\d+)\]/.exec(s);
    const nums = /(\d+|\?|-)\s*\/\s*(\d+|\?|-)/.exec(parts[1] || "");
    return {
        kinds: kinds,
        race: ra[0] || "",
        attribute: ra[1] || "",
        level: scale && scale[2] ? Number(scale[2]) : 0,
        levelMark: scale && scale[1] ? scale[1] : "",
        link: scale && scale[3] ? Number(scale[3]) : 0,
        atk: nums ? nums[1] : "",
        def: nums ? nums[2] : "",
    };
}

/** 找卡：按卡密精确 → 卡名/别名/英文名精确 → 卡名索引兜底 */
/** 英文名比较用：在通用归一化基础上再去掉 - _ ' .（Blue-Eyes 与 blue eyes 要能互相命中） */
function normalizeEn(text) { return normalizeKey(text).toLowerCase().replace(/[-_'."]/g, "").replace(/\s+/g, ""); }   // 必须转小写：normalizeKey 不改大小写（实测 Blue-EyesWhiteDragon ≠ blueeyeswhitedragon）

/** 片段是否"像卡名"：不能以功能词开头/结尾（切歪的片段如「的黑魔」要挡掉） */
function goodSegment(seg) {
    const s = String(seg || "");
    if (s.length < 2) return false;
    const STOP = "的了是在和与就都也这那他她它们个张把被给让对从向为以及或我你您啥吗呢吧啊哦嗯 ，。、！？：；（）()《》[]【】·-—";
    if (STOP.indexOf(s.charAt(0)) >= 0) return false;
    if (STOP.indexOf(s.charAt(s.length - 1)) >= 0) return false;
    return true;
}
export async function findCard(query) {
    const q = String(query || "").trim();
    if (!q) return null;
    const stats = await getStatsIndex();
    if (/^\d{5,10}$/.test(q)) { const hit = stats.byId.get(q); if (hit) return hit; }
    const key = normalizeKey(q);
    const hit2 = stats.byName.get(key);
    if (hit2) return hit2;
    const names = await getNameIndex();
    const canonical = names.get(key);
    if (canonical) { const hit3 = stats.byName.get(normalizeKey(canonical)); if (hit3) return hit3; }
    // 俗称兜底：把俗称换成官方名再查一次（俗称表由 collection 模块提供）
    if (registry.has("resolveAliasName")) {
        try {
            const official = String(await registry.call("resolveAliasName", q) || "").trim();
            if (official && normalizeKey(official) !== key) {
                const hit4 = stats.byName.get(normalizeKey(official));
                if (hit4) { log("查询", "俗称「" + q + "」→「" + official + "」命中"); return hit4; }
                const hit5 = names.get(normalizeKey(official));
                if (hit5) { const hit6 = stats.byName.get(normalizeKey(hit5)); if (hit6) return hit6; }
            }
        } catch (error) { /* 俗称表不可用不影响查询 */ }
    }
    // 数字卡密在线取整卡（v1 的 getCardById 同款）：本地表没有的卡也能查
    if (/^\d{5,10}$/.test(q)) {
        try {
            const d = await cardDetail(q).catch(function () { return null; });
            if (d && d.id) {
                log("查询", "卡密 " + q + " 本地表没有，已从百鸽取回：" + String(d.cn_name || d.name || q));
                return { id: String(d.id || q), cid: String(d.cid || ""), name: String(d.cn_name || d.name || q), typeText: String((d.text && d.text.types) || ""), setcode: String((d.data && d.data.setcode) || "0"), en: String(d.en_name || ""), aliases: [] };
            }
        } catch (error) { /* 取不到就当没有 */ }
    }
    // 英文精确（归一化后比较）：blue eyes white dragon / blue-eyes white dragon 都要命中
    {
        const eq = normalizeEn(q);
        if (eq && /^[a-z0-9]+$/.test(eq)) {
            for (const row of stats.rows) {
                if (normalizeEn(row.en) === eq) { log("查询", "英文名精确命中：" + q + " → " + row.name); return row; }
            }
        }
    }
    // 英文子串兜底（v1 的 looksLikeCardArg 也认"参数是某张卡名字的一部分"）：
    // 「Blue-Eyes」→ 名字含它的卡；英文按小写比较，取最短的一张（最接近"整名"的那张）
    if (/^[A-Za-z][A-Za-z0-9'’.,\-\s]{2,}$/.test(q)) {
        const ql = normalizeEn(q);
        let best = null;
        for (const row of stats.rows) {
            const e = normalizeEn(row.en);
            if (!e || e.indexOf(ql) < 0) continue;
            if (!best || e.length < normalizeEn(best.en).length) best = row;
        }
        if (best) { log("查询", "英文子串「" + q + "」→ " + best.name + "（" + best.en + "）"); return best; }
    }
    // v1 的在线兜底（resolveCard 第 1292-1306 行同款判定）：本地整表没命中 → 查百鸽搜索
    lastCandidates = [];   // 每次在线兜底前先清空，避免上次的候选泄漏到这次的"没找到"里（实测踩过）
    try {
        const results = await searchOnline(q);
        if (results.length) {
            const needle = q.toLowerCase();
            const namesOf = function (c) { return [c.cn_name, c.sc_name, c.md_name, c.jp_name, c.en_name, c.nwbbs_n, c.cnocg_n].filter(Boolean).map(function (x) { return String(x).toLowerCase(); }); };
            const exact = results.find(function (c) { return namesOf(c).indexOf(needle) >= 0; });
            const perfect = exact || results.find(function (c) { return Number(c.weight) === 100; });
            const topWeight = Number(results[0] && results[0].weight) || 0;
            if (perfect && perfect.id) {
                const row = stats.byId.get(String(perfect.id));
                if (row) {
                    log("查询", "本地没命中，「" + q + "」→ 百鸽搜索命中 " + row.name);
                    if (registry.has("learnAlias")) { try { await registry.call("learnAlias", { from: q, to: row.name }); } catch (e1) { /* 学不会不影响 */ } }
                    lastCandidates = [];
                    return row;
                }
            }
            // 权重 ≥90 = 卡名包含匹配 → 作为"你是想说"候选（更低的是效果文本/弱模糊，直接当没找到）
            if (topWeight >= 90) {
                lastCandidates = results.slice(0, 5).map(function (c) { return String(c.cn_name || c.sc_name || c.jp_name || c.en_name || c.id); });
                log("查询", "「" + q + "」本地没命中，百鸽给出候选：" + lastCandidates.join(" / "));
            }
        }
    } catch (error) { /* 在线兜底失败不影响主流程 */ }
    // DIY 卡兜底（v1 能查到自制卡，v2 之前查不到）：设置里的 diyCards 按名字/归一化名字匹配
    for (const d of (settings.get("diyCards") || [])) {
        if (!d || !d.name) continue;
        if (String(d.name) === q || normalizeKey(d.name) === key) {
            return { id: "diy:" + String(d.name), cid: "", name: String(d.name), typeText: String(d.typeText || "[DIY 卡]"), setcode: "0", en: "", aliases: [], isDiy: true };
        }
    }
    return null;
}

/** 模糊搜索（本地索引，返回名字列表） */
/** v1 的 searchCards 原样：百鸽搜索（本地没命中时才用） */
export async function searchOnline(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    try {
        const data = await cached("search:" + q, 3600000, async function () { return await fetchJson(API_SEARCH + encodeURIComponent(q)); });
        return (data && Array.isArray(data.result)) ? data.result : [];
    } catch (error) { log("查询", "在线搜索失败（" + q + "）：" + (error && error.message ? error.message : error)); return []; }
}

/** 上次在线搜索留下的"你是想说"候选（v1 的 ambiguousMessage 同用途） */
let lastCandidates = [];
export function candidatesOf() { return lastCandidates.slice(); }
export async function searchNames(keyword, limit) {
    const raw = String(keyword || "");
    const q = normalizeKey(raw);
    const qEn = normalizeEn(raw);
    if (!q) return [];
    const want = Math.max(1, Math.min(50, Number(limit) || Number(settings.get("maxResults")) || 5));   // 面板「查询内容 → 搜索结果上限」
    const stats = await getStatsIndex();
    // 排序：精确 > 以关键词开头 > 包含关键词（原来按索引顺序返回，搜常见前缀时目标会被挤出前 N 条）
    // 中英文都搜：英文名（row.en）与简中名（row.name）同权，玩家打 Blue-Eyes 也能搜到
    const exact = [];
    const prefix = [];
    const contains = [];
    const placed = new Set();   // 同一张卡可能同时命中中文名与英文名两个桶 —— 不记一下就会在结果里出现两次
    for (const row of stats.rows) {
        for (const candidate of [row.name, row.en]) {
            const k = (candidate === row.en) ? normalizeEn(candidate) : normalizeKey(candidate);
            if (!k) continue;
            const needle = (candidate === row.en) ? qEn : q;
            if (!needle) continue;
            if (k === needle) { if (!placed.has(row) && exact.indexOf(row) < 0) { exact.push(row); placed.add(row); } break; }
            const at = k.indexOf(needle);
            if (at < 0) continue;
            if (placed.has(row)) continue;
            const bucket = (at === 0) ? prefix : contains;
            if (bucket.indexOf(row) < 0) bucket.push(row);
            placed.add(row);
        }
    }
    return exact.concat(prefix, contains).slice(0, want);
}

/** 效果文本取值：兼容"对象"（真实接口）与"字符串"（旧缓存/测试桩）两种形状 */
export function effectText(detail) {
    const t = detail && detail.text;
    if (!t) return "";
    if (typeof t === "string") return t.trim();
    return String(t.desc || t.cn || t.sc_name || "").trim();
}

/** 行 → 供 AI 阅读的文本块（含选项控制）；detail 可带效果文本 */
export function formatCard(row, detail, options) {
    const o = options || {};
    const t = parseTypeText(row.typeText);
    const lines = ["【" + row.name + "】"];
    if (row.aliases && row.aliases.length) lines.push("别名: " + row.aliases.join(" / "));
    if (row.en) lines.push("英文名: " + row.en);
    lines.push("密码(ID): " + row.id + (row.cid ? " | CID: " + row.cid : ""));
    lines.push("类型/数值: " + row.typeText);
    if (/LINK-|连接/.test(String(row.typeText || ""))) lines.push("ATK: " + (t.atk || "?") + "（连接怪兽没有守备力，连接标记见上方类型）");   // v1 同款措辞
    else if (t.atk !== "" || t.def !== "") lines.push("ATK/DEF: " + (t.atk || "?") + " / " + (t.def || "?"));
    if (t.race) lines.push("种族: " + t.race + (t.attribute ? " | 属性: " + t.attribute : ""));
    if (t.level) lines.push((t.levelMark === "☆" ? "阶级: " : "星级: ") + t.level);
    if (t.link) lines.push("连接数值: " + t.link);
    if (detail) {
        // 注意：接口的 text 是对象 { name, sc_name, jp_name, en_name, types, desc }，不是字符串。
        // 直接 String(detail.text) 会得到 "[object Object]"（踩过）。
        const eff = effectText(detail);
        if (eff) lines.push("效果文本:", eff);
    }
    // 查询内容开关（面板「查询内容」组）：信息不足时留空，不发网络请求
    const inc = function (key) { return o[key] === undefined ? settings.get(key) !== false : o[key] !== false; };
    // 字段（系列）需要卡密里的 setcode，放到异步部分处理（见 extrasText）
    // 官方补充说明在异步部分取原文（见 extrasText）
    // 禁限状态在异步部分取真值（见 extrasText）
    // 卡图开关：选项优先，未传时看设置（面板「查询内容 → 卡图」）—— 之前只认选项，导致面板开关对自动注入无效
    // v1 每张卡都会给百科页链接；DIY 卡则明确标注来源（v1 同款措辞）
    if (row.isDiy) lines.push("（这是一张 DIY 卡，资料来自本地自制卡库）");
    else if (row.id) lines.push("百科页: " + SITE_CARD + row.id);
    const wantImage = (o.includeImage === undefined) ? (settings.get("includeImage") !== false) : (o.includeImage !== false);
    if (wantImage && imageUrl(row.id)) lines.push("卡图: ![](" + imageUrl(row.id) + ")");   // DIY 卡没有图源，别输出空的 ![]()
    return lines.join("\n");
}

/** 查询内容里需要"查别处"的部分（首发日期 / 官方裁定）：只有异步的 cardText 会调用 */
/** 注入分层（v1 的 injectLayers）：minimal 只给打牌要用的；normal 加字段/禁限；full 再加发售/补充/裁定 */
function layerOf(options) {
    const o = options || {};
    return String(o.layers === undefined ? (settings.get("injectLayers") || "full") : o.layers);
}
function layerAllows(part, lay) {
    if (part === "field" || part === "banlist") return lay !== "minimal";
    return lay === "full";
}

async function extrasText(row, options) {
    const o = options || {};
    const lay = layerOf(o);
    const inc = function (key) { return o[key] === undefined ? settings.get(key) !== false : o[key] !== false; };
    const out = [];
    // 字段（受分层控制）—— 只保留这一处实现：上面曾经还有一份重复的旧块，
    // 里面的 hit 变量根本没声明（ReferenceError 被 catch 吞掉），整块是死代码，已删除。

    if (inc("includeField") && layerAllows("field", lay) && registry.has("index:setnames")) {
        try {
            const d0 = await cardDetail(row.id);
            const raw = d0 && (d0.setcode !== undefined ? d0.setcode : (d0 && d0.data ? d0.data.setcode : null));
            if (raw) {
                // setcode 是位域：必须按 16 位块逐个查（整值查只能命中单字段卡，577 张多字段卡会整行消失）
                const sn = await registry.call("index:setnames");
                const found = fieldNamesWithJpOf(sn, raw);
                const names = found.cn.slice();
                const jpNames = found.jp.slice();
                if (!names.length && registry.has("decodeSetcodes")) {
                    const decoded = await registry.call("decodeSetcodes", { codes: [String(raw)] });
                    if (Array.isArray(decoded)) for (const d of decoded) { const nm = (typeof d === "string") ? d : (d && (d.name || d.cn || d.jp)); if (nm && names.indexOf(nm) < 0) names.push(nm); }
                }
                if (names.length) { out.push("字段: " + names.join(" / ") + (jpNames.length ? "（" + jpNames.join(" / ") + "）" : "")); }   // v1 同款：字段: 青眼（青眼の白龍）
            }
        } catch (error) { /* 卡密取不到就跳过 */ }
    }
    // 禁限状态（真值，受分层控制）
    if (inc("includeBanlist") && layerAllows("banlist", lay) && registry.has("banlistStatusOf")) {
        try {
            const st = await registry.call("banlistStatusOf", row.id);
            if (st && st.status && st.status !== "unknown" && st.status !== "none") out.push("禁限: " + (st.label || st.status) + "（" + (st.region || "") + "）");
            else if (st && st.status === "none") out.push("禁限: 无限制（" + (st.region || "") + "）");
        } catch (error) { /* 禁限表不可用就跳过 */ }
    }
    // 官方补充说明（真字段：detail.supplement.text，去 HTML）
    if (inc("includeSupplement") && layerAllows("supplement", lay)) {
        try {
            const d1 = await cardDetail(row.id, { full: true });   // 补充说明只存在于 ?show=all
            const sup = d1 && d1.supplement && d1.supplement.text ? String(d1.supplement.text) : "";
            if (sup) out.push("官方补充说明（日文原文）:", sup.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 800));
        } catch (error) { /* 取不到就跳过 */ }
    }
    if (inc("includeRelease") && layerAllows("release", lay) && registry.has("releaseDateOf")) {
        try { const d = String(await registry.call("releaseDateOf", row.id) || ""); if (d) out.push("首次发售: " + d); } catch (error) { /* 数据缺失就跳过 */ }
    }
    if (inc("includeFaq") && layerAllows("faq", lay) && registry.has("tool:ruling")) {
        try {
            const text = String(await registry.call("tool:ruling", { query: row.id, limit: 3 }) || "");
            if (text && text.indexOf("裁定获取失败") < 0 && text.indexOf("没有条目") < 0) {
                const lines = text.split("\n").filter(function (l) { return l.trim() && l.indexOf("共 ") !== 0; }).slice(0, 6);
                if (lines.length) out.push("官方裁定(最近3条):", lines.join("\n"));
            }
        } catch (error) { /* 网络问题不影响卡面数据 */ }
    }
    return out.length ? "\n" + out.join("\n") : "";
}


/** 取详情（远端，带缓存；失败不影响本地信息） */
/**
 * 卡密明细。
 *
 * 接口形状（踩过的坑）：/api/v0/card/<id> 返回 { id, cid, data, text } ——
 *   · data 里是 ot / setcode / type / atk / def / level / race / attribute（卡表信息）
 *   · **text（效果文本）、supplement（官方补充说明）、faqs（裁定）在外层**，不在 data 里
 * 旧实现写的是 return data.data，把外层整个丢掉 → 效果文本与官方补充说明永远是空的。
 *
 * options.full === true 时请求 ?show=all：补充说明与裁定只存在于这个响应里（响应较大，按需才取）。
 */
export async function cardDetail(id, options) {
    const key = String(id || "").trim();
    if (!key) return null;
    const full = !!(options && options.full);
    const target = full ? API_CARD + key + "?show=all" : API_CARD + key;
    try {
        return await cached((full ? "card-full:" : "card:") + key, 24 * 3600 * 1000, async function () {
            const payload = await doFetch(target, full ? 20000 : 12000);
            if (!payload) return null;
            const inner = (payload.data && typeof payload.data === "object") ? payload.data : {};
            const merged = Object.assign({}, inner, payload);   // 外层优先：text/supplement/faqs/译名都在外层
            delete merged.data;
            return merged;
        });
    } catch (error) { log("查卡", "详情获取失败 " + key + "：" + (error && error.message ? error.message : error)); return null; }
}

/** 组合：查卡文本（工具/命令共用） */
export async function cardText(args) {
    const options = args || {};
    const row = await findCard(options.query);
    if (!row) {
        const cand = candidatesOf();
        if (cand.length) return "没找到「" + String(options.query || "") + "」这张卡。你是想说：\n" + cand.map(function (x, i) { return "  " + (i + 1) + ". " + x; }).join("\n") + "\n（用完整卡名或卡密再查一次）";
        let hint = "没有找到「" + String(options.query || "") + "」。可以先用 search_yugioh_cards 模糊搜一下，或换官方译名/英文名/卡密。";
        // 联网后备（默认关闭；装了 Web Search 扩展且面板里开启才会真的发）
        if (registry.has("integration:websearch")) {
            try {
                const res = await registry.call("integration:websearch", { query: String(options.query || "") + " 游戏王 卡" });
                const text = res && (res.text || res.result || "");
                if (res && res.ok && text) hint += "\n\n【联网搜索结果】\n" + String(text).slice(0, 800);
                else if (res && res.reason) hint += "\n\n（联网后备未生效：" + res.reason + "）";
            } catch (error) { /* 联网失败不影响提示 */ }
        }
        return hint;
    }
    const detail = options.withDetail === false ? null : await cardDetail(row.id);
    // 需要查别处的部分（首发日期/官方裁定）在异步这里补，formatCard 保持同步
    return formatCard(row, detail, options) + await extrasText(row, options);
}

/** 4) 注册能力 */
export function registerCards() {
    registry.provide("tool:card", async function (args) { return await cardText({ query: args.query, includeImage: true }); });
    registry.provide("tool:image", async function (args) {
        const row = await findCard(args.query);
        if (!row) return "没有找到「" + String(args.query || "") + "」。";
        return "【" + row.name + "】卡图（密码 " + row.id + "）：\n![](" + imageUrl(row.id) + ")";
    });
    registry.provide("tool:search", async function (args) {
        const rows = await searchNames(args.query, args.limit);
        if (!rows.length) return "没有匹配「" + String(args.query || "") + "」的卡名。";
        return "「" + String(args.query) + "」匹配 " + rows.length + " 条（显示前 " + rows.length + "）：\n" + rows.map(function (r, i) { return (i + 1) + ". " + r.name + "（" + r.id + "）"; }).join("\n");
    });
    // ★ 自然语言触发词「查卡 青眼白龙」走这里。触发词表里有 card，但以前没有对应的 runAction:card，
    //   于是"匹配上了触发词"反而把自由文本兜底也挡掉了 —— 说得越明确越没反应。
    registry.provide("runAction:card", async function (trigger) {
        if (!trigger || trigger.action !== "card") return [];
        const q = String(trigger.arg || "").trim();
        if (!q) return [];
        const row = await findCard(q);
        if (!row) return [];
        return [{ name: row.name, text: await cardText({ query: row.id, withDetail: true }) }];
    });
    log("数据", "查卡能力已注册（card/image/search）");
}

/** 3) 与拦截器约定的卡名识别 */
async function resolveCardsInner(text) {
    const lv = String(settings.get("detectStrictness") || "normal");   // strict 只认完整卡名 / normal 适中 / loose 宽松
    const scan = async function (raw) {
        const stats = await getStatsIndex();
        const segs = [];
        const s = normalizeKey(raw);
        if (!s) return [];
        for (let len = Math.min(40, s.length); len >= 2 && segs.length < 6; len--) {
            for (let i = 0; i + len <= s.length; i++) {
                const seg = s.slice(i, i + len);
                const row = stats.byName.get(seg);
                if (!row) continue;
                if (segs.some(function (x) { return x.seg.indexOf(seg) >= 0 || seg.indexOf(x.seg) >= 0; })) continue;
                segs.push({ seg: seg, row: row });
                if (segs.length >= 6) break;
            }
        }
        const out = [];
        for (const hit of segs) out.push({ name: hit.row.name, text: await cardText({ query: hit.row.id, withDetail: true }) });   // 必须带明细：否则注入里没有效果文本（字段/补充说明/禁限本来就要取明细，缓存 24h 不额外增加请求）
        return out;
    };
    const stats = await getStatsIndex();
    const pick = async function (row) { return row ? [{ name: row.name, text: await cardText({ query: row.id, withDetail: true }) }] : []; };
    // 精确识别（优先级最高，可由面板「自动检测注入」组里的三个开关控制）
    if (settings.get("detectWholeMessage") !== false) {
        const whole = normalizeKey(String(text || "").trim());
        if (whole && whole.length <= 14 && stats.byName.has(whole)) return await pick(stats.byName.get(whole));
    }
    if (settings.get("detectBrackets") !== false) {
        const spans = String(text || "").match(/[《【「『]([^》】」』]{1,24})[》】」』]/g) || [];
        for (const s of spans) {
            const inner = normalizeKey(s.replace(/[《【「『》】」』]/g, ""));
            if (inner && stats.byName.has(inner)) return await pick(stats.byName.get(inner));
        }
    }
    if (settings.get("detectPasscode") !== false) {
        const nums = String(text || "").match(/\b\d{8}\b/g) || [];
        for (const n of nums) if (stats.byId.has(n)) return await pick(stats.byId.get(n));
    }
    // 第一遍：按原文识别（绝不动原文，避免「青眼白龙」里的「白龙」被俗称替换成「青眼青眼」）
    const direct = await scan(text);
    if (direct.length) return direct;
    // 第二遍：原文没识别到，才用俗称表把句子里的俗称换成官方名再试一次
    if (registry.has("applyAliasesToText")) {
        try {
            const mapped = String(await registry.call("applyAliasesToText", text) || "");
            if (mapped && normalizeKey(mapped) !== normalizeKey(text)) {
                const viaAlias = await scan(mapped);
                if (viaAlias.length) { log("查询", "俗称替换后识别到 " + viaAlias.length + " 张卡"); return viaAlias; }
            }
        } catch (error) { /* 俗称表不可用不影响识别 */ }
    }
    // 系列/字段优先（v1 的 findSeriesCards 逻辑）
    // 只有带明确意图词时才按"系列/字段"找（v1 的 looksLikeSeriesKeyword 只用于命令参数，
    // 不用于自由文本；否则「今天天气不错」会被当成「天气」系列 —— 实测踩过）
    const wantsSeries = /(系列|字段|卡表|卡片表|有哪些卡|哪些卡|都有哪些卡|查卡|卡组|卡图|图鉴)/.test(String(text || ""));
    const seriesRows = (lv === "strict") ? null : ((lv === "loose" || wantsSeries) ? await seriesMembers(text) : null);
    if (seriesRows && seriesRows.length) {
        const outS = [];
        for (const row of seriesRows) outS.push({ name: row.name, text: await cardText({ query: row.id, withDetail: true, layers: "normal" }) });
        return outS;
    }
    // 子串兜底（v1 的语义：参数是某张卡名字的一部分也算 —— 「拉比林斯」→「拉比林斯的迷宫主・拉比丽斯」）。
    // 只做名字子串，不碰 setcode 字段表：这才是 v1「字段/系列也能查」的实际实现方式。
    const sub = await (async function () {
        if (lv === "strict") return [];   // 严格档：不使用片段子串，只用完整卡名（名字索引已在上方跑过）
        const s2 = normalizeKey(text);
        if (!s2 || s2.length < 2) return [];
        let tried = 0;
        for (let len = Math.min(10, s2.length); len >= 2; len--) {
            for (let i = 0; i + len <= s2.length; i++) {
                if (tried++ > 260) return [];
                const seg = s2.slice(i, i + len);
                if (!seg || !goodSegment(seg)) continue;
                const hits = [];
                let totalN = 0;
                for (const row of stats.rows) {
                    if (normalizeKey(row.name).indexOf(seg) < 0) continue;
                    totalN++;
                    if (hits.length < 5) hits.push(row);
                    if (totalN >= 30) break;
                }
                // 够具体才认：命中 1–6 张，或片段 ≥4 字（「天气」命中 16 张这种通用词不认，避免日常聊天误触发）
                if (hits.length && ((totalN >= 1 && totalN <= (lv === "loose" ? 20 : 6)) || seg.length >= 4)) {
                    log("查询", "名字子串「" + seg + "」命中 " + totalN + " 张卡");
                    return hits;
                }
            }
        }
        return [];
    })();
    if (sub.length) {
        const out2 = [];
        for (const row of sub) out2.push({ name: row.name, text: await cardText({ query: row.id, withDetail: true, layers: "normal" }) });
        return out2;
    }
    // 在线兜底（自由文本）：本地表里没有这张卡时（实测「黑魔女」本地查无此卡，官方名是「黑魔女 迪亚贝尔斯塔尔」）靠百鸽补上
    if (typeof searchOnline === "function") {
        const s3 = normalizeKey(text);
        const tried = [];
        for (let len = Math.min(8, s3.length); len >= 3; len--) {
            for (let i = 0; i + len <= s3.length; i++) {
                if (tried.length > (lv === "loose" ? 12 : 6)) break;
                const seg = s3.slice(i, i + len);
                if (!seg || !goodSegment(seg) || tried.indexOf(seg) >= 0) continue;
                tried.push(seg);
                try {
                    const res = await searchOnline(seg);
                    if (!res.length) continue;
                    const top = res.find(function (c) { return Number(c.weight) >= 90; });
                    if (!top || !top.id) continue;
                    let row = stats.byId.get(String(top.id));
                    const onlineName = String(top.cn_name || top.sc_name || "");
                    if (lv === "strict") { if (normalizeKey(onlineName) !== seg) continue; }   // 严格档：整段必须正好是完整卡名（去空格比较 → 没空格的卡名也能命中）
                    else if (normalizeKey(onlineName).indexOf(seg) < 0) continue;   // 必须真的含这个片段
                    if (!row) row = { id: String(top.id), cid: String(top.cid || ""), name: onlineName, typeText: normalizeApiTypes(top.text && top.text.types), setcode: String((top.data && top.data.setcode) || "0"), en: String(top.en_name || ""), aliases: [] };
                    log("查询", "在线兜底命中：「" + seg + "」→ " + row.name);
                    if (registry.has("learnAlias")) { try { await registry.call("learnAlias", { from: seg, to: row.name }); } catch (e9) { /* 忽略 */ } }
                    return [{ name: row.name, text: await cardText({ query: row.id, withDetail: true, layers: "normal" }) }];
                } catch (error) { /* 单个片段失败不影响其它 */ }
            }
        }
    }

    return [];
}

export function registerCardResolver() { registry.provide("resolveCards", resolveCards); log("数据", "卡名识别能力已注册（resolveCards）"); }

/**
 * 多卡互动裁定接线：句子里同时出现多张卡时，优先给"同时提到这几张"的官方裁定，
 * 并把每张卡各自的「最近 3 条」换掉（否则预算被零散裁定吃光）。
 * 放在注入块**最前面**：预算截断是从后往前切的，放最后会被切掉。
 */
export async function applyCrossRuling(list) {
    const cardsIn = Array.isArray(list) ? list : [];
    if (cardsIn.length < 2) return cardsIn;                                  // 单卡走原来的每卡裁定
    if (settings.get("includeFaq") === false) return cardsIn;                // 裁定开关关着就不做
    if (String(settings.get("injectLayers") || "full") !== "full") return cardsIn;   // 与每卡裁定同一分层规则
    if (!registry.has("ruling:cross")) return cardsIn;
    let cross = "";
    try {
        cross = String(await registry.call("ruling:cross", {
            cards: cardsIn.map(function (c) { return { name: c && c.name }; }),
            limit: 3,
        }) || "");
    } catch (error) { log("查询", "多卡裁定获取失败（不影响卡面）：" + (error && error.message ? error.message : error)); }
    if (!cross) return cardsIn;
    const stripped = cardsIn.map(function (c) {
        const t = String((c && c.text) || "");
        const cut = t.replace(/\n官方裁定\(最近3条\):[\s\S]*$/, "");   // 每卡裁定是 extrasText 推入的最后一项，从它往后整段去掉
        return { name: c.name, text: cut, aliases: c.aliases };
    });
    return [{ name: "多卡互动裁定", text: cross }].concat(stripped);
}

export async function resolveCards(text) {
    return await applyCrossRuling(await resolveCardsInner(text));
}

/**
 * 系列/字段成员（照 v1 的 findSeriesCards + looksLikeSeriesKeyword，纯本地不发网络）。
 *   ① 字段名命中（字段表 cn 名包含/被包含）→ 这些字段的成员合计 ≥4 → 算系列
 *   ② 否则卡名命中 → 这些卡携带的字段码成员合计 ≥4 → 算系列
 *   ③ 都不成 → 名字包含该词的卡（最多 5 张）；再不成 null
 */
/** v1 的 resolveSeriesBySearch 原样：本地凑不出系列时查百鸽，靠字段码多数票认系列并学俗称 */
async function resolveSeriesBySearch(keyword) {
    const raw = String(keyword || "").trim();
    if (raw.length < 2) return null;
    const results = await searchOnline(raw).catch(function () { return []; });
    if (!Array.isArray(results) || results.length < 3) return null;   // 乱码会模糊出一两条结果，要求够多
    const stats = await getStatsIndex();
    const freq = new Map();
    let counted = 0;
    const splitCodes2 = function (v) { const out = []; let n = Number(v); if (!Number.isFinite(n) || n <= 0) return out; n = Math.floor(n); while (n > 0) { const c = n & 0xffff; if (c > 0 && out.indexOf(c) < 0) out.push(c); n = Math.floor(n / 65536); } return out; };
    for (const card of results.slice(0, 5)) {
        const row = stats.byId.get(String(card.id));
        if (!row) continue;
        counted++;
        for (const code of splitCodes2(row.setcode)) freq.set(code, (freq.get(code) || 0) + 1);
    }
    if (counted < 3) return null;
    let bestCode = 0; let bestCount = 0;
    for (const pair of freq) if (pair[1] > bestCount) { bestCount = pair[1]; bestCode = pair[0]; }
    if (bestCount < 3) return null;
    const confidence = bestCount / counted;
    if (confidence < 0.6) return null;
    const sn = registry.has("index:setnames") ? await registry.call("index:setnames") : null;
    // 字段表键是"不带 0x 的小写十六进制"（parseSetnames 已剥掉 0x）；
    // 以前查 sn.get("0x…") 必空、再退化成 sn.get(十进制串) → 张冠李戴（0xa 入魔 会命中键 "10" 薰风）
    const hit = sn && typeof sn.get === "function" ? (sn.get(bestCode.toString(16)) || sn.get("0x" + bestCode.toString(16))) : null;
    const label = typeof hit === "string" ? hit : (hit && hit.cn) || "";
    if (!label) return null;
    if (confidence >= 0.8 && registry.has("learnAlias")) { try { await registry.call("learnAlias", { from: raw, to: label }); } catch (e) { /* 忽略 */ } }
    return { code: bestCode, label: label, hits: bestCount, counted: counted, confident: confidence >= 0.8 };
}
export async function seriesMembers(keyword) {
    const stats = await getStatsIndex();
    const whole = normalizeKey(String(keyword || ""));
    if (!stats || whole.length < 2) return null;
    // 候选片段（v1 的语义要能命中「黄金国」→字段「黄金国巫妖」这种"整句里含字段名"的情况）
    const cands = [whole];
    for (let len = Math.min(8, whole.length); len >= 2; len--) {
        for (let i = 0; i + len <= whole.length; i++) {
            if (cands.length > 200) break;
            const seg = whole.slice(i, i + len);
            if (seg && cands.indexOf(seg) < 0) cands.push(seg);
        }
    }
    const codeCount = new Map();
    // setcode 是位域：每 16 位一个字段码（v1 的 decodeSetcodes 同理），所以要拆开统计
    const splitCodes = function (raw) { const out = []; let n = Number(raw); if (!Number.isFinite(n) || n <= 0) return out; n = Math.floor(n); while (n > 0) { const c = n & 0xffff; if (c > 0 && out.indexOf(c) < 0) out.push(c); n = Math.floor(n / 65536); } return out; };
    for (const row of stats.rows) for (const c of splitCodes(row.setcode)) codeCount.set(c, (codeCount.get(c) || 0) + 1);
    const memberRows = function (codes) {
        if (!codes.size) return [];
        const out = [];
        for (const row of stats.rows) { const cs = splitCodes(row.setcode); if (!cs.some(function (c) { return codes.has(c); })) continue; out.push(row); if (out.length >= 8) break; }
        return out;
    };
    if (registry.has("index:setnames")) {
        try {
            const sn = await registry.call("index:setnames");
            const codes = new Set();
            const each = function (v, k, cand) {
                // v1 的 findSeriesCards 是 cn / jp **都试**（不能只取第一个非空）
                const one = function (x, q) { const nm = normalizeKey(x); return !!nm && (nm.indexOf(q) >= 0 || q.indexOf(nm) >= 0); };
                const item = (typeof v === "string") ? { cn: v, jp: "" } : (v || {});
                const hitName = one(item.cn, cand) || one(item.jp, cand) || one(item.sc, cand);
                if (!hitName) return;
                const raw = String(k || "");
                // 字段表键是十六进制（可能带 0x，也可能不带 —— 「dd」就是 221）
                const dec = /^0x/i.test(raw) ? parseInt(raw.slice(2), 16) : parseInt(raw, 16);
                if (Number.isFinite(dec) && dec > 0) codes.add(dec);
            };
            for (const cand of cands) {
                codes.clear();
                if (typeof sn.forEach === "function") sn.forEach(function (v, k) { each(v, k, cand); });
                else if (sn && typeof sn === "object") for (const k of Object.keys(sn)) each(sn[k], k, cand);
                let total = 0;
                for (const c of codes) total += codeCount.get(c) || 0;
                if (total >= 4) return memberRows(codes);
            }
        } catch (error) { /* 字段表不可用则跳过 */ }
    }
    const hitCands = cands.filter(function (c) { return c.length >= 3; }).slice(0, 40);
    hitCands.push(whole);
    let hits = [];
    for (const cand of hitCands) { const found = stats.rows.filter(function (r) { return normalizeKey(r.name).indexOf(cand) >= 0; }); if (found.length) { hits = found; break; } }
    const freq = new Map();
    for (const r of hits) { const c = Number(r.setcode); if (Number.isFinite(c) && c > 0) freq.set(c, (freq.get(c) || 0) + 1); }
    const minCount = hits.length >= 3 ? Math.max(2, Math.ceil(hits.length * 0.3)) : 1;
    const codes2 = new Set();
    for (const pair of freq) if (pair[1] >= minCount) codes2.add(pair[0]);
    let total2 = 0;
    for (const c of codes2) total2 += codeCount.get(c) || 0;
    if (total2 >= 4) return memberRows(codes2);
    if (hits.length) return hits.slice(0, 5);
    // v1：本地凑不出系列 → 查百鸽靠"字段码多数票"认系列（confidence ≥80% 时顺便学俗称）
    const bySearch = await resolveSeriesBySearch(whole).catch(function () { return null; });
    if (bySearch && bySearch.code) {
        const rows = memberRows(new Set([bySearch.code]));
        if (rows.length) { log("查询", "「" + whole + "」经百鸽搜索认定为系列「" + bySearch.label + "」（" + rows.length + " 张）"); return rows; }
    }
    return null;
}
export const cards = { seriesMembers, searchOnline, candidatesOf, applyCrossRuling, effectText, API_SEARCH, API_CARD, IMAGE_BASE, PRE_IMAGE_BASE, configure, imageUrl, parseTypeText, findCard, searchNames, formatCard, cardDetail, cardText, resolveCards, registerCards, registerCardResolver };
