import { ctx, log } from "../core/bus.js";
import { settings } from "../core/settings.js";
import { ownBase } from "../core/http.js";
import { registry } from "../core/registry.js";
import { escapeHtml } from "./result.js";
import { waitForElement } from "./prompt.js";
import { manageDiy, normalizeDiyCard, diyTypeText, DIY_MONSTER_FRAMES } from "../data/collection.js";

/** ── 统一模板（界面模块）：常量 → 纯函数（画卡） → 编辑器 → register → exports ── */

/** 1) 常量 */
export const EDITOR_ID = "ygo2_diy_editor";
export const CATEGORIES = ["怪兽", "魔法", "陷阱"];
export const FRAMES = DIY_MONSTER_FRAMES;
export const ATTRS = ["光", "暗", "地", "水", "炎", "风", "神"];
export const RACES = ["龙", "魔法师", "战士", "机械", "恶魔", "天使", "不死", "昆虫", "恐龙", "兽", "兽战士", "鸟兽", "植物", "水", "炎", "雷", "岩石", "念动力", "电子界", "幻龙", "幻神兽", "创造神"];
export const ARROWS = ["左上", "上", "右上", "左", "右", "左下", "下", "右下"];
export const SPELL_SUBTYPES = ["通常", "永续", "装备", "速攻", "场地", "仪式"];
export const TRAP_SUBTYPES = ["通常", "永续", "反击"];
export const ATTR_COLOR = { 光: "#e8d24a", 暗: "#7a4fa8", 地: "#8a6a3a", 水: "#3a7ac8", 炎: "#c8483a", 风: "#3aa86a", 神: "#d8a02a" };
/** 各卡种的边框配色（CSS 卡框用；真实 PNG 素材缺失时的主路径） */
export const FRAME_STYLE = {
    通常: { edge: "#c9a227", bg: "#f0e2b0" }, 效果: { edge: "#c8722a", bg: "#f6e0c0" },
    仪式: { edge: "#2f6fb0", bg: "#dbe6f4" }, 融合: { edge: "#8a5aa8", bg: "#e8dcf2" },
    同调: { edge: "#c9c9c9", bg: "#ececec" }, 超量: { edge: "#3a3a3a", bg: "#e2e2e2" },
    连接: { edge: "#2f8a8a", bg: "#d8eeee" }, 灵摆: { edge: "#b06a2a", bg: "#f2e2cc" },
    魔法: { edge: "#2f8a6a", bg: "#dbeee6" }, 陷阱: { edge: "#b04a8a", bg: "#f2dcec" },
};

/** 2) 纯函数 */
export function frameKeyOf(card) {
    const c = card || {};
    if (c.category === "魔法" || c.category === "陷阱") return c.category;
    return FRAMES.indexOf(c.frame) >= 0 ? c.frame : "效果";
}
export function frameStyleOf(card) { return FRAME_STYLE[frameKeyOf(card)] || FRAME_STYLE.效果; }

export function typeLine(card) {
    const c = card || {};
    const isSpell = c.category === "魔法", isTrap = c.category === "陷阱";
    const sub = String(c.subtype || "").trim();
    if (isSpell) return "【魔法卡" + (sub ? "／" + sub : "") + "】";
    if (isTrap) return "【陷阱卡" + (sub ? "／" + sub : "") + "】";
    const isPend = c.frame === "灵摆";
    const parts = [String(c.race || "？") + "族", isPend ? "灵摆" : "", String(c.frame || "效果")].filter(Boolean);
    return "【" + parts.join("／") + "】";
}

export function starsOf(card) {
    const c = card || {};
    if (c.frame === "连接") return "";
    if (c.frame === "超量") return "☆".repeat(Math.max(1, Math.min(13, Number(c.rank) || 4)));
    const lv = Math.max(0, Math.min(13, Number(c.level) || 0));
    return lv ? "★".repeat(lv) : "";
}

