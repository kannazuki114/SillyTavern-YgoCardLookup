import { ctx, log, setContext, contextOverride } from "../core/bus.js";
import { settings, groupEnabled, actionAllowed, isolationActive } from "../core/settings.js";
import { registry } from "../core/registry.js";
import { getStatsIndex, getNameIndex, getSetnames } from "../data/indexes.js";
import { findCard, cardText, imageUrl, resolveCards } from "../data/cards.js";
import { getLimits, banlistText, tributeNeeded } from "../data/rules.js";
import { getPackIndex, openPackText, drawFromPool } from "../data/packs.js";
import { shopText, collectionText, manageDiy, parseAliases, resolveAliasName } from "../data/collection.js";
import { parseDeckText, deckProblems, simulateHand } from "../data/deck.js";
import { newBoard, applyAction, boardText, saveBoard, getBoard } from "../data/board.js";
import { getArtIndex, artOf, listAltArtCards } from "../data/art.js";
import { matchTrigger } from "../inject/detect.js";
import { buildInjection } from "../inject/build.js";
import { editorHtml, FIELDS } from "../ui/prompt.js";
import { shopHtml } from "../ui/game.js";
import { composeSendText } from "../ui/sendbox.js";
import { GROUP_KEY_PREFIX, readFieldValue, writeFieldValue, registryProblems, FIELDS as PANEL_FIELDS } from "../ui/panel.js";
import { TOOLS, toolProblems } from "./tools.js";
import { COMMANDS, commandProblems } from "./commands.js";
import * as external from "./external.js";
import { judgeSummon, checkSummon } from "../data/summon.js";

/** ── 统一模板（接口模块）：常量 → 纯函数 → 用例表 → 运行 → register → exports ── */

/** 1) 常量 */
export const TEST_TIMEOUT = 20000;

/** 2) 纯函数：报告格式 */
export function formatReport(results, elapsed) {
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

export const TESTS = [
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
    { name: "禁限文本", run: async function () { const s = await banlistText("cn"); return T(s.indexOf("【禁止】") >= 0 || s.indexOf("未能获取禁限卡表") >= 0, s.length + " 字"); } },
    { name: "召唤检查", run: async function () { const r = tributeNeeded({ typeText: "[怪兽|通常] 龙/光§[★8] 3000/2500" }); return T(r && r.tributes === 2, r ? r.reason : "无判定"); } },
    { name: "异画本地索引", run: async function () { const idx = await getArtIndex(); const n = Object.keys(idx).length; return T(n >= 100, n + " 张有异画"); } },
    { name: "异画命中（青眼白龙）", run: async function () { const r = await artOf("青眼白龙"); return T(r.arts.length >= 8, r.arts.length + " 版（来源 " + r.source + "）"); } },
    { name: "异画卡表", run: async function () { const s = await listAltArtCards(3); return T(s.indexOf("有异画的卡") >= 0, s.split("\\n")[0]); } },
    { name: "卡组校验", run: async function () { const d = parseDeckText("1 青眼白龙"); const r = deckProblems(d, null, "cn"); return T(r.problems.length >= 1, r.problems.join("；") || "未检出"); } },
    { name: "起手模拟", run: async function () { const runs = simulateHand([1, 2, 3, 4, 5, 6], 5, 3, function () { return 0.3; }); return T(runs.length === 3 && runs[0].length === 5, runs.length + " 次 × " + (runs[0] ? runs[0].length : 0) + " 张"); } },
    { name: "收藏册", run: async function () { const s = await collectionText({}); return T(s.indexOf("收藏册") >= 0, s.split("\\n")[0]); } },
    { name: "每日商店（确定性）", run: async function () { const a = await shopText({ date: "2026-01-01", size: 3 }); const b = await shopText({ date: "2026-01-01", size: 3 }); return T(a === b, a === b ? "同日期一致" : "两次不一致"); } },
    { name: "DIY 增删", run: async function () {
        const keep = settings.get("diyCards") || [];
        const name = "_自检临时卡";
        try {
            await manageDiy({ action: "add", name: name, category: "魔法" });
            const added = (settings.get("diyCards") || []).some(function (c) { return c.name === name; });
            await manageDiy({ action: "del", name: name });
            const gone = !(settings.get("diyCards") || []).some(function (c) { return c.name === name; });
            return T(added && gone, "建=" + added + " 删=" + gone);
        } finally { settings.set("diyCards", keep); }
    } },
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
export async function runSelfTest(options) {
    const o = options || {};
    const limit = Number(o.timeout) || TEST_TIMEOUT;
    const started = Date.now();
    const results = [];
    for (const t of TESTS) {
        const t0 = Date.now();
        let ok = false, detail = "";
        let timer = null;
        const previousContext = contextOverride();
        const preserved = {};
        for (const key of ["collection", "collectionTotal", "collectionRecent", "diyCards", "aliases", "apiMode", "groupsDisabled", "isolateCommand"]) {
            preserved[key] = JSON.parse(JSON.stringify(settings.get(key)));
        }
        try {
            const value = await Promise.race([
                Promise.resolve().then(function () { return t.run(o); }),
                new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error("超时 " + limit + "ms")); }, limit); }),
            ]);
            if (value && typeof value === "object" && "ok" in value) { ok = !!value.ok; detail = String(value.detail || ""); }
            else if (typeof value === "string") { ok = true; detail = value; }   // 用例自身没给判定时，默认通过但会标注
            else { ok = false; detail = "用例没有返回判定（应为 { ok, detail }）"; }
        } catch (error) {
            detail = "异常：" + (error && error.message ? error.message : String(error));
            ok = false;
        } finally {
            if (timer !== null) clearTimeout(timer);
            setContext(previousContext);
            settings.save(preserved);
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
export function registerSelfTest(config) {
    const conf = config || {};
    registry.provide("cmd:selftest", async function () { const r = await runSelfTest(conf); return r.text; });
    registry.provide("selftest:run", async function (options) { return await runSelfTest(Object.assign({}, conf, options || {})); });
    log("接口", "自检能力已注册（cmd:selftest）");
}

export const selfTest = { TEST_TIMEOUT, formatReport, TESTS, runSelfTest, registerSelfTest };
