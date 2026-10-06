/**
 * 层间解耦：数据层注册能力，注入层/接口层消费。
 * 好处：拦截器可用假数据端到端测试，不依赖真实卡库。
 */
const providers = new Map();

export function provide(name, fn) {
    if (typeof fn !== "function") throw new Error("provider 必须是函数：" + name);
    providers.set(name, fn);
    return fn;
}

export function use(name) { return providers.get(name) || null; }

export async function call(name, ...args) {
    const fn = providers.get(name);
    if (!fn) throw new Error("未注册的能力：" + name);
    return await fn(...args);
}

export function has(name) { return providers.has(name); }
export function list() { return Array.from(providers.keys()); }
export function clear() { providers.clear(); }

export const registry = { provide, use, call, has, list, clear };
