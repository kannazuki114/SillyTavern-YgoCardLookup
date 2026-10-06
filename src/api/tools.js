import { ctx, log } from "../core/bus.js";
import { registry } from "../core/registry.js";
import { settings } from "../core/settings.js";

/**
 * 工具表：只是数据。真正的执行交给 registry（数据层注册 tool:<action>）。
 * 这样 tools.js 不需要卡库就能验证注册与派发。
 */
export const TOOLS = [
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
export function toolDefs() {
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
export function toolProblems() {
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
export const toolCalls = { total: 0, byAction: {}, lastAt: 0, lastAction: "" };

/** 参数摘要（纯函数）：太长就截断，避免日志被刷屏 */
export function summarizeArgs(args) {
    try {
        const s = JSON.stringify(args === undefined ? {} : args);
        return s.length > 80 ? s.slice(0, 80) + "…" : s;
    } catch (error) { return "（参数无法序列化）"; }
}

export async function dispatchTool(action, args) {
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
export function registerTools() {
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

export const tools = { toolCalls, summarizeArgs, TOOLS, toolDefs, toolProblems, dispatchTool, registerTools };
