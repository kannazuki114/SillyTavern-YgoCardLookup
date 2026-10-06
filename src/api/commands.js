import { ctx, log } from "../core/bus.js";
import { registry } from "../core/registry.js";
import { settings, actionAllowed, actionGroup } from "../core/settings.js";

/**
 * 命令表：只是数据。执行交给 registry（cmd:<action> / ui:<action>）。
 * build(named, unnamed) 把斜杠命令参数转成执行参数（纯函数，可断言）。
 */
export const COMMANDS = [
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
export function normalizeArgs(args) {
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

export function namedProps(keys) {
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

export function commandProblems() {
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
export async function dispatchCommand(action, args, isUi) {
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
export function registerCommands() {
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

export const commands = { COMMANDS, normalizeArgs, commandProblems, dispatchCommand, registerCommands };
