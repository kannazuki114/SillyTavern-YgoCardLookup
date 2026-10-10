import { log } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { registry } from "../core/registry.js";
import { getStatsIndex, normalizeKey } from "./indexes.js";
import { findCard } from "./cards.js";
import { tributeNeeded, banlistStatus, getLimits, REGION_LABEL, STATUS_TEXT } from "./rules.js";
import { getBoard, applyAction, saveBoard, boardText, SIDE_LABEL } from "./board.js";

/** ── 统一模板（数据模块）：常量 → 纯函数 → 判定 → 上盘 → register → exports ── */

/** 1) 常量：召唤方式（与 v1 一致） */
export const SUMMON_METHODS = [
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
export const USES_NORMAL_SUMMON = ["normal", "tribute"];

/** 2) 纯函数 */
export function parseSummonMethod(text) {
    const s = String(text || "").trim();
    if (!s) return null;
    for (const m of SUMMON_METHODS) if (m.re.test(s)) return m;
    return null;
}

/** 从卡的类型文本里取事实（等级/阶级/连接值/是否调整） */
export function cardFacts(row) {
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
export async function fieldFacts(side) {
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
export async function judgeSummon(row, method, opts) {
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
export async function applySummon(row, method, judge) {
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
export async function checkSummon(args) {
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
        const region = settings.get("banlistRegion") || "cn";
        const limits = region === "none" ? null : await getLimits();
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
export function registerSummon() {
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

export const summon = { SUMMON_METHODS, USES_NORMAL_SUMMON, parseSummonMethod, cardFacts, fieldFacts, judgeSummon, applySummon, checkSummon, registerSummon };
