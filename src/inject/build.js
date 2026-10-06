import { settings } from "../core/settings.js";

/** 模块速查表：告诉 AI 什么情况用哪个能力（可用 promptSheet 覆盖）。 */
export const SHEET = [
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
export const JUDGE = [
    "【是否采用由你决定】上面这段是插件按文字匹配到的卡片资料，可能撞词（例如「学院」「城堡」「增援」这类日常词与他人卡名相近）。",
    "你有完全的自主权决定要不要用这段资料：用得着就用（数值与效果以它为准），用不着就直接丢掉。",
    "如果语境里它不是在说卡（只是场景描写、语气词、专有名词），或这段数据与当前情节无关，请直接忽略本段，不要提及卡牌、不要贴卡图。",
].join("\n");

/** 发给外部 AI 的默认说明。 */
export const EXTERNAL_INSTRUCTION = [
    "你是游戏王规则与卡库资料的整理员。用户会给你一段由查卡器插件生成的原始资料。",
    "请把它整理成简洁、准确、可直接用于写作的一段中文说明：",
    "1. 只保留与本次查询相关的卡名、类型、数值、效果要点；2. 不要编造资料里没有的数据；",
    "3. 不要输出引用标记、来源、Markdown 代码块；4. 直接给整理结果，不要寒暄、不要复述指令。",
].join("\n");


/** 取实际生效的提示词（用户自定义优先）。 */
export function sheetText() {
    const custom = String(settings.get("promptSheet") || "").trim();
    return custom || SHEET;
}
export function judgeText() {
    const custom = String(settings.get("promptJudge") || "").trim();
    return custom || JUDGE;
}
export function externalInstruction() {
    const custom = String(settings.get("apiInstruction") || "").trim();
    return custom || EXTERNAL_INSTRUCTION;
}

/** 防注入：打断伪造的块边界与前缀式指令。数据是数据，不是指令。 */
export function sanitize(text) {
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
export function buildInjection(cards, opts) {
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

export const build = { SHEET, JUDGE, EXTERNAL_INSTRUCTION, sheetText, judgeText, externalInstruction, sanitize, buildInjection };
