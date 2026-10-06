import { ctx, log } from "../core/bus.js";
import { registry } from "../core/registry.js";
import { settings } from "../core/settings.js";
import { getStatsIndex, normalizeKey } from "./indexes.js";
import { imageUrl } from "./cards.js";

/** ── 统一模板（数据模块）：常量 → 纯函数 → 状态存取 → register → exports ── */

/** 1) 常量：盘面存在 chatMetadata 里（官方推荐：切换聊天自动隔离，别长期持有引用） */
export const BOARD_KEY = "ygo2_board";
export const PHASES = ["抽卡阶段", "准备阶段", "主要阶段1", "战斗阶段", "主要阶段2", "结束阶段"];
export const ZONES = ["field", "hand", "grave", "extra", "banished"];
export const SIDE_LABEL = { me: "我方", opp: "对方" };

/** 2) 纯函数（全部可断言，无 DOM / 无网络） */
export function newSide() { return { lp: 8000, field: [], hand: [], grave: [], extra: [], banished: [], normalSummonUsed: false }; }

export function newBoard() { return { me: newSide(), opp: newSide(), turn: 1, phaseIndex: 2, log: [] }; }

/** 归一到合法结构（防止旧数据/手改数据把后续逻辑带崩） */
export function normalizeBoard(raw) {
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
export function applyAction(board, action) {
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
export function boardText(board) {
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
export async function recapRows(limit, scopeOverride) {
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
export async function recapText(limit, scopeOverride) {
    const res = await recapRows(limit, scopeOverride);
    if (!res.rows.length) return "本局还没识别到卡名（扫描范围：" + (res.scale === "all" ? "最近 30 条消息" : "最近 5 条玩家消息") + "）。";
    const lines = ["📜 本局卡表 · 共 " + res.rows.length + " 种（扫描：" + (res.scale === "all" ? "最近 30 条消息" : "最近 5 条玩家消息") + "）"];
    for (const r of res.rows) lines.push("· " + r.name + "（" + r.id + "）" + (r.typeText ? " " + r.typeText : ""));
    lines.push("", "（这里只给卡名与资料，谁用过、算不算数由你判断。）");
    return lines.join("\n");
}

/** 3) 状态存取（chatMetadata + saveMetadata，官方推荐做法） */
export function getBoard() {
    const c = ctx();
    const store = c.chatMetadata && typeof c.chatMetadata === "object" ? c.chatMetadata : null;
    if (!store) return newBoard();
    return normalizeBoard(store[BOARD_KEY]);
}

export function saveBoard(board) {
    const c = ctx();
    const store = c.chatMetadata && typeof c.chatMetadata === "object" ? c.chatMetadata : null;
    if (!store) { log("盘面", "当前没有 chatMetadata，盘面只在内存里"); return false; }
    store[BOARD_KEY] = normalizeBoard(board);
    try { if (typeof c.saveMetadata === "function") Promise.resolve(c.saveMetadata()).catch(function () {}); } catch (error) { /* 保存失败不影响当下 */ }
    return true;
}

/** 常用入口：执行一个动作并保存 */
export async function boardAction(args) {
    const before = getBoard();
    const after = applyAction(before, args || {});
    saveBoard(after);
    return boardText(after);
}

/** 4) 注册能力 */
export function registerBoard() {
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

export const boardMod = { BOARD_KEY, recapRows, PHASES, ZONES, SIDE_LABEL, newSide, newBoard, normalizeBoard, applyAction, boardText, recapText, getBoard, saveBoard, boardAction, registerBoard };
