/** 唯一宿主接触点：模块通过 ctx() 取酒馆上下文，不在模块顶层触碰全局。 */
let injected = null;
export function setContext(context) { injected = context; }
export function contextOverride() { return injected; }
export function ctx() {
    if (injected) return injected;
    if (typeof SillyTavern !== "undefined" && SillyTavern.getContext) return SillyTavern.getContext();
    return {};
}

const listeners = new Map();
export function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(handler);
    return function off() {
        const list = listeners.get(event) || [];
        const i = list.indexOf(handler);
        if (i >= 0) list.splice(i, 1);
    };
}
export function emit(event, payload) {
    for (const handler of listeners.get(event) || []) {
        try { handler(payload); } catch (error) { console.warn("[YGO2] 事件处理失败 " + event, error); }
    }
}

const buffer = [];
export const LOG_LIMIT = 200;
let logEnabled = true;
export function setLogEnabled(on) { logEnabled = on !== false; }
let verboseConsole = true;
/** 详细日志（面板「日志 → 输出到控制台」）：关掉只影响控制台，日志面板照常 */
export function setLogVerbose(on) { verboseConsole = on !== false; }

export function log(tag, message) {
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
export function logLines() { return buffer.slice(); }
