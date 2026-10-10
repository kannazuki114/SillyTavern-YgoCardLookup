import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Isolated host simulation: real bundle and bundled data; no external requests.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logs = [], eventHandlers = new Map(), slash = [], functionTools = [], prompts = new Map();
const host = {
    extensionSettings: {}, chat: [], chatMetadata: {}, extensionPath: '/scripts/extensions/third-party/audit/',
    saveSettingsDebounced() {}, saveMetadata() {},
    setExtensionPrompt(id, text) { prompts.set(id, text); },
    registerFunctionTool(tool) { functionTools.push(tool); },
    eventSource: { on(key, fn) { const list = eventHandlers.get(key) || []; list.push(fn); eventHandlers.set(key, list); } },
    SlashCommandParser: { addCommandObject(cmd) { slash.push(cmd); } },
    SlashCommand: { fromProps: x => x }, SlashCommandNamedArgument: { fromProps: x => x },
};
const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    setTimeout: (...a) => { const t = setTimeout(...a); t.unref(); return t; }, clearTimeout,
    URL, AbortController, TextDecoder, TextEncoder,
    fetch: async url => {
        const s = String(url);
        const rel = s.includes('/data/') ? 'data/' + s.split('/data/')[1] : s.endsWith('/manifest.json') ? 'manifest.json' : null;
        if (rel) { try { return new Response(await fs.readFile(path.join(root, rel))); } catch {} }
        return new Response('offline audit', { status: 503 });
    },
};
vm.createContext(sandbox);
const bundle = (await fs.readFile(path.join(root, 'dist/index.js'), 'utf8')).replace('var __entry = __req(', 'globalThis.__auditReq = __req;\nvar __entry = __req(');
vm.runInContext(bundle, sandbox);
const req = sandbox.__auditReq;
req('src/core/bus.js').setContext(host);
await sandbox.YgoCardLookupV2.ensureBoot();
const settings = req('src/core/settings.js').settings;
settings.set('apiMode', 'off'); settings.set('resultPopup', false);
const selftest = await req('src/api/selftest.js').runSelfTest({ timeout: 1000, requiredCaps: () => sandbox.YgoCardLookupV2.REQUIRED_CAPS.filter(k => !req('src/core/registry.js').registry.has(k)) });
const observations = [];
const check = (name, actual) => observations.push({ name, actual });
check('boot and registrations', { slash: slash.length, functionTools: functionTools.length, events: eventHandlers.size, missing: sandbox.YgoCardLookupV2.REQUIRED_CAPS.filter(k => !req('src/core/registry.js').registry.has(k)) });
await sandbox.YgoCardLookupV2_Intercept([{ is_user: true, mes: '查卡 青眼白龙' }], 0, null, 'normal');
const first = prompts.get('YgoCardLookupV2');
await sandbox.YgoCardLookupV2_Intercept([{ is_user: true, mes: '今天天气不错' }], 0, null, 'normal');
check('stale injection after unrelated message', { initialChars: first?.length, subsequentChars: prompts.get('YgoCardLookupV2')?.length, unchanged: first === prompts.get('YgoCardLookupV2') });
const commands = req('src/api/commands.js');
settings.set('isolateCommand', true);
check('command isolation /ygodraw', await commands.dispatchCommand('draw', { count: 1 }, false));
settings.set('isolateCommand', false);
const trigger = req('src/inject/detect.js').matchTrigger('抽卡 5');
const drawn = await req('src/inject/interceptor.js').runTrigger(trigger);
check('natural draw 5', { trigger, cards: (drawn[0]?.text.match(/!\[\]\(/g) || []).length });
host.chat = [{ is_user: true, mes: '<deck>3 青眼白龙\n3 灰流丽\n3 栗子球\n3 黑魔导</deck>' }];
const hand = await req('src/inject/interceptor.js').runTrigger(req('src/inject/detect.js').matchTrigger('起手模拟 3'));
check('natural hand 3', hand[0]?.text.split('\n')[0]);
const deckTrigger = req('src/inject/detect.js').matchTrigger('卡组校验');
settings.set('detectStrictness', 'strict');
const naturalDeck = await req('src/inject/interceptor.js').runTrigger(deckTrigger);
check('natural deck validation and strictness', { trigger: deckTrigger, result: naturalDeck, strictnessAfter: settings.get('detectStrictness') });
let finished = false;
const eventsBefore = eventHandlers.get('GENERATION_AFTER_COMMANDS').length;
await req('src/core/events.js').mountEvents({ onAfterCommands: async () => { await new Promise(r => setTimeout(r, 30)); finished = true; } });
const cb = eventHandlers.get('GENERATION_AFTER_COMMANDS')[eventsBefore];
await cb('normal');
check('await generation event waits for hook', finished);
await new Promise(r => setTimeout(r, 40));
check('hook eventually finishes', finished);
const styleElements = new Map();
sandbox.document = {
    getElementById: id => styleElements.get(id), createElement: () => ({}),
    head: { appendChild(el) { styleElements.set(el.id, el); } },
};
settings.set('cardImgMax', 500);
check('image max width CSS at setting 500', styleElements.get('ygo2-img-style')?.textContent);
delete sandbox.document;
const output = { mode: 'isolated host, real dist and data, remote HTTP 503, no DOM or IndexedDB', selftest: { pass: selftest.pass, total: selftest.total, results: selftest.results }, observations };
await fs.writeFile(path.join(root, 'tools/audit-results.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
