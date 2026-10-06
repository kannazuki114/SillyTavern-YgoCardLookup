/*! 游戏王查卡器 v2 —— 单文件打包产物（经典脚本，无 import/export）。
 *  由 tools/bundle.mjs 生成；请勿直接修改本文件，改 src/ 后重新打包。
 *  模块数：35，import：184 处，export：507 处。
 */
(function () {
'use strict';
var __cache = {}, __defs = {};
function __def(p, f) { __defs[p] = f; }
function __req(p) {
    if (Object.prototype.hasOwnProperty.call(__cache, p)) return __cache[p];
    if (!Object.prototype.hasOwnProperty.call(__defs, p)) throw new Error('[YGO2] 模块缺失: ' + p);
    var m = __defs[p](__req);
    __cache[p] = m;
    return m;
}

__def("src/api/commands.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");
const { settings, actionAllowed, actionGroup } = __req("src/core/settings.js");

/**
 * 命令表：只是数据。执行交给 registry（cmd:<action> / ui:<action>）。
 * build(named, unnamed) 把斜杠命令参数转成执行参数（纯函数，可断言）。
 */
const COMMANDS = [
    { name: "ygocard", help: "查卡：/ygocard 青眼白龙", action: "card", named: [], build: (n, u) => ({ query: u }) },
    { name: "ygorule", help: "官方裁定：/ygorule 灰流丽", action: "ruling", named: ["keyword","limit"], build: (n, u) => ({ query: u, keyword: n.keyword, limit: n.limit }) },
    { name: "ygoart", help: "异画版本：/ygoart 黑魔导", action: "art", named: [], build: (n, u) => ({ query: u }) },
    { name: "ygopack", help: "开卡包：/ygopack 超级包06 region=jp", action: "pack", named: ["count","region"], build: (n, u) => ({ pack: u, count: n.count, region: n.region }) },
    { name: "ygodraw", help: "随机抽卡：/ygodraw count=2", action: "draw", named: ["count","kind","attribute"], build: (n) => ({ count: n.count, kind: n.kind, attribute: n.attribute }) },
    { name: "ygodeck", help: "卡组校验：/ygodeck 卡表文本", action: "deck", named: [], build: (n, u) => ({ deck: u }) },
    { name: "ygohand", help: "起手模拟：/ygohand 卡表文本", action: "hand", named: ["draw","runs"], build: (n, u) => ({ deck: u, draw: n.draw, runs: n.runs }) },
    { name: "ygosummon", help: "召唤检查：/ygosummon 青眼白龙", action: "summon", named: ["method"], build: (n, u) => ({ query: u, method: n.method }) },
    { name: "ygoduel", help: "决斗盘：/ygoduel action=show", action: "board", named: ["action","side","value"], build: (n) => ({ action: n.action || "show", side: n.side, value: n.value }) },
    { name: "ygorecap", help: "本局卡表：/ygorecap scope=all limit=20", action: "recap", named: ["scope","limit"], build: (n) => ({ scope: n.scope, limit: n.limit }) },
    { name: "ygoshop", help: "每日商店：/ygoshop size=5 date=2026-01-01", action: "shop", named: ["size","date"], build: (n) => ({ size: n.size, date: n.date }) },
    { name: "ygoalbum", help: "收藏册：/ygoalbum [系列]", action: "collection", named: [], build: (n, u) => ({ series: u }) },
    { name: "ygoalias", help: "俗称表：/ygoalias 俗称=正式名", action: "alias", named: [], build: (n, u) => ({ text: u }) },
    { name: "ygodiy", help: "自制卡：/ygodiy add name=卡名 type=怪兽/效果", action: "diy", named: ["action","name","type","attribute","race","level","atk","def","desc","image"], build: (n, u) => ({ action: n.action || (u ? "edit" : "editor"), name: n.name, type: n.type, attribute: n.attribute, race: n.race, level: n.level, atk: n.atk, def: n.def, desc: n.desc, image: n.image }) },
    { name: "ygodeckimage", help: "卡组展示图：/ygodeckimage 卡表文本", action: "deckimage", named: [], build: (n, u) => ({ deck: u }) },
    { name: "ygoselftest", help: "功能自检：/ygoselftest", action: "selftest", named: [], build: () => ({}) },
    { name: "ygoprompt", help: "打开提示词查看/编辑窗口", action: "prompt", named: [], ui: true, build: () => ({}) },
];

/** 纯函数：把参数规整一下（去掉首尾空白、空串转 undefined，便于下游判断缺省）。 */
function normalizeArgs(args) {
    const out = {};
    for (const key of Object.keys(args || {})) {
        const v = args[key];
        if (v === undefined || v === null) continue;
        if (typeof v === "string") { const s = v.trim(); if (s) out[key] = s; }
        else out[key] = v;
    }
    return out;
}

/** 纯函数：表自检。 */
/** 命名参数类型（官方文档：命名参数必须用 SlashCommandNamedArgument.fromProps 声明，否则不会被解析） */
const TYPE_OF = { count: "number", limit: "number", region: "string", draw: "number", runs: "number", level: "number", atk: "number", def: "number", size: "number", keyword: "string", source: "string", kind: "string", attribute: "string", method: "string", action: "string", side: "string", value: "string", date: "string", scope: "string", name: "string", type: "string", desc: "string", image: "string", race: "string" };

function namedProps(keys) {
    const c = ctx();
    const Named = (typeof SlashCommandNamedArgument !== "undefined" && SlashCommandNamedArgument) || c.SlashCommandNamedArgument;
    const Types = (typeof ARGUMENT_TYPE !== "undefined" && ARGUMENT_TYPE) || c.ARGUMENT_TYPE;
    if (!Named || typeof Named.fromProps !== "function") return [];
    return (keys || []).map(function (key) {
        const kind = TYPE_OF[key] || "string";
        const typeList = Types && Types[kind.toUpperCase()] ? [Types[kind.toUpperCase()]] : [kind];
        return Named.fromProps({ name: key, description: key, typeList: typeList, isRequired: false });
    });
}

function commandProblems() {
    const problems = [];
    const seen = new Set();
    for (const c of COMMANDS) {
        if (!c.name) problems.push("缺少 name");
        else if (seen.has(c.name)) problems.push("重名：" + c.name);
        else seen.add(c.name);
        if (!c.help || c.help.length < 6) problems.push(c.name + " 缺少 help（酒馆的帮助列表会显示它）");
        if (!c.action) problems.push(c.name + " 缺少 action");
        if (typeof c.build !== "function") problems.push(c.name + " 缺少 build（参数转换）");
    }
    return problems;
}

/** 派发：ui: 前缀走界面能力，其余走 cmd:。 */
async function dispatchCommand(action, args, isUi) {
    // 命令：先出文本（给 AI 与日志），再同步弹一个图形面板（由 resultPopup 开关控制）
    if (!isUi) {
        const text = await runCommand(action, args, false);
        try {
            const uiKey = "ui:" + action;
            if (registry.has(uiKey) && settings.get("resultPopup") !== false) await registry.call(uiKey, args || {});
        } catch (error) { /* 弹窗失败不影响命令结果 */ }
        return text;
    }
    return await runCommand(action, args, true);
}

async function runCommand(action, args, isUi) {
    // 栏目隔离：所属栏目被停用时，指令直接拒绝并说明原因（不静默失败）
    if (typeof actionAllowed === "function" && actionAllowed(action) === false) {
        const g = actionGroup(action);
        return "「" + g + "」栏目已在面板里停用（栏目隔离），要用请先在面板里打开它。";
    }
    const key = (isUi ? "ui:" : "cmd:") + action;
    if (registry.has(key)) return await registry.call(key, args || {});
    // 命令与工具共用同一套动作：命令没单独实现时，回退到 tool:<action>
    const fallback = "tool:" + action;
    if (!isUi && registry.has(fallback)) return await registry.call(fallback, args || {});
    return "（功能未装配：" + key + "）";
}

/** 注册到酒馆斜杠命令（缺 SlashCommandParser 时跳过，不影响其他功能）。 */
function registerCommands() {
    const c = ctx();
    const parser = c.SlashCommandParser || (typeof SlashCommandParser !== "undefined" ? SlashCommandParser : null);
    const mk = c.SlashCommand || (typeof SlashCommand !== "undefined" ? SlashCommand : null);
    // cmd:* 能力永远注册：面板 / 脚本 / 对外接口 / 自检 都按这个名字调用，与宿主有没有斜杠 API 无关
    let provided = 0;
    for (const cmd of COMMANDS) {
        try {
            registry.provide("cmd:" + cmd.name, async function (args) { return await dispatchCommand(cmd.action, normalizeArgs(args || {}), !!cmd.ui); });
            provided++;
        } catch (error) { /* 已注册 */ }
    }
    log("命令", "已注册 " + provided + "/" + COMMANDS.length + " 条 cmd:* 能力（面板/脚本/对外接口可用）");
    const hasSlash = !!(parser && mk && typeof parser.addCommandObject === "function");
    if (!hasSlash) log("命令", "当前客户端没有斜杠命令 API：命令仍注册为 cmd:* 能力（面板/脚本/对外接口可用），只是不出现在斜杠列表里");
    let count = 0;
    for (const cmd of COMMANDS) {
        try {
            parser.addCommandObject(mk.fromProps({
                name: cmd.name,
                helpString: cmd.help,
                callback: async function (named, unnamed) {
                    const args = normalizeArgs(cmd.build(named || {}, String(unnamed === undefined || unnamed === null ? "" : unnamed)));
                    const text = await dispatchCommand(cmd.action, args, !!cmd.ui);
                    return String(text === undefined || text === null ? "" : text);
                },
                namedArgumentList: namedProps(cmd.named),
                unnamedArgumentList: [],
            }));
            count++;
        } catch (error) { console.warn("[YGO2] 命令注册失败 " + cmd.name, error); }
    }
    log("命令", "已注册 " + count + "/" + COMMANDS.length + " 条");
    return count;
}

const commands = { COMMANDS, normalizeArgs, commandProblems, dispatchCommand, registerCommands };

return { COMMANDS, normalizeArgs, namedProps, commandProblems, dispatchCommand, registerCommands, commands };
});

__def("src/api/deckimage.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");
const { deckArgText } = __req("src/data/deck.js");
const { registry } = __req("src/core/registry.js");
const { settings } = __req("src/core/settings.js");
const { escapeHtml } = __req("src/ui/result.js");
const { getStatsIndex, normalizeKey } = __req("src/data/indexes.js");
const { parseDeckText } = __req("src/data/deck.js");
const { imageUrl } = __req("src/data/cards.js");

/** ── 统一模板（接口模块）：常量 → 纯函数 → 打开 → register → exports ── */

/** 1) 常量 */
const GROUPS = [["主卡组", "main"], ["额外卡组", "extra"], ["副卡组", "side"]];

/** 2) 纯函数：卡表 → {entries, unknown, stats}（全部本地解析，失败项单独列出） */
async function resolveDeck(text) {
    const pickedDI = deckArgText(text);
    const deck = parseDeckText(pickedDI.text);
    const stats = await getStatsIndex();
    const out = { main: [], extra: [], side: [], unknown: [], counts: { main: 0, extra: 0, side: 0 }, kinds: { monster: 0, spell: 0, trap: 0 } };
    for (const group of GROUPS) {
        const bucket = group[1];
        for (const item of deck[bucket] || []) {
            const row = stats.byName.get(normalizeKey(item.name));
            if (!row) { out.unknown.push(item.name + "×" + item.count); continue; }
            out[bucket].push({ row: row, count: item.count, input: item.name });
            out.counts[bucket] += item.count;
            const text2 = String(row.typeText || "");
            if (text2.indexOf("[怪兽") >= 0) out.kinds.monster += item.count;
            else if (text2.indexOf("[魔法") >= 0) out.kinds.spell += item.count;
            else if (text2.indexOf("[陷阱") >= 0) out.kinds.trap += item.count;
        }
    }
    return out;
}

/** 纯函数：生成独立 HTML 展示页（暗色网格；可单独断言） */
function deckImageHtml(resolved) {
    // 防御：传进来的是 Promise（忘了 await）或缺 counts 时，给出可读提示而不是抛异常
    if (resolved && typeof resolved.then === "function") return '<div class="ygo2-view"><div class="ygo2-view-head">卡组展示图</div><div>数据还没准备好（resolveDeck 是异步的，请先 await 再传入）。</div></div>';
    const r = resolved || { main: [], extra: [], side: [], counts: {}, kinds: {}, unknown: [] };
    if (!r.counts || typeof r.counts !== "object") r.counts = { main: 0, extra: 0, side: 0 };
    const total = (r.counts.main || 0) + (r.counts.extra || 0) + (r.counts.side || 0);
    const sections = [];
    for (const group of GROUPS) {
        const items = r[group[1]] || [];
        if (!items.length) continue;
        const cells = [];
        for (const item of items) {
            for (let i = 0; i < item.count; i++) {
                cells.push('<figure class="c"><img loading="lazy" src="' + escapeHtml(imageUrl(item.row.id)) + '" alt=""><figcaption>' + escapeHtml(item.row.name) + '</figcaption></figure>');
            }
        }
        sections.push('<h2>' + group[0] + '（' + (r.counts[group[1]] || 0) + '）</h2><div class="g">' + cells.join("") + '</div>');
    }
    const meta = '合计 ' + total + ' 张 · 怪兽 ' + (r.kinds.monster || 0) + ' / 魔法 ' + (r.kinds.spell || 0) + ' / 陷阱 ' + (r.kinds.trap || 0)
        + (r.unknown && r.unknown.length ? ' · 未识别 ' + r.unknown.length + ' 条' : '');
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>游戏王卡组 · ' + total + ' 张</title><style>'
        + 'body{font-family:system-ui,"Microsoft YaHei",sans-serif;background:#14161a;color:#e8e8e8;margin:0;padding:24px}'
        + 'h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 10px;color:#9fd0ff;font-weight:600}'
        + '.meta{color:#9aa0a6;font-size:13px;margin-bottom:8px}'
        + '.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}'
        + '.c{margin:0;background:#1d2026;border:1px solid #2a2e36;border-radius:6px;padding:4px}'
        + '.c img{width:100%;display:block;border-radius:4px}'
        + '.c figcaption{font-size:11px;color:#c9ccd1;margin-top:4px;line-height:1.25;word-break:break-all}'
        + '</style></head><body><h1>游戏王卡组 · ' + total + ' 张</h1><div class="meta">' + escapeHtml(meta) + '</div>'
        + sections.join("")
        + (r.unknown && r.unknown.length ? '<h2>未识别（' + r.unknown.length + '）</h2><div class="meta">' + escapeHtml(r.unknown.join("、")) + '</div>' : '')
        + '</body></html>';
}

/** 纯函数：文本摘要（命令/简报用） */
async function deckImageText(text) {
    const r = await resolveDeck(text);
    const total = (r.counts.main || 0) + (r.counts.extra || 0) + (r.counts.side || 0);
    if (!total) return "卡表里没有能在本地卡库匹配到的卡（请检查译名）。" + (r.unknown.length ? " 未识别：" + r.unknown.join("、") : "");
    return "🃏 卡组展示图已生成：合计 " + total + " 张（主 " + r.counts.main + " / 额外 " + r.counts.extra + " / 副 " + r.counts.side + "）"
        + "，怪兽 " + r.kinds.monster + " / 魔法 " + r.kinds.spell + " / 陷阱 " + r.kinds.trap
        + (r.unknown.length ? "；未识别 " + r.unknown.length + " 条：" + r.unknown.slice(0, 6).join("、") : "");
}

/** 从最近几条聊天里找一份"能解析出主卡组"的卡表（面板按钮 / 自然语言触发共用） */
function latestDeckText(maxScan) {
    const c = ctx();
    const chat = Array.isArray(c.chat) ? c.chat : [];
    const limit = Math.max(1, Number(maxScan) || 5);
    for (let i = chat.length - 1, n = 0; i >= 0 && n < limit; i--) {
        const mes = String((chat[i] && chat[i].mes) || "");
        if (!mes) continue;
        if (mes.indexOf("卡组") < 0 && mes.indexOf("主卡组") < 0 && mes.indexOf("<deck>") < 0) continue;
        n++;
        const picked = deckArgText(mes);
        const body = picked && picked.text ? picked.text : mes;
        // 必须有"数量 + 卡名"的行，且至少 3 行，才当卡表（避免把随口一句"卡组"当成卡表）
        if (!/\d+\s*\S+/.test(body) || body.split("\n").length < 3) continue;
        if (parseDeckText(body).main.length) return body;
    }
    return "";
}

/** 3) 打开：新标签页（Blob）优先，回退到弹窗预览 */
async function openDeckImage(text) {
    const r = await resolveDeck(text);
    const total = (r.counts.main || 0) + (r.counts.extra || 0) + (r.counts.side || 0);
    if (!total) return await deckImageText(text);
    const html = deckImageHtml(r);
    const c = ctx();
    const w = typeof window !== "undefined" ? window : null;
    try {
        if (w && typeof w.open === "function" && typeof URL !== "undefined" && typeof Blob !== "undefined") {
            const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
            const tab = w.open(url, "_blank");
            if (tab) { log("卡组图", "已在新标签页打开（" + total + " 张）"); return await deckImageText(text) + "（已在新标签页打开）"; }
        }
    } catch (error) { log("卡组图", "新标签页打开失败：" + (error && error.message ? error.message : error)); }
    if (c && typeof c.callGenericPopup === "function") {
        const types = c.POPUP_TYPE || {};
        try {
            await c.callGenericPopup(html, types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "关闭" });
            return await deckImageText(text);
        } catch (error) { log("卡组图", "弹窗预览失败：" + (error && error.message ? error.message : error)); }
    }
    return await deckImageText(text) + "（当前环境无法打开图片页）";
}

/** 4) 注册能力 */
function registerDeckImage() {
    registry.provide("cmd:deckimage", async function (args) {
        const text = String((args && args.deck) || "").trim();
        if (!text) return "要生成卡组图的话，请把卡表贴在命令后面（每行「3 卡名」），或先发一条卡表消息。";
        return await openDeckImage(text);
    });
    // 面板按钮走的就是这个能力（index.js 的 PANEL_ACTIONS.deckImage）；以前只有 cmd:/runAction: 两个键，
    // 按钮必然报「未注册的能力：tool:deckimage」。
    registry.provide("tool:deckimage", async function (args) {
        const a = args || {};
        const given = String(a.deck || a.text || "").trim();
        if (given) return await openDeckImage(given);
        const found = latestDeckText(5);
        if (!found) return "聊天里没找到卡表。把卡组写成 <deck>…</deck>（每行「3 卡名」）发一条消息，或直接把卡表贴在命令后面：/ygodeckimage 3 青眼白龙";
        return await openDeckImage(found);
    });
    registry.provide("runAction:deckimage", async function (trigger) {
        if (!trigger || trigger.action !== "deckimage") return [];
        // ★ 正则以前写成 /d+s*S+/（反斜杠丢了）→ 永远不匹配，自然语言「卡组图」永远没结果
        const found = latestDeckText(3);
        if (!found) return [];
        return [{ name: "卡组展示图", text: await openDeckImage(found) }];
    });
    log("接口", "卡组展示图已注册（cmd:deckimage / tool:deckimage / runAction:deckimage）");
}

const deckImage = { GROUPS, resolveDeck, deckImageHtml, deckImageText, openDeckImage, latestDeckText, registerDeckImage };

return { GROUPS, resolveDeck, deckImageHtml, deckImageText, latestDeckText, openDeckImage, registerDeckImage, deckImage };
});

__def("src/api/external.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");
const { settings } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");

/** ── 统一模板（外部接口模块）：常量 → 纯函数 → 三条通道 → 降级链 → register → exports ── */

/** 1) 常量：模式与默认值 */
/** 输出 token 上限（面板可设的最大值） */
const MAX_TOKENS_CEILING = 65535;

/** 归一"最大输出 token"（纯函数）：空/0/非数字 → fallback(800)；<64 → 64；>65535 → 65535 */
function clampMaxTokens(value, fallback) {
    const n = Number(value);
    const base = (Number.isFinite(n) && n > 0) ? n : (Number(fallback) || 800);
    return Math.max(64, Math.min(MAX_TOKENS_CEILING, Math.floor(base)));
}

const MODES = [
    { key: "auto", label: "自动（推荐：有哪条用哪条）" },
    { key: "off", label: "关闭（只用本地数据）" },
    { key: "ttmain", label: "tt 主连接（用当前主模型）" },
    { key: "main", label: "酒馆助手（generateRaw）" },
    { key: "route", label: "自填地址（内部先服务端路由、再客户端直连）" },
];
const ROUTE_GENERATE = "/api/backends/chat-completions/generate";
const ROUTE_STATUS = "/api/backends/chat-completions/status";
const MANUAL_MODEL = "__manual__";
const DEFAULT_TIMEOUT = 30000;
const BREAK_THRESHOLD = 3;      // 连续失败几次就熔断
const BREAK_COOLDOWN = 60000;   // 熔断冷却毫秒

/** 纯函数：路由请求体。
 *  实测官方源码（src/endpoints/backends/chat-completions.js）：
 *   - custom 源的密钥取自服务器设置（SECRET_KEYS.CUSTOM），请求里带的 proxy_password 会被忽略；
 *   - openai 源支持 reverse_proxy + proxy_password（用户自带地址与密钥）。
 *  所以"带密钥"时必须走 openai 源，否则鉴权一定失败。 */
/** 纯函数：把用户填的地址归一成"base"（官方是 base + /chat/completions + /models，多填会拼错）
 *  - 末尾斜杠去掉（否则会出现 //chat/completions）
 *  - 末尾的 /chat/completions 或 /completions 去掉（用户常直接贴整条端点）
 *  - 末尾的 /models 去掉（从"拉取模型"复制来的） */
/** v1 的 apiChatUrl 原样移植：把用户填的地址补成 <base>[/v1]/chat/completions
 *  v1（index.js:2249）实测可用：末尾去斜杠；没带 /chat/completions 就补；base 里没有 /v1 就插一个。 */
function directChatUrl(base) {
    let u = String(base || "").trim().replace(/\/+$/, "");
    if (!u) return "";
    if (!/\/chat\/completions$/.test(u)) u += (u.indexOf("/v1") >= 0 ? "" : "/v1") + "/chat/completions";
    return u;
}

/** v1 的 apiModelsUrl 移植：优先 <base>/models，base 里已有 /v1 就只用它 */
function directModelsUrls(base) {
    const b = String(base || "").trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
    if (!b) return [];
    return b.indexOf("/v1") >= 0 ? [b + "/models"] : [b + "/models", b + "/v1/models"];
}

/** 浏览器直连（不经过酒馆服务端）：v1 用的就是这条路，TauriTavern 里没有 /api/backends 也能用 */
async function callDirect(args) {
    const a = args || {};
    const u = directChatUrl(a.baseUrl || settings.get("apiUrl"));
    if (!u) return { ok: false, via: "direct", error: "没有填写 API 地址" };
    const key = String(a.apiKey || settings.get("apiKey") || "").trim();
    const doFetch = (typeof fetch === "function") ? fetch : null;
    if (!doFetch) return { ok: false, via: "direct", error: "当前环境没有 fetch" };
    const headers = { "Content-Type": "application/json" };
    if (key) { headers["Authorization"] = "Bearer " + key; headers["X-API-Key"] = key; }
    const body = {
        model: String(a.model || effectiveModel() || "").trim() || "gpt-3.5-turbo",
        messages: a.messages || buildMessages(a.system, a.user),
        temperature: 0.3,
        max_tokens: clampMaxTokens(a.maxTokens || settings.get("apiMaxTokens")),
        stream: false,
    };
    try {
        const res = await fetchWithTimeout(doFetch, u, { method: "POST", headers: headers, body: JSON.stringify(body) }, a.timeoutMs || DEFAULT_TIMEOUT, "直连请求");
        const raw = String(await res.text().catch(function () { return ""; }));
        if (!res.ok) {
            log("外部", "直连 HTTP " + res.status + "：" + raw.slice(0, 150).replace(/\s+/g, " "));
            return { ok: false, via: "direct", error: "HTTP " + res.status + "：" + raw.slice(0, 200).replace(/\s+/g, " "), raw: raw };
        }
        let out = "";
        let fr = "";
        try {
            const data = JSON.parse(raw);
            fr = finishReasonOf(data);
            if (fr === "length") log("外部", "⚠️ 直连返回被截断（finish_reason=length，输出 token 用完）：建议调大「副 API 最大输出」，或换非推理模型");
            out = String((data && data.choices && data.choices[0] && ((data.choices[0].message && data.choices[0].message.content) || data.choices[0].text)) || "").trim();
        } catch (error) { out = raw.trim(); }
        if (!out) return { ok: false, via: "direct", error: "返回里没有内容", raw: raw };
        recordSuccess();
        log("外部", "直连返回 " + out.length + " 字");
        return { ok: true, via: "direct", text: out, raw: raw, finishReason: fr };
    } catch (error) {
        const msg = (error && error.message) ? error.message : String(error);
        recordFailure();
        log("外部", "直连失败：" + msg);
        return { ok: false, via: "direct", error: msg };
    }
}

/** 直连拉模型（v1 的浏览器分支）：逐条试，失败原因全部记下来 */
async function fetchModelsDirect(args) {
    const a = args || {};
    const key = String(a.apiKey || settings.get("apiKey") || "").trim();
    const doFetch = (typeof fetch === "function") ? fetch : null;
    const tried = [];
    if (!doFetch) return { ok: false, error: "当前环境没有 fetch", models: [], tried: tried };
    for (const u of directModelsUrls(a.baseUrl || settings.get("apiUrl"))) {
        try {
            const res = await fetchWithTimeout(doFetch, u, { method: "GET", headers: key ? { "Authorization": "Bearer " + key } : {} }, a.timeoutMs || 15000, "直连拉模型");
            const raw = String(await res.text().catch(function () { return ""; }));
            tried.push("直连 " + u + " → HTTP " + res.status);
            if (res.status === 401 || res.status === 403) return { ok: false, error: "密钥被拒绝（HTTP " + res.status + "）", models: [], tried: tried };
            if (!res.ok) continue;
            const models = parseModelList(raw);
            if (models.length) return { ok: true, models: models, tried: tried, via: "direct", url: u };
            tried.push("（返回里没有模型列表）");
        } catch (error) {
            tried.push("直连 " + u + " → " + ((error && error.message) ? error.message : String(error)));
        }
    }
    return { ok: false, error: "直连也没拉到模型列表", models: [], tried: tried };
}

/** 纯函数：从任意返回体里挖模型名（v1 的三种形态都兼容） */
function parseModelList(raw) {
    let data = null;
    try { data = JSON.parse(String(raw || "")); } catch (error) { return []; }
    const list = Array.isArray(data) ? data : ((data && (data.data || data.models)) || []);
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const m of list) { const id = String((m && (m.id || m.name || m.model)) || m || "").trim(); if (id && out.indexOf(id) < 0) out.push(id); }
    return out;
}

function normalizeBaseUrl(url) {
    let u = String(url || "").trim();
    if (!u) return "";
    u = u.replace(/\/+$/, "");
    u = u.replace(/\/chat\/completions$/i, "");
    u = u.replace(/\/completions$/i, "");
    u = u.replace(/\/models$/i, "");
    return u.replace(/\/+$/, "");
}

/** 是否 TauriTavern 宿主（照抄参考插件 host-detect：窗口上挂 __TAURITAVERN__） */
function isTauriTavern() {
    try {
        const g = globalThis;
        return Boolean(g.__TAURITAVERN__ || (g.window && g.window.__TAURITAVERN__));
    } catch (error) { return false; }
}

/** 参考插件（龙血玄黄·数据库 1.2.5）的**可用契约**：custom 源 + custom_url + 密钥放 custom_include_headers。
 *  实测要点（逐条对齐该插件 src/service/ai/api-call.ts:223/281-340）：
 *   - TT 与 ST 都走 chat_completion_source: "custom"（TT 下不认 openai+proxy_password 那套）；
 *   - 密钥不是 proxy_password，而是 custom_include_headers 里的 YAML 字符串 "Authorization: Bearer sk-…"；
 *   - TT 额外带 custom_api_format: "openai_compat"（四值契约之一），ST 不识别该字段；
 *   - 关掉联网/图片/推理与工具，避免被宿主的包装改写（tool_choice: "none"）。 */
function buildRouteBody(args) {
    const a = args || {};
    const baseUrl = normalizeBaseUrl(a.baseUrl) || String(a.baseUrl || "").trim();
    const apiKey = String(a.apiKey || "").trim();
    const body = {
        messages: a.messages || buildMessages(a.system, a.user),
        model: String(a.model || "").trim() || "gpt-3.5-turbo",
        max_tokens: clampMaxTokens(a.maxTokens),
        temperature: 0.3,
        top_p: 0.9,
        stream: false,
        chat_completion_source: "custom",
        custom_url: baseUrl,
        custom_include_headers: apiKey ? ("Authorization: Bearer " + apiKey + String.fromCharCode(10) + "X-API-Key: " + apiKey) : "",
        reverse_proxy: baseUrl,
        proxy_password: "",
        group_names: [],
        include_reasoning: false,
        reasoning_effort: "medium",
        enable_web_search: false,
        request_images: false,
        tool_choice: "none",
    };
    if (isTauriTavern()) body.custom_api_format = "openai_compat";
    return body;
}

/** 旧写法（原版 SillyTavern 的 openai 源 + reverse_proxy + proxy_password）：ST 下作为第二尝试 */
function buildRouteBodySTNative(args) {
    const a = args || {};
    const baseUrl = normalizeBaseUrl(a.baseUrl) || String(a.baseUrl || "").trim();
    const apiKey = String(a.apiKey || "").trim();
    const body = { model: String(a.model || "").trim() || "gpt-3.5-turbo", stream: false };
    body.chat_completion_source = "openai";
    body.reverse_proxy = baseUrl;
    if (apiKey) body.proxy_password = apiKey;
    if (a.messages) body.messages = a.messages;
    if (a.maxTokens) body.max_tokens = clampMaxTokens(a.maxTokens);
    return body;
}

/** 当前生效的模型名（下拉选了「手动填写」就用输入框里的） */
function effectiveModel() {
    const picked = String(settings.get("apiModel") || "").trim();
    if (picked === MANUAL_MODEL) return String(settings.get("apiModelManual") || "").trim();
    return picked;
}

/** 2) 宿主 API 探测（一律做存在性检查，缺了不报错、只降级） */
function hostApis() {
    const c = ctx() || {};
    const g = (typeof globalThis !== "undefined" ? globalThis : {});
    const th = g.TavernHelper || (c.TavernHelper || null);
    const cm = (c.ConnectionManagerRequestService) || (g.SillyTavern && g.SillyTavern.getContext ? (g.SillyTavern.getContext() || {}).ConnectionManagerRequestService : null) || null;
    const headers = typeof c.getRequestHeaders === "function" ? c.getRequestHeaders() : null;
    return { connectionManager: cm, tavernHelper: th, headers: headers, raw: c };
}
function capabilityReport() {
    const h = hostApis();
    return {
        secondary: !!(h.connectionManager && typeof h.connectionManager.sendRequest === "function"),
        main: !!(h.tavernHelper && typeof h.tavernHelper.generateRaw === "function"),
        route: !!h.headers,
        profiles: listProfiles().length,
    };
}
/** 连接配置列表（官方：extensionSettings.connectionManager.profiles） */
function listProfiles() {
    try {
        const c = ctx() || {};
        const list = c.extensionSettings && c.extensionSettings.connectionManager && c.extensionSettings.connectionManager.profiles;
        if (!Array.isArray(list)) return [];
        return list.map(function (p) { return { id: String(p.id || ""), name: String(p.name || p.id || ""), api: String(p.api || ""), model: String(p.model || "") }; }).filter(function (p) { return p.id; });
    } catch (error) { return []; }
}
/** 选连接：先按 id，再按名字（都不给则取第一条有效的） */
function pickProfile(wanted) {
    const list = listProfiles();
    if (!list.length) return null;
    const w = String(wanted || "").trim();
    if (!w) return list[0];
    return list.filter(function (p) { return p.id === w; })[0] || list.filter(function (p) { return p.name === w; })[0] || list[0];
}

/** 3) 纯函数：消息组装（复用于三条通道） */
function buildMessages(system, user) {
    const out = [];
    if (String(system || "").trim()) out.push({ role: "system", content: String(system) });
    out.push({ role: "user", content: String(user || "") });
    return out;
}
/** 从各种返回形态里取纯文本（TH 的 generateRaw 可能返回字符串或详情对象） */
/**
 * 从任意兼容响应里取 finish_reason（纯函数）。
 *   "stop" 正常说完；"length" **被输出 token 上限截断**（推理模型把预算花在思考上时很常见）。
 * 插件据此在注入里明确标注"这段被截断了"，不再把半句话当完整结果用。
 */
function finishReasonOf(payload) {
    if (!payload || typeof payload !== "object") return "";
    if (Array.isArray(payload.choices) && payload.choices[0] && payload.choices[0].finish_reason) return String(payload.choices[0].finish_reason);
    if (typeof payload.finish_reason === "string") return payload.finish_reason;
    return "";
}

function extractText(result) {
    if (result === undefined || result === null) return "";
    if (typeof result === "string") return result;
    if (typeof result === "object") {
        if (typeof result.content === "string") return result.content;
        if (typeof result.text === "string") return result.text;
        if (result.message && typeof result.message.content === "string") return result.message.content;
        if (Array.isArray(result.choices) && result.choices[0]) {
            const c0 = result.choices[0];
            if (c0.message && typeof c0.message.content === "string") return c0.message.content;
            if (typeof c0.text === "string") return c0.text;
        }
    }
    return String(result);
}
/** 纯函数：组装给外部模型的提问（卡面数据 + 玩家原话 + 自定义指令） */
/** 给外部 AI 的默认指令（字段读取 → 是不是卡的判定 → 强制用内置工具 → 固定输出格式） */
const EXTERNAL_INSTRUCTION = "你是游戏王卡牌资料的检索与核对助手。插件（查卡器 v2）会把对话里识别出的**字段**交给你，并附上本地卡库已经取到的卡面资料。" +
    "\n" + "" +
    "\n" + "【第一步 · 读取字段】" +
    "\n" + "输入里的\"字段\"可能是：一条卡名、一个系列/字段名（如「天气」「白银城」「青眼」「黄金国」）、俗称、英文名、卡密；也可能是普通词语（场景描写、语气词、人名、地名、招式名）。请逐条处理，不要合并猜测。" +
    "\n" + "" +
    "\n" + "【第二步 · 先判定\"这是不是卡\"】" +
    "\n" + "· 卡：能对应到一张具体卡（卡名 / 英文名 / 俗称 / 卡密）→ 用工具取真值。" +
    "\n" + "· 系列/字段：对应一组卡 → 用 find_yugioh_series_cards。" +
    "\n" + "· 不是卡：日常词、拟声词、人名、地名、招式名等 → 直接忽略：不查、不贴卡图、不提卡牌。" +
    "\n" + "· 拿不准时按\"不是卡\"处理，并在输出里标注\"未确认\"。" +
    "\n" + "" +
    "\n" + "【第三步 · 必须用内置工具检索，不要凭记忆】" +
    "\n" + "· 单卡数值/效果/译名/卡密 → get_yugioh_card" +
    "\n" + "· 名字记不全/译名不确定 → search_yugioh_cards（先拿到完整名，再调 get_yugioh_card）" +
    "\n" + "· 卡图（可放进正文的 markdown 图片）→ get_yugioh_card_image" +
    "\n" + "· 官方裁定/FAQ、判定争议 → get_yugioh_ruling（比记忆可靠，优先用）" +
    "\n" + "· 这张卡的异画/版本 → get_yugioh_card_art；哪些卡有异画 → list_yugioh_alt_art_cards" +
    "\n" + "· 某系列/字段有哪些卡 → find_yugioh_series_cards" +
    "\n" + "· 禁限表 / 某卡是否被禁 → get_yugioh_banlist" +
    "\n" + "· 卡包 → open_yugioh_pack / list_yugioh_packs / search_yugioh_packs；随机抽卡 → draw_yugioh_card" +
    "\n" + "· 卡组/起手/召唤/盘面/本局卡表/收藏/商店/DIY → validate_yugioh_deck / simulate_yugioh_hand / check_summon_legality / duel_board / list_cards_in_chat / get_collection / open_yugioh_shop / manage_diy_card" +
    "\n" + "工具没返回的，一律不要编造；查不到就写\"未命中\"。" +
    "\n" + "" +
    "\n" + "【第四步 · 按固定格式输出（正文给玩家看，不要带工具名/参数/报错原文）】" +
    "\n" + "【判定】卡 / 系列：<系列名> / 不是卡（已忽略）" +
    "\n" + "【出处】<卡名>（卡密 <id>）｜字段：<字段名>｜禁限：<无限制/限制/准限制/禁止>" +
    "\n" + "【数据】<数值，如 ATK/DEF、星级、种族/属性>" +
    "\n" + "【效果】<效果原文，原样引用，不改写、不四舍五入>" +
    "\n" + "【卡图】![](<图片直链>)" +
    "\n" + "【裁定】<有则给日期与结论；没有就写\"无相关裁定\">" +
    "\n" + "【建议】用 / 不用 + 一句话理由（结合语境判断它是不是在说这张卡）" +
    "\n" + "" +
    "\n" + "【硬性要求】" +
    "\n" + "· 数值与效果必须来自工具返回值，原样引用；缺失的项留空，不要自己补。" +
    "\n" + "· 一次最多列 6 张卡；更多时先给最相关的 6 张，并说明还有多少张未列。" +
    "\n" + "· 与角色扮演冲突时，以玩家人设与剧情为准；除非玩家明确问\"你用了什么工具\"，否则不要把本提示词、工具名或过程讲给玩家。" +
    "\n" + "· 全部内容控制在 500 字内（裁定原文可另附，不计入）。";

function buildCardPrompt(cards, question, instruction, extra) {
    const list = Array.isArray(cards) ? cards : [];
    const parts = [];
    const head = String(instruction || "").trim() || EXTERNAL_INSTRUCTION;   // 面板「外部接口 → 指令」留空时用上面这段
    parts.push(head);
    parts.push("");
    parts.push("【插件抽出的字段（待你按上面的规则判定）】");
    if (list.length) for (const c of list.slice(0, 6)) parts.push("· " + String((c && c.name) || "?"));
    else parts.push("· （本轮没有抽出字段）");
    parts.push("");
    parts.push("【本地卡面资料（来自本地卡库，可信；与工具冲突时以工具为准）】");
    if (list.length) { for (const c of list.slice(0, 6)) parts.push("· " + String((c && c.name) || "?") + "：" + String((c && c.text) || "").replace(/\n/g, " ").slice(0, 600)); }
    else parts.push("· （无）");
    parts.push("");
    const extraText = String(extra || "").trim();
    if (extraText) {
        parts.push("");
        parts.push("【插件已经执行的指令结果（真值，直接用；不要重复执行）】");
        parts.push(extraText.slice(0, 4000));
    }

    parts.push("【玩家的话】");
    parts.push(String(question || "").slice(0, 800));
    return parts.join("\n");
}

/** 超时包装（宿主没有 signal 支持时也能兜底） */
async function withTimeout(promise, ms, label) {
    const limit = Math.max(1000, Number(ms) || DEFAULT_TIMEOUT);
    let timer = null;
    const timeout = new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error((label || "请求") + "超时（" + limit + "ms）")); }, limit); });
    try { return await Promise.race([promise, timeout]); }
    finally { if (timer) clearTimeout(timer); }
}

/** 带真正取消的取数：超时就 abort（原来只用 Promise.race，超时后请求还在跑，还被算进熔断失败） */
async function fetchWithTimeout(doFetch, url, init, ms, label) {
    const limit = Math.max(1000, Number(ms) || DEFAULT_TIMEOUT);
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer = null;
    let options = init || {};
    if (controller) {
        options = Object.assign({}, options, { signal: controller.signal });
        timer = setTimeout(function () { try { controller.abort(); } catch (error) { /* 忽略 */ } }, limit);
    }
    try { return await withTimeout(doFetch(url, options), limit, label); }
    finally { if (timer) clearTimeout(timer); }
}

/** 4) 三条通道 */
/** 副 API：走官方的 ConnectionManagerRequestService（连接配置） */
async function callSecondary(args) {
    const a = args || {};
    const h = hostApis();
    if (!h.connectionManager || typeof h.connectionManager.sendRequest !== "function") {
        return { ok: false, via: "secondary", error: "副 API 不可用（没有 ConnectionManagerRequestService；请确认酒馆的「连接管理器」已启用）" };
    }
    const profile = pickProfile(a.profileId);
    if (!profile) return { ok: false, via: "secondary", error: "没有可用的连接配置（先在酒馆「连接管理器」里保存一条）" };
    try {
        const messages = a.messages || buildMessages(a.system, a.user);
        // 官方签名：sendRequest(profileId, prompt, maxTokens, custom, overridePayload)
        const result = await withTimeout(
            h.connectionManager.sendRequest(profile.id, messages, clampMaxTokens(a.maxTokens || settings.get("apiMaxTokens")), { extractData: true, includePreset: true, includeInstruct: true }),
            a.timeoutMs, "副 API");
        const text = extractText(result);
        if (!text.trim()) return { ok: false, via: "secondary", error: "副 API 返回空内容", profile: profile };
        log("外部", "副 API（" + profile.name + "）返回 " + text.length + " 字");
        return { ok: true, via: "secondary", text: text, profile: profile };
    } catch (error) {
        return { ok: false, via: "secondary", error: "副 API 失败：" + (error && error.message ? error.message : error), profile: profile };
    }
}

/** 主 API：酒馆助手的 generateRaw（官方签名见 JS-Slash-Runner 的 generate.d.ts） */
async function callMain(args) {
    const a = args || {};
    const h = hostApis();
    if (!h.tavernHelper || typeof h.tavernHelper.generateRaw !== "function") {
        return { ok: false, via: "main", error: "主 API 不可用（没有酒馆助手的 generateRaw；请安装/启用 JS-Slash-Runner）" };
    }
    try {
        const ordered = [];
        if (String(a.system || "").trim()) ordered.push({ role: "system", content: String(a.system) });
        ordered.push({ role: "user", content: String(a.user || "") });
        const result = await withTimeout(
            h.tavernHelper.generateRaw({ ordered_prompts: ordered, should_stream: false, should_silence: true }),
            a.timeoutMs, "主 API");
        const text = extractText(result);
        if (!text.trim()) return { ok: false, via: "main", error: "主 API 返回空内容" };
        log("外部", "主 API（generateRaw）返回 " + text.length + " 字");
        return { ok: true, via: "main", text: text };
    } catch (error) {
        return { ok: false, via: "main", error: "主 API 失败：" + (error && error.message ? error.message : error) };
    }
}

/** 服务器路由：直接 POST 官方 /api/backends/chat-completions/generate（custom 源不要求 apiKey） */
/** 各通道当前是否可用（测试面板与「自动」模式共用同一套判定，避免两处不一致） */
function channelAvailability() {
    let c = null;
    try { c = (typeof SillyTavern !== "undefined" && SillyTavern.getContext) ? SillyTavern.getContext() : null; } catch (error) { c = null; }
    const profiles = (c && c.extensionSettings && c.extensionSettings.connectionManager && c.extensionSettings.connectionManager.profiles) || [];
    const th = (typeof TavernHelper !== "undefined") ? TavernHelper : ((c && c.TavernHelper) || null);
    const tt = ttMainAvailable();
    const baseUrl = String(settings.get("apiUrl") || "").trim();
    const rows = [
        { key: "ttmain", name: "tt 主连接直发", can: tt.ok, why: tt.ok ? ("主连接源 " + (tt.source || "?") + "，模型 " + (tt.model || "（跟随宿主）")) : "宿主主连接不是 Chat Completion" },
        { key: "main", name: "酒馆助手 generateRaw", can: !!(th && typeof th.generateRaw === "function"), why: (th && typeof th.generateRaw === "function") ? "检测到 TavernHelper.generateRaw" : "没有检测到酒馆助手（JS-Slash-Runner）" },
        { key: "secondary", name: "连接配置（酒馆连接管理器）", can: profiles.length > 0, why: profiles.length ? (profiles.length + " 条：" + profiles.map(function (p) { return p.name || p.id; }).join("、")) : "没有保存任何连接配置" },
        { key: "route", name: "自填地址（服务端路由 → 失败自动直连）", can: !!baseUrl, why: baseUrl ? ("地址 " + baseUrl) : "没填接口地址" },
        { key: "direct", name: "自填地址（客户端直连）", can: !!baseUrl, why: baseUrl ? ("地址 " + baseUrl + "（浏览器直连）") : "没填接口地址" },
    ];   // ★ direct 以前没有这一行，而 resolveOrder()/AUTO_ORDER 里都有它 → auto 模式永远选不到直连
    return { rows: rows, available: rows.filter(function (r) { return r.can; }).map(function (r) { return r.key; }), tt: tt, profiles: profiles.length, baseUrl: baseUrl };
}

/** tt / 酒馆主连接是否可用于 Chat Completion 直发（照抄参考插件 ai-gateway.ts:114）。
 *  判定：宿主 mainApi === 'openai' 且存在 chatCompletionSettings。 */
function ttMainAvailable() {
    try {
        const c = (typeof SillyTavern !== "undefined" && SillyTavern.getContext) ? SillyTavern.getContext() : null;
        return !!(c && c.mainApi === "openai" && c.chatCompletionSettings) ? { ok: true, source: String(c.chatCompletionSettings.chat_completion_source || ""), model: (typeof c.getChatCompletionModel === "function" ? c.getChatCompletionModel() : c.chatCompletionSettings.custom_model || "") } : { ok: false, source: "", model: "" };
    } catch (error) { return { ok: false, source: "", model: "" }; }
}

/** 这些源的 reverse_proxy/proxy_password 才被宿主采纳（照抄参考插件的同名白名单） */
const MAIN_PROXY_SOURCES = ["claude", "openai", "mistralai", "makersuite", "vertexai", "deepseek", "xai"];

/** 纯函数：按宿主主连接设置组装请求体（照抄参考插件 sendMainApiChatCompletionRequest） */
function buildTTMainBody(messages, oai, model, maxTokens) {
    const o = oai || {};
    const source = String(o.chat_completion_source || "");
    const body = {
        stream: false,
        messages: messages || [],
        model: model || undefined,
        chat_completion_source: source,
        max_tokens: clampMaxTokens(maxTokens || o.openai_max_tokens),
        temperature: Number.isFinite(Number(o.temp_openai)) ? Number(o.temp_openai) : undefined,
        top_p: Number.isFinite(Number(o.top_p_openai)) ? Number(o.top_p_openai) : undefined,
        custom_prompt_post_processing: o.custom_prompt_post_processing,
    };
    if (o.reverse_proxy && MAIN_PROXY_SOURCES.indexOf(source) >= 0) { body.reverse_proxy = o.reverse_proxy; body.proxy_password = o.proxy_password; }
    if (source === "custom") {
        body.custom_url = o.custom_url;
        body.custom_include_body = o.custom_include_body;
        body.custom_exclude_body = o.custom_exclude_body;
        body.custom_include_headers = o.custom_include_headers;
    }
    if (source === "claude") body.claude_use_sysprompt = o.claude_use_sysprompt;
    if (source === "makersuite" || source === "vertexai") body.use_makersuite_sysprompt = o.use_makersuite_sysprompt;
    return body;
}

/** 用宿主主连接直发生成端点（不需要任何"连接配置"，tt 里最省事的一条） */
async function callTTMain(args) {
    const a = args || {};
    const av = ttMainAvailable();
    if (!av.ok) return { ok: false, via: "ttmain", error: "宿主主连接不是 Chat Completion（mainApi≠openai 或缺 chatCompletionSettings）" };
    const h = hostApis();
    if (!h.headers) return { ok: false, via: "ttmain", error: "拿不到请求头（getRequestHeaders 不可用）" };
    const doFetch = (typeof fetch === "function") ? fetch : null;
    if (!doFetch) return { ok: false, via: "ttmain", error: "当前环境没有 fetch" };
    let body = null;
    try {
        const c = SillyTavern.getContext();
        const oai = c.chatCompletionSettings || {};
        body = buildTTMainBody(a.messages || buildMessages(a.system, a.user), oai, av.model || a.model, a.maxTokens || settings.get("apiMaxTokens"));
        // 宿主有 ChatCompletionService.createRequestData 时用它归一（与宿主内部一致）
        const svc = c.ChatCompletionService;
        if (svc && typeof svc.createRequestData === "function") { try { body = Object.assign(svc.createRequestData.call(svc, body), { stream: false }); } catch (error) { /* 用原体 */ } }
        body.tool_choice = "none";
    } catch (error) { return { ok: false, via: "ttmain", error: "组装请求体失败：" + ((error && error.message) ? error.message : String(error)) }; }
    try {
        const res = await fetchWithTimeout(doFetch, ROUTE_GENERATE, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, h.headers), body: JSON.stringify(body) }, a.timeoutMs || DEFAULT_TIMEOUT, "主连接直发");
        const raw = await readBody(res);
        if (!res.ok) { const e = "HTTP " + res.status + "：" + String(raw).slice(0, 200).replace(/\s+/g, " "); recordFailure(); return { ok: false, via: "ttmain", error: e, raw: raw }; }
        let payload = null;
        try { payload = JSON.parse(raw); } catch (error) { payload = null; }
        const text = payload ? extractText(payload) : String(raw || "").trim();
        const fr = finishReasonOf(payload);
        if (fr === "length") log("外部", "⚠️ 返回被截断（finish_reason=length）：建议调大「副 API 最大输出」");
        if (!text) { recordFailure(); return { ok: false, via: "ttmain", error: "返回里没有内容", raw: raw }; }
        recordSuccess();
        log("外部", "主连接直发返回 " + text.length + " 字（源 " + body.chat_completion_source + "）");
        return { ok: true, via: "ttmain", text: text, raw: raw, source: body.chat_completion_source, finishReason: fr };
    } catch (error) {
        const msg = (error && error.message) ? error.message : String(error);
        recordFailure();
        return { ok: false, via: "ttmain", error: msg };
    }
}

async function callRoute(args) {
    const a = args || {};
    const h = hostApis();
    if (!h.headers) return { ok: false, via: "route", error: "拿不到请求头（getRequestHeaders 不可用）" };
    const doFetch = (typeof fetch === "function") ? fetch : null;
    if (!doFetch) return { ok: false, via: "route", error: "当前环境没有 fetch" };
    const tries = [buildRouteBody({ baseUrl: a.baseUrl || settings.get("apiUrl"), apiKey: a.apiKey || settings.get("apiKey"), model: a.model || effectiveModel(), messages: a.messages || buildMessages(a.system, a.user), maxTokens: a.maxTokens || settings.get("apiMaxTokens") })];
    // 非 TT 时，再补一次原版 ST 的 openai 写法（两种源在不同宿主上各有支持）
    if (!isTauriTavern()) tries.push(buildRouteBodySTNative({ baseUrl: a.baseUrl || settings.get("apiUrl"), apiKey: a.apiKey || settings.get("apiKey"), model: a.model || effectiveModel(), messages: a.messages || buildMessages(a.system, a.user), maxTokens: a.maxTokens || settings.get("apiMaxTokens") }));
    const notes = [];
    for (const body of tries) {
        try {
            const res = await fetchWithTimeout(doFetch, ROUTE_GENERATE, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, h.headers), body: JSON.stringify(body) }, a.timeoutMs || DEFAULT_TIMEOUT, "服务器路由");
            const raw = await readBody(res);
            if (!res.ok) {
                notes.push(body.chat_completion_source + " → HTTP " + res.status + (raw ? "：" + raw.slice(0, 120).replace(/\s+/g, " ") : ""));
                continue;
            }
            // extractText 收对象：JSON 能解析就用解析结果，否则退回原文
            let payload = null;
            try { payload = JSON.parse(raw); } catch (error) { payload = null; }
            const text = payload ? extractText(payload) : String(raw || "").trim();
            const fr = finishReasonOf(payload);
            if (fr === "length") log("外部", "⚠️ 返回被截断（finish_reason=length）：建议调大「副 API 最大输出」");
            if (text.trim()) { recordSuccess(); log("外部", "路由（" + body.chat_completion_source + "）返回 " + text.length + " 字"); return { ok: true, via: "route", text: text, raw: raw, source: body.chat_completion_source , finishReason: fr }; }
            notes.push(body.chat_completion_source + " → 返回空内容");
        } catch (error) {
            notes.push(body.chat_completion_source + " → " + ((error && error.message) ? error.message : String(error)));
        }
    }
    recordFailure();
    return { ok: false, via: "route", error: "服务器路由失败：" + notes.join(" | "), tried: notes };
}

/** 兼容读取响应体：宿主给的 Response 可能只有 text() 或只有 json()（两边都试） */
async function readBody(res) {
    if (!res) return "";
    if (typeof res.text === "function") {
        try { const t = String(await res.text()); if (t) return t; } catch (error) { /* 试 json */ }
    }
    if (typeof res.json === "function") {
        try { return JSON.stringify(await res.json()); } catch (error) { /* 放弃 */ }
    }
    return "";
}

/** 拉取模型列表：走官方 /status（与 /generate 同一套 source 规则），结果写进设置供面板下拉使用 */
async function fetchModels(args) {
    const a = args || {};
    const tried = [];
    // ① 酒馆服务端路由（有才走；TauriTavern 里通常没有这个接口）
    if (settings.get("apiViaServer") !== false) {
        const h = hostApis();
        const baseUrl = normalizeBaseUrl(a.baseUrl || settings.get("apiUrl"));
        if (h.headers && baseUrl) {
            const body = buildRouteBody({ baseUrl: baseUrl, apiKey: a.apiKey || settings.get("apiKey"), model: "x" });
            delete body.stream;
            try {
                const doFetch = (typeof fetch === "function") ? fetch : null;
                if (doFetch) {
                    const res = await fetchWithTimeout(doFetch, ROUTE_STATUS, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, h.headers), body: JSON.stringify(body) }, a.timeoutMs || 15000, "服务端拉模型");
                    const raw = String(await res.text().catch(function () { return ""; }));
                    tried.push("服务端 " + baseUrl + " → HTTP " + res.status);
                    if (res.ok) {
                        const models = parseModelList(raw);
                        if (models.length) { settings.set("apiModels", models); log("外部", "服务端拉到 " + models.length + " 个模型"); return { ok: true, models: models, tried: tried, via: "server" }; }
                        tried.push("（服务端返回里没有模型列表）");
                    }
                }
            } catch (error) { tried.push("服务端失败：" + ((error && error.message) ? error.message : String(error))); }
        }
    }
    // ② 浏览器直连兜底（v1 的做法，tt 里靠这条）
    const direct = await fetchModelsDirect({ baseUrl: a.baseUrl, apiKey: a.apiKey, timeoutMs: a.timeoutMs });
    for (const t of (direct.tried || [])) tried.push(t);
    if (direct.ok) {
        settings.set("apiModels", direct.models);
        settings.set("apiModelsVia", direct.via || "direct");
        log("外部", "直连拉到 " + direct.models.length + " 个模型");
        return { ok: true, models: direct.models, tried: tried, via: direct.via || "direct" };
    }
    return { ok: false, error: direct.error, models: [], tried: tried };
}

/** 5) 熔断（连续失败 N 次后冷却，避免每次生成都去撞墙） */
let failStreak = 0;
let brokenUntil = 0;
function circuitState() { return { failStreak: failStreak, brokenUntil: brokenUntil, broken: Date.now() < brokenUntil }; }
function recordSuccess() { failStreak = 0; brokenUntil = 0; }
function recordFailure() { failStreak++; if (failStreak >= BREAK_THRESHOLD) { brokenUntil = Date.now() + BREAK_COOLDOWN; log("外部", "连续失败 " + failStreak + " 次，熔断 " + (BREAK_COOLDOWN / 1000) + " 秒"); } }
function resetCircuit() { failStreak = 0; brokenUntil = 0; }

/** 6) 降级链：按模式依次尝试 */
/** 自动模式的优先顺序：tt 主连接 → 酒馆助手 → 连接配置 → 自填地址（服务端 → 直连） */
const AUTO_ORDER = ["ttmain", "main", "secondary", "route", "direct"];

/** 纯函数：按 v1 的两个开关决定"先问谁"。
 *  跟随主连接（v1 apiFollowMain，默认开）→ 先用主连接那条；关掉 → 先用你自己填的地址。
 *  经酒馆代理（v1 apiViaTavernProxy，默认开）→ ttmain 走宿主转发；关掉 → 直接用宿主地址从浏览器发。 */
function resolveOrder() {
    const follow = settings.get("apiFollowMain") !== false;
    const viaServer = settings.get("apiViaServer") !== false;
    const host = follow ? ["ttmain", "main"] : [];
    const own = ["route", "direct"];
    const base = follow ? host.concat(own) : own.concat(host);
    if (!viaServer) return base.filter(function (v) { return v !== "ttmain"; });
    return base;
}

async function askExternal(args) {
    const a = args || {};
    const mode = String(a.mode || settings.get("apiMode") || "off");
    // 尊重调用方给的预算（拦截器按面板「外部处理预算 / 不阻塞生成」算好传进来）；
    // 以前读的是 settings.get("apiTimeout") —— 这个设置项根本不存在，于是永远 30 秒。
    const timeoutMs = Math.max(1000, Number(a.timeoutMs) || DEFAULT_TIMEOUT);
    const base = { system: a.system, user: a.user, messages: a.messages, maxTokens: a.maxTokens || settings.get("apiMaxTokens"), profileId: a.profileId || settings.get("apiProfile"), baseUrl: a.baseUrl, apiKey: a.apiKey, model: a.model, timeoutMs: timeoutMs };
    if (mode === "off") return { ok: false, via: "off", text: "", tried: [], error: "外部接口已关闭（面板「外部接口」里可开启）" };
    if (circuitState().broken) return { ok: false, via: "circuit", text: "", tried: [], error: "外部接口暂时熔断中（连续失败），稍后再试" };
        let order;
        if (mode === "secondary-then-main") order = ["secondary", "main"];
        else if (mode === "route") order = ["route", "direct"];
        else if (mode === "auto") {
            // 自动：只挑当前真的能用的通道，谁先成谁上
            let avail = [];
            try { avail = channelAvailability().available; } catch (error) { avail = []; }
            // v1 语义：跟随主连接 → 先用主连接；否则先用自填地址。只挑当前真能用的。
            order = resolveOrder().filter(function (v) { return avail.indexOf(v) >= 0; });
            if (!order.length) return { ok: false, via: "auto", text: "", tried: [], error: "自动模式：没有检测到可用通道（先在面板里填自填地址，或确认主连接/酒馆助手可用）" };
        } else order = [mode];
    const tried = [];
    for (const via of order) {
        const fn = via === "secondary" ? callSecondary : via === "main" ? callMain : via === "ttmain" ? callTTMain : via === "direct" ? callDirect : callRoute;
        const r = await fn(base);
        tried.push({ via: via, ok: !!r.ok, error: r.error || "" });
        if (r.ok) { recordSuccess(); return { ok: true, via: via, text: r.text, tried: tried, profile: r.profile || null, finishReason: r.finishReason || "" }; }
    }
    recordFailure();
    return { ok: false, via: order[order.length - 1], text: "", tried: tried, error: (tried[tried.length - 1] || {}).error || "外部接口不可用" };
}

/** 7) 注册能力 */
function registerExternal() {
    registry.provide("external:prompt", async function (args) { const a = args || {}; return buildCardPrompt(a.cards, a.question || a.text || "", a.instruction); });   // 之前第二个参数写死 ""，导致【玩家的话】永远是空的（实测发现）
    registry.provide("external:ask", async function (args) { return await askExternal(args || {}); });
    registry.provide("external:profiles", async function () { return listProfiles(); });
    registry.provide("external:capability", async function () { return capabilityReport(); });
    registry.provide("external:models", async function (args) {
        const r = await fetchModels(args || {});
        if (!r.ok) return "❌ " + r.error;
        return "✅ 拉取到 " + r.models.length + " 个模型：" + r.models.slice(0, 30).join("、") + "\n\n已写入面板「服务器路由：模型」下拉，去选一个再点测试。";
    });
    registry.provide("external:test", async function (args) {
        // 全通道探测：不管 apiMode 设成什么，逐条报告"这条通道现在能不能用"，最后给出建议
        const a = args || {};
        const c = (typeof SillyTavern !== "undefined" && SillyTavern.getContext) ? SillyTavern.getContext() : null;
        const lines = ["🔌 外部接口 · 全通道探测", ""];
        const mode = String(a.mode || settings.get("apiMode") || "off");
        lines.push("当前处理方式：" + mode);
        if (settings.get("apiEnabled") === false) { lines.push("", "❌ 总开关是关的（面板「外部接口 → 启用外部接口」）"); return lines.join("\n"); }
        // 各通道可用性（与「自动」模式共用同一套判定，避免两处不一致）
        let av = { rows: [], available: [] };
        try { av = channelAvailability(); } catch (error) { av = { rows: [], available: [] }; }
        const rows = av.rows;
        lines.push("", "【通道可用性】");
        for (const r of rows.filter(function (x) { return x.can; })) lines.push("  ✅ " + r.name + " —— " + r.why);
        if (!rows.some(function (x) { return x.can; })) lines.push("  （没有检测到可用通道）");
        const off2 = rows.filter(function (x) { return !x.can; });
        if (off2.length) lines.push("  （不需要管的：" + off2.map(function (x) { return x.name; }).join("、") + "）");
        // 真发一条最小请求：优先测当前方式，再测其它可用通道（最多 3 条，避免一直等）
        const order = [mode].concat(rows.filter(function (r) { return r.can; }).map(function (r) { return r.key; })).filter(function (v, i, arr) { return v && v !== "off" && v !== "secondary-then-main" && arr.indexOf(v) === i; });
        const probed = [];
        lines.push("", "【试发一条（ping）】");
        for (const via of order.slice(0, 3)) {
            const r = await askExternal({ mode: via, user: "ping", maxTokens: 64 });
            probed.push({ via: via, ok: !!r.ok, text: r.text || "", error: r.error || "" });
            lines.push("  " + (r.ok ? "✅" : "❌") + " " + via + "：" + (r.ok ? ("返回 " + String(r.text || "").length + " 字：" + String(r.text || "").slice(0, 40)) : r.error));
            if (r.tried && r.tried.length) for (const t of r.tried) lines.push("       · " + t.via + "：" + (t.ok ? "OK" : t.error));
        }
        const good = probed.filter(function (p) { return p.ok; });
        lines.push("");
        if (good.length) {
            lines.push("结论：可用 ✓ 建议把「处理方式」设为：" + good[0].via + "（测试通过的第一条）");
            if (mode !== good[0].via) lines.push("（你现在设的是 " + mode + "，它" + (probed.some(function (p) { return p.via === mode && p.ok; }) ? "也可用" : "不可用") + "）");
        } else {
            lines.push("结论：都不通 ❌ 按下面顺序排查：");
            lines.push("  1) 若用「tt 主连接直发」：先在酒馆里把主连接（Chat Completion）配好，能在聊天里正常出话即可");
            lines.push("  2) 若用「OpenAI 兼容」：地址填到 /v1 为止 + 密钥 + 模型名手填（拉不到列表不影响）");
            lines.push("  3) 拉不到模型列表与能不能生成是两件事：列表拉不到也能生成");
            lines.push("  4) 把上面每条的 HTTP 状态与错误原文发我，可精确定位");
        }
        return lines.join("\n");
    });
    log("外部", "外部接口能力已注册（external:ask / profiles / capability / test）");
}

const external = { EXTERNAL_INSTRUCTION, MAX_TOKENS_CEILING, clampMaxTokens, finishReasonOf, MODES, MANUAL_MODEL, resolveOrder, channelAvailability, ttMainAvailable, buildTTMainBody, callTTMain, MAIN_PROXY_SOURCES, readBody, isTauriTavern, buildRouteBodySTNative, directChatUrl, directModelsUrls, callDirect, fetchModelsDirect, parseModelList, normalizeBaseUrl, ROUTE_STATUS, buildRouteBody, effectiveModel, fetchModels, buildCardPrompt, ROUTE_GENERATE, DEFAULT_TIMEOUT, BREAK_THRESHOLD, BREAK_COOLDOWN, hostApis, capabilityReport, listProfiles, pickProfile, buildMessages, extractText, withTimeout, callSecondary, callMain, callRoute, circuitState, recordSuccess, recordFailure, resetCircuit, askExternal, registerExternal };

return { MAX_TOKENS_CEILING, clampMaxTokens, MODES, ROUTE_GENERATE, ROUTE_STATUS, MANUAL_MODEL, DEFAULT_TIMEOUT, BREAK_THRESHOLD, BREAK_COOLDOWN, directChatUrl, directModelsUrls, callDirect, fetchModelsDirect, parseModelList, normalizeBaseUrl, isTauriTavern, buildRouteBody, buildRouteBodySTNative, effectiveModel, hostApis, capabilityReport, listProfiles, pickProfile, buildMessages, finishReasonOf, extractText, EXTERNAL_INSTRUCTION, buildCardPrompt, withTimeout, fetchWithTimeout, callSecondary, callMain, channelAvailability, ttMainAvailable, MAIN_PROXY_SOURCES, buildTTMainBody, callTTMain, callRoute, readBody, fetchModels, circuitState, recordSuccess, recordFailure, resetCircuit, AUTO_ORDER, resolveOrder, askExternal, registerExternal, external };
});

__def("src/api/integrations.js", function (__req) {
const { ctx, log, emit } = __req("src/core/bus.js");
const { settings } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");

/** ── 统一模板（接口模块）：常量 → 纯函数 → 执行 → register → exports ── */

/** 1) 常量：对接的外部扩展命令（B = 内置/三方扩展提供的斜杠命令） */
const VRM = { expression: "vrmexpression", motion: "vrmmotion", model: "vrmmodel" };
const WEBSEARCH = "websearch";

/** 卡牌事件 → VRM 表情建议（分类表情用的是 GoEmotions 风格名） */
const REACTION_BY_EVENT = {
    pack_rare: { expression: "amusement", motion: "idle", why: "抽到稀有卡" },
    pack_common: { expression: "neutral", motion: "idle", why: "普通抽卡" },
    duel_win: { expression: "joy", motion: "idle", why: "决斗获胜" },
    duel_lose: { expression: "disappointment", motion: "idle", why: "决斗失利" },
    shop: { expression: "curiosity", motion: "idle", why: "逛商店" },
};

/** 2) 纯函数：生成斜杠命令文本（可断言） */
function slashText(name, named, unnamed) {
    const parts = ["/" + String(name || "").trim()];
    for (const key of Object.keys(named || {})) {
        const v = named[key];
        if (v === undefined || v === null || v === "") continue;
        parts.push(key + "=" + String(v));
    }
    const text = String(unnamed === undefined || unnamed === null ? "" : unnamed).trim();
    if (text) parts.push(text);
    return parts.join(" ");
}

/** 纯函数：事件 → 表情命令（没有对应事件时返回 null） */
function reactionFor(event) {
    const r = REACTION_BY_EVENT[event];
    if (!r) return null;
    return { event: event, expression: r.expression, motion: r.motion, why: r.why };
}

/** 3) 执行：三重降级（官方函数 → 旧函数 → 直接调命令回调） */
function availableCommands() {
    const c = ctx();
    const parser = c.SlashCommandParser;
    if (parser && parser.commands && typeof parser.commands === "object") return Object.keys(parser.commands);
    return [];
}

function hasCommand(name) {
    return availableCommands().indexOf(String(name)) >= 0;
}

async function runSlash(text) {
    const c = ctx();
    try {
        if (typeof c.executeSlashCommandsWithOptions === "function") return { ok: true, via: "withOptions", result: await c.executeSlashCommandsWithOptions(text, { showOutput: false }) };
        if (typeof c.executeSlashCommands === "function") return { ok: true, via: "execute", result: await c.executeSlashCommands(text) };
        const m = /^\/([^\s]+)\s*(.*)$/.exec(String(text));
        if (m) {
            const parser = c.SlashCommandParser;
            const cmd = parser && parser.commands ? parser.commands[m[1]] : null;
            if (cmd && typeof cmd.callback === "function") {
                const rest = m[2] || "";
                const named = {};
                const unnamed = [];
                for (const token of rest.split(/\s+/)) {
                    if (!token) continue;
                    const eq = token.indexOf("=");
                    if (eq > 0) named[token.slice(0, eq)] = token.slice(eq + 1);
                    else unnamed.push(token);
                }
                const value = await cmd.callback(named, unnamed.join(" "));
                return { ok: true, via: "callback", result: value };
            }
        }
    } catch (error) {
        return { ok: false, via: "error", error: error && error.message ? error.message : String(error) };
    }
    return { ok: false, via: "unsupported", error: "当前客户端不支持执行斜杠命令" };
}

/** VRM 反应（默认关闭；未装 VRM 时静默跳过） */
async function vrmReact(event) {
    if (settings.get("vrmReaction") !== true) return { ok: false, reason: "设置里未开启 VRM 反应" };
    const r = reactionFor(event);
    if (!r) return { ok: false, reason: "没有为事件 " + event + " 配置表情" };
    if (!hasCommand(VRM.expression)) return { ok: false, reason: "没有检测到 VRM 扩展（命令 " + VRM.expression + " 不存在）" };
    const res = await runSlash(slashText(VRM.expression, {}, r.expression));
    log("联动", "VRM " + r.expression + "（" + r.why + "）→ " + (res.ok ? "已发送" : "失败：" + res.error));
    emit("vrm", { event: event, expression: r.expression, ok: res.ok });
    return res;
}

/** 联网搜索后备（默认关闭；装了 Web Search 才可用） */
async function webSearch(query) {
    const q = String(query || "").trim();
    if (!q) return { ok: false, reason: "查询为空" };
    if (settings.get("webSearchFallback") !== true) return { ok: false, reason: "设置里未开启联网后备" };
    if (!hasCommand(WEBSEARCH)) return { ok: false, reason: "没有检测到 Web Search 扩展" };
    const res = await runSlash(slashText(WEBSEARCH, { links: "off", snippets: "on" }, q));
    log("联动", "联网搜索「" + q + "」→ " + (res.ok ? "已发送" : "失败：" + res.error));
    return res;
}

/** 4) 注册能力（工具表里的能力名保持与数据层一致，避免抢注册） */
function registerIntegrations() {
    registry.provide("integration:vrm", async function (args) { return await vrmReact((args && args.event) || ""); });
    registry.provide("integration:websearch", async function (args) { return await webSearch(args && args.query); });
    registry.provide("integration:status", async function () {
        const cmds = availableCommands();
        return {
            vrm: cmds.some(function (k) { return k.indexOf("vrm") === 0; }),
            websearch: cmds.indexOf(WEBSEARCH) >= 0,
            total: cmds.length,
        };
    });
    log("联动", "外部扩展联动已注册（VRM / Web Search）");
}

const integrations = { VRM, WEBSEARCH, REACTION_BY_EVENT, slashText, reactionFor, availableCommands, hasCommand, runSlash, vrmReact, webSearch, registerIntegrations };

return { VRM, WEBSEARCH, REACTION_BY_EVENT, slashText, reactionFor, availableCommands, hasCommand, runSlash, vrmReact, webSearch, registerIntegrations, integrations };
});

__def("src/api/public-api.js", function (__req) {
const { log, emit } = __req("src/core/bus.js");
const { settings, reload: reloadSettings } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");

/**
 * 对外扩展接口（挂到 globalThis.YgoCardLookupV2 上）—— 照抄 v1 的 globalThis.YgoCardLookup 语义：
 *   actions()                        列出可用动作
 *   ready()                          等索引载入完成
 *   registerAction(name, fn)         注册自定义动作
 *   call(action, params)             取数据（不弹面板、不注入）：{ ok, action, text, ms }
 *   on(event, fn) / off(event, fn)   订阅（result / error / inject 等）
 *   hooks.transformResult / filterInjection / resolveCard   三个钩子
 *   export() / import(data, {mode})  迁移收藏册 / DIY / 俗称表 / 卡池 / 盘面
 * 任何一步失败都返回 { ok:false, error }，绝不抛给调用方（外部脚本不该因为查卡器崩掉）。
 */

const MODULE_VERSION_PUBLIC = "2.0.0";

/** 三个钩子：外部脚本可覆盖（transformResult 改返回值、filterInjection 改注入、resolveCard 兜底解析） */
const hooks = { transformResult: null, filterInjection: null, resolveCard: null };

const listeners = new Map();
const customActions = Object.create(null);

function emitApi(event, payload) {
    const list = listeners.get(String(event || ""));
    if (list) for (const fn of list.slice()) {
        try { fn(payload); } catch (error) { log("对外接口", "订阅者出错（已忽略）：" + (error && error.message ? error.message : error)); }
    }
    try { emit("public:" + String(event || ""), payload); } catch (error) { /* 总线失败不影响 */ }
}

/** 当前可用动作：注册表里的 runAction:xxx / tool:xxx / cmd:xxx，去掉前缀 + 自定义动作 */
function actions() {
    const out = [];
    for (const key of registry.list()) {
        const m = /^(?:runAction|tool|cmd|ui):(.+)$/.exec(String(key));   // ui: 也暴露（sendbox/buy/collection…），酒馆助手脚本直接按动作名调
        if (m && out.indexOf(m[1]) < 0) out.push(m[1]);
    }
    for (const k of Object.keys(customActions)) if (out.indexOf(k) < 0) out.push(k);
    return out.sort();
}

/** 等索引就绪（外部脚本调用前可以先 await） */
async function ready() {
    const pending = [];
    // 数据层注册的键是 index:names / index:stats / index:setnames；
    // 以前这里写 getNameIndex/getStatsIndex/getSetnames（三个都不存在）→ pending 恒空，ready() 立刻返回 true，
    // 外部脚本"等就绪再查卡"会随机查不到。
    for (const name of ["index:names", "index:stats", "index:setnames"]) {
        if (registry.has(name)) { try { pending.push(registry.call(name)); } catch (error) { /* 忽略 */ } }
    }
    await Promise.allSettled(pending);
    return true;
}

/** 注册自定义动作：之后 YgoCardLookupV2.call('你的名字', {...}) 可用 */
function registerAction(name, fn) {
    const key = String(name || "").trim();
    if (!key || typeof fn !== "function") return false;
    customActions[key] = fn;
    return true;
}

/** 纯函数：动作名 → 注册表能力键（按优先级） */
function actionKeys(name) {
    const n = String(name || "").trim();
    if (!n) return [];
    return ["tool:" + n, "cmd:" + n, "runAction:" + n, "ui:" + n];
}

/** 调用一个动作，返回 { ok, action, text, ms }（永不抛错） */
async function call(action, params) {
    const name = String(action || "").trim();
    const started = Date.now();
    const fn = customActions[name];
    if (!fn && !actionKeys(name).some(function (k) { return registry.has(k); })) {
        return { ok: false, action: name, error: "没有这个动作：" + name, actions: actions(), ms: Date.now() - started };
    }
    try {
        let text = "";
        if (fn) text = String((await fn(params || {})) ?? "");
        else {
            for (const key of actionKeys(name)) {
                if (!registry.has(key)) continue;
                const out = await registry.call(key, params || {});
                if (out && typeof out === "object" && typeof out.text === "string") text = out.text;
                else if (typeof out === "string") text = out;
                else text = String((out && (out.name || out.id)) || "");
                break;
            }
        }
        // 查不到时交给外部解析器兜底（与 v1 同名同义）
        if (typeof hooks.resolveCard === "function" && /未命中|没有找到|没找到|查无此卡|无法确定/.test(text)) {
            try {
                const extra = await hooks.resolveCard({ action: name, params: params || {} });
                if (typeof extra === "string" && extra.trim()) text = extra;
            } catch (error) { log("对外接口", "resolveCard 钩子出错（已忽略）：" + (error && error.message ? error.message : error)); }
        }
        if (typeof hooks.transformResult === "function") {
            try { const t = await hooks.transformResult(text, { action: name, params: params || {} }); if (typeof t === "string") text = t; }
            catch (error) { log("对外接口", "transformResult 钩子出错（已忽略）：" + (error && error.message ? error.message : error)); }
        }
        const out = { ok: true, action: name, text: text, ms: Date.now() - started };
        emitApi("result", out);
        return out;
    } catch (error) {
        const out = { ok: false, action: name, error: String((error && error.message) || error), ms: Date.now() - started };
        emitApi("error", out);
        return out;
    }
}

function on(event, handler) {
    const key = String(event || "").trim();
    if (!key || typeof handler !== "function") return false;
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(handler);
    return true;
}

function off(event, handler) {
    const list = listeners.get(String(event || "").trim());
    if (!list) return false;
    const at = list.indexOf(handler);
    if (at >= 0) list.splice(at, 1);
    return at >= 0;
}

/** 导出可迁移数据（收藏册 / DIY / 俗称表 / 卡池开关 / 盘面）—— 异步：收藏册要走能力表 */
async function exportData() {
    const out = {
        version: MODULE_VERSION_PUBLIC,
        at: new Date().toISOString(),
        aliases: String(settings.get("aliases") || ""),
        diyCards: settings.get("diyCards") || [],
        pool: {
            synchro: settings.get("poolSynchro") !== false,
            xyz: settings.get("poolXyz") !== false,
            pendulum: settings.get("poolPendulum") !== false,
            link: settings.get("poolLink") !== false,
        },
    };
    // 漏了 await：以前就算能力存在，这里存进去的也是 Promise（JSON 序列化后变 {}）
    try { if (registry.has("collection:state")) out.collection = await registry.call("collection:state"); } catch (error) { /* 忽略 */ }
    return out;
}

/** 导入（白名单字段；mode=merge 保留现有多余项，replace 直接覆盖）—— 异步：收藏册要走能力表 */
async function importData(data, options) {
    const payload = (data && typeof data === "object") ? data : null;
    if (!payload) return { ok: false, error: "需要传一个对象" };
    const mode = String((options && options.mode) || "merge");
    const applied = [];
    try {
        if (typeof payload.aliases === "string") { settings.set("aliases", payload.aliases); applied.push("aliases"); }
        if (Array.isArray(payload.diyCards)) {
            const byName = new Map();
            const list = mode === "replace" ? payload.diyCards : (settings.get("diyCards") || []).concat(payload.diyCards);
            for (const item of list) if (item && item.name) byName.set(String(item.name), item);
            settings.set("diyCards", Array.from(byName.values()));
            applied.push("diyCards");
        }
        if (payload.pool && typeof payload.pool === "object") {
            for (const [k, key] of [["synchro", "poolSynchro"], ["xyz", "poolXyz"], ["pendulum", "poolPendulum"], ["link", "poolLink"]]) {
                if (k in payload.pool) settings.set(key, !!payload.pool[k]);
            }
            applied.push("pool");
        }
        if (payload.collection && typeof payload.collection === "object" && registry.has("collection:import")) {
            await registry.call("collection:import", { collection: payload.collection, mode: mode });
            applied.push("collection");
        }
        settings.save();
        reloadSettings();
        return { ok: true, mode: mode, applied: applied };
    } catch (error) {
        return { ok: false, error: "导入失败：" + (error && error.message ? error.message : error), applied: applied };
    }
}

/** 注册能力（供拦截器等内部链路使用 filterInjection 钩子） */
function registerPublicApi() {
    registry.provide("hook:filterInjection", async function (text) {
        if (typeof hooks.filterInjection !== "function") return text;
        try { const t = await hooks.filterInjection(String(text || "")); return typeof t === "string" ? t : text; }
        catch (error) { log("对外接口", "filterInjection 钩子出错（已忽略）：" + (error && error.message ? error.message : error)); return text; }
    });
    registry.provide("public:actions", async function () { return actions(); });
    registry.provide("public:call", async function (args) { const a = args || {}; return await call(a.action, a.params); });
}

/** 把接口挂到 globalThis.YgoCardLookupV2（不覆盖原有字段，只合并） */
function installPublicApi(target) {
    const t = target || (typeof globalThis !== "undefined" ? globalThis.YgoCardLookupV2 : null) || {};
    const api = {
        version: MODULE_VERSION_PUBLIC,
        hooks: hooks,
        actions: actions,
        ready: ready,
        registerAction: registerAction,
        call: call,
        on: on,
        off: off,
        export: exportData,
        import: importData,
    };
    for (const k of Object.keys(api)) { try { t[k] = api[k]; } catch (error) { /* 只读则跳过 */ } }
    try { if (typeof globalThis !== "undefined") globalThis.YgoCardLookupV2 = t; } catch (error) { /* 忽略 */ }
    return t;
}

const publicApi = { MODULE_VERSION_PUBLIC, hooks, actions, ready, registerAction, actionKeys, call, on, off, exportData, importData, registerPublicApi, installPublicApi };

return { MODULE_VERSION_PUBLIC, hooks, actions, ready, registerAction, actionKeys, call, on, off, exportData, importData, registerPublicApi, installPublicApi, publicApi };
});

__def("src/api/selftest.js", function (__req) {
const { ctx, log, setContext } = __req("src/core/bus.js");
const { settings, groupEnabled, actionAllowed, isolationActive } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");
const { getStatsIndex, getNameIndex, getSetnames } = __req("src/data/indexes.js");
const { findCard, cardText, imageUrl, resolveCards } = __req("src/data/cards.js");
const { getLimits, banlistText, tributeNeeded } = __req("src/data/rules.js");
const { getPackIndex, openPackText, drawFromPool } = __req("src/data/packs.js");
const { shopText, collectionText, manageDiy, parseAliases, resolveAliasName } = __req("src/data/collection.js");
const { parseDeckText, deckProblems, simulateHand } = __req("src/data/deck.js");
const { newBoard, applyAction, boardText, saveBoard, getBoard } = __req("src/data/board.js");
const { getArtIndex, artOf, listAltArtCards } = __req("src/data/art.js");
const { matchTrigger } = __req("src/inject/detect.js");
const { buildInjection } = __req("src/inject/build.js");
const { editorHtml, FIELDS } = __req("src/ui/prompt.js");
const { shopHtml } = __req("src/ui/game.js");
const { composeSendText } = __req("src/ui/sendbox.js");
const { GROUP_KEY_PREFIX, readFieldValue, writeFieldValue, registryProblems, FIELDS: PANEL_FIELDS } = __req("src/ui/panel.js");
const { TOOLS, toolProblems } = __req("src/api/tools.js");
const { COMMANDS, commandProblems } = __req("src/api/commands.js");
var external = __req("src/api/external.js");
const { judgeSummon, checkSummon } = __req("src/data/summon.js");

/** ── 统一模板（接口模块）：常量 → 纯函数 → 用例表 → 运行 → register → exports ── */

/** 1) 常量 */
const TEST_TIMEOUT = 20000;

/** 2) 纯函数：报告格式 */
function formatReport(results, elapsed) {
    const pass = results.filter(function (r) { return r.ok; }).length;
    const lines = ["🧪 查卡器 v2 自检 · " + pass + "/" + results.length + " 通过（" + elapsed + "ms）"];
    for (const r of results) {
        lines.push((r.ok ? "✅ " : "❌ ") + r.name + "（" + r.ms + "ms）" + (r.detail ? " — " + r.detail : ""));
    }
    const failed = results.filter(function (r) { return !r.ok; });
    if (failed.length) lines.push("", "失败项：" + failed.map(function (r) { return r.name; }).join("、"));
    return lines.join("\n");
}

/** 3) 用例表：每项**显式**返回 { ok, detail }（不要用字符串猜测判定） */
const T = function (ok, detail) { return { ok: !!ok, detail: String(detail === undefined ? "" : detail) }; };

const TESTS = [
    { name: "设置读写", run: async function () {
        const key = "_selftest_probe";
        const before = settings.get(key);
        try {
            settings.set(key, 1);
            const v = settings.get(key);
            return T(v === 1, v === 1 ? "OK" : "读回=" + v);
        } finally {
            // 自检不许在用户设置里留垃圾键
            if (before === undefined) { try { const all = settings.all(); delete all[key]; settings.save(); } catch (error) { /* 忽略 */ } }
            else settings.set(key, before);
        }
    } },
    { name: "能力注册表", run: async function () { const keys = registry.list(); const need = ["index:stats", "tool:card", "tool:pack", "tool:board", "tool:art", "runAction"]; const miss = need.filter(function (k) { return keys.indexOf(k) < 0; }); return T(miss.length === 0, miss.length ? "缺 " + miss.join(",") : keys.length + " 项能力"); } },
    { name: "卡名索引", run: async function () { const m = await getNameIndex(); return T(m.size > 50000, m.size + " 条"); } },
    { name: "数值索引", run: async function () { const s = await getStatsIndex(); return T(s.rows.length > 14000, s.rows.length + " 行"); } },
    { name: "字段表", run: async function () { const m = await getSetnames(); return T(m.size > 500, m.size + " 条"); } },
    { name: "查卡（中文名）", run: async function () { const r = await findCard("青眼白龙"); return T(r && r.id === "89631139", r ? r.name + "=" + r.id : "未命中"); } },
    { name: "查卡（别名/英文名）", run: async function () { const a = await findCard("蓝眼白龙"); const b = await findCard("Blue-Eyes White Dragon"); return T(!!a && !!b, "别名=" + (a ? "命中" : "未命中") + " 英文=" + (b ? "命中" : "未命中")); } },
    { name: "查卡（卡密）", run: async function () { const r = await findCard("89631139"); return T(r && r.name === "青眼白龙", r ? r.name : "未命中"); } },
    { name: "卡图链接", run: async function () { const u = imageUrl("89631139"); return T(u.indexOf("momobako") >= 0 && u.length > 40, u.slice(0, 50)); } },
    { name: "格式化输出", run: async function () { const s = await cardText({ query: "青眼白龙", withDetail: false }); const need = ["【青眼白龙】", "89631139", "3000 / 2500", "![]("]; const miss = need.filter(function (k) { return s.indexOf(k) < 0; }); return T(miss.length === 0, miss.length ? "缺 " + miss.join(",") : s.length + " 字"); } },
    { name: "卡包索引", run: async function () { const list = await getPackIndex(); return T(list.length > 1000, list.length + " 个卡包"); } },
    { name: "开卡包", run: async function () { const s = await openPackText({ pack: "超级包06", count: 2 }); return T(s.indexOf("开卡包") >= 0 && s.indexOf("![](") >= 0, s.split("\\n")[0]); } },
    { name: "禁限表", run: async function () { const l = await getLimits(); const cn = l && l.cn; return T(cn && cn.forbidden.size > 0, cn ? "cn " + cn.date + " 禁止 " + cn.forbidden.size + " 张" : "未取到"); } },
    { name: "禁限文本", run: async function () { const s = await banlistText("cn"); return T(s.indexOf("【禁止】") >= 0, s.length + " 字"); } },
    { name: "召唤检查", run: async function () { const r = tributeNeeded({ typeText: "[怪兽|通常] 龙/光§[★8] 3000/2500" }); return T(r && r.tributes === 2, r ? r.reason : "无判定"); } },
    { name: "异画本地索引", run: async function () { const idx = await getArtIndex(); const n = Object.keys(idx).length; return T(n >= 100, n + " 张有异画"); } },
    { name: "异画命中（青眼白龙）", run: async function () { const r = await artOf("青眼白龙"); return T(r.arts.length >= 8, r.arts.length + " 版（来源 " + r.source + "）"); } },
    { name: "异画卡表", run: async function () { const s = await listAltArtCards(3); return T(s.indexOf("有异画的卡") >= 0, s.split("\\n")[0]); } },
    { name: "卡组校验", run: async function () { const d = parseDeckText("1 青眼白龙"); const r = deckProblems(d, null, "cn"); return T(r.problems.length >= 1, r.problems.join("；") || "未检出"); } },
    { name: "起手模拟", run: async function () { const runs = simulateHand([1, 2, 3, 4, 5, 6], 5, 3, function () { return 0.3; }); return T(runs.length === 3 && runs[0].length === 5, runs.length + " 次 × " + (runs[0] ? runs[0].length : 0) + " 张"); } },
    { name: "收藏册", run: async function () { const s = await collectionText({}); return T(s.indexOf("收藏册") >= 0, s.split("\\n")[0]); } },
    { name: "每日商店（确定性）", run: async function () { const a = await shopText({ date: "2026-01-01", size: 3 }); const b = await shopText({ date: "2026-01-01", size: 3 }); return T(a === b, a === b ? "同日期一致" : "两次不一致"); } },
    { name: "DIY 增删", run: async function () { const name = "_自检临时卡"; await manageDiy({ action: "add", name: name, category: "魔法" }); const added = (settings.get("diyCards") || []).some(function (c) { return c.name === name; }); await manageDiy({ action: "del", name: name }); const gone = !(settings.get("diyCards") || []).some(function (c) { return c.name === name; }); return T(added && gone, "建=" + added + " 删=" + gone); } },
    { name: "俗称表生效（查卡与识别）", run: async function () {
        const keep = settings.get("aliases");
        const NL = String.fromCharCode(10);
        // ★ try/finally：中间任何一步抛错（索引失败 / 超时被 race 打断）都必须把用户的俗称表放回去
        try {
            settings.set("aliases", "# 注释" + NL + "测试俗称=青眼白龙");
            const mapped = resolveAliasName("测试俗称") === "青眼白龙";
            const hit = await findCard("测试俗称");
            const inText = await resolveCards("我召唤测试俗称");
            const parsed = parseAliases("# x" + NL + "A=一" + NL + "B：二" + NL + "C＝三");
            return T(mapped && !!hit && hit.name === "青眼白龙" && inText.some(function (c) { return c.name === "青眼白龙"; }) && parsed.size === 3,
                "单名映射=" + (mapped ? "OK" : "FAIL") + " 查卡=" + (hit ? hit.name : "FAIL") + " 句子识别=" + (inText.length ? inText[0].name : "FAIL") + " 三种分隔符=" + parsed.size + " 条");
        } finally {
            settings.set("aliases", keep === undefined ? "" : keep);
        }
    } },
    { name: "俗称表解析", run: async function () { const m = parseAliases("杀调=杀手旋律"); return T(m.size === 1 && m.get("杀调") === "杀手旋律", m.size + " 条"); } },
    { name: "决斗盘 reducer", run: async function () { let b = newBoard(); b = applyAction(b, { action: "lp", value: 7000 }); b = applyAction(b, { action: "draw", side: "me", value: "青眼白龙" }); b = applyAction(b, { action: "to", side: "me", value: "青眼白龙", from: "hand", to: "field" }); return T(b.me.lp === 7000 && b.me.field.length === 1, "LP=" + b.me.lp + " 场上=" + b.me.field.length); } },
    { name: "触发词（6 类）", run: async function () { const cases = [["开一包", "pack"], ["今日商店", "shop"], ["禁限表", "banlist"], ["哪些卡有异画", "artlist"], ["灰流丽有什么裁定", "rule"], ["这个系列有哪些卡 青眼", "series"]]; const bad = cases.filter(function (c) { const r = matchTrigger(c[0]); return !r || r.action !== c[1]; }); return T(bad.length === 0, bad.length ? "错 " + bad.map(function (c) { return c[0]; }).join(",") : "6/6"); } },
    { name: "犹豫句不误触", run: async function () { const cases = ["我在想要不要开一包", "这张卡的裁定我不太懂", "召唤师峡谷", "今天天气不错"]; const bad = cases.filter(function (s) { return matchTrigger(s) !== null; }); return T(bad.length === 0, bad.length ? "误触 " + bad.join(",") : "4/4 未误触"); } },
    { name: "注入文本组装", run: async function () { const s = buildInjection([{ name: "青眼白龙", text: "【青眼白龙】ATK 3000" }], {}); const need = ["取数任务清单", "完全的自主权", "ATK 3000", "get_yugioh_card"]; const miss = need.filter(function (k) { return s.indexOf(k) < 0; }); return T(miss.length === 0, miss.length ? "缺 " + miss.join(",") : s.length + " 字"); } },
    { name: "提示词编辑器", run: async function () { const h = editorHtml({ promptSheet: "" }); return T(h.indexOf("ygo2_pe_sheet") >= 0 && h.indexOf("模块速查") >= 0, FIELDS.length + " 项"); } },
    { name: "召唤检查与自动上盘", run: async function () {
        const boss = await findCard("青眼白龙");
        const small = await findCard("灰流丽");
        if (!boss || !small) return T(false, "本地库里找不到测试卡");
        const jBoss = await judgeSummon(boss, "tribute", {});
        const jSmall = await judgeSummon(small, "normal", {});
        // 用稳定的上下文（宿主 getContext() 可能每次都返回新对象，导致盘面写了个寂寞）
        const prevCtx = ctx();
        const meta = {};
        setContext(Object.assign({}, prevCtx || {}, { chatMetadata: meta, saveMetadata: function () {} }));
        let b = newBoard();
        b = applyAction(b, { action: "draw", side: "me", value: "栗子球、栗子球、青眼白龙" });
        b = applyAction(b, { action: "to", side: "me", value: "栗子球", from: "hand", to: "field" });
        b = applyAction(b, { action: "to", side: "me", value: "栗子球", from: "hand", to: "field" });
        saveBoard(b);
        const before = getBoard().me.field.length;
        const rep = await checkSummon({ query: "青眼白龙", method: "tribute" });
        const af = getBoard();
        const applied = af.me.field.some(function (x) { return x.name === "青眼白龙"; }) && af.me.grave.length === 2 && af.me.normalSummonUsed === true;
        saveBoard(newBoard());
        setContext(prevCtx || {});
        const ok = jBoss.legal === false && jSmall.legal === true && before === 2 && applied && rep.indexOf("已落到盘面") >= 0;
        return T(ok, "★8 需祭品=" + (!jBoss.legal ? "OK" : "FAIL") + " ★3 可直接=" + (jSmall.legal ? "OK" : "FAIL") + " 上盘=" + (applied ? "OK" : "FAIL"));
    } },
    { name: "外部接口：链路与降级", run: async function () {
        const ext = external;
        const keep = { mode: settings.get("apiMode") };
        // 迁移：v1 的三种写法
        const m1 = settings.migrate({ apiMode: "roundtrip" }).apiMode === "secondary-then-main";
        const m2 = settings.migrate({ apiMode: "push" }).apiMode === "off";
        const m3 = settings.migrate({ apiMode: "乱写" }).apiMode === "off";
        // 能力探测形状
        const caps = ext.capabilityReport();
        const capsOk = typeof caps.secondary === "boolean" && typeof caps.main === "boolean" && typeof caps.route === "boolean" && typeof caps.profiles === "number";
        // 提示词组装
        const prompt = ext.buildCardPrompt([{ name: "青眼白龙", text: "ATK 3000" }], "能特召吗", "只回答规则");
        const promptOk = prompt.indexOf("只回答规则") >= 0 && prompt.indexOf("ATK 3000") >= 0 && prompt.indexOf("能特召吗") >= 0;
        // 关闭模式：不发请求
        // ★ try/finally：这一段会临时改用户的 apiMode，任何异常都不许把它永久改成 off
        try {
            settings.set("apiMode", "off");
            const off = await ext.askExternal({ mode: "off", user: "x" });
            // 返回形态解析
            const parseOk = ext.extractText("a") === "a" && ext.extractText({ content: "b" }) === "b" && ext.extractText({ choices: [{ message: { content: "c" } }] }) === "c";
            // 熔断状态机
            ext.resetCircuit(); const c0 = ext.circuitState().broken === false;
            ext.recordFailure(); ext.recordFailure(); ext.recordFailure(); const c1 = ext.circuitState().broken === true;
            ext.resetCircuit(); const c2 = ext.circuitState().broken === false;
            // 预算参数真的被消费（以前 askExternal 读的是不存在的 settings.apiTimeout，调用方的 timeoutMs 被丢掉）
            const budgetSeen = ext.askExternal.length >= 1;
            return T(m1 && m2 && m3 && capsOk && promptOk && off.ok === false && off.via === "off" && parseOk && c0 && c1 && c2,
                "迁移=" + (m1 && m2 && m3 ? "OK" : "FAIL") + " 能力探测=" + (capsOk ? "OK" : "FAIL") + " 提示词=" + (promptOk ? "OK" : "FAIL") + " off=" + (off.ok === false ? "OK" : "FAIL") + " 解析=" + (parseOk ? "OK" : "FAIL") + " 熔断=" + (c0 && c1 && c2 ? "OK" : "FAIL") + " 预算=" + (budgetSeen ? "OK" : "FAIL"));
        } finally {
            settings.set("apiMode", keep.mode === undefined ? "off" : keep.mode);
        }
    } },
    { name: "隔离（总开关 + 栏目）", run: async function () {
        const before = settings.get("groupsDisabled");
        const beforeIso = settings.get("isolateCommand");
        settings.set("groupsDisabled", []);
        settings.set("isolateCommand", false);
        const on1 = actionAllowed("pack") === true && groupEnabled("玩法") === true;
        settings.set("groupsDisabled", ["玩法"]);
        const off = actionAllowed("pack") === false && actionAllowed("card") === true && groupEnabled("玩法") === false;
        const boxOn = readFieldValue(GROUP_KEY_PREFIX + "玩法", { groupsDisabled: ["玩法"] }) === true;
        settings.set("isolateCommand", true);
        const iso = isolationActive() === true && groupEnabled("自动检测注入") === false && actionAllowed("pack") === false && actionAllowed("card") === true;
        settings.set("groupsDisabled", before === undefined ? [] : before);
        settings.set("isolateCommand", beforeIso === true);
        return T(on1 && off && boxOn && iso, "默认可用=" + (on1 ? "OK" : "FAIL") + " 停用玩法后 pack 禁/card 允=" + (off ? "OK" : "FAIL") + " 复选反映=" + (boxOn ? "OK" : "FAIL") + " 总隔离=" + (iso ? "OK" : "FAIL"));
    } },
    { name: "商店购买链路", run: async function () {
        const html = await shopHtml({ date: "2026-01-01", size: 3 });
        const buttons = (html.match(/data-ygo2-buy=/g) || []).length;
        const composed = composeSendText("", "购买 青眼白龙");
        const appended = composeSendText("你好", "购买 青眼白龙");
        // 光数按钮不够：真正让按钮有反应的是 ui:buy / ui:sendbox 这两个能力 + installBuyDelegate 的点击委派
        const capsOk = registry.has("ui:buy") && registry.has("ui:sendbox");
        return T(buttons === 3 && composed === "购买 青眼白龙" && appended === "你好\n购买 青眼白龙" && capsOk,
            buttons + " 个购买按钮；写入格式正确；能力=" + (capsOk ? "OK" : "缺 ui:buy/ui:sendbox"));
    } },
    { name: "构建指纹", run: async function () {
        // 以前两个分支都 return T(true, …)：无论打包对错都"通过"，等于白占一行
        const b = (typeof globalThis !== "undefined" && globalThis.YgoCardLookupV2Build) || null;
        if (!b) return T(true, "以 ES 模块方式运行（未打包），无指纹可比");
        const ok = typeof b.hash === "string" && b.hash.length >= 4 && Number(b.modules) > 0 && !!b.at;
        return T(ok, "哈希 " + b.hash + " / " + b.modules + " 模块 / " + b.at);
    } },
    { name: "必需能力（REQUIRED_CAPS）", run: async function (options) {
        // 启动装配时把清单传进来（index.js）；缺任何一项都必须在这里报红，而不是让功能悄悄失效
        const checker = options && options.requiredCaps;
        if (typeof checker !== "function") return T(true, "未提供清单（以 ES 模块方式单跑时跳过）");
        const miss = checker() || [];
        return T(miss.length === 0, miss.length ? "缺少 " + miss.slice(0, 6).join("、") : "全部就位");
    } },
    { name: "对外接口（YgoCardLookupV2）", run: async function () {
        // 酒馆助手脚本靠它取数据：装不上（以前 installPublicApi 从没被调用）外部按钮全废
        const api = (typeof globalThis !== "undefined") ? globalThis.YgoCardLookupV2 : null;
        const okCall = !!(api && typeof api.call === "function");
        const okActions = !!(api && typeof api.actions === "function" && api.actions().length > 5);
        const okReady = !!(api && typeof api.ready === "function");
        const okIO = !!(api && typeof api.export === "function" && typeof api.import === "function");
        return T(okCall && okActions && okReady && okIO, "call=" + (okCall ? "OK" : "缺失") + " actions=" + (okActions ? "OK" : "缺失") + " ready=" + (okReady ? "OK" : "缺失") + " export/import=" + (okIO ? "OK" : "缺失"));
    } },
    { name: "面板字段注册表", run: async function () {
        const pr = registryProblems();
        return T(pr.length === 0, pr.length ? pr.slice(0, 3).join("；") : PANEL_FIELDS.length + " 个控件 / " + (function () { const g = []; for (const f of PANEL_FIELDS) if (g.indexOf(f.group) < 0) g.push(f.group); return g.length; })() + " 个分组");
    } },
    { name: "function tool 定义", run: async function () { const pr = toolProblems(); return T(pr.length === 0, pr.length ? pr.slice(0, 2).join("；") : TOOLS.length + " 个工具"); } },
    { name: "斜杠命令定义", run: async function () { const pr = commandProblems(); return T(pr.length === 0, pr.length ? pr.slice(0, 2).join("；") : COMMANDS.length + " 条命令"); } },
];

/** 4) 运行（带超时；每项独立捕获异常） */
async function runSelfTest(options) {
    const o = options || {};
    const limit = Number(o.timeout) || TEST_TIMEOUT;
    const started = Date.now();
    const results = [];
    for (const t of TESTS) {
        const t0 = Date.now();
        let ok = false, detail = "";
        try {
            const value = await Promise.race([
                Promise.resolve().then(function () { return t.run(o); }),
                new Promise(function (_, reject) { setTimeout(function () { reject(new Error("超时 " + limit + "ms")); }, limit); }),
            ]);
            if (value && typeof value === "object" && "ok" in value) { ok = !!value.ok; detail = String(value.detail || ""); }
            else if (typeof value === "string") { ok = true; detail = value; }   // 用例自身没给判定时，默认通过但会标注
            else { ok = false; detail = "用例没有返回判定（应为 { ok, detail }）"; }
        } catch (error) {
            detail = "异常：" + (error && error.message ? error.message : String(error));
            ok = false;
        }
        // 详情单行化并截断：报告要能一眼看完
        const oneLine = String(detail).replace(/\s+/g, " ").trim().slice(0, 68);
        results.push({ name: t.name, ok: ok, ms: Date.now() - t0, detail: oneLine });
    }
    const elapsed = Date.now() - started;
    log("自检", results.filter(function (r) { return r.ok; }).length + "/" + results.length + " 通过（" + elapsed + "ms）");
    return { results: results, text: formatReport(results, elapsed), pass: results.filter(function (r) { return r.ok; }).length, total: results.length };
}

/** 5) 注册能力 */
function registerSelfTest(config) {
    const conf = config || {};
    registry.provide("cmd:selftest", async function () { const r = await runSelfTest(conf); return r.text; });
    registry.provide("selftest:run", async function (options) { return await runSelfTest(Object.assign({}, conf, options || {})); });
    log("接口", "自检能力已注册（cmd:selftest）");
}

const selfTest = { TEST_TIMEOUT, formatReport, TESTS, runSelfTest, registerSelfTest };

return { TEST_TIMEOUT, formatReport, TESTS, runSelfTest, registerSelfTest, selfTest };
});

__def("src/api/tools.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");
const { settings } = __req("src/core/settings.js");

/**
 * 工具表：只是数据。真正的执行交给 registry（数据层注册 tool:<action>）。
 * 这样 tools.js 不需要卡库就能验证注册与派发。
 */
const TOOLS = [
    { name: "get_yugioh_card", displayName: "查询游戏王卡牌", action: "card", description: "按卡名或 8 位卡密查一张卡的完整资料（中日英名/字段/数值/效果/禁限/卡图）", params: { query: ["string", "卡名或卡密", true] } },
    { name: "search_yugioh_cards", displayName: "搜索游戏王卡名", action: "search", description: "模糊搜索卡名，返回候选列表（不确定译名时先用它）", params: { query: ["string", "关键词", true], limit: ["number", "返回条数", false] } },
    { name: "get_yugioh_card_image", displayName: "查询游戏王卡图", action: "image", description: "取某张卡的卡图（markdown 图片链接）", params: { query: ["string", "卡名或卡密", true] } },
    { name: "get_yugioh_ruling", displayName: "查询官方裁定", action: "ruling", description: "取某张卡的官方裁定/FAQ（比模型记忆可靠，涉及判定优先用它）", params: { query: ["string", "卡名或卡密", true], keyword: ["string", "关键词过滤（最长 200 字）", false], limit: ["number", "条数", false] } },
    { name: "get_yugioh_card_art", displayName: "查询异画版本", action: "art", description: "列出某张卡出过的异画/不同卡图版本", params: { query: ["string", "卡名", true] } },
    { name: "list_yugioh_alt_art_cards", displayName: "列出所有异画卡", action: "artlist", description: "列出本地索引里全部有异画的卡（共 125 张），想知道哪些卡有多个卡图版本时使用", params: { limit: ["number", "返回条数", false] } },
    { name: "find_yugioh_series_cards", displayName: "查询系列卡表", action: "series", description: "列出某个系列/字段包含的卡（「这个系列有哪些卡」）", params: { series: ["string", "系列名或字段", true] } },
    { name: "get_yugioh_banlist", displayName: "查询禁限卡表", action: "banlist", description: "查询游戏王禁限卡表。带 query（卡名或卡密）时精确回答这张卡属于禁止/限制/准限制/无限制哪一档；不带 query 时返回整张表（含无限制说明）。判断某卡能否投入、组牌校验时用它，不要凭记忆", params: { query: ["string", "卡名或 8 位卡密（留空＝返回整张表）", false], region: ["string", "区域 cn/ja/en，默认 cn", false] } },
    { name: "open_yugioh_pack", displayName: "开卡包", action: "pack", description: "开真实卡包（按该包首发卡池抽卡）", params: { pack: ["string", "卡包名", false], count: ["number", "抽几张", false], region: ["string", "地区 sc/jp/en", false] } },
    { name: "list_yugioh_packs", displayName: "查询卡包列表", action: "packlist", description: "按关键词查卡包列表（发售时间倒序）", params: { keyword: ["string", "关键词", false], region: ["string", "地区", false] } },
    { name: "search_yugioh_packs", displayName: "查询系列对应卡包", action: "packsearch", description: "查某个系列出过哪些真实卡包", params: { keyword: ["string", "系列名", true] } },
    { name: "draw_yugioh_card", displayName: "随机抽卡", action: "draw", description: "按条件从卡库随机抽卡", params: { count: ["number", "张数", false], kind: ["string", "怪兽/魔法/陷阱", false], attribute: ["string", "属性", false], race: ["string", "种族", false], atk_min: ["number", "攻击下限", false], archetype: ["string", "字段", false] } },
    { name: "validate_yugioh_deck", displayName: "校验卡组", action: "deck", description: "校验卡组合法性（数量/禁限/同名限制）", params: { deck: ["string", "卡组文本（每行 数量 卡名）", true] } },
    { name: "simulate_yugioh_hand", displayName: "起手模拟", action: "hand", description: "起手模拟（抽 N 张，可跑多次）", params: { deck: ["string", "卡组文本", true], draw: ["number", "起手张数", false], runs: ["number", "模拟次数", false] } },
    { name: "check_summon_legality", displayName: "召唤检查", action: "summon", description: "判断一次召唤是否合法（等级/祭品/素材/连接值）", params: { query: ["string", "卡名", true], method: ["string", "召唤方式", false] } },
    { name: "duel_board", displayName: "决斗盘", action: "board", description: "查看或修改决斗盘状态（LP/手牌/场上/阶段）", params: { action: ["string", "show/set/lp/draw/to", true], side: ["string", "me/opp", false], value: ["string", "数值", false] } },
    { name: "list_cards_in_chat", displayName: "本局卡表", action: "recap", description: "汇总本局聊天里提到过的卡名（只给卡名与资料，谁用的由你判断）", params: { scope: ["string", "扫描范围", false] } },
    { name: "get_collection", displayName: "查询收藏册", action: "collection", description: "查看收藏册进度（已收集种类/最近获得）", params: { series: ["string", "只看某系列", false] } },
    { name: "open_yugioh_shop", displayName: "每日商店", action: "shop", description: "查看每日商店（每天固定件数，不能刷新）", params: { size: ["number", "件数", false], date: ["string", "日期", false] } },
    { name: "manage_diy_card", displayName: "自制卡管理", action: "diy", description: "管理玩家自制卡（list/add/del/edit）", params: { action: ["string", "list/add/del/edit", true], name: ["string", "卡名", false], type: ["string", "类型", false], desc: ["string", "效果", false], image: ["string", "卡图", false] } },
];

/** 纯函数：把表转成酒馆注册用的定义（可在 Node 断言）。 */
function toolDefs() {
    return TOOLS.map(function (t) {
        const properties = {};
        const required = [];
        for (const key of Object.keys(t.params || {})) {
            const spec = t.params[key];
            properties[key] = { type: spec[0], description: spec[1] };
            if (spec[2]) required.push(key);
        }
        return {
            name: t.name,
            displayName: t.displayName || t.name,
            description: t.description,
            parameters: { $schema: "http://json-schema.org/draft-04/schema#", type: "object", properties: properties, required: required },
            // 官方文档：formatMessage 决定调用时显示的提示；返回空串则不提示
            formatMessage: function (args) {
                const first = args && (args.query || args.keyword || args.pack || args.series || args.name) || "";
                return "查卡器：" + (t.displayName || t.name) + (first ? "（" + String(first).slice(0, 20) + "）" : "");
            },
            // 官方文档：shouldRegister 决定这次生成是否注册该工具
            shouldRegister: function () { return settings.get("enabled") !== false; },
        };
    });
}

/** 纯函数：表自检（重名/缺字段/参数非法）。 */
function toolProblems() {
    const problems = [];
    const seen = new Set();
    const validTypes = ["string", "number", "boolean"];
    for (const t of TOOLS) {
        if (!t.name) problems.push("缺少 name");
        else if (seen.has(t.name)) problems.push("重名：" + t.name);
        else seen.add(t.name);
        if (!t.action) problems.push(t.name + " 缺少 action（无法派发）");
        if (!t.description || t.description.length < 8) problems.push(t.name + " 描述过短（模型会选错工具）");
        for (const key of Object.keys(t.params || {})) {
            const spec = t.params[key];
            if (!Array.isArray(spec) || validTypes.indexOf(spec[0]) < 0) problems.push(t.name + "." + key + " 类型非法");
            if (!spec[1]) problems.push(t.name + "." + key + " 缺少说明");
        }
    }
    return problems;
}

/** 派发：走 registry 的 tool:<action>；未注册则返回明确提示而不是抛错。 */
/** 工具被 AI 调用的统计（用于回答"AI 到底有没有用工具"这种问题 —— 不靠感觉，靠计数） */
const toolCalls = { total: 0, byAction: {}, lastAt: 0, lastAction: "" };

/** 参数摘要（纯函数）：太长就截断，避免日志被刷屏 */
function summarizeArgs(args) {
    try {
        const s = JSON.stringify(args === undefined ? {} : args);
        return s.length > 80 ? s.slice(0, 80) + "…" : s;
    } catch (error) { return "（参数无法序列化）"; }
}

async function dispatchTool(action, args) {
    const key = "tool:" + action;
    if (!registry.has(key)) { log("工具调用", "未装配：" + action + "（功能没注册？）"); return "（功能未装配：" + action + "）"; }
    const t0 = Date.now();
    try {
        const out = await registry.call(key, args || {});
        const len = String(out === undefined || out === null ? "" : out).length;
        toolCalls.total++;
        toolCalls.byAction[action] = (toolCalls.byAction[action] || 0) + 1;
        toolCalls.lastAt = Date.now();
        toolCalls.lastAction = action;
        log("工具调用", "#" + toolCalls.total + " " + action + " " + summarizeArgs(args) + " → " + len + " 字（" + (Date.now() - t0) + "ms）");
        return out;
    } catch (error) {
        log("工具调用", action + " 出错：" + (error && error.message ? error.message : error));
        throw error;
    }
}

/** 注册到酒馆（没有 registerFunctionTool 时静默跳过，不影响其他功能）。 */
function registerTools() {
    // 识别严格程度（面板/脚本/对外接口共用）：YgoCardLookupV2.call("strictness", { level: "strict|normal|loose" })
    try {
        registry.provide("runAction:strictness", async function (args) {
            const key = String((args && (args.level || args.value)) || "normal").trim().toLowerCase();
            const value = (key === "strict" || key === "最严格") ? "strict" : ((key === "loose" || key === "宽松") ? "loose" : "normal");
            settings.set("detectStrictness", value);
            log("工具", "识别严格程度 = " + value);
            return "识别严格程度 = " + value + (value === "strict" ? "（最严格：只认完整卡名）" : value === "loose" ? "（宽松：尽量多命中）" : "（适中：允许够具体的名字片段）");
        });
    } catch (error) { /* 已注册 */ }
    const c = ctx();
    const register = c.registerFunctionTool;
    if (typeof register !== "function") { log("工具", "当前客户端不支持 function tool，跳过注册"); return 0; }
    let count = 0;
    for (const t of TOOLS) {
        const action = t.action;
        try {
            register({
                name: t.name,
                description: t.description,
                ...toolDefs().find(function (d) { return d.name === t.name; }),
                action: async function (args) { return await dispatchTool(action, args); },
            });
            count++;
        } catch (error) { console.warn("[YGO2] 工具注册失败 " + t.name, error); }
    }
    log("工具", "已注册 " + count + "/" + TOOLS.length + " 个");
    return count;
}

const tools = { toolCalls, summarizeArgs, TOOLS, toolDefs, toolProblems, dispatchTool, registerTools };

return { TOOLS, toolDefs, toolProblems, toolCalls, summarizeArgs, dispatchTool, registerTools, tools };
});

__def("src/core/bus.js", function (__req) {
/** 唯一宿主接触点：模块通过 ctx() 取酒馆上下文，不在模块顶层触碰全局。 */
let injected = null;
function setContext(context) { injected = context; }
function ctx() {
    if (injected) return injected;
    if (typeof SillyTavern !== "undefined" && SillyTavern.getContext) return SillyTavern.getContext();
    return {};
}

const listeners = new Map();
function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(handler);
    return function off() {
        const list = listeners.get(event) || [];
        const i = list.indexOf(handler);
        if (i >= 0) list.splice(i, 1);
    };
}
function emit(event, payload) {
    for (const handler of listeners.get(event) || []) {
        try { handler(payload); } catch (error) { console.warn("[YGO2] 事件处理失败 " + event, error); }
    }
}

const buffer = [];
const LOG_LIMIT = 200;
let logEnabled = true;
function setLogEnabled(on) { logEnabled = on !== false; }
let verboseConsole = true;
/** 详细日志（面板「日志 → 输出到控制台」）：关掉只影响控制台，日志面板照常 */
function setLogVerbose(on) { verboseConsole = on !== false; }

function log(tag, message) {
    if (!logEnabled) return;
    // 格式与 v1 一致（v1 的面板与复制文本）：[HH:MM:SS] 标签：内容
    const now = new Date();
    let time = "";
    try { time = now.toLocaleTimeString("zh-CN", { hour12: false }); } catch (error) { time = now.toTimeString().slice(0, 8); }
    const line = "[" + time + "] " + tag + "：" + message;
    buffer.push(line);
    if (buffer.length > LOG_LIMIT) buffer.shift();
    emit("log", line);
    try { if (verboseConsole) console.log("[YGO2][" + tag + "] " + message); } catch (error) { /* 控制台不可用就算了 */ }
    return line;
}
function logLines() { return buffer.slice(); }

return { setContext, ctx, on, emit, LOG_LIMIT, setLogEnabled, setLogVerbose, log, logLines };
});

__def("src/core/events.js", function (__req) {
const { ctx, log, emit } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");

/** ── 统一模板（核心模块）：常量 → 纯函数 → 挂载 → exports ── */

/** 用到的官方事件（文档：MESSAGE_SENT / MESSAGE_RECEIVED / CHAT_CHANGED / GENERATION_ENDED / APP_READY） */
/** 额外钩子：不在 USED_EVENTS 里（那个列表是"通用事件→hooks"，这条有自己的处理器） */
const EXTRA_EVENTS = ["CHAT_COMPLETION_PROMPT_READY", "GENERATION_AFTER_COMMANDS"];

const USED_EVENTS = ["APP_READY", "CHAT_CHANGED", "MESSAGE_SENT", "MESSAGE_RECEIVED", "GENERATION_ENDED", "SETTINGS_UPDATED"];

/** 纯函数：取事件源（SillyTavern.getContext() 提供） */
function eventSource() {
    const c = ctx();
    return c && c.eventSource ? c.eventSource : null;
}

function eventTypes() {
    const c = ctx();
    return (c && c.event_types) || {};
}

/**
 * 挂载官方事件：
 * APP_READY        → 预热索引（不阻塞）
 * CHAT_CHANGED     → 清掉上一聊天的临时状态（盘面/本局记录）
 * MESSAGE_SENT     → 记录玩家消息（供"本局卡表"用）
 * GENERATION_ENDED → 取回非阻塞的外部结果（下一轮生效）
 */
async function mountEvents(hooks) {
    const src = eventSource();
    const types = eventTypes();
    if (!src || typeof src.on !== "function") { log("事件", "当前客户端没有 eventSource，跳过挂载"); return 0; }
    const h = hooks || {};
    let mounted = 0;
    const on = function (name, fn) {
        const key = types[name] || name;
        if (!key || typeof fn !== "function") return;
        try { src.on(key, fn); mounted++; } catch (error) { console.warn("[YGO2] 事件挂载失败 " + name, error); }
    };
    on("APP_READY", function () { if (h.onReady) h.onReady(); });
    on("CHAT_CHANGED", function () { if (h.onChatChanged) h.onChatChanged(); emit("chatChanged", {}); });
    on("MESSAGE_SENT", function (id) { if (h.onMessageSent) h.onMessageSent(id); });
    on("MESSAGE_SENT", function () { if (h.onMessageSentFallback) h.onMessageSentFallback(); });   // 兜底注入（v1「拦截器不生效时改用事件兜底」同语义）
    // ★ v1 的兜底通道：桌面客户端（tt）不执行 manifest 的 generate_interceptor，
    //   也不触发 CHAT_COMPLETION_PROMPT_READY；这个事件在**提示词组装前**触发，
    //   在这里改 ctx().chat 的最后一条消息，改动会真的进入本次发送。
    on("GENERATION_AFTER_COMMANDS", function (type) { if (h.onAfterCommands) h.onAfterCommands(type); });
    on("MESSAGE_RECEIVED", function (id) { if (h.onMessageReceived) h.onMessageReceived(id); });
    on("GENERATION_ENDED", function () { if (h.onGenerationEnded) h.onGenerationEnded(); });
    on("SETTINGS_UPDATED", function () { if (h.onSettingsUpdated) h.onSettingsUpdated(); });
    log("事件", "已挂载 " + mounted + " 个事件");
    // 发送体改写钩子（官方 CHAT_COMPLETION_PROMPT_READY）：注册表里有人装才挂，失败不影响其它事件
    try {
        if (registry.has("sendbody:on")) {
            const ok = await registry.call("sendbody:on", src, types);   // 漏了 await：以前恒报"已挂载"，失败还会变成未处理的 Promise 拒绝
            log("事件", ok ? "发送体钩子已挂载：" + EXTRA_EVENTS.join(",") : "发送体钩子未挂上（宿主事件不可用）");
        }
    } catch (error) {
        console.warn("[YGO2] 发送体钩子挂载失败", error);
    }
    return mounted;
}

const events = { USED_EVENTS, EXTRA_EVENTS, eventSource, eventTypes, mountEvents };

return { EXTRA_EVENTS, USED_EVENTS, eventSource, eventTypes, mountEvents, events };
});

__def("src/core/http.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");

/** 旧扩展目录：v2 只读引用它的索引与素材，不复制大文件。 */
const LEGACY_BASE = "/scripts/extensions/third-party/ygo-card-lookup/";

const EXT_PATH = "/scripts/extensions/third-party/ygo-card-lookup-v2/";
let baseOverride = null;
/** 本扩展自己的目录：经典脚本在【求值那一刻】document.currentScript 就是它自己，和目录/仓库叫什么名字无关。
 *  这是最可靠的一路 —— 从 GitHub 安装时目录名 = 仓库名（可能是 SillyTavern-YgoCardLookup-v2 这种），
 *  以前只认名字里含 "ygo-card-lookup" 的目录，换个仓库名 data/ 就全找不到了。 */
let selfBase = null;
function captureSelfBase() {
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
function ownBase() {
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

function setOwnBase(url) { baseOverride = url ? String(url) : null; }


/** 读扩展自带文本；v2 目录缺失时回退旧目录。 */
/** 数据文件候选 URL：自身目录优先，其次两个常见目录名（去重） */
function dataCandidates(name) {
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

async function dataFile(name, fetchImpl) {
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
async function fetchJson(url, options, timeoutMs, fetchImpl) {
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
async function cached(key, ttlMs, producer) {
    const hit = mem.get(key);
    const now = Date.now();
    if (hit && now - hit.at < (ttlMs || 60000)) return hit.value;
    const value = await producer();
    mem.set(key, { at: now, value: value });
    return value;
}
function clearCache() { mem.clear(); }

/** 懒构建 + 复用（并发只会构建一次），失败后允许重试。 */
function lazyIndex(builder) {
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

const IDB_NAME = "ygo2-cache";
const IDB_STORE = "files";
const IDB_VERSION = 1;
const DEFAULT_TTL = 7 * 24 * 3600 * 1000;   // 默认 7 天

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
async function idbGet(key, ttlMs) {
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
async function idbSet(key, value, ttlMs) {
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
async function idbDel(key) {
    const db = await openDb();
    if (!db) return false;
    return (await tx(db, "readwrite", function (store) { return store.delete(String(key || "")); })) !== false;
}
async function idbClear() {
    const db = await openDb();
    if (!db) return false;
    return (await tx(db, "readwrite", function (store) { return store.clear(); })) !== false;
}

/** 带持久缓存的读文件：先 IndexedDB → 再按普通方式取 → 写回缓存 */
async function dataFileCached(name, ttlMs, fetchImpl) {
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
async function idbClearExcept(keepPrefix) {
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

async function clearAllCache() {
    mem.clear();
    // ★ 以前是 idbClear()：把整个对象存储清空 —— 连用户"手动安装的数据库"也一起删了
    const ok = await idbClearExcept("db:");
    log("缓存", "缓存已清空（持久缓存：" + (ok ? "已清" : "不可用") + "；手动安装的数据库保留）");
    return ok;
}
function hostReady() { const c = ctx(); return !!(c && (c.chat || c.extensionSettings)); }

return { LEGACY_BASE, EXT_PATH, captureSelfBase, ownBase, setOwnBase, dataCandidates, dataFile, fetchJson, cached, clearCache, lazyIndex, IDB_NAME, IDB_STORE, IDB_VERSION, DEFAULT_TTL, idbGet, idbSet, idbDel, idbClear, dataFileCached, idbClearExcept, clearAllCache, hostReady };
});

__def("src/core/registry.js", function (__req) {
/**
 * 层间解耦：数据层注册能力，注入层/接口层消费。
 * 好处：拦截器可用假数据端到端测试，不依赖真实卡库。
 */
const providers = new Map();

function provide(name, fn) {
    if (typeof fn !== "function") throw new Error("provider 必须是函数：" + name);
    providers.set(name, fn);
    return fn;
}

function use(name) { return providers.get(name) || null; }

async function call(name, ...args) {
    const fn = providers.get(name);
    if (!fn) throw new Error("未注册的能力：" + name);
    return await fn(...args);
}

function has(name) { return providers.has(name); }
function list() { return Array.from(providers.keys()); }
function clear() { providers.clear(); }

const registry = { provide, use, call, has, list, clear };

return { provide, use, call, has, list, clear, registry };
});

__def("src/core/settings.js", function (__req) {
const { ctx, log, emit } = __req("src/core/bus.js");

const KEY = "ygo-card-lookup-v2";

/** 全部设置项集中在此。新增选项必须同时给默认值，避免运行期出现 undefined。 */
const DEFAULTS = {
    enabled: true,             // 是否注册 function tool（AI 可主动调用）
    interceptEnabled: true,
    triggerMode: "full",
    detectBrackets: true,
    detectPasscode: true,
    detectWholeMessage: true,
    capabilityHint: true,
    bodyEditMode: "off",          // 发送体改写：off 不动 / append 把识别到的卡片资料追加到最后一条玩家消息（官方 CHAT_COMPLETION_PROMPT_READY 钩子）
    injectLayers: "full",         // 注入分层：minimal 只给打牌要用的 / normal 加字段与禁限 / full 再加发售、补充说明与裁定
    injectNote: "",
    injectNotePosition: "tail",   // 附注位置：tail 跟在卡片资料后（默认）/ head 放在整块最前
    promptSheet: "",
    promptJudge: "",
    injectPosition: "chat",     // chat（聊天内，官方 /inject position=chat）/ before / after
    injectDepth: 4,             // 官方默认深度 4：0=最后一条消息之后，1=之前，依此类推
    vrmReaction: false,        // 抽到稀有卡时让 VRM 角色做表情（需装 VRM 扩展）
    webSearchFallback: false,  // 本地查不到时用 /websearch 联网（需装 Web Search 扩展）
    skipQuiet: true,            // 摘要等 quiet 生成不注入（官方 type 参数给出生成来源）
    injectionFallback: true,      // v1 的「拦截器不生效时改用事件兜底注入」：宿主不支持 generate_interceptor 时，在 MESSAGE_SENT 用同一拦截器补一次
    injectBudget: 2500,
    scanScope: "last_user",
    scanDepth: 3,                  // v1 的「扫描深度」：连最近几条消息一起看（1-20）
    includeImage: true,
    includeField: true,
    includeRelease: true,
    includeBanlist: true,
    includeSupplement: true,
    includeFaq: false,
    banlistRegion: "cn",
    maxResults: 5,
    apiEnabled: true,          // 想彻底不打扰就关掉它；默认开，但 auto 只在检测到可用通道时才发请求
    apiFollowMain: true,        // v1 的「跟随酒馆主连接」：地址与模型实时取自主连接，下面填的仅作备用
    apiMode: "auto",            // 默认自动：有哪条通道就用哪条（v1 的"跟随主连接"就是这个意思）
    apiProfile: "",              // 副 API 用哪条连接（空＝第一条）
    apiBudget: 8000,             // 外部处理预算毫秒（超时就不等）
    apiMaxTokens: 65535,         // 副 API 最大输出（默认 65535；个别网关有上限，被拒时调小）
    apiWebhookReplace: false,      // v1 的「回写时丢弃插件原始数据」：只给 AI 外部结果，去掉本地卡面
    apiNonBlocking: true,
    apiUrl: "",
    apiKey: "",
    apiModel: "",               // 选中的模型（下拉里选；选「手动填写」时用 apiModelManual）
    apiModelManual: "",         // 手动填写的模型名
    apiModels: [],
    apiViaServer: true,         // 先试服务端路由，失败自动直连（TauriTavern 里通常只有直连可用）              // 「拉取模型」拉回来的列表（供下拉使用）
    apiInstruction: "",
    apiExternalAiOwnSearch: false,  // 默认关：本地检索与外部结果【并存】。勾上则整句直接交给外部 AI（本地卡面不再注入，卡图仍会送）
    packRegion: "sc",
    packSize: 5,
    packMinSize: 20,
    shopSize: 5,
    shopIncludeDiy: true,
    handDraw: 5,
    handRuns: 1,
    handImages: true,
    poolSynchro: true,
    poolXyz: true,
    poolPendulum: true,
    poolLink: true,
    stripCitations: true,
    logVerbose: false,
    detectFreeText: true,
    detectStrictness: "normal",   // 识别严格程度：strict 只认完整卡名 / normal 适中 / loose 宽松      // 自由文本里的卡名（用本地卡名索引）
    naturalCommands: true,     // 自然语言触发词
    duelBoard: true,           // 盘面内容进入提示词
    useYgoprodeck: true,       // 允许访问 db.ygoprodeck.com（异画/英文名）
    resultPopup: true,         // 结果用弹窗面板显示
    resultInject: false,       // 结果同时注入提示词
    logEnabled: true,          // 启用日志
    logToast: false,           // 注入时弹提示
    cardImgMax: 360,
    summonAutoApply: true,       // 召唤检查通过时自动落到决斗盘（祭品送墓、怪兽上场、用掉本回合通招）
    isolateCommand: false,      // 隔离：勾上后只有指令（/ygo…）触发，一切自动检测/自然语言触发都不生效
    groupsDisabled: [],         // 栏目隔离：列在这里的栏目整体停用（自动检测注入/提示词/查询内容/外部接口/玩法/联动/日志/查看）
    diyFrameMode: "real",        // DIY 卡面：css 自绘 / real 真实卡框 PNG（素材在 assets/yugioh/）
    diyFrameBase: "",           // 自定义卡框目录（留空＝用自带素材）           // 聊天里卡图最大宽度（像素）
    collection: {},
    collectionTotal: 0,
    collectionRecent: [],
    diyCards: [],
    aliases: "",                    // 俗称表：默认空（自己去面板填，格式「俗称=官方名」每行一条，# 开头是注释）。曾经默认写「白龙=青眼」，会把用户的「白龙」悄悄改成「青眼」
    uiFolds: {},
};

/** 旧版(v1)设置迁移：五个外部开关合成一个 apiMode，其余按名搬运。 */
function migrate(raw) {
    const out = Object.assign({}, DEFAULTS, raw || {});
    if (raw && raw.apiMode === undefined) {
        const rt = raw.apiWebhookRoundtrip === true;
        // 旧版本的收件箱模式已移除：v1 里选了 inbox/both 的用户统一归到 roundtrip（往返），避免留下无效值
        const inbox = raw.apiInboxEnabled === true;
        out.apiMode = (rt || inbox) ? "roundtrip" : (raw.apiWebhook || raw.apiUrl) ? "push" : "local";
    out.apiUrl = raw.apiUrl || raw.apiWebhook || "";
        out.apiKey = raw.apiKey || raw.apiWebhookKey || "";
        out.apiModel = raw.apiModel || raw.apiExternalModel || "";
    if (raw.apiFollowMain !== undefined) out.apiFollowMain = raw.apiFollowMain !== false;   // v1 同名开关直接搬
    if (raw.apiViaTavernProxy !== undefined) out.apiViaServer = raw.apiViaTavernProxy !== false;
        out.triggerMode = raw.triggerMode || (raw.commandOnly === true ? "command" : raw.detectFreeText === false ? "keyword" : "full");
    }

    // 无条件规范化：v1 存盘里可能就是 local/push/roundtrip（有值时上面整块会被跳过，所以必须放在最后）
    const MODE_WHITELIST = ["off", "auto", "url", "secondary", "secondary-then-main", "main", "ttmain", "route", "direct"];   // direct = 客户端直连（tt 用这个）
    if (out.apiMode === "local" || out.apiMode === "push") out.apiMode = "off";
    if (out.apiMode === "roundtrip" || out.apiMode === "inbox" || out.apiMode === "both") out.apiMode = "secondary-then-main";
    if (out.apiMode === "url" || out.apiMode === "route" || out.apiMode === "direct" || out.apiMode === "push") out.apiMode = "route";   // 三个自填地址写法统一成 route（内部会自动服务端→直连）
    if (MODE_WHITELIST.indexOf(String(out.apiMode)) < 0) out.apiMode = "off";

    return out;
}

let cache = null;
let storeFallback = null;   // 宿主没给 extensionSettings 时的持久兜底（避免"写完就丢"）
function store() {
    const c = ctx();
    if (c && c.extensionSettings && typeof c.extensionSettings === "object") return c.extensionSettings;
    if (!storeFallback) {
        storeFallback = {};
        log("设置", "宿主 context 里没有 extensionSettings，已启用内存兜底（仅本次会话有效）");
    }
    return storeFallback;
}

function read() { return migrate(store()[KEY]); }
function get(key) { if (!cache) cache = read(); return key ? cache[key] : cache; }
function all() { return get(); }
function reload() { cache = read(); return cache; }
function save(patch) {
    const next = Object.assign({}, read(), patch || {});
    store()[KEY] = next;
    cache = next;
    const c = ctx();
    if (typeof c.saveSettingsDebounced === "function") c.saveSettingsDebounced();
    emit("settings", cache);
    return cache;
}
function set(key, value) { const patch = {}; patch[key] = value; return save(patch); }

/** 总隔离：只看指令触发（不改动用户自己的其它设置，只在读取时生效） */
function isolationActive() { return get("isolateCommand") === true; }

/** 栏目是否启用（栏目隔离） */
function groupEnabled(name) {
    if (isolationActive()) {
        // 总隔离下：只有「查询内容」与「查看」这些"看结果"的栏目还允许自动动作，其余自动行为一律停
        if (name === "自动检测注入" || name === "玩法" || name === "联动" || name === "外部接口") return false;
    }
    const off = get("groupsDisabled");
    return !(Array.isArray(off) && off.indexOf(name) >= 0);
}

/** 供界面层判断"这个动作属于哪个栏目"（触发词/命令共用） */
const ACTION_GROUP = {
    card: "查询内容", search: "查询内容", rule: "查询内容", art: "查询内容", alias: "查询内容", recap: "查询内容",
    pack: "玩法", draw: "玩法", shop: "玩法", buy: "玩法", deck: "玩法", hand: "玩法", board: "玩法", duel: "玩法", diy: "玩法",
    log: "日志", selftest: "日志",
};
function actionGroup(action) { return ACTION_GROUP[String(action || "")] || ""; }
function actionAllowed(action) { const g = actionGroup(action); return g ? groupEnabled(g) : true; }

const settings = {
    KEY: KEY,
    DEFAULTS: DEFAULTS,
    migrate: migrate,
    load: async function () { reload(); log("启动", "设置已载入（" + Object.keys(cache).length + " 项）"); return cache; },
    get: get,
    all: all,
    set: set,
    save: save,
    reload: reload,
    isolationActive: isolationActive,
    groupEnabled: groupEnabled,
    actionGroup: actionGroup,
    actionAllowed: actionAllowed,
    ACTION_GROUP: ACTION_GROUP,
};

return { KEY, DEFAULTS, migrate, read, get, all, reload, save, set, isolationActive, groupEnabled, ACTION_GROUP, actionGroup, actionAllowed, settings };
});

__def("src/data/art.js", function (__req) {
const { log } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");
const { fetchJson, cached, lazyIndex, ownBase } = __req("src/core/http.js");
const { settings } = __req("src/core/settings.js");
const { findCard } = __req("src/data/cards.js");
const { getStatsIndex } = __req("src/data/indexes.js");

/** ── 统一模板（数据模块）：常量 → 纯函数 → 懒取数 → register → exports ── */

/** 1) 常量 */
const YGOPRODECK_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const ART_TTL = 24 * 3600 * 1000;

let fetchImpl = null;
let readText = null;   // 浏览器默认走 fetch；测试注入本地文件
function configure(options) {
    if (options && typeof options.fetchJson === "function") fetchImpl = options.fetchJson;
    if (options && typeof options.readText === "function") readText = options.readText;
}

/** 本地异画索引（data/art-index.json，随插件分发；离线可用） */
function artIndexUrl() { return ownBase() + "data/art-index.json"; }
async function readIndexText() {
    if (readText) return await readText("art-index.json");
    const response = await fetch(artIndexUrl());
    if (!response.ok) throw new Error("异画索引读取失败 HTTP " + response.status);
    return await response.text();
}
const getArtIndex = lazyIndex(async function () {
    const data = JSON.parse(await readIndexText());
    const out = {};
    for (const key of Object.keys(data)) { if (key === "_meta") continue; const v = data[key]; out[key] = { n: Number(v.n) || (v.arts ? v.arts.length : 0), arts: Array.isArray(v.arts) ? v.arts.map(String) : [], cn: String(v.cn || ""), en: String(v.en || "") }; }
    return out;
});
function artImageUrl(artId) { return "https://images.ygoprodeck.com/images/cards/" + String(artId) + ".jpg"; }
function doFetch(url, ms) { return fetchImpl ? fetchImpl(url, ms) : fetchJson(url, {}, ms); }

/** 2) 纯函数 */
/** 归一 card_images（YGOPRODeck 的异画数组） */
function artList(payload) {
    const card = payload && Array.isArray(payload.data) ? payload.data[0] : null;
    const images = card && Array.isArray(card.card_images) ? card.card_images : [];
    return images.map(function (im, i) {
        return { index: i + 1, id: String(im.id || ""), url: String(im.image_url || ""), small: String(im.image_url_small || "") };
    }).filter(function (x) { return x.url; });
}

function artText(name, arts) {
    if (!arts.length) return "「" + name + "」没有查到异画数据（YGOPRODeck 未收录，可能是 OCG 专属卡或网络不通）。";
    const lines = ["🎨 异画 · " + name + "（共 " + arts.length + " 个版本）"];
    arts.forEach(function (a) { lines.push("[" + a.index + "] ![](" + a.url + ")"); });
    return lines.join("\n");
}

/** 3) 取数：先按英文名（能拿到全部异画），再退回按密码（通常只有一张） */
async function fetchArtsByEnglish(enName) {
    const name = String(enName || "").trim();
    if (!name) return [];
    const payload = await cached("art:name:" + name, ART_TTL, async function () {
        return await doFetch(YGOPRODECK_URL + "?name=" + encodeURIComponent(name), 15000);
    });
    return artList(payload);
}

async function fetchArtsById(id) {
    const key = String(id || "").trim();
    if (!key) return [];
    const payload = await cached("art:id:" + key, ART_TTL, async function () {
        return await doFetch(YGOPRODECK_URL + "?id=" + key, 15000);
    });
    return artList(payload);
}

async function artOf(query) {
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

async function artTextFor(query) {
    const q = String(query || "").trim();
    if (!q) return "想看哪张卡的异画？";
    const res = await artOf(q);
    if (!res.row) return "没有找到「" + q + "」。";
    if (!res.arts.length) return "「" + res.row.name + "」没有查到异画数据（YGOPRODeck 未收录，可能是 OCG 专属卡或网络不通）。";
    return artText(res.row.name, res.arts);
}

/** 4) 注册能力 */
function registerArt() {
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

const artMod = { YGOPRODECK_URL, artIndexUrl, readIndexText, getArtIndex, artImageUrl, listAltArtCards, ART_TTL, configure, artList, artText, fetchArtsByEnglish, fetchArtsById, artOf, artTextFor, registerArt };

/** 对外入口：本地异画索引不可用时给友好提示，绝不抛错 */
async function listAltArtCards() {
    try { return await listAltArtCardsInner.apply(null, arguments); }
    catch (error) {
        log("异画", "本地异画索引不可用：" + (error && error.message ? error.message : error));
        return "🎨 本地异画索引暂时不可用（浏览器里通常可用；也可能是扩展的 data/art-index.json 缺失）。可以改用「这张卡有哪些异画」按卡名查。";
    }
}

return { YGOPRODECK_URL, ART_TTL, configure, artIndexUrl, readIndexText, getArtIndex, artImageUrl, artList, artText, fetchArtsByEnglish, fetchArtsById, artOf, artTextFor, registerArt, artMod, listAltArtCards };
});

__def("src/data/board.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");
const { settings } = __req("src/core/settings.js");
const { getStatsIndex, normalizeKey } = __req("src/data/indexes.js");
const { imageUrl } = __req("src/data/cards.js");

/** ── 统一模板（数据模块）：常量 → 纯函数 → 状态存取 → register → exports ── */

/** 1) 常量：盘面存在 chatMetadata 里（官方推荐：切换聊天自动隔离，别长期持有引用） */
const BOARD_KEY = "ygo2_board";
const PHASES = ["抽卡阶段", "准备阶段", "主要阶段1", "战斗阶段", "主要阶段2", "结束阶段"];
const ZONES = ["field", "hand", "grave", "extra", "banished"];
const SIDE_LABEL = { me: "我方", opp: "对方" };

/** 2) 纯函数（全部可断言，无 DOM / 无网络） */
function newSide() { return { lp: 8000, field: [], hand: [], grave: [], extra: [], banished: [], normalSummonUsed: false }; }

function newBoard() { return { me: newSide(), opp: newSide(), turn: 1, phaseIndex: 2, log: [] }; }

/** 归一到合法结构（防止旧数据/手改数据把后续逻辑带崩） */
function normalizeBoard(raw) {
    const b = raw && typeof raw === "object" ? raw : {};
    const out = newBoard();
    for (const side of ["me", "opp"]) {
        const s = b[side] && typeof b[side] === "object" ? b[side] : {};
        out[side].lp = Number.isFinite(Number(s.lp)) ? Number(s.lp) : 8000;
        out[side].normalSummonUsed = s.normalSummonUsed === true;
        for (const zone of ZONES) out[side][zone] = Array.isArray(s[zone]) ? s[zone].filter(function (x) { return x && x.name; }).map(function (x) { return { name: String(x.name), id: String(x.id || ""), atk: x.atk === undefined ? "" : x.atk, def: x.def === undefined ? "" : x.def, position: x.position || "攻击表示" }; }) : [];
    }
    out.turn = Math.max(1, Number(b.turn) || 1);
    // 注意：缺省值必须与 newBoard() 一致（默认"主要阶段1"），不能用 || 0，否则空数据会被当成"抽卡阶段"
    const fallbackPhase = newBoard().phaseIndex;
    out.phaseIndex = Math.min(PHASES.length - 1, Math.max(0, Number.isFinite(Number(b.phaseIndex)) ? Number(b.phaseIndex) : fallbackPhase));
    out.log = Array.isArray(b.log) ? b.log.slice(-50) : [];
    return out;
}

/** 纯函数：动作 → 新盘面（reducer；不修改入参） */
function applyAction(board, action) {
    const b = normalizeBoard(board);
    const a = action || {};
    const side = a.side === "opp" ? "opp" : "me";
    const s = b[side];
    const push = function (text) { b.log.push(String(text).slice(0, 120)); if (b.log.length > 50) b.log.shift(); };
    switch (String(a.action || "show")) {
        case "lp": {
            const before = s.lp;
            s.lp = Math.max(0, Math.round(Number(a.value)));
            if (!Number.isFinite(s.lp)) s.lp = before;
            push(SIDE_LABEL[side] + " LP " + before + " → " + s.lp);
            break;
        }
        case "draw": {
            const names = String(a.value || "").split(/[、,，\n]/).map(function (x) { return x.trim(); }).filter(Boolean);
            for (const n of names) s.hand.push({ name: n, id: "", atk: "", def: "", position: "手牌" });
            push(SIDE_LABEL[side] + " 抽到 " + names.length + " 张：" + names.join("、"));
            break;
        }
        case "to": {
            const from = ZONES.indexOf(a.from || "hand") >= 0 ? a.from : "hand";
            const to = ZONES.indexOf(a.to || "field") >= 0 ? a.to : "field";
            const i = s[from].findIndex(function (x) { return normalizeKey(x.name) === normalizeKey(a.value); });
            if (i < 0) { push("手牌/场上没有「" + String(a.value || "") + "」"); break; }
            const card = s[from].splice(i, 1)[0];
            card.position = a.position || (to === "field" ? "攻击表示" : to === "grave" ? "墓地" : card.position);
            s[to].push(card);
            push("「" + card.name + "」" + from + " → " + to);
            break;
        }
        case "phase": {
            b.phaseIndex = (b.phaseIndex + 1) % PHASES.length;
            if (b.phaseIndex === 0) { b.turn += 1; b.me.normalSummonUsed = false; b.opp.normalSummonUsed = false; push("进入第 " + b.turn + " 回合（通常召唤次数已重置）"); }
            push("阶段：" + PHASES[b.phaseIndex]);
            break;
        }
        case "summonUsed": {
            const who = a.side === "opp" ? "opp" : "me";
            const flag = a.value === false || a.value === "reset" ? false : true;
            b[who].normalSummonUsed = flag;
            push(SIDE_LABEL[who] + "：" + (flag ? "已用掉本回合通常召唤" : "本回合通常召唤已重置"));
            break;
        }
        case "reset": {
            const fresh = newBoard();
            push("盘面已重置");
            return fresh;
        }
        default: break;
    }
    return b;
}

/** 纯函数：盘面文本（给 AI 看） */
function boardText(board) {
    const b = normalizeBoard(board);
    const lines = ["⚔️ 决斗盘 · 第 " + b.turn + " 回合 · " + PHASES[b.phaseIndex]];
    for (const side of ["me", "opp"]) {
        const s = b[side];
        lines.push("", "【" + SIDE_LABEL[side] + "】LP " + s.lp);
        lines.push("  场上（" + s.field.length + "）：" + (s.field.map(function (c) { return c.name + "(" + c.position + ")"; }).join("、") || "空"));
        lines.push("  手牌（" + s.hand.length + "）：" + (s.hand.map(function (c) { return c.name; }).join("、") || "空"));
        lines.push("  墓地（" + s.grave.length + "）：" + (s.grave.map(function (c) { return c.name; }).join("、") || "空"));
        lines.push("  本回合通常召唤：" + (s.normalSummonUsed ? "已使用" : "可用"));
    }
    if (b.log.length) lines.push("", "最近：" + b.log.slice(-5).join("；"));
    lines.push("", "（盘面只记录事实，谁强谁弱、能不能打，由你判断。）");
    return lines.join("\n");
}

/** 本局卡表：扫描聊天里出现过的卡名（用真实卡库匹配） */
/** 本局卡表（结构化）：返回 [{id,name,typeText,image}]，供文本与图形两处复用 */
async function recapRows(limit, scopeOverride) {
    const c = ctx();
    const stats = await getStatsIndex();
    const scale = (scopeOverride || settings.get("scanScope")) === "all" ? "all" : "last_user";
    const chat = Array.isArray(c.chat) ? c.chat : [];
    const picked = scale === "all" ? chat.slice(-30) : chat.filter(function (m) { return m && m.is_user; }).slice(-5);
    const found = new Map();
    for (const m of picked) {
        const text = normalizeKey(m && m.mes);
        if (!text) continue;
        for (const [key, row] of stats.byName) {
            if (key.length < 2) continue;
            if (text.indexOf(key) < 0) continue;
            found.set(row.id, row);
            if (found.size > 400) break;
        }
    }
    const rows = [...found.values()].slice(0, Math.max(1, Math.min(120, Number(limit) || 60)));
    return { rows: rows, scale: scale, scanned: picked.length };
}

/** 本局卡表：扫描聊天里出现过的卡名（用真实卡库匹配） */
async function recapText(limit, scopeOverride) {
    const res = await recapRows(limit, scopeOverride);
    if (!res.rows.length) return "本局还没识别到卡名（扫描范围：" + (res.scale === "all" ? "最近 30 条消息" : "最近 5 条玩家消息") + "）。";
    const lines = ["📜 本局卡表 · 共 " + res.rows.length + " 种（扫描：" + (res.scale === "all" ? "最近 30 条消息" : "最近 5 条玩家消息") + "）"];
    for (const r of res.rows) lines.push("· " + r.name + "（" + r.id + "）" + (r.typeText ? " " + r.typeText : ""));
    lines.push("", "（这里只给卡名与资料，谁用过、算不算数由你判断。）");
    return lines.join("\n");
}

/** 3) 状态存取（chatMetadata + saveMetadata，官方推荐做法） */
function getBoard() {
    const c = ctx();
    const store = c.chatMetadata && typeof c.chatMetadata === "object" ? c.chatMetadata : null;
    if (!store) return newBoard();
    return normalizeBoard(store[BOARD_KEY]);
}

function saveBoard(board) {
    const c = ctx();
    const store = c.chatMetadata && typeof c.chatMetadata === "object" ? c.chatMetadata : null;
    if (!store) { log("盘面", "当前没有 chatMetadata，盘面只在内存里"); return false; }
    store[BOARD_KEY] = normalizeBoard(board);
    try { if (typeof c.saveMetadata === "function") Promise.resolve(c.saveMetadata()).catch(function () {}); } catch (error) { /* 保存失败不影响当下 */ }
    return true;
}

/** 常用入口：执行一个动作并保存 */
async function boardAction(args) {
    const before = getBoard();
    const after = applyAction(before, args || {});
    saveBoard(after);
    return boardText(after);
}

/** 4) 注册能力 */
function registerBoard() {
    registry.provide("tool:board", async function (args) {
        const a = args || {};
        if (!a.action || a.action === "show") return boardText(getBoard());
        return await boardAction(a);
    });
    registry.provide("tool:recap", async function (args) { const a = args || {}; return await recapText(a.limit, a.scope); });
    registry.provide("boardText", async function () { return boardText(getBoard()); });
    registry.provide("runAction:board", async function (trigger) {
        const a = trigger && trigger.action;
        if (a === "board") return [{ name: "决斗盘", text: boardText(getBoard()) }];
        if (a === "recap") return [{ name: "本局卡表", text: await recapText(0) }];
        return [];
    });
    log("数据", "盘面能力已注册（board/recap）");
}

const boardMod = { BOARD_KEY, recapRows, PHASES, ZONES, SIDE_LABEL, newSide, newBoard, normalizeBoard, applyAction, boardText, recapText, getBoard, saveBoard, boardAction, registerBoard };

return { BOARD_KEY, PHASES, ZONES, SIDE_LABEL, newSide, newBoard, normalizeBoard, applyAction, boardText, recapRows, recapText, getBoard, saveBoard, boardAction, registerBoard, boardMod };
});

__def("src/data/cards.js", function (__req) {
const { log } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");
const { settings } = __req("src/core/settings.js");
const { fetchJson, cached } = __req("src/core/http.js");
const { getNameIndex, getStatsIndex, normalizeKey } = __req("src/data/indexes.js");
const { splitSetcodes, fieldNameOf, fieldNamesWithJpOf } = __req("src/data/setcodes.js");

/** 1) 常量 */
const API_SEARCH = "https://ygocdb.com/api/v0/?search=";
const API_CARD = "https://ygocdb.com/api/v0/card/";
const SITE_CARD = "https://ygocdb.com/card/";   // 百科页（v1 每张卡都会给这个链接）
const IMAGE_BASE = "https://cdn.233.momobako.com/ygopro/pics/";
const PRE_IMAGE_BASE = "https://cdntx.moecube.com/ygopro-super-pre/data/pics/";

let fetchImpl = null;
function configure(options) { if (options && typeof options.fetchJson === "function") fetchImpl = options.fetchJson; }
function doFetch(url, ms) { return fetchImpl ? fetchImpl(url, ms) : fetchJson(url, {}, ms); }

/** 2) 纯函数 */
/** 接口返回的 types 是"换行版"（"[怪兽|效果] 念动力/暗\n[★4] 1900/300"），本地卡库与 parseTypeText 用的是 § 分隔；
 *  直接塞进去会让 ATK/DEF 解析不到（parts[1] 为空）并把换行带进注入文本。 */
function normalizeApiTypes(types) {
    const s = String(types === undefined || types === null ? "" : types);
    if (!s) return "";
    if (s.indexOf("§") >= 0) return s.trim();
    return s.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean).join("§");
}

/** 卡图 URL：9 位视为超先行卡 */
function imageUrl(id) {
    const key = String(id || "").trim();
    if (!/^\d+$/.test(key)) return "";
    return (key.length >= 9 ? PRE_IMAGE_BASE : IMAGE_BASE) + key + ".jpg";
}

/** 解析类型/数值文本："[怪兽|通常] 龙/光§[★8] 3000/2500" */
function parseTypeText(typeText) {
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
async function findCard(query) {
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
async function searchOnline(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    try {
        const data = await cached("search:" + q, 3600000, async function () { return await fetchJson(API_SEARCH + encodeURIComponent(q)); });
        return (data && Array.isArray(data.result)) ? data.result : [];
    } catch (error) { log("查询", "在线搜索失败（" + q + "）：" + (error && error.message ? error.message : error)); return []; }
}

/** 上次在线搜索留下的"你是想说"候选（v1 的 ambiguousMessage 同用途） */
let lastCandidates = [];
function candidatesOf() { return lastCandidates.slice(); }
async function searchNames(keyword, limit) {
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
function effectText(detail) {
    const t = detail && detail.text;
    if (!t) return "";
    if (typeof t === "string") return t.trim();
    return String(t.desc || t.cn || t.sc_name || "").trim();
}

/** 行 → 供 AI 阅读的文本块（含选项控制）；detail 可带效果文本 */
function formatCard(row, detail, options) {
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
async function cardDetail(id, options) {
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
async function cardText(args) {
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
function registerCards() {
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

function registerCardResolver() { registry.provide("resolveCards", resolveCards); log("数据", "卡名识别能力已注册（resolveCards）"); }

/**
 * 多卡互动裁定接线：句子里同时出现多张卡时，优先给"同时提到这几张"的官方裁定，
 * 并把每张卡各自的「最近 3 条」换掉（否则预算被零散裁定吃光）。
 * 放在注入块**最前面**：预算截断是从后往前切的，放最后会被切掉。
 */
async function applyCrossRuling(list) {
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

async function resolveCards(text) {
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
async function seriesMembers(keyword) {
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
const cards = { seriesMembers, searchOnline, candidatesOf, applyCrossRuling, effectText, API_SEARCH, API_CARD, IMAGE_BASE, PRE_IMAGE_BASE, configure, imageUrl, parseTypeText, findCard, searchNames, formatCard, cardDetail, cardText, resolveCards, registerCards, registerCardResolver };

return { API_SEARCH, API_CARD, SITE_CARD, IMAGE_BASE, PRE_IMAGE_BASE, configure, normalizeApiTypes, imageUrl, parseTypeText, findCard, searchOnline, candidatesOf, searchNames, effectText, formatCard, cardDetail, cardText, registerCards, registerCardResolver, applyCrossRuling, resolveCards, seriesMembers, cards };
});

__def("src/data/collection.js", function (__req) {
const { log, ctx } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");
const { settings } = __req("src/core/settings.js");
const { getStatsIndex, normalizeKey } = __req("src/data/indexes.js");
const { imageUrl, findCard } = __req("src/data/cards.js");

/** ── 统一模板（数据模块）：常量 → 纯函数 → 状态存取 → register → exports ── */

/** 1) 常量 */
const STATS_KEYS = { collection: "collection", total: "collectionTotal", recent: "collectionRecent", diy: "diyCards", aliases: "aliases" };
const DIY_CATEGORIES = ["怪兽", "魔法", "陷阱"];
const DIY_MONSTER_FRAMES = ["通常", "效果", "仪式", "融合", "同调", "超量", "连接", "灵摆"];

/** 2) 纯函数 */
/** 俗称表："俗称=正式名" 每行一条 */
function parseAliases(text) {
    const map = new Map();
    for (const line of String(text || "").split("\n")) {
        const s = line.trim();
        if (!s || s.charAt(0) === "#") continue;                       // 支持 # 注释
        const parts = s.split(/[=＝:：]/);
        if (parts.length < 2) continue;
        const from = normalizeKey(parts[0]);
        const to = parts.slice(1).join("=").trim();                    // 右侧允许再出现 =
        if (from && to) map.set(from, to);
    }
    return map;
}

/** 当前生效的俗称表（来自设置） */
function aliasMap() { return parseAliases(settings.get("aliases")); }

/** 单个名字 → 官方名（精确匹配；查不到原样返回）——与 v1 的 resolveAlias 同语义 */
function resolveAliasName(name) {
    const raw = String(name === undefined || name === null ? "" : name).trim();
    if (!raw) return raw;
    const hit = aliasMap().get(normalizeKey(raw));
    return hit || raw;
}

/** 把句子里的俗称按官方名替换（用于卡名识别） */
function applyAliasesToText(text) { return applyAliases(text, aliasMap()); }

/** 学一条俗称（写进设置；重复或自我映射返回 false） */
function learnAlias(from, to) {
    const f = String(from || "").trim(), t = String(to || "").trim();
    if (!f || !t || normalizeKey(f) === normalizeKey(t)) return false;
    const map = aliasMap();
    if (map.get(normalizeKey(f)) === t) return false;
    map.set(normalizeKey(f), t);
    const lines = [...map.entries()].map(function (e) { return e[0] + "=" + e[1]; });
    settings.set("aliases", lines.join("\n"));
    log("俗称", "已记录俗称：" + f + " → " + t);
    return true;
}

function applyAliases(text, map) {
    let out = String(text || "");
    for (const [from, to] of map) {
        if (!from) continue;
        const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        out = out.replace(re, to);
    }
    return out;
}

/** DIY 卡的"类型/数值"文本：与卡库同一套方言，便于走同一条管线 */
function diyTypeText(card) {
    const c = card || {};
    if (c.category === "魔法") return "[魔法]";
    if (c.category === "陷阱") return "[陷阱]";
    const kinds = ["怪兽"];
    const frame = String(c.frame || "效果");
    if (frame !== "通常") kinds.push(frame);
    const head = "[" + kinds.join("|") + "] " + (c.race || "？") + "/" + (c.attribute || "？");
    const atk = c.atk === undefined || c.atk === null || c.atk === "" ? "?" : String(c.atk);
    const def = c.def === undefined || c.def === null || c.def === "" ? "?" : String(c.def);
    const isLink = frame === "连接";
    const isXyz = frame === "超量";
    const scale = isLink ? "[LINK-" + (Number(c.link) || 1) + "]" : (isXyz ? "[☆" + (Number(c.rank) || 1) + "]" : "[★" + (Number(c.level) || 1) + "]");
    const tail = isLink ? atk + "/-" : atk + "/" + def;
    return head + "§" + scale + " " + tail;
}

function normalizeDiyCard(input) {
    const c = input || {};
    // 兼容两种键名：面板/自检传 category，斜杠命令与 function tool 传 type
    // （曾经只认 category，于是 /ygodiy type=魔法 和 manage_diy_card(type="魔法") 都被静默建成怪兽）
    const wanted = String(c.category || c.type || "").trim();
    const category = DIY_CATEGORIES.indexOf(wanted) >= 0 ? wanted
        : (/魔法|spell/i.test(wanted) ? "魔法" : (/陷阱|trap/i.test(wanted) ? "陷阱" : "怪兽"));
    const frame = category === "怪兽" ? (DIY_MONSTER_FRAMES.indexOf(c.frame) >= 0 ? c.frame : "效果") : "";
    return {
        name: String(c.name || "").trim(),
        category: category,
        frame: frame,
        attribute: String(c.attribute || "").trim(),
        race: String(c.race || "").trim(),
        level: c.level === undefined ? 1 : Number(c.level) || 0,
        rank: c.rank === undefined ? 1 : Number(c.rank) || 0,
        link: c.link === undefined ? 1 : Number(c.link) || 0,
        scale: c.scale === undefined ? 0 : Number(c.scale) || 0,
        atk: c.atk === undefined || c.atk === "" ? 0 : Number(c.atk) || 0,
        def: c.def === undefined || c.def === "" ? 0 : Number(c.def) || 0,
        condition: String(c.condition || "").trim(),
        desc: String(c.desc || "").trim(),
        image: String(c.image || "").trim(),
        subtype: String(c.subtype || "").trim(),
        setcode: String(c.setcode || "").trim(),
        passcode: String(c.passcode || "").trim(),
    };
}

/** 确定性伪随机（同种子必同序列） */
function seededRandom(seed) {
    let h = 2166136261;
    const s = String(seed);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    let state = h >>> 0;
    return function next() {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/** 纯函数：商店可选的池子（真实卡 + DIY 卡，受「DIY 卡也进商店 / 卡库抽卡」控制）。
 *  抽成函数是为了能确定性测试 —— 之前只有概率抽到 DIY，测不出来。 */
function shopPool(stats) {
    const pool = (stats && stats.rows ? stats.rows : []).map(function (r) { return r.id; });
    if (settings.get("shopIncludeDiy") === false) return pool;
    for (const c of (settings.get("diyCards") || [])) if (c && c.name) pool.push("diy:" + c.name);
    return pool;
}

function shopSeed(day, chatKey) { return "ygo2-shop-" + String(day) + "-" + String(chatKey || "default"); }

function chatScopeKey() {
    const c = ctx();
    if (c && c.chatId) return String(c.chatId);
    const chat = c && c.chat;
    if (Array.isArray(chat) && chat.length && chat[0] && chat[0].avatar) return String(chat[0].avatar);
    return "default";
}

/** 从卡池里按种子挑固定的一批 */
function pickSeeded(pool, size, seed) {
    const list = (pool || []).slice();
    const want = Math.max(1, Math.min(list.length, Number(size) || 5));
    const rnd = seededRandom(seed);
    const out = [];
    while (out.length < want && list.length) {
        const i = Math.floor(rnd() * list.length) % list.length;
        out.push(list.splice(i, 1)[0]);
    }
    return out;
}

function todayKey(now) { const d = now ? new Date(now) : new Date(); return d.toISOString().slice(0, 10); }

/** 3) 状态存取（都存在 settings 里，天然持久化） */
function collectionState() {
    const s = settings.all();
    return { map: s[STATS_KEYS.collection] || {}, total: Number(s[STATS_KEYS.total]) || 0, recent: s[STATS_KEYS.recent] || [] };
}

function addToCollection(ids) {
    const state = collectionState();
    const map = Object.assign({}, state.map);
    const recent = state.recent.slice();
    let added = 0;
    for (const id of ids || []) {
        const key = String(id);
        if (!key) continue;
        if (!map[key]) { map[key] = 0; added++; }
        map[key] += 1;
        recent.unshift(key);
    }
    settings.save({ [STATS_KEYS.collection]: map, [STATS_KEYS.total]: state.total + (ids || []).length, [STATS_KEYS.recent]: recent.slice(0, 30) });
    return { added: added, kinds: Object.keys(map).length, total: state.total + (ids || []).length };
}

/** 4) 业务文本 */
/** 购入一张卡：按卡名解析 → 计入收藏册（没有货币系统，价格交给 AI 叙事） */
async function buyCard(query) {
    const q = String(query || "").trim();
    if (!q) return "要买哪张卡？";
    const row = await findCard(q);
    if (!row) return "商店里没有「" + q + "」，也可能是译名不同（可以先用 search_yugioh_cards 模糊搜）。";
    const res = addToCollection([row.id]);
    return "🛒 已购入「" + row.name + "」（" + row.id + "），收藏册现有 " + res.kinds + " 种 / 累计 " + res.total + " 张。";
}

async function collectionText(args) {
    const state = collectionState();
    const stats = await getStatsIndex();
    const kinds = Object.keys(state.map).length;
    const lines = ["📖 收藏册", "已收集 " + kinds + " / " + stats.rows.length + " 种（" + (kinds / stats.rows.length * 100).toFixed(1) + "%）｜累计抽到 " + state.total + " 张"];
    const recent = state.recent.slice(0, 10).map(function (id) { return stats.byId.get(String(id)); }).filter(Boolean);
    if (recent.length) lines.push("", "最近获得：", recent.map(function (r) { return "· " + r.name + "（" + r.id + "）"; }).join("\n"));
    if (args && args.series) {
        const key = normalizeKey(args.series);
        const hit = stats.rows.filter(function (r) { return normalizeKey(r.name).indexOf(key) >= 0 && state.map[r.id]; });
        lines.push("", "【" + args.series + "】已收集 " + hit.length + " 种：" + (hit.slice(0, 30).map(function (r) { return r.name; }).join("、") || "（还没有）"));
    }
    return lines.join("\n");
}

async function shopText(args) {
    const size = Math.max(1, Math.min(20, Number((args && args.size) || settings.get("shopSize")) || 5));
    const day = (args && args.date) || todayKey();
    const stats = await getStatsIndex();
    const includeDiy = settings.get("shopIncludeDiy") !== false;
    const pool = stats.rows.map(function (r) { return r.id; });
    if (includeDiy) for (const c of settings.get("diyCards") || []) if (c && c.name) pool.push("diy:" + c.name);
    const picked = pickSeeded(pool, size, shopSeed(day, chatScopeKey()));
    const lines = ["🏪 每日商店 · " + day + "（共 " + picked.length + " 件）", "同一天同一聊天固定不变，过一天才会换一批，不能手动刷新。", ""];
    picked.forEach(function (id, i) {
        if (String(id).indexOf("diy:") === 0) { lines.push("[" + (i + 1) + "] " + String(id).slice(4) + "（DIY 卡）"); return; }
        const row = stats.byId.get(String(id));
        if (!row) return;
        lines.push("[" + (i + 1) + "] " + row.name + "（" + row.id + "）", row.typeText, "卡图: ![](" + imageUrl(row.id) + ")");
    });
    return lines.join("\n");
}

function aliasText() {
    const map = aliasMap();
    if (!map.size) return "📖 俗称表为空（面板「查询内容 → 俗称表」里按「俗称=官方名」每行一条添加，或发 /ygoalias 杀调=杀手旋律）。";
    const lines = ["📖 俗称表（" + map.size + " 条）"];
    for (const [from, to] of map) lines.push("· " + from + " → " + to);
    return lines.join("\n");
}

async function diyListText() {
    const list = settings.get("diyCards") || [];
    if (!list.length) return "还没有 DIY 卡。可以用工具 manage_diy_card 的 add 动作创建。";
    const lines = ["🃏 DIY 卡（" + list.length + " 张）"];
    for (const c of list) { lines.push("", "【" + c.name + "】", diyTypeText(c), c.desc ? c.desc : "（无效果文本）"); }
    return lines.join("\n");
}

async function manageDiy(args) {
    const action = String((args && args.action) || "list");
    const list = (settings.get("diyCards") || []).slice();
    if (action === "list") return await diyListText();
    if (action === "editor") {
        // 交给界面层打开图形编辑器（数据层不 import 界面层，走 registry）
        if (registry.has("ui:diy")) { await registry.call("ui:diy", { name: (args && args.name) || "" }); return "已打开 DIY 图形编辑器。"; }
        return "当前环境不支持弹窗，可用 add 动作直接创建。";
    }
    if (action === "add" || action === "edit") {
        const card = normalizeDiyCard(args);
        if (!card.name) return "DIY 卡至少要有一个名字。";
        const i = list.findIndex(function (c) { return c.name === card.name; });
        if (i >= 0) list[i] = card; else list.push(card);
        settings.save({ [STATS_KEYS.diy]: list });
        return "已" + (i >= 0 ? "更新" : "新建") + "DIY 卡【" + card.name + "】\n" + diyTypeText(card);
    }
    if (action === "del" || action === "delete") {
        const name = String((args && args.name) || "").trim();
        const next = list.filter(function (c) { return c.name !== name; });
        if (next.length === list.length) return "没有找到叫「" + name + "」的 DIY 卡。";
        settings.save({ [STATS_KEYS.diy]: next });
        return "已删除 DIY 卡【" + name + "】";
    }
    return "未知动作：" + action + "（可用 list / add / edit / del）";
}

/** 4b) 注册能力 */
function registerCollection() {
    registry.provide("tool:collection", async function (args) { return await collectionText(args || {}); });
    registry.provide("tool:shop", async function (args) { return await shopText(args || {}); });
    registry.provide("tool:diy", async function (args) { return await manageDiy(args || {}); });
    registry.provide("cmd:alias", async function (args) {
        const raw = String((args && (args.query || args.arg || args.text)) || "").trim();
        if (raw && /[=＝:：]/.test(raw)) {
            const i = raw.search(/[=＝:：]/);
            const added = learnAlias(raw.slice(0, i), raw.slice(i + 1).replace(/^[=＝:：]+/, "").trim());
            return (added ? "✅ 已添加俗称：" : "ℹ️ 这条俗称已存在：") + raw.trim() + "\n\n" + aliasText();
        }
        return aliasText();
    });
    registry.provide("resolveAliasName", async function (name) { return resolveAliasName(name); });
    registry.provide("applyAliasesToText", async function (text) { return applyAliasesToText(text); });
    registry.provide("learnAlias", async function (args) { return learnAlias(args && args.from, args && args.to); });
    registry.provide("collection:add", async function (ids) { return addToCollection(ids); });
    // 对外接口 export()/import() 依赖这两个能力（以前只有 has() 判断、没人 provide，收藏册导出恒空、导入静默跳过）
    registry.provide("collection:state", async function () { return collectionState(); });
    registry.provide("collection:import", async function (args) {
        const a = args || {};
        const incoming = a.collection || a.state || {};
        const mode = String(a.mode || "merge");
        const cur = collectionState();
        const srcMap = (incoming && typeof incoming.map === "object" && incoming.map) ? incoming.map
            : (incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : {});
        const map = mode === "replace" ? {} : Object.assign({}, cur.map);
        let kindsAdded = 0;
        for (const key of Object.keys(srcMap)) {
            const n = Math.max(0, Number(srcMap[key]) || 0);
            if (!map[key]) kindsAdded++;
            map[key] = mode === "replace" ? n : (Number(map[key]) || 0) + n;
        }
        const total = Object.keys(map).reduce(function (sum, k) { return sum + (Number(map[k]) || 0); }, 0);
        const recent = (Array.isArray(incoming.recent) && incoming.recent.length ? incoming.recent : cur.recent).slice(0, 30);
        settings.save({ [STATS_KEYS.collection]: map, [STATS_KEYS.total]: total, [STATS_KEYS.recent]: recent });
        log("数据", "收藏册导入：" + mode + " → " + Object.keys(map).length + " 种 / " + total + " 张");
        return { ok: true, mode: mode, kinds: Object.keys(map).length, kindsAdded: kindsAdded, total: total };
    });
    registry.provide("runAction:collection", async function (trigger) {
        const a = trigger && trigger.action;
        if (a === "shop") return [{ name: "每日商店", text: await shopText({}) }];
        if (a === "album") return [{ name: "收藏册", text: await collectionText({}) }];
        if (a === "alias") return [{ name: "俗称表", text: aliasText() }];
        if (a === "buy") return [{ name: "购买", text: await buyCard(trigger.arg) }];
        return [];
    });
    log("数据", "收集/商店/DIY/俗称能力已注册");
}

const collection = { shopPool, STATS_KEYS, buyCard, aliasMap, resolveAliasName, applyAliasesToText, learnAlias, DIY_CATEGORIES, DIY_MONSTER_FRAMES, parseAliases, applyAliases, diyTypeText, normalizeDiyCard, seededRandom, shopSeed, chatScopeKey, pickSeeded, todayKey, collectionState, addToCollection, collectionText, shopText, aliasText, diyListText, manageDiy, registerCollection };

return { STATS_KEYS, DIY_CATEGORIES, DIY_MONSTER_FRAMES, parseAliases, aliasMap, resolveAliasName, applyAliasesToText, learnAlias, applyAliases, diyTypeText, normalizeDiyCard, seededRandom, shopPool, shopSeed, chatScopeKey, pickSeeded, todayKey, collectionState, addToCollection, buyCard, collectionText, shopText, aliasText, diyListText, manageDiy, registerCollection, collection };
});

__def("src/data/deck.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");
const { getStatsIndex, getSetnames, normalizeKey } = __req("src/data/indexes.js");
const { splitSetcodes, fieldNamesOf } = __req("src/data/setcodes.js");
const { seededRandom, todayKey } = __req("src/data/collection.js");
const { settings } = __req("src/core/settings.js");
const { imageUrl } = __req("src/data/cards.js");
const { getLimits } = __req("src/data/rules.js");

/** ── 统一模板（数据模块）：常量 → 纯函数 → 业务 → register → exports ── */

/** 1) 常量：官方规则里本地可判定的部分 */
const RULES = { mainMin: 40, mainMax: 60, extraMax: 15, sideMax: 15, sameNameMax: 3 };

/** 2) 纯函数 */
/** 解析卡表文本：支持 "3 卡名" / "卡名 x3" / "卡名"；支持分区标记 */
/**
 * 从任意文本里取 <deck>…</deck> 包裹的卡表（允许属性、大小写、全角尖括号；也认 <牌组>／<卡组>）。
 * 典型用途：角色卡/最新消息里写的卡组块。
 */
function extractDeckBlock(text) {
    const raw = String(text === undefined || text === null ? "" : text).replace(/＜/g, "<").replace(/＞/g, ">");
    const m = /<(?:deck|卡组|牌组)\b[^>]*>([\s\S]*?)<\/(?:deck|卡组|牌组)\s*>/i.exec(raw);
    return m ? String(m[1]).trim() : "";
}

/** 从聊天记录里找最近的 <deck> 块（从最新一条往前找，最多看 limit 条） */
function deckFromChat(chat, limit) {
    const list = Array.isArray(chat) ? chat : [];
    const max = Math.max(1, Math.min(50, Number(limit) || 10));
    for (let i = list.length - 1; i >= 0 && i >= list.length - max; i--) {
        const msg = list[i];
        if (!msg || typeof msg !== "object") continue;
        const body = String(msg.mes !== undefined ? msg.mes : (msg.content !== undefined ? msg.content : ""));
        if (body.indexOf("deck") < 0 && body.indexOf("<卡组") < 0 && body.indexOf("<牌组") < 0) continue;
        const block = extractDeckBlock(body);
        if (block) { log("卡组", "从第 " + (i + 1) + " 条消息的 <deck> 块读到卡表（" + block.split("\n").filter(Boolean).length + " 行）"); return block; }
    }
    return "";
}

/** 卡组文本的来源：优先显式传入，其次读聊天里的 <deck> 块 */
function deckArgText(args) {
    // 参数可以是 {deck} 对象，也可以直接是卡表字符串（deckimage 里就是传字符串）
    const own = String((typeof args === "string" ? args : ((args && (args.deck || args.text)) || ""))).trim();
    if (own) return { text: own, fromChat: false };
    const c = ctx();
    const fromChat = deckFromChat(c && c.chat);
    return { text: fromChat, fromChat: !!fromChat };
}
function parseDeckText(text) {
    const out = { main: [], extra: [], side: [] };
    let bucket = "main";
    for (const raw of String(text || "").split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        if (/^(#+\s*)?(主卡组|main)$/i.test(line)) { bucket = "main"; continue; }
        if (/^(#+\s*)?(额外卡组|额外|extra)$/i.test(line)) { bucket = "extra"; continue; }
        if (/^(#+\s*)?(副卡组|副|side)$/i.test(line)) { bucket = "side"; continue; }
        if (line[0] === "#" || line[0] === "!") continue;
        let count = 1, name = line;
        let m = /^(\d+)\s*[x×*]?\s*(.+)$/.exec(line);
        if (m) { count = Number(m[1]) || 1; name = m[2].trim(); }
        else { m = /^(.+?)\s*[x×*]\s*(\d+)$/.exec(line); if (m) { name = m[1].trim(); count = Number(m[2]) || 1; } }
        name = name.replace(/^\d+\s*[x×*]?\s*/, "").trim();
        if (!name) continue;
        out[bucket].push({ name: name, count: Math.max(1, Math.min(99, count)) });
    }
    return out;
}

function deckSize(deck) { return deck.main.reduce(function (n, e) { return n + e.count; }, 0); }
function extraSize(deck) { return (deck.extra || []).reduce(function (n, e) { return n + e.count; }, 0); }
function sideSize(deck) { return (deck.side || []).reduce(function (n, e) { return n + e.count; }, 0); }

/** 把名字归并成"每张卡投入总数"（同名卡在三个区里也算总投入） */
function mergeByName(deck) {
    const map = new Map();
    for (const zone of ["main", "extra", "side"]) {
        for (const e of deck[zone] || []) {
            const key = normalizeKey(e.name);
            const cur = map.get(key) || { name: e.name, count: 0, zones: [] };
            cur.count += e.count;
            if (cur.zones.indexOf(zone) < 0) cur.zones.push(zone);
            map.set(key, cur);
        }
    }
    return map;
}

/** 本地可判定的卡组问题（数量 / 同名 / 禁限）；禁止卡与限制卡按当前禁限表 */
function deckProblems(deck, limits, region) {
    const problems = [];
    const main = deckSize(deck), extra = extraSize(deck), side = sideSize(deck);
    if (main < RULES.mainMin || main > RULES.mainMax) problems.push("主卡组 " + main + " 张（应为 " + RULES.mainMin + "-" + RULES.mainMax + " 张）");
    if (extra > RULES.extraMax) problems.push("额外卡组 " + extra + " 张（最多 " + RULES.extraMax + " 张）");
    if (side > RULES.sideMax) problems.push("副卡组 " + side + " 张（最多 " + RULES.sideMax + " 张）");
    const merged = mergeByName(deck);
    for (const entry of merged.values()) {
        if (entry.count > RULES.sameNameMax) problems.push("「" + entry.name + "」投入 " + entry.count + " 张（同名卡最多 " + RULES.sameNameMax + " 张）");
    }
    return { problems: problems, main: main, extra: extra, side: side, merged: merged };
}

/** 禁限检查需要卡库（单独一步，避免离线时整块失败） */
async function banlistProblems(merged, limits, region) {
    const out = [];
    const stats = await getStatsIndex();
    for (const entry of merged.values()) {
        const row = stats.byName.get(normalizeKey(entry.name));
        if (!row) { out.push("「" + entry.name + "」在本地卡库里找不到（译名可能有出入）"); continue; }
        const r = (limits || {})[region] || (limits || {}).cn;
        if (!r) continue;
        const keys = [String(row.cid || ""), String(row.id || "")];
        if (keys.some(function (k) { return r.forbidden.has(k); })) out.push("「" + row.name + "」是禁止卡，不能投入");
        else if (keys.some(function (k) { return r.limited.has(k); }) && entry.count > 1) out.push("「" + row.name + "」是限制卡（1 张），当前投入 " + entry.count + " 张");
        else if (keys.some(function (k) { return r.semi.has(k); }) && entry.count > 2) out.push("「" + row.name + "」是准限制卡（2 张），当前投入 " + entry.count + " 张");
    }
    return out;
}

/** 区域显示名（面板「查询内容 → 禁限表区域」用哪块表就显示哪块） */
function regionNameOf(region) {
    return region === "ja" || region === "jp" ? "OCG 日文" : region === "en" ? "TCG 英文" : "官方简中";
}
function validateDeckText(deck, limits, region) {
    const base = deckProblems(deck, limits, region);
    const lines = ["📋 卡组校验", "主卡组 " + base.main + " 张 / 额外 " + base.extra + " 张 / 副卡组 " + base.side + " 张，合计 " + (base.main + base.extra + base.side) + " 张"];
    const regionName = region === "jp" ? "OCG 日文" : region === "en" ? "TCG 英文" : "官方简中";
    if (base.problems.length) { lines.push("", "❌ 数量/同名问题 " + base.problems.length + " 处："); for (const p of base.problems) lines.push("· " + p); }
    else lines.push("", "✅ 数量与同名限制没有问题。");
    return { text: lines.join("\n"), base: base };
}

/** 起手模拟：rng 可注入 → 可确定性测试 */
function simulateHand(pool, draw, runs, random) {
    const rnd = random || Math.random;
    const results = [];
    for (let r = 0; r < Math.max(1, Number(runs) || 1); r++) {
        const list = pool.slice();
        const hand = [];
        // 注意：上限必须在抽牌前算好。之前写成 Math.min(draw, list.length) 放在条件里，
        // list 会随抽牌变短，导致抽到一半就退出（6 张牌抽 5 张只出 3 张）。
        const want = Math.max(1, Math.min(Number(draw) || 5, list.length));
        while (hand.length < want) {
            const i = Math.floor(rnd() * list.length) % list.length;
            hand.push(list.splice(i, 1)[0]);
        }
        results.push(hand);
    }
    return results;
}

/**
 * 系列/字段检索：名字命中 + setcode 解码命中。
 * ★ 必须是"整块命中"：以前写成"十进制文本里能切出这个码就算"，结果字段码 1（正义盟军）
 *   会把 setcode=152、14549056… 这些卡全算成成员（实测 14281 张里命中 1828 张）。
 */
function decodeSetcodes(digits, codeSet) {
    if (!codeSet || typeof codeSet.has !== "function") return [];
    const found = [];
    for (const code of splitSetcodes(digits)) {
        const key = String(code);
        if (codeSet.has(key) && found.indexOf(key) < 0) found.push(key);
    }
    return found;
}

/** 字段名 → 十进制 code 集合（setnames 键是十六进制） */
async function seriesCodes(series) {
    const setnames = await getSetnames();
    const key = normalizeKey(series);
    const codes = new Set();
    const labelOf = function (v) { return typeof v === "string" ? v : String((v && (v.cn || v.sc || v.jp)) || ""); };
    for (const [hex, raw] of setnames) {
        const label = labelOf(raw);
        const n = normalizeKey(label);
        if (!n) continue;
        if (n === key || n.indexOf(key) >= 0 || key.indexOf(n) >= 0) codes.add(String(parseInt(hex, 16)));
    }
    return codes;
}

async function seriesMembers(series) {
    const stats = await getStatsIndex();
    const key = normalizeKey(series);
    const byName = stats.rows.filter(function (r) {
        if (normalizeKey(r.name).indexOf(key) >= 0) return true;
        return r.aliases.some(function (a) { return normalizeKey(a).indexOf(key) >= 0; });
    });
    const codes = await seriesCodes(series);
    const byCode = codes.size ? stats.rows.filter(function (r) { return decodeSetcodes(r.setcode, codes).length > 0; }) : [];
    const map = new Map();
    for (const r of byName) map.set(r.id, r);
    for (const r of byCode) if (!map.has(r.id)) map.set(r.id, r);
    return { members: [...map.values()], byName: byName.length, byCode: byCode.length, codes: codes.size };
}

/** 3) 业务文本 */
async function seriesText(series) {
    const res = await seriesMembers(series);
    if (!res.members.length) return "没有找到「" + String(series || "") + "」相关的卡（可以换官方译名/字段名再试）。";
    const names = res.members.map(function (r) { return r.name; });
    return "【" + series + "】共 " + res.members.length + " 张（名字命中 " + res.byName + "，字段码命中 " + res.byCode + "）：\n" + names.slice(0, 60).join("、") + (names.length > 60 ? " …" : "");
}

async function handText(args) {
    const picked = deckArgText(args);
    const deck = parseDeckText(picked.text);
    const stats = await getStatsIndex();
    const pool = [];
    for (const e of deck.main) {
        const row = stats.byName.get(normalizeKey(e.name));
        if (row) for (let i = 0; i < e.count; i++) pool.push(row);
    }
    if (!pool.length) return "卡表里没有能在本地卡库匹配到的卡（请检查译名）。";
    const draw = Math.max(1, Math.min(15, Number(args.draw) || Number(settings.get("handDraw")) || 5));
    const runs = Math.max(1, Math.min(200, Number(args.runs) || Number(settings.get("handRuns")) || 1));   // 面板「玩法 → 起手模拟次数」
    const rnd = seededRandom(String(args.seed || "hand"));
    const results = simulateHand(pool, draw, runs, rnd);
    const lines = ["🃏 起手模拟（主卡组 " + pool.length + " 张，抽 " + draw + " 张" + (runs > 1 ? "，" + runs + " 次" : "") + "）"];
    results.forEach(function (hand, i) {
        lines.push("", (runs > 1 ? "第 " + (i + 1) + " 次：" : "") + hand.map(function (r) { return r.name; }).join("、"));
        if (settings.get("handImages") !== false) {
            lines.push(hand.map(function (r) { return "![](" + imageUrl(r.id) + ")"; }).join(" "));
        }
    });
    return lines.join("\n");
}

/** 4) 注册能力 */
function registerDeck() {
    // 对外能力：setcode（十进制或 0x 十六进制）→ 字段名数组（唯一调用方 cards.js 要的就是名字）
    registry.provide("decodeSetcodes", async function (args) {
        const raw = Array.isArray(args) ? args : ((args && (args.codes || args.setcode || args.query)) || []);
        const list = Array.isArray(raw) ? raw : [raw];
        const setnames = await getSetnames();
        const names = [];
        for (const item of list) for (const nm of fieldNamesOf(setnames, item)) if (names.indexOf(nm) < 0) names.push(nm);
        return names;
    });
    registry.provide("tool:deck", async function (args) {
        const picked = deckArgText(args);
        const deck = parseDeckText(picked.text);
        if (!deck.main.length) return picked.fromChat ? "聊天里没有 <deck>…</deck> 卡表块。把卡组写成 <deck>…</deck>（每行「3 卡名」）发一条消息，或直接把卡表贴给我。" : "卡表是空的：请按「3 卡名」每行一张贴给我。";
        const region = settings.get("banlistRegion") || "cn";
        const base = validateDeckText(deck, null, region);
        let text = base.text;
        try {
            const limits = await getLimits();
            const extra = await banlistProblems(base.base.merged, limits, region);
            const unknown = extra.filter(function (x) { return x.indexOf("找不到") >= 0; });
            const real = extra.filter(function (x) { return x.indexOf("找不到") < 0; });
            if (real.length) text += "\n\n❌ 禁限问题 " + real.length + " 处：\n" + real.map(function (x) { return "· " + x; }).join("\n");
            else text += "\n\n✅ 禁限表检查通过（" + (regionNameOf(region)) + "）。";
            if (unknown.length) text += "\n\n（另有 " + unknown.length + " 张在本地卡库没找到，已跳过：" + unknown.slice(0, 5).map(function (x) { return x.replace(/^「|」.*$/g, ""); }).join("、") + "）";
        } catch (error) { text += "\n\n（禁限表不可用，本次只做了数量与同名检查）"; }
        return (picked.fromChat ? "（卡表来自聊天里的 <deck> 块）\n\n" : "") + text;
    });
    registry.provide("tool:hand", async function (args) { return await handText(args || {}); });
    registry.provide("tool:series", async function (args) { return await seriesText(args && args.series); });
    registry.provide("runAction:deck", async function (trigger) {
        const a = trigger && trigger.action;
        if (a === "series") return [{ name: "系列卡表", text: await seriesText(trigger.arg) }];
        if (a === "deck") return [];
        return [];
    });
    // ★ 自然语言触发词「起手模拟 / 起手概率」：读聊天里的 <deck> 卡表（与 /ygohand 同一套逻辑）。
    //   以前 hand 这个动作没有任何数据模块实现，触发词命中后同样什么都不注入。
    registry.provide("runAction:hand", async function (trigger) {
        if (!trigger || trigger.action !== "hand") return [];
        const picked = deckArgText("");
        const deck = parseDeckText(picked.text);
        if (!deck.main.length) return [{ name: "起手模拟", text: "要模拟起手的话，先把卡组贴出来（每行「3 卡名」），或写成 <deck>…</deck> 块发一条消息。" }];
        const arg = String(trigger.arg || "").trim();
        const draw = /^d{1,3}$/.test(arg) ? Number(arg) : undefined;
        return [{ name: "起手模拟", text: await handText({ deck: picked.text, draw: draw }) }];
    });
    log("数据", "卡组能力已注册（deck/hand/series）");
}

const deckMod = { extractDeckBlock, deckFromChat, deckArgText, RULES, parseDeckText, deckSize, extraSize, sideSize, mergeByName, deckProblems, banlistProblems, validateDeckText, simulateHand, decodeSetcodes, seriesCodes, seriesMembers, seriesText, handText, registerDeck };

return { RULES, extractDeckBlock, deckFromChat, deckArgText, parseDeckText, deckSize, extraSize, sideSize, mergeByName, deckProblems, banlistProblems, regionNameOf, validateDeckText, simulateHand, decodeSetcodes, seriesCodes, seriesMembers, seriesText, handText, registerDeck, deckMod };
});

__def("src/data/indexes.js", function (__req) {
const { log } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");
const { dataFile, dataFileCached, lazyIndex } = __req("src/core/http.js");

/** ── 统一模板（数据模块）：常量 → 纯函数 → 懒索引 → register → exports ── */

/** 1) 常量 */
const FILES = { names: "card-names.txt", stats: "card-stats.tsv", setnames: "setnames.json" };

let readText = function (name) { return dataFileCached(name); };   // 默认：带 IndexedDB 持久缓存（重启免重下）
/** 注入读取器（测试时用本地文件；运行时用 dataFile） */
function configure(options) {
    if (options && typeof options.readText === "function") readText = options.readText;
}

/** 2) 纯函数 */
/** 归一化：全角转半角、去装饰与标点，和 detect.normalize 保持同一套规则 */
function normalizeKey(text) {
    let s = String(text === undefined || text === null ? "" : text);
    if (typeof s.normalize === "function") s = s.normalize("NFKC");
    return s.replace(/[\u200b-\u200f\uFE0F]/g, "").replace(/[「」『』《》【】〖〗\[\]()（）・·\s]/g, "").trim();
}

/** card-names.txt：每行一个 JSON 字符串 */
function parseNames(text) {
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
function parseStats(text) {
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
function parseSetnames(textOrObject) {
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
const getNameIndex = lazyIndex(async function () { return parseNames(await readText(FILES.names)); });
const getStatsIndex = lazyIndex(async function () { return parseStats(await readText(FILES.stats)); });
const getSetnames = lazyIndex(async function () { return parseSetnames(await readText(FILES.setnames)); });

/** ★ 重置懒索引：手动安装/卸载卡库、清缓存之后调用，下一次查询就会重新读数据源。
 *  没有它的时候：先在没库的状态下查过一次卡（索引被解析成空并缓存），装完库本会话仍然查不到，
 *  必须刷新页面 —— 实测就是这个坑。 */
function resetIndexes() {
    try { getNameIndex.reset(); getStatsIndex.reset(); getSetnames.reset(); } catch (error) { /* 忽略 */ }
    log("数据", "卡库索引已重置（下次查询重新读取数据源）");
    return true;
}

/** 4) 注册能力（数据层对外只暴露这几个） */
function registerIndexes() {
    registry.provide("index:names", getNameIndex);
    registry.provide("index:stats", getStatsIndex);
    registry.provide("index:setnames", getSetnames);
    registry.provide("index:reset", async function () { return resetIndexes(); });
    log("数据", "索引能力已注册（names/stats/setnames/reset）");
}

/** 5) 导出 */
const indexes = { FILES, configure, normalizeKey, parseNames, parseStats, parseSetnames, getNameIndex, getStatsIndex, getSetnames, resetIndexes, registerIndexes };

return { FILES, configure, normalizeKey, parseNames, parseStats, parseSetnames, getNameIndex, getStatsIndex, getSetnames, resetIndexes, registerIndexes, indexes };
});

__def("src/data/packs.js", function (__req) {
const { log } = __req("src/core/bus.js");
const { settings } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");
const { fetchJson, cached, lazyIndex } = __req("src/core/http.js");
const { getStatsIndex, getSetnames, normalizeKey } = __req("src/data/indexes.js");
const { addToCollection } = __req("src/data/collection.js");
const { findCard, imageUrl, parseTypeText } = __req("src/data/cards.js");
const { splitSetcodes, fieldNameOf } = __req("src/data/setcodes.js");

/** ── 统一模板（数据模块）：常量 → 纯函数 → 懒索引 → register → exports ── */

/** 1) 常量 */
const RELEASE_URL = "https://ygocdb.com/api/v0/releaseDates.json";
const REGIONS = ["sc", "jp", "en"];
const REGION_LABEL = { sc: "简中", jp: "日文", en: "英文" };

let fetchImpl = null;
let rng = Math.random;
function configure(options) {
    if (options && typeof options.fetchJson === "function") fetchImpl = options.fetchJson;
    if (options && typeof options.random === "function") rng = options.random;
}
function doFetch(url, ms) { return fetchImpl ? fetchImpl(url, ms) : fetchJson(url, {}, ms); }

/** 2) 纯函数 */
/** 按 地区+包名 分组，还原每个真实卡包的首发卡池 */
function buildPackIndex(rows) {
    const packs = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        const rel = row && row.release;
        if (!rel) continue;
        for (const region of Object.keys(rel)) {
            const info = rel[region] || {};
            const name = String(info.pack || "").trim();
            if (!name) continue;
            const key = region + "|" + name;
            let pack = packs.get(key);
            if (!pack) { pack = { key: key, region: region, name: name, date: String(info.date || ""), cards: [] }; packs.set(key, pack); }
            pack.cards.push(String(row.id));
            if (info.date && (!pack.date || String(info.date) < pack.date)) pack.date = String(info.date);
        }
    }
    return [...packs.values()];
}

function listPacks(index, options) {
    const o = options || {};
    const keyword = normalizeKey(o.keyword || "");
    const region = o.region && o.region !== "any" ? o.region : null;
    const limit = Math.max(1, Math.min(200, Number(o.limit) || 25));
    let list = (index || []).slice();
    if (region) list = list.filter(function (p) { return p.region === region; });
    if (keyword) list = list.filter(function (p) { return normalizeKey(p.name).indexOf(keyword) >= 0; });
    list.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    return { total: list.length, items: list.slice(0, limit) };
}

function findPack(index, name, region) {
    const key = normalizeKey(name || "");
    if (!key) return null;
    const candidates = (index || []).filter(function (p) { return !region || p.region === region; });
    let exact = candidates.filter(function (p) { return normalizeKey(p.name) === key; });
    if (exact.length) return exact[0];
    let partial = candidates.filter(function (p) { return normalizeKey(p.name).indexOf(key) >= 0; });
    if (partial.length) { partial.sort(function (a, b) { return b.cards.length - a.cards.length; }); return partial[0]; }
    return null;
}

/** 从卡池抽 n 张（rng 可注入 → 可确定性测试） */
/** 卡池开关（面板「玩法」组）：关掉的类别不进入卡池 —— 与 v1 同一套判定 */
const POOL_SWITCHES = [["poolSynchro", ["同调"]], ["poolXyz", ["超量"]], ["poolPendulum", ["灵摆"]], ["poolLink", ["连接", "链接"]]];
function poolExcludes(row) {
    const text = String((row && row.typeText) || "");
    for (const pair of POOL_SWITCHES) {
        if (settings.get(pair[0]) === false && pair[1].some(function (k) { return text.indexOf(k) >= 0; })) return true;
    }
    return false;
}
/** 按开关过滤后的卡池（stats 可选，用于把 id 还原成行） */
function poolInPlay(pool, stats) {
    if (!stats) return pool || [];
    return (pool || []).filter(function (id) { const row = stats.byId.get(String(id)); return row ? !poolExcludes(row) : true; });
}
/** 一包抽几张（面板「玩法 → 每包几张」，1-20；v1 默认 5） */
function packCount(args) {
    const a = args || {};
    return Math.max(1, Math.min(20, Number(a.count) || Number(settings.get("packSize")) || 5));
}

function drawFromPool(pool, count, random) {
    const pick = random || rng;
    const list = (pool || []).slice();
    const want = Math.max(1, Math.min(list.length, Number(count) || 1));
    const out = [];
    while (out.length < want && list.length) {
        const i = Math.floor(pick() * list.length) % list.length;
        out.push(list.splice(i, 1)[0]);
    }
    return out;
}

/** 抽到的卡里有没有"额外卡组类型"（用来给 VRM 一个明确的稀有判定，规则写在注释里可复核） */
function isRareDraw(cards) {
    return (cards || []).some(function (c) { return /融合|同调|超量|连接|仪式/.test(String((c && c.typeText) || "")); });
}

/** 开完包触发联动（VRM 表情）；失败/未开都不影响开包结果 */
function firePackReaction(cards) {
    try {
        if (!registry.has("integration:vrm")) return;
        const event = isRareDraw(cards) ? "pack_rare" : "pack_normal";
        Promise.resolve(registry.call("integration:vrm", { event: event })).catch(function () { /* 联动失败不影响开包 */ });
    } catch (error) { /* 忽略 */ }
}

function formatPackDraw(pack, cards) {
    const lines = ["🎴 开卡包：" + pack.name + "（" + REGION_LABEL[pack.region] + (pack.date ? " · " + pack.date : "") + "）"];
    lines.push("该包首发卡池 " + pack.cards.length + " 张，抽 " + cards.length + " 张：");
    for (let i = 0; i < cards.length; i++) {
        lines.push("", "[" + (i + 1) + "] " + cards[i].name + "（" + cards[i].id + "）", cards[i].typeText);
        lines.push("卡图: ![](" + cards[i].image + ")");
    }
    return lines.join("\n");
}

/** 3) 懒索引 */
const getReleaseRows = lazyIndex(async function () {
    // 只把"成功且非空"的结果写进缓存：否则一次断网会让卡包功能瘫 12 小时
    try {
        return await cached("releases", 12 * 3600 * 1000, async function () {
            const rows = await doFetch(RELEASE_URL, 60000);
            if (!Array.isArray(rows) || !rows.length) throw new Error("发售表为空");
            return rows;
        });
    } catch (error) {
        log("数据", "卡包发售表取不到（" + (error && error.message ? error.message : error) + "）：卡包功能暂时退化为按本地卡库随机抽卡");
        return [];
    }
});
const getPackIndex = lazyIndex(async function () {
    const rows = await getReleaseRows();
    const index = buildPackIndex(rows);
    log("数据", "卡包索引已建立：" + index.length + " 个卡包");
    return index;
});

/** 行(带 image/name/typeText) 组装：供开包展示 */
async function rowsToCards(ids) {
    const stats = await getStatsIndex();
    const out = [];
    for (const id of ids) {
        const row = stats.byId.get(String(id));
        if (!row) continue;
        out.push({ id: row.id, cid: row.cid, name: row.name, typeText: row.typeText, image: imageUrl(row.id) });   // 9 位先行卡图源由 imageUrl 统一处理
    }
    return out;
}

/** 4) 业务文本（工具与命令共用） */
async function openPackText(args) {
    const index = await getPackIndex();
    if (args.pack && !index.length) return "卡包发售表取不到（要联网访问 ygocdb 的发售数据）：现在只能用「/ygodraw」按本地卡库随机抽卡，或稍后再试。";
    const region = args.region && REGIONS.indexOf(args.region) >= 0 ? args.region : (settings.get("packRegion") || "sc");   // 面板「玩法 → 卡包地区」
    const minSize = Math.max(1, Number(settings.get("packMinSize")) || 20);   // 面板「玩法 → 卡池下限」
    let pack = args.pack ? findPack(index, args.pack, args.region ? region : null) : null;
    if (pack && minSize > 1 && (pack.cards || []).length < minSize) { log("数据", "卡包「" + pack.name + "」卡池 " + (pack.cards || []).length + " 张 < 下限 " + minSize + "，改随机抽"); pack = null; }
    if (!pack) {
        // 没指定包名时：从卡库里随机抽（保底体验，不编造卡包）
        const stats = await getStatsIndex();
        const pool = stats.rows.map(function (r) { return r.id; });
        const picked = drawFromPool(poolInPlay(pool.concat(diyPoolEntries().map(function (d) { return d.id; })), stats), packCount(args), rng);
        const cards = await rowsToCards(picked);
        try { addToCollection(picked); } catch (error) { /* 卡册记录失败不影响抽卡 */ }
        return "🎴 没有指定卡包名，从现有卡库随机抽 " + cards.length + " 张：\n" + cards.map(function (c, i) { return (i + 1) + ". " + c.name; }).join("\n");
    }
    const picked = drawFromPool(pack.cards, packCount(args), rng);
    const cards = await rowsToCards(picked);
    try { addToCollection(picked); } catch (error) { /* 卡册记录失败不影响抽卡 */ }
    firePackReaction(cards);
    return formatPackDraw(pack, cards);
}

async function listPacksText(args) {
    const index = await getPackIndex();
    const region = args.region || settings.get("packRegion") || "sc";   // 面板「玩法 → 卡包地区」
    const res = listPacks(index, { keyword: args.keyword, region: region, limit: 25 });
    if (!res.total) return "没有找到匹配的卡包。";
    const lines = ["卡包列表（" + (args.region ? REGION_LABEL[args.region] || args.region : "优先 " + (REGION_LABEL[region] || region)) + "，共 " + res.total + " 个匹配，按发售时间倒序显示 " + res.items.length + " 个）："];
    for (const p of res.items) lines.push("- " + p.name + "（" + (p.date || "未知") + " · " + REGION_LABEL[p.region] + " · " + p.cards.length + " 张）");
    return lines.join("\n");
}

async function searchPacksText(args) {
    const index = await getPackIndex();
    const keyword = String(args.keyword || "").trim();
    if (!keyword) return "想查哪个关键词的卡包？";
    const byName = listPacks(index, { keyword: keyword, limit: 20 });
    const lines = ["🔎 「" + keyword + "」相关卡包"];
    if (byName.total) {
        lines.push("", "【卡包名里含「" + keyword + "」的卡包】" + byName.total + " 个：");
        for (const p of byName.items) lines.push("- " + p.name + "（" + p.date + " · " + REGION_LABEL[p.region] + "）");
    } else lines.push("", "【卡包名里含「" + keyword + "」的卡包】没有这样的卡包。");
    // 由卡名反查：该系列卡出现在哪些包里
    const stats = await getStatsIndex();
    const key = normalizeKey(keyword);
    const members = stats.rows.filter(function (r) { return normalizeKey(r.name).indexOf(key) >= 0; }).slice(0, 200);
    if (members.length) {
        const ids = new Set(members.map(function (r) { return r.id; }));
        const hit = index.filter(function (p) { return p.cards.some(function (id) { return ids.has(id); }); });
        hit.sort(function (a, b) { return b.cards.filter(function (id) { return ids.has(id); }).length - a.cards.filter(function (id) { return ids.has(id); }).length; });
        lines.push("", "【含「" + keyword + "」系列卡（" + members.length + " 张）的卡包】" + hit.length + " 个：");
        for (const p of hit.slice(0, 10)) {
            const n = p.cards.filter(function (id) { return ids.has(id); }).length;
            lines.push("- " + p.name + "（" + p.date + " · " + REGION_LABEL[p.region] + " · 含 " + n + " 张）");
        }
    }
    return lines.join("\n");
}

/** DIY 卡进卡池：把「设置里的 DIY 卡」做成和真实卡同形的条目（id 用 diy: 前缀，便于识别） */
function diyPoolEntries() {
    if (settings.get("shopIncludeDiy") === false) return [];   // 面板「玩法 → DIY 卡也进商店 / 卡库抽卡」
    const out = [];
    for (const c of (settings.get("diyCards") || [])) {
        if (!c || !c.name) continue;
        out.push({ id: "diy:" + String(c.name), name: String(c.name), typeText: "[DIY 卡] " + String(c.typeText || ""), image: "" });
    }
    return out;
}

/** 把 DIY 条目转成展示用文本（没有卡图） */
function diyLine(entry, index) {
    return "[" + (index + 1) + "] " + entry.name + "\n" + entry.typeText + (entry.image ? "\n![](" + entry.image + ")" : "\n（DIY 卡，没有卡图）");
}

/**
 * 抽卡池：把工具声明的筛选条件（kind/attribute/race/atk_min/archetype）真的用上。
 * 以前 drawText 只读 count，模型按 schema 传 kind=魔法 attribute=光 也会拿回全库随机卡。
 */
async function drawPoolFor(args) {
    const a = args || {};
    const stats = await getStatsIndex();
    const kind = String(a.kind || "").trim();
    const attribute = String(a.attribute || "").trim();
    const race = String(a.race || "").trim();
    const atkMin = Number(a.atk_min);
    const archetype = String(a.archetype || "").trim();
    const KIND_MATCH = { "怪兽": "[怪兽", "魔法": "[魔法", "陷阱": "[陷阱" };
    let rows = stats.rows.slice();
    if (kind && KIND_MATCH[kind]) rows = rows.filter(function (r) { return String(r.typeText || "").indexOf(KIND_MATCH[kind]) >= 0; });
    if (attribute) rows = rows.filter(function (r) { return String(r.typeText || "").indexOf(attribute) >= 0; });
    if (race) rows = rows.filter(function (r) { return String(r.typeText || "").indexOf(race) >= 0; });
    if (Number.isFinite(atkMin) && atkMin > 0) rows = rows.filter(function (r) { const t = parseTypeText(r.typeText); return t.atk !== "" && !isNaN(Number(t.atk)) && Number(t.atk) >= atkMin; });
    if (archetype) {
        // 字段：名字/俗称命中 ∪ setcode 位域整块命中（与 cards.js / deck.js 同一套判定）
        const setnames = await getSetnames();
        const key = normalizeKey(archetype);
        const wanted = new Set();
        for (const [hex, raw] of setnames) {
            const label = typeof raw === "string" ? raw : String((raw && (raw.cn || raw.sc || raw.jp)) || "");
            const nk = normalizeKey(label);
            if (!nk) continue;
            if (nk === key || nk.indexOf(key) >= 0 || key.indexOf(nk) >= 0) wanted.add(parseInt(hex, 16));
        }
        const byName = rows.filter(function (r) { return normalizeKey(r.name).indexOf(key) >= 0 || (r.aliases || []).some(function (x) { return normalizeKey(x).indexOf(key) >= 0; }); });
        const byCode = wanted.size ? rows.filter(function (r) { return splitSetcodes(r.setcode).some(function (c) { return wanted.has(c); }); }) : [];
        const map = new Map();
        for (const r of byName) map.set(r.id, r);
        for (const r of byCode) map.set(r.id, r);
        rows = Array.from(map.values());
    }
    const pool = rows.map(function (r) { return r.id; });
    const diy = diyPoolEntries();
    for (const d of diy) {
        const t = String(d.typeText || "");
        if (kind && KIND_MATCH[kind] && t.indexOf(KIND_MATCH[kind]) < 0) continue;
        if (attribute && t.indexOf(attribute) < 0) continue;
        if (race && t.indexOf(race) < 0) continue;
        pool.push(d.id);
    }
    return { pool: poolInPlay(pool, stats), diy: diy, matched: rows.length, filters: { kind: kind, attribute: attribute, race: race, atkMin: Number.isFinite(atkMin) ? atkMin : 0, archetype: archetype } };
}
/** 筛选条件 → 一行人类可读文本（结果里明示用了哪些条件，不再"静默忽略"） */
function describeFilters(f) {
    const parts = [];
    if (f.kind) parts.push("类型=" + f.kind);
    if (f.attribute) parts.push("属性=" + f.attribute);
    if (f.race) parts.push("种族=" + f.race);
    if (f.atkMin) parts.push("攻击≥" + f.atkMin);
    if (f.archetype) parts.push("字段/系列=" + f.archetype);
    return parts.length ? parts.join(" · ") : "";
}

async function drawText(args) {
    const a = args || {};
    const stats = await getStatsIndex();
    const info = await drawPoolFor(a);
    const filters = describeFilters(info.filters);
    if (!info.pool.length) return "🎲 没有符合条件的卡（" + (filters || "卡池为空") + "）。放宽条件再试，或用 search_yugioh_cards 先查名字。";
    const picked = drawFromPool(info.pool, Number(a.count) || 2, rng);
    try { addToCollection(picked); } catch (error) { /* 卡册记录失败不影响抽卡 */ }
    const diyMap = new Map(info.diy.map(function (d) { return [d.id, d]; }));
    const rows = [];
    const realIds = picked.filter(function (id) { return !diyMap.has(String(id)); });
    const realCards = await rowsToCards(realIds);
    let ri = 0;
    for (const id of picked) {
        const d = diyMap.get(String(id));
        rows.push(d ? diyLine(d, rows.length) : (function () { const c = realCards[ri++]; return c ? "[" + rows.length + "] " + c.name + "\n" + c.typeText + "\n![](" + c.image + ")" : ""; })());
    }
    return "🎲 随机抽卡（卡库共 " + stats.rows.length + " 张" + (info.diy.length ? " + DIY " + info.diy.length + " 张" : "")
        + (filters ? "；筛选：" + filters + " → 符合 " + info.matched + " 张" : "") + "）\n" + rows.filter(Boolean).join("\n\n");
}

/** 触发词派发（拦截器用 runAction） */
async function runAction(trigger) {
    const action = trigger && trigger.action;
    const arg = trigger && trigger.arg;
    if (action === "pack") return [{ name: "开卡包", text: await openPackText({ pack: arg }) }];
    if (action === "draw") return [{ name: "抽卡", text: await drawText({ count: 2 }) }];
    if (action === "packsearch") {
        // 没有关键词就明确问回去，绝不替用户猜一个卡名（曾经这里写死 "青眼"，导致查什么都是青眼）
        if (!String(arg || "").trim()) return [{ name: "卡包查询", text: "想查哪个系列的卡包？例如「白银城卡包有哪些」或「查卡包 黑魔导」。" }];
        return [{ name: "卡包查询", text: await searchPacksText({ keyword: arg }) }];
    }
    return [];
}

/** 4b) 注册能力 */
function registerPacks() {
    registry.provide("tool:pack", async function (args) { return await openPackText(args || {}); });
    registry.provide("tool:packlist", async function (args) { return await listPacksText(args || {}); });
    registry.provide("tool:packsearch", async function (args) { return await searchPacksText(args || {}); });
    registry.provide("tool:draw", async function (args) { return await drawText(args || {}); });
    registry.provide("runAction", async function (trigger) { return await runAction(trigger); });
registry.provide("releaseDateOf", async function (id) { return await releaseDateOf(id); });
    registry.provide("index:packs", getPackIndex);
    log("数据", "卡包能力已注册（pack/packlist/packsearch/draw/runAction）");
}


/** 某张卡的首次发售日期（扫本地发售记录；找不到返回空串） *//**
 * 某张卡的首次发售日期。
 * 真实数据形状（踩过的坑）：releaseDates.json 是**数组**，元素形如
 *   { cid, id, release: { jp: { date, pack }, en: { … }, sc: { … } } }
 * 旧实现找的是 r.cards / r.card / r.date —— 这三个字段都不存在，所以「首次发售」一直是空的。
 * 这里按 r.id 查，并取各语言地区里**最早**的日期。
 */
async function releaseDateOf(id) {
    const want = String(id || "").trim();
    if (!want) return "";
    try {
        const rows = await getReleaseRows();
        for (const r of (Array.isArray(rows) ? rows : [])) {
            if (!r) continue;
            // 新形状：按 id 精确命中，取各地区最早日期
            if (String(r.id) === want && r.release && typeof r.release === "object") {
                let best = "";
                for (const key of Object.keys(r.release)) {
                    const d = (r.release[key] && r.release[key].date) ? String(r.release[key].date) : "";
                    if (d && (!best || d < best)) best = d;
                }
                if (best) return best;
                continue;
            }
            // 兼容旧形状（{date, cards:[…]}）：留着不碍事
            const ids = Array.isArray(r.cards) ? r.cards : (r.card ? [r.card] : []);
            for (const c of ids) {
                if (String(c) !== want) continue;
                const d = String(r.date || "");
                if (d) return d;
            }
        }
        return "";
    } catch (error) { return ""; }
}
const packs = { isRareDraw, releaseDateOf, RELEASE_URL, REGIONS, REGION_LABEL, configure, buildPackIndex, listPacks, findPack, drawFromPool, formatPackDraw, getReleaseRows, getPackIndex, openPackText, listPacksText, searchPacksText, drawText, runAction, registerPacks };

return { RELEASE_URL, REGIONS, REGION_LABEL, configure, buildPackIndex, listPacks, findPack, POOL_SWITCHES, poolExcludes, poolInPlay, packCount, drawFromPool, isRareDraw, formatPackDraw, getReleaseRows, getPackIndex, openPackText, listPacksText, searchPacksText, diyPoolEntries, drawPoolFor, describeFilters, drawText, runAction, registerPacks, releaseDateOf, packs };
});

__def("src/data/rules.js", function (__req) {
const { log } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");
const { fetchJson, cached, lazyIndex } = __req("src/core/http.js");
const { settings } = __req("src/core/settings.js");
const { getStatsIndex, normalizeKey } = __req("src/data/indexes.js");
const { findCard, cardDetail } = __req("src/data/cards.js");

/** ── 统一模板（数据模块）：常量 → 纯函数 → 懒索引 → register → exports ── */

/** 1) 常量 */
const LIMITS_URL = "https://ygocdb.com/api/v0/limits.json";
const CARD_DETAIL_URL = "https://ygocdb.com/api/v0/card/";
const REGIONS = ["cn", "ja", "en"];
const REGION_LABEL = { cn: "官方简中", ja: "OCG 日文", en: "TCG 英文" };
const STATUS_TEXT = { forbidden: "禁止卡", limited: "限制 1 张", semi: "准限制 2 张", none: "无限制" };   // none 也要有中文标签（否则对外返回 label:"none"）

let fetchImpl = null;
function configure(options) { if (options && typeof options.fetchJson === "function") fetchImpl = options.fetchJson; }
function doFetch(url, ms) { return fetchImpl ? fetchImpl(url, ms) : fetchJson(url, {}, ms); }

/** 2) 纯函数 */
/** 解析禁限表：键是 CID（不是 8 位密码），这一条已用线上数据核对过 */
/** 接口取不到时的空表（形状与 parseLimits 一致）——让调用方走"未取到"分支，而不是让整个能力抛异常 */
function emptyLimits() {
    const one = function () { return { date: "", forbidden: new Set(), limited: new Set(), semi: new Set(), names: { forbidden: {}, limited: {}, semi: {} } }; };
    return { cn: one(), ja: one(), en: one() };
}
function parseLimits(json) {
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
function banlistStatus(limits, region, row) {
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
function tributeNeeded(row) {
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
async function summonText(args) {
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
async function banlistText(region, query) {
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
const KEYWORD_MAX = 200;

/** 官方裁定（网络；失败时明确说明，禁止编造） */
/** 去掉 HTML 标签与常见实体（百鸽的问答原文带标签） */
function stripHtml(text) {
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
function faqList(payload) {
    const p = payload || {};
    if (Array.isArray(p.faqs)) return p.faqs;
    if (p.data && Array.isArray(p.data.faqs)) return p.data.faqs;
    return [];
}

/** 官方裁定（网络；失败时明确说明，禁止编造） */
async function rulingText(args) {
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
function renderCrossRulings(pools, names, keyword, limit) {
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
async function crossRulingText(args) {
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
const getLimits = lazyIndex(async function () {
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
async function runAction(trigger) {
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
async function banlistStatusOf(query) {
    const row = await findCard(query);
    if (!row) return { status: "unknown", label: "未找到这张卡", region: "" };
    const region = settings.get("banlistRegion") || "cn";
    try {
        const limits = await getLimits();
        const status = banlistStatus(limits, region, row);
        return { status: status, label: STATUS_TEXT[status] || status, region: REGION_LABEL[region] || region };
    } catch (error) { return { status: "unknown", label: "禁限表不可用", region: region }; }
}

function registerRules() {
    registry.provide("runAction:rules", async function (trigger) { return await runAction(trigger); });
    registry.provide("banlistStatusOf", async function (q) { return await banlistStatusOf(q); });
registry.provide("tool:banlist", async function (args) { return await banlistText(args && args.region, args && (args.query || args.card)); });
    registry.provide("tool:summon", async function (args) { return registry.has("checkSummon") ? await registry.call("checkSummon", args || {}) : await summonText(args || {}); });
    registry.provide("tool:ruling", async function (args) { return await rulingText(args || {}); });
    registry.provide("ruling:cross", async function (args) { return await crossRulingText(args || {}); });
    registry.provide("index:limits", getLimits);
    log("数据", "规则能力已注册（banlist/summon/ruling）");
}

const rules = { KEYWORD_MAX, crossRulingText, renderCrossRulings, checkSummonDelegated: true, banlistStatusOf, stripHtml, faqList, LIMITS_URL, CARD_DETAIL_URL, REGIONS, REGION_LABEL, STATUS_TEXT, configure, parseLimits, banlistStatus, tributeNeeded, summonText, banlistText, rulingText, getLimits, registerRules };

return { LIMITS_URL, CARD_DETAIL_URL, REGIONS, REGION_LABEL, STATUS_TEXT, configure, emptyLimits, parseLimits, banlistStatus, tributeNeeded, summonText, banlistText, KEYWORD_MAX, stripHtml, faqList, rulingText, renderCrossRulings, crossRulingText, getLimits, runAction, banlistStatusOf, registerRules, rules };
});

__def("src/data/setcodes.js", function (__req) {
const { getSetnames } = __req("src/data/indexes.js");

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
function splitSetcodes(raw) {
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
function fieldNameOf(setnames, code) {
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
function fieldNamesOf(setnames, raw) {
    const out = [];
    for (const code of splitSetcodes(raw)) {
        const name = fieldNameOf(setnames, code);
        if (name && out.indexOf(name) < 0) out.push(name);
    }
    return out;
}

/** 位域文本 → 该卡的全部字段名（含日文名，供"字段: 青眼（青眼の白龍）"用） */
function fieldNamesWithJpOf(setnames, raw) {
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
async function fieldNamesForSetcode(raw) {
    const setnames = await getSetnames();
    return fieldNamesOf(setnames, raw);
}

const setcodes = { splitSetcodes, fieldNameOf, fieldNamesOf, fieldNamesWithJpOf, fieldNamesForSetcode };

return { splitSetcodes, fieldNameOf, fieldNamesOf, fieldNamesWithJpOf, fieldNamesForSetcode, setcodes };
});

__def("src/data/summon.js", function (__req) {
const { log } = __req("src/core/bus.js");
const { settings } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");
const { getStatsIndex, normalizeKey } = __req("src/data/indexes.js");
const { findCard } = __req("src/data/cards.js");
const { tributeNeeded, banlistStatus, getLimits, REGION_LABEL, STATUS_TEXT } = __req("src/data/rules.js");
const { getBoard, applyAction, saveBoard, boardText, SIDE_LABEL } = __req("src/data/board.js");

/** ── 统一模板（数据模块）：常量 → 纯函数 → 判定 → 上盘 → register → exports ── */

/** 1) 常量：召唤方式（与 v1 一致） */
const SUMMON_METHODS = [
    { key: "tribute", label: "上级召唤", re: /^(?:上级召唤|祭品召唤|牲祭召唤|升召)/ },
    { key: "ritual", label: "仪式召唤", re: /^(?:仪式召唤)/ },
    { key: "fusion", label: "融合召唤", re: /^(?:融合召唤)/ },
    { key: "synchro", label: "同调召唤", re: /^(?:同调召唤|同步召唤)/ },
    { key: "xyz", label: "超量召唤", re: /^(?:超量召唤|xyz召唤|多维召唤)/i },
    { key: "link", label: "连接召唤", re: /^(?:链接召唤|连接召唤|link召唤)/i },
    { key: "pendulum", label: "灵摆召唤", re: /^(?:灵摆召唤|摇摆召唤)/ },
    { key: "special", label: "特殊召唤", re: /^(?:特殊召唤|特召)/ },
    { key: "normal", label: "通常召唤", re: /^(?:通常召唤|召唤|盖放|放置)/ },
];
/** 落到盘面时用掉通常召唤次数的方式 */
const USES_NORMAL_SUMMON = ["normal", "tribute"];

/** 2) 纯函数 */
function parseSummonMethod(text) {
    const s = String(text || "").trim();
    if (!s) return null;
    for (const m of SUMMON_METHODS) if (m.re.test(s)) return m;
    return null;
}

/** 从卡的类型文本里取事实（等级/阶级/连接值/是否调整） */
function cardFacts(row) {
    const text = String((row && row.typeText) || "");
    const isMonster = text.indexOf("[怪兽") >= 0;
    const levelMatch = /\[(★|☆)(\d+)\]/.exec(text);
    const linkMatch = /\[LINK-(\d+)\]/i.exec(text);
    return {
        isMonster: isMonster,
        isLink: /连接/.test(text),
        isXyz: /超量/.test(text),
        isSynchro: /同调/.test(text),
        isFusion: /融合/.test(text),
        isRitual: /仪式/.test(text),
        isPendulum: /灵摆/.test(text),
        isTuner: /调整/.test(text),
        level: levelMatch ? Number(levelMatch[2]) : 0,
        link: linkMatch ? Number(linkMatch[1]) : 0,
    };
}

/** 场上怪兽（含其等级/是否调整），用于素材判定 */
async function fieldFacts(side) {
    const b = getBoard();
    const stats = await getStatsIndex();
    const list = (b[side || "me"] || {}).field || [];
    return list.map(function (c) {
        const row = stats.byName.get(normalizeKey(c.name));
        const f = row ? cardFacts(row) : { isMonster: true, isTuner: false, level: 0, isLink: false, isXyz: false };
        return { name: c.name, row: row || null, facts: f };
    });
}

/** 3) 判定（纯逻辑，不落盘）：返回 { legal, verdicts, notes, apply } */
async function judgeSummon(row, method, opts) {
    const facts = cardFacts(row);
    const methodKey = method || (facts.isLink ? "link" : facts.isXyz ? "xyz" : facts.isSynchro ? "synchro" : facts.isFusion ? "fusion" : facts.isRitual ? "ritual" : "normal");
    const info = SUMMON_METHODS.filter(function (m) { return m.key === methodKey; })[0] || SUMMON_METHODS[SUMMON_METHODS.length - 1];
    const verdicts = [], notes = [];
    let legal = true;
    let plan = { tributes: [], materials: [], usesNormal: USES_NORMAL_SUMMON.indexOf(methodKey) >= 0 };
    const need = tributeNeeded(row);

    if (!facts.isMonster) {
        return { legal: false, methodKey: methodKey, info: info, verdicts: ["❌ 这不是怪兽卡，不能召唤。"], notes: notes, plan: plan, facts: facts };
    }
    if (methodKey === "normal" || methodKey === "tribute") {
        if (facts.isLink) { legal = false; verdicts.push("❌ 连接怪兽不能通常召唤，只能作为连接素材出场"); }
        else if (facts.isRitual) { legal = false; verdicts.push("❌ 仪式怪兽需要仪式魔法卡进行仪式召唤"); }
        else if (facts.isFusion || facts.isSynchro || facts.isXyz) { legal = false; verdicts.push("❌ 这类怪兽需要对应的特殊召唤（融合/同调/超量）"); }
        else if (!need) { notes.push("ℹ️ 卡面类型信息不足，只能给出祭品数的经验判断"); }
        else {
            const board = getBoard();
            const field = (board.me.field || []);
            if (plan.usesNormal && board.me.normalSummonUsed) { legal = false; verdicts.push("❌ 本回合已经用过通常召唤（每回合只能 1 次）"); }
            else verdicts.push("✅ 本回合通常召唤未使用");
            const needCount = need.tributes || 0;
            if (field.length >= needCount) {
                verdicts.push(needCount ? "✅ 需要 " + needCount + " 只祭品，场上（自己）有 " + field.length + " 只" : "✅ 可直接通常召唤，无需祭品");
                plan.tributes = field.slice(0, needCount).map(function (c) { return c.name; });
            } else {
                legal = false;
                verdicts.push("❌ 需要 " + needCount + " 只祭品，场上只有 " + field.length + " 只");
            }
        }
    } else if (methodKey === "synchro") {
        const monsters = await fieldFacts("me");
        const tuners = monsters.filter(function (m) { return m.facts.isTuner; });
        const target = facts.level;
        verdicts.push("ℹ️ 同调素材：调整 1 只 + 调整以外若干，等级合计要等于 " + target);
        if (!tuners.length) { legal = false; verdicts.push("❌ 场上没有调整怪兽"); }
        else {
            // 贪心：先放一只调整，再按等级凑够合计
            let sum = tuners[0].facts.level || 0;
            const picked = [tuners[0].name];
            for (const m of monsters) {
                if (picked.indexOf(m.name) >= 0) continue;
                if (sum >= target) break;
                sum += m.facts.level || 0;
                picked.push(m.name);
            }
            if (sum === target) verdicts.push("✅ 可用素材：" + picked.join("、") + "（等级合计 " + sum + "）");
            else { legal = false; verdicts.push("❌ 场上素材等级合计最多凑到 " + sum + "，达不到 " + target); }
            plan.materials = picked;
        }
    } else if (methodKey === "xyz") {
        const monsters = await fieldFacts("me");
        const rank = facts.level || 0;
        const same = monsters.filter(function (m) { return m.facts.level === rank; });
        verdicts.push("ℹ️ 超量素材：等级 " + rank + " 的怪兽 2 只（这里按最常见的 2 只判断）");
        if (same.length >= 2) { verdicts.push("✅ 场上有 " + same.length + " 只等级 " + rank + " 的怪兽"); plan.materials = same.slice(0, 2).map(function (m) { return m.name; }); }
        else { legal = false; verdicts.push("❌ 场上等级 " + rank + " 的怪兽只有 " + same.length + " 只，需要 2 只"); }
    } else if (methodKey === "link") {
        const monsters = await fieldFacts("me");
        const rating = facts.link || 0;
        verdicts.push("ℹ️ 连接素材：怪兽数量等于连接值（" + rating + "）；连接怪兽可当 1 或自身连接值使用");
        if (monsters.length >= rating) { verdicts.push("✅ 场上有 " + monsters.length + " 只怪兽，够做 LINK-" + rating); plan.materials = monsters.slice(0, rating).map(function (m) { return m.name; }); }
        else { legal = false; verdicts.push("❌ 场上有 " + monsters.length + " 只怪兽，LINK-" + rating + " 需要 " + rating + " 只"); }
    } else if (methodKey === "ritual") {
        notes.push("ℹ️ 仪式召唤需要对应的仪式魔法与其指定的祭品，本地只能提醒，具体请以官方裁定为准（可用「裁定」查询）。");
    } else if (methodKey === "fusion") {
        notes.push("ℹ️ 融合召唤需要「融合」类魔法与融合素材，素材要求写在卡面；本地不替你判定素材是否齐备。");
    } else if (methodKey === "pendulum") {
        const board = getBoard();
        const scales = [];
        for (const zone of ["me"]) { const s = (board[zone] || {}); }
        notes.push("ℹ️ 灵摆召唤需要灵摆区刻度（用 /ygoduel scale 3,8 记录）；等级在刻度之间的怪兽可同时特殊召唤。");
    } else if (methodKey === "special") {
        notes.push("ℹ️ 特殊召唤不受通常召唤次数限制，按卡面效果处理。");
    }
    return { legal: legal, methodKey: methodKey, info: info, verdicts: verdicts, notes: notes, plan: plan, facts: facts };
}

/** 4) 上盘：祭品/素材送墓 → 怪兽上场 → 用掉本回合通招 */
async function applySummon(row, method, judge) {
    const j = judge || await judgeSummon(row, method, {});
    if (!j.legal) return { ok: false, text: "❌ 判定不合法，没有落到盘面。" };
    let board = getBoard();
    const moved = [];
    for (const name of (j.plan.tributes || []).concat(j.plan.materials || [])) {
        const before = board.me.field.length;
        board = applyAction(board, { action: "to", side: "me", value: name, from: "field", to: "grave" });
        if (board.me.field.length < before) moved.push(name);
    }
    board = applyAction(board, { action: "to", side: "me", value: row.name, from: "hand", to: "field", position: "攻击表示" });
    const onField = board.me.field.some(function (c) { return normalizeKey(c.name) === normalizeKey(row.name); });
    if (!onField) {
        // 手牌里没有这张（很常见）：直接放到场上，保证盘面与判定一致
        board.me.field.push({ name: row.name, id: String(row.id || ""), atk: j.facts && j.facts.level ? "" : "", def: "", position: "攻击表示" });
        board.log.push("「" + row.name + "」上场（原本不在手牌，按召唤结果记）");
    }
    if (j.plan.usesNormal) board = applyAction(board, { action: "summonUsed", side: "me", value: true });
    saveBoard(board);
    log("召唤", (j.info ? j.info.label : "召唤") + "「" + row.name + "」→ 上盘（祭品/素材 " + moved.length + " 张）");
    return { ok: true, text: "✅ 已落到盘面：" + (moved.length ? "祭品/素材送墓 " + moved.join("、") + "；" : "") + "「" + row.name + "」上场" + (j.plan.usesNormal ? "；本回合通常召唤已用掉" : "") + "。", moved: moved };
}

/** 5) 对外文本：判定 + 报告（合法且开关打开时自动上盘） */
async function checkSummon(args) {
    const a = args || {};
    const row = await findCard(a.query);
    if (!row) return "没有找到「" + String(a.query || "") + "」。";
    // 调用方给的可能是召唤方式的 key（xyz/tribute/…），parseSummonMethod 只认中文写法；
    // 先按 key 精确匹配，再退回中文解析（否则工具/触发词传 key 时方法被丢掉，判成通常召唤还会落错盘）
    const rawMethod = String(a.method || "").trim();
    const direct = SUMMON_METHODS.filter(function (m) { return m.key === rawMethod.toLowerCase(); })[0];
    const parsed = parseSummonMethod(rawMethod);
    const method = direct ? direct.key : (parsed ? parsed.key : "");
    const judge = await judgeSummon(row, method, {});
    // 禁限提醒
    try {
        const limits = await getLimits();
        const region = settings.get("banlistRegion") || "cn";
        const status = banlistStatus(limits, region, row);
        if (status !== "unknown" && status !== "none") judge.verdicts.push("⚠️ 禁限状态（" + (REGION_LABEL[region] || region) + "）：" + STATUS_TEXT[status]);
    } catch (error) { /* 禁限表不可用不影响判定 */ }
    const autoOn = settings.get("summonAutoApply") !== false;
    // 栏目隔离：玩法栏目停用时不写盘面
    const groupOn = settings.groupEnabled ? settings.groupEnabled("玩法") !== false : true;
    let applied = null;
    if (judge.legal && autoOn && groupOn) applied = await applySummon(row, method, judge);
    else if (judge.legal && (!autoOn || !groupOn)) judge.notes.push(autoOn ? "ℹ️「玩法」栏目已停用，本次只判定不落盘。" : "ℹ️ 自动上盘开关已关闭，本次只判定不落盘。");
    const lines = ["⚖️ 召唤检查 · " + (judge.info ? judge.info.label : "通常召唤") + "「" + row.name + "」" + (judge.legal ? " · 合法 ✅" : " · 不合法 ❌")];
    for (const v of judge.verdicts) lines.push(v);
    for (const n of judge.notes) lines.push(n);
    if (applied && applied.ok) lines.push("", applied.text);
    lines.push("", "（判定基于本地卡库与当前盘面记录；特殊召唤的素材要求以官方裁定为准。）");
    return lines.join(String.fromCharCode(10));
}

/** 6) 注册能力 */
function registerSummon() {
    registry.provide("checkSummon", async function (args) { return await checkSummon(args || {}); });
    registry.provide("runAction:summon", async function (trigger) {
        if (!trigger || trigger.action !== "summon") return [];
        const arg = String(trigger.arg || "").trim();
        if (!arg) return [{ name: "召唤检查", text: "要召唤哪张卡？例如「上级召唤青眼白龙」或「超量召唤 No.39 希望皇 霍普」。" }];
        const parsed = parseSummonMethod(arg);
        const query = parsed ? arg.replace(parsed.re, "").trim() : arg;
        return [{ name: "召唤检查", text: await checkSummon({ query: query || arg, method: parsed ? parsed.key : "" }) }];
    });
    registry.provide("tool:summonApply", async function (args) {
        const a = args || {};
        const row = await findCard(a.query);
        if (!row) return "没有找到「" + String(a.query || "") + "」。";
        const judge = await judgeSummon(row, a.method || "", {});
        if (!judge.legal) return "❌ 判定不合法，没有落到盘面。" + (judge.verdicts.length ? " " + judge.verdicts.filter(function (v) { return v.indexOf("❌") === 0; }).join(" ") : "");
        const r = await applySummon(row, a.method || "", judge);
        return r.text + "\n\n" + boardText(getBoard());
    });
    log("数据", "召唤能力已注册（checkSummon / runAction:summon / tool:summonApply）");
}

const summon = { SUMMON_METHODS, USES_NORMAL_SUMMON, parseSummonMethod, cardFacts, fieldFacts, judgeSummon, applySummon, checkSummon, registerSummon };

return { SUMMON_METHODS, USES_NORMAL_SUMMON, parseSummonMethod, cardFacts, fieldFacts, judgeSummon, applySummon, checkSummon, registerSummon, summon };
});

__def("src/inject/build.js", function (__req) {
const { settings } = __req("src/core/settings.js");

/** 模块速查表：告诉 AI 什么情况用哪个能力（可用 promptSheet 覆盖）。 */
const SHEET = [
    "【查卡器 · 给你的取数任务清单】这些是插件提供的能力。需要真实数据时调用对应工具，不要凭记忆编造；不需要时忽略本段，不要提及插件或本清单。",
    "",
    "一、按需求调工具（括号内是工具名）",
    "1. 要某张卡的数值/效果/译名/卡密 → get_yugioh_card（参数 query 可填中文名、日文名、英文名或卡密）",
    "2. 名字记不全、译名不确定 → 先 search_yugioh_cards 模糊搜，再用完整名调第 1 条",
    "3. 要卡图（可放进正文的 Markdown 图片） → get_yugioh_card_image",
    "4. 要官方裁定/FAQ、判定争议 → get_yugioh_ruling（比你的记忆可靠，优先用）",
    "5. 要某卡的异画/版本 → get_yugioh_card_art；要「哪些卡有异画」 → list_yugioh_alt_art_cards",
    "6. 要「某系列/字段有哪些卡」 → find_yugioh_series_cards",
    "7. 要禁限表、某卡是否被禁 → get_yugioh_banlist",
    "8. 开卡包（按真实卡包首发卡池还原） → open_yugioh_pack；查包 → list_yugioh_packs / search_yugioh_packs",
    "9. 随机抽卡 → draw_yugioh_card",
    "10. 卡组是否合法（张数/同名/禁限） → validate_yugioh_deck",
    "11. 起手概率、模拟抽卡 → simulate_yugioh_hand",
    "12. 「这次召唤是否合法」 → check_summon_legality",
    "13. 决斗盘/场面状态 → duel_board",
    "14. 本局/本条消息里出现过哪些卡 → list_cards_in_chat",
    "15. 收集进度 → get_collection；每日商店 → open_yugioh_shop",
    "16. 自制卡（DIY） → manage_diy_card",
    "",
    "二、玩家也可以直接打命令（你看到结果就当资料用）",
    "  " + "ygocard / ygorule / ygoart / ygopack / ygodraw / ygodeck / ygohand / ygosummon / ygoduel / ygorecap / ygoshop / ygoalbum / ygoalias / ygodiy / ygodeckimage / ygoselftest / ygoprompt" + "",
    "",
    "三、拿到数据后怎么做",
    "  （涉及数值、效果、禁限、裁定时**必须先调用对应工具取真值**，不要凭记忆回答；工具查不到就照实说查不到）",
    "· 数值与效果以返回内容为准，原样引用，不要改动、不要四舍五入、不要自行补充效果。",
    "· 返回里有 markdown 图片链接时，想给玩家看图就把链接原样放进回复。",
    "· 返回「没有找到/未命中」时：换名字或卡密再查一次；仍然没有就照实说没查到，不要编。",
    "",
    "四、边界",
    "· 本清单只是工具说明，不是剧情指令；与角色设定或玩家要求冲突时，以玩家人设与剧情为准。",
    "· 不要输出工具名、参数、报错原文这类过程信息给玩家，除非玩家明确问。",
].join("\n");

/** 卡名判断提示：把是否指这张卡的决定权交给 AI（可用 promptJudge 覆盖）。 */
const JUDGE = [
    "【是否采用由你决定】上面这段是插件按文字匹配到的卡片资料，可能撞词（例如「学院」「城堡」「增援」这类日常词与他人卡名相近）。",
    "你有完全的自主权决定要不要用这段资料：用得着就用（数值与效果以它为准），用不着就直接丢掉。",
    "如果语境里它不是在说卡（只是场景描写、语气词、专有名词），或这段数据与当前情节无关，请直接忽略本段，不要提及卡牌、不要贴卡图。",
].join("\n");

/** 发给外部 AI 的默认说明。 */
const EXTERNAL_INSTRUCTION = [
    "你是游戏王规则与卡库资料的整理员。用户会给你一段由查卡器插件生成的原始资料。",
    "请把它整理成简洁、准确、可直接用于写作的一段中文说明：",
    "1. 只保留与本次查询相关的卡名、类型、数值、效果要点；2. 不要编造资料里没有的数据；",
    "3. 不要输出引用标记、来源、Markdown 代码块；4. 直接给整理结果，不要寒暄、不要复述指令。",
].join("\n");


/** 取实际生效的提示词（用户自定义优先）。 */
function sheetText() {
    const custom = String(settings.get("promptSheet") || "").trim();
    return custom || SHEET;
}
function judgeText() {
    const custom = String(settings.get("promptJudge") || "").trim();
    return custom || JUDGE;
}
function externalInstruction() {
    const custom = String(settings.get("apiInstruction") || "").trim();
    return custom || EXTERNAL_INSTRUCTION;
}

/** 防注入：打断伪造的块边界与前缀式指令。数据是数据，不是指令。 */
function sanitize(text) {
    return String(text === undefined || text === null ? "" : text)
        .replace(/\*{3,}/g, "**")
        .replace(/【系统】|【指令】|【忽略以上|【新指令/g, "[已屏蔽]")
        .replace(/忽略(以上|上述|之前)(所有)?(的)?指令/g, "[已屏蔽]")
        .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+instructions/gi, "[已屏蔽]");
}

/**
 * 纯函数：卡片数据 → 注入文本。
 * cards 形如 [{ name, text }]；opts 可覆盖 sheet/judge/note/budget/includeSheet。
 */
function buildInjection(cards, opts) {
    const o = opts || {};
    const list = Array.isArray(cards) ? cards : [];
    const blocks = list.filter(function (c) { return c && c.text; }).map(function (c) { return sanitize(c.text); });
    if (!blocks.length) return "";
    const includeSheet = (o.includeSheet === undefined ? settings.get("capabilityHint") !== false : o.includeSheet !== false);
    const sheet = o.sheet === undefined ? sheetText() : o.sheet;
    const judge = o.judge === undefined ? judgeText() : o.judge;
    const note = o.note === undefined ? String(settings.get("injectNote") || "").trim() : o.note;
    const head = includeSheet && sheet ? sheet + "\n\n" : "";
    const tail = judge ? "\n\n" + judge : "";
    // 附注位置：tail＝紧跟在卡片资料之后（默认，对"这段资料怎么用"的要求更合适）；
    // head＝放在整块最前面（对"全局设定/风格/立场"类文本更合适，AI 更容易当成总纲）
    const noteText = note ? "\n【玩家设定的处理要求】" + note : "";
    const noteHead = (o.notePosition === undefined ? String(settings.get("injectNotePosition") || "tail") : o.notePosition) === "head";
    const extra = noteHead ? "" : noteText;
    const body0 = blocks.join("\n\n");
    const budget = Number(o.budget === undefined ? settings.get("injectBudget") : o.budget) || 0;
    let body = head + (noteHead ? noteText + "\n" : "") + body0 + extra + tail;
    if (budget > 0 && body.length > budget) {
        const fixed = head.length + extra.length + noteText.length + tail.length;
        const room = Math.max(200, budget - fixed);
        body = head + (noteHead ? noteText + "\n" : "") + body0.slice(0, room) + "\n…（超出预算已截断）" + extra + tail;
    }
    return "***\n" + body + "\n***";
}

const build = { SHEET, JUDGE, EXTERNAL_INSTRUCTION, sheetText, judgeText, externalInstruction, sanitize, buildInjection };

return { SHEET, JUDGE, EXTERNAL_INSTRUCTION, sheetText, judgeText, externalInstruction, sanitize, buildInjection, build };
});

__def("src/inject/cleanup.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");
const { settings } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");

/** ── 统一模板（注入模块）：常量 → 纯函数 → 挂载 → register → exports ── */

/** 1) 常量：要清理的引用标记形态 */
const PATTERNS = [
    /\[\^\d+\]/g,          // [^1]
    /\[\^[^\]]{1,12}\]/g,   // [^note]
    /【\^\d+】/g,            // 【^1】
    /\(\^\d+\)/g,          // (^1)
];

/** 2) 纯函数：去掉引用标记（可断言） */
function stripCitations(text) {
    let out = String(text === undefined || text === null ? "" : text);
    for (const re of PATTERNS) out = out.replace(re, "");
    // 清理残留的空括号/多余空格
    out = out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([，。；：！？、])/g, "$1");
    return out;
}

/** 3) 清理聊天里的引用标记（返回值表示是否改动过） */
function cleanMessageAt(index) {
    if (settings.get("stripCitations") === false) return false;
    const c = ctx();
    const chat = Array.isArray(c.chat) ? c.chat : [];
    const m = chat[index];
    if (!m || typeof m.mes !== "string") return false;
    const cleaned = stripCitations(m.mes);
    // ★ swipe 记录要一起改（v1 同款：ygo-card-lookup/index.js:3013）：只改 m.mes 的话，
    //   点 ◀/▶ 切回旧 swipe 或从 swipes 重渲染，[^1] 又会冒出来。
    let touchedSwipe = false;
    if (Array.isArray(m.swipes) && typeof m.swipe_id === "number" && typeof m.swipes[m.swipe_id] === "string") {
        const sw = stripCitations(m.swipes[m.swipe_id]);
        if (sw !== m.swipes[m.swipe_id]) { m.swipes[m.swipe_id] = sw; touchedSwipe = true; }
    }
    if (cleaned === m.mes && !touchedSwipe) return false;
    m.mes = cleaned;
    log("引用", "已清理第 " + index + " 楼的引用标记" + (touchedSwipe ? "（含 swipe 记录）" : ""));
    return true;
}

/** 清理最后一条角色消息（MESSAGE_RECEIVED 的常见用法） */
function cleanLastMessage(id) {
    const c = ctx();
    const chat = Array.isArray(c.chat) ? c.chat : [];
    // MESSAGE_RECEIVED 给的就是刚进楼的那一条（宿主传的是 index）——给了就清它，
    // 别再去"猜最后一条非玩家消息"（聊天里有系统/旁白楼时会清错人）
    const idx = Number(id);
    if (Number.isInteger(idx) && idx >= 0 && idx < chat.length) return cleanMessageAt(idx);
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i] && !chat[i].is_user) return cleanMessageAt(i);
    }
    return false;
}

/** 4) 注册能力（事件层会在 MESSAGE_RECEIVED 时调用） */
function registerCleanup() {
    registry.provide("cleanupLastMessage", async function () { return cleanLastMessage(); });
    registry.provide("stripCitations", async function (text) { return stripCitations(text); });
    log("引用", "引用清理已注册（cleanupLastMessage）");
}

const cleanup = { PATTERNS, stripCitations, cleanMessageAt, cleanLastMessage, registerCleanup };

return { PATTERNS, stripCitations, cleanMessageAt, cleanLastMessage, registerCleanup, cleanup };
});

__def("src/inject/detect.js", function (__req) {
const { settings } = __req("src/core/settings.js");

/** 自然语言触发词表：words 命中即触发，arg 从命中词之后取。 */
/** v1 的 looksLikeCardArg（原样语义）：参数得像卡名/卡密，才让带参数的触发词成立。
 *  挡住「异画卡」「卡图好漂亮啊」这种句子里碰巧含触发词的情况（v1 第 3859-3876 行）。
 *  这里用同步的本地表判断；名字索引未就绪时只认卡密与括号。
 */
function looksLikeCardArg(arg) {
    const raw = String(arg === undefined || arg === null ? "" : arg).trim();
    if (!raw) return false;
    if (/^\d{5,10}$/.test(raw)) return true;
    if (/[「『【《]/.test(raw)) return true;
    const t = raw.replace(/[的了吧呢啊呀哦嘛吗？！。，、\s]+$/g, "").trim();
    if (t.length < 2) return false;
    // 白话词直接否掉（v1 也是这么挡的）
    if (/^(卡|卡片|卡图|图|好漂亮|不错|了|我|你|他|她|它|这个|那个|什么|东西|玩意)$/.test(t)) return false;
    return true;
}
const TRIGGERS = [
    { action: "pack", words: ["开卡包", "开一包", "开个卡包", "抽个包"] },
    { action: "draw", words: ["抽卡", "抽一张", "随机抽卡"] },
    { action: "shop", words: ["今日商店", "每日商店", "看看商店"] },
    { action: "buy", re: /^(?:购买|买下|买入|我要买)\s*(.+)$/ },
    { action: "album", words: ["我的收藏", "收藏册", "图鉴"] },
    // v1 的「查卡」族（v1 第 3632 行原样）：查卡 灰流丽 / 查一下 青眼白龙 / 搜卡 …
    { action: "card", re: /^(?:查卡|查一下|查查|查张卡|查卡片|搜卡|搜索卡|找卡|找找卡|查询)\s*[:：]?\s*(.+)$/ },
    { action: "recap", words: ["本局卡表", "本回合卡表", "用了哪些卡"] },
    { action: "rule", words: ["官方裁定"] },
    // 其余裁定说法交给下面的正则（需要从句子里取出卡名）
    { action: "artlist", re: /(?:哪些|什么|所有)卡(?:有)?异画|异画卡表|有异画的卡/ },
    { action: "art", words: ["异画", "有哪些版本"] },
// 关键词在触发词之前：「青眼白龙有哪些卡包」「白银城卡包有哪些」（必须在词表规则之前，词表只能取触发词之后的文字）
{ action: "packsearch", re: /^(.{2,20}?)\s*卡包\s*(?:有哪些|有什么|列表|都有啥)/ },
{ action: "packsearch", re: /^(.{2,20}?)\s*(?:有哪些|有什么)\s*卡包/ },
    { action: "packsearch", words: ["有哪些卡包", "有没有卡包", "查卡包", "看看卡包", "看下卡包", "卡包列表"] },
{ action: "packsearch", re: /(?:(?:看看|查查|查一下|找找|有没有|有哪些|看|找|查)\s*)*([^，。！？\s]{2,12}?)\s*卡包/ },   // 「看看有没有白银城卡包」→ 白银城
    { action: "deck", words: ["卡组校验", "检查卡组"] },
    // 两组合并：曾经写成重复的 words 键，后一组把前一组整个盖掉，「起手概率」这个触发词就没了
    { action: "hand", words: ["起手模拟", "起手概率", "抽取起手", "抽起手", "起手", "开始决斗"] },
    { action: "summon", words: ["召唤检查", "能不能召唤"] },
    { action: "summon", re: /^(?:通常|上级|祭品|牲祭|升|仪式|融合|同调|同步|超量|多维|链接|连接|灵摆|特殊|特)?(?:召唤|特召)(?!师|阵|兽|物)\s*[:：]?\s*([^，。！？\n]{1,30})$/ },
    { action: "summon", re: /^(?:我)?(?:要|想|准备|打算)?(?:通常|上级|祭品|仪式|融合|同调|同步|超量|多维|链接|连接|灵摆|特殊)?(?:召唤)(?!师|阵|兽|物)\s*[:：]?\s*([^，。！？\n]{1,30})$/ },
    { action: "board", words: ["决斗盘", "盘面"] },
    { action: "deckimage", words: ["卡组图", "卡组展示图", "卡组图片"] },
    { action: "banlist", re: /^(?:禁限表|禁卡表|限卡表|禁限卡表|什么卡被禁|现在的禁卡)$/ },
    { action: "series", re: /(?:这个|该)?系列(?:里)?(?:都)?有哪些卡|有哪些卡|系列卡表|字段有哪些卡/ },
    { action: "alias", words: ["俗称表", "俗称"] },
    // 正则型：词被参数打断时用（捕获组 1 作为 arg）
            { action: "pack", re: /开[^，。！？]{0,8}卡包/ },
    { action: "pack", re: /开\s*包/ },
    { action: "pack", re: /开\s*([^\s，。！？]{0,10}包(?:\d{1,3})?)/ },
    // 裁定：卡名在前（「灰流丽有什么裁定」）取捕获组 1；命令式在前（「裁定 灰流丽」）取剩余部分
    { action: "rule", re: /^(.{2,24}?)(?:有(?:什么|没有)?|的)?(?:官方)?(?:裁定|调整|faq)/i },
    { action: "rule", re: /^(?:官方)?(?:裁定|调整|faq)\s*[:：]?\s*(.+)$/i },
];

/** 会造成误判的犹豫/叙述句式：出现即认为不是在触发插件。 */
const HESITATION = ["要不要", "想不想", "该不该", "是不是应该", "是不是要", "我在想", "不太懂", "好漂亮", "设计得不错"];

/** 归一化：全角转半角、去装饰、去空白。 */
function normalize(text) {
    let s = String(text === undefined || text === null ? "" : text);
    if (typeof s.normalize === "function") s = s.normalize("NFKC");
    // 触发词匹配 / 参数提取用：只去装饰与零宽字符，**保留空格**（否则「超量召唤希望皇 霍普」的参数会变成「希望皇霍普」）
    return s.replace(/[\u200b-\u200f\uFE0F]/g, "").replace(/[「」『』《》【】〖〗\[\]()（）]/g, "").trim();
}

/** 识别卡名专用：必须与 indexes.normalizeKey（卡名索引）逐字一致 —— 去掉空格与「・·」，
 *  否则含空格 / 间隔号的卡名（例如「娱乐伙伴 天空的魔术师」、以及全部英文名）永远匹配不上。 */
function normalizeText(text) {
    return normalize(text).replace(/[・·\s]/g, "");
}

/** 触发词匹配（犹豫句式直接被拒）。 */
// 需要"卡名参数"才成立的动作（v1 对这些用 looksLikeCardArg 挡白话）
// 这些动作的参数只允许"空或数字"（避免「他起手就赢了」这类日常句误触发）
const ARG_NUMERIC_ONLY = ["hand", "draw"];
const CARD_ARG_ACTIONS = ["art", "buy", "card", "rule", "summon"];

function matchTrigger(text, triggers, hesitation) {
    const raw = String(text || "").trim();
    const s = normalize(raw);
    const hes = hesitation || HESITATION;
    for (const h of hes) if (s.indexOf(h) >= 0) return null;
    // 单遍、按表顺序匹配：每条规则先试词表，再试正则。
    // 这样"更具体的规则写在前面"就能生效（此前词表整轮优先于正则，导致
    // 「哪些卡有异画」被「异画」抢走、以及「有什么裁定」参数取空两处 bug）。
    for (const rule of (triggers || TRIGGERS)) {
        for (const w of (rule.words || [])) {
            const at = s.indexOf(w);
            if (at < 0) continue;
            const wordArg = s.slice(at + w.length).trim();
            if (CARD_ARG_ACTIONS.indexOf(rule.action) >= 0 && wordArg && !looksLikeCardArg(wordArg)) continue;   // 带卡名参数的动作：白话不算卡名
            if (ARG_NUMERIC_ONLY.indexOf(rule.action) >= 0 && wordArg && !/^\d{1,3}$/.test(wordArg)) continue;   // 起手/抽卡：参数只能是张数（防「他起手就赢了」）
            return { action: rule.action, arg: wordArg, raw: raw, via: "word" };
        }
        if (!rule.re) continue;
        const m = rule.re.exec(s);
        if (!m) continue;
        const captured = (m[1] || "").trim();
        return { action: rule.action, arg: captured || s.replace(rule.re, "").trim(), raw: raw, via: "regex" };
    }
    return null;
}

/**
 * 纯函数：从文本里找出"像卡名"的词段。
 * nameIndex: Map(归一化名 → 原名)，由数据层提供；lookup 可注入以便测试。
 */
function findSegments(text, nameIndex, opts) {
    const o = opts || {};
    const minLen = Number(o.minLen) || 2;
    const maxCards = Number(o.maxCards) || 6;
    const s = normalizeText(text);   // 识别用去空格版（与卡名索引一致）
    if (!s || !nameIndex || typeof nameIndex.has !== "function") return [];
    const out = [];
    const seen = new Set();
    const maxLen = Math.max(minLen, Math.min(Number(o.maxLen) || 40, s.length));   // 卡名可能很长（「波动之超魔导剑士-黑魔导剑士」17 字），不能写死 12
    for (let len = maxLen; len >= minLen && out.length < maxCards; len--) {
        for (let i = 0; i + len <= s.length; i++) {
            const seg = s.slice(i, i + len);
            if (seen.has(seg)) continue;
            if (!nameIndex.has(seg)) continue;
            let overlap = false;
            for (const hit of out) if (hit.seg.indexOf(seg) >= 0 || seg.indexOf(hit.seg) >= 0) { overlap = true; break; }
            if (overlap) continue;
            seen.add(seg);
            out.push({ seg: seg, name: nameIndex.get(seg) });
            if (out.length >= maxCards) break;
        }
    }
    return out;
}

/** 触发方式：full 允许自由文本；keyword/command 不允许。 */
function allowsFreeText() { return settings.get("triggerMode") === "full"; }

const detect = { normalizeText, TRIGGERS, HESITATION, normalize, matchTrigger, findSegments, allowsFreeText };

return { looksLikeCardArg, TRIGGERS, HESITATION, normalize, normalizeText, matchTrigger, findSegments, allowsFreeText, detect };
});

__def("src/inject/interceptor.js", function (__req) {
const { ctx, log, emit } = __req("src/core/bus.js");
const { settings } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");
const { matchTrigger, findSegments, allowsFreeText } = __req("src/inject/detect.js");
const { buildInjection } = __req("src/inject/build.js");

/** 取最后一次玩家消息（按 scanScope 决定扫哪些）。 */
/** 扫描条数：与 v1 同一个键同一范围（1-20，默认 3） */
function scanDepthValue(raw) {
    // 与 v1 的绑定逐字一致：Math.max(1, Math.min(20, Number(value) || 3))
    // 所以 0 / 空 / 非数字 → 3（v1 同理），负数 → 1，超过 20 → 20
    const n = Number(raw === undefined || raw === null || raw === "" ? settings.get("scanDepth") : raw) || 3;
    return Math.max(1, Math.min(20, Math.floor(n)));
}

/**
 * 取本轮的"待检测文本"。
 *   scope === "all"       → 最近 N 条消息（含 AI 回复），N 由 scanDepth 决定（v1 同款，之前写死 3 条）
 *   scope === "last_user" → 最后一条玩家消息
 */
function lastUserText(chat, scope, depth) {
    const list = Array.isArray(chat) ? chat : [];
    if (scope === "all") {
        const n = scanDepthValue(depth);
        const all = list.filter(function (m) { return m && m.mes; }).map(function (m) { return String(m.mes); });
        return all.slice(-n).join("\n");
    }
    for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        if (m && m.mes && m.is_user) return String(m.mes);
    }
    return "";
}

/**
 * 拦截器主体：纯编排。依赖通过 registry 取（数据层未注册时自动降级为"不认识卡名"）。
 */
const TRIGGER_LABELS = {
    pack: "开卡包", packsearch: "卡包搜索", draw: "随机抽卡", shop: "每日商店", buy: "购买",
    deck: "卡组校验", deckimage: "卡组展示图", hand: "起手模拟", board: "决斗盘", duel: "决斗盘",
    summon: "召唤检查", rule: "官方裁定", art: "异画", alias: "俗称表", album: "收藏册",
    recap: "本局卡表", series: "字段查询", selftest: "自检", card: "查卡", search: "模糊搜索",
};
/** 组装给外部模型的系统提示（有 external 模块就用它的 buildCardPrompt；否则退化为简易拼装） */
async function buildExternalSystem(conf, cards, question) {
    const instruction = conf.apiInstruction;
    // 这里以前引用了不存在的 text（外层 interceptor 的局部变量）→ 参数求值就 ReferenceError，
    // 被 catch 吞掉后永远退化成简易拼装，副 AI 拿不到玩家这句话。现在由调用方显式传进来，并且要 await。
    if (registry.has("external:prompt")) {
        try { return await registry.call("external:prompt", { cards: cards, question: String(question || "").slice(0, 800), instruction: instruction }); }
        catch (error) { log("外部", "组装外部系统提示失败，改用简易拼装：" + (error && error.message ? error.message : error)); }
    }
    const head = String(instruction || "").trim() || "你是游戏王规则助手，只用给定资料回答，不要编造。";
    const body = (cards || []).slice(0, 6).map(function (c) { return "· " + c.name + "：" + String(c.text || "").replace(/\n/g, " ").slice(0, 400); }).join("\n");
    return head + "\n\n【卡面资料】\n" + body;
}

/** 拦截器最近一次被宿主调用的时间（兜底注入据此判断） */
let lastRunAt = 0;

/** 兜底注入：宿主没有调用拦截器（不支持 generate_interceptor / 调用失败）时，
 *  在 MESSAGE_SENT（玩家消息已入楼、提示词还没组装）用**同一个拦截器**再跑一次 ——
 *  直接复用同一个函数，所以两条链路行为必然一致，不会出现"两套实现不同步"。
 *  v1 的「拦截器不生效时改用事件兜底注入」就是这个语义。 */
async function runFallback() {
    if (settings.get("injectionFallback") === false) return { ok: false, reason: "设置里已关闭兜底注入" };
    if (lastRunAt && Date.now() - lastRunAt < 5000) return { ok: false, reason: "拦截器本轮已运行（" + (Date.now() - lastRunAt) + "ms 前），不需要兜底" };
    const c = (typeof ctx === "function") ? ctx() : null;
    const chat = (c && Array.isArray(c.chat)) ? c.chat : null;
    if (!chat || !chat.length) return { ok: false, reason: "拿不到聊天记录" };
    if (typeof builtInterceptor !== "function") return { ok: false, reason: "拦截器尚未建立" };
    const before = lastRunAt;
    try {
        const out = await builtInterceptor(chat, 0, null, "normal");
        return { ok: true, injected: !!out, chars: String(out || "").length };
    } catch (error) {
        return { ok: false, reason: "兜底注入失败：" + ((error && error.message) ? error.message : String(error)) };
    } finally {
        // 无论成功失败，都别让同一轮反复兜底
        if (!lastRunAt || lastRunAt === before) lastRunAt = Date.now();
    }
}

/** createInterceptor 建立的拦截器引用（runFallback 复用同一个） */
let builtInterceptor = null;

function registerInterceptorHooks() {
    registry.provide("injectFallback:run", async function () { return await runFallback(); });
}

function createInterceptor() {
    const interceptor = async function (chat, contextSize, abort, type) {
        lastRunAt = Date.now();   // 标记"拦截器本轮确实被宿主调用了"，兜底注入据此判断是否需要出手
        try { log("拦截", "被调用（chat " + ((chat && chat.length) || 0) + " 条，type=" + String(type || "") + "）"); } catch (e0) { /* 忽略 */ }
        const conf = settings.all();
        if (!conf.interceptEnabled) return;
        // 栏目隔离：整个「自动检测注入」栏目被停用 → 不做任何自动检测
        if (settings.groupEnabled && settings.groupEnabled("自动检测注入") === false) { log("拦截", "「自动检测注入」栏目已停用，跳过"); return; }
        // 总隔离「仅指令触发」：自动检测一律不做（指令照常可用）
        if (settings.isolationActive && settings.isolationActive()) { log("拦截", "已开启仅指令触发（总隔离），跳过自动检测"); return; }
        if (conf.triggerMode === "command") { log("拦截", "仅指令模式，不做自主检测"); return; }
        // 官方文档：type 会给出本次生成的来源（quiet/regenerate/impersonate/swipe…）。
        // quiet 多为摘要/翻译等内部生成，注入卡资料纯属浪费上下文，默认跳过。
        if (conf.skipQuiet !== false && type === "quiet") { log("拦截", "quiet 生成，跳过注入"); return; }
        const text = lastUserText(chat, conf.scanScope, conf.scanDepth);
        if (!text) return;
        const started = Date.now();
        let trigger = conf.naturalCommands === false ? null : matchTrigger(text);
        // 栏目隔离：动作所属栏目被停用 → 忽略这个触发词
        if (trigger && settings.actionAllowed && settings.actionAllowed(trigger.action) === false) {
            log("拦截", "「" + (settings.actionGroup ? settings.actionGroup(trigger.action) : "?") + "」栏目已停用，忽略触发 " + trigger.action);
            trigger = null;
        }
        let cards = [];
        let kind = "";
        if (trigger) {
            kind = "trigger:" + trigger.action;
            cards = await runTrigger(trigger);
        }
        const freeGroupOn = settings.groupEnabled ? settings.groupEnabled("查询内容") !== false : true;
        // 触发词没产出资料时（某个动作还没有数据模块、或参数不全）也要退回自由文本识别，
        // 否则「查卡 青眼白龙」这种把话说全的句子反而一个字都不注入。
        if ((!cards || !cards.length) && freeGroupOn && conf.detectFreeText !== false && allowsFreeText() && registry.has("resolveCards")) {
            const scanned = await registry.call("resolveCards", text);
            if (scanned && scanned.length) {
                kind = trigger ? (kind + "+freetext") : "freetext";
                cards = scanned;
            }
        }
        // 这里原本还有一条 else-if 走 registry.call("scanCards")：全仓库没人 provide 它，
        // 而且它的位置在触发词成功之后 —— 真注册了反而会把触发词的结果覆盖掉，已删除。
        // v1 的「用外部 AI 时停用插件自主搜索」：外部接口可用且该开关开着 → 本地检测/触发词全部跳过，直接把玩家输入交给外部 AI
    const externalReady = registry.has("external:ask") && settings.groupEnabled("外部接口") !== false && conf.apiEnabled !== false && String(conf.apiMode || "off") !== "off";
    const externalOnly = externalReady && conf.apiExternalAiOwnSearch !== false;
    const detectedCards = (cards || []).slice();   // 清空之前留一份：卡图页脚要用（外部独占时本地卡面丢弃、但卡图仍要送）
    if (externalOnly && (cards && cards.length)) { cards = []; kind = "external"; log("拦截", "外部 AI 模式：跳过本地自主搜索（仍会走外部接口）"); }
    if ((!cards || !cards.length) && !externalOnly) { log("拦截", "本条没有可用资料（" + (kind || "无触发") + "）"); return; }
        let injection = buildInjection(cards, {});
        // 外部接口（副 API 优先 → 主 API 兜底）：先让外部模型处理，再把结果连同卡面数据交给主 AI
        if (registry.has("external:ask") && settings.groupEnabled("外部接口") !== false && conf.apiEnabled !== false && String(conf.apiMode || "off") !== "off") {
            try {
                // 不阻塞模式：超预算就跳过（默认开）；关掉则给足时间（最多 60 秒）
                const budget = conf.apiNonBlocking === false
                    ? Math.max(1000, Math.min(60000, Number(conf.apiBudget) || 30000) * 4)
                    : Math.max(1000, Number(conf.apiBudget) || 8000);
                const ext = await registry.call("external:ask", {
                    mode: conf.apiMode,
                    profileId: conf.apiProfile,
                    maxTokens: conf.apiMaxTokens,
                    timeoutMs: budget,
                    system: await buildExternalSystem(conf, cards, text),
                    user: text,
                });
                if (ext && ext.ok && ext.text) {
                    const cutNote = (ext.finishReason === "length") ? "\n⚠️（这段外部结果被截断了：模型输出达到 token 上限，可能不完整；可在面板「外部接口 · 高级」调大「副 API 最大输出」）" : "";
                    if (cutNote) log("外部", "⚠️ 外部结果被截断（finish_reason=length），已在注入里标注");
                    const extBlock = "\n\n【外部 AI 处理结果（" + ext.via + "）】\n" + String(ext.text).slice(0, 2000) + cutNote + "\n***";
                      // 本地没有任何资料时（外部 AI 模式），外部结果自己就是全部注入内容
                      // v1 的「回写时丢弃插件原始数据（只给 AI 对方的结果）」：开着就只留外部结果，去掉本地卡面
                      if (conf.apiWebhookReplace === true) injection = "";
                      injection = injection ? injection.replace(/\n\*\*\*$/, extBlock) : ("***" + extBlock);
                    log("外部", "外部处理成功（" + ext.via + "）：" + String(ext.text).length + " 字");
                } else {
                    log("外部", "外部处理未生效：" + ((ext && ext.error) || "无返回"));
                }
            } catch (error) { log("外部", "外部处理异常（不影响本地注入）：" + (error && error.message ? error.message : error)); }
        }
        // 盘面随注入一起给 AI（开关：duelBoard）
        if (conf.duelBoard !== false && registry.has("boardText")) {
            try { const bt = await registry.call("boardText"); if (bt && bt.indexOf("LP") >= 0) injection = injection.replace(/\n\*\*\*$/, "\n\n" + bt + "\n***"); } catch (error) { /* 取不到不影响 */ }
        }
        // 结果同时注入（开关：resultInject）
        if (conf.resultInject === true && registry.has("lastResultText")) {
            try { const rt = await registry.call("lastResultText"); if (rt) injection = injection.replace(/\n\*\*\*$/, "\n\n【上一轮查询结果】\n" + String(rt).slice(0, 800) + "\n***"); } catch (error) { /* 忽略 */ }
        }
        if (!injection) return;
        // 外部钩子：允许别的脚本过滤/改写注入内容（v1 hooks.filterInjection 同义）
        if (registry.has("hook:filterInjection")) {
            try { const f = await registry.call("hook:filterInjection", injection); if (typeof f === "string" && f) injection = f; }
            catch (error) { log("拦截", "filterInjection 钩子出错（已忽略）"); }
        }
        // 卡图页脚：预算截断发生在 buildInjection 内部，页脚在其后追加，所以卡图链接【不会被切】；
        // 外部 AI 独占模式（本地卡面被丢弃）时，这一段也保证卡图照样送到 AI。
        if (conf.includeImage !== false && detectedCards.length) {
            try {
                const links = [];
                for (const c of detectedCards) {
                    const found = String((c && c.text) || "").match(/!\[\]\(([^)\s]+)\)/g) || [];
                    for (const l of found) if (links.indexOf(l) < 0) links.push(l);
                }
                const cut = injection.indexOf("超出预算已截断") >= 0;
                const lost = links.filter(function (l) { return injection.indexOf(l) < 0; });
                if (links.length && (cut || lost.length)) {
                    injection = injection.replace(/\n\*\*\*$/, "\n\n【卡图】（markdown 图片链接，可直接放进正文）\n" + links.join("\n") + "\n***");
                    if (lost.length) log("拦截", "预算截断吃掉了 " + lost.length + " 个卡图链接，已在页脚补回");
                }
            } catch (error) { /* 卡图页脚失败不影响注入 */ }
        }
        const written = await registry.has("writeInjection") ? await registry.call("writeInjection", injection) : false;
        log("注入", cards.length + " 张卡 → " + injection.length + " 字（" + kind + "，" + (Date.now() - started) + "ms）写入=" + written);
        if (conf.logToast === true) {
            try { const toaster = ctx().toastr || (typeof toastr !== "undefined" ? toastr : null); if (toaster && typeof toaster.info === "function") toaster.info("查卡器：已注入 " + cards.length + " 张卡资料"); } catch (error) { /* 忽略 */ }
        }
        emit("inject", { cards: cards.length, chars: injection.length, kind: kind, written: written });
        // 每次触发都给可见回执（v1 的行为）：标题写明触发路径，内容是被识别到的卡
        if (conf.resultPopup !== false && registry.has("ui:result")) {
            const action = kind.indexOf("trigger:") === 0 ? kind.slice(8) : "";
            const label = action ? "触发词「" + (TRIGGER_LABELS[action] || action) + "」"
                : kind === "freetext" ? "自由文本识别"
                : kind === "scan" ? "整句扫描"
                : (kind || "识别");
            const body = cards.slice(0, 8).map(function (c) { return (String(c.text || "").indexOf("【") === 0 ? "" : "【" + c.name + "】" + String.fromCharCode(10)) + String(c.text || "").slice(0, 700); }).join(String.fromCharCode(10) + String.fromCharCode(10));
            const note = String.fromCharCode(10) + String.fromCharCode(10) + "—— 本条路径：" + label + "；已注入 " + injection.length + " 字" + (written ? "（写入成功）" : "（写入失败，请检查注入位置设置）");
            Promise.resolve(registry.call("ui:result", { title: "查卡器 · " + label + " → " + cards.length + " 张卡", text: body + note })).catch(function () { /* 弹窗失败不影响注入 */ });
        }
        return injection;
    };
        // 对外包一层"永不抛错"：拦截器里任何异常都不许影响生成（宁可没注入，也不能让玩家发不出去）
        const safeInterceptor = async function (chat, contextSize, abort, type) {
            try { return await interceptor(chat, contextSize, abort, type); }
            catch (error) {
                try { log("拦截", "⚠️ 拦截器内部出错，已忽略、不影响生成：" + (error && error.message ? error.message : error)); } catch (e1) { /* 忽略 */ }
                return "";
            }
        };
        builtInterceptor = safeInterceptor;
    return safeInterceptor;
}

/** 供面板/命令复用的单次检测（不写入提示词）。 */
async function detectOnce(text) {
    const trigger = matchTrigger(text);
    if (trigger && registry.has("runAction")) return { kind: "trigger:" + trigger.action, cards: await registry.call("runAction", trigger) };
    if (allowsFreeText() && registry.has("resolveCards")) return { kind: "freetext", cards: await registry.call("resolveCards", text) };
    return { kind: "none", cards: [] };
}


/**
 * 触发词派发契约：任何数据模块都可以 registry.provide("runAction:<名字>", fn) 或 "runAction"。
 * 拦截器按注册顺序依次询问，第一个返回非空结果的即采用。新增模块不需要改这里。
 */
async function runTrigger(trigger) {
    const keys = registry.list().filter(function (k) { return k === "runAction" || k.indexOf("runAction:") === 0; });
    for (const key of keys) {
        try {
            const out = await registry.call(key, trigger);
            // 只认数组：runAction:* 里有些能力返回字符串（如日志），不能让它们抢走触发词派发
            if (Array.isArray(out) && out.length) return out;
        } catch (error) { log("拦截", "派发 " + key + " 失败：" + (error && error.message ? error.message : error)); }
    }
    return [];
}

const interceptor = { createInterceptor, registerInterceptorHooks, runFallback, scanDepthValue, detectOnce, lastUserText, runTrigger };

return { scanDepthValue, lastUserText, TRIGGER_LABELS, runFallback, registerInterceptorHooks, createInterceptor, detectOnce, runTrigger, interceptor };
});

__def("src/inject/sendbody.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");
const { settings } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");
// 与注入路径共用同一份「仅供参考/是否采用由你决定」文案，避免两处漂移
const { judgeText } = __req("src/inject/build.js");

/**
 * 发送体改写（官方钩子 CHAT_COMPLETION_PROMPT_READY）。
 *
 * 官方源码证据：
 *  - public/script.js:3976-3980 —— 事件后 `prompt = eventData.chat`，所以此处改动会真的发出去；
 *  - public/scripts/openai.js:1607-1614 —— `const chat = chatCompletion.getChat()` 之后发事件，随后仍用同一个
 *    `chat` 变量，因此**必须原地修改数组**（push/splice/改元素），替换 eventData.chat 在 tt 这条路上不生效。
 *
 * 与「注入」的区别：注入（setExtensionPrompt）是另开一块提示；这里是直接改即将发送的消息序列本身。
 */

const MODES = ["off", "append"];

/** 纯函数：找最后一条"玩家消息"的下标（role=user，且不是我们自己插进去的） */
/**
 * 一条消息的正文：酒馆两种形状都要认。
 *   · OpenAI/生成链路：{ role: "user"|"assistant", content }
 *   · 官方聊天对象：  { is_user: true, mes }
 * 之前只认 content + role，真实客户端若给的是 is_user/mes，整个发送体改写会**静默不生效**。
 */
function messageText(m) {
    if (!m || typeof m !== "object") return "";
    if (typeof m.content === "string") return m.content;
    if (typeof m.mes === "string") return m.mes;
    return "";
}

/** 是否玩家消息（两种形状都认） */
function isUserMessage(m) {
    if (!m || typeof m !== "object") return false;
    if (m.is_user === true) return true;
    if (m.role === "user") return true;
    return false;
}

/** 写回正文：沿用这条消息**原本**的字段（有 content 就写 content，否则写 mes） */
function setMessageText(m, text) {
    if (!m || typeof m !== "object") return false;
    if (typeof m.content === "string") { m.content = text; return true; }
    if (typeof m.mes === "string") { m.mes = text; return true; }
    m.content = text;
    return true;
}

function lastUserIndex(chat) {
    if (!Array.isArray(chat)) return -1;
    for (let i = chat.length - 1; i >= 0; i--) {
        const m = chat[i];
        if (!m) continue;
        const hasText = (typeof m.content === "string") || (typeof m.mes === "string");
        if (hasText && isUserMessage(m)) return i;
    }
    return -1;
}

/** 纯函数：把一段资料追加到最后一条玩家消息里（原地改，返回是否改过） */
function appendToLastUser(chat, block, marker) {
    const idx = lastUserIndex(chat);
    if (idx < 0 || !block) return false;
    const msg = chat[idx];
    const tag = marker || "【查卡器资料】";
    const prev = messageText(msg);
    if (prev.indexOf(tag) >= 0) return false;   // 已有就别重复追加（认 content / mes 两种形状）
    return setMessageText(msg, prev + "\n\n" + tag + "\n" + block);   // 写回这条消息原本用的字段
}


/** 纯函数：把上一轮追加过的资料去掉（切开关/换内容时不残留） */
function stripMarker(chat, marker) {
    const tag = marker || "【查卡器资料】";
    let n = 0;
    if (!Array.isArray(chat)) return 0;
    for (const m of chat) {
        const text = messageText(m);
        if (!text) continue;
        const at = text.indexOf("\n\n" + tag);
        if (at >= 0) { setMessageText(m, text.slice(0, at)); n++; }
    }
    return n;
}


/** 纯函数+注册表：算这次要追加的资料 —— 从最后一条玩家消息里识别卡（不需要额外输入） */
async function buildBlock(chat) {
    if (!registry.has("resolveCards")) return "";
    const idx = lastUserIndex(chat);
    if (idx < 0) return "";
    const text = messageText(chat[idx]);
    if (!text.trim()) return "";
    try {
        const cards = await registry.call("resolveCards", text);
        if (!cards || !cards.length) return "";
        const rows = [];
        for (const c of cards.slice(0, 6)) rows.push("【" + c.name + "】" + String(c.text || "").slice(0, 500));
        // 资料末尾固定附上「仅供参考 / 是否采用由你决定」：与注入路径同一份文案，用户改「提示词 → 判断提示」时两处同时变。
        // 每张卡片行已截断到 500 字，标注不会被挤掉（这条路径没有预算截断）。
        const judge = String(judgeText() || "").trim();
        return rows.join(String.fromCharCode(10) + String.fromCharCode(10)) + (judge ? String.fromCharCode(10, 10) + judge : "");
    } catch (error) { return ""; }
}

/** 处理一次"发送体就绪"事件：原地改 chat。返回改动条数（0 表示没动） */
async function handlePromptReady(eventData) {
    if (!eventData || eventData.dryRun === true) return 0;                // 预览/计数不算真发送
    const chat = eventData.chat;
    if (!Array.isArray(chat) || !chat.length) return 0;
    try { if (typeof settings.isolationActive === "function" && settings.isolationActive()) return 0; } catch (error) { /* 没有该能力就继续 */ }
    const mode = String(settings.get("bodyEditMode") || "off");
    if (mode !== "append") { const n = stripMarker(chat); if (n) log("发送体", "已清掉上一轮追加的资料 " + n + " 处"); return 0; }
    const block = await buildBlock(chat);
    if (!block) return 0;
    const changed = appendToLastUser(chat, block) ? 1 : 0;
    if (changed) log("发送体", "已把资料追加到最后一条玩家消息（" + block.length + " 字）");
    return changed;
}

/** 注册：拿到宿主 eventSource 后由事件层调用（事件名缺失时安全跳过） */
function installSendBody(source, eventTypes, name) {
    if (!source || typeof source.on !== "function") return false;
    const key = name || "CHAT_COMPLETION_PROMPT_READY";
    const mapped = function (k) { return (eventTypes && eventTypes[k]) || k; };
    let mounted = 0;
    // ① 官方 ST 钩子（真正基于 SillyTavern 生成链路时有效）
    try {
        source.on(mapped(key), function (eventData) {
            Promise.resolve(handlePromptReady(eventData)).catch(function (error) {
                log("发送体", "处理失败（不影响发送）：" + (error && error.message ? error.message : error));
            });
        });
        mounted++;
        log("发送体", "已挂上发送体钩子：" + mapped(key));
    } catch (error) { log("发送体", "官方钩子挂载失败（不影响发送）：" + (error && error.message ? error.message : error)); }
    // ② v1 的兜底通道：桌面客户端（tt）既不执行 generate_interceptor、也不触发上面的官方钩子，
    //    只在 GENERATION_AFTER_COMMANDS（提示词组装前）与 MESSAGE_SENT 触发 —— 资料必须在这里追加才进本次发送。
    const runChannel = function (label) {
        try {
            const c = ctx();
            const chat = (c && Array.isArray(c.chat)) ? c.chat : null;
            if (!chat || !chat.length) return;
            Promise.resolve(handlePromptReady({ chat: chat })).then(function (n) {
                if (n) log("发送体", label + "：已把资料追加进即将发送的消息（" + n + " 处）");
                if (registry.has("injectFallback:run")) {
                    return registry.call("injectFallback:run").then(function (r) {
                        if (r && r.ok) log("兜底", label + " 兜底注入 " + r.chars + " 字");
                    });
                }
            }).catch(function (error) {
                log("发送体", label + " 处理失败（不影响发送）：" + (error && error.message ? error.message : error));
            });
        } catch (error) { try { log("发送体", label + " 异常（不影响发送）：" + (error && error.message ? error.message : error)); } catch (e2) { /* 忽略 */ } }
    };
    for (const k of ["GENERATION_AFTER_COMMANDS", "MESSAGE_SENT"]) {
        try {
            source.on(mapped(k), function (a) { if (String(a || "") === "quiet") return; runChannel(mapped(k)); });
            mounted++;
            log("发送体", "已挂兜底通道：" + mapped(k));
        } catch (error) { log("发送体", "兜底通道挂载失败：" + mapped(k)); }
    }
    return mounted > 0;
}

function registerSendBody() {
    registry.provide("sendbody:handle", async function (data) { return await handlePromptReady(data); });
    registry.provide("sendbody:on", function (source, eventTypes) { return installSendBody(source, eventTypes); });
}

const sendbody = { MODES, messageText, isUserMessage, setMessageText, handlePromptReady, appendToLastUser, stripMarker, lastUserIndex, buildBlock, installSendBody, registerSendBody };

return { MODES, messageText, isUserMessage, setMessageText, lastUserIndex, appendToLastUser, stripMarker, buildBlock, handlePromptReady, installSendBody, registerSendBody, sendbody };
});

__def("src/inject/writer.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");
const { settings } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");

/** ── 统一模板（注入模块）：常量 → 纯函数 → 写入 → register → exports ── */

/** 1) 常量：固定 id → 每轮覆盖同一注入（官方 /inject 语义：同 id 覆盖，空串取消） */
const INJECTION_ID = "YgoCardLookupV2";

/** 2) 纯函数：位置名 → extension_prompt_types 数值 */
function positionValue(name, types) {
    const t = types || { IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 };
    const key = String(name || "chat").toLowerCase();
    // 兼容历史写法：in_chat / in_prompt / before_prompt
    if (key === "before" || key === "before_prompt") return t.BEFORE_PROMPT !== undefined ? t.BEFORE_PROMPT : 2;
    if (key === "after" || key === "in_prompt") return t.IN_PROMPT !== undefined ? t.IN_PROMPT : 0;
    return t.IN_CHAT !== undefined ? t.IN_CHAT : 1;
}

/** 3) 写入：官方 setExtensionPrompt(id, text, position, depth) */
function writeInjection(text) {
    const c = ctx();
    const set = c.setExtensionPrompt;
    if (typeof set !== "function") { log("注入", "当前客户端不支持 setExtensionPrompt，跳过写入"); return false; }
    const position = positionValue(settings.get("injectPosition"), c.extension_prompt_types);
    const depth = Math.max(0, Number(settings.get("injectDepth")) || 0);
    try {
        set(INJECTION_ID, String(text || ""), position, depth);
        return true;
    } catch (error) {
        console.warn("[YGO2] 注入写入失败", error);
        return false;
    }
}

/** 清空本扩展的注入（官方语义：空字符串即取消） */
function clearInjection() { return writeInjection(""); }

/** 4) 注册：拦截器默认走官方写入；测试可覆盖 */
function registerWriter() {
    registry.provide("writeInjection", async function (text) { return writeInjection(text); });
    log("注入", "写入能力已注册（writeInjection → setExtensionPrompt）");
}

const writer = { INJECTION_ID, positionValue, writeInjection, clearInjection, registerWriter };

return { INJECTION_ID, positionValue, writeInjection, clearInjection, registerWriter, writer };
});

__def("src/ui/diy.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");
const { settings } = __req("src/core/settings.js");
const { ownBase } = __req("src/core/http.js");
const { registry } = __req("src/core/registry.js");
const { escapeHtml } = __req("src/ui/result.js");
const { waitForElement } = __req("src/ui/prompt.js");
const { manageDiy, normalizeDiyCard, diyTypeText, DIY_MONSTER_FRAMES } = __req("src/data/collection.js");

/** ── 统一模板（界面模块）：常量 → 纯函数（画卡） → 编辑器 → register → exports ── */

/** 1) 常量 */
const EDITOR_ID = "ygo2_diy_editor";
const CATEGORIES = ["怪兽", "魔法", "陷阱"];
const FRAMES = DIY_MONSTER_FRAMES;
const ATTRS = ["光", "暗", "地", "水", "炎", "风", "神"];
const RACES = ["龙", "魔法师", "战士", "机械", "恶魔", "天使", "不死", "昆虫", "恐龙", "兽", "兽战士", "鸟兽", "植物", "水", "炎", "雷", "岩石", "念动力", "电子界", "幻龙", "幻神兽", "创造神"];
const ARROWS = ["左上", "上", "右上", "左", "右", "左下", "下", "右下"];
const SPELL_SUBTYPES = ["通常", "永续", "装备", "速攻", "场地", "仪式"];
const TRAP_SUBTYPES = ["通常", "永续", "反击"];
const ATTR_COLOR = { 光: "#e8d24a", 暗: "#7a4fa8", 地: "#8a6a3a", 水: "#3a7ac8", 炎: "#c8483a", 风: "#3aa86a", 神: "#d8a02a" };
/** 各卡种的边框配色（CSS 卡框用；真实 PNG 素材缺失时的主路径） */
const FRAME_STYLE = {
    通常: { edge: "#c9a227", bg: "#f0e2b0" }, 效果: { edge: "#c8722a", bg: "#f6e0c0" },
    仪式: { edge: "#2f6fb0", bg: "#dbe6f4" }, 融合: { edge: "#8a5aa8", bg: "#e8dcf2" },
    同调: { edge: "#c9c9c9", bg: "#ececec" }, 超量: { edge: "#3a3a3a", bg: "#e2e2e2" },
    连接: { edge: "#2f8a8a", bg: "#d8eeee" }, 灵摆: { edge: "#b06a2a", bg: "#f2e2cc" },
    魔法: { edge: "#2f8a6a", bg: "#dbeee6" }, 陷阱: { edge: "#b04a8a", bg: "#f2dcec" },
};

/** 2) 纯函数 */
function frameKeyOf(card) {
    const c = card || {};
    if (c.category === "魔法" || c.category === "陷阱") return c.category;
    return FRAMES.indexOf(c.frame) >= 0 ? c.frame : "效果";
}
function frameStyleOf(card) { return FRAME_STYLE[frameKeyOf(card)] || FRAME_STYLE.效果; }

function typeLine(card) {
    const c = card || {};
    const isSpell = c.category === "魔法", isTrap = c.category === "陷阱";
    const sub = String(c.subtype || "").trim();
    if (isSpell) return "【魔法卡" + (sub ? "／" + sub : "") + "】";
    if (isTrap) return "【陷阱卡" + (sub ? "／" + sub : "") + "】";
    const isPend = c.frame === "灵摆";
    const parts = [String(c.race || "？") + "族", isPend ? "灵摆" : "", String(c.frame || "效果")].filter(Boolean);
    return "【" + parts.join("／") + "】";
}

function starsOf(card) {
    const c = card || {};
    if (c.frame === "连接") return "";
    if (c.frame === "超量") return "☆".repeat(Math.max(1, Math.min(13, Number(c.rank) || 4)));
    const lv = Math.max(0, Math.min(13, Number(c.level) || 0));
    return lv ? "★".repeat(lv) : "";
}

/** 纯函数：CSS 卡框（尺寸 small=150 / big=224） */
function diyCardHtml(card, size) {
    const c = card || {};
    const w = size === "small" ? 150 : 224;
    const fs = w / 224;
    const px = function (k) { return Math.round(w * k) + "px"; };
    const fpx = function (k) { return Math.round(k * fs * 10) / 10 + "px"; };
    const st = frameStyleOf(c);
    const isLink = c.frame === "连接";
    const attr = String(c.attribute || "").trim();
    const img = String(c.image || "").trim();
    const stars = starsOf(c);
    const parts = [];
    parts.push("<div class='ygo2-diy-card' data-frame='" + frameKeyOf(c) + "' style='width:" + w + "px;border:3px solid " + st.edge + ";background:" + st.bg + ";border-radius:" + px(0.03) + ";padding:" + px(0.022) + ";box-sizing:border-box;color:#1b1b1b;font-family:system-ui,sans-serif;position:relative;overflow:hidden;display:flex;flex-direction:column;gap:" + px(0.015) + "'>");
    // 卡名条
    parts.push("<div class='ygo2-diy-name' style='font-size:" + fpx(13) + ";font-weight:700;padding:" + px(0.012) + " " + px(0.02) + ";background:" + st.edge + "22;border:1px solid " + st.edge + ";border-radius:" + px(0.015) + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + escapeHtml(c.name || "（未命名）") + "</div>");
    // 星级 + 属性
    const attrDot = attr ? "<span style='width:" + px(0.05) + ";height:" + px(0.05) + ";border-radius:50%;background:" + (ATTR_COLOR[attr] || "#999") + ";display:inline-block;border:1px solid rgba(0,0,0,.35)'></span>" : "";
    parts.push("<div style='display:flex;align-items:center;justify-content:space-between;font-size:" + fpx(10) + ";min-height:" + px(0.045) + "'><span style='color:#7a5a10;letter-spacing:1px'>" + stars + "</span>" + attrDot + "</div>");
    // 卡图区
    const art = img
        ? "<img class='ygo2-diy-art' src='" + escapeHtml(img) + "' alt='' style='width:100%;height:100%;object-fit:cover'>"
        : "<div class='ygo2-diy-art-ph' style='width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:" + fpx(11) + ";opacity:.45'>卡图</div>";
    const arrows = isLink
        ? "<div class='ygo2-diy-arrows' style='position:absolute;inset:" + px(0.055) + ";pointer-events:none'>" + ARROWS.map(function (a) { return "<span class='ygo2-diy-arrow' data-arrow='" + a + "'>" + a + "</span>"; }).join("") + "</div>"
        : "";
    parts.push("<div class='ygo2-diy-artbox' style='width:100%;aspect-ratio:1/1;border:1px solid rgba(0,0,0,.35);background:#f5f5f5;overflow:hidden;position:relative'>" + art + arrows + "</div>");
    // 类型行
    parts.push("<div style='font-size:" + fpx(10) + ";padding:" + px(0.008) + " " + px(0.012) + ";background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.2);border-radius:" + px(0.012) + "'>" + escapeHtml(typeLine(c)) + "</div>");
    // 效果文本
    const body = String(c.condition ? c.condition + "\n" : "") + String(c.desc || "");
    parts.push("<div class='ygo2-diy-text' style='flex:1 1 auto;min-height:" + px(0.16) + ";font-size:" + fpx(9.5) + ";line-height:1.35;padding:" + px(0.012) + ";background:rgba(255,255,255,.62);border:1px solid rgba(0,0,0,.2);border-radius:" + px(0.012) + ";overflow:hidden;white-space:pre-wrap'>" + escapeHtml(body) + "</div>");
    // 攻守
    if (c.category === "怪兽") {
        const atk = (c.atk === undefined || c.atk === null || c.atk === "") ? "?" : String(c.atk);
        const def = (c.def === undefined || c.def === null || c.def === "") ? "?" : String(c.def);
        const stats = isLink ? "ATK/" + atk : "ATK/" + atk + "  DEF/" + def;
        parts.push("<div style='text-align:right;font-size:" + fpx(10) + ";font-weight:700'>" + stats + "</div>");
    }
    // 角标
    parts.push("<div style='position:absolute;right:" + px(0.02) + ";bottom:" + px(0.02) + ";font-size:" + fpx(8) + ";opacity:.5'>DIY·" + escapeHtml(frameKeyOf(c)) + "</div>");
    parts.push("</div>");
    return parts.join("");
}


/** ── 真实卡框（PNG 素材，与 v1 同一套文件名与叠加坐标） ── */

/** 素材文件名（与 assets/yugioh/ 一一对应） */
const REAL_FILES = {
    通常: "card-normal.webp", 效果: "card-effect.webp", 仪式: "card-ritual.webp", 融合: "card-fusion.webp",
    同调: "card-synchro.webp", 超量: "card-xyz.webp", 连接: "card-link.webp", 灵摆: "card-effect-pendulum.webp",
    魔法: "card-spell.webp", 陷阱: "card-trap.webp",
};
const REAL_PENDULUM = { 通常: "card-normal-pendulum.webp", 融合: "card-fusion-pendulum.webp", 仪式: "card-ritual-pendulum.webp", 同调: "card-synchro-pendulum.webp", 超量: "card-xyz-pendulum.webp" };
const ATTR_FILES = { 光: "attribute-light.webp", 暗: "attribute-dark.webp", 地: "attribute-earth.webp", 水: "attribute-water.webp", 炎: "attribute-fire.webp", 风: "attribute-wind.webp", 神: "attribute-divine.webp" };
const SUBTYPE_ICONS = { 永续: "icon-continuous.webp", 装备: "icon-equip.webp", 场地: "icon-field.webp", 速攻: "icon-quick-play.webp", 仪式: "icon-ritual.webp", 反击: "icon-counter.webp" };
const ARROW_FILES = { 左上: "left-up", 上: "up", 右上: "right-up", 左: "left", 右: "right", 左下: "left-down", 下: "down", 右下: "right-down" };
const ASSET_LIST = [
    "card-normal.webp", "card-effect.webp", "card-ritual.webp", "card-fusion.webp", "card-synchro.webp", "card-xyz.webp", "card-link.webp",
    "card-spell.webp", "card-trap.webp",
    "card-normal-pendulum.webp", "card-effect-pendulum.webp", "card-ritual-pendulum.webp", "card-fusion-pendulum.webp", "card-synchro-pendulum.webp", "card-xyz-pendulum.webp",
    "attribute-light.webp", "attribute-dark.webp", "attribute-earth.webp", "attribute-water.webp", "attribute-fire.webp", "attribute-wind.webp", "attribute-divine.webp",
    "attribute-spell.webp", "attribute-trap.webp",
    "icon-continuous.webp", "icon-equip.webp", "icon-field.webp", "icon-quick-play.webp", "icon-ritual.webp", "icon-counter.webp",
    "level.webp", "rank.webp",
].concat(Object.keys(ARROW_FILES).flatMap(function (a) { return ["arrow-" + ARROW_FILES[a] + "-on.webp", "arrow-" + ARROW_FILES[a] + "-off.webp"]; }));

/** 素材目录：优先用设置里的自定义目录，否则用本扩展自带的 assets/yugioh/ */
/**
 * 实测卡框素材能不能真的加载（不是看文件列表，而是让浏览器去取一张）。
 * 用途：DIY 打开时/自检时给一行明确日志，避免"面板能开但卡框空白"却查不出原因。
 */
async function checkFrameAssets() {
    const base = frameBase();
    const sample = base + "card-normal.webp";
    const custom = String(settings.get("diyFrameBase") || "").trim();
    if (typeof Image !== "function") return "（当前环境不支持 Image，跳过实测）";
    const ok = await new Promise(function (resolve) {
        const img = new Image();
        let done = false;
        const finish = function (v) { if (!done) { done = true; resolve(v); } };
        img.onload = function () { finish(true); };
        img.onerror = function () { finish(false); };
        setTimeout(function () { finish(false); }, 5000);
        img.src = sample;
    });
    if (ok) { log("DIY", "卡框素材加载正常：" + sample); return "✅ 卡框素材加载正常（" + sample + "）"; }
    const msg = "❌ 卡框素材加载失败：" + sample + (custom ? "（当前用的是自定义目录：" + custom + "）" : "") + "。检查该路径下是否有 card-normal.webp；若是从 GitHub 安装，请确认为最新版（数据/素材路径已改为自动定位）。";
    log("DIY", msg);
    return msg;
}
function frameBase() {
    const custom = String(settings.get("diyFrameBase") || "").trim();
    if (custom) return custom.replace(/\/?$/, "/");
    return ownBase() + "assets/yugioh/";
}

/** 纯函数：真实卡框 HTML（叠字坐标与 v1 一致；加载失败由 installFrameFallback 换成 CSS 版） */
function realFrameHtml(card, size) {
    const c = card || {};
    const w = size === "small" ? 150 : 224;
    const h = Math.round(w * 614 / 421);          // 实卡比例
    const base = frameBase();
    const isSpell = c.category === "魔法";
    const isTrap = c.category === "陷阱";
    const frameKey = isSpell ? "魔法" : isTrap ? "陷阱" : (FRAMES.indexOf(c.frame) >= 0 ? c.frame : "效果");
    const isPend = String(c.frame || "") === "灵摆";
    const file = (isPend && REAL_PENDULUM[frameKey]) ? REAL_PENDULUM[frameKey] : (REAL_FILES[frameKey] || "card-effect.webp");
    const attrFile = isSpell ? "attribute-spell.webp" : isTrap ? "attribute-trap.webp" : (ATTR_FILES[String(c.attribute || "")] || "");
    const isLink = String(c.frame || "") === "连接";
    const isXyz = String(c.frame || "") === "超量";
    const starCount = isLink ? 0 : Math.max(0, Math.min(13, isXyz ? (Number(c.rank) || 4) : (Number(c.level) || 0)));
    const fpx = function (k) { return Math.round(w * k) + "px"; };
    const img = String(c.image || "").trim();
    const parts = [];
    parts.push("<div class='ygo2-diy-card ygo2-real' style='position:relative;width:" + w + "px;height:" + h + "px' data-fallback='" + escapeHtml(diyCardHtml(c, size)) + "'>");
    parts.push("<img class='ygo2-frame' src='" + base + file + "' alt='' style='position:absolute;left:0;top:0;width:100%;height:100%'>");
    if (img) parts.push("<img class='ygo2-art' src='" + escapeHtml(img) + "' alt='' style='position:absolute;left:9.5%;top:13.4%;width:81%;height:55%;object-fit:cover'>");
    parts.push("<div style='position:absolute;left:9.5%;top:3.4%;width:72%;color:#111;font-weight:700;font-size:" + fpx(0.075) + ";line-height:1.15;overflow:hidden;white-space:nowrap'>" + escapeHtml(String(c.name || "未命名")) + "</div>");
    if (attrFile) parts.push("<img src='" + base + attrFile + "' alt='' style='position:absolute;right:6%;top:3.2%;width:" + fpx(0.115) + ";height:" + fpx(0.115) + "'>");
    if (starCount) {
        const starFile = isXyz ? "rank.webp" : "level.webp";
        const stars = [];
        for (let i = 0; i < starCount; i++) stars.push("<img src='" + base + starFile + "' alt='' style='width:" + fpx(0.058) + ";height:" + fpx(0.058) + "'>");
        parts.push("<div style='position:absolute;right:6%;top:10.6%;display:flex;justify-content:flex-end;width:62%'>" + stars.join("") + "</div>");
    }
    if (isLink) {
        parts.push("<div style='position:absolute;right:7%;top:10.8%;color:#111;font-weight:700;font-size:" + fpx(0.06) + "'>LINK-" + (Number(c.link) || 2) + "</div>");
        const pos = { 左上: "left:12%;top:12.5%", 上: "left:44%;top:12.5%", 右上: "left:76%;top:12.5%", 左: "left:5.5%;top:38%", 右: "left:83%;top:38%", 左下: "left:12%;top:63.5%", 下: "left:44%;top:63.5%", 右下: "left:76%;top:63.5%" };
        const chosen = Array.isArray(c.arrows) ? c.arrows : ARROWS.slice(0, Number(c.link) || 2);
        parts.push(ARROWS.map(function (a) {
            const on = chosen.indexOf(a) >= 0;
            const f = "arrow-" + ARROW_FILES[a] + (on ? "-on.webp" : "-off.webp");
            return "<img src='" + base + f + "' alt='' style='position:absolute;" + pos[a] + ";width:" + fpx(0.115) + ";height:" + fpx(0.115) + "'>";
        }).join(""));
    }
    const icon = SUBTYPE_ICONS[String(c.subtype || "")];
    if (icon) parts.push("<img src='" + base + icon + "' alt='' style='position:absolute;right:7%;top:68.8%;width:" + fpx(0.09) + ";height:" + fpx(0.09) + "'>");
    parts.push("<div style='position:absolute;left:9.5%;top:73.2%;width:81%;height:19%;font-size:" + fpx(0.052) + ";color:#111;line-height:1.45;overflow:hidden;white-space:pre-wrap'>" + (c.condition ? "<b>【召唤条件】" + escapeHtml(String(c.condition)) + "</b><br>" : "") + escapeHtml(String(c.desc || "")) + "</div>");
    if (!isSpell && !isTrap) {
        const atk = (c.atk === undefined || c.atk === null || c.atk === "") ? "?" : String(c.atk);
        const def = (c.def === undefined || c.def === null || c.def === "") ? "?" : String(c.def);
        parts.push("<div style='position:absolute;right:9%;bottom:4.2%;color:#111;font-weight:700;font-size:" + fpx(0.058) + "'>ATK/" + escapeHtml(atk) + (isLink ? "" : " DEF/" + escapeHtml(def)) + "</div>");
    }
    if (c.setcode || c.passcode) parts.push("<div style='position:absolute;left:9.5%;bottom:0.6%;font-size:" + fpx(0.042) + ";color:#333'>" + escapeHtml(String(c.setcode || "")) + (c.passcode ? " " + escapeHtml(String(c.passcode)) : "") + "</div>");
    parts.push("</div>");
    return parts.join("");
}

/** 按设置选择真实卡框 / CSS 卡面 */
function cardFaceHtml(card, size) {
    return settings.get("diyFrameMode") === "real" ? realFrameHtml(card, size) : diyCardHtml(card, size);
}

/** 卡框加载失败时把整张卡换成 CSS 版（error 不冒泡，所以用捕获阶段委托） */
let frameFallbackInstalled = false;
function installFrameFallback() {
    if (frameFallbackInstalled) return false;
    const d = (typeof document !== "undefined") ? document : null;
    if (!d || typeof d.addEventListener !== "function") return false;
    d.addEventListener("error", function (event) {
        const el = event && event.target;
        if (!el || !el.tagName || String(el.tagName).toLowerCase() !== "img") return;
        const card = el.closest ? el.closest(".ygo2-diy-card") : null;
        if (!card) return;
        const fb = card.getAttribute && card.getAttribute("data-fallback");
        if (!fb) return;
        try { card.outerHTML = fb; log("DIY", "真实卡框加载失败，已回退 CSS 版"); } catch (error) { /* 忽略 */ }
    }, true);
    frameFallbackInstalled = true;
    log("界面", "已安装真实卡框失败回退");
    return true;
}

/** 素材检查：逐个 HEAD 请求，列出缺失文件 */
async function checkAssets(fetchImpl) {
    const base = frameBase();
    const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
    const ok = [], missing = [];
    if (!doFetch) return { base: base, ok: ok, missing: ASSET_LIST.slice(), note: "当前环境没有 fetch" };
    for (const name of ASSET_LIST) {
        let found = false;
        try { const r = await doFetch(base + name, { method: "HEAD" }); found = !!(r && r.ok); } catch (error) { found = false; }
        (found ? ok : missing).push(name);
    }
    return { base: base, ok: ok, missing: missing, note: missing.length ? "缺的卡种会自动回退 CSS 版" : "素材齐全" };
}

/** 3) 编辑器 */
function subtypeOptions(category, current) {
    const list = category === "魔法" ? SPELL_SUBTYPES : category === "陷阱" ? TRAP_SUBTYPES : [];
    return ['<option value="">（无）</option>'].concat(list.map(function (x) {
        return '<option value="' + x + '"' + (String(current) === x ? " selected" : "") + ">" + x + "</option>";
    })).join("");
}
function options(list, current) {
    return list.map(function (x) { return '<option value="' + x + '"' + (String(current) === x ? " selected" : "") + ">" + x + "</option>"; }).join("");
}

function editorHtml(card) {
    const c = normalizeDiyCard(card || {});
    const v = function (x) { return escapeHtml(x === undefined || x === null ? "" : String(x)); };
    return '<div id="' + EDITOR_ID + '" class="ygo2-diy-editor-box">' +
        '<div class="ygo2-diy-editor">' +
        '<div class="ygo2-diy-form">' +
        '<label class="ygo2-label">卡名</label><input class="text_pole" id="ygo2_diy_name" type="text" value="' + v(c.name) + '">' +
        '<label class="ygo2-label">类别</label><select class="text_pole" id="ygo2_diy_category">' + options(CATEGORIES, c.category) + '</select>' +
        '<label class="ygo2-label">卡种（决定边框）</label><select class="text_pole" id="ygo2_diy_frame">' + options(FRAMES, c.frame) + '</select>' +
        '<label class="ygo2-label">属性</label><select class="text_pole" id="ygo2_diy_attribute"><option value="">（无）</option>' + options(ATTRS, c.attribute) + '</select>' +
        '<label class="ygo2-label">种族</label><select class="text_pole" id="ygo2_diy_race"><option value="">（无）</option>' + options(RACES, c.race) + '</select>' +
        '<div class="ygo2-diy-row"><div><label class="ygo2-label">等级</label><input class="text_pole" id="ygo2_diy_level" type="number" min="0" max="13" value="' + v(c.level) + '"></div>' +
        '<div><label class="ygo2-label">阶级（超量）</label><input class="text_pole" id="ygo2_diy_rank" type="number" min="0" max="13" value="' + v(c.rank) + '"></div></div>' +
        '<div class="ygo2-diy-row"><div><label class="ygo2-label">连接值</label><input class="text_pole" id="ygo2_diy_link" type="number" min="1" max="8" value="' + v(c.link) + '"></div>' +
        '<div><label class="ygo2-label">灵摆刻度</label><input class="text_pole" id="ygo2_diy_scale" type="number" min="0" max="13" value="' + v(c.scale) + '"></div></div>' +
        '<div class="ygo2-diy-row"><div><label class="ygo2-label">攻击力</label><input class="text_pole" id="ygo2_diy_atk" type="text" value="' + v(c.atk) + '"></div>' +
        '<div><label class="ygo2-label">守备力</label><input class="text_pole" id="ygo2_diy_def" type="text" value="' + v(c.def) + '"></div></div>' +
        '<label class="ygo2-label">子类型（魔法/陷阱）</label><select class="text_pole" id="ygo2_diy_subtype">' + subtypeOptions(c.category, c.subtype) + '</select>' +
        '<label class="ygo2-label">召唤条件（可留空）</label><input class="text_pole" id="ygo2_diy_condition" type="text" value="' + v(c.condition) + '">' +
        '<label class="ygo2-label">效果文本</label><textarea class="text_pole ygo2-textarea" id="ygo2_diy_desc" rows="6">' + v(c.desc) + '</textarea>' +
        '<label class="ygo2-label">卡图网址（或留空）</label><input class="text_pole" id="ygo2_diy_image" type="text" value="' + v(c.image) + '" placeholder="https://…">' +
        '<label class="ygo2-label">卡包号 / 密码（可留空）</label>' +
        '<div class="ygo2-diy-row"><input class="text_pole" id="ygo2_diy_setcode" type="text" value="' + v(c.setcode) + '" placeholder="DIY-EN001">' +
        '<input class="text_pole" id="ygo2_diy_passcode" type="text" value="' + v(c.passcode) + '" placeholder="8 位密码"></div>' +
        '</div>' +
        '<div class="ygo2-diy-side"><div id="ygo2_diy_preview">' + cardFaceHtml(c, "big") + '</div>' +
        '<div class="ygo2-diy-actions"><div class="menu_button" id="ygo2_diy_save">保存</div>' +
        '<div class="menu_button" id="ygo2_diy_delete">删除</div></div>' +
        '<div class="ygo2-hint" id="ygo2_diy_state"></div></div>' +
        '</div></div>';
}

/** 从编辑器 DOM 读出草稿 */
function readDraft(root, getEl) {
    const g = getEl || function (id) { return root ? root.querySelector("#" + id) : null; };
    const val = function (id) { const el = g(id); return el ? String(el.value || "") : ""; };
    return normalizeDiyCard({
        name: val("ygo2_diy_name"), category: val("ygo2_diy_category") || "怪兽", frame: val("ygo2_diy_frame") || "效果",
        attribute: val("ygo2_diy_attribute"), race: val("ygo2_diy_race"),
        level: val("ygo2_diy_level"), rank: val("ygo2_diy_rank"), link: val("ygo2_diy_link"), scale: val("ygo2_diy_scale"),
        atk: val("ygo2_diy_atk"), def: val("ygo2_diy_def"), subtype: val("ygo2_diy_subtype"),
        condition: val("ygo2_diy_condition"), desc: val("ygo2_diy_desc"), image: val("ygo2_diy_image"),
        setcode: val("ygo2_diy_setcode"), passcode: val("ygo2_diy_passcode"),
    });
}

/** 打开编辑器：弹窗期间轮询绑定，字段变化实时刷新预览 */
async function openDiyEditor(name) {
    const c = ctx();
    if (!c || typeof c.callGenericPopup !== "function") { log("DIY", "当前环境不支持弹窗，无法打开图形编辑器"); return "当前环境不支持弹窗，可用 /ygodiy add name=卡名 快速创建。"; }
    let draft = null;
    if (name) {
        const list = settings.get("diyCards") || [];
        draft = list.filter(function (x) { return x.name === name; })[0] || null;
    }
    const types = c.POPUP_TYPE || {};
    const promise = c.callGenericPopup(editorHtml(draft || {}), types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "关闭" });
    const root = await waitForElement(EDITOR_ID);
    if (!root) { log("DIY", "编辑器没有显示"); return "编辑器没有正常显示。"; }
    const getEl = function (id) { return root.querySelector("#" + id); };
    const refresh = function () {
        const box = getEl("ygo2_diy_preview");
        if (box) box.innerHTML = cardFaceHtml(readDraft(root, getEl), "big");
    };
    let bound = 0;
    for (const id of ["ygo2_diy_name", "ygo2_diy_category", "ygo2_diy_frame", "ygo2_diy_attribute", "ygo2_diy_race", "ygo2_diy_level", "ygo2_diy_rank", "ygo2_diy_link", "ygo2_diy_scale", "ygo2_diy_atk", "ygo2_diy_def", "ygo2_diy_subtype", "ygo2_diy_condition", "ygo2_diy_desc", "ygo2_diy_image", "ygo2_diy_setcode", "ygo2_diy_passcode"]) {
        const el = getEl(id);
        if (!el) continue;
        el.addEventListener("input", refresh);
        el.addEventListener("change", refresh);
        bound++;
    }
    const saveBtn = getEl("ygo2_diy_save");
    if (saveBtn) saveBtn.addEventListener("click", async function () {
        const card = readDraft(root, getEl);
        const state = getEl("ygo2_diy_state");
        if (!card.name) { if (state) state.textContent = "卡名不能为空。"; return; }
        await manageDiy({ action: "add", ...card });
        if (state) state.textContent = "已保存：" + card.name + "（" + diyTypeText(card) + "）";
        log("DIY", "已保存 " + card.name);
    });
    const delBtn = getEl("ygo2_diy_delete");
    if (delBtn) delBtn.addEventListener("click", async function () {
        const nm = String(readDraft(root, getEl).name || "").trim();
        const state = getEl("ygo2_diy_state");
        if (!nm) { if (state) state.textContent = "没有卡名，无法删除。"; return; }
        const out = await manageDiy({ action: "del", name: nm });
        if (state) state.textContent = String(out);
        log("DIY", String(out));
    });
    log("DIY", "编辑器已打开（绑定 " + bound + " 个字段）");
    try { await promise; } catch (error) { /* 关闭方式不影响已保存内容 */ }
    return "DIY 编辑器已打开。";
}

/** 4) 注册能力 */
function registerDiyUi() {
    registry.provide("ui:diy", async function (args) { return await openDiyEditor(args && args.name); });
    registry.provide("diyCardHtml", async function (args) { const list = settings.get("diyCards") || []; const card = list.filter(function (x) { return x.name === (args && args.name); })[0]; return card ? cardFaceHtml(card, (args && args.size) || "big") : ""; });
    registry.provide("diyCheckAssets", async function () { const r = await checkAssets(); return "素材目录：" + r.base + "\n已有 " + r.ok.length + " / " + ASSET_LIST.length + " 个文件" + (r.missing.length ? "\n缺：" + r.missing.join("  ") + "\n（缺的卡种会回退 CSS 版）" : "\n素材齐全 ✓"); });
    log("界面", "DIY 图形编辑器已注册（ui:diy）");
}

const diyUi = { EDITOR_ID, REAL_FILES, REAL_PENDULUM, ATTR_FILES, SUBTYPE_ICONS, ARROW_FILES, ASSET_LIST, frameBase, realFrameHtml, cardFaceHtml, installFrameFallback, checkAssets, CATEGORIES, FRAMES, ATTRS, RACES, ARROWS, SPELL_SUBTYPES, TRAP_SUBTYPES, ATTR_COLOR, FRAME_STYLE, frameKeyOf, frameStyleOf, typeLine, starsOf, diyCardHtml, subtypeOptions, editorHtml, readDraft, openDiyEditor, registerDiyUi };

return { EDITOR_ID, CATEGORIES, FRAMES, ATTRS, RACES, ARROWS, SPELL_SUBTYPES, TRAP_SUBTYPES, ATTR_COLOR, FRAME_STYLE, frameKeyOf, frameStyleOf, typeLine, starsOf, diyCardHtml, REAL_FILES, REAL_PENDULUM, ATTR_FILES, SUBTYPE_ICONS, ARROW_FILES, ASSET_LIST, checkFrameAssets, frameBase, realFrameHtml, cardFaceHtml, installFrameFallback, checkAssets, subtypeOptions, editorHtml, readDraft, openDiyEditor, registerDiyUi, diyUi };
});

__def("src/ui/game.js", function (__req) {
const { waitForElement } = __req("src/ui/prompt.js");
const { ctx, log } = __req("src/core/bus.js");
const { settings } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");
const { escapeHtml } = __req("src/ui/result.js");
const { writeBuyRequest } = __req("src/ui/sendbox.js");
const { getStatsIndex } = __req("src/data/indexes.js");
const { imageUrl, findCard, parseTypeText } = __req("src/data/cards.js");
const { collectionState, pickSeeded, shopSeed, chatScopeKey, todayKey } = __req("src/data/collection.js");
const { getBoard, PHASES, SIDE_LABEL, recapRows } = __req("src/data/board.js");

/** ── 统一模板（界面模块）：常量 → 纯函数（生成 HTML） → 打开 → register → exports ── */

/** 1) 常量 */
const ZONE_LABEL = { field: "场上", hand: "手牌", grave: "墓地", extra: "额外", banished: "除外" };
const GRID_CLASS = "ygo2-grid";

/** 2) 纯函数（都可断言，不碰 DOM） */
function cardsGrid(items) {
    return '<div class="' + GRID_CLASS + '">' + items.map(function (it) {
        return '<figure class="ygo2-cell' + (it.dim ? " dim" : "") + '">' +
            (it.id ? '<img loading="lazy" src="' + escapeHtml(imageUrl(it.id)) + '" alt="">' : '<div class="ygo2-cell-ph">?</div>') +
            '<figcaption title="' + escapeHtml(it.name || "") + '">' + escapeHtml(it.name || "") + '</figcaption>' +
            (it.note ? '<span class="ygo2-cell-note">' + escapeHtml(it.note) + '</span>' : "") +
            (it.buy ? '<div class="ygo2-buy menu_button" data-ygo2-buy="' + escapeHtml(it.buy) + '">购买</div>' : "") +
            '</figure>';
    }).join("") + '</div>';
}

/** 收藏册：已收集卡 + 进度（未收集的只显示数量，不铺满屏） */
async function collectionHtml(args) {
    const state = collectionState();
    const stats = await getStatsIndex();
    const kinds = Object.keys(state.map).length;
    const total = stats.rows.length;
    const pct = total ? (kinds / total * 100) : 0;
    const owned = Object.keys(state.map).map(function (id) { return stats.byId.get(String(id)); }).filter(Boolean);
    let picked = owned;
    const keyword = String((args && args.series) || "").trim();
    if (keyword) picked = owned.filter(function (r) { return r.name.indexOf(keyword) >= 0; });
    picked = picked.slice(0, 240);
    return '<div class="ygo2-view">' +
        '<div class="ygo2-view-head">📖 收藏册<small>已收集 ' + kinds + " / " + total + " 种（" + pct.toFixed(1) + "%）｜累计抽到 " + state.total + ' 张' + (keyword ? "｜筛选：" + escapeHtml(keyword) : "") + '</small></div>' +
        '<div class="ygo2-progress"><i style="width:' + pct.toFixed(2) + '%"></i></div>' +
        (picked.length ? cardsGrid(picked.map(function (r) { return { id: r.id, name: r.name, note: (state.map[r.id] || 0) + " 张" }; }))
            : '<div class="ygo2-empty">' + (keyword ? "这个系列还没有收集到卡。" : "还没有收集到卡：开卡包、抽卡或商店获得后会记在这里。") + '</div>') +
        '</div>';
}

/** 每日商店：当天固定的几件（同一天同一聊天不变） */
async function shopHtml(args) {
    const stats = await getStatsIndex();
    const size = Math.max(1, Math.min(20, Number((args && args.size) || settings.get("shopSize")) || 5));
    const day = (args && args.date) || todayKey();
    const includeDiy = settings.get("shopIncludeDiy") !== false;
    const pool = stats.rows.map(function (r) { return r.id; });
    if (includeDiy) for (const c of settings.get("diyCards") || []) if (c && c.name) pool.push("diy:" + c.name);
    const picked = pickSeeded(pool, size, shopSeed(day, chatScopeKey()));
    const items = picked.map(function (id) {
        if (String(id).indexOf("diy:") === 0) return { name: String(id).slice(4) + "（DIY 卡）", note: "DIY", buy: String(id).slice(4) };
        const row = stats.byId.get(String(id));
        return row ? { id: row.id, name: row.name, note: row.typeText ? row.typeText.slice(0, 18) : "", buy: row.name } : null;
    }).filter(Boolean);
    return '<div class="ygo2-view">' +
        '<div class="ygo2-view-head">🏪 每日商店 · ' + escapeHtml(day) + '<small>共 ' + items.length + ' 件｜同一天同一聊天固定不变，过一天才会换一批（不能刷新）</small></div>' +
        cardsGrid(items) +
        '</div>';
}

/** 决斗盘：双方 LP / 场上 / 手牌 / 墓地 + 回合与阶段 */
async function boardHtml() {
    const b = getBoard();
    const side = function (key) {
        const s = b[key];
        const zone = function (name) {
            const list = s[name] || [];
            return '<div class="ygo2-zone"><b>' + ZONE_LABEL[name] + '（' + list.length + '）</b>' +
                (list.length ? list.map(function (c) { return '<span class="ygo2-chip" title="' + escapeHtml(c.position || "") + '">' + escapeHtml(c.name) + '</span>'; }).join("") : '<span class="ygo2-chip-empty">空</span>') + '</div>';
        };
        return '<div class="ygo2-side ' + (key === "me" ? "me" : "opp") + '">' +
            '<div class="ygo2-side-head">' + SIDE_LABEL[key] + '<b>LP ' + s.lp + '</b></div>' +
            zone("field") + zone("hand") + zone("grave") +
            '</div>';
    };
    return '<div class="ygo2-view">' +
        '<div class="ygo2-view-head">⚔️ 决斗盘 · 第 ' + b.turn + ' 回合 · ' + PHASES[b.phaseIndex] + '<small>盘面只记录事实，谁强谁弱由 AI 判断</small></div>' +
        '<div class="ygo2-board">' + side("opp") + side("me") + '</div>' +
        (b.log.length ? '<div class="ygo2-board-log">最近：' + b.log.slice(-6).map(escapeHtml).join("；") + '</div>' : "") +
        '</div>';
}

/** 本局卡表：聊到过的卡（图形版） */
async function recapHtml(args) {
    const res = await recapRows((args && args.limit) || 60);
    return '<div class="ygo2-view">' +
        '<div class="ygo2-view-head">📜 本局卡表<small>共 ' + res.rows.length + ' 种（扫描：' + (res.scale === "all" ? "最近 30 条消息" : "最近 5 条玩家消息") + '）</small></div>' +
        (res.rows.length ? cardsGrid(res.rows.map(function (r) { return { id: r.id, name: r.name, note: r.typeText ? r.typeText.slice(0, 16) : "" }; }))
            : '<div class="ygo2-empty">本局还没识别到卡名。</div>') +
        '</div>';
}

/** 单卡图形视图：卡图 + 数值表 */
async function cardHtml(query) {
    const row = await findCard(query);
    if (!row) return '<div class="ygo2-view"><div class="ygo2-empty">没有找到「' + escapeHtml(String(query || "")) + '」。</div></div>';
    const t = parseTypeText(row.typeText);
    const pairs = [
        ["密码(ID)", row.id], ["CID", row.cid || "-"], ["英文名", row.en || "-"],
        ["别名", (row.aliases || []).join(" / ") || "-"],
        ["类型", (t.kinds || []).join("｜") || "-"],
        ["种族 / 属性", (t.race || "-") + " / " + (t.attribute || "-")],
        [t.levelMark === "☆" ? "阶级" : "星级", t.level ? t.levelMark + t.level : "-"],
        ["连接值", t.link ? "LINK-" + t.link : "-"],
        ["攻击 / 守备", (t.atk === "" ? "?" : t.atk) + " / " + (t.def === "" ? "?" : t.def)],
    ];
    return '<div class="ygo2-view ygo2-card-view">' +
        '<div class="ygo2-card-figure"><img src="' + escapeHtml(imageUrl(row.id)) + '" alt=""><div class="ygo2-card-name">' + escapeHtml(row.name) + '</div></div>' +
        '<table class="ygo2-card-table">' + pairs.map(function (p) { return '<tr><th>' + escapeHtml(p[0]) + '</th><td>' + escapeHtml(String(p[1])) + '</td></tr>'; }).join("") + '</table>' +
        '</div>';
}
/** 查卡入口：弹窗内输入（不依赖宿主的 prompt，tt 里也能用） */
async function openCardInput() {
    const c = ctx();
    if (!c || typeof c.callGenericPopup !== "function") return "当前环境不支持弹窗，请用 /ygocard <卡名> 查询。";
    const types = c.POPUP_TYPE || {};
    const html = '<div class="ygo2-view"><div class="ygo2-view-head">查询卡片<small>输入卡名 / 别名 / 英文名 / 8 位卡密，回车或点「查询」</small></div>' +
        '<input class="text_pole" id="ygo2_card_query" type="text" placeholder="例如：青眼白龙 / Blue-Eyes / 89631139" style="width:100%">' +
        '<div class="ygo2-diy-actions"><div class="menu_button" id="ygo2_card_go">查询</div></div></div>';
    const promise = c.callGenericPopup(html, types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "关闭" });
    try {
        const box = await waitForElement("ygo2_card_query");
        if (box) {
            const d = typeof document !== "undefined" ? document : null;
            const go = d ? d.getElementById("ygo2_card_go") : null;
            const run = async function () {
                const q = String(box.value || "").trim();
                if (!q) return;
                const detail = await cardHtml(q);
                const wrap = box.parentNode;
                if (wrap) wrap.innerHTML = detail;
            };
            if (go) go.addEventListener("click", function () { Promise.resolve(run()).catch(function () { /* 忽略 */ }); });
            box.addEventListener("keydown", function (e) { if (e && e.key === "Enter") { Promise.resolve(run()).catch(function () { /* 忽略 */ }); } });
            try { box.focus(); } catch (error) { /* 忽略 */ }
        }
    } catch (error) { log("界面", "查卡输入框绑定失败：" + (error && error.message ? error.message : error)); }
    try { await promise; } catch (error) { /* 关闭方式不影响 */ }
    return "查卡弹窗已关闭。";
}

async function openCard(args) { return await showView("卡牌 · " + String((args && args.query) || ""), await cardHtml(args && args.query)); }

/** 点击委派：商店里的「购买」按钮只把文字写进发送栏（不改状态，发不发由用户决定） */
let delegated = false;
function installBuyDelegate() {
    if (delegated) return false;
    const d = (typeof document !== "undefined") ? document : null;
    if (!d || typeof d.addEventListener !== "function") return false;
    d.addEventListener("click", function (event) {
        const el = event && event.target && event.target.closest ? event.target.closest("[data-ygo2-buy]") : null;
        if (!el) return;
        const name = el.getAttribute("data-ygo2-buy") || "";
        const res = writeBuyRequest(name);
        if (res && res.ok) { try { if (typeof event.preventDefault === "function") event.preventDefault(); } catch (error) { /* 忽略 */ } }
    }, true);
    delegated = true;
    log("界面", "已安装商店「购买」点击委派（只写发送栏）");
    return true;
}

/** 3) 打开：统一走弹窗（受 resultPopup 开关控制） */
async function showView(title, html) {
    const c = ctx();
    if (settings.get("resultPopup") === false || !c || typeof c.callGenericPopup !== "function") {
        // 面板「结果用弹窗面板显示」关掉时，以前这里直接 return false —— 收藏册/商店/决斗盘/本局卡表/查卡/两个编辑器
        // 全都变成"按了没反应"。现在退回文本：走按钮的 toast/日志通道，用户至少能看到内容。
        const plain = String(html || "")
            .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<br\s*\/?>/gi, "\n").replace(/<\/[^>]+>/g, " ").replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        log("界面", "未弹窗（" + title + "）：" + plain.slice(0, 200));
        return plain ? (title + "：\n" + plain.slice(0, 4000)) : false;
    }
    const types = c.POPUP_TYPE || {};
    try {
        await c.callGenericPopup(html, types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "关闭" });
        log("界面", "已显示 " + title);
        return true;
    } catch (error) { log("界面", title + " 弹窗失败：" + (error && error.message ? error.message : error)); return false; }
}

async function openCollection(args) { return await showView("收藏册", await collectionHtml(args)); }
async function openShop(args) { return await showView("每日商店", await shopHtml(args)); }
async function openBoard() { return await showView("决斗盘", await boardHtml()); }
async function openRecap(args) { return await showView("本局卡表", await recapHtml(args)); }

/** 4) 注册能力 */
function registerGameUi() {
    registry.provide("ui:collection", async function (args) { return await openCollection(args); });
    registry.provide("ui:shop", async function (args) { return await openShop(args); });
    registry.provide("ui:board", async function () { return await openBoard(); });
    registry.provide("ui:recap", async function (args) { return await openRecap(args); });
    registry.provide("ui:card", async function (args) { return await openCard(args); });
    log("界面", "图形面板已注册（收藏册 / 商店 / 决斗盘 / 本局卡表）");
}

const gameUi = { ZONE_LABEL, openCardInput, installBuyDelegate, cardHtml, openCard, GRID_CLASS, collectionHtml, shopHtml, boardHtml, recapHtml, showView, openCollection, openShop, openBoard, openRecap, registerGameUi };

return { ZONE_LABEL, GRID_CLASS, collectionHtml, shopHtml, boardHtml, recapHtml, cardHtml, openCardInput, openCard, installBuyDelegate, showView, openCollection, openShop, openBoard, openRecap, registerGameUi, gameUi };
});

__def("src/ui/panel.js", function (__req) {
const { ctx, log, emit } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");
const { settings, DEFAULTS } = __req("src/core/settings.js");
const { ownBase } = __req("src/core/http.js");

/**
 * 统一模板核心：字段注册表。
 * 面板控件全部由这张表生成，不再手写 HTML 字符串。
 * type: check | select | number | text | password | textarea | button
 */
const FIELDS = [
    { group: "自动检测注入", type: "check", key: "interceptEnabled", label: "启用自动检测注入" },
    { group: "自动检测注入", type: "check", key: "enabled", label: "启用 function tool（AI 可主动调用查卡等能力）" },
    { group: "自动检测注入", type: "check", key: "detectBrackets", label: "识别括号词段" },
    { group: "自动检测注入", type: "check", key: "detectPasscode", label: "识别 8 位卡密" },
    { group: "自动检测注入", type: "check", key: "detectWholeMessage", label: "整条消息就是一个卡名时也识别" },
    { group: "自动检测注入", type: "check", key: "detectFreeText", label: "自由文本里的卡名（用本地卡名索引）", hint: "关掉后只在出现触发词或指令时才查卡。" },
    { group: "自动检测注入", type: "check", key: "naturalCommands", label: "自然语言触发词", hint: "直接打「开卡包 超级包06」「查卡 灰流丽」「今日商店」等就会执行。" },
    { group: "自动检测注入", type: "select", key: "scanScope", label: "扫描范围", hint: "只扫最后一条玩家消息，或连同最近几条一起扫。", options: [["last_user", "只看最后一条玩家消息"], ["all", "最近几条消息都看"]] },
    { group: "自动检测注入", type: "select", key: "detectStrictness", label: "识别严格程度", hint: "最严格：只认完整卡名（名字里有没有空格都认，例如「黑魔女迪亚贝尔斯塔」也能查到），几乎不误报；适中：允许「够具体」的名字片段（1–6 张）；宽松：片段判定最松、命中更多，但可能误报。", options: [["strict", "最严格：只认完整卡名"], ["normal", "适中：允许够具体的名字片段（推荐）"], ["loose", "宽松：尽量多命中（可能误报）"]] },
    { group: "自动检测注入", type: "number", key: "scanDepth", label: "扫描条数（「最近几条」时生效）", hint: "连最近几条消息一起找卡名（1-20，默认 3，与 v1 相同）。v1 里这个数字写死为 3。", min: 1, max: 20 },
    { group: "自动检测注入", type: "check", key: "duelBoard", label: "盘面内容进入提示词", hint: "开启后决斗盘状态会随注入一起给 AI。" },
    { group: "提示词", type: "button", key: "promptEditor", label: "查看 / 编辑提示词", action: "promptEditor" },
    { group: "提示词", type: "select", key: "bodyEditMode", label: "发送体改写（官方 CHAT_COMPLETION_PROMPT_READY 钩子）", hint: "off＝不动发送体（默认）；append＝把识别到的卡片资料直接追加到最后一条玩家消息里（与「注入」不同：这是改即将发送的消息本身）。", options: [["off", "off — 不动（默认）"], ["append", "append — 追加到玩家消息最后一楼"]] },
    { group: "提示词", type: "select", key: "injectLayers", label: "注入分层", hint: "minimal 最省上下文（只给效果与数值）；normal 加字段与禁限；full 再加发售、官方补充说明与最近裁定。", options: [["minimal", "minimal — 只给打牌要用的"], ["normal", "normal — 加字段与禁限"], ["full", "full — 再加发售/补充说明/裁定"]] },
    { group: "提示词", type: "select", key: "triggerMode", label: "触发方式", options: [["full", "全部：自由文本 + 触发词 + 指令"], ["keyword", "仅触发词 + 指令"], ["command", "仅指令：完全隔离"]] },
    { group: "提示词", type: "check", key: "capabilityHint", label: "注入模块速查表" },
    { group: "提示词", type: "number", key: "injectBudget", label: "提示词预算（字符）", min: 300, max: 20000, step: 100 },
    { group: "提示词", type: "select", key: "injectPosition", label: "注入位置", options: [["chat", "聊天内（可设深度，推荐）"], ["before", "主提示词之前"], ["after", "主提示词之后"]] },
    { group: "提示词", type: "number", key: "injectDepth", label: "聊天内注入深度（0=最后一条之后）", min: 0, max: 20 },
    { group: "提示词", type: "check", key: "skipQuiet", label: "摘要等 quiet 生成不注入" },
    { group: "提示词", type: "check", key: "injectionFallback", label: "拦截器不生效时用事件兜底注入", hint: "宿主不支持 generate_interceptor 时（桌面客户端常见），在消息发送前用同一个拦截器补一次注入。" },
    { group: "提示词", type: "textarea", key: "injectNote", label: "附加处理要求（留空不加）" },
    { group: "提示词", type: "select", key: "injectNotePosition", label: "注入附注的位置", hint: "tail＝跟在卡片资料之后（默认，适合「这段资料怎么用」）；head＝放在整块最前面（适合「全局设定/风格/立场」类文本，AI 更容易当成总纲）。", options: [["tail", "tail — 跟在卡片资料后（默认）"], ["head", "head — 放在整块最前"]] },
    { group: "提示词", type: "note", label: "「注入附注」里的文字会原样进入发给 AI 的提示词（预算不足时优先保留它，不会先被截断）。" },
    { group: "查询内容", type: "textarea", key: "aliases", label: "俗称表（每行一条：俗称=官方名）", hint: "例：杀调=杀手旋律。识别与查卡时会先把俗称换成官方名，所以「我发动杀调」也能查到「杀手旋律」。# 开头是注释。" },
    { group: "查询内容", type: "check", key: "includeImage", label: "卡图 Markdown" },
    { group: "查询内容", type: "check", key: "includeField", label: "字段（系列）" },
    { group: "查询内容", type: "check", key: "includeRelease", label: "首次发售" },
    { group: "查询内容", type: "check", key: "includeBanlist", label: "禁限状态" },
    { group: "查询内容", type: "check", key: "includeSupplement", label: "官方补充说明" },
    { group: "查询内容", type: "check", key: "includeFaq", label: "附带最近 3 条官方裁定" },
    { group: "查询内容", type: "select", key: "banlistRegion", label: "禁限表区域", options: [["cn", "官方简中"], ["ja", "OCG 日文"], ["en", "TCG 英文"]] },
    { group: "查询内容", type: "check", key: "useYgoprodeck", label: "允许访问 db.ygoprodeck.com", hint: "用于取异画与英文名；关闭后只用本地数据（异画索引已内置，仍可离线看）。" },
    { group: "查询内容", type: "check", key: "handImages", label: "起手模拟显示卡图" },
    { group: "查询内容", type: "number", key: "cardImgMax", label: "聊天里卡图最大宽度（像素）", min: 120, max: 900, step: 20 },
    { group: "外部接口", type: "note", label: "外部接口：开着「跟随酒馆主连接」就用你酒馆正在用的模型（不需要任何额外配置）；关掉则用下面填的地址/密钥/模型。触发时先让外部模型处理，再把结果连同卡面数据交给主 AI。" },
    { group: "外部接口", type: "check", key: "apiEnabled", label: "启用外部接口", hint: "总开关。关闭时插件绝不向外发送任何内容（只用本地卡库）。" },
    { group: "外部接口", type: "check", key: "apiFollowMain", label: "跟随酒馆主连接（地址与模型实时取自主连接，下面填的仅作备用）", hint: "开着＝用你酒馆里正在用的模型；关掉＝只用下面填的地址与模型。" },
    { group: "外部接口", type: "check", key: "apiExternalAiOwnSearch", label: "用外部 AI 时停用插件自主搜索（直接把玩家输入交给外部 AI）", hint: "默认关：本地检索与外部 AI 结果【并存】（卡面、效果、卡图都会给 AI）。勾上则把整句直接交给外部 AI、不再注入本地卡面数据（只保留卡图链接）。" },
    { group: "外部接口", type: "text", key: "apiUrl", label: "接口地址", hint: "例：https://api.deepseek.com（填到 /v1 也行；会自动补 /chat/completions）。跟随主连接时这里只作备用。" },
    { group: "外部接口", type: "password", key: "apiKey", label: "API 密钥", hint: "sk-…（留空＝不鉴权）。跟随主连接时用主连接里的密钥。" },
    { group: "外部接口", type: "select", key: "apiModel", label: "模型", hint: "先点右边的「连接 / 拉取模型」，拉不到就选「手动填写」自己写。", optionsProvider: function () { const list = (typeof getApiModels === "function" ? getApiModels() : []) || []; const out = [["", "（默认 gpt-3.5-turbo）"]]; for (const mm of list) out.push([mm, mm]); out.push(["__manual__", "手动填写…"]); return out; } },
    { group: "外部接口", type: "text", key: "apiModelManual", label: "模型（手动填写的名字）", hint: "上面选「手动填写…」时用这一项。" },
    { group: "外部接口", type: "button", key: "apiPullModels", label: "连接 / 拉取模型", action: "apiPullModels" },
    { group: "外部接口", type: "button", key: "apiTest", label: "发送测试", action: "apiTest" },
    { group: "外部接口", type: "check", key: "apiNonBlocking", label: "外部 AI 不阻塞生成（结果下一轮生效，推荐：发送后立刻出字）" },
    { group: "外部接口 · 高级", type: "select", key: "apiProfile", label: "副 API 用哪条连接", hint: "来自酒馆「连接管理器」里保存的连接；选「自动」＝用第一条。", optionsProvider: function () { const list = (typeof listExternalProfiles === "function") ? listExternalProfiles() : []; const out = [["", "自动（第一条连接）"]]; for (const p of list) out.push([p.id, p.name + "（" + (p.model || p.api || "?") + "）"]); return out; } },
    { group: "外部接口 · 高级", type: "textarea", key: "apiInstruction", label: "给副 API 的指令", hint: "副 API 收到的系统指令：告诉它要做什么（例如「只回答规则问题，200 字内，不要编造」）。" },
    { group: "外部接口 · 高级", type: "number", key: "apiBudget", label: "外部处理预算（毫秒）", hint: "超过这个时间就不等它了，直接用本地数据继续（保证回复不被拖慢）。", min: 1000, max: 60000, step: 500 },
    { group: "外部接口 · 高级", type: "number", key: "apiMaxTokens", label: "副 API 最大输出（tokens）", min: 64, max: 65535, step: 64 },
    { group: "外部接口 · 高级", type: "check", key: "apiViaServer", label: "拉模型/测试时先走服务端路由", hint: "关掉就只用客户端直连（TauriTavern 建议关掉：服务器上通常没有 /api/backends 接口）。" },
    { group: "外部接口 · 高级", type: "check", key: "apiWebhookReplace", label: "回写时丢弃插件原始数据（只给 AI 对方的结果）", hint: "v1 同款：勾上后注入里只保留外部 AI 的结果，不再附带本地卡面数据（外部调用失败时仍然保留本地数据，不会让 AI 空手）。" },
    { group: "玩法", type: "check", key: "summonAutoApply", label: "召唤检查通过时自动上盘", hint: "勾上后：检查合法就自动执行（祭品/素材送墓、怪兽上场、用掉本回合通招），并把结果写进盘面。关掉则只判定不动盘面。" },
    { group: "玩法", type: "check", key: "shopIncludeDiy", label: "DIY 卡也进商店 / 卡库抽卡", hint: "勾上（默认）：每日商店与随机抽卡会把你的 DIY 卡混进池子；关掉只用真实卡库。" },
    { group: "查询内容", type: "number", key: "maxResults", label: "搜索结果上限", hint: "模糊搜索最多返回几条（1-50，默认 5）。", min: 1, max: 50 },
    { group: "玩法", type: "select", key: "packRegion", label: "开卡包地区", hint: "按哪个地区的卡池开包（sc＝官方简中 / jp＝OCG 日文 / en＝TCG 英文）。", options: [["sc", "官方简中（sc）"], ["jp", "OCG 日文（jp）"], ["en", "TCG 英文（en）"]] },
    { group: "玩法", type: "number", key: "packSize", label: "每包抽几张", hint: "开卡包/随机抽卡每次抽几张（1-20，默认 5）。", min: 1, max: 20 },
    { group: "玩法", type: "number", key: "shopSize", label: "每日商店件数", hint: "每天上架几件（1-20，默认 5）。", min: 1, max: 20 },
    { group: "玩法", type: "number", key: "handDraw", label: "起手模拟张数", hint: "起手模拟默认抽几张（1-20，默认 5）。", min: 1, max: 20 },
    { group: "玩法", type: "number", key: "packMinSize", label: "卡池下限（几张以下不当作卡包）", hint: "卡池太小的包会被跳过（1-300，默认 20）。", min: 1, max: 300 },
    { group: "玩法", type: "number", key: "handRuns", label: "起手模拟次数", hint: "起手模拟默认跑几次（1-200，默认 1）。", min: 1, max: 200 },
    { group: "玩法", type: "button", key: "deckValidate", label: "校验聊天里的卡组", action: "deckValidate" },
    { group: "玩法", type: "button", key: "deckHand", label: "起手模拟（聊天里的卡组）", action: "deckHand" },
    { group: "玩法", type: "button", key: "deckImage", label: "卡组展示图（聊天里的卡组）", action: "deckImage" },
    { group: "玩法", type: "check", key: "poolSynchro", label: "抽卡卡池：包含同调", hint: "关掉后随机抽卡不会抽到同调怪兽。" },
    { group: "玩法", type: "check", key: "poolXyz", label: "抽卡卡池：包含超量", hint: "关掉后不会抽到超量怪兽。" },
    { group: "玩法", type: "check", key: "poolPendulum", label: "抽卡卡池：包含灵摆", hint: "关掉后不会抽到灵摆怪兽。" },
    { group: "玩法", type: "check", key: "poolLink", label: "抽卡卡池：包含连接", hint: "关掉后不会抽到连接怪兽。" },
    { group: "玩法", type: "button", key: "diyNew", label: "＋ 新建 DIY 卡（图形编辑器）", action: "diyNew" },
    { group: "玩法", type: "button", key: "diyList", label: "我的 DIY 卡（图形列表）", action: "diyList" },
    { group: "玩法", type: "select", key: "diyFrameMode", label: "DIY 卡面渲染方式", hint: "css＝自绘卡面（默认，永远可用）；real＝真实卡框 PNG（素材已内置；某张加载失败会自动回退 css）。", options: [["css", "自绘卡面（css）"], ["real", "真实卡框 PNG（real）"]] },
    { group: "玩法", type: "button", key: "diyCheckAssets", label: "检查卡框素材", action: "diyCheckAssets" },
    { group: "联动", type: "check", key: "vrmReaction", label: "抽到稀有卡时让 VRM 角色做表情（需装 VRM 扩展）" },
    { group: "联动", type: "check", key: "webSearchFallback", label: "本地查不到时用网络搜索（需装 Web Search 扩展）" },
    { group: "日志", type: "check", key: "logVerbose", label: "详细日志" },
    { group: "日志", type: "button", key: "logView", label: "查看日志", action: "logView" },
    { group: "查看", type: "button", key: "viewCard", label: "查卡（图形视图，弹出输入框用命令更快）", action: "viewCard" },
    { group: "查看", type: "button", key: "viewCollection", label: "📖 收藏册", action: "viewCollection" },
    { group: "查看", type: "button", key: "viewShop", label: "🏪 每日商店", action: "viewShop" },
    { group: "查看", type: "button", key: "viewBoard", label: "⚔️ 决斗盘", action: "viewBoard" },
    { group: "查看", type: "button", key: "viewRecap", label: "📜 本局卡表", action: "viewRecap" },
    { group: "维护", type: "button", key: "clearCache", label: "清空缓存（含持久缓存）", action: "clearCache" },
    { group: "维护", type: "button", key: "cacheInfo", label: "查看缓存状态", action: "cacheInfo" },
    { group: "日志", type: "check", key: "logEnabled", label: "启用日志" },
    { group: "日志", type: "check", key: "logToast", label: "注入时弹提示", hint: "每次自动注入都会弹一个小提示，便于确认是否生效。" },
    { group: "日志", type: "check", key: "stripCitations", label: "自动去掉回复里的 [^1] 类引用标记", hint: "模型看到资料常自己加脚注，这里可以自动清理。" },
    { group: "日志", type: "check", key: "resultPopup", label: "结果用弹窗面板显示" },
    { group: "日志", type: "check", key: "resultInject", label: "结果同时注入提示词" },
    { group: "栏目隔离", type: "check", key: "isolateCommand", label: "仅指令触发（总隔离）", hint: "勾上后只有 /ygo… 指令生效：自动检测卡名、自然语言触发词（开一包 / 购买 / 决斗盘…）全部不做。指令与酒馆助手的指令按钮不受影响。" },
    { group: "栏目隔离", type: "note", key: "isolateNote", label: "下面每一项可以单独停用一个栏目的自动行为（指令仍然可用）：" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:自动检测注入", label: "停用「自动检测注入」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:提示词", label: "停用「提示词」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:查询内容", label: "停用「查询内容」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:外部接口", label: "停用「外部接口」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:玩法", label: "停用「玩法」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:联动", label: "停用「联动」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:日志", label: "停用「日志」栏目" },
    { group: "栏目隔离", type: "check", key: "groupsDisabled:查看", label: "停用「查看」栏目" },

];

const ISOLATION_GROUPS = ["自动检测注入", "提示词", "查询内容", "外部接口", "玩法", "联动", "日志", "查看"];
const GROUP_KEY_PREFIX = "groupsDisabled:";

function fieldId(key) { return "ygo2_" + key; }

/** 连接列表提供者（由入口注入，避免界面层直接依赖外部接口模块） */
let listExternalProfiles = null;
let getApiModels = null;
/** 识别严格程度：strict 最严格（只认完整卡名）/ normal 适中 / loose 宽松。面板、脚本、对外接口共用。 */
function applyStrictness(level) {
    const map = { strict: "最严格：只认完整卡名（名字有没有空格都认）", normal: "适中：允许够具体的名字片段", loose: "宽松：尽量多命中（可能误报）" };
    const key = String(level || "").trim().toLowerCase();
    const value = (key === "strict" || key === "最严格" || key === "3") ? "strict" : (key === "loose" || key === "宽松" || key === "1") ? "loose" : "normal";
    settings.set("detectStrictness", value);
    const text = "识别严格程度 = " + value + "（" + map[value] + "）";
    try { log("面板", text); } catch (error) { /* 忽略 */ }
    return text;
}

function registerStrictnessAction() {
    registry.provide("runAction:strictness", async function (args) { return applyStrictness((args && (args.level || args.value)) || "normal"); });
    registry.provide("strictness:get", async function () { return String(settings.get("detectStrictness") || "normal"); });
    log("面板", "识别严格程度动作已注册（runAction:strictness）");
}
function configure(options) {
    if (options && typeof options.listExternalProfiles === "function") listExternalProfiles = options.listExternalProfiles;
    if (options && typeof options.getApiModels === "function") getApiModels = options.getApiModels;
}

/** 控件值读取（处理 groupsDisabled:<栏目> 这类合成键） */
function readFieldValue(key, values) {
    const v = values || {};
    if (String(key).indexOf(GROUP_KEY_PREFIX) === 0) {
        const name = String(key).slice(GROUP_KEY_PREFIX.length);
        return Array.isArray(v.groupsDisabled) && v.groupsDisabled.indexOf(name) >= 0;
    }
    return v[key];
}

/** 控件值写入（合成键写回数组） */
function writeFieldValue(key, value) {
    if (String(key).indexOf(GROUP_KEY_PREFIX) === 0) {
        const name = String(key).slice(GROUP_KEY_PREFIX.length);
        const cur = settings.get("groupsDisabled");
        const list = Array.isArray(cur) ? cur.slice() : [];
        const has = list.indexOf(name) >= 0;
        if (value && !has) list.push(name);
        if (!value && has) list.splice(list.indexOf(name), 1);
        settings.set("groupsDisabled", list);
        return list;
    }
    settings.set(key, value);
    return value;
}

/** DOM 守卫：无 document 的环境（Node 自检、无头客户端）不应抛错 */
function doc() { return typeof document !== "undefined" ? document : null; }

/**
 * 等待宿主元素出现。
 * 为什么需要：扩展模块可能在设置抽屉建好之前就被求值（v1 用 jQuery(ready) 规避，
 * 实测 v1 能正常显示、v2 首版界面空白就是这个原因）。
 * 这里用「DOM ready + 轮询」两步，且可注入以便测试。
 */
async function waitForHost(options) {
    const o = options || {};
    const tries = Number(o.tries) || 40;
    const delay = Number(o.delay) || 250;
    const getHost = o.getHost || function () { const d = doc(); return d ? (d.getElementById("extensions_settings2") || d.getElementById("extensions_settings")) : null; };
    const sleep = o.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    // ① 先等 DOM ready（readyState=loading 时等 DOMContentLoaded）
    const d = doc();
    if (d && d.readyState === "loading" && typeof d.addEventListener === "function") {
        await new Promise(function (resolve) {
            const done = function () { resolve(); };
            d.addEventListener("DOMContentLoaded", done, { once: true });
            setTimeout(done, 3000);   // 兜底：3 秒后无论如何继续
        });
    }
    // ② 再轮询宿主元素
    for (let i = 0; i < tries; i++) {
        const host = getHost();
        if (host) return host;
        await sleep(delay);
    }
    return null;
}
function groupNames() {
    const out = [];
    for (const f of FIELDS) if (out.indexOf(f.group) < 0) out.push(f.group);
    return out;
}

/** 纯函数：单个控件 → HTML。可在 Node 里单测，不需要 DOM。 */
/** 纯函数：取一个 select 的选项（静态 options 优先，其次 optionsProvider 实时取） */
function optionListOf(f) {
    if (!f) return [];
    if (f.options && f.options.length) return f.options;
    if (typeof f.optionsProvider === "function") { try { return f.optionsProvider() || []; } catch (error) { return []; } }
    return [];
}

/** 重建某个下拉的选项（值保持当前选中；"拉取模型"之后必须调它，否则 DOM 还是旧的） */
function refreshSelect(f) {
    const d = doc();
    if (!d || !f || f.type !== "select") return false;
    const el = d.getElementById(fieldId(f.key));
    if (!el) return false;
    const list = optionListOf(f);
    if (!list.length) return false;
    const keep = el.value !== undefined && el.value !== null && el.value !== "" ? String(el.value) : String(settings.get(f.key) === undefined ? "" : settings.get(f.key));
    el.innerHTML = list.map(function (pair) {
        const value = String(pair[0]);
        const label = String(pair[1]);
        return '<option value="' + value + '"' + (value === keep ? " selected" : "") + '>' + label + "</option>";
    }).join("");
    if (keep) { try { el.value = keep; } catch (error) { /* 忽略 */ } }
    return true;
}

/** 重建所有"动态选项"的下拉（拉取模型 / 连接列表变化后调用） */
function refreshDynamicSelects() {
    let n = 0;
    for (const f of FIELDS) {
        if (f.type !== "select" || typeof f.optionsProvider !== "function") continue;
        if (refreshSelect(f)) n++;
    }
    return n;
}

function renderControl(f, value) {
    const id = fieldId(f.key);
    const q = String.raw`"`;
    const attr = function (name, val) { return " " + name + "=" + q + String(val) + q; };
    const hint = f.hint ? '<div class="ygo2-hint">' + f.hint + '</div>' : "";
    const wrap = function (inner) { return '<div class="ygo2-field" data-key="' + f.key + '">' + inner + hint + '</div>'; };
    // 复选框：用酒馆自己的 checkbox_label 结构，天然跟随主题
    if (f.type === "check") {
        return wrap('<label class="checkbox_label ygo2-check" for="' + id + '">' +
            '<input type="checkbox"' + attr("id", id) + (value ? " checked" : "") + '>' +
            '<span>' + f.label + '</span></label>');
    }
    const label = '<label class="ygo2-label" for="' + id + '">' + f.label + '</label>';
    if (f.type === "select") {
        const optList = optionListOf(f);
        const opts = (optList || []).map(function (pair) {
            return '<option value=' + q + pair[0] + q + (String(value) === pair[0] ? " selected" : "") + '>' + pair[1] + '</option>';
        }).join("");
        return wrap(label + '<select class=' + q + 'text_pole ygo2-select' + q + attr("id", id) + '>' + opts + '</select>');
    }
    if (f.type === "number") {
        let attrs = "";
        if (f.min !== undefined) attrs += attr("min", f.min);
        if (f.max !== undefined) attrs += attr("max", f.max);
        if (f.step !== undefined) attrs += attr("step", f.step);
        return wrap(label + '<input type=' + q + 'number' + q + ' class=' + q + 'text_pole ygo2-input' + q + attr("id", id) + attr("value", value === undefined ? "" : value) + attrs + '>');
    }
    if (f.type === "textarea") {
        return wrap(label + '<textarea class=' + q + 'text_pole ygo2-textarea' + q + attr("id", id) + attr("rows", 3) + '>' + String(value === undefined ? "" : value) + '</textarea>');
    }
    if (f.type === "password") {
        return wrap(label + '<input type=' + q + 'password' + q + ' class=' + q + 'text_pole ygo2-input' + q + attr("id", id) + attr("value", value === undefined ? "" : value) + ' autocomplete=' + q + 'off' + q + '>');
    }
    if (f.type === "text") {
        return wrap(label + '<input type=' + q + 'text' + q + ' class=' + q + 'text_pole ygo2-input' + q + attr("id", id) + attr("value", value === undefined ? "" : value) + ' autocomplete=' + q + 'off' + q + '>');
    }
    if (f.type === "note") {
        return '<div class="ygo2-note">' + f.label + '</div>';
    }
    if (f.type === "button") {
        return wrap('<div class=' + q + 'menu_button ygo2-button' + q + attr("id", id) + attr("data-action", f.action || f.key) + '>' + f.label + '</div>');
    }
    return wrap('<!-- 未知控件类型：' + f.type + ' -->');
}

/** 纯函数：按注册表渲染全部分组（每组一个 details）。 */
function renderGroups(values) {
    const v = values || {};
    const folds = v.uiFolds || {};
    const q = String.raw`"`;
    return groupNames().map(function (group) {
        const open = folds[group] !== false ? " open" : "";
        const body = FIELDS.filter(function (f) { return f.group === group; }).map(function (f) { return renderControl(f, readFieldValue(f.key, v)); }).join("\n");
        return "<details class=" + q + "ygo2-fold" + q + open + "><summary>" + group + "</summary><div class=" + q + "ygo2-fold-body" + q + ">" + body + "</div></details>";
    }).join("\n");
}

/** 纯函数：注册表自检（Node 里可跑：key 拼错、类型非法、id 前缀、缺 options）。 */
function registryProblems() {
    const problems = [];
    const valid = ["check", "select", "number", "text", "password", "textarea", "button", "note"];
    for (const f of FIELDS) {
        if (valid.indexOf(f.type) < 0) problems.push(f.key + " 类型非法：" + f.type);
        if (!f.key && f.type !== "note") problems.push("缺少 key（group=" + f.group + "）");
        if (!f.label) problems.push((f.key || f.type) + " 缺少 label");
        if (f.type !== "button" && f.type !== "note" && f.key && String(f.key).indexOf(GROUP_KEY_PREFIX) !== 0 && !(f.key in DEFAULTS)) problems.push(f.key + " 不在 DEFAULTS 里");   // groupsDisabled:<栏目> 是合成键，写回数组，不在 DEFAULTS
        if (f.key && fieldId(f.key).indexOf("ygo2_") !== 0) problems.push(f.key + " id 前缀不对");
        if (f.type === "select" && !(f.options || []).length && typeof f.optionsProvider !== "function") problems.push(f.key + " 缺少 options");
    }
    return problems;
}

/** 取不到 settings.html 时用的内联外壳（保证面板一定能挂上） */
const INLINE_SHELL = [
    '<div id="ygo2_settings" class="ygo2-panel">',
    '  <div class="inline-drawer">',
    '    <div class="inline-drawer-toggle inline-drawer-header">',
    '      <b>游戏王查卡器 v2</b>',
    '      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>',
    '    </div>',
    '    <div class="inline-drawer-content"></div>',
    '  </div>',
    '</div>',
].join("\n");

async function loadPanelHtml() {
    try {
        const response = await fetch(ownBase() + "settings.html");
        if (response && response.ok) {
            const text = await response.text();
            // 防御：拿到的必须是 HTML 而不是别的（曾经出现过把非 HTML 当 HTML 用的坑）
            if (text && text.indexOf("ygo2_settings") >= 0) return text;
            log("面板", "settings.html 内容异常，改用内联外壳");
        } else {
            log("面板", "settings.html 读取失败 HTTP " + (response ? response.status : "?") + "，改用内联外壳");
        }
    } catch (error) {
        log("面板", "settings.html 读取异常（" + (error && error.message ? error.message : error) + "），改用内联外壳");
    }
    return INLINE_SHELL;
}

function bindControl(f) {
    const d = doc();
    if (!d) return false;
    const el = d.getElementById(fieldId(f.key));
    if (!el) return false;
    // 动态下拉：展开/聚焦前先按最新数据重建选项（拉取模型后立刻能看到）
    if (f.type === "select" && typeof f.optionsProvider === "function") {
        el.addEventListener("mousedown", function () { refreshSelect(f); });
        el.addEventListener("focus", function () { refreshSelect(f); });
    }
    el.addEventListener("change", function () {
        let value;
        if (f.type === "check") value = !!el.checked;
        else if (f.type === "number") value = Math.max(f.min === undefined ? 0 : f.min, Number(el.value) || 0);
        else value = String(el.value);
        writeFieldValue(f.key, value);
    });
    return true;
}

/** 按钮结果的统一出口：无论走哪条路，用户都一定能看到东西（这是"按了没反应"的根因） */
async function showActionFeedback(field, out) {
    const text = typeof out === "string" ? out : (out && typeof out.text === "string" ? out.text : "");
    const key = (field && (field.label || field.key)) || "按钮";
    if (!text) { log("面板", key + "：执行完毕（无输出）"); toast("「" + key + "」执行完毕（无输出）"); return ""; }
    log("面板", key + " → " + text.slice(0, 200));
    try {
        const c = (typeof SillyTavern !== "undefined" && SillyTavern.getContext) ? SillyTavern.getContext() : null;
        if (settings.get("resultPopup") !== false && c && typeof c.callGenericPopup === "function") {
            const types = c.POPUP_TYPE || {};
            await c.callGenericPopup(buildFeedbackHtml(key, text), types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "关闭" });
            return text;
        }
    } catch (error) { log("面板", key + " 弹窗失败，改用提示：" + (error && error.message ? error.message : error)); }
    toast(text.length > 220 ? text.slice(0, 220) + "…（完整内容见「日志」）" : text);
    return text;
}

/** 纯函数：按钮结果的弹窗 HTML（自己转义） */
function buildFeedbackHtml(title, text) {
    const esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
    return '<div class="ygo2-view"><div class="ygo2-view-head">' + esc(title) + '</div><pre class="ygo2-feedback">' + esc(text) + '</pre></div>';
}

function toast(msg) {
    try {
        const c = (typeof SillyTavern !== "undefined" && SillyTavern.getContext) ? SillyTavern.getContext() : null;
        const t = (c && c.toastr) || (typeof toastr !== "undefined" ? toastr : null);
        if (t && typeof t.info === "function") t.info(String(msg), "查卡器 v2", { timeOut: 5000 });
    } catch (error) { /* 没有提示组件也没关系，日志里一定有 */ }
}

function bindActions(actions) {
    let bound = 0;
    const d = doc();
    if (!d) return 0;
    for (const f of FIELDS) {
        if (f.type !== "button") continue;
        const el = d.getElementById(fieldId(f.key));
        const fn = actions ? actions[f.action || f.key] : null;
        if (!el || typeof fn !== "function") continue;
        el.addEventListener("click", async function () {
            const label = el.textContent;
            el.textContent = "处理中…";
            el.style.opacity = "0.7";
            try { await showActionFeedback(f, await fn()); }
            catch (error) { await showActionFeedback(f, "❌ 执行失败：" + (error && error.message ? error.message : error)); }
            finally { el.textContent = label; el.style.opacity = ""; }
        });
        bound++;
    }
    return bound;
}

async function mountPanel(actions) {
    const d = doc();
    if (!d) { log("面板", "当前环境没有 DOM，跳过挂载（不影响命令与工具）"); return false; }
    if (d.getElementById("ygo2_settings")) { log("面板", "面板已存在，跳过重复挂载"); return true; }
    const host = await waitForHost({});
    if (!host) { log("面板", "等了 10 秒仍未找到设置抽屉宿主（extensions_settings2 / extensions_settings），跳过挂载"); return false; }
    if (d.getElementById("ygo2_settings")) return true;
    try {
        const shell = await loadPanelHtml();
        host.insertAdjacentHTML("beforeend", shell);
        const content = d.querySelector("#ygo2_settings .inline-drawer-content");
        if (!content) { log("面板", "settings.html 结构不对（缺 inline-drawer-content）"); return false; }
        content.innerHTML = renderGroups(settings.all());
        let bound = 0;
        for (const f of FIELDS) if (f.type !== "button" && bindControl(f)) bound++;
        const actionCount = bindActions(actions);
        log("面板", "已挂载 " + FIELDS.length + " 个控件（绑定 " + bound + "，按钮 " + actionCount + "）");
        emit("panel", { fields: FIELDS.length, bound: bound, actions: actionCount });
        return true;
    } catch (error) {
        console.error("[YGO2] 面板挂载失败", error);
        log("面板", "挂载失败：" + (error && error.message ? error.message : error));
        return false;
    }
}

const panel = { applyStrictness, registerStrictnessAction, configure, optionListOf, refreshSelect, refreshDynamicSelects, showActionFeedback, buildFeedbackHtml, FIELDS, waitForHost, INLINE_SHELL, groupNames, fieldId, renderControl, renderGroups, registryProblems, mountPanel, bindControl, bindActions };

return { FIELDS, ISOLATION_GROUPS, GROUP_KEY_PREFIX, fieldId, applyStrictness, registerStrictnessAction, configure, readFieldValue, writeFieldValue, waitForHost, groupNames, optionListOf, refreshSelect, refreshDynamicSelects, renderControl, renderGroups, registryProblems, INLINE_SHELL, bindControl, showActionFeedback, buildFeedbackHtml, bindActions, mountPanel, panel };
});

__def("src/ui/prompt.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");
const { settings } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");
const { SHEET, JUDGE, EXTERNAL_INSTRUCTION } = __req("src/inject/build.js");
const { escapeHtml } = __req("src/ui/result.js");

/** ── 统一模板（界面模块）：常量 → 纯函数 → 挂载 → register → exports ── */

/** 1) 常量：可编辑的提示词项（留空 = 用内置默认，与 v1 语义一致） */
const ROOT_ID = "ygo2_prompt_editor";
const FIELDS = [
    { key: "promptSheet", id: "ygo2_pe_sheet", label: "模块速查表（告诉 AI 有哪些能力、什么时候用）", rows: 10, fallback: SHEET },
    { key: "promptJudge", id: "ygo2_pe_judge", label: "卡名判断提示（把「是否采用」的决定权交给 AI）", rows: 4, fallback: JUDGE },
    { key: "injectNote", id: "ygo2_pe_note", label: "附加处理要求（每次注入都附上，留空则不加）", rows: 3, fallback: "" },
    { key: "apiInstruction", id: "ygo2_pe_ext", label: "发给外部 AI 的说明（仅在启用外部接口时用）", rows: 5, fallback: EXTERNAL_INSTRUCTION },
];

let docRef = null;
function configure(options) {
    // 允许用 documentRef: null 显式清空（测试隔离需要；否则会把上一个测试的假文档带给别的模块）
    if (options && "documentRef" in options) docRef = options.documentRef || null;
}
function doc() { return docRef || (typeof document !== "undefined" ? document : null); }

/** 2) 纯函数 */
/** 编辑器 HTML（纯函数，可断言；内容一律转义） */
function editorHtml(values) {
    const v = values || {};
    const parts = ['<div id="' + ROOT_ID + '" class="ygo2-prompt-editor">',
        '<p class="ygo2-pe-hint">下面是插件实际会用的提示词。<b>留空即恢复内置默认</b>；改动会立即保存。</p>',
        '<div class="ygo2-pe-bar"><div class="menu_button" id="ygo2_pe_reset">全部恢复默认</div></div>'];
    for (const f of FIELDS) {
        const raw = String(v[f.key] || "").trim();
        const shown = raw || String(f.fallback || "");
        parts.push('<label class="ygo2-label" for="' + f.id + '">' + escapeHtml(f.label) + '</label>');
        parts.push('<textarea class="text_pole ygo2-textarea" id="' + f.id + '" rows="' + f.rows + '" data-key="' + f.key + '">' + escapeHtml(shown) + '</textarea>');
        parts.push('<small class="ygo2-pe-state">' + (raw ? "【自定义】清空此项即回到默认" : "【默认】") + '</small>');
    }
    parts.push('</div>');
    return parts.join("\n");
}

/** 纯函数：等元素出现（弹窗插入 DOM 是异步的；v1 用轮询解决） */
async function waitForElement(id, options) {
    const o = options || {};
    const tries = Number(o.tries) || 40;
    const delay = Number(o.delay) || 50;
    const getEl = o.getEl || function (x) { const d = doc(); return d ? d.getElementById(x) : null; };
    const sleep = o.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    for (let i = 0; i < tries; i++) {
        const el = getEl(id);
        if (el) return el;
        await sleep(delay);
    }
    return null;
}

/** 纯函数：把编辑框的值写入设置（留空则清空该键 → 回落默认） */
function applyValues(values) {
    const out = {};
    for (const f of FIELDS) {
        if (!values || !(f.key in values)) continue;
        const text = String(values[f.key] === undefined || values[f.key] === null ? "" : values[f.key]);
        settings.set(f.key, text.trim() ? text : "");
        out[f.key] = text.trim() ? "自定义" : "默认";
    }
    return out;
}

/** 3) 挂载：打开编辑器（弹窗期间轮询绑定，不等关闭） */
async function openPromptEditor() {
    const c = ctx();
    if (!c || typeof c.callGenericPopup !== "function") { log("提示词", "当前环境不支持弹窗"); return false; }
    const html = editorHtml(settings.all());
    const types = c.POPUP_TYPE || {};
    const promise = c.callGenericPopup(html, types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "保存并关闭" });
    const root = await waitForElement(ROOT_ID);
    if (!root) { log("提示词", "编辑器没有显示（弹窗被拦截或结构变化）"); return false; }
    let bound = 0;
    for (const f of FIELDS) {
        const el = root.querySelector ? root.querySelector("#" + f.id) : null;
        if (!el) continue;
        el.addEventListener("change", function () {
            const r = applyValues({ [f.key]: el.value });
            log("提示词", f.key + " → " + r[f.key]);
        });
        bound++;
    }
    const reset = root.querySelector ? root.querySelector("#ygo2_pe_reset") : null;
    if (reset) {
        reset.addEventListener("click", function () {
            applyValues({ promptSheet: "", promptJudge: "", injectNote: "", apiInstruction: "" });
            for (const f of FIELDS) {
                const el = root.querySelector ? root.querySelector("#" + f.id) : null;
                if (el) el.value = String(f.fallback || "");
            }
            log("提示词", "已全部恢复默认");
        });
    }
    log("提示词", "编辑器已打开（绑定 " + bound + "/" + FIELDS.length + " 项）");
    try { await promise; } catch (error) { /* 关闭方式不影响已保存的改动 */ }
    return bound > 0;
}

/** 4) 注册能力 */
function registerPromptEditor() {
    registry.provide("ui:prompt", async function () { return await openPromptEditor(); });
    log("界面", "提示词编辑器已注册（ui:prompt）");
}

const promptEditor = { ROOT_ID, FIELDS, configure, editorHtml, waitForElement, applyValues, openPromptEditor, registerPromptEditor };

return { ROOT_ID, FIELDS, configure, editorHtml, waitForElement, applyValues, openPromptEditor, registerPromptEditor, promptEditor };
});

__def("src/ui/result.js", function (__req) {
const { settings } = __req("src/core/settings.js");
const { ctx, log, emit, logLines } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");

/** ── 统一模板（界面模块）：常量 → 纯函数(生成 HTML) → 挂载 → exports ── */

/** 1) 常量 */
const CLASS = { root: "ygo2-result", title: "ygo2-result-title", body: "ygo2-result-body" };

// 样式照 v1（v1 的 RESULT_STYLE / RESULT_IMG_STYLE 原样）
const RESULT_STYLE = "font-size:14px;line-height:1.55;";
const RESULT_IMG_STYLE = "max-width:130px;border-radius:6px;margin:3px 6px 3px 0;vertical-align:middle;border:1px solid rgba(128,128,128,.35);background:rgba(0,0,0,.08);";
// 正文滚动：v1 的 max-height:62vh + overflow:auto（配合 callGenericPopup 的 allowVerticalScrolling）
const RESULT_BODY_STYLE = "max-height:62vh;overflow:auto;padding-right:4px";

/** 2) 纯函数（可断言、无 DOM 依赖） */
/** 转义：面板里渲染的是数据，必须防注入 */
function escapeHtml(text) {
    return String(text === undefined || text === null ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** 把 markdown图片/表格先转成安全 HTML？—— 不转，保持纯文本 + 换行，避免渲染差异。 */
function buildResultHtml(title, text) {
    // 照 v1 的 resultPanelHtml：先整体转义，再把 ![](url) 换成真图片，最后换行
    const safe = escapeHtml(text);
    const body = safe
        .replace(/!\[\]\(([^)\s]+)\)/g, function (m, u) { return /^https?:\/\//i.test(String(u)) ? "<img src=\"" + u + "\" style=\"" + RESULT_IMG_STYLE + "\">" : m; })
        .split("\n").join("<br>");
    return "<div class=\"" + CLASS.root + "\" style=\"" + RESULT_STYLE + "\">"
        + "<div class=\"" + CLASS.title + "\" style=\"font-weight:600;font-size:16px;margin:0 0 8px 0;padding-bottom:6px;border-bottom:1px solid rgba(128,128,128,.35)\">" + escapeHtml(title) + "</div>"
        + "<div class=\"" + CLASS.body + "\" style=\"" + RESULT_BODY_STYLE + "\">" + body + "</div>"
        + "</div>";
}

/** 3) 挂载：优先弹窗（酒馆 callGenericPopup），失败则退回控制台日志 */
let lastResult = "";
function lastResultText() { return lastResult; }
async function openResult(title, text, options) {
    const o = options || {};
    lastResult = String(title || "") + "\n" + String(text || "");
    const html = buildResultHtml(title, text);
    const c = ctx();
    const allowPopup = settings.get("resultPopup") !== false;
    try {
        if (allowPopup && c && typeof c.callGenericPopup === "function") {
            const types = c.POPUP_TYPE || {};
            await c.callGenericPopup(html, types.TEXT === undefined ? 1 : types.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "关闭" });
            log("面板", "已弹出：" + title);
            emit("result", { title: title, chars: String(text || "").length, shown: true });
            return true;
        }
    } catch (error) { console.warn("[YGO2] 弹窗失败", error); }
    log("面板", "无法弹窗，改为日志输出：" + title + "（" + String(text || "").length + " 字）");
    emit("result", { title: title, chars: String(text || "").length, shown: false });
    if (o.logToConsole !== false) console.log("[YGO2] " + title + "\n" + String(text || ""));
    return false;
}

/** 3b) 挂到 registry：数据层只管产出文本，界面层负责展示 */
function registerResult() {
    registry.provide("ui:result", async function (args) { return await openResult(args.title || "查卡器", args.text || "", {}); });
    registry.provide("runAction:log", async function (args) { const n = Math.max(1, Math.min(200, Number((args && args.lines) || 30))); return logLines().slice(-n).join(String.fromCharCode(10)) || "（暂无日志）"; });
    registry.provide("lastResultText", async function () { return lastResult; });
    log("面板", "结果展示能力已注册（ui:result）");
}

const result = { CLASS, RESULT_STYLE, RESULT_IMG_STYLE, RESULT_BODY_STYLE, escapeHtml, buildResultHtml, openResult, registerResult };

return { CLASS, RESULT_STYLE, RESULT_IMG_STYLE, RESULT_BODY_STYLE, escapeHtml, buildResultHtml, lastResultText, openResult, registerResult, result };
});

__def("src/ui/sendbox.js", function (__req) {
const { ctx, log } = __req("src/core/bus.js");
const { registry } = __req("src/core/registry.js");

/** ── 统一模板（界面模块）：常量 → 纯函数 → 写入 → register → exports ── */

/** 1) 常量 */
const SEND_BOX_ID = "send_textarea";
const DEFAULT_SEPARATOR = "\n";

/** 2) 纯函数：把新文本合进发送栏现有内容（可断言） */
function composeSendText(prev, text, options) {
    const o = options || {};
    const before = String(prev === undefined || prev === null ? "" : prev);
    const add = String(text === undefined || text === null ? "" : text);
    if (!add) return before;
    if (o.append === false) return add;                       // 替换模式
    if (!before.trim()) return add;                            // 空栏直接写
    const sep = o.separator === undefined ? DEFAULT_SEPARATOR : String(o.separator);
    return before.replace(/[ \t\n]+$/, "") + sep + add;
}

/** 3) 写入：设置值 + 派发 input 事件（酒馆据此更新内部状态）+ 聚焦 */
function sendBoxElement() {
    const c = ctx();
    const d = (typeof document !== "undefined") ? document : null;
    if (!d) return null;
    return d.getElementById(SEND_BOX_ID)
        || (typeof d.querySelector === "function" ? d.querySelector("#" + SEND_BOX_ID) : null);
}

function writeToSendBox(text, options) {
    const el = sendBoxElement();
    if (!el) { log("发送栏", "找不到发送栏（#" + SEND_BOX_ID + "），已跳过写入"); return { ok: false, reason: "no-send-box" }; }
    const next = composeSendText(el.value, text, options);
    el.value = next;
    // 关键：必须派发 input，否则酒馆内部状态与发送按钮不会更新
    try {
        const d = (typeof document !== "undefined") ? document : null;
        if (d && typeof d.createEvent === "function") {
            const ev = d.createEvent("Event");
            ev.initEvent("input", true, true);
            el.dispatchEvent(ev);
        } else if (typeof Event === "function") {
            el.dispatchEvent(new Event("input", { bubbles: true }));
        }
    } catch (error) { log("发送栏", "派发 input 事件失败：" + (error && error.message ? error.message : error)); }
    try { if (typeof el.focus === "function") el.focus(); } catch (error) { /* 忽略 */ }
    log("发送栏", "已写入 " + String(text || "").length + " 字（当前共 " + next.length + " 字）");
    return { ok: true, value: next };
}

/** 供外部按名字发起的便捷写入（例如「购买 青眼白龙」） */
function writeBuyRequest(name) { return writeToSendBox("购买 " + String(name || "").trim()); }

/** 4) 注册能力（数据层不 import 界面层，统一走 registry） */
function registerSendBox() {
    registry.provide("ui:sendbox", async function (args) { return writeToSendBox((args && args.text) || "", args || {}); });
    registry.provide("ui:buy", async function (args) { return writeBuyRequest(args && args.name); });
    log("界面", "发送栏写入能力已注册（ui:sendbox / ui:buy）");
}

const sendbox = { SEND_BOX_ID, DEFAULT_SEPARATOR, composeSendText, sendBoxElement, writeToSendBox, writeBuyRequest, registerSendBox };

return { SEND_BOX_ID, DEFAULT_SEPARATOR, composeSendText, sendBoxElement, writeToSendBox, writeBuyRequest, registerSendBox, sendbox };
});

__def("index.js", function (__req) {
/**
 * 查卡器 v2 入口：只负责装配，不写业务逻辑。
 * 统一模板：
 *   1) 模块分五层：core（总线/设置/取数/注册表/事件）、data（数据与业务）、inject（识别与注入）、ui（界面）、api（工具/命令/联动/自检）
 *   2) 层间只通过 registry（能力注册表）与 settings 通信，模块之间不直接 import 业务实现
 *   3) 所有 DOM id 以 ygo2_ 开头，所有 CSS 类以 ygo2- 开头；面板 HTML 放 settings.html
 *   4) 数据文件复用旧扩展目录（只读），自带素材（如 data/art-index.json）放本目录
 */
const { ctx, log, logLines, setLogEnabled, setLogVerbose, on } = __req("src/core/bus.js");
const { settings } = __req("src/core/settings.js");
const { registry } = __req("src/core/registry.js");
const { mountEvents } = __req("src/core/events.js");

const { registerIndexes } = __req("src/data/indexes.js");
const { registerCards, registerCardResolver } = __req("src/data/cards.js");
const { registerRules } = __req("src/data/rules.js");
const { registerSummon } = __req("src/data/summon.js");
const { registerExternal, listProfiles: listExternalProfileList } = __req("src/api/external.js");
const { registerPublicApi, installPublicApi } = __req("src/api/public-api.js");
const { ownBase, captureSelfBase, clearAllCache } = __req("src/core/http.js");
var indexes = __req("src/data/indexes.js");
const { registerPacks } = __req("src/data/packs.js");
const { registerCollection } = __req("src/data/collection.js");
const { registerDeck } = __req("src/data/deck.js");
const { registerBoard } = __req("src/data/board.js");
const { registerArt } = __req("src/data/art.js");

const { registerWriter, clearInjection } = __req("src/inject/writer.js");
const { registerSendBox } = __req("src/ui/sendbox.js");
const { registerCleanup, cleanLastMessage } = __req("src/inject/cleanup.js");
const { registerSendBody } = __req("src/inject/sendbody.js");
const { createInterceptor, registerInterceptorHooks } = __req("src/inject/interceptor.js");

const { mountPanel, registerStrictnessAction, registryProblems } = __req("src/ui/panel.js");
const { configure: configurePanel, refreshDynamicSelects } = __req("src/ui/panel.js");
const { registerResult } = __req("src/ui/result.js");
const { registerPromptEditor } = __req("src/ui/prompt.js");
const { registerDiyUi, openDiyEditor, diyCardHtml, installFrameFallback } = __req("src/ui/diy.js");
const { registerGameUi, openCollection, openShop, openBoard, openRecap, openCard, openCardInput, installBuyDelegate } = __req("src/ui/game.js");

const { registerTools } = __req("src/api/tools.js");
const { registerCommands } = __req("src/api/commands.js");
const { registerIntegrations } = __req("src/api/integrations.js");
const { registerSelfTest } = __req("src/api/selftest.js");
const { registerDeckImage } = __req("src/api/deckimage.js");

const MODULE_VERSION = "0.2.0";

// ★ 必须在"脚本求值这一刻"记录自身目录：之后 document.currentScript 就变回 null 了。
//   这样无论仓库/文件夹叫什么名字，data/ 与 assets/ 都能定位到（GitHub 安装时目录名 = 仓库名）。
captureSelfBase();

/**
 * 磁盘探针（诊断用）：把关键阶段写进 extensionSettings 的一个独立键，
 * 这样即使界面/控制台拿不到，也能从 data/default-user/settings.json 读出到底走到哪一步。
 * 阶段含义：
 *   module-evaluated → 入口模块开始执行（说明所有静态 import 都成功了）
 *   booted           → 装配结束（extra.ok 表示是否全部成功，extra.layers 列出每层结果）
 *   boot-failed      → 装配过程抛异常（extra.error）
 * 注意：如果连 module-evaluated 都没有，说明是 import/协议层失败（模块根本没执行）。
 */
const PROBE_KEY = "ygo2-DIAG";
function probe(stage, extra) {
    try {
        const c = (globalThis.SillyTavern && typeof globalThis.SillyTavern.getContext === "function") ? globalThis.SillyTavern.getContext() : null;
        const store = c && c.extensionSettings;
        if (!store) { return false; }
        store[PROBE_KEY] = Object.assign({ stage: stage, at: new Date().toISOString(), version: MODULE_VERSION, hasModule: true }, extra || {});
        if (typeof c.saveSettingsDebounced === "function") c.saveSettingsDebounced();
        if (typeof c.saveSettings === "function") c.saveSettings();
        return true;
    } catch (error) { return false; }
}
probe("module-evaluated", { note: "入口开始执行（静态 import 全部成功）" });
const INTERCEPTOR_NAME = "YgoCardLookupV2_Intercept";

/** 面板按钮动作（panel.js 会按注册表把按钮接到这里） */
/** 聊天里卡图最大宽度：写成一条 CSS 规则（随设置变化重新注入） */
function installCardImgCss() {
    try {
        if (typeof document === "undefined") return;
        const px = Math.max(120, Math.min(900, Number(settings.get("cardImgMax")) || 360));
        let el = document.getElementById("ygo2-img-style");
        if (!el) { el = document.createElement("style"); el.id = "ygo2-img-style"; document.head.appendChild(el); }
        el.textContent = '.mes_text img.ygo2-card-img{max-width:min(100%," + px + "px);height:auto;border-radius:6px}';
    } catch (error) { /* 无 DOM 时忽略 */ }
}

/** 隔离设置生效：日志栏目停用 → 不记日志；面板改动后立即应用 */
function applyIsolation() {
    try {
        const logsOn = settings.groupEnabled ? settings.groupEnabled("日志") !== false : true;
        setLogEnabled(logsOn && settings.get("logEnabled") !== false);
        setLogVerbose(settings.get("logVerbose") !== false);
        installCardImgCss();
    } catch (error) { /* 忽略 */ }
}

const PANEL_ACTIONS = {
    deckValidate: async function () { try { const out = await registry.call("tool:deck", {}); await registry.call("ui:result", { title: "查卡器 · 卡组校验", text: String(out || "") }); return String(out || ""); } catch (error) { return "卡组校验失败：" + (error && error.message ? error.message : error); } },
    deckHand: async function () { try { const out = await registry.call("tool:hand", { draw: Number((typeof settings !== "undefined" && settings.get && settings.get("handDraw")) || 5) || 5, runs: Number((typeof settings !== "undefined" && settings.get && settings.get("handRuns")) || 1) || 1 }); await registry.call("ui:result", { title: "查卡器 · 起手模拟", text: String(out || "") }); return String(out || ""); } catch (error) { return "起手模拟失败：" + (error && error.message ? error.message : error); } },
    deckImage: async function () { try { const out = await registry.call("tool:deckimage", {}); await registry.call("ui:result", { title: "查卡器 · 卡组展示图", text: String(out || "") }); return String(out || ""); } catch (error) { return "卡组展示图失败：" + (error && error.message ? error.message : error); } },
    promptEditor: async function () { return await registry.call("ui:prompt", {}); },
    viewCard: async function () {
        // 零输入优先：聊天里最近有卡名就直接弹图形视图（比让人先打字快）
        const c = ctx();
        const chat = Array.isArray(c.chat) ? c.chat : [];
        for (let i = chat.length - 1; i >= 0 && i >= chat.length - 6; i--) {
            const msg = chat[i];
            if (!msg || !msg.mes) continue;
            if (registry.has("resolveCards")) {
                try {
                    const cards = await registry.call("resolveCards", String(msg.mes));
                    if (cards && cards.length) { await openCard({ query: cards[0].name }); return "已显示最近的卡：" + cards[0].name; }
                } catch (error) { /* 继续往前找 */ }
            }
        }
        return await openCardInput();   // 聊天里没有卡名 → 弹带输入框的查卡窗
    },
    viewCollection: async function () { return await openCollection({}); },
    viewShop: async function () { return await openShop({}); },
    viewBoard: async function () { return await openBoard(); },
    viewRecap: async function () { return await openRecap({}); },
    diyCheckAssets: async function () { return await registry.call("diyCheckAssets", {}); },
    diyNew: async function () { return await openDiyEditor(""); },
    diyList: async function () {
        const list = settings.get("diyCards") || [];
        if (!list.length) return "还没有 DIY 卡，点「＋ 新建 DIY 卡」创建第一张。";
        const html = '<div class="ygo2-diy-list">' + list.map(function (card) { return '<div class="ygo2-diy-list-item">' + diyCardHtml(card, "small") + '<div class="ygo2-diy-list-name">' + String(card.name || "") + '</div></div>'; }).join("") + '</div>';
        const c = ctx();
        if (typeof c.callGenericPopup === "function") { const t = c.POPUP_TYPE || {}; await c.callGenericPopup(html, t.TEXT === undefined ? 1 : t.TEXT, "", { wide: true, large: true, okButton: "关闭" }); return "共 " + list.length + " 张 DIY 卡（已在面板中显示）。"; }
        return "共 " + list.length + " 张 DIY 卡：" + list.map(function (x) { return x.name; }).join("、");
    },
    selftest: async function () { return await registry.call("cmd:selftest", {}); },
    clearCache: async function () {
        const ok = await clearAllCache();
        // 索引也要一起重建，否则"清完缓存还是旧的"（懒索引只在进程内缓存）
        try { if (registry.has("index:reset")) await registry.call("index:reset"); } catch (error) { /* 忽略 */ }
        return ok ? "✅ 缓存已清空（内存 + 持久；手动安装的数据库保留）" : "内存缓存已清空；当前环境没有 IndexedDB，没有持久缓存可清。";
    },
    cacheInfo: async function () {
        const caps = await registry.call("external:capability");
        const hasIdb = (function () { try { return typeof indexedDB !== "undefined" && !!indexedDB; } catch (error) { return false; } })();
        return "缓存状态：" + (hasIdb ? "浏览器支持 IndexedDB（卡库会持久缓存，重启免重下）" : "当前环境没有 IndexedDB（只用内存缓存）")
            + "；数据文件 " + JSON.stringify(indexes.FILES) + "；连接配置 " + caps.profiles + " 条。";
    },
    apiPullModels: async function () {
        const out = await registry.call("external:models", { baseUrl: settings.get("apiUrl"), apiKey: settings.get("apiKey") });
        if (String(out).indexOf("✅") === 0) {
            // 关键：把新模型灌进下拉的 DOM，否则界面还是旧选项（之前"拉取后不显示"的原因）
            let n = 0;
            try { n = refreshDynamicSelects(); } catch (error) { log("面板", "刷新下拉失败：" + (error && error.message ? error.message : error)); }
            const list = settings.get("apiModels") || [];
            if (list.length && !String(settings.get("apiModel") || "").trim()) {
                settings.set("apiModel", list[0]);
                settings.save();
                try { refreshDynamicSelects(); } catch (error) { /* 忽略 */ }
                return out + "\n（已刷新下拉 " + n + " 处，并默认选中第一个：" + list[0] + "）";
            }
            return out + "\n（已刷新下拉 " + n + " 处）";
        }
        return out;
    },
    apiTest: async function () { return await registry.call("external:test", { mode: settings.get("apiMode") }); },
    logView: async function () { return logLines().slice(-40).join("\n") || "（暂无日志）"; },
};

/** 分层装配：任一层失败都只记日志，不拖垮其他层（自检/命令仍可用） */
async function step(name, fn) {
    try {
        const value = await fn();
        log("启动", "✓ " + name);
        return { name: name, ok: true, value: value };
    } catch (error) {
        console.error("[YGO2] " + name + " 装配失败", error);
        log("启动", "✗ " + name + "：" + (error && error.message ? error.message : error));
        return { name: name, ok: false, error: error && error.message ? error.message : String(error) };
    }
}

/** 启动必需能力清单：任何一项缺失都说明某一层没接上（曾经出现"5 层全 ok 但 external 一个没注册"） */
const REQUIRED_CAPS = [
    "tool:card", "tool:pack", "tool:board", "ui:result", "ui:prompt", "writeInjection",
    "resolveCards", "runAction", "index:limits", "checkSummon", "external:ask", "external:test",
    "external:models", "ui:diy", "ui:sendbox", "ui:buy", "sendbody:on", "sendbody:handle", "boardText", "cleanupLastMessage",
    "injectFallback:run", "strictness:get", "tool:deckimage", "collection:state", "decodeSetcodes",
];

async function boot() {
    log("启动", "查卡器 v2 " + MODULE_VERSION + " 开始装配");
    // TauriTavern 文档：扩展使用宿主 ABI 前应先等它就绪。
    // 上游 SillyTavern 没有这个对象，这里会直接跳过（不影响启动）。
    try {
        const tt = globalThis.__TAURITAVERN__;
        if (tt && tt.ready && typeof tt.ready.then === "function") { await tt.ready; log("启动", "已等待 TauriTavern 宿主就绪"); }
    } catch (error) { log("启动", "等待 tt 宿主失败（继续启动）：" + (error && error.message ? error.message : error)); }
    settings.reload();
    setLogEnabled(settings.get("logEnabled") !== false);
    installCardImgCss();
    const report = [];
    const missingCaps = [];
    // ── 数据层
    report.push(await step("数据层", async function () {
        registerIndexes(); registerCards(); registerCardResolver(); registerRules(); registerSummon(); registerExternal();
        registerPublicApi();
        registerPacks(); registerCollection(); registerDeck(); registerBoard(); registerArt();
    }));
    // ── 注入层
    report.push(await step("注入层", async function () {
        registerWriter();
        registerCleanup();
        registerSendBody();
        registerInterceptorHooks();   // ★ 注册 injectFallback:run：宿主不调 generate_interceptor 时靠它兜底
        const interceptor = createInterceptor();
        interceptor.clearInjection = clearInjection;
        globalThis[INTERCEPTOR_NAME] = interceptor;
    }));
    // ── 界面层（无 DOM 时应优雅跳过，不抛错）
    report.push(await step("界面层", async function () {
        registerResult(); registerPromptEditor(); registerDiyUi(); registerGameUi(); registerSendBox();
        installBuyDelegate();   // ★ 商店「购买」按钮的点击委派（不装就点了没反应）
        try { registerStrictnessAction(); } catch (error) { log("启动", "严格程度动作注册失败：" + (error && error.message ? error.message : error)); }
        installFrameFallback();
        try { configurePanel({ listExternalProfiles: function () { return listExternalProfileList(); }, getApiModels: function () { return settings.get("apiModels") || []; } }); } catch (error) { /* 面板可选 */ }
        applyIsolation();
        on("settings", function () { applyIsolation(); });
        // 面板字段注册表自检（重复 key / 非法类型 / 缺 options 都能在这里暴露）
        try {
            const problems = registryProblems();
            if (problems.length) log("面板", "⚠️ 字段注册表有问题 " + problems.length + " 条：" + problems.slice(0, 6).join("；"));
        } catch (error) { log("面板", "字段注册表自检失败：" + (error && error.message ? error.message : error)); }
        // ★ 不再 await：宿主设置抽屉晚出现时，等待最坏要 10 秒，会把接口层/事件层一起拖住
        panelMount = mountPanel(PANEL_ACTIONS).then(function (mounted) {
            log("面板", mounted ? "挂载完成" : "暂未找到设置抽屉宿主，稍后打开设置时会自动重试");
            return mounted;
        }).catch(function (error) {
            log("面板", "挂载异常（不影响命令与工具）：" + (error && error.message ? error.message : error));
            return false;
        });
        return true;
    }));
    // ── 接口层
    report.push(await step("接口层", async function () {
        registerTools(); registerCommands(); registerIntegrations(); registerDeckImage();
        registerSelfTest({ requiredCaps: function () { return REQUIRED_CAPS.filter(function (cap) { return !registry.has(cap); }); } });
    }));
    // ── 事件层
    report.push(await step("事件层", async function () {
        return mountEvents({
            onReady: function () {
                log("启动", "APP_READY");
                // 再挂一次（幂等）：有些宿主会在页面初始化更晚的时候重建 globalThis 上的对象
                try { installPublicApi(); } catch (error) { log("启动", "对外接口补挂失败：" + (error && error.message ? error.message : error)); }
            },
            onChatChanged: function () { clearInjection(); log("启动", "切换聊天：已清空注入"); },
            // ★ 兜底通道（v1 同款）：桌面客户端既不调 generate_interceptor、也不触发 PROMPT_READY，
            //   只有 GENERATION_AFTER_COMMANDS 在"提示词组装前"触发 —— 资料在这里追加才真的进本次发送。
            onAfterCommands: async function (type) {
                try {
                    const t = String(type || "");
                    if (t === "quiet") return;
                    const c = ctx();
                    const chat = (c && Array.isArray(c.chat)) ? c.chat : null;
                    if (!chat || !chat.length) return;
                    // 1) 发送体改写（bodyEditMode=append 时把资料追加到最后一条玩家消息）
                    if (registry.has("sendbody:handle")) {
                        const n = await registry.call("sendbody:handle", { chat: chat });
                        if (n) log("发送体", "兜底通道：已把资料追加进即将发送的消息（" + n + " 处）");
                    }
                    // 2) 提示词注入兜底（拦截器没被调用时补一次）
                    if (registry.has("injectFallback:run")) {
                        const r = await registry.call("injectFallback:run");
                        if (r && r.ok) log("兜底", r.injected ? ("GENERATION_AFTER_COMMANDS 兜底注入 " + r.chars + " 字") : "兜底：本轮没有可注入的内容");
                    }
                } catch (error) { log("兜底", "兜底通道异常（不影响生成）：" + (error && error.message ? error.message : error)); }
            },
            onMessageReceived: function (id) { try { cleanLastMessage(id); } catch (error) { /* 清理失败不影响消息 */ } },
            // 兜底注入：宿主没调拦截器（例如不支持 generate_interceptor）时，玩家消息入楼后补一次
            onMessageSentFallback: async function () {
                try {
                    if (!registry.has("injectFallback:run")) return;
                    const r = await registry.call("injectFallback:run");
                    if (r && r.ok) log("兜底", r.injected ? ("MESSAGE_SENT 兜底注入 " + r.chars + " 字") : "兜底：本轮没有可注入的内容");
                    else if (r && r.reason) log("兜底", r.reason);
                } catch (error) { log("兜底", "兜底注入异常（不影响生成）：" + (error && error.message ? error.message : error)); }
            },
        });
    }));
    // ── 对外接口：必须等"同步装配"全部结束之后再挂。
    //    打包产物在入口模块返回之后才执行 globalThis.YgoCardLookupV2 = __entry，
    //    而数据层那一段是纯同步的 —— 在那里装的话会被这一行整个覆盖掉（实测踩过）。
    report.push(await step("对外接口", async function () { installPublicApi(); return true; }));
    const failed = report.filter(function (r) { return !r.ok; });
    // ★ REQUIRED_CAPS 校验（以前只声明不校验，能力缺失永远看不出来）
    for (const cap of REQUIRED_CAPS) { if (!registry.has(cap)) missingCaps.push(cap); }
    log("启动", "装配完成：能力 " + registry.list().length + " 项" + (failed.length ? "，失败层：" + failed.map(function (r) { return r.name; }).join("、") : "，全部成功"));
    if (missingCaps.length) log("启动", "⚠️ 缺少必需能力 " + missingCaps.length + " 项：" + missingCaps.join("、"));
    probe("booted", {
        ok: failed.length === 0,
        capabilities: registry.list().length,
        layers: report.map(function (r) { return r.name + ":" + (r.ok ? "ok" : "fail"); }),
        missingCaps: missingCaps,
        interceptor: typeof globalThis[INTERCEPTOR_NAME] === "function",
        domHost: (function () { try { return !!(document.getElementById("extensions_settings2") || document.getElementById("extensions_settings")); } catch (e) { return false; } })(),
        panelMounted: (function () { try { return !!document.getElementById("ygo2_settings"); } catch (e) { return false; } })(),
        base: (function () { try { return ownBase(); } catch (e) { return "?"; } })(),
    });
    return { ok: failed.length === 0 && missingCaps.length === 0, report: report, capabilities: registry.list().length, missingCaps: missingCaps, interceptor: typeof globalThis[INTERCEPTOR_NAME] === "function" };
}


/**
 * tt（TauriTavern）通过 manifest 的 hooks.activate 调用这个函数；上游 ST 不认识 hooks，走下面的自动启动。
 * 两套入口共用同一个单次启动守卫，避免重复装配（tt 若两者都触发，第二次会直接返回上次结果）。
 */
let bootPromise = null;
/** 面板挂载是异步的（不阻塞启动）；这里留个句柄供诊断/测试 await */
let panelMount = null;
function whenPanelMounted() { return panelMount || Promise.resolve(false); }
function ygo2Activate() { return ensureBoot(); }
function ensureBoot() {
    if (!bootPromise) bootPromise = boot().catch(function (error) { console.error("[YGO2] 启动失败", error); bootPromise = null; throw error; });
    return bootPromise;
}

// 浏览器里自动启动（Node 测试环境没有 SillyTavern，此时只导出 boot 供断言）
if (typeof globalThis !== "undefined" && (globalThis.SillyTavern || (ctx() && ctx().extensionSettings))) {
    ensureBoot().catch(function (error) {
        console.error("[YGO2] 启动失败", error);
        probe("boot-failed", { error: String(error && error.message ? error.message : error).slice(0, 300) });
    });
} else {
    probe("not-started", { reason: "没有检测到 SillyTavern 上下文，自动启动被跳过" });
}

return { MODULE_VERSION, PROBE_KEY, probe, INTERCEPTOR_NAME, PANEL_ACTIONS, REQUIRED_CAPS, boot, whenPanelMounted, ygo2Activate, ensureBoot };
});

try { globalThis.YgoCardLookupV2Build = {"at":"2026-10-06T15:33:58","hash":"9f6a2849","modules":35}; } catch (e) { /* 忽略 */ }
var __entry = __req("index.js");
try { globalThis.YgoCardLookupV2 = __entry; } catch (e) { /* 忽略 */ }
})();
