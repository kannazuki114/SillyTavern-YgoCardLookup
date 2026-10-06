import { settings } from "../core/settings.js";

/** 自然语言触发词表：words 命中即触发，arg 从命中词之后取。 */
/** v1 的 looksLikeCardArg（原样语义）：参数得像卡名/卡密，才让带参数的触发词成立。
 *  挡住「异画卡」「卡图好漂亮啊」这种句子里碰巧含触发词的情况（v1 第 3859-3876 行）。
 *  这里用同步的本地表判断；名字索引未就绪时只认卡密与括号。
 */
export function looksLikeCardArg(arg) {
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
export const TRIGGERS = [
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
export const HESITATION = ["要不要", "想不想", "该不该", "是不是应该", "是不是要", "我在想", "不太懂", "好漂亮", "设计得不错"];

/** 归一化：全角转半角、去装饰、去空白。 */
export function normalize(text) {
    let s = String(text === undefined || text === null ? "" : text);
    if (typeof s.normalize === "function") s = s.normalize("NFKC");
    // 触发词匹配 / 参数提取用：只去装饰与零宽字符，**保留空格**（否则「超量召唤希望皇 霍普」的参数会变成「希望皇霍普」）
    return s.replace(/[\u200b-\u200f\uFE0F]/g, "").replace(/[「」『』《》【】〖〗\[\]()（）]/g, "").trim();
}

/** 识别卡名专用：必须与 indexes.normalizeKey（卡名索引）逐字一致 —— 去掉空格与「・·」，
 *  否则含空格 / 间隔号的卡名（例如「娱乐伙伴 天空的魔术师」、以及全部英文名）永远匹配不上。 */
export function normalizeText(text) {
    return normalize(text).replace(/[・·\s]/g, "");
}

/** 触发词匹配（犹豫句式直接被拒）。 */
// 需要"卡名参数"才成立的动作（v1 对这些用 looksLikeCardArg 挡白话）
// 这些动作的参数只允许"空或数字"（避免「他起手就赢了」这类日常句误触发）
const ARG_NUMERIC_ONLY = ["hand", "draw"];
export const CARD_ARG_ACTIONS = ["art", "buy", "card", "rule", "summon"];

export function matchTrigger(text, triggers, hesitation) {
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
            // before = 触发词【前面】那段：中文常把卡名写在触发词前面（「黑魔女异画」），词后取不到参数时用它再试一次。
            return { action: rule.action, arg: wordArg, before: s.slice(0, at).trim(), raw: raw, via: "word" };
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
export function findSegments(text, nameIndex, opts) {
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
export function allowsFreeText() { return settings.get("triggerMode") === "full"; }

export const detect = { normalizeText, TRIGGERS, HESITATION, normalize, matchTrigger, findSegments, allowsFreeText };