/** 纯函数：CSS 卡框（尺寸 small=150 / big=224） */
export function diyCardHtml(card, size) {
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
export const REAL_FILES = {
    通常: "card-normal.webp", 效果: "card-effect.webp", 仪式: "card-ritual.webp", 融合: "card-fusion.webp",
    同调: "card-synchro.webp", 超量: "card-xyz.webp", 连接: "card-link.webp", 灵摆: "card-effect-pendulum.webp",
    魔法: "card-spell.webp", 陷阱: "card-trap.webp",
};
export const REAL_PENDULUM = { 通常: "card-normal-pendulum.webp", 融合: "card-fusion-pendulum.webp", 仪式: "card-ritual-pendulum.webp", 同调: "card-synchro-pendulum.webp", 超量: "card-xyz-pendulum.webp" };
export const ATTR_FILES = { 光: "attribute-light.webp", 暗: "attribute-dark.webp", 地: "attribute-earth.webp", 水: "attribute-water.webp", 炎: "attribute-fire.webp", 风: "attribute-wind.webp", 神: "attribute-divine.webp" };
export const SUBTYPE_ICONS = { 永续: "icon-continuous.webp", 装备: "icon-equip.webp", 场地: "icon-field.webp", 速攻: "icon-quick-play.webp", 仪式: "icon-ritual.webp", 反击: "icon-counter.webp" };
export const ARROW_FILES = { 左上: "left-up", 上: "up", 右上: "right-up", 左: "left", 右: "right", 左下: "left-down", 下: "down", 右下: "right-down" };
export const ASSET_LIST = [
    "card-normal.webp", "card-effect.webp", "card-ritual.webp", "card-fusion.webp", "card-synchro.webp", "card-xyz.webp", "card-link.webp",
    "card-spell.webp", "card-trap.webp",
    "card-normal-pendulum.webp", "card-effect-pendulum.webp", "card-ritual-pendulum.webp", "card-fusion-pendulum.webp", "card-synchro-pendulum.webp", "card-xyz-pendulum.webp",
    "attribute-light.webp", "attribute-dark.webp", "attribute-earth.webp", "attribute-water.webp", "attribute-fire.webp", "attribute-wind.webp", "attribute-divine.webp",
    "attribute-spell.webp", "attribute-trap.webp",
    "icon-continuous.webp", "icon-equip.webp", "icon-field.webp", "icon-quick-play.webp", "icon-ritual.webp", "icon-counter.webp",
    "level.webp", "rank.webp",
].concat(Object.keys(ARROW_FILES).flatMap(function (a) { return ["arrow-" + ARROW_FILES[a] + "-on.webp", "arrow-" + ARROW_FILES[a] + "-off.webp"]; }));

/** 素材目录：优先用设置里的自定义目录，否则用本扩展自带的 assets/yugioh/ */
export function frameBase() {
    const custom = String(settings.get("diyFrameBase") || "").trim();
    if (custom) return custom.replace(/\/?$/, "/");
    return ownBase() + "assets/yugioh/";
}

/** 纯函数：真实卡框 HTML（叠字坐标与 v1 一致；加载失败由 installFrameFallback 换成 CSS 版） */
export function realFrameHtml(card, size) {
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
export function cardFaceHtml(card, size) {
    return settings.get("diyFrameMode") === "real" ? realFrameHtml(card, size) : diyCardHtml(card, size);
}

/** 卡框加载失败时把整张卡换成 CSS 版（error 不冒泡，所以用捕获阶段委托） */
let frameFallbackInstalled = false;
export function installFrameFallback() {
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
export async function checkAssets(fetchImpl) {
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
export function subtypeOptions(category, current) {
    const list = category === "魔法" ? SPELL_SUBTYPES : category === "陷阱" ? TRAP_SUBTYPES : [];
    return ['<option value="">（无）</option>'].concat(list.map(function (x) {
        return '<option value="' + x + '"' + (String(current) === x ? " selected" : "") + ">" + x + "</option>";
    })).join("");
}
function options(list, current) {
    return list.map(function (x) { return '<option value="' + x + '"' + (String(current) === x ? " selected" : "") + ">" + x + "</option>"; }).join("");
}

export function editorHtml(card) {
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
export function readDraft(root, getEl) {
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
export async function openDiyEditor(name) {
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
export function registerDiyUi() {
    registry.provide("ui:diy", async function (args) { return await openDiyEditor(args && args.name); });
    registry.provide("diyCardHtml", async function (args) { const list = settings.get("diyCards") || []; const card = list.filter(function (x) { return x.name === (args && args.name); })[0]; return card ? cardFaceHtml(card, (args && args.size) || "big") : ""; });
    registry.provide("diyCheckAssets", async function () { const r = await checkAssets(); return "素材目录：" + r.base + "\n已有 " + r.ok.length + " / " + ASSET_LIST.length + " 个文件" + (r.missing.length ? "\n缺：" + r.missing.join("  ") + "\n（缺的卡种会回退 CSS 版）" : "\n素材齐全 ✓"); });
    log("界面", "DIY 图形编辑器已注册（ui:diy）");
}

export const diyUi = { EDITOR_ID, REAL_FILES, REAL_PENDULUM, ATTR_FILES, SUBTYPE_ICONS, ARROW_FILES, ASSET_LIST, frameBase, realFrameHtml, cardFaceHtml, installFrameFallback, checkAssets, CATEGORIES, FRAMES, ATTRS, RACES, ARROWS, SPELL_SUBTYPES, TRAP_SUBTYPES, ATTR_COLOR, FRAME_STYLE, frameKeyOf, frameStyleOf, typeLine, starsOf, diyCardHtml, subtypeOptions, editorHtml, readDraft, openDiyEditor, registerDiyUi };
