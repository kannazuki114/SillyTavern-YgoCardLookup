import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const round = process.argv.find(a => a.startsWith('--round='))?.split('=')[1] || 'local';
const results = [];
async function test(name, run) {
    try { await run(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, error: e.stack }); }
}
const source = (await fs.readFile(path.join(root, 'dist/index.js'), 'utf8')).replace('var __entry = __req(', 'globalThis.__testReq = __req;\nvar __entry = __req(');
const handlers = new Map(), slash = [], tools = [], prompts = new Map(), logs = [];
const host = {
    extensionSettings: {}, chat: [], chatMetadata: {}, extensionPath: '/scripts/extensions/third-party/test/',
    saveSettingsDebounced() {}, saveMetadata() {},
    setExtensionPrompt(id, text) { prompts.set(id, text); }, registerFunctionTool(t) { tools.push(t); },
    eventSource: { on(k, fn) { const list = handlers.get(k) || []; list.push(fn); handlers.set(k, list); } },
    SlashCommandParser: { addCommandObject(c) { slash.push(c); } },
    SlashCommand: { fromProps: p => p }, SlashCommandNamedArgument: { fromProps: p => p },
};
const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    setTimeout, clearTimeout, URL, AbortController, TextDecoder, TextEncoder,
    fetch: async url => {
        const s = String(url);
        const rel = s.includes('/data/') ? 'data/' + s.split('/data/')[1] : s.endsWith('/manifest.json') ? 'manifest.json' : null;
        if (rel) { try { return new Response(await fs.readFile(path.join(root, rel))); } catch {} }
        return new Response('offline test', { status: 503 });
    },
};
vm.createContext(sandbox); vm.runInContext(source, sandbox);
const req = sandbox.__testReq, bus = req('src/core/bus.js'); bus.setContext(host);
await sandbox.YgoCardLookupV2.ensureBoot();
const settings = req('src/core/settings.js').settings, registry = req('src/core/registry.js').registry;
const interceptor = req('src/inject/interceptor.js'), deck = req('src/data/deck.js'), rules = req('src/data/rules.js'), packs = req('src/data/packs.js');
const commands = req('src/api/commands.js'), detect = req('src/inject/detect.js'), body = req('src/inject/sendbody.js');
const prompt = () => prompts.get('YgoCardLookupV2') || '';
const run = sandbox.YgoCardLookupV2_Intercept;
settings.set('apiMode', 'off'); settings.set('resultPopup', false);
await test('17 slash commands, 20 tools and every required capability registered', () => {
    assert.equal(slash.length, 17); assert.equal(tools.length, 20);
    assert.deepEqual(Array.from(sandbox.YgoCardLookupV2.REQUIRED_CAPS.filter(k => !registry.has(k))), []);
});
const selftestOptions = { timeout: 2000, requiredCaps: () => sandbox.YgoCardLookupV2.REQUIRED_CAPS.filter(k => !registry.has(k)) };
const offline = await req('src/api/selftest.js').runSelfTest(selftestOptions);
await test('offline selftest: only 3 network-dependent checks fail', () => {
    assert.deepEqual(Array.from(offline.results.filter(r => !r.ok), r => r.name), ['卡包索引', '开卡包', '禁限表']);
});
await test('card query writes a prompt; unrelated message clears it', async () => {
    await run([{ is_user: true, mes: '查卡 青眼白龙' }], 0, null, 'normal'); assert.match(prompt(), /青眼白龙/);
    await run([{ is_user: true, mes: '今天天气不错' }], 0, null, 'normal'); assert.equal(prompt(), '');
});
for (const [key, value] of [['interceptEnabled', false], ['triggerMode', 'command'], ['isolateCommand', true], ['groupsDisabled', ['自动检测注入']]]) {
    await test(`setting ${key} prevents and clears injection`, async () => {
        const prev = settings.get(key);
        await run([{ is_user: true, mes: '青眼白龙' }], 0, null, 'normal'); assert.ok(prompt().length);
        settings.set(key, value); assert.equal(prompt(), '');
        await run([{ is_user: true, mes: '青眼白龙' }], 0, null, 'normal'); assert.equal(prompt(), '');
        settings.set(key, prev);
    });
}
await test('quiet generation clears prior injection', async () => {
    await run([{ is_user: true, mes: '青眼白龙' }], 0, null, 'normal');
    await run([{ is_user: true, mes: '青眼白龙' }], 0, null, 'quiet'); assert.equal(prompt(), '');
});
await test('empty filter hook cancels injection', async () => {
    sandbox.YgoCardLookupV2.hooks.filterInjection = () => '';
    await run([{ is_user: true, mes: '青眼白龙' }], 0, null, 'normal'); assert.equal(prompt(), '');
    sandbox.YgoCardLookupV2.hooks.filterInjection = null;
});
await test('isolation permits explicit slash draw', async () => {
    settings.set('isolateCommand', true);
    assert.match(await slash.find(c => c.name === 'ygodraw').callback({ count: 1 }, ''), /随机抽卡/);
    settings.set('isolateCommand', false);
});
await test('disabled group rejects command before both data and popup', async () => {
    const prior = registry.use('ui:shop'); let calls = 0; registry.provide('ui:shop', () => { calls++; });
    settings.set('groupsDisabled', ['玩法']); settings.set('resultPopup', true);
    assert.match(await commands.dispatchCommand('shop', {}, false), /停用/); assert.equal(calls, 0);
    settings.set('groupsDisabled', []); settings.set('resultPopup', false); registry.provide('ui:shop', prior);
});
await test('draw 5 honors natural language count', async () => {
    const out = await interceptor.runTrigger(detect.matchTrigger('抽卡 5'));
    assert.equal((out[0].text.match(/!\[\]\(/g) || []).length, 5);
});
host.chat = [{ is_user: true, mes: '<deck>3 青眼白龙\n3 灰流丽\n3 栗子球\n3 黑魔导</deck>' }];
await test('natural hand 3 draws 3 from the chat deck', async () => {
    const out = await interceptor.runTrigger(detect.matchTrigger('起手模拟 3')); assert.match(out[0].text, /抽 3 张/);
});
await test('natural deck trigger validates the chat deck', async () => {
    const out = await interceptor.runTrigger(detect.matchTrigger('卡组校验')); assert.match(out[0].text, /主卡组 12 张/);
});
await test('unhandled triggers preserve strictness; explicit strictness still works', async () => {
    settings.set('detectStrictness', 'strict');
    await interceptor.runTrigger({ action: 'unknown' }); assert.equal(settings.get('detectStrictness'), 'strict');
    await sandbox.YgoCardLookupV2.call('strictness', { level: 'loose' }); assert.equal(settings.get('detectStrictness'), 'loose');
    settings.set('detectStrictness', 'normal');
});
await test('detectOnce uses the full action dispatcher', async () => {
    const out = await interceptor.detectOnce('卡组校验'); assert.match(out.cards[0].text, /卡组校验/);
});
await test('Chinese, uppercase and explicit deck blocks preserve cards', () => {
    for (const s of ['<卡组>3 青眼白龙</卡组>', '<牌组>3 青眼白龙</牌组>', '<DECK x="1">3 青眼白龙</DECK>']) {
        assert.equal(deck.extractDeckBlock(s), '3 青眼白龙'); assert.equal(deck.deckFromChat([{ mes: s }]), '3 青眼白龙');
        assert.equal(deck.deckArgText({ deck: s }).text, '3 青眼白龙');
    }
    assert.equal(deck.extractDeckBlock('<decking>oops</decking>'), '');
});
await test('passcodes are not parsed as counts', () => {
    const d = deck.parseDeckText('89631139\n3 89631139\n青眼白龙 x2\n2灰流丽');
    assert.equal(d.main[0].name, '89631139'); assert.equal(d.main[0].count, 1);
    assert.equal(d.main[1].name, '89631139'); assert.equal(d.main[1].count, 3);
    assert.equal(d.main[2].count, 2); assert.equal(d.main[3].name, '灰流丽');
});
await test('passcode decks work in hand simulation and deck image', async () => {
    assert.match(await deck.handText({ deck: '3 89631139', draw: 2 }), /青眼白龙/);
    const image = await req('src/api/deckimage.js').resolveDeck('3 89631139');
    assert.equal(image.counts.main, 3); assert.equal(image.main[0].row.name, '青眼白龙');
});
await test('offline deck and banlist do not claim unrestricted or passed', async () => {
    assert.match(await registry.call('tool:deck', {}), /禁限表不可用/);
    assert.equal((await rules.banlistStatusOf('青眼白龙')).status, 'unknown');
    assert.match(await rules.banlistText('cn'), /未能获取/);
});
await test('DIY add syntax in README creates and deletes a spell', async () => {
    const diy = slash.find(c => c.name === 'ygodiy');
    await diy.callback({ name: '_regression', type: '魔法', desc: 'text' }, 'add');
    assert.equal(settings.get('diyCards').find(c => c.name === '_regression').category, '魔法');
    await diy.callback({ name: '_regression' }, 'del'); assert.equal(settings.get('diyCards').some(c => c.name === '_regression'), false);
});
await test('board movement command preserves from/to parameters', async () => {
    const cmd = slash.find(c => c.name === 'ygoduel');
    await cmd.callback({ action: 'draw', value: '青眼白龙' }, '');
    await cmd.callback({ action: 'to', value: '青眼白龙', from: 'hand', to: 'grave' }, '');
    assert.equal(req('src/data/board.js').getBoard().me.grave.at(-1).name, '青眼白龙');
});
await test('only one fallback hook is registered for generation', () => assert.equal(handlers.get('GENERATION_AFTER_COMMANDS').length, 1));
await test('generation callback awaits asynchronous hook', async () => {
    const oldLength = handlers.get('GENERATION_AFTER_COMMANDS').length; let done = false;
    await req('src/core/events.js').mountEvents({ onAfterCommands: async () => { await new Promise(r => setTimeout(r, 20)); done = true; } });
    await handlers.get('GENERATION_AFTER_COMMANDS')[oldLength]('normal'); assert.equal(done, true);
});
const originalResolver = registry.use('resolveCards');
await test('official sendbody event awaits retrieval and changes the original message', async () => {
    registry.provide('resolveCards', async () => { await new Promise(r => setTimeout(r, 20)); return [{ name: '青眼白龙', text: 'ATK 3000' }]; });
    settings.set('bodyEditMode', 'append'); const chat = [{ role: 'user', content: '青眼白龙' }];
    await handlers.get('CHAT_COMPLETION_PROMPT_READY')[0]({ chat }); assert.match(chat[0].content, /【查卡器资料】/);
    await handlers.get('CHAT_COMPLETION_PROMPT_READY')[0]({ chat }); assert.equal((chat[0].content.match(/【查卡器资料】/g) || []).length, 1);
    settings.set('isolateCommand', true); await body.handlePromptReady({ chat }); assert.equal(chat[0].content, '青眼白龙');
    settings.set('isolateCommand', false); settings.set('bodyEditMode', 'off'); registry.provide('resolveCards', originalResolver);
});
await test('dryRun body event does not mutate user content', async () => {
    settings.set('bodyEditMode', 'append'); const chat = [{ is_user: true, mes: '青眼白龙' }];
    await body.handlePromptReady({ chat, dryRun: true }); assert.equal(chat[0].mes, '青眼白龙'); settings.set('bodyEditMode', 'off');
});
await test('new message inside 5 seconds is not skipped by fallback', async () => {
    host.chat = [{ is_user: true, mes: '查卡 青眼白龙' }]; await interceptor.runFallback(); assert.match(prompt(), /青眼白龙/);
    host.chat.push({ is_user: true, mes: '查卡 黑魔导' }); await interceptor.runFallback(); assert.match(prompt(), /黑魔导/);
});
await test('parallel fallback calls share one draw, without double collection writes', async () => {
    host.chat.push({ is_user: true, mes: '抽卡 1' }); const total = settings.get('collectionTotal');
    await Promise.all([interceptor.runFallback(), interceptor.runFallback()]); assert.equal(settings.get('collectionTotal'), total + 1);
});
await test('host interceptor after fallback reuses one draw, including copied chat objects', async () => {
    host.chat.push({ is_user: true, mes: '抽卡 2' }); const total = settings.get('collectionTotal');
    await interceptor.runFallback(); await run(host.chat.map(m => ({ ...m })), 0, null, 'normal');
    assert.equal(settings.get('collectionTotal'), total + 2);
});
await test('generation ended clears memo so the next generation can rerun', async () => {
    bus.emit('generationEnded', {}); const total = settings.get('collectionTotal');
    await interceptor.runFallback(); assert.equal(settings.get('collectionTotal'), total + 2);
});
await test('slow older detection cannot overwrite a newer no-hit result', async () => {
    let release; const wait = new Promise(r => { release = r; });
    registry.provide('resolveCards', async text => text === 'slow' ? (await wait, [{ name: '青眼白龙', text: 'old' }]) : []);
    settings.set('naturalCommands', false); const old = run([{ is_user: true, mes: 'slow' }], 0, null, 'normal');
    await new Promise(r => setTimeout(r, 5)); await run([{ is_user: true, mes: 'new' }], 0, null, 'normal'); release(); await old; assert.equal(prompt(), '');
    settings.set('naturalCommands', true); registry.provide('resolveCards', originalResolver);
});
await test('chat change invalidates in-flight injection', async () => {
    let release; const wait = new Promise(r => { release = r; });
    registry.provide('resolveCards', async () => { await wait; return [{ name: '青眼白龙', text: 'old chat' }]; });
    settings.set('naturalCommands', false); const old = run([{ is_user: true, mes: 'old' }], 0, null, 'normal');
    await new Promise(r => setTimeout(r, 5)); host.chatMetadata = {}; bus.emit('chatChanged', {}); release(); await old; assert.equal(prompt(), '');
    settings.set('naturalCommands', true); registry.provide('resolveCards', originalResolver);
});
await test('resolver failure clears old prompt and does not throw', async () => {
    await run([{ is_user: true, mes: '青眼白龙' }], 0, null, 'normal');
    registry.provide('resolveCards', () => { throw new Error('test failure'); }); settings.set('naturalCommands', false);
    await run([{ is_user: true, mes: 'failure' }], 0, null, 'normal'); assert.equal(prompt(), '');
    settings.set('naturalCommands', true); registry.provide('resolveCards', originalResolver);
});
const style = new Map(); sandbox.document = { getElementById: k => style.get(k), createElement: () => ({}), head: { appendChild(el) { style.set(el.id, el); } } };
await test('card width settings substitute and clamp CSS pixel values', () => {
    settings.set('cardImgMax', 500); assert.match(style.get('ygo2-img-style').textContent, /min\(100%,500px\)/);
    settings.set('cardImgMax', 5000); assert.match(style.get('ygo2-img-style').textContent, /900px/);
    settings.set('cardImgMax', -1); assert.match(style.get('ygo2-img-style').textContent, /120px/);
}); delete sandbox.document;

// Synthetic API fixtures test successful responses, not real network availability.
const stats = await req('src/data/indexes.js').getStatsIndex();
const releases = stats.rows.slice(0, 1100).map((r, i) => ({ id: r.id, release: { sc: { date: '2026-01-01', pack: 'test-pack-' + i } } }));
releases.push(...stats.rows.slice(0, 25).map(r => ({ id: r.id, release: { sc: { date: '2026-01-01', pack: '超级包06' } } })));
const limitsFixture = { cn: { date: '2026-01-01', forbidden: { 'test-cid': 'fixture' }, limited: {}, semi_limited: {} } };
await test('release and limits recover after prior offline failures', async () => {
    packs.configure({ fetchJson: async () => releases }); rules.configure({ fetchJson: async () => limitsFixture });
    assert.ok((await packs.getPackIndex()).length > 1000); assert.equal((await rules.getLimits()).cn.forbidden.size, 1);
});
settings.set('diyCards', [{ name: '_自检临时卡', category: '魔法', desc: 'preserve me' }]);
const beforeSelftest = JSON.stringify({ collection: settings.get('collection'), total: settings.get('collectionTotal'), diy: settings.get('diyCards') });
const onlineFixture = await req('src/api/selftest.js').runSelfTest(selftestOptions);
await test('40/40 selftest passes with explicitly synthetic network fixtures', () => assert.equal(onlineFixture.pass, 40));
await test('selftest preserves collection, existing temporary-card name and context override', () => {
    assert.equal(JSON.stringify({ collection: settings.get('collection'), total: settings.get('collectionTotal'), diy: settings.get('diyCards') }), beforeSelftest);
    assert.equal(bus.contextOverride(), host);
});
await test('selftest does not pin live host context after completion', async () => {
    sandbox.SillyTavern = { getContext: () => host }; bus.setContext(null);
    await req('src/api/selftest.js').runSelfTest(selftestOptions); assert.equal(bus.contextOverride(), null);
    bus.setContext(host);
});
const noBanRow = await req('src/data/cards.js').findCard('青眼白龙');
const noBanFixture = { cn: { date: '2026-01-01', forbidden: { [noBanRow.cid]: noBanRow.name }, limited: {}, semi_limited: {} } };
let noBanFetches = 0;
rules.configure({ fetchJson: async () => { noBanFetches++; return noBanFixture; } }); rules.getLimits.reset();
settings.set('banlistRegion', 'none');
await test('unlimited mode returns card status without a limits API request', async () => {
    assert.equal(rules.banlistStatus(null, 'none', noBanRow), 'none');
    assert.equal(rules.banlistStatus(null, 'none', null), 'unknown');
    assert.equal((await rules.banlistStatusOf('青眼白龙')).status, 'none');
    assert.equal((await rules.banlistStatusOf('不存在测试卡abc')).status, 'unknown');
    assert.match(await rules.banlistText(null, '青眼白龙'), /无禁限规则/);
    assert.equal(noBanFetches, 0);
});
await test('unlimited mode keeps deck size and three-copy checks and skips forbidden cards', async () => {
    const out = await registry.call('tool:deck', { deck: '4 青眼白龙' });
    assert.match(out, /同名卡最多 3 张/); assert.match(out, /应为 40-60 张/); assert.match(out, /无禁限规则/);
    assert.doesNotMatch(out, /是禁止卡|禁限表不可用/);
    assert.deepEqual(Array.from(await deck.banlistProblems(new Map([['青眼白龙', { name: '青眼白龙', count: 3 }]]), rules.parseLimits(noBanFixture), 'none')), []);
    assert.equal(noBanFetches, 0);
});
await test('natural banlist and summon respect no-ban mode without fetching limits', async () => {
    assert.match((await rules.runAction({ action: 'banlist', arg: '青眼白龙' }))[0].text, /无禁限规则/);
    settings.set('summonAutoApply', false);
    await registry.call('tool:summon', { query: '青眼白龙', method: 'normal' });
    await rules.summonText({ query: '青眼白龙' }); assert.equal(noBanFetches, 0);
});
await test('explicit regional override checks its own table while no-ban mode is selected', async () => {
    assert.match(await rules.banlistText('cn', '青眼白龙'), /禁止卡.*官方简中/);
    assert.equal(noBanFetches, 1);
    assert.match((await deck.banlistProblems(new Map([['89631139', { name: '89631139', count: 1 }]]), await rules.getLimits(), 'cn')).join(''), /是禁止卡/);
    assert.equal((await rules.banlistStatusOf('青眼白龙')).status, 'none');
    settings.set('banlistRegion', 'cn');
    assert.match(await registry.call('tool:deck', { deck: '3 青眼白龙' }), /是禁止卡/);
});
const output = { round, mode: 'real dist + data; simulated host; offline and synthetic API fixtures', pass: results.filter(r => r.ok).length, total: results.length, offlineSelftest: { pass: offline.pass, total: offline.total }, fixtureSelftest: { pass: onlineFixture.pass, total: onlineFixture.total }, results };
await fs.writeFile(path.join(root, `tools/test-runtime-round-${round}.json`), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (output.pass !== output.total) process.exitCode = 1;
